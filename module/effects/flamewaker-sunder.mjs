/** One stacking carrier; other sources of armor loss remain independent. */
import { FLAMEWAKER_SUNDER_FLAG, nextFlamewakerSunder, flamewakerSunderEffect } from "../rules/flamewaker.mjs";
import { minuteSpan } from "./durations.mjs";

const busy = new Set();
export async function layFlamewakerSunder({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && fromUuidSync(victim.uuid) === victim && fromUuidSync(by.uuid) === by
    && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let effect;
  try {
    const held = [...(victim.effects ?? [])].filter(row => row.flags?.["azeroth-rpg"]?.[FLAMEWAKER_SUNDER_FLAG]);
    // Ambiguous or disabled carriers require repair, not an accidental reset.
    if (held.length > 1 || held[0]?.disabled) return { ok: false, reason: "invalidCarrier" };
    effect = held[0];
    const state = nextFlamewakerSunder({ targetUuid: victim.uuid,
      existing: effect?.flags?.["azeroth-rpg"]?.[FLAMEWAKER_SUNDER_FLAG] ?? null });
    if (!state) return { ok: false, reason: "invalidCarrier" };
    const data = flamewakerSunderEffect({ state, origin: by.uuid, ap: victim.system?.ap,
      timing: minuteSpan(victim, 1) });
    if (!data || !permitted()) return { ok: false, reason: "changed" };
    if (effect) await effect.update(data);
    else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    // Never retry an uncertain write: a retry could add a second stack.
    if (!effect || ![...(victim.effects ?? [])].includes(effect)) return { ok: false, reason: "writeUncertain" };
    if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
    return { ok: true, effectId: effect.id, stacks: state.stacks };
  } catch {
    return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null };
  } finally { busy.delete(victim.uuid); }
}
