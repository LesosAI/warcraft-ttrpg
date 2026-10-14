/**
 * The compendium browser (D2 §9).
 *
 * **Core already provides the frame.** `foundry.applications.api.CategoryBrowser`
 * is a two-pane ApplicationV2 with a built-in `SearchFilter`, a `category`
 * subtemplate and an async `_loadCategoryData()` that renders without blocking.
 * This is a subclass and a set of filter definitions, not an application.
 *
 * **The filters read `CONFIG.AZEROTH`** so they cannot drift from the enums:
 * add a school to config and it appears here, because nothing restates the
 * list.
 *
 * **Preset launches are what make it part of the sheet** rather than a separate
 * tool nobody opens — `browse({category, filters})` opens it narrowed, which is
 * how D11's Progress tab reaches a branch and a career's Exits row reaches that
 * career.
 */

import { AZEROTH } from "../config.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import { ITEM_FIELDS } from "./item-fields.mjs";
import { generateAffixedItem } from "./affix-dialog.mjs";

const { CategoryBrowser } = foundry.applications.api;

/**
 * One entry per category: which pack it reads, which document types it holds,
 * which index fields the filters need, and the filters themselves.
 *
 * `fields` matters for more than tidiness: `CompendiumCollection#getIndex`
 * only indexes what it is asked for, so a filter reading an unindexed field
 * silently matches nothing.
 */
// The category table lives in browser-categories.mjs so it can be unit-tested
// without the Foundry global.
//
// IMPORT AND RE-EXPORT, not `export { X } from`. The re-export form creates NO
// local binding, so the application below loses its `CATEGORIES` and fails at
// render with "CATEGORIES is not defined" — which no unit test can see, because
// this file cannot be imported outside Foundry at all.
import {
  CATEGORIES, NOT_BROWSABLE, summary,
  boundFrom, emptyFilterState, entryMatches, facetOptions, isActive, sortEntries, sortKeysFor
} from "./browser-categories.mjs";
export { CATEGORIES, NOT_BROWSABLE };

