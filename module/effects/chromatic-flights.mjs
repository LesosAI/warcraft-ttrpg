/**
 * **THE SPELL-WEAVER'S AND THE TIMEWALKER'S WRITES, AND THE DRAKES'** (04's Chromatic
 * Champion branches; stage 3B). `rules/chromatic-talents.mjs` is the law; this is the one
 * write for what it decides, each on the client that may make it:
 *
 * - **Mana Hunger** (`feedManaHunger`): once a round, Rage for every holder within 30 feet
 *   of a creature that casts - on the active GM's client, which may write every holder, the
 *   round's once marked through the holder's combatant's queued door (D-761).
 * - **Spellbreak** (`breakSustain`): one Sustain ended through `workflows.endSustain`, the
 *   Stop's own door - here where this client owns the creature, on the active GM's through
 *   `CHROMATIC_FLIGHT_QUERY` where it does not, the handler judging the breaker again.
 * - **Spellthief** (`stealAfterEnding`): Rage, and at rank 2 one ally's Mana through the one
 *   Mana gift (`effects/gifts.mjs#giveMana`).
 * - **Hasten** (`layHasten`, `takeHastened`): the Half-Action an effect on the creature
 *   carries until its next turn starts, given then through the combatant's own door
 *   (`AzerothCombatant#grantHalfActions`), and Borrowed Moment's Speed. **02's Bloodlust**
 *   (`layBloodlust`) lays the same effect through the same write (`hastenedHere`; the lead,
 *   2026-11-08: *"Fix it now"*), and `rules/extra-halves.mjs` is the law of both.
 * - **Rewind** (`offerRewind`, `rewindFromCard`, `landRewind`): the offer card row a blow
 *   posts to the holder's owner (D-779), the press through the granted feature's door, and
 *   the heal off the offer's own record.
 * - **The Blue Drake's Mana** (`blueDrakeTurn`), the **Bronze Drake's Half-Action**
 *   (`bronzeDrakeHalf`) and the **Black Drake's landing** (`blackDrakeLanding`).
 */

import { AZEROTH } from "../config.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import {
  HASTENED_FLAG, MANA_HUNGER_MARK, blueDrakeTurnFor, drakeHalfFor, hastenFor, landingFor,
  landingCatches, manaHungerFor, offerMoment, offerStands, rewindFor, rewindHeal, spellbreakGain, spellthiefFor
} from "../rules/chromatic-talents.mjs";
import { BLOODLUST, hastenedHalves, hastenedSplit } from "../rules/extra-halves.mjs";
import { classFeatureOnUse } from "../rules/class-features.mjs";
import { manaPool, poolNamed } from "../rules/pools.mjs";
import { feetApart, footprintOf, feetBetweenFootprints } from "../canvas/footprints.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound, untilEncounterEnd } from "./durations.mjs";
import { landedText } from "../helpers/rider-words.mjs";

/** The query a write on a creature this client does not own goes through. */
export const CHROMATIC_FLIGHT_QUERY = "azeroth-rpg.chromaticFlight";

/** Rewind's offer card. */
const REWIND_TEMPLATE = "systems/azeroth-rpg/templates/chat/rewind-offer.hbs";

/** Resolve a document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

/** Whether this client is the active GM. */
const activeGM = () => game.users?.activeGM?.isSelf === true;

