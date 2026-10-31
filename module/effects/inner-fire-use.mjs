/** Self-only paid Inner Fire, executed by the active GM. */
import { INNER_FIRE as SPEC } from "../rules/inner-fire.mjs";
import { innerFireEffect, INNER_FIRE_FLAG as FLAG } from "../rules/inner-fire.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { withInnerFireLock } from "./inner-fire.mjs";
export const INNER_FIRE_QUERY = "azeroth-rpg.innerFire";
const busy = new Set();
const REQUESTS = "innerFireRequests";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestInnerFire(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = gmHere() ? await innerFireQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(INNER_FIRE_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Inner Fire stopped after payment. Check Mana and the effect before resolving it manually."
      : "Inner Fire requires a living creature, 2 Mana and an Action.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Inner Fire request", error);
    ui.notifications?.warn("Inner Fire could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function innerFireQueryHandler({ actorUuid, index, source = null, requestId, issuedAt } = {}, { user } = {}) {
  return withInnerFireLock(actorUuid, () => resolveInnerFireUse({ actorUuid, index, source, requestId, issuedAt }, { user }));
}

async function resolveInnerFireUse({ actorUuid, index, source, requestId, issuedAt }, { user }) {
  let paid = false, consumed = false, finished = false;
  const result = { attempted: false, applied: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const fight = () => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
  const clock = () => { const combat = fight(); return combat
    ? { combatUuid: combat.uuid, clock: { round: combat.round, turn: combat.turn } } : { time: game.time?.worldTime }; };
  const started = JSON.stringify(clock());
  const mana = actor.system?.power?.value;
  const scene = source ? game.scenes?.get(source.sceneId) : null;
  const token = scene?.tokens.get(source?.tokenId);
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor) return "owner";
    if (JSON.stringify(clock()) !== started) return "clock";
    if (source && (game.scenes.get(scene?.id) !== scene || scene?.tokens.get(token?.id) !== token || token?.actor !== actor)) return "source";
    const row = actor.system?.creatureAbilities?.[index], health = actor.system?.health;
    if (row?.name !== SPEC.name || row.automation?.kind !== "utility" || row.automation?.action !== SPEC.action
      || row.automation?.cost?.pool !== "power" || Number(row.automation?.cost?.amount) !== SPEC.mana
) return "ability";
    if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max) || health.value <= 0
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")
      || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return "healthOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.mana
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const startedAt = game.time?.worldTime;
    if (!Number.isInteger(startedAt)) return refuse("clock");
    if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId)
      || !Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 5000 || Date.now() >= issuedAt + 600000)
      return refuse("expiredRequest");
    const held = [...actor.effects].filter(e => e.flags?.["azeroth-rpg"]?.[FLAG]);
    if (held.length > 1) return refuse("conflictingCarriers");
    const receipts = actor.getFlag("azeroth-rpg", REQUESTS) ?? [];
    if (!Array.isArray(receipts)) return refuse("record");
    const current = receipts.filter(r => Number.isFinite(r?.expiresAt) && r.expiresAt > Date.now());
    if (current.some(r => r.requestId === requestId)) return refuse("replayedRequest");
    const effectData = innerFireEffect({ ap: actor.system.ap, ownerUuid: actor.uuid, castId: requestId,
      time: startedAt, timing: { duration: { value: SPEC.seconds, units: "seconds" }, start: { time: startedAt } } });
    if (!effectData) return refuse("armor");
    await actor.setFlag("azeroth-rpg", REQUESTS, [...current, { requestId, expiresAt: issuedAt + 600000 }]);
    if (!actor.getFlag("azeroth-rpg", REQUESTS)?.some(r => r.requestId === requestId)) return refuse("receiptUnconfirmed");
    reason = validate(); if (reason) return refuse(reason);
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    await actor.update({ "system.power.value": mana - SPEC.mana });
    consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    result.attempted = true;
    let effect;
    if (held.length) {
      effect = held[0];
      if (![...actor.effects].includes(effect)) return refuse("changedCarrier");
      await effect.update(effectData);
    } else [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    result.effectId = effect?.id ?? null;
    result.applied = Boolean(effect?.id) && [...actor.effects].includes(effect) && effect.flags?.["azeroth-rpg"]?.[FLAG]?.castId === requestId && effect.disabled !== true;
    if (!result.applied) return refuse("effect");
    reason = validate(); if (reason) return refuse(reason);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Inner Fire</strong></p><p>Gain +2 Armor Points for ten minutes, with twenty charges. Each weapon hit that damages Health or temporary Health spends one charge after damage. Recasting replaces this protection; it does not stack.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:inner-fire",
        casting: false, success: true, innerFire: result,
        targets: token ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid, name: actor.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Inner Fire", error); return refuse("write"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Inner Fire stopped after payment. Check Mana and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "innerFireReport", innerFire: result, manaConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Inner Fire partial report", error); }
    }
  }
}
