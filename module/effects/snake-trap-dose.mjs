import { sameSnakeTrapRule, snakeTrapDosePlan } from "../rules/snake-trap-dose.mjs";
import { snakeTrapFor } from "../rules/class-talents.mjs";
import { SNARE } from "../rules/class-features.mjs";

export const SNAKE_TRAP_DOSE_QUERY = "azeroth-rpg.snakeTrapDose";
const pending = new Set();

/** The active GM is the single writer; a dose and its replay receipt share one
 * item update. A failed acknowledgement is never retried or refunded here. */
export async function snakeTrapDoseHandler({ actorUuid, featureId, poisonId, trapId, expectedUse, expectedSnake } = {}, { user } = {}) {
  const authority = () => user?.id && game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const refuse = () => { throw new Error(game.i18n.localize("AZEROTH.SnakeTrap.DoseRefused")); };
  if (!authority()) return refuse();
  const actor = await fromUuid(actorUuid);
  if (!authority() || actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse();
  const feature = actor.items.get(featureId);
  if (feature?.type !== "feature" || feature.name !== SNARE.feature
    || !sameSnakeTrapRule(snakeTrapFor(actor.takenTalents?.() ?? []), expectedSnake)) return refuse();
  const poison = actor.items.get(poisonId);
  if (!poison || pending.has(poison.uuid)) return refuse();
  pending.add(poison.uuid);
  try {
    const plan = snakeTrapDosePlan({ item: poison.toObject(), trapId, expectedUse });
    if (!plan.ok) return refuse();
    await poison.update(plan.update);
    if (!authority() || actor.items.get(poisonId) !== poison
      || !actor.testUserPermission(user, "OWNER") || actor.items.get(featureId) !== feature
      || !sameSnakeTrapRule(snakeTrapFor(actor.takenTalents?.() ?? []), expectedSnake)
      || poison.system.quantity !== plan.update["system.quantity"]
      || !poison.getFlag("azeroth-rpg", "snakeTrapDoses")?.includes(trapId)) return refuse();
    return plan.poison;
  } finally { pending.delete(poison.uuid); }
}

export async function spendSnakeTrapDose({ actor, feature, poison, trapId, expectedUse, expectedSnake }) {
  const gm = game.users?.activeGM;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.SnakeTrap.DoseRefused"));
  const payload = { actorUuid: actor.uuid, featureId: feature.id, poisonId: poison.id, trapId, expectedUse, expectedSnake };
  return gm.id === game.user.id ? snakeTrapDoseHandler(payload, { user: game.user })
    : gm.query(SNAKE_TRAP_DOSE_QUERY, payload, { timeout: 15000 });
}
