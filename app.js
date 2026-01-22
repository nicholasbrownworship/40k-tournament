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
let timerInterval = null;
let lastNotifiedMins = null;
let lastSeenRoundId = localStorage.getItem('lastSeenRoundId');

// --- DATA SYNC ---
onValue(ref(db, 'tournament/'), (snapshot) => {
    const data = snapshot.val() || {};
    state.players = data.players ? Object.values(data.players) : [];
    state.rounds = data.rounds ? Object.values(data.rounds) : [];
    state.activeRoundId = data.activeRoundId || null;
    state.pending = data.pending ? Object.values(data.pending) : [];
    
    handleTimerSync(data.timer);
    checkNewPairings(data.activeRoundId);
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
        document.querySelectorAll(".admin-only").forEach(el => { el.hidden = !isAdmin; if (isAdmin) el.style.display = 'block'; });
        renderAll();
    }
});

// --- NEW PAIRINGS POPUP LOGIC ---
function checkNewPairings(currentRoundId) {
    if (!currentUser || isAdmin || !currentRoundId) return;
    
    // If the round ID has changed since we last "dismissed" the modal
    if (currentRoundId !== lastSeenRoundId) {
        const round = state.rounds.find(r => r.id === currentRoundId);
        if (!round || !round.pairings) return;

        const myMatch = Object.values(round.pairings).find(m => m.aId === currentUser.uid || m.bId === currentUser.uid);
        if (myMatch) {
            const opp = myMatch.aId === currentUser.uid ? state.players.find(p => p.id === myMatch.bId) : state.players.find(p => p.id === myMatch.aId);
            
            document.getElementById("modalRoundName").innerText = round.label;
            document.getElementById("modalTableNum").innerText = myMatch.table;
            document.getElementById("modalOpponent").innerText = opp ? `Vs. ${opp.name}` : "Vs. BYE";
            document.getElementById("pairingsModal").style.display = 'flex';
            document.getElementById("notifSound").play().catch(() => {});
        }
    }
}

window.closeModal = () => {
    lastSeenRoundId = state.activeRoundId;
    localStorage.setItem('lastSeenRoundId', lastSeenRoundId);
    document.getElementById("pairingsModal").style.display = 'none';
};

// --- TIMER ---
function handleTimerSync(timerData) {
    if (timerInterval) clearInterval(timerInterval);
    if (!timerData || !timerData.active) return document.getElementById("timerClock").innerText = "00:00";
    timerInterval = setInterval(() => {
        const distance = timerData.endTime - Date.now();
        const mins = Math.floor(distance / 60000);
        const secs = Math.floor((distance % 60000) / 1000);
        const timeStr = `${mins}:${secs < 10 ? '0'+secs : secs}`;
        
        document.getElementById("timerClock").innerText = timeStr;
        document.getElementById("modalTimer").innerText = timeStr;

        if (distance <= 0) {
            clearInterval(timerInterval);
            document.getElementById("timerClock").innerText = "TIME UP";
            if (lastNotifiedMins !== 0) triggerAlert("ROUND OVER!", 0);
            return;
        }
        if ([15, 5, 1].includes(mins) && lastNotifiedMins !== mins) triggerAlert(`${mins} MINS REMAINING`, mins);
    }, 1000);
}

function triggerAlert(msg, m) {
    lastNotifiedMins = m;
    const banner = document.getElementById("announcementBanner");
    document.getElementById("announcementText").innerText = msg;
    banner.style.display = 'block';
    document.getElementById("notifSound").play().catch(() => {});
    setTimeout(() => banner.style.display = 'none', 8000);
}

// --- RENDERERS ---
function renderAll() {
    renderPlayers(); renderStandings(); renderPairings(); renderPending(); renderHistory();
    if (currentUser && !isAdmin) {
        const isRegistered = state.players.some(p => p.id === currentUser.uid) || state.pending.some(p => p.id === currentUser.uid);
        document.getElementById("registrationZone").hidden = isRegistered;
    }
}

