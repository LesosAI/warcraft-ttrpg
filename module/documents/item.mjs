/**
 * AzerothItem. Thin: the schemas and their `prepareDerivedData` do the work.
 *
 * **Except that the bag-slot rule is enforced HERE** (D-737). A rule enforced
 * at one door is enforced nowhere (D-686), and a character's bags are written
 * from at least eight: the Gear tab, the Overview figure's paper doll, the
 * compendium browser's pick, a sidebar drag, a macro, the creator, the loot
 * settle and every workflow that spends a charge. The Item document's own
 * pre-operation hooks are the one seam all eight pass through, so that is
 * where 08 §11's refusals live.
 *
 * **The batch seam is core's, and it is documented.** Verified against the
 * shipped source at 14.367:
 *
 * - `client/data/client-backend.mjs:117` calls
 *   `documentClass._preCreateOperation(documents, operation, user)` after every
 *   per-document `_preCreate`, and `:122` then assigns `operation.data =
 *   documents` — the same array — so SPLICING a document out of it is what
 *   stops it being created. `common/abstract/document.mjs:1042-1043` says
 *   exactly that: *modifications to pending documents must mutate the
 *   documents array or alter individual document instances using
 *   `updateSource`*.
 * - `client-backend.mjs:268-271` sets `operation.updates` before calling
 *   `_preUpdateOperation` at `:276`, and `common/abstract/document.mjs:1101`
 *   says updates are modified by mutating that array. Every entry is EXPANDED
 *   and already cleaned (`cleanData(..., {expand: true, partial: true})` at
 *   `:231`), and core re-cleans after `_preUpdate` at `:248`.
 * - `client-backend.mjs:413` sets `operation.ids` before
 *   `_preDeleteOperation` at `:418`; there the hook may only cancel the whole
 *   operation, which is what a refused delete does.
 * - Core does all of this itself in `client/documents/token.mjs:2224-2252`,
 *   including the index alignment of `documents` with `operation.updates`.
 *
 * **The bypass is `operation.azerothBags === "bypass"`** and exactly five
 * things hold it: the creator's Finish (the race arrives in the same batch as
 * the kit, so the hook would judge a goblin at Medium), the loot settle (a row
 * already approved may never be dropped), the migrations, a GM's explicit
 * macro, and **the sheet's write of a MERGE or a SPLIT the pure law has just
 * judged** (D-741) — where the character holds both stacks for one write and
 * this door, reading the panels honestly, would refuse the act `judgeMerge` or
 * `judgeSplit` has already approved. That last one is a judged exception and
 * not a hole, and `slots.test.mjs` scans the sheet for the word in any other
 * member. **Nowhere else, and never the fixtures.**
 */

import { wornXorKept } from "../rules/containers.mjs";
import { BASE_SLOTS, REFUSALS, admit, judge, judgeDelete } from "../rules/slots.mjs";
import { SORT_STEP, nextSort } from "../rules/bags.mjs";
// A find still on offer is taken from the loot window, never dragged (D-721).
import { underOffer } from "../rules/loot-offer.mjs";

/** The item subtypes that are THINGS. A talent, a spell or a class is never judged. */
const PHYSICAL = new Set(["weapon", "armor", "gear"]);

/**
 * The character whose bags this operation touches, or null.
 *
 * Three ways to answer null, and each of them matters: the bypass, a parent
 * that is not an Actor (a compendium create, a world item), and a creature —
 * 05 keeps 14's creatures in pounds, ten times over, so an NPC's Gear tab is
 * untouched by all of this.
 */
function bagsActor(operation) {
  if (operation?.azerothBags === "bypass") return null;
  const parent = operation?.parent ?? null;
  if (parent?.documentName !== "Actor" || parent.type !== "character") return null;
  return parent;
}

