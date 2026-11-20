/**
 * **WHAT A NECROMANCER SPELL DOES THAT NO DESCRIPTOR CARRIES** (07 §17, *Restricted Necromancer*, and
 * the spells it shares; run 4c-S). The law is `rules/necromancer-spells.mjs`; this module reads the
 * world and writes, through doors that exist:
 *
 * - `judgeNecroSpell` - asked by `castSpell` with its other refusals, BEFORE the budget and the Mana
 *   (D-768's order): the target lines (an undead creature, a living Humanoid for Puppet of Flesh, up to
 *   so many creatures), the card's rows a spell rewrites (Grave Rot's ring round a corpse, Sever the
 *   Soul's round its target, Reaping's round the caster, Frenzy of the Dead's raised dead), the picks a
 *   roleplay spell needs (a corpse, a point, a creature named), Bone Shield's trigger, and a GM where a
 *   write lands on a creature this client does not own (`rules/gm-writes.mjs#gmAbsentFor`);
 * - `necroCardRows` - the rows the card draws: Grave Touch's heal on the caster, Grave Tide's and
 *   Necrotic Nova's undead allies healed instead, Sever the Soul's ring taking a Test and no damage;
 * - `necroSpellAfterCast` - once the Casting Test went off: the cage, the frenzy, the condition ended,
 *   and the roleplay spells' cards, lights, regions and effects;
 * - `necroSpellAfterResist` - a creature's failed Resist: Soul Lash's Bane, Cripple's drops, Plague
 *   Wind's Poisoned at the Spell DC, Bone Prison's hold, Soul Rip's Essence, Reaping's Health, Puppet of
 *   Flesh's control and the curses;
 * - `necroSpellAfterApply` - the card's Apply: Sever the Soul's mark on a creature it dropped to 0;
 * - the death listener (Soul Cage's Essence and cage, Mark of the Grave's word), the turn's doors
 *   (Frenzy of the Dead's Health, Drain Life's drain, Contagion's Test) and Bone Shield in the blow.
 */

import {
  BARBED_BONE, CONTAGION_FLAG, necroCaster, pastDeadline, readCorpseAge, corpseAgeRefusal, candleSeen, markDirection, contagionCleared, readContagionClearing, contagionClearers, CURSE_FLAG, FRENZY_FLAG, QUESTIONED_FLAG, SEVER_FLAG, SOUL_CAGE_FLAG, SOUL_MARK_FLAG,
  barbedBoneRating, boneShieldRefusal, bridgeArea, contagionRadius, courierWords, curseAmount, dropChanges, frenzyLoss,
  insteadRow, puppetRefusal, questionRefusal, readBoneBridge, readBoneShield, readBorrowedSenses, readCasterTurnDrain,
  readContagion, readCorpseCandle, readCorpseRing, readCourier, readCurse, readDeathTrance, readDeathmask, readEndsCondition,
  readFailDrops, readFrenzy, readGhostlyServant, readGraveSense, readGraveWard, readMarkOfGrave,
  readNextAttackBane, readOncePerCorpse, readOncePerCreature, readPoisonedAtDC, readPrisonHold, readPuppet, readPuppetTarget,
  readRaisedTargets, readReapingHeal, readSelfHeal, readSelfRing, readSeverRing, readSevers, readSoulCage, readSoulRip,
  readSpiritAnchor, readUndeadInstead, readUndeadTargets, readUnderOwn, readUpTo, ringRows, shieldedAmount, soulMarkOf,
  soulMarkRefusal, tidingsOf, essenceGainClaim, agesCorpses
} from "../rules/necromancer-spells.mjs";
import { compassOf } from "../rules/death-knight-spells.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { ESSENCE, isLiving } from "../rules/essence.mjs";
import { creatureSnapshot } from "../rules/creature-kinds.mjs";
import { CORPSE_FLAG, rangeFeetOf } from "../rules/raise.mjs";
import { regionInWorld } from "../canvas/in-world.mjs";
import { SHED_DC_FLAG } from "../rules/escapes.mjs";
import { ENDS_ON_DAMAGE_FLAG } from "../rules/signatures.mjs";
import { AZEROTH } from "../config.mjs";
import { corpseRecord } from "../rules/animation-records.mjs";
import { BARBED_BONE_KEY } from "../rules/necromancer-animations.mjs";

const SCOPE = "azeroth-rpg";

/** The query a write on a document this client does not own goes through. */
export const NECRO_SPELL_QUERY = "azeroth-rpg.necroSpell";

/** The flags this module's laid effects ride. */
export const MARK_OF_GRAVE_FLAG = "markOfGrave";
export const CANDLE_FLAG = "corpseCandle";
export const DEATHMASK_FLAG = "deathmask";
export const PUPPET_FLAG = "puppet";
export const PRISON_FLAG = "bonePrison";
export const DIED_AT_FLAG = "diedAt";
export const DEPARTED_FLAG = "departedCalled";
export const ANCHOR_FLAG = "spiritAnchor";
export const WARD_SIGN_FLAG = "graveWard";
export const SERVANT_FLAG = "ghostlyServant";
export const BORROWED_FLAG = "borrowedSenses";

/** The spells whose card offers no Apply: what they lay is laid here, or by their failed Test. */
const NO_APPLY = Object.freeze([
  "grave-sense", "corpse-candle", "deathmask", "bone-courier", "ghostly-servant", "grave-ward", "borrowed-senses",
  "deaths-tidings", "spirit-anchor", "death-trance", "bone-bridge", "mark-of-the-grave", "call-the-departed",
  "speak-with-the-dead", "frenzy-of-the-dead", "puppet-of-flesh", "soul-cage", "curse-of-weakness", "curse-of-tongues",
  "contagion", "cripple", "bone-prison"
]);

const t = (key, data = {}) => game.i18n.format(key, data);
const isGM = () => game.user?.isGM === true;
const gmActive = () => Boolean(game.users?.activeGM);
const noGM = owned => gmAbsentFor({ owned, isGM: isGM(), gmActive: gmActive() });

/** Refuse in words and stop. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(`AZEROTH.NecroSpell.Refuse.${key}`, data));
  return null;
}

/** The actor a snapshot row names (a token's synthetic actor where it has one). */
async function actorOfRow(row) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  return targetActorOf(row);
}

/** The token a snapshot row names, on its own scene. */
function tokenOfRow(row) {
  const scene = (row?.sceneId && game.scenes?.get(row.sceneId)) || canvas?.scene || null;
  return row?.tokenId ? scene?.tokens?.get(row.tokenId) ?? null : null;
}

/**
 * The caster's token: the cast's source where given; else its own synthetic token, else one of its tokens
 * on the viewed scene, else one on any scene (the active scene first). A sheet cast names no source, and a
 * scene still drawing has no placeables yet, so the documents are read rather than the canvas (the 4c
 * review's S: Deathmask's face was put on nobody when the viewed scene was not yet the token's).
 */
function casterToken(actor, source = null) {
  if (source?.tokenId) {
    const scene = (source.sceneId && game.scenes?.get(source.sceneId)) || canvas?.scene || null;
    const named = scene?.tokens?.get(source.tokenId) ?? null;
    if (named) return named;
  }
  if (actor?.isToken && actor.token) return actor.token;
  const mine = tk => tk.actor === actor || (actor && tk.actorId === actor.id);
  const scenes = [canvas?.scene, game.scenes?.active, ...(game.scenes?.contents ?? [])].filter(Boolean);
  for (const scene of [...new Set(scenes)]) {
    const tk = scene.tokens?.find?.(mine) ?? null;
    if (tk) return tk;
  }
  return null;
}

/** Whether a creature is down: defeated, dead or at 0 Health as a creature. */
function isDown(token) {
  const a = token?.actor ?? null;
  if (!a) return true;
  return token.combatant?.isDefeated === true || a.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true
    || (a.type === "npc" && (Number(a.system?.health?.value) || 0) <= 0);
}

/** Card rows for tokens (the roll dialog's own snapshot). */
async function snapshotsOf(tokens = []) {
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  return targetSnapshots(tokens.map(tk => tk.object ?? { id: tk.id, actor: tk.actor, name: tk.name, scene: tk.parent }));
}

/** Whether a creature is undead, read as every door reads it (`creature-kinds.mjs#kindsOf`). */
async function undeadOf(actor) {
  const { kindsOfActor } = await import("./area-strikes.mjs");
  return kindsOfActor(actor).has("undead");
}

/** Whether a creature is living (02 §7: not an undead or a construct). */
function livingOf(actor) {
  return isLiving(creatureSnapshot({ type: actor?.type ?? null, system: actor?.system ?? null, race: actor?.raceItem?.name ?? null }));
}

/** The caster's reading of another creature: `enemy`, `ally` or `neutral`. */
async function relationOf(actor, own, other, token) {
  const { relationTo } = await import("./area-strikes.mjs");
  return relationTo({ caster: actor, casterToken: own, actor: other, token });
}

/** The players who own an actor, or - one only a GM owns - this user. */
function whisperTo(actor) {
  const players = [...(game.users ?? [])].filter(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
  return players.length ? [...new Set(players)] : [game.user?.id].filter(Boolean);
}

/** A card to the caster alone. */
async function whisperCard(actor, title, lines, kind = "necroSpell") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor),
    content: `<p><strong>${foundry.utils.escapeHTML(title)}</strong></p>${lines.map(l => `<p class="azeroth-drain">${l}</p>`).join("")}`,
    flags: { [SCOPE]: { kind } }
  });
}

