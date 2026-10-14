/**
 * A Signature that stands on SOMEBODY ELSE (08 §20, D-696). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * **Nothing in this system could say it.** Every other key in
 * `rules/signatures.mjs` lands on the bearer — what they grant themselves, what
 * their blow does, what a blow on them answers with, what they press. The
 * Bulwark of Tyr's Hand is the one entry in the chapter that reaches past them:
 * *while you are below half Health, every other member of your party within 15
 * feet takes 5 less damage from every source.* It was `none("noEquivalent")`
 * for exactly that reason, and D-691 logged the same gap for 14's own auras as
 * open item **O-97**. This is the carrier, built once for both.
 *
 * ## Why it is an Active Effect with a `system.changes` entry
 *
 * CLAUDE.md §6: *Active Effects change numbers, the roll pipeline changes
 * dice.* **Damage reduction is a number**, so unlike `rules/banes.mjs` — whose
 * effect is a bare flag because a Bane is dice — the effect here carries a real
 * change on `system.damageReduction`, in the **`final`** phase, because that
 * key is derived rather than stored (`consumables.mjs#phaseFor`'s own rule).
 * The flag beside it is the bookkeeping the diff needs and nothing else.
 *
 * ## What it is measured against, and what happens with no token
 *
 * A distance between the nearest squares two tokens occupy, measured through
 * `canvas/footprints.mjs` - the one module that asks core's grid for one -
 * which is how every distance in this system is measured (D-669, D-732). **An
 * aura whose bearer has
 * no token on the scene reaches NOBODY, and one whose candidate has none is not
 * reached** — and that is the opposite of `effects/passives.mjs`' ruling that a
 * creature with no token keeps its own passive, deliberately: a passive is the
 * creature's own state and needs no position, while an aura *is* a distance
 * from a body. A bearer nobody has placed is standing nowhere, so there is
 * nothing to be within 15 feet of.
 *
 * ## Why the plan is diffed rather than rewritten
 *
 * `AzerothActor#syncBound` is the shape (D-643): an effect that is already
 * right is left alone, so a token nudged one square does not delete and
 * re-create an effect on every ally in the room. `diffAuras` is the whole
 * judgement and `effects/auras.mjs` is the write.
 *
 * ## And the auras a class feature or a talent lays (D-755)
 *
 * The lead's play-test, 2026-09-25: *the Paladin's Aura of Resolve does not
 * show the Boon on Spirit Tests to members of the party within range in
 * combat.* Nothing reached an ally at all. 02 §7's Aura of Resolve was an
 * unticked reminder on the PALADIN's own dialog - on Body and Reflex as well
 * as Spirit - and this door took an item's Signature as its only source and
 * damage reduction as its only payload. It takes three sources now, one
 * descriptor for all of them (`aura`), and five payloads:
 *
 * | Payload | Carried as | Read by |
 * |---|---|---|
 * | `damageReduction` | `add` on `system.damageReduction` | `applyDamage` (D-696) |
 * | `boon` | a FLAG and no change: a Boon is dice (CLAUDE.md §6) | `auraBoonRows` on the model, the dialog's `auraBoon` line |
 * | `schoolArmor` | `upgrade` on `system.schoolArmor.<school>` | `targetSnapshots`, then `resolveDamage` after the Ward |
 * | `floor` | `upgrade` on the Armor Points the ally HAS and on Ward in every school | the model's own numbers |
 * | `spellDamage` | `add` on `system.damageBonus.spell.all`, a character's alone | `castSpell`'s lane bonus |
 *
 * **Every change is in the `final` phase**, because every key is derived
 * (CLAUDE.md §15), and `upgrade`'s default priority (40) runs after every
 * `add` (20), which is what a floor is.
 *
 * **Allies, the holder among them** (the lead, 2026-09-26, reversing the
 * 2026-09-25 call *allies, not the Paladin*): *the caster counts as an ally
 * unless the spell or aura specifically says "other than you" or similar
 * wording.* In a fight the tracker's side, out of one the Party and what it
 * has bound - `rules/distance.mjs#countsAsAlly`, which is true of the holder
 * themselves. A source whose own sentence leaves its holder out - 08 §20's
 * Bulwark of Tyr's Hand, *every OTHER member of your party* - carries
 * `excludeOwner`, read off the words by `excludesHolder`. Demonic Pact is
 * measured from the demon rather than from the warlock, and reaches the
 * warlock the way every other aura reaches its holder.
 *
 * **One source identity gives one row to an ally** (`strongestPerGroup`): two
 * Paladins give one Boon, and of two Avenging Bulwarks the higher applies. An
 * item's own aura keeps D-696's stacking - two Bulwarks of Tyr's Hand are two
 * things being worn - so its group is its own key.
 */

import { AZEROTH } from "../config.mjs";
// Where the art lives (D-676), for the one aura whose feature item wears the
// class's picture rather than its own.
import { ICON_DIR } from "./icons.mjs";

/** The flag one laid aura rides on, under the system's own namespace. */
export const AURA_FLAG = "aura";

/**
 * The derived number an aura's change writes to. `AzerothActor#applyDamage`
 * takes it off every blow; it is not in either actor schema, because a derived
 * value is never stored (CLAUDE.md §4), and both models set it to 0 in
 * `prepareDerivedData` so the `final` phase has a number to add to.
 */
export const AURA_CHANGE_KEY = "system.damageReduction";

/**
 * WHAT A LAID AURA CARRIES, VERSIONED (D-755). The flag gained a payload and a
 * group; an effect laid before them carries `damageReduction` at the top of
 * its flag and no version at all, and `diffAuras` compares the version, so
 * every such effect is replaced ONCE and never again.
 */
export const AURA_VERSION = 2;

/** What a laid aura wears where its source has no picture of its own. */
export const AURA_FALLBACK_ICON = "icons/svg/aura.svg";

