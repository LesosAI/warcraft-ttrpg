/**
 * **THE CHRONOMANCER'S LAW** (02 §7's eight features and 04's Shifting Sands and
 * Chronoweaver; stage 2b of the Chronomancer build). Pure: no Foundry imports
 * (CLAUDE.md §3). Every number a door reads lives here once, held to the pack's own
 * text by `chronomancer-features.test.mjs` and `chronomancer-talents.test.mjs`.
 *
 * The lead's rule for this stage, verbatim: *"We need automation and animations fully
 * complete for everything"*. Each reader below has a caller in a door; the tests'
 * consumer blocks read the callers off their source.
 *
 * `rowOf` is the talent table's lookup, handed in so this module never imports
 * `talent-effects.mjs` (which imports this one's constants nowhere, and a test may
 * hand a row of its own).
 */

// 07 §12's Stasis: its repeat Test rides the Stunned as 07's escape (O-306, `holdOutOfTime`).
import { cleanEscape } from "./escapes.mjs";

/* -------------------------------------------- */
/*  02 §7's features                             */
/* -------------------------------------------- */

/**
 * The eight features' numbers, as 02 §7 prints them. `chronomancer-features.test.mjs`
 * reads every one back off the class pack's own text.
 */
export const CHRONO_FEATURES = Object.freeze({
  timelessMind: Object.freeze({ feature: "Timeless Mind", resilience: "spirit" }),
  anotherTimeline: Object.freeze({ feature: "Another Timeline", mana: 2, feet: 30, kinds: Object.freeze(["attack", "casting", "resilience"]) }),
  slipstream: Object.freeze({ feature: "Slipstream", mana: 4, feet: 30, uses: 1 }),
  recall: Object.freeze({ feature: "Recall", mana: 6, minutes: 10 }),
  turnTheGlass: Object.freeze({ feature: "Turn the Glass", mana: 6 }),
  suspend: Object.freeze({ feature: "Suspend", mana: 8, feet: 30, resilience: "spirit", condition: "stunned" }),
  recurrence: Object.freeze({ feature: "Recurrence", mana: 12, maxTier: 3 }),
  masterOfHours: Object.freeze({ feature: "Master of Hours", mana: 20, gains: Object.freeze([1, 2, 3]), giftSand: 2, giftFeet: 30 })
});

/**
 * **THE CAP OF 6 HALF-ACTIONS A TURN** (02 §7's Master of Hours prints *No creature holds
 * more than 6 Half-Actions in a turn*; D-870). Read where a Half-Action is gained
 * (`rules/initiative.mjs#gainHalfActions`) for every source EXCEPT Master of Hours' own
 * stack and its 2-Sand gifts: the lead, on Turn the Glass with Master of Hours, *"the eight
 * half actions a turn is fine because of the resource spend."*, recorded as *No limit*
 * (D-877). The book's sentence still reads as a cap on every creature (O-273).
 */
export const HALF_ACTION_CAP = 6;

/** A whole number at or above nothing. */
const count = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** A row with its rank's clauses laid over it. */
export function atRankRow(row, rank = 1) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of row?.atRank ?? []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/** The taken talents carrying a row of one kind, each with its row at its rank, by identifier. */
export function chronoRows(talents = [], kind, rowOf) {
  const out = [];
  for (const t of talents ?? []) {
    if (!(Math.trunc(Number(t?.taken) || 0) > 0)) continue;
    const row = rowOf?.(t.className, t.identifier, t.race ?? null)?.[kind];
    if (row === undefined || row === null || row === false) continue;
    const rank = rankOf(t);
    out.push({ talent: t, rank, row: atRankRow(row, rank) });
  }
  return out.sort((a, b) => String(a.talent.identifier).localeCompare(String(b.talent.identifier)));
}

/** The first taken talent's row of one kind at its rank, with its name, or null. */
function firstRow(talents, kind, rowOf) {
  const r = chronoRows(talents, kind, rowOf)[0] ?? null;
  return r ? { ...r.row, name: r.talent.name, identifier: r.talent.identifier, rank: r.rank } : null;
}

/**
 * **TIMELESS MIND** (02: *Your Proficiency Bonus is doubled on Spirit Resilience
 * Tests*): whether the Test's Proficiency is counted a second time. Only where the
 * Proficiency is counted at all - the Chronomancer trains Spirit, so it always is.
 *
 * @param {{resilience?: string, holds?: boolean, trained?: boolean}} o
 */
export function timelessMindDoubles({ resilience = null, holds = false, trained = true } = {}) {
  return holds === true && trained === true && resilience === CHRONO_FEATURES.timelessMind.resilience;
}

/**
 * **ANOTHER TIMELINE, JUDGED ON THE HOLDER** (02: *As a Reaction, spend 2 Mana. A
 * creature you can see within 30 feet that has just made an Attack Test, a Casting Test
 * or a Resilience Test rolls it again and takes the second result*): the Test is one of
 * the three kinds, the roller is not the holder (*within 30 feet* of yourself reads no
 * one; MY READING, the Hasten reading), the reach where both stand on a board, the
 * Mana and the Reaction. Answers the refusal word or null.
 *
 * @param {{kind?: string, self?: boolean, feet?: number|null, mana?: number, reaction?: boolean, forced?: boolean}} o
 */
