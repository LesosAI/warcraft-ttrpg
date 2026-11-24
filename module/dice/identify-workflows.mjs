/**
 * **THE IDENTIFY DOOR** (08 §4, *Unidentified items*; D-1435). An Arcana Test at the quality's
 * DC, once per item per Long Rest, a Rare, Epic or Legendary attempt using up one 08 §17 stone
 * whether the Test succeeds or fails. Re-exported from `dice/workflows.mjs`, so
 * `game.system.azeroth.workflows.identifyTest` is where the other workflows are; the item's
 * right-click menu (`applications/actions.mjs#itemContextMenu`) is the control.
 *
 * The shape is the Medicine Test's (`dice/afflictions-workflows.mjs`): judged before the
 * dialog opens, the dialog through `rollWithDialog` with a custom `run`, judged again at the
 * die. **Every refusal before anything is spent** (D-768): the stone, then the tried mark,
 * then the die. A dismissed dialog spends nothing, because `run` is never reached. The owner
 * writes their own items, so no query is needed.
 *
 * `rules/identify.mjs` is the law and nothing here re-derives it.
 */

import { AzerothRoll } from "./azeroth-roll.mjs";
import { resultName } from "../rules/resolution.mjs";
import { skillRowsFor } from "../rules/skills.mjs";
import { spendOne } from "../rules/consumables.mjs";
import {
  IDENTIFY_SCOPE, TRIED_FLAG, UNIDENTIFIED_FLAG, identifyComponent, identifyDC, identifyRefusal
} from "../rules/identify.mjs";
import { disguisedNameOf } from "../helpers/identify-words.mjs";
import { postAfflictionCard } from "../effects/afflictions.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** The stack of the stone this attempt uses up, or null where none is carried. */
function stoneFor(actor, identifier) {
  if (!identifier) return null;
  return [...(actor?.items ?? [])].find(i => i.system?.identifier === identifier
    && (i.system?.quantity === null || i.system?.quantity === undefined || Number(i.system.quantity) > 0)) ?? null;
}

/** The one judgement, at both doors: `identifyRefusal` over the actor's own items. */
function judge(actor, item) {
  return identifyRefusal({ item, carried: [...(actor?.items ?? [])], isOwner: actor?.isOwner === true });
}

/** A refusal in words. `noComponent` names the stone by the gear pack's own name where it can. */
function sayRefusal(refusal, item) {
  // The pack's own name where its index carries the identifier, else the identifier read as words
  // (`greater-magic-essence` is *Greater magic essence*, as 08 §17 prints it).
  const id = refusal.component ?? "";
  const words = id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ") : "";
  const component = id ? (game.packs?.get("azeroth-rpg.gear")?.index?.find?.(e => e.system?.identifier === id)?.name ?? words) : "";
  ui.notifications?.warn(t(`AZEROTH.Identify.Refuse.${refusal.reason}`, { item: disguisedNameOf(item), component }));
}

function verdictOf(roll, dc) {
  const won = roll.outcome.success === true;
  const name = resultName({ sl: roll.outcome.sl, success: won });
  return {
    outcome: game.i18n.localize(`AZEROTH.Roll.Outcome.${won ? "Success" : "Failure"}`),
    margin: game.i18n.localize(`AZEROTH.Roll.Result.${name[0].toUpperCase()}${name.slice(1)}`),
    total: roll.total, dc
  };
}

/**
 * Try to identify one item an actor holds: judged, then the Arcana Test through the roll
 * dialog. Returns the card, a refusal, or null where the dialog was dismissed.
 *
 * @param {{actor: Actor, item: Item, event?: Event|null}} o
 * @returns {Promise<ChatMessage|{refused: string}|null>}
 */
export async function identifyTest({ actor, item, event = null } = {}) {
  if (!actor || !item) return null;
  const refusal = judge(actor, item);
  if (refusal) {
    sayRefusal(refusal, item);
    return { refused: refusal.reason };
  }
  const { rollWithDialog } = await import("../applications/actions.mjs");
  return rollWithDialog(actor, {
    kind: "skill",
    skill: "arcana",
    title: t("AZEROTH.Identify.Title", { item: disguisedNameOf(item) }),
    dc: identifyDC(item.system?.rarity),
    // The DC is ruled by quality, never the table's call (the Phase 3 review, S1): read-only on the
    // dialog, and `identifyRun` reads it off the item whatever the dialog hands back.
    dcLocked: true,
    modifiers: skillRowsFor(actor, "arcana"),
    alwaysPrompt: true,
    identifyCtx: { itemId: item.id },
    run: identifyRun
  }, event);
}

/** The workflow the Arcana dialog runs: judged again, the stone, the mark, the die, the card. */
async function identifyRun({ actor, boons = 0, banes = 0, modifiers = [], provenanceExtra = [], identifyCtx = null, chosen = null } = {}) {
  const item = identifyCtx?.itemId ? actor?.items?.get(identifyCtx.itemId) ?? null : null;
  if (!item) {
    ui.notifications?.warn(t("AZEROTH.Identify.Gone"));
    return null;
  }
  // The dialog stood open: the item may have been identified, tried or its stone spent meanwhile.
  const refusal = judge(actor, item);
  if (refusal) {
    sayRefusal(refusal, item);
    return null;
  }
  const disguised = disguisedNameOf(item);
  // 08 §4's DC by quality (12, 16, 20, 26): a DC typed on the dialog is never read (S1).
  const testDC = identifyDC(item.system?.rarity);

  // 1. THE STONE, used up whatever the Test comes to (08 §4) - through the one mark-off rule.
  const lines = [];
  const stone = stoneFor(actor, identifyComponent(item.system?.rarity));
  if (stone) {
    const spend = spendOne(stone.system?.quantity ?? 1);
    if (spend?.delete) await stone.delete();
    else if (spend) await stone.update({ "system.quantity": spend.quantity });
    lines.push(t("AZEROTH.Identify.ComponentSpent", { component: stone.name }));
  }

  // 2. THE MARK, before the die, so a dismissed card or a reload never buys a second try.
  await item.update({ [`flags.${IDENTIFY_SCOPE}.${TRIED_FLAG}`]: true });

  // 3. THE DIE.
  const roll = AzerothRoll.build({ dc: testDC, kind: "skill", boons, banes, modifiers, rollData: actor.getRollData(), roller: actor, chosen });
  roll.options.provenance.push(...provenanceExtra);
  await roll.evaluate();
  await actor.offerElunesRegard?.(roll);
  const success = roll.outcome?.success === true;

  // 4. KNOWN, written `false` and never unset (the architect's review, must-fix 1): an absent
  // flag is stamped on the next create anywhere. The tried mark goes with it.
  if (success && actor.items.get(item.id)) {
    await item.update({
      [`flags.${IDENTIFY_SCOPE}.${UNIDENTIFIED_FLAG}`]: false,
      [`flags.${IDENTIFY_SCOPE}.${TRIED_FLAG}`]: foundry.data.operators.ForcedDeletion.create()
    });
  }
  lines.unshift(success
    ? t("AZEROTH.Identify.Passed", { name: actor.name, item: disguised, identified: item.name })
    : t("AZEROTH.Identify.Failed", { name: actor.name, item: disguised }));
  return postAfflictionCard(actor, {
    title: t("AZEROTH.Identify.Card"), lines, accent: "azeroth-card-spell", roll, verdict: verdictOf(roll, testDC),
    kind: "identify", extra: { itemId: item.id, success }
  });
}
