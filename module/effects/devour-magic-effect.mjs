/** Complete the victim's reviewed selection after the confirmed Power drain.
 * Review and victim ownership belong to the caller, not a query payload.
 */
import { devourMagicEffect } from "../rules/devour-magic.mjs";
import { gatePassed, ongoingOwner } from "../rules/dispel.mjs";
import { plainEffect, archmageCasters, dispelGatesOn, unstableStrikes } from "./dispel.mjs";
import { DEVOUR_MAGIC_WOUNDS } from "./devour-magic-wound.mjs";
import { DEVOUR_MAGIC_BUSY } from "./devour-magic-resource.mjs";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = doc => doc?.uuid && fromUuidSync(doc.uuid) === doc;
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export function devourMagicEffectSnapshot(effect) {
  return JSON.parse(JSON.stringify({ ...plainEffect(effect), isSuppressed: effect.isSuppressed === true, isExpired: effect.isExpired === true,
    duration: effect.duration, start: effect.start, changes: effect.system?.changes ?? [] }));
}

export function devourMagicEffectsSnapshot(target) {
  return [...target.effects.values()].map(devourMagicEffectSnapshot).sort((a, b) => a.id.localeCompare(b.id));
}

export async function endDevourMagicEffect({ message, target, source, review, valid, gateTest } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const allowed = () => gmHere() && present(message) && present(target) && present(source)
    && typeof valid === "function" && valid() === true;
  const empty = review?.empty === true && Array.isArray(review.snapshots);
  if (!allowed() || (!empty && (review?.magical !== true || review?.temporary !== true || !review.effectId))) return refuse("authorityOrReview");
  const keys = [message.uuid, target.uuid];
  if (keys.some(key => DEVOUR_MAGIC_BUSY.has(key))) return refuse("busy");
  keys.forEach(key => DEVOUR_MAGIC_BUSY.add(key));
  try {
    const read = () => message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS);
    let expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("missingWound");
    const matches = expected.filter(row => row?.targetUuid === target.uuid), wound = matches[0];
    if (matches.length !== 1 || wound?.version !== 1 || wound.sourceUuid !== source.uuid
      || wound.stage !== "effectPending" || wound.powerLost !== 1 || wound.plan?.kind !== "drain") return refuse("wound");
    const index = expected.indexOf(wound), effect = empty ? null : target.effects?.get(review.effectId);
    const inspect = () => {
      // Only a trusted GM review can classify a whole list as having no
      // eligible temporary magic. A new or changed effect invalidates it.
      if (empty) return same(devourMagicEffectsSnapshot(target), review.snapshots) ? { ok: true } : refuse("changedEffects");
      if (!effect || target.effects?.get(effect.id) !== effect) return refuse("missingEffect");
      const snapshot = devourMagicEffectSnapshot(effect);
      if (!same(snapshot, review.snapshot)) return refuse("changedEffect");
      return devourMagicEffect(snapshot, { magical: true, temporary: true, archmage: archmageCasters([snapshot]) });
    };
    const checked = inspect();
    if (!checked.ok) return checked;
    const gates = empty ? [] : dispelGatesOn(target, [effect.id]);
    if (gates.length && typeof gateTest !== "function") return refuse("gateRequired");
    const unchanged = () => allowed() && same(read(), expected);
    const save = async patch => {
      if (!unchanged()) throw Error("Devour Magic changed");
      const next = structuredClone(expected);
      next[index] = { ...next[index], ...patch };
      await message.setFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS, next);
      if (!allowed() || !same(read(), next)) throw Error("Devour Magic receipt unconfirmed");
      expected = next;
    };
    // Claim before rolling: repeated presses cannot fish for a successful gate.
    await save({ stage: "effectApplying", selectedEffectId: effect?.id ?? null });
    if (empty) {
      if (!unchanged() || !inspect().ok) return refuse("changedEffects");
      await save({ stage: "resolved", effectOutcome: "noneEligible" });
      return { ok: true, ended: [], noneEligible: true };
    }
    for (const gate of gates) {
      if (!unchanged() || !inspect().ok) return refuse("changed");
      const result = await gateTest({ dispeller: source, target, gate });
      if (!unchanged() || !inspect().ok || !same(dispelGatesOn(target, [effect.id]), gates)) return refuse("changed");
      if (typeof result?.outcome?.success !== "boolean" || !Number.isFinite(result.outcome.sl)) return refuse("gateUnconfirmed");
      if (!gatePassed(result.outcome, gate.sl)) {
        await save({ stage: "resolved", effectOutcome: "gateFailed" });
        return { ok: true, ended: [], gateFailed: true };
      }
    }
    if (!unchanged() || !inspect().ok || !same(dispelGatesOn(target, [effect.id]), gates)) return refuse("changed");
    const ended = [{ id: effect.id, name: effect.name, owner: ongoingOwner(review.snapshot) }];
    const removed = await target.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    if (!unchanged() || target.effects.has(effect.id) || !removed?.some(row => row.id === effect.id)) return refuse("removalUnconfirmed");
    await save({ stage: "resolved", effectOutcome: "removed", ended });
    // A failed consequence is reported separately; it cannot reopen deletion.
    try { return { ok: true, ended, consequences: await unstableStrikes({ dispeller: source, ended }) }; }
    catch (error) { return { ok: true, ended, consequenceError: String(error?.message ?? error) }; }
  } catch { return refuse("writeUncertain"); }
  finally { keys.forEach(key => DEVOUR_MAGIC_BUSY.delete(key)); }
}
