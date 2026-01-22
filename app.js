// app.js
import { defaultState, loadState, saveState, STORAGE_KEY } from "./state.js";
import { nextRound, generatePairingsForRound, lockRound, setMatchResult } from "./tournament.js";
import { renderAll } from "./render.js";

// Global State
let state = loadState();
let pendingRecommendation = null;

/* ---------------- Initialization ---------------- */

// Wrap EVERYTHING in this listener to ensure HTML is ready
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded and parsed. Initializing listeners...");
    initEventListeners();
    
    // Check if we should start in the App or Landing view
    const hasData = (state.players?.length > 0 || state.rounds?.length > 0);
    if (hasData) {
        showApp();
    } else {
        showLanding();
    }
});

/* ---------------- View Management ---------------- */

function showLanding() { 
    const vLanding = document.getElementById("viewLanding");
    const vApp = document.getElementById("viewApp");
    if (vLanding) vLanding.hidden = false; 
    if (vApp) vApp.hidden = true; 
}

function showApp() { 
    const vLanding = document.getElementById("viewLanding");
    const vApp = document.getElementById("viewApp");
    if (vLanding) vLanding.hidden = true; 
    if (vApp) vApp.hidden = false; 
    refresh(); 
}

function refresh() {
    const title = document.getElementById("eventTitle");
    if (title) title.textContent = state.meta?.name || state.name || "40K Event";
    
    saveState(state);
    renderAll(state);
}

/* ---------------- Event Listeners ---------------- */

function initEventListeners() {
    // 1. Reset Tournament
    on("btnReset", () => {
        if (!confirm("Are you sure? This will delete ALL players, rounds, and results.")) return;
        localStorage.removeItem(STORAGE_KEY);
        state = defaultState();
        saveState(state);
        if(document.getElementById("recommendBox")) document.getElementById("recommendBox").hidden = true;
        showLanding();
    });

    // 2. Recommend Flow
    on("btnRecommend", () => {
        pendingRecommendation = getRecommendation();
        renderRecommendation(pendingRecommendation);
    });

    on("btnBuildRecommended", () => {
        const nameInput = document.getElementById("lEventName");
        const name = (nameInput?.value || "").trim() || "New Event";
        
        const rec = pendingRecommendation || getRecommendation();

        // Deep reset of state for a new build
        state = defaultState();
        state.meta.name = name;
        state.meta.format = rec.format;
        
        const tieBreak = document.getElementById("lTieBreak")?.value;
        state.meta.useVP = (tieBreak === "vp");
        
        const scoringPreset = document.getElementById("lScoringPreset")?.value || "3-1-0";
        if (scoringPreset === "3-1-0") state.meta.scoring = { win: 3, draw: 1, loss: 0 };
        else state.meta.scoring = { win: 2, draw: 1, loss: 0 };

        showApp();
    });

    // 3. Player Management
    on("btnAddPlayer", () => {
        const nameInput = document.getElementById("newPlayerName");
        const factionInput = document.getElementById("newPlayerFaction");
        if (!nameInput?.value.trim()) return;
        
        state.players.push({ 
            id: Math.random().toString(16).slice(2, 10), 
            name: nameInput.value.trim(), 
            faction: factionInput.value.trim() 
        });
        
        nameInput.value = "";
        factionInput.value = "";
        refresh();
    });

    // 4. Round Management
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
        const container = document.getElementById("pairingsTable") || document.getElementById("pairings");
        if (!container) return;
        
        const rows = container.querySelectorAll(".pairingRow");
        rows.forEach(row => {
            const matchId = row.dataset.matchId;
            const outcome = row.querySelector('[data-field="outcome"]')?.value;
            const aVP = parseInt(row.querySelector('[data-field="aVP"]')?.value || 0);
            const bVP = parseInt(row.querySelector('[data-field="bVP"]')?.value || 0);
            setMatchResult(state, state.activeRoundId, matchId, outcome, aVP, bVP);
        });

        refresh();
        alert("Results saved!");
    });

    // 5. Tabs
    document.querySelectorAll(".tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tabBody").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const target = document.getElementById("tab-" + btn.dataset.tab);
            if (target) target.classList.add("active");
        });
    });
}

/* ---------------- Helper Logic ---------------- */

function on(id, fn) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("click", fn);
    } else {
        console.warn(`Element with ID "${id}" not found.`);
    }
}

function getRecommendation() {
    const pCount = clampInt(document.getElementById("lPlayers")?.value, 8);
    const hours = clampInt(document.getElementById("lHours")?.value, 4);
    const rMin = clampInt(document.getElementById("lRoundMin")?.value, 150);
    const bMin = clampInt(document.getElementById("lBreakMin")?.value, 15);

    const maxRounds = Math.floor((hours * 60) / (rMin + bMin));

    if (pCount <= 8 && (pCount - 1) <= maxRounds) {
        return { format: "round_robin", roundsTotal: pCount - 1, maxRounds, reason: "Small group, full round robin fits time." };
    }
    const swissRounds = Math.min(maxRounds, Math.ceil(Math.log2(pCount)));
    return { format: "swiss", roundsTotal: Math.max(3, swissRounds), maxRounds, reason: "Swiss is best for this size/time." };
}

function renderRecommendation(rec) {
    const box = document.getElementById("recommendBox");
    const text = document.getElementById("recommendText");
    if (box && text) {
        text.innerHTML = `<strong>Format:</strong> ${rec.format.toUpperCase()}<br><strong>Rounds:</strong> ${rec.roundsTotal}<br><strong>Note:</strong> ${rec.reason}`;
        box.hidden = false;
    }
}

function clampInt(v, d=0){ 
    const n = parseInt(v, 10); 
    return Number.isFinite(n) ? n : d; 
}
