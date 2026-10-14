/**
 * Chat card interaction.
 *
 * V14 passes a NATIVE HTMLElement to `renderChatMessageHTML`, not jQuery
 * (CLAUDE.md §5). Buttons are wired through `data-action` rather than ad-hoc
 * selectors, so a card's markup and its behaviour stay in step.
 */

import { placeItemArea } from "../canvas/place.mjs";
import { attackWithDialog, npcAttackWithDialog, reactWithDialog, resilienceWithDialog, takeOpportunity, useFeatureWithDialog } from "../applications/actions.mjs";
import { takeReadied } from "../applications/combat-actions.mjs";
import { openLootOffer } from "../applications/loot-offer.mjs";
import { layBane } from "../effects/banes.mjs";
// The once-a-round mark an extra attack off a card spends (04's Flurry and
// Wide Swing, D-772).
import { PARALYTIC_FLAG, evadeFor, isPoisonTickBy, namesTarget, nextRoundMark, poisonFailFor, poisonTestBanesFor, snareEscapeFor } from "../rules/class-talents.mjs";
// A card that heals counts its presses (D-774), and a heal's reach is measured.
import { cardHealRefusal } from "../rules/class-talents.mjs";
// 04's Ruin on a spell's Critical Injury, and 02's Curse's Bane on a failed Test (D-775).
import { CURSE, ruinFor } from "../rules/class-talents.mjs";
import { healAlly } from "../effects/gifts.mjs";
// A card's talent press recorded where this client may not write the card (the
// architect's review of D-774), and the judgement every door asks before a spend.
import { cardPressUnrecordable, claimCardPress } from "../effects/card-presses.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { feetBetweenTokens } from "../canvas/engaged.mjs";
// What the Ranger's and the Rogue's talents land from a card (D-773): a Reaction
// taken, a Snare's escape, and the creature a Test's failure entangles.
import { loseReaction, reactionLossText } from "../effects/reaction-loss.mjs";
import { SNARE, SNARE_FLAG, cardAttackRefusal, snareEscapeRefusal, snareHolds } from "../rules/class-features.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
import { tickEffectsOf } from "../effects/ticks.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { bondOf, boundOf, worldActorOf } from "../documents/bound.mjs";
import { placeSummon } from "../documents/summon.mjs";
import { AZEROTH } from "../config.mjs";
import { sunderedChanges } from "../rules/maneuvers.mjs";
import { applyCondition, clockRounds, spellTiming, untilEndOfNextTurn, untilEndOfNextTurnOrRound, untilNextTurn } from "../effects/durations.mjs";
// A heal over time's Ward, asked as it is laid (04's Nature's Ward, D-771).
import { tickWardChanges, tickWardFor } from "../rules/talent-effects.mjs";
// Damage or healing laid on a creature at the start of each of its turns
// (D-770): a spell's rides its Apply, a poison's its failed Test.
import { hasTick, tickHasClock } from "../rules/ticks.mjs";
import { TICK_FLAG, poisonTakesHold } from "../effects/ticks.mjs";
import { POOL_CHANGE_TYPE } from "../rules/pool-change.mjs";
import { areaResultWords, areaTestName, recordAreaTest, recordResist, resisterOf, targetActorOf } from "./annotate.mjs";
// Who acted (D-724) and who resisted (D-726), as the cards record them.
import { sourceOf } from "../applications/roll-dialog.mjs";
import { orderedResists, resistLink } from "../rules/records.mjs";
// A timed area's span, counted in rounds (D-756).
import { roundsIn } from "../rules/area-ticks.mjs";
// What an area's Test lands, rolled through this card door (D-757), and the
// flag a laid spell carries where its target ignores Difficult ground - a word
// of the law's, not the board's (the final review).
import { areaTestOutcome } from "../effects/area-strikes.mjs";
import { IGNORES_GROUND_FLAG } from "../rules/area-ground.mjs";
// 07's Aegis of the Light's floor, laid by the Apply (D-777).
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
// THE CROSS-CLASS RULINGS (D-778): the mark no Dispel ends (Improved Moonfire), a
// forced move a failed Test or a placed area makes, the Test 07 gives a held or
// Stunned creature, and Permafrost's feet on a Slowed.
import { UNDISPELLABLE_FLAG } from "../rules/dispel.mjs";
import { cleanForced } from "../rules/forced-movement.mjs";
import { forceFromRegion, forceMove, forcedWords, regionCentreOf } from "../effects/forced-movement.mjs";
import { ESCAPE_FLAG, cleanEscape, escapeRefusal } from "../rules/escapes.mjs";
import { addSlowedFeet } from "../effects/speed-drop.mjs";
// D-779: the lead's class answers - Foresight's Ward from this card, Lightwell's
// charge, and 07's Barrier's Ward on the creatures chosen.
import { foresightFor } from "../rules/class-talents.mjs";
import { LIGHTWELL, lightwellRefusal } from "../rules/class-answers.mjs";
import { emptyAreaTick, hasAreaTick } from "../rules/area-ticks.mjs";
import { allyOf } from "../canvas/engaged.mjs";

export function registerChatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = html.querySelector(".azeroth-card");
    if (!card) return;

    // **A REACTION BELONGS TO THE CREATURE THAT WAS STRUCK** (06 §6, D-693),
    // and the card was posted by whoever swung. So a row carrying
    // `data-reaction-owner` is shown to the owner of that creature and to
    // nobody else - without this the attacker would be offered every
    // defender's Parry and the defender would be offered none, since the
    // message is the attacker's.
    for (const el of html.querySelectorAll("[data-reaction-owner]")) {
      if (!ownsActor(el.dataset.reactionOwner)) el.remove();
    }
    const reactions = html.querySelector(".azeroth-card-reactions");
    if (reactions && !reactions.querySelector("[data-action]")) reactions.remove();
    // **D-779's AUDIENCES**: a Ward pressed from an incoming card is the priest's
    // who holds 04's Foresight, so it is shown to a client owning such a priest; a
    // Lightwell's charge is every player's (`data-open-to`), judged at the press.
    const foreseeing = html.querySelector("[data-foresight]") ? foresightPriests().length > 0 : false;
    for (const el of html.querySelectorAll("[data-foresight]")) {
      if (!foreseeing) el.remove();
    }

    // **AN OFFER OF LOOT IS THE INVITED PLAYERS' AND THE GM'S** (D-721). The
    // offered card is posted by the GM, so the ownership rule below would take
    // the Open button away from every player the find was actually offered to.
    // The block names its own audience - the offer's players, as ids - and
    // this is the rule that reads it. A block naming nobody reaches nobody but
    // a GM, which is what an offer with no players would be.
    for (const el of html.querySelectorAll("[data-offer-users]")) {
      const invited = (el.dataset.offerUsers ?? "").split(",").filter(Boolean);
      if (!game.user.isGM && !invited.includes(game.user.id)) el.remove();
    }

    // **A RESIST ROW IS THE TARGET'S** (07 §2, D-616, D-726), and the card is
    // the caster's, so a row carrying `data-resist-owner` is shown to the owner
    // of that creature and to the GM. D-616 always meant the target's owner to
    // press it; the whole block was stripped from everybody but the caster, so
    // it never worked. What the Tests came to is written first, above the rows
    // and outside them, so every reader keeps it whatever is stripped below.
    showResists(message, html);
    // And an area's Test, which is made once (the final review of D-757): what
    // it came to, for every reader, in place of the button.
    showAreaResult(message, html);
    for (const el of html.querySelectorAll("[data-resist-owner]")) {
      if (!game.user.isGM && !ownsActor(el.dataset.resistOwner)) el.remove();
    }

    // Only the GM and the message's owner should see the rest of the buttons.
    if (!message.isOwner && !game.user.isGM) {
      for (const el of html.querySelectorAll(".azeroth-card-actions")) {
        // A block that named its own audience has already been judged above,
        // by its own rule: judging it twice would take it back off the very
        // players it was kept for.
        if (el.dataset.reactionOwner === undefined && el.dataset.offerUsers === undefined
          && el.dataset.resistOwner === undefined && el.dataset.foresight === undefined && el.dataset.openTo === undefined) el.remove();
      }
    }
    // A Resist block left with nothing to press takes its note with it.
    for (const el of html.querySelectorAll(".azeroth-card-resists")) {
      if (!el.querySelector("[data-action]")) el.remove();
    }

    // **WHAT A REACTION ANSWERED, ON THE CARD IT ANSWERED** (06 §6, D-720).
    // The mark is spent inside `applyDamage`, so the button went on printing
    // the full number after a Block had taken four off it and the Reaction read
    // as doing nothing (the lead's item 8). Drawn from the message's own flag,
    // so every client sees it and a re-render keeps it.
    showMitigation(message, html);

    for (const button of html.querySelectorAll("[data-action]")) {
      button.addEventListener("click", event => onCardAction(event, message));
    }
  });
}

/**
 * Patch the Apply buttons of a card a Parry or a Block answered, and say so in
 * words above them.
 *
 * `damageByTarget[i].damage` is left exactly as the roll worked it out -
 * `applyDamage` is still what spends the mark - so this is DISPLAY and never
 * the arithmetic; `to` is what `rules/reactions.mjs#mitigatedDamage` said the
 * blow would leave. **Never colour alone** (CLAUDE.md §12): the line names the
 * Reaction and the number.
 */
function showMitigation(message, html) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const rows = flags.damageByTarget ?? [];
  const answered = rows
    .map((row, index) => ({ row, index }))
    .filter(r => r.row?.reaction && r.row.to !== undefined && r.row.to !== null);
  if (!answered.length) return;
  for (const { row, index } of answered) {
    const button = html.querySelector(`button[data-action="applyDamage"][data-target-index="${index}"]`);
    if (!button) continue;
    button.dataset.damage = String(row.to);
    const strong = button.querySelector("strong");
    if (strong) strong.textContent = String(row.to);
  }
  // **ABOVE THE APPLY BUTTONS, NOT ABOVE THE FIRST BUTTONS ON THE CARD.**
  // `.azeroth-card-actions` is every button block a card carries, and on a
  // Rogue's card Opening's trade is the first of them - so the line explaining
  // a number the reader had not reached yet was printed above *Spend 2 Energy*.
  // The block the Apply buttons are in is the one this is about.
  const actions = html.querySelector('button[data-action="applyDamage"]')?.closest(".azeroth-card-actions") ?? null;
  const line = document.createElement("p");
  line.className = "azeroth-card-line azeroth-card-mitigated";
  const label = document.createElement("span");
  label.textContent = game.i18n.localize("AZEROTH.Card.Answered");
  const said = document.createElement("strong");
  said.textContent = answered
    .map(({ row, index }) => game.i18n.format(row.reaction === "parry" ? "AZEROTH.Card.Parried" : row.reaction === "ward" ? "AZEROTH.Card.Warded" : "AZEROTH.Card.Blocked", {
      name: flags.targets?.[index]?.name ?? "", n: row.mitigated ?? 0, to: row.to
    }))
    .join(" · ");
  line.append(label, said);
  // A DEFENDER sees no Apply button at all - every block but their own
  // Reaction row is stripped above - and the line is still theirs to read, so
  // it goes at the end of the card's body rather than being dropped.
  if (actions) actions.parentElement?.insertBefore(line, actions);
  else (html.querySelector(".azeroth-card-body") ?? html).append(line);
}

/**
 * Whether a record names a creature this client is not shown: a token the GM
 * has hidden, read to anybody but the GM. A record naming no token, or one
 * whose token has gone, is nobody's secret and is drawn.
 */
function hiddenFromReader(record) {
  if (game.user.isGM || !record?.tokenId) return false;
  const scene = (record.sceneId && game.scenes.get(record.sceneId)) || canvas?.scene || null;
  return scene?.tokens?.get(record.tokenId)?.hidden === true;
}

/**
 * Say what each Resilience Test recorded on a spell card came to (D-726), in
 * words: *Resist · Plagued Ghoul: Failure (9 vs DC 14)*.
 *
 * One line a record, in the order of the rows they answer
 * (`rules/records.mjs#orderedResists`), above the Resist block and outside it,
 * so a reader who is shown no row still reads every result. Drawn from the
 * message's own flag, so every client sees it and a re-render keeps it. **The
 * outcome is a word, never a tint** (CLAUDE.md §12).
 *
 * **WHAT THE TESTS CAME TO IS EVERYBODY'S, EXCEPT FOR A TARGET THIS READER
 * CANNOT SEE.** A GM Hexing a hidden ambusher would otherwise name it, and its
 * Spell DC, in every player's chat. A hidden token's line is dropped for
 * everybody but the GM - the rule a cue's anchor takes - and the block is not
 * gated on ownership, which would take the result off the table it is for.
 */
function showResists(message, html) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  if (flags.kind !== "spell") return;
  const records = orderedResists(flags.resists).filter(r => !hiddenFromReader(r));
  if (!records.length) return;
  const dash = "—";
  const lines = records.map(record => {
    const line = document.createElement("p");
    line.className = "azeroth-card-line azeroth-card-resisted";
    line.dataset.resisted = record.key;
    const label = document.createElement("span");
    label.textContent = game.i18n.localize("AZEROTH.Card.Resist");
    const said = document.createElement("strong");
    said.textContent = game.i18n.format("AZEROTH.Card.ResistOutcome", {
      name: record.name ?? "",
      outcome: game.i18n.localize(record.success ? "AZEROTH.Roll.Outcome.Success" : "AZEROTH.Roll.Outcome.Failure"),
      total: record.total ?? dash,
      dc: record.dc ?? dash
    });
    line.append(label, said);
    return line;
  });
  const block = html.querySelector(".azeroth-card-resists");
  if (block) block.before(...lines);
  else (html.querySelector(".azeroth-card-body") ?? html).append(...lines);
}

/**
 * **WHAT AN AREA'S TEST CAME TO, ON ITS OWN CARD** (the final review of D-757):
 * *Resist · Plagued Ghoul: Failure (9 vs DC 14)*, in `showResists`' own words,
 * drawn off the card's `areaResult` for every reader - and the Resist button
 * taken off, since the Test is made once and there is nothing left to press.
 * A press on a copy of the card rendered before the record is refused at the
 * door in words (`resistTestFromCard`).
 */
function showAreaResult(message, html) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  if (flags.kind !== "areaTest" || !flags.areaResult) return;
  const line = document.createElement("p");
  line.className = "azeroth-card-line azeroth-card-resisted";
  const label = document.createElement("span");
  label.textContent = game.i18n.localize("AZEROTH.Card.Resist");
  const said = document.createElement("strong");
  said.textContent = game.i18n.format("AZEROTH.Card.ResistOutcome", areaResultWords(flags.areaResult));
  line.append(label, said);
  const block = html.querySelector('[data-purpose="area"]')?.closest(".azeroth-card-actions") ?? null;
  if (block) {
    block.before(line);
    block.remove();
  } else (html.querySelector(".azeroth-card-body") ?? html).append(line);
}

/** Whether this client owns the actor a uuid names. A missing one owns nothing. */
function ownsActor(uuid) {
  if (!uuid) return false;
  try {
    return fromUuidSync(uuid)?.isOwner === true;
  } catch {
    return false;
  }
}

/**
 * Every action a chat card may carry, keyed by its `data-action`.
 *
 * Exported so `module/actions.test.mjs` can audit the chat templates against
 * it the way it audits a sheet against its `actions` map. A card button whose
 * action is not a key here warns once in the console and does nothing, which
 * is exactly the silent no-op the audit exists to catch.
 */
