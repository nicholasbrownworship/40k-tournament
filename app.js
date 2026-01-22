/* app.js - Tactical Console v3.1 */

// 1. Imports from Google's Servers
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 2. Your Specific Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDEAIgfetTsb4TQbWeEIQkKgcWXTlbOuQE",
    authDomain: "k-tournament-console.firebaseapp.com",
    projectId: "k-tournament-console",
    storageBucket: "k-tournament-console.firebasestorage.app",
    messagingSenderId: "30278148010",
    appId: "1:30278148010:web:9226955ddd75633c87d5d3",
    measurementId: "G-ER0NM659HX"
};

// 3. Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 4. App State & Admin Settings
let currentUser = null;
let isAdmin = false; 
const ADMIN_EMAIL = "nicholasbrownworship@gmail.com"; // UPDATE THIS to your Gmail to see TO tools

let state = { players: [], rounds: [], activeRoundId: null };

// --- DATABASE SYNC ---
onValue(ref(db, 'tournament/'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
        state.players = data.players ? Object.values(data.players) : [];
        state.rounds = data.rounds ? Object.values(data.rounds) : [];
        state.activeRoundId = data.activeRoundId || null;
        renderAll();
    }
});

// --- AUTH LOGIC ---
document.getElementById("btnLogin").onclick = () => {
    signInWithPopup(auth, provider).catch(error => {
        console.error("Login failed:", error);
        alert("Login Error: " + error.message);
    });
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        isAdmin = user.email === ADMIN_EMAIL;
        
        document.getElementById("viewLogin").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("userBadge").innerText = `Signed in as: ${user.displayName}`;
        
        if (isAdmin) {
            document.querySelectorAll(".admin-only").forEach(el => el.hidden = false);
        }
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

// --- SCORING & STANDINGS ---

function computeStandings() {
    const stats = state.players.map(p => ({
        ...p, points: 0, vp: 0, primary: 0, secondary: 0, paint: 0, extra: 0, w: 0, d: 0, l: 0
    }));

    state.rounds.forEach(r => {
        if (!r.pairings) return;
        r.pairings.forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            const processScore = (player, scoreObj) => {
                const pri = parseInt(scoreObj.primary) || 0;
                const sec = parseInt(scoreObj.secondary) || 0;
                const pnt = parseInt(scoreObj.paint) || 0;
                const ext = parseInt(scoreObj.extra) || 0;
                player.primary += pri;
                player.secondary += sec;
                player.paint += pnt;
                player.extra += ext;
                player.vp += (pri + sec + pnt + ext);
            };

            processScore(pA, m.result.a);
            if (pB) processScore(pB, m.result.b);

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
            <td>${isAdmin ? `<button class="btn btn-danger" onclick="window.removePlayer('${p.id}')">Remove</button>` : '---'}</td>
        </tr>
    `).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) {
        container.innerHTML = "<p>No active round pairings yet.</p>";
        return;
    }

    const pairingsToShow = isAdmin 
        ? activeRound.pairings 
        : activeRound.pairings.filter(m => {
            const pA = state.players.find(p => p.id === m.aId);
            const pB = state.players.find(p => p.id === m.bId);
            return pA?.name === currentUser.displayName || pB?.name === currentUser.displayName;
        });

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} - ${isAdmin ? "All Tables" : "My Matchup"}</h3>
            ${pairingsToShow.length === 0 ? "<p>You are not paired this round.</p>" : ""}
            <table>
                <tbody>
                    ${pairingsToShow.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        const r = m.result || { outcome: "NONE", a: {}, b: {} };
                        
                        const inputs = (side) => `
                            <div class="form-grid">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}" placeholder="Pri">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}" placeholder="Sec">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="paint" value="${r[side]?.paint || 0}" placeholder="Pnt">
                                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="extra" value="${r[side]?.extra || 0}" placeholder="Ext">
                            </div>
                        `;

                        return `
                        <tr>
                            <td>
                                <div><strong>Table ${m.table}: ${pA?.name} vs ${pB ? pB.name : 'BYE'}</strong></div>
                                <div style="margin-top:10px;">${pA?.name}: ${inputs('a')}</div>
                                <div style="margin-top:10px;">${pB ? `${pB.name}: ${inputs('b')}` : ''}</div>
                                <select class="outcome-select" data-mid="${m.id}" style="margin-top:10px;">
                                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>A Win</option>
                                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>B Win</option>
                                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                                </select>
                                <button class="btn btn-success btn-save-match" data-mid="${m.id}" style="margin-top:10px;">Submit Score</button>
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
            <td><strong>${p.name}</strong></td>
            <td>${p.faction}</td>
            <td>${p.points}</td>
            <td>${p.w}-${p.d}-${p.l}</td>
            <td><strong>${p.vp}</strong> <small>(P:${p.primary})</small></td>
        </tr>
    `).join('');
}

// --- CLOUD SAVE FUNCTIONS ---

function saveMatchScore(matchId) {
    const roundIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    const matchIdx = state.rounds[roundIdx].pairings.findIndex(m => m.id === matchId);
    const btn = document.querySelector(`.btn-save-match[data-mid="${matchId}"]`);
    const row = btn.closest('td');

    const getVal = (side, type) => row.querySelector(`[data-side="${side}"][data-type="${type}"]`)?.value || 0;

    const result = {
        outcome: row.querySelector(".outcome-select").value,
        a: { primary: getVal('a', 'primary'), secondary: getVal('a', 'secondary'), paint: getVal('a', 'paint'), extra: getVal('a', 'extra') },
        b: { primary: getVal('b', 'primary'), secondary: getVal('b', 'secondary'), paint: getVal('b', 'paint'), extra: getVal('b', 'extra') }
    };

    update(ref(db, `tournament/rounds/${roundIdx}/pairings/${matchIdx}/result`), result)
        .then(() => alert("Score Recorded."));
}

document.getElementById("btnAddPlayer").onclick = () => {
    const n = document.getElementById("newPlayerName").value;
    const f = document.getElementById("newPlayerFaction").value;
    if (!n) return;
    const id = crypto.randomUUID();
    set(ref(db, 'tournament/players/' + id), { id, name: n, faction: f });
};

document.getElementById("btnNextRound").onclick = () => {
    const id = crypto.randomUUID();
    const round = { id, label: `Round ${state.rounds.length + 1}`, pairings: [] };
    const updates = {};
    updates['tournament/rounds/' + state.rounds.length] = round;
    updates['tournament/activeRoundId'] = id;
    update(ref(db), updates);
};

// Global Removal helper
window.removePlayer = (id) => {
    remove(ref(db, 'tournament/players/' + id));
};
