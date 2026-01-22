/* app.js - Tactical Console v3.3 (Cloud-Master) */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDEAIgfetTsb4TQbWeEIQkKgcWXTlbOuQE",
    authDomain: "k-tournament-console.firebaseapp.com",
    projectId: "k-tournament-console",
    storageBucket: "k-tournament-console.firebasestorage.app",
    messagingSenderId: "30278148010",
    appId: "1:30278148010:web:9226955ddd75633c87d5d3",
    measurementId: "G-ER0NM659HX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let isAdmin = false; 
const ADMIN_EMAIL = "nicholasbrownworship@gmail.com"; // 
let state = { players: [], rounds: [], activeRoundId: null };

// --- DATABASE SYNC ---
onValue(ref(db, 'tournament/'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
        // Convert Firebase objects back into Arrays for our logic
        state.players = data.players ? Object.values(data.players) : [];
        state.rounds = data.rounds ? Object.values(data.rounds) : [];
        state.activeRoundId = data.activeRoundId || null;
        renderAll();
    }
});

// --- AUTH LOGIC ---
document.getElementById("btnLogin").onclick = () => signInWithPopup(auth, provider);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        isAdmin = (user.email === ADMIN_EMAIL);
        
        document.getElementById("viewLogin").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("userBadge").innerText = `Signed in as: ${user.displayName}`;
        
        // Show/Hide Admin elements
        const adminElements = document.querySelectorAll(".admin-only");
        adminElements.forEach(el => {
            el.hidden = !isAdmin;
            if (isAdmin) el.style.display = 'block'; // Force display if admin
        });
        
        renderAll();
    }
});

// --- TAB NAVIGATION ---
document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    };
});

// --- CORE CALCULATIONS ---
function computeStandings() {
    const stats = state.players.map(p => ({
        ...p, points: 0, vp: 0, primary: 0, secondary: 0, paint: 0, extra: 0, w: 0, d: 0, l: 0
    }));

    state.rounds.forEach(r => {
        if (!r.pairings) return;
        const pairings = Object.values(r.pairings); // Handle FB object
        pairings.forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            const scoreMatch = (player, score) => {
                player.primary += parseInt(score.primary) || 0;
                player.secondary += parseInt(score.secondary) || 0;
                player.paint += parseInt(score.paint) || 0;
                player.extra += parseInt(score.extra) || 0;
                player.vp += (parseInt(score.primary)||0) + (parseInt(score.secondary)||0) + (parseInt(score.paint)||0) + (parseInt(score.extra)||0);
            };

            scoreMatch(pA, m.result.a);
            if (pB) scoreMatch(pB, m.result.b);

            if (m.result.outcome === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (m.result.outcome === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (m.result.outcome === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (m.result.outcome === "BYE") { pA.points += 3; pA.w++; }
        });
    });
    return stats.sort((a, b) => (b.points - a.points) || (b.vp - a.vp) || (b.primary - a.primary));
}

// --- RENDERERS ---
function renderAll() {
    renderPlayers();
    renderStandings();
    renderPairings();
}

function renderPlayers() {
    const tbody = document.querySelector("#playersTable tbody");
    if (!tbody) return;
    tbody.innerHTML = state.players.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.faction}</td>
            <td>${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="removePlayer('${p.id}')">Remove</button>` : '---'}</td>
        </tr>
    `).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) {
        container.innerHTML = "<p class='card'>Waiting for Round 1 to start...</p>";
        return;
    }

    const pairings = activeRound.pairings ? Object.values(activeRound.pairings) : [];
    
    // Personalize view for players
    const pairingsToShow = isAdmin 
        ? pairings 
        : pairings.filter(m => {
            const pA = state.players.find(p => p.id === m.aId);
            const pB = state.players.find(p => p.id === m.bId);
            return pA?.name === currentUser.displayName || pB?.name === currentUser.displayName;
        });

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} ${isAdmin ? "(TO Control)" : "(My Match)"}</h3>
            ${pairingsToShow.length === 0 ? "<p>No matches found for you.</p>" : ""}
            <table>
                <tbody>
                    ${pairingsToShow.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        const r = m.result || { outcome: "NONE", a: {}, b: {} };
                        
                        const scoreRow = (side) => `
                            <div class="form-grid">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="paint" value="${r[side]?.paint || 0}">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="extra" value="${r[side]?.extra || 0}">
                            </div>
                        `;

                        return `
                        <tr>
                            <td>
                                <strong>Table ${m.table}: ${pA?.name} vs ${pB ? pB.name : 'BYE'}</strong>
                                <div style="margin:10px 0;">${pA?.name}: ${scoreRow('a')}</div>
                                ${pB ? `<div style="margin:10px 0;">${pB.name}: ${scoreRow('b')}</div>` : ''}
                                <select class="outcome-select" data-mid="${m.id}" style="width:100px;">
                                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>A Win</option>
                                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>B Win</option>
                                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                                </select>
                                <button class="btn btn-success btn-save-match" data-mid="${m.id}">Save</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.querySelectorAll(".btn-save-match").forEach(btn => {
        btn.onclick = () => saveMatchScore(btn.dataset.mid);
    });
}

function renderStandings() {
    const tbody = document.querySelector("#standingsTable tbody");
    if (!tbody) return;
    const ranked = computeStandings();
    tbody.innerHTML = ranked.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${p.name}</td>
            <td>${p.faction}</td>
            <td>${p.points}</td>
            <td>${p.w}-${p.d}-${p.l}</td>
            <td>${p.vp} <small>(${p.primary})</small></td>
        </tr>
    `).join('');
}