/** A one-line card in the drain style the turn's own lines take. */
async function lineCard(actor, text, kind) {
  if (!text) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(text)}</p>`,
    flags: { "azeroth-rpg": { kind } }
  });
}

/**
 * Gain into one named pool, never past its maximum. Answers what landed.
 *
 * @param {Actor} actor
 * @param {string} name
 * @param {number} amount
 */
export async function gainNamedPool(actor, name, amount) {
  const pool = poolNamed(actor?.poolSnapshot?.() ?? [], name);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !(n > 0)) return 0;
  const value = Math.min(pool.max, pool.value + n);
  if (value <= pool.value) return 0;
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - pool.value;
}

/** Mana into a creature's Mana pool here, never past its maximum. Answers what landed. */
async function manaInto(actor, amount) {
  const pool = manaPool(actor?.poolSnapshot?.() ?? []);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !(n > 0)) return 0;
  const value = Math.min(pool.max, pool.value + n);
  if (value <= pool.value) return 0;
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - pool.value;
}

/** A creature's combatant in its own started fight, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight ? (fight.getCombatantsByActor(actor)?.[0] ?? null) : null;
}

/* -------------------------------------------- */
/*  Mana Hunger                                  */
/* -------------------------------------------- */

/**
 * **MANA HUNGER, FED BY A CAST** (04: *Once a round, when a creature within 30 feet of you
 * casts a spell, gain 1 Rage. At rank 2, gain 2*), called once a cast is paid for. On the
 * active GM's client, which judges the reach itself off the caster's token; elsewhere it
 * asks that client and waits for nothing it needs. A cast with no token on a scene feeds
 * nobody: nothing can be measured.
 *
 * **NEVER A ROUND TRIP FOR NOTHING, AND NEVER IN THE CAST'S WAY** (the 3B review,
 * should-fix 4): the holders are judged HERE first - talents and tokens are on every
 * client - and where no holder of Mana Hunger in a started fight stands within its feet of
 * the caster, nothing is asked of anybody. Where one does, the GM is asked and not waited
 * for: nothing in the cast depends on the Rage, and `castSpell` does not await this door.
 *
 * @param {{caster: Actor, source?: {sceneId?: string, tokenId?: string}|null}} o
 */
export async function feedManaHunger({ caster, source = null } = {}) {
  if (!caster) return [];
  const tokenDoc = (source?.sceneId && source?.tokenId ? game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId) : null)
    ?? caster.getActiveTokens?.(true)?.[0]?.document ?? null;
  if (!tokenDoc || !manaHungerHolders(caster, tokenDoc).length) return [];
  if (activeGM()) return manaHungerHere(caster, tokenDoc);
  const gm = game.users?.activeGM ?? null;
  if (!gm) return [];
  gm.query(CHROMATIC_FLIGHT_QUERY, { op: "manaHunger", casterUuid: caster.uuid, tokenUuid: tokenDoc.uuid }, { timeout: 15000 })
    .catch(err => console.warn("azeroth-rpg | Mana Hunger", err));
  return [];
}

/**
 * The holders Mana Hunger could feed off this cast, judged on any client: a character other
 * than the caster, standing, holding the talent, within its feet of the casting token, in a
 * started fight (out of one there is no round to count). Sorted by uuid.
 *
 * @param {Actor} caster
 * @param {TokenDocument} tokenDoc
 * @returns {Array<{holder: Actor, row: object}>}
 */
export function manaHungerHolders(caster, tokenDoc) {
  const scene = tokenDoc?.parent ?? null;
  if (!scene) return [];
  const holders = new Map();
  for (const t of scene.tokens ?? []) {
    const holder = t.actor;
    if (!holder || holder.type !== "character" || holder.uuid === caster?.uuid || holders.has(holder.uuid)) continue;
    if ((holder.system?.health?.value ?? 0) <= 0) continue;
    const row = manaHungerFor(holder.takenTalents?.() ?? [], talentEffect);
    if (!row || !combatantOf(holder)) continue;
    const feet = feetApart(t, tokenDoc);
    if (feet === null || feet > row.feet) continue;
    holders.set(holder.uuid, { holder, row });
  }
  return [...holders.values()].sort((a, b) => a.holder.uuid.localeCompare(b.holder.uuid));
}

/** Every holder within its feet of the casting token, once a round each, in a started fight. */
async function manaHungerHere(caster, tokenDoc) {
  const lines = [];
  for (const { holder, row } of manaHungerHolders(caster, tokenDoc)) {
    // *Once a round*: the holder's own round record, in its started fight. Out of a fight
    // there is no round to count, and nothing is gained (MY READING, the riders' rule).
    const combatant = combatantOf(holder);
    if (!combatant) continue;
    const marked = await combatant.markRoundOnce(MANA_HUNGER_MARK);
    if (marked?.added !== true) continue;
    const gained = await gainNamedPool(holder, "rage", row.gain);
    if (gained > 0) {
      const text = game.i18n.format("AZEROTH.ManaHunger.Gained", { name: holder.name, n: gained, caster: caster.name, talent: row.name });
      lines.push(text);
      await lineCard(holder, text, "manaHunger");
    }
  }
  return lines;
}

/* -------------------------------------------- */
/*  Spellbreak and Spellthief                    */
/* -------------------------------------------- */

/** End one Sustain here; the caller has established that this client may. */
async function breakHere(target, cast) {
  const ended = await game.system.azeroth.workflows.endSustain({ actor: target, cast, notice: "AZEROTH.Spellbreak.Ended" });
  return ended ? { ended: true, name: ended.name ?? "" } : { ended: false, name: "" };
}

/**
 * **SPELLBREAK ENDS ONE SUSTAIN** (04: *end one Sustained spell that a creature within 30
 * feet is sustaining*): the cast picked at the judgement, through the Stop's own door.
 *
 * @param {{breaker: Actor, target: Actor, cast: string}} o
 * @returns {Promise<{ended: boolean, name: string}>}
 */
export async function breakSustain({ breaker, target, cast }) {
  if (!target || !cast) return { ended: false, name: "" };
  if (target.isOwner) return breakHere(target, cast);
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { ended: false, name: "" };
  try {
    const done = await gm.query(CHROMATIC_FLIGHT_QUERY, { op: "spellbreak", breakerUuid: breaker.uuid, targetUuid: target.uuid, cast }, { timeout: 15000 });
    return { ended: done?.ended === true, name: String(done?.name ?? "") };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ended: false, name: "" };
  }
}

/**
 * **WHAT SPELLBREAK GIVES ITS USER** (04: *Gain Rage equal to twice your rank*), once a
 * Sustain is ended. Answers the card's lines.
 *
 * @param {{actor: Actor, rank: number, name: string}} o
 */
export async function spellbreakRage({ actor, rank = 1, name = "" }) {
  const gained = await gainNamedPool(actor, "rage", spellbreakGain(rank));
  return [game.i18n.format("AZEROTH.Spellbreak.Rage", { name: actor.name, n: gained, talent: name })];
}

/**
 * **SPELLTHIEF'S ALLY, PICKED BEFORE ANYTHING IS PAID** (04: *At rank 2 one ally within 30
 * feet also regains 2 Mana*; the 3B review, should-fix 5, D-768's order): the ally among
 * those within reach who hold Mana - the one where there is one, else through the one
 * chooser - asked at the judgement of the Use or the cast that may end a spell effect, so
 * no chooser opens after the payment or in the middle of a cast. Answers `{ally}` (null
 * where Spellthief gives no Mana or nobody is within reach), or null where the chooser was
 * dismissed: nothing is paid, and the caller refuses the Use.
 *
 * @param {Actor} actor  the creature whose Spellbreak or Unweave may end something
 * @returns {Promise<{ally: {actor: Actor, name: string}|null}|null>}
 */
export async function pickSpellthiefAlly(actor) {
  const row = spellthiefFor(actor?.takenTalents?.() ?? [], { tier: actor?.system?.tier ?? 1 }, talentEffect);
  if (!row || !(row.allyMana > 0)) return { ally: null };
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const near = creaturesWithin(actor, row.feet, { who: "ally" })
    .filter(r => r.actor && manaPool(r.actor.poolSnapshot?.() ?? []))
    .filter((r, i, all) => all.findIndex(x => x.actor.uuid === r.actor.uuid) === i)
    .sort((a, b) => String(a.token?.name ?? a.actor.name).localeCompare(String(b.token?.name ?? b.actor.name)));
  if (!near.length) return { ally: null };
  if (near.length === 1) return { ally: { actor: near[0].actor, name: near[0].token?.name ?? near[0].actor.name } };
  const { chooseOption } = game.system.azeroth.workflows;
  const answer = await chooseOption({ id: `${actor.id}-spellthief`, name: row.name }, near.map(r => ({ key: r.actor.uuid, name: r.token?.name ?? r.actor.name, description: "" })), null,
    { prompt: game.i18n.format("AZEROTH.Spellthief.Prompt", { name: row.name, n: row.allyMana }) });
  const pick = answer ? (near.find(r => r.actor.uuid === answer.key) ?? null) : null;
  return pick ? { ally: { actor: pick.actor, name: pick.token?.name ?? pick.actor.name } } : null;
}

/**
 * **SPELLTHIEF** (04: *When Spellbreak or Unweave ends a spell effect, gain Rage equal to
 * your tier. At rank 2 one ally within 30 feet also regains 2 Mana*): the Rage, and the ally
 * picked at the judgement (`pickSpellthiefAlly`) regaining its Mana through the one Mana
 * gift. Nobody picked gives the Mana to nobody, said in words. Answers the card's lines.
 *
 * @param {{actor: Actor, ally?: {actor: Actor, name: string}|null}} o
 */
export async function stealAfterEnding({ actor, ally = null }) {
  const row = spellthiefFor(actor?.takenTalents?.() ?? [], { tier: actor?.system?.tier ?? 1 }, talentEffect);
  if (!row) return [];
  const lines = [];
  const gained = await gainNamedPool(actor, "rage", row.gain);
  lines.push(game.i18n.format("AZEROTH.Spellthief.Rage", { name: actor.name, n: gained, talent: row.name }));
  if (row.allyMana > 0) {
    if (!ally?.actor) lines.push(game.i18n.format("AZEROTH.Spellthief.NoAlly", { name: row.name, feet: row.feet }));
    else {
      const { giveMana } = await import("./gifts.mjs");
      const landed = await giveMana({ giver: actor, recipient: ally.actor, amount: row.allyMana, pool: "spellthief" });
      lines.push(game.i18n.format("AZEROTH.Spellthief.Mana", { name: ally.name ?? ally.actor.name, n: landed, talent: row.name }));
    }
  }
  return lines;
}

/* -------------------------------------------- */
/*  Hasten                                       */
/* -------------------------------------------- */

/**
 * **THE ONE WRITE OF A HALF-ACTION FOR THE NEXT TURN** (02's Bloodlust and 04's Hasten; the
 * lead, 2026-11-08, on Bloodlust: *"Fix it now"*): the giver's earlier effect of the same
 * source on the creature replaced, and an effect carrying `{by, source, halves, combat}`
 * laid until the fight ends, for `takeHastened` to give at the creature's next turn. Here;
 * the caller has established that this client may write the creature. Answers the docs to
 * create beside it, so Hasten can add Borrowed Moment's Speed in the same write.
 */
async function hastenedHere({ by, target, source, combatId = null, img = "icons/svg/clockwork.svg", extra = [] }) {
  const stale = target.effects.filter(e => {
    const f = e.getFlag("azeroth-rpg", HASTENED_FLAG);
    return f?.by === by.uuid && f?.source === source;
  }).map(e => e.id);
  if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
  const span = untilEncounterEnd(target) ?? {};
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: source, img, origin: by.uuid, ...span,
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.Hasten.Text", { name: target.name }))}</p>`,
    flags: { "azeroth-rpg": { [HASTENED_FLAG]: { by: by.uuid, source, halves: 1, combat: combatId ?? null } } }
  }, ...extra]);
  return true;
}

