/**
 * Talent trees — the branch gate, the ranks, and the tree's shape (04 §1, D11 §4).
 *
 * Pure functions, no Foundry imports. The Progress tab renders what this
 * returns; nothing about the gating lives in a sheet.
 *
 * **The gate is points spent IN THAT BRANCH, never character level** (D-160's
 * neighbour rule, 04 §1). A tier-5 capstone needs sixteen points in its own
 * branch, which a level-20 character who spread their points across three
 * branches will never have. Gating on level instead would hand every character
 * every capstone and is the single easiest thing to get wrong here.
 */

/**
 * Points that must already be spent in a branch to open each tier.
 * Index 0 is tier 1. 04 §1: none, 4, 8, 12, 16.
 */
import { tierForLevel } from "./progression.mjs";

export const BRANCH_GATES = Object.freeze([0, 4, 8, 12, 16]);

/**
 * Talents per tier in every branch: three, three, three, two, one capstone.
 * All twenty-seven branches in 04 are this shape, which is what lets the tree
 * be laid out in three columns.
 */
export const BRANCH_SHAPE = Object.freeze([3, 3, 3, 2, 1]);

/**
 * Columns the tree is drawn in: three, because no tier holds more than
 * `BRANCH_SHAPE`'s three. A talent takes its prerequisite's column and
 * otherwise the first one its tier leaves free, in 04's row order - so a
 * capstone sits under whatever it requires (Whirlwind under Bladeturn, in the
 * first column), or in the first column when it requires nothing. It is NOT
 * the middle one; this comment said so until D-758.
 */
export const COLUMNS = 3;

/**
 * The five looks a tile can have (D-758), each a class on the tile and a word
 * under `AZEROTH.Talent.State.` for its `aria-label`:
 *
 *   locked     no rank taken, and none can be taken now
 *   available  no rank taken, and one can be
 *   raisable   some ranks taken, and another can be
 *   held       some ranks taken, and no more can be now (no points, a gate)
 *   maxed      every rank taken
 *
 * WoW's own talent frame draws the same five: grey, green, green, gold, gold.
 */
export const TILE_STATES = Object.freeze(["locked", "available", "raisable", "held", "maxed"]);

/**
 * Which of `TILE_STATES` a talent wears.
 *
 * `canTakeOk` is `canTake`'s (or `canTakeRacial`'s) `ok`, passed in rather than
 * recomputed, because the two currencies judge a rank differently and the tile
 * must never disagree with the Learn button on its own card.
 *
 * @param {{taken?: number, ranks?: number}} talent
 * @param {boolean} canTakeOk  whether a rank can be taken right now
 * @returns {"locked"|"available"|"raisable"|"held"|"maxed"}
 */
export function tileState(talent, canTakeOk) {
  const taken = Number(talent?.taken) || 0;
  const ranks = Number(talent?.ranks) || 1;
  if (taken >= ranks) return "maxed";
  if (taken > 0) return canTakeOk ? "raisable" : "held";
  return canTakeOk ? "available" : "locked";
}

/**
 * 04's row order (D-218), then the name.
 *
 * *"Column position within a tier is still derived from row order and is
 * still never written down."* The row is carried on the talent item's
 * BUILT-IN `sort` - the parser stamps 100, 200, ... down each branch's table,
 * and migration 0.12.13 stamps a world's copies - so the column itself is
 * never stored. A talent with no `sort` (0: an unmigrated world, a GM's own)
 * falls back to its name, which is how every tree was drawn before D-758, so
 * nothing ever fails to draw.
 */
function rowOrder(a, b) {
  return ((Number(a?.sort) || 0) - (Number(b?.sort) || 0))
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
}

/** Points a character ever has to spend (D11 §4). A branch holds more. */
export const POINTS_AVAILABLE = 20;

/**
 * 02 SS9: "Each level grants one talent point, spendable in any of your
 * three." So the points a character has to spend is its level, capped where
 * the trees cap (twenty). A GM override lives on the actor as a flag.
 */
export function talentPointsFor(level = 1) {
  return Math.max(0, Math.min(POINTS_AVAILABLE, Math.trunc(Number(level)) || 0));
}

/** The gate for a tier, or `Infinity` for a tier that does not exist. */
export function gateFor(tier) {
  const gate = BRANCH_GATES[tier - 1];
  return gate === undefined ? Infinity : gate;
}

/** Ranks already taken across a set of talents. */
export function pointsSpent(talents = []) {
  return talents.reduce((sum, t) => sum + (Number(t.taken) || 0), 0);
}

/**
 * Is a tier open, given the points already spent in its own branch?
 *
 * **The talent being considered does not count towards its own gate.** Taking
 * the fourth point in a branch is what opens tier 2; the point being spent now
 * is not yet spent.
 */
export function tierUnlocked(spentInBranch, tier) {
  return (Number(spentInBranch) || 0) >= gateFor(tier);
}

/**
 * Match a `Requires` name against a talent. 04 writes the display name —
 * `Power Word: Shield` — and the item carries `power-word-shield`, so the
 * comparison is on flattened names rather than on a slug either side computed
 * its own way.
 */
