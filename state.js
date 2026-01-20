// state.js
export const STORAGE_KEY = "40k_ops_state_v1";

/**
 * State model (v1)
 * - Keeps top-level `name` for backward compatibility with your current app.js
 * - Real config lives in `meta`
 */
export function defaultState() {
  return {
    version: 1,

    // Backward compatible
    name: "",

    meta: {
      name: "",
      date: isoToday(),
      format: "swiss", // swiss | round_robin | swiss_cut | custom
      roundsPlanned: 3,
      cutSize: 0, // 0/2/4/8
      scoring: { win: 3, draw: 1, loss: 0 },
      useVP: true, // if false, VP ignored as tiebreak
      notes: "",
    },

    players: [
      // { id, name, faction }
    ],

    rounds: [
      // {
      //   id, number, label, locked, isCut,
      //   pairings: [
      //     { id, table, aId, bId|null, result:{ outcome:"NONE|A|B|D|BYE", aVP, bVP } }
      //   ]
      // }
    ],

    activeRoundId: null,

    rr: {
      scheduleLocked: false,
      // schedule: { roundCount, rounds: [ { number, pairings:[{aId,bId|null}] } ] }
      schedule: null,
    },

    history: {
      // ids of players who received a BYE at least once
      byePlayerIds: [],
    },
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  const s = migrateState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/**
 * Ensures old saves don’t crash new logic.
 * Also keeps `state.name` and `state.meta.name` in sync.
 */
export function migrateState(state) {
  const s = state && typeof state === "object" ? state : defaultState();

  if (!("version" in s)) s.version = 1;
  if (!s.meta) s.meta = defaultState().meta;
  if (!s.players) s.players = [];
  if (!s.rounds) s.rounds = [];
  if (!s.rr) s.rr = { scheduleLocked: false, schedule: null };
  if (!s.history) s.history = { byePlayerIds: [] };
  if (!Array.isArray(s.history.byePlayerIds)) s.history.byePlayerIds = [];

  // Backward compat: keep these consistent
  if (typeof s.name !== "string") s.name = "";
  if (typeof s.meta.name !== "string") s.meta.name = "";

  // Prefer whichever is non-empty
  const chosen = (s.meta.name || s.name || "").trim();
  s.name = chosen;
  s.meta.name = chosen;

  // Ensure player objects shape
  s.players = s.players
    .filter(p => p && typeof p === "object")
    .map(p => ({
      id: String(p.id || uid()),
      name: String(p.name || "").trim(),
      faction: String(p.faction || "").trim(),
    }))
    .filter(p => p.name.length > 0);

  // Ensure rounds shape
  s.rounds = s.rounds
    .filter(r => r && typeof r === "object")
    .map((r, idx) => ({
      id: String(r.id || uid()),
      number: Number.isFinite(+r.number) ? +r.number : (idx + 1),
      label: String(r.label || `Round ${idx + 1}`),
      locked: !!r.locked,
      isCut: !!r.isCut,
      pairings: Array.isArray(r.pairings)
        ? r.pairings.map((m, mi) => ({
            id: String(m.id || uid()),
            table: Number.isFinite(+m.table) ? +m.table : (mi + 1),
            aId: m.aId ? String(m.aId) : null,
            bId: m.bId === null ? null : (m.bId ? String(m.bId) : null),
            result: normalizeResult(m.result),
          }))
        : [],
    }));

  if (s.activeRoundId && !s.rounds.some(r => r.id === s.activeRoundId)) {
    s.activeRoundId = null;
  }

  return s;
}

function normalizeResult(res) {
  const r = res && typeof res === "object" ? res : {};
  const outcome = String(r.outcome || "NONE").toUpperCase();
  const allowed = new Set(["NONE", "A", "B", "D", "BYE"]);
  return {
    outcome: allowed.has(outcome) ? outcome : "NONE",
    aVP: clampInt(r.aVP, 0),
    bVP: clampInt(r.bVP, 0),
  };
}

function clampInt(v, d = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
