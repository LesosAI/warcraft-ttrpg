/**
 * **DAMAGE OR HEALING LAID ON A CREATURE THAT LANDS AT THE START OF EACH OF ITS
 * TURNS** (D-770; the lead, 2026-10-03: *"Build the tick now"*). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * 07's Rejuvenation reads *The target regains 2 Health at the start of each of
 * its turns for the duration*, Immolate *The target takes 2 Fire damage at the
 * start of each of its turns*, and 08 §12's Serpent's tears *2 damage a turn
 * for 3 turns*. D-756 built the tick for an AREA - its Region, or its caster's
 * token - and a clause written ON THE CREATURE had no carrier: the card applied
 * the number once, at the cast, and nothing happened at anybody's turn (O-144,
 * O-114). The carrier is the creature's own laid effect now, and
 * `AzerothCombat#_turnTicks` lands it, beside the area's.
 *
 * ## The stored descriptor: `system.tick` on every spell
 *
 * Read off 07 by `readTick` and stamped by the parser, the whole shape on every
 * spell and empty where there is none, as `areaTick` is (D-756):
 *
 *   kind        "" | "damage" | "heal"
 *   type        the school of a damage tick; null for healing, and for 08's
 *               poisons, whose *N damage* names none
 *   amount      the number, as an expression (`rules/expressions.mjs`): a
 *               class phase may add a talent's `rank` to it
 *   rounds      how many of the carrier's turn starts it lands at - *for the
 *               duration* of *1 minute* is ten, *at the start of its next
 *               turn* is one - or null where its span is not a count: a
 *               Sustain, which ends with the Sustain (D-657's lift)
 *   until       "" | "casterTurnEnd": *until the end of your next turn*, the
 *               CASTER's (Moonfire, Flame Shock). In a fight of two sides
 *               taking turns by side (D-256) exactly one of the target's turns
 *               starts between the cast and that end, so `rounds` is 1 as well,
 *               and the laid effect's own span ends at the caster's turn
 *   when        "" | "startOfTurn": the CARRIER's turn
 *   hit         whether the cast lands its own number as well (Moonfire's 4
 *               then 2, Bloom's 4 then 3). False is the spell whose number IS
 *               the tick - Immolate, Rejuvenation - and the card then deals or
 *               heals nothing at the cast (`area-ticks.mjs#castDealsDamage`,
 *               `#castHeals`)
 *   sl          the Success Level the tick waits on (Fireball's *At SL 3 or
 *               better it is set alight*), or null
 *   spellpower  *and 1 further X damage on those turns for each point of
 *               Spellpower: X you carry*: the caster's Spellpower in that
 *               school added at each turn, as a tier 3 spell's always is (07
 *               §9: on a damage-over-time spell it raises the ongoing damage)
 *   reason      every per-turn sentence of the entry the tick does not carry,
 *               and every clause beside the one it reads, `"; "`-joined -
 *               counted under a CEILING in `ticks.test.mjs` that may only fall
 *
 * ## The laid tick: `flags.azeroth-rpg.tick` on an Active Effect
 *
 * `layTick` stamps the descriptor at the moment it is laid: the amount a
 * number, `source` the caster's (or the poisoner's) uuid, `castUuid` the
 * spell's, `cast` the card's D-724 key, `name` what it is called. The
 * countdown is `rounds`, one a turn start, and the effect goes at 0
 * (`tickCountdown`); where the effect also carries a span core can count, core
 * may take it first, and nothing is lost either way.
 */

import { AZEROTH } from "../config.mjs";
import { flatText, sentences } from "./spell-effects.mjs";
import { isStartOfTurnSentence, isUpkeep, roundsIn } from "./area-ticks.mjs";
import { areaFor } from "./areas.mjs";
import { evaluateExpression } from "./expressions.mjs";

/** What a tick does. */
export const TICK_KINDS = Object.freeze(["damage", "heal"]);

/** When it lands: the carrier's own turn. */
export const TICK_WHEN = Object.freeze(["startOfTurn"]);

