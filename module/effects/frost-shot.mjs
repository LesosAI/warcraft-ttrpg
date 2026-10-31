/** Active-GM Slowed carrier for an already rolled Frost Shot. */
import { frostShotEffect, FROST_SHOT_FLAG } from "../rules/frost-shot.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const markerOf = message => flagsOf(message).frostShotAttack;

export function frostShotHitValid(message, source, target) {
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

export async function layFrostShot({ message, source, target, timing } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!frostShotHitValid(message, source, target)) return refuse("hit");
  if ((target.system?.conditionImmunities ?? []).includes("slowed")) return refuse("immune");
  const data = frostShotEffect({ sourceUuid: source.uuid, targetUuid: target.uuid, messageUuid: message.uuid, timing });
  if (!data) return refuse("timing");
  if (pending.has(message.uuid)) return refuse("busy");
  if (flagsOf(message).frostShotClaim) return refuse("claimed");
  pending.add(message.uuid);
  let created = null;
  try {
    await message.update({ "flags.azeroth-rpg.frostShotClaim": true });
    if (!frostShotHitValid(message, source, target)) return refuse("withdrawn");
    if (flagsOf(message).frostShotClaim !== true) return refuse("claimUnverified");
    if ((target.system?.conditionImmunities ?? []).includes("slowed")) return refuse("immune");
    [created] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!created?.id) return refuse("writeUncertain");
    if (!frostShotHitValid(message, source, target)
      || (target.system?.conditionImmunities ?? []).includes("slowed")) {
      await target.deleteEmbeddedDocuments("ActiveEffect", [created.id]);
      return refuse("withdrawn");
    }
    return { ok: true, effectId: created.id };
  } catch { return { ok: false, reason: "writeUncertain", effectId: created?.id ?? null }; }
  finally { pending.delete(message.uuid); }
}

/** Withdraw only this card's carrier, leaving unrelated slowing effects untouched. */
export async function withdrawFrostShot(message) {
  if (!gmHere() || resolve(message?.uuid) !== message || (flagsOf(message).damageByTarget?.[0]?.withdrawn !== true && flagsOf(message).damageByTarget?.[0]?.hit !== false)) return [];
  const target = resolve(markerOf(message)?.targetUuid);
  if (!target) return [];
  const ids = [...(target.effects ?? [])].filter(effect => {
    const state = effect.flags?.["azeroth-rpg"]?.[FROST_SHOT_FLAG];
    return state?.version === 1 && state.messageUuid === message.uuid && state.targetUuid === target.uuid
      && state.sourceUuid === markerOf(message)?.sourceUuid && effect.origin === state.sourceUuid;
  }).map(effect => effect.id);
  if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids;
}

export function registerFrostShotHooks() {
  const clean = message => {
    if (!markerOf(message)) return;
    return withdrawFrostShot(message).catch(() => {
      ui.notifications?.warn("Frost Shot's withdrawn slowing effect could not be removed. Check the target's effects.");
    });
  };
  Hooks.on("updateChatMessage", clean);
  Hooks.on("ready", () => Promise.all((game.messages?.contents ?? []).map(clean)));
}
