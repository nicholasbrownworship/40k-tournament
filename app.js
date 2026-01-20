// app.js
import { loadState, saveState } from "./state.js";
import {
  nextRound,
  generatePairingsForRound,
  lockRound,
} from "./tournament.js";
import { renderAll } from "./render.js";

let state = loadState();

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
  saveState(state);
  renderAll(state);
}

/* ---------------- Landing Actions ---------------- */

document.getElementById("btnRecommend").onclick = () => {
  const name = document.getElementById("lEventName").value || "40K Event";
  state.name = name;
  state.meta.name = name;
  state.meta.format = "swiss";
  showApp();
};

document.getElementById("btnCustomBuild").onclick = () => {
  state.name = "Custom 40K Event";
  state.meta.name = state.name;
  state.meta.format = "custom";
  showApp();
};

/* ---------------- Players ---------------- */

document.getElementById("btnAddPlayer").onclick = () => {
  const n = newPlayerName.value.trim();
  if (!n) return;

  state.players.push({
    id: crypto.randomUUID(),
    name: n,
    faction: newPlayerFaction.value.trim(),
  });

  newPlayerName.value = "";
  newPlayerFaction.value = "";
  refresh();
};

/* ---------------- Rounds ---------------- */

document.getElementById("btnNextRound").onclick = () => {
  const r = nextRound(state);
  state.activeRoundId = r.id;
  refresh();
};

document.getElementById("btnGeneratePairings").onclick = () => {
  if (!state.activeRoundId) return;
  generatePairingsForRound(state, state.activeRoundId);
  refresh();
};

document.getElementById("btnLockRound").onclick = () => {
  if (!state.activeRoundId) return;
  lockRound(state, state.activeRoundId, true);
  refresh();
};

document.getElementById("roundSelect").onchange = e => {
  state.activeRoundId = e.target.value;
  refresh();
};

/* ---------------- Tabs ---------------- */

document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabBody").forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  };
});

/* ---------------- Boot ---------------- */

if (state.players.length > 0 || state.rounds.length > 0) {
  showApp();
} else {
  showLanding();
}
