/**
 * **WHAT HOLDS A CREATURE BACK FROM A DEATH STEP, ASKED AS IT WOULD BE TAKEN** (the
 * Legacy branches' door 11). `rules/death-holds.mjs` is the law and
 * `AzerothActor#takeDeathStep` the one door that calls `askDeathHold`, before the step
 * is written - every Death Step comes through it: a failed Test at the turn's start,
 * Bleeding on the Dying, and an attack against a Dying creature.
 *
 * - **04's Hold the Thread** (*As a Reaction, spend 2 Mana. A creature within 30 feet
 *   that would take a Death Step does not take it*): every holder whose token stands
 *   within the feet of the creature, measured between the nearest squares (D-732), is
 *   asked in turn through the blow doors' own pattern (`effects/blow-doors.mjs`): an
 *   active player who owns the holder, else the active GM, through `CONFIG.queries`
 *   (`DEATH_HOLD_QUERY`, never `game.socket`) - or a dialog here where that is this
 *   user. Judged before it is asked and again on the holder's own client before
 *   anything is spent (D-768's order): the Reaction, then the Mana, then a use. The
 *   dialog closes itself as *no* before the asker stops waiting, so a late yes can
 *   never hold a step the asker has already written.
 * - **04's Burial Ground at rank 2** (`burialSpares`): *an attack against a **Dying**
 *   friendly target inside it adds no Death Step* - the rider an area placed from the
 *   card carries (`rules/area-ticks.mjs`' `remains` row with `noDeathStep`), read off
 *   the creature's token DOCUMENT inside the Region (`testInsideRegion`, 14.367), the
 *   creature the area's caster's ally, and the area still standing.
 *
 * **BOTH READ THE CREATURE'S OWN SCENE** (the B3 review): `ownTokenOf` - its token on its
 * fight's scene, else the viewed one, else any - and the holders' token DOCUMENTS there,
 * measured on that scene's own grid; never the viewed board's placeables, since the
 * active GM who runs a turn's Death Step may be viewing another scene.
 */

import { AZEROTH } from "../config.mjs";
import { deathHoldJudgement, deathHoldsFor, deathStepSpared, holdAnswerWithin, stepTokenOf } from "../rules/death-holds.mjs";
import { ridersFor } from "../rules/area-ticks.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { manaPool, poolNamed } from "../rules/pools.mjs";
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmStateFor } from "./spirit-realm.mjs";
import { kindsOfActor, relationTo } from "./area-strikes.mjs";
import { actorOf, areaRecord, casterTokenOn, staleIn, worldClock } from "../canvas/sustained-areas.mjs";

/** The query a holder is asked through, on whoever answers for it. */
export const DEATH_HOLD_QUERY = "azeroth-rpg.deathHold";

/** A remote yes's answer's own way back to the asker, inside `ASK_MS`. */
const ANSWER_GRACE_MS = 2000;

/**
 * **THE CREATURE'S OWN TOKEN, ON ITS OWN SCENE** (the B3 review: the holds and Burial
 * Ground read the VIEWED scene, and the active GM who runs a turn's Death Step may be
 * viewing another): its token on its fight's scene, else on the viewed scene, else on
 * any (`rules/death-holds.mjs#stepTokenOf`). A token DOCUMENT, measured on that scene's
 * own grid (`canvas/footprints.mjs#feetApart`).
 *
 * @param {Actor} actor
 * @returns {TokenDocument|null}
 */
export function ownTokenOf(actor) {
  if (!actor) return null;
  const docs = actor.isToken ? [actor.token] : (actor.getDependentTokens?.({ linked: true }) ?? []);
  const fight = actor.activeFight?.() ?? null;
  const fighter = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const fightSceneId = fighter?.token?.parent?.id ?? fighter?.sceneId ?? fight?.scene?.id ?? null;
  const hit = stepTokenOf(docs.filter(Boolean).map(doc => ({ sceneId: doc.parent?.id ?? null, doc })), {
    fightSceneId, viewedSceneId: globalThis.canvas?.scene?.id ?? null
  });
  return hit?.doc ?? null;
}

/** A holder's token on one scene, or null. */
function tokenOn(holder, scene) {
  return (scene?.tokens ?? []).find(t => t.actor && t.actor.uuid === holder.uuid) ?? null;
}

/** A pool's value, as it stands, for the price a row names. */
function poolValueOf(holder, pool) {
  const pools = holder?.poolSnapshot?.() ?? [];
  const found = pool === "mana" ? manaPool(pools) : poolNamed(pools, pool, {});
  return found ? Math.max(0, Math.trunc(Number(found.value)) || 0) : null;
}

/** The uses left on the counter a hold's talent grants. */
function usesLeft(holder, row) {
  const counter = row?.talentId ? (holder.grantedFeature?.(row.talentId) ?? null) : null;
  return Math.max(0, Math.trunc(Number(counter?.system?.uses?.value)) || 0);
}

