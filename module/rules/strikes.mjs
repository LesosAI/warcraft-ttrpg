/**
 * WHAT A BLOW IS STRUCK WITH, as a form something can draw (D-725). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * A weapon has no slash, thrust or blunt field and a creature's attack row is
 * a name and some traits, so the only thing that knows a longsword from a bow
 * is what the item already says about itself. This reads it, in order:
 *
 *   1. the LAUNCHER (08 §7's kind): a bow shoots an arrow, whatever is nocked;
 *   2. what a piece of AMMUNITION fits, for a bundle swung or thrown as itself;
 *   3. the BASE FLAG a §20 unique or a Classic find carries (`Greatsword,
 *      two-handed`), by the §7 identifier the name before its comma slugs to;
 *   4. the 08 §7 IDENTIFIER, which a forged or generated item keeps;
 *   5. the Classic SUBCLASS where the conversion collapsed it onto a base of
 *      another family - every Classic dagger went onto the Scimitar or the
 *      tusk-blade base (D-685), and it is still a dagger;
 *   6. the WORDS of the name, for a thing a GM made by hand;
 *   7. otherwise nothing, and the record says why.
 *
 * A creature's row reads its own words instead: a row read by its whole name
 * first, then the rows that are spells or machine parts in all but name - only
 * where that phrase ENDS the name - then a creature's body (a bite, a claw, a
 * tail), then the weapon words a weapon's name would take.
 *
 * **EVERY TABLE IS READ BY ITS OWN KEYS** (`own`). The tables are plain
 * objects, so `BASE_FORMS["constructor"]` is `Object` and a row named
 * *Constructor* would otherwise record a function as its form.
 *
 * **THE CARD STORES THE FORM AND NEVER AN ASSET** (D-725). An animation table
 * picks the file; a JB2A key written onto a chat message would outlive every
 * update to the library it names. `FORM_FAMILY` is exported for that table and
 * is never stored either.
 *
 * `STRIKE_FORMS` is the one vocabulary. The animation table has exactly one
 * recipe per form, and `strikes.test.mjs` holds every form the resolvers emit
 * over the whole weapons pack and every bestiary attack row inside it.
 */

import { attackModes, isThrown } from "./ammunition.mjs";

/** Every form a strike can record, in the order the animation table lists them. */
export const STRIKE_FORMS = Object.freeze([
  "sword", "greatsword", "shortsword", "scimitar", "rapier", "dagger",
  "axe", "greataxe", "scythe", "sickle", "glaive", "halberd", "spear",
  "mace", "club", "greatclub", "flail", "warhammer", "hammer", "maul",
  "quarterstaff", "wrench", "whip", "unarmed", "shield", "implement",
  "claw", "bite", "slam", "gore", "sting", "pincer", "tentacle", "touch",
  "arrow", "bolt", "bullet", "sling-stone", "blowgun-dart", "boulder",
  "dart", "thrown-dagger", "thrown-axe", "thrown-hammer", "javelin", "glaive-return",
  "net", "bola", "flask", "bomb", "cannon",
  "firebolt", "shard", "shock", "saw"
]);

/**
 * What kind of contact each form makes: an edge, a point, a weight, something
 * launched, or something thrown by hand. **The card never stores it.**
 *
 * **WHO ACTUALLY READS IT** (corrected 2026-09-16; this block used to say the
 * animation layer picks an impact by it, and it does not):
 *
 *  - `strikes.test.mjs`, as the CLASSIFIER its pack censuses need. A Classic
 *    find's form has to agree in family with its `subclass`, everything in
 *    `THROWN_FORMS` has to come out `thrown`, a `HEAVY_FORMS` promotion has to
 *    keep the family it was promoted from, and a creature's thrown row has to
 *    land in the thrown family. None of those can be asked without it.
 *  - `animation-table.test.mjs`, which holds each strike recipe's impact SOUND
 *    against its family and names every deviation.
 *
 * **AN IMPACT SOUND IS NOT DERIVED FROM THE FAMILY, AND CANNOT BE.** PSFX
 * carries a slashing impact and a bludgeoning one and **no thrust impact at
 * all**, so all six thrust forms borrow one: five take slashing quietly and a
 * gore takes bludgeoning, because a horn is a weight. And a projectile's or a
 * thrown thing's impact depends on what it is MADE OF rather than on how it
 * travelled - an arrow thuds, a blowgun dart cuts, a flask explodes, a Firebolt
 * burns. `STRIKE_ANIMATIONS` names each sound by hand for that reason, and the
 * census is what keeps the hand from wandering.
 */
