/**
 * **WHAT A BOSS ACTION DOES BEYOND THE DESCRIPTOR** (14 §1, D-809).
 *
 * `rules/boss-actions.mjs` is the law and the table; this module is every door its
 * `plan` names, in the order a press runs them:
 *
 * 1. `prepareBossPress` - BEFORE anything is spent (D-768's order): the creatures a
 *    circle about the Boss gathers where the GM targeted none, every pick a door asks
 *    for (a space, a facing, an ally, a class, a corpse), and the refusals in words -
 *    a door whose pick is dismissed, whose target is out of range, or whose write would
 *    reach nobody (`rules/gm-writes.mjs#gmAbsentFor`), spends nothing.
 * 2. `bossCardFlags` - what the card carries for the doors that land LATER: a forced
 *    move, a drain, a pool, a Sunder, a Bane, a side switch, a mark on a failed Test;
 *    an escape on the Entangled it lays; an attack's allowance, Boon and landing; a
 *    zone's tick and ground.
 * 3. `afterBossPress` - what lands AT the press: a relocation, a push, Power gained or
 *    drained, the next attack's miss, a Boon or a Bane laid, Armor Points counted as 0,
 *    copies placed, bodies raised where creatures fell.
 * 4. `bossFailLands` - what a failed Resilience Test on the card lands, on the client
 *    that rolled it (the creature's owner), through `dice/chat.mjs`' ability branch.
 *
 * And the standing reads: `takeMissNext` and `takeMarkedExtra` at the attack's roll,
 * `refuseCannotAttack` at both attack doors, `advanceBossGrips` at the holder's turn,
 * `bossTurnSkip` and `bossRoundStart` at the tracker's turn and round.
 *
 * **A creature's ability takes the same doors** where its descriptor carries a plan
 * (`rules/creature-plans.mjs`, D-811): the three steps above, and nothing of a Boss Action's
 * points.
 *
 * **One write door.** A write on a creature this client does not own goes to the
 * active GM through `azeroth-rpg.bossDoor`, judged there against the user's own
 * creature; a write on one it owns is made here.
 */

import { AZEROTH } from "../config.mjs";
import { cleanBossPlan } from "../rules/boss-actions.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { manaPool } from "../rules/pools.mjs";
import { areaFor } from "../rules/areas.mjs";
import { cleanEscape, ESCAPE_FLAG } from "../rules/escapes.mjs";
import { emptyAreaTick, emptyCheck } from "../rules/area-ticks.mjs";
import { untilEndOfNextTurnOrRound, untilEndOfRound, untilEncounterEnd } from "./durations.mjs";
import { layBane, layBoon } from "./banes.mjs";
import { forceMove, forcedWords } from "./forced-movement.mjs";
import { placeSummon } from "../documents/summon.mjs";
import { actorFolder } from "../documents/bound.mjs";
import { ringSpots } from "../rules/summon-places.mjs";
import { feetToPoint, feetApart as footprintFeet } from "../canvas/footprints.mjs";
import { creaturesInArea, reachOfActor } from "../canvas/engaged.mjs";
import { EXPOSED_FLAG } from "../rules/class-talents.mjs";

export const BOSS_DOOR_QUERY = "azeroth-rpg.bossDoor";
/** On a creature: the next attack against it this round misses (Shadow Step, Step Aside, Gyth). */
export const MISS_NEXT_FLAG = "missNext";
/** On an Entangled: the holder's grip strikes at the start of the holder's turns (Grab). */
export const BOSS_GRIP_FLAG = "bossGrip";
/** On a carrier effect: the combatant fights on another side while it stands (Bind, Take the Mind). */
export const SIDE_SWITCH_FLAG = "sideSwitch";
/** On a carrier effect: the creature cannot attack while it stands (Hex the Loudest). */
export const CANNOT_ATTACK_FLAG = "cannotAttack";
/** On a carrier effect: the creature is away until the start of a round (Sent to a Room). */
export const AWAY_FLAG = "bossAway";
/** On a combatant: the round it arrives in (a body that *acts on his side from the next round*). */
export const ARRIVES_FLAG = "arrives";
/** On a world actor: the Boss it is a copy of (Three Places at Once). */
export const BOSS_COPY_FLAG = "bossCopy";
/** On a carrier effect: a mark the table enforces (Fight Me). */
export const REMINDER_FLAG = "bossReminder";

const SCOPE = "azeroth-rpg";
/** The kind of Test Class Call's Bane is laid on: a Bane, never a roll this module builds. */
const CASTING_TESTS = "casting";

/* ------------------------------------------------------------------ */
/*  Reading the field                                                  */
/* ------------------------------------------------------------------ */

/** The token a creature stands on, on the viewed scene first. */
function tokenOf(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token.object ?? null;
  return actor.getActiveTokens?.(true)?.[0] ?? null;
}

/** The token a card's target snapshot names. */
function snapshotToken(t) {
  const scene = (t?.sceneId && game.scenes?.get(t.sceneId)) || canvas?.scene || null;
  return t?.tokenId ? (scene?.tokens?.get(t.tokenId)?.object ?? null) : null;
}

/** The actor a target snapshot names. */
function snapshotActor(t) {
  const scene = (t?.sceneId && game.scenes?.get(t.sceneId)) || canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors?.get(t.actorId) : null) ?? null;
}

/** The fight a creature stands in, or null. */
function fightOf(actor) {
  return actor?.activeFight?.() ?? null;
}

/** The side a creature fights on: its combatant's in its fight, else its token's disposition. */
export function sideOfActor(actor) {
  const fight = fightOf(actor);
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  if (combatant?.side) return combatant.side;
  const d = tokenOf(actor)?.document?.disposition ?? actor?.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;
  return d === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? "friendly" : "hostile";
}

