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

// --- DB SYNC ---
onValue(ref(db, 'tournament/'), (snapshot) => {
    const data = snapshot.val() || {};
    state.players = data.players ? Object.values(data.players) : [];
    state.rounds = data.rounds ? Object.values(data.rounds) : [];
    state.activeRoundId = data.activeRoundId || null;
    state.pending = data.pending ? Object.values(data.pending) : [];
    renderAll();
});

// --- AUTH ---
document.getElementById("btnLogin").onclick = () => signInWithPopup(auth, provider);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        isAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        document.getElementById("viewLogin").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("userBadge").innerText = `User: ${user.displayName}`;
        
        document.querySelectorAll(".admin-only").forEach(el => {
            el.hidden = !isAdmin;
            if (isAdmin) el.style.display = 'block';
        });
        renderAll();
    }
});

// --- RENDERERS ---
function renderAll() {
    renderPlayers();
    renderStandings();
    renderPairings();
    renderPending();
    renderTableMonitor();
    
    // Check registration visibility
    if (currentUser && !isAdmin) {
        const isRegistered = state.players.some(p => p.id === currentUser.uid) || state.pending.some(p => p.id === currentUser.uid);
        document.getElementById("registrationZone").hidden = isRegistered;
    }
}

function renderTableMonitor() {
    const monitor = document.getElementById("tableMonitor");
    if (!monitor || !isAdmin) return;
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound || !activeRound.pairings) {
        monitor.innerHTML = "<p>Round not started.</p>";
        return;
    }
    monitor.innerHTML = Object.values(activeRound.pairings).map(m => {
        const finished = m.result && m.result.outcome !== "NONE";
        return `<div class="${finished ? 'status-finished' : 'status-playing'}">Table ${m.table}<br>${finished ? 'DONE' : 'LIVE'}</div>`;
    }).join('');
}

function renderPending() {
    const list = document.getElementById("pendingList");
    if (!list || !isAdmin) return;
    if (state.pending.length === 0) return list.innerHTML = "<p>No requests.</p>";
    list.innerHTML = state.pending.map(p => `
        <div class="pending-item">
            <span><strong>${p.name}</strong> (${p.faction})</span>
            <button class="btn btn-success btn-sm" onclick="approvePlayer('${p.id}')">Approve</button>
        </div>
    `).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) return container.innerHTML = "<p class='card'>No active round.</p>";

    const pairings = Object.values(activeRound.pairings || {});
    const toShow = isAdmin ? pairings : pairings.filter(m => m.aId === currentUser?.uid || m.bId === currentUser?.uid);

    container.innerHTML = `<h3>${activeRound.label}</h3>` + toShow.map(m => {
        const pA = state.players.find(p => p.id === m.aId);
        const pB = state.players.find(p => p.id === m.bId);
        const r = m.result || { outcome: "NONE", a: {}, b: {} };
        const scoreFields = (side) => `
            <div class="form-grid">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}" placeholder="Pri">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}" placeholder="Sec">
                <input type="number" class="score-input" data-mid="${m.id}" data-side="${side}" data-type="paint" value="${r[side]?.paint || 10}" placeholder="Pnt">
            </div>`;

        return `
        <div class="card">
            <strong>Table ${m.table}: ${pA?.name} vs ${pB ? pB.name : 'BYE'}</strong>
            <div style="margin-top:10px;">${pA?.name}: ${scoreFields('a')}</div>
            ${pB ? `<div style="margin-top:10px;">${pB.name}: ${scoreFields('b')}</div>` : ''}
            <div style="margin-top:10px; display:flex; gap:10px;">
                <select class="outcome-select" data-mid="${m.id}">
                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>A Win</option>
                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>B Win</option>
                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                </select>
                <button class="btn btn-success" onclick="saveMatchScore('${m.id}')">Save</button>
            </div>
        </div>`;
    }).join('');
}