/** What the judgement reads for one holder, off the world as this client holds it. */
function factsOf(holder, row, target, distance) {
  return {
    distance, usesLeft: usesLeft(holder, row), holderUp: (holder.system?.health?.value ?? 0) > 0,
    reactionLeft: game.system.azeroth.workflows.turnBudgetRefusal(holder, "reaction") === null,
    poolValue: row.cost ? poolValueOf(holder, row.cost.pool) : null,
    self: holder.uuid === target.uuid, inRealm: realmStateFor(holder).in === true
  };
}

/**
 * The holds that could be made for this creature, off its own scene as it stands
 * (the B3 review: never the viewed board): every holder whose token is on the
 * creature's scene, each row its talents give, with the feet between them - sorted by
 * the holder's name, then the row's identifier.
 */
function holdOffers(target) {
  const origin = ownTokenOf(target);
  const scene = origin?.parent ?? null;
  if (!origin || !scene?.tokens) return [];
  const offers = [];
  const seen = new Set();
  for (const doc of scene.tokens) {
    const holder = doc.actor;
    if (!holder || holder.type !== "character" || seen.has(holder.uuid)) continue;
    seen.add(holder.uuid);
    const rows = deathHoldsFor(holder.takenTalents?.() ?? [], talentEffect);
    if (!rows.length) continue;
    const distance = doc.id === origin.id ? 0 : feetApart(origin, doc);
    // The holder's token rides the offer, for the hold's card (the Legacy branches' door 2).
    for (const row of rows) offers.push({ holder, row, distance, doc });
  }
  return offers.sort((a, b) => String(a.holder.name).localeCompare(String(b.holder.name)) || a.row.identifier.localeCompare(b.row.identifier));
}

/** Ask a holder: a dialog here where this user answers for it, else the query on the user who does. */
async function ask(holder, payload) {
  const who = answererOf(holder);
  if (!who) return { held: false, reason: "nobody" };
  if (who.id === game.user.id) return deathHoldQueryHandler(payload, { user: game.user });
  try {
    return await who.query(DEATH_HOLD_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err.message }));
    return { held: false, reason: "error" };
  }
}

/**
 * **A DEATH STEP HELD BACK** (04's Hold the Thread): each holder who could, asked in
 * turn; the first yes pays its Reaction, its Mana and a use, and the step is not taken.
 *
 * **AND WHO HELD WHOM, FOR THE CARD** (the Legacy branches' door 2): the row's own
 * identifier, and the two tokens the reach was measured between - the holder's and
 * the creature's - which `AzerothActor#takeDeathStep` records on the hold's card.
 *
 * @param {{target: Actor}} o
 * @returns {Promise<{held: boolean, holder?: Actor, name?: string, identifier?: string,
 *   holderToken?: {sceneId: string|null, tokenId: string}|null, targetToken?: {sceneId: string|null, tokenId: string}|null}>}
 */
export async function askDeathHold({ target } = {}) {
  if (!target || target.type !== "character") return { held: false };
  for (const offer of holdOffers(target)) {
    if (!deathHoldJudgement(offer.row, factsOf(offer.holder, offer.row, target, offer.distance)).ok) continue;
    const answer = await ask(offer.holder, { holderUuid: offer.holder.uuid, targetUuid: target.uuid, identifier: offer.row.identifier, distance: offer.distance });
    if (answer?.held) {
      return {
        held: true, holder: offer.holder, name: offer.row.name, identifier: offer.row.identifier,
        holderToken: tokenRefOf(offer.doc), targetToken: tokenRefOf(ownTokenOf(target))
      };
    }
  }
  return { held: false };
}

/** A token document as a card records one, or null. */
function tokenRefOf(token) {
  const doc = token?.document ?? token ?? null;
  return doc?.id ? { sceneId: doc.parent?.id ?? null, tokenId: doc.id } : null;
}

/**
 * The hold on the holder's own client: judged, asked, judged again, and paid.
 *
 * **A REMOTE YES IS ANSWERED IN TIME** (the B3 review; the blow doors' `remote` shape):
 * where another client asked (`remote`), it stops waiting `ASK_MS` after it asked and
 * then writes the step - so the payment runs while time is left
 * (`rules/death-holds.mjs#holdAnswerWithin`, from `startedAt`, the query's arrival)
 * and the yes is answered then whatever the payment is doing; a payment that refuses
 * after the answer says so in words. Asked here (`remote` false), the payment is
 * awaited first, as it always was.
 */
