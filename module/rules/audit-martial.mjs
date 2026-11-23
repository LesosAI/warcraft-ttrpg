/**
 * **THE CLASS TALENT AUDIT'S MARTIAL LAW** (the Warrior, the Paladin and the Ranger, with the
 * Blademaster, Mountain King and Dark Ranger branches; class agent A, D-1870 to D-1879). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * The audit (`docs/design/CLASS-TALENT-AUDIT-2026-11.md`, Appendix A) reworked rows whose mechanism
 * no existing door carried. Each number lives here once, each reading is one function, and the
 * doors that call them are `effects/audit-martial.mjs` (the Use, the roll, the blow and the heal).
 * `audit-martial.test.mjs` holds every number to 02's and 04's printed words.
 *
 * The row kind is `martial` on a talent row in `talent-effects.mjs`, and `onUse.martial` on a Use
 * (a talent's grant or a class feature's own row in `class-features.mjs`). The kinds:
 *
 *   sunderingBlows  04's Sundering Blows: once a round, a hit on a target that has lost Armor
 *                   Points to YOUR Sunder gives 1 more Rage, and at rank 2 adds 1 to its damage
 *   overpower       04's Overpower: a miss, a Parry or a Block gives 1 Rage per rank, and once a
 *                   turn the next attack against that target this turn gains a Boon
 *   frenzy          04's Frenzy: the first time each encounter the warrior drops below half
 *                   Health, Rage equal to twice the tier
 *   reckless        04's Reckless at rank 2: each hit against the warrior while its exposure
 *                   stands gives 1 more Rage
 *   twofold         04's Twofold Light: a heal Mending Word restores passes half, rounded down,
 *                   to one other friendly target within 10 feet of its target
 *   fervor          04's Fervor: a Holy spell's heal on a friendly target gives 1 Zeal, to no more
 *                   than the rank each round
 *   righteousFury   04's Righteous Fury: 1 Zeal whenever a friendly target within 20 feet takes
 *                   damage, to no more than the rank each round
 */

/** 04's Sundering Blows (the audit's rewrite; D-1870). */
export const SUNDERING_BLOWS = Object.freeze({ identifier: "sundering-blows", rage: 1, damage: 1, damageRank: 2, mark: "sundering-blows" });

/** 04's Overpower (renamed from Bladeturn; D-1870). */
export const OVERPOWER = Object.freeze({ identifier: "overpower", ragePerRank: 1, boons: 1, mark: "overpower" });

/** 04's Frenzy (the audit's rewrite): twice the tier, once each encounter. */
export const FRENZY = Object.freeze({ identifier: "frenzy", gain: "2*tier", below: 0.5 });

/** 04's Reckless at rank 2: 1 more Rage for each hit taken while the exposure stands. */
export const RECKLESS_RAGE = Object.freeze({ identifier: "reckless", rank: 2, rage: 1 });

/** 02's Deathwish (the audit's A-row): below half, +2 to the Damage Rating, and 2 more Rage off the first hit each round. */
export const DEATHWISH = Object.freeze({ feature: "Deathwish", rating: 2, rage: 2, below: 0.5, mark: "deathwish" });

/** 02's Avenging Wrath (the audit's A6): one Boon on every Test and a climbing +1 to +3 damage until the encounter ends. */
// Out of a fight *until the encounter ends* is ten rounds of the world's clock (`clockRounds`), Beacon of
// Hope's reading of D-778 (the class talent audit's final review): never until the NEXT fight ends.
export const AVENGING_WRATH = Object.freeze({ feature: "Avenging Wrath", flag: "avengingWrath", boons: 1, max: 3, clockRounds: 10 });

/** 02's Beacon of Hope (the audit's A7, R4): a granted hold that lasts until the encounter ends. */
// A LASTING hold (06 §9's rule 2; the wave-2 fix run): outside the creature's shared once-an-encounter granted
// mark, limited by its own words - each ally's first drop, recorded on the Beacon (`held`). Out of a fight it
// lasts ten rounds of the world's clock (`clockRounds`).
export const BEACON_OF_HOPE = Object.freeze({ feature: "Beacon of Hope", flag: "beaconOfHope", kind: "beaconOfHope", feet: 30, regime: "lasting", holdLasting: true, clockRounds: 10 });

