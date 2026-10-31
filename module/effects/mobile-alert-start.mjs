import { beginMobileAlert, MOBILE_ALERT, MOBILE_ALERT_FLAG } from "../rules/mobile-alert.mjs";
import { reviewMobileAlertContact } from "./mobile-alert-detection.mjs";
import { mobileAlertBusy as busy, releaseMobileAlert } from "./mobile-alert-lock.mjs";
import { postMobileAlertFeedback } from "./mobile-alert-feedback.mjs";

const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const position = token => ({ x: token.x, y: token.y, elevation: token.elevation, level: token._source?.level });
const held = token => token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG) ?? null;
const fightOf = token => [...(game.combats?.values?.() ?? [])].find(combat => combat.started
  && [...combat.combatants.values()].some(row => row.actor?.uuid === token.actor?.uuid)) ?? null;
const combatClock = combat => combat ? { id: combat.id, round: combat.round, turn: combat.turn } : null;

/** Reserve the alarm before paying its Action. An uncertain payment stays
 * reserved and needs GM reconciliation rather than an automatic second use. */
export async function startMobileAlert({ token, user, valid } = {}) {
  if (!gmHere() || !token?.uuid || !user?.id || typeof valid !== "function" || busy.has(token.uuid))
    return { ok: false, reason: "authorityOrBusy" };
  busy.add(token.uuid);
  let paid = false, receipt = null;
  try {
    const actor = token.actor, scene = token.parent, point = position(token);
    const time = game.time.worldTime, combat = combatClock(fightOf(token));
    const allowed = () => gmHere() && valid() && token.actor === actor && actor?.type === "npc"
      && actor.testUserPermission(user, "OWNER") && game.scenes?.get(scene?.id) === scene
      && scene.tokens.get(token.id) === token && !!scene.levels?.get(point.level)
      && same(position(token), point) && game.time.worldTime === time
      && same(combatClock(fightOf(token)), combat) && actor.system?.health?.value > 0
      && !actor.statuses?.has("stunned") && actor.system.creatureAbilities?.some(row => row.name === MOBILE_ALERT.name)
      && same(held(token), receipt);
    if (!allowed()) return { ok: false, reason: "source" };
    const contact = await reviewMobileAlertContact({ token, valid: allowed });
    if (!contact || !contact.valid() || !allowed()) return { ok: false, reason: "contact" };
    const plan = beginMobileAlert({ tokenUuid: token.uuid, actorUuid: actor.uuid,
      cast: foundry.utils.randomID(), point, time, combat, record: held(token) });
    if (!plan.ok) return plan;
    receipt = { ...plan.record, phase: "paying", contactUuid: contact.target.uuid };
    await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
    if (!allowed() || !contact.valid()) return { ok: false, reason: "claimUncertain" };
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    const payment = await spendTurnBudget(actor, MOBILE_ALERT.action);
    if (!payment) return { ok: false, reason: "payment", reserved: true };
    paid = true;
    if (!allowed() || !contact.valid()) return { ok: false, reason: "changed", paid, reserved: true };
    receipt = { ...receipt, phase: "arming" };
    await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
    if (!allowed() || !contact.valid()) return { ok: false, reason: "writeUncertain", paid, reserved: true };
    await postMobileAlertFeedback({ token, event: "warning" });
    return { ok: true, paid, record: receipt };
  } catch (error) {
    console.warn("azeroth-rpg | Mobile Alert start uncertain; inspect the alarm record and Action before retrying", error);
    return { ok: false, reason: "writeUncertain", paid, reserved: receipt !== null };
  } finally { releaseMobileAlert(token); }
}
