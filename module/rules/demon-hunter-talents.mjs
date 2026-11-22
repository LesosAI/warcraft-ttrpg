/**
 * **THE DEMON HUNTER'S THIRTY-SIX TALENTS, AS LAW** (04-TALENTS' Betrayer, Souleater and Sufferer; the Demon
 * Hunter plan's Phase 5, D-1560 to D-1569). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Every number 04 prints for a talent is held ONCE here, in a constant named for it, and
 * `demon-hunter-talents.test.mjs` reads every one of them back off the chapter's own text at every rank.
 * The rows are `talent-effects.mjs`' (`"demon-hunter"`); a talent that changes one of 02's class features
 * rides the `mod(...)` patch on its row, read through `class-talents.mjs#patchRowsOf` (D-773 to D-775), never
 * a sibling row. The doors are `effects/demon-hunter-talents.mjs` and the class features' own
 * (`effects/demon-hunter-features.mjs`), named function by function in `DH_TALENT_DOORS`, which the test
 * slices with the comments blanked.
 *
 * The lead's rulings this module carries (the plan's C-rows): C8 - *"Having a spell or feature prevent death
 * goes against this"*: no talent here holds the hunter above 0, and the C8 census in
 * `demon-hunter-features.test.mjs` reads this file. C28 - Betrayer's Bargain's hostility *is the GM's call*, a
 * line on the card. C34 - the Crystalized Soul, *if space allows*. C39, C40 - Feast of Souls' radius is 5 feet
 * a point of the Wisdom modifier. C46 - Refuse the Legion's radius is half the Wisdom modifier, at least 5 feet.
 * Q13 - Gift of the Skull may be used out of a fight.
 *
 * **WHICH FEL A NUMBER READS** is `hatred.mjs#felFor`'s (Embrace the Pain's 5 more is read there); nothing
 * here reads the track.
 */

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The class every row is keyed under, as 02 names it. */
export const DH_CLASS = "Demon Hunter";

/* ------------------------------------------------------------------ */
/*  Betrayer                                                            */
/* ------------------------------------------------------------------ */

/** *With a glaive in each hand, your Off-Hand Attack takes no −2 even if the weapon lacks Light. At rank 2, your Off-Hand Attack deals 1 more damage.* */
export const TWIN_BLADES = Object.freeze({ identifier: "twin-blades", name: "Twin Blades", wields: "glaiveEach", damageRank: 2, damage: 1 });
/** ***Fel Lash** deals 1 more damage per rank.* */
export const FEL_TEMPERED = Object.freeze({ identifier: "fel-tempered", name: "Fel-Tempered", perRank: 1 });
/** *You gain 1 Armor Point on your Body per rank, and +1 per rank on Intimidation Tests.* */
export const DEMONIC_VISAGE = Object.freeze({ identifier: "demonic-visage", name: "Demonic Visage", ap: 1, skill: "intimidation", perRank: 1 });
/** *Once per Short Rest per rank, as a free action, gain 1 Fel Corruption, with no Test. Your Hatred fills to your cap and you gain 3 Energy.* */
export const TASTE_OF_POWER = Object.freeze({ identifier: "taste-of-power", name: "Taste of Power", fel: 1, energy: 3, per: "short", source: "flows" });
/** *As a Half-Action, spend 4 Hatred. You take a demon's shape for your rank plus 1 rounds ... add 1 to your Damage Rating and ... 1 Armor Point on every location.* */
export const GIFT_OF_THE_SKULL = Object.freeze({ identifier: "gift-of-the-skull", name: "Gift of the Skull", hatred: 4, more: 1, damageRating: 1, ap: 1, kind: "skull" });
/** *Spectral Sight, Fel Lash and your Hatred cap treat your Fel Corruption as 5 higher than it is, to no more than 20.* (`hatred.mjs#felFor` reads it.) */
export const EMBRACE_THE_PAIN = Object.freeze({ identifier: "embrace-the-pain", name: "Embrace the Pain", step: 5, top: 20 });
/** *... you have wings whatever your Fel Corruption, and a flying Speed of 30 feet. At rank 2, it is 60 feet.* */
export const WINGS_OF_THE_BETRAYER = Object.freeze({ identifier: "wings-of-the-betrayer", name: "Wings of the Betrayer", feet: 30, rank2: 60 });
/** *... as a Half-Action, spend 3 Energy. One creature within 60 feet makes a Reflex Resilience Test ... Fel damage equal to 2 plus twice your rank ... half of that, rounded down.* */
export const CHAOS_BLAST = Object.freeze({ identifier: "chaos-blast", name: "Chaos Blast", energy: 3, feet: 60, base: 2, perRank: 2, resilience: "reflex", type: "fel" });
/** *When Fel Lash hits a demon or a creature that holds Mana, gain 1 Energy per rank.* */
export const FEED_ON_POWER = Object.freeze({ identifier: "feed-on-power", name: "Feed on Power", perRank: 1 });
/** ***Demon Unleashed** adds 1 more to your Damage Rating per rank and lasts 1 more round per rank.* */
export const ETERNAL_HUNGER = Object.freeze({ identifier: "eternal-hunger", name: "Eternal Hunger", damagePerRank: 1, roundsPerRank: 1 });
/** *... each creature within 5 feet of where you land makes a Body Resilience Test against your Spell DC. On a failure it takes Fel damage equal to your tier and falls Prone.* */
export const FALL_UPON_THEM = Object.freeze({ identifier: "fall-upon-them", name: "Fall Upon Them", feet: 5, resilience: "body", type: "fel", condition: "prone" });
/** *... make it last until you finish a Short Rest ... gain 5 Fel Corruption when it ends, with no Test.* */
export const BETRAYERS_BARGAIN = Object.freeze({ identifier: "betrayers-bargain", name: "Betrayer's Bargain", fel: 5 });

