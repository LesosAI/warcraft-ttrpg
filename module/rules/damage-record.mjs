import { resolveDamage } from "./mitigation.mjs";
import { shrinkDamage } from "./gadgets.mjs";

// Only the resolver's inputs belong in a persisted card. Never retain actor,
// token or effect documents passed by an adapter alongside those inputs.
const INPUTS = ["sourceDamageBonus", "rating", "sl", "kind", "school", "location", "apByLocation",
  "penetration", "ward", "immune", "vulnerable", "slAddsToDamage", "multiplier",
  "schoolArmor", "extras", "wardBySchool", "schoolArmorBySchool", "dealtHalved",
  "passedHalf", "bypass", "fireTakenBonus"];

/** Preserve pre-Ward inputs alongside the ordinary result. Soul Link cannot
 * reconstruct them from final damage: magical-weapon Ward also reduces SL.
 * This adds provenance only; it neither chooses a link nor transfers damage.
 * Shrink Ray records its full reduction, not just the amount left after Ward,
 * so a pre-Ward reconstruction can apply that reduction once. */
export function resolveRecordedDamage(options = {}, { shrink = 0 } = {}) {
  const input = structuredClone(Object.fromEntries(INPUTS.filter(key => options[key] !== undefined)
    .map(key => [key, options[key]])));
  return { ...shrinkDamage(resolveDamage(input), shrink), mitigationSource: { version: 1, input,
    ...(shrink > 0 ? { shrink: Math.trunc(shrink) } : {}) } };
}
