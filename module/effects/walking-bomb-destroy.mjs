import { WALKING_BOMB_FLAG } from "./walking-bomb.mjs";

/** Self-destruction is Health loss, not a mitigatable incoming blow. Use the
 * actor's Health door so zero-Health sustain/form cleanup still runs. */
export async function destroyWalkingBomb({ token, valid } = {}) {
  const actor = token?.actor;
  const current = () => globalThis.game?.user?.isGM === true
    && game.users?.activeGM?.id === game.user.id
    && token?.isOwner && token.actor === actor && actor?.type === "npc"
    && typeof valid === "function" && valid();
  if (!current()) return { ok: false };
  const receipt = token.getFlag("azeroth-rpg", WALKING_BOMB_FLAG);
  if (receipt?.phase !== "destroying" || receipt.tokenUuid !== token.uuid
    || receipt.bombUuid !== actor.uuid || !receipt.attackId) return { ok: false };
  const health = actor.system?.health?.value;
  if (!Number.isFinite(health) || health < 0 || typeof actor.adjustHealth !== "function") return { ok: false };
  await actor.adjustHealth(-health, { temp: 0 });
  return { ok: !!current() && actor.system?.health?.value === 0
    && (actor.system?.health?.temp ?? 0) === 0 };
}
