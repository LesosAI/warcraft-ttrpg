/**
 * The fight's controls (D-627, D-694): Guard, Disengage, Ready, the Ranger's
 * mark, leaving a shape (D-769), a rider paid before the blow (D-770). Shared by
 * the Combat tab and the tracker row; the
 * rules are in `rules/momentum.mjs` and `rules/reactions.mjs`, and this is the
 * Foundry around them.
 */

import { AZEROTH } from "../config.mjs";
import { lossOnGuard } from "../rules/momentum.mjs";
import { canReact, disengageRefusal, readyEntry } from "../rules/reactions.mjs";
// Who holds a mover with Anchor (04, D-772).
import { anchoredBy } from "../canvas/engaged.mjs";
import { reactionStateOf, rollWithDialog } from "./actions.mjs";
// Hiding (D-717): the law, and the one place the status is written.
import { STEALTH_SKILL, markStealth, stealthAllowed } from "../rules/stealth.mjs";
import { conceal, isHidden, reveal } from "../effects/stealth.mjs";
// A shape is left through its one writer (D-769).
import { leaveShape, shapeLabel, swiftLeaveCounter } from "../documents/shapes.mjs";
import { FREE_SHIFT_MARK, SAVAGE_SHIFT, freeShift, leaveCost } from "../rules/shapes.mjs";
// What the next spell that turn was promised (04's Predator's Swiftness, D-771).
import { nextSpellGrants } from "../rules/talent-effects.mjs";
import { layNextSpell } from "../effects/next-spell.mjs";
// A rider paid before the blow (D-770; the lead: *"Either order"*).
import { RIDER_REFUSALS, primeJudgement, settleRiders } from "../rules/riders.mjs";
import { poolLabel, riderReason } from "../helpers/rider-words.mjs";

const { DialogV2 } = foundry.applications.api;

function fightOf(actor) {
  return actor.activeFight?.() ?? null;
}

function combatantOf(actor) {
  const combat = fightOf(actor);
  return combat ? combat.getCombatantsByActor(actor)?.[0] ?? null : null;
}

/**
 * Guard (05 SS10, SS11): a Half-Action; attackers have a Bane against you
 * until your next turn; you lose all Momentum - unless Unbroken keeps the
 * Rage, once an encounter, which is asked and never assumed.
 *
 * Every button works outside a fight (the lead, 2026-09-04): the tracker's
 * budget is spent only where there is a tracker, and the state, the loss
 * and the card land either way.
 */
export async function guard(actor) {
  const combatant = combatantOf(actor);
  if (combatant) {
    const spent = await combatant.spendAction("half");
    if (!spent.ok) return null;
  }
  if (!actor.statuses?.has("guarded")) await actor.toggleStatusEffect("guarded", { active: true });
  const unbroken = actor.items?.find(i => i.type === "feature" && i.name === "Unbroken") ?? null;
  let kept = false;
  if (unbroken?.system?.uses?.per && unbroken.system.available) {
    kept = await DialogV2.confirm({
      window: { title: unbroken.name },
      content: `<p>${game.i18n.localize("AZEROTH.Combat.UnbrokenAsk")}</p>`,
      rejectClose: false
    }) === true;
    if (kept) await unbroken.update({ "system.uses.value": Math.max(0, unbroken.system.uses.value - 1) });
  }
  const pools = (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "momentum" && (p.value ?? 0) > 0);
  const updates = pools
    .map(p => ({ itemId: p.itemId, kind: "momentum", value: lossOnGuard(p, { unbroken: kept }) }))
    .filter((u, i) => u.value !== pools[i].value);
  if (updates.length) await actor.updatePool(updates);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format(kept ? "AZEROTH.Combat.GuardedKept" : "AZEROTH.Combat.GuardedCard", { name: actor.name })}</p>`,
    flags: { "azeroth-rpg": { kind: "guard" } }
  });
  return true;
}

/**
 * Disengage (05's Half-Action table, D-694): *Move up to your Speed without
 * provoking Opportunity Attacks.*
 *
 * **The Half-Action paid here IS the Move.** 05 does not give Disengage a cost
 * of its own on top of moving - it is a Move that provokes nothing - so the
 * combatant's `moveHalves` is stepped with it and `spendMovement` finds the
 * first Speed's worth of feet already paid for. Without that a Disengage and
 * the walk it buys would take the whole turn, and a character could never
 * disengage and do anything else.
 *
 * The state is lifted at the END of the mover's own turn (`_onEndTurn`): it
 * pays for a Move that turn and nothing more.
 *
 * **The Half-Action and the Move are one write** (D-761),
 * `AzerothCombatant#spendMoveAction`: two writes left the limit reading the
 * Half-Action spent and the Move not yet paid, and a drag straight after the
 * press was refused a Move it had just bought.
 */
