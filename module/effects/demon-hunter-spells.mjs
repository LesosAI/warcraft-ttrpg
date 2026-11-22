/**
 * **WHAT A DEMON HUNTER SPELL DOES THAT NO DESCRIPTOR CARRIES** (07 §15, *Restricted Demon Hunter*; the Demon
 * Hunter plan's Phase 4b, C53 to C58; D-1540 onward). The law is `rules/demon-hunter-spells.mjs`; this module only
 * reads the world and writes, through doors that exist:
 *
 * - `judgeDhSpell` - asked by `castSpell` with its other refusals, BEFORE the budget and the Energy (D-768's
 *   order): the brand's one creature, the allies a Gaze outlines for, the spell Spellsunder or Siphon the Weave
 *   ends (picked through the one chooser, judged by the one Dispel judgement), Devour the Spell's turn-start claim
 *   (`effects/devour-the-spell-reaction.mjs`), the glaives
 *   Call the Glaives brings back, Hellstrike's landing and the creatures round it (the card's rows become them),
 *   Flame Crash's glaives and their landing points, Glaive Tempest's enemies in reach, and a GM where a write
 *   lands on a document this client does not own (`rules/gm-writes.mjs#gmAbsentFor`);
 * - `dhSpellAfterCast` - once the Casting Test succeeded (07 §8: a failed cast does nothing): the caster's own
 *   states, the brand, the glaives thrown and recalled, the leap, Immolation Aura's light, Siphon the Weave's end
 *   where no Test is asked;
 * - `dhSpellAfterCard` - once the card stands: Flame Crash's burning ground (ONE Region with a circle where each
 *   glaive landed, so *once a turn however many areas it is in* is the area engine's own once) and Glaive
 *   Tempest's attacks, each through the attack door with its 2 Fel on the typed lane;
 * - `dhSpellAfterResist` - a creature's failed Resist on a Demon Hunter card: Eye Beam's Scorched 2, Shear's
 *   lowered maximum, Draw Soul's heal for each failure, Inner Demon's torment, Nether Snare's snare, and the spell
 *   Spellsunder, Siphon the Weave or Devour the Spell ends, with its Energy or its Hatred;
 * - at a move (`immolationOnMove`): Immolation Aura's *or moves within 5 feet of you on its turn*;
 * - presses on a card the hunter or the creature owns (`dhCardPress`): the brand's Track and the flames' Put out.
 */

import {
  AGILITY_FLAG, AURA_LIGHT_FLAG, AWAY_FLAG, BRAND_FLAG, DH_OWN_FLAG, FEET_PER_MILE, FLAMES_ID, GAZE_FLAG, HUNTING_FLAG,
  IMMOLATION_ENTERED_FLAG, SHEAR_FLAG, SNARE_FLAG, TORMENT_FLAG,
  brandReading, clampedHealth, devourHatred, endCapFor, isGlaive, movesWithin, putOutRefusal, readAgility, readAuraLight, readBrand,
  readDevour, readDrawHeal, readFlameCrash, readGaze, readHitBonus, readHuntingGround, readLeap, readPutOut, readRecall,
  readScorchedValue, readShear, readSiphon, readSnare, readSunder, readTempest, readTorment, recalled, shearDrop,
  siphonEnergy, siphonTests, spellCandidates, struckThisTurn, tormentTick, wieldedGlaives
} from "../rules/demon-hunter-spells.mjs";
import { DEMON_HUNTER, demonHunterCaster } from "../rules/demon-hunter-scope.mjs";
// The unleashed hunter gains no Hatred (02's Demon Unleashed), judged before Devour the Spell asks (the review's C9).
import { unleashedGainRefusal } from "../rules/demon-hunter-features.mjs";
import { FLAME_CRASH_GROUND_KEY } from "../rules/demon-hunter-animations.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { AZEROTH } from "../config.mjs";

const SCOPE = "azeroth-rpg";

/** The query a write on a creature, a card or the caster this client does not own goes through. */
export const DH_SPELL_QUERY = "azeroth-rpg.demonHunterSpell";

const t = (key, data = {}) => game.i18n.format(key, data);
const isGM = () => game.user?.isGM === true;

/** Refuse in words and stop. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(`AZEROTH.DhSpell.Refuse.${key}`, data));
  return null;
}

/** Whether a GM is needed and absent for writes on documents this client may not own. */
function noGM(owned = []) {
  return gmAbsentFor({ owned, isGM: isGM(), gmActive: Boolean(game.users?.activeGM) });
}

/** The Demon Hunter doors carry this cast (`demonHunterCaster`). */
export function dhScope(sys = {}, actor = null) {
  return demonHunterCaster(sys?.classes ?? [], actor?.classNames ?? []);
}

/** The token a snapshot row names, on its own scene. */
function tokenOfRow(row) {
  const scene = (row?.sceneId && game.scenes?.get(row.sceneId)) || canvas?.scene || null;
  return row?.tokenId ? scene?.tokens?.get(row.tokenId) ?? null : null;
}

/** The actor a snapshot row names (a token's synthetic actor where it has one). */
async function actorOfRow(row) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  return targetActorOf(row);
}

/** The caster's token: the cast's source where given, else the first of its tokens on the viewed scene. */
function casterToken(actor, source = null) {
  const scene = (source?.sceneId && game.scenes?.get(source.sceneId)) || canvas?.scene || null;
  if (source?.tokenId) return scene?.tokens?.get(source.tokenId) ?? null;
  return scene?.tokens?.find?.(tk => tk.actor === actor || tk.actorId === actor?.id) ?? null;
}

/** Whether a creature is down: defeated, dead or at 0 Health as a creature. */
function isDown(token) {
  const a = token?.actor ?? null;
  if (!a) return true;
  return token.combatant?.isDefeated === true || a.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true
    || (a.type === "npc" && (Number(a.system?.health?.value) || 0) <= 0);
}

/** A row the card can carry, for a token (the roll dialog's own snapshot). */
async function snapshotsOf(tokens = []) {
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  return targetSnapshots(tokens.map(tk => tk.object ?? { id: tk.id, actor: tk.actor, name: tk.name, scene: tk.parent }));
}

/** A creature's side as the caster sees it: `self`, `ally`, `enemy` or `other`. */
async function relationOf(actor, own, other, token) {
  const { relationTo } = await import("./area-strikes.mjs");
  return relationTo({ caster: actor, casterToken: own, actor: other, token });
}

/** The actor a uuid names, or null. */
function actorAt(uuid) {
  try {
    return uuid ? fromUuidSync(uuid) : null;
  } catch {
    return null;
  }
}

/** The players who own an actor, or - one only a GM owns - the GMs. */
function whisperTo(actor) {
  const players = [...(game.users ?? [])].filter(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
  return players.length ? [...new Set(players)] : [...(game.users ?? [])].filter(u => u.isGM).map(u => u.id);
}

/** A card to a creature's owners alone, with an optional button row (`data-dh-press`) only they and the GM see. */
async function whisperCard(actor, title, lines, { presses = [], flags = {} } = {}) {
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const buttons = presses.length
    ? `<div class="azeroth-card-actions" data-reaction-owner="${esc(actor.uuid)}">${presses.map(p => `<button type="button" data-action="demonHunterCard" data-dh-press="${esc(p.press)}">${esc(p.label)}</button>`).join("")}</div>`
    : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor),
    content: `<div class="azeroth azeroth-card"><div class="azeroth-card-body"><p><strong>${esc(title)}</strong></p>${lines.map(l => `<p class="azeroth-drain">${esc(l)}</p>`).join("")}${buttons}</div></div>`,
    flags: { [SCOPE]: { kind: "demonHunterCard", ...flags } }
  });
}

