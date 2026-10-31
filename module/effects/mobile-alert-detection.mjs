import { mobileAlertCandidate, MOBILE_ALERT_SENSOR_RANGE } from "../rules/mobile-alert-detection.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { projectionPhaseFor } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

/** Private GM review, following the NPC ability menus. It neither removes
 * Hidden/Invisible nor changes any TokenDocument.hidden property. */
export async function reviewMobileAlertContact({ token, valid } = {}) {
  if (!gmHere() || !token?.actor?.uuid || typeof valid !== "function" || !valid()) return null;
  const scene = token.parent, sourcePosition = point(token), actor = token.actor;
  const sourceValid = () => gmHere() && valid() && game.scenes?.get(scene?.id) === scene
    && scene.tokens?.get(token.id) === token && token.actor === actor && actor.system?.health?.value > 0
    && point(token) === sourcePosition && !!scene.levels?.get(token._source?.level);
  const eligible = other => other && other !== token && other.actor?.uuid && other.actor !== actor
    && !projectionPhaseFor(other.actor) && !realmRefusalFor(other.actor, "ability")
    && mobileAlertCandidate({ distance: feetApart(token, other),
      sameLevel: other._source?.level === token._source?.level,
      hostile: Number.isFinite(token.disposition) && Number.isFinite(other.disposition)
        && token.disposition * other.disposition < 0,
      hiddenByGM: other.hidden === true, alive: other.actor.system?.health?.value > 0 });
  if (!sourceValid()) return null;
  const candidates = [...scene.tokens.values()].filter(eligible);
  if (!candidates.length) return null;
  const { chooseOption } = await import("../dice/workflows.mjs");
  const menu = { id: `${token.id}-scanner`, name: "Mobile Alert System — Scanner" };
  const picked = await chooseOption(menu, candidates.map(other => ({ key: other.id, name: other.name,
    description: `Within ${MOBILE_ALERT_SENSOR_RANGE} feet. Stealth and invisibility do not conceal this creature from the scanner; solid cover still does.` })), null,
  { prompt: "GM: Choose an intruder the scanner can detect. This does not reveal it to other creatures." });
  const target = candidates.find(other => other.id === picked?.key);
  if (!target || !sourceValid() || !eligible(target)) return null;
  const targetPosition = point(target), targetActor = target.actor;
  const contactValid = () => sourceValid() && scene.tokens.get(target.id) === target
    && target.actor === targetActor && point(target) === targetPosition && eligible(target);
  const confirm = await chooseOption(menu, [
    { key: "cancel", name: "Cancel", description: "Do not begin the alarm." },
    { key: "detected", name: "Confirm clear line of sight", description: "The intruder is not behind a wall or other solid cover. Only the scanner detects it." }
  ], null, { prompt: "GM: Confirm the scanner has a clear line of sight. It cannot see through walls." });
  if (confirm?.key !== "detected" || !contactValid()) return null;
  return { target, valid: contactValid };
}