/** Ask the active GM, or answer here where this client is it. */
async function askGM(payload) {
  if (isGM() && game.users?.activeGM?.isSelf) return necroSpellQueryHandler(payload, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  return gm.query(NECRO_SPELL_QUERY, payload, { timeout: 15000 });
}

/** A world-clock or fight span of so many minutes, keyed on a creature. */
async function minutes(actor, n = 1) {
  const { minuteSpan } = await import("./durations.mjs");
  return minuteSpan(actor, n) ?? {};
}

/**
 * **THE CARD'S RESOLVED SPAN ON A CREATURE** (fix run 4-S, D-1099): `effectDuration`'s spec as the
 * cast resolved it - 02 §7's Lasting and a talent's span included - keyed on the creature it lands on
 * (the caster's turn where 07 says *your*), and out of a fight a span in rounds runs on the world's
 * clock. `{}` where the spell names no span.
 */
async function castSpan(actor, spec, caster = null) {
  if (!spec) return {};
  const { spanOn, clockRounds } = await import("./durations.mjs");
  const timed = spanOn(actor, spec, caster);
  if (timed) return timed;
  if (spec.units === "rounds" || spec.units === "turns") return clockRounds(Math.max(1, Math.trunc(Number(spec.value)) || 1));
  return {};
}

/**
 * A span read off a spell's own Duration field (`rules/spell-effects.mjs#effectDuration`) - or, where the
 * cast's plan carries the card's resolved span (Lasting, a talent's span), that one (D-1099).
 */
async function spellSpan(actor, sys, plan = null, caster = null) {
  if (plan && Object.hasOwn(plan, "duration")) return castSpan(actor, plan.duration, caster ?? actor);
  const { effectDuration } = await import("../rules/spell-effects.mjs");
  const { spellTiming } = await import("./durations.mjs");
  return spellTiming(actor, effectDuration(sys?.duration ?? {}, { inFight: Boolean(actor?.activeFight?.()) })) ?? {};
}

/** The corpses on the scene as a one-corpse pick reads them, within the reach. */
async function corpsePick(actor, item, source, { reach = null, kinds = null } = {}) {
  const { knightToken, corpsesOn, chooseCorpses } = await import("./death-knight-necromancy.mjs");
  const site = knightToken(actor, source);
  if (!site) return refuse("noToken", { name: actor.name, spell: item.name });
  const { feetApart } = await import("../canvas/footprints.mjs");
  const row = { corpses: { min: 1, max: 1 }, kinds, minSize: null, entry: item.name };
  const rows = corpsesOn(actor, row, { scene: site.scene, from: site.token, reach, feetApart });
  if (!rows.some(r => !r.refusal)) return refuse("noCorpse", { name: actor.name, spell: item.name });
  const ids = await chooseCorpses(item, row, rows);
  if (!ids?.length) return null;
  const token = site.scene.tokens.get(ids[0]);
  return token ? { scene: site.scene, token, from: site.token } : null;
}

/** A world actor named through the one chooser (Call the Departed, Death's Tidings, Bone Courier). */
async function namedCreature(item, prompt, { exclude = [] } = {}) {
  const { chooseOption } = game.system.azeroth.workflows;
  const skip = new Set(exclude);
  const options = (game.actors?.contents ?? []).filter(a => !skip.has(a.id) && (a.type === "character" || a.type === "npc"))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(a => ({ key: a.id, name: a.name, description: "" }));
  if (!options.length) return null;
  const pick = await chooseOption(item, options, null, { prompt });
  return pick ? game.actors.get(pick.key) ?? null : null;
}

/** A point on the board within feet of the caster, picked; null where dismissed. */
async function pointNear(actor, source, feet, hint) {
  const own = casterToken(actor, source);
  if (!own) return refuse("noToken", { name: actor.name, spell: "" });
  const { pickPoint } = await import("../canvas/place.mjs");
  const { feetToPoint } = await import("../canvas/footprints.mjs");
  const point = await pickPoint({
    hint, sceneId: own.parent.id,
    accept: p => {
      const d = feetToPoint(own, p);
      if (typeof d === "number" && d <= feet + 1e-6) return true;
      ui.notifications?.warn(t("AZEROTH.NecroSpell.Refuse.far", { feet }));
      return false;
    }
  });
  return point ? { sceneId: own.parent.id, x: Math.round(point.x), y: Math.round(point.y) } : null;
}

/* -------------------------------------------- */
/*  Judged before anything is paid               */
/* -------------------------------------------- */

/**
 * **A NECROMANCER SPELL, JUDGED BEFORE THE BUDGET AND THE MANA** (D-768's order). Null where it is
 * refused (said in words), else the plan and the card's rows.
 *
 * @param {{actor: Actor, spell: Item, list: object[], source?: object|null, answers?: object|null, farReaching?: boolean}} o
 *   `farReaching`: 02 §7's Far-reaching ticked on the dialog (a range in feet doubles)
 * @returns {Promise<{plan: object|null, list: object[]}|null>}
 */
export async function judgeNecroSpell({ actor, spell, list = [], source = null, answers = null, farReaching = false } = {}) {
  const sys = spell?.system ?? {};
  // **ONLY THE SPELLS THE NECROMANCER MAY HOLD** (`necroScope`): another class's spell that happens to
  // share a sentence (the Warlock's Siphon Life drains in Drain Life's words) is never judged here.
  if (!necroScope(sys, actor)) return { plan: null, list };
  const id = sys.identifier ?? "";
  const name = spell?.name ?? "";
  const plan = { card: { scope: true } };
  let rows = list;
  if (NO_APPLY.includes(id)) plan.noApply = true;
  // The spell's Range in feet, doubled by Far-reaching (`necromancer-lines.mjs#farReach`); null for Touch or Self.
  const rangeFeet = (() => { const f = rangeFeetOf(sys.range); return f === null || f === undefined ? null : f * (farReaching ? 2 : 1); })();

  // 07 §17's Bone Shield: *When an attack hits you* - cast only as the Reaction its blow asks.
  if (readBoneShield(sys.effect) && answers?.boneShield !== true) return refuse("boneShieldTrigger", { spell: name });
  // And only while the blow's asker still waits (the 4c review's MUST-FIX 1): past the window nothing is paid.
  if (readBoneShield(sys.effect) && pastDeadline(answers?.deadline ?? null, Date.now())) return refuse("boneShieldLate", { spell: name });

  // An undead target (Mend the Dead, Unholy Restoration), or the undead allies round a point (Unholy Renewal).
  const undead = readUndeadTargets(sys.target);
  if (undead) {
    if (!rows.length) return refuse("noTarget", { spell: name });
    const own = casterToken(actor, source);
    const kept = [];
    for (const row of rows) {
      const who = await actorOfRow(row);
      const is = Boolean(who) && await undeadOf(who);
      if (undead.ally) {
        if (is && (who === actor || (await relationOf(actor, own, who, tokenOfRow(row))) === "ally")) kept.push(row);
      } else if (!is) return refuse("notUndead", { spell: name, name: row?.name ?? who?.name ?? "" });
      else kept.push(row);
    }
    if (!kept.length) return refuse("noUndeadAlly", { spell: name });
    rows = kept;
    // Unholy Restoration's *One condition on the target ends*: ended on the GM's client where this one does
    // not own the creature, so a GM is asked before the Mana (the 4c review's S).
    if (readEndsCondition(sys.effect)) {
      const owned = await Promise.all(rows.map(async row => (await actorOfRow(row))?.isOwner === true));
      if (noGM(owned)) return refuse("noGM", { spell: name });
    }
  }

  // 07 §17's Puppet of Flesh: *One living Humanoid that is not a Boss, of a tier lower than yours*.
  if (readPuppetTarget(sys.target)) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    const no = puppetRefusal({
      living: livingOf(who), humanoid: who?.type === "character" || who?.system?.creatureType === "humanoid",
      boss: who?.system?.isBoss === true, tier: who?.system?.tier ?? null, casterTier: actor.system?.tier ?? 1
    });
    if (no) {
      ui.notifications?.warn(t(`AZEROTH.NecroSpell.Refuse.puppet.${no}`, { spell: name, name: rows[0]?.name ?? who?.name ?? "" }));
      return null;
    }
    if (noGM([false])) return refuse("noGM", { spell: name });
    plan.puppet = readPuppet(sys.effect);
  }

  // 07 §17's Grave Rot: a corpse within range, and every living creature within the ring round it.
  const ring = readCorpseRing(sys.target, sys.effect);
  if (ring) {
    const site = await corpsePick(actor, spell, source, { reach: rangeFeet });
    if (!site) return null;
    const { feetApart } = await import("../canvas/footprints.mjs");
    const candidates = [];
    for (const tk of site.scene.tokens) {
      if (!tk.actor || tk.id === site.token.id) continue;
      candidates.push({ id: tk.id, name: tk.name ?? tk.actor.name, feet: feetApart(site.token, tk), living: livingOf(tk.actor), down: isDown(tk), hidden: tk.hidden === true && !isGM() });
    }
    const ids = ringRows(candidates, { feet: ring.feet, who: ring.living ? "living" : "creature", except: site.token.id });
    rows = await snapshotsOf(ids.map(i => site.scene.tokens.get(i)).filter(Boolean));
    const grid = site.scene.grid ?? null;
    plan.corpse = corpseRecord({ sceneId: site.scene.id, tokenId: site.token.id, from: { x: site.token.x, y: site.token.y }, width: site.token.width, height: site.token.height,
      sizeX: grid?.sizeX ?? grid?.size ?? 100, sizeY: grid?.sizeY ?? grid?.size ?? 100 });
  }

  // 07 §17's Sever the Soul: the one target, and each other enemy within the ring round it.
  const sever = readSeverRing(sys.target);
  if (sever) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const target = tokenOfRow(rows[0]);
    const own = casterToken(actor, source);
    if (target) {
      const { feetApart } = await import("../canvas/footprints.mjs");
      const candidates = [];
      for (const tk of target.parent.tokens) {
        if (!tk.actor || tk.id === target.id) continue;
        candidates.push({ id: tk.id, name: tk.name ?? tk.actor.name, feet: feetApart(target, tk), enemy: (await relationOf(actor, own, tk.actor, tk)) === "enemy", down: isDown(tk), hidden: tk.hidden === true && !isGM() });
      }
      const ids = ringRows(candidates, { feet: sever.feet, who: "enemy", except: target.id });
      rows = [rows[0], ...(await snapshotsOf(ids.map(i => target.parent.tokens.get(i)).filter(Boolean)))];
    }
    if (readSevers(sys.effect)) {
      if (noGM([false])) return refuse("noGM", { spell: name });
      plan.card.sever = { actorUuid: (await actorOfRow(rows[0]))?.uuid ?? null };
    }
  }

  // 07 §17's Reaping: every enemy within the ring round the caster.
  const selfRing = readSelfRing(sys.target);
  if (selfRing) {
    const own = casterToken(actor, source);
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { feetApart } = await import("../canvas/footprints.mjs");
    const candidates = [];
    for (const tk of own.parent.tokens) {
      if (!tk.actor || tk.id === own.id) continue;
      candidates.push({ id: tk.id, name: tk.name ?? tk.actor.name, feet: feetApart(own, tk), enemy: (await relationOf(actor, own, tk.actor, tk)) === "enemy", down: isDown(tk), hidden: tk.hidden === true && !isGM() });
    }
    rows = await snapshotsOf(ringRows(candidates, { feet: selfRing.feet, who: "enemy", except: own.id }).map(i => own.parent.tokens.get(i)).filter(Boolean));
  }

  // 07 §17's Frenzy of the Dead: each of the caster's raised dead within range.
  if (readRaisedTargets(sys.target)) {
    const own = casterToken(actor, source);
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { hordeActorsOf } = await import("./necromancer-horde.mjs");
    const { feetApart } = await import("../canvas/footprints.mjs");
    // Far-reaching doubles the Range the raised dead are held to (the lead's ruling 5).
    const reach = rangeFeet ?? 30;
    const mine = new Set(hordeActorsOf(actor).map(a => a.id));
    const near = own.parent.tokens.filter(tk => tk.actor && mine.has(tk.actorId) && !isDown(tk) && (feetApart(own, tk) ?? Infinity) <= reach + 1e-6);
    if (!near.length) return refuse("noRaised", { spell: name, feet: reach });
    if (noGM(near.map(tk => tk.actor?.isOwner === true))) return refuse("noGM", { spell: name });
    rows = await snapshotsOf(near);
    plan.frenzy = readFrenzy(sys.effect);
  }

  // *Up to four creatures*, *You and up to five allies within 30 ft*.
  const upTo = readUpTo(sys.target);
  if (upTo) {
    if (!rows.length) return refuse("noTarget", { spell: name });
    if (rows.length > upTo.max) return refuse("tooMany", { spell: name, n: upTo.max });
    if (upTo.allies) {
      const own = casterToken(actor, source);
      const { feetApart } = await import("../canvas/footprints.mjs");
      for (const row of rows) {
        const who = await actorOfRow(row);
        if (who === actor || who?.id === actor.id) continue;
        const tk = tokenOfRow(row);
        if ((await relationOf(actor, own, who, tk)) !== "ally") return refuse("notAlly", { spell: name, name: row?.name ?? "" });
        if (own && tk && (feetApart(own, tk) ?? Infinity) > upTo.feet + 1e-6) return refuse("far", { feet: upTo.feet });
      }
    }
  }

  // 07 §17's Soul Cage, Mark of the Grave and Borrowed Senses each name one creature.
  if (readSoulCage(sys.effect) || readMarkOfGrave(sys.effect)) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    if (noGM([who?.isOwner === true])) return refuse("noGM", { spell: name });
  }
  if (readBorrowedSenses(sys.effect)) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    const { bondOf, worldActorOf } = await import("../documents/bound.mjs");
    if (bondOf(worldActorOf(who))?.ownerUuid !== actor.uuid || bondOf(worldActorOf(who))?.kind !== "raised") return refuse("notRaised", { spell: name, name: rows[0]?.name ?? "" });
    plan.borrowed = { uuid: who.uuid, name: rows[0]?.name ?? who.name };
  }

  // The roleplay spells' picks.
  if (readCorpseCandle(sys.effect) || readDeathmask(sys.effect) || readOncePerCorpse(sys.effect)) {
    const site = await corpsePick(actor, spell, source, { reach: rangeFeet ?? 5 });
    if (!site) return null;
    if (noGM([false])) return refuse("noGM", { spell: name });
    const corpse = { sceneId: site.scene.id, tokenId: site.token.id, name: site.token.name ?? site.token.actor?.name ?? "" };
    // 07's *dead less than a day* (Deathmask) and *dead less than a month* (Speak with the Dead), read off
    // the death watch's record (`DIED_AT_FLAG`); a corpse nothing recorded is the GM's to judge, said on the card.
    const age = readCorpseAge(sys.target);
    if (age) {
      const aged = corpseAgeRefusal({ diedAt: site.token.actor?.getFlag?.(SCOPE, DIED_AT_FLAG) ?? null, now: game.time?.worldTime ?? 0, seconds: age.seconds });
      if (aged === "old") {
        ui.notifications?.warn(t(age.unit === "month" ? "AZEROTH.NecroSpell.Refuse.tooOld.month" : "AZEROTH.NecroSpell.Refuse.tooOld.day", { spell: name, name: corpse.name }));
        return null;
      }
      if (aged === "unknown") plan.ageUnknown = { name: corpse.name, unit: age.unit };
    }
    if (readOncePerCorpse(sys.effect)) {
      const no = questionRefusal({
        questioned: site.token.getFlag?.(SCOPE, QUESTIONED_FLAG) === true,
        soulMark: site.token.actor?.getFlag?.(SCOPE, SOUL_MARK_FLAG) ?? null, by: actor.uuid
      });
      if (no) return refuse(`question.${no}`, { spell: name, name: corpse.name });
      plan.speak = corpse;
    } else if (readDeathmask(sys.effect)) {
      if (site.token.actor?.type === "npc" && site.token.actor.system?.creatureType !== "humanoid") return refuse("notHumanoid", { spell: name, name: corpse.name });
      plan.deathmask = { ...corpse, img: site.token.texture?.src ?? site.token.actor?.img ?? null };
    } else plan.candle = corpse;
  }
  if (readOncePerCreature(sys.effect)) {
    const called = actor.getFlag(SCOPE, DEPARTED_FLAG) ?? [];
    const who = await namedCreature(spell, t("AZEROTH.NecroSpell.Departed.Prompt", { spell: name }), { exclude: [actor.id] });
    if (!who) return null;
    if (called.includes(who.uuid)) return refuse("departedOnce", { spell: name, name: who.name });
    if (soulMarkRefusal(who.getFlag?.(SCOPE, SOUL_MARK_FLAG) ?? null, { by: actor.uuid, act: "question" })) return refuse("question.caged", { spell: name, name: who.name });
    plan.departed = { uuid: who.uuid, name: who.name };
  }
  if (id === "deaths-tidings") {
    const who = await namedCreature(spell, t("AZEROTH.NecroSpell.Tidings.Prompt", { spell: name }), { exclude: [actor.id] });
    if (!who) return null;
    plan.tidings = { uuid: who.uuid, name: who.name };
  }
  const courier = readCourier(sys.effect);
  if (courier) {
    const who = await namedCreature(spell, t("AZEROTH.NecroSpell.Courier.Prompt", { spell: name }), { exclude: [actor.id] });
    if (!who) return null;
    const words = await courierMessage(spell, courier.words);
    if (words === null) return null;
    plan.courier = { uuid: who.uuid, name: who.name, ...courierWords(words, courier.words) };
  }
  if (readGraveWard(sys.effect) || readSpiritAnchor(sys.effect) || readGhostlyServant(sys.effect)) {
    // Far-reaching doubles the Range the point is held to (the lead's ruling 5), never a radius.
    const reach = rangeFeet ?? 5;
    const at = await pointNear(actor, source, Math.max(5, reach), t("AZEROTH.NecroSpell.PickPoint", { spell: name, feet: Math.max(5, reach) }));
    if (!at) return null;
    if (noGM([false])) return refuse("noGM", { spell: name });
    plan.point = at;
  }

  // 07's Contagion: *Range 60 ft. Target A 20 ft radius on the ground* - the point aimed before the Mana; whether
  // it lies under the caster's own Graveblight is judged once the cast went off (*or the spell does nothing and
  // the Mana is spent*).
  if (readContagion(sys.effect)) {
    const reach = rangeFeet ?? 60;
    const at = await pointNear(actor, source, reach, t("AZEROTH.NecroSpell.PickPoint", { spell: name, feet: reach }));
    if (!at) return null;
    if (noGM([false])) return refuse("noGM", { spell: name });
    plan.contagion = at;
  }

  // The curses' riders, laid by a failed Test.
  const curse = readCurse(sys.effect);
  if (curse) plan.card.curse = { ...curse, amount: curseAmount(curse, actor.system?.spellpower?.shadow ?? 0) };

  return { plan, list: rows };
}