/**
 * **02's BLOODLUST, LAID ON ONE TARGET** (*gain an extra Half-Action on their next turn*),
 * through the one write Hasten shares: here where this client owns the creature, on the
 * active GM's through `CHROMATIC_FLIGHT_QUERY` where it does not - the handler judging the
 * shaman, the reach and the fight again off the documents.
 *
 * @param {{shaman: Actor, target: Actor, source: string, combatId: string}} o
 * @returns {Promise<boolean>}
 */
export async function layBloodlust({ shaman, target, source, combatId }) {
  if (!shaman || !target) return false;
  if (target.isOwner) return hastenedHere({ by: shaman, target, source, combatId, img: "icons/svg/blood.svg" });
  const gm = game.users?.activeGM ?? null;
  if (!gm) return false;
  try {
    const done = await gm.query(CHROMATIC_FLIGHT_QUERY, { op: "bloodlust", shamanUuid: shaman.uuid, targetUuid: target.uuid, source, combatId }, { timeout: 15000 });
    return done?.laid === true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/**
 * Feet between two creatures where both stand on one scene - the fight's scene first, then
 * any scene the first stands on - or null where nothing can be measured (the system's rule:
 * nothing measured is never refused).
 */
function feetBetweenActors(a, b, fight = null) {
  if (!a || !b) return null;
  if (a.uuid === b.uuid) return 0;
  const ofScene = (actor, scene) => (actor.getDependentTokens?.({ scenes: scene ? [scene] : undefined }) ?? []).find(t => t?.parent?.id === scene?.id) ?? null;
  const scenes = [fight?.scene ?? null, ...((a.getDependentTokens?.() ?? []).map(t => t?.parent))].filter(Boolean);
  for (const scene of scenes) {
    const ta = ofScene(a, scene);
    const tb = ofScene(b, scene);
    if (ta && tb) return feetApart(ta, tb);
  }
  return null;
}

/** Lay Hasten here; the caller has established that this client may write the creature. */
async function hastenHere({ holder, target, combatId }) {
  const row = hastenFor(holder?.takenTalents?.() ?? [], talentEffect);
  if (!row || !target) return { laid: false, speed: 0 };
  const docs = [];
  if (row.speed > 0) {
    docs.push({
      name: game.i18n.format("AZEROTH.Hasten.SpeedName", { talent: row.by.join(", ") || row.name }), img: "icons/svg/wingfoot.svg", origin: holder.uuid,
      ...untilEndOfNextTurnOrRound(target),
      system: { changes: [{ key: "system.speed", type: "add", value: String(row.speed), phase: "final" }] },
      flags: { "azeroth-rpg": { hastenSpeed: { by: holder.uuid, feet: row.speed } } }
    });
  }
  await hastenedHere({ by: holder, target, source: row.name, combatId, extra: docs });
  return { laid: true, speed: row.speed };
}

/**
 * **HASTEN, LAID** (04: *One ally within 30 feet gains a Half-Action on its next turn*;
 * Borrowed Moment at rank 2: *also gains 10 feet of Speed until the end of its next turn*):
 * an effect on the creature carrying the Half-Action until its next turn starts, and the
 * Speed's own `final` change, spanned to its next turn's end or a round of the world's
 * clock (D-778). Here, or on the GM's client, which works the Speed out again off the holder.
 *
 * @param {{holder: Actor, target: Actor, combatId?: string|null}} o
 * @returns {Promise<{laid: boolean, speed: number}>}
 */
export async function layHasten({ holder, target, combatId = null }) {
  if (target?.isOwner) return hastenHere({ holder, target, combatId });
  const gm = game.users?.activeGM ?? null;
  if (!gm) return { laid: false, speed: 0 };
  try {
    const done = await gm.query(CHROMATIC_FLIGHT_QUERY, { op: "hasten", holderUuid: holder.uuid, targetUuid: target.uuid, combatId }, { timeout: 15000 });
    return { laid: done?.laid === true, speed: Number(done?.speed) || 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { laid: false, speed: 0 };
  }
}

/**
 * **THE HALF-ACTION A CREATURE WAS GIVEN FOR ITS NEXT TURN, GIVEN** (04's Hasten; 02's
 * Bloodlust's *gain an extra Half-Action on their next turn* is the same shape): read as the
 * creature's turn starts, after the budget's reset, on the active GM's client - each such
 * effect's Half-Actions granted through the combatant's own queued door and the effect
 * gone. Answers the turn's lines.
 *
 * @param {Combatant} combatant
 */
export async function takeHastened(combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor) return [];
  const held = actor.effects.filter(e => e.active !== false && e.getFlag("azeroth-rpg", HASTENED_FLAG));
  if (!held.length) return [];
  const records = held.map(e => e.getFlag("azeroth-rpg", HASTENED_FLAG));
  const halves = hastenedHalves(records);
  // The capped first, then Master of Hours' gifts past the cap (D-877).
  const split = hastenedSplit(records);
  if (split.capped > 0) await combatant.grantHalfActions(split.capped);
  if (split.uncapped > 0) await combatant.grantHalfActions(split.uncapped, { uncapped: true });
  await actor.deleteEmbeddedDocuments("ActiveEffect", held.map(e => e.id));
  return [game.i18n.format("AZEROTH.Hasten.Given", { name: actor.name, n: halves, source: held.map(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source ?? e.name).join(", ") })];
}

/* -------------------------------------------- */
/*  Rewind                                       */
/* -------------------------------------------- */

/**
 * **REWIND'S OFFER** (04: *Once per Short Rest, as a Reaction when a creature within 30
 * feet takes damage, spend 2 Rage. It regains half the Health that blow took, rounded up*),
 * read in the blow once the Health is written: a card for every holder within its feet of
 * the creature - the creature itself among them (MY READING: *a creature* at no distance is
 * within 30 feet) - whose row is shown to that holder's owner and the GM (D-779), carrying
 * the Health the blow took for the press to read. A holder with no use left is offered
 * nothing.
 *
 * **WHAT THE 3B REVIEW CHANGED** (should-fix 3):
 *
 * - **Only for an ally of the holder, the holder included** (MY READING, for the lead: 04
 *   says *a creature*, and Rewind gives that creature back Health - the general ally rule,
 *   `canvas/engaged.mjs#allyOf`, the holder its own ally; an offer on every blow the party
 *   lands on an enemy was a whispered card nobody presses);
 * - **only to a holder who could pay now**: a Reaction left (`turnBudgetRefusal`) and the
 *   Rage the feature costs;
 * - **measured on the creature's own scene**, never only the viewed one: the struck
 *   creature's token there - its own, the fight's scene's, or the viewed board's - against
 *   each holder's token on that scene;
 * - **the moment recorded** (`offerMoment`): the fight's turn, or the world's clock out of
 *   a fight, so the press refuses an offer whose moment has passed (`offerStands`).
 *
 * @param {{target: Actor, before: number, after: number}} o
 * @returns {Promise<number>}  how many offers were posted
 */
export async function offerRewind({ target, before = 0, after = 0 } = {}) {
  const taken = Math.max(0, Math.trunc(Number(before) - Number(after)) || 0);
  if (!target || !(taken > 0)) return 0;
  const fight = target.activeFight?.() ?? null;
  const tokenDoc = struckToken(target, fight);
  const scene = tokenDoc?.parent ?? null;
  if (!tokenDoc || !scene) return 0;
  const at = offerMoment({ combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time?.worldTime ?? 0 });
  const { turnBudgetRefusal } = game.system.azeroth.workflows;
  const { allyOf } = await import("../canvas/engaged.mjs");
  let posted = 0;
  const seen = new Set();
  for (const t of scene.tokens ?? []) {
    const holder = t.actor;
    if (!holder || holder.type !== "character" || seen.has(holder.uuid)) continue;
    const row = rewindFor(holder.takenTalents?.() ?? [], talentEffect);
    if (!row) continue;
    seen.add(holder.uuid);
    if (holder.uuid !== target.uuid && !allyOf(holder, target)) continue;
    const feet = holder.uuid === target.uuid ? 0 : feetApart(t, tokenDoc);
    if (feet === null || feet > row.feet) continue;
    const talent = holder.items.find(i => i.type === "talent" && i.name === row.name) ?? null;
    const feature = talent ? (holder.grantedFeature?.(talent.id) ?? null) : null;
    if (!feature || (feature.system?.uses?.per && (feature.system.uses.value ?? 0) <= 0)) continue;
    if (turnBudgetRefusal?.(holder, "reaction")) continue;
    const price = Math.max(0, Math.trunc(Number(feature.system?.cost?.amount)) || 0);
    const rage = poolNamed(holder.poolSnapshot?.() ?? [], "rage");
    if (price > 0 && (!rage || rage.value < price)) continue;
    const owners = (game.users?.contents ?? []).filter(u => holder.testUserPermission?.(u, "OWNER")).map(u => u.id);
    const words = { holder: holder.name, name: target.name, talent: row.name, n: taken, heal: rewindHeal(taken, { whole: row.whole }) };
    const content = await foundry.applications.handlebars.renderTemplate(REWIND_TEMPLATE, {
      name: row.name, text: game.i18n.format("AZEROTH.Rewind.Offer", words), label: game.i18n.format("AZEROTH.Rewind.Press", words),
      holderUuid: holder.uuid, featureId: feature.id, targetUuid: tokenDoc.uuid
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }), content, whisper: owners,
      flags: { "azeroth-rpg": { kind: "rewindOffer", rewind: { holder: holder.uuid, target: tokenDoc.uuid, taken, at } } }
    });
    posted += 1;
  }
  return posted;
}

