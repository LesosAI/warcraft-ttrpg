/** One paid Frost bow attack, using the ordinary attack card and reactions. */
import { FROST_SHOT as SPEC, frostShotRange } from "../rules/frost-shot.mjs";
import { countsAsEnemy } from "../rules/distance.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { standingOf, combatantIn, reachOfActor } from "../canvas/engaged.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { layFrostShot } from "./frost-shot.mjs";
export const FROST_SHOT_QUERY = "azeroth-rpg.frostShot";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestFrostShot(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await frostShotQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(FROST_SHOT_QUERY, data, { timeout: 180000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(result?.paid
      ? "Frost Shot stopped after payment. Check Mana, the attack card and the target's effects before continuing."
      : "Frost Shot was not used. Check its target, range, Action and Mana.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Frost Shot request", error);
    ui.notifications?.warn("Frost Shot could not be confirmed. Check its result before trying again.");
    return null;
  }
}

export async function frostShotQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, rolled = false, finished = false, attempting = false;
  const result = { messageUuid: null, slowed: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const token = targets[0]?.sceneId === scene?.id ? scene?.tokens.get(targets[0]?.tokenId) : null;
  const victim = token?.actor;
  if (!victim?.uuid || victim.uuid === actor.uuid || origin?.actor !== actor) return refuse("target");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock(), mana = actor.system?.power?.value;
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor || fromUuidSync(victim.uuid) !== victim) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index], auto = row?.automation;
    if (row?.name !== SPEC.name || auto?.kind !== "utility" || auto.action !== SPEC.action
      || auto.cost?.pool !== "power" || auto.cost.amount !== SPEC.power) return "ability";
    if (!(actor.system?.health?.value > 0) || !(victim.system?.health?.value > 0)
      || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("silenced") || actor.statuses?.has("stunned")) return "sourceOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.power
      || actor.system.power.value !== mana - (consumed ? SPEC.power : 0)) return "mana";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    return frostShotRange(feetApart(origin, token)).allowed ? null : "range";
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const snapshot = () => targetSnapshots([{ id: token.id, name: token.name, actor: victim, scene }]);
    const declared = snapshot(), declaredState = JSON.stringify(declared);
    if (declared.length !== 1 || !Number.isFinite(declared[0].defense)) return refuse("defense");
    const { npcAttackWithDialog } = await import("../applications/actions.mjs");
    const { rollTest, spendTurnBudget } = await import("../dice/workflows.mjs");
    let response = refuse("cancelled");
    await npcAttackWithDialog(actor, null, null, {
      title: SPEC.name, attack: { name: "Bow", bonus: SPEC.bonus, damage: SPEC.damage, range: SPEC.range, traits: [] },
      targets: declared, mode: "shot", singleAttack: true, budget: "none",
      run: async args => {
        if (attempting || paid || rolled) return null;
        attempting = true;
        reason = validate();
        if (reason || JSON.stringify(snapshot()) !== declaredState || args.actor !== actor || args.targets?.length !== 1
          || args.targets[0].sceneId !== scene.id || args.targets[0].tokenId !== token.id || !args.damage) {
          response = refuse(reason ?? "changed"); return null;
        }
        if (!await spendTurnBudget(actor, SPEC.action)) { response = refuse("action"); return null; }
        paid = true;
        reason = validate(); if (reason) { response = refuse(reason); return null; }
        await actor.update({ "system.power.value": mana - SPEC.power }); consumed = true;
        reason = validate();
        if (reason || JSON.stringify(snapshot()) !== declaredState) { response = refuse(reason ?? "changed"); return null; }
        const fight = actor.activeFight?.(), standing = standingOf(origin, combatantIn(fight, actor, origin), fight);
        const reach = reachOfActor(actor);
        let engaged = false;
        for (const other of scene.tokens.values()) {
          if (other === origin || !other.actor || !countsAsEnemy(standing,
            standingOf(other, combatantIn(fight, other.actor, other), fight), { gm: true })) continue;
          const distance = feetApart(origin, other);
          if (!Number.isFinite(distance) || distance < 0) { response = refuse("distance"); return null; }
          if (distance <= reach) engaged = true;
        }
        const band = frostShotRange(feetApart(origin, token), engaged);
        if (!band.allowed) { response = refuse("range"); return null; }
        rolled = true;
        const message = await rollTest({ ...args, targets: declared, source, budget: "none",
          damage: { ...args.damage, kind: "magical", school: SPEC.school },
          banes: (Number(args.banes) || 0) + band.banes,
          provenanceExtra: [...(args.provenanceExtra ?? []),
            ...(band.banes ? [{ label: "Frost Shot: range and Engaged", value: band.banes, formula: `${band.banes} Bane(s)` }] : [])] });
        if (!message?.uuid || typeof message.rolls?.[0]?.outcome?.success !== "boolean") {
          response = refuse("unresolved"); return message;
        }
        result.messageUuid = message.uuid;
        if (message.rolls[0].outcome.success === true) {
          reason = validate(); if (reason) { response = refuse(reason); return message; }
          await message.update({ "flags.azeroth-rpg.frostShotAttack": { sourceUuid: actor.uuid, targetUuid: victim.uuid } });
          const landed = await layFrostShot({ message, source: actor, target: victim, timing: untilEndOfNextTurnOrRound(victim) });
          result.slowed = landed.ok === true; result.slowReason = landed.reason ?? null;
          if (!landed.ok && !["immune", "withdrawn", "hit"].includes(landed.reason)) {
            response = refuse("effectUncertain"); return message;
          }
        }
        if (result.slowed) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: "<p><strong>Frost Shot</strong></p><p>The struck target is Slowed until the end of its next turn.</p>",
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:frost-shot",
            casting: false, success: true, frostShot: result,
            targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: token.name }] } } });
        finished = true; response = { ok: true, paid, result }; return message;
      }
    });
    return response;
  } catch (error) { console.warn("azeroth-rpg | Frost Shot", error); return refuse("writeUncertain"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Frost Shot stopped after payment. Check Mana, the attack card and any slowing effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "frostShotReport", frostShot: result, resourcesConsumed: consumed, rolled } } });
      } catch (error) { console.warn("azeroth-rpg | Frost Shot partial report", error); }
    }
  }
}
