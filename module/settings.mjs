/**
 * World and client settings, registered at init.
 *
 * The migration marker lived in `migrations/index.mjs` alone while it was the
 * only setting; the roll dialog's preference is the second, so both are here.
 */

import { SETTING_KEY as MIGRATION_KEY } from "./migrations/index.mjs";
import { cleanState, emptyState } from "./rules/regions.mjs";
import { cleanOffer } from "./rules/loot-offer.mjs";
import { cleanKeyMap } from "./rules/animation.mjs";

export const ROLL_DIALOG_SETTING = "rollDialog";
/** The folder the NPC generator last created into (D-637); a client's own. */
export const GENERATOR_FOLDER_SETTING = "generatorFolder";
/** The folder the loot generator last created into (D-666); a client's own. */
export const LOOT_FOLDER_SETTING = "lootFolder";
/** Who holds which region, where the company is, and the log (D-680). */
export const MAP_STATE_SETTING = "worldMap";
/** Whether this client opens the world map when it joins (D-680). */
export const MAP_AT_LOGIN_SETTING = "worldMapAtLogin";
/** Whether a drag is held to what the turn's Half-Actions pay for (D-718). */
export const MOVEMENT_LIMIT_SETTING = "movementLimit";
/** The find the players are being offered, one at a time or none (D-721). */
export const LOOT_OFFER_SETTING = "lootOffer";
/** Whether this screen plays cues and loops at all (D-729). */
export const ANIMATIONS_SETTING = "animations";
/** Whether a cue's sounds are heard on this screen (D-729). */
export const ANIMATION_SOUNDS_SETTING = "animationSounds";
/** Whether standing loops run on this screen; cues are unaffected (D-729). */
export const ANIMATION_LOOPS_SETTING = "animationLoops";
/** The loops a GM has stopped for the whole table, by loop key (D-730). */
export const ANIMATION_STOPS_SETTING = "animationStops";
/** The loops this screen's own reader has hidden, by loop key (D-730). */
export const ANIMATION_HIDDEN_SETTING = "animationHidden";

/**
 * Read the world map's state, whatever shape a world happens to hold.
 *
 * ALWAYS THROUGH `cleanState`: a world saved before a field existed must not
 * throw, and a setting is exactly the place an old shape survives a schema
 * change — there is no `migrateData` on a setting and no document validation
 * to refuse it.
 */
export function mapState() {
  let stored = null;
  try { stored = game.settings.get("azeroth-rpg", MAP_STATE_SETTING); } catch { stored = null; }
  return cleanState(stored);
}

/** Write the world map's state. GM only — core refuses a player a world setting. */
export async function setMapState(state) {
  return game.settings.set("azeroth-rpg", MAP_STATE_SETTING, cleanState(state));
}

/**
 * The offer of loot a world is holding, or null (D-721).
 *
 * **DEEP-CLONED BEFORE IT IS CLEANED.** `game.settings.get` on an Object
 * setting hands back the LIVE cached value off the Setting document
 * (`client/helpers/client-settings.mjs`, verified at 14.367), so cleaning it
 * in place would edit the world's copy on this client and every later read
 * would see the edit rather than the write. Guarded for the same reason
 * `mapState` is: a setting has no `migrateData` behind it.
 */
export function lootOffer() {
  let stored = null;
  try { stored = game.settings.get("azeroth-rpg", LOOT_OFFER_SETTING); } catch { stored = null; }
  if (stored === null || stored === undefined) return null;
  try { return cleanOffer(foundry.utils.deepClone(stored)); } catch { return null; }
}

/**
 * Write the offer, whole, with the tag that says what moved it (D-721).
 *
 * GM only — core refuses a player a world setting (`SETTINGS_MODIFY` is a
 * GAMEMASTER permission, server-enforced), which is why every player's claim
 * goes through `CONFIG.queries` instead.
 *
 * The tag rides `options` all the way to the Setting's `onChange` on EVERY
 * client, so the listener can tell a presentation (open the window, raised)
 * from a claim (re-render what is already open):
 *
 * - `present` — a new offer;
 * - `claim` — a row moved, or the offer went into settling;
 * - `settle` / `cancel` — the last write, `null`, which closes the window.
 *
 * @param {object|null} offer
 * @param {"present"|"claim"|"settle"|"cancel"} [tag]
 */
export async function setLootOffer(offer, tag = "claim") {
  return game.settings.set("azeroth-rpg", LOOT_OFFER_SETTING, cleanOffer(offer), { azerothLoot: tag });
}

/* -------------------------------------------- */
/*  The animation layer (D-729, D-730)           */
/* -------------------------------------------- */

/** One of the three animation switches, true unless a world says otherwise. */
function animationSwitch(key) {
  try {
    return game.settings.get("azeroth-rpg", key) !== false;
  } catch {
    // Asked before `init` - a macro, a test - and a missing setting must read
    // as ON, or the layer would look broken rather than switched off.
    return true;
  }
}

