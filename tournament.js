// tournament.js
/**
 * Core tournament engine
 * - Swiss: pairs by standings, soft avoids repeats, fair byes
 * - Round Robin: circle method schedule, locked once generated
 * - Standings: points → (optional) VP → SoS → name
 * - Cut helpers included (seeding)
 *
 * IMPORTANT:
 * - Creating a round DOES NOT generate pairings.
 * - Pairings are generated ONLY when generatePairingsForRound(...) is called
 *   (i.e., when the user clicks "Generate Pairings").
 */

export function standings(state) {
  return computeStandings(state);
}

/**
 * Backward-compatible helper used by your current app.js:
 * Creates a new round ONLY (no pairings).
 */
export function nextRound(state) {
  const round = createNextRound(state);
  state.activeRoundId = round.id;
  return round;
}

/** -----------------------------
 * Public API for app wiring
 * ------------------------------ */

export function createNextRound(state, opts = {}) {
  const isCut = !!opts.isCut;

  const number = nextRoundNumber(state, isCut);
  const label = isCut ? `Cut Round ${number}` : `Round ${number}`;

  const round = {
    id: uid(),
    number,
    label,
    locked: false,
    isCut,
    pairings: [],
    // For cut rounds we can freeze seeds when created
    cutSeeds: null, // { cutSize, seeds:[playerId,...] }
  };

  if (!Array.isArray(state.rounds)) state.rounds = [];
  state.rounds.push(round);
  return round;
}

export function generatePairingsForRound(state, roundId) {
  const round = getRound(state, roundId);
  if (!round) return null;
  if (round.locked) return round;

  // Don’t regenerate if already has pairings (unless empty)
  if (Array.isArray(round.pairings) && round.pairings.length > 0) return round;

  const format = (state.meta?.format || "swiss").toLowerCase();

  // Cut rounds (or swiss_cut format) can seed bracket if cutSize >= 2
  if (round.isCut || format === "swiss_cut") {
    const cutSize = clampInt(state.meta?.cutSize, 0);
    if (cutSize >= 2) {
      return seedAndBuildCutRound(state, round, cutSize);
    }
    // fallback to swiss if no cut
  }

  if (format === "round_robin") {
    ensureRoundRobinSchedule(state);
    const rrRound = state.rr.schedule.rounds.find(r => r.number === round.number);
    if (!rrRound) {
      // If someone created more rounds than RR schedule, fallback swiss
      return buildSwissRound(state, round);
    }
    round.pairings = rrRound.pairings.map((p, idx) => ({
      id: uid(),
      table: idx + 1,
      aId: p.aId,
      bId: p.bId, // may be null (BYE)
      result: p.bId
        ? { outcome: "NONE", aVP: 0, bVP: 0 }
        : { outcome: "BYE", aVP: 0, bVP: 0 },
    }));
    return round;
  }

  // Default swiss/custom
  return buildSwissRound(state, round);
}

export function lockRound(state, roundId, locked = true) {
  const r = getRound(state, roundId);
  if (!r) return;
  r.locked = !!locked;
}

export function setMatchResult(state, roundId, matchId, outcome, aVP = 0, bVP = 0) {
  const r = getRound(state, roundId);
  if (!r) return;
  const m = (r.pairings || []).find(x => x.id === matchId);
  if (!m) return;
  if (r.locked) return;

  const o = String(outcome || "NONE").toUpperCase();
  const allowed = new Set(["NONE", "A", "B", "D", "BYE"]);
  m.result = {
    outcome: allowed.has(o) ? o : "NONE",
    aVP: clampInt(aVP, 0),
    bVP: clampInt(bVP, 0),
  };

  // If this is a BYE match, ensure bId is null and outcome BYE
  if (m.bId === null) {
    m.result.outcome = "BYE";
  }
}

/** -----------------------------
 * Standings + stats
 * ------------------------------ */

