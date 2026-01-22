// render.js
import { computeStandings } from "./tournament.js";

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>\"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[m]));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "value") node.value = v;
    else if (k === "disabled") node.disabled = !!v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else if (k !== "onclick") node.setAttribute(k, v); // Handled separately if needed
  }
  for (const c of children) {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

/* ---------------- Main Entry Point ---------------- */

export function renderAll(state) {
  renderPlayers(state);
  renderRoundsDropdown(state);
  renderPairings(state);
  renderStandings(state);
}

/* ---------------- Players ---------------- */

function renderPlayers(state) {
  const tbody = $("#playersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  (state.players || []).forEach((p, idx) => {
    tbody.appendChild(el("tr", {}, [
      el("td", { html: String(idx + 1) }),
      el("td", { html: `<strong>${escapeHtml(p.name)}</strong>` }),
      el("td", { html: escapeHtml(p.faction || "—") }),
      el("td", { class: "noPrint" }, [
        el("button", { class: "btn danger", html: "Remove" }) // Logic handled in app.js usually
      ])
    ]));
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
    sel.appendChild(el("option", { html: "No Rounds Created" }));
    if (badge) badge.textContent = "—";
    return;
  }

  rounds.forEach(r => {
    const opt = el("option", { value: r.id, html: r.label || `Round ${r.number}` });
    if (r.id === state.activeRoundId) {
        opt.selected = true;
        if (badge) badge.textContent = r.number;
    }
    sel.appendChild(opt);
  });
}

/* ---------------- Pairings ---------------- */

export function renderPairings(state) {
  const container = $("#pairings");
  if (!container) return;
  container.innerHTML = "";

  const activeRound = state.rounds.find(r => r.id === state.activeRoundId);
  if (!activeRound) {
    container.innerHTML = '<div class="notice">No active round. Click "Create Round".</div>';
    return;
  }

  const pairings = activeRound.pairings || [];
  if (pairings.length === 0) {
    container.innerHTML = '<div class="notice">No pairings generated. Click "Generate Pairings".</div>';
    return;
  }

  // Create the table structure inside the div
  const table = el("table", { class: "u-full-width" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { html: "Table" }),
        el("th", { html: "Player A" }),
        el("th", { html: "Player B" }),
        el("th", { html: "Outcome" }),
        el("th", { html: "A's VP" }),
        el("th", { html: "B's VP" })
      ])
    ]),
    el("tbody")
  ]);

  const tbody = table.querySelector("tbody");

  pairings.forEach(m => {
    const pA = state.players.find(p => p.id === m.aId);
    const pB = state.players.find(p => p.id === m.bId);
    const res = m.result || { outcome: "NONE", aVP: 0, bVP: 0 };

    tbody.appendChild(el("tr", { class: "pairingRow", "data-match-id": m.id }, [
      el("td", { html: String(m.table) }),
      el("td", { html: `<strong>${escapeHtml(pA?.name)}</strong>` }),
      el("td", { html: pB ? `<strong>${escapeHtml(pB.name)}</strong>` : "<em>BYE</em>" }),
      el("td", {}, [
        el("select", { "data-field": "outcome", disabled: !pB }, [
          el("option", { value: "NONE", html: "—", selected: res.outcome === "NONE" }),
          el("option", { value: "A", html: "A Win", selected: res.outcome === "A" }),
          el("option", { value: "B", html: "B Win", selected: res.outcome === "B" }),
          el("option", { value: "D", html: "Draw", selected: res.outcome === "D" })
        ])
      ]),
      el("td", {}, [
        el("input", { type: "number", "data-field": "aVP", value: res.aVP, disabled: !state.meta.useVP })
      ]),
      el("td", {}, [
        el("input", { type: "number", "data-field": "bVP", value: res.bVP, disabled: !pB || !state.meta.useVP })
      ])
    ]));
  });

  container.appendChild(table);
}

/* ---------------- Standings ---------------- */

function renderStandings(state) {
  const tbody = $("#standingsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = computeStandings(state);
  list.forEach(s => {
    tbody.appendChild(el("tr", {}, [
      el("td", { html: String(s.rank) }),
      el("td", { html: `<strong>${escapeHtml(s.name)}</strong>` }),
      el("td", { html: escapeHtml(s.faction) }),
      el("td", { html: `<strong>${s.points}</strong>` }),
      el("td", { html: s.record }),
      el("td", { html: state.meta.useVP ? String(s.vp) : "-" }),
      el("td", { html: String(s.sos) }),
      el("td", { html: `<small>${s.opponents.join(", ")}</small>` })
    ]));
  });
}
