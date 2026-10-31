import { activeSeductions } from "../rules/seduction.mjs";
const pending = new Set();
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** A GM judges non-damage harm; no hostile-effect heuristic substitutes for it.
 * Remove this card's carrier, never the actor's global Charmed status. */
export async function endSeductionForHarm(message) {
  const refuse = reason => ({ ok: false, reason });
  if (game.user?.isGM !== true) return refuse("gm");
  if (!message?.uuid || resolve(message.uuid) !== message) return refuse("message");
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const reference = flags.kind === "prompt" && flags.purpose === "seduction"
    ? { actorUuid: flags.actorUuid, effectId: flags.seduction?.effectId, messageUuid: flags.seduction?.messageUuid }
    : flags.kind === "ability" && flags.featureKey === "ability:seduction-charm" ? flags.seductionHarm : null;
  if (!reference?.actorUuid || !reference.effectId || !reference.messageUuid) return refuse("reference");
  const actor = resolve(reference.actorUuid);
  if (actor?.documentName !== "Actor" || !actor.isOwner) return refuse("actor");
  const effect = activeSeductions(actor.effects, actor.uuid).find(row => row.id === reference.effectId);
  if (!effect || reference.messageUuid && effect.flags["azeroth-rpg"].seduction.messageUuid !== reference.messageUuid)
    return refuse("gone");
  const key = `${actor.uuid}:${effect.id}`;
  if (pending.has(key)) return refuse("busy");
  pending.add(key);
  try {
    if (game.user?.isGM !== true || !actor.isOwner || resolve(actor.uuid) !== actor
      || !activeSeductions(actor.effects, actor.uuid).includes(effect)) return refuse("changed");
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    if ([...(actor.effects ?? [])].some(row => row.id === effect.id)) return refuse("writeUncertain");
    return { ok: true, effectId: effect.id, actorUuid: actor.uuid };
  } catch (error) {
    console.warn("azeroth-rpg | End Seduction for harm", error);
    return refuse("writeUncertain");
  } finally { pending.delete(key); }
}

export async function chooseEndSeductionForHarm(message) {
  const result = await endSeductionForHarm(message);
  if (result.ok) ui.notifications?.info(game.i18n.localize("AZEROTH.Seduction.HarmEnded"));
  else ui.notifications?.warn(game.i18n.localize("AZEROTH.Seduction.HarmUnconfirmed"));
  return result;
}