export function anotherTimelineRefusal({ kind = null, self = false, feet = null, mana = 0, reaction = true, forced = false } = {}) {
  const f = CHRONO_FEATURES.anotherTimeline;
  if (!f.kinds.includes(kind)) return "kind";
  if (forced === true) return "forced";
  if (self === true) return "self";
  if (feet === null || feet === undefined || Number(feet) > f.feet) return "far";
  if (count(mana) < f.mana) return "mana";
  if (reaction !== true) return "reaction";
  return null;
}

/**
 * **SLIPSTREAM, WITH SWIFT CURRENT AND TWINNED HOURS** (02: *Once per encounter, as a
 * Half-Action, spend 4 Mana. One ally other than you within 30 feet gains a Half-Action
 * on its next turn*; 04's Swift Current: *Your Slipstream reaches 60 feet. At rank 2 it
 * costs 2 Mana*; Twinned Hours: *You may use Slipstream twice per encounter. At rank 2
 * it may target you*): the reach, the price, the uses and whether the Chronomancer may
 * be the one. The price and the uses also ride the feature's own stamp (`mod` patches),
 * which is what the payment and the counter read; this answers what the JUDGEMENT reads.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{feet: number, mana: number, uses: number, self: boolean, by: string[]}}
 */
export function slipstreamFor(talents = [], rowOf) {
  const f = CHRONO_FEATURES.slipstream;
  const out = { feet: f.feet, mana: f.mana, uses: f.uses, self: false, by: [] };
  for (const { talent, row } of chronoRows(talents, "slipstream", rowOf)) {
    if (count(row.feet) > out.feet) out.feet = count(row.feet);
    if (row.mana !== undefined) out.mana = Math.min(out.mana, count(row.mana));
    if (count(row.uses) > out.uses) out.uses = count(row.uses);
    if (row.self === true) out.self = true;
    out.by.push(talent.name);
  }
  return out;
}

/**
 * **WHOM A GIVEN HALF-ACTION REACHES, JUDGED BEFORE ANYTHING IS PAID** (Slipstream, and
 * Master of Hours' gift): one creature, in the giver's started fight, within the feet
 * where both stand on a board, and the giver only where the words allow it. Answers the
 * refusal word or null.
 *
 * @param {{targets?: number, self?: boolean, selfAllowed?: boolean, ally?: boolean, allyNeeded?: boolean,
 *   feet?: number|null, reach?: number, inFight?: boolean}} o
 */
export function givenHalfRefusal({ targets = 0, self = false, selfAllowed = false, ally = true, allyNeeded = true, feet = null, reach = 30, inFight = false } = {}) {
  if (targets !== 1) return "one";
  if (self && !selfAllowed) return "self";
  if (!self && allyNeeded && ally !== true) return "ally";
  if (!inFight) return "fight";
  if (feet !== null && feet !== undefined && Number(feet) > reach) return "far";
  return null;
}

/**
 * **RECALL'S USES** (02: *You may use Recall a number of times per Short Rest equal to
 * half your Intelligence modifier, rounded down*; the lead: *"Make recall a number of
 * times equal to half your intelligence modifier rounded down."*): no minimum, so +1 is
 * none (O-item for the lead). The feature's counter is stamped from this expression, and
 * `class-features.mjs#usesMaxFor` is the one reader of it (the stage 3 fix removed a second,
 * hand-written `recallUses` that nothing ran).
 */
export const RECALL_USES = "floor(int/2)";

/** The flag the mark lives in on the Chronomancer. */
export const RECALL_FLAG = "recallMark";

/**
 * A mark as Recall writes it: where the token stood, when the ten minutes end on the
 * world's clock, and the damage taken since (counted by the damage ledger's own door).
 *
 * @param {{sceneId: string, tokenId: string, x: number, y: number, elevation?: number, time?: number}} o
 */
export function recallMark({ sceneId, tokenId, x, y, elevation = 0, time = 0 } = {}) {
  const minutes = CHRONO_FEATURES.recall.minutes;
  return {
    sceneId: String(sceneId ?? ""), tokenId: String(tokenId ?? ""),
    x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0), elevation: Number(elevation) || 0,
    expires: (Number(time) || 0) + minutes * 60, taken: 0
  };
}

/** Whether a mark still stands at a time on the world's clock. */
export function recallStands(mark, time = 0) {
  return Boolean(mark && typeof mark === "object" && mark.sceneId && Number(mark.expires) > (Number(time) || 0));
}

/** The mark with one more blow's damage counted, or the mark unchanged where it has lapsed. */
export function recallCounts(mark, amount = 0, time = 0) {
  if (!recallStands(mark, time)) return mark;
  return { ...mark, taken: count(mark.taken) + count(amount) };
}

/** What a return regains: every point taken since the mark (02's *equal to the damage*). */
export function recallHeal(mark) {
  return count(mark?.taken);
}

