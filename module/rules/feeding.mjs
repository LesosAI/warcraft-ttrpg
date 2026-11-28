/**
 * **FEEDING, THE ONE WAY VITAE COMES BACK** (02 §7's The Blood Royal and its Feeding table; the San'layn
 * and Sovereign plan's F1 to F5). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead (R7): *"The size of the feeding target determines the vitae it returns plus con mod"*; (R9)
 * *"Feeding only."* The tier term is the plan's (B.13 Q14, taken as recommended): the row times your
 * tier, plus your Constitution modifier.
 *
 * - `FEEDING_ROW`: 02's Feeding table, by 05's size rung. Its Vitest reads the table off the chapter.
 * - `feedingReturn`: what one feeding gives - half, rounded down, from a creature dead under ten minutes
 *   (or a Last Draught at rank 1), plus Drink Deep's tier a rank in a fight.
 * - `feedRefusal`: why this feeding may not happen, judged before anything is spent (D-768): a living
 *   creature with blood; once a day a creature; in a fight a Half-Action against a creature in reach
 *   that is Stunned, Entangled or Prone or that you are latched on to (Drink Deep adds Bleeding);
 *   outside a fight a willing, sleeping, Charmed or helpless creature or a held beast; a corpse under
 *   ten minutes old.
 * - `vialReturn`: a Blood vial drunk by a Sovereign gives twice the tier (B.13 Q16).
 * - The once-a-day record (`FED_TODAY_FLAG`) is a flag on the Sovereign's own actor, cleared at a Long
 *   Rest, and `BLOOD_SINCE_REST_FLAG` counts the feedings since the last rest so the race's rest door
 *   can take one as that rest's unit (C-14, F4).
 */

/** 02's Feeding table (× your tier), by 05's size rung. */
export const FEEDING_ROW = Object.freeze({ tiny: 1, small: 3, medium: 5, large: 8, huge: 12, enormous: 16 });

/** *A creature that died within the last 10 minutes* (02 §7), in world seconds. */
export const CORPSE_WINDOW_SECONDS = 600;

/** *You may feed on each creature once a day* (02 §7): the span the record keeps, in world seconds. */
export const FED_DAY_SECONDS = 86400;

/** The Sovereign's once-a-day record: `{[creatureUuid]: worldTime}`, cleared at a Long Rest. */
export const FED_TODAY_FLAG = "fedToday";

/** Feedings since the last rest, for the race's rest door (C-14): the race's own flag (`rest.mjs`, D-1143). */
export { BLOOD_SINCE_REST_FLAG } from "./rest.mjs";

/** Creature types with no blood to drink: never fed on (the plan's B.8 *Feeding limits*). */
export const BLOODLESS_TYPES = Object.freeze(["undead", "construct", "elemental"]);

/** The conditions that open a feeding in a fight (02 §7), and Drink Deep's Bleeding beside them. */
export const FIGHT_FEEDING_CONDITIONS = Object.freeze(["stunned", "entangled", "prone"]);
export const DRINK_DEEP_CONDITION = "bleeding";

/** How a creature outside a fight may be fed on (02 §7): the chooser's rows. */
export const OUT_OF_FIGHT_WAYS = Object.freeze(["willing", "sleeping", "charmed", "helpless", "beast"]);

/** The feeding modes the door takes. */
export const FEEDING_MODES = Object.freeze(["fight", "out", "corpse"]);

const int = v => Math.trunc(Number(v)) || 0;

/**
 * The Feeding row for a creature's size, Medium where the size is not one of 05's rungs.
 *
 * @param {string|null} size
 * @returns {number}
 */
export function feedingRow(size) {
  const key = String(size ?? "").trim().toLowerCase();
  return FEEDING_ROW[key] ?? FEEDING_ROW.medium;
}

