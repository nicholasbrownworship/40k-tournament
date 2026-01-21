// app.js (diagnostic-safe + delete round)
import { defaultState, loadState, saveState, migrateState, STORAGE_KEY } from "./state.js";
import { nextRound, generatePairingsForRound, lockRound, setMatchResult } from "./tournament.js";
import { renderAll } from "./render.js";

let state = loadState();
let pendingRecommendation = null;

const banner = document.getElementById("bootBanner");
function setBanner(msg) { if (banner) banner.innerHTML = msg; }

// Catch runtime errors and show them on screen
window.addEventListener("error", (e) => {
  setBanner(`<strong style="color:#ff6b6b;">App error:</strong> ${escapeHtml(e.message)}<br><span style="opacity:.8;">Check Console for details.</span>`);
});
window.addEventListener("unhandledrejection", (e) => {
  setBanner(`<strong style="color:#ff6b6b;">Promise error:</strong> ${escapeHtml(String(e.reason))}<br><span style="opacity:.8;">Check Console for details.</span>`);
});

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>\"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

/* ---------------- Views ---------------- */
const landing = document.getElementById("viewLanding");
const app = document.getElementById("viewApp");
function showLanding() { landing.hidden = false; app.hidden = true; }
function showApp() { landing.hidden = true; app.hidden = false; refresh(); }

function refresh() {
  const title = document.getElementById("eventTitle");
  if (title) title.textContent = state.meta?.name || state.name || "Event";
  saveState(state);
  renderAll(state);
}

/* ---------------- Recommendation ---------------- */
function clampInt(v, d=0){ const n = parseInt(v,10); return Number.isFinite(n) ? n : d; }

function computeMaxRounds(hours, roundMin, breakMin){
  const total = clampInt(hours,4) * 60;
  const per = clampInt(roundMin,180) + clampInt(breakMin,10);
  const usable = Math.max(0, total - 15);
  return Math.max(1, Math.floor(usable / Math.max(1, per)));
}

function recommendFormat(players, hours, roundMin, breakMin){
  const P = Math.max(2, clampInt(players, 6));
  const Rmax = computeMaxRounds(hours, roundMin, breakMin);

  const rrRounds = Math.max(1, P - 1);
  const rrFits = rrRounds <= Rmax;
  if (rrFits) {
    return {
      format: "round_robin",
      roundsSwiss: 0,
      cutSize: 0,
      roundsTotal: rrRounds,
      maxRounds: Rmax,
      reason: `Round Robin fits: ${rrRounds} round(s) for ${P} players.`,
      notes: "Most fair: everyone plays everyone."
    };
  }

  if (Rmax >= 4) {
    const swiss = Math.max(3, Math.min(4, Rmax - 1));
    return {
      format: "swiss_cut",
      roundsSwiss: swiss,
      cutSize: 2,
      roundsTotal: swiss + 1,
      maxRounds: Rmax,
      reason: `Swiss + Final fits: ${swiss} Swiss round(s) + 1 final.`,
      notes: "Adds a clean championship match without blowing up the schedule."
    };
  }

  const swissRounds = Math.min(Rmax, Math.max(3, Math.ceil(Math.log2(Math.max(2, P)))));
  return {
    format: "swiss",
    roundsSwiss: swissRounds,
    cutSize: 0,
    roundsTotal: swissRounds,
    maxRounds: Rmax,
    reason: `Swiss fits: ${swissRounds} round(s) within your time cap (${Rmax} max).`,
    notes: "Fast, store-friendly. Everyone plays the same number of games."
  };
}

function applyScoringPreset(preset){
  if (preset === "3-1-0") return { win:3, draw:1, loss:0 };
  if (preset === "2-1-0") return { win:2, draw:1, loss:0 };
  return null;
}

