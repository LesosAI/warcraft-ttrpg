import { hasAncientDread } from "./ancient-dread.mjs";
import { frostShotEffect } from "./frost-shot.mjs";

/** Watery Invader's Chilled slows melee attacks, independently of Slowed's
 * movement penalty. The carrier is removed by the timed-effect lifecycle. */
export const CHILLED_FLAG = "chilled";

export function hasChilled(actor) {
  return [...(actor?.effects ?? [])].some(effect => !effect.disabled && !effect.isSuppressed
    && effect.active !== false && effect.duration?.expired !== true
    && effect.flags?.["azeroth-rpg"]?.[CHILLED_FLAG]?.version === 1);
}

/** One dispellable, timed carrier for both parts of Chilled. frostShot is the
 * shared Speed-arbitration marker, not a claim that this was a bow attack.
 * Slowed immunity removes only that component; the melee penalty remains. */
export function chilledEffect({ sourceUuid, messageUuid, targetUuid, timing, slowedImmune = false } = {}) {
  const effect = frostShotEffect({ sourceUuid, messageUuid, targetUuid, timing });
  if (!effect) return null;
  effect.name = "Chilled";
  effect.flags["azeroth-rpg"][CHILLED_FLAG] = { version: 1, sourceUuid, messageUuid, targetUuid };
  if (slowedImmune) {
    effect.statuses = [];
    effect.system.changes = [];
  }
  return effect;
}

/** Feed one boolean to initiative.spend so overlapping slowdowns raise the
 * action cost once. Unknown attack kinds must not be assumed to be melee. */
export function attackSlowedFor(actor, { rangeKind } = {}) {
  return hasAncientDread(actor) || (rangeKind === "melee" && hasChilled(actor));
}
