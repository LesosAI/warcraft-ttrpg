/**
 * **THE CHROMATIC CHAMPION'S BRANCH TALENTS, WRITTEN** (04's Life-Binder and Earth-Warder,
 * 02 §5's Chromatic Outcast; stage 3A). `rules/chromatic-talents.mjs` is the law; this is
 * the one write for what it decides:
 *
 * - **Lifebinder's Flame's heal** (`landLifebinder`, `lifebinderHealHere`): every creature
 *   the cast chose, healed by its share through the one healing door from the Champion -
 *   here where this client owns it, on the active GM's client through
 *   `azeroth-rpg.chromaticTalent` where it does not, the handler reading the share off the
 *   CARD and never off the request, and marking it landed so a second ask lands nothing -
 *   then Cleansing Fire's Undeath and Bleeding, and the Red Drake's tier on the Champion;
 * - **Lifeblood's offer** (`offerLifeblood`, `lifebloodFromCard`): a card row for each
 *   holder within 30 feet of an ally a blow took below half Health, shown to that holder's
 *   owner (`data-reaction-owner`, D-779), pressing the granted feature through its own door;
 * - **a spend of Void Corruption** (`landVoidSpend`): Obsidian Skin's temporary Health on
 *   the Champion, Earthshatter's Prone and Stunned on the creatures struck;
 * - **Charged Steel** (`markChargedSteel`, `takeChargedSteel`): the promise on the striker;
 * - **Court Guise** (`takeCourtGuise`, `restoreCourtGuise`): the appearance swap and its
 *   restore when the effect carrying it goes, by any door.
 */

import { AZEROTH } from "../config.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import {
  CHAMPION_CLASS, CHARGED_STEEL_FLAG, COURT_GUISE_FLAG, carryCourtGuise, chargedSteelFor, chargedSteelMark, chargedSteelTake,
  courtGuiseRecord, droppedBelowHalf, guiseRestoreWrites, kindlingFor, landingFires, lifebloodFor, offerMoment
} from "../rules/chromatic-talents.mjs";
// 05's *Round - ~6 seconds*: the one clock a round out of a fight is (the 3A review, should-fix 10).
import { ROUND_SECONDS } from "../rules/area-ticks.mjs";
import { nextTurnStands } from "../rules/next-attack.mjs";
import { poolNamed } from "../rules/pools.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { TEMP_FLAG, grantTaken } from "../rules/temporary-health.mjs";
import { targetActorOf } from "../dice/annotate.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { landedText } from "../helpers/rider-words.mjs";
import { blackDrakeLanding } from "./chromatic-flights.mjs";

/** The query a write on a creature this client does not own goes through. */
export const CHROMATIC_TALENT_QUERY = "azeroth-rpg.chromaticTalent";

/** Lifeblood's offer card (`templates/chat/lifeblood-offer.hbs`). */
const LIFEBLOOD_TEMPLATE = "systems/azeroth-rpg/templates/chat/lifeblood-offer.hbs";

/* -------------------------------------------- */
/*  Pools                                        */
/* -------------------------------------------- */

/**
 * Gain into one named pool, never past its maximum (Kindling Heart's Rage). Answers what
 * landed.
 *
 * @param {Actor} actor
 * @param {string} name  a key of `AZEROTH.poolTypes`
 * @param {number} amount
 */
export async function gainPool(actor, name, amount) {
  const pool = poolNamed(actor?.poolSnapshot?.() ?? [], name);
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !(n > 0)) return 0;
  const value = Math.min(pool.max, pool.value + n);
  if (value <= pool.value) return 0;
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - pool.value;
}

/**
 * **KINDLING HEART** (04: *When you heal a creature with a branch spell or talent, gain 1
 * Rage*), read at `AzerothActor#applyHealing` where a heal restored something: the healer's
 * Rage, written wherever the heal ran - the healer's own client, or the active GM's, which
 * may write anybody.
 *
 * @param {Actor|null} healer
 * @returns {Promise<{name: string, gained: number}|null>}
 */
