/**
 * **14 §1's BOSS ACTIONS, FOR EVERY BOSS** (D-809). Pure: no Foundry.
 *
 * Two halves:
 *
 * 1. **The economy.** *A creature whose stat block lists Boss Actions holds the
 *    number printed with the list, each round. After any player character ends
 *    their turn, the creature may spend one to take one action from its list.
 *    They refresh at the top of the round and unspent ones are lost. An action
 *    marked ×2 costs two of them. [...] It is also the only time a creature
 *    spends two after the same turn, which it may not otherwise do.*
 *    `bossPressJudgement` is the one judgement every press asks - a test, a
 *    summon, an attack, a heal, a spell and a door alike - and
 *    `effects/boss-points.mjs` is the one writer. The moment stays the GM's
 *    (D-691); the COUNT is enforced (the lead's ruling on Q17): one Boss Action,
 *    or one ×2, after each turn of the fight.
 *
 * 2. **What each Boss Action does.** `BOSS_PLANS` is the hand-reviewed table over
 *    all 112 rows in 14, keyed by the creature's name and the action's. The
 *    bestiary parser lays each row's overrides on the seeded descriptor
 *    (`applyBossPlan`), so the pack carries them and `packs:parse` regenerates
 *    them; `boss-action-census.test.mjs` holds the table to 14 both ways and
 *    number for number. Every damage row carries a type (the lead: *"The damage
 *    should be school relevant to the ability. If not relevant, use physical
 *    default."*), every condition with a span carries its span, and what the
 *    generic descriptor cannot hold rides `automation.plan`, read by
 *    `effects/boss-doors.mjs` and by the card's own doors.
 */

import { CATALOGUE_BOSS_PLANS } from "./boss-plans-catalogue.mjs";

/** The doors a plan may name for what the generic descriptor cannot hold. */
export const BOSS_DOORS = Object.freeze([
  // Shadow Step, Step Aside: the Boss moves to a space it picks, and the next attack against it misses.
  "relocateSelf",
  // Elsewhere: one creature is put down where the Boss picks.
  "relocateTarget",
  // Sent to a Room: one creature is moved away and returns at the start of the round after next.
  "away",
  // Deathcharger's Trample: the Boss rides the line it placed.
  "selfLine",
  // Cut and Turn: the Boss moves without provoking, then attacks.
  "disengage",
  // Unholy Command: one ally attacks now, with a Boon.
  "allyAttack",
  // Sell Them Out: a named creature; the Boss's side takes a Boon against it and the first hit 4 more.
  "marked",
  // Amani Fury: the Boss's attacks and every attack against it take a Boon.
  "amaniFury",
  // Class Call: a named class takes a Bane on Casting Tests.
  "classCall",
  // Enfeeble: one creature's Armor Points count as 0.
  "enfeeble",
  // Three Places at Once: two copies of the Boss.
  "copies",
  // Raise the Fallen, The Dead Attend, Raise Mograine: a body raised where a creature fell.
  "raise",
  // Gyth Takes the Air: Rend and his mount move, and the next attack against either misses.
  "gyth",
  // Named Quarry (a creature's ability, D-811): one creature named; the namer's own attack
  // Tests against it take Boon for the encounter, and a second name ends the first.
  "quarry"
]);

/** When a part of a plan lands: at the press, or on a failed Resilience Test. */
export const PLAN_ON = Object.freeze(["press", "fail"]);

/** How long a placed zone stands. */
export const ZONE_LASTS = Object.freeze(["encounter", "round"]);

/** The pools a plan may take from or add to. */
const POOLS = Object.freeze(["mana", "power"]);

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = v => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
const oneOf = (v, list) => (typeof v === "string" && list.includes(v) ? v : null);
const isObj = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/*  The plan, cleaned                                                  */
/* ------------------------------------------------------------------ */

/**
 * A stored plan made valid: every key it may hold, each cleaned, and a key that
 * is absent left absent - a plan is written WHOLE with its row (an array is
 * written whole, CLAUDE.md §15), so nothing here rebuilds what was not handed in.
 * An unknown key is dropped. An empty result is `{}`.
 *
 * @param {unknown} raw
 * @returns {object}
 */
