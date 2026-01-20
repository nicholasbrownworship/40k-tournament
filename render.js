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
  } else {
    if (badge) badge.textContent = "—";
  }
}

/* ---------------- Pairings (with inputs) ---------------- */

export function renderPairings(state) {
  const box = document.getElementById("pairings");
  if (!box) return;

  box.innerHTML = "";
  const round = state.rounds.find(r => r.id === state.activeRoundId);
  if (!round) {
    box.textContent = "No round selected yet.";
    return;
  }

  const locked = !!round.locked;

  round.pairings.forEach(m => {
    const aName = getName(state, m.aId);
    const bName = m.bId ? getName(state, m.bId) : "BYE";

    const row = document.createElement("div");
    row.className = "pairingRow";
    row.dataset.matchId = m.id;

    // Table + players
    const header = document.createElement("div");
    header.className = "pairingHeader";
    header.textContent = `Table ${m.table}: ${aName} vs ${bName}`;

    // Controls
    const controls = document.createElement("div");
    controls.className = "pairingControlsRow";

    // Outcome select
    const outcome = document.createElement("select");
    outcome.className = "select";
    outcome.dataset.field = "outcome";
    outcome.disabled = locked || (m.bId === null); // BYE locked to BYE automatically

    const opts = [
      ["NONE", "—"],
      ["A", "A wins"],
      ["B", "B wins"],
      ["D", "Draw"],
    ];

    for (const [val, label] of opts) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      outcome.appendChild(o);
    }

    // If BYE match, force BYE outcome display (but keep select disabled)
    if (m.bId === null) {
      const byeOpt = document.createElement("option");
      byeOpt.value = "BYE";
      byeOpt.textContent = "BYE";
      outcome.appendChild(byeOpt);
      outcome.value = "BYE";
    } else {
      outcome.value = (m.result?.outcome || "NONE").toUpperCase();
    }

    // VP inputs
    const vpA = document.createElement("input");
    vpA.type = "number";
    vpA.min = "0";
    vpA.step = "1";
    vpA.className = "input";
    vpA.dataset.field = "aVP";
    vpA.value = String(m.result?.aVP ?? 0);
    vpA.disabled = locked;

    const vpB = document.createElement("input");
    vpB.type = "number";
    vpB.min = "0";
    vpB.step = "1";
    vpB.className = "input";
    vpB.dataset.field = "bVP";
    vpB.value = String(m.result?.bVP ?? 0);
    vpB.disabled = locked || (m.bId === null);

    // Labels
    const lab1 = document.createElement("div");
    lab1.className = "miniLabel";
    lab1.textContent = "Result";

    const lab2 = document.createElement("div");
    lab2.className = "miniLabel";
    lab2.textContent = "VP A";

    const lab3 = document.createElement("div");
    lab3.className = "miniLabel";
    lab3.textContent = "VP B";

    controls.appendChild(wrapField(lab1, outcome));
    controls.appendChild(wrapField(lab2, vpA));
    controls.appendChild(wrapField(lab3, vpB));

    if (locked) {
      const note = document.createElement("div");
      note.className = "mutedSmall";
      note.textContent = "Round locked.";
      row.appendChild(note);
    }

    row.appendChild(header);
    row.appendChild(controls);
    box.appendChild(row);
  });
}

function wrapField(labelEl, inputEl) {
  const w = document.createElement("div");
  w.className = "miniField";
  w.appendChild(labelEl);
  w.appendChild(inputEl);
  return w;
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
      + `(${s.record}, VP ${s.vp}, SoS ${s.sos})`;
    ol.appendChild(li);
  });
}

/* ---------------- Utils ---------------- */

function getName(state, id) {
  const p = state.players.find(x => x.id === id);
  return p ? p.name : "—";
}