export const FORM_FAMILY = Object.freeze({
  sword: "slash", greatsword: "slash", shortsword: "slash", scimitar: "slash",
  rapier: "thrust", dagger: "thrust",
  axe: "slash", greataxe: "slash", scythe: "slash", sickle: "slash",
  glaive: "slash", halberd: "slash", spear: "thrust",
  mace: "blunt", club: "blunt", greatclub: "blunt", flail: "blunt",
  warhammer: "blunt", hammer: "blunt", maul: "blunt", quarterstaff: "blunt",
  wrench: "blunt", whip: "slash", unarmed: "blunt", shield: "blunt", implement: "blunt",
  claw: "slash", bite: "thrust", slam: "blunt", gore: "thrust", sting: "thrust",
  pincer: "slash", tentacle: "blunt", touch: "blunt",
  arrow: "projectile", bolt: "projectile", bullet: "projectile",
  "sling-stone": "projectile", "blowgun-dart": "projectile", boulder: "projectile",
  dart: "thrown", "thrown-dagger": "thrown", "thrown-axe": "thrown",
  "thrown-hammer": "thrown", javelin: "thrown", "glaive-return": "thrown",
  net: "thrown", bola: "thrown", flask: "thrown", bomb: "thrown",
  cannon: "projectile", firebolt: "projectile", shard: "projectile", shock: "projectile",
  saw: "slash"
});

/** The five families, in the words `FORM_FAMILY`'s two readers key on. */
export const STRIKE_FAMILIES = Object.freeze(["slash", "thrust", "blunt", "projectile", "thrown"]);

/**
 * What a launcher shoots (08 §7). Keyed by `rules/ammunition.mjs#LAUNCHER_KINDS`,
 * which is also what an ammunition bundle's Fits column names, so a bundle and
 * the launcher it is cut for can never disagree.
 */
export const PROJECTILES = Object.freeze({
  bow: "arrow",
  crossbow: "bolt",
  heavyCrossbow: "bolt",
  handCrossbow: "bolt",
  firearm: "bullet",
  sling: "sling-stone",
  boulderSling: "boulder",
  blowgun: "blowgun-dart"
});

/**
 * Every 08 §7 base that is neither a launcher nor ammunition, by identifier:
 * ninety-one rows, and the other thirty-nine resolve through `launcher` and
 * `fits`. A thrown weapon names its family here - a throwing axe is an axe -
 * and `THROWN_FORMS` turns it into the thrown form WHEN IT IS THROWN (D-731):
 * a Throwing axe has no other way, a Dagger is struck in the hand or thrown.
 */
