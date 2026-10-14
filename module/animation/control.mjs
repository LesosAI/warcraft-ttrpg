/**
 * THE DOOR TO THE STOP WINDOW (D-730).
 *
 * **On the TOKEN controls, not on the system's own Measure group.** The
 * Measure control is registered only for a user who can create Regions
 * (`canvas/measure.mjs`), and a player who cannot must still be able to hide a
 * loop on their own screen - the whole point of D-730's second half. The token
 * controls are core's own and carry no such gate
 * (`client/canvas/layers/tokens.mjs#prepareSceneControls`, verified at
 * 14.367).
 *
 * **`button: true` runs `onChange` WITHOUT becoming the active tool**
 * (`SceneControls##onChangeTool`, `client/applications/ui/scene-controls.mjs`
 * verified at 14.367: a button tool calls `#onChange(tool, event, true)` and
 * returns, so the group's `onToolChange` - which releases every controlled
 * token - is never reached). Opening the window therefore costs the reader
 * nothing: their selection survives it.
 */

import { openAnimations } from "../applications/animations.mjs";

/** Register the tool. Call once, at init. */
export function registerAnimationControl() {
  Hooks.on("getSceneControlButtons", controls => {
    const tokens = controls?.tokens;
    if (!tokens?.tools) return;
    tokens.tools.azerothAnimations = {
      name: "azerothAnimations",
      // After core's own token tools, which run 1 to 8; a door added to
      // somebody else's group goes at the end of it.
      order: 90,
      title: "AZEROTH.Animation.Tool",
      icon: "fa-solid fa-wand-sparkles",
      button: true,
      onChange: () => openAnimations()
    };
  });
}
