/**
 * **THE DEMON HUNTER'S SPELLS, AND WHAT EACH ONE DOES AT THE TABLE** (07 §15, *Restricted Demon Hunter*; the
 * Demon Hunter plan's Phase 4b, C53 to C58; D-1540 onward). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Most of what a Demon Hunter spell does rides the doors every spell rides, off the descriptors the parser
 * stamps (`tools/parse-book/spells.mjs`): the card's damage and its Resist (`damage`, `test`, `onFail`), the
 * Apply that lays a lasting effect (`applies`), the area's tick (Immolation Aura's self-centred one, Flame
 * Crash's burning ground; D-756), the rising tick (Agonizing Flames' `tick.ramp`, `rules/ticks.mjs`), the
 * upkeep in the entry's own Energy (`rules/upkeep.mjs`), the melee retaliation (Demon Spikes,
 * `rules/spell-retaliation.mjs`) and the escape its failure carries (Inner Demon, `rules/escapes.mjs`). What no
 * descriptor carries is read here, off 07's own words, and written by `effects/demon-hunter-spells.mjs`.
 *
 * **`DH_SPELL_AUTOMATION` IS THE CENSUS** (`demon-hunter-spells.test.mjs`), in the Sovereign's shape
 * (D-1243): every spell the Demon Hunter may hold - its twenty and the ten Fel spells it borrows - names the
 * doors that carry it, and `DH_SPELL_DOORS` names each door's call site BY FUNCTION, found with the comments
 * blanked (`tools/strip-comments.mjs`). **No row holds the hunter above 0 or prevents its death** (the lead's
 * C8: *"Having a spell or feature prevent death goes against this"*): the census fails a row naming
 * `_holdAtOne`, a stand-again source or a hold.
 */

/** HTML to one flat line, bold kept as `**`. */
function flat(text) {
  return String(text ?? "").replace(/<\/?(strong|b)>/g, "**").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** HTML to one flat line, bold dropped. */
const plain = text => flat(text).replace(/\*\*/g, "");

/** A whole number at or above nothing. */
const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

const WORD_NUMBERS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5 });
const countOf = word => WORD_NUMBERS[String(word ?? "").toLowerCase()] ?? (Number(word) || null);

/** Feet in a mile (05's units; the brand's and the recall's *within 1 mile*). */
export const FEET_PER_MILE = 5280;

const SCOPE = "azeroth-rpg";
/** An active effect's `azeroth-rpg` flag under `key`, or null. */
const flagOf = (e, key) => (e && e.active !== false && e.disabled !== true ? e.flags?.[SCOPE]?.[key] ?? null : null);

/* ------------------------------------------------------------------ */
/*  The flags the doors write                                          */
/* ------------------------------------------------------------------ */

/** Hunter's Brand on the branded creature: `{by, demon, source, cast}`. */
export const BRAND_FLAG = "hunterBrand";
/** Searing Edge's, Glaive Tempest's and the other self effects a Demon Hunter spell lays on its caster: the spell's identifier. */
export const DH_OWN_FLAG = "dhOwn";
/** Gaze of the Sightless on the caster: `{cast, feet, centre, allies}`. */
export const GAZE_FLAG = "sightlessGaze";
/** Unnatural Agility on the caster: `{banes, noOpportunity, source}`. */
export const AGILITY_FLAG = "unnaturalAgility";
/** Nether Snare on the snared demon: `{by, source, boonFor}`. */
export const SNARE_FLAG = "netherSnare";
/** Hunting Ground on the caster: `{cast, feet, centre, source}`. */
export const HUNTING_FLAG = "huntingGround";
/** A thrown glaive on its own weapon item: `{sceneId, x, y, cast, source}` (C55, C57). */
export const AWAY_FLAG = "away";
/** Immolation Aura's light on the caster's token: the token's own light before it, to put back. */
export const AURA_LIGHT_FLAG = "immolationLight";
/** Inner Demon's tick carrier on the tormented creature: `{cast, frightenedId}`. */
export const TORMENT_FLAG = "innerDemon";
/** Agonizing Flames' tick carrier names itself by the spell's identifier (the tick's own `name` and `cast`). */
export const FLAMES_ID = "agonizing-flames";
/** Shear's lowered maximum on the creature: `{by, amount, source}`. */
export const SHEAR_FLAG = "shear";
/** The once-a-turn mark Immolation Aura's entering strike claims on the caster: `{[tokenId]: turnKey}`. */
export const IMMOLATION_ENTERED_FLAG = "immolationEntered";

/* ------------------------------------------------------------------ */
/*  07 §15's words, read                                               */
/* ------------------------------------------------------------------ */

/**
 * **HUNTER'S BRAND** (*For the duration you know the target's direction and distance while it is within 1 mile
 * of you. A demon you brand cannot be invisible to you or hidden from you*).
 * @returns {{feet: number, demonSeen: boolean}|null}
 */
export function readBrand(effect = "") {
  const t = plain(effect);
  const m = /\bFor the duration you know the target's direction and distance while it is within (\w+) miles? of you\b/.exec(t);
  if (!m) return null;
  return { feet: (countOf(m[1]) ?? 1) * FEET_PER_MILE, demonSeen: /\bA demon you brand cannot be invisible to you or hidden from you\b/.test(t) };
}

/**
 * **A BLOW'S OWN EXTRA** (Searing Edge's *your weapon hits deal 1 more Fel damage*; Glaive Tempest's *Each hit
 * deals 2 more Fel damage*): the amount and its type, which the attack door's typed lane carries
 * (`spell-bonus.mjs#typedLaneExtras`, D-777).
 * @returns {{amount: number, type: string}|null}
 */
export function readHitBonus(effect = "") {
  const m = /\b(?:your weapon hits|Each hit) deals? (\d+) more ([A-Z][a-z]+) damage\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]), type: m[2].toLowerCase() } : null;
}

/** Glaive Tempest's *Make one weapon attack against each enemy within your reach*. */
export function readTempest(effect = "") {
  return /\bMake one weapon attack against each enemy within your reach\b/.test(plain(effect));
}

/**
 * **GAZE OF THE SIGHTLESS** (*illusions inside the area show as false to you and to each ally you choose, and
 * each invisible creature inside the area is outlined for you and for those allies*).
 * @returns {{allies: boolean, outlines: boolean}|null}
 */