/**
 * The character's items as the pure law reads them: the stored data, the id,
 * and the one DERIVED field a judgement needs.
 *
 * `system.augment` is derived on the item from its section and its name
 * (D-674) and so is absent from `toObject()`, while `worn.mjs#displacedBy`
 * reads it to know that an Idol comes out of the off hand. Without it a
 * Shaman's drop would house nothing and the Augment would sit equipped beside
 * the shield that displaced it.
 */
function rowsOf(actor) {
  return actor.items.map(item => {
    const data = item.toObject();
    data.id = item.id;
    if (item.system?.augment) {
      data.system = { ...(data.system ?? {}), augment: item.system.augment };
    }
    return data;
  });
}

/** One pending document as a row, with the same derived field stamped. */
function rowOfPending(doc) {
  const data = doc.toObject();
  data.id = doc.id;
  if (doc.system?.augment) data.system = { ...(data.system ?? {}), augment: doc.system.augment };
  return data;
}

/** The base pack's wells, off the character's own derived summary. */
function baseOf(actor) {
  const base = Number(actor?.system?.bagSlots?.base);
  return Number.isFinite(base) ? base : BASE_SLOTS;
}

/** A refusal said in words, once. */
function sayRefusal(reason, data = {}) {
  ui.notifications?.warn(game.i18n.format(reason, data ?? {}));
}