/** Whether a creature has fallen: defeated in the tracker, dead, or a creature at 0 Health. */
function fallen(token) {
  const actor = token?.actor ?? null;
  if (!actor) return false;
  if (token.combatant?.isDefeated) return true;
  if (actor.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") || actor.statuses?.has?.("dead")) return true;
  return actor.type === "npc" && (actor.system?.health?.value ?? 1) <= 0;
}

/**
 * Every creature this one has named its quarry, with the effects that say so (D-811): the
 * world's actors and every token on every scene, since a quarry is the namer's whoever the
 * board is showing. Sorted by uuid, so a list a person reads never wobbles.
 *
 * @param {Actor} namer
 * @param {string} source  the ability's name
 * @returns {Array<{actor: Actor, ids: string[]}>}
 */
function quarriesOf(namer, source) {
  const seen = new Map();
  const visit = actor => {
    if (!actor || seen.has(actor.uuid)) return;
    const ids = (actor.effects ?? []).filter(e => {
      const raw = e.getFlag?.(SCOPE, EXPOSED_FLAG);
      return raw?.by === namer.uuid && raw?.source === source;
    }).map(e => e.id);
    seen.set(actor.uuid, ids.length ? { actor, ids } : null);
  };
  for (const actor of game.actors ?? []) visit(actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink) visit(token.actor);
  return [...seen.values()].filter(Boolean).sort((a, b) => a.actor.uuid.localeCompare(b.actor.uuid));
}

/** A grid-snapped top-left corner for a token whose centre should stand at `point`. */
function cornerFor(tokenDoc, point) {
  const scene = tokenDoc.parent;
  const w = (tokenDoc.width ?? 1) * (scene.grid.sizeX ?? scene.grid.size);
  const h = (tokenDoc.height ?? 1) * (scene.grid.sizeY ?? scene.grid.size);
  const raw = { x: point.x - w / 2, y: point.y - h / 2 };
  try {
    return scene.grid.getSnappedPoint(raw, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
  } catch {
    return raw;
  }
}

/* ------------------------------------------------------------------ */
/*  The one write door                                                 */
/* ------------------------------------------------------------------ */

/**
 * The GM-side handler. Every write names the creature it is made BY (`byUuid`), which
 * the user has to own, and the document it lands on. Throws with the reason.
 */
export async function bossDoorQueryHandler({ op = null, byUuid = null, ...data } = {}, { user = null } = {}) {
  const by = byUuid ? await fromUuid(byUuid) : null;
  if (user && (!by || by.documentName !== "Actor" || !by.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  }
  return writeHere(op, data, by);
}

async function writeHere(op, data, by) {
  const actor = data.actorUuid ? await fromUuid(data.actorUuid) : null;
  switch (op) {
    case "createEffect": {
      if (!actor) return null;
      const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data.effect]);
      return effect?.id ?? null;
    }
    case "deleteEffects": {
      if (!actor) return 0;
      const ids = (data.effectIds ?? []).filter(id => actor.effects.has(id));
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
      return ids.length;
    }
    case "updateEffect": {
      const effect = actor?.effects?.get(data.effectId) ?? null;
      if (!effect) return false;
      await effect.update(data.update);
      return true;
    }
    case "pool": {
      if (!actor) return null;
      const snapshot = actor.poolSnapshot?.() ?? [];
      const pool = data.kind === "mana" ? manaPool(snapshot) : snapshot.find(p => p.kind === data.kind) ?? null;
      if (!pool) return null;
      const next = Math.max(0, Math.min(pool.max ?? Infinity, (pool.value ?? 0) + Math.trunc(Number(data.delta) || 0)));
      await actor.updatePool({ itemId: pool.itemId ?? null, kind: pool.kind, value: next });
      return { from: pool.value ?? 0, to: next };
    }
    case "heal": {
      if (!actor) return 0;
      const before = actor.system?.health?.value ?? 0;
      await actor.applyHealing(Math.max(0, Math.trunc(Number(data.amount) || 0)), { from: by ?? null });
      return (actor.system?.health?.value ?? 0) - before;
    }
    case "move": {
      const token = data.tokenUuid ? await fromUuid(data.tokenUuid) : null;
      if (!token) return false;
      const done = await token.move({ x: Math.round(data.x), y: Math.round(data.y), action: "displace" });
      return done !== false;
    }
    case "deleteTokens": {
      const scene = game.scenes?.get(data.sceneId ?? "") ?? null;
      const ids = (data.tokenIds ?? []).filter(id => scene?.tokens?.has(id));
      if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
      return ids.length;
    }
    case "side": {
      const combat = game.combats?.get(data.combatId ?? "") ?? null;
      const combatant = combat?.combatants?.get(data.combatantId ?? "") ?? null;
      if (!combatant) return false;
      await combatant.setSide(data.side ?? null);
      return true;
    }
    case "copies":
      return placeCopiesHere(data, by);
    default:
      throw new Error(`bossDoor: no such write ${op}`);
  }
}

/**
 * Write through the one door: here where this client owns what is written (or is the
 * GM), else on the active GM's client. Answers null and says why where nobody can.
 */
async function bossWrite(op, data, { by = null, owned = false } = {}) {
  try {
    if (game.user?.isGM || owned) return await writeHere(op, data, by);
    const gm = game.users?.activeGM ?? null;
    if (!gm) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Boss.NoGM"));
      return null;
    }
    return await gm.query(BOSS_DOOR_QUERY, { op, byUuid: by?.uuid ?? null, ...data }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err?.message ?? String(err));
    return null;
  }
}