/**
 * The token a struck creature stands on, read off its own scene where it can be: a token
 * actor's own token, else its token on its fight's scene, else on the viewed board, else
 * the first scene it stands on. Null where it stands on none.
 *
 * @param {Actor} actor
 * @param {Combat|null} fight
 * @returns {TokenDocument|null}
 */
export function struckToken(actor, fight = null) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token;
  const tokens = (actor.getDependentTokens?.() ?? []).filter(Boolean);
  const onFight = fight?.scene ? tokens.find(t => t.parent?.id === fight.scene.id) : null;
  const viewed = tokens.find(t => t.parent?.id === canvas?.scene?.id) ?? actor.getActiveTokens?.(true)?.[0]?.document ?? null;
  return onFight ?? viewed ?? tokens[0] ?? null;
}

/**
 * Whether an offer card's moment still stands (04's Rewind and Lifeblood, *as a Reaction
 * when ...*; `rules/chromatic-talents.mjs#offerStands`): the fight it recorded read by its
 * id, as it stands now, and the world's clock.
 *
 * @param {object|null} at  the moment the offer recorded
 */
export function offerStillStands(at) {
  const fight = at?.combatId ? (game.combats?.get(at.combatId) ?? null) : null;
  return offerStands(at, { fight: fight?.started ? { id: fight.id, round: fight.round, turn: fight.turn } : null, time: game.time?.worldTime ?? 0 });
}

