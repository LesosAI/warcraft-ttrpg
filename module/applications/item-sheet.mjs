/**
 * One ItemSheetV2 for all twelve subtypes (D2 §3).
 *
 * **Twelve bespoke sheets would be twelve places for the book's field order to
 * rot.** The order is already fixed by the chapters — 07 §9 for a spell, D4
 * §10.1 for an item, 03 §2 for a profession — and `check-spells.ps1` and
 * `check-equipment.ps1` hold the pages to it because the importer reads it in
 * order. So the sheet is driven by a declarative table in `item-fields.mjs`,
 * which is pure data and unit-tested against those same orders.
 *
 * Registering none at all was the state before this: all 1,339 compendium
 * documents are Items, and every one of them opened with core's default sheet,
 * which knows nothing about these DataModels.
 */

import { fieldsFor } from "./item-fields.mjs";
import { AZEROTH } from "../config.mjs";
import { castItemSpell, castWithDialog, signatureContext, useSignatureWithDialog } from "./actions.mjs";
import { hasSignature } from "../rules/signatures.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { coins, copperFrom } from "../helpers/coins.mjs";
import { applyAffixInPlace } from "./affix-dialog.mjs";
import { grantsOf } from "./actions.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import { baseTrait } from "../rules/bestiary.mjs";
// 08 §4's unidentified items and 08 §14's scrolls (D-1435, D-1436).
import { IDENTIFIABLE_TYPES, IDENTIFY_SCOPE, TRIED_FLAG, UNIDENTIFIED_FLAG, identifiable, isUnidentified } from "../rules/identify.mjs";
import { inscribeRefusal, inscription, isScroll, scrollDC, writtenDC } from "../rules/scrolls.mjs";
import { hiddenToViewer, kindNounOf, shownName } from "../helpers/identify-words.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class AzerothItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "sheet", "item"],
    position: { width: 520, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleDescription: AzerothItemSheet.#onToggleDescription,
      castSpell: AzerothItemSheet.#onCastSpell,
      forge: AzerothItemSheet.#onForge,
      castItemSpell: AzerothItemSheet.#onCastItemSpell,
      // The Signature pressed from the item's own sheet (08 §20, S3; D-692).
      useSignature: AzerothItemSheet.#onUseSignature,
      stepSpellUses: AzerothItemSheet.#onStepSpellUses,
      addTag: AzerothItemSheet.#onAddTag,
      removeTag: AzerothItemSheet.#onRemoveTag
    }
  };

  /** @inheritDoc */
  static PARTS = {
    // 08 §4 (D-1435): drawn ALONE for a viewer the item is hidden from, and never otherwise
    // (`_configureRenderParts`).
    unidentified: { template: "systems/azeroth-rpg/templates/item/unidentified.hbs" },
    header: { template: "systems/azeroth-rpg/templates/item/header.hbs" },
    details: { template: "systems/azeroth-rpg/templates/item/details.hbs" },
    spells: { template: "systems/azeroth-rpg/templates/item/spells.hbs" },
    description: { template: "systems/azeroth-rpg/templates/item/description.hbs" }
  };

  /** @inheritDoc */
  get title() {
    const type = game.i18n.localize(`TYPES.Item.${this.document.type}`);
    // The window's title is a surface too (08 §4): an unidentified thing is its kind.
    return `${shownName(this.document)} — ${type}`;
  }

  /**
   * **THE PARTS THIS VIEWER IS SHOWN** (08 §4; D-1435; the plan's default: *players get a disguised
   * read-only item sheet*). A player looking at a thing `hiddenFrom` keeps from them gets the
   * `unidentified` part alone; everybody else gets every other part. Asked at every render, so a
   * GM's toggle or a successful Identify switches an open sheet in place.
   * @inheritDoc
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const hidden = hiddenToViewer(this.document);
    for (const id of Object.keys(parts)) if ((id === "unidentified") !== hidden) delete parts[id];
    return parts;
  }

  /**
   * A partial render naming a part this viewer is not shown would name a part with no
   * descriptor; it renders every part this viewer IS shown instead.
   * @inheritDoc
   */
  _configureRenderOptions(options) {
    const asked = Array.isArray(options.parts) ? [...options.parts] : null;
    super._configureRenderOptions(options);
    const shown = Object.keys(this._configureRenderParts(options));
    const kept = (asked ?? options.parts ?? []).filter(id => shown.includes(id));
    options.parts = kept.length ? kept : shown;
    // **AND THE TITLE FOLLOWS THE FLAG** (D-1435): core retitles the window only when the NAME
    // changed (14.367 `DocumentSheetV2#_configureRenderOptions`), so a GM's toggle or a
    // successful Identify left *Longsword (unidentified)* on an open sheet that now shows the
    // truth. Every re-render of an open sheet takes the title from `get title` again.
    if (this.hasFrame && options.renderContext) options.window = { ...(options.window ?? {}), title: this.title };
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const editable = this.isEditable;
    // **A HIDDEN THING'S CONTEXT CARRIES ITS DISGUISE AND NOTHING ELSE** (08 §4; D-1435): no field,
    // prose, Signature or spell is composed for a viewer who may not see it.
    if (hiddenToViewer(item)) {
      return Object.assign(context, {
        item: null, system: null, editable: false,
        disguise: {
          name: shownName(item),
          img: item.img,
          rarityClass: rarityClass(item.system?.rarity),
          type: game.i18n.localize(`TYPES.Item.${item.type}`),
          kind: kindNounOf(item),
          quality: game.i18n.localize(AZEROTH.rarities?.[item.system?.rarity] ?? item.system?.rarity ?? "")
        }
      });
    }

    return Object.assign(context, {
      item,
      system: item.system,
      editable,
      // `owned` and `isGM` are what `lock` reads: a talent embedded on a
      // character is the player's to edit, and `taken` is the tree's to write
      // (D-713; the final review, 2026-09-13).
      fields: await this.#renderable(fieldsFor(item.type, item.system, {
        editable, labels: this.#derivedWords(),
        owned: Boolean(item.actor), isGM: Boolean(game.user?.isGM)
      })),
      // The book's own name for this document, so a reader can find the entry.
      provenance: item.system.source?.document ?? null,
      rarityClass: rarityClass(item.system?.rarity),
      // A SPELL AN ACTOR OWNS CAN BE CAST FROM HERE. `castSpell` had existed
      // and been tested since it was written and nothing had ever called it -
      // 406 spells in the packs and no way to cast one. D11's PARTS map names
      // no spells region on the character sheet, so this is the door that does
      // not require inventing a sixth tab.
      castable: item.type === "spell" && !!item.actor,
      // The Forge (D-633): a weapon, a suit or gear, by its owner.
      // A scroll is written by a dropped spell, never forged (08 §14; must-fix 4).
      forgeable: editable && ["weapon", "armor", "gear"].includes(item.type) && !item.getFlag("azeroth-rpg", "affix") && !isScroll(item),
      // **THE GM'S IDENTIFIED BOX** (08 §4; D-1435): drawn for a GM alone, on a thing whose quality
      // has a DC. Ticked is known. It carries the form name `azerothIdentified`, which
      // `_processFormData` turns into the flag, so the box never writes a document path itself.
      identifyToggle: Boolean(game.user?.isGM) && IDENTIFIABLE_TYPES.includes(item.type) && identifiable(item.system?.rarity),
      identified: !isUnidentified(item),
      spells: this.#itemSpells(),
      // **A RARE CARRIES A SIGNATURE** (D-686, and common since the Classic
      // conversion): the block used to require Epic or Legendary OR a stored
      // sentence, so a Rare whose Signature was costed inside its budget of 2
      // to 3 drew no block at all - 117 of them fire today - and a descriptor
      // with no prose beside it, which the Forge's seeder can make, had nowhere
      // to appear either.
      //
      // **AN EMPTY BLOCK IS AN INVITATION TO WRITE ONE, so it needs an editor.**
      // The rarity clause exists to open the ProseMirror on a thing §20 gives a
      // Signature to; on a LOCKED sheet - which is what the compendium browser
      // opens - it drew a heading with nothing under it, on 376 Epics already.
      // Adding Rare would have made that 1,203. So the block draws where there
      // IS a Signature, and otherwise only where somebody can write one.
      signatureShown: ["weapon", "armor", "gear"].includes(item.type)
        && (!!item.system.signature || hasSignature(item.system.signatureEffect)
          || (editable && ["rare", "epic", "legendary"].includes(item.system.rarity))),
      signatureHTML: await enrich(item.system.signature ?? "", { relativeTo: item, secrets: item.isOwner }),
      // WHAT THE SIGNATURE DOES, beside the sentence (08 §20, D-692): the kind,
      // the gate and whether it holds, the limit, and a Use control where there
      // is one to press. One shape over all three surfaces (S3).
      signature: signatureContext(item, item.actor ?? null),
      // A spell's and a talent's mechanics live in `effect` and the sheet
      // printed the lore alone (the lead, 2026-09-06: Rimeblood's sheet said
      // what it looked like and not what it did).
      effectShown: item.system.schema?.has?.("effect") === true,
      effectHTML: await enrich(item.system.effect ?? "", { relativeTo: item, secrets: item.isOwner }),
      // What a forged or affixed item grants, read off its flags (08 §6).
      grants: grantsOf(item),
      // ProseMirror only: TinyMCE was removed entirely in V14.
      descriptionHTML: await enrich(item.system.description, { relativeTo: item, secrets: item.isOwner })
    });
  }

  /**
   * Every word a DERIVED line prints, localised.
   *
   * `item-fields.mjs` composes those lines and is pure, so it cannot reach
   * `game.i18n` (CLAUDE.md §11); it takes the words instead. Each enum comes
   * off `CONFIG.AZEROTH` rather than being restated here, so a kind added to
   * the config appears on the sheet with nothing else to change (§4).
   */
  #derivedWords() {
    const enumWords = key => Object.fromEntries(
      Object.entries(AZEROTH[key] ?? {}).map(([k, v]) => [k, game.i18n.localize(typeof v === "string" ? v : (v?.label ?? k))])
    );
    return {
      ...enumWords("locations"),
      encumbering: game.i18n.localize("AZEROTH.Item.Encumbering"),
      capacityWeight: game.i18n.localize("AZEROTH.Item.CapacityWeight"),
      capacityCount: game.i18n.localize("AZEROTH.Item.CapacityCount"),
      chargesOf: game.i18n.localize("AZEROTH.Item.ChargesOf"),
      chargesUnit: game.i18n.localize("AZEROTH.Item.ChargesUnit"),
      // What the thing costs the bags, and what it adds (05, 08 §11; D-735).
      bagSlotsTakes: game.i18n.localize("AZEROTH.Item.BagSlotsTakes"),
      bagSlotsTakesOne: game.i18n.localize("AZEROTH.Item.BagSlotsTakesOne"),
      bagSlotsNone: game.i18n.localize("AZEROTH.Item.BagSlotsNone"),
      bagSlotsAdds: game.i18n.localize("AZEROTH.Item.BagSlotsAdds"),
      bagSlotsCarries: game.i18n.localize("AZEROTH.Item.BagSlotsCarries"),
      bagSlotsWhy: Object.fromEntries(
        Object.keys(AZEROTH.holderReasons).map(k => [k, game.i18n.localize(AZEROTH.holderReasons[k])])
      ),
      // 08 §10's `1, one school`, while the school is unchosen (D-690). One
      // key a family, so no localised words are joined in JS (CLAUDE.md §11).
      awaiting: {
        spellpower: game.i18n.localize("AZEROTH.Item.SpellpowerAwaiting"),
        ward: game.i18n.localize("AZEROTH.Item.WardAwaiting")
      },
      hold: enumWords("holdKinds"),
      // Who makes it and what it is made of (D-1918, D-1958).
      craftedBy: game.i18n.localize("AZEROTH.Item.CraftedByLine"),
      craftedByMore: game.i18n.localize("AZEROTH.Item.CraftedByMore"),
      materialTier: game.i18n.localize("AZEROTH.Item.MaterialTier"),
      // A named Augment worth the tier's bonus (D-2152).
      augmentByTier: game.i18n.localize("AZEROTH.Item.AugmentByTier"),
      professions: enumWords("professions"),
      materialFamilies: enumWords("materialFamilies"),
      consumable: enumWords("consumableKinds"),
      action: enumWords("actions"),
      target: enumWords("useTargets"),
      goesOn: enumWords("coatingTargets"),
      afflictions: {
        cures: game.i18n.localize("AZEROTH.Afflictions.Cures"),
        carried: game.i18n.localize("AZEROTH.Afflictions.Carried"),
        notCarried: game.i18n.localize("AZEROTH.Afflictions.NotCarried"),
        damage: game.i18n.localize("AZEROTH.Afflictions.Damage"),
        fatigue: game.i18n.localize("AZEROTH.Afflictions.Fatigue"),
        poisoned: game.i18n.localize("AZEROTH.Afflictions.Poisoned"),
        baneAttack: game.i18n.localize("AZEROTH.Afflictions.BaneAttack"),
        baneCasting: game.i18n.localize("AZEROTH.Afflictions.BaneCasting"),
        halveHealing: game.i18n.localize("AZEROTH.Afflictions.HalveHealing"),
        beat: {
          turn: game.i18n.localize("AZEROTH.Afflictions.Beat.turn"),
          hour: game.i18n.localize("AZEROTH.Afflictions.Beat.hour")
        },
        statuses: enumWords("conditions")
      }
    };
  }

  /**
   * Resolve each descriptor into something a template can draw: `choices` names
   * a `CONFIG.AZEROTH` enum rather than inlining one, so a select can never
   * disagree with the config (CLAUDE.md §4).
   */
  async #renderable(fields) {
    const schema = this.document.system?.schema;
    return Promise.all(fields.map(async field => {
      const rendered = {
        ...field,
        name: `system.${field.path}`,
        label: game.i18n.localize(field.label),
        // On the descriptor, because the template reads it inside {{#each
        // fields}} where the context is the field: a bare {{editable}} there
        // was undefined on every sheet, and every select and number printed as
        // text while the checkboxes alone drew (2026-09-02, screenshot 5).
        // A derived figure is the model's, never a form field: it is read
        // off `prepareDerivedData` and shown as text on every sheet.
        //
        // **AND A LOCKED FIELD IS TEXT ON AN EDITABLE SHEET** (the final
        // review, 2026-09-13): `fieldsFor` has already judged `lock` against
        // the reader, so a talent's `taken` draws as a number nobody can type
        // into on the player's own copy while the GM's stays a box.
        editable: (field.type === "derived" || field.readOnly) ? false : this.isEditable,
        // Why it cannot be typed into, said in words rather than by the
        // absence of a box (CLAUDE.md §11: every string is a key). Only where
        // the lock HOLDS - the GM's own box would otherwise carry a tooltip
        // saying it is read-only while they type into it.
        hint: field.readOnly && field.hint ? game.i18n.localize(field.hint) : null
      };

      // A price is stored in copper and shown in the coin a shop would name
      // (08 §2, D-672). The input carries the mixed form so the GM edits what
      // they read; `_processFormData` puts copper back.
      if (field.type === "coin") rendered.display = coins(field.value);

      if (field.type === "select") {
        const enumeration = AZEROTH[field.choices] ?? {};
        rendered.options = Object.entries(enumeration).map(([value, config]) => ({
          value,
          // A string entry IS the i18n key; only an object carries one.
          label: game.i18n.localize(typeof config === "string" ? config : (config?.label ?? config?.name ?? value)),
          selected: value === field.value
        }));
        // A nullable choice - a class without Momentum, a spell with no
        // restriction - offers a dash, and `_processFormData` writes it back
        // as null, which the schema's `blank: false` would refuse as "".
        rendered.nullable = schema?.getField?.(field.path)?.nullable === true;
        if (rendered.nullable) {
          rendered.options.unshift({ value: "", label: "—", selected: field.value === null || field.value === undefined });
        }
        rendered.selectedLabel = rendered.options.find(o => o.selected && o.value !== "")?.label ?? null;
      }
      if (field.type === "tags") {
        // A tag drawn from an enum (a shot's Fits, D-641) is picked from the
        // enum and printed by its label; a free tag prints as typed.
        const enumeration = field.choices ? (AZEROTH[field.choices] ?? {}) : null;
        const labelOf = tag => (enumeration && enumeration[tag] !== undefined
          ? game.i18n.localize(typeof enumeration[tag] === "string" ? enumeration[tag] : (enumeration[tag]?.label ?? tag))
          : tag);
        rendered.tags = (Array.isArray(field.value) ? field.value : []).map(tag => ({ value: tag, label: labelOf(tag) }));
        if (enumeration) {
          rendered.options = Object.keys(enumeration)
            .filter(value => !(field.value ?? []).includes(value))
            .map(value => ({ value, label: labelOf(value) }));
        }
      }
      if (field.type === "table") {
        rendered.columns = field.columns.map(c => ({
          ...c,
          label: game.i18n.localize(c.label)
        }));
        // Every cell enriches (D-609): a branch or feature description is
        // prose with links in it, and the template prints it as HTML.
        const rows = Array.isArray(field.value) ? field.value : [];
        rendered.rows = await Promise.all(rows.map(async row => {
          const out = { ...row };
          for (const col of field.columns) {
            const v = row?.[col.path];
            if (typeof v === "string") out[col.path] = await enrich(v, { relativeTo: this.document });
          }
          return out;
        }));
      }
      return rendered;
    }));
  }

  /**
   * @inheritDoc
   *
   * A nullable select's dash submits as "", which a `blank: false` choice
   * field refuses. Written back as null, which is what the dash means.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    for (const select of form.querySelectorAll("select[data-nullable]")) {
      if (select.name && select.value === "") foundry.utils.setProperty(data, select.name, null);
    }
    // **THE IDENTIFIED BOX WRITES THE FLAG, AND ONLY WHEN IT MOVED** (08 §4; D-1435). Ticked is
    // known, written `false` and never unset (the architect's review, must-fix 1): an absent flag
    // is stamped on the next create. An untouched box writes nothing, so an edit to the name never
    // turns a legacy item's absent flag into a stored one. A player's form carries no such box.
    // **MOVED FROM WHAT WAS DRAWN, NOT FROM THE DOCUMENT NOW** (the Phase 3 review, S2): a GM's
    // sheet left open while a player identified the thing would otherwise read its unticked box as
    // *hide it* on the next unrelated submit. Ticking it also ends the tried mark (S3), as a
    // successful Identify does.
    const box = form.querySelector("input[data-identify-toggle]");
    delete data.azerothIdentified;
    // **AND ONLY AFTER THE GM TOUCHED IT** (the lead: *"ensure the toggle doesn't change by equipping or
    // unequipping"*): `_onRender` marks the box on its own `change`, so a submit that merely carries the
    // box - a name edit, an Equipped tick, a close - never reads a box a redraw or a restore left out
    // of step with the document as a click.
    if (box && game.user?.isGM && box.dataset.touched === "1" && box.checked !== (box.dataset.was === "true")) {
      foundry.utils.setProperty(data, `flags.${IDENTIFY_SCOPE}.${UNIDENTIFIED_FLAG}`, !box.checked);
      if (box.checked && this.document.getFlag(IDENTIFY_SCOPE, TRIED_FLAG) !== undefined) {
        foundry.utils.setProperty(data, `flags.${IDENTIFY_SCOPE}.${TRIED_FLAG}`, foundry.data.operators.ForcedDeletion.create());
      }
    }
    // **A GM CORRECTS A WRITTEN SCROLL'S TOTAL IN PLACE** (08 §14; D-1436): the input carries no
    // document path; a changed whole number at or above 0 rewrites the one entry it sits on.
    delete data.azerothWriterTotal;
    if (game.user?.isGM && isScroll(this.document)) {
      const spells = this.document.system.toObject().spells ?? [];
      let moved = false;
      for (const input of form.querySelectorAll("input[data-writer-total]")) {
        const entry = spells[Number(input.dataset.index)];
        const n = Math.trunc(Number(input.value));
        if (!entry || !Number.isFinite(n) || n < 0 || n === entry.writerTotal) continue;
        entry.writerTotal = n;
        moved = true;
      }
      if (moved) foundry.utils.setProperty(data, "system.spells", spells);
    }
    // A price is typed as it is printed - `2s 40c`, or a bare number of
    // copper - and stored in copper (08 §2, D-672). An empty box is no
    // price, which is what the dash on a locked sheet means; anything the
    // parser cannot read is left as it was rather than nulled, so a typo
    // never silently wipes a cost.
    for (const input of form.querySelectorAll("input[data-coin]")) {
      if (!input.name) continue;
      const typed = String(input.value ?? "").trim();
      if (!typed) { foundry.utils.setProperty(data, input.name, null); continue; }
      const copper = copperFrom(typed);
      if (copper === null) foundry.utils.setProperty(data, input.name, foundry.utils.getProperty(this.document, input.name));
      else foundry.utils.setProperty(data, input.name, copper);
    }
    return data;
  }

  /**
   * Cast the spell this sheet shows.
   *
   * Only ever reachable on an owned spell - an unowned one in a compendium has
   * no caster, and `castSpell` needs the actor for the Power spend and the
   * Spell DC.
   */
  static async #onCastSpell(event) {
    const spell = this.document;
    const actor = spell.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoCaster"));
      return;
    }
    // Through the dialog (Phase 3): DC, Overchannel, Augment, Boons and Banes.
    return castWithDialog(actor, spell, event);
  }

  /** The Forge window (D-633). */
  static async #onForge() {
    const { AzerothForge } = await import("./forge.mjs");
    if (!AzerothForge.forgeable(this.document)) return null;
    return new AzerothForge({ item: this.document }).render({ force: true });
  }

  /**
   * The spells this item casts (D-633), as rows: the DC it casts at or the
   * bearer's, the uses in hand, Cast where an actor holds it.
   */
  #itemSpells() {
    const item = this.document;
    const list = Array.isArray(item.system?.spells) ? item.system.spells : [];
    // An unidentified item's spells cannot be called on (08 §4; D-1435): no Cast is drawn, and
    // `locked` is there for the surface Phase 4 disguises.
    const locked = isUnidentified(item);
    const scroll = isScroll(item);
    return list.map((s, index) => {
      const max = s.uses?.max ?? 0;
      const value = s.uses?.value ?? 0;
      // **A WRITTEN SCROLL SAYS WHOSE TEST IT IS** (08 §14; D-1436): *Written at 17 (DC 12)*, and a
      // GM may correct the total in place. It is consumed by reading, never by its uses, so it
      // draws no uses and no stepper.
      const written = scroll && Number.isInteger(s.writerTotal);
      return {
        index, name: s.name,
        dcLabel: written
          ? game.i18n.format("AZEROTH.Scroll.WrittenAt", { total: s.writerTotal, dc: writtenDC(item) })
          : (s.dc != null ? game.i18n.format("AZEROTH.Sheet.ItemSpellDC", { dc: s.dc }) : game.i18n.localize("AZEROTH.Forge.BearersDC")),
        written,
        writerEditable: written && this.isEditable && Boolean(game.user?.isGM),
        limited: !written && max > 0, value, max, full: value >= max,
        perLabel: s.uses?.per ? game.i18n.localize(AZEROTH.usesPer?.[s.uses.per] ?? s.uses.per) : "",
        available: !locked && (max === 0 || value > 0),
        castable: !!item.actor && !locked,
        locked,
        // A written scroll's total (08 §14), for the surface; null on every other item.
        writerTotal: written ? s.writerTotal : null,
        steppable: !written && this.isEditable && max > 0
      };
    });
  }

  static async #onCastItemSpell(event, target) {
    const actor = this.document.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoCaster"));
      return null;
    }
    return castItemSpell(actor, this.document, Number(target.dataset.index), event);
  }

  /**
   * Press the Signature (08 §20, D-692). Only ever reachable on an owned item -
   * a Signature in the compendium has no bearer, and the gate, the pool and the
   * turn's budget are all the bearer's.
   */
  static async #onUseSignature(event, target) {
    const actor = this.document.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.NoBearer", { name: this.document.name }));
      return null;
    }
    // A Legendary's other button names its run's key (D-910).
    return useSignatureWithDialog(actor, this.document, event, target?.dataset?.press || null);
  }

  static async #onStepSpellUses(event, target) {
    const index = Number(target.dataset.index);
    const delta = Number(target.dataset.delta) || 0;
    const spells = foundry.utils.deepClone(this.document.system.toObject().spells ?? []);
    const entry = spells[index];
    if (!entry) return null;
    entry.uses.value = Math.max(0, Math.min(entry.uses.max ?? 0, (entry.uses.value ?? 0) + delta));
    return this.document.update({ "system.spells": spells });
  }

  static #onToggleDescription(event, target) {
    const body = target.closest(".azeroth-item__description")?.querySelector(".azeroth-item__prose");
    if (body) body.hidden = !body.hidden;
  }

  /* -------------------------------------------- */
  /*  Tags: traits, profession skills, access lists                           */
  /* -------------------------------------------- */

  /**
   * Add a tag to an array field. The input beside the chips carries no
   * `name`, so `submitOnChange` never submits it; Enter there and the +
   * button both land here.
   */
  async #addTag(path, value) {
    const tag = String(value ?? "").trim();
    if (!tag) return null;
    // A tag drawn from an enum takes only the enum's keys (D-641).
    const spec = fieldsFor(this.document.type, this.document.system).find(f => `system.${f.path}` === path);
    if (spec?.choices && !(tag in (AZEROTH[spec.choices] ?? {}))) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Item.TagNotAllowed", { name: this.document.name, tag, label: game.i18n.localize(spec.label) }));
      return null;
    }
    const current = foundry.utils.getProperty(this.document, path) ?? [];
    if (current.some(t => String(t).toLowerCase() === tag.toLowerCase())) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Item.TagDuplicate", { name: this.document.name, tag }));
      return null;
    }
    return this.document.update({ [path]: [...current, tag] });
  }

  static async #onAddTag(event, target) {
    const path = target.dataset.path;
    const input = target.closest(".azeroth-item__tag-add")?.querySelector(".azeroth-item__tag-input");
    const result = await this.#addTag(path, input?.value);
    if (result && input) input.value = "";
    return result;
  }

  static async #onRemoveTag(event, target) {
    const path = target.dataset.path;
    const tag = target.dataset.tag;
    const current = foundry.utils.getProperty(this.document, path) ?? [];
    return this.document.update({ [path]: current.filter(t => t !== tag) });
  }

  /**
   * Write a spell on this scroll (08 §14; D-1436): `inscribeRefusal`, then the writer's total
   * through a `DialogV2`, then `inscription`'s one update. Nothing is written on a refusal or a
   * dismissed dialog.
   */
  async #inscribe(spell) {
    const scroll = this.document;
    const refusal = inscribeRefusal({ scroll, spell, isGM: Boolean(game.user?.isGM) });
    if (refusal) {
      ui.notifications?.warn(game.i18n.format(`AZEROTH.Scroll.Refuse.${refusal.reason}`, {
        scroll: scroll.name, spell: spell.name ?? "", scrollTier: refusal.scrollTier ?? "", spellTier: refusal.spellTier ?? ""
      }));
      return null;
    }
    const prefill = scrollDC(spell);
    const total = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("AZEROTH.Scroll.Inscribe.Title", { spell: spell.name }) },
      classes: ["azeroth", "azeroth-inscribe-dialog"],
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Scroll.Inscribe.Prompt", { spell: spell.name, dc: prefill }))}</p>`
        + `<input type="number" name="total" value="${prefill}" min="0" step="1" autofocus>`,
      ok: {
        label: game.i18n.localize("AZEROTH.Scroll.Inscribe.Label"),
        callback: (ev, button) => {
          const n = Math.trunc(Number(button.form.elements.total.value));
          return Number.isFinite(n) && n >= 0 ? n : null;
        }
      },
      rejectClose: false
    });
    if (total === null || total === undefined) return null;
    // Judged again: the scroll may have been written while the dialog stood open.
    if (inscribeRefusal({ scroll: this.document, spell, isGM: Boolean(game.user?.isGM) })) return null;
    return this.document.update(inscription({
      scroll: this.document, spell, writerTotal: total,
      words: { scrollName: game.i18n.localize("AZEROTH.Scroll.Name") }
    }));
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    // A switch between the disguised part and the true ones leaves the other set in the DOM,
    // because core replaces only the parts it renders: those this viewer is not shown go.
    const shown = Object.keys(this._configureRenderParts(options));
    for (const stale of this.element.querySelectorAll("[data-application-part]")) {
      if (!shown.includes(stale.dataset.applicationPart)) stale.remove();
    }
    // The GM's Identified box is written only after the GM clicked it (`_processFormData`).
    for (const box of this.element.querySelectorAll("input[data-identify-toggle]")) {
      box.addEventListener("change", () => { box.dataset.touched = "1"; });
    }
    for (const input of this.element.querySelectorAll("input.azeroth-item__tag-input")) {
      input.addEventListener("keydown", async event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const result = await this.#addTag(input.dataset.path, input.value);
        if (result) input.value = "";
      });
    }
  }

  /**
   * An Item dropped on this sheet (core's `ItemSheetV2` takes only an
   * ActiveEffect there): a prefix or suffix affix applies IN PLACE, a trait
   * appends its name, anything else falls through to core.
   */
  async _onDropDocument(event, document) {
    // A sheet that shows only the disguise takes no drop (08 §4; D-1435): an affix, a trait or
    // anything else would write onto a thing whose fields this viewer is not shown.
    if (hiddenToViewer(this.document)) return null;
    if (document?.documentName !== "Item") return super._onDropDocument(event, document);
    const affix = document.getFlag?.("azeroth-rpg", "affix");
    if (affix?.kind === "prefix" || affix?.kind === "suffix") {
      return applyAffixInPlace(this.document, { id: document.id, ...affix });
    }
    // **A SPELL DROPPED ON A SCROLL WRITES IT** (08 §14; D-1436; the lead: *"The GM drops a spell
    // on a blank scroll's item sheet"*). Judged first and refused in words; then the writer's
    // total, asked of the GM with the spell's bare Casting DC prefilled; then ONE update.
    if (document.type === "spell" && isScroll(this.document)) return this.#inscribe(document);
    if (document.type === "trait" && ["weapon", "armor", "gear"].includes(this.document.type)) {
      // The pack names a rated trait with a placeholder (`Pierce X`); the tag takes the base (D-645).
      return this.#addTag("system.traits", baseTrait(document.name));
    }
    return super._onDropDocument(event, document);
  }
}
