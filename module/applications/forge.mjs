/**
 * The Forge (D-633): one window where a GM makes an item what the chapter
 * allows - the rarity, a prefix and a suffix (more on a Legendary), the grade
 * of an enchantment, a Signature, the spells the item casts and the Active
 * Effects it carries. `rules/forge.mjs` is the law and this is the form
 * around it; the summary prints every reason the book refuses, beside Apply.
 *
 * Opened from an item sheet's Forge button by the item's owner. The un-forged
 * base is stashed on the first Apply and every later one rebuilds from it, so
 * the price multiplier, a prefix's trait and the grants never compound (the
 * affix dialog's guard, kept - `flags.azeroth-rpg.generated` is shared).
 */

import { AZEROTH } from "../config.mjs";
import { affixOf } from "./affix-dialog.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import { attributeGradeOf, canGoOn, grantAtRarity } from "../rules/affixes.mjs";
import { SIGNATURE_KINDS, build, plan, spellCost } from "../rules/forge.mjs";
import {
  SIGNATURE_PHRASES, SIGNATURE_PHRASE_GROUPS,
  hasSignature, isPressable, seedSignature, signatureEffectOf, signatureSummary
} from "../rules/signatures.mjs";
import { htmlFromProse, proseFromHtml } from "../rules/prose.mjs";
import { coins } from "../helpers/coins.mjs";
import { bindPickers } from "./picker.mjs";
import { sectionTail } from "../rules/icons.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/forge.hbs";
const PHYSICAL = new Set(["weapon", "armor", "gear"]);
const NAMED = new Set(["epic", "legendary"]);
/** 08 §20 (D-686): a named Rare carries a Signature too, out of its own budget. */
const SIGNED = new Set(["rare", "epic", "legendary"]);

/** Kept as an export: the item sheet and the tests import the formatter from here. */
export { coins };

/**
 * The words behind a config key a summary line names - a condition, one of the
 * two refusal extras, the Bane a Signature cancels, or a Resilience. One
 * lookup rather than four branches at the call site, and a key with no entry
 * comes back as itself rather than as nothing.
 */
function labelForKey(key) {
  return AZEROTH.conditions[key] ?? AZEROTH.refusalExtras[key] ?? AZEROTH.cancellableBanes[key]
    ?? AZEROTH.resiliences[key] ?? key;
}

/**
 * A gate list in words, one string a clause (D-722). `workflows.mjs#gateWords`
 * is the same reading for the refusal notification; this one hands back the
 * list rather than a joined sentence, because the preview prints a clause a
 * line and the notification prints them in one run.
 */
function gateWords(gates) {
  return (gates ?? []).map(g => {
    const label = g?.kind ? AZEROTH.signatureGates[g.kind] ?? null : null;
    if (!label) return null;
    const kind = game.i18n.localize(label);
    return g.value ? game.i18n.format("AZEROTH.Signature.GateValue", { kind, value: g.value }) : kind;
  }).filter(Boolean);
}

