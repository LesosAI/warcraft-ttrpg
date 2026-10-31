import { MOBILE_ALERT_FLAG, mobileAlertHeld } from "../rules/mobile-alert.mjs";
import { creatureMoved } from "../rules/movement.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const held = token => mobileAlertHeld(token?.getFlag?.("azeroth-rpg", MOBILE_ALERT_FLAG));
const warn = () => globalThis.ui?.notifications?.warn(game.i18n.localize("AZEROTH.MobileAlert.Charging"));

/** Voluntary movement only. Forced displacement still interrupts the alarm
 * through updateToken. Foundry 14.367 preMoveToken cancels on false. */
export function mobileAlertPreMove(token, movement, options = {}) {
  if (!held(token) || !creatureMoved(movement, options)) return true;
  warn();
  return false;
}

/** Use the exact acting token when known. A source-less roll cannot evade a
 * charging alarm by opening the linked actor's sheet instead of its token. */
export function refuseMobileAlertAttack(actor, source = null) {
  if (!actor?.uuid) return false;
  const exact = source && game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId);
  const candidates = exact?.actor?.uuid === actor.uuid ? [exact]
    : actor.isToken && actor.token ? [actor.token]
      : values(game.scenes).flatMap(scene => values(scene.tokens)).filter(token => token.actor?.uuid === actor.uuid);
  if (!candidates.some(held)) return false;
  warn();
  return true;
}