export class AzerothItem extends Item {
  /**
   * @inheritDoc
   *
   * A THIRD CLASS IS REFUSED BEFORE IT EXISTS. `system.classes[]` holds two
   * (02 §10), and the veto has to sit on the item's own creation so that every
   * door - a sheet drop, a macro, a compendium import - meets the same rule.
   * Returning `false` cancels the creation; nothing is written and the actor
   * hook that links a class never sees it.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const actor = this.parent;
    if (data.type === "class" && actor?.type === "character") {
      const held = actor.system?.classes ?? [];
      if (held.length >= 2 && !held.some(c => c?.itemId === this.id)) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Sheet.ThirdClassRefused"));
        return false;
      }
    }
    // A FIND ON OFFER IS TAKEN FROM THE LOOT WINDOW, NEVER DRAGGED (D-721).
    // Presentation stamps OBSERVER on every offered item so the players can
    // READ it, and OBSERVER also lists it in their Items sidebar - so without
    // this a player could drag a find onto their own sheet and take it while
    // somebody else still held it in the window.
    //
    // The mark rides on the DATA rather than on the world document, which is
    // what makes every door meet it: `ActorSheetV2#_onDropItem` creates from
    // `item.toObject()` (14.367), so the offer's flag arrives here. The
    // settle's own embed carries `azerothLootSettle` and is the one exception.
    //
    // **`underOffer` IS THE ONE READER OF THE MARK** (`rules/loot-offer.mjs`),
    // because the character sheet has to ask the same question before it moves
    // anything: a drop on the paper doll puts away what the newcomer displaces
    // and THEN creates it, so an offered ring took the character's own ring off
    // and had nothing created in its place.
    if (actor?.documentName === "Actor" && underOffer(data) && options?.azerothLootSettle !== true) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.LootOffer.UnderOffer", { name: data.name ?? "" }));
      return false;
    }
    return allowed;
  }

  /**
   * @inheritDoc
   *
   * **WORN OR KEPT, NEVER BOTH** (D-739). 08 §11 and 05's *Speed and movement*
   * both say *what you wear and what you hold takes no bag slot*, and nothing
   * enforced it: a chain shirt could be equipped AND sit inside a backpack,
   * weighing nothing and drawn on the paper doll at the same time.
   *
   * `containers.mjs#wornXorKept` is the law and the extra field is merged into
   * the change itself rather than written afterwards, so the two land in ONE
   * write and no render ever sees the contradiction. Core hands this hook
   * EXPANDED changes (`cleanData(..., {expand: true, partial: true})`,
   * `client-backend.mjs:231`) and re-cleans whatever it gets back
   * (`:248-254`), so a nested `system` object is both what arrives and what may
   * safely be handed on.
   *
   * **`changes.system` is passed straight through**, not rebuilt key by key:
   * the law reads `hasOwnProperty` to tell *a write that does not name this
   * field* from *a write that names it false*, and an object built with both
   * keys always present would report every update as unequipping.
   *
   * Every parent, characters and creatures alike - and a world item too. It is
   * the document's own invariant, not a character's.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    if (PHYSICAL.has(this.type) && changes?.system && typeof changes.system === "object") {
      // **THE WHOLE STORED SYSTEM, not the two fields.** The law exempts a
      // nocked bundle, and it can only see one by reading `fits` and `rating`.
      const extra = wornXorKept(this.system ?? {}, changes.system);
      if (extra) changes.system = { ...changes.system, ...extra };
    }
    return allowed;
  }

  /**
   * @inheritDoc
   *
   * **A PICKUP WITH NO BAG SLOT IS REFUSED, IN WORDS** (08 §11, D-737).
   *
   * The batch is judged in order: the first that fit are created and ONE
   * warning names the rest, rather than refusing the whole drag or silently
   * losing it. A refused document is SPLICED OUT of `documents`, which is
   * core's documented way of saying no to one of a batch.
   *
   * Two things ride along, because this is the only place that sees a
   * newcomer before it exists: the worn-or-kept invariant (a create naming
   * both is taken to mean the figure) and the stored `sort`, which puts a new
   * thing LAST rather than at the front of a list sorted from zero (D-740).
   */
  static async _preCreateOperation(documents, operation, user) {
    const allowed = await super._preCreateOperation(documents, operation, user);
    if (allowed === false) return false;

    // D-739, at every door and on every parent. On a CREATE every schema field
    // is present, so the law's `hasOwnProperty` reads the whole system object
    // exactly as it reads a change that names both.
    for (const doc of documents) {
      if (!PHYSICAL.has(doc.type)) continue;
      const extra = wornXorKept({}, doc._source?.system ?? {});
      if (extra) doc.updateSource({ system: extra });
    }

    const actor = bagsActor(operation);
    if (!actor) return allowed;
    const things = documents.filter(doc => PHYSICAL.has(doc.type));
    if (!things.length) return allowed;

    const rows = rowsOf(actor);
    const verdicts = admit(rows, baseOf(actor), things.map(rowOfPending));

    let sort = nextSort(rows);
    const refused = [];
    things.forEach((doc, i) => {
      const verdict = verdicts[i] ?? null;
      if (verdict && verdict.ok === false) {
        refused.push({ doc, reason: verdict.reason });
        return;
      }
      const patch = {};
      // `verdict.judged` is the PLACEMENT: the panel it landed in, and — for a
      // holder that got no place in the bar — the fact that it is kept rather
      // than worn. A thing that is worn, in the bar, on the mount place or
      // nocked carries none, and is left exactly as it arrived.
      if (verdict?.judged) patch.system = { ...verdict.judged };
      if (!Number(doc._source?.sort)) { patch.sort = sort; sort += SORT_STEP; }
      if (Object.keys(patch).length) doc.updateSource(patch);
    });

    if (refused.length) {
      // Reverse, so each splice leaves the indices below it where they are.
      for (let i = documents.length - 1; i >= 0; i -= 1) {
        if (refused.some(r => r.doc === documents[i])) documents.splice(i, 1);
      }
      // **ONE WARNING, AND IT IS TRUE OF EVERY THING IN IT.** The first cut
      // printed `refused[0]`'s reason and then listed every name under it, so
      // a batch refused for two reasons said the wrong thing about the second
      // - a Barrel and a torch left behind together read as a full inventory
      // and a barrel that would not fit in it. Grouped by reason, the sentence
      // is true of each group and the notification is still ONE.
      //
      // A refusal's own placeholders are filled from the group's first name;
      // `admit` returns `noRoom` alone today, which carries none, and a named
      // refusal arriving later names one of them with the list beside it.
      const byReason = new Map();
      for (const { doc, reason } of refused) {
        const key = reason ?? REFUSALS.noRoom;
        if (!byReason.has(key)) byReason.set(key, []);
        byReason.get(key).push(doc.name ?? "");
      }
      const lines = [...byReason].map(([reason, names]) => game.i18n.format("AZEROTH.Bags.LeftBehindPart", {
        reason: game.i18n.format(reason, { name: names[0] ?? "" }),
        names: names.join(", ")
      }));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.LeftBehind", { lines: lines.join(" ") }));
      if (!documents.length) return false;
    }
    return allowed;
  }