export const CARD_ACTIONS = {
  applyDamage: (button, message) => applyDamageToTargets(button, message),
  applyHealing: (button, message) => applyHealingToTargets(button, message),
  placeArea: (button, message) => placeAreaFromCard(message),
  // D-616: the target's Test with the DC on the button, and the attack a
  // feature makes, both through the dialog.
  resistTest: (button, message) => resistTestFromCard(button, message),
  attackFromCard: (button, message) => attackFromCard(button, message),
  // 06 §1's Off-Hand Attack, riding the blow this card records (D-711).
  offHandFromCard: (button, message) => offHandFromCard(button, message),
  // An extra attack a talent offers off this blow (04's Flurry, Wide Swing; D-772).
  extraStrike: (button, message) => extraStrikeFromCard(button, message),
  // **THE RANGER'S AND THE ROGUE'S** (D-773): one more attack a kill gives (Killing
  // Spree, Beast Frenzy), half a blow on a second enemy (Blade Flurry), and a
  // Disengaged step off a blow that missed (Elusive).
  killStrike: (button, message) => killStrikeFromCard(button, message),
  blowShare: (button, message) => blowShareFromCard(button, message),
  evade: (button, message) => evadeFromCard(button, message),
  // A bound creature's attack from its owner's feature card (Sic 'Em, D-643).
  boundAttack: (button, message) => boundAttackFromCard(button, message),
  criticalInjury: (button, message) => criticalInjuryFromCard(message),
  sufferInjury: (button, message) => sufferInjuryFromCard(message),
  applySundered: (button, message) => applySunderedFromCard(button, message),
  applyCondition: (button, message) => applyConditionFromCard(button, message),
  // A lasting spell laid on its targets (2026-09-06).
  applySpellEffect: (button, message) => applySpellEffectFromCard(button, message),
  openingCombo: (button, message) => openingComboFromCard(message),
  stabilize: (button, message) => stabilizeFromCard(button),
  // What a creature's ability called up (D-691): the GM presses it and moves
  // the bodies where they belong.
  placeSummon: (button, message) => placeSummonFromCard(message),
  // A Bane laid on ANOTHER creature (06 SS6's Pummel, 08 SS20's Gorehowl and
  // its two kin; D-693). Nothing in this system carried one until now, so
  // every one of those rows printed its sentence and offered no control.
  layBane: (button, message) => layBaneFromCard(button, message),
  // 06 SS6's two defensive Reactions, pressed by the DEFENDER on the attack's
  // own card. Both refuse in words at their door.
  reactBlock: (button, message) => reactionFromCard(button, message, "block"),
  reactParry: (button, message) => reactionFromCard(button, message, "parry"),
  // The other two (D-694), each offered on a card of its own: the Opportunity
  // Attack a departure provoked, pressed by whoever was left; the Readied
  // action, pressed when the table says the trigger fired.
  opportunityAttack: (button, message) => opportunityFromCard(button, message),
  takeReadied: (button, message) => readiedFromCard(button, message),
  // The shared window a find is claimed in (D-721). The card outlives the
  // offer, so the door says *that offer has been settled* rather than raising
  // an empty frame.
  openLootOffer: button => openLootOffer(button.dataset.offerId),
  // **THE PRIEST'S AND THE SHAMAN'S** (D-774): what a talent offers on a spell's
  // card after the die (Overload's second firing, Ancestral Knowledge's Mana
  // back), and Ancestral Guidance's heal on a friend beside the shaman.
  talentPress: (button, message) => talentPressFromCard(button, message),
  guidanceHeal: (button, message) => guidanceHealFromCard(button, message),
  // **D-779's** (the lead's class answers of 2026-10-03): a Ward pressed from an
  // incoming card by a priest holding 04's Foresight, and a charge taken from 04's
  // Lightwell for a Half-Action.
  foresightWard: (button, message) => foresightWardFromCard(button, message),
  lightwellCharge: (button, message) => lightwellChargeFromCard(button, message)
};

/**
 * **THE PRIESTS THIS CLIENT MAY PRESS A FORESIGHT WARD FOR** (04's Foresight; the
 * lead, 2026-10-03, on O-181: *"Yes"*; D-779): owned characters holding 02's Ward
 * and the talent, sorted so a choice never wobbles.
 *
 * @returns {Actor[]}
 */
function foresightPriests() {
  return (game.actors?.contents ?? [])
    .filter(a => a.type === "character" && a.isOwner && a.hasFeature?.("Ward") && foresightFor(a.takenTalents?.() ?? []))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * **A WARD PRESSED FROM THE INCOMING CARD** (04's Foresight: *You may spend a
 * Reaction to use your Ward class feature after an attack is rolled*; the lead,
 * 2026-10-03, on O-181: *"Yes"*; D-779): the priest - the token this user
 * controls, else their own character, else the only priest they own - uses 02's
 * Ward on the creature this row names, through the feature's own door, which
 * pays, lays the Ward and answers this blow (`effects/wards.mjs#layWard`).
 */
async function foresightWardFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const index = Number(button.dataset.targetIndex);
  const row = Number.isInteger(index) ? (flags.targets?.[index] ?? null) : null;
  if (!row || !targetActorOf(row)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
    return null;
  }
  const priests = foresightPriests();
  const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  const priest = priests.find(p => controlled.some(c => c.id === p.id))
    ?? priests.find(p => p.id === game.user.character?.id)
    ?? (priests.length === 1 ? priests[0] : null);
  if (!priest) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Foresight.NoPriest"));
    return null;
  }
  const ward = priest.items.find(i => i.type === "feature" && i.name === "Ward") ?? null;
  if (!ward) return null;
  return useFeatureWithDialog(priest, ward, null, { targets: [row], foresight: { messageId: message.id, index } });
}

/**
 * **A CHARGE TAKEN FROM 04's LIGHTWELL** (the lead, 2026-10-03, on O-184: *"Other
 * players spend a half-action to expend a charge."*; D-779): the one token this
 * user controls, standing in the font, a friend of the priest's (the priest
 * included, D-755), with a Half-Action left - all judged before anything is spent
 * (`rules/class-answers.mjs#lightwellRefusal`). The charge is claimed on the card
 * first (`claimCardPress`'s `charge`), then the Half-Action is spent, then the
 * priest's tier is restored through the one healing door.
 */
async function lightwellChargeFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const well = flags.lightwell ?? null;
  if (!well) return null;
  const controlled = canvas.tokens?.controlled ?? [];
  const token = controlled.length === 1 ? controlled[0] : null;
  const taker = token?.actor ?? null;
  let priest = null;
  try {
    priest = well.by ? fromUuidSync(well.by) : null;
  } catch {
    priest = null;
  }
  const scene = game.scenes?.get(well.sceneId) ?? null;
  const region = scene?.regions?.get(well.regionId) ?? null;
  let inside = false;
  try {
    inside = Boolean(region && token && token.document?.parent?.id === scene.id && token.document.testInsideRegion(region));
  } catch {
    inside = false;
  }
  const refused = lightwellRefusal({
    takers: controlled.length, standing: Boolean(region), taken: Math.trunc(Number(flags.lightwellTaken)) || 0, charges: well.charges,
    now: Number(game.time?.worldTime) || 0, expires: Number.isFinite(Number(well.expires)) ? Number(well.expires) : Infinity,
    inside, friendly: priest?.documentName === "Actor" && Boolean(taker) && allyOf(priest, taker)
  });
  if (refused) {
    ui.notifications?.warn(game.i18n.format(refused, { name: taker?.name ?? "", feet: LIGHTWELL.feet }));
    return null;
  }
  if (!taker.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: taker.name }));
    return null;
  }
  const short = game.system.azeroth.workflows.turnBudgetRefusal(taker, LIGHTWELL.action);
  if (short) {
    ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
    return null;
  }
  const claimed = await claimCardPress(message, { kind: "charge", uuid: taker.uuid, allowed: well.charges });
  if (!claimed.ok) {
    ui.notifications?.warn(game.i18n.format(claimed.reason ?? "AZEROTH.Lightwell.Spent", { name: taker.name }));
    return null;
  }
  if (!(await game.system.azeroth.workflows.spendTurnBudget(taker, LIGHTWELL.action))) return null;
  const before = taker.system?.health?.value ?? 0;
  await taker.applyHealing(Math.max(1, Math.trunc(Number(well.heal)) || 1), { from: priest?.documentName === "Actor" ? priest : null, feature: true, featureName: LIGHTWELL.talent });
  const left = Math.max(0, (Math.trunc(Number(well.charges)) || 0) - ((Math.trunc(Number(message.flags?.["azeroth-rpg"]?.lightwellTaken)) || 0)));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: taker }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Lightwell.Taken", { name: taker.name, n: Math.max(0, (taker.system?.health?.value ?? before) - before), left })}</p>`,
    flags: { "azeroth-rpg": { kind: "lightwellCharge" } }
  });
}

/**
 * **AN AREA'S RECORD WITH 07's BARRIER'S WARD ON THE CREATURES CHOSEN** (D-779):
 * the card's `remains` row laid beside whatever the spell's own area carries, the
 * area made a rider-bearing one where it carried none.
 *
 * @param {object|null} areaTick  the card's
 * @param {object|null} chosenWard  `rules/class-answers.mjs#chosenWardRemains`'
 */
function withChosenWard(areaTick, chosenWard) {
  if (!chosenWard) return areaTick;
  const base = hasAreaTick(areaTick) ? foundry.utils.deepClone(areaTick) : { ...emptyAreaTick(), who: "creature" };
  base.remains = [...(base.remains ?? []), foundry.utils.deepClone(chosenWard)];
  return base;
}

async function onCardAction(event, message) {
  event.preventDefault();
  const button = event.currentTarget;
  const handler = CARD_ACTIONS[button.dataset.action];
  if (!handler) {
    console.warn(`azeroth-rpg | unhandled chat card action: ${button.dataset.action}`);
    return;
  }
  return handler(button, message);
}

/**
 * Roll the Critical Injury an attack earned.
 *
 * 06 §8: a Critical Injury happens on a natural 20 on an attack, and on
 * reaching 0 Health. The card offers the button only in the first case - the
 * second arrives through damage, not through a roll - and the LOCATION COMES
 * OFF THE CARD, because it was chosen before the attack (D-411) and the table
 * drawn depends on it.
 *
 * The workflow existed and had tests from the day it was written; nothing had
 * ever called it.
 */
async function criticalInjuryFromCard(message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  // The injury is the TARGET's, never the attacker's (the lead, 2026-09-06):
  // the card's first target, else the controlled tokens, and only with
  // nobody named the speaker - the case of a card rolled with no target.
  const injured = flags.targets?.[0] ? targetActorOf(flags.targets[0]) : null;
  const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  const actors = injured ? [injured] : (controlled.length ? controlled : [ChatMessage.getSpeakerActor(message.speaker)].filter(Boolean));
  if (!actors.length) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoTargets"));
    return;
  }
  // **A SPELL'S CRITICAL INJURY** (04's Shatter at rank 2, D-775): the card's one
  // press, recorded on the card before anything is rolled (`claimCardPress`), so a
  // second press - here or on another client - rolls nothing and gives no Mana.
  const spellCard = flags.kind === "spell" && Boolean(flags.spellCritical);
  if (spellCard) {
    const claimed = await claimCardPress(message, { kind: "once", press: "spellCritical" });
    if (!claimed.ok) {
      ui.notifications?.warn(game.i18n.format(claimed.reason ?? "AZEROTH.TalentLine.Pressed", { name: flags.spellName ?? "" }));
      return;
    }
  }
  // **RUIN** (04: *When one of your spells inflicts a Critical Injury, roll twice on
  // the table and take the higher result. At rank 2 you also gain 2 Mana*; D-775):
  // the caster's talent, on a spell's card.
  // Whoever HOLDS the cast, not the speaker (the review, S3): `casterOf`.
  const caster = flags.kind === "spell" ? casterOf(message) : null;
  const ruin = caster && typeof caster.takenTalents === "function" ? ruinFor(caster.takenTalents()) : null;
  for (const actor of actors) {
    await game.system.azeroth.workflows.rollCriticalInjury({ actor, location: flags.location ?? "body", higher: ruin?.higher ? ruin.name : null });
    if (ruin?.mana > 0) await game.system.azeroth.workflows.ruinMana(caster, ruin);
  }
}

/**
 * Place the spell's area of effect on the canvas.
 *
 * The card carries the spell's id rather than its target line, so the area is
 * re-read from the item. A card is a record of a cast, and reparsing the text
 * off the card would mean two places that know 07 §9's grammar.
 */
async function placeAreaFromCard(message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  // WHOEVER HOLDS THE CAST, which is not always the speaker (the review, S3).
  const actor = casterOf(message);
  // A spell's card names the spell; a feature's card names the feature
  // item (D-616), whose area is in 07 §9's phrasing on the item itself.
  const item = actor?.items?.get(flags.spellId ?? flags.itemId)
    ?? (flags.spellUuid ? await fromUuid(flags.spellUuid) : null);

  if (!item) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Area.SpellGone"));
    return;
  }
  // **A FAILED CASTING TEST PLACES NOTHING** (07 §8: *A failed Casting Test
  // costs the Mana and nothing else. The spell does not go off*). The review's
  // N1 refused a failed SUSTAINED spell, which wrote no Sustain and whose
  // outline would answer to nothing; **the lead, 2026-09-26: "Refuse Place area
  // on any failed cast"** - an Instant too, whose outline struck nobody and
  // which the animation layer already refused to draw (D-724). Refused in
  // words, before the Sustain's own check, whatever the spell's span.
  // A casting Use's card says so too (04's Firestorm burns *On success*; D-775).
  if ((flags.kind === "spell" || flags.kind === "feature") && flags.success === false) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Area.FailedCast", { name: flags.spellName ?? item.name }));
    return null;
  }
  // **A SUSTAIN THAT HAS ENDED PLACES NOTHING** (D-756). The card outlives the
  // cast: dropped, out-paid, over the limit or ended by a Critical Injury, the
  // spell is gone and an area placed now would stand for nothing - and the
  // active GM's sweep would delete it the moment it landed.
  if (flags.sustained === true && !castHeld(actor, flags.cast)) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Area.NotSustained", { name: flags.spellName ?? item.name }));
    return null;
  }
  // **ONE AREA A CAST** (the final review of D-757): a second press placed a
  // second Region carrying the same cast, and a creature walking through both
  // was struck by one spell twice. While that cast's Region stands on any
  // scene the card places nothing more, and says so. A timed area taken off by
  // hand may be put down again; **a sustained one may not, because taking it
  // off ENDS the Sustain** (D-760), and the refusal says that rather than
  // inviting the reader to end their own spell to move it.
  if ((flags.kind === "spell" || flags.kind === "feature") && castPlaced(flags.cast)) {
    const already = flags.sustained === true ? "AZEROTH.Area.AlreadyPlacedSustained" : "AZEROTH.Area.AlreadyPlaced";
    ui.notifications?.warn(game.i18n.format(already, { name: flags.spellName ?? item.name }));
    return null;
  }
  // **FROM THE CASTER'S OWN TOKEN, OR FROM NONE** (D-724, D-726). The card
  // recorded which token cast it; a card made before that recorded nothing,
  // and one cast on another scene names a token this board does not hold.
  // All three are answered the same way, by the rule the card itself was
  // recorded with, run over the caster's tokens here and now - and where that
  // names nobody the area takes the steps of a caster with no token (D-723).
  // `guessToken: false` is the point: the door used to fall back to whatever
  // token was SELECTED, which could be anybody's.
  const token = casterTokenOf(flags.source ?? null, actor);
  const region = await placeItemArea({
    item, actor, token, guessToken: false,
    // A talent's wider circle (D-756): Consecrated Ground's rank 2.
    widenFt: Number(flags.widen) || 0,
    // And a talent's longer cone (D-775): Cone of Cold's 5 feet a rank.
    lengthenFt: Number(flags.lengthen) || 0,
    // Which cast placed it (D-724), and what it answers to (D-756): the Region
    // answers to the card and to the Sustain, and nothing is written back onto
    // the card.
    flags: regionFlagsFromCard(message, actor, item)
  });
  // **04's TYPHOON** (*Your Hurricane class feature also pushes everything in its
  // area 10 feet per rank*; D-778; the lead, 2026-10-03, on O-158: *"Yes."* to *away
  // from the area's centre*): once the area stands, every creature in it is moved
  // away from its centre through the forced-movement door - a displacement, never
  // metered and never an Opportunity Attack - on the GM's client where this one does
  // not own the token. *Everything* is read as written: a druid standing in their
  // own Hurricane is pushed with the rest.
  const push = flags.kind === "feature" && region ? cleanForced({ on: "turn", ...(flags.push ?? {}) }) : null;
  if (push && push.feet > 0) {
    const results = await forceFromRegion({ region, feet: push.feet, toward: "away", by: actor });
    const words = results.map(r => forcedWords(r, { toward: "away", source: flags.push.by ?? "" }));
    ui.notifications?.info(words.length
      ? game.i18n.format("AZEROTH.Forced.AreaPushed", { names: words.join(" "), talent: flags.push.by ?? "" })
      : game.i18n.format("AZEROTH.Forced.AreaEmpty", { talent: flags.push.by ?? "" }));
  }
  return region;
}

