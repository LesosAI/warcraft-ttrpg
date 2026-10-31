/** Classic banshee adaptations. See CLASSIC-BANSHEE-ROLES-REVIEW.md. */
import { LAID_BANE_FLAG } from "./banes.mjs";

export const BANSHEE_CURSE_FLAG = "bansheeCurse";
export const BANSHEE_CURSE = Object.freeze({ name: "Banshee Curse", action: "action",
  mana: 2, range: 60, seconds: 12, resilience: "spirit" });
export const DEATH_SINGER_SCREECH = Object.freeze({ name: "Death Singer Screech", action: "half",
  mana: 2, radius: 15, dc: 17, resilience: "spirit", uses: 1, per: "short" });
export const ANTI_MAGIC_SHIELD = Object.freeze({ name: "Anti-Magic Shield", action: "action",
  mana: 3, ward: 8, seconds: 12, uses: 1, per: "short" });

/** The existing lasting attack-Bane carrier excludes Casting Tests and is not
 * consumed by an attack. Refresh writes this payload onto the existing curse;
 * it must not delete another source's ordinary laid-Bane effect.
 */
export function bansheeCurseEffect({ sourceUuid, time } = {}) {
  if (typeof sourceUuid !== "string" || !sourceUuid.trim() || !Number.isFinite(time)) return null;
  return { name: BANSHEE_CURSE.name, origin: sourceUuid, img: "icons/svg/downgrade.svg",
    description: "<p>You take one Bane on weapon and creature attack rolls for 12 seconds. This curse does not affect Casting Tests.</p>",
    disabled: false, statuses: [], system: { changes: [] },
    duration: { value: BANSHEE_CURSE.seconds, units: "seconds" }, start: { time },
    flags: { "azeroth-rpg": {
      [BANSHEE_CURSE_FLAG]: { version: 1, sourceUuid },
      [LAID_BANE_FLAG]: { kind: "attack", banes: 1, source: BANSHEE_CURSE.name, lasting: true }
    } } };
}

/** Only explicitly marked curse carriers are ours. Disabled copies also need
 * consolidation on refresh, so re-enabling an old copy cannot stack the curse.
 * The adapter updates the first carrier, then removes only duplicate carriers.
 */
export function bansheeCurseRefresh(effects = []) {
  const ids = [...new Set(effects.filter(effect => {
    const mark = effect?.flags?.["azeroth-rpg"]?.[BANSHEE_CURSE_FLAG];
    return mark?.version === 1 && typeof mark.sourceUuid === "string" && mark.sourceUuid.trim()
      && typeof effect.id === "string" && effect.id.length > 0;
  }).map(effect => effect.id))];
  return { update: ids[0] ?? null, remove: ids.slice(1) };
}
