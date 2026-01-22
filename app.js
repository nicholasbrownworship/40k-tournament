// app.js
import { defaultState, loadState, saveState, migrateState, STORAGE_KEY } from "./state.js";
import { nextRound, generatePairingsForRound, lockRound, setMatchResult } from "./tournament.js";
import { renderAll } from "./render.js";

let state = loadState();
let pendingRecommendation = null;

const banner = document.getElementById("bootBanner");
function setBanner(msg) { if (banner) banner.innerHTML = msg; }

/* ---------------- Error Handling ---------------- */
window.addEventListener("error", (e) => {
  setBanner(`<strong style="color:#ff6b6b;">App error:</strong> ${escapeHtml(e.message)}`);
});

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>\"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

/* ---------------- View Management ---------------- */
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

function refresh() {
  const title = document.getElementById("eventTitle");
  if (title) title.textContent = state.meta?.name || state.name || "40K Event";
  saveState(state);
  renderAll(state);
}

/* ---------------- Event Listeners ---------------- */
function on(id, fn){
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
}

// Global "Reset" - Clears everything and goes back to start
on("btnReset", () => {
  if (!confirm("Are you sure? This will delete ALL players, rounds, and results.")) return;
  
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  saveState(state);
  
  // Reset UI state
  clearRecommendationUI();
  showLanding();
  refresh();
});

// "Wipe" (Old btnWipe logic, now maps to Reset for consistency)
on("btnWipe", () => document.getElementById("btnReset").click());

on("btnGoHome", () => showLanding());

/* ---------------- Tournament Setup ---------------- */

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

on("btnBuildRecommended", () => {
  const name = (document.getElementById("lEventName")?.value || "").trim() || "40K Event";
  const scoringPreset = document.getElementById("lScoringPreset")?.value || "3-1-0";
  const tieBreak = document.getElementById("lTieBreak")?.value || "vp";
  
  const rec = pendingRecommendation || recommendFormat(
    document.getElementById("lPlayers")?.value, 10, 150, 10
  );

  state = defaultState();
  state.meta.name = name;
  state.meta.format = rec.format;
  state.meta.useVP = (tieBreak === "vp");
  
  if (scoringPreset === "3-1-0") state.meta.scoring = { win: 3, draw: 1, loss: 0 };
  else state.meta.scoring = { win: 2, draw: 1, loss: 0 };

  showApp();
});

/* ---------------- Player Management ---------------- */

on("btnAddPlayer", () => {
  const nameInput = document.getElementById("newPlayerName");
  const factionInput = document.getElementById("newPlayerFaction");
  
  const n = (nameInput?.value || "").trim();
  if (!n) return;
  
  state.players.push({ 
    id: Math.random().toString(16).slice(2), 
    name: n, 
    faction: (factionInput?.value || "").trim() 
  });
  
  nameInput.value = "";
  factionInput.value = "";
  refresh();
});

/* ---------------- Round & Pairing Management ---------------- */

on("btnNextRound", () => {
  nextRound(state);
  refresh();
});

on("btnGeneratePairings", () => {
  if (!state.activeRoundId) return;
  generatePairingsForRound(state, state.activeRoundId);
  refresh();
});

on("btnSaveResults", () => {
  if (!state.activeRoundId) return;
  
  const round = state.rounds.find(r => r.id === state.activeRoundId);
  if (!round || round.locked) return;

  // Search for rows within the pairings container
  const container = document.getElementById("pairingsTable") || document.getElementById("pairings");
  const rows = Array.from(container.querySelectorAll(".pairingRow"));

  rows.forEach(row => {
    const matchId = row.dataset.matchId;
    const outcome = row.querySelector('[data-field="outcome"]')?.value || "NONE";
    const aVP = parseInt(row.querySelector('[data-field="aVP"]')?.value || "0");
    const bVP = parseInt(row.querySelector('[data-field="bVP"]')?.value || "0");

    setMatchResult(state, state.activeRoundId, matchId, outcome, aVP, bVP);
  });

  refresh();
  alert("Results saved and Standings updated!");
});

on("btnLockRound", () => {
  if (!state.activeRoundId) return;
  lockRound(state, state.activeRoundId, true);
  refresh();
});

/* ---------------- Export/Import ---------------- */

on("btnExport", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tournament_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

/* ---------------- Initialization ---------------- */

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabBody").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById("tab-" + btn.dataset.tab);
    if (target) target.classList.add("active");
  };
});

// Round Selector dropdown
const roundSelect = document.getElementById("roundSelect");
if (roundSelect) {
  roundSelect.onchange = (e) => {
    state.activeRoundId = e.target.value;
    refresh();
  };
}

// Initial Boot
setBanner(`<strong style="color:#2bd4a6;">System Ready.</strong>`);
if (state.players.length > 0 || state.rounds.length > 0) {
  showApp();
} else {
  showLanding();
}

/* --- (Helper functions for Recommendation and Scoring kept from your original) --- */
function recommendFormat(p, h, r, b) {
  const Rmax = Math.floor((clampInt(h,4)*60) / (clampInt(r,180) + clampInt(b,10)));
  return { format: "swiss", roundsTotal: Rmax, reason: "Time optimized", notes: "Standard Swiss" };
}
function clampInt(v, d=0){ const n = parseInt(v,10); return Number.isFinite(n) ? n : d; }
function clearRecommendationUI() { 
  pendingRecommendation = null; 
  if(document.getElementById("recommendBox")) document.getElementById("recommendBox").hidden = true; 
}