/* ------------------------------------------------------------------ */
/*  Souleater                                                           */
/* ------------------------------------------------------------------ */

/** *... within 5 feet of you, devour its soul and regain Health equal to your tier per rank ... A demon's soul gives you 2 Hatred through either feature.* */
export const SOUL_HUNGER = Object.freeze({ identifier: "soul-hunger", name: "Soul Hunger", feet: 5, demonHatred: 2 });
/** *While you wield a scythe in two hands, add 1 per rank to its Damage Rating, and Soul Hunger reaches ... 10 feet, with the scythe's Reach trait.* */
export const REAPERS_GRIP = Object.freeze({ identifier: "reapers-grip", name: "Reaper's Grip", perRank: 1, reach: 10, wields: "scytheTwoHands" });
/** *When Fel Lash hits, you regain 1 Health per rank.* */
export const GORGING_LASH = Object.freeze({ identifier: "gorging-lash", name: "Gorging Lash", perRank: 1 });
/** *... It becomes a Crystalized Soul ... As a free action, use one to regain the Health it would have restored, gain 3 Energy, or gain 2 Hatred.* */
export const HOARDED_SOUL = Object.freeze({ identifier: "hoarded-soul", name: "Hoarded Soul", item: "crystalized-soul", energy: 3, hatred: 2, flag: "crystalizedSoul" });
/** *... your next Fel Lash before the end of your next turn costs no Hatred and deals 1 more damage per rank.* */
export const DEMONS_DUE = Object.freeze({ identifier: "demons-due", name: "Demon's Due", perRank: 1, flag: "demonsDue" });
/** *... once a turn when your attack hits, one other enemy within your reach takes Shadow damage equal to half your Wisdom modifier, rounded down, and at least 1.* */
export const SWEEPING_ARC = Object.freeze({ identifier: "sweeping-arc", name: "Sweeping Arc", type: "shadow", min: 1, mark: "sweeping-arc", wields: "scytheTwoHands" });
/** *... you may make a Hunter's Leap without spending Energy or your Reaction. At rank 2, your next attack this turn gains a Boon.* */
export const KILL_AFTER_KILL = Object.freeze({ identifier: "kill-after-kill", name: "Kill After Kill", boonRank: 2, boons: 1 });
/** *Fel Lash against a creature below half its Health deals 1 more damage per rank.* */
export const TEAR_THE_SOUL = Object.freeze({ identifier: "tear-the-soul", name: "Tear the Soul", perRank: 1, below: 0.5 });
/** *... once a round when your attack hits a creature, it is Slowed until the end of its next turn.* */
export const HOBBLING_REAP = Object.freeze({ identifier: "hobbling-reap", name: "Hobbling Reap", condition: "slowed", mark: "hobbling-reap", wields: "scytheTwoHands" });
/** ***Devour Soul** reaches 20 feet further per rank, and once a round it costs no Reaction.* */
export const ENDLESS_APPETITE = Object.freeze({ identifier: "endless-appetite", name: "Endless Appetite", feetPerRank: 20, mark: "endless-appetite" });
/** *When you devour a creature that held Mana or a Power pool, gain 2 Hatred.* */
export const SWALLOW_THEIR_MAGIC = Object.freeze({ identifier: "swallow-their-magic", name: "Swallow Their Magic", hatred: 2 });
/** *... within 5 feet of you for each point of your Wisdom modifier ... Spirit Resilience Test ... Shadow damage equal to your Wisdom modifier. Gain 1 Hatred for each creature ...* */
export const FEAST_OF_SOULS = Object.freeze({ identifier: "feast-of-souls", name: "Feast of Souls", feetPerPoint: 5, resilience: "spirit", type: "shadow", hatredPerKill: 1 });

/* ------------------------------------------------------------------ */
/*  Sufferer                                                            */
/* ------------------------------------------------------------------ */

