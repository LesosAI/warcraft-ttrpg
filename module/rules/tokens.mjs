/**
 * What a character's token looks like before anybody touches it (the lead,
 * 2026-09-13). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * **NOTHING SET A CHARACTER'S TOKEN.** Core's defaults are HOSTILE, an
 * unlinked actor and a name nobody can see, which is right for a creature
 * dragged off the bestiary and wrong for every player character: a PC dropped
 * on a scene came up red, drew no bar, showed no name and did not follow its
 * own sheet. Only the character creator ever set anything — `actorLink: true`,
 * and only for a character it made — so a GM building a party by hand, or
 * importing one, got all four wrong every time. `core.defaultToken` no longer
 * exists in v14, so there is no world setting to lean on either.
 *
 * The six keys, and why each:
 *
 * | key | value | why |
 * |---|---|---|
 * | `actorLink` | `true` | a PC is ONE actor; its token is a window on the sheet, not a copy |
 * | `disposition` | FRIENDLY (1) | core defaults to HOSTILE, which colours every PC red |
 * | `displayName` | ALWAYS (50) | the table reads names off the map |
 * | `displayBars` | OWNER_HOVER (20) | the plan's call: the owner sees their own Health, the table does not read it off the canvas |
 * | `bar1.attribute` | `health` | `system.json`'s `primaryTokenAttribute`, said again where the bar is configured |
 * | `sight.enabled` | `true` | D-759: core's default is OFF, so a player saw nothing at all on a scene with Token Vision |
 *
 * **SIGHT IS SWITCHED ON AND NOTHING ELSE** (D-759; the lead, 2026-09-29: *Yes,
 * with migration*). The range stays core's 0 and the vision mode core's
 * `basic`: race darkvision is a separate rules question, and this module gives
 * no people a range. Verified against 14.367 (`client/documents/token.mjs
 * #_prepareDetectionModes`, `client/canvas/sources/point-vision-source.mjs`,
 * `client/canvas/groups/visibility.mjs#refreshVisibility`): an enabled sight at
 * range 0 is given Light Perception at an unlimited range and Basic Sight at 0,
 * so the token sees whatever is LIT within its line of sight, walls blocking,
 * at any distance - the whole board in its sight lines on a scene with Global
 * Illumination on, only what a light source lights on a dark one, and nothing
 * at all where nothing is lit.
 *
 * **AN IMPORT AND A DUPLICATE CARRY ALL SIX**, at core's own values, which is
 * why `characterTokenPatch` reads what a key HOLDS and not only whether it is
 * there (the final review, 2026-09-13). A character exported from a world
 * older than 0.12.6 comes back HOSTILE, unlinked, nameless and barless, and a
 * patch keyed on presence alone was empty for every one of them — while the
 * migration that would have repaired it had already run and never revisits.
 *
 * **The numbers are LITERALS on purpose.** This module is loaded by Vitest,
 * where `CONST` does not exist; `rules/bestiary.mjs#prototypeTokenFor` is
 * literal for exactly the same reason. They are `CONST.TOKEN_DISPOSITIONS
 * .FRIENDLY`, `CONST.TOKEN_DISPLAY_MODES.ALWAYS` and `.OWNER_HOVER`, verified
 * against 14.367, and `tokens.test.mjs` holds them against those constants'
 * documented values.
 */

/**
 * The prototype token a character is created with.
 *
 * **FROZEN, AND NOBODY MAY HAND IT TO FOUNDRY.** `DataField#clean` mutates
 * the object it is given IN PLACE, so a create payload holding this table's
 * own `bar1` throws *Cannot assign to read only property 'attribute'* out of
 * `SchemaField._cleanType` — and the creator then refuses the whole character
 * with a `failed` reason that says nothing about tokens (found by the Quench
 * run, 2026-09-13; every Vitest passed, because none of them handed the object
 * to a DataModel). `characterToken()` is what callers use.
 */
export const CHARACTER_TOKEN = Object.freeze({
  actorLink: true,
  disposition: 1,
  displayName: 50,
  displayBars: 20,
  bar1: Object.freeze({ attribute: "health" }),
  // D-759. `enabled` ALONE: a payload naming `sight` has named nothing else in
  // it, so core fills the range (0) and the vision mode (`basic`) itself.
  sight: Object.freeze({ enabled: true })
});