/**
 * The picture a CLASS FEATURE's aura wears, by the feature's identifier. A
 * feature item takes the class's own picture (`_syncClassFeaturesNow`), so the
 * effect an ally carries would otherwise wear a Paladin's crest; a talent and
 * a worn thing wear their own WoW icon (D-676). `auras.test.mjs` fails on an
 * entry whose file is not on disk, because a missing picture is a 404 and the
 * smoke run fails on a console error.
 */
export const AURA_ICONS = Object.freeze({
  "aura-of-resolve": `${ICON_DIR}/spell_holy_devotionaura.png`
});

/** An aura with nothing set, as `emptySignature()` carries it. */
export function emptyAura() {
  return { feet: null, targets: null, damageReduction: null };
}

/** Freeze a descriptor all the way down, so a patch that forgets to copy throws. */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * **ONE DESCRIPTOR FOR EVERY AURA A CLASS FEATURE OR A TALENT LAYS** (D-755).
 *
 * `class-features.mjs` and `talent-effects.mjs` both build their rows with this,
 * and a feature's is stamped onto the item whole (`auraStamp`). Amounts may say
 * `"rank"` or `"10*rank"`; `talent-effects.mjs#talentAurasFor` evaluates them at
 * the rank taken.
 *
 * - `targets` is `allies` (`rules/distance.mjs#countsAsAlly`) unless it says
 *   `party`, which is D-696's item Signature.
 * - `centre` is where the distance is measured FROM: the holder (`self`) or
 *   every token of every demon bound to them (`boundDemon`).
 * - `excludeOwner` leaves the holder out of their own aura, and ONLY where the
 *   source's sentence says so - *other than you*, *every other member* - which
 *   `excludesHolder` reads (the lead, 2026-09-26: *the caster counts as an ally
 *   unless the spell or aura specifically says "other than you"*). It replaced
 *   `includeOwner`, which let the holder IN where the default left them out.
 * - `gate` is `shield` (one is equipped) or `spell:<identifier>` (the holder
 *   carries that spell's laid effect).
 * - `holderOnly` (D-772) turns the aura round: it reaches its HOLDER alone, and
 *   only while ANOTHER ally stands within `feet` - 04's Sacred Duty, *While a
 *   friendly target is within 5 feet of you, your Armor Points rise by 1 per
 *   rank*. The friendly target is somebody else (MY READING, for the lead: the
 *   holder within 5 feet of themselves would make the clause say nothing).
 * - `armor` (D-772) adds Armor Points at every location the creature has.
 *
 * FROZEN ALL THE WAY DOWN: a talent's patch that forgot to copy the aura before
 * widening it would widen the TABLE, for every Paladin in the world, and a
 * frozen object makes that a thrown error instead of a silent one.
 *
 * @param {object} spec
 * @returns {Readonly<object>}
 */
export function aura({
  feet, targets = "allies", centre = "self", excludeOwner = false, gate = null,
  boon = null, schoolArmor = null, floor = null, spellDamage = null, damageReduction = null,
  armor = null, holderOnly = false
} = {}) {
  return deepFreeze({ feet, targets, centre, excludeOwner, gate, boon, schoolArmor, floor, spellDamage, damageReduction, armor, holderOnly });
}

/**
 * **WHETHER A SENTENCE LEAVES ITS HOLDER OUT** (the lead, 2026-09-26): *the
 * caster counts as an ally unless the spell or aura specifically says "other
 * than you" or similar wording.* The similar wordings the book writes, and
 * nothing looser: *other than you(rself)*, *every other member / ally /
 * friendly*, *each other ally*, *another ally*, *allies other than*. A
 * sentence that says *every other enemy* excludes nobody on the holder's side,
 * and *every other creature within 10 feet* is Conflagrate's word for
 * everybody but the TARGET: neither is one of these.
 *
 * @param {string} text  plain words, or HTML
 * @returns {boolean}
 */
export function excludesHolder(text) {
  const plain = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return HOLDER_EXCLUDED.test(plain);
}

/** The wordings `excludesHolder` reads, exported for the census that holds 02, 04, 07 and 08 to it. */
export const HOLDER_EXCLUDED = /\bother than (?:you|yourself)\b|\bevery other (?:member|ally|friendly)\b|\beach other ally\b|\banother ally\b|\ballies other than\b/i;

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};

/** A whole number at or above a floor, else null. */
const atLeast = (v, floor) => {
  const n = num(v);
  return n !== null && n >= floor ? n : null;
};

/**
 * A stored aura made valid, KEY BY KEY. `cleanSignature`'s own rule — core runs
 * `migrateData` over partial update data, so a key the raw object does not
 * carry must not be written (D-671, and D-692's recursion of it).
 *
 * A distance of 0 is not an aura and a reduction of 0 is not one either, so
 * both floor at 1; `targets` outside the vocabulary is nulled, and `auraStands`
 * then refuses it rather than reaching everybody.
 */
export function cleanAura(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if ("feet" in src) out.feet = atLeast(src.feet, 1);
  if ("targets" in src) {
    out.targets = typeof src.targets === "string" && AZEROTH.auraTargets.includes(src.targets) ? src.targets : null;
  }
  if ("damageReduction" in src) out.damageReduction = atLeast(src.damageReduction, 1);
  return out;
}

/* -------------------------------------------- */
/*  What an aura gives (D-755)                   */
/* -------------------------------------------- */

/** A school list, the vocabulary's own and each once. */
function cleanSchools(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(s => typeof s === "string" && s in AZEROTH.schools))];
}

/** A list of condition ids, the vocabulary's own, each once and sorted. */
function cleanConditions(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(c => typeof c === "string" && c in AZEROTH.conditions))].sort();
}

