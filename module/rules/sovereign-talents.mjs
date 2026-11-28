/**
 * **THE SOVEREIGN'S FEATURES AND THIRTY-SIX TALENTS, AS LAW** (02 §7's *Features by level*; 04-TALENTS'
 * Dominion, Vainglorious and Ravenous; the San'layn and Sovereign plan's B.8, B.9, B.11 and Phase 5).
 * Pure: no Foundry imports (CLAUDE.md §3). The doors are `effects/sovereign-features.mjs`; the pool,
 * feeding, prey and Tribute doors are CORE's (`effects/sovereign-core.mjs`), the claws WEAPON's
 * (`rules/claws.mjs`, `rules/claw-hit.mjs`).
 *
 * Every number 02 and 04 print for a feature or a talent is held ONCE here, in a constant named for it,
 * and `sovereign-talents.test.mjs` reads every one of them back off the chapters' own text at every rank.
 * Every judgement is asked BEFORE the budget and the payment (D-768's order) and asked again where the
 * write lands.
 */

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The class every row here is keyed under. */
export const SOV_CLASS = "Sovereign";

/* ------------------------------------------------------------------ */
/*  02 §7's features, each number in one place                          */
/* ------------------------------------------------------------------ */

/** *Once on each of your turns, mark one creature you can see within 60 feet as your prey.* (CORE's `prey.mjs` holds the mark.) */
export const HUNT_MORTAL = Object.freeze({ feature: "Hunt Mortal", feet: 60 });
/** *Once per encounter, as a Half-Action, spend any amount of Tribute. You gain temporary Health equal to twice the Tribute you spend.* */
export const PRIM_AND_PROPER = Object.freeze({ feature: "Prim and Proper", level: 3, perTribute: 2, per: "encounter" });
/** *Once a turn ... you may spend 2 Tribute. ... Shadow damage equal to half your Charisma modifier, rounded down, and at least 1. You regain Health equal to that additional damage.* */
export const ROYAL_DUE = Object.freeze({ feature: "Royal Due", tribute: 2, crownedTribute: 1, type: "shadow", min: 1, mark: "royal-due" });
/** *You know the direction and rough distance to your prey while it is within 1 mile of you.* */
export const UNENDING_PURSUIT = Object.freeze({ feature: "Unending Pursuit", feet: 5280 });
/** *Once per encounter, as a Half-Action, spend 2 Tribute. Each enemy Humanoid within 60 feet ... Spirit Resilience Test ... a Bane on attacks against any creature other than you.* */
export const LOOK_UPON_ME = Object.freeze({ feature: "Look Upon Me", tribute: 2, feet: 60, resilience: "spirit", type: "humanoid", banes: 1, per: "encounter" });
/** *As a Half-Action, spend 10 Vitae ... Spirit Resilience Test ... 1 minute ... Shadow damage equal to twice your tier ... a blood curse.* */
export const BLOOD_PRISON = Object.freeze({ feature: "Blood Prison", vitae: 10, resilience: "spirit", minutes: 1, type: "shadow", perTier: 2 });
/** *While your prey is within 60 feet of you, each of its weapon attacks deals 3 less damage. A Casting Test for a spell that targets you takes a Bane.* */
export const WITHERING_CONTEMPT = Object.freeze({ feature: "Withering Contempt", feet: 60, cut: 3, banes: 1 });
/** *Once per Long Rest, as a Half-Action, spend 25 Vitae. For 1 minute, your Tribute cap is doubled ... Royal Due costs 1 Tribute.* */
export const CROWNED_IN_BLOOD = Object.freeze({ feature: "Crowned in Blood", vitae: 25, minutes: 1, per: "long" });
/** The Blood Royal and Blood-Forged Claws are CORE's and WEAPON's doors; named here for the rows. */
export const BLOOD_ROYAL = Object.freeze({ feature: "The Blood Royal" });
export const BLOOD_FORGED_CLAWS = Object.freeze({ feature: "Blood-Forged Claws" });

/* ------------------------------------------------------------------ */
/*  04's talents, each number in one place                              */
/* ------------------------------------------------------------------ */

// Dominion
export const SOVEREIGN_WILL = Object.freeze({ identifier: "sovereign-will", name: "Sovereign Will", perRank: 1 });
export const HEAVY_TREAD = Object.freeze({ identifier: "heavy-tread", name: "Heavy Tread", perRank: 5 });
export const PRICE_OF_DEFIANCE = Object.freeze({ identifier: "price-of-defiance", name: "Price of Defiance", type: "shadow" });
export const LINGERING_DECREE = Object.freeze({ identifier: "lingering-decree", name: "Lingering Decree", condition: "slowed", baneRank: 2 });
export const UNWORTHY_HAND = Object.freeze({ identifier: "unworthy-hand", name: "Unworthy Hand", perRank: 1 });
export const HOMAGE = Object.freeze({ identifier: "homage", name: "Homage", gain: 1, mark: "homage" });
export const BOUND_TO_THE_COURT = Object.freeze({ identifier: "bound-to-the-court", name: "Bound to the Court", vitae: 6, feet: 60, leash: 30, resilience: "body", minutes: 1, slowedRank: 2 });
export const EXAMPLE_TO_OTHERS = Object.freeze({ identifier: "example-to-others", name: "Example to Others", radii: Object.freeze([15, 30]) });
export const NO_PARDON = Object.freeze({ identifier: "no-pardon", name: "No Pardon", condition: "frightened", damageRank: 2, chaMin: 1 });
export const KNEEL = Object.freeze({ identifier: "kneel", name: "Kneel", tribute: 3, resilience: "spirit", feet: 60, othersRank: 2, per: "encounter" });
export const GILDED_CAGE = Object.freeze({ identifier: "gilded-cage", name: "Gilded Cage", vitae: 6 });
export const ABJECT_OBEDIENCE = Object.freeze({ identifier: "abject-obedience", name: "Abject Obedience", vitae: 15, resilience: "spirit", minutes: 1, per: "long" });

