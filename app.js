import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 1. YOUR FIREBASE CONFIG (Paste from Firebase Console)
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDEAIgfetTsb4TQbWeEIQkKgcWXTlbOuQE",
    authDomain: "k-tournament-console.firebaseapp.com",
    projectId: "k-tournament-console",
    storageBucket: "k-tournament-console.firebasestorage.app",
    messagingSenderId: "30278148010",
    appId: "1:30278148010:web:9226955ddd75633c87d5d3",
    measurementId: "G-ER0NM659HX"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>




// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let isAdmin = false; // Set your email here or handle via DB
const ADMIN_EMAIL = "your-email@gmail.com"; 

// --- CORE APP STATE ---
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
document.getElementById("btnLogin").onclick = () => signInWithPopup(auth, provider);

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

// --- TOURNAMENT FUNCTIONS ---

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
                player.primary += parseInt(scoreObj.primary) || 0;
                player.secondary += parseInt(scoreObj.secondary) || 0;
                player.paint += parseInt(scoreObj.paint) || 0;
                player.extra += parseInt(scoreObj.extra) || 0;
                player.vp += (parseInt(scoreObj.primary) || 0) + (parseInt(scoreObj.secondary) || 0) + (parseInt(scoreObj.paint) || 0) + (parseInt(scoreObj.extra) || 0);
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

// --- RENDERING (With Personalization) ---

function renderAll() {
    renderPlayers();
    renderStandings();
    renderPairings();
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) return;

    // Filter pairings: Admin sees all, Player sees only theirs
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
                        <tr class="pairing-row">
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

    // Event Delegation for Save Buttons
    document.querySelectorAll(".btn-save-match").forEach(btn => {
        btn.onclick = () => saveMatchScore(btn.dataset.mid);
    });
}

function saveMatchScore(matchId) {
    const roundIndex = state.rounds.findIndex(r => r.id === state.activeRoundId);
    const matchIndex = state.rounds[roundIndex].pairings.findIndex(m => m.id === matchId);
    const row = document.querySelector(`.btn-save-match[data-mid="${matchId}"]`).closest('tr');

    const getVal = (side, type) => row.querySelector(`[data-side="${side}"][data-type="${type}"]`)?.value || 0;

    const result = {
        outcome: row.querySelector(".outcome-select").value,
        a: { primary: getVal('a', 'primary'), secondary: getVal('a', 'secondary'), paint: getVal('a', 'paint'), extra: getVal('a', 'extra') },
        b: { primary: getVal('b', 'primary'), secondary: getVal('b', 'secondary'), paint: getVal('b', 'paint'), extra: getVal('b', 'extra') }
    };

    update(ref(db, `tournament/rounds/${roundIndex}/pairings/${matchIndex}/result`), result);
    alert("Score Submitted to Cloud");
}

// --- ADMIN CONTROLS ---

document.getElementById("btnAddPlayer").onclick = () => {
    const name = document.getElementById("newPlayerName").value;
    const faction = document.getElementById("newPlayerFaction").value;
    if (!name) return;
    const newId = crypto.randomUUID();
    set(ref(db, 'tournament/players/' + newId), { id: newId, name, faction });
};

document.getElementById("btnGeneratePairings").onclick = () => {
    if (!isAdmin) return;
    const roundIndex = state.rounds.findIndex(r => r.id === state.activeRoundId);
    let pool = [];

    if (state.rounds.length === 1) {
        pool = [...state.players].sort(() => 0.5 - Math.random());
    } else {
        const standings = computeStandings();
        const brackets = {};
        standings.forEach(p => {
            if (!brackets[p.points]) brackets[p.points] = [];
            brackets[p.points].push(p);
        });
        Object.keys(brackets).sort((a,b) => b-a).forEach(k => {
            pool.push(...brackets[k].sort(() => 0.5 - Math.random()));
        });
    }

    const pairings = [];
    for (let i = 0; i < pool.length; i += 2) {
        pairings.push({
            id: crypto.randomUUID(), table: (i/2)+1, aId: pool[i].id, bId: pool[i+1]?.id || null,
            result: { outcome: pool[i+1] ? "NONE" : "BYE", a: {}, b: {} }
        });
    }
    update(ref(db, `tournament/rounds/${roundIndex}`), { pairings });
};

// ... [Include standard tab logic and player removal helpers here]
