/** The GM query supplies current ownership, range and clock validation. */
import { DREDGE_SICKNESS, DREDGE_SICKNESS_FLAG, dredgeSicknessEffect } from "../rules/dredge-worm.mjs";
import { minuteSpan } from "./durations.mjs";

export async function layDredgeSickness({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if ((victim.system?.conditionImmunities ?? []).includes("diseased")) return { ok: true, immune: true };
  const data = dredgeSicknessEffect({ abilities: victim.system?.abilities, origin: by.uuid,
    timing: minuteSpan(victim, DREDGE_SICKNESS.minutes) });
  if (!data) return { ok: false, reason: "abilities" };
  const held = [...(victim.effects ?? [])].filter(effect => effect.flags?.["azeroth-rpg"]?.[DREDGE_SICKNESS_FLAG]?.version === 1);
  let effect;
  if (held.length) {
    effect = held[0];
    await effect.update(data);
    if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
    if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(e => e.id));
  } else {
    [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
  }
  return effect ? { ok: true, effectId: effect.id } : { ok: false, reason: "write" };
}
