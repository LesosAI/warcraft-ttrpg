import { executeSeductionWalk } from "./seduction-walk.mjs";
import { pickPoint } from "../canvas/place.mjs";
export const SEDUCTION_WALK_QUERY = "azeroth-rpg.seductionWalk";

function subject(message) {
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.kind !== "prompt" || flags.purpose !== "seduction" || !flags.seduction?.effectId) return null;
  const actor = fromUuidSync(flags.actorUuid);
  const effect = actor?.effects?.get(flags.seduction.effectId);
  const record = effect?.flags?.["azeroth-rpg"]?.seduction;
  const token = record?.targetTokenUuid ? fromUuidSync(record.targetTokenUuid) : null;
  return actor && effect && token?.actor === actor ? { actor, effect, token } : null;
}

export async function seductionWalkQueryHandler({ messageId, waypoints } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user) return { ok: false, reason: "authority" };
  const target = subject(game.messages.get(messageId));
  if (!target || !target.actor.testUserPermission(user, "OWNER")) return { ok: false, reason: "notOwner" };
  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 64) return { ok: false, reason: "route" };
  return executeSeductionWalk({ token: target.token, effect: target.effect, waypoints });
}

/** Collect a route on the existing canvas pick surface. Cancellation writes
 * nothing. Only the GM handler can execute the selected route. */
export async function chooseSeductionRoute(message) {
  const target = subject(message);
  if (!target?.actor.isOwner || globalThis.canvas?.scene !== target.token.parent) {
    ui.notifications?.warn("Open the charmed creature's scene and select the route as its owner.");
    return null;
  }
  const { actor, token, effect } = target;
  const initial = { x: token.x, y: token.y, elevation: token.elevation, level: token._source.level };
  const still = () => subject(message)?.effect === effect && token.actor === actor
    && canvas.scene === token.parent && ["x", "y", "elevation"].every(key => token[key] === initial[key]);
  let waypoints = [{ ...initial }];
  while (still() && waypoints.length < 64) {
    const point = await pickPoint({ sceneId: token.parent.id,
      hint: "Seduction: click a waypoint toward the succubus. Add waypoints to go around obstacles; finish beside it, not inside its space. Escape cancels." });
    if (!point || !still()) return null;
    const pivot = token.getMovementOrigin({ ...token._source, x: 0, y: 0 });
    const position = token.getSnappedPosition({ ...token._source, x: point.x - pivot.x, y: point.y - pivot.y });
    const next = { x: position.x, y: position.y, elevation: initial.elevation, level: initial.level };
    if (next.x === waypoints.at(-1).x && next.y === waypoints.at(-1).y) continue;
    waypoints.push(next);
    const answer = await foundry.applications.api.DialogV2.wait({ window: { title: "Seduction — approach route" },
      content: `<p>${waypoints.length - 1} waypoint(s) selected. The route will be checked against walls and occupied spaces. You will move as far along it as your remaining movement allows.</p>`,
      buttons: [
        { action: "add", label: "Add waypoint", default: true, callback: () => "add" },
        { action: "walk", label: "Walk route", callback: () => "walk" },
        { action: "restart", label: "Start over", callback: () => "restart" },
        { action: "cancel", label: "Cancel", callback: () => "cancel" }
      ], close: () => null, rejectClose: false });
    if (!still() || !answer || answer === "cancel") return null;
    if (answer === "restart") { waypoints = [{ ...initial }]; continue; }
    if (answer !== "walk") continue;
    const gm = game.users?.activeGM;
    if (!gm) { ui.notifications?.warn("A connected GM is needed to resolve this movement."); return null; }
    try {
      const request = { messageId: message.id, waypoints };
      const result = gm.id === game.user.id ? await seductionWalkQueryHandler(request, { user: game.user })
        : await gm.query(SEDUCTION_WALK_QUERY, request, { timeout: 30000 });
      if (!result?.ok) ui.notifications?.warn(result?.reason === "multipleCommands"
        ? game.i18n.localize("AZEROTH.Seduction.MultipleCommands")
        : "The route could not be completed. Check the creature's position, movement budget and Seduction effect before trying again.");
      return result;
    } catch (error) {
      console.warn("azeroth-rpg | Seduction route request could not be confirmed", error);
      ui.notifications?.warn("Movement could not be confirmed. Check the token before trying again.");
      return null;
    }
  }
  return null;
}