/**
 * **A REWIND PRESSED FROM ITS OFFER** (D-779's shape): the holder - owned here, the row's
 * own audience - uses the granted feature through its own door at the creature the offer
 * names, the offer handed in as the card it answers.
 */
export async function rewindFromCard(button) {
  const holder = docAt(button?.dataset?.holderUuid);
  if (holder?.documentName !== "Actor" || !holder.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder?.name ?? "" }));
    return null;
  }
  const feature = holder.items.get(button.dataset.featureId ?? "") ?? null;
  const tokenDoc = docAt(button.dataset.targetUuid);
  const messageId = button.closest?.("[data-message-id]")?.dataset?.messageId ?? null;
  if (feature?.type !== "feature" || !tokenDoc?.actor || !messageId) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
    return null;
  }
  const { useFeatureWithDialog } = await import("../applications/actions.mjs");
  const target = { actorId: tokenDoc.actor.id, tokenId: tokenDoc.id, sceneId: tokenDoc.parent?.id ?? null, name: tokenDoc.name };
  return useFeatureWithDialog(holder, feature, null, { targets: [target], answers: { messageId } });
}

/**
 * **THE OFFER A REWIND ANSWERS, JUDGED** (04's Rewind): the offer card named, of this
 * holder, for this creature, not yet pressed, the creature still within its feet. Answers
 * `{ok, offer, taken, heal, reason}`; the heal at the holder's rank NOW.
 *
 * @param {{holder: Actor, messageId: string|null, target: Actor|null, targetToken: Token|null, ownToken: Token|null}} o
 */