/** *You gain +1 per rank on Spirit Resilience Tests against Fel, and against being Charmed or Frightened.* */
export const IRON_WILL = Object.freeze({ identifier: "iron-will", name: "Iron Will", perRank: 1, resilience: "spirit", conditions: Object.freeze(["charmed", "frightened"]) });
/** *... gain 1 less Fel Corruption per rank, to no lower than 0.* (`hatred.mjs#restFel`'s `less`.) */
export const MEASURED_BREATH = Object.freeze({ identifier: "measured-breath", name: "Measured Breath", perRank: 1 });
/** ***Spectral Sight** reaches 20 feet further, and you see through 1 foot of stone or wood.* */
export const EYES_OF_THE_NETHER = Object.freeze({ identifier: "eyes-of-the-nether", name: "Eyes of the Nether", feet: 20 });
/** *... leave 1 Hatred per rank out of the count.* (`hatred.mjs#restFel`'s `leftOut`.) */
export const WARDING_INK = Object.freeze({ identifier: "warding-ink", name: "Warding Ink", perRank: 1 });
/** *As a Reaction when a spell targets you, spend 3 Energy. You gain Ward equal to your rank plus 1 against that spell's school for that casting.* */
export const GLAIVE_WARD = Object.freeze({ identifier: "glaive-ward", name: "Glaive Ward", energy: 3, plus: 1, flag: "glaiveWard" });
/** *Whichever Beyond Limits choice you make, it also ends Slowed and Entangled on you.* */
export const STEADY_FOOTING = Object.freeze({ identifier: "steady-footing", name: "Steady Footing", ends: Object.freeze(["slowed", "entangled"]) });
/** *Once per Long Rest per rank ... The DC is 10 plus the Hatred you held when the rest ended.* (The rest door's; `demon-hunter-features.mjs#QUIET_THE_WHISPERS`.) */
export const QUIET_THE_WHISPERS_TALENT = Object.freeze({ identifier: "quiet-the-whispers", name: "Quiet the Whispers", perRank: 1 });
/** *When you succeed on a Resilience Test against a spell, gain 1 Energy per rank, and the spell's caster takes Fel damage equal to your rank.* */
export const TURN_THEIR_FIRE = Object.freeze({ identifier: "turn-their-fire", name: "Turn Their Fire", perRank: 1, type: "fel" });
/** *Illusions never deceive you. At rank 2, you see the true form of a shapeshifted or disguised creature.* */
export const SIGHT_BEYOND_SIGHT = Object.freeze({ identifier: "sight-beyond-sight", name: "Sight Beyond Sight", trueFormRank: 2 });
/** *... 1 for each 4 Hatred at rank 1, or 1 for each 5 at rank 2 ... instead of 1 for each 3.* (`hatred.mjs#BRIDLE_PER`.) */
export const BRIDLE_THE_DEMON = Object.freeze({ identifier: "bridle-the-demon", name: "Bridle the Demon", per: Object.freeze([3, 4, 5]) });
/** *You cannot be Charmed by a demon. ... within 5 feet of you for each point of half your Wisdom modifier, rounded down, and at least 5 feet, its Casting Test takes a Bane.* */
export const REFUSE_THE_LEGION = Object.freeze({ identifier: "refuse-the-legion", name: "Refuse the Legion", condition: "charmed", perPoint: 5, min: 5, banes: 1 });
/** *Once per Short Rest, as an Action, end every spell and spell effect of tier 3 or lower within 30 feet ... A tier 4 one ends if its caster fails a Spirit Resilience Test ... a Bane on every Casting Test it makes for 10 minutes.* */
export const SILENCE_THE_WEAVE = Object.freeze({ identifier: "silence-the-weave", name: "Silence the Weave", feet: 30, tier: 3, testTier: 4, resilience: "spirit", banes: 1, baneOn: "casting", minutes: 10, per: "short" });

/** Every talent of the three branches by identifier, in 04's order: the census's own list. */
export const DH_TALENTS = Object.freeze(Object.fromEntries([
  TWIN_BLADES, FEL_TEMPERED, DEMONIC_VISAGE, TASTE_OF_POWER, GIFT_OF_THE_SKULL, EMBRACE_THE_PAIN,
  WINGS_OF_THE_BETRAYER, CHAOS_BLAST, FEED_ON_POWER, ETERNAL_HUNGER, FALL_UPON_THEM, BETRAYERS_BARGAIN,
  SOUL_HUNGER, REAPERS_GRIP, GORGING_LASH, HOARDED_SOUL, DEMONS_DUE, SWEEPING_ARC,
  KILL_AFTER_KILL, TEAR_THE_SOUL, HOBBLING_REAP, ENDLESS_APPETITE, SWALLOW_THEIR_MAGIC, FEAST_OF_SOULS,
  IRON_WILL, MEASURED_BREATH, EYES_OF_THE_NETHER, WARDING_INK, GLAIVE_WARD, STEADY_FOOTING,
  QUIET_THE_WHISPERS_TALENT, TURN_THEIR_FIRE, SIGHT_BEYOND_SIGHT, BRIDLE_THE_DEMON, REFUSE_THE_LEGION, SILENCE_THE_WEAVE
].map(c => [c.identifier, c])));

/* ------------------------------------------------------------------ */
/*  Ranks                                                               */
/* ------------------------------------------------------------------ */

/**
 * A Demon Hunter talent's rank among the talents taken as `rules/` reads them (`{className, identifier,
 * taken}`), 0 where none is taken.
 *
 * @param {Iterable<{className?: string, identifier?: string, taken?: number}>} talents
 * @param {string} identifier
 * @returns {number}
 */
export function dhRankIn(talents = [], identifier) {
  let n = 0;
  for (const t of talents ?? []) if (t?.className === DH_CLASS && t.identifier === identifier) n += whole(t.taken);
  return n;
}

/**
 * The same off an actor's items (a collection or a list of item-like objects): a `talent` of the class, by
 * identifier, its `taken`.
 *
 * @param {Iterable<object>} items
 * @param {string} identifier
 * @returns {number}
 */
export function dhRankOfItems(items = [], identifier) {
  let n = 0;
  for (const i of items ?? []) {
    if (i?.type !== "talent") continue;
    const s = i.system ?? {};
    if (s.identifier === identifier && (s.className ?? DH_CLASS) === DH_CLASS) n += whole(s.taken);
  }
  return n;
}

/** The rank a patch row carries (`patchRowsOf`'s), or the talent's taken. */
const patchRank = row => whole(row?.rank ?? row?.talent?.taken);

/* ------------------------------------------------------------------ */
/*  The shapes                                                          */
/* ------------------------------------------------------------------ */

/** The two shapes 04 calls *the demon's shape*: Demon Unleashed's and Gift of the Skull's. */
export const DEMON_SHAPES = Object.freeze(["unleashed", GIFT_OF_THE_SKULL.kind]);

