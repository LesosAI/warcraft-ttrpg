/** Paid single-target Nature stun, resolved on the active GM's client. */
import { ENVELOPING_WINDS as SPEC } from "../rules/enveloping-winds.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
export const ENVELOPING_WINDS_QUERY = "azeroth-rpg.envelopingWinds";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestEnvelopingWinds(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await envelopingWindsQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ENVELOPING_WINDS_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Enveloping Winds stopped after payment. Check its recorded result before continuing."
      : "Enveloping Winds was not used. Check the target, range, action, Mana and remaining use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Enveloping Winds request", error);
    ui.notifications?.warn("Enveloping Winds could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function envelopingWindsQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const result = { attempted: false, applied: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const token = targets[0]?.sceneId === scene?.id ? scene?.tokens.get(targets[0]?.tokenId) : null;
  const victim = token?.actor;
  if (!victim?.uuid || victim.uuid === actor.uuid || origin?.actor !== actor) return refuse("target");
  const keys = [actor.uuid, victim.uuid];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  keys.forEach(key => busy.add(key));
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock(), mana = actor.system?.power?.value;
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor || fromUuidSync(victim.uuid) !== victim) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index], auto = row?.automation;
    if (row?.name !== SPEC.name || auto?.kind !== "utility" || auto.dc !== SPEC.dc || auto.action !== SPEC.action
      || auto.cost?.pool !== "power" || auto.cost.amount !== SPEC.power
      || auto.uses?.max !== SPEC.uses || auto.uses.per !== SPEC.per || auto.uses.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system?.health?.value > 0) || !(victim.system?.health?.value > 0)
      || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("silenced") || actor.statuses?.has("stunned")) return "sourceOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.power
      || actor.system.power.value !== mana - (consumed ? SPEC.power : 0)) return "mana";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    const distance = feetApart(origin, token);
    return !Number.isFinite(distance) || distance < 0 || distance > SPEC.feet ? "range" : null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.power.value": mana - SPEC.power, "system.creatureAbilities": abilities }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
    result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.attempted = true;
      const landed = await inflictCondition({ victim, by: actor, id: SPEC.condition, name: token.name,
        until: untilEndOfNextTurnOrRound(victim) });
      result.immune = landed?.reason === "immune"; result.applied = landed?.landed === true;
      if (!result.applied && !result.immune) return refuse("effectUncertain");
      reason = validate(); if (reason) return refuse(reason);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Enveloping Winds</strong></p><p>${foundry.utils.escapeHTML(token.name ?? "Target")}: ${result.resisted ? "resisted" : result.immune ? "immune to Stunned" : "Stunned until the end of its next turn"}.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:enveloping-winds",
        casting: false, success: true, envelopingWinds: result,
        targets: result.applied ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: token.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Enveloping Winds", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Enveloping Winds stopped after payment. Check Mana, the remaining use, the resistance result and any applied stun; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "envelopingWindsReport", envelopingWinds: result, resourcesConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Enveloping Winds partial report", error); }
    }
  }
}
