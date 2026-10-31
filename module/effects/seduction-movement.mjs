import { creatureMoved } from "../rules/movement.mjs";
import { seductionCommandsNow } from "./seduction-refusal.mjs";
import { movementFollowsSeductionRoute } from "../rules/seduction-route-match.mjs";
const permissions = new WeakMap();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function withSeductionWalk({ token, path, valid, run }) {
  if (!gmHere() || permissions.has(token) || typeof valid !== "function" || !valid()) return false;
  const permission = { actor: token.actor, scene: token.parent, path: structuredClone(path), valid };
  permissions.set(token, permission);
  try { return await run(); }
  finally { if (permissions.get(token) === permission) permissions.delete(token); }
}

export function seductionPreMove(token, movement, options = {}) {
  if (!creatureMoved(movement, options)) return true;
  const actor = token?.actor;
  const commands = seductionCommandsNow(actor);
  if (!commands.some(effect => effect.flags["azeroth-rpg"].seduction.targetTokenUuid === token.uuid)) return true;
  const permit = permissions.get(token);
  if (permit && gmHere() && permit.actor === actor && permit.scene === token.parent && permit.valid()
    && ["x", "y", "elevation"].every(key => movement?.origin?.[key] === token[key])
    && movementFollowsSeductionRoute(permit.path, movement)) return true;
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Seduction.RouteRequired"));
  return false;
}

export function registerSeductionMovement() {
  Hooks.on("preMoveToken", seductionPreMove);
}
