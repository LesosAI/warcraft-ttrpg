/**
 * The NPC sheet. D11 §6: the same language as the character sheet, simplified.
 *
 * Same attribute rail, three tabs — Statistics / Traits / GM notes — and the
 * **undeath** accent in place of the faction one. (D11 calls that colour
 * plague-green; the token was renamed `--azeroth-undeath` when D-466 left three
 * corruption tracks and two swatches answering to no live key. Same colour, a
 * name that now resolves.)
 *
 * **Both pools are always drawn, even for a creature with neither** (D-509) —
 * an em-dash in the slot and the Momentum track drawn empty. Every stat block
 * then has one shape and the GM's eye lands in the same place.
 *
 * **Armour by location is the sheet's centre.** Head AP is listed separately
 * because a called shot reaches it, and a creature without a head cannot be
 * called-shot to one (06 §2).
 */

import { AZEROTH } from "../config.mjs";
import { hasAutomation, isPressable } from "../rules/ability-automation.mjs";
import { enrich, enrichRows } from "../helpers/enrich.mjs";
import { bindPlateKeys, bindPoolInputs, bindScoreInputs, castNamedSpell, maneuversContext, stepPool, useAbilityWithDialog } from "./actions.mjs";
import { targetSnapshots } from "./roll-dialog.mjs";
import { attackWithDialog, blankItemMenu, browseItems, effectAction, effectsContext, npcAttackWithDialog, resilienceWithDialog, rollAbility, rollWithDialog, useGearWithDialog } from "./actions.mjs";
// The Spells tab (D-705): the character's own row shape over 14's block.
import { castWithDialog, detailFields, detailProse } from "./actions.mjs";
import { showsCreatureSpells } from "../rules/casting.mjs";
import { adopt, bondOf, featureForKind, release, worldActorOf } from "../documents/bound.mjs";
// A totem bound off the table, planted from its own banner (02 §7, D-708).
import { plantTotem } from "../documents/totems.mjs";
import { bareName, totemAura } from "../rules/totems.mjs";
// The Gear tab (the lead's N3): the character's own rows, minus containers and
// minus the paper doll.
import { carriedGroups, carriedRows, describeRows } from "./carried.mjs";
import { loadLine } from "../rules/size.mjs";
import { coins } from "../helpers/coins.mjs";
import { hasCharges } from "../rules/containers.mjs";
import { displacedBy, isWornSlot } from "../rules/worn.mjs";
import { heldAugment } from "../rules/augments.mjs";
// What a creature swings when a GM puts a weapon in its hands (the lead's N2).
import { heldAttackRows } from "../rules/held-attacks.mjs";
// 05's temporary Health on the banner (D-777).
import { temporaryHealthContext } from "../effects/temporary-health.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Does this creature have a token anywhere in the world? Every scene, not the
 * viewed one: a totem standing on the scene the party left is still standing
 * (D-708).
 */
function standsAnywhere(actor) {
  const world = worldActorOf(actor);
  return (game.scenes ?? []).some(scene => scene.tokens.some(t => t.actorId === world.id));
}

