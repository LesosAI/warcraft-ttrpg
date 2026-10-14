/**
 * Migration to 0.12.12 - the Paladin's rows, Consecrated Ground, 07's
 * Difficult ground, and the areas that strike at the start of a turn (D-752,
 * D-753, D-754, D-756; the lead's play-test, 2026-09-25).
 *
 * The packs are regenerated, so a copy dragged out afresh is right already.
 * This is the repair pass over what a world holds, and it touches four things:
 *
 * - **The Paladin class item's Lay on Hands row** (02 §7): *Once per Long
 *   Rest, as a Half-Action, …*. The feature ITEM needs nothing - the sync
 *   restamps its description off this row and its uses off
 *   `rules/class-features.mjs` at world load (D-621).
 * - **Open Hand and Consecrated Ground** (04 §2): the effect, and the talent's
 *   own `uses` and `ranks` as the pack now has them - Open Hand's Short Rest
 *   counter is the feature's second use now, so its own count is empty. The
 *   counter feature and the old Consecrated Ground feature the rows used to
 *   grant are withdrawn by the same sync, as stale.
 * - **Every spell's `areaTick`** (D-756), from the pack copy wherever the two
 *   differ - compared against the PACK COPY and never against `undefined`,
 *   because a document read through the model has every field at its initial
 *   (D-665). Only where the spell's words are still the book's, now or before
 *   this version: a GM who rewrote Consecration keeps what they wrote, and it
 *   deals its damage on the cast as it always did (`castDealsDamage`).
 * - **The thirty-two effects that said *difficult terrain*** (D-754), where
 *   the words are still exactly those.
 * - **Two wordings 07 held for a while and left in this same version** (the
 *   review of D-756, 2026-09-26): Blizzard's first Difficult-ground sentence,
 *   which kept *the ground there*, and Hallowed Ground's before the lead ruled
 *   that only an ENEMY takes its Holy damage. Both are the book's words, so a
 *   copy still saying either takes the chapter's sentence and the pack's tick.
 *
 * **The old words are recorded here rather than derived** (0.12.1's rule): they
 * are gone from the chapters, and a migration is the one place a historical
 * string belongs. Each is compared as a reader reads it - tags stripped, one
 * space, no space before a stop, no case - so a copy stored as plain text
 * matches one stored as the pack's HTML. A document whose words are neither
 * the old nor the new is somebody's own and is left alone. Idempotent by
 * construction: after one pass none of the old words is left to match, and
 * every tick equals its pack copy.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** A text as a reader takes it: no markup, one space, no space before a stop, no case. */
export function plainOf(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:])/g, "$1")
    .trim()
    .toLowerCase();
}

const clone = value => JSON.parse(JSON.stringify(value));

/** Deep equality with key order ignored: a stored object and a pack copy may list keys differently. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/** 02 §7's Lay on Hands row before D-752. */
export const OLD_LAY_ON_HANDS = "As a Half-Action, spend 2 Mana to restore Health equal to your level to the target by touch";

/** The two Paladin talents before D-752 and D-753, by identifier. */
export const OLD_TALENTS = Object.freeze({
  "open-hand": "Once per Short Rest, your Lay on Hands class feature costs no Mana.",
  "consecrated-ground": "As a Half-Action, spend 3 Mana. A 10-foot area you can see becomes Difficult ground to the undead and to anything fel. At rank 2 the area is 20 feet."
});

/**
 * Every 07 effect that said *difficult terrain* before D-754 and this
 * version, by identifier, as a reader reads it.
 */
