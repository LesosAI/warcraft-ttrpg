/** Classic 2252/2287: tabletop adaptation, not a direct level/stat conversion. */
export const CRUSHRIDGE = Object.freeze({
  donorAbility: "Crushridge Kin", recipientAbility: "Fallen-Kin Rage",
  helpAbility: "Call for Kin", feet: 30, seconds: 120, meleeDamage: 2,
  extraAttacks: 1
});
const finite = value => typeof value === "number" && Number.isFinite(value);

/** Only a witnessed living-to-dead transition constitutes a new death event.
 * Runtime records each event identity before applying effects. */
export function crushridgeDeath(previousHealth, currentHealth) {
  return finite(previousHealth) && finite(currentHealth) && previousHealth > 0 && currentHealth <= 0;
}

export function crushridgeHelpDue({ previous, current, maximum, used = false } = {}) {
  return !used && [previous, current, maximum].every(finite) && maximum > 0
    && previous > maximum / 2 && current > 0 && current <= maximum / 2;
}

/** Alliance and visibility are adjudicated by the GM, never inferred from a
 * token's name or disposition. Distinct linked tokens remain distinct bodies. */
export function crushridgeRecipients(candidates = []) {
  if (!Array.isArray(candidates) || candidates.some(t => !t?.tokenUuid || !t.actorUuid
    || !finite(t.feet) || t.feet < 0)
    || new Set(candidates.map(t => t.tokenUuid)).size !== candidates.length) return null;
  return candidates.filter(t => t.alive === true && t.kin === true && t.sameLevel === true
    && t.witnessed === true && t.recipient === true && t.feet <= CRUSHRIDGE.feet)
    .map(t => ({ tokenUuid: t.tokenUuid, actorUuid: t.actorUuid }));
}

/** Repeated deaths refresh one carrier, never accumulate damage or attacks. */
export function crushridgeRage(now) {
  return finite(now) ? { startedAt: now, expiresAt: now + CRUSHRIDGE.seconds,
    meleeDamage: CRUSHRIDGE.meleeDamage, extraAttacks: CRUSHRIDGE.extraAttacks } : null;
}

export function crushridgeRageActive(rage, now) {
  return !!rage && [rage.startedAt, rage.expiresAt, now].every(finite)
    && now >= rage.startedAt && now < rage.expiresAt;
}

/** Read active carriers at roll time. Duplicate effects never multiply the
 * bonus, and stored modifier values cannot override this rule's fixed amount. */
export function crushridgeMeleeBonus(actor, { kind, parry = false, rangeKind, now } = {}) {
  if (actor?.type !== "npc" || kind !== "attack" || parry || rangeKind !== "melee"
    || !(actor.system?.health?.value > 0)
    || !actor.system?.creatureAbilities?.some(row => row.name === CRUSHRIDGE.recipientAbility)) return 0;
  const active = [...(actor.effects?.values?.() ?? actor.effects ?? [])].some(effect =>
    effect.active !== false && effect.disabled !== true && effect.isSuppressed !== true && effect.duration?.expired !== true
    && crushridgeRageActive(effect.flags?.["azeroth-rpg"]?.crushridgeRage, now));
  return active ? CRUSHRIDGE.meleeDamage : 0;
}

/** A separate per-combatant receipt survives rage refresh. The caller must
 * persist this claim before opening the extra attack and never retry an
 * uncertain roll automatically. It is not an addition to general Actions. */
export function crushridgeExtraAttack({ rage, now, combat, combatantId, tokenUuid,
  alive = false, incapacitated = false, melee = false, spent = [] } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!crushridgeRageActive(rage, now)) return refuse("notEnraged");
  if (!alive || incapacitated) return refuse("incapacitated");
  if (!melee) return refuse("meleeOnly");
  if (!combat?.started || typeof combat.id !== "string" || !combat.id
    || !Number.isInteger(combat.round) || combat.round < 1
    || typeof combatantId !== "string" || !combatantId || typeof tokenUuid !== "string" || !tokenUuid
    || combat.currentCombatantId !== combatantId) return refuse("ownTurnOnly");
  if (!Array.isArray(spent)) return refuse("receiptInvalid");
  const claim = { combatId: combat.id, round: combat.round, combatantId, tokenUuid };
  // A moved/replaced token must not create another attack for the same slot.
  if (spent.some(mark => mark?.combatId === claim.combatId && mark.round === claim.round
    && mark.combatantId === claim.combatantId)) return refuse("alreadySpent");
  return { ok: true, claim };
}