/** Whether a shape kind is the demon's shape (Wings, Chaos Blast and Fall Upon Them read it). */
export function inDemonShape(kind) {
  return DEMON_SHAPES.includes(kind);
}

/** Gift of the Skull's rounds: your rank plus 1. */
export function skullRounds(rank = 1) {
  return Math.max(1, whole(rank)) + GIFT_OF_THE_SKULL.more;
}

/**
 * **WHY GIFT OF THE SKULL CANNOT BE USED**, or null: Demon Unleashed's shape stands (MY READING: the Gift
 * never replaces the greater shape), or the Gift's own does. A key under `AZEROTH.DemonHunter.Talent.Skull.`.
 *
 * @param {{shapeKind?: string|null}} o
 * @returns {null|"unleashed"|"already"}
 */
export function skullRefusal({ shapeKind = null } = {}) {
  if (shapeKind === "unleashed") return "unleashed";
  if (shapeKind === GIFT_OF_THE_SKULL.kind) return "already";
  return null;
}

/** Wings of the Betrayer's flying Speed at a rank: 30 feet, 60 at rank 2, none untaken. */
export function wingsFeet(rank = 0) {
  const r = whole(rank);
  if (r >= 2) return WINGS_OF_THE_BETRAYER.rank2;
  return r === 1 ? WINGS_OF_THE_BETRAYER.feet : null;
}

/**
 * Eternal Hunger's patches on Demon Unleashed (`patchRowsOf`'s rows): the Damage Rating and the rounds each
 * adds at its own rank, and whether Betrayer's Bargain stands among them.
 *
 * @param {Array<{patch?: object, rank?: number}>} rows
 * @returns {{damage: number, rounds: number, bargain: number|null}}
 */
export function unleashedTalents(rows = []) {
  let damage = 0;
  let rounds = 0;
  let bargain = null;
  for (const row of rows ?? []) {
    const dh = row?.patch?.dh ?? {};
    const rank = patchRank(row);
    if (dh.damage !== undefined) damage += ETERNAL_HUNGER.damagePerRank * rank;
    if (dh.rounds !== undefined) rounds += ETERNAL_HUNGER.roundsPerRank * rank;
    if (dh.bargain !== undefined) bargain = whole(dh.bargain);
  }
  return { damage, rounds, bargain };
}

/* ------------------------------------------------------------------ */
/*  Fel Lash's talents                                                  */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE TALENTS ADD TO ONE FEL LASH HIT** (Fel-Tempered, Demon's Due, Tear the Soul, Gorging Lash, Feed
 * on Power), off the patches on 02's Fel Lash (`patchRowsOf(talents, "Fel Lash")`) and the facts of the
 * blow: the extra damage, the Health back, the Energy, and whether Tear the Soul gives the creature to a free
 * devour.
 *
 * @param {Array<{patch?: object, rank?: number, talent?: object}>} rows
 * @param {{due?: boolean, below?: boolean, reaches?: boolean}} facts  Demon's Due standing; the first creature
 *   below half its Health; a demon or a Mana holder
 * @returns {{more: number, heal: number, energy: number, freeDevour: boolean, by: string[]}}
 */
export function felLashTalents(rows = [], { due = false, below = false, reaches = false } = {}) {
  const out = { more: 0, heal: 0, energy: 0, freeDevour: false, by: [] };
  for (const row of rows ?? []) {
    const dh = row?.patch?.dh ?? {};
    const rank = patchRank(row);
    const id = row?.talent?.identifier ?? "";
    let used = false;
    if (id === FEL_TEMPERED.identifier && dh.damage !== undefined) { out.more += FEL_TEMPERED.perRank * rank; used = true; }
    if (id === DEMONS_DUE.identifier && due) { out.more += DEMONS_DUE.perRank * rank; used = true; }
    if (id === TEAR_THE_SOUL.identifier && below) { out.more += TEAR_THE_SOUL.perRank * rank; out.freeDevour = true; used = true; }
    if (id === GORGING_LASH.identifier && dh.heal !== undefined) { out.heal += GORGING_LASH.perRank * rank; used = true; }
    if (id === FEED_ON_POWER.identifier && reaches) { out.energy += FEED_ON_POWER.perRank * rank; used = true; }
    if (used) out.by.push(row?.talent?.name ?? id);
  }
  return out;
}

/** Whether a creature is below half its Health (Tear the Soul): a maximum to read and the value under half of it. */
export function belowHalf({ value = 0, max = 0 } = {}) {
  return Number(max) > 0 && Number(value) < Number(max) * TEAR_THE_SOUL.below;
}

/**
 * **WHO MAKES A FEL LASH FREE** (02's Demon Unleashed, 04's Demon's Due), or null: the shape first, then the
 * promise a devoured demon laid.
 *
 * @param {{shapeKind?: string|null, due?: boolean}} o
 * @returns {string|null}  the name the line carries
 */
export function felLashFreeBy({ shapeKind = null, due = false } = {}) {
  if (shapeKind === "unleashed") return "Demon Unleashed";
  return due ? DEMONS_DUE.name : null;
}

/* ------------------------------------------------------------------ */
/*  Devouring                                                           */
/* ------------------------------------------------------------------ */

