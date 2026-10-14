/**
 * **WHAT ANOTHER CREATURE DOES TO A BLOW, AT THE ONE DAMAGE DOOR** (D-777; the
 * lead, 2026-10-03). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Three rulings, one door (`AzerothActor#applyDamage`), and this module the
 * law of each:
 *
 * - **THE HOLD AT 1** (O-156; *"Yes."*): a blow that would take a creature from
 *   above 0 to 0 or below is held at 1 - by 07's Aegis of the Light laid on it,
 *   by the creature's own Unkillable or Cauterize, or by another creature's
 *   talent, asked IN the blow: 04's Intervention, Spirit Shell and Guardian
 *   Spirit. `heldAt` is the ONE judgement every one of them reads -
 *   `momentum.mjs#unkillableFloor` and `class-talents.mjs#cauterizes` read it too
 *   now, so there is no second hold - and `HOLD_ORDER` the order they are
 *   tried in: the free floor first, then the creature's own, then another's,
 *   each asked in turn until one says yes.
 * - **THE MOVE** (O-155; *"If the talent moves damage it should just move the
 *   damage as directed."*): 04's Guardian (*take a hit aimed at a friendly target
 *   within 5 feet. You take the damage in full*) and 02's Shield of the
 *   Righteous (*change the target of a spell or attack to yourself within 5
 *   feet*; 20 feet with Guardian of the Weak) are asked of their holder as the
 *   blow lands, and a yes moves it whole. MY READING, for the lead: the blow
 *   moves as the number it would have dealt the creature it was aimed at - what
 *   that creature's Armor Points, Ward and own Parry or Block left of it - and
 *   the holder's own temporary Health, standing reduction and holds take it
 *   from there; Shield of the Righteous's *Ward 1 against a school of your
 *   choice for this attack* takes 1 off a blow of a school (`movedAmount`), the
 *   school chosen being the blow's own.
 * - **THE DIVISION** (O-155): 04's Spirit Link Totem - *damage taken by any
 *   friendly target within 20 feet of it is divided evenly among all of them* -
 *   `divideEvenly`, the remainder staying with the creature struck (MY READING:
 *   no damage is lost to the rounding).
 *
 * Sacrifice's *You may have one more Critical Injury before dying* was NOT
 * answered (CLARIFY in the rulings) and nothing here builds it.
 */

/**
 * The order the holds are tried in: 07's Aegis floor (free), the creature's
 * own Unkillable and Cauterize (automatic, as built since D-768 and D-775), then
 * another creature's talent, asked in turn.
 */
export const HOLD_ORDER = Object.freeze(["aegis", "unkillable", "cauterize", "intervention", "spiritShell", "guardianSpirit"]);

/** The holds a holder is ASKED for: another creature's talent and its use. */
export const ASKED_HOLDS = Object.freeze(["intervention", "spiritShell", "guardianSpirit"]);

/** The moves a holder is asked for. */
export const MOVE_KINDS = Object.freeze(["guardian", "righteous"]);

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * Whether a blow would take a creature from above 0 Health to 0 or below.
 *
 * @param {{before?: number, amount?: number}} o
 */
export function wouldDrop({ before = 0, amount = 0 } = {}) {
  const b = Math.trunc(Number(before)) || 0;
  return b > 0 && b - whole(amount) <= 0;
}

/**
 * **THE ONE HOLD** (D-777): what a blow that would drop a creature to 0 leaves of
 * itself where the creature stays at `stay` instead - and nothing changed where
 * it would not drop. Every hold in the system reads this: 02's Unkillable
 * (`momentum.mjs#unkillableFloor`), 04's Cauterize (`class-talents.mjs
 * #cauterizes`), Intervention, Spirit Shell, Guardian Spirit and 07's Aegis.
 *
 * @param {{before?: number, amount?: number, stay?: number}} o
 * @returns {{saved: boolean, amount: number}}
 */
export function heldAt({ before = 0, amount = 0, stay = 1 } = {}) {
  const b = Math.trunc(Number(before)) || 0;
  const a = whole(amount);
  if (!wouldDrop({ before: b, amount: a })) return { saved: false, amount: a };
  return { saved: true, amount: Math.max(0, b - Math.max(1, Math.trunc(Number(stay)) || 1)) };
}