/** Whether a set of creatures can all be written: by this client, or by a GM online. */
function writable(actors = []) {
  return !gmAbsentFor({ owned: actors.map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/* ------------------------------------------------------------------ */
/*  1. Before anything is spent                                        */
/* ------------------------------------------------------------------ */

/** A refusal in words, with nothing spent. */
function refuse(key, data = {}) {
  ui.notifications?.warn(game.i18n.format(key, data));
  return { ok: false };
}

/** A pick dismissed: nothing spent, nothing said beyond the hint coming down. */
const dismissed = () => ({ ok: false, dismissed: true });

/**
 * The one chooser (`workflows.chooseOption`, D-673), answering the INDEX of the option
 * picked, or null where it was dismissed: the chooser hands back the option itself.
 */
async function pickIndex(id, name, options) {
  const { chooseOption } = await import("../dice/workflows.mjs");
  const picked = await chooseOption({ id, name }, options);
  const index = picked ? options.indexOf(picked) : -1;
  return index >= 0 ? index : null;
}

/**
 * **EVERYTHING A PRESS JUDGES AND PICKS BEFORE IT SPENDS.**
 *
 * @param {{actor: Actor, row: object, targets: object[]}} o
 * @returns {Promise<{ok: boolean, targets?: object[], pre?: object}>}
 */
export async function prepareBossPress({ actor, row, targets = [] } = {}) {
  const plan = cleanBossPlan(row?.automation?.plan);
  const name = row?.name ?? "";
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  let list = [...(targets ?? [])];
  const pre = {};
  const own = tokenOf(actor);

  // **A CIRCLE ABOUT THE BOSS** (*every creature within 20 feet*): measured where the GM
  // targeted nobody, through the feature door's own reading (`canvas/engaged.mjs
  // #creaturesInArea`); targets chosen by hand stand.
  if (!list.length && plan.gather) {
    const feet = plan.gather.feet === "reach" ? reachOfActor(actor) : plan.gather.feet;
    const found = creaturesInArea(actor, { who: plan.gather.who, origin: "self", feet }) ?? [];
    // *Each ally within 10 feet of it* takes the user too (D-755: the user counts as an ally
    // unless the words say *other than you*; D-811); every other circle is about the user.
    list = targetSnapshots(found.filter(r => plan.gather.who === "ally" || r.token !== own).map(r => r.token));
  }

  // **EXACTLY SO MANY, SO NEAR** (D-811; 14's Counterspell: *a Casting Test it can see within
  // 30 feet*): the creatures targeted by hand, counted and measured before anything is spent.
  if (plan.target) {
    if (list.length !== plan.target.count) return refuse("AZEROTH.Boss.Targets", { name, count: plan.target.count, feet: plan.target.feet });
    for (const t of list) {
      const tok = snapshotToken(t);
      const d = own && tok ? footprintFeet(own, tok) : null;
      if (d === null || d > plan.target.feet) return refuse("AZEROTH.Boss.TargetTooFar", { name, feet: plan.target.feet, target: tok?.name ?? t?.name ?? "" });
    }
  }

  const door = plan.door ?? null;
  const needToken = ["relocateSelf", "selfLine", "gyth", "copies", "allyAttack", "raise", "disengage"].includes(door);
  if (needToken && !own) return refuse("AZEROTH.Boss.NeedsToken", { name, boss: actor.name });

  if (door === "relocateSelf" || door === "gyth") {
    const feet = door === "gyth" ? (actor.system?.flyingSpeed ?? actor.system?.speed ?? 0) : plan.feet;
    const { pickPoint } = await import("../canvas/place.mjs");
    const point = await pickPoint({
      hint: game.i18n.format("AZEROTH.Boss.PickSpace", { name, feet }),
      accept: p => {
        const d = feetToPoint(own, p);
        if (d !== null && d <= feet) return true;
        ui.notifications?.warn(game.i18n.format("AZEROTH.Boss.TooFar", { name, feet }));
        return false;
      }
    });
    if (!point) return dismissed();
    pre.to = point;
    // Gyth: *the next attack against either of them* - the mount a GM targets with Rend.
    if (door === "gyth") pre.also = list.map(snapshotActor).filter(Boolean);
  }

  if (door === "relocateTarget" || door === "away" || door === "enfeeble" || door === "marked" || door === "quarry") {
    if (list.length !== 1) return refuse("AZEROTH.Boss.OneTarget", { name });
    const victim = snapshotActor(list[0]);
    const vt = snapshotToken(list[0]);
    if (!victim || !vt) return refuse("AZEROTH.Boss.OneTarget", { name });
    if (plan.feet && own) {
      const d = footprintFeet(own, vt);
      if (d === null || d > plan.feet) return refuse("AZEROTH.Boss.TargetTooFar", { name, feet: plan.feet, target: vt.name });
    }
    if (!writable([victim])) return refuse("AZEROTH.Boss.NoGM", {});
    pre.victim = victim;
    pre.victimToken = vt;
    if (door === "relocateTarget" || door === "away") {
      const { pickPoint } = await import("../canvas/place.mjs");
      const point = await pickPoint({ hint: game.i18n.format("AZEROTH.Boss.PickPlace", { name, target: vt.name }) });
      if (!point) return dismissed();
      pre.to = point;
    }
  }

  if (door === "selfLine") {
    const area = areaFor(row.automation?.area ?? "");
    if (!area) return refuse("AZEROTH.Area.NoArea", {});
    const { pickFacing } = await import("../canvas/place.mjs");
    const origin = { x: own.center.x, y: own.center.y };
    const rotation = await pickFacing({ origin, area, scene: own.document.parent, label: name });
    if (rotation === null || rotation === undefined) return dismissed();
    pre.rotation = rotation;
    pre.lineFt = area.distanceFt;
    if (!list.length) {
      const { regionDataFor } = await import("../canvas/regions.mjs");
      const data = regionDataFor({ areaText: row.automation.area, name, scene: own.document.parent, token: own, origin, rotation, attach: false });
      const region = data ? new CONFIG.Region.documentClass(data, { parent: own.document.parent }) : null;
      const inside = (creaturesInArea(actor, { who: "creature", origin: "self", feet: area.distanceFt }) ?? [])
        .filter(r => r.token !== own && region && r.token.document.testInsideRegion(region));
      list = targetSnapshots(inside.map(r => r.token));
    }
  }

  if (door === "allyAttack") {
    const allies = (creaturesInArea(actor, { who: "ally", origin: "self", feet: plan.feet ?? 30 }) ?? [])
      .filter(r => r.token !== own && r.actor?.type === "npc" && (r.actor.system?.attacks ?? []).length);
    if (!allies.length) return refuse("AZEROTH.Boss.NoAlly", { name, feet: plan.feet ?? 30 });
    const pickAlly = allies.length === 1 ? 0 : await pickIndex(`boss-${actor.id}-ally`, name,
      allies.map(r => ({ name: r.token.name, description: `<p>${r.token.name}</p>` })));
    if (!Number.isInteger(pickAlly) || !allies[pickAlly]) return dismissed();
    const ally = allies[pickAlly];
    const attacks = ally.actor.system.attacks;
    const pickLine = attacks.length === 1 ? 0 : await pickIndex(`boss-${actor.id}-line`, name,
      attacks.map(a => ({ name: a.name, description: `<p>${a.name}</p>` })));
    if (!Number.isInteger(pickLine) || !attacks[pickLine]) return dismissed();
    pre.ally = ally.actor;
    pre.attackIndex = pickLine;
  }

  if (door === "classCall") {
    const pack = game.packs.get("azeroth-rpg.classes");
    const names = pack ? [...(await pack.getIndex())].map(e => e.name).sort() : [];
    if (!names.length) return refuse("AZEROTH.Boss.NoClasses", { name });
    const pick = await pickIndex(`boss-${actor.id}-class`, name, names.map(n => ({ name: n, description: `<p>${n}</p>` })));
    if (!Number.isInteger(pick) || !names[pick]) return dismissed();
    pre.className = names[pick];
    const fight = fightOf(actor);
    pre.holders = (fight?.combatants ?? []).map(c => c.actor).filter(a => a && (a.classItems ?? []).some(c => c.name === pre.className));
    if (!writable(pre.holders)) return refuse("AZEROTH.Boss.NoGM", {});
  }

  if (door === "raise") {
    const scene = own.document.parent;
    const corpses = scene.tokens.filter(t => t.object && t.object !== own && fallen(t))
      .filter(t => {
        if (!plan.feet) return true;
        const d = footprintFeet(own, t.object);
        return d !== null && d <= plan.feet;
      })
      .filter(t => !plan.kinds?.length || plan.kinds.includes(String(t.actor?.system?.creatureType ?? (t.actor?.type === "character" ? "humanoid" : "")).toLowerCase()))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.id.localeCompare(b.id));
    if (!corpses.length) return refuse("AZEROTH.Boss.NoCorpse", { name, feet: plan.feet ?? "" });
    if (plan.all) pre.corpses = corpses;
    else {
      const pick = corpses.length === 1 ? 0 : await pickIndex(`boss-${actor.id}-corpse`, name,
        corpses.map(t => ({ name: t.name, description: `<p>${t.name}</p>` })));
      if (!Number.isInteger(pick) || !corpses[pick]) return dismissed();
      pre.corpses = [corpses[pick]];
    }
    if (!game.users?.activeGM && !game.user?.isGM) return refuse("AZEROTH.Boss.NoGM", {});
  }

  if (door === "copies" && !game.users?.activeGM && !game.user?.isGM) return refuse("AZEROTH.Boss.NoGM", {});

  // The writes a failed Test lands are made on the creature's owner's client; a forced
  // push at the press and a drain at the press reach every target from here.
  // A Boon or a Bane laid at the press is a write on every creature reached, too (D-811).
  if ((plan.forced?.on === "press" || plan.poolLoss?.on === "press" || plan.boon || plan.bane?.on === "press")
    && !writable(list.map(snapshotActor))) {
    return refuse("AZEROTH.Boss.NoGM", {});
  }
  return { ok: true, targets: list, pre };
}

/* ------------------------------------------------------------------ */
/*  2. What the card carries                                           */
/* ------------------------------------------------------------------ */

/**
 * **THE CARD'S RECORD OF THE PLAN**, laid beside the flags `useAbility` writes. Pure
 * apart from the uuids and the random cast id a zone needs for the area sweep.
 *
 * @param {{actor: Actor, row: object, targets: object[]}} o
 * @returns {object}  `flags.azeroth-rpg` keys
 */
export function bossCardFlags({ actor, row, targets = [] } = {}) {
  const a = row?.automation ?? {};
  const plan = cleanBossPlan(a.plan);
  const out = {};
  const on = {};
  for (const key of ["poolLoss", "sunder", "bane", "sideSwitch", "cannotAttack", "reminder"]) {
    if (plan[key]?.on === "fail") on[key] = plan[key];
  }
  if (plan.drain?.fixed) on.drainFixed = plan.drain.fixed;
  if (Object.keys(on).length) out.bossOnFail = { ...on, by: actor.uuid, name: row.name };
  // A forced move a failed Test makes, from the Boss's token (`dice/chat.mjs`' spell door's
  // own record).
  if (plan.forced?.on === "fail") out.forced = { on: "fail", feet: plan.forced.feet, toward: plan.forced.toward, from: "caster", sl: null, resilience: a.resist ?? null };
  // 04's Life Drain's record (the Legacy branches' door 25): the drainer healed by the damage door.
  if (plan.drain?.dealt) out.healsDealt = { by: actor.uuid, name: row.name };
  // The Entangled the card lays carries its escape (A1: *An action and a Reflex Resilience
  // Test ... at the DC the source names*), and Grab's grip.
  if (plan.escape && a.inflicts?.condition) {
    out.inflictEscapes = { [a.inflicts.condition]: cleanEscape({
      condition: a.inflicts.condition, on: "action", resilience: plan.escape.resilience, dc: plan.escape.dc,
      by: actor.uuid, source: row.name
    }) };
  }
  if (plan.grip) out.bossGrip = { by: actor.uuid, damage: plan.grip.damage, type: plan.grip.type, name: row.name };
  if (plan.attack) {
    const allowed = plan.attack.allowance === "reach" ? Math.max(1, targets.length) : (plan.attack.allowance ?? null);
    if (allowed) out.attacks = { allowed };
    out.bossAttack = { boons: plan.attack.boons ?? 0, boonGate: plan.attack.boonGate ?? null, landsOnHit: plan.attack.landsOnHit ?? [], name: row.name };
  }
  if (plan.door === "disengage") out.bossDisengage = true;
  if (plan.zone) Object.assign(out, zoneFlags(plan.zone, row, actor));
  return out;
}

/**
 * **A ZONE A BOSS ACTION LEAVES ON THE GROUND** (Winter Comes Down, Glacier, Vent the
 * Section, The Thorn Answers, Felfire): the record `dice/chat.mjs#regionFlagsFromCard`
 * already reads off an ability's card - the start-of-turn strike and Test 07's areas use
 * (`rules/area-ticks.mjs`), the Difficult ground (`rules/area-ground.mjs`), the span,
 * the DC, and a cast id the area sweep keys on.
 */
function zoneFlags(zone, row, actor) {
  const tick = emptyAreaTick();
  tick.who = "creature";
  tick.centre = "area";
  if (zone.damage) tick.damage = { rating: zone.damage, school: AZEROTH.schools[zone.school] ? zone.school : null };
  if (zone.check) {
    const check = emptyCheck();
    check.on = "turn";
    check.resilience = zone.check.resilience;
    check.fail = { ...check.fail, rating: zone.check.rating ?? null, school: AZEROTH.schools[zone.check.school] ? zone.check.school : null, statuses: [...(zone.check.statuses ?? [])] };
    if (zone.check.afflict) check.afflict = { kind: "poison", key: zone.check.afflict.key, name: zone.check.afflict.name || row.name };
    tick.checks = [check];
  }
  tick.difficult = zone.difficult === true;
  return {
    cast: foundry.utils.randomID(),
    caster: actor.uuid,
    spellName: row.name,
    spellDC: zone.check?.dc ?? row.automation?.dc ?? null,
    areaTick: tick,
    areaGround: zone.difficult ? { difficult: true, lasts: { rounds: null }, from: "", ignores: false, reason: "" } : null,
    lasts: { rounds: null, ...(zone.lasts === "encounter" ? { encounter: true } : { endOfRound: true }) }
  };
}

/* ------------------------------------------------------------------ */
/*  3. What lands at the press                                         */
/* ------------------------------------------------------------------ */

/** An effect laid by a Boss Action: its name, its art, its span, its flags. */
function bossEffect(row, actor, { flags = {}, changes = [], span = null, description = "", statuses = [] } = {}) {
  return {
    name: `${row.name} (${actor.name})`,
    img: actor.img ?? "icons/svg/aura.svg",
    origin: actor.uuid,
    description,
    statuses,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
    system: { changes },
    ...(span ?? {}),
    flags: { [SCOPE]: { bossAction: { name: row.name, by: actor.uuid }, ...flags } }
  };
}

/**
 * **WHAT LANDS AT THE PRESS**, after the card is posted. Answers the lines it adds to
 * the card's record, in words.
 *
 * @param {{actor: Actor, row: object, targets: object[], pre: object, message: ChatMessage|null}} o
 * @returns {Promise<string[]>}
 */
export async function afterBossPress({ actor, row, targets = [], pre = {}, message = null } = {}) {
  const plan = cleanBossPlan(row?.automation?.plan);
  const lines = [];
  const own = tokenOf(actor);
  const words = (key, data = {}) => lines.push(game.i18n.format(key, { name: row.name, boss: actor.name, ...data }));

  // A push at the press, from the Boss's token (Thrash, Down the Wall).
  if (plan.forced?.on === "press" && own) {
    for (const t of targets) {
      const token = snapshotToken(t)?.document ?? null;
      if (!token) continue;
      const r = await forceMove({ token, from: { x: own.center.x, y: own.center.y }, feet: plan.forced.feet, toward: plan.forced.toward, by: actor, name: token.name });
      lines.push(forcedWords(r, { toward: plan.forced.toward, source: row.name }));
    }
  }
  // Power the Boss gains (Blood for the Dreamer).
  if (plan.poolGain) {
    const done = await bossWrite("pool", { actorUuid: actor.uuid, kind: plan.poolGain.pool, delta: plan.poolGain.amount }, { by: actor, owned: actor.isOwner });
    if (done) words("AZEROTH.Boss.PoolGained", { n: done.to - done.from, pool: game.i18n.localize(AZEROTH.npcPoolKinds[plan.poolGain.pool] ?? plan.poolGain.pool) });
  }
  // Power drained from the creature at the press (Feed).
  if (plan.poolLoss?.on === "press") {
    let drained = 0;
    for (const t of targets) {
      const victim = snapshotActor(t);
      if (!victim) continue;
      const done = await bossWrite("pool", { actorUuid: victim.uuid, kind: plan.poolLoss.pool, delta: -plan.poolLoss.amount }, { by: actor, owned: victim.isOwner });
      if (done) drained += done.from - done.to;
      words(done ? "AZEROTH.Boss.PoolLost" : "AZEROTH.Boss.NoPool", { target: victim.name, n: done ? done.from - done.to : plan.poolLoss.amount, pool: game.i18n.localize(plan.poolLoss.pool === "mana" ? "AZEROTH.Pool.Mana" : "AZEROTH.Sheet.Power") });
    }
    // *And the citizen gains 1 for each one drained* (14's Arcane Torrent; D-811): what was
    // actually taken, never what was asked for, into the user's own pool of that kind.
    if (plan.poolLoss.gain && drained > 0) {
      const got = await bossWrite("pool", { actorUuid: actor.uuid, kind: plan.poolLoss.pool, delta: drained }, { by: actor, owned: actor.isOwner });
      if (got) words("AZEROTH.Boss.PoolDrained", { n: got.to - got.from, pool: game.i18n.localize(plan.poolLoss.pool === "mana" ? "AZEROTH.Pool.Mana" : "AZEROTH.Sheet.Power") });
    }
  }
  // A Boon on the next Test of a kind, on every creature the press reached (14's Battle Squawk;
  // D-811): a count, spent by that Test (`effects/banes.mjs#spendLaidBoons`).
  if (plan.boon) {
    const kind = game.i18n.localize(AZEROTH.testKinds[plan.boon.kind] ?? plan.boon.kind);
    for (const t of targets) {
      const victim = snapshotActor(t);
      if (!victim) continue;
      const done = await layBoon({ victim, kind: plan.boon.kind, boons: 1, source: row.name, by: actor });
      if (done) words("AZEROTH.Boss.BoonLaid", { target: victim.name, kind });
    }
  }
  // A Bane on the next Test of a kind, at the press (14's Counterspell; D-811): 06's Pummel's
  // door, spent by that Test, the door's own backstop its span.
  if (plan.bane?.on === "press") {
    const kind = game.i18n.localize(AZEROTH.testKinds[plan.bane.kind] ?? plan.bane.kind);
    for (const t of targets) {
      const victim = snapshotActor(t);
      if (!victim) continue;
      const done = await layBane({ victim, kind: plan.bane.kind, banes: 1, source: row.name, by: actor });
      if (done) words("AZEROTH.Boss.CastingBaneLaid", { target: victim.name, kind });
    }
  }

  switch (plan.door) {
    case "relocateSelf":
    case "gyth": {
      if (own && pre.to) {
        const at = cornerFor(own.document, pre.to);
        const moved = await bossWrite("move", { tokenUuid: own.document.uuid, x: at.x, y: at.y }, { by: actor, owned: own.document.isOwner });
        words(moved ? "AZEROTH.Boss.Moved" : "AZEROTH.Boss.NotMoved", { target: own.name });
      }
      if (plan.missNext) {
        for (const who of [actor, ...(pre.also ?? [])]) {
          await bossWrite("createEffect", { actorUuid: who.uuid, effect: bossEffect(row, actor, {
            flags: { [MISS_NEXT_FLAG]: { by: actor.uuid, name: row.name } }, span: untilEndOfRound(who),
            description: game.i18n.localize("AZEROTH.Boss.MissNextText")
          }) }, { by: actor, owned: who.isOwner });
          words("AZEROTH.Boss.MissNext", { target: who.name });
        }
      }
      break;
    }
    case "relocateTarget":
    case "away": {
      const vt = pre.victimToken?.document ?? null;
      if (vt && pre.to) {
        const from = { x: vt.x, y: vt.y };
        const at = cornerFor(vt, pre.to);
        const moved = await bossWrite("move", { tokenUuid: vt.uuid, x: at.x, y: at.y }, { by: actor, owned: vt.isOwner });
        words(moved ? "AZEROTH.Boss.Moved" : "AZEROTH.Boss.NotMoved", { target: vt.name });
        if (plan.door === "away") {
          const fight = fightOf(actor) ?? fightOf(pre.victim);
          const returns = fight?.started ? fight.round + 2 : null;
          await bossWrite("createEffect", { actorUuid: pre.victim.uuid, effect: bossEffect(row, actor, {
            flags: { [AWAY_FLAG]: { combatId: fight?.id ?? null, returns, from, tokenUuid: vt.uuid } },
            description: game.i18n.localize("AZEROTH.Boss.AwayText")
          }) }, { by: actor, owned: pre.victim.isOwner });
          words("AZEROTH.Boss.Away", { target: vt.name, round: returns ?? "-" });
        }
      }
      break;
    }
    case "selfLine": {
      if (own && Number.isFinite(pre.rotation)) {
        // Ridden along the line through the forced-movement door: pushed away from a
        // point behind the Boss, so the move runs the line's way and stops at a wall.
        const rad = (pre.rotation * Math.PI) / 180;
        // A square or more behind: `forcedPlan` reads a point under a quarter square away as no line at all.
        const span = (own.document.parent?.grid?.size ?? 100) * 2;
        const behind = { x: own.center.x - Math.cos(rad) * span, y: own.center.y - Math.sin(rad) * span };
        const r = await forceMove({ token: own.document, from: behind, feet: pre.lineFt ?? 50, toward: "away", by: actor, name: own.name });
        words(r.moved ? "AZEROTH.Boss.Rode" : "AZEROTH.Boss.NotMoved", { target: own.name, feet: r.feet ?? 0 });
      }
      break;
    }
    case "disengage": {
      if (!actor.statuses?.has("disengaging")) await actor.toggleStatusEffect("disengaging", { active: true });
      words("AZEROTH.Boss.Disengaged", {});
      break;
    }
    case "allyAttack": {
      if (pre.ally) {
        words("AZEROTH.Boss.AllyAttacks", { target: pre.ally.name });
        const { npcAttackWithDialog } = await import("../applications/actions.mjs");
        // *takes its Attack immediately, and its attack Test takes Boon*: costs the ally
        // nothing of its own turn (the lead's ruling on Q7).
        await npcAttackWithDialog(pre.ally, pre.attackIndex ?? 0, null, { budget: "none", cardBoons: { boons: plan.boons ?? 1, names: [row.name] } });
      }
      break;
    }
    case "marked": {
      const victim = pre.victim;
      if (victim) {
        await bossWrite("createEffect", { actorUuid: victim.uuid, effect: bossEffect(row, actor, {
          // `ranged: false`: *every creature on his side takes Boon on attack Tests against it* is
          // every attack, and Reckless's `ranged: true` (rank 2's *only ranged attacks do*) took
          // the Boon off every blow struck in reach (D-811's adjacent fault).
          flags: { [EXPOSED_FLAG]: { boons: plan.boons ?? 1, ranged: false, source: row.name, side: sideOfActor(actor), extra: { damage: plan.extra ?? 0, spent: false, by: actor.uuid } } },
          span: untilEndOfRound(victim), description: game.i18n.format("AZEROTH.Boss.MarkedText", { boss: actor.name, n: plan.extra ?? 0 })
        }) }, { by: actor, owned: victim.isOwner });
        words("AZEROTH.Boss.Marked", { target: victim.name });
      }
      break;
    }
    case "amaniFury": {
      // *Until the encounter ends* (14's Berserk; D-811): the two flags `AzerothCombat#_leaveFight`
      // lifts at a fight's end, on the Boon and the exposure alike.
      // Otherwise Amani Fury's *until the end of the round*.
      const encounter = plan.lasts === "encounter";
      if (encounter) await layBoon({ victim: actor, kind: "attack", boons: 1, source: row.name, by: actor, encounter: true });
      else await layBoon({ victim: actor, kind: "attack", boons: 1, source: row.name, by: actor, lasting: true, span: untilEndOfRound(actor) });
      // `ranged: false`: *every attack Test against him* is every attack (D-811's adjacent fault).
      await bossWrite("createEffect", { actorUuid: actor.uuid, effect: bossEffect(row, actor, {
        flags: { [EXPOSED_FLAG]: { boons: 1, ranged: false, source: row.name }, ...(encounter ? { talentBuff: row.name, until: "encounter" } : {}) },
        // The encounter's lift is the flags alone, as `layBoon`'s own is: a core `combatEnd` span
        // beside them would delete the effect twice at the fight's end.
        span: encounter ? null : untilEndOfRound(actor),
        description: game.i18n.localize(encounter ? "AZEROTH.Boss.FuryEncounterText" : "AZEROTH.Boss.AmaniText")
      }) }, { by: actor, owned: actor.isOwner });
      words(encounter ? "AZEROTH.Boss.FuryEncounter" : "AZEROTH.Boss.Amani", {});
      break;
    }
    case "quarry": {
      // *Its attack Tests against that creature take Boon until the encounter ends or it names
      // another* (14's Named Quarry; D-811): an exposure only the namer's own attacks read
      // (`by`), for the encounter; a second name ends the first wherever it stands.
      const victim = pre.victim;
      if (!victim) break;
      for (const held of quarriesOf(actor, row.name)) {
        if (held.actor.uuid === victim.uuid) continue;
        const done = await bossWrite("deleteEffects", { actorUuid: held.actor.uuid, effectIds: held.ids }, { by: actor, owned: held.actor.isOwner });
        if (done) words("AZEROTH.Boss.QuarryEnded", { target: held.actor.name });
      }
      // Named again: the one quarry, laid afresh.
      const again = quarriesOf(actor, row.name).find(h => h.actor.uuid === victim.uuid);
      if (again) await bossWrite("deleteEffects", { actorUuid: victim.uuid, effectIds: again.ids }, { by: actor, owned: victim.isOwner });
      await bossWrite("createEffect", { actorUuid: victim.uuid, effect: bossEffect(row, actor, {
        // Lifted at the fight's end by `_leaveFight`'s flags, never by a second span.
        flags: { [EXPOSED_FLAG]: { boons: 1, ranged: false, source: row.name, by: actor.uuid }, talentBuff: row.name, until: "encounter" },
        description: game.i18n.format("AZEROTH.Boss.QuarryText", { boss: actor.name })
      }) }, { by: actor, owned: victim.isOwner });
      words("AZEROTH.Boss.Quarry", { target: victim.name });
      break;
    }
    case "classCall": {
      for (const victim of pre.holders ?? []) {
        await layBane({ victim, kind: CASTING_TESTS, banes: 1, source: row.name, by: actor, lasting: true, span: untilEndOfNextTurnOrRound(victim) });
      }
      words("AZEROTH.Boss.ClassCalled", { cls: pre.className ?? "", names: (pre.holders ?? []).map(a => a.name).join(", ") || game.i18n.localize("AZEROTH.Boss.Nobody") });
      break;
    }
    case "enfeeble": {
      const victim = pre.victim;
      if (victim) {
        const changes = ["body", "head", "limb"].map(location => ({ key: `system.ap.${location}`, type: "override", value: 0, phase: "final" }));
        await bossWrite("createEffect", { actorUuid: victim.uuid, effect: bossEffect(row, actor, { changes, span: untilEndOfRound(victim),
          description: game.i18n.localize("AZEROTH.Boss.EnfeebleText") }) }, { by: actor, owned: victim.isOwner });
        words("AZEROTH.Boss.Enfeebled", { target: victim.name });
      }
      break;
    }
    case "copies": {
      const done = await bossWrite("copies", { actorUuid: actor.uuid, count: plan.count ?? 2, health: plan.health ?? 1, defense: plan.defense ?? null, tokenUuid: own?.document?.uuid ?? null }, { by: actor, owned: false });
      words(done?.count ? "AZEROTH.Boss.Copies" : "AZEROTH.Boss.NoCopies", { n: done?.count ?? 0 });
      break;
    }
    case "raise": {
      const entry = row.automation?.summon?.entry ?? null;
      let raised = 0;
      for (const corpse of pre.corpses ?? []) {
        const at = corpse.object?.center ?? null;
        const done = await placeSummon({ summoner: actor, entry, count: 1, side: "summoner", at, sceneId: corpse.parent?.id ?? null });
        if (!done) continue;
        raised += done.count ?? 0;
        // The corpse is gone: it stands up as the body raised (the lead's ruling on Q6).
        await bossWrite("deleteTokens", { sceneId: corpse.parent.id, tokenIds: [corpse.id] }, { by: actor, owned: false });
      }
      words("AZEROTH.Boss.Raised", { n: raised, entry: entry ?? "" });
      break;
    }
    default:
      break;
  }
  if (lines.length && message) await postLines(actor, lines);
  return lines;
}

/** Post the lines a door lands, under the Boss. */
async function postLines(actor, lines) {
  if (!lines.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""),
    flags: { [SCOPE]: { kind: "tick", bossDoor: true } }
  });
}