/**
 * Whether a Beacon of Hope has already held this ally (*the first time each ally ... drops to 0 Health*).
 *
 * @param {{held?: string[]}|null} flag  the Beacon's `beaconOfHope` flag
 * @param {string|null} uuid  the ally's
 */
export function beaconHeldBefore(flag, uuid) {
  return Boolean(uuid) && Array.isArray(flag?.held) && flag.held.includes(uuid);
}

/** 02's Divine Storm (the audit's A10): a heal of the tier on one friendly target within 10 feet for each hit. */
export const DIVINE_STORM = Object.freeze({ feature: "Divine Storm", feet: 10, heal: "tier" });

/** 04's Unbreakable's Reaction (the audit's rewrite): attacks within 10 feet redirected, every Block free. */
export const UNBREAKABLE = Object.freeze({ identifier: "unbreakable", flag: "unbreakable", feet: 10 });

/** 04's Shield Slam at rank 2: a hit at SL 2 ends one spell the target is Sustaining. */
export const SHIELD_SLAM = Object.freeze({ identifier: "shield-slam", rank: 2, sl: 2 });

/** 04's Twofold Light. */
export const TWOFOLD_LIGHT = Object.freeze({ identifier: "twofold-light", feature: "Mending Word", feet: 10 });

/** 04's Fervor and Righteous Fury: 1 Zeal a time, to no more than the rank each round. */
export const FERVOR = Object.freeze({ identifier: "fervor", zeal: 1 });
export const RIGHTEOUS_FURY = Object.freeze({ identifier: "righteous-fury", zeal: 1 });

/** 04's Fanaticism (the audit, D-1874): *You begin every fight holding 2 Zeal per rank*. */
export const FANATICISM = Object.freeze({ identifier: "fanaticism", perRank: 2 });

/** The Zeal a fight starts with at a rank of Fanaticism. */
export function fanaticismZeal(rank = 0) {
  return Math.max(0, Math.trunc(Number(rank)) || 0) * FANATICISM.perRank;
}

/** 04's Mercy of Uther: one condition of the Paladin's choice ended on Lay on Hands' target. */
export const MERCY_OF_UTHER = Object.freeze({ identifier: "mercy-of-uther", feature: "Lay on Hands", ends: 1 });

/** 04's Readiness: no action, refill the Focus, once per Short Rest per rank. */
export const READINESS = Object.freeze({ identifier: "readiness", pool: "focus" });

/** 02's Snare and 04's Master of the Land: as many Snares set as the tier, twice that with the talent. */
export const SNARES = Object.freeze({ feature: "Snare", master: "master-of-the-land" });

/** The Use kinds `onUse.martial` names, each judged and landed by `effects/audit-martial.mjs`. */
export const MARTIAL_USES = Object.freeze(["readiness", "avengingWrath", "beaconOfHope", "unbreakable", "layOnHands", "snare"]);

/** The talent row kinds `martial` names, each read by ONE door (named in `effects/audit-martial.mjs`). */
export const MARTIAL_KINDS = Object.freeze(["sunderingBlows", "overpower", "frenzy", "reckless", "twofold", "fervor", "righteousFury"]);

/* -------------------------------------------- */

/** A whole number at least 0. */
const whole = n => Math.max(0, Math.trunc(Number(n)) || 0);

/**
 * Whether a creature stands below a share of its Health (02's *Below half Health*): null knows nothing
 * and is never below.
 *
 * @param {{value?: number, max?: number}|null} health
 * @param {number} share
 */
export function below(health, share = 0.5) {
  const max = Number(health?.max);
  const value = Number(health?.value);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return false;
  return value < max * share;
}