export function readGaze(effect = "") {
  const t = plain(effect);
  if (!/\billusions inside the area show as false to you and to each ally you choose\b/.test(t)) return null;
  return { allies: true, outlines: /\beach invisible creature inside the area is outlined for you and for those allies\b/.test(t) };
}

/**
 * **SPELLSUNDER** (*On a failure, end one tier 1 spell it is Sustaining or one tier 1 spell's effect on it, your
 * choice*).
 * @returns {{tier: number}|null}
 */
export function readSunder(effect = "") {
  const m = /\bOn a failure, end one tier (\d+) spell it is Sustaining or one tier \1 spell's effect on it, your choice\b/.exec(plain(effect));
  return m ? { tier: Number(m[1]) } : null;
}

/** Immolation Aura's *The fire sheds bright light in a 20 ft radius*. */
export function readAuraLight(effect = "") {
  const m = /\bsheds bright light in a (\d+) ft radius\b/.exec(plain(effect));
  return m ? { bright: Number(m[1]) } : null;
}

/** Agonizing Flames' *The target may spend an action to put the flames out, which ends the spell*. */
export function readPutOut(effect = "") {
  return /\bThe target may spend an action to put the flames out, which ends the spell\b/.test(plain(effect)) ? { cost: "action" } : null;
}

/**
 * **CALL THE GLAIVES** (*Up to two glaives you have equipped fly back to your hands from anywhere within 1 mile*).
 * @returns {{count: number, feet: number}|null}
 */
export function readRecall(effect = "") {
  const m = /\bUp to (\w+) glaives you have equipped fly back to your hands from anywhere within (\w+) miles?\b/.exec(plain(effect));
  return m ? { count: countOf(m[1]) ?? 2, feet: (countOf(m[2]) ?? 1) * FEET_PER_MILE } : null;
}

/**
 * **HELLSTRIKE** (*Leap up to 30 feet to a space you can see. Every creature within 10 feet of where you land
 * makes a Body Resilience Test*).
 * @returns {{feet: number, ring: number}|null}
 */
export function readLeap(effect = "") {
  const t = plain(effect);
  const m = /\bLeap up to (\d+) feet to a space you can see\b/.exec(t);
  const r = /\bEvery creature within (\d+) feet of where you land\b/.exec(t);
  return m && r ? { feet: Number(m[1]), ring: Number(r[1]) } : null;
}

/**
 * **SIPHON THE WEAVE** (*Cast this when a spell of tier 2 or lower takes effect on a creature within 30 feet of
 * you, or when a creature within 30 feet of you begins Sustaining one. ... If the creature is the spell's caster,
 * it makes a Spirit Resilience Test ... If the spell ends, you regain Energy equal to twice its tier*).
 * @returns {{maxTier: number, feet: number, casterTests: boolean, regain: number}|null}
 */
