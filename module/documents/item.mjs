import {prostheticWieldAllowed} from "../rules/prosthetics.mjs";
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
import { isHourglass } from "../rules/sand.mjs";
import { multiclassRefusal } from "../rules/multiclass.mjs";
// A Gadgets-compendium entry is a reference, never a sheet's (the lead, 2026-10-24).
import { isGadgetEntry } from "../rules/gadgets.mjs";
// A Services-compendium entry is bought and never carried (the lead: *"Add services to the compendium"*).
import { serviceRefusal } from "../rules/services.mjs";
import { ITEM_CUSTODY_PENDING_FLAG, isItemCustodyPending } from "../rules/item-custody-guard.mjs";
// The Sovereign's Claws are kept by Blood-Forged Claws and nothing else (02 §7; the San'layn and
// Sovereign plan, C1; D-1164): a write past the sync is refused in words at this seam.
import { CLAWS_FEATURE, CLAWS_SYNC, CLAWS_SYNC_KEY, clawsCreateRefusal, clawsUpdateRefusal } from "../rules/claws.mjs";
import { isClaws } from "../rules/unarmed.mjs";
// 08 §4's unidentified items (D-1435): the one stamp law.
import { IDENTIFY_SCOPE, UNIDENTIFIED_FLAG, arrivalFlag } from "../rules/identify.mjs";
import { hiddenToViewer, shownName, shownRefusalData as shownData } from "../helpers/identify-words.mjs";

/** Whether an operation is the claws' own sync (`AzerothActor#_syncClaws`). */
const clawsSync = operation => operation?.[CLAWS_SYNC_KEY] === CLAWS_SYNC;

/** The item subtypes that are THINGS. A talent, a spell or a class is never judged. */
const PHYSICAL = new Set(["weapon", "armor", "gear"]);

/**
 * Write `flags.azeroth-rpg.unidentified` on every pending document that arrives at a
 * character with no flag yet (08 §4; D-1435). The judgement is `arrivalFlag`'s alone: a
 * weapon, a suit or gear of Uncommon or higher arrives `true` (found), or `false` (known)
 * where the operation says `azerothIdentify: "known"`, or untouched where it says `"asIs"`.
 */
function stampUnidentified(documents, operation) {
  const parent = operation?.parent ?? null;
  const parentType = parent?.documentName === "Actor" ? parent.type : null;
  if (parentType !== "character") return;
  for (const doc of documents) {
    const source = doc._source ?? {};
    const flag = arrivalFlag({ type: doc.type, rarity: source.system?.rarity, flags: source.flags }, parentType, operation);
    if (flag === null) continue;
    doc.updateSource({ flags: { [IDENTIFY_SCOPE]: { [UNIDENTIFIED_FLAG]: flag } } });
  }
}

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

function custodyWriteAuthorized(operation, user) {
  return operation?.azerothItemCustody === "bypass" && user?.isGM === true && user.id === game.users?.activeGM?.id;
}

function custodyMarkerRequested(update) {
  const nested = update?.flags?.["azeroth-rpg"];
  if (nested && Object.hasOwn(nested, ITEM_CUSTODY_PENDING_FLAG) && nested[ITEM_CUSTODY_PENDING_FLAG]) return true;
  return Object.entries(update ?? {}).some(([key, value]) => key.endsWith(`flags.azeroth-rpg.${ITEM_CUSTODY_PENDING_FLAG}`) && value);
}

function refusePendingCustody() {
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Item.CustodyPending"));
}

