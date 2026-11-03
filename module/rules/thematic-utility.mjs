/** The seven first-batch utility spells. No document or canvas access belongs here.
 * Choices and findings stay in a GM-owned cast receipt; effect flags only carry
 * the public capability needed to derive a temporary rule. */

const SCOPE = "azeroth-rpg";
export const UTILITY_FLAG = "utilitySpell";

const SPELLS = Object.freeze({
  "ash-assay": { name: "Ash Assay", classes: ["Shaman"], action: "action", seconds: 0, maxTargets: 1, rangeFt: 0, targetMode: "sample", resultKind: "privateFinding" },
  "exacting-measure": { name: "Exacting Measure", classes: ["Mage"], action: "action", seconds: 0, maxTargets: 1, rangeFt: 0, targetMode: "object", resultKind: "privateFinding" },
  watershed: { name: "Watershed", classes: ["Shaman", "Druid"], action: "halfAction", seconds: 3600, maxTargets: 1, rangeFt: 0, targetMode: "sample", resultKind: "privateFinding" },
  scentweave: { name: "Scentweave", classes: ["Druid"], action: "action", seconds: 3600, maxTargets: 1, rangeFt: 0, targetMode: "creatures", resultKind: "timedScent" },
  "borrowed-voice": { name: "Borrowed Voice", classes: ["Warlock"], action: "action", seconds: 600, maxTargets: 1, rangeFt: 0, targetMode: "self", resultKind: "timedVoice" },
  tidebreath: { name: "Tidebreath", classes: ["Shaman", "Druid"], action: "action", seconds: 28800, maxTargets: 6, rangeFt: 0, targetMode: "creatures", resultKind: "timedBreathing" },
  "grand-lexicon": { name: "Grand Lexicon", classes: ["Mage"], action: "action", seconds: 3600, maxTargets: 6, rangeFt: 30, targetMode: "creatures", resultKind: "timedLanguage" }
});
for (const spell of Object.values(SPELLS)) {
  Object.freeze(spell.classes);
  Object.freeze(spell);
}
const getSpell = identifier => Object.hasOwn(SPELLS, identifier) ? SPELLS[identifier] : null;

export function utilitySpell(identifier) {
  const spell = getSpell(identifier);
  return spell ? { identifier, ...spell, classes: [...spell.classes] } : null;
}

const failure = reason => ({ ok: false, reason });
const success = value => ({ ok: true, value });
const text = (value, max = 120) => typeof value === "string" && value.trim().length > 0
  && value.trim().length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const ref = value => text(value, 200) && !/\s/u.test(value);
const seconds = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));

/** Validate a reviewed choice. `context` is the GM-verified knowledge at cast
 * time, never a claim copied from a player's submitted form. */
export function utilityChoice(identifier, raw, context = {}) {
  if (!getSpell(identifier)) return failure("Unknown utility spell.");
  context = plain(context) ? context : {};
  if (["ash-assay", "exacting-measure", "watershed"].includes(identifier)) {
    const subject = typeof raw === "string" ? raw : keys(raw, ["sample"]) ? raw.sample : null;
    if (!text(subject)) return failure("A specific sample or object is required.");
    return success({ subject: subject.trim() });
  }
  if (identifier === "scentweave") {
    if (!keys(raw, ["scent", "sampled"]) || !text(raw.scent) || raw.sampled !== true || context.sampled !== true) {
      return failure("The caster must have sampled the named natural scent.");
    }
    return success({ scent: raw.scent.trim() });
  }
  if (identifier === "borrowed-voice") {
    if (!keys(raw, ["voice", "heardSeconds"]) || !text(raw.voice) || !seconds(raw.heardSeconds)
      || raw.heardSeconds < 60 || !seconds(context.heardSeconds) || context.heardSeconds < 60) {
      return failure("The caster must personally have heard the named voice for one minute.");
    }
    return success({ voice: raw.voice.trim() });
  }
  if (identifier === "grand-lexicon") {
    if (!keys(raw, ["language", "speakerUuid"]) || !text(raw.language, 80) || !ref(raw.speakerUuid)) {
      return failure("A present, willing speaker must know the chosen language.");
    }
    const known = Array.isArray(context.languages) && context.languages.some(language =>
      typeof language === "string" && language.toLocaleLowerCase() === raw.language.trim().toLocaleLowerCase());
    if (!known || raw.speakerUuid !== context.speakerUuid || context.willing !== true) {
      return failure("A present, willing speaker must know the chosen language.");
    }
    return success({ language: raw.language.trim(), speakerUuid: raw.speakerUuid });
  }
  if (raw !== undefined && raw !== null) return failure("This spell takes no choice.");
  return success(null);
}

function canonicalChoice(identifier, choice) {
  if (["ash-assay", "exacting-measure", "watershed"].includes(identifier)) {
    return keys(choice, ["subject"]) && text(choice.subject) ? { subject: choice.subject.trim() } : null;
  }
  if (identifier === "scentweave") return keys(choice, ["scent"]) && text(choice.scent) ? { scent: choice.scent.trim() } : null;
  if (identifier === "borrowed-voice") return keys(choice, ["voice"]) && text(choice.voice) ? { voice: choice.voice.trim() } : null;
  if (identifier === "grand-lexicon") {
    return keys(choice, ["language", "speakerUuid"]) && text(choice.language, 80) && ref(choice.speakerUuid)
      ? { language: choice.language.trim(), speakerUuid: choice.speakerUuid } : null;
  }
  return choice === null ? null : undefined;
}

/** Construct an authoritative receipt value after choice review and payment.
 * `cast` is an opaque identifier unique to the cast, shared by its recipients. */
