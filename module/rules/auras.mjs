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
  // `spellDamage` and `floor` joined the item's aura with the Legendary
  // expansion (D-909, D-910): Atiesh's *adds 1 to the Damage Rating of every
  // spell they cast* and the Hammer of the Lightbringer's *Ward 2 against
  // Shadow, unless it already has more* - the payloads a class feature's aura
  // already lays, carried on an item. `floor.schools` empty is every school.
  //
  // **AND FIVE MORE FOR THE LEGENDARY READERS (D-911)**, each a payload or a
  // filter a class feature's aura already lays or a talent's already reads:
  // Warchief's Hammer's Boon on Spirit Resilience Tests (`boon`), Rivendare's
  // Dread's Bane on its enemies' (`bane`), The Black Hand Raised's attack Damage
  // Rating (`attackDamage`), Hand of Ragnaros's damage at an enemy's turn start
  // (`tick`, the laid tick `effects/ticks.mjs` already lands), and WHO among
  // those in reach it touches (`who`: a faction, or only the living).
  return {
    feet: null, targets: null, damageReduction: null, spellDamage: null, floor: { ward: null, schools: [] },
    boon: { kind: null, resilience: null, boons: null },
    bane: { kind: null, resilience: null, banes: null },
    attackDamage: null,
    tick: { damage: null, type: null },
    who: { faction: null, living: false }
  };
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
 * - `targets: "enemies"` and `bane` (the Legacy branches' door 20: 04's Loa Drum,
 *   *While your **Tremor** totem stands, every enemy within 30 feet of it takes a
 *   Bane on Spirit Resilience Tests*; the lead, phase 0: *"Every Spirit Resilience
 *   Test"*): the aura reaches the holder's ENEMIES (`rules/distance.mjs
 *   #countsAsEnemy`), never the holder, and lays a standing Bane - the area Bane's
 *   own payload, which may name a Resilience - read by the roll dialog and never
 *   spent.
 * - `centre: "boundTotem:<name>"` (door 20): every token of a totem bound to the
 *   holder whose name holds `<name>` - Loa Drum's Tremor totem.
 * - `healthFloor` (the Legacy branches' door 12: 04's Big Bad Voodoo, *no ally within
 *   20 feet of you other than yourself may be reduced below 1 Health by any source*):
 *   the laid effect carries 07's Aegis floor's own flag (`rules/blow-doors.mjs
 *   #FLOOR_FLAG`, `stay` the number, `noCritical` false - *It does not stop a
 *   Critical Injury or anything a Critical Injury does*), so the ONE hold at 1 holds
 *   it, at the damage door and where Health is lost; gated `sustain:<identifier>`.
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
  armor = null, holderOnly = false, bane = null, healthFloor = null
} = {}) {
  // `bane` (door 20) and `healthFloor` (door 12) are carried only where a row names
  // one, so every descriptor before them keeps its exact shape.
  return deepFreeze({
    feet, targets, centre, excludeOwner, gate, boon, schoolArmor, floor, spellDamage, damageReduction, armor, holderOnly,
    ...(bane ? { bane } : {}), ...(healthFloor ? { healthFloor } : {})
  });
}

/**
 * **WHERE AN AURA IS MEASURED FROM, AS A KIND**: the part of `centre` before the
 * colon - `boundTotem:Tremor` is a `boundTotem` centre naming the Tremor totem
 * (door 20). The vocabulary is `AZEROTH.auraCentres`.
 *
 * @param {string|null} centre
 * @returns {{kind: string|null, name: string|null}}
 */
export function auraCentreOf(centre) {
  if (typeof centre !== "string" || !centre) return { kind: null, name: null };
  const at = centre.indexOf(":");
  if (at < 0) return { kind: centre, name: null };
  const name = centre.slice(at + 1).trim();
  return { kind: centre.slice(0, at), name: name || null };
}

/**
 * **WHETHER A TOTEM STANDS** (04's Loa Drum: *While your **Tremor** totem stands*; the B2
 * review): a totem at 0 Health, or one marked defeated, is destroyed, and an aura
 * centred on it reaches nobody. A Health nothing stores is no reason to call it down.
 *
 * @param {{health?: number|null, defeated?: boolean}} o
 */