export const OLD_SPELLS = Object.freeze({
  "ashfall":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Fire damage, and half of that, rounded down, on a success. Ash then hangs over the area for the duration: it is difficult terrain, and a creature inside it cannot see anything more than 10 feet away. At SL 3 or better it also settles on the creatures caught in it, and each of them sheds dim light out to a 5 ft radius until the ash is washed off.",
  "blessing-of-freedom":
    "The target sheds Slowed and Entangled, cannot gain either for the duration, and ignores difficult terrain.",
  "blizzard":
    "A creature takes 2 Frost damage when it starts its turn inside the area, and the ground there is difficult terrain while the spell runs. While sustaining this spell you pay 1 Mana at the start of each of your turns.",
  "cinderfall":
    "The fall lands at the start of your next turn. Every creature in the area then makes a Reflex Resilience Test against your Spell DC: on a failure it takes 12 Fire damage and is knocked Prone, and on a success it takes half of that, rounded down. Ash lies over the area for the duration: it is difficult terrain, and a creature inside it cannot see out and cannot be seen from outside.",
  "cold-snap":
    "You shed Slowed and Entangled and ignore difficult terrain until the end of your next turn.",
  "doomfall":
    "A creature takes 3 Fel damage when it starts its turn inside the area and again the first time it enters the area on a turn. The area is difficult terrain while sustaining this spell. While sustaining this spell you pay 2 Mana at the start of each of your turns.",
  "doomfire":
    "The area must be ground your Hellquake struck this turn or last, or the spell does nothing and the Mana is spent. Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 7 Fel damage, and half of that, rounded down, on a success. The ground burns for the duration: it is difficult terrain, it sheds bright light out to a 20 ft radius, and water does not put it out. A demon standing in it regains 4 Health at the start of each of its turns, which is what the fire is for.",
  "elemental-convergence":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 16 Nature damage, and half of that, rounded down, on a success. For the duration the area is difficult terrain, ranged attacks across it take a Bane, and no fire burns in it. The elements do not do this twice for the same request: casting it again inside a week asks the GM whether they are still willing.",
  "entangling-vines":
    "A creature that enters the area or starts its turn there must pass a Reflex Resilience Test against your Spell DC or be Entangled until it spends an action and passes another Reflex Resilience Test against your Spell DC. The area is difficult terrain for the duration.",
  "firebreak":
    "Every Fire effect in the line ends, your own included, and everything flammable in it is spent. A creature in the line gains Ward 3 against Fire for the duration, and the line is difficult terrain. A Fire spell cast into or across the line for the duration has its Damage Rating reduced by 2.",
  "firewalk":
    "Your Speed rises by 10 feet, you ignore difficult terrain from every source, and you gain Ward 1 against Fire for the duration. A creature that ends its turn within 5 feet of you takes 2 Fire damage.",
  "fissure":
    "The area must be ground your Landslide broke this turn or last, or the spell does nothing and the Mana is spent. Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 7 Nature damage, and half of that, rounded down, on a success. The ground stays broken for the duration and is difficult terrain, and any structure standing in the area takes the damage without a Test.",
  "frozen-ground":
    "A creature takes 2 Frost damage when it starts its turn inside the area. A creature that enters the area must pass a Reflex Resilience Test against your Spell DC or be knocked Prone, and the area is difficult terrain for the duration.",
  "ghost-wolf":
    "Your Speed rises by 20 feet and you ignore difficult terrain. You cannot cast, attack or carry anything while in the form, and leaving it costs a Half-Action.",
  "glacier":
    "The area must be your Frozen Ground, or the spell does nothing and the Mana is spent. Every creature in the area makes a Body Resilience Test against your Spell DC. On a failure it takes 7 Frost damage, and half of that, rounded down, on a success. The ice piles up to a hundred feet high over the duration, closing anything above it that was open: the area is difficult terrain, and a creature that begins its turn in it makes the Test again or is Slowed until it leaves.",
  "hoarfrost":
    "A creature takes 2 Frost damage when it starts its turn inside the area and its Speed drops by 10 feet until it leaves. The area is difficult terrain, every liquid in it freezes solid, and at the start of each of your turns it grows by 5 feet in every direction. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "ice-barrage":
    "Every creature in the cone makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Frost damage, and half of that, rounded down, on a success. The cone becomes difficult terrain until the end of your next turn.",
  "icefall":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Frost damage and is knocked Prone, and on a success it takes half of that, rounded down, and keeps its feet. The broken ice makes the area difficult terrain until the end of your next turn.",
  "icewalk":
    "Your Speed rises by 10 feet, you ignore difficult terrain, and you may cross water, mud and thin ice as though they were solid ground. Falling into what you were walking on ends the spell.",
  "landslide":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Nature damage and is knocked Prone, and on a success it takes half of that, rounded down, and keeps its feet. The ground is left broken: the area is difficult terrain for the duration and any structure standing in it takes 10 damage.",
  "lightning-strike":
    "The target takes 7 Nature damage. The space it occupied becomes difficult terrain until the end of your next turn. At SL 3 or better the target is Deafened until the end of its next turn.",
  "meteor":
    "The area must be your Scorched Earth, or the spell does nothing and the Mana is spent. The meteor lands at the start of your next turn. Every creature in the area then makes a Reflex Resilience Test against your Spell DC: on a failure it takes 12 Fire damage and is knocked Prone, and on a success it takes half of that, rounded down, and keeps its feet. The crater is difficult terrain for the duration.",
  "netherstorm":
    "Cast into an area where you are sustaining Doomfall. The Doomfall ends and this replaces it. A creature takes 4 Fel damage when it starts its turn inside the area, the area is difficult terrain, and at the start of each of your turns you may move the area up to 20 feet. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "pyroclasm":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 16 Fire damage, and half of that, rounded down, on a success. For the duration the area runs with molten stone: it is difficult terrain, and a creature that ends its turn in it takes 4 Fire damage. When it cools the ground is stone, whatever it was before.",
  "scorched-earth":
    "A creature takes 3 Fire damage when it starts its turn inside the area, and the area is difficult terrain for the duration. The fire needs no fuel and the rain does not stop it.",
  "slagfall":
    "The ground must already be burning from Scorched Earth. A creature takes 4 Fire damage when it starts its turn in the area, the area is difficult terrain, and a creature that ends its turn there has its Speed drop by 10 feet until it leaves. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "the-great-wild":
    "For the duration the area becomes old forest: roads close, walls are opened by roots, and buildings become difficult terrain within a day. Beasts in the area are friendly to you and hostile to anyone you name. No creature that does not know the way may travel through it faster than half its Speed. Dismissing it does not put anything back. The Cenarion Circle has used this three times and regrets one of them.",
  "thornguard":
    "A creature that enters the area or starts its turn inside it makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Nature damage and is Entangled, and it may repeat the Test at the end of each of its turns. The area is difficult terrain. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "water-walking":
    "The target walks on any liquid surface as though it were solid ground. Rough water is difficult terrain, and a target that takes damage falls in.",
  "whiteout":
    "A creature inside the area cannot see anything more than 5 feet away, and nothing outside it can see in. Attack Tests made into, out of or through the area take two Banes, and the area is difficult terrain for the duration. The snow does not move with the wind and it does not settle.",
  "windrush":
    "Each target's Speed rises by 15 feet and each ignores difficult terrain for the duration. Once for the duration, each target may take a Half-Action to move up to its Speed without provoking anything.",
  "windwalk":
    "Your Speed rises by 20 feet, you ignore difficult terrain, and you may cross water, mud and thin ice as though they were solid ground. You may move through a creature's space, and you may cast and attack normally for the duration."
});

