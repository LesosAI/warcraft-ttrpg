import { GHOUL_ENRAGE as SPEC } from "../rules/naxxramas-ghoul.mjs";
import { GHOUL_ENRAGE_FLAG as FLAG, ghoulEnrageEligible, ghoulEnrageEffect, hasGhoulEnrage } from "../rules/ghoul-enrage.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
export const GHOUL_ENRAGE_QUERY = "azeroth-rpg.ghoulEnrage";
export const GHOUL_ENRAGE_RECEIPTS = "ghoulEnrageReceipts";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestGhoulEnrage(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await ghoulEnrageQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(GHOUL_ENRAGE_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize(
      result?.paid !== false || ["reconcile", "alreadyClaimed", "receiptInvalid", "claimUnconfirmed"].includes(result?.reason)
        ? "AZEROTH.GhoulEnrage.Review" : "AZEROTH.GhoulEnrage.Requirements"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Ghoul Enrage request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.GhoulEnrage.Interrupted"));
    return null;
  }
}

export async function ghoulEnrageQueryHandler({ actorUuid, index, source = null, requestId } = {}, { user } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid, consumed });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || typeof requestId !== "string" || !requestId.trim() || busy.has(actor.uuid)) return refuse("busy");
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
      && actor.system.health?.value > 0 && (consumed || ghoulEnrageEligible(actor.system.health))
      && !actor.statuses?.has("stunned") && !projectionRefusal(actor, "ability")
      && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability");
  };
  const read = () => actor.getFlag("azeroth-rpg", GHOUL_ENRAGE_RECEIPTS) ?? [];
  let expected, receipt;
  // Persist the claim before any payment. An interrupted attempt stays claimed
  // until the GM reconciles it, even if the encounter later restores the use.
  const save = async patch => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || JSON.stringify(read()) !== JSON.stringify(expected))
      throw new Error("Ghoul Enrage receipt changed");
    const next = structuredClone(expected);
    next[next.length - 1] = { ...receipt, ...patch };
    await actor.setFlag("azeroth-rpg", GHOUL_ENRAGE_RECEIPTS, next);
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || JSON.stringify(read()) !== JSON.stringify(next))
      throw new Error("Ghoul Enrage receipt unconfirmed");
    expected = next; receipt = next.at(-1);
  };
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    if (!valid()) return refuse("invalid");
    if (hasGhoulEnrage(actor, now)) return refuse("active");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!valid() || JSON.stringify(read()) !== JSON.stringify(expected)) return refuse("changed");
    const prior = expected;
    receipt = { requestId, cast: requestId, stage: "paying", paid: null, consumed: false, time: now };
    const claimed = [...prior, receipt];
    await actor.setFlag("azeroth-rpg", GHOUL_ENRAGE_RECEIPTS, claimed);
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || JSON.stringify(read()) !== JSON.stringify(claimed))
      return refuse("claimUnconfirmed");
    expected = claimed;
    if (!valid()) { await save({ stage: "cancelled", paid: false }); return refuse("changed"); }
    paid = null;
    if (!await spendTurnBudget(actor, SPEC.action)) { paid = false; await save({ stage: "cancelled", paid: false }); return refuse("action"); }
    paid = true;
    await save({ paid: true });
    if (!valid()) return refuse("changed");
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    if (!valid()) return refuse("paymentUnconfirmed");
    await save({ stage: "applying", consumed: true });
    if (!valid()) return refuse("changed");
    const cast = requestId, data = ghoulEnrageEffect({ sourceUuid: actor.uuid, cast, time: now });
    data.name = game.i18n.localize("AZEROTH.GhoulEnrage.Name");
    data.description = game.i18n.localize("AZEROTH.GhoulEnrage.Description");
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!valid() || !effect?.id || ![...actor.effects].includes(effect) || effect.flags?.["azeroth-rpg"]?.[FLAG]?.cast !== cast)
      return refuse("effectUnconfirmed");
    await save({ stage: "effectConfirmed", effectId: effect.id });
    if (!valid()) return refuse("changed");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${data.name}</strong></p>${data.description}`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:ghoul-enrage",
        casting: false, success: true, targets: [] } } });
    await save({ stage: "complete", effectId: effect.id });
    return { ok: true, paid, consumed, effectId: effect.id };
  } catch (error) { console.warn("azeroth-rpg | Ghoul Enrage", error); return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
