import { countModifiers } from "./modifiers.mjs";
import { damageChosen } from "./talent-effects.mjs";
import { swingable } from "./held-attacks.mjs";
import { hasTitansPresence, isTwoHanded } from "./worn.mjs";

const linesOf = prepared => [...(prepared?.situational?.automatic ?? []), ...(prepared?.situational?.judgement ?? [])];
const number = value => Number.isFinite(value) ? value : 0;

/** A required Extra Attack choice has no implicit first option. */
export function extraAttackSelection(options, id) {
  if (typeof id !== "string" || !id) return null;
  return (options ?? []).find(option => option.id === id && !option.disabled) ?? null;
}

/** The attacking weapon, or one equipped offhand weapon; never ammunition. */
export function extraAttackWeapons(weapon, ready = [], talents = []) {
  if (!weapon || weapon.type !== "weapon") return [];
  const result = [{ id: "current", weapon, offHand: weapon.system?.offHand === true }];
  if (!isTwoHanded(weapon) || hasTitansPresence(talents)) {
    for (const item of ready) {
      if (item.id && item.id !== weapon.id && swingable(item) && item.system?.offHand === true) {
        result.push({ id: item.id, weapon: item, offHand: true });
      }
    }
  }
  return result;
}

/** Recalculate automatic facts for a fresh defender, preserving explicit
 * checkbox overrides and free Boons/Banes. Costs already paid by the first
 * attack cannot be selected or spent again by its second roll. */
export function secondAttackChoice(previous, next, choice) {
  const oldLines = linesOf(previous), chosen = new Set(choice.chosen ?? []);
  const oldCount = countModifiers(oldLines.map(row => ({ ...row, checked: chosen.has(row.id) })));
  const extraBoons = Math.max(0, number(choice.boons) - oldCount.boons);
  const extraBanes = Math.max(0, number(choice.banes) - oldCount.banes);
  const override = (row, oldRows, selected) => {
    const old = oldRows.find(prior => prior.id === row.id);
    return old && selected.has(old.id) !== Boolean(old.checked) ? selected.has(old.id) : Boolean(row.checked);
  };
  const lines = linesOf(next).map(row => ({ ...row, checked: override(row, oldLines, chosen) }));
  const counts = countModifiers(lines, { extraBoons, extraBanes });
  const oldDamage = previous.damageLines ?? [];
  const damageIds = new Set(choice.damageChoices ?? oldDamage.filter(row =>
    (choice.damageRows ?? []).some(selected => selected.name === row.name && selected.amount === row.amount)).map(row => row.id));
  const damageLines = (next.damageLines ?? []).map(row => ({ ...row, checked: override(row, oldDamage, damageIds) }));
  return {
    choice: { ...choice, ...counts, ...damageChosen(damageLines),
      modifier: counts.modifier + number(choice.modifier) - oldCount.modifier,
      dc: choice.dc === previous.dc ? next.dc : choice.dc,
      targets: next.targets, chosen: lines.filter(row => row.checked).map(row => row.id),
      damageChoices: damageLines.filter(row => row.checked).map(row => row.id),
      momentumSpent: 0, finisherSpent: 0, finisherFree: null, finisherMode: "damage",
      riders: [], talentLines: [], secondTargets: null, secondRoll: true },
    lines, extraBoons, extraBanes
  };
}