/**
 * **HOW THIS HUNTER DEVOURS A SOUL** (02's Devour Soul; 04's Soul Hunger, Reaper's Grip, Endless Appetite):
 * the feature that takes it, the reach, the Health, and the Hatred a demon's soul gives - or null for a
 * hunter who can devour nothing. MY READING (C31): a hunter holding both devours through Devour Soul's longer
 * reach with Soul Hunger's tier a rank added; Reaper's Grip widens Soul Hunger alone, since Devour Soul
 * already reaches 10 feet.
 *
 * @param {{devourSoul?: boolean, soulHunger?: number, endless?: number, scythe?: boolean, tier?: number, wis?: number}} o
 * @returns {{feature: string, reach: number, heal: number, demonHatred: number}|null}
 */
export function devourProfile({ devourSoul = false, soulHunger = 0, endless = 0, scythe = false, tier = 1, wis = 0 } = {}) {
  const t = tierOf(tier);
  const hunger = whole(soulHunger);
  if (devourSoul === true) {
    return {
      feature: "Devour Soul",
      reach: 10 + ENDLESS_APPETITE.feetPerRank * whole(endless),
      heal: Math.max(0, 2 * t + int(wis) + t * hunger),
      demonHatred: SOUL_HUNGER.demonHatred
    };
  }
  if (hunger > 0) {
    return { feature: SOUL_HUNGER.name, reach: scythe === true ? REAPERS_GRIP.reach : SOUL_HUNGER.feet, heal: t * hunger, demonHatred: SOUL_HUNGER.demonHatred };
  }
  return null;
}

/** Why a soul cannot be kept as a Crystalized Soul, or null: as many held as the rank. */
export function hoardRefusal({ held = 0, rank = 0 } = {}) {
  return whole(rank) < 1 ? "untaken" : (whole(held) >= whole(rank) ? "full" : null);
}

/** The three things a Crystalized Soul may be used for, in 04's order. */
export const CRYSTAL_CHOICES = Object.freeze(["heal", "energy", "hatred"]);

/**
 * **WHY A CRYSTALIZED SOUL CANNOT BE USED**, or null (04: *Only you can use one you made, and you cannot use
 * one while you are at 0 Health*). A key under `AZEROTH.DemonHunter.Talent.Crystal.Refuse.`.
 *
 * @param {{maker?: string|null, user?: string|null, health?: number}} o
 * @returns {null|"maker"|"zero"}
 */
export function crystalRefusal({ maker = null, user = null, health = 1 } = {}) {
  if (!maker || maker !== user) return "maker";
  return Number(health) <= 0 ? "zero" : null;
}

/** What a Crystalized Soul gives for a choice: the Health it would have restored, 3 Energy or 2 Hatred. */
export function crystalGives(choice, { heal = 0 } = {}) {
  if (choice === "heal") return { pool: null, amount: whole(heal) };
  if (choice === "energy") return { pool: "energy", amount: HOARDED_SOUL.energy };
  if (choice === "hatred") return { pool: "hatred", amount: HOARDED_SOUL.hatred };
  return null;
}

/** Sweeping Arc's Shadow damage: half the Wisdom modifier, rounded down, and at least 1. */
export function sweepDamage(wis = 0) {
  return Math.max(SWEEPING_ARC.min, Math.floor(int(wis) / 2));
}

/**
 * **WHETHER A DEVOUR COSTS NO REACTION** (04's Sweeping Arc and Tear the Soul: *without spending your
 * Reaction*; Endless Appetite: *once a round it costs no Reaction*): the creature named by a free devour this
 * round, else Endless Appetite's round mark still open.
 *
 * @param {{named?: boolean, endless?: number, endlessUsed?: boolean}} o
 * @returns {null|"named"|"endless"}
 */
export function freeDevourBy({ named = false, endless = 0, endlessUsed = false } = {}) {
  if (named === true) return "named";
  return whole(endless) > 0 && endlessUsed !== true ? "endless" : null;
}

/**
 * Whether a devoured creature held Mana or a Power pool (Swallow Their Magic): a Power pool of any name, and for a
 * creature only one it really holds (`real`: `demon-hunter-features.mjs#realPowerOf`, a stated maximum or a caster),
 * never the floor every block derives (the review's H2).
 *
 * @param {Array<{kind: string}>} pools
 * @param {{real?: boolean}} [o]
 */
export function swallowReaches(pools = [], { real = true } = {}) {
  return real === true && (pools ?? []).some(p => p?.kind === "power");
}

/** The chooser's "no one" row (the review's H1): an empty pick is a choice, never a dismissal. */
export const NO_ONE = "__none__";

/**
 * **WHAT THE ONE CHOOSER ANSWERED, AS KEYS** (the review's H1): `workflows.chooseOption` hands back the option itself
 * where `max` is 1, a list where it is more, and null for a dismissal or nothing ticked - so a caller that mapped the
 * answer as a list threw on a single creature and read nothing ticked as a dismissal. Null stays a dismissal; one
 * option or a list becomes its keys, the "no one" row (`NO_ONE`) taken out, so ticking it alone is an empty pick.
 *
 * @param {object|object[]|null} answer
 * @returns {string[]|null}
 */
export function pickedKeys(answer) {
  if (answer === null || answer === undefined) return null;
  const list = Array.isArray(answer) ? answer : [answer];
  return list.map(o => o?.key).filter(k => typeof k === "string" && k && k !== NO_ONE);
}

