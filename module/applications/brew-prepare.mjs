/**
 * **THE PREPARE WINDOW** (02 §7's Field Brews, Studied and Decoctions; the Witch Hunter plan's wave 2a-A; D11's
 * Hunter panel). The Forge's shape (D-633, D-666): an ApplicationV2 form whose law is a pure module
 * (`rules/witch-hunter-standing.mjs#prepareView`, `rules/brewing.mjs#brewPlan`, `tome.mjs#studiedRefusal`), a private
 * `#state` that survives renders, and an `apply(state)` the batches drive without clicking.
 *
 * - **A stepper for each formula known** (and the Decoction where **Decoctions** is held), because the one chooser
 *   picks options and cannot split doses among them (the plan's MY READING, accepted). The doses left are drawn in
 *   words beside the steppers; the + of every row greys where none are left.
 * - **Hunter's oil's type, the Decoction's type and the elemental Decoction's school**, each a select drawn only where
 *   it applies.
 * - **The Studied types**, checkboxes over the types known, up to the count (*half your Wisdom modifier, rounded
 *   down, and at least 1*, Forewarned adds).
 * - **Brew** submits through `effects/witch-hunter-brews.mjs#prepareBrews`, the one writer, which judges again,
 *   creates the new brews first and deletes the spoiled ones after (D-745). Every refusal is drawn in words above the
 *   button before it is pressed, never by the grey alone.
 *
 * Controls carry `data-*` hooks and the steppers `data-action` (a click); a checkbox and a select emit `change`, which
 * `_onRender` binds directly (CLAUDE.md §5: the actions map fires on click alone).
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { AZEROTH } from "../config.mjs";
import { brewOf } from "../rules/witch-hunter-brews.mjs";
import { prepareView } from "../rules/witch-hunter-standing.mjs";
import { EXTRA_MEASURE } from "../rules/brewing.mjs";
import { FOREWARNED } from "../rules/tome.mjs";
import { brewDescriptionsByIdentifier, formulasOf, prepareBrews, prepareJudgement } from "../effects/witch-hunter-brews.mjs";
import { SIGNS } from "../rules/witch-hunter-features.mjs";
import { brewTip, decoctionTypeTip } from "../rules/witch-hunter-standing.mjs";
import { weaknessOf } from "../rules/tome.mjs";
import { tomeOf, typeLabel } from "../effects/witch-hunter-tome.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/brew-prepare.hbs";
const int = v => Math.trunc(Number(v)) || 0;

export class AzerothBrewPrepare extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-brew-prepare"],
    tag: "form",
    window: { title: "AZEROTH.WitchHunter.Prepare.Title", resizable: true },
    position: { width: 520, height: "auto" },
    form: { handler: AzerothBrewPrepare.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      brewStep: AzerothBrewPrepare.#onStep
    }
  };

  static PARTS = { body: { template: TEMPLATE } };

  /** @param {{actor: Actor}} options */
  constructor({ actor, ...options } = {}) {
    super({ id: `azeroth-brew-prepare-${actor?.id ?? "none"}`, ...options });
    this.actor = actor;
    const tome = tomeOf(actor);
    this.#state = { picks: {}, studied: [...tome.studied], oilType: tome.known[0] ?? null, decoctionType: null, school: null };
  }

  #state;

  /** The current state (a copy), for the tests and the summary. */
  get state() {
    return foundry.utils.deepClone(this.#state);
  }

  /** Merge a partial state, the way the tests drive the window. */
  async setState(partial = {}) {
    this.#state = { ...this.#state, ...foundry.utils.deepClone(partial) };
    if (this.rendered) await this.render();
    return this.state;
  }

  /** The window's law, read once for the context and the batches. */
  #view() {
    const actor = this.actor;
    const tome = tomeOf(actor);
    return prepareView({
      formulas: formulasOf(actor), tier: actor.system?.tier ?? 1, wisMod: actor.system?.abilities?.wis?.mod ?? 0,
      // 04's Forewarned and the carried First Tome's The Margins (D-2162) each add one type for Studied.
      extraMeasure: actor.talentRanks?.(EXTRA_MEASURE) ?? 0, forewarned: (actor.talentRanks?.(FOREWARNED) ?? 0) + (Number(actor.system?.signatureEffects?.studiedTypes) || 0),
      tome, decoctions: actor.items.some(i => i.type === "feature" && i.name === "Decoctions"), picks: this.#state.picks
    });
  }

  /** @inheritDoc */
  get title() {
    return game.i18n.format("AZEROTH.WitchHunter.Prepare.WindowTitle", { name: this.actor?.name ?? "" });
  }

  /** @override */
  async _prepareContext() {
    const view = this.#view();
    const judged = prepareJudgement(this.actor, this.#state);
    const decoction = view.rows.find(r => r.identifier === "decoction");
    const decRow = this.#state.decoctionType ? brewOf("decoction").byType?.[this.#state.decoctionType] ?? null : null;
    // **THE TOOLTIPS** (the lead, 2026-11-27: *"a mouseover tooltip explaining each option"*): a brew's own rules off its
    // description, a type's weakness row (Sign, bomb, damage) and a Hunter's oil's or Decoction's line for that type.
    const descriptions = await brewDescriptionsByIdentifier();
    const F = (key, data) => game.i18n.format(key, data);
    const weakness = type => {
      const row = weaknessOf(type);
      return row ? F("AZEROTH.WitchHunter.Panel.Weakness", { sign: SIGNS[row.sign]?.name ?? "", bomb: brewOf(row.bomb)?.name ?? "", damage: game.i18n.localize(AZEROTH.damageTypes?.[row.damage] ?? row.damage ?? "") }) : "";
    };
    return {
      config: AZEROTH,
      rows: view.rows.map(r => ({ ...r, kindLabel: game.i18n.localize(`AZEROTH.WitchHunter.Kind.${r.kind}`), canAdd: view.left > 0, canRemove: r.doses > 0, tip: brewTip(descriptions.get(r.identifier)) })),
      doses: view.doses, used: view.used, left: view.left,
      oil: view.oil && (this.#state.picks["hunters-oil"] ?? 0) > 0,
      oilTypes: view.types.map(type => ({ value: type, label: typeLabel(type), selected: type === this.#state.oilType, tip: brewTip(descriptions.get("hunters-oil")) })),
      decoction: Boolean(decoction) && decoction.doses > 0,
      decoctionTypes: view.decoctionTypes.map(type => ({ value: type, label: typeLabel(type), selected: type === this.#state.decoctionType, tip: decoctionTypeTip(descriptions.get("decoction"), typeLabel(type)) })),
      noDecoctionTypes: Boolean(decoction) && !view.decoctionTypes.length,
      schools: decRow?.chooseWard ? decRow.chooseWard.schools.map(s => ({ value: s, label: game.i18n.localize(AZEROTH.schools[s] ?? s), selected: s === this.#state.school })) : [],
      studiedCount: view.studiedCount,
      studied: view.types.map(type => ({ value: type, label: typeLabel(type), checked: this.#state.studied.includes(type), tip: weakness(type) })),
      refusal: judged.refusal ? game.i18n.format(judged.refusal, { name: this.actor?.name ?? "", reason: judged.reason ?? "" }) : null,
      ready: !judged.refusal
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    for (const el of root.querySelectorAll("[data-brew-select]")) {
      el.addEventListener("change", () => this.setState({ [el.dataset.brewSelect]: el.value || null }));
    }
    for (const el of root.querySelectorAll("[data-brew-studied]")) {
      el.addEventListener("change", () => {
        const picked = [...root.querySelectorAll("[data-brew-studied]")].filter(b => b.checked).map(b => b.value);
        this.setState({ studied: picked });
      });
    }
  }

  /** A stepper pressed: one dose more or one fewer of a formula, never below 0 nor past the doses. */
  static async #onStep(event, target) {
    const id = target.dataset.identifier;
    const by = int(target.dataset.by);
    const view = this.#view();
    const now = int(this.#state.picks[id]);
    const next = Math.max(0, now + by);
    if (by > 0 && view.left <= 0) return;
    await this.setState({ picks: { ...this.#state.picks, [id]: next } });
  }

  /** Brew: the one writer, which judges again. */
  static async #onSubmit() {
    const done = await this.apply(this.#state);
    if (done?.ok) await this.close();
  }

  /**
   * **BREW WITH THIS STATE** (the batches' door, and the submit's): `prepareBrews`, which judges whole, creates first
   * and deletes after.
   *
   * @param {object} [state]
   */
  async apply(state = this.#state) {
    return prepareBrews(this.actor, state);
  }
}
