/** Paid, single-target Cause Insanity. All mutations run on the active GM's client. */
import { CAUSE_INSANITY as SPEC, INSANITY_FLAG, insanityEligible } from "../rules/cause-insanity.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layCauseInsanity } from "./cause-insanity.mjs";
export const CAUSE_INSANITY_QUERY = "azeroth-rpg.causeInsanity";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestCauseInsanity(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await causeInsanityQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CAUSE_INSANITY_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Cause Insanity stopped after payment. Check the result before trying again."
      : "Cause Insanity was not used. Check the target, range, available actions and Mana.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Cause Insanity request", error);
    ui.notifications?.warn("Cause Insanity could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function causeInsanityQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
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
  const validate = (allowControl = false) => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor || fromUuidSync(victim.uuid) !== victim) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== SPEC.name || row.automation?.kind !== "utility" || row.automation?.dc !== SPEC.dc
      || row.automation?.action !== SPEC.action || row.automation?.cost?.pool !== "power"
      || row.automation?.cost?.amount !== SPEC.mana) return "ability";
    if (row.automation?.uses?.max !== SPEC.uses || row.automation.uses.per !== SPEC.per
      || row.automation.uses.value !== (consumed ? 0 : 1)) return "uses";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")
      || actor.statuses?.has("silenced") || actor.statuses?.has("stunned")) return "sourceOrRealm";
    if (!insanityEligible({ typeMarker: victim.system?.typeMarker, immunities: victim.system?.conditionImmunities ?? [], health: victim.system?.health?.value })) return "immune";
    if (!allowControl && (victim.statuses?.has("charmed") || [...(victim.effects ?? [])].some(effect => effect.flags?.["azeroth-rpg"]?.[INSANITY_FLAG]))) return "controlled";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isInteger(mana) || mana < SPEC.mana
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
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
    await actor.update({ "system.power.value": mana - SPEC.mana, "system.creatureAbilities": abilities }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: "spirit", dc: SPEC.dc, subtitle: SPEC.name });
    result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.attempted = true;
      // Once creation begins, its own carrier is expected to appear.
      const validWhileLaying = () => validate(true) === null;
      const landed = await layCauseInsanity({ victim, by: actor, valid: validWhileLaying });
      result.effectId = landed?.effectId ?? null;
      result.applied = landed?.ok === true && !!landed.effectId;
      if (!result.applied) return refuse("effect");
    }
    reason = validate(result.applied); if (reason) return refuse(reason);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Cause Insanity</strong></p><p>${foundry.utils.escapeHTML(victim.name ?? "Target")}: ${result.resisted ? "resisted" : "under the Mindslayer’s direction until the end of its next turn, with +10 feet Speed and Extra Attack"}.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:cause-insanity",
        casting: false, success: result.applied, causeInsanity: result,
        targets: result.applied ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Cause Insanity", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Cause Insanity stopped after payment. Check Mana, the Short Rest use, the resistance result and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "causeInsanityReport", causeInsanity: result, manaAndUseConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Cause Insanity partial report", error); }
    }
  }
}
