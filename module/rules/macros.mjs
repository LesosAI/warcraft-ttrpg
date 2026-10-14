/**
 * Hotbar macros (the lead, 2026-09-13): *"there is no way to make macros for
 * skills/spells/attacks."* Pure, no Foundry imports (CLAUDE.md §3).
 *
 * **The system had no macro code at all.** Dragging a row from a sheet onto
 * the hotbar reached core's own `hotbarDrop` path, which makes a macro that
 * OPENS the item's sheet — not one that swings it — and there was no other
 * door. This module says what a macro over an owned item is; `module/macros.mjs`
 * is the half that needs a live `game`.
 *
 * Two rules worth stating, because both have bitten this repo already:
 *
 * - **A macro names the item, never the actor's copy of it by id alone.** The
 *   id is right for the actor it was saved from and wrong for the party's
 *   second Rogue, and a character re-made by the creator carries new ids for
 *   everything. `matchItem` takes the id FIRST and falls back to the name, so
 *   a macro dragged between two sheets still finds the right thing.
 * - **The command runs through the sheet's own doors.** `useItem` dispatches
 *   to `attackWithDialog` / `castWithDialog` / `useFeatureWithDialog` /
 *   `useGearWithDialog` / `useSignatureWithDialog`, so a macro cannot get past
 *   a refusal the row would have made. A macro that reimplemented the swing
 *   would be a second path for every rule to be enforced at one door and
 *   missed at the other.
 */

import { hasUse } from "./consumables.mjs";
import { isPressable, signatureEffectOf } from "./signatures.mjs";

/** The kinds a macro can carry, in the order `kindOf` tries them. */
export const MACRO_KINDS = Object.freeze(["attack", "cast", "feature", "gear", "signature"]);

/**
 * What pressing this item does, or null where nothing does.
 *
 * A talent is null on purpose: a talent is not pressed, it is TAKEN, and its
 * mechanics reach the sheet as a feature the sync grants (D-642) — which is
 * the thing worth a macro.
 *
 * @param {{type?: string, system?: object}|null} item
 * @returns {"attack"|"cast"|"feature"|"gear"|"signature"|null}
 */
export function kindOf(item) {
  if (!item) return null;
  const type = item.type;
  if (type === "weapon") return "attack";
  if (type === "spell") return "cast";
  if (type === "feature") return "feature";
  if (type === "gear" && hasUse(item.system?.use)) return "gear";
  // A Signature is the LAST resort, so a weapon with one still makes an attack
  // macro: 08 §20's named weapons are swung far more often than they are
  // pressed, and the context menu's Attack row is the door the reader knows.
  if (isPressable(signatureEffectOf(item))) return "signature";
  return null;
}

/**
 * The payload a macro carries, as plain JSON.
 *
 * `actorUuid` is a FALLBACK, never the first answer: a macro on the bar is
 * pressed with a token selected far more often than not, and the token is what
 * the player means. `module/macros.mjs#useItem` reads them in that order.
 *
 * @param {{id?: string, name?: string, type?: string, system?: object}} item
 * @param {{actorUuid?: string|null}} [options]
 * @returns {object|null} null where the item is not something to press
 */
export function macroPayloadFor(item, { actorUuid = null } = {}) {
  const kind = kindOf(item);
  if (!kind) return null;
  return {
    kind,
    itemId: item.id ?? null,
    itemName: item.name ?? "",
    actorUuid: actorUuid ?? null
  };
}

/**
 * The macro's command line.
 *
 * ONE LINE, and it names the public surface rather than importing anything:
 * a macro runs in core's own sandbox, where an `import` of a system path is
 * legal but silently breaks the moment the file moves. `game.system.azeroth`
 * is the surface `azeroth.mjs` publishes for exactly this.
 *
 * @param {object} item
 * @param {{actorUuid?: string|null}} [options]
 * @returns {string|null}
 */
export function macroCommandFor(item, { actorUuid = null } = {}) {
  const payload = macroPayloadFor(item, { actorUuid });
  if (!payload) return null;
  return `await game.system.azeroth.macros.useItem(${JSON.stringify(payload)});`;
}

/**
 * The first empty slot on a hotbar page, or null where the page is full.
 *
 * Takes `User#getHotbarMacros(page)`'s own shape — `[{slot, macro|null}]`,
 * verified at 14.367 — so the caller hands the core call straight in.
 *
 * @param {{slot: number, macro: object|null}[]} slots
 * @returns {number|null}
 */
export function firstFreeSlot(slots = []) {
  const free = (slots ?? []).find(entry => !entry?.macro);
  return free ? free.slot : null;
}

/**
 * The item a macro's payload means, out of what an actor holds.
 *
 * **The id first, the name second.** The id is exact where the macro was saved
 * from this actor; the name is what makes the same macro work on the party's
 * other Rogue, and on a character the creator re-made (every id changes). A
 * name matching two copies takes the first in id order, which is stable —
 * an embedded collection's order is not (CLAUDE.md §15).
 *
 * @param {Iterable<{id?: string, name?: string}>} items
 * @param {{itemId?: string|null, itemName?: string|null}} payload
 * @returns {object|null}
 */
export function matchItem(items, { itemId = null, itemName = null } = {}) {
  const all = [...(items ?? [])].filter(Boolean);
  if (itemId) {
    const exact = all.find(i => i.id === itemId);
    if (exact) return exact;
  }
  if (!itemName) return null;
  const named = all.filter(i => i.name === itemName).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return named[0] ?? null;
}

/**
 * The name a saved macro takes: the item's own, so the hotbar reads like the
 * sheet. Trimmed, and never empty — an unnamed macro is unfindable in the
 * Macro directory.
 */
export function macroNameFor(item) {
  return String(item?.name ?? "").trim() || "Azeroth";
}

/**
 * Whether an existing macro is the one to REUSE for this item.
 *
 * **A MACRO THE PRESSER DOES NOT OWN IS NOT A MACRO THEY CAN PRESS** (the
 * final review, 2026-09-13). `saveToHotbar` searched all of `game.macros` by
 * the flag alone, so a second player saving the same weapon found the FIRST
 * player's macro — `canUserExecute` is LIMITED permission and core's default
 * ownership is NONE — and got a hotbar slot holding a button that refuses to
 * run. The same predicate guards the *bring it up to date* `update` beside it,
 * which would have been refused too.
 *
 * The flag half is here, with a Vitest; `isOwner` is the caller's, because it
 * needs a live `game`.
 *
 * @param {{flag?: object|null, isOwner?: boolean}} macro  the macro's own
 *   `flags["azeroth-rpg"].macro` payload and whether this user owns it
 * @param {{itemId?: string|null, kind?: string|null}} want
 */
export function macroReusable({ flag = null, isOwner = false } = {}, { itemId = null, kind = null } = {}) {
  if (!isOwner || !flag) return false;
  if (!itemId || !kind) return false;
  return flag.itemId === itemId && flag.kind === kind;
}