/**
 * **WHAT THE GM'S CLIENT REFUSES OF A TALENT'S ASK** (the review's C5): the asker owns the hunter and the hunter has
 * taken the talent; Sweeping Arc needs a scythe in two hands and its once a turn not yet spent on this GM's client;
 * Feast of Souls needs the devoured creature marked devoured and the feast not yet made for it. A reason, or null.
 *
 * @param {{act?: string, owner?: boolean, rank?: number, scythe?: boolean, once?: boolean, devoured?: boolean}} o
 * @returns {null|"owner"|"untaken"|"scythe"|"once"|"devoured"}
 */
export function talentQueryRefusal({ act = null, owner = false, rank = 0, scythe = false, once = false, devoured = false } = {}) {
  if (owner !== true) return "owner";
  if (whole(rank) < 1) return "untaken";
  if (act === "sweep") {
    if (scythe !== true) return "scythe";
    if (once === true) return "once";
  }
  if (act === "feast") {
    if (devoured !== true) return "devoured";
    if (once === true) return "once";
  }
  return null;
}

/**
 * **THE CREATURES A FEAST MAY REACH** (the review's C5): of the uuids asked, only those whose creature stands within
 * the radius of the hunter, measured on the GM's client (`rows`: every creature on the hunter's scene with its feet).
 * Sorted, each once.
 *
 * @param {string[]} asked
 * @param {Array<{uuid: string, feet: number|null}>} rows
 * @param {{feet?: number}} o
 * @returns {string[]}
 */
export function feastTargets(asked = [], rows = [], { feet = 0 } = {}) {
  const near = new Set((rows ?? []).filter(r => r?.feet !== null && r?.feet !== undefined && Number.isFinite(Number(r.feet)) && Number(r.feet) <= Number(feet) + 1e-6).map(r => r.uuid));
  return [...new Set((asked ?? []).filter(u => typeof u === "string" && near.has(u)))].sort();
}

/** Feast of Souls' radius: 5 feet for each point of the Wisdom modifier, nothing at 0 or below. */
export function feastFeet(wis = 0) {
  return FEAST_OF_SOULS.feetPerPoint * whole(wis);
}

/** Feast of Souls' Shadow damage: the Wisdom modifier, nothing at 0 or below. */
export function feastDamage(wis = 0) {
  return whole(wis);
}

/* ------------------------------------------------------------------ */
/*  The Sufferer                                                        */
/* ------------------------------------------------------------------ */

/** Iron Will's bonus at a rank: 1 a rank (read by `ironWillLines` alone; the review's S4). */
function ironWillBonus(rank = 0) {
  return IRON_WILL.perRank * whole(rank);
}

/**
 * Whether a Test is one Iron Will reaches by itself (the door knows it): a Spirit Resilience Test against Fel
 * Corruption. A Test against being Charmed or Frightened is the dialog's unticked line (D2 §12: the table
 * says what a Test is against).
 *
 * @param {{resilience?: string|null, track?: string|null}} o
 */
export function ironWillAutomatic({ resilience = null, track = null } = {}) {
  return resilience === IRON_WILL.resilience && track === "fel";
}

/** Glaive Ward's Ward: your rank plus 1. */
export function glaiveWardValue(rank = 1) {
  return Math.max(1, whole(rank)) + GLAIVE_WARD.plus;
}

/** Turn Their Fire at a rank: the Energy gained and the caster's Fel damage, 1 a rank each. */
export function turnTheirFire(rank = 0) {
  const r = whole(rank);
  return { energy: TURN_THEIR_FIRE.perRank * r, damage: TURN_THEIR_FIRE.perRank * r };
}

/** Refuse the Legion's radius: 5 feet a point of half the Wisdom modifier, rounded down, and at least 5 feet. */
export function legionFeet(wis = 0) {
  return Math.max(REFUSE_THE_LEGION.min, REFUSE_THE_LEGION.perPoint * Math.floor(int(wis) / 2));
}

/**
 * **THE BANES REFUSE THE LEGION LAYS ON A DEMON'S CASTING TEST**: one, where the caster is a demon and any
 * creature its spell targets stands within a hunter's radius. `rows` are one per hunter holding the talent,
 * each with the feet from that hunter to the nearest target and the hunter's radius.
 *
 * @param {{demon?: boolean, rows?: Array<{name?: string, feet?: number|null, radius?: number}>}} o
 * @returns {{banes: number, by: string[]}}
 */
export function legionBanes({ demon = false, rows = [] } = {}) {
  if (demon !== true) return { banes: 0, by: [] };
  const by = (rows ?? []).filter(r => Number.isFinite(Number(r?.feet)) && r.feet !== null && Number(r.feet) <= Number(r.radius) + 1e-6).map(r => String(r.name ?? ""));
  return by.length ? { banes: REFUSE_THE_LEGION.banes, by: [...new Set(by)].sort((a, b) => a.localeCompare(b)) } : { banes: 0, by: [] };
}

/**
 * **WHAT SILENCE THE WEAVE DOES TO ONE SPELL OR SPELL EFFECT**: `own` - the hunter's own, left; `end` - tier 3
 * or lower, ended; `test` - tier 4, ended where its caster fails a Spirit Resilience Test; `keep` - tier 5, or a
 * tier no record names (MY READING: an effect whose spell the record cannot name is left, said on the card).
 *
 * @param {{tier?: number|null, own?: boolean}} o
 * @returns {"own"|"end"|"test"|"keep"}
 */
export function silenceVerdict({ tier = null, own = false } = {}) {
  if (own === true) return "own";
  if (tier === null || tier === undefined || !Number.isFinite(Number(tier))) return "keep";
  const t = int(tier);
  if (t <= SILENCE_THE_WEAVE.tier) return "end";
  return t === SILENCE_THE_WEAVE.testTier ? "test" : "keep";
}

