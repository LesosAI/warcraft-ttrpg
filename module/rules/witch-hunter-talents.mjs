/**
 * **THE WITCH HUNTER'S FORTY-EIGHT TALENTS, AS LAW** (04-TALENTS' Wolf, Gryphon, Bear and Cat; the Witch Hunter
 * plan's wave 2b, D-2080 to D-2094). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Every number 04 prints for a talent is held ONCE here, in a constant named for it, and
 * `witch-hunter-talents.test.mjs` reads every one back off the chapter's own Effect cell at every rank. The rows are
 * `talent-effects.mjs`' (`"witch-hunter"`); a row reuses a kind another class built where one fits (a `damage` line,
 * a `passive`, a `parry` gain, a `momentum` gain, a `critical` range, a `hitLays` condition, an `evade` step, an
 * `extraStrike` card button, a `modifies` patch, an `armorAccess` row) and carries a `wh` key for what only this
 * class's doors read. The doors are named, function by function, in `WH_TALENT_DOORS`, which the test slices with the
 * comments blanked (`tools/strip-comments.mjs`), so a door in a comment or in the wrong function fails.
 *
 * Several of these talents were already read by name when this wave began, through the rules' own constants: wave 1b
 * and 2a wrote `dosesFor` (Extra Measure), `stampBrew` (Potent Brews, Sharper Oils, Wide Blast, Lasting Brews),
 * `studiedCount` (Forewarned), `learnBoons` and `learnRefusal` (Field Notes), `toxicityState` (Seasoned Blood,
 * Refined Decoctions), `signCost` and `signEffect` (the Gryphon talents) and `capFor` (Ursine Fury). Their doors are
 * pinned here as they stand.
 */

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The class every row is keyed under, as 02 names it. */
export const WH_CLASS = "Witch Hunter";

/** The talent stamp: identifier, name, and every number 04 prints for it. */
const talent = (identifier, name, numbers = {}) => Object.freeze({ identifier, name, ...numbers });

/* ------------------------------------------------------------------ */
/*  Wolf                                                                */
/* ------------------------------------------------------------------ */

/** *When you brew with **Field Brews**, you brew 1 more dose per rank.* (`brewing.mjs#dosesFor`) */
export const EXTRA_MEASURE_TALENT = talent("extra-measure", "Extra Measure", { perRank: 1 });
/** *... that restore Health restore 1 more per rank, and your bombs ... deal 1 more damage per rank.* (`stampBrew`) */
export const POTENT_BREWS_TALENT = talent("potent-brews", "Potent Brews", { heal: 1, damage: 1 });
/** *Once a round per rank, you may use an elixir or an oil from **Field Brews** as a free action instead of a Half-Action.* */
export const PRACTICED_HANDS = talent("practiced-hands", "Practiced Hands", { perRank: 1, kinds: Object.freeze(["elixir", "oil"]) });
/** *Your Hunter's oil from **Field Brews** adds 1 more damage per rank.* (`stampBrew`) */
export const SHARPER_OILS_TALENT = talent("sharper-oils", "Sharper Oils", { perRank: 1 });
/** *You have a Boon on the **Investigation** Test ... At rank 2 you may also make that Test when you finish a Short Rest.* */
export const FIELD_NOTES_TALENT = talent("field-notes", "Field Notes", { boons: 1, shortRank: 2 });
/** *Your bombs ... land 10 feet farther away per rank, and their radius grows by 5 feet per rank.* (`stampBrew`) */
export const WIDE_BLAST_TALENT = talent("wide-blast", "Wide Blast", { range: 10, radius: 5 });
/** *Your elixirs ... that last 1 minute last 1 more minute per rank.* (`stampBrew`) */
export const LASTING_BREWS_TALENT = talent("lasting-brews", "Lasting Brews", { minutes: 1 });
/** *When you choose types for **Studied**, you may choose 1 more per rank.* (`tome.mjs#studiedCount`) */
export const FOREWARNED_TALENT = talent("forewarned", "Forewarned", { perRank: 1 });
/** *Once a round per rank, after you throw a bomb from **Field Brews**, you may throw another as a free action.* */
export const CLUSTER_BOMB = talent("cluster-bomb", "Cluster Bomb", { perRank: 1 });
/** *... does not count toward your Toxicity limit ... At rank 2 you may be under the effect of two Decoctions at a time.* */
export const REFINED_DECOCTIONS_TALENT = talent("refined-decoctions", "Refined Decoctions", { twoAtRank: 2 });
/** *Your Toxicity limit from **Field Brews** rises by 1.* (`toxicity.mjs#toxicityLimit`) */
export const SEASONED_BLOOD_TALENT = talent("seasoned-blood", "Seasoned Blood", { limit: 1 });
/** *Once per Long Rest, as a Half-Action, each elixir and Decoction you brewed ... returns to the number of doses you brewed.* */
export const SECOND_BREWING_TALENT = talent("second-brewing", "Second Brewing", { per: "long", action: "half", kinds: Object.freeze(["elixir", "decoction"]) });

/* ------------------------------------------------------------------ */
/*  Gryphon                                                             */
/* ------------------------------------------------------------------ */