export async function disengage(actor) {
  // **NOT WHILE AN ANCHOR HOLDS YOU** (04's Anchor: *Enemies Engaged with you
  // cannot Disengage*; D-772), refused in words before the Half-Action is spent
  // (D-768's order). Measured on the viewed scene; nothing placed is nobody holding.
  const anchored = disengageRefusal(anchoredBy(actor));
  if (anchored) {
    ui.notifications?.warn(game.i18n.format(anchored.key, { name: actor.name, ...anchored.params }));
    return null;
  }
  const combatant = combatantOf(actor);
  if (combatant) {
    const spent = await combatant.spendMoveAction();
    if (!spent.ok) return null;
  }
  if (!actor.statuses?.has("disengaging")) await actor.toggleStatusEffect("disengaging", { active: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Combat.DisengagedCard", { name: actor.name })}</p>`,
    flags: { "azeroth-rpg": { kind: "disengage" } }
  });
  return true;
}

/**
 * The Rank this actor holds in a skill, whichever kind of actor it is.
 *
 * A character's Ranks live on a flag (`azeroth-rpg.skillRanks`) and a
 * creature's on `system.skills`, which is a `TypedObjectField` whose value may
 * be a bare number or a row - the NPC sheet's own roll reads both (D-637).
 */
function skillRank(actor, key) {
  if (actor?.type === "npc") {
    const raw = actor.system?.skills?.[key];
    return typeof raw === "number" ? raw : (raw?.rank ?? 0);
  }
  return Number(actor?.getFlag?.("azeroth-rpg", "skillRanks")?.[key]) || 0;
}

/**
 * **A STEALTH TEST, OPPOSED** (05 §5's Opposed DC; D-717's Hide): the spec the
 * roll dialog takes - Hide's own, and 04's Preparation's (*make a Stealth Test,
 * opposed by Perception*; D-773), so the two cannot read the Test differently.
 *
 * @param {Actor} actor
 */
export function stealthTestSpec(actor) {
  const system = actor?.system ?? {};
  const ability = AZEROTH.skillAbility[STEALTH_SKILL];
  return {
    kind: "skill",
    skill: STEALTH_SKILL,
    dc: AZEROTH.OPPOSED_DC,
    title: game.i18n.localize(AZEROTH.skills[STEALTH_SKILL]),
    modifiers: [
      { label: AZEROTH.abilities[ability], value: system.abilities?.[ability]?.mod ?? 0 },
      { label: "AZEROTH.Sheet.Proficiency", value: system.proficiency ?? 0 },
      { label: "AZEROTH.Sheet.Rank", value: skillRank(actor, STEALTH_SKILL) }
    ]
  };
}