function renderHistory() {
    const container = document.getElementById("historyContainer");
    if (!container || !isAdmin) return;
    container.innerHTML = state.rounds.map((round, rIdx) => `
        <div class="round-block">
            <h4>${round.label}</h4>
            <div class="table-grid">
                ${Object.values(round.pairings || {}).map(m => {
                    const finished = m.result && m.result.outcome !== "NONE";
                    const pA = state.players.find(p => p.id === m.aId);
                    const pB = state.players.find(p => p.id === m.bId);
                    return `<div class="card" style="font-size: 0.7rem; border: 1px solid #eee;">
                        <strong>T-${m.table}</strong>: ${pA?.name || 'Empty'} vs ${pB?.name || 'BYE'}
                        <div class="${finished ? 'status-finished' : 'status-playing'}" style="margin: 5px 0;">${finished ? 'DONE' : 'LIVE'}</div>
                        <button class="btn btn-sm" style="width:100%" onclick="editScore('${round.id}', '${m.id}')">Edit</button>
                    </div>`;
                }).join('')}
            </div>
        </div>`).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) return container.innerHTML = "<p class='card'>Waiting for round...</p>";
    const pairings = Object.values(activeRound.pairings || {});
    const toShow = isAdmin ? pairings : pairings.filter(m => m.aId === currentUser?.uid || m.bId === currentUser?.uid);
    container.innerHTML = `<h3>Viewing: ${activeRound.label}</h3>` + toShow.map(m => {
        const pA = state.players.find(p => p.id === m.aId);
        const pB = state.players.find(p => p.id === m.bId);
        const r = m.result || { outcome: "NONE", a: {}, b: {} };
        const fields = (side, name) => `
            <div style="margin-bottom:8px;"><label style="font-size:0.7rem; font-weight:bold;">${name}</label>
                <div class="form-grid">
                    <input type="number" data-mid="${m.id}" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}" placeholder="Pri">
                    <input type="number" data-mid="${m.id}" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}" placeholder="Sec">
                    <input type="number" data-mid="${m.id}" data-side="${side}" data-type="paint" value="${r[side]?.paint || 10}" placeholder="Pnt">
                </div></div>`;
        return `<div class="card"><strong>Table ${m.table}</strong>
            ${fields('a', pA?.name || 'A')} ${pB ? fields('b', pB.name) : '<strong>BYE</strong>'}
            <div style="margin-top:10px; display:flex; gap:10px;">
                <select class="outcome-select" data-mid="${m.id}">
                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>${pA?.name} Win</option>
                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>${pB?.name || 'B'} Win</option>
                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                </select><button class="btn btn-success" onclick="saveScore('${m.id}')">Save Score</button>
            </div></div>`;
    }).join('');
}

