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

// 02's Timeless Mind on the sheet's Resilience numbers (stage 2b).
// The Demon Hunter's Hatred: its cap is read off the one Fel reader (the Demon Hunter plan).
import { HATRED, felFor, heldFel, restModifiersOf } from "../rules/hatred.mjs";
// The Hatred bar's ladder, rest cost and Fel Lash's shed (D11; the Demon Hunter plan's Phase 6, D-1581).
import { hatredView } from "../rules/hatred-view.mjs";
import { FEL_LASH, I_HAVE_PREPARED, SPECTRAL_SIGHT, felLashShed } from "../rules/demon-hunter-features.mjs";
import { awayOf } from "../rules/demon-hunter-spells.mjs";
import { CHRONO_FEATURES, timelessMindDoubles } from "../rules/chronomancer.mjs";
import { AZEROTH } from "../config.mjs";
import { dispersionRefusal } from "../rules/dispersion.mjs";
import { actorTraining, trainingWarning } from "../rules/equipment-training.mjs";
import { showsManeuvers } from "../rules/combat-sheet.mjs";
import { attackWithDialog, bindKeyActivation, bindPlateKeys, bindPoolInputs, bindScoreInputs, blankItemMenu, browseItems, browseSpells, containersFor, grantsOf, maneuversContext, castItemSpell, castWithDialog, afflictionsContext, AFFLICTION_OPEN_GROUP, AFFLICTION_OPEN_ROWS, rememberAfflictionOpen, detailFields, effectAction, effectsContext, exposeWithDialog, itemContextMenu, putInContainer, resilienceWithDialog, rollAbility, rollWithDialog, signatureContext, skillContextMenu, skillTooltip, stepPool, useFeatureWithDialog, useGearWithDialog, useSignatureWithDialog, wearable } from "./actions.mjs";
import { hasSignature } from "../rules/signatures.mjs";
// The one door for a Skill Test's numbers (05 §1, §8; D-810).
import { signedModifier, skillModOf, skillRowsFor, skillTotalFor } from "../rules/skills.mjs";
import { inPlay } from "../rules/in-play.mjs";
import { RANK_MAX, ledgerTotal, rankCost, unspent } from "../rules/xp.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { originParts } from "../rules/origin.mjs";
import { stepUses } from "../rules/uses.mjs";
import { maneuverCost } from "../rules/maneuvers.mjs";
import { targetSnapshots } from "./roll-dialog.mjs";
// A Short Rest asks what is eaten and drunk before it rests (05 §16, D-733).
import { longRestWithDialog, shortRestWithDialog } from "./rest-dialog.mjs";
import { reviewChainLightningCast } from "./chain-lightning-review.mjs";
import { clearHidden, clearMark, clearReady, disengage, guard, hide, leaveShapeControl, markQuarry, primeRider, ready } from "./combat-actions.mjs";
// A rider paid before the blow, the Combat tab's control (D-770).
import { chargeLines } from "../rules/riders.mjs";
import { raceLine } from "../rules/guise.mjs";
import { chargeControl } from "../helpers/rider-words.mjs";
// A shape on the sheet (02 §7, D-769): its name, what melds, the attack's ability.
import { FORCED_SPEED, SHAPE_ABILITIES, SHAPE_KINDS, isOverlayKind, meldsGear, shapeKindOf, shapeRefusal } from "../rules/shapes.mjs";
// What a Use needs in hand, greyed in words (run F4a).
import { versatileRating, wieldRefusal } from "../rules/wield.mjs";
import { classFeatureOnUse, featurePrice, rungsChip } from "../rules/class-features.mjs";
import { FORCED_ENDS, forcedRefusalFor, shapeLabel } from "../documents/shapes.mjs";
import { attackAbility, deftScores } from "../rules/ammunition.mjs";
// The Sovereign's Claws: an unarmed strike in the off hand (02 §7; D-1162, D-1163).
import { isClaws } from "../rules/unarmed.mjs";
import { freeOffHand } from "../rules/initiative.mjs";
import { CLAWS_EQUIP_OPTION } from "../rules/claws.mjs";
// Whether the character is out of sight, for the Combat tab's chip (D-717).
import { isHidden } from "../effects/stealth.mjs";
import { POINTS_AVAILABLE, buildTree, canTake, canTakeRacial, canUntake, canUntakeRacial, racialPicksFor, pointsSpent, talentPointsFor, tileState } from "../rules/talents.mjs";
// Where a Legacy branch sits on its class's frame (04 §1, D-781).
import { branchRank } from "../rules/legacy-branches.mjs";
// The class's crest behind its tree, or null where there is no file (D-758).
import { crestPath } from "../rules/crests.mjs";
import { tierForLevel, featuresUnlocked, secondaryLevel, secondaryTier } from "../rules/progression.mjs";
import { spellPrice, showsSpells, spellsKnown, spellPayment } from "../rules/casting.mjs";
// What counts toward spells known (07 §5; the lead's "If a talent gives a spell, it should not coutn
// towards their spells known", D-1862).
import { countsTowardKnown } from "../rules/spell-access.mjs";
// The Spells tab's words for a Vitae price that takes Health (02 §7; the San'layn and Sovereign plan's V4).
import { VITAE_WARNING_WORDS, vitaeWarning } from "../rules/vitae.mjs";
import { onUseOf, talentEffect } from "../rules/talent-effects.mjs";
// A Use whose first choice is free is pressed with its use spent (the B3 review).
import { usesAskedLater } from "../rules/legacy-uses.mjs";
import { hasUse } from "../rules/consumables.mjs";
import { coatingName } from "../rules/consumables.mjs";
import { containerOf, hasCharges, isContainer, isWorn } from "../rules/containers.mjs";
import { canCarry, heldAugment } from "../rules/augments.mjs";
import { SAND } from "../rules/sand.mjs";
import { FIGURE_HANDS, FIGURE_LEFT, FIGURE_RIGHT, copyLabels, displacedBy, figureSlots, fitsSlot, handFor, twoHandedNote } from "../rules/worn.mjs";
import { BASE_SLOTS, MAX_CONTAINERS, REFUSALS, areTwins, arrange, isMount, isThing, judgeMerge, judgePlace, judgeSplit, judgeSwap, ledger, placeOf, slotLine, slotsIn, stackKey, unitsOf, wearNew, wellsOf } from "../rules/slots.mjs";
// The Gear tab as bag slots (D-738): the panels, the order and the tooltip.
import { BLURB_KINDS, TILE_KINDS, TILE_PLACES, badgeOf, buildPanels, gridStep, kindOf, nextSort, primaryAction, slotOrder, tidyBags, tipModel } from "../rules/bags.mjs";
// A find still under offer is taken from the loot window, never dragged
// (D-721). The sheet asks the document's own question before it writes.
import { underOffer } from "../rules/loot-offer.mjs";
// And a Gadgets-compendium entry is never a sheet's (the lead, 2026-10-24): the
// same question, asked the same way, before any drop zone writes.
import { isGadgetEntry } from "../rules/gadgets.mjs";
import { isServiceEntry } from "../rules/services.mjs";
// The derived bag-slot line, composed once and drawn on the tooltip, the
// inspector and the item sheet alike (D-677: the words arrive in a bag).
import { derivedValue } from "./item-fields.mjs";
// The Gear tab's rows, shared with the creature's tab (the lead's N3).
import { carriedRows, describeRows } from "./carried.mjs";
import { WORN_SCALARS } from "../rules/grants.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
// 08 §4: an unidentified item's spells are locked (D-1435), and every builder below names a thing
// the viewer is kept from by its kind (`shownName`) and draws none of its numbers.
import { arrivalFlag, isUnidentified } from "../rules/identify.mjs";
import { hiddenToViewer, shownGrants, shownName, shownRefusalData, shownSourceName } from "../helpers/identify-words.mjs";
import { isScroll, writtenDC } from "../rules/scrolls.mjs";
import { fittingBundles, selectAmmunition, shotDamage } from "../rules/ammunition.mjs";
import { calledShotCost } from "../rules/modifiers.mjs";
import { AzerothCharacterCreator } from "./creator.mjs";
import { isAntivenom } from "../rules/antivenom.mjs";
import { endAffliction } from "../effects/afflictions.mjs";
import { handLay } from "../effects/bare-afflictions.mjs";
import { bareKind } from "../rules/bare-afflictions.mjs";
import { coins } from "../helpers/coins.mjs";
// The Profession tab (D11 §12; D-1903 to D-1930): the laws it reads, the doors it presses, and
// its pure view model (`rules/profession-sheet.mjs`).
import {
  PROFESSION_BY_ID, PROFESSION_OWED_FLAG, SKILLS_AT_TIER_FOUR, bonusParts, owedPicks, pickRefusal, professionSkills as professionSkillSet,
  rungFor, toolBonus, toolPrice
} from "../rules/professions.mjs";
import {
  RARITY_CEILING, affixChoices, craftsOf, enchantChoices, enchantVerdict, forgeable, isClassicFind, raritiesFor, recipesFor, traitEntry
} from "../rules/recipes.mjs";
import { TARGET_SL, collectable, testRefusal } from "../rules/crafting.mjs";
import { DISENCHANT_YIELD, GATHER_SKILL, HARVEST } from "../rules/gathering.mjs";
import { BIOME_KEYS, nodesIn } from "../rules/biomes.mjs";
import { gatherInputs, materialCounts } from "../rules/profession-door.mjs";
import { isWellFed } from "../rules/well-fed.mjs";
import { affixCost } from "../rules/forge.mjs";
// A Cut offered to a suit with none, where no Prefix row is drawn (D-2009).
import { cutChoices, ownCuts, prefixRowDrawn } from "../rules/craft-cuts.mjs";
// A Signature row's words clipped on its option, the browser's own clip (D-1990).
import { clip } from "./browser-categories.mjs";
import { professionRankCost } from "../rules/xp.mjs";
import {
  BIOME_FLAG, OPEN_FLAG, VIEW_FLAG, affixChipName, harvestRows, pressGuard, signatureRowOf, signatureRows, disenchantChoices, expectedFor, expectedView, filterRecipes, filtersActive, heldSkillCount,
  kindOptions, ladderRows, mergedPicks, openGroups, pickStrips, projectFill, projectSplit, rankView, recipeCard,
  signedText, skillTierRows, statParts, stepChips, tierOptions, toggleDraft, traitTokens, viewOf, withAllOpen, withGroupOpen
} from "../rules/profession-sheet.mjs";
import {
  abandonProject, chooseProfession, collectProject, craft, craftSnapshot, disenchant, enchant, gather, gatherSnapshot, harvest,
  harvestSnapshotOf, pickProfessionSkill, professionAffixPool, professionMaterials, projectsOf, raiseProfessionRank, refusalWords,
  workProject, xpWrite
} from "../dice/profession-workflows.mjs";
import { downtimeState, shouldPrompt } from "../settings.mjs";
// 05's temporary Health on the banner (D-777).
import { temporaryHealthContext } from "../effects/temporary-health.mjs";
// The pool a talent pays a spell from (the Chromatic Champion's branch spells, in Rage).
import { spellPoolFor } from "../rules/class-talents.mjs";
// The Death Knight's rune panel (D-919; D11 §4; run F2): the context is pure, the doors
// are `effects/death-knight.mjs`'s.
import { handSockets, runePanelContext, runePoolSegments } from "../rules/rune-panel.mjs";
// The Necromancer's horde panel (D11 §2; the plan's door 14): the pure context and the doors it presses.
import { hordePanelContext } from "../rules/horde-panel.mjs";
import { HORDE_LEAD_FLAG } from "../rules/horde.mjs";
import { capacityOf, collapseHordeMember, enslavedOf, essenceOf, hordeActorsOf, leadOf, nameLead } from "../effects/necromancer-horde.mjs";
import { RUNES, RUNIC_POWER, poolLabelKey, spendRefusal as runeSpendRefusal } from "../rules/runes.mjs";
import { inscriptionRefusalFor, spendRuneBare, useInscription } from "../effects/death-knight.mjs";
import { spectralMove } from "../effects/mount-works.mjs";
// 02 §7's *Latched*: the latch a Sovereign holds, read for the Combat tab's Let go (the review's S7).
import { latchesOn } from "../rules/latch.mjs";

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

/* -------------------------------------------- */
/*  What the Profession tab loads once           */
/* -------------------------------------------- */

/** The three packs a recipe lives in (D-1918). */
const RECIPE_PACKS = Object.freeze(["azeroth-rpg.weapons", "azeroth-rpg.armor", "azeroth-rpg.gear"]);

/** A profession's recipes as plain data, by profession key, loaded once and forgotten on a pack edit. */
const RECIPE_CACHE = new Map();

let professionCachesHooked = false;

/**
 * **THE SHEET'S PACK CACHES FOLLOW THE PACKS** (the architect's phase 4 review, MINOR 10): any
 * create, update or delete of an Item in one of the recipe packs or the trait pack forgets what
 * it fed, on the same hooks the doors' own caches use (`profession-workflows.mjs#hookCaches`), and
 * the next read loads it again.
 */
function hookProfessionCaches() {
  if (professionCachesHooked || typeof Hooks === "undefined") return;
  professionCachesHooked = true;
  const forget = doc => {
    const pack = doc?.pack ?? null;
    if (!pack) return;
    if (RECIPE_PACKS.includes(pack)) { RECIPE_CACHE.clear(); DESCRIPTION_CACHE.clear(); }
    if (pack === "azeroth-rpg.traits") TRAIT_CACHE = null;
  };
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, forget);
}

/** A cached promise that is FORGOTTEN where it rejects, so one failed first load is never kept for the session. */
function keepIfLoaded(promise, forget) {
  promise.catch(() => forget());
  return promise;
}

/**
 * **EVERY RECIPE ONE PROFESSION MAKES**, as plain data `{uuid, id, name, type, img, system, flags}`
 * (the shape `recipes.mjs` and `workflows.craftSnapshot` read): the three packs' indexes read for
 * the `craft` stamp, never a Classic find (D-685), and only those documents loaded whole. Every
 * tier is loaded; `recipesFor` keeps what the character's tier opens (D-1927).
 */
function professionRecipes(profession) {
  hookProfessionCaches();
  if (!profession) return Promise.resolve([]);
  if (!RECIPE_CACHE.has(profession)) RECIPE_CACHE.set(profession, keepIfLoaded((async () => {
    const out = [];
    for (const id of RECIPE_PACKS) {
      const pack = game.packs.get(id);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["system.craft", "system.source", "flags.azeroth-rpg.classic"] });
      const ids = [...index].filter(e => !isClassicFind(e) && craftsOf({ type: e.type, system: e.system }).some(s => s.trade === profession)).map(e => e._id);
      if (!ids.length) continue;
      for (const doc of await pack.getDocuments({ _id__in: ids })) {
        const data = doc.toObject();
        out.push({ uuid: doc.uuid, id: doc.id, name: data.name, type: data.type, img: data.img, system: data.system, flags: data.flags ?? {} });
      }
    }
    return out.sort((a, b) => a.uuid.localeCompare(b.uuid));
  })(), () => RECIPE_CACHE.delete(profession)));
  return RECIPE_CACHE.get(profession);
}

let TRAIT_CACHE = null;

/**
 * The trait pack's entries `{name, system}`, loaded once: every trait chip's tooltip (D-1928). Each
 * entry's prose is ENRICHED here (`helpers/enrich.mjs`, D-609), so a tooltip never prints a raw
 * `@UUID[...]`.
 */
function professionTraits() {
  hookProfessionCaches();
  TRAIT_CACHE ??= keepIfLoaded((async () => {
    const pack = game.packs.get("azeroth-rpg.traits");
    const docs = pack ? await pack.getDocuments() : [];
    const out = [];
    for (const d of docs) {
      const system = d.system.toObject();
      system.description = await enrich(system.description ?? "");
      out.push({ name: d.name, system });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  })(), () => { TRAIT_CACHE = null; });
  return TRAIT_CACHE;
}

/**
 * The affix pool's prefixes and suffixes, read through THE DOORS' OWN READER
 * (`workflows.professionAffixPool`), so the options the sheet lists and the verdict the door gives
 * read one pool, forgotten on a pack edit by the door's hooks. Sorted for the reader.
 */
async function professionAffixes() {
  const pool = await professionAffixPool();
  return [...pool].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.id).localeCompare(String(b.id)));
}