export const BASE_FORMS = Object.freeze({
  // Light
  "amani-hatchet": "axe",
  "blackjack": "club",
  "bone-shiv": "dagger",
  "cestus": "unarmed",
  "club": "club",
  "dagger": "dagger",
  "deathstalkers-needle": "dagger",
  "gnomish-spring-blade": "dagger",
  "hand-axe": "axe",
  "improvised": "club",
  "mace": "mace",
  "main-gauche": "rapier",
  "moonglaive": "glaive",
  "punch-dagger": "dagger",
  "serrated-blade": "shortsword",
  "short-sword": "shortsword",
  "sickle": "sickle",
  "throwing-knives": "dagger",
  "tomahawk": "axe",
  "unarmed": "unarmed",
  // One-handed
  "battleaxe": "axe",
  "bilgewater-wrench": "wrench",
  "boar-spear": "spear",
  "cutlass": "scimitar",
  "dark-iron-blade": "sword",
  "farstriders-blade": "sword",
  "flail": "flail",
  "gurubashi-tusk-blade": "scimitar",
  "khopesh": "scimitar",
  "light-hammer": "hammer",
  "longsword": "sword",
  "morningstar": "mace",
  "orcish-war-axe": "axe",
  "quarterstaff": "quarterstaff",
  "rapier": "rapier",
  "scimitar": "scimitar",
  "sentinels-glaive": "glaive",
  "spear": "spear",
  "stromgarde-broadsword": "sword",
  "trident": "spear",
  "war-pick": "warhammer",
  "warhammer": "warhammer",
  "warsong-axe": "axe",
  "whip": "whip",
  "wildhammer-stormhammer": "hammer",
  // Two-handed
  "amani-war-scythe": "scythe",
  "bardiche": "halberd",
  "blackrock-cleaver": "greataxe",
  "bronzebeard-greathammer": "maul",
  "executioners-axe": "greataxe",
  "gordunni-stone-club": "greatclub",
  "greataxe": "greataxe",
  "greatclub": "greatclub",
  "greatsword": "greatsword",
  "halberd": "halberd",
  "highland-claymore": "greatsword",
  "lance": "spear",
  "maul": "maul",
  "ogre-club": "greatclub",
  "pike": "spear",
  "poleaxe": "halberd",
  "ragetotem-war-maul": "maul",
  "scythe": "scythe",
  "spiked-maul": "maul",
  "warglaive": "glaive",
  "winterhoof-totem-maul": "maul",
  // Thrown
  "bola": "bola",
  "boomerang": "glaive",
  "chakram": "glaive",
  "dart": "dart",
  "goblin-net": "net",
  "harpoon": "spear",
  "javelin": "spear",
  "net": "net",
  "senjin-bolas": "bola",
  "throwing-axe": "axe",
  // Implements. A staff is a staff; a censer is swung on its chain; a sceptre
  // is *a short ornamented mace that is not called a mace* (08 §7).
  "ancestor-stake": "quarterstaff",
  "antler-fetish": "implement",
  "arcanite-staff": "quarterstaff",
  "carved-pole": "quarterstaff",
  "censer": "flail",
  "gnarled-staff": "quarterstaff",
  "moonwell-stone": "implement",
  "orb": "implement",
  "rod": "implement",
  "runed-staff": "quarterstaff",
  "sceptre": "mace",
  "sealed-casket": "implement",
  "skull-set-wand": "implement",
  "totem-staff": "quarterstaff",
  "wand": "implement"
});

/**
 * A Classic subclass whose finds sit on a base of another family (D-685). The
 * conversion put every dagger on the Scimitar or the Gurubashi tusk-blade base,
 * because 08 §7's own Dagger is Thrown; every other subclass already agrees
 * with its base's family, and the census over the pack says so.
 */
export const SUBCLASS_FORMS = Object.freeze({ Dagger: "dagger" });

/**
 * What a weapon becomes when it leaves the hand. **Only a throw reads this**
 * (D-731): 08 §5's Thrown trait says a weapon *may* be thrown, so a Dagger
 * struck at arm's reach is a dagger and one thrown is a thrown dagger. A form
 * already thrown (a dart, a net, a bola, a flask, a bomb) is left as it is.
 *
 * It is also what says a creature's Thrown row has a hand to be struck in at
 * all (`rowAttackModes`): a hand axe does, a satchel charge does not.
 */
export const THROWN_FORMS = Object.freeze({
  dagger: "thrown-dagger",
  axe: "thrown-axe",
  hammer: "thrown-hammer",
  spear: "javelin",
  glaive: "glaive-return"
});

/**
 * **A HEAVY ONE-HANDED FAMILY IS ITS TWO-HANDED KIN**, on a row read by its
 * words alone. 08 §7 gives Heavy to every two-handed weapon and to no light or
 * one-handed one, so an ogre's *Club* with Heavy is an ogre club and a
 * Felguard's Heavy *Felaxe* is a greataxe. The census holds that premise
 * against the §7 bases. Never applied to a weapon read by its identifier or
 * base, whose own row already says which it is, nor to a thrown one.
 */
export const HEAVY_FORMS = Object.freeze({
  sword: "greatsword",
  axe: "greataxe",
  club: "greatclub",
  hammer: "maul",
  warhammer: "maul",
  mace: "maul"
});

/**
 * The words a weapon's name is read by, most particular first: a phrase before
 * the word inside it (*great club* before *club*, *curved blade* before
 * *blade*), a two-handed kind before its one-handed kin, and *blade* last of
 * the edges because six other rows name a kind of blade.
 */
