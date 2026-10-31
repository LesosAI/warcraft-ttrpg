import { TOXIC_POISONS } from "../rules/toxic-horror.mjs";
import { layToxicPoison } from "./toxic-horror.mjs";

/** Internal callbacks for the authenticated use controller. No geometry or
 * ownership decision is inferred here: valid belongs to the GM query adapter. */
export function toxicTargetAdapters({ actor, source, targets, kind, valid } = {}) {
  if (!actor?.uuid || source?.actor !== actor || !Object.hasOwn(TOXIC_POISONS, kind ?? "")
    || !Array.isArray(targets) || !targets.length || typeof valid !== "function"
    || targets.some(t => !t?.uuid || !t.actor?.uuid || t.actor === actor)
    || new Set(targets.map(t => t.uuid)).size !== targets.length) return null;
  const tokens = new Map(targets.map(t => [t.uuid, t]));
  const victims = new Map(targets.map(t => [t.uuid, t.actor]));
  const current = async uuid => tokens.has(uuid) && source.actor === actor
    && tokens.get(uuid).actor === victims.get(uuid) && await valid(uuid)
    && source.actor === actor && tokens.get(uuid).actor === victims.get(uuid);
  return {
    resist: async uuid => {
      if (!await current(uuid) || !(victims.get(uuid).system?.health?.value > 0)) return null;
      const { rollResilience } = await import("../dice/workflows.mjs");
      const card = await rollResilience({ actor: victims.get(uuid), resilience: "body",
        dc: TOXIC_POISONS[kind].dc, subtitle: TOXIC_POISONS[kind].name });
      const passed = card?.rolls?.[0]?.outcome?.success;
      return card?.id && typeof passed === "boolean" ? { cardId: card.id, passed } : null;
    },
    apply: async (uuid, claim) => {
      if (claim?.kind !== kind || typeof claim?.valid !== "function" || !await current(uuid)) return null;
      return layToxicPoison({ source: actor, target: victims.get(uuid), kind, exposureId: claim.exposureId,
        valid: async () => await current(uuid) && await claim.valid() && await current(uuid) });
    }
  };
}
