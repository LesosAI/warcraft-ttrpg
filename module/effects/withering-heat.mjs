/** Maximum Health is derived by the effect. Only excess current Health is stored
 * downward; deleting/dispelling the effect therefore cannot heal the victim. */
import { WITHERING_HEAT, WITHERING_HEAT_FLAG, witheringLoss, witheringClamp, witheringHeatEffect } from "../rules/withering-heat.mjs";
import { minuteSpan } from "./durations.mjs";
const busy = new Set();

export async function layWitheringHeat({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let effect;
  try {
    const held = [...(victim.effects ?? [])].filter(row => row.flags?.["azeroth-rpg"]?.[WITHERING_HEAT_FLAG]);
    const loss = witheringLoss(victim.system?.health?.max, held[0]?.flags?.["azeroth-rpg"]?.[WITHERING_HEAT_FLAG] ?? null);
    const data = witheringHeatEffect({ loss, origin: by.uuid, timing: minuteSpan(victim, WITHERING_HEAT.minutes) });
    if (!data || witheringClamp(victim.system?.health) === null) return { ok: false, reason: "healthOrTiming" };
    if (held.length) {
      effect = held[0];
      await effect.update(data);
      if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
      if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(row => row.id));
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect || !permitted()) return { ok: false, reason: "changed", effectId: effect?.id ?? null };
    const current = victim.system.health.value;
    const clamped = witheringClamp(victim.system.health);
    if (clamped === null) return { ok: false, reason: "health", effectId: effect.id };
    if (clamped < current) await victim.update({ "system.health.value": clamped });
    if (!permitted() || victim.system.health.value > victim.system.health.max) return { ok: false, reason: "changed", effectId: effect.id };
    return { ok: true, effectId: effect.id, loss, clamped: clamped < current };
  } catch { return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null }; }
  finally { busy.delete(victim.uuid); }
}