/** *The cones ... grow by 5 feet per rank, and your **Ash Sign** and **Lull Sign** reach 10 feet farther per rank.* */
export const FAR_SIGNS = talent("far-signs", "Far Signs", { cone: 5, reach: 10 });
/** *Your Ember Sign deals 1 more damage per rank.* */
export const SEARING_SCRIPT = talent("searing-script", "Searing Script", { perRank: 1 });
/** *Your first Sign each turn from **Signs** costs 1 Energy less per rank.* */
export const QUICK_SCRIPT = talent("quick-script", "Quick Script", { perRank: 1, nth: 1 });
/** *A creature that fails its Test against your Gale Sign takes Physical damage equal to your rank plus your tier.* */
export const SHATTERING_GALE = talent("shattering-gale", "Shattering Gale", { type: "physical" });
/** *A creature your **Lull Sign** leaves **Charmed** stays Charmed 1 more round per rank.* */
export const DEEP_LULL = talent("deep-lull", "Deep Lull", { perRank: 1 });
/** *When you use the Rowan Sign, each enemy within 5 feet of the creature that gains the Ward takes Fire damage equal to your rank plus your tier.* */
export const BURSTING_ROWAN = talent("bursting-rowan", "Bursting Rowan", { feet: 5, type: "fire" });
/** *The radius ... grows by 5 feet per rank, and an undead or a demon that starts its turn in it takes Holy damage equal to your rank.* */
export const ASHEN_RING = talent("ashen-ring", "Ashen Ring", { radius: 5, kinds: Object.freeze(["undead", "demon"]), type: "holy" });
/** *The cone of your Ember Sign stays alight until the start of your next turn. A creature that enters it or starts its turn in it takes Fire damage equal to your rank.* */
export const FIRESTREAM = talent("firestream", "Firestream", { type: "fire", rounds: 1 });
/** *The Ward your Rowan Sign gives rises by 1 per rank.* */
export const LIVING_ROWAN = talent("living-rowan", "Living Rowan", { perRank: 1 });
/** *Your second Sign each turn from **Signs** costs 1 Energy less per rank.* */
export const TWIN_SIGNS = talent("twin-signs", "Twin Signs", { perRank: 1, nth: 2 });
/** *When you use the Ember Sign, you may make it deal Holy damage instead of Fire.* */
export const HOLY_EMBER = talent("holy-ember", "Holy Ember", { type: "holy" });
/** *Each Sign from **Signs** costs 1 Energy less, to the minimum of 1 that **Signs** names.* */
export const SIGN_OF_THE_ORDER = talent("sign-of-the-order", "Sign of the Order", { less: 1, floor: 1 });

/* ------------------------------------------------------------------ */
/*  Bear                                                                */
/* ------------------------------------------------------------------ */

/** *You may wear plate without a Bane. At rank 2 you ignore the **Encumbering** trait of the suit you wear.* */
export const BEARS_HIDE = talent("bears-hide", "Bear's Hide", { categories: Object.freeze(["plate"]), suitRank: 2 });
/** *Your Body Resilience Tests gain 1 SL per rank.* */
export const IRON_STOMACH = talent("iron-stomach", "Iron Stomach", { boons: 1, resilience: "body", spiritRank: 2 });
/** *Your **Sunder** costs 1 Tempo less per rank.* (`maneuvers.mjs#maneuverCost`, floor 1) */
export const SPLITTING_BLOW = talent("splitting-blow", "Splitting Blow", { perRank: 1, maneuver: "sunder", floor: 1 });
/** *You have a Boon on Resilience Tests against being knocked **Prone** or moved. At rank 2, while you wield a weapon in two hands, you cannot be moved against your will.* */
export const UNBOWED = talent("unbowed", "Unbowed", { boons: 1, immovableRank: 2, wields: "bothHands" });
/** *Your attacks with a weapon in two hands deal 1 more damage per rank.* */
export const BEARS_WEIGHT = talent("bears-weight", "Bear's Weight", { perRank: 1, wields: "bothHands" });
/** *While you wield a weapon in two hands, a successful **Parry** gives you 1 Tempo per rank.* */
export const STEEL_GUARD = talent("steel-guard", "Steel Guard", { perRank: 1, wields: "bothHands", pool: "tempo" });
/** *Once a round per rank, when a melee attack hits you, you gain 1 Tempo.* */
export const BEARS_WRATH = talent("bears-wrath", "Bear's Wrath", { perRank: 1, tempo: 1, pool: "tempo" });
/** *Your **Whirling Steel** costs 1 Tempo less per rank.* (a `modifies` patch on 02's Whirling Steel) */
export const CRUSHING_SWEEP_TALENT = talent("crushing-sweep", "Crushing Sweep", { perRank: 1 });
/** *The first time in a fight that your Health drops below half, you gain temporary Health equal to twice your tier at rank 1 and four times your tier at rank 2.* */
export const BEARS_ENDURANCE = talent("bears-endurance", "Bear's Endurance", { perTier: Object.freeze([2, 4]), below: 0.5 });
/** *Your Tempo is capped at 8 instead of 5.* (`momentum.mjs#capFor` through `tempo.mjs#URSINE_FURY`) */
export const URSINE_FURY_TALENT = talent("ursine-fury", "Ursine Fury", { cap: 8 });
/** *When you hit with a weapon in two hands, the target is pushed 5 feet away from you per rank.* */
export const THUNDEROUS_SWING = talent("thunderous-swing", "Thunderous Swing", { feet: 5, wields: "bothHands" });
/** *Once per Short Rest, as a Half-Action, for 1 minute: your attacks with a weapon in two hands deal extra damage equal to your tier, and you gain 1 Armor Point on every location.* */
export const MOUNTAIN_BEAR = talent("mountain-bear", "Mountain Bear", { per: "short", action: "half", minutes: 1, ap: 1, wields: "bothHands" });

