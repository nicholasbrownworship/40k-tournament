/* app.js - Tactical Console v4.0 (Registration & TO Approval) */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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
const ADMIN_EMAIL = "nicholasbrownworship@gmail.com"; 
let state = { players: [], rounds: [], activeRoundId: null, pending: [] };

// --- DATABASE SYNC ---
onValue(ref(db, 'tournament/'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
        state.players = data.players ? Object.values(data.players) : [];
        state.rounds = data.rounds ? Object.values(data.rounds) : [];
        state.activeRoundId = data.activeRoundId || null;
        state.pending = data.pending ? Object.values(data.pending) : [];
        renderAll();
    } else {
        state = { players: [], rounds: [], activeRoundId: null, pending: [] };
        renderAll();
    }
});

// --- AUTH LOGIC ---
document.getElementById("btnLogin").onclick = () => signInWithPopup(auth, provider);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        isAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        
        document.getElementById("viewLogin").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("userBadge").innerText = `Signed in as: ${user.displayName}`;
        
        const adminElements = document.querySelectorAll(".admin-only");
        adminElements.forEach(el => {
            el.hidden = !isAdmin;
            if (isAdmin) el.style.display = 'block';
        });

        checkRegistrationStatus();
        renderAll();
    }
});

function checkRegistrationStatus() {
    if (!currentUser || isAdmin) {
        document.getElementById("registrationZone").hidden = true;
        return;
    }
    const isPlayer = state.players.some(p => p.id === currentUser.uid);
    const isPending = state.pending.some(p => p.id === currentUser.uid);
    document.getElementById("registrationZone").hidden = (isPlayer || isPending);
}

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
        Object.values(r.pairings).forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            const scoreMatch = (player, score) => {
                const p = parseInt(score.primary) || 0;
                const s = parseInt(score.secondary) || 0;
                const pt = parseInt(score.paint) || 0;
                const e = parseInt(score.extra) || 0;
                player.primary += p; player.secondary += s; player.paint += pt; player.extra += e;
                player.vp += (p + s + pt + e);
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
    renderPending();
    checkRegistrationStatus();
}

function renderPending() {
    const list = document.getElementById("pendingList");
    if (!list || !isAdmin) return;
    if (state.pending.length === 0) {
        list.innerHTML = "<p>No pending requests.</p>";
        return;
    }
    list.innerHTML = state.pending.map(p => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span><strong>${p.name}</strong> (${p.faction})</span>
            <button class="btn btn-success btn-sm" onclick="approvePlayer('${p.id}')">Approve</button>
        </div>
    `).join('');
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
        container.innerHTML = "<p class='card'>No active round. Waiting for TO to start.</p>";
        return;
    }

    const pairings = activeRound.pairings ? Object.values(activeRound.pairings) : [];
    const pairingsToShow = isAdmin ? pairings : pairings.filter(m => [m.aId, m.bId].includes(currentUser?.uid));

    container.innerHTML = `<h3>${activeRound.label}</h3>` + pairingsToShow.map(m => {
        const pA = state.players.find(p => p.id === m.aId);
        const pB = state.players.find(p => p.id === m.bId);
        const r = m.result || { outcome: "NONE", a: {}, b: {} };
        const scoreRow = (side) => `
            <div class="form-grid">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="paint" value="${r[side]?.paint || 0}">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="extra" value="${r[side]?.extra || 0}">
            </div>`;

        return `
        <div class="card">
            <strong>Table ${m.table}: ${pA?.name} vs ${pB ? pB.name : 'BYE'}</strong>
            <div>${pA?.name}: ${scoreRow('a')}</div>
            ${pB ? `<div>${pB.name}: ${scoreRow('b')}</div>` : ''}
            <div class="form-grid">
                <select class="outcome-select" data-mid="${m.id}">
                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>A Win</option>
                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>B Win</option>
                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                </select>
                <button class="btn btn-success" onclick="saveMatchScore('${m.id}')">Save Score</button>
            </div>
        </div>`;
    }).join('');
}

function renderStandings() {
    const tbody = document.querySelector("#standingsTable tbody");
    if (!tbody) return;
    tbody.innerHTML = computeStandings().map((p, i) => `
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

// --- ACTIONS ---

document.getElementById("btnRequestJoin").onclick = () => {
    const f = document.getElementById("regFaction").value;
    if (!f || !currentUser) return alert("Enter a faction!");
    set(ref(db, `tournament/pending/${currentUser.uid}`), {
        id: currentUser.uid, name: currentUser.displayName, faction: f
    }).then(() => alert("Request Sent!"));
};

window.approvePlayer = (uid) => {
    const p = state.pending.find(x => x.id === uid);
    const updates = {};
    updates[`tournament/players/${uid}`] = p;
    updates[`tournament/pending/${uid}`] = null;
    update(ref(db), updates);
};

document.getElementById("btnAddPlayer").onclick = () => {
    const n = document.getElementById("newPlayerName").value;
    const f = document.getElementById("newPlayerFaction").value;
    if (!n) return;
    const id = crypto.randomUUID();
    set(ref(db, 'tournament/players/' + id), { id, name: n, faction: f });
};

document.getElementById("btnNextRound").onclick = () => {
    if (!isAdmin) return;
    const rIdx = state.rounds.length;
    const rId = crypto.randomUUID();
    const updates = {};
    updates[`tournament/rounds/${rIdx}`] = { id: rId, label: `Round ${rIdx + 1}`, pairings: {} };
    updates['tournament/activeRoundId'] = rId;
    update(ref(db), updates);
};

document.getElementById("btnGeneratePairings").onclick = () => {
    if (!isAdmin || state.players.length < 2) return;
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    if (rIdx === -1) return;
    let pool = state.rounds.length === 1 ? [...state.players].sort(() => 0.5 - Math.random()) : computeStandings();
    const pairings = {};
    for (let i = 0; i < pool.length; i += 2) {
        const id = crypto.randomUUID();
        pairings[id] = {
            id, table: (i/2)+1, aId: pool[i].id, bId: pool[i+1]?.id || null,
            result: { outcome: pool[i+1] ? "NONE" : "BYE", a: {}, b: {} }
        };
    }
    update(ref(db, `tournament/rounds/${rIdx}/pairings`), pairings);
};

window.saveMatchScore = (mId) => {
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    const mKey = Object.keys(state.rounds[rIdx].pairings).find(k => state.rounds[rIdx].pairings[k].id === mId);
    const container = document.querySelector(`[data-mid="${mId}"]`).closest('.card');
    const getVal = (s, t) => container.querySelector(`[data-side="${s}"][data-type="${t}"]`).value || 0;
    const res = {
        outcome: container.querySelector(".outcome-select").value,
        a: { primary: getVal('a','primary'), secondary: getVal('a','secondary'), paint: getVal('a','paint'), extra: getVal('a','extra') },
        b: { primary: getVal('b','primary'), secondary: getVal('b','secondary'), paint: getVal('b', 'paint'), extra: getVal('b', 'extra') }
    };
    update(ref(db, `tournament/rounds/${rIdx}/pairings/${mKey}/result`), res).then(() => alert("Saved!"));
};

window.removePlayer = (id) => isAdmin && remove(ref(db, 'tournament/players/' + id));

document.getElementById("btnReset").onclick = () => isAdmin && confirm("Wipe All Data?") && set(ref(db, 'tournament/'), null).then(() => location.reload());
