/** Rank-2 early ending is a free exception, never an ordinary action spend. */
import { iceBlockFor, iceBlockCanEnd } from "../rules/ice-block.mjs";

export const ICE_BLOCK_END_QUERY = "azeroth-rpg.endIceBlock";

export function canEndIceBlock(actor) {
  const rank = Math.max(0, ...(actor.takenTalents?.() ?? [])
    .filter(t => t.identifier === "ice-block" && t.className === "Mage")
    .map(t => Number.isSafeInteger(t.taken) ? t.taken : 0));
  const fight = actor.activeFight?.();
  const onTurn = fight?.started === true && fight.getCombatantsByActor(actor)?.some(c => c.isCurrentTurn === true);
  return iceBlockCanEnd({ actor, rank, onTurn });
}

export async function requestEndIceBlock(actor, effect) {
  const request = { actorUuid: actor.uuid, effectId: effect.id, cast: effect.flags?.["azeroth-rpg"]?.iceBlock?.cast };
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false, reason: "gmRequired" };
  try {
    return gm.id === game.user.id ? await endIceBlock(request, { user: game.user })
      : await gm.query(ICE_BLOCK_END_QUERY, request, { timeout: 15000 });
  } catch { return { ok: false, reason: "writeUncertain" }; }
}

export async function endIceBlock({ actorUuid, effectId, cast } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return refuse("gmRequired");
  if (!user || typeof actorUuid !== "string" || typeof effectId !== "string" || typeof cast !== "string") return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return refuse("gmRequired");
  if (actor?.documentName !== "Actor" || actor.uuid !== actorUuid) return refuse("actor");
  if (!user.isGM && !actor.testUserPermission(user, "OWNER")) return refuse("permission");
  const effect = iceBlockFor(actor);
  if (!effect || effect.id !== effectId || effect.flags["azeroth-rpg"].iceBlock.cast !== cast) return refuse("changed");
  if (!canEndIceBlock(actor)) return refuse("rankOrTurn");
  try {
    await effect.delete();
    return actor.effects.has(effectId) ? refuse("writeIncomplete") : { ok: true, effectId };
  } catch {
    // An uncertain delete must never turn into a request to remove a later cast.
    return refuse("writeUncertain");
  }
}