/**
 * **RECALL'S MARK ON THE BOARD** (the lead's play-test, 2026-11-10: *"Recall does not place a
 * region or marker on the map for the recall location"*; D-889). The flag a marker Region
 * carries; the actor's own `recallMark` flag is the truth and the Region only shows it.
 */
export const RECALL_MARKER_FLAG = "recallMarker";

/** The key that tells one mark from the next: whose it is, where it is and when it ends. */
export function recallMarkKey(actorUuid, mark) {
  if (!actorUuid || !mark?.sceneId) return null;
  return [actorUuid, mark.sceneId, Math.round(Number(mark.x) || 0), Math.round(Number(mark.y) || 0), Number(mark.expires) || 0].join("|");
}

/**
 * **WHICH MARKERS THE BOARD SHOULD HOLD** (D-889): exactly one Region for every mark that still
 * stands (`recallStands`), on the mark's scene, and none for a mark that has lapsed, been spent
 * by the return, been replaced by a new mark, or whose actor is gone. Pure; the active GM's
 * client writes it (`canvas/recall-marker.mjs`).
 *
 * @param {{marks?: Array<{actorUuid: string, mark: object|null}>, regions?: Array<{id: string, sceneId: string, key: string|null}>, time?: number}} o
 * @returns {{create: Array<{actorUuid: string, mark: object, key: string}>, remove: Array<{id: string, sceneId: string}>}}
 */
export function recallMarkerPlan({ marks = [], regions = [], time = 0 } = {}) {
  const wanted = new Map();
  for (const { actorUuid, mark } of marks ?? []) {
    if (!recallStands(mark, time)) continue;
    const key = recallMarkKey(actorUuid, mark);
    if (key) wanted.set(key, { actorUuid, mark, key });
  }
  const kept = new Set();
  const remove = [];
  const sorted = [...(regions ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const r of sorted) {
    const w = r?.key ? wanted.get(r.key) : null;
    if (w && w.mark.sceneId === r.sceneId && !kept.has(r.key)) kept.add(r.key);
    else remove.push({ id: r.id, sceneId: r.sceneId });
  }
  const create = [...wanted.values()].filter(w => !kept.has(w.key)).sort((a, b) => a.key.localeCompare(b.key));
  return { create, remove };
}

/**
 * **SUSPEND** (02: *held out of time until the end of its next turn ... While held it is
 * Stunned and immune to damage, and its conditions and effects do not count down*): the
 * flag the hold's own effect carries; the damage door reads it.
 */
export const SUSPEND_FLAG = "suspended";

/** The kinds of hold out of time (`holdOutOfTime`): 02's Suspend and 07 §12's Stasis. */
export const HOLD_KINDS = Object.freeze(["suspend", "stasis"]);

/** Whether a creature's effects hold it out of time now. */
export function suspendedBy(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const s = e.flags?.["azeroth-rpg"]?.[SUSPEND_FLAG];
    if (s && typeof s === "object") return s;
  }
  return null;
}

/**
 * **HOLDING A DURATION** (Suspend's *its conditions and effects do not count down*;
 * Suspended Moment's *do not count down*; the plan's door 11: *re-enabled one round
 * longer*): a timed effect's duration in rounds grown by the rounds it is held. An
 * effect with no rounds to count is left as it stands. Answers the patch or null.
 *
 * @param {{value?: number|null, units?: string}|null} duration
 * @param {number} rounds
 * @returns {{"duration.value": number}|null}
 */
export function heldDuration(duration, rounds = 1) {
  const n = count(rounds);
  const v = Number(duration?.value);
  if (!n || !Number.isFinite(v) || v <= 0) return null;
  if (duration?.units && !["rounds", "turns"].includes(duration.units)) return null;
  return { "duration.value": Math.trunc(v) + n };
}

/**
 * **HELD OUT OF TIME: THE ONE JUDGEMENT OF WHAT A HOLD LAYS** (02 §7's Suspend and 07 §12's
 * Stasis; O-306, the lead: *"306 - I agree"* to building Stasis through Suspend's door; D-898).
 *
 * - **Suspend** (02: *held out of time until the end of its next turn ... While held it is
 *   **Stunned** and immune to damage, and its conditions and effects do not count down*): the Stun
 *   on the creature's own span, the hold on its own effect beside it, every timed effect one round
 *   longer (`heldDuration`), the round the hold lasts.
 * - **Stasis** (07: *On a failure it cannot act, move, speak or be moved, it takes no damage from
 *   any source, and nothing already affecting it advances while this runs. It may repeat the Test
 *   at the end of each of its turns, and leaves the spell when it succeeds.*): ONE carrier, the
 *   hold and a **Stunned** together (MY READING: A1's Stunned is *cannot act*, which is how the
 *   system carries it), with no span of its own - it stands while the Sustain does - wearing the
 *   held-Sustain mark (`sustained`, `cast`, `holds`; O-303) so the Sustain ends once nobody is
 *   held, and the repeat Test as 07's escape on the Stunned (Spirit, at the end of each of its
 *   turns, its own Bane kept - MY READING of *repeat the Test* - leaving the spell). *Nothing
 *   already affecting it advances* is Temporal Sanctuary's hold (`rules/sand-auras.mjs`: switched
 *   off and grown by the time held at release, six seconds a round out of a fight), since the
 *   span is open. *Or be moved* refuses a forced move (`unmovableBy`).
 *
 * @param {"suspend"|"stasis"} kind
 * @param {{dc?: number|null, cast?: string|null, caster?: string|null, source?: string}} [o]
 * @returns {{kind: string, condition: "stunned", span: "endOfNextTurn"|null, durations: "grow"|"hold",
 *   carrier: "own"|"condition", unmovable: boolean, escape: object|null, marks: object|null}|null}
 */