/**
 * Hide (D-717): a free Stealth Test, once a round.
 *
 * **THE BOOK HAS NO HIDDEN CONDITION** and this does not add one (O-113). 02
 * §8 gives Stealth as *moving unseen and unheard, opposed by Perception*, 05
 * §5 sets an Opposed Test at DC 12, and what carries the result is CORE's own
 * `invisible` status - the one thing in Foundry that takes a token off the
 * other players' screens while its owner keeps control and vision of it.
 *
 * **It spends nothing.** The lead's ruling: the button sits beside Guard,
 * Disengage and Ready and costs no Half-Action, so the round is the only bound
 * and the combatant's own round flag is what counts it - the same flag 08 §5's
 * Fast has been marked on since D-662, rather than a second clock.
 *
 * The DC travels to the dialog, which is the authority on it (D-601); a
 * dismissed dialog rolls nothing, spends nothing and marks nothing.
 */
export async function hide(actor, event = null) {
  const combat = fightOf(actor);
  const combatant = combatantOf(actor);
  const may = stealthAllowed(combatant?.getFlag("azeroth-rpg", "round") ?? null, combat?.round ?? null);
  if (!may.ok) {
    ui.notifications?.warn(game.i18n.localize(may.reason));
    return null;
  }
  const card = await rollWithDialog(actor, stealthTestSpec(actor), event);
  if (!card) return null;
  if (combat && combatant?.isOwner) {
    await combatant.setFlag("azeroth-rpg", "round",
      markStealth(combatant.getFlag("azeroth-rpg", "round") ?? null, combat.round));
  }
  if (card.rolls?.[0]?.outcome?.success !== true) return card;
  await conceal(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Combat.Hid", { name: actor.name })}</p>`,
    flags: { "azeroth-rpg": { kind: "stealth" } }
  });
  return card;
}

/**
 * Step out of hiding by hand (D-717): the chip's x on the Combat tab.
 *
 * `force`, because the chip is drawn off the STATUS and so appears for a GM's
 * own hand-toggled invisibility too - and a control that draws and does
 * nothing is the fault this system keeps fixing (D-681). Attacking and casting
 * reveal through the same door without `force`, so a wraith that was made
 * invisible by the GM stays invisible when it swings.
 */
export async function clearHidden(actor) {
  if (!isHidden(actor)) return null;
  await reveal(actor, { force: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Combat.Revealed", { name: actor.name })}</p>`,
    flags: { "azeroth-rpg": { kind: "stealth" } }
  });
  return true;
}

/**
 * Ready (05's Half-Action table, D-694): *Name a trigger and an action. When
 * the trigger occurs, spend your Reaction to take it.*
 *
 * **Both halves are prose and stay prose** (D2 §12). Nothing here detects a
 * trigger and nothing ever will: a vocabulary of triggers would be the tool
 * deciding what a table may wait for. The entry is a record, the card carries
 * the words, and somebody presses the button when it happens.
 *
 * The dialog opens BEFORE the Half-Action is paid, so a dismissed one costs
 * nothing - the same bargain every roll dialog makes.
 */
export async function ready(actor) {
  const asked = await askForReady();
  if (!asked) return null;
  return readyWith(actor, asked);
}

/**
 * The half of Ready that does not ask, so a test drives it without clicking
 * (CLAUDE.md §5's `apply(state)`) and a macro can name both halves.
 */
export async function readyWith(actor, { trigger = "", action = "" } = {}) {
  const combat = fightOf(actor);
  const combatant = combatantOf(actor);
  if (!combat || !combatant) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Combat.ReadyNeedsFight"));
    return null;
  }
  const made = readyEntry({ trigger, action, round: combat.round, turn: combat.turn });
  if (!made.ok) {
    ui.notifications?.warn(game.i18n.localize(made.reason));
    return null;
  }
  const spent = await combatant.spendAction("half");
  if (!spent.ok) return null;
  await combatant.setFlag("azeroth-rpg", "ready", made.entry);
  await postReadyCard(actor, made.entry);
  return made.entry;
}

