/**
 * **THE HORDE: THE NECROMANCER'S RAISED DEAD** (02 §7's Command the Dead; the Necromancer
 * plan's *The horde*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead, verbatim:
 * - *"lasting horde, shared turn. This should scale off Intelligence for capacity, not tier"*;
 * - *"number of summons, not threat share"*;
 * - *"need to mention horde scaling baseline and by intel modifier"*, then **2 + Int
 *   modifier**, never fewer than 2;
 * - *"some higher level summons can have a reaction"*: **raised by tier 3 or higher spells**,
 *   and the spell entry says so.
 *
 * What it holds, for the doors Phase 4 builds (door 3, Command the Dead; door 14, the horde
 * panel; the Bone talents):
 * - `hordeCapacity`: the general places and Bone's skeleton-only places, apart;
 * - `hordeLoad`, `loadAfter`, `hordeRefusal`, `collapseChoices`: how full the horde is, what
 *   a raise would take it to, and which raised dead may be chosen to collapse **before
 *   anything is paid** (D-768's order);
 * - `turnShape`, `leadFor`: the shared turn - one lead with its own turn, every other
 *   creature one Half-Action, and a Reaction only where its raise row says it keeps one; a
 *   creature Enslave the Dead controls takes its own turn (07: *It takes its own turn*);
 * - `SKELETONS`, `FLESH_SERVANTS`: the entries the branch rows name.
 *
 * **The lead's Phase 0 answers** (2026-11-18), each in ONE constant: `HORDE_BASE` and
 * `HORDE_FLOOR`; `HORDE_WEIGHT` (*"Abomination counts as 2, others are 1"*); `SKELETON_ONLY_BY`
 * (only Bone widens it, skeletons only; The Endless Host *"Go off Arcana"*). The lead rule is
 * 02 §7's Command the Dead as the book prints it, read by `leadFor`.
 */

/** *2 + Int modifier* (the lead). */
export const HORDE_BASE = 2;

/** *Never fewer than 2* (the lead). */
export const HORDE_FLOOR = 2;

/**
 * **THE PLACES ONE CREATURE TAKES** (the lead: *"Abomination counts as 2, others are 1"*), by
 * its 14 entry. Anything not named takes `HORDE_WEIGHT_DEFAULT`.
 */
export const HORDE_WEIGHT = Object.freeze({ Abomination: 2 });

/** Every creature the lead did not name takes one place. */
export const HORDE_WEIGHT_DEFAULT = 1;

/** One of your skeletons (the plan's terms): a Risen Skeleton, Skeletal Archer or Skeletal Mage you raised. */
export const SKELETONS = Object.freeze(["Risen Skeleton", "Skeletal Archer", "Skeletal Mage"]);

/** Flesh's servants: the Risen Zombie, the Plagued Ghoul and the Abomination. */
export const FLESH_SERVANTS = Object.freeze(["Risen Zombie", "Plagued Ghoul", "Abomination"]);

/**
 * **ONLY BONE WIDENS THE HORDE, AND ONLY FOR SKELETONS** (the lead: *"Yes"*): Swelling Ranks
 * one skeleton a rank, The Endless Host skeletons equal to your **Arcana Ranks** (the lead:
 * *"Go off Arcana"*). The talent names, as 04 prints them.
 */
export const SKELETON_ONLY_BY = Object.freeze({ swellingRanks: "Swelling Ranks", endlessHost: "The Endless Host" });

/** The actor flag on the Necromancer that names its lead (`flags.azeroth-rpg.hordeLead`). */
export const HORDE_LEAD_FLAG = "hordeLead";

const int = v => Math.trunc(Number(v)) || 0;
const nameOf = m => String(m?.entry ?? m?.name ?? "").trim();
/** The places a member takes: 2 for an Abomination, 1 for any other (`HORDE_WEIGHT`). */
export function placesOf(member) {
  return HORDE_WEIGHT[nameOf(member)] ?? HORDE_WEIGHT_DEFAULT;
}
const idOf = m => String(m?.id ?? m?.uuid ?? m?.tokenId ?? "");

/** Whether a member is one of your skeletons: a skeleton entry you raised, never one Enslave the Dead controls. */
export function isSkeleton(member) {
  return Boolean(member) && member.controlled !== true && SKELETONS.includes(nameOf(member));
}

/** Whether a member is one of Flesh's servants. */
export function isFleshServant(member) {
  return Boolean(member) && FLESH_SERVANTS.includes(nameOf(member));
}