export class AzerothCompendiumBrowser extends CategoryBrowser {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "azeroth-compendium-browser",
    classes: ["azeroth", "azeroth-browser"],
    window: { title: "AZEROTH.Browser.Title", resizable: true },
    position: { width: 900, height: 720 },
    initialCategory: "talents",
    actions: {
      openEntry: AzerothCompendiumBrowser.#onOpenEntry,
      generateAffixed: AzerothCompendiumBrowser.#onGenerateAffixed,
      clearFilters: AzerothCompendiumBrowser.#onClearFilters
    },
    // The filters render INSIDE each category (category.hbs): core renders
    // the `filters` subtemplate once at the root, where no category's
    // choices are in scope - which is why the bar was empty (D-607).
    subtemplates: {
      category: "systems/azeroth-rpg/templates/browser/category.hbs",
      filters: null
    }
  };

  /**
   * Filters currently applied, keyed `"<category>|<id>"` - two categories
   * share `system.tier`, and a talent's tier is not a spell's.
   *
   * Each value is a state from `emptyFilterState()`: a SET of chosen values
   * rather than one, an `any`/`all` mode for the array filters, and a numeric
   * floor and ceiling for the ranges. It was one value per filter and a
   * `<select>` to choose it, so a reader could ask for Rare items or Epic ones
   * and never for both (the lead, 2026-09-07).
   */
  #active = new Map();

  /** Sort per category: `{key, dir}`. */
  #sort = new Map();

  /**
   * The text typed into ONE facet's own box, keyed like `#active`.
   *
   * A trait facet lists fifty-four names and a shelf facet thirty; a list that
   * long is not browsable, so the facet gets a box of its own that narrows the
   * options rather than the entries.
   */
  #facetQuery = new Map();

  /** The search's regex, or null for no query. */
  #query = null;

  /** Entries per category, loaded once and reused. */
  #entries = null;

  /**
   * Pick mode (D-645): `{title, onPick}`. A row's click hands its document
   * to the caller and closes the window instead of opening the sheet; the
   * drag stays.
   */
  #pick = null;

  /** @inheritDoc */
  get title() {
    return this.#pick?.title ?? super.title;
  }

  /** @inheritDoc */
  get _dataLoaded() {
    return this.#entries !== null;
  }

  /**
   * Open the browser narrowed to a category, optionally with filters already
   * applied. This is the entry point D11's Progress tab and a career's Exits
   * row use, and it is what keeps the browser part of the sheet.
   */
  static async browse({ category = "talents", filters = {}, pick = null } = {}) {
    const app = new this({ initialCategory: category });
    app.#pick = pick && typeof pick.onPick === "function" ? { title: pick.title ?? null, onPick: pick.onPick } : null;
    app.#active.clear();
    // The public contract is BY PATH - `browse({filters: {"system.school": "frost"}})`
    // is what the sheet's Add buttons and the Quench batches pass - while the
    // state is keyed by filter id. Translate here rather than making every
    // caller learn the ids.
    const defs = CATEGORIES[category]?.filters?.() ?? {};
    for (const [path, value] of Object.entries(filters)) {
      const id = Object.keys(defs).find(k => defs[k].path === path) ?? path;
      app.#active.set(`${category}|${id}`, { ...emptyFilterState(), values: new Set([String(value)]) });
    }
    await app.render({ force: true });

    // **`initialCategory` IS HONOURED ONCE PER SESSION AND IGNORED EVER AFTER.**
    // v14's `CategoryBrowser#configureTabs` writes the tab list onto the CLASS
    // and opens with `if (Object.keys(this.constructor.TABS).length) return;`
    // (client/applications/api/category-browser.mjs:197, verified at 14.367),
    // so the SECOND instance inherits the FIRST one's `initial` and every
    // `browse({category})` after the first opened whatever category happened to
    // come first. Asking for Gear showed Talents; the Overview tab's empty tile
    // (D-687), the Forge's spell pick, the NPC generator's trait pick and the
    // loot generator's all landed on the wrong shelf, and the sheet matrix
    // measured one category twelve times without noticing (2026-09-09).
    // Setting the tab after the render survives every later re-render, because
    // `tabGroups` is the instance's own.
    if (app.tabGroups?.categories !== category) app.changeTab(category, "categories");
    return app;
  }

  /**
   * The long-running half: read each pack's index once.
   *
   * `CategoryBrowser` renders immediately and calls this without blocking, so
   * the window opens with a loading message rather than hanging on twelve
   * pack indexes.
   *
   * **Only the fields the filters need are indexed.**
   * `CompendiumCollection#getIndex` indexes what it is asked for and nothing
   * else, so a filter reading an unindexed field silently matches nothing.
   *
   * A pack the user cannot see is skipped rather than erroring: the bestiary
   * is GM-only (CLAUDE.md §9), and a player opening the browser should get the
   * categories they can actually browse.
   */
  async _loadCategoryData() {
    const entries = {};
    for (const [key, category] of Object.entries(CATEGORIES)) {
      const pack = game.packs.get(category.pack);
      if (!pack || !pack.visible) continue;
      const index = await pack.getIndex({ fields: category.fields });
      entries[key] = index.map(entry => ({
        id: entry._id,
        // The canonical V14 form carries the document name. A UUID without it
        // still resolves - `parseUuid` re-interprets the legacy shape - but it
        // takes a redirect lookup to do it.
        uuid: `Compendium.${category.pack}.${pack.documentName}.${entry._id}`,
        name: entry.name,
        img: entry.img,
        system: entry.system ?? {},
        // The affix filters read flags; the index carries what `fields` asks for.
        flags: entry.flags ?? {},
        rarityClass: rarityClass(entry.system?.rarity),
        meta: summary(key, entry).join(" \u00b7 "),
        // A career's Grantor is a sentence: the meta clips it and the row's
        // tooltip carries it whole (2026-09-06).
        metaTitle: key === "careers" && entry.system?.grantor ? String(entry.system.grantor) : null
      }));
    }
    this.#entries = entries;
  }

  /**
   * The abstract method `CategoryBrowser` actually requires: one record per
   * category, each `{id, label, entries}`. The base merges this with the tab
   * data itself, so nothing here builds a category list of its own.
   */
  async _prepareCategoryData() {
    const data = {};
    for (const [key, category] of Object.entries(CATEGORIES)) {
      const pack = game.packs.get(category.pack);
      if (!pack || !pack.visible) continue;
      const entries = this.#entries?.[key] ?? [];
      data[key] = {
        id: key,
        label: game.i18n.localize(category.label),
        entries,
        filters: this.#filterContext(key, category.filters(), entries),
        canGenerate: key === "affixes" && game.user.isGM,
        ...this.#sortContext(key)
      };
    }
    return data;
  }

  /**
   * A category's filters as the template draws them: the choices from config
   * where the filter names them, else the values the entries actually carry,
   * and the current selection so a re-render keeps it.
   */
  #filterContext(key, filters, entries) {
    // The option LIST is built against every entry, so it never changes shape
    // as filters are ticked; only the counts move, and `#apply` writes those.
    // Re-rendering the list instead would take the reader's checkbox out from
    // under the cursor mid-click.
    const none = new Map();
    return Object.entries(filters).map(([id, f]) => {
      const state = this.#state(key, id);
      const kind = f.kind ?? "set";
      const options = kind === "range"
        ? []
        : facetOptions(entries, filters, none, id, { label: l => game.i18n.localize(l) })
          .map(o => ({ ...o, checked: state.values.has(o.value) }));
      return {
        id,
        label: f.label,
        path: f.path,
        kind,
        coin: f.coin === true,
        options,
        // A facet worth its own search box, and one worth an any/all pair.
        searchable: options.length > 12,
        multiValued: kind === "includes",
        mode: state.mode,
        min: state.minText ?? "",
        max: state.maxText ?? "",
        active: isActive(state),
        // EVERY FACET STARTS CLOSED (the lead, 2026-09-07). Opening the short
        // ones by default put a wall of checkboxes above the entries, which is
        // the list the reader came for. A facet that IS narrowing still says
        // so: `is-active` underlines its summary and the count beside the
        // tools reads `N of M`, so a preset filter is visible without the
        // panel being open.
        open: false
      };
    });
  }

  /**
   * What this category can be sorted by.
   *
   * A key is labelled by the FIELD DESCRIPTOR that already names it, so the
   * browser's "Sort by" and the item sheet's own labels are the same words -
   * there is no second list of names to drift (CLAUDE.md §11).
   */
  #sortContext(key) {
    const chosen = this.#sort.get(key) ?? { key: "name", dir: "asc" };
    const type = { weapons: "weapon", armor: "armor", gear: "gear", spells: "spell", talents: "talent", careers: "career" }[key];
    const spec = type ? (ITEM_FIELDS[type] ?? []) : [];
    const label = k => {
      if (k === "name") return game.i18n.localize("AZEROTH.Item.Name");
      const path = k.replace(/^system\./, "");
      const found = spec.find(f => f.path === path);
      return game.i18n.localize(found?.label ?? path);
    };
    return {
      sortKeys: sortKeysFor(key).map(k => ({ value: k, label: label(k), selected: k === chosen.key })),
      sortDesc: chosen.dir === "desc"
    };
  }

  /** One filter's state, created on demand. */
  #state(key, id) {
    const k = `${key}|${id}`;
    if (!this.#active.has(k)) this.#active.set(k, emptyFilterState());
    return this.#active.get(k);
  }

  /** The states for one category, keyed by filter id, as the engine wants them. */
  #statesFor(key) {
    const out = new Map();
    for (const [k, state] of this.#active) {
      const [cat, id] = k.split("|");
      if (cat === key) out.set(id, state);
    }
    return out;
  }

  /**
   * Show and hide entries from the query and the active filters together.
   * The DOM is the view; the entries in `#entries` are what is judged, so a
   * filter reads the indexed field and never a rendered string.
   */
  #apply() {
    if (!this.element) return;
    const SearchFilter = foundry.applications.ux.SearchFilter;
    const clean = s => SearchFilter.cleanQuery(s ?? "");

    for (const cat of this.element.querySelectorAll("[data-category]")) {
      const key = cat.dataset.category;
      const all = this.#entries?.[key] ?? [];
      const byUuid = new Map(all.map(e => [e.uuid, e]));
      const defs = CATEGORIES[key]?.filters?.() ?? {};
      const states = this.#statesFor(key);

      // THE JUDGEMENT IS THE PURE MODULE'S. This loop only moves the DOM.
      let shown = 0;
      for (const li of cat.querySelectorAll("li[data-uuid]")) {
        const entry = byUuid.get(li.dataset.uuid);
        const show = entry ? entryMatches(entry, defs, states, this.#query, clean) : false;
        li.hidden = !show;
        if (show) shown++;
      }

      // The counts are computed against every OTHER filter, so a facet says
      // how many its option would ADD rather than how many exist in the pack.
      // An option nothing can reach is greyed, never hidden: the vocabulary
      // has to stay visible or the reader cannot tell an empty facet from a
      // missing one.
      for (const [id, def] of Object.entries(defs)) {
        if ((def.kind ?? "set") === "range") continue;
        const counts = new Map(facetOptions(all, defs, states, id).map(o => [o.value, o.count]));
        for (const row of cat.querySelectorAll(`[data-facet="${id}"] [data-value]`)) {
          const n = counts.get(row.dataset.value) ?? 0;
          const out = row.querySelector(".azeroth-browser-facet-count");
          if (out) out.textContent = String(n);
          row.classList.toggle("is-empty", n === 0 && !row.querySelector("input")?.checked);
        }
      }
      this.#applyFacetSearch(cat, key);

      // A count beside the list, because a filtered list of 12 out of 446
      // otherwise looks like a pack that failed to load.
      const tally = cat.querySelector(".azeroth-browser-count");
      if (tally) tally.textContent = game.i18n.format("AZEROTH.Browser.Showing", { shown, total: all.length });
      const clear = cat.querySelector('[data-action="clearFilters"]');
      if (clear) clear.disabled = ![...states.values()].some(isActive) && !this.#query;

      // Nothing left: say so, rather than a blank panel that reads as a pack
      // that failed to load.
      const empty = cat.querySelector(".azeroth-browser-empty");
      if (empty) empty.hidden = shown > 0;
    }
  }

  /** Narrow ONE facet's own option list by the text typed into its box. */
  #applyFacetSearch(cat, key) {
    for (const box of cat.querySelectorAll("[data-facet-search]")) {
      const id = box.dataset.facetSearch;
      const term = (this.#facetQuery.get(`${key}|${id}`) ?? "").trim().toLowerCase();
      for (const row of cat.querySelectorAll(`[data-facet="${id}"] [data-value]`)) {
        // A row already ticked never hides: it is why the list is short, and
        // hiding it would strand a filter the reader cannot see to undo.
        const checked = row.querySelector("input")?.checked === true;
        row.hidden = !checked && term !== "" && !row.textContent.toLowerCase().includes(term);
      }
    }
  }

  /** Re-sort one category's rows in place. */
  #resort(key) {
    const list = this.element?.querySelector(`[data-category="${key}"] .azeroth-browser-entries`);
    if (!list) return;
    const { key: sortKey, dir } = this.#sort.get(key) ?? { key: "name", dir: "asc" };
    const byUuid = new Map([...list.querySelectorAll("li[data-uuid]")].map(li => [li.dataset.uuid, li]));
    for (const entry of sortEntries(this.#entries?.[key] ?? [], sortKey, dir)) {
      const li = byUuid.get(entry.uuid);
      if (li) list.append(li);
    }
  }

  /**
   * Core's search iterates `.form-group`, which this browser does not emit
   * (D-484), so its callback matched nothing. The query joins the filters.
   */
  _onSearchFilter(event, query, rgx) {
    this.#query = query ? rgx : null;
    this.#apply();
  }

  /** The generator's first caller (08 SS6): GM only, from the Affixes category. */
  static async #onGenerateAffixed() {
    return generateAffixedItem({ actor: null });
  }

  /**
   * Open the document a row stands for.
   *
   * A BROWSER YOU CANNOT CLICK IS A LIST. The rows carried a `data-uuid` and
   * nothing read it - no action, no listener - so every entry was inert. Found
   * by using the thing, which is what the manual checklist is for.
   */
  static async #onOpenEntry(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (!doc) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Browser.Missing", { uuid }));
      return;
    }
    if (this.#pick) {
      await this.#pick.onPick(doc);
      await this.close();
      return;
    }
    doc.sheet?.render({ force: true });
  }

  /**
   * Make the rows draggable onto a sheet, the hotbar or the canvas.
   *
   * The markup said `data-drag="true"`, which is not a thing Foundry reads.
   * `DragDrop#bind` sets the `draggable` attribute itself, so the template
   * does not carry one; what it needs is the `dragstart` payload below.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: "[data-uuid]",
      permissions: { dragstart: () => true },
      callbacks: { dragstart: this.#onDragStart.bind(this) }
    }).bind(this.element);

    // A checkbox, a radio, a select and a text box all emit `change` or
    // `input`, never `click`, so none of them can go through `actions` - that
    // map fires on click alone. One delegated listener per event, on the
    // window, so a re-render never leaves a dead control behind
    // (appvv2-rerender-detaches-controls).
    this.element.addEventListener("change", this.#onControl.bind(this));
    this.element.addEventListener("input", this.#onControl.bind(this));

    // `_loadCategoryData` re-renders once the indexes arrive; the state lives
    // in #active, #sort, #facetQuery and #query, so it survives the render and
    // is re-applied here.
    for (const key of Object.keys(this.#entries ?? {})) this.#resort(key);
    this.#apply();
  }

  /**
   * Every filter control, in one place.
   *
   * `input` and `change` both arrive: a checkbox fires only `change` and a
   * text box fires `input` on every keystroke, so both are bound and the
   * handler is idempotent.
   */
  #onControl(event) {
    const el = event.target;
    const cat = el.closest?.("[data-category]");
    if (!cat) return;
    const key = cat.dataset.category;

    if (el.matches("[data-facet-value]")) {
      const id = el.closest("[data-facet]")?.dataset.facet;
      const state = this.#state(key, id);
      if (el.checked) state.values.add(el.dataset.facetValue);
      else state.values.delete(el.dataset.facetValue);
    } else if (el.matches("[data-facet-mode]")) {
      // 08 §5 traits are the case this exists for: *Fast* AND *Reach* is a
      // different question from *Fast* OR *Reach*, and only one of them was
      // askable before.
      this.#state(key, el.closest("[data-facet]")?.dataset.facet).mode = el.value === "all" ? "all" : "any";
    } else if (el.matches("[data-facet-bound]")) {
      const id = el.closest("[data-facet]")?.dataset.facet;
      const def = CATEGORIES[key]?.filters?.()[id];
      const state = this.#state(key, id);
      const which = el.dataset.facetBound;           // "min" or "max"
      state[which] = boundFrom(el.value, { coin: def?.coin === true });
      // The TYPED text is kept beside the parsed number, so a half-typed
      // `2s` does not rewrite itself under the cursor on the next render.
      state[`${which}Text`] = el.value;
    } else if (el.matches("[data-facet-search]")) {
      this.#facetQuery.set(`${key}|${el.dataset.facetSearch}`, el.value);
      this.#applyFacetSearch(cat, key);
      return;                                        // narrows options, not entries
    } else if (el.matches("[data-sort-key]")) {
      this.#sort.set(key, { key: el.value, dir: this.#sort.get(key)?.dir ?? "asc" });
      this.#resort(key);
      return;
    } else if (el.matches("[data-sort-dir]")) {
      this.#sort.set(key, { key: this.#sort.get(key)?.key ?? "name", dir: el.checked ? "desc" : "asc" });
      this.#resort(key);
      return;
    } else {
      return;
    }
    this.#apply();
  }

  /** Every filter off, and the search box with them. */
  static #onClearFilters(event, target) {
    const key = target.closest("[data-category]")?.dataset.category;
    for (const k of [...this.#active.keys()]) if (k.startsWith(`${key}|`)) this.#active.delete(k);
    for (const k of [...this.#facetQuery.keys()]) if (k.startsWith(`${key}|`)) this.#facetQuery.delete(k);
    this.#query = null;
    for (const el of this.element.querySelectorAll(`[data-category="${key}"] input[type="checkbox"][data-facet-value]`)) el.checked = false;
    for (const el of this.element.querySelectorAll(`[data-category="${key}"] [data-facet-bound], [data-category="${key}"] [data-facet-search]`)) el.value = "";
    for (const el of this.element.querySelectorAll('input[type="search"], input[name="search"]')) el.value = "";
    this.#apply();
  }

  /**
   * The drag payload core's drop handlers expect: `{type, uuid}`.
   *
   * THE TYPE IS THE PACK'S, NOT A CONSTANT. Eleven of the twelve categories are
   * Items and the bestiary is Actors, and a creature dropped on the canvas with
   * `type: "Item"` is silently ignored.
   */
  #onDragStart(event) {
    const uuid = event.currentTarget.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    const packId = uuid.split(".").slice(1, 3).join(".");
    const type = game.packs.get(packId)?.documentName;
    if (!type) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type, uuid }));
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.config = AZEROTH;
    return context;
  }
}
