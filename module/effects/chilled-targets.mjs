import { layChilled } from "./chilled.mjs";

/** Internal callbacks for runChilled. The query adapter owns authorization,
 * range and clear-path validation; this layer pins the selected actor identity. */
export function chilledTargetAdapters({ actor, source, target, valid } = {}) {
  if (!actor?.uuid || source?.actor !== actor || !target?.uuid || !target.actor?.uuid
    || target.actor === actor || typeof valid !== "function") return null;
  const victim = target.actor;
  const current = () => source.actor === actor && target.actor === victim && valid() === true
    && source.actor === actor && target.actor === victim;
  return {
    resist: async () => {
      if (!current() || !(victim.system?.health?.value > 0)) return null;
      const { rollResilience } = await import("../dice/workflows.mjs");
      const card = await rollResilience({ actor: victim, resilience: "body", dc: 17, subtitle: "Chilled" });
      const passed = card?.rolls?.[0]?.outcome?.success;
      // Preserve a completed Test even if geometry changed while its dialog
      // was open. The controller records it before deciding whether to apply.
      return card?.uuid && typeof passed === "boolean" ? { cardUuid: card.uuid, passed } : null;
    },
    apply: async claim => {
      if (!current() || typeof claim?.valid !== "function") return null;
      return layChilled({ victim, by: actor, messageUuid: claim.messageUuid,
        valid: () => current() && claim.valid() === true && current() });
    }
  };
}
