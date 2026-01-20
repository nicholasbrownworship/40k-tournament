// app.js
import { defaultState, loadState, saveState, migrateState, STORAGE_KEY } from "./state.js";
import {
  nextRound,
  generatePairingsForRound,
  lockRound,
  setMatchResult
} from "./tournament.js";
import { renderAll } from "./render.js";

let state = loadState();

// Holds the current landing-page recommendation until the user clicks “Build This Event”
let pendingRecommendation = null;

/* ---------------- Views ---------------- */

const landing = document.getElementById("viewLanding");
const app = document.getElementById("viewApp");

function showLanding() {
  landing.hidden = false;
  app.hidden = true;
}

function showApp() {
  landing.hidden = true;
  app.hidden = false;
  refresh();
}

/* ---------------- Refresh ---------------- */

function refresh() {
  const title = document.getElementById("eventTitle");
  if (title) title.textContent = state.meta?.name || state.name || "Event";

  saveState(state);
  renderAll(state);
}

/* ---------------- Landing recommendation logic ---------------- */

function clampInt(v, d = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function computeMaxRounds(hours, roundMin, breakMin) {
  const total = clampInt(hours, 4) * 60;
  const perRound = clampInt(roundMin, 180) + clampInt(breakMin, 10);
  const usable = Math.max(0, total - 15); // buffer
  return Math.max(1, Math.floor(usable / Math.max(1, perRound)));
}

// returns { format, roundsSwiss, cutSize, roundsTotal, maxRounds, reason, notes }
function recommendFormat(players, hours, roundMin, breakMin) {
  const P = Math.max(2, clampInt(players, 6));
  const Rmax = computeMaxRounds(hours, roundMin, breakMin);

  // Round Robin
  const rrRounds = Math.max(1, P - 1);
  const rrFits = rrRounds <= Rmax;
  const rrCandidate = rrFits ? {
    format: "round_robin",
    roundsSwiss: 0,
    cutSize: 0,
    roundsTotal: rrRounds,
    maxRounds: Rmax,
    reason: `Round Robin fits: ${rrRounds} round(s) for ${P} players.`,
    notes: "Most fair: everyone plays everyone."
  } : null;

  // Swiss baseline
  const swissRounds = Math.min(Rmax, Math.max(3, Math.ceil(Math.log2(Math.max(2, P)))));
  const swissCandidate = {
    format: "swiss",
    roundsSwiss: swissRounds,   // ✅ FIXED (was broken before)
    cutSize: 0,
    roundsTotal: swissRounds,
    maxRounds: Rmax,
    reason: `Swiss fits: ${swissRounds} round(s) within your time cap (${Rmax} max).`,
    notes: "Fast, store-friendly. Everyone plays the same number of games."
  };

  // Swiss + Final if you have time for 1 extra
  let swissCutCandidate = null;
  if (Rmax >= 4) {
    const swiss = Math.max(3, Math.min(4, Rmax - 1));
    swissCutCandidate = {
      format: "swiss_cut",
      roundsSwiss: swiss,
      cutSize: 2,
      roundsTotal: swiss + 1,
      maxRounds: Rmax,
      reason: `Swiss + Final fits: ${swiss} Swiss round(s) + 1 final.`,
      notes: "Adds a clean championship match without blowing up the schedule."
    };
  }

  // Priority: RR if it fits, else Swiss+Final if it fits, else Swiss
  if (rrCandidate) return rrCandidate;
  if (swissCutCandidate) return swissCutCandidate;
  return swissCandidate;
}

function applyScoringPreset(preset) {
  if (preset === "3-1-0") return { win: 3, draw: 1, loss: 0 };
  if (preset === "2-1-0") return { win: 2, draw: 1, loss: 0 };
  return null;
}

function renderRecommendation(rec) {
  const box = document.getElementById("recommendBox");
  const text = document.getElementById("recommendText");
  if (!box || !text) return;

  const fmtLabel =
    rec.format === "swiss" ? "Swiss" :
    rec.format === "swiss_cut" ? "Swiss + Final (Top 2)" :
    rec.format === "round_robin" ? "Round Robin" :
    "Custom";

  const lines = [
    `<strong>Format:</strong> ${fmtLabel}`,
    `<strong>Rounds:</strong> ${rec.roundsTotal} (max possible: ${rec.maxRounds})`,
  ];

  if (rec.format === "swiss_cut") {
    lines.push(`<strong>Structure:</strong> ${rec.roundsSwiss} Swiss + 1 Final`);
  }

  lines.push(`<strong>Why:</strong> ${rec.reason}`);
  lines.push(`<strong>Notes:</strong> ${rec.notes}`);

  text.innerHTML = lines.join("<br>");
  box.hidden = false;
}

function clearRecommendationUI() {
  pendingRecommendation = null;
  const box = document.getElementById("recommendBox");
  if (box) box.hidden = true;
}

/* ---------------- Topbar actions ---------------- */

const btnGoHome = document.getElementById("btnGoHome");
const btnExport = document.getElementById("btnExport");
const btnWipe = document.getElementById("btnWipe");
const fileImport = document.getElementById("fileImport");

if (btnGoHome) btnGoHome.onclick = () => showLanding();

if (btnExport) {
  btnExport.onclick = () => {
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
  };
}

if (fileImport) {
  fileImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      state = migrateState(parsed);

      clearRecommendationUI();

      const hasData =
        (state.players?.length || 0) > 0 ||
        (state.rounds?.length || 0) > 0 ||
        !!(state.meta?.name || state.name);

      if (hasData) showApp();
      else showLanding();

      refresh();
    } catch (err) {
      alert("Import failed: that file wasn’t valid JSON for this app.");
      console.error(err);
    } finally {
      fileImport.value = "";
    }
  });
}