export class AzerothNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "sheet", "actor", "npc"],
    position: { width: 620, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      // A creature spends its Momentum on 06 §7's table like anyone (2026-09-06).
      useManeuver: AzerothNpcSheet.#onUseManeuver,
      // A point in or out of a pool by hand (the lead, 2026-09-13). The Spend
      // row is still the character sheet's alone.
      stepPool: AzerothNpcSheet.#onStepPool,
      expandItem: AzerothNpcSheet.#onExpandItem,
      rollAbility: AzerothNpcSheet.#onRollAbility,
      rollAttack: AzerothNpcSheet.#onRollAttack,
      rollSkill: AzerothNpcSheet.#onRollSkill,
      rollResilience: AzerothNpcSheet.#onRollResilience,
      useAbility: AzerothNpcSheet.#onUseAbility,
      bindTo: AzerothNpcSheet.#onBindTo,
      castSpell: AzerothNpcSheet.#onCastSpell,
      // The Spells tab (D-705): a Sustain ends from its own cell, as it does
      // on the character sheet.
      endSustain: AzerothNpcSheet.#onEndSustain,
      toggleCondition: AzerothNpcSheet.#onEffectAction,
      stepCondition: AzerothNpcSheet.#onEffectAction,
      toggleEffect: AzerothNpcSheet.#onEffectAction,
      editEffect: AzerothNpcSheet.#onEffectAction,
      deleteEffect: AzerothNpcSheet.#onEffectAction,
      shortRest: AzerothNpcSheet.#onShortRest,
      rework: AzerothNpcSheet.#onRework,
      release: AzerothNpcSheet.#onRelease,
      // A totem bound off the table, planted beside its shaman (02 §7, D-708).
      plantTotem: AzerothNpcSheet.#onPlantTotem,
      viewArt: AzerothNpcSheet.#onViewArt,
      // The Gear tab (the lead's N3, 2026-09-10). Every one of these is
      // rendered by `npc-gear.hbs` or by the row partial it draws, and an
      // action a template carries and the sheet does not register is a SILENT
      // no-op - `module/actions.test.mjs` fails the build on one, because
      // `attributes.hbs` did exactly this to this sheet once already.
      useGear: AzerothNpcSheet.#onUseGear,
      spendCharge: AzerothNpcSheet.#onSpendCharge,
      fillCharges: AzerothNpcSheet.#onFillCharges,
      toggleEquipped: AzerothNpcSheet.#onToggleEquipped,
      deleteItem: AzerothNpcSheet.#onDeleteItem,
      openItem: AzerothNpcSheet.#onOpenItem,
      clearCoating: AzerothNpcSheet.#onClearCoating,
      toggleFavorite: AzerothNpcSheet.#onToggleFavorite,
      browseItems: AzerothNpcSheet.#onBrowseItems,
      // A GM's right click on an Add button, through `blankItemMenu`: no
      // template carries it, which is what the audit's MENU_ONLY names.
      createItem: AzerothNpcSheet.#onCreateItem
    }
  };

  static PARTS = {
    banner: { template: "systems/azeroth-rpg/templates/actor/npc-banner.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    attributes: { template: "systems/azeroth-rpg/templates/actor/attributes.hbs" },
    statistics: { template: "systems/azeroth-rpg/templates/actor/npc-statistics.hbs", scrollable: [""] },
    traits: { template: "systems/azeroth-rpg/templates/actor/npc-traits.hbs", scrollable: [""] },
    spells: { template: "systems/azeroth-rpg/templates/actor/npc-spells.hbs", scrollable: [""] },
    gear: { template: "systems/azeroth-rpg/templates/actor/npc-gear.hbs", scrollable: [""] },
    notes: { template: "systems/azeroth-rpg/templates/actor/npc-notes.hbs", scrollable: [""] }
  };

  /**
   * Five tabs since D-705. Spells sits between Traits and Gear — what the
   * creature IS, then what it casts, then what it carries, then what the table
   * is told — and is drawn only where the creature has a spell to show.
   */
  static TABS = {
    primary: {
      initial: "statistics",
      labelPrefix: "AZEROTH.NpcTab",
      tabs: [{ id: "statistics" }, { id: "traits" }, { id: "spells" }, { id: "gear" }, { id: "notes" }]
    }
  };

  /* -------------------------------------------- */

  /**
   * Whether this creature has a spell to show (D-705, D-639's rule read off
   * 14's block): a `**Spells** (DC n)` run, a Spell DC on its own, or a spell
   * item a GM dropped on it.
   *
   * The character sheet's `showsSpells` cannot answer this — a creature holds
   * no class item, so every creature would hide the tab.
   */
  #showsSpells() {
    return showsCreatureSpells({
      names: this.actor.system.spells?.names ?? [],
      dc: this.actor.system.spells?.dc ?? null,
      spellItems: this.actor.items.filter(i => i.type === "spell").length
    });
  }

  /**
   * Core's `_prepareTabs` reads this, so a tab left out here gets no button
   * and no record. The character sheet's three pieces, exactly (D-639).
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== "primary" || !config || this.#showsSpells()) return config;
    return { ...config, tabs: config.tabs.filter(t => t.id !== "spells") };
  }

  /**
   * A part with no tab renders with `tab` undefined and sits in the DOM
   * unseen, so the part goes with the button; and a sheet open on Spells when
   * the last spell leaves falls back to Statistics.
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (this.#showsSpells()) return;
    options.parts = (options.parts ?? []).filter(p => p !== "spells");
    if (this.tabGroups.primary === "spells") this.tabGroups.primary = "statistics";
  }

  /* -------------------------------------------- */

  /**
   * What 07 holds for each spell the block names, cached for this sheet.
   *
   * ONE query rather than a document apiece, and one round trip rather than
   * one per render: the sheet re-renders on every change and `getDocuments`
   * goes to the server each time. `name__in` is a v14 query operator
   * (`client/documents/collections/compendium-collection.mjs:404`, resolved
   * server-side in `dist/database/backend/sublevel-database.mjs`).
   *
   * The documents are transient — nothing is written, and nothing is embedded.
   */
  #blockCache = { key: null, docs: [] };

  async #blockSpells(names) {
    if (!names.length) return [];
    const key = JSON.stringify(names);
    if (this.#blockCache.key === key) return this.#blockCache.docs;
    const pack = game.packs.get("azeroth-rpg.spells");
    if (!pack) return [];
    const docs = await pack.getDocuments({ name__in: names });
    this.#blockCache = { key, docs };
    return docs;
  }

  /**
   * The Spells tab (D-705): 14's own `**Spells** (DC n)` run first, then the
   * spell items a GM dropped on the creature, grouped by tier ascending.
   *
   * The block's names ORIGINATE in the chapter (D3 §7), so they lead; a given
   * spell is marked with a WORD rather than a tint (D5). A name 07 no longer
   * holds keeps its row, draws no chip and no Cast, and says why in words —
   * a refusal said by grey alone is the fault the Signature panels were
   * corrected for.
   */
  async #spells(powerPool) {
    const system = this.actor.system;
    const names = system.spells?.names ?? [];
    const docs = await this.#blockSpells([...names]);
    const byName = new Map(docs.map(d => [d.name, d]));
    const sustaining = this.actor.getFlag("azeroth-rpg", "sustaining") ?? [];
    const heldIds = new Set(sustaining.map(s => s.spellId).filter(Boolean));
    const heldUuids = new Set(sustaining.map(s => s.uuid).filter(Boolean));

    const rowOf = async (doc, extra) => ({
      name: doc.name,
      img: doc.img,
      tier: doc.system.tier ?? 1,
      school: doc.system.school ?? null,
      schoolLabel: AZEROTH.schools[doc.system.school] ?? null,
      mana: doc.system.mana ?? null,
      actionLabel: AZEROTH.actions[doc.system.action] ?? null,
      detail: detailFields(doc),
      description: await detailProse(doc),
      known: true,
      given: false,
      ...extra
    });

    const rows = [];
    for (const name of names) {
      const doc = byName.get(name);
      if (!doc) {
        // 07 no longer holds it: the row stays, and it says so.
        rows.push({
          name, img: null, tier: null, school: null, schoolLabel: null, mana: null, actionLabel: null,
          detail: [], description: "", known: false, given: false, sustaining: false,
          refusal: game.i18n.format("AZEROTH.Cast.SpellMissing", { name })
        });
        continue;
      }
      rows.push(await rowOf(doc, {
        packId: doc.id,
        uuid: doc.uuid,
        sustaining: heldUuids.has(doc.uuid)
      }));
    }

    const starred = new Set(this.actor.favorites);
    for (const item of this.actor.items.filter(i => i.type === "spell")) {
      rows.push(await rowOf(item, {
        id: item.id,
        given: true,
        favorite: starred.has(item.id),
        sustaining: heldIds.has(item.id)
      }));
    }

    // By tier ascending; a name with no tier at all sorts last. Within a tier
    // the block's rows first (D3 §7), then `AZEROTH.schools`' own key order —
    // a creature has no `system.schools` of its own to order by — then name.
    const order = Object.keys(AZEROTH.schools);
    const rank = key => { const i = order.indexOf(key); return i < 0 ? 99 : i; };
    const byTier = new Map();
    for (const row of rows) {
      const tier = row.tier ?? 0;
      if (!byTier.has(tier)) byTier.set(tier, []);
      byTier.get(tier).push(row);
    }
    const tiers = [...byTier.keys()].sort((a, b) => (a || 99) - (b || 99)).map(tier => ({
      tier: tier || null,
      spells: byTier.get(tier).sort((a, b) =>
        Number(a.given) - Number(b.given) || rank(a.school) - rank(b.school) || a.name.localeCompare(b.name))
    }));

    return {
      tiers,
      count: rows.length,
      dc: system.spells?.dc ?? null,
      // The Power a creature casts from IS its Mana (D-647, `rules/pools.mjs`).
      // The SAME row the Statistics tab draws, handed in rather than rebuilt,
      // so the two surfaces cannot print two different numbers.
      powerPool
    };
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.config = AZEROTH;
    context.system = system;
    // npc-banner.hbs binds {{actor.name}} and {{actor.img}} - see the character sheet.
    context.actor = this.actor;
    context.effects = effectsContext(this.actor);
    context.tabs = this._prepareTabs("primary");

    context.abilities = Object.entries(system.abilities ?? {}).map(([key, ability]) => {
      const resilience = Object.entries(AZEROTH.resilienceAbility).find(([, a]) => a === key)?.[0] ?? null;
      return {
      key,
      label: AZEROTH.abilities[key],
      // A Mindless thing carries no Int and no Cha, and the slot stays empty
      // rather than reading zero (D4 §10.2).
      value: ability.value,
      // **A CREATURE WEARS A GRANT NOW** (the lead's N1): 08 §6's *of the Bear*
      // adds to the TOTAL and leaves 14's own score where it is, exactly as it
      // does on a character. The plate has to draw the same three values or it
      // shows Strength 16 beside a modifier of +4 and says nothing about why —
      // `mod` moves whether this line does or not.
      total: ability.total ?? ability.value,
      bonus: ability.bonus ?? 0,
      formula: ability.bonus
        ? `${ability.value} ${(ability.sources ?? []).map(src => `${src.points < 0 ? "−" : "+"} ${Math.abs(src.points)} · ${src.name}`).join(" ")}`
        : null,
      mod: ability.mod,
      absent: ability.value === null,
      editable: this.isEditable && ability.value !== null,
      resilience,
      // **THE CHIP HAD NO NUMBER IN IT** (D-714). `attributes.hbs` has drawn
      // `{{azerothSigned this.save}}` on every Resilience chip since Phase 3
      // and this sheet never set `save`, so a creature's three chips all read
      // `+0` while the die added the real rows — D-681's shape exactly, right
      // code with no caller. 14 §1 states the derivation now: the modifier of
      // the attribute 05 pairs with it, and the Proficiency Bonus as well
      // where the block's **Resilience** row names that Resilience.
      //
      // Summed from `resilienceModifiers`, which is the SAME list
      // `rollResilience` hands the die, so the chip and the roll cannot print
      // two different numbers. A Mindless creature's absent ability draws no
      // chip at all, so the null never reaches the template.
      save: resilience && ability.value !== null ? this.#resilienceTotal(resilience) : null
      };
    });

    // Skills at their Ranks (14 SS1): a Test is attribute + Proficiency + the
    // Rank shown. The block lists only the skills the creature has.
    context.skills = Object.entries(system.skills ?? {})
      .filter(([key]) => AZEROTH.skills[key])
      .map(([key, v]) => ({ key, label: AZEROTH.skills[key], rank: typeof v === "number" ? v : (v?.rank ?? 0) }));
    context.resiliences = Object.entries(AZEROTH.resiliences).map(([key, label]) => ({
      key, label, trained: (system.resilience ?? []).includes(key)
    }));

    // Armour by location. A location the creature does not have is null, and
    // the sheet says so rather than printing a 0 that invites a called shot.
    context.locations = Object.entries(AZEROTH.locations).map(([key, label]) => ({
      key,
      label,
      ap: system.ap?.[key] == null ? null : Math.max(0, system.ap[key]),
      absent: (system.ap?.[key] ?? null) === null
    }));

    // Ward by school (D-644): the schools that hold one, or the dash.
    context.wards = Object.entries(system.ward ?? {})
      .filter(([key, value]) => AZEROTH.schools[key] && Number(value) > 0)
      .map(([key, value]) => ({ key, label: AZEROTH.schools[key], value }));

    // Both pools, always (D-509), at the maxima `creaturePools` DERIVES.
    // This passed the stored field alone, so the floor that gives every
    // creature a Momentum and a Power (2026-09-07) reached the model, the
    // rule and its tests and never reached the reader: 123 of the 164 still
    // drew two em-dashes (2026-09-08).
    // `key` is the `kind` `updatePool` writes with; `title` and `editable` are
    // the stepper's (the lead, 2026-09-13), spread onto the ROW because a bare
    // name inside a partial resolves against the row and not the root (D-609).
    context.pools = [
      { key: "momentum", label: "AZEROTH.Momentum.Label", ...this.#pool(system.momentum, system.momentumMax) },
      { key: "power", label: "AZEROTH.Sheet.Power", ...this.#pool(system.power, system.powerMax) }
    ].map(row => ({ ...row, editable: this.isEditable, title: row.name ?? row.label }));
    // The generator reworks a creature in place (D-637): a GM's door.
    context.reworkable = game.user.isGM && this.isEditable;

    context.identity = this.#identity();
    // 05's temporary Health past the maximum, in words (D-777).
    context.temporaryHealth = temporaryHealthContext(this.actor);

    // Every prose field enriches HERE, never in the template: a triple-stash
    // over the raw field printed `@UUID[...]{10-CORRUPTION}` as text.
    const actor = this.actor;
    // Use where the row is automated (D-647); the label says what Use does.
    // A PASSIVE HAS NOTHING TO PRESS (D-691): it is enforced by data
    // preparation, so a Use button on its row would do nothing at all.
    const usable = rows => rows.map(row => ({
      ...row,
      usable: this.isEditable && isPressable(row.automation),
      kindLabel: hasAutomation(row.automation) ? AZEROTH.abilityKinds[row.automation.kind] : null
    }));
    context.creatureAbilities = usable(await enrichRows(system.creatureAbilities, { relativeTo: actor }));
    context.bossActions = usable(await enrichRows(system.bossActions, { relativeTo: actor }));
    // 14 §1's Boss Action points, and what the passives add up to (D-691).
    context.bossPoints = (system.bossPoints?.max ?? 0) > 0
      ? { value: system.bossPoints.value ?? system.bossPoints.max, max: system.bossPoints.max }
      : null;
    // Localised HERE and joined with the block's own separator: these are
    // phrases rather than words - *Being moved against its will* - and a row
    // of them with a space between reads as one long sentence (D-691).
    context.refuses = (system.refuses ?? []).map(id => ({
      key: id,
      label: game.i18n.localize(AZEROTH.conditions[id] ?? AZEROTH.refusalExtras[id] ?? id)
    }));
    // A swim sense is a NUMBER once the creature's own Speed is known, so the
    // measured pace stands in for the words rather than beside them.
    const swim = system.swimSpeed ?? null;
    context.senses = (system.senses ?? [])
      .filter(key => !(swim && (key === "swim" || key === "swimFast")))
      .map(key => ({ key, label: game.i18n.localize(AZEROTH.creatureSenses[key]) }));
    if (swim) context.senses.push({ key: "swim", label: game.i18n.format("AZEROTH.Sheet.SwimSpeed", { n: swim }) });
    // ---- the Gear tab (the lead's N3) --------------------------------------
    // The character's own reader, minus containers: `carriedGroups` is called
    // with `loose: false`, because a creature has no container sections and a
    // thing whose `system.container` still points at a bag on whatever actor it
    // came from would otherwise be listed nowhere at all.
    context.carried = carriedRows(this.actor);
    const starred = new Set(this.actor.favorites);
    for (const row of context.carried) row.favorite = starred.has(row.id);
    await describeRows(this.actor, context.carried);
    context.carriedGroups = carriedGroups(context.carried, { loose: false });
    // 05 SS10's carrying rule, off the fields the model derives (D-675). A
    // creature with a `—` Strength has NO limit, and `loadLine` says so.
    context.load = loadLine({
      carried: system.carried ?? 0,
      capacity: system.carryCapacity ?? null,
      state: system.load ?? "unencumbered"
    });
    context.purse = coins(system.coin ?? 0);
    context.augmentNote = this.#augmentNote();
    // **WHAT IT SWINGS THAT IS NOT ON THE BLOCK** (the lead's N2). The block's
    // own rows are `system.attacks` and are untouched; these join them.
    context.heldAttacks = heldAttackRows([...actor.items], system);
    // The column header and the *No attacks* line each read BOTH lists: a
    // creature whose block prints no row and whose GM handed it a sword had
    // five unlabelled columns and said it had no attacks.
    context.hasAttacks = (system.attacks?.length ?? 0) > 0 || context.heldAttacks.length > 0;
    // **EXTRA ATTACK IS THE GM'S TO GIVE** (14 §1, D-704): no block in the
    // chapter carries it, so the checkbox beside the rows is the only door.
    // It draws and writes the FLAG. A creature that earns it from its own
    // words - an ability, a Boss Action or a trait named for it - draws the box
    // ticked and LOCKED, because a control that springs back when it is cleared
    // is worse than one that says why it cannot move.
    context.extraAttackFromBlock = actor.hasExtraAttack === true
      && actor.getFlag("azeroth-rpg", "extraAttack") !== true;
    context.extraAttack = actor.hasExtraAttack === true;

    // THE SPELLS TAB (D-705). It was one paragraph of inline Cast buttons on
    // the Statistics tab, built from the pack index, with 07's entry riding
    // each name's tooltip — so what a spell DOES was readable only on hover
    // and a spell item dropped on a creature was drawn nowhere at all.
    context.spells = await this.#spells(context.pools[1]);
    // The maneuvers a creature's Momentum buys (05 §11, 06 §7; 2026-09-06).
    context.maneuvers = maneuversContext(actor);
    context.notes = {
      lore: await enrich(system.lore, { relativeTo: actor }),
      behavior: await enrich(system.behavior, { relativeTo: actor }),
      swarmNote: system.swarmNote ? await enrich(system.swarmNote, { relativeTo: actor }) : "",
      tactics: await enrich(system.tactics, { relativeTo: actor }),
      ecology: await enrich(system.ecology, { relativeTo: actor })
    };
    return context;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    // Core replaces the parts it rendered and leaves the rest standing, so a
    // Spells part rendered while the creature had a spell outlives the tab
    // that named it (D-639). Take it down with the tab.
    if (!this.#showsSpells()) {
      for (const stale of this.element.querySelectorAll('[data-application-part="spells"], section[data-tab="spells"]')) stale.remove();
    }
    bindPlateKeys(this.element);
    bindScoreInputs(this);
    // The pool's value typed straight in (the lead, 2026-09-13): nameless, so
    // `change` is bound here rather than on a `data-action`.
    bindPoolInputs(this);
    this.#applyExpanded();
    // A GM's right click on an Add button makes a blank item, as it does on the
    // character sheet. The menu listens on the frame element, which persists
    // across renders, so it is bound once per element rather than once per
    // render - and `createItem` would otherwise be registered with no door.
    if (this.#blankMenuFor !== this.element) {
      this.#blankMenu = blankItemMenu(this);
      this.#blankMenuFor = this.element;
    }
  }

  /** @type {object|null} */
  #blankMenu = null;
  /** @type {HTMLElement|null} */
  #blankMenuFor = null;

  /** The maneuver rows opened on their sentence; the state survives a re-render. */
  #expanded = new Set();

  static async #onExpandItem(event, target) {
    const row = target.closest("[data-item-id],[data-expand-id]");
    const id = row?.dataset.itemId ?? row?.dataset.expandId;
    if (!id) return;
    if (this.#expanded.has(id)) this.#expanded.delete(id);
    else this.#expanded.add(id);
    this.#applyExpanded();
  }

  /**
   * The character sheet's exact shape. It read `[data-expand-id]` alone until
   * the Gear tab arrived, and `item-detail.hbs` keys on `data-item-id` — so a
   * carried row's name would have opened nothing at all.
   */
  #applyExpanded() {
    for (const detail of this.element.querySelectorAll(".azeroth-item-detail[data-item-id], .azeroth-item-detail[data-expand-id]")) {
      detail.hidden = !this.#expanded.has(detail.dataset.itemId ?? detail.dataset.expandId);
    }
    for (const toggle of this.element.querySelectorAll('[data-action="expandItem"]')) {
      const row = toggle.closest("[data-item-id],[data-expand-id]");
      const id = row?.dataset.itemId ?? row?.dataset.expandId;
      toggle.setAttribute("aria-expanded", String(this.#expanded.has(id)));
    }
  }

  /**
   * One point in or out of a pool (the lead, 2026-09-13). The same door the
   * character sheet presses, so a creature's Power and a Warrior's Rage move
   * the same way and both go through `updatePool`, which clamps.
   */
  static async #onStepPool(event, target) {
    return stepPool(this.actor, target);
  }

  /** A maneuver from the creature's own Momentum (06 §7). */
  static async #onUseManeuver(event, target) {
    const key = target.dataset.maneuver;
    if (!key) return;
    return game.system.azeroth.workflows.useManeuver({ actor: this.actor, key, targets: targetSnapshots() });
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context) {
    const part = await super._preparePartContext(partId, context);
    // `_prepareTabs` returns an object keyed by id, not an array.
    const tab = context.tabs?.[partId];
    if (tab) part.tab = tab;
    return part;
  }

  /**
   * What a creature's Resilience Test comes to (14 §1, D-714): the modifier of
   * the attribute 05 pairs with it, plus the Proficiency Bonus where the
   * block's **Resilience** row names that Resilience.
   *
   * Read off `workflows.resilienceModifiers` rather than recomputed, because
   * that list is what `rollResilience` hands the die - a second derivation
   * here is a second place for the two to disagree. Reached through
   * `game.system.azeroth` rather than imported, as every other call into
   * `dice/workflows.mjs` from an application is (`actions.mjs`), so nothing
   * in `applications/` and `dice/` can import the other.
   */
  #resilienceTotal(resilience) {
    const rows = game.system.azeroth?.workflows?.resilienceModifiers?.(this.actor, resilience) ?? [];
    return rows.reduce((n, row) => n + (Number(row?.value) || 0), 0);
  }

  #pool(pool, derivedMax = null) {
    // Held by its value: the block prints `Power 10` and names no type, so
    // every Boss's Power read as an em-dash while this keyed on the name (D-637).
    // The block's own maximum where it states one, else the floor the tier
    // gives it; a pool of 0 is still not held, so a dash rather than `0 / 0`.
    const max = pool?.max ?? derivedMax ?? null;
    const held = max !== null && max !== undefined && max > 0;
    const value = pool?.value ?? 0;
    return {
      held,
      name: held ? (AZEROTH.momentumTypes[pool?.name] ?? AZEROTH.powerTypes[pool?.name] ?? null) : null,
      value: held ? value : null,
      max,
      // Drawn empty rather than omitted, so every block has one shape.
      segments: Array.from({ length: max || 10 }, (_, i) => ({
        filled: held && i < value
      }))
    };
  }

  /** The identity run, in the order D4 §10.2 prints it. */
  #identity() {
    const s = this.actor.system;
    return {
      weightClass: AZEROTH.weightClasses[s.weightClass],
      size: AZEROTH.sizes[s.size],
      creatureType: AZEROTH.creatureTypes[s.creatureType],
      typeMarker: s.typeMarker,
      race: s.race,
      threatShare: s.threatShare,
      tier: s.tier,
      corruption: s.corruption ? AZEROTH.corruptionTracks[s.corruption] : null,
      handlingDC: s.handlingDC,
      dungeon: s.dungeon,
      // Derived from tier, never stored (D-539, D-535).
      bossDC: s.bossDC,
      bossActionCount: s.bossActionCount,
      partyLevel: s.partyLevel,
      flyingSpeed: s.flyingSpeed,
      // The bond that holds this creature (D-643): who, and as what; or the
      // door to bind a creature already standing in the world (D-649).
      bond: this.#bond(),
      bindable: !bondOf(this.actor) && this.isEditable && this.#characters().length > 0,
      // The banner's portrait opens the full illustration where there is one
      // (D-688). A creature built in the generator has none, and then the
      // portrait is a plain image with no door and no pointer.
      hasArt: !!s.art,
      // One body for many (13 §4, D-646), and whether it is Thinned.
      swarm: s.isSwarm ? { line: game.i18n.format("AZEROTH.Sheet.SwarmOf", { n: s.swarm.members, name: s.swarm.of || this.actor.name }) } : null,
      thinned: s.thinned === true
    };
  }

  #bond() {
    const bond = bondOf(this.actor);
    if (!bond) return null;
    return {
      line: game.i18n.format("AZEROTH.Bound.Banner", { owner: bond.ownerName ?? "", kind: game.i18n.localize(AZEROTH.boundKinds[bond.kind] ?? bond.kind) }),
      ownerUuid: bond.ownerUuid,
      releasable: this.isEditable,
      // A totem that is bound and standing nowhere (02 §7, D-708): the pick
      // is made off the table as often as on it, and this is the second door.
      // The handler re-checks all of it at the press, because a rendered
      // banner is a record of a moment.
      plantable: this.isEditable && bond.kind === "totem" && !standsAnywhere(this.actor)
    };
  }

  /** The generator on this creature (D-637): Apply updates it in place. */
  static async #onRework() {
    const { AzerothNpcGenerator } = await import("./npc-generator.mjs");
    if (!AzerothNpcGenerator.reworkable(this.actor)) return null;
    return new AzerothNpcGenerator({ actor: this.actor }).render({ force: true });
  }

  /** Shared with the character sheet - one template, one handler (see actions.mjs). */
  static async #onRollAbility(event, target) {
    // The score is an input inside the plate: a click into it edits, not rolls.
    if (event.target?.matches?.("input")) return;
    return rollAbility(this.actor, target.dataset.ability, event);
  }

  /** 14 SS1: attribute + Proficiency + the Rank shown; an unlisted skill is not offered. */
  static async #onRollSkill(event, target) {
    const key = target.dataset.skill;
    const system = this.actor.system;
    const ability = AZEROTH.skillAbility[key];
    if (!ability || !system.abilities?.[ability]) return null;
    const raw = system.skills?.[key];
    const rank = typeof raw === "number" ? raw : (raw?.rank ?? 0);
    return rollWithDialog(this.actor, {
      kind: "skill",
      skill: key,
      title: game.i18n.localize(AZEROTH.skills[key]),
      modifiers: [
        { label: AZEROTH.abilities[ability], value: system.abilities[ability].mod ?? 0 },
        { label: "AZEROTH.Sheet.Proficiency", value: system.proficiency ?? 0 },
        { label: "AZEROTH.Sheet.Rank", value: rank }
      ]
    }, event);
  }

  static async #onRollResilience(event, target) {
    return resilienceWithDialog(this.actor, target.dataset.resilience, event);
  }

  /** A creature's Short Rest (D-623): Health, and every Sunder on it ends (05 SS11). */
  static async #onShortRest() {
    return this.actor.shortRest();
  }
  static async #onEffectAction(event, target) {
    return effectAction(this.actor, target.dataset.action, target);
  }

  /**
   * An attack row.
   *
   * **TWO KINDS OF ROW, AND THE ITEM ID IS WHAT TELLS THEM APART** (the lead's
   * N2, 2026-09-10). 14's own rows are indexes into `system.attacks` and go
   * through `npcAttackWithDialog` exactly as they always have; a weapon a GM
   * put in the creature's hands is an Item and goes through `attackWithDialog`,
   * the door every character attack already uses — because that one takes a
   * weapon Item end to end (Rating, 08 §5's traits, Pierce, 06's reach and
   * range, the bundle a launcher fires, what is coated on the blade).
   */
  static async #onRollAttack(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId ?? null;
    if (itemId) {
      const weapon = this.actor.items.get(itemId);
      return weapon ? attackWithDialog(this.actor, weapon, event) : null;
    }
    return npcAttackWithDialog(this.actor, Number(target.dataset.attack), event);
  }

  /* -------------------------------------------- */
  /*  The Gear tab (the lead's N3)                 */
  /* -------------------------------------------- */

  /**
   * A thing dropped on a creature.
   *
   * **NOTHING IS INSIDE ANYTHING HERE.** The lead ruled the containers out, so
   * this tab has no container sections and no `data-container-id` drop zone —
   * but `system.container` is a field on every physical item and core's drop
   * copies it across whole. An item dragged off a character who kept it in a
   * backpack would arrive naming that backpack, and `carriedTotal` counts a
   * thing inside a container the actor holds as FREE: drag the pack over too
   * (core keeps the ids) and the creature's carry line silently loses every
   * pound in it, with no section anywhere to show where it went.
   *
   * So the container reference is cleared on arrival. Everything else is core's
   * own drop, and a drop from this actor onto itself is core's sort.
   *
   * @inheritDoc
   */
  async _onDropItem(event, item) {
    const owned = this.actor.uuid === item.parent?.uuid;
    const created = await super._onDropItem(event, item);
    if (owned || !created) return created;
    if (created.system?.container) await created.update({ "system.container": null });
    return created;
  }

  /** 08 SS12 and SS13's Use (D-668): drink it, lay it on a thing, throw it. */
  static async #onUseGear(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return useGearWithDialog(this.actor, item);
  }

  /** Fill a thing that holds charges (08 SS11's waterskin, D-671). */
  static async #onFillCharges(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    await item.update({ "system.charges.value": charges.max });
    ui.notifications?.info(game.i18n.format("AZEROTH.Container.Filled", { name: item.name }));
  }

  /** Spend one. */
  static async #onSpendCharge(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    const left = Math.max(0, (charges.value ?? 0) - 1);
    await item.update({ "system.charges.value": left });
    if (left === 0) ui.notifications?.warn(game.i18n.format("AZEROTH.Container.Empty", { name: item.name }));
  }

  /** Wipe off what was laid on a thing (08 SS13, D-670). */
  static async #onClearCoating(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const held = item.getFlag("azeroth-rpg", "coating");
    await item.unsetFlag("azeroth-rpg", "coating");
    if (held) ui.notifications?.info(game.i18n.format("AZEROTH.Use.Wiped", { name: held.name, item: item.name }));
  }

  /**
   * Star or unstar the row's item (D-612).
   *
   * On a creature the star is a MARK ON THE ROW and nothing gathers the starred
   * ones: there is no Core tab here for them to gather on. The row's own gold
   * star is what reads it, which is what keeps this from being a control with
   * no reader (D-681).
   */
  static async #onToggleFavorite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await this.actor.toggleFavorite(id);
  }

  /** Open an owned item's sheet. */
  static async #onOpenItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet?.render({ force: true });
  }

  /** The browser on a kind of thing; a GM's right click makes a blank one. */
  static async #onBrowseItems(event, target) {
    return browseItems(target.dataset.type);
  }

  /** A new item of the button's type, opened for editing. */
  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    if (!type || !CONFIG.Item.dataModels[type]) return;
    const name = game.i18n.format("AZEROTH.Sheet.NewItem", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    item?.sheet?.render({ force: true });
    return item;
  }

  /** Delete, after a confirm - the one destructive click on the tab. */
  static async #onDeleteItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AZEROTH.Sheet.Delete") },
      content: `<p>${game.i18n.format("AZEROTH.Sheet.DeleteConfirm", { name: item.name })}</p>`,
      rejectClose: false
    });
    if (yes) return item.delete();
  }

  /**
   * Equip or unequip, through `rules/worn.mjs#displacedBy` — the SAME rule the
   * character's three doors ask, so one suit at a time, one Augment at a time,
   * one thing in each of 08 §11's slots and the two-handed grip all hold on a
   * creature without a second copy of any of them.
   *
   * **THE AUGMENT IS ALLOWED, DELIBERATELY** (2026-09-10). The character's door
   * refuses one through `canCarry(category, this.actor.classNames)` — but
   * `classNames` is `[]` on a creature and `canCarry` returns **true** for an
   * empty list on purpose (*a character with no class at all is not refused,
   * because the refusal would fire before the class is chosen*). So the check
   * was never a refusal here, it was a no-op wearing a refusal's clothes, and
   * `castWithDialog` has been reading a creature's held Augment onto its
   * Casting Test for as long as a creature could hold one at all. Keeping it
   * would be a line that looks like a rule and enforces nothing.
   *
   * 08 §9 says *an Augment is equipment only your class can carry*, and a
   * creature holds no class item for that lock to bite on; the lead's N1 says
   * gear adds to the block. So it is allowed and the tab SAYS SO — see
   * `#augmentNote` — rather than being allowed in silence or greyed without a
   * reason, which is the fault the Signature panels were corrected for.
   */
  static async #onToggleEquipped(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    const augment = item?.system?.augment ?? null;
    const worn = item?.type === "gear" && isWornSlot(item.system?.slot);
    if (!item || !(["weapon", "armor"].includes(item.type) || augment || worn)) return;
    const equipping = !item.system.equipped;
    const updates = [{ _id: item.id, "system.equipped": equipping }];
    if (equipping) {
      for (const other of displacedBy(item, this.actor.items)) {
        updates.push({ _id: other.id, "system.equipped": false });
      }
    }
    return this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * The one line the tab prints about an Augment a creature is holding: which
   * class 08 §9 gives it to, and that a creature is not one.
   *
   * Drawn only where there is one in hand, so it is a sentence about the
   * situation rather than furniture on every creature's tab.
   */
  #augmentNote() {
    const held = heldAugment(this.actor.items.filter(i => i.type === "gear"));
    if (!held) return null;
    return game.i18n.format("AZEROTH.Augment.CreatureNote", { name: held.name, className: held.className });
  }

  /** The characters this creature could be bound to: every one for a GM, the ones a player owns otherwise. */
  #characters() {
    return game.actors.filter(a => a.type === "character" && (game.user.isGM || a.isOwner));
  }

  /**
   * Bind this creature to a character (D-649): which character, as what
   * kind - the kind guessed from the type - then the bond written on and
   * the character's feature told.
   */
  static async #onBindTo() {
    const characters = this.#characters();
    if (!characters.length) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.NoCharacters"));
      return null;
    }
    const type = this.actor.system.creatureType;
    const guess = type === "beast" || type === "dragonkin" ? "companion" : type === "demon" ? "demon"
      : type === "elemental" ? (/totem/i.test(this.actor.name) ? "totem" : "elemental") : "summon";
    const option = (value, label, selected) => `<option value="${value}"${selected ? " selected" : ""}>${label}</option>`;
    const content = `<div class="azeroth-bind-to">
      <p>${game.i18n.format("AZEROTH.Bound.BindToPrompt", { name: this.actor.name })}</p>
      <label>${game.i18n.localize("AZEROTH.Bound.Character")}
        <select name="owner">${characters.map((a, i) => option(a.uuid, a.name, i === 0)).join("")}</select></label>
      <label>${game.i18n.localize("AZEROTH.Bound.As")}
        <select name="kind">${Object.entries(AZEROTH.boundKinds).map(([k, l]) => option(k, game.i18n.localize(l), k === guess)).join("")}</select></label>
    </div>`;
    const { DialogV2 } = foundry.applications.api;
    const choice = await DialogV2.wait({
      id: `azeroth-bind-to-${this.actor.id}`,
      classes: ["azeroth", "azeroth-roll-dialog"],
      window: { title: game.i18n.localize("AZEROTH.Bound.BindTo") },
      position: { width: 400 },
      content,
      rejectClose: false,
      buttons: [{ action: "bind", label: "AZEROTH.Bound.BindTo", default: true, callback: (event, button) => ({ owner: button.form.elements.owner?.value, kind: button.form.elements.kind?.value }) }]
    });
    if (!choice?.owner) return null;
    const owner = await fromUuid(choice.owner);
    if (!owner) return null;
    return adopt({ owner, actor: this.actor, kind: choice.kind, feature: featureForKind(owner, choice.kind) });
  }

  /** Use an ability or a Boss Action (D-647). */
  static async #onUseAbility(event, target) {
    return useAbilityWithDialog(this.actor, target.dataset.list, Number(target.dataset.index), event);
  }

  /**
   * Cast from the Spells tab.
   *
   * **TWO KINDS OF ROW, AND THE ITEM ID IS WHAT TELLS THEM APART**, as the
   * attack rows already do. A spell a GM dropped on the creature is an Item
   * and goes through `castWithDialog`, the door a character's cast uses; one
   * of 14's own names is not a document the creature holds, so it is fetched
   * from 07 by name (D-647). The `data-name` contract is what
   * `quench-phase10.mjs` reads.
   */
  static async #onCastSpell(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId ?? null;
    if (itemId) {
      const spell = this.actor.items.get(itemId);
      return spell?.type === "spell" ? castWithDialog(this.actor, spell, event) : null;
    }
    const name = target.dataset.name ?? target.closest("[data-name]")?.dataset.name ?? null;
    return name ? castNamedSpell(this.actor, name, event) : null;
  }

  /**
   * Drop a Sustain (D-355, D-705). A given spell is matched by its item id; a
   * block spell has no id on this actor, so the row carries the pack
   * document's uuid — which is the half of `endSustain` nothing called.
   */
  static async #onEndSustain(event, target) {
    const row = target.closest("[data-item-id],[data-uuid]");
    return game.system.azeroth.workflows.endSustain({
      actor: this.actor,
      spellId: row?.dataset.itemId ?? null,
      uuid: row?.dataset.uuid ?? null
    });
  }

  /**
   * Plant a bound totem beside its shaman (02 §7, D-708).
   *
   * The pick is often made away from the table — the chooser runs wherever
   * the sheet is open — and `useFeature` then binds the totem, says it could
   * not plant it, and leaves it in the folder. This is the way back onto the
   * board, with the ground it holds drawn on arrival. The radius comes from
   * the shaman's own class table where the name is still there, else from
   * `rules/totems.mjs`'s reading of the creature's own ability text, which is
   * what `totemBlock` wrote onto a blockless totem in the first place.
   */
  static async #onPlantTotem() {
    const totem = worldActorOf(this.actor);
    const bond = bondOf(totem);
    const owner = bond?.ownerUuid ? await fromUuid(bond.ownerUuid) : null;
    if (!owner) return null;
    const row = (owner.classItems ?? [])
      .flatMap(c => c.system?.totems ?? [])
      .find(t => bareName(t.name) === bareName(totem.name)) ?? null;
    const description = row?.description
      ?? (totem.system?.creatureAbilities ?? []).map(a => a.description ?? "").join(" ");
    return plantTotem({ owner, totem, aura: totemAura({ name: totem.name, description }) });
  }

  /** Release the bond (D-643): the owner or the GM, from the banner. */
  static async #onRelease() {
    const bond = bondOf(this.actor);
    const owner = bond?.ownerUuid ? await fromUuid(bond.ownerUuid) : null;
    if (!owner) return worldActorOf(this.actor).unsetFlag("azeroth-rpg", "bond");
    return release(owner, worldActorOf(this.actor).uuid);
  }

  /**
   * The banner's portrait opens the full illustration (D-688).
   *
   * The portrait itself is the TOKEN — 512px, round, transparent — because it
   * is drawn at 64px and a 1024x1536 plate cropped to that square loses the
   * figure. The plate is `system.art` and this is its door. Core's popout
   * carries a GM's *Show to Players* control of its own, so nothing here has
   * to build one.
   */
  static async #onViewArt() {
    const src = this.actor.system.art;
    if (!src) return;
    new foundry.applications.apps.ImagePopout({
      src,
      uuid: this.actor.uuid,
      window: { title: this.actor.name }
    }).render(true);
  }
}