export function prepareUtilityRecord({ identifier, cast, casterUuid, recipientUuids, choice, now } = {}) {
  const spell = getSpell(identifier);
  if (!spell) return failure("Unknown utility spell.");
  if (!ref(cast) || !ref(casterUuid) || !seconds(now)) return failure("Invalid cast provenance or world time.");
  if (!Array.isArray(recipientUuids) || recipientUuids.length < 1 || recipientUuids.length > spell.maxTargets
    || recipientUuids.some(uuid => !ref(uuid)) || new Set(recipientUuids).size !== recipientUuids.length) {
    return failure("Invalid recipients.");
  }
  if ((spell.targetMode === "self" || spell.targetMode === "sample" || spell.targetMode === "object")
    && (recipientUuids.length !== 1 || recipientUuids[0] !== casterUuid)) {
    return failure("This spell records its result on the caster.");
  }
  const chosen = canonicalChoice(identifier, choice);
  if (chosen === undefined || (chosen === null && identifier !== "tidebreath")) return failure("Invalid reviewed choice.");
  if (!Number.isSafeInteger(now + spell.seconds)) return failure("Invalid expiry time.");
  return success({ version: 1, identifier, cast, casterUuid, recipientUuids: [...recipientUuids],
    choice: chosen, startsAt: now, expiresAt: now + spell.seconds });
}

/** V14 Active Effect source. A finding is a private receipt, never an effect. */
export function utilityEffectData(record, { recipientUuid, spellUuid, img, description = "", effectId } = {}) {
  const spell = getSpell(record?.identifier);
  if (!spell?.seconds || record.version !== 1 || !ref(record.cast) || !ref(record.casterUuid)
    || !Array.isArray(record.recipientUuids) || !record.recipientUuids.includes(recipientUuid)
    || !ref(spellUuid) || !seconds(record.startsAt) || record.expiresAt !== record.startsAt + spell.seconds
    || (effectId !== undefined && !ref(effectId))
    || (record.identifier === "tidebreath" ? record.choice !== null : canonicalChoice(record.identifier, record.choice) === null)) return null;
  const publicFlag = { version: 1, identifier: record.identifier, cast: record.cast, casterUuid: record.casterUuid,
    recipientUuid, spellUuid, startsAt: record.startsAt, expiresAt: record.expiresAt };
  if (record.identifier === "grand-lexicon") {
    if (!text(record.choice?.language, 80)) return null;
    publicFlag.language = record.choice.language;
  }
  const capability = { identifier: record.identifier, [UTILITY_FLAG]: publicFlag };
  if (record.identifier === "tidebreath") capability.waterBreathing = { source: spell.name, by: record.casterUuid };
  const data = { name: spell.name,
    img: ref(img) ? img : "icons/svg/aura.svg", description: typeof description === "string" ? description : "", origin: spellUuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: record.startsAt }, duration: { value: spell.seconds, units: "seconds", expiry: "turnStart", expired: false },
    flags: { [SCOPE]: capability } };
  if (effectId !== undefined) data._id = effectId;
  return data;
}

/** Read active capability flags explicitly: Foundry's effect cleanup may lag
 * the world clock, and disabled/suppressed effects never grant a capability. */
export function activeUtilityEffects(effects, identifier, now) {
  const spell = getSpell(identifier);
  if (!spell || !spell.seconds || !seconds(now) || !Array.isArray(effects)) return [];
  return effects.flatMap(effect => {
    const flag = effect?.flags?.[SCOPE]?.[UTILITY_FLAG];
    if (effect?.flags?.[SCOPE]?.identifier !== identifier || flag?.identifier !== identifier
      || flag?.version !== 1 || !ref(flag.cast) || !ref(flag.casterUuid) || !ref(flag.recipientUuid)
      || !ref(flag.spellUuid) || effect.origin !== flag.spellUuid
      || !seconds(flag.startsAt) || flag.expiresAt !== flag.startsAt + spell.seconds
      || flag.expiresAt <= now || flag.startsAt > now
      || effect.disabled || effect.isSuppressed || effect.active === false || effect.duration?.expired
      || (effect.parent?.uuid && effect.parent.uuid !== flag.recipientUuid)) return [];
    if (identifier === "grand-lexicon" && !text(flag.language, 80)) return [];
    return [{ version: 1, identifier, cast: flag.cast, casterUuid: flag.casterUuid,
      recipientUuid: flag.recipientUuid, spellUuid: flag.spellUuid, startsAt: flag.startsAt,
      expiresAt: flag.expiresAt, ...(identifier === "grand-lexicon" ? { language: flag.language } : {}) }];
  });
}

/** Temporary Lexicon is an overlay, not an Actor language write. A new cast
 * replaces an older Lexicon for this recipient while existing languages stay. */
export function borrowedLanguages(base, effects, now) {
  const languages = Array.isArray(base) ? base.filter(language => text(language, 80)) : [];
  const active = activeUtilityEffects(effects, "grand-lexicon", now)
    .sort((a, b) => b.startsAt - a.startsAt || b.cast.localeCompare(a.cast));
  if (active[0]) languages.push(active[0].language);
  return [...new Map(languages.map(language => [language.toLocaleLowerCase(), language])).values()]
    .sort((a, b) => a.localeCompare(b));
}

/** Underwater conversation needs two recipients from the same live cast. */
export function underwaterSpeechAllowed(aEffects, bEffects, { distance, sameScene, now } = {}) {
  if (sameScene !== true || typeof distance !== "number" || !Number.isFinite(distance)
    || distance < 0 || distance > 30) return false;
  const a = activeUtilityEffects(aEffects, "tidebreath", now);
  const b = activeUtilityEffects(bEffects, "tidebreath", now);
  return a.some(left => b.some(right => left.cast === right.cast && left.casterUuid === right.casterUuid
    && left.spellUuid === right.spellUuid && left.recipientUuid !== right.recipientUuid));
}
