/**
 * tournament.js
 * Core engine with improved Swiss Pairing and Tie-breaking
 */

export function standings(state) {
  return computeStandings(state);
}

export function nextRound(state) {
  const round = createNextRound(state);
  state.activeRoundId = round.id;
  return round;
}

/** -----------------------------
 * Public API
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
    cutSeeds: null, 
  };

  if (!Array.isArray(state.rounds)) state.rounds = [];
  state.rounds.push(round);
  return round;
}

export function generatePairingsForRound(state, roundId) {
  const round = getRound(state, roundId);
  if (!round || round.locked) return round;

  const playerCount = (state.players || []).length;
  if (playerCount < 2) return round;

  const expected = Math.ceil(playerCount / 2);
  const existing = Array.isArray(round.pairings) ? round.pairings : [];
  const hasResults = existing.some(m => (m?.result?.outcome || "NONE") !== "NONE");

  // Prevent overwriting if results are already in
  if (existing.length >= expected && hasResults) return round;

  round.pairings = [];
  const format = (state.meta?.format || "swiss").toLowerCase();

  if (round.isCut || format === "swiss_cut") {
    const cutSize = parseInt(state.meta?.cutSize || 0);
    if (cutSize >= 2) return seedAndBuildCutRound(state, round, cutSize);
  }

  if (format === "round_robin") {
    ensureRoundRobinSchedule(state);
    const rrRound = state.rr.schedule.rounds.find(r => r.number === round.number);
    if (rrRound) {
      round.pairings = rrRound.pairings.map((p, idx) => ({
        id: uid(),
        table: idx + 1,
        aId: p.aId,
        bId: p.bId,
        result: p.bId ? { outcome: "NONE", aVP: 0, bVP: 0 } : { outcome: "BYE", aVP: 0, bVP: 0 },
      }));
      return round;
    }
  }

  // Default to Swiss
  return buildSwissRound(state, round);
}

/* ---------------- Standings Calculation ---------------- */

export function computeStandings(state) {
  const players = (state.players || []);
  const winPts = parseInt(state.meta?.scoring?.win ?? 3);
  const drawPts = parseInt(state.meta?.scoring?.draw ?? 1);
  const useVP = !!state.meta?.useVP;

  const stats = new Map(players.map(p => [p.id, {
    id: p.id, name: p.name, faction: p.faction,
    points: 0, vp: 0, w: 0, d: 0, l: 0, oppIds: new Set(), sos: 0
  }]));

  for (const rnd of (state.rounds || [])) {
    for (const m of (rnd.pairings || [])) {
      const a = stats.get(m.aId);
      const b = m.bId ? stats.get(m.bId) : null;
      if (!a) continue;

      if (b) {
        a.oppIds.add(b.id);
        b.oppIds.add(a.id);
      }

      const res = m.result || { outcome: "NONE" };
      if (useVP) {
        a.vp += (res.aVP || 0);
        if (b) b.vp += (res.bVP || 0);
      }

      const out = String(res.outcome).toUpperCase();
      if (out === "A") { a.points += winPts; a.w++; if(b) b.l++; }
      else if (out === "B") { if(b) { b.points += winPts; b.w++; } a.l++; }
      else if (out === "D") { a.points += drawPts; a.d++; if(b) { b.points += drawPts; b.d++; } }
      else if (out === "BYE") { a.points += winPts; a.w++; }
    }
  }

  // Calculate Strength of Schedule (SoS)
  stats.forEach(s => {
    s.sos = Array.from(s.oppIds).reduce((sum, id) => sum + (stats.get(id)?.points || 0), 0);
  });

  return Array.from(stats.values())
    .sort((x, y) => (y.points - x.points) || (useVP && y.vp - x.vp) || (y.sos - x.sos) || x.name.localeCompare(y.name))
    .map((s, i) => ({ ...s, rank: i + 1, record: `${s.w}-${s.d}-${s.l}`, opponents: Array.from(s.oppIds).map(id => stats.get(id).name) }));
}

/* ---------------- Swiss Pairing Engine ---------------- */