/* ------------------------------------------------------------------ */
/*  Cat                                                                 */
/* ------------------------------------------------------------------ */

/** *While you wear studded armor or lighter, your Defense rises by 1 per rank.* */
export const FELINE_REFLEXES = talent("feline-reflexes", "Feline Reflexes", { perRank: 1, atMost: "studded" });
/** *Once a round, when a melee attack misses you, you may move 5 feet per rank. This movement does not provoke Opportunity Attacks.* */
export const TUMBLE = talent("tumble", "Tumble", { feet: 5 });
/** *When you hit at SL 2 or higher, the target is **Slowed** until the end of its next turn. At rank 2 this applies at SL 1 or higher.* */
export const HOBBLING_CUT = talent("hobbling-cut", "Hobbling Cut", { sl: 2, rank2Sl: 1, condition: "slowed" });
/** *While you wear studded armor or lighter, your Speed rises by 5 feet per rank.* */
export const CATS_STEP = talent("cats-step", "Cat's Step", { feet: 5, atMost: "studded" });
/** *Your **Riposte** costs 1 Tempo less per rank, to a minimum of 1. At rank 2, a Riposte against a creature of a **Studied** type deals extra damage equal to your tier.* */
export const HUNTERS_RIPOSTE = talent("hunters-riposte", "Hunter's Riposte", { perRank: 1, floor: 1, damageRank: 2 });
/** *Your weapon attacks inflict a Critical Injury on 19 or 20. At rank 2 this applies on 18 to 20 against a creature of a **Studied** type.* */
export const LETHAL_EDGE = talent("lethal-edge", "Lethal Edge", { on: 19, studiedOn: 18 });
/** *When you have moved at least 10 feet this turn, your next attack this turn deals 1 more damage per rank.* */
export const LEAPING_STRIKE = talent("leaping-strike", "Leaping Strike", { feet: 10, perRank: 1 });
/** *In dim light or darkness, you have a Boon on **Stealth** Tests. Your first attack while hidden deals extra damage equal to your rank plus your tier.* */
export const NIGHT_EYES = talent("night-eyes", "Night Eyes", { boons: 1, skill: "stealth" });
/** *Once a round, after you hit, you may spend 2 Tempo to make one more attack against the same target. At rank 2 it costs 1 Tempo.* */
export const SECOND_CUT = talent("second-cut", "Second Cut", { cost: 2, rank2Cost: 1, pool: "tempo" });
/** *When you inflict a Critical Injury, gain 1 Tempo per rank.* */
export const KILL_RHYTHM = talent("kill-rhythm", "Kill Rhythm", { perRank: 1, pool: "tempo" });
/** *When an effect lets you halve its damage with a successful Reflex Resilience Test, you take no damage on a success and half on a failure.* */
export const NINE_LIVES = talent("nine-lives", "Nine Lives", { resilience: "reflex" });
/** *Once a round, when you hit with a weapon, you may spend 2 Tempo to make one attack with a Boon against a different creature within your reach.* */
export const CATS_DANCE = talent("cats-dance", "Cat's Dance", { cost: 2, boons: 1, pool: "tempo" });

/** Every talent of the four branches, by identifier, in 04's order: the census's own list. */
export const WH_TALENTS = Object.freeze(Object.fromEntries([
  EXTRA_MEASURE_TALENT, POTENT_BREWS_TALENT, PRACTICED_HANDS, SHARPER_OILS_TALENT, FIELD_NOTES_TALENT, WIDE_BLAST_TALENT,
  LASTING_BREWS_TALENT, FOREWARNED_TALENT, CLUSTER_BOMB, REFINED_DECOCTIONS_TALENT, SEASONED_BLOOD_TALENT, SECOND_BREWING_TALENT,
  FAR_SIGNS, SEARING_SCRIPT, QUICK_SCRIPT, SHATTERING_GALE, DEEP_LULL, BURSTING_ROWAN,
  ASHEN_RING, FIRESTREAM, LIVING_ROWAN, TWIN_SIGNS, HOLY_EMBER, SIGN_OF_THE_ORDER,
  BEARS_HIDE, IRON_STOMACH, SPLITTING_BLOW, UNBOWED, BEARS_WEIGHT, STEEL_GUARD,
  BEARS_WRATH, CRUSHING_SWEEP_TALENT, BEARS_ENDURANCE, URSINE_FURY_TALENT, THUNDEROUS_SWING, MOUNTAIN_BEAR,
  FELINE_REFLEXES, TUMBLE, HOBBLING_CUT, CATS_STEP, HUNTERS_RIPOSTE, LETHAL_EDGE,
  LEAPING_STRIKE, NIGHT_EYES, SECOND_CUT, KILL_RHYTHM, NINE_LIVES, CATS_DANCE
].map(c => [c.identifier, c])));

/* ------------------------------------------------------------------ */
/*  Ranks                                                               */
/* ------------------------------------------------------------------ */