/**
 * **WHETHER A HOLDER MAY HOLD THIS CREATURE** (04, D-777), judged before the
 * holder is asked and again on the holder's own client before the use is struck.
 *
 * - `intervention`: *A friendly target within 30 feet* - friendly, and in reach;
 * - `spiritShell`: *A target of your Ward class feature ... as the result of an
 *   attack* - this priest's Ward stands on it, and the blow is an attack;
 * - `guardianSpirit`: *A target you can see* - the seeing is the table's (D2
 *   §12), so the holder is asked wherever the two stand on one scene; MY
 *   READING, for the lead: a creature the priest counts as an ally, since
 *   asking at every enemy's fall is noise.
 *
 * Every one needs a use left and a holder still standing.
 *
 * @param {{kind?: string, feet?: number|null}} row  the holder's hold
 * @param {{attack?: boolean, friendly?: boolean, distance?: number|null, warded?: boolean, usesLeft?: number, holderUp?: boolean}} o
 * @returns {{ok: boolean, reason: string|null}}  `reason` an `AZEROTH.BlowDoor.Refuse.*` key's tail
 */
export function holdJudgement(row = {}, { attack = false, friendly = false, distance = null, warded = false, usesLeft = 0, holderUp = true } = {}) {
  if (!row?.kind || !ASKED_HOLDS.includes(row.kind)) return { ok: false, reason: "unknown" };
  if (holderUp !== true) return { ok: false, reason: "down" };
  if (!(whole(usesLeft) > 0)) return { ok: false, reason: "noUses" };
  if (row.kind === "spiritShell") {
    if (attack !== true) return { ok: false, reason: "notAttack" };
    if (warded !== true) return { ok: false, reason: "notWarded" };
    return { ok: true, reason: null };
  }
  if (friendly !== true) return { ok: false, reason: "notFriendly" };
  if (row.kind === "intervention") {
    if (typeof distance !== "number" || distance > (Number(row.feet) || 0)) return { ok: false, reason: "tooFar" };
  }
  return { ok: true, reason: null };
}

/**
 * **WHETHER A HOLDER MAY TAKE THIS BLOW ONTO ITSELF** (04's Guardian, 02's Shield
 * of the Righteous; D-777), judged before the holder is asked and again on its
 * own client before anything is paid (D-768's order):
 *
 * - Guardian: *a hit* - an ATTACK that landed - *aimed at a friendly target
 *   within 5 feet* (10 at rank 2);
 * - Shield of the Righteous: *a spell or attack* - a card's blow - *within 5
 *   feet* (20 with Guardian of the Weak).
 *
 * Both are a Reaction (one held, in a fight) and a price (6 Rage; 6 Zeal less
 * what Ardent Defender takes off), and neither moves a blow aimed at the holder
 * itself, nor a blow that is already a share or already moved.
 *
 * @param {{kind?: string, feet?: number, cost?: {pool: string, amount: number}}} row
 * @param {{attack?: boolean, spell?: boolean, amount?: number, self?: boolean, friendly?: boolean, distance?: number|null,
 *   poolValue?: number|null, reactionLeft?: boolean, holderUp?: boolean, fromCard?: boolean}} o
 * @returns {{ok: boolean, reason: string|null}}
 */
export function moveJudgement(row = {}, {
  attack = false, spell = false, amount = 0, self = false, friendly = false, distance = null,
  poolValue = null, reactionLeft = true, holderUp = true, fromCard = true
} = {}) {
  if (!row?.kind || !MOVE_KINDS.includes(row.kind)) return { ok: false, reason: "unknown" };
  if (!(whole(amount) > 0)) return { ok: false, reason: "nothing" };
  if (self === true) return { ok: false, reason: "self" };
  if (row.kind === "guardian" && attack !== true) return { ok: false, reason: "notAttack" };
  if (row.kind === "righteous" && !(attack === true || spell === true)) return { ok: false, reason: "notAttack" };
  if (fromCard !== true) return { ok: false, reason: "notAttack" };
  if (holderUp !== true) return { ok: false, reason: "down" };
  if (friendly !== true) return { ok: false, reason: "notFriendly" };
  if (typeof distance !== "number" || distance > (Number(row.feet) || 0)) return { ok: false, reason: "tooFar" };
  const price = whole(row.cost?.amount);
  if (price > 0 && !(whole(poolValue) >= price)) return { ok: false, reason: "short" };
  if (reactionLeft !== true) return { ok: false, reason: "noReaction" };
  return { ok: true, reason: null };
}

