/** GM-local charge declarations. Nothing persisted on player-owned actor flags
 * is accepted as movement authority. A GM reload loses the declaration safely. */
import { beginVeknissCharge, finishVeknissCharge } from "../rules/vekniss.mjs";
import { captureVeknissMovement, observeVeknissMovement } from "./vekniss-movement.mjs";

export function createVeknissChargeStore() {
  const declarations = new Map();
  const busy = new Set();
  const requireGM = () => {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw new Error("The active GM must resolve a Stinger charge.");
  };
  return {
    declare(context, source, target, action) {
      requireGM();
      if (busy.has(context.sourceUuid)) return { ok: false, reason: "pending" };
      const planned = beginVeknissCharge(context);
      if (!planned.ok) return planned;
      if (!["walk", "fly"].includes(action)) return { ok: false, reason: "movementMode" };
      const movement = captureVeknissMovement(source, target);
      if (!movement || source.actor?.uuid !== context.sourceUuid || target.actor?.uuid !== context.targetUuid
        || source.id !== context.sourceTokenId || target.id !== context.targetTokenId
        || source.parent?.id !== context.sceneId) return { ok: false, reason: "identity" };
      declarations.set(context.sourceUuid, { charge: planned.charge, movement, action });
      return { ok: true, reason: null };
    },
    has(sourceUuid) { requireGM(); return declarations.has(sourceUuid); },
    cancel(sourceUuid) { requireGM(); return declarations.delete(sourceUuid); },
    clear() { declarations.clear(); },
    /** Call at the final roll boundary, after any dialogs. `context` and
     * `paidFeet` must be recomputed on the GM from current documents. The
     * injected attack spends its normal action and uses the ordinary roller.
     * A refusal, miss or failed write consumes the declaration, never movement.
     */
    async attack(context, source, target, { paidFeet, roll } = {}) {
      requireGM();
      const key = context?.sourceUuid;
      if (busy.has(key)) return { ok: false, reason: "pending" };
      const held = declarations.get(key);
      if (!held) return { ok: false, reason: "notDeclared" };
      if (typeof roll !== "function") return { ok: false, reason: "missingRoll" };
      const movement = observeVeknissMovement(held.movement, source, target, { paidFeet, action: held.action });
      if (!movement.ok) return movement;
      const verdict = finishVeknissCharge(held.charge, { ...context, moved: movement.moved,
        movementPaid: movement.movementPaid, targetStayed: movement.targetStayed });
      if (!verdict.ok) return verdict;
      if (source.actor?.uuid !== context.sourceUuid || target.actor?.uuid !== context.targetUuid) return { ok: false, reason: "identity" };
      busy.add(key);
      declarations.delete(key);
      try {
        const card = await roll({ bonus: verdict.bonus });
        return card ? { ok: true, reason: null, card, bonus: verdict.bonus }
          : { ok: false, reason: "attackRefused", consumed: true };
      } catch (error) {
        return { ok: false, reason: "attackFailed", consumed: true,
          message: "The charge could not be completed. Check the attack and its payment before resolving it manually." };
      } finally { busy.delete(key); }
    }
  };
}