/**
 * **WHAT A REGION PLACED FROM A SPELL'S CARD CARRIES** (D-724, D-756), under
 * `flags.azeroth-rpg`:
 *
 * - `cast`, `messageId`, `identifier`, `source` - which cast placed it, from
 *   which card, and from the caster's own token (D-724); the animation layer's
 *   loops read the first and the third (D-729).
 * - `caster` - the uuid of whoever holds the Sustain, as `castSpell` recorded
 *   it on the card (the review, S3), else the actor handed in: a world actor
 *   cast from the sidebar while an unlinked token speaks for it holds the
 *   Sustain on the WORLD actor, and the speaker is the token's copy.
 * - `sustained` - whether the cast wrote a Sustain entry. The active GM's sweep
 *   (`canvas/sustained-areas.mjs`) deletes the Region when that entry goes,
 *   and a Region taken off by hand ends that entry (D-760).
 * - `areaTick` - the tick as it stood at the cast, **only where the Casting
 *   Test succeeded**. The card's own door places nothing for a failed cast
 *   (the lead, 2026-09-26); a record built off one by another hand strikes
 *   nobody.
 * - `areaGround` - whether the spell makes its area Difficult ground, off 07's
 *   own sentences (`rules/area-ground.mjs`, D-757); null where the Casting Test
 *   failed, like the tick.
 * - `ground`, `widen` - what a talent lays on the area (Consecrated Ground's
 *   Difficult ground) and how many feet it widened the circle. The reconciler
 *   (`canvas/sustained-areas.mjs#reconcileGround`) lays the behavior.
 * - `dc`, `sl` - the caster's Spell DC the area's Tests are made against, and
 *   the cast's Success Level (Rain of Chaos: *At SL 3 or better*).
 * - `spell` - the name, school and tier the tick's standing bonuses are keyed
 *   by, since a compendium spell cannot be read back synchronously, and the
 *   picture a rider it lays wears.
 * - `lasts` - a timed spell's span in rounds, or null.
 * - `placedAt` - the fight, round and TURN it went down in, and the world's
 *   time, from which a timed area's minute is counted to the same point in
 *   the order ten rounds on (`area-ticks.mjs#areaLapsed`, the review's N3).
 *
 * @param {ChatMessage} message  the spell's card
 * @param {Actor|null} actor     its speaker
 * @param {Item|null} item       the spell
 * @returns {object}
 */
export function regionFlagsFromCard(message, actor, item) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const token = casterTokenOf(flags.source ?? null, actor);
  const source = token ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null;
  const fight = actor?.activeFight?.() ?? null;
  const sys = item?.system ?? {};
  return {
    cast: flags.cast ?? null,
    messageId: message?.id ?? null,
    identifier: flags.identifier ?? null,
    source,
    caster: flags.caster ?? actor?.uuid ?? null,
    sustained: flags.sustained === true,
    // **AND 07's BARRIER'S WARD ON THE CREATURES CHOSEN** (D-779; the lead, 2026-10-03,
    // on O-182: *"Yes"*): a rider for the creatures the cast named, laid by the aura
    // door while each stays inside (`rules/class-answers.mjs#chosenWardRemains`).
    areaTick: flags.success === false ? null : withChosenWard(flags.areaTick ?? null, flags.chosenWard ?? null),
    // Difficult ground (D-757): the spell's own, read off 07's sentences, and a
    // talent's - neither where the Casting Test failed.
    areaGround: flags.success === false ? null : (flags.areaGround ?? null),
    ground: flags.success === false ? null : (flags.ground ?? null),
    widen: Number(flags.widen) || 0,
    // What the area's Tests are made against and what Rain of Chaos's *At SL
    // 3 or better* reads (D-757): the caster's Spell DC and the cast's SL.
    dc: Number.isFinite(Number(flags.spellDC)) && flags.spellDC !== null ? Number(flags.spellDC) : null,
    sl: Number.isFinite(Number(flags.sl)) && flags.sl !== null ? Number(flags.sl) : null,
    spell: {
      name: item?.name ?? flags.spellName ?? null,
      school: sys.school ?? null,
      tier: sys.tier ?? null,
      takesSpellpower: sys.takesSpellpower === true,
      // The picture a rider the area lays wears (D-757).
      img: item?.img ?? flags.spellImg ?? null,
      // An area a FEATURE's card placed (04's Firestorm, D-775) is no spell's:
      // Shadowburn and Burning Soul read it (`area-strikes.mjs#spellBlowOf`).
      ...(flags.kind === "feature" ? { feature: true } : {})
    },
    // A timed area's span (*Instant, 1 minute* is ten rounds), whether or not
    // it strikes anybody: the sweep takes it off when the span is over. A
    // feature's card names its own where it has one (04's Firestorm: *burns until
    // the end of your next turn*; D-775), since a feature carries no Duration.
    lasts: { rounds: Number(flags.lasts?.rounds) > 0 ? Math.trunc(Number(flags.lasts.rounds)) : roundsIn(sys.duration ?? {}) },
    // **WHAT THE AREA DOES THAT ITS TICK DOES NOT** (D-778): the forced move it
    // makes on a creature entering it or starting a turn there (Tempest's push,
    // Void Rift's pull; `effects/area-strikes.mjs`, `AzerothCombat#_areaTicks`), the
    // escape the Entangled its Test lays carries (Rimebind, Thornguard), and the
    // caster's Permafrost on a Slowed it lays - none where the Casting Test failed.
    forced: flags.success === false ? null : areaForced(flags.forced),
    escape: flags.success === false ? null : cleanEscape(flags.escape ?? null),
    slowing: flags.success === false || !(Number(flags.slowing?.feet) > 0) ? null : { feet: Math.trunc(Number(flags.slowing.feet)), source: String(flags.slowing.source ?? "") },
    placedAt: {
      combatId: fight?.id ?? null,
      round: fight ? (fight.round ?? null) : null,
      turn: fight ? (fight.turn ?? null) : null,
      time: game.time?.worldTime ?? 0
    }
  };
}

/** A card's forced move as an area carries it: Tempest's on entering, Void Rift's at a turn's start (D-778). */
function areaForced(raw) {
  const forced = cleanForced(raw ?? null);
  return forced && (forced.on === "enter" || forced.on === "turn") ? forced : null;
}

/** Whether a Region placed for this cast (D-724's key) stands on any scene. */
function castPlaced(cast) {
  if (!cast) return false;
  for (const scene of game.scenes ?? []) {
    if (scene.regions?.some?.(region => region.flags?.["azeroth-rpg"]?.cast === cast)) return true;
  }
  return false;
}

/** Whether a caster still holds the Sustain one cast wrote (D-724's key). */
function castHeld(actor, cast) {
  if (!actor || !cast) return false;
  return (actor.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(entry => entry?.cast === cast);
}

/**
 * **WHOEVER HOLDS A CARD'S CAST** (the review, S3): the uuid `castSpell`
 * recorded as `caster`, else - a card written before it did - the speaker.
 * They differ for a world creature cast from the sidebar while an unlinked
 * token stands for it: core's `getSpeaker` names the token and
 * `getSpeakerActor` hands back the token's copy, while the Sustain was written
 * on the world actor, so the card's own Place area refused the Sustain it had
 * just begun and its Region was swept the moment it landed.
 *
 * @param {ChatMessage} message
 * @returns {Actor|null}
 */
function casterOf(message) {
  const uuid = message?.flags?.["azeroth-rpg"]?.caster ?? null;
  if (uuid) {
    try {
      const actor = fromUuidSync(uuid);
      if (actor) return actor;
    } catch {
      // A caster that is gone answers as the speaker does.
    }
  }
  return ChatMessage.getSpeakerActor(message.speaker);
}

/**
 * The caster's token on the board being viewed, or null (D-726).
 *
 * In order: the token the card recorded, where it stands on this board; else
 * `roll-dialog.mjs#sourceOf` over the caster's tokens now - one controlled,
 * one standing or one linked, never a guess among copies. **A token belonging
 * to any other creature is never the answer**: a synthetic caster is its own
 * token and nothing else, and a world actor is one of the tokens that stand for
 * it.
 *
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} recorded  the card's `source`
 * @param {Actor|null} actor  the card's speaker
 * @returns {TokenDocument|null}
 */
function casterTokenOf(recorded, actor) {
  const scene = canvas?.scene ?? null;
  if (!scene || !actor) return null;
  const onBoard = ref => (ref?.tokenId && (!ref.sceneId || ref.sceneId === scene.id)
    ? scene.tokens.get(ref.tokenId) ?? null
    : null);
  const theirs = doc => Boolean(doc) && doc.actorId === actor.id && (!actor.isToken || doc.id === actor.token?.id);
  const named = onBoard(recorded);
  if (theirs(named)) return named;
  const found = onBoard(sourceOf(actor));
  return theirs(found) ? found : null;
}

/**
 * The target's Resilience Test, from the card (D-616): the Resilience the
 * entry names, against the caster's Spell DC on the button, through the
 * dialog, so the table's Boons and Banes apply.
 *
 * **WHO MAKES IT**, in order (D-726): the actor a turn's prompt names; the
 * creature a spell card's row names, refused in words to anybody who does not
 * own it; every controlled token's actor, each with its own token; the
 * clicker's own character. A spell card's Test is RECORDED on that card
 * (`dice/annotate.mjs#recordResist`), so who resisted is written down; a
 * prompt's, a maneuver's and a feature's are not.
 *
 * **A FAILED CAST OFFERS NO RESIST** (the lead, 2026-09-26; 07 §8: *the spell
 * does not go off*). The card draws none (`castSpell`), and a Resist pressed on
 * a card written before it did is refused here in words.
 *
 * **AN AREA'S TEST IS MADE ONCE** (the final review of D-757): refused in words
 * where its card records one or a press is still in flight, the button held
 * while this runs, the Test recorded on the area's card FIRST
 * (`dice/annotate.mjs#recordAreaTest`), and what it lands landed only where the
 * record was written - so a second press anywhere, on any client, lands nothing.
 */
async function resistTestFromCard(button, message) {
  const resilience = button.dataset.resilience;
  const dc = Number(button.dataset.dc) || null;
  const flags0 = message.flags?.["azeroth-rpg"] ?? {};
  if (button.dataset.purpose === "spell" && flags0.kind === "spell" && flags0.success === false) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Card.ResistFailedCast", { name: flags0.spellName ?? "" }));
    return null;
  }
  const area = button.dataset.purpose === "area";
  if (area) {
    const refused = areaTestRefusal(message);
    if (refused) {
      ui.notifications?.warn(refused);
      return null;
    }
    AREA_PRESSES.add(message.id);
    button.disabled = true;
  }
  try {
    await rollResists(button, message, { resilience, dc, area });
  } finally {
    if (area) {
      AREA_PRESSES.delete(message.id);
      button.disabled = false;
    }
  }
}

/** The area cards a press is in flight on, on this client (`resistTestFromCard`). */
const AREA_PRESSES = new Set();

/** The escape prompts a press is in flight on, on this client (D-778). */
const ESCAPE_PRESSES = new Set();

/**
 * **WHAT A TEST TO BREAK FREE OR TO END A STUN LANDS** (D-778; the lead: *"Yes."*):
 * a pass ends the condition the escape rides - its own effect - and a failure keeps
 * it; 04's Deep Freeze then lays **Stunned** until the end of the CASTER's next turn
 * on a creature that failed its escape from Frost Nova (D-628's rule: the clock is
 * the caster's combatant's). Said in a card's lines, on the client that rolled the
 * Test, which owns the creature.
 *
 * @param {{actor: Actor, effect: ActiveEffect, escape: object, passed: boolean}} o
 */
async function escapeOutcome({ actor, effect, escape, passed }) {
  const condition = game.i18n.localize(AZEROTH.conditions[escape.condition] ?? escape.condition);
  const lines = [];
  if (passed) {
    if (actor.effects.has(effect.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    lines.push(game.i18n.format("AZEROTH.Escape.Freed", { name: actor.name, condition, source: escape.source }));
  } else {
    lines.push(game.i18n.format("AZEROTH.Escape.Held", { name: actor.name, condition, source: escape.source }));
    if (escape.failStun === "casterTurnEnd") {
      const caster = actorAt(escape.by);
      // The caster's next turn's end, or - with the caster in no fight, or gone - a
      // round of the world's clock (D-778's reading for O-161; the review of D-778):
      // a Stun laid with no span at all stood until a hand took it off.
      const span = caster ? untilEndOfNextTurnOrRound(caster) : clockRounds(1);
      const stunned = await applyCondition(actor, "stunned", { until: span });
      lines.push(game.i18n.format(stunned ? "AZEROTH.Escape.Stunned" : "AZEROTH.Escape.NotStunned", {
        name: actor.name, caster: caster?.name ?? "", talents: escape.talents.join(", ")
      }));
    }
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""), flags: { "azeroth-rpg": { kind: "escapeOutcome" } } });
}

/**
 * The token document a Test was made from (D-778): the row's, else the creature's
 * own on the board being viewed - what a forced move on a failure moves.
 *
 * @param {Actor} actor
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} source
 * @returns {TokenDocument|null}
 */
function resisterToken(actor, source) {
  const scene = (source?.sceneId && game.scenes.get(source.sceneId)) || canvas?.scene || null;
  const named = source?.tokenId ? scene?.tokens?.get(source.tokenId) ?? null : null;
  if (named) return named;
  if (actor?.isToken) return actor.token ?? null;
  return actor?.getActiveTokens?.(false, true)?.find(t => t.parent?.id === scene?.id) ?? null;
}

/**
 * **WHAT A FORCED MOVE ON A FAILED TEST IS MEASURED FROM** (D-778): the caster's
 * token (Blast Wave, Gust of Wind: *away from you*), or the centre of the area this
 * card placed (Ley Rift: *toward the center*) - found by the cast's own key on the
 * scene, since the card records no Region (D-724). Null where neither stands.
 *
 * @param {ChatMessage} message  the spell's card
 * @param {{from: string}} forced
 * @param {Scene|null} scene  the moved creature's
 * @returns {{x: number, y: number}|null}
 */
