/**
 * DIFFICULT GROUND ON THE BOARD, AND WHAT A FOOT COSTS THERE (D-757; the lead's
 * play-test, 2026-09-25). `rules/area-ground.mjs` and `rules/movement.mjs` are
 * the law; this is where they meet core's movement.
 *
 * Verified at 14.367 (`resources/app/client`):
 *
 * - **`foundry.data.regionBehaviors.ModifyMovementCostRegionBehaviorType`**
 *   (`data/region-behaviors/increase-movement-cost.mjs`) keeps a `difficulties`
 *   number per movement action and answers `_getTerrainEffects(token, segment,
 *   options)` with `[{name: "difficulty", difficulty}]` (L107-111). Core asks
 *   every enabled behavior of every Region a path crosses for its effects
 *   (`canvas/placeables/token.mjs#createTerrainMovementPath`, L3521), so a
 *   subclass that answers `[]` for a creature it does not slow is the whole
 *   filter, with no hook.
 * - **`CONFIG.Token.movement.TerrainData`** is the documented door for a
 *   system's terrain (`config.mjs:2355`: *The type of the terrain effects and
 *   data is system-defined*). Core's `TerrainData.resolveTerrainEffects`
 *   MULTIPLIES the difficulties on a space (`data/terrain-data.mjs:86-93`); this
 *   subclass takes the HIGHEST (the lead: *overlapping Difficult ground takes the
 *   higher cost, never multiplies*), and its `getMovementCostFunction(token)`
 *   is where a creature that ignores Difficult ground pays a foot a foot.
 * - **A movement action's cost** is `getCostFunction(token)` over the terrain's
 *   cost, built from `costMultiplier` by `Game#initializeConfig` - which runs
 *   AFTER `init` (`game.mjs:726`, `#initializeMovementActions` L846-850) and then
 *   freezes the actions, so this is written at `init`.
 * - **A system's behavior subtype is unprefixed** (`dist/packages/world.mjs#
 *   prepareDataModel`), and its schema is built when core localises the data
 *   models in `Localization#initialize` - after `init`, before
 *   `initializeConfig` - so the parent's `difficulties` are built off the
 *   actions as core ships them.
 * - **Behaviors are a GM's to create** (`common/documents/region.mjs#canCreate`,
 *   `region-behavior.mjs#canCreate`); a player's placed area takes its behavior
 *   from the active GM's reconciler (`canvas/sustained-areas.mjs#reconcileGround`).
 */

import { ACTION_COST, actionCost, paidDifficulty, resolveDifficulty, resolveMagicalDifficulty, swimMultiplier } from "../rules/movement.mjs";
// D-779: 04's Master of the Land - the ally standing near a holder walks the
// table's own terrain, a climb and a swim a foot a foot.
import { landwise } from "../rules/class-answers.mjs";
import { landwiseFor } from "../rules/class-talents.mjs";
import { feetApart } from "./footprints.mjs";
import { allyOf } from "./engaged.mjs";
import { CREATURE_KINDS } from "../rules/creature-kinds.mjs";
import { DIFFICULT_BEHAVIOR, IGNORES_GROUND_FLAG, difficultApplies } from "../rules/area-ground.mjs";
import { movementFactsFor } from "../rules/talent-effects.mjs";
import { actorOf, casterTokenOn } from "./sustained-areas.mjs";
import { kindsOfActor, relationTo } from "../effects/area-strikes.mjs";

// The flag lives with the law now (the final review of D-757): `dice/chat.mjs`
// writes it and reads nothing else of this module's.
export { IGNORES_GROUND_FLAG };

/**
 * **WHAT A CREATURE'S OWN STATE DOES TO MOVING** (D-757): whether Difficult
 * ground costs it a foot a foot - a laid spell whose words say it ignores
 * Difficult ground (Firewalk, Ghost Wolf, Blessing of Freedom ...), or a taken
 * talent that says so (Mountain-Bred) - whether a climb does, and **whether a
 * swim does, and how fast** (the final review of D-757): 14's *swims at its
 * Speed* and *swims at twice its Speed*, read through the senses `NpcData`
 * derives `swimSpeed` from (`swims` 1 or 2), and 02's Island Blood (1). Read
 * where a step is priced and a pace is set, so a spell laid or lifted moves
 * the next path at once.
 *
 * @param {Actor|null} actor
 * @returns {{ignoresGround: boolean, climbsFree: boolean, swimsFree: boolean, swims: number}}
 */
