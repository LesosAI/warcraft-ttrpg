/**
 * Azeroth RPG — system entry point.
 * Private, unpublished system. See CLAUDE.md for architecture rules.
 */

import { AZEROTH } from "./config.mjs";
import { CharacterData } from "./data/actor/character.mjs";
import { NpcData } from "./data/actor/npc.mjs";
import { ITEM_DATA_MODELS } from "./data/item/index.mjs";
import { AzerothActor } from "./documents/actor.mjs";
import { AzerothItem } from "./documents/item.mjs";
import { AzerothCombat, AzerothCombatant, onMoveToken, onPreMoveToken, remainingMovement } from "./documents/combat.mjs";
import { registerRoll } from "./dice/azeroth-roll.mjs";
import { registerConditions } from "./effects/conditions.mjs";
import { registerPoolChange } from "./effects/pool-change.mjs";
import { registerChatHooks } from "./dice/chat.mjs";
import { registerPassiveHooks } from "./effects/passives.mjs";
import { registerAuraHooks } from "./effects/auras.mjs";
import { registerSustainedAreaHooks } from "./canvas/sustained-areas.mjs";
// A deleted scene's tokens leave core's effect registry, and a write the area
// and aura passes owe a deleted scene is never sent (the full-suite fix of D-757).
import { registerDurationHooks } from "./effects/durations.mjs";
import { registerInWorldHooks } from "./canvas/in-world.mjs";
// Difficult ground and what a foot costs (D-757): the terrain, the movement
// actions and the Region behavior at `init`, and what entering an area does.
import { registerMovementCosts } from "./canvas/behaviors.mjs";
import { registerAreaStrikeHooks } from "./effects/area-strikes.mjs";
// The damage door's rulings (D-777): temporary Health that ends with the effect
// carrying it, and 07's Aegis floor's heal when it goes.
import { registerTemporaryHealthHooks } from "./effects/temporary-health.mjs";
import { registerBlowDoorHooks } from "./effects/blow-doors.mjs";
// D-779: Undying Rage's fall when its held rounds run out, and Bracing lifted by a move.
import { registerClassAnswerHooks } from "./effects/class-answers.mjs";
import { registerMeasureControls } from "./canvas/measure.mjs";
// A view that is not the board may be pressed for a pick (D-763), and the pick
// waiting is announced and may be cancelled from outside (D-767).
import { cancelPick, pickState, registerPickSurface } from "./canvas/place.mjs";
// The animation layer (D-729, D-730): cues each client plays for itself, loops
// each client reconciles against the world, and the door that stops one.
import { animations, registerAnimationHooks } from "./animation/director.mjs";
import { registerAnimationControl } from "./animation/control.mjs";
import { registerAnimationWindowHooks } from "./applications/animations.mjs";
import * as workflows from "./dice/workflows.mjs";
// The hotbar (the lead, 2026-09-13): the system had no macro code at all.
import * as macros from "./macros.mjs";
import { registerHotbarDrop } from "./macros.mjs";
import { attackWithDialog, castWithDialog, npcAttackWithDialog } from "./applications/actions.mjs";
import * as affixes from "./rules/affixes.mjs";
import { AzerothRoll } from "./dice/azeroth-roll.mjs";
import { preloadTemplates, registerHelpers } from "./helpers/handlebars.mjs";
import { AzerothCharacterSheet } from "./applications/character-sheet.mjs";
import { AzerothNpcSheet } from "./applications/npc-sheet.mjs";
import { AzerothItemSheet } from "./applications/item-sheet.mjs";
import { AzerothCompendiumBrowser, CATEGORIES } from "./applications/compendium-browser.mjs";
import { registerBrowserButton } from "./applications/browser-button.mjs";
import { AzerothCharacterCreator } from "./applications/creator.mjs";
import { registerCreatorButton } from "./applications/creator-button.mjs";
import { registerQueries } from "./queries.mjs";
import * as bound from "./documents/bound.mjs";
// A shape is one Active Effect and one writer (02 §7, D-769).
import * as shapes from "./documents/shapes.mjs";
// Damage or healing laid on a creature at the start of each of its turns (D-770).
import { endTick, endTickAndHeal, landTicks, layTickOn, tickEffectsOf, tickLaidBy } from "./effects/ticks.mjs";
import { AzerothNpcGenerator } from "./applications/npc-generator.mjs";
import { AzerothLootGenerator } from "./applications/loot-generator.mjs";
import * as loot from "./rules/loot.mjs";
import * as lootOffer from "./documents/loot-offer.mjs";
import { AzerothLootOffer, registerLootOfferHooks } from "./applications/loot-offer.mjs";
import { registerLootOfferFolderDoor } from "./applications/loot-offer-folder.mjs";
import { registerGeneratorButton } from "./applications/npc-generator-button.mjs";
import { registerLootButton } from "./applications/loot-generator-button.mjs";
import { registerWorldMapButton } from "./applications/world-map-button.mjs";
import { registerRulesJournalsButton } from "./applications/rules-journals-button.mjs";
import * as bestiary from "./rules/bestiary.mjs";
import { runMigrations } from "./migrations/index.mjs";
import { registerSettings } from "./settings.mjs";
import { AzerothCombatTracker } from "./applications/combat-tracker.mjs";
import { registerPauseVideo } from "./applications/pause-video.mjs";
import { registerQuenchTests } from "./testing/quench-tests.mjs";