/**
 * The keys of `CHARACTER_TOKEN` that hold an object, and are read one level
 * down rather than compared whole: `bar1.attribute` and `sight.enabled`.
 */
const NESTED = Object.freeze(["bar1", "sight"]);

/**
 * A fresh, WRITABLE copy of `CHARACTER_TOKEN`, for a create payload.
 *
 * Deep on purpose: a spread of the frozen table shares its `bar1` and its
 * `sight`, and those are exactly the objects Foundry cleans in place.
 *
 * @returns {object}
 */
export function characterToken() {
  return { ...CHARACTER_TOKEN, bar1: { ...CHARACTER_TOKEN.bar1 }, sight: { ...CHARACTER_TOKEN.sight } };
}

/**
 * What CORE puts in each of those six keys when nobody has chosen.
 *
 * Verified against `common/documents/token.mjs` at 14.367: `displayName` and
 * `displayBars` initial `TOKEN_DISPLAY_MODES.NONE`, `disposition` initial
 * `TOKEN_DISPOSITIONS.HOSTILE`, `actorLink` a plain `BooleanField`. `bar1
 * .attribute` initialises from `game.system.primaryTokenAttribute`, which is
 * `health` in a live world and `null` in Node — either is *unchosen* here.
 * `sight.enabled` initialises to `Number(data.sight.range) > 0`, and the range
 * initialises to 0, so a token nobody configured is blind (D-759).
 *
 * It is a table rather than a comment because `characterTokenPatch` reads it:
 * see there for why an unchosen value has to count as an absence.
 */
export const CORE_TOKEN_DEFAULTS = Object.freeze({
  actorLink: false,
  disposition: -1,
  displayName: 0,
  displayBars: 0,
  sight: Object.freeze({ enabled: false })
});

/**
 * The keys of `CHARACTER_TOKEN` that `token` does not already choose.
 *
 * **What the create data says WINS.** A GM making a neutral doppelgänger of a
 * player character passes `disposition: 0` and means it; a default that
 * overrode it would be a default nobody could get past.
 *
 * **BUT A KEY SET TO CORE'S OWN DEFAULT HAS CHOSEN NOTHING** (the final
 * review, 2026-09-13). Presence was the only signal this read, and a
 * *Duplicate* or an *Import Data* carries EVERY prototype key — a
 * pre-0.12.6 character exports as HOSTILE, unlinked, nameless and barless, so
 * the patch came back empty and the copy kept core's defaults for good: the
 * migration had already run and never revisits. Reading the VALUE as well
 * fixes the copy and still lets an explicit choice through, because every one
 * of the five is a value a GM would have to pick on purpose.
 *
 * The cost is stated plainly: a GM who wants a character token that is
 * genuinely HOSTILE, or genuinely nameless, or genuinely BLIND, sets it after
 * the create rather than in the payload. Nothing can tell that apart from an
 * import, and a party that comes up red - or sees nothing - is the worse of
 * the two failures.
 *
 * `bar1` and `sight` are read one level down, because a create payload naming
 * `bar1: {attribute: "mana"}` has named the thing this would set while a
 * payload naming nothing — or naming `null` — has not. **`sight.enabled` is
 * compared against core's DEFAULT, never against presence** (D-759, the D-665
 * trap): an import or a duplicate always carries `sight: {enabled: false, ...}`,
 * so a patch keyed on presence would leave every copied character blind. A
 * `sight` the patch does set carries `enabled` alone, and `updateSource` merges
 * it, so a copy's range and vision mode are kept.
 *
 * @param {object} [token]  the `prototypeToken` (or token) data as given
 * @returns {object} a patch, empty where everything is already chosen
 */
export function characterTokenPatch(token = {}) {
  const given = token ?? {};
  const patch = {};
  for (const [key, value] of Object.entries(CHARACTER_TOKEN)) {
    if (NESTED.includes(key)) continue;
    const named = given[key];
    if (named === undefined || named === CORE_TOKEN_DEFAULTS[key]) patch[key] = value;
  }
  const bar = given.bar1?.attribute;
  if (bar === undefined || bar === null || bar === "") patch.bar1 = { ...CHARACTER_TOKEN.bar1 };
  const sees = given.sight?.enabled;
  if (sees === undefined || sees === null || sees === CORE_TOKEN_DEFAULTS.sight.enabled) patch.sight = { ...CHARACTER_TOKEN.sight };
  return patch;
}