export function cleanBossPlan(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  if (isObj(raw.gather)) {
    // `ally` (D-811): the user's own side, the user among them (D-755's reading of an ally).
    const who = oneOf(raw.gather.who, ["creature", "enemy", "ally"]);
    const feet = raw.gather.feet === "reach" ? "reach" : int(raw.gather.feet);
    if (who && (feet === "reach" || feet > 0)) out.gather = { who, feet };
  }
  if (isObj(raw.forced)) {
    const feet = int(raw.forced.feet);
    const on = oneOf(raw.forced.on, PLAN_ON);
    const toward = oneOf(raw.forced.toward, ["away", "toward"]);
    if (feet > 0 && on && toward) out.forced = { on, feet, toward };
  }
  if (raw.selfHeal === true) out.selfHeal = true;
  // *casts Frostbolt without paying its Mana* (D-1829): a Boss Action that casts pays no Mana,
  // read by `applications/actions.mjs#useAbilityWithDialog` as a free cast.
  if (raw.freeMana === true) out.freeMana = true;
  if (int(raw.healAlt) > 0) out.healAlt = int(raw.healAlt);
  if (isObj(raw.drain)) {
    if (raw.drain.dealt === true) out.drain = { dealt: true };
    else if (int(raw.drain.fixed) > 0) out.drain = { fixed: int(raw.drain.fixed) };
  }
  if (isObj(raw.poolLoss)) {
    const pool = oneOf(raw.poolLoss.pool, POOLS);
    const amount = int(raw.poolLoss.amount);
    const on = oneOf(raw.poolLoss.on, PLAN_ON);
    // `gain` (D-811): the user gains what it drained, one for one, at the press (14's Arcane
    // Torrent: *the citizen gains 1 for each one drained*).
    if (pool && amount > 0 && on) out.poolLoss = { pool, amount, on, ...(raw.poolLoss.gain === true && on === "press" ? { gain: true } : {}) };
  }
  if (isObj(raw.poolGain)) {
    const pool = oneOf(raw.poolGain.pool, POOLS);
    const amount = int(raw.poolGain.amount);
    if (pool && amount > 0) out.poolGain = { pool, amount };
  }
  if (isObj(raw.escape)) {
    const dc = int(raw.escape.dc);
    const resilience = oneOf(raw.escape.resilience, ["body", "reflex", "spirit"]);
    if (dc > 0 && resilience) out.escape = { resilience, dc, ...(typeof raw.escape.skill === "string" && raw.escape.skill ? { skill: raw.escape.skill } : {}) };
  }
  if (isObj(raw.sunder)) {
    const amount = int(raw.sunder.amount);
    const location = oneOf(raw.sunder.location, ["body", "head", "limb"]);
    const on = oneOf(raw.sunder.on, PLAN_ON);
    if (amount > 0 && location && on) out.sunder = { location, amount, on };
  }
  if (isObj(raw.bane)) {
    const kind = oneOf(raw.bane.kind, ["attack", "casting", "skill", "resilience", "all"]);
    const on = oneOf(raw.bane.on, PLAN_ON);
    if (kind && on) out.bane = { kind, on, only: raw.bane.only === "self" ? "self" : null };
  }
  // A Boon laid at the press on every creature the press reaches, spent by its next Test of the
  // kind (D-811; 14's Battle Squawk: *gains a Boon on its next Attack Test*).
  if (isObj(raw.boon)) {
    const kind = oneOf(raw.boon.kind, ["attack", "casting", "skill", "resilience", "all"]);
    if (kind && raw.boon.on === "press") out.boon = { kind, on: "press" };
  }
  // How many creatures the press is aimed at, and how far (D-811; 14's Counterspell: *a
  // Casting Test it can see within 30 feet*): exactly `count`, each within `feet`.
  if (isObj(raw.target)) {
    const count = int(raw.target.count);
    const feet = int(raw.target.feet);
    if (count > 0 && feet > 0) out.target = { count, feet };
  }
  if (isObj(raw.sideSwitch)) {
    const until = oneOf(raw.sideSwitch.until, ["endOfNextTurn", "encounter"]);
    const kinds = Array.isArray(raw.sideSwitch.kinds) ? raw.sideSwitch.kinds.filter(k => typeof k === "string" && k) : [];
    if (until) out.sideSwitch = { until, kinds, on: "fail" };
  }
  if (isObj(raw.cannotAttack)) out.cannotAttack = { on: "fail" };
  if (isObj(raw.reminder)) out.reminder = { on: "fail" };
  if (isObj(raw.zone)) {
    const lasts = oneOf(raw.zone.lasts, ZONE_LASTS);
    if (lasts) {
      const zone = { lasts, difficult: raw.zone.difficult === true };
      if (int(raw.zone.damage) > 0) {
        zone.damage = int(raw.zone.damage);
        zone.school = typeof raw.zone.school === "string" ? raw.zone.school : "physical";
      }
      const c = raw.zone.check;
      if (isObj(c) && oneOf(c.resilience, ["body", "reflex", "spirit"]) && int(c.dc) > 0) {
        zone.check = {
          resilience: c.resilience, dc: int(c.dc),
          rating: int(c.rating) > 0 ? int(c.rating) : null,
          school: typeof c.school === "string" ? c.school : null,
          statuses: Array.isArray(c.statuses) ? c.statuses.filter(s => typeof s === "string" && s) : [],
          ...(isObj(c.afflict) && typeof c.afflict.key === "string" ? { afflict: { key: c.afflict.key, name: String(c.afflict.name ?? "") } } : {})
        };
      }
      out.zone = zone;
    }
  }
  if (isObj(raw.grip)) {
    const damage = int(raw.grip.damage);
    if (damage > 0) out.grip = { damage, type: typeof raw.grip.type === "string" ? raw.grip.type : "physical" };
  }
  if (isObj(raw.attack)) {
    const attack = {};
    if (raw.attack.allowance === "reach") attack.allowance = "reach";
    else if (int(raw.attack.allowance) > 0) attack.allowance = int(raw.attack.allowance);
    if (int(raw.attack.boons) > 0) attack.boons = int(raw.attack.boons);
    if (raw.attack.boonGate === "wounded") attack.boonGate = "wounded";
    if (Array.isArray(raw.attack.landsOnHit)) {
      const lands = raw.attack.landsOnHit.filter(l => isObj(l) && typeof l.condition === "string" && l.condition)
        .map(l => ({ condition: l.condition, value: int(l.value) > 0 ? int(l.value) : null }));
      if (lands.length) attack.landsOnHit = lands;
    }
    if (Object.keys(attack).length) out.attack = attack;
  }
  const door = oneOf(raw.door, BOSS_DOORS);
  if (door) {
    out.door = door;
    if (int(raw.feet) > 0) out.feet = int(raw.feet);
    if (raw.missNext === true) out.missNext = true;
    // `boons: 0` is kept (D-1829): *one ogre ally makes one attack at once* names no Boon, and
    // the ally door's own default is one.
    if (int(raw.boons) !== null && int(raw.boons) >= 0) out.boons = int(raw.boons);
    if (int(raw.extra) > 0) out.extra = int(raw.extra);
    if (int(raw.count) > 0) out.count = int(raw.count);
    if (int(raw.health) > 0) out.health = int(raw.health);
    if (int(raw.defense) > 0) out.defense = int(raw.defense);
    if (raw.all === true) out.all = true;
    // How long a door's Boons stand, where it is not the round (D-811; 14's Berserk: *until the
    // encounter ends*).
    if (oneOf(raw.lasts, ZONE_LASTS)) out.lasts = raw.lasts;
    if (Array.isArray(raw.kinds)) {
      const kinds = raw.kinds.filter(k => typeof k === "string" && k);
      if (kinds.length) out.kinds = kinds;
    }
  }
  return out;
}

