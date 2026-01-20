// render.js
import { computeStandings } from "./tournament.js";

export function renderAll(state) {
  renderPlayers(state);
  renderRounds(state);
  renderPairings(state);
  renderStandings(state);
}

/* ---------------- Players ---------------- */

export function renderPlayers(state) {
  const ul = document.getElementById("playersList");
  if (!ul) return;

  ul.innerHTML = "";
  state.players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.name} — ${p.faction}`;
    ul.appendChild(li);
  });
}

/* ---------------- Rounds ---------------- */

export function renderRounds(state) {
  const badge = document.getElementById("roundBadge");
  const select = document.getElementById("roundSelect");
  if (!select) return;

  select.innerHTML = "";
  state.rounds.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.label + (r.locked ? " 🔒" : "");
    select.appendChild(opt);
  });

  if (state.activeRoundId) {
    select.value = state.activeRoundId;
    const r = state.rounds.find(x => x.id === state.activeRoundId);
    if (badge) badge.textContent = r ? r.label : "—";
  }
}

/* ---------------- Pairings ---------------- */

export function renderPairings(state) {
  const table = document.getElementById("pairings");
  if (!table) return;

  table.innerHTML = "";
  const round = state.rounds.find(r => r.id === state.activeRoundId);
  if (!round) return;

  round.pairings.forEach(m => {
    const row = document.createElement("div");
    row.className = "pairingRow";

    const a = getName(state, m.aId);
    const b = m.bId ? getName(state, m.bId) : "BYE";

    row.textContent = `Table ${m.table}: ${a} vs ${b} (${m.result.outcome})`;
    table.appendChild(row);
  });
}

/* ---------------- Standings ---------------- */

export function renderStandings(state) {
  const ol = document.getElementById("standings");
  if (!ol) return;

  ol.innerHTML = "";
  const standings = computeStandings(state);

  standings.forEach(s => {
    const li = document.createElement("li");
    li.textContent =
      `${s.rank}. ${s.name} — ${s.points} pts `
      + `(W${s.w} D${s.d} L${s.l}, VP ${s.vp}, SoS ${s.sos})`;
    ol.appendChild(li);
  });
}

/* ---------------- Utils ---------------- */

function getName(state, id) {
  const p = state.players.find(x => x.id === id);
  return p ? p.name : "—";
}
