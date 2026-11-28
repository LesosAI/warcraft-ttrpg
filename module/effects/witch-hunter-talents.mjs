/**
 * **THE WITCH HUNTER'S TALENTS, AS DOORS** (04-TALENTS' Wolf, Gryphon, Bear and Cat; the Witch Hunter plan's wave 2b,
 * D-2080 to D-2094). The law is `rules/witch-hunter-talents.mjs`; the rows are `rules/talent-effects.mjs`'
 * `"witch-hunter"` block. A talent a door another class built already reads (a `damage` line, a `passive`, a `parry`
 * gain, a `momentum` gain, a `critical` range, a `hitLays` condition, an `evade` step, an `extraStrike` button, a
 * `modifies` patch, an `armorAccess` row) is read there; this module is the ONE writer for what only this class does:
 *
 * - **A Use a talent grants** (Second Brewing, Mountain Bear): `judgeWhTalentUse` from the class's judgement step
 *   (`effects/witch-hunter-features.mjs#judgeWitchHunterUse`, before the budget) and `landWhTalentUse` after it.
 * - **A brew used as a free action** (Practiced Hands, Cluster Bomb): the round's mark claimed through the
 *   combatant's queued door BEFORE the budget (`freeBrewFor`), and the bomb thrown this turn recorded
 *   (`markBombThrown`).
 * - **A blow taken** (Bear's Wrath's Tempo, Bear's Endurance's temporary Health): `whWhenStruck`, from the actor's
 *   struck door beside the other classes' (`AzerothActor#_struckBy`).
 * - **A hit** (Thunderous Swing's push): `whTalentsOnHit`, from `rollTest` beside the other classes' hit doors.
 * - **The Signs' talents with a door of their own**: Firestream's cone left alight (`placeFirestream`, an area that
 *   strikes), Bursting Rowan's burst (`burstFromRowan`, on the GM's client where the hunter's own may not write).
 * - **A walk of 10 feet** (Leaping Strike's promise to the next attack): `layLeapingStrike`, from the move door.
 * - **What the Apply lands** under Nine Lives (`nineLivesFor`, the Apply door's one question).
 *
 * Every write on a creature this client does not own goes through `WH_TALENTS_QUERY` on the active GM's client (or
 * a door's own query: a push through `forceMove`'s), with `gm-writes.mjs#gmAbsentFor` asked before anything is paid.
 */

import {
  BOMB_TURN_MARK, BURSTING_ROWAN, CLUSTER_BOMB, FIRESTREAM, LEAPING_STRIKE, MOUNTAIN_BEAR, MOUNTAIN_BEAR_FLAG, NINE_LIVES, PRACTICED_HANDS,
  THUNDEROUS_SWING, WH_BREW_LOG_FLAG, BEARS_ENDURANCE, BEARS_WRATH, brewRowKey, burstDamage, droppedBelowHalf,
  enduranceTemp, firestreamTick, freeBrewBy, leapingGrant, mountainBearChanges, nineLivesApply, secondBrewingJudgement,
  thunderousFeet, whRankOfItems, wrathGain
} from "../rules/witch-hunter-talents.mjs";
import { nextRoundMark } from "../rules/class-talents.mjs";
import { secondBrewingPlan } from "../rules/brewing.mjs";
import { brewOf } from "../rules/witch-hunter-brews.mjs";
import { BREWED_FLAG } from "../rules/witch-hunter-standing.mjs";
import { emptyAreaTick } from "../rules/area-ticks.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { resistRecordOn } from "../rules/resisted.mjs";
import { isUnarmed } from "../rules/unarmed.mjs";
import { turnMark } from "../rules/class-answers.mjs";
import { REGION_PRIVACY_FLAG } from "../rules/animation-records.mjs";
import { signAnimationKey } from "../rules/witch-hunter-animations.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);
const int = v => Math.trunc(Number(v)) || 0;
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));
const rank = (actor, talent) => whRankOfItems(actor?.items ?? [], talent.identifier);

/** The query every talent write on another client's creature is asked through (`module/queries.mjs`). */
export const WH_TALENTS_QUERY = "azeroth-rpg.witchHunterTalents";

/** The pack a brew is copied from. */
const GEAR_PACK = "azeroth-rpg.gear";