/**
 * Whether the Necromancer doors carry this cast (`rules/necromancer-spells.mjs#necroCaster`, D-1099): a
 * spell the Necromancer alone holds, for any caster; a spell it shares, only for a caster holding the
 * Necromancer class - a Warlock's Drain Life and curses and a Priest's Speak with the Dead are cast
 * exactly as before.
 */
export function necroScope(sys = {}, actor = null) {
  return necroCaster(sys?.classes ?? [], actor?.classNames ?? []);
}

/** Bone Courier's message, asked in a dialog before anything is paid; null where dismissed. */
async function courierMessage(spell, max) {
  const { DialogV2 } = foundry.applications.api;
  const label = t("AZEROTH.NecroSpell.Courier.Message", { n: max });
  const answer = await DialogV2.prompt({
    id: `azeroth-courier-${foundry.utils.randomID(6)}`,
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: spell.name },
    content: `<label>${label}<input type="text" name="message" maxlength="400"></label>`,
    ok: { label: game.i18n.localize("AZEROTH.NecroSpell.Courier.Send"), callback: (event, button) => button.form.elements.message.value },
    rejectClose: false
  });
  return typeof answer === "string" ? answer : null;
}

/**
 * **GRAVE STEP'S CORPSES, BEFORE THE PICK** (07 §17): the corpses within the spell's Range, the step's
 * reach the Range and the near feet; refused in words where no corpse is in reach. Writes the step's
 * `feet` and `corpses` in place (the cast's own copy).
 */
export async function corpseStepPlan(actor, spell, step, { farReaching = false } = {}) {
  const { corpseToken, knightToken } = await import("./death-knight-necromancy.mjs");
  const { corpseStepFeet } = await import("../rules/steps.mjs");
  const site = knightToken(actor);
  if (!site) return refuse("noToken", { name: actor.name, spell: spell.name });
  const { feetApart } = await import("../canvas/footprints.mjs");
  const range = (rangeFeetOf(spell.system?.range ?? "") ?? 0) * (farReaching ? 2 : 1);
  const corpses = site.scene.tokens.filter(tk => tk.id !== site.token.id && corpseToken(tk) && (!tk.hidden || isGM()) && (feetApart(site.token, tk) ?? Infinity) <= range + 1e-6);
  if (!corpses.length) return refuse("noCorpse", { name: actor.name, spell: spell.name });
  step.feet = corpseStepFeet(step, range);
  step.corpses = corpses;
  return step;
}

/* -------------------------------------------- */
/*  What the card draws                          */
/* -------------------------------------------- */

/** Whether the card offers no Apply. */
export function noApply(plan) {
  return plan?.noApply === true;
}

/**
 * **THE AREA THE CARD OFFERS**, where a Necromancer spell's Target line reads another: none for a ring
 * the cast already measured (Grave Rot, Sever the Soul) or allies named one by one (Shroud of the
 * Grave), a point's circle for Unholy Renewal, and Bone Bridge's span. `undefined` leaves the card's own.
 */
export function necroArea(sys = {}, actor = null) {
  if (!necroScope(sys, actor)) return undefined;
  if (readCorpseRing(sys.target, sys.effect) || readSeverRing(sys.target) || readUpTo(sys.target)?.allies) return null;
  const undead = readUndeadTargets(sys.target);
  if (undead?.ally) return { shape: "circle", distanceFt: undead.feet, origin: "point" };
  const bridge = bridgeArea(readBoneBridge(sys.effect, sys.target));
  if (bridge) return { ...bridge, origin: "self" };
  return undefined;
}

/**
 * **SHROUD OF THE GRAVE'S TEMPORARY HEALTH** (*Each target gains 12 temporary Health. For the
 * duration, each target cannot be ...*): the amount the Apply grants with the effect it lays, where
 * the sentence names no span of its own and the spell lays an effect for its duration.
 */
export function necroTemporary(spell, actor = null) {
  const sys = spell?.system ?? {};
  if (!necroScope(sys, actor) || sys.applies?.active !== true || sys.duration?.kind !== "timed" || !readUpTo(sys.target)) return null;
  const m = /\bEach target gains (\d+) temporary Health\b/.exec(String(sys.effect ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " "));
  return m ? { amount: Number(m[1]), by: [] } : null;
}

/**
 * **THE ROWS THE CARD DRAWS** (after the cast's own damage and heal were worked out): Grave Touch's
 * heal on the caster, Grave Tide's and Necrotic Nova's undead allies healed instead, Sever the Soul's
 * ring taking its Test and no damage, Puppet of Flesh's Stunned the caster's and never the target's.
 * Arrays are changed in place; answers the heal the card carries.
 */
export async function necroCardRows({ actor, spell, list = [], damageByTarget = [], passedByTarget = [], healByTarget = [], resistRows = [], heal = null, failStatuses = [], source = null, success = false } = {}) {
  const sys = spell?.system ?? {};
  if (!success || !necroScope(sys, actor)) return heal;
  // Grave Touch: *You regain 2 Health* - the caster, never the target.
  const self = readSelfHeal(sys.effect);
  if (self) {
    healByTarget.length = 0;
    heal = { amount: self.amount, self: true, explanation: t("AZEROTH.NecroSpell.SelfHeal", { n: self.amount }) };
  }
  // Grave Tide and Necrotic Nova: an enemy takes the damage, an undead ally the heal instead.
  const instead = readUndeadInstead(sys.effect);
  if (instead) {
    const own = casterToken(actor, source);
    for (const [i, row] of list.entries()) {
      const who = await actorOfRow(row);
      const kind = insteadRow({ relation: who ? await relationOf(actor, own, who, tokenOfRow(row)) : "neutral", undead: who ? await undeadOf(who) : false });
      if (kind !== "damage") { damageByTarget[i] = null; if (passedByTarget[i] !== undefined) passedByTarget[i] = null; }
      healByTarget[i] = kind === "heal" ? instead.heal : null;
    }
    heal = healByTarget.some(n => n) ? { amount: instead.heal, perTarget: true, explanation: t("AZEROTH.NecroSpell.InsteadHeal", { n: instead.heal }) } : null;
  }
  // Sever the Soul: the first row takes the damage and no Test; each other row the Test and no damage.
  if (readSeverRing(sys.target)) {
    for (let i = 1; i < damageByTarget.length; i++) damageByTarget[i] = null;
    if (resistRows[0]) resistRows[0].gated = t("AZEROTH.NecroSpell.Sever.NoTest", { name: list[0]?.name ?? "", spell: spell.name });
  }
  // Puppet of Flesh: the bold Stunned is the caster's (`necroSpellAfterResist` lays it there).
  if (readPuppet(sys.effect)) {
    const at = failStatuses.indexOf("stunned");
    if (at >= 0) failStatuses.splice(at, 1);
  }
  return heal;
}

/* -------------------------------------------- */
/*  Once the cast went off                       */
/* -------------------------------------------- */

/**
 * **WHAT THE CAST DOES ONCE ITS TEST SUCCEEDED** (07 §8: a failed cast spends its Mana and does
 * nothing). Answers the card's lines.
 */
export async function necroSpellAfterCast({ actor, spell, plan = null, list = [], spellDC = null, cast = null, source = null } = {}) {
  const lines = [];
  if (!plan) return lines;
  const sys = spell?.system ?? {};
  const name = spell?.name ?? "";
  // Soul Cage: the cage on its creature until the end of the caster's next turn.
  const cage = readSoulCage(sys.effect);
  if (cage && list[0]) lines.push(...await cageLands(actor, spell, list[0], cage));
  // Frenzy of the Dead: each raised dead its frenzy for the minute.
  if (plan?.frenzy) lines.push(...await frenzyLands(actor, spell, list, plan.frenzy, plan));
  // Unholy Restoration: *One condition on the target ends. You choose which.*
  if (readEndsCondition(sys.effect) && list[0]) lines.push(...await conditionEnds(actor, spell, list[0]));
  // Mark of the Grave: the mark on its creature for the day.
  if (readMarkOfGrave(sys.effect) && list[0]) lines.push(...await markLands(actor, spell, list[0], sys, plan));
  if (readGraveSense(sys.effect)) lines.push(...await graveSenseLands(actor, spell, readGraveSense(sys.effect), source, sys, plan));
  if (plan?.candle) lines.push(...await candleLands(actor, spell, plan.candle, readCorpseCandle(sys.effect), sys, plan));
  if (plan?.deathmask) lines.push(...await deathmaskLands(actor, spell, plan.deathmask, sys, source, plan));
  if (plan?.courier) lines.push(...await courierLands(actor, spell, plan.courier));
  if (plan?.tidings) lines.push(...await tidingsLands(actor, spell, plan.tidings));
  if (plan?.borrowed) lines.push(...await borrowedLands(actor, spell, plan.borrowed, sys, plan));
  if (plan?.departed) lines.push(...await departedLands(actor, spell, plan.departed, sys, plan));
  if (plan?.speak) lines.push(...await speakLands(actor, spell, plan.speak, sys, plan));
  if (readDeathTrance(sys.effect)) lines.push(...await layOwn(actor, spell, sys, { plan, flag: "deathTrance", text: "AZEROTH.NecroSpell.Trance.Laid" }));
  if (readGhostlyServant(sys.effect) && plan?.point) lines.push(...await layOwn(actor, spell, sys, { plan, flag: SERVANT_FLAG, data: { point: plan.point }, text: "AZEROTH.NecroSpell.Servant.Laid", region: plan.point }));
  if (readGraveWard(sys.effect) && plan?.point) lines.push(...await graveWardLands(actor, spell, plan.point, readGraveWard(sys.effect), sys, spellDC, plan));
  if (readSpiritAnchor(sys.effect) && plan?.point) lines.push(...await anchorLands(actor, spell, sys, plan));
  if (readContagion(sys.effect)) lines.push(...await contagionLands(actor, spell, sys, spellDC, cast, plan));
  // A corpse no death was recorded for: its age is the GM's to judge (07's *dead less than a day*, *a month*).
  if (plan?.ageUnknown) lines.push(t(plan.ageUnknown.unit === "month" ? "AZEROTH.NecroSpell.AgeUnknown.month" : "AZEROTH.NecroSpell.AgeUnknown.day", { name: plan.ageUnknown.name }));
  return lines;
}

/** Soul Cage's cage: an effect on the creature, spanned to the end of the caster's next turn. */
async function cageLands(actor, spell, row, cage) {
  const victim = await actorOfRow(row);
  if (!victim) return [];
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  const data = {
    name: spell.name, img: spell.img, origin: actor.uuid, description: t("AZEROTH.NecroSpell.Cage.Text", { name: actor.name }),
    ...untilEndOfNextTurnOrRound(actor), system: { changes: [] },
    flags: { [SCOPE]: { [SOUL_CAGE_FLAG]: { by: actor.uuid, essence: cage.essence, caged: cage.caged, living: livingOf(victim) } } }
  };
  const done = await layOn(victim, data, actor);
  return [t(done ? "AZEROTH.NecroSpell.Cage.Laid" : "AZEROTH.NecroSpell.NotLaid", { name: row?.name ?? victim.name, spell: spell.name })];
}

/** Frenzy of the Dead: each raised dead its typed Shadow on every hit and its Health each turn. */
async function frenzyLands(actor, spell, list, frenzy, plan = null) {
  const lines = [];
  for (const row of list) {
    const who = await actorOfRow(row);
    if (!who) continue;
    const span = plan && Object.hasOwn(plan, "duration") ? await castSpan(who, plan.duration, actor) : await minutes(who, 1);
    const done = await layOn(who, {
      name: spell.name, img: spell.img, origin: actor.uuid, description: spell.system?.effect ?? "", ...span, system: { changes: [] },
      flags: { [SCOPE]: { [FRENZY_FLAG]: { extra: frenzy.extra, type: frenzy.type, loses: frenzy.loses, by: actor.uuid }, identifier: "frenzy-of-the-dead" } }
    }, actor);
    lines.push(t(done ? "AZEROTH.NecroSpell.Frenzy.Laid" : "AZEROTH.NecroSpell.NotLaid", { name: row?.name ?? who.name, spell: spell.name, n: frenzy.extra }));
  }
  return lines;
}

/** Unholy Restoration's condition ended: the caster's choice among the conditions the target carries. */
async function conditionEnds(actor, spell, row) {
  const victim = await actorOfRow(row);
  if (!victim) return [];
  const held = [...(victim.statuses ?? [])].filter(id => AZEROTH.conditions?.[id]).sort();
  if (!held.length) return [t("AZEROTH.NecroSpell.Restore.None", { name: row?.name ?? victim.name })];
  const { chooseOption } = game.system.azeroth.workflows;
  const pick = held.length === 1 ? { key: held[0] } : await chooseOption(spell, held.map(id => ({ key: id, name: game.i18n.localize(AZEROTH.conditions[id]), description: "" })), null,
    { prompt: t("AZEROTH.NecroSpell.Restore.Prompt", { name: row?.name ?? victim.name }) });
  if (!pick) return [t("AZEROTH.NecroSpell.Restore.Kept", { name: row?.name ?? victim.name })];
  try {
    if (victim.isOwner) await victim.toggleStatusEffect(pick.key, { active: false });
    else await askGM({ act: "endCondition", casterUuid: actor.uuid, targetUuid: victim.uuid, condition: pick.key });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [err.message];
  }
  return [t("AZEROTH.NecroSpell.Restore.Ended", { name: row?.name ?? victim.name, condition: game.i18n.localize(AZEROTH.conditions[pick.key]) })];
}

