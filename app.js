/* app.js - Tactical Tournament Console v3.0 */

let state = {
    players: [],
    rounds: [],
    activeRoundId: null,
    meta: { name: "", useVP: true }
};

let timerInterval = null;

// --- CORE LOGIC: STANDINGS & TIE-BREAKERS ---

function computeStandings() {
    const stats = state.players.map(p => ({
        ...p, points: 0, vp: 0, primary: 0, secondary: 0, paint: 0, extra: 0, w: 0, d: 0, l: 0
    }));

    state.rounds.forEach(r => {
        r.pairings.forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            // Scoring helper to aggregate the 4 boxes
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

            // Record Calculation
            const res = m.result.outcome;
            if (res === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (res === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (res === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (res === "BYE") { pA.points += 3; pA.w++; }
        });
    });

    // Rank by: 1. Match Points, 2. Total VP, 3. Total Primary
    return stats.sort((a, b) => (b.points - a.points) || (b.vp - a.vp) || (b.primary - a.primary));
}

// --- TIMER SYSTEM ---

function startTimer(minutes) {
    clearInterval(timerInterval);
    let seconds = Math.floor(minutes * 60);
    const display = document.getElementById("timerClock");

    timerInterval = setInterval(() => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        display.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        
        if (seconds <= 0) {
            clearInterval(timerInterval);
            display.style.color = "#da3633"; // Danger Red
            alert("ROUND TIME EXPIRED");
        }
        seconds--;
    }, 1000);
}

// --- RENDERERS ---

function renderAll() {
    renderPlayers();
    renderRoundList();
    renderPairings();
    renderStandings();
}