/**
 * **WHAT ONE FEEDING GIVES** (02 §7: *you regain Vitae equal to the creature's Feeding row times your
 * tier, plus your Constitution modifier*). Half of that, rounded down, from a corpse (*for half the
 * Vitae*) or at a `factor` of 0.5 (Last Draught at rank 1); Drink Deep's *additional Vitae equal to your
 * tier per rank* on top, in a fight. Never below 0.
 *
 * @param {{size?: string|null, tier?: number, conMod?: number, corpse?: boolean, factor?: number, drinkDeepRanks?: number, inFight?: boolean, flat?: number|null}} o
 *   `flat` replaces the row's sum outright (Red Feast's *Vitae equal to your tier*)
 * @returns {number}
 */
export function feedingReturn({ size = "medium", tier = 1, conMod = 0, corpse = false, factor = 1, drinkDeepRanks = 0, inFight = false, flat = null } = {}) {
  const t = Math.max(1, int(tier));
  const base = flat !== null && flat !== undefined ? Math.max(0, int(flat)) : Math.max(0, feedingRow(size) * t + int(conMod));
  // A corpse gives half; Last Draught's factor scales that half (rank 2's 2 is the full Vitae, 04: *At rank 2,
  // you regain the full Vitae*; the review's S1), never above the whole.
  const given = Number(factor) > 0 ? Number(factor) : 1;
  const f = corpse ? Math.min(1, 0.5 * given) : given;
  const scaled = Math.floor(base * Math.min(1, f));
  const deep = inFight ? Math.max(0, int(drinkDeepRanks)) * t : 0;
  return Math.max(0, scaled + deep);
}

/** A Blood vial drunk by a Sovereign (B.13 Q16): twice the tier. */
export function vialReturn(tier = 1) {
  return 2 * Math.max(1, int(tier));
}

/**
 * **WHY A SOVEREIGN MAY NOT DRINK THIS VIAL**, or null (the reviews' S6 and S3; judged before anything is
 * spent): a Vitae pool, a thing the Sovereign carries, a Blood vial (08 §12's provision `blood`), at least one,
 * and Vitae short of full - a vial drunk at full is spent for nothing.
 *
 * @param {{pool: {value: number, max: number}|null, owned?: boolean, blood?: boolean, quantity?: number}} o
 * @returns {"noPool"|"noVial"|"notBlood"|"empty"|"full"|null}
 */
export function vialRefusal({ pool = null, owned = false, blood = false, quantity = 0 } = {}) {
  if (!pool) return "noPool";
  if (!owned) return "noVial";
  if (!blood) return "notBlood";
  if (!(int(quantity) > 0)) return "empty";
  if (int(pool.value) >= int(pool.max)) return "full";
  return null;
}

/**
 * Whether a creature has blood to drink: not undead, not a construct, not an elemental.
 *
 * @param {{creatureType?: string|null, kinds?: Iterable<string>}} o
 */