/** Whether a plan does anything. */
export function hasPlan(plan) {
  return Object.keys(cleanBossPlan(plan)).length > 0;
}

/* ------------------------------------------------------------------ */
/*  The economy                                                        */
/* ------------------------------------------------------------------ */

/**
 * **THE ONE JUDGEMENT OF A BOSS ACTION'S PRESS**: whether the creature may pay
 * `cost` points now, and what it holds after.
 *
 * - `none`: the creature holds no Boss Action points at all;
 * - `short`: it holds fewer than the cost (a ×2 on one point);
 * - `turnTaken`: it has already taken a Boss Action after this turn of the fight
 *   (14 §1: *spend one ... after any player character ends their turn*, and a ×2 is
 *   *the only time a creature spends two after the same turn*). Out of a fight there
 *   are no turns, and no count is kept (the lead's ruling on Q18).
 *
 * @param {{points?: {value?: number|null, max?: number|null}, cost?: number, turnKey?: string|null, lastTurnKey?: string|null}} o
 * @returns {{ok: boolean, reason: "none"|"short"|"turnTaken"|null, held: number, left: number, cost: number}}
 */
export function bossPressJudgement({ points = {}, cost = 1, turnKey = null, lastTurnKey = null } = {}) {
  const want = Math.max(1, Math.trunc(Number(cost)) || 1);
  const max = num(points?.max);
  if (!(max > 0)) return { ok: false, reason: "none", held: 0, left: 0, cost: want };
  const value = num(points?.value);
  const held = value === null ? max : Math.max(0, Math.trunc(value));
  if (held < want) return { ok: false, reason: "short", held, left: held, cost: want };
  if (turnKey && lastTurnKey && turnKey === lastTurnKey) return { ok: false, reason: "turnTaken", held, left: held, cost: want };
  return { ok: true, reason: null, held, left: held - want, cost: want };
}

