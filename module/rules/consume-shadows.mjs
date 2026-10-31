/** Pure recovery lifecycle. The GM adapter owns use payment, durable state,
 * event delivery and the atomic claim before applying the returned heal.
 * Times are Foundry world-time seconds, not wall-clock timers.
 */
const time = n => Number.isFinite(n) && n >= 0;
const id = s => typeof s === "string" && s.trim().length > 0;
const position = p => p && id(p.sceneUuid) && id(p.tokenUuid) && id(p.level)
  && [p.x, p.y, p.elevation].every(Number.isFinite);
const health = h => h && Number.isFinite(h.value) && Number.isFinite(h.max)
  && h.value > 0 && h.max > 0 && h.value <= h.max;
const samePosition = (a, b) => position(a) && position(b)
  && ["sceneUuid", "tokenUuid", "level", "x", "y", "elevation"].every(k => a[k] === b[k]);

export function beginConsumeShadows({ requestId, now, location, hp, inCombat } = {}) {
  if (!id(requestId) || !time(now) || !position(location) || !health(hp) || inCombat !== false) return null;
  return { requestId, state: "recovering", startedAt: now, readyAt: now + 60,
    location: { sceneUuid: location.sceneUuid, tokenUuid: location.tokenUuid, level: location.level,
      x: location.x, y: location.y, elevation: location.elevation } };
}

function valid(record) {
  return record && id(record.requestId) && time(record.startedAt)
    && record.readyAt === record.startedAt + 60 && position(record.location)
    && ["recovering", "interrupted"].includes(record.state);
}

/** Interruptions are terminal, including after the minute has elapsed if
 * the writer has not yet claimed completion. Delayed delivery must not heal
 * through a real interruption. Unknown event kinds leave the state alone.
 */
export function interruptConsumeShadows(record, event = {}) {
  if (!valid(record)) return null;
  if (record.state === "interrupted") return record;
  let reason = null;
  if (event.kind === "position" && !samePosition(record.location, event.location)) reason = "moved";
  else if (event.kind === "damage" && Number.isFinite(event.amount) && event.amount > 0) reason = "damaged";
  else if (event.kind === "action") reason = "acted";
  else if (event.kind === "combat") reason = "combat";
  else if (event.kind === "deleted") reason = "deleted";
  else if (event.kind === "cancel") reason = "cancelled";
  return reason ? { ...record, state: "interrupted", reason } : record;
}

/** A proposal only: never repeatedly apply this result from a polling hook.
 * The writer must persist a completion claim before updating Health and
 * reconcile an uncertain update rather than trying the heal again.
 */
export function consumeShadowsRecovery(record, { now, location, hp, inCombat } = {}) {
  if (!valid(record) || record.state !== "recovering" || !time(now)
      || now < record.readyAt || inCombat !== false || !health(hp)
      || !samePosition(record.location, location)) return null;
  const value = Math.min(hp.max, hp.value + 3);
  return { requestId: record.requestId, before: hp.value, value, healed: value - hp.value };
}
