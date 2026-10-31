/** One reviewed victim, one payment, damage followed by a wall-aware push. */
import { KNOCK_AWAY as GIANT_KNOCK_AWAY, SENTINEL_KNOCK_AWAY } from "../rules/molten-giant.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { forceMove, forcedWords } from "./forced-movement.mjs";
import { moltenGiantBusy } from "./molten-smash.mjs";

export const KNOCK_AWAY_QUERY = "azeroth-rpg.knockAway";
const busy = moltenGiantBusy;
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestKnockAway(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await knockAwayQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(KNOCK_AWAY_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Knock Away stopped after payment. Check its damage and movement results before resolving anything manually."
      : "Knock Away was not used. Check one target within 10 feet, ownership and remaining actions.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Knock Away request", error);
    ui.notifications?.warn("Knock Away could not be confirmed. Check the GM's results before trying again.");
    return null;
  }
}

export async function knockAwayQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const result = { damageAttempted: false, damageApplied: false, pushAttempted: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const sentinel = actor.system?.creatureAbilities?.[index]?.name === SENTINEL_KNOCK_AWAY.name;
  const KNOCK_AWAY = sentinel ? SENTINEL_KNOCK_AWAY : GIANT_KNOCK_AWAY;
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const token = targets[0]?.sceneId === scene?.id ? scene?.tokens.get(targets[0]?.tokenId) : null;
  const victim = token?.actor;
  if (!victim?.uuid || victim.uuid === actor.uuid || origin?.actor !== actor) return refuse("target");
  const keys = [actor.uuid, victim.uuid];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  keys.forEach(key => busy.add(key));
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== KNOCK_AWAY.name || row.automation?.action !== KNOCK_AWAY.action) return "ability";
    if (KNOCK_AWAY.uses && (row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1))) return "ability";
    if (sentinel && (!activeSentinelPowers(actor).includes("knock-away") || row.automation?.kind !== "utility"
      || row.automation.dc !== 20 || fromUuidSync(actor.uuid) !== actor || fromUuidSync(victim.uuid) !== victim)) return "power";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")) return "source";
    if (sleepRefusal(actor, "ability") || despairRefusal(actor, "ability") || actor.statuses?.has("stunned")) return "incapacitated";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    const distance = feetApart(origin, token), point = origin.getCenterPoint?.();
    if (!Number.isFinite(distance) || distance < 0 || distance > KNOCK_AWAY.feet
      || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return "range";
    return null;
  };
  const report = () => `${victim.name}: ${result.damageApplied ? `${result.damage} Physical damage applied`
    : result.damageAttempted ? "damage write uncertain; check Health" : "damage not applied"}; ${result.push
    ? forcedWords(result.push) : result.resisted ? "resisted the push" : result.pushAttempted ? "movement uncertain; check the token" : "no push resolved"}.`;
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const confirm = await chooseOption({ id: `${actor.id}-knock-away`, name: KNOCK_AWAY.name }, [
      { key: "cancel", name: "Cancel", description: "Spend nothing." },
      { key: "use", name: `Use against ${victim.name}`, description: sentinel
        ? "Spend one Action. Body DC 20 halves 11 Physical damage (plus standing Damage Rating bonuses) and prevents the 10-foot push."
        : "Spend a Half-Action and one Short Rest use. Body DC 18 halves 11 Physical damage and prevents the 10-foot push." }
    ], null, { prompt: "GM: Confirm this enemy before paying." });
    if (confirm?.key !== "use") return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, KNOCK_AWAY.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    if (KNOCK_AWAY.uses) {
      const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
      rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows });
    }
    consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: KNOCK_AWAY.resilience, dc: KNOCK_AWAY.dc, subtitle: KNOCK_AWAY.name });
    result.test = card?.id ?? null;
    const resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof resisted !== "boolean") return refuse("unresolved");
    result.resisted = resisted;
    reason = validate(); if (reason) return refuse(reason);
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const snapshot = targetSnapshots([{ id: token.id, actor: victim, name: token.name, scene }])[0];
    const damage = resolveDamage({ rating: KNOCK_AWAY.damage + (sentinel ? (actor.system.damageBonus ?? 0) : 0), sl: 0, kind: "physical", school: "physical",
      location: "body", apByLocation: snapshot.apByLocation, immune: snapshot.immune, vulnerable: snapshot.vulnerable,
      slAddsToDamage: false, dealtHalved: dealtHalvedBy(actor), passedHalf: resisted });
    result.damage = damage.damage; result.immune = damage.immune;
    if (!damage.immune) {
      result.damageAttempted = true;
      await victim.applyDamage(damage.damage, { struck: true, attack: true, location: "body", type: "physical",
        by: actor, spell: false, messageId: card?.id ?? null, parts: damage.parts ?? null });
      result.damageApplied = true;
    }
    reason = validate(); if (reason) return refuse(reason);
    if (!resisted) {
      if ((victim.system?.refuses ?? []).includes("forcedMovement")) {
        result.push = { name: token.name, feet: 0, moved: false, reason: "immovable" };
      } else {
        result.pushAttempted = true;
        result.push = await forceMove({ token, from: origin.getCenterPoint(), feet: KNOCK_AWAY.push, toward: "away", by: actor });
        if (!result.push || ["gone", "noGM", "unchecked", "unmeasured"].includes(result.push.reason)) return refuse("movement");
      }
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>Knock Away</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:knock-away",
        casting: false, success: true, knockAway: result,
        targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: token.name }] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) {
    console.warn("azeroth-rpg | Knock Away", error); return refuse("write");
  } finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p>Knock Away stopped after payment. Do not repeat completed damage or movement.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
          flags: { "azeroth-rpg": { kind: "knockAwayReport", knockAway: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Knock Away partial report", error); }
    }
  }
}