export function sameTalent(name, talent) {
  if (!name || !talent) return false;
  const flat = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return flat(name) === flat(talent.name) || flat(name) === flat(talent.identifier);
}

/**
 * Whether a talent can be taken or raised right now, and why not if it cannot.
 *
 * @param {object} talent            The talent under consideration.
 * @param {object[]} branchTalents   Every talent in the same branch, with `taken`.
 * @param {number} [pointsLeft]      Unspent talent points the character holds.
 * @returns {{ok: boolean, reason: string|null}}
 */
export function canTake(talent, branchTalents = [], pointsLeft = Infinity) {
  const taken = Number(talent.taken) || 0;
  const ranks = Number(talent.ranks) || 1;

  if (taken >= ranks) return { ok: false, reason: "maxed" };
  if (pointsLeft < 1) return { ok: false, reason: "noPoints" };

  // The gate reads the branch WITHOUT counting the point about to be spent.
  const spent = pointsSpent(branchTalents);
  if (!tierUnlocked(spent, talent.tier)) return { ok: false, reason: "tierLocked" };

  // 04 §1: one rank of the named talent is enough.
  if (talent.requires) {
    const prerequisite = branchTalents.find(t => sameTalent(talent.requires, t));
    if (!prerequisite) return { ok: false, reason: "prerequisiteMissing" };
    if ((Number(prerequisite.taken) || 0) < 1) return { ok: false, reason: "prerequisite" };
  }

  return { ok: true, reason: null };
}

/* -------------------------------------------- */
/*  Taking a point back (04 §1, D-713)           */
/* -------------------------------------------- */

/**
 * Whether a rank can be handed back right now, and what is in the way.
 *
 * 04 §1: *"**A point may be taken back between fights.** A talent that another
 * talent requires, or whose point holds a higher tier open, gives nothing back
 * until that talent has been taken back first."*
 *
 * **THE CHAPTER STATES THE REFUSAL, AND ITS TWO CLAUSES ARE THE TWO REFUSALS
 * HERE**: *another talent requires it* is `required`, *its point holds a higher
 * tier open* is `gateBelow`. The sentence used to say the unsupported talent
 * *comes back with it* — a cascade — and the build refused instead, for three
 * reasons that are now the book's own: a refund withdraws the features, spells
 * and Active Effects a talent granted (D-642) and one click taking back three
 * talents nobody named has no undo; the end state is the same and one click
 * further away, since the refusal NAMES what to take back first; and which
 * points come back is the table's call, not the tool's (D2 §12, CLAUDE.md §17).
 *
 * `reason` is a key under `AZEROTH.Talent.Locked.`, and `name` is the talent
 * standing in the way where there is one — a refusal that says *something else
 * depends on it* and not what would be useless.
 *
 * The gate is the mirror of `canTake`'s: a talent's OWN ranks never count
 * toward its own gate, so the test is the branch's spend after the refund,
 * less that talent's own ranks, against `BRANCH_GATES`.
 *
 * @param {object} talent            the talent losing a rank
 * @param {object[]} branchTalents   every talent in the same branch, with `taken`
 * @returns {{ok: boolean, reason: string|null, name: string|null}}
 */
export function canUntake(talent, branchTalents = []) {
  const taken = Number(talent?.taken) || 0;
  if (taken < 1) return { ok: false, reason: "notTaken", name: null };

  const idOf = t => keyOf(t);
  const mine = idOf(talent);
  const after = branchTalents.map(t => (idOf(t) === mine
    ? { ...t, taken: taken - 1 }
    : { ...t, taken: Number(t.taken) || 0 }));

  // 04 §1: one rank of the named talent is enough, so a drop from 2 to 1
  // leaves a dependent standing. Only a drop to 0 can strand one.
  if (taken - 1 === 0) {
    const dependent = after.find(t => (Number(t.taken) || 0) > 0
      && t.requires && sameTalent(t.requires, talent));
    if (dependent) return { ok: false, reason: "required", name: dependent.name ?? null };
  }

  const spent = pointsSpent(after);
  const stranded = after.find(t => (Number(t.taken) || 0) > 0
    && !tierUnlocked(spent - (Number(t.taken) || 0), t.tier));
  if (stranded) return { ok: false, reason: "gateBelow", name: stranded.name ?? null };

  return { ok: true, reason: null, name: null };
}

/**
 * Whether a racial pick can be handed back (02 §2, D-620's currency).
 *
 * A racial talent has one rank, no branch and no prerequisite, so there is
 * nothing beneath it to strand: the only refusal is that it was never taken.
 * It is a separate door from `canUntake` because the currency is separate —
 * a pick, never a point — and the sheet's two tiles say different words.
 *
 * @param {{taken?: number}} talent
 * @returns {{ok: boolean, reason: string|null, name: string|null}}
 */
export function canUntakeRacial(talent) {
  if ((Number(talent?.taken) || 0) < 1) return { ok: false, reason: "notTaken", name: null };
  return { ok: true, reason: null, name: null };
}

