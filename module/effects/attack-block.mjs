import { resolveAttackOperation } from "./attack-resolution-state.mjs";
import { canReact, mitigatedDamage, standingMarkRefusal } from "../rules/reactions.mjs";

export const ATTACK_BLOCK_QUERY = "azeroth-rpg.resolveAttackBlock";
const commits = new Map();
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** An unforgeable local continuation; never serialized into a user query. */
export function blockCommitValid(token, actor, messageId, index) {
  const entry = commits.get(token);
  return !!entry && entry.actor === actor && entry.message.id === messageId && entry.index === index && entry.valid();
}

export async function attackBlockQueryHandler({ messageUuid, actorUuid, index } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user?.id
    || !Number.isInteger(index) || index < 0) return { ok: false, reason: "permission" };
  const message = resolve(messageUuid), actor = resolve(actorUuid);
  const flags = message?.flags?.["azeroth-rpg"];
  const target = () => {
    const row = message?.flags?.["azeroth-rpg"]?.targets?.[index];
    return row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
      : !row?.sceneId && !row?.tokenId && row?.actorId ? game.actors.get(row.actorId) : null;
  };
  const valid = () => message?.documentName === "ChatMessage" && actor?.documentName === "Actor"
    && resolve(messageUuid) === message && resolve(actorUuid) === actor && target() === actor
    && actor.testUserPermission(user, "OWNER") === true && flags?.kind === "attack" && !flags.parry && !flags.notAttack
    && message.flags["azeroth-rpg"].damageByTarget?.[index]?.hit === true
    && message.flags["azeroth-rpg"].damageByTarget[index].withdrawn !== true;
  if (!valid()) return { ok: false, reason: "permission" };
  const { reactWithDialog, reactionStateOf } = await import("../applications/actions.mjs");
  const { turnBudgetRefusal } = await import("../dice/workflows.mjs");
  const state = reactionStateOf(actor, { messageId: message.id, targetIndex: index,
    against: ChatMessage.getSpeakerActor(message.speaker) });
  if (!canReact("block", state).ok || standingMarkRefusal(actor.getFlag("azeroth-rpg", "mitigate"), { door: "reaction" })
    || (!state.free?.block && !state.lostToBlow && turnBudgetRefusal(actor, "reaction"))) return { ok: false, reason: "unavailable" };
  const token = Symbol("Block"); let posted;
  try {
    const result = await resolveAttackOperation({ message, index, targetUuid: actor.uuid, operation: "block", validate: valid,
      execute: async ({ valid: stillValid }) => {
        commits.set(token, { actor, message, index, valid: stillValid });
        posted = await reactWithDialog(actor, "block", { messageId: message.id, targetIndex: index, blockCommit: token });
        const mark = actor.getFlag("azeroth-rpg", "mitigate");
        const row = message.flags["azeroth-rpg"].damageByTarget[index];
        return { ok: posted?.documentName === "ChatMessage" && mark?.reaction === "block" && mark.messageId === message.id
          && row.reaction === "block" && row.to === mitigatedDamage(row.damage, mark) && stillValid() };
      } });
    return result.ok ? { ok: true, messageUuid: posted.uuid } : result;
  } finally { commits.delete(token); }
}

export async function requestAttackBlock(actor, message, index) {
  try {
    const payload = { actorUuid: actor.uuid, messageUuid: message.uuid, index };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await attackBlockQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(ATTACK_BLOCK_QUERY, payload, { timeout: 60000 });
    if (result?.ok) return await fromUuid(result.messageUuid);
  } catch { /* Unknown writes stay claimed; never retry payment here. */ }
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.AttackState"));
  return null;
}
