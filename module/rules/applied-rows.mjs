/**
 * **WHAT A CARD'S APPLY HAS ALREADY DONE, SAID ON THE CARD** (the lead's play-test,
 * 2026-11-10: *"damage button did not apply damage if the token was moved via failing the
 * body test"*; D-888). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead's own card shows the Apply landed - the Raptor went from 12 to 9, its damage
 * ledger holds the 3, and the card's tracked row reads `applied` - but nothing on the card
 * said so: the button stayed live and printed the same number, the press took several
 * seconds to land, and a second press was answered *The attack operation was not
 * confirmed*, which reads as the opposite of what happened. A tracked card
 * (`flags.attackResolution`, `effects/attack-resolution-state.mjs`) records each row's
 * stage; this reads it for the card's render and for the words a refused press prints.
 */

/** The stages a tracked row passes through on an Apply. */
export const APPLY_STAGES = Object.freeze(["pending", "applying", "applied", "phased"]);

/**
 * The stage a tracked card's row stands at, or null where the card tracks no row there.
 *
 * @param {object|null} flags  the card's `flags["azeroth-rpg"]`
 * @param {number|string} index
 * @returns {string|null}
 */
export function rowStage(flags, index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return null;
  const rows = flags?.attackResolution?.version === 1 ? flags.attackResolution.targets : null;
  const stage = Array.isArray(rows) ? rows[i]?.stage ?? null : null;
  return typeof stage === "string" ? stage : null;
}

/**
 * **WHAT THE CARD'S APPLY BUTTON SAYS FOR ITS ROW**: `applied` greys it and names the
 * creature that took it; `applying` names the write in flight and leaves the control as
 * it is, because a write that never finished is the GM's to reconcile through the card's
 * review and must stay reachable. Anything else leaves the button alone.
 *
 * @param {string|null} stage
 * @returns {{key: string, disabled: boolean}|null}
 */
export function applyButtonState(stage) {
  if (stage === "applied") return { key: "AZEROTH.Card.AppliedTo", disabled: true };
  if (stage === "applying") return { key: "AZEROTH.Card.ApplyingTo", disabled: false };
  return null;
}

/**
 * **THE WORDS A REFUSED PRESS PRINTS** (`effects/attack-resolution-apply.mjs#requestAttackApply`):
 * a row already applied says it was applied, a write still in flight says so, and every other
 * refusal keeps the card's general words. Chain Lightning keeps its own.
 *
 * @param {{reason?: string}|null} result  the refusal
 * @param {string|null} stage  the row's stage when the refusal came back
 * @returns {string}  a lang key
 */
export function applyRefusalKey(result, stage) {
  const reason = result?.reason ?? null;
  if (reason === "resolved" && stage === "applied") return "AZEROTH.Card.AlreadyApplied";
  if (reason === "busy" || stage === "applying") return "AZEROTH.Card.ApplyBusy";
  return "AZEROTH.Foresight.ResolutionRefused";
}
