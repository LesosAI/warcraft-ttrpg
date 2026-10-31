import { AZEROTH } from "../config.mjs";
import { ANTI_MAGIC_SHIELD as SPEC } from "./banshee-roles.mjs";

export const ANTI_MAGIC_SHIELD_FLAG = "antiMagicShield";
const identity = value => typeof value === "string" && value.trim().length > 0;

/** User ruling: Ward 8 in every school, retaining any stronger existing Ward.
 * Normal Ward resolution handles damage; no immunity or effect-blocking hook.
 */
export function antiMagicShieldEffect({ sourceUuid, cast, time } = {}) {
  if (!identity(sourceUuid) || !identity(cast) || !Number.isFinite(time)) return null;
  return { name: SPEC.name, origin: sourceUuid, img: "icons/svg/shield.svg", disabled: false,
    description: "<p>For 12 seconds, you have Ward 8 against every school of magic. If your Ward against a school is already higher, use that value instead.</p>",
    statuses: [], system: { changes: Object.keys(AZEROTH.schools).map(school => ({
      key: `system.ward.${school}`, type: "upgrade", value: String(SPEC.ward), phase: "final", priority: 100
    })) },
    duration: { value: SPEC.seconds, units: "seconds" }, start: { time },
    flags: { "azeroth-rpg": { [ANTI_MAGIC_SHIELD_FLAG]: { version: 1, sourceUuid, cast } } } };
}