export function rewindJudgement({ holder, messageId = null, target = null, targetToken = null, ownToken = null }) {
  const message = messageId ? (game.messages?.get(messageId) ?? null) : null;
  const record = message?.flags?.["azeroth-rpg"]?.rewind ?? null;
  if (!record || record.holder !== holder?.uuid) return { ok: false, reason: "AZEROTH.Rewind.NoOffer" };
  if (message.flags?.["azeroth-rpg"]?.pressed?.rewind) return { ok: false, reason: "AZEROTH.TalentLine.Pressed" };
  // The moment the blow was struck has passed (the 3B review, should-fix 3).
  if (!offerStillStands(record.at ?? null)) return { ok: false, reason: "AZEROTH.Rewind.Stale" };
  const recordTarget = docAt(record.target);
  if (!target || !recordTarget?.actor || recordTarget.actor.uuid !== target.uuid) return { ok: false, reason: "AZEROTH.Rewind.NotThat" };
  const row = rewindFor(holder.takenTalents?.() ?? [], talentEffect);
  if (!row) return { ok: false, reason: "AZEROTH.Rewind.NoOffer" };
  const feet = target.uuid === holder.uuid ? 0 : (ownToken && targetToken ? feetApart(ownToken, targetToken) : null);
  if (feet !== null && feet > row.feet) return { ok: false, reason: "AZEROTH.Rewind.TooFar" };
  const taken = Math.max(0, Math.trunc(Number(record.taken)) || 0);
  return { ok: true, message, taken, heal: rewindHeal(taken, { whole: row.whole }), row, reason: null };
}

/**
 * **REWIND'S HEAL** (04: *It regains half the Health that blow took, rounded up. At rank 2
 * it regains all of it*), through the one healing door from the holder - here, or on the
 * GM's client, which reads the offer's record and the holder's rank again.
 *
 * @param {{holder: Actor, target: Actor, messageId: string}} o
 * @returns {Promise<number>}  the Health that landed
 */