function forcedFromOf(message, forced, scene) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  if (forced.from === "area") {
    const region = flags.cast ? (scene?.regions?.find?.(r => r.flags?.["azeroth-rpg"]?.cast === flags.cast) ?? null) : null;
    return region ? regionCentreOf(region) : null;
  }
  const caster = casterOf(message);
  const recorded = flags.source?.tokenId && (!flags.source.sceneId || flags.source.sceneId === scene?.id)
    ? scene?.tokens?.get(flags.source.tokenId) ?? null : null;
  const token = recorded ?? (caster ? (scene?.tokens?.find?.(t => t.actorId === caster.id && (!caster.isToken || t.id === caster.token?.id)) ?? null) : null);
  return token?.getCenterPoint?.() ?? null;
}

/**
 * Why an area's Test card refuses a press, in words, or null: a Test already
 * recorded on it (*... has already made this Test: Failure (9 vs DC 14)*), or a
 * press of it still in flight on this client.
 */
function areaTestRefusal(message) {
  const done = message.flags?.["azeroth-rpg"]?.areaResult ?? null;
  if (done) return game.i18n.format("AZEROTH.AreaTest.Already", areaResultWords(done));
  if (AREA_PRESSES.has(message.id)) return game.i18n.format("AZEROTH.AreaTest.Pending", { name: areaTestName(message) });
  return null;
}

/**
 * The link an area's Test carries back to its card, as a Resist row's does
 * (`rules/records.mjs#resistLink`): the card, the creature, and the cast.
 */
function areaTestLink(message, actor) {
  const area = message.flags?.["azeroth-rpg"]?.area ?? {};
  return resistLink({
    messageId: message.id, sceneId: area.sceneId ?? null, tokenId: area.tokenId ?? null,
    actorId: actor?.id ?? null, cast: area.cast ?? null
  });
}

/** Roll the card's Test for each resister and land what it lands (`resistTestFromCard`). */
async function rollResists(button, message, { resilience, dc, area }) {
  const rollers = await resistersOf(button, message);
  if (!rollers.length) return;
  const against = resistedBy(button, message);
  const purpose = button.dataset.purpose ?? null;
  // Whoever posted the card: the Snare's maker, the poisoner, the companion's owner's hand.
  const maker = ChatMessage.getSpeakerActor(message.speaker);
  for (const { actor, link, source } of rollers) {
    // **02's SNARE: THE ESCAPE** (D-773): *until it spends an action and passes a
    // Reflex Resilience Test against your Spell DC*. Judged before anything is
    // spent (D-768's order): a creature THIS Snare does not hold has nothing to
    // pull clear of, and a turn with no action left cannot pay - asked of the
    // budget without spending it. The action is spent once the Test is confirmed
    // (the architect's review), so a dismissed dialog costs nothing.
    if (purpose === "snare") {
      const refused = snareEscapeRefusal({ entangled: snareHolds(activeFlagsOf(actor), maker?.uuid ?? null) });
      if (refused) {
        ui.notifications?.warn(game.i18n.format(refused, { name: actor.name }));
        continue;
      }
      const short = game.system.azeroth.workflows.turnBudgetRefusal(actor, SNARE.action);
      if (short) {
        ui.notifications?.warn(game.i18n.format(short.reason, short.params ?? {}));
        continue;
      }
    }
    // **THE TEST TO BREAK FREE OR TO END A STUN** (D-778; the lead, 2026-10-03, on
    // O-159: *"Yes."*): judged before anything is spent - the creature is still held
    // by the effect the prompt names, an escape on its own action has an action left
    // (asked of the budget without spending it, the Snare's way), and the prompt has
    // not been answered already. The talents' Banes ride the Test (04's Frost Nova
    // at rank 2, Absolute Zero), as 07's own *with a Bane* does. **And only an owner
    // of the creature presses it, with the press recordable** (the review of D-778):
    // the prompt names its creature, so anyone else would roll on the wrong client,
    // and a card the GM posted needs a GM online to record the one press - both
    // refused here, before the Test and before the action.
    let escapeHeld = null;
    if (purpose === "escape") {
      const effect = actor.effects.get(button.dataset.effectId ?? "") ?? null;
      const escape = cleanEscape(effect?.flags?.["azeroth-rpg"]?.[ESCAPE_FLAG] ?? null);
      const held = Boolean(effect && escape && effect.statuses?.has?.(escape.condition));
      const short = held && escape.on === "action" ? game.system.azeroth.workflows.turnBudgetRefusal(actor, "action") : null;
      const refused = escapeRefusal({
        held, on: escape?.on ?? "turnEnd", budgetShort: Boolean(short),
        owner: actor.isOwner === true, recordable: !cardPressUnrecordable(message)
      });
      if (refused) {
        ui.notifications?.warn(game.i18n.format(refused, { name: actor.name }));
        continue;
      }
      if (message.flags?.["azeroth-rpg"]?.pressed?.escape || ESCAPE_PRESSES.has(message.id)) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Escape.Already", { name: actor.name }));
        continue;
      }
      escapeHeld = { effect, escape };
    }
    // **04's VILE CONCOCTION** (D-773): *A target already suffering one of your
    // poisons takes a Bane per rank on Resilience Tests against your poisons* - read
    // off the poisoner's talents and the ticks of theirs the creature carries, before
    // this poison's own failure lands.
    let talentBanes = escapeHeld?.escape?.banes > 0
      ? { banes: escapeHeld.escape.banes, names: escapeHeld.escape.talents.length ? escapeHeld.escape.talents : [escapeHeld.escape.source] }
      : null;
    if (purpose === "poison" && maker && typeof maker.takenTalents === "function") {
      const vile = poisonTestBanesFor(maker.takenTalents());
      const suffering = vile.banes > 0 && tickEffectsOf(actor).some(e => isPoisonTickBy(e.flags?.["azeroth-rpg"]?.tick ?? null, maker.uuid));
      if (suffering) talentBanes = { banes: vile.banes, names: [vile.name] };
    }
    const tie = link ?? (area ? areaTestLink(message, actor) : null);
    if (escapeHeld) ESCAPE_PRESSES.add(message.id);
    let result = null;
    try {
      result = await resilienceWithDialog(actor, resilience, null, { dc, link: tie, source, against, ...(talentBanes ? { talentBanes } : {}) });
      // **THE PRESS FIRST, THEN THE ACTION** (the review of D-778; D-768's order and
      // `claimCardPress`'s rule: a card's press is claimed on the card before
      // anything is spent). The prompt is answered ONCE: a press another client
      // recorded first refuses here with the action kept, and the in-flight mark
      // holds until the claim has landed. Then an escape on the creature's own
      // action spends it (the Snare's rule); a budget another door emptied in
      // between refuses in its own words, the press recorded and nothing landed.
      if (purpose === "escape" && result) {
        const claimed = await claimCardPress(message, { kind: "once", press: "escape" });
        if (!claimed.ok) {
          const why = !claimed.reason || claimed.reason === "AZEROTH.TalentLine.Pressed" ? "AZEROTH.Escape.Already" : claimed.reason;
          ui.notifications?.warn(game.i18n.format(why, { name: actor.name }));
          continue;
        }
        if (escapeHeld.escape.on === "action" && !(await game.system.azeroth.workflows.spendTurnBudget(actor, "action"))) continue;
      }
    } finally {
      if (escapeHeld) ESCAPE_PRESSES.delete(message.id);
    }
    // The Snare's action, now that the Test is confirmed; a budget another press
    // emptied in the meantime refuses in its own words and nothing lands.
    if (purpose === "snare" && result && !(await game.system.azeroth.workflows.spendTurnBudget(actor, SNARE.action))) continue;
    const passed = result?.rolls?.[0]?.outcome?.success === true;
    // The Snare's escape, landed (D-773): a pass ends the Entangled, and 04's
    // Entrapment deals its 5 as the creature pulls clear - untyped, as 08 §12's
    // *N damage* is (D-770), and no attack.
    if (purpose === "snare" && result && passed) {
      // Only the Entangled this Snare laid (the architect's review of D-773).
      const held = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[SNARE_FLAG]?.source === maker?.uuid).map(e => e.id);
      if (held.length) await actor.deleteEmbeddedDocuments("ActiveEffect", held);
      const trap = maker && typeof maker.takenTalents === "function" ? snareEscapeFor(maker.takenTalents()) : null;
      const lines = [game.i18n.format("AZEROTH.Snare.Escaped", { name: actor.name })];
      if (trap) {
        const before = actor.system?.health?.value ?? 0;
        await actor.applyDamage(trap.damage, { struck: true, attack: false, location: "body", type: null, by: maker });
        lines.push(game.i18n.format("AZEROTH.Snare.Entrapment", { talent: trap.name, name: actor.name, n: Math.max(0, before - (actor.system?.health?.value ?? before)) }));
      }
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""), flags: { "azeroth-rpg": { kind: "snareEscape" } } });
    }
    // **04's INTIMIDATION** (D-773): *... or takes a Bane for one round per rank* -
    // on every Test (MY READING), lasting, its span the creature's own rounds.
    if (purpose === "intimidation" && result && !passed) {
      const row = (message.flags?.["azeroth-rpg"]?.intimidations ?? [])[Number(button.dataset.intimidateIndex)] ?? null;
      if (row?.bane) {
        const span = spellTiming(actor, { value: row.bane.rounds, units: "rounds", expiry: "turnEnd" });
        const laid = await layBane({ victim: actor, kind: row.bane.kind, banes: row.bane.banes, source: row.name, by: maker, lasting: true, span });
        if (laid) ui.notifications?.info(game.i18n.format("AZEROTH.Intimidation.Laid", { name: actor.name, talent: row.name, n: row.bane.rounds }));
      }
    }
    // **02's CURSE** (*If they fail, all Tests they make have a Bane for 1 minute*;
    // D-775): the feature card's own Resist, a failure laying the Bane on every Test
    // for the minutes the card recorded - Malediction's and Everlasting
    // Affliction's added. Nothing laid it before; the Test was a bare roll.
    const curse = !purpose && message.flags?.["azeroth-rpg"]?.kind === "feature" ? (message.flags["azeroth-rpg"].curse ?? null) : null;
    if (curse && result && !passed) {
      const minutes = Math.max(1, Math.trunc(Number(curse.minutes)) || CURSE.minutes);
      const span = spellTiming(actor, actor.activeFight?.() ? { value: minutes * 10, units: "rounds", expiry: "turnEnd" } : { value: minutes, units: "minutes" });
      const laid = await layBane({ victim: actor, kind: CURSE.bane.kind, banes: CURSE.bane.banes, source: CURSE.feature, by: maker, lasting: true, span });
      if (laid) ui.notifications?.info(game.i18n.format("AZEROTH.Curse.Laid", { name: actor.name, n: minutes }));
    }
    if (link && result) await recordResist({ message, result });
    // **AN AREA'S TEST** (D-757): posted by `effects/area-strikes.mjs#postAreaTest`
    // at the start of a turn in the area or on entering it, and rolled HERE, the
    // spell card's own door - never a second one. What it lands is the area's,
    // and it lands only where its record was written on the card (the final
    // review): a second press lands nothing.
    if (area && result && await recordAreaTest({ message, result })) await areaTestOutcome({ actor, message, result });
    // The dying track (06 SS8): a failure at the turn's start takes a Death Step.
    if (button.dataset.purpose === "deathStep" && result && !result.rolls?.[0]?.outcome?.success) await actor.takeDeathStep?.();
    // A spell's failure lands the conditions its entry names (2026-09-06),
    // with the spell's own span on the fight's clock (D-628).
    if (button.dataset.purpose === "spell" && result && !result.rolls?.[0]?.outcome?.success) {
      const flags = message.flags?.["azeroth-rpg"] ?? {};
      const timing = spellTiming(actor, flags.duration ?? null);
      // **WHAT THE LANDED CONDITION CARRIES** (D-778): the escape 07 gives a held or
      // Stunned creature (Frost Nova's, Absolute Zero's ...; O-159), and 04's
      // Permafrost's feet on a Slowed the caster's spell laid (O-165).
      const escape = cleanEscape(flags.escape ?? null);
      for (const id of flags.onFail?.statuses ?? []) {
        if (!AZEROTH.conditions?.[id]) continue;
        const effect = await applyCondition(actor, id, { until: timing });
        if (effect && escape?.condition === id) await effect.setFlag("azeroth-rpg", ESCAPE_FLAG, escape);
        if (effect && id === "slowed" && Number(flags.slowing?.feet) > 0) await addSlowedFeet(effect, flags.slowing);
      }
      if (flags.onFail?.statuses?.length) {
        ui.notifications?.info(game.i18n.format("AZEROTH.Card.OnFailLanded", {
          name: actor.name, conditions: flags.onFail.statuses.map(id => game.i18n.localize(AZEROTH.conditions[id] ?? id)).join(", ")
        }));
      }
      // **THE FORCED MOVE A FAILURE MAKES** (07's Blast Wave and Gust of Wind: *On a
      // failure it ... is pushed 5 feet away from you*; Ley Rift's pull toward the
      // centre; 04's Blast Wave's feet on it; D-778, O-158): the creature that failed,
      // moved through the one door from the caster's token or the area the card
      // placed - here, on the client that rolled its Test, which owns it.
      const forced = cleanForced(flags.forced ?? null);
      if (forced?.on === "fail") {
        const token = resisterToken(actor, source);
        const from = forcedFromOf(message, forced, token?.parent ?? null);
        const r = await forceMove({ token, from, feet: forced.feet, toward: forced.toward, by: casterOf(message), name: actor.name });
        ui.notifications?.info(forcedWords(r, { toward: forced.toward, source: flags.spellName ?? "" }));
      }
    }
    // **THE TEST 07 GIVES A HELD OR STUNNED CREATURE** (D-778; the lead: *"Yes."*):
    // the prompt a held creature's turn posted, rolled here. A pass ends the
    // condition the escape rides; a failure keeps it, and 04's Deep Freeze lays a
    // Stun until the end of the CASTER's next turn on a creature that fails its
    // escape from Frost Nova.
    if (purpose === "escape" && result && escapeHeld) await escapeOutcome({ actor, effect: escapeHeld.effect, escape: escapeHeld.escape, passed });
    // **08 §12's TICK POISON** (O-114, D-770): *Body Resilience DC 13 or 2
    // damage a turn for 3 turns*. A failure lays the poison's ticks on the
    // creature that failed - stamped on the card when the blow landed, with the
    // poisoner's hand - and a success leaves the weapon's damage alone. Its
    // span is the creature's own rounds in its fight; the count is the rule.
    // **04's PARALYTIC** (D-773): a failure loses the creature its Reaction, and at
    // rank 2 it is Entangled *until it passes a Resilience Test against your
    // poisons* - which the next passed Test of this poisoner's ends.
    if (purpose === "poison" && result && maker && typeof maker.takenTalents === "function") {
      const paralytic = poisonFailFor(maker.takenTalents());
      if (!passed && paralytic.loseReaction) {
        const lost = await loseReaction({ victim: actor, by: maker });
        ui.notifications?.info(reactionLossText(lost));
      }
      if (!passed && paralytic.entangle) {
        const landed = await inflictCondition({ victim: actor, id: "entangled", by: maker, name: actor.name, marks: { [PARALYTIC_FLAG]: { source: maker.uuid } } });
        if (landed.landed) ui.notifications?.info(game.i18n.format("AZEROTH.Paralytic.Entangled", { name: actor.name, talent: paralytic.name }));
      }
      if (passed) {
        const held = (actor.effects ?? []).filter(e => e.statuses?.has?.("entangled") && e.flags?.["azeroth-rpg"]?.[PARALYTIC_FLAG]?.source === maker.uuid);
        if (held.length && actor.isOwner) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", held.map(e => e.id));
          ui.notifications?.info(game.i18n.format("AZEROTH.Paralytic.Freed", { name: actor.name }));
        }
      }
    }
    if (button.dataset.purpose === "poison" && result && !result.rolls?.[0]?.outcome?.success) {
      const poison = (message.flags?.["azeroth-rpg"]?.poisons ?? [])[Number(button.dataset.poisonIndex)] ?? null;
      // **A POISON'S CONDITIONS, WHERE THE CARD CARRIES THEM** (04's Snake Trap,
      // D-779): the Test resists the poison, so its failure lays what the poison
      // lays - a weapon's coating offers its conditions as buttons instead.
      for (const id of poison?.statuses ?? []) {
        if (!AZEROTH.conditions?.[id]) continue;
        const effect = await applyCondition(actor, id, {});
        if (effect) ui.notifications?.info(game.i18n.format("AZEROTH.Card.OnFailLanded", { name: actor.name, conditions: game.i18n.localize(AZEROTH.conditions[id]) }));
      }
      const rounds = poison?.tick?.rounds ?? null;
      // *For 3 turns* is counted at the creature's turn starts, and out of a
      // fight it has none: nothing would end it (the D-770 review, item A).
      // The ONE landing Coated Blades' no-Test poison shares (D-773).
      const held = hasTick(poison?.tick) ? await poisonTakesHold(actor, poison.tick) : null;
      if (held?.reason === "noClock") {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Tick.NoClockOn", { spell: poison.tick.name, name: actor.name }));
      } else if (held?.landed) {
        ui.notifications?.info(game.i18n.format("AZEROTH.Tick.PoisonLanded", {
          name: actor.name, poison: poison.tick.name, amount: poison.tick.amount, rounds: rounds ?? 0
        }));
      }
    }
    // Poisoned (A1): each success sheds one stack.
    if (button.dataset.purpose === "poisoned" && result?.rolls?.[0]?.outcome?.success) {
      const effect = actor.effects.find(e => e.statuses?.has("poisoned"));
      if (effect) {
        const value = (effect.getFlag("azeroth-rpg", "value") ?? 1) - 1;
        if (value <= 0) await actor.toggleStatusEffect("poisoned", { active: false });
        else await effect.setFlag("azeroth-rpg", "value", value);
        ui.notifications?.info(game.i18n.format("AZEROTH.Combat.PoisonShed", { name: actor.name, stacks: Math.max(0, value) }));
      }
    }
  }
}

