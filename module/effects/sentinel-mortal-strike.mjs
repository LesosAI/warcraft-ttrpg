import { sentinelMortalStrikeEffect } from "../rules/sentinel-mortal-strike.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { felguardStrikeSpec, mortalStrikeEffect, MORTAL_STRIKE_FLAGS } from "../rules/mortal-strike.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};

export function sentinelStrikeHitValid(message, source, target) {
  const flags = flagsOf(message), marker = flags.sentinelStrikeAttack;
  const recorded = flags.targets?.[0];
  const recordedActor = recorded?.sceneId && recorded?.tokenId
    ? resolve(`Scene.${recorded.sceneId}.Token.${recorded.tokenId}`)?.actor : null;
  return gmHere() && Boolean(source?.uuid && target?.uuid && message?.uuid)
    && resolve(message.uuid) === message && resolve(source.uuid) === source && resolve(target.uuid) === target
    && marker?.sourceUuid === source.uuid && marker?.targetUuid === target.uuid
    && flags.kind === "attack" && message.rolls?.[0]?.outcome?.success === true
    && flags.targets?.length === 1 && (recordedActor === target
      || (!recorded?.sceneId && !recorded?.tokenId && recorded?.actorUuid === target.uuid))
    && flags.damageByTarget?.length === 1 && flags.damageByTarget[0]?.hit === true
    && flags.damageByTarget[0]?.withdrawn !== true;
}

/** One persistent card claim, one timed carrier. Do not merge carriers from
 * different attacks: withdrawing one hit must not remove another hit's mark. */
export async function laySentinelMortalStrike({ message, source, target } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const marker = flagsOf(message).sentinelStrikeAttack;
  const kind = marker?.kind ?? "sentinel";
  const index = marker?.index;
  if (!Object.hasOwn(MORTAL_STRIKE_FLAGS, kind)) return refuse("hitOrPower");
  const valid = () => sentinelStrikeHitValid(message, source, target)
    && (flagsOf(message).sentinelStrikeAttack?.kind ?? "sentinel") === kind
    && (kind === "felguard" ? flagsOf(message).sentinelStrikeAttack?.index === index && Boolean(felguardStrikeSpec(source, index))
      : activeSentinelPowers(source).includes("mortal-strike"))
    && source.system?.health?.value > 0 && target.system?.health?.value > 0;
  if (!valid()) return refuse("hitOrPower");
  if (pending.has(message.uuid) || flagsOf(message).sentinelStrikeClaim) return refuse("claimed");
  const input = { sourceUuid: source.uuid, targetUuid: target.uuid,
    messageUuid: message.uuid, timing: untilEndOfNextTurnOrRound(source) };
  const data = kind === "felguard" ? mortalStrikeEffect({ ...input, kind, labels: {
    name: game.i18n.localize("AZEROTH.NpcMortalStrike.FelguardName"),
    description: game.i18n.localize("AZEROTH.NpcMortalStrike.FelguardDescription")
  } }) : sentinelMortalStrikeEffect(input);
  if (!data) return refuse("timing");
  pending.add(message.uuid);
  let made;
  try {
    await message.update({ "flags.azeroth-rpg.sentinelStrikeClaim": true });
    if (!valid() || flagsOf(message).sentinelStrikeClaim !== true) return refuse("changed");
    [made] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!made?.id) return refuse("writeUncertain");
    if (!valid()) {
      await target.deleteEmbeddedDocuments("ActiveEffect", [made.id]);
      return refuse("withdrawn");
    }
    return { ok: true, effectId: made.id };
  } catch { return { ok: false, reason: "writeUncertain", effectId: made?.id ?? null }; }
  finally { pending.delete(message.uuid); }
}

export async function withdrawSentinelMortalStrike(message) {
  const flags = flagsOf(message), marker = flags.sentinelStrikeAttack;
  if (!gmHere() || resolve(message?.uuid) !== message || !marker
    || (flags.damageByTarget?.[0]?.withdrawn !== true && flags.damageByTarget?.[0]?.hit !== false)) return [];
  const target = resolve(marker.targetUuid);
  if (!target) return [];
  const kind = marker.kind ?? "sentinel";
  if (!Object.hasOwn(MORTAL_STRIKE_FLAGS, kind)) return [];
  const ids = [...(target.effects ?? [])].filter(effect => {
    const held = effect.flags?.["azeroth-rpg"]?.[MORTAL_STRIKE_FLAGS[kind]];
    return held?.messageUuid === message.uuid && held.sourceUuid === marker.sourceUuid
      && held.targetUuid === target.uuid && effect.origin === marker.sourceUuid;
  }).map(effect => effect.id);
  if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids;
}

export function registerSentinelStrikeHooks() {
  const clean = message => {
    if (!flagsOf(message).sentinelStrikeAttack) return;
    return withdrawSentinelMortalStrike(message).catch(() => ui.notifications?.warn(
      "A withdrawn Sentinel Mortal Strike effect could not be removed. Check the target's effects."));
  };
  Hooks.on("updateChatMessage", clean);
  Hooks.on("ready", () => Promise.all((game.messages?.contents ?? []).map(clean)));
}