export async function landRewind({ holder, target, messageId }) {
  if (target?.isOwner) return rewindHealHere({ holder, target, messageId });
  const gm = game.users?.activeGM ?? null;
  if (!gm) return 0;
  try {
    const done = await gm.query(CHROMATIC_FLIGHT_QUERY, { op: "rewind", holderUuid: holder.uuid, targetUuid: target.uuid, messageId }, { timeout: 15000 });
    return Number(done?.healed) || 0;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/** The heal here, read off the offer's record and the holder's rank. */
async function rewindHealHere({ holder, target, messageId }) {
  const message = messageId ? (game.messages?.get(messageId) ?? null) : null;
  const record = message?.flags?.["azeroth-rpg"]?.rewind ?? null;
  const row = rewindFor(holder?.takenTalents?.() ?? [], talentEffect);
  if (!record || !row || record.holder !== holder.uuid) return 0;
  // The press claimed the offer before anything was spent (`claimCardPress`), and the heal
  // lands once: marked on the offer here where this client may write it.
  if (!message.flags?.["azeroth-rpg"]?.pressed?.rewind || record.landed === true) return 0;
  if (message.isOwner) await message.update({ "flags.azeroth-rpg.rewind.landed": true });
  const heal = rewindHeal(record.taken, { whole: row.whole });
  const before = target.system?.health?.value ?? 0;
  if (heal > 0) await target.applyHealing(heal, { from: holder, feature: true, featureName: row.name });
  return Math.max(0, (target.system?.health?.value ?? before) - before);
}

/* -------------------------------------------- */
/*  The drakes                                   */
/* -------------------------------------------- */

/** The drake form a creature holds, by name, or null. */
function drakeForm(actor) {
  return actor?.shape?.kind === "drake" ? (actor.shape.forms?.[0]?.name ?? null) : null;
}

/**
 * **THE BLUE DRAKE'S MANA** (04: *each ally within 30 feet regains 1 Mana at the start of
 * each of your turns*), as the drake's turn starts on the active GM's client: every ally on
 * the drake's own scene within the feet - the drake among them (D-755) - that holds Mana.
 * An ally is the fight's side where both stand in it, else the token's disposition matched.
 *
 * @param {Combatant} combatant
 * @returns {Promise<string[]>}
 */
export async function blueDrakeTurn(combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || actor.type !== "character" || combatant.isDefeated) return [];
  const row = blueDrakeTurnFor(actor.takenTalents?.() ?? [], { form: drakeForm(actor) }, talentEffect);
  const own = combatant.token ?? null;
  if (!row || !own?.parent) return [];
  const fight = combatant.combat ?? null;
  const side = combatant.getFlag?.("azeroth-rpg", "side") ?? null;
  const lines = [];
  const seen = new Set();
  for (const t of own.parent.tokens ?? []) {
    const ally = t.actor;
    if (!ally || seen.has(ally.uuid)) continue;
    const theirs = fight?.combatants?.find?.(c => c.tokenId === t.id) ?? null;
    const friend = t.id === own.id || ally.uuid === actor.uuid
      || (theirs && side ? theirs.getFlag?.("azeroth-rpg", "side") === side : t.disposition === own.disposition);
    if (!friend) continue;
    const feet = t.id === own.id ? 0 : feetApart(t, own);
    if (feet === null || feet > row.feet) continue;
    seen.add(ally.uuid);
    const landed = await manaInto(ally, row.allyMana);
    if (landed > 0) lines.push(game.i18n.format("AZEROTH.BlueDrake.Mana", { name: ally.name, n: landed, talent: row.name }));
  }
  return lines;
}

/**
 * **THE BRONZE DRAKE'S HALF-ACTION** (04: *The turn you take the form, you gain a
 * Half-Action*), once the form is written: in a started fight, on the user's own turn,
 * through the combatant's own queued door. Out of a fight, or off its own turn, there is no
 * turn to give it to and the card says so. Answers the card's line.
 *
 * @param {{actor: Actor, form: string|null}} o
 */
export async function bronzeDrakeHalf({ actor, form = null }) {
  const row = drakeHalfFor(actor?.takenTalents?.() ?? [], { form }, talentEffect);
  if (!row) return null;
  const combatant = combatantOf(actor);
  if (!combatant?.isOwner || combatant.isCurrentTurn !== true) return game.i18n.format("AZEROTH.BronzeDrake.NoTurn", { name: actor.name, talent: row.name });
  await combatant.grantHalfActions(1);
  return game.i18n.format("AZEROTH.BronzeDrake.Half", { name: actor.name, talent: row.name });
}

/**
 * **THE BLACK DRAKE'S LANDING** (04: *when you land from flight each creature within 10 feet
 * must pass a Reflex Resilience Test against your Spell DC or be knocked Prone*), judged on
 * the active GM's client off a move's own record (`rules/chromatic-talents.mjs
 * #landingFires`, which the hook asks first: a real move, never an undo, a paste, a
 * displacement or a GM's token-config edit, its elevation read off the last waypoint the
 * move PASSED). Every creature within the feet of where it landed that the landing catches
 * (`landingCatches`: never the drake, never a hidden creature, never one at 0 Health) makes
 * the Test, rolled here at the drake's Spell DC and offered the after-the-die seam (Time
 * Lapse, Elune's Regard), and a failure lays Prone through the one Inflict door. One card
 * says the lot.
 *
 * @param {TokenDocument} token
 * @param {{landed: {before: number, after: number}|null, at?: object|null}} o  `landingFires`'
 *   answer and the waypoint the token landed at
 * @returns {Promise<ChatMessage|null>}
 */
export async function blackDrakeLanding(token, { landed = null, at = null } = {}) {
  if (!activeGM() || !landed) return null;
  const actor = token?.actor ?? null;
  if (!actor || actor.type !== "character") return null;
  const row = landingFor(actor.takenTalents?.() ?? [], { form: drakeForm(actor) }, talentEffect);
  const scene = token.parent ?? null;
  if (!row || !scene) return null;
  const dc = actor.system?.spellDC ?? null;
  if (!Number.isFinite(dc)) return null;
  const where = footprintOf(token, at ?? {});
  const fight = actor.activeFight?.() ?? null;
  const { AzerothRoll } = await import("../dice/azeroth-roll.mjs");
  const { resilienceModifiers } = game.system.azeroth.workflows;
  const rolls = [];
  const lines = [];
  for (const t of scene.tokens ?? []) {
    const victim = t.actor;
    if (!victim) continue;
    const theirs = fight ? (fight.getCombatantsByToken?.(t)?.[0] ?? null) : null;
    const caught = landingCatches({
      self: t.id === token.id || victim.uuid === actor.uuid,
      hidden: t.hidden === true || t.hasStatusEffect?.("invisible") === true,
      defeated: theirs?.isDefeated === true,
      health: typeof victim.system?.health?.value === "number" ? victim.system.health.value : null
    });
    if (!caught) continue;
    const feet = feetBetweenFootprints(where, footprintOf(t), scene.grid ?? null);
    if (feet === null || feet > row.feet) continue;
    const roll = AzerothRoll.build({ dc, kind: "resilience", modifiers: resilienceModifiers(victim, row.resilience), rollData: victim.getRollData?.() ?? {} });
    await roll.evaluate();
    await victim.offerElunesRegard?.(roll);
    rolls.push(roll);
    const failed = roll.outcome?.success !== true;
    const words = { name: t.name ?? victim.name, total: roll.total, dc, resilience: game.i18n.localize(AZEROTH.resiliences[row.resilience] ?? row.resilience) };
    if (!failed) {
      lines.push(game.i18n.format("AZEROTH.BlackDrake.Passed", words));
      continue;
    }
    const landed = await inflictCondition({ victim, id: row.condition, by: actor, name: t.name ?? victim.name });
    lines.push(`${game.i18n.format("AZEROTH.BlackDrake.Failed", words)} ${landedText(landed)}`);
  }
  if (!lines.length) return null;
  const head = game.i18n.format("AZEROTH.BlackDrake.Landing", { name: token.name ?? actor.name, talent: row.name, feet: row.feet });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: `<div class="azeroth azeroth-card"><p class="azeroth-card-line"><strong>${foundry.utils.escapeHTML(head)}</strong></p>${lines.map(l => `<p class="azeroth-card-line">${foundry.utils.escapeHTML(l)}</p>`).join("")}</div>`,
    flags: { "azeroth-rpg": { kind: "blackDrakeLanding" } }
  });
}

/* -------------------------------------------- */
/*  The GM-side handler                          */
/* -------------------------------------------- */

/**
 * `azeroth-rpg.chromaticFlight`: a write on a creature the asker does not own. The asker
 * must own the creature whose talent it is; every number is worked out again here, off
 * that creature's own talents and the documents as the GM holds them - never off the
 * request. Throws with the reason.
 */