/**
 * **WHICH CONDITIONS A CARD'S TEST RESISTS**, where the card knows them (D-757):
 * an area's Test names them on its button (its failure's, for the creature it
 * was posted for), a spell card's are the ones its failure lands, a Poisoned
 * prompt resists Poisoned, and a Death Step resists none. A card that knows
 * nothing answers null, and a Boon *against* a condition is then the table's
 * line (`rules/auras.mjs#auraBoonsOn`).
 *
 * @param {HTMLElement} button
 * @param {ChatMessage} message
 * @returns {string[]|null}
 */
function resistedBy(button, message) {
  if (button.dataset.against !== undefined) return button.dataset.against.split(",").filter(Boolean);
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  if (button.dataset.purpose === "spell" && flags.kind === "spell") return [...(flags.onFail?.statuses ?? [])];
  if (button.dataset.purpose === "poisoned") return ["poisoned"];
  // A tick poison's Test resists the POISON, which is no condition (A1: *A
  // poison is not the condition it inflicts*).
  if (button.dataset.purpose === "poison") return [];
  if (button.dataset.purpose === "deathStep") return [];
  // The Snare's escape resists the Entangled it ends; Intimidation's Test, the Bane (D-773).
  if (button.dataset.purpose === "snare") return ["entangled"];
  // The Test 07 gives a held or Stunned creature resists the condition it ends (D-778).
  if (button.dataset.purpose === "escape") return [flags.escape?.condition].filter(Boolean);
  if (button.dataset.purpose === "intimidation") return [];
  return null;
}

/**
 * Who makes a card's Resilience Test, and what each Test carries (D-726):
 * `[{actor, link, source}]`, an empty list where nobody may, with the refusal
 * said.
 *
 * `link` is `rules/records.mjs#resistLink` on a spell card's button and null on
 * anything else, which is what keeps a prompt's Test unrecorded. `source` is the
 * token the Test is made from where the door knows it - the row's, or the
 * controlled one - and a source naming no token is no source at all, so the
 * roll dialog's own rule decides it instead (D-724).
 *
 * @returns {Promise<Array<{actor: Actor, link: object|null, source: object|null}>>}
 */
async function resistersOf(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const recorded = button.dataset.purpose === "spell" && flags.kind === "spell";
  const linkOf = (ids, index = null) => (recorded
    ? resistLink({ ...ids, index, messageId: message.id, spellUuid: flags.spellUuid ?? null, identifier: flags.identifier ?? null, cast: flags.cast ?? null })
    : null);
  const tokenSource = (sceneId, tokenId) => (tokenId ? { sceneId: sceneId ?? null, tokenId } : null);

  // 1. A prompt names its actor - the Poisoned Test at a turn's end (D-628),
  // the Death Step - and records nothing. A name that no longer resolves falls
  // through to the selection, as it always did.
  const named = button.dataset.actorUuid ? await fromUuid(button.dataset.actorUuid) : null;
  if (named) return [{ actor: named, link: null, source: null }];

  // 2. A spell card's row names its target, and the Test is that target's
  // owner's to make.
  const at = button.dataset.targetIndex;
  if (at !== undefined && at !== "") {
    const index = Number(at);
    const row = Number.isInteger(index) ? flags.targets?.[index] ?? null : null;
    // **A token that is not there is nobody** (`annotate.mjs#resisterOf`), and
    // `targetActorOf` is not that rule: it falls back to the row's actor, which
    // for an unlinked token is the BASE actor every other token off it shares.
    // The Test would roll on the world creature and land the condition on all
    // of them. This is also what makes the GM's press on a dead row say so.
    const who = row ? resisterOf(row) : null;
    const actor = who?.actor ?? null;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
      return [];
    }
    if (!actor.isOwner) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
      return [];
    }
    return [{
      actor,
      link: linkOf({ sceneId: row.sceneId ?? null, tokenId: row.tokenId ?? null, actorId: row.actorId ?? null }, index),
      source: tokenSource(row.sceneId, row.tokenId)
    }];
  }

  // 3. Every controlled token's actor, each keeping its own token.
  const controlled = (canvas.tokens?.controlled ?? []).filter(t => t.actor);
  if (controlled.length) {
    return controlled.map(t => {
      const sceneId = t.document?.parent?.id ?? null;
      return { actor: t.actor, link: linkOf({ sceneId, tokenId: t.id, actorId: t.actor.id }), source: tokenSource(sceneId, t.id) };
    });
  }

  // 4. The clicker's own character, from whichever token the rule names.
  const character = game.user.character ?? null;
  if (character) return [{ actor: character, link: linkOf({ actorId: character.id }), source: null }];
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoTargets"));
  return [];
}

/**
 * The attack a feature makes (D-616), from its card: the speaker's equipped
 * weapon, else the first weapon carried, through the attack dialog.
 *
 * **A creature answers with its own block where its hands are empty** (the
 * lead's N2, 2026-09-10). This door has looked for an Item since D-616 and 14
 * prints no equipment (D3 §7), so the Opposed Attack on every creature's Disarm
 * and Riposte card - 06 §7's maneuvers, which the NPC sheet has offered since
 * 2026-09-06 - warned *no weapon* and stopped. A creature swings what a GM put
 * in its hands and row one otherwise; **what it is merely carrying is a loot
 * pile**, so the character's *else the first weapon carried* is the character's
 * alone.
 */
/** The feature cards whose Attack is being made on this client (the architect's review of D-773). */
const FEATURE_ATTACKS_IN_FLIGHT = new Set();

async function attackFromCard(button, message) {
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return;
  }
  const flags0 = message.flags?.["azeroth-rpg"] ?? {};
  if (flags0.kind !== "feature") return attackFromCardNow(button, message, actor, flags0);
  // **A FEATURE CARD'S ATTACKS ARE COUNTED** (the architect's review of D-773).
  // The Use paid the feature's action, so a press costs nothing more
  // (`data-budget="none"`) - and past the allowance the card records
  // (`class-features.mjs#cardAttackAllowance`) it is refused, in words, before
  // anything else happens. Evasion's shape: an in-flight set on this client and
  // the count on the message itself, read again at the write; a dismissed dialog
  // posts nothing and counts nothing.
  if (FEATURE_ATTACKS_IN_FLIGHT.has(message.id)) return null;
  const allowed = flags0.attacks?.allowed ?? null;
  const refused = cardAttackRefusal({ made: Number(message.getFlag("azeroth-rpg", "attacksMade")) || 0, allowed });
  if (refused) {
    ui.notifications?.warn(game.i18n.format(refused, { name: actor.items.get(flags0.itemId)?.name ?? "", n: Math.max(1, Math.trunc(Number(allowed)) || 1) }));
    return null;
  }
  // **THE COUNT IS THE CARD'S, AND A CARD IS ITS AUTHOR'S AND THE GM'S TO WRITE**
  // (the architect's review of D-774): an owner of the actor who did not post the
  // card made the attack and was refused the count, so the press was never
  // counted and could be made for ever. Asked here, before the attack: a card this
  // client may not write needs a GM online to count the press on it.
  if (cardPressUnrecordable(message)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.PressNoGM"));
    return null;
  }
  FEATURE_ATTACKS_IN_FLIGHT.add(message.id);
  try {
    const card = await attackFromCardNow(button, message, actor, flags0);
    // Counted once the attack is made (a dismissed dialog counts nothing), on the
    // GM's client where this one may not write the card.
    if (card) {
      const counted = await claimCardPress(message, { kind: "count", flag: "attacksMade" });
      if (!counted.ok) ui.notifications?.warn(game.i18n.localize(counted.reason ?? "AZEROTH.Card.PressNoGM"));
    }
    return card;
  } finally {
    FEATURE_ATTACKS_IN_FLIGHT.delete(message.id);
  }
}

/** The attack a card's Attack button makes, once the press is allowed. */
async function attackFromCardNow(button, message, actor, flags0) {
  // A creature's ability that attacks (D-647): the descriptor's own numbers
  // through the NPC attack door.
  if (flags0.kind === "ability" && flags0.attack) {
    // 14 §1: *a Boss's Boss Actions are separate from both* - its turn's
    // Half-Actions and its Reaction - and the points were spent when the
    // action was used (D-691), so this blow is charged nothing here. The
    // once-per-round Attack limit it used to be an exception to no longer
    // exists (D-711).
    return npcAttackWithDialog(actor, null, null, {
      attack: flags0.attack,
      title: flags0.title ?? flags0.attack.name ?? null,
      bossAction: flags0.bossAction === true
    });
  }
  // **WHAT IS IN HAND IS `readyWeapons`** (D-769): a shifted character swings
  // its block's first row, and a melded sword is never the fallback.
  const weapons = actor.shape ? [] : actor.items.filter(i => i.type === "weapon");
  const ready = actor.readyWeapons?.() ?? weapons.filter(w => w.system?.equipped);
  const weapon = ready[0]
    ?? (actor.type === "npc" ? null : weapons[0] ?? null);
  // A maneuver's card may fix the DC (Disarm's Opposed Test at 12) and
  // ask for no damage line (D-626).
  const dc = Number(button.dataset.dc) || null;
  if (!weapon) {
    if (actor.type !== "npc" || !actor.system?.attacks?.length) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoWeapon"));
      return;
    }
    return npcAttackWithDialog(actor, 0, null, {
      dc, damage: button.dataset.noDamage === undefined, budget: button.dataset.budget ?? null,
      gainsMomentum: button.dataset.noMomentum === undefined
    });
  }
  return attackWithDialog(actor, weapon, null, {
    dc, damage: button.dataset.noDamage === undefined, budget: button.dataset.budget ?? null,
    gainsMomentum: button.dataset.noMomentum === undefined,
    // 06 §7's Riposte, so 04's Counterstrike line comes ticked (D-711 phase 2).
    riposte: button.dataset.riposte !== undefined
  });
}

/**
 * 06 §1's Off-Hand Attack, from the main-hand card it rides (D-711).
 *
 * *When you Attack with the weapon in your main hand you may also make one
 * attack with the weapon in your off hand. It costs no Half-Action.* The button
 * names the weapon it was drawn for; a weapon taken out of that hand since is
 * refused here rather than swung with something else, and the budget's own
 * one-a-round refuses a second in its own words.
 */
async function offHandFromCard(button, message) {
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return;
  }
  // Out of what the actor fights with NOW (`readyWeapons`, D-769): a weapon that
  // melded into a shape since the card was posted is in nobody's hand.
  const ready = actor.readyWeapons?.() ?? actor.items.filter(i => i.type === "weapon" && i.system?.equipped);
  const weapon = ready.find(w => w?.id && w.id === button.dataset.itemId) ?? null;
  if (!weapon || weapon.type !== "weapon" || weapon.system?.equipped !== true || weapon.system?.offHand !== true) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoOffHand"));
    return;
  }
  return attackWithDialog(actor, weapon, null, { offHand: true });
}

/** The extra attacks pressed and not yet rolled on this client, so a second press waits (D-772). */
const STRIKES_IN_FLIGHT = new Set();

/**
 * **AN EXTRA ATTACK OFF A CARD** (04's Flurry: *Once a round, when an attack
 * reaches SL 2, make one extra attack against the same target. At rank 2 this
 * may happen twice a round*; Wide Swing's Cleave: *one attack against another
 * target within reach at Damage Rating −2. Once per round*; D-772).
 *
 * The order is D-768's: refuse in words, attack, then mark. It costs no
 * Half-Action (`budget: "none"`, the door an Opportunity Attack and a Parry use)
 * and it is ONE attack - it rolls once, as a blow bought with nothing more
 * (`rollsPerAttack`). The round's record is the clock (`markRoundOnce`, D-761),
 * judged before the dialog opens and marked once the attack's card exists, so
 * a dismissed dialog spends nothing; a press already in flight on this client
 * waits.
 *
 * - **Flurry's same target**: the card's own first target, set for the presser
 *   and put back after, as an Opportunity Attack does (`takeOpportunity`).
 * - **Cleave's other target**: what the presser has targeted, and never the
 *   creature this blow struck.
 */
