export const SPELL_LOCK_RECEIPTS = "spellLockReceipts";
const busy = new Set();
const identity = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id && fromUuidSync(actor?.uuid) === actor;

/** Claim one reactor's payment for one open Casting Test. The GM adapter must
 * validate requester ownership, the current cast, geometry and eligibility.
 * Its validate callback rechecks the cast and target throughout payment; the
 * payment callbacks independently check their remaining budgets. No callback
 * here rolls the cast or applies Silence: both belong to the cast lifecycle.
 *
 * Write-ahead stages deliberately survive lost acknowledgements. A partially
 * paid claim requires reconciliation, never an automatic second payment. */
export async function claimSpellLock({ actor, cast, validate, payReaction, payUse } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!identity(actor?.uuid) || !identity(cast?.id) || !identity(cast?.casterUuid)
    || actor.uuid === cast.casterUuid || cast.phase !== "open" || !writer(actor)
    || [validate, payReaction, payUse].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const declared = { id: cast.id, casterUuid: cast.casterUuid };
  const read = () => actor.getFlag("azeroth-rpg", SPELL_LOCK_RECEIPTS) ?? [];
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receipts");
    if (expected.some(row => row?.castId === declared.id)) return refuse("alreadyClaimed");
    if (expected.some(row => !["paid", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => writer(actor) && same(read(), expected);
    const open = () => cast.id === declared.id && cast.casterUuid === declared.casterUuid && cast.phase === "open";
    const valid = () => unchanged() && open() && validate() === true && unchanged() && open();
    const save = async patch => {
      if (!unchanged()) throw Error("Spell Lock receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", SPELL_LOCK_RECEIPTS, next);
      if (!writer(actor) || !same(read(), next)) throw Error("Spell Lock receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ castId: declared.id, casterUuid: declared.casterUuid, reactorUuid: actor.uuid,
      stage: "payingReaction", reactionPaid: null, usePaid: null });
    if (!valid()) return refuse("changed");
    const reaction = await payReaction();
    if (reaction !== true) {
      await save({ stage: reaction === false ? "cancelled" : "unresolved", reactionPaid: reaction === false ? false : null });
      return refuse("reaction");
    }
    await save({ stage: "payingUse", reactionPaid: true });
    if (!valid()) return refuse("changed");
    const use = await payUse();
    if (use !== true) {
      await save({ stage: "unresolved", usePaid: use === false ? false : null });
      return refuse("useUncertain");
    }
    // A cast closing during payment must not receive a late Bane. Preserve
    // confirmed payment for reconciliation without publishing a paid claim.
    if (!valid()) {
      await save({ stage: "unresolved", usePaid: true });
      return refuse("changed");
    }
    await save({ stage: "paid", usePaid: true });
    if (!valid()) {
      await save({ stage: "unresolved" });
      return refuse("changed");
    }
    return { ok: true, claim: structuredClone(record) };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