/**
 * **WHETHER THIS TOKEN WALKS UNDER 04's MASTER OF THE LAND** (*Any number of
 * targets within 30 feet ignore movement penalties from non-magical sources*; the
 * lead, 2026-10-03, on O-179: *"Always on"*; D-779): a holder of the talent on the
 * token's own scene within its feet, the token an ally of the holder's (the holder
 * itself included, D-755). Measured through the one measure (`canvas/footprints.mjs`).
 *
 * @param {TokenDocument|null} token
 * @returns {boolean}
 */
export function landwiseNear(token) {
  const doc = token?.document ?? token ?? null;
  const scene = doc?.parent ?? null;
  const actor = doc?.actor ?? null;
  if (!scene || !actor) return false;
  const holders = [];
  for (const other of scene.tokens ?? []) {
    const holder = other.actor ?? null;
    const row = holder?.type === "character" ? landwiseFor(holder.takenTalents?.() ?? []) : null;
    if (!row) continue;
    holders.push({ feet: other.id === doc.id ? 0 : feetApart(other, doc), ally: holder === actor || allyOf(holder, actor) });
  }
  return holders.length > 0 && landwise(holders);
}

export function movementFactsOf(actor) {
  if (!actor) return { ignoresGround: false, climbsFree: false, swimsFree: false, swims: 0 };
  const talents = movementFactsFor(actor.takenTalents?.() ?? []);
  const laid = (actor.effects ?? []).some(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[IGNORES_GROUND_FLAG] === true);
  const swims = Math.max(talents.swimsFree ? 1 : 0, swimMultiplier(actor.system?.senses ?? []));
  return { ignoresGround: talents.ignoresGround || laid, climbsFree: talents.climbsFree, swimsFree: swims > 0, swims };
}

/**
 * The system's terrain: the HIGHEST difficulty on a space rather than the
 * product (`rules/movement.mjs#resolveDifficulty`), and a creature that ignores
 * Difficult ground paying a foot a foot wherever the ground would charge more
 * (`paidDifficulty`) - for every source, a GM's own drawn rubble included,
 * which is Firewalk's *from every source*.
 */
export class AzerothTerrainData extends foundry.data.TerrainData {
  /**
   * **AND THE PART A SPELL OR A FEATURE LAID** (D-779): `magical`, the highest
   * difficulty the system's own Difficult-ground behavior put on the space (a
   * spell's area), which 04's Master of the Land does not lift.
   * @override
   */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      magical: new foundry.data.fields.NumberField({ required: true, nullable: true, min: 0, initial: 1 })
    };
  }

  /** @override */
  static resolveTerrainEffects(effects, options) {
    const difficulty = resolveDifficulty(effects);
    if (difficulty === null) return null;
    const magical = resolveMagicalDifficulty(effects);
    // Null is `TerrainData#_initialize`'s own Infinity: impassable.
    return new this({ difficulty: Number.isFinite(difficulty) ? difficulty : null, magical: magical === null ? 1 : (Number.isFinite(magical) ? magical : null) });
  }

  /** @inheritDoc */
  _initialize(options) {
    super._initialize(options);
    this.magical ??= Infinity;
  }

  /** @override */
  equals(other) {
    return super.equals(other) && other.magical === this.magical;
  }

  /** @override */
  static getMovementCostFunction(token, options) {
    const { ignoresGround } = movementFactsOf(token?.actor ?? null);
    // 04's Master of the Land (D-779): the table's terrain costs a foot a foot; a
    // spell's Difficult ground still charges what it charges.
    const landed = landwiseNear(token);
    return (from, to, distance, segment) => {
      const terrain = segment?.terrain ?? null;
      const difficulty = landed ? (terrain?.magical ?? 1) : (terrain?.difficulty ?? 1);
      return distance * paidDifficulty(difficulty, { ignoresGround });
    };
  }
}

/**
 * **WHETHER THIS BEHAVIOR SLOWS THIS TOKEN** - `rules/area-ground.mjs
 * #difficultApplies` over what the moving token is and who it is to the caster
 * the behavior names. Not a private method: a DataModel's brand is not
 * installed during the base constructor (CLAUDE.md §15's memory), and nothing
 * here needs one.
 *
 * @param {object} system  the behavior's own data
 * @param {TokenDocument} token
 */
export function groundReaches(system, token) {
  const actor = token?.actor ?? null;
  if (!actor) return false;
  const spec = { who: system?.who ?? "creature", kinds: [...(system?.kinds ?? [])] };
  let relation = "other";
  if (spec.who === "enemy") {
    const caster = actorOf(system?.caster ?? null);
    if (!caster) return false;
    const region = system?.region ?? system?.parent?.region ?? null;
    const casterToken = casterTokenOn(token.parent, region?.flags?.["azeroth-rpg"]?.source ?? null, caster);
    relation = relationTo({ caster, casterToken, actor, token });
  }
  return difficultApplies(spec, { relation, kinds: kindsOfActor(actor) });
}