/**
 * **A NECROMANCER SPELL'S OWN CARD** (`templates/chat/grave-ward-card.hbs`): a title, a line and its
 * controls, whispered to the caster's players (and the GM where `gm`). A control is `necroCard` with its
 * `press` (`necroCardPress`), or a door of its own (Grave Ward's GM-only Disturbed).
 */
async function postNecroCard(actor, { title, text, buttons = [], flags = {}, gm = false, kind = "necroCard" } = {}) {
  const gms = gm ? [...(game.users ?? [])].filter(u => u.isGM).map(u => u.id) : [];
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: [...new Set([...whisperTo(actor), ...gms])],
    // The card's frame (`.azeroth-card`) is what the chat hook wires its buttons inside (`dice/chat.mjs`).
    content: await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/grave-ward-card.hbs", { title, text, buttons }),
    flags: { [SCOPE]: { kind, ...flags } }
  });
}

/** An effect laid on a creature: here where this client owns it, else on the GM's client. */
async function layOn(victim, data, caster) {
  try {
    if (victim.isOwner) return Boolean((await victim.createEmbeddedDocuments("ActiveEffect", [data]))?.[0]);
    const done = await askGM({ act: "effect", casterUuid: caster.uuid, targetUuid: victim.uuid, data });
    return done?.ok === true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/** A roleplay spell's own effect on the caster, spanned by the spell's Duration, and a marker Region where it names a point. */
async function layOwn(actor, spell, sys, { flag, data = {}, text, region = null, plan = null }) {
  const span = await spellSpan(actor, sys, plan, actor);
  const [laid] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: sys.effect ?? "", ...span, system: { changes: [] },
    flags: { [SCOPE]: { [flag]: { by: actor.uuid, ...data }, identifier: sys.identifier ?? null } }
  }]);
  const lines = [t(text, { name: actor.name, spell: spell.name })];
  if (region && laid) {
    try {
      const made = await askGM({ act: "marker", casterUuid: actor.uuid, point: region, name: spell.name, identifier: sys.identifier ?? null, effectId: laid.id });
      if (made?.regionId) await laid.setFlag(SCOPE, flag, { by: actor.uuid, ...data, regionId: made.regionId, sceneId: region.sceneId });
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  return lines;
}

/** Mark of the Grave: the mark on the creature for the day. */
async function markLands(actor, spell, row, sys, plan = null) {
  const victim = await actorOfRow(row);
  if (!victim) return [];
  const span = await spellSpan(victim, sys, plan, actor);
  const done = await layOn(victim, {
    name: spell.name, img: spell.img, origin: actor.uuid, description: t("AZEROTH.NecroSpell.Mark.Text", { name: actor.name }), ...span, system: { changes: [] },
    flags: { [SCOPE]: { [MARK_OF_GRAVE_FLAG]: { by: actor.uuid, miles: readMarkOfGrave(sys.effect)?.miles ?? 1 } } }
  }, actor);
  // *You know the direction to the target while it is within 1 mile of you*: asked on demand from the card.
  if (done) await postNecroCard(actor, {
    title: spell.name, text: t("AZEROTH.NecroSpell.Mark.Card", { name: row?.name ?? victim.name }),
    buttons: [{ action: "necroCard", press: "markDirection", label: game.i18n.localize("AZEROTH.NecroSpell.Mark.Sense") }],
    flags: { necroCard: { press: "markDirection", casterUuid: actor.uuid, targetUuid: victim.uuid, name: row?.name ?? victim.name, miles: readMarkOfGrave(sys.effect)?.miles ?? 1, spell: spell.name } }
  });
  return [t(done ? "AZEROTH.NecroSpell.Mark.Laid" : "AZEROTH.NecroSpell.NotLaid", { name: row?.name ?? victim.name, spell: spell.name })];
}

/**
 * **SPIRIT ANCHOR** (*For the duration, you may spend a Half-Action to see and hear as if you stood at the
 * target, at any distance*): the anchor's day on the caster with its marker, and a card whose *Look
 * through the anchor* spends the Half-Action and takes the board there (`necroCardPress`).
 */
async function anchorLands(actor, spell, sys, plan) {
  const lines = await layOwn(actor, spell, sys, { plan, flag: ANCHOR_FLAG, data: { point: plan.point }, text: "AZEROTH.NecroSpell.Anchor.Laid", region: plan.point });
  await postNecroCard(actor, {
    title: spell.name, text: t("AZEROTH.NecroSpell.Anchor.Card", { name: actor.name }),
    buttons: [{ action: "necroCard", press: "anchorLook", label: game.i18n.localize("AZEROTH.NecroSpell.Anchor.Look") }],
    flags: { necroCard: { press: "anchorLook", casterUuid: actor.uuid, point: plan.point, spell: spell.name } }
  });
  return lines;
}

/**
 * **GRAVE SENSE**: a card to the caster alone naming every corpse within reach, its distance, its
 * direction and how long it has lain (the death watch's record, `DIED_AT_FLAG`), and an effect for the
 * spell's ten minutes. A grave the board does not show is the GM's to tell.
 */
async function graveSenseLands(actor, spell, sense, source, sys, plan = null) {
  const own = casterToken(actor, source);
  const out = [];
  if (own) {
    const { corpseToken } = await import("./death-knight-necromancy.mjs");
    const { feetApart } = await import("../canvas/footprints.mjs");
    const at = own.object?.center ?? { x: own.x, y: own.y };
    const now = game.time?.worldTime ?? 0;
    const rows = own.parent.tokens.filter(tk => tk.id !== own.id && corpseToken(tk)).map(tk => {
      const there = tk.object?.center ?? { x: tk.x, y: tk.y };
      return { tk, feet: feetApart(own, tk), dx: there.x - at.x, dy: there.y - at.y, died: tk.actor?.getFlag?.(SCOPE, DIED_AT_FLAG) ?? null };
    }).filter(r => typeof r.feet === "number" && r.feet <= sense.feet + 1e-6)
      .sort((a, b) => a.feet - b.feet || String(a.tk.name).localeCompare(String(b.tk.name)) || a.tk.id.localeCompare(b.tk.id));
    for (const r of rows) {
      out.push(t("AZEROTH.NecroSpell.Sense.Row", {
        name: r.tk.name ?? "", feet: Math.round(r.feet), direction: game.i18n.localize(`AZEROTH.Compass.${compassOf(r.dx, r.dy)}`),
        age: r.died === null ? game.i18n.localize("AZEROTH.NecroSpell.Sense.Unknown") : ageWords(now - Number(r.died))
      }));
    }
    if (!out.length) out.push(t("AZEROTH.NecroSpell.Sense.None", { n: sense.feet }));
    out.push(game.i18n.localize("AZEROTH.NecroSpell.Sense.Graves"));
  } else out.push(t("AZEROTH.NecroSpell.Unplaced", { name: actor.name, spell: spell.name }));
  await whisperCard(actor, spell.name, out, "graveSense");
  await layOwn(actor, spell, sys, { plan, flag: "graveSense", text: "AZEROTH.NecroSpell.Sense.Laid" });
  return [t("AZEROTH.NecroSpell.Sent", { name: actor.name, spell: spell.name })];
}

/** How long a body has lain, in words: minutes, hours or days. */
function ageWords(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 3600) return t("AZEROTH.NecroSpell.Sense.Minutes", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("AZEROTH.NecroSpell.Sense.Hours", { n: Math.round(s / 3600) });
  return t("AZEROTH.NecroSpell.Sense.Days", { n: Math.round(s / 86400) });
}

/**
 * **CORPSE CANDLE**: the candle's record on the corpse's token (written on the GM's client), and an
 * effect on the caster for the hour. *Only you and your raised dead can see this light*: core's token
 * light stays dark, and each client whose user owns the caster - the caster's players and the GM -
 * draws a dim light of its own while the caster's effect stands (`canvas/corpse-candle.mjs`); a player
 * who does not own the caster sees none. The effect's end puts the light out on every client.
 */
async function candleLands(actor, spell, corpse, candle, sys, plan = null) {
  const span = await spellSpan(actor, sys, plan, actor);
  const [laid] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: sys.effect ?? "", ...span, system: { changes: [] },
    flags: { [SCOPE]: { [CANDLE_FLAG]: { by: actor.uuid, sceneId: corpse.sceneId, tokenId: corpse.tokenId } } }
  }]);
  try {
    await askGM({ act: "candle", casterUuid: actor.uuid, sceneId: corpse.sceneId, tokenId: corpse.tokenId, dim: candle?.dim ?? 20, on: true });
  } catch (err) {
    ui.notifications?.warn(err.message);
    if (laid) await laid.delete();
    return [err.message];
  }
  // *Only you and your raised dead can see this light*: the token carries the candle's record, and each
  // client whose user owns the caster draws the light for itself (`canvas/corpse-candle.mjs`).
  return [t("AZEROTH.NecroSpell.Candle.Lit", { name: corpse.name, n: candle?.dim ?? 20 }), game.i18n.localize("AZEROTH.NecroSpell.Candle.OwnersSee")];
}

/**
 * **DEATHMASK**: the caster's token takes the dead face (the corpse's image) for the hour, kept back on
 * the effect and put back when it goes; the damage door ends it (`ENDS_ON_DAMAGE_FLAG`); the Boon on
 * Tests to pass as that creature is the roll dialog's Situational line for the table to tick.
 */
async function deathmaskLands(actor, spell, mask, sys, source, plan = null) {
  const span = await spellSpan(actor, sys, plan, actor);
  const own = casterToken(actor, source);
  const before = own ? { sceneId: own.parent.id, tokenId: own.id, src: own.texture?.src ?? null } : null;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: t("AZEROTH.NecroSpell.Mask.Text", { name: mask.name }), ...span, system: { changes: [] },
    flags: { [SCOPE]: { [DEATHMASK_FLAG]: { by: actor.uuid, face: mask.img, of: mask.name, before }, [ENDS_ON_DAMAGE_FLAG]: { source: spell.name } } }
  }]);
  if (own && mask.img && own.isOwner) await own.update({ "texture.src": mask.img });
  return [t("AZEROTH.NecroSpell.Mask.Laid", { name: actor.name, face: mask.name })];
}

/** Bone Courier: the message whispered to the creature named (its owners, else the GM). */
async function courierLands(actor, spell, courier) {
  const to = fromUuidSync(courier.uuid);
  const users = to ? whisperTo(to) : [];
  const gms = [...(game.users ?? [])].filter(u => u.isGM).map(u => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: [...new Set([...users, ...gms, game.user.id])],
    content: `<p><strong>${foundry.utils.escapeHTML(spell.name)}</strong></p><p class="azeroth-drain">${t("AZEROTH.NecroSpell.Courier.Speaks", { name: courier.name, from: actor.name })}</p><blockquote>${foundry.utils.escapeHTML(courier.words)}</blockquote>`,
    flags: { [SCOPE]: { kind: "boneCourier" } }
  });
  return [t(courier.cut ? "AZEROTH.NecroSpell.Courier.Cut" : "AZEROTH.NecroSpell.Courier.Sent", { name: courier.name, n: courier.count })];
}

/** Death's Tidings: alive, dead or undead, to the caster alone. */
async function tidingsLands(actor, spell, tidings) {
  const who = fromUuidSync(tidings.uuid);
  if (!who) return [t("AZEROTH.NecroSpell.Tidings.Gone", { name: tidings.name })];
  const dead = who.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true || (who.type === "npc" && (Number(who.system?.health?.value) || 0) <= 0);
  const answer = tidingsOf({ undead: await undeadOf(who), dead });
  await whisperCard(actor, spell.name, [t(`AZEROTH.NecroSpell.Tidings.${answer}`, { name: tidings.name })], "deathsTidings");
  return [t("AZEROTH.NecroSpell.Sent", { name: actor.name, spell: spell.name })];
}

/** Borrowed Senses: Blinded and Deafened on the caster for the ten minutes, and the servant's eyes on this client. */
async function borrowedLands(actor, spell, borrowed, sys, plan = null) {
  const span = await spellSpan(actor, sys, plan, actor);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: sys.effect ?? "", ...span, statuses: ["blinded", "deafened"], system: { changes: [] },
    flags: { [SCOPE]: { [BORROWED_FLAG]: { by: actor.uuid, creature: borrowed.uuid } } }
  }]);
  const servant = fromUuidSync(borrowed.uuid);
  const tk = servant?.getActiveTokens?.(true)?.[0] ?? null;
  if (tk?.isOwner) {
    tk.control({ releaseOthers: true });
    canvas.animatePan?.({ x: tk.center.x, y: tk.center.y });
  }
  return [t("AZEROTH.NecroSpell.Borrowed.Laid", { name: actor.name, servant: borrowed.name })];
}

/** Call the Departed: once a creature, recorded on the caster, the spirit's ten minutes an effect. */
async function departedLands(actor, spell, departed, sys, plan = null) {
  const called = actor.getFlag(SCOPE, DEPARTED_FLAG) ?? [];
  await actor.setFlag(SCOPE, DEPARTED_FLAG, [...new Set([...called, departed.uuid])]);
  await layOwn(actor, spell, sys, { plan, flag: "departed", data: { creature: departed.uuid }, text: "AZEROTH.NecroSpell.Departed.Laid" });
  return [t("AZEROTH.NecroSpell.Departed.Speaks", { name: departed.name })];
}

/** Speak with the Dead: the corpse marked questioned on the GM's client, the minute an effect. */
async function speakLands(actor, spell, corpse, sys, plan = null) {
  try {
    await askGM({ act: "questioned", casterUuid: actor.uuid, sceneId: corpse.sceneId, tokenId: corpse.tokenId });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [err.message];
  }
  await layOwn(actor, spell, sys, { plan, flag: "speakDead", data: { corpse }, text: "AZEROTH.NecroSpell.Speak.Laid" });
  return [t("AZEROTH.NecroSpell.Speak.Answers", { name: corpse.name })];
}

/**
 * **GRAVE WARD**: a marker Region on the grave for the thirty days, and an effect on the caster. When
 * the GM rules the grave disturbed, the card's *Disturbed* asks the opener its Test (the area Test
 * card's door) and tells the caster.
 */
