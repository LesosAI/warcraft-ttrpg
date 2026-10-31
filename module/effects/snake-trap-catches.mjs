import { snakeTrapCatchPlan } from "../rules/snake-trap-catches.mjs";
import { snarePoisonEligible } from "../rules/snare-trigger.mjs";

export const SNAKE_TRAP_CATCH_QUERY = "azeroth-rpg.snakeTrapCatch";
const pending = new Set();

export async function snakeTrapCatchHandler({ messageId, actorUuid } = {}, { user } = {}) {
  const authority = () => user?.id && game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  if (!authority()) return false;
  const actor = await fromUuid(actorUuid);
  const message = game.messages.get(messageId);
  if (!authority() || actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER") || !message || pending.has(messageId)) return false;
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.kind !== "feature" || flags.featureKey !== "snare" || !flags.poisons?.length
    || !snarePoisonEligible(flags.snareTrigger, actor.uuid)) return false;
  pending.add(messageId);
  try {
    const plan = snakeTrapCatchPlan(flags.snakeTrap, actor.uuid);
    if (!plan.ok) return false;
    await message.update({ "flags.azeroth-rpg.snakeTrap.catches": plan.catches });
    return Boolean(authority() && game.messages.get(messageId) === message && actor.testUserPermission(user, "OWNER")
      && JSON.stringify(message.flags?.["azeroth-rpg"]?.snakeTrap?.catches) === JSON.stringify(plan.catches));
  } finally { pending.delete(messageId); }
}

export async function claimSnakeTrapCatch(message, actor) {
  const gm = game.users?.activeGM;
  if (!gm) return false;
  const payload = { messageId: message.id, actorUuid: actor.uuid };
  try {
    return (gm.id === game.user.id ? await snakeTrapCatchHandler(payload, { user: game.user })
      : await gm.query(SNAKE_TRAP_CATCH_QUERY, payload, { timeout: 15000 })) === true;
  } catch { return false; }
}