/** Ask the active GM, or answer here where this client is it. */
async function askGM(payload) {
  if (isGM() && game.users?.activeGM?.isSelf) return demonHunterSpellQueryHandler(payload, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  return gm.query(DH_SPELL_QUERY, payload, { timeout: 15000 });
}

/** A span off a spell's own Duration field. */
async function spellSpan(actor, sys) {
  const { effectDuration } = await import("../rules/spell-effects.mjs");
  const { spellTiming } = await import("./durations.mjs");
  return spellTiming(actor, effectDuration(sys?.duration ?? {}, { inFight: Boolean(actor?.activeFight?.()) })) ?? {};
}

/** The card's resolved span on a creature. */
async function castSpan(actor, spec, caster = null) {
  if (!spec) return {};
  const { spanOn, clockRounds } = await import("./durations.mjs");
  const timed = spanOn(actor, spec, caster);
  if (timed) return timed;
  if (spec.units === "rounds" || spec.units === "turns") return clockRounds(Math.max(1, Math.trunc(Number(spec.value)) || 1));
  return {};
}

/** The tier of the spell a laid effect, a tick or a Sustain entry belongs to, or null where it is no spell's. */
function tierOfSpell(uuid = null, holder = null, spellId = null) {
  const item = (spellId && holder?.items?.get?.(spellId)) || actorAt(uuid);
  const tier = item?.type === "spell" ? Math.trunc(Number(item.system?.tier)) : NaN;
  return Number.isFinite(tier) && tier > 0 ? tier : null;
}

/** The Demon Hunter class item the caster holds, or null. */
function dhClassOf(actor) {
  return (actor?.classItems ?? actor?.items?.filter?.(i => i.type === "class") ?? []).find(c => c.system?.identifier === "demon-hunter" || c.name === DEMON_HUNTER) ?? null;
}

/* -------------------------------------------- */
/*  Judged before anything is paid               */
/* -------------------------------------------- */

/**
 * **A DEMON HUNTER SPELL, JUDGED BEFORE THE BUDGET AND THE ENERGY** (D-768's order). Null where it is refused
 * (said in words), else the plan and the card's rows.
 *
 * @param {{actor: Actor, spell: Item, list: object[], source?: object|null, answers?: object|null}} o
 * @returns {Promise<{plan: object|null, list: object[]}|null>}
 */
export async function judgeDhSpell({ actor, spell, list = [], source = null, answers = null, devourClaim = null } = {}) {
  const sys = spell?.system ?? {};
  if (!dhScope(sys, actor)) return { plan: null, list };
  const name = spell?.name ?? "";
  const plan = { card: { scope: true, identifier: sys.identifier ?? null, tier: Math.max(1, Math.trunc(Number(sys.tier)) || 1) } };
  let rows = list;
  const own = casterToken(actor, source);

  // Hunter's Brand: one creature, laid at the cast (no Apply), through the GM where this client does not own it.
  const brand = readBrand(sys.effect);
  if (brand) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    if (!who) return refuse("oneTarget", { spell: name });
    if (noGM([who.isOwner === true])) return refuse("noGM", { spell: name });
    const { kindsOfActor } = await import("./area-strikes.mjs");
    plan.brand = { uuid: who.uuid, name: rows[0]?.name ?? who.name, demon: kindsOfActor(who).has("demon"), feet: brand.feet, tokenId: rows[0]?.tokenId ?? null, sceneId: rows[0]?.sceneId ?? null };
  }

  // Gaze of the Sightless: the circle where the caster stands, and the allies it outlines for, chosen now.
  const gaze = readGaze(sys.effect);
  if (gaze) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { areaFor } = await import("../rules/areas.mjs");
    const { circleAround } = await import("./demon-hunter-sight.mjs");
    const feet = areaFor(sys.target ?? "")?.distanceFt ?? 15;
    const allies = [];
    for (const tk of own.parent.tokens ?? []) {
      if (!tk.actor || tk.id === own.id || isDown(tk)) continue;
      if ((await relationOf(actor, own, tk.actor, tk)) === "ally") allies.push({ key: tk.actor.uuid, name: tk.name ?? tk.actor.name, description: "", checked: true });
    }
    allies.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    let chosen = [];
    if (allies.length) {
      const { chooseOption } = game.system.azeroth.workflows;
      const picked = await chooseOption(spell, allies, null, { prompt: t("AZEROTH.DhSpell.Gaze.Prompt", { spell: name }), max: allies.length, selectAll: true });
      if (picked === null && answers?.gazeNone !== true) return null;
      // One ally is a single pick (the chooser answers the option itself), more a checklist (an array).
      chosen = (Array.isArray(picked) ? picked : picked ? [picked] : []).map(p => p.key);
    }
    plan.gaze = { feet, centre: circleAround(own, feet), allies: chosen };
    plan.noArea = true;
  }

  // Spellsunder: the one creature touched, and the tier 1 spell its failure ends, picked now (*your choice*).
  const sunder = readSunder(sys.effect);
  if (sunder) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    if (!who) return refuse("oneTarget", { spell: name });
    const picked = await pickSpellToEnd(spell, { maxTier: sunder.tier, creatures: [{ actor: who, token: tokenOfRow(rows[0]), feet: 0 }], kind: "sunder" });
    if (!picked) return null;
    if (noGM([picked.local === true])) return refuse("noGM", { spell: name });
    plan.card.picked = picked;
  }

  // Siphon the Weave: a tier 2 or lower spell taking effect on a creature within 30 feet, or one it begins Sustaining.
  const siphon = readSiphon(sys.effect);
  if (siphon) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const creatures = await creaturesWithin(own, siphon.feet);
    const picked = await pickSpellToEnd(spell, { maxTier: siphon.maxTier, creatures, kind: "siphon" });
    if (!picked) return null;
    const tests = siphonTests({ creatureUuid: picked.creatureUuid, casterUuid: picked.casterUuid });
    picked.tests = tests;
    picked.regain = siphon.regain;
    // The end lands here, or on the resisting creature's client with the Energy written back to this caster:
    // a GM is needed unless this client may write the creature and its spell itself.
    if (noGM([picked.local === true && picked.ownedHere === true])) return refuse("noGM", { spell: name });
    plan.card.picked = picked;
    if (tests) {
      const who = actorAt(picked.creatureUuid);
      const token = creatures.find(c => c.actor?.uuid === picked.creatureUuid)?.token ?? null;
      rows = token ? await snapshotsOf([token]) : [{ actorId: who?.id ?? null, name: who?.name ?? "", sceneId: null, tokenId: null }];
    } else {
      // No Test (the spell is not the creature's own): the card still names the creature whose spell ends, as Devour
      // the Spell's card does, so its cast cue has the creature to draw the unravelling on (`unravel("target")`);
      // with no row the cue was refused `no-anchor` and the cast played nothing. `noResist` keeps the Resist off it.
      plan.noResist = true;
      const token = creatures.find(c => c.actor?.uuid === picked.creatureUuid)?.token ?? null;
      rows = token ? await snapshotsOf([token]) : [];
    }
  }

  // **DEVOUR THE SPELL: THE SUSTAIN ITS TURN-START CLAIM NAMES** (07, D-1717; D-1726): cast only through the
  // creature's turn start (`effects/devour-the-spell-reaction.mjs#devourTurnStart`), whose claim `castSpell` has
  // already held to this moment. The creature's Spirit Test is rolled in flight on the GM's client, so the card asks
  // no Resist of its own.
  const devour = readDevour(sys.effect);
  if (devour) {
    const { devourPicked } = await import("./devour-the-spell-reaction.mjs");
    const picked = devourClaim ? await devourPicked(devourClaim) : null;
    if (!picked) return refuse("devourTrigger", { spell: name });
    const sustainer = actorAt(picked.casterUuid);
    if (!sustainer) return refuse("nothingToEnd", { spell: name, tier: devour.maxTier });
    picked.plus = devour.plus;
    plan.card.picked = picked;
    plan.devour = true;
    plan.noResist = true;
    const token = (own?.parent?.tokens ?? []).find(tk => tk.actor?.uuid === sustainer.uuid || (tk.actorLink && tk.actorId === sustainer.id)) ?? null;
    rows = token ? await snapshotsOf([token]) : [{ actorId: sustainer.id, name: sustainer.name, sceneId: null, tokenId: null }];
  }

  // Call the Glaives: the equipped glaives lying within the mile, up to two.
  const recall = readRecall(sys.effect);
  if (recall) {
    const { feetToPoint } = await import("../canvas/footprints.mjs");
    const sceneId = own?.parent?.id ?? null;
    const { back, far } = recalled(actor.items ?? [], { count: recall.count, feet: recall.feet, sceneId, feetTo: i => (own ? feetToPoint(own, { x: i.flags[SCOPE][AWAY_FLAG].x, y: i.flags[SCOPE][AWAY_FLAG].y }) : null) });
    if (!back.length) return refuse(far.length ? "glaivesFar" : "noGlaiveAway", { name: actor.name, spell: name });
    plan.recall = { ids: back.map(i => i.id), names: back.map(i => i.name) };
  }

  // Hellstrike: the space it leaps to, and every creature within 10 feet of where it lands (the card's rows).
  const leap = readLeap(sys.effect);
  if (leap) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { pickStep } = await import("./steps.mjs");
    const picked = await pickStep(own, { feet: leap.feet, sight: "see", name: actor.name });
    if (!picked) return null;
    const { feetApart } = await import("../canvas/footprints.mjs");
    const near = [];
    for (const tk of own.parent.tokens ?? []) {
      if (!tk.actor || tk.id === own.id || isDown(tk) || (tk.hidden && !isGM())) continue;
      const d = feetApart(own, tk, { from: { x: picked.to.x, y: picked.to.y } });
      if (d !== null && d <= leap.ring + 1e-6) near.push(tk);
    }
    near.sort((a, b) => a.id.localeCompare(b.id));
    rows = await snapshotsOf(near);
    plan.leap = { to: picked.to, feet: leap.feet, sceneId: own.parent.id, tokenId: own.id };
    plan.noArea = true;
  }

  // Flame Crash: the glaives wielded, one or both thrown, a point within 30 feet for each, and a GM for the ground.
  const crash = readFlameCrash(sys.effect);
  if (crash) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const held = wieldedGlaives(actor.items ?? []);
    if (!held.length) return refuse("noGlaive", { name: actor.name, spell: name });
    if (noGM([false])) return refuse("noGM", { spell: name });
    let thrown = held.slice(0, 1);
    if (held.length > 1) {
      const { chooseOption } = game.system.azeroth.workflows;
      const options = held.slice(0, crash.most).map(i => ({ key: i.id, name: i.name, description: "", checked: true }));
      const picked = await chooseOption(spell, options, null, { prompt: t("AZEROTH.DhSpell.Crash.Prompt", { spell: name }), max: Math.min(crash.most, options.length) });
      if (!picked) return null;
      thrown = picked.map(p => held.find(i => i.id === p.key)).filter(Boolean);
    }
    const { pickPoint } = await import("../canvas/place.mjs");
    const { feetToPoint } = await import("../canvas/footprints.mjs");
    const throws = [];
    for (const glaive of thrown) {
      const point = await pickPoint({
        hint: t("AZEROTH.DhSpell.Crash.Hint", { glaive: glaive.name, feet: crash.range }),
        sceneId: own.parent.id,
        accept: p => {
          const d = feetToPoint(own, p);
          if (d !== null && d !== undefined && d <= crash.range + 1e-6) return true;
          ui.notifications?.warn(t("AZEROTH.DhSpell.Refuse.crashFar", { feet: crash.range }));
          return false;
        }
      });
      if (!point) return null;
      throws.push({ itemId: glaive.id, name: glaive.name, x: Math.round(point.x), y: Math.round(point.y) });
    }
    plan.crash = { throws, radius: crash.radius, range: crash.range, sceneId: own.parent.id, source: own ? { sceneId: own.parent.id, tokenId: own.id } : null };
    plan.noArea = true;
  }

  // Glaive Tempest: a weapon in hand and every enemy within its reach (the card's rows); the strikes follow the card.
  if (readTempest(sys.effect)) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { mainHandOf } = await import("../rules/class-features.mjs");
    const weapon = mainHandOf(actor.readyWeapons?.() ?? []);
    if (!weapon) return refuse("noWeapon", { name: actor.name, spell: name });
    const { reachOfActor } = await import("../canvas/engaged.mjs");
    const { feetApart } = await import("../canvas/footprints.mjs");
    const reach = reachOfActor(actor);
    const near = [];
    for (const tk of own.parent.tokens ?? []) {
      if (!tk.actor || tk.id === own.id || isDown(tk) || (tk.hidden && !isGM())) continue;
      const d = feetApart(own, tk);
      if (d !== null && d <= reach + 1e-6 && (await relationOf(actor, own, tk.actor, tk)) === "enemy") near.push(tk);
    }
    if (!near.length) return refuse("noEnemyInReach", { name: actor.name, spell: name, feet: reach });
    near.sort((a, b) => a.id.localeCompare(b.id));
    rows = await snapshotsOf(near);
    plan.tempest = { weaponId: weapon.id, reach, targets: near.map(tk => ({ sceneId: tk.parent.id, tokenId: tk.id })) };
  }

  // Hunting Ground: the circle where the caster stands, the caster's own; and the Apply each self spell's door replaces.
  const hunting = readHuntingGround(sys.effect);
  if (hunting) {
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    const { areaFor } = await import("../rules/areas.mjs");
    const { circleAround } = await import("./demon-hunter-sight.mjs");
    const feet = areaFor(sys.target ?? "")?.distanceFt ?? 30;
    plan.hunting = { ...hunting, feet, centre: circleAround(own, feet) };
    plan.noArea = true;
  }
  if (readAuraLight(sys.effect) && own) plan.light = { ...readAuraLight(sys.effect), sceneId: own.parent.id, tokenId: own.id };
  return { plan, list: rows };
}