/**
 * **WHAT A MOVED BLOW COMES TO ON ITS NEW BEARER** (D-777). Guardian's *You take
 * the damage in full*: all of it. Shield of the Righteous's *You have Ward 1
 * against a school of your choice for this attack*: 1 off a blow of a school -
 * its school is the one chosen (MY READING, for the lead) - and nothing off a
 * physical one, which no Ward meets.
 *
 * @param {{kind?: string, amount?: number, type?: string|null, ward?: number, schools?: string[]}} o
 *   `schools` the seven school keys
 * @returns {number}
 */
export function movedAmount({ kind = "guardian", amount = 0, type = null, ward = 1, schools = [] } = {}) {
  const a = whole(amount);
  if (kind !== "righteous" || !type || !(schools ?? []).includes(type)) return a;
  return Math.max(0, a - whole(ward));
}

/**
 * **THE SECOND AMOUNTS A MOVED BLOW CARRIES** (D-777's review): each part's type
 * and what it came to, for the new bearer's door to record - and none of what
 * the struck creature's Ward took off it. The holder's Ward never met the blow,
 * so a priest's Ward on the holder (04's Atonement and Absorption,
 * `effects/wards.mjs#afterWardedBlow`) must not read that Ward's work as its
 * own - the blow's own lane moves with no `wardTook` either.
 *
 * @param {Array<object>|null} parts  `mitigation.mjs#resolveDamage`'s `parts`
 * @returns {Array<object>|null}  copies, never the parts handed in
 */
export function movedParts(parts) {
  if (!Array.isArray(parts)) return null;
  return parts.filter(p => p && typeof p === "object").map(p => ({ ...p, wardTook: 0 }));
}

/**
 * **DIVIDED EVENLY AMONG ALL OF THEM** (04's Spirit Link Totem; D-777): each
 * creature's share, the creature struck first, the remainder with it (MY
 * READING, for the lead: rounding loses no damage).
 *
 * @param {number} amount
 * @param {number} count  every creature linked, the one struck included
 * @returns {{each: number, remainder: number, shares: number[]}}
 */
export function divideEvenly(amount = 0, count = 1) {
  const a = whole(amount);
  const n = Math.max(1, whole(count));
  const each = Math.floor(a / n);
  const remainder = a - each * n;
  const shares = Array.from({ length: n }, (_, i) => each + (i === 0 ? remainder : 0));
  return { each, remainder, shares };
}

/** The effect flag 07's Aegis of the Light's floor stands under, on the creature it holds. */
export const FLOOR_FLAG = "floor";

/**
 * **07's FLOOR, READ OFF THE ENTRY** (Aegis of the Light: *Until the end of your
 * next turn no target may be reduced below 1 Health by any source ... A creature
 * held at 1 Health this way does not begin dying, and every Critical Injury it
 * would have taken it does not take*), or null where the words lay none.
 *
 * @param {string} text  HTML or plain
 * @returns {{stay: number, until: "casterTurnEnd", noCritical: boolean}|null}
 */
export function readFloor(text = "") {
  const flat = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const m = /\bUntil the end of your next turn no target may be reduced below (\d+) Health by any source\b/i.exec(flat);
  if (!m) return null;
  return { stay: Math.max(1, Number(m[1]) || 1), until: "casterTurnEnd", noCritical: /\bevery Critical Injury it would have taken it does not take\b/i.test(flat) };
}

/**
 * The floor that holds a creature, off the flags of the effects it carries:
 * the first active one, or null.
 *
 * @param {Array<object>} flagsList  each effect's `flags["azeroth-rpg"]`
 * @returns {{stay: number, by: string|null, name: string, held: boolean, noCritical: boolean}|null}
 */
export function floorOf(flagsList = []) {
  for (const f of flagsList ?? []) {
    const floor = f?.[FLOOR_FLAG];
    if (floor && typeof floor === "object") {
      return {
        stay: Math.max(1, Math.trunc(Number(floor.stay)) || 1), by: typeof floor.by === "string" ? floor.by : null,
        name: typeof floor.name === "string" ? floor.name : "", held: floor.held === true, noCritical: floor.noCritical === true
      };
    }
  }
  return null;
}

/**
 * Whether a creature takes no Critical Injury now: an Aegis floor that has held
 * it stands on it (07: *every Critical Injury it would have taken it does not
 * take*).
 *
 * @param {Array<object>} flagsList
 */
export function floorRefusesCritical(flagsList = []) {
  const floor = floorOf(flagsList);
  return Boolean(floor?.held && floor.noCritical);
}
