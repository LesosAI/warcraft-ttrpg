/**
 * THE BAG PANELS AS THE SHEET DRAWS THEM (D-738, D-740).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * `rules/slots.mjs` is the LAW — what a thing takes, where it may go and what
 * is refused. This is the model laid on top of it: the order tiles stand in,
 * the wells a panel draws, what one press does and what the tooltip says.
 * Stored order is the SHEET's rule and the law knows nothing about it, which
 * is why the two files are separate.
 *
 * Three things everything below is written around:
 *
 * - **A PANEL DRAWS EXACTLY ITS CAPACITY.** A multi-slot thing is ONE tile
 *   followed by `size - 1` TAKEN wells, flowing linearly — a column span
 *   mis-packs (3, 3 and 2 in eight wells needs a third row) and a size of 6
 *   exceeds four columns anyway. A taken well never carries a second
 *   `data-item-id`, or every selector that finds a tile by id would find two.
 * - **EVERY TILE STANDS IN THE WELL THE LAW PUT IT IN** (the lead,
 *   2026-09-20). `slots.mjs#packPanel` is the only packer; nothing here
 *   decides where anything goes, and a GAP is drawn as a gap because the
 *   reader put it there. What is left over — a run too short, a bag that
 *   shrank — is the over row, as it always was.
 * - **NOTHING IS EVER HIDDEN.** What will not fit inside the wells is drawn in
 *   an OVER row with the count said in words, rather than dropped.
 * - **The words arrive in a bag** (D-677). This file composes every derived
 *   line and may not touch `game.i18n`, so the sheet hands `tipModel` its
 *   localised words exactly as `item-sheet.mjs` hands `item-fields.mjs` theirs.
 */

import { AZEROTH } from "../config.mjs";
import { capacityParts, isContainer } from "./containers.mjs";
import { hasUse } from "./consumables.mjs";
import { isMount, slotsIn } from "./slots.mjs";
import { FIGURE_SLOTS, isWornSlot } from "./worn.mjs";

/**
 * The gap between two stored `sort` values.
 *
 * **Core's own density, deliberately.** `CONST.SORT_INTEGER_DENSITY` is
 * 100000 and every core sidebar, folder and embedded collection sorts on that
 * scale; a system that picked its own would interleave badly with anything
 * core re-sorted, and a Quench test holds this to the constant so a core
 * change is seen rather than guessed at.
 */
export const SORT_STEP = 100000;

/**
 * The `sort` a newcomer takes: LAST, after everything the character already
 * holds.
 *
 * A create names no `sort` and the schema's initial is 0, so every new thing
 * would otherwise arrive at the FRONT of a list sorted by `sort` — and a
 * pickup landing above the pack the character has carried since level one
 * reads as a bug rather than as an ordering rule. Core does the same thing for
 * a sidebar drop.
 *
 * A collection whose largest `sort` is 0 (a fresh character, or a world that
 * never sorted anything) starts at one step, never at zero, so the next
 * newcomer after it is still behind.
 *
 * **It no longer decides where anything sits in a bag** (the lead,
 * 2026-09-20): that is `system.well`. This is the collection's own order, for
 * core's sidebar and for `slots.mjs#byPlace`'s ruling on which four
 * containers keep a place in the bar.
 *
 * @param {Iterable<{sort?: number}>} items  what is already held
 * @returns {number}
 */
export function nextSort(items = []) {
  let max = 0;
  for (const item of items ?? []) {
    const sort = Number(item?.sort);
    if (Number.isFinite(sort) && sort > max) max = sort;
  }
  return max + SORT_STEP;
}

/* -------------------------------------------- */
/*  Reading a row                                */
/* -------------------------------------------- */

const idOf = row => row?.id ?? row?._id ?? null;
const sysOf = row => row?.system ?? row ?? {};

/**
 * 08's own order: a weapon (§7), then a suit (§8), then gear (§9 onwards).
 *
 * Read off the chapter's own section order rather than invented, so the first
 * thing a Clean Up puts at the front of a bag is a weapon for the same reason
 * the book opens its catalogue with one.
 */
