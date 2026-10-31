/** Classic 7849 / 11819: a fragile alarm calls two 6233 sentries.
 * One six-second round replaces the client's 6.8-second summon delay. */
export const MOBILE_ALERT = Object.freeze({ name: "Raise Alarm", seconds: 6,
  count: 2, entry: "Mechanized Sentry", action: "action" });
export const MOBILE_ALERT_FLAG = "mobileAlert";
/** An uncertain payment or placement stays held until the GM reconciles it. */
export function mobileAlertHeld(record) {
  return record?.version === 1 && ["paying", "arming", "placing"].includes(record.phase);
}
const text = value => typeof value === "string" && value.length > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const position = point => point && [point.x, point.y, point.elevation].every(finite) && text(point.level);
const samePosition = (a, b) => position(a) && position(b)
  && ["x", "y", "elevation", "level"].every(key => a[key] === b[key]);
const refuse = reason => ({ ok: false, reason });

export function beginMobileAlert({ tokenUuid, actorUuid, cast, point, time, combat = null, record = null } = {}) {
  if (record) return refuse("alreadyUsed");
  if (![tokenUuid, actorUuid, cast].every(text) || !position(point) || !finite(time)) return refuse("identity");
  if (combat && (!text(combat.id) || !Number.isInteger(combat.round) || combat.round < 1)) return refuse("combat");
  return { ok: true, record: { version: 1, phase: "arming", tokenUuid, actorUuid, cast,
    point: { ...point }, time, combat: combat ? { id: combat.id, round: combat.round } : null, tokens: [] } };
}

/** Only the source's next turn (or six seconds outside combat) completes the
 * warning. A moved, disabled or destroyed machine cannot finish its alarm. */
export function mobileAlertStep({ record, tokenUuid, actorUuid, point, time, combat = null, alive = false, disabled = false } = {}) {
  if (record?.version !== 1 || record.phase !== "arming" || !text(record.cast)) return refuse("phase");
  if (record.tokenUuid !== tokenUuid || record.actorUuid !== actorUuid) return refuse("identity");
  if (!alive || disabled || !samePosition(record.point, point)) return { ok: true, action: "cancel", reason: "interrupted" };
  if (!finite(time) || time < record.time) return refuse("clock");
  if (record.combat) {
    if (!combat || combat.id !== record.combat.id) return { ok: true, action: "cancel", reason: "combatEnded" };
    if (!Number.isInteger(combat.round) || combat.round < record.combat.round) return refuse("clock");
    if (combat.round === record.combat.round || combat.actorUuid !== actorUuid) return { ok: true, action: "wait" };
  } else {
    // Entering combat does not let a world-clock timer summon mid-turn.
    if (combat) return { ok: true, action: "cancel", reason: "clockChanged" };
    if (time < record.time + MOBILE_ALERT.seconds) return { ok: true, action: "wait" };
  }
  return { ok: true, action: "summon", record: { ...record, phase: "placing" },
    entry: MOBILE_ALERT.entry, count: MOBILE_ALERT.count };
}

/** A partial or mismatched placement remains claimed for GM reconciliation;
 * retrying it as a fresh summon would duplicate one or both reinforcements. */
export function confirmMobileSentries(record, tokens = []) {
  if (record?.phase !== "placing" || !Array.isArray(tokens) || tokens.length !== MOBILE_ALERT.count) return null;
  if (new Set(tokens.map(token => token.uuid)).size !== MOBILE_ALERT.count) return null;
  if (tokens.some(token => !text(token.uuid) || token.ownerUuid !== record.tokenUuid
    || token.cast !== record.cast || token.entry !== MOBILE_ALERT.entry)) return null;
  return { ...record, phase: "summoned", tokens: tokens.map(token => token.uuid) };
}