/**
 * **A SPELL A CHARACTER LEARNS IS JUDGED BY 07 §4 AND §9** (the Necromancer plan's learning door;
 * the 4a review's MUST-FIX 4 and 5 and its SHOULD-FIX). Every spell created on a character in one
 * write: a player's is refused in words, spliced out of the batch with nothing written, where
 * `AzerothActor#learnVerdict` refuses it - no class the character holds learns it, its
 * prerequisite is not known or bars it, it is tier 5 and no tier 3 spell is known, or it is tier 5
 * at all (a tier 5 spell is the GM's to teach). A grant's `spellFrom` that names an item this
 * character does not hold is stripped before the judgement.
 *
 * **A GM's own write is the GM teaching** (the lead: *"learnable by the GM manually"*): it passes,
 * as 4a's door let a GM's macro pass. The GM's sheet drop asks *teach anyway* first
 * (`CharacterSheet#_onDropItem`) and then writes with the bypass.
 *
 * **The bypass is `operation.azerothLearn === "bypass"`** and a closed list holds it, as
 * `azerothBags` is held (`spell-access.test.mjs` scans `module/` for the word): the creator's
 * Finish (it judges its own picks), the feature and talent grants (`syncClassFeatures`, whose
 * `spellFrom` names the item that teaches), the sheet's *teach anyway*, the migrations and the
 * Quench fixtures.
 *
 * @returns {boolean} false where nothing is left to create
 */
function learnSpells(documents, operation, user) {
  if (operation?.azerothLearn === "bypass") return true;
  const actor = operation?.parent ?? null;
  if (actor?.documentName !== "Actor" || actor.type !== "character" || typeof actor.learnVerdict !== "function") return true;
  if (!documents.some(d => d.type === "spell")) return true;
  const gm = user?.isGM === true;
  const refused = [];
  const kept = [];
  for (const doc of documents) {
    if (doc.type !== "spell") { kept.push(doc); continue; }
    const data = doc.toObject();
    const verdict = actor.learnVerdict(data, { batch: [...kept.map(d => d.toObject()), ...documents.filter(d => d !== doc && d.type === "class").map(d => d.toObject())], gm });
    // A foreign `spellFrom` goes, so the spell is never withdrawn by a sync for an item it never had.
    if (verdict.strip) doc.updateSource({ flags: { "azeroth-rpg": { spellFrom: null } } });
    if (verdict.act === "allow" || (gm && verdict.act === "confirm")) { kept.push(doc); continue; }
    refused.push({ doc, text: verdict.text });
  }
  if (!refused.length) return true;
  for (let i = documents.length - 1; i >= 0; i -= 1) {
    if (refused.some(r => r.doc === documents[i])) documents.splice(i, 1);
  }
  for (const r of refused) if (r.text) ui.notifications?.warn(r.text);
  return documents.length > 0;
}

export class AzerothItem extends Item {
  /**
   * The item types still registered so that stale documents load, and never offered for a NEW
   * item: `career`, kept for one version after professions replaced careers (D-1903, D-1916).
   */
  static RETIRED_TYPES = Object.freeze(["career"]);

