/**
 * The hotbar (the lead, 2026-09-13): *"there is no way to make macros for
 * skills/spells/attacks."*
 *
 * **The system had no macro code at all.** Core's own `hotbarDrop` path makes
 * a macro that TOGGLES a document's sheet — right for a journal entry, useless
 * for a longsword — and nothing here intercepted it, so a player dragging a
 * weapon row onto the bar got a button that opened the item sheet. There was
 * no other door either: no context-menu entry, no `game.system.azeroth.macros`.
 *
 * This module needs a live `game`; the law is `rules/macros.mjs`, which is
 * pure and has its own Vitest. Three things it settles:
 *
 * - **Every press goes through the sheet's own doors** — `attackWithDialog`,
 *   `castWithDialog`, `useFeatureWithDialog`, `useGearWithDialog`,
 *   `useSignatureWithDialog`. A macro that reimplemented the swing would be a
 *   second path for every rule to be enforced at one door and missed at the
 *   other (the `useSignatureWithDialog` note in `actions.mjs` is the scar).
 * - **The ACTOR is resolved at the press, not saved into the macro.** A macro
 *   is pressed with a token selected, and the token is what the player means:
 *   the controlled token carrying the item wins, then `game.user.character`,
 *   then the uuid the macro was saved from. That is what makes one macro work
 *   for a party of two Rogues.
 * - **A refusal is said in words.** Every path that cannot run says which of
 *   the four things went wrong rather than doing nothing.
 */

import {
  attackWithDialog, castWithDialog, useFeatureWithDialog, useGearWithDialog, useSignatureWithDialog
} from "./applications/actions.mjs";
import { firstFreeSlot, kindOf, macroCommandFor, macroNameFor, macroReusable, matchItem } from "./rules/macros.mjs";

/** The flag every macro this module makes carries, so one can be found again. */
export const MACRO_FLAG = "macro";

/** Warn once, in the reader's own words. */
function refuse(key, data = {}) {
  ui.notifications?.warn(game.i18n.format(`AZEROTH.Macro.${key}`, data));
  return null;
}

/**
 * Which actor a macro press is about.
 *
 * In order, and each step is there for a reason:
 *
 * 1. **A controlled token whose actor holds the item.** The player selected
 *    it; that is the whole convention of a hotbar.
 * 2. **A controlled token at all**, where none of them holds it — so the
 *    refusal can name the actor rather than saying nothing found.
 * 3. **`game.user.character`**, the player's assigned character.
 * 4. **The uuid the macro was saved from**, which is what a GM pressing a
 *    macro for an NPC with nothing selected means.
 *
 * @param {{itemId?: string|null, itemName?: string|null, actorUuid?: string|null}} payload
 * @returns {Promise<Actor|null>}
 */
export async function actorForMacro({ itemId = null, itemName = null, actorUuid = null } = {}) {
  const controlled = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  const holding = controlled.find(a => matchItem(a.items, { itemId, itemName }));
  if (holding) return holding;
  if (controlled.length === 1) return controlled[0];
  const assigned = game.user?.character ?? null;
  if (assigned && matchItem(assigned.items, { itemId, itemName })) return assigned;
  if (actorUuid) {
    const doc = await fromUuid(actorUuid).catch(() => null);
    const actor = doc?.actor ?? doc ?? null;
    if (actor?.documentName === "Actor") return actor;
  }
  return assigned ?? controlled[0] ?? null;
}

/**
 * Press an item from the hotbar.
 *
 * **The kind is re-read from the ITEM, not trusted from the payload.** A card
 * is a record of a moment and so is a macro: a gear item whose Use was edited
 * away, or a weapon a GM forged a Signature onto, has moved under the button.
 * The saved kind is kept only as the fallback where the item says nothing.
 *
 * @param {{kind?: string, itemId?: string|null, itemName?: string|null, actorUuid?: string|null}} payload
 * @param {Event|null} [event]
 */
export async function useItem(payload = {}, event = null) {
  const { kind: saved = null, itemId = null, itemName = null } = payload ?? {};
  const actor = await actorForMacro(payload);
  if (!actor) return refuse("NoActor", { name: itemName ?? "" });
  if (!actor.isOwner) return refuse("NotYours", { name: actor.name });

  const item = matchItem(actor.items, { itemId, itemName });
  if (!item) return refuse("NoItem", { name: itemName ?? "", actor: actor.name });

  const kind = kindOf(item) ?? saved;
  switch (kind) {
    case "attack": return attackWithDialog(actor, item, event);
    case "cast": return castWithDialog(actor, item, event);
    case "feature": return useFeatureWithDialog(actor, item, event);
    case "gear": return useGearWithDialog(actor, item);
    case "signature": return useSignatureWithDialog(actor, item, event);
    default: return refuse("NoItem", { name: item.name, actor: actor.name });
  }
}

