/**
 * A Bane laid on ANOTHER creature (06 §6's Pummel; 08 §20's Gorehowl and two
 * Classic finds). `rules/banes.mjs` is the law; this is the write, the read
 * and the spend.
 *
 * ## The write is an Active Effect
 *
 * v14's `duration`/`start` and `CONFIG.ActiveEffect.expiryAction = "delete"`
 * (D-628), with the VICTIM's own combatant in `start` - core keys `turnEnd` on
 * `start.combatant` and fills it at creation with whoever's turn it is, which
 * is the attacker's, so `effects/durations.mjs` writes the victim's and this
 * borrows it.
 *
 * **The effect carries the flag and NO `changes`.** CLAUDE.md §6: *Active
 * Effects change numbers, the roll pipeline changes dice.* A Bane is dice, so
 * the effect is the carrier and the clock and `rules/modifiers.mjs` reads it
 * where every other Bane on a roll is read. A change on `system.testBanes` as
 * well would count it twice, once through the model and once through the
 * dialog.
 *
 * ## The span is a backstop; the SPEND is the rule
 *
 * 06 says *on the next Casting Test it makes* and states no span at all, so
 * the roll deletes it: `spendLaidBanes` runs after the die on every Test path.
 * The one-turn duration beside it exists so an effect nobody ever spends does
 * not sit on a caster forever, and it is deliberately generous - *a caster who
 * has been pummelled and then walks out of reach still takes the Banes,
 * because the blow has already landed*. Out of a started fight there is no
 * clock at all and the effect waits to be spent.
 *
 * ## A player cannot write on the GM's creature
 *
 * The write goes through `CONFIG.queries` exactly as D-643's binding and
 * D-691's summon do; never `game.socket`. The handler checks ownership itself,
 * because core only checks `QUERY_USER`.
 */

import { AZEROTH } from "../config.mjs";
import { LAID_BANE_FLAG, LAID_BOON_FLAG, baneSpentBy, boonSpentBy, cleanLaidBane, cleanLaidBoon } from "../rules/banes.mjs";
import { untilEndOfNextTurn } from "./durations.mjs";

export const LAY_BANE_QUERY = "azeroth-rpg.layBane";

/** A Boon laid on another creature (04's Blessing, D-772): the Bane's twin door. */
export const LAY_BOON_QUERY = "azeroth-rpg.layBoon";

/** The icon a laid Bane wears in the effects list. */
const BANE_ICON = "icons/svg/downgrade.svg";

/** The icon a laid Boon wears (D-772). */
const BOON_ICON = "icons/svg/upgrade.svg";

/**
 * The laid-Boon flags on one actor (04's Blessing, D-772), `laidBaneFlags`'
 * twin: an active effect's flag, in collection order.
 *
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function laidBoonFlags(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const raw = effect.flags?.["azeroth-rpg"]?.[LAID_BOON_FLAG] ?? null;
    if (raw) out.push(raw);
  }
  return out;
}

/**
 * The laid-Bane flags on one actor, as `rules/banes.mjs` reads them.
 *
 * **A suppressed or disabled effect lays nothing.** `ActiveEffect#active` is
 * `!disabled && !isSuppressed`, and it is the only honest test - a disabled
 * effect is still in the collection.
 *
 * @param {Actor} actor
 * @returns {Array<object>} the raw flag objects, in collection order
 */
export function laidBaneFlags(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const raw = effect.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG] ?? null;
    if (raw) out.push(raw);
  }
  return out;
}

/** The effects on an actor that lay a Bane on one kind of Test. */
function laidBaneEffects(actor, kind = null) {
  return (actor?.effects ?? []).filter(effect => {
    const row = cleanLaidBane(effect.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG] ?? null);
    if (!row) return false;
    return kind === null || row.kind === kind;
  });
}

/**
 * The create data for one laid Bane. Pure enough to build on either client,
 * which is what lets the query handler and the local path share it. A LASTING
 * one (D-757) keeps its flag and its span, and nothing spends it.
 */
function baneData({ victim, kind, banes, source, originUuid, lasting = false, except = null, only = null, span = null }) {
  // A span the layer names - Taunt's *until the end of your next turn* is the
  // WARRIOR's, Judgement's *one round per rank* its own count (D-772) - else the
  // victim's own next turn, the backstop it always was.
  const timing = (span && typeof span === "object" ? span : null) ?? untilEndOfNextTurn(victim) ?? {};
  // A Bane on EVERY Test (04's Intimidation, D-773) names no kind of Test.
  const every = kind === "all";
  const label = every ? "AZEROTH.Reaction.LaidAll" : (banes === 1 ? "AZEROTH.Reaction.LaidBy" : "AZEROTH.Reaction.LaidBanes");
  return {
    name: game.i18n.format(label, {
      source: source || game.i18n.localize("AZEROTH.Reaction.Heading"),
      n: banes,
      kind: every ? "" : game.i18n.localize(AZEROTH.testKinds[kind] ?? kind)
    }),
    img: BANE_ICON,
    origin: originUuid ?? null,
    description: `<p>${every
      ? game.i18n.localize("AZEROTH.Reaction.LaidAllText")
      : game.i18n.format("AZEROTH.Reaction.Laid", { kind: game.i18n.localize(AZEROTH.testKinds[kind] ?? kind) })}</p>`,
    // NO `system.changes`: a Bane is dice, and the roll pipeline reads the flag.
    ...timing,
    flags: { "azeroth-rpg": { [LAID_BANE_FLAG]: {
      kind, banes, source,
      // The creature it spares (D-772): *attacking anyone but you*.
      ...(except ? { except } : {}),
      // And the one creature it bears on (04's Feint, D-773): *against you*.
      ...(only ? { only } : {}),
      ...(lasting ? { lasting: true } : {})
    } } }
  };
}