if (btnWipe) {
  btnWipe.onclick = () => {
    const ok = confirm("Wipe local data? This deletes the saved event from this browser.");
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState(state);

    clearRecommendationUI();
    showLanding();
  };
}

/* ---------------- Landing actions ---------------- */

const btnRecommend = document.getElementById("btnRecommend");
const btnClearRecommendation = document.getElementById("btnClearRecommendation");
const btnBuildRecommended = document.getElementById("btnBuildRecommended");
const btnCustomBuild = document.getElementById("btnCustomBuild");

if (btnRecommend) {
  btnRecommend.onclick = () => {
    const rec = recommendFormat(
      document.getElementById("lPlayers").value,
      document.getElementById("lHours").value,
      document.getElementById("lRoundMin").value,
      document.getElementById("lBreakMin").value
    );
    pendingRecommendation = rec;
    renderRecommendation(rec);
  };
}

if (btnClearRecommendation) {
  btnClearRecommendation.onclick = () => clearRecommendationUI();
}

if (btnBuildRecommended) {
  btnBuildRecommended.onclick = () => {
    const name = (document.getElementById("lEventName").value || "").trim() || "40K Event";
    const scoringPreset = document.getElementById("lScoringPreset").value;
    const tieBreak = document.getElementById("lTieBreak").value;
    const scoring = applyScoringPreset(scoringPreset);

    const rec = pendingRecommendation || recommendFormat(
      document.getElementById("lPlayers").value,
      document.getElementById("lHours").value,
      document.getElementById("lRoundMin").value,
      document.getElementById("lBreakMin").value
    );

    state = defaultState();
    state.name = name;
    state.meta.name = name;
    state.meta.date = new Date().toISOString().slice(0, 10);

    state.meta.format = rec.format;
    state.meta.roundsPlanned = rec.format === "round_robin"
      ? rec.roundsTotal
      : (rec.roundsSwiss || rec.roundsTotal);

    state.meta.cutSize = rec.cutSize || 0;
    state.meta.useVP = (tieBreak === "vp");
    if (scoring) state.meta.scoring = scoring;

    clearRecommendationUI();
    showApp();
  };
}

