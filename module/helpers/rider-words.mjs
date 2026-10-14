/**
 * **WHAT A RIDER SAYS, IN WORDS** (D-770). `rules/riders.mjs` is pure and hands
 * back keys and numbers; the roll dialog's line and the attack card's row are
 * composed here, once, so the two doors that speak of a rider cannot say it two
 * ways (CLAUDE.md §11).
 */

import { AZEROTH } from "../config.mjs";

/** A pool's name, in words: *Ferocity*, *Rage*, *Combo Points*. */
export function poolLabel(name) {
  return game.i18n.localize(AZEROTH.poolTypes[name] ?? name ?? "");
}

/** A condition's name, in words. */
function conditionLabel(id) {
  return game.i18n.localize(AZEROTH.conditions[id] ?? id ?? "");
}

/**
 * Why a line is greyed or a roll refused, in words, or null.
 *
 * @param {{key: string, params: object}|null} reason  a line's or a plan's
 */
export function riderReason(reason) {
  if (!reason?.key) return null;
  const params = reason.params ?? {};
  return game.i18n.format(reason.key, { ...params, pool: poolLabel(params.pool) });
}

/**
 * The price a line prints: *2 Ferocity*, or *all your Ferocity (5)* for a rider
 * that spends all of it.
 */
export function riderPrice(line) {
  if (!line) return "";
  return line.all
    ? game.i18n.format("AZEROTH.Rider.PriceAll", { pool: poolLabel(line.pool), n: line.spend ?? 0 })
    : game.i18n.format("AZEROTH.Rider.Price", { pool: poolLabel(line.pool), n: line.cost ?? 0 });
}

/**
 * What a line would do, as it stands: *on a hit, Bleeding 2*, *move up to your
 * Speed*, *once a round*. Read off the line's own `does`, which the law worked
 * out at what the rider would spend now.
 */
export function riderDoes(line) {
  if (!line) return "";
  const parts = [];
  const does = line.does ?? {};
  if (does.move === "speed") parts.push(game.i18n.localize("AZEROTH.Rider.Does.Move"));
  if (does.condition) {
    parts.push(does.condition.value !== null && does.condition.value !== undefined
      ? game.i18n.format("AZEROTH.Rider.Does.Condition", { condition: conditionLabel(does.condition.id), value: does.condition.value })
      : game.i18n.format("AZEROTH.Rider.Does.ConditionBare", { condition: conditionLabel(does.condition.id) }));
  }
  if (does.prone) parts.push(game.i18n.localize("AZEROTH.Rider.Does.Prone"));
  if (does.damage) parts.push(game.i18n.format("AZEROTH.Rider.Does.Damage", { n: does.damage }));
  // The Warrior's (D-772): a shield's own Rating, Health back on a hit, a target
  // that recovers none, a condition that waits on an SL, and a spend made only
  // when the blow lands.
  if (line.strike?.rating !== undefined && line.strike?.rating !== null) parts.push(game.i18n.format("AZEROTH.Rider.Does.Strike", { n: line.strike.rating }));
  if (does.heal) parts.push(game.i18n.format("AZEROTH.Rider.Does.Heal", { n: does.heal }));
  if (does.noHealing) parts.push(game.i18n.localize("AZEROTH.Rider.Does.NoHealing"));
  if (line.onHit?.sl && (does.condition || does.prone)) parts.push(game.i18n.format("AZEROTH.Rider.Does.AtSL", { sl: line.onHit.sl }));
  if (line.pays === "hit") parts.push(game.i18n.localize("AZEROTH.Rider.Does.PaysOnHit"));
  if (line.once === "round") parts.push(game.i18n.localize("AZEROTH.Rider.Does.Once"));
  // The Ranger's and the Rogue's (D-773): a Pierce on the blow, a hit made
  // without a roll at an SL, a Speed dropped, a Reaction taken, a Bleeding that
  // bars a cast, the striker's clock, and a blow at a target under the Opening.
  if (does.pierce) parts.push(game.i18n.format("AZEROTH.Rider.Does.Pierce", { n: does.pierce }));
  if (does.forced !== undefined && does.forced !== null) parts.push(game.i18n.format("AZEROTH.Rider.Does.Forced", { sl: does.forced }));
  if (does.speedDrop) parts.push(game.i18n.format("AZEROTH.Rider.Does.SpeedDrop", { feet: does.speedDrop }));
  if (does.loseReaction) parts.push(game.i18n.localize("AZEROTH.Rider.Does.LoseReaction"));
  if (does.noCasting) parts.push(game.i18n.localize("AZEROTH.Rider.Does.NoCasting"));
  if (does.until === "strikerTurnStart") parts.push(game.i18n.localize("AZEROTH.Rider.Does.UntilYourTurn"));
  if (line.needs === "opening") parts.push(game.i18n.localize("AZEROTH.Rider.Does.NeedsOpening"));
  // The Shaman's (D-774): a Bane on the target's next Test of a kind.
  if (does.bane?.banes) parts.push(game.i18n.format("AZEROTH.Rider.Does.Bane", { n: does.bane.banes, kind: game.i18n.localize(AZEROTH.testKinds?.[does.bane.kind] ?? does.bane.kind) }));
  return parts.join(" · ");
}

/**
 * What one landing came to, in words (the lead, 2026-10-03: *"Lands
 * automatically"*): *Ghoul gains Bleeding 2*, *Ghoul is knocked Prone*, or why
 * it did not take.
 *
 * @param {{name: string, id: string, value: number|null, landed: boolean, reason: string|null}} row
 *   `effects/inflict.mjs#inflictCondition`'s answer
 */
