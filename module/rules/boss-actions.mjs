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
 *    all 109 rows in 14, keyed by the creature's name and the action's. The
 *    bestiary parser lays each row's overrides on the seeded descriptor
 *    (`applyBossPlan`), so the pack carries them and `packs:parse` regenerates
 *    them; `boss-action-census.test.mjs` holds the table to 14 both ways and
 *    number for number. Every damage row carries a type (the lead: *"The damage
 *    should be school relevant to the ability. If not relevant, use physical
 *    default."*), every condition with a span carries its span, and what the
 *    generic descriptor cannot hold rides `automation.plan`, read by
 *    `effects/boss-doors.mjs` and by the card's own doors.
 */

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
  "gyth"
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
    const who = oneOf(raw.gather.who, ["creature", "enemy"]);
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
  if (int(raw.healAlt) > 0) out.healAlt = int(raw.healAlt);
  if (isObj(raw.drain)) {
    if (raw.drain.dealt === true) out.drain = { dealt: true };
    else if (int(raw.drain.fixed) > 0) out.drain = { fixed: int(raw.drain.fixed) };
  }
  if (isObj(raw.poolLoss)) {
    const pool = oneOf(raw.poolLoss.pool, POOLS);
    const amount = int(raw.poolLoss.amount);
    const on = oneOf(raw.poolLoss.on, PLAN_ON);
    if (pool && amount > 0 && on) out.poolLoss = { pool, amount, on };
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
    if (int(raw.boons) > 0) out.boons = int(raw.boons);
    if (int(raw.extra) > 0) out.extra = int(raw.extra);
    if (int(raw.count) > 0) out.count = int(raw.count);
    if (int(raw.health) > 0) out.health = int(raw.health);
    if (int(raw.defense) > 0) out.defense = int(raw.defense);
    if (raw.all === true) out.all = true;
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

export const BOSS_PLANS = Object.freeze({
  "Aku'mai": {
    "The Water Rises": { plan: { gather: { who: "creature", feet: 20 }, forced: { on: "fail", feet: 10, toward: "toward" } } },
    "Second Coil": { type: "physical" }
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
    "Arcane Breath": { type: "arcane", until: "endOfRound", area: "A 30 ft cone" },
    "Reave the Ley": { until: "endOfNextTurn", plan: { poolLoss: { pool: "mana", amount: 4, on: "fail" } } },
    "Elsewhere": { kind: "utility", plan: { door: "relocateTarget", feet: 60 } }
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
    "Blood of the Gurubashi": { plan: { gather: { who: "creature", feet: 20 } } },
    "The Priests Chant": {},
    "Drain the Chamber": { type: "shadow", plan: { gather: { who: "creature", feet: 30 }, drain: { fixed: 3 } } }
  },
  "High Inquisitor Whitemane": {
    "Deliver Judgement": { type: "holy", until: "endOfNextTurn" },
    "Raise Mograine": { plan: { door: "raise" } }
  },
  "Immol'thar": {
    "Arcane Lash": { type: "arcane" },
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
    "The Dead Attend": { kind: "summon", summon: { entry: "Plagued Ghoul", count: 1 }, plan: { door: "raise", feet: 60, all: true } },
    "Frost Blast": { type: "frost" },
    "Shadow Fissure": { type: "shadow", area: "A 10 ft radius on the ground" }
  },
  "King Gordok": {
    "Bellow": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "The Court Attends": {},
    "Sweep": { type: "physical", plan: { gather: { who: "creature", feet: "reach" } } }
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
    "Drag Under": { plan: { forced: { on: "fail", feet: 10, toward: "toward" } } },
    "The Caverns Wail": { type: "physical", until: "endOfNextTurn" }
  },
  "Nefarian": {
    "Class Call": { kind: "utility", plan: { door: "classCall" } },
    "Breath": { type: "fire", area: "A 30 ft cone" },
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
    "The Cavern Is Alive": { area: "A 10 ft radius on the ground" },
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
    "Pull the Lever": { type: "physical", area: "A 7.5 ft radius on the ground" },
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
    "Throw the Axe": { type: "physical" }
  }
});

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
  const row = bossPlanFor(creature, action);
  if (!row) return automation;
  const out = structuredClone(automation);
  for (const key of row.clear ?? []) out[key] = structuredClone(empty[key]);
  if (row.kind) {
    out.kind = row.kind;
    out.reason = "";
  }
  if (row.type && out.damage) out.damage = { ...out.damage, type: row.type };
  if (row.until && out.inflicts) out.inflicts = { ...out.inflicts, until: row.until };
  if (row.area) out.area = row.area;
  if (row.summon) out.summon = { ...out.summon, ...row.summon };
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
  const parts = Object.keys(plan).filter(k => !["feet", "missNext", "boons", "extra", "count", "health", "defense", "all", "kinds"].includes(k));
  return { door: plan.door ?? (a.kind === "spell" ? "spell" : "ability"), spends: true, parts };
}
