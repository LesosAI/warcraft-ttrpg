/** Paid, single-target Sleep. All mutations run on the active GM's client. */
import { DREADLORD_SLEEP as SPEC, SLEEP_FLAG, sleepEligible, sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { kindsOfActor } from "./area-strikes.mjs";
import { layDreadlordSleep } from "./dreadlord-sleep.mjs";
export const DREADLORD_SLEEP_QUERY = "azeroth-rpg.dreadlordSleep";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestDreadlordSleep(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await dreadlordSleepQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DREADLORD_SLEEP_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Sleep stopped after payment. Check the result before trying again."
      : "Sleep was not used. Check the target, range, available actions and Mana.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Sleep request", error);
    ui.notifications?.warn("Sleep could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function dreadlordSleepQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
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
  const validate = (allowSleep = false) => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor || fromUuidSync(victim.uuid) !== victim) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== SPEC.name || row.automation?.kind !== "utility" || row.automation?.dc !== SPEC.dc
      || row.automation?.action !== SPEC.action || row.automation?.cost?.pool !== "power"
      || row.automation?.cost?.amount !== SPEC.power) return "ability";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")
      || actor.statuses?.has("silenced") || actor.statuses?.has("stunned")) return "sourceOrRealm";
    if (!sleepEligible({ kinds: kindsOfActor(victim), immunities: victim.system?.conditionImmunities ?? [], health: victim.system?.health?.value })) return "immune";
    if (!allowSleep && [...(victim.effects ?? [])].some(effect => effect.flags?.["azeroth-rpg"]?.[SLEEP_FLAG])) return "asleep";
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
    await actor.update({ "system.power.value": mana - SPEC.power }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: "spirit", dc: SPEC.dc, subtitle: SPEC.name });
    result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.attempted = true;
      // Once creation begins, its own carrier is expected to appear.
      const validWhileLaying = () => validate(true) === null;
      const landed = await layDreadlordSleep({ victim, by: actor, valid: validWhileLaying });
      result.effectId = landed?.effectId ?? null;
      result.applied = landed?.ok === true && !!landed.effectId;
      if (!result.applied) return refuse("effect");
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Sleep</strong></p><p>${foundry.utils.escapeHTML(victim.name ?? "Target")}: ${result.resisted ? "resisted" : "asleep until the end of its next turn; losing Health wakes it"}.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:sleep",
        casting: false, success: true, sleep: result,
        targets: result.applied ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Sleep", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Sleep stopped after payment. Check Mana, the resistance result and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "sleepReport", sleep: result, manaConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Sleep partial report", error); }
    }
  }
}