/**
 * A Witch Hunter talent's rank among the talents taken as `rules/` reads them (`{className, identifier, taken}`), 0
 * where none is taken. By identifier and class, never by name: the Rogue holds a Tumble of its own.
 *
 * @param {Iterable<{className?: string, identifier?: string, taken?: number}>} talents
 * @param {string} identifier
 * @returns {number}
 */
export function whRankIn(talents = [], identifier) {
  let n = 0;
  for (const t of talents ?? []) if (t?.className === WH_CLASS && t.identifier === identifier) n += whole(t.taken);
  return n;
}

/**
 * The same off an actor's items (a collection or a list of item-like objects): a `talent` of the class, by identifier,
 * its `taken`.
 *
 * @param {Iterable<object>} items
 * @param {string} identifier
 * @returns {number}
 */
export function whRankOfItems(items = [], identifier) {
  let n = 0;
  for (const i of items ?? []) {
    if (i?.type !== "talent") continue;
    const s = i.system ?? {};
    if (s.identifier === identifier && s.className === WH_CLASS) n += whole(s.taken);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Wolf's doors                                                        */
/* ------------------------------------------------------------------ */

/** The actor flag a brewing's own record stands under: `{generation, rows: [{identifier, doses, type, school, name}]}`. */
export const WH_BREW_LOG_FLAG = "whBrewLog";

/**
 * **WHAT A BREWING RECORDS FOR SECOND BREWING** (T1: *each elixir and Decoction you brewed ... at your last rest
 * returns to the number of doses you brewed*): a dose drunk to the last is deleted with its item, so the brewing keeps
 * its own list. One row a brew made, in the plan's order.
 *
 * @param {number} generation
 * @param {Array<{identifier: string, doses: number, type?: string|null}>} make  `brewPlan`'s `make`
 * @param {{school?: string|null, names?: Record<string, string>}} [o]
 * @returns {{generation: number, rows: Array<{identifier: string, doses: number, type: string|null, school: string|null, name: string}>}}
 */
export function brewLogOf(generation, make = [], { school = null, names = {} } = {}) {
  return {
    generation: int(generation),
    rows: (make ?? []).filter(m => m?.identifier && whole(m.doses) > 0).map(m => ({
      identifier: String(m.identifier), doses: whole(m.doses), type: m.type ?? null,
      school: m.identifier === "decoction" ? (school ?? null) : null, name: String(names[m.identifier] ?? "")
    }))
  };
}

/**
 * **SECOND BREWING'S JUDGEMENT** before anything is paid: the brewing on record, and the elixirs and Decoction from
 * it that stand below the doses they were brewed with (`brewing.mjs#secondBrewingPlan` does the arithmetic). `held`
 * is every dose of this brewing anybody still holds, by row key. A key under
 * `AZEROTH.WhTalent.SecondBrewing.Refuse.`, or the rows to restore.
 *
 * @param {{log?: object|null, held?: Record<string, number>, plan: Function}} o  `plan` is `secondBrewingPlan`
 * @returns {{refusal: null|"noLog"|"full", rows: Array<{key: string, identifier: string, type: string|null, school: string|null, name: string, from: number, to: number}>}}
 */
export function secondBrewingJudgement({ log = null, held = {}, plan } = {}) {
  const rows = Array.isArray(log?.rows) ? log.rows : [];
  if (!rows.length) return { refusal: "noLog", rows: [] };
  const keyed = rows.map((r, i) => ({ ...r, key: brewRowKey(r, i) }));
  const restored = plan(keyed.map(r => ({ id: r.key, identifier: r.identifier, brewed: r.doses, left: whole(held[r.key]) })));
  const out = restored.map(p => {
    const r = keyed.find(k => k.key === p.id);
    return { key: r.key, identifier: r.identifier, type: r.type ?? null, school: r.school ?? null, name: r.name ?? "", from: p.from, to: p.to };
  });
  return out.length ? { refusal: null, rows: out } : { refusal: "full", rows: [] };
}

/** One logged brew's key: its identifier and its type, so two Decoctions of two types never share one. */
export function brewRowKey(row, index = 0) {
  return `${String(row?.identifier ?? "")}:${row?.type ?? ""}:${int(index)}`;
}

/**
 * **A BREW USED AS A FREE ACTION, AND WHICH TALENT PAYS FOR IT** (04's Practiced Hands: *Once a round per rank, you
 * may use an elixir or an oil ... as a free action*; Cluster Bomb: *Once a round per rank, after you throw a bomb ...
 * you may throw another as a free action*). Judged before the budget; null where the Use is the Half-Action 08 §12
 * prices. Only in a fight, where a round and a Half-Action exist (out of one no budget is spent). The marks are the
 * round's record (`practiced-hands:N`, `cluster-bomb:N`); Cluster Bomb also needs a bomb already thrown this turn
 * (`thrown`, the turn's `wh-bomb@<turn>` mark).
 *
 * @param {{kind?: string|null, inFight?: boolean, practicedHands?: number, clusterBomb?: number, used?: string[], thrown?: boolean,
 *   nextMark: Function}} o  `nextMark` is `class-talents.mjs#nextRoundMark`
 * @returns {{identifier: string, name: string, mark: string}|null}
 */
export function freeBrewBy({ kind = null, inFight = false, practicedHands = 0, clusterBomb = 0, used = [], thrown = false, nextMark } = {}) {
  if (inFight !== true || typeof nextMark !== "function") return null;
  if (PRACTICED_HANDS.kinds.includes(kind) && whole(practicedHands) > 0) {
    const mark = nextMark(PRACTICED_HANDS.identifier, PRACTICED_HANDS.perRank * whole(practicedHands), used);
    if (mark) return { identifier: PRACTICED_HANDS.identifier, name: PRACTICED_HANDS.name, mark };
  }
  if (kind === "bomb" && thrown === true && whole(clusterBomb) > 0) {
    const mark = nextMark(CLUSTER_BOMB.identifier, CLUSTER_BOMB.perRank * whole(clusterBomb), used);
    if (mark) return { identifier: CLUSTER_BOMB.identifier, name: CLUSTER_BOMB.name, mark };
  }
  return null;
}

/** The round record's mark a bomb thrown this turn leaves (Cluster Bomb's *after you throw a bomb*). */
export const BOMB_TURN_MARK = "wh-bomb";

/* ------------------------------------------------------------------ */
/*  Gryphon's doors                                                     */
/* ------------------------------------------------------------------ */

/**
 * **FIRESTREAM'S CONE, AS AN AREA THAT STRIKES** (*stays alight until the start of your next turn. A creature that
 * enters it or starts its turn in it takes Fire damage equal to your rank*): D-756's area tick, every creature,
 * on entry and at a turn's start, for the one round to the hunter's next turn. `empty` is `area-ticks.mjs`'s
 * `emptyAreaTick()`, handed in so this module stays free of the config.
 *
 * @param {{rank?: number, empty: object}} o
 * @returns {object|null}
 */
export function firestreamTick({ rank = 0, empty } = {}) {
  const r = whole(rank);
  if (r < 1 || !empty) return null;
  return { ...empty, who: "creature", damage: { rating: r, school: FIRESTREAM.type }, onEnter: true, lasts: { rounds: FIRESTREAM.rounds } };
}

/** Bursting Rowan's Fire damage: your rank plus your tier, nothing untaken. */
export function burstDamage({ rank = 0, tier = 1 } = {}) {
  const r = whole(rank);
  return r > 0 ? r + tierOf(tier) : 0;
}

/**
 * **DEEP LULL'S ROUNDS, LAID ON THE CHARMED'S SPAN** (*stays Charmed 1 more round per rank*): a span the Lull Sign's
 * failure lays, lengthened by that many rounds - a fight's span by a round of turns each (`turnsPerRound`, the fight's
 * own count, so the Charmed still ends as the creature's own turn ends), the world's clock by a round of seconds each.
 * A span this cannot read is returned as it came.
 *
 * @param {object|null} span  `{duration, start}`
 * @param {number} rounds
 * @param {{turnsPerRound?: number, roundSeconds?: number}} [o]
 * @returns {object|null}
 */
export function lengthenSpan(span, rounds = 0, { turnsPerRound = 1, roundSeconds = 6 } = {}) {
  const n = whole(rounds);
  if (!span || typeof span !== "object" || !span.duration || n < 1) return span ?? null;
  const d = span.duration;
  const value = int(d.value);
  if (d.units === "turns") return { ...span, duration: { ...d, value: value + n * Math.max(1, whole(turnsPerRound)) } };
  if (d.units === "rounds") return { ...span, duration: { ...d, value: value + n } };
  if (d.units === "seconds") return { ...span, duration: { ...d, value: value + n * Math.max(1, whole(roundSeconds)) } };
  return span;
}

/* ------------------------------------------------------------------ */
/*  Bear's doors                                                        */
/* ------------------------------------------------------------------ */

/**
 * **IRON STOMACH ON ONE TEST** (*You have a Boon on Body Resilience Tests. At rank 2 you also have a Boon on Spirit
 * Resilience Tests*; the lead, 2026-11-27: *"Iron Stomach - change to boon"*, replacing the +1 SL a rank, which
 * changed no outcome under 05 §2; the rank 2 half is MY READING, because a Boon does not stack and the talent has two
 * ranks): the Boon the roll dialog draws as an automatic line, or 0 where the Test is another Resilience or the talent
 * is untaken.
 *
 * @param {{rank?: number, resilience?: string|null}} o
 * @returns {number}
 */
export function ironStomachBoons({ rank = 0, resilience = null } = {}) {
  const r = whole(rank);
  if (r < 1) return 0;
  if (resilience === IRON_STOMACH.resilience) return IRON_STOMACH.boons;
  return resilience === "spirit" && r >= IRON_STOMACH.spiritRank ? IRON_STOMACH.boons : 0;
}

/** Whether a blow took the Health from at or above half to below it (Bear's Endurance's *drops below half*). */
export function droppedBelowHalf({ before = 0, after = 0, max = 0 } = {}) {
  const m = Number(max);
  if (!(m > 0)) return false;
  return Number(before) >= m * BEARS_ENDURANCE.below && Number(after) < m * BEARS_ENDURANCE.below;
}

/** Bear's Endurance's temporary Health: twice your tier at rank 1, four times at rank 2. */
export function enduranceTemp({ rank = 0, tier = 1 } = {}) {
  const r = whole(rank);
  if (r < 1) return 0;
  return BEARS_ENDURANCE.perTier[Math.min(r, BEARS_ENDURANCE.perTier.length) - 1] * tierOf(tier);
}

/**
 * **BEAR'S WRATH ON ONE BLOW TAKEN** (*Once a round per rank, when a melee attack hits you, you gain 1 Tempo*): the
 * round's next free mark (`bears-wrath:N`), or null - not a melee attack, no hit, untaken, or every mark spent.
 *
 * @param {{rank?: number, melee?: boolean, attack?: boolean, used?: string[], nextMark: Function}} o
 * @returns {{mark: string, tempo: number}|null}
 */
export function wrathGain({ rank = 0, melee = false, attack = false, used = [], nextMark } = {}) {
  if (whole(rank) < 1 || melee !== true || attack !== true || typeof nextMark !== "function") return null;
  const mark = nextMark(BEARS_WRATH.identifier, BEARS_WRATH.perRank * whole(rank), used);
  return mark ? { mark, tempo: BEARS_WRATH.tempo } : null;
}

/** Thunderous Swing's push: 5 feet per rank, nothing untaken. */
export function thunderousFeet(rank = 0) {
  return THUNDEROUS_SWING.feet * whole(rank);
}

/**
 * **UNBOWED'S BOON ON A RESIST** (*a Boon on Resilience Tests against being knocked **Prone** or moved*): one, where
 * the card being resisted says its failure moves the creature (D-778's `forced` record) or knocks it Prone (its
 * `onFailInflicts`). Anything else is the table's line on the dialog (`unbowedJudged`).
 *
 * @param {{rank?: number, flags?: object}} o  the card's `flags["azeroth-rpg"]`
 * @returns {number}
 */
export function unbowedBoons({ rank = 0, flags = {} } = {}) {
  if (whole(rank) < 1) return 0;
  const moves = Boolean(flags?.forced && typeof flags.forced === "object" && whole(flags.forced.feet) > 0);
  const prone = (flags?.onFailInflicts ?? []).some(i => i?.condition === "prone");
  return moves || prone ? UNBOWED.boons : 0;
}

/**
 * **UNBOWED AT RANK 2** (*while you wield a weapon in two hands, you cannot be moved against your will*): whether a
 * forced move is refused. A move the creature is willing to take (an ally's, its own) is not against its will.
 *
 * @param {{rank?: number, bothHands?: boolean, willing?: boolean}} o
 */
export function unbowedRefuses({ rank = 0, bothHands = false, willing = false } = {}) {
  return whole(rank) >= UNBOWED.immovableRank && bothHands === true && willing !== true;
}

/** The flag Mountain Bear's minute stands under, on the hunter's own effect: `{tier, by}`. */
export const MOUNTAIN_BEAR_FLAG = "whMountainBear";

/** Mountain Bear's Armor Point on every location: a `final` add, because Armor Points are derived (CLAUDE.md §15). */
export function mountainBearChanges() {
  return ["body", "head", "limb"].map(location => ({ key: `system.ap.${location}`, type: "add", value: String(MOUNTAIN_BEAR.ap), phase: "final" }));
}

/** Mountain Bear's extra damage on one attack: the tier, where the minute stands and the weapon is in two hands. */
export function mountainBearDamage({ stands = false, bothHands = false, tier = 1 } = {}) {
  return stands === true && bothHands === true ? tierOf(tier) : 0;
}

/* ------------------------------------------------------------------ */
/*  Cat's doors                                                         */
/* ------------------------------------------------------------------ */

/**
 * **NINE LIVES AT THE APPLY** (T5, MY READING accepted: Evasion - *you take no damage on a success and half on a
 * failure*): on a card whose damage halves on a passed Test, against a Reflex Resilience Test the holder made, what
 * the holder takes - `none` on a success, `half` on a failure - or null where the talent does not reach this card.
 * A creature with no Test recorded takes the whole, as every Apply reads it.
 *
 * @param {{holds?: boolean, halfOnPass?: boolean, resilience?: string|null, success?: boolean|null}} o
 * @returns {"none"|"half"|null}
 */
export function nineLivesApply({ holds = false, halfOnPass = false, resilience = null, success = null } = {}) {
  if (holds !== true || halfOnPass !== true || resilience !== NINE_LIVES.resilience) return null;
  if (success === true) return "none";
  return success === false ? "half" : null;
}

/** Second Cut's Tempo at a rank: 2, or 1 at rank 2. */
export function secondCutCost(rank = 1) {
  return whole(rank) >= 2 ? SECOND_CUT.rank2Cost : SECOND_CUT.cost;
}

/**
 * **LEAPING STRIKE'S PROMISE** (*When you have moved at least 10 feet this turn, your next attack this turn deals 1
 * more damage per rank*): the next-attack promise to lay (`rules/next-attack.mjs`, held to the turn), or null - not
 * taken, or the turn has not metered 10 feet. MY READING: once a turn, claimed on the round's record.
 *
 * @param {{rank?: number, feet?: number}} o
 * @returns {{source: string, name: string, damage: number, lasts: "turn"}|null}
 */
export function leapingGrant({ rank = 0, feet = 0 } = {}) {
  const r = whole(rank);
  if (r < 1 || !(Number(feet) >= LEAPING_STRIKE.feet)) return null;
  return { source: LEAPING_STRIKE.identifier, name: LEAPING_STRIKE.name, damage: LEAPING_STRIKE.perRank * r, lasts: "turn" };
}

/* ------------------------------------------------------------------ */
/*  The roll dialog's lines                                             */
/* ------------------------------------------------------------------ */

/**
 * **THE LINES A WITCH HUNTER'S TALENTS PUT ON A TEST'S DIALOG** that only the table can judge (D2 §12), unticked:
 * Night Eyes' Boon on a **Stealth** Test (*In dim light or darkness*: the light is the GM's) and Unbowed's on a
 * Resilience Test (*against being knocked **Prone** or moved*: what the Test is against is the table's, where no card
 * says so; a card that does is the Resist door's automatic Boon, `unbowedBoons`). Each in the dialog's judgement-line
 * shape, its label a lang key.
 *
 * @param {{kind?: string, skill?: string|null, nightEyes?: number, unbowed?: number}} o
 * @returns {Array<{id: string, name: string, label: string, boons: number, banes: number, checked: boolean}>}
 */
export function whDialogLines({ kind = "skill", skill = null, nightEyes = 0, unbowed = 0 } = {}) {
  const out = [];
  if (kind === "skill" && skill === NIGHT_EYES.skill && whole(nightEyes) > 0) {
    out.push({ id: `talent-${NIGHT_EYES.identifier}`, name: NIGHT_EYES.name, label: "AZEROTH.WhTalent.NightEyes.Line", boons: NIGHT_EYES.boons, banes: 0, checked: false });
  }
  if (kind === "resilience" && whole(unbowed) > 0) {
    out.push({ id: `talent-${UNBOWED.identifier}`, name: UNBOWED.name, label: "AZEROTH.WhTalent.Unbowed.Line", boons: UNBOWED.boons, banes: 0, checked: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  The doors' census                                                   */
/* ------------------------------------------------------------------ */

/**
 * **EVERY TALENT'S DOOR, BY THE FUNCTION THAT CALLS IT** (the Demon Hunter's `DH_TALENT_DOORS` shape): `{file, fn,
 * call}` - `witch-hunter-talents.test.mjs` slices `file` to `fn` with the comments blanked and fails a `call` the
 * slice does not hold.
 */
const door = (file, fn, call) => Object.freeze({ file, fn, call });
const FX = "module/effects/witch-hunter-talents.mjs";
const BREWS = "module/effects/witch-hunter-brews.mjs";
const SIGNS_FX = "module/effects/witch-hunter-signs.mjs";
const TOME_FX = "module/effects/witch-hunter-tome.mjs";
const WF = "module/dice/workflows.mjs";
const ACTOR = "module/documents/actor.mjs";
const CHAR = "module/data/actor/character.mjs";
const CHAT = "module/dice/chat.mjs";
const ACTIONS = "module/applications/actions.mjs";
const DIALOG = "module/applications/roll-dialog.mjs";
const PREPARE = "module/applications/brew-prepare.mjs";
const COMBAT = "module/documents/combat.mjs";
const ROLL = "module/dice/azeroth-roll.mjs";
const BREW_LAW = "module/rules/witch-hunter-brews.mjs";
const SIGN_LAW = "module/rules/witch-hunter-features.mjs";
const TALENT_LAW = "module/rules/class-talents.mjs";
export const WH_TALENT_DOORS = Object.freeze({
  // Wolf
  "extra-measure": [door(BREWS, "prepareJudgement", "ranks(actor, EXTRA_MEASURE)"), door(PREPARE, "setState", "actor.talentRanks?.(EXTRA_MEASURE)")],
  "potent-brews": [door(BREWS, "wolfRanks", "ranks(actor, POTENT_BREWS)"), door(BREW_LAW, "stampBrew", "potentBrews")],
  "practiced-hands": [door(BREWS, "useBrewHeld", "freeBrewFor("), door(FX, "freeBrewFor", "freeBrewBy(")],
  "sharper-oils": [door(BREWS, "wolfRanks", "ranks(actor, SHARPER_OILS)"), door(BREW_LAW, "stampBrew", "sharperOils")],
  "field-notes": [door(TOME_FX, "learnTypeWithDialog", "talentRanks?.(FIELD_NOTES)")],
  "wide-blast": [door(BREWS, "wolfRanks", "ranks(actor, WIDE_BLAST.name)"), door(BREW_LAW, "stampBrew", "WIDE_BLAST.radius")],
  "lasting-brews": [door(BREWS, "wolfRanks", "ranks(actor, LASTING_BREWS)"), door(BREW_LAW, "stampBrew", "lastingBrews")],
  "forewarned": [door(BREWS, "prepareJudgement", "ranks(actor, FOREWARNED)")],
  "cluster-bomb": [door(BREWS, "useBrewHeld", "freeBrewFor("), door(BREWS, "useBrewHeld", "markBombThrown("), door(FX, "freeBrewFor", "freeBrewBy(")],
  "refined-decoctions": [door(BREWS, "toxicityRanks", "ranks(actor, REFINED_DECOCTIONS)"), door(DIALOG, "prepareRoll", "talentRanks?.(REFINED_DECOCTIONS)")],
  "seasoned-blood": [door(BREWS, "toxicityRanks", "ranks(actor, SEASONED_BLOOD)"), door(DIALOG, "prepareRoll", "talentRanks?.(SEASONED_BLOOD)")],
  "second-brewing": [door(BREWS, "prepareBrews", "brewLogOf("), door(FX, "judgeWhTalentUse", "secondBrewingJudgement("), door(FX, "landSecondBrewing", "createEmbeddedDocuments(\"Item\"")],
  // Gryphon
  "far-signs": [door(SIGNS_FX, "gryphonRanks", "Object.entries(GRYPHON)"), door(SIGN_LAW, "signEffect", "r(\"farSigns\")")],
  "searing-script": [door(SIGN_LAW, "signEffect", "r(\"searingScript\")")],
  "quick-script": [door(SIGN_LAW, "signCost", "ranks.quickScript")],
  "shattering-gale": [door(SIGN_LAW, "signEffect", "r(\"shatteringGale\")"), door(SIGNS_FX, "coneSys", "e.onFail?.damage")],
  "deep-lull": [door(SIGNS_FX, "judgeLull", "moreRounds:"), door(WF, "useFeature", "moreRounds"), door(CHAT, "rollResists", "lengthenSpan(")],
  "bursting-rowan": [door(SIGNS_FX, "landRowan", "burstFromRowan("), door(FX, "burstHere", "strikeFromArea(")],
  "ashen-ring": [door(SIGN_LAW, "signEffect", "r(\"ashenRing\")"), door(SIGN_LAW, "ashRingTick", "effect?.tick?.damage")],
  "firestream": [door(SIGNS_FX, "afterSignCard", "placeFirestream("), door(FX, "placeFirestream", "firestreamTick(")],
  "living-rowan": [door(SIGN_LAW, "signEffect", "r(\"livingRowan\")")],
  "twin-signs": [door(SIGN_LAW, "signCost", "ranks.twinSigns")],
  "holy-ember": [door(SIGNS_FX, "judgeSign", "ranks.holyEmber > 0")],
  "sign-of-the-order": [door(SIGN_LAW, "signCost", "ranks.signOfTheOrder")],
  // Bear
  "bears-hide": [door(TALENT_LAW, "armorAccessFor", "waivesSuitEncumbering"), door(CHAR, "prepareDerivedData", "suitWaived")],
  "iron-stomach": [door(DIALOG, "prepareRoll", "ironStomachBoons(")],
  "splitting-blow": [door("module/rules/maneuvers.mjs", "maneuverCost", "ranksOf(talents, \"Splitting Blow\")")],
  "unbowed": [door(TOME_FX, "resistLinesFor", "unbowedBoons("), door("module/effects/forced-movement.mjs", "moveHere", "unbowedHolds("), door(DIALOG, "prepareRoll", "whDialogLines(")],
  "bears-weight": [door(ACTIONS, "talentDamageLines", "damageRowsFor(")],
  "steel-guard": [door(ACTIONS, "parryNow", "parryGainsFor(")],
  "bears-wrath": [door(ACTOR, "_struckBy", "whWhenStruck("), door(FX, "whWhenStruck", "wrathGain(")],
  "crushing-sweep": [door("module/rules/talent-effects.mjs", "applyPatch", "c.cost?.delta")],
  "bears-endurance": [door(ACTOR, "_struckBy", "whWhenStruck("), door(FX, "whWhenStruck", "grantTemporaryHealth(")],
  "ursine-fury": [door("module/rules/momentum.mjs", "capFor", "ranks(URSINE_FURY)")],
  "thunderous-swing": [door(WF, "rollTest", "whTalentsOnHit("), door(FX, "whTalentsOnHit", "forceMove(")],
  "mountain-bear": [door(FX, "judgeWhTalentUse", "MOUNTAIN_BEAR_FLAG"), door(FX, "landMountainBear", "mountainBearChanges("), door(TOME_FX, "witchHunterBlow", "mountainBearDamage(")],
  // Cat
  "feline-reflexes": [door("module/rules/talent-effects.mjs", "passivesFor", "gateHolds(p.when, { wield })")],
  "tumble": [door(WF, "rollTest", "evadeFor("), door(CHAT, "evadeFromCard", "evadeFor(")],
  "hobbling-cut": [door(WF, "rollTest", "hitConditionsFor(")],
  "cats-step": [door("module/rules/talent-effects.mjs", "passivesFor", "gateHolds(p.when, { wield })")],
  "hunters-riposte": [door("module/rules/maneuvers.mjs", "maneuverCost", "ranksOf(talents, \"Hunter's Riposte\")"), door(ACTIONS, "talentDamageLines", "damageRowsFor(")],
  "lethal-edge": [door(WF, "rollTest", "criticalRangeFor("), door(TALENT_LAW, "criticalRangeFor", "r.or")],
  "leaping-strike": [door(COMBAT, "spendMovement", "layLeapingStrike("), door(FX, "layLeapingStrike", "leapingGrant(")],
  "night-eyes": [door(ACTIONS, "attackWithDialog", "hidden: isHiddenFor("), door(DIALOG, "prepareRoll", "whDialogLines(")],
  "second-cut": [door(WF, "extraStrikeOffers", "extraStrikesFor("), door(CHAT, "extraStrikeFromCard", "offer.cost")],
  "kill-rhythm": [door(WF, "rollTest", "momentumOnHitFor(")],
  "nine-lives": [door(CHAT, "applyDamageToTargets", "nineLivesFor(")],
  "cats-dance": [door(WF, "extraStrikeOffers", "extraStrikesFor("), door(CHAT, "extraStrikeFromCard", "offer.reach")]
});
