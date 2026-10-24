/**
 * **A LEGACY IS A FOURTH BRANCH, KEPT BY ONE PEOPLE** (04 §1; D-781, the Legacy
 * branches' door 1). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 04 §1: *A Legacy is a fourth branch. It is one people's way of fighting in one
 * class. A character of that people who holds that class has it beside the
 * class's other three from level 1, spent from the same twenty points and gated
 * the same way. A character of two classes has it only among the branches of the
 * class it belongs to.* Seven of them, on the Warrior, the Rogue, the Ranger and
 * the Shaman; each people keeps one, so no class frame shows more than four.
 *
 * **The talent says whose it is.** A Legacy talent is a CLASS talent - its
 * `className` is the class, its `branch` the Legacy's name, its points the
 * class's twenty - and its `legacy` is the people who keep it (the parser stamps
 * it off 04's `#### Blademaster (Orc)`). It is never `race`, which marks a RACIAL
 * talent on the race's own picks (02 §2, D-620), and which every class-tree
 * reader filters out.
 *
 * What this module answers, for the one door that embeds and withdraws them
 * (`documents/actor.mjs`: the class grant, and the resync a race's arrival or
 * departure makes):
 *
 * - `isLegacyTalent` and `keptBy`: whose a talent is, and whether a people keeps it;
 * - `owedTalents`: out of the talent pack's index, what a character of a people
 *   holding these classes is owed - a class's own three branches, and a Legacy
 *   only where the people keeps it;
 * - `legacyResync`: what to embed and what to withdraw when the race moves.
 *
 * **A race that changes takes its Legacy branch with it, whole**, taken ranks and
 * all - as a class's three leave with the class (D-610) - and the new people's
 * branch arrives untaken. The points come back by themselves: what is spent is
 * READ off the talents held (`rules/talents.mjs#pointsSpent`), never stored, so a
 * branch gone is twenty-two points nobody holds. That is not D-713's refund, which
 * is a player handing back ONE rank between fights and is judged against the
 * branch; a branch that leaves whole strands nothing in it.
 */

/** A name as two documents may spell it: case, spacing and apostrophes forgiven. */
function fold(name) {
  return String(name ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Whether a talent belongs to a Legacy: its own `legacy` names a people.
 *
 * @param {{legacy?: string}|null|undefined} talent  a talent's system, or a row carrying `legacy`
 * @returns {boolean}
 */
export function isLegacyTalent(talent) {
  return fold(talent?.legacy) !== "";
}

/**
 * Whether a character of this people keeps this talent's Legacy. A talent that is
 * no Legacy's is kept by everybody who holds its class, so this is true for it.
 *
 * @param {{legacy?: string}|null|undefined} talent
 * @param {string|null|undefined} people  the character's race, as its item names it
 * @returns {boolean}
 */
export function keptBy(talent, people) {
  if (!isLegacyTalent(talent)) return true;
  return fold(talent.legacy) === fold(people) && fold(people) !== "";
}

/**
 * **WHAT A CHARACTER IS OWED OFF THE TALENT PACK** (04 §1): every talent of a
 * class it holds, a Legacy's only where its people keeps it. A racial talent
 * (`race` set, no class) is never in the class grant.
 *
 * @param {Array<{system?: {className?: string, race?: string, legacy?: string}}>} entries  the pack's index
 * @param {{classNames?: string[], people?: string|null}} [o]
 * @returns {object[]} the entries owed, in the index's own order
 */
export function owedTalents(entries = [], { classNames = [], people = null } = {}) {
  const classes = new Set((classNames ?? []).map(fold));
  return (entries ?? []).filter(e => {
    const s = e?.system ?? {};
    if (fold(s.race)) return false;
    return classes.has(fold(s.className)) && keptBy(s, people);
  });
}

/**
 * **THE RESYNC A RACE MAKES** (04 §1): what to embed and what to withdraw so the
 * character holds exactly the Legacy branches its people keeps on the classes it
 * holds - on a race's arrival, its change and its departure.
 *
 * - `embed`: the owed Legacy entries not held, matched by class and identifier
 *   (a GM's hand-added copy is held, and stays).
 * - `withdraw`: the held Legacy talents of a class the character holds whose
 *   people is not its race. A Legacy talent of a class it does NOT hold is the
 *   class's own departure's business (`_onDeleteDescendantDocuments` takes a
 *   class's talents with it), and is left alone here so the two never delete one
 *   document twice.
 *
 * @param {object} o
 * @param {Array<{id: string, className?: string, identifier?: string, legacy?: string}>} o.held  the class talents held
 * @param {object[]} o.index  the talent pack's index
 * @param {string[]} o.classNames  the classes held
 * @param {string|null} o.people  the race held, or null where there is none
 * @returns {{embed: object[], withdraw: string[]}}
 */
export function legacyResync({ held = [], index = [], classNames = [], people = null } = {}) {
  const classes = new Set((classNames ?? []).map(fold));
  const key = (className, identifier) => `${fold(className)}::${String(identifier ?? "")}`;
  const have = new Set((held ?? []).map(t => key(t.className, t.identifier)));
  const embed = owedTalents(index, { classNames, people })
    .filter(e => isLegacyTalent(e.system) && !have.has(key(e.system.className, e.system.identifier)));
  const withdraw = (held ?? [])
    .filter(t => isLegacyTalent(t) && classes.has(fold(t.className)) && !keptBy(t, people))
    .map(t => t.id)
    .filter(Boolean)
    .sort();
  return { embed, withdraw };
}

/**
 * **WHERE A BRANCH SITS ON THE FRAME**: a class's own three in its item's order,
 * then its Legacy - one at most, since a character holds one race and each people
 * keeps one Legacy. Primary class first, as D11 §4 groups the branches.
 *
 * @param {{classIndex: number, ownIndex: number, legacy: boolean}} o
 *   `classIndex` the class's place in `classes[]`; `ownIndex` the branch's place
 *   among the class item's three, or -1 for a branch the item does not name
 * @returns {number}
 */
export function branchRank({ classIndex = 0, ownIndex = -1, legacy = false } = {}) {
  const base = Math.max(0, Math.trunc(Number(classIndex) || 0)) * 10;
  if (legacy) return base + 3;
  return ownIndex >= 0 ? base + ownIndex : base + 9;
}

/** The most branches one class frame shows (04 §1): three of its own and a Legacy. */
export const BRANCHES_PER_FRAME = 4;