// Vainglorious
export const GILDED_SKIN = Object.freeze({ identifier: "gilded-skin", name: "Gilded Skin", perRank: 1, needs: "Prim and Proper" });
export const BENEATH_ME = Object.freeze({ identifier: "beneath-me", name: "Beneath Me", gain: 1, mark: "beneath-me" });
export const EXQUISITE_TASTE = Object.freeze({ identifier: "exquisite-taste", name: "Exquisite Taste", add: 1 });
export const UNTOUCHABLE = Object.freeze({ identifier: "untouchable", name: "Untouchable", perRank: 1 });
export const ABOVE_SUCH_THINGS = Object.freeze({ identifier: "above-such-things", name: "Above Such Things", tribute: Object.freeze([2, 1]), mark: "above-such-things" });
export const OVERFLOWING_CUP = Object.freeze({ identifier: "overflowing-cup", name: "Overflowing Cup", perRank: 3 });
export const INSOLENCE_REPAID = Object.freeze({ identifier: "insolence-repaid", name: "Insolence Repaid", boons: 1, anyRank: 2 });
export const MIRRORED_SELF = Object.freeze({ identifier: "mirrored-self", name: "Mirrored Self", tribute: 3, feet: Object.freeze([15, 30]), per: "encounter" });
export const SERENE_DISDAIN = Object.freeze({ identifier: "serene-disdain", name: "Serene Disdain", immune: Object.freeze([Object.freeze(["frightened"]), Object.freeze(["frightened", "charmed"])]) });
export const TOO_BEAUTIFUL_TO_DIE = Object.freeze({ identifier: "too-beautiful-to-die", name: "Too Beautiful to Die", perTribute: Object.freeze([3, 4]), per: "long" });
export const UNMARRED = Object.freeze({ identifier: "unmarred", name: "Unmarred", gain: 1, mark: "unmarred" });
export const CRIMSON_THRONE = Object.freeze({ identifier: "the-crimson-throne", name: "The Crimson Throne", cap: 2, baneAt: 5, banes: 1 });

// Ravenous
export const BLOODED_CLAWS = Object.freeze({ identifier: "blooded-claws", name: "Blooded Claws", perRank: 1, type: "shadow", rollsRank: 3 });
export const SANGUINE_EDGE = Object.freeze({ identifier: "sanguine-edge", name: "Sanguine Edge", vitae: 2, type: "shadow", nextTurnRank: 2 });
export const TASTING_BITE = Object.freeze({ identifier: "tasting-bite", name: "Tasting Bite", tribute: 1, type: "shadow", needs: Object.freeze(["bleeding", "prone", "stunned"]) });
export const LATCH_ON = Object.freeze({ identifier: "latch-on", name: "Latch On", tribute: 1, type: "shadow" });
export const RAKING_CLAWS = Object.freeze({ identifier: "raking-claws", name: "Raking Claws", bleeding: Object.freeze([2, 3]), rollRank: 2 });
export const CRIMSON_FLOURISH = Object.freeze({ identifier: "crimson-flourish", name: "Crimson Flourish", boons: 1, discount: 2, floor: 1, discountRank: 2 });
export const DRINK_DEEP = Object.freeze({ identifier: "drink-deep", name: "Drink Deep", perRank: 1 });
export const BLOODLETTING = Object.freeze({ identifier: "bloodletting", name: "Bloodletting", vitae: 5, type: "shadow", keepsRank: 2 });
export const BLOOD_RUSH = Object.freeze({ identifier: "blood-rush", name: "Blood Rush", vitae: 4, feet: Object.freeze([30, 60]), per: "encounter" });
export const LAST_DRAUGHT = Object.freeze({ identifier: "last-draught", name: "Last Draught", factor: Object.freeze([0.5, 1]), mark: "last-draught", monarchFeet: 30 });
export const SWIFT_HUNGER = Object.freeze({ identifier: "swift-hunger", name: "Swift Hunger", surcharge: 3, mark: "swift-hunger" });
export const BLOOD_MONARCH = Object.freeze({ identifier: "blood-monarch", name: "Blood Monarch", vitae: 35, minutes: 1, flying: 240, per: "long", kind: "bloodQueen" });

/** Every talent constant, by identifier: the census the test walks. */
export const SOV_TALENTS = Object.freeze(Object.fromEntries([
  SOVEREIGN_WILL, HEAVY_TREAD, PRICE_OF_DEFIANCE, LINGERING_DECREE, UNWORTHY_HAND, HOMAGE, BOUND_TO_THE_COURT,
  EXAMPLE_TO_OTHERS, NO_PARDON, KNEEL, GILDED_CAGE, ABJECT_OBEDIENCE,
  GILDED_SKIN, BENEATH_ME, EXQUISITE_TASTE, UNTOUCHABLE, ABOVE_SUCH_THINGS, OVERFLOWING_CUP, INSOLENCE_REPAID,
  MIRRORED_SELF, SERENE_DISDAIN, TOO_BEAUTIFUL_TO_DIE, UNMARRED, CRIMSON_THRONE,
  BLOODED_CLAWS, SANGUINE_EDGE, TASTING_BITE, LATCH_ON, RAKING_CLAWS, CRIMSON_FLOURISH, DRINK_DEEP, BLOODLETTING,
  BLOOD_RUSH, LAST_DRAUGHT, SWIFT_HUNGER, BLOOD_MONARCH
].map(t => [t.identifier, t])));

