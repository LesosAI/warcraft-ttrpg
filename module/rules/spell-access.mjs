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
