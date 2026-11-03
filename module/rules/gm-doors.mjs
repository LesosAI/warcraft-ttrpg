/**
 * **THE ACTOR DIRECTORY'S GM DOORS** (the lead, 2026-11-02; D-799). Pure, no
 * Foundry imports (CLAUDE.md §3).
 *
 * Two buttons stand in the Actor directory's footer that only a GM can use:
 * **Spellsteal recovery** (`applications/spellsteal-review.mjs`) and **Review
 * interrupted uses** (`applications/hunger-mastered-review.mjs`). Both resolve a
 * write a GM's client was carrying when it stopped, so both must be pressed on
 * the ACTIVE GM's client - the one that writes for everyone else.
 *
 * Two judgements, and every door of the family asks both:
 *
 * - **`showsGmDoor`** - whether the footer draws the button at all: for a GM,
 *   and for nobody else. `isGM` is core's (14.367 `common/documents/user.mjs`
 *   L124: `hasRole(ASSISTANT)`), so an Assistant GM sees it too; a player
 *   never does.
 * - **`gmDoorRefusal`** - why a press is refused, checked again in the door
 *   itself, because a footer drawn for one user can be reached by a macro or a
 *   console call from another: `notGM` for a player, `notActiveGM` for a GM who
 *   is not the active one. Null where the press may go ahead. Each refusal is
 *   said in words (`GM_DOOR_REFUSALS`), never by a silent `null`.
 */

/** The words each refusal is said in, by reason. */
export const GM_DOOR_REFUSALS = Object.freeze({
  notGM: "AZEROTH.GmDoors.NotGM",
  notActiveGM: "AZEROTH.GmDoors.NotActiveGM"
});

/**
 * Whether the footer draws a GM door for this user.
 *
 * @param {{isGM?: boolean}|null|undefined} user
 * @returns {boolean}
 */
export function showsGmDoor(user) {
  return user?.isGM === true;
}

/**
 * Why a press of a GM door is refused, or null.
 *
 * @param {{id?: string, isGM?: boolean}|null|undefined} user  who pressed it
 * @param {string|null|undefined} activeGmId  the active GM's id (`game.users.activeGM?.id`)
 * @returns {"notGM"|"notActiveGM"|null}
 */
export function gmDoorRefusal(user, activeGmId) {
  if (user?.isGM !== true) return "notGM";
  if (!user.id || user.id !== activeGmId) return "notActiveGM";
  return null;
}