export const TYPE_ORDER = Object.freeze({ weapon: 0, armor: 1, gear: 2 });

/**
 * Rarity, BEST FIRST — WoW's own habit, and the useful one: the thing a
 * reader is looking for in a tidied bag is the epic, not the ninth torch.
 *
 * Read off `AZEROTH.rarities` and reversed, so a rung added to the config
 * lands here with nothing else to change; `bags.test.mjs` holds the two
 * together.
 */
export const RARITY_ORDER = Object.freeze([...Object.keys(AZEROTH.rarities)].reverse());

/** How far down the rarity list a row sits. An unknown or absent rarity is last. */
function rarityRank(row) {
  const at = RARITY_ORDER.indexOf((row?.system ?? row ?? {}).rarity);
  return at < 0 ? RARITY_ORDER.length : at;
}

/**
 * CLEAN UP BAGS' own order: **type, then rarity, then name** (the lead,
 * 2026-09-20), and then the id so no two tiles ever compare equal.
 *
 * The id is not decoration: an embedded collection's order is not stable
 * across a re-sync (CLAUDE.md §15), and without a total order two identical
 * torches would swap places between renders and a Clean Up would write
 * something every time it was pressed.
 *
 * **The stored `sort` is NOT part of it.** Where a thing sits in a bag is its
 * WELL now; `sort` is the collection's own order and says nothing a reader of
 * the Gear tab can see, so ordering a tidy by it would make the button's
 * result depend on the order things were picked up in.
 */
export function tidyCompare(a, b) {
  return (TYPE_ORDER[a?.type] ?? 9) - (TYPE_ORDER[b?.type] ?? 9)
    || rarityRank(a) - rarityRank(b)
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
    || String(idOf(a) ?? "").localeCompare(String(idOf(b) ?? ""));
}

/**
 * The ids the Equipped panel draws, in the PAPER DOLL's own order.
 *
 * The Overview tab reads head to wrist down the left, hands to trinkets down
 * the right, then the four held tiles; a second order for the same set would
 * read as a different set (D-687). Anything worn that no tile draws — a
 * second sword the figure parks in `alsoReady` — follows after it, so the
 * panel is never short of something the character is wearing.
 *
 * @param {object} figure  a `worn.mjs#figureSlots` result
 * @returns {string[]}
 */
export function slotOrder(figure) {
  const out = [];
  const push = item => {
    const id = idOf(item);
    if (id && !out.includes(id)) out.push(id);
  };
  for (const { slot, index } of FIGURE_SLOTS) {
    const held = figure?.[slot] ?? null;
    push(Array.isArray(held) ? held[index ?? 0] : held);
  }
  for (const item of figure?.alsoReady ?? []) push(item);
  return out;
}

/**
 * What one press on a tile does — the double-click, and the tooltip's hint.
 *
 * In WoW's own order of usefulness: a thing with a Use is drunk, a thing that
 * can be worn is worn, and everything else opens. **Every answer is a
 * REGISTERED action name**, because the handler looks it up in the sheet's own
 * `actions` map and an unregistered one is a silent no-op (application.mjs).
 */
export function primaryAction(row) {
  const sys = sysOf(row);
  if (row?.usable || hasUse(sys.use)) return "useGear";
  if (row?.equippable) return "toggleEquipped";
  return "openItem";
}

/**
 * The one text leaf a tile carries, or null.
 *
 * **ONE**, deliberately: a 44px well has room for a single corner badge, and
 * two would overprint each other — which `checkOverlap` reports and the eye
 * reads as a smudge. Everything else a row could say is in the tooltip and in
 * the inspector.
 */
export function badgeOf(row) {
  const n = Math.trunc(Number(sysOf(row).quantity));
  return Number.isFinite(n) && n > 1 ? n : null;
}

