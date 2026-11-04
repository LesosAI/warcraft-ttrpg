/** Classic Nullifier adaptation. Pure selection law; no document mutations.
 * GM classifications must come from a trusted
 * review, never be accepted as authority from a player's query payload.
 */
import { dispelJudgement } from "./dispel.mjs";
import { VEKNISS_FLAG, validVeknissState } from "./vekniss.mjs";
import { BLOODPETAL_FLAG, validBloodpetal } from "./bloodpetal.mjs";
import { classifyCarrier } from "./cures.mjs";

export const NULLIFY_CATEGORIES = Object.freeze(["curse", "disease", "poison", "magic"]);

/** Judge one whole effect. Known disease/poison statuses need no inference;
 * other effects need an explicit harmful classification by the GM.
 * An injury, maintained passive or protected spell remains protected even
 * when a condition is attached to the same Active Effect.
 */
export function nullifyJudgement(effect, { classification = null, archmage = [] } = {}) {
  const refuse = reason => ({ ok: false, reason, category: null });
  if (!effect || effect.disabled === true || effect.active === false) return refuse("inactive");
  const rawStatuses = effect.statuses;
  const statuses = rawStatuses instanceof Set ? [...rawStatuses] : Array.isArray(rawStatuses) ? rawStatuses : [];
  const categoryOf = { poisoned: "poison", diseased: "disease" };
  const known = statuses.length > 0 && statuses.every(s => Object.hasOwn(categoryOf, s));
  const categories = new Set(statuses.map(s => categoryOf[s]));
  // The existing Dispel law excludes conditions. This ability deliberately
  // includes harmful magical conditions, poison and disease, but must retain
  // all the other protections, including Archmage and undispellable marks.
  const protection = dispelJudgement({ ...effect, statuses: [] }, { archmage });
  if (!protection.ok) return refuse(protection.reason);
  if (classification?.harmful === false) return refuse("beneficial");
  // A carried poison or disease is what its FLAG says, whatever conditions it
  // holds: a gear poison holding Slowed or Blinded was `needsReview` by status alone.
  const carrier = classifyCarrier(effect);
  if (carrier) return { ok: true, reason: null, category: carrier.category };
  if (classification?.harmful === true && NULLIFY_CATEGORIES.includes(classification.category)) {
    return { ok: true, reason: null, category: classification.category };
  }
  // Itch is already a poison before it inflicts a condition. Catalyst's
  // slowing is part of that same dose, so cleansing removes the whole effect.
  // Recognize the structured system effect, never a name or a generic flag.
  const flags = effect.flags?.["azeroth-rpg"];
  if (flags?.harmful === true && flags?.magic === true && validBloodpetal(flags[BLOODPETAL_FLAG])
    && statuses.length === 1 && statuses[0] === "entangled") return { ok: true, reason: null, category: "magic" };
  const dose = flags?.[VEKNISS_FLAG];
  if (flags?.harmful === true && flags?.poison === true && validVeknissState(dose)
    && (dose.phase === "itch" ? statuses.length === 0
      : statuses.includes("poisoned") && statuses.every(s => ["poisoned", "slowed"].includes(s)))) {
    return { ok: true, reason: null, category: "poison" };
  }
  if (known && categories.size === 1) return { ok: true, reason: null, category: [...categories][0] };
  return refuse("needsReview");
}

/** Validate a submitted choice against current target/effect snapshots before
 * any payment. One effect per distinct allied target; no partial success.
 * Distance and alliance are trusted caller measurements, not client claims.
 */
export function nullifySelection(targets = [], choices = [], { feet = 10, archmage = [] } = {}) {
  const refuse = (reason, targetId = null) => ({ ok: false, reason, targetId, selections: [] });
  if (!Array.isArray(choices) || choices.length === 0) return refuse("empty");
  const seen = new Set();
  const selections = [];
  for (const choice of choices) {
    const targetId = choice?.targetId;
    if (typeof targetId !== "string" || !targetId || seen.has(targetId)) return refuse("duplicateOrMissingTarget", targetId ?? null);
    seen.add(targetId);
    const matches = targets.filter(t => t.id === targetId);
    if (matches.length !== 1) return refuse("missingTarget", targetId);
    const target = matches[0];
    if (target.allied !== true || target.willing !== true) return refuse("notWillingAlly", targetId);
    if (!Number.isFinite(target.distance) || target.distance < 0 || target.distance > feet) return refuse("range", targetId);
    const effects = (target.effects ?? []).filter(e => e.id === choice.effectId);
    if (typeof choice.effectId !== "string" || !choice.effectId || effects.length !== 1) return refuse("missingEffect", targetId);
    const judgement = nullifyJudgement(effects[0], {
      classification: target.classifications?.[choice.effectId] ?? null, archmage
    });
    if (!judgement.ok) return refuse(judgement.reason, targetId);
    selections.push({ targetId, effectId: choice.effectId, category: judgement.category });
  }
  return { ok: true, reason: null, targetId: null, selections };
}