export function totemStands({ health = null, defeated = false } = {}) {
  if (defeated === true) return false;
  return !(typeof health === "number" && Number.isFinite(health) && health <= 0);
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
  if ("spellDamage" in src) out.spellDamage = atLeast(src.spellDamage, 1);
  // Present-key one level down too (D-692): a dotted write of the floor's Ward
  // keeps its schools.
  if ("floor" in src) {
    const floor = src.floor && typeof src.floor === "object" ? src.floor : {};
    out.floor = {};
    if ("ward" in floor) out.floor.ward = atLeast(floor.ward, 1);
    if ("schools" in floor) out.floor.schools = cleanSchools(floor.schools);
  }
  // The Legendary readers' five (D-911), present-key one level down too.
  const sub = (key, cleaners) => {
    if (!(key in src)) return;
    const raw = src[key] && typeof src[key] === "object" ? src[key] : {};
    out[key] = {};
    for (const [k, clean] of Object.entries(cleaners)) if (k in raw) out[key][k] = clean(raw[k]);
  };
  const testKind = k => (typeof k === "string" && (k === "all" || k in AZEROTH.testKinds) ? k : null);
  const resilienceOf = r => (typeof r === "string" && r in AZEROTH.resiliences ? r : null);
  sub("boon", { kind: testKind, resilience: resilienceOf, boons: n => atLeast(n, 1) });
  sub("bane", { kind: testKind, resilience: resilienceOf, banes: n => atLeast(n, 1) });
  if ("attackDamage" in src) out.attackDamage = atLeast(src.attackDamage, 1);
  sub("tick", { damage: n => atLeast(n, 1), type: t => (typeof t === "string" && t in AZEROTH.damageTypes ? t : null) });
  sub("who", { faction: f => (typeof f === "string" && f.trim() ? f.trim() : null), living: l => l === true });
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
  // A named skill is a restriction, never a hint that may be discarded.
  // Paranoia's detection purpose remains a table judgement on Perception.
  if (Object.hasOwn(raw, "skill")) {
    if (kind !== "skill" || typeof raw.skill !== "string" || !Object.hasOwn(AZEROTH.skillAbility, raw.skill) || against.length) return null;
    if (Object.hasOwn(raw, "condition") && (raw.judged !== true || typeof raw.condition !== "string" || !raw.condition.trim())) return null;
    return { kind, resilience: null, boons, skill: raw.skill, ...(raw.judged === true ? { judged: true } : {}),
      ...(Object.hasOwn(raw, "condition") ? { condition: raw.condition } : {}) };
  }
  if (kind !== "resilience") return against.length ? { kind, resilience: null, against, boons } : { kind, resilience: null, boons };
  // **EVERY RESILIENCE** (04's Burial Ground: *a Boon on Resilience Tests*; the Legacy
  // branches' door 25): named `all`, so it is a word the row chose and never a word
  // the row forgot - which is what the rule above refuses.
  if (raw.resilience === "all" && !against.length) return { kind, resilience: "all", boons };
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
  // **WHICH RESILIENCE** (door 20: 04's Loa Drum, *a Bane on Spirit Resilience
  // Tests*), named only where the row names one, so every area Bane before it keeps
  // its exact shape - and a Resilience Bane naming none of the vocabulary is none.
  const resilience = kind === "resilience" && typeof raw.resilience === "string" && raw.resilience in AZEROTH.resiliences ? raw.resilience : null;
  if (kind === "resilience" && raw.resilience !== undefined && raw.resilience !== null && !resilience) return null;
  const out = resilience ? { kind, resilience, banes } : { kind, banes };
  return raw.judged === true ? { ...out, judged: true } : out;
}

/**
 * **A TAUNT'S BANE** (07 §12's Bastion of Hours: *each enemy within 10 feet of you takes a Bane on
 * attacks against anyone but you*; the 2a fix stage), or null: the Banes and the creature spared,
 * laid as the Taunt Bane's own flag beside the aura's (`effects/banes.mjs`' `except`).
 */
