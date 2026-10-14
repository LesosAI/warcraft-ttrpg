/**
 * The fifteen conditions, as V14 status effects.
 *
 * A1-CONDITIONS defines each one and nothing else does. This file carries no
 * rules text — it carries the id, the icon, and the numeric change where there
 * is one, and localizes the name through `AZEROTH.conditions`.
 *
 * WHY MOST OF THEM HAVE NO `changes`:
 *
 *   "Active Effects change numbers, the roll pipeline changes dice"
 *   (CLAUDE.md §6). Eleven of the fifteen do nothing but impose a Bane or
 *   forbid an action, and a Bane is a die, not a stat. Those are markers the
 *   roll pipeline reads. Modelling a Bane as a `-2` somewhere would be
 *   inventing a rule the book does not have.
 *
 * Bleeding and Scorched carry no `changes` either, for the same reason and a
 * second one: their number is a payment at the start of a turn, not a stat, and
 * it is taken in `AzerothCombat#_turnTicks` (D-628, D-695). The value rides on
 * `flags.azeroth-rpg.value`, which is what `effectAction`'s stepper writes.
 *
 * Three touch Speed and are real changes:
 *   Entangled  Speed is 0
 *   Prone      Speed is 0 until you Stand
 *   Slowed     Speed is halved
 *
 * They apply in the `final` phase, because `system.speed` is computed in
 * prepareDerivedData and `final` lands after it. Within the phase, `multiply`
 * (priority 10) resolves before `override` (50), so Slowed and Prone together
 * end at 0 rather than at half.
 */

import { AZEROTH } from "../config.mjs";
import { CONDITION_TEXT } from "../rules/condition-text.mjs";

/** Core icons, so nothing 404s before the art drop (Phase 7). */
const ICONS = {
  bleeding: "icons/svg/blood.svg",
  blinded: "icons/svg/blind.svg",
  charmed: "icons/svg/sleep.svg",
  deafened: "icons/svg/deaf.svg",
  diseased: "icons/svg/biohazard.svg",
  entangled: "icons/svg/net.svg",
  fatigued: "icons/svg/degen.svg",
  frightened: "icons/svg/terror.svg",
  numbed: "icons/svg/paralysis.svg",
  poisoned: "icons/svg/poison.svg",
  prone: "icons/svg/falling.svg",
  scorched: "icons/svg/fire.svg",
  silenced: "icons/svg/silenced.svg",
  slowed: "icons/svg/downgrade.svg",
  stunned: "icons/svg/daze.svg"
};

/** The only three conditions with a numeric effect on a stat. */
const CHANGES = {
  entangled: [{ key: "system.speed", type: "override", value: 0, phase: "final" }],
  prone: [{ key: "system.speed", type: "override", value: 0, phase: "final" }],
  slowed: [{ key: "system.speed", type: "multiply", value: 0.5, phase: "final" }]
};

/**
 * Register the conditions into `CONFIG.statusEffects`.
 *
 * V14 changed the shape: it is keyed by id — `{[id]: StatusEffectConfig}` —
 * where V13 had an array. The core object is a Proxy that accepts assignment
 * by id, which is how core registers its own.
 */
export function registerConditions() {
  for (const [id, label] of Object.entries(AZEROTH.conditions)) {
    // A1 §4's OWN WORDS, so hovering the icon says what the condition does
    // and what ends it. The registration carried a name and nothing else, so
    // Charmed on a token told a player its name and no more - the sentence
    // *you treat the charmer as an ally and cannot willingly attack them* was
    // in the pack all along and never on screen (the lead, 2026-09-07).
    const entry = CONDITION_TEXT[id];
    const effect = {
      id,
      name: label,
      img: ICONS[id] ?? "icons/svg/aura.svg",
      // `statuses` is what `actor.statuses.has("prone")` reads.
      statuses: [id]
    };
    if (entry) {
      effect.description = entry.ends
        ? `${entry.text}<p><strong>${game.i18n.localize("AZEROTH.Condition.Ends")}</strong> ${entry.ends}</p>`
        : entry.text;
    }
    // V14 moved changes to system.changes; the root-level shim is deprecated
    // and the e2e smoke test fails on any deprecation warning.
    if (CHANGES[id]) effect.system = { changes: CHANGES[id] };
    CONFIG.statusEffects[id] = effect;
  }
  // The fight states (D-627): a status with no changes, read by the dialog.
  for (const [id, label] of Object.entries(AZEROTH.combatStates ?? {})) {
    CONFIG.statusEffects[id] = { id, name: label, img: "icons/svg/shield.svg", statuses: [id] };
  }
}

/**
 * Whether a condition carries a value. Only Bleeding, Poisoned and Scorched do
 * (A1 §1): "A condition is on you or it is not."
 */
export function isValued(id) {
  return AZEROTH.valuedConditions.includes(id);
}

/**
 * How many Banes a stack of Poisoned imposes. Four stacks are possible but the
 * fourth adds no Bane — it is one more stack to shed (D-472). 05 caps the Bane
 * count at 3 regardless.
 */
export function poisonedBanes(stacks) {
  return Math.min(Math.max(0, Math.trunc(stacks ?? 0)), AZEROTH.POISONED_BANE_CAP);
}

/** Every condition id, for iteration by the sheet and the roll pipeline. */
export function conditionIds() {
  return Object.keys(AZEROTH.conditions);
}

/**
 * WHAT A CREATURE IS CARRYING OF THE THREE VALUED CONDITIONS (A1 §1; D-696).
 *
 * *Values from separate sources add together*, which is A1's own sentence for
 * Bleeding and for Scorched, so two effects of the same status sum. The value
 * rides on `flags.azeroth-rpg.value` - the stepper's own field - and a status
 * with no number written on it counts as 1, exactly as `_turnTicks` reads it.
 *
 * Only the valued three, because *a condition is on you or it is not* for the
 * other twelve and `statuses` already says which. It is here rather than in the
 * roll dialog because it reads effect documents, and it exists because
 * Perdition's Blade deals *additional damage equal to that creature's Scorched
 * value* - the first rule in the system to read a condition's NUMBER off
 * somebody else.
 *
 * @param {Actor} actor
 * @returns {Record<string, number>}
 */
export function conditionValues(actor) {
  const out = {};
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    for (const id of effect.statuses ?? []) {
      if (!isValued(id)) continue;
      out[id] = (out[id] ?? 0) + (Number(effect.getFlag?.("azeroth-rpg", "value")) || 1);
    }
  }
  return out;
}
