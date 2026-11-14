/**
 * What a spell's effect says it heals (D-625). 07 keeps healing in the prose
 * - "The target regains 6 Health." - and never raises it by SL or tier (07
 * SS9, 05 SS15), so the number printed is the number applied. Pure: no
 * Foundry imports, so the chapter parser and the migration read the same
 * grammar the card does.
 *
 *  amount      "regains N Health"                                  once, on the cast
 *  perTurn     "regains N Health at the start of each of its turns"
 *              "..., then N Health at the start of each of its turns"
 *  fromDamage  "regain Health equal to (half) the damage dealt"     the caster's
 *
 * "temporary Health" is "gains", never "regains", and does not match: the
 * actor carries no such field. An "instead" clause for undead ("Cast on an
 * undead creature it heals instead: ...") is a second spell and is not read
 * here: `undeadHealFromText` reads it at the cast (the Death Knight plan's door 3).
 *
 * @param {string} text  Plain, Markdown or HTML.
 * @returns {{amount: number|null, perTurn: number|null, fromDamage: "half"|"all"|null}|null}
 */
/**
 * **07's DEATH COIL ON AN UNDEAD CREATURE** (the Death Knight plan's Phase 4 door 3: *Cast
 * on an undead creature it heals instead: the target regains 4 Health and takes no
 * damage*): the Health the clause restores, or null where the entry carries none. Read at
 * the cast off the entry's own prose - never stamped, so no spell's stored `heal` changes
 * shape - and `castSpell` spares each undead target the damage and heals it this much.
 *
 * @param {string} text  Plain, Markdown or HTML.
 * @returns {number|null}
 */
export function undeadHealFromText(text = "") {
  const plain = String(text).replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ");
  const m = /Cast on an undead creature it heals instead: the target regains (\d+) Health/i.exec(plain);
  return m ? Number(m[1]) : null;
}

export function healFromText(text = "") {
  const plain = String(text).replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ");
  const main = plain.split(/Cast on an undead/i)[0];

  let perTurn = null;
  const tick = /(?:regains?|restores?|recovers?|then|and) (\d+) Health at the start of each of (?:its|their|your) turns/i.exec(main);
  if (tick) perTurn = Number(tick[1]);

  let amount = null;
  const once = /(?:regains?|restores?|recovers?) (\d+) Health\b/gi;
  let m;
  while ((m = once.exec(main))) {
    if (tick && m.index === tick.index) continue;
    amount = Number(m[1]);
    break;
  }

  let fromDamage = null;
  const drain = /regains? Health equal to (half (?:of )?)?the damage dealt/i.exec(plain);
  if (drain) fromDamage = drain[1] ? "half" : "all";

  if (amount === null && perTurn === null && !fromDamage) return null;
  return { amount, perTurn, fromDamage };
}