async function graveWardLands(actor, spell, point, ward, sys, spellDC, plan = null) {
  const lines = await layOwn(actor, spell, sys, { plan, flag: WARD_SIGN_FLAG, data: { point, dc: spellDC, ...ward }, text: "AZEROTH.NecroSpell.Ward.Laid", region: point });
  await postNecroCard(actor, {
    title: spell.name, text: t("AZEROTH.NecroSpell.Ward.Card", { name: actor.name, dc: spellDC ?? "—" }), gm: true, kind: "graveWard",
    buttons: [{ action: "necroGraveWard", label: game.i18n.localize("AZEROTH.NecroSpell.Ward.Disturbed"), gmOnly: true }],
    flags: { graveWard: { casterUuid: actor.uuid, dc: spellDC, resilience: ward.resilience, minutes: ward.minutes, spell: spell.name } }
  });
  return lines;
}

/**
 * **GRAVE WARD'S DISTURBED** (the card's GM button): the creatures the GM targets each make their Test
 * against the Spell DC, a failure Frightened for the minute; the caster is told.
 */
export async function graveWardFromCard(button, message) {
  const rec = message?.flags?.[SCOPE]?.graveWard ?? null;
  if (!rec || !isGM()) return null;
  const caster = fromUuidSync(rec.casterUuid);
  const targets = [...(game.user?.targets ?? [])].map(tk => tk.actor).filter(Boolean);
  if (!targets.length) return ui.notifications?.warn(game.i18n.localize("AZEROTH.NecroSpell.Ward.NoOpener"));
  const { resilienceWithDialog } = await import("../applications/actions.mjs");
  const { inflictCondition } = await import("./inflict.mjs");
  for (const opener of targets) {
    const result = await resilienceWithDialog(opener, rec.resilience ?? "spirit", null, { dc: rec.dc });
    const failed = result?.rolls?.[0]?.outcome?.success === false;
    if (failed) await inflictCondition({ victim: opener, id: "frightened", by: caster, name: opener.name, until: await minutes(opener, rec.minutes ?? 1) });
  }
  if (caster) await whisperCard(caster, rec.spell ?? "", [t("AZEROTH.NecroSpell.Ward.Told", { names: targets.map(a => a.name).join(", ") })], "graveWardTold");
  return true;
}

/**
 * **CONTAGION** (*The area must be under your Graveblight, or the spell does nothing and the Mana is
 * spent*): the caster's own Graveblight area found on the scene and the blight laid at its centre - a
 * Region of its own that spreads by the day and asks its Test at a turn's end - or the words that it
 * does nothing.
 */
async function contagionLands(actor, spell, sys, spellDC, cast, plan = null) {
  const read = readContagion(sys.effect);
  const under = readUnderOwn(sys.effect);
  const at = plan?.contagion ?? null;
  const scene = (at?.sceneId && game.scenes?.get(at.sceneId)) || canvas?.scene || null;
  // *The area must be under your Graveblight*: the caster's own Graveblight holding the point aimed.
  const base = at ? ownBlightAt(scene, actor, (under?.spell ?? "Graveblight").toLowerCase(), at) : null;
  if (!base) return [t("AZEROTH.NecroSpell.Contagion.Nothing", { spell: spell.name, under: under?.spell ?? "Graveblight" })];
  if (noGM([false])) return [t("AZEROTH.NecroSpell.Refuse.noGM", { spell: spell.name })];
  // **LAID ONCE THE CARD STANDS** (the animation layer reads a Region's cast off its card,
  // `animation/records.mjs#regionRecord`): the blight's Region is asked for when the card naming this
  // cast is posted, so its `region` cue finds the card's verdict. Not awaited by the cast. The Region
  // made, the caster's card offers *Dismiss* (*until you dismiss it*).
  const payload = { act: "contagion", casterUuid: actor.uuid, sceneId: scene.id, regionId: base.id, point: { x: at.x, y: at.y }, feet: read?.feet ?? 20, dc: spellDC, cast, perDay: read?.perDay ?? 20, resilience: read?.resilience ?? "body", name: spell.name, spellUuid: spell.uuid };
  const hook = Hooks.on("createChatMessage", message => {
    if (message?.flags?.[SCOPE]?.kind !== "spell" || message.flags[SCOPE].cast !== cast) return;
    Hooks.off("createChatMessage", hook);
    askGM({ ...payload, messageId: message.id }).then(made => {
      if (!made?.regionId) return null;
      return postNecroCard(actor, {
        title: spell.name, text: t("AZEROTH.NecroSpell.Contagion.Card", { name: actor.name }),
        buttons: [{ action: "necroCard", press: "dismissContagion", label: game.i18n.localize("AZEROTH.NecroSpell.Contagion.Dismiss") }],
        flags: { necroCard: { press: "dismissContagion", casterUuid: actor.uuid, sceneId: scene.id, regionId: made.regionId, spell: spell.name } }
      });
    }).catch(err => ui.notifications?.warn(err.message));
  });
  setTimeout(() => Hooks.off("createChatMessage", hook), 30000);
  return [t("AZEROTH.NecroSpell.Contagion.Laid", { spell: spell.name, n: read?.perDay ?? 20 })];
}

/** The caster's own area of a spell holding a point on the scene, or null (Contagion's *under your Graveblight*). */
function ownBlightAt(scene, actor, identifier, point) {
  for (const r of scene?.regions ?? []) {
    if (r.flags?.[SCOPE]?.identifier !== identifier || r.flags?.[SCOPE]?.caster !== actor.uuid) continue;
    let inside = false;
    try { inside = r.testPoint?.({ x: Number(point.x), y: Number(point.y), elevation: 0 }) === true; } catch { inside = false; }
    if (inside) return r;
  }
  return null;
}

/**
 * **A PRESS ON A NECROMANCER SPELL'S OWN CARD** (`CARD_ACTIONS.necroCard`): judged again off the world at
 * the press, said in words where refused, nothing spent before the judgement.
 * - `dismissContagion` - *until you dismiss it*: the blight's Region taken up on the GM's client;
 * - `anchorLook` - Spirit Anchor's Half-Action to see and hear from the anchor (`lookThrough`, Watchful
 *   Shades' door, 4c-T's);
 * - `markDirection` - Mark of the Grave's direction while the creature is within the mile, on one scene.
 */
export async function necroCardPress(button, message) {
  const rec = message?.flags?.[SCOPE]?.necroCard ?? null;
  const press = button?.dataset?.necroPress ?? rec?.press ?? null;
  if (!rec || rec.press !== press) return null;
  const caster = rec.casterUuid ? fromUuidSync(rec.casterUuid) : null;
  if (!caster) return refuse("casterGone", { spell: rec.spell ?? "" });
  if (!caster.isOwner) return refuse("notYours", { name: caster.name, spell: rec.spell ?? "" });
  switch (press) {
    case "dismissContagion": {
      const region = game.scenes?.get(rec.sceneId)?.regions?.get(rec.regionId) ?? null;
      if (!region) return refuse("contagionGone", { spell: rec.spell ?? "" });
      if (noGM([false])) return refuse("noGM", { spell: rec.spell ?? "" });
      try { await askGM({ act: "contagionDismiss", casterUuid: caster.uuid, sceneId: rec.sceneId, regionId: rec.regionId }); } catch (err) { ui.notifications?.warn(err.message); return null; }
      ui.notifications?.info(t("AZEROTH.NecroSpell.Contagion.Dismissed", { name: caster.name, spell: rec.spell ?? "" }));
      return true;
    }
    case "anchorLook": {
      const anchor = [...(caster.effects ?? [])].find(e => e.flags?.[SCOPE]?.[ANCHOR_FLAG] && !e.disabled) ?? null;
      if (!anchor) return refuse("anchorGone", { spell: rec.spell ?? "" });
      const point = anchor.flags[SCOPE][ANCHOR_FLAG].point ?? rec.point ?? null;
      const look = { sceneId: point?.sceneId ?? null, point, name: rec.spell ?? "" };
      const { lookRefusal, lookThrough } = await import("./necromancer-talents.mjs");
      // The look judged BEFORE the Half-Action (D-768's order; the fix run 4 review): a scene gone or
      // one this player may not view is refused in words with the Half-Action kept.
      const unseen = lookRefusal(look);
      if (unseen) { ui.notifications?.warn(unseen.words); return null; }
      const { turnBudgetRefusal, spendTurnBudget } = game.system.azeroth.workflows;
      const barred = turnBudgetRefusal?.(caster, "half") ?? null;
      if (barred) return refuse("anchorBudget", { name: caster.name, spell: rec.spell ?? "", reason: game.i18n.format(barred.reason, barred.params ?? {}) });
      if (!(await spendTurnBudget(caster, "half"))) return null;
      const looked = await lookThrough(look);
      if (looked.ok) ui.notifications?.info(t("AZEROTH.NecroSpell.Anchor.Looked", { name: caster.name, spell: rec.spell ?? "" }));
      return looked.ok;
    }
    case "markDirection": {
      const victim = rec.targetUuid ? fromUuidSync(rec.targetUuid) : null;
      const mark = victim ? [...(victim.effects ?? [])].find(e => e.flags?.[SCOPE]?.[MARK_OF_GRAVE_FLAG]?.by === caster.uuid && !e.disabled) : null;
      if (!mark) return refuse("markGone", { name: rec.name ?? "", spell: rec.spell ?? "" });
      const own = casterToken(caster);
      const theirs = victim.isToken ? victim.token : (own ? own.parent.tokens.find(tk => tk.actorId === victim.id && (tk.actorLink || tk.actor === victim)) : null) ?? casterToken(victim);
      const sameScene = Boolean(own && theirs && own.parent?.id === theirs.parent?.id);
      let feet = null;
      let dx = 0;
      let dy = 0;
      if (sameScene) {
        const { feetApart } = await import("../canvas/footprints.mjs");
        feet = feetApart(own, theirs);
        const grid = own.parent.grid?.size ?? 100;
        dx = (theirs.x + (theirs.width ?? 1) * grid / 2) - (own.x + (own.width ?? 1) * grid / 2);
        dy = (theirs.y + (theirs.height ?? 1) * grid / 2) - (own.y + (own.height ?? 1) * grid / 2);
      }
      const where = markDirection({ sameScene, feet, miles: mark.flags[SCOPE][MARK_OF_GRAVE_FLAG].miles ?? rec.miles ?? 1 });
      const words = where === "near"
        ? t("AZEROTH.NecroSpell.Mark.Near", { name: rec.name ?? victim.name, direction: game.i18n.localize(`AZEROTH.Compass.${compassOf(dx, dy)}`), feet: Math.round(feet) })
        : t(where === "far" ? "AZEROTH.NecroSpell.Mark.Far" : "AZEROTH.NecroSpell.Mark.Elsewhere", { name: rec.name ?? victim.name });
      await whisperCard(caster, rec.spell ?? "", [words], "markOfGraveDirection");
      return where;
    }
    default: return null;
  }
}

/**
 * **CONTAGION CLEARED BY RESTORATION OR CURE BLIGHT** (*Restoration and Cure Blight each clear it out to
 * 100 feet and no further*): on the active GM's client, a successful casting of either clears every
 * blight within the feet of where it lands - Restoration's ground at its caster (Range Touch), Cure
 * Blight's creature - the whole blight where it lies inside, else the cleared circle a hole in it.
 */
async function contagionClearedBy(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  if (f.kind !== "spell" || f.success !== true || !game.users?.activeGM?.isSelf) return;
  const contagion = (await contagionSource()) ?? null;
  const clearers = contagionClearers(contagion?.effect ?? "");
  if (!clearers.includes(String(f.identifier ?? ""))) return;
  const feet = readContagionClearing(contagion?.effect ?? "")?.feet ?? 100;
  const at = clearingPoint(f);
  if (!at) return;
  const scene = game.scenes?.get(at.sceneId) ?? null;
  if (!scene) return;
  const per = (scene.grid?.size || 100) / (scene.grid?.distance || 5);
  for (const region of [...(scene.regions ?? [])]) {
    const b = region.flags?.[SCOPE]?.[CONTAGION_FLAG];
    if (!b) continue;
    const outer = (region.shapes ?? []).find(s => s.type === "circle" && !s.hole) ?? null;
    if (!outer) continue;
    const apart = Math.hypot(Number(outer.x) - at.x, Number(outer.y) - at.y) / per;
    const done = contagionCleared({ apart, radius: (Number(outer.radius) || 0) / per, feet });
    if (done === "none") continue;
    // A deferred write (CLAUDE.md §15, D-757): the world asked again before each, since a scene or a
    // blight deleted while the pack index or an earlier write was awaited is refused by the server.
    if (!regionInWorld(region)) continue;
    if (done === "gone") await region.delete();
    else await region.update({ shapes: [...region.shapes.map(s => s.toObject?.() ?? s), { type: "circle", x: Math.round(at.x), y: Math.round(at.y), radius: feet * per, hole: true }] });
  }
}

/**
 * Contagion's own entry (its clearing sentence), read once off the spells pack - a hit or a miss alike
 * (the final review's nit: a miss stored as `null` read as "not read yet", so a world without the pack
 * or the entry read the index again on every successful spell card). `undefined` is "not read"; a read
 * that throws is not kept, so the next card asks again.
 */
let contagionEntry;
async function contagionSource() {
  if (contagionEntry !== undefined) return contagionEntry;
  const pack = game.packs?.get("azeroth-rpg.spells") ?? null;
  const index = pack ? await pack.getIndex({ fields: ["system.identifier", "system.effect"] }) : [];
  const row = [...index].find(r => r.system?.identifier === "contagion") ?? null;
  contagionEntry = row ? { effect: row.system?.effect ?? "" } : null;
  return contagionEntry;
}

/** Where a clearing spell lands: Cure Blight's first creature, else (Restoration, Range Touch) its caster. */
function clearingPoint(f) {
  const rows = [f.targets?.[0] ?? null, f.source ?? null].filter(Boolean);
  for (const row of rows) {
    const scene = (row.sceneId && game.scenes?.get(row.sceneId)) || null;
    const tk = row.tokenId ? scene?.tokens?.get(row.tokenId) ?? null : null;
    if (!tk) continue;
    const grid = scene.grid?.size ?? 100;
    return { sceneId: scene.id, x: tk.x + (tk.width ?? 1) * grid / 2, y: tk.y + (tk.height ?? 1) * grid / 2 };
  }
  return null;
}

