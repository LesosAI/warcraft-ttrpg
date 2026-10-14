/**
 * DAMAGE OR HEALING LAID ON A CREATURE, WHERE IT TOUCHES THE BOARD (D-770; the
 * lead, 2026-10-03: *"Build the tick now"*). `rules/ticks.mjs` is the law; this
 * is the reading of a creature's effects, the writes and the words.
 *
 * - **`landTicks`** is what `AzerothCombat#_turnTicks` calls at the start of the
 *   CARRIER's turn, on the active GM's client, beside the area's ticks
 *   (D-756). A typed tick goes through the one door an area's damage and
 *   healing take (`effects/area-strikes.mjs#strikeFromArea`): Ward, Immune,
 *   Vulnerable, an ally's aura after the Ward and what the caster stands on -
 *   Spellpower on a tier 3 spell's ongoing damage (07 §9) or where the entry
 *   says so - then `applyDamage({attack: false, by})`, where Phase 0's
 *   `afterBlow` runs once, or `applyHealing({from, spell: true})`. An untyped
 *   tick (08 §12's poisons) lands its printed number through `applyDamage`
 *   alone. Then the countdown, and the effect goes at 0.
 * - **`layTickOn`** lays a tick a door of its own carries: a poison's failed
 *   Resilience Test (O-114). A spell's tick rides D-657's own door, the card's
 *   Apply (`dice/chat.mjs#applySpellEffectFromCard`).
 * - **`endTick`** removes one healing tick the caster laid, and
 *   **`endTickAndHeal`** is Swiftmend's door (D-771): *end one of your ongoing
 *   healing effects on a friendly target. That target immediately restores
 *   Health* - here where this client owns the target, on the active GM's client
 *   through `CONFIG.queries` (`END_TICK_QUERY`) where it does not, and
 *   `tickLaidBy` the judgement asked before anything is paid.
 *
 * **Nothing here throws into the turn** (D-757's lesson): a caster who has
 * been deleted lands the tick with no standing bonus and no hand behind the
 * blow, a creature or an effect gone while the turn's work awaited is left
 * alone, and a write that fails is said in the console and the next tick still
 * lands.
 */

import { AZEROTH } from "../config.mjs";
import { hasTick, tickCountdown, tickHasClock, tickLanding, tickLineParts, tickToEnd, ticksDue } from "../rules/ticks.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { actorInWorld } from "../canvas/in-world.mjs";
import { spellTiming } from "./durations.mjs";

/** The flag a laid tick lives under, in the system's scope. */
export const TICK_FLAG = "tick";

/** The icon a poison's tick wears where the poison names none. */
const POISON_ICON = "icons/svg/poison.svg";

/** A laid tick off an effect, or null. */
function tickOn(effect) {
  const tick = effect?.flags?.["azeroth-rpg"]?.[TICK_FLAG] ?? null;
  return hasTick(tick) ? tick : null;
}

/**
 * The effects on an actor carrying a laid tick. **A suppressed or disabled
 * effect lands nothing** (`ActiveEffect#active`), as a laid Bane lays nothing.
 *
 * @param {Actor} actor
 * @param {{all?: boolean}} [o]  every one, switched off or not (the replace and the end read them all)
 */
export function tickEffectsOf(actor, { all = false } = {}) {
  return (actor?.effects ?? []).filter(e => (all || e.active !== false) && tickOn(e));
}