/**
 * A Boon on one kind of Test, or null. **A Resilience Boon names WHICH
 * Resilience or it gives nothing**: 02 §7 says *Resilience (Spirit) Tests*, and
 * a Boon that forgot the word would land on Body and Reflex as well, which is
 * the reminder's own fault this replaced.
 *
 * **OR WHICH CONDITION IT IS AGAINST** (07's Hallowed Ground, the movement
 * phase): *a Boon on Resilience Tests against **Frightened** and **Charmed***
 * names no Resilience and names the conditions instead, so `against` carries
 * them and `auraBoonsOn` matches the Test's own - a Test whose door does not
 * say what it resists makes it the table's line.
 */
function cleanBoon(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = typeof raw.kind === "string" && raw.kind in AZEROTH.testKinds ? raw.kind : null;
  const boons = atLeast(raw.boons, 1);
  if (!kind || !boons) return null;
  const against = cleanConditions(raw.against);
  if (kind !== "resilience") return against.length ? { kind, resilience: null, against, boons } : { kind, resilience: null, boons };
  const resilience = typeof raw.resilience === "string" && raw.resilience in AZEROTH.resiliences ? raw.resilience : null;
  if (against.length) return { kind, resilience, against, boons };
  return resilience ? { kind, resilience, boons } : null;
}

/**
 * A Bane on one kind of Test, or null (the movement phase: 07's Insect Swarm,
 * Hallowed Ground's enemies, Crucible). **A FLAG, never a change** (CLAUDE.md
 * §6): a Bane is dice. `kind` is a Test kind or `all`; `judged` makes it the
 * table's line rather than a ticked one - Crucible's *holding a metal weapon*,
 * which 08 records no material for.
 */
function cleanBane(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "all" || (typeof raw.kind === "string" && raw.kind in AZEROTH.testKinds) ? raw.kind : null;
  const banes = atLeast(raw.banes, 1);
  if (!kind || !banes) return null;
  return raw.judged === true ? { kind, banes, judged: true } : { kind, banes };
}

/** Ward ADDED against some schools (Hallowed Ground's *gains Ward 2*), resolved, or null. */
function cleanWardAdd(raw) {
  if (!raw || typeof raw !== "object") return null;
  const schools = cleanSchools(raw.schools);
  const amount = atLeast(raw.amount, 1);
  return schools.length && amount ? { schools, amount } : null;
}

/** Armor Points against some schools, RESOLVED to a number, or null. */
function cleanSchoolArmor(raw) {
  if (!raw || typeof raw !== "object") return null;
  const schools = cleanSchools(raw.schools);
  const amount = atLeast(raw.amount, 1);
  return schools.length && amount ? { schools, amount } : null;
}

/** A floor under Armor Points and Ward, or null where it raises neither. */
function cleanFloor(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ap = atLeast(raw.ap, 1) ?? 0;
  const ward = atLeast(raw.ward, 1) ?? 0;
  return ap || ward ? { ap, ward } : null;
}

/**
 * WHAT A ROW GIVES, and nothing else: every payload it carries that does
 * something, cleaned, always in one order - `damageReduction`, `boon`,
 * `schoolArmor`, `floor`, `spellDamage`, then the movement phase's four for an
 * area a creature stands in, `bane`, `ward`, `speed` and `healing` - so two
 * rows that give the same thing compare equal (`auraSignature`). A payload of
 * 0 is no payload; `speed` alone may be negative, since 07's *Speed drops by
 * 10 feet* is the only thing it says.
 *
 * The one reading of a row every other function here goes through, so the
 * flag, the change and the diff cannot each decide differently what a row
 * means.
 *
 * @param {object} row  a resolved source, a planned row, or a stored payload
 * @returns {{damageReduction?: number, boon?: object, schoolArmor?: object, floor?: object,
 *   spellDamage?: number, bane?: object, ward?: object, speed?: number, healing?: "half"}}
 */
export function auraPayloadOf(row = {}) {
  const src = row && typeof row === "object" ? row : {};
  const out = {};
  const reduction = atLeast(src.damageReduction, 1);
  if (reduction) out.damageReduction = reduction;
  const boon = cleanBoon(src.boon);
  if (boon) out.boon = boon;
  const armour = cleanSchoolArmor(src.schoolArmor);
  if (armour) out.schoolArmor = armour;
  const floor = cleanFloor(src.floor);
  if (floor) out.floor = floor;
  const spell = atLeast(src.spellDamage, 1);
  if (spell) out.spellDamage = spell;
  // Armor Points ADDED at every location the creature has (04's Sacred Duty, D-772).
  const armor = atLeast(src.armor, 1);
  if (armor) out.armor = armor;
  const bane = cleanBane(src.bane);
  if (bane) out.bane = bane;
  const ward = cleanWardAdd(src.ward);
  if (ward) out.ward = ward;
  const speed = num(src.speed);
  if (speed) out.speed = speed;
  if (src.healing === "half") out.healing = "half";
  // Tidecall's *may stand from **Prone** without spending movement*: a flag
  // `AzerothActor#toggleStatusEffect` reads, like the Boon, never a change.
  if (src.standFree === true) out.standFree = true;
  return out;
}

/**
 * Whether an aura descriptor does anything at all. A distance with no payload
 * is a circle drawn on the floor, and a payload with no distance would reach
 * the whole scene — neither stands. Nor does one whose roster this system has
 * no word for: `targets` outside `AZEROTH.auraTargets` reaches nobody rather
 * than everybody.
 */
export function auraStands(aura) {
  if (!aura) return false;
  if (!aura.feet || !aura.targets) return false;
  if (!AZEROTH.auraTargets.includes(aura.targets)) return false;
  return Object.keys(auraPayloadOf(aura)).length > 0;
}

