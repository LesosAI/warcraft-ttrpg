import {talentEffect} from "./talent-effects.mjs";

/** The return arc prefers living flesh, not undead, constructs or elementals. */
export function chainLightningLiving({ creatureType = null, race = null, statuses = [] } = {}) {
  return !statuses.includes("dead") && String(race ?? "").toLowerCase() !== "forsaken"
    && !["undead", "construct", "elemental"].includes(String(creatureType ?? "").toLowerCase());
}

/** 07: one initial hit and two arcs; 04: one additional arc per Shaman talent rank. */
export function chainLightningLimits(talents=[]) {
  let bonus=0;
  for(const talent of talents ?? []) {
    if(talent?.className!=="Shaman" || talent?.identifier!=="chain-lightning")continue;
    const rank=Math.min(2,Math.max(0,Math.trunc(Number(talent.taken))||0));
    const perRank=talentEffect(talent.className,talent.identifier)?.arcBonus ?? 0;
    bonus=Math.max(bonus,rank*perRank);
  }
  return {arcs:2+bonus,hits:3+bonus,arcRange:15};
}

export function chainLightningTargetRefusal(spell,targets,talents=[]) {
  const system=spell?.system ?? spell ?? {};
  const matches=system.identifier==="chain-lightning" || (!system.identifier && spell?.name==="Chain Lightning");
  if(!matches || !Array.isArray(targets))return null;
  const limit=chainLightningLimits(talents);
  return targets.length>limit.hits ? {reason:"tooMany",max:limit.hits,selected:targets.length} : null;
}

/** Ordered hits, measured by the caller in feet. Creature ids identify tokens,
 * not actors: two unlinked creatures sharing a base actor remain distinct.
 * Eligibility/scene visibility is resolved by the authoritative caller, never
 * by filtering to enemies. Unknown distances are not permission to jump.
 */
export function chainLightningPath({firstId, rodId = null, creatures = [], talents = [], distance} = {}) {
  const candidates = [...new Map(creatures.filter(c => c?.id && c.eligible !== false).map(c => [c.id, c])).values()];
  // Lightning Rod replaces the initial target. Its final return is still an
  // arc, so the ordinary 15-foot reach applies (lead decisions, 2026-10-30).
  const first = candidates.find(c => c.id === (rodId ?? firstId));
  if (!first || typeof distance !== "function") return [];
  const {hits, arcRange} = chainLightningLimits(talents);
  const path = [first.id];
  const struck = new Set(path);
  let previous = first;
  while (path.length < hits) {
    let measured;
    try {
      measured = candidates.filter(c => c.id !== previous.id).map(creature => ({creature, feet: distance(previous, creature)}));
    } catch { return []; }
    // An unmeasurable creature could be nearer than every measured one.
    // Refuse the whole preparation rather than inventing a shorter/different
    // chain that could be paid for before the geometry failure is noticed.
    if (measured.some(row => typeof row.feet !== "number" || !Number.isFinite(row.feet) || row.feet < 0)) return [];
    const reachable = measured.filter(row => row.feet <= arcRange);
    if (rodId && path.length === hits - 1) {
      const last = reachable.find(row => row.creature.id === rodId);
      if (last) path.push(last.creature.id);
      break;
    }
    let pool = reachable.filter(row => !struck.has(row.creature.id));
    if (!pool.length) {
      pool = reachable.filter(row => struck.has(row.creature.id));
      const living = pool.filter(row => row.creature.living === true);
      if (living.length) pool = living;
    }
    // Equal-distance ties use stable token ids so a retry cannot change the path.
    pool.sort((a,b) => a.feet - b.feet || String(a.creature.id).localeCompare(String(b.creature.id)));
    if (!pool.length) break;
    previous = pool[0].creature;
    path.push(previous.id);
    struck.add(previous.id);
  }
  return path;
}