function renderRecommendation(rec){
  const box = document.getElementById("recommendBox");
  const text = document.getElementById("recommendText");
  if (!box || !text) return;

  const fmtLabel =
    rec.format === "swiss" ? "Swiss" :
    rec.format === "swiss_cut" ? "Swiss + Final (Top 2)" :
    rec.format === "round_robin" ? "Round Robin" : "Custom";

  const lines = [
    `<strong>Format:</strong> ${fmtLabel}`,
    `<strong>Rounds:</strong> ${rec.roundsTotal} (max possible: ${rec.maxRounds})`,
    rec.format === "swiss_cut" ? `<strong>Structure:</strong> ${rec.roundsSwiss} Swiss + 1 Final` : "",
    `<strong>Why:</strong> ${rec.reason}`,
    `<strong>Notes:</strong> ${rec.notes}`
  ].filter(Boolean);

  text.innerHTML = lines.join("<br>");
  box.hidden = false;
}

function clearRecommendationUI(){
  pendingRecommendation = null;
  const box = document.getElementById("recommendBox");
  if (box) box.hidden = true;
}

/* ---------------- Utilities ---------------- */
function on(id, fn){
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
}

function hasAnyResults(round){
  // counts any scored outcome besides NONE; BYE is considered "result" too
  return (round?.pairings || []).some(m => {
    const o = (m?.result?.outcome || "NONE").toUpperCase();
    return o !== "NONE";
  });
}

function deleteRoundById(roundId){
  const idx = state.rounds.findIndex(r => r.id === roundId);
  if (idx === -1) return false;

  // remove it
  state.rounds.splice(idx, 1);

  // if active was deleted, choose a sensible new active
  if (state.activeRoundId === roundId) {
    const newActive = state.rounds[idx - 1] || state.rounds[idx] || null;
    state.activeRoundId = newActive ? newActive.id : null;
  }

  return true;
}

/* ---------------- Top actions ---------------- */
on("btnGoHome", () => showLanding());