function cleanTaunt(raw) {
  if (!raw || typeof raw !== "object") return null;
  const banes = atLeast(raw.banes, 1);
  const actorId = typeof raw.except?.actorId === "string" && raw.except.actorId ? raw.except.actorId : null;
  const tokenId = typeof raw.except?.tokenId === "string" && raw.except.tokenId ? raw.except.tokenId : null;
  return banes && (actorId || tokenId) ? { banes, except: { actorId, tokenId } } : null;
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
  // **ONE SCHOOL'S WARD** (the Hammer of the Lightbringer, D-910): *Ward 2
  // against Shadow*. Carried only where named, so every floor before it keeps
  // its exact shape and still raises every school.
  const schools = ward ? cleanSchools(raw.schools) : [];
  if (!ap && !ward) return null;
  return schools.length ? { ap, ward, schools } : { ap, ward };
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
  // **A FLOOR UNDER HEALTH** (the Legacy branches' door 12: 04's Big Bad Voodoo, *no
  // ally ... may be reduced below 1 Health by any source*): the Health the creature
  // stays at, laid as 07's Aegis floor's own flag (`healthFloorFlag`) and never a change.
  const healthFloor = atLeast(src.healthFloor, 1);
  if (healthFloor) out.healthFloor = healthFloor;
  // **07 §12's TEMPORAL SANCTUARY** (*it cannot gain a condition, and the conditions and effects
  // already on it do nothing and do not count down*; the 2a fix stage): the conditions refused,
  // laid as the `immuneTo` flag `toggleStatusEffect` reads, and the HOLD, which
  // `effects/sand-auras.mjs#syncSanctuaryHold` keeps. Flags, never changes.
  const immune = cleanConditions(src.immune?.conditions);
  if (immune.length) out.immune = { conditions: immune };
  if (src.hold === true) out.hold = true;
  // **BASTION OF HOURS' TAUNT** (the same stage): the Bane on attacks against anyone but the holder.
  const taunt = cleanTaunt(src.taunt);
  if (taunt) out.taunt = taunt;
  // **THE BLACK HAND RAISED** (D-911: *every ally within 15 feet adds 1 to the
  // Damage Rating of its attacks*): a number on the attack lane, a change.
  const attackDamage = atLeast(src.attackDamage, 1);
  if (attackDamage) out.attackDamage = attackDamage;
  // **HAND OF RAGNAROS** (D-911: *Each enemy that starts its turn within 5 feet of
  // you takes 2 Fire damage, and Ward applies*): the laid tick's own shape on the
  // effect (`auraTickFlag`), landed at that creature's turn start by
  // `effects/ticks.mjs#landTicks`, and gone the moment it steps out of reach.
  const tick = cleanAuraTick(src.tick);
  if (tick) out.tick = tick;
  return out;
}

/** An aura's start-of-turn damage, resolved, or null (D-911). */
function cleanAuraTick(raw) {
  if (!raw || typeof raw !== "object") return null;
  const damage = atLeast(raw.damage, 1);
  const type = typeof raw.type === "string" && raw.type in AZEROTH.damageTypes ? raw.type : null;
  return damage && type ? { damage, type } : null;
}

/**
 * **THE LAID TICK AN AURA'S `tick` WRITES** (Hand of Ragnaros, D-911): the shape
 * `rules/ticks.mjs#hasTick` reads, no count (the aura's own diff ends it when the
 * creature leaves the reach), the holder its hand, so the damage is typed and
 * Ward applies through `strikeFromArea` exactly as a spell's tick. Null where the
 * row lays none.
 *
 * @param {object} row  a planned row or a payload
 * @param {{by?: string|null, name?: string}} [o]  the holder's uuid and the source's name
 */
export function auraTickFlag(row = {}, { by = null, name = "" } = {}) {
  const tick = auraPayloadOf(row).tick ?? null;
  if (!tick) return null;
  return {
    kind: "damage", type: tick.type, amount: String(tick.damage), rounds: null, until: "", when: "startOfTurn",
    hit: false, sl: null, spellpower: false, reason: "", via: "item",
    source: typeof by === "string" && by ? by : null, name: String(name ?? "")
  };
}