function renderPlayers() {
    const tbody = document.querySelector("#playersTable tbody");
    if (!tbody) return;
    tbody.innerHTML = state.players.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.faction}</td>
            <td><button class="btn btn-danger" onclick="window.removePlayer('${p.id}')">Remove</button></td>
        </tr>
    `).join('');
}

function renderRoundList() {
    const sel = document.getElementById("roundSelect");
    if (!sel) return;
    sel.innerHTML = state.rounds.map(r => 
        `<option value="${r.id}" ${r.id === state.activeRoundId ? 'selected' : ''}>${r.label}</option>`
    ).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!container || !activeRound) return;

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} Pairings</h3>
            <table>
                <thead>
                    <tr>
                        <th>Table</th>
                        <th>Player / Scoring (Pri | Sec | Pnt | Ext)</th>
                        <th>Outcome</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeRound.pairings.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        const r = m.result || { outcome: "NONE", a: {}, b: {} };
                        
                        const inputs = (side) => `
                            <div class="form-grid" style="margin-top:5px; gap:5px;">
                                <input type="number" class="score-input" data-side="${side}" data-type="primary" value="${r[side]?.primary || 0}" placeholder="Pri">
                                <input type="number" class="score-input" data-side="${side}" data-type="secondary" value="${r[side]?.secondary || 0}" placeholder="Sec">
                                <input type="number" class="score-input" data-side="${side}" data-type="paint" value="${r[side]?.paint || 0}" placeholder="Pnt">
                                <input type="number" class="score-input" data-side="${side}" data-type="extra" value="${r[side]?.extra || 0}" placeholder="Ext">
                            </div>
                        `;

                        return `
                        <tr class="pairing-row" data-match-id="${m.id}">
                            <td style="vertical-align:top;"><strong>${m.table}</strong></td>
                            <td>
                                <div><strong>${pA?.name}</strong> ${inputs('a')}</div>
                                <div style="margin-top:15px;"><strong>${pB ? pB.name : 'BYE'}</strong> ${pB ? inputs('b') : ''}</div>
                            </td>
                            <td style="vertical-align:top;">
                                <select class="outcome-select" ${!pB ? 'disabled' : ''}>
                                    <option value="NONE" ${r.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${r.outcome === 'A' ? 'selected' : ''}>A Win</option>
                                    <option value="B" ${r.outcome === 'B' ? 'selected' : ''}>B Win</option>
                                    <option value="D" ${r.outcome === 'D' ? 'selected' : ''}>Draw</option>
                                </select>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
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

// --- EVENT LISTENERS ---

document.addEventListener("DOMContentLoaded", () => {
    
    // Setup & Initialization
    document.getElementById("btnRecommend").onclick = () => {
        const pCount = document.getElementById("lPlayers").value || 8;
        const rounds = Math.ceil(Math.log2(pCount));
        document.getElementById("recommendText").innerHTML = `Mission Profile: Swiss<br>Suggested Rounds: ${rounds}`;
        document.getElementById("recommendBox").hidden = false;
    };

    document.getElementById("btnBuildRecommended").onclick = () => {
        state.meta.name = document.getElementById("lEventName").value || "Grand Tournament";
        document.getElementById("viewLanding").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("eventTitle").innerText = state.meta.name;
        renderAll();
    };

    // Timer Controls
    document.getElementById("btnSetTimer").onclick = () => {
        const mins = parseFloat(document.getElementById("timerInput").value) || 150;
        startTimer(mins);
    };

    // Player Management
    document.getElementById("btnAddPlayer").onclick = () => {
        const nInput = document.getElementById("newPlayerName");
        const fInput = document.getElementById("newPlayerFaction");
        if (!nInput.value.trim()) return;
        state.players.push({ id: crypto.randomUUID(), name: nInput.value.trim(), faction: fInput.value.trim() });
        nInput.value = ""; fInput.value = "";
        renderAll();
    };

    // Round Logic
    document.getElementById("btnNextRound").onclick = () => {
        const round = { id: crypto.randomUUID(), label: `Round ${state.rounds.length + 1}`, pairings: [] };
        state.rounds.push(round);
        state.activeRoundId = round.id;
        renderAll();
    };

    document.getElementById("btnGeneratePairings").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        if (!round || state.players.length < 2) return;

        let pool = [];
        if (state.rounds.length === 1) {
            pool = [...state.players].sort(() => 0.5 - Math.random());
        } else {
            // Point-Bracket Randomization
            const currentStandings = computeStandings();
            const brackets = {};
            currentStandings.forEach(p => {
                if (!brackets[p.points]) brackets[p.points] = [];
                brackets[p.points].push(p);
            });
            const sortedKeys = Object.keys(brackets).sort((a, b) => b - a);
            sortedKeys.forEach(k => {
                pool.push(...brackets[k].sort(() => 0.5 - Math.random()));
            });
        }

        const workingPool = [...pool];
        round.pairings = [];
        let table = 1;
        while (workingPool.length > 0) {
            const a = workingPool.shift();
            const b = workingPool.shift() || null;
            round.pairings.push({
                id: crypto.randomUUID(), table: table++, aId: a.id, bId: b ? b.id : null,
                result: { outcome: b ? "NONE" : "BYE", a: {}, b: {} }
            });
        }
        
        // Auto-start timer on generate
        const mins = parseFloat(document.getElementById("timerInput").value) || 150;
        startTimer(mins);
        renderAll();
    };

    document.getElementById("btnSaveResults").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        if (!round) return;
        
        document.querySelectorAll(".pairing-row").forEach(row => {
            const match = round.pairings.find(m => m.id === row.dataset.matchId);
            if (match) {
                const collect = (side) => ({
                    primary: row.querySelector(`[data-side="${side}"][data-type="primary"]`)?.value || 0,
                    secondary: row.querySelector(`[data-side="${side}"][data-type="secondary"]`)?.value || 0,
                    paint: row.querySelector(`[data-side="${side}"][data-type="paint"]`)?.value || 0,
                    extra: row.querySelector(`[data-side="${side}"][data-type="extra"]`)?.value || 0
                });

                match.result = {
                    outcome: row.querySelector(".outcome-select").value,
                    a: collect('a'),
                    b: collect('b')
                };
            }
        });
        renderAll();
        alert("Scores Saved.");
    };

    // Navigation & Global
    document.querySelectorAll(".tab").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        };
    });

    document.getElementById("btnReset").onclick = () => { if(confirm("Wipe all data?")) location.reload(); };
});

window.removePlayer = (id) => { state.players = state.players.filter(p => p.id !== id); renderAll(); };