/**
 * The update that brings a token already in the world up to `CHARACTER_TOKEN`,
 * or null where it is already there.
 *
 * The REPAIR pass, which is the half a rule enforced only on create never gets
 * (CLAUDE.md §15). Flat keys, so `bar1.attribute` is written without
 * clobbering `bar1.value`; idempotent by construction, since a token that
 * already holds every value yields nothing.
 *
 * **`actorLink` is held back for a token carrying a delta** (`linkable:
 * false`). Flipping an unlinked token to linked DISCARDS its `ActorDelta`, and
 * on a player character that delta is their Health: a repair pass that loses
 * a session's damage is worse than the red ring it was fixing. Such a token
 * still takes the other five.
 *
 * Sight is `sightRepair`'s, below, and written FLAT for the same reason as
 * `bar1.attribute`: `"sight.enabled"` leaves the range and the vision mode a
 * GM gave the token where they were.
 *
 * @param {object} token  the token's stored data
 * @param {{linkable?: boolean}} [options]
 * @returns {object|null}
 */
export function tokenRepair(token = {}, { linkable = true } = {}) {
  const current = token ?? {};
  const update = {};
  if (linkable && current.actorLink !== CHARACTER_TOKEN.actorLink) update.actorLink = CHARACTER_TOKEN.actorLink;
  if (current.disposition !== CHARACTER_TOKEN.disposition) update.disposition = CHARACTER_TOKEN.disposition;
  if (current.displayName !== CHARACTER_TOKEN.displayName) update.displayName = CHARACTER_TOKEN.displayName;
  if (current.displayBars !== CHARACTER_TOKEN.displayBars) update.displayBars = CHARACTER_TOKEN.displayBars;
  if (current.bar1?.attribute !== CHARACTER_TOKEN.bar1.attribute) update["bar1.attribute"] = CHARACTER_TOKEN.bar1.attribute;
  Object.assign(update, sightRepair(current) ?? {});
  return Object.keys(update).length ? update : null;
}

/**
 * The update that switches a token's sight on, or null where it already sees
 * (D-759). The ONE rule for it: `tokenRepair` folds it in, and migration
 * 0.12.15 runs it ALONE over what a world already holds.
 *
 * **ALONE, BECAUSE THE LEAD RULED ON SIGHT AND NOTHING ELSE** (2026-09-29,
 * *Yes, with migration*: every existing player character's token sees,
 * including one a GM set blind on purpose). The other five keys were repaired
 * once by 0.12.6, and a GM may have changed any of them deliberately since -
 * a PC made NEUTRAL for a masquerade, a name hidden for a disguise - so a pass
 * that re-stamped them would undo choices nobody asked it to touch.
 *
 * Flat, so the range and the vision mode a GM set survive: a token set to see
 * 60 feet in the dark and then switched off comes back seeing 60 feet. The
 * second argument is `tokenRepair`'s and is ignored: a delta does not stand in
 * the way of sight, which lives on the token and never on its actor.
 *
 * @param {object} token  the token's stored data
 * @returns {object|null}
 */
export function sightRepair(token = {}) {
  if (token?.sight?.enabled === CHARACTER_TOKEN.sight.enabled) return null;
  return { "sight.enabled": CHARACTER_TOKEN.sight.enabled };
}

/**
 * Whether an `ActorDelta`'s stored data says anything at all.
 *
 * Core gives every unlinked token a delta whose source is an `_id` and a set
 * of empty containers; one that names a field, an item or an effect is a token
 * somebody has changed, and `tokenRepair` then leaves `actorLink` alone.
 *
 * @param {object|null} raw  the delta's `_source`
 */
export function deltaIsEmpty(raw) {
  if (!raw) return true;
  if (raw.name || raw.type || raw.img || raw.ownership) return false;
  if (Object.keys(raw.system ?? {}).length) return false;
  if ((raw.items ?? []).length || (raw.effects ?? []).length) return false;
  if (Object.keys(raw.flags ?? {}).length) return false;
  return true;
}
