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

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
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

function setHTML(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

export function renderAll(state) {
  renderKpis(state);
  renderPlayers(state);
  renderRoundsDropdown(state);
  renderPairings(state);
  renderStandings(state);
}

/* ---------------- KPIs ---------------- */

function renderKpis(state) {
  const players = state.players || [];
  const rounds = state.rounds || [];
  const ar = activeRound(state);

  let matchesLogged = 0;
  for (const r of rounds) {
    for (const m of (r.pairings || [])) {
      const o = (m?.result?.outcome || "NONE").toUpperCase();
      if (o !== "NONE") matchesLogged++;
    }
  }

  setText("kpiPlayers", String(players.length));
  setText("kpiRounds", String(rounds.length));
  setText("kpiActiveRound", ar ? (ar.label || `Round ${ar.number}`) : "—");
  setText("kpiMatches", String(matchesLogged));
}

/* ---------------- Players ---------------- */

function renderPlayers(state) {
  const table = $("#playersTable tbody") || $("#playersTbody") || $("#playersBody");
  if (!table) return;

  table.innerHTML = "";

  const players = state.players || [];
  players.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.faction || "")}</td>
      <td class="noPrint">
        <div class="rowActions">
          <button class="mini bad" data-action="removePlayer" data-id="${p.id}">Remove</button>
        </div>
      </td>
    `;
    table.appendChild(tr);
  });

  // Optional: hook remove buttons if your app.js isn't doing it already
  table.querySelectorAll('[data-action="removePlayer"]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-id");
      state.players = (state.players || []).filter(p => p.id !== id);

      // Also remove from existing pairings (cleanup)
      for (const r of (state.rounds || [])) {
        r.pairings = (r.pairings || []).filter(m => m.aId !== id && m.bId !== id);
      }

      // NOTE: state persistence is handled by app.js refresh/save
      // We trigger a lightweight event so app.js can refresh if you want,
      // but if you call renderAll after any change, you're good.
      document.dispatchEvent(new CustomEvent("ops:stateChanged"));
    };
  });
}

/* ---------------- Rounds dropdown ---------------- */

function renderRoundsDropdown(state) {
  const sel = $("#roundSelect");
  const badge = $("#roundBadge");
  if (!sel || !badge) return;

  const rounds = state.rounds || [];
  sel.innerHTML = "";

  if (rounds.length === 0) {
    badge.textContent = "Round: —";
    sel.disabled = true;
    return;
  }

  sel.disabled = false;

  for (const r of rounds) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.label || `Round ${r.number}`;
    sel.appendChild(opt);
  }

  // Ensure activeRoundId is valid
  if (!state.activeRoundId || !rounds.some(r => r.id === state.activeRoundId)) {
    state.activeRoundId = rounds[rounds.length - 1].id;
  }

  sel.value = state.activeRoundId;

  const ar = activeRound(state);
  badge.textContent = `Round: ${ar ? (ar.label || `Round ${ar.number}`) : "—"}`;
}

/* ---------------- Pairings ---------------- */

function renderPairings(state) {
  // This is the #1 place your “only 1 table” bug comes from.
  // We render ALL matches in round.pairings.
  const host =
    $("#pairingsTable tbody") || // if you're using a table layout
    $("#pairingsList") ||        // if you have a div list
    $("#pairings") ||            // fallback (common wrapper id)
    $("#tab-pairings");          // last resort: dump into tab container

  if (!host) return;

  const ar = activeRound(state);

  // If using the table, host is tbody; if not, it's a div container.
  const isTable = host.tagName.toLowerCase() === "tbody";

  // Clear current
  host.innerHTML = "";

  if (!ar) {
    // No rounds exist
    if (!isTable) {
      host.appendChild(el("div", { class: "notice", html: "No round created yet. Click <strong>Create Round</strong>." }));
    } else {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7"><div class="notice">No round created yet. Click <strong>Create Round</strong>.</div></td>`;
      host.appendChild(tr);
    }
    return;
  }

  const pairings = ar.pairings || [];
  if (pairings.length === 0) {
    if (!isTable) {
      host.appendChild(el("div", { class: "notice", html: "No pairings yet. Click <strong>Generate Pairings</strong>." }));
    } else {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7"><div class="notice">No pairings yet. Click <strong>Generate Pairings</strong>.</div></td>`;
      host.appendChild(tr);
    }
    return;
  }

  // Render every match
  for (const m of pairings) {
    const a = findPlayer(state, m.aId);
    const b = m.bId === null ? null : findPlayer(state, m.bId);

    const aName = a ? a.name : "(missing)";
    const bName = b ? b.name : "BYE";

    const res = m.result || { outcome: "NONE", aVP: 0, bVP: 0 };
    const outcome = (res.outcome || "NONE").toUpperCase();
    const aVP = Number.isFinite(+res.aVP) ? +res.aVP : 0;
    const bVP = Number.isFinite(+res.bVP) ? +res.bVP : 0;

    if (isTable) {
      const tr = document.createElement("tr");
      tr.dataset.matchId = m.id;

      tr.innerHTML = `
        <td>${m.table ?? ""}</td>
        <td>${escapeHtml(aName)}</td>
        <td>${escapeHtml(bName)}</td>
        <td>
          <select class="input" data-field="outcome" ${m.bId === null ? "disabled" : ""}>
            <option value="NONE" ${outcome==="NONE"?"selected":""}>Unscored</option>
            <option value="A" ${outcome==="A"?"selected":""}>A Wins</option>
            <option value="B" ${outcome==="B"?"selected":""}>B Wins</option>
            <option value="D" ${outcome==="D"?"selected":""}>Draw</option>
          </select>
        </td>
        <td class="noPrint">
          <input class="input" type="number" min="0" step="1" data-field="aVP" value="${aVP}" ${(!state.meta?.useVP || m.bId===null) ? "disabled" : ""}>
        </td>
        <td class="noPrint">
          <input class="input" type="number" min="0" step="1" data-field="bVP" value="${bVP}" ${(!state.meta?.useVP || m.bId===null) ? "disabled" : ""}>
        </td>
        <td class="noPrint">
          <span class="badge ${badgeClass(outcome)}">${badgeText(outcome)}</span>
        </td>
      `;

      host.appendChild(tr);
    } else {
      // div layout
      const row = el("div", { class: "pairingRow", "data-match-id": m.id }, [
        el("div", { class: "pairingHeader", html: `Table ${escapeHtml(m.table ?? "")}` }),
        el("div", { class: "muted", html: `${escapeHtml(aName)} <span class="muter">vs</span> ${escapeHtml(bName)}` }),
        el("div", { class: "hr" }),
        el("div", { class: "pairingControlsRow" }, [
          el("div", { class: "miniField" }, [
            el("div", { class: "miniLabel", html: "Outcome" }),
            (() => {
              const s = el("select", { class: "input", "data-field": "outcome" });
              const opts = [
                ["NONE", "Unscored"],
                ["A", "A Wins"],
                ["B", "B Wins"],
                ["D", "Draw"],
              ];
              for (const [v, t] of opts) {
                const o = document.createElement("option");
                o.value = v;
                o.textContent = t;
                if (v === outcome) o.selected = true;
                s.appendChild(o);
              }
              if (m.bId === null) s.disabled = true;
              return s;
            })()
          ]),
          el("div", { class: "miniField" }, [
            el("div", { class: "miniLabel", html: "VP A" }),
            (() => {
              const i = el("input", { class: "input", type: "number", min: "0", step: "1", value: String(aVP), "data-field": "aVP" });
              if (!state.meta?.useVP || m.bId === null) i.disabled = true;
              return i;
            })()
          ]),
          el("div", { class: "miniField" }, [
            el("div", { class: "miniLabel", html: "VP B" }),
            (() => {
              const i = el("input", { class: "input", type: "number", min: "0", step: "1", value: String(bVP), "data-field": "bVP" });
              if (!state.meta?.useVP || m.bId === null) i.disabled = true;
              return i;
            })()
          ]),
        ])
      ]);

      host.appendChild(row);
    }
  }
}

function badgeClass(outcome) {
  if (outcome === "A" || outcome === "B") return "good";
  if (outcome === "D") return "warn";
  if (outcome === "BYE") return "good";
  return "";
}
function badgeText(outcome) {
  if (outcome === "A") return "A WIN";
  if (outcome === "B") return "B WIN";
  if (outcome === "D") return "DRAW";
  if (outcome === "BYE") return "BYE";
  return "UNSCORED";
}

/* ---------------- Standings ---------------- */

function renderStandings(state) {
  const table = $("#standingsTable tbody") || $("#standingsTbody") || $("#standingsBody");
  if (!table) return;

  table.innerHTML = "";

  const list = computeStandings(state);

  for (const s of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.rank}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.faction || "")}</td>
      <td>${s.points}</td>
      <td>${escapeHtml(s.record)}</td>
      <td>${state.meta?.useVP ? s.vp : "-"}</td>
      <td>${s.sos}</td>
      <td>${escapeHtml((s.opponents || []).join(", "))}</td>
    `;
    table.appendChild(tr);
  }
}