export async function kindleHealer(healer) {
  if (!healer || typeof healer.takenTalents !== "function" || !healer.isOwner) return null;
  const row = kindlingFor(healer.takenTalents(), talentEffect);
  if (!row) return null;
  const gained = await gainPool(healer, row.pool, row.amount);
  if (gained > 0) ui.notifications?.info(game.i18n.format("AZEROTH.Chromatic.Kindled", { name: healer.name, n: gained, talent: row.name }));
  return { name: row.name, gained };
}

/**
 * Whether a heal given by this healer is a BRANCH heal for Kindling Heart: a feature a
 * Champion talent granted (Lifeblood's), named as `applyHealing` is told.
 *
 * @param {Actor|null} healer
 * @param {string|null} featureName
 */
export function branchFeatureHeal(healer, featureName) {
  if (!healer || !featureName) return false;
  const feature = healer.items?.find?.(i => i.type === "feature" && i.name === featureName) ?? null;
  const talentId = feature?.getFlag?.("azeroth-rpg", "feature")?.talentId ?? null;
  const talent = talentId ? healer.items.get(talentId) : null;
  return talent?.system?.className === CHAMPION_CLASS;
}

/* -------------------------------------------- */
/*  Lifebinder's Flame                           */
/* -------------------------------------------- */

/**
 * **ONE CREATURE HEALED BY THE SPLIT**, here: the share through the one healing door from
 * the Champion (a branch heal, which Kindling Heart reads), then Cleansing Fire - 1 Undeath
 * Corruption off a character's track, and at rank 2 every Bleeding ended.
 *
 * @param {{target: Actor, amount: number, caster: Actor|null, cleanse?: {undeath: number, bleeding: boolean}|null}} o
 * @returns {Promise<{name: string, healed: number, cleansed: string[]}>}
 */
export async function lifebinderHealHere({ target, amount = 0, caster = null, cleanse = null }) {
  const before = target?.system?.health?.value ?? 0;
  if (Math.trunc(Number(amount)) > 0) await target.applyHealing(Math.trunc(Number(amount)), { from: caster, spell: true, branch: true });
  const healed = Math.max(0, (target?.system?.health?.value ?? before) - before);
  const cleansed = [];
  // *When you heal a creature with Lifebinder's Flame* (the 3A review, should-fix 15): a
  // share that restored nothing heals nobody, so it cleanses nothing either.
  if (!(healed > 0)) return { name: target?.name ?? "", healed, cleansed };
  if (cleanse && target?.type === "character" && cleanse.undeath > 0) {
    const held = Math.max(0, Math.trunc(Number(target.system?.corruption?.undeath)) || 0);
    if (held > 0) {
      await target.update({ "system.corruption.undeath": Math.max(0, held - cleanse.undeath) });
      cleansed.push(game.i18n.localize(AZEROTH.corruptionTracks?.undeath ?? "undeath"));
    }
  }
  if (cleanse?.bleeding === true) {
    const ids = (target?.effects ?? []).filter(e => e.statuses?.has?.("bleeding")).map(e => e.id);
    if (ids.length) {
      await target.deleteEmbeddedDocuments("ActiveEffect", ids);
      cleansed.push(game.i18n.localize(AZEROTH.conditions.bleeding));
    }
  }
  return { name: target?.name ?? "", healed, cleansed };
}

/** The card's own record of the split, cleaned. */
function lifebinderOf(message) {
  const r = message?.flags?.["azeroth-rpg"]?.lifebinder ?? null;
  return r && Array.isArray(r.heals) ? r : null;
}

/**
 * **LAND THE SPLIT A CARD RECORDS** (04's Lifebinder's Flame), once the card stands: each
 * share not yet landed, here where this client owns the creature, else through the GM;
 * then the Red Drake's tier on the Champion. Answers the lines for a card of its own.
 *
 * @param {ChatMessage} message
 * @returns {Promise<string[]>}
 */
