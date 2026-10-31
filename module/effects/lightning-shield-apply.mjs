import { lightningShieldCarrierState, LIGHTNING_SHIELD_FLAG } from "./lightning-shield.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const LIGHTNING_SHIELD_APPLY_QUERY = "azeroth-rpg.lightningShieldApply";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const receiptOf = message => flagsOf(message).lightningShieldApply;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const casterOf = message => flagsOf(message).caster ? resolve(flagsOf(message).caster) : ChatMessage.getSpeakerActor(message.speaker);

export async function requestLightningShieldApply(message) {
  try {
    const data = { messageUuid: message.uuid };
    const result = gmHere() ? await lightningShieldApplyHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(LIGHTNING_SHIELD_APPLY_QUERY, data, { timeout: 60000 });
    if (!result?.ok && result?.reason !== "claimed") ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.ApplyInterrupted"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Shield Apply request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.ApplyInterrupted"));
    return null;
  }
}

/** The original cast card owns the receipt even after Dispel or last charge.
 * An interrupted Apply remains claimed: retrying it cannot silently refresh
 * a shield whose creation response was lost.
 */
export async function lightningShieldApplyHandler({ messageUuid } = {}, { user } = {}) {
  const message = resolve(messageUuid), actor = message ? casterOf(message) : null;
  const valid = () => gmHere() && user?.id && message?.documentName === "ChatMessage" && resolve(messageUuid) === message
    && actor?.documentName === "Actor" && resolve(actor.uuid) === actor && casterOf(message) === actor
    && actor.testUserPermission(user, "OWNER") && actor.testUserPermission(message.author, "OWNER")
    && flagsOf(message).kind === "spell" && flagsOf(message).identifier === "lightning-shield"
    && flagsOf(message).success === true && !projectionRefusal(actor, "ability") && !realmRefusalFor(actor, "ability");
  if (!valid()) return { ok: false, reason: "unavailable" };
  if (busy.has(actor.uuid)) return { ok: false, reason: "busy" };
  busy.add(actor.uuid);
  try {
    if (receiptOf(message)) return { ok: false, reason: "claimed" };
    const state = lightningShieldCarrierState(actor, message);
    if (!state) return { ok: false, reason: "state" };
    const receipt = { actorUuid: actor.uuid, castId: message.uuid, phase: "claimed" };
    await message.update({ "flags.azeroth-rpg.lightningShieldApply": receipt });
    if (!valid() || JSON.stringify(receiptOf(message)) !== JSON.stringify(receipt)) return { ok: false, reason: "claimUnconfirmed" };
    const old = [...actor.effects].filter(effect => effect.flags?.["azeroth-rpg"]?.identifier === "lightning-shield").map(effect => effect.id);
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
    if (!valid() || [...actor.effects].some(effect => effect.flags?.["azeroth-rpg"]?.identifier === "lightning-shield"))
      return { ok: false, reason: "replacementUnconfirmed" };
    const flags = flagsOf(message);
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: flags.spellName ?? "Lightning Shield", img: flags.spellImg ?? "icons/svg/aura.svg",
      origin: actor.uuid, transfer: false, description: flags.effectHTML ?? "", system: { changes: [] },
      start: { time: state.startedAt }, duration: { value: 3600, units: "seconds", expiry: "turnStart" },
      flags: { "azeroth-rpg": { spell: flags.spellUuid ?? null, spellName: flags.spellName ?? "Lightning Shield",
        identifier: "lightning-shield", cast: flags.cast ?? null, messageId: message.id, [LIGHTNING_SHIELD_FLAG]: state } }
    }]);
    if (!valid() || !effect || actor.effects.get(effect.id) !== effect
      || JSON.stringify(effect.flags?.["azeroth-rpg"]?.[LIGHTNING_SHIELD_FLAG]) !== JSON.stringify(state))
      return { ok: false, reason: "creationUnconfirmed" };
    await message.update({ "flags.azeroth-rpg.lightningShieldApply": { ...receipt, phase: "applied", effectId: effect.id } });
    if (!valid() || receiptOf(message)?.effectId !== effect.id) return { ok: false, reason: "receiptUnconfirmed" };
    return { ok: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Shield Apply", error);
    return { ok: false, reason: "writeUncertain" };
  } finally { busy.delete(actor.uuid); }
}
