import { LESSER_INVISIBILITY, lesserInvisibilityAllowed, lesserInvisibilityEffect, isLesserInvisibilityEffect } from "../rules/lesser-invisibility.mjs";
import { runLesserInvisibility } from "./lesser-invisibility-state.mjs";
import { postLesserInvisibility } from "./lesser-invisibility-feedback.mjs";
import { withLesserInvisibilityLock } from "./lesser-invisibility.mjs";
import { npcSneakInCombat } from "./npc-sneak.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const LESSER_INVISIBILITY_QUERY = "azeroth-rpg.lesserInvisibility";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestLesserInvisibility(actor, index) {
  try {
    const data = { actorUuid: actor.uuid, index, requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = gmHere() ? await lesserInvisibilityQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(LESSER_INVISIBILITY_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Lesser Invisibility could not be confirmed. It requires 2 Mana and a living creature outside combat. Check its payment record and effects before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Lesser Invisibility request", error);
    ui.notifications?.warn("Lesser Invisibility could not be confirmed. Check the creature's Mana and effects before trying again.");
    return null;
  }
}

export async function lesserInvisibilityQueryHandler({ actorUuid, index, requestId, issuedAt } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof actorUuid !== "string" || !Number.isInteger(index)
    || typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId)
    || !Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 5000 || Date.now() >= issuedAt + 600000) return refuse("request");
  return withLesserInvisibilityLock(actorUuid, async () => {
    const actor = await fromUuid(actorUuid);
    const mana = actor?.system?.power?.value, health = actor?.system?.health?.value;
    const temporaryHealth = actor?.system?.health?.temp;
    const start = game.time?.worldTime;
    let consumed = false;
    const valid = () => {
      if (!gmHere() || actor?.documentName !== "Actor" || fromUuidSync(actorUuid) !== actor
        || !actor.testUserPermission(user, "OWNER") || !Number.isInteger(start) || start < 0 || game.time?.worldTime !== start) return false;
      const row = actor.system?.creatureAbilities?.[index], automation = row?.automation;
      if (row?.name !== LESSER_INVISIBILITY.name || automation?.kind !== "utility" || automation.action !== "action"
        || automation.cost?.pool !== "power" || automation.cost.amount !== LESSER_INVISIBILITY.mana || automation.uses?.max > 0) return false;
      if ((actor.system.power.name ?? "mana") !== "mana" || actor.system.power.value !== mana - (consumed ? LESSER_INVISIBILITY.mana : 0)
        || actor.system.health.value !== health || actor.system.health.temp !== temporaryHealth) return false;
      if (!lesserInvisibilityAllowed({ type: actor.type, health, mana, inCombat: npcSneakInCombat(actor),
        active: values(actor.effects).some(effect => isLesserInvisibilityEffect(effect, actor.uuid)) })) return false;
      return !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
        && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
        && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability");
    };
    if (!valid()) return refuse("ineligible");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    const result = await runLesserInvisibility({ actor, requestId, validate: valid,
      payAction: async () => valid() ? spendTurnBudget(actor, "action") : false,
      payMana: async () => {
        if (!valid()) return undefined;
        await actor.update({ "system.power.value": mana - LESSER_INVISIBILITY.mana });
        consumed = true;
        return valid() ? true : undefined;
      },
      apply: async ({ valid: claimValid }) => {
        if (!claimValid()) return null;
        const payload = lesserInvisibilityEffect({ ownerUuid: actor.uuid, castId: requestId, worldTime: start });
        if (!payload) return null;
        const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [payload]);
        if (!effect?.id || !values(actor.effects).includes(effect) || !isLesserInvisibilityEffect(effect, actor.uuid)
          || effect.disabled === true || effect.active === false || effect.isSuppressed === true) return null;
        return { effectId: effect.id };
      }
    });
    if (result.ok) {
      try {
        const { sourceOf } = await import("../applications/roll-dialog.mjs");
        await postLesserInvisibility({ actor, userId: user.id, effectId: result.effectId, source: sourceOf(actor) });
      } catch (error) {
        console.warn("azeroth-rpg | Lesser Invisibility feedback unavailable", error);
        ui.notifications?.warn("Lesser Invisibility was applied, but its feedback could not be shown. Check the existing effect before using it again.");
      }
    }
    return result;
  });
}