export class AzerothForge extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge"],
    tag: "form",
    window: { title: "AZEROTH.Forge.Title", resizable: true },
    position: { width: 600, height: "auto" },
    form: { handler: AzerothForge.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      forgeAddSpell: AzerothForge.#onAddSpell,
      // Three doors the lead asked for (2026-09-07): a spell picked in the
      // compendium browser rather than typed, a Signature taken off 08 §20's
      // own named items, and an effect copied from anything the packs hold.
      forgeBrowseSpell: AzerothForge.#onBrowseSpell,
      forgeTakeSignature: AzerothForge.#onTakeSignature,
      forgeBrowseEffect: AzerothForge.#onBrowseEffect,
      forgeRemoveSpell: AzerothForge.#onRemoveSpell,
      forgeAddEffect: AzerothForge.#onAddEffect,
      forgeEditEffect: AzerothForge.#onEditEffect,
      forgeRemoveEffect: AzerothForge.#onRemoveEffect,
      forgeReset: AzerothForge.#onReset
    }
  };

  static PARTS = { body: { template: TEMPLATE } };

  constructor({ item, ...options } = {}) {
    super({ ...options, id: `azeroth-forge-${String(item?.uuid ?? "").replaceAll(".", "-")}` });
    this.item = item;
  }

  /** The form's state between renders. */
  #state = null;
  #affixes = null;
  #spellIndex = null;

  /** @inheritDoc */
  get title() {
    return game.i18n.format("AZEROTH.Forge.TitleFor", { name: this.item.name });
  }

  /** A weapon, a suit or gear, by its owner; never an affix document itself. */
  static forgeable(item) {
    return Boolean(item) && PHYSICAL.has(item.type) && item.isOwner && !item.getFlag?.("azeroth-rpg", "affix");
  }

  /** The current state (read-only), for the tests and the summary. */
  get state() {
    return this.#state ? foundry.utils.deepClone(this.#state) : null;
  }

  /* -------------------------------------------- */

  #signatures = null;
  #effectIndex = null;
  /** 02 §6's nine, for the class gate a Signature's own sentence may name. */
  #classNames = null;

  async #load() {
    if (!this.#classNames) {
      const pack = game.packs.get("azeroth-rpg.classes");
      this.#classNames = pack ? [...(await pack.getIndex())].map(e => e.name) : [];
    }
    if (!this.#affixes) {
      const pack = game.packs.get("azeroth-rpg.affixes");
      const docs = pack ? await pack.getDocuments() : [];
      this.#affixes = docs.map(affixOf).filter(a => a.kind === "prefix" || a.kind === "suffix");
    }
    if (!this.#signatures) {
      // 08 §20's own Signatures, so a GM can take one the book already wrote
      // instead of composing every one from nothing. Read across the three
      // equipment packs, deduplicated by text.
      //
      // Since D-685 the packs also hold the Classic finds, so this is
      // hundreds of Signatures rather than dozens and a row has to say WHERE
      // it came from: the instance, off the find's own two-part section.
      const seen = new Map();
      for (const id of ["azeroth-rpg.weapons", "azeroth-rpg.armor", "azeroth-rpg.gear"]) {
        const pack = game.packs.get(id);
        if (!pack) continue;
        for (const e of await pack.getIndex({ fields: ["system.signature", "system.signatureEffect", "system.source"] })) {
          const text = String(e.system?.signature ?? "").trim();
          const where = e.system?.source?.document === "Classic" ? sectionTail(e.system?.source?.section) : null;
          // THE DESCRIPTOR TRAVELS WITH THE SENTENCE. Taking one of 08 §20's
          // own Signatures used to copy the words and leave what they DO
          // behind, so Ashbringer's *doubled before Ward* arrived as prose on
          // an item that would never double anything. The hand-reviewed row is
          // better than any re-reading of the same sentence.
          if (text && !seen.has(text)) seen.set(text, { from: e.name, text, where, effect: e.system?.signatureEffect ?? null });
        }
      }
      this.#signatures = [...seen.values()].sort((a, b) => a.from.localeCompare(b.from));
    }
    if (!this.#effectIndex) {
      // Every effect the system holds, to copy: the conditions pack is the
      // whole of A1. `Add effect` made a BLANK one and nothing else, so every
      // effect had to be composed change by change (the lead, 2026-09-07).
      //
      // **THE CONDITIONS PACK IS THE ONLY ONE THAT HOLDS ANY** (D-681-shaped).
      // This used to call `getDocuments()` on talents, weapons, armor and gear
      // as well, on the belief that effects ride on items — a grep over
      // `packs-src` finds not one `effects:` in any of the fifteen packs, so
      // it loaded 2,749 documents to find zero, and 1,755 more since D-685.
      // The conditions pack holds real ActiveEffect documents (`!effects!`),
      // which is the branch below that ever fires.
      const out = [];
      for (const id of ["azeroth-rpg.conditions"]) {
        const pack = game.packs.get(id);
        if (!pack) continue;
        for (const doc of await pack.getDocuments()) {
          if (doc.documentName === "ActiveEffect") { out.push({ uuid: doc.uuid, name: doc.name, img: doc.img, from: null }); continue; }
          for (const fx of doc.effects ?? []) out.push({ uuid: fx.uuid, name: fx.name, img: fx.img, from: doc.name });
        }
      }
      this.#effectIndex = out.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (!this.#spellIndex) {
      const pack = game.packs.get("azeroth-rpg.spells");
      const index = pack ? await pack.getIndex({ fields: ["system.tier"] }) : [];
      this.#spellIndex = index
        .map(e => ({ uuid: `Compendium.azeroth-rpg.spells.Item.${e._id}`, name: e.name, tier: e.system?.tier ?? 1 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  /** The base the item is forged from: the stash of its first forging, else the item as it is. */
  get base() {
    const generated = this.item.getFlag("azeroth-rpg", "generated");
    if (generated?.base?.system) return foundry.utils.deepClone(generated.base);
    return { name: this.item.name, type: this.item.type, system: this.item.system.toObject() };
  }

  /** The state the window opens on: what the item already is. */
  #initialState() {
    const generated = this.item.getFlag("azeroth-rpg", "generated") ?? {};
    const sys = this.item.system;
    const prefixes = Array.isArray(generated.prefixes) ? generated.prefixes : (generated.prefix ? [generated.prefix] : []);
    return {
      rarity: sys.rarity ?? "common",
      name: this.item.name,
      prefixes: [...prefixes],
      suffix: generated.suffix ?? null,
      greater: Array.isArray(generated.greater) ? [...generated.greater] : [],
      signatureKind: generated.signatureKind ?? (sys.signature ? "alwaysOn" : null),
      // **THE BOX HOLDS PROSE, NOT HTML** (the lead, 2026-09-14). It loaded
      // `sys.signature` verbatim, so opening the Forge on any pack item showed
      // `<p>` and `<strong>` in a plain textarea and taught the GM to type
      // tags. `build` writes the paragraph back on Apply.
      signatureText: proseFromHtml(sys.signature ?? ""),
      // A Signature TAKEN off another item, with the descriptor it came with.
      // Held only while the text is still the text it came with: an edited
      // sentence is the GM's own and is read afresh by `seedSignature`. Kept
      // as PROSE too, so the comparison is prose against prose.
      signatureTaken: null,
      // The phrase guide is SHUT until it is asked for, and stays open once it
      // has been: every `[data-forge]` change re-renders the window, and a
      // panel opened to copy a phrasing out of would otherwise shut itself the
      // moment the box it was opened for was typed in (the creator's shelves,
      // 2026-09-06).
      phrasesOpen: false,
      spells: (sys.spells ?? []).map(s => ({
        uuid: s.uuid, name: s.name, tier: this.#tierOf(s.uuid), dc: s.dc ?? null, max: s.uses?.max ?? 1, per: s.uses?.per ?? null
      }))
    };
  }

  #tierOf(uuid) {
    return this.#spellIndex?.find(e => e.uuid === uuid)?.tier ?? 1;
  }

  /**
   * The descriptor a taken Signature brought with it, or null.
   *
   * **Only while the sentence is still the one it came with.** The moment the
   * GM edits a word, the hand-reviewed row may no longer describe what the box
   * says, and a descriptor that disagrees with its own prose is worse than
   * none - so the text is read afresh instead.
   */
  #takenEffect(state) {
    const taken = state?.signatureTaken ?? null;
    if (!taken) return null;
    return taken.text === (state.signatureText ?? "") ? taken.effect ?? null : null;
  }

  /** The state as the rule reads it. */
  #proposal(state = this.#state) {
    const byId = id => (id ? this.#affixes.find(a => a.id === id) ?? null : null);
    const effect = this.#takenEffect(state);
    const signature = state.signatureKind
      ? { kind: state.signatureKind, text: state.signatureText ?? "", effect }
      : (state.signatureText ? { kind: "alwaysOn", text: state.signatureText, effect } : null);
    return {
      base: this.base,
      rarity: state.rarity,
      prefixes: state.prefixes.map(byId).filter(Boolean),
      suffix: byId(state.suffix),
      greater: [...state.greater],
      signature,
      spells: state.spells.map(s => ({ ...s })),
      name: state.name,
      // WHAT THE SENTENCE WILL FIRE. `build` seeds the descriptor beside the
      // prose now (D-692), and a class gate needs the roster to read.
      classes: this.#classNames ?? []
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await this.#load();
    this.#state ??= this.#initialState();
    const s = this.#state;
    const base = this.base;
    const proposal = this.#proposal(s);
    const p = plan(proposal);
    const named = NAMED.has(s.rarity);
    const legendary = s.rarity === "legendary";

    const prefixPool = this.#affixes.filter(a => a.kind === "prefix" && canGoOn(a, base));
    const suffixPool = this.#affixes.filter(a => a.kind === "suffix" && canGoOn(a, base));
    // WHAT IT WILL GRANT ON THIS ITEM, not what §6's table lists (D-701). The
    // cost is the suffix's own rung and does not move; the rarity says what
    // the rung delivers, so an Epic's *of the Bear* reads `+3 Strength (1)`.
    // `grantAtRarity` is the identity on every other family, so one call
    // serves the prefix rows as well.
    const option = (a, selected) => ({
      id: a.id,
      label: `${a.name} · ${grantAtRarity(a.grants, s.rarity, attributeGradeOf(a))} (${a.cost})`,
      selected
    });

    const chosen = s.prefixes.map(id => this.#affixes.find(a => a.id === id)).filter(Boolean);
    const rows = legendary ? chosen.length + 1 : 1;
    const prefixRows = [];
    for (let i = 0; i < rows; i++) {
      const affix = chosen[i] ?? null;
      prefixRows.push({
        index: i,
        options: prefixPool.map(a => option(a, a.id === affix?.id)),
        affix,
        greaterAllowed: named && Boolean(affix?.enchantment),
        greater: affix ? s.greater.includes(affix.name) : false
      });
    }

    const perOptions = sp => Object.entries(AZEROTH.usesPer ?? {}).map(([value, label]) => ({
      value, label: game.i18n.localize(label), selected: value === sp.per
    }));

    return Object.assign(context, {
      item: { name: this.item.name, img: this.item.img, type: game.i18n.localize(`TYPES.Item.${this.item.type}`) },
      rarityClass: rarityClass(s.rarity),
      rarities: Object.entries(AZEROTH.rarities).map(([value, label]) => ({
        value, label: game.i18n.localize(label), selected: value === s.rarity
      })),
      named,
      legendary,
      name: named ? (s.name ?? "") : p.name,
      prefixRows,
      suffixOptions: suffixPool.map(a => option(a, a.id === s.suffix)),
      signature: {
        allowed: SIGNED.has(s.rarity),
        kinds: Object.entries(SIGNATURE_KINDS).map(([value, k]) => ({
          value, label: game.i18n.localize(k.label), cost: k.cost, selected: value === s.signatureKind
        })),
        kind: s.signatureKind,
        text: s.signatureText ?? "",
        // 08 §20's own and the Classic finds', to take rather than to retype.
        // The instance rides the short line and the search term, so a reader
        // can ask for *Blackrock Depths* among hundreds; the whole line is
        // clipped at the same 90 characters it always was, so the row cannot
        // grow past the box.
        catalogue: (this.#signatures ?? []).map(x => {
          const line = x.where ? `${x.where} · ${x.text}` : x.text;
          return {
            from: x.from, text: x.text, where: x.where ?? null,
            search: `${x.from} ${x.where ?? ""} ${x.text}`.toLowerCase(),
            short: line.length > 90 ? `${line.slice(0, 90).replace(/\s+\S*$/, "")}…` : line
          };
        }),
        catalogueSearch: s.signatureSearch ?? "",
        // WHAT THE SYSTEM READ IN THOSE WORDS (D-692). A GM writing a
        // Signature at the bench had no way at all to tell whether anything
        // would fire: `build` kept the sentence and discarded the kind, so the
        // item came out with prose and an empty descriptor however carefully
        // it was phrased. This is the same `seedSignature` Apply will stamp,
        // over the same text, so what the box says is what the item gets.
        preview: this.#preview(s.signatureText ?? "", this.#takenEffect(s)),
        // AND WHAT IT UNDERSTANDS BEFORE A WORD IS TYPED (the lead,
        // 2026-09-14: *can we add an explanation on the creator to show what
        // trigger words and phrases are possible?*). The preview answers after
        // the fact and says nothing about what COULD be written, so the
        // phrasing had to be guessed at and a wrong guess read as a blank
        // preview. Every row is run through the reader by
        // `rules/signature-phrases.test.mjs`, so the panel cannot go stale.
        phrases: AzerothForge.#phrases(),
        phrasesOpen: Boolean(s.phrasesOpen)
      },
      // Every effect the packs hold, to copy whole (2026-09-07).
      effectCatalogue: (this.#effectIndex ?? []).map(e => ({
        uuid: e.uuid, name: e.name, img: e.img, from: e.from,
        search: `${e.name} ${e.from ?? ""}`.toLowerCase()
      })),
      effectSearch: s.effectSearch ?? "",
      spells: {
        allowed: named,
        rows: s.spells.map((sp, index) => ({
          ...sp, index,
          cost: legendary ? null : spellCost(sp),
          perOptions: perOptions(sp)
        })),
        // Every spell in 07, filtered inside the window as the GM types (D-638).
        options: this.#spellIndex.map(e => ({
          uuid: e.uuid, name: e.name, search: e.name.toLowerCase(),
          line: game.i18n.format("AZEROTH.Picker.Tier", { tier: e.tier })
        })),
        search: s.spellSearch ?? ""
      },
      effects: this.item.effects.map(e => ({
        id: e.id, name: e.name, img: e.img,
        changes: e.system?.changes?.length ?? 0
      })),
      summary: {
        ok: p.ok,
        reasons: p.reasons,
        notes: p.notes,
        spent: p.spent,
        band: p.band ? `${p.band.lo}–${p.band.hi}` : null,
        price: coins(p.price),
        baseBudget: Number(base.system?.budget) || 0,
        name: p.name
      },
      editable: this.item.isOwner
    });
  }

  /**
   * THE PHRASINGS THE READER UNDERSTANDS, grouped for the help panel.
   *
   * `rules/signatures.mjs#SIGNATURE_PHRASES` is the table and its Vitest runs
   * every example below through `seedSignature`, so a row here is a phrase
   * that really fires. This end does nothing but localise and shelve: the
   * groups come out in `SIGNATURE_PHRASE_GROUPS`' fixed order and one with no
   * row is not drawn, so a group emptied upstream leaves no bare heading.
   *
   * Static, because it depends on nothing about the item.
   */
  static #phrases() {
    const rows = group => SIGNATURE_PHRASES.filter(p => p.group === group).map(p => ({
      example: game.i18n.localize("AZEROTH.Forge.Phrases.Example." + p.key),
      reads: game.i18n.localize("AZEROTH.Forge.Phrases.Reads." + p.key)
    }));
    return SIGNATURE_PHRASE_GROUPS
      .map(group => ({ group, label: game.i18n.localize("AZEROTH.Forge.Phrases.Group." + group), rows: rows(group) }))
      .filter(g => g.rows.length);
  }

  /**
   * The seeded descriptor, in words, for the box under the Signature text.
   *
   * It says three things and no more: what KIND the sentence turned out to be,
   * what it is GATED on, and one line for every part that will fire. A preview
   * with no lines is the honest answer that nothing was read - the sentence is
   * still prose on the item sheet, which is where an unread Signature belongs.
   *
   * **AND ONE BLOCK PER GATED SENTENCE** (D-722; the lead, 2026-09-14: a gate
   * covers *only its own sentence*). The top-level `gates` are the trunk's now,
   * so a GM who typed two sentences sees the ungated half's lines bare and the
   * gated half's under its own gate - which is the whole point of the panel,
   * since the confusion that raised this was reading one gate as the item's.
   */
  #preview(text, taken = null) {
    const written = String(text ?? "").trim();
    if (!written) return null;
    // The same answer Apply will stamp: the taken row where one is held, the
    // words read afresh otherwise - and read over THE HTML `build` will store,
    // not over what the box holds, so what the preview says is what the item
    // gets down to the last clause.
    const d = signatureEffectOf({ signatureEffect: taken })
      ?? seedSignature({ name: this.#state?.name ?? this.item.name, text: htmlFromProse(written) }, { classes: this.#classNames ?? [] });
    return {
      fires: hasSignature(d),
      pressable: isPressable(d),
      kindLabel: hasSignature(d) ? AZEROTH.signatureKinds[d.kind] ?? null : null,
      reason: !hasSignature(d) && d.reason ? AZEROTH.signatureReasons[d.reason] ?? null : null,
      gates: gateWords(d.gates),
      // THE BUTTON'S OWN GATE, where the sentence that presses is not the
      // sentence the trunk is gated on (D-722). Empty otherwise: `pressGates`
      // falls back to the trunk's list, which the line above already prints.
      pressGates: (d.useGates ?? []).length ? gateWords(d.useGates) : [],
      // **THE BRANCHES ARE IN HERE TOO** (D-722). `signatureSummary` opens each
      // gated sentence with a `GatedBy` line and then says what that sentence
      // does, so the preview needs no second shape and a family added to the
      // summariser reaches a branch and the trunk at once.
      lines: signatureSummary(d).map(line => this.#line(line))
    };
  }

  /**
   * One summary line, localised. A key INSIDE a line is localised before the
   * sentence is built, so the window never prints a raw config key at a player
   * (D-608's own rule).
   */
  #line(line) {
    return game.i18n.format(`AZEROTH.Signature.Summary.${line.code}`, {
      ...line.params,
      ...(line.params.type ? { type: game.i18n.localize(AZEROTH.damageTypes[line.params.type] ?? line.params.type) } : {}),
      ...(line.params.school ? { school: game.i18n.localize(AZEROTH.schools[line.params.school] ?? line.params.school) } : {}),
      ...(line.params.track ? { track: game.i18n.localize(AZEROTH.corruptionTracks[line.params.track] ?? line.params.track) } : {}),
      ...(line.params.pool ? { pool: game.i18n.localize(AZEROTH.poolTypes[line.params.pool] ?? line.params.pool) } : {}),
      ...(line.params.per ? { per: game.i18n.localize(AZEROTH.usesPer[line.params.per] ?? line.params.per) } : {}),
      ...(line.params.key ? { key: game.i18n.localize(labelForKey(line.params.key)) } : {}),
      // A `GatedBy` line carries its clauses as they are stored, because this
      // module is pure and `AZEROTH.signatureGates` is a table of lang keys.
      ...(line.params.gates ? { gates: gateWords(line.params.gates).join(" · ") } : {})
    });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-forge]")) {
      el.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }
    bindPickers(this.element);
    // The phrase guide's own state, recorded and NEVER re-rendered on: the
    // `<details>` toggles itself, and a render here would fight the click that
    // opened it. The creator's shelves are the same shape (2026-09-06).
    const phrases = this.element.querySelector("details.azeroth-forge-phrases");
    phrases?.addEventListener("toggle", () => {
      if (this.#state) this.#state.phrasesOpen = phrases.open;
    });
  }

  /** Read the form into the state. Fields absent from the form keep their value. */
  #readForm() {
    const form = this.element;
    const s = this.#state;
    if (!form || !s) return;
    const el = name => form.elements?.[name] ?? null;
    if (el("rarity")) s.rarity = el("rarity").value;
    if (NAMED.has(s.rarity) && el("name")) s.name = el("name").value.trim() || s.name;
    const prefixes = [];
    for (const select of form.querySelectorAll("select[name^=prefix-]")) if (select.value) prefixes.push(select.value);
    s.prefixes = [...new Set(prefixes)];
    if (el("suffix")) s.suffix = el("suffix").value || null;
    if (el("spellSearch")) s.spellSearch = el("spellSearch").value;
    const greater = [];
    for (const box of form.querySelectorAll("input[name^=greater-]")) if (box.checked) greater.push(box.dataset.affixName);
    s.greater = greater;
    if (el("signatureKind")) s.signatureKind = el("signatureKind").value || null;
    if (el("signatureText")) s.signatureText = el("signatureText").value;
    if (el("signatureSearch")) s.signatureSearch = el("signatureSearch").value;
    if (el("effectSearch")) s.effectSearch = el("effectSearch").value;
    s.spells = s.spells.map((sp, i) => {
      const dc = el(`spell-dc-${i}`);
      const max = el(`spell-max-${i}`);
      const per = el(`spell-per-${i}`);
      return {
        ...sp,
        dc: dc ? (dc.value === "" ? null : Number(dc.value)) : sp.dc,
        max: max ? Math.max(0, Number(max.value) || 0) : sp.max,
        per: per ? (per.value || null) : sp.per
      };
    });
  }

  /* -------------------------------------------- */

  /**
   * Apply the state to the item. A partial `state` replaces what it names
   * (the tests drive the window this way); the form is read otherwise.
   * Resolves the plan, ok or not.
   */
  async apply(state = null) {
    await this.#load();
    this.#state ??= this.#initialState();
    if (state) this.#state = { ...this.#state, ...foundry.utils.deepClone(state) };
    const proposal = this.#proposal();
    const p = plan(proposal);
    if (!p.ok) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Forge.Refused", { reasons: p.reasons.join("; ") }));
      if (this.rendered) await this.render();
      return p;
    }
    const made = build(proposal);
    // What the item is doing right now is not the base's business.
    const current = this.item.system;
    for (const key of ["equipped", "offHand", "quantity"]) {
      if (key in made.system && current[key] !== undefined) made.system[key] = current[key];
    }
    const s = this.#state;
    await this.item.update({
      name: made.name,
      system: made.system,
      "flags.azeroth-rpg.grants": made.grants,
      "flags.azeroth-rpg.generated": {
        base: proposal.base,
        prefixes: [...s.prefixes],
        prefix: s.prefixes[0] ?? null,
        suffix: s.suffix,
        greater: [...s.greater],
        signatureKind: s.signatureKind,
        rarity: s.rarity
      }
    });
    ui.notifications?.info(game.i18n.format("AZEROTH.Forge.Applied", { name: made.name }));
    if (this.rendered) await this.render();
    return p;
  }

  static async #onSubmit() {
    this.#readForm();
    return this.apply();
  }

  /** A picker row names its spell by uuid; the typed term is the fallback for a call with no row. */
  static async #onAddSpell(event, target) {
    this.#readForm();
    const input = this.element.querySelector("input[name=spellSearch]");
    const wanted = (input?.value ?? "").trim().toLowerCase();
    const uuid = target?.dataset?.uuid;
    const entry = (uuid ? this.#spellIndex.find(e => e.uuid === uuid) : null)
      ?? this.#spellIndex.find(e => e.name.toLowerCase() === wanted)
      ?? (wanted.length > 2 ? this.#spellIndex.find(e => e.name.toLowerCase().startsWith(wanted)) : null);
    if (!entry) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Forge.NoSpell", { name: input?.value ?? "" }));
      return;
    }
    this.#state.spells.push({
      uuid: entry.uuid, name: entry.name, tier: entry.tier, dc: null, max: 1,
      // 08 §20 prices a tier 1 once per Short Rest and a tier 2 once per Long Rest.
      per: entry.tier >= 2 ? "long" : "short"
    });
    this.render();
  }

  static async #onRemoveSpell(event, target) {
    this.#readForm();
    this.#state.spells.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /**
   * Pick a spell in the compendium browser (D-645's pick mode).
   *
   * The typed picker stays beside it: it is faster once you know the name,
   * and the browser is what you want when you do not.
   */
  static async #onBrowseSpell() {
    this.#readForm();
    return game.system.azeroth.browser.browse({
      category: "spells",
      pick: {
        title: game.i18n.localize("AZEROTH.Forge.PickSpell"),
        onPick: async doc => {
          this.#state.spells.push({ uuid: doc.uuid, name: doc.name, tier: doc.system?.tier ?? 1, dc: null, value: 0, max: 0, per: null });
          await this.render();
        }
      }
    });
  }

  /**
   * Take one of 08 §20's own Signatures into the text box, WITH WHAT IT DOES.
   *
   * The descriptor rides along and Apply stamps it, so a GM who takes
   * Ashbringer's sentence gets Ashbringer's doubling rather than a re-reading
   * of the same words - which would lose every shape 08 §20 states in words
   * rather than in digits.
   */
  static async #onTakeSignature(event, target) {
    this.#readForm();
    const row = (this.#signatures ?? [])[Number(target.dataset.index)] ?? null;
    if (!row?.text) return;
    // The catalogue holds the pack's HTML; the box holds prose. BOTH halves
    // take the prose, or `#takenEffect`'s equality would compare the pack's
    // `<p>…</p>` against what the box shows and drop the hand-reviewed
    // descriptor the moment it was taken.
    const prose = proseFromHtml(row.text);
    this.#state.signatureText = prose;
    this.#state.signatureTaken = { text: prose, effect: row.effect ?? null };
    this.#state.signatureKind ??= "alwaysOn";
    return this.render();
  }

  /**
   * Copy an effect the system already holds onto this item.
   *
   * The changes come with it, so a GM adds *Slowed* rather than composing it;
   * `Add effect` still makes a blank one for anything the packs have not
   * already written.
   */
  static async #onBrowseEffect(event, target) {
    this.#readForm();
    const source = await fromUuid(target.dataset.uuid);
    if (!source) return;
    const data = source.toObject();
    delete data._id;
    await this.item.createEmbeddedDocuments("ActiveEffect", [{
      ...data, transfer: true, origin: this.item.uuid, disabled: false
    }]);
    return this.render();
  }

  static async #onAddEffect() {
    this.#readForm();
    const [effect] = await this.item.createEmbeddedDocuments("ActiveEffect", [{
      name: this.item.name, img: this.item.img, transfer: true, origin: this.item.uuid
    }]);
    effect?.sheet?.render({ force: true });
    this.render();
  }

  static async #onEditEffect(event, target) {
    this.item.effects.get(target.dataset.effectId)?.sheet?.render({ force: true });
  }

  static async #onRemoveEffect(event, target) {
    this.#readForm();
    await this.item.deleteEmbeddedDocuments("ActiveEffect", [target.dataset.effectId]);
    this.render();
  }

  /** Back to the base: the name, the numbers, no grants, no stash. */
  static async #onReset() {
    const base = this.base;
    await this.item.update({
      name: base.name,
      system: base.system,
      "flags.azeroth-rpg.-=generated": null,
      "flags.azeroth-rpg.-=grants": null
    });
    this.#state = null;
    ui.notifications?.info(game.i18n.format("AZEROTH.Forge.ResetDone", { name: base.name }));
    this.render();
  }
}