// --- ADMIN CONTROL ACTIONS ---

document.getElementById("btnAddPlayer").onclick = () => {
    const n = document.getElementById("newPlayerName").value;
    const f = document.getElementById("newPlayerFaction").value;
    if (!n) return;
    const id = crypto.randomUUID();
    set(ref(db, 'tournament/players/' + id), { id, name: n, faction: f });
};

document.getElementById("btnNextRound").onclick = () => {
    if (!isAdmin) return;
    const roundId = crypto.randomUUID();
    const roundCount = state.rounds.length;
    const newRound = { id: roundId, label: `Round ${roundCount + 1}`, pairings: [] };
    
    const updates = {};
    updates[`tournament/rounds/${roundCount}`] = newRound;
    updates['tournament/activeRoundId'] = roundId;
    update(ref(db), updates);
};

document.getElementById("btnGeneratePairings").onclick = () => {
    if (!isAdmin || state.players.length < 2) return;
    const currentRoundIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    if (currentRoundIdx === -1) return;

    let pool = [];
    if (state.rounds.length === 1) {
        pool = [...state.players].sort(() => 0.5 - Math.random());
    } else {
        const standings = computeStandings();
        pool = standings; // Simplified swiss for this rewrite
    }

    const pairings = {};
    for (let i = 0; i < pool.length; i += 2) {
        const id = crypto.randomUUID();
        pairings[id] = {
            id, table: (i/2)+1, aId: pool[i].id, bId: pool[i+1]?.id || null,
            result: { outcome: pool[i+1] ? "NONE" : "BYE", a: {}, b: {} }
        };
    }
    update(ref(db, `tournament/rounds/${currentRoundIdx}/pairings`), pairings);
};

function saveMatchScore(matchId) {
    const roundIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    // Find the specific pairing key in Firebase object
    const pairings = state.rounds[roundIdx].pairings;
    const matchKey = Object.keys(pairings).find(key => pairings[key].id === matchId);
    
    const row = document.querySelector(`.btn-save-match[data-mid="${matchId}"]`).closest('td');
    const getVal = (side, type) => row.querySelector(`[data-side="${side}"][data-type="${type}"]`)?.value || 0;

    const result = {
        outcome: row.querySelector(".outcome-select").value,
        a: { primary: getVal('a', 'primary'), secondary: getVal('a', 'secondary'), paint: getVal('a', 'paint'), extra: getVal('a', 'extra') },
        b: { primary: getVal('b', 'primary'), secondary: getVal('b', 'secondary'), paint: getVal('b', 'paint'), extra: getVal('b', 'extra') }
    };

    update(ref(db, `tournament/rounds/${roundIdx}/pairings/${matchKey}/result`), result);
}

// Global scope for HTML button onclick
window.removePlayer = (id) => {
    if(!isAdmin) return;
    const pKey = Object.keys(state.players).find(k => state.players[k].id === id);
    remove(ref(db, 'tournament/players/' + id));
};

document.getElementById("btnReset").onclick = () => {
    if (isAdmin && confirm("Wipe tournament?")) set(ref(db, 'tournament/'), null);
};