on("btnExport", () => {
  const safe = migrateState(state);
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  const name = (safe.meta?.name || safe.name || "40k-event").trim().replace(/[^\w\-]+/g, "_");
  a.href = url;
  a.download = `${name}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

const fileImport = document.getElementById("fileImport");
if (fileImport) {
  fileImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      state = migrateState(JSON.parse(text));
      clearRecommendationUI();
      ((state.players?.length || 0) > 0 || (state.rounds?.length || 0) > 0 || !!(state.meta?.name || state.name))
        ? showApp()
        : showLanding();
      refresh();
    } catch (err) {
      setBanner(`<strong style="color:#ff6b6b;">Import failed:</strong> ${escapeHtml(err.message || String(err))}`);
      console.error(err);
    } finally {
      fileImport.value = "";
    }
  });
}

on("btnWipe", () => {
  if (!confirm("Wipe local data? This deletes the saved event from this browser.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  saveState(state);
  clearRecommendationUI();
  showLanding();
});

/* ---------------- Landing ---------------- */
on("btnRecommend", () => {
  const rec = recommendFormat(
    document.getElementById("lPlayers")?.value,
    document.getElementById("lHours")?.value,
    document.getElementById("lRoundMin")?.value,
    document.getElementById("lBreakMin")?.value
  );
  pendingRecommendation = rec;
  renderRecommendation(rec);
});

on("btnClearRecommendation", () => clearRecommendationUI());

on("btnBuildRecommended", () => {
  const name = (document.getElementById("lEventName")?.value || "").trim() || "40K Event";
  const scoringPreset = document.getElementById("lScoringPreset")?.value || "3-1-0";
  const tieBreak = document.getElementById("lTieBreak")?.value || "vp";
  const scoring = applyScoringPreset(scoringPreset);

  const rec = pendingRecommendation || recommendFormat(
    document.getElementById("lPlayers")?.value,
    document.getElementById("lHours")?.value,
    document.getElementById("lRoundMin")?.value,
    document.getElementById("lBreakMin")?.value
  );

  state = defaultState();
  state.name = name;
  state.meta.name = name;
  state.meta.date = new Date().toISOString().slice(0, 10);

  state.meta.format = rec.format;
  state.meta.roundsPlanned = rec.format === "round_robin" ? rec.roundsTotal : (rec.roundsSwiss || rec.roundsTotal);
  state.meta.cutSize = rec.cutSize || 0;
  state.meta.useVP = (tieBreak === "vp");
  if (scoring) state.meta.scoring = scoring;

  clearRecommendationUI();
  showApp();
});

on("btnCustomBuild", () => {
  const name = (document.getElementById("lEventName")?.value || "").trim() || "Custom 40K Event";
  const scoringPreset = document.getElementById("lScoringPreset")?.value || "3-1-0";
  const tieBreak = document.getElementById("lTieBreak")?.value || "vp";
  const scoring = applyScoringPreset(scoringPreset);

  state = defaultState();
  state.name = name;
  state.meta.name = name;
  state.meta.format = "custom";
  state.meta.useVP = (tieBreak === "vp");
  if (scoring) state.meta.scoring = scoring;

  clearRecommendationUI();
  showApp();
});

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabBody").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById("tab-" + btn.dataset.tab);
    if (target) target.classList.add("active");
  };
});

/* ---------------- Players ---------------- */
on("btnAddPlayer", () => {
  const n = (document.getElementById("newPlayerName")?.value || "").trim();
  if (!n) return;
  const f = (document.getElementById("newPlayerFaction")?.value || "").trim();
  state.players.push({ id: crypto.randomUUID(), name: n, faction: f });
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerFaction").value = "";
  refresh();
});

/* ---------------- Rounds ---------------- */
on("btnNextRound", () => {
  const r = nextRound(state);
  state.activeRoundId = r.id;
  refresh();
});

on("btnGeneratePairings", () => {
  if (!state.activeRoundId) return;
  generatePairingsForRound(state, state.activeRoundId);
  refresh();
});

on("btnLockRound", () => {
  if (!state.activeRoundId) return;
  lockRound(state, state.activeRoundId, true);
  refresh();
});

const roundSelect = document.getElementById("roundSelect");
if (roundSelect) {
  roundSelect.onchange = (e) => {
    state.activeRoundId = e.target.value;
    refresh();
  };
}

/* ---------------- Delete Round ---------------- */
on("btnDeleteRound", () => {
  if (!state.activeRoundId) {
    alert("No round selected to delete.");
    return;
  }

  const round = state.rounds.find(r => r.id === state.activeRoundId);
  if (!round) return;

  const label = round.label || "this round";
  const hasResults = hasAnyResults(round);

  if (round.locked) {
    const ok = confirm(`"${label}" is LOCKED. Delete it anyway? This cannot be undone.`);
    if (!ok) return;
  } else if (hasResults) {
    const ok = confirm(`"${label}" has results entered. Delete it anyway? This will change standings.`);
    if (!ok) return;
  } else {
    const ok = confirm(`Delete "${label}"?`);
    if (!ok) return;
  }

  deleteRoundById(round.id);
  refresh();
});

/* ---------------- Save Results ---------------- */
on("btnSaveResults", () => {
  if (!state.activeRoundId) return;
  const round = state.rounds.find(r => r.id === state.activeRoundId);
  if (!round) return;
  if (round.locked) return alert("That round is locked.");

  const rows = Array.from(document.querySelectorAll("#pairings .pairingRow"));
  for (const row of rows) {
    const matchId = row.dataset.matchId;
    if (!matchId) continue;

    const outcome = row.querySelector('[data-field="outcome"]')?.value || "NONE";
    const aVP = parseInt(row.querySelector('[data-field="aVP"]')?.value || "0", 10);
    const bVP = parseInt(row.querySelector('[data-field="bVP"]')?.value || "0", 10);

    setMatchResult(state, state.activeRoundId, matchId, outcome, aVP, bVP);
  }
  refresh();
});

/* ---------------- Boot ---------------- */
setBanner(`<strong style="color:#2bd4a6;">JS Loaded.</strong>`);
const hasData =
  (state.players?.length || 0) > 0 ||
  (state.rounds?.length || 0) > 0 ||
  !!(state.meta?.name || state.name);

hasData ? showApp() : showLanding();