/**
 * Whether one blow took a creature from at or above a share of its Health to below it (04's Frenzy:
 * *The first time each encounter you drop below half Health*).
 */
export function droppedBelow({ before = 0, after = 0, max = 0, share = 0.5 } = {}) {
  const m = Number(max) || 0;
  if (m <= 0) return false;
  return Number(before) >= m * share && Number(after) < m * share;
}

/**
 * **WHO SUNDERED IT** (04's Sundering Blows: *a target that has lost Armor Points to your Sunder*): an
 * active Sundered effect on the target whose origin is the striker (`dice/chat.mjs#applySunderedFromCard`
 * writes the speaker as the origin and `sundered: true` as the flag).
 *
 * @param {Array<{flags?: object, origin?: string|null, active?: boolean, disabled?: boolean}>} effects  the target's
 * @param {string|null} uuid  the striker's
 */
export function sunderedBy(effects = [], uuid = null) {
  if (!uuid) return false;
  return (effects ?? []).some(e => e && e.active !== false && e.disabled !== true
    && e.flags?.["azeroth-rpg"]?.sundered === true && e.origin === uuid);
}

/**
 * **WHAT A SUNDERING BLOW GIVES** at a rank: 1 Rage, and at rank 2 one more damage.
 *
 * @param {number} rank
 * @returns {{rage: number, damage: number}}
 */
export function sunderingBlowsAt(rank = 1) {
  const r = whole(rank);
  if (r < 1) return { rage: 0, damage: 0 };
  return { rage: SUNDERING_BLOWS.rage, damage: r >= SUNDERING_BLOWS.damageRank ? SUNDERING_BLOWS.damage : 0 };
}

/** **WHAT OVERPOWER GIVES** on a miss, a Parry or a Block: 1 Rage per rank. */
export function overpowerRage(rank = 0) {
  return whole(rank) * OVERPOWER.ragePerRank;
}

/** **FRENZY'S RAGE**: twice the tier. */
export function frenzyRage(tier = 1) {
  return 2 * Math.max(1, whole(tier));
}

/**
 * **DEATHWISH AT THE ROLL** (02 §7: *Below half Health, add 2 to your Damage Rating, and the first hit you
 * land each round gives 2 more Rage*): what the blow adds and gives, read off the warrior's Health now and
 * whether this hit is the round's first.
 *
 * @param {{held?: boolean, health?: object|null, hit?: boolean, firstThisRound?: boolean}} o
 * @returns {{rating: number, rage: number}}
 */
export function deathwishAt({ held = false, health = null, hit = false, firstThisRound = false } = {}) {
  if (!held || !below(health, DEATHWISH.below)) return { rating: 0, rage: 0 };
  return { rating: hit ? DEATHWISH.rating : 0, rage: hit && firstThisRound ? DEATHWISH.rage : 0 };
}

/**
 * **AVENGING WRATH'S CLIMB** (02 §7: *your attacks and Holy spells add 1 damage for each round since you
 * used this, to a maximum of 3*): off the round it was used in, the fight's round now. Out of a fight
 * (no round) the climb is 0 - there is no round to count.
 *
 * @param {{round?: number|null}|null} flag  the laid effect's `avengingWrath` flag
 * @param {number|null} roundNow
 */
export function avengingWrathBonus(flag, roundNow = null) {
  if (!flag || flag.round === null || flag.round === undefined || roundNow === null || roundNow === undefined) return 0;
  const at = Number(flag.round);
  const now = Number(roundNow);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return 0;
  return Math.min(AVENGING_WRATH.max, Math.max(0, Math.trunc(now - at)));
}

/**
 * The Avenging Wrath standing on a creature: the flag of the first active effect carrying it, or null.
 *
 * @param {Array<{flags?: object, active?: boolean, disabled?: boolean}>} effects
 */
export function avengingWrathOf(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const f = e.flags?.["azeroth-rpg"]?.[AVENGING_WRATH.flag];
    if (f && typeof f === "object") return f;
  }
  return null;
}

