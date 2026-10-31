import { TETANUS, TETANUS_FLAG, tetanusEffect, tetanusHealthPatch } from "../rules/tetanus.mjs";
import { minuteSpan } from "./durations.mjs";
const busy = new Set();

/** One disease across all golems, with excess current Health persisted once. */
export async function layTetanus({ victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if ((victim.system?.conditionImmunities ?? []).includes("diseased")) return { ok: true, immune: true };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let effect;
  try {
    const data = tetanusEffect({ abilities: victim.system?.abilities, origin: by.uuid,
      timing: minuteSpan(victim, TETANUS.minutes) });
    if (!data) return { ok: false, reason: "abilities" };
    const held = [...(victim.effects ?? [])].filter(row => row.flags?.["azeroth-rpg"]?.[TETANUS_FLAG]?.version === 1);
    if (held.length) {
      effect = held[0];
      await effect.update(data);
      if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
      if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(row => row.id));
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect || !permitted()) return { ok: false, reason: "writeUncertain", effectId: effect?.id };
    const patch = tetanusHealthPatch({ type: victim.type, storedHealth: victim._source?.system?.health?.value,
      preparedMaximum: victim.system?.health?.max });
    if (patch) {
      await victim.update(patch);
      if (!permitted() || victim._source?.system?.health?.value !== patch["system.health.value"])
        return { ok: false, reason: "healthUncertain", effectId: effect.id };
    }
    return { ok: true, effectId: effect.id, healthAdjusted: Boolean(patch) };
  } catch { return { ok: false, reason: "writeUncertain", effectId: effect?.id }; }
  finally { busy.delete(victim.uuid); }
}