/* -------------------------------------------- */
/*  A failed Resist                              */
/* -------------------------------------------- */

/**
 * **WHAT A FAILED RESIST ON A NECROMANCER SPELL'S CARD LAYS BESIDE ITS CONDITIONS**, on the client
 * that rolled the Test (which owns the creature). Read off the entry's own words on the card.
 */
export async function necroSpellAfterResist({ message, actor, maker = null, laid = {}, result = null } = {}) {
  const lines = [];
  const flags = message?.flags?.[SCOPE] ?? {};
  // A Necromancer spell's card carries `necroSpell` (the cast's own plan), and no other card does.
  if (flags.kind !== "spell" || !actor || !flags.necroSpell) return lines;
  const effect = flags.effectHTML ?? "";
  const spell = flags.spellName ?? "";
  const caster = maker;
  // Soul Lash: a Bane on its next Attack Test before the end of its next turn.
  const bane = readNextAttackBane(effect);
  if (bane) {
    const { layBane } = await import("./banes.mjs");
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    const done = await layBane({ victim: actor, kind: bane.kind, banes: bane.banes, source: spell, by: caster, lasting: false, span: untilEndOfNextTurnOrRound(actor) });
    if (done) lines.push(t("AZEROTH.NecroSpell.Bane.Laid", { name: actor.name, spell }));
  }
  // Cripple: the Damage Rating and the Strength on the Slowed this failure laid.
  const drops = readFailDrops(effect);
  const slowed = laid?.slowed?.effectId ? actor.effects?.get?.(laid.slowed.effectId) : null;
  if (drops && slowed) {
    const changes = [...foundry.utils.deepClone(slowed._source?.system?.changes ?? []), ...dropChanges(drops, { character: actor.type === "character" })];
    await slowed.update({ "system.changes": changes, [`flags.${SCOPE}.necroDrops`]: { spell, ...drops } });
    lines.push(t("AZEROTH.NecroSpell.Drops.Laid", { name: actor.name, spell, rating: drops.damageRating, strength: drops.strength }));
  }
  // Plague Wind: Poisoned 1 against the caster's Spell DC.
  const poison = readPoisonedAtDC(effect);
  const poisoned = laid?.poisoned?.effectId ? actor.effects?.get?.(laid.poisoned.effectId) : null;
  if (poison && poisoned) {
    await poisoned.update({ [`flags.${SCOPE}.value`]: poison.value, [`flags.${SCOPE}.${SHED_DC_FLAG}`]: { dc: Number(flags.spellDC) || null, source: spell } });
    lines.push(t("AZEROTH.NecroSpell.Poisoned.Laid", { name: actor.name, spell, n: poison.value, dc: flags.spellDC ?? "—" }));
  }
  // Bone Prison: while it is Entangled by this spell, it cannot be moved.
  const hold = readPrisonHold(effect);
  const entangled = laid?.entangled?.effectId ? actor.effects?.get?.(laid.entangled.effectId) : null;
  if (hold && entangled) {
    await entangled.setFlag(SCOPE, PRISON_FLAG, { source: spell, by: caster?.uuid ?? null });
    lines.push(t("AZEROTH.NecroSpell.Prison.Laid", { name: actor.name, spell }));
  }
  // Soul Rip: *If the target is living and fails the Test, you gain 1 Essence*.
  const rip = readSoulRip(effect);
  if (rip && caster && livingOf(actor)) {
    const gained = await essenceTo(caster, "soulRip", rip.essence, { from: actor, messageId: message?.id ?? null });
    lines.push(t(gained > 0 ? "AZEROTH.NecroSpell.Essence.Gained" : "AZEROTH.NecroSpell.Essence.None", { name: caster.name, n: gained, spell }));
  }
  // Reaping: the caster regains Health equal to its tier for each enemy that fails.
  if (readReapingHeal(effect) && caster) {
    const n = Math.max(1, Math.trunc(Number(caster.system?.tier)) || 1);
    try {
      if (caster.isOwner) await caster.applyHealing(n, { from: caster, givenBy: caster, spell: true, school: "death" });
      else await askGM({ act: "heal", casterUuid: caster.uuid, amount: n, messageId: message.id, resisterUuid: actor.uuid });
      lines.push(t("AZEROTH.NecroSpell.Reaping.Healed", { name: caster.name, n, spell }));
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  // Puppet of Flesh: the control, on the GM's client.
  if (readPuppet(effect) && caster) {
    try {
      const done = await askGM({ act: "puppet", casterUuid: caster.uuid, targetUuid: actor.uuid, messageId: message.id, resultUuid: result?.uuid ?? null });
      lines.push(t(done?.ok ? "AZEROTH.NecroSpell.Puppet.Laid" : "AZEROTH.NecroSpell.Puppet.Not", { name: actor.name, caster: caster.name, reason: done?.reason ?? "" }));
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  // Curse of Weakness and Curse of Tongues: the rider at the caster's Shadow Spellpower, for the minute.
  const curse = flags.necroSpell?.curse ?? null;
  if (curse) {
    // The card's resolved span (D-1099): 02 §7's Lasting doubles it, a talent's span restates it.
    const span = flags.duration ? await castSpan(actor, flags.duration, caster) : await minutes(actor, 1);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/downgrade.svg", origin: caster?.uuid ?? null,
      description: t(`AZEROTH.NecroSpell.Curse.${curse.kind}`, { n: curse.amount }), ...span, system: { changes: [] },
      flags: { [SCOPE]: { [CURSE_FLAG]: { kind: curse.kind, amount: curse.amount, by: caster?.uuid ?? null } } }
    }]);
    lines.push(t(`AZEROTH.NecroSpell.Curse.Laid.${curse.kind}`, { name: actor.name, n: curse.amount }));
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/**
 * **ESSENCE FROM A SPELL** (Soul Cage's and Soul Rip's sources, `ESSENCE_GAIN_SOURCES`): written on the
 * client that answers for the holder, through that client's pool queue. What was gained.
 */
async function essenceTo(holder, source, n = 1, { from = null, messageId = null, effectUuid = null } = {}) {
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(holder);
  if (!who) return 0;
  const payload = { act: "essence", holderUuid: holder.uuid, source, amount: n, fromUuid: from?.uuid ?? null, messageId, effectUuid };
  try {
    const done = who.id === game.user.id ? await necroSpellQueryHandler(payload, { user: game.user }) : await who.query(NECRO_SPELL_QUERY, payload, { timeout: 10000 });
    return Math.max(0, Number(done?.gain) || 0);
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/* -------------------------------------------- */
/*  The card's Apply                             */
/* -------------------------------------------- */

/**
 * **SEVER THE SOUL AT THE APPLY** (*If this damage reduces it to 0 Health, nothing can raise or
 * restore it*): the creature the card names, dropped to 0 by this Apply, is marked severed.
 */
export async function necroSpellAfterApply({ message, target, amount = 0 } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  const sever = flags.necroSpell?.sever ?? null;
  if (flags.kind !== "spell" || !sever || !target || !(Number(amount) > 0)) return [];
  if (sever.actorUuid !== target.uuid) return [];
  if ((Number(target.system?.health?.value) || 0) > 0) return [];
  const by = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  try {
    await askGM({ act: "soulMark", casterUuid: by?.uuid ?? flags.caster ?? null, targetUuid: target.uuid, state: "severed", messageId: message.id });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [];
  }
  const line = t("AZEROTH.NecroSpell.Severed", { name: target.name });
  ui.notifications?.info(line);
  return [line];
}

/* -------------------------------------------- */
/*  Bone Shield, in the blow                     */
/* -------------------------------------------- */

/** The Necromancer's Bone Shield spell, its Mana pool and price. */
function shieldOf(holder) {
  const spell = (holder?.items ?? []).find(i => i.type === "spell" && readBoneShield(i.system?.effect ?? "")) ?? null;
  const pool = (holder?.poolSnapshot?.() ?? []).find(p => p.kind === "power" && p.name === "mana") ?? null;
  return { spell, pool, cost: Math.max(0, Math.trunc(Number(spell?.system?.mana)) || 0) };
}

/**
 * **BONE SHIELD AT THE DAMAGE DOOR** (07 §17: *When an attack hits you, you take 6 less damage from
 * that attack*): asked of whoever answers for the Necromancer (`blow-doors.mjs#answererOf`) through the
 * blow door's own query (`act: "boneShield"`); a yes casts the spell there - its Reaction, its Mana and
 * its Casting Test, through `castSpell` - and a cast that went off takes the shield off this blow. 04's
 * Barbed Bone strikes the attacker back for the reduction. `{shielded: false}` where nothing changed.
 *
 * @param {Actor} holder
 * @param {{amount: number, attack?: boolean, by?: Actor|null}} blow
 */
export async function boneShieldInBlow(holder, blow = {}) {
  const amount = Math.max(0, Math.trunc(Number(blow.amount)) || 0);
  const { spell, pool, cost } = shieldOf(holder);
  const reaction = game.system.azeroth.workflows.turnBudgetRefusal?.(holder, "reaction") === null;
  if (boneShieldRefusal({ attack: blow.attack === true, amount, known: Boolean(spell), mana: pool?.value ?? 0, cost, reaction })) return { shielded: false };
  const { answererOf, BLOW_ASK_QUERY, ASK_MS, blowAskHandler } = await import("./blow-doors.mjs");
  const who = answererOf(holder);
  if (!who) return { shielded: false };
  const payload = { act: "boneShield", holderUuid: holder.uuid, targetUuid: holder.uuid, amount, byUuid: blow.by?.uuid ?? null };
  let answer = null;
  try {
    answer = who.id === game.user.id ? await blowAskHandler(payload, { user: game.user }) : await who.query(BLOW_ASK_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err?.message ?? "" }));
    return { shielded: false };
  }
  if (!answer?.shielded) return { shielded: false };
  const less = readBoneShield(spell.system?.effect ?? "")?.less ?? 6;
  const after = shieldedAmount(amount, less);
  const taken = amount - after;
  // 04's Barbed Bone: the attacker takes twice the rank and the Shadow Spellpower, against its own Ward.
  if (taken > 0 && blow.by) await barbedBoneStrikes(holder, blow.by);
  return { shielded: true, amount: after, taken };
}

/** The rank of a taken talent by identifier. */
function rankOf(actor, identifier) {
  const item = (actor?.items ?? []).find(i => i.type === "talent" && i.system?.identifier === identifier);
  return Math.max(0, Math.trunc(Number(item?.system?.taken)) || 0);
}

/** 04's Barbed Bone on the attacker: resolved against its Ward, landed through its own door (the GM's where another's). */
async function barbedBoneStrikes(holder, attacker) {
  const rank = rankOf(holder, BARBED_BONE.identifier);
  if (!rank) return null;
  const rating = barbedBoneRating(rank, holder.system?.spellpower?.shadow ?? 0);
  const { resolveRecordedDamage } = await import("../rules/damage-record.mjs");
  const { wardBySchool } = await import("../rules/ward.mjs");
  const s = attacker.system ?? {};
  const { dealtHalvedBy } = await import("../rules/legacy-uses.mjs");
  // The Necromancer's own damage, halved where 04's Drawn Across holds them (door 25), inside the record.
  const result = resolveRecordedDamage({ rating, sl: 0, kind: "magical", school: BARBED_BONE.type, ward: wardBySchool(s.ward)[BARBED_BONE.type] ?? 0, immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false, dealtHalved: dealtHalvedBy(holder) });
  const damage = result.immune ? 0 : Math.max(0, Math.trunc(Number(result.damage)) || 0);
  // A write on an attacker this client does not own goes to the GM: asked first (the 4c review's S).
  if (damage > 0 && noGM([attacker.isOwner === true])) {
    ui.notifications?.warn(t("AZEROTH.NecroSpell.Barbed.NoGM", { talent: BARBED_BONE.name, attacker: attacker.name }));
    return null;
  }
  try {
    if (damage > 0) {
      if (attacker.isOwner) await attacker.applyDamage(damage, { struck: true, attack: false, location: "body", type: BARBED_BONE.type, by: holder, wardTook: result.wardTook ?? 0, mitigation: result.mitigationSource });
      else await askGM({ act: "barbed", casterUuid: holder.uuid, targetUuid: attacker.uuid, amount: damage, mitigation: result.mitigationSource });
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
  const { postFeatureCard } = await import("./necromancer-horde.mjs");
  const tk = attacker.getActiveTokens?.(true)?.[0]?.document ?? null;
  await postFeatureCard(holder, {
    key: BARBED_BONE_KEY, text: t("AZEROTH.NecroSpell.Barbed.Struck", { name: holder.name, attacker: attacker.name, n: damage, talent: BARBED_BONE.name }),
    targets: tk ? [{ actorId: attacker.id, sceneId: tk.parent.id, tokenId: tk.id, name: tk.name }] : []
  });
  return damage;
}

/**
 * **THE ANSWER, ON THE NECROMANCER'S OWN CLIENT** (`blowAskHandler`'s `boneShield`): a dialog that
 * closes itself as no before the asker stops waiting; a yes casts Bone Shield through `castSpell` - its
 * Reaction, its Mana and its Casting Test - and answers whether it went off.
 */
export async function boneShieldHere({ holder, amount = 0 } = {}) {
  const started = Date.now();
  const { spell } = shieldOf(holder);
  if (!spell) return { shielded: false, reason: "notKnown" };
  const { ASK_MS } = await import("./blow-doors.mjs");
  const { answerInTime, answerWindow } = await import("../rules/chromatic-talents.mjs");
  const { DialogV2 } = foundry.applications.api;
  let dialog = null;
  const asked = DialogV2.wait({
    id: `azeroth-bone-shield-${holder.id}-${foundry.utils.randomID(6)}`,
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-blow-ask"],
    window: { title: spell.name },
    content: `<p>${t("AZEROTH.NecroSpell.Shield.Ask", { name: holder.name, n: amount, spell: spell.name, mana: spell.system?.mana ?? 0 })}</p>`,
    buttons: [{ action: "yes", label: t("AZEROTH.NecroSpell.Shield.Yes", { spell: spell.name }) }, { action: "no", label: game.i18n.localize("AZEROTH.Horde.GuardNo"), default: true }],
    rejectClose: false,
    render: (event, d) => { dialog = d; }
  });
  let timer = null;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve("late"), answerWindow(ASK_MS)); });
  const choice = await Promise.race([asked, late]);
  clearTimeout(timer);
  if (choice === "late") { await dialog?.close?.(); return { shielded: false, reason: "late" }; }
  if (choice !== "yes" || !answerInTime(started, Date.now(), ASK_MS)) return { shielded: false, reason: "declined" };
  // **CAST AT ONCE, AGAINST THE ASKER'S DEADLINE** (the 4c review's MUST-FIX 1; O-418's shape, D-1094):
  // the cast's own arguments are built as every cast's are (`castWithDialog`, the Engaged line it
  // raises), but the roll dialog never opens - a dialog left standing is a payment made after the asker
  // stopped waiting - and `castSpell` refuses before the Reaction and the Mana once the window is past.
  const deadline = started + answerWindow(ASK_MS);
  const { shouldPrompt } = await import("../settings.mjs");
  const noDialog = { shiftKey: shouldPrompt(null) };
  const card = await game.system.azeroth.actions.castWithDialog(holder, spell, noDialog, { targets: [], run: options => game.system.azeroth.workflows.castSpell({ ...options, answers: { boneShield: true, deadline } }) });
  return { shielded: card?.flags?.[SCOPE]?.success === true && answerInTime(started, Date.now(), ASK_MS, 0), reason: card ? null : "refused" };
}

/* -------------------------------------------- */
/*  The turn's doors                             */
/* -------------------------------------------- */

/**
 * **AT THE START OF A CREATURE'S TURN** (`AzerothCombat#_effectTicks`): Frenzy of the Dead's Health
 * lost (*bypassing armor and Ward*, through the one door for Health lost), and Drain Life's drain where
 * this creature is a caster holding it. Answers the lines; the combat posts them.
 */
export async function advanceNecroSpells(actor, combat = null) {
  const lines = [];
  if (!actor) return lines;
  const lose = frenzyLoss(actor.effects ?? []);
  if (lose > 0 && (Number(actor.system?.health?.value) || 0) > 0) {
    await actor.loseHealth?.(lose);
    lines.push(t("AZEROTH.NecroSpell.Frenzy.Lost", { name: actor.name, n: lose }));
  }
  lines.push(...await drainLifeTurn(actor));
  return lines;
}

/**
 * **THE DRAIN AT THE CASTER'S TURN START** (07: Drain Life, *When you cast this spell and at the start of
 * each of your turns, the target takes 2 Shadow damage and you regain that much Health*; Siphon Life, its
 * 3; `readCasterTurnDrain` reads that sentence and the one before D-1100): the cast's own hit lands at
 * the cast for every caster (the lead, on the 4c review's Q1: *"1 - on cast"*; D-1100), and while the
 * spell is sustained every target its Sustain entry names takes the drain again at each of the caster's
 * turn starts - a Warlock's and a Necromancer's alike - resolved against the target's Ward and landed
 * through its own door; the caster regains what was dealt, through the one healing door.
 */
async function drainLifeTurn(caster) {
  const lines = [];
  const { strikeFromArea } = await import("./area-strikes.mjs");
  for (const entry of caster.getFlag?.(SCOPE, "sustaining") ?? []) {
    const spell = (entry?.spellId && caster.items.get(entry.spellId))
      || caster.items.find(i => i.type === "spell" && (i.system?.identifier === entry?.identifier || i.name === entry?.name)) || null;
    const drain = readCasterTurnDrain(spell?.system?.effect ?? "");
    if (!drain) continue;
    for (const row of entry.targets ?? []) {
      const victim = await actorOfRow(row);
      if (!victim || (victim.type === "npc" && (Number(victim.system?.health?.value) || 0) <= 0)) continue;
      const outcome = {};
      lines.push(...await strikeFromArea({ actor: victim, caster, spell: { name: entry.name ?? spell?.name ?? "", school: spell?.system?.school ?? "death", tier: spell?.system?.tier ?? 1 }, damage: { rating: drain.rating, school: drain.school }, damageOutcome: outcome }));
      const dealt = Math.max(0, Math.trunc(Number(outcome.amount)) || 0);
      if (dealt > 0) {
        await caster.applyHealing(dealt, { from: caster, givenBy: caster, spell: true, school: spell?.system?.school ?? "death" });
        lines.push(t("AZEROTH.NecroSpell.Drain.Healed", { name: caster.name, n: dealt, spell: entry.name ?? spell?.name ?? "" }));
      }
    }
  }
  return lines;
}

/**
 * **AT THE END OF A CREATURE'S TURN** (`AzerothCombat#_onEndTurn`): Contagion's Test on a creature that
 * ends its turn in the blight - the area Test card's door (`area-strikes.mjs#postAreaTest`), a failure
 * **Fatigued**. On the active GM's client.
 */
export async function necroTurnEnd(combatant) {
  const actor = combatant?.actor ?? null;
  const token = combatant?.token ?? null;
  if (!actor || !token?.parent || !game.users?.activeGM?.isSelf) return;
  const { postAreaTest } = await import("./area-strikes.mjs");
  for (const region of token.parent.regions ?? []) {
    const blight = region.flags?.[SCOPE]?.[CONTAGION_FLAG] ?? null;
    if (!blight) continue;
    let inside = false;
    try { inside = token.testInsideRegion?.(region) === true; } catch { inside = false; }
    if (!inside) continue;
    await postAreaTest({ actor, token, region, check: { resilience: blight.resilience ?? "body", fail: { statuses: ["fatigued"] } }, trigger: "turn", caster: fromUuidSync(blight.by) });
  }
}

/* -------------------------------------------- */
/*  The death listener and the hooks             */
/* -------------------------------------------- */

/**
 * **WHEN A CREATURE DIES** (the death watch's `onDeath`, on the active GM): its time recorded for Grave
 * Sense; Soul Cage's Essence and cage; Mark of the Grave's word to its caster.
 */
async function onNecroDeath(event) {
  if (!event?.died) return;
  const dead = event.actor;
  // The death's time, only in a world where a creature could read it (the final review's S5).
  if (worldAgesCorpses()) {
    try { await dead.setFlag(SCOPE, DIED_AT_FLAG, game.time?.worldTime ?? 0); } catch { /* a token's synthetic actor the GM cannot write */ }
  }
  for (const effect of [...(dead.effects ?? [])]) {
    if (effect.disabled === true) continue;
    const cage = effect.flags?.[SCOPE]?.[SOUL_CAGE_FLAG] ?? null;
    if (cage?.by) {
      const caster = fromUuidSync(cage.by);
      if (cage.caged) await writeSoulMark(dead, { state: "caged", by: cage.by });
      if (caster && cage.living && cage.essence > 0) {
        const gained = await essenceTo(caster, "soulCage", cage.essence, { from: dead, effectUuid: effect.uuid });
        if (gained > 0) ui.notifications?.info(t("AZEROTH.NecroSpell.Essence.Gained", { name: caster.name, n: gained, spell: effect.name }));
      }
    }
    const mark = effect.flags?.[SCOPE]?.[MARK_OF_GRAVE_FLAG] ?? null;
    if (mark?.by) {
      const caster = fromUuidSync(mark.by);
      if (caster) await whisperCard(caster, effect.name, [t("AZEROTH.NecroSpell.Mark.Died", { name: dead.name })], "markOfGraveDied");
    }
  }
}

/**
 * Whether any world actor could read a death's time (`rules/necromancer-spells.mjs#agesCorpses`): its
 * class names, and its spells as items and on a creature's Spells line.
 */
function worldAgesCorpses() {
  return agesCorpses([...(game.actors ?? [])].map(a => ({
    classes: (a.items ?? []).filter(i => i.type === "class").map(i => i.name),
    spells: [...(a.items ?? []).filter(i => i.type === "spell").map(i => i.name), ...(a.system?.spells?.names ?? [])]
  })));
}

/** A soul mark on the dead: the actor's flag, and the corpse mark on each of its tokens. */
async function writeSoulMark(dead, mark) {
  const clean = soulMarkOf(mark);
  if (!clean) return;
  await dead.setFlag(SCOPE, SOUL_MARK_FLAG, clean);
  const tokens = dead.isToken && dead.token ? [dead.token] : game.scenes.contents.flatMap(s => s.tokens.filter(tk => tk.actor === dead || (tk.actorLink && tk.actorId === dead.id)));
  for (const tk of tokens) await tk.update({ [`flags.${SCOPE}.${CORPSE_FLAG}`]: { state: clean.state, by: clean.by, until: null } });
}

/** The hooks: the death listener, Corpse Candle's and the markers' end, Deathmask's face put back, Contagion's spread. */
export async function registerNecroSpellHooks() {
  const { onDeath } = await import("./death-watch.mjs");
  onDeath(event => onNecroDeath(event));
  Hooks.on("deleteActiveEffect", effect => {
    const f = effect?.flags?.[SCOPE] ?? {};
    // Deathmask's face goes back on the caster's own client (a player may write its own token).
    if (f[DEATHMASK_FLAG]?.before && effect.parent?.isOwner) {
      const b = f[DEATHMASK_FLAG].before;
      const tk = game.scenes?.get(b.sceneId)?.tokens?.get(b.tokenId) ?? null;
      if (tk?.isOwner && b.src) tk.update({ "texture.src": b.src }).catch(err => console.warn("azeroth-rpg | Deathmask", err));
    }
    if (!game.users?.activeGM?.isSelf) return;
    if (f[CANDLE_FLAG]) necroSpellQueryHandler({ act: "candle", casterUuid: f[CANDLE_FLAG].by, sceneId: f[CANDLE_FLAG].sceneId, tokenId: f[CANDLE_FLAG].tokenId, on: false }, { user: game.user }).catch(err => console.warn("azeroth-rpg | Corpse Candle", err));
    for (const key of [WARD_SIGN_FLAG, ANCHOR_FLAG, SERVANT_FLAG]) {
      const rec = f[key];
      if (rec?.regionId && rec?.sceneId) game.scenes?.get(rec.sceneId)?.regions?.get(rec.regionId)?.delete().catch(() => {});
    }
    // Puppet of Flesh: the control gone, the caster's Stunned goes with it and the creature is handed back.
    if (f[PUPPET_FLAG]) puppetEnded(effect).catch(err => console.warn("azeroth-rpg | Puppet of Flesh", err));
  });
  Hooks.on("updateWorldTime", () => {
    if (!game.users?.activeGM?.isSelf) return;
    spreadContagion().catch(err => console.warn("azeroth-rpg | Contagion", err));
  });
  // Restoration and Cure Blight clear Contagion out to 100 feet (the active GM's client).
  Hooks.on("createChatMessage", message => { contagionClearedBy(message).catch(err => console.warn("azeroth-rpg | Contagion cleared", err)); });
  // (Corpse Candle's light is registered synchronously at init, `azeroth.mjs` beside Elune's Light.)
}

/** Contagion's daily spread: every blight's radius the cast's 20 feet and 20 more a whole day since. */
async function spreadContagion() {
  const now = game.time?.worldTime ?? 0;
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) {
      const b = region.flags?.[SCOPE]?.[CONTAGION_FLAG];
      if (!b) continue;
      const feet = contagionRadius({ base: b.base ?? 20, perDay: b.perDay ?? 20, days: Math.floor((now - (Number(b.since) || 0)) / 86400) });
      if (feet === b.feet) continue;
      const px = feet / (scene.grid?.distance || 5) * (scene.grid?.size || 100);
      // Only the blight's own circle spreads: a hole Restoration or Cure Blight cleared stays clean (*A place
      // restored this way stays restored unless something puts it back*).
      const shapes = (region.shapes ?? []).map(s => { const o = s.toObject?.() ?? s; return o.hole ? o : { ...o, radius: px }; });
      // Asked of the world before each write (D-757): an earlier blight's write was awaited.
      if (!regionInWorld(region)) continue;
      await region.update({ shapes, [`flags.${SCOPE}.${CONTAGION_FLAG}.feet`]: feet });
    }
  }
}