/**
 * **WHETHER A BEACON OF HOPE HOLDS THIS CREATURE AT 1** (02 §7: *Until the encounter ends, the first time
 * each ally within 30 feet drops to 0 Health, they return to 1 instead*; R4's granted regime, lasting):
 * a Paladin standing a Beacon, the creature an ally of that Paladin (the Paladin included: D-755's reading,
 * no *other than you*), within 30 feet - a distance nothing measured is no distance - and the blow one
 * that would drop it from above 0 to 0. Its once-an-encounter claim is the creature's fight record, asked
 * by the door before it holds.
 *
 * @param {{standing?: boolean, ally?: boolean, feet?: number|null, before?: number, amount?: number}} o
 */
export function beaconHolds({ standing = false, ally = false, feet = null, before = 0, amount = 0 } = {}) {
  if (!standing || !ally) return false;
  if (!(typeof feet === "number" && Number.isFinite(feet) && feet <= BEACON_OF_HOPE.feet)) return false;
  return Number(before) > 0 && Number(amount) >= Number(before);
}

/**
 * The Beacon of Hope standing on a Paladin: its flag, or null.
 *
 * @param {Array<{flags?: object, active?: boolean, disabled?: boolean}>} effects  the Paladin's
 */
export function beaconOfHopeOf(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const f = e.flags?.["azeroth-rpg"]?.[BEACON_OF_HOPE.flag];
    if (f && typeof f === "object") return f;
  }
  return null;
}

/**
 * The name of the Unbreakable standing on a creature (its effect's `unbreakable` flag), or null: what
 * frees every Block until the warrior's next turn (`applications/actions.mjs#freeReactionOf`).
 *
 * @param {Array<object>} flagsList  each active effect's `flags["azeroth-rpg"]`
 * @returns {string|null}
 */
export function unbreakableName(flagsList = []) {
  for (const f of flagsList ?? []) {
    const u = f?.[UNBREAKABLE.flag];
    if (u && typeof u === "object") return String(u.source ?? "Unbreakable") || "Unbreakable";
  }
  return null;
}

/**
 * **TWOFOLD LIGHT'S SHARE** (04: *one other friendly target within 10 feet of its target recovers half as
 * much, rounded down*): half of what Mending Word restored, rounded down.
 */
export function twofoldShare(restored = 0) {
  return Math.floor(whole(restored) / 2);
}

/**
 * **WHETHER TWOFOLD LIGHT PASSES A HEAL ON**: the healer holds the talent, the heal is Mending Word's (a
 * feature heal named so), it restored something, and it is no share already.
 */
export function twofoldApplies({ holds = false, featureName = null, restored = 0, shared = false } = {}) {
  return holds === true && featureName === TWOFOLD_LIGHT.feature && whole(restored) > 0 && shared !== true;
}

/**
 * **WHETHER FERVOR GIVES ZEAL**: a Holy SPELL's heal that restored Health to a friendly target.
 */
export function fervorApplies({ holds = false, spell = false, school = null, restored = 0, friendly = false } = {}) {
  return holds === true && spell === true && school === "holy" && whole(restored) > 0 && friendly === true;
}

/**
 * **THE NEXT OF A ROUND'S COUNTED MARKS** (Fervor and Righteous Fury: *to no more than your rank each
 * round*): `<id>:1` to `<id>:<rank>`, the first the round's record does not hold, or null.
 *
 * @param {string} identifier
 * @param {number} rank
 * @param {string[]} used  the round record's `once` list
 */
export function roundCountMark(identifier, rank = 1, used = []) {
  const n = whole(rank);
  for (let i = 1; i <= n; i++) {
    const key = `${identifier}:${i}`;
    if (!(used ?? []).includes(key)) return key;
  }
  return null;
}

/**
 * **HOW MANY SNARES A RANGER MAY KEEP SET** (02 §7: *You may keep as many Snares set as your tier*; 04's
 * Master of the Land: *you may keep twice as many Snares set*).
 *
 * @param {{tier?: number, master?: boolean}} o
 */