/**
 * Wordings 07 held between the last release and this one, by identifier, as a
 * reader reads them: Blizzard's Phase 0 sentence (*the ground there is
 * Difficult ground*, now *the area is*, the shape Slagfall and Scorched Earth
 * use), and Hallowed Ground's *An undead creature or a demon*, which the lead's
 * 2026-09-26 ruling made *An undead or demon enemy*. Each is the book's words.
 */
export const INTERIM_SPELLS = Object.freeze({
  "blizzard": [
    "A creature takes 2 Frost damage when it starts its turn inside the area, and the ground there is Difficult ground while the spell runs. While sustaining this spell you pay 1 Mana at the start of each of your turns."
  ],
  "hallowed-ground": [
    "An ally that starts its turn in the area regains 2 Health, gains Ward 2 against Shadow and Ward 2 against Fel until it leaves, and has a Boon on Resilience Tests against Frightened and Charmed. An undead creature or a demon that starts its turn in the area takes 4 Holy damage and has a Bane on Attack Tests while it remains. While sustaining this spell you pay 3 Mana at the start of each of your turns."
  ]
});

/** Every wording of a spell's effect this version replaces, old and interim. */
function replacedWordings(identifier) {
  return [OLD_SPELLS[identifier], ...(INTERIM_SPELLS[identifier] ?? [])].filter(Boolean);
}