/**
 * Whether one aura reaches one candidate.
 *
 * @param {{feet: number, targets: string, excludeOwner?: boolean}} aura  resolved, with a payload
 * @param {object} candidate
 * @param {boolean} [candidate.self]   the holder themselves. **Reached like any
 *   ally** (the lead, 2026-09-26: *the caster counts as an ally unless the
 *   spell or aura specifically says "other than you"*), and left out only by
 *   `excludeOwner`, which is 08 §20's *every OTHER member of your party*.
 * @param {boolean} [candidate.party]  marked as The Party (D-658), for a `party` aura
 * @param {boolean} [candidate.ally]   `rules/distance.mjs#countsAsAlly`, for an `allies` one
 * @param {number|null} [candidate.feet]  the measured distance, or null where
 *   nothing was measured. **Null never reaches**: an aura is a distance from a
 *   body, and a token nobody has placed is standing nowhere.
 * @returns {boolean}
 */
export function auraReaches(aura, candidate = {}) {
  if (!auraStands(aura)) return false;
  const self = candidate.self === true;
  // **AN AURA ON ITS HOLDER ALONE** (04's Sacred Duty, D-772): the holder, and
  // only while another ally stands within its feet - `allyNear`, which the pass
  // measures for the holder's own candidate.
  if (aura.holderOnly === true) return self && candidate.allyNear === true;
  if (self && aura.excludeOwner === true) return false;
  if (!self && aura.targets === "party" && candidate.party !== true) return false;
  if (!self && aura.targets === "allies" && candidate.ally !== true) return false;
  const feet = candidate.feet;
  if (typeof feet !== "number" || !Number.isFinite(feet)) return false;
  return feet <= aura.feet;
}

/**
 * The `system.changes` one aura writes on one candidate. **Every one `final`**:
 * each key is derived, and an `initial` change would land before
 * `prepareDerivedData` and the model's own line would write it back out again,
 * which is D-691's scar exactly.
 *
 * The candidate decides two of them:
 *
 * - **A floor raises only the Armor Points a creature HAS** (`apLocations`). A
 *   creature's location is null where it has none (06 §2), and `upgrade` over
 *   null writes the floor (`NumberField#_applyChangeUpgrade`, 14.367) - an ooze
 *   would sprout a head to be called-shot. No list, no location.
 * - **Spell damage is a character's alone.** A creature's `damageBonus` is a
 *   scalar its ATTACKS read (`NpcData`, D-643), and 14's creatures have no spell
 *   lane to add to, so a creature in Demonic Pact's reach gets nothing.
 *
 * It still takes a planned row alone, so D-696's `auraChanges(row)` reads as
 * it always did.
 *
 * @param {object} row
 * @param {{type?: string|null, apLocations?: string[]|null}} [candidate]
 * @returns {Array<{key: string, type: string, value: string, phase: "final"}>}
 */
export function auraChanges(row = {}, { type = null, apLocations = null } = {}) {
  const p = auraPayloadOf(row);
  const out = [];
  const change = (key, kind, n) => out.push({ key, type: kind, value: String(n), phase: "final" });
  if (p.damageReduction) change(AURA_CHANGE_KEY, "add", p.damageReduction);
  if (p.schoolArmor) for (const school of p.schoolArmor.schools) change(`system.schoolArmor.${school}`, "upgrade", p.schoolArmor.amount);
  if (p.floor?.ap) {
    for (const location of Object.keys(AZEROTH.locations)) {
      if ((apLocations ?? []).includes(location)) change(`system.ap.${location}`, "upgrade", p.floor.ap);
    }
  }
  if (p.floor?.ward) for (const school of Object.keys(AZEROTH.schools)) change(`system.ward.${school}`, "upgrade", p.floor.ward);
  if (p.spellDamage && type === "character") change("system.damageBonus.spell.all", "add", p.spellDamage);
  // 04's Sacred Duty (D-772): an `add` on each location the creature HAS, as
  // the floor's own rule - a creature with no head grows none.
  if (p.armor) {
    for (const location of Object.keys(AZEROTH.locations)) {
      if ((apLocations ?? []).includes(location)) change(`system.ap.${location}`, "add", p.armor);
    }
  }
  // The movement phase's two numbers (07's Hallowed Ground and Hoarfrost): a
  // Ward GAINED is an `add` where Tree of Life's floor is an `upgrade`, and a
  // Speed that drops by 10 feet adds -10 to the derived Speed.
  if (p.ward) for (const school of p.ward.schools) change(`system.ward.${school}`, "add", p.ward.amount);
  if (p.speed) {
    change("system.speed", "add", p.speed);
    // **AND NEVER BELOW 0** (the final review of D-757). The `final` phase
    // lands after `rules/speed.mjs#speedFrom` floors the parts, so a Speed 5
    // creature in Hoarfrost read -5 on its sheet. `upgrade`'s default priority
    // (40) runs after every `add` (20), so the floor takes every drop at once.
    if (p.speed < 0) change("system.speed", "upgrade", 0);
  }
  return out;
}

/**
 * Whether a row gives this candidate anything: a Boon, a Bane or halved
 * healing (each a flag, and no change), or at least one change. A Demonic Pact
 * reaching a creature gives nothing, and an effect carrying nothing is noise on
 * its sheet and its token.
 */
export function auraGives(row = {}, candidate = {}) {
  const p = auraPayloadOf(row);
  return Boolean(p.boon) || Boolean(p.bane) || Boolean(p.healing) || Boolean(p.standFree) || auraChanges(row, candidate).length > 0;
}

/**
 * What one row IS, for the diff: its version, its payload and its changes, and
 * **every word on the laid effect that play can move** (D-755's review):
 *
 * - `owner`, the holder's name. The effect is called *Aura of Resolve (Uther)*
 *   and its text says *within 20 ft of Uther*, so a holder renamed left every
 *   ally carrying the old name for as long as nobody moved. A rename is rare,
 *   and one re-lay on each ally in reach is the price of a true name.
 * - `feet`, the reach the text states. Wide Aura taken while an ally stood
 *   inside 20 feet kept *within 20 ft* on an aura that now reached 30.
 * - `scene`, the scene whose pass laid it (`auraLaidHere`). An effect a pass
 *   keeps is one that pass owns, so a creature that has moved to this scene
 *   takes this scene's stamp on the next pass rather than keeping another's.
 *
 * The SOURCE's own name is the feature's or the talent's, which play does not
 * change, and a key names the source already. Nothing here reads the book's
 * sentence or the picture: those are the item's, and they move only when a
 * world is migrated.
 */