/** Every creature within the feet of the caster's token (itself included), measured footprint to footprint. */
async function creaturesWithin(own, feet) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const out = [];
  for (const tk of own.parent.tokens ?? []) {
    if (!tk.actor || (tk.hidden && !isGM())) continue;
    const d = tk.id === own.id ? 0 : feetApart(own, tk);
    if (d !== null && d <= feet + 1e-6) out.push({ actor: tk.actor, token: tk, feet: d });
  }
  return out;
}

/**
 * **THE SPELL SPELLSUNDER OR SIPHON THE WEAVE ENDS**, picked through the one chooser: every laid spell effect on
 * the creatures given that the one Dispel judgement passes (`rules/dispel.mjs#dispelJudgement`, a held Sustain's
 * effect as its cast), and every Sustain each creature holds (`judgeHeldCast`), at or below the tier. Null where
 * nothing qualifies (said in words) or the chooser is dismissed.
 */
async function pickSpellToEnd(spell, { maxTier = 1, creatures = [], kind = "sunder" } = {}) {
  const { dispelJudgement, judgeHeldCast } = await import("../rules/dispel.mjs");
  const { archmageCasters, plainEffect, sustainsFor, archmageAmong } = await import("./dispel.mjs");
  const rows = [];
  for (const { actor: who, feet } of creatures) {
    const effects = (who.effects ?? []).map(plainEffect);
    const archmage = archmageCasters(effects);
    const sustains = sustainsFor(effects);
    for (const e of effects) {
      if (e.disabled) continue;
      const f = e.flags?.[SCOPE] ?? {};
      const spellUuid = typeof f.spell === "string" ? f.spell : (f.tick?.castUuid ?? null);
      if (!spellUuid) continue;
      const j = dispelJudgement(e, { archmage, held: Object.keys(sustains) });
      if (!j.ok) continue;
      const casterUuid = j.sustain?.by ?? (typeof e.origin === "string" ? e.origin : null);
      const casterActor = actorAt(casterUuid);
      rows.push({
        key: `effect:${who.uuid}:${e.id}`, kind: "effect", creatureUuid: who.uuid, effectId: e.id, sustainCast: j.sustain?.cast ?? null,
        casterUuid, tier: tierOfSpell(spellUuid, casterActor), feet, sustained: Boolean(j.sustain),
        name: t("AZEROTH.DhSpell.Pick.Effect", { spell: e.name, name: who.name }),
        local: !j.sustain || (casterActor?.isOwner === true && who.isOwner === true), ownedHere: who.isOwner === true
      });
    }
    const archHeld = archmageAmong([who.uuid]);
    for (const entry of who.getFlag?.(SCOPE, "sustaining") ?? []) {
      if (!entry?.cast) continue;
      if (!judgeHeldCast({ by: who.uuid }, { archmage: archHeld }).ok) continue;
      rows.push({
        key: `sustain:${who.uuid}:${entry.cast}`, kind: "sustain", creatureUuid: who.uuid, cast: entry.cast, casterUuid: who.uuid,
        tier: tierOfSpell(entry.uuid, who, entry.spellId), feet, sustained: true,
        name: t("AZEROTH.DhSpell.Pick.Sustain", { spell: entry.name ?? "", name: who.name }), local: true, ownedHere: who.isOwner === true
      });
    }
  }
  const options = spellCandidates(rows, { maxTier }).map(r => ({ ...r, description: t("AZEROTH.DhSpell.Pick.Tier", { n: r.tier }) }));
  if (!options.length) return refuse("nothingToEnd", { spell: spell.name, tier: maxTier });
  const { chooseOption } = game.system.azeroth.workflows;
  const pick = await chooseOption(spell, options, null, { prompt: t(`AZEROTH.DhSpell.Pick.Prompt.${kind}`, { spell: spell.name, tier: maxTier }) });
  if (!pick) return null;
  const { description, available, checked, ...row } = pick;
  return row;
}

/* -------------------------------------------- */
/*  Once the cast went off                       */
/* -------------------------------------------- */

/** A self effect the cast lays on the caster (one a spell: a recast replaces it), with its words. */
async function layOwn(actor, spell, { span = {}, changes = [], extra = {}, cast = null, text = null, words = {} } = {}) {
  const sys = spell.system ?? {};
  const prior = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[DH_OWN_FLAG] === sys.identifier).map(e => e.id);
  if (prior.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prior);
  const [laid] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: sys.effect ?? "", ...span,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes },
    // The spell and the cast it answers to, so a Sustain's end lifts it (`workflows.liftSpellEffects`).
    flags: { [SCOPE]: { [DH_OWN_FLAG]: sys.identifier ?? null, identifier: sys.identifier ?? null, spell: spell.uuid, spellName: spell.name, cast, ...extra } }
  }]);
  return laid && text ? [t(text, { name: actor.name, spell: spell.name, ...words })] : [];
}

/** The typed-lane changes a blow's own extra rides (`spell-bonus.mjs#typedLaneExtras`, D-777), `final`. */
export function hitBonusChanges(hit) {
  return hit ? [{ key: `system.damageBonus.typed.attack.${hit.type}`, type: "add", value: String(hit.amount), phase: "final" }] : [];
}

/**
 * **WHAT THE CAST DOES ONCE ITS TEST SUCCEEDED** (07 §8: a failed cast spends its Energy and does nothing).
 * Answers the card's lines.
 */