/** Whether this screen plays anything at all (D-729). */
export function animationsEnabled() {
  return animationSwitch(ANIMATIONS_SETTING);
}

/** Whether a cue's sounds are heard here (D-729). */
export function animationSoundsEnabled() {
  return animationSwitch(ANIMATION_SOUNDS_SETTING);
}

/** Whether standing loops run here. Cues are unaffected (D-729). */
export function animationLoopsEnabled() {
  return animationSwitch(ANIMATION_LOOPS_SETTING);
}

/**
 * The loops a GM has stopped for the table, and the ones this screen has
 * hidden (D-730).
 *
 * **DEEP-CLONED BEFORE THEY ARE CLEANED**, for the reason `lootOffer` is:
 * `game.settings.get` on an Object setting hands back the LIVE cached value,
 * so cleaning it in place would edit the world's copy on this client.
 * `cleanKeyMap` walks only the keys that are present at every depth
 * (CLAUDE.md §15), so a stop written as `{by}` alone never comes back
 * carrying a null `at`.
 */
function keyMap(key) {
  let stored = null;
  try { stored = game.settings.get("azeroth-rpg", key); } catch { stored = null; }
  if (!stored || typeof stored !== "object") return {};
  try { return cleanKeyMap(foundry.utils.deepClone(stored)); } catch { return {}; }
}

/** The loops stopped for everyone, keyed by loop key. */
export function animationStops() {
  return keyMap(ANIMATION_STOPS_SETTING);
}

/**
 * Write the stops. **GM ONLY** - core refuses a player a world setting
 * (`SETTINGS_MODIFY` is a GAMEMASTER permission, server-enforced), and the
 * stop door draws Stop for a GM alone for exactly that reason.
 *
 * **THE REFUSAL IS SAID, NOT SWALLOWED.** A player reaching this - a forged
 * `data-action`, a macro, or a world that granted `SETTINGS_MODIFY` to PLAYER
 * and so would let core's own write through - got a silent `null` and no way
 * to tell it from a button that does nothing. This door refuses either way,
 * and says which.
 */
export async function setAnimationStops(map) {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Animation.Refuse.GMOnly"));
    return null;
  }
  return game.settings.set("azeroth-rpg", ANIMATION_STOPS_SETTING, cleanKeyMap(map));
}

/** The loops hidden on this screen alone, keyed by loop key. */
export function animationHidden() {
  return keyMap(ANIMATION_HIDDEN_SETTING);
}

/** Write this client's hides. Anybody may: it is their own screen. */
export async function setAnimationHidden(map) {
  return game.settings.set("azeroth-rpg", ANIMATION_HIDDEN_SETTING, cleanKeyMap(map));
}

