/** One GM-reviewed beneficial magical effect removed by Obsidian Purge. */
import { destroyerPurgeEffect } from "../rules/obsidian-destroyer.mjs";
import { gatePassed, ongoingOwner } from "../rules/dispel.mjs";
import { archmageCasters, dispelGatesOn, plainEffect, unstableStrikes } from "./dispel.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function endDestroyerPurgeEffect({ dispeller, target, effectId, reviewed = false, valid, gateTest } = {}) {
  const refuse = reason => ({ ok: false, reason, ended: [], consequences: [] });
  const allowed = () => gmHere() && dispeller?.uuid && target?.uuid && dispeller !== target
    && fromUuidSync(dispeller.uuid) === dispeller && fromUuidSync(target.uuid) === target
    && typeof valid === "function" && valid();
  if (!allowed() || reviewed !== true || typeof effectId !== "string" || !effectId) return refuse("authorityOrReview");
  const key = `${target.uuid}:${effectId}`;
  if (pending.has(key)) return refuse("pending");
  pending.add(key);
  try {
    const inspect = () => {
      const effect = target.effects?.get(effectId);
      if (!effect) return { judgement: { ok: false, reason: "missingEffect" } };
      const snapshot = plainEffect(effect);
      return { effect, snapshot, judgement: destroyerPurgeEffect(snapshot, {
        beneficial: true, magical: true, archmage: archmageCasters([snapshot]) }) };
    };
    let current = inspect();
    if (!current.judgement.ok) return refuse(current.judgement.reason);
    const original = current.effect, reviewedState = JSON.stringify(current.snapshot);
    const gates = dispelGatesOn(target, [effectId]);
    for (const gate of gates) {
      if (typeof gateTest !== "function") return refuse("gateRequired");
      const result = await gateTest({ dispeller, target, gate });
      if (!result) return refuse("gateUnconfirmed");
      if (!gatePassed(result?.outcome, gate.sl)) return refuse("gateFailed");
      if (!allowed()) return refuse("changed");
    }
    current = inspect();
    if (!allowed()) return refuse("changed");
    if (!current.judgement.ok) return refuse(current.judgement.reason);
    if (current.effect !== original || JSON.stringify(current.snapshot) !== reviewedState) return refuse("changedEffect");
    if (JSON.stringify(dispelGatesOn(target, [effectId])) !== JSON.stringify(gates)) return refuse("changedGate");
    const ended = [{ id: effectId, name: current.snapshot.name, owner: ongoingOwner(current.snapshot) }];
    const removed = await target.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
    if (!removed?.some(effect => effect.id === effectId) || target.effects.has(effectId)) return refuse("notRemoved");
    try {
      return { ok: true, reason: null, ended, consequences: await unstableStrikes({ dispeller, ended }) };
    } catch (error) {
      return { ok: true, reason: null, ended, consequences: [], consequenceError: String(error?.message ?? error) };
    }
  } finally { pending.delete(key); }
}