export async function dhSpellAfterCast({ actor, spell, plan = null, list = [], spellDC = null, cast = null, source = null } = {}) {
  const sys = spell?.system ?? {};
  if (!plan || !dhScope(sys, actor)) return [];
  const lines = [];
  const name = spell.name;
  if (plan.brand) lines.push(...await brandLands(actor, spell, plan.brand, { cast }));
  // Searing Edge: *your weapon hits deal 1 more Fel damage* for the minute, on the attack door's typed lane.
  const hit = readHitBonus(sys.effect);
  if (hit && !plan.tempest) lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys), changes: hitBonusChanges(hit), cast, text: "AZEROTH.DhSpell.Edge.Laid", words: { n: hit.amount, type: game.i18n.localize(AZEROTH.damageTypes?.[hit.type] ?? hit.type) } }));
  if (plan.gaze) {
    lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys), cast, extra: { [GAZE_FLAG]: { feet: plan.gaze.feet, centre: plan.gaze.centre, allies: plan.gaze.allies, by: actor.uuid, cast, source: name } }, text: "AZEROTH.DhSpell.Gaze.Laid", words: { n: plan.gaze.allies.length } }));
  }
  // Immolation Aura's light, on the caster's token for as long as the Sustain stands.
  const light = readAuraLight(sys.effect);
  if (light && plan.light) lines.push(...await auraLightLands(actor, plan.light, { name }));
  if (plan.recall) lines.push(...await recallLands(actor, spell, plan.recall));
  // Hellstrike's leap, to the space picked before anything was paid.
  if (plan.leap) {
    const scene = game.scenes?.get(plan.leap.sceneId);
    const token = scene?.tokens?.get(plan.leap.tokenId) ?? null;
    const { stepTo, steppedWords } = await import("./steps.mjs");
    const r = token ? await stepTo({ token, to: plan.leap.to, feet: plan.leap.feet, by: actor }) : { moved: false, name: actor.name, reason: "gone" };
    lines.push(steppedWords(r, { feet: plan.leap.feet, source: name }));
  }
  // Siphon the Weave on a spell that is not its creature's own: it ends at once, with its Energy (no Test).
  const picked = plan.card?.picked ?? null;
  // Devour the Spell's Spell DC rides the card, for the Spirit Test the GM's client rolls in flight (D-1726).
  if (plan.devour && plan.card) plan.card.spellDC = spellDC ?? null;
  if (picked && plan.noResist === true && sys.identifier === "siphon-the-weave") {
    lines.push(...await endPickedSpell({ caster: actor, picked, kind: "siphon", spellName: name, messageId: null, spellUuid: spell.uuid }));
  }
  const agility = readAgility(sys.effect);
  if (agility) {
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    lines.push(...await layOwn(actor, spell, { span: untilEndOfNextTurnOrRound(actor) ?? {}, cast, extra: { [AGILITY_FLAG]: { banes: agility.banes, noOpportunity: agility.noOpportunity, source: name } }, text: "AZEROTH.DhSpell.Agility.Laid" }));
  }
  // Flame Crash: each glaive thrown stays equipped and lies where it landed (C55, C57); the ground follows the card.
  if (plan.crash) {
    const updates = plan.crash.throws.filter(th => actor.items.get(th.itemId)).map(th => ({
      _id: th.itemId, [`flags.${SCOPE}.${AWAY_FLAG}`]: { sceneId: plan.crash.sceneId, x: th.x, y: th.y, cast, source: name }
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    lines.push(t("AZEROTH.DhSpell.Crash.Thrown", { name: actor.name, glaives: plan.crash.throws.map(th => th.name).join(", ") }));
  }
  const hunting = readHuntingGround(sys.effect);
  if (hunting && plan.hunting) {
    lines.push(...await layOwn(actor, spell, { cast, extra: { [HUNTING_FLAG]: { feet: plan.hunting.feet, centre: plan.hunting.centre, ground: hunting.ground, noOpportunity: hunting.noOpportunity, reveals: hunting.reveals, cast, source: name } }, text: "AZEROTH.DhSpell.Hunting.Laid", words: { feet: plan.hunting.feet } }));
  }
  return lines;
}

/**
 * **HUNTER'S BRAND, LAID** (*For the duration you know the target's direction and distance while it is within 1
 * mile of you*): the brand on the creature for the hour - here where this client owns it, else on the GM's - and
 * a card to the hunter's owners with the Track press.
 */
/**
 * **THE BRAND'S EFFECT, BUILT FROM THE WORLD** (the review's C5): the spell's own words and duration, the creature's
 * own kind, the caster's uuid - the ONE builder for this client and the GM's, so the GM never creates a payload's
 * effect whole.
 */
async function brandEffectData(actor, spell, who, { cast = null } = {}) {
  const span = await spellSpan(who, spell.system ?? {});
  const { kindsOfActor } = await import("./area-strikes.mjs");
  return {
    name: spell.name, img: spell.img, origin: actor.uuid, description: spell.system?.effect ?? "", ...span,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [] },
    flags: { [SCOPE]: { spell: spell.uuid, spellName: spell.name, identifier: spell.system?.identifier ?? null, cast, [BRAND_FLAG]: { by: actor.uuid, demon: kindsOfActor(who).has("demon"), source: spell.name, cast } } }
  };
}

async function brandLands(actor, spell, brand, { cast = null } = {}) {
  const who = actorAt(brand.uuid);
  if (!who) return [];
  try {
    if (who.isOwner) {
      const data = await brandEffectData(actor, spell, who, { cast });
      const prior = (who.effects ?? []).filter(e => e.flags?.[SCOPE]?.[BRAND_FLAG]?.by === actor.uuid).map(e => e.id);
      if (prior.length) await who.deleteEmbeddedDocuments("ActiveEffect", prior);
      await who.createEmbeddedDocuments("ActiveEffect", [data]);
    } else {
      // The spell and the cast named, never the effect (the review's C5): the GM's client builds it.
      await askGM({ act: "effect", casterUuid: actor.uuid, targetUuid: who.uuid, spellUuid: spell.uuid, cast });
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [];
  }
  await whisperCard(actor, spell.name, [t("AZEROTH.DhSpell.Brand.Laid", { name: brand.name })],
    { presses: [{ press: "track", label: game.i18n.localize("AZEROTH.DhSpell.Brand.Track") }], flags: { dhCard: { press: "track", casterUuid: actor.uuid, targetUuid: who.uuid, tokenId: brand.tokenId, sceneId: brand.sceneId, feet: brand.feet, name: brand.name, spell: spell.name } } });
  return [t(brand.demon ? "AZEROTH.DhSpell.Brand.LaidDemon" : "AZEROTH.DhSpell.Brand.Laid", { name: brand.name })];
}

/**
 * **THE BRAND'S TRACK** (*you know the target's direction and distance*): the caster's token to the branded
 * creature's, footprint to footprint, and the compass point; *within 1 mile*, and on the hunter's own board.
 */
async function trackBrand(row) {
  const caster = actorAt(row.casterUuid);
  const target = actorAt(row.targetUuid);
  if (!caster || !target) { ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.TargetGone")); return null; }
  const standing = (target.effects ?? []).some(e => e.active !== false && e.flags?.[SCOPE]?.[BRAND_FLAG]?.by === caster.uuid);
  if (!standing) { ui.notifications?.warn(t("AZEROTH.DhSpell.Brand.Ended", { name: target.name })); return null; }
  const mine = canvas?.scene?.tokens?.find?.(tk => tk.actor === caster || (tk.actorLink && tk.actorId === caster.id)) ?? null;
  const theirs = mine?.parent?.tokens?.find?.(tk => tk.actor === target || tk.actor?.uuid === target.uuid || (tk.actorLink && tk.actorId === target.id)) ?? null;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { centreOf } = await import("./demon-hunter-sight.mjs");
  const a = mine ? centreOf(mine) : null;
  const b = theirs ? centreOf(theirs) : null;
  const reading = brandReading({ feet: mine && theirs ? feetApart(mine, theirs) : null, dx: a && b ? b.x - a.x : 0, dy: a && b ? b.y - a.y : 0, sameScene: Boolean(mine && theirs), reach: Number(row.feet) || FEET_PER_MILE });
  const words = reading.known
    ? t("AZEROTH.DhSpell.Brand.Reading", { name: target.name, feet: reading.feet, point: game.i18n.localize(`AZEROTH.DhSpell.Compass.${reading.point}`) })
    : t(`AZEROTH.DhSpell.Brand.${reading.why === "far" ? "Far" : "Elsewhere"}`, { name: target.name });
  ui.notifications?.info(words);
  return words;
}

/** Immolation Aura's bright light on the caster's token, the token's own light kept to put back. */
async function auraLightLands(actor, light, { name = "" } = {}) {
  const token = game.scenes?.get(light.sceneId)?.tokens?.get(light.tokenId) ?? null;
  if (!token?.isOwner) return [];
  const held = token.getFlag(SCOPE, AURA_LIGHT_FLAG) ?? foundry.utils.deepClone(token._source?.light ?? {});
  await token.update({ light: { bright: light.bright, dim: light.bright, color: "#5ed73a", alpha: 0.5 }, [`flags.${SCOPE}.${AURA_LIGHT_FLAG}`]: held });
  return [t("AZEROTH.DhSpell.Aura.Light", { name: actor.name, feet: light.bright, spell: name })];
}

/**
 * **THE LIGHT GOES WITH THE SUSTAIN**: a token wearing Immolation Aura's light whose actor no longer sustains it
 * takes its own light back. Asked on the active GM's client whenever an actor's Sustains change.
 */
export async function restoreAuraLight(actor) {
  if (!actor || !game.users?.activeGM?.isSelf) return 0;
  const holds = (actor.getFlag?.(SCOPE, "sustaining") ?? []).some(e => e?.identifier === "immolation-aura");
  if (holds) return 0;
  let n = 0;
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    if (token.actor !== actor && !(token.actorLink && token.actorId === actor.id)) continue;
    const held = token.getFlag?.(SCOPE, AURA_LIGHT_FLAG);
    if (!held) continue;
    await token.update({ light: held, [`flags.${SCOPE}`]: { [AURA_LIGHT_FLAG]: new foundry.data.operators.ForcedDeletion() } });
    n++;
  }
  return n;
}

/**
 * **CALL THE GLAIVES** (C55: *Up to two glaives you have equipped fly back to your hands*): each glaive judged
 * in reach at the cast leaves its `away` mark and is in the hand again, still on its slot.
 */
async function recallLands(actor, spell, recall) {
  const ids = recall.ids.filter(id => actor.items.get(id)?.flags?.[SCOPE]?.[AWAY_FLAG]);
  if (!ids.length) return [];
  await actor.updateEmbeddedDocuments("Item", ids.map(id => ({ _id: id, flags: { [SCOPE]: { [AWAY_FLAG]: new foundry.data.operators.ForcedDeletion() } } })));
  return [t("AZEROTH.DhSpell.Recall.Back", { name: actor.name, glaives: ids.map(id => actor.items.get(id)?.name ?? "").join(", ") })];
}

/* -------------------------------------------- */
/*  Once the card stands                         */
/* -------------------------------------------- */

/**
 * **WHAT FOLLOWS THE CARD** (a succeeded cast): Flame Crash's burning ground and Glaive Tempest's attacks. Guarded:
 * the cast has gone off whatever this does.
 */
export async function dhSpellAfterCard({ actor, spell, plan = null, spellCard = null, success = false } = {}) {
  if (!success || !plan || !spellCard) return [];
  const lines = [];
  if (plan.crash) lines.push(...await placeCrash(actor, spell, plan, spellCard));
  if (plan.tempest) lines.push(...await tempestStrikes(actor, spell, plan));
  return lines;
}

/** Flame Crash's ground: one Region, a circle at each landing point, here where this client is the GM, else on the GM's. */
async function placeCrash(actor, spell, plan, spellCard) {
  try {
    const done = await askGM({ act: "crash", casterUuid: actor.uuid, messageId: spellCard.id, throws: plan.crash.throws.map(th => ({ x: th.x, y: th.y })), sceneId: plan.crash.sceneId });
    return done?.regionId ? [t("AZEROTH.DhSpell.Crash.Ground", { name: actor.name, n: plan.crash.throws.length })] : [];
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [];
  }
}

/**
 * The GM-side half of Flame Crash's ground, judged again off the card: a succeeded Flame Crash of this caster,
 * no Region placed for it yet, at most two points, each within the spell's range of the caster's token.
 */
async function placeCrashHere(caster, { messageId = null, throws = [], sceneId = null } = {}) {
  const message = game.messages?.get(messageId) ?? null;
  const flags = message?.flags?.[SCOPE] ?? {};
  if (!message || flags.kind !== "spell" || flags.success !== true || flags.identifier !== "flame-crash") throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.crashCard"));
  const scene = game.scenes?.get(sceneId) ?? null;
  if (!scene) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if ((scene.regions ?? []).some(r => r.flags?.[SCOPE]?.cast && r.flags[SCOPE].cast === flags.cast)) return { regionId: null };
  const item = caster.items?.find?.(i => i.type === "spell" && i.system?.identifier === "flame-crash") ?? (flags.spellUuid ? await fromUuid(flags.spellUuid) : null);
  const read = readFlameCrash(item?.system?.effect ?? flags.effectHTML ?? "");
  if (!read) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.crashCard"));
  const own = scene.tokens.find(tk => tk.actor === caster || tk.actor?.uuid === caster.uuid || (tk.actorLink && tk.actorId === caster.id)) ?? null;
  const { feetToPoint } = await import("../canvas/footprints.mjs");
  const points = (Array.isArray(throws) ? throws : []).slice(0, read.most).filter(p => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)))
    .filter(p => !own || (feetToPoint(own, p) ?? Infinity) <= read.range + 1e-6);
  if (!points.length) throw new Error(t("AZEROTH.DhSpell.Refuse.crashFar", { feet: read.range }));
  const { regionFlagsFromCard } = await import("../dice/chat.mjs");
  const record = regionFlagsFromCard(message, caster, item);
  const size = scene.grid?.size ?? 100;
  const per = Number(scene.grid?.distance) || 5;
  const radius = (read.radius / per) * size;
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: item?.name ?? flags.spellName ?? "Flame Crash",
    color: "#3cb043",
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    shapes: points.map(p => ({ type: "circle", x: Math.round(Number(p.x)), y: Math.round(Number(p.y)), radius, radiusX: radius, radiusY: radius })),
    // The burning ground's own key beside the cast (Phase 6, D-1580): a timed area stands no spell loop, so the
    // Region is filed as the ground's feature row and stands its fire for as long as it does
    // (`rules/demon-hunter-animations.mjs#FLAME_CRASH_GROUND_KEY`). Its `cast` and area tick are unchanged.
    flags: { [SCOPE]: { ...record, featureKey: FLAME_CRASH_GROUND_KEY } }
  }]);
  return { regionId: region?.id ?? null };
}