/* ------------------------------------------------------------------ */
/*  Flags                                                               */
/* ------------------------------------------------------------------ */

/**
 * **THE BLOOD CURSE'S TAG** (02 §7, *Blood curses*): `flags.azeroth-rpg.bloodCurse` on the effect a blood
 * curse lays - `{by, source, repeat: {resilience, dc} | null, cast}`. A tag on that effect, not an extra
 * effect; every reader asks `cursedBy` over the creature's effects.
 */
export const BLOOD_CURSE_FLAG = "bloodCurse";
/** The leash's flag (the plan's C7): `{holder, feet, from, source}` on the leashed creature's effect. */
export const LEASH_FLAG = "leash";
/** Insolence Repaid's promise, on the Sovereign: `[{against, until, any, by}]`. */
export const INSOLENCE_FLAG = "insolence";
/** Sanguine Edge's span, on the Sovereign's effect: `{amount}`. */
export const SANGUINE_FLAG = "sanguineEdge";
/** Crimson Flourish's Boon promise rides `next-attack.mjs`; its discount the `nextSpell` flag. */
export const FLOURISH_SOURCE = "crimson-flourish";
/** Unfading Glory's hold (07; the SPELLS door lays the effect): `{tribute: true}` on the caster's effect. */
export const UNFADING_GLORY_FLAG = "unfadingGlory";
/** Look Upon Me's laid Bane group, so a second use replaces the first. */
export const LOOK_GROUP = "look-upon-me";

/* ------------------------------------------------------------------ */
/*  Ranks                                                               */
/* ------------------------------------------------------------------ */

/** A Sovereign talent's rank taken, by identifier, 0 where it is not. */
export function rankIn(talents = [], identifier) {
  const row = (talents ?? []).find(t => t?.identifier === identifier && (!t.className || t.className === SOV_CLASS));
  return whole(row?.taken);
}

/** Half the Charisma modifier, rounded down, never below 0 (R48's MY READING: a negative modifier adds nothing). */
export const halfCha = cha => Math.max(0, Math.floor(int(cha) / 2));

/* ------------------------------------------------------------------ */
/*  The features                                                        */
/* ------------------------------------------------------------------ */

/**
 * **PRIM AND PROPER'S TEMPORARY HEALTH** (02 §7 and 04's Gilded Skin): twice the Tribute spent, plus 1 a
 * Gilded Skin rank. Nothing for no Tribute (a spend of nothing gives nothing).
 */
export function primTemp({ spent = 0, gildedSkin = 0 } = {}) {
  const t = whole(spent);
  if (!t) return 0;
  return t * PRIM_AND_PROPER.perTribute + whole(gildedSkin) * GILDED_SKIN.perRank;
}

/** **ROYAL DUE'S PRICE**: 2 Tribute, 1 while Crowned in Blood stands. */
export const royalDueCost = (crowned = false, set = null) => {
  const base = crowned ? ROYAL_DUE.crownedTribute : ROYAL_DUE.tribute;
  // **A PRICE A WORN ITEM SETS** (the Darkfallen Choker: *Royal Due costs a Sovereign wearing it 1
  // Tribute*; D-2156): the lower of the two, never a raise (`rules/item-patches.mjs#itemPatchedCost`).
  return Number.isInteger(set) && set >= 0 && set < base ? set : base;
};

/** **ROYAL DUE'S DAMAGE**: half the Charisma modifier, rounded down, and at least 1 (B.13 Q33). */
export const royalDueAmount = cha => Math.max(ROYAL_DUE.min, halfCha(cha));

/**
 * **WHETHER ROYAL DUE IS OFFERED** on a blow: the feature held, the struck creature the prey and still
 * standing, the turn's once not spent, the Tribute there. Words for each refusal, or null.
 */
export function royalDueRefusal({ holds = false, isPrey = false, used = false, tribute = 0, crowned = false, dealt = 0, set = null } = {}) {
  if (!holds) return "notHeld";
  if (!isPrey) return "notPrey";
  if (!(whole(dealt) > 0)) return "noDamage";
  if (used) return "used";
  if (whole(tribute) < royalDueCost(crowned, set)) return "tribute";
  return null;
}

/** **WHO LOOK UPON ME ASKS** (02 §7, R25): an enemy, a Humanoid (a character's people are all humanoid), within 60 feet. */
export function lookUponMeAsks({ enemy = false, type = null, character = false, feet = null } = {}) {
  if (!enemy) return false;
  if (!(character || String(type ?? "").toLowerCase() === LOOK_UPON_ME.type)) return false;
  return feet !== null && Number(feet) <= LOOK_UPON_ME.feet;
}

/** **BLOOD PRISON'S DAMAGE** at a turn's end it moved: twice the tier, plus the Charisma modifier with Gilded Cage (04: *twice your tier plus your Charisma modifier*). */
export function bloodPrisonDamage({ tier = 1, cha = 0, gildedCage = false } = {}) {
  const base = BLOOD_PRISON.perTier * tierOf(tier);
  return gildedCage ? Math.max(0, base + int(cha)) : base;
}

/** **BLOOD PRISON'S PRICE**: 10 Vitae, 6 with Gilded Cage. */
export const bloodPrisonCost = (gildedCage = false) => (gildedCage ? GILDED_CAGE.vitae : BLOOD_PRISON.vitae);

/**
 * **WHETHER A CREATURE MOVED ON ITS OWN SPEED THIS TURN** (C10): a step of the turn's movement history (core's
 * waypoints after the first) that is not a displacement and not an intermediate waypoint, and that covers
 * ground where it says how much.
 */