async function extraStrikeFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return null;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
    return null;
  }
  const offer = (flags.extraStrikes ?? []).find(x => x.identifier === button.dataset.strike) ?? null;
  const ready = actor.readyWeapons?.() ?? actor.items.filter(i => i.type === "weapon" && i.system?.equipped);
  const weapon = ready.find(w => w?.id && w.id === (button.dataset.itemId ?? offer?.weaponId)) ?? null;
  if (!offer || !weapon) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Gone", { name: offer?.name ?? "" }));
    return null;
  }
  const key = `${message.id}:${offer.identifier}`;
  if (STRIKES_IN_FLIGHT.has(key)) return null;
  // The round's record: one of the talent's marks still free, or refused.
  const fight = actor.activeFight?.() ?? null;
  const combatant = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  const round = combatant?.getFlag("azeroth-rpg", "round") ?? {};
  const used = combatant && round.number === fight.round ? (round.once ?? []) : [];
  const mark = combatant ? nextRoundMark(offer.identifier, offer.count, used) : null;
  if (combatant && !mark) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: offer.name }));
    return null;
  }
  // Whom it strikes.
  const struck = flags.targets?.[0] ?? null;
  const onCanvas = canvas?.ready === true;
  const previous = onCanvas ? [...(game.user.targets ?? [])].map(t => t.id) : null;
  if (offer.target === "other") {
    const aimed = [...(game.user.targets ?? [])].map(t => t.id);
    if (struck?.tokenId && aimed.includes(struck.tokenId)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.NotSame", { name: offer.name, target: struck.name ?? "" }));
      return null;
    }
  }
  STRIKES_IN_FLIGHT.add(key);
  try {
    if (offer.target === "same" && struck?.tokenId && onCanvas && canvas.tokens?.get(struck.tokenId)) canvas.tokens.setTargets([struck.tokenId]);
    const card = await attackWithDialog(actor, weapon, null, { budget: "none", ratingDelta: Math.trunc(Number(offer.rating)) || 0 });
    if (card && combatant?.isOwner && mark) await combatant.markRoundOnce(mark);
    return card;
  } finally {
    STRIKES_IN_FLIGHT.delete(key);
    if (offer.target === "same" && previous && onCanvas) canvas.tokens.setTargets(previous);
  }
}

/** Each ACTIVE effect's system flags on an actor, as the pure readers take them. */
function activeFlagsOf(actor) {
  return (actor?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {});
}

/** An actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** The round record of a creature's combatant in its fight: `{combatant, used}`. */
function roundRecordOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
  const round = combatant?.getFlag("azeroth-rpg", "round") ?? {};
  return { combatant, used: combatant && round.number === fight.round ? (round.once ?? []) : [] };
}

/** The kill offers pressed and not yet rolled on this client (D-773). */
const KILL_STRIKES_IN_FLIGHT = new Set();

/**
 * **ONE MORE ATTACK A KILL GAVE** (04's Killing Spree: *make one attack
 * immediately against another target within reach*; Beast Frenzy: *Once a round
 * per rank ... it may attack again immediately*; D-773), from the card the damage
 * door posted (`effects/after-blow.mjs#offerKillStrikes`).
 *
 * D-768's order: refuse in words, attack, then mark. The attack costs no budget
 * (`budget: "none"`) and rolls once, as Flurry's does. **The clock**: Beast
 * Frenzy's *once a round per rank* is the striker's round record (`identifier:N`);
 * Killing Spree names no limit, so each offer is good for one attack, marked on
 * the same record under the offer's own card. A Killing Spree aimed at the
 * creature it just killed is refused: *another target*.
 */
async function killStrikeFromCard(button, message) {
  const offer = message.flags?.["azeroth-rpg"]?.killStrike ?? null;
  const striker = actorAt(offer?.strikerUuid);
  if (!offer || !striker) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Gone", { name: offer?.name ?? "" }));
    return null;
  }
  if (!striker.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
    return null;
  }
  if (KILL_STRIKES_IN_FLIGHT.has(message.id)) return null;
  const { combatant, used } = roundRecordOf(striker);
  const key = offer.once ? offer.identifier : `${offer.identifier}@${message.id}`;
  const mark = combatant ? nextRoundMark(key, offer.once ? offer.count : 1, used) : null;
  if (combatant && !mark) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: offer.name }));
    return null;
  }
  if (offer.target === "other") {
    const aimed = [...(game.user.targets ?? [])].map(t => ({ tokenId: t.id, actorId: t.actor?.id ?? null }));
    if (aimed.some(t => namesTarget(offer.killed, t))) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.NotSame", { name: offer.name, target: offer.killed?.name ?? "" }));
      return null;
    }
  }
  KILL_STRIKES_IN_FLIGHT.add(message.id);
  try {
    let card = null;
    if (striker.type === "npc") card = await npcAttackWithDialog(striker, 0, null, { budget: "none" });
    else {
      const ready = striker.readyWeapons?.() ?? [];
      const weapon = ready.find(w => w?.system?.offHand !== true) ?? ready[0] ?? null;
      if (!weapon) {
        ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoWeapon"));
        return null;
      }
      card = await attackWithDialog(striker, weapon, null, { budget: "none" });
    }
    if (card && combatant?.isOwner && mark) await combatant.markRoundOnce(mark);
    return card;
  } finally {
    KILL_STRIKES_IN_FLIGHT.delete(message.id);
  }
}

/**
 * **HALF THE BLOW ON A SECOND ENEMY** (04's Blade Flurry: *Once a round per rank,
 * when you hit with an attack, a second enemy within 5 feet of the target takes
 * half the damage, rounded down*; D-773). The second creature is the one the
 * presser targets - never the creature struck - and where both stand on the
 * viewed scene it must be within the talent's feet of the target, measured
 * between the nearest squares (D-732); otherwise the distance is the table's.
 * **MY READING**: half of what the blow dealt the target, landing as it stands -
 * no second mitigation - and no attack, so it offers no Parry. Written by whoever
 * may write the creature (a GM, most often), and refused in words otherwise.
 */
async function blowShareFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const offer = flags.blowShare ?? null;
  const striker = ChatMessage.getSpeakerActor(message.speaker);
  if (!offer || !striker) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Gone", { name: offer?.name ?? "" }));
    return null;
  }
  const aimed = [...(game.user.targets ?? [])];
  const struck = flags.targets?.[0] ?? null;
  const second = aimed.filter(t => !namesTarget(struck, { tokenId: t.id, actorId: t.actor?.id ?? null }));
  if (second.length !== 1 || !second[0].actor) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowShare.OneTarget", { name: offer.name }));
    return null;
  }
  const token = second[0];
  const victim = token.actor;
  if (!victim.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowShare.NotYours", { name: victim.name }));
    return null;
  }
  const struckToken = struck?.tokenId ? canvas?.tokens?.get(struck.tokenId) ?? null : null;
  if (struckToken && canvas?.grid) {
    const feet = feetApart(struckToken, token);
    if (typeof feet === "number" && feet > (Number(offer.feet) || 0)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.BlowShare.TooFar", { name: offer.name, target: victim.name, feet: Math.round(feet), max: offer.feet }));
      return null;
    }
  }
  const { combatant, used } = roundRecordOf(striker);
  const mark = combatant ? nextRoundMark(offer.identifier, offer.count, used) : null;
  if (combatant && !mark) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: offer.name }));
    return null;
  }
  if (combatant?.isOwner && mark) {
    const marked = await combatant.markRoundOnce(mark);
    if (marked?.added !== true) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: offer.name }));
      return null;
    }
  }
  const before = victim.system?.health?.value ?? 0;
  await victim.applyDamage(Number(offer.half) || 0, { struck: true, attack: false, location: "body", type: flags.damageType ?? null, by: striker });
  const dealt = Math.max(0, before - (victim.system?.health?.value ?? before));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: striker }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.BlowShare.Line", { talent: offer.name, name: victim.name, n: dealt })}</p>`,
    flags: { "azeroth-rpg": { kind: "blowShare" } }
  });
}

/** The evades pressed and not yet settled on this client (D-773). */
const EVADES_IN_FLIGHT = new Set();

/**
 * **A DISENGAGED STEP OFF A BLOW THAT MISSED** (04's Elusive: *When an attack
 * against you misses or deals no damage, you may spend 2 Energy and move 5 feet per
 * rank as though you had Disengaged*; D-773), pressed by the DEFENDER on the
 * attack's own card (`data-reaction-owner`). The price is paid, and the
 * `disengaging` state Disengage itself lays - which no departure provokes (D-694) -
 * holds until the end of the turn the attack was made in; the step is the
 * table's to walk. Once a card.
 */
async function evadeFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const row = (flags.evades ?? []).find(r => r.actorUuid === button.dataset.actorUuid) ?? null;
  const actor = actorAt(row?.actorUuid);
  if (!row || !actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: actor.name }));
    return null;
  }
  const key = `${message.id}:${actor.uuid}`;
  if (EVADES_IN_FLIGHT.has(key) || actor.getFlag("azeroth-rpg", "evaded")?.messageId === message.id) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Evade.Already", { name: actor.name }));
    return null;
  }
  const evade = evadeFor(actor.takenTalents?.() ?? []);
  const pool = evade ? (actor.poolSnapshot?.() ?? []).find(p => p.name === evade.pool) ?? null : null;
  if (!evade || !pool || (pool.value ?? 0) < evade.cost) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Evade.Short", { name: actor.name, talent: evade?.name ?? "", n: evade?.cost ?? 0 }));
    return null;
  }
  EVADES_IN_FLIGHT.add(key);
  try {
    await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value - evade.cost });
    await actor.setFlag("azeroth-rpg", "evaded", { messageId: message.id });
    const fight = actor.activeFight?.() ?? null;
    const span = fight?.started && fight.combatant
      ? { duration: { value: 0, units: "turns", expiry: "turnEnd" }, start: { combat: fight.id, combatant: fight.combatant.id, round: fight.round, turn: fight.turn, time: game.time.worldTime } }
      : null;
    await applyCondition(actor, "disengaging", { until: span });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Evade.Line", { name: actor.name, talent: evade.name, feet: evade.feet, n: evade.cost })}</p>`,
      flags: { "azeroth-rpg": { kind: "evade" } }
    });
  } finally {
    EVADES_IN_FLIGHT.delete(key);
  }
}

/**
 * Apply damage to every selected token's actor.
 *
 * The arithmetic already happened in `rules/mitigation.mjs` when the card was
 * built; this only writes the result, so a card applied twice applies the same
 * number twice rather than recomputing a different one.
 */
/**
 * Who a no-target Apply must NOT reach (the lead's item 24): whoever struck
 * the blow, and - where they are a bound creature - the character they are
 * bound to. **The world actor's id both times**: a token's synthetic actor is
 * a copy and a bond is the world actor's (D-650).
 * @param {Actor|null} attacker
 * @returns {Set<string>}
 */
function excluded(attacker) {
  const out = new Set();
  if (!attacker) return out;
  const world = worldActorOf(attacker) ?? attacker;
  out.add(world.id);
  const ownerUuid = bondOf(world)?.ownerUuid ?? null;
  const owner = ownerUuid ? fromUuidSync(ownerUuid) : null;
  if (owner) out.add((worldActorOf(owner) ?? owner).id);
  return out;
}

// The resolver lives in `dice/annotate.mjs` now (D-720): the GM-side
// annotation has to land on exactly the document a Reaction's door wrote its
// mark on, so one function answers "which actor is this row" for both.

/**
 * Apply Damage. A button on a target row carries its index, and the damage
 * for that row was mitigated against that target's own armour and Ward when
 * the card was made. A button with no row falls back to the controlled
 * tokens, which is the pre-Phase-3 behaviour and the only one available to a
 * card that carried no targets.
 */
async function applyDamageToTargets(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  // WHAT THE TARGET'S SIGNATURE TOOK BACK (08 SS20, D-692): the thorns land on
  // the SPEAKER, who is the one who swung. `applyHealing` has read `data-self`
  // since a drain heals its caster (D-625) and this is the same shape.
  //
  // **A RETALIATION IS A BLOW AND NO ATTACK** (the final review of D-757; the
  // tick's own ruling, S1): 08 §20's thorns and 07's Immolation answering a
  // melee hit spend no Parry or Block mark the swinger holds against an attack,
  // and add no Death Step to a dying swinger (06 §9 counts an attack).
  if (button.dataset.self !== undefined) {
    const self = ChatMessage.getSpeakerActor(message.speaker);
    if (!self) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
      return;
    }
    // What a blow does beyond its target - Killing Blow, a Paladin's Zeal, the
    // damaged mark - runs inside `applyDamage` for every door now (D-768); a
    // retaliation names no attacker, exactly as it always did.
    await self.applyDamage(Number(button.dataset.damage) || 0, { struck: true, attack: false, location: "body", type: button.dataset.damageType || null, messageId: message.id });
    return;
  }
  const index = button.dataset.targetIndex;
  if (index !== undefined && flags.targets?.[Number(index)]) {
    const target = flags.targets[Number(index)];
    const damage = flags.damageByTarget?.[Number(index)]?.damage ?? (Number(button.dataset.damage) || 0);
    const actor = targetActorOf(target);
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
      return;
    }
    // The kind of damage travels with it now (D-691): 14's Regeneration asks
    // whether it has taken Fire since the end of its last turn.
    // The card this Apply came from, so a Parry or a Block marked against THIS
    // attack is the one spent and a mark for another blow stands (D-720).
    // `by` is who struck it: `applyDamage` runs Killing Blow, the Zeal and the
    // damaged mark itself now, once, for every door (D-768).
    // A blow that is no ATTACK (04's Holy Shield answering a Block, D-772) says
    // so on its card, as a retaliation and a tick are no attack (S1).
    // And whether the blow was 06 §7's Riposte (04's Killing Spree, D-773).
    // **AND WHAT KIND, AND WHAT A WARD TOOK OFF IT** (D-774): a spell's card
    // records no `damageType` of its own and its row carries the school, which
    // 14's Regeneration, Vampiric Touch and a priest's Ward (Atonement,
    // Absorption) read at the damage door.
    const row = flags.damageByTarget?.[Number(index)] ?? null;
    await actor.applyDamage(damage, {
      struck: true, attack: flags.notAttack !== true, location: flags.location ?? "body", type: flags.damageType ?? row?.type ?? null,
      messageId: message.id, by: ChatMessage.getSpeakerActor(message.speaker), riposte: flags.riposte === true,
      wardTook: Math.max(0, Math.trunc(Number(row?.wardTook)) || 0),
      // A spell's card (D-775): 04's Shadowburn and Ruin read whether a SPELL dealt it.
      spell: flags.kind === "spell",
      // **THE BLOW'S SECOND AMOUNTS, EACH OF ITS OWN TYPE** (D-777): already in the
      // row's damage; the door records each type dealt and each Ward's credit.
      parts: Array.isArray(row?.parts) ? row.parts : null
    });
    return;
  }
  const damage = Number(button.dataset.damage) || 0;
  const attacker = ChatMessage.getSpeakerActor(message.speaker);
  const controlled = canvas.tokens?.controlled ?? [];
  // **A BLOW NEVER FALLS BACK ONTO WHOEVER STRUCK IT** (the lead's item 24).
  // With nothing targeted the fallback reaches the SELECTED tokens, and the
  // token a shaman has selected is their own - so rolling a Searing Totem's
  // attack from its sheet and pressing Apply took the damage off the shaman.
  // The totem is a bound creature, so its owner is excluded with it (D-643):
  // a thing bound to a character does not turn on that character.
  //
  // A card that really does hurt its own speaker carries `data-self` and was
  // answered above (08 §20's thorns, D-692). Anything else can still be
  // applied to the attacker by TARGETING them, which takes the indexed path.
  const skip = excluded(attacker);
  const targets = controlled.filter(t => t.actor && !skip.has(worldActorOf(t.actor)?.id ?? t.actor.id));
  if (!targets.length) {
    ui.notifications?.warn(game.i18n.localize(controlled.length ? "AZEROTH.Card.NoTargetsButSelf" : "AZEROTH.Card.NoTargets"));
    return;
  }
  for (const token of targets) {
    await token.actor?.applyDamage(damage, { struck: true, location: flags.location ?? "body", type: flags.damageType ?? null, messageId: message.id, by: attacker, riposte: flags.riposte === true, spell: flags.kind === "spell" });
  }
}