/* ------------------------------------------------------------------ */
/*  4. What a failed Test lands                                        */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A FAILED RESILIENCE TEST ON A BOSS ACTION'S CARD LANDS**, on the client that
 * rolled it. The forced move rides the spell door's own record and is landed beside it
 * (`dice/chat.mjs`); this lands the rest.
 *
 * @param {{actor: Actor, message: ChatMessage}} o  `actor` the creature that failed
 * @returns {Promise<string[]>}  the lines, in words
 */
export async function bossFailLands({ actor, message } = {}) {
  const rec = message?.flags?.[SCOPE]?.bossOnFail ?? null;
  if (!actor || !rec) return [];
  const boss = rec.by ? await fromUuid(rec.by) : null;
  const row = { name: rec.name ?? "" };
  const lines = [];
  const say = (key, data = {}) => lines.push(game.i18n.format(key, { name: row.name, boss: boss?.name ?? "", target: actor.name, ...data }));
  if (rec.poolLoss) {
    const done = await bossWrite("pool", { actorUuid: actor.uuid, kind: rec.poolLoss.pool, delta: -rec.poolLoss.amount }, { by: actor, owned: actor.isOwner });
    say(done ? "AZEROTH.Boss.PoolLost" : "AZEROTH.Boss.NoPool", { n: done ? done.from - done.to : rec.poolLoss.amount, pool: game.i18n.localize(rec.poolLoss.pool === "mana" ? "AZEROTH.Pool.Mana" : "AZEROTH.Sheet.Power") });
  }
  if (rec.sunder) {
    const changes = [{ key: `system.ap.${rec.sunder.location}`, type: "add", value: -rec.sunder.amount, phase: "final" }];
    await bossWrite("createEffect", { actorUuid: actor.uuid, effect: {
      name: game.i18n.localize("AZEROTH.Effect.Sundered"), img: "icons/svg/hazard.svg", origin: boss?.uuid ?? null,
      system: { changes }, flags: { [SCOPE]: { sundered: true, bossAction: { name: row.name, by: boss?.uuid ?? null } } }
    } }, { by: actor, owned: actor.isOwner });
    say("AZEROTH.Boss.Sundered", { n: rec.sunder.amount });
  }
  if (rec.bane && boss) {
    const bossToken = tokenOf(boss);
    const only = rec.bane.only === "self" ? { actorId: boss.id, tokenId: bossToken?.id ?? null } : null;
    const laid = await layBane({ victim: actor, kind: rec.bane.kind, banes: 1, source: row.name, by: boss, lasting: true, only, span: untilEndOfNextTurnOrRound(actor) });
    if (laid) say("AZEROTH.Boss.BaneLaid", {});
  }
  if (rec.sideSwitch && boss) {
    // *One Demon or Elemental*: 14's creature type, read off the block.
    const kinds = rec.sideSwitch.kinds ?? [];
    const type = String(actor.system?.creatureType ?? "").toLowerCase();
    if (kinds.length && !kinds.includes(type)) say("AZEROTH.Boss.SideRefused", { kinds: kinds.join(", ") });
    else {
      const fight = fightOf(actor);
      const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
      const span = rec.sideSwitch.until === "encounter" ? untilEncounterEnd(actor) : untilEndOfNextTurnOrRound(actor);
      if (combatant) {
        const to = sideOfActor(boss);
        await bossWrite("createEffect", { actorUuid: actor.uuid, effect: bossEffect(row, boss, {
          flags: { [SIDE_SWITCH_FLAG]: { combatId: fight.id, combatantId: combatant.id, prior: combatant.getFlag(SCOPE, "side") ?? null, to } },
          span, description: game.i18n.format("AZEROTH.Boss.SideText", { boss: boss.name })
        }) }, { by: actor, owned: actor.isOwner });
        await bossWrite("side", { combatId: fight.id, combatantId: combatant.id, side: to }, { by: actor, owned: combatant.isOwner });
        say("AZEROTH.Boss.SideSwitched", {});
      } else say("AZEROTH.Boss.SideNoFight", {});
    }
  }
  if (rec.cannotAttack) {
    await bossWrite("createEffect", { actorUuid: actor.uuid, effect: bossEffect(row, boss ?? actor, {
      flags: { [CANNOT_ATTACK_FLAG]: { by: boss?.uuid ?? null, name: row.name } }, span: untilEndOfNextTurnOrRound(actor),
      description: game.i18n.localize("AZEROTH.Boss.CannotAttackText")
    }) }, { by: actor, owned: actor.isOwner });
    say("AZEROTH.Boss.CannotAttack", {});
  }
  if (rec.reminder) {
    await bossWrite("createEffect", { actorUuid: actor.uuid, effect: bossEffect(row, boss ?? actor, {
      flags: { [REMINDER_FLAG]: { by: boss?.uuid ?? null, name: row.name } }, span: untilEndOfNextTurnOrRound(actor),
      description: game.i18n.format("AZEROTH.Boss.ReminderText", { boss: boss?.name ?? "" })
    }) }, { by: actor, owned: actor.isOwner });
    say("AZEROTH.Boss.Reminder", {});
  }
  if (rec.drainFixed && boss) {
    const healed = await bossWrite("heal", { actorUuid: boss.uuid, amount: rec.drainFixed }, { by: actor, owned: boss.isOwner });
    say("AZEROTH.Boss.Drained", { n: Number(healed) || 0 });
  }
  if (lines.length) await postLines(boss ?? actor, lines);
  return lines;
}