/** The actor a laid tick names as its hand, or null where it is gone (D-757). */
function handOf(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/**
 * **LAND EVERY TICK THE CREATURE CARRIES**, damage before healing, and count
 * each one down. One line each for the turn's card.
 *
 * @param {Actor} actor
 * @returns {Promise<string[]>}
 */
export async function landTicks(actor) {
  const lines = [];
  if (!actor || !actorInWorld(actor)) return lines;
  const due = ticksDue(tickEffectsOf(actor).map(e => ({ id: e.id, tick: tickOn(e) })));
  for (const { id, tick } of due) {
    // A creature one tick has just killed takes nothing more - neither a blow
    // on the dead nor a heal that stands it up (14) - and one that has left
    // the world while this turn's work awaited is written nothing (D-757).
    if (!actorInWorld(actor)) break;
    if (actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0) break;
    if (!actor.effects.get(id)) continue;
    try {
      const hand = handOf(tick.source);
      // A class feature's tick (02's Regrowth, 04's Wild Growth; D-771) heals
      // as the feature does: Gift of Nature reaches it, a spell's Vestments do not.
      // And whether a SPELL laid it (its card stamped `castUuid`) and whether it is
      // 04's Ignite (D-775): Shadowburn, Burning Soul and Ignite read them.
      const spell = {
        name: tick.name || actor.effects.get(id)?.name || "", school: tick.type ?? null, takesSpellpower: tick.spellpower === true, feature: tick.via === "feature",
        isSpell: Boolean(tick.castUuid) && tick.via !== "feature", ignite: tick.ignite === true,
        // D-779: the schools 04's Divine Aegis was named for at the cast, and 04's
        // Miracle's heal nothing reduces, both read at the one healing door.
        aegis: tick.aegis ?? null, unreduced: tick.unreduced === true
      };
      // **04's DEVOURING PLAGUE** (the lead, 2026-10-03, on O-186: *"tick on cast, and
      // 1 turn after."*; D-779): a tick still carrying doubled landings deals twice its
      // number, and one fewer is left (`rules/ticks.mjs#tickLanding`).
      const landing = tickLanding(tick);
      const amount = landing.amount;
      if (landing.doubled) {
        lines.push(game.i18n.format("AZEROTH.DevouringPlague.Doubled", { name: actor.name, source: spell.name, n: amount }));
        const still = actor.effects.get(id);
        if (still) await still.update({ [`flags.azeroth-rpg.${TICK_FLAG}.doubled`]: landing.left });
      }
      if (tick.kind === "damage" && tick.type) {
        for (const line of await strikeFromArea({ actor, caster: hand, spell, damage: { rating: amount, school: tick.type } })) lines.push(line);
      } else if (tick.kind === "damage") {
        // 08 §12's *N damage a turn*, which names no type: the printed number
        // lands, and no Armor Point or Ward reduces it (D-770, a reading for
        // the lead). A blow of no type and no attack, by the poisoner's hand.
        if (amount > 0) await actor.applyDamage(amount, { struck: true, attack: false, location: "body", type: null, by: hand });
        lines.push(game.i18n.format("AZEROTH.Tick.Untyped", { name: actor.name, amount, source: spell.name }));
      } else {
        for (const line of await strikeFromArea({ actor, caster: hand, spell, heal: amount })) lines.push(line);
      }
      // THE COUNTDOWN: one a turn start, and the effect goes at its last.
      const next = tickCountdown(tick);
      const still = actor.effects.get(id);
      if (!next || !still || !actorInWorld(actor)) continue;
      if (next.delete) {
        await still.delete();
        lines.push(game.i18n.format("AZEROTH.Tick.Ended", { name: actor.name, source: spell.name }));
      } else {
        await still.update({ [`flags.azeroth-rpg.${TICK_FLAG}.rounds`]: next.rounds });
      }
    } catch (err) {
      console.warn("azeroth-rpg | a tick did not land", err);
    }
  }
  return lines;
}

/**
 * **LAY A TICK BY A DOOR OF ITS OWN** (08 §12's poisons after a failed Test,
 * O-114): one Active Effect named for what laid it, carrying the tick and the
 * span the caller worked out. A second laying of the same thing by the same
 * hand replaces the first - D-657's rule for a spell cast twice.
 *
 * @param {Actor} actor
 * @param {{tick: object, img?: string|null, origin?: string|null, timing?: object}} o
 * @returns {Promise<ActiveEffect|null>}
 */
export async function layTickOn(actor, { tick, img = null, origin = null, timing = {} } = {}) {
  if (!actor || !hasTick(tick) || !actorInWorld(actor)) return null;
  const stale = tickEffectsOf(actor, { all: true })
    .filter(e => {
      const held = tickOn(e);
      return held.name === tick.name && (held.source ?? null) === (tick.source ?? null);
    })
    .map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: tick.name || game.i18n.localize("AZEROTH.Tick.Label"),
    img: img ?? POISON_ICON,
    origin,
    description: "",
    ...(timing ?? {}),
    flags: { "azeroth-rpg": { [TICK_FLAG]: foundry.utils.deepClone(tick) } }
  }]);
  return made ?? null;
}

/**
 * **END ONE TICK OF THIS KIND THAT THIS HAND LAID** (Swiftmend, D-771): the
 * one named, else the first by id (`rules/ticks.mjs#tickToEnd`). Refused in
 * words where this client may not write on the creature. Resolves to what was
 * ended, or null.
 *
 * @param {Actor} target
 * @param {{from?: Actor|string|null, kind?: "heal"|"damage", effectId?: string|null}} [o]
 * @returns {Promise<{id: string, name: string, tick: object}|null>}
 */