export async function landLifebinder(message) {
  const record = lifebinderOf(message);
  if (!record) return [];
  const caster = record.by ? fromUuidSync(record.by) : null;
  const lines = [];
  for (const [index, row] of record.heals.entries()) {
    const target = row?.uuid ? fromUuidSync(row.uuid) : null;
    if (!target) {
      lines.push(game.i18n.format("AZEROTH.Lifebinder.Gone", { name: row?.name ?? "" }));
      continue;
    }
    try {
      if (target.isOwner && message.isOwner) {
        // A share already landed lands nothing (the GM handler's own guard, mirrored - the
        // 3A review, should-fix 13), and the share is marked BEFORE it heals.
        const landedNow = lifebinderOf(message)?.landed ?? [];
        if (landedNow.includes(index)) continue;
        await message.update({ [`flags.azeroth-rpg.lifebinder.landed`]: [...new Set([...landedNow, index])].sort((a, b) => a - b) });
        const done = await lifebinderHealHere({ target, amount: row.amount, caster, cleanse: record.cleanse ?? null });
        lines.push(healLine(done, record.name));
      } else {
        const gm = game.users?.activeGM ?? null;
        if (!gm) {
          lines.push(game.i18n.format("AZEROTH.Lifebinder.NoGM", { name: target.name }));
          continue;
        }
        const done = await gm.query(CHROMATIC_TALENT_QUERY, { op: "lifebinder", messageId: message.id, index }, { timeout: 15000 });
        lines.push(healLine(done ?? { name: target.name, healed: 0, cleansed: [] }, record.name));
      }
    } catch (err) {
      ui.notifications?.warn(err.message);
      lines.push(game.i18n.format("AZEROTH.Lifebinder.Failed", { name: target.name }));
    }
  }
  // *In it ... every heal you give with Lifebinder's Flame also heals you for your tier*.
  if (caster?.isOwner && Number(record.self) > 0) {
    const before = caster.system?.health?.value ?? 0;
    await caster.applyHealing(Math.trunc(Number(record.self)), { from: caster, spell: true, branch: true });
    const healed = Math.max(0, (caster.system?.health?.value ?? before) - before);
    lines.push(game.i18n.format("AZEROTH.Lifebinder.Drake", { name: caster.name, n: healed, talent: record.selfBy ?? "" }));
  }
  return lines;
}

/** One healed creature in words. */
function healLine(done, talent) {
  const head = game.i18n.format("AZEROTH.Lifebinder.Healed", { name: done?.name ?? "", n: done?.healed ?? 0, talent: talent ?? "" });
  return done?.cleansed?.length ? `${head} ${game.i18n.format("AZEROTH.Lifebinder.Cleansed", { name: done.name, what: done.cleansed.join(", ") })}` : head;
}

/**
 * **A SPLIT TICK** (04's Smoldering Life: *Each tick of your Smolder may be split as
 * Lifebinder's Flame splits a spell*): what a tick's damage leaves the creature, and the
 * heal the recorded creatures take - on the active GM's client, which lands every tick and
 * may write any creature. `split` is the tick's own record, stamped at the cast.
 *
 * @param {{dealt: number, split: object, conMod?: number}} o
 * @returns {Promise<{takes: number, lines: string[]}>}
 */
export async function landSplitTick({ dealt = 0, split = null } = {}) {
  const { lifebinderSplit } = await import("../rules/chromatic-talents.mjs");
  if (!split || !Array.isArray(split.heals) || !split.heals.length) return { takes: dealt, lines: [] };
  const plan = { divide: split.heals.length, add: Number(split.add) || 0, self: split.self ?? null };
  const out = lifebinderSplit({ dealt: [dealt], conMod: Number(split.conMod) || 0, heals: split.heals.length, plan, tier: Number(split.tier) || 1 });
  const caster = split.by ? fromUuidSync(split.by) : null;
  const lines = [];
  for (const [i, uuid] of split.heals.entries()) {
    const target = uuid ? fromUuidSync(uuid) : null;
    if (!target) continue;
    const done = await lifebinderHealHere({ target, amount: out.shares[i] ?? 0, caster, cleanse: split.cleanse ?? null });
    lines.push(healLine(done, split.name ?? ""));
  }
  if (caster && out.self > 0) await caster.applyHealing(out.self, { from: caster, spell: true, branch: true });
  return { takes: out.takes[0] ?? dealt, lines };
}

/* -------------------------------------------- */
/*  Lifeblood                                    */
/* -------------------------------------------- */