/* ------------------------------------------------------------------ */
/*  The standing reads                                                 */
/* ------------------------------------------------------------------ */

/**
 * **THE NEXT ATTACK AGAINST IT THIS ROUND MISSES** (Shadow Step, Step Aside, Gyth Takes
 * the Air): the first target's mark, taken by the attack that reads it. The miss is the
 * roll's own (`AzerothRoll#outcome` reads `options.forcedMiss`), so the card says Miss
 * in words; the mark is deleted the moment it is read, so a second attack hits as rolled.
 *
 * @param {Actor} attacker
 * @param {object|null} first  the attack's first target snapshot
 * @returns {Promise<{name: string, by: string|null}|null>}
 */
export async function takeMissNext(attacker, first) {
  const victim = first ? snapshotActor(first) : null;
  if (!victim) return null;
  const effect = [...(victim.effects ?? [])].find(e => e.active !== false && e.getFlag(SCOPE, MISS_NEXT_FLAG)) ?? null;
  if (!effect) return null;
  const mark = effect.getFlag(SCOPE, MISS_NEXT_FLAG);
  await bossWrite("deleteEffects", { actorUuid: victim.uuid, effectIds: [effect.id] }, { by: attacker, owned: victim.isOwner });
  return { name: String(mark?.name ?? effect.name), by: mark?.by ?? null };
}