export function holdOutOfTime(kind, { dc = null, cast = null, caster = null, source = "" } = {}) {
  if (kind === "suspend") {
    return { kind, condition: "stunned", span: "endOfNextTurn", durations: "grow", carrier: "own", unmovable: false, escape: null, marks: null };
  }
  if (kind !== "stasis") return null;
  const held = typeof cast === "string" && cast && typeof caster === "string" && caster;
  return {
    kind, condition: "stunned", span: null, durations: "hold", carrier: "condition", unmovable: true,
    escape: cleanEscape({ condition: "stunned", on: "turnEnd", resilience: "spirit", banes: 1, leaves: true, dc, by: caster, source, cast }),
    marks: held ? { sustained: true, cast, holds: true } : null
  };
}

/** Whether an effect is a hold whose span is open (Stasis's carrier): `holdOutOfTime`'s `condition` carrier. */
export function openHold(effect) {
  if (!effect) return false;
  const s = effect.flags?.["azeroth-rpg"]?.[SUSPEND_FLAG];
  return Boolean(s && typeof s === "object" && s.kind === "stasis");
}

/** Whether a creature's effects hold it where it stands (Stasis: *or be moved*): the hold's record, or null. */
export function unmovableBy(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    if (openHold(e)) return e.flags["azeroth-rpg"][SUSPEND_FLAG];
  }
  return null;
}

/**
 * **RECURRENCE** (02: *The damage and healing of the next spell of tier 3 or lower you
 * cast this turn land again, on the same creatures, at the start of your next turn, with
 * no Mana and no Casting Test*): whether a spell is one it takes.
 */
export function recurrenceTakes(spell) {
  const tier = Math.trunc(Number(spell?.tier ?? spell?.system?.tier)) || 0;
  return tier >= 1 && tier <= CHRONO_FEATURES.recurrence.maxTier;
}

/** The flag Recurrence waits on, on the Chronomancer, until a spell takes it or the turn ends. */
export const RECURRENCE_FLAG = "recurrence";

/** The list of landings that wait for the Chronomancer's next turn (Recurrence and Echoing Sands). */
export const AGAIN_FLAG = "landsAgain";

/**
 * One row of what lands again at the start of the caster's next turn: `kind` damage or
 * heal, the amount the blow already landed (after Armor Points and Ward, never reduced a
 * second time - D-858's reading for Echoing Sands, and the same reading for Recurrence),
 * the creature, the spell and the source.
 */
export function againRow({ kind = "damage", amount = 0, target = "", type = null, spell = "", source = "", combatId = null } = {}) {
  const a = count(amount);
  if (!a || !target || !["damage", "heal"].includes(kind)) return null;
  return { kind, amount: a, target: String(target), type: typeof type === "string" ? type : null, spell: String(spell ?? ""), source: String(source ?? ""), combatId: combatId || null };
}

/** The list with one more row; a row that is nothing leaves it. */
export function appendAgain(list = [], row = null) {
  const rows = (Array.isArray(list) ? list : []).filter(r => r && typeof r === "object");
  return row ? [...rows, row] : rows;
}

/**
 * **MASTER OF HOURS** (02: *For your next three turns you gain Half-Actions that stack: 1
 * at the start of the first, 2 at the start of the second and 3 at the start of the third
 * ... Then it ends*): what a turn start gives, by how many of the three have been taken.
 * Answers `{gain, done}`: nothing and done past the third.
 *
 * @param {number} taken  how many of its turns have started
 */
export function masterOfHoursTurn(taken = 0) {
  const gains = CHRONO_FEATURES.masterOfHours.gains;
  const i = count(taken);
  return { gain: gains[i] ?? 0, done: i + 1 >= gains.length };
}

/** The effect flag Master of Hours runs on. */
export const MASTER_FLAG = "masterOfHours";

/* -------------------------------------------- */
/*  04's Shifting Sands                          */
/* -------------------------------------------- */