/** Refuse in words and answer null (D-768: nothing is spent). */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/** Whether a write on these actors needs a GM and none is online (`gm-writes.mjs#gmAbsentFor`). */
function gmMissing(actors = []) {
  return gmAbsentFor({ owned: actors.filter(Boolean).map(a => a.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/** The fight, the actor's combatant, the turn and the marks its round record holds this round. */
function roundFacts(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  const record = combatant?.getFlag?.(SCOPE, "round") ?? null;
  const used = record && record.number === fight?.round ? (record.once ?? []) : [];
  return { fight: combatant ? fight : null, combatant, used, turn: combatant ? fight.turn : null };
}

/** Ask the active GM through `WH_TALENTS_QUERY`; null where none answers. */
async function askGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) return null;
  try {
    return await gm.query(WH_TALENTS_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  A Use a talent grants                                               */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A TALENT'S USE NEEDS, ASKED BEFORE ANYTHING IS PAID** (D-768): 04's Second Brewing (*each elixir and
 * Decoction you brewed ... returns to the number of doses you brewed*) - the brewing on record and something below
 * its doses - and Mountain Bear (*for 1 minute*) - not already standing. Null refuses the Use in words.
 *
 * @param {{actor: Actor, item: Item, onUse?: object}} o
 * @returns {Promise<object|null>}  the plan `landWhTalentUse` lands
 */
export async function judgeWhTalentUse({ actor, item, onUse = {} } = {}) {
  const which = onUse?.wh?.talent ?? null;
  const name = item?.name ?? "";
  if (which === "secondBrewing") {
    const log = actor.getFlag?.(SCOPE, WH_BREW_LOG_FLAG) ?? null;
    const held = await heldOfBrewing(actor, log);
    const judged = secondBrewingJudgement({ log, held, plan: secondBrewingPlan });
    if (judged.refusal) return refuse(`AZEROTH.WhTalent.SecondBrewing.Refuse.${judged.refusal}`, { name });
    return { key: "talent", talent: "secondBrewing", rows: judged.rows, generation: int(log.generation) };
  }
  if (which === "mountainBear") {
    if ((actor.effects ?? []).some(e => e.active !== false && e.flags?.[SCOPE]?.[MOUNTAIN_BEAR_FLAG])) return refuse("AZEROTH.WhTalent.MountainBear.Standing", { name });
    return { key: "talent", talent: "mountainBear" };
  }
  return refuse("AZEROTH.WhFeature.Unknown", { name });
}

/** A talent's Use, landed once its budget is paid: the lines its card prints. */
export async function landWhTalentUse({ actor, item, plan } = {}) {
  if (plan?.talent === "secondBrewing") return landSecondBrewing(actor, plan);
  if (plan?.talent === "mountainBear") return landMountainBear(actor, item);
  return [];
}

/**
 * Every dose of the recorded brewing anybody holds, by the log row's key (`brewRowKey`): the brews this hunter made
 * whose brewing's generation is the log's, matched to a row by their identifier and type.
 */
async function heldOfBrewing(actor, log) {
  const held = {};
  const rows = Array.isArray(log?.rows) ? log.rows.map((r, i) => ({ ...r, key: brewRowKey(r, i) })) : [];
  if (!rows.length) return held;
  const { brewsMadeBy } = await import("./witch-hunter-brews.mjs");
  for (const { item } of brewsMadeBy(actor)) {
    const f = item.flags?.[SCOPE]?.[BREWED_FLAG] ?? {};
    if (int(f.generation) !== int(log.generation)) continue;
    const row = rows.find(r => r.identifier === item.system?.identifier && (r.type ?? null) === (f.type ?? null));
    if (row) held[row.key] = (held[row.key] ?? 0) + Math.max(0, int(item.system?.quantity ?? 1));
  }
  return held;
}

/**
 * **SECOND BREWING, ONCE PAID FOR**: each row's missing doses put back on the hunter's own brew of that brewing, or a
 * new one copied from the pack where the hunter holds none of it any more (a dose drunk to the last deletes its
 * item). Oils and bombs are never restored (T1's reading).
 */
async function landSecondBrewing(actor, plan) {
  const lines = [];
  const { brewsMadeBy, whSpellDC } = await import("./witch-hunter-brews.mjs");
  const own = brewsMadeBy(actor).filter(({ actor: a }) => a === actor).map(({ item }) => item);
  const create = [];
  for (const row of plan.rows ?? []) {
    const more = Math.max(0, int(row.to) - int(row.from));
    if (!more) continue;
    const mine = own.find(i => i.system?.identifier === row.identifier
      && int(i.flags?.[SCOPE]?.[BREWED_FLAG]?.generation) === int(plan.generation)
      && (i.flags?.[SCOPE]?.[BREWED_FLAG]?.type ?? null) === (row.type ?? null));
    if (mine) {
      await mine.update({ "system.quantity": Math.max(0, int(mine.system?.quantity ?? 0)) + more });
      lines.push(t("AZEROTH.WhTalent.SecondBrewing.Restored", { name: mine.name, n: more }));
      continue;
    }
    create.push({ row, more });
  }
  if (create.length) {
    const pack = game.packs.get(GEAR_PACK);
    const index = pack ? await pack.getIndex({ fields: ["system.identifier"] }) : [];
    const ids = index.filter(e => create.some(c => c.row.identifier === e.system?.identifier)).map(e => e._id);
    const docs = ids.length ? await pack.getDocuments({ _id__in: ids }) : [];
    const data = [];
    for (const { row, more } of create) {
      const doc = docs.find(d => d.system?.identifier === row.identifier);
      if (!doc) {
        lines.push(t("AZEROTH.WhTalent.SecondBrewing.NoPack", { name: brewOf(row.identifier)?.name ?? row.identifier }));
        continue;
      }
      const raw = doc.toObject();
      delete raw._id;
      delete raw.folder;
      delete raw.sort;
      raw.system.quantity = more;
      raw.system.container = null;
      if (row.name) raw.name = row.name;
      raw.flags = { ...(raw.flags ?? {}), [SCOPE]: { ...(raw.flags?.[SCOPE] ?? {}), [BREWED_FLAG]: {
        maker: actor.uuid, generation: int(plan.generation), brewed: int(row.to), type: row.type ?? null,
        school: row.school ?? null, spellDC: whSpellDC(actor), tier: tierOf(actor)
      } } };
      data.push(raw);
    }
    const made = data.length ? await actor.createEmbeddedDocuments("Item", data) : [];
    for (const item of made) lines.push(t("AZEROTH.WhTalent.SecondBrewing.Restored", { name: item.name, n: int(item.system?.quantity) }));
  }
  return lines.length ? lines : [t("AZEROTH.WhTalent.SecondBrewing.Nothing", { name: actor.name })];
}

/**
 * **MOUNTAIN BEAR'S MINUTE** (*your attacks with a weapon in two hands deal extra damage equal to your tier, and you
 * gain 1 Armor Point on every location*): one effect on the hunter for a minute of the fight or the world's clock,
 * carrying the Armor Points as `final` adds and the flag the attack door reads (`witchHunterBlow`).
 */
async function landMountainBear(actor, item) {
  const { minuteSpan } = await import("./durations.mjs");
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: MOUNTAIN_BEAR.name, img: item?.img ?? "icons/svg/aura.svg", origin: actor.uuid,
    description: `<p>${foundry.utils.escapeHTML(t("AZEROTH.WhTalent.MountainBear.Effect", { n: tierOf(actor) }))}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: mountainBearChanges() },
    ...(minuteSpan(actor, MOUNTAIN_BEAR.minutes) ?? {}),
    flags: { [SCOPE]: { [MOUNTAIN_BEAR_FLAG]: { tier: tierOf(actor), by: actor.uuid } } }
  }]);
  return [t(made ? "AZEROTH.WhTalent.MountainBear.Laid" : "AZEROTH.WhTalent.MountainBear.NotLaid", { name: actor.name, n: tierOf(actor) })];
}

/** Whether Mountain Bear's minute stands on an actor (the attack door's one question). */
export function mountainBearStands(actor) {
  return (actor?.effects ?? []).some(e => e.active !== false && e.disabled !== true && e.flags?.[SCOPE]?.[MOUNTAIN_BEAR_FLAG]);
}

/* ------------------------------------------------------------------ */
/*  A brew used as a free action                                        */
/* ------------------------------------------------------------------ */

/**
 * **PRACTICED HANDS AND CLUSTER BOMB, CLAIMED BEFORE THE BUDGET** (04): the round's next mark of whichever talent
 * frees this Use (`freeBrewBy`), written through the combatant's queued door (`markRoundOnce`); a mark another door
 * took first frees nothing. Answers the talent's name, or null for a Use that is the Half-Action 08 §12 prices.
 *
 * @param {{actor: Actor, row: {kind: string}|null}} o
 * @returns {Promise<string|null>}
 */
export async function freeBrewFor({ actor, row } = {}) {
  const facts = roundFacts(actor);
  if (!facts.combatant?.isOwner) return null;
  const free = freeBrewBy({
    kind: row?.kind ?? null, inFight: true,
    practicedHands: rank(actor, PRACTICED_HANDS), clusterBomb: rank(actor, CLUSTER_BOMB),
    used: facts.used, thrown: facts.used.includes(`${BOMB_TURN_MARK}@${facts.turn}`), nextMark: nextRoundMark
  });
  if (!free) return null;
  const marked = await facts.combatant.markRoundOnce(free.mark);
  return marked?.added === true ? free.name : null;
}

/** Record a bomb thrown this turn on the round's record (Cluster Bomb's *after you throw a bomb*), once a turn. */
export async function markBombThrown(actor) {
  const facts = roundFacts(actor);
  if (!facts.combatant?.isOwner) return;
  const mark = turnMark(BOMB_TURN_MARK, facts.turn, facts.used, 1);
  if (mark) await facts.combatant.markRoundOnce(mark);
}

/* ------------------------------------------------------------------ */
/*  A blow taken                                                        */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A BLOW TAKEN SETS OFF FOR A WITCH HUNTER** (04's Bear's Wrath: *Once a round per rank, when a melee attack
 * hits you, you gain 1 Tempo*; Bear's Endurance: *The first time in a fight that your Health drops below half, you
 * gain temporary Health*), from the struck door. Bear's Wrath's mark is the round's record; Bear's Endurance's once
 * a fight is the counter the talent grants. Answers the pool rows to ADD, in the struck door's shape.
 *
 * @param {{actor: Actor, before?: number, after?: number, max?: number, attack?: boolean, messageId?: string|null}} o
 * @returns {Promise<Array<{itemId: string, kind: string, name: string, value: number}>>}
 */
export async function whWhenStruck({ actor, before = 0, after = 0, max = 0, attack = false, messageId = null } = {}) {
  if (!actor || actor.type !== "character" || !actor.isOwner) return [];
  const out = [];
  const wrath = rank(actor, BEARS_WRATH);
  if (wrath > 0) {
    const facts = roundFacts(actor);
    const melee = (game.messages?.get?.(messageId)?.flags?.[SCOPE]?.strike?.rangeKind ?? null) === "melee";
    const gain = facts.combatant?.isOwner ? wrathGain({ rank: wrath, melee, attack, used: facts.used, nextMark: nextRoundMark }) : null;
    const tempo = gain ? (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === BEARS_WRATH.pool) ?? null : null;
    if (gain && tempo && (await facts.combatant.markRoundOnce(gain.mark))?.added === true) {
      out.push({ itemId: tempo.itemId, kind: "momentum", name: tempo.name, value: gain.tempo });
      ui.notifications?.info(t("AZEROTH.WhTalent.BearsWrath.Gained", { name: actor.name, n: gain.tempo }));
    }
  }
  const endurance = rank(actor, BEARS_ENDURANCE);
  if (endurance > 0 && actor.activeFight?.()?.started && droppedBelowHalf({ before, after, max })) {
    const held = (actor.items ?? []).find(i => i.type === "talent" && i.system?.identifier === BEARS_ENDURANCE.identifier && i.system?.className === "Witch Hunter") ?? null;
    const counter = held ? (actor.grantedFeature?.(held.id) ?? null) : null;
    const left = int(counter?.system?.uses?.value);
    if (counter && left > 0) {
      await counter.update({ "system.uses.value": left - 1 });
      const granted = await actor.grantTemporaryHealth(enduranceTemp({ rank: endurance, tier: tierOf(actor) }), { source: BEARS_ENDURANCE.name, span: "encounter" });
      // **ITS OWN RECORD, WHERE IT LANDS** (the architect review's E, wave 2d-A, D-2134): the grant happens inside the
      // struck door, so no Use card records it; a public event card spoken from the hunter's token carries its picture
      // (`bears-endurance`), and only once the temporary Health has landed.
      if (granted?.landed) {
        const { postFeatureEvent } = await import("./feature-events.mjs");
        await postFeatureEvent({ actor, token: actor.getActiveTokens?.(true)?.[0] ?? null, featureKey: BEARS_ENDURANCE.identifier,
          lines: [t("AZEROTH.WhTalent.BearsEndurance.Gained", { name: actor.name, talent: BEARS_ENDURANCE.name, n: granted.temp })] });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  A hit                                                               */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A WITCH HUNTER'S HIT LANDS BY TALENT** (04's Thunderous Swing: *When you hit with a weapon in two hands, the
 * target is pushed 5 feet away from you per rank*): each creature the card records moved through the one forced-move
 * door, recorded for a Parry or Afterimage to take back, and said on the card's row. Answers fired rows.
 *
 * @param {{actor: Actor, list?: object[], hit?: boolean, weaponId?: string|null, weaponAttack?: boolean,
 *   recordHit?: Function, tokenDocOf?: Function, actorOf?: Function}} o
 * @returns {Promise<Array<{key: string, name: string, text: string}>>}
 */
export async function whTalentsOnHit({ actor, list = [], hit = false, weaponId = null, weaponAttack = true, recordHit = () => {}, tokenDocOf = () => null, actorOf = () => null } = {}) {
  const fired = [];
  if (!hit || !weaponAttack || !list.length) return fired;
  const weapon = weaponId ? actor.items?.get?.(weaponId) ?? null : null;
  if (!weapon || isUnarmed(weapon)) return fired;
  const swing = rank(actor, THUNDEROUS_SWING);
  if (swing > 0 && actor.gateFacts?.()?.wield?.bothHands === true) {
    const { forceMove, forcedWords } = await import("./forced-movement.mjs");
    const striker = actor.getActiveTokens?.(false, true)?.[0] ?? null;
    const words = [];
    for (const [ti, target] of list.entries()) {
      const token = tokenDocOf(target);
      const name = target?.name ?? actorOf(target)?.name ?? "";
      const before = token ? { x: token.x, y: token.y } : null;
      const from = striker && token && striker.parent === token.parent ? (striker.getCenterPoint?.() ?? null) : null;
      // The push's record names the talent (`key: "thunderous-swing"`), so its picture is Thunderous Swing's (wave 3).
      const cue = { key: "thunderous-swing", by: striker ? { sceneId: striker.parent?.id ?? null, tokenId: striker.id } : null };
      const r = from ? await forceMove({ token, from, feet: thunderousFeet(swing), toward: "away", by: actor, name, cue }) : { name, feet: 0, moved: false, reason: "unmeasured" };
      if (r.moved && r.feet > 0 && before) recordHit(ti, { kind: "push", landed: true, from: before });
      words.push(forcedWords(r, { toward: "away", source: THUNDEROUS_SWING.name }));
    }
    fired.push({ key: "talent", name: THUNDEROUS_SWING.name, text: words.join(" ") });
  }
  return fired;
}

/* ------------------------------------------------------------------ */
/*  The Signs' talents                                                  */
/* ------------------------------------------------------------------ */

/**
 * **FIRESTREAM'S CONE, LEFT ALIGHT** (*stays alight until the start of your next turn. A creature that enters it or
 * starts its turn in it takes Fire damage equal to your rank*): the Ember Sign's cone set down where it was aimed, an
 * area that strikes (D-756's tick: every creature, on entry and at a turn's start, for the round to the hunter's next
 * turn), the sweep taking it off when its round is over. Answers whether it was placed; the cone's own cue-only
 * drawing is not placed beside it.
 *
 * @param {{actor: Actor, item: Item, plan: object, posted: ChatMessage}} o
 * @returns {Promise<boolean>}
 */
export async function placeFirestream({ actor, item, plan, posted } = {}) {
  const lingers = plan?.sign === "ember" ? (plan.effect?.lingers ?? null) : null;
  if (!lingers || !plan.facing || !posted || !globalThis.canvas?.scene) return false;
  const tick = firestreamTick({ rank: int(lingers.damage?.amount), empty: emptyAreaTick() });
  if (!tick) return false;
  try {
    const { regionFlagsFromCard } = await import("../dice/chat.mjs");
    const { placeArea } = await import("../canvas/regions.mjs");
    const own = actor?.getActiveTokens?.(true)?.[0] ?? null;
    const base = regionFlagsFromCard(posted, actor, item);
    await placeArea({
      item, areaText: plan.facing.area, name: FIRESTREAM.name, scene: canvas.scene,
      origin: plan.facing.origin, rotation: plan.facing.rotation, token: own && own.document?.parent?.id === canvas.scene.id ? own : null, attach: false,
      title: t("AZEROTH.WhTalent.Firestream.Area", { name: actor.name }),
      // `featureKey: "firestream"` after the card's own, so the lingering cone files under its own picture (wave 3).
      // **ITS PRIVACY PAIR IS THE SIGN'S CARD'S** (the architect review's A3, wave 2d-A, D-2133): the card is filed under
      // `ember-sign` (`witchHunterCardKey`), so the Region names that key for the pair the director holds its cue for
      // (`animation/records.mjs#privacyKeyOfRegion`), never `firestream`, which no card announces.
      flags: { ...base, featureKey: "firestream", [REGION_PRIVACY_FLAG]: signAnimationKey(plan.sign), areaTick: tick, lasts: { rounds: FIRESTREAM.rounds }, sustained: false,
        spell: { ...(base.spell ?? {}), name: FIRESTREAM.name, school: null, tier: null, takesSpellpower: false, feature: true } }
    });
    return true;
  } catch (err) {
    console.warn("azeroth-rpg | Firestream's cone could not be placed", err);
    ui.notifications?.warn(t("AZEROTH.WhTalent.Firestream.NotPlaced", { name: FIRESTREAM.name }));
    return false;
  }
}

/**
 * **BURSTING ROWAN** (*When you use the Rowan Sign, each enemy within 5 feet of the creature that gains the Ward takes
 * Fire damage equal to your rank plus your tier*): on the hunter's client where it is the GM, else on the active GM's
 * through `WH_TALENTS_QUERY`, which works every number out again off the hunter's sheet. Answers the card's lines.
 *
 * @param {{hunter: Actor, target: Actor}} o
 * @returns {Promise<string[]>}
 */
export async function burstFromRowan({ hunter, target } = {}) {
  if (rank(hunter, BURSTING_ROWAN) < 1 || !target) return [];
  if (game.user?.isGM) return burstHere({ hunter, target });
  const done = await askGM({ act: "burst", hunterUuid: hunter.uuid, targetUuid: target.uuid });
  return Array.isArray(done?.lines) ? done.lines.map(String) : [t("AZEROTH.WhTalent.BurstingRowan.NoGM", { name: BURSTING_ROWAN.name })];
}

/** The burst, here: every enemy of the hunter within 5 feet of the warded creature's token, through the area door. */
export async function burstHere({ hunter, target } = {}) {
  const amount = burstDamage({ rank: rank(hunter, BURSTING_ROWAN), tier: tierOf(hunter) });
  if (!amount) return [];
  const from = target.getActiveTokens?.(true)?.[0] ?? null;
  if (!from) return [t("AZEROTH.WhTalent.BurstingRowan.NoToken", { name: BURSTING_ROWAN.name, target: target.name })];
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const { strikeFromArea } = await import("./area-strikes.mjs");
  const near = creaturesWithin(hunter, BURSTING_ROWAN.feet, { from, who: "enemy" }).filter(r => r.actor && r.actor.uuid !== target.uuid && r.actor.uuid !== hunter.uuid);
  if (!near.length) return [t("AZEROTH.WhTalent.BurstingRowan.Nobody", { name: BURSTING_ROWAN.name })];
  const lines = [];
  for (const r of near) {
    lines.push(...await strikeFromArea({
      actor: r.actor, caster: hunter,
      spell: { name: BURSTING_ROWAN.name, school: null, takesSpellpower: false, feature: true },
      damage: { rating: amount, school: BURSTING_ROWAN.type }
    }));
  }
  // The burst's own record, where it lands (wave 3's `featureKey: "bursting-rowan"`): the warded creature's token and
  // the enemies it struck.
  const { postFeatureEvent } = await import("./feature-events.mjs");
  await postFeatureEvent({ actor: hunter, token: from, featureKey: "bursting-rowan", lines, targets: near.map(r => r.token) });
  return lines;
}

/* ------------------------------------------------------------------ */
/*  A walk                                                              */
/* ------------------------------------------------------------------ */

/**
 * **LEAPING STRIKE'S PROMISE** (*When you have moved at least 10 feet this turn, your next attack this turn deals 1
 * more damage per rank*): the turn's metered feet, after the move door's queue has answered; the round's record
 * claims it once a turn (MY READING), and the promise is the next-attack lane's (`effects/next-attack.mjs`), held to
 * the turn and taken by the next attack.
 *
 * @param {Actor} actor
 * @param {{combatant: Combatant|null, feet?: number}} o
 */
export async function layLeapingStrike(actor, { combatant = null, feet = 0 } = {}) {
  const grant = leapingGrant({ rank: rank(actor, LEAPING_STRIKE), feet });
  if (!grant || !combatant?.isOwner) return null;
  const fight = combatant.combat ?? null;
  const record = combatant.getFlag?.(SCOPE, "round") ?? null;
  const used = record && record.number === fight?.round ? (record.once ?? []) : [];
  const mark = turnMark(LEAPING_STRIKE.identifier, fight?.turn ?? null, used, 1);
  if (!mark || (await combatant.markRoundOnce(mark))?.added !== true) return null;
  const { layNextAttack } = await import("./next-attack.mjs");
  return layNextAttack(actor, [grant]);
}

/* ------------------------------------------------------------------ */
/*  The Apply, under Nine Lives                                         */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE APPLY LANDS ON A NINE LIVES HOLDER** (*no damage on a success and half on a failure*), on a card whose
 * damage halves on a passed Test: the Test the card recorded for the creature, its Resilience read off the Test's own
 * roll (`roll.options.resilience`, stamped by every Resilience door). `none`, `half`, or null for the Apply's own
 * reading.
 *
 * @param {Actor|null} actor  the creature the Apply lands on
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @param {object|null} ref  the card row, or a token's ids
 * @returns {"none"|"half"|null}
 */
export function nineLivesFor(actor, flags = {}, ref = null) {
  if (!actor || whRankOfItems(actor.items ?? [], NINE_LIVES.identifier) < 1 || flags?.halfOnPass !== true) return null;
  const record = resistRecordOn(flags.resists ?? null, ref);
  if (!record) return null;
  const result = record.resultId ? game.messages?.get?.(record.resultId) ?? null : null;
  const resilience = result?.rolls?.[0]?.options?.resilience ?? null;
  return nineLivesApply({ holds: true, halfOnPass: true, resilience, success: typeof record.success === "boolean" ? record.success : null });
}

/* ------------------------------------------------------------------ */
/*  The GM's handler                                                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A CLIENT ASKS THE GM TO WRITE FOR A TALENT** (`WH_TALENTS_QUERY`), judged again here off the hunter's own
 * sheet: the asker owns the hunter, the hunter holds the talent, and the numbers are this client's.
 */
export async function witchHunterTalentsQueryHandler(payload = {}, { user = null } = {}) {
  if (!game.user?.isGM) return { ok: false };
  const hunter = payload?.hunterUuid ? await fromUuid(payload.hunterUuid) : null;
  if (!hunter || (user && !user.isGM && !hunter.testUserPermission(user, "OWNER"))) return { ok: false };
  if (payload.act === "burst") {
    const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
    if (!target || rank(hunter, BURSTING_ROWAN) < 1) return { ok: false, lines: [] };
    return { ok: true, lines: await burstHere({ hunter, target }) };
  }
  return { ok: false };
}

/** Whether Bursting Rowan's burst would need a GM this client cannot reach (`judgeRowan` asks it before paying). */
export function burstNeedsGM(hunter) {
  return rank(hunter, BURSTING_ROWAN) > 0 && gmMissing([{ isOwner: false }]);
}