/** A recipe's prose, enriched once (`helpers/enrich.mjs`): a pack document does not change in a session. */
const DESCRIPTION_CACHE = new Map();
async function professionDescription(item) {
  if (!DESCRIPTION_CACHE.has(item.uuid)) DESCRIPTION_CACHE.set(item.uuid, await enrich(item.system?.description ?? ""));
  return DESCRIPTION_CACHE.get(item.uuid);
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
  static #onReviewChainLightningCast() { return reviewChainLightningCast(this.actor); }
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
      reviewChainLightningCast: AzerothCharacterSheet.#onReviewChainLightningCast,
      configureCombatSheet: AzerothCharacterSheet.#onConfigureCombatSheet,
      rollSkill: AzerothCharacterSheet.#onRollSkill,
      // The rune panel's two controls (D-919; run F2).
      inscribeRunes: AzerothCharacterSheet.#onInscribeRunes,
      dismissRaised: AzerothCharacterSheet.#onDismissRaised,
      makeHordeLead: AzerothCharacterSheet.#onMakeHordeLead,
      spendRune: AzerothCharacterSheet.#onSpendRune,
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
      mindControlSaves: AzerothCharacterSheet.#onEffectAction,
      dominationOrder: AzerothCharacterSheet.#onEffectAction,
      enslaveMinute: AzerothCharacterSheet.#onEffectAction,
      enslaveClockReview: AzerothCharacterSheet.#onEffectAction,
      mindSootheHarm: AzerothCharacterSheet.#onEffectAction,
      reviewDispersionAftermath: AzerothCharacterSheet.#onEffectAction,
      reviewAntivenom: AzerothCharacterSheet.#onEffectAction,
      reviewConsumable: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureUses: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureParry: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureHit: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureHealing: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureDamage: AzerothCharacterSheet.#onEffectAction,
      reviewSignatureKills: AzerothCharacterSheet.#onEffectAction,
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
      // 02 §7's Sovereign: Hunt Mortal's mark on the creature targeted, its Clear, and The Blood
      // Royal's feeding (the San'layn and Sovereign plan's C4, F2).
      markPrey: AzerothCharacterSheet.#onMarkPrey,
      clearPrey: AzerothCharacterSheet.#onClearPrey,
      feed: AzerothCharacterSheet.#onFeed,
      // 02 §7's Spectral Sight and 07's Flame Crash (the Demon Hunter review's S1 and C4).
      senseDemons: AzerothCharacterSheet.#onSenseDemons,
      pickUpGlaive: AzerothCharacterSheet.#onPickUpGlaive,
      drinkVial: AzerothCharacterSheet.#onDrinkVial,
      // 02 §7's *or when you let go*: every latch the Sovereign holds ended (the review's S7).
      letGo: AzerothCharacterSheet.#onLetGo,
      // Leave the shape (D-769): the banner's Leave and the Combat chip's x.
      leaveShape: AzerothCharacterSheet.#onLeaveShape,
      // A rider paid before the blow (D-770; the lead: *"Either order"*).
      primeRider: AzerothCharacterSheet.#onPrimeRider,
      toggleFavorite: AzerothCharacterSheet.#onToggleFavorite,
      // The Afflictions panel on the Corruption tab (D12, Phase 7).
      toggleAffliction: AzerothCharacterSheet.#onToggleAffliction,
      medicineTest: AzerothCharacterSheet.#onMedicineTest,
      useAntivenom: AzerothCharacterSheet.#onUseAntivenom,
      useRemedy: AzerothCharacterSheet.#onUseRemedy,
      endAffliction: AzerothCharacterSheet.#onEndAffliction,
      addAffliction: AzerothCharacterSheet.#onAddAffliction,
      exposeAffliction: AzerothCharacterSheet.#onExposeAffliction,
      calledShot: AzerothCharacterSheet.#onCalledShot,
      openCreator: AzerothCharacterSheet.#onOpenCreator,
      // The Overview tab's centre image (D-700). `editImage` on the banner is
      // core's own and is registered by `DocumentSheetV2`; these two are ours
      // because `system.art` is ours.
      editArt: AzerothCharacterSheet.#onEditArt,
      viewArt: AzerothCharacterSheet.#onViewArt,
      // The Profession tab (D11 §12; D-1903 to D-1930). The Forge's selects, the filters, the
      // biome, the node and the item to disenchant are `data-prof-*` change hooks, never actions.
      professionView: AzerothCharacterSheet.#onProfessionView,
      chooseProfession: AzerothCharacterSheet.#onChooseProfession,
      pickProfessionSkill: AzerothCharacterSheet.#onPickProfessionSkill,
      confirmProfessionPicks: AzerothCharacterSheet.#onConfirmProfessionPicks,
      raiseProfessionRank: AzerothCharacterSheet.#onRaiseProfessionRank,
      gather: AzerothCharacterSheet.#onGather,
      professionDisenchant: AzerothCharacterSheet.#onProfessionDisenchant,
      inspectRecipe: AzerothCharacterSheet.#onInspectRecipe,
      craftRecipe: AzerothCharacterSheet.#onCraftRecipe,
      workProject: AzerothCharacterSheet.#onWorkProject,
      collectProject: AzerothCharacterSheet.#onCollectProject,
      abandonProject: AzerothCharacterSheet.#onAbandonProject,
      openAllRecipes: AzerothCharacterSheet.#onOpenAllRecipes,
      closeAllRecipes: AzerothCharacterSheet.#onCloseAllRecipes,
      clearRecipeFilters: AzerothCharacterSheet.#onClearRecipeFilters,
      layEnchantment: AzerothCharacterSheet.#onLayEnchantment,
      // Skin, Butcher or Salvage a targeted defeated creature from the Harvest card (D-1996).
      harvestTarget: AzerothCharacterSheet.#onHarvestTarget
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
    // The eighth tab, wide, between Gear and Progress (D-1910, D11 §12).
    profession: { template: "systems/azeroth-rpg/templates/actor/profession.hbs", scrollable: [""] },
    progress: { template: "systems/azeroth-rpg/templates/actor/progress.hbs", scrollable: [""] },
    corruption: { template: "systems/azeroth-rpg/templates/actor/corruption.hbs", scrollable: [""] }
  };

  /**
   * The eight tabs of D11 §1 and §12: Overview first (D-687), Spells after
   * Combat (D-599), Profession between Gear and Progress (D-1910).
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
        { id: "profession" },
        { id: "progress" },
        { id: "corruption" }
      ]
    }
  };

  /** Overview, Gear, Profession, Progress and Spells span the Skills column (D11 §1, §12; D-599, D-687, D-1910). */
  static WIDE_TABS = Object.freeze(["overview", "gear", "profession", "progress", "spells"]);

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
    // The factions the character belongs to (D-912): the GM sets more; everybody reads the list.
    context.factionEdit = game.user.isGM && this.isEditable;
    context.factionList = (this.actor.signatureState?.factions ?? []).join(", ");
    context.canConfigureCombatSheet = game.user.isGM;
    context.showManeuvers = showsManeuvers(system, this.actor.getFlag("azeroth-rpg", "showManeuvers"));
    context.combatSections = Object.fromEntries(["maneuvers", "features", "talents", "runes", "horde", "signatures"].map(key =>
      [key, game.user.getFlag("azeroth-rpg", `combatSections.${key}`) !== false]));
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
      // A shape somebody else laid takes no score (D-808): nothing is marked.
      // A drake form overrides no score (the lead: *"Allow the player stats to remain"*),
      // so its overlay kind marks no plate and locks none.
      const formed = Boolean(context.shape) && !context.shape.forced
        && !isOverlayKind(this.actor.shape?.kind) && SHAPE_ABILITIES.includes(key);
      return {
      key,
      label: AZEROTH.abilities[key],
      value: ability.value,
      mod: ability.mod,
      // Both numbers the score gives, on the chip's hover (05 §1, D-810): the
      // chip is the ability modifier, and a Skill Test adds the skill modifier.
      modTip: game.i18n.format("AZEROTH.Sheet.ModifiersTip", {
        ability: signedModifier(ability.mod), skill: signedModifier(ability.skillMod)
      }),
      // What is worn adds to the score (08 §6, 2026-09-06): the total on a
      // chip when it differs from the stored score.
      bonus: ability.bonus ?? 0,
      total: ability.total ?? ability.value,
      // The plate shows the score as worn and says how it got there on hover
      // (the lead, 2026-09-06): `15 + 1 · Longsword of the Bear`.
      formula: ability.bonus
        ? `${ability.value} ${(ability.sources ?? []).map(src => `${src.points < 0 ? "−" : "+"} ${Math.abs(src.points)} · ${shownSourceName(src)}`).join(" ")}`
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
    context.canReviewChainCast = game.user.isGM && this.actor.getFlag("azeroth-rpg", "chainLightningCast")?.stage === "pending";
    // The three images (D-700), resolved once for the banner and the Overview
    // tab rather than bound field-by-field in two templates.
    context.portrait = this.#portraits();
    context.corruption = this.#corruptionTracks();
    context.sustaining = this.actor.getFlag("azeroth-rpg", "sustaining") ?? [];
    context.spells = this.#spells();
    context.spells.fromItems = this.#itemSpells();
    context.effects = effectsContext(this.actor);
    // Poisons and diseases carried until cured (D12): the Corruption tab's panel.
    context.afflictions = afflictionsContext(this.actor);
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
    // The rune panel (D-919): a Death Knight's alone, built before the Overview, whose
    // hand tiles draw the same sockets.
    context.runePanel = this.#runePanel();
    // The horde panel (D11 §2): a Necromancer's alone - a character holding the Essence pool.
    context.hordePanel = this.#hordePanel();
    // The Demon Hunter's Hatred in words, for the Overview's Stats pane and the Corruption tab (D-1581).
    context.hatred = this.#hatredPanel();
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
    for (const row of context.signatures) row.trainingTip = this.#trainingTip(this.actor.items.get(row.id));
    // The Overview tab's figure and its In force column (D-687). Assembled
    // after `load`, because the carry line is the same object the Gear tab's
    // head line reads and there is one of it — and after `effects`, because
    // the strip under the hands row is a READING of the very object Core's
    // conditions grid and effect list are drawn from (2026-09-20), so the two
    // tabs cannot disagree about what is standing.
    context.overview = await this.#overview(context.load, context.signatures, context.effects, context.shape);
    // The paper doll's compact row under each hand that holds runes (D11 §4).
    if (context.runePanel) {
      for (const tile of context.overview?.hands ?? []) {
        const hand = tile.slot === "mainHand" ? "main" : tile.slot === "offHand" ? "off" : null;
        tile.runes = hand ? handSockets(context.runePanel, hand) : null;
      }
    }
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
      // 02 §7's Sovereign (the San'layn and Sovereign plan's C4; D11): the prey row - the prey named in
      // words, Hunt Mortal's Mark and its Clear, The Blood Royal's Feed - and the Vitae and Tribute bars
      // through Core's own pool rows.
      sovereign: this.#sovereignCombat(),
      // 02 §7's Demon Hunter (the review's S1 and C4): Spectral Sight's Sense demons, and a Pick up for each glaive
      // Flame Crash left lying on the board.
      demonHunter: this.#demonHunterCombat(),
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

    // The identity line: race and the classes held, the second with the level
    // it functions at (02 §10). A class that is linked but never named on the
    // sheet looked to the lead like a class that had not been added.
    const classItems = this.actor.classItems ?? [];
    // A guise (the Chromatic Champion plan): *"Chromatic Outcast, in the guise of a
    // Dwarf"*, the race the character IS and the people it looks like.
    const line = raceLine({ race: this.actor.raceItem, guise: system.guise });
    context.identity = {
      race: line.race && line.guise ? game.i18n.format("AZEROTH.Guise.Line", line) : line.race,
      classes: classItems.map((item, index) => ({
        id: item.id,
        name: item.name,
        secondary: index > 0,
        level: index === 0 ? system.level : secondaryLevel(system.level)
      }))
    };
    // The profession on the banner (the plan's M1, D-1912): *Journeyman Blacksmith*, or the door
    // to choose one where none is held - owed by migration 0.17.0 (D-1916), or simply never chosen
    // on a character that has a class.
    const professionItem = this.actor.professionItem;
    context.professionLine = professionItem ? this.#professionLine(professionItem) : null;
    context.canChooseProfession = this.isEditable && !professionItem
      && (this.actor.getFlag("azeroth-rpg", PROFESSION_OWED_FLAG) !== undefined || classItems.length > 0);
    // The level is set on the Progress tab once there is a class to carry it.
    context.levelEditable = this.isEditable && classItems.length > 0;
    // A blank sheet offers the creator (D-636): the player's door.
    context.canBuild = this.isEditable && AzerothCharacterCreator.canBuild(this.actor);
    // The tongues spoken and the purse, stored since 0.10.0 (D-636).
    const {borrowedLanguages} = await import("../rules/thematic-utility.mjs");
    context.languages = borrowedLanguages(system.languages ?? [], [...this.actor.effects], game.time.worldTime)
      .map(key => game.i18n.localize(AZEROTH.languages[key] ?? key));
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
    for (const section of this.element.querySelectorAll("details[data-combat-section]")) {
      if (section.dataset.collapseBound) continue;
      section.dataset.collapseBound = "1";
      section.addEventListener("toggle", () => {
        const key = `combatSections.${section.dataset.combatSection}`;
        if ((game.user.getFlag("azeroth-rpg", key) !== false) === section.open) return;
        void game.user.setFlag("azeroth-rpg", key, section.open);
      });
    }
    // A group of the Afflictions panel remembers its open state per viewer, as
    // the Combat tab's sections do. A `toggle` event, never a click action.
    for (const group of this.element.querySelectorAll("details[data-affliction-group]")) {
      if (group.dataset.collapseBound) continue;
      group.dataset.collapseBound = "1";
      group.addEventListener("toggle", () => {
        const key = AFFLICTION_OPEN_GROUP(group.dataset.afflictionGroup);
        if ((game.user.getFlag("azeroth-rpg", key) !== false) === group.open) return;
        void rememberAfflictionOpen(key, group.open);
      });
    }
    // Core replaces the parts it rendered and leaves the rest standing, so a
    // Spells part rendered while the sheet had a spell outlives the tab that
    // named it (D-639). Take it down with the tab.
    if (!this.#showsSpells()) {
      for (const stale of this.element.querySelectorAll('[data-application-part="spells"], section[data-tab="spells"]')) stale.remove();
    }
    // **A PART PREPARED ON ONE TAB CAN LAND ON ANOTHER** (found live by the sheet matrix, 0.17.0).
    // The Profession part's deferred render (D-1982) is prepared while its tab shows and, at tier 4,
    // lands after the reader has already moved on: core writes the `active` it prepared, so two
    // primary tabs stood laid out at once and the context's `wide` was the old tab's. Every primary
    // tab takes `active` from the tab showing NOW, and the layout with it.
    const showing = this.tabGroups.primary;
    for (const section of this.element.querySelectorAll('section.tab[data-group="primary"][data-tab]')) {
      section.classList.toggle("active", section.dataset.tab === showing);
    }
    this.#applyWideLayout(showing ? AzerothCharacterSheet.WIDE_TABS.includes(showing) : context.wide === true);
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
    // The Profession tab's change hooks, trait chips and recipe groups (D11 §12), delegated once
    // per frame as the bags are, and the picked recipe's card shown again after a render.
    this.#bindProfession();
    bindKeyActivation(this.element, '.azeroth-prof-row[data-action]');
    this.#applyRecipe();
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
    // **A SPELL LEARNED AFTER CREATION IS JUDGED BY 07 §4 AND §9** (the Necromancer plan's learning
    // door; the lead: *"fix this"*, and on tier 5: *"Yes the tier 5 spells learned via tomes should be
    // learnable by the GM manually to the character"*): a spell dragged in from outside - the sidebar,
    // a compendium, the browser - is refused in words for a player, with nothing written, where no
    // class the character holds learns it, its prerequisite is not known or bars it, it is tier 5 and
    // no tier 3 spell is known, or it is tier 5 at all (`AzerothActor#learnVerdict`). A GM is asked
    // whether to TEACH IT ANYWAY, and a yes writes it past every gate with the bypass; the document's
    // own seam (`AzerothItem._preCreateOperation`) judges every other write.
    if (item?.type === "spell" && this.actor.uuid !== item.parent?.uuid) {
      const data = item.toObject?.() ?? item;
      const verdict = this.actor.learnVerdict?.(data) ?? { act: "allow" };
      if (verdict.act === "refuse") {
        ui.notifications?.warn(verdict.text);
        return null;
      }
      if (verdict.act === "confirm") {
        const yes = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("AZEROTH.Spell.Teach.Title") },
          content: `<p>${verdict.text}</p><p>${game.i18n.format("AZEROTH.Spell.Teach.Ask", { name: this.actor.name, spell: data.name ?? "" })}</p>`,
          yes: { label: game.i18n.localize("AZEROTH.Spell.Teach.Yes") },
          no: { label: game.i18n.localize("AZEROTH.Spell.Teach.No") },
          rejectClose: false
        });
        if (!yes) return null;
        // A taught spell names no item that teaches it: a foreign `spellFrom` would let a sync withdraw it.
        if (verdict.strip) foundry.utils.setProperty(data, "flags.azeroth-rpg.spellFrom", null);
        const [taught] = await this.actor.createEmbeddedDocuments("Item", [data], { azerothLearn: "bypass" });
        if (taught) ui.notifications?.info(game.i18n.format("AZEROTH.Spell.Teach.Done", { name: this.actor.name, spell: data.name ?? "" }));
        return taught ?? null;
      }
    }
    // **A GADGETS-COMPENDIUM ENTRY GOES STRAIGHT TO THE CREATE** (the lead, 2026-10-24),
    // whose veto refuses it in words (`AzerothItem#_preCreate`): no zone below may put
    // anything away for it first (D-745's order), or answer with a refusal of its own - a
    // feature dropped on the figure is *not worn* and on a slot *does not fit* before the
    // create says why again.
    if (isGadgetEntry(item) && this.actor.uuid !== item.parent?.uuid) return super._onDropItem(event, item);
    // A Services-compendium entry the same way: a bag well or a slot must not answer for a
    // night's lodging before the create refuses it in its own words (`rules/services.mjs`).
    if (isServiceEntry(item) && this.actor.uuid !== item.parent?.uuid) return super._onDropItem(event, item);
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
    // **08 §4: THE NEWCOMER IS JUDGED AS IT WILL ARRIVE, so it never merges into a known twin**
    // (the Phase 3 review, M1). A merge creates nothing, so the create seam's stamp never sees it,
    // and `stackKey` reads an absent flag as known: an Uncommon+ find dropped on an identified twin
    // was poured into it and laundered. Writing the arrival flag first makes the two differ.
    const arrival = arrivalFlag({ type: data.type, rarity: data.system?.rarity, flags: data.flags }, this.actor.type, {});
    if (arrival !== null) foundry.utils.setProperty(data, "flags.azeroth-rpg.unidentified", arrival);
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
          ui.notifications?.info(game.i18n.format("AZEROTH.Bags.Merged", { name: shownName(twin), n: verdict.quantity }));
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.MountNotCarried", { name: shownName(target) }));
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
        ui.notifications?.warn(game.i18n.format("AZEROTH.Container.Refused", { name: shownName(target), container: bag ? shownName(bag) : "" }));
        return null;
      }
      // `containersFor` already says a thing ALREADY in the bag is legal
      // however full it reads (D-737), so a move between two wells passes.
      if (!legal.ok) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Container.NoRoom", { name: shownName(target), container: shownName(bag) }));
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
        ui.notifications?.warn(game.i18n.format(verdict.reason, shownRefusalData(this.actor, verdict.data ?? {})));
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
      ui.notifications?.warn(game.i18n.format(verdict.reason, shownRefusalData(this.actor, verdict.data ?? {})));
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
      ui.notifications?.warn(game.i18n.format(verdict.reason, shownRefusalData(this.actor, verdict.data ?? {})));
      return null;
    }
    await this.actor.updateEmbeddedDocuments("Item",
      [{ _id: into.id, "system.quantity": verdict.quantity }], { azerothBags: "bypass" });
    await this.actor.deleteEmbeddedDocuments("Item", [from.id], { azerothBags: "bypass" });
    ui.notifications?.info(game.i18n.format("AZEROTH.Bags.Merged", { name: shownName(into), n: verdict.quantity }));
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotMount", { name: item ? shownName(item) : "" }));
      return null;
    }
    if ((item.system?.equipped === true) === with_) return null;
    // **08 §5's SPECTRAL** (02 §7's Deathcharger; door 9): dismissing a spectral steed into the
    // runeweapon or calling it beside the rider is a Half-Action in a started fight, spent
    // before it moves (`effects/mount-works.mjs#spectralMove`); a refused budget moves nothing.
    if (!(await spectralMove(this.actor, item))) return null;
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotWorn", { name: item ? shownName(item) : "" }));
      return null;
    }
    if (item.system?.equipped === true) return null;
    // 08 §9 locks an Augment to its class, and every door refuses it here
    // rather than letting a caster cast through it silently.
    const augment = item.system?.augment ?? null;
    if (augment && !canCarry(augment.category, this.actor.classNames ?? [])) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Augment.NotYours", { name: shownName(item), className: augment.className }));
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
        return game.i18n.format("AZEROTH.Overview.DropRefused", { name: shownName(item), slot: label });
      }
      // The barred Off hand (D-689). The tile carries no action and no drop may
      // reach it; this says which weapon is holding it shut.
      const barred = this.#barredMainHand(slot);
      if (barred) return game.i18n.format("AZEROTH.Overview.DropBarred", { name: shownName(item), main: shownName(barred) });
      // 08 §9 locks an Augment to its class, and the Equip button refuses it at
      // this same door rather than letting a caster cast through it silently.
      const augment = item.system?.augment ?? null;
      if (augment && !canCarry(augment.category, this.actor.classNames ?? [])) {
        return game.i18n.format("AZEROTH.Augment.NotYours", { name: shownName(item), className: augment.className });
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.Bags.Refused.NotWorn", { name: item ? shownName(item) : "" }));
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
      ui.notifications?.warn(game.i18n.format("AZEROTH.Augment.NotYours", { name: shownName(item), className: augment.className }));
      return null;
    }
    const hand = item.type === "weapon" ? (slot ?? handFor(item, this.actor.items)) : slot;
    if (hand === "offHand") {
      const barred = this.#barredMainHand("offHand");
      if (barred) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Overview.DropBarred", { name: shownName(item), main: shownName(barred) }));
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
        ui.notifications?.warn(game.i18n.format(refusal.reason, shownRefusalData(this.actor, refusal.data ?? {})));
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
      ui.notifications?.warn(game.i18n.format(verdict.reason, shownRefusalData(this.actor, verdict.data ?? {})));
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
    // The claws are the off hand's whatever tile is named (02 §7; D-1163).
    if (item.type === "weapon") update["system.offHand"] = isClaws(item) || slot === "offHand";
    // `hand`: the tile a weapon is put in, so the claws and an off-hand weapon put each
    // other away by the hand it is going to (`worn.mjs#displacedBy`).
    const hand = item.type === "weapon" ? (isClaws(item) ? "offHand" : slot) : null;
    const updates = [
      update,
      ...displacedBy(item, this.actor.items, { index, hand }).map(o => ({ _id: o.id, "system.equipped": false }))
    ];
    // The claws coming out play a brief cue at the Sovereign's token (D-1168).
    const token = isClaws(item) ? (this.actor.getActiveTokens?.(true, true)?.[0] ?? null) : null;
    const cue = token?.parent?.id ? { [CLAWS_EQUIP_OPTION]: { sceneId: token.parent.id, tokenId: token.id } } : {};
    return this.actor.updateEmbeddedDocuments("Item", updates, cue);
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

  /**
   * **A POISONED OR DISEASED DROPPED FROM THE CONDITIONS PACK IS NAMED** (D12 R1): a bare status
   * has no clock and no cure, so the drop opens the Add picker instead of embedding it.
   * @inheritDoc
   */
  async _onDropActiveEffect(event, effect) {
    const kind = bareKind([...(effect.statuses ?? [])], effect.flags?.["azeroth-rpg"] ?? {});
    if (kind && this.document.isOwner && this.isEditable) return (await handLay(this.document, kind)) ?? null;
    return super._onDropActiveEffect(event, effect);
  }

  /** @inheritDoc */
  async _onDrop(event) {
    this.#litZone?.classList.remove("azeroth-drop-into");
    this.#litZone = null;
    return super._onDrop(event);
  }

  /** The prose under a row, enriched once per item however many lists carry it. */
  async #describeRows(rows) {
    for (const row of rows) row.trainingTip = this.#trainingTip(this.actor.items.get(row.id));
    return describeRows(this.actor, rows);
  }

  #trainingTip(item) {
    const warning = trainingWarning(item, actorTraining(this.actor));
    return warning ? game.i18n.localize(`AZEROTH.Training.${warning}`) : null;
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
    // The Profession part was drawn deferred while another tab showed (D-1982): draw it now.
    if (tab === "profession" && this.element?.querySelector('section[data-tab="profession"][data-deferred]')) {
      this.#professionRender = this.render({ parts: ["profession"] });
    }
  }

  /**
   * **THE PROFESSION TAB, SHOWN AND DRAWN** (D-1982): the tab changed to, the view set where one
   * is named, and the part rendered whole. Resolves once the part is in the DOM, so a live test
   * (and the shots) can await it instead of polling for `data-deferred` to go.
   *
   * @param {{view?: "overview"|"crafting"}} [o]
   */
  async showProfession({ view = null } = {}) {
    if (view) await this.#setProfessionView(view, { render: false });
    if (this.tabGroups.primary !== "profession") this.changeTab("profession", "primary");
    await (this.#professionRender ?? Promise.resolve());
    if (this.element?.querySelector('section[data-tab="profession"][data-deferred]') || view) await this.render({ parts: ["profession"] });
    return this.element?.querySelector('section[data-tab="profession"]') ?? null;
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
    // **THE PROFESSION TAB IS BUILT WHOLE ONLY WHILE IT SHOWS** (D-1982): a card is prerendered
    // for every recipe the profession may make, and an actor's every write re-renders the sheet,
    // so while another tab is open the part is drawn deferred (its header alone) and `changeTab`
    // renders it when the reader comes to it.
    if (partId === "profession") part.profession = await this.#profession({ full: (this.tabGroups.primary ?? "core") === "profession" });
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
        // A Legacy branch is marked with its people, in words (04 §1, D11 §4:
        // *the frame draws it beside the other three and marks it with its
        // people*): `Blademaster (Orc)`, as 04's own heading prints it. The key
        // stays the class and the branch the talents carry.
        const legacy = item.system.legacy || "";
        byBranch.set(key, {
          key,
          className: item.system.className,
          branch: legacy
            ? game.i18n.format("AZEROTH.Talent.LegacyBranch", { branch: item.system.branch, people: legacy })
            : item.system.branch,
          branchName: item.system.branch,
          legacy,
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
    // and primary class first, rather than in whatever order the items sit; a
    // class's Legacy fourth, after its own three (04 §1, D-781).
    const classes = this.actor.classItems ?? [];
    const rank = entry => {
      const ci = classes.findIndex(c => c.name === entry.className);
      if (ci < 0) return 100;
      const own = (classes[ci].system?.branches ?? []).findIndex(b => (b?.name ?? b) === entry.branchName);
      return branchRank({ classIndex: ci, ownIndex: own, legacy: Boolean(entry.legacy) });
    };
    const branches = [...byBranch.values()]
      .sort((a, b) => (rank(a) - rank(b)) || a.key.localeCompare(b.key))
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
      const state = canTakeRacial({ ...item.system, name: item.name }, systems, level, {
        race: race.name, classes: this.actor.classItems.map(item => item.name)
      });
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
   * **THE RUNE PANEL** (D-919; D11 §4; the plan's door 1): one group a wielded weapon, a
   * socket a rune slot, the Runic Power bar, Inscribe and *Spend a rune*. Null for a
   * character who is no Death Knight. The context is `rules/rune-panel.mjs`'s, pure; the
   * words are composed here.
   */
  #runePanel() {
    const system = this.actor.system;
    if (!(system.classKeys ?? []).includes("death-knight")) return null;
    const rows = system.runes?.weapons ?? [];
    const figure = figureSlots(this.actor.items);
    const weapons = Object.fromEntries(rows.map(r => {
      const item = this.actor.items.get(r.itemId);
      const hand = figure.mainHand?.id === r.itemId ? "main" : figure.offHand?.id === r.itemId ? "off" : null;
      // The weapon's name as this viewer knows it (08 §4): an unidentified runeblade is its kind.
      return [r.itemId, { name: item ? shownName(item) : null, img: item?.img ?? null, rarity: item?.system?.rarity ?? "common", rarityClass: rarityClass(item?.system?.rarity), hand }];
    }));
    const pool = (this.actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === RUNIC_POWER) ?? null;
    const L = k => game.i18n.localize(k);
    const inscribe = inscriptionRefusalFor(this.actor);
    const spend = rows.length ? runeSpendRefusal(rows, { kind: "any", count: 1 }) : "noWeapon";
    return runePanelContext({
      rows, weapons, runicPower: pool ? { value: pool.value, max: pool.max } : null,
      inscribeRefusal: inscribe ?? (rows.length ? null : "noWeapon"), spendRefusal: spend, editable: this.isEditable,
      words: {
        blood: L("AZEROTH.Runes.Blood"), frost: L("AZEROTH.Runes.Frost"),
        spentBlood: L("AZEROTH.Runes.SpentBlood"), spentFrost: L("AZEROTH.Runes.SpentFrost"), empty: L("AZEROTH.Runes.EmptySlot"),
        meta: ({ rarity, grip, slots }) => game.i18n.format("AZEROTH.Runes.Meta", {
          rarity: L(AZEROTH.rarities[rarity] ?? rarity), grip: L(`AZEROTH.Runes.Grip.${grip}`), n: slots
        }),
        refusals: {
          fight: L("AZEROTH.Runes.Panel.Refuse.fight"), window: L("AZEROTH.Runes.Panel.Refuse.window"),
          noWeapon: L("AZEROTH.Runes.Panel.Refuse.noWeapon"), short: L("AZEROTH.Runes.Panel.Refuse.short")
        }
      }
    });
  }

  /**
   * **THE HORDE PANEL** (D11 §2; the frozen artboard; the plan's door 14): the Essence meter, the
   * places and a row for each of the raised dead. Null for a character who holds no Essence pool.
   * The context is `rules/horde-panel.mjs`'s, pure; the words are composed here.
   */
  #hordePanel() {
    const essence = essenceOf(this.actor);
    if (!essence) return null;
    const L = k => game.i18n.localize(k);
    const F = (k, d) => game.i18n.format(k, d);
    const flag = this.actor.getFlag("azeroth-rpg", HORDE_LEAD_FLAG) ?? null;
    const lead = leadOf(this.actor);
    const members = [
      ...hordeActorsOf(this.actor).map(a => {
        const bond = a.getFlag("azeroth-rpg", "bond") ?? {};
        return {
          id: a.id, name: a.name, entry: bond.entryName ?? a.name, raisedAt: Number(bond.since) || 0,
          weightClass: a.system?.weightClass ? L(AZEROTH.weightClasses?.[a.system.weightClass] ?? a.system.weightClass) : null,
          spell: bond.sourceName ?? null, health: a.system?.health?.value ?? 0, max: a.system?.health?.max ?? 0, temp: a.system?.health?.temp ?? 0,
          keepsReaction: bond.keepsReaction === true, outside: bond.outside === true, grafts: a.getFlag("azeroth-rpg", "grafts") ?? bond.grafts ?? [],
          wardSchools: a.getFlag("azeroth-rpg", "graftWard") ?? [],
          img: a.prototypeToken?.texture?.src ?? a.img ?? null
        };
      }),
      ...enslavedOf(this.actor).map(({ actor, record }) => ({
        id: actor.uuid, name: actor.name, entry: record.entry ?? actor.name, raisedAt: Number(record.since) || 0,
        weightClass: actor.system?.weightClass ? L(AZEROTH.weightClasses?.[actor.system.weightClass] ?? actor.system.weightClass) : null,
        spell: L("AZEROTH.Horde.Panel.EnslaveSpell"), health: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0, temp: actor.system?.health?.temp ?? 0,
        controlled: true, img: actor.img ?? null
      }))
    ];
    return hordePanelContext({
      essence: { value: essence.value ?? 0, max: essence.max ?? 0 }, capacity: capacityOf(this.actor), members, lead,
      pendingLead: flag?.taken === false ? flag.id : null, editable: this.isEditable,
      words: {
        held: L("AZEROTH.Horde.Panel.Held"), empty: L("AZEROTH.Horde.Panel.EmptySocket"),
        "kind.bone": L("AZEROTH.Horde.Panel.KindBone"), "kind.flesh": L("AZEROTH.Horde.Panel.KindFlesh"), "kind.other": L("AZEROTH.Horde.Panel.KindOther"),
        weight: ({ weight }) => weight, from: ({ spell }) => F("AZEROTH.Horde.Panel.From", { spell }),
        place: () => L("AZEROTH.Horde.Panel.PlaceTaken"), places: ({ n }) => F("AZEROTH.Horde.Panel.PlacesTaken", { n }),
        outside: L("AZEROTH.Horde.Panel.Outside"), controlled: L("AZEROTH.Horde.Panel.Controlled"),
        health: d => F("AZEROTH.Horde.Panel.HealthCount", d), healthTemp: d => F("AZEROTH.Horde.Panel.HealthTemp", d),
        essenceCount: d => F("AZEROTH.Horde.Panel.EssenceCap", d), placesCount: d => F("AZEROTH.Horde.Panel.PlacesUsed", d),
        skeletonPlaces: d => F("AZEROTH.Horde.Panel.SkeletonPlaces", d), overview: d => F("AZEROTH.Horde.Panel.OverviewRow", d),
        ...Object.fromEntries(["meatHook", "bonePlating", "wardedHide", "swollen", "butchersArm", "plagueBladder", "graspingArms"].map(g => [`graft.${g}`, L(`AZEROTH.Graft.${g}`)])),
        ...Object.fromEntries(Object.entries(AZEROTH.schools ?? {}).map(([k, label]) => [`school.${k}`, L(label)])),
        graftSchool: d => F("AZEROTH.Horde.Panel.GraftSchool", d)
      }
    });
  }

  /** Dismiss one of the raised dead from the panel (02 §7: *at any time, using no action*). */
  static async #onDismissRaised(event, target) {
    const id = target?.dataset?.hordeId;
    const servant = id ? game.actors.get(id) : null;
    if (servant) await collapseHordeMember(this.actor, servant, { byChoice: true, reason: "dismiss" });
  }

  /** Name a lead from the panel (02 §7: once the lead has collapsed; at a cast, through the cast's line). */
  static async #onMakeHordeLead(event, target) {
    const id = target?.dataset?.hordeId;
    if (id) await nameLead(this.actor, id, { casting: false });
  }

  /** Inscribed Runeweapon's Use from the panel (02 §7): the feature's own door. */
  static async #onInscribeRunes() {
    const feature = this.actor.items.find(i => i.type === "feature" && i.name === "Inscribed Runeweapon");
    return useInscription(this.actor, feature ?? { id: "inscribe", name: game.i18n.localize("AZEROTH.Runes.Panel.Inscribe") });
  }

  /** *As a Half-Action, you may also spend any type of rune to gain its Runic Power* (02 §7). */
  static async #onSpendRune() {
    return spendRuneBare(this.actor, { kind: "any" });
  }

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
    // column says what Cast will take, through `spellPrice` - the reading
    // `castSpell` pays with - and the tab says so in words above the tiers, so
    // the number is never read as Mana. A Sustain already held is still Mana
    // (the lead: *"Upkeep unchanged"*).
    const inForm = this.actor.inShapeshiftForm === true;
    const manaWord = game.i18n.localize("AZEROTH.Card.Mana");
    // **A SPELL A TALENT PAYS FROM ANOTHER POOL SAYS WHICH** (the Chromatic Champion's
    // branch spells, paid in Rage): the column's word is the pool `castSpell` takes it
    // from, through the same `spellPoolFor`, and that pool's bar joins the header.
    const taken = this.actor.takenTalents?.() ?? [];
    const paidIn = new Set();
    const vitaeHeld = (this.actor.poolSnapshot?.() ?? []).find(p => p.kind === "power" && p.name === "vitae")?.value ?? 0;
    const healthNow = system.health?.value ?? 0;
    for (const item of held) {
      const tier = item.system.tier ?? 1;
      if (!byTier.has(tier)) byTier.set(tier, []);
      const school = item.system.school;
      if (school && !order.includes(school)) order.push(school);
      const mana = item.system.mana ?? null;
      const price = inForm && mana > 0 ? spellPrice(mana, { inShapeshiftForm: true }) : null;
      // And a class that pays in its Momentum (D-944): the Death Knight's Runic Power.
      const paid = spellPayment(spellPoolFor(taken, { name: item.name, school }), this.actor.classItems ?? [], { school, classes: item.system.classes ?? null });
      const payWith = paid?.pool && paid.pool !== "mana" ? paid.pool : null;
      if (payWith) paidIn.add(payWith);
      const payWord = payWith ? game.i18n.localize(AZEROTH.momentumTypes[payWith] ?? AZEROTH.powerTypes[payWith] ?? payWith) : manaWord;
      // **WHAT A VITAE PRICE WILL TAKE FROM HEALTH, IN WORDS** (02 §7, *When your Vitae runs out*; the
      // San'layn and Sovereign plan's V4: *"This will drop you to 0 Health"*): the row says so before Cast.
      const vitaeKind = payWith === "vitae" && mana > 0 ? vitaeWarning({ held: vitaeHeld, cost: mana, health: healthNow }) : null;
      byTier.get(tier).push({
        vitaeWarn: vitaeKind ? game.i18n.format(VITAE_WARNING_WORDS[vitaeKind], { name: this.actor.name, n: mana, vitae: vitaeHeld, health: healthNow }) : null,
        vitaeWarnKind: vitaeKind,
        id: item.id,
        name: item.name,
        img: item.img,
        tier,
        school,
        schoolLabel: AZEROTH.spellSchools[school] ?? null,
        mana: price ? price.amount : mana,
        // The pool's word beside the number where the list pays in more than Mana (F6's question 6;
        // run close-F2): the browser row's own *2 Runic Power* (`browser-categories.mjs`).
        cost: mana === null || mana === undefined ? null : `${price ? price.amount : mana} ${price ? game.i18n.localize(AZEROTH.momentumTypes.ferocity) : payWord}`,
        manaTip: price ? game.i18n.format("AZEROTH.Shape.FerocityForMana", { mana }) : payWord,
        ferocity: Boolean(price),
        actionLabel: AZEROTH.spellActions[item.system.action] ?? null,
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
    // **A SPELL A CLASS, A FEATURE OR A TALENT TEACHES IS ON TOP OF THE COUNT** (02 §7's Sovereign: *Drain
    // Life, Bloodbolt and Decree of Frailty are known on top of that count*; Unholy Lore's and Grave Calling's
    // *does not count against your spells known*): a spell carrying `spellFrom` is drawn and never counted.
    // Through the one predicate and the sync's one grant table (D-1862), so a spell is off the count
    // exactly where the cast door honours what taught it.
    const grants = this.actor.spellGrantTable?.() ?? [];
    const counted = held.filter(i => countsTowardKnown({ spellFrom: i.getFlag?.("azeroth-rpg", "spellFrom") ?? null, name: i.name, grants })).length;

    return {
      tiers,
      count: counted,
      known,
      minimum,
      short: known.length > 0 && counted < minimum,
      // The words that say the column is Ferocity, in a Shapeshift form alone.
      ferocityNote: inForm ? game.i18n.format("AZEROTH.Shape.SpellsInFerocity", { form: shapeLabel(this.actor.shape) }) : null,
      // **EVERY ROW SAYS ITS POOL WHERE ANY ROW PAYS IN ANOTHER** (F6's question 6; run close-F2): a
      // Death Knight's Runic Power, a branch spell's Rage. The number alone reads as Mana.
      costWords: paidIn.size > 0,
      // The Power pools, through **Core's own rows** rather than a second
      // build of them. D-614 said *one partial, so the two cannot drift* and
      // then wrote the row twice: the header's copy carried no `editable`, so
      // the stepper (the lead, 2026-09-13) reached Core and not this tab, and
      // the two bars printed the same pool two ways. The partial was never the
      // half that drifted.
      pools: this.#pools().filter(pool => pool.held && (pool.kind === "power" || paidIn.has(pool.name)))
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
      const state = canTakeRacial({ ...item.system, name: item.name }, held, this.actor.system.level ?? 1, {
        race: this.actor.raceItem?.name, classes: this.actor.classItems.map(item => item.name)
      });
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
      this.#talentPoints().left,
      // 04's Gilded Skin (*once you have Prim and Proper*): the features this character holds.
      { features: this.actor.items.filter(i => i.type === "feature").map(i => i.name) }
    );
    if (!state.ok) {
      ui.notifications?.warn(
        game.i18n.format(`AZEROTH.Talent.Locked.${state.reason}`, { feature: state.feature ?? "" })
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

  /**
   * The twenty-three skills in book order, grouped by the ability each reads
   * (D11 §1). **Total = skill modifier + Proficiency + Rank** (05 §8, D-810),
   * read through the one door every Skill Test takes (`rules/skills.mjs`).
   */
  #skills() {
    const system = this.actor.system;
    const ranks = this.actor.getFlag("azeroth-rpg", "skillRanks") ?? {};
    // **THE CHEAP SKILLS ARE THE PROFESSION'S** (D-1906): its five, the picks made at each tier
    // reached, and the one skill a Human's Adaptable names, which is cheap whatever the
    // profession (02 §5, D-636). `AzerothActor#professionSkills` is the one reading; the
    // profession's own share is read again without Adaptable so the marker can say why.
    const cheap = this.actor.professionSkills();
    const prof = this.actor.professionItem;
    const own = professionSkillSet({ profession: prof?.system ?? null, tier: this.actor.professionTier, picks: prof?.system?.picks ?? null });
    const profName = prof?.name ?? "";
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
        // The hover names the number the row adds (05 §1, D-810): a Str 16
        // gives Athletics +1, not the +3 its plate shows.
        abilityTip: game.i18n.format("AZEROTH.Sheet.SkillModifierTip", {
          ability: game.i18n.localize(AZEROTH.abilities[ability]),
          skill: signedModifier(skillModOf(this.actor, ability) ?? 0)
        }),
        rank,
        // The cheap-skill marker is the PROFESSION'S GLYPH (D11 §12): it is the only reason a
        // Rank is cheap, and the tooltip says which and what it costs. Adaptable's skill takes
        // the plain diamond, since the profession is not why.
        inProfession: cheap.has(key),
        cheapImg: own.has(key) ? (prof?.img ?? null) : null,
        cheapTip: own.has(key)
          ? game.i18n.format("AZEROTH.Sheet.ProfessionSkillTip", { profession: profName })
          : game.i18n.localize("AZEROTH.Sheet.AdaptableSkillTip"),
        buyTip: rank < RANK_MAX
          ? game.i18n.format(cheap.has(key) ? "AZEROTH.Sheet.BuyCost" : "AZEROTH.Sheet.BuyCostOutside", { cost: rankCost(rank + 1, cheap.has(key)) })
          : null,
        // 02 SS8: the next Rank's cost, and whether the purse covers it.
        nextCost: rank < RANK_MAX ? rankCost(rank + 1, cheap.has(key)) : null,
        canBuy: rank < RANK_MAX && purse >= rankCost(rank + 1, cheap.has(key)),
        total: skillTotalFor(this.actor, key)
      };
    });
  }

  /**
   * Momentum and Power. **The bar segments come from the class, never from a
   * constant** (D11 §2) — and a pool the character does not hold draws an
   * em-dash rather than an empty bar (D-509).
   */
  /**
   * **THE SOVEREIGN'S COMBAT ROW** (02 §7; the San'layn and Sovereign plan's C4 and D11): drawn only where
   * the character holds Hunt Mortal or a Vitae or Tribute pool. The prey is named in words (never by a
   * colour alone), with Hunt Mortal's Mark, its Clear and The Blood Royal's Feed; the two bars are Core's
   * own rows (`#pools`), so the Combat tab and Core never draw a pool two ways (D-614).
   */
  /**
   * **THE DEMON HUNTER'S COMBAT ROW** (the review's S1 and C4): Sense demons where Spectral Sight is held, and a Pick
   * up for each glaive lying away, by name. Null for anybody with neither.
   */
  #demonHunterCombat() {
    const senses = this.actor.items.some(i => i.type === "feature" && i.name === SPECTRAL_SIGHT.feature);
    const glaives = this.actor.items.filter(i => i.type === "weapon" && awayOf(i))
      .map(i => ({ id: i.id, label: game.i18n.format("AZEROTH.DemonHunter.PickUp.Button", { glaive: i.name }) }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    return senses || glaives.length ? { senses, glaives } : null;
  }

  #sovereignCombat() {
    const pools = this.#pools().filter(p => p.held && (p.name === "vitae" || p.name === "tribute"));
    const hunts = this.actor.hasFeature?.("Hunt Mortal") === true;
    if (!pools.length && !hunts) return null;
    const mark = this.actor.preyMark?.() ?? null;
    // A Blood vial carried (08 §12): a Sovereign drinks one for twice its tier in Vitae (the plan's F3).
    const vial = pools.some(p => p.name === "vitae")
      ? (this.actor.items.find(i => i.type === "gear" && i.system?.provision === "blood") ?? null)
      : null;
    // The latch the Sovereign holds (02 §7's *Latched*): on a creature of the viewed scene or a world actor,
    // named in words with its Let go beside it - the latch lives on the prey, which a player does not own.
    const latched = [];
    const seen = new Set();
    const scan = a => {
      if (!a || seen.has(a.uuid)) return;
      seen.add(a.uuid);
      if (latchesOn([...(a.effects ?? [])]).some(l => l.holder === this.actor.uuid)) latched.push(a.token?.name ?? a.name);
    };
    for (const token of canvas?.scene?.tokens ?? []) scan(token.actor);
    for (const a of game.actors ?? []) scan(a);
    return {
      pools,
      hunts,
      latch: latched.length ? { words: game.i18n.format("AZEROTH.Sovereign.Latch.Held", { target: latched.sort().join(", ") }) } : null,
      vial: vial ? { id: vial.id, name: vial.name, count: vial.system?.quantity ?? 1 } : null,
      feeds: this.actor.hasFeature?.("The Blood Royal") === true,
      prey: mark ? { name: mark.name, words: game.i18n.format("AZEROTH.Prey.Is", { target: mark.name }) } : null,
      none: game.i18n.localize("AZEROTH.Prey.None")
    };
  }

  #pools() {
    const system = this.actor.system;
    const build = (pool, stored, kind = null) => {
      if (!pool) return { held: false, label: null, value: null, max: null, segments: [], editable: false };
      const label = AZEROTH.momentumTypes[pool.name] ?? AZEROTH.powerTypes[pool.name] ?? pool.name;
      // **THE RUNES ARE READ HERE AND SPENT ON THE COMBAT TAB** (F6's question 6; run close-F2;
      // AGENT READING): the pool is derived off the weapons (D-919) and a hand write to it is refused
      // in words (D-953), so a number box, steppers and Spend here could only refuse. The bar draws
      // the count and a line naming the rune panel, whose sockets are the controls.
      const runes = pool.name === RUNES;
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
        editable: this.isEditable && !runes,
        runes,
        value: stored.value,
        max: pool.max,
        // One segment per point the class allows: a Warrior's bar has ten and
        // a Rogue's has five. The runes' segments carry their kind (D-1103): a Blood rune
        // draws red and a Frost rune the darker blue, each named in its tooltip.
        segments: runes
          ? runePoolSegments(system.runes, {
            blood: game.i18n.localize("AZEROTH.Runes.Blood"), frost: game.i18n.localize("AZEROTH.Runes.Frost"),
            spentBlood: game.i18n.localize("AZEROTH.Runes.SpentBlood"), spentFrost: game.i18n.localize("AZEROTH.Runes.SpentFrost")
          })
          : pool.name === HATRED ? this.#hatredSegments(stored.value)
            : Array.from({ length: pool.max }, (_, i) => ({ filled: i < stored.value })),
        // **SAND IS HELD IN THE HOURGLASS** (D-848): the partial draws the glass
        // beside the count, and with none in the Ranged slot it says so in words,
        // since a bar of no segments alone would read as a broken pool.
        sand: pool.name === SAND,
        noHourglass: pool.name === SAND && !(pool.max > 0),
        // **HATRED'S CAP IS SAID IN WORDS** (the Demon Hunter plan, R5 and C5): the cap and the Fel it
        // reads (`rules/hatred.mjs#felFor`), and a line where a fallen cap left Hatred above it, which
        // a gain cannot add to (`hatredWrite`). The ladder panel is the sheet phase's.
        // D11's ladder in words and the rest's price (D-1581): `#hatredWords` reads the one cap reader, the one
        // rest reader and Fel Lash's own law, so the bar and the Corruption tab say the same thing.
        ...(pool.name === HATRED ? this.#hatredWords(stored.value) : {}),
        hatredAbove: pool.name === HATRED && (stored.value ?? 0) > (pool.max ?? 0) ? game.i18n.format("AZEROTH.Hatred.AboveCap", { cap: pool.max }) : null
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
   * **THE HATRED BAR'S MODEL** (D11; D-1581), off the Hatred held: the cap the Fel the features read gives, the
   * rest's price with Warding Tattoos and the Sufferer's talents in it, and what a Fel Lash hit sheds now.
   *
   * @param {number} held
   */
  #hatredModel(held) {
    const actor = this.actor;
    const fel = felFor(actor);
    const holdsLash = actor.items.some(i => i.type === "feature" && i.name === FEL_LASH.feature);
    const prepared = actor.effects.some(e => e.getFlag?.("azeroth-rpg", I_HAVE_PREPARED.flag));
    // The turn's one shed spent (D-1721), off the round's record in a started fight - read only, never claimed here.
    const fight = actor.activeFight?.() ?? null;
    const mine = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
    const record = mine?.getFlag?.("azeroth-rpg", "round") ?? null;
    const shedThisTurn = Boolean(mine && record?.number === fight.round && (record.once ?? []).includes(`${FEL_LASH.shedMark}@${fight.turn}`));
    const shed = holdsLash ? felLashShed({ tier: actor.system?.tier ?? 1, held: heldFel(actor), prepared, shedThisTurn }) : null;
    return hatredView({ held, fel, modifiers: restModifiersOf(actor), shed });
  }

  /** The bar's segments: the cap, and Hatred held above it drawn and said in words, never trimmed (Q14). */
  #hatredSegments(held) {
    const over = game.i18n.localize("AZEROTH.Hatred.OverSegment");
    return this.#hatredModel(held).segments.map(seg => ({ filled: seg.filled, ...(seg.over ? { kind: "over", label: over } : {}) }));
  }

  /** The bar's words: the ladder, its next rung, and the rest's price (D11: *At a rest: +k Fel*). */
  #hatredWords(held) {
    const view = this.#hatredModel(held);
    const f = game.i18n.format.bind(game.i18n);
    return {
      hatredLadder: f("AZEROTH.Hatred.Ladder", { fel: view.fel, cap: view.cap }),
      hatredNext: view.next ? f("AZEROTH.Hatred.NextRung", { fel: view.next.fel, cap: view.next.cap }) : game.i18n.localize("AZEROTH.Hatred.LadderTop"),
      hatredRest: view.restFel === null ? game.i18n.localize("AZEROTH.Hatred.RestNothing") : f("AZEROTH.Hatred.RestCost", { n: view.restFel }),
      hatredShed: this.#shedWords(view.shed)
    };
  }

  /** What a Fel Lash hit does to the Fel track now, in words, or null for a hunter without the feature. */
  #shedWords(shed) {
    if (!shed) return null;
    if (shed.points > 0) return game.i18n.format("AZEROTH.Hatred.Shed.Points", { n: shed.points });
    return game.i18n.localize(`AZEROTH.Hatred.Shed.${shed.reason ?? "none"}`);
  }

  /**
   * **THE HATRED PANEL** (D-1581): the Overview's one line and the Corruption tab's panel, drawn for a character
   * holding a Hatred pool, else null. The Fel track itself stays the Corruption tab's (D11).
   */
  #hatredPanel() {
    const pool = (this.actor.system?.momenta ?? []).find(m => m.name === HATRED) ?? null;
    if (!pool) return null;
    const words = this.#hatredWords(pool.value);
    const count = game.i18n.format("AZEROTH.Hatred.Count", { n: pool.value ?? 0, cap: pool.max ?? 0 });
    return {
      count, ...words,
      above: (pool.value ?? 0) > (pool.max ?? 0) ? game.i18n.format("AZEROTH.Hatred.AboveCap", { cap: pool.max }) : null,
      overview: [count, words.hatredRest, words.hatredShed].filter(Boolean).join(" \u00b7 ")
    };
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
    if (shape.forced) return this.#forcedShapeContext(shape);
    const system = this.actor.system;
    const label = shapeLabel(shape);
    const names = game.i18n.getListFormatter({ type: "conjunction" }).format(shape.forms.map(f => f.name));
    const first = shape.forms[0] ?? {};
    const melds = meldsGear(shape.kind);
    const attacks = (this.actor.readyWeapons?.() ?? []).filter(w => w.natural).map((w, index) => {
      const ability = attackAbility(w.system, null, deftScores(system.abilities));
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
        .map(i => shownName(i))
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

  /**
   * **A SHAPE SOMEBODY ELSE LAID** (07's Hex, 02's Polymorph; D-808): the same object
   * the banner, the Combat tab and the Overview read, holding none of the block's
   * half. Defense and Armor Points are named the creature's own, the Speed the
   * spell's, the weapons stay in the list (every attack door refuses them in words),
   * and where the reader may not take the shape off, the reason stands where the
   * Leave would - a refused clear is never a dead button (D-686).
   */
  #forcedShapeContext(shape) {
    const label = shapeLabel(shape);
    const first = shape.forms[0] ?? {};
    const by = SHAPE_KINDS[shape.kind]?.by ?? "";
    return {
      kind: shape.kind,
      kindLabel: AZEROTH.shapeKinds[shape.kind] ?? null,
      forced: true,
      label,
      line: game.i18n.format("AZEROTH.ForcedShape.InForm", { form: label }),
      names: first.name ?? "",
      portrait: first.portrait || first.token || null,
      uuid: first.uuid ?? null,
      from: game.i18n.format("AZEROTH.ForcedShape.OwnNumbers", { by }),
      speedFrom: game.i18n.format("AZEROTH.ForcedShape.SpeedFrom", { by, speed: FORCED_SPEED }),
      speed: this.actor.system.speed ?? null,
      flying: null,
      melds: false,
      attacksHeading: null,
      attacks: [],
      melded: null,
      ward: null,
      leaveRefused: forcedRefusalFor(this.actor, "leave"),
      leaveNote: game.i18n.localize(FORCED_ENDS[shape.kind] ?? "")
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
    // 02's Timeless Mind doubles the Proficiency on a Spirit Test (stage 2b): the sheet's
    // number is the Test's (`rules/resilience.mjs#resilienceRows`).
    const doubled = timelessMindDoubles({ resilience, trained, holds: this.actor.hasFeature?.(CHRONO_FEATURES.timelessMind.feature) === true });
    return (system.abilities?.[abilityKey]?.mod ?? 0) + (trained ? (system.proficiency ?? 0) * (doubled ? 2 : 1) : 0);
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
    const bundles = weapons.map(i => ({ id: i.id, name: shownName(i), ...i.system }));
    // **THE CLAWS' ROW** (02 §7's Blood-Forged Claws; the lead, R6: *"An Equip toggle on the
    // sheet"*; the plan's B.13 Q11, the Combat tab; D-1163): the Equip toggle stands, Attack is
    // offered only while they are equipped, there is no Delete (they go with the feature), and
    // Blooded Claws' free attacks are counted on the row.
    const clawFree = freeOffHand(this.actor.clawFacts?.() ?? {});
    return weapons
      // A bundle of shot is not a weapon to swing (D-641): it lists beneath.
      .filter(item => !item.system.isShot)
      .map(item => {
        const sys = item.system;
        // A launcher fires the bundle nocked on it: the row's Rating is the
        // shot's plus the launcher's, a dash while nothing fits (D-406).
        const fitting = sys.isLauncher ? fittingBundles(sys, bundles) : [];
        const chosen = sys.isLauncher ? selectAmmunition(sys, fitting) : null;
        const claws = isClaws(item);
        // **AN UNIDENTIFIED WEAPON IS ITS KIND** (08 §4; D-1435): its Rating and traits are among
        // the numbers identifying reveals, so the row draws a dash and no chips. Attack still works.
        const hidden = hiddenToViewer(item);
        return {
          id: item.id,
          name: shownName(item),
          img: item.img,
          hidden,
          claws,
          attackable: !claws || sys.equipped === true,
          deletable: !claws,
          clawUses: claws && clawFree.eligible
            ? { text: game.i18n.format("AZEROTH.Claws.FreeUses", { left: clawFree.left, max: clawFree.max }), tip: game.i18n.localize("AZEROTH.Claws.FreeUsesTip") }
            : null,
          equipTip: claws ? game.i18n.localize("AZEROTH.Claws.Uncover") : null,
          // A Versatile weapon with the Off hand empty reads its two-handed Rating, the one the attack swings at (08 §5).
          rating: hidden ? null : (sys.isLauncher ? (chosen ? shotDamage(sys, chosen).rating : null) : (versatileRating(item, this.actor.items, { offHand: sys.offHand === true }) ?? sys.rating)),
          range: hidden ? null : sys.range,
          traits: hidden ? [] : (sys.traits ?? []),
          equipped: sys.equipped === true,
          rarityClass: rarityClass(sys.rarity),
          detail: detailFields(item),
          editable: this.isEditable,
          launcher: sys.isLauncher ? game.i18n.localize(AZEROTH.launcherKinds[sys.launcher]) : null,
          ammo: sys.isLauncher ? fitting.map(shot => ({ id: shot.id, name: shot.name, quantity: shot.quantity ?? 0, selected: shot.id === chosen?.id })) : []
        };
      })
      // The ROWS, by the name each already shows (08 §4: a hidden thing sorts under its kind).
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  /** The bundles of shot carried, beneath the weapons (D-641): counted, never swung. */
  #ammunition() {
    const favorites = new Set(this.actor.favorites);
    return this.actor.items
      .filter(i => i.type === "weapon" && i.system.isShot)
      .map(item => ({
        id: item.id,
        name: shownName(item),
        img: item.img,
        quantity: item.system.quantity ?? 0,
        fits: (item.system.fits ?? []).map(k => game.i18n.localize(AZEROTH.launcherKinds[k] ?? k)).join(", "),
        rarityClass: rarityClass(item.system.rarity),
        favorite: favorites.has(item.id),
        detail: detailFields(item)
      }))
      .sort((x, y) => x.name.localeCompare(y.name));
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
      // 08 §4's line on an unidentified thing's card (`tipModel`'s `hidden`).
      unidentified: game.i18n.localize("AZEROTH.Identify.TipLine"),
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
    // A bag's own name heads its panel, so an unidentified bag is its kind there too (08 §4).
    const names = new Map(items.map(item => [item.id, shownName(item)]));
    const starred = new Set(this.actor.favorites);
    const described = new Map((rows ?? []).map(row => [row.id, row]));

    const tiles = new Map();
    for (const item of items) {
      if (!["weapon", "armor", "gear"].includes(item.type)) continue;
      // An unarmed strike is never carried and draws no tile (the Sovereign's Claws; D-1162).
      if (!isThing(item)) continue;
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
      inspect: [...tiles.values()].sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id))
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
    // **AN UNIDENTIFIED THING KEEPS ITS ICON, ITS RING AND ITS PLACE** (08 §4; D-1435; the lead:
    // *"Kind + rarity"*): its name is its kind, and its fields, prose, charges, coating and
    // Augment bonus are left off the tile, the tooltip and the inspector. What it weighs, how many
    // wells it takes and how many there are stay, because the bags are arranged by them.
    const hidden = hiddenToViewer(item);
    const row = {
      ...described,
      trainingTip: this.#trainingTip(item),
      id: item.id,
      name: shownName(item),
      img: item.img,
      type: item.type,
      sort: item.sort ?? 0,
      system: sys,
      hidden,
      rarityClass: rarityClass(sys.rarity),
      favorite: starred.has(item.id),
      coating: hidden ? null : coatingName(item.getFlag("azeroth-rpg", "coating") ?? null),
      charges: !hidden && hasCharges(sys.charges) ? { ...sys.charges } : null,
      usable: hasUse(sys.use),
      useRefusal: dispersionRefusal(this.actor, "gear"),
      quantity: sys.quantity ?? null,
      // A container and a mount are put on from this tab now (D-736), so the
      // row's own answer is `actions.mjs#wearable` rather than the narrower
      // rule `carried.mjs` keeps for the creature's tab.
      equippable: wearable(item),
      equipped: sys.equipped === true,
      augment: !hidden && sys.augment ? { ...sys.augment } : null,
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
      name: row.name,
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
    return game.i18n.format("AZEROTH.Bags.Refused.NoRoomToRemove", { name: shownName(item) });
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
    // The Gear tab's own disguise (08 §4): the kind for a name, no coating, and `hidden` telling
    // `tipModel` to leave off the blurb and the charges and to say *Unidentified*.
    const hidden = hiddenToViewer(item);
    const tip = tipModel({
      name: shownName(item),
      trainingTip: this.#trainingTip(item),
      type: item.type,
      system: sys,
      hidden,
      rarityClass: rarityClass(sys.rarity),
      bagLine: null,
      coating: hidden ? null : coatingName(item.getFlag("azeroth-rpg", "coating") ?? null),
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
    // The source lists as THIS viewer reads them (D-1435): a GM the true names, a player
    // *an unidentified item* for a hidden thing.
    const grants = shownGrants(system.grants);
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
      // The Off hand shows the shield where no off-hand weapon is held, and the
      // Ranged tile the Augment where no launcher is (D-850), so each says
      // which it is showing.
      const note = slot === "offHand" && figure.offHandKind && figure.offHandKind !== "weapon"
        ? game.i18n.localize(AZEROTH.heldSlots[figure.offHandKind])
        : (slot === "ranged" && figure.rangedKind === "augment"
          ? game.i18n.localize(AZEROTH.heldSlots.augment)
          : null);
      // A Versatile weapon held in both hands by its rune count says so (D-943).
      const runeNote = barred ? twoHandedNote(figure.mainHand) : null;
      const mainName = figure.mainHand ? shownName(figure.mainHand) : "";
      const barredNote = barred
        ? [game.i18n.format("AZEROTH.Overview.TwoHanded", { name: mainName }),
          ...(runeNote ? [game.i18n.format(runeNote, { name: mainName })] : [])].join(" ")
        : null;
      // **THE SOCKET CARRIES NO WORDS** (the lead, 2026-09-20, against WoW's
      // own character pane): the icon in its rarity ring is the whole tile, so
      // what it is has to be said in the `aria-label` and in the tooltip, and
      // both are composed here. A reader with no pointer and a reader with no
      // eyes each get the slot AND what is in it, in that order.
      const what = barred
        ? game.i18n.format("AZEROTH.Overview.BarredLabel", { note: barredNote })
        : (item ? shownName(item) : game.i18n.localize("AZEROTH.Overview.Empty"));
      const ariaLabel = game.i18n.format("AZEROTH.Overview.TileLabel", { slot: label, what });
      const pickTip = game.i18n.format("AZEROTH.Overview.PickTip", { slot: label });
      return {
        slot,
        // `{{#if tile.index}}` is false for 0, so the template asks whether
        // the slot is numbered rather than whether the index is truthy.
        index: index ?? null,
        numbered: Number.isInteger(index),
        filled: Boolean(item),
        trainingTip: this.#trainingTip(item),
        id: item?.id ?? null,
        img: item?.img ?? null,
        rarityClass: item ? rarityClass(item.system?.rarity) : null,
        barred,
        // What the socket used to print - the slot's label, the thing's name,
        // *Empty*, which of a weapon or a shield the off hand is showing and
        // which of a launcher or an Augment the Ranged tile is (D-850) - is all
        // inside these two now.
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
        trainingTip: this.#trainingTip(item),
        name: shownName(item),
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
            from: (a.sources ?? []).map(s => shownSourceName(s)).join(", ")
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
            from: (grants.scalarSources?.[key] ?? []).map(s => shownSourceName(s)).sort().join(", ")
          })),
        fortitude: grants.fortitude ?? 0,
        defense: system.defense ?? null,
        ap: Object.keys(AZEROTH.locations).map(key => ({
          key,
          label: AZEROTH.locations[key],
          value: Math.max(0, system.ap?.[key] ?? 0)
        })),
        // An Hourglass holds Sand and adds nothing to a Casting Test (07 §3, D-849): the line
        // says so, rather than *+0* (the 2a review's should-fix, stage 2b).
        // A hidden Augment's number is hidden too (D-1435): it works, and the line says nothing of what it adds.
        augment: augment ? { name: augment.item ? shownName(augment.item) : augment.name, hidden: Boolean(augment.item && hiddenToViewer(augment.item)), bonus: augment.item && hiddenToViewer(augment.item) ? null : augment.bonus, className: augment.className, holds: Boolean(augment.holds) } : null,
        // WHAT THE SIGNATURES ON WHAT IS WORN ARE DOING (08 §20, S3; D-692):
        // one row per equipped Signature, beside Ward, Spellpower and the
        // Boons, saying whether its gate holds and carrying a button where
        // there is one to press. Assembled here rather than in `#signatures`
        // because this column is a summary and the Combat panel is the
        // controls; both read the same `signatureContext`, so they can never
        // disagree about whether a thing is available.
        //
        signatures: signatures.map(row => ({
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
          gatedParts: row.gatedParts,
          // A Legendary's other buttons (D-910), each with its own refusal.
          presses: row.presses
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
      .filter(i => !talentEffect(i.system.className, i.system.identifier, i.system.race ?? null)?.grants)
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
   * **A profession has no Signature** (D-1909), so the panel lists worn things alone.
   */
  async #signatures() {
    const rows = [];
    const worn = this.actor.items
      .filter(i => ["weapon", "armor", "gear"].includes(i.type) && i.system?.equipped === true)
      .filter(i => hasSignature(i.system?.signatureEffect))
      // **AN UNIDENTIFIED THING HAS NO SIGNATURE ROW FOR A PLAYER** (08 §4; D-1435): that it has
      // one at all is what identifying reveals. Its standing Signature still works; its Use is
      // locked at the door. A GM's sheet keeps the row, greyed and said (`signatureContext`).
      .filter(i => !hiddenToViewer(i))
      // An embedded collection's order is not stable across a re-sync, so a
      // list a person reads is sorted (2026-09-06), by the name it shows.
      .sort((a, b) => shownName(a).localeCompare(shownName(b)) || a.id.localeCompare(b.id));
    for (const item of worn) {
      rows.push({
        id: item.id,
        name: shownName(item),
        img: item.img,
        rarityClass: rarityClass(item.system?.rarity),
        text: await enrich(item.system.signature ?? "", { relativeTo: item }),
        ...signatureContext(item, this.actor)
      });
    }
    return rows;
  }

  async #featureRow(item, favorites) {
    const s = item.system;
    // In a Shapeshift form a Mana price is paid in Ferocity (07, D-769); the
    // chip says what the Use takes, through the law the door pays with.
    const price = featurePrice(s.cost, { inShapeshiftForm: this.actor.inShapeshiftForm === true });
    // 05 §11's kind word reads as itself (02 §5's War Stomp: *4 Momentum*; the B8a pass).
    // One rune is *Rune* (`rules/runes.mjs#poolLabelKey`; the F2 review's note).
    const poolLabel = price ? game.i18n.localize(poolLabelKey(price.pool, price.all ? 2 : price.amount, AZEROTH.costPoolTypes)) : null;
    // A shape the character cannot take at all (the lead: *"No Avatar without
    // it"*): the row greyed and the reason in words, through the rule the
    // door refuses with (`useFeature`'s 1a).
    const barred = shapeRefusal(shapeKindOf({ name: item.name, choice: s.choice }), { ranks: name => this.actor.talentRanks?.(name) ?? 0 });
    // A talent's Use that asks for a Shapeshift form (04's Survival Instincts,
    // D-771): greyed out of one, with the door's own words.
    const grantId = item.getFlag("azeroth-rpg", "feature")?.talentId ?? null;
    const granting = grantId ? this.actor.items.get(grantId) ?? null : null;
    // A class feature's own `onUse` where no talent granted it (02's Recall: a use buys the mark,
    // and the return with a mark standing needs none - `usesAskedLater`; stage 2b).
    const use = granting ? onUseOf(talentEffect(granting.system?.className, granting.system?.identifier, granting.system?.race ?? null)) : classFeatureOnUse(item.system?.className ?? "", item.name);
    const formless = use?.requires === "shapeshift" && this.actor.inShapeshiftForm !== true;
    // **A USE THAT NEEDS SOMETHING IN HAND** (04's Bladestorm, and the Death Knight's Dancing
    // Runeweapon: *while you wield a two-handed weapon, or a Versatile weapon in both hands*;
    // run F4a): greyed with the door's own words (`rules/wield.mjs#wieldRefusal`).
    const wieldNeeds = Array.isArray(use?.wields) && use.wields.length ? wieldRefusal(use.wields, this.actor.gateFacts?.()?.wield ?? null) : null;
    const refusal = barred
      ? game.i18n.format("AZEROTH.Shape.NeedsTalent", { name: item.name, talent: barred.talent })
      : (formless ? game.i18n.format("AZEROTH.Feature.NeedsForm", { name: item.name })
        : (wieldNeeds ? game.i18n.format(wieldNeeds, { name: item.name }) : null));
    return {
      id: item.id,
      name: item.name,
      img: item.img,
      type: "feature",
      className: s.className,
      level: s.level,
      passive: s.kind === "passive",
      actionLabel: s.action ? AZEROTH.actions[s.action] : null,
      // **EVERY RUNG ITS USE MAY BE TAKEN AT** (04's Ethereal Form at rank 2: *you may use
      // it as a Reaction*): the chip names both - *Half-Action or Reaction* - through the
      // stamp's own `rungs`, which the door's chooser reads too. Null at one rung.
      rungsText: rungsChip(s.action ?? null, s.rungs ?? [], {
        label: r => game.i18n.localize(AZEROTH.actions[r] ?? r),
        or: (first, second) => game.i18n.format("AZEROTH.Feature.RungEither", { first, second })
      }),
      cost: poolLabel ? `${price.all ? game.i18n.localize("AZEROTH.Feature.SpendAll") : price.amount} ${poolLabel}` : null,
      casting: s.casting === true,
      uses: this.#usesRow(item),
      // **A USE WHOSE FIRST CHOICE IS FREE STAYS PRESSABLE WITH ITS USE SPENT** (04's
      // Ultrasafe Transporter: a pad is set over a Short Rest, and the Long Rest's one use
      // is the travel's; the B3 review): the door greys the travel in words.
      available: (item.system.available || usesAskedLater(use)) && !refusal,
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
      // An unidentified thing is its kind, with no Rating beside it (08 §4; D-1435).
      const hidden = hiddenToViewer(item);
      rows.push({
        id: item.id,
        name: shownName(item),
        img: item.img,
        // Favorites lists weapons, suits and gear and carried no rarity at
        // all, so its icons went unringed while every other list's did
        // (D-676).
        rarityClass: rarityClass(item.system?.rarity),
        type: item.type,
        castable: item.type === "spell",
        attackable: item.type === "weapon",
        usable: hasUse(item.system.use),
        useRefusal: dispersionRefusal(this.actor, "gear"),
        equipped: item.system?.equipped === true,
        meta: item.type === "spell" ? `T${item.system.tier}` : (item.type === "weapon" && !hidden ? (item.system.rating ?? null) : null),
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
    const refusal = dispersionRefusal(this.actor, "gear");
    if (refusal) return ui.notifications?.warn(game.i18n.localize(refusal));
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    await item.update({ "system.charges.value": charges.max });
    ui.notifications?.info(game.i18n.format("AZEROTH.Container.Filled", { name: shownName(item) }));
  }

  /** Spend one (09 SS5: a day with no water costs a point of Fatigue). */
  static async #onSpendCharge(event, target) {
    const refusal = dispersionRefusal(this.actor, "gear");
    if (refusal) return ui.notifications?.warn(game.i18n.localize(refusal));
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const charges = item?.system?.charges;
    if (!hasCharges(charges)) return;
    const left = Math.max(0, (charges.value ?? 0) - 1);
    await item.update({ "system.charges.value": left });
    if (left === 0) ui.notifications?.warn(game.i18n.format("AZEROTH.Container.Empty", { name: shownName(item) }));
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
    if (held) ui.notifications?.info(game.i18n.format("AZEROTH.Use.Wiped", { name: held.name, item: shownName(item) }));
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
    // A Legendary's other button names its run's key (D-910).
    return useSignatureWithDialog(this.actor, item, event, target.dataset.press || null);
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
  /**
   * **HUNT MORTAL** (02 §7): the one creature targeted becomes the prey, judged by the prey door
   * (`effects/sovereign-core.mjs#markPrey`) - once a turn in a fight, within 60 feet.
   */
  static async #onMarkPrey() {
    const targets = [...(game.user?.targets ?? [])];
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Prey.Refuse.target", { name: this.actor.name }));
      return null;
    }
    const r = await this.actor.markPrey(targets[0], { way: "hunt" });
    this.render();
    return r;
  }
  static async #onClearPrey() {
    const { clearPrey } = await import("../effects/sovereign-core.mjs");
    await clearPrey(this.actor);
    return this.render();
  }
  /** **THE BLOOD ROYAL** (02 §7): feed on the one creature targeted (`effects/sovereign-core.mjs#feedWithDialog`). */
  /** **SENSE DEMONS** (02's Spectral Sight; the review's S1): the demons within 60 feet, whispered on a card. */
  static async #onSenseDemons() {
    const { senseDemons } = await import("../effects/demon-hunter-features.mjs");
    return senseDemons(this.actor);
  }

  /** **PICK UP A THROWN GLAIVE** (07's Flame Crash; the review's C4): the glaive the control names. */
  static async #onPickUpGlaive(event, target) {
    const { pickUpGlaive } = await import("../effects/demon-hunter-features.mjs");
    const done = await pickUpGlaive(this.actor, target?.dataset?.glaiveId ?? "");
    this.render();
    return done;
  }

  static async #onFeed() {
    const { feedWithDialog } = await import("../effects/sovereign-core.mjs");
    return feedWithDialog(this.actor);
  }
  /** **A BLOOD VIAL FOR VITAE** (the plan's F3): the vial the control names, 2 x tier Vitae. */
  static async #onDrinkVial(event, target) {
    const vial = this.actor.items.get(target?.dataset?.itemId ?? "");
    const { drinkVial } = await import("../effects/sovereign-core.mjs");
    const r = await drinkVial(this.actor, vial);
    this.render();
    return r;
  }
  /** **LET GO** (02 §7: *or when you let go*): every latch the Sovereign holds ended, the GM asked first where needed. */
  static async #onLetGo() {
    const { letGo } = await import("../effects/sovereign-features.mjs");
    const r = await letGo(this.actor);
    this.render();
    return r;
  }
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
  static async #onConfigureCombatSheet() {
    if (!game.user.isGM) return;
    const localize = key => foundry.utils.escapeHTML(game.i18n.localize(`AZEROTH.CombatSheet.${key}`));
    const checked = this.actor.getFlag("azeroth-rpg", "showManeuvers") === true;
    const choice = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("AZEROTH.CombatSheet.Configure") },
      classes: ["azeroth"],
      content: `<label><input type="checkbox" name="showManeuvers" ${checked ? "checked" : ""}> ${localize("ShowManeuvers")}</label><p>${localize("Hint")}</p>`,
      ok: {
        label: game.i18n.localize("AZEROTH.CombatSheet.Save"),
        callback: (event, button) => ({ show: button.form.elements.showManeuvers.checked })
      },
      rejectClose: false
    });
    if (!choice || !game.user.isGM) return;
    await this.actor.setFlag("azeroth-rpg", "showManeuvers", choice.show);
  }

  static async #onSplitStack(event, target) {
    if (!this.isEditable) return null;
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return null;
    const held = unitsOf(item);
    if (held < 2) return null;

    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("AZEROTH.Bags.SplitTitle", { name: shownName(item) }) },
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
      ui.notifications?.warn(game.i18n.format(verdict.reason, shownRefusalData(this.actor, verdict.data ?? {})));
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
    const [made] = await this.actor.createEmbeddedDocuments("Item", [data], { azerothBags: "bypass", azerothIdentify: "known" });
    if (!made) return null;
    await this.actor.updateEmbeddedDocuments("Item",
      [{ _id: item.id, "system.quantity": verdict.quantity }], { azerothBags: "bypass" });
    return made;
  }

  /* -------------------------------------------- */
  /*  The Afflictions panel (D12, Phase 7)         */
  /* -------------------------------------------- */

  /**
   * Open or close a row. The DOM is flipped in place (no render, so focus stays
   * on the button) and the open rows are written as ONE array flag - an array
   * replaces rather than merges, so a row that is gone drops out of it.
   */
  static async #onToggleAffliction(event, target) {
    const row = target.closest("[data-affliction-row]");
    const detail = row?.querySelector(".azeroth-aff-detail");
    if (!row || !detail) return;
    const open = target.getAttribute("aria-expanded") !== "true";
    target.setAttribute("aria-expanded", String(open));
    detail.hidden = !open;
    row.classList.toggle("is-open", open);
    const ids = [...this.element.querySelectorAll('[data-affliction-row] .azeroth-aff-toggle[aria-expanded="true"]')]
      .map(b => b.closest("[data-affliction-row]").dataset.afflictionRow);
    await rememberAfflictionOpen(AFFLICTION_OPEN_ROWS, ids);
  }

  static async #onMedicineTest(event, target) {
    const id = target.dataset.afflictionId;
    if (id) await game.system.azeroth.workflows.medicineTest({ patient: this.actor, afflictionId: id, event });
  }

  /** The first Antivenom the actor carries, through the same door every Use takes. */
  static async #onUseAntivenom(event, target) {
    const item = this.actor.items.find(i => isAntivenom(i.system?.use) && (i.system?.quantity ?? 1) > 0);
    if (!item) return void ui.notifications?.warn(game.i18n.format("AZEROTH.Afflictions.Panel.NoItem", { name: game.i18n.localize("AZEROTH.Afflictions.Panel.AntivenomShort") }));
    await useGearWithDialog(this.actor, item);
  }

  static async #onUseRemedy(event, target) {
    const item = this.actor.items.get(target.dataset.itemId ?? "");
    if (!item) return void ui.notifications?.warn(game.i18n.format("AZEROTH.Afflictions.Panel.NoItem", { name: game.i18n.localize("AZEROTH.Afflictions.Panel.RemedyShort") }));
    await useGearWithDialog(this.actor, item);
  }

  /** The GM's alone: a player cannot lose a poison by tidying the sheet. */
  static async #onEndAffliction(event, target) {
    if (!game.user.isGM) return void ui.notifications?.warn(game.i18n.localize("AZEROTH.Afflictions.Panel.EndGMOnly"));
    const id = target.dataset.afflictionId;
    if (id) await endAffliction(this.actor, id, { by: this.actor });
  }

  /** Pick from the catalogue through the system's one chooser (diseases first, then poisons). */
  async #pickAffliction(prompt) {
    if (!game.user.isGM) return void ui.notifications?.warn(game.i18n.localize("AZEROTH.Afflictions.GMOnly"));
    return game.system.azeroth.workflows.chooseAffliction({ actor: this.actor, prompt });
  }

  static async #onAddAffliction(event, target) {
    const pick = await this.#pickAffliction("AZEROTH.Afflictions.Panel.AddPrompt");
    if (pick) await game.system.azeroth.workflows.addAffliction({ actor: this.actor, ...pick });
  }

  static async #onExposeAffliction(event, target) {
    const pick = await this.#pickAffliction("AZEROTH.Afflictions.Panel.ExposePrompt");
    if (pick) await game.system.azeroth.workflows.exposeAffliction({ actor: this.actor, ...pick, event });
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
      modifiers: skillRowsFor(this.actor, key)
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
    // What an unidentified thing grants, its traits and its numbers are hidden (08 §4; D-1435).
    if (hiddenToViewer(item)) return game.i18n.localize("AZEROTH.Identify.TipLine");
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
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.TwoHanded", { name: shownName(barred) }));
      return null;
    }
    if (slot === "ammo") return this.#pickAmmunition(figure, items, label);

    const held = figure[slot];
    const worn = (Array.isArray(held) ? held[index ?? 0] : held) ?? null;
    // FROM THE ACTOR'S OWN ITEMS, and nothing else. `fitsSlot` is the same
    // rule the drop is refused by.
    // **THE CLAWS ARE NEVER A ROW** (the lead, R6: *"An Equip toggle on the sheet. No bag
    // slot and no paper-doll tile of their own"*; D-1163): the Combat tab's toggle puts them
    // on and takes them off, and the picker lists what is carried.
    const candidates = items.filter(i => fitsSlot(i, slot) && !isClaws(i)).sort((a, b) => shownName(a).localeCompare(shownName(b)) || a.id.localeCompare(b.id));
    if (!candidates.length) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.NothingFor", { slot: label }));
      return null;
    }

    const classes = this.actor.classNames ?? [];
    const refusalFor = item => {
      const augment = item.system?.augment ?? null;
      if (!augment || canCarry(augment.category, classes)) return null;
      return game.i18n.format("AZEROTH.Augment.NotYours", { name: shownName(item), className: augment.className });
    };
    // **TWO OF ONE THING ARE TWO ROWS READING THE SAME WORD** (the lead,
    // 2026-09-13), which cannot be chosen between. Numbered by id, since an
    // embedded collection's order is not stable across a re-sync.
    // Numbered by the name the reader SEES: two unidentified longswords read alike (08 §4).
    const copies = copyLabels(candidates.map(i => ({ id: i.id, name: shownName(i) })));
    // And the one already in the OTHER hand is named as such, so a second
    // Dagger offered for the off hand says where the first one is.
    const otherHand = slot === "mainHand" ? "offHand" : (slot === "offHand" ? "mainHand" : null);
    const inOther = otherHand ? figure[otherHand] : null;
    const otherTag = slot === "mainHand" ? "AZEROTH.Overview.InOffHand" : "AZEROTH.Overview.InMainHand";
    const rows = [
      // Where the tile is filled, taking it off is the first choice.
      ...(worn && !isClaws(worn) ? [{ key: "", name: game.i18n.localize("AZEROTH.Overview.TakeOff"), description: "", available: true }] : []),
      ...candidates.map(item => {
        // 08 §9 locks an Augment to its class; the row is listed and GREYED
        // rather than hidden, and its line says why (D-673's shape).
        const refusal = refusalFor(item);
        const copy = copies.get(item.id);
        return {
          key: item.id,
          name: copy ? game.i18n.format("AZEROTH.Overview.Copy", { name: shownName(item), n: copy }) : shownName(item),
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
    const carried = items.filter(i => i.type === "weapon").map(i => ({ id: i.id, name: shownName(i), ...(i.system ?? {}) }));
    const bundles = launcher ? fittingBundles(launcher.system ?? {}, carried) : [];
    if (!bundles.length) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Overview.NothingFor", { slot: label }));
      return null;
    }
    const nocked = figure.ammo;
    // `carried` is already named as this viewer sees it (`shownName`), so each shot's name is.
    const rows = bundles.map(shot => ({
      key: shot.id,
      name: shot.name,
      tag: shot.id === nocked?.id ? game.i18n.localize("AZEROTH.Overview.NockedNow") : null,
      description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Card.ShotsLeft", { n: shot.quantity ?? 0 }))}</p>`,
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
      // **A PLAYER SEES NO SPELL ON AN UNIDENTIFIED THING** (08 §4; D-1435): that it casts is what
      // identifying reveals. A GM sees the row with Cast greyed (`locked`).
      if (list.length && hiddenToViewer(item)) continue;
      const locked = isUnidentified(item);
      // A written scroll says whose Test it is (08 §14; D-1436): *Written at 17 (DC 12)*.
      const scroll = isScroll(item);
      list.forEach((s, index) => {
        const max = s.uses?.max ?? 0;
        const value = s.uses?.value ?? 0;
        const written = scroll && Number.isInteger(s.writerTotal);
        rows.push({
          itemId: item.id, index, name: s.name, itemName: shownName(item),
          dcLabel: written
            ? game.i18n.format("AZEROTH.Scroll.WrittenAt", { total: s.writerTotal, dc: writtenDC(item) })
            : (s.dc != null ? game.i18n.format("AZEROTH.Sheet.ItemSpellDC", { dc: s.dc }) : game.i18n.localize("AZEROTH.Forge.BearersDC")),
          // Consumed by reading, never by its uses: no count and no stepper (08 §14).
          written,
          limited: !written && max > 0, value, max, full: value >= max,
          perLabel: s.uses?.per ? game.i18n.localize(AZEROTH.usesPer?.[s.uses.per] ?? s.uses.per) : "",
          available: !locked && (max === 0 || value > 0),
          locked,
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
   * profession (D-1906). The purse is checked here, not trusted from the button; the
   * spend is ledgered.
   */
  static async #onBuyRank(event, target) {
    const key = target.dataset.skill;
    // **ONE XP WRITE AT A TIME** (the final review's minor 7): the read and the write run as one
    // task in the profession's queue (`profession-workflows.mjs#xpWrite`), so a profession Rank
    // raised in the same round trip is never written over. The skill, its Rank and the purse are
    // read when the task's turn comes.
    return xpWrite(this.actor, () => {
      const skill = this.#skills().find(s => s.key === key);
      if (!skill || skill.rank >= RANK_MAX) return null;
      const cost = rankCost(skill.rank + 1, skill.inProfession === true);
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
  // A San'layn's Long Rest asks for its blood first (02 §5; D-1144): `longRestWithDialog`.
  static async #onLongRest() { return longRestWithDialog(this.actor); }
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
      content: `<p>${game.i18n.format("AZEROTH.Sheet.DeleteConfirm", { name: shownName(item) })}</p>`,
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

  /* -------------------------------------------- */
  /*  The Profession tab (D11 §12)                 */
  /* -------------------------------------------- */

  /**
   * The picks drafted on the strip, not yet confirmed: `{[tier]: [skill]}`. VIEW STATE, as the
   * open branch is - a pick is permanent once confirmed, so a mis-click must not write it.
   */
  #pickDraft = {};

  /** The recipe picked in the Crafting view (its uuid), view state. */
  #recipeSel = null;

  /**
   * The picked recipe's quality: `{uuid, rarity, prefix, suffix, signature}` (affix ids, and the id
   * of a Signature row picked from the list the door offers; D-1990: chosen from a list, never
   * typed, and no Legendary item's Signature).
   */
  #quality = null;

  /** The Crafting view's filters (D-1927), view state: a search, Have materials, a tier, a kind. */
  #craftFilters = { search: "", have: false, tier: "all", kind: "all" };

  /** The gathering node picked, and the item picked to disenchant, view state. */
  #gatherNode = null;
  #disenchantSel = null;

  /** Enchanting's *Lay an enchantment* choice: `{itemId, affixId}`, view state. */
  #enchantSel = { itemId: null, affixId: null };

  /** Every card's context from the last render, by recipe uuid, so a pick can redraw one in place. */
  #cardContexts = new Map();

  /** The element the Profession tab's listeners are bound to, once per frame. */
  #professionBoundFor = null;

  /** The Profession tab's presses, one at a time each (`profession-sheet.mjs#pressGuard`). */
  #presses = pressGuard();

  /** The deferred part's render, started by `changeTab`, for `showProfession` to await. */
  #professionRender = null;

  /** The search box's debounce. */
  #professionSearchTimer = null;

  /** *Journeyman Blacksmith* (the plan's M1): the rung of the character's tier and the profession's agent noun. */
  #professionLine(item) {
    const rung = rungFor(this.actor.professionTier);
    const id = item.system?.identifier ?? null;
    const agent = AZEROTH.professionAgents?.[id] ? game.i18n.localize(AZEROTH.professionAgents[id]) : item.name;
    return game.i18n.format("AZEROTH.Profession.Sheet.Line", { rung: game.i18n.localize(AZEROTH.rungs[rung.key]), agent });
  }

  /** The tab's view, off the reader's own flag (D11 §12). */
  #professionView() {
    return viewOf(game.user?.getFlag("azeroth-rpg", VIEW_FLAG));
  }

  /** A localized ability, skill or rarity label. */
  #label(table, key) {
    const k = table?.[key];
    return k ? game.i18n.localize(k) : String(key ?? "");
  }

  /** One part of a Test's modifier in words: `Strength +3`, `Rank 4`, `Rare tool +2` (D-1926: never Proficiency). */
  #partWords(part, { ability = null, abbr = false } = {}) {
    if (part.key === "ability") {
      const label = abbr ? game.i18n.localize(String(AZEROTH.abilities[ability] ?? "").replace(/\.Label$/, ".Abbr")) : this.#label(AZEROTH.abilities, ability);
      return game.i18n.format("AZEROTH.Profession.Sheet.Part.Ability", { ability: label, value: signedText(part.value) });
    }
    if (part.key === "rank") return game.i18n.format("AZEROTH.Profession.Sheet.Part.Rank", { value: part.value });
    return game.i18n.format("AZEROTH.Profession.Sheet.Part.Tool", { rarity: this.#label(AZEROTH.rarities, part.rarity), value: signedText(part.value) });
  }

  /**
   * **THE PROFESSION TAB'S CONTEXT** (D11 §12). With `full` false the header and the picks owed
   * alone (D-1982); with it, the view the reader's flag names: the Overview (Rank, tiers, skills,
   * tool, gathering, Disenchant, projects) or the Crafting view (projects, Lay an enchantment, the
   * filtered recipe list and one card a recipe).
   */
  async #profession({ full = false } = {}) {
    const actor = this.actor;
    const item = actor.professionItem;
    const domId = `azeroth-prof-${actor.id}`;
    if (!item) return { none: true, domId, canChoose: this.isEditable };
    const sys = item.system ?? {};
    const id = sys.identifier ?? null;
    const row = PROFESSION_BY_ID[id] ?? null;
    const tier = actor.professionTier;
    const rung = rungFor(tier);
    const ability = sys.ability ?? row?.ability ?? "int";
    const tool = actor.professionTool();
    const parts = bonusParts({
      abilityMod: actor.system?.abilities?.[ability]?.mod ?? 0,
      rank: Math.trunc(Number(sys.rank)) || 0,
      toolRarity: tool?.rarity ?? null,
      toolCarried: Boolean(tool)
    });
    const bonus = parts.reduce((n, p) => n + p.value, 0);
    const view = this.#professionView();
    const out = {
      none: false, domId, id, name: item.name, img: item.img,
      editable: this.isEditable,
      view, overview: view === "overview", crafting: view === "crafting",
      headerLine: game.i18n.format("AZEROTH.Profession.Sheet.Header", {
        rung: game.i18n.localize(AZEROTH.rungs[rung.key]), tier, ability: this.#label(AZEROTH.abilities, ability), bonus: signedText(bonus)
      }),
      bonusText: signedText(bonus),
      breakdown: parts.map(p => this.#partWords(p, { ability })).join(" + "),
      strips: this.#pickStripsContext(sys, tier, rung),
      deferred: !full
    };
    if (!full) return out;
    const materials = await professionMaterials();
    if (view === "crafting") Object.assign(out, await this.#craftingContext({ sys, id, row, tier, bonus, parts, ability, tool, materials, domId }));
    else Object.assign(out, await this.#overviewContext({ sys, id, row, tier, bonus, tool, materials, domId }));
    return out;
  }

  /** The *choose 2 profession skills* strips (D-1906), the draft laid over the stored picks. */
  #pickStripsContext(sys, tier) {
    // A stored pick retires its drafted twin, so a confirmed tier's draft never lingers.
    return pickStrips({ profession: sys, tier, picks: sys.picks ?? null, draft: this.#pickDraft }).map(strip => ({
      tier: strip.tier,
      title: game.i18n.format("AZEROTH.Profession.Sheet.Strip.Title", { tier: strip.tier }),
      hint: game.i18n.format("AZEROTH.Profession.Sheet.Strip.Hint", { rung: game.i18n.localize(AZEROTH.rungs[rungFor(strip.tier).key]) }),
      options: strip.options.map(o => ({ ...o, label: this.#label(AZEROTH.skills, o.skill) })),
      ready: strip.ready,
      owedWords: game.i18n.format("AZEROTH.Profession.Sheet.Strip.Owed", { n: strip.owed })
    }));
  }

  /** The Overview view (the plan's M2). */
  async #overviewContext({ sys, id, row, tier, bonus, tool, materials, domId }) {
    const actor = this.actor;
    const rank = rankView({ rank: sys.rank, purse: unspent(actor.system?.xp ?? {}) });
    const rows = skillTierRows({ profession: sys, tier, picks: sys.picks ?? null });
    const toolId = row?.tool ?? sys.tools?.[0] ?? null;
    const toolRarity = tool?.rarity ?? "common";
    const projects = projectsOf(actor);
    const out = {
      rank: {
        ...rank,
        ofWords: game.i18n.format("AZEROTH.Profession.Sheet.Rank.Of", { max: rank.max }),
        raiseLabel: rank.next === null
          ? game.i18n.format("AZEROTH.Profession.Sheet.Rank.AtTop", { max: rank.max })
          : game.i18n.format("AZEROTH.Profession.Sheet.Rank.Raise", { rank: rank.next, cost: professionRankCost(rank.next) }),
        refusalWords: rank.refusal === "top" ? game.i18n.format("AZEROTH.Profession.Sheet.Rank.Top", { max: rank.max })
          : rank.refusal === "purse" ? game.i18n.format("AZEROTH.Profession.Sheet.Rank.Purse", { purse: rank.purse, cost: rank.cost })
          : null
      },
      ladder: ladderRows(tier).map(r => ({
        ...r,
        label: game.i18n.localize(AZEROTH.rungs[r.key]),
        line: game.i18n.format("AZEROTH.Profession.Sheet.Tiers.Row", { tier: r.tier, min: r.minLevel, max: r.maxLevel }),
        state: r.held ? game.i18n.localize("AZEROTH.Profession.Sheet.Tiers.Held") : game.i18n.format("AZEROTH.Profession.Sheet.Tiers.Opens", { level: r.minLevel })
      })),
      skills: {
        countWords: game.i18n.format("AZEROTH.Profession.Sheet.Skills.Count", { held: heldSkillCount(rows), max: SKILLS_AT_TIER_FOUR }),
        rows: rows.map(r => ({
          state: r.state,
          tierLabel: game.i18n.format("AZEROTH.Profession.Sheet.Skills.Tier", { tier: r.tier }),
          stateWords: r.state === "fixed" ? game.i18n.localize("AZEROTH.Profession.Sheet.Skills.Fixed")
            : r.state === "picked" ? game.i18n.localize("AZEROTH.Profession.Sheet.Skills.Picked")
            : r.state === "owed" ? game.i18n.format("AZEROTH.Profession.Sheet.Skills.Owed", { n: Math.max(0, 2 - r.skills.length) })
            : game.i18n.format("AZEROTH.Profession.Sheet.Skills.Locked", { level: r.minLevel, skills: r.listed.map(k => this.#label(AZEROTH.skills, k)).join(", ") }),
          chips: r.skills.map(k => this.#label(AZEROTH.skills, k))
        }))
      },
      tool: {
        name: tool?.item?.name ?? materials[toolId]?.name ?? toolId ?? "",
        img: tool?.item?.img ?? materials[toolId]?.img ?? null,
        rarityClass: toolRarity === "common" ? "" : rarityClass(toolRarity),
        line: game.i18n.format("AZEROTH.Profession.Sheet.Tool.Line", { rarity: this.#label(AZEROTH.rarities, toolRarity), price: coins(toolPrice(toolRarity) ?? 0) }),
        carried: Boolean(tool),
        bonusText: signedText(toolBonus(toolRarity))
      },
      summary: projects.length ? {
        heading: game.i18n.format("AZEROTH.Profession.Sheet.Project.Summary", { n: projects.length }),
        rows: projects.map(p => ({
          name: p.name,
          rarityClass: p.rarity && p.rarity !== "common" ? rarityClass(p.rarity) : "",
          line: game.i18n.format("AZEROTH.Profession.Sheet.Project.SummaryLine", {
            profession: this.#label(AZEROTH.professions, p.trade), run: p.run < 0 ? signedText(p.run) : p.run, target: p.target, tests: p.tests
          })
        }))
      } : null,
      harvest: this.#harvestContext(id, domId)
    };
    const family = row?.gathers?.family ?? sys.gathers?.family ?? null;
    if (family === "essence") out.disenchant = this.#disenchantContext({ tool, materials, domId });
    else if (family) out.gather = await this.#gatherContext({ family, tier, domId, materials });
    return out;
  }

  /** What a defeated creature gives this profession, in words, or null (D-1915). */
  #harvestWords(id) {
    const kinds = Object.entries(HARVEST).filter(([, h]) => h.profession === id).map(([kind]) => kind);
    if (!kinds.length) return null;
    return kinds.map(kind => game.i18n.localize(`AZEROTH.Profession.Sheet.Harvest.Explain.${kind}`)).join(" ");
  }

  /** A harvest refused, in words (D-681): the creature's type, a harvest already taken, its tier, or the tool. */
  #harvestReason(k, materials = {}) {
    if (k.reason === "kind") {
      return game.i18n.format("AZEROTH.Profession.Sheet.Harvest.Refuse.Kind", {
        verb: this.#label(AZEROTH.harvestKinds, k.kind), types: k.allowed.map(t => this.#label(AZEROTH.creatureTypes, t)).join(", ")
      });
    }
    if (k.reason === "done") return game.i18n.localize("AZEROTH.Profession.Sheet.Harvest.Refuse.Done");
    if (k.reason === "tier") return refusalWords({ reason: "harvestTier", tier: k.tier }, { materials });
    return null;
  }

  /**
   * **THE HARVEST CARD** (D-1996; the lead: make Skin, Butcher and Salvage reachable). The DEFEATED
   * creatures this user has targeted, each with the profession's harvests (`harvestRows`), a refused
   * one greyed with its reason in words; one line when nothing defeated is targeted. Each press is
   * `workflows.harvest` with the token as the target. A profession that harvests nothing has none.
   */
  #harvestContext(id, domId) {
    const words = this.#harvestWords(id);
    if (!words) return null;
    const tool = this.actor.professionTool();
    const creatures = [...(game.user?.targets ?? [])].map(token => ({
      ...harvestSnapshotOf(token),
      id: token.document?.uuid ?? token.id,
      name: token.document?.name ?? token.name ?? ""
    }));
    const rows = harvestRows({ creatures, profession: id, tier: this.actor.professionTier });
    const toolWords = tool ? null : refusalWords({ reason: "tool", tool: PROFESSION_BY_ID[id]?.tool ?? null });
    return {
      words,
      toolWords,
      rows: rows.map(r => ({
        uuid: r.id,
        name: r.name,
        kinds: r.kinds.map(k => ({
          kind: k.kind,
          id: `${domId}-harvest-${r.id.replace(/[^A-Za-z0-9_-]/g, "_")}-${k.kind}`,
          label: this.#label(AZEROTH.harvestKinds, k.kind),
          ok: k.ok && Boolean(tool) && this.isEditable,
          reason: this.#harvestReason(k)
        }))
      }))
    };
  }

  /** The Gather card by biome (D-1915): the biome the GM named, the nodes at the tier and below, the Test. */
  async #gatherContext({ family, tier, domId, materials }) {
    const actor = this.actor;
    const stored = game.user?.getFlag("azeroth-rpg", BIOME_FLAG);
    const biome = BIOME_KEYS.includes(stored) ? stored : null;
    const nodes = biome ? nodesIn({ biome, family, tier }) : [];
    if (!nodes.some(n => n.material === this.#gatherNode)) this.#gatherNode = nodes[0]?.material ?? null;
    const snap = await gatherSnapshot(actor, { biome, material: this.#gatherNode });
    const skill = snap.skill ?? GATHER_SKILL[family] ?? null;
    const ability = skill ? AZEROTH.skillAbility[skill] : null;
    const total = (snap.parts ?? []).reduce((n, p) => n + (Number(p.value) || 0), 0);
    // Every grey says why (D-681): no biome picked yet, no node in it (the empty list's own words),
    // or the door's own refusal beside Gather.
    const refusal = snap.ok ? null
      : !biome ? game.i18n.localize("AZEROTH.Profession.Sheet.Gather.PickBiome")
      : snap.refusal?.reason === "noNode" ? null
      : snap.words;
    return {
      heading: game.i18n.format("AZEROTH.Profession.Sheet.Gather.Heading", { family: this.#label(AZEROTH.gatherFamilies, family) }),
      biome,
      biomes: BIOME_KEYS.map(key => ({ key, label: this.#label(AZEROTH.biomes, key), selected: key === biome })),
      nodes: nodes.map(n => ({
        ...n,
        id: `${domId}-node-${n.material}`,
        name: materials[n.material]?.name ?? n.material,
        img: materials[n.material]?.img ?? null,
        checked: n.material === this.#gatherNode,
        tierWords: game.i18n.format("AZEROTH.Profession.Sheet.Gather.Node", { tier: n.tier, dc: n.dc })
      })),
      emptyWords: biome ? game.i18n.format("AZEROTH.Profession.Sheet.Gather.Empty", { biome: this.#label(AZEROTH.biomes, biome) }) : "",
      testWords: game.i18n.format("AZEROTH.Profession.Sheet.Gather.Test", { skill: this.#label(AZEROTH.skills, skill), bonus: signedText(total) }),
      partsWords: game.i18n.format("AZEROTH.Profession.Sheet.Gather.Parts", {
        parts: (snap.parts ?? []).map(p => this.#partWords({ key: p.key, value: p.value, rarity: actor.professionTool()?.rarity }, { ability, abbr: true })).join(" + ")
      }),
      wellFed: isWellFed(actor.effects),
      canPress: this.isEditable && snap.ok,
      refusal
    };
  }

  /** Enchanting's Gather card is Disenchant (D-1915, D-1933): what may be taken apart, the Arcana line, the yields. */
  #disenchantContext({ tool, materials, domId }) {
    const actor = this.actor;
    const choices = disenchantChoices(actor.items);
    if (!choices.some(i => i.id === this.#disenchantSel)) this.#disenchantSel = choices[0]?.id ?? null;
    const parts = bonusParts(gatherInputs({ abilities: actor.system?.abilities, ranks: actor.getFlag("azeroth-rpg", "skillRanks") ?? {} },
      "arcana", AZEROTH.skillAbility.arcana, tool));
    const total = parts.reduce((n, p) => n + p.value, 0);
    const toolId = PROFESSION_BY_ID.enchanting.tool;
    return {
      domId,
      hint: game.i18n.format("AZEROTH.Profession.Sheet.Disenchant.Hint", { bonus: signedText(total) }),
      partsWords: game.i18n.format("AZEROTH.Profession.Sheet.Gather.Parts", {
        parts: parts.map(p => this.#partWords(p, { ability: AZEROTH.skillAbility.arcana, abbr: true })).join(" + ")
      }),
      choices: choices.map(i => ({ id: i.id, label: game.i18n.format("AZEROTH.Profession.Sheet.Disenchant.Option", { name: shownName(i), rarity: this.#label(AZEROTH.rarities, i.system?.rarity) }), selected: i.id === this.#disenchantSel })),
      canPress: this.isEditable && Boolean(tool) && choices.length > 0,
      refusal: tool ? null : refusalWords({ reason: "tool", tool: toolId }, { materials }),
      yields: Object.entries(DISENCHANT_YIELD).map(([rarity, material]) =>
        game.i18n.format("AZEROTH.Profession.Sheet.Disenchant.Yield", { rarity: this.#label(AZEROTH.rarities, rarity), name: materials[material]?.name ?? material }))
    };
  }

  /** The Crafting view (the plan's M3 to M5). */
  async #craftingContext({ sys, id, tier, bonus, parts, ability, tool, materials, domId }) {
    const actor = this.actor;
    const [bases, traits, affixes] = await Promise.all([professionRecipes(id), professionTraits(), professionAffixes()]);
    const have = materialCounts(actor.items);
    const downtime = downtimeState();
    const fed = isWellFed(actor.effects);
    const groups = recipesFor(id, bases, tier);
    const known = new Set(groups.flatMap(g => g.recipes.map(r => r.item.uuid)));
    if (this.#recipeSel && !known.has(this.#recipeSel)) this.#recipeSel = null;
    if (this.#quality && this.#quality.uuid !== this.#recipeSel) this.#quality = null;

    // One card a recipe, judged by the laws the door judges by (D-1981); the picked one whole.
    const cards = [];
    const listGroups = [];
    for (const group of groups) {
      const label = group.localize ? game.i18n.localize(group.label) : group.label;
      const rows = [];
      for (const { item } of group.recipes) {
        const card = recipeCard({ base: item, trade: id, tier, materials, have, toolCarried: Boolean(tool), downtime, bonus });
        rows.push({ id: item.uuid, name: item.name, img: item.img, tier: craftsOf(item).find(s => s.trade === id)?.tier ?? 1, makeable: card.makeable });
        cards.push({ item, card, label });
      }
      listGroups.push({ key: group.key, label, localize: false, recipes: rows });
    }
    const open = openGroups(game.user?.getFlag("azeroth-rpg", OPEN_FLAG), id);
    const filtered = filterRecipes({ groups: listGroups, filters: this.#craftFilters, open });

    this.#cardContexts = new Map();
    const cardContexts = [];
    for (const { item, card, label } of cards) {
      const context = item.uuid === this.#recipeSel
        ? await this.#pickedCard({ item, label, id, tier, bonus, parts, ability, tool, materials, affixes, traits, fed, domId })
        : await this.#cardContext({ item, label, card, id, parts, ability, tool, materials, traits, fed, domId, bonus });
      this.#cardContexts.set(item.uuid, { item, label, card, context });
      cardContexts.push(context);
    }

    const projects = projectSplit(projectsOf(actor), id);
    return {
      selected: this.#recipeSel,
      cards: cardContexts,
      groups: filtered.groups.map(g => ({
        ...g,
        countWords: game.i18n.format("AZEROTH.Profession.Sheet.List.Count", { n: g.count }),
        makeableWords: game.i18n.format("AZEROTH.Profession.Sheet.List.CanMake", { n: g.makeable }),
        recipes: g.recipes.map(r => ({
          ...r,
          domId: `${domId}-row-${r.id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
          selected: r.id === this.#recipeSel,
          tierWords: game.i18n.format("AZEROTH.Profession.Sheet.Row.Tier", { tier: r.tier }),
          makeableWords: game.i18n.format("AZEROTH.Profession.Sheet.Row.Makeable", { n: r.makeable }),
          makeableTip: r.makeable
            ? game.i18n.format("AZEROTH.Profession.Sheet.Row.MakeableTip", { n: r.makeable })
            : game.i18n.localize("AZEROTH.Profession.Sheet.Row.NoneTip")
        }))
      })),
      filters: {
        ...this.#craftFilters,
        active: filtered.active,
        tierOptions: tierOptions(tier).map(t => ({ value: String(t), label: game.i18n.format("AZEROTH.Profession.Sheet.Filter.Tier", { tier: t }), selected: String(this.#craftFilters.tier) === String(t) })),
        kindOptions: kindOptions(listGroups).map(k => ({ key: k.key, label: k.label, selected: this.#craftFilters.kind === k.key }))
      },
      projects: {
        cards: projects.mine.map(p => this.#projectContext(p, { id, bonus, tool, fed })),
        othersWords: projects.others ? game.i18n.format("AZEROTH.Profession.Sheet.Project.Others", { n: projects.others }) : ""
      },
      enchant: id === "enchanting" ? this.#enchantContext({ tier, affixes, traits, tool, materials }) : null
    };
  }

  /** A trait chip (D-1928): its tooltip is 08 §5's entry, read through a parameter, from the trait pack. */
  #traitChip(name, traits) {
    const hit = traitEntry(name, traits);
    if (!hit) return { name, tip: null, aria: name };
    const sys = hit.entry?.system ?? {};
    const meta = [];
    if (sys.kind && AZEROTH.traitKinds?.[sys.kind]) meta.push(game.i18n.format("AZEROTH.Profession.Sheet.Trait.Kind", { kind: game.i18n.localize(AZEROTH.traitKinds[sys.kind]) }));
    if (sys.firesOn) meta.push(game.i18n.format("AZEROTH.Profession.Sheet.Trait.Fires", { when: sys.firesOn }));
    const escape = foundry.utils.escapeHTML;
    const description = String(sys.description ?? "");
    const tip = `<div class="azeroth-trait-tip"><strong>${escape(hit.name)}</strong>${meta.length ? ` <em>${escape(meta.join(" · "))}</em>` : ""}${description}</div>`;
    const plain = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return { name, tip, aria: `${name}: ${plain}` };
  }

  /**
   * A picked prefix's or suffix's chip, set beside the item's own traits (the lead, 2026-11-24): the
   * keyword (*of the Stag* reads *Stag*) and, on hover or focus, the affix's whole name, its kind and
   * cost, what it gives and where it goes. Where what it gives names a trait (*Keen (Lesser)*), 08
   * section 5's entry for it follows. Read off the pool's own row, never typed.
   */
  #affixChip(affix, kind, traits) {
    const escape = foundry.utils.escapeHTML;
    const kindWord = game.i18n.localize(kind === "prefix" ? "AZEROTH.Profession.Sheet.Quality.Prefix" : "AZEROTH.Profession.Sheet.Quality.Suffix");
    const meta = game.i18n.format("AZEROTH.Profession.Sheet.Affix.Meta", { kind: kindWord, cost: affixCost(affix) });
    const grants = String(affix.grants ?? "").trim();
    const goesOn = String(affix.goesOn ?? "").trim();
    const rule = grants ? traitEntry(grants, traits) : null;
    const ruleText = String(rule?.entry?.system?.description ?? "");
    const lines = [
      grants ? `<p>${escape(game.i18n.format("AZEROTH.Profession.Sheet.Affix.Grants", { grants }))}</p>` : "",
      ruleText,
      goesOn ? `<p>${escape(game.i18n.format("AZEROTH.Profession.Sheet.Affix.GoesOn", { goesOn }))}</p>` : ""
    ].join("");
    const name = affixChipName(affix.name);
    const plain = [grants, ruleText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean).join(". ");
    return {
      name,
      tip: `<div class="azeroth-trait-tip"><strong>${escape(affix.name)}</strong> <em>${escape(meta)}</em>${lines}</div>`,
      aria: `${affix.name}: ${plain || meta}`
    };
  }

  /** The words every card shares: the Extended Test, the target, the Craft Test, the time, the collapse risk. */
  #cardWords({ plan, expected, parts, ability, fed, interval }) {
    const view = expectedView(expected);
    const targets = Object.entries(TARGET_SL).map(([r, sl]) => game.i18n.format("AZEROTH.Profession.Sheet.Detail.TargetRow", { rarity: this.#label(AZEROTH.rarities, r), sl })).join(" · ");
    const total = parts.reduce((n, p) => n + p.value, 0);
    return {
      extendedWords: game.i18n.format("AZEROTH.Profession.Sheet.Detail.ExtendedValue", { dc: plan.dc, interval }),
      targetWords: game.i18n.format("AZEROTH.Profession.Sheet.Detail.TargetValue", { target: plan.target }),
      targetsWords: game.i18n.format("AZEROTH.Profession.Sheet.Detail.Targets", { targets }),
      craftTestWords: game.i18n.format(fed ? "AZEROTH.Profession.Sheet.Detail.CraftTestFed" : "AZEROTH.Profession.Sheet.Detail.CraftTestValue", {
        bonus: signedText(total), parts: parts.map(p => this.#partWords(p, { ability })).join(" + ")
      }),
      takesWords: view.tests === null
        ? game.i18n.localize("AZEROTH.Profession.Sheet.Detail.Never")
        : game.i18n.format("AZEROTH.Profession.Sheet.Detail.TakesValue", { tests: view.tests, interval }),
      collapseWords: game.i18n.format("AZEROTH.Profession.Sheet.Detail.CollapseValue", { pct: view.collapse })
    };
  }

  /** A hidden card's context, off `recipeCard` (D-1981). */
  async #cardContext({ item, label, card, id, parts, ability, tool, materials, traits, fed, domId }) {
    const interval = game.i18n.localize(AZEROTH.craftIntervals[card.plan.interval] ?? card.plan.interval);
    return {
      id: item.uuid,
      domId: `${domId}-card-${item.uuid.replace(/[^A-Za-z0-9_-]/g, "_")}`,
      selected: false,
      editable: this.isEditable,
      name: item.name,
      img: item.img,
      rarityClass: "",
      kindLine: game.i18n.format("AZEROTH.Profession.Sheet.Detail.Kind", { group: label, tier: card.plan.tier }),
      statLine: this.#statLine(item),
      traits: this.#itemChips(item, traits),
      description: await professionDescription(item),
      ...this.#cardWords({ plan: card.plan, expected: card.expected, parts, ability, fed, interval }),
      priceWords: coins(Number(item.system?.cost) || 0),
      quality: card.forgeable ? this.#qualityContext({ item, rarity: "common", tier: this.actor.professionTier, prefix: null, suffix: null, signature: null, affixes: null, signatures: [], forge: null, id, traits, cuts: card.cuts, cut: null }) : null,
      reagents: card.reagents.map(l => this.#reagentRow(l)),
      toolWords: this.#toolWords(id, tool, materials),
      refusals: card.refusals.map(r => refusalWords(r, { materials })),
      notes: [],
      ok: card.ok
    };
  }

  /**
   * **THE PICKED CARD, JUDGED WHOLE** (D-1981): `workflows.craftSnapshot` with the chosen quality,
   * the bag room included, which is the very reading `workflows.craft` refuses by.
   */
  async #pickedCard({ item, label, id, tier, parts, ability, tool, materials, affixes, traits, fed, domId }) {
    const q = this.#quality?.uuid === item.uuid ? this.#quality : { uuid: item.uuid, rarity: "common", prefix: null, suffix: null, signature: null, cut: null };
    const ceiling = raritiesFor(tier);
    const rarity = ceiling.includes(q.rarity) ? q.rarity : "common";
    const prefix = affixes.find(a => a.id === q.prefix) ?? null;
    const suffix = affixes.find(a => a.id === q.suffix) ?? null;
    const chosen = [prefix && { ...prefix, kind: "prefix" }, suffix && { ...suffix, kind: "suffix" }].filter(Boolean);
    let snap = await craftSnapshot(this.actor, { base: item, rarity, affixes: chosen, signature: this.#signatureOf(q, rarity), cut: q.cut ?? null });
    // A Cut picked while no Prefix row was drawn goes once a prefix can be picked again (D-2009):
    // the window never refuses a pick it no longer shows.
    if (q.cut && !snap.cuts.includes(q.cut)) {
      if (this.#quality?.uuid === item.uuid) this.#quality = { ...this.#quality, cut: null };
      snap = await craftSnapshot(this.actor, { base: item, rarity, affixes: chosen, signature: this.#signatureOf(q, rarity), cut: null });
    }
    const interval = game.i18n.localize(AZEROTH.craftIntervals[snap.plan.interval] ?? snap.plan.interval);
    const forgeOk = snap.forge?.ok === true && rarity !== "common";
    return {
      id: item.uuid,
      domId: `${domId}-card-${item.uuid.replace(/[^A-Za-z0-9_-]/g, "_")}`,
      selected: true,
      editable: this.isEditable,
      name: snap.name || item.name,
      img: item.img,
      rarityClass: rarity === "common" ? "" : rarityClass(rarity),
      kindLine: game.i18n.format("AZEROTH.Profession.Sheet.Detail.Kind", { group: label, tier: snap.plan.tier }),
      statLine: this.#statLine(item),
      // The item's own traits, then the picked prefix, suffix and Cut: each a chip with its tooltip.
      traits: [
        ...this.#itemChips(item, traits),
        ...(prefix ? [this.#affixChip(prefix, "prefix", traits)] : []),
        ...(suffix ? [this.#affixChip(suffix, "suffix", traits)] : []),
        ...(snap.cut && snap.cuts?.includes(snap.cut) ? [this.#cutRow(snap.cut, traits, true).chip] : [])
      ],
      description: await professionDescription(item),
      ...this.#cardWords({ plan: snap.plan, expected: snap.expected, parts, ability, fed, interval }),
      priceWords: coins(Number(snap.price) || 0),
      quality: snap.rows?.rarity ? this.#qualityContext({ item, rarity, tier, prefix, suffix, signature: q.signature, affixes, signatures: snap.signatures ?? [], forge: snap.forge, id, traits, rows: snap.rows, cuts: snap.cuts, cut: snap.cut }) : null,
      reagents: snap.reagents.map(l => this.#reagentRow(l)),
      toolWords: this.#toolWords(id, tool, materials),
      refusals: snap.words,
      notes: forgeOk && snap.ok ? (snap.forge.notes ?? []) : [],
      ok: snap.ok
    };
  }

  /**
   * The Forge's controls for a card (D-1929): Rarity up to the tier's ceiling, Prefix and Suffix
   * from Uncommon with ONLY the legal options (`affixChoices`), and from Rare a Signature picked
   * from the rows the door offers (`craftSnapshot().signatures`: already held to the item's type,
   * the rarity and the budget left, Legendary items' Signatures out; D-1990), each as its cost and
   * its words and never the item it comes from (D-2008). The Prefix row is drawn only where a prefix
   * may be picked; where none may and the item is a suit with no Cut of its own, a Cut row lists the
   * Cuts its category takes (D-2009), each with 08 section 5's words. A hidden card is drawn at
   * Common; its controls are live once it is picked.
   */
  #qualityContext({ item, rarity, tier, prefix, suffix, signature, affixes, signatures, forge, id, traits, rows = null, cuts = [], cut = null }) {
    const ceiling = RARITY_CEILING[Math.min(4, Math.max(1, tier))];
    const opened = rows ?? { rarity: true, prefix: false, suffix: false, signature: false };
    const label = a => game.i18n.format("AZEROTH.Profession.Sheet.Quality.Option", { name: a.name, cost: affixCost(a) });
    const pool = affixes ?? [];
    const sigRows = opened.signature ? signatureRows(signatures, signature) : [];
    // The affixes' budget is what the picked Signature leaves: its kind is what `affixChoices` prices.
    const sigKind = signatureRowOf(sigRows, signature)?.kind ?? null;
    const prefixes = opened.prefix ? affixChoices({ item, rarity, trade: id, kind: "prefix", affixes: pool, other: suffix, current: prefix, signature: sigKind }) : [];
    // A Prefix row with nothing to pick is not drawn (D-1929), and a Cut may then be offered (D-2009).
    const show = { ...opened, prefix: prefixRowDrawn(opened.prefix, prefixes), cut: (cuts ?? []).length > 0 };
    const cutRows = (cuts ?? []).map(key => this.#cutRow(key, traits, key === cut));
    return {
      hint: game.i18n.format("AZEROTH.Profession.Sheet.Quality.Hint", { rarity: this.#label(AZEROTH.rarities, ceiling) }),
      rows: show,
      rarities: raritiesFor(tier).map(r => ({ value: r, label: this.#label(AZEROTH.rarities, r), selected: r === rarity })),
      prefixes: show.prefix ? prefixes.map(a => ({ id: a.id, label: label(a), selected: a.id === prefix?.id })) : [],
      suffixes: show.suffix ? affixChoices({ item, rarity, trade: id, kind: "suffix", affixes: pool, other: prefix, current: suffix, signature: sigKind })
        .map(a => ({ id: a.id, label: label(a), selected: a.id === suffix?.id })) : [],
      // Each row in words: its cost and its words, clipped on the option and whole beneath the
      // select for the one picked (D-1990). Never the item it comes from (D-2008).
      signatures: sigRows.map(r => ({
        id: r.id, selected: r.selected,
        label: game.i18n.format("AZEROTH.Profession.Sheet.Quality.SignatureOption", { cost: r.cost, text: clip(r.text, 80) })
      })),
      signaturePicked: (() => {
        const row = signatureRowOf(sigRows, signature);
        return row ? { cost: game.i18n.format("AZEROTH.Profession.Sheet.Quality.SignatureCost", { cost: row.cost }), text: row.text } : null;
      })(),
      cuts: cutRows,
      cutFree: show.cut ? game.i18n.localize("AZEROTH.Profession.Sheet.Quality.CutFree") : null,
      legalWords: forge?.ok === true && rarity !== "common" ? game.i18n.format("AZEROTH.Profession.Sheet.Quality.Legal", { spent: forge.spent ?? 0 }) : null
    };
  }

  /**
   * One Cut the window offers (D-2009): its name and 08 section 5's words off the trait pack
   * (`traitEntry`), so the option reads *Long: Limb Armor Points +1. Bane on Athletics Tests to climb
   * or swim.* and its chip carries the same tooltip any trait does (D-1928). Never typed text: where
   * the pack has no entry the option is the Cut's name alone.
   */
  #cutRow(key, traits, selected = false) {
    const name = game.i18n.localize(AZEROTH.armorCuts?.[key] ?? key);
    const chip = this.#traitChip(name, traits);
    const hit = traitEntry(name, traits);
    const text = String(hit?.entry?.system?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return {
      value: key, selected,
      label: text ? game.i18n.format("AZEROTH.Profession.Sheet.Quality.CutOption", { name, text }) : name,
      chip
    };
  }

  /** An item's own traits as chips, then a suit's own Cuts (D-1928, D-2009): a Cut is a trait 08 section 5 defines. */
  #itemChips(item, traits) {
    const cutNames = ownCuts(item).map(c => game.i18n.localize(AZEROTH.armorCuts?.[c] ?? c));
    return traitTokens([...(item.system?.traits ?? []), ...cutNames]).map(t => this.#traitChip(t, traits));
  }

  /** A reagent line: `<have> / <need>`, and *short* or *enough* in words (never colour alone). */
  #reagentRow(line) {
    return {
      name: line.name ?? line.identifier,
      img: line.img ?? null,
      short: line.short > 0,
      need: line.need,
      haveWords: game.i18n.format(line.short > 0 ? "AZEROTH.Profession.Sheet.Detail.HaveShort" : "AZEROTH.Profession.Sheet.Detail.HaveEnough", { have: line.have, need: line.need })
    };
  }

  /** The tool line under the reagents: its name, carried or not, in words. */
  #toolWords(id, tool, materials) {
    const toolId = PROFESSION_BY_ID[id]?.tool ?? null;
    const name = tool?.item?.name ?? materials[toolId]?.name ?? toolId ?? "";
    return game.i18n.format(tool ? "AZEROTH.Profession.Sheet.Detail.ToolCarried" : "AZEROTH.Profession.Sheet.Detail.ToolMissing", { tool: name });
  }

  /** A weapon's, a suit's or a thing's stat line in words (`statParts`). */
  #statLine(item) {
    return statParts(item).map(p => game.i18n.format(`AZEROTH.Profession.Sheet.Stat.${p.key}`, { value: p.value })).join(" · ");
  }

  /** One stored project's card (the plan's M5). */
  #projectContext(p, { id, bonus, tool, fed }) {
    const refusal = testRefusal({ project: p, profession: id, toolCarried: Boolean(tool), ...downtimeState() });
    // A `delivering` project (a write lost after its item was made) is collected too (`collectable`).
    const ready = collectable(p);
    const view = expectedView(expectedFor({ bonus, dc: p.dc, target: p.target, run: p.run, wellFed: fed }));
    const interval = game.i18n.localize(AZEROTH.craftIntervals[p.interval] ?? p.interval ?? "");
    return {
      id: p.id,
      domId: `azeroth-prof-${this.actor.id}-project-${String(p.id).replace(/[^A-Za-z0-9_-]/g, "_")}`,
      name: p.name,
      editable: this.isEditable,
      rarityClass: p.rarity && p.rarity !== "common" ? rarityClass(p.rarity) : "",
      planWords: game.i18n.format("AZEROTH.Profession.Sheet.Project.Plan", { rarity: this.#label(AZEROTH.rarities, p.rarity), dc: p.dc, interval }),
      // The Cut the project will give the suit (D-2009), named so the card says what is being made.
      cutWords: p.quality?.cut ? game.i18n.format("AZEROTH.Profession.Sheet.Quality.CutChosen", { name: game.i18n.localize(AZEROTH.armorCuts?.[p.quality.cut] ?? p.quality.cut) }) : "",
      runningWords: game.i18n.format("AZEROTH.Profession.Sheet.Project.Running", { run: signedText(p.run), target: p.target, tests: p.tests }),
      fill: projectFill(p),
      chips: stepChips(p.log),
      expectedWords: ready ? "" : view.tests === null
        ? game.i18n.localize("AZEROTH.Profession.Sheet.Project.Never")
        : game.i18n.format("AZEROTH.Profession.Sheet.Project.Expected", { tests: view.tests, pct: view.collapse }),
      ready,
      refusal: !ready && refusal ? refusalWords({ ...refusal, tool: refusal.reason === "tool" ? (PROFESSION_BY_ID[id]?.tool ?? null) : undefined }) : null
    };
  }

  /** Enchanting's *Lay an enchantment* (08 §18; D-1929): the items, then only what the item can carry. */
  #enchantContext({ tier, affixes, traits, tool, materials }) {
    const items = this.actor.items
      .filter(i => forgeable(i) && !isClassicFind(i))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!items.some(i => i.id === this.#enchantSel.itemId)) this.#enchantSel = { itemId: items[0]?.id ?? null, affixId: null };
    const item = items.find(i => i.id === this.#enchantSel.itemId) ?? null;
    // ONLY WHAT THE DOOR ACCEPTS (D-1929; the review's M2): every choice the tier opens is asked
    // `recipes.mjs#enchantVerdict`, the reading `enchant` and `applyAffixInPlace` refuse by, so no
    // option is listed that the press would refuse. Where none is left, the first refusal says why.
    const data = item ? { name: item.name, type: item.type, system: item.system.toObject(), flags: item.toObject().flags ?? {} } : null;
    const verdicts = item ? enchantChoices({ item, tier, affixes }).map(a => ({ a, v: enchantVerdict({ item: data, affix: a, pool: affixes }) })) : [];
    const offered = verdicts.filter(x => x.v.ok).map(x => x.a);
    const barred = verdicts.find(x => !x.v.ok)?.v ?? null;
    if (!offered.some(a => a.id === this.#enchantSel.affixId)) this.#enchantSel.affixId = null;
    const affix = offered.find(a => a.id === this.#enchantSel.affixId) ?? null;
    const chip = affix ? this.#traitChip(affix.name, traits) : null;
    const refusal = !tool ? refusalWords({ reason: "tool", tool: PROFESSION_BY_ID.enchanting.tool }, { materials })
      : item && !offered.length && barred ? refusalWords(barred, { materials })
      : item && offered.length && !affix ? game.i18n.localize("AZEROTH.Profession.Sheet.Enchant.PickFirst")
      : null;
    return {
      items: items.map(i => ({ id: i.id, name: shownName(i), selected: i.id === this.#enchantSel.itemId })),
      affixes: offered.map(a => ({ id: a.id, label: game.i18n.format("AZEROTH.Profession.Sheet.Quality.Option", { name: a.name, cost: affixCost(a) }), selected: a.id === this.#enchantSel.affixId })),
      chip: chip?.tip ? chip : null,
      ready: this.isEditable && Boolean(item && affix && tool),
      refusal,
      // The empty list's own line is said only where no door refusal already says why.
      noAffix: Boolean(item) && !offered.length && !barred
    };
  }

  /* -------------------------------------------- */
  /*  The Profession tab's listeners               */
  /* -------------------------------------------- */

  /**
   * Everything the Profession tab needs that an `actions` entry cannot carry, DELEGATED ONCE per
   * rendered frame (the bags' pattern): the Forge's selects, the filters, the biome, the node and
   * the Disenchant and enchantment selects are `change` events on `data-prof-*` hooks (D-677); the
   * search box is debounced; a recipe group's toggle is remembered on the reader's flag; a trait
   * chip opens its tooltip on focus and Escape closes it (D-1928).
   */
  #bindProfession() {
    AzerothCharacterSheet.#hookProfessionGlobals();
    if (this.#professionBoundFor === this.element) return;
    this.#professionBoundFor = this.element;
    const root = this.element;
    const inTab = el => el?.closest?.('section[data-tab="profession"]');

    root.addEventListener("change", event => {
      const el = event.target;
      if (!inTab(el)) return;
      const ds = el.dataset ?? {};
      if (ds.profQuality) return this.#onQualityChange(ds.profQuality, el.value, ds.recipeId);
      if (ds.profFilter) {
        const key = ds.profFilter;
        if (key === "search") return null;
        this.#craftFilters = { ...this.#craftFilters, [key]: key === "have" ? el.checked === true : (el.value || "all") };
        return this.render({ parts: ["profession"] });
      }
      if (ds.profBiome !== undefined) return this.#setBiome(el.value);
      if (ds.profNode !== undefined) {
        this.#gatherNode = el.value || null;
        return this.render({ parts: ["profession"] });
      }
      if (ds.profDisenchant !== undefined) { this.#disenchantSel = el.value || null; return null; }
      if (ds.profEnchant) {
        if (ds.profEnchant === "item") this.#enchantSel = { itemId: el.value || null, affixId: null };
        else this.#enchantSel = { ...this.#enchantSel, affixId: el.value || null };
        return this.render({ parts: ["profession"] });
      }
      return null;
    });

    // The search re-renders on a pause, and core restores the box's focus and caret by its id.
    root.addEventListener("input", event => {
      const el = event.target;
      if (!inTab(el) || el.dataset?.profFilter !== "search") return;
      this.#craftFilters = { ...this.#craftFilters, search: el.value };
      clearTimeout(this.#professionSearchTimer);
      this.#professionSearchTimer = setTimeout(() => { if (this.rendered) this.render({ parts: ["profession"] }); }, 200);
    });

    // A group opened or closed by hand is remembered per profession and group (D-1927). A group
    // forced open by a filter is not written: closing the filter puts it back as the reader left it.
    root.addEventListener("toggle", event => {
      const details = event.target;
      if (!details?.matches?.("details[data-recipe-group]") || !inTab(details)) return;
      if (filtersActive(this.#craftFilters)) return;
      const id = this.actor.professionItem?.system?.identifier;
      if (!id) return;
      const stored = game.user?.getFlag("azeroth-rpg", OPEN_FLAG);
      const isOpen = openGroups(stored, id).includes(details.dataset.recipeGroup);
      if (isOpen === details.open) return;
      void game.user?.setFlag("azeroth-rpg", OPEN_FLAG, withGroupOpen(stored, id, details.dataset.recipeGroup, details.open)).catch(() => null);
    }, true);

    // A trait chip: focus opens its tooltip as a hover does, blur and Escape close it. Escape is
    // kept from core, which would otherwise close the whole sheet (D-758).
    root.addEventListener("focusin", event => {
      const chip = event.target.closest?.("[data-prof-trait]");
      if (chip && inTab(chip)) game.tooltip?.activate?.(chip);
    });
    root.addEventListener("focusout", event => {
      if (event.target.closest?.("[data-prof-trait]") && game.tooltip?.element === event.target) game.tooltip.deactivate();
    });
  }

  static #profGlobalsHooked = false;

  /**
   * Two listeners the whole class shares, bound once: a target change re-draws an open Profession
   * tab (the Harvest card lists what the user targets, D-1996), and Escape with a trait chip's
   * tooltip open closes THAT and nothing else. Core reads Escape on the window as *dismiss* and
   * closes every window when focus is on the body, so the capture listener on the document stops
   * it before core sees it, whether the tooltip came from focus or a hover (D-1928).
   */
  static #hookProfessionGlobals() {
    if (AzerothCharacterSheet.#profGlobalsHooked) return;
    AzerothCharacterSheet.#profGlobalsHooked = true;
    Hooks.on("targetToken", user => {
      if (user !== game.user) return;
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof AzerothCharacterSheet && app.rendered && app.tabGroups.primary === "profession") app.render({ parts: ["profession"] });
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const chip = game.tooltip?.element ?? null;
      if (!chip?.matches?.("[data-prof-trait]")) return;
      event.preventDefault();
      event.stopPropagation();
      game.tooltip.deactivate();
    }, true);
  }

  /** Show the picked recipe's card and light its row, with no render (D-738's pattern). */
  #applyRecipe() {
    const section = this.element?.querySelector('section[data-tab="profession"]');
    if (!section) return;
    const id = this.#recipeSel;
    let found = false;
    for (const card of section.querySelectorAll(".azeroth-prof-detail[data-recipe-card]")) {
      const on = card.dataset.recipeCard === id;
      card.hidden = !on;
      if (on) found = true;
    }
    for (const row of section.querySelectorAll(".azeroth-prof-row[data-recipe-id]")) {
      const on = row.dataset.recipeId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-pressed", String(on));
    }
    const hint = section.querySelector(".azeroth-prof-pickhint");
    if (hint) hint.hidden = found;
  }

  /** The view switched: the reader's flag, then the part (D11 §12). */
  async #setProfessionView(view, { render = true } = {}) {
    const next = viewOf(view);
    await game.user?.setFlag("azeroth-rpg", VIEW_FLAG, next).catch(() => null);
    if (render) return this.render({ parts: ["profession"] });
    return null;
  }

  /** The biome the GM named, on the reader's flag (D-1915). */
  async #setBiome(biome) {
    const value = BIOME_KEYS.includes(biome) ? biome : null;
    this.#gatherNode = null;
    await game.user?.setFlag("azeroth-rpg", BIOME_FLAG, value).catch(() => null);
    return this.render({ parts: ["profession"] });
  }

  /** The Signature a quality carries, as the door takes it (`{id}`, a row the door offered), or null; none at Common (D-1990). */
  #signatureOf(q, rarity = q?.rarity) {
    if (!q?.signature || !rarity || rarity === "common") return null;
    return { id: q.signature };
  }

  /** A Forge control changed on the picked card: the quality, then the part. */
  async #onQualityChange(field, value, recipeId) {
    if (!recipeId) return null;
    const q = this.#quality?.uuid === recipeId ? { ...this.#quality } : { uuid: recipeId, rarity: "common", prefix: null, suffix: null, signature: null, cut: null };
    // A rarity change clears the affixes and the Signature; a Cut costs nothing and stays while it is
    // still offered (`#pickedCard` drops it where a Prefix row comes back).
    if (field === "rarity") Object.assign(q, { rarity: value || "common", prefix: null, suffix: null, signature: null });
    else q[field] = value || null;
    this.#recipeSel = recipeId;
    this.#quality = q;
    return this.render({ parts: ["profession"] });
  }

  /* -------------------------------------------- */
  /*  The Profession tab's actions                 */
  /* -------------------------------------------- */

  static async #onProfessionView(event, target) {
    return this.#setProfessionView(target.dataset.view);
  }

  /**
   * *Choose a profession* (the plan's M1): the compendium browser in pick mode on the professions
   * pack (D-645). The pick embeds the profession; `AzerothActor#_onCreateDescendantDocuments`
   * makes it THE profession, replaces any other with its Rank (03 §4) and clears the owed flag.
   */
  static async #onChooseProfession() {
    if (!this.isEditable) return null;
    const { AzerothCompendiumBrowser } = await import("./compendium-browser.mjs");
    return AzerothCompendiumBrowser.browse({
      category: "professions",
      pick: {
        title: game.i18n.localize("AZEROTH.Profession.Sheet.Choose"),
        onPick: async doc => {
          if (doc?.type !== "profession") {
            ui.notifications?.warn(game.i18n.format("AZEROTH.Profession.Sheet.NotProfession", { name: doc?.name ?? "" }));
            return null;
          }
          // The door judges it a profession and embeds it with its source (`workflows.chooseProfession`).
          return this.#presses.run("chooseProfession", () => chooseProfession(this.actor, { uuid: doc.uuid }));
        }
      }
    });
  }

  /**
   * A chip on the picks strip toggled (D-1906): a DRAFT, judged by `pickRefusal` against the
   * stored picks plus the draft before an add. Nothing is written until Confirm.
   */
  static async #onPickProfessionSkill(event, target) {
    const item = this.actor.professionItem;
    if (!item || !this.isEditable) return null;
    const tier = Number(target.dataset.pickTier);
    const skill = target.dataset.skill;
    const drafted = (this.#pickDraft[tier] ?? []).includes(skill);
    if (!drafted) {
      const merged = mergedPicks({ profession: item.system, picks: item.system.picks, draft: this.#pickDraft, pickTier: tier });
      const refusal = pickRefusal({ profession: item.system, tier: this.actor.professionTier, picks: { ...(item.system.picks ?? {}), [tier]: merged }, pickTier: tier, skill });
      if (refusal) {
        ui.notifications?.warn(game.i18n.format(AZEROTH.professionRefusals[refusal.reason] ?? "AZEROTH.Profession.Refuse.NotListed", refusal));
        return null;
      }
    }
    this.#pickDraft = toggleDraft(this.#pickDraft, tier, skill);
    return this.render({ parts: ["profession"] });
  }

  /**
   * Confirm a tier's two picks (D-1906) through `workflows.pickProfessionSkill`, which judges them
   * again (`pickPlan`) and writes them in one update inside the actor's queue. A second press while
   * the first is unanswered does nothing (`pressGuard`).
   */
  static async #onConfirmProfessionPicks(event, target) {
    const item = this.actor.professionItem;
    if (!item || !this.isEditable) return null;
    const tier = Number(target.dataset.pickTier);
    const owed = owedPicks({ profession: item.system, tier: this.actor.professionTier, picks: item.system.picks });
    if (!owed.some(o => o.tier === tier)) return null;
    const merged = mergedPicks({ profession: item.system, picks: item.system.picks, draft: this.#pickDraft, pickTier: tier });
    if (merged.length !== 2) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Profession.Sheet.Strip.Owed", { n: 2 - merged.length }));
      return null;
    }
    const written = await this.#presses.run(`picks:${tier}`, () => pickProfessionSkill(this.actor, { tier, skills: merged }));
    if (!written) return null;
    this.#pickDraft = { ...this.#pickDraft, [tier]: [] };
    ui.notifications?.info(game.i18n.format("AZEROTH.Profession.Sheet.Strip.Chosen", { tier, skills: written.map(k => this.#label(AZEROTH.skills, k)).join(", ") }));
    return written;
  }

  /**
   * Raise the profession's Rank (D-1905) through `workflows.raiseProfessionRank`: the cheap rate,
   * judged off the purse and ledgered inside the actor's queue, the Rank written before the XP. A
   * second press while the first is unanswered does nothing (`pressGuard`; the review's M1: a
   * double click charged twice when the sheet wrote it itself).
   */
  static async #onRaiseProfessionRank() {
    if (!this.actor.professionItem || !this.isEditable) return null;
    return this.#presses.run("raiseRank", () => raiseProfessionRank(this.actor));
  }

  /** Gather (D-1915): the biome the GM named and the node picked, through the one door (the roll dialog, D-1927). */
  static async #onGather(event) {
    const biome = game.user?.getFlag("azeroth-rpg", BIOME_FLAG) ?? null;
    const section = this.element.querySelector('section[data-tab="profession"]');
    const material = section?.querySelector("input[data-prof-node]:checked")?.value ?? this.#gatherNode;
    return gather(this.actor, { biome, material, event });
  }

  /** Disenchant (D-1933): the item picked, through the one door (the roll dialog). */
  static async #onProfessionDisenchant(event) {
    const section = this.element.querySelector('section[data-tab="profession"]');
    const itemId = section?.querySelector("select[data-prof-disenchant]")?.value ?? this.#disenchantSel;
    if (!itemId) return null;
    return disenchant(this.actor, { itemId, event });
  }

  /**
   * A recipe row picked: its card unhidden and its row lit, NO RENDER (D-738's pattern), then the
   * card judged whole by `craftSnapshot` and redrawn in place, so the bag room it alone judges
   * agrees with the door (D-1981).
   */
  static async #onInspectRecipe(event, target) {
    const id = target.closest("[data-recipe-id]")?.dataset.recipeId ?? null;
    if (!id) return null;
    if (this.#recipeSel !== id) this.#quality = null;
    this.#recipeSel = id;
    this.#applyRecipe();
    return this.#judgePicked();
  }

  /** The picked card judged by `craftSnapshot` and its article replaced from the partial. */
  async #judgePicked() {
    const id = this.#recipeSel;
    const held = this.#cardContexts.get(id);
    if (!held) return null;
    const item = this.actor.professionItem;
    const sys = item?.system ?? {};
    const prof = PROFESSION_BY_ID[sys.identifier] ?? null;
    const ability = sys.ability ?? prof?.ability ?? "int";
    const tool = this.actor.professionTool();
    const parts = bonusParts({ abilityMod: this.actor.system?.abilities?.[ability]?.mod ?? 0, rank: Math.trunc(Number(sys.rank)) || 0, toolRarity: tool?.rarity ?? null, toolCarried: Boolean(tool) });
    const [materials, traits, affixes] = await Promise.all([professionMaterials(), professionTraits(), professionAffixes()]);
    const context = await this.#pickedCard({
      item: held.item, label: held.label, id: sys.identifier, tier: this.actor.professionTier, bonus: parts.reduce((n, p) => n + p.value, 0),
      parts, ability, tool, materials, affixes, traits, fed: isWellFed(this.actor.effects), domId: `azeroth-prof-${this.actor.id}`
    });
    if (this.#recipeSel !== id) return null;
    const html = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/actor/partials/recipe-detail.hbs", { card: context });
    const old = this.element?.querySelector(`section[data-tab="profession"] .azeroth-prof-detail[data-recipe-card="${CSS.escape(id)}"]`);
    if (!old) return null;
    const holder = document.createElement("div");
    holder.innerHTML = html.trim();
    const fresh = holder.firstElementChild;
    if (fresh) old.replaceWith(fresh);
    this.#cardContexts.set(id, { ...held, context });
    return context;
  }

  /**
   * **START PROJECT** (D-1924): a short confirm first (D11 §12: the target, the DC and interval,
   * the Craft Test, *Starting spends the materials now*) unless the roll dialog is skipped, then
   * `workflows.craft`, which judges everything again and spends in one batch.
   */
  static async #onCraftRecipe(event, target) {
    const id = target.dataset.recipeId ?? this.#recipeSel;
    const held = this.#cardContexts.get(id);
    if (!id || !held || !this.isEditable) return null;
    const q = this.#quality?.uuid === id ? { ...this.#quality } : { rarity: "common", prefix: null, suffix: null, signature: null, cut: null };
    if (shouldPrompt(event)) {
      const c = held.context;
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.format("AZEROTH.Profession.Sheet.Confirm.Title", { name: c.name }) },
        content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Profession.Sheet.Confirm.Body", { target: c.targetWords, extended: c.extendedWords, test: c.craftTestWords }))}</p>`
          + `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Profession.Sheet.Confirm.Spend", { spent: (c.reagents ?? []).map(r => `${r.need} ${r.name}`).join(", ") || game.i18n.localize("AZEROTH.Profession.Sheet.Detail.NoReagents") }))}</p>`,
        yes: { label: game.i18n.localize("AZEROTH.Profession.Sheet.Detail.Start") },
        no: { label: game.i18n.localize("AZEROTH.Profession.Sheet.Confirm.No") },
        rejectClose: false
      });
      if (!yes) return null;
    }
    const project = await craft(this.actor, {
      baseUuid: id, rarity: q.rarity ?? "common",
      prefixes: q.prefix ? [q.prefix] : [], suffix: q.suffix ?? null, signature: this.#signatureOf(q), cut: q.cut ?? null
    });
    if (project) await this.#setProfessionView("crafting");
    return project;
  }

  /** **ROLL A TEST** on a stored project (D-1924): the one door, which opens the roll dialog (D-1927). */
  static async #onWorkProject(event, target) {
    const projectId = target.dataset.projectId;
    if (!projectId) return null;
    return this.#presses.run(`work:${projectId}`, () => workProject(this.actor, { projectId, event }));
  }

  /** Collect a finished project the bags had no room for. */
  static async #onCollectProject(event, target) {
    const projectId = target.dataset.projectId;
    if (!projectId) return null;
    return this.#presses.run(`collect:${projectId}`, () => collectProject(this.actor, { projectId }));
  }

  /**
   * **ABANDON** (the plan's M5): ALWAYS asked first, whatever the roll dialog's skip setting, since
   * the materials are lost (D-1995, overriding D-1984 for Abandon alone).
   */
  static async #onAbandonProject(event, target) {
    const projectId = target.dataset.projectId;
    const project = projectsOf(this.actor).find(p => p.id === projectId);
    if (!project) return null;
    {
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.format("AZEROTH.Profession.Sheet.Abandon.Title", { name: project.name }) },
        content: `<p>${foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.Profession.Sheet.Abandon.Body"))}</p>`,
        yes: { label: game.i18n.localize("AZEROTH.Profession.Sheet.Abandon.Yes") },
        no: { label: game.i18n.localize("AZEROTH.Profession.Sheet.Abandon.No") },
        rejectClose: false
      });
      if (!yes) return null;
    }
    return this.#presses.run(`abandon:${projectId}`, () => abandonProject(this.actor, { projectId }));
  }

  /**
   * **HARVEST A TARGETED CREATURE** (D-1996): Skin, Butcher or Salvage from the Harvest card, the
   * token as the target, through `workflows.harvest` (its own claim and the roll dialog).
   */
  static async #onHarvestTarget(event, target) {
    const uuid = target.dataset.tokenUuid;
    const kind = target.dataset.kind;
    if (!uuid || !kind) return null;
    const token = await fromUuid(uuid);
    if (!token) return null;
    return this.#presses.run(`harvest:${uuid}:${kind}`, () => harvest(this.actor, { target: token, kind, event }));
  }

  /** Open all, or Close all (D-1927): every group's <details>, remembered on the reader's flag, no render. */
  static async #onOpenAllRecipes() { return this.#setAllGroups(true); }
  static async #onCloseAllRecipes() { return this.#setAllGroups(false); }

  async #setAllGroups(open) {
    const id = this.actor.professionItem?.system?.identifier;
    const section = this.element.querySelector('section[data-tab="profession"]');
    if (!id || !section) return null;
    const keys = [...section.querySelectorAll("details[data-recipe-group]")].map(g => g.dataset.recipeGroup);
    // While a filter is set the groups shown are the filter's, and the reader's own open set is
    // left as it was: the press opens or closes what is drawn now, and clearing the filter puts
    // the groups back as the reader left them.
    if (!filtersActive(this.#craftFilters)) {
      const stored = game.user?.getFlag("azeroth-rpg", OPEN_FLAG);
      // The flag is written first, so the toggle events the loop fires find it already true.
      await game.user?.setFlag("azeroth-rpg", OPEN_FLAG, withAllOpen(stored, id, keys, open)).catch(() => null);
    }
    // Read the groups again: a render during the write replaced them.
    for (const details of this.element.querySelectorAll('section[data-tab="profession"] details[data-recipe-group]')) details.open = open;
    return null;
  }

  /** Clear every filter, and the groups go back to what the reader left open. */
  static async #onClearRecipeFilters() {
    this.#craftFilters = { search: "", have: false, tier: "all", kind: "all" };
    return this.render({ parts: ["profession"] });
  }

  /** Lay an enchantment (08 §18): the item and the affix picked, through `workflows.enchant`. */
  static async #onLayEnchantment() {
    const { itemId, affixId } = this.#enchantSel;
    if (!itemId || !affixId) return null;
    const project = await enchant(this.actor, { itemId, affix: affixId });
    if (project) this.#enchantSel = { itemId, affixId: null };
    return project;
  }
}
