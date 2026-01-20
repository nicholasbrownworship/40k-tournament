// app.js
import { defaultState, loadState, saveState, migrateState, STORAGE_KEY } from "./state.js";
import { nextRound, generatePairingsForRound, lockRound } from "./tournament.js";
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
  // Keep title synced
  const title = document.getElementById("eventTitle");
  if (title) title.textContent = state.meta?.name || state.name || "Event";

  saveState(state);
  renderAll(state);
}

/* ---------------- Topbar: Home / Export / Import / Wipe ---------------- */

const btnGoHome = document.getElementById("btnGoHome");
const btnExport = document.getElementById("btnExport");
const btnWipe = document.getElementById("btnWipe");
const fileImport = document.getElementById("fileImport");

if (btnGoHome) {
  btnGoHome.onclick = () => showLanding();
}

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

      // If the imported state has anything in it, go to app view
      const hasData = (state.players?.length || 0) > 0 || (state.rounds?.length || 0) > 0 || !!(state.meta?.name);
      if (hasData) showApp();
      else showLanding();

      refresh();
    } catch (err) {
      alert("Import failed: that file wasn’t valid JSON for this app.");
      console.error(err);
    } finally {
      // allow importing same file again
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
    showLanding();
  };
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
  const name = (document.getElementById("lEventName").value || "").trim() || "Custom 40K Event";
  state.name = name;
  state.meta.name = name;
  state.meta.format = "custom";
  showApp();
};

/* ---------------- Players ---------------- */

document.getElementById("btnAddPlayer").onclick = () => {
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

document.getElementById("roundSelect").onchange = (e) => {
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

const hasData =
  (state.players?.length || 0) > 0 ||
  (state.rounds?.length || 0) > 0 ||
  !!(state.meta?.name || state.name);

if (hasData) showApp();
else showLanding();
