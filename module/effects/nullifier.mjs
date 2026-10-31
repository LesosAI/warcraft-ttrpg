/** GM-side removal primitive for Mass Nullify. The ability workflow must first
 * validate the complete selection and pay its action/use. No query or UI calls
 * this yet. A trusted gateTest callback rolls Everlasting Affliction's gate.
 */
import { nullifyJudgement } from "../rules/nullifier.mjs";
import { gatePassed, ongoingOwner } from "../rules/dispel.mjs";
import { archmageCasters, dispelGatesOn, plainEffect, unstableStrikes } from "./dispel.mjs";

const pending = new Set();

export async function endNullifiedEffect({ dispeller, target, effectId, classification = null, gateTest = null } = {}) {
  const refuse = reason => ({ ok: false, reason, ended: [], consequences: [] });
  if (globalThis.game?.user?.isGM !== true) return refuse("gmRequired");
  if (!dispeller || !target?.uuid || typeof effectId !== "string" || !effectId) return refuse("missingActorOrEffect");
  const key = `${target.uuid}:${effectId}`;
  if (pending.has(key)) return refuse("pending");
  pending.add(key);
  try {
    const inspect = () => {
      const effect = target.effects?.get(effectId);
      if (!effect) return { effect: null, judgement: { ok: false, reason: "missingEffect" } };
      const snapshot = plainEffect(effect);
      return { effect, snapshot, judgement: nullifyJudgement(snapshot, {
        classification, archmage: archmageCasters([snapshot])
      }) };
    };
    let current = inspect();
    if (!current.judgement.ok) return refuse(current.judgement.reason);
    const original = current.effect;
    const reviewedState = JSON.stringify(current.snapshot);
    const gates = dispelGatesOn(target, [effectId]);
    for (const gate of gates) {
      if (typeof gateTest !== "function") return refuse("gateRequired");
      const result = await gateTest({ dispeller, target, gate });
      if (!result) return refuse("gateUnconfirmed");
      if (!gatePassed(result?.outcome, gate.sl)) return refuse("gateFailed");
    }
    // A prompt or roll may have yielded while another client changed the actor.
    current = inspect();
    if (!current.judgement.ok) return refuse(current.judgement.reason);
    if (current.effect !== original) return refuse("changedEffect");
    if (JSON.stringify(current.snapshot) !== reviewedState) return refuse("changedEffect");
    const nowGates = dispelGatesOn(target, [effectId]);
    if (JSON.stringify(nowGates) !== JSON.stringify(gates)) return refuse("changedGate");
    const ended = [{ id: effectId, name: current.snapshot.name, owner: ongoingOwner(current.snapshot) }];
    const removed = await target.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
    if (!removed?.some(e => e.id === effectId) || target.effects.has(effectId)) return refuse("notRemoved");
    // Report deletion separately if posting its consequence fails. Retrying the
    // action must never delete a second effect or claim the first still exists.
    try {
      const consequences = await unstableStrikes({ dispeller, ended });
      return { ok: true, reason: null, ended, consequences };
    } catch (error) {
      return { ok: true, reason: null, ended, consequences: [], consequenceError: String(error?.message ?? error) };
    }
  } finally {
    pending.delete(key);
  }
}