export const WEAPON_WORDS = Object.freeze([
  ["bolt", ["crossbow", "arbalest"]],
  ["bullet", ["rifle", "pistol", "musket", "blunderbuss", "carbine", "boomstick", "gun"]],
  ["cannon", ["cannon"]],
  ["arrow", ["bow", "longbow", "shortbow"]],
  ["sling-stone", ["sling"]],
  ["blowgun-dart", ["blowgun"]],
  ["flask", ["flask", "vial"]],
  ["bomb", ["bomb", "satchel charge", "grenade"]],
  ["bola", ["bola", "bolas"]],
  ["net", ["net"]],
  ["dart", ["dart", "darts"]],
  ["javelin", ["javelin", "harpoon"]],
  ["glaive", ["moonglaive", "warglaive", "glaive", "chakram", "boomerang"]],
  ["greatsword", ["greatsword", "great sword", "claymore"]],
  ["greataxe", ["greataxe", "great axe", "great cleaver", "executioner's axe"]],
  ["greatclub", ["greatclub", "great club"]],
  ["maul", ["maul", "great maul", "greathammer"]],
  ["halberd", ["halberd", "poleaxe", "bardiche", "polearm"]],
  ["scythe", ["scythe"]],
  ["flail", ["flail", "chain"]],
  ["sickle", ["sickle", "hook"]],
  ["whip", ["whip"]],
  ["wrench", ["wrench", "spanner"]],
  ["warhammer", ["warhammer", "war pick", "pick"]],
  ["hammer", ["hammer", "stormhammer"]],
  ["mace", ["mace", "morningstar", "sceptre", "scepter"]],
  ["club", ["club", "cudgel", "blackjack", "bar", "bough", "branch", "torch"]],
  ["quarterstaff", ["quarterstaff", "staff", "stave", "pole"]],
  ["implement", ["wand", "rod", "orb"]],
  ["spear", ["spear", "lance", "pike", "trident"]],
  ["rapier", ["rapier", "main gauche", "duelling blade", "dueling blade", "slender blade"]],
  ["scimitar", ["scimitar", "cutlass", "cutlasses", "khopesh", "tusk blade", "curved blade"]],
  ["shortsword", ["shortsword", "short sword", "offhand blade"]],
  ["dagger", ["dagger", "knife", "shiv", "needle", "stiletto", "scalpel", "spring blade", "sacrificial blade"]],
  ["axe", ["axe", "axes", "battleaxe", "felaxe", "hatchet", "tomahawk", "cleaver"]],
  ["sword", ["sword", "longsword", "broadsword", "runeblade", "doomblade", "felblade", "warblade", "blade"]],
  ["unarmed", ["unarmed", "cestus", "fist", "fists"]]
]);

/**
 * **THE ROWS THAT ARE SPELLS OR MACHINE PARTS IN ALL BUT NAME**, read only as
 * the HEAD of the name: the phrase has to END it. A *Lava lash* is a bolt of
 * fire and never a whip, a *Saw arm* is a saw, a *Grapple claw* is a pincer and
 * a *Rifle butt* is a blow with the stock that shoots nothing. The same word
 * modifying a creature's own noun names nothing: *Saw-toothed jaws* is a bite,
 * a *Web-spinner's bite* is a bite and *Shock claws* are claws. Checked before
 * the body words, which is what lets the two parts beat *claw* and *rifle*.
 */
export const CREATURE_HEADS = Object.freeze([
  ["firebolt", ["firebolt", "searing flame", "lava lash"]],
  ["shard", ["nether shard"]],
  ["shock", ["shock", "thunderstrike"]],
  ["saw", ["saw arm", "thresher arm"]],
  ["net", ["web"]],
  ["pincer", ["grapple claw"]],
  ["club", ["rifle butt"]]
]);

/**
 * The words a creature's body is read by, anywhere in the name and before the
 * weapon words.
 *
 * - **A shield before a slam** (*Shield slam*).
 * - **A tail slams** (D-725). Every tail row in 14 is a sweep or a lash -
 *   Onyxia's, Nefarian's, the Naga Myrmidon's, the Chimaera's *Tail lash*,
 *   Gyth's - and not one is a sting, so a sting is read off *sting* and
 *   *stinger* alone.
 * - **A head butts**, and a butt with no rifle before it is a blow with the
 *   head: *Head butt* is a slam.
 * - **Hands and a kick are a person's** (Appendix B's unarmed). 14's own bare
 *   *Fists* and *Kick* read the other way by their whole names
 *   (`CREATURE_NAMED`).
 */