export function hasBlood({ creatureType = null, kinds = [] } = {}) {
  const type = String(creatureType ?? "").trim().toLowerCase().split(/[\s(]/)[0];
  if (BLOODLESS_TYPES.includes(type)) return false;
  const k = new Set(kinds ?? []);
  return !(k.has("undead") || k.has("construct"));
}

/**
 * Whether the once-a-day record still holds this creature: fed on within the last day of world time.
 *
 * @param {Record<string, number>|null} record
 * @param {string} uuid
 * @param {number} now  world seconds
 */
export function fedOnToday(record, uuid, now = 0) {
  const at = record && typeof record === "object" ? Number(record[uuid]) : NaN;
  if (!Number.isFinite(at)) return false;
  return Number(now) - at < FED_DAY_SECONDS;
}

/**
 * **THE DAYS A SOVEREIGN HAS FED ON EACH CREATURE** (07 §17's Blood Bond: *One creature you have fed on three times,
 * each on a different day*; D-1368): `{[creatureUuid]: dayIndex[]}` on the Sovereign, written with every feeding in
 * the update that writes its Vitae, and never cleared by a rest (the once-a-day record above is). A day is the
 * world clock's whole day (`dayOf`); each creature keeps its last `FEED_DAYS_KEPT` days and the record its
 * `FEED_DAYS_ROWS` most recently fed creatures.
 */
export const FEED_DAYS_FLAG = "fedDays";
export const FEED_DAYS_KEPT = 8;
export const FEED_DAYS_ROWS = 64;

/** The world clock's day a time falls on. */
export const dayOf = (now = 0) => Math.floor((Number(now) || 0) / FED_DAY_SECONDS);

/** The record with this creature's day added: its days distinct and ascending, the oldest days and creatures dropped, keys sorted. */
export function withFeedDay(record, uuid, now = 0) {
  const src = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  if (typeof uuid !== "string" || !uuid) return { ...src };
  const clean = days => [...new Set((Array.isArray(days) ? days : []).map(d => Math.trunc(Number(d))).filter(d => Number.isFinite(d) && d >= 0))].sort((a, b) => a - b);
  const rows = Object.entries(src).filter(([k]) => typeof k === "string" && k).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v.length);
  const mine = clean([...(rows.find(([k]) => k === uuid)?.[1] ?? []), dayOf(now)]).slice(-FEED_DAYS_KEPT);
  const others = rows.filter(([k]) => k !== uuid)
    .sort((a, b) => (b[1].at(-1) - a[1].at(-1)) || a[0].localeCompare(b[0]))
    .slice(0, FEED_DAYS_ROWS - 1);
  const out = {};
  for (const [k, v] of [...others, [uuid, mine]].sort((a, b) => a[0].localeCompare(b[0]))) out[k] = v;
  return out;
}

/** How many different days the record holds for a creature. */
export function feedDaysOf(record, uuid) {
  const days = record && typeof record === "object" ? record[uuid] : null;
  return Array.isArray(days) ? new Set(days.map(d => Math.trunc(Number(d))).filter(d => Number.isFinite(d) && d >= 0)).size : 0;
}

/** The record with this creature written at `now`, every entry older than a day dropped, sorted by key. */
export function withFed(record, uuid, now = 0) {
  const out = {};
  const keep = Object.entries(record && typeof record === "object" ? record : {})
    .filter(([k, v]) => k !== uuid && Number.isFinite(Number(v)) && Number(now) - Number(v) < FED_DAY_SECONDS);
  for (const [k, v] of [...keep, [uuid, Number(now)]].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) out[k] = v;
  return out;
}

/**
 * **WHY THIS FEEDING MAY NOT HAPPEN**, or null where it may (02 §7; D-768: judged whole before anything
 * is spent). Returns a reason word; the door says it in words (`FEED_REFUSAL_WORDS`).
 *
 * - `self` - a creature never feeds on itself;
 * - `bloodless` - undead, a construct or an elemental;
 * - `fedToday` - this creature was fed on today (a free feeding with `anyDay`, Red Feast's, skips it);
 * - `reach` - in a fight, the creature is not within reach;
 * - `open` - in a fight, it is not Stunned, Entangled or Prone and you are not latched on to it
 *   (Drink Deep adds Bleeding); a `free` feeding (Latch On, Last Draught, Embrace) skips this;
 * - `way` - outside a fight, no way was named (willing, sleeping, Charmed, helpless, a held beast),
 *   or Charmed was named and the creature is not Charmed;
 * - `corpseAge` - a corpse dead ten minutes or more, or one that never died on the watch's record;
 * - `alive` - the corpse mode named a creature still above 0 Health.
 *
 * @param {object} o
 * @param {"fight"|"out"|"corpse"} o.mode
 * @param {boolean} [o.self]
 * @param {boolean} [o.blood]       `hasBlood`'s answer
 * @param {boolean} [o.fedToday]    `fedOnToday`'s answer
 * @param {boolean} [o.inReach]
 * @param {Iterable<string>} [o.conditions]  the creature's statuses
 * @param {boolean} [o.latched]     you are latched on to it
 * @param {number} [o.drinkDeep]    Drink Deep's ranks
 * @param {boolean} [o.free]        a feeding a talent or spell makes with no Test and no opening
 * @param {boolean} [o.anyDay]      a feeding that does not count toward once a day (Red Feast)
 * @param {string|null} [o.way]     outside a fight, how
 * @param {number|null} [o.deadFor] world seconds since the creature died, or null
 * @param {number} [o.health]       the creature's Health now
 * @returns {string|null}
 */