/**
 * **WHAT A TOKEN HIDES, FOR SIGHT BEYOND SIGHT AT RANK 2**: the creature's true name where its token shows
 * another, and the shape it wears. Null where nothing is hidden or the rank is not reached.
 *
 * @param {{rank?: number, tokenName?: string, actorName?: string, shapeName?: string|null}} o
 * @returns {{name: string, shape: string|null}|null}
 */
export function trueFormOf({ rank = 0, tokenName = "", actorName = "", shapeName = null } = {}) {
  if (whole(rank) < SIGHT_BEYOND_SIGHT.trueFormRank) return null;
  const disguised = Boolean(actorName) && String(tokenName ?? "") !== String(actorName);
  if (!disguised && !shapeName) return null;
  return { name: String(actorName ?? ""), shape: shapeName ? String(shapeName) : null };
}

/* ------------------------------------------------------------------ */
/*  The doors' census                                                   */
/* ------------------------------------------------------------------ */

/**
 * **EVERY TALENT'S DOOR, BY THE FUNCTION THAT CALLS IT** (the knight's `DK_SPELL_DOORS` shape, D-983):
 * `{file, fn, call}` - `demon-hunter-talents.test.mjs` slices `file` to `fn` with the comments blanked
 * (`tools/strip-comments.mjs`) and fails a `call` the slice does not hold.
 */
const door = (file, fn, call) => Object.freeze({ file, fn, call });
const FX = "module/effects/demon-hunter-talents.mjs";
const FEAT = "module/effects/demon-hunter-features.mjs";
const WF = "module/dice/workflows.mjs";
const ACTOR = "module/documents/actor.mjs";
const CHAR = "module/data/actor/character.mjs";
const CHAT = "module/dice/chat.mjs";
const HATRED_LAW = "module/rules/hatred.mjs";
export const DH_TALENT_DOORS = Object.freeze({
  // Betrayer
  "twin-blades": [door(WF, "rollTest", "offHandPenaltyFor(talentsHeld, undefined, { facts: gateFacts })"), door(WF, "rollTest", "offHandBuildsFor(talentsHeld")],
  "fel-tempered": [door(FEAT, "demonHunterOnHit", "lashTalentsFor("), door(FX, "lashTalentsFor", "felLashTalents(")],
  "demonic-visage": [door("module/rules/skills.mjs", "skillRowsFor", "talentSkillBonus(")],
  "taste-of-power": [door(FX, "judgeDhTalentUse", "tasteRefusal("), door(FX, "landTaste", "accrueCorruption(actor"), door(FX, "landTaste", "gainHatred(actor")],
  "gift-of-the-skull": [door(FX, "judgeDhTalentUse", "skullRefusal("), door(FX, "landSkull", "takeShape(actor")],
  "embrace-the-pain": [door(HATRED_LAW, "felFor", "embraceRanksOf(")],
  "wings-of-the-betrayer": [door(CHAR, "prepareDerivedData", "wings: dhRankIn(talentRows"), door("module/rules/demon-hunter-features.mjs", "dhDerived", "wingsFeet(")],
  "chaos-blast": [door(FX, "judgeDhTalentUse", "inDemonShape(")],
  "feed-on-power": [door(FX, "lashTalentsFor", "reaches:")],
  "eternal-hunger": [door(FEAT, "takeUnleashed", "unleashedTalents(")],
  "fall-upon-them": [door(FEAT, "landLeap", "afterHuntersLeap("), door(FX, "afterHuntersLeap", "postSplashTest(")],
  "betrayers-bargain": [door(FEAT, "judgeDemonHunterUse", "bargainChoice("), door(FX, "bargainEnded", "accrueCorruption(actor")],
  // Souleater
  "soul-hunger": [door(FEAT, "devourJudged", "devourProfileOf("), door(FEAT, "devourFromCard", "devourProfileOf(")],
  "reapers-grip": [door(FX, "devourProfileOf", "scytheTwoHands")],
  "gorging-lash": [door(FEAT, "demonHunterOnHit", "lashExtra?.heal"), door(FX, "lashTalentsLand", "applyHealing(extra.heal")],
  "hoarded-soul": [door(FEAT, "devourFromCard", "hoardChoice("), door(FX, "keepSoul", "createEmbeddedDocuments(\"Item\""), door(WF, "useGear", "useCrystalizedSoul(")],
  "demons-due": [door(FX, "afterDevour", "DEMONS_DUE.flag"), door(ACTOR, "riderLines", "felLashFreeBy(")],
  "sweeping-arc": [door(FEAT, "demonHunterOnHit", "dhTalentsOnHit("), door(FX, "dhTalentsOnHit", "sweepingArc("), door(FX, "sweepingArc", "sweepDamage(")],
  "kill-after-kill": [door(FX, "afterDevour", "freeLeap("), door(FX, "freeLeap", "layBoon(")],
  "tear-the-soul": [door(FX, "lashTalentsFor", "belowHalf("), door(FX, "markFreeDevour", "setFlag(")],
  "hobbling-reap": [door(FX, "dhTalentsOnHit", "inflictCondition(")],
  "endless-appetite": [door(FX, "devourProfileOf", "ENDLESS_APPETITE.identifier"), door(FX, "freeDevourFor", "freeDevourBy(")],
  "swallow-their-magic": [door(FX, "afterDevour", "swallowReaches("), door(FX, "endSpellsHere", "endSustain(")],
  "feast-of-souls": [door(FEAT, "devourFromCard", "feastChoice("), door(FX, "feastHere", "rollResilience(")],
  // Sufferer
  "iron-will": [door("module/applications/actions.mjs", "resilienceWithDialog", "ironWillLineOffer("), door(WF, "rollTest", "judgeIronWillLine("), door(WF, "corruptionExposure", "resilienceModifiers(actor, resilience, { track })"), door(WF, "resilienceModifiers", "ironWillAutomatic(")],
  "measured-breath": [door(HATRED_LAW, "restModifiersOf", "ranks(MEASURED_BREATH)")],
  "eyes-of-the-nether": [door(FEAT, "sightStep", "eyesOfTheNether.name"), door(FEAT, "syncSpectralSight", "sightStep(source, doc)")],
  "warding-ink": [door(HATRED_LAW, "restModifiersOf", "ranks(WARDING_INK)")],
  "glaive-ward": [door(FX, "judgeDhTalentUse", "glaiveWardValue("), door(FX, "landGlaiveWard", "system.ward.${plan.school}")],
  "steady-footing": [door(FEAT, "landLimits", "steadyFooting("), door(FEAT, "offerBeyondLimits", "steadyFooting(")],
  "quiet-the-whispers": [door(FEAT, "quietTheWhispers", "talentRanks?.(\"Quiet the Whispers\")")],
  "turn-their-fire": [door(CHAT, "rollResists", "turnTheirFireOn("), door(FX, "turnTheirFireOn", "turnTheirFire(")],
  "sight-beyond-sight": [door(FX, "registerDemonHunterTalents", "trueFormOf(")],
  "bridle-the-demon": [door(HATRED_LAW, "restModifiersOf", "ranks(BRIDLE_THE_DEMON)")],
  "refuse-the-legion": [door(FX, "registerDemonHunterTalents", "legionCharmRefused("), door(WF, "castSpell", "refuseLegionAt(")],
  "silence-the-weave": [door(FX, "judgeDhTalentUse", "silenceFor("), door(FX, "silenceHere", "silenceVerdict("), door(FX, "landSilence", "layBane(")]
});