/**
 * The fight's turn as a key, `round.turn`, or null outside a started fight. A Boss
 * Action is taken AFTER a turn ends, so the press is counted against the turn the
 * fight stands on when it is made.
 *
 * @param {{started?: boolean, round?: number, turn?: number, id?: string}|null} fight
 * @returns {string|null}
 */
export function bossTurnKey(fight) {
  if (!fight?.started) return null;
  return `${fight.id ?? ""}:${Math.trunc(Number(fight.round) || 0)}.${Math.trunc(Number(fight.turn) || 0)}`;
}

/* ------------------------------------------------------------------ */
/*  What adds bodies                                                   */
/* ------------------------------------------------------------------ */

/**
 * **WHETHER A BOSS ACTION PUTS MORE BODIES ON THE FIELD** (14 §1: *Every action that
 * puts more bodies on the field carries the mark*). The phrases are
 * `tools/check-bestiary.ps1`'s own D-543 reader, word for word, read over FLATTENED
 * prose: 14 is hard-wrapped, and *and act / on his side* straddling a newline is how
 * The Priests Chant, Send the Hounds and Call the Amani went unmarked (D-809). A
 * fight-on-his-side Test (Bind, Take the Mind) is a turncoat, not a body.
 *
 * @param {string} words  the row's prose, markup stripped or not
 * @returns {boolean}
 */