export async function endTick(target, { from = null, kind = "heal", effectId = null } = {}) {
  if (!target) return null;
  const hand = typeof from === "string" ? from : (from?.uuid ?? null);
  const rows = tickEffectsOf(target, { all: true }).map(e => ({ id: e.id, tick: tickOn(e) }));
  const id = tickToEnd(rows, { from: hand, kind, id: effectId });
  if (!id) return null;
  if (!target.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Tick.NotYours", { name: target.name }));
    return null;
  }
  const effect = target.effects.get(id);
  if (!effect) return null;
  const tick = foundry.utils.deepClone(tickOn(effect));
  const name = effect.name;
  await effect.delete();
  return { id, name, tick };
}

/** The query that ends a tick, and gives what ending it gives, on the GM's client (D-771). */
export const END_TICK_QUERY = "azeroth-rpg.endTick";

/**
 * **A POISON'S TICK TAKES HOLD** (08 §12, O-114): the ONE landing a failed
 * Resilience Test (`dice/chat.mjs#rollResists`) and 04's Coated Blades at rank 2
 * (*the poison needs no Test to take hold*; D-773) both use. *For 3 turns* is
 * counted at the creature's turn starts, so a counted poison on a creature in no
 * fight has nothing to end it and is not laid (the D-770 review, item A); the
 * span is the creature's own rounds.
 *
 * @param {Actor} actor  the creature the poison takes
 * @param {object} tick  the laid tick the card stamped
 * @returns {Promise<{landed: boolean, reason: "noTick"|"noClock"|"refused"|null}>}
 */
export async function poisonTakesHold(actor, tick) {
  if (!actor || !hasTick(tick)) return { landed: false, reason: "noTick" };
  const rounds = tick.rounds ?? null;
  if (!tickHasClock(tick, { duration: rounds ? { value: rounds, units: "rounds" } : null, carrierInFight: Boolean(actor.activeFight?.()) })) {
    return { landed: false, reason: "noClock" };
  }
  const timing = rounds ? (spellTiming(actor, { value: rounds, units: "rounds", expiry: "turnEnd" }) ?? {}) : {};
  const made = await layTickOn(actor, { tick, origin: tick.source ?? null, timing });
  return { landed: Boolean(made), reason: made ? null : "refused" };
}

/** The query that lays a poison's tick with no Test, on the GM's client (D-773). */
export const LAY_POISON_QUERY = "azeroth-rpg.layPoison";

/**
 * The GM-side handler: the asker must own the poisoner, whose hand the tick
 * records (`tick.source`), and the creature is the GM's to write.
 */
export async function layPoisonQueryHandler({ victimUuid = null, tick = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (!hasTick(tick)) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const poisoner = tick.source ? await fromUuid(tick.source) : null;
  if (user && (poisoner?.documentName !== "Actor" || !poisoner.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: poisoner?.name ?? "" }));
  }
  return poisonTakesHold(victim, tick);
}

/**
 * **A POISON WITH NO TEST, LANDED ON THE CREATURE STRUCK** (04's Coated Blades at
 * rank 2, D-773): here where this client owns it, through the active GM's client
 * otherwise (`LAY_POISON_QUERY`), never `game.socket`.
 *
 * @param {{victim: Actor|null, tick: object}} o
 * @returns {Promise<{landed: boolean, reason: string|null}>}
 */
export async function layPoison({ victim = null, tick = null } = {}) {
  if (!victim) return { landed: false, reason: "gone" };
  if (victim.isOwner) return poisonTakesHold(victim, tick);
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Tick.NoGM", { name: victim.name }));
    return { landed: false, reason: "error" };
  }
  try {
    const done = await gm.query(LAY_POISON_QUERY, { victimUuid: victim.uuid, tick: foundry.utils.deepClone(tick) }, { timeout: 15000 });
    return done && typeof done === "object" ? { landed: done.landed === true, reason: done.reason ?? null } : { landed: false, reason: "error" };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { landed: false, reason: "error" };
  }
}

/**
 * **A TICK A HAND LAYS BY A DOOR OF ITS OWN** (04's Ignite, D-775): the door Coated
 * Blades' poison takes (`layPoison`), which judges nothing about poisons - the
 * tick's clock (`poisonTakesHold`), and on the GM's client that the asker owns the
 * hand the tick records (`layPoisonQueryHandler`). One door, two names, so a reader
 * of Ignite's call does not take it for a poison.
 */
export const layTickBy = (o = {}) => layPoison(o);

