import { phaseShiftEligible, phaseShiftRefusal, phaseShiftAttackState } from "../rules/phase-shift.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { resolvePhaseShiftAttack } from "./phase-shift-resolution.mjs";
import { postPhaseShiftFeedback } from "./phase-shift-feedback.mjs";

export const PHASE_SHIFT_QUERY = "azeroth-rpg.phaseShift";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const stamp = actor => {
  const fight = actor.activeFight?.();
  return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : null;
};

export async function phaseShiftQueryHandler({ messageUuid, index } = {}, { user } = {}) {
  if (!gmHere() || !user?.id || !Number.isInteger(index) || index < 0) return { ok: false, reason: "request" };
  const message = resolve(messageUuid), flags = message?.flags?.["azeroth-rpg"];
  const target = flags?.targets?.[index];
  const targetActor = () => target?.sceneId && target?.tokenId
    ? resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`)?.actor
    : !target?.sceneId && !target?.tokenId && target?.actorId ? game.actors.get(target.actorId) : null;
  const actor = targetActor();
  if (message?.documentName !== "ChatMessage" || !actor?.testUserPermission(user, "OWNER"))
    return { ok: false, reason: "permission" };
  const attacker = ChatMessage.getSpeakerActor(message.speaker);
  const now = game.time?.worldTime, turn = stamp(actor);
  const targetSnapshot = JSON.stringify(target), damageSnapshot = JSON.stringify(flags.damageByTarget?.[index]);
  const { reactionStateOf } = await import("../applications/actions.mjs");
  const stateOf = () => reactionStateOf(actor, { messageId: message.id, against: attacker, targetIndex: index });
  const valid = () => {
    if (!gmHere() || resolve(messageUuid) !== message || resolve(actor.uuid) !== actor || targetActor() !== actor
      || !actor.testUserPermission(user, "OWNER") || game.time?.worldTime !== now || stamp(actor) !== turn
      || JSON.stringify(message.flags?.["azeroth-rpg"]?.targets?.[index]) !== targetSnapshot
      || JSON.stringify(message.flags?.["azeroth-rpg"]?.damageByTarget?.[index]) !== damageSnapshot
      || ChatMessage.getSpeakerActor(message.speaker) !== attacker) return false;
    const rows = actor.system?.creatureAbilities ?? [], abilities = rows.filter(row => row.name === "Phase Shift");
    const ability = abilities.length === 1 ? abilities[0] : null;
    if (ability?.automation?.kind !== "utility" || ability.automation.action !== "reaction"
      || ability.automation.cost?.amount > 0 || ability.automation.uses?.max > 0
      || actor.statuses?.has("stunned") || phaseShiftRefusal(actor, "reaction")
      || projectionRefusal(actor, "reaction") || sleepRefusal(actor, "reaction") || despairRefusal(actor, "reaction")) return false;
    const state = stateOf(), current = message.flags["azeroth-rpg"], record = current.attackResolution?.targets?.[index];
    const damage = current.damageByTarget?.[index];
    if (record?.targetUuid !== actor.uuid || !phaseShiftAttackState(damage, message.rolls?.[0]?.outcome)) return false;
    return phaseShiftEligible({ reactorUuid: actor.uuid, attackerUuid: attacker?.uuid, targetUuid: record.targetUuid,
      type: actor.type, health: actor.system.health?.value, abilityName: ability.name, kind: current.kind,
      parry: current.parry === true, notAttack: current.notAttack === true, retaliation: current.retaliation === true,
      canReact: !state.spiritRealm && !state.asleep && !state.disoriented && !state.seduced
        && (!state.inFight || state.reactionsLeft > 0 || state.lostToBlow === true),
      alreadyAnswered: state.alreadyReacted === true, unanswerable: state.unanswered === true,
      damageApplied: !["pending", "phasing"].includes(record.stage) });
  };
  if (!valid()) return { ok: false, reason: "ineligible" };
  const initial = stateOf(), answeredWithLost = initial.lostToBlow === true && initial.reactionsLeft < 1;
  const { spendTurnBudget } = await import("../dice/workflows.mjs");
  const result = await resolvePhaseShiftAttack({ message, index, actor, validate: valid, answeredWithLost,
    payReaction: async () => {
      if (!valid()) return false;
      const state = stateOf();
      // The blow already consumed this Reaction; withdrawing that blow must
      // not restore the Reaction used to answer it.
      if (answeredWithLost) return state.lostToBlow === true && state.reactionsLeft < 1;
      return spendTurnBudget(actor, "reaction");
    } });
  if (result?.ok) {
    try {
      if (!await postPhaseShiftFeedback({ actor, message, index })) throw Error("Missing feedback");
    } catch {
      ui.notifications?.warn("Phase Shift resolved, but its result message was not confirmed. Do not spend another Reaction to repeat it.");
    }
  }
  return result;
}

export async function requestPhaseShift(message, index) {
  try {
    const data = { messageUuid: message.uuid, index };
    const result = gmHere() ? await phaseShiftQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(PHASE_SHIFT_QUERY, data, { timeout: 60000 });
    if (!result?.ok) ui.notifications?.warn("Phase Shift was not confirmed. Review the attack and Reaction before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("Phase Shift was not confirmed. Review the attack and Reaction before trying again.");
    return { ok: false, reason: "writeUncertain" };
  }
}
