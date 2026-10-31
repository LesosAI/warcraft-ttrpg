/** One paid melee attack. Ordinary attack-card damage, armor and reactions
 * remain authoritative; the separate carrier follows only a confirmed hit. */
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { laySentinelMortalStrike } from "./sentinel-mortal-strike.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { felguardStrikeSpec } from "../rules/mortal-strike.mjs";
export const SENTINEL_STRIKE_QUERY = "azeroth-rpg.sentinelStrike";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestSentinelStrike(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(target => ({ sceneId: target.sceneId, tokenId: target.tokenId })) };
    const result = gmHere() ? await sentinelStrikeQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(SENTINEL_STRIKE_QUERY, data, { timeout: 180000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(result?.paid
      ? "Mortal Strike stopped after payment. Check the attack card and target's effects before continuing."
      : game.i18n.localize("AZEROTH.NpcMortalStrike.Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel Mortal Strike request", error);
    ui.notifications?.warn("Mortal Strike could not be confirmed. Check its result before trying again.");
    return null;
  }
}

export async function sentinelStrikeQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, attempting = false, rolled = false, finished = false;
  const result = { messageUuid: null, marked: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const token = targets[0].sceneId === scene?.id ? scene?.tokens.get(targets[0].tokenId) : null;
  const victim = token?.actor;
  if (!victim?.uuid || victim.uuid === actor.uuid || origin?.actor !== actor) return refuse("target");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const specNow = () => {
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name === "Sentinel Mortal Strike" && row.automation?.kind === "utility"
      && row.automation.action === "action" && activeSentinelPowers(actor).includes("mortal-strike"))
      return { kind: "sentinel", reach: 10, title: row.name,
        attack: { name: "Stone fist", bonus: 10, damage: 13, traits: ["Reach"] } };
    return felguardStrikeSpec(actor, index);
  };
  const spec = specNow(), originalSpec = JSON.stringify(spec);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor
      || fromUuidSync(victim.uuid) !== victim) return "owner";
    if (started === null || clock() !== started) return "clock";
    if (!spec || JSON.stringify(specNow()) !== originalSpec) return "power";
    if (!(actor.system.health.value > 0) || !(victim.system?.health?.value > 0)
      || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")
      || actor.statuses?.has("stunned")) return "sourceOrRealm";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    const distance = feetApart(origin, token);
    return Number.isFinite(distance) && distance >= 0 && distance <= spec.reach ? null : "range";
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const snapshot = () => targetSnapshots([{ id: token.id, name: token.name, actor: victim, scene }]);
    const declared = snapshot(), before = JSON.stringify(declared);
    if (declared.length !== 1 || !Number.isFinite(declared[0].defense)) return refuse("defense");
    const { npcAttackWithDialog } = await import("../applications/actions.mjs");
    const { rollTest, spendTurnBudget } = await import("../dice/workflows.mjs");
    let response = refuse("cancelled");
    await npcAttackWithDialog(actor, null, null, {
      title: spec.title, attack: spec.attack,
      targets: declared, mode: "hand", singleAttack: true, budget: "none",
      run: async args => {
        if (attempting || paid || rolled) return null;
        attempting = true;
        reason = validate();
        if (reason || JSON.stringify(snapshot()) !== before || args.actor !== actor || args.targets?.length !== 1
          || args.targets[0].sceneId !== scene.id || args.targets[0].tokenId !== token.id || !args.damage) {
          response = refuse(reason ?? "changed"); return null;
        }
        if (!await spendTurnBudget(actor, "action")) { response = refuse("action"); return null; }
        paid = true;
        reason = validate();
        if (reason || JSON.stringify(snapshot()) !== before) { response = refuse(reason ?? "changed"); return null; }
        rolled = true;
        const message = await rollTest({ ...args, targets: declared, source, budget: "none" });
        if (!message?.uuid || typeof message.rolls?.[0]?.outcome?.success !== "boolean") {
          response = refuse("unresolved"); return message;
        }
        result.messageUuid = message.uuid;
        if (message.rolls[0].outcome.success) {
          reason = validate(); if (reason) { response = refuse(reason); return message; }
          await message.update({ "flags.azeroth-rpg.sentinelStrikeAttack": { sourceUuid: actor.uuid, targetUuid: victim.uuid,
            ...(spec.kind === "felguard" ? { kind: "felguard", index } : {}) } });
          const landed = await laySentinelMortalStrike({ message, source: actor, target: victim });
          result.marked = landed.ok === true; result.markReason = landed.reason ?? null;
          if (!landed.ok && !["hitOrPower", "withdrawn"].includes(landed.reason)) {
            response = refuse("effectUncertain"); return message;
          }
          if (spec.kind === "felguard" && landed.ok) {
            try {
              const { postFelguardStrikeFeedback } = await import("./felguard-strike-feedback.mjs");
              const feedback = await postFelguardStrikeFeedback({ actor, victim, message, effectId: landed.effectId });
              result.feedbackPosted = Boolean(feedback?.id);
            } catch (error) {
              result.feedbackPosted = false;
              console.warn("azeroth-rpg | Mortal Strike feedback unavailable", error);
            }
          }
        }
        finished = true; response = { ok: true, paid, result }; return message;
      }
    });
    return response;
  } catch (error) { console.warn("azeroth-rpg | Sentinel Mortal Strike", error); return refuse("writeUncertain"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p>Mortal Strike stopped after payment. Check the attack card and healing reduction; do not repeat completed writes.</p>",
      flags: { "azeroth-rpg": { kind: "sentinelStrikeReport", sentinelStrike: result, rolled } } }).catch(error =>
      console.warn("azeroth-rpg | Sentinel strike partial report", error));
  }
}