function renderPlayers() {
    const tbody = document.querySelector("#playersTable tbody");
    if (tbody) tbody.innerHTML = state.players.map((p, i) => `
        <tr><td>${i+1}</td><td>${p.name}</td><td>${p.faction}</td>
        <td>${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="removePlayer('${p.id}')">X</button>` : '-'}</td></tr>
    `).join('');
}

function renderStandings() {
    const tbody = document.querySelector("#standingsTable tbody");
    if (tbody) tbody.innerHTML = computeStandings().map((p, i) => `
        <tr><td>${i+1}</td><td>${p.name}</td><td>${p.faction}</td><td>${p.points}</td><td>${p.w}-${p.d}-${p.l}</td><td>${p.vp}</td></tr>
    `).join('');
}

function computeStandings() {
    let s = state.players.map(p => ({ ...p, points: 0, vp: 0, w: 0, d: 0, l: 0 }));
    state.rounds.forEach(r => {
        if (!r.pairings) return;
        Object.values(r.pairings).forEach(m => {
            const pA = s.find(x => x.id === m.aId);
            const pB = s.find(x => x.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;
            const addVp = (p, res) => { p.vp += (parseInt(res.primary)||0) + (parseInt(res.secondary)||0) + (parseInt(res.paint)||0); };
            addVp(pA, m.result.a); if (pB) addVp(pB, m.result.b);
            if (m.result.outcome === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (m.result.outcome === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (m.result.outcome === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (m.result.outcome === "BYE") { pA.points += 3; pA.w++; }
        });
    });
    return s.sort((a,b) => b.points - a.points || b.vp - a.vp);
}

// --- CORE ACTIONS ---
document.getElementById("btnRequestJoin").onclick = () => {
    const f = document.getElementById("regFaction").value;
    if (!f || !currentUser) return;
    set(ref(db, `tournament/pending/${currentUser.uid}`), { id: currentUser.uid, name: currentUser.displayName, faction: f });
};

window.approvePlayer = (uid) => {
    const p = state.pending.find(x => x.id === uid);
    const updates = {};
    updates[`tournament/players/${uid}`] = p;
    updates[`tournament/pending/${uid}`] = null;
    update(ref(db), updates);
};

document.getElementById("btnNextRound").onclick = () => {
    if (!isAdmin) return;
    const idx = state.rounds.length;
    const id = crypto.randomUUID();
    const updates = { [`tournament/rounds/${idx}`]: { id, label: `Round ${idx+1}`, pairings: {} }, 'tournament/activeRoundId': id };
    update(ref(db), updates);
};

document.getElementById("btnGeneratePairings").onclick = () => {
    if (!isAdmin || state.players.length < 2) return;
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    let pool = state.rounds.length === 1 ? [...state.players].sort(() => 0.5 - Math.random()) : computeStandings();
    const pairings = {};
    for (let i = 0; i < pool.length; i += 2) {
        const id = crypto.randomUUID();
        pairings[id] = { id, table: (i/2)+1, aId: pool[i].id, bId: pool[i+1]?.id || null, result: { outcome: pool[i+1] ? "NONE" : "BYE", a: {}, b: {} } };
    }
    update(ref(db, `tournament/rounds/${rIdx}/pairings`), pairings);
};

window.saveMatchScore = (mId) => {
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    const mKey = Object.keys(state.rounds[rIdx].pairings).find(k => state.rounds[rIdx].pairings[k].id === mId);
    const card = document.querySelector(`[data-mid="${mId}"]`).closest('.card');
    const getV = (s, t) => card.querySelector(`[data-side="${s}"][data-type="${t}"]`).value || 0;
    const res = {
        outcome: card.querySelector(".outcome-select").value,
        a: { primary: getV('a','primary'), secondary: getV('a','secondary'), paint: getV('a','paint') },
        b: { primary: getV('b','primary'), secondary: getV('b','secondary'), paint: getV('b','paint') }
    };
    update(ref(db, `tournament/rounds/${rIdx}/pairings/${mKey}/result`), res).then(() => alert("Saved!"));
};

window.removePlayer = (id) => isAdmin && remove(ref(db, `tournament/players/${id}`));
document.getElementById("btnReset").onclick = () => isAdmin && confirm("Wipe All?") && set(ref(db, 'tournament/'), null).then(() => location.reload());
// --- TAB NAV ---
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
    t.classList.add("active");
    document.getElementById(`tab-${t.dataset.tab}`).classList.add("active");
});
