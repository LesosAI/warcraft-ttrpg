/**
 * Pure derived bag-slot redistribution for Pilgrims' Burden.
 *
 * `participants` is keyed by actor UUID and contains the ordinary carried-slot
 * ledger result: `{load, capacity, sceneId}`. `distances` is keyed by cast id,
 * then source UUID, then target UUID, and contains measured feet. The function
 * never reads or writes items, pounds, or containers and never changes normal
 * capacity. A transferred load can exceed that capacity; the caller's ordinary
 * encumbrance rule evaluates the returned load against the unchanged capacity.
 *
 * A link lends the requested occupied bag slots of burden from its source to
 * its target. The physical items stay where they are. Expired or out-of-range
 * links are inactive and the ordinary loads are returned unchanged. Any
 * participant collision invalidates every colliding link; input ordering
 * cannot choose a winner.
 */

const validSlots = value => Number.isInteger(value) && value > 0 && value <= 2;
const validCount = value => Number.isInteger(value) && value >= 0;
const distanceFor = (distances, link) => distances?.[link.cast]?.[link.sourceUuid]?.[link.targetUuid];

/** Re-evaluate encumbrance without moving anything between physical wells.
 * `over` includes items that fit no eligible panel, so spare capacity elsewhere
 * must not erase it. Relief first carries that existing excess; added abstract
 * burden occupies spare total capacity before adding further excess. */
export function burdenLoadState(ledger, countedLoad) {
  if (!validCount(ledger?.used) || !validCount(ledger?.capacity)
    || !validCount(ledger?.over) || !validCount(countedLoad)) return null;
  const delta = countedLoad - ledger.used;
  const over = delta < 0 ? Math.max(0, ledger.over + delta)
    : Math.max(ledger.over, countedLoad - ledger.capacity);
  const state = countedLoad > ledger.capacity * 2 ? "overloaded"
    : over > 0 ? "encumbered" : "unencumbered";
  return {used: countedLoad, physicalUsed: ledger.used, capacity: ledger.capacity, over, state, shared: delta};
}

function result(loads, accepted, suspended, rejected) {
  return Object.freeze({
    loads: Object.freeze(loads),
    accepted: Object.freeze(accepted),
    suspended: Object.freeze(suspended),
    rejected: Object.freeze(rejected)
  });
}

/**
 * Redistribute derived bag slots over the currently active links.
 *
 * @param {{participants: Record<string,{load:number,capacity:number,sceneId:string}>, links: Array<object>, distances: object, now: number}} input
 * @returns {{loads: Record<string,number>, accepted: object[], suspended: object[], rejected: object[]}}
 */
export function redistributePilgrimsBurden({participants = {}, links = [], distances = {}, now = 0} = {}) {
  const loads = Object.fromEntries(Object.entries(participants).map(([uuid, p]) => [uuid, p?.load]));
  const accepted = [];
  const suspended = [];
  const rejected = [];
  const active = [];

  for (const link of links) {
    const {cast, sourceUuid, targetUuid, expiresAt} = link ?? {};
    if (!cast || !sourceUuid || !targetUuid || sourceUuid === targetUuid) {
      rejected.push({link, reason: "invalid-pair"});
      continue;
    }
    if (!validSlots(link.slots)) {
      rejected.push({link, reason: "invalid-slots"});
      continue;
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      suspended.push({link, reason: "expired"});
      continue;
    }
    const source = participants[sourceUuid];
    const target = participants[targetUuid];
    if (!source || !target || !validCount(source.load) || !validCount(target.load)
      || !validCount(source.capacity) || !validCount(target.capacity)) {
      rejected.push({link, reason: "invalid-participant"});
      continue;
    }
    active.push({link, source, target});
  }

  // A cast can involve at most six distinct participants.
  const byCast = new Map();
  for (const entry of active) {
    const set = byCast.get(entry.link.cast) ?? new Set();
    set.add(entry.link.sourceUuid);
    set.add(entry.link.targetUuid);
    byCast.set(entry.link.cast, set);
  }
  const tooLarge = new Set([...byCast].filter(([, set]) => set.size > 6).map(([cast]) => cast));

  const uses = new Map();
  for (const entry of active) {
    for (const uuid of [entry.link.sourceUuid, entry.link.targetUuid]) {
      const rows = uses.get(uuid) ?? [];
      rows.push(entry);
      uses.set(uuid, rows);
    }
  }
  const conflicting = new Set();
  for (const rows of uses.values()) if (rows.length > 1) for (const row of rows) conflicting.add(row);

  for (const entry of active) {
    const {link} = entry;
    if (tooLarge.has(link.cast)) {
      rejected.push({link, reason: "cast-participant-limit"});
      continue;
    }
    if (conflicting.has(entry)) {
      rejected.push({link, reason: "participant-already-linked"});
      continue;
    }
    // Suspension does not release a pair. Count every unexpired pairing
    // before measuring, so moving away cannot permit a second binding.
    if (!entry.source.sceneId || entry.source.sceneId !== entry.target.sceneId) {
      suspended.push({link, reason: "different-scene"});
      continue;
    }
    const distanceFt = distanceFor(distances, link);
    if (!Number.isFinite(distanceFt) || distanceFt < 0) {
      rejected.push({link, reason: "missing-distance"});
      continue;
    }
    if (distanceFt > 30) {
      suspended.push({link, reason: "out-of-range", distanceFt});
      continue;
    }
    accepted.push(entry);
  }

  // Derive from a snapshot. Since accepted links have disjoint endpoints, no
  // item load can be passed onward or counted twice.
  const deltas = Object.fromEntries(Object.keys(participants).map(uuid => [uuid, 0]));
  const capacitySafe = [];
  for (const entry of accepted) {
    const {link} = entry;
    const transfer = Math.min(link.slots, entry.source.load);
    deltas[link.sourceUuid] -= transfer;
    deltas[link.targetUuid] += transfer;
    capacitySafe.push({link, transfer});
  }

  for (const [uuid, p] of Object.entries(participants)) {
    if (validCount(p?.load)) loads[uuid] = p.load + deltas[uuid];
  }
  return result(loads, capacitySafe, suspended, rejected);
}