function buildSwissRound(state, round) {
  const playerIds = (state.players || []).map(p => p.id);

  if (round.number === 1 && !round.isCut) {
    return buildRandomRound(state, round, playerIds);
  }

  // Rank players by current standings
  const orderedStandings = computeStandings(state);
  let ids = orderedStandings.map(s => s.id);
  const played = matchupHistory(state);

  // Handle BYE (lowest ranked player who hasn't had a bye)
  let byeId = null;
  if (ids.length % 2 === 1) {
    byeId = chooseSwissBye(state, ids);
    ids = ids.filter(id => id !== byeId);
  }

  // Pair top-down
  const pairs = swissPair(ids, played);
  
  round.pairings = pairs.map(([aId, bId], i) => ({
    id: uid(),
    table: i + 1,
    aId, bId,
    result: { outcome: "NONE", aVP: 0, bVP: 0 }
  }));

  if (byeId) {
    trackBye(state, byeId);
    round.pairings.push({
      id: uid(), table: round.pairings.length + 1,
      aId: byeId, bId: null,
      result: { outcome: "BYE", aVP: 0, bVP: 0 }
    });
  }

  return round;
}

function swissPair(ids, playedSet) {
  const pool = [...ids];
  const pairs = [];

  while (pool.length > 1) {
    const a = pool.shift();
    let matchIdx = -1;

    // Look for someone haven't played yet
    for (let i = 0; i < pool.length; i++) {
      if (!playedSet.has(pairKey(a, pool[i]))) {
        matchIdx = i;
        break;
      }
    }

    // If repeat is unavoidable, take the next closest rank
    const b = pool.splice(matchIdx === -1 ? 0 : matchIdx, 1)[0];
    pairs.push([a, b]);
  }
  return pairs;
}

/* ---------------- Helpers ---------------- */

function buildRandomRound(state, round, ids) {
  const pool = shuffle([...ids]);
  const pairings = [];
  if (pool.length % 2 === 1) {
    const byeId = pool.pop();
    trackBye(state, byeId);
    pairings.push({ id: uid(), table: Math.ceil(ids.length/2), aId: byeId, bId: null, result: { outcome: "BYE" } });
  }
  
  for (let i = 0; pool.length > 0; i++) {
    pairings.unshift({ id: uid(), table: i + 1, aId: pool.shift(), bId: pool.shift(), result: { outcome: "NONE" } });
  }
  round.pairings = pairings.sort((a, b) => a.table - b.table);
  return round;
}

function chooseSwissBye(state, orderedIds) {
  const hadBye = new Set(state.history?.byePlayerIds || []);
  for (let i = orderedIds.length - 1; i >= 0; i--) {
    if (!hadBye.has(orderedIds[i])) return orderedIds[i];
  }
  return orderedIds[orderedIds.length - 1];
}

function trackBye(state, id) {
  if (!state.history) state.history = { byePlayerIds: [] };
  if (!state.history.byePlayerIds.includes(id)) state.history.byePlayerIds.push(id);
}

function matchupHistory(state) {
  const set = new Set();
  (state.rounds || []).forEach(r => {
    (r.pairings || []).forEach(m => {
      if (m.aId && m.bId) set.add(pairKey(m.aId, m.bId));
    });
  });
  return set;
}

function pairKey(a, b) { return [String(a), String(b)].sort().join("|"); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRound(state, id) { return (state.rounds || []).find(r => r.id === id); }

function nextRoundNumber(state, isCut) {
  const count = (state.rounds || []).filter(r => !!r.isCut === isCut).length;
  return count + 1;
}

function uid() { return Math.random().toString(16).substring(2, 10); }

function seedAndBuildCutRound(state, round, cutSize) {
  const seeds = computeStandings(state).slice(0, cutSize).map(s => s.id);
  const pairs = [];
  // Standard bracket seeding (1st vs Last, 2nd vs 2nd Last)
  for (let i = 0; i < Math.floor(seeds.length / 2); i++) {
    pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
  }
  round.pairings = pairs.map((p, i) => ({ id: uid(), table: i + 1, aId: p[0], bId: p[1], result: { outcome: "NONE" } }));
  return round;
}

/**
 * Updates a specific match result within a round
 */
export function setMatchResult(state, roundId, matchId, outcome, aVP = 0, bVP = 0) {
    const round = getRound(state, roundId);
    if (!round || round.locked) return;

    const match = round.pairings.find(m => m.id === matchId);
    if (!match) return;

    match.result = {
        outcome: outcome.toUpperCase(), // "A", "B", "D", "BYE", or "NONE"
        aVP: parseInt(aVP) || 0,
        bVP: parseInt(bVP) || 0
    };
}

/**
 * Prevents further changes to a round's results
 */
export function lockRound(state, roundId, lockState = true) {
    const round = getRound(state, roundId);
    if (round) {
        round.locked = lockState;
    }
}
