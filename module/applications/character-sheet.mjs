/**
 * The character sheet. `D11-SHEET-AND-CARD-DESIGN` is the contract; this
 * implements §1's PARTS map and nothing beyond it.
 *
 * THE THREE THINGS D11 SAYS ARE EASY TO GET WRONG:
 *
 *  1. **Attributes and Skills are never behind a tab** (D-506). They are
 *     consulted constantly and the tabs switch only the right-hand panel.
 *  2. **Gear and Progress span the Skills column.** Skills takes
 *     `display: none` and A HIDDEN ELEMENT IS NOT A GRID ITEM, so the track
 *     list has to lose a track with it or the panel lands in the wrong column.
 *  3. **Nothing here is a progress bar** (D-508). Levels are granted and XP is
 *     a purse; a bar filling toward something is the wrong idea twice over.
 *
 * ApplicationV2 only (CLAUDE.md §5). The render hooks hand back a native
 * HTMLElement, never jQuery, and interactions are wired through the `actions`
 * map and `data-action` rather than ad-hoc listeners.
 */

import { AZEROTH } from "../config.mjs";
import { attackWithDialog, bindKeyActivation, bindPlateKeys, bindPoolInputs, bindScoreInputs, blankItemMenu, browseItems, browseSpells, containersFor, grantsOf, maneuversContext, castItemSpell, castWithDialog, detailFields, effectAction, effectsContext, exposeWithDialog, itemContextMenu, putInContainer, resilienceWithDialog, rollAbility, rollWithDialog, signatureContext, skillContextMenu, skillTooltip, stepPool, useFeatureWithDialog, useGearWithDialog, useSignatureWithDialog, wearable } from "./actions.mjs";
import { hasSignature } from "../rules/signatures.mjs";
import { inPlay } from "../rules/in-play.mjs";
import { RANK_MAX, ledgerTotal, rankCost, unspent } from "../rules/xp.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { originParts } from "../rules/origin.mjs";
import { stepUses } from "../rules/uses.mjs";
import { maneuverCost } from "../rules/maneuvers.mjs";
import { targetSnapshots } from "./roll-dialog.mjs";
// A Short Rest asks what is eaten and drunk before it rests (05 §16, D-733).
import { shortRestWithDialog } from "./rest-dialog.mjs";
import { clearHidden, clearMark, clearReady, disengage, guard, hide, leaveShapeControl, markQuarry, primeRider, ready } from "./combat-actions.mjs";
// A rider paid before the blow, the Combat tab's control (D-770).
import { chargeLines } from "../rules/riders.mjs";
import { chargeControl } from "../helpers/rider-words.mjs";
// A shape on the sheet (02 §7, D-769): its name, what melds, the attack's ability.
import { SHAPE_ABILITIES, meldsGear, shapeKindOf, shapeRefusal } from "../rules/shapes.mjs";
import { featurePrice } from "../rules/class-features.mjs";
import { shapeLabel } from "../documents/shapes.mjs";
import { attackAbility } from "../rules/ammunition.mjs";
// Whether the character is out of sight, for the Combat tab's chip (D-717).
import { isHidden } from "../effects/stealth.mjs";
import { POINTS_AVAILABLE, buildTree, canTake, canTakeRacial, canUntake, canUntakeRacial, racialPicksFor, pointsSpent, talentPointsFor, tileState } from "../rules/talents.mjs";
// The class's crest behind its tree, or null where there is no file (D-758).
import { crestPath } from "../rules/crests.mjs";
import { exitsFrom, isEligible } from "../rules/careers.mjs";
import { tierForLevel, featuresUnlocked, secondaryLevel, secondaryTier } from "../rules/progression.mjs";
import { manaPrice, showsSpells, spellsKnown } from "../rules/casting.mjs";
import { onUseOf, talentEffect } from "../rules/talent-effects.mjs";
import { hasUse } from "../rules/consumables.mjs";
import { containerOf, hasCharges, isContainer, isWorn } from "../rules/containers.mjs";
import { canCarry, heldAugment } from "../rules/augments.mjs";
import { FIGURE_HANDS, FIGURE_LEFT, FIGURE_RIGHT, copyLabels, displacedBy, figureSlots, fitsSlot, handFor } from "../rules/worn.mjs";
import { BASE_SLOTS, MAX_CONTAINERS, REFUSALS, areTwins, arrange, isMount, judgeMerge, judgePlace, judgeSplit, judgeSwap, ledger, placeOf, slotLine, slotsIn, stackKey, unitsOf, wearNew, wellsOf } from "../rules/slots.mjs";
// The Gear tab as bag slots (D-738): the panels, the order and the tooltip.
import { BLURB_KINDS, TILE_KINDS, TILE_PLACES, badgeOf, buildPanels, gridStep, kindOf, nextSort, primaryAction, slotOrder, tidyBags, tipModel } from "../rules/bags.mjs";
// A find still under offer is taken from the loot window, never dragged
// (D-721). The sheet asks the document's own question before it writes.
import { underOffer } from "../rules/loot-offer.mjs";
// The derived bag-slot line, composed once and drawn on the tooltip, the
// inspector and the item sheet alike (D-677: the words arrive in a bag).
import { derivedValue } from "./item-fields.mjs";
// The Gear tab's rows, shared with the creature's tab (the lead's N3).
import { carriedRows, describeRows } from "./carried.mjs";
import { WORN_SCALARS } from "../rules/grants.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import { fittingBundles, selectAmmunition, shotDamage } from "../rules/ammunition.mjs";
import { calledShotCost } from "../rules/modifiers.mjs";
import { AzerothCharacterCreator } from "./creator.mjs";
import { inCareerSkills, skillFromKnown } from "../rules/creation.mjs";
import { coins } from "../helpers/coins.mjs";
// 05's temporary Health on the banner (D-777).
import { temporaryHealthContext } from "../effects/temporary-health.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * The Gear tab's Item Preview, open or shut, on the USER (the lead,
 * 2026-09-20).
 *
 * It is the READER's own preference rather than the actor's: two players
 * sharing a character must not fight over whether the card column is showing,
 * and it has to survive a reload, which rules out the sheet-local view state
 * `#selected` and `#openBranch` use. A user with no flag yet reads OPEN.
 */
const PREVIEW_FLAG = "gearPreview";