/**
 * **GLAIVE TEMPEST'S ATTACKS** (*Make one weapon attack against each enemy within your reach. Each hit deals 2 more
 * Fel damage*): one attack a creature the cast named, each through the attack door with `budget: "none"` - the
 * spell's own words are the exception to one Attack a round, and the cast paid its Half-Action - and the 2 Fel on
 * the attack door's typed lane for these attacks alone, laid before the first and lifted after the last.
 */
async function tempestStrikes(actor, spell, plan) {
  const weapon = actor.items.get(plan.tempest.weaponId) ?? null;
  if (!weapon) return [t("AZEROTH.DhSpell.Refuse.noWeapon", { name: actor.name, spell: spell.name })];
  const hit = readHitBonus(spell.system?.effect ?? "");
  const [laid] = hit ? await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: "", showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
    system: { changes: hitBonusChanges(hit) }, flags: { [SCOPE]: { [DH_OWN_FLAG]: "glaive-tempest-strikes" } }
  }]) : [];
  const { attackWithDialog } = await import("../applications/actions.mjs");
  let made = 0;
  try {
    for (const row of plan.tempest.targets) {
      const token = game.scenes?.get(row.sceneId)?.tokens?.get(row.tokenId) ?? null;
      if (!token?.actor || isDown(token)) continue;
      const [snap] = await snapshotsOf([token]);
      if (!snap) continue;
      const card = await attackWithDialog(actor, weapon, null, { budget: "none", targets: [snap] });
      if (card) made++;
    }
  } finally {
    if (laid && actor.effects.get(laid.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [laid.id]);
  }
  return [t("AZEROTH.DhSpell.Tempest.Struck", { name: actor.name, n: made })];
}

/* -------------------------------------------- */
/*  A failed Resist                              */
/* -------------------------------------------- */

/**
 * **A DEMON HUNTER SPELL'S FAILED RESIST** (`dice/chat.mjs#rollResists`, on the client that rolled the Test,
 * which owns the creature), once the shared door has laid the conditions the entry bolds.
 */