export async function chromaticFlightQueryHandler(payload = {}, { user = null } = {}) {
  const owns = actor => !user || (actor?.documentName === "Actor" && actor.testUserPermission(user, "OWNER"));
  if (payload.op === "manaHunger") {
    const caster = docAt(payload.casterUuid);
    const tokenDoc = docAt(payload.tokenUuid);
    if (caster?.documentName !== "Actor" || tokenDoc?.documentName !== "Token" || tokenDoc.actor?.uuid !== caster.uuid) return { lines: [] };
    if (!owns(caster)) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: caster.name }));
    return { lines: await manaHungerHere(caster, tokenDoc) };
  }
  if (payload.op === "spellbreak") {
    const breaker = docAt(payload.breakerUuid);
    const target = docAt(payload.targetUuid);
    if (breaker?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    if (!owns(breaker)) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: breaker.name }));
    if (!(breaker.takenTalents?.() ?? []).some(t => t.identifier === "spellbreak")) throw new Error(game.i18n.format("AZEROTH.Spellbreak.NotHeld", { name: breaker.name }));
    // Judged again off the documents (the 3B review, should-fix 8): never the breaker, within
    // the feet where both stand on one scene, and the Sustain still held.
    const cast = String(payload.cast ?? "");
    if (target.uuid === breaker.uuid) throw new Error(game.i18n.format("AZEROTH.Laid.OneTarget", { name: "Spellbreak" }));
    const feet = feetBetweenActors(breaker, target, breaker.activeFight?.() ?? null);
    if (feet !== null && feet > 30) throw new Error(game.i18n.format("AZEROTH.Laid.TooFar", { name: "Spellbreak", target: target.name, feet: 30 }));
    if (!(target.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e?.cast === cast)) throw new Error(game.i18n.format("AZEROTH.Spellbreak.NoSustain", { name: "Spellbreak", target: target.name }));
    return breakHere(target, cast);
  }
  if (payload.op === "hasten") {
    const holder = docAt(payload.holderUuid);
    const target = docAt(payload.targetUuid);
    if (holder?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    if (!owns(holder)) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
    // Judged again off the documents (the 3B review, should-fix 8): the holder's own Hasten
    // and Borrowed Moment, an ally or the holder only with Borrowed Moment, within the feet,
    // both in the fight the request names.
    const row = hastenFor(holder.takenTalents?.() ?? [], talentEffect);
    if (!row) throw new Error(game.i18n.format("AZEROTH.Laid.OneTarget", { name: "Hasten" }));
    const { allyOf } = await import("../canvas/engaged.mjs");
    if (target.uuid === holder.uuid ? !row.self : !allyOf(holder, target)) throw new Error(game.i18n.format("AZEROTH.Laid.NotFriendly", { name: row.name, target: target.name }));
    const fight = payload.combatId ? (game.combats?.get(payload.combatId) ?? null) : null;
    if (!fight?.started || !fight.getCombatantsByActor(target)?.length || !fight.getCombatantsByActor(holder)?.length) {
      throw new Error(game.i18n.format("AZEROTH.Hasten.NoFight", { name: row.name, target: target.name }));
    }
    const feet = feetBetweenActors(holder, target, fight);
    if (feet !== null && feet > row.feet) throw new Error(game.i18n.format("AZEROTH.Laid.TooFar", { name: row.name, target: target.name, feet: row.feet }));
    return hastenHere({ holder, target, combatId: fight.id });
  }
  if (payload.op === "bloodlust") {
    const shaman = docAt(payload.shamanUuid);
    const target = docAt(payload.targetUuid);
    if (shaman?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    if (!owns(shaman)) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: shaman.name }));
    // The shaman holds the feature whose Use this is, the target stands within its feet,
    // and both are in the fight the request names - judged here, off the documents.
    // Or the spell whose words give it (07 §12's Hour of Haste: *Each target gains a Half-Action
    // on its next turn*; D-864), known by the caster.
    const held = shaman.items.find(i => i.type === "feature" && i.name === String(payload.source ?? "") && classFeatureOnUse(i.system?.className ?? "", i.name)?.bloodlust)
      ?? shaman.items.find(i => i.type === "spell" && i.name === String(payload.source ?? "") && /\bEach target gains a Half-Action on its next turn\b/.test(String(i.system?.effect ?? "").replace(/<[^>]*>/g, " ")))
      ?? null;
    if (!held) throw new Error(game.i18n.format("AZEROTH.Bloodlust.NotHeld", { name: shaman.name, talent: String(payload.source ?? BLOODLUST.feature) }));
    const fight = payload.combatId ? (game.combats?.get(payload.combatId) ?? null) : null;
    if (!fight?.started || !fight.getCombatantsByActor(target)?.length || !fight.getCombatantsByActor(shaman)?.length) {
      throw new Error(game.i18n.format("AZEROTH.Bloodlust.NoFight", { name: held.name, target: target.name }));
    }
    const feet = feetBetweenActors(shaman, target, fight);
    if (feet !== null && feet > BLOODLUST.feet) throw new Error(game.i18n.format("AZEROTH.Bloodlust.TooFar", { name: held.name, target: target.name, feet: BLOODLUST.feet }));
    return { laid: await hastenedHere({ by: shaman, target, source: held.name, combatId: fight.id, img: "icons/svg/blood.svg" }) };
  }
  if (payload.op === "rewind") {
    const holder = docAt(payload.holderUuid);
    const target = docAt(payload.targetUuid);
    if (holder?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    if (!owns(holder)) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder.name }));
    return { healed: await rewindHealHere({ holder, target, messageId: payload.messageId ?? null }) };
  }
  throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
}