  /**
   * @inheritDoc
   *
   * **EVERY WRITE IS JUDGED AGAINST THE RESULT, NEVER AGAINST THE CHANGE**
   * (D-737). `slots.mjs#judge` lays the whole batch down, houses whatever it
   * displaces and reads the panels' overflow before and after: no write may
   * increase it. That is what lets one batch empty a backpack and take it off,
   * or equip a fifth container by unequipping a fourth, while a quantity that
   * grew past its well is still refused.
   *
   * A refusal cancels the WHOLE operation and says so once. A success writes
   * each placement into the update it belongs to.
   */
  static async _preUpdateOperation(documents, operation, user) {
    const allowed = await super._preUpdateOperation(documents, operation, user);
    if (allowed === false) return false;

    const actor = bagsActor(operation);
    if (!actor) return allowed;
    if (!documents.some(doc => PHYSICAL.has(doc.type))) return allowed;

    const updates = operation.updates ?? [];
    const verdict = judge(rowsOf(actor), baseOf(actor), updates);
    if (!verdict.ok) {
      sayRefusal(verdict.reason ?? REFUSALS.noRoom, verdict.data ?? {});
      return false;
    }

    // **A PLACEMENT MAY NAME A DOCUMENT THIS BATCH IS NOT UPDATING.** A ring
    // displaced by the item sheet's own Equipped checkbox, or the contents of
    // a bag that was just put on, are housed by the same judgement and have to
    // travel with it - the overflow the rule just approved was measured with
    // them moved. They are matched BY ID rather than by index, because that is
    // what `judge` guarantees.
    for (const placement of verdict.placements ?? []) {
      if (!placement?._id) continue;
      const held = updates.find(u => (u?._id ?? u?.id) === placement._id) ?? null;
      if (!held) {
        updates.push({ _id: placement._id, system: { ...placement.system } });
        continue;
      }
      const system = held.system && typeof held.system === "object" && !Array.isArray(held.system)
        ? held.system
        : {};
      held.system = { ...system, ...placement.system };
    }
    return allowed;
  }

  /**
   * @inheritDoc
   *
   * **A WORN CONTAINER THAT STILL HOLDS THINGS IS NOT DELETED** (D-737):
   * deleting it would spill its contents into a base pack that may have no
   * room, and there would be nothing left to put them back in. A batch that
   * deletes the contents in the same breath passes.
   *
   * Core sets `operation.ids` BEFORE this hook and reads it after, so the only
   * answer available here is the whole operation (`client-backend.mjs:413`).
   */
  static async _preDeleteOperation(documents, operation, user) {
    const allowed = await super._preDeleteOperation(documents, operation, user);
    if (allowed === false) return false;

    const actor = bagsActor(operation);
    if (!actor) return allowed;
    const ids = documents.filter(doc => PHYSICAL.has(doc.type)).map(doc => doc.id);
    if (!ids.length) return allowed;

    const verdict = judgeDelete(rowsOf(actor), ids);
    if (!verdict.ok) {
      sayRefusal(verdict.reason ?? REFUSALS.deleteHolder, verdict.data ?? {});
      return false;
    }
    return allowed;
  }

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /** Whether this item is carried in a way that contributes to derived data. */
  get isEquipped() {
    return this.system?.equipped === true;
  }

  /**
   * Roll data for an item, with the owning actor's beneath it so a formula can
   * read `@prof` alongside the item's own fields.
   */
  getRollData() {
    const actorData = this.actor?.getRollData() ?? {};
    return { ...actorData, item: { ...this.system } };
  }
}