export async function dhSpellAfterResist({ message, actor, maker = null, laid = {}, result = null } = {}) {
  const lines = [];
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !actor || !flags.demonHunterSpell) return lines;
  const plan = flags.demonHunterSpell;
  const effect = flags.effectHTML ?? "";
  const spell = flags.spellName ?? "";
  const caster = maker;
  const span = flags.duration ? await castSpan(actor, flags.duration, caster) : {};
  const condEffect = id => (laid?.[id]?.effectId ? actor.effects?.get?.(laid[id].effectId) ?? null : null);

  // Eye Beam: *Scorched 2* on the Scorched the failure laid (A1's Scorched X).
  const scorched = readScorchedValue(effect);
  if (scorched && condEffect("scorched")) {
    await condEffect("scorched").update({ [`flags.${SCOPE}.value`]: scorched });
    lines.push(t("AZEROTH.DhSpell.Beam.Scorched", { name: actor.name, n: scorched, spell }));
  }

  // Shear: the Health maximum drops by twice the caster's tier for the minute, and the Health with it.
  const shear = readShear(effect);
  if (shear) {
    const drop = shearDrop(caster?.system?.tier ?? plan.casterTier ?? 1, shear.per);
    const prior = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[SHEAR_FLAG]?.by === (caster?.uuid ?? null)).map(e => e.id);
    if (prior.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prior);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/downgrade.svg", origin: caster?.uuid ?? null, description: effect, ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: [{ key: "system.health.max", type: "add", value: String(-drop), phase: "final" }] },
      flags: { [SCOPE]: { spell: flags.spellUuid ?? null, spellName: spell, identifier: flags.identifier ?? null, cast: flags.cast ?? null, [SHEAR_FLAG]: { by: caster?.uuid ?? null, amount: drop, source: spell } } }
    }]);
    const max = Math.max(0, Math.trunc(Number(actor.system?.health?.max)) || 0);
    const value = Math.max(0, Math.trunc(Number(actor.system?.health?.value)) || 0);
    if (shear.clamps && value > max) await actor.update({ "system.health.value": clampedHealth(value, max) });
    lines.push(t("AZEROTH.DhSpell.Shear.Laid", { name: actor.name, n: drop, spell }));
  }

  // Draw Soul: the caster regains 2 Health for this creature's failure.
  const drawHeal = readDrawHeal(effect);
  if (drawHeal && caster) {
    try {
      const healed = await healCaster(caster, drawHeal.per, { messageId: message.id, from: actor.uuid, resultId: result?.id ?? null });
      lines.push(t("AZEROTH.DhSpell.Draw.Healed", { name: caster.name, n: healed, spell }));
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }

  // Inner Demon: its torment - 3 Fel at the start of each of its turns - on a carrier tied to the Frightened, and the
  // two conditions stamped with the cast, so the repeat Test's pass ends both and the torment with them.
  const torment = readTorment(effect);
  if (torment) {
    const frightened = condEffect("frightened");
    const entangled = condEffect("entangled");
    for (const e of [frightened, entangled].filter(Boolean)) await e.update({ [`flags.${SCOPE}.cast`]: flags.cast ?? null });
    const { TICK_FLAG } = await import("./ticks.mjs");
    const { roundsIn } = await import("../rules/area-ticks.mjs");
    const tick = tormentTick(torment, { rounds: roundsIn({ kind: "timed", text: "1 minute" }) ?? 10, source: caster?.uuid ?? null, cast: flags.cast ?? null, name: spell, castUuid: flags.spellUuid ?? null });
    const prior = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[TORMENT_FLAG] && e.flags[SCOPE][TORMENT_FLAG].by === (caster?.uuid ?? null)).map(e => e.id);
    if (prior.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prior);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/terror.svg", origin: caster?.uuid ?? null, description: effect, ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [] },
      flags: { [SCOPE]: { [TICK_FLAG]: tick, [TORMENT_FLAG]: { by: caster?.uuid ?? null, cast: flags.cast ?? null, frightenedId: frightened?.id ?? null, entangledId: entangled?.id ?? null } } }
    }]);
    lines.push(t("AZEROTH.DhSpell.Torment.Laid", { name: actor.name, n: torment.amount, spell }));
  }

  // Nether Snare: no teleport, no turning invisible (the condition door refuses core's invisible), no portal.
  const snare = readSnare(effect);
  if (snare) {
    const { IMMUNE_FLAG } = await import("../rules/legacy-uses.mjs");
    const { HIDDEN_STATUS } = await import("../rules/stealth.mjs");
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/net.svg", origin: caster?.uuid ?? null, description: effect, ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [] },
      flags: { [SCOPE]: { spell: flags.spellUuid ?? null, spellName: spell, identifier: flags.identifier ?? null, cast: flags.cast ?? null,
        [SNARE_FLAG]: { by: caster?.uuid ?? null, source: spell, boonFor: snare.boonFor, teleport: snare.teleport, portal: snare.portal },
        [IMMUNE_FLAG]: { conditions: [HIDDEN_STATUS], source: spell } } }
    }]);
    lines.push(t("AZEROTH.DhSpell.Snare.Laid", { name: actor.name, spell }));
  }

  // Spellsunder, Siphon the Weave (the creature its spell's own caster) and Devour the Spell: the picked spell ends.
  const picked = plan.picked ?? null;
  if (picked) {
    const kind = flags.identifier === "siphon-the-weave" ? "siphon" : flags.identifier === "devour-the-spell" ? "devour" : "sunder";
    lines.push(...await endPickedSpell({ caster, picked, kind, spellName: spell, messageId: message.id }));
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/** Heal the caster: here where this client owns it, else through the GM (one heal a creature a card). */
async function healCaster(caster, n, { messageId = null, from = null, resultId = null } = {}) {
  const amount = Math.max(0, Math.trunc(Number(n)) || 0);
  if (!caster || !amount) return 0;
  if (caster.isOwner) {
    const before = caster.system?.health?.value ?? 0;
    await caster.applyHealing?.(amount, { from: caster, givenBy: caster, spell: true, school: "fel" });
    return Math.max(0, (caster.system?.health?.value ?? before) - before);
  }
  const done = await askGM({ act: "heal", casterUuid: caster.uuid, amount, messageId, from, resultId });
  return Math.max(0, Number(done?.healed) || 0);
}

/**
 * **END THE PICKED SPELL** (Spellsunder, Siphon the Weave, Devour the Spell): judged again off the world as it
 * stands - still there, still at or below the tier, still passed by the one Dispel judgement - and ended through
 * the doors that end a spell: the effect deleted, a Sustain through `workflows.endSustain` matched on its cast (an
 * effect of a held Sustain ends as the cast, O-308). Then Siphon's Energy (twice the tier) or Devour's Hatred (the
 * tier plus 2, the named source `devour`). Here where this client may write every document, else on the GM's.
 */
export async function endPickedSpell({ caster, picked, kind = "sunder", spellName = "", messageId = null, spellUuid = null } = {}) {
  let done = null;
  try {
    const target = actorAt(picked.creatureUuid);
    const sustainer = actorAt(picked.kind === "sustain" ? picked.casterUuid : (picked.sustainCast ? picked.casterUuid : null));
    const local = target?.isOwner === true && (!sustainer || sustainer.isOwner === true);
    done = local ? await endHere(picked) : await askGM({ act: "end", casterUuid: caster?.uuid ?? null, picked, messageId, spellUuid });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [];
  }
  if (!done?.ended) return [t("AZEROTH.DhSpell.Pick.NotEnded", { spell: spellName, name: done?.name ?? "" })];
  const lines = [t("AZEROTH.DhSpell.Pick.Ended", { spell: done.spell ?? "", name: done.name ?? "", by: spellName })];
  const tier = Math.max(1, Math.trunc(Number(done.tier ?? picked.tier)) || 1);
  if (kind === "siphon" && caster) {
    const n = siphonEnergy(tier, picked.regain || 2);
    const r = await regainEnergy(caster, n, { messageId });
    if (r > 0) lines.push(t("AZEROTH.DhSpell.Siphon.Energy", { name: caster.name, n: r }));
  }
  if (kind === "devour" && caster) {
    const n = devourHatred(tier, picked.plus ?? 2);
    const r = await gainHatred(caster, n, { messageId });
    if (r > 0) lines.push(t("AZEROTH.DhSpell.Devour.Hatred", { name: caster.name, n: r }));
  }
  return lines;
}

/** The end itself, on a client that may write every document it touches. */
async function endHere(picked) {
  const { dispelJudgement } = await import("../rules/dispel.mjs");
  const { archmageCasters, plainEffect, sustainsFor } = await import("./dispel.mjs");
  const target = actorAt(picked.creatureUuid);
  if (!target) return { ended: false, name: "" };
  if (picked.kind === "effect") {
    const e = target.effects?.get?.(picked.effectId) ?? null;
    if (!e) return { ended: false, name: target.name };
    const plain = plainEffect(e);
    const sustains = sustainsFor([plain]);
    const j = dispelJudgement(plain, { archmage: archmageCasters([plain]), held: Object.keys(sustains) });
    const f = e.flags?.[SCOPE] ?? {};
    const tier = tierOfSpell(typeof f.spell === "string" ? f.spell : (f.tick?.castUuid ?? null), actorAt(j.sustain?.by ?? e.origin));
    if (!j.ok || !tier || tier > Math.max(1, Math.trunc(Number(picked.maxTier ?? picked.tier)) || 1)) return { ended: false, name: target.name };
    if (j.sustain) {
      const holder = actorAt(j.sustain.by);
      const gone = holder ? await game.system.azeroth.workflows.endSustain({ actor: holder, cast: j.sustain.cast, notice: "AZEROTH.DhSpell.Pick.SustainNotice" }) : null;
      return { ended: Boolean(gone), name: target.name, spell: gone?.name ?? e.name, tier };
    }
    await target.deleteEmbeddedDocuments("ActiveEffect", [e.id]);
    return { ended: true, name: target.name, spell: e.name, tier };
  }
  const entry = (target.getFlag?.(SCOPE, "sustaining") ?? []).find(s => s?.cast === picked.cast) ?? null;
  if (!entry) return { ended: false, name: target.name };
  const tier = tierOfSpell(entry.uuid, target, entry.spellId);
  if (!tier || tier > Math.max(1, Math.trunc(Number(picked.maxTier ?? picked.tier)) || 1)) return { ended: false, name: target.name };
  const gone = await game.system.azeroth.workflows.endSustain({ actor: target, cast: picked.cast, notice: "AZEROTH.DhSpell.Pick.SustainNotice" });
  return { ended: Boolean(gone), name: target.name, spell: gone?.name ?? entry.name ?? "", tier };
}

/** The Demon Hunter's own Energy pool (its class item's), else the first Energy it holds. */
function energyPoolOf(actor) {
  const pools = (actor?.poolSnapshot?.() ?? []).filter(p => p.kind === "power" && p.name === "energy");
  const cls = dhClassOf(actor);
  return pools.find(p => cls && p.itemId === cls.id) ?? pools[0] ?? null;
}

/** Siphon the Weave's Energy: a rise inside the one pool queue, capped at the pool. Answers what was gained. */
async function regainEnergy(caster, amount, { messageId = null } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!caster || !n) return 0;
  if (!caster.isOwner) {
    const done = await askGM({ act: "energy", casterUuid: caster.uuid, amount: n, messageId }).catch(err => { ui.notifications?.warn(err.message); return null; });
    return Math.max(0, Number(done?.gained) || 0);
  }
  const { poolWrite } = await import("../documents/pool-writes.mjs");
  return poolWrite(caster, async () => {
    const pool = energyPoolOf(caster);
    if (!pool) return 0;
    const before = Math.max(0, Math.trunc(Number(pool.value)) || 0);
    const after = Math.min(Math.max(Math.trunc(Number(pool.max)) || 0, before), before + n);
    if (after !== before) await caster.writePoolsNow([{ itemId: pool.itemId, kind: "power", value: after }]);
    return after - before;
  });
}