if (btnCustomBuild) {
  btnCustomBuild.onclick = () => {
    const name = (document.getElementById("lEventName").value || "").trim() || "Custom 40K Event";
    const scoringPreset = document.getElementById("lScoringPreset").value;
    const tieBreak = document.getElementById("lTieBreak").value;
    const scoring = applyScoringPreset(scoringPreset);

    state = defaultState();
    state.name = name;
    state.meta.name = name;
    state.meta.format = "custom";
    state.meta.useVP = (tieBreak === "vp");
    if (scoring) state.meta.scoring = scoring;

    clearRecommendationUI();
    showApp();
  };
}

/* ---------------- Tabs ---------------- */

document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabBody").forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  };
});

/* ---------------- Players ---------------- */

const btnAddPlayer = document.getElementById("btnAddPlayer");
if (btnAddPlayer) {
  btnAddPlayer.onclick = () => {
    const newPlayerName = document.getElementById("newPlayerName");
    const newPlayerFaction = document.getElementById("newPlayerFaction");
    const n = (newPlayerName.value || "").trim();
    if (!n) return;

    state.players.push({
      id: crypto.randomUUID(),
      name: n,
      faction: (newPlayerFaction.value || "").trim(),
    });

    newPlayerName.value = "";
    newPlayerFaction.value = "";
    refresh();
  };
}

/* ---------------- Rounds ---------------- */

const btnNextRound = document.getElementById("btnNextRound");
const btnGeneratePairings = document.getElementById("btnGeneratePairings");
const btnLockRound = document.getElementById("btnLockRound");
const roundSelect = document.getElementById("roundSelect");

if (btnNextRound) {
  btnNextRound.onclick = () => {
    const r = nextRound(state);
    state.activeRoundId = r.id;
    refresh();
  };
}

if (btnGeneratePairings) {
  btnGeneratePairings.onclick = () => {
    if (!state.activeRoundId) return;
    generatePairingsForRound(state, state.activeRoundId);
    refresh();
  };
}

if (btnLockRound) {
  btnLockRound.onclick = () => {
    if (!state.activeRoundId) return;

    const round = state.rounds.find(r => r.id === state.activeRoundId);
    if (!round) return;

    const unfinished = (round.pairings || []).some(m => {
      if (m.bId === null) return false;
      const o = (m.result?.outcome || "NONE").toUpperCase();
      return o === "NONE";
    });

    if (unfinished) {
      const ok = confirm("Some matches are still marked as NONE. Lock anyway?");
      if (!ok) return;
    }

    lockRound(state, state.activeRoundId, true);
    refresh();
  };
}

if (roundSelect) {
  roundSelect.onchange = (e) => {
    state.activeRoundId = e.target.value;
    refresh();
  };
}

/* ---------------- Save Results ---------------- */

const btnSaveResults = document.getElementById("btnSaveResults");
if (btnSaveResults) {
  btnSaveResults.onclick = () => {
    if (!state.activeRoundId) return;

    const round = state.rounds.find(r => r.id === state.activeRoundId);
    if (!round) return;

    if (round.locked) {
      alert("That round is locked. Unlocking is not implemented yet.");
      return;
    }

    const rows = Array.from(document.querySelectorAll("#pairings .pairingRow"));
    for (const row of rows) {
      const matchId = row.dataset.matchId;
      if (!matchId) continue;

      const outcomeSel = row.querySelector('[data-field="outcome"]');
      const aVPInput = row.querySelector('[data-field="aVP"]');
      const bVPInput = row.querySelector('[data-field="bVP"]');

      const outcome = outcomeSel ? outcomeSel.value : "NONE";
      const aVP = aVPInput ? parseInt(aVPInput.value || "0", 10) : 0;
      const bVP = bVPInput ? parseInt(bVPInput.value || "0", 10) : 0;

      setMatchResult(state, state.activeRoundId, matchId, outcome, aVP, bVP);
    }

    refresh();
  };
}

/* ---------------- Boot ---------------- */

const hasData =
  (state.players?.length || 0) > 0 ||
  (state.rounds?.length || 0) > 0 ||
  !!(state.meta?.name || state.name);

if (hasData) showApp();
else showLanding();