const { ModifyMovementCostRegionBehaviorType } = foundry.data.regionBehaviors;

/**
 * **DIFFICULT GROUND TO SOME CREATURES AND NOT OTHERS** (D-757): core's own
 * *Modify Movement Cost* behavior, which already lays a difficulty per movement
 * action, with WHO it lays it on beside it - Consecrated Ground's *to an enemy
 * that is undead or fel* (D-753), or every creature for an area 07 makes
 * Difficult ground.
 *
 * - `kinds`  the kinds it slows (`rules/creature-kinds.mjs`); none is everybody
 * - `who`    "creature", or "enemy" - an enemy of the caster
 * - `caster` the caster's actor uuid, where `who` asks about one
 */
export class DifficultForBehaviorType extends ModifyMovementCostRegionBehaviorType {
  /**
   * The parent's words, then the fields' own, which core merges last-wins
   * (`Localization.localizeSchema`, 14.367): `AZEROTH.DifficultFor.FIELDS.kinds.label`,
   * `AZEROTH.DifficultFor.FIELDS.kinds.hint`, `AZEROTH.DifficultFor.FIELDS.who.label`,
   * `AZEROTH.DifficultFor.FIELDS.who.hint`, `AZEROTH.DifficultFor.FIELDS.caster.label`,
   * `AZEROTH.DifficultFor.FIELDS.caster.hint`.
   */
  static LOCALIZATION_PREFIXES = [...ModifyMovementCostRegionBehaviorType.LOCALIZATION_PREFIXES, "AZEROTH.DifficultFor"];

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    // Core's hint says *Overlapping movement cost modifications stack
    // multiplicatively*, which this system's terrain does not do (the lead:
    // the higher cost, never multiplied). The parent writes the key onto its
    // last action's field directly, so the word is replaced there.
    for (const field of Object.values(schema.difficulties?.fields ?? {})) {
      if (field.hint === "BEHAVIOR.TYPES.modifyMovementCost.FIELDS.difficulties.hint") field.hint = "AZEROTH.DifficultFor.DifficultiesHint";
    }
    return {
      ...schema,
      who: new fields.StringField({
        required: true, blank: false, initial: "creature",
        choices: { creature: "AZEROTH.DifficultFor.Who.creature", enemy: "AZEROTH.DifficultFor.Who.enemy" }
      }),
      kinds: new fields.SetField(new fields.StringField({
        required: true, blank: false,
        choices: Object.fromEntries(CREATURE_KINDS.map(kind => [kind, `AZEROTH.DifficultFor.Kind.${kind}`]))
      })),
      caster: new fields.StringField({ required: false, nullable: true, blank: false, initial: null })
    };
  }

  /** @override */
  _getTerrainEffects(token, segment, options) {
    if (!groundReaches(this, token)) return [];
    // A spell area's Difficult ground is magical (D-779): 04's Master of the Land
    // does not lift it (`AzerothTerrainData`'s `magical`).
    return super._getTerrainEffects(token, segment, options).map(effect => ({ ...effect, magical: true }));
  }
}

/**
 * Register at `init`: the terrain, the cost of each movement action matched to
 * 05 (`rules/movement.mjs#ACTION_COST`: a swim is two feet a foot where core
 * charges one, a jump one where core charges two), and the behavior subtype.
 * `costMultiplier` is written as well, so anything reading the config before
 * `Game#initializeMovementActions` sees 05's number; core then keeps the
 * function it was given and deletes the multiplier (game.mjs:846-850), so the
 * number read in play is `ACTION_COST`'s, through `actionCost`.
 */
export function registerMovementCosts() {
  CONFIG.Token.movement.TerrainData = AzerothTerrainData;
  for (const [action, multiplier] of Object.entries(ACTION_COST)) {
    const config = CONFIG.Token.movement.actions[action];
    if (!config) continue;
    config.costMultiplier = multiplier;
    config.getCostFunction = token => {
      const own = movementFactsOf(token?.actor ?? null);
      // 04's Master of the Land (D-779): a climb and a swim are the table's terrain,
      // a foot a foot for a creature walking under it.
      const facts = landwiseNear(token) ? { ...own, climbsFree: true, swimsFree: true } : own;
      return (cost, from, to, distance) => actionCost(cost, distance, action, facts);
    };
  }
  CONFIG.RegionBehavior.dataModels[DIFFICULT_BEHAVIOR] = DifficultForBehaviorType;
  CONFIG.RegionBehavior.typeIcons[DIFFICULT_BEHAVIOR] = "fa-solid fa-shoe-prints";
}
