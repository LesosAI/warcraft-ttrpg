/**
 * One ItemSheetV2 for all twelve subtypes (D2 §3).
 *
 * **Twelve bespoke sheets would be twelve places for the book's field order to
 * rot.** The order is already fixed by the chapters — 07 §9 for a spell, D4
 * §10.1 for an item, 03 §2 for a career — and `check-spells.ps1` and
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
    header: { template: "systems/azeroth-rpg/templates/item/header.hbs" },
    details: { template: "systems/azeroth-rpg/templates/item/details.hbs" },
    spells: { template: "systems/azeroth-rpg/templates/item/spells.hbs" },
    description: { template: "systems/azeroth-rpg/templates/item/description.hbs" }
  };

  /** @inheritDoc */
  get title() {
    const type = game.i18n.localize(`TYPES.Item.${this.document.type}`);
    return `${this.document.name} — ${type}`;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const editable = this.isEditable;

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
      forgeable: editable && ["weapon", "armor", "gear"].includes(item.type) && !item.getFlag("azeroth-rpg", "affix"),
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
      consumable: enumWords("consumableKinds"),
      action: enumWords("actions"),
      target: enumWords("useTargets"),
      goesOn: enumWords("coatingTargets")
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
    return list.map((s, index) => {
      const max = s.uses?.max ?? 0;
      const value = s.uses?.value ?? 0;
      return {
        index, name: s.name,
        dcLabel: s.dc != null ? game.i18n.format("AZEROTH.Sheet.ItemSpellDC", { dc: s.dc }) : game.i18n.localize("AZEROTH.Forge.BearersDC"),
        limited: max > 0, value, max, full: value >= max,
        perLabel: s.uses?.per ? game.i18n.localize(AZEROTH.usesPer?.[s.uses.per] ?? s.uses.per) : "",
        available: max === 0 || value > 0,
        castable: !!item.actor,
        steppable: this.isEditable && max > 0
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
  static async #onUseSignature(event) {
    const actor = this.document.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Signature.NoBearer", { name: this.document.name }));
      return null;
    }
    return useSignatureWithDialog(actor, this.document, event);
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
  /*  Tags: traits, in-career skills, access lists                            */
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

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
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
    if (document?.documentName !== "Item") return super._onDropDocument(event, document);
    const affix = document.getFlag?.("azeroth-rpg", "affix");
    if (affix?.kind === "prefix" || affix?.kind === "suffix") {
      return applyAffixInPlace(this.document, { id: document.id, ...affix });
    }
    if (document.type === "trait" && ["weapon", "armor", "gear"].includes(this.document.type)) {
      // The pack names a rated trait with a placeholder (`Pierce X`); the tag takes the base (D-645).
      return this.#addTag("system.traits", baseTrait(document.name));
    }
    return super._onDropDocument(event, document);
  }
}
