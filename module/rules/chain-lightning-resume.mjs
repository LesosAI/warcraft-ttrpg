/**
 * **A PAID CHAIN LIGHTNING WHOSE ARCS WERE NOT RESOLVED, FINISHED FROM ITS RECORD** (D-2174).
 *
 * `castSpell` resolves the arc path again after a successful Casting Test. Where that fails, the
 * cast is already paid: the card posts its roll with no damage controls (`chainLightningRoute
 * .unresolved`). From 0.18.1 such a card also carries `chainLightningResume`, the record this
 * module builds: the initial target, and every input the cast's own damage reads, frozen at the
 * cast. The GM's review then re-resolves the path and posts the resolved card from this record
 * and the recorded Roll - no new Test, no payment (`effects/chain-lightning-resume.mjs`).
 *
 * **WHY A COPY OF THE CAST'S MITIGATION**: `castSpell`'s `mitigate` is a closure over some forty
 * values of a 3,500-line function no Vitest can load, so it is not lifted out of the live cast.
 * `resumeDamageOptions` is its copy for the one shape Chain Lightning has (no rider, no Conflagrate,
 * no Arcane Missiles, no half on a pass, nothing of 07's Death Coil), and `chain-lightning-resume
 * .test.mjs` pins the cast's `mitigate` source: a change there fails that test until this copy is
 * brought in step with it. Pure: no Foundry imports.
 */
import { PHYSICAL, spellDamageLane } from "./spell-damage-type.mjs";
import { immuneReadAsWard } from "./class-talents.mjs";
import { chosenSignatureExtras, signatureRecipientKey } from "./signature-scaling.mjs";

export const RESUME_VERSION = 1;

const finite = value => typeof value === "number" && Number.isFinite(value);
const text = value => typeof value === "string" && value.length > 0;
const plain = value => JSON.parse(JSON.stringify(value ?? null));

/**
 * The record `castSpell` writes on an unresolved Chain Lightning card, or null where this door
 * cannot finish the cast (no damage, a rider, no initial target, data that will not serialise).
 * Never mutates what it is handed. `context` is the card's own render context; `config` is not kept.
 */
export function chainResumeRecord({ initial, rating, baseRating, rider = null, extras = 0, boost = 0, sl, wardPierce = 0,
  bonusKey = null, damageSchool = null, damageType = null, spellSchool = null, asWard = 0, typed = [], halved = null,
  bypass = false, deals = false, viaItem = false, signatureBonuses = [], context = null } = {}) {
  if (deals !== true || !finite(rating) || !finite(baseRating) || rider) return null;
  if (!Array.isArray(initial) || initial.length !== 1) return null;
  const [first] = initial;
  if (!text(first?.sceneId) || !text(first?.tokenId) || !text(first?.actorId)) return null;
  if (!context || typeof context !== "object") return null;
  try {
    const { config: _config, ...kept } = context;
    return plain({
      version: RESUME_VERSION,
      initial: [{ sceneId: first.sceneId, tokenId: first.tokenId, actorId: first.actorId }],
      rating, baseRating, extras: Number(extras) || 0, boost: Number(boost) || 0, sl, wardPierce: Number(wardPierce) || 0,
      bonusKey, damageSchool, damageType, spellSchool, asWard: Number(asWard) || 0, typed: Array.isArray(typed) ? typed : [],
      halved: halved ?? null, bypass: bypass === true, viaItem: Boolean(viaItem),
      signatureBonuses: Array.isArray(signatureBonuses) ? signatureBonuses : [], context: kept
    });
  } catch { return null; }
}

/** Whether a stored record is one this door can finish from. */
export function isResumeRecord(record) {
  if (!record || typeof record !== "object" || record.version !== RESUME_VERSION) return false;
  const [first] = Array.isArray(record.initial) ? record.initial : [];
  return record.initial.length === 1 && text(first?.sceneId) && text(first?.tokenId) && text(first?.actorId)
    && finite(record.rating) && finite(record.baseRating) && finite(record.extras) && finite(record.boost)
    && finite(record.sl) && finite(record.wardPierce) && finite(record.asWard) && text(record.damageSchool)
    && Array.isArray(record.typed) && Array.isArray(record.signatureBonuses)
    && Boolean(record.context) && typeof record.context === "object" && !Array.isArray(record.context);
}

/**
 * The options `resolveRecordedDamage` takes for one target of the resumed card: `castSpell`'s
 * `mitigate(t, forcedFor(t), { signatureIndex: index })` for Chain Lightning, from the record.
 * `pierceAt` is the caster's Ward pierce against this target, read by the caller.
 */
export function resumeDamageOptions(record, target, { index, targets = [], pierceAt = 0 } = {}) {
  const t = target ?? null;
  const physical = record.damageType === PHYSICAL;
  const rated = record.baseRating;
  const forced = record.boost ? (rated ?? 0) + record.extras + record.boost : null;
  const read = physical ? { immune: t?.immune ?? [], ward: 0 }
    : immuneReadAsWard({ immune: t?.immune ?? [], ward: Math.max(0, (t?.wardBySchool?.[record.damageSchool] ?? 0) - record.wardPierce - pierceAt),
      school: record.damageSchool, asWard: record.asWard });
  return {
    rating: forced ?? (record.rating === null ? 0 : rated + record.extras), sl: record.sl,
    ...spellDamageLane({ type: record.damageType, spellSchool: record.spellSchool, apByLocation: t?.apByLocation ?? {} }),
    fireTakenBonus: t?.fireTakenBonus ?? 0,
    ward: read.ward,
    schoolArmor: physical ? 0 : (t?.schoolArmor?.[record.damageSchool] ?? 0),
    immune: read.immune, vulnerable: t?.vulnerable ?? [],
    slAddsToDamage: false,
    extras: [...record.typed, ...chosenSignatureExtras(record.signatureBonuses, targets.map(signatureRecipientKey), index)],
    wardBySchool: t?.wardBySchool ?? {}, schoolArmorBySchool: t?.schoolArmor ?? {},
    dealtHalved: record.halved,
    passedHalf: false,
    bypass: record.bypass === true
  };
}

/** The Rating the card's damage line names: `castSpell`'s `ratingFor(first).rating + extras`. */
export function resumeExplainedRating(record) {
  return record.baseRating + record.extras;
}

/**
 * The resolved card's flags: the unresolved card's own, with what the route changes - the targets,
 * the damage by target, the arc tracking, the route resolved - and the record dropped for a
 * pointer back. `attackResolution` is the caller's (`attackResolutionSeed`), as the cast's is.
 */
export function resumedCardFlags(flags, { fromId, targets, damageByTarget, attackResolution }) {
  const { chainLightningResume: _record, chainLightningSuperseded: _superseded, ...kept } = plain(flags ?? {});
  return {
    ...kept,
    chainLightningRoute: { automatic: true, unresolved: false },
    chainLightningResumedFrom: fromId,
    targets: plain(targets),
    damageByTarget: plain(damageByTarget),
    mirrorImageDefense: true,
    attackResolution: plain(attackResolution),
    riderByTarget: []
  };
}

/** The card's *From* line with the unresolved route's words taken out and the resume's put in. */
export function resumedSourceLine(source, { unresolved, resumed }) {
  const parts = typeof source === "string" && source ? source.split(" · ") : [];
  return [...parts.filter(part => part !== unresolved), resumed].filter(Boolean).join(" · ") || null;
}