/**
 * **WHY TASTE OF POWER CANNOT BE USED**, or null: no Hatred pool to fill, or Demon Unleashed's shape stands
 * (02: *You gain no Hatred while unleashed*; the brief: blocked while unleashed). A key under
 * `AZEROTH.DemonHunter.Talent.Taste.Refuse.`.
 *
 * @param {{holdsHatred?: boolean, unleashed?: boolean}} o
 * @returns {null|"pool"|"unleashed"}
 */
export function tasteRefusal({ holdsHatred = false, unleashed = false } = {}) {
  if (holdsHatred !== true) return "pool";
  return unleashed === true ? "unleashed" : null;
}

/** What Taste of Power fills: the cap less what is held, never less than nothing. */
export function tasteFill({ held = 0, cap = 0 } = {}) {
  return Math.max(0, whole(cap) - whole(held));
}

/**
 * **WHAT A TALENT ADDS TO A SKILL TEST** (04's Demonic Visage: *+1 per rank on Intimidation Tests*), off a
 * creature's items: the row `skills.mjs#skillRowsFor` adds, or null. Only a character carries talents.
 *
 * @param {Iterable<object>} items
 * @param {string} key  a skill key
 * @returns {{label: string, value: number}|null}
 */
export function talentSkillBonus(items = [], key) {
  if (key !== DEMONIC_VISAGE.skill) return null;
  const rank = dhRankOfItems(items, DEMONIC_VISAGE.identifier);
  return rank > 0 ? { label: DEMONIC_VISAGE.name, value: DEMONIC_VISAGE.perRank * rank } : null;
}

/**
 * **THE IRON WILL LINE** on a Spirit Resilience Test's dialog: unticked (the table says whether the Test is
 * against Fel, or against being Charmed or Frightened), +1 a rank, none where the talent is not taken or the
 * Test is not Spirit. `talentLines` row, kind `ironWill`.
 *
 * @param {{rank?: number, resilience?: string|null}} o
 * @returns {object[]}
 */
export function ironWillLines({ rank = 0, resilience = null } = {}) {
  const r = whole(rank);
  if (r < 1 || resilience !== IRON_WILL.resilience) return [];
  return [{
    id: `talent-line-${IRON_WILL.identifier}`, identifier: IRON_WILL.identifier, name: IRON_WILL.name, kind: "ironWill",
    amount: ironWillBonus(r), left: null, available: true, reason: null
  }];
}

/**
 * **SILENCE THE WEAVE'S CHOSEN CREATURES, JUDGED** (*choose any number of creatures within 30 feet of you*):
 * the candidates' rows, each with its feet, and whether it is in reach. Pure: the door measures.
 *
 * @param {Array<{uuid: string, name?: string, feet?: number|null}>} rows
 * @returns {Array<{uuid: string, name: string, feet: number|null, available: boolean}>}
 */
export function silenceFor(rows = []) {
  return (rows ?? []).map(r => ({
    uuid: String(r?.uuid ?? ""), name: String(r?.name ?? ""), feet: Number.isFinite(Number(r?.feet)) && r?.feet !== null ? Number(r.feet) : null,
    available: Number.isFinite(Number(r?.feet)) && r?.feet !== null && Number(r.feet) <= SILENCE_THE_WEAVE.feet + 1e-6
  })).filter(r => r.uuid).sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid));
}
