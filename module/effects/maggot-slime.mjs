/** One removable disease carrier; refreshing it never doubles the penalty. */
import { MAGGOT_SLIME, MAGGOT_SLIME_FLAG, maggotSlimeEffect } from "../rules/maggot-slime.mjs";
import { minuteSpan } from "./durations.mjs";
const busy = new Set();

export async function layMaggotSlime({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  if ((victim.system?.conditionImmunities ?? []).includes("diseased")) return { ok: true, immune: true };
  busy.add(victim.uuid);
  let effect;
  try {
    const data = maggotSlimeEffect({ type: victim.type, origin: by.uuid, timing: minuteSpan(victim, MAGGOT_SLIME.minutes) });
    if (!data) return { ok: false, reason: "actorType" };
    const held = [...(victim.effects ?? [])].filter(row => row.flags?.["azeroth-rpg"]?.[MAGGOT_SLIME_FLAG]?.version === 1);
    if (!permitted()) return { ok: false, reason: "changed" };
    if (held.length) {
      effect = held[0];
      await effect.update(data);
      if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
      if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(row => row.id));
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect || !permitted()) return { ok: false, reason: "changed", effectId: effect?.id ?? null };
    return { ok: true, effectId: effect.id };
  } catch { return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null }; }
  finally { busy.delete(victim.uuid); }
}
