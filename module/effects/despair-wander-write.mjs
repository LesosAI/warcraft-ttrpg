/** Claim one checked walk before issuing it. An uncertain movement is never
 * retried automatically: the persisted wandered marker survives a reload. */
const busy = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function usable(snapshot) {
  return snapshot?.active === true && snapshot.version === 1 && snapshot.wandered === false
    && typeof snapshot.effectUuid === "string" && snapshot.effectUuid.length > 0
    && typeof snapshot.tokenUuid === "string" && snapshot.tokenUuid.length > 0
    && typeof snapshot.sceneUuid === "string" && snapshot.sceneUuid.length > 0
    && typeof snapshot.clock === "string" && snapshot.clock.length > 0
    && [snapshot.from?.x, snapshot.from?.y, snapshot.to?.x, snapshot.to?.y].every(Number.isFinite)
    && (snapshot.from.x !== snapshot.to.x || snapshot.from.y !== snapshot.to.y);
}

export async function writeDespairWander({ key, read, claim, move } = {}) {
  if (typeof key !== "string" || !key || ![read, claim, move].every(fn => typeof fn === "function")) return { ok: false, reason: "configuration" };
  if (busy.has(key)) return { ok: false, reason: "busy" };
  busy.add(key);
  let claimed = false;
  try {
    const before = await read();
    if (!usable(before)) return { ok: false, reason: "unavailable" };
    if (!same(before, await read())) return { ok: false, reason: "changed" };
    await claim(before);
    claimed = true;
    const expected = { ...before, wandered: true };
    if (!same(expected, await read())) return { ok: false, reason: "changedAfterClaim", claimed };
    const done = await move(before);
    const after = await read();
    const arrived = after?.tokenUuid === before.tokenUuid && after?.sceneUuid === before.sceneUuid
      && after?.from?.x === before.to.x && after?.from?.y === before.to.y;
    return done === true && arrived ? { ok: true, claimed, moved: true }
      : { ok: false, claimed, reason: "movementUnconfirmed" };
  } catch { return { ok: false, claimed, reason: claimed ? "movementUnconfirmed" : "claimUnconfirmed" }; }
  finally { busy.delete(key); }
}