/**
 * **THE FLOOR A HEALTH-FLOOR AURA LAYS** (door 12), in 07's Aegis floor's own shape
 * (`rules/blow-doors.mjs#floorOf`), so `effects/blow-doors.mjs#aegisFloor` - the
 * first of the ONE hold's order, at the damage door and where Health is lost - holds
 * the creature with no second door. **`noCritical` is false**: 04's *It does not stop
 * a Critical Injury or anything a Critical Injury does*, where 07's Aegis refuses the
 * injuries of a creature it held. A Critical Injury's own drop to 0 writes the Health
 * straight (`workflows.sufferInjury`) and never meets a floor. Null where the payload
 * lays none.
 *
 * @param {object} row  a planned row or a payload
 * @param {{by?: string|null, name?: string}} [o]  the holder's uuid and the source's name
 * @returns {{stay: number, by: string|null, name: string, held: false, noCritical: false}|null}
 */
export function healthFloorFlag(row = {}, { by = null, name = "" } = {}) {
  const stay = auraPayloadOf(row).healthFloor ?? null;
  if (!stay) return null;
  return { stay, by: typeof by === "string" && by ? by : null, name: String(name ?? ""), held: false, noCritical: false };
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
  // **AN AURA ON THE HOLDER'S ENEMIES** (door 20: Loa Drum's *every enemy within 30
  // feet of it*): never the holder, and only a creature the holder's side counts as
  // an enemy (`countsAsEnemy`, measured by the pass).
  if (aura.targets === "enemies") {
    if (self || candidate.enemy !== true) return false;
  }
  if (!self && aura.targets === "party" && candidate.party !== true) return false;
  if (!self && aura.targets === "allies" && candidate.ally !== true) return false;
  // **WHO AMONG THOSE IN REACH** (D-911): Warchief's Hammer's *every ally ... who
  // belongs to the Horde* (the holder too: *you and every ally*), Rivendare's
  // Dread's *each LIVING enemy*. A fact the pass did not measure never holds.
  if (aura.who?.faction && !(candidate.factions ?? []).map(f => String(f).toLowerCase()).includes(String(aura.who.faction).toLowerCase())) return false;
  if (aura.who?.living === true && candidate.living !== true) return false;
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
  if (p.floor?.ward) {
    const schools = p.floor.schools?.length ? p.floor.schools : Object.keys(AZEROTH.schools);
    for (const school of schools) change(`system.ward.${school}`, "upgrade", p.floor.ward);
  }
  if (p.spellDamage && type === "character") change("system.damageBonus.spell.all", "add", p.spellDamage);
  // The attack lane (The Black Hand Raised, D-911): a character's `attack.all`, a
  // creature's one scalar `damageBonus` its attacks read (`NpcData`, D-643).
  if (p.attackDamage && type === "character") change("system.damageBonus.attack.all", "add", p.attackDamage);
  else if (p.attackDamage && type === "npc") change("system.damageBonus", "add", p.attackDamage);
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
  return Boolean(p.boon) || Boolean(p.bane) || Boolean(p.healing) || Boolean(p.standFree) || Boolean(p.healthFloor)
    || Boolean(p.immune) || Boolean(p.hold) || Boolean(p.taunt) || Boolean(p.tick)
    || auraChanges(row, candidate).length > 0;
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
    + (p.bane?.banes ?? 0) + (p.ward?.amount ?? 0) + Math.abs(p.speed ?? 0) + (p.healing ? 1 : 0) + (p.standFree ? 1 : 0)
    + (p.healthFloor ? 1 : 0) + (p.immune ? 1 : 0) + (p.hold ? 1 : 0) + (p.taunt?.banes ?? 0)
    + (p.attackDamage ?? 0) + (p.tick?.damage ?? 0);
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
 * **A SUSTAIN HELD** (the Legacy branches' door 12: 04's Big Bad Voodoo, *While you
 * Sustain it*): `sustain:<identifier>` holds while the holder's `sustaining` holds an
 * entry of that identifier - the flag 05 §12's turn charges and every door that ends
 * a Sustain clears (`workflows.endSustain`, 0 Health, a Critical Injury).
 *
 * @param {string|null} gate  null, `shield`, `spell:<identifier>` or `sustain:<identifier>`
 * @param {{shield?: boolean, spells?: string[], sustains?: string[]}} facts
 */
export function auraGateOpen(gate, facts = {}) {
  if (gate === null || gate === undefined || gate === "") return true;
  const [kind, value] = String(gate).split(":");
  if (!AZEROTH.auraGates.includes(kind)) return false;
  if (kind === "shield") return facts.shield === true;
  if (kind === "spell") return Boolean(value) && (facts.spells ?? []).includes(value);
  if (kind === "sustain") return Boolean(value) && (facts.sustains ?? []).includes(value);
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
      // Who among those in reach (D-911): a faction, or only the living. Carried
      // only where it names one, so every source before it keeps its shape.
      ...(a.who && (a.who.faction || a.who.living === true) ? { who: { faction: a.who.faction ?? null, living: a.who.living === true } } : {}),
      // What `effects/auras.mjs` reads to know a follow-up pass may be owed.
      readsOwnArmor: ownArmor,
      ...auraPayloadOf({ ...a, schoolArmor })
    };
    // A centre names its kind before any colon (`boundTotem:Tremor`, door 20).
    if (!AZEROTH.auraCentres.includes(auraCentreOf(row.centre).kind)) continue;
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
    boon: { kind: a.boon?.kind ?? null, resilience: a.boon?.resilience ?? null, boons: n(a.boon?.boons),
      ...(a.boon && Object.hasOwn(a.boon, "skill") ? { skill: a.boon.skill, ...(a.boon.judged === true ? { judged: true } : {}),
        ...(Object.hasOwn(a.boon, "condition") ? { condition: a.boon.condition } : {}) } : {}) },
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
 * @param {{skill?: string|null}} [options] named skill restrictions fail closed
 *   when the roll does not name its skill; judged purposes stay optional
 * @returns {{boons: number, sources: Array<{source: string, owner: string}>,
 *   judged: {boons: number, sources: Array<{source: string, owner: string}>}}}
 */
export function auraBoonsOn(rows = [], kind = null, resilience = null, against = null, { skill = null } = {}) {
  const auto = [];
  const judged = [];
  const resisting = Array.isArray(against) ? new Set(against) : null;
  for (const row of rows ?? []) {
    const boon = cleanBoon(row);
    if (!boon || boon.kind !== kind) continue;
    if (boon.skill && boon.skill !== skill) continue;
    if (boon.judged === true) { judged.push({ row, boon }); continue; }
    if (boon.against?.length) {
      if (boon.resilience && resilience && boon.resilience !== resilience) continue;
      if (!resisting) judged.push({ row, boon });
      else if (boon.against.some(c => resisting.has(c))) auto.push({ row, boon });
      continue;
    }
    if (boon.kind !== "resilience") auto.push({ row, boon });
    // Every Resilience (door 25's Burial Ground): any Resilience Test, named or not.
    else if (boon.resilience === "all") auto.push({ row, boon });
    else if (!resilience) judged.push({ row, boon });
    else if (boon.resilience === resilience) auto.push({ row, boon });
  }
  const sum = list => list.reduce((n, { boon }) => n + boon.boons, 0);
  const who = list => list.map(({ row, boon }) => ({ source: String(row.source ?? ""), owner: String(row.owner ?? ""),
    ...(boon.condition ? { condition: boon.condition } : {}) }));
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
 * **A RESILIENCE BANE THAT NAMES ITS RESILIENCE** (door 20: Loa Drum's *Spirit
 * Resilience Tests*) is read as the aura Boon's twin: ticked on a Test of that
 * Resilience, the table's line on a Resilience Test whose door did not say which,
 * and nothing on another.
 *
 * @param {Array<object>} rows  `auraBaneRows`
 * @param {string|null} kind
 * @param {string|null} [resilience]  the Test's Resilience, where its door says
 * @returns {{banes: number, sources: Array<{source: string, owner: string}>,
 *   judged: {banes: number, sources: Array<{source: string, owner: string}>}}}
 */
export function auraBanesOn(rows = [], kind = null, resilience = null) {
  const auto = [];
  const judged = [];
  for (const row of rows ?? []) {
    const bane = cleanBane(row);
    if (!bane || !(bane.kind === kind || bane.kind === "all")) continue;
    if (bane.resilience) {
      if (!resilience) { judged.push({ row, bane }); continue; }
      if (bane.resilience !== resilience) continue;
    }
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