// No-op unless the Quench module is active — safe in production worlds.
registerQuenchTests();

Hooks.once("init", () => {
  console.log("azeroth-rpg | Initializing Azeroth RPG system");

  CONFIG.AZEROTH = AZEROTH;

  // Document classes. AzerothActor's prepareBaseData calls super, which is
  // load-bearing on V14: Actor#prepareBaseData clears the Active Effect phase
  // tracker and skipping it throws on the second data preparation.
  CONFIG.Actor.documentClass = AzerothActor;
  CONFIG.Item.documentClass = AzerothItem;
  // Side-based turn order. Initiative is never rolled (D-256), so the sort is
  // replaced rather than the formula configured.
  CONFIG.Combat.documentClass = AzerothCombat;
  CONFIG.Combatant.documentClass = AzerothCombatant;
  CONFIG.Combat.initiative = { formula: null, decimals: 0 };
  // The side-based tracker. `ui.combat` is instantiated at setup, so the
  // override has to land at init.
  CONFIG.ui.combat = AzerothCombatTracker;

  // Data models — no template.json; every subtype is a TypeDataModel.
  Object.assign(CONFIG.Actor.dataModels, {
    character: CharacterData,
    npc: NpcData
  });
  Object.assign(CONFIG.Item.dataModels, ITEM_DATA_MODELS);

  // Conditions become status effects. V14 keys CONFIG.statusEffects by id
  // where V13 had an array.
  registerConditions();
  // A pool's cap raised by an effect is the system's own change type (2026-09-06).
  registerPoolChange();
  // A condition the system applied with a duration goes when it expires
  // (D-628) rather than lingering suppressed on the sheet. Only effects the
  // system creates carry a duration.
  CONFIG.ActiveEffect.expiryAction = "delete";
  // And a scene deleted takes its unlinked tokens' timed effects out of core's
  // registry, as core does for a token deleted on its own: left in it, the
  // next expiry deletes them in a batch the server refuses.
  registerDurationHooks();
  // A bound totem deleted moves its shaman's passives (04's Earthen Shield, D-774).
  bound.registerBoundHooks();

  // The roll class that carries DC, Success Level, location and provenance.
  registerRoll();

  // A small public surface for macros, the sheets and the Quench batches.
  game.system.azeroth = {
    workflows, affixes, AzerothRoll, config: AZEROTH,
    browser: AzerothCompendiumBrowser, CATEGORIES,
    // The character creator (D-636) and the NPC generator (D-637), for the
    // batches and the shots; the bands beside them for a macro.
    creator: AzerothCharacterCreator,
    generator: AzerothNpcGenerator,
    bestiary,
    // The loot generator (D-666) and its law, for the batch and a macro.
    loot: AzerothLootGenerator,
    lootRules: loot,
    // The offer of loot (D-721): present, claim, finish and cancel, for the
    // batch and a macro. The window's own door is on the card and in the
    // generator; this is how a script reaches the doors behind them.
    lootOffer,
    // And the window itself, as `loot` is the generator's class: the batch
    // reads its rendered rows, and a macro may raise it.
    lootOfferWindow: AzerothLootOffer,
    // The bound-creature door (D-643): bind, release, sync, for the batches and a macro.
    bound,
    // The shape door (D-769): take, leave and the token reconciler, for the
    // batches and a macro. The class features are the players' door.
    shapes,
    // The tick on a creature (D-770): what it carries, landing a turn's worth,
    // laying one by a door of its own, and ending one - and Swiftmend's door
    // (D-771), which ends a heal over time and heals at once, and asks first
    // whether one stands - for the batches and a macro.
    ticks: { endTick, endTickAndHeal, landTicks, layTickOn, tickEffectsOf, tickLaidBy },
    // The hotbar (the lead, 2026-09-13). A saved macro's command is one line
    // naming THIS surface, so a macro on the bar keeps working wherever the
    // module moves - a macro runs in core's sandbox, where an import of a
    // system path is legal and breaks silently on a rename.
    macros,
    // The three roll dialogs a sheet opens (the lead, 2026-09-28), for the
    // optional 3D module: a creature's attack row had no public door at all,
    // and a character's attack and cast were reachable only through a hotbar
    // item. The dialog stays the authority on DC, location and Boons (D-601).
    actions: { attackWithDialog, castWithDialog, npcAttackWithDialog },
    // What a token may still move this turn, read off the verdict a move is
    // refused by and writing nothing (D-762), for a view that shows the feet
    // left and stops a walker at the limit. The system still charges.
    movement: { remaining: remainingMovement },
    // A view drawn over the board (a 3D one) registered as a place a pick may
    // be pressed, and the aim it cannot otherwise see announced on
    // `azerothAimPreview` (D-763). `placeArea` stays the one writer. The pick
    // waiting is announced on `azerothPickState`, read by `pickState()`, and
    // cancelled as Escape cancels it by `cancelPick()` (D-767).
    canvas: { registerPickSurface, pickState, cancelPick },
    // The animation layer (D-729): the law, the tables, the records, the
    // reconciler and the stop door. `director.setPlayer` is how a batch swaps
    // the real Sequencer player for `testing/animation-recorder.mjs`.
    animations
  };
  // A player's bind runs on the GM's client through v14's User#query (D-643).
  registerQueries();

  // A sheet row dragged onto the hotbar (the lead, 2026-09-13). Core's own
  // `hotbarDrop` makes a macro that OPENS the item's sheet; this makes one
  // that swings it, and returns false so core's does not also land.
  registerHotbarDrop();

  // Sheets. ApplicationV2 only (CLAUDE.md §5); the V1 sheet is unregistered
  // so nothing falls back to it.
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, "azeroth-rpg", AzerothCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "AZEROTH.Sheet.Character"
  });
  DocumentSheetConfig.registerSheet(Actor, "azeroth-rpg", AzerothNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "AZEROTH.Sheet.Npc"
  });

  // EVERY compendium document is an Item. Registering no Item sheet leaves all
  // 1,339 of them opening with core's default, which knows nothing about these
  // DataModels. One sheet covers all twelve subtypes; what differs between them
  // is a field table, not a widget (see applications/item-fields.mjs).
  DocumentSheetConfig.registerSheet(Item, "azeroth-rpg", AzerothItemSheet, {
    makeDefault: true,
    label: "AZEROTH.Sheet.Item"
  });

  registerHelpers();
  registerChatHooks();
  // A creature's standing passive re-derives when what stands beside it moves
  // (D-691): data preparation is where the gate is judged, and nothing else
  // prepares a bystander's data.
  registerPassiveHooks();
  // A Signature that stands on somebody ELSE (08 §20's Bulwark of Tyr's Hand,
  // D-696): the same nudge as the passives above, plus the write - the effect
  // lands on the ally, so the active GM's client is the one that keeps it.
  registerAuraHooks();
  // An area goes when its spell does (D-756): a Sustain dropped by any of its
  // five writers, a timed area's span, a fight ended. The active GM's client
  // is the one that deletes.
  registerInWorldHooks();
  registerSustainedAreaHooks();
  // A shape on the board (D-769): a token placed for a shifted character wears
  // the shape, and a shape effect deleted by any door is leaving the shape.
  shapes.registerShapeHooks();
  // 05's temporary Health goes with the effect that carried it, and a creature
  // 07's Aegis floor held restores the caster's tier when the floor goes (D-777):
  // both on the client that deleted the effect.
  registerTemporaryHealthHooks();
  registerBlowDoorHooks();
  registerClassAnswerHooks();
  // 05 §10's movement costs and 07's Difficult ground (D-757). At `init`,
  // because core turns a movement action's `costMultiplier` into its cost
  // function in `Game#initializeConfig` and then freezes the actions, and it
  // builds a behavior's schema when it localises the data models - both after
  // `init` (14.367). Damage and Tests on ENTERING an area, and what a creature
  // holds *until it leaves*, on the active GM's client.
  registerMovementCosts();
  registerAreaStrikeHooks();
  // The Measure control (D-616): core hides its own in V14.
  registerMeasureControls();
  // The animation layer (D-729): the cue hooks, the loop reconciler and the
  // settle gate, plus the stop door on the Token controls and the window that
  // keeps itself in step (D-730). Registered here rather than at `ready`
  // because a cue is a hook and a card can be posted before `ready` resolves.
  registerAnimationHooks();
  registerAnimationControl();
  registerAnimationWindowHooks();
  // The browser is otherwise reachable only from the console.
  registerBrowserButton();
  // The character creator's sidebar door (D-636); a blank sheet is the other.
  registerCreatorButton();
  // The NPC generator's (D-637); an NPC's banner carries Rework.
  registerGeneratorButton();
  // The loot generator's (D-666), in the Item directory.
  registerLootButton();
  // The offer of loot (D-721): the window that answers the world setting, and
  // the *Offer to players…* door on an Item folder's right click. The
  // generator's own button and the offered card's are registered with them.
  registerLootOfferHooks();
  registerLootOfferFolderDoor();
  // The world map's (D-680), in the JOURNAL directory beside the book's own
  // door (the lead, 2026-09-13), and the login opener.
  registerWorldMapButton();
  // The book into the Journals tab: 18 chapters that had only ever lived in
  // a compendium, which the Journals tab does not list.
  registerRulesJournalsButton();
  // Swaps core's spinning icon for the system's own Game Paused animation.
  registerPauseVideo();

  registerSettings();
});