/**
 * **GRIT OF AGES** (04: *As you make a Casting Test, before you roll, you may spend Sand,
 * up to twice your rank, on one of two things: 1 more damage for each Sand, or 1 more SL
 * for each 2 Sand. Choose one; the Sand cannot be split between them.*; the lead: *"reword
 * to be more clear that you can choose spell damage or SL bonus. not both"*): the dialog's
 * lines, one for each amount the Sand and the cap allow - damage at 1 to the cap, SL at 1
 * to half the cap - each UNTICKED, each greyed with its reason where the Sand will not
 * cover it. `gritPicked` refuses two ticked.
 *
 * @param {Array} talents
 * @param {{sand?: number|null, damages?: boolean}} o  `sand` null with no Hourglass
 * @param {Function} rowOf
 * @returns {Array<object>}
 */
export function gritLines(talents = [], { sand = null, damages = true } = {}, rowOf) {
  const row = firstRow(talents, "grit", rowOf);
  if (!row) return [];
  const cap = count(row.cap ?? 2) * row.rank;
  const held = sand === null || sand === undefined ? null : count(sand);
  const lines = [];
  const line = (kind, n, price) => {
    const enough = held !== null && held >= price;
    lines.push({
      id: `talent-line-grit-${kind}${n}`, identifier: `grit-${kind}${n}`, talentIdentifier: row.identifier, name: row.name,
      kind: "grit", grit: kind, doesKey: kind === "sl" ? "AZEROTH.TalentLine.Does.gritSl" : "AZEROTH.TalentLine.Does.gritDamage", amount: n, price, pool: "sand", left: held ?? 0, available: enough, checked: false,
      reason: enough ? null : (held === null ? "AZEROTH.SandCast.NoHourglass" : "AZEROTH.SandCast.NotEnough")
    });
  };
  if (damages) for (let n = 1; n <= cap; n += 1) line("damage", n, n * count(row.damage ?? 1));
  for (let n = 1; n * count(row.sl ?? 2) <= cap; n += 1) line("sl", n, n * count(row.sl ?? 2));
  return lines;
}

/**
 * The ONE Grit line a cast takes, or a refusal: two ticked is *the Sand cannot be split
 * between them* (and two amounts of one is two spends). Answers `{line, refusal}`.
 */
export function gritPicked(lines = []) {
  const ticked = (lines ?? []).filter(l => l?.kind === "grit");
  if (ticked.length > 1) return { line: null, refusal: "AZEROTH.Grit.OneOnly" };
  return { line: ticked[0] ?? null, refusal: null };
}

/** What a ticked line adds: `{damage, sl, sand}`. A failed Test gains no SL (07 §8). */
export function gritOutcome(line, { success = true } = {}) {
  if (!line) return { damage: 0, sl: 0, sand: 0 };
  return {
    damage: line.grit === "damage" ? count(line.amount) : 0,
    sl: line.grit === "sl" && success ? count(line.amount) : 0,
    sand: count(line.price)
  };
}

/**
 * **THE SL A CAST CARRIES ONCE GRIT OF AGES IS COUNTED** (the lead's play-test, 2026-11-10:
 * *"Spending sand on Grit of Ages did not give SL +1"*; D-887). A Test succeeds or fails
 * on its total against the DC, never on its SL (05 §2, CLAUDE.md §7), so the SL Grit buys
 * is the SL of a Test that went off: on a success it raises the card's SL - the one every
 * *At SL n* rider reads - to no more than the cap; on a failure the Sand is still spent
 * (*before you roll*, as Overchannel's Health is, 07 §8) and the SL is the Test's own.
 * `gained` is what the card says was added; `kind` is the line's choice.
 *
 * @param {number} baseSl  the cast's SL before Grit
 * @param {object|null} line  the ticked Grit line, or none
 * @param {{success?: boolean, cap?: number}} [o]
 * @returns {{sl: number, from: number, gained: number, sand: number, kind: "sl"|"damage"|null}}
 */
export function gritSl(baseSl, line, { success = true, cap = 6 } = {}) {
  const from = Math.trunc(Number(baseSl)) || 0;
  if (!line) return { sl: from, from, gained: 0, sand: 0, kind: null };
  const out = gritOutcome(line, { success });
  const sl = out.sl > 0 ? Math.max(from, Math.min(Math.trunc(Number(cap)) || 0, from + out.sl)) : from;
  return { sl, from, gained: sl - from, sand: out.sand, kind: line.grit === "sl" ? "sl" : "damage" };
}

/**
 * The words the cast's card prints for a ticked Grit line: the Sand spent and what it
 * bought - the SL before and after on a success, and on a failure that it bought nothing
 * because the Test failed. Answers a lang key and its data.
 *
 * @param {{sl: number, from: number, gained: number, sand: number, kind: string|null}} read  `gritSl`'s
 * @param {object} line  the ticked line
 * @param {{success?: boolean}} [o]
 * @returns {{key: string, data: object}|null}
 */
export function gritWords(read, line, { success = true } = {}) {
  if (!read || !line) return null;
  if (read.kind === "sl") return success
    ? { key: "AZEROTH.Grit.SlRaised", data: { n: read.gained, sand: read.sand, from: read.from, to: read.sl } }
    : { key: "AZEROTH.Grit.SlFailed", data: { sand: read.sand, sl: read.sl } };
  return success
    ? { key: "AZEROTH.Grit.DamageRow", data: { n: count(line.amount), sand: read.sand } }
    : { key: "AZEROTH.Grit.DamageFailed", data: { sand: read.sand } };
}