/**
 * **LIFEBLOOD'S OFFER** (04: *As a Reaction when an ally within 30 feet drops below half
 * Health, spend 3 Rage. It regains Health equal to your tier plus your rank*), read in the
 * blow once the Health is written: a card for every holder within its feet of the creature
 * - the creature itself among them (D-755) - whose row is shown to that holder's owner and
 * the GM, the Use itself judged at the press. Measured on the viewed board; a creature on
 * no board, or with nobody near, is offered nothing.
 *
 * @param {{target: Actor, before: number, after: number, max: number}} o
 * @returns {Promise<number>}  how many offers were posted
 */
export async function offerLifeblood({ target, before = 0, after = 0, max = 0 } = {}) {
  if (!target || !droppedBelowHalf({ before, after, max })) return 0;
  const token = target.getActiveTokens?.(true)?.[0] ?? null;
  if (!token || token.document?.parent?.id !== canvas?.scene?.id) return 0;
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const near = [{ token, actor: target }, ...creaturesWithin(target, 30, { from: token, who: "ally", except: [token.id] })];
  let posted = 0;
  const seen = new Set();
  for (const { actor: holder } of near) {
    if (!holder || holder.type !== "character" || seen.has(holder.uuid)) continue;
    seen.add(holder.uuid);
    const row = lifebloodFor(holder.takenTalents?.() ?? [], talentEffect);
    if (!row) continue;
    const talent = holder.items.find(i => i.type === "talent" && i.name === row.name) ?? null;
    const feature = talent ? holder.items.find(i => i.type === "feature" && i.getFlag?.("azeroth-rpg", "feature")?.talentId === talent.id) ?? null : null;
    if (!feature) continue;
    const owners = (game.users?.contents ?? []).filter(u => holder.testUserPermission?.(u, "OWNER")).map(u => u.id);
    const words = { holder: holder.name, name: target.name, talent: row.name };
    const content = await foundry.applications.handlebars.renderTemplate(LIFEBLOOD_TEMPLATE, {
      name: row.name, text: game.i18n.format("AZEROTH.Lifeblood.Offer", words), label: game.i18n.format("AZEROTH.Lifeblood.Press", words),
      holderUuid: holder.uuid, featureId: feature.id, targetUuid: token.document.uuid
    });
    // The moment the blow was struck, for the press to refuse once it has passed (the 3B
    // review, should-fix 3, which named this offer beside Rewind's).
    const fight = target.activeFight?.() ?? null;
    const at = offerMoment({ combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time?.worldTime ?? 0 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }), content, whisper: owners,
      flags: { "azeroth-rpg": { kind: "lifebloodOffer", holder: holder.uuid, target: token.document.uuid, at } }
    });
    posted += 1;
  }
  return posted;
}

/**
 * **A LIFEBLOOD PRESSED FROM ITS OFFER** (D-779's shape): the holder - owned here, the row's
 * own audience - uses the granted feature through its own door at the creature the offer
 * names, which judges the Reaction, the Rage, the reach and the half Health again.
 */
export async function lifebloodFromCard(button) {
  const holder = button?.dataset?.holderUuid ? fromUuidSync(button.dataset.holderUuid) : null;
  if (!holder?.isOwner) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: holder?.name ?? "" }));
    return null;
  }
  const feature = holder.items.get(button.dataset.featureId ?? "") ?? null;
  const tokenDoc = button.dataset.targetUuid ? fromUuidSync(button.dataset.targetUuid) : null;
  if (feature?.type !== "feature" || !tokenDoc?.actor) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone"));
    return null;
  }
  const { useFeatureWithDialog } = await import("../applications/actions.mjs");
  const target = { actorId: tokenDoc.actor.id, tokenId: tokenDoc.id, sceneId: tokenDoc.parent?.id ?? null, name: tokenDoc.name };
  // The offer handed in as the card it answers, so the Use refuses one whose moment passed.
  const messageId = button.closest?.("[data-message-id]")?.dataset?.messageId ?? null;
  return useFeatureWithDialog(holder, feature, null, { targets: [target], ...(messageId ? { answers: { messageId } } : {}) });
}

/* -------------------------------------------- */
/*  Void Corruption spent                        */
/* -------------------------------------------- */

