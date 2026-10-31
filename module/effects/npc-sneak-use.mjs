import { NPC_SNEAK_FLAG, isNpcSneakEffect, npcSneakAllowed, npcSneakEffect } from "../rules/npc-sneak.mjs";
import { npcSneakInCombat, withNpcSneakLock } from "./npc-sneak.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const NPC_SNEAK_QUERY = "azeroth-rpg.npcSneak";
const RECEIPTS = "npcSneakRequests";
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestNpcSneak(actor, index) {
  try {
    const data = { actorUuid: actor.uuid, index, requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = gmHere() ? await npcSneakQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(NPC_SNEAK_QUERY, data, { timeout: 180000 });
    if (!result?.ok && !["cancelled", "testFailed"].includes(result?.reason)) {
      ui.notifications?.warn("Sneak could not be completed. It requires a living, unhidden creature outside combat. Check its effect before trying again.");
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Sneak request", error);
    ui.notifications?.warn("Sneak could not be confirmed. Check the creature's concealment and Speed before trying again.");
    return null;
  }
}

/** A request is consumed before its Test, even on failure/cancellation, so
 * network replay cannot produce a second roll or re-hide a revealed NPC. */
export async function npcSneakQueryHandler({ actorUuid, index, requestId, issuedAt } = {}, { user } = {}) {
  if (!gmHere() || !user?.id || typeof actorUuid !== "string") return { ok: false, reason: "gm" };
  return withNpcSneakLock(actorUuid, async () => {
    const refuse = reason => ({ ok: false, reason });
    const actor = await fromUuid(actorUuid);
    const eligible = () => {
      if (!gmHere() || actor?.documentName !== "Actor" || fromUuidSync(actorUuid) !== actor
        || !actor.testUserPermission(user, "OWNER")) return "owner";
      const row = actor.system?.creatureAbilities?.[index];
      if (!Number.isInteger(index) || row?.name !== "Sneak" || row.automation?.kind !== "utility") return "ability";
      const may = npcSneakAllowed({ type: actor.type, abilities: [row], health: actor.system?.health?.value,
        inCombat: npcSneakInCombat(actor), hidden: actor.statuses?.has("invisible") === true });
      if (!may.ok) return may.reason;
      if ([...actor.effects].some(effect => effect.flags?.["azeroth-rpg"]?.[NPC_SNEAK_FLAG])) return "existingCarrier";
      if (realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability")
        || despairRefusal(actor, "ability") || actor.statuses?.has("stunned")) return "incapacitated";
      return null;
    };
    try {
      let reason = eligible(); if (reason) return refuse(reason);
      if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId)
        || !Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 5000 || Date.now() >= issuedAt + 600000) return refuse("request");
      const receipts = actor.getFlag("azeroth-rpg", RECEIPTS) ?? [];
      if (!Array.isArray(receipts)) return refuse("receipts");
      const current = receipts.filter(row => Number.isFinite(row?.expiresAt) && row.expiresAt > Date.now());
      if (current.some(row => row.requestId === requestId)) return refuse("replay");
      await actor.setFlag("azeroth-rpg", RECEIPTS, [...current, { requestId, expiresAt: issuedAt + 600000 }]);
      if (!actor.getFlag("azeroth-rpg", RECEIPTS)?.some(row => row.requestId === requestId)) return refuse("receiptUnconfirmed");
      reason = eligible(); if (reason) return refuse(reason);
      const { stealthTestSpec } = await import("../applications/combat-actions.mjs");
      const { rollWithDialog } = await import("../applications/actions.mjs");
      const card = await rollWithDialog(actor, stealthTestSpec(actor));
      if (!card) return refuse("cancelled");
      if (card.rolls?.[0]?.outcome?.success !== true) return refuse("testFailed");
      reason = eligible(); if (reason) return refuse(reason);
      const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [npcSneakEffect({ ownerUuid: actor.uuid, castId: requestId })]);
      if (!effect?.id || ![...actor.effects].includes(effect) || effect.disabled === true
        || !isNpcSneakEffect(effect, actor.uuid)) return refuse("effectUnconfirmed");
      // Combat/death may race the write. Resolve this under the same lock;
      // queued hook cleanup will subsequently find nothing to do.
      if (npcSneakInCombat(actor) || actor.system.health.value <= 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        return refuse("interrupted");
      }
      const { sourceOf } = await import("../applications/roll-dialog.mjs");
      const source = sourceOf(actor);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
        content: "<p><strong>Sneak</strong></p><p>Hidden with half Speed. Sneak ends on combat entry, attack, spellcasting, revelation or death.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:npc-sneak",
          casting: false, success: true, targets: [] } } });
      return { ok: true, effectId: effect.id };
    } catch (error) {
      console.warn("azeroth-rpg | Sneak activation", error);
      return refuse("write");
    }
  });
}
