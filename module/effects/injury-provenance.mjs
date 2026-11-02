/** Capture at the injury roll, before a later Suffer click can change fights. */
export function injuryFightOf(actor, fight = undefined) {
  if (fight === undefined) {
    // game.combat is the tracker selection, which can be another fight after
    // a reset. Resolve membership instead; multiple matches are ambiguous.
    const fights = [...(globalThis.game?.combats?.values?.() ?? [])]
      .filter(row => row.started && row.getCombatantsByActor?.(actor)?.length);
    if (fights.length !== 1) return null;
    fight = fights[0];
  }
  if (!actor || !fight?.started || !fight.uuid) return null;
  if (!fight.getCombatantsByActor?.(actor)?.length) return null;
  const encounter = fight.getFlag?.('azeroth-rpg','injuryEncounter');
  if (typeof encounter !== 'string' || !encounter) return null;
  return { combatUuid: fight.uuid, encounter, round: fight.round, turn: fight.turn };
}

/** Legacy cards have unknown provenance; never relabel them as this fight. */
export function injuryProvenance({ messageId = null, message = null, actor, fight } = {}) {
  if (!messageId) return injuryFightOf(actor, fight);
  const flags = message?.flags?.['azeroth-rpg'];
  const source = flags?.kind === 'critical' ? flags.injuryFight : null;
  if (!source || typeof source.combatUuid !== 'string' || !source.combatUuid
    || typeof source.encounter !== 'string' || !source.encounter
    || !Number.isInteger(source.round) || source.round < 1) return null;
  return structuredClone(source);
}

/** Unknown legacy provenance is left for GM review, never guessed from age. */
export function injuriesFromFight(effects, source) {
  if (!source?.combatUuid || !source?.encounter) return [];
  return [...(effects ?? [])].filter(effect => {
    const flags = effect.flags?.['azeroth-rpg'];
    return flags?.injury === true && flags.injuryFight?.combatUuid === source.combatUuid
      && flags.injuryFight?.encounter === source.encounter;
  });
}