export function movedOnOwnSpeed(steps = []) {
  return (steps ?? []).some(s => s && s.action !== "displace" && s.intermediate !== true
    && (s.feet === undefined && s.distance === undefined ? true : Number(s.feet ?? s.distance ?? 0) > 0));
}

/* ------------------------------------------------------------------ */
/*  The attacker-keyed reduction (C11)                                  */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A WEAPON ATTACK LOSES TO A SOVEREIGN'S CONTEMPT AND A BLOOD CURSE** (02 §7's Withering Contempt,
 * 04's Unworthy Hand; R27, R31): 3 where the attacker is the prey of a Sovereign holding Withering
 * Contempt within 60 feet of it, and 1 a rank of each Sovereign's Unworthy Hand whose blood curse the
 * attacker is under. Weapon attacks alone: a spell, a tick, a breath and a hazard lose nothing.
 *
 * @param {{weapon?: boolean, contempt?: Array<{feet: number|null}>, unworthy?: number[]}} o
 *   `contempt` one row a Sovereign whose prey the attacker is and who holds the feature; `unworthy` the
 *   Unworthy Hand rank of each Sovereign whose curse the attacker is under
 * @returns {{cut: number, contempt: number, unworthy: number}}
 */
export function attackerCut({ weapon = false, contempt = [], unworthy = [] } = {}) {
  if (!weapon) return { cut: 0, contempt: 0, unworthy: 0 };
  const c = (contempt ?? []).some(r => r && r.feet !== null && r.feet !== undefined && Number(r.feet) <= WITHERING_CONTEMPT.feet) ? WITHERING_CONTEMPT.cut : 0;
  const u = (unworthy ?? []).reduce((n, r) => n + whole(r) * UNWORTHY_HAND.perRank, 0);
  return { cut: c + u, contempt: c, unworthy: u };
}

/** Whether a blow is a weapon attack for C11 and the Throne's Bane: an attack that is no spell, breath or tick. */
export const isWeaponBlow = ({ attack = false, spell = false, breath = false, ignite = false, struck = true } = {}) =>
  Boolean(attack && struck && !spell && !breath && !ignite);

/* ------------------------------------------------------------------ */
/*  Blood curses                                                        */
/* ------------------------------------------------------------------ */

/**
 * A blood curse tag, cleaned, or null. **ONE SHAPE WITH THE SPELLS' DOOR** (`rules/sovereign-spells.mjs
 * #bloodCurseRecord`): `{source: <caster uuid>, spell, identifier, cast}` - `source` is whose curse it is. A
 * curse with a repeated Test rides 07's escape record of the `curse` kind (`rules/escapes.mjs#CURSE_ESCAPE`)
 * beside the tag, and the escape door ends it.
 */
export function cleanBloodCurse(raw) {
  if (!raw || typeof raw !== "object") return null;
  const by = typeof raw.source === "string" && raw.source ? raw.source : (typeof raw.by === "string" && raw.by ? raw.by : null);
  if (!by) return null;
  return { by, source: typeof raw.spell === "string" ? raw.spell : "", identifier: typeof raw.identifier === "string" && raw.identifier ? raw.identifier : null, cast: typeof raw.cast === "string" && raw.cast ? raw.cast : null };
}