/** Devour the Spell's Hatred, under its named source (`devour`, `named-gains.mjs#HATRED_GAIN_SOURCES`). */
async function gainHatred(caster, amount, { messageId = null } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!caster || !n) return 0;
  // **NO HATRED WHILE UNLEASHED, JUDGED FIRST** (the review's C9): the card never says *+n Hatred* for a rise the
  // pool refuses, and the GM's handler never marks the card paid for one.
  if (unleashedGainRefusal({ unleashed: caster.shape?.kind === "unleashed", source: "devour", before: 0, after: n })) return 0;
  if (!caster.isOwner) {
    const done = await askGM({ act: "hatred", casterUuid: caster.uuid, amount: n, messageId }).catch(err => { ui.notifications?.warn(err.message); return null; });
    return Math.max(0, Number(done?.gained) || 0);
  }
  const { adjustPool } = await import("../documents/pool-writes.mjs");
  const moved = await adjustPool(caster, { kind: "momentum", name: "hatred" }, n, { options: { hatredGain: "devour" } });
  return moved?.ok ? Math.max(0, moved.after - moved.before) : 0;
}

/* -------------------------------------------- */
/*  Presses                                      */
/* -------------------------------------------- */

/** The Demon Hunter's spell presses on a card (`dice/chat.mjs`'s `demonHunterCard` action): Track and Put out. */
export async function dhCardPress(button, message) {
  const row = message?.flags?.[SCOPE]?.dhCard ?? null;
  const press = button?.dataset?.dhPress ?? row?.press ?? null;
  if (!row || !press) return null;
  if (press === "track") return trackBrand(row);
  if (press === "putOut") return putOutFlames(row);
  return null;
}

/**
 * **AGONIZING FLAMES' WAY OUT** (*The target may spend an action to put the flames out, which ends the spell*): a
 * card to the burning creature's owners when the flames are laid (on the client that laid them), its press the
 * creature's own.
 */
export async function offerPutOut(effect) {
  const actor = effect?.parent ?? null;
  const f = effect?.flags?.[SCOPE] ?? {};
  if (!actor || actor.documentName !== "Actor" || f.identifier !== FLAMES_ID || !f.tick) return null;
  const item = actorAt(f.spell);
  if (!readPutOut(item?.system?.effect ?? effect.description ?? "")) return null;
  return whisperCard(actor, effect.name, [t("AZEROTH.DhSpell.Flames.Offer", { name: actor.name })],
    { presses: [{ press: "putOut", label: game.i18n.localize("AZEROTH.DhSpell.Flames.PutOut") }], flags: { dhCard: { press: "putOut", targetUuid: actor.uuid, effectId: effect.id, spell: effect.name } } });
}

/** Put the flames out: judged (still burning), then the action spent in a fight, then the flames gone. */
async function putOutFlames(row) {
  const actor = actorAt(row.targetUuid);
  const effect = actor?.effects?.get?.(row.effectId) ?? null;
  const no = putOutRefusal({ standing: Boolean(effect) });
  if (no) { ui.notifications?.warn(t(no, { name: actor?.name ?? "" })); return null; }
  if (!actor.isOwner) { ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.NotYours")); return null; }
  const { turnBudgetRefusal, spendTurnBudget } = game.system.azeroth.workflows;
  const short = turnBudgetRefusal?.(actor, "action");
  if (short) { ui.notifications?.warn(t(short.reason, short.params ?? {})); return null; }
  if (!(await spendTurnBudget(actor, "action"))) return null;
  if (actor.effects.get(effect.id)) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  const words = t("AZEROTH.DhSpell.Flames.Out", { name: actor.name, spell: row.spell ?? "" });
  ui.notifications?.info(words);
  return words;
}

/* -------------------------------------------- */
/*  At a move                                    */
/* -------------------------------------------- */

/**
 * **IMMOLATION AURA'S ENTERING HALF** (*Each enemy that ... moves within 5 feet of you on its turn, takes 2 Fel
 * damage, once a turn*), on the active GM's client off the move itself: a creature moving on its own turn in a
 * started fight, an enemy of a caster sustaining the aura on its scene, whose move brings it from outside the reach
 * to within it (`movesWithin`, footprint to footprint at each passed position), struck through the area door
 * (`strikeFromArea`) once a turn - claimed on the caster - and never where it started the turn within the reach,
 * which the start-of-turn tick struck. A displacement, an undo and a paste are no move (`creatureMoved`).
 */
export async function immolationOnMove(document, movement, operation = {}) {
  if (!game.users?.activeGM?.isSelf) return 0;
  const { creatureMoved } = await import("../rules/movement.mjs");
  if (!creatureMoved(movement, operation)) return 0;
  const scene = document?.parent ?? null;
  const mover = document?.actor ?? null;
  if (!scene || !mover || !movement?.passed?.waypoints?.length) return 0;
  const fight = mover.activeFight?.() ?? null;
  if (!fight?.started || fight.combatant?.tokenId !== document.id) return 0;
  const { feetBetweenFootprints, footprintOf } = await import("../canvas/footprints.mjs");
  const path = [movement.origin, ...movement.passed.waypoints].filter(Boolean);
  const history = document.movementHistory ?? document._movementHistory ?? [];
  const startAt = history[0] ?? movement.origin;
  const turnKey = `${fight.id}.${fight.round}.${fight.turn}`;
  let struck = 0;
  for (const holder of scene.tokens ?? []) {
    const caster = holder.actor ?? null;
    if (!caster || holder.id === document.id) continue;
    const entry = (caster.getFlag?.(SCOPE, "sustaining") ?? []).find(e => e?.identifier === "immolation-aura" && e?.areaTick?.centre === "self");
    if (!entry) continue;
    const feet = Number(entry.areaTick.feet) || 5;
    if ((await relationOf(caster, holder, mover, document)) !== "enemy") continue;
    const from = footprintOf(holder);
    const closest = path.reduce((least, p) => {
      const d = feetBetweenFootprints(from, footprintOf(document, p), scene.grid);
      return d === null ? least : Math.min(least, d);
    }, Infinity);
    const started = startAt ? feetBetweenFootprints(from, footprintOf(document, startAt), scene.grid) : null;
    if (!movesWithin({ started, closest: Number.isFinite(closest) ? closest : null, feet })) continue;
    const marks = caster.getFlag?.(SCOPE, IMMOLATION_ENTERED_FLAG) ?? {};
    if (struckThisTurn(marks, document.id, turnKey)) continue;
    await caster.setFlag(SCOPE, IMMOLATION_ENTERED_FLAG, { ...marks, [document.id]: turnKey });
    const { strikeFromArea } = await import("./area-strikes.mjs");
    const item = caster.items?.get?.(entry.spellId) ?? null;
    const spell = { name: entry.name ?? item?.name ?? "", school: item?.system?.school ?? "fel", tier: item?.system?.tier ?? 1, takesSpellpower: item?.system?.takesSpellpower === true };
    const lines = await strikeFromArea({ actor: mover, caster, spell, damage: entry.areaTick.damage });
    if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }), content: lines.map(l => `<p class="azeroth-drain">${foundry.utils.escapeHTML(String(l))}</p>`).join(""), flags: { [SCOPE]: { kind: "demonHunterCard", immolationEntered: true } } });
    struck++;
  }
  return struck;
}