/**
 * **WHAT A SPEND OF VOID LANDS BESIDE ITS DAMAGE** (04's Obsidian Skin and Earthshatter):
 * the temporary Health on the Champion (05's no-stack rule, `grantTemporaryHealth`), and
 * Prone - Stunned at Earthshatter's rank 2 on SL 2, until the end of the creature's next
 * turn (A1's own *Ends*) - on every creature struck, through the one Inflict door.
 *
 * @param {{actor: Actor, outcome: {tempHealth: number, prone: boolean, stunned: boolean}, targets?: Array, names?: string[]}} o
 * @returns {Promise<string[]>}
 */
export async function landVoidSpend({ actor, outcome, targets = [], source = "", recordLanding = null } = {}) {
  const lines = [];
  let tempGranted = 0;
  let tempTaken = null;
  if (!actor || !outcome) return { lines, tempGranted, tempTaken };
  if (outcome.tempHealth > 0) {
    // What the grant ADDED over what was held, and the record it replaced (the 3B review,
    // should-fix 7): 05's no-stack law replaces a smaller amount, so a withdrawn hit takes
    // back the difference and puts the replaced record back (`grantTakenBack`).
    const before = { temp: actor.system?.health?.temp ?? 0, record: actor.getFlag?.("azeroth-rpg", TEMP_FLAG) ?? null };
    const got = await actor.grantTemporaryHealth(outcome.tempHealth, { source, span: "longRest" });
    tempTaken = grantTaken(before, { applies: got?.landed === true, temp: actor.system?.health?.temp ?? 0, record: actor.getFlag?.("azeroth-rpg", TEMP_FLAG) ?? null });
    tempGranted = tempTaken?.amount ?? 0;
    lines.push(game.i18n.format(got?.landed ? "AZEROTH.VoidSpend.Temp" : "AZEROTH.VoidSpend.TempWasted", { name: actor.name, n: outcome.tempHealth }));
  }
  // Each landing recorded by the target's index on the card, so a hit a Parry or 04's
  // Afterimage withdraws takes it back off (the 3A review, M4; `effects/miss.mjs`).
  const record = (index, landing) => (typeof recordLanding === "function" ? recordLanding(index, landing) : landing);
  for (const [index, t] of (targets ?? []).entries()) {
    const victim = targetActorOf(t);
    if (!victim) continue;
    const name = t?.name ?? victim.name;
    if (outcome.prone) lines.push(landedText(record(index, await inflictCondition({ victim, id: "prone", by: actor, name }))));
    if (outcome.stunned) lines.push(landedText(record(index, await inflictCondition({ victim, id: "stunned", by: actor, name, until: untilEndOfNextTurnOrRound(victim) }))));
  }
  return { lines, tempGranted, tempTaken };
}


/* -------------------------------------------- */
/*  Charged Steel                                */
/* -------------------------------------------- */

/** The fight or the world's clock as Charged Steel reads it. */
function steelNow(actor) {
  return { ...(actor?.fightTurnNow?.() ?? {}), time: game.time?.worldTime ?? 0 };
}

/**
 * **CHARGED STEEL ON A WEAPON HIT** (04: *your next branch spell to damage that creature
 * before the end of your next turn deals 1 more damage per rank*): the promise laid on the
 * striker, one a creature struck, to the end of the striker's next turn - or one round of
 * the world's clock out of a fight (D-778's reading).
 *
 * @param {Actor} actor
 * @param {Array} targets  the card's targets
 * @returns {Promise<{name: string, text: string}|null>}  the line for the card
 */
export async function markChargedSteel(actor, targets = []) {
  const row = actor?.type === "character" ? chargedSteelFor(actor.takenTalents?.() ?? [], talentEffect) : null;
  if (!row || !actor.isOwner) return null;
  const uuids = (targets ?? []).map(t => targetActorOf(t)?.uuid).filter(Boolean);
  if (!uuids.length) return null;
  const now = actor.fightTurnNow?.() ?? null;
  const until = now?.combat ? { combat: now.combat, round: now.round, turn: now.turn, own: now.own } : { time: (game.time?.worldTime ?? 0) + ROUND_SECONDS };
  const held = actor.getFlag("azeroth-rpg", CHARGED_STEEL_FLAG) ?? [];
  await actor.setFlag("azeroth-rpg", CHARGED_STEEL_FLAG, chargedSteelMark(held, { targets: uuids, amount: row.amount, name: row.name, until }));
  return { name: row.name, text: game.i18n.format("AZEROTH.ChargedSteel.Laid", { name: actor.name, talent: row.name, n: row.amount }) };
}