export const BRINGS = /act(s)? on (his|her|its|the \w+'s) side|stands? as a\b|step out of|come(s)? (in|over|up|through)|arrive(s)? through|out of the (floor|ground|graves|walls|chamber)|comes through/i;

export function addsBodies(words) {
  const text = String(words ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ");
  return BRINGS.test(text);
}

/* ------------------------------------------------------------------ */
/*  The table                                                          */
/* ------------------------------------------------------------------ */

/*
 * Each row's overrides on the seeded descriptor:
 *
 * - `type`: the damage's school, or `physical` (the lead's ruling on Q12);
 * - `until`: an `AZEROTH.untilKinds` span for the condition it lays;
 * - `area`: 07 §9's area grammar, for a cone, a line or a circle on the ground
 *   (*A 20-foot area* is a circle 20 feet across, the lead's ruling on Q2);
 * - `kind`: where the row's kind changes (a door, a summon by corpse);
 * - `clear`: descriptor keys put back to empty (the press no longer lands them);
 * - `summon`, `note`: written as given;
 * - `plan`: what the generic descriptor cannot hold (`cleanBossPlan`).
 *
 * An empty object is a row read and found right as the seed has it.
 */
const ZONE = (damage, school, lasts, extra = {}) => ({ lasts, difficult: false, ...(damage ? { damage, school } : {}), ...extra });

const HAND_BOSS_PLANS = Object.freeze({
  "Aku'mai": {
    "The Water Rises": { plan: { gather: { who: "creature", feet: 20 }, forced: { on: "fail", feet: 10, toward: "toward" } } },
    "Poison Cloud": { type: "nature", area: "A 7.5 ft radius on the ground" }
  },
  "Amnennar the Coldbringer": {
    "Raise the Warren": {},
    "Winter Comes Down": { kind: "utility", area: "A 10 ft radius on the ground", clear: ["damage", "dc"], plan: { zone: ZONE(3, "frost", "encounter", { difficult: true }) } },
    "Frostbite": { type: "frost", until: "endOfNextTurn" }
  },
  "Archaedas": {
    "Wake the Guardians": {},
    "Ground Stroke": { type: "physical", plan: { gather: { who: "creature", feet: 20 } } },
    "Stone Grip": { plan: { escape: { resilience: "reflex", dc: 19, skill: "athletics" } } }
  },
  "Archmage Arugal": {
    "Call the Pack": {},
    "Shadow Step": { kind: "utility", plan: { door: "relocateSelf", feet: 60, missNext: true } }
  },
  "Azuregos": {
    // D-1758: the hostile world boss. *pulled to a space next to Azuregos* names no feet, so the
    // pull is the 60 feet the gather reaches, and `forcedPlan` stops a pull at the puller.
    "Arcane Vacuum": { plan: { gather: { who: "creature", feet: 60 }, forced: { on: "fail", feet: 60, toward: "toward" } } },
    // ANNOUNCED (D-1780): a mark held for the encounter that Slows at a turn start within 30 feet,
    // and a spell turned back on its caster for the round. No door lays either, so each is the
    // GM's from the card and spends its point there (O-628).
    "Mark of Frost": { kind: "none", reason: "narrative", clear: ["inflicts"] },
    "Reflection": { kind: "none", reason: "narrative" }
  },
  "Baron Rivendare": {
    "Deathcharger's Trample": { type: "physical", area: "A 50 ft line", plan: { door: "selfLine" } },
    "Raise the Fallen": { kind: "summon", summon: { entry: "Plagued Ghoul", count: 1 }, plan: { door: "raise", feet: 30, kinds: ["humanoid"] } },
    "Unholy Command": { kind: "utility", plan: { door: "allyAttack", feet: 30, boons: 1 } }
  },
  "Charlga Razorflank": {
    "The Thorn Answers": { area: "A 7.5 ft radius on the ground", plan: { zone: ZONE(null, null, "encounter", { difficult: true }) } },
    "Call the Warren": {}
  },
  "Chief Ukorz Sandscalp": {
    "Call the Steps": {},
    "The Sun Overhead": { type: "fire", plan: { gather: { who: "creature", feet: 20 } } },
    "Cleave the Line": { plan: { attack: { allowance: "reach" } } }
  },
  "Cho'gall": {
    "The Whisper Answers": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 30 } } },
    "Twilight Rite": {},
    "Shadow Cleave": { type: "shadow", area: "A 10 ft radius on the ground" }
  },
  "Dar'Khan Drathir": {
    "Open the Gate": {},
    "Drain the Living": { type: "shadow", plan: { drain: { dealt: true } } }
  },
  "Darkmaster Gandling": {
    "Sent to a Room": { kind: "utility", plan: { door: "away", feet: 60 } },
    "The Class Recites": {},
    "Shadow Lecture": { type: "shadow", plan: { gather: { who: "creature", feet: 20 } } }
  },
  "Edwin VanCleef": {
    "Call the Crew": {},
    "Cut and Turn": { plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Emperor Dagran Thaurissan": {
    "The Forge Answers": {},
    "Hand of Thaurissan": { type: "fire" },
    "Emperor's Command": { until: "endOfNextTurn" }
  },
  "Gath'Ilzogg": {
    "Down the Wall": { type: "physical", clear: ["dc"], plan: { forced: { on: "press", feet: 20, toward: "away" } } },
    "Fight Me": { plan: { reminder: { on: "fail" } } }
  },
  "Hakkar the Soulflayer": {
    // ANNOUNCED (D-1780): *Corrupted blood* is a disease 09 does not hold, so there is no clock to
    // lay; its spread and its 3 damage a turn are the GM's from the card (O-628, O-629).
    "Corrupted Blood": { kind: "none", reason: "narrative", clear: ["damage", "inflicts"] },
    "The Priests Chant": {},
    "Drain the Chamber": { type: "shadow", plan: { gather: { who: "creature", feet: 30 }, drain: { fixed: 3 } } }
  },
  "High Inquisitor Whitemane": {
    "Deliver Judgement": { type: "holy", until: "endOfNextTurn" },
    // D-1831: 14 names the body raised, Scarlet Commander Mograine, where he fell; the raise door
    // places that entry, so the row is a summon through the door, as Raise the Fallen is.
    "Raise Mograine": { kind: "summon", summon: { entry: "Scarlet Commander Mograine", count: 1 }, plan: { door: "raise" } }
  },
  "Immol'thar": {
    // D-1831: Arcane Lash left 14; the Eyes are new and read as the seed has them.
    "The Eyes Open": {},
    "Feed": { plan: { selfHeal: true, poolLoss: { pool: "power", amount: 1, on: "press" } } },
    "Thrash": { type: "physical", clear: ["dc"], plan: { gather: { who: "creature", feet: "reach" }, forced: { on: "press", feet: 10, toward: "away" } } }
  },
  "Ivus the Forest Lord": {
    "Root the Ground": { area: "A 10 ft radius on the ground" },
    "Sweep the Hall": { type: "physical", plan: { gather: { who: "creature", feet: "reach" } } },
    "Wake the Grove": {}
  },
  "Jammal'an the Prophet": {
    "Speak for the God": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } },
    "Blood for the Dreamer": { type: "shadow", plan: { poolGain: { pool: "power", amount: 2 } } },
    "The Attendants": {}
  },
  "Kel'Thuzad": {
    // D-1831: The Dead Attend became two Guardians of Icecrown through the far gate, a summon the
    // seed reads whole; the half-Health gate is the GM's moment, as every Boss Action's is.
    "Guardians of Icecrown": {},
    "Frost Blast": { type: "frost" },
    "Shadow Fissure": { type: "shadow", area: "A 10 ft radius on the ground" }
  },
  "King Gordok": {
    "Bellow": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "The Court Attends": {},
    "Sweep": { type: "physical", plan: { gather: { who: "creature", feet: "reach" } } }
  },
  "King Mosh": {
    // D-1806: the lead's *"make King Mosh a Boss"*. Snap is one Jaws attack, Ursal's Maul without
    // its Boon; Earthshaker is Shake the Roots' gather; Recklessness is Amani Fury's door.
    "Snap": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Earthshaker": { plan: { gather: { who: "creature", feet: 15 } } },
    "Recklessness": { kind: "utility", plan: { door: "amaniFury" } }
  },
  "Lokholar the Ice Lord": {
    "Glacier": { kind: "utility", area: "A 10 ft radius on the ground", clear: ["damage", "dc"], plan: { zone: ZONE(4, "frost", "encounter", { difficult: true }) } },
    "Rimebind": { plan: { escape: { resilience: "reflex", dc: 19, skill: "athletics" } } },
    "Whiteout": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } }
  },
  "Lord Aliden Perenolde": {
    "Call the House": {},
    "Sell Them Out": { kind: "utility", plan: { door: "marked", boons: 1, extra: 4 } }
  },
  "Lord Banehollow": {
    "Felfire": { type: "fel", area: "A 7.5 ft radius on the ground", plan: { zone: ZONE(null, null, "round") } },
    "Send the Hounds": {},
    "Bind": { plan: { sideSwitch: { until: "endOfNextTurn", kinds: ["demon", "elemental"] } } }
  },
  "Mor'Ladim": {
    "The Dead Sit Up": {},
    "Sorrow": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } }
  },
  "Mutanus the Devourer": {
    // D-1759. Naralex's Nightmare's Stun is laid to the end of the next turn; that it ends sooner
    // on damage is the GM's (O-628).
    "Thundercrack": { type: "nature", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Naralex's Nightmare": { until: "endOfNextTurn", plan: { target: { count: 1, feet: 30 } } }
  },
  "Nefarian": {
    "Class Call": { kind: "utility", plan: { door: "classCall" } },
    // ANNOUNCED (D-1780): 5 Fire and 5 Shadow in one cone; an ability's descriptor carries one
    // damage type, so the GM lands it from the card (O-628).
    "Shadow Flame": { kind: "none", reason: "narrative" },
    "The Experiment": {}
  },
  "Onyxia": {
    "Deep Breath": { type: "fire", area: "A 60 ft line" },
    "Whelps": {},
    "Knock Aside": { type: "physical", plan: { forced: { on: "fail", feet: 30, toward: "away" } } }
  },
  "Prince Malchezaar": {
    "Infernal": {},
    "Shadow Nova": { type: "shadow", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } },
    "Enfeeble": { kind: "utility", plan: { door: "enfeeble", feet: 60 } }
  },
  "Prince Tortheldrin": {
    "Step Aside": { kind: "utility", plan: { door: "relocateSelf", feet: 30, missNext: true } },
    "Arcane Storm": { type: "arcane", plan: { gather: { who: "creature", feet: 20 } } },
    "The Highborne Attend": {}
  },
  "Princess Theradras": {
    // The dust stands to the end of the round; the Blind lasts to the end of the creature's next turn.
    "Dust Field": { until: "endOfNextTurn", area: "A 10 ft radius on the ground", plan: { zone: ZONE(null, null, "round") } },
    "Landslide": { type: "physical", area: "A 30 ft line" },
    "Stone Mends Stone": { plan: { selfHeal: true, healAlt: 18 } }
  },
  "Ragnaros": {
    "Wrath of Ragnaros": { type: "fire", plan: { gather: { who: "creature", feet: 30 }, forced: { on: "fail", feet: 20, toward: "away" } } },
    "Sons of the Flame": {},
    "Melt": { type: "fire", plan: { sunder: { location: "body", amount: 1, on: "fail" } } }
  },
  "Razelikh the Defiler": {
    "Hellfire": { type: "fel", plan: { gather: { who: "creature", feet: 15 } } },
    "Call the Stranded": {},
    "The Bargain": { plan: { bane: { kind: "attack", only: "self", on: "fail" } } }
  },
  "Rend Blackhand": {
    "Gyth Takes the Air": { kind: "utility", plan: { door: "gyth", missNext: true } },
    "The Spire Answers": {},
    "Break Them": { type: "physical", plan: { gather: { who: "creature", feet: 20 } } }
  },
  "Sicco Thermaplugg": {
    "Activate Bombs": {},
    "Vent the Section": {
      kind: "utility", area: "A 10 ft radius on the ground", clear: ["damage", "dc", "resist", "inflicts", "afflict"],
      // The Test's Poisoned is the poison's carrier (D12), which holds the condition itself.
      plan: { zone: ZONE(null, null, "round", { check: { resilience: "body", dc: 18, rating: 3, school: "nature", statuses: [], afflict: { key: "vent-the-section", name: "Vent the Section" } } }) }
    }
  },
  "Stitches": {
    "Sweep the Road": { plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Grab": { clear: ["damage", "dc"], plan: { escape: { resilience: "reflex", dc: 18, skill: "athletics" }, grip: { damage: 5, type: "physical" } } }
  },
  "The Prophet Skeram": {
    "Three Places at Once": { kind: "utility", plan: { door: "copies", count: 2, health: 1, defense: 19 } },
    "Arcane Explosion": { type: "arcane", plan: { gather: { who: "creature", feet: 20 } } },
    "True Fulfillment": { until: "endOfNextTurn" }
  },
  "Ursal the Mauler": {
    "Shake the Roots": { plan: { gather: { who: "creature", feet: 15 } } },
    "Maul": { clear: ["inflicts"], plan: { attack: { allowance: 1, boons: 1, boonGate: "wounded", landsOnHit: [{ condition: "bleeding", value: 2 }] } } }
  },
  "Vile Priestess Hexx": {
    "The Altar Takes": { type: "shadow", plan: { drain: { dealt: true } } },
    "Call the Vilebranch": {},
    "Hex the Loudest": { until: "endOfNextTurn", plan: { cannotAttack: { on: "fail" } } }
  },
  "Zalazane": {
    "Take the Mind": { until: "encounter", plan: { sideSwitch: { until: "encounter" } } },
    "Mask of the Loa": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } }
  },
  "Zul'jin": {
    "Amani Fury": { kind: "utility", plan: { door: "amaniFury" } },
    "Call the Amani": {},
    "The Bear Roars": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } }
  }
});