/** The two prose fields, in `canvas/measure.mjs`'s dialog shape. */
async function askForReady() {
  const trigger = game.i18n.localize("AZEROTH.Combat.ReadyTrigger");
  const action = game.i18n.localize("AZEROTH.Combat.ReadyAction");
  return DialogV2.wait({
    id: "azeroth-ready-dialog",
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: game.i18n.localize("AZEROTH.Combat.ReadyTitle") },
    position: { width: 420 },
    content: `<div class="azeroth-dialog">
      <div class="azeroth-dialog-row"><label for="azeroth-ready-trigger">${trigger}</label>
        <input type="text" id="azeroth-ready-trigger" name="trigger" autofocus
               placeholder="${game.i18n.localize("AZEROTH.Combat.ReadyTriggerHint")}"></div>
      <div class="azeroth-dialog-row"><label for="azeroth-ready-action">${action}</label>
        <input type="text" id="azeroth-ready-action" name="action"
               placeholder="${game.i18n.localize("AZEROTH.Combat.ReadyActionHint")}"></div>
    </div>`,
    rejectClose: false,
    buttons: [{
      action: "ready", label: "AZEROTH.Combat.ReadySave", default: true,
      callback: (event, button) => ({
        trigger: button.form.elements.trigger?.value ?? "",
        action: button.form.elements.action?.value ?? ""
      })
    }]
  });
}

/**
 * The offer, as a card. **The button belongs to whoever owns the readier** -
 * `dice/chat.mjs` strips a `data-reaction-owner` row from every other client -
 * and the GM owns every actor, so the table's own call to fire it is a click
 * either way.
 */
async function postReadyCard(actor, entry) {
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/azeroth-rpg/templates/chat/reaction-card.hbs", {
    cardClass: "azeroth-card-attack",
    title: game.i18n.localize("AZEROTH.Reaction.Readied"),
    name: actor.name,
    // **TWO LABELLED LINES, never a sentence the trigger is dropped into.**
    // 05 says *name a trigger*, so the words are the player's and any frame
    // built around them reads as broken English half the time: *is waiting for
    // he steps out from behind the pillar* was the first one this printed. The
    // card's band already says whose it is.
    text: game.i18n.format("AZEROTH.Combat.ReadyCard", { trigger: entry.trigger }),
    detail: game.i18n.format("AZEROTH.Combat.ReadyCardAction", { action: entry.action }),
    note: game.i18n.localize("AZEROTH.Reaction.ReadiedNote"),
    ownerUuid: actor.uuid,
    readied: true
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": { kind: "reaction", reaction: "readied", actorUuid: actor.uuid } }
  });
}

/** Stand down: the readied action is dropped and the Half-Action stays spent. */
export async function clearReady(actor) {
  const combatant = combatantOf(actor);
  if (combatant?.getFlag("azeroth-rpg", "ready")) await combatant.unsetFlag("azeroth-rpg", "ready");
  return null;
}

/**
 * *The action you named, when the trigger fires* (06 §6).
 *
 * The trigger is the table's judgement, so this is only ever reached by a
 * press. It spends the Reaction, says in chat what was taken, and drops the
 * entry - what the action IS stays prose, and the player does it through the
 * doors they would have used on their turn.
 */
export async function takeReadied(actor, { messageId = null } = {}) {
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  const may = canReact("readied", reactionStateOf(actor, { messageId }));
  if (!may.ok) {
    ui.notifications?.warn(game.i18n.format(may.reason, {
      name: actor.name, reaction: game.i18n.localize(AZEROTH.reactions.readied)
    }));
    return null;
  }
  if (!(await game.system.azeroth.workflows.spendTurnBudget(actor, "reaction"))) return null;
  await actor.setFlag("azeroth-rpg", "reacted", { messageId: messageId ?? null, reaction: "readied" });
  await clearReady(actor);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Reaction.ReadiedTaken", { name: actor.name, action: may.with })}</p>`,
    flags: { "azeroth-rpg": { kind: "reaction", reaction: "readied" } }
  });
}