export function auraSignature(row = {}) {
  const changes = Array.isArray(row?.changes)
    ? row.changes.map(c => [c?.key ?? null, c?.type ?? null, String(c?.value ?? ""), c?.phase ?? null])
    : null;
  return JSON.stringify([
    row?.v ?? null, auraPayloadOf(row), changes,
    String(row?.owner ?? ""), num(row?.feet), row?.scene ? String(row.scene) : null
  ]);
}

/**
 * **WHICH LAID AURAS A PASS OVER ONE SCENE MAY LIFT FROM A CREATURE WITH NO
 * TOKEN ON IT** (D-755's review; O-142).
 *
 * A pass measures the scene the active GM is viewing, and a creature with no
 * token there is reached by nothing on it. The pass used to sweep EVERY world
 * actor wearing an aura, so the GM opening a prep map lifted every aura off a
 * whole party standing on another scene - a delete on each, a re-render, the
 * icons gone off the tokens - and put them all back on the way home. An effect
 * now names the scene that laid it (`scene` on the flag), and a creature with
 * no token here loses only what THIS scene laid: it has left, and nothing here
 * reaches it. What another scene laid stays exactly as it was laid until that
 * scene is viewed.
 *
 * Two stamps belong to whichever pass finds them, so nothing is left standing
 * forever: **none at all** (an effect laid before the stamp existed), and **a
 * scene the world no longer has**.
 *
 * @param {string|null} stamp  the scene id the laid effect's flag names
 * @param {string} sceneId     the scene this pass is over
 * @param {(id: string) => boolean} [sceneExists]
 * @returns {boolean}
 */
export function auraLaidHere(stamp, sceneId, sceneExists = () => true) {
  if (stamp === null || stamp === undefined || stamp === "") return true;
  if (String(stamp) === String(sceneId ?? "")) return true;
  return sceneExists(String(stamp)) !== true;
}

/** The most passes in a row that one pass's own writes may ask for (D-755). */
export const AURA_FOLLOW_UPS = 2;

/**
 * **THE CONVERGENCE LATCH** (D-755, and its review). An aura that reads its
 * holder's own Armor Points (Avenging Bulwark) changes when another aura's
 * floor lands on that holder (Tree of Life), so a pass may ask for one more.
 * `count` is how many follow-ups in a row have run; a pass that asks while
 * under the ceiling gets one, and anything else - a pass that asked nothing,
 * or one that asked AT the ceiling - starts the count again.
 *
 * The count used to be reset only by a pass that asked nothing, so a pass that
 * asked at the ceiling left it there: every later convergence in the session
 * was refused without a word, and a Bulwark stood one Tree of Life behind.
 *
 * @param {number} count  follow-ups already run in a row
 * @param {boolean} again whether this pass's writes moved a holder's own Armor Points
 * @param {number} [most]
 * @returns {{count: number, again: boolean}}  the new count, and whether to run one more
 */
export function followUp(count = 0, again = false, most = AURA_FOLLOW_UPS) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  if (again === true && n < most) return { count: n + 1, again: true };
  return { count: 0, again: false };
}

/**
 * What the aura effects standing on one creature SHOULD be, and what is there.
 *
 * Both sides are keyed by `key` — the bearer and the source together, which
 * `effects/auras.mjs` builds — so an effect that still says the same thing
 * (`auraSignature`) is kept rather than deleted and re-made. A key held twice
 * keeps ONE, because two copies of one aura would take the damage off twice.
 *
 * **A DISABLED EFFECT IS THE TABLE'S** (D-755): a GM who switched one off on
 * Core's list meant it, so while its key is still wanted it is left exactly
 * as it is - never replaced by an enabled copy, whatever its payload says - and
 * it goes like any other once nothing wants it. Its readers ignore it
 * (`auraBoonRows` here, core's own `active` for the changes).
 *
 * @param {Array<object>} wanted  planned rows
 * @param {Array<object>} held    `{id, key, disabled?, v?, ...payload, changes?}`
 * @returns {{create: Array<object>, remove: string[]}}
 */
export function diffAuras(wanted = [], held = []) {
  const create = [];
  const remove = [];
  const seen = new Set();
  const byKey = new Map();
  for (const row of held) {
    if (!row?.key) { remove.push(row.id); continue; }
    if (byKey.has(row.key)) { remove.push(row.id); continue; }
    byKey.set(row.key, row);
  }
  for (const row of wanted) {
    if (!row?.key || seen.has(row.key)) continue;
    seen.add(row.key);
    const there = byKey.get(row.key) ?? null;
    if (there && (there.disabled === true || auraSignature(there) === auraSignature(row))) continue;
    if (there) remove.push(there.id);
    create.push(row);
  }
  for (const [key, row] of byKey) if (!seen.has(key)) remove.push(row.id);
  return { create, remove: [...new Set(remove.filter(Boolean))] };
}

/**
 * The whole plan for one set of sources: which candidates each reaches, and
 * the row that should stand on each. Pure — the caller measures.
 *
 * The row carries `origin` - who laid it - so the writer never has to take the
 * bearer apart out of the key again, `group` for `strongestPerGroup`, the
 * changes THIS candidate takes, and the version (`AURA_VERSION`). A source that
 * reaches a candidate and gives it nothing (`auraGives`) plans nothing.
 *
 * @param {Array<object>} sources  resolved (`ownerAuras`), or an item's aura row
 * @param {Array<{uuid: string, self?: boolean, party?: boolean, ally?: boolean,
 *   feet?: number|null, type?: string, apLocations?: string[]}>} candidates
 * @returns {Map<string, Array<object>>} keyed by the candidate's uuid; a
 *   candidate nothing reaches is absent.
 */