/**
 * **THE ONE TABLE**: the hand rows above (the 112 of D-809 and their phase 1 rewrites) and the
 * catalogue's (`boss-plans-catalogue.mjs`, D-1829), keyed by creature. A creature named in both
 * is a fault in the merge, never a second row for one action, so the load throws.
 */
export const BOSS_PLANS = (() => {
  const both = Object.keys(CATALOGUE_BOSS_PLANS).filter(name => Object.hasOwn(HAND_BOSS_PLANS, name));
  if (both.length) throw new Error(`BOSS_PLANS: ${both.join(", ")} in both the hand table and the catalogue`);
  return Object.freeze({ ...HAND_BOSS_PLANS, ...CATALOGUE_BOSS_PLANS });
})();

/** The row a creature's Boss Action takes from the table, or null where the table has none. */
export function bossPlanFor(creature, action) {
  return BOSS_PLANS[creature]?.[action] ?? null;
}

/** Every row the table reviews, as `{creature, action}`, sorted. */
export function bossPlanRows() {
  return Object.entries(BOSS_PLANS)
    .flatMap(([creature, rows]) => Object.keys(rows).map(action => ({ creature, action })))
    .sort((a, b) => a.creature.localeCompare(b.creature) || a.action.localeCompare(b.action));
}

/**
 * **LAY A TABLE ROW ON A SEEDED DESCRIPTOR**: the type, the span, the area, the
 * kind, the cleared keys and the plan. `empty` is `emptyAutomation`'s own copy,
 * handed in so this module needs no import of the descriptor's law. A row the
 * table does not name comes back unchanged.
 *
 * @param {object} automation  the seeded descriptor, whole
 * @param {string} creature
 * @param {string} action
 * @param {object} empty  `emptyAutomation()`
 * @returns {object}  a new descriptor
 */