/** 04's Rapid Fire (*three attacks against one target per rank*): sets of three, each at one target. */
export const RAPID_FIRE = Object.freeze({ feature: "Rapid Fire", perSet: 3 });

/**
 * **HOW MANY OF A CARD'S ATTACKS ONE CREATURE MAY TAKE** (the wave-2 fix run): Whirlwind's *two attacks against
 * every enemy within your reach* and Bladestorm's *no enemy is attacked more than twice* (`each:<n>`, n at each
 * creature), and Rapid Fire's *three attacks against one target per rank* - one set of three a rank, each set at
 * one target, so no more creatures than the rank and no more than three at any one beyond what its sets allow
 * (MY READING: a creature may take more than one set). Null where the card has no such law.
 *
 * @param {{attacks?: string|null, name?: string|null, rank?: number}} o
 * @returns {{perTarget: number|null, maxTargets: number|null}|null}
 */
export function cardTargetLimit({ attacks = null, name = null, rank = 1 } = {}) {
  const per = /^each:(\d+)$/.exec(String(attacks ?? ""));
  if (per) return { perTarget: Math.max(1, Number(per[1])), maxTargets: null };
  if (name === RAPID_FIRE.feature) {
    const sets = Math.max(1, whole(rank));
    return { perTarget: RAPID_FIRE.perSet * sets, maxTargets: sets };
  }
  return null;
}

/**
 * **ONE MORE PRESS AT THESE CREATURES, JUDGED** against what the card records (`attacksAt`, presses by creature
 * key). A refusal `{key, name}` (a lang key and the creature it names), or null where the press may be made. A
 * press aimed at nobody is the table's, and passes.
 *
 * @param {{attacksAt?: object, aimed?: Array<{key: string, name?: string}>, limit?: object|null}} o
 */
export function cardTargetRefusal({ attacksAt = {}, aimed = [], limit = null } = {}) {
  if (!limit || !aimed?.length) return null;
  const at = attacksAt && typeof attacksAt === "object" ? attacksAt : {};
  const perTarget = whole(limit.perTarget);
  if (perTarget > 0) {
    const full = aimed.find(a => whole(at[a.key]) >= perTarget);
    if (full) return { key: "AZEROTH.Feature.TargetSpent", name: full.name ?? "", n: perTarget };
  }
  const maxTargets = whole(limit.maxTargets);
  if (maxTargets > 0) {
    const all = new Set([...Object.keys(at).filter(k => whole(at[k]) > 0), ...aimed.map(a => a.key)]);
    if (all.size > maxTargets) return { key: "AZEROTH.Feature.TargetsSpent", name: aimed[0]?.name ?? "", n: maxTargets };
  }
  return null;
}

export function snareLimit({ tier = 1, master = false } = {}) {
  return Math.max(1, whole(tier)) * (master ? 2 : 1);
}

/**
 * **WHICH SNARES A NEW ONE ENDS** (02 §7: *setting another ends your oldest*): the ids of the oldest set
 * Snares to delete so that the new one keeps the count at the limit, oldest first.
 *
 * @param {Array<{id: string, at: number}>} standing  the Ranger's Snares now, each with when it was set
 * @param {number} limit
 * @returns {string[]}
 */
export function snaresToEnd(standing = [], limit = 1) {
  const sorted = [...(standing ?? [])].filter(s => s?.id).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0) || String(a.id).localeCompare(String(b.id)));
  const over = sorted.length + 1 - Math.max(1, whole(limit));
  return over > 0 ? sorted.slice(0, over).map(s => s.id) : [];
}

/**
 * **WHICH CONDITIONS MERCY OF UTHER MAY END**: the A1 conditions the target holds, by key, sorted -
 * the chooser lists them.
 *
 * @param {Iterable<string>} statuses  the target's
 * @param {object} conditions  `AZEROTH.conditions`
 */
export function mercyChoices(statuses = [], conditions = {}) {
  return [...new Set([...(statuses ?? [])].filter(id => Object.hasOwn(conditions ?? {}, id)))].sort();
}

