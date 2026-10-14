/**
 * The combat tracker, side-based (D-256, D-012).
 *
 * Core's tracker lists combatants in initiative order with a roll button.
 * Here initiative is never rolled and the sides alternate, so the list is
 * grouped under two side headers with the leading side first, each row
 * carrying its turn budget as pips - two Half-Actions and a Reaction - with
 * the spends beside them, and its primary Momentum pool. The GM can move a
 * combatant to the other side, which is 06's call on a neutral creature.
 *
 * Extends core rather than replacing it: the header and footer parts are
 * core's, `_prepareTrackerContext` builds core's turns and this groups them.
 */

import { AZEROTH } from "../config.mjs";
import { guard } from "./combat-actions.mjs";

const { CombatTracker } = foundry.applications.sidebar.tabs;

export class AzerothCombatTracker extends CombatTracker {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      spendHalf: AzerothCombatTracker.#onSpend,
      spendReaction: AzerothCombatTracker.#onSpend,
      spendFull: AzerothCombatTracker.#onSpend,
      // The GM's undo on a spend the table decided did not happen (D-718).
      restoreHalf: AzerothCombatTracker.#onRestore,
      restoreReaction: AzerothCombatTracker.#onRestore,
      guard: AzerothCombatTracker.#onGuard,
      toggleSide: AzerothCombatTracker.#onToggleSide,
      // The Party into the fight in one click (2026-09-06).
      addParty: AzerothCombatTracker.#onAddParty
    }
  };

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    tracker: {
      template: "systems/azeroth-rpg/templates/combat/tracker.hbs",
      scrollable: [""]
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    const combat = this.viewed;
    if (!combat) return;

    // Core's turns, decorated with what the side-based tracker draws.
    const byId = new Map(combat.turns.map(c => [c.id, c]));
    for (const turn of context.turns ?? []) {
      const combatant = byId.get(turn.id);
      if (!combatant) continue;
      const budget = combatant.budget;
      // Every Momentum pool the actor holds, a creature's included (D-627).
      const momenta = (combatant.actor?.poolSnapshot?.() ?? []).filter(p => p.kind === "momentum")
        .map(p => ({ name: game.i18n.localize(AZEROTH.momentumTypes[p.name] ?? p.name), value: p.value, max: p.max }));
      Object.assign(turn, {
        side: combatant.side,
        budget: {
          halfActions: budget.halfActions,
          reactions: budget.reactions,
          halves: Array.from({ length: AZEROTH.HALF_ACTIONS_PER_TURN ?? 2 }, (_, i) => ({ spent: i >= budget.halfActions })),
          reaction: { spent: budget.reactions < 1 },
          // What there is to put back (D-718). A restore button with nothing to
          // restore would refuse on every press, so it is drawn only where the
          // spend happened - and only for the GM, below.
          halfSpent: budget.halfActions < (AZEROTH.HALF_ACTIONS_PER_TURN ?? 2),
          reactionSpent: budget.reactions < (AZEROTH.REACTIONS_PER_TURN ?? 1)
        },
        momenta,
        canSpend: turn.isOwner && !turn.isDefeated
      });
    }

    // Two groups, the leading side first (06 SS5: the side holding the highest
    // initiative acts first, then they alternate).
    const leading = combat.leadingSide ?? "friendly";
    const order = leading === "hostile" ? ["hostile", "friendly"] : ["friendly", "hostile"];
    context.sides = order.map(key => ({
      key,
      label: `AZEROTH.Combat.${key[0].toUpperCase()}${key.slice(1)}`,
      leading: key === leading,
      turns: (context.turns ?? []).filter(t => t.side === key)
    }));
    context.isGM = game.user.isGM;
    // Core runs the turn's work on the active GM's client alone (D-627).
    context.noGM = !game.users.activeGM;
    // The Party's button: a GM, a fight, and a marked character not yet in it.
    const inFight = new Set(combat.combatants.map(c => c.actorId));
    context.partyToAdd = game.user.isGM ? game.actors.filter(a => a.isParty && !inFight.has(a.id)).length : 0;
  }

  /** Every marked character into the viewed fight (2026-09-06). */
  static async #onAddParty() {
    if (!game.user.isGM || !this.viewed) return null;
    const added = await this.viewed.addParty();
    if (!added.length) ui.notifications?.info(game.i18n.localize("AZEROTH.Combat.PartyAllIn"));
    return added;
  }

  /* -------------------------------------------- */

  /** A spend from the row's budget; the rule refuses with a reason (06 SS6, D-255). */
  static async #onSpend(event, target) {
    const combatant = this.viewed?.combatants.get(target.closest("[data-combatant-id]")?.dataset.combatantId);
    if (!combatant?.isOwner) return null;
    const cost = { spendHalf: "half", spendReaction: "reaction", spendFull: "full" }[target.dataset.action];
    return combatant.spendAction(cost);
  }

  /**
   * Put a Half-Action or the Reaction back (D-718).
   *
   * **The GM's alone**, checked here and again on the combatant: this is an
   * undo for a spend the table decided did not happen, and a player must not be
   * able to refund their own turn. The rule caps it at the turn's own maximum,
   * so it can never buy a third Half-Action.
   */
  static async #onRestore(event, target) {
    if (!game.user.isGM) return null;
    const combatant = this.viewed?.combatants.get(target.closest("[data-combatant-id]")?.dataset.combatantId);
    if (!combatant) return null;
    const cost = { restoreHalf: "half", restoreReaction: "reaction" }[target.dataset.action];
    return combatant.restoreAction(cost);
  }

  /** Guard from the row (05 SS10, D-627): a Half-Action, a Bane on attackers, all Momentum gone. */
  static async #onGuard(event, target) {
    const combatant = this.viewed?.combatants.get(target.closest("[data-combatant-id]")?.dataset.combatantId);
    if (!combatant?.isOwner || !combatant.actor) return null;
    return guard(combatant.actor);
  }

  /** Move a combatant to the other side - the GM's call on a neutral (06). */
  static async #onToggleSide(event, target) {
    if (!game.user.isGM) return null;
    const combatant = this.viewed?.combatants.get(target.closest("[data-combatant-id]")?.dataset.combatantId);
    if (!combatant) return null;
    await combatant.setSide(combatant.side === "friendly" ? "hostile" : "friendly");
    this.viewed.setupTurns();
    return this.render();
  }
}
