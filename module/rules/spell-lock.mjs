/** Spell Lock is tied to one declared Casting Test. It is not a stored Bane
 * on the caster's next spell and never retroactively cancels a resolved cast. */
export const SPELL_LOCK = Object.freeze({ name: "Spell Lock", feet: 30, banes: 1, dc: 14,
  action: "reaction", uses: 1, per: "short", resilience: "spirit", seconds: 6 });
const identity = value => typeof value === "string" && value.trim().length > 0;

/** Geometry, visibility, ownership and Reaction budget are measured by the
 * GM adapter. Missing measurements refuse the offer rather than guessing. */
export function spellLockEligible({ reactorUuid, casterUuid, reactorType, health, casterHealth,
  uses, canReact, casting, visible, feet, sameScene, sameLevel } = {}) {
  return identity(reactorUuid) && identity(casterUuid) && reactorUuid !== casterUuid && reactorType === "npc"
    && Number.isFinite(health) && health > 0 && Number.isFinite(casterHealth) && casterHealth > 0
    && Number.isInteger(uses) && uses > 0 && canReact === true && casting === true
    && visible === true && sameScene === true && sameLevel === true
    && Number.isFinite(feet) && feet >= 0 && feet <= SPELL_LOCK.feet;
}

function applies(claim, cast) {
  return identity(cast?.id) && identity(cast?.casterUuid) && identity(claim?.reactorUuid)
    && claim.reactorUuid !== cast.casterUuid && claim.castId === cast.id && claim.casterUuid === cast.casterUuid
    && claim.stage === "paid" && claim.reactionPaid === true && claim.usePaid === true;
}

/** Snapshot this result before rolling. Separate felhunters can each react;
 * duplicated receipts from the same felhunter never add another Bane. */
export function spellLockBanes(claims = [], cast = {}) {
  if (cast.phase !== "open") return { banes: 0, reactors: [] };
  const reactors = [...new Set((Array.isArray(claims) ? claims : []).filter(claim => applies(claim, cast)).map(claim => claim.reactorUuid))].sort();
  return { banes: reactors.length * SPELL_LOCK.banes, reactors };
}

/** After the current cast resolves, resolve Spirit resistance independently
 * of whether that cast succeeded. Immunity prevents Silence, not the Bane. */
export function spellLockAftermath(claim, cast = {}, { resistancePassed, silenceImmune = false } = {}) {
  if (cast.phase !== "resolved" || !applies(claim, cast)) return null;
  return {
    resist: { resilience: SPELL_LOCK.resilience, dc: SPELL_LOCK.dc },
    silence: resistancePassed === false && silenceImmune === false,
    until: "endOfNextTurn", seconds: SPELL_LOCK.seconds
  };
}