export function readSiphon(effect = "") {
  const t = plain(effect);
  const m = /\bCast this when a spell of tier (\d+) or lower takes effect on a creature within (\d+) feet of you, or when a creature within \2 feet of you begins Sustaining one\b/.exec(t);
  if (!m) return null;
  const regain = /\byou regain Energy equal to twice its tier\b/.test(t) ? 2 : 0;
  return { maxTier: Number(m[1]), feet: Number(m[2]), casterTests: /\bIf the creature is the spell's caster, it makes a Spirit Resilience Test\b/.test(t), regain };
}

/** Unnatural Agility (*attacks against you take a Bane, and you provoke no Opportunity Attacks*). */
export function readAgility(effect = "") {
  return /\battacks against you take a Bane, and you provoke no Opportunity Attacks\b/.test(plain(effect)) ? { banes: 1, noOpportunity: true } : null;
}

/**
 * **NETHER SNARE** (*cannot teleport, turn invisible or pass through a portal for the duration. **Banish** and
 * **Soulchains** against it gain a Boon*).
 * @returns {{teleport: boolean, invisible: boolean, portal: boolean, boonFor: string[]}|null}
 */
export function readSnare(effect = "") {
  const t = flat(effect);
  if (!/\bcannot teleport, turn invisible or pass through a portal for the duration\b/.test(t)) return null;
  const boon = /((?:\*\*[A-Z][\w' ]+\*\*(?:,? and |, )?)+) against it gain a Boon\b/.exec(t);
  const boonFor = boon ? [...boon[1].matchAll(/\*\*([A-Z][\w' ]+)\*\*/g)].map(x => x[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")).sort() : [];
  return { teleport: true, invisible: true, portal: true, boonFor };
}

/** Eye Beam's **Scorched 2**: the value a failure lays (A1's Scorched X), or null. */
export function readScorchedValue(effect = "") {
  const m = /\*\*Scorched (\d+)\*\*/.exec(flat(effect));
  return m ? Number(m[1]) : null;
}

/**
 * **FLAME CRASH** (*Throw one or both of the glaives you wield, choosing for each a point you can see within 30
 * feet. Where each lands, a 10 ft radius burns for the duration*).
 * @returns {{range: number, radius: number, most: number, recall: boolean}|null}
 */
export function readFlameCrash(effect = "") {
  const t = plain(effect);
  const m = /\bThrow one or both of the glaives you wield, choosing for each a point you can see within (\d+) feet\. Where each lands, a (\d+) ft radius burns\b/.exec(t);
  return m ? { range: Number(m[1]), radius: Number(m[2]), most: 2, recall: /\byou cannot attack with it until then\b/.test(t) } : null;
}

/**
 * **HUNTING GROUND** (*Inside the area you ignore Difficult ground and provoke no Opportunity Attacks, and no
 * creature inside it can be invisible to you or hidden from you*): what holds INSIDE the area, never on the whole
 * Sustain (the parse report's flag).
 * @returns {{ground: boolean, noOpportunity: boolean, reveals: boolean}|null}
 */
export function readHuntingGround(effect = "") {
  const t = plain(effect);
  if (!/\bInside the area you ignore Difficult ground\b/.test(t)) return null;
  return { ground: true, noOpportunity: /\band provoke no Opportunity Attacks\b/.test(t), reveals: /\bno creature inside it can be invisible to you or hidden from you\b/.test(t) };
}

/**
 * **DEVOUR THE SPELL** (07, D-1717: *Cast this at the start of the turn of a creature within 30 feet of you that is
 * Sustaining a spell of tier 3 or lower, before it pays that spell's upkeep. The creature makes a Spirit Resilience
 * Test against your Spell DC. On a failure the spell ends and you gain Hatred equal to its tier plus 2*). The trigger
 * is the creature's turn start (`effects/devour-the-spell-reaction.mjs#devourTurnStart`).
 * @returns {{maxTier: number, feet: number, plus: number}|null}
 */
export function readDevour(effect = "") {
  const t = plain(effect);
  const m = /\bCast this at the start of the turn of a creature within (\d+) feet of you that is Sustaining a spell of tier (\d+) or lower, before it pays that spell(?:'|\u2019|&#0?39;|&#x27;|&apos;)s upkeep\b/.exec(t);
  const g = /\byou gain Hatred equal to its tier plus (\d+)\b/.exec(t);
  return m && g ? { maxTier: Number(m[2]), feet: Number(m[1]), plus: Number(g[1]) } : null;
}

/**
 * **SHEAR** (*its Health maximum drops by twice your tier for the duration, and its current Health drops to the
 * new maximum if it is above it*).
 * @returns {{per: number}|null}
 */
export function readShear(effect = "") {
  const t = plain(effect);
  if (!/\bits Health maximum drops by twice your tier for the duration\b/.test(t)) return null;
  return { per: 2, clamps: /\bits current Health drops to the new maximum if it is above it\b/.test(t) };
}

/**
 * **THE HIGHEST TIER A SPELL-ENDING CAST MAY END** (Spellsunder, Siphon the Weave, Devour the Spell; the review's C5),
 * read off the casting spell's own effect text - never off a payload - so the GM's client caps the end itself. Null
 * where the identifier is none of the three or its words do not read.
 *
 * @param {string|null} identifier  the casting spell's
 * @param {string} effect  its effect text (or the card's enriched copy)
 * @returns {number|null}
 */
export function endCapFor(identifier = null, effect = "") {
  if (identifier === "spellsunder") return readSunder(effect)?.tier ?? null;
  if (identifier === "siphon-the-weave") return readSiphon(effect)?.maxTier ?? null;
  if (identifier === "devour-the-spell") return readDevour(effect)?.maxTier ?? null;
  return null;
}

/** Draw Soul's *You regain 2 Health for each creature that failed*. */
export function readDrawHeal(effect = "") {
  const m = /\bYou regain (\d+) Health for each creature that failed\b/.exec(plain(effect));
  return m ? { per: Number(m[1]) } : null;
}

/**
 * **INNER DEMON** (*On a failure it is **Frightened** and **Entangled** for the duration, and it takes 3 Fel
 * damage at the start of each of its turns*): the tick the FAILED Test's door lays, never the card's Apply.
 * @returns {{amount: number, type: string, statuses: string[]}|null}
 */
export function readTorment(effect = "") {
  const t = flat(effect);
  const m = /\bOn a failure it is \*\*(\w+)\*\* and \*\*(\w+)\*\* for the duration, and it takes (\d+) ([A-Z][a-z]+) damage at the start of each of its turns\b/.exec(t);
  return m ? { amount: Number(m[3]), type: m[4].toLowerCase(), statuses: [m[1].toLowerCase(), m[2].toLowerCase()] } : null;
}

/**
 * **WHERE A DEMON HUNTER SPELL'S DAMAGE IS NOT THE CAST'S** (`area-ticks.mjs#castDealsDamage`): Searing Edge's
 * and Glaive Tempest's *more damage* rides the weapon blows (the typed lane), and Inner Demon's 3 lands at the
 * tormented creature's turns through the failed Test's tick. The card deals none of them at the cast.
 *
 * @param {{effect?: string}} sys
 */
export function dhDamageNotCast(sys = {}) {
  const effect = sys?.effect ?? "";
  return Boolean(readHitBonus(effect) || readTorment(effect));
}

/**
 * **A DEMON HUNTER SPELL WHOSE OWN DOOR LAYS WHAT IT LAYS** (the parser's stamp, `spell-effects.mjs
 * #seedSpellEffects`): Hunter's Brand at the cast, Gaze of the Sightless' and Hunting Ground's circle on the caster,
 * Unnatural Agility's Bane, and what Nether Snare's and Shear's FAILURE lays. Their card offers no generic Apply,
 * which would lay a second, empty effect beside the door's (the Sovereign's `NO_APPLY` reason, D-1240).
 */
export function dhLaysOwnEffect(effect = "") {
  return Boolean(readBrand(effect) || readGaze(effect) || readHuntingGround(effect) || readAgility(effect) || readSnare(effect) || readShear(effect));
}

/** **WHERE A DEMON HUNTER SPELL'S HEALING IS NOT THE CARD'S**: Draw Soul's is the caster's, a failure at a time. */
export function dhHealNotCast(sys = {}) {
  return Boolean(readDrawHeal(sys?.effect ?? ""));
}

/* ------------------------------------------------------------------ */
/*  The laws the doors ask                                             */
/* ------------------------------------------------------------------ */

/** 08 §7's glaive: a weapon whose `weaponType` is `glaive`, or a name that says so (`equipment-training.mjs`). */
export function isGlaive(item) {
  if (!item || item.type !== "weapon") return false;
  return item.system?.weaponType === "glaive" || /\bglaive\b/i.test(String(item.name ?? ""));
}

/** Where a thrown glaive lies (`AWAY_FLAG`), or null for one in the hand. */
export function awayOf(item) {
  const raw = item?.flags?.[SCOPE]?.[AWAY_FLAG] ?? null;
  return raw && typeof raw === "object" ? raw : null;
}

/** Whether a weapon is a thrown glaive still lying where it landed (C57: *a hand whose glaive was thrown is empty*). */
export function glaiveAway(item) {
  return Boolean(awayOf(item));
}

/**
 * **THE GLAIVES A HUNTER WIELDS** (Flame Crash's *the glaives you wield*): equipped, glaives, in the hand -
 * sorted by id so two reads agree (CLAUDE.md §15).
 */
export function wieldedGlaives(items = []) {
  return [...(items ?? [])].filter(i => isGlaive(i) && i.system?.equipped === true && !glaiveAway(i)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * **THE GLAIVES CALL THE GLAIVES BRINGS BACK** (C55: *glaives you have equipped*): every equipped glaive lying
 * away, within the reach, up to the count. A glaive on another scene, or one whose distance could not be measured,
 * is out of reach (MY READING: no board measures a mile across scenes). `feetTo(item)` measures it.
 *
 * @param {object[]} items
 * @param {{count?: number, feet?: number, sceneId?: string|null, feetTo?: (item: object) => number|null}} o
 * @returns {{back: object[], far: object[]}}
 */
export function recalled(items = [], { count = 2, feet = FEET_PER_MILE, sceneId = null, feetTo = () => null } = {}) {
  const away = [...(items ?? [])].filter(i => isGlaive(i) && i.system?.equipped === true && glaiveAway(i)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const back = [];
  const far = [];
  for (const i of away) {
    const at = awayOf(i);
    const d = at?.sceneId && at.sceneId === sceneId ? feetTo(i) : null;
    if (d === null || d === undefined || !Number.isFinite(Number(d)) || Number(d) > feet || back.length >= whole(count)) far.push(i);
    else back.push(i);
  }
  return { back, far };
}

/** Why an attack with a weapon is refused: it is a thrown glaive (a `lang/en.json` key), or null. */
export function awayRefusal(item) {
  return glaiveAway(item) ? "AZEROTH.DhSpell.Glaive.Away" : null;
}

/**
 * **THE COMPASS POINT FROM ONE POINT TO ANOTHER** (Hunter's Brand's *direction*): canvas up is north, eight
 * points. Null where the two coincide.
 */
export function compassOf(dx = 0, dy = 0) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (!x && !y) return null;
  // Canvas y grows downward, so north is -y.
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  const points = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  return points[((Math.round(deg / 45) % 8) + 8) % 8];
}

/**
 * **WHAT THE BRAND TELLS THE HUNTER** (Hunter's Brand): the direction and distance where the creature is on the
 * same board within the reach, else why not (`elsewhere` off the board, `far` past the mile).
 *
 * @param {{feet?: number|null, dx?: number, dy?: number, sameScene?: boolean, reach?: number}} o
 * @returns {{known: boolean, why: string|null, feet: number|null, point: string|null}}
 */
export function brandReading({ feet = null, dx = 0, dy = 0, sameScene = false, reach = FEET_PER_MILE } = {}) {
  if (!sameScene) return { known: false, why: "elsewhere", feet: null, point: null };
  if (feet === null || feet === undefined || !Number.isFinite(Number(feet))) return { known: false, why: "elsewhere", feet: null, point: null };
  if (Number(feet) > reach) return { known: false, why: "far", feet: Math.round(Number(feet)), point: null };
  return { known: true, why: null, feet: Math.round(Number(feet)), point: compassOf(dx, dy) ?? "here" };
}

/**
 * **IMMOLATION AURA'S ENTERING HALF** (*or moves within 5 feet of you on its turn*): a move that brings the mover
 * from outside the reach to within it, judged on its closest approach. A creature that started its turn within
 * the reach was struck then (*once a turn*), so its move strikes nothing (MY READING, for the lead: *within 5
 * feet at the start of its turn* is read off where the turn's movement began).
 *
 * @param {{started?: number|null, closest?: number|null, feet?: number}} o  footprint to footprint, in feet
 */
export function movesWithin({ started = null, closest = null, feet = 5 } = {}) {
  if (closest === null || closest === undefined || !Number.isFinite(Number(closest))) return false;
  if (Number(closest) > Number(feet) + 1e-6) return false;
  if (started !== null && started !== undefined && Number.isFinite(Number(started)) && Number(started) <= Number(feet) + 1e-6) return false;
  return true;
}

/** Whether a once-a-turn mark already holds this turn. */
export function struckThisTurn(marks = {}, tokenId = null, turnKey = null) {
  return Boolean(tokenId && turnKey && marks && typeof marks === "object" && marks[tokenId] === turnKey);
}

/** A point inside a circle, both in canvas pixels. */
export function insideCircle(point, centre, radius) {
  if (!point || !centre) return false;
  const dx = Number(point.x) - Number(centre.x);
  const dy = Number(point.y) - Number(centre.y);
  const r = Number(radius);
  if (![dx, dy, r].every(Number.isFinite)) return false;
  return dx * dx + dy * dy <= r * r + 1e-6;
}

/**
 * **THE SPELL A CHOOSER MAY OFFER** (Spellsunder, Siphon the Weave, Devour the Spell): a candidate the one Dispel
 * judgement passed (`rules/dispel.mjs#dispelJudgement` or `judgeHeldCast`), of a spell at or below the tier, within
 * the feet where the spell names any. `rows` are `{key, tier, feet, ok, reason, sustained}`; sorted by name then key.
 *
 * @param {object[]} rows
 * @param {{maxTier: number, feet?: number|null, sustainedOnly?: boolean}} o
 */
export function spellCandidates(rows = [], { maxTier = 1, feet = null, sustainedOnly = false } = {}) {
  return (rows ?? []).filter(r => r && Number(r.tier) >= 1 && Number(r.tier) <= Number(maxTier)
    && (!sustainedOnly || r.sustained === true)
    && (feet === null || (r.feet !== null && r.feet !== undefined && Number.isFinite(Number(r.feet)) && Number(r.feet) <= Number(feet) + 1e-6)))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.key).localeCompare(String(b.key)));
}

/** Siphon the Weave's Energy: twice the ended spell's tier. */
export function siphonEnergy(tier = 1, per = 2) {
  return whole(tier) * whole(per);
}

/** Devour the Spell's Hatred: the ended spell's tier plus 2 (C52). */
export function devourHatred(tier = 1, plus = 2) {
  return whole(tier) + whole(plus);
}

/**
 * **THE SUSTAINS A CREATURE STARTING ITS TURN MAY HAVE DEVOURED** (07's Devour the Spell, D-1717, D-1726): each
 * entry of its `sustaining` record with a cast and a tier at or below the spell's, sorted by tier (highest first),
 * then name, then cast - so two reads agree (CLAUDE.md §15). An entry whose tier cannot be read is left out.
 *
 * @param {Array<{cast?: string, name?: string, tier?: number|null}>} entries
 * @param {{maxTier?: number}} [o]
 * @returns {Array<{cast: string, name: string, tier: number}>}
 */
export function devourCandidates(entries = [], { maxTier = 3 } = {}) {
  return (Array.isArray(entries) ? entries : [])
    .filter(e => e?.cast && Number.isFinite(Number(e.tier)) && Number(e.tier) >= 1 && Number(e.tier) <= Number(maxTier))
    .map(e => ({ cast: String(e.cast), name: String(e.name ?? ""), tier: Math.trunc(Number(e.tier)) }))
    .sort((a, b) => (b.tier - a.tier) || a.name.localeCompare(b.name) || a.cast.localeCompare(b.cast));
}

/**
 * **WHY A HUNTER IS NOT OFFERED DEVOUR THE SPELL AT THIS TURN START**, or null (D-1726): the spell held; never the
 * creature's own Sustain (MY READING, the orchestrator's: *a hunter cannot devour their own Sustained spell*); the
 * hunter standing; within the spell's 30 feet, footprint to footprint, on the creature's scene; a Sustain of tier 3
 * or lower the one Dispel judgement passes (`dispel.mjs#judgeHeldCast`); a hunter who may gain Hatred (Demon
 * Unleashed: *you gain no Hatred*, judged before the ask); a Reaction left; the Energy the spell costs in the merged
 * pool; a GM online for the writes. A key under `AZEROTH.DhSpell.Devour.Refuse.`.
 *
 * @param {object} o
 * @returns {null|"noSpell"|"self"|"down"|"far"|"tier"|"held"|"unleashed"|"reaction"|"energy"|"noGM"}
 */
export function devourTurnRefusal({
  holds = false, self = false, health = 1, feet = null, reach = 30, candidates = 0, passed = true,
  unleashed = false, reactionLeft = true, energy = 0, cost = 6, gmAbsent = false
} = {}) {
  if (!holds) return "noSpell";
  if (self) return "self";
  if (!(Number(health) > 0)) return "down";
  if (feet === null || feet === undefined || !Number.isFinite(Number(feet)) || Number(feet) > Number(reach) + 1e-6) return "far";
  if (!(Number(candidates) > 0)) return "tier";
  if (!passed) return "held";
  if (unleashed) return "unleashed";
  if (!reactionLeft) return "reaction";
  if (whole(energy) < whole(cost)) return "energy";
  if (gmAbsent) return "noGM";
  return null;
}

/**
 * **WHETHER A DEVOUR CLAIM STILL NAMES THIS MOMENT** (D-1726): the fight the claim was made in, started, at the same
 * round and turn, with the creature as the turn's combatant, still Sustaining the claimed cast at or below the tier,
 * and the caster another creature. `castSpell` refuses Devour the Spell without one, in words, before anything is
 * paid.
 *
 * @param {{claim?: object|null, fight?: {id: string, started: boolean, round: number, turn: number, combatantActorUuid: string|null}|null,
 *   casterUuid?: string|null, sustained?: {cast: string, tier: number|null}|null, maxTier?: number}} o
 * @returns {boolean}
 */
export function devourClaimHolds({ claim = null, fight = null, casterUuid = null, sustained = null, maxTier = 3 } = {}) {
  if (!claim || !fight?.started || claim.combatId !== fight.id) return false;
  if (claim.round !== fight.round || claim.turn !== fight.turn) return false;
  if (!claim.creatureUuid || fight.combatantActorUuid !== claim.creatureUuid) return false;
  if (!casterUuid || casterUuid === claim.creatureUuid) return false;
  const tier = Number(sustained?.tier);
  return Boolean(sustained?.cast) && sustained.cast === claim.cast && Number.isFinite(tier) && tier >= 1 && tier <= Number(maxTier);
}

/**
 * **WHETHER SIPHON THE WEAVE ASKS A TEST** (*If the creature is the spell's caster*): the creature the spell takes
 * effect on, or the creature Sustaining it, is the spell's own caster.
 */
export function siphonTests({ creatureUuid = null, casterUuid = null } = {}) {
  return Boolean(creatureUuid && casterUuid && creatureUuid === casterUuid);
}

/** Shear's drop: twice the caster's tier (at least tier 1). */
export function shearDrop(tier = 1, per = 2) {
  return Math.max(1, whole(tier)) * whole(per);
}

/** The Health a lowered maximum leaves: never above it. */
export function clampedHealth(value = 0, max = 0) {
  return Math.min(whole(value), whole(max));
}

/**
 * **INNER DEMON'S TICK, AS LAID** (`rules/ticks.mjs#layTick`'s shape): the number at the start of each of the
 * creature's turns, for the spell's span (ten turn starts for *1 minute*), by the caster's hand.
 */
export function tormentTick(read, { rounds = 10, source = null, cast = null, name = "", castUuid = null } = {}) {
  if (!read) return null;
  return {
    kind: "damage", type: read.type, amount: whole(read.amount), rounds: Math.max(1, whole(rounds) || 10), until: "", when: "startOfTurn",
    spellpower: false, source, castUuid, cast, name: String(name ?? "")
  };
}

/** Why the flames cannot be put out now (a `lang/en.json` key), or null: the effect is gone. */
export function putOutRefusal({ standing = true } = {}) {
  return standing ? null : "AZEROTH.DhSpell.Flames.Gone";
}

/* ------------------------------------------------------------------ */
/*  What the world reads off the laid effects (pure predicates)         */
/* ------------------------------------------------------------------ */

/**
 * **THE BANES AN ATTACK AT THIS CREATURE TAKES FROM UNNATURAL AGILITY** (the roll dialog's `sovDeterred` lane,
 * D-1364's shape): one row while the effect stands.
 */
export function agilityBanesOn(effects = []) {
  for (const e of effects ?? []) {
    const row = flagOf(e, AGILITY_FLAG);
    if (row && whole(row.banes) > 0) return [{ banes: whole(row.banes), source: String(row.source ?? "") }];
  }
  return [];
}

/** Whether Unnatural Agility spares this creature every Opportunity Attack now; its name, else null. */
export function agilityNoOpportunity(effects = []) {
  for (const e of effects ?? []) {
    const row = flagOf(e, AGILITY_FLAG);
    if (row?.noOpportunity === true) return String(row.source ?? "");
  }
  return null;
}

/** Nether Snare on a creature: the record, or null. */
export function snaredFrom(effects = []) {
  for (const e of effects ?? []) {
    const row = flagOf(e, SNARE_FLAG);
    if (row) return row;
  }
  return null;
}

/** Whether a Casting Test of this spell at a snared demon takes Nether Snare's Boon. */
export function snareBoon(snared = null, identifier = null) {
  return Boolean(snared && identifier && (snared.boonFor ?? []).includes(identifier));
}

/** The Hunting Ground a creature holds now (its own laid effect), or null. */
export function huntingGroundOf(effects = []) {
  for (const e of effects ?? []) {
    const row = flagOf(e, HUNTING_FLAG);
    if (row?.centre && Number(row.feet) > 0) return row;
  }
  return null;
}

/** The Gaze of the Sightless a creature holds now, or null. */
export function gazeOf(effects = []) {
  for (const e of effects ?? []) {
    const row = flagOf(e, GAZE_FLAG);
    if (row?.centre && Number(row.feet) > 0) return row;
  }
  return null;
}

/**
 * **WHO HUNTER'S BRAND LETS SEE THIS CREATURE** (*A demon you brand cannot be invisible to you or hidden from
 * you*): the uuids of every hunter whose brand stands on it, where it is a demon.
 */
export function brandRevealsTo(effects = []) {
  const out = new Set();
  for (const e of effects ?? []) {
    const row = flagOf(e, BRAND_FLAG);
    if (row?.demon === true && typeof row.by === "string" && row.by) out.add(row.by);
  }
  return [...out].sort();
}

/**
 * **WHETHER AN ATTACKER SEES THROUGH THIS TARGET'S INVISIBILITY** (the roll dialog's `targetInvisible` and
 * `targetLesserInvisible` lines): the attacker is named in the target's `revealTo`.
 */
export function seesThrough(attackerUuid = null, revealTo = []) {
  return Boolean(attackerUuid && (revealTo ?? []).includes(attackerUuid));
}

/* ------------------------------------------------------------------ */
/*  The census                                                         */
/* ------------------------------------------------------------------ */

/**
 * **EVERY SPELL THE DEMON HUNTER MAY HOLD, THE DOORS THAT CARRY IT AND WHAT STAYS THE TABLE'S** (the plan's C53
 * to C58 and its door map). `doors` names the machinery: a descriptor the pack carries, or a door by name.
 * `table` is a clause the system has no document for; `reason` would be a door not built, and no row carries
 * one (the lead's completeness bar). `shared` marks the ten borrowed Fel spells, which cast exactly as the
 * Warlock casts them (`demon-hunter-scope.mjs#dhSpellCast` never loads a Demon Hunter door for them).
 */
export const DH_SPELL_AUTOMATION = Object.freeze({
  /* ---- 07 §15, tier 1 ---- */
  "hunters-brand": { doors: ["dh:brand", "dh:brandTrack", "dh:reveal"] },
  "searing-edge": { doors: ["dh:hitBonus", "dh:notCast"] },
  "gaze-of-the-sightless": { doors: ["dh:gaze", "dh:reveal"], table: "an illusion showing false is the GM's to show: no document records an illusion (07 §15's Gaze of the Sightless: \"illusions inside the area show as false to you and to each ally you choose\")" },
  "spellsunder": { doors: ["card:resist", "dh:pickSpell", "dh:endPicked"] },
  "immolation-aura": { doors: ["areaTick", "upkeep:energy", "dh:movesWithin", "dh:auraLight"] },
  "demon-spikes": { doors: ["applies:ap", "retaliation:melee"] },
  "agonizing-flames": { doors: ["tick:ramp", "dh:putOut"] },
  "call-the-glaives": { doors: ["dh:recall"] },
  /* ---- 07 §15, tier 2 ---- */
  "hellstrike": { doors: ["card:damage", "card:resist", "onFail:prone", "dh:leap"] },
  "siphon-the-weave": { doors: ["card:resist", "dh:pickSpell", "dh:endPicked", "dh:energy"] },
  "unnatural-agility": { doors: ["dh:agility", "dh:noOpportunity"] },
  "nether-snare": { doors: ["card:resist", "dh:snare", "dh:snareBoon", "dh:snareTeleport"], table: "passing through a portal is the GM's to refuse: a portal is the table's Region, and no door crosses one (07 §15's Nether Snare: \"cannot teleport, turn invisible or pass through a portal\")" },
  "eye-beam": { doors: ["card:damage", "card:resist", "onFail:scorched", "dh:scorched"] },
  "flame-crash": { doors: ["areaTick", "dh:throw", "dh:region", "dh:awayRefused", "dh:pickUp"] },
  /* ---- 07 §15, tier 3 ---- */
  "hunting-ground": { doors: ["upkeep:energy", "dh:hunting", "dh:huntingGround", "dh:noOpportunity", "dh:reveal"] },
  "devour-the-spell": { doors: ["card:resist", "dh:devourTurn", "dh:endPicked", "dh:hatred"] },
  "glaive-tempest": { doors: ["dh:tempest", "dh:hitBonus", "dh:notCast"] },
  "shear": { doors: ["card:resist", "dh:shear"] },
  "draw-soul": { doors: ["card:damage", "card:resist", "dh:drawHeal", "dh:notHealed"] },
  "inner-demon": { doors: ["card:resist", "onFail:entangled+frightened", "escape:turnEnd", "dh:torment", "dh:notCast"] },
  /* ---- the ten Fel spells the Demon Hunter borrows: the Warlock's own doors, unchanged ---- */
  "felstep": { doors: ["applies:effect", "upkeep:energy"], shared: true },
  "fel-armor": { doors: ["applies:effect"], shared: true },
  "banish": { doors: ["card:resist", "applies:effect"], shared: true },
  "soulchains": { doors: ["card:damage", "card:resist", "onFail:entangled"], shared: true },
  "hellquake": { doors: ["card:damage", "card:resist", "onFail:stunned"], shared: true },
  "demonhide": { doors: ["applies:effect"], shared: true },
  "nether-ward": { doors: ["applies:effect"], shared: true },
  "rend-the-veil": { doors: ["applies:effect"], shared: true },
  "demonheart": { doors: ["applies:effect"], shared: true },
  "chaosbrand": { doors: ["tick:damage"], shared: true }
});

/** How many spells leave a clause to the table (Gaze's illusions, Nether Snare's portal): a ceiling that may only fall. */
export const DH_SPELL_TABLE_CEILING = 2;

/** How many spells carry a reason for a door not built: none, a ceiling that may only fall. */
export const DH_SPELL_REASON_CEILING = 0;

/**
 * **A DESCRIPTOR DOOR**: a label the pack's own descriptor proves (`demon-hunter-spells.test.mjs` reads the
 * spell's YAML for it), and the generic card or area door every spell rides.
 */
export const DH_DESCRIPTOR_PREFIXES = Object.freeze(["card:damage", "card:resist", "onFail:", "areaTick", "applies:", "tick:", "escape:turnEnd", "upkeep:energy", "retaliation:melee"]);

/**
 * **WHERE EVERY OTHER DOOR IS CALLED**: a label a row names that no descriptor proves, with the call sites that
 * carry it - each `{file, fn, contains}` a fragment the census finds INSIDE the named function of that file,
 * comments blanked, so a label is a caller (D-1098's shape).
 */
const FX = "module/effects/demon-hunter-spells.mjs";
const WF = "module/dice/workflows.mjs";
const CHAT = "module/dice/chat.mjs";
const ACTOR = "module/documents/actor.mjs";
const COMBAT = "module/documents/combat.mjs";
const CHARDATA = "module/data/actor/character.mjs";
const ACTIONS = "module/applications/actions.mjs";
const DIALOG = "module/applications/roll-dialog.mjs";
const TICKS = "module/rules/area-ticks.mjs";
const SIGHT = "module/effects/demon-hunter-sight.mjs";
const DEVOUR = "module/effects/devour-the-spell-reaction.mjs";
export const DH_SPELL_DOORS = Object.freeze({
  "dh:brand": [
    { file: FX, fn: "judgeDhSpell", contains: "const brand = readBrand(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "if (plan.brand) lines.push(...await brandLands(" },
    // The effect built in one place for this client and the GM's (the review's C5).
    { file: FX, fn: "brandEffectData", contains: "[BRAND_FLAG]: {" },
    { file: FX, fn: "brandLands", contains: "brandEffectData(actor, spell, who, { cast })" }
  ],
  "dh:brandTrack": [
    { file: FX, fn: "dhCardPress", contains: "if (press === \"track\")" },
    { file: FX, fn: "trackBrand", contains: "brandReading({" }
  ],
  "dh:reveal": [
    { file: SIGHT, fn: "dhRevealTo", contains: "brandRevealsTo(" },
    // Read once a refresh (the review's L10): `revealedToUser` keeps the answer `revealedNow` reads off the board.
    { file: SIGHT, fn: "revealedNow", contains: "const seers = dhRevealTo(doc.actor, doc);" },
    { file: SIGHT, fn: "revealedToUser", contains: "revealedNow(doc, user)" },
    { file: SIGHT, fn: "registerHunterSight", contains: "if (present && statusId === CONFIG.specialStatusEffects.INVISIBLE && revealedToUser(this)) return false;" },
    { file: DIALOG, fn: "targetSnapshots", contains: "revealTo: dhRevealTo(actor, token)," },
    { file: DIALOG, fn: "snapshotOf", contains: "!seesThrough(actor?.uuid ?? null, targets[0]?.revealTo ?? [])" }
  ],
  "dh:hitBonus": [
    { file: FX, fn: "dhSpellAfterCast", contains: "const hit = readHitBonus(sys.effect);" },
    { file: FX, fn: "hitBonusChanges", contains: "system.damageBonus.typed.attack." }
  ],
  "dh:notCast": [
    { file: TICKS, fn: "castDealsDamage", contains: "if (dhDamageNotCast(sys)) return false;" }
  ],
  "dh:notHealed": [
    { file: TICKS, fn: "castHeals", contains: "if (dhHealNotCast(sys)) return false;" }
  ],
  "dh:gaze": [
    { file: FX, fn: "judgeDhSpell", contains: "const gaze = readGaze(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "[GAZE_FLAG]: {" }
  ],
  "dh:pickSpell": [
    { file: FX, fn: "judgeDhSpell", contains: "const picked = await pickSpellToEnd(" },
    { file: FX, fn: "pickSpellToEnd", contains: "spellCandidates(rows, { maxTier })" },
    { file: FX, fn: "pickSpellToEnd", contains: "dispelJudgement(e, { archmage, held: Object.keys(sustains) })" }
  ],
  // 07's Devour the Spell at a creature's turn start (D-1717, D-1726): the turn's own gate, before its upkeep.
  "dh:devourTurn": [
    { file: COMBAT, fn: "_onStartTurn", contains: "await devourTurnStart(this, combatant);" },
    { file: WF, fn: "castSpell", contains: "devourClaim" },
    { file: DEVOUR, fn: "devourTurnStart", contains: "devourTurnRefusal({" },
    { file: DEVOUR, fn: "devourTurnStart", contains: "judgeHeldCast({ by: creature.uuid }, { archmage })" },
    { file: DEVOUR, fn: "devourCast", contains: "castSpell({ ...options, devourClaim: claim })" },
    { file: DEVOUR, fn: "devourWindow", contains: "devourClaimHolds({" },
    { file: FX, fn: "judgeDhSpell", contains: "const picked = devourClaim ? await devourPicked(devourClaim) : null;" }
  ],
  "dh:endPicked": [
    { file: FX, fn: "dhSpellAfterResist", contains: "await endPickedSpell(" },
    { file: FX, fn: "dhSpellAfterCast", contains: "await endPickedSpell(" },
    { file: FX, fn: "endHere", contains: "await game.system.azeroth.workflows.endSustain({" },
    { file: CHAT, fn: "rollResists", contains: "await dhSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" },
    { file: DEVOUR, fn: "devourTest", contains: "kind: \"devour\"" }
  ],
  "dh:energy": [
    { file: FX, fn: "endPickedSpell", contains: "siphonEnergy(" },
    { file: FX, fn: "regainEnergy", contains: "poolWrite(caster, async () => {" }
  ],
  "dh:hatred": [
    { file: FX, fn: "endPickedSpell", contains: "devourHatred(" },
    { file: FX, fn: "gainHatred", contains: "{ options: { hatredGain: \"devour\" } }" },
    // Devour's failure, rolled in flight on the GM's client (D-1726): the end and the Hatred through `endPickedSpell`.
    { file: DEVOUR, fn: "devourTest", contains: "await endPickedSpell({" }
  ],
  "dh:movesWithin": [
    { file: FX, fn: "immolationOnMove", contains: "movesWithin({" },
    { file: FX, fn: "registerDemonHunterSpellHooks", contains: "Hooks.on(\"moveToken\"" },
    { file: FX, fn: "immolationOnMove", contains: "await strikeFromArea({" }
  ],
  "dh:auraLight": [
    { file: FX, fn: "dhSpellAfterCast", contains: "const light = readAuraLight(sys.effect);" },
    { file: FX, fn: "auraLightLands", contains: "${AURA_LIGHT_FLAG}`]: held" },
    { file: FX, fn: "restoreAuraLight", contains: "light: held" },
    { file: FX, fn: "registerDemonHunterSpellHooks", contains: "restoreAuraLight(actor)" }
  ],
  "dh:putOut": [
    { file: FX, fn: "offerPutOut", contains: "press: \"putOut\"" },
    { file: FX, fn: "dhCardPress", contains: "if (press === \"putOut\")" },
    { file: FX, fn: "putOutFlames", contains: "spendTurnBudget(" }
  ],
  "dh:recall": [
    { file: FX, fn: "judgeDhSpell", contains: "const recall = readRecall(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "if (plan.recall) lines.push(...await recallLands(" },
    { file: FX, fn: "recallLands", contains: "[AWAY_FLAG]: new foundry.data.operators.ForcedDeletion()" }
  ],
  "dh:leap": [
    { file: FX, fn: "judgeDhSpell", contains: "const leap = readLeap(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "await stepTo({" }
  ],
  "dh:agility": [
    { file: FX, fn: "dhSpellAfterCast", contains: "const agility = readAgility(sys.effect);" },
    { file: CHARDATA, fn: "prepareDerivedData", contains: "...agilityBanesOn(this.parent?.effects ?? [])" }
  ],
  "dh:noOpportunity": [
    { file: COMBAT, fn: "opportunities", contains: "if (dhSparesOpportunity(this.actor, mover, pathPoints(movement))) return [];" }
  ],
  "dh:snare": [
    { file: FX, fn: "dhSpellAfterResist", contains: "const snare = readSnare(effect);" },
    { file: FX, fn: "dhSpellAfterResist", contains: "[SNARE_FLAG]: {" }
  ],
  "dh:snareBoon": [
    { file: DIALOG, fn: "prepareRoll", contains: "snareBoon(targets[0]?.netherSnared ?? null, spec.spell?.system?.identifier ?? null)" },
    { file: DIALOG, fn: "targetSnapshots", contains: "netherSnared: snaredFrom(actor.effects ?? [])," }
  ],
  "dh:snareTeleport": [
    { file: COMBAT, fn: "onPreMoveToken", contains: "snaredFrom([...(document.actor?.effects ?? [])])" }
  ],
  "dh:scorched": [
    { file: FX, fn: "dhSpellAfterResist", contains: "const scorched = readScorchedValue(effect);" }
  ],
  "dh:throw": [
    { file: FX, fn: "judgeDhSpell", contains: "const crash = readFlameCrash(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "[`flags.${SCOPE}.${AWAY_FLAG}`]: {" }
  ],
  "dh:region": [
    { file: FX, fn: "dhSpellAfterCard", contains: "await placeCrash(" },
    { file: FX, fn: "placeCrashHere", contains: "regionFlagsFromCard(" },
    { file: WF, fn: "castSpell", contains: "await dhSpellAfterCard({" }
  ],
  // 07's *until you pick it up or cast Call the Glaives* (the review's C4): the Combat tab's Pick up, judged within 5
  // feet of where the glaive lies, and a glaive put away no longer lying on the board.
  "dh:pickUp": [
    { file: "module/effects/demon-hunter-features.mjs", fn: "pickUpGlaive", contains: "pickUpRefusal({" },
    { file: "module/effects/demon-hunter-features.mjs", fn: "registerDemonHunterFeatures", contains: "Hooks.on(\"updateItem\"" }
  ],
  "dh:awayRefused": [
    { file: ACTOR, fn: "readyWeapons", contains: "!glaiveAway(i)" },
    { file: ACTIONS, fn: "attackWithDialog", contains: "const away = awayRefusal(weapon);" }
  ],
  "dh:hunting": [
    { file: FX, fn: "dhSpellAfterCast", contains: "const hunting = readHuntingGround(sys.effect);" },
    { file: FX, fn: "dhSpellAfterCast", contains: "[HUNTING_FLAG]: {" }
  ],
  "dh:huntingGround": [
    { file: "module/canvas/behaviors.mjs", fn: "getMovementCostFunction", contains: "huntingGroundFree(token, to, hunting)" },
    { file: SIGHT, fn: "huntingGroundFree", contains: "insideCircle(point, row.centre, row.centre.radius)" }
  ],
  "dh:tempest": [
    { file: FX, fn: "judgeDhSpell", contains: "if (readTempest(sys.effect)) {" },
    { file: FX, fn: "dhSpellAfterCard", contains: "await tempestStrikes(" },
    { file: FX, fn: "tempestStrikes", contains: "await attackWithDialog(actor, weapon, null, {" }
  ],
  "dh:shear": [
    { file: FX, fn: "dhSpellAfterResist", contains: "const shear = readShear(effect);" },
    { file: FX, fn: "dhSpellAfterResist", contains: "key: \"system.health.max\"" }
  ],
  "dh:drawHeal": [
    { file: FX, fn: "dhSpellAfterResist", contains: "const drawHeal = readDrawHeal(effect);" },
    { file: FX, fn: "healCaster", contains: "await caster.applyHealing?.(" }
  ],
  "dh:torment": [
    { file: FX, fn: "dhSpellAfterResist", contains: "const torment = readTorment(effect);" },
    { file: FX, fn: "dhSpellAfterResist", contains: "tormentTick(torment, {" },
    { file: FX, fn: "registerDemonHunterSpellHooks", contains: "Hooks.on(\"deleteActiveEffect\"" }
  ]
});