export const CREATURE_WORDS = Object.freeze([
  ["pincer", ["pincer", "pincers"]],
  ["bite", ["bite", "bites", "jaws", "beak", "fangs"]],
  ["claw", ["claw", "claws", "foreclaws", "talons"]],
  ["sting", ["sting", "stinger"]],
  ["shield", ["shield"]],
  ["slam", ["slam", "fist", "fists", "buffet", "hooves", "stamp", "backhand", "wave", "tail", "head butt", "headbutt", "butt"]],
  ["gore", ["horns", "antlers", "tusks"]],
  ["tentacle", ["tentacle", "tentacles", "coils", "tendril"]],
  ["touch", ["touch", "grasp"]],
  ["unarmed", ["kick", "hands"]]
]);

/**
 * **A ROW READ BY ITS WHOLE NAME**, before any word, keyed by the name as
 * `strikeWords` gives it. Two kinds:
 *
 * - **A weapon with a name of its own**, which no word reads: *Sul'thraze* the
 *   two-handed sword, *Sulfuras* the maul the weapons pack also holds, and
 *   *Ironfoe's return*, the off-hand blow of the Ironfoe the pack files as a
 *   warhammer.
 * - **A bare body word whose owner the word cannot tell** (D-725). 14's only
 *   bare *Fists* is the Lordaeron Refugee's - a person's hands, so unarmed -
 *   and its only bare *Kick* is the Trained Mount's, which is hooves, so a
 *   slam. Appendix B runs both the other way. *Stone fists* and a person's
 *   *Roundhouse kick* still read by their words.
 */
export const CREATURE_NAMED = Object.freeze({
  "fists": "unarmed",
  "ironfoe's return": "warhammer",
  "kick": "slam",
  "sul'thraze": "greatsword",
  "sulfuras": "maul"
});

/**
 * **THE ROWS WITH NO FAIR STAND-IN, and why** (D-725). The census names every
 * one and holds the count under a ceiling that may only fall: a row that
 * gains a form comes off this list and lowers it.
 */
export const CREATURE_REASONS = Object.freeze({
  "mind lash": "a psychic blow at range: nothing visible travels, and no form in the free libraries stands in for it",
  "arcane lash": "a lash of raw arcane force: a physical whip or a bolt would each show something the row is not"
});

/** What a strike records when nothing about the weapon names a form. */
export const UNREAD_REASON = "nothing in its launcher, base, identifier or name names a form";

/** What a creature's row records when neither its name nor its title names a form. */
export const UNREAD_ROW_REASON = "nothing in the row's name names a form";

/* -------------------------------------------- */

/**
 * A name as the word tables read it: lower case, a straight apostrophe, every
 * other run of non-letters one space. Hyphens split, so *Totem-hammer* reads
 * *totem hammer* and *Grave-cold grasp* reads *grave cold grasp*.
 */
export function strikeWords(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z']+/g, " ")
    .trim();
}

/**
 * The 08 §7 identifier a base flag names: the part before its comma, slugged
 * exactly as the book parser slugs a name (`tools/parse-book/lib/markdown.mjs`,
 * which `strikes.test.mjs` holds this against). `Greatsword, two-handed` is
 * `greatsword`; `Shot, firearm` is `shot`, which is no base, and a shot
 * resolves by what it fits before this is asked.
 */