/**
 * Whether a creature carries a tick of this kind that this hand laid - the
 * judgement Swiftmend asks BEFORE anything is paid (D-768's order, D-771). It
 * reads every effect, switched off or not, as `endTick` does.
 *
 * @param {Actor|null} target
 * @param {{from?: Actor|string|null, kind?: "heal"|"damage"}} [o]
 * @returns {{id: string, name: string}|null}
 */
export function tickLaidBy(target, { from = null, kind = "heal" } = {}) {
  if (!target) return null;
  const hand = typeof from === "string" ? from : (from?.uuid ?? null);
  const rows = tickEffectsOf(target, { all: true }).map(e => ({ id: e.id, tick: tickOn(e) }));
  const id = tickToEnd(rows, { from: hand, kind });
  if (!id) return null;
  return { id, name: target.effects.get(id)?.name ?? "" };
}

/**
 * Where this client may write the creature: end the tick, then give the heal.
 * Nothing is healed where nothing was ended.
 */
async function endAndHealHere({ target, from, kind, heal }) {
  const ended = await endTick(target, { from, kind });
  if (!ended) return { ended: null, healed: 0 };
  const before = target.system?.health?.value ?? 0;
  const amount = Math.max(0, Math.trunc(Number(heal)) || 0);
  if (amount > 0) await target.applyHealing(amount, { from: typeof from === "string" ? null : from, feature: true });
  const healed = Math.max(0, (target.system?.health?.value ?? before) - before);
  return { ended: { id: ended.id, name: ended.name }, healed };
}

/**
 * The GM-side handler: the asker must own the hand that laid the tick (the
 * caster), and the creature is the GM's to write. A refusal travels back as the
 * thrown error.
 */
export async function endTickQueryHandler({ targetUuid = null, casterUuid = null, kind = "heal", heal = 0 } = {}, { user = null } = {}) {
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  if (!target || target.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const caster = casterUuid ? await fromUuid(casterUuid) : null;
  if (user && (caster?.documentName !== "Actor" || !caster.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: caster?.name ?? "" }));
  }
  return endAndHealHere({ target, from: caster ?? casterUuid, kind, heal });
}

/**
 * **END ONE OF YOUR ONGOING HEALING EFFECTS, AND HEAL AT ONCE** (04's
 * Swiftmend: *end one of your ongoing healing effects on a friendly target.
 * That target immediately restores Health equal to twice your tier plus your
 * rank*; D-771). Here where this client owns the target, through the active
 * GM's client otherwise (`END_TICK_QUERY`). Resolves to what was ended and
 * healed - `ended` null where nothing was.
 *
 * @param {{target: Actor, from: Actor, kind?: "heal"|"damage", heal?: number}} o
 * @returns {Promise<{ended: {id: string, name: string}|null, healed: number}>}
 */
export async function endTickAndHeal({ target, from, kind = "heal", heal = 0 } = {}) {
  if (!target || !from) return { ended: null, healed: 0 };
  if (target.isOwner) return endAndHealHere({ target, from, kind, heal });
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Tick.NoGM", { name: target.name }));
    return { ended: null, healed: 0 };
  }
  try {
    const done = await gm.query(END_TICK_QUERY, { targetUuid: target.uuid, casterUuid: from.uuid, kind, heal }, { timeout: 15000 });
    return done && typeof done === "object" ? { ended: done.ended ?? null, healed: Number(done.healed) || 0 } : { ended: null, healed: 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ended: null, healed: 0 };
  }
}

/**
 * The card's *Each turn* line for a laid tick, in words: what lands, and for
 * how long. Null where there is no tick.
 *
 * @param {object} tick  a laid tick (`rules/ticks.mjs#layTick`)
 * @returns {{text: string, note: string}|null}
 */
export function tickWords(tick) {
  const parts = tickLineParts(tick);
  if (!parts) return null;
  const text = parts.kind === "heal"
    ? game.i18n.format("AZEROTH.Tick.Line.heal", { amount: parts.amount })
    : parts.type
      ? game.i18n.format("AZEROTH.Tick.Line.damage", { amount: parts.amount, type: game.i18n.localize(AZEROTH.schools[parts.type] ?? parts.type) })
      : game.i18n.format("AZEROTH.Tick.Line.untyped", { amount: parts.amount });
  const span = parts.span === "rounds"
    ? game.i18n.format("AZEROTH.Tick.Span.rounds", { n: parts.rounds })
    : game.i18n.localize(`AZEROTH.Tick.Span.${parts.span}`);
  const note = [span, parts.spellpower ? game.i18n.localize("AZEROTH.Tick.Spellpower") : null, game.i18n.localize("AZEROTH.Tick.LaidBy")]
    .filter(Boolean).join(" · ");
  return { text, note };
}