async function holdHere({ holder, target, identifier, distance, remote = false, startedAt = Date.now() }) {
  const row = deathHoldsFor(holder.takenTalents?.() ?? [], talentEffect).find(r => r.identifier === identifier) ?? null;
  if (!row) return { held: false, reason: "unknown" };
  // The distance measured here, on the creature's own scene, else the asker's.
  const origin = ownTokenOf(target);
  const mine = origin ? tokenOn(holder, origin.parent) : null;
  const here = origin && mine ? (mine.id === origin.id ? 0 : feetApart(origin, mine)) : null;
  const judge = () => deathHoldJudgement(row, factsOf(holder, row, target, here ?? distance));
  const first = judge();
  if (!first.ok) return { held: false, reason: first.reason };
  const yes = await confirmHere(holder, {
    title: row.name,
    text: game.i18n.format("AZEROTH.DeathHold.Ask", {
      holder: holder.name, name: target.name, talent: row.name, n: usesLeft(holder, row), mana: row.cost?.amount ?? 0,
      pool: game.i18n.localize(AZEROTH.poolTypes?.[row.cost?.pool] ?? row.cost?.pool ?? "")
    })
  });
  if (!yes) return { held: false, reason: "declined" };
  // Judged AGAIN after the dialog (the pool and the turn move while it stands open),
  // then the Reaction, then the price, then the use - D-768's order.
  const again = judge();
  if (!again.ok) {
    ui.notifications?.warn(game.i18n.format(`AZEROTH.DeathHold.Refuse.${again.reason}`, { name: holder.name, talent: row.name, feet: row.feet }));
    return { held: false, reason: again.reason };
  }
  const pay = async () => {
    if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) return false;
    const price = Math.max(0, Math.trunc(Number(row.cost?.amount)) || 0);
    if (price > 0) {
      const pools = holder.poolSnapshot?.() ?? [];
      const pool = row.cost.pool === "mana" ? manaPool(pools) : poolNamed(pools, row.cost.pool, {});
      if (pool) await holder.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.max(0, pool.value - price) });
    }
    const counter = holder.grantedFeature?.(row.talentId) ?? null;
    const left = usesLeft(holder, row);
    if (counter && left > 0) await counter.update({ "system.uses.value": left - 1 });
    return true;
  };
  const paying = pay();
  if (!remote) return (await paying) ? { held: true } : { held: false, reason: "noReaction" };
  const within = holdAnswerWithin({ startedAt, now: Date.now(), askMs: ASK_MS, graceMs: ANSWER_GRACE_MS });
  let timer = null;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve("late"), within); });
  const outcome = await Promise.race([paying.then(ok => (ok ? "paid" : "refused")), late]);
  clearTimeout(timer);
  if (outcome === "refused") return { held: false, reason: "noReaction" };
  if (outcome === "late") {
    // A payment that throws is unpaid, said in the same words as one refused and
    // warned of, never logged as an error (CLAUDE.md §16).
    paying.then(ok => {
      if (!ok) ui.notifications?.warn(game.i18n.format("AZEROTH.DeathHold.Unpaid", { name: holder.name, talent: row.name }));
    }).catch(err => {
      ui.notifications?.warn(game.i18n.format("AZEROTH.DeathHold.Unpaid", { name: holder.name, talent: row.name }));
      console.warn("azeroth-rpg | hold the thread's payment", err);
    });
  }
  return { held: true };
}

/**
 * The handler a holder is asked through (`DEATH_HOLD_QUERY`), on the client that
 * answers for the holder. The asker must own the creature at the step - it was their
 * client that would write it. Throws with the reason, which travels back.
 */
export async function deathHoldQueryHandler(payload = {}, { user = null } = {}) {
  const startedAt = Date.now();
  const holder = payload.holderUuid ? await fromUuid(payload.holderUuid) : null;
  const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
  if (holder?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !target.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: target.name }));
  if (!holder.isOwner) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
  return holdHere({
    holder, target, identifier: String(payload.identifier ?? ""), distance: typeof payload.distance === "number" ? payload.distance : null,
    // Asked by ANOTHER client, which stops waiting at ASK_MS (the blow doors' own rule).
    remote: Boolean(user?.id) && user.id !== game.user?.id, startedAt
  });
}

/**
 * **WHETHER AN AREA SPARES THIS DYING CREATURE THE STEP AN ATTACK ADDS** (04's Burial
 * Ground at rank 2): a standing area on the creature's scene whose rider says
 * `noDeathStep`, the creature's token inside it and the area's caster's ally. The
 * area's name, or null.
 *
 * @param {Actor} target
 * @returns {string|null}
 */
export function burialSpares(target) {
  // The creature's own token on its own scene (the B3 review: never the viewed board's).
  for (const token of [ownTokenOf(target)].filter(Boolean)) {
    const scene = token.parent ?? null;
    if (!scene?.regions) continue;
    const now = worldClock();
    for (const region of scene.regions) {
      const f = region.flags?.["azeroth-rpg"] ?? {};
      if (!f.cast || !(f.areaTick?.remains ?? []).some(r => r?.noDeathStep === true)) continue;
      const record = areaRecord(region);
      if (record && staleIn(scene, [record], now).length) continue;
      let inside = false;
      try {
        inside = token.testInsideRegion(region);
      } catch {
        inside = false;
      }
      if (!inside) continue;
      const caster = actorOf(f.caster);
      const relation = caster ? relationTo({ caster, casterToken: casterTokenOn(scene, f.source ?? null, caster), actor: target, token }) : "other";
      if (deathStepSpared(ridersFor(f.areaTick, { relation, kinds: kindsOfActor(target), uuid: target.uuid }))) return f.spell?.name ?? region.name ?? "";
    }
  }
  return null;
}