/**
 * The Ranger's mark (02 SS7): free, once a turn in a fight; Quarry builds
 * only against it, and marking anything else empties the pool. The mark is
 * the first targeted token, and it outlives the fight.
 */
export async function markQuarry(actor) {
  const quarry = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === "quarry") ?? null;
  if (!quarry) return null;
  const token = [...(game.user?.targets ?? [])][0] ?? null;
  if (!token) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoTargets"));
    return null;
  }
  const combatant = combatantOf(actor);
  const combat = fightOf(actor);
  if (combatant && combat) {
    const marked = combatant.getFlag("azeroth-rpg", "marked");
    if (marked && marked.round === combat.round && marked.turn === combat.turn) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Combat.MarkedThisTurn"));
      return null;
    }
  }
  const current = actor.getFlag("azeroth-rpg", "mark") ?? null;
  const next = { tokenId: token.id, actorId: token.actor?.id ?? null, name: token.name };
  if (current && current.tokenId !== next.tokenId && quarry.value > 0) {
    await actor.updatePool({ itemId: quarry.itemId, kind: "momentum", value: 0 });
  }
  await actor.setFlag("azeroth-rpg", "mark", next);
  if (combatant?.isOwner && combat) await combatant.setFlag("azeroth-rpg", "marked", { round: combat.round, turn: combat.turn });
  return next;
}

export async function clearMark(actor) {
  if (actor.getFlag("azeroth-rpg", "mark")) await actor.unsetFlag("azeroth-rpg", "mark");
  return null;
}

/**
 * **A RIDER PAID BEFORE THE BLOW** (04's Feral Charge; the lead, 2026-10-03:
 * *"Either order"*): the Combat tab's control. 04 says *Once a round, as part
 * of an attack, spend 2 Ferocity to move up to your Speed*, and a druid charges
 * BEFORE the blow lands - so the spend may be paid here, on the character's own
 * turn in a fight, and the next attack that turn is the charge: no second
 * payment, its hit lands what the rank says (rank 2's Prone), its dialog line
 * drawn as already paid. Ticking the line on the attack is the other order,
 * and whichever is used first pays.
 *
 * D-768's order, through the doors that already exist (D-761) and nothing
 * beside them: the JUDGEMENT (`rules/riders.mjs#primeJudgement`: the line as
 * the attack's dialog would draw it - the pool, the form, the once-a-round gate
 * - a fight, the character's own turn); then the round's record, the ONE gate
 * both doors read, through the queued `markRoundRiders`, which answers whether
 * this press marked it or found it spent by an attack in flight; then the pool,
 * read now (the review's item D); then the free Move through `grantFreeMove`;
 * then the card.
 *
 * @param {Actor} actor
 * @param {string} identifier  the rider's talent identifier
 * @returns {Promise<{identifier: string, spent: number}|null>}
 */
export async function primeRider(actor, identifier) {
  const combat = fightOf(actor);
  const combatant = combatantOf(actor);
  const line = (actor?.riderLines?.() ?? []).find(l => l.identifier === identifier) ?? null;
  const judged = primeJudgement(line, { inFight: Boolean(combat && combatant), onTurn: combatant?.isCurrentTurn === true });
  if (!judged.ok) {
    ui.notifications?.warn(riderReason(judged.reason) ?? game.i18n.localize(RIDER_REFUSALS.gone));
    return null;
  }
  if (!combatant.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  const marked = await combatant.markRoundRiders([identifier], { prime: true });
  if (!(marked?.added ?? []).includes(identifier)) {
    ui.notifications?.warn(riderReason({ key: RIDER_REFUSALS.once, params: { name: line.name, pool: line.pool, cost: line.cost ?? 0, value: 0 } }));
    return null;
  }
  const settled = settleRiders({ paid: [{ identifier, name: line.name, pool: line.pool, spent: line.cost ?? 0, line }] }, { pools: actor.poolSnapshot?.() ?? [] });
  if (settled.writes.length) await actor.updatePool(settled.writes);
  if (line.move === "speed") await combatant.grantFreeMove(1);
  const spent = settled.paid[0]?.spent ?? 0;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Rider.Prime.Card", { name: line.name, n: spent, pool: poolLabel(line.pool) })}</p>`,
    flags: { "azeroth-rpg": { kind: "rider", rider: identifier, primed: true, spent } }
  });
  return { identifier, spent };
}