export function baseIdentifier(base) {
  const head = String(base ?? "").split(",")[0];
  const slug = head
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

/**
 * A table's OWN value for a key, or null. Every table here is a plain object,
 * so a bare `table[key]` answers `constructor`, `toString` and `__proto__` with
 * something off `Object.prototype`, and a truthy something passes for a form.
 */
function own(table, key) {
  return typeof key === "string" && Object.hasOwn(table, key) ? table[key] : null;
}

/** The first form of a table whose word or phrase stands whole in the text. */
function formByWords(text, table) {
  const words = strikeWords(text);
  if (!words) return null;
  const padded = ` ${words} `;
  for (const [form, list] of table) {
    if (list.some(word => padded.includes(` ${word} `))) return form;
  }
  return null;
}

/** The first form of a table whose phrase ENDS the text, or is the whole of it. */
function formByHead(text, table) {
  const words = strikeWords(text);
  if (!words) return null;
  for (const [form, list] of table) {
    if (list.some(phrase => words === phrase || words.endsWith(` ${phrase}`))) return form;
  }
  return null;
}

/** A `Range 60 ft` token, which is how 14 writes the distance of anything that is not thrown (D-531). */
function namesRange(traits = []) {
  return traits.some(t => /^range\s+\d+\s*ft$/i.test(String(t).trim()));
}

/** The plain facts of a weapon, off a document or a pack source alike. */
export function weaponFacts(doc) {
  if (!doc) return null;
  const sys = doc.system ?? {};
  const flags = doc.flags?.["azeroth-rpg"] ?? {};
  return {
    id: doc.id ?? doc._id ?? null,
    identifier: sys.identifier ? String(sys.identifier) : null,
    name: String(doc.name ?? ""),
    launcher: sys.launcher ?? null,
    fits: [...(sys.fits ?? [])],
    range: sys.range ?? null,
    traits: [...(sys.traits ?? [])].map(String),
    base: flags.base ?? null,
    subclass: flags.classic?.subclass ?? null
  };
}

/** The part of a weapon's facts a card keeps, so it can say which weapon without the document. */
function named(facts) {
  if (!facts) return null;
  return { id: facts.id ?? null, identifier: facts.identifier ?? null, name: facts.name ?? "" };
}

/**
 * How the blow travels, by the way it is struck (D-731): a shot is `ranged`, a
 * throw is `thrown`, and a blow in the hand is `melee` whatever traits the
 * weapon carries - a Dagger stabbed at arm's reach is not thrown.
 */
const RANGE_KINDS = Object.freeze({ hand: "melee", thrown: "thrown", shot: "ranged" });

/** The way a blow is struck: the one asked for where the list has it, else the list's first. */
function modeIn(modes, mode) {
  return modes.includes(mode) ? mode : modes[0];
}

/**
 * The ways a creature's attack row is struck (D-731).
 *
 * 14 prints no Range column: a row's distance is its trait's, and the parser
 * copies it into `range` on every Thrown row alike. So what 08 §7 tells apart
 * by the column, a row tells apart by what it is:
 *
 * | Row | Ways |
 * |---|---|
 * | a row NAMED *Thrown ...* - *Thrown dagger*, *Thrown axe* | thrown |
 * | 08 §5's Thrown, on something `THROWN_FORMS` throws from the hand - a hand axe, a spear, a moonglaive, a stormhammer | hand, thrown |
 * | Thrown, on something only ever thrown - a javelin, a flask, a satchel charge | thrown |
 * | a `Range N ft` token, or a range with no Thrown trait | shot |
 * | anything else | hand |
 *
 * **A row named for the throw is a throw and nothing else** (D-731's review).
 * D-531: *melee is assumed; anything further names its distance* - and a block
 * that names a row *Thrown dagger* has said which blow it is. VanCleef and
 * Zul'jin each print a separate melee row at a different Damage Rating, and
 * Zul'jin a *Throw the Axe* Boss Action besides, so reading the form alone
 * let the throw stab and invented an attack neither block prints.
 *
 * @param {{name?: string, traits?: string[], range?: number|null}} row
 * @param {{title?: string|null}} [o]
 * @returns {string[]}
 */
export function rowAttackModes(row, { title = null } = {}) {
  return modesOfRow(row, readRow(row, title).form);
}

/** A row's ways, given the form it reads as in the hand. */
function modesOfRow(row, handForm) {
  const traits = (row?.traits ?? []).map(String);
  if (isThrown({ traits })) {
    if (/^thrown\b/.test(strikeWords(row?.name))) return ["thrown"];
    return own(THROWN_FORMS, handForm) ? ["hand", "thrown"] : ["thrown"];
  }
  if (namesRange(traits) || (row?.range !== null && row?.range !== undefined)) return ["shot"];
  return ["hand"];
}

/**
 * What a weapon's blow records (D-725), the way it is struck (D-731).
 *
 * @param {object|null} facts  `weaponFacts(weapon)`
 * @param {object} [o]
 * @param {object|null} [o.ammunition]  `weaponFacts(bundle)`, the bundle the launcher fires
 * @param {"hand"|"thrown"|"shot"|null} [o.mode]  the way it is struck; with none, the weapon's first
 * @returns {{form: string|null, rangeKind: "melee"|"ranged"|"thrown", via: string|null,
 *   weapon: {id, identifier, name}|null, ammunition: {id, identifier, name}|null,
 *   row: null, reason: string|null}}
 */
export function strikeFor(facts, { ammunition = null, mode = null } = {}) {
  const f = facts ?? {};
  const traits = f.traits ?? [];
  // A launcher kind the table does not hold shoots nothing it can name, and is
  // read as no launcher at all. `WeaponData.migrateData` nulls one in a world.
  const launcher = own(PROJECTILES, f.launcher) ? f.launcher : null;
  // **THE WAY IT IS STRUCK, NOT THE TRAIT IT CARRIES** (D-731). With no mode
  // the weapon's first way is read, which for a hand weapon that may be thrown
  // is the hand: the trait is a permission, never a throw.
  const used = modeIn(attackModes({ launcher, traits, range: f.range ?? null }), mode);
  const thrown = used === "thrown";
  let form = null;
  let via = null;
  const shot = (f.fits ?? []).find(kind => own(PROJECTILES, kind)) ?? null;
  if (launcher) {
    form = own(PROJECTILES, launcher);
    via = "launcher";
  } else if (shot) {
    form = own(PROJECTILES, shot);
    via = "ammunition";
  } else {
    const byBase = own(BASE_FORMS, baseIdentifier(f.base));
    const byIdentifier = own(BASE_FORMS, f.identifier);
    if (byBase) {
      form = byBase;
      via = "base";
    } else if (byIdentifier) {
      form = byIdentifier;
      via = "identifier";
    }
    const bySubclass = own(SUBCLASS_FORMS, f.subclass);
    if (bySubclass) {
      form = bySubclass;
      via = "subclass";
    }
    if (!form) {
      form = formByWords(f.name, WEAPON_WORDS);
      if (form) {
        via = "words";
        if (!thrown && traits.some(t => /^heavy$/i.test(String(t).trim()))) form = own(HEAVY_FORMS, form) ?? form;
      }
    }
  }
  if (form && thrown) form = own(THROWN_FORMS, form) ?? form;
  return {
    form,
    rangeKind: RANGE_KINDS[used],
    via,
    weapon: facts ? named(f) : null,
    ammunition: named(ammunition),
    row: null,
    reason: form ? null : UNREAD_REASON
  };
}

/**
 * What a row reads as in the hand: its whole name, else a row with no fair
 * stand-in and its reason, else a spell or a machine part that ends the name,
 * the creature's body and then the weapon's words - on the row's name and then
 * on the title the door gave it. Neither the Heavy promotion nor a throw is laid
 * on yet: both depend on the way the blow is struck.
 */
function readRow(row, title) {
  const name = String(row?.name ?? "");
  for (const text of [name, title]) {
    const key = strikeWords(text);
    if (!key) continue;
    const byName = own(CREATURE_NAMED, key);
    if (byName) return { form: byName, via: "named", reason: null };
    const why = own(CREATURE_REASONS, key);
    if (why) return { form: null, via: null, reason: why };
    const form = formByHead(key, CREATURE_HEADS) ?? formByWords(key, CREATURE_WORDS) ?? formByWords(key, WEAPON_WORDS);
    if (form) return { form, via: "words", reason: null };
  }
  return { form: null, via: null, reason: null };
}

/**
 * What a creature's attack row records (D-725): a row read by its whole name,
 * else a row with no fair stand-in and its reason, else a spell or a machine
 * part that ends the name, the creature's body and then the weapon's words -
 * on the row's name and then on the title the door gave it, since an ability
 * that attacks carries its own name there and may carry no row name at all.
 *
 * **The way it is struck is the door's to say** (D-731, `rowAttackModes`): a
 * Bandit's hand axe swung in reach is an axe and one thrown is a thrown axe.
 * With no mode, the row's first way.
 *
 * @param {{name?: string, traits?: string[], range?: number|null}} row
 * @param {{index?: number|null, title?: string|null, mode?: "hand"|"thrown"|"shot"|null}} [o]
 */
export function strikeForRow(row, { index = null, title = null, mode = null } = {}) {
  const name = String(row?.name ?? "");
  const traits = (row?.traits ?? []).map(String);
  const read = readRow(row, title);
  const used = modeIn(modesOfRow(row, read.form), mode);
  let form = read.form;
  // A Heavy word is its two-handed kin only in the hand; a throw keeps the
  // family `THROWN_FORMS` can throw.
  if (form && read.via === "words" && used === "hand" && traits.some(t => /^heavy$/i.test(t.trim()))) {
    form = own(HEAVY_FORMS, form) ?? form;
  }
  if (form && used === "thrown") form = own(THROWN_FORMS, form) ?? form;
  return {
    form,
    rangeKind: RANGE_KINDS[used],
    via: form ? read.via : null,
    weapon: null,
    ammunition: null,
    row: { index: Number.isInteger(index) ? index : null, name },
    reason: form ? null : (read.reason ?? UNREAD_ROW_REASON)
  };
}
