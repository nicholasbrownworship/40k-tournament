/* app.js - Tactical Engine v2.3 (Point-Bracket Randomization) */

let state = {
    players: [],
    rounds: [],
    activeRoundId: null,
    meta: { name: "", useVP: true }
};

// --- CORE LOGIC ---

function computeStandings() {
    const stats = state.players.map(p => ({
        ...p, points: 0, vp: 0, w: 0, d: 0, l: 0
    }));

    state.rounds.forEach(r => {
        r.pairings.forEach(m => {
            const pA = stats.find(p => p.id === m.aId);
            const pB = stats.find(p => p.id === m.bId);
            if (!pA || !m.result || m.result.outcome === "NONE") return;

            pA.vp += (parseInt(m.result.aVP) || 0);
            if (pB) pB.vp += (parseInt(m.result.bVP) || 0);

            const res = m.result.outcome;
            if (res === "A") { pA.points += 3; pA.w++; if(pB) pB.l++; }
            else if (res === "B") { if(pB) { pB.points += 3; pB.w++; } pA.l++; }
            else if (res === "D") { pA.points += 1; pA.d++; if(pB) { pB.points += 1; pB.d++; } }
            else if (res === "BYE") { pA.points += 3; pA.w++; }
        });
    });

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

function renderRoundList() {
    const sel = document.getElementById("roundSelect");
    if (!sel) return;
    sel.innerHTML = state.rounds.map(r => 
        `<option value="${r.id}" ${r.id === state.activeRoundId ? 'selected' : ''}>${r.label}</option>`
    ).join('');
}

function renderPairings() {
    const container = document.getElementById("pairingsContainer");
    if (!container) return;
    
    const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
    if (!activeRound) {
        container.innerHTML = `<div class="notice">Create a round to begin pairings.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="card">
            <h3>${activeRound.label} - Match Results</h3>
            <table>
                <thead><tr><th>Table</th><th>A (VP)</th><th>B (VP)</th><th>Result</th></tr></thead>
                <tbody>
                    ${activeRound.pairings.map(m => {
                        const pA = state.players.find(p => p.id === m.aId);
                        const pB = state.players.find(p => p.id === m.bId);
                        const res = m.result || { outcome: "NONE", aVP: 0, bVP: 0 };
                        return `
                        <tr class="pairing-row" data-match-id="${m.id}">
                            <td>${m.table}</td>
                            <td><strong>${pA?.name}</strong><br><input type="number" class="vp-input" data-player="a" value="${res.aVP}"></td>
                            <td><strong>${pB ? pB.name : 'BYE'}</strong><br>${pB ? `<input type="number" class="vp-input" data-player="b" value="${res.bVP}">` : ''}</td>
                            <td>
                                <select class="outcome-select" ${!pB ? 'disabled' : ''}>
                                    <option value="NONE" ${res.outcome === 'NONE' ? 'selected' : ''}>Pending</option>
                                    <option value="A" ${res.outcome === 'A' ? 'selected' : ''}>A Win</option>
                                    <option value="B" ${res.outcome === 'B' ? 'selected' : ''}>B Win</option>
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
            <td>${p.name}</td>
            <td>${p.faction}</td>
            <td>${p.points}</td>
            <td>${p.w}-${p.d}-${p.l}</td>
            <td><strong>${p.vp}</strong></td>
        </tr>
    `).join('');
}

// --- EVENT LISTENERS ---

document.addEventListener("DOMContentLoaded", () => {
    
    document.getElementById("btnRecommend").onclick = () => {
        const pCount = document.getElementById("lPlayers").value || 8;
        const rounds = Math.ceil(Math.log2(pCount));
        const box = document.getElementById("recommendBox");
        const text = document.getElementById("recommendText");
        if (box && text) {
            text.innerHTML = `<strong>Recommendation:</strong> Swiss pairing based on Points + VP.<br>Rounds: ${rounds}`;
            box.hidden = false;
        }
    };

    document.getElementById("btnBuildRecommended").onclick = () => {
        state.meta.name = document.getElementById("lEventName").value || "40K Tournament";
        document.getElementById("viewLanding").hidden = true;
        document.getElementById("viewApp").hidden = false;
        document.getElementById("eventTitle").innerText = state.meta.name;
        renderAll();
    };

    document.getElementById("btnAddPlayer").onclick = () => {
        const nInput = document.getElementById("newPlayerName");
        const fInput = document.getElementById("newPlayerFaction");
        if (!nInput.value.trim()) return;
        state.players.push({ id: crypto.randomUUID(), name: nInput.value.trim(), faction: fInput.value.trim() });
        nInput.value = ""; fInput.value = "";
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
        if (!round || state.players.length < 2) return;

        let pool = [];
        if (state.rounds.length === 1) {
            // Round 1: Total Random
            pool = [...state.players].sort(() => 0.5 - Math.random());
        } else {
            // Round 2+: Point-Bracket Randomization
            const currentStandings = computeStandings();
            
            // Group players into brackets based on Match Points
            const brackets = {};
            currentStandings.forEach(player => {
                if (!brackets[player.points]) brackets[player.points] = [];
                brackets[player.points].push(player);
            });

            // Sort points descending and shuffle each bracket internally
            const sortedPointLevels = Object.keys(brackets).sort((a, b) => b - a);
            sortedPointLevels.forEach(pts => {
                const shuffledBracket = brackets[pts].sort(() => 0.5 - Math.random());
                pool.push(...shuffledBracket);
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
                result: { outcome: b ? "NONE" : "BYE", aVP: 0, bVP: 0 }
            });
        }
        renderAll();
    };

    document.getElementById("btnSaveResults").onclick = () => {
        const round = state.rounds.find(r => r.id === state.activeRoundId);
        if (!round) return;
        document.querySelectorAll(".pairing-row").forEach(row => {
            const match = round.pairings.find(m => m.id === row.dataset.matchId);
            if (match) {
                match.result.outcome = row.querySelector(".outcome-select").value;
                match.result.aVP = parseInt(row.querySelector('[data-player="a"]').value) || 0;
                const bInput = row.querySelector('[data-player="b"]');
                match.result.bVP = bInput ? (parseInt(bInput.value) || 0) : 0;
            }
        });
        renderAll();
        alert("Results saved.");
    };

    document.querySelectorAll(".tab").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab, .tab-content").forEach(el => el.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        };
    });

    document.getElementById("btnReset").onclick = () => { if(confirm("Wipe all?")) location.reload(); };
});

window.removePlayer = (id) => { state.players = state.players.filter(p => p.id !== id); renderAll(); };