/**
 * Apply a feature's healing (D-612): to the card's targets where it named
 * them, else to the controlled tokens, else - a self-heal like Second Wind -
 * to the speaker. Through `applyHealing`, so the number floats off the token.
 *
 * **WHETHER THIS WAS A SPELL IS THE CARD'S OWN FLAG** (2026-09-10). 08 §20's
 * Vestments of Transcendence add 2 Health *with every **spell** that restores
 * any*, and `applyHealing` used to add it to anything with a giver - a healing
 * draught, a Signature's Use, and Lay on Hands, which 02 owns as a class
 * feature and is not a spell at any tier (CLAUDE.md §20). `kind` is written by
 * `castSpell` and by nothing else, so it is the honest reading.
 */
async function applyHealingToTargets(button, message) {
  const amount = Number(button.dataset.heal) || 0;
  if (amount <= 0) return;
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const spell = flags.kind === "spell";
  // A class feature's heal (D-771): what 04's Gift of Nature reaches beside a
  // spell's - *your healing spells and features* - and the Vestments do not.
  const feature = flags.kind === "feature";
  // A drain heals the caster and nobody else (D-625). **AND WHAT WOULD LAND ABOVE
  // THE MAXIMUM IS KEPT** where the entry says so (07's Grave Coil and
  // Exsanguinate: *any of it above your Health maximum is kept as temporary
  // Health*; D-777), the card's own flag.
  if (button.dataset.self !== undefined) {
    const self = ChatMessage.getSpeakerActor(message.speaker);
    if (!self) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
      return;
    }
    return self.applyHealing(amount, { overflow: flags.healOverflow === true, overflowSource: flags.spellName ?? "" });
  }
  // The healer is the speaker: a rung reduces what another creature's healing does (10 §4).
  const from = ChatMessage.getSpeakerActor(message.speaker);
  // **WHICH FEATURE HEALS** (D-777): 04's Light's Grace reads *Casting Mend*.
  const featureName = feature ? (from?.items?.get?.(flags.itemId)?.name ?? null) : null;
  // **WHAT THE CARD CARRIES TO THE ONE HEALING DOOR** (D-779): the schools 04's Divine
  // Aegis was named for at the cast, and 04's Miracle's heal nothing reduces.
  const riders = { aegis: flags.aegis ?? null, unreduced: flags.miracle === true };
  const index = button.dataset.targetIndex;
  if (index !== undefined && flags.targets?.[Number(index)]) {
    const actor = targetActorOf(flags.targets[Number(index)]);
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
      return;
    }
    return actor.applyHealing(amount, { from, spell, feature, featureName, ...riders });
  }
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length) {
    for (const token of controlled) await token.actor?.applyHealing(amount, { from, spell, feature, featureName, ...riders });
    return;
  }
  const speaker = ChatMessage.getSpeakerActor(message.speaker);
  if (!speaker) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoTargets"));
    return;
  }
  // **A SELF-HEAL'S HEALER IS THE SPEAKER** (D-771, found on the way): this
  // passed no giver, so what the healer adds - Gift of Nature, and the
  // Vestments' *a Priest healing themselves is still the giver* - never reached
  // a heal that fell back to the one who gave it.
  return speaker.applyHealing(amount, { from: speaker, spell, feature, featureName, ...riders });
}

/** The presses a card has taken on this client, so a double click is one (D-774). */
const TALENT_PRESSES_IN_FLIGHT = new Set();

/**
 * **WHAT A TALENT OFFERS ON A SPELL'S CARD AFTER THE DIE** (D-774):
 *
 * - **Overload** (04: *When a Casting Test you make for a spell that deals damage
 *   meets or exceeds SL 3, that spell fires a second time at half damage, rounded
 *   down, against the same target*): a card of its own with an Apply at each of
 *   the same targets, the half mitigated through each one's Ward as the first
 *   firing was;
 * - **Ancestral Knowledge** (*A Casting Test of yours that fails costs no Mana*):
 *   the Mana the failed Test paid, back into the pool it came from.
 *
 * Each strikes a use of the counter its talent grants, judged again at the press
 * (a use left), and each card takes ONE press of each - an in-flight set on this
 * client (the architect's review of D-773's shape) and **the press recorded on the
 * card BEFORE the use is struck** (the architect's review of D-774): a card may be
 * written by its author and a GM alone, so an owner of the caster who did not post
 * the card had the use struck and was then refused the write. The record goes
 * through `effects/card-presses.mjs`, on the GM's client where this one may not
 * write the card, and with no GM online it is refused in words with nothing spent.
 * The caster's own client presses.
 */
async function talentPressFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const press = button.dataset.press;
  const row = press === "overload" ? flags.overload : press === "refund" ? flags.refund : null;
  const caster = casterOf(message) ?? ChatMessage.getSpeakerActor(message.speaker);
  if (!row || !caster) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return null;
  }
  if (!caster.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
    return null;
  }
  const key = `${message.id}:${press}`;
  if (TALENT_PRESSES_IN_FLIGHT.has(key)) return null;
  TALENT_PRESSES_IN_FLIGHT.add(key);
  try {
    // Every refusal first: a use left, read without striking it.
    const w = game.system.azeroth.workflows;
    if (w.talentUsesLeft(caster, row.identifier) < 1) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.TalentLine.NoUsesLeft", { name: row.name }));
      return null;
    }
    // Then the press, recorded on the card - the one write here that is not the caster's.
    const claimed = await claimCardPress(message, { kind: "once", press });
    if (!claimed.ok) {
      ui.notifications?.warn(game.i18n.format(claimed.reason ?? "AZEROTH.TalentLine.Pressed", { name: row.name }));
      return null;
    }
    // And only then the use. A use spent elsewhere in between leaves the press
    // recorded and nothing bought, said in words.
    if (!(await w.strikeTalentUse(caster, row.identifier))) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.TalentLine.NoUsesLeft", { name: row.name }));
      return null;
    }
    if (press === "refund") {
      const pool = (caster.poolSnapshot?.() ?? []).find(p => p.name === "mana" && (!row.itemId || p.itemId === row.itemId))
        ?? (caster.poolSnapshot?.() ?? []).find(p => p.name === "mana") ?? null;
      const value = pool ? Math.min(pool.max, pool.value + (Math.trunc(Number(row.mana)) || 0)) : null;
      if (pool && value > pool.value) await caster.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
      ui.notifications?.info(game.i18n.format("AZEROTH.AncestralKnowledge.Done", { name: caster.name, n: pool ? value - pool.value : 0 }));
      return true;
    }
    // Overload: the second firing, on a card of its own.
    const targets = flags.targets ?? [];
    const byTarget = row.byTarget ?? [];
    const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs", {
      config: AZEROTH, title: game.i18n.format("AZEROTH.Overload.Title", { spell: flags.spellName ?? "" }), subtitle: row.name,
      damage: { final: byTarget[0]?.damage ?? row.rating, explanation: game.i18n.format("AZEROTH.Overload.Explanation", { n: row.rating }) },
      targets: targets.map((t, index) => ({ ...t, index })),
      speakerName: caster.name
    });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content,
      flags: { "azeroth-rpg": { kind: "overload", targets, damageByTarget: byTarget, damageType: row.school ?? null } }
    });
  } finally {
    TALENT_PRESSES_IN_FLIGHT.delete(key);
  }
}

/**
 * **ANCESTRAL GUIDANCE** (04: *When your Earthliving triggers, one friendly target
 * within 10 feet restores the same amount. At rank 2 a second friendly target
 * within 10 feet does as well*; D-774): the shaman's attack card offers the heal
 * on a friend - the one the user targets, else the one selected - judged at the
 * press: friendly, not the shaman (Earthliving already healed them; MY READING,
 * for the lead), within the reach of the shaman measured where both stand, and
 * the card's presses under the rank's count (a card that heals counts its
 * presses, the architect's review of D-773), **never the same friend twice** (04:
 * *a second friendly target*; the architect's review of D-774) - the creatures
 * healed recorded on the card with the count, BEFORE the heal, through
 * `effects/card-presses.mjs`. The shaman's own client presses, as Overload's
 * does; a friend another player owns is healed on the active GM's client
 * (`effects/gifts.mjs#healAlly`, never `game.socket`), and with no GM online the
 * press is refused in words before anything is written.
 */
async function guidanceHealFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const g = flags.guidance ?? null;
  const shaman = ChatMessage.getSpeakerActor(message.speaker);
  if (!g || !shaman) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return null;
  }
  if (!shaman.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
    return null;
  }
  const key = `${message.id}:guidance`;
  if (TALENT_PRESSES_IN_FLIGHT.has(key)) return null;
  // The count as the card stands, said before anything is chosen; judged again
  // where the press is recorded.
  const refused = cardHealRefusal({ made: Number(message.getFlag("azeroth-rpg", "guidanceMade")) || 0, allowed: g.count });
  if (refused) {
    ui.notifications?.warn(game.i18n.format(refused, { name: g.name, n: g.count }));
    return null;
  }
  const token = [...(game.user?.targets ?? [])][0] ?? (canvas.tokens?.controlled ?? [])[0] ?? null;
  const friend = token?.actor ?? null;
  if (!friend || friend.uuid === shaman.uuid || worldActorOf(friend)?.uuid === worldActorOf(shaman)?.uuid) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Guidance.NoFriend", { name: g.name }));
    return null;
  }
  if (token.document?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: g.name, target: friend.name }));
    return null;
  }
  const apart = feetBetweenTokens(shaman.getActiveTokens?.(true)?.[0] ?? null, token);
  if (apart !== null && apart > g.feet) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Guidance.TooFar", { name: friend.name, feet: g.feet }));
    return null;
  }
  // A friend this client may not heal needs a GM to heal it: asked before the
  // press is recorded.
  if (gmAbsentFor({ owned: [friend.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Gift.NoGM"));
    return null;
  }
  TALENT_PRESSES_IN_FLIGHT.add(key);
  try {
    // The press and the friend, recorded on the card before the heal: a second
    // press at the same friend is refused in words.
    const claimed = await claimCardPress(message, { kind: "heal", uuid: friend.uuid, allowed: g.count });
    if (!claimed.ok) {
      ui.notifications?.warn(game.i18n.format(claimed.reason ?? "AZEROTH.Card.HealsSpent", { name: g.name, n: g.count, target: friend.name }));
      return null;
    }
    return await healAlly({ giver: shaman, recipient: friend, amount: Math.trunc(Number(g.heal)) || 0 });
  } finally {
    TALENT_PRESSES_IN_FLIGHT.delete(key);
  }
}

/** Suffer: the victim's owner or the GM puts the injury on the character. */
async function sufferInjuryFromCard(message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return;
  }
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
    return;
  }
  return game.system.azeroth.workflows.sufferInjury({
    actor, location: flags.location ?? "body", band: flags.band ?? null, result: flags.result ?? null
  });
}

/**
 * The actors a card's button reaches (D-626): the row's named target, else
 * every controlled token's actor. Warns where there is nobody.
 */
async function actorsFor(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const index = button.dataset.targetIndex;
  if (index !== undefined && flags.targets?.[Number(index)]) {
    const actor = targetActorOf(flags.targets[Number(index)]);
    if (!actor) ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
    return actor ? [actor] : [];
  }
  const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  if (!controlled.length) ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NoTargets"));
  return controlled;
}

/**
 * The bound creature's attack (D-643), through the NPC attack door with its
 * bond's damage bonus on the Rating.
 *
 * **THE BUTTON NAMES WHICH CREATURE** (the lead's item 24). The card carries a
 * button per creature the feature acts on and each one says which - a shaman
 * standing four totems (D-710) had four rows and one button, and that button
 * swung `boundOf(owner, kind)[0]` whichever row was read. A card written
 * before the flag carries no `data-bound-uuid` and falls back to exactly what
 * it did before.
 */
async function boundAttackFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const owner = ChatMessage.getSpeakerActor(message.speaker);
  const kind = flags.bound?.kind ?? null;
  const uuid = button?.dataset?.boundUuid ?? null;
  const named = uuid ? worldActorOf(fromUuidSync(uuid)) : null;
  const creature = named ?? (owner ? boundOf(owner, kind)[0] ?? null : null);
  if (!creature) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.NoCreature", { name: owner?.name ?? "", kind: game.i18n.localize(AZEROTH.boundKinds[kind] ?? kind ?? "") }));
    return null;
  }
  return npcAttackWithDialog(creature, 0, null, { title: game.i18n.format("AZEROTH.Bound.Attack", { name: creature.name }) });
}

/**
 * Sunder (05 SS11): an effect on the target taking the card's amount off
 * every location's Armor Points until the target's next Short Rest, which
 * `AzerothActor#clearSundered` honours. Each Sunder is its own effect.
 */
async function applySunderedFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  // The maneuver's card carries the amount in its flags; Sundering's button
  // carries its own, because a blow may fire it on a card that is not one
  // (08 §5, D-691).
  const amount = Math.max(1, Number(button?.dataset?.sunder) || Number(flags.sunder) || 1);
  const speaker = ChatMessage.getSpeakerActor(message.speaker);
  for (const actor of await actorsFor(button, message)) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("AZEROTH.Effect.Sundered"),
      img: "icons/svg/hazard.svg",
      origin: speaker?.uuid ?? null,
      system: { changes: sunderedChanges(amount) },
      flags: { "azeroth-rpg": { sundered: true } }
    }]);
    ui.notifications?.info(game.i18n.format("AZEROTH.Card.SunderedApplied", { name: actor.name, amount }));
  }
}

/**
 * Place what the ability called up (D-691, decision 2): the count and the
 * block off the card's own flags, around the summoner, on its side. The
 * points were spent when the action was used.
 */
async function placeSummonFromCard(message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const summon = flags.summon ?? null;
  const summoner = ChatMessage.getSpeakerActor(message.speaker);
  if (!summon?.entry || !summoner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return;
  }
  const done = await placeSummon({ summoner, entry: summon.entry, count: summon.count ?? 1, side: summon.side ?? "summoner" });
  if (!done) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: summoner }),
    content: `<p class="azeroth-drain">${game.i18n.format(
      summon.from === "now" ? "AZEROTH.Summon.ArrivedNow" : "AZEROTH.Summon.Arrived",
      { count: done.count, name: done.name, summoner: summoner.name }
    )}</p>`,
    flags: { "azeroth-rpg": { kind: "summon", entry: done.name, count: done.count } }
  });
}

/** Put a condition the card names on the target (Overbear's Prone, D-626). */
async function applyConditionFromCard(button, message) {
  const id = button.dataset.condition;
  if (!id || !AZEROTH.conditions?.[id]) return;
  // A value and a duration where the card carries them (D-647), through
  // D-628's door so the condition expires with the fight's own clock.
  const value = button.dataset.value ? Number(button.dataset.value) : null;
  // *Until the start of YOUR next turn* (02's Hurricane, D-771) is the
  // CASTER's turn: the span is keyed on the card's caster's combatant, which
  // `untilNextTurn` builds where it is handed that actor.
  const caster = button.dataset.until === "casterTurnStart" ? casterOf(message) : null;
  const until = button.dataset.until === "casterTurnStart"
    ? (caster ? (untilNextTurn(caster) ?? null) : null)
    : (button.dataset.until || null);
  // A Signature that answers the blow leaves its condition on the SPEAKER
  // (Stygian Buckler's Slowed, 08 SS20; D-692) - never on the creature that
  // was struck, which is what every other condition button reaches.
  const actors = button.dataset.self !== undefined
    ? [ChatMessage.getSpeakerActor(message.speaker)].filter(Boolean)
    : await actorsFor(button, message);
  // **02's SNARE MARKS THE ENTANGLED IT LAYS** (the architect's review of D-773):
  // its escape ends that effect and nothing another source laid (Entangling
  // Roots). One Entangled stands on a creature at a time, so the Snare marks only
  // an effect it made - a creature already Entangled is not the Snare's catch.
  const snareMaker = message.flags?.["azeroth-rpg"]?.snare === true && id === SNARE.condition
    ? ChatMessage.getSpeakerActor(message.speaker) : null;
  // **04's PERMAFROST ON A SLOWED THE CARD LAYS** (02's Hurricane's Slowed; D-778,
  // O-165): the caster's feet, carried on the card at the Use, ride the Slowed's own
  // effect beside A1's halving - never a Signature's answer on its own speaker.
  const slowing = id === "slowed" && button.dataset.self === undefined ? (message.flags?.["azeroth-rpg"]?.slowing ?? null) : null;
  for (const actor of actors) {
    const fresh = Boolean(snareMaker) && !actor.statuses?.has(id);
    if (value !== null || until) await applyCondition(actor, id, { value, until });
    else if (!actor.statuses?.has(id)) await actor.toggleStatusEffect(id, { active: true });
    if (fresh) {
      const laid = actor.effects.find(e => e.statuses?.has(id)) ?? null;
      if (laid) await laid.setFlag("azeroth-rpg", SNARE_FLAG, { source: snareMaker.uuid });
    }
    if (slowing?.feet > 0 && actor.isOwner) {
      const laid = actor.effects.find(e => e.statuses?.has(id)) ?? null;
      if (laid) await addSlowedFeet(laid, slowing);
    }
  }
}