export function auraPlan(sources = [], candidates = []) {
  const out = new Map();
  for (const candidate of candidates) {
    if (!candidate?.uuid) continue;
    const rows = [];
    for (const source of sources) {
      if (!auraReaches(source, candidate)) continue;
      if (!auraGives(source, candidate)) continue;
      rows.push({
        key: source.key,
        group: source.group ?? source.key,
        name: source.name ?? "",
        origin: source.origin ?? null,
        ...auraPayloadOf(source),
        changes: auraChanges(source, candidate),
        v: AURA_VERSION
      });
    }
    if (rows.length) out.set(candidate.uuid, rows);
  }
  return out;
}

/** How much a row gives, for choosing between two rows of one group. */
export function auraMagnitude(row = {}) {
  const p = auraPayloadOf(row);
  return (p.damageReduction ?? 0) + (p.boon?.boons ?? 0) + (p.schoolArmor?.amount ?? 0)
    + (p.floor?.ap ?? 0) + (p.floor?.ward ?? 0) + (p.spellDamage ?? 0) + (p.armor ?? 0)
    + (p.bane?.banes ?? 0) + (p.ward?.amount ?? 0) + Math.abs(p.speed ?? 0) + (p.healing ? 1 : 0) + (p.standFree ? 1 : 0);
}

/**
 * **ONE ROW PER SOURCE IDENTITY ON ONE CREATURE** (the lead, 2026-09-25: *of
 * two Paladins, the higher applies*). Rows of one `group` are the same aura
 * from different holders; the one that gives the most stands, and a tie goes
 * to the lower key, so two passes over the same world choose the same row and
 * the diff has nothing to do. The rows come back sorted by key, because an
 * embedded collection's order is not stable and this becomes what a person
 * reads (CLAUDE.md §15).
 *
 * @param {Array<object>} rows  planned rows, from every holder at once
 * @returns {Array<object>}
 */
