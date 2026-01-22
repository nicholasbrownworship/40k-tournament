/* app.js - Tactical Engine with VP Tiebreakers */

let state = {
    players: [],
    rounds: [],
    activeRoundId: null,
    meta: { name: "", useVP: true }
};

// --- CORE LOGIC ---

/**
 * Calculations:
 * 1. Points (W/L/D)
 * 2. Total VP (Tiebreaker 1)
 * 3. Win Count (Tiebreaker 2)
 */
function computeStandings() {
    const stats = state.players.map(p => ({
        ...p, points: 0, vp: 0, w: 0, d: 0, l: 0
    }));

    state.rounds.forEach(r => {
        r.pairings.forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            // Track VP
            pA.vp += (parseInt(m.result.aVP) || 0);
            if (pB) pB.vp += (parseInt(m.result.bVP) || 0);

            // Track Record
            const res = m.result.outcome;
            if (res === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (res === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (res === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (res === "BYE") { pA.points += 3; pA.w++; pA.vp += 0; } // Adjust if BYE gives flat VP
        });
    });

    // Sort: Points DESC, then VP DESC, then Wins DESC
    return stats.sort((a, b) => (b.points - a.points) || (b.vp - a.vp) || (b.w - a.w));
}

// --- RENDERING ---

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

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) return;

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} - Combat Missions</h3>
            <table>
                <thead>
                    <tr>
                        <th>Table</th>
                        <th>Player A (VP)</th>
                        <th>Player B (VP)</th>
                        <th>Outcome</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeRound.pairings.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        const res = m.result || { outcome: "NONE", aVP: 0, bVP: 0 };
                        return `
                        <tr class="pairing-row" data-match-id="${m.id}">
                            <td>${m.table}</td>
                            <td>
                                <div><strong>${pA?.name}</strong></div>
                                <input type="number" class="vp-input" data-player="a" value="${res.aVP}" placeholder="VP">
                            </td>
                            <td>
                                <div><strong>${pB ? pB.name : 'BYE'}</strong></div>
                                ${pB ? `<input type="number" class="vp-input" data-player="b" value="${res.bVP}" placeholder="VP">` : ''}
                            </td>
                            <td>
                                <select class="outcome-select" ${!pB ? 'disabled' : ''}>
                                    <option value="NONE" ${res.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${res.outcome === 'A' ? 'selected' : ''}>A Victory</option>
                                    <option value="B" ${res.outcome === 'B' ? 'selected' : ''}>B Victory</option>
                                    <option value="D" ${res.outcome === 'D' ? 'selected' : ''}>Draw</option>
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
            <td><strong>${p.vp}</strong></td>
        </tr>
    `).join('');
}

// --- PAIRING ENGINE ---

function generatePairings() {
    const round = state.rounds.find(r => r.id === state.activeRoundId);
    if (!round || state.players.length < 2) return;

    let sortedPool;
    if (state.rounds.length === 1) {
        sortedPool = [...state.players].sort(() => 0.5 - Math.random());
    } else {
        // Power Pairing: Rank by Points + VP
        sortedPool = computeStandings();
    }

    const pool = [...sortedPool];
    round.pairings = [];
    let table = 1;

    while (pool.length > 0) {
        const a = pool.shift();
        const b = pool.shift() || null;
        round.pairings.push({
            id: crypto.randomUUID(),
            table: table++,
            aId: a.id,
            bId: b ? b.id : null,
            result: { outcome: b ? "NONE" : "BYE", aVP: 0, bVP: 0 }
        });
    }
    renderAll();
}

// --- EVENT LISTENERS ---

document.addEventListener("DOMContentLoaded", () => {
    // Shared Initialization Logic
    document.getElementById("btnBuildRecommended").onclick = () => {
        state.meta.name = document.getElementById("lEventName").value || "40K GT";
        document.getElementById("viewLanding").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("eventTitle").innerText = state.meta.name;
        renderAll();
    };

    document.getElementById("btnNextRound").onclick = () => {
        const round = { id: crypto.randomUUID(), label: `Round ${state.rounds.length + 1}`, pairings: [] };
        state.rounds.push(round);
        state.activeRoundId = round.id;
        renderAll();
    };

    document.getElementById("btnGeneratePairings").onclick = generatePairings;

    document.getElementById("btnSaveResults").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        document.querySelectorAll(".pairing-row").forEach(row => {
            const mId = row.dataset.matchId;
            const outcome = row.querySelector(".outcome-select").value;
            const aVP = row.querySelector('.vp-input[data-player="a"]')?.value || 0;
            const bVP = row.querySelector('.vp-input[data-player="b"]')?.value || 0;
            
            const match = round.pairings.find(m => m.id === mId);
            if (match) {
                match.result = { outcome, aVP: parseInt(aVP), bVP: parseInt(bVP) };
            }
        });
        renderAll();
        alert("Mission Results Logged.");
    };

    // Tab & Reset Handlers (Keep from previous)
    document.getElementById("btnReset").onclick = () => { if(confirm("Wipe Data?")) location.reload(); };
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        });
    });
});

window.removePlayer = (id) => { state.players = state.players.filter(p => p.id !== id); renderAll(); };
