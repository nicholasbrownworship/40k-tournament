/* app.js - Fresh Start Tactical Engine */

let state = {
    players: [],
    rounds: [],
    activeRoundId: null,
    meta: { name: "", format: "swiss" }
};

// --- CORE LOGIC ---
function computeStandings() {
    const players = state.players.map(p => ({
        ...p, points: 0, sos: 0, w: 0, d: 0, l: 0, oppIds: []
    }));

    state.rounds.forEach(r => {
        r.pairings.forEach(m => {
            const pA = players.find(p => p.id === m.aId);
            const pB = players.find(p => p.id === m.bId);
            if (!pA || !m.result) return;

            if (pB) { pA.oppIds.push(pB.id); pB.oppIds.push(pA.id); }

            if (m.result.outcome === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (m.result.outcome === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (m.result.outcome === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (m.result.outcome === "BYE") { pA.points += 3; pA.w++; }
        });
    });

    return players.sort((a, b) => b.points - a.points);
}

// --- RENDERERS ---
function renderAll() {
    renderPlayers();
    renderRounds();
    renderStandings();
}

function renderPlayers() {
    const tbody = document.querySelector("#playersTable tbody");
    tbody.innerHTML = state.players.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.faction}</td>
            <td><button class="btn btn-danger" onclick="removePlayer('${p.id}')">Remove</button></td>
        </tr>
    `).join('');
}

function renderRounds() {
    const sel = document.getElementById("roundSelect");
    sel.innerHTML = state.rounds.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
    
    const container = document.getElementById("pairingsContainer");
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    
    if (!activeRound) {
        container.innerHTML = "<p>No rounds created yet.</p>";
        return;
    }

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} Pairings</h3>
            <table>
                <thead><tr><th>Table</th><th>Player A</th><th>Player B</th><th>Result</th></tr></thead>
                <tbody>
                    ${activeRound.pairings.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        return `
                        <tr class="pairing-row" data-match-id="${m.id}">
                            <td>${m.table}</td>
                            <td>${pA?.name}</td>
                            <td>${pB ? pB.name : '<em>BYE</em>'}</td>
                            <td>
                                <select class="outcome-select" ${!pB ? 'disabled' : ''}>
                                    <option value="NONE" ${m.result?.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${m.result?.outcome === 'A' ? 'selected' : ''}>A Win</option>
                                    <option value="B" ${m.result?.outcome === 'B' ? 'selected' : ''}>B Win</option>
                                    <option value="D" ${m.result?.outcome === 'D' ? 'selected' : ''}>Draw</option>
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
    const ranked = computeStandings();
    tbody.innerHTML = ranked.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${p.name}</td>
            <td>${p.faction}</td>
            <td>${p.points}</td>
            <td>${p.w}-${p.d}-${p.l}</td>
            <td>-</td>
        </tr>
    `).join('');
}

// --- EVENT HANDLERS ---
document.addEventListener("DOMContentLoaded", () => {
    // Setup View Toggling
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        });
    });

    document.getElementById("btnRecommend").onclick = () => {
        const p = document.getElementById("lPlayers").value;
        document.getElementById("recommendText").innerText = `Swiss Format: ${Math.ceil(Math.log2(p))} Rounds Recommended.`;
        document.getElementById("recommendBox").hidden = false;
    };

    document.getElementById("btnBuildRecommended").onclick = () => {
        state.meta.name = document.getElementById("lEventName").value;
        document.getElementById("viewLanding").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("eventTitle").innerText = state.meta.name;
        renderAll();
    };

    document.getElementById("btnAddPlayer").onclick = () => {
        const name = document.getElementById("newPlayerName").value;
        const faction = document.getElementById("newPlayerFaction").value;
        if (!name) return;
        state.players.push({ id: crypto.randomUUID(), name, faction });
        document.getElementById("newPlayerName").value = "";
        renderAll();
    };

    document.getElementById("btnNextRound").onclick = () => {
        const round = { id: crypto.randomUUID(), label: `Round ${state.rounds.length + 1}`, pairings: [] };
        state.rounds.push(round);
        state.activeRoundId = round.id;
        renderAll();
    };

    document.getElementById("btnGeneratePairings").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        if (!round) return;
        // Simple Random Pairing for Start
        const shuffled = [...state.players].sort(() => 0.5 - Math.random());
        round.pairings = [];
        for (let i = 0; i < shuffled.length; i += 2) {
            round.pairings.push({
                id: crypto.randomUUID(),
                table: (i/2) + 1,
                aId: shuffled[i].id,
                bId: shuffled[i+1]?.id || null,
                result: { outcome: shuffled[i+1] ? "NONE" : "BYE" }
            });
        }
        renderAll();
    };

    document.getElementById("btnSaveResults").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        document.querySelectorAll(".pairing-row").forEach(row => {
            const mId = row.dataset.matchId;
            const outcome = row.querySelector(".outcome-select").value;
            const match = round.pairings.find(m => m.id === mId);
            if (match) match.result.outcome = outcome;
        });
        renderAll();
        alert("Results Saved");
    };
});