/**
 * The whole vocabulary of `kindOf`, `placeOf` and `blurbOf`.
 *
 * **The sheet builds its words bag off these**, rather than off whatever
 * happens to be in `lang/en.json`: a kind added below without a word lands in
 * the bag as `undefined` and the line simply is not drawn, which is exactly
 * the silent hole D-681 keeps finding. `bags.test.mjs` holds each function to
 * its own list, and `lang-unused.test.mjs` sees the literal prefix in the
 * sheet, so a retired word fails in Node.
 */
export const TILE_KINDS = Object.freeze([
  "weapon", "ammunition", "armor", "shield", "augment", "container", "consumable", "worn", "gear", "mount"
]);
export const TILE_PLACES = Object.freeze(["worn", "bar", "mount", "stable", "base", "container"]);
export const BLURB_KINDS = Object.freeze(["traits", "rating", "armor", "holdsCount", "holdsWeight"]);

/**
 * What KIND of thing this is, as a key the sheet localises.
 *
 * Colour is never the only carrier (D5): the tile's `aria-label`, the tooltip
 * and the inspector all say the kind and the rarity in WORDS, and this is
 * where the word comes from.
 */
export function kindOf(row) {
  const sys = sysOf(row);
  if (isMount(row)) return "mount";
  if (row?.type === "weapon") {
    return sys.isShot === true || (Array.isArray(sys.fits) && sys.fits.length) ? "ammunition" : "weapon";
  }
  if (row?.type === "armor") return sys.shield === true ? "shield" : "armor";
  if (sys.augment) return "augment";
  if (isContainer(sys.capacity)) return "container";
  if (hasUse(sys.use)) return "consumable";
  if (isWornSlot(sys.slot)) return "worn";
  return "gear";
}

/**
 * The ONE short line under a name: what the thing is carried FOR.
 *
 * Structured rather than a sentence, because this module is pure. A row with
 * nothing to say answers null and the tooltip prints one line fewer, rather
 * than an empty one.
 *
 * @returns {{kind: string, value: number|string, of?: string|null}|null}
 */
export function blurbOf(row) {
  const sys = sysOf(row);
  const traits = Array.isArray(sys.traits) ? sys.traits.map(String).filter(Boolean) : [];
  if (traits.length) return { kind: "traits", value: traits.join(", "), of: null };
  if (row?.type === "weapon" && sys.rating !== null && sys.rating !== undefined) {
    return { kind: "rating", value: sys.rating, of: null };
  }
  if (row?.type === "armor") return { kind: "armor", value: sys.armorPoints?.body ?? 0, of: null };
  const held = capacityParts(sys.capacity ?? null);
  if (held) return { kind: held.key === "count" ? "holdsCount" : "holdsWeight", value: held.n, of: held.of };
  return null;
}

/* -------------------------------------------- */
/*  The tooltip                                  */
/* -------------------------------------------- */

/**
 * Every key on a row that `tipModel` reads.
 *
 * It is a CONTRACT rather than documentation: `bags.test.mjs` hands the model
 * a Proxy and fails on any key read that is not named here, so a line added to
 * the tooltip off a field the sheet does not build is caught in Node rather
 * than rendering blank at the table.
 */
export const TIP_PATHS = Object.freeze([
  "name", "type", "system", "rarityClass", "bagLine", "coating", "usable"
]);