/**
 * **HEAVY HOURS** (04: *A creature carrying your Decay takes a Bane on Reflex Resilience
 * Tests against your spells. At rank 2 it cannot Disengage.*): the Banes a Resist takes
 * off the CASTER's talents and the Decay the resister carries.
 *
 * @param {{talents?: Array, decayBy?: string|null, casterUuid?: string|null, resilience?: string, spell?: boolean}} o
 * @param {Function} rowOf
 * @returns {{banes: number, by: string|null}}
 */
export function heavyHoursBanes({ talents = [], decayBy = null, casterUuid = null, resilience = null, spell = true } = {}, rowOf) {
  const row = firstRow(talents, "heavyHours", rowOf);
  if (!row || !spell || resilience !== "reflex" || !casterUuid || decayBy !== casterUuid) return { banes: 0, by: null };
  return { banes: count(row.banes ?? 1) || 1, by: row.name };
}

/**
 * Heavy Hours at rank 2 on a creature that would Disengage: the holder whose Decay bars
 * it, or null. `holders` is every Chronomancer whose Decay the creature carries, with
 * their talents.
 *
 * @param {Array<{uuid: string, name: string, talents: Array}>} holders
 * @param {string|null} decayBy  whose Decay the creature carries
 * @param {Function} rowOf
 */
export function disengageBarredBy(holders = [], decayBy = null, rowOf) {
  for (const h of holders ?? []) {
    if (!decayBy || h?.uuid !== decayBy) continue;
    const row = firstRow(h.talents ?? [], "heavyHours", rowOf);
    if (row?.noDisengage === true) return { name: h.name, talent: row.name };
  }
  return null;
}

/**
 * **DRAGGING SANDS** (04: *When a spell of yours damages a Slowed or Entangled creature,
 * gain 1 Sand, once a cast*): the Sand a cast gains off the creatures it damaged.
 *
 * @param {Array} talents
 * @param {Array<Iterable<string>>} struck  each damaged creature's statuses
 * @param {Function} rowOf
 */
export function draggingSandsGain(talents = [], struck = [], rowOf) {
  const row = firstRow(talents, "dragging", rowOf);
  if (!row) return { gain: 0, by: null };
  const holds = (struck ?? []).some(s => [...(s ?? [])].some(id => (row.conditions ?? ["slowed", "entangled"]).includes(id)));
  return holds ? { gain: count(row.gain ?? 1) || 1, by: row.name } : { gain: 0, by: null };
}

/**
 * **ECHOING SANDS** (04: *When a spell of yours damages a creature, you may spend 2 Sand.
 * At the start of your next turn that creature takes half the damage it took, rounded
 * down, again. At rank 2 it takes all of it again.*): the line the spell's dialog offers
 * (unticked, its price in Sand), or null.
 */
export function echoingSandsLine(talents = [], { sand = null, damages = true } = {}, rowOf) {
  const row = firstRow(talents, "echoing", rowOf);
  if (!row || !damages) return null;
  const price = count(row.sand ?? 2) || 2;
  const held = sand === null || sand === undefined ? null : count(sand);
  const enough = held !== null && held >= price;
  return {
    id: "talent-line-echoing-sands", identifier: "echoing-sands", talentIdentifier: row.identifier, name: row.name,
    kind: "echoing", doesKey: row.whole === true ? "AZEROTH.TalentLine.Does.echoingWhole" : "AZEROTH.TalentLine.Does.echoing", whole: row.whole === true, amount: price, price, pool: "sand", left: held ?? 0, available: enough, checked: false,
    reason: enough ? null : (held === null ? "AZEROTH.SandCast.NoHourglass" : "AZEROTH.SandCast.NotEnough")
  };
}

/** What lands again: half, rounded down, or all at rank 2. */
export function echoAmount(dealt = 0, { whole = false } = {}) {
  const d = count(dealt);
  return whole ? d : Math.floor(d / 2);
}

/**
 * **ARRESTED MOMENT** (04: *Once per Short Rest, when a creature you have Slowed fails a
 * Resilience Test against a spell of yours, it is also Stunned until the end of its next
 * turn. At rank 2, twice per Short Rest.*): whether a failed Resist lays the Stun.
 *
 * @param {{talents?: Array, slowedBy?: string[], casterUuid?: string|null, failed?: boolean, spell?: boolean, usesLeft?: number}} o
 */
export function arrestedMomentFires({ talents = [], slowedBy = [], casterUuid = null, failed = false, spell = true, usesLeft = 0 } = {}, rowOf) {
  const row = firstRow(talents, "arrested", rowOf);
  if (!row || !failed || !spell || !casterUuid || !(slowedBy ?? []).includes(casterUuid) || count(usesLeft) < 1) return null;
  return { name: row.name, condition: row.condition ?? "stunned", until: "endOfNextTurn" };
}