export function feedRefusal({
  mode = "fight", self = false, blood = true, fedToday = false, inReach = true, conditions = [],
  latched = false, drinkDeep = 0, free = false, anyDay = false, way = null, deadFor = null, health = 1
} = {}) {
  if (self) return "self";
  if (!blood) return "bloodless";
  if (fedToday && !anyDay) return "fedToday";
  const has = new Set(conditions ?? []);
  if (mode === "corpse") {
    if (int(health) > 0) return "alive";
    if (deadFor === null || deadFor === undefined || !Number.isFinite(Number(deadFor)) || Number(deadFor) >= CORPSE_WINDOW_SECONDS) return "corpseAge";
    return null;
  }
  if (mode === "out") {
    if (free) return null;
    if (!OUT_OF_FIGHT_WAYS.includes(way)) return "way";
    if (way === "charmed" && !has.has("charmed")) return "way";
    return null;
  }
  if (!inReach) return "reach";
  if (free) return null;
  const opened = FIGHT_FEEDING_CONDITIONS.some(c => has.has(c)) || latched === true
    || (int(drinkDeep) > 0 && has.has(DRINK_DEEP_CONDITION));
  return opened ? null : "open";
}

/** The lang key each refusal is said in. */
export const FEED_REFUSAL_WORDS = Object.freeze({
  self: "AZEROTH.Feeding.Refuse.self",
  bloodless: "AZEROTH.Feeding.Refuse.bloodless",
  fedToday: "AZEROTH.Feeding.Refuse.fedToday",
  reach: "AZEROTH.Feeding.Refuse.reach",
  open: "AZEROTH.Feeding.Refuse.open",
  way: "AZEROTH.Feeding.Refuse.way",
  corpseAge: "AZEROTH.Feeding.Refuse.corpseAge",
  alive: "AZEROTH.Feeding.Refuse.alive",
  noPool: "AZEROTH.Feeding.Refuse.noPool",
  noTarget: "AZEROTH.Feeding.Refuse.noTarget",
  noGM: "AZEROTH.Feeding.Refuse.noGM",
  budget: "AZEROTH.Feeding.Refuse.budget"
});

/**
 * Whether a feeding asks the creature's Body Resilience Test: a feeding in a fight that is not free
 * (02 §7: *It makes a Body Resilience Test against your Spell DC, and on a failure you feed*). A
 * feeding outside a fight, on a corpse, or one a talent makes *with no Test* asks none.
 *
 * @param {{mode?: string, free?: boolean}} o
 */
export function feedingTests({ mode = "fight", free = false } = {}) {
  return mode === "fight" && free !== true;
}

/**
 * **WHETHER A FEEDING'S LANDING GIVES BACK WHAT IT PAID** (the phase 3 review): only where nothing landed -
 * the creature or the Sovereign gone (`gone`), or no GM to take the creature's Health (`noGM`). A creature
 * that resisted, a second feeding refused for the day, or a Vitae write that failed after the Health was
 * taken keeps the price. Pure.
 *
 * @param {string|null|undefined} reason  `landFeedingPlan`'s refusal
 */
export function feedingGivesBack(reason) {
  return reason === "gone" || reason === "noGM";
}

/** What the creature loses in a fight (02 §7: *it loses Health equal to your tier*); nothing outside one. */
export function feedingHealthLoss({ mode = "fight", tier = 1 } = {}) {
  return mode === "fight" ? Math.max(1, int(tier)) : 0;
}

