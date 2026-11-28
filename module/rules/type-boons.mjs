/**
 * **A BOON AGAINST A CREATURE TYPE, AS A ROLL-DIALOG LINE** (the Witch Hunter plan's Finding 2: *Text-only "against a
 * type" rules. Two become roll-dialog lines through the type gate: Blessed (Lesser)'s Boon against the undead and
 * Elixir of Demonslaying's Boon*; wave 2c). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The two sentences, 08's own:
 *
 * > **Blessed** (08 §6) **Lesser.** Boon on attacks against the undead.
 * > **Elixir of Demonslaying** (08 §12) A Boon on Attack Tests against demons for five minutes
 *
 * Both read the target through the ONE type gate (`talent-gates.mjs#gateHolds`'s `targetType`, wave 1b's Finding 1),
 * whose answer is three-valued: a target of the type is an AUTOMATIC line, ticked; a target whose type could not be
 * read (no target, or a snapshot that names none) is a JUDGEMENT line, unticked, because then the table decides (D2
 * §12); a target of another type draws no line. An attack only, never a Parry (06 §6: a Parry is not an attack).
 *
 * **Blessed (Greater) carries no Boon** (MY READING): its line, *Damage becomes Holy. A wielder carrying Fel or Undeath
 * Corruption takes 1 damage per attack made with it*, restates none, where 08's grades that keep the Lesser say *Also*.
 *
 * **WHISPERING (TYPE)** (08 §6, *Lesser. Direction of the nearest named creature within 100 feet. Greater. Within 300
 * feet, and roughly how many.*): `whisperingOf` reads the type out of the trait's own name - *Whispering (Undead)* - and
 * `rules/witch-hunter-features.mjs#whisperingSense` is the sense, beside the Medallion's.
 */

import { cleanType } from "./tome.mjs";
import { traitKey } from "./weapon-traits.mjs";
import { gateHolds, targetFactsOf } from "./talent-gates.mjs";

/** The kind `rules/utility-draughts.mjs` files Elixir of Demonslaying's carrier under. */
export const DEMONSLAYING = "demonslaying";

/**
 * **THE SOURCES**, each a Boon on Attack Tests against one type: where it comes from (`trait` - a trait of the weapon
 * swung, at its grade - or `draught` - a utility draught's carrier, by kind) and the gate it asks.
 */
export const TYPE_BOONS = Object.freeze([
  Object.freeze({ id: "blessed-lesser", name: "Blessed (Lesser)", source: "trait", trait: "blessed", grade: "lesser", test: "attack", when: Object.freeze({ targetType: "undead" }) }),
  Object.freeze({ id: "demonslaying", name: "Elixir of Demonslaying", source: "draught", kind: DEMONSLAYING, test: "attack", when: Object.freeze({ targetType: "demon" }) })
]);

/** The lang key each line's words come from. */
const LABELS = Object.freeze({ "blessed-lesser": "AZEROTH.TypeBoon.Blessed", demonslaying: "AZEROTH.TypeBoon.Demonslaying" });
const LABEL = id => LABELS[id];

/**
 * **THE LINES** a Test gets from what the roller swings and drinks, against its first target.
 *
 * @param {{kind?: string, parry?: boolean, weaponTraits?: string[], draughts?: string[], target?: object|null}} o
 *   `weaponTraits` the traits of the weapon this attack is made with; `draughts` the utility-draught kinds acting on
 *   the roller (`utility-draughts.mjs#utilityCapability`'s); `target` the first target snapshot
 *   (`roll-dialog.mjs#targetSnapshots`), or null
 * @returns {Array<{id: string, label: string, name: string, boons: number, banes: number, modifier: number, checked: boolean}>}
 */
export function typeBoonLines({ kind = null, parry = false, weaponTraits = [], draughts = [], target = null } = {}) {
  if (kind !== "attack" || parry === true) return [];
  const traits = (weaponTraits ?? []).map(traitKey);
  const facts = { target: target ? targetFactsOf(target) : null };
  const out = [];
  for (const row of TYPE_BOONS) {
    const held = row.source === "trait"
      ? traits.some(t => t.key === row.trait && t.grade === row.grade)
      : (draughts ?? []).includes(row.kind);
    if (!held) continue;
    const holds = gateHolds(row.when, facts);
    if (holds === false) continue;
    out.push({ id: `type-boon-${row.id}`, label: LABEL(row.id), name: row.name, boons: 1, banes: 0, modifier: 0, checked: holds === true });
  }
  return out;
}

/**
 * **WHAT A WHISPERING TRAIT NAMES**: the type out of its own name (*Whispering (Undead) (Lesser)*, 08 §6: *Whispering
 * names its quarry in the item's name*) and its grade. A trait that still carries the placeholder (*Whispering (Type)*)
 * names no type and senses nothing.
 *
 * @param {string[]} traits
 * @returns {Array<{type: string, grade: "lesser"|"greater"}>}
 */
export function whisperingOf(traits = []) {
  const out = [];
  for (const name of traits ?? []) {
    const { key, grade } = traitKey(name);
    if (key !== "whispering") continue;
    const type = [...String(name).matchAll(/\(([^)]+)\)/g)].map(m => cleanType(m[1])).find(Boolean) ?? null;
    if (!type) continue;
    out.push({ type, grade: grade === "greater" ? "greater" : "lesser" });
  }
  return out;
}
