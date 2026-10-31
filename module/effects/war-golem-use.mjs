import { warGolemAttack, warGolemOutcome } from "../rules/war-golem.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { forceMove, forcedWords } from "./forced-movement.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const WAR_GOLEM_QUERY = "azeroth-rpg.warGolemAttack";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestWarGolemAttack(actor, index, key) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, key, source: sourceOf(actor) };
    const result = gmHere() ? await warGolemQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WAR_GOLEM_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid !== false
      ? "The golem's attack was interrupted. Review payment, damage and movement before continuing."
      : "The golem cannot use that attack now. Check its source, remaining use and reviewed enemies.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | War Golem request", error);
    ui.notifications?.warn("The golem's result could not be confirmed. Check the GM's results before trying again.");
    return null;
  }
}

export async function warGolemQueryHandler({ actorUuid, index, key, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null;
  const results = [], locks = [], spec = warGolemAttack(key);
  const refuse = reason => ({ ok: false, reason, paid, consumed, results });
  if (!spec || !gmHere() || !user?.id) return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  locks.push(actor.uuid); busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const position = () => [origin?.x, origin?.y, origin?.elevation].join(":");
  const initialPosition = position(), time = game.time?.worldTime;
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? [c.uuid, c.round, c.turn].join(":") : null; };
  const started = clock();
  const valid = (area = true) => {
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    return gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
      && Number.isFinite(time) && game.time.worldTime === time && clock() === started && position() === initialPosition
      && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(origin?.id) === origin && origin?.actor === actor
      && actor.system.health?.value > 0 && !actor.statuses?.has("stunned")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
      && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
      && Number.isInteger(index) && row?.name === spec.name && a?.kind === "utility" && a.action === spec.action
      && !a.cost?.amount && a.uses?.max === spec.uses && a.uses.per === spec.per && a.uses.value === (consumed ? 0 : 1)
      && (!selection || ((!area || selection.valid()) && selection.targets.every(t =>
        scene.tokens.get(t.token.id) === t.token && t.token.actor === t.actor && fromUuidSync(t.actorUuid) === t.actor
        && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability"))));
  };
  const report = () => results.map(r => `${r.name}: ${r.damageApplied ? `${r.damage} Physical damage applied`
    : r.damageAttempted ? "damage write uncertain; check Health" : "damage not applied"}; ${r.push ? forcedWords(r.push)
    : r.pushAttempted ? "movement uncertain; check token" : r.resisted ? "resisted" : "no movement resolved"}`).join("; ");
  try {
    if (!valid()) return refuse("invalid");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, chooseOption, name: spec.name,
      radius: spec.radius, payment: "Spend one Action and one Short Rest use." });
    if (!selection.ok) return refuse(selection.reason);
    if (!valid()) return refuse("changed");
    for (const target of selection.targets) {
      if (busy.has(target.actorUuid)) return refuse("busy");
      busy.add(target.actorUuid); locks.push(target.actorUuid);
    }
    paid = null;
    if (!await spendTurnBudget(actor, spec.action)) { paid = false; return refuse("action"); }
    paid = true;
    if (!valid()) return refuse("changed");
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    // Resolve the reviewed area before any intentional displacement changes it.
    for (const target of selection.targets) {
      if (!valid()) return refuse("changed");
      const result = { actorUuid: target.actorUuid, name: target.token.name, damageAttempted: false, damageApplied: false, pushAttempted: false };
      results.push(result);
      const card = await rollResilience({ actor: target.actor, resilience: spec.resilience, dc: spec.dc, subtitle: spec.name });
      result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
      const outcome = warGolemOutcome(key, result.resisted);
      if (!outcome) return refuse("unresolved");
      if (!valid()) return refuse("changed");
      const snapshot = targetSnapshots([{ id: target.token.id, actor: target.actor, name: target.token.name, scene }])[0];
      const damage = resolveDamage({ rating: spec.damage, sl: 0, kind: "physical", school: "physical", location: "body",
        apByLocation: snapshot.apByLocation, immune: snapshot.immune, vulnerable: snapshot.vulnerable,
        slAddsToDamage: false, dealtHalved: dealtHalvedBy(actor), passedHalf: result.resisted });
      result.damage = damage.damage; result.immune = damage.immune;
      if (!damage.immune) {
        result.damageAttempted = true;
        await target.actor.applyDamage(damage.damage, { struck: true, attack: true, location: "body", type: "physical",
          by: actor, spell: false, messageId: card?.id ?? null, parts: damage.parts ?? null });
        result.damageApplied = true;
      }
    }
    if (!valid()) return refuse("changed");
    if (spec.push) for (let i = 0; i < selection.targets.length; i++) {
      const target = selection.targets[i], result = results[i];
      if (!valid(false)) return refuse("changed");
      if (result.resisted) continue;
      const distance = feetApart(origin, target.token), point = origin.getCenterPoint?.();
      if (!Number.isFinite(distance) || distance < 0 || distance > spec.radius
        || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return refuse("range");
      if ((target.actor.system?.refuses ?? []).includes("forcedMovement")) {
        result.push = { name: target.token.name, feet: 0, moved: false, reason: "immovable" };
      } else {
        result.pushAttempted = true;
        result.push = await forceMove({ token: target.token, from: point, feet: spec.push, toward: "away", by: actor });
        if (!result.push || ["gone", "noGM", "unchecked", "unmeasured"].includes(result.push.reason)) return refuse("movement");
      }
    }
    if (!valid(false)) return refuse("changed");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${spec.name}</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: key === "stomp" ? "ability:golem-stomp" : "ability:golem-trample",
        casting: false, success: true, warGolem: results,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid })) } } });
    finished = true; return { ok: true, paid, consumed, results };
  } catch (error) {
    console.warn("azeroth-rpg | War Golem", error); return refuse("writeUncertain");
  } finally {
    locks.forEach(uuid => busy.delete(uuid));
    if (paid !== false && !finished) try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>${spec.name} was interrupted. Review payment and the recorded results. Do not repeat resolved damage or movement.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "warGolemReport", paid, consumed, results } } });
    } catch (error) { console.warn("azeroth-rpg | War Golem partial report", error); }
  }
}