/**
 * **WHAT A BRANCH SPELL TAKES OF CHARGED STEEL**: the damage it adds on each target (by
 * uuid), written off the striker's flag with whatever has lapsed.
 *
 * @param {Actor} actor
 * @param {string[]} uuids  the creatures the cast damages
 * @returns {Promise<{by: Record<string, number>, names: string[]}>}
 */
export async function takeChargedSteel(actor, uuids = []) {
  const held = actor?.getFlag?.("azeroth-rpg", CHARGED_STEEL_FLAG) ?? [];
  if (!Array.isArray(held) || !held.length) return { by: {}, names: [] };
  const taken = chargedSteelTake(held, { targets: uuids, now: steelNow(actor), turnStands: nextTurnStands });
  if (taken.changed && actor.isOwner) await actor.setFlag("azeroth-rpg", CHARGED_STEEL_FLAG, taken.kept);
  return { by: taken.by, names: taken.names };
}

/* -------------------------------------------- */
/*  Court Guise                                  */
/* -------------------------------------------- */

/** The option a guise's own replacement deletes its standing effect with (the 3A review, M2). */
export const GUISE_REPLACE_OPTION = "azerothGuiseReplace";

/** The flag a token dressed for a shape keeps its own picture under (D-769, `documents/shapes.mjs`). */
const SHAPE_RESTORE_FLAG = "shapeRestore";

/**
 * The tokens on EVERY scene that stand for this actor (the 3A review, should-fix 5): core's
 * `getActiveTokens` reads the viewed scene alone (14.367 `client/documents/actor.mjs`), and
 * `getDependentTokens` reads every scene the actor has a token on. Concrete documents only.
 */
function tokensOf(actor) {
  return (actor?.getDependentTokens?.({ concreteOnly: true }) ?? []).filter(Boolean);
}

/** A token as the guise law reads it: its face - or, standing in a shape, the face its shape goes back to. */
function guiseTokenRow(doc) {
  const kept = doc?.getFlag?.("azeroth-rpg", SHAPE_RESTORE_FLAG) ?? null;
  return { uuid: doc.uuid, img: kept ? (kept.src ?? null) : (doc.texture?.src ?? null), name: doc.name ?? null, shaped: Boolean(kept) };
}

/** Write the guise's look on the actor and its tokens; a shaped token takes it into its shape's record. */
async function wearGuiseLook(actor, record) {
  await actor.update({ img: record.as.img || actor.img, "prototypeToken.texture.src": record.as.tokenImg || actor.prototypeToken?.texture?.src, "prototypeToken.name": record.as.name });
  for (const doc of tokensOf(actor)) {
    if (!doc?.isOwner) continue;
    const shaped = Boolean(doc.getFlag?.("azeroth-rpg", SHAPE_RESTORE_FLAG));
    const face = record.as.tokenImg || null;
    const update = { name: record.as.name };
    if (face) update[shaped ? "flags.azeroth-rpg.shapeRestore.src" : "texture.src"] = face;
    try {
      await doc.update(update);
    } catch (err) {
      console.warn(`azeroth-rpg | the token ${doc.id} did not take ${actor.name}'s Court Guise`, err);
    }
  }
}

/**
 * **TAKE A STUDIED HUMANOID'S FACE** (04's Court Guise: *take the guise of one particular
 * humanoid you have studied for an hour, its face and voice included*): one Active Effect
 * on the Champion carrying the record of what it took and what it had - its portrait, and
 * each of its tokens' image and name, on every scene - and the swap itself. Judged already
 * (`courtGuiseRecord`, and refused while a shape stands); this writes.
 *
 * **A SECOND GUISE REPLACES THE FIRST AND KEEPS ITS RECORD OF THE TRUE FACE** (the 3A
 * review, M2): the standing record is read BEFORE its effect goes, carried forward
 * (`carryCourtGuise`), and the delete carries `GUISE_REPLACE_OPTION`, so the delete hook
 * restores nothing and no write races this one.
 *
 * @param {{actor: Actor, studied: Actor, studiedToken?: TokenDocument|null, item: Item}} o
 * @returns {Promise<string>}  the line for the card
 */