/** What else ends it, beside its count. */
export const TICK_UNTIL = Object.freeze(["", "casterTurnEnd"]);

/** 05's table: *Minute - 10 rounds* (the area's, read off the chapter in its test). */
const ROUNDS_PER_MINUTE = 10;

/** No tick: the whole shape, every leaf empty. */
export function emptyTick() {
  return { kind: "", type: null, amount: "", rounds: null, until: "", when: "", hit: false, sl: null, spellpower: false, reason: "" };
}

/** Whether a stored or laid descriptor is a tick at all. */
export function hasTick(tick) {
  return Boolean(tick && typeof tick === "object" && TICK_KINDS.includes(tick.kind) && TICK_WHEN.includes(tick.when));
}

const SCHOOL = new Map(Object.keys(AZEROTH.schools).map(k => [k.charAt(0).toUpperCase() + k.slice(1), k]));
const schoolOf = word => SCHOOL.get(String(word ?? "")) ?? null;

/**
 * **A SENTENCE ABOUT THE START OF A TURN** (the census's reading): *at the
 * start of each of its turns*, *at the start of your next turn*, *starts its
 * turn*. 05 §12's upkeep is not one - every sustained entry restates it.
 */
export const PER_TURN_RE = /\bat the start of (?:each of )?(?:its|their|your|the target's)(?: next)? turns?\b|\b(?:starts|begins) (?:its|their) turns?\b/i;

/**
 * Whether a sentence is one the tick census accounts for: per turn, not the
 * upkeep, and not an AREA's - the start-of-turn sentence of a spell that places
 * an area or is Self, which D-756's descriptor and its census own.
 *
 * @param {string} sentence
 * @param {{area?: boolean}} [o]  the spell places an area or is Self
 */
export function isPerTurnSentence(sentence, { area = false } = {}) {
  const s = String(sentence ?? "");
  return PER_TURN_RE.test(s) && !isUpkeep(s) && !(area && isStartOfTurnSentence(s));
}

/** Whether a spell's Target places an area or is Self: the area census's own scope (D-756). */
export function placesArea(target = "") {
  const t = String(target ?? "").trim();
  return Boolean(areaFor(t)) || /^self$/i.test(t);
}

/**
 * *and 1 further X damage on those turns (on that turn) for each point of
 * Spellpower: X you carry*, the school the same both times.
 */
const SPELLPOWER = String.raw`, and 1 further (?<sp>[A-Z][a-z]+) damage on (?:those turns|that turn) for each point of \*\*Spellpower: \k<sp>\*\* you carry`;

/**
 * A clause beside the tick in its own sentence, which the tick does not carry:
 * said in the reason, and the tick still built.
 */
const BESIDE = Object.freeze([
  { re: /^ and its Speed drops by \d+ feet while sustaining this spell$/, text: "its Speed drop while the spell is sustained is not built" },
  { re: /^, and its Health maximum drops by \d+ while both run$/, text: "its Health maximum drop while both run is not built" }
]);

/** How many turn starts a span phrase is, read off the entry's Duration where it says *for the duration*. */
function spanRounds(phrase, duration) {
  if (/for one minute/.test(phrase ?? "")) return ROUNDS_PER_MINUTE;
  return roundsIn(duration ?? {});
}

/*
 * THE SHAPES 07 WRITES, sentence by sentence. Each answers the tick it reads and
 * the clauses beside it it does not carry, or null. A per-turn sentence no shape
 * reads goes to `UNTICKED`, and one nothing there names fails the census by name.
 */
const SHAPES = [
  // *The target takes 2 Fire damage at the start of each of its turns* (Immolate,
  // Shadow Word: Pain), *... for the duration* (Chaosbrand, Smolder), *It takes 4
  // Frost damage ... for the duration* after a prerequisite sentence (Frostwake,
  // Ley Wound, Necrosis, Shadow Word: Anguish, Wasting), with or without the
  // Spellpower clause (Curse of Agony, Curse of Doom, Shadow Word: Hunger).
  (s, fields) => {
    const m = new RegExp(String.raw`^(?:The target|It) takes (?<n>\d+) (?<w>[A-Z][a-z]+) damage at the start of each of its turns(?<span> for the duration| for one minute)?(?:${SPELLPOWER})?(?<rest>.*?)\.?$`).exec(s);
    if (!m) return null;
    if (m.groups.sp && m.groups.sp !== m.groups.w) return null;
    const rest = m.groups.rest ?? "";
    const beside = BESIDE.find(b => b.re.test(rest));
    if (rest && !beside) return null;
    return {
      tick: { kind: "damage", type: schoolOf(m.groups.w), amount: m.groups.n, rounds: spanRounds(m.groups.span, fields?.duration), spellpower: Boolean(m.groups.sp) },
      beside: beside ? [beside.text] : []
    };
  },
  // *The target takes 4 Arcane damage, then 2 Arcane damage at the start of each
  // of its turns until the end of your next turn* (Moonfire, Flame Shock), *...
  // for one minute, and 1 further ...* (Moonglow).
  (s, fields) => {
    const m = new RegExp(String.raw`^The target takes (?<first>\d+) (?<w>[A-Z][a-z]+) damage, then (?<n>\d+) \k<w> damage at the start of each of its turns (?<span>until the end of your next turn|for one minute|for the duration)(?:${SPELLPOWER})?\.?$`).exec(s);
    if (!m) return null;
    if (m.groups.sp && m.groups.sp !== m.groups.w) return null;
    const caster = m.groups.span === "until the end of your next turn";
    return {
      tick: {
        kind: "damage", type: schoolOf(m.groups.w), amount: m.groups.n, hit: true, spellpower: Boolean(m.groups.sp),
        rounds: caster ? 1 : spanRounds(m.groups.span, fields?.duration),
        until: caster ? "casterTurnEnd" : ""
      },
      beside: []
    };
  },
  // *The target takes 4 Holy damage, then 2 Holy damage at the start of its next
  // turn, and 1 further Holy damage on that turn ...* (Holy Fire, Holy Brand).
  s => {
    const m = new RegExp(String.raw`^The target takes (?<first>\d+) (?<w>[A-Z][a-z]+) damage, then (?<n>\d+) \k<w> damage at the start of its next turn(?:${SPELLPOWER})?\.?$`).exec(s);
    if (!m) return null;
    if (m.groups.sp && m.groups.sp !== m.groups.w) return null;
    return { tick: { kind: "damage", type: schoolOf(m.groups.w), amount: m.groups.n, rounds: 1, hit: true, spellpower: Boolean(m.groups.sp) }, beside: [] };
  },
  // Fireball: *At SL 3 or better it is set alight and takes a further 2 Fire
  // damage at the start of its next turn.*
  s => {
    const m = /^At SL (?<sl>\d+) or better it is set alight and takes a further (?<n>\d+) (?<w>[A-Z][a-z]+) damage at the start of its next turn\.?$/.exec(s);
    if (!m) return null;
    return { tick: { kind: "damage", type: schoolOf(m.groups.w), amount: m.groups.n, rounds: 1, hit: true, sl: Number(m.groups.sl) }, beside: [] };
  },
  // *The target regains 2 Health at the start of each of its turns for the
  // duration* (Rejuvenation, Renew).
  (s, fields) => {
    const m = /^(?:The target|It) regains (?<n>\d+) Health at the start of each of its turns(?<span> for the duration)?\.?$/.exec(s);
    if (!m) return null;
    return { tick: { kind: "heal", amount: m.groups.n, rounds: spanRounds(m.groups.span, fields?.duration) }, beside: [] };
  },
  // Bloom: *The target regains 4 Health, then 3 Health at the start of each of its turns for the duration.*
  (s, fields) => {
    const m = /^The target regains (?<first>\d+) Health, then (?<n>\d+) Health at the start of each of its turns(?<span> for the duration)?\.?$/.exec(s);
    if (!m) return null;
    return { tick: { kind: "heal", amount: m.groups.n, rounds: spanRounds(m.groups.span, fields?.duration), hit: true }, beside: [] };
  },
  // Light Unending: *For the duration each target has Ward 3 ..., cannot be
  // Frightened or Charmed, and regains 3 Health at the start of each of its
  // turns.* The Ward is the laid effect's own change; the healing is the tick.
  (s, fields) => {
    const m = /^For the duration each target has [^.]*?, and regains (?<n>\d+) Health at the start of each of its turns\.?$/.exec(s);
    if (!m) return null;
    return { tick: { kind: "heal", amount: m.groups.n, rounds: roundsIn(fields?.duration ?? {}) }, beside: [] };
  }
];

/**
 * **WHAT A PER-TURN SENTENCE THE TICK DOES NOT READ IS**, in words: the reason
 * the spell carries for it. A sentence nothing here names carries NO reason,
 * and the census fails on it by name - a new wording in 07 is a decision to
 * make, never a silent pass.
 */
export const UNTICKED = Object.freeze([
  // An upkeep paid in Health (Felfire Aura, Felstep) was a reason here until D-778
  // built it: the turn's start charges it (`rules/upkeep.mjs`), and `isUpkeep`
  // reads it as the caster's upkeep, never a per-turn sentence.
  { key: "delayed", re: /\blands at the start of your next turn\b/, text: "a blast that lands at the start of the caster's next turn is not built" },
  // An area's own clauses at the caster's turn: D-757's growth is the area
  // descriptor's (`areaTick.grows`), and the choice of whom to strike its reason.
  { key: "areaGrows", re: /\bat the start of each of your turns it grows by \d+ feet\b/i, text: "the area's growth at the caster's turn is the area's own descriptor's (D-757)" },
  { key: "casterChoice", re: /\bone creature of your choice inside the area takes\b/i, text: "a creature of the caster's choice struck at the caster's turn is not built" },
  { key: "casterTurn", re: /\bat the start of (?:each of )?your(?: next)? turns?\b/i, text: "what happens at the start of the CASTER's turn is not a tick, which lands at its carrier's" },
  { key: "mana", re: /\bregains \d+ Mana at the start of each of its turns\b/, text: "Mana regained each turn is not a tick, which carries damage or Health" },
  { key: "whileCondition", re: /\bwhile it remains \*?\*?Entangled|\bwhile held\b/, text: "a tick that lasts while a condition holds is not built" },
  { key: "doubles", re: /\bdoubles on each of its turns\b/, text: "an amount that doubles each turn is not built" },
  { key: "failedBurn", re: /\bEverything that failed goes on burning\b/, text: "a tick on each creature that failed the area's Test is not built" },
  { key: "replaces", re: /\bat the start of each of its turns for the duration rather than \d+\b/, text: "a tick that replaces another spell's is not built" },
  { key: "turnTest", re: /\bmust pass a \w+ Resilience Test against your Spell DC at the start of each of its turns\b/, text: "a Test made at the start of each turn is not built" },
  { key: "revive", re: /\breturns to 1 Health at the start of its next turn\b/, text: "a return from 0 Health is not built" }
]);

/**
 * **THE TICK A SPELL'S OWN WORDS STATE, AND EVERY PER-TURN SENTENCE IT DOES
 * NOT READ.** The first sentence a shape reads is the tick; every other
 * per-turn sentence is `unread`, with the `UNTICKED` key that names it or null.
 *
 * @param {string} effectText  the effect, HTML or flat
 * @param {{target?: string, duration?: {kind?: string|null, text?: string}}} [fields]  07 §9's own fields
 * @returns {{tick: ReturnType<typeof emptyTick>, read: string|null, unread: Array<{sentence: string, reason: string|null}>}}
 */
export function readTickSentences(effectText, fields = {}) {
  const tick = emptyTick();
  const reasons = [];
  const unread = [];
  let read = null;
  const area = placesArea(fields?.target);
  for (const s of sentences(flatText(effectText))) {
    if (!isPerTurnSentence(s, { area })) continue;
    if (!read) {
      let shaped = null;
      for (const shape of SHAPES) {
        shaped = shape(s, fields);
        if (shaped) break;
      }
      if (shaped) {
        Object.assign(tick, shaped.tick, { when: "startOfTurn" });
        reasons.push(...shaped.beside);
        read = s;
        continue;
      }
    }
    const why = UNTICKED.find(u => u.re.test(s)) ?? null;
    unread.push({ sentence: s, reason: why?.key ?? null });
    if (why) reasons.push(why.text);
  }
  tick.reason = [...new Set(reasons)].join("; ");
  return { tick, read, unread };
}

/**
 * The stored descriptor for one spell, the parser's stamp: `readTickSentences`'
 * tick, the whole shape whether or not there is one.
 */
export function readTick(effectText, fields = {}) {
  return readTickSentences(effectText, fields).tick;
}

/**
 * **08 §12's TICK POISONS** (O-114): *Body Resilience DC 13 or 2 damage a turn
 * for 3 turns*. The four - Serpent's tears, Deathweed extract, Apothecary's rot
 * and Widow's draught - name no damage type, so the tick is untyped: the
 * printed number lands, and no Armor Point or Ward reduces it (D-770, a reading
 * for the lead). Null for anything else.
 *
 * @param {string} text  the Effect run, or what follows its Test
 * @returns {ReturnType<typeof emptyTick>|null}
 */
export function readPoisonTick(text) {
  const m = /\b(\d+) damage a turn for (\d+) turns\b/.exec(flatText(text));
  if (!m) return null;
  return { ...emptyTick(), kind: "damage", amount: m[1], rounds: Number(m[2]), when: "startOfTurn" };
}

/**
 * **THE TICK AS IT IS LAID**: the stored descriptor at the moment it lands on a
 * creature, the amount a number and the hand that laid it recorded. Null where
 * there is no tick, where the cast's Success Level does not reach the tick's
 * (Fireball's *At SL 3 or better*), or where the amount cannot be read or
 * comes to nothing.
 *
 * **A TALENT MAY RAISE IT** (04's Moonfire and Rejuvenation, D-771): `add` is
 * what the caster's talents add to every turn's number
 * (`talent-effects.mjs#tickBonusFor`), on a tick the stored amount already
 * makes; it never makes a tick of nothing. **A CLASS FEATURE MAY LAY ONE**
 * (02's Regrowth, 04's Wild Growth): `via: "feature"` rides the laid tick, so
 * its landing heals as a feature's does and not as a spell's.
 *
 * @param {object} stored  `system.tick`, or `readPoisonTick`'s
 * @param {{source?: string|null, castUuid?: string|null, cast?: string|null, name?: string,
 *   rank?: number, tier?: number, sl?: number|null, add?: number, via?: "feature"|null}} [o]
 * @returns {object|null}  the `flags.azeroth-rpg.tick` an effect carries
 */
export function layTick(stored, { source = null, castUuid = null, cast = null, name = "", rank = 1, tier = 1, sl = null, add = 0, via = null } = {}) {
  if (!hasTick(stored)) return null;
  if (stored.sl !== null && stored.sl !== undefined && !(Number(sl) >= Number(stored.sl))) return null;
  const base = Math.trunc(evaluateExpression(stored.amount, { rank, tier }) ?? 0);
  if (!(base > 0)) return null;
  const amount = base + Math.max(0, Math.trunc(Number(add)) || 0);
  const rounds = stored.rounds === null || stored.rounds === undefined ? null : Math.max(1, Math.trunc(Number(stored.rounds)) || 1);
  return {
    kind: stored.kind,
    type: stored.kind === "damage" ? (stored.type ?? null) : null,
    amount,
    rounds,
    until: TICK_UNTIL.includes(stored.until) ? stored.until : "",
    when: "startOfTurn",
    spellpower: stored.spellpower === true,
    source, castUuid, cast, name: String(name ?? ""),
    ...(via === "feature" ? { via } : {})
  };
}

/**
 * **A CLASS FEATURE'S TICK AS A STORED DESCRIPTOR** (02's Regrowth: *On the
 * target's next turn, they restore Health equal to your tier*; 04's Wild
 * Growth; D-771): the feature item's stamped `{kind, amount, rounds}` in the
 * shape `layTick` reads, landing at the start of the carrier's turns. **MY
 * READING, for the lead**: Regrowth's *on the target's next turn* lands as a
 * tick does, at the start of that turn. Null where the feature lays none.
 *
 * @param {{kind?: string|null, amount?: string|null, rounds?: number}|null} stamp
 * @returns {object|null}
 */
export function featureTick(stamp) {
  if (!stamp || !TICK_KINDS.includes(stamp.kind)) return null;
  const amount = stamp.amount === null || stamp.amount === undefined ? "" : String(stamp.amount);
  const rounds = Math.trunc(Number(stamp.rounds)) || 0;
  if (!amount || rounds < 1) return null;
  return { ...emptyTick(), kind: stamp.kind, amount, rounds, when: "startOfTurn", hit: true };
}

/**
 * **WHETHER A LAID TICK HAS A CLOCK TO END ON** (the D-770 review, item A).
 *
 * A COUNTED tick ends by its countdown, one at each of its carrier's turn
 * starts - and out of a fight a creature has no turns. Fireball's set alight,
 * Holy Fire, Holy Brand, Moonfire and Flame Shock laid on a creature in no
 * started fight stood on it with nothing to count them down and nothing to
 * expire them, and then landed at the first turn of whatever fight came next.
 * So a counted tick is laid only where something ends it:
 *
 * - its carrier is in a started fight, where the countdown is the clock;
 * - the spell's span is one the world's clock counts (Rejuvenation's minute),
 *   which `effects/durations.mjs#spellTiming` puts on the effect in or out of a
 *   fight;
 * - or it lasts *until the end of your next turn* and the CASTER is in a
 *   started fight, whose turn ends it (`untilEndOfNextTurn`).
 *
 * A Sustain's tick (`rounds` null) always has one: it ends with the Sustain
 * (D-657's lift). Where none holds the door lays no tick and says so in words.
 *
 * @param {object|null} tick  a laid tick, or a stored descriptor
 * @param {{duration?: {value?: number, units?: string}|null, carrierInFight?: boolean, casterInFight?: boolean}} [o]
 *   `duration` the card's (`effectDuration`'s) span, null for an instant spell
 * @returns {boolean}
 */
export function tickHasClock(tick, { duration = null, carrierInFight = false, casterInFight = false } = {}) {
  if (!hasTick(tick)) return false;
  if (tick.rounds === null || tick.rounds === undefined) return true;
  if (carrierInFight) return true;
  if (tick.until === "casterTurnEnd" && casterInFight) return true;
  const units = duration?.units ?? null;
  return Boolean(units) && units !== "rounds" && units !== "turns";
}

/**
 * What one turn start leaves of a laid tick: `{rounds}` counted down, `{delete:
 * true}` where that was its last, or null where it is not counted - a
 * Sustain's, which ends with the Sustain.
 *
 * @param {object} laid
 * @returns {{rounds: number}|{delete: true}|null}
 */
export function tickCountdown(laid) {
  const n = laid?.rounds;
  if (n === null || n === undefined) return null;
  const left = Math.trunc(Number(n)) - 1;
  return left >= 1 ? { rounds: left } : { delete: true };
}

/**
 * **WHAT ONE LANDING OF A LAID TICK DEALS** (04's Devouring Plague; the lead,
 * 2026-10-03, on O-186: *"tick on cast, and 1 turn after."*; D-779): the stamped
 * amount, twice over while the tick still carries `doubled` landings, and how many
 * doubled landings are left once this one has landed. A tick with none deals its
 * amount and keeps nothing.
 *
 * @param {object} laid  a laid tick
 * @returns {{amount: number, doubled: boolean, left: number}}
 */
export function tickLanding(laid) {
  const amount = Math.max(0, Math.trunc(Number(laid?.amount)) || 0);
  const n = Math.max(0, Math.trunc(Number(laid?.doubled)) || 0);
  return n > 0 ? { amount: amount * 2, doubled: true, left: n - 1 } : { amount, doubled: false, left: 0 };
}

/**
 * The ticks due at a turn start, in the order they land: DAMAGE BEFORE HEALING
 * (the area's rule, D-756's review S5: a dying creature is not stood up and
 * knocked down again), then by id, so two runs land them the same way.
 *
 * @param {Array<{id: string, tick: object}>} rows  the carrier's ACTIVE effects with a tick
 * @returns {Array<{id: string, tick: object}>}
 */
export function ticksDue(rows = []) {
  return (rows ?? [])
    .filter(r => r?.id && hasTick(r.tick))
    .sort((a, b) => (a.tick.kind === b.tick.kind ? 0 : a.tick.kind === "damage" ? -1 : 1) || String(a.id).localeCompare(String(b.id)));
}

/**
 * **WHICH LAID TICK `endTick` ENDS** (Swiftmend's *end one of your ongoing
 * healing effects on a friendly target*, wired in Phase 3): one of this kind
 * laid by this hand - the one named where the caller names one, else the first
 * by id, so the choice is never a coin toss. Null where there is none.
 *
 * @param {Array<{id: string, tick: object}>} rows
 * @param {{from?: string|null, kind?: string, id?: string|null}} o  `from` the caster's uuid
 * @returns {string|null}
 */
export function tickToEnd(rows = [], { from = null, kind = "heal", id = null } = {}) {
  const mine = (rows ?? [])
    .filter(r => r?.id && hasTick(r.tick) && r.tick.kind === kind && (!from || r.tick.source === from))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (id) return mine.some(r => r.id === id) ? id : null;
  return mine[0]?.id ?? null;
}

/**
 * The parts of the card's *Each turn* line, keys and numbers (CLAUDE.md §4: a
 * derived line is composed in the pure module and takes its words from the door).
 *
 * @param {object} tick  a laid tick
 * @returns {{kind: string, amount: number, type: string|null, span: "rounds"|"casterTurnEnd"|"sustain", rounds: number|null, spellpower: boolean}|null}
 */
export function tickLineParts(tick) {
  if (!hasTick(tick)) return null;
  const span = tick.until === "casterTurnEnd" ? "casterTurnEnd" : (tick.rounds === null || tick.rounds === undefined ? "sustain" : "rounds");
  return { kind: tick.kind, amount: Number(tick.amount) || 0, type: tick.type ?? null, span, rounds: tick.rounds ?? null, spellpower: tick.spellpower === true };
}

const oneOf = (v, list) => (list.includes(v) ? v : null);

/**
 * A stored descriptor made valid, KEY BY KEY: only what was handed in is
 * touched, because `migrateData` runs over a partial update as readily as over
 * a whole document (CLAUDE.md §15, D-671). Mutates and returns `raw`.
 */
export function cleanTick(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const has = key => key in raw;
  if (has("kind")) raw.kind = oneOf(raw.kind, ["", ...TICK_KINDS]) ?? "";
  if (has("type")) raw.type = typeof raw.type === "string" && AZEROTH.schools[raw.type] ? raw.type : null;
  if (has("amount")) raw.amount = raw.amount === null || raw.amount === undefined ? "" : String(raw.amount);
  if (has("rounds")) {
    const n = Math.trunc(Number(raw.rounds));
    raw.rounds = raw.rounds === null || !Number.isFinite(n) || n < 1 ? null : n;
  }
  if (has("until")) raw.until = oneOf(raw.until, TICK_UNTIL) ?? "";
  if (has("when")) raw.when = oneOf(raw.when, ["", ...TICK_WHEN]) ?? "";
  if (has("hit")) raw.hit = raw.hit === true;
  if (has("sl")) {
    const n = Math.trunc(Number(raw.sl));
    raw.sl = raw.sl === null || !Number.isFinite(n) ? null : n;
  }
  if (has("spellpower")) raw.spellpower = raw.spellpower === true;
  if (has("reason")) raw.reason = typeof raw.reason === "string" ? raw.reason : "";
  return raw;
}