/** Fill `{name}` placeholders. The sheet's i18n does this; the bag carries the template. */
function fill(template, params = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

/**
 * The tooltip over one tile, as LINES the template prints one to an element.
 *
 * **Every word arrives localised** in `words` (D-677), because a pure module
 * may not reach `game.i18n`; every number is the row's own. A line with
 * nothing to say is left out rather than drawn empty, so the card is as tall
 * as it has something to say.
 *
 * **THE SAME CARD SERVES THE PAPER DOLL** (the lead, 2026-09-20): the Overview
 * tile is an icon-only socket now, so the tooltip is the only place its name,
 * its kind and its rarity are said. It passes `slot` — the localised slot
 * label — instead of a `place`, because everything on the figure is worn and
 * *Worn or held* on twenty tiles says nothing; a second tooltip composer would
 * be the thing that drifts.
 *
 * @param {object} row                                   one tile row
 * @param {{words: object, place: object, slot: string}} o
 * @returns {{name: string, rarityClass: string|null, lines: Array<{key: string, text: string}>}}
 */
export function tipModel(row, { words = {}, place = null, slot = null } = {}) {
  const sys = sysOf(row);
  const lines = [];
  const add = (key, text) => {
    const value = String(text ?? "").trim();
    if (value) lines.push({ key, text: value });
  };

  const kind = kindOf(row);
  // The rarity is the ITEM's, off `system`, wherever the row came from: the
  // sheet's own `rarityClass` is a CSS class and says nothing in words, and
  // colour is never the only carrier (D5).
  const rarity = sys.rarity ?? null;
  add("kind", [words.kind?.[kind], rarity ? words.rarity?.[rarity] : null]
    .filter(Boolean).join(" · "));
  add("bag", row?.bagLine);
  // WHICH SLOT IT IS WORN IN, on the figure. It stands where `place` stands on
  // the Gear tab and never beside it: a paper-doll tile has one answer to
  // *where is this* and it is the tile the reader is pointing at.
  add("slot", slot);

  if (place?.kind) {
    add("place", fill(words.place?.[place.kind], { name: place.name ?? "" }));
  }

  const weight = Number(sys.weight);
  if (Number.isFinite(weight) && weight > 0) add("weight", fill(words.weight, { n: weight }));
  const count = Math.trunc(Number(sys.quantity));
  if (Number.isFinite(count) && count > 1) add("count", fill(words.count, { n: count }));

  const blurb = blurbOf(row);
  if (blurb) {
    add("blurb", fill(words.blurb?.[blurb.kind], {
      value: blurb.value,
      of: blurb.of ? (words.hold?.[blurb.of] ?? blurb.of) : ""
    }));
  }

  const charges = sys.charges ?? null;
  if (charges && charges.max) {
    add("charges", fill(words.charges, {
      value: charges.value ?? 0, max: charges.max, unit: charges.unit ?? ""
    }));
  }
  if (row?.coating) add("coating", fill(words.coated, { name: row.coating }));
  if (row?.usable || hasUse(sys.use)) add("use", words.use);

  return { name: row?.name ?? "", rarityClass: row?.rarityClass ?? null, lines };
}

/* -------------------------------------------- */
/*  The panels                                   */
/* -------------------------------------------- */

/**
 * How many wells stand in a row.
 *
 * Four is WoW's own bag width and is what a 200px panel takes at 44px a tile.
 * **A FULL-WIDTH PANEL TAKES EIGHT** — the figure's and the mount's are drawn
 * across the whole tab, and four columns down one side of it left the other
 * half empty in the first shot (D-611). A panel past twenty-four wells is
 * drawn full width whatever it is, so the two rules answer alike.
 */
export function columnsFor(wells, { wide = false } = {}) {
  return wide || (Math.trunc(Number(wells)) || 0) > 24 ? 8 : 4;
}

/** The panels drawn across the whole tab rather than two to a row. */
const WIDE_KINDS = Object.freeze(["worn", "mount"]);

/**
 * The cells one panel draws: exactly `wells` of them, each tile standing in
 * the well the law put it in, and whatever would not lie down at all.
 *
 * **EVERY TILE CARRIES ITS OWN `well`** (the lead, 2026-09-20), so a gap a
 * reader left is drawn as a gap and the tiles never shuffle up to fill it.
 * `slots.mjs#packPanel` is what decided them; a tile whose `well` is null, out
 * of range or somehow taken goes to the over row rather than overwriting
 * anything — the ledger cannot produce one, and a caller building a panel by
 * hand gets an honest picture rather than a lost tile.
 *
 * **A TAKEN WELL WEARS ITS OWNER'S ICON, GHOSTED.** Every one of them drew the
 * same chain-link glyph, so a six-well suit that wrapped onto the next row was
 * indistinguishable from the rope beside it without hovering (the first loaded
 * shot, D-611). The icon is the owner's own `img` and nothing else: it is
 * decorative, it carries `alt=""` and `aria-hidden`, it is never draggable,
 * and it NEVER carries a second `data-item-id` — every `[data-item-id="X"]`
 * selector on the sheet would otherwise find two of it.
 *
 * **`wellKey` is the index as a STRING.** The template writes it into
 * `data-well`, and `{{#if 0}}` is false while `{{#if "0"}}` is true — so a
 * number would leave the first well of every panel with no attribute at all
 * and a drop there would name no well (D-738's one-key trap, one type along).
 *
 * @param {{wells: number, tiles: Array<object>}} panel  tiles carrying `well` and `size`
 * @returns {{cells: Array<object>, over: Array<object>}}
 */
export function wellMap(panel) {
  const wells = Math.max(0, Math.trunc(Number(panel?.wells)) || 0);
  const cells = Array.from({ length: wells }, (_, index) => ({ kind: "empty", index, wellKey: String(index) }));
  const over = [];
  for (const tile of panel?.tiles ?? []) {
    const size = Math.max(1, Math.trunc(Number(tile?.size)) || 1);
    const at = Number.isInteger(tile?.well) ? tile.well : -1;
    const free = at >= 0 && at + size <= wells
      && cells.slice(at, at + size).every(cell => cell.kind === "empty");
    if (!free) { over.push(tile); continue; }
    cells[at] = { kind: "tile", tile, id: idOf(tile), size, index: at, wellKey: String(at) };
    for (let i = 1; i < size; i += 1) {
      cells[at + i] = { kind: "taken", of: idOf(tile), img: tile?.img ?? null, index: at + i, wellKey: String(at + i) };
    }
  }
  return { cells, over };
}

/**
 * Every panel the Gear tab draws, in the order it draws them: Equipped first,
 * then the base pack, then the bar's containers in their own order, then the
 * mount.
 *
 * **Equipped is not a ledger panel**, because 05 and 08 §11 both say what is
 * worn and held takes no bag slot: it has no wells to run out of and no over
 * row, and it is assembled here so the template has one shape to draw.
 *
 * @param {object} led                 a `slots.mjs#ledger` result
 * @param {Array<object>} rows         one row per thing, carrying `system`
 * @param {{wornOrder?: string[]}} [o] the paper doll's order, from `slotOrder`
 */
export function buildPanels(led, rows = [], { wornOrder = [] } = {}) {
  const byId = new Map((rows ?? []).filter(Boolean).map(row => [idOf(row), row]));
  const panels = [];

  // ---- Equipped: what the figure draws, free, in the doll's order --------
  const order = [...(wornOrder ?? [])];
  const worn = [...(led?.worn ?? [])]
    .sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
    })
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(row => ({ ...row, size: 1 }));
  panels.push({
    key: "equipped", kind: "worn", containerId: null, free: true, wide: true,
    wells: worn.length, used: 0, freeWells: 0, over: 0, of: null, perWell: null, reason: null,
    tiles: worn,
    cells: worn.map((tile, index) => ({ kind: "tile", tile, id: idOf(tile), size: 1, index })),
    overTiles: [],
    columns: columnsFor(worn.length, { wide: true })
  });

  // ---- the ledger's own panels ------------------------------------------
  for (const panel of led?.panels ?? []) {
    // WHERE EACH ONE STANDS IS THE LAW'S ANSWER, read off `panel.places`; a
    // thing the law could not lay down carries a null well and is the over
    // row. The list is in well order so the over row keeps a stable order
    // too, with `tidyCompare` breaking the tie between two loose tiles.
    const placed = new Map((panel.places ?? []).map(p => [p.id, p]));
    const tiles = (panel.itemIds ?? [])
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(row => ({ ...row, size: slotsIn(row, panel), well: placed.get(idOf(row))?.well ?? null }))
      .sort((a, b) => (a.well ?? Number.MAX_SAFE_INTEGER) - (b.well ?? Number.MAX_SAFE_INTEGER)
        || tidyCompare(a, b));
    const { cells, over } = wellMap({ wells: panel.wells, tiles });
    const wide = WIDE_KINDS.includes(panel.kind);
    panels.push({
      key: panel.key, kind: panel.kind, containerId: panel.containerId, free: false, wide,
      wells: panel.wells, used: panel.used, freeWells: panel.free, over: panel.over,
      of: panel.of, perWell: panel.perWell, reason: panel.reason,
      tiles, cells, overTiles: over, columns: columnsFor(panel.wells, { wide })
    });
  }
  return panels;
}