export async function takeCourtGuise({ actor, studied, studiedToken = null, item }) {
  const standingEffects = actor.effects.filter(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG));
  const standing = standingEffects[0]?.getFlag("azeroth-rpg", COURT_GUISE_FLAG) ?? null;
  const { record: fresh } = courtGuiseRecord(
    { name: studiedToken?.name ?? studied.name, img: studied.img, tokenImg: studiedToken?.texture?.src ?? studied.prototypeToken?.texture?.src ?? studied.img, type: studied.type, creatureType: studied.system?.creatureType ?? null },
    { name: actor.name, img: actor.img, tokenImg: actor.prototypeToken?.texture?.src ?? actor.img, tokenName: actor.prototypeToken?.name ?? actor.name }
  );
  const record = carryCourtGuise(standing, fresh, tokensOf(actor).map(guiseTokenRow));
  if (standingEffects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", standingEffects.map(e => e.id), { [GUISE_REPLACE_OPTION]: true });
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.CourtGuise.Effect", { name: record.as.name }), img: item?.img ?? record.as.img,
    origin: item?.uuid ?? null,
    description: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.CourtGuise.Text", { name: record.as.name }))}</p>`,
    flags: { "azeroth-rpg": { [COURT_GUISE_FLAG]: record } }
  }]);
  await wearGuiseLook(actor, record);
  return game.i18n.format("AZEROTH.CourtGuise.Taken", { name: actor.name, as: record.as.name });
}

/**
 * **THE GUISE ENDS, BY ANY DOOR** (a delete of its effect, or switching it off): the
 * portrait, the prototype and every token of the actor on every scene that still wears it
 * put back (`guiseRestoreWrites`) - one the record never held because it was placed while
 * the guise stood, too - and a token standing in a shape has the true face written into
 * the shape's own record, so leaving the shape puts it back (the 3A review, should-fix 5).
 *
 * @param {ActiveEffect} effect
 */
export async function restoreCourtGuise(effect) {
  const record = effect?.flags?.["azeroth-rpg"]?.[COURT_GUISE_FLAG] ?? null;
  const actor = effect?.parent ?? null;
  if (!record || actor?.documentName !== "Actor" || !actor.isOwner) return;
  await actor.update({ img: record.own?.img || actor.img, "prototypeToken.texture.src": record.own?.tokenImg || actor.prototypeToken?.texture?.src, "prototypeToken.name": record.own?.tokenName || actor.name });
  const docs = new Map(tokensOf(actor).map(d => [d.uuid, d]));
  for (const t of record.tokens ?? []) {
    if (t?.uuid && !docs.has(t.uuid)) {
      const doc = fromUuidSync(t.uuid);
      if (doc?.documentName === "Token") docs.set(t.uuid, doc);
    }
  }
  for (const { uuid, update } of guiseRestoreWrites(record, [...docs.values()].map(guiseTokenRow))) {
    const doc = docs.get(uuid);
    if (!doc?.isOwner) continue;
    try {
      await doc.update(update);
    } catch (err) {
      console.warn(`azeroth-rpg | the token ${doc.id} did not shed ${actor.name}'s Court Guise`, err);
    }
  }
}

/** Whether this actor wears a Court Guise now: an effect carrying one, switched on. */
export function wearsCourtGuise(actor) {
  return Boolean(actor?.effects?.some?.(e => e.active !== false && e.disabled !== true && e.getFlag?.("azeroth-rpg", COURT_GUISE_FLAG)));
}

/**
 * **A TOKEN PLACED WHILE THE GUISE STANDS WEARS IT** (the 3A review, should-fix 5; the shape
 * door's own pattern, `documents/shapes.mjs#onPreCreateToken`): dressed before it exists, on
 * the client that creates it. A token for an actor standing in a shape is the shape door's,
 * which keeps the prototype's - the guised - face as its own.
 */