function renderPlayers() {
    const tbody = document.querySelector("#playersTable tbody");
    if (tbody) tbody.innerHTML = state.players.map((p, i) => `
        <tr style="${p.dropped ? 'opacity:0.5' : ''}"><td>${i+1}</td><td>${p.name} ${p.dropped ? '(D)' : ''}</td><td>${p.faction}</td>
        <td>${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="removePlayer('${p.id}')">X</button><button class="btn btn-warning btn-sm" onclick="toggleDrop('${p.id}', ${p.dropped || false})">${p.dropped ? 'In' : 'Out'}</button>` : '-'}</td></tr>`).join('');
}

function renderStandings() {
    const tbody = document.querySelector("#standingsTable tbody");
    if (tbody) tbody.innerHTML = computeStandings().map((p, i) => `
        <tr><td>${i+1}</td><td>${p.name}</td><td>${p.faction}</td><td>${p.points}</td><td>${p.w}-${p.d}-${p.l}</td><td>${p.vp}</td></tr>`).join('');
}

function renderPending() {
    const list = document.getElementById("pendingList");
    if (!list || !isAdmin) return;
    list.innerHTML = state.pending.length === 0 ? "<p>No requests.</p>" : state.pending.map(p => `<div class="pending-item"><span>${p.name} (${p.faction})</span><button class="btn btn-success btn-sm" onclick="approvePlayer('${p.id}')">Approve</button></div>`).join('');
}

// --- LOGIC ---
function computeStandings() {
    let s = state.players.map(p => ({ ...p, points: 0, vp: 0, w: 0, d: 0, l: 0 }));
    state.rounds.forEach(r => {
        Object.values(r.pairings || {}).forEach(m => {
            const pA = s.find(x => x.id === m.aId); const pB = s.find(x => x.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;
            const addV = (p, res) => p.vp += (parseInt(res.primary)||0) + (parseInt(res.secondary)||0) + (parseInt(res.paint)||0);
            addV(pA, m.result.a); if (pB) addV(pB, m.result.b);
            if (m.result.outcome === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (m.result.outcome === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (m.result.outcome === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (m.result.outcome === "BYE") { pA.points += 3; pA.w++; }
        });
    });
    return s.sort((a,b) => b.points - a.points || b.vp - a.vp);
}

// --- ACTIONS ---
window.editScore = (roundId, matchId) => { state.activeRoundId = roundId; document.querySelector('[data-tab="pairings"]').click(); renderPairings(); };
window.saveScore = (mId) => {
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    const mKey = Object.keys(state.rounds[rIdx].pairings).find(k => state.rounds[rIdx].pairings[k].id === mId);
    const card = document.querySelector(`[data-mid="${mId}"]`).closest('.card');
    const getV = (s, t) => parseInt(card.querySelector(`[data-side="${s}"][data-type="${t}"]`).value) || 0;
    const res = { outcome: card.querySelector(".outcome-select").value, a: { primary: getV('a','primary'), secondary: getV('a','secondary'), paint: getV('a','paint') }, b: { primary: getV('b','primary'), secondary: getV('b','secondary'), paint: getV('b','paint') } };
    update(ref(db, `tournament/rounds/${rIdx}/pairings/${mKey}/result`), res).then(() => alert("Saved!"));
};
function syncTimer(minutes) { const endTime = Date.now() + (minutes * 60 * 1000); set(ref(db, 'tournament/timer'), { endTime, active: true }); }
document.getElementById("btnSetTimer").onclick = () => syncTimer(document.getElementById("timerInput").value);
document.getElementById("btnAddPlayer").onclick = () => {
    const n = document.getElementById("newPlayerName").value;
    const f = document.getElementById("newPlayerFaction").value;
    if(n) set(ref(db, `tournament/players/manual_${Date.now()}`), { id:`manual_${Date.now()}`, name: n, faction: f||"Unknown", dropped: false });
};
window.toggleDrop = (id, cur) => update(ref(db, `tournament/players/${id}`), { dropped: !cur });
window.approvePlayer = (uid) => {
    const p = state.pending.find(x => x.id === uid);
    update(ref(db), { [`tournament/players/${uid}`]: { ...p, dropped: false }, [`tournament/pending/${uid}`]: null });
};
document.getElementById("btnNextRound").onclick = () => {
    const id = crypto.randomUUID();
    update(ref(db), { [`tournament/rounds/${state.rounds.length}`]: { id, label: `Round ${state.rounds.length+1}`, pairings: {} }, 'tournament/activeRoundId': id });
};
document.getElementById("btnGeneratePairings").onclick = () => {
    const rIdx = state.rounds.findIndex(r => r.id === state.activeRoundId);
    let pool = state.rounds.length === 1 ? state.players.filter(p => !p.dropped).sort(() => 0.5 - Math.random()) : computeStandings().filter(p => !p.dropped);
    const pairs = {};
    for (let i = 0; i < pool.length; i += 2) {
        const id = crypto.randomUUID();
        pairs[id] = { id, table: (i/2)+1, aId: pool[i].id, bId: pool[i+1]?.id || null, result: { outcome: pool[i+1] ? "NONE" : "BYE", a: {paint:10}, b: {paint:10} } };
    }
    update(ref(db, `tournament/rounds/${rIdx}/pairings`), pairs).then(() => syncTimer(document.getElementById("timerInput").value));
};
window.removePlayer = (id) => confirm("Delete?") && remove(ref(db, `tournament/players/${id}`));
document.getElementById("btnReset").onclick = () => confirm("Wipe All?") && set(ref(db, 'tournament/'), null).then(() => location.reload());
document.getElementById("btnRequestJoin").onclick = () => set(ref(db, `tournament/pending/${currentUser.uid}`), { id: currentUser.uid, name: currentUser.displayName, faction: document.getElementById("regFaction").value });
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
    t.classList.add("active"); document.getElementById(`tab-${t.dataset.tab}`).classList.add("active");
});