/**
 * The Party (the lead, 2026-09-06): a GM marks a character from the Actor
 * directory's right click, and the tracker and the combatant's side read
 * the flag. The hook name is core's own - `get<DocumentName>ContextOptions`,
 * fired by DocumentDirectory#_createContextMenu (verified at 14.367).
 */
// A token's move spends the turn's Move (2026-09-06).
Hooks.on("moveToken", (document, movement, operation, user) => onMoveToken(document, movement, operation, user));

// And a drag past what the turn's Half-Actions pay for is REFUSED (05 §10,
// D-718). `preMoveToken` fires on the moving client alone and a `false` return
// deletes the movement from the update (client/documents/token.mjs, 14.367);
// the handler is synchronous, so nothing inside it may be awaited.
Hooks.on("preMoveToken", (document, movement) => onPreMoveToken(document, movement));

Hooks.on("getActorContextOptions", (app, options) => {
  const actorOf = li => game.actors.get(li.dataset.entryId);
  options.push({
    label: "AZEROTH.Party.Mark",
    icon: "fa-solid fa-people-group",
    visible: li => { const a = actorOf(li); return game.user.isGM && a?.type === "character" && !a.isParty; },
    onClick: (event, li) => actorOf(li)?.setParty(true)
  }, {
    label: "AZEROTH.Party.Unmark",
    icon: "fa-solid fa-people-group",
    visible: li => { const a = actorOf(li); return game.user.isGM && a?.isParty === true; },
    onClick: (event, li) => actorOf(li)?.setParty(false)
  });
});

