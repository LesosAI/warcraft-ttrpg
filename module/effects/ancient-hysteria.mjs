/** Refresh one dispellable penalty; never multiply it across hounds. */
import { ANCIENT_HYSTERIA, ANCIENT_HYSTERIA_FLAG, ancientHysteriaEffect } from "../rules/ancient-hysteria.mjs";
import { minuteSpan } from "./durations.mjs";
const busy = new Set();

export async function layAncientHysteria({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  try {
    const data = ancientHysteriaEffect({ abilities: victim.system?.abilities, origin: by.uuid, timing: minuteSpan(victim, ANCIENT_HYSTERIA.minutes) });
    if (!data) return { ok: false, reason: "timing" };
    const held = [...(victim.effects ?? [])].filter(effect => effect.flags?.["azeroth-rpg"]?.[ANCIENT_HYSTERIA_FLAG]?.version === 1);
    let effect;
    if (held.length) {
      effect = held[0];
      await effect.update(data);
      if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
      if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(row => row.id));
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    return effect ? { ok: true, effectId: effect.id } : { ok: false, reason: "writeUncertain" };
  } catch { return { ok: false, reason: "writeUncertain" }; }
  finally { busy.delete(victim.uuid); }
}