/**
 * The Paladin class item's update, or null: the Lay on Hands row alone, and
 * only while it still says what it said before D-752.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 */
export function buildClassFeatureUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || raw.identifier !== "paladin") return null;
  const features = Array.isArray(raw.features) ? raw.features : null;
  if (!features) return null;
  const index = features.findIndex(f => f?.name === "Lay on Hands");
  if (index < 0 || plainOf(features[index]?.description) !== plainOf(OLD_LAY_ON_HANDS)) return null;
  const fresh = (Array.isArray(pack.features) ? pack.features : []).find(f => f?.name === "Lay on Hands");
  if (!fresh || plainOf(fresh.description) === plainOf(OLD_LAY_ON_HANDS)) return null;
  const next = clone(features);
  next[index] = { ...next[index], description: fresh.description };
  return { "system.features": next };
}

/**
 * Open Hand's or Consecrated Ground's update, or null: the effect, and the
 * talent's own `uses` and `ranks` where the pack's differ, only while the
 * effect is still the old one. The rank a character has TAKEN is theirs.
 */
export function buildTalentTextUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const old = OLD_TALENTS[raw.identifier];
  if (!old || plainOf(raw.effect) !== plainOf(old)) return null;
  const update = { "system.effect": pack.effect ?? "" };
  if (pack.uses && !same(raw.uses, pack.uses)) update["system.uses"] = clone(pack.uses);
  if (pack.ranks !== undefined && raw.ranks !== pack.ranks) update["system.ranks"] = pack.ranks;
  return update;
}

/**
 * A spell's update, or null: the pack's `areaTick` where the stored one
 * differs, while the words are the book's; and the pack's effect where it
 * still says *difficult terrain* word for word, or an interim wording this
 * version passed through (`INTERIM_SPELLS`).
 */
export function buildSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const update = {};
  const words = plainOf(raw.effect);
  const oldWords = replacedWordings(raw.identifier).some(old => words === plainOf(old));
  const bookWords = oldWords || words === plainOf(pack.effect);
  if (bookWords && pack.areaTick && !same(raw.areaTick, pack.areaTick)) update["system.areaTick"] = clone(pack.areaTick);
  if (oldWords && plainOf(pack.effect) !== words) update["system.effect"] = pack.effect ?? "";
  return Object.keys(update).length ? update : null;
}

/** Which builder, and which pack, answers for a type. */
const BUILDERS = Object.freeze({
  class: { pack: "azeroth-rpg.classes", build: buildClassFeatureUpdate },
  talent: { pack: "azeroth-rpg.talents", build: buildTalentTextUpdate },
  spell: { pack: "azeroth-rpg.spells", build: buildSpellUpdate }
});

export async function migrate(log = console.log) {
  const tables = {};
  for (const [type, { pack }] of Object.entries(BUILDERS)) tables[type] = await packSystems(pack);
  return walkWorld({
    item: doc => {
      const entry = BUILDERS[doc.type];
      if (!entry) return null;
      const raw = rawSystem(doc);
      return entry.build(raw, packCopy(tables[doc.type], raw, doc.name));
    }
  }, log);
}