export function computeStandings(state) {
  const players = (state.players || []).map(p => ({
    id: p.id,
    name: p.name,
    faction: p.faction,
  }));

  const winPts = clampInt(state.meta?.scoring?.win, 3);
  const drawPts = clampInt(state.meta?.scoring?.draw, 1);
  const lossPts = clampInt(state.meta?.scoring?.loss, 0);
  const useVP = !!state.meta?.useVP;

  // Init stats map
  const stats = new Map();
  for (const p of players) {
    stats.set(p.id, {
      id: p.id,
      name: p.name,
      faction: p.faction,
      points: 0,
      vp: 0,
      w: 0,
      d: 0,
      l: 0,
      oppIds: new Set(),
      sos: 0,
    });
  }

  // Apply results for ALL rounds (cut rounds included by default; you can exclude later if desired)
  for (const rnd of (state.rounds || [])) {
    for (const match of (rnd.pairings || [])) {
      if (!match?.aId) continue;
      const a = stats.get(match.aId);
      if (!a) continue;

      const bId = match.bId === null ? null : match.bId;
      const b = bId ? stats.get(bId) : null;

      if (b) {
        a.oppIds.add(b.id);
        b.oppIds.add(a.id);
      }

      const res = match.result || { outcome: "NONE", aVP: 0, bVP: 0 };
      const aVP = clampInt(res.aVP, 0);
      const bVP = clampInt(res.bVP, 0);

      if (useVP) {
        a.vp += aVP;
        if (b) b.vp += bVP;
      }

      switch (String(res.outcome || "NONE").toUpperCase()) {
        case "A":
          a.points += winPts; a.w++;
          if (b) { b.points += lossPts; b.l++; }
          break;
        case "B":
          a.points += lossPts; a.l++;
          if (b) { b.points += winPts; b.w++; }
          break;
        case "D":
          a.points += drawPts; a.d++;
          if (b) { b.points += drawPts; b.d++; }
          break;
        case "BYE":
          a.points += winPts; a.w++;
          break;
        default:
          break;
      }
    }
  }

  // SoS = sum of opponent match points
  for (const s of stats.values()) {
    let sum = 0;
    for (const oppId of s.oppIds) {
      const opp = stats.get(oppId);
      if (opp) sum += opp.points;
    }
    s.sos = sum;
  }

  const list = [...stats.values()];
  list.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (useVP && y.vp !== x.vp) return y.vp - x.vp;
    if (y.sos !== x.sos) return y.sos - x.sos;
    return x.name.localeCompare(y.name);
  });

  // Add rank + opponents (names) convenience fields
  const nameById = new Map(players.map(p => [p.id, p.name]));
  return list.map((s, idx) => ({
    ...s,
    rank: idx + 1,
    record: `${s.w}-${s.d}-${s.l}`,
    opponents: [...s.oppIds].map(id => nameById.get(id) || id),
  }));
}

export function matchupHistory(state) {
  const set = new Set();
  for (const rnd of (state.rounds || [])) {
    for (const m of (rnd.pairings || [])) {
      if (m?.aId && m?.bId) {
        set.add(pairKey(m.aId, m.bId));
      }
    }
  }
  return set;
}

function pairKey(aId, bId) {
  return [String(aId), String(bId)].sort().join("|");
}

/** -----------------------------
 * Swiss pairing (soft avoid repeats)
 * ------------------------------ */

function buildSwissRound(state, round) {
  const ordered = computeStandings(state).map(s => s.id); // standings order
  const played = matchupHistory(state);

  // Choose bye if odd
  let ids = [...ordered];
  let byeId = null;

  if (ids.length % 2 === 1) {
    byeId = chooseSwissBye(state, ids);
    ids = ids.filter(id => id !== byeId);
  }

  const pairs = swissPair(ids, played);

  // Build matches
  const pairings = [];
  let table = 1;

  for (const [aId, bId] of pairs) {
    pairings.push({
      id: uid(),
      table,
      aId,
      bId,
      result: { outcome: "NONE", aVP: 0, bVP: 0 },
    });
    table++;
  }

  if (byeId) {
    // Track bye history
    ensureByeHistory(state);
    if (!state.history.byePlayerIds.includes(byeId)) {
      state.history.byePlayerIds.push(byeId);
    }

    pairings.push({
      id: uid(),
      table,
      aId: byeId,
      bId: null,
      result: { outcome: "BYE", aVP: 0, bVP: 0 },
    });
  }

  round.pairings = pairings;
  return round;
}