/**
 * **STORM OF AGES** (04: *Your Sandstorm's radius is 5 feet larger. At rank 2, as you cast
 * it you may spend Sand, and each Sand adds 5 feet more.*): the Sand line the dialog
 * offers at rank 2, one for each Sand held (unticked), or none.
 */
export function stormLines(talents = [], { spell = "", sand = null } = {}, rowOf) {
  const row = firstRow(talents, "storm", rowOf);
  if (!row || row.spend !== true || spell !== (row.spell ?? "Sandstorm")) return [];
  const held = sand === null || sand === undefined ? 0 : count(sand);
  const lines = [];
  for (let n = 1; n <= held; n += 1) {
    lines.push({
      id: `talent-line-storm-${n}`, identifier: `storm-${n}`, talentIdentifier: row.identifier, name: row.name,
      kind: "storm", doesKey: "AZEROTH.TalentLine.Does.storm", amount: n, feet: n * (count(row.perSand ?? 5) || 5), price: n, pool: "sand", left: held, available: true, checked: false, reason: null
    });
  }
  return lines;
}

/** One Storm line a cast takes, or a refusal where two are ticked. */
export function stormPicked(lines = []) {
  const ticked = (lines ?? []).filter(l => l?.kind === "storm");
  if (ticked.length > 1) return { line: null, refusal: "AZEROTH.Storm.OneOnly" };
  return { line: ticked[0] ?? null, refusal: null };
}

/**
 * **WITHERING HOURS** (04: *At rank 2 or higher, a creature inside its area regains only
 * half the Health any healing gives it, rounded down.*): the healing a creature takes
 * where it stands inside an area whose caster holds the talent at rank 2.
 */
export function witheredHeal(amount = 0, { inside = false } = {}) {
  const a = count(amount);
  return inside ? Math.floor(a / 2) : a;
}

/**
 * **TEMPORAL LOOP** (04: *As a Reaction when a creature you can see within 60 feet ends a
 * move, spend 2 Sand. It makes a Spirit Resilience Test against your Spell DC. On a
 * failure it returns to the space it started that move from.*): the holder's judgement.
 */
export function temporalLoopRefusal({ row = null, self = false, feet = null, sand = 0, reaction = true, moved = true } = {}) {
  if (!row) return "unknown";
  if (self) return "self";
  if (!moved) return "still";
  if (feet === null || feet === undefined || Number(feet) > count(row.feet ?? 60)) return "far";
  if (count(sand) < count(row.sand ?? 2)) return "sand";
  if (reaction !== true) return "reaction";
  return null;
}

/**
 * **COLLAPSE OF HOURS** (04: *spend all your Sand, at least 3. Each creature within 60
 * feet that you have Slowed or that carries your Decay takes Physical damage equal to
 * your tier plus the Sand spent. At rank 2, twice your tier plus the Sand spent.*).
 */
export function collapseDamage({ tier = 1, spent = 0, twice = false } = {}) {
  return count(tier) * (twice ? 2 : 1) + count(spent);
}

/** The creatures Collapse of Hours strikes: Slowed by the caster, or carrying its Decay. */
export function collapseStrikes({ slowedBy = [], decayBy = null, casterUuid = null } = {}) {
  if (!casterUuid) return false;
  return (slowedBy ?? []).includes(casterUuid) || decayBy === casterUuid;
}

/**
 * A spend of *all your Sand, at least N* (Collapse of Hours, The Glass Turns Back):
 * the refusal word, or null.
 */
export function allSandRefusal(sand = 0, least = 3) {
  return count(sand) < count(least) ? "least" : null;
}

/* -------------------------------------------- */
/*  04's Chronoweaver                            */
/* -------------------------------------------- */

/** Quickstep's feet at a rank (04: *moves up to 10 feet per rank*). */
export function quickstepFeet(rank = 1, per = 10) {
  return rankOf({ taken: rank }) * (count(per) || 10);
}

/**
 * **SHARED HOURS** (04: *When a spell or talent of yours gives an ally Health, a Boon, a
 * Half-Action or a Reaction, gain 1 Sand. At rank 2, gain 2. You may gain Sand this way a
 * number of times per Long Rest equal to your Intelligence modifier.*): the Sand a gift
 * gives the giver, or none. The counter's uses are the Intelligence modifier (the talent row's
 * `uses: {max: "int"}` in `talent-effects.mjs`), struck by the door.
 *
 * @param {{row?: object|null, ally?: boolean, gives?: string, usesLeft?: number}} o
 */
export function sharedHoursGain({ row = null, ally = false, gives = null, usesLeft = 0 } = {}) {
  if (!row || ally !== true || !SHARED_GIFTS.includes(gives) || count(usesLeft) < 1) return 0;
  return count(row.gain ?? 1) || 1;
}

/** What Shared Hours counts as a gift. */
export const SHARED_GIFTS = Object.freeze(["health", "boon", "half", "reaction"]);

/**
 * **SECOND CHANCE** (04: *An ally within 30 feet gains an extra Reaction, which it may use
 * until the end of its next turn*): the last moment the Reaction may be used, in the
 * fight's own order: the round and the turn index of the ally's next turn. Its next turn
 * is this round's where its place has not come yet, else the next round's (MY READING
 * for a gift on its own turn: *its next turn* is the one after).
 *
 * @param {{round: number, turn: number, allyTurn: number}} o
 * @returns {{round: number, turn: number}}
 */
