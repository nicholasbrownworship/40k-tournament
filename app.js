// app.js
import { defaultState, loadState, saveState, STORAGE_KEY } from "./state.js";
import { nextRound, generatePairingsForRound, lockRound, setMatchResult } from "./tournament.js";
import { renderAll } from "./render.js";

let state = loadState();
let pendingRecommendation = null;

document.addEventListener("DOMContentLoaded", () => {
    initEventListeners();
    const hasData = (state.players?.length > 0 || state.rounds?.length > 0);
    hasData ? showApp() : showLanding();
});

function showLanding() { 
    document.getElementById("viewLanding").hidden = false; 
    document.getElementById("viewApp").hidden = true; 
}

function showApp() { 
    document.getElementById("viewLanding").hidden = true; 
    document.getElementById("viewApp").hidden = false; 
    refresh(); 
}

function refresh() {
    const title = document.getElementById("eventTitle");
    if (title) title.textContent = state.meta?.name || "40K Event";
    saveState(state);
    renderAll(state);
}

function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
}

function initEventListeners() {
    on("btnRecommend", () => {
        pendingRecommendation = getRecommendation();
        renderRecommendation(pendingRecommendation);
    });

    on("btnBuildRecommended", () => {
        const name = document.getElementById("lEventName")?.value || "New Event";
        const rec = pendingRecommendation || getRecommendation();
        state = defaultState();
        state.meta.name = name;
        state.meta.format = rec.format;
        state.meta.useVP = (document.getElementById("lTieBreak")?.value === "vp");
        showApp();
    });

    on("btnAddPlayer", () => {
        const nInput = document.getElementById("newPlayerName");
        const fInput = document.getElementById("newPlayerFaction");
        if (!nInput.value.trim()) return;
        state.players.push({ id: Math.random().toString(16).slice(2,10), name: nInput.value.trim(), faction: fInput.value.trim() });
        nInput.value = ""; fInput.value = "";
        refresh();
    });

    on("btnNextRound", () => {
        const round = nextRound(state);
        state.activeRoundId = round.id;
        refresh();
    });

    on("btnGeneratePairings", () => {
        if (!state.activeRoundId) return alert("Create a round first");
        generatePairingsForRound(state, state.activeRoundId);
        refresh();
    });

    // Added: Update view when round dropdown changes
    const roundSelect = document.getElementById("roundSelect");
    if (roundSelect) {
        roundSelect.addEventListener("change", (e) => {
            state.activeRoundId = e.target.value;
            refresh();
        });
    }

    on("btnSaveResults", () => {
        const container = document.getElementById("pairings");
        const rows = container.querySelectorAll(".pairingRow");
        rows.forEach(row => {
            const mid = row.dataset.matchId;
            const outcome = row.querySelector('[data-field="outcome"]')?.value;
            const aVP = parseInt(row.querySelector('[data-field="aVP"]')?.value || 0);
            const bVP = parseInt(row.querySelector('[data-field="bVP"]')?.value || 0);
            setMatchResult(state, state.activeRoundId, mid, outcome, aVP, bVP);
        });
        refresh();
        alert("Scores Locked in.");
    });

    on("btnReset", () => {
        if (!confirm("Wipe everything?")) return;
        localStorage.removeItem(STORAGE_KEY);
        state = defaultState();
        location.reload();
    });

    // Tabs Logic
    document.querySelectorAll(".tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab, .tabBody").forEach(el => el.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        });
    });
}

function getRecommendation() {
    const p = parseInt(document.getElementById("lPlayers").value) || 8;
    return { format: "swiss", roundsTotal: Math.ceil(Math.log2(p)), reason: "Standard Swiss" };
}

function renderRecommendation(rec) {
    const box = document.getElementById("recommendBox");
    document.getElementById("recommendText").innerHTML = `Format: ${rec.format} | Rounds: ${rec.roundsTotal}`;
    box.hidden = false;
}