function chooseSwissBye(state, orderedIds) {
  // Fair bye: prefer lowest-ranked who hasn't had a bye yet; soft rule
  ensureByeHistory(state);
  const hadBye = new Set(state.history.byePlayerIds || []);

  for (let i = orderedIds.length - 1; i >= 0; i--) {
    const id = orderedIds[i];
    if (!hadBye.has(id)) return id;
  }
  // Everyone has had one -> just lowest-ranked
  return orderedIds[orderedIds.length - 1] || null;
}

function swissPair(ids, playedSet) {
  // Soft avoid repeats:
  // Greedy: for each player in order, pick the first opponent they haven't played.
  // If none available, allow a repeat (best effort).
  const remaining = [...ids];
  const pairs = [];

  while (remaining.length > 1) {
    const a = remaining.shift();
    let idx = -1;

    // Prefer opponent not previously played
    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i];
      if (!playedSet.has(pairKey(a, b))) {
        idx = i;
        break;
      }
    }

    // If none, allow repeat (soft)
    if (idx === -1) idx = 0;

    const b = remaining.splice(idx, 1)[0];
    pairs.push([a, b]);
  }

  return pairs;
}

function ensureByeHistory(state) {
  if (!state.history) state.history = { byePlayerIds: [] };
  if (!Array.isArray(state.history.byePlayerIds)) state.history.byePlayerIds = [];
}

/** -----------------------------
 * Round Robin schedule (circle method)
 * ------------------------------ */

export function ensureRoundRobinSchedule(state) {
  if (!state.rr) state.rr = { scheduleLocked: false, schedule: null };

  if (state.rr.scheduleLocked && state.rr.schedule) return state.rr.schedule;

  const ids = (state.players || []).map(p => p.id);
  const schedule = buildRoundRobinSchedule(ids);

  state.rr.schedule = schedule;
  state.rr.scheduleLocked = true;
  return schedule;
}

function buildRoundRobinSchedule(playerIds) {
  const ids = [...playerIds];

  // If odd, add BYE (null)
  if (ids.length % 2 === 1) ids.push(null);

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;

  // circle method: fix first, rotate the rest
  const fixed = ids[0];
  let rot = ids.slice(1);

  const scheduleRounds = [];

  for (let r = 1; r <= rounds; r++) {
    const left = [fixed, ...rot.slice(0, half - 1)];
    const right = [...rot.slice(half - 1)].reverse();

    const pairings = [];
    for (let i = 0; i < half; i++) {
      const aId = left[i];
      const bId = right[i];

      // If BYE involved, represent as null opponent
      if (aId === null && bId === null) continue;
      if (aId === null) pairings.push({ aId: bId, bId: null });
      else if (bId === null) pairings.push({ aId: aId, bId: null });
      else pairings.push({ aId, bId });
    }

    scheduleRounds.push({ number: r, pairings });

    // rotate: take last, put in front
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }

  return { roundCount: rounds, rounds: scheduleRounds };
}

/** -----------------------------
 * Cut seeding helpers
 * ------------------------------ */

function seedAndBuildCutRound(state, round, cutSize) {
  // Freeze seeds on first use so they can't change if swiss standings update later
  if (!round.cutSeeds) {
    const seeds = computeStandings(state).slice(0, cutSize).map(s => s.id);
    round.cutSeeds = { cutSize, seeds };
  }

  const seeds = round.cutSeeds.seeds;

  // Bracket pairing: 1vN, 2v(N-1), ...
  const pairs = [];
  for (let i = 0; i < Math.floor(seeds.length / 2); i++) {
    pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
  }

  round.pairings = pairs.map((p, idx) => ({
    id: uid(),
    table: idx + 1,
    aId: p[0],
    bId: p[1],
    result: { outcome: "NONE", aVP: 0, bVP: 0 },
  }));

  return round;
}

/** -----------------------------
 * Utilities
 * ------------------------------ */

function getRound(state, roundId) {
  return (state.rounds || []).find(r => r.id === roundId) || null;
}

function nextRoundNumber(state, isCut) {
  const rounds = (state.rounds || []).filter(r => !!r.isCut === !!isCut);
  const max = rounds.reduce((m, r) => Math.max(m, clampInt(r.number, 0)), 0);
  return max + 1;
}

function clampInt(v, d = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