/* -------------------------------------------- */
/*  The GM's side                                */
/* -------------------------------------------- */

/**
 * **THE GM-SIDE HANDLER** (`DH_SPELL_QUERY`): every write a Demon Hunter spell makes on a document the asker does
 * not own, judged again here off the world as it stands. Throws with the reason.
 */
export async function demonHunterSpellQueryHandler(payload = {}, { user = null } = {}) {
  const caster = payload.casterUuid ? await fromUuid(payload.casterUuid) : null;
  const gm = !user || user.isGM === true;
  const ownsCaster = gm || caster?.testUserPermission?.(user, "OWNER") === true;
  const message = payload.messageId ? game.messages?.get(payload.messageId) ?? null : null;
  const card = message?.flags?.[SCOPE] ?? {};
  switch (payload.act) {
    case "effect": {
      // Hunter's Brand alone, naming the asker's caster - and BUILT HERE off the spell and the creature (the review's
      // C5), never created whole from the payload.
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      const target = await fromUuid(payload.targetUuid);
      if (!target) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const spell = payload.spellUuid ? await fromUuid(payload.spellUuid) : null;
      if (spell?.type !== "spell" || !readBrand(spell.system?.effect ?? "") || (spell.parent && spell.parent !== caster)) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.unknownEffect"));
      const data = await brandEffectData(caster, spell, target, { cast: typeof payload.cast === "string" ? payload.cast : null });
      const prior = (target.effects ?? []).filter(e => e.flags?.[SCOPE]?.[BRAND_FLAG]?.by === caster.uuid).map(e => e.id);
      if (prior.length) await target.deleteEmbeddedDocuments("ActiveEffect", prior);
      const [made] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
      return { effectId: made?.id ?? null };
    }
    case "end": {
      // The asker owns the Demon Hunter or rolled the creature's Test on that caster's card; the end is judged again.
      // **THE PICK AND ITS CAP OFF THE CARD OR THE SPELL** (the review's C5): with a card, the card's own pick (the
      // payload must name the same) and the cap read off its effect text; with none (Siphon the Weave on the caster's
      // own cast), the caster's spell item's effect text. Never the payload's tier.
      const cardPicked = message ? (card.demonHunterSpell?.picked ?? null) : null;
      const picked = message ? (cardPicked && cardPicked.key === payload.picked?.key ? cardPicked : null) : (payload.picked ?? null);
      const resister = picked?.creatureUuid ? await fromUuid(picked.creatureUuid) : null;
      const rolled = Boolean(message) && Boolean(picked) && (gm || resister?.testUserPermission?.(user, "OWNER") === true);
      if (!picked || (!ownsCaster && !rolled)) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      const source = message ? null : (payload.spellUuid ? await fromUuid(payload.spellUuid) : null);
      const cap = message ? endCapFor(card.identifier ?? null, card.effectHTML ?? "") : (source?.type === "spell" && (!source.parent || source.parent === caster) ? endCapFor(source.system?.identifier ?? null, source.system?.effect ?? "") : null);
      if (!cap) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      return endHere({ ...picked, maxTier: cap });
    }
    case "energy":
    case "hatred": {
      // Once a card, clamped to what the card's picked spell gives: twice its tier, or its tier plus 2.
      if (!caster) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const picked = card.demonHunterSpell?.picked ?? null;
      const cardCaster = card.caster ?? ChatMessage.getSpeakerActor?.(message?.speaker ?? {})?.uuid ?? null;
      const resister = picked?.creatureUuid ? await fromUuid(picked.creatureUuid) : null;
      const asks = gm || ownsCaster || resister?.testUserPermission?.(user, "OWNER") === true;
      if (!message || !picked || cardCaster !== caster.uuid || !asks) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      const paid = message.flags?.[SCOPE]?.dhPaid ?? false;
      if (paid) return { gained: 0 };
      // A Hatred rise the unleashed hunter refuses leaves the card unpaid (the review's C9).
      if (payload.act === "hatred" && unleashedGainRefusal({ unleashed: caster.shape?.kind === "unleashed", source: "devour", before: 0, after: 1 })) return { gained: 0 };
      const top = payload.act === "energy" ? siphonEnergy(picked.tier, picked.regain || 2) : devourHatred(picked.tier, picked.plus ?? 2);
      const n = Math.min(top, Math.max(0, Math.trunc(Number(payload.amount)) || 0));
      await message.setFlag(SCOPE, "dhPaid", true);
      const gained = payload.act === "energy" ? await regainEnergy(caster, n) : await gainHatred(caster, n);
      return { gained };
    }
    case "heal": {
      // Draw Soul: one heal a failing creature a card, at most the entry's 2.
      if (!caster || !message || card.identifier !== "draw-soul") throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      const healed = message.flags?.[SCOPE]?.dhHealed ?? [];
      const from = typeof payload.from === "string" ? payload.from : "";
      const failed = from ? await fromUuid(from) : null;
      if (!gm && !ownsCaster && failed?.testUserPermission?.(user, "OWNER") !== true) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      if (!from || healed.includes(from)) return { healed: 0 };
      // **A CREATURE THAT FAILED, SHOWN BY ITS OWN TEST** (the review's C5): the Resilience card the payload names was
      // rolled by that creature, after this card, and failed - never a uuid taken on the payload's word.
      const result = payload.resultId ? game.messages?.get(payload.resultId) ?? null : null;
      const roller = result ? ChatMessage.getSpeakerActor?.(result.speaker ?? {}) ?? null : null;
      const passed = result?.rolls?.[0]?.outcome?.success === true || result?.flags?.[SCOPE]?.success === true;
      if (!result || roller?.uuid !== from || passed || (result.timestamp ?? 0) < (message.timestamp ?? 0)) return { healed: 0 };
      await message.setFlag(SCOPE, "dhHealed", [...healed, from]);
      const read = readDrawHeal(card.effectHTML ?? "");
      const amount = Math.min(read?.per ?? 0, Math.max(0, Math.trunc(Number(payload.amount)) || 0));
      const before = caster.system?.health?.value ?? 0;
      await caster.applyHealing?.(amount, { from: caster, givenBy: caster, spell: true, school: "fel" });
      return { healed: Math.max(0, (caster.system?.health?.value ?? before) - before) };
    }
    case "crash": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.DhSpell.Refuse.notYours"));
      return placeCrashHere(caster, payload);
    }
    default:
      throw new Error(`azeroth-rpg | unknown Demon Hunter spell act ${payload.act}`);
  }
}

/* -------------------------------------------- */
/*  Registration                                 */
/* -------------------------------------------- */

/**
 * The hooks the spells answer, registered once at init: the hunter's sight (`demon-hunter-sight.mjs`), Immolation
 * Aura's entering strike, Agonizing Flames' way out, Inner Demon's torment ending with its Frightened, and Immolation
 * Aura's light going with its Sustain.
 */
export function registerDemonHunterSpellHooks() {
  // The hunter's sight (`demon-hunter-sight.mjs#registerHunterSight`) is registered at init itself, synchronously,
  // beside the Flare's reveal: a token document class swapped after the world's documents are made reaches none.
  Hooks.on("moveToken", (document, movement, operation) => {
    if (!game.users?.activeGM?.isSelf) return;
    immolationOnMove(document, movement, operation).catch(err => console.warn("azeroth-rpg | Immolation Aura's entering strike", err));
  });
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    if (userId !== game.user?.id) return;
    if (effect?.flags?.[SCOPE]?.identifier !== FLAMES_ID) return;
    offerPutOut(effect).catch(err => console.warn("azeroth-rpg | Agonizing Flames' way out", err));
  });
  // Inner Demon: *on a success the spell and both conditions end* - the Frightened the repeat Test rides goes, and the
  // torment it carried goes with it, on the client that deleted it.
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user?.id) return;
    const actor = effect?.parent ?? null;
    if (!actor || actor.documentName !== "Actor") return;
    const carriers = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[TORMENT_FLAG]?.frightenedId === effect.id).map(e => e.id);
    if (carriers.length) actor.deleteEmbeddedDocuments("ActiveEffect", carriers).catch(err => console.warn("azeroth-rpg | Inner Demon's torment", err));
  });
  Hooks.on("updateActor", (actor, change) => {
    if (!foundry.utils.hasProperty(change ?? {}, `flags.${SCOPE}.sustaining`)) return;
    restoreAuraLight(actor).catch(err => console.warn("azeroth-rpg | Immolation Aura's light", err));
  });
}

/** For the tests: whether an item is a glaive the doors read (`rules/demon-hunter-spells.mjs#isGlaive`). */
export { isGlaive };