/**
 * **TWOFOLD LIGHT BOUND TO THE MENDING WORD THAT SET IT OFF** (the class talent audit's final review): the
 * card is a feature card spoken by this Paladin, made by their Mending Word; where the card names creatures,
 * the one healed is among them; and the card has not shared a heal yet (`twofoldShared`). A reason key, or
 * null. Without the card a request could heal for nothing, as often as it was sent.
 *
 * @param {{card?: {kind?: string, speakerUuid?: string|null, itemName?: string|null, targetUuids?: string[], shared?: boolean}|null,
 *   byUuid?: string|null, healedUuid?: string|null}} o
 * @returns {string|null}
 */
export function twofoldCardRefusal({ card = null, byUuid = null, healedUuid = null } = {}) {
  if (!card || card.kind !== "feature" || !byUuid || !healedUuid || card.speakerUuid !== byUuid || card.itemName !== TWOFOLD_LIGHT.feature) return "AZEROTH.Martial.TwofoldNoCard";
  // A row the reader could not resolve stays in the list as null, so a card naming creatures never reads as
  // one naming none (fail closed).
  const named = Array.isArray(card.targetUuids) ? card.targetUuids : [];
  if (named.length && !named.includes(healedUuid)) return "AZEROTH.Martial.TwofoldNoCard";
  if (card.shared === true) return "AZEROTH.Martial.TwofoldAgain";
  return null;
}

/**
 * **WHAT TWOFOLD LIGHT SHARES** (*recovers half as much, rounded down*): half of the heal the Mending Word
 * card records, never past half of Mending Word's largest heal at the Paladin's tier and Charisma
 * (`ceiling`), and never past what the request asks - a request may only LOWER it (a heal that restored less
 * than the card's amount shares half of what it restored), never raise it.
 *
 * @param {{cardHeal?: number, ceiling?: number, asked?: number}} o
 * @returns {number}
 */
export function twofoldAmount({ cardHeal = 0, ceiling = 0, asked = 0 } = {}) {
  return Math.min(twofoldShare(cardHeal), whole(ceiling), whole(asked));
}

/**
 * **MERCY OF UTHER'S CONDITION, BOUND TO ITS LAY ON HANDS** (the class talent audit's final review: *Your
 * Lay on Hands ... ends one condition on it of your choice*; 02: *to the target by touch*): the Use's record
 * on the Lay on Hands item (`mercyUse`, written once the Use is paid) names this request's id, this target and
 * this condition, the condition has not been claimed off it yet, and the target stands within touch (5 feet,
 * `rules/range.mjs#TOUCH_FEET`), where a distance nobody could measure refuses (fail closed). A reason key, or
 * null.
 *
 * @param {{record?: {id?: string, target?: string, ends?: string[], claimed?: string[]}|null, useId?: string|null,
 *   targetUuid?: string|null, id?: string|null, feet?: number|null, touch?: number}} o
 * @returns {string|null}
 */
export function mercyUseRefusal({ record = null, useId = null, targetUuid = null, id = null, feet = null, touch = 5 } = {}) {
  if (!record || !useId || !targetUuid || record.id !== useId || record.target !== targetUuid || !(record.ends ?? []).includes(id)) return "AZEROTH.Martial.MercyNoUse";
  if ((record.claimed ?? []).includes(id)) return "AZEROTH.Martial.MercyAgain";
  if (feet === null || feet === undefined || !Number.isFinite(Number(feet)) || Number(feet) > whole(touch)) return "AZEROTH.Martial.MercyFar";
  return null;
}

/**
 * **SANCTIFIED WEAPON'S GATE** (04, the class talent audit's A5: *Against an undead or a demon, your
 * Consecrated weapon counts as Blessed at Greater grade, converting its damage to Holy*; D-1874): the
 * traits a blow reads. Where the Greater grade came from the talent (the weapon's stored traits do not
 * carry it) and the target is neither undead nor a demon - or no target is named - the blow reads the
 * Lesser grade 02's Consecrated gives, which converts nothing (`damage-spec.mjs#traitGrade`).
 *
 * @param {string[]} traits  the derived traits the blow would read
 * @param {{consecrated?: boolean, stored?: string[], kinds?: Iterable<string>|null}} o
 * @returns {string[]}
 */