/* ------------------------------------------------------------------ */
/*  Capacity and load                                                   */
/* ------------------------------------------------------------------ */

/**
 * The horde's places: `general` for any creature - 2 plus the Intelligence modifier, never
 * fewer than 2 - and `skeletons` for skeletons alone, from Swelling Ranks (1 a rank) and The
 * Endless Host (your Arcana Ranks, the lead's *"Go off Arcana"*).
 *
 * @param {{intMod?: number, swellingRanks?: number, endlessHost?: number|boolean, arcanaRanks?: number}} o
 *   `endlessHost` the talent's rank (or true); `arcanaRanks` the caster's Ranks in Arcana
 * @returns {{general: number, skeletons: number, total: number}}
 */
export function hordeCapacity({ intMod = 0, swellingRanks = 0, endlessHost = 0, arcanaRanks = 0 } = {}) {
  const general = Math.max(HORDE_FLOOR, HORDE_BASE + int(intMod));
  const host = endlessHost === true || int(endlessHost) > 0 ? Math.max(0, int(arcanaRanks)) : 0;
  const skeletons = Math.max(0, int(swellingRanks)) + host;
  return { general, skeletons, total: general + skeletons };
}

/**
 * **HOW FULL THE HORDE IS.** A member is `{id, entry, raisedAt?, controlled?, outside?}`:
 * `controlled` a creature Enslave the Dead holds (it counts while the control lasts, never as
 * one of your skeletons), `outside` one that does not count at all (The Dead Rise's ten, an
 * empowered Acolyte's Sacrifice Shade). An Abomination takes 2 places and every other creature
 * 1 (`placesOf`). Skeletons fill the skeleton-only places first, and whatever is left takes
 * general places.
 *
 * @param {Array<object>} members
 * @param {{general: number, skeletons: number}} capacity
 * @returns {{counted: number, skeletons: number, skeletonPlaces: number, general: number, over: number}}
 */
export function hordeLoad(members = [], capacity = { general: HORDE_FLOOR, skeletons: 0 }) {
  const counted = (members ?? []).filter(m => m && m.outside !== true);
  const sum = list => list.reduce((n, m) => n + placesOf(m), 0);
  const skeletons = sum(counted.filter(isSkeleton));
  const all = sum(counted);
  const skeletonPlaces = Math.min(skeletons, Math.max(0, int(capacity?.skeletons)));
  const general = all - skeletonPlaces;
  return { counted: all, skeletons, skeletonPlaces, general, over: Math.max(0, general - Math.max(0, int(capacity?.general))) };
}

/**
 * What the horde would hold after `remove` collapse and `adding` rise.
 *
 * @param {{members?: object[], remove?: string[], adding?: object[], capacity: {general: number, skeletons: number}}} o
 *   `remove` the ids chosen to collapse
 */
export function loadAfter({ members = [], remove = [], adding = [], capacity } = {}) {
  const gone = new Set((remove ?? []).map(String));
  const kept = (members ?? []).filter(m => !gone.has(idOf(m)));
  return hordeLoad([...kept, ...(adding ?? [])], capacity);
}

/**
 * **WHAT A RAISE ASKS OF THE HORDE, BEFORE IT IS PAID** (Command the Dead: *When a raise would
 * take your horde past that number, choose which of your raised dead collapse before you pay
 * for the spell*). `collapse` is how many must go; `refusal` is `"exceeds"` where the raise
 * alone would pass the capacity even with the horde emptied, which no choice can mend.
 *
 * @param {{members?: object[], adding?: object[], capacity: {general: number, skeletons: number}}} o
 * @returns {{collapse: number, refusal: null|"exceeds"}}
 */
export function hordeRefusal({ members = [], adding = [], capacity } = {}) {
  const alone = hordeLoad(adding, capacity);
  if (alone.over > 0) return { collapse: 0, refusal: "exceeds" };
  const now = loadAfter({ members, adding, capacity });
  if (now.over <= 0) return { collapse: 0, refusal: null };
  // The fewest collapses that bring it back: a general place frees with any member, and a
  // skeleton in a skeleton-only place frees one only where the newcomers are skeletons that
  // could take it, so the count is read off the load rather than guessed.
  const ordered = collapseChoices(members);
  // The most that n collapses can free: the heaviest non-skeletons first (an Abomination holds
  // two general places), then the rest, then the skeletons.
  const freeing = [...ordered.filter(m => !isSkeleton(m)).sort((a, b) => placesOf(b) - placesOf(a)), ...ordered.filter(isSkeleton)];
  for (let n = 1; n <= ordered.length; n++) {
    const pick = freeing.slice(0, n).map(idOf);
    if (loadAfter({ members, remove: pick, adding, capacity }).over <= 0) return { collapse: n, refusal: null };
  }
  return { collapse: 0, refusal: "exceeds" };
}