/** Puppet of Flesh ended: the caster's Stunned removed and the ownership the control granted taken back. */
async function puppetEnded(effect) {
  const rec = effect.flags?.[SCOPE]?.[PUPPET_FLAG] ?? {};
  const caster = rec.casterUuid ? fromUuidSync(rec.casterUuid) : null;
  if (caster) {
    const ids = [...(caster.effects ?? [])].filter(e => e.flags?.[SCOPE]?.puppetStun === rec.cast).map(e => e.id);
    if (ids.length) await caster.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
  const target = effect.parent;
  if (target && rec.ownership) await target.update({ ownership: foundry.data.operators.ForcedReplacement.create(rec.ownership) });
}

/* -------------------------------------------- */
/*  The GM's handler                             */
/* -------------------------------------------- */

/**
 * **A NECROMANCER SPELL'S WRITE ON ANOTHER CLIENT** (`NECRO_SPELL_QUERY`): the asker owns the caster
 * (an Essence gain is asked by a GM or by an owner of the creature that failed the Soul Rip card's
 * Test); everything else is judged again here off the world. Throws with the reason.
 */
export async function necroSpellQueryHandler(payload = {}, { user = null } = {}) {
  const caster = payload.casterUuid ? fromUuidSync(payload.casterUuid) : null;
  const owns = a => !user || user.isGM || a?.testUserPermission?.(user, "OWNER");
  if (payload.act === "essence") {
    const holder = payload.holderUuid ? fromUuidSync(payload.holderUuid) : null;
    if (holder?.documentName !== "Actor" || !holder.isOwner) return { ok: false, reason: "notOwner" };
    const { ESSENCE_GAIN_SOURCES } = await import("../rules/essence.mjs");
    if (!["soulCage", "soulRip"].includes(payload.source) || !ESSENCE_GAIN_SOURCES.includes(payload.source)) return { ok: false, reason: "source" };
    // **THE AMOUNT IS THE ROW'S AND THE ASKER IS JUDGED** (the final review's S3, D-982): Soul Rip's
    // card and Soul Cage's cage say what may be given, never the payload, and whether the ASKING user
    // may ask (`essenceGainClaim`); this client's own ownership of the holder is only where it writes.
    const from = payload.fromUuid ? fromUuidSync(payload.fromUuid) : null;
    const card = payload.source === "soulRip" && payload.messageId ? (game.messages?.get(payload.messageId) ?? null) : null;
    const cf = card?.flags?.[SCOPE] ?? {};
    const cardCaster = card ? (cf.caster ? fromUuidSync(cf.caster) : null) ?? ChatMessage.getSpeakerActor(card.speaker) : null;
    const cageFx = payload.source === "soulCage" && payload.effectUuid ? fromUuidSync(payload.effectUuid) : null;
    const cageRow = cageFx?.flags?.[SCOPE]?.[SOUL_CAGE_FLAG] ?? null;
    const claim = essenceGainClaim({
      source: payload.source, amount: payload.amount, holderUuid: holder.uuid,
      asker: { gm: !user || user.isGM === true, ownsHolder: owns(holder), ownsFrom: Boolean(from) && owns(from) },
      from: from ? { uuid: from.uuid, actorId: from.isToken ? (from.token?.actorId ?? null) : from.id, tokenId: from.isToken ? (from.token?.id ?? null) : null, living: livingOf(from) } : null,
      card: card ? { kind: cf.kind, necro: Boolean(cf.necroSpell), casterUuid: cardCaster?.uuid ?? null, effect: cf.effectHTML ?? "", targets: cf.targets ?? [], claimed: cf.soulRipClaimed ?? [] } : null,
      cage: cageRow ? { by: cageRow.by ?? null, essence: cageRow.essence, living: cageRow.living === true, parentUuid: cageFx.parent?.uuid ?? null } : null
    });
    if (!claim.ok) return { ok: false, reason: claim.reason, gain: 0 };
    // The card's one gain for this creature, written before the Essence where this client may write it.
    if (card?.isOwner) await card.setFlag(SCOPE, "soulRipClaimed", [...(cf.soulRipClaimed ?? []), from.uuid]);
    const { poolWrite } = await import("../documents/pool-writes.mjs");
    const { ESSENCE_GAIN_OPTION, essenceGainCue } = await import("../rules/animation-records.mjs");
    return poolWrite(holder, async () => {
      const pool = (holder.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === ESSENCE) ?? null;
      if (!pool) return { ok: false, reason: "noPool" };
      const next = Math.min(pool.max, pool.value + claim.amount);
      if (next <= pool.value) return { ok: false, reason: "full", gain: 0 };
      const hTk = holder.getActiveTokens?.(true)?.[0]?.document ?? null;
      const fTk = from?.isToken ? from.token : from?.getActiveTokens?.(true)?.[0]?.document ?? null;
      const cue = hTk && fTk ? essenceGainCue({ holder: { sceneId: hTk.parent.id, tokenId: hTk.id }, corpse: { sceneId: fTk.parent.id, tokenId: fTk.id }, amount: next - pool.value }) : null;
      await holder.writePoolsNow({ itemId: pool.itemId, kind: "momentum", value: next }, {}, { essenceGain: payload.source, ...(cue ? { [ESSENCE_GAIN_OPTION]: cue } : {}) });
      return { ok: true, gain: next - pool.value, value: next };
    });
  }
  if (caster?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (!owns(caster)) throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: caster.name }));
  const target = payload.targetUuid ? fromUuidSync(payload.targetUuid) : null;
  switch (payload.act) {
    case "effect": {
      if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const data = foundry.utils.deepClone(payload.data ?? {});
      const f = data.flags?.[SCOPE] ?? {};
      const known = [SOUL_CAGE_FLAG, FRENZY_FLAG, MARK_OF_GRAVE_FLAG].some(k => f[k]?.by === caster.uuid);
      if (!known) throw new Error(game.i18n.localize("AZEROTH.NecroSpell.Refuse.unknownEffect"));
      const [made] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
      return { ok: Boolean(made) };
    }
    case "endCondition": {
      if (target?.documentName !== "Actor" || !AZEROTH.conditions?.[payload.condition]) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      await target.toggleStatusEffect(payload.condition, { active: false });
      return { ok: true };
    }
    case "heal": {
      const amount = Math.max(0, Math.min(Math.trunc(Number(payload.amount)) || 0, Math.trunc(Number(caster.system?.tier)) || 1));
      if (amount > 0) await caster.applyHealing(amount, { from: caster, givenBy: caster, spell: true, school: "death" });
      return { ok: true };
    }
    case "barbed": {
      if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const cap = barbedBoneRating(rankOf(caster, BARBED_BONE.identifier), caster.system?.spellpower?.shadow ?? 0);
      const amount = Math.max(0, Math.min(Math.trunc(Number(payload.amount)) || 0, cap));
      const { recordOf } = await import("../rules/blow-records.mjs");
      if (amount > 0) await target.applyDamage(amount, { struck: true, attack: false, location: "body", type: BARBED_BONE.type, by: caster, mitigation: recordOf(payload.mitigation) });
      return { ok: true, amount };
    }
    case "soulMark": {
      if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      if ((Number(target.system?.health?.value) || 0) > 0) throw new Error(t("AZEROTH.NecroSpell.Refuse.notDead", { name: target.name }));
      await writeSoulMark(target, { state: payload.state, by: caster.uuid });
      return { ok: true };
    }
    case "candle": {
      const tk = game.scenes?.get(payload.sceneId)?.tokens?.get(payload.tokenId) ?? null;
      if (!tk) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      // The candle's record on the corpse; each client that owns the caster draws the light for itself
      // (`canvas/corpse-candle.mjs`), so core's token light - which every player sees - stays dark.
      const dim = Math.max(0, Math.min(Math.trunc(Number(payload.dim)) || 0, 20));
      if (payload.on) await tk.update({ [`flags.${SCOPE}.${CANDLE_FLAG}`]: { by: caster.uuid, dim } });
      else if (tk.getFlag(SCOPE, CANDLE_FLAG)?.by === caster.uuid) await tk.unsetFlag(SCOPE, CANDLE_FLAG);
      return { ok: true };
    }
    case "questioned": {
      const tk = game.scenes?.get(payload.sceneId)?.tokens?.get(payload.tokenId) ?? null;
      if (!tk) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const no = questionRefusal({ questioned: tk.getFlag(SCOPE, QUESTIONED_FLAG) === true, soulMark: tk.actor?.getFlag?.(SCOPE, SOUL_MARK_FLAG) ?? null, by: caster.uuid });
      if (no) throw new Error(t(`AZEROTH.NecroSpell.Refuse.question.${no}`, { spell: "", name: tk.name }));
      await tk.setFlag(SCOPE, QUESTIONED_FLAG, true);
      return { ok: true };
    }
    case "marker": {
      const scene = game.scenes?.get(payload.point?.sceneId) ?? null;
      if (!scene) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const r = (scene.grid?.size || 100) / 2;
      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: payload.name ?? "", color: "#3f6f4a", visibility: CONST.REGION_VISIBILITY?.OBSERVER ?? 1,
        shapes: [{ type: "circle", x: Number(payload.point.x) || 0, y: Number(payload.point.y) || 0, radius: r }],
        flags: { [SCOPE]: { identifier: payload.identifier ?? null, caster: caster.uuid, necroMarker: { effectId: payload.effectId ?? null } } }
      }]);
      return { ok: Boolean(region), regionId: region?.id ?? null };
    }
    case "contagion": {
      const scene = game.scenes?.get(payload.sceneId) ?? null;
      const base = scene?.regions?.get(payload.regionId) ?? null;
      if (!base || base.flags?.[SCOPE]?.caster !== caster.uuid) throw new Error(game.i18n.localize("AZEROTH.NecroSpell.Contagion.NoBlight"));
      // Judged again here: the point aimed still lies under the caster's own Graveblight.
      const point = payload.point && Number.isFinite(Number(payload.point.x)) && Number.isFinite(Number(payload.point.y)) ? payload.point : null;
      if (!point || ownBlightAt(scene, caster, base.flags?.[SCOPE]?.identifier ?? "graveblight", point)?.id !== base.id) throw new Error(game.i18n.localize("AZEROTH.NecroSpell.Contagion.NoBlight"));
      const feet = Math.max(5, Math.min(Math.trunc(Number(payload.feet)) || 20, 20));
      const px = feet / (scene.grid?.distance || 5) * (scene.grid?.size || 100);
      const shapes = [{ type: "circle", x: Math.round(Number(point.x)), y: Math.round(Number(point.y)), radius: px }];
      // **DRAWN FOR EVERY READER** (team ANI): core's own default is LAYER_UNLOCKED, which draws a
      // Region only on the Regions layer, so the blight stood invisible on the board and its `region`
      // cue was refused `hidden` on every client. The Graveblight under it is ALWAYS (canvas/regions.mjs).
      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: payload.name ?? "Contagion", color: "#6b7d2a", shapes, visibility: CONST.REGION_VISIBILITY.ALWAYS,
        flags: { [SCOPE]: { identifier: "contagion", caster: caster.uuid, cast: payload.cast ?? null, messageId: payload.messageId ?? null, dc: Number(payload.dc) || null, spell: { name: payload.name ?? "Contagion" },
          [CONTAGION_FLAG]: { by: caster.uuid, since: game.time?.worldTime ?? 0, base: 20, perDay: Number(payload.perDay) || 20, feet: 20, resilience: payload.resilience ?? "body" } } }
      }]);
      return { ok: Boolean(region), regionId: region?.id ?? null };
    }
    case "contagionDismiss": {
      const region = game.scenes?.get(payload.sceneId)?.regions?.get(payload.regionId) ?? null;
      if (!region?.flags?.[SCOPE]?.[CONTAGION_FLAG]) throw new Error(t("AZEROTH.NecroSpell.Refuse.contagionGone", { spell: "" }));
      if (region.flags[SCOPE][CONTAGION_FLAG].by !== caster.uuid) throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: caster.name }));
      await region.delete();
      return { ok: true };
    }
    case "puppet": return puppetHere({ caster, target, payload });
    default: throw new Error(`necroSpell: no such act ${JSON.stringify(payload.act ?? null)}`);
  }
}