export function sanctifiedTraits(traits = [], { consecrated = false, stored = [], kinds = null } = {}) {
  const greater = "Blessed (Greater)";
  if (!consecrated || !(traits ?? []).includes(greater) || (stored ?? []).includes(greater)) return [...(traits ?? [])];
  const k = new Set(kinds ?? []);
  if (k.has("undead") || k.has("demon")) return [...traits];
  return traits.map(t => (t === greater ? "Blessed (Lesser)" : t));
}

/* -------------------------------------------- */
/*  The Ranger's features that ride an attack    */
/* -------------------------------------------- */

/**
 * **02's AIMED SHOT AND KILL SHOT RIDE THE ATTACK** (the audit's A10: *As part of an attack, spend 3
 * Focus. It ignores cover and long-range Banes and adds your tier to its damage*; *As part of an attack
 * against your marked target, spend all your Quarry. Each point spent adds 1 to that attack's damage and
 * reduces the target's Armor Points by 2 for it, to a maximum reduction of 6*): D-770's rider rows, read
 * by `riders.mjs#ridersFor` beside the talents' as the Death Knight's `FEATURE_RIDERS` are.
 *
 * `cancels` (Aimed Shot) names the dialog lines the paid rider takes off the roll; `gate` (Kill Shot) is a
 * target gate the line needs, read through `talent-gates.mjs#gateHolds` - never drawn at a target the door
 * knows is not the Ranger's Quarry.
 */
export const RANGER_FEATURE_RIDERS = Object.freeze({
  "aimed-shot": Object.freeze({
    feature: "Aimed Shot",
    rider: Object.freeze({ cost: Object.freeze({ pool: "focus", amount: 3 }), onHit: Object.freeze({ damage: "tier" }), cancels: Object.freeze(["coverLight", "longRange"]) })
  }),
  "kill-shot": Object.freeze({
    feature: "Kill Shot",
    rider: Object.freeze({ cost: Object.freeze({ pool: "quarry", amount: "all" }), onHit: Object.freeze({ damage: "spent", pierce: "min(6,2*spent)" }), gate: Object.freeze({ quarried: true }) })
  })
});

/** The modifier lines Aimed Shot takes off (`rules/modifiers.mjs`' ids). */
export const AIMED_SHOT_CANCELS = RANGER_FEATURE_RIDERS["aimed-shot"].rider.cancels;

/**
 * The rider rows a Ranger's held features carry, as `death-knight.mjs#featureRiders` hands the knight's.
 *
 * @param {string[]} featureNames
 * @returns {{talents: Array<object>, rowOf: (className: string, identifier: string) => object|null}}
 */
export function rangerRiders(featureNames = []) {
  const held = new Set(featureNames ?? []);
  const talents = Object.entries(RANGER_FEATURE_RIDERS)
    .filter(([, row]) => held.has(row.feature))
    .map(([identifier, row]) => ({ className: "Ranger", identifier, name: row.feature, taken: 1 }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
  return { talents, rowOf: (className, identifier) => (RANGER_FEATURE_RIDERS[identifier] ? { rider: RANGER_FEATURE_RIDERS[identifier].rider } : null) };
}

/**
 * **THE LINES A PAID RIDER TAKES OFF THE ROLL** (Aimed Shot's cover and long-range Banes): the union of
 * every paid line's `cancels`, sorted.
 *
 * @param {Array<{line?: {row?: object}}>} paid
 * @returns {string[]}
 */
export function riderCancels(paid = []) {
  const out = new Set();
  for (const p of paid ?? []) for (const id of p?.line?.row?.cancels ?? []) out.add(String(id));
  return [...out].sort();
}
