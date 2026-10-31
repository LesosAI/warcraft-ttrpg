import { CRUSHRIDGE } from "../rules/crushridge.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { activeCrushridgeRage } from "./crushridge-rage.mjs";
import { runCrushridgeExtraAttack } from "./crushridge-extra-attack-state.mjs";
import { rollCrushridgeExtraAttack } from "./crushridge-extra-attack-roll.mjs";
export const CRUSHRIDGE_ATTACK_QUERY = "azeroth-rpg.crushridgeExtraAttack";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token?.x, token?.y, token?.elevation, token?._source?.level]);

export async function requestCrushridgeExtraAttack(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const fight = actor.activeFight?.();
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), combatId: fight?.id,
      round: fight?.round, combatantId: fight?.combatant?.id };
    const result = writer() ? await crushridgeExtraAttackQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CRUSHRIDGE_ATTACK_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Fallen-Kin Rage's extra attack did not finish. Check the current turn, rage effect and saved attack record.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Crushridge extra attack", error);
    ui.notifications?.warn("The extra attack could not be confirmed. Review its saved record before retrying.");
    return null;
  }
}

export async function crushridgeExtraAttackQueryHandler({ actorUuid, index, source, combatId, round, combatantId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  try {
    const { chooseOption } = await import("../dice/workflows.mjs");
    const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens?.get(source?.tokenId);
    const fight = game.combats?.get(combatId), combatant = fight?.combatants?.get(combatantId);
    const origin = point(token), level = token?._source?.level;
    const walls = () => JSON.stringify([...(scene?.walls?.values?.() ?? [])].map(wall => wall._source));
    const wallStamp = walls();
    const baseValid = () => writer() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
      && game.scenes?.get(scene?.id) === scene && scene?.tokens?.get(token?.id) === token && token?.actor === actor
      && scene?.levels?.get(level) && point(token) === origin && walls() === wallStamp
      && game.combats?.get(combatId) === fight && fight?.started && fight.round === round
      && fight.combatant === combatant && combatant?.actor === actor && combatant.token === token
      && actor.system?.health?.value > 0 && !actor.statuses?.has("stunned")
      && !projectionRefusal(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability") && !realmRefusalFor(actor, "ability")
      && Number.isInteger(index) && actor.system?.creatureAbilities?.[index]?.name === CRUSHRIDGE.recipientAbility
      && activeCrushridgeRage(actor);
    if (!baseValid()) return refuse("sourceOrTurn");
    const attacks = actor.system.attacks ?? [];
    const choices = attacks.flatMap((attack, i) => attack.range == null && Number.isFinite(attack.bonus) && Number.isFinite(attack.damage)
      ? [{ key: String(i), name: attack.name, description: "Use the turn's additional melee attack." }] : []);
    if (!choices.length) return refuse("weapon");
    const picked = await chooseOption({ name: "Fallen-Kin Rage: weapon", id: `${actor.id}-rage-weapon` }, choices, null);
    const selectedIndex = choices.find(row => row.key === picked?.key)?.key;
    if (selectedIndex == null || !baseValid()) return refuse("cancelled");
    const attackIndex = Number(selectedIndex), attackStamp = JSON.stringify(attacks[attackIndex]);
    const eligible = target => target !== token && target.actor?.uuid && target.actor !== actor
      && target.actor.system?.health?.value > 0 && target._source?.level === level
      && !projectionPhaseFor(target.actor) && !realmRefusalFor(target.actor, "ability")
      && Number.isFinite(feetApart(token, target)) && feetApart(token, target) >= 0 && feetApart(token, target) <= 5;
    const candidates = [...scene.tokens.values()].filter(eligible);
    const candidatePoints = new Map(candidates.map(t => [t, { actor: t.actor, point: point(t) }]));
    const targetPick = await chooseOption({ name: "Fallen-Kin Rage: target", id: `${actor.id}-rage-target` },
      candidates.map(t => ({ key: t.uuid, name: t.name, description: "GM confirms this is an enemy within reach, with no solid cover blocking the attack." })), null);
    const target = candidates.find(t => t.uuid === targetPick?.key), victim = target?.actor, targetPoint = point(target);
    if (!target || !baseValid() || candidatePoints.get(target).actor !== victim
      || candidatePoints.get(target).point !== targetPoint) return refuse("cancelled");
    const valid = () => baseValid() && scene.tokens.get(target.id) === target && target.actor === victim
      && point(target) === targetPoint && eligible(target) && JSON.stringify(actor.system.attacks[attackIndex]) === attackStamp;
    const inspect = async () => valid() ? { rage: activeCrushridgeRage(actor), now: game.time.worldTime,
      alive: true, melee: true, combatantId, tokenUuid: token.uuid,
      combat: { id: fight.id, round: fight.round, started: fight.started, currentCombatantId: fight.combatant.id } } : null;
    return await runCrushridgeExtraAttack({ combatant, inspect, roll: ({ valid: claimValid }) =>
      rollCrushridgeExtraAttack({ actor, index: attackIndex, valid: claimValid,
        readCurrent: async () => valid() ? { source: token, target } : null }) });
  } finally { busy.delete(actor.uuid); }
}