/**
 * Put the Bane on the victim, here. The caller has already established that
 * this client may write on it.
 *
 * **A second Bane from the same source replaces the first**, keyed by the
 * source and the origin, the way a second casting of a lasting spell replaces
 * its own effect (D-657). Two different sources stack, and the dice ceiling
 * takes care of the arithmetic.
 */
async function layHere({ victim, kind, banes, source, originUuid, lasting = false, except = null, only = null, span = null }) {
  const row = cleanLaidBane({ kind, banes, source, lasting, except, only });
  if (!row) return null;
  const stale = laidBaneEffects(victim, row.kind).filter(e => {
    const held = e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG] ?? {};
    return String(held.source ?? "") === row.source && (e.origin ?? null) === (originUuid ?? null);
  }).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [
    baneData({ victim, kind: row.kind, banes: row.banes, source: row.source, originUuid, lasting: row.lasting === true, except: row.except ?? null, only: row.only ?? null, span })
  ]);
  return made ? { name: victim.name, kind: row.kind, banes: row.banes, source: row.source } : null;
}

/**
 * The GM-side handler. Throws with the reason, which travels back to the
 * caller as the refusal.
 */
export async function layBaneQueryHandler({ victimUuid, kind, banes, source, originUuid, lasting = false, except = null, only = null, span = null } = {}, { user = null } = {}) {
  const victim = await fromUuid(victimUuid);
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
  // The layer has to own what laid it; the victim is the GM's business.
  if (user && originUuid) {
    const origin = await fromUuid(originUuid);
    if (origin?.documentName === "Actor" && !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin.name }));
    }
  }
  const done = await layHere({ victim, kind, banes, source, originUuid, lasting: lasting === true, except, only, span });
  if (!done) throw new Error(game.i18n.localize("AZEROTH.Reaction.Refuse.Unreadable"));
  return done;
}

/**
 * Lay a Bane on a creature's next Test of one kind.
 *
 * Runs here for whoever owns the victim and asks the active GM's client
 * otherwise; the refusal is shown rather than thrown.
 *
 * @param {object} o
 * @param {Actor} o.victim
 * @param {string} o.kind    an `AZEROTH.testKinds` key
 * @param {number} o.banes
 * @param {string} o.source  what laid it, for the dialog's own line
 * @param {Actor|null} [o.by]  who laid it
 * @param {boolean} [o.lasting]  a span rather than a count (D-757): every Test
 *   of the kind until the effect's own clock runs out, and never spent
 * @param {{actorId: string|null, tokenId: string|null}|null} [o.except]  the one
 *   creature the Bane spares (04's Taunt and Judgement: *anyone but you*; D-772)
 * @param {{duration: object, start: object}|null} [o.span]  the effect's own
 *   clock where the layer names one (D-772), else the victim's next turn
 * @param {{actorId: string|null, tokenId: string|null}|null} [o.only]  the one
 *   creature the Bane bears on (04's Feint: *the target's next attack against
 *   you*; D-773), spent only by an attack against it
 */
