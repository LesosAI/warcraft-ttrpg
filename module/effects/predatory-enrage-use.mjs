import { PREDATORY_ENRAGE as SPEC, PREDATORY_ENRAGE_FLAG as FLAG, predatoryEnrageEligible, predatoryEnrageEffect, hasPredatoryEnrage } from "../rules/predatory-enrage.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
export const PREDATORY_ENRAGE_QUERY = "azeroth-rpg.predatoryEnrage";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestPredatoryEnrage(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await predatoryEnrageQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(PREDATORY_ENRAGE_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid !== false
      ? "Predatory Enrage could not be confirmed. Review its Half-Action, remaining use and effect before continuing."
      : "Predatory Enrage requires a living creature at 30% Health or less, a Half-Action and an available use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Predatory Enrage request", error);
    ui.notifications?.warn("Predatory Enrage's response was interrupted. Check the result before trying again.");
    return null;
  }
}

export async function predatoryEnrageQueryHandler({ actorUuid, index, source = null } = {}, { user } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid, consumed });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const now = game.time?.worldTime;
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : null; };
  const started = clock(), scene = source ? game.scenes?.get(source.sceneId) : null, token = scene?.tokens.get(source?.tokenId);
  const valid = () => {
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    return gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
      && Number.isFinite(now) && game.time.worldTime === now && clock() === started
      && (!source || (game.scenes.get(scene?.id) === scene && scene?.tokens.get(token?.id) === token && token?.actor === actor))
      && row?.name === SPEC.name && a?.kind === "utility" && a.action === SPEC.action && !a.cost?.amount
      && a.uses?.max === 1 && a.uses?.per === SPEC.per && a.uses.value === (consumed ? 0 : 1)
      && actor.system.health?.value > 0 && (consumed || predatoryEnrageEligible(actor.system.health))
      && !actor.statuses?.has("stunned") && !projectionRefusal(actor, "ability")
      && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability");
  };
  try {
    if (!valid()) return refuse("invalid");
    if (hasPredatoryEnrage(actor, now)) return refuse("active");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    paid = null;
    if (!await spendTurnBudget(actor, SPEC.action)) { paid = false; return refuse("action"); }
    paid = true;
    if (!valid()) return refuse("changed");
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    if (!valid()) return refuse("paymentUnconfirmed");
    const cast = foundry.utils.randomID(), data = predatoryEnrageEffect({ sourceUuid: actor.uuid, cast, time: now });
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!valid() || !effect?.id || ![...actor.effects].includes(effect) || effect.flags?.["azeroth-rpg"]?.[FLAG]?.cast !== cast)
      return refuse("effectUnconfirmed");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>Predatory Enrage</strong></p>${data.description}`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:predatory-enrage",
        casting: false, success: true, targets: [] } } });
    return { ok: true, paid, consumed, effectId: effect.id };
  } catch (error) { console.warn("azeroth-rpg | Predatory Enrage", error); return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