export function strongestPerGroup(rows = []) {
  const best = new Map();
  for (const row of rows ?? []) {
    if (!row?.key) continue;
    const group = row.group ?? row.key;
    const held = best.get(group);
    if (!held) { best.set(group, row); continue; }
    const more = auraMagnitude(row) - auraMagnitude(held);
    if (more > 0 || (more === 0 && row.key < held.key)) best.set(group, row);
  }
  return [...best.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/* -------------------------------------------- */
/*  The holder's side: gates, and what is read  */
/* -------------------------------------------- */

/**
 * Whether a gate holds for this holder, off plain facts. **A gate this cannot
 * read fails closed** - the same rule `signatures.mjs#gateHolds` keeps - because
 * dropping it would turn *while you carry a shield* into *always*.
 *
 * @param {string|null} gate  null, `shield` or `spell:<identifier>`
 * @param {{shield?: boolean, spells?: string[]}} facts
 */
export function auraGateOpen(gate, facts = {}) {
  if (gate === null || gate === undefined || gate === "") return true;
  const [kind, value] = String(gate).split(":");
  if (!AZEROTH.auraGates.includes(kind)) return false;
  if (kind === "shield") return facts.shield === true;
  if (kind === "spell") return Boolean(value) && (facts.spells ?? []).includes(value);
  return false;
}

/** Whether a source's number is the holder's own Armor Points, read at the moment. */
export function readsOwnArmor(source = {}) {
  return (source?.aura ?? source)?.schoolArmor?.from === "bodyAP";
}

/**
 * **WHAT ONE HOLDER'S AURAS ARE, NOW** (D-755): each source's gate judged and
 * each payload resolved against the holder's own state. Pure; the caller reads
 * the actor for the facts.
 *
 * `schoolArmor.from: "bodyAP"` is Avenging Bulwark's *your Armor Points* - the
 * holder's CURRENT Body AP (the lead's call), so a Paladin who takes off a
 * breastplate gives less, and one with none gives nothing and the aura does not
 * stand. Everything else is already a number by now: `talentAurasFor` and the
 * feature's stamp evaluated the rank.
 *
 * **NO DEFAULT FOR WHO OR FROM WHERE** (D-755's review). Every writer states
 * both - `aura()` defaults them, `auraStamp` copies them, `auraSourcesOf` names
 * an item's - so a descriptor missing either is a stored one gone wrong, and a
 * default would GRANT: `targets ?? "allies"` handed every ally an aura whose
 * roster was lost, and `centre ?? "self"` re-centred a Bound Demon's aura on the
 * warlock, turning *the demon has no token, so it reaches nobody* into *it
 * reaches everybody round the warlock* - the warlock at 0 feet always, since
 * the holder is reached like any ally (the lead, 2026-09-26). Both missing
 * words now stand nowhere.
 *
 * @param {Array<{key: string, group?: string, name?: string, origin?: string, aura: object}>} sources
 * @param {{shield?: boolean, spells?: string[], bodyAP?: number}} facts
 * @returns {Array<object>} standing sources, flat, sorted by key
 */
export function ownerAuras(sources = [], facts = {}) {
  const out = [];
  for (const source of sources ?? []) {
    const a = source?.aura ?? null;
    if (!source?.key || !a) continue;
    if (!auraGateOpen(a.gate ?? null, facts)) continue;
    const ownArmor = readsOwnArmor(a);
    const schoolArmor = ownArmor
      ? { schools: a.schoolArmor.schools, amount: Math.max(0, Math.trunc(Number(facts.bodyAP)) || 0) }
      : (a.schoolArmor ?? null);
    const row = {
      key: source.key,
      group: source.group ?? source.key,
      name: source.name ?? "",
      origin: source.origin ?? null,
      feet: a.feet ?? null,
      targets: a.targets ?? null,
      centre: a.centre ?? null,
      excludeOwner: a.excludeOwner === true,
      // Reaches its holder alone, while another ally is near (D-772).
      holderOnly: a.holderOnly === true,
      // What `effects/auras.mjs` reads to know a follow-up pass may be owed.
      readsOwnArmor: ownArmor,
      ...auraPayloadOf({ ...a, schoolArmor })
    };
    if (!AZEROTH.auraCentres.includes(row.centre)) continue;
    if (auraStands(row)) out.push(row);
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

/**
 * A descriptor as a feature item STORES it, every key present (D-755).
 *
 * **THE WHOLE SHAPE, ZEROS INCLUDED.** `AzerothActor#_syncClassFeaturesNow`
 * compares what it would stamp against `item.toObject().system` key by key,
 * and the stored copy carries every key `FeatureData`'s schema declares at its
 * initial. A stamp that left `floor` out would differ from the stored
 * `{ap: 0, ward: 0}` on every feature in every world, and every world load
 * would write every feature again. The initials here and the schema's must
 * agree, and `auras.test.mjs` reads the schema's source to say so.
 *
 * @param {object|null} raw  a descriptor (`aura()`), or nothing
 * @param {{amount?: (v: any) => number|null}} [o]  evaluates `"rank"` and kin
 * @returns {object}
 */
export function auraStamp(raw, { amount = v => v } = {}) {
  const a = raw && typeof raw === "object" ? raw : {};
  const n = v => {
    const x = Math.trunc(Number(amount(v ?? 0)));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  const feet = n(a.feet);
  return {
    feet: feet > 0 ? feet : null,
    targets: typeof a.targets === "string" ? a.targets : null,
    centre: typeof a.centre === "string" ? a.centre : null,
    excludeOwner: a.excludeOwner === true,
    gate: typeof a.gate === "string" && a.gate ? a.gate : null,
    boon: { kind: a.boon?.kind ?? null, resilience: a.boon?.resilience ?? null, boons: n(a.boon?.boons) },
    schoolArmor: { schools: cleanSchools(a.schoolArmor?.schools), from: a.schoolArmor?.from ?? null },
    floor: { ap: n(a.floor?.ap), ward: n(a.floor?.ward) },
    spellDamage: n(a.spellDamage),
    damageReduction: n(a.damageReduction),
    // 04's Sacred Duty (D-772): Armor Points added, on the holder alone.
    armor: n(a.armor),
    holderOnly: a.holderOnly === true
  };
}

/* -------------------------------------------- */
/*  What a laid aura carries, read back          */
/* -------------------------------------------- */

/**
 * The payload a laid aura's flag carries. **An effect laid before D-755 kept
 * its one number at the top of the flag** - `{key, damageReduction, source}` -
 * so that shape is read as the payload it always meant; its missing version is
 * what has `diffAuras` replace it once.
 */
export function payloadFromFlag(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.payload && typeof raw.payload === "object") return auraPayloadOf(raw.payload);
  return auraPayloadOf({ damageReduction: raw.damageReduction });
}

/**
 * **THE BOONS AN AURA HAS LAID ON THIS CREATURE**, off its effects (D-755).
 *
 * `laidBaneRows`' twin, and read the same way: the Active Effect is the
 * carrier and its FLAG is what the roll reads - a Boon is dice and is never a
 * change (CLAUDE.md §6), so it lives nowhere else. **A disabled or suppressed
 * effect gives nothing**; core's own `active` is the reading, and a plain row
 * with no such property counts. Sorted, because it becomes a line a person
 * reads (CLAUDE.md §15).
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {Array<{key: string, group: string, source: string, owner: string,
 *   kind: string, resilience: string|null, boons: number}>}
 */
export function auraBoonRows(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (effect?.active === false || effect?.disabled === true) continue;
    const raw = effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null;
    if (!raw) continue;
    const boon = payloadFromFlag(raw).boon;
    if (!boon) continue;
    out.push({
      key: String(raw.key ?? ""), group: String(raw.group ?? raw.key ?? ""),
      source: String(raw.source ?? ""), owner: String(raw.owner ?? ""), ...boon
    });
  }
  return out.sort((a, b) => a.source.localeCompare(b.source) || a.owner.localeCompare(b.owner) || a.key.localeCompare(b.key));
}

/**
 * The aura Boons that bear on ONE Test, as the roll dialog wants them.
 *
 * **A Resilience Test whose Resilience the door did not say** is a line the
 * TABLE ticks (D2 §12): the Boon may be the one this Test needs and nothing on
 * the roll can say. A Resilience it did say takes exactly the Boons that name
 * it - Aura of Resolve's reaches Spirit and never Body - and every other kind
 * of Test takes those naming its kind.
 *
 * **A Boon against a CONDITION** (Hallowed Ground's *against **Frightened** and
 * **Charmed***) reaches a Test whose door says it resists one of them - a
 * spell card's Resist names the conditions its failure lands - and is the
 * TABLE's line on a Test whose door says nothing about what it resists. A door
 * that names other conditions takes nothing from it.
 *
 * @param {Array<object>} rows  `auraBoonRows`
 * @param {string|null} kind
 * @param {string|null} [resilience]
 * @param {string[]|null} [against]  the conditions this Test resists, where its
 *   door knows them; null where it does not
 * @returns {{boons: number, sources: Array<{source: string, owner: string}>,
 *   judged: {boons: number, sources: Array<{source: string, owner: string}>}}}
 */
export function auraBoonsOn(rows = [], kind = null, resilience = null, against = null) {
  const auto = [];
  const judged = [];
  const resisting = Array.isArray(against) ? new Set(against) : null;
  for (const row of rows ?? []) {
    const boon = cleanBoon(row);
    if (!boon || boon.kind !== kind) continue;
    if (boon.against?.length) {
      if (boon.resilience && resilience && boon.resilience !== resilience) continue;
      if (!resisting) judged.push({ row, boon });
      else if (boon.against.some(c => resisting.has(c))) auto.push({ row, boon });
      continue;
    }
    if (boon.kind !== "resilience") auto.push({ row, boon });
    else if (!resilience) judged.push({ row, boon });
    else if (boon.resilience === resilience) auto.push({ row, boon });
  }
  const sum = list => list.reduce((n, { boon }) => n + boon.boons, 0);
  const who = list => list.map(({ row }) => ({ source: String(row.source ?? ""), owner: String(row.owner ?? "") }));
  return { boons: sum(auto), sources: who(auto), judged: { boons: sum(judged), sources: who(judged) } };
}

/**
 * **THE BANES AN AREA HAS LAID ON THIS CREATURE WHILE IT STANDS THERE**, off its
 * effects (the movement phase: 07's Insect Swarm, Hallowed Ground's enemies,
 * Crucible). `auraBoonRows`' twin and read the same way: a Bane is dice, so the
 * flag is the carrier and nothing is a change (CLAUDE.md §6), a disabled or
 * suppressed effect gives nothing, and the rows are sorted because they become
 * a line a person reads. **Never spent** - *while it remains* is a span, which
 * is what makes this a different thing from `rules/banes.mjs`' laid Bane.
 *
 * @param {Iterable<object>} effects
 * @returns {Array<{key: string, group: string, source: string, owner: string, kind: string, banes: number, judged?: boolean}>}
 */
export function auraBaneRows(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (effect?.active === false || effect?.disabled === true) continue;
    const raw = effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null;
    if (!raw) continue;
    const bane = payloadFromFlag(raw).bane;
    if (!bane) continue;
    out.push({
      key: String(raw.key ?? ""), group: String(raw.group ?? raw.key ?? ""),
      source: String(raw.source ?? ""), owner: String(raw.owner ?? ""), ...bane
    });
  }
  return out.sort((a, b) => a.source.localeCompare(b.source) || a.owner.localeCompare(b.owner) || a.key.localeCompare(b.key));
}

/**
 * The area Banes that bear on ONE Test, as the roll dialog wants them: a Bane
 * on this kind of Test or on `all`, ticked; one the table judges (`judged`),
 * an unticked line.
 *
 * @param {Array<object>} rows  `auraBaneRows`
 * @param {string|null} kind
 * @returns {{banes: number, sources: Array<{source: string, owner: string}>,
 *   judged: {banes: number, sources: Array<{source: string, owner: string}>}}}
 */
export function auraBanesOn(rows = [], kind = null) {
  const auto = [];
  const judged = [];
  for (const row of rows ?? []) {
    const bane = cleanBane(row);
    if (!bane || !(bane.kind === kind || bane.kind === "all")) continue;
    (bane.judged ? judged : auto).push({ row, bane });
  }
  const sum = list => list.reduce((n, { bane }) => n + bane.banes, 0);
  const who = list => list.map(({ row }) => ({ source: String(row.source ?? ""), owner: String(row.owner ?? "") }));
  return { banes: sum(auto), sources: who(auto), judged: { banes: sum(judged), sources: who(judged) } };
}

/**
 * **WHETHER THE HEALING THIS CREATURE RECEIVES IS HALVED** (07's Graveblight:
 * *healing it receives while inside is halved*), off the effects an area laid.
 * `AzerothActor#applyHealing` reads the model's derived answer.
 *
 * @param {Iterable<object>} effects
 * @returns {boolean}
 */
export function auraHalvesHealing(effects = []) {
  for (const effect of effects ?? []) {
    if (effect?.active === false || effect?.disabled === true) continue;
    const raw = effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null;
    if (raw && payloadFromFlag(raw).healing === "half") return true;
  }
  return false;
}

/**
 * **THE HEALING A CREATURE RECEIVES WHERE AN AREA HALVES IT** (07's Graveblight):
 * half, rounded down, as every halving in the book rounds; the whole where
 * nothing halves it. Every healing door reads the model's `healingHalved`
 * through this - `AzerothActor#applyHealing`, a creature's regeneration and a
 * worn Signature's Health at the start of a turn.
 *
 * @param {number} amount
 * @param {boolean} [halved]
 * @returns {number}
 */
export function halvedHealing(amount, halved = false) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  return halved === true ? Math.floor(n / 2) : n;
}

/**
 * **WHETHER THIS CREATURE MAY STAND FROM PRONE FOR NOTHING** (07's Tidecall:
 * *it may stand from **Prone** without spending movement* - in this system's
 * terms the Half-Action standing costs, 05), off the effects an area laid.
 * `AzerothActor#toggleStatusEffect` reads it where it charges the stand.
 *
 * @param {Iterable<object>} effects
 * @returns {boolean}
 */
export function auraStandsFree(effects = []) {
  for (const effect of effects ?? []) {
    if (effect?.active === false || effect?.disabled === true) continue;
    const raw = effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null;
    if (raw && payloadFromFlag(raw).standFree === true) return true;
  }
  return false;
}

/** Nothing added after the Ward in any school: the shape both actor models derive. */
export function emptySchoolArmor() {
  return Object.fromEntries(Object.keys(AZEROTH.schools).map(k => [k, 0]));
}

/** The schools where an aura adds Armor Points after the Ward, as a target snapshot carries them. */
export function schoolArmorBySchool(map) {
  if (!map || typeof map !== "object") return {};
  return Object.fromEntries(Object.entries(map)
    .filter(([k, v]) => AZEROTH.schools[k] && Number(v) > 0)
    .map(([k, v]) => [k, Math.trunc(Number(v))]));
}
