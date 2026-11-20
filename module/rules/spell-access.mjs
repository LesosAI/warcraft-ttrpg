/**
 * **WHICH CLASS MAY LEARN A SPELL** (07 §1, §9; D-930: *A Restricted field may name a
 * casting class outside the spell's school, and that class casts it as one of its
 * own*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A spell's `system.classes` is 07's derived CLASSES line (D-324): the school's holders,
 * or the Restricted line where one is printed. Before the Death Knight every class on
 * that line held the school, so the creator, the creation law and the cast's granting
 * class could read the SCHOOL and the line together and be right. The Death Knight
 * holds Death alone and casts the Frost and Shadow spells that name it, so a reader
 * keyed on the school refused it Fear, Curse of Weakness and every tier 1 Frost pick
 * its own entry hands it (the F1 review). This is the ONE predicate: the creator's
 * starting spells (`creator-choices.mjs#startingSpell`), the creation law
 * (`creation.mjs`) and the cast's class (`casting.mjs#grantingClass`) all ask it.
 *
 * The rule, in order:
 * 1. A spell whose CLASSES line names classes is learned by those classes alone - a
 *    holder of the school, or a CASTING class the Restricted line names (one that holds
 *    some school). A class a talent teaches (the Chromatic Champion, D-815) holds no
 *    school of its own and learns such a spell through the talent, never here.
 * 2. A spell with no line (one made by hand) is learned by a holder of its school.
 *
 * @param {{name?: string, schools?: string[]}|null} cls  the class item's system, with its name
 * @param {{school?: string|null, classes?: string[]}|null} spell
 * @returns {boolean}
 */
export function classLearnsSpell(cls, spell) {
  if (!cls || !spell) return false;
  const schools = Array.isArray(cls.schools) ? cls.schools : [];
  const holds = Boolean(spell.school) && schools.includes(spell.school);
  const named = Array.isArray(spell.classes) ? spell.classes.filter(Boolean) : [];
  if (!named.length) return holds;
  if (!named.includes(cls.name)) return false;
  return holds || schools.length > 0;
}

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * **WHY A CHARACTER MAY NOT LEARN THIS SPELL**, or null (07 §9; the lead on the plan's Phase 0
 * item 18: *"fix this"*). Asked on every learn after creation:
 *
 * 1. **The class.** One of the character's classes learns it (`classLearnsSpell`: 07 §1's school
 *    access, or the Restricted line).
 * 2. **The prerequisite.** *A spell that names one cannot be learned at all until you know the
 *    spell it names.*
 * 3. **The prerequisite's restriction.** *A spell inherits whatever restriction its prerequisite
 *    carries*: a class that learns the spell must learn its prerequisite too, read off the
 *    prerequisite the character knows.
 *
 * 4. **07 §4's tier 5 gate.** *You may not learn a tier 5 spell until you already know a tier 3
 *    spell* (the 4a review's MUST-FIX 4), read off the tiers of the spells the character knows -
 *    a tier 3 spell, as the sentence says.
 *
 * A spell a talent or a class feature teaches never comes through here (its grant carries
 * `spellFrom`; 07 §9: *A talent may teach a spell to a class its Classes line leaves out*).
 *
 * @param {{classes?: Array<{name?: string, schools?: string[]}>, spell?: {school?: string|null, classes?: string[], prerequisite?: string|null, tier?: number},
 *   known?: string[], prerequisite?: {school?: string|null, classes?: string[]}|null, knownTiers?: number[]}} o
 *   `known` the names of the spells the character knows; `prerequisite` the known prerequisite's system;
 *   `knownTiers` the tiers of the spells the character knows
 * @returns {{reason: "class"|"prerequisite"|"inherited"|"tierFive", prerequisite?: string}|null}
 */
export function spellLearnRefusal({ classes = [], spell = null, known = [], prerequisite = null, knownTiers = [] } = {}) {
  if (!spell) return { reason: "class" };
  const learners = (classes ?? []).filter(c => classLearnsSpell(c, spell));
  if (!learners.length) return { reason: "class" };
  const pre = String(spell.prerequisite ?? "").trim();
  if (pre) {
    if (!(known ?? []).some(n => same(n, pre))) return { reason: "prerequisite", prerequisite: pre };
    if (prerequisite && !learners.some(c => classLearnsSpell(c, prerequisite))) return { reason: "inherited", prerequisite: pre };
  }
  if (tierOf(spell) >= TIER_FIVE && !(knownTiers ?? []).some(t => tierOf({ tier: t }) === TIER_FIVE_NEEDS)) return { reason: "tierFive" };
  return null;
}

/** 07 §4: *No amount of levelling reaches tier 5. Tier 5 spells are found.* */
export const TIER_FIVE = 5;

/** 07 §4: *You may not learn a tier 5 spell until you already know a tier 3 spell.* */
export const TIER_FIVE_NEEDS = 3;

const tierOf = spell => Math.trunc(Number(spell?.tier)) || 1;

/**
 * **WHAT THE LEARNING DOOR DOES WITH ONE SPELL** (the lead, 2026-11-18: *"Yes the tier 5 spells
 * learned via tomes should be learnable by the GM manually to the character"*): a tier 5 spell is
 * found, so it reaches a character only when the GM teaches it - a player's drop is refused in
 * words (`foundOnly`), and so is any spell a refusal names; a GM is asked whether to teach it
 * anyway, and the confirm passes every gate (the class, the prerequisite, the tier 3 rule). The
 * same confirm serves any other spell off the character's list. `allow` where nothing stands in
 * the way.
 *
 * @param {{gm?: boolean, refusal?: {reason: string}|null, tier?: number}} o
 * @returns {{act: "allow"|"refuse"|"confirm", reason: string|null}}
 */
export function learnDoor({ gm = false, refusal = null, tier = 1 } = {}) {
  const found = tierOf({ tier }) >= TIER_FIVE;
  if (!found && !refusal) return { act: "allow", reason: null };
  if (gm) return { act: "confirm", reason: refusal?.reason ?? (found ? "foundOnly" : null) };
  return { act: "refuse", reason: found ? "foundOnly" : refusal.reason };
}

/**
 * **WHETHER A GRANT'S `spellFrom` IS HONOURED** (the 4a review's MUST-FIX 5, tightened by the fix
 * runs' review): only where the sync's own grant table pairs the item it names with THIS spell by
 * name - `grants` is `AzerothActor#spellGrantTable` (`talent-effects.mjs#spellGrantsFor` with
 * `death-knight.mjs#featureSpellGrants`), the actor's items and the same write's. A flag naming a
 * held talent that teaches some other spell, or none, is forged and judged like any other spell; a
 * spell carried in from another actor names an item this character does not hold at all.
 *
 * @param {{spellFrom?: string|null, name?: string, grants?: Array<{id: string, name: string}>}} o
 * @returns {boolean}
 */
export function spellFromHonoured({ spellFrom = null, name = "", grants = [] } = {}) {
  if (typeof spellFrom !== "string" || !spellFrom.length || typeof name !== "string" || !name.length) return false;
  return (grants ?? []).some(g => g && String(g.id) === spellFrom && g.name === name);
}