  /**
   * @inheritDoc
   *
   * Core's *Create Item* dialog lists every registered type; a retired one is left off it
   * (`RETIRED_TYPES`), whether the caller restricted the list or not.
   */
  static async createDialog(data = {}, createOptions = {}, options = {}, ...rest) {
    const retired = this.RETIRED_TYPES;
    const live = this.TYPES.filter(t => t !== CONST.BASE_DOCUMENT_TYPE && !retired.includes(t));
    const asked = (options.types ?? live).filter(t => !retired.includes(t));
    // A caller that asked for retired types alone gets the live list, never an empty one core refuses.
    return super.createDialog(data, createOptions, { ...options, types: asked.length ? asked : live }, ...rest);
  }

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
      // **A CREATION-ONLY CLASS NEVER MULTICLASSES, EITHER WAY** (the Chromatic
      // Champion plan; the lead: *"Creation only; no 2nd class."*). Asked of the class
      // items actually held, the one judgement `rules/multiclass.mjs` makes.
      const heldItems = actor.items.filter(i => i.type === "class" && i.id !== this.id)
        .map(i => ({ identifier: i.system?.identifier ?? "", name: i.name }));
      // **THE SECOND CLASS MUST BE ON THE RACE'S ROW** (02 §10; the lead, 2026-11-09:
      // *"The second class must be on your race's row in 02 §3, refused in words
      // otherwise."*), read off the race item the character holds.
      const raceItem = actor.items.find(i => i.type === "race") ?? null;
      const race = raceItem ? { identifier: raceItem.system?.identifier ?? "", name: raceItem.name, classes: raceItem.system?.classes ?? [] } : null;
      // A partner's name as the class pack prints it (the Necromancer's Warrior, Mage and Rogue).
      const classIndex = game.packs?.get("azeroth-rpg.classes")?.index ?? null;
      const nameOf = id => classIndex?.find?.(e => String(e.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") === id)?.name ?? null;
      const barred = multiclassRefusal(heldItems, { identifier: data.system?.identifier ?? this.system?.identifier ?? "", name: data.name ?? this.name }, { race, nameOf });
      if (barred) {
        ui.notifications?.warn(game.i18n.format(barred.reason, { name: barred.name, race: barred.race ?? "", partners: barred.partners ?? "" }));
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.LootOffer.UnderOffer", { name: shownName(data) }));
      return false;
    }
    // **A GADGETS-COMPENDIUM ENTRY IS NEVER A SHEET'S** (the lead, 2026-10-24). A gadget a
    // character knows is the feature the sync grants for Gadgeteer's pick or Mekkatorque's
    // Blueprint (`AzerothActor#_syncClassFeaturesNow`), keyed by the talent that knows it.
    // An entry dragged out of the browser would be a gadget with a use of its own and
    // nothing granting it - used once, and withdrawn as stale at the next sync. Refused on
    // every actor, in words, whatever the door: the entry's mark rides on the data, as an
    // offered find's does (`rules/gadgets.mjs#isGadgetEntry`).
    if (actor?.documentName === "Actor" && isGadgetEntry(data)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Gadget.EntryRefused", { name: data.name ?? "" }));
      return false;
    }
    // **A SERVICES-COMPENDIUM ENTRY IS NEVER A SHEET'S.** 08 §15's and §16's rows are paid
    // for and never carried: a night's lodging or a day's guide in a bag would take a bag
    // slot and be sold on. Refused on every actor, in words, whatever the door; a world
    // item with no actor is allowed (`rules/services.mjs#serviceRefusal`).
    const serviceRefused = serviceRefusal({ parent: actor, data });
    if (serviceRefused) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Service.EntryRefused", { name: data.name ?? "" }));
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
    // **THE CLAWS ARE AN UNARMED STRIKE IN THE OFF HAND** (02 §7; the plan's C1; D-1164):
    // never moved to the main hand, put in a bag, forged, coated or given an affix.
    if (this.type === "weapon" && this.parent?.documentName === "Actor" && isClaws(this) && !clawsSync(options)) {
      const refused = clawsUpdateRefusal(changes);
      if (refused) {
        ui.notifications?.warn(game.i18n.format(refused, { name: this.name }));
        return false;
      }
    }
    const equipping=changes?.system?.equipped===true||changes?.["system.equipped"]===true;
    if(equipping&&this.actor&&!prostheticWieldAllowed(this.actor,{type:this.type,flags:this.flags,
      system:{...this.system,...changes.system}})){
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Prosthetic.HandRefused"));return false;
    }
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
    if (!custodyWriteAuthorized(operation, user) && documents.some(isItemCustodyPending)) {
      refusePendingCustody();
      return false;
    }

    // **07 §9's LEARNING DOOR, AT THE ONE SEAM EVERY CREATE PASSES** (the 4a review's SHOULD-FIX;
    // the lead on tier 5: *"Yes the tier 5 spells learned via tomes should be learnable by the GM
    // manually to the character"*). Judged here rather than in `_preCreateDescendantDocuments`,
    // which core runs AFTER the server has written the create (14.367
    // `client/documents/abstract/client-document.mjs:607-617`: *after descendant documents have been
    // created*) and so cannot refuse anything. This hook sees the whole batch, so a class or a
    // prerequisite created in the same write counts.
    if (!learnSpells(documents, operation, user)) return false;

    // **ONLY BLOOD-FORGED CLAWS MAKES THE CLAWS** (02 §7; the plan's C1; D-1164): a create of
    // the Sovereign's Claws on a character that is not the sync is refused in words - a
    // hand drag, a forged copy, a second set - unless the character holds the feature and no
    // claws yet (a GM putting back what was lost).
    if (!clawsSync(operation) && operation?.parent?.documentName === "Actor" && operation.parent.type === "character") {
      const actor = operation.parent;
      let held = actor.items.filter(i => i.type === "weapon" && isClaws(i)).length;
      const holdsFeature = actor.items.some(i => i.type === "feature" && i.name === CLAWS_FEATURE);
      for (let i = 0; i < documents.length; i += 1) {
        const doc = documents[i];
        if (doc.type !== "weapon" || !isClaws(doc)) continue;
        const refused = clawsCreateRefusal({ data: doc.toObject(), holdsFeature, held, sync: false });
        if (refused) {
          ui.notifications?.warn(game.i18n.format(refused, { name: doc.name ?? "" }));
          documents.splice(i, 1);
          i -= 1;
          continue;
        }
        held += 1;
      }
      if (!documents.length) return false;
    }

    // D-739, at every door and on every parent. On a CREATE every schema field
    // is present, so the law's `hasOwnProperty` reads the whole system object
    // exactly as it reads a change that names both.
    for (const doc of documents) {
      if (!PHYSICAL.has(doc.type)) continue;
      const extra = wornXorKept({}, doc._source?.system ?? {});
      if (extra) doc.updateSource({ system: extra });
    }

    // **A FOUND THING ARRIVES UNIDENTIFIED** (08 §4, *Unidentified items*; D-1435). Stamped
    // HERE, before the bags' early return, because the loot settle carries the bags' bypass
    // and must still be stamped. `rules/identify.mjs#arrivalFlag` is the law; the opt-out is
    // `azerothIdentify` and a closed list holds it (`identify-doors.test.mjs`).
    stampUnidentified(documents, operation);

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
        byReason.get(key).push(shownName(doc));
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
    if (!custodyWriteAuthorized(operation, user)
        && (documents.some(isItemCustodyPending) || (operation.updates ?? []).some(custodyMarkerRequested))) {
      refusePendingCustody();
      return false;
    }

    const actor = bagsActor(operation);
    if (!actor) return allowed;
    if (!documents.some(doc => PHYSICAL.has(doc.type))) return allowed;

    const updates = operation.updates ?? [];
    const verdict = judge(rowsOf(actor), baseOf(actor), updates);
    if (!verdict.ok) {
      sayRefusal(verdict.reason ?? REFUSALS.noRoom, shownData(actor, verdict.data));
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
    // **THE CLAWS GO WITH THE FEATURE, NEVER BY HAND** (02 §7; the plan's C1; D-1164): a
    // delete that is not the claws' sync and names them on a character is refused, whole
    // (core lets this hook cancel only the whole operation), and said in words.
    if (!clawsSync(operation) && operation?.parent?.documentName === "Actor" && operation.parent.type === "character") {
      const claws = documents.find(doc => doc.type === "weapon" && isClaws(doc)) ?? null;
      if (claws) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Claws.Refuse.Delete", { name: claws.name ?? "" }));
        return false;
      }
    }
    if (!custodyWriteAuthorized(operation, user) && documents.some(isItemCustodyPending)) {
      refusePendingCustody();
      return false;
    }

    const actor = bagsActor(operation);
    if (!actor) return allowed;
    const ids = documents.filter(doc => PHYSICAL.has(doc.type)).map(doc => doc.id);
    if (!ids.length) return allowed;

    const verdict = judgeDelete(rowsOf(actor), ids);
    if (!verdict.ok) {
      sayRefusal(verdict.reason ?? REFUSALS.deleteHolder, shownData(actor, verdict.data));
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

  /**
   * @inheritDoc
   *
   * **AN HOURGLASS TAKEN OUT OF THE RANGED SLOT TAKES THE SAND WITH IT** (D-848;
   * the lead: *"no hourglass no sand"*). Every unequip reaches this hook - the
   * sheet's Equip, a displacement, a move into a bag (`wornXorKept`) - because
   * each is an update to this document, so the one door is here and not at each
   * caller. `changed` is core's diff, so `equipped: false` in it is a change from
   * true. Run on the writing client alone, which owns the actor.
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user?.id) return;
    const equipped = changed?.system?.equipped;
    if (equipped === false && isHourglass(this)) this.actor?.emptySand?.();
  }

  /** @inheritDoc - an equipped Hourglass deleted leaves the slot too (D-848). */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (userId !== game.user?.id) return;
    if (this.system?.equipped === true && isHourglass(this)) this.actor?.emptySand?.();
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