/**
 * **PUPPET OF FLESH ON THE GM'S CLIENT** (the Mind Control door, `rules/mind-control.mjs`): the
 * control's carrier on the creature - its record, so the creature acts straight after the caster and
 * repeats its Test at the end of each of its turns (`effects/mind-control-repeat.mjs`), spanned by the
 * spell's minute and marked `puppet` so a blow does not end it (07 names no such end) - the caster's
 * owners given the creature for the duration, and the caster **Stunned** while it holds.
 */
async function puppetHere({ caster, target, payload }) {
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const { MIND_CONTROL_FLAG, mindControlOn, mindControlRecord } = await import("../rules/mind-control.mjs");
  if ([...(target.effects ?? [])].some(e => mindControlOn(e, target.uuid))) return { ok: false, reason: "controlled" };
  const message = game.messages?.get(payload.messageId) ?? null;
  const dc = Math.trunc(Number(message?.flags?.[SCOPE]?.spellDC)) || 0;
  const tTk = target.isToken ? target.token : target.getActiveTokens?.(true)?.[0]?.document ?? null;
  const cTk = caster.getActiveTokens?.(true)?.[0]?.document ?? null;
  const record = mindControlRecord({
    casterUuid: caster.uuid, targetUuid: target.uuid, messageUuid: message?.uuid ?? `ChatMessage.${payload.messageId}`, resultUuid: payload.resultUuid ?? `ChatMessage.${payload.messageId}`, dc,
    turnIdentity: { caster: cTk ? { sceneId: cTk.parent.id, tokenId: cTk.id } : null, target: tTk ? { sceneId: tTk.parent.id, tokenId: tTk.id } : null }
  });
  if (!record) return { ok: false, reason: "record" };
  // The card's resolved span (D-1099): Lasting doubles the minute, for the control and the caster's Stunned.
  const spec = message?.flags?.[SCOPE]?.duration ?? null;
  const span = spec ? await castSpan(target, spec, caster) : await minutes(target, 1);
  const players = Object.entries(caster.ownership ?? {}).filter(([id, level]) => id !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(id)?.isGM).map(([id]) => id);
  const prior = foundry.utils.deepClone(target.ownership ?? {});
  const cast = message?.flags?.[SCOPE]?.cast ?? foundry.utils.randomID();
  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: message?.flags?.[SCOPE]?.spellName ?? "Puppet of Flesh", img: message?.flags?.[SCOPE]?.spellImg ?? "icons/svg/mystery-man.svg", origin: caster.uuid, ...span, system: { changes: [] },
    flags: { [SCOPE]: { identifier: "puppet-of-flesh", [MIND_CONTROL_FLAG]: record, [PUPPET_FLAG]: { casterUuid: caster.uuid, cast, ownership: players.length ? prior : null } } }
  }]);
  if (!effect) return { ok: false, reason: "pending" };
  if (players.length) {
    const next = { ...prior };
    for (const id of players) next[id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    await target.update({ ownership: foundry.data.operators.ForcedReplacement.create(next) });
  }
  const casterSpan = spec ? await castSpan(caster, spec, caster) : await minutes(caster, 1);
  await caster.createEmbeddedDocuments("ActiveEffect", [{
    name: effect.name, img: effect.img, origin: caster.uuid, statuses: ["stunned"], ...casterSpan, system: { changes: [] },
    flags: { [SCOPE]: { puppetStun: cast } }
  }]);
  return { ok: true, effectId: effect.id };
}