export function landedText(row) {
  const condition = conditionLabel(row.id);
  if (row.landed) {
    if (row.id === "prone") return game.i18n.format("AZEROTH.Rider.Card.LandedProne", { name: row.name });
    return row.value !== null && row.value !== undefined
      ? game.i18n.format("AZEROTH.Rider.Card.Landed", { name: row.name, condition, value: row.value })
      : game.i18n.format("AZEROTH.Rider.Card.LandedBare", { name: row.name, condition });
  }
  return row.reason === "immune"
    ? game.i18n.format("AZEROTH.Rider.Card.Immune", { name: row.name, condition })
    : game.i18n.format("AZEROTH.Rider.Card.NotLanded", { name: row.name, condition });
}

/**
 * The attack card's row for one rider paid (D-770): what was spent, then what
 * the blow did with it - or that it missed and nothing lands. The move is
 * bought by the spend and is said either way; in a fight it is the turn's free
 * Move, out of one there is no budget to put it on.
 *
 * **What a hit lands is said as it LANDED** (the lead: *"Lands
 * automatically"*): `landed` is one row a creature and a condition, laid as the
 * card was written. Null is a blow with no target recorded, where nothing could
 * be laid: the card then says what the target gains and offers the Inflict
 * button, which reaches the selected tokens as it always has.
 *
 * A rider paid BEFORE the blow from the Combat tab (`primed`) says so; its Move
 * was granted then, and is not said again.
 *
 * @param {{name: string, pool: string, spent: number}} paid
 * @param {{move: string|null, condition: object|null, prone: boolean, damage: number}} outcome
 * @param {{hit: boolean, inFight: boolean, landed?: Array<object>|null, primed?: boolean}} o
 */
export function riderCardText(paid, outcome, { hit = false, inFight = false, landed = null, primed = false, paysOnHit = false, healed = null, noHealing = null } = {}) {
  // **A SPEND MADE ONLY WHEN THE BLOW LANDS** (Bloodthirst, D-772): a miss
  // spent nothing, and says so rather than printing a price never paid.
  if (paysOnHit && !hit) return [game.i18n.format("AZEROTH.Rider.Card.NotPaidMissed", { pool: poolLabel(paid.pool) })].join(" ");
  const parts = [primed
    ? game.i18n.localize("AZEROTH.Rider.Card.PaidBefore")
    : game.i18n.format("AZEROTH.Rider.Card.Paid", { n: paid.spent, pool: poolLabel(paid.pool) })];
  if (!primed && outcome.move === "speed") parts.push(game.i18n.localize(inFight ? "AZEROTH.Rider.Card.Move" : "AZEROTH.Rider.Card.MoveOutOfFight"));
  if (!hit) {
    parts.push(game.i18n.localize("AZEROTH.Rider.Card.Missed"));
    return parts.join(" ");
  }
  // What the striker recovered (Bloodthirst) and whom a blow left recovering
  // none (Mortal Strike), as they landed (D-772).
  if (healed !== null && healed !== undefined) parts.push(game.i18n.format("AZEROTH.Rider.Card.Healed", { n: healed }));
  for (const row of noHealing ?? []) {
    parts.push(row.landed
      ? game.i18n.format("AZEROTH.Rider.Card.NoHealing", { name: row.name })
      : game.i18n.format(row.reason === "noFight" ? "AZEROTH.Rider.Card.NoHealingNoFight" : "AZEROTH.Rider.Card.NoHealingNot", { name: row.name }));
  }
  if (landed) {
    for (const row of landed) parts.push(landedText(row));
  } else {
    if (outcome.condition) {
      parts.push(outcome.condition.value !== null && outcome.condition.value !== undefined
        ? game.i18n.format("AZEROTH.Rider.Card.Condition", { condition: conditionLabel(outcome.condition.id), value: outcome.condition.value })
        : game.i18n.format("AZEROTH.Rider.Card.ConditionBare", { condition: conditionLabel(outcome.condition.id) }));
    }
    if (outcome.prone) parts.push(game.i18n.localize("AZEROTH.Rider.Card.Prone"));
    if (outcome.condition || outcome.prone) parts.push(game.i18n.localize("AZEROTH.Rider.Card.NoTarget"));
  }
  if (outcome.damage) parts.push(game.i18n.format("AZEROTH.Rider.Card.Damage", { n: outcome.damage }));
  return parts.join(" ");
}

/**
 * The Combat tab's control for a rider paid before the blow (the lead,
 * 2026-10-03: *"Either order"*): its name and price, whether it may be pressed,
 * and why not in words beside the greyed button (D5), or the chip that says it
 * is paid and waiting for the attack.
 *
 * @param {{line: object, ok: boolean, reason: object|null}} charge  `rules/riders.mjs#chargeLines`'s
 */
export function chargeControl(charge) {
  const line = charge.line;
  return {
    identifier: line.identifier,
    name: line.name,
    price: riderPrice(line),
    primed: line.primed === true,
    available: charge.ok,
    reason: charge.ok || line.primed ? null : riderReason(charge.reason),
    tip: game.i18n.format("AZEROTH.Rider.Prime.Tip", { name: line.name, price: riderPrice(line) }),
    chip: game.i18n.format("AZEROTH.Rider.Prime.Chip", { name: line.name })
  };
}