export async function layBane({ victim, kind, banes, source = "", by = null, lasting = false, except = null, only = null, span = null } = {}) {
  if (!victim) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  const originUuid = by?.uuid ?? null;
  const payload = { victimUuid: victim.uuid, kind, banes, source, originUuid, lasting: lasting === true, except, only, span };
  try {
    if (victim.isOwner) return await layHere({ victim, kind, banes, source, originUuid, lasting: lasting === true, except, only, span });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return await gm.query(LAY_BANE_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * Spend the Banes laid on this creature's Test of one kind - *on the NEXT
 * Casting Test it makes* - and say what was spent.
 *
 * Called after the die on every Test path, so a Test made under a laid Bane
 * takes it and the one after does not. A Bane the roller unticked in the
 * dialog is still spent: the book charges the Test, not the choice.
 *
 * @returns {Promise<string[]>} the sources spent, for the card's own line
 */
export async function spendLaidBanes(actor, kind, { target = null } = {}) {
  if (!actor?.isOwner) return [];
  // A LASTING Bane is a span and never a count (D-757): it stands until its
  // effect's own clock takes it off, whatever the roll. One laid against one
  // creature alone (04's Feint, D-773) is spent only by a Test against it, and a
  // Bane on every Test by a Test of any kind: `rules/banes.mjs#baneSpentBy`.
  const effects = (actor?.effects ?? []).filter(e => baneSpentBy(e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG] ?? null, kind, target));
  if (!effects.length) return [];
  const names = effects
    .map(e => String(e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG]?.source ?? ""))
    .filter(Boolean);
  await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  return names;
}

/* -------------------------------------------- */
/*  A Boon laid on somebody else (D-772)         */
/* -------------------------------------------- */

/** The create data for one laid Boon: the Bane's shape, upgraded. */
function boonData({ kind, boons, source, originUuid, lasting = false, span = null }) {
  const label = kind === "all" ? "AZEROTH.Blessing.LaidAll" : "AZEROTH.Blessing.LaidKind";
  return {
    name: game.i18n.format(label, {
      source: source || game.i18n.localize("AZEROTH.Reaction.Heading"),
      n: boons,
      kind: kind === "all" ? "" : game.i18n.localize(AZEROTH.testKinds[kind] ?? kind)
    }),
    img: BOON_ICON,
    origin: originUuid ?? null,
    description: `<p>${game.i18n.format(lasting ? "AZEROTH.Blessing.LastingText" : "AZEROTH.Blessing.NextText", { n: boons })}</p>`,
    // NO `system.changes`: a Boon is dice (CLAUDE.md §6).
    ...(span && typeof span === "object" ? span : {}),
    flags: { "azeroth-rpg": { [LAID_BOON_FLAG]: lasting ? { kind, boons, source, lasting: true } : { kind, boons, source } } }
  };
}

/** Lay it here; the caller has established this client may. A second from the same source replaces the first. */
async function layBoonHere({ victim, kind, boons, source, originUuid, lasting = false, span = null }) {
  const row = cleanLaidBoon({ kind, boons, source, lasting });
  if (!row) return null;
  const stale = (victim.effects ?? []).filter(e => {
    const held = cleanLaidBoon(e.flags?.["azeroth-rpg"]?.[LAID_BOON_FLAG] ?? null);
    return held && held.source === row.source && (e.origin ?? null) === (originUuid ?? null);
  }).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [
    boonData({ kind: row.kind, boons: row.boons, source: row.source, originUuid, lasting: row.lasting === true, span })
  ]);
  return made ? { name: victim.name, kind: row.kind, boons: row.boons, source: row.source } : null;
}

/** The GM-side handler: the layer must own what laid it. Throws with the reason. */
export async function layBoonQueryHandler({ victimUuid, kind, boons, source, originUuid, lasting = false, span = null } = {}, { user = null } = {}) {
  const victim = await fromUuid(victimUuid);
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
  if (user && originUuid) {
    const origin = await fromUuid(originUuid);
    if (origin?.documentName === "Actor" && !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin.name }));
    }
  }
  const done = await layBoonHere({ victim, kind, boons, source, originUuid, lasting: lasting === true, span });
  if (!done) throw new Error(game.i18n.localize("AZEROTH.Reaction.Refuse.Unreadable"));
  return done;
}

/**
 * **LAY A BOON ON A CREATURE'S TEST** (04's Blessing: *A friendly target you can
 * see gains a Boon on their next Test. At rank 2 it applies to every Test they
 * make this round*; D-772): a count spent by the next Test it bears on, or a
 * span (`lasting`) every Test in it takes. Here where this client owns the
 * creature, on the active GM's client otherwise; the refusal is shown.
 *
 * @param {{victim: Actor, kind: string, boons: number, source?: string, by?: Actor|null, lasting?: boolean, span?: object|null}} o
 */
export async function layBoon({ victim, kind, boons, source = "", by = null, lasting = false, span = null } = {}) {
  if (!victim) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Reaction.Refuse.Gone"));
    return null;
  }
  const originUuid = by?.uuid ?? null;
  try {
    if (victim.isOwner) return await layBoonHere({ victim, kind, boons, source, originUuid, lasting: lasting === true, span });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return await gm.query(LAY_BOON_QUERY, { victimUuid: victim.uuid, kind, boons, source, originUuid, lasting: lasting === true, span }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * Spend the Boons laid on this creature's Test of one kind - a count, of its
 * kind or of every kind - and say what was spent. Called after the die on every
 * Test path, beside `spendLaidBanes`. A lasting one stands on its own clock.
 *
 * @returns {Promise<string[]>} the sources spent
 */
export async function spendLaidBoons(actor, kind) {
  if (!actor?.isOwner) return [];
  const effects = (actor.effects ?? []).filter(e => boonSpentBy(e.flags?.["azeroth-rpg"]?.[LAID_BOON_FLAG] ?? null, kind));
  if (!effects.length) return [];
  const names = effects.map(e => String(e.flags?.["azeroth-rpg"]?.[LAID_BOON_FLAG]?.source ?? "")).filter(Boolean);
  await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  return names;
}