/**
 * Lay a branch out as the tree the sheet draws.
 *
 * **A talent sits in its prerequisite's column** (D11 §4), which is what makes
 * every arrow vertical and readable at a glance. Where a talent has no
 * prerequisite it takes the first column nothing else in its tier has claimed,
 * in 04's row order (D-218) - the book's own placement.
 *
 * Every placed talent carries what the tile draws: its `column`, its `state`
 * (one of `TILE_STATES`) and its `arrow`, which is `{met}` where the talent
 * names a prerequisite in this branch and `null` where it does not.
 *
 * @param {object[]} branchTalents  One branch's talents.
 * @param {number} [pointsLeft]
 * @returns {{pointsSpent: number, columns: number, tiers: object[]}}
 */
export function buildTree(branchTalents = [], pointsLeft = Infinity) {
  const spent = pointsSpent(branchTalents);
  const columnOf = new Map();
  const prerequisiteOf = talent => (talent.requires
    ? branchTalents.find(t => sameTalent(talent.requires, t)) ?? null
    : null);

  const tiers = BRANCH_GATES.map((gate, index) => {
    const tier = index + 1;
    const inTier = branchTalents
      .filter(t => Number(t.tier) === tier)
      .slice()
      // 04's ROW ORDER before columns are assigned (D-218), which is also
      // what keeps a rebuild from shuffling on object order. **The order
      // rides on the item's built-in `sort`**: nothing on the tree is
      // draggable today, and a future draggable talent row would rewrite
      // `sort` through core's sibling sort and RESHUFFLE THE COLUMNS - it
      // would need an order field of its own first.
      .sort(rowOrder);

    // A talent with a prerequisite claims that prerequisite's column first, so
    // it wins the column over one that merely wants the next free slot.
    const claimed = new Map();
    const later = [];
    for (const talent of inTier) {
      const prerequisite = prerequisiteOf(talent);
      const wanted = prerequisite ? columnOf.get(keyOf(prerequisite)) : undefined;
      if (wanted !== undefined && !claimed.has(wanted)) claimed.set(wanted, talent);
      else later.push(talent);
    }
    for (const talent of later) {
      let column = 0;
      while (claimed.has(column)) column++;
      claimed.set(column, talent);
    }

    const unlocked = tierUnlocked(spent, tier);
    const placed = [...claimed.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([column, talent]) => {
        columnOf.set(keyOf(talent), column);
        const state = canTake(talent, branchTalents, pointsLeft);
        const prerequisite = prerequisiteOf(talent);
        return {
          ...talent,
          column,
          // Kept for the verticality test: the prerequisite's column, or null.
          requiresColumn: prerequisite ? columnOf.get(keyOf(prerequisite)) ?? null : null,
          // THE ARROW IS AN OBJECT OR NULL, NEVER A NUMBER (D-758). The
          // template used to draw `{{#if requiresColumn}}`, and column 0 is
          // falsy: thirty of the eighty-one arrows never drew. `met` is 04
          // §1's *one rank, no more* read off the prerequisite.
          arrow: prerequisite ? { met: (Number(prerequisite.taken) || 0) >= 1 } : null,
          canTake: state.ok,
          lockedBecause: state.reason,
          state: tileState(talent, state.ok)
        };
      });

    return { tier, gate, unlocked, talents: placed };
  });

  return { pointsSpent: spent, columns: COLUMNS, tiers };
}

/** Identity for the column map: the item id where there is one, else the name. */
function keyOf(talent) {
  return talent?._id ?? talent?.id ?? talent?.identifier ?? talent?.name ?? "";
}

/* -------------------------------------------- */
/*  Racial talents (02 SS2, D-620)               */
/* -------------------------------------------- */

/** "One at character creation and one more each time your tier increases - at levels 5, 11 and 16." */
export const RACIAL_PICK_LEVELS = Object.freeze([5, 11, 16]);

/** The racial picks a character has at a level: one, then one per tier reached. */
export function racialPicksFor(level = 1) {
  const l = Math.trunc(Number(level)) || 1;
  return 1 + RACIAL_PICK_LEVELS.filter(at => l >= at).length;
}

/**
 * Can a racial talent be taken? Its own currency and one rank each: refused
 * when already taken, when its tier is above the character's, or when every
 * pick is spent. `held` is every talent of the race, taken or not.
 *
 * @param {{tier?: number, ranks?: number, taken?: number}} talent
 * @param {{taken?: number}[]} held
 * @param {number} level  The character's level.
 * @returns {{ok: boolean, reason: string|null}}
 */
export function canTakeRacial(talent, held = [], level = 1) {
  if ((talent?.taken ?? 0) >= (talent?.ranks ?? 1)) return { ok: false, reason: "maxed" };
  if ((talent?.tier ?? 1) > tierForLevel(level)) return { ok: false, reason: "raceTier" };
  const used = held.reduce((n, t) => n + (t?.taken ?? 0), 0);
  if (used >= racialPicksFor(level)) return { ok: false, reason: "racePicks" };
  return { ok: true, reason: null };
}