/* -------------------------------------------- */
/*  Clean Up Bags                                */
/* -------------------------------------------- */

/**
 * CLEAN UP BAGS: every panel sorted by **type, then rarity, then name** and
 * packed to the FRONT with no gaps, exactly as the game does (the lead,
 * 2026-09-20).
 *
 * The answer is a well per tile — one judged batch the caller writes in a
 * single `updateEmbeddedDocuments`, so the door reads the whole arrangement
 * at once rather than judging each tile against a half-tidied bag.
 *
 * **A SECOND PRESS WRITES NOTHING**, which is what the button has to promise
 * or it is a control that always looks like it did something. The order is a
 * pure function of what the things ARE — never of where they are or of the
 * order they were picked up in — so a tidy bag tidies to itself.
 *
 * **What still will not fit is sent back to no position at all** (`well:
 * null`) rather than left claiming a well past the end of a shrunken bag: it
 * is the over row either way, and a null is the shape the law reads as *pack
 * me*, so **Make room** beside it can move it without fighting a stale claim.
 *
 * The Equipped panel is skipped: its order is the paper doll's (D-687) and it
 * has no wells at all.
 *
 * @param {Array<{free?: boolean, wells: number, tiles: Array<object>}>} panels
 * @returns {Array<{_id: string, system: {well: number|null}}>}
 */
