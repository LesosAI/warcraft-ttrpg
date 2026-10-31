/** Active-GM Bleeding carrier for an already rolled Serrated Bite. */
import { serratedBiteEffect, SERRATED_BITE_FLAG } from "../rules/serrated-bite.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const markerOf = message => flagsOf(message).serratedBiteAttack;

export function serratedBiteHitValid(message, source, target) {
  const flags = flagsOf(message), marker = markerOf(message), targets = flags.targets;
  const recorded = targets?.[0];
  const recordedActor = recorded?.sceneId && recorded?.tokenId
    ? resolve(`Scene.${recorded.sceneId}.Token.${recorded.tokenId}`)?.actor : null;
  return gmHere() && resolve(message?.uuid) === message && resolve(source?.uuid) === source
    && resolve(target?.uuid) === target && Boolean(source?.uuid && target?.uuid)
    && marker?.sourceUuid === source.uuid && marker?.targetUuid === target.uuid
    && flags.kind === "attack" && message.rolls?.[0]?.outcome?.success === true
    && Array.isArray(targets) && targets.length === 1
    && (recordedActor === target || (!recorded?.sceneId && !recorded?.tokenId && recorded?.actorUuid === target.uuid))
    && flags.damageByTarget?.length === 1 && flags.damageByTarget[0]?.hit === true
    && flags.damageByTarget[0]?.withdrawn !== true;
}

export async function laySerratedBite({ message, source, target, timing } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!serratedBiteHitValid(message, source, target)) return refuse("hit");
  if ((target.system?.conditionImmunities ?? []).includes("bleeding")) return refuse("immune");
  const data = serratedBiteEffect({ sourceUuid: source.uuid, targetUuid: target.uuid, messageUuid: message.uuid, timing });
  if (!data) return refuse("timing");
  if (pending.has(message.uuid)) return refuse("busy");
  if (flagsOf(message).serratedBiteClaim) return refuse("claimed");
  pending.add(message.uuid);
  let created = null;
  try {
    await message.update({ "flags.azeroth-rpg.serratedBiteClaim": true });
    if (!serratedBiteHitValid(message, source, target)) return refuse("withdrawn");
    if (flagsOf(message).serratedBiteClaim !== true) return refuse("claimUnverified");
    [created] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!created?.id) return refuse("writeUncertain");
    if (!serratedBiteHitValid(message, source, target)) {
      await target.deleteEmbeddedDocuments("ActiveEffect", [created.id]);
      return refuse("withdrawn");
    }
    return { ok: true, effectId: created.id };
  } catch { return { ok: false, reason: "writeUncertain", effectId: created?.id ?? null }; }
  finally { pending.delete(message.uuid); }
}

/** Withdraw only this card's carrier, leaving unrelated wounds untouched. */
export async function withdrawSerratedBite(message) {
  if (!gmHere() || resolve(message?.uuid) !== message || flagsOf(message).damageByTarget?.[0]?.withdrawn !== true) return [];
  const target = resolve(markerOf(message)?.targetUuid);
  if (!target) return [];
  const ids = [...(target.effects ?? [])].filter(effect => {
    const state = effect.flags?.["azeroth-rpg"]?.[SERRATED_BITE_FLAG];
    return state?.messageUuid === message.uuid && state?.targetUuid === target.uuid;
  }).map(effect => effect.id);
  if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids;
}

export function registerSerratedBiteHooks() {
  const clean = message => {
    if (!markerOf(message)) return;
    return withdrawSerratedBite(message).catch(() => {
      ui.notifications?.warn("Serrated Bite's withdrawn wound could not be removed. Check the target's effects.");
    });
  };
  Hooks.on("updateChatMessage", clean);
  Hooks.on("ready", () => Promise.all((game.messages?.contents ?? []).map(clean)));
}