/**
 * A lasting spell laid on an actor (2026-09-06): one Active Effect named for
 * the spell, carrying the entry's text, the changes its words state in the
 * `final` phase (D-596), the conditions it names, and the spell's span on
 * v14's own clock. A second casting replaces the first - the effect is
 * keyed by the spell's uuid on its flag - which is what 07's entries say of
 * themselves. The caster's own spell lands on the caster; a targeted one on
 * the card's targets, else the controlled tokens.
 */
async function applySpellEffectFromCard(button, message) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const speaker = ChatMessage.getSpeakerActor(message.speaker);
  const actors = button.dataset.self !== undefined ? [speaker].filter(Boolean) : await actorsFor(button, message);
  if (!actors.length) return;
  // The effect's origin is whoever HOLDS the cast (S3), because that is what
  // `liftSpellEffects` matches when the Sustain ends.
  const origin = casterOf(message)?.uuid ?? speaker?.uuid ?? null;
  // A self-centred tick rides the effect it is carried by (Tree of Life), with
  // what its standing bonuses are keyed by: a spell cast by name from the pack
  // is on no actor for the tick to read it back from (the review, S6).
  const selfTick = flags.areaTick?.centre === "self" ? { areaTick: flags.areaTick, tickSpell: flags.tickSpell ?? null } : {};
  const spellUuid = flags.spellUuid ?? null;
  const applies = flags.applies ?? { changes: [], statuses: [] };
  // **THE TICK THE CAST STAMPED** (D-770): damage or healing at the start of
  // each of the creature's turns, which `AzerothCombat#_turnTicks` lands and
  // counts down. *Until the end of your next turn* is the CASTER's turn, so
  // that span is keyed on the caster's combatant rather than the target's.
  const tick = hasTick(flags.tick) ? flags.tick : null;
  // **07's FLOOR** (Aegis of the Light: *Until the end of your next turn no target
  // may be reduced below 1 Health by any source*; D-777): laid on each target and
  // held at the one damage door, *your next turn* the CASTER's, as a tick's is.
  const floor = flags.floor && typeof flags.floor === "object" ? flags.floor : null;
  const holder = tick?.until === "casterTurnEnd" || floor ? casterOf(message) : null;
  // **05's TEMPORARY HEALTH THE CARD CARRIES** (Power Word: Shield, Ice Barrier;
  // D-777): granted with the effect it rides, and gone when that effect goes.
  const temporary = flags.temporaryHealth && Number(flags.temporaryHealth.amount) > 0 ? flags.temporaryHealth : null;
  const casterFights = Boolean(casterOf(message)?.activeFight?.());
  // **A HEAL OVER TIME'S WARD** (04's Nature's Ward: *Your ongoing healing
  // effects also grant Ward 1 per rank against Nature or against Shadow, chosen
  // when the effect begins*; D-771): asked of whoever lays it, once a press,
  // and carried on the laid effect as its own `final` change.
  const layer = tick?.kind === "heal" ? casterOf(message) : null;
  const ward = layer?.takenTalents ? tickWardFor(layer.takenTalents()) : null;
  // Asked only where this press lays the heal on somebody: a creature this
  // client may write, whose tick has a clock to end on (the D-770 review, item A).
  const laysAHeal = Boolean(ward) && actors.some(a => a.isOwner
    && tickHasClock(tick, { duration: flags.duration ?? null, carrierInFight: Boolean(a.activeFight?.()), casterInFight: casterFights }));
  let wardSchool = null;
  if (laysAHeal) {
    const talent = layer.items?.get(ward.talentId) ?? null;
    const options = ward.schools.map(key => ({ key, name: game.i18n.localize(AZEROTH.schools[key] ?? key), description: "" }));
    const pick = talent
      ? await game.system.azeroth.workflows.chooseOption(talent, options, null, { prompt: game.i18n.format("AZEROTH.Tick.WardPrompt", { name: ward.name, n: ward.amount }) })
      : null;
    // Dismissed: the heal is laid and carries no Ward, said in words.
    if (!pick) ui.notifications?.info(game.i18n.format("AZEROTH.Tick.WardNone", { name: ward.name }));
    wardSchool = pick?.key ?? null;
  }
  const wardChanges = tickWardChanges(ward, wardSchool);
  for (const actor of actors) {
    if (!actor.isOwner) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours"));
      continue;
    }
    // **A COUNTED TICK WITH NOTHING TO END IT IS NOT LAID** (the D-770 review,
    // item A), judged for THIS creature as the Apply is pressed: a card cast in
    // a fight and pressed after it, or pressed for a creature in none, would
    // lay a tick that never counts down. What else the spell lays still lands;
    // a spell that lays nothing else lays nothing.
    const tickHere = tick && tickHasClock(tick, { duration: flags.duration ?? null, carrierInFight: Boolean(actor.activeFight?.()), casterInFight: casterFights }) ? tick : null;
    if (tick && !tickHere) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Tick.NoClockOn", { spell: tick.name || flags.spellName || "", name: actor.name }));
      const laysMore = (applies.changes ?? []).length > 0 || (applies.statuses ?? []).length > 0 || Boolean(selfTick.areaTick) || flags.areaGround?.ignores === true
        || Boolean(floor) || Boolean(temporary);
      if (!laysMore) continue;
    }
    // A floor *until the end of your next turn* has no turn to end on out of the
    // caster's fight, and is not laid where nothing would end it (the D-770
    // review's rule for a tick), said in words.
    const floorHere = floor && holder && untilEndOfNextTurn(holder) ? floor : null;
    if (floor && !floorHere) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.AegisLight.NoClock", { spell: flags.spellName ?? "", name: actor.name }));
      const laysMore = (applies.changes ?? []).length > 0 || (applies.statuses ?? []).length > 0 || Boolean(tickHere) || Boolean(temporary);
      if (!laysMore) continue;
    }
    // A second casting replaces the first, and a pool's cap raised by one
    // spell does not stack with another's on the same pool (07: Arcane
    // Brilliance *does not stack with Arcane Intellect*, 2026-09-06).
    const poolKeys = (applies.changes ?? []).filter(c => c.type === POOL_CHANGE_TYPE).map(c => c.key);
    const stale = actor.effects.filter(e => {
      if (!e.getFlag("azeroth-rpg", "spell")) return false;
      if (spellUuid && e.getFlag("azeroth-rpg", "spell") === spellUuid) return true;
      return (e.system?.changes ?? []).some(c => c.type === POOL_CHANGE_TYPE && poolKeys.includes(c.key));
    }).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    const timing = (holder ? untilEndOfNextTurn(holder) : null) ?? spellTiming(actor, flags.duration ?? null) ?? {};
    // A condition the body refuses stays off (10 §4, §6).
    const statuses = (applies.statuses ?? []).filter(id => AZEROTH.conditions?.[id] && !(actor.system?.conditionImmunities ?? []).includes(id));
    const [laid] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: flags.spellName ?? message.flavor ?? "Spell",
      img: flags.spellImg ?? "icons/svg/aura.svg",
      origin,
      description: flags.effectHTML ?? "",
      statuses,
      system: { changes: [
        ...(applies.changes ?? []).map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: "final" })),
        // Nature's Ward rides a laid heal over time alone (D-771).
        ...(tickHere ? wardChanges : [])
      ] },
      ...timing,
      flags: { "azeroth-rpg": {
        spell: spellUuid, spellName: flags.spellName ?? null,
        // WHICH CAST LAID IT (D-724, D-726): the spell, the card's own cast key
        // and the card, so the effect answers to the cast that made it.
        identifier: flags.identifier ?? null, cast: flags.cast ?? null, messageId: message.id,
        ...selfTick,
        ...(tickHere ? { [TICK_FLAG]: foundry.utils.deepClone(tickHere) } : {}),
        // *You ignore **Difficult ground*** (Firewalk, Ghost Wolf, Blessing of
        // Freedom ...; D-757): the terrain door reads it for every source of
        // Difficult ground while the effect stands (`canvas/behaviors.mjs`).
        ...(flags.areaGround?.ignores === true ? { [IGNORES_GROUND_FLAG]: true } : {}),
        // 07's floor (D-777), whose caster the talent's heal reads when it goes.
        ...(floorHere ? { [FLOOR_FLAG]: { stay: Math.max(1, Math.trunc(Number(floorHere.stay)) || 1), by: casterOf(message)?.uuid ?? null, name: flags.spellName ?? "", held: false, noCritical: floorHere.noCritical === true } } : {}),
        // **NO DISPEL ENDS IT** (04's Improved Moonfire at rank 2: *it cannot be ended
        // by Dispel or similar effects*; D-778): the mark the cast read off the
        // caster's talents, which 02's Dispel lists greyed in the talent's name.
        ...(typeof flags.undispellable?.by === "string" && flags.undispellable.by ? { [UNDISPELLABLE_FLAG]: { by: flags.undispellable.by } } : {})
      } }
    }]);
    // **THE TEMPORARY HEALTH IT CARRIES** (D-777), riding the effect just laid: 05's
    // law decides whether it replaces what the creature holds.
    if (temporary && laid) await actor.grantTemporaryHealth(temporary.amount, { source: temporary.source, span: "effect", effectId: laid.id });
    // *The extra Mana is available at once* (07): the points land in the
    // pool as well as on its cap, through the actor's one door for a pool.
    for (const c of (applies.changes ?? []).filter(c => c.type === POOL_CHANGE_TYPE)) {
      const pool = actor.poolSnapshot?.().find(p => p.name === c.key) ?? null;
      const n = Number(c.value);
      if (!pool || !Number.isFinite(n) || n <= 0) continue;
      await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.value + n });
    }
    ui.notifications?.info(game.i18n.format("AZEROTH.Card.SpellEffectLaid", { spell: flags.spellName ?? "", name: actor.name }));
  }
}

// What a blow that landed does beyond its target - Killing Blow, a Paladin's
// Zeal, the damaged mark - lived here as `afterBlow` and ran from this card's
// Apply alone. It is `effects/after-blow.mjs` now, called by `applyDamage`
// itself, so an area's tick reaches it too (D-768).

/** Opening (02 SS7): on a hit against a target that has not acted, 2 Energy buys a Combo Point. */
async function openingComboFromCard(message) {
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor) return;
  const pools = actor.poolSnapshot();
  const energy = pools.find(p => p.kind === "power" && p.name === "energy");
  const combo = pools.find(p => p.kind === "momentum" && p.name === "comboPoints");
  if (!energy || !combo) return;
  if (energy.value < 2 || combo.value >= combo.max) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.OpeningRefused"));
    return;
  }
  await actor.updatePool([
    { itemId: energy.itemId, kind: "power", value: energy.value - 2 },
    { itemId: combo.itemId, kind: "momentum", value: combo.value + 1 }
  ]);
  ui.notifications?.info(game.i18n.format("AZEROTH.Card.OpeningTaken", { name: actor.name }));
}

/**
 * Lay the Bane the card's row names (06 SS6, 08 SS20; D-693).
 *
 * On the row's own target where it names one - a blow that LANDED knows whom
 * it hit - and on the selected tokens otherwise, which is Gorehowl's case:
 * *every enemy within 30 feet that saw it* is the table's call and never the
 * tool's, so the GM selects and presses.
 */
async function layBaneFromCard(button, message) {
  const kind = button.dataset.kind;
  const banes = Number(button.dataset.banes) || 1;
  const source = button.dataset.source || "";
  const by = ChatMessage.getSpeakerActor(message.speaker);
  const laid = [];
  for (const actor of await actorsFor(button, message)) {
    const done = await layBane({ victim: actor, kind, banes, source, by });
    if (done) laid.push(actor.name);
  }
  if (!laid.length) return;
  const what = game.i18n.format(banes === 1 ? "AZEROTH.Reaction.LaidBy" : "AZEROTH.Reaction.LaidBanes", {
    source: source || by?.name || "", n: banes,
    kind: game.i18n.localize(AZEROTH.testKinds[kind] ?? kind)
  });
  ui.notifications?.info(game.i18n.format("AZEROTH.Reaction.LaidOn", { what, names: laid.join(", ") }));
}

/**
 * A Parry or a Block, pressed by the defender on the attack's own card
 * (06 SS6, D-693).
 *
 * The row names WHICH target it belongs to, so the Reaction reaches the
 * creature that was struck rather than whoever happens to be selected; the
 * attacker's total comes off the card's own roll, which is a Parry's DC.
 */
async function reactionFromCard(button, message, reaction) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const index = Number(button.dataset.targetIndex);
  const snapshot = Number.isFinite(index) ? flags.targets?.[index] ?? null : null;
  const actor = snapshot ? targetActorOf(snapshot) : null;
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  return reactWithDialog(actor, reaction, {
    attackTotal: message.rolls?.[0]?.total ?? null,
    messageId: message.id,
    // Which row it answered, so the Apply button's number can move (D-720).
    targetIndex: Number.isFinite(index) ? index : null
  });
}

/**
 * *One attack against them at the moment they leave* (06 SS6, D-694).
 *
 * The card names the threatener, the mover's token and the distance the
 * departure was measured at - the distance because by now the mover is out of
 * reach and D-669's refusal would eat every one of these.
 */
async function opportunityFromCard(button, message) {
  const actor = button.dataset.actorUuid ? await fromUuid(button.dataset.actorUuid) : null;
  const distance = Number(button.dataset.distance);
  return takeOpportunity(actor, {
    tokenId: button.dataset.tokenId || null,
    sceneId: button.dataset.sceneId || null,
    distance: Number.isFinite(distance) ? distance : null,
    messageId: message.id
  });
}

/** *The action you named, when the trigger fires* (06 SS6, D-694). */
async function readiedFromCard(button, message) {
  const actor = button.dataset.actorUuid ? await fromUuid(button.dataset.actorUuid) : null;
  return takeReadied(actor, { messageId: message.id });
}

/** Stabilized (06 SS8): a Medicine Test at DC 12 the table made; the mark stops the turn-start Test. */
async function stabilizeFromCard(button) {
  const actor = button.dataset.actorUuid ? await fromUuid(button.dataset.actorUuid) : null;
  if (!actor) return;
  if (!actor.isOwner) return;
  await actor.setFlag("azeroth-rpg", "stabilized", true);
  ui.notifications?.info(game.i18n.format("AZEROTH.Combat.Stabilized", { name: actor.name }));
}