/** `+3` / `−2` / `+0`, as `azerothSigned` prints one, for a string composed in code. */
function signed(value) {
  const n = Number(value) || 0;
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/**
 * The zone a drag landed in, BY KIND - and the kind is the whole point
 * (D-673, D-687, D-738).
 *
 * Three families of zone live on this sheet: the Overview tab's slot tiles,
 * keyed `data-slot`; the Gear tab's bags, keyed `data-container-id` (an id,
 * or `""` for the base pack); and the Gear tab's furniture - the figure, the
 * bag bar, the mount place, the stable and the inspector - keyed
 * `data-bag-zone`. They never share a panel, but a drop that answered only
 * "which id" would send a ring dropped on the Ring tile into the container
 * path as a move to nowhere. Answer by kind, and let `null` - every other tab
 * - hand the event back to core's sort.
 *
 * **A slot zone carries its index** (D-689): a finger and a trinket draw two
 * tiles off one slot key, so a drop on Finger 2 has to say *which* tile it
 * landed on or `displacedBy` would always put away the first ring. `barred`
 * is the tile's own `aria-disabled`, which is what stops the drag lighting a
 * zone the drop will refuse.
 *
 * **`over` is the TILE the drop landed on**, wherever there is one - and a
 * TAKEN well answers with its owner (`data-of`), because a two-well thing has
 * one tile and a run of wells and a drop on the run means the thing.
 *
 * **`well` is WHICH WELL of that panel** (the lead, 2026-09-20: *I need to be
 * able to place a carried/bag item in any slot, not just the next
 * available*). Every cell a panel draws carries `data-well`, so a drop on an
 * empty well puts the thing THERE and a drop on an occupied one swaps the
 * two. It is null everywhere there are no wells - the bar, the mount place,
 * the Stable, the figure, the over row - and a drop there behaves exactly as
 * it always did. **The ZONE is still the panel**, so neither the highlight
 * nor D-748's audit moves: the well is extra information read off the cell
 * under the pointer, never a zone of its own.
 *
 * **A ZONE IS ITS WHOLE VISIBLE BOX** (the lead, 2026-09-20): the attribute
 * sits on the element a reader sees and aims at, never on an inner list, or a
 * drop on a heading or on a run's own padding matches nothing and is handed
 * back to core in silence. `zone.el` is what lights on a dragover, so the two
 * are the same box by construction.
 *
 * @returns {{kind: string, container?: string, place?: string|null, slot?: string,
 *   index?: number, barred?: boolean, over: string|null, well: number|null,
 *   el: HTMLElement} | null}
 */
function dropZoneOf(event) {
  const target = event?.target ?? null;
  const el = target?.closest?.("[data-container-id],[data-slot],[data-bag-zone]");
  if (!el) return null;
  if (typeof el.dataset.slot === "string") {
    const index = Number(el.dataset.index);
    return {
      kind: "slot",
      slot: el.dataset.slot,
      index: Number.isInteger(index) ? index : undefined,
      barred: el.getAttribute("aria-disabled") === "true",
      over: null,
      well: null,
      el
    };
  }
  const tile = target.closest?.("[data-item-id]") ?? null;
  const taken = target.closest?.("[data-of]") ?? null;
  const over = tile?.dataset.itemId ?? taken?.dataset.of ?? null;
  const cell = target.closest?.("[data-well]") ?? null;
  const at = cell ? Number(cell.dataset.well) : NaN;
  const well = Number.isInteger(at) && at >= 0 ? at : null;
  if (typeof el.dataset.containerId === "string") {
    // **A BAR PLACE IS NOT A PANEL.** Both carry `data-container-id` - the
    // place so that a thing dropped on a worn bag's icon goes in that bag -
    // but a CONTAINER dropped on a place means *wear this one instead*, and
    // there is no other reading left: D-736 retired the bag inside a bag.
    const place = el.closest('[data-bag-zone="bar"]') ? "bar" : null;
    return { kind: "container", container: el.dataset.containerId, place, over, well, el };
  }
  return { kind: el.dataset.bagZone, over, well, el };
}

export class AzerothCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "sheet", "actor", "character"],
    // 880 wide: D11 §1's 860 of interior PLUS two `--azeroth-frame-edge` of
    // stone (D-734). The frame is drawn inside the window box rather than
    // around it — `.application` keeps core's `overflow: hidden` — so the
    // columns would each lose five pixels at 860 and the three-column body is
    // what D11 measured. `quench-frame.mjs` re-derives 880 from the token, so
    // a change to the edge fails here rather than shaving the interior.
    position: { width: 880, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollSkill: AzerothCharacterSheet.#onRollSkill,
      rollAbility: AzerothCharacterSheet.#onRollAbility,
      shortRest: AzerothCharacterSheet.#onShortRest,
      longRest: AzerothCharacterSheet.#onLongRest,
      openBranch: AzerothCharacterSheet.#onOpenBranch,
      closeBranch: AzerothCharacterSheet.#onCloseBranch,
      takeTalent: AzerothCharacterSheet.#onTakeTalent,
      // A point handed back between fights (04 SS1, D-713).
      untakeTalent: AzerothCharacterSheet.#onUntakeTalent,
      // A talent socket pressed: pin its card open, or put it away (D-758).
      toggleTalentCard: AzerothCharacterSheet.#onToggleTalentCard,
      rollAttack: AzerothCharacterSheet.#onRollAttack,
      // A shape's own attack row (02 §7, D-769), through the weapon door.
      rollNaturalAttack: AzerothCharacterSheet.#onRollNaturalAttack,
      openItem: AzerothCharacterSheet.#onOpenItem,
      createItem: AzerothCharacterSheet.#onCreateItem,
      deleteItem: AzerothCharacterSheet.#onDeleteItem,
      toggleEquipped: AzerothCharacterSheet.#onToggleEquipped,
      // The Gear tab as bag slots (D-738, D-740, D-741): a tile selects, the
      // bags are put back in order, and the inspector's three moves.
      selectItem: AzerothCharacterSheet.#onSelectItem,
      // Item Preview hidden and unhidden from its own title strip (the lead,
      // 2026-09-20). The state is the READER's and lives on `game.user`.
      togglePreview: AzerothCharacterSheet.#onTogglePreview,
      tidyBags: AzerothCharacterSheet.#onTidyBags,
      makeRoom: AzerothCharacterSheet.#onMakeRoom,
      putInItem: AzerothCharacterSheet.#onPutInItem,
      takeOutItem: AzerothCharacterSheet.#onTakeOutItem,
      splitStack: AzerothCharacterSheet.#onSplitStack,
      burnTether: AzerothCharacterSheet.#onBurnTether,
      rollResilience: AzerothCharacterSheet.#onRollResilience,
      spendPool: AzerothCharacterSheet.#onSpendPool,
      // A point put in or taken out by hand (the lead, 2026-09-13).
      stepPool: AzerothCharacterSheet.#onStepPool,
      exposure: AzerothCharacterSheet.#onExposure,
      stopSustaining: AzerothCharacterSheet.#onStopSustaining,
      castSpell: AzerothCharacterSheet.#onCastSpell,
      castItemSpell: AzerothCharacterSheet.#onCastItemSpell,
      stepSpellUses: AzerothCharacterSheet.#onStepSpellUses,
      browseSpells: AzerothCharacterSheet.#onBrowseSpells,
      // A Sustain ended from its row (2026-09-06).
      endSustain: AzerothCharacterSheet.#onEndSustain,
      browseItems: AzerothCharacterSheet.#onBrowseItems,
      // A slot tile on the Overview tab: the picker over what is CARRIED
      // (D-689), never the browser.
      pickSlot: AzerothCharacterSheet.#onPickSlot,
      buyRank: AzerothCharacterSheet.#onBuyRank,
      grantXP: AzerothCharacterSheet.#onGrantXP,
      toggleCondition: AzerothCharacterSheet.#onEffectAction,
      stepCondition: AzerothCharacterSheet.#onEffectAction,
      toggleEffect: AzerothCharacterSheet.#onEffectAction,
      editEffect: AzerothCharacterSheet.#onEffectAction,
      deleteEffect: AzerothCharacterSheet.#onEffectAction,
      expandItem: AzerothCharacterSheet.#onExpandItem,
      useFeature: AzerothCharacterSheet.#onUseFeature,
      useGear: AzerothCharacterSheet.#onUseGear,
      // An item's Signature pressed (08 §20, S3; D-692), from the Combat tab's
      // panel and from the Overview tab's In-force column.
      useSignature: AzerothCharacterSheet.#onUseSignature,
      clearCoating: AzerothCharacterSheet.#onClearCoating,
      fillCharges: AzerothCharacterSheet.#onFillCharges,
      spendCharge: AzerothCharacterSheet.#onSpendCharge,
      stepUses: AzerothCharacterSheet.#onStepUses,
      useManeuver: AzerothCharacterSheet.#onUseManeuver,
      guard: AzerothCharacterSheet.#onGuard,
      // 05's two Half-Actions that 06 SS6's Reactions need (D-694).
      disengage: AzerothCharacterSheet.#onDisengage,
      ready: AzerothCharacterSheet.#onReady,
      clearReady: AzerothCharacterSheet.#onClearReady,
      // Hide, and the chip's x (D-717).
      stealth: AzerothCharacterSheet.#onStealth,
      clearHidden: AzerothCharacterSheet.#onClearHidden,
      markQuarry: AzerothCharacterSheet.#onMarkQuarry,
      clearMark: AzerothCharacterSheet.#onClearMark,
      // Leave the shape (D-769): the banner's Leave and the Combat chip's x.
      leaveShape: AzerothCharacterSheet.#onLeaveShape,
      // A rider paid before the blow (D-770; the lead: *"Either order"*).
      primeRider: AzerothCharacterSheet.#onPrimeRider,
      toggleFavorite: AzerothCharacterSheet.#onToggleFavorite,
      calledShot: AzerothCharacterSheet.#onCalledShot,
      openCreator: AzerothCharacterSheet.#onOpenCreator,
      // The Overview tab's centre image (D-700). `editImage` on the banner is
      // core's own and is registered by `DocumentSheetV2`; these two are ours
      // because `system.art` is ours.
      editArt: AzerothCharacterSheet.#onEditArt,
      viewArt: AzerothCharacterSheet.#onViewArt
    }
  };

  /**
   * D11 §1's PARTS map. `banner`, `attributes` and `skills` are always
   * rendered; the last five are the tabbed panel.
   */
  static PARTS = {
    banner: { template: "systems/azeroth-rpg/templates/actor/banner.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    attributes: { template: "systems/azeroth-rpg/templates/actor/attributes.hbs" },
    skills: { template: "systems/azeroth-rpg/templates/actor/skills.hbs", scrollable: [""] },
    overview: { template: "systems/azeroth-rpg/templates/actor/overview.hbs", scrollable: [""] },
    core: { template: "systems/azeroth-rpg/templates/actor/core.hbs", scrollable: [""] },
    combat: { template: "systems/azeroth-rpg/templates/actor/combat.hbs", scrollable: [""] },
    spells: { template: "systems/azeroth-rpg/templates/actor/spells.hbs", scrollable: [""] },
    gear: { template: "systems/azeroth-rpg/templates/actor/gear.hbs", scrollable: [""] },
    progress: { template: "systems/azeroth-rpg/templates/actor/progress.hbs", scrollable: [""] },
    corruption: { template: "systems/azeroth-rpg/templates/actor/corruption.hbs", scrollable: [""] }
  };

  /**
   * The seven tabs of D11 §1: Overview first (D-687), Spells after Combat
   * (D-599).
   *
   * **`initial` stays `core`.** Making Overview the landing tab is one line,
   * and it is the lead's call: every Quench phase that queries the Core tab
   * straight after `openSheet` would need a `changeTab` before it, and that
   * sweep is not this change.
   */
  static TABS = {
    primary: {
      initial: "core",
      labelPrefix: "AZEROTH.Tab",
      tabs: [
        { id: "overview" },
        { id: "core" },
        { id: "combat" },
        { id: "spells" },
        { id: "gear" },
        { id: "progress" },
        { id: "corruption" }
      ]
    }
  };

  /** Overview, Gear, Progress and Spells span the Skills column (D11 §1, D-599, D-687). */
  static WIDE_TABS = Object.freeze(["overview", "gear", "progress", "spells"]);

  /* -------------------------------------------- */

  /**
   * THE TITLE IS THE CHARACTER'S NAME (D-734).
   *
   * Core's `DocumentSheetV2#title` prefixes the document's type —
   * *Character: Kaelen Voss* — which is the label of a window, not the name of
   * a person, and WoW's character pane carries the name alone in gold. The
   * name shows twice now, here and in the banner's editable input; today's
   * header already duplicated it, and the plan leaves the call to the lead
   * with a shot to judge from.
   *
   * Precedent: `compendium-browser.mjs`'s pick-mode title. `super.title` is
   * the fallback, so an actor that is somehow absent still gets a title rather
   * than an empty header.
   *
   * @inheritDoc
   */
  get title() {
    return this.actor?.name || super.title;
  }

  /* -------------------------------------------- */

  /**
   * Whether this character has a spell to show (D-639): a casting class, a
   * spell item, or an item that casts one. The Ranger's Spell DC is not
   * casting.
   */
  #showsSpells() {
    return showsSpells({
      classes: (this.actor.classItems ?? []).map(c => ({
        caster: c.system?.power?.caster ?? "none",
        castingAbility: c.system?.castingAbility ?? null
      })),
      spellItems: this.actor.items.filter(i => i.type === "spell").length,
      itemSpells: this.actor.items.reduce((n, i) => n + (Array.isArray(i.system?.spells) ? i.system.spells.length : 0), 0)
    });
  }

  /**
   * The tab map is D-599's six; Spells is drawn only where there is a spell
   * to show (D-639). Core's `_prepareTabs` reads this, so a tab left out
   * here gets no button and no record.
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== "primary" || !config || this.#showsSpells()) return config;
    return { ...config, tabs: config.tabs.filter(t => t.id !== "spells") };
  }

  /**
   * A part with no tab renders with `tab` undefined and sits in the DOM
   * unseen, so the part goes with the button; and a sheet open on Spells
   * when the last spell leaves falls back to Core.
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (this.#showsSpells()) return;
    options.parts = (options.parts ?? []).filter(p => p !== "spells");
    if (this.tabGroups.primary === "spells") this.tabGroups.primary = "core";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.config = AZEROTH;
    context.system = system;
    context.tabs = this._prepareTabs("primary");

    // The grid loses a track when the active tab spans the Skills column, and
    // Skills is hidden with it — a hidden element is not a grid item, so the
    // two have to move together (D11 §1).
    const active = this.tabGroups.primary ?? "core";
    context.wide = AzerothCharacterSheet.WIDE_TABS.includes(active);

    // **THE SHAPE WORN** (02 §7, D-769): the banner's line, the plates' marks,
    // the Combat tab's rows and the Overview's Stats all read this one object.
    context.shape = this.#shapeContext();

    context.abilities = Object.entries(system.abilities ?? {}).map(([key, ability]) => {
      // A score the shape has taken (the lead: *"Physical half"*): marked
      // *form*, the character's own score on its tooltip, and NOT editable - the
      // plate's input writes the stored score back, and what it would write is
      // the block's.
      const formed = Boolean(context.shape) && SHAPE_ABILITIES.includes(key);
      return {
      key,
      label: AZEROTH.abilities[key],
      value: ability.value,
      mod: ability.mod,
      // What is worn adds to the score (08 §6, 2026-09-06): the total on a
      // chip when it differs from the stored score.
      bonus: ability.bonus ?? 0,
      total: ability.total ?? ability.value,
      // The plate shows the score as worn and says how it got there on hover
      // (the lead, 2026-09-06): `15 + 1 · Longsword of the Bear`.
      formula: ability.bonus
        ? `${ability.value} ${(ability.sources ?? []).map(src => `${src.points < 0 ? "−" : "+"} ${Math.abs(src.points)} · ${src.name}`).join(" ")}`
        : null,
      form: formed
        ? {
            mark: game.i18n.localize("AZEROTH.Shape.FormMark"),
            tip: game.i18n.format("AZEROTH.Shape.OwnScore", {
              form: context.shape.label, ability: game.i18n.localize(AZEROTH.abilities[key]),
              score: ability.own?.total ?? ability.value
            })
          }
        : null,
      // Stated, not implied: the shared attributes.hbs draws no action on an
      // absent plate, and a character never has one.
      absent: false,
      // Spread onto the row: a bare {{editable}} inside #each is the row's,
      // not the root's (D-609).
      editable: this.isEditable && !formed,
      // A Resilience Test adds Proficiency only where the class is trained
      // (05 §1), which is why the save differs from the modifier.
      save: this.#resilienceFor(key),
      resilience: Object.entries(AZEROTH.resilienceAbility).find(([, a]) => a === key)?.[0] ?? null
      };
    });

    context.skills = this.#skills();
    context.pools = this.#pools();
    // banner.hbs binds {{actor.name}} and {{actor.img}}. Core's context has
    // `document`, never `actor`, so the name input rendered EMPTY, an empty
    // required name failed validation on every submit, and no input on the
    // sheet - Health, Fatigue, the tracks - had ever saved (found 2026-09-02
    // by a probe, after a corruption input "did not fire").
    context.actor = this.actor;
    // The three images (D-700), resolved once for the banner and the Overview
    // tab rather than bound field-by-field in two templates.
    context.portrait = this.#portraits();
    context.corruption = this.#corruptionTracks();
    context.sustaining = this.actor.getFlag("azeroth-rpg", "sustaining") ?? [];
    context.spells = this.#spells();
    context.spells.fromItems = this.#itemSpells();
    context.effects = effectsContext(this.actor);
    context.isGM = game.user.isGM;
    // The Party (2026-09-06): a chip on the banner where the GM marked it.
    context.party = this.actor.isParty === true;
    // The purse and the ledger. `xp.spent` stays authoritative and the ledger's
    // own total sits beside it: D2 SS2.4 says reconcile, and overwriting on
    // load would erase a GM's hand edit.
    const ledger = this.actor.getFlag("azeroth-rpg", "xpLedger") ?? [];
    const ledgerSum = ledgerTotal(ledger);
    context.xp = {
      earned: system.xp?.earned ?? 0,
      spent: system.xp?.spent ?? 0,
      unspent: unspent(system.xp ?? {}),
      ledger: [...ledger].reverse(),
      ledgerTotal: ledgerSum,
      mismatch: ledger.length > 0 && ledgerSum !== (system.xp?.spent ?? 0)
    };

    // D11 §4's drill-down. Assembled here rather than in _preparePartContext
    // so the Progress tab has it whether or not it is the active part.
    // **IN A SHAPE THE WEAPONS MELD** (the lead: *"Melds; Signatures count"*,
    // D-769): the Combat tab draws the block's own rows instead, read through
    // `readyWeapons`, and names what melded in words.
    context.weapons = context.shape?.melds ? [] : this.#weapons();
    context.ammunition = context.shape?.melds ? [] : this.#ammunition();
    context.carried = this.#carried();
    // The Core tab's class features and the starred rows beneath Fatigue (D-612).
    context.features = await this.#features();
    context.usableTalents = await this.#usableTalents();
    context.favorites = await this.#favorites();
    // Every row's inline detail opens on what the entry says (2026-09-06).
    await this.#describeRows([
      ...context.weapons, ...context.ammunition, ...context.carried,
      ...(context.spells?.tiers ?? []).flatMap(t => t.spells),
      ...(context.favorites?.rows ?? [])
    ]);
    // Every row's star reads the same set.
    const starred = new Set(this.actor.favorites);
    for (const row of context.weapons) row.favorite = starred.has(row.id);
    for (const row of context.carried) row.favorite = starred.has(row.id);
    for (const tier of context.spells?.tiers ?? []) for (const row of tier.spells) row.favorite = starred.has(row.id);
    // What is carried against what can be, IN BAG SLOTS (05 *Speed and
    // movement*, 08 §11; D-735). `slotLine` is `loadLine`'s exact shape plus
    // `over`, so the Gear tab's head line, the Overview's In force row and
    // the creature's own pounds all draw through one rule.
    context.load = slotLine({
      used: system.bagSlots?.used ?? 0,
      capacity: system.bagSlots?.capacity ?? 0,
      over: system.bagSlots?.over ?? 0,
      state: system.load ?? "unencumbered"
    });
    // The Gear tab: the bar, the panels and the hidden inspector cards
    // (D-738). Built AFTER `describeRows`, because every card prints the
    // entry's own prose, and after `load`, because the head line is the same
    // object.
    context.bags = await this.#bags(context.carried);
    // Item Preview (the lead, 2026-09-20). The id is built HERE rather than
    // from `{{actor.id}}` in the template, which renders empty when the
    // context carries `document` (D-603) — and an `aria-controls` pointing at
    // nothing is worse than none.
    context.previewOpen = this.#previewShowing();
    context.previewId = `azeroth-preview-${this.actor.id}`;
    // The Signatures in play (08 §20, S3; D-692): the Combat tab's panel, after
    // Talents in play, which is already exactly this shape. Assembled BEFORE
    // the Overview, whose In-force column summarises the same rows — one
    // judgement, so the summary and the controls cannot disagree.
    context.signatures = await this.#signatures();
    // The Overview tab's figure and its In force column (D-687). Assembled
    // after `load`, because the carry line is the same object the Gear tab's
    // head line reads and there is one of it — and after `effects`, because
    // the strip under the hands row is a READING of the very object Core's
    // conditions grid and effect list are drawn from (2026-09-20), so the two
    // tabs cannot disagree about what is standing.
    context.overview = await this.#overview(context.load, context.signatures, context.effects, context.shape);
    // Where a thing is kept is NOT a control on the row (the lead,
    // 2026-09-07): it is a drag onto the container, or *Put in* off the
    // row's right click. `containersFor` is the one place that says which
    // containers are legal, and both doors ask it.
    context.locations = Object.entries(AZEROTH.locations)
      .map(([key, label]) => ({ key, label }));
    // The Combat tab (D-617): the armour figure's three tiles, each with its
    // AP and the called shot's price (06 SS2: a Bane for a Limb, a Bane and -2
    // for the Head); Defense and any Ward beside it; the Momentum maneuvers.
    context.combat = {
      location: this.#location,
      tiles: ["head", "body", "limb"].map(key => {
        const cost = calledShotCost(key);
        return {
          key,
          label: AZEROTH.locations[key],
          ap: system.ap?.[key] == null ? null : Math.max(0, system.ap[key]),
          banes: cost.banes,
          modifier: cost.modifier,
          selected: key === this.#location
        };
      }),
      defense: system.defense ?? null,
      ward: Object.entries(system.ward ?? {})
        .filter(([, v]) => Number(v) > 0)
        .map(([school, value]) => ({ school, label: AZEROTH.schools[school] ?? school, value })),
      maneuvers: this.#maneuvers(),
      // The fight's controls (D-627, D-694): Guard; Disengage's state and the
      // action Ready named, both of which live in the fight; the mark where
      // Quarry is held; the form worn.
      canMark: (this.actor.poolSnapshot?.() ?? []).some(p => p.kind === "momentum" && p.name === "quarry"),
      mark: this.actor.getFlag("azeroth-rpg", "mark") ?? null,
      disengaging: this.actor.statuses?.has("disengaging") === true,
      // Out of sight (D-717). Read off the STATUS rather than off the system's
      // own flag, so a GM's hand-toggled invisibility draws the chip too and
      // its x is a control that does something.
      hidden: isHidden(this.actor),
      ready: this.#readied(),
      // The shape worn, of any kind (D-769): its chip, its rows, what melded.
      shape: context.shape,
      // 02 §7's Sprint (D-712): the turn's free Move, read off the budget the
      // combatant holds rather than off the feature - the feature is held all
      // fight and the Move is the first turn's alone.
      freeMove: this.#freeMove(),
      // A rider whose spend buys a move, paid before the blow (04's Feral
      // Charge; the lead, 2026-10-03: *"Either order"*).
      charges: this.#charges()
    };
    context.talents = await this.#talents();
    context.racial = await this.#racial();
    context.career = await this.#career();

    // The identity line: race and the classes held, the second with the level
    // it functions at (02 §10). A class that is linked but never named on the
    // sheet looked to the lead like a class that had not been added.
    const classItems = this.actor.classItems ?? [];
    context.identity = {
      race: this.actor.raceItem?.name ?? null,
      classes: classItems.map((item, index) => ({
        id: item.id,
        name: item.name,
        secondary: index > 0,
        level: index === 0 ? system.level : secondaryLevel(system.level)
      }))
    };
    // The level is set on the Progress tab once there is a class to carry it.
    context.levelEditable = this.isEditable && classItems.length > 0;
    // A blank sheet offers the creator (D-636): the player's door.
    context.canBuild = this.isEditable && AzerothCharacterCreator.canBuild(this.actor);
    // The tongues spoken and the purse, stored since 0.10.0 (D-636).
    context.languages = (system.languages ?? []).map(key => game.i18n.localize(AZEROTH.languages[key] ?? key));
    context.purse = coins(system.coin ?? 0);
    context.levels = Array.from({ length: 20 }, (_, i) => ({ value: i + 1, selected: i + 1 === system.level }));
    // 05's temporary Health past the maximum, in words (D-777).
    context.temporaryHealth = temporaryHealthContext(this.actor);
    // Why the Speed is what it is (D-621), for the banner's tooltip.
    context.speedTitle = (system.speedParts ?? [])
      .map(p => `${game.i18n.localize(AZEROTH.speedParts[p.key] ?? p.key)} ${p.key !== "race" && p.value > 0 ? "+" : ""}${p.value}`)
      .join(" \u00b7 ");
    context.classFeatures = await this.#classFeatures(classItems);

    return context;
  }

  /**
   * The Progress tab's "Classes" level (D11 §4): each class held, with the
   * features its level has reached (02 §6) and the first one still ahead.
   * A second class runs at `secondaryLevel`, so it reads its own level.
   */
  async #classFeatures(classItems) {
    const level = this.actor.system.level ?? 1;
    const out = [];
    for (const [index, item] of classItems.entries()) {
      const at = index === 0 ? level : secondaryLevel(level);
      const { unlocked, next } = featuresUnlocked(item.system?.features ?? [], at);
      out.push({
        id: item.id,
        name: item.name,
        level: at,
        secondary: index > 0,
        features: await Promise.all(unlocked.map(async f => ({
          name: f.name,
          level: f.level,
          html: await enrich(f.description, { relativeTo: item })
        }))),
        next: next ? { name: next.name, level: next.level } : null
      });
    }
    return out;
  }

  /**
   * @inheritDoc
   *
   * The grid and the hidden Skills column have to change together, and the
   * grid lives on the frame rather than in a part — so the class is toggled
   * here rather than rendered into any one template.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    // Core replaces the parts it rendered and leaves the rest standing, so a
    // Spells part rendered while the sheet had a spell outlives the tab that
    // named it (D-639). Take it down with the tab.
    if (!this.#showsSpells()) {
      for (const stale of this.element.querySelectorAll('[data-application-part="spells"], section[data-tab="spells"]')) stale.remove();
    }
    this.#applyWideLayout(context.wide === true);
    this.#applyTabSemantics();
    bindPlateKeys(this.element);
    // The Overview tile is a div carrying `role="button"` (it holds the item
    // name, which is a control of its own, and a <button> may not). Enter and
    // Space have to be wired by hand for it (D-689).
    bindKeyActivation(this.element, ".azeroth-slot-tile[data-action]");
    // A bag tile is an `li` carrying `role="option"` (a <button> would take
    // core's height and ink and could not hold the icon, the marks and the
    // badge), so Enter and Space are wired by hand for it too (D-738).
    bindKeyActivation(this.element, ".azeroth-bag-tile[data-action]");
    this.#applyExpanded();
    this.#applySelected();
    // Item Preview survives a render that happened for another reason, the
    // way the pick does (the lead, 2026-09-20).
    this.#applyPreview();
    this.#bindBags();
    // The talent card's Escape, focus-out, pointer-out and outside click
    // (D-758), delegated once per frame the way the bags are.
    this.#bindTalentCards();
    this.#applyLocation();
    // The plate's score is the score AS WORN (2026-09-06): nameless, so a
    // submit never writes the total back as the base; a change writes the
    // base as what was typed less what the gear grants.
    bindScoreInputs(this);
    // The pool's value typed straight in (the lead, 2026-09-13): nameless for
    // the same reason, and an input may carry no `data-action`.
    bindPoolInputs(this);
    // A launcher's ammunition select (D-641): nameless, so submitOnChange
    // never sees it; the choice is the weapon item's own field.
    for (const select of this.element.querySelectorAll("select.azeroth-ammo-select")) {
      if (select.dataset.azerothBound) continue;
      select.dataset.azerothBound = "1";
      select.addEventListener("change", () => {
        const id = select.closest("[data-item-id]")?.dataset.itemId;
        this.actor.items.get(id)?.update({ "system.ammunition": select.value || null });
      });
    }
    // The Progress tab's level: nameless, so submitOnChange never sees it, and
    // the change goes through the actor's one door for the class array.
    const level = this.element.querySelector("select.azeroth-level-select");
    if (level && !level.dataset.azerothBound) {
      level.dataset.azerothBound = "1";
      level.addEventListener("change", () => this.actor.setLevel(Number(level.value)));
    }
    // The menu listens on the frame element, which persists across renders;
    // bind it once per element rather than once per render.
    if (this.#menuFor !== this.element) {
      this.#menu = itemContextMenu(this);
      // A skill row's right click: Roll, and what 02 §8 says it covers (2026-09-06).
      this.#skillMenu = skillContextMenu(this);
      // A GM's right click on an Add button: a blank item (2026-09-06).
      this.#blankMenu = blankItemMenu(this);
      this.#menuFor = this.element;
    }
  }

  /* -------------------------------------------- */
  /*  Dragging into a container, or onto a slot    */
  /* -------------------------------------------- */

  /**
   * A thing dragged onto a container is kept in it; dragged onto a loose
   * list, taken out (the lead, 2026-09-07); dragged onto a slot tile on the
   * Overview tab, WORN (D-687). Anything else - a drop on a row inside the
   * list it is already in - is core's sort, untouched.
   *
   * **The kind of zone decides which of the two happens**, never the id: a
   * ring dropped on the Ring tile would otherwise fall into the container
   * path and read as a move to nowhere.
   *
   * A thing dragged in from OUTSIDE the actor is created first and then put
   * away or put on, so dropping a rope from a compendium straight onto the
   * pack - or a ring straight onto the Ring tile - does what it looks like
   * it does.
   *
   * @inheritDoc
   */
  async _onDropItem(event, item) {
    const zone = dropZoneOf(event);
    if (zone === null || !this.actor.isOwner) return super._onDropItem(event, item);
    if (zone.kind === "slot") return this.#dropOnSlot(event, item, zone.slot, zone.index);

    const owned = this.actor.uuid === item.parent?.uuid;
    // The inspector is a reading surface, not a destination: a thing dragged
    // from outside is still picked up, and one of the actor's own does nothing.
    if (zone.kind === "inspector") return owned ? null : super._onDropItem(event, item);

    // **A FOREIGN THING DROPPED ON THE FIGURE OR THE BAG BAR IS WORN, AND WHAT
    // IS WORN TAKES NO BAG SLOT** (05 *Speed and movement*, 08 §11; the plan's
    // B3). Creating it first and equipping it after asked the door for a bag
    // slot it never needed, so a ring dragged from the sidebar onto full bags
    // was refused for room it was not going to use. `slots.mjs#wearNew` is the
    // pre-check - it names what the newcomer displaces and says whether THAT
    // can be housed - and the create then carries the worn state itself.
    //
    // **A FILLED PLACE TAKES THE DROP BY WHAT IS DROPPED** (the lead,
    // 2026-09-20), never by what is standing in it: a thing goes IN that bag,
    // which is what the icon means and what it always did, and a CONTAINER
    // takes its place. 08 §11's counts still bound the swap - the one standing
    // there comes off EMPTY and has to have a bag slot to come off into - and
    // every one of those refusals is the document's own, said in words.
    const swapping = zone.kind === "container" && zone.place === "bar"
      && Boolean(zone.container) && zone.container !== item.id
      && !isMount(item) && isContainer(item.system?.capacity);

    if (!owned && (zone.kind === "equipped" || zone.kind === "bar" || swapping)) {
      return this.#wearNew(item, swapping ? { displace: zone.container } : {});
    }

    // **A FOREIGN THING IS CREATED FIRST**, so every judgement below is made
    // against a document the actor holds. The operation hooks house it: the
    // panel it was dropped on if there is room, then its own kind, then the
    // first panel with room, and a refusal in words where there is none
    // (D-737). Nothing here passes the bypass.
    const target = owned ? item : await this.#dropForeign(item, zone);
    if (!target) return null;
    // A newcomer dropped on a BAG is already where the create put it; saying
    // so a second time would warn about a container `admit` had already
    // passed over. A newcomer dropped on the figure, the bar or the mount
    // place was asked for somewhere else, and goes there.
    if (!owned && zone.kind === "container") return target;

    if (swapping) return this.#swapBag(target, zone.container);

    switch (zone.kind) {
      case "equipped":
        return this.#wear(target);
      case "bar":
        return this.#wear(target);
      case "mount":
        // A mount is *with you* or it is stabled; anything else dropped here
        // is refused by name rather than lied about.
        return this.#bringMount(target, true);
      case "stable":
        return this.#bringMount(target, false);
      default:
        return this.#dropInBag(target, zone);
    }
  }

  /**
   * A thing dragged in from outside, dropped on the bags.
   *
   * The create carries the preferred container so `admit` tries the panel the
   * reader aimed at before its own kind - and JOINS A TWIN STACK that has
   * room first, because two identical bundles side by side in one bag is not
   * what the drop looked like it did (D-741).
   */
  async #dropForeign(item, zone) {
    const data = item.toObject();
    delete data._id;
    // **A MOUNT IS NEVER IN A BAG** (08 §15). `admit` gives it the mount place
    // and hands back no placement, so a preferred container written here would
    // simply be stored - invisible, since it stands in the Stable either way,
    // and wrong. It arrives stabled and the Stable is where it is drawn.
    const container = zone.kind === "container" && !isMount(item) ? (zone.container || null) : null;
    if (container) foundry.utils.setProperty(data, "system.container", container);
    // **AND THE WELL IT WAS AIMED AT** (the lead, 2026-09-20). `admit` reads
    // it as the newcomer's own preference and honours it where the run is
    // free, so a thing dragged in from a pack onto well twelve arrives in
    // well twelve rather than in the first one - which is the same rule a
    // drop from the character's own bags gets, at the create instead of at
    // the update.
    if (zone.kind === "container" && !isMount(item) && Number.isInteger(zone.well)) {
      foundry.utils.setProperty(data, "system.well", zone.well);
    }
    // A twin already carried, with room for the newcomer: pour it in.
    //
    // **AND NEVER WHERE THE CREATE WOULD BE VETOED** (D-721). A merge raises
    // a stack the character already holds and creates NOTHING, so it is a
    // take that `_preCreate` never sees - the figure's fault one door along,
    // a write standing in for a create that would have been refused. Today
    // `stackKey` also refuses it, because it compares `flags` and an offered
    // find wears `azeroth-rpg.offer`; that is an incidental defence a change
    // to `STACK_IGNORES_DOC` would remove in silence, and a lock on the door
    // itself costs one condition. `slots.test.mjs` holds the incidental half.
    const NEWCOMER = "azerothnewcomer";
    if (stackKey(data) !== null && !underOffer(data)) {
      const rows = this.#rows();
      const twin = rows.find(held => areTwins(held, data)) ?? null;
      if (twin) {
        const verdict = judgeMerge([...rows, { ...data, id: NEWCOMER }], this.#baseSlots(), twin.id, NEWCOMER);
        if (verdict.ok) {
          await this.actor.updateEmbeddedDocuments("Item",
            [{ _id: twin.id, "system.quantity": verdict.quantity }], { azerothBags: "bypass" });
          ui.notifications?.info(game.i18n.format("AZEROTH.Bags.Merged", { name: twin.name, n: verdict.quantity }));
          return this.actor.items.get(twin.id) ?? null;
        }
      }
    }
    const [made] = await this.actor.createEmbeddedDocuments("Item", [data]);
    return made ?? null;
  }

  /** The base pack's wells, off the character's own derived summary. */
  #baseSlots() {
    const base = Number(this.actor.system?.bagSlots?.base);
    return Number.isFinite(base) ? base : BASE_SLOTS;
  }

  /**
   * What the character holds, in the shape the pure law reads: the STORED
   * data plus the id, exactly as `documents/item.mjs` hands its own hooks.
   *
   * A live `system` is a DataModel carrying derived fields, and `stackKey`
   * compares every key in it - so two identical bundles compared one way
   * round would never be twins.
   */
  #rows() {
    return [...this.actor.items].map(item => ({ ...item.toObject(), id: item.id }));
  }

  /**
   * The same rows, plus the one DERIVED field a judgement that asks *what
   * does this put away* has to read.
   *
   * `system.augment` is derived on the item from its section and its name
   * (D-674) and so is absent from `toObject()`, while `worn.mjs#displacedBy`
   * reads it to know that an Idol comes out of the off hand.
   * `documents/item.mjs#rowsOf` stamps it for the same reason.
   *
   * **It is NOT on `#rows()`**, which feeds `stackKey`: two twins are judged
   * on every key of the stored system, so a field present on one side and
   * absent on the other would stop two identical Augments ever merging.
   */
  #judgeRows() {
    return [...this.actor.items].map(item => {
      const data = item.toObject();
      data.id = item.id;
      if (item.system?.augment) data.system = { ...(data.system ?? {}), augment: item.system.augment };
      return data;
    });
  }

  /**
   * A thing of the actor's own dropped on a bag panel, a bar place, a tile or
   * a WELL.
   *
   * Five answers, in order, and the order is the rule:
   *
   * 1. A drop on a **TWIN** merges the two stacks (D-741). It wins over the
   *    swap below, because pouring one bundle of arrows into another is what
   *    the gesture has always meant and two bundles changing places is not.
   * 2. A thing dragged off the **FIGURE** into a bag comes off and lands in
   *    the well it was dropped on.
   * 3. A drop on an **OCCUPIED WELL** makes the two things change places -
   *    across two panels as readily as inside one - and is refused in words
   *    where they will not fit in each other's wells (`slots.mjs#judgeSwap`).
   * 4. A drop on an **EMPTY WELL** puts it there.
   * 5. A drop on a panel's own padding, which names no well, moves it to that
   *    panel and lets the law find it a run.
   */
  async #dropInBag(target, zone) {
    const container = zone.container || null;
    // **A BAG DROPPED ON ITS OWN PANEL IS NOT A MOVE.** D-736 retired the
    // nesting rule - there is no bag inside a bag - so there is nothing this
    // could mean, and without the guard the take-off branch below would strip
    // a bag off the bar for landing on itself.
    if (container && container === target.id) return null;
    // **A MOUNT IS NEVER CARRIED** (08 §15): it is with you or it is stabled,
    // and `slots.mjs` prices it at no bag slot at all - so a horse dropped on
    // a bag panel was written into it, and the write moved nothing a reader
    // could see. The mount place and the Stable are its two doors.
    if (isMount(target)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.MountNotCarried", { name: target.name }));
      return null;
    }
    const here = containerOf(target);
    const overId = zone.over && zone.over !== target.id && zone.over !== container ? zone.over : null;
    const over = overId ? this.actor.items.get(overId) : null;

    // MERGE FIRST: the law judges it, and only then is it written (D-741).
    if (over && areTwins(over.toObject(), target.toObject())) return this.#merge(over, target);

    // The well a reader aimed at, or null where the drop named none: a
    // panel's padding, its heading, or a panel that draws no wells at all.
    const well = Number.isInteger(zone.well) ? zone.well : null;

    // **A THING DRAGGED OFF THE FIGURE INTO A BAG IS TAKEN OFF.** `containerOf`
    // answers null for anything worn (D-739), so a worn ring dropped on the
    // base pack matched `here === container` and took the REORDER branch - and
    // the reorder found no tile for it in that panel and wrote nothing at all.
    // A mount is not worn in this sense: it is brought along or stabled, and
    // the mount place is its door.
    if (isWorn(target) && !isMount(target)) {
      const patch = { "system.equipped": false, "system.container": container };
      if (well !== null) patch["system.well"] = well;
      return target.update(patch);
    }

    // **A DROP ON AN OCCUPIED WELL SWAPS THE TWO THINGS**, wherever they are:
    // the pure law lays both claims down and refuses in words where one of
    // them will not lie. Anything on the FIGURE, in the bar or with the mount
    // has no well to exchange and is not one of these: `judgeSwap` answers
    // `noSwap` for it, and those gestures have their own doors above.
    if (over && !isWorn(over) && !isMount(over)) return this.#swapWells(target, over);

    if (container) {
      const legal = containersFor(this.actor, target).find(c => c.id === container);
      const bag = this.actor.items.get(container);
      if (!legal) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Container.Refused", { name: target.name, container: bag?.name ?? "" }));
        return null;
      }
      // `containersFor` already says a thing ALREADY in the bag is legal
      // however full it reads (D-737), so a move between two wells passes.
      if (!legal.ok) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Container.NoRoom", { name: target.name, container: bag.name }));
        return null;
      }
    }

    // **A DROP THAT NAMES A WELL IS JUDGED ON THAT WELL** (the lead,
    // 2026-09-20): `judgePlace` lays the claim down and looks, so a four-well
    // suit aimed at the fourteenth well of sixteen is refused in words rather
    // than landing somewhere else in silence.
    if (well !== null) {
      const verdict = judgePlace(this.#rows(), this.#baseSlots(), target.id, container, well);
      if (!verdict.ok) {
        ui.notifications?.warn(game.i18n.format(verdict.reason, verdict.data ?? {}));
        return null;
      }
      return this.actor.updateEmbeddedDocuments("Item", verdict.writes);
    }

    // No well named - a panel's own heading or its padding - so it is a move
    // between panels and the law finds it a run.
    if ((here ?? null) === container) return null;
    return target.update({ "system.container": container });
  }

  /**
   * Two things change places (the lead, 2026-09-20).
   *
   * **Judged by the pure law and written as ONE ordinary batch** - no bypass:
   * a swap moves nothing into or out of a bag that was not already in one, so
   * the door reads the result and passes it, and where it does not the
   * refusal is the law's own sentence rather than a second copy of the rule.
   */
  async #swapWells(target, over) {
    const verdict = judgeSwap(this.#rows(), this.#baseSlots(), target.id, over.id);
    if (!verdict.ok) {
      ui.notifications?.warn(game.i18n.format(verdict.reason, verdict.data ?? {}));
      return null;
    }
    return this.actor.updateEmbeddedDocuments("Item", verdict.writes);
  }

  /**
   * Pour one stack into its twin (D-741).
   *
   * **Judged by the pure law, then written under the bypass**, which is the
   * one place on this sheet that passes it: the target's quantity rises
   * before the source is gone, so for one write the character is holding both
   * - and the door, reading the panels honestly, would refuse it.
   */
  async #merge(into, from) {
    const verdict = judgeMerge(this.#rows(), this.#baseSlots(), into.id, from.id);
    if (!verdict.ok) {
      ui.notifications?.warn(game.i18n.format(verdict.reason, verdict.data ?? {}));
      return null;
    }
    await this.actor.updateEmbeddedDocuments("Item",
      [{ _id: into.id, "system.quantity": verdict.quantity }], { azerothBags: "bypass" });
    await this.actor.deleteEmbeddedDocuments("Item", [from.id], { azerothBags: "bypass" });
    ui.notifications?.info(game.i18n.format("AZEROTH.Bags.Merged", { name: into.name, n: verdict.quantity }));
    return into;
  }

  /**
   * Wear the container dropped on a filled bag place, and take off the one
   * standing there (the lead, 2026-09-20).
   *
   * **ONE BATCH**, because `judge` reads the bar off the RESULT: two writes
   * together fill a place by emptying it, where the equip alone would be the
   * fifth container and refused (D-737). The bag coming off is held to 08
   * §11's own rules by the door - it comes off EMPTY and it needs a bag slot
   * to come off into - and the refusal is the document's, in its own words.
   */
  async #swapBag(item, standingId) {
    const standing = this.actor.items.get(standingId) ?? null;
    if (!standing || standing.id === item.id) return null;
    // Already worn: there is no swap to make, only two bags on the same bar.
    if (item.system?.equipped === true) return null;
    return this.actor.updateEmbeddedDocuments("Item", [
      { _id: item.id, "system.equipped": true, "system.container": null },
      { _id: standing.id, "system.equipped": false }
    ]);
  }

  /** A mount brought along or left behind (08 §15, D-736). */
  async #bringMount(item, with_) {
    // **IT IS REFUSED FOR WHAT IT IS, NOT FOR WHERE IT WENT.** This borrowed
    // the container's sentence and printed *Mount does not hold Bread and
    // cheese*, which names a rule that is not the one being broken - and the
    // reader who dropped a hand-made horse here needs to be told what makes
    // one, since `isMount` reads 08's own four sections off the entry.
    if (!isMount(item)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotMount", { name: item?.name ?? "" }));
      return null;
    }
    if ((item.system?.equipped === true) === with_) return null;
    const updates = [{ _id: item.id, "system.equipped": with_ }];
    // **BRINGING ONE ALONG LEAVES THE OTHER BEHIND** (08 §15's one at a time;
    // the lead, 2026-09-20). In ONE batch, so the door judges a result holding
    // one mount rather than refusing a second - and it still refuses in the
    // animal's own words where the one standing there is loaded (D-745).
    if (with_) {
      for (const other of this.actor.items) {
        if (other.id === item.id || other.system?.equipped !== true || !isMount(other)) continue;
        updates.push({ _id: other.id, "system.equipped": false });
      }
    }
    return this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * Put a thing ON, from wherever the press came: the Equipped panel, the bag
   * bar, a double-click, the row's menu or the item sheet's own button.
   *
   * THE ONE DOOR, so 08 §9's Augment gate, 06 §1's hand and every rule
   * `displacedBy` holds are enforced once rather than at three places that
   * drift.
   */
  async #wear(item) {
    // **THE WORN PANEL IS NOT A SLOT**, so the figure's sentence does not fit
    // it: *Torch is not worn in the Worn slot* names a slot 08 §11 does not
    // have. What is true is the thing itself - it is not something anybody
    // wears or holds - and that reads honestly from the panel, from the bar
    // and from the row's own menu alike.
    if (!item || !wearable(item)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotWorn", { name: item?.name ?? "" }));
      return null;
    }
    if (item.system?.equipped === true) return null;
    // 08 §9 locks an Augment to its class, and every door refuses it here
    // rather than letting a caster cast through it silently.
    const augment = item.system?.augment ?? null;
    if (augment && !canCarry(augment.category, this.actor.classNames ?? [])) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Augment.NotYours", { name: item.name, className: augment.className }));
      return null;
    }
    // **A WEAPON GOES IN A HAND** (the lead, 2026-09-13): `handFor` is the
    // pure rule that says which, and `#equipInSlot` is what writes `offHand`.
    if (item.type === "weapon") return this.#equipInSlot(item, handFor(item, this.actor.items));
    const updates = [{ _id: item.id, "system.equipped": true }];
    for (const other of displacedBy(item, this.actor.items)) {
      updates.push({ _id: other.id, "system.equipped": false });
    }
    return this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * A thing dropped on one of the figure's tiles is equipped there (D-687),
   * displacing whatever the slot already held - through `displacedBy`, which
   * is the same rule the picker and the Equip button ask, so the three doors
   * cannot drift.
   *
   * **The index travels with the drop** (D-689): a finger and a trinket hold
   * two, so a third ring dropped on Finger 2 puts away what is in Finger 2
   * rather than whichever sorted first.
   *
   * A weapon takes the hand it was dropped on. A one-handed weapon still
   * displaces nothing in the other hand - 06 §2 owns the hands - but an
   * exclusively two-handed main hand BARS the off hand, and a drop there is
   * refused by name rather than lied about.
   *
   * Anything the tile does not take is REFUSED by name, and nothing moves.
   */
  async #dropOnSlot(event, item, slot, index) {
    const owned = this.actor.uuid === item.parent?.uuid;
    // **THE THREE REFUSALS ARE READ OFF THE INCOMING THING**, before anything
    // is created. A foreign thing the tile will not take is still PICKED UP -
    // it lands in the bags, which is what the drag looked like it did - but one
    // the tile WILL take is created already worn, so it never asks the door for
    // a bag slot it does not need (D-735).
    const label = game.i18n.localize(AZEROTH.wornSlots[slot] ?? AZEROTH.heldSlots[slot] ?? slot);
    const refused = () => {
      if (!fitsSlot(item, slot)) {
        return game.i18n.format("AZEROTH.Overview.DropRefused", { name: item.name, slot: label });
      }
      // The barred Off hand (D-689). The tile carries no action and no drop may
      // reach it; this says which weapon is holding it shut.
      const barred = this.#barredMainHand(slot);
      if (barred) return game.i18n.format("AZEROTH.Overview.DropBarred", { name: item.name, main: barred.name });
      // 08 §9 locks an Augment to its class, and the Equip button refuses it at
      // this same door rather than letting a caster cast through it silently.
      const augment = item.system?.augment ?? null;
      if (augment && !canCarry(augment.category, this.actor.classNames ?? [])) {
        return game.i18n.format("AZEROTH.Augment.NotYours", { name: item.name, className: augment.className });
      }
      return null;
    };
    const reason = refused();
    if (reason) {
      ui.notifications?.warn(reason);
      return owned ? null : super._onDropItem(event, item);
    }
    if (!owned) return this.#wearNew(item, { slot, index });
    await this.#equipInSlot(item, slot, index);
    return item;
  }

  /**
   * A thing from OUTSIDE the actor, created already on the figure or in the
   * bag bar (the plan's B3).
   *
   * **What is worn takes no bag slot**, so the order matters: creating it
   * loose and equipping it afterwards made a ring ask for a well it was never
   * going to fill, and full bags refused a drop the rule allows. `wearNew`
   * answers the only question there is - can what this DISPLACES be housed -
   * and the displaced go away through an ordinary judged write before the
   * newcomer arrives wearing the state `#equipInSlot` would have written.
   *
   * Every gate `#wear` holds is held here too, off the incoming document: 08
   * §9's Augment class, 06 §2's hands, and 08 §11's four container places.
   *
   * **`displace` is a FILLED BAG PLACE** (the lead, 2026-09-20): the container
   * standing in the place the drop landed on comes off in the write that puts
   * the displaced away, BEFORE the create - so a swap the door refuses (a bag
   * that still holds things, a bag with no slot to come off into) creates
   * nothing at all, and the reader is told why in the document's own words.
   *
   * @param {Item} item     the foreign document
   * @param {{slot?: string, index?: number, displace?: string}} [options]
   *   the tile it was dropped on, and the bag place it is taking
   */
  async #wearNew(item, { slot = null, index, displace = null } = {}) {
    // **A DROP THE CREATE WILL VETO MUST NOT TAKE ANYTHING OFF FIRST**
    // (D-721). `AzerothItem#_preCreate` refuses a find that is still under a
    // loot offer, and everything below puts away what the newcomer displaces
    // BEFORE the newcomer is created - so an offered ring dragged onto a full
    // Finger took the character's own ring off and then created nothing at
    // all. The veto is read before any write, through the document's own
    // reader, and the ordinary create is what says no: a refusal restated at
    // the sheet is a second copy of a rule, and the wrong copy goes quiet.
    if (underOffer(item)) return this.#dropForeign(item, { kind: "equipped" });
    if (!item || !wearable(item)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotWorn", { name: item?.name ?? "" }));
      return null;
    }
    // A mount is never worn and never carried: it is brought along, and
    // `#bringMount` is the door that holds 08 §15's one-at-a-time.
    if (isMount(item)) {
      const brought = await this.#dropForeign(item, { kind: "mount" });
      if (brought) await this.#bringMount(brought, true);
      return brought;
    }

    const augment = item.system?.augment ?? null;
    if (augment && !canCarry(augment.category, this.actor.classNames ?? [])) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Augment.NotYours", { name: item.name, className: augment.className }));
      return null;
    }
    const hand = item.type === "weapon" ? (slot ?? handFor(item, this.actor.items)) : slot;
    if (hand === "offHand") {
      const barred = this.#barredMainHand("offHand");
      if (barred) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Overview.DropBarred", { name: item.name, main: barred.name }));
        return null;
      }
    }

    const rows = this.#judgeRows();
    const base = this.#baseSlots();
    const data = item.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "system.equipped", true);
    foundry.utils.setProperty(data, "system.container", null);
    if (item.type === "weapon") foundry.utils.setProperty(data, "system.offHand", hand === "offHand");

    // **A HOLDER NEEDS A PLACE IN THE BAR, AND `admit` WOULD QUIETLY KEEP IT
    // UNWORN.** 08 §11 gives four general places and one of each counted kind;
    // the update door says so in words, and so does this one.
    const led = ledger(rows, base);
    const held = wellsOf(data, { mounted: Boolean(led.mount) });
    if (held.wells > 0 || held.reason === "tooBig" || held.reason === "noMount") {
      // The place being TAKEN is not counted against the newcomer, or a swap
      // onto a full bar would be refused as a fifth container.
      const refusal = this.#barPlaceRefusal(held, led, data, displace);
      if (refusal) {
        ui.notifications?.warn(game.i18n.format(refusal.reason, refusal.data));
        return null;
      }
    }

    // The newcomer's own derived Augment travels with the JUDGEMENT and not
    // into the create: `system.augment` is derived and a stored copy of it
    // would be overwritten at the next preparation anyway (D-674).
    const NEWCOMER = "azerothnewcomer";
    const judged = { ...data, id: NEWCOMER };
    if (augment) judged.system = { ...judged.system, augment };
    const verdict = wearNew(rows, base, judged, { index });
    if (!verdict.ok) {
      ui.notifications?.warn(game.i18n.format(verdict.reason, verdict.data ?? {}));
      return null;
    }
    // The displaced go first, judged like any other write: the room the
    // newcomer's arrival needs was measured with them already moved. The bag
    // whose place is being taken travels in the SAME write, so the door judges
    // one batch and a refusal leaves the bar exactly as it was.
    const writes = verdict.placements.map(p => ({ _id: p._id, system: { ...p.system } }));
    const standing = displace ? this.actor.items.get(displace) ?? null : null;
    if (standing) writes.push({ _id: standing.id, "system.equipped": false });
    if (writes.length) {
      await this.actor.updateEmbeddedDocuments("Item", writes);
      // **A REFUSED UPDATE CANCELS THE WHOLE OPERATION** (D-737) and says why.
      // Half a swap - the newcomer created beside the bag it was to replace -
      // is worse than none, so the create is abandoned where the bag stayed on.
      if (standing && this.actor.items.get(standing.id)?.system?.equipped === true) return null;
    }
    const [made] = await this.actor.createEmbeddedDocuments("Item", [data]);
    return made ?? null;
  }

  /**
   * Which of 08 §11's container rules a newcomer holder would break, or null.
   *
   * `displace` is the place being TAKEN by a swap: it is empty by the time the
   * newcomer lands, so counting it would refuse the swap as a fifth container
   * or as a second quiver.
   */
  #barPlaceRefusal(held, led, data, displace = null) {
    if (held.reason === "tooBig") return { reason: REFUSALS.notWearable, data: { name: data.name ?? "" } };
    if (held.reason === "noMount") return { reason: REFUSALS.noMount, data: { name: data.name ?? "" } };
    const bar = led.bar.filter(p => p.id !== displace);
    if (held.of) {
      return bar.some(p => p.of === held.of)
        ? { reason: REFUSALS.oneOfAKind, data: { of: held.of } }
        : null;
    }
    return bar.filter(p => !p.of).length >= MAX_CONTAINERS
      ? { reason: REFUSALS.tooManyContainers, data: { max: MAX_CONTAINERS } }
      : null;
  }

  /**
   * The weapon barring this slot, or null. Only the Off hand is ever barred,
   * and only by an exclusively two-handed main hand (D-689); `isTwoHanded`
   * excludes launchers on purpose, so a bow bars nothing.
   */
  #barredMainHand(slot) {
    if (slot !== "offHand") return null;
    const figure = figureSlots([...this.actor.items]);
    return figure.twoHanded ? figure.mainHand : null;
  }

  /**
   * Equip `item` in `slot`, putting away everything `displacedBy` names.
   *
   * THE ONE WRITE the drop, the picker and the Equip button all reach, so a
   * rule added to `rules/worn.mjs` cannot be enforced at two doors and missed
   * at the third.
   */
  async #equipInSlot(item, slot, index) {
    const update = { _id: item.id, "system.equipped": true };
    if (item.type === "weapon") update["system.offHand"] = slot === "offHand";
    const updates = [
      update,
      ...displacedBy(item, this.actor.items, { index }).map(o => ({ _id: o.id, "system.equipped": false }))
    ];
    return this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * The zone under the pointer while a thing is dragged, lit so the drop is
   * aimed rather than guessed. Cleared on the drop and on leaving the sheet.
   *
   * A slot tile lights the same way a container does. **A barred tile never
   * lights** (D-689) - a zone that lit and then refused the drop would be a
   * lie in the one moment the reader is aiming - and the Item Preview never
   * lights either, because it is a reading surface and not a destination.
   *
   * **THE BASE PACK LIT NOTHING**, for as long as the tab had existed: its
   * container key is the EMPTY STRING and the test was `Boolean(zone.container)`,
   * so the one panel every character has was the one zone that never said it
   * would take the drop - and a drop on any tile inside it went dark with it.
   * Ask the KIND, exactly as `_onDropItem` does (D-738's *a drop zone compared
   * by one key reads two different places as the same*).
   *
   * @inheritDoc
   */
  _onDragOver(event) {
    const zone = dropZoneOf(event);
    const lit = (zone?.kind === "slot" && !zone.barred)
      || zone?.kind === "container"
      || ["equipped", "bar", "mount", "stable"].includes(zone?.kind);
    const el = lit ? zone.el : null;
    if (el === this.#litZone) return;
    this.#litZone?.classList.remove("azeroth-drop-into");
    el?.classList.add("azeroth-drop-into");
    this.#litZone = el;
  }

  /** @type {HTMLElement|null} */
  #litZone = null;

  /** @inheritDoc */
  async _onDrop(event) {
    this.#litZone?.classList.remove("azeroth-drop-into");
    this.#litZone = null;
    return super._onDrop(event);
  }

  /** The prose under a row, enriched once per item however many lists carry it. */
  async #describeRows(rows) {
    return describeRows(this.actor, rows);
  }

  /** The row's name opens its inline detail; the state survives a re-render. */
  static async #onExpandItem(event, target) {
    // A row that is no item (a maneuver, D-626) carries its own expand id.
    const row = target.closest("[data-item-id],[data-expand-id]");
    const id = row?.dataset.itemId ?? row?.dataset.expandId;
    if (!id) return;
    if (this.#expanded.has(id)) this.#expanded.delete(id);
    else this.#expanded.add(id);
    this.#applyExpanded();
  }

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

  /* -------------------------------------------- */
  /*  The bag tiles: selection, keys and links     */
  /* -------------------------------------------- */

  /** A bag tile picked: the card beside the panels is the one that is already there. */
  static async #onSelectItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId ?? null;
    if (!id) return;
    // ALWAYS SELECTS, never toggles (D-738): the double-click's first half
    // would otherwise undo the pick its second half acts on.
    this.#selected = id;
    this.#applySelected();
  }

  /**
   * Show the selected thing's card and light its tile.
   *
   * **Nothing re-renders.** Every card is prerendered and hidden, so this is
   * a sweep of `hidden` and a class: a click costs no render, the pick
   * survives a render that happened for another reason, and a card for an
   * item that has since been deleted simply is not there, which clears the
   * pick.
   */
  #applySelected() {
    const id = this.#selected;
    let found = false;
    for (const card of this.element.querySelectorAll(".azeroth-bag-inspect[data-item-id]")) {
      const on = card.dataset.itemId === id;
      card.hidden = !on;
      if (on) found = true;
    }
    for (const tile of this.element.querySelectorAll(".azeroth-bag-tile[data-item-id]")) {
      const on = tile.dataset.itemId === id;
      tile.classList.toggle("is-selected", on);
      tile.setAttribute("aria-selected", String(on));
    }
    // WITH NOTHING SELECTED THE PREVIEW SAYS NOTHING (the lead, 2026-09-20):
    // the section is its title strip alone. There is no hint paragraph to
    // show or hide any more — every card is hidden and the body is empty.
    if (!found) this.#selected = null;
  }

  /* -------------------------------------------- */
  /*  Item Preview                                 */
  /* -------------------------------------------- */

  /**
   * Is the Gear tab's Item Preview open?
   *
   * Resolved once per sheet off `game.user`'s flag and then held, so a render
   * does not re-read it and a press can flip it before the write lands.
   * **A user with no flag yet reads OPEN** — `getFlag` answers `undefined`
   * for a player who has never touched it, and `undefined !== false`.
   */
  #previewShowing() {
    if (this.#previewOpen === null) this.#previewOpen = game.user?.getFlag("azeroth-rpg", PREVIEW_FLAG) !== false;
    return this.#previewOpen;
  }

  /**
   * Hide or unhide the Item Preview (the lead, 2026-09-20).
   *
   * **Nothing re-renders**, for `#applySelected`'s reason: the cards are
   * prerendered and the pick would have to be re-applied. The DOM is swapped
   * here and `_onRender` applies the same state, so it survives a render that
   * happened for another reason.
   *
   * **The write is wrapped.** A player may always update their own User in
   * v14 (`common/documents/user.mjs#canUpdate`: `flags` is not restricted and
   * `user.id === doc.id` passes), but a banned one may not, and a sheet must
   * never throw for a reader. A refused write leaves the preference for this
   * session and nothing else.
   */
  static async #onTogglePreview() {
    this.#previewOpen = !this.#previewShowing();
    this.#applyPreview();
    await game.user?.setFlag("azeroth-rpg", PREVIEW_FLAG, this.#previewOpen).catch(() => null);
  }

  /** The preview's open state on the rendered tab: the body, the layout and the button. */
  #applyPreview() {
    const open = this.#previewShowing();
    const aside = this.element?.querySelector(".azeroth-bag-inspector");
    if (!aside) return;
    aside.classList.toggle("is-closed", !open);
    // THE BAGS TAKE THE FULL WIDTH when it is shut: the grid drops a track.
    aside.closest(".azeroth-bags-layout")?.classList.toggle("is-preview-closed", !open);
    const body = aside.querySelector(".azeroth-bag-inspector-body");
    if (body) body.hidden = !open;
    const button = aside.querySelector('[data-action="togglePreview"]');
    if (!button) return;
    button.setAttribute("aria-expanded", String(open));
    const word = button.querySelector(".azeroth-bag-preview-word");
    // The WORD carries the state, so the chevron is never the only carrier.
    if (word) word.textContent = game.i18n.localize(open ? "AZEROTH.Bags.PreviewHide" : "AZEROTH.Bags.PreviewShow");
  }

  /** Light a tile and the run of taken wells that belong to it. */
  #linkRun(id) {
    for (const el of this.element.querySelectorAll(".is-linked")) el.classList.remove("is-linked");
    if (!id) return;
    const key = CSS.escape(id);
    for (const el of this.element.querySelectorAll(`[data-of="${key}"]`)) el.classList.add("is-linked");
    this.element.querySelector(`.azeroth-bag-tile[data-item-id="${key}"]`)?.classList.add("is-linked");
  }

  /**
   * Everything the bag panels need that an `actions` entry cannot carry,
   * DELEGATED ONCE per rendered frame.
   *
   * A control queried before a render is dead after it (CLAUDE.md §14), and
   * the panels are re-rendered on every write - so nothing here is bound to a
   * tile. The frame element persists, exactly as the context menus do, and
   * every handler reads the tile off the event.
   */
  #bindBags() {
    if (this.#bagsBoundFor === this.element) return;
    this.#bagsBoundFor = this.element;
    const root = this.element;

    // A double-click does what the thing is FOR: `primaryAction` named it and
    // the sheet's own map is what runs, so an unregistered answer is a no-op
    // rather than a thrown error.
    //
    // **NOT THE OVERVIEW SOCKET.** A paper-doll tile's SINGLE click already
    // opens the picker, so a double-click would open the picker and then the
    // thing on top of it; the right-click menu is that tile's second door
    // (`itemContextMenu`'s selector names it).
    root.addEventListener("dblclick", event => {
      const tile = event.target.closest?.(".azeroth-bag-tile[data-primary]");
      if (!tile) return;
      event.preventDefault();
      const action = this.options.actions?.[tile.dataset.primary];
      if (typeof action === "function") action.call(this, event, tile);
    });

    // The arrows walk the well map, which is `rules/bags.mjs#gridStep` read
    // off the rendered grid rather than a second copy of the layout.
    root.addEventListener("keydown", event => {
      const tile = event.target.closest?.(".azeroth-bag-tile");
      const grid = tile?.closest(".azeroth-bag-grid") ?? null;
      if (!grid) return;
      const children = [...grid.children];
      const cells = children.map(el => ({
        kind: el.classList.contains("azeroth-bag-tile") ? "tile" : (el.dataset.of ? "taken" : "empty")
      }));
      const columns = Number(grid.style.getPropertyValue("--azeroth-bag-columns")) || 4;
      const to = gridStep(cells, children.indexOf(tile), event.key, columns);
      if (to === null) return;
      event.preventDefault();
      children[to]?.focus();
    });

    // Focus activates the card, so the keyboard reader gets what the pointer
    // gets; hover and focus both light the run a multi-well thing occupies.
    root.addEventListener("focusin", event => {
      const tile = event.target.closest?.(".azeroth-bag-tile");
      this.#linkRun(tile?.dataset.itemId ?? null);
      if (tile) game.tooltip?.activate?.(tile);
    });
    root.addEventListener("focusout", event => {
      if (event.target.closest?.(".azeroth-bag-tile")) this.#linkRun(null);
    });
    root.addEventListener("pointerover", event => {
      const tile = event.target.closest?.(".azeroth-bag-tile,.azeroth-bag-well[data-of]");
      if (!tile) return;
      this.#linkRun(tile.dataset.itemId ?? tile.dataset.of ?? null);
    });
    root.addEventListener("pointerout", event => {
      if (event.target.closest?.(".azeroth-bag-tile,.azeroth-bag-well[data-of]")) this.#linkRun(null);
    });

    // A CLICK ON A TAKEN WELL SELECTS ITS OWNER. The well wears the owner's
    // icon ghosted, so it reads as part of that thing and a press on it has to
    // do what a press on the thing does; it carries no `data-action` of its
    // own — and must not, since a second `data-item-id` in the grid would be
    // found by every selector that looks a tile up by id. The action is called
    // rather than re-dispatched, the way the double-click above does it.
    root.addEventListener("click", event => {
      const well = event.target.closest?.(".azeroth-bag-well[data-of]");
      if (!well) return;
      const owner = root.querySelector(`.azeroth-bag-tile[data-item-id="${CSS.escape(well.dataset.of)}"]`);
      if (!owner) return;
      event.preventDefault();
      const action = this.options.actions?.selectItem;
      if (typeof action === "function") action.call(this, event, owner);
    });

    // A right click on a TAKEN WELL is a right click on the thing that
    // occupies it: the menu binds to `li[data-item-id]` and a taken well
    // deliberately carries none, so the event is re-aimed at its owner. The
    // re-dispatched event lands on a tile and finds no taken well, so this
    // cannot recur.
    root.addEventListener("contextmenu", event => {
      const well = event.target.closest?.(".azeroth-bag-well[data-of]");
      if (!well) return;
      const owner = root.querySelector(`.azeroth-bag-tile[data-item-id="${CSS.escape(well.dataset.of)}"]`);
      if (!owner) return;
      event.preventDefault();
      event.stopPropagation();
      owner.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY
      }));
    });
  }

  /**
   * @inheritDoc
   *
   * The tooltip is a POPOVER over the whole document, so a card left standing
   * while a tile is dragged follows the pointer across the sheet and lands on
   * top of whatever the drop is aimed at.
   */
  _onDragStart(event) {
    game.tooltip?.deactivate?.();
    return super._onDragStart(event);
  }

  /**
   * @inheritDoc
   *
   * `changeTab` swaps CSS classes on the tab elements and DOES NOT re-render,
   * so `_prepareContext` never runs and `context.wide` never moves. Switching
   * to Gear would leave the three-column grid in place with an empty Skills
   * column beside the panel.
   *
   * This is the exact fault D11 §1 warns about, arriving through the tab
   * mechanism rather than through the CSS.
   */
  changeTab(tab, group, options) {
    // A tab the map left out (Spells on a non-caster, D-639) is a no-op, not an error.
    if (group === "primary" && !this._getTabsConfig(group)?.tabs.some(t => t.id === tab)) return;
    super.changeTab(tab, group, options);
    if (group !== "primary") return;
    this.#applyWideLayout(AzerothCharacterSheet.WIDE_TABS.includes(tab));
    // `changeTab` moves `.active` and nothing else, so the ARIA state it
    // leaves behind would say the old tab is the selected one.
    this.#applyTabSemantics();
  }

  /**
   * Both halves of D11 §1's rule, in one place so they cannot drift apart:
   * the grid loses a track AND Skills is hidden. A hidden element is not a
   * grid item, so doing either alone puts the panel in the wrong column.
   */
  #applyWideLayout(wide) {
    this.element?.classList.toggle("is-wide", wide);
    const skills = this.element?.querySelector(".azeroth-skills");
    if (skills) skills.hidden = wide;
  }

  /**
   * The hanging tab strip is a TABLIST, and an `<a>` with no `href` is not
   * focusable (D-734).
   *
   * Core's `tab-navigation.hbs` writes bare anchors carrying `data-action` and
   * `data-tab`; the click path works and the keyboard never reaches them, so
   * the seven tabs of the sheet a player lives on could not be tabbed to at
   * all. `tabIndex = 0` puts each in the tab order, `bindKeyActivation` makes
   * Enter and Space press it (the door the attribute plates and the Overview
   * tiles already use), and the roles say what the strip is.
   *
   * `aria-selected` is re-stamped after every render AND after every
   * `changeTab`, because the second path swaps CSS classes without rendering.
   */
  #applyTabSemantics() {
    const nav = this.element?.querySelector("nav.sheet-tabs");
    if (!nav) return;
    nav.setAttribute("role", "tablist");
    for (const anchor of nav.querySelectorAll("a[data-tab]")) {
      anchor.setAttribute("role", "tab");
      anchor.tabIndex = 0;
      anchor.setAttribute("aria-selected", String(anchor.classList.contains("active")));
    }
    bindKeyActivation(this.element, "nav.sheet-tabs a[data-tab]");
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context) {
    const part = await super._preparePartContext(partId, context);
    // Give a tab part its own tab record so the template can mark itself
    // active without reaching into the group. The three permanent parts —
    // banner, attributes, skills — have no tab and get none.
    //
    // `_prepareTabs` returns an OBJECT keyed by tab id, not an array
    // (application.mjs:707 reduces into `{}`). Calling `.find` on it throws
    // during render, and Quench reports the whole batch as absent rather than
    // failed — the run count drops and nothing says why.
    const tab = context.tabs?.[partId];
    if (tab) part.tab = tab;
    return part;
  }

  /* -------------------------------------------- */

  /* -------------------------------------------- */

  /**
   * D11 §4's drill-down: branches, then one branch's tree.
   *
   * **The open branch is view state, not actor data**, so it lives on the
   * application rather than in a flag. Storing it on the actor would mean two
   * players opening the same sheet fight over which branch is showing, and it
   * would survive a reload as a change nobody made.
   */
  #openBranch = null;

  /** Item rows opened inline; view state, re-applied after every render. */
  #expanded = new Set();

  /**
   * The bag tile the reader has picked, if any. VIEW STATE, like the open
   * branch above and for the same reason: two players on one sheet would
   * otherwise fight over which card is showing, and a pick would survive a
   * reload as a change nobody made.
   *
   * **A CLICK ALWAYS SELECTS, NEVER TOGGLES** (D-738). A tile that deselected
   * itself on a second click would make the double-click's first half undo
   * the pick the second half acts on.
   */
  #selected = null;

  /**
   * Item Preview, once this sheet has resolved it. NOT view state: the answer
   * is `game.user`'s own flag (`PREVIEW_FLAG`), and this is the resolved copy
   * so a render does not re-read it and a press can flip it before the write
   * has landed.
   */
  #previewOpen = null;

  /** The element the bag listeners are bound to, so they are bound once per frame. */
  #bagsBoundFor = null;

  /** The element the talent card's listeners are bound to, likewise (D-758). */
  #talentCardsBoundFor = null;

  /** The rows' context menu, bound once per rendered element. */
  #menu = null;
  #menuFor = null;
  #skillMenu = null;
  #blankMenu = null;

  /**
   * The called shot the next attack opens on (D-411, D-617). VIEW STATE, not
   * actor data: it is the roller's intent for the next dialog, and two
   * players on one sheet would otherwise fight over it. Held on the sheet so
   * a re-render keeps the tile lit; the dialog remains the authority.
   */
  #location = "body";

  /** A tile on the armour figure: select the location the next attack opens on. */
  static async #onCalledShot(event, target) {
    const key = target.dataset.location;
    if (!AZEROTH.locations[key]) return;
    this.#location = key;
    this.#applyLocation();
  }

  /** Light the chosen tile and carry the value on the hidden field the attack door reads. */
  #applyLocation() {
    const field = this.element.querySelector("[data-field=azeroth-location]");
    if (field) field.value = this.#location;
    for (const tile of this.element.querySelectorAll('[data-action="calledShot"]')) {
      const on = tile.dataset.location === this.#location;
      tile.classList.toggle("is-selected", on);
      tile.setAttribute("aria-pressed", String(on));
    }
  }

  /**
   * The Progress tab's talent half.
   *
   * **The tree comes from `rules/talents.mjs`**, which is where 04 §1's gate
   * lives. This assembles the actor's talents and hands them over; it decides
   * nothing about what is takeable.
   */
  async #talents() {
    // The class trees only: a racial talent has its own block and currency (D-620).
    const owned = this.actor.items.filter(i => i.type === "talent" && !i.system.race);
    const points = this.#talentPoints();

    // Group by class and branch, in the order the class items sit in
    // `classes[]` — primary first, multiclass second (D11 §4 groups by class).
    const byBranch = new Map();
    for (const item of owned) {
      const key = `${item.system.className}/${item.system.branch}`;
      if (!byBranch.has(key)) {
        byBranch.set(key, {
          key,
          className: item.system.className,
          branch: item.system.branch,
          talents: []
        });
      }
      byBranch.get(key).talents.push({
        _id: item.id,
        name: item.name,
        identifier: item.system.identifier,
        tier: item.system.tier,
        ranks: item.system.ranks,
        taken: item.system.taken,
        requires: item.system.requires,
        // 04's row within its branch, on the item's built-in `sort` (D-218,
        // D-758): `buildTree` lays a tier out in it, and falls back to the
        // name where it is 0.
        sort: item.sort,
        // Enriched here: the card prints it with a triple-stash.
        effect: await enrich(item.system.effect, { relativeTo: item }),
        img: item.img,
        uses: this.#usesRow(item),
        origin: this.#origin(item)
      });
    }

    // In the class's own order - Arms, Fury, Bulwark as 02 §7 names them -
    // and primary class first, rather than in whatever order the items sit.
    const order = new Map();
    for (const [ci, cls] of (this.actor.classItems ?? []).entries()) {
      for (const [bi, b] of (cls.system?.branches ?? []).entries()) {
        order.set(`${cls.name}/${b?.name ?? b}`, ci * 10 + bi);
      }
    }
    const rank = key => order.get(key) ?? 100;
    const branches = [...byBranch.values()]
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map(entry => ({
        ...entry,
        spent: pointsSpent(entry.talents),
        // An id, so Back can hand focus to the button that opened the tree
        // and core keeps it there across a render (D-758).
        buttonId: `${this.id}-branch-${entry.key.replaceAll("/", " ").slugify({ strict: true })}`
      }));

    const open = branches.find(b => b.key === this.#openBranch) ?? null;
    return {
      branches,
      pointsLeft: points.left,
      pointsTotal: points.total,
      open: open ? this.#renderTree(open, points.left) : null
    };
  }

  /**
   * The race's eight talents and the picks spent on them (02 SS2, D-620).
   * Null with no race, and the template draws nothing then.
   */
  async #racial() {
    const race = this.actor.raceItem;
    if (!race) return null;
    const level = this.actor.system.level ?? 1;
    const held = this.actor.items
      .filter(i => i.type === "talent" && i.system.race === race.name)
      .sort((a, b) => (a.system.tier - b.system.tier) || a.name.localeCompare(b.name));
    const systems = held.map(i => i.system);
    const picksTotal = racialPicksFor(level);
    const picksUsed = systems.reduce((n, s) => n + (s.taken ?? 0), 0);
    const talents = await Promise.all(held.map(async item => {
      const state = canTakeRacial({ ...item.system, name: item.name }, systems, level);
      // The tree's own tile (D-758): the same socket, states, badge and card.
      return this.#tile({
        _id: item.id,
        name: item.name,
        tier: item.system.tier,
        ranks: item.system.ranks,
        taken: item.system.taken,
        img: item.img,
        effect: await enrich(item.system.effect, { relativeTo: item }),
        canTake: state.ok,
        lockedBecause: state.reason,
        // One rank, so the three looks D-640 names: available, locked, maxed.
        state: tileState(item.system, state.ok),
        // A pick handed back between fights (04 §1, D-713); the currency is
        // the race's own, so the tile says *pick* where the tree says *point*.
        untake: this.#untakeState({ ...item.system, name: item.name }, systems, true),
        uses: this.#usesRow(item),
        origin: this.#origin(item)
      }, { racial: true });
    }));
    return { race: race.name, tier: tierForLevel(level), picksTotal, picksUsed, picksLeft: Math.max(0, picksTotal - picksUsed), talents };
  }

  /**
   * The career held now and the roads out of it (03 SS2).
   *
   * **Eligibility is the mechanical half only.** 03 gates on a prior career
   * and nothing else — no corruption, no faction standing, no level — and the
   * rest of an Entry is prose the GM judges. The narrative clause is shown
   * beside each road rather than hidden, because a green light that quietly
   * dropped half the requirement is worse than no light.
   */
  async #career() {
    const item = this.actor.careerItem;
    if (!item) return { current: null, exits: [] };

    const held = this.actor.items
      .filter(i => i.type === "career")
      .map(i => i.name);
    const snapshot = { current: item.name, held, tier: item.system.tier };

    // The Exits list names careers; their Entry lines live on the compendium
    // documents, so an exit the character does not own yet is looked up there.
    // ASK FOR THE FIELDS. `getIndex` carries name, img and type by default and
    // nothing else, so reading `entry.system.entry` off the plain index gave an
    // empty Entry on every exit - which parsed to no requirements and rendered
    // as an open road. `getIndex({fields})` extends the index in place.
    const pack = game.packs?.get("azeroth-rpg.careers");
    const index = pack ? await pack.getIndex({ fields: ["system.entry", "system.tier"] }) : null;

    const exits = await Promise.all(exitsFrom(item).map(async name => {
      const entry = index?.find(e => e.name === name);
      const known = this.actor.items.find(i => i.type === "career" && i.name === name);
      const target = known ?? (entry ? { name, system: entry.system ?? {} } : { name, system: {} });
      const state = isEligible(snapshot, target);
      return {
        name,
        tier: target.system?.tier ?? null,
        ok: state.ok,
        requires: state.requires,
        narrative: await enrich(state.narrative)
      };
    }));

    return { current: { name: item.name, tier: item.system.tier }, exits };
  }

  /**
   * The tree, with the presentation details the rule has no business knowing:
   * CSS grid columns are 1-based and `buildTree` counts from 0, the class's
   * crest (D-758), and the ids the rail, the tier rows and the sockets point
   * their ARIA at. Every id is built off the APPLICATION's own id, so two
   * sheets open at once never share one (D-603's `aria-controls` lesson).
   */
  #renderTree(branch, pointsLeft) {
    const tree = buildTree(branch.talents, pointsLeft);
    return {
      ...branch,
      ...tree,
      titleId: `${this.id}-tree-title`,
      backId: `${this.id}-tree-back`,
      // NULL where the class has no crest on disk: the template then draws no
      // <img> at all, because one that 404s is a console error (D-758).
      crest: crestPath(this.#classIdentifier(branch.className)),
      tiers: tree.tiers.map(tier => ({
        ...tier,
        // The rail cell each tier row names itself from (`aria-labelledby`).
        railId: `${this.id}-tier-${tier.tier}`,
        talents: tier.talents.map(talent => this.#tile(talent, {
          // The template writes it as `data-column`, never an inline style:
          // the card's flip keys on it, where it used to key on the style.
          gridColumn: talent.column + 1,
          // 04 §1's refund (D-713), judged against the whole branch.
          untake: this.#untakeState(talent, branch.talents)
        }))
      }))
    };
  }

  /**
   * What one talent tile draws beyond the rule's answer (D-758), for the tree
   * and the racial row alike: the socket's `aria-label` - the name, the ranks
   * and the state IN WORDS, which is what the ring says in colour - the ids
   * the socket's `aria-controls` and `aria-describedby` point at, and the
   * card's two button labels, whose currency is a point on the tree and a
   * pick on the race.
   *
   * @param {object} talent   the placed talent, carrying `state`
   * @param {object} [extra]  fields to lay over it; `racial` picks the words
   */
  #tile(talent, { racial = false, ...extra } = {}) {
    const taken = Number(talent.taken) || 0;
    const state = game.i18n.localize(`AZEROTH.Talent.State.${talent.state}`);
    const label = racial
      ? game.i18n.format("AZEROTH.Talent.RacialLabel", { name: talent.name, tier: talent.tier, state })
      : game.i18n.format("AZEROTH.Talent.SocketLabel", { name: talent.name, taken, ranks: Number(talent.ranks) || 1, state });
    const cost = game.i18n.localize(racial ? "AZEROTH.Talent.PickCost" : "AZEROTH.Talent.TakeCost");
    const back = game.i18n.localize(racial ? "AZEROTH.Talent.UnpickCost" : "AZEROTH.Talent.UntakeCost");
    const verb = game.i18n.localize(taken > 0 ? "AZEROTH.Talent.Raise" : "AZEROTH.Talent.Take");
    const base = `${this.id}-talent-${talent._id}`;
    return {
      ...talent,
      ...extra,
      label,
      // THE SOCKET CARRIES AN ID so focus survives a render: core restores the
      // focused element of a re-rendered part by its id (14.367,
      // `_preSyncPartState`), and a Learn press is followed by the grant
      // sync's own renders (D-642), each of which would otherwise drop the
      // keyboard's place to the body.
      socketId: `${base}-socket`,
      cardId: `${base}-card`,
      bodyId: `${base}-body`,
      takeLabel: `${verb} (${cost})`,
      untakeLabel: `${game.i18n.localize("AZEROTH.Talent.Untake")} (${back})`
    };
  }

  /**
   * The class identifier a branch belongs to, for its crest: the held class
   * item's own, else the name slugged, which is what all nine identifiers are
   * (a fixture may hold a branch's talents and no class item at all).
   */
  #classIdentifier(className) {
    const held = (this.actor.classItems ?? []).find(c => c.name === className);
    return held?.system?.identifier || (className ? String(className).slugify() : null);
  }

  /**
   * Whether this rank can be handed back, and what to say if it cannot
   * (04 §1, D-713).
   *
   * The refusal is composed HERE, because `canUntake` is pure and names the
   * blocking talent rather than a sentence. A refusal is said in words beside
   * the greyed control, never by the absence of a button alone (D5).
   *
   * **The fight is checked first**, and only here: a combat is Foundry state
   * and `rules/talents.mjs` knows nothing about it. The same guard stands at
   * `#onUntakeTalent`, because a rendered state is a hint and the door is the
   * rule (CLAUDE.md §5's Reaction note).
   */
  #untakeState(talent, branchTalents, racial = false) {
    const taken = Number(talent?.taken) || 0;
    if (taken < 1) return { ok: false, reason: "notTaken", text: null };
    if (this.actor.activeFight()) {
      return { ok: false, reason: "inFight", text: game.i18n.localize("AZEROTH.Talent.Locked.inFight") };
    }
    const state = racial ? canUntakeRacial(talent) : canUntake(talent, branchTalents);
    return {
      ok: state.ok,
      reason: state.reason,
      text: state.ok ? null : game.i18n.format(`AZEROTH.Talent.Locked.${state.reason}`, { name: state.name ?? "" })
    };
  }

  /**
   * Talent points: what the character has and what is already committed.
   *
   * The total is a flag rather than a derived number because 02's award
   * schedule is not implemented yet; the spent half is real, read off the
   * talents themselves so it can never disagree with them.
   */
  /**
   * Known spells by school - the character's own school order first, then any
   * school a spell carries that the classes do not - and by tier within it.
   */
  /**
   * The Spells tab (D-614): the Mana bar as Core draws it, the spells the
   * classes grant at their tiers (07 §5) against the spells held, and the
   * known spells BY TIER, the school a chip on the row. Within a tier the
   * character's own school order, then the name.
   */
  #spells() {
    const system = this.actor.system;
    const order = [...(system.schools ?? [])];
    const sustaining = new Set((this.actor.getFlag("azeroth-rpg", "sustaining") ?? []).map(s => s.spellId));
    const held = this.actor.items.filter(i => i.type === "spell");
    const byTier = new Map();
    // **IN A SHAPESHIFT FORM A SPELL IS PRICED IN FEROCITY** (07, D-769): the
    // column says what Cast will take, through `manaPrice` - the reading
    // `castSpell` pays with - and the tab says so in words above the tiers, so
    // the number is never read as Mana. A Sustain already held is still Mana
    // (the lead: *"Upkeep unchanged"*).
    const inForm = this.actor.inShapeshiftForm === true;
    const manaWord = game.i18n.localize("AZEROTH.Card.Mana");
    for (const item of held) {
      const tier = item.system.tier ?? 1;
      if (!byTier.has(tier)) byTier.set(tier, []);
      const school = item.system.school;
      if (school && !order.includes(school)) order.push(school);
      const mana = item.system.mana ?? null;
      const price = inForm && mana > 0 ? manaPrice(mana, { inShapeshiftForm: true }) : null;
      byTier.get(tier).push({
        id: item.id,
        name: item.name,
        img: item.img,
        tier,
        school,
        schoolLabel: AZEROTH.schools[school] ?? null,
        mana: price ? price.amount : mana,
        manaTip: price ? game.i18n.format("AZEROTH.Shape.FerocityForMana", { mana }) : manaWord,
        ferocity: Boolean(price),
        actionLabel: AZEROTH.actions[item.system.action] ?? null,
        sustaining: sustaining.has(item.id),
        detail: detailFields(item)
      });
    }
    const rank = key => { const i = order.indexOf(key); return i < 0 ? 99 : i; };
    const tiers = [...byTier.keys()].sort((a, b) => a - b).map(tier => ({
      tier,
      spells: byTier.get(tier).sort((a, b) => rank(a.school) - rank(b.school) || a.name.localeCompare(b.name))
    }));

    // 07 §5, per casting class: a second class casts at its own tier.
    const tier = system.tier ?? 1;
    const known = (this.actor.classItems ?? []).map((cls, index) => {
      const caster = cls.system?.power?.caster ?? "none";
      const ability = cls.system?.castingAbility ?? null;
      if (caster === "none" || !ability) return null;
      const at = index === 0 ? tier : secondaryTier(tier);
      const mod = system.abilities?.[ability]?.mod ?? 0;
      return {
        className: cls.name,
        tier: at,
        abilityLabel: AZEROTH.abilities[ability],
        abilityAbbr: String(AZEROTH.abilities[ability]).replace(/\.Label$/, ".Abbr"),
        mod,
        minimum: spellsKnown({ caster, castingMod: mod, tier: at })
      };
    }).filter(Boolean);
    const minimum = known.reduce((sum, k) => sum + k.minimum, 0);

    return {
      tiers,
      count: held.length,
      known,
      minimum,
      short: known.length > 0 && held.length < minimum,
      // The words that say the column is Ferocity, in a Shapeshift form alone.
      ferocityNote: inForm ? game.i18n.format("AZEROTH.Shape.SpellsInFerocity", { form: shapeLabel(this.actor.shape) }) : null,
      // The Power pools, through **Core's own rows** rather than a second
      // build of them. D-614 said *one partial, so the two cannot drift* and
      // then wrote the row twice: the header's copy carried no `editable`, so
      // the stepper (the lead, 2026-09-13) reached Core and not this tab, and
      // the two bars printed the same pool two ways. The partial was never the
      // half that drifted.
      pools: this.#pools().filter(pool => pool.held && pool.kind === "power")
    };
  }

  #talentPoints() {
    // 02 SS9: one a level. The flag is a GM override, never the rule.
    const total = Number(this.actor.getFlag("azeroth-rpg", "talentPoints"))
      || talentPointsFor(this.actor.system.level ?? 1);
    const spent = pointsSpent(
      this.actor.items.filter(i => i.type === "talent" && !i.system.race).map(i => i.system)
    );
    return { total, spent, left: Math.max(0, total - spent) };
  }

  /* -------------------------------------------- */

  /**
   * Open one branch's tree.
   *
   * **THE KEYBOARD FOLLOWS THE DRILL-DOWN** (D-758): the button that was
   * pressed goes with the list it stood in, so focus would fall to the body.
   * It goes to the tree's own Back instead, and the tree is brought into view
   * within the tab's own scroll.
   */
  static async #onOpenBranch(event, target) {
    this.#openBranch = target.dataset.branch ?? null;
    await this.render({ parts: ["progress"] });
    const tree = this.#progressTab()?.querySelector(".azeroth-tree") ?? null;
    tree?.querySelector(".azeroth-tree-back")?.focus({ preventScroll: true });
    this.#revealInProgress(tree);
  }

  /** Back to the branch list, with focus on the branch that was open. */
  static async #onCloseBranch() {
    const was = this.#openBranch;
    this.#openBranch = null;
    await this.render({ parts: ["progress"] });
    const button = [...(this.#progressTab()?.querySelectorAll('[data-action="openBranch"]') ?? [])]
      .find(b => b.dataset.branch === was) ?? null;
    button?.focus({ preventScroll: true });
    this.#revealInProgress(button);
  }

  /** The Progress tab's own section: every tree query is scoped to it (D-751). */
  #progressTab() {
    return this.element?.querySelector('section[data-tab="progress"]') ?? null;
  }

  /**
   * Scroll the Progress tab, and nothing else, so an element's top is in view.
   *
   * NOT `scrollIntoView`, which scrolls every scrolling ancestor it finds -
   * core's `.window-content` and `body` included, both `overflow: hidden` and
   * both still scrollable by script - and would shift the whole window.
   */
  #revealInProgress(el) {
    const tab = this.#progressTab();
    if (!tab || !el) return;
    const box = tab.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top >= box.top && r.bottom <= box.bottom) return;
    tab.scrollTop = Math.max(0, tab.scrollTop + (r.top - box.top) - 8);
  }

  /**
   * After a KEYBOARD press of Learn or Take it back, put focus back on that
   * talent's socket (D-758). The part re-rendered and the button pressed is
   * gone; a keyboard reader would be left on the body. A click by the mouse
   * carries `detail` of 1 or more and is left alone - the pointer is already
   * on the card. The socket's id is what then keeps it focused through the
   * grant sync's later renders.
   */
  #refocusSocket(event, itemId) {
    if (event?.detail !== 0 || !itemId) return;
    const tile = [...(this.#progressTab()?.querySelectorAll(".azeroth-talent[data-item-id]") ?? [])]
      .find(t => t.dataset.itemId === itemId);
    tile?.querySelector(".azeroth-talent-socket")?.focus({ preventScroll: true });
  }

  /* -------------------------------------------- */
  /*  The talent card (D-509, D-758)               */
  /* -------------------------------------------- */

  /**
   * A socket pressed: pin its card open, or put a pinned one away.
   *
   * The card also opens on hover and on focus; the pin is what keeps it open
   * when the pointer moves on, which is how a reader compares two talents.
   * **Only one card is pinned at a time.** A press that unpins also DISMISSES
   * the card, so it visibly closes while the socket keeps the focus it just
   * took (a focused tile would otherwise hold it open through `:focus-within`).
   */
  static #onToggleTalentCard(event, target) {
    const tile = target.closest(".azeroth-talent");
    if (!tile) return;
    const pinned = tile.classList.contains("is-pinned");
    for (const other of this.element.querySelectorAll(".azeroth-talent.is-pinned")) {
      if (other !== tile) this.#pinTalentCard(other, false);
    }
    this.#pinTalentCard(tile, !pinned);
    tile.classList.toggle("is-dismissed", pinned);
  }

  /** Pin or unpin one tile's card, and say so on its socket. */
  #pinTalentCard(tile, on) {
    tile.classList.toggle("is-pinned", on);
    tile.querySelector(".azeroth-talent-socket")?.setAttribute("aria-expanded", String(on));
  }

  /**
   * The card's dismissals, DELEGATED ONCE per rendered frame for the reason
   * `#bindBags` gives: the Progress part re-renders on every write, and a
   * listener on a tile would be dead after the first.
   *
   * - **Escape** puts the card away (WCAG 1.4.13) and, pressed from inside the
   *   card, hands focus back to the socket first: a focused control inside a
   *   card that goes `display: none` is blurred to the body. The socket is a
   *   `<button>` inside the sheet's `<form>`, so core's KeyboardManager reads
   *   `hasFocus` and never closes the window on the same key (14.367).
   * - **Leaving the tile** with the focus clears the dismissal, so the next
   *   visit shows the card again; leaving it with the POINTER clears it only
   *   where the tile does not still hold the focus, or a card put away by a
   *   click would reopen through `:focus-within` the moment the pointer left.
   * - **A click outside every tile** unpins every card.
   */
  #bindTalentCards() {
    if (this.#talentCardsBoundFor === this.element) return;
    this.#talentCardsBoundFor = this.element;
    const root = this.element;
    const tileOf = el => el?.closest?.(".azeroth-talent") ?? null;

    root.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const tile = tileOf(event.target);
      if (!tile) return;
      if (tile.querySelector(".azeroth-talent-card")?.contains(event.target)) {
        tile.querySelector(".azeroth-talent-socket")?.focus({ preventScroll: true });
      }
      this.#pinTalentCard(tile, false);
      tile.classList.add("is-dismissed");
    });

    root.addEventListener("focusout", event => {
      const tile = tileOf(event.target);
      if (!tile || tile.contains(event.relatedTarget)) return;
      tile.classList.remove("is-dismissed");
    });

    root.addEventListener("pointerout", event => {
      const tile = tileOf(event.target);
      if (!tile || tile.contains(event.relatedTarget)) return;
      if (tile.contains(tile.ownerDocument.activeElement)) return;
      tile.classList.remove("is-dismissed");
    });

    root.addEventListener("click", event => {
      if (tileOf(event.target)) return;
      for (const tile of root.querySelectorAll(".azeroth-talent.is-pinned")) this.#pinTalentCard(tile, false);
    });
  }

  /**
   * Spend a point on a talent.
   *
   * **The gate is re-checked here, not trusted from the button.** The rendered
   * state can be stale — another client may have spent the point, or the sheet
   * may not have re-rendered — and a disabled button is a hint rather than a
   * rule.
   */
  static async #onTakeTalent(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;

    // A racial talent spends a pick, never a point (02 SS2, D-620).
    if (item.system.race) {
      const held = this.actor.items.filter(i => i.type === "talent" && i.system.race === item.system.race).map(i => i.system);
      const state = canTakeRacial({ ...item.system, name: item.name }, held, this.actor.system.level ?? 1);
      if (!state.ok) {
        ui.notifications?.warn(game.i18n.localize(`AZEROTH.Talent.Locked.${state.reason}`));
        return;
      }
      await item.update({ "system.taken": 1 });
      await this.render({ parts: ["progress"] });
      this.#refocusSocket(event, item.id);
      return;
    }

    const branch = this.actor.items
      .filter(i => i.type === "talent"
        && !i.system.race
        && i.system.className === item.system.className
        && i.system.branch === item.system.branch)
      .map(i => ({ ...i.system, name: i.name, _id: i.id }));

    const state = canTake(
      { ...item.system, name: item.name },
      branch,
      this.#talentPoints().left
    );
    if (!state.ok) {
      ui.notifications?.warn(
        game.i18n.localize(`AZEROTH.Talent.Locked.${state.reason}`)
      );
      return;
    }

    await item.update({ "system.taken": (Number(item.system.taken) || 0) + 1 });
    await this.render({ parts: ["progress"] });
    this.#refocusSocket(event, item.id);
  }

  /**
   * Hand a point back (04 §1, D-713).
   *
   * *"**A point may be taken back between fights.** A talent that another
   * talent requires, or whose point holds a higher tier open, gives nothing
   * back until that talent has been taken back first."*
   *
   * **Between fights is a STARTED fight**, and it is enforced here rather than
   * in `rules/talents.mjs`: a combat is Foundry state and the pure module
   * knows nothing about it. A fight nobody has started is not one.
   *
   * **The refusal names what is in the way**, which is the chapter's own
   * *until that talent has been taken back first*: *Snake Trap requires it*
   * tells the player which point to take back first, where a bare *no* would
   * not.
   *
   * Nothing else is written: `_onUpdateDescendantDocuments` re-syncs the
   * grants, the features and the owner-side effects off the moved `taken`
   * (D-642), exactly as taking one does.
   */
  static async #onUntakeTalent(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    if (this.actor.activeFight()) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Talent.Locked.inFight"));
      return;
    }

    const refuse = state => {
      ui.notifications?.warn(game.i18n.format(`AZEROTH.Talent.Locked.${state.reason}`, { name: state.name ?? "" }));
    };

    // A racial talent hands back a PICK, never a point (02 §2, D-620).
    if (item.system.race) {
      const state = canUntakeRacial({ ...item.system, name: item.name });
      if (!state.ok) return refuse(state);
      await item.update({ "system.taken": 0 });
      await this.render({ parts: ["progress"] });
      this.#refocusSocket(event, item.id);
      return;
    }

    // The SAME shape `#onTakeTalent` builds, so `keyOf` matches the talent
    // being judged to its own row in the branch.
    const branch = this.actor.items
      .filter(i => i.type === "talent"
        && !i.system.race
        && i.system.className === item.system.className
        && i.system.branch === item.system.branch)
      .map(i => ({ ...i.system, name: i.name, _id: i.id }));

    const state = canUntake({ ...item.system, name: item.name, _id: item.id }, branch);
    if (!state.ok) return refuse(state);

    await item.update({ "system.taken": Math.max(0, (Number(item.system.taken) || 0) - 1) });
    await this.render({ parts: ["progress"] });
    this.#refocusSocket(event, item.id);
  }

  /** The race trait's feature item, the one the sync grants for the race (D-620). */
  #raceTraitFeature() {
    const raceId = this.actor.raceItem?.id;
    if (!raceId) return null;
    return this.actor.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.classId === raceId) ?? null;
  }

  /** The skill Adaptable names, recorded on the Human trait's `known` list, or null. */
  #adaptableSkill() {
    return skillFromKnown(this.#raceTraitFeature()?.system?.known ?? []);
  }

  /**
   * The twenty-three skills in book order, grouped by the ability each reads
   * (D11 §1). **Total = attribute modifier + Proficiency + Rank** (02 §8).
   */
  #skills() {
    const system = this.actor.system;
    const ranks = this.actor.getFlag("azeroth-rpg", "skillRanks") ?? {};
    // The career's list, and the one skill a Human's Adaptable names, which
    // is always in-career whatever the career (02 §5, D-636).
    const inCareer = inCareerSkills({ career: this.actor.careerItem?.system ?? null, adaptable: this.#adaptableSkill() });
    const purse = unspent(system.xp ?? {});

    return Object.entries(AZEROTH.skills).map(([key, label]) => {
      const ability = AZEROTH.skillAbility[key];
      const rank = Number(ranks[key]) || 0;
      // What the skill covers (02 §8), on the name's hover and the row's menu (2026-09-06).
      const tooltip = skillTooltip(key);
      return {
        key,
        label,
        ability,
        tooltip,
        abilityLabel: AZEROTH.abilities[ability],
        // Three letters in the row, the full name on hover: the row is 250px.
        abilityAbbr: AZEROTH.abilities[ability].replace(/\.Label$/, ".Abbr"),
        rank,
        // The in-career marker reads the career item's own list — that list is
        // the only reason a Rank is cheap, and showing it is how a player sees
        // why (D11 §1).
        inCareer: inCareer.has(key),
        // 02 SS8: the next Rank's cost, and whether the purse covers it.
        nextCost: rank < RANK_MAX ? rankCost(rank + 1, inCareer.has(key)) : null,
        canBuy: rank < RANK_MAX && purse >= rankCost(rank + 1, inCareer.has(key)),
        total: (system.abilities?.[ability]?.mod ?? 0) + (system.proficiency ?? 0) + rank
      };
    });
  }

  /**
   * Momentum and Power. **The bar segments come from the class, never from a
   * constant** (D11 §2) — and a pool the character does not hold draws an
   * em-dash rather than an empty bar (D-509).
   */
  #pools() {
    const system = this.actor.system;
    const build = (pool, stored, kind = null) => {
      if (!pool) return { held: false, label: null, value: null, max: null, segments: [], editable: false };
      const label = AZEROTH.momentumTypes[pool.name] ?? AZEROTH.powerTypes[pool.name] ?? pool.name;
      return {
        held: true,
        itemId: pool.itemId,
        kind,
        // The name is a class on the bar: Mana draws blue (2026-09-06).
        name: pool.name,
        label,
        // The stepper's own labels (the lead, 2026-09-13). A bare name inside
        // a partial resolves against the ROW, never the root (D-609), so
        // everything `pool.hbs` reads is spread onto the row here.
        title: label,
        editable: this.isEditable,
        value: stored.value,
        max: pool.max,
        // One segment per point the class allows: a Warrior's bar has ten and
        // a Rogue's has five.
        segments: Array.from({ length: pool.max }, (_, i) => ({ filled: i < stored.value }))
      };
    };
    // ONE ENTRY PER POWER POOL THE CHARACTER HOLDS (02 §10). A double-caster
    // draws two, and 28 of the 36 possible class pairings are one - so this is
    // the common multiclass case, not a corner of it. Momentum stays single:
    // 05 §11 makes its five names one resource.
    const momenta = (system.momenta ?? []).map(pool => build(pool, pool, "momentum"));
    const powers = (system.powers ?? []).map(pool => build(pool, pool, "power"));

    // A character holding neither still draws the em-dash rather than nothing
    // at all (D-509), so an empty list becomes one absent entry on each side.
    return [
      ...(momenta.length ? momenta : [build(null, {})]),
      ...(powers.length ? powers : [build(null, {})])
    ];
  }

  /**
   * The three images a character carries (D-700), resolved for the templates.
   *
   * | key | field | drawn by |
   * |---|---|---|
   * | `token` | `prototypeToken.texture.src` | the banner's top-left portrait |
   * | `art`   | `system.art`                 | the Overview tab's centre |
   * | —       | `actor.img`                  | the Actor directory and chat cards; the fallback for both |
   *
   * **`token` can only fall back in theory.** Core's `BaseActor
   * #_initializeSource` runs `src = src || source.img` on every initialisation
   * (verified against 14.367), so a loaded actor never reads it blank. The
   * `||` stays because it costs nothing and says what the template means; the
   * banner's `data-edit` write is therefore never a value the reader did not
   * already have.
   *
   * **`art` genuinely falls back**, which is why the Overview's door is an
   * action rather than a `data-edit`: `FormDataExtended#processEditableHTML`
   * writes every `[data-edit]` img's `src` on EVERY submit, so a falling-back
   * `data-edit="system.art"` would stamp `actor.img` into the field the first
   * time any unrelated control was touched, and it would never fall back
   * again. `hasArt` is read off the stored field, never off the resolved one.
   */
  #portraits() {
    const art = this.actor.system.art ?? "";
    return {
      token: this.actor.prototypeToken?.texture?.src || this.actor.img,
      art: art || this.actor.img,
      hasArt: Boolean(art)
    };
  }

  /**
   * **THE SHAPE WORN, AS THE SHEET DRAWS IT** (02 §7; D-769), or null.
   *
   * The lead's ask: *use the normal character sheet updated to reflect the
   * form*. One object for every surface - the banner's *In Black Bear form*
   * with the form's portrait and Leave; the Core plates' *form* marks; the
   * Combat tab's Defense, Armor Points and Speed naming the form, the block's
   * own attack rows with their Attack buttons, and what melded IN WORDS; the
   * chip; and the Overview's Stats.
   *
   * The attack rows are `readyWeapons`' own, so the sheet and the attack door
   * cannot disagree about what is swung. Each row's bonus is the door's: the
   * form's ability modifier for the way it is struck, Proficiency, and a worn
   * `+N Attack` (08 §20).
   */
  #shapeContext() {
    const shape = this.actor.shape;
    if (!shape) return null;
    const system = this.actor.system;
    const label = shapeLabel(shape);
    const names = game.i18n.getListFormatter({ type: "conjunction" }).format(shape.forms.map(f => f.name));
    const first = shape.forms[0] ?? {};
    const melds = meldsGear(shape.kind);
    const attacks = (this.actor.readyWeapons?.() ?? []).filter(w => w.natural).map((w, index) => {
      const ability = attackAbility(w.system, null);
      const bonus = (system.abilities?.[ability]?.mod ?? 0) + (system.proficiency ?? 0) + (system.attackBonus ?? 0);
      return {
        index,
        name: w.name,
        form: w.natural.form,
        img: shape.forms.find(f => f.name === w.natural.form)?.token ?? first.token ?? null,
        rating: w.system.rating,
        range: w.system.range,
        traits: w.system.traits,
        bonus,
        bonusTip: game.i18n.format("AZEROTH.Shape.BonusTip", {
          ability: game.i18n.localize(AZEROTH.abilities[ability] ?? ability),
          mod: signed(system.abilities?.[ability]?.mod ?? 0),
          proficiency: signed(system.proficiency ?? 0)
        })
      };
    });
    // What melded, in WORDS (the lead: *"Melds; Signatures count"*): every
    // thing worn or held, sorted so two renders read alike (CLAUDE.md §15).
    const melded = melds
      ? this.actor.items
        .filter(i => ["weapon", "armor", "gear"].includes(i.type) && i.system?.equipped === true)
        .map(i => i.name)
        .sort((a, b) => a.localeCompare(b))
      : [];
    return {
      kind: shape.kind,
      kindLabel: AZEROTH.shapeKinds[shape.kind] ?? null,
      label,
      line: game.i18n.format("AZEROTH.Shape.InForm", { form: label }),
      names,
      portrait: first.portrait || first.token || null,
      uuid: first.uuid ?? null,
      // Named under Defense, the Armor Points and the Speed: they are the block's.
      from: game.i18n.format("AZEROTH.Shape.FromForm", { name: names }),
      speed: system.speed ?? null,
      flying: system.flyingSpeed ?? null,
      melds,
      attacksHeading: game.i18n.format("AZEROTH.Shape.Attacks", { name: names }),
      attacks,
      melded: melded.length ? game.i18n.format("AZEROTH.Shape.Melded", { names: game.i18n.getListFormatter({ type: "conjunction" }).format(melded) }) : null,
      ward: shape.ward?.school
        ? game.i18n.format("AZEROTH.Shape.WardLine", { ward: shape.ward.value, school: game.i18n.localize(AZEROTH.schools[shape.ward.school] ?? shape.ward.school) })
        : null
    };
  }

  /** The three tracks, with what each has crossed (D-457, D-458). */
  #corruptionTracks() {
    const state = this.actor.system.corruptionState ?? {};
    const effects = this.actor.system.corruptionEffects ?? { rungs: [], endings: [] };
    const say = key => game.i18n.localize(`AZEROTH.Corruption.Note.${key}`);
    // The chapter's cells carry markdown bold (**Vulnerable (Holy)**); the
    // tab printed the asterisks (the shots, 2026-09-06). Bold, nothing else.
    const bold = text => foundry.utils.escapeHTML(String(text ?? "")).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return Object.entries(AZEROTH.corruptionTracks).map(([key, label]) => ({
      key,
      label,
      ...state[key],
      // What each rung in force does, in the chapter's words (10 §4 to §6, §9; 2026-09-06).
      inForce: effects.rungs.filter(r => r.track === key).map(r => ({
        at: r.at, name: r.name, gain: bold(r.gain), take: bold(r.take), notes: r.notes.map(say)
      })),
      ending: (e => (e ? { ...e, are: bold(e.are), areNot: bold(e.areNot) } : null))(effects.endings.find(e => e.track === key)),
      // Precomputed rather than compared in the template: a comparison helper
      // would be a game rule living in Handlebars, which is where rules go to
      // stop being testable (CLAUDE.md §3).
      rungs: AZEROTH.CORRUPTION_THRESHOLDS.map(at => ({
        at,
        crossed: (state[key]?.value ?? 0) >= at
      })),
      max: AZEROTH.CORRUPTION_MAX
    }));
  }

  /** Which Resilience an ability answers for, or null where it answers none. */
  #resilienceFor(abilityKey) {
    const system = this.actor.system;
    const entry = Object.entries(AZEROTH.resilienceAbility)
      .find(([, ability]) => ability === abilityKey);
    if (!entry) return null;
    const [resilience] = entry;
    const trained = (this.#trainedResiliences()).includes(resilience);
    return (system.abilities?.[abilityKey]?.mod ?? 0) + (trained ? system.proficiency ?? 0 : 0);
  }

  #trainedResiliences() {
    const out = new Set();
    for (const item of this.actor.classItems ?? []) {
      for (const r of item.system?.resiliences ?? []) out.add(r);
    }
    return [...out];
  }

  /* -------------------------------------------- */

  /**
   * The weapons the character is carrying, as the combat tab draws them.
   *
   * THE SHEET LISTED NO ITEMS AT ALL. The combat tab's own comment promised
   * "and weapons" and there was neither a list nor a button, so there was
   * nothing on it to click - which is what a person using it reported, and
   * what no geometry check could see, because an empty panel that renders is
   * still a panel that renders.
   */
  #weapons() {
    const weapons = this.actor.items.filter(i => i.type === "weapon");
    const bundles = weapons.map(i => ({ id: i.id, name: i.name, ...i.system }));
    return weapons
      // A bundle of shot is not a weapon to swing (D-641): it lists beneath.
      .filter(item => !item.system.isShot)
      .map(item => {
        const sys = item.system;
        // A launcher fires the bundle nocked on it: the row's Rating is the
        // shot's plus the launcher's, a dash while nothing fits (D-406).
        const fitting = sys.isLauncher ? fittingBundles(sys, bundles) : [];
        const chosen = sys.isLauncher ? selectAmmunition(sys, fitting) : null;
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          rating: sys.isLauncher ? (chosen ? shotDamage(sys, chosen).rating : null) : sys.rating,
          range: sys.range,
          traits: sys.traits ?? [],
          equipped: sys.equipped === true,
          rarityClass: rarityClass(sys.rarity),
          detail: detailFields(item),
          editable: this.isEditable,
          launcher: sys.isLauncher ? game.i18n.localize(AZEROTH.launcherKinds[sys.launcher]) : null,
          ammo: sys.isLauncher ? fitting.map(b => ({ id: b.id, name: b.name, quantity: b.quantity ?? 0, selected: b.id === chosen?.id })) : []
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The bundles of shot carried, beneath the weapons (D-641): counted, never swung. */
  #ammunition() {
    const favorites = new Set(this.actor.favorites);
    return this.actor.items
      .filter(i => i.type === "weapon" && i.system.isShot)
      .map(item => ({
        id: item.id,
        name: item.name,
        img: item.img,
        quantity: item.system.quantity ?? 0,
        fits: (item.system.fits ?? []).map(k => game.i18n.localize(AZEROTH.launcherKinds[k] ?? k)).join(", "),
        rarityClass: rarityClass(item.system.rarity),
        favorite: favorites.has(item.id),
        detail: detailFields(item)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Everything carried, for the Gear tab.
   *
   * The reader moved to `applications/carried.mjs` when the creature got a Gear
   * tab of its own (the lead's N3): every line of it was already actor-generic,
   * so a copy on the NPC sheet would have been a second place for 08 §11's slot
   * chip and 08 §12's Use to rot.
   */
  #carried() {
    return carriedRows(this.actor);
  }

  /* -------------------------------------------- */
  /*  The Gear tab as bag slots (D-738)            */
  /* -------------------------------------------- */

  /**
   * Every localised word the bag panels, the tooltip and the derived
   * bag-slot line print.
   *
   * **The pure modules take the words in a bag** (D-677): `rules/bags.mjs`
   * and `applications/item-fields.mjs` compose every derived line and may not
   * reach `game.i18n`, so the enums are read off `CONFIG.AZEROTH` here and
   * handed over. A kind added to the config appears on the sheet with nothing
   * else to change (CLAUDE.md §4).
   */
  #bagWords() {
    const enumWords = key => Object.fromEntries(
      Object.entries(AZEROTH[key] ?? {}).map(([k, v]) => [k, game.i18n.localize(typeof v === "string" ? v : (v?.label ?? k))])
    );
    return {
      // Off the pure module's OWN vocabulary, never off whatever happens to
      // be in `lang/en.json`: a kind with no word lands as `undefined` and the
      // line is silently not drawn, and this is what makes the audit see it.
      kind: Object.fromEntries(TILE_KINDS.map(k => [k, game.i18n.localize(`AZEROTH.Bags.Kind.${k}`)])),
      place: Object.fromEntries(TILE_PLACES.map(k => [k, game.i18n.localize(`AZEROTH.Bags.Place.${k}`)])),
      blurb: Object.fromEntries(BLURB_KINDS.map(k => [k, game.i18n.localize(`AZEROTH.Bags.Blurb.${k}`)])),
      rarity: enumWords("rarities"),
      hold: enumWords("holdKinds"),
      weight: game.i18n.localize("AZEROTH.Sheet.Pounds"),
      count: game.i18n.localize("AZEROTH.Bags.Count"),
      // The item sheet's own label for the derived line, so the inspector can
      // drop the field it already prints above rather than saying *Bag slots:
      // Takes 1 bag slot* under it (the first shots, D-611).
      bagSlotsLabel: game.i18n.localize("AZEROTH.Item.BagSlots"),
      charges: game.i18n.localize("AZEROTH.Container.Charges"),
      coated: game.i18n.localize("AZEROTH.Use.CoatedWith"),
      use: game.i18n.localize("AZEROTH.Bags.Use"),
      // What `item-fields.mjs#derivedValue("bagSlots")` composes, which is the
      // same line the item sheet draws — one composition, three surfaces.
      derived: {
        bagSlotsTakes: game.i18n.localize("AZEROTH.Item.BagSlotsTakes"),
        bagSlotsTakesOne: game.i18n.localize("AZEROTH.Item.BagSlotsTakesOne"),
        bagSlotsNone: game.i18n.localize("AZEROTH.Item.BagSlotsNone"),
        bagSlotsAdds: game.i18n.localize("AZEROTH.Item.BagSlotsAdds"),
        bagSlotsCarries: game.i18n.localize("AZEROTH.Item.BagSlotsCarries"),
        bagSlotsWhy: Object.fromEntries(
          Object.keys(AZEROTH.holderReasons).map(k => [k, game.i18n.localize(AZEROTH.holderReasons[k])])
        ),
        hold: enumWords("holdKinds")
      }
    };
  }

  /**
   * The whole Gear tab: WoW's bag window over 08 §11's own arithmetic
   * (D-736, D-738).
   *
   * **`rules/slots.mjs#ledger` says where everything is and
   * `rules/bags.mjs#buildPanels` says how it is drawn.** Nothing here decides
   * either; what it does is turn one derivation into the rows, the words and
   * the prerendered cards a template can print.
   *
   * The rows carry the item's LIVE `system`, because every pure rule below —
   * the size of a thing in a counted container, what kind it is, what its
   * blurb says — reads it, and a flat copy would have to be kept in step with
   * the schema by hand.
   *
   * @param {Array<object>} rows  `carriedRows` output, already described
   */
  async #bags(rows) {
    const system = this.actor.system;
    const base = Number(system.bagSlots?.base);
    const items = [...this.actor.items];
    const led = ledger(items, Number.isFinite(base) ? base : BASE_SLOTS);
    const words = this.#bagWords();
    const names = new Map(items.map(item => [item.id, item.name]));
    const starred = new Set(this.actor.favorites);
    const described = new Map((rows ?? []).map(row => [row.id, row]));

    const tiles = new Map();
    for (const item of items) {
      if (!["weapon", "armor", "gear"].includes(item.type)) continue;
      tiles.set(item.id, await this.#bagRow(item, described.get(item.id) ?? {}, { led, words, names, starred }));
    }

    // The bar: the four general places with the empty ones drawn as places to
    // drop a bag on, then the counted ones that are filled (08 §11 gives one
    // of each kind BESIDE the four, so an empty quiver place would be five
    // pieces of furniture for a character who owns no quiver).
    const general = led.bar.filter(p => !p.of);
    const counted = led.bar.filter(p => p.of);
    const hint = game.i18n.localize("AZEROTH.Bags.EmptyPlace");
    const bar = [
      ...general.map(p => ({ tile: this.#barTile(tiles.get(p.id)) })),
      ...Array.from({ length: Math.max(0, MAX_CONTAINERS - general.length) }, () => ({ tile: null, hint })),
      ...counted.map(p => ({ tile: this.#barTile(tiles.get(p.id)) }))
    ];

    const panels = buildPanels(led, [...tiles.values()], { wornOrder: slotOrder(figureSlots(items)) })
      .map(panel => this.#bagPanel(panel, names));

    return {
      panels,
      bar,
      mount: led.mount ? tiles.get(led.mount) ?? null : null,
      stable: led.stable.map(id => tiles.get(id)).filter(Boolean),
      // The hidden cards, in a stable order so the DOM does not churn between
      // renders (CLAUDE.md §15).
      inspect: [...tiles.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    };
  }

  /**
   * A bar place's tile: the SAME tile, plus its own id as a drop zone, so a
   * thing dropped on a worn bag's icon goes in that bag (D-738's drop table).
   */
  #barTile(tile) {
    return tile ? { ...tile, containerId: tile.id } : null;
  }

  /** One panel, with the words its head, its over row and its empty state print. */
  #bagPanel(panel, names) {
    const worn = panel.kind === "worn";
    const label = worn
      ? game.i18n.localize("AZEROTH.Bags.Equipped")
      : (panel.containerId ? (names.get(panel.containerId) ?? "") : game.i18n.localize("AZEROTH.Bags.Carried"));
    const holder = panel.containerId ? this.actor.items.get(panel.containerId) : null;
    const empty = worn
      ? "AZEROTH.Bags.NothingWorn"
      : (panel.containerId ? "AZEROTH.Bags.NothingIn" : "AZEROTH.Bags.NothingCarried");
    return {
      ...panel,
      zone: worn ? "equipped" : null,
      label,
      rarityClass: holder ? rarityClass(holder.system?.rarity) : null,
      countLine: worn
        ? game.i18n.localize("AZEROTH.Bags.Free")
        : game.i18n.format("AZEROTH.Bags.PanelFill", { used: panel.used, max: panel.wells }),
      // A Barrel, a rowboat, a Component pouch: it looks like a holder and
      // adds nothing, and the reason is the only useful thing to print.
      reasonLine: panel.reason && AZEROTH.holderReasons[panel.reason]
        ? game.i18n.localize(AZEROTH.holderReasons[panel.reason])
        : null,
      emptyLine: game.i18n.localize(empty),
      overLine: game.i18n.format("AZEROTH.Bags.PanelOver", { n: panel.over }),
      overLabel: game.i18n.localize("AZEROTH.Bags.OverLabel")
    };
  }

  /**
   * One thing, as the tile draws it and as the inspector draws it.
   *
   * The tooltip is RENDERED HERE into an HTML string rather than included as
   * a partial: core takes it through `data-tooltip-html` and runs it through
   * `cleanHTML` (14.367).
   */
  async #bagRow(item, described, { led, words, names, starred }) {
    const sys = item.system ?? {};
    const place = this.#placeOf(item.id, led, names);
    const row = {
      ...described,
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      sort: item.sort ?? 0,
      system: sys,
      rarityClass: rarityClass(sys.rarity),
      favorite: starred.has(item.id),
      coating: item.getFlag("azeroth-rpg", "coating")?.name ?? null,
      charges: hasCharges(sys.charges) ? { ...sys.charges } : null,
      usable: hasUse(sys.use),
      quantity: sys.quantity ?? null,
      // A container and a mount are put on from this tab now (D-736), so the
      // row's own answer is `actions.mjs#wearable` rather than the narrower
      // rule `carried.mjs` keeps for the creature's tab.
      equippable: wearable(item),
      equipped: sys.equipped === true,
      augment: sys.augment ? { ...sys.augment } : null,
      // Every field the item stores, LESS the bag-slot line: the card prints
      // that above in words and a second copy under a label read as a bug.
      detail: (described.detail ?? detailFields(item)).filter(f => f.label !== words.bagSlotsLabel),
      // ONE composition of 08 §11's own line, drawn on the tooltip, in the
      // inspector and on the item sheet.
      bagLine: derivedValue("bagSlots", sys, words.derived),
      kindLine: [words.kind?.[kindOf({ type: item.type, system: sys })],
        sys.rarity ? words.rarity?.[sys.rarity] : null].filter(Boolean).join(" · "),
      placeLine: place.kind === "container"
        ? game.i18n.format("AZEROTH.Bags.Place.container", { name: place.name })
        : game.i18n.localize(`AZEROTH.Bags.Place.${place.kind}`)
    };
    row.badge = badgeOf(row);
    row.primary = primaryAction(row);
    row.ariaLabel = game.i18n.format("AZEROTH.Bags.TileLabel", {
      name: item.name,
      kind: row.kindLine,
      slots: row.bagLine ?? ""
    });
    // The inspector's three judged controls. A refusal is said in WORDS
    // beside the greyed button, never by the grey alone (D5).
    const options = containersFor(this.actor, item, led);
    row.canPutIn = options.length > 0;
    row.canTakeOut = containerOf(item) !== null;
    row.takeOutRefusal = row.canTakeOut ? this.#takeOutRefusal(item, led) : null;
    row.canSplit = stackKey(item.toObject()) !== null && unitsOf(item) > 1;
    row.tipHtml = await foundry.applications.handlebars.renderTemplate(
      "systems/azeroth-rpg/templates/actor/partials/item-tooltip.hbs",
      { tip: tipModel(row, { words, place }) }
    );
    return row;
  }

  /** Where a thing sits, as the words the tooltip and the inspector print. */
  #placeOf(id, led, names) {
    const key = placeOf(id, led);
    if (["worn", "bar", "mount", "stable"].includes(key)) return { kind: key, name: null };
    if (!key) return { kind: "base", name: null };
    return { kind: "container", name: names.get(key) ?? "" };
  }

  /**
   * Why *Take out* is greyed, or null.
   *
   * **Judged against CARRIED**, which is where the thing is going: the base
   * pack may have no well for it, and the door would refuse the write anyway
   * (D-737). Saying so before the press is the difference between a control
   * that looks broken and one that explains itself.
   */
  #takeOutRefusal(item, led) {
    const base = led.panels.find(p => p.key === "") ?? null;
    if (!base) return null;
    const need = slotsIn(item, base);
    if (base.used + need <= base.wells) return null;
    return game.i18n.format("AZEROTH.Bags.Refused.NoRoomToRemove", { name: item.name });
  }

  /**
   * The label on a tile: 08 §11's slot, or one of the held ones. A slot that
   * draws two tiles is NUMBERED - Finger 1, Finger 2 - through a format key,
   * never by joining two localised words in JS (CLAUDE.md §11).
   */
  #slotLabel(slot, index) {
    const text = game.i18n.localize(AZEROTH.wornSlots[slot] ?? AZEROTH.heldSlots[slot] ?? slot);
    if (!Number.isInteger(index)) return text;
    return game.i18n.format("AZEROTH.Overview.SlotNumber", { slot: text, n: index + 1 });
  }

  /**
   * The card under one paper-doll socket — THE GEAR TAB'S OWN CARD.
   *
   * The Overview tile carries no words since it became an icon-only socket
   * (the lead, 2026-09-20), so this is the only place a worn thing is named,
   * and a second tooltip composer would be the thing that drifts: it is
   * `rules/bags.mjs#tipModel` with the SLOT where the Gear tab puts where the
   * thing is kept, since everything on the figure is worn.
   *
   * **No `bagLine`**: what is worn is FREE of bag slots (05 *Speed and
   * movement*), and `derivedValue("bagSlots")` would answer *Takes 1 bag slot*
   * off the item alone, which is true of it in a bag and false of it here.
   */
  async #slotTip(item, slotLabel, words, note = null) {
    const sys = item.system ?? {};
    const tip = tipModel({
      name: item.name,
      type: item.type,
      system: sys,
      rarityClass: rarityClass(sys.rarity),
      bagLine: null,
      coating: item.getFlag("azeroth-rpg", "coating")?.name ?? null,
      usable: hasUse(sys.use)
    }, { words, slot: note ? `${slotLabel} · ${note}` : slotLabel });
    return foundry.applications.handlebars.renderTemplate(
      "systems/azeroth-rpg/templates/actor/partials/item-tooltip.hbs", { tip });
  }

  /**
   * The Overview tab (D-687, D-689): WoW's own paper doll of every slot with
   * what is in it, and a column saying what all of it is doing.
   *
   * **Nothing here is stored.** `figureSlots` answers every tile from what is
   * equipped, and In force reads the numbers `prepareDerivedData` already
   * worked out - `system.grants` IS `rules/grants.mjs#grantsFor`'s own output,
   * computed once on the model, so re-running it on a sheet would be a second
   * copy of the same rule.
   *
   * **The three rosters are ITERATED, never retyped** (D-689): each entry is
   * `{slot, index?}` and a finger or a trinket draws two tiles off one key,
   * so the tile indexes into the array `figureSlots` hands back.
   *
   * Every list a person reads is SORTED (CLAUDE.md §15): `system.ward`,
   * `system.spellpower` and the Boons are built by iterating the item
   * collection, whose order is not stable across a re-sync, so an unsorted
   * column would reorder itself between renders.
   *
   * @param {object} load  the carry line, shared with the Gear tab's head
   * @param {Array} signatures  the Combat tab's rows, summarised in the pane
   * @param {object} effects  `effectsContext`'s own output, read a second time
   *   for the strip under the hands row and never walked again
   * @param {object|null} shape  `#shapeContext`'s own object (D-769)
   */
  async #overview(load, signatures = [], effects = {}, shape = null) {
    const system = this.actor.system;
    const items = [...this.actor.items];
    const figure = figureSlots(items);
    const grants = system.grants ?? {};
    // The Gear tab's own vocabulary, because the figure's tooltip is the Gear
    // tab's own card: ONE composer (`rules/bags.mjs#tipModel`) for both.
    const words = this.#bagWords();

    const tile = async ({ slot, index }) => {
      const held = figure[slot];
      const item = (Array.isArray(held) ? held[index] : held) ?? null;
      const label = this.#slotLabel(slot, index);
      // The Off hand is barred while the main hand is held in both (D-689):
      // no action, no drop, and the reason in words beside the grey.
      const barred = slot === "offHand" && figure.twoHanded === true;
      // The Off hand shows the shield or the Augment where no off-hand
      // weapon is held (07 §3, D-674), so it says which it is showing.
      const note = slot === "offHand" && figure.offHandKind && figure.offHandKind !== "weapon"
        ? game.i18n.localize(AZEROTH.heldSlots[figure.offHandKind])
        : null;
      const barredNote = barred
        ? game.i18n.format("AZEROTH.Overview.TwoHanded", { name: figure.mainHand?.name ?? "" })
        : null;
      // **THE SOCKET CARRIES NO WORDS** (the lead, 2026-09-20, against WoW's
      // own character pane): the icon in its rarity ring is the whole tile, so
      // what it is has to be said in the `aria-label` and in the tooltip, and
      // both are composed here. A reader with no pointer and a reader with no
      // eyes each get the slot AND what is in it, in that order.
      const what = barred
        ? game.i18n.format("AZEROTH.Overview.BarredLabel", { note: barredNote })
        : (item?.name ?? game.i18n.localize("AZEROTH.Overview.Empty"));
      const ariaLabel = game.i18n.format("AZEROTH.Overview.TileLabel", { slot: label, what });
      const pickTip = game.i18n.format("AZEROTH.Overview.PickTip", { slot: label });
      return {
        slot,
        // `{{#if tile.index}}` is false for 0, so the template asks whether
        // the slot is numbered rather than whether the index is truthy.
        index: index ?? null,
        numbered: Number.isInteger(index),
        filled: Boolean(item),
        id: item?.id ?? null,
        img: item?.img ?? null,
        rarityClass: item ? rarityClass(item.system?.rarity) : null,
        barred,
        // What the socket used to print - the slot's label, the thing's name,
        // *Empty*, and which of a shield or an Augment the off hand is
        // showing - is all inside these two now.
        ariaLabel,
        // The Gear tab's own card, with the SLOT where the Gear tab says where
        // the thing is kept. An EMPTY socket takes a plain string through
        // core's `data-tooltip` instead: the invitation where the tile can be
        // pressed, and the same words the label carries where it cannot.
        tipHtml: item ? await this.#slotTip(item, label, words, note) : null,
        tip: item ? null : (barred || !this.isEditable ? ariaLabel : pickTip),
        // The whole sentence, for the line the figure prints under the hands
        // row: greyed AND said, and the socket has nowhere to say it.
        barredNote: barred ? what : null,
        // Spread onto the row: a bare {{editable}} inside #each is the row's,
        // not the root's (D-609).
        editable: this.isEditable
      };
    };

    // In the CONFIG's order, which is the book's - 07's schools, 02 §8's
    // twenty-three skills - and never alphabetical: the Skills panel two
    // columns to the left is in book order and a second ordering for the same
    // list reads as a different list.
    const byConfigOrder = enumeration => {
      const order = Object.keys(enumeration);
      const at = k => (order.indexOf(k) < 0 ? order.length : order.indexOf(k));
      return ([a], [b]) => at(a) - at(b) || a.localeCompare(b);
    };
    const bySchool = byConfigOrder(AZEROTH.schools);
    const bySkill = byConfigOrder(AZEROTH.skills);
    const augment = heldAugment(items);
    const left = await Promise.all(FIGURE_LEFT.map(entry => tile(entry)));
    // The right column NEEDS NOTHING OF ITS OWN now. D-689 mirrored its plates
    // so both columns' words faced the portrait; a socket has no words to turn
    // round, and the two columns simply flank the figure.
    const right = await Promise.all(FIGURE_RIGHT.map(entry => tile(entry)));
    const hands = await Promise.all(FIGURE_HANDS.map(entry => tile(entry)));
    // The CHARACTER ART between the columns (D-700), falling back to `img`.
    // Never the token: the token is the banner's, an inch above this.
    const portraits = this.#portraits();

    return {
      left,
      right,
      hands,
      // The barred Off hand's reason, printed under the hands row where a
      // reader meets it: an icon-only socket has nowhere to say it, and D-689
      // says the bar is greyed AND said in words. A tooltip nobody hovers is
      // not a refusal.
      barredNote: hands.find(t => t.barred)?.barredNote ?? null,
      portrait: portraits.art,
      hasArt: portraits.hasArt,
      // In words, never by an empty box alone (D5).
      nothing: ![...left, ...right, ...hands].some(t => t.filled),
      alsoReady: figure.alsoReady.map(item => ({
        id: item.id,
        name: item.name,
        img: item.img,
        rarityClass: rarityClass(item.system?.rarity)
      })),
      // **WHAT IS ACTING ON THIS CHARACTER RIGHT NOW** (the lead, 2026-09-20:
      // *Could use the open space in overview to show currently active effects
      // or conditions*), in the band of slab under the hands row.
      //
      // A READING, never a second source of truth: `effects` is the object
      // `effectsContext` built once for this render and Core's grid and effect
      // list are drawn from, and `rules/in-play.mjs` only decides which of its
      // rows are standing and which of them may be cleared here. The clear
      // goes through the SAME `effectAction` Core's own controls call - one
      // rule, two doors (D-686) - so the two tabs cannot drift.
      //
      // **The corruption rungs are NOT repeated here.** They are badges on the
      // banner, which is persistent and visible from every tab (D11 §1), and a
      // second copy two inches below them would be two places to read one
      // number.
      inPlay: inPlay({
        conditions: effects.conditions ?? [],
        effects: effects.rows ?? [],
        actorType: this.actor.type
      }),
      inForce: {
        // THE SHAPE WORN (D-769): its name, and that the physical half is the
        // block's - first in the pane, because every number under it moved.
        shape: shape ? { line: shape.line, from: shape.from, ward: shape.ward, melded: shape.melded } : null,
        abilities: Object.entries(system.abilities ?? {})
          .filter(([, a]) => (a.bonus ?? 0) !== 0)
          .map(([key, a]) => ({
            key,
            label: AZEROTH.abilities[key],
            points: a.bonus,
            from: (a.sources ?? []).map(s => s.name).join(", ")
          })),
        ward: Object.entries(system.ward ?? {}).filter(([, v]) => Number(v) > 0).sort(bySchool)
          .map(([school, value]) => ({ school, label: AZEROTH.schools[school] ?? school, value })),
        spellpower: Object.entries(system.spellpower ?? {}).filter(([, v]) => Number(v) > 0).sort(bySchool)
          .map(([school, value]) => ({ school, label: AZEROTH.schools[school] ?? school, value })),
        boons: [
          ...Object.entries(grants.boons ?? {}).sort(bySkill)
            .map(([skill, from]) => ({ skill, label: AZEROTH.skills[skill] ?? skill, from: [...from].sort().join(", ") })),
          // A Boon on a KIND of Test rather than on a skill (08 §20, D-691's
          // grammar): a parry rating read as a Boon on the Parry. Same row and
          // the same column - a reader wants one list of what is helping them,
          // not two under different headings - and after the skills, in
          // `AZEROTH.grantTests`' own order.
          ...Object.entries(grants.testBoonSources ?? {})
            .sort(byConfigOrder(AZEROTH.grantTests))
            .map(([test, from]) => ({
              skill: test,
              label: AZEROTH.grantTests[test] ?? test,
              from: [...from].sort().join(", ")
            }))
        ],
        // **WHAT A WORN THING ADDS TO A NUMBER THE SHEET ALREADY PRINTS**
        // (08 §20, 2026-09-10): Defense, the Attack Test, Speed, Initiative.
        // The Defense heading further down prints the TOTAL, so without this
        // row the number moves with nothing on the sheet to say why - which is
        // the whole reason `grantsFor` names the source behind every point.
        // `WORN_SCALARS`' own order, so two renders cannot disagree.
        scalars: WORN_SCALARS
          .filter(key => (grants.scalars?.[key] ?? 0) !== 0)
          .map(key => ({
            key,
            label: AZEROTH.wornScalars[key],
            points: grants.scalars[key],
            from: (grants.scalarSources?.[key] ?? []).map(s => s.name).sort().join(", ")
          })),
        fortitude: grants.fortitude ?? 0,
        defense: system.defense ?? null,
        ap: Object.keys(AZEROTH.locations).map(key => ({
          key,
          label: AZEROTH.locations[key],
          value: Math.max(0, system.ap?.[key] ?? 0)
        })),
        augment: augment ? { name: augment.name, bonus: augment.bonus, className: augment.className } : null,
        // WHAT THE SIGNATURES ON WHAT IS WORN ARE DOING (08 §20, S3; D-692):
        // one row per equipped Signature, beside Ward, Spellpower and the
        // Boons, saying whether its gate holds and carrying a button where
        // there is one to press. Assembled here rather than in `#signatures`
        // because this column is a summary and the Combat panel is the
        // controls; both read the same `signatureContext`, so they can never
        // disagree about whether a thing is available.
        //
        // A CAREER IS NOT WORN. Its Signature is on the Combat panel, where the
        // rest of what a character can do in a fight lives; this column is what
        // the FIGURE beside it adds up to, and a row here for a thing no tile
        // shows would read as a slot the eye had missed.
        signatures: signatures.filter(row => !row.career).map(row => ({
          id: row.id,
          name: row.name,
          rarityClass: row.rarityClass,
          kindLabel: row.kindLabel,
          gateFails: row.gateFails,
          pressable: row.pressable,
          refusal: row.refusal,
          refusalLabel: row.refusalLabel,
          gates: row.gates,
          // THE GATED SENTENCES (D-722). This column is a summary, so it prints
          // each branch's gate and not the holds/fails sentence beside it -
          // the Combat panel and the item sheet are where a refusal is said in
          // full. Without it a Signature whose Damage Rating is a Shaman's and
          // whose retaliation is everybody's reads here as ungated.
          gatedParts: row.gatedParts
        })),
        load
      }
    };
  }

  /**
   * The class features held, as the Core tab draws them (D-612): the
   * action, the cost, the uses, a Use button on an action and the book's
   * text behind the name. Grouped by class, primary first, level order.
   */
  async #features() {
    const favorites = new Set(this.actor.favorites);
    const order = new Map((this.actor.classItems ?? []).map((c, i) => [c.name, i]));
    const items = this.actor.items.filter(i => i.type === "feature")
      .sort((a, b) => (order.get(a.system.className) ?? 9) - (order.get(b.system.className) ?? 9)
        || (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    return Promise.all(items.map(async item => this.#featureRow(item, favorites)));
  }

  /**
   * The seven maneuvers as rows (D-626): the price once the character's
   * features, talents and grants have moved it, the book's sentence behind
   * the name, and Use where the pool can pay. Called Shot has no Use - it is
   * the attack dialog's checkbox - and its row says so.
   */
  #maneuvers() {
    return maneuversContext(this.actor);
  }

  /**
   * The action Ready named (05, D-694), off the combatant that holds it.
   *
   * It lives on the COMBATANT rather than the actor because a trigger only
   * means anything inside a fight, so out of one there is nothing to show.
   */
  #readied() {
    const fight = this.actor.activeFight?.() ?? null;
    return fight?.getCombatantsByActor?.(this.actor)?.[0]?.getFlag("azeroth-rpg", "ready") ?? null;
  }
  /**
   * Whether this turn still holds a Move that costs no Half-Action (02 §7's
   * Sprint, D-712). Off the BUDGET, so the chip goes out with the Move rather
   * than standing all fight beside a feature that is spent.
   */
  #freeMove() {
    const fight = this.actor.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(this.actor)?.[0] ?? null;
    return (combatant?.budget?.freeMove ?? 0) > 0;
  }
  /**
   * The Combat tab's charge controls (D-770; the lead, 2026-10-03: *"Either
   * order"*): one a rider whose spend buys a move, judged exactly as the press
   * will be. **Drawn in a fight alone** - out of one the rider is ticked on the
   * attack, and a control that could never be pressed is not drawn (D-711
   * phase 2's rule) - and in a Shapeshift form alone, because the line is.
   */
  #charges() {
    const fight = this.actor.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(this.actor)?.[0] ?? null;
    if (!combatant) return [];
    return chargeLines(this.actor.riderLines?.() ?? [], { inFight: true, onTurn: combatant.isCurrentTurn === true }).map(chargeControl);
  }
  /** The uses chip's data (D-623), or null where the item is unlimited. */
  #usesRow(item) {
    const u = item.system?.uses;
    return u?.per ? { value: u.value, max: u.max, per: AZEROTH.usesPer[u.per] } : null;
  }

  /**
   * Taken talents with a limited use (D-623): tracked on Core beside the
   * features, so a counter never lives only inside a hover card.
   */
  async #usableTalents() {
    const favorites = new Set(this.actor.favorites);
    const items = this.actor.items
      .filter(i => i.type === "talent" && (i.system.taken ?? 0) > 0 && i.system.uses?.per)
      // A talent that grants a feature counts its uses on the feature (D-642).
      .filter(i => !talentEffect(i.system.className, i.system.identifier)?.grants)
      .sort((a, b) => a.name.localeCompare(b.name));
    return Promise.all(items.map(async item => ({
      id: item.id,
      name: item.name,
      img: item.img,
      type: "talent",
      uses: this.#usesRow(item),
      available: item.system.available,
      favorite: favorites.has(item.id),
      effect: await enrich(item.system.effect, { relativeTo: item }),
      origin: this.#origin(item)
    })));
  }
  /**
   * The Signatures in play (08 §20, S3; D-692) — the Combat tab's panel, in the
   * shape *Talents in play* above it already has: a name, what it does, its
   * limit and a Use button where there is one to press.
   *
   * **EQUIPPED THINGS ONLY.** A sword in the pack is not wielded and 08 §6's
   * *what is worn grants* is the same rule; an unequipped item's Signature is
   * on its own sheet and nowhere else.
   *
   * **AND ONLY WHAT FIRES.** 1,337 of the equipment documents carry a
   * Signature of kind `none` — 1,188 with no prose at all and 149 whose
   * sentence is *Signature to be written* — and a panel that listed those
   * would be the placeholder shelf rather than what is in play. Their prose is
   * already on the item's own row here (`detailProse` writes a Signature line
   * into every weapon and carried row's expander) and on the item sheet, which
   * is surface one of the three and the one that prints the reason beside it.
   *
   * **AND THE CAREER'S, UNCONDITIONALLY.** 03 §5 gives every career a Signature
   * and it appeared nowhere on this sheet — only in the creator's career pane,
   * which a player sees once. A career is not equipped, so it is listed on its
   * own terms.
   *
   * **AND THE CAREER'S ROW IS A CONTROL LIKE ANY OTHER NOW.** It printed *the
   * count is the table's; nothing here keeps it* for one phase, because
   * `CareerData` had no `signatureEffect` field and `resetUses` walks
   * `system.signatureEffect.use.uses`. It has one; the parser stamps it from
   * `CAREER_SIGNATURES` and migration 0.12.0 fills a career already in a
   * world, so the eight the chapter gives a rest-bounded limit spend and
   * refill exactly as a worn Signature does — one `signatureContext` for the
   * career and the sword alike.
   */
  async #signatures() {
    const rows = [];
    const worn = this.actor.items
      .filter(i => ["weapon", "armor", "gear"].includes(i.type) && i.system?.equipped === true)
      .filter(i => hasSignature(i.system?.signatureEffect))
      // An embedded collection's order is not stable across a re-sync, so a
      // list a person reads is sorted (2026-09-06).
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const item of worn) {
      rows.push({
        id: item.id,
        name: item.name,
        img: item.img,
        rarityClass: rarityClass(item.system?.rarity),
        career: false,
        text: await enrich(item.system.signature ?? "", { relativeTo: item }),
        ...signatureContext(item, this.actor)
      });
    }
    const career = this.actor.careerItem;
    if (career?.system?.signature?.name) {
      rows.push({
        id: career.id,
        name: career.system.signature.name,
        img: career.img,
        rarityClass: null,
        career: true,
        origin: game.i18n.format("AZEROTH.Signature.FromCareer", { name: career.name }),
        text: await enrich(career.system.signature.description ?? "", { relativeTo: career }),
        // **THE CAREER'S OWN DESCRIPTOR, off the item** (D-692's Phase 6).
        // `CareerData` carries `signatureEffect` now, the parser stamps it from
        // `CAREER_SIGNATURES`, and a migration fills a career already in a
        // world - so the eight the chapter gives a rest-bounded limit count
        // their uses through `resetUses` like everything else, and this row
        // draws the same counter and the same Use button as a worn thing.
        // Reading the TABLE here instead would put a counter on the row that
        // nothing refills, which is exactly the half-working control D-681
        // keeps finding.
        ...signatureContext(career, this.actor)
      });
    }
    return rows;
  }

  async #featureRow(item, favorites) {
    const s = item.system;
    // In a Shapeshift form a Mana price is paid in Ferocity (07, D-769); the
    // chip says what the Use takes, through the law the door pays with.
    const price = featurePrice(s.cost, { inShapeshiftForm: this.actor.inShapeshiftForm === true });
    const poolLabel = price ? game.i18n.localize(AZEROTH.poolTypes[price.pool] ?? price.pool) : null;
    // A shape the character cannot take at all (the lead: *"No Avatar without
    // it"*): the row greyed and the reason in words, through the rule the
    // door refuses with (`useFeature`'s 1a).
    const barred = shapeRefusal(shapeKindOf({ name: item.name, choice: s.choice }), { ranks: name => this.actor.talentRanks?.(name) ?? 0 });
    // A talent's Use that asks for a Shapeshift form (04's Survival Instincts,
    // D-771): greyed out of one, with the door's own words.
    const grantId = item.getFlag("azeroth-rpg", "feature")?.talentId ?? null;
    const granting = grantId ? this.actor.items.get(grantId) ?? null : null;
    const use = granting ? onUseOf(talentEffect(granting.system?.className, granting.system?.identifier, granting.system?.race ?? null)) : null;
    const formless = use?.requires === "shapeshift" && this.actor.inShapeshiftForm !== true;
    const refusal = barred
      ? game.i18n.format("AZEROTH.Shape.NeedsTalent", { name: item.name, talent: barred.talent })
      : (formless ? game.i18n.format("AZEROTH.Feature.NeedsForm", { name: item.name }) : null);
    return {
      id: item.id,
      name: item.name,
      img: item.img,
      type: "feature",
      className: s.className,
      level: s.level,
      passive: s.kind === "passive",
      actionLabel: s.action ? AZEROTH.actions[s.action] : null,
      cost: poolLabel ? `${price.all ? game.i18n.localize("AZEROTH.Feature.SpendAll") : price.amount} ${poolLabel}` : null,
      casting: s.casting === true,
      uses: this.#usesRow(item),
      available: item.system.available && !refusal,
      refusal,
      favorite: favorites.has(item.id),
      effect: await enrich(s.description, { relativeTo: item }),
      detail: detailFields(item),
      origin: this.#origin(item),
      // What the feature has learned or bonded (D-619, D-635).
      known: (s.known ?? []).map(k => k.name).join(", "),
      // How many the menu takes in one use, where that is more than one
      // (02 §7's Totem Mastery, D-710). Null at one, which is every other
      // feature: a chip reading "up to 1" would be noise on all of them.
      picks: (s.picks ?? 1) > 1 ? s.picks : null,
      // The talents that changed it, and whether a talent granted it (D-642).
      modifiedBy: s.modifiedBy ?? [],
      talent: Boolean(item.getFlag("azeroth-rpg", "feature")?.talentId)
    };
  }

  /**
   * Where an item came from, for its expanded row (D-622): the parts from
   * `rules/origin.mjs`, localized and joined. A race's trait is the feature
   * the race item granted.
   */
  #origin(item) {
    const s = item.system ?? {};
    const raceId = this.actor.raceItem?.id ?? null;
    const flag = item.type === "feature" ? (item.getFlag("azeroth-rpg", "feature") ?? {}) : {};
    const isTrait = item.type === "feature" && raceId !== null && flag.classId === raceId;
    // A feature a talent granted (D-642) says the class, the branch and "talent".
    const grantedBy = flag.talentId ? this.actor.items.get(flag.talentId) : null;
    const parts = originParts({
      type: item.type, className: s.className, level: s.level, race: s.race,
      branch: grantedBy ? grantedBy.system.branch : s.branch, tier: s.tier, isTrait, isTalentGrant: Boolean(grantedBy)
    });
    if (!parts) return null;
    return parts
      .map(p => p.text ?? game.i18n.format("AZEROTH.Origin." + p.key, { level: p.n, tier: p.n }))
      .join(" \u00b7 ");
  }

  /**
   * The starred items (D-612), in the order they were starred, each with the
   * one button its kind answers to: Cast, Attack, Use, or nothing but its
   * name for gear and armor. Fifteen at most, capped on the actor.
   */
  async #favorites() {
    const favorites = new Set(this.actor.favorites);
    const rows = [];
    for (const id of this.actor.favorites) {
      const item = this.actor.items.get(id);
      if (!item) continue;
      if (item.type === "feature") { rows.push(await this.#featureRow(item, favorites)); continue; }
      rows.push({
        id: item.id,
        name: item.name,
        img: item.img,
        // Favorites lists weapons, suits and gear and carried no rarity at
        // all, so its icons went unringed while every other list's did
        // (D-676).
        rarityClass: rarityClass(item.system?.rarity),
        type: item.type,
        castable: item.type === "spell",
        attackable: item.type === "weapon",
        usable: hasUse(item.system.use),
        equipped: item.system?.equipped === true,
        meta: item.type === "spell" ? `T${item.system.tier}` : (item.type === "weapon" ? (item.system.rating ?? null) : null),
        favorite: true,
        detail: detailFields(item),
        origin: this.#origin(item)
      });
    }
    return { rows, count: rows.length, max: AZEROTH.FAVORITES_MAX };
  }

  /** Use a class feature: the dialog where it casts, straight where it does not. */
  /** Fill a thing that holds charges (08 SS11's waterskin, D-671). */
  static async #onFillCharges(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    await item.update({ "system.charges.value": charges.max });
    ui.notifications?.info(game.i18n.format("AZEROTH.Container.Filled", { name: item.name }));
  }

  /** Spend one (09 SS5: a day with no water costs a point of Fatigue). */
  static async #onSpendCharge(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    const left = Math.max(0, (charges.value ?? 0) - 1);
    await item.update({ "system.charges.value": left });
    if (left === 0) ui.notifications?.warn(game.i18n.format("AZEROTH.Container.Empty", { name: item.name }));
  }

  /**
   * Wipe off what was laid on a thing (08 SS13, D-670). A coating is the
   * bearer's to remove at any time: it goes when the blow lands, when they
   * rest, or here.
   */
  static async #onClearCoating(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const held = item.getFlag("azeroth-rpg", "coating");
    await item.unsetFlag("azeroth-rpg", "coating");
    if (held) ui.notifications?.info(game.i18n.format("AZEROTH.Use.Wiped", { name: held.name, item: item.name }));
  }

  /** 08 SS12 and SS13's Use (D-668): drink it, lay it on a thing, throw it. */
  static async #onUseGear(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return useGearWithDialog(this.actor, item);
  }

  static async #onUseFeature(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature") return;
    return useFeatureWithDialog(this.actor, item, event);
  }

  /**
   * Press an item's Signature (08 §20, D-692). The row carries the item's id,
   * as every other row on both tabs does; the door refuses on the same
   * judgement the button was greyed on.
   */
  static async #onUseSignature(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return useSignatureWithDialog(this.actor, item, event);
  }

  /** The fight's controls (D-627, D-694). */
  static async #onGuard() { return guard(this.actor); }
  static async #onDisengage() { return disengage(this.actor); }
  static async #onReady() { return ready(this.actor); }
  static async #onClearReady() { return clearReady(this.actor); }
  /** Hide (D-717): the event carries the shift that inverts the dialog setting. */
  static async #onStealth(event) { return hide(this.actor, event); }
  static async #onClearHidden() { return clearHidden(this.actor); }
  static async #onMarkQuarry() { return markQuarry(this.actor); }
  static async #onClearMark() { return clearMark(this.actor); }
  static async #onLeaveShape() { return leaveShapeControl(this.actor); }
  /**
   * Pay a rider before the blow (D-770): the control's `data-rider` names it.
   * The free Move and the round's record are the COMBATANT's, which renders no
   * actor sheet, so the tab is drawn again once both have landed.
   */
  static async #onPrimeRider(event, target) {
    const identifier = target?.dataset?.rider ?? "";
    if (!identifier) return null;
    const done = await primeRider(this.actor, identifier);
    if (done) this.render();
    return done;
  }
  /** Use a maneuver (D-626): pays the Momentum and posts the card, the targets as they stand. */
  static async #onUseManeuver(event, target) {
    const key = target.dataset.maneuver;
    if (!key) return;
    return game.system.azeroth.workflows.useManeuver({ actor: this.actor, key, targets: targetSnapshots() });
  }
  /** The uses stepper (D-623): one use up or down, clamped; the owner's to click. */
  static async #onStepUses(event, target) {
    if (!this.isEditable) return;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item?.system?.uses?.per) return;
    const value = stepUses(item.system.uses, Number(target.dataset.delta) || 0);
    if (value === item.system.uses.value) return;
    await item.update({ "system.uses.value": value });
  }
  /* -------------------------------------------- */
  /*  The bags' own controls (D-738, D-740, D-741) */
  /* -------------------------------------------- */

  /**
   * CLEAN UP BAGS (the lead, 2026-09-20): every bag sorted by type, then
   * rarity, then name, and packed to the front with no gaps.
   *
   * **ONE JUDGED BATCH**, and no bypass: every write lowers or holds a
   * panel's overflow, so the door reads the whole arrangement at once and
   * passes it. Writing them one at a time would judge each tile against a
   * half-tidied bag and refuse the middle of a legal compaction.
   *
   * **A second press writes nothing**, which is what `tidyBags` promises and
   * what the button has to be worth pressing.
   */
  static async #onTidyBags() {
    if (!this.isEditable) return null;
    const led = ledger([...this.actor.items], this.#baseSlots());
    const panels = buildPanels(led, this.#rows());
    const writes = tidyBags(panels);
    if (!writes.length) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.Bags.TidyNothing"));
      return null;
    }
    return this.actor.updateEmbeddedDocuments("Item", writes);
  }

  /**
   * Move what a panel cannot hold into the room there is elsewhere.
   *
   * **On the panel's own over row**, because that is where the reader is
   * looking when they find out: a bag reading over beside a Backpack with
   * seven free wells is an arrangement, and 05 charges nothing for it
   * (`slots.mjs#ledger`) — but nothing moved it either, so the row said *move
   * something out* and left the reader to drag each one.
   *
   * `arrange` writes are ORDINARY judged writes: every one of them reduces a
   * panel's overflow and never raises another's, so the door passes them and
   * no bypass is needed. They are scoped to THIS panel, so a button on the
   * Carried row never quietly reshuffles the Sack beside it.
   */
  static async #onMakeRoom(event, target) {
    if (!this.isEditable) return null;
    const panel = target.closest("[data-container-id],[data-bag-zone]");
    const key = panel?.dataset.containerId ?? "";
    const rows = this.#rows();
    const base = this.#baseSlots();
    // The PANEL a thing sits in, which is not the container it names: the
    // contents of an unequipped or fifth bag are in the base pack (D-735).
    const here = new Map();
    for (const p of ledger(rows, base).panels) for (const id of p.itemIds) here.set(id, p.key);
    const writes = arrange(rows, base).filter(w => here.get(w._id) === key);
    if (!writes.length) {
      ui.notifications?.info(game.i18n.localize("AZEROTH.Bags.MakeRoomNothing"));
      return null;
    }
    return this.actor.updateEmbeddedDocuments("Item", writes);
  }

  /** *Put in…* from the inspector: the chooser over the worn bags that take it. */
  static async #onPutInItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return null;
    return putInContainer(this.actor, item);
  }

  /**
   * *Take out*: into Carried, where the door judges the room (D-737). The
   * button is greyed with its reason where there is none, and this is the
   * second door - a rendered state is a hint and the rule is the write.
   */
  static async #onTakeOutItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !containerOf(item)) return null;
    return item.update({ "system.container": null });
  }

  /**
   * Take some of a stack into a new one (D-741).
   *
   * **Judged by the pure law first, written under the bypass after.** A split
   * costs room - one well of twenty arrows becomes two the moment five of
   * them move - so `judgeSplit` answers whether the panel has it, and the two
   * writes that follow are the act the law has already approved.
   *
   * **THE NEW STACK IS WRITTEN BEFORE THE SOURCE IS LOWERED**, so a failure
   * between the two leaves a duplicate rather than losing the units.
   *
   * Its own `DialogV2`, because the system's one chooser answers ONE list and
   * this asks for a number.
   */
  static async #onSplitStack(event, target) {
    if (!this.isEditable) return null;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return null;
    const held = unitsOf(item);
    if (held < 2) return null;

    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("AZEROTH.Bags.SplitTitle", { name: item.name }) },
      classes: ["azeroth", "azeroth-split-dialog"],
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Bags.SplitPrompt", { n: held }))}</p>`
        + `<input type="number" name="n" value="1" min="1" max="${held - 1}" step="1" autofocus>`,
      ok: {
        label: game.i18n.localize("AZEROTH.Bags.SplitLabel"),
        callback: (ev, button) => Math.trunc(Number(button.form.elements.n.value)) || 0
      },
      rejectClose: false
    });
    if (!n) return null;

    const verdict = judgeSplit(this.#rows(), this.#baseSlots(), item.id, n);
    if (!verdict.ok) {
      ui.notifications?.warn(game.i18n.format(verdict.reason, verdict.data ?? {}));
      return null;
    }
    const data = item.toObject();
    delete data._id;
    data.sort = nextSort([...this.actor.items]);
    foundry.utils.setProperty(data, "system.quantity", verdict.split);
    // **THE NEW STACK IS NOT ON THE STRING.** It is a copy of the source, and
    // a nocked bundle is the one thing exempt from worn-or-kept (D-739,
    // D-641) - so splitting one left TWO bundles nocked on one launcher, both
    // reading as the shot in hand. The half that stays keeps the string; the
    // half that leaves is arrows in a bag. (A favourite is an actor flag
    // keyed by item id, so the new stack is never one.)
    foundry.utils.setProperty(data, "system.equipped", false);
    // **THE CREATE GOES FIRST, AND THE ORDER IS THE WHOLE OF IT.** Both
    // writes carry the bypass, so neither is judged, and what is left behind
    // by a failure between them is what decides the order: lowering the
    // source and then failing to create LOSES the units outright, while
    // creating and then failing to lower leaves a duplicate - which a drop on
    // its twin merges back (D-741). Nothing about a split is worth losing
    // arrows over.
    const [made] = await this.actor.createEmbeddedDocuments("Item", [data], { azerothBags: "bypass" });
    if (!made) return null;
    await this.actor.updateEmbeddedDocuments("Item",
      [{ _id: item.id, "system.quantity": verdict.quantity }], { azerothBags: "bypass" });
    return made;
  }

  /** Star or unstar the row's item (D-612). */
  static async #onToggleFavorite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await this.actor.toggleFavorite(id);
  }

  /** Open an owned item's sheet. */
  static async #onOpenItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet?.render({ force: true });
  }

  /**
   * Attack with a weapon.
   *
   * THE LOCATION IS AN INPUT, NEVER READ OFF THE DIE (D-411, 06 §2). Body is
   * free, a Limb costs a Bane and the Head a Bane and -2; `rollTest` prices it
   * through `calledShotCost`, so this passes the choice and nothing else.
   */
  static async #onRollAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const weapon = this.actor.items.get(id);
    if (!weapon) return;

    const location = this.element.querySelector("[data-field=azeroth-location]")?.value ?? "body";
    // The dialog is the authority on the DC, the location and the Boons and
    // Banes (Phase 2); the sheet's select is only the location's default.
    return attackWithDialog(this.actor, weapon, event, { location });
  }

  /**
   * Attack with one of the shape's own rows (02 §7, D-769): the block's attack,
   * shaped as a weapon by `readyWeapons`, through the weapon door - the bonus
   * is the form's Strength modifier and the character's Proficiency, and the
   * printed DMG is the Rating.
   */
  static async #onRollNaturalAttack(event, target) {
    const index = Number(target.closest("[data-natural-index]")?.dataset.naturalIndex);
    const weapon = Number.isInteger(index) ? (this.actor.readyWeapons?.() ?? [])[index] ?? null : null;
    if (!weapon?.natural) return null;
    const location = this.element.querySelector("[data-field=azeroth-location]")?.value ?? "body";
    return attackWithDialog(this.actor, weapon, event, { location });
  }

  static async #onRollSkill(event, target) {
    const key = target.dataset.skill;
    const skill = this.#skills().find(s => s.key === key);
    if (!skill) return;
    return rollWithDialog(this.actor, {
      kind: "skill",
      skill: key,
      title: game.i18n.localize(skill.label),
      modifiers: [
        { label: AZEROTH.abilities[skill.ability], value: this.actor.system.abilities[skill.ability].mod },
        { label: "AZEROTH.Sheet.Proficiency", value: this.actor.system.proficiency },
        { label: "AZEROTH.Sheet.Rank", value: skill.rank }
      ]
    }, event);
  }

  /** Shared with the NPC sheet - one template, one handler (see actions.mjs). */
  static async #onRollAbility(event, target) {
    // The score is an input inside the plate: a click into it edits, not rolls.
    if (event.target?.matches?.("input")) return;
    return rollAbility(this.actor, target.dataset.ability, event);
  }

  /**
   * The rests live on the actor, which reads `rules/rest.mjs`. These handlers
   * used to do the arithmetic here and wrote `system.power.value` - the
   * legacy mirror prepareDerivedData overwrites - and restored FULL Health on
   * a Long Rest, against 05 §16.
   */
  /** The rail's Resilience chip is a button (Phase 3); the workflow reads the training. */
  static async #onRollResilience(event, target) {
    return resilienceWithDialog(this.actor, target.dataset.resilience, event);
  }

  /**
   * Spend from a pool, by the amount beside the button. 05 SS11's named
   * spends are class content - surfaced, not automated (D2 SS12) - so this
   * moves the number and nothing else.
   */
  static async #onSpendPool(event, target) {
    const { itemId, kind } = target.dataset;
    const input = target.parentElement?.querySelector("input.azeroth-spend");
    const amount = Math.max(1, Math.trunc(Number(input?.value)) || 1);
    const pool = this.actor.poolSnapshot().find(p => p.itemId === itemId && p.kind === kind);
    if (!pool) return null;
    if (pool.value < amount) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Sheet.CannotSpend"));
      return null;
    }
    return this.actor.updatePool({ itemId, kind, value: pool.value - amount });
  }

  /**
   * One point in or out of a pool (the lead, 2026-09-13). Through `stepPool`
   * in `actions.mjs`, which both sheets call, and `updatePool`, which clamps.
   */
  static async #onStepPool(event, target) {
    return stepPool(this.actor, target);
  }

  /** Exposure on a track (10 SS3), through the dialog's presets. */
  static async #onExposure(event, target) {
    return exposeWithDialog(this.actor, target.dataset.track, event);
  }

  /**
   * Drop a sustained spell; the per-turn charge stops with it (D-355).
   *
   * **THROUGH `endSustain`, THE ONE DOOR** (D-756). This wrote the flag itself,
   * so what the Sustain held stayed laid on its targets - the Spells tab's own
   * door already lifted them - and the two ways to drop one spell did two
   * different things. The area the cast placed goes with the flag either way
   * (`canvas/sustained-areas.mjs`).
   */
  static async #onStopSustaining(event, target) {
    // **A SUSTAIN WITH NO SPELL BEHIND IT** (04's Flametongue, D-779) is matched on
    // the cast its entry recorded, the one key every entry carries since D-724.
    const spellId = target.dataset.spellId || null;
    return game.system.azeroth.workflows.endSustain({ actor: this.actor, spellId, cast: spellId ? null : (target.dataset.cast || null) });
  }

  /** Cast from the Spells tab, through the dialog (D-601). */
  static async #onCastSpell(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item?.type !== "spell") return null;
    return castWithDialog(this.actor, item, event);
  }

  static async #onBrowseSpells() { return browseSpells(); }
  static async #onEndSustain(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return game.system.azeroth.workflows.endSustain({ actor: this.actor, spellId: id });
  }
  /**
   * Browse for a thing of the button's kind - the Gear tab's three Add
   * buttons and nothing else.
   *
   * **The Overview tab no longer browses** (D-689). A slot tile opens the
   * picker over what the character is already carrying, because *clicking a
   * slot should only show equipment available for that slot that the
   * character has in their inventory* (the lead, 2026-09-09).
   */
  static async #onBrowseItems(event, target) {
    return browseItems(target.dataset.type);
  }

  /* -------------------------------------------- */
  /*  The Overview picker (D-689)                  */
  /* -------------------------------------------- */

  /**
   * A slot tile clicked: choose from what the character ALREADY CARRIES for
   * that slot.
   *
   * *When a slot is clicked it should only show equipment available for the
   * slot that the character has in their inventory, not open the Comp
   * browser* (the lead, 2026-09-09). The browser is gone from this tab.
   */
  static async #onPickSlot(event, target) {
    const slot = target.dataset.slot;
    if (!slot || !this.isEditable) return null;
    const index = Number(target.dataset.index);
    return this.#pickForSlot(slot, Number.isInteger(index) ? index : undefined);
  }

  /**
   * One short line about a candidate, for the chooser's list: what it grants
   * where it grants something (08 §6), else its traits, else the number it is
   * carried for.
   *
   * **Never the item's prose.** The dialog is 440px wide and a paragraph of
   * lore under every row buries the choice.
   */
  #pickLine(item) {
    const grants = grantsOf(item);
    if (grants.length) return grants.join(" · ");
    const traits = (Array.isArray(item.system?.traits) ? item.system.traits : []).map(String).filter(Boolean);
    if (traits.length) return traits.join(", ");
    const rating = item.system?.rating;
    if (item.type === "weapon" && rating !== null && rating !== undefined) {
      return game.i18n.format("AZEROTH.Overview.PickRating", { n: rating });
    }
    if (item.type === "armor") {
      return game.i18n.format("AZEROTH.Overview.PickArmor", { n: item.system?.armorPoints?.body ?? 0 });
    }
    return "";
  }

  /**
   * The picker for one tile.
   *
   * `chooseOption` is the system's ONE chooser (D-673): a second would be a
   * second place for the greying to rot. It takes a document for the dialog's
   * id and title, so the actor is what is passed.
   *
   * The choice is applied through `#equipInSlot`, which is the same
   * `displacedBy` call the drop and the Equip button make.
   */
  async #pickForSlot(slot, index) {
    const items = [...this.actor.items];
    const figure = figureSlots(items);
    const label = this.#slotLabel(slot, index);

    // A barred tile carries no action and cannot be clicked; this is the
    // second door, the way #dropOnSlot's is (D-689).
    const barred = this.#barredMainHand(slot);
    if (barred) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.TwoHanded", { name: barred.name }));
      return null;
    }
    if (slot === "ammo") return this.#pickAmmunition(figure, items, label);

    const held = figure[slot];
    const worn = (Array.isArray(held) ? held[index ?? 0] : held) ?? null;
    // FROM THE ACTOR'S OWN ITEMS, and nothing else. `fitsSlot` is the same
    // rule the drop is refused by.
    const candidates = items.filter(i => fitsSlot(i, slot)).sort((a, b) => a.name.localeCompare(b.name));
    if (!candidates.length) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.NothingFor", { slot: label }));
      return null;
    }

    const classes = this.actor.classNames ?? [];
    const refusalFor = item => {
      const augment = item.system?.augment ?? null;
      if (!augment || canCarry(augment.category, classes)) return null;
      return game.i18n.format("AZEROTH.Augment.NotYours", { name: item.name, className: augment.className });
    };
    // **TWO OF ONE THING ARE TWO ROWS READING THE SAME WORD** (the lead,
    // 2026-09-13), which cannot be chosen between. Numbered by id, since an
    // embedded collection's order is not stable across a re-sync.
    const copies = copyLabels(candidates);
    // And the one already in the OTHER hand is named as such, so a second
    // Dagger offered for the off hand says where the first one is.
    const otherHand = slot === "mainHand" ? "offHand" : (slot === "offHand" ? "mainHand" : null);
    const inOther = otherHand ? figure[otherHand] : null;
    const otherTag = slot === "mainHand" ? "AZEROTH.Overview.InOffHand" : "AZEROTH.Overview.InMainHand";
    const rows = [
      // Where the tile is filled, taking it off is the first choice.
      ...(worn ? [{ key: "", name: game.i18n.localize("AZEROTH.Overview.TakeOff"), description: "", available: true }] : []),
      ...candidates.map(item => {
        // 08 §9 locks an Augment to its class; the row is listed and GREYED
        // rather than hidden, and its line says why (D-673's shape).
        const refusal = refusalFor(item);
        const copy = copies.get(item.id);
        return {
          key: item.id,
          name: copy ? game.i18n.format("AZEROTH.Overview.Copy", { name: item.name, n: copy }) : item.name,
          tag: item.id === worn?.id
            ? game.i18n.localize("AZEROTH.Overview.WornNow")
            : (inOther && item.id === inOther.id ? game.i18n.localize(otherTag) : null),
          // Escaped: the line is composed from an item's own name and traits,
          // and `chooseOption` enriches it as HTML.
          description: `<p>${foundry.utils.escapeHTML(refusal ?? this.#pickLine(item))}</p>`,
          available: !refusal
        };
      })
    ];

    const chosen = await game.system.azeroth.workflows.chooseOption(this.actor, rows, null, {
      label: "AZEROTH.Sheet.Equip",
      prompt: game.i18n.format("AZEROTH.Overview.PickFor", { slot: label })
    });
    if (!chosen) return null;
    if (!chosen.key) {
      return worn ? this.actor.updateEmbeddedDocuments("Item", [{ _id: worn.id, "system.equipped": false }]) : null;
    }
    const item = this.actor.items.get(chosen.key);
    if (!item) return null;
    const refusal = refusalFor(item);
    if (refusal) {
      ui.notifications?.warn(refusal);
      return null;
    }
    return this.#equipInSlot(item, slot, index);
  }

  /**
   * The Ammunition tile (D-641). Its choice equips nothing: it writes the
   * bundle's id to the LAUNCHER's `system.ammunition`, which is what
   * `selectAmmunition` reads on every shot.
   *
   * **No *Take it off* row.** `selectAmmunition` is lenient by design - with
   * nothing nocked a launcher still fires the first bundle that fits - so a
   * row promising an empty tile would be a lie.
   */
  async #pickAmmunition(figure, items, label) {
    const launcher = figure.ranged;
    const carried = items.filter(i => i.type === "weapon").map(i => ({ id: i.id, name: i.name, ...(i.system ?? {}) }));
    const bundles = launcher ? fittingBundles(launcher.system ?? {}, carried) : [];
    if (!bundles.length) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.NothingFor", { slot: label }));
      return null;
    }
    const nocked = figure.ammo;
    const rows = bundles.map(bundle => ({
      key: bundle.id,
      name: bundle.name,
      tag: bundle.id === nocked?.id ? game.i18n.localize("AZEROTH.Overview.NockedNow") : null,
      description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Card.ShotsLeft", { n: bundle.quantity ?? 0 }))}</p>`,
      available: true
    }));
    const chosen = await game.system.azeroth.workflows.chooseOption(this.actor, rows, null, {
      label: "AZEROTH.Overview.Nock",
      prompt: game.i18n.format("AZEROTH.Overview.PickFor", { slot: label })
    });
    if (!chosen) return null;
    return launcher.update({ "system.ammunition": chosen.key });
  }

  /** The creator on this sheet's own actor (D-636): fills it on Finish. */
  static async #onOpenCreator() {
    if (!AzerothCharacterCreator.canBuild(this.actor)) return null;
    return new AzerothCharacterCreator({ actor: this.actor }).render({ force: true });
  }

  /**
   * Set the character's own art (D-700) — the Overview tab's centre image is
   * its own control, which is the lead's explicit ask.
   *
   * **This is deliberately NOT core's `editImage` action.** That one reads the
   * img's `src` back out of the form on every submit, and this img falls back
   * to `actor.img` while `system.art` is blank — so a `data-edit` here would
   * stamp the directory portrait into the field the first time any other
   * control on the sheet was touched, and the fallback would never fire again.
   * Writing the picked path straight to `system.art` has no such seam.
   *
   * `FilePicker` is reached through its namespace: the bare global is a
   * deprecated compatibility reference (`client.mjs:230`, since v13) and the
   * e2e smoke test fails on the warning it logs.
   */
  static async #onEditArt() {
    if (!this.isEditable) return null;
    const actor = this.actor;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      current: actor.system.art || actor.img,
      type: "image",
      callback: path => actor.update({ "system.art": path }),
      position: { top: this.position.top + 40, left: this.position.left + 10 },
      document: actor
    });
    return picker.browse();
  }

  /**
   * Open the full plate (D-700), the NPC banner's door on the other sheet.
   *
   * Drawn only where `system.art` is set, so the control never opens nothing;
   * the guard is here as well because a card is a record of a moment and the
   * art can be cleared between the render and the press.
   */
  static async #onViewArt() {
    const src = this.actor.system.art;
    if (!src) return null;
    return new foundry.applications.apps.ImagePopout({
      src,
      uuid: this.actor.uuid,
      window: { title: this.actor.name }
    }).render(true);
  }

  /** The spells the carried items cast (D-633), for the Spells tab's From items. */
  #itemSpells() {
    const rows = [];
    for (const item of this.actor.items) {
      const list = Array.isArray(item.system?.spells) ? item.system.spells : [];
      list.forEach((s, index) => {
        const max = s.uses?.max ?? 0;
        const value = s.uses?.value ?? 0;
        rows.push({
          itemId: item.id, index, name: s.name, itemName: item.name,
          dcLabel: s.dc != null ? game.i18n.format("AZEROTH.Sheet.ItemSpellDC", { dc: s.dc }) : game.i18n.localize("AZEROTH.Forge.BearersDC"),
          limited: max > 0, value, max, full: value >= max,
          perLabel: s.uses?.per ? game.i18n.localize(AZEROTH.usesPer?.[s.uses.per] ?? s.uses.per) : "",
          available: max === 0 || value > 0,
          rarityClass: rarityClass(item.system?.rarity)
        });
      });
    }
    return rows.sort((a, b) => a.itemName.localeCompare(b.itemName) || a.index - b.index);
  }

  static async #onCastItemSpell(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return null;
    return castItemSpell(this.actor, item, Number(target.dataset.index), event);
  }

  static async #onStepSpellUses(event, target) {
    if (!this.isEditable) return null;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return null;
    const index = Number(target.dataset.index);
    const delta = Number(target.dataset.delta) || 0;
    const spells = foundry.utils.deepClone(item.system.toObject().spells ?? []);
    const entry = spells[index];
    if (!entry) return null;
    entry.uses.value = Math.max(0, Math.min(entry.uses.max ?? 0, (entry.uses.value ?? 0) + delta));
    return item.update({ "system.spells": spells });
  }

  /**
   * Buy the next Rank (02 SS8): 10 XP times the Rank, doubled outside the
   * career. The purse is checked here, not trusted from the button; the
   * spend is ledgered.
   */
  static async #onBuyRank(event, target) {
    const key = target.dataset.skill;
    const skill = this.#skills().find(s => s.key === key);
    if (!skill || skill.rank >= RANK_MAX) return null;
    const cost = rankCost(skill.rank + 1, skill.inCareer);
    const purse = unspent(this.actor.system.xp ?? {});
    if (purse < cost) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Sheet.CannotAfford", { cost, purse }));
      return null;
    }
    const ledger = foundry.utils.deepClone(this.actor.getFlag("azeroth-rpg", "xpLedger") ?? []);
    ledger.push({
      amount: cost,
      label: game.i18n.format("AZEROTH.Sheet.LedgerRank", { skill: game.i18n.localize(skill.label), rank: skill.rank + 1 }),
      at: Date.now()
    });
    return this.actor.update({
      [`flags.azeroth-rpg.skillRanks.${key}`]: skill.rank + 1,
      "system.xp.spent": (this.actor.system.xp?.spent ?? 0) + cost,
      "flags.azeroth-rpg.xpLedger": ledger
    });
  }

  /** The GM puts XP in the purse (D-508: granted, never earned by a bar). */
  static async #onGrantXP(event, target) {
    if (!game.user.isGM) return null;
    const input = target.parentElement?.querySelector("input.azeroth-grant");
    const amount = Math.trunc(Number(input?.value)) || 0;
    if (amount <= 0) return null;
    return this.actor.update({ "system.xp.earned": (this.actor.system.xp?.earned ?? 0) + amount });
  }

  /** The effects partial's five actions (actions.mjs#effectAction). */
  static async #onEffectAction(event, target) {
    return effectAction(this.actor, target.dataset.action, target);
  }

  /**
   * A Short Rest asks what is eaten and drunk first (05 §16, 08 §12; D-733).
   * A Long Rest rests directly: 05 §16 puts no condition on it.
   */
  static async #onShortRest() { return shortRestWithDialog(this.actor); }
  static async #onLongRest() { return this.actor.longRest(); }
  static async #onBurnTether() { return this.actor.burnTether(); }

  /** A new item of the button's type, opened for editing. */
  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    if (!type || !CONFIG.Item.dataModels[type]) return;
    const name = game.i18n.format("AZEROTH.Sheet.NewItem", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    item?.sheet?.render({ force: true });
    return item;
  }

  /** Delete, after a confirm - the one destructive click on the sheet. */
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
   * Equip or unequip. ONE SUIT AT A TIME: `prepareDerivedData` reads the
   * first equipped non-shield suit for every Armor Point, so equipping a
   * second suit unequips the first rather than leaving an ambiguous pair.
   *
   * **ONE AUGMENT AT A TIME** for the same reason (D-674): 07 §3 speaks of
   * *a caster holding one* throughout, and the Casting Test reads the one in
   * hand. 08 §9 makes it class-locked, so a class that cannot carry it is
   * refused at this door rather than casting through it silently.
   *
   * **ONE THING IN EACH WORN SLOT** (08 §11, D-686): the chapter has said so
   * since it was written and nothing enforced it, because a piece of gear
   * could not be equipped from this tab at all. `rules/worn.mjs` answers all
   * three exclusions now, and the two loops that used to be written out here
   * are its `displacedBy`.
   */
  static async #onToggleEquipped(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    // **ONE ANSWER TO "CAN THIS BE PUT ON"** (D-736): `actions.mjs#wearable`,
    // which the row's menu asks too. It gained 08 §11's containers and §15's
    // mounts with the bag bar, and a second copy of that rule here would have
    // greyed the Gear tab's own Equip on every backpack.
    if (!item || !wearable(item)) return null;
    // Taking a thing OFF is refused by the document door where there is no
    // bag slot to put it in (D-737), which says so in words.
    if (item.system?.equipped === true) {
      return this.actor.updateEmbeddedDocuments("Item", [{ _id: item.id, "system.equipped": false }]);
    }
    return this.#wear(item);
  }
}