/**
 * **THE FIRST HIT OF THE BOSS'S SIDE DEALS MORE** (Sell Them Out: *the first of those
 * attacks to hit deals 4 extra damage*): read off the target's mark where the attacker
 * fights on the marking Boss's side, and spent by the hit.
 *
 * @param {Actor} attacker
 * @param {object|null} first
 * @returns {Promise<{damage: number, name: string}|null>}
 */
export async function takeMarkedExtra(attacker, first) {
  const victim = first ? snapshotActor(first) : null;
  if (!victim) return null;
  const side = sideOfActor(attacker);
  for (const effect of victim.effects ?? []) {
    if (effect.active === false) continue;
    const raw = effect.getFlag(SCOPE, EXPOSED_FLAG);
    if (!raw?.extra || raw.extra.spent || !(raw.extra.damage > 0) || (raw.side && raw.side !== side)) continue;
    await bossWrite("updateEffect", { actorUuid: victim.uuid, effectId: effect.id, update: { [`flags.${SCOPE}.${EXPOSED_FLAG}.extra.spent`]: true } }, { by: attacker, owned: victim.isOwner });
    return { damage: raw.extra.damage, name: String(raw.source ?? effect.name) };
  }
  return null;
}

/**
 * **IT CANNOT ATTACK** (Hex the Loudest): refused in words at both attack doors.
 *
 * @param {Actor} actor
 * @returns {boolean}  true where the door is shut
 */
