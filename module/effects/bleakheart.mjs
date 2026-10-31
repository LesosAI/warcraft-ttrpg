/** One lingering curse per victim, even when several Hellcallers strike. */
import { BLEAKHEART, BLEAKHEART_FLAG, bleakheartCurseEffect } from "../rules/bleakheart.mjs";
import { minuteSpan } from "./durations.mjs";

const busy = new Set();
const carriers = victim => [...(victim.effects ?? [])].filter(effect =>
  effect.flags?.["azeroth-rpg"]?.[BLEAKHEART_FLAG]?.version === 1);

export async function layBleakheartCurse({ victim, by, valid } = {}) {
  const permitted = () => globalThis.game?.user?.isGM === true
    && game.users?.activeGM?.id === game.user.id && victim?.uuid && by?.uuid
    && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  try {
    const data = bleakheartCurseEffect({ origin: by.uuid, timing: minuteSpan(victim, BLEAKHEART.minutes) });
    if (!data) return { ok: false, reason: "timing" };
    const held = carriers(victim);
    // A duplicate is already ambiguous to the periodic resolver. Repair it
    // before refreshing, and never remove an unrelated curse or condition.
    if (held.length > 1) {
      await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(effect => effect.id));
      if (!permitted() || carriers(victim).length !== 1) return { ok: false, reason: "writeUncertain" };
    }
    let effect = held[0];
    if (effect) {
      // Foundry merges flags: retain any durable tick receipt on refresh.
      await effect.update(data);
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    const current = carriers(victim);
    const matches = effect && current.length === 1 && current[0].id === effect.id
      && effect.origin === data.origin && effect.disabled === false
      && Object.entries(data.duration).every(([key, value]) => effect.duration?.[key] === value)
      && Object.entries(data.start).every(([key, value]) => effect.start?.[key] === value);
    return permitted() && matches ? { ok: true, effectId: effect.id }
      : { ok: false, reason: "writeUncertain" };
  } catch { return { ok: false, reason: "writeUncertain" }; }
  finally { busy.delete(victim.uuid); }
}