/**
 * **LEAVE THE SHAPE** (02 §7, D-769; the lead, 2026-10-03: *"Half-Action to
 * leave"*). The Combat tab's chip, the banner's Leave and the sheet's own
 * effect list all press this; `documents/shapes.mjs#leaveShape` is the one
 * writer - the effect goes, Ferocity with a Shapeshift form, and every token is
 * put back.
 *
 * D-768's order: the judgement (a shape to leave), then the price, then the
 * write, so a refused Half-Action leaves the shape standing. The price is
 * `rules/shapes.mjs#leaveCost`: nothing out of a fight, else a Half-Action
 * through `spendTurnBudget` - or, for a Shapeshift form, a use of 04's
 * Predator's Swiftness where one is left (*once per Short Rest, leaving a
 * Shapeshift form costs no action*), said in words. A change of shape, a rest,
 * 0 Health and a hand delete from core's HUD or effect sheet do not come here
 * and cost nothing.
 */
export async function leaveShapeControl(actor) {
  const shape = actor?.shape ?? null;
  if (!shape) return null;
  const swift = swiftLeaveCounter(actor);
  // **SAVAGE SHIFT'S ROUND REACHES THE LEAVE** (D-779; the lead, 2026-10-03, on
  // O-167: *"Yes"*): the one allowance a free shift takes, judged by the shift's
  // own reading and marked through the queued door; a mark another press took
  // first leaves this leave to pay as any leave does.
  const mine = combatantOf(actor);
  const fight = mine ? fightOf(actor) : null;
  const savage = Boolean(mine?.isOwner) && freeShift({
    kind: shape.kind,
    savageShift: actor.talentRanks?.(SAVAGE_SHIFT) ?? 0,
    inFight: Boolean(mine),
    onTurn: fight?.combatant?.id === mine?.id,
    used: ((r => (r.number === fight?.round ? r.once ?? [] : []))(mine?.getFlag("azeroth-rpg", "round") ?? {}))
  });
  let cost = leaveCost({
    kind: shape.kind,
    inFight: Boolean(mine),
    swiftLeft: swift?.system?.uses?.value ?? 0,
    savage
  });
  if (cost === "savage") {
    if ((await mine.markRoundOnce(FREE_SHIFT_MARK))?.added === true) {
      ui.notifications?.info(game.i18n.format("AZEROTH.Shape.LeftSavage", { name: actor.name, form: shapeLabel(shape), talent: SAVAGE_SHIFT }));
      await leaveShape(actor);
      return null;
    }
    cost = leaveCost({ kind: shape.kind, inFight: true, swiftLeft: swift?.system?.uses?.value ?? 0 });
  }
  if (cost === "counter") {
    await swift.update({ "system.uses.value": Math.max(0, (swift.system.uses.value ?? 1) - 1) });
    ui.notifications?.info(game.i18n.format("AZEROTH.Shape.LeftSwift", { name: actor.name, form: shapeLabel(shape), talent: swift.name }));
    // *... and your next spell that turn costs 2 Mana less* (04's Predator's
    // Swiftness, D-771): laid where the counter is spent, held to this turn.
    const grants = nextSpellGrants(actor.takenTalents?.() ?? [], { on: "swiftLeave" });
    if (grants.length) await layNextSpell(actor, grants);
  } else if (cost === "half") {
    if (!(await game.system.azeroth.workflows.spendTurnBudget(actor, "half"))) return null;
  }
  await leaveShape(actor);
  return null;
}