/**
 * **THE RAISED DEAD THE CHOOSER OFFERS**, in a fixed order (by raise time, then name, then
 * id) so a list a reader sees never wobbles between renders. Every counted member is offered;
 * `collapseEnough` judges the pick.
 *
 * @param {object[]} members
 * @returns {object[]}
 */
export function collapseChoices(members = []) {
  return (members ?? [])
    .filter(m => m && m.outside !== true)
    .slice()
    .sort((a, b) => (Number(a.raisedAt ?? 0) - Number(b.raisedAt ?? 0))
      || nameOf(a).localeCompare(nameOf(b))
      || idOf(a).localeCompare(idOf(b)));
}

/**
 * Whether the raised dead chosen make room for the raise: judged again on the GM's client
 * (D-976's re-ask) with the horde as it stands then.
 *
 * @param {{members?: object[], remove?: string[], adding?: object[], capacity: {general: number, skeletons: number}}} o
 * @returns {boolean}
 */
export function collapseEnough({ members = [], remove = [], adding = [], capacity } = {}) {
  const ids = new Set((members ?? []).map(idOf));
  if ((remove ?? []).some(id => !ids.has(String(id)))) return false;
  return loadAfter({ members, remove, adding, capacity }).over <= 0;
}

/* ------------------------------------------------------------------ */
/*  The shared turn                                                     */
/* ------------------------------------------------------------------ */

/**
 * **WHAT ONE CREATURE OF THE HORDE TAKES ON ITS TURN** (02 §7's Command the Dead): the lead
 * takes its own turn, two Half-Actions and a Reaction (05); every other creature one
 * Half-Action, and no Reaction unless the spell that raised it says it keeps one. A creature
 * **Enslave the Dead** controls (`controlled`) is excepted: 07, *It takes its own turn*.
 * Command the Dead's Empowered line (`surged`) gives each creature two Half-Actions on its next
 * turn.
 *
 * @param {{isLead?: boolean, keepsReaction?: boolean, surged?: boolean, controlled?: boolean}} o
 * @returns {{halfActions: number, reactions: number}}
 */
export function turnShape({ isLead = false, keepsReaction = false, surged = false, controlled = false } = {}) {
  if (controlled) return { halfActions: 2, reactions: 1 };
  return {
    halfActions: isLead || surged ? 2 : 1,
    reactions: isLead || keepsReaction ? 1 : 0
  };
}

/**
 * **WHO LEADS NOW** - 02 §7's Command the Dead, as the book prints it:
 * - *When you have no lead, the next creature you raise is your lead*: with no flag ever set
 *   (`flag` null), the earliest raised creature standing leads;
 * - *When your lead collapses, you may name another of your raised dead your lead*: a flag
 *   naming a creature that is gone answers null - no lead until the Necromancer names one;
 * - *When you cast a spell, you may name another of your raised dead your lead, from that
 *   creature's next turn*: the flag (`HORDE_LEAD_FLAG`) is `{id, previous, taken}`, and until
 *   the named creature starts a turn (`taken` false) `previous` leads - or nobody, where the
 *   previous lead has gone. `startingTurnOf` is the creature whose turn is starting now; where
 *   it is the one named it leads from this turn, and the door then writes `taken`.
 * A creature Enslave the Dead controls never leads: it takes its own turn.
 *
 * @param {{flag?: {id?: string|null, previous?: string|null, taken?: boolean}|null, members?: object[], startingTurnOf?: string|null}} o
 * @returns {string|null}  the lead's id
 */
export function leadFor({ flag = null, members = [], startingTurnOf = null } = {}) {
  const standing = collapseChoices(members).filter(m => m.controlled !== true);
  const ids = new Set(standing.map(idOf));
  if (!flag || !flag.id) return standing.length ? idOf(standing[0]) : null;
  const pending = flag.taken === false && String(startingTurnOf ?? "") !== String(flag.id);
  const named = pending ? flag.previous : flag.id;
  return named && ids.has(String(named)) ? String(named) : null;
}