export function refuseCannotAttack(actor) {
  const effect = [...(actor?.effects ?? [])].find(e => e.active !== false && e.getFlag?.(SCOPE, CANNOT_ATTACK_FLAG)) ?? null;
  if (!effect) return false;
  ui.notifications?.warn(game.i18n.format("AZEROTH.Boss.CannotAttackRefused", { name: actor.name, source: effect.getFlag(SCOPE, CANNOT_ATTACK_FLAG)?.name ?? effect.name }));
  return true;
}

/**
 * **A GRIP THAT STRIKES AT THE HOLDER'S TURN** (Grab: *takes 5 damage at the start of
 * each of Stitches's turns*): every creature in this fight still Entangled by a grip the
 * holder laid takes it, through the damage door as no attack. Runs on the active GM.
 *
 * @param {Actor} holder  whose turn is starting
 * @param {Combat} combat
 * @returns {Promise<string[]>}
 */
export async function advanceBossGrips(holder, combat) {
  const lines = [];
  if (!holder || !combat) return lines;
  for (const c of combat.combatants ?? []) {
    const victim = c.actor;
    if (!victim || victim === holder) continue;
    for (const effect of victim.effects ?? []) {
      const grip = effect.getFlag?.(SCOPE, BOSS_GRIP_FLAG);
      if (!grip || grip.by !== holder.uuid || !effect.statuses?.has("entangled")) continue;
      // Through the ONE door a tick's damage lands by (`effects/area-strikes.mjs#strikeFromArea`):
      // its type mitigated as 06 says, the holder's own standing reductions, no attack.
      const school = grip.type && grip.type !== "physical" ? grip.type : null;
      const { strikeFromArea } = await import("./area-strikes.mjs");
      lines.push(game.i18n.format("AZEROTH.Boss.GripStrikes", { target: victim.name, n: grip.damage, name: grip.name ?? "", boss: holder.name }));
      lines.push(...await strikeFromArea({ actor: victim, caster: holder, spell: { name: grip.name ?? "", feature: true }, damage: { rating: grip.damage, school } }));
    }
  }
  return lines;
}

