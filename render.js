// render.js
import { computeStandings } from "./tournament.js";

const $ = (sel, root = document) => root.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>\"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[m]));
}

/** Helper to create elements with attributes in one go */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function findPlayer(state, id) {
  return (state.players || []).find(p => p.id === id) || null;
}

function activeRound(state) {
  if (!state.activeRoundId) return null;
  return (state.rounds || []).find(r => r.id === state.activeRoundId) || null;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

/* ---------------- Main Entry Point ---------------- */

export function renderAll(state) {
  renderKpis(state);
  renderPlayers(state);
  renderRoundsDropdown(state);
  renderPairings(state);
  renderStandings(state);
}

/* ---------------- KPIs (Counters) ---------------- */

function renderKpis(state) {
  const players = state.players || [];
  const rounds = state.rounds || [];
  const ar = activeRound(state);

  let matchesLogged = 0;
  for (const r of rounds) {
    for (const m of (r.pairings || [])) {
      if ((m?.result?.outcome || "NONE") !== "NONE") matchesLogged++;
    }
  }

  setText("kpiPlayers", String(players.length));
  setText("kpiRounds", String(rounds.length));
  setText("kpiActiveRound", ar ? (ar.label || `Round ${ar.number}`) : "—");
  setText("kpiMatches", String(matchesLogged));
}

/* ---------------- Players List ---------------- */

function renderPlayers(state) {
  const table = $("#playersTable tbody") || $("#playersTbody") || $("#playersBody");
  if (!table) return;

  table.innerHTML = "";
  const players = state.players || [];

  players.forEach((p, idx) => {
    const tr = el("tr", {}, [
      el("td", { html: String(idx + 1) }),
      el("td", { html: `<strong>${escapeHtml(p.name)}</strong>` }),
      el("td", { html: escapeHtml(p.faction || "—") }),
      el("td", { class: "noPrint" }, [
        el("button", { 
          class: "mini bad", 
          html: "Remove", 
          "data-id": p.id,
          onclick: () => {
            if(!confirm(`Remove ${p.name}?`)) return;
            state.players = state.players.filter(pl => pl.id !== p.id);
            document.dispatchEvent(new CustomEvent("ops:stateChanged"));
          }
        })
      ])
    ]);
    table.appendChild(tr);
  });
}

/* ---------------- Rounds Dropdown ---------------- */

function renderRoundsDropdown(state) {
  const sel = $("#roundSelect");
  const badge = $("#roundBadge");
  if (!sel) return;

  const rounds = state.rounds || [];
  sel.innerHTML = "";

  if (rounds.length === 0) {
    if (badge) badge.textContent = "No Rounds";
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  rounds.forEach(r => {
    const opt = el("option", { value: r.id, html: r.label || `Round ${r.number}` });
    if (r.id === state.activeRoundId) opt.selected = true;
    sel.appendChild(opt);
  });

  const ar = activeRound(state);
  if (badge) badge.textContent = ar ? (ar.label || `Round ${ar.number}`) : "—";
}

/* ---------------- Pairings (The Match Table) ---------------- */

function renderPairings(state) {
  const host = $("#pairingsTable tbody") || $("#pairingsList") || $("#pairings");
  if (!host) return;

  host.innerHTML = "";
  const ar = activeRound(state);
  if (!ar) {
    host.innerHTML = '<tr><td colspan="7" class="notice">Create a round to begin.</td></tr>';
    return;
  }

  const pairings = ar.pairings || [];
  if (pairings.length === 0) {
    host.innerHTML = '<tr><td colspan="7" class="notice">No pairings generated. Click "Generate".</td></tr>';
    return;
  }

  const isTable = host.tagName.toLowerCase() === "tbody";

  pairings.forEach(m => {
    const a = findPlayer(state, m.aId);
    const b = m.bId ? findPlayer(state, m.bId) : null;
    const res = m.result || { outcome: "NONE", aVP: 0, bVP: 0 };

    if (isTable) {
      // Table Row Layout
      const tr = el("tr", { class: "pairingRow", "data-match-id": m.id }, [
        el("td", { html: String(m.table) }),
        el("td", { html: `<strong>${escapeHtml(a?.name || "??")}</strong>` }),
        el("td", { html: b ? `<strong>${escapeHtml(b.name)}</strong>` : "<em>BYE</em>" }),
        el("td", {}, [
          el("select", { class: "input", "data-field": "outcome", disabled: !b }, [
            el("option", { value: "NONE", html: "—", selected: res.outcome === "NONE" }),
            el("option", { value: "A", html: "A Win", selected: res.outcome === "A" }),
            el("option", { value: "B", html: "B Win", selected: res.outcome === "B" }),
            el("option", { value: "D", html: "Draw", selected: res.outcome === "D" })
          ])
        ]),
        el("td", {}, [
          el("input", { 
            type: "number", class: "input", "data-field": "aVP", 
            value: res.aVP, disabled: !state.meta?.useVP || !b 
          })
        ]),
        el("td", {}, [
          el("input", { 
            type: "number", class: "input", "data-field": "bVP", 
            value: res.bVP, disabled: !state.meta?.useVP || !b 
          })
        ]),
        el("td", { class: "noPrint" }, [
          el("span", { 
            class: `badge ${badgeClass(res.outcome)}`, 
            html: badgeText(res.outcome) 
          })
        ])
      ]);
      host.appendChild(tr);
    } else {
      // Div/Card Layout (Fallback)
      const card = el("div", { class: "pairingRow card", "data-match-id": m.id }, [
        el("div", { html: `Table ${m.table}: ${a?.name} vs ${b ? b.name : "BYE"}` })
      ]);
      host.appendChild(card);
    }
  });
}

function badgeClass(out) {
  if (out === "A" || out === "B") return "good";
  if (out === "D") return "warn";
  return "muted";
}

function badgeText(out) {
  if (out === "NONE") return "Pending";
  if (out === "D") return "Draw";
  return out + " Win";
}

/* ---------------- Standings ---------------- */

function renderStandings(state) {
  const table = $("#standingsTable tbody") || $("#standingsBody");
  if (!table) return;

  table.innerHTML = "";
  const list = computeStandings(state);

  list.forEach(s => {
    const tr = el("tr", {}, [
      el("td", { html: String(s.rank) }),
      el("td", { html: `<strong>${escapeHtml(s.name)}</strong>` }),
      el("td", { html: escapeHtml(s.faction || "") }),
      el("td", { html: String(s.points) }),
      el("td", { html: escapeHtml(s.record) }),
      el("td", { html: state.meta?.useVP ? String(s.vp) : "-" }),
      el("td", { html: String(s.sos) })
    ]);
    table.appendChild(tr);
  });
}