export function registerSettings() {
  // WORLD, not client (2026-09-07). Where a generator remembers its folder in
  // the browser, a second GM — or the same GM in another browser, or after the
  // storage is cleared — remembers nothing and makes a SECOND folder of the
  // same name, so the things generated before appear to have left theirs. The
  // folder a world puts its generated documents in is the world's fact.
  game.settings.register("azeroth-rpg", GENERATOR_FOLDER_SETTING, {
    name: "NPC generator folder",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register("azeroth-rpg", LOOT_FOLDER_SETTING, {
    name: "Loot generator folder",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  // WORLD, and the FIRST setting here that is neither a string nor silent.
  // Who holds a province is the world's fact, not a browser's, and a GM's
  // change has to reach every player: a world setting is a real Setting
  // document, so `update` broadcasts and `onChange` runs on EVERY client.
  // That is the whole synchronisation story — no socket, no query.
  game.settings.register("azeroth-rpg", MAP_STATE_SETTING, {
    name: "World map",
    scope: "world",
    config: false,
    type: Object,
    default: emptyState(),
    // Matched by NAME rather than by importing the class: `world-map.mjs`
    // imports this module for `mapState`, and importing it back would make a
    // cycle whose other half reads `foundry` at module scope.
    onChange: () => {
      for (const app of foundry.applications.instances?.values?.() ?? []) {
        if (app?.constructor?.name === "AzerothWorldMap") app.render();
      }
    }
  });

  // A client's own: opening a window at login is a preference, not a fact
  // about the world, and a GM should not decide it for a table.
  game.settings.register("azeroth-rpg", MAP_AT_LOGIN_SETTING, {
    name: "AZEROTH.Map.OpenOnLogin",
    hint: "AZEROTH.Map.OpenOnLoginHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  // WORLD (D-718): whether a token may be dragged further than the turn's
  // Half-Actions pay for. How strictly a table enforces 05 §10 is the table's
  // agreement, not a browser's preference, so one GM's switch settles it for
  // everybody - and a player must not be able to turn off the rule that
  // bounds their own drag.
  //
  // **`scope: "world"` IS the restriction.** `restricted` is a key core reads
  // on a settings MENU alone; for a setting the config window derives it -
  // `restricted = setting.scope === CONST.SETTING_SCOPES.WORLD`
  // (`client/applications/settings/config.mjs`, verified at 14.367) - so
  // writing `restricted: true` here would be a key nothing reads.
  game.settings.register("azeroth-rpg", MOVEMENT_LIMIT_SETTING, {
    name: "AZEROTH.Setting.MovementLimit.Name",
    hint: "AZEROTH.Setting.MovementLimit.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // WORLD (D-721): the find on offer is one fact the whole table is looking
  // at, and the window every invited player opens is drawn from it. The
  // Setting document is the synchronisation - `onChange` runs on EVERY client
  // for a create AND an update (`client/documents/setting.mjs`, verified at
  // 14.367) and carries the write's own `options`, so the listener can tell a
  // fresh offer from a claim on one.
  //
  // **A HOOK, NOT THE WINDOW CLASS.** The listener has to CONSTRUCT the
  // window, and importing an application here would make the cycle the world
  // map's `onChange` avoids by matching on a class name - only worse, since
  // the offer's window imports this module for `lootOffer`.
  game.settings.register("azeroth-rpg", LOOT_OFFER_SETTING, {
    name: "Loot on offer",
    scope: "world",
    config: false,
    type: Object,
    default: null,
    onChange: (value, options, userId) => Hooks.callAll("azerothLootOffer", cleanOffer(value), options, userId)
  });

  // THE ANIMATION LAYER (D-729, D-730). Three switches a reader owns and two
  // silent maps.
  //
  // The three are CLIENT settings: whether a screen shows pictures is that
  // reader's business, and photosensitivity, a slow machine and a preference
  // are all reasons one table's members differ. `requiresReload` is honestly
  // false on all three - the director reconciles on the settings hook, so
  // turning loops off ends them within 150 ms and turning them on plays them
  // back (CLAUDE.md §11).
  game.settings.register("azeroth-rpg", ANIMATIONS_SETTING, {
    name: "AZEROTH.Animation.Setting.Enabled.Name",
    hint: "AZEROTH.Animation.Setting.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => Hooks.callAll("azerothAnimationSettings")
  });

  game.settings.register("azeroth-rpg", ANIMATION_SOUNDS_SETTING, {
    name: "AZEROTH.Animation.Setting.Sounds.Name",
    hint: "AZEROTH.Animation.Setting.Sounds.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => Hooks.callAll("azerothAnimationSettings")
  });

  game.settings.register("azeroth-rpg", ANIMATION_LOOPS_SETTING, {
    name: "AZEROTH.Animation.Setting.Loops.Name",
    hint: "AZEROTH.Animation.Setting.Loops.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => Hooks.callAll("azerothAnimationSettings")
  });

  // WORLD (D-730): a GM's Stop is for everyone, so the fact lives where every
  // client can read it. The Setting document IS the synchronisation - the same
  // story as the offer of loot above - and the hook indirection is copied from
  // it so nothing here has to import an application.
  game.settings.register("azeroth-rpg", ANIMATION_STOPS_SETTING, {
    name: "Animations stopped for the table",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: value => Hooks.callAll("azerothAnimationStops", cleanKeyMap(value))
  });

  // CLIENT (D-730): a player's Hide is their own screen and nobody else's.
  game.settings.register("azeroth-rpg", ANIMATION_HIDDEN_SETTING, {
    name: "Animations hidden on this screen",
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: value => Hooks.callAll("azerothAnimationHidden", cleanKeyMap(value))
  });

  game.settings.register("azeroth-rpg", MIGRATION_KEY, {
    name: "Last migrated version",
    scope: "world",
    config: false,
    type: String,
    default: "0.0.0"
  });

  // Client-side: a player who wants the dice without the questions turns it
  // off, and a shift-click inverts whichever way it is set.
  game.settings.register("azeroth-rpg", ROLL_DIALOG_SETTING, {
    name: "AZEROTH.Setting.RollDialog.Name",
    hint: "AZEROTH.Setting.RollDialog.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      always: "AZEROTH.Setting.RollDialog.Always",
      skip: "AZEROTH.Setting.RollDialog.Skip"
    },
    default: "always"
  });
}

/**
 * Whether a drag is held to what the turn pays for (D-718).
 *
 * Guarded, because `preMoveToken` can fire from a macro or a test before the
 * setting is registered, and a movement refused by a missing setting would be
 * indistinguishable from the rule firing.
 */
export function movementLimited() {
  try {
    return game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING) !== false;
  } catch {
    return true;
  }
}

/**
 * Whether a roll should open its dialog: the setting, inverted by shift.
 * @param {Event|null} [event]
 */
export function shouldPrompt(event = null) {
  const skip = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING) === "skip";
  return skip === Boolean(event?.shiftKey);
}