/**
 * **A TURN THAT PASSES**, in words, or null: a body that arrives next round, a creature
 * Sent to a Room.
 *
 * @param {Combatant} combatant
 * @param {Combat} combat
 * @returns {string|null}
 */
export function bossTurnSkip(combatant, combat) {
  const arrives = Number(combatant?.getFlag("azeroth-rpg", ARRIVES_FLAG));
  if (Number.isFinite(arrives) && arrives > (combat?.round ?? 0)) {
    return game.i18n.format("AZEROTH.Boss.Arriving", { name: combatant.name });
  }
  const away = [...(combatant?.actor?.effects ?? [])].find(e => e.getFlag?.(SCOPE, AWAY_FLAG)?.combatId === combat?.id) ?? null;
  if (away) return game.i18n.format("AZEROTH.Boss.AwayTurn", { name: combatant.name });
  return null;
}

/**
 * **THE ROUND A CREATURE COMES BACK** (Sent to a Room: *returns to the fight at the start
 * of the round after next*): put back where it stood, or the nearest free square, and
 * the mark gone. Runs on the active GM at the top of every round.
 *
 * @param {Combat} combat
 */
export async function bossRoundStart(combat) {
  for (const c of combat?.combatants ?? []) {
    const actor = c.actor;
    for (const effect of actor?.effects ?? []) {
      const away = effect.getFlag?.(SCOPE, AWAY_FLAG);
      if (!away || away.combatId !== combat.id || !(Number(away.returns) <= combat.round)) continue;
      const token = away.tokenUuid ? await fromUuid(away.tokenUuid) : null;
      if (token && away.from) {
        const spots = ringSpots({
          origin: { x: away.from.x, y: away.from.y }, count: 1,
          cell: { w: token.parent.grid.sizeX ?? token.parent.grid.size, h: token.parent.grid.sizeY ?? token.parent.grid.size },
          size: { width: (token.width ?? 1) * (token.parent.grid.sizeX ?? token.parent.grid.size), height: (token.height ?? 1) * (token.parent.grid.sizeY ?? token.parent.grid.size) },
          standing: token.parent.tokens.filter(t => t.id !== token.id).map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * token.parent.grid.size, height: (t.height ?? 1) * token.parent.grid.size })),
          board: token.parent.dimensions?.rect ?? null, includeOrigin: true
        });
        const spot = spots[0] ?? away.from;
        await token.move({ x: Math.round(spot.x), y: Math.round(spot.y), action: "displace" });
      }
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Boss.Returns", { name: actor.name })}</p>`, flags: { [SCOPE]: { kind: "tick" } } });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Copies                                                             */
/* ------------------------------------------------------------------ */

/**
 * **TWO COPIES OF THE PROPHET** (Three Places at Once: *Each has 1 Health, Defense 19 and
 * his attack line, an attack that hits one destroys it*): one world actor in the Summoned
 * folder made from the Boss - its Health, Defense and attack line, no Armor Points, no
 * abilities and no Boss Actions - and its tokens rung round him on his side. They take
 * no turns (the lead's ruling on Q15) and go with the fight.
 */
async function placeCopiesHere({ actorUuid, count = 2, health = 1, defense = null, tokenUuid = null } = {}, by = null) {
  const boss = actorUuid ? await fromUuid(actorUuid) : null;
  const token = tokenUuid ? await fromUuid(tokenUuid) : null;
  if (!boss || !token?.parent) return { count: 0 };
  const scene = token.parent;
  const source = boss.toObject();
  delete source._id;
  const sys = source.system;
  sys.health = { ...(sys.health ?? {}), value: health, max: health };
  if (defense) sys.defense = defense;
  sys.ap = { body: 0, head: 0, limb: 0 };
  sys.creatureAbilities = [];
  sys.bossActions = [];
  sys.bossPoints = { value: null, max: null };
  sys.spells = { ...(sys.spells ?? {}), names: [] };
  const folder = await actorFolder("AZEROTH.Summon.Folder");
  const copy = await Actor.create({
    ...source, name: game.i18n.format("AZEROTH.Boss.CopyName", { name: boss.name }), folder: folder?.id ?? null, items: [], effects: [],
    prototypeToken: { ...source.prototypeToken, actorLink: false, name: game.i18n.format("AZEROTH.Boss.CopyName", { name: boss.name }) },
    flags: { ...(source.flags ?? {}), [SCOPE]: { ...(source.flags?.[SCOPE] ?? {}), [BOSS_COPY_FLAG]: boss.uuid } }
  });
  const cell = { w: scene.grid.sizeX ?? scene.grid.size, h: scene.grid.sizeY ?? scene.grid.size };
  const proto = copy.prototypeToken.toObject();
  const size = { width: Math.max(1, proto.width ?? 1) * cell.w, height: Math.max(1, proto.height ?? 1) * cell.h };
  const standing = scene.tokens.map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h }));
  const spots = ringSpots({ origin: { x: token.x, y: token.y }, count: Math.max(1, count), cell, size, standing, board: scene.dimensions?.rect ?? null, includeOrigin: false });
  const placed = await scene.createEmbeddedDocuments("Token", spots.map(s => ({
    ...proto, actorId: copy.id, actorLink: false, disposition: token.disposition, elevation: token.elevation ?? 0,
    x: Math.round(s.x), y: Math.round(s.y)
  })));
  return { count: placed.length, actorId: copy.id, tokenIds: placed.map(t => t.id) };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * The active GM's standing work: a side switched back when its carrier goes, and the
 * copies gone with the fight.
 */
export function registerBossDoorHooks() {
  Hooks.on("deleteActiveEffect", effect => {
    if (!game.users?.activeGM?.isSelf) return;
    const sw = effect.getFlag?.(SCOPE, SIDE_SWITCH_FLAG);
    if (!sw) return;
    const combatant = game.combats?.get(sw.combatId)?.combatants?.get(sw.combatantId) ?? null;
    if (combatant) combatant.setSide(sw.prior ?? null).catch(err => console.warn("azeroth-rpg | a side switched back", err));
  });
  Hooks.on("deleteCombat", combat => {
    if (!game.users?.activeGM?.isSelf) return;
    const copies = new Set(game.actors.filter(a => a.getFlag(SCOPE, BOSS_COPY_FLAG)).map(a => a.id));
    if (!copies.size) return;
    for (const scene of game.scenes ?? []) {
      const ids = scene.tokens.filter(t => copies.has(t.actorId)).map(t => t.id);
      if (ids.length) scene.deleteEmbeddedDocuments("Token", ids).catch(err => console.warn("azeroth-rpg | a copy gone with the fight", err));
    }
  });
}