export function tidyBags(panels = []) {
  const writes = [];
  for (const panel of panels ?? []) {
    if (panel?.free) continue;
    const wells = Math.max(0, Math.trunc(Number(panel?.wells)) || 0);
    const list = [...(panel?.tiles ?? [])].filter(Boolean).sort(tidyCompare);
    let at = 0;
    for (const tile of list) {
      const size = Math.max(1, Math.trunc(Number(tile?.size)) || 1);
      const held = Number.isInteger(tile?.well) ? tile.well : null;
      const want = at + size <= wells ? at : null;
      if (want !== null) at += size;
      if (held !== want) writes.push({ _id: idOf(tile), system: { well: want } });
    }
  }
  return writes;
}

/* -------------------------------------------- */
/*  The keyboard                                 */
/* -------------------------------------------- */

/** Which way each key moves, in cells. `null` is a jump rather than a step. */
const STEPS = Object.freeze({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: null, ArrowUp: null });

/**
 * The cell a key moves to, over one panel's well map.
 *
 * Only a TILE takes focus — an empty well and a taken well are furniture — so
 * a step that lands on one keeps going in the same direction until it finds a
 * tile or runs off the end. Home and End are the first and last tile.
 *
 * @param {Array<object>} cells  one panel's cells
 * @param {number} from          the index the focus is on
 * @param {string} key           a `KeyboardEvent.key`
 * @param {number} columns
 * @returns {number|null} the index to move to, or null where there is none
 */
export function gridStep(cells = [], from = 0, key = "", columns = 4) {
  const list = cells ?? [];
  const isTile = i => list[i]?.kind === "tile";
  if (key === "Home") {
    for (let i = 0; i < list.length; i += 1) if (isTile(i)) return i === from ? null : i;
    return null;
  }
  if (key === "End") {
    for (let i = list.length - 1; i >= 0; i -= 1) if (isTile(i)) return i === from ? null : i;
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(STEPS, key)) return null;
  const width = Math.max(1, Math.trunc(Number(columns)) || 1);
  const step = STEPS[key] ?? (key === "ArrowDown" ? width : -width);
  for (let i = from + step; i >= 0 && i < list.length; i += step) {
    if (isTile(i)) return i;
  }
  return null;
}