/** The blood curses on a creature's effects (plain), active ones only, sorted by id. */
export function cursesOn(effects = []) {
  const out = [];
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const curse = cleanBloodCurse(e.flags?.["azeroth-rpg"]?.[BLOOD_CURSE_FLAG]);
    if (curse) out.push({ id: String(e.id ?? ""), ...curse });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The Sovereigns (by uuid) whose blood curse a creature is under. */
export const cursedBy = (effects = []) => [...new Set(cursesOn(effects).map(c => c.by))].sort();

/** **SOVEREIGN WILL'S PENALTY** on the repeat, laid as DC: the Test's −1 a rank (d20 + mod − p against DC is d20 + mod against DC + p). */
export const sovereignWillPenalty = rank => whole(rank) * SOVEREIGN_WILL.perRank;

/**
 * **PRICE OF DEFIANCE'S DAMAGE**: the tier; with No Pardon at rank 2, the tier plus half the Charisma
 * modifier, rounded down and at least 1 (04, B.13 Q38's (b); the plan's R34 reading, as Royal Due's, D-1332).
 */
export function priceOfDefiance({ tier = 1, cha = 0, noPardon = 0 } = {}) {
  const t = tierOf(tier);
  return whole(noPardon) >= NO_PARDON.damageRank ? t + Math.max(NO_PARDON.chaMin, halfCha(cha)) : t;
}

/** **WHAT A SUCCESSFUL REPEAT LEAVES** (04's Price of Defiance, Lingering Decree, No Pardon): the lines to land. */
export function afterCurseEnded({ price = 0, lingering = 0, noPardon = 0, tier = 1, cha = 0 } = {}) {
  return {
    damage: whole(price) > 0 ? priceOfDefiance({ tier, cha, noPardon }) : 0,
    slowed: whole(lingering) > 0,
    attackBane: whole(lingering) >= LINGERING_DECREE.baneRank,
    frightened: whole(noPardon) > 0
  };
}

/** **HOMAGE'S ROUND** (04): once a round, twice at rank 2; the round's marks hold the count. */
export function homageGain({ rank = 0, isPrey = false, used = 0 } = {}) {
  const r = whole(rank);
  if (!r || isPrey) return 0;
  return whole(used) < Math.min(2, r) ? HOMAGE.gain : 0;
}

/** **HEAVY TREAD'S DROP**, stamped on the curse's own effect at the lay: 5 feet a rank. */
export const heavyTreadFeet = rank => whole(rank) * HEAVY_TREAD.perRank;

/** **EXAMPLE TO OTHERS' RADIUS**: 15 feet, 30 at rank 2. */
export const exampleRadius = rank => (whole(rank) >= 2 ? EXAMPLE_TO_OTHERS.radii[1] : (whole(rank) >= 1 ? EXAMPLE_TO_OTHERS.radii[0] : 0));

/** **ABJECT OBEDIENCE'S TARGET** (04): the prey, under the blood curse, no Boss, of the tier or lower. */
export function obedienceRefusal({ isPrey = false, cursed = false, boss = false, tier = 1, myTier = 1 } = {}) {
  if (!isPrey) return "notPrey";
  if (!cursed) return "notCursed";
  if (boss) return "boss";
  if (tierOf(tier) > tierOf(myTier)) return "tier";
  return null;
}

/** **KNEEL'S TARGETS**: the prey, and at rank 2 every other creature under the curse within 60 feet; only the prey is Stunned. */
export function kneelLays({ prey = false, rank = 1 } = {}) {
  if (prey) return ["prone", "stunned"];
  return whole(rank) >= KNEEL.othersRank ? ["prone"] : [];
}

/* ------------------------------------------------------------------ */
/*  Vainglorious                                                        */
/* ------------------------------------------------------------------ */

/** **UNTOUCHABLE'S DEFENSE**: 1 a rank while any temporary Health stands. */
export const untouchableDefense = ({ rank = 0, temp = 0 } = {}) => (whole(temp) > 0 ? whole(rank) * UNTOUCHABLE.perRank : 0);

/** **SERENE DISDAIN'S REFUSALS**: Frightened at 1 or more Tribute, Charmed too at rank 2. */
export function sereneImmune({ rank = 0, tribute = 0 } = {}) {
  const r = whole(rank);
  if (!r || whole(tribute) < 1) return [];
  return [...SERENE_DISDAIN.immune[Math.min(2, r) - 1]];
}

/** **ABOVE SUCH THINGS' PRICE**: 2 Tribute, 1 at rank 2. */
export const aboveCost = rank => ABOVE_SUCH_THINGS.tribute[Math.min(2, Math.max(1, whole(rank))) - 1];

/**
 * **A CONDITION A RESILIENCE TEST COULD HAVE PREVENTED** (04's Above Such Things; the plan's C12): one laid
 * with a Test behind it - an escape record, a curse, a spell's Resist - and never a Critical Injury's
 * condition. Read off the effect's own flags.
 */
export function testPrevented(effect = {}) {
  const f = effect?.flags?.["azeroth-rpg"] ?? {};
  if (f.critical || f.criticalInjury || f.injury) return false;
  return Boolean(f.escape || f[BLOOD_CURSE_FLAG] || f.resisted || f.laidBy || f.resist || f.tick?.resist || f.affliction);
}

/** **OVERFLOWING CUP'S TEMPORARY HEALTH**: what the restore would put above the maximum, up to 3 a rank plus the Charisma modifier. */
export function overflowTemp({ over = 0, rank = 0, cha = 0 } = {}) {
  const r = whole(rank);
  if (!r) return 0;
  return Math.min(whole(over), Math.max(0, r * OVERFLOWING_CUP.perRank + int(cha)));
}

/** **TOO BEAUTIFUL TO DIE**: held at 1 for all the Tribute (at least 1), 3 temporary Health each (4 at rank 2). */
export function tooBeautiful({ rank = 0, tribute = 0, usesLeft = 0, before = 0, amount = 0 } = {}) {
  const r = whole(rank);
  const t = whole(tribute);
  if (!r || t < 1 || whole(usesLeft) < 1) return null;
  if (!(whole(before) > 0 && whole(amount) >= whole(before))) return null;
  return { amount: Math.max(0, whole(before) - 1), spent: t, temp: t * TOO_BEAUTIFUL_TO_DIE.perTribute[Math.min(2, r) - 1] };
}

/** **BENEATH ME'S ROUND**: once a round, twice at rank 2, no limit with the Throne. */
export function beneathGain({ rank = 0, used = 0, throne = false } = {}) {
  const r = whole(rank);
  if (!r) return 0;
  if (throne) return BENEATH_ME.gain;
  return whole(used) < Math.min(2, r) ? BENEATH_ME.gain : 0;
}

/** **UNMARRED**: once a round, no limit with the Throne; only a blow temporary Health took whole. */
export function unmarredGain({ held = false, used = 0, throne = false, absorbed = 0, reached = 0 } = {}) {
  if (!held || !(whole(absorbed) > 0) || whole(reached) > 0) return 0;
  return throne || whole(used) < 1 ? UNMARRED.gain : 0;
}

/** **THE CRIMSON THRONE'S BANE** on a weapon attack against its holder: at 5 Tribute or more. */
export const throneBane = ({ throne = false, tribute = 0, weapon = false } = {}) => (throne && weapon && whole(tribute) >= CRIMSON_THRONE.baneAt ? CRIMSON_THRONE.banes : 0);

/** **MIRRORED SELF'S STEP**: 15 feet, 30 at rank 2. */
export const mirroredFeet = rank => MIRRORED_SELF.feet[Math.min(2, Math.max(1, whole(rank))) - 1];

/* ------------------------------------------------------------------ */
/*  Ravenous                                                            */
/* ------------------------------------------------------------------ */

/** **BLOODED CLAWS' SHADOW**: 1 a rank on a claw hit. */
export const bloodedShadow = rank => whole(rank) * BLOODED_CLAWS.perRank;

/** **RAKING CLAWS' BLEEDING**: 2, 3 at rank 2, in place of the Bleed trait's 1; nothing without the talent. */
export const rakingBleeding = rank => (whole(rank) >= 1 ? RAKING_CLAWS.bleeding[Math.min(2, whole(rank)) - 1] : 0);

/** **SANGUINE EDGE'S SHADOW** on a weapon or claw hit: the tier. */
export const sanguineAmount = tier => tierOf(tier);

/** **TASTING BITE**: the tier as Shadow, half of it (rounded down) as temporary Health; refused on a standing, unbleeding target. */
export function tastingBite({ tier = 1, statuses = [] } = {}) {
  const s = new Set(statuses ?? []);
  if (!TASTING_BITE.needs.some(c => s.has(c))) return null;
  const damage = tierOf(tier);
  return { damage, temp: Math.floor(damage / 2) };
}

/** **LATCH ON'S TICK**: the tier, plus half the Charisma modifier at rank 2. */
export const latchTick = ({ tier = 1, cha = 0, rank = 1 } = {}) => tierOf(tier) + (whole(rank) >= 2 ? halfCha(cha) : 0);

/** **BLOODLETTING**: each Bleeding enemy in reach takes its Bleeding value plus the tier; half the total as temporary Health. */
export function bloodletting({ tier = 1, bleeding = [], rank = 1 } = {}) {
  const hits = (bleeding ?? []).filter(b => whole(b?.value) > 0).map(b => ({ ...b, damage: whole(b.value) + tierOf(tier) }));
  const total = hits.reduce((n, h) => n + h.damage, 0);
  return { hits, total, temp: Math.floor(total / 2), ends: whole(rank) < BLOODLETTING.keepsRank };
}

/** **BLOOD RUSH'S RANGE**: 30 feet, 60 at rank 2. */
export const bloodRushFeet = rank => BLOOD_RUSH.feet[Math.min(2, Math.max(1, whole(rank))) - 1];

/** **LAST DRAUGHT'S VITAE**: half (rank 1), all (rank 2). */
export const lastDraughtFactor = rank => LAST_DRAUGHT.factor[Math.min(2, Math.max(1, whole(rank))) - 1];

/**
 * **WHETHER LAST DRAUGHT OFFERS ITS FEEDING** (04): the talent held, the creature dead within reach (30
 * feet in the Blood Monarch form), Bleeding or under this Sovereign's curse, once a round (no limit in the
 * form), and a living creature with blood (judged again by the feeding door).
 */
export function lastDraughtRefusal({ rank = 0, feet = null, reach = 5, bleeding = false, cursed = false, used = false, monarch = false } = {}) {
  if (!whole(rank)) return "notHeld";
  if (!bleeding && !cursed) return "notMarked";
  const limit = monarch ? Math.max(reach, LAST_DRAUGHT.monarchFeet) : reach;
  if (feet === null || Number(feet) > limit) return "far";
  if (used && !monarch) return "used";
  return null;
}

/** **SWIFT HUNGER'S OFFER**: an action spell at one creature within reach, once a round; it costs 3 Vitae more. */
export function swiftHungerRefusal({ held = false, action = null, targets = 0, feet = null, reach = 5, used = false } = {}) {
  if (!held) return "notHeld";
  if (action !== "action") return "notAction";
  if (whole(targets) !== 1) return "oneTarget";
  if (feet === null || Number(feet) > reach) return "far";
  if (used) return "used";
  return null;
}

/** **THE BLOOD MONARCH'S SPELL PRICE**: half the Vitae, rounded up. */
export const monarchPrice = cost => Math.ceil(whole(cost) / 2);

/** **CRIMSON FLOURISH'S DISCOUNT**: 2 less Vitae, never below 1. */
export const flourishPrice = cost => Math.max(CRIMSON_FLOURISH.floor, whole(cost) - CRIMSON_FLOURISH.discount);

/* ------------------------------------------------------------------ */
/*  What the shared doors read synchronously                            */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A DRAIN ADDS** (04's Exquisite Taste and Overflowing Cup): a heal the Sovereign's own spell or
 * attack gave it by damaging a creature (`AzerothActor#applyHealing` with `from` the healer itself) - 1
 * more Health with Exquisite Taste, and what would land above the maximum kept as temporary Health with
 * Overflowing Cup, up to 3 a rank plus the Charisma modifier. Read at the one healing door.
 *
 * @returns {{healed: number, temp: number, by: string[]}}
 */
export function healExtra({ talents = [], cha = 0, before = 0, max = 0, healed = 0 } = {}) {
  const h = whole(healed);
  if (!h) return { healed: 0, temp: 0, by: [] };
  const exquisite = rankIn(talents, EXQUISITE_TASTE.identifier) > 0 ? EXQUISITE_TASTE.add : 0;
  const total = h + exquisite;
  const over = Math.max(0, whole(before) + total - whole(max));
  const temp = overflowTemp({ over, rank: rankIn(talents, OVERFLOWING_CUP.identifier), cha });
  const by = [...(exquisite ? [EXQUISITE_TASTE.name] : []), ...(temp ? [OVERFLOWING_CUP.name] : [])];
  return { healed: total, temp, by };
}

/**
 * **WHETHER A CREATURE'S TURN HAS ANY SOVEREIGN BUSINESS** (O-419's lesson: a dynamic import in a turn path
 * costs; a pure predicate guards it): a blood curse, a latch, a leash or a Latch On held by it.
 */
export function sovereignTurnDue(effects = [], { holdsLatch = false } = {}) {
  if (holdsLatch) return true;
  for (const e of effects ?? []) {
    const f = e?.flags?.["azeroth-rpg"] ?? {};
    if (f[BLOOD_CURSE_FLAG] || f.latch || f[LEASH_FLAG] || f.bloodPrison) return true;
  }
  return false;
}

/**
 * **WHAT A SOVEREIGN'S SPELL COSTS AFTER ITS OWN TALENTS** (04's Swift Hunger, Crimson Flourish and the
 * Blood Monarch form), in Vitae: Swift Hunger's 3 more where the cast takes its Half-Action, Crimson
 * Flourish's 2 less on a Half-Action Death spell after a hit this turn (never below 1), and the form's
 * half (rounded up), in that order.
 */
export function sovereignCastPrice({ cost = 0, swift = false, flourish = false, monarch = false } = {}) {
  let n = whole(cost) + (swift ? SWIFT_HUNGER.surcharge : 0);
  if (flourish && n > 0) n = flourishPrice(n);
  if (monarch) n = monarchPrice(n);
  return n;
}

/**
 * **WHETHER CRIMSON FLOURISH'S DISCOUNT STANDS** (04: *the next Death spell you cast as a Half-Action before the
 * end of your turn*): the flag a hit laid, on this fight's turn - or, out of a fight, within the round's six
 * seconds of the world's clock.
 */
export function flourishCurrent({ flag = null, fight = null, now = 0 } = {}) {
  if (!flag || typeof flag !== "object") return false;
  if (!fight?.id) return !flag.combat && Number(now) - (Number(flag.at) || 0) <= 6;
  return flag.combat === fight.id && flag.round === fight.round && flag.turn === fight.turn;
}

/** **THE BANES A SOVEREIGN TARGET LAYS ON A TEST AT IT**: the Throne's on a weapon attack, Withering Contempt's on a Casting Test. */
export function sovereignTargetBanes({ kind = "attack", throne = false, tribute = 0, contempt = false } = {}) {
  if (kind === "attack") return throneBane({ throne, tribute, weapon: true }) > 0 ? [{ banes: CRIMSON_THRONE.banes, source: CRIMSON_THRONE.name }] : [];
  if (kind === "casting") return contempt ? [{ banes: WITHERING_CONTEMPT.banes, source: WITHERING_CONTEMPT.feature }] : [];
  return [];
}

/** Withering Contempt's Bane on a Casting Test at its holder, as the character derives it (no roll is built here). */
export const sovereignCastBanes = ({ contempt = false } = {}) => (contempt ? [{ banes: WITHERING_CONTEMPT.banes, source: WITHERING_CONTEMPT.feature }] : []);

/**
 * **INSOLENCE REPAID'S BOON ON A TEST AT A CREATURE** (04): a promise laid by a miss, against that
 * creature alone, on an attack or a Casting Test - or any Test at rank 2 - before it ends.
 *
 * @param {Array<{against: string, any?: boolean, until?: number}>} held  the Sovereign's promises
 * @param {{target?: string|null, kind?: string, now?: number}} o  `now` in world seconds
 */
export function insolenceBoons(held = [], { target = null, kind = "attack", now = 0 } = {}) {
  if (!target) return 0;
  const live = (held ?? []).filter(p => p && p.against === target && !(Number(p.until) > 0 && Number(p.until) < Number(now)));
  return live.some(p => p.any === true || kind === "attack" || kind === "casting") ? INSOLENCE_REPAID.boons : 0;
}

/* ------------------------------------------------------------------ */
/*  The doors' census                                                   */
/* ------------------------------------------------------------------ */

/**
 * **EVERY FEATURE'S AND TALENT'S DOOR, BY THE FUNCTION THAT CALLS IT** (the knight's `DK_SPELL_DOORS`
 * shape, D-983): `{file, fn, call}` - `sovereign-talents.test.mjs` slices `file` to `fn` with the comments
 * blanked (`tools/strip-comments.mjs`) and fails a `call` the slice does not hold.
 */
const door = (file, fn, call) => Object.freeze({ file, fn, call });
const FX = "module/effects/sovereign-features.mjs";
const ACTOR = "module/documents/actor.mjs";
const CHAR = "module/data/actor/character.mjs";
const COMBAT = "module/documents/combat.mjs";
const WF = "module/dice/workflows.mjs";
const DIALOG = "module/applications/roll-dialog.mjs";
const LAW = "module/rules/sovereign-talents.mjs";
export const SOV_DOORS = Object.freeze({
  // Features
  "Hunt Mortal": [door(FX, "landSovereignUse", "markPrey(actor, plan.target")],
  "The Blood Royal": [door(FX, "judgeSovereignUse", "feedWithDialog(actor")],
  "Prim and Proper": [door(FX, "landSovereignUse", "primTemp({ spent")],
  "Royal Due": [door(ACTOR, "applyDamage", "offerRoyalDue("), door(FX, "offerRoyalDue", "royalDueRefusal("), door(FX, "landRoyalDue", "royalDueAmount(")],
  "Unending Pursuit": [door(FX, "landSovereignUse", "pursuitWords(")],
  "Look Upon Me": [door(FX, "judgeSovereignUse", "lookUponMeAsks("), door(FX, "sovereignAfterResist", "layBane({ victim: actor, kind: \"attack\"")],
  "Blood Prison": [door(FX, "sovereignAfterResist", "layBloodCurse("), door(COMBAT, "_onEndTurn", "sovereignTurnEnd("), door(FX, "sovereignTurnEnd", "bloodPrisonDamage(")],
  "Withering Contempt": [door(ACTOR, "applyDamage", "sovereignBlowCut("), door(FX, "sovereignBlowCut", "attackerCut("), door(CHAR, "prepareDerivedData", "sovereignCastBanes("), door(DIALOG, "castingTalentLines", "targetCastBanes")],
  "Crowned in Blood": [door(FX, "landSovereignUse", "crownedInBlood: true")],
  // Dominion
  "sovereign-will": [door(COMBAT, "_escapePrompts", "sovereignWillPenalty("), door(FX, "postCourtRepeats", "sovereignWillPenalty(")],
  "heavy-tread": [door(FX, "bloodCurseEffectData", "heavyTreadFeet(")],
  "price-of-defiance": [door(FX, "sovereignAfterResist", "curseThrownOff("), door(FX, "curseThrownOff", "afterCurseEnded(")],
  "lingering-decree": [door(FX, "curseThrownOff", "after.slowed")],
  "unworthy-hand": [door(FX, "sovereignBlowCut", "UNWORTHY_HAND.identifier")],
  "homage": [door(FX, "homageFor", "homageGain(")],
  "bound-to-the-court": [door(FX, "sovereignAfterResist", "LEASH_FLAG"), door(COMBAT, "onPreMoveToken", "leashRefusalFor(")],
  "example-to-others": [door(FX, "onSovereignDeath", "exampleRadius(")],
  "no-pardon": [door(FX, "curseThrownOff", "after.frightened")],
  "kneel": [door(FX, "sovereignAfterResist", "kneelLays(")],
  "gilded-cage": [door(FX, "sovereignTurnEnd", "gildedCage:")],
  "abject-obedience": [door(FX, "judgeSovereignUse", "obedienceRefusal("), door(FX, "sovereignAfterResist", "act: \"obey\""), door(FX, "sovereignFeaturesQueryHandler", "layObedience(")],
  // Vainglorious
  "gilded-skin": [door(FX, "landSovereignUse", "GILDED_SKIN.identifier"), door("module/rules/talents.mjs", "canTake", "FEATURE_GATES[talent.identifier]")],
  "beneath-me": [door(FX, "onAttackResolved", "beneathGain("), door(WF, "rollTest", "onAttackResolved(")],
  "exquisite-taste": [door(ACTOR, "applyHealing", "sovereignHealExtra(")],
  "untouchable": [door(CHAR, "prepareDerivedData", "untouchableDefense(")],
  "above-such-things": [door(FX, "judgeSovereignUse", "testPrevented(")],
  "overflowing-cup": [door(ACTOR, "applyHealing", "sovereignHealExtra("), door(LAW, "healExtra", "overflowTemp(")],
  "insolence-repaid": [door(FX, "sovereignFeaturesQueryHandler", "INSOLENCE_FLAG"), door(ACTOR, "insolenceBoons", "insolenceBoons(held,"), door(DIALOG, "castingTalentLines", "actor?.insolenceBoons?.("), door(DIALOG, "attackTalentLines", "actor?.insolenceBoons?.("), door(WF, "rollTest", "await takeInsolence(actor, againstUuid);")],
  "mirrored-self": [door(FX, "judgeSovereignUse", "mirroredFeet(")],
  "serene-disdain": [door(CHAR, "prepareDerivedData", "sereneImmune(")],
  "too-beautiful-to-die": [door(ACTOR, "_holdAtOne", "sovereignHold("), door(FX, "sovereignHold", "tooBeautiful(")],
  "unmarred": [door(ACTOR, "applyDamage", "sovereignAbsorbed("), door(FX, "sovereignAbsorbed", "unmarredGain(")],
  "the-crimson-throne": [door(CHAR, "prepareDerivedData", "sovereignTargetBanes({ kind: \"attack\""), door(DIALOG, "targetSnapshots", "sovDeterred: s.sovereignDeterred"), door(DIALOG, "attackTalentLines", "target?.sovDeterred")],
  // Ravenous
  "blooded-claws": [door(WF, "rollTest", "sovereignOnHit("), door(FX, "sovereignOnHit", "bloodedShadow(")],
  "sanguine-edge": [door(FX, "landSovereignUse", "laySanguine("), door(FX, "laySanguine", "system.damageBonus.typed.attack.shadow")],
  "tasting-bite": [door(FX, "onSovereignClawHit", "tastingBite("), door(FX, "landTastingBite", "strikeShadow(")],
  "latch-on": [door(FX, "landLatchOn", "layLatch("), door(WF, "rollTest", "holdsLatch(actor)"), door(COMBAT, "_onStartTurn", "sovereignTurnStart("), door(FX, "sovereignTurnStart", "latchTick(")],
  "raking-claws": [door(FX, "onSovereignClawHit", "rakingBleeding("), door(WF, "rollTest", "fired.findIndex(f => f?.key === \"bleed\")")],
  "crimson-flourish": [door(FX, "afterSovereignCast", "FLOURISH_SOURCE"), door(WF, "castSpell", "flourishCurrent(")],
  "drink-deep": [door("module/effects/sovereign-core.mjs", "feedVerdict", "drinkDeep: ranks(sovereign, \"Drink Deep\")")],
  "bloodletting": [door(FX, "landSovereignUse", "bloodletting(")],
  "blood-rush": [door(FX, "judgeSovereignUse", "bloodRushFeet(")],
  "last-draught": [door(FX, "onSovereignDeath", "lastDraughtRefusal("), door(FX, "landLastDraught", "lastDraughtFactor(")],
  "swift-hunger": [door(WF, "castSpell", "swiftHungerLine("), door(FX, "swiftHungerLine", "swiftHungerRefusal(")],
  "blood-monarch": [door(FX, "takeMonarch", "kind: BLOOD_MONARCH.kind"), door(FX, "onSovereignClawHit", "anyDay: true"), door(WF, "castSpell", "monarch: actor.shape?.kind === \"bloodQueen\"")]
});