/**
 * Put an item on the hotbar.
 *
 * **A macro already made for this item is REUSED** rather than duplicated: a
 * player pressing *Save to hotbar* twice, or dragging the same row again,
 * would otherwise fill the Macro directory with copies of one button. Matched
 * on the flag, which carries the payload.
 *
 * The slot is the first empty one on **page 1** — the page the bar is showing
 * — and a full page says so rather than silently overwriting slot 1.
 *
 * @param {Item} item
 * @param {{actor?: Actor|null, slot?: number|null}} [options]
 * @returns {Promise<Macro|null>}
 */
export async function saveToHotbar(item, { actor = null, slot = null } = {}) {
  if (!item) return null;
  const owner = actor ?? item.parent ?? null;
  if (!kindOf(item)) return refuse("NoItem", { name: item.name, actor: owner?.name ?? "" });
  if (!game.user?.can("MACRO_SCRIPT")) return refuse("NoScripts");

  const command = macroCommandFor(item, { actorUuid: owner?.uuid ?? null });
  if (!command) return refuse("NoItem", { name: item.name, actor: owner?.name ?? "" });

  const page = game.user.getHotbarMacros(1);
  const free = slot ?? firstFreeSlot(page);
  if (!free) return refuse("PageFull");

  // The same macro, if one was made for this item before **and this user owns
  // it**. A second player saving the same weapon used to find the FIRST
  // player's macro — `canUserExecute` is LIMITED permission and core's default
  // ownership is NONE — and got a slot holding a button that refuses to run;
  // the `update` below would have been refused for the same reason. The rule
  // is `rules/macros.mjs#macroReusable` and this hands it the live half.
  const kind = kindOf(item);
  const existing = game.macros.find(m => macroReusable(
    { flag: m.getFlag("azeroth-rpg", MACRO_FLAG), isOwner: m.isOwner }, { itemId: item.id, kind }
  ));
  const macro = existing ?? await Macro.implementation.create({
    name: macroNameFor(item),
    type: "script",
    img: item.img,
    command,
    flags: { "azeroth-rpg": { [MACRO_FLAG]: { kind, itemId: item.id, itemName: item.name } } }
  });
  if (!macro) return null;
  // **A REUSED MACRO IS BROUGHT UP TO DATE.** The item may have been renamed,
  // re-iconed or moved to another actor since; a button that presses a name
  // the sheet no longer shows is the same fault in a different place.
  if (existing && (existing.command !== command || existing.name !== macroNameFor(item) || existing.img !== item.img)) {
    await existing.update({
      name: macroNameFor(item), img: item.img, command,
      [`flags.azeroth-rpg.${MACRO_FLAG}`]: { kind, itemId: item.id, itemName: item.name }
    });
  }
  await game.user.assignHotbarMacro(macro, free);
  ui.notifications?.info(game.i18n.format("AZEROTH.Macro.Saved", { name: macro.name, slot: free }));
  return macro;
}

/**
 * Intercept a row dragged onto the hotbar.
 *
 * Core calls `Hooks.call("hotbarDrop", this, data, slot)` and a `false` return
 * stops it making its own sheet-toggle macro (verified at 14.367,
 * `client/applications/ui/hotbar.mjs`). The handler is SYNCHRONOUS — core does
 * not await the hook — so the work is started and the hook returns `false`
 * immediately; that is core's own documented pattern for this.
 *
 * **Only a drop this system understands is intercepted.** A Macro, a journal
 * entry or an item that is not something to press falls through to core.
 */
export function registerHotbarDrop() {
  Hooks.on("hotbarDrop", (hotbar, data, slot) => {
    if (data?.type !== "Item" || !data.uuid) return true;
    // `fromUuidSync` answers for an owned item without a round trip; a
    // compendium item comes back as an index entry with no `system`, and
    // `kindOf` then says null and core keeps the drop.
    let item = null;
    try { item = fromUuidSync(data.uuid); } catch { item = null; }
    if (!item?.parent || !kindOf(item)) return true;
    // **THE HOOK IS SYNCHRONOUS AND THE SAVE IS NOT**, so a rejection here has
    // nobody to catch it: an unhandled promise rejection on a drop is a slot
    // that quietly stays empty and a red line in the console nobody reads.
    // Said in words instead (the final review, 2026-09-13).
    saveToHotbar(item, { actor: item.parent, slot: Number(slot) || null })
      .catch(err => ui.notifications?.error(err.message));
    return false;
  });
}