function onPreCreateToken(token) {
  const actor = token?.actor ?? null;
  if (!actor || actor.shape) return;
  const effect = actor.effects?.find?.(e => e.active !== false && e.disabled !== true && e.getFlag?.("azeroth-rpg", COURT_GUISE_FLAG)) ?? null;
  const record = effect?.getFlag?.("azeroth-rpg", COURT_GUISE_FLAG) ?? null;
  if (!record?.as) return;
  token.updateSource({ name: record.as.name, ...(record.as.tokenImg ? { texture: { src: record.as.tokenImg } } : {}) });
}

/**
 * The hooks, each on the client that made the change: a guise's effect deleted by any door
 * restores the face - not a replacement, which carries its own record forward (M2); one
 * switched off restores it and one switched back on wears it again; a token placed while it
 * stands wears it. And the Black Drake's landing, judged on the active GM's client.
 */
export function registerChromaticTalentHooks() {
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user?.id || !effect?.flags?.["azeroth-rpg"]?.[COURT_GUISE_FLAG]) return;
    if (options?.[GUISE_REPLACE_OPTION]) return;
    restoreCourtGuise(effect).catch(err => console.warn("azeroth-rpg | a Court Guise did not restore", err));
  });
  Hooks.on("updateActiveEffect", (effect, changes, _options, userId) => {
    if (userId !== game.user?.id || !("disabled" in (changes ?? {}))) return;
    const record = effect?.flags?.["azeroth-rpg"]?.[COURT_GUISE_FLAG] ?? null;
    const actor = effect?.parent ?? null;
    if (!record || actor?.documentName !== "Actor" || !actor.isOwner) return;
    const done = changes.disabled === true ? restoreCourtGuise(effect) : wearGuiseLook(actor, record);
    done.catch(err => console.warn("azeroth-rpg | a Court Guise switched", err));
  });
  Hooks.on("preCreateToken", token => {
    try {
      onPreCreateToken(token);
    } catch (err) {
      console.warn("azeroth-rpg | a Court Guise token", err);
    }
  });
  // **04's BLACK DRAKE, LANDING** (stage 3B; the 3B review, M1; the lead: *"Only on a real
  // move"*): a token's elevation coming down to the ground, judged off v14's own movement
  // record by the one pure reading (`rules/chromatic-talents.mjs#landingFires`) - never an
  // undo, a paste, a displacement or a GM's token-config edit, the elevation off the last
  // waypoint the move PASSED - on the active GM's client.
  Hooks.on("moveToken", (token, movement, operation) => {
    if (game.users?.activeGM?.isSelf !== true) return;
    const landed = landingFires(movement, operation ?? {});
    if (!landed) return;
    blackDrakeLanding(token, { landed, at: movement?.passed?.waypoints?.at(-1) ?? null })
      .catch(err => console.warn("azeroth-rpg | the Black Drake's landing", err));
  });
}

/* -------------------------------------------- */
/*  The GM-side handler                          */
/* -------------------------------------------- */

/**
 * `azeroth-rpg.chromaticTalent`: a Lifebinder's Flame share on a creature the asker does
 * not own. The asker must own the card's caster; the share is the CARD's, and a share
 * already landed lands nothing. Throws with the reason.
 */
export async function chromaticTalentQueryHandler({ op = null, messageId = null, index = null } = {}, { user = null } = {}) {
  if (op !== "lifebinder") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  const message = messageId ? (game.messages?.get(messageId) ?? null) : null;
  const record = lifebinderOf(message);
  const row = record && Number.isInteger(index) ? (record.heals[index] ?? null) : null;
  if (!row) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  const caster = record.by ? await fromUuid(record.by) : null;
  if (user && !(caster?.documentName === "Actor" && caster.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: caster?.name ?? "" }));
  }
  if ((record.landed ?? []).includes(index)) return { name: row.name ?? "", healed: 0, cleansed: [] };
  const target = row.uuid ? await fromUuid(row.uuid) : null;
  if (!target) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  await message.update({ "flags.azeroth-rpg.lifebinder.landed": [...new Set([...(record.landed ?? []), index])].sort((a, b) => a - b) });
  return lifebinderHealHere({ target, amount: row.amount, caster, cleanse: record.cleanse ?? null });
}

/** Whether a split's heals could reach every creature from this client: owned, or a GM online. */
export function lifebinderNeedsGM(recipients = []) {
  return gmAbsentFor({ owned: (recipients ?? []).map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}
