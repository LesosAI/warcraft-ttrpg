/** Mutation primitive for the successful-cast coordinator. It must establish
 * its durable claim first; this function is not registered as a public query. */
import { iceBlockConditionPlan } from "../rules/ice-block.mjs";

export async function clearIceBlockConditions(actor, { valid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const permitted = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
    && actor?.uuid && fromUuidSync(actor.uuid) === actor && typeof valid === "function" && valid();
  if (!permitted()) return refuse("authority");
  const plan = iceBlockConditionPlan([...actor.effects]);
  if (!plan) return refuse("conditions");
  try {
    if (plan.ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", plan.ids);
    if (!permitted()) return refuse("changed");
    if (plan.ids.some(id => actor.effects.has(id))) return refuse("writeIncomplete");
    const remaining = iceBlockConditionPlan([...actor.effects]);
    if (!remaining || remaining.ids.length) return refuse("conditionsRemain");
    return { ok: true, ended: plan.ids, conditions: plan.conditions };
  } catch { return refuse("writeUncertain"); }
}