Hooks.once("setup", async () => {
  // Partials must be loaded before any card renders.
  await preloadTemplates();
});

Hooks.once("ready", async () => {
  await runMigrations();
  // Every character's features are brought back into step with the table
  // (D-621): a descriptor that moved under a granted feature reaches the
  // world here, with no migration to write for it. Idempotent and quiet.
  if (game.user.isGM) {
    const touched = { created: 0, updated: 0, deleted: 0 };
    for (const actor of game.actors.filter(a => a.type === "character")) {
      const n = await actor.syncClassFeatures?.();
      for (const k of Object.keys(touched)) touched[k] += n?.[k] ?? 0;
      // And the Fatigue track's statuses (D-624), the same way.
      await actor.syncFatigue?.();
    }
    if (touched.created || touched.updated || touched.deleted) {
      console.log(`azeroth-rpg | features refreshed: ${touched.created} granted, ${touched.updated} restamped, ${touched.deleted} withdrawn`);
    }
  }
  // Phase 7 lands the OFL faces (D5). Until then the fallback stack draws the
  // sheet, and this says so once rather than leaving a wrong face to be noticed.
  const faces = ["EB Garamond", "Alegreya", "Germania One"];
  const missing = faces.filter(f => !document.fonts?.check?.(`12px "${f}"`));
  if (missing.length) console.log(`azeroth-rpg | fonts not yet vendored (Phase 7): ${missing.join(", ")}`);
  console.log("azeroth-rpg | Ready");
});