export function applyBossPlan(automation, creature, action, empty) {
  return applyPlanRow(automation, bossPlanFor(creature, action), empty);
}

/**
 * **LAY ONE TABLE ROW** - `BOSS_PLANS`' or a creature ability's
 * (`rules/creature-plans.mjs`, D-811): the one reading of a row's overrides, so the two tables
 * cannot mean different things by the same key. A null row comes back unchanged.
 *
 * @param {object} automation  the seeded descriptor, whole
 * @param {object|null} row
 * @param {object} empty  `emptyAutomation()`
 * @returns {object}
 */
export function applyPlanRow(automation, row, empty) {
  if (!row) return automation;
  const out = structuredClone(automation);
  for (const key of row.clear ?? []) out[key] = structuredClone(empty[key]);
  if (row.kind) {
    out.kind = row.kind;
    // A row that leaves the action announced records why (D-1780); every other kind carries none.
    out.reason = row.kind === "none" && typeof row.reason === "string" ? row.reason : "";
  }
  if (row.type && out.damage) out.damage = { ...out.damage, type: row.type };
  if (row.until && out.inflicts) out.inflicts = { ...out.inflicts, until: row.until };
  if (row.area) out.area = row.area;
  if (row.summon) out.summon = { ...out.summon, ...row.summon };
  // **WHAT THE SEED COULD NOT READ, STATED BY THE ROW** (D-1829): the condition where the words
  // lay two (*Entangled and Silenced*) or name it beside a Prone, a heal the words give another
  // creature (*one ally within 30 feet recovers 8 Health*), and the spell a row casts by name.
  if (row.inflicts) out.inflicts = { ...out.inflicts, ...row.inflicts };
  if (Number.isInteger(row.heal) && row.heal > 0) out.heal = row.heal;
  if (typeof row.spell === "string" && row.spell) out.spell = row.spell;
  if (row.note) out.note = row.note;
  const plan = cleanBossPlan(row.plan ?? {});
  if (Object.keys(plan).length) out.plan = plan;
  return out;
}

/**
 * **WHICH DOOR A PRESS GOES THROUGH**, for the census: every Boss Action is
 * pressed through `workflows.useAbility`, spends its points through
 * `effects/boss-points.mjs`, and lands what its plan names through the doors
 * listed. `spends` is true for every row, a door's included.
 *
 * @param {{automation?: object}} row
 * @returns {{door: string, spends: true, parts: string[]}}
 */
export function bossActionDoor(row) {
  const a = row?.automation ?? {};
  const plan = cleanBossPlan(a.plan);
  const parts = Object.keys(plan).filter(k => !["feet", "missNext", "boons", "extra", "count", "health", "defense", "all", "kinds", "lasts", "freeMana"].includes(k));
  return { door: plan.door ?? (a.kind === "spell" ? "spell" : "ability"), spends: true, parts };
}
