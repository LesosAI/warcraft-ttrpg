/** Mind Control's persistent identity and termination law. No Foundry imports.
 * Initiative placement is deliberately not inferred from the talent's wording. */
export const MIND_CONTROL_FLAG = 'mindControl';
const id = value => typeof value === 'string' && value.trim().length > 0;

/** Capture the original Casting Test's DC, never the caster's later statistics.
 * Token identity belongs in the actor UUID for synthetic actors. */
export function mindControlRecord(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const { casterUuid, targetUuid, messageUuid, resultUuid, dc } = input;
  if (![casterUuid, targetUuid, messageUuid, resultUuid].every(id)
    || !Number.isSafeInteger(dc) || dc < 0) return null;
  let turnIdentity;
  if (Object.hasOwn(input, 'turnIdentity')) {
    const pair = input.turnIdentity;
    if (!pair || typeof pair !== 'object') return null;
    turnIdentity = {};
    for (const key of ['caster', 'target']) {
      const ref = pair[key];
      if (ref === null) turnIdentity[key] = null;
      else if (ref && id(ref.sceneId) && id(ref.tokenId))
        turnIdentity[key] = { sceneId: ref.sceneId, tokenId: ref.tokenId };
      else return null;
    }
  }
  return { version: 1, casterUuid, targetUuid, messageUuid, resultUuid, dc,
    ...(turnIdentity ? { turnIdentity } : {}) };
}

/** Read only a mechanically active carrier belonging to this exact actor. */
export function mindControlOn(effect, targetUuid) {
  if (!id(targetUuid) || !effect || effect.disabled || effect.isSuppressed
    || effect.active === false || effect.duration?.expired === true) return null;
  const raw = effect.flags?.['azeroth-rpg']?.[MIND_CONTROL_FLAG];
  if (raw?.version !== 1 || raw.targetUuid !== targetUuid) return null;
  return mindControlRecord(raw);
}

/** Damage means a positive delivered amount, including damage absorbed by
 * temporary Health. A hit reduced to zero is not damage taken. */
export function mindControlEnds({ damage = 0, resisted = false } = {}) {
  return resisted === true || (typeof damage === 'number' && Number.isFinite(damage) && damage > 0);
}

/** A repeated Test belongs to the controlled creature's own completed turn.
 * The adapter supplies authoritative combat/turn identity, not a client clock. */
export function mindControlTurnKey({ combatUuid, round, turn, combatantId } = {}) {
  if (!id(combatUuid) || !id(combatantId) || !Number.isSafeInteger(round) || round < 1
    || !Number.isSafeInteger(turn) || turn < 0) return null;
  return JSON.stringify([combatUuid, round, turn, combatantId]);
}
