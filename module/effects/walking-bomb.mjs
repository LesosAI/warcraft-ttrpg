import { walkingBombTrigger } from "../rules/walking-bomb.mjs";

export const WALKING_BOMB_FLAG = "walkingBombDetonation";
const busy = new Set();
const activeGM = () => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id;

/** Reserve a bomb once, before explosion damage. The caller resolves the
 * current token and attack card and supplies their validation. An uncertain
 * stored claim is never cleared here: retrying it could repeat damage.
 */
export async function claimWalkingBombDetonation({ token, attack, validate } = {}) {
  if (!activeGM() || !token?.uuid || !token.isOwner || busy.has(token.uuid)
    || typeof validate !== "function") return null;
  busy.add(token.uuid);
  try {
    if (!validate()) return null;
    const plan = walkingBombTrigger({ bombUuid: token.actor?.uuid,
      health: token.actor?.system?.health?.value,
      detonation: token.getFlag("azeroth-rpg", WALKING_BOMB_FLAG) ?? null, attack });
    if (!plan) return null;
    const receipt = { ...plan, tokenUuid: token.uuid, phase: "claimed" };
    await token.update({ [`flags.azeroth-rpg.${WALKING_BOMB_FLAG}`]: receipt });
    if (!activeGM() || !validate()
      || JSON.stringify(token.getFlag("azeroth-rpg", WALKING_BOMB_FLAG)) !== JSON.stringify(receipt)) return null;
    return receipt;
  } catch (error) {
    console.warn("azeroth-rpg | Walking Bomb claim", error);
    return null;
  } finally { busy.delete(token.uuid); }
}