export function givenReactionUntil({ round = 1, turn = 0, allyTurn = 0 } = {}) {
  const r = Math.trunc(Number(round)) || 1;
  return allyTurn > turn ? { round: r, turn: allyTurn } : { round: r + 1, turn: allyTurn };
}

/**
 * **ECHO OF POWER** (04: *One ally within 30 feet regains up to 2 per rank of one Momentum
 * or Power pool it holds, other than Sand, to no more than its maximum.*): the pools a
 * creature may regain into - not Sand, not full.
 *
 * @param {Array<{name: string, kind: string, value: number, max: number}>} pools
 * @param {{exceptSand?: boolean}} o
 */
export function restorablePools(pools = [], { exceptSand = true } = {}) {
  return (pools ?? []).filter(p => p && ["momentum", "power"].includes(p.kind) && (!exceptSand || p.name !== "sand")
    && count(p.max) > count(p.value));
}

/** What a pool regains: up to `amount`, never past its maximum. */
export function poolRegain(pool, amount = 0) {
  if (!pool) return 0;
  return Math.max(0, Math.min(count(amount), count(pool.max) - count(pool.value)));
}

/**
 * **A SPENT USE A CREATURE MAY REGAIN** (04's Recovered Hours: *one spent use of a
 * feature, talent or spell they may use once per encounter or once per Short Rest*; The
 * Glass Turns Back: *... once per encounter, once per Short Rest or once per Long Rest*):
 * every counter on the creature whose rest is one of `pers` and that is spent below its
 * maximum, plus every spell whose 07 §4 rest gate is spent and named in `pers` - each a
 * pickable row. `except` drops the talent's own (*other than this one*).
 *
 * @param {{counters?: Array<{id: string, name: string, per: string, value: number, max: number}>,
 *   spells?: Array<{name: string, per: string}>, pers?: string[], except?: string|null}} o
 */
export function restorableUses({ counters = [], spells = [], pers = [], except = null } = {}) {
  const out = [];
  for (const c of counters ?? []) {
    if (!c?.id || c.id === except || !pers.includes(c.per)) continue;
    if (count(c.max) > count(c.value)) out.push({ key: `item:${c.id}`, kind: "item", id: c.id, name: c.name, per: c.per });
  }
  for (const s of spells ?? []) {
    if (!s?.name || !pers.includes(s.per)) continue;
    out.push({ key: `spell:${s.name}`, kind: "spell", name: s.name, per: s.per });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.key.localeCompare(b.key));
}

/**
 * **SUSPENDED MOMENT** (04: *Until the start of your next turn, the conditions on a number
 * of allies within 30 feet equal to your rank are suspended: they do nothing and do not
 * count down.*): the flag the suspension's own effect carries on each ally, naming the
 * condition effects it switched off, so its end switches them back on.
 */
export const SUSPENDED_MOMENT_FLAG = "suspendedMoment";

/** The condition effects a suspension switches off: every status effect standing and switched on. */
export function suspendableConditions(effects = [], conditions = []) {
  const known = new Set(conditions ?? []);
  return (effects ?? []).filter(e => e?.id && e.disabled !== true && [...(e.statuses ?? [])].some(s => known.has(s)))
    .map(e => e.id).sort();
}

/**
 * **UNFADING** (04: *As a Reaction when an ally within 90 feet gains a condition, spend 2
 * Sand. The condition ends, and the ally cannot gain it again until the end of its next
 * turn. You may do this a number of times per encounter equal to your rank.*): the
 * holder's judgement on an offer.
 */
export function unfadingRefusal({ row = null, ally = false, feet = null, sand = 0, reaction = true, usesLeft = 0 } = {}) {
  if (!row) return "unknown";
  if (!ally) return "ally";
  if (feet === null || feet === undefined || Number(feet) > count(row.feet ?? 90)) return "far";
  if (count(usesLeft) < 1) return "uses";
  if (count(sand) < count(row.sand ?? 2)) return "sand";
  if (reaction !== true) return "reaction";
  return null;
}

/** Weaver's Lore's companion on Farstep (04: *you may bring one willing creature within 5 feet of you*). */
export function farstepCompanion(talents = [], { spell = "" } = {}, rowOf) {
  const row = firstRow(talents, "companion", rowOf);
  if (!row || spell !== (row.spell ?? "Farstep")) return null;
  return { feet: count(row.feet ?? 5) || 5, count: count(row.count ?? 1) || 1, name: row.name };
}

/** Whether a spell's Prerequisite gate is waived for the caster (04's Stasis Lore: *needs no Arcane Anchor*). */
export function prerequisiteWaived(talents = [], { spell = "" } = {}, rowOf) {
  for (const { talent, row } of chronoRows(talents, "spell", rowOf)) {
    if ((row.noPrerequisite ?? []).includes(spell)) return talent.name;
  }
  return null;
}
