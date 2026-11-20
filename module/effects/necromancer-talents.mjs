/**
 * **THE NECROMANCER'S TALENTS, ON THE BOARD** (04-TALENTS' Flesh, Bone and Damned; the Necromancer
 * plan's Phase 4c-T). The law is `rules/necromancer-talents.mjs`; this module is the doors. Every
 * Use is judged whole BEFORE the budget and the payment (D-768's order) and landed after it; a write
 * on a creature this client does not own goes through `NECRO_TALENT_QUERY` on the active GM, with
 * `gmAbsentFor` asked first; an Essence spend goes through the pool queue (`spendEssence`).
 *
 * - **The Uses** (`judgeNecroTalentUse` and `landNecroTalentUse`, reached through `useFeature`'s
 *   `onUse.necro` by way of `effects/necromancer-horde.mjs#judgeNecroUse`): the Empowered surges
 *   (Ghoul Frenzy, Commander of Bone, Plague Carrier), the mendings (Regenerating Tissue, Bone
 *   Vanguard), Gorge, Bone Armor, Bone Storm, Acolyte's Sacrifice, Unsummon, Circle of the Damned
 *   and Grand Circle's move, Unholy Fervor, Watchful Shades' borrowed senses, Dark Communion and
 *   The Black Rite.
 * - **The turn starts** (`necroTalentTurnStart`, the active GM's `_onStartTurn`): Regenerating
 *   Tissue and Unholy Fervor's Health loss; Restless Bones' stand at the Necromancer's own turn start
 *   (`restlessTurnStart`, from the horde's turn start, before the fallen collapse).
 * - **One of the raised dead drops** (`raisedDownTalents`, from the horde's `onRaisedDown`): Bloated
 *   Dead's burst and Restless Bones' judgement, the one 0-Health judgement's second source.
 * - **A collapse by choice** (`sacrificialPlan`/`landSacrificial`, from `collapseHordeTokens`):
 *   Sacrificial Strength.
 * - **In the blow**: Marrowguard (`marrowguardOn`, the damage door's standing reduction) and Life
 *   for a Life (`lifeForALifeJudged`/`lifeForALifeHere`, the asked hold at 1).
 * - **The rest**: Bone Armor's stacks end at a Long Rest (`necroLongRest`).
 */

import { AZEROTH } from "../config.mjs";
import {
  ACOLYTES_SACRIFICE, BLACK_RITE, BLOATED_DEAD, BONE_ARMOR, BONE_ARMOR_FLAG, BONE_STORM, BONE_VANGUARD, CIRCLE, COMMANDER_OF_BONE,
  DARK_COMMUNION, GHOUL_FRENZY, GORGE, GRAND_CIRCLE, LIFE_FOR_A_LIFE, MARROWGUARD, NECRO_CLASS, PLAGUE_CARRIER, REGENERATING_TISSUE,
  RESTLESS_BONES, SACRIFICIAL_STRENGTH, SURGE_FLAG, UNHOLY_FERVOR, UNSUMMON, WATCHFUL_SHADES,
  blackRitePlan, bloatedDeadBurst, boneArmorChanges, boneArmorFallbackWay, boneArmorJudgement, boneStormHits, circleRadius, circleRemains, circleTemp, circleTick,
  darkCommunionHeal, darkCommunionJudgement, gorgeJudgement, gorgeTemp, lifeForALifeHeal, lifeForALifeJudgement, lookJudgement, marrowguardCut, rankIn,
  raisedThisRound, regenerationHeal, regenerationMend, restlessBonesJudgement, restlessHealth, sacrificialTemp, servantJudgement,
  standAgainNow, unholyFervorAllies, unholyFervorDamage, unsummonJudgement, unsummonMana, vanguardMend
} from "../rules/necromancer-talents.mjs";
import { HORDE_LEAD_FLAG, SKELETONS, isSkeleton } from "../rules/horde.mjs";
import { emptyAreaTick, emptyRemains } from "../rules/area-ticks.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { isLiving } from "../rules/essence.mjs";
import { creatureSnapshot } from "../rules/creature-kinds.mjs";
import { hasTick } from "../rules/ticks.mjs";
import { SHED_DC_FLAG } from "../rules/escapes.mjs";
import { regionInWorld } from "../canvas/in-world.mjs";
import {
  BLOATED_DEAD_KEY, CIRCLE_KEY, LIFE_FOR_A_LIFE_KEY, PLAGUE_CARRIER_FLAG, RESTLESS_BONES_KEY
} from "../rules/necromancer-animations.mjs";
import { bondOf, worldActorOf } from "../documents/bound.mjs";
import {
  collapseHordeMember, essenceOf, hordeActorsOf, leadOf, postFeatureCard, refundEssence, spendEssence
} from "./necromancer-horde.mjs";
import { RAISE_QUERY, askGM, claimCorpses, corpsesOn, knightToken, raiseQueryHandler, releaseCorpses } from "./death-knight-necromancy.mjs";
import { minuteSpan, untilEncounterEnd, untilEndOfNextTurnOrRound, untilNextTurnOrRound } from "./durations.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The query every talent write on a creature this client does not own goes through. */
export const NECRO_TALENT_QUERY = "azeroth-rpg.necroTalent";

/** The flag a raised dead carries for the last blow that reached its Health (`{type}`), read by Restless Bones. */
export const LAST_BLOW_FLAG = "lastBlow";

/* ------------------------------------------------------------------ */
/*  Small readers                                                       */
/* ------------------------------------------------------------------ */

/** A document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

/** A token on the scene, as the cards record one. */
const refOf = token => (token ? { sceneId: token.parent?.id ?? null, tokenId: token.id, name: token.name } : null);

/** The Necromancer's taken talents. */
const talentsOf = actor => actor?.takenTalents?.() ?? [];

/** One Necromancer talent's rank, by identifier (`rankIn`). */
const rankOf = (actor, identifier) => rankIn(talentsOf(actor), identifier);

/** The talent item a granted feature names, and its rank. */
function grantedRank(actor, item) {
  const id = item?.getFlag?.(SCOPE, "feature")?.talentId ?? null;
  const talent = id ? actor?.items?.get?.(id) ?? null : null;
  return { talent, rank: Math.max(1, Math.trunc(Number(talent?.system?.taken)) || 1) };
}

/** The world actor's token on a scene (the one named first), or null. */
function tokenOn(actor, scene) {
  return scene?.tokens?.find?.(tk => tk.actorId === actor?.id || tk.actor === actor) ?? null;
}

/** The creature's 14 entry, off its horde bond. */
const entryOf = actor => String(bondOf(worldActorOf(actor))?.entryName ?? actor?.name ?? "");

/** Whether this creature is one of the owner's horde. */
function hordeOwner(actor) {
  const world = worldActorOf(actor);
  const bond = bondOf(world);
  if (bond?.kind !== "raised" || bond.horde !== true || !bond.ownerUuid) return null;
  const owner = docAt(bond.ownerUuid);
  return owner?.documentName === "Actor" ? { owner, world, bond } : null;
}

/** The Necromancer's started fight's combatant, or null. */
function combatantOf(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
}

/** Whether the round's once-mark is already spent (read, never written). */
function roundMarked(actor, mark) {
  const mine = combatantOf(actor);
  if (!mine) return false;
  const r = mine.getFlag?.(SCOPE, "round") ?? {};
  return r.number === mine.combat?.round && (r.once ?? []).includes(mark);
}

/** Spend the round's once-mark; true where it was free, always true out of a fight. */
async function markRound(actor, mark) {
  const mine = combatantOf(actor);
  if (!mine) return true;
  if (!mine.isOwner) return false;
  return (await mine.markRoundOnce(mark))?.added === true;
}

/** Say a refusal in words; null. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(`AZEROTH.NecroTalent.Refuse.${key}`, data));
  return null;
}

/** The one chooser. */
const choose = (...args) => game.system.azeroth.workflows.chooseOption(...args);

/**
 * **THE RAISED DEAD NEAR THE NECROMANCER** on its scene: each standing horde creature with a token
 * there, its distance footprint to footprint (D-732) and its entry, in a fixed order.
 */
async function servantsNear(actor, site, { entries = null } = {}) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  return hordeActorsOf(actor)
    .map(a => {
      const token = tokenOn(a, site.scene);
      return { actor: a, token, entry: entryOf(a), feet: token ? feetApart(site.token, token) : null, health: a.system?.health?.value ?? 0, max: a.system?.health?.max ?? 0 };
    })
    .filter(s => s.token && s.health > 0 && (!entries || entries.includes(s.entry)))
    .sort((a, b) => (a.feet ?? Infinity) - (b.feet ?? Infinity) || String(a.token.name).localeCompare(String(b.token.name)) || a.actor.id.localeCompare(b.actor.id));
}

/** A servant as a chooser option, greyed in words where the judgement refuses it. */
function servantOption(s, why) {
  return {
    key: s.actor.id, available: !why,
    name: t("AZEROTH.NecroTalent.ServantOption", { name: s.token.name ?? s.actor.name, health: s.health, feet: Math.round(s.feet ?? 0) }),
    description: why ? `<p>${t(`AZEROTH.NecroTalent.Refuse.${why}`, { name: s.token.name ?? s.actor.name })}</p>` : ""
  };
}

/** Ask plain or empowered (02's *Empowered.*), where the Essence is held; null where dismissed. */
async function plainOrEmpowered(item, actor, { essence = 1, words = "AZEROTH.NecroTalent.EmpoweredOption", data = {} } = {}) {
  if ((essenceOf(actor)?.value ?? 0) < essence) return false;
  const way = await choose(item, [
    { key: "plain", available: true, name: t("AZEROTH.NecroTalent.PlainOption"), description: "" },
    { key: "empowered", available: true, name: t(words, { n: essence, ...data }), description: "" }
  ], null, { prompt: t("AZEROTH.NecroTalent.EmpowerPrompt", { feature: item.name }) });
  if (!way) return null;
  return way.key === "empowered";
}

/** Run a GM-side act here where this client is the active GM, else on the active GM's client. */
async function viaGM(act, payload) {
  const data = { act, ...payload };
  if (game.user?.isGM && game.users?.activeGM?.isSelf) return necroTalentQueryHandler(data, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.NecroTalent.NoGM"));
  return gm.query(NECRO_TALENT_QUERY, data, { timeout: 15000 });
}

/** Whether a write on these creatures would need a GM and none is on (`gmAbsentFor`). */
function needsAbsentGM(actors = []) {
  return gmAbsentFor({ owned: actors.map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/**
 * **THE LIVING ALLIES AND THE ALLIES NEAR A TOKEN** on the viewed board, by D-755's one reading of
 * an ally (`canvas/engaged.mjs#creaturesWithin`), the Necromancer counted.
 */
async function alliesNear(actor, feet, { from = null, living = false } = {}) {
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const rows = creaturesWithin(actor, feet, { from, who: "ally" });
  return rows.filter(r => !living || isLiving(creatureSnapshot({ type: r.actor.type, system: r.actor.system, race: r.actor.raceItem?.name ?? null })));
}

/* ------------------------------------------------------------------ */
/*  The Uses, judged before anything is paid                            */
/* ------------------------------------------------------------------ */

/**
 * **A NECROMANCER TALENT'S USE, JUDGED** (`useFeature`'s `onUse.necro`): every refusal in words with
 * nothing spent, else the plan `landNecroTalentUse` lands once the budget and any price are paid.
 *
 * @param {Actor} actor
 * @param {Item} item  the feature the talent granted
 * @param {{onUse?: object, source?: object|null}} o
 * @returns {Promise<object|null>}
 */
export async function judgeNecroTalentUse(actor, item, { onUse = {}, source = null } = {}) {
  const necro = onUse?.necro ?? {};
  const { rank } = grantedRank(actor, item);
  const site = knightToken(actor, source);
  const tier = actor.system?.tier ?? 1;
  const name = actor.name;
  if (necro.surge) return judgeSurge(actor, item, necro.surge);
  if (necro.exhume) return { kind: "exhume" };
  if (!site) return refuse("noToken", { name });

  if (necro.mend === REGENERATING_TISSUE.identifier) {
    const near = await servantsNear(actor, site, { entries: REGENERATING_TISSUE.entries });
    const options = near.map(s => servantOption(s, servantJudgement({ servant: s, feet: REGENERATING_TISSUE.feet, entries: REGENERATING_TISSUE.entries })));
    if (!options.some(o => o.available)) return refuse("noServantNear", { name, feature: item.name, feet: REGENERATING_TISSUE.feet });
    const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.MendPrompt", { feature: item.name, feet: REGENERATING_TISSUE.feet }) });
    const chosen = pick ? near.find(s => s.actor.id === pick.key) : null;
    if (!chosen) return null;
    return { kind: "mend", actorId: chosen.actor.id, amount: regenerationMend(tier), target: refOf(chosen.token) };
  }
  if (necro.mend === BONE_VANGUARD.identifier) {
    const lead = leadOf(actor);
    const leader = lead ? game.actors.get(lead) ?? null : null;
    if (!leader || !isSkeleton({ entry: entryOf(leader) }) || (leader.system?.health?.value ?? 0) <= 0) return refuse("noSkeletonLead", { name, feature: item.name });
    if (needsAbsentGM([leader])) return refuse("noGM", { name });
    return { kind: "mend", actorId: leader.id, amount: vanguardMend(tier), target: refOf(tokenOn(leader, site.scene)) };
  }
  if (necro.gorge) {
    const near = await servantsNear(actor, site, { entries: GORGE.entries });
    if (!near.length) return refuse("noServantKind", { name, feature: item.name });
    const pick = await choose(item, near.map(s => servantOption(s, null)), null, { prompt: t("AZEROTH.NecroTalent.GorgeServantPrompt", { feature: item.name }) });
    const chosen = pick ? near.find(s => s.actor.id === pick.key) : null;
    if (!chosen) return null;
    const { feetApart } = await import("../canvas/footprints.mjs");
    const rows = corpsesOn(actor, GORGE_ROW, { scene: site.scene, from: chosen.token, reach: GORGE.reach, feetApart });
    const options = rows.map(r => ({ key: r.id, available: !r.refusal, name: t("AZEROTH.Raise.Corpse", { name: r.name, feet: r.feet ?? "-" }), description: r.refusal ? `<p>${t(`AZEROTH.Raise.Refuse.${r.refusal}`, { name: r.name, spell: item.name })}</p>` : "" }));
    if (!options.some(o => o.available)) return refuse("noCorpseReach", { name: chosen.token.name, feature: item.name, feet: GORGE.reach });
    const body = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.GorgeCorpsePrompt", { feature: item.name, name: chosen.token.name }) });
    const corpse = body ? rows.find(r => r.id === body.key) : null;
    if (!corpse) return null;
    const empowered = await plainOrEmpowered(item, actor, { essence: GORGE.essence });
    if (empowered === null) return null;
    const why = gorgeJudgement({ servant: chosen, corpseFeet: corpse.feet, empowered, essence: essenceOf(actor)?.value ?? 0 });
    if (why) return refuse(why, { name: chosen.token.name, feature: item.name, feet: GORGE.reach });
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM", { name });
    return { kind: "gorge", actorId: chosen.actor.id, corpseId: corpse.id, sceneId: site.scene.id, servantTokenId: chosen.token.id, empowered, temp: gorgeTemp(tier), target: refOf(chosen.token) };
  }
  if (necro.boneArmor) {
    const stacks = boneArmorStacks(actor);
    const near = await servantsNear(actor, site, { entries: [BONE_ARMOR.entry] });
    const options = near.map(s => servantOption(s, boneArmorJudgement({ rank, stacks, servant: s })));
    const inFight = Boolean(combatantOf(actor));
    const essence = essenceOf(actor)?.value ?? 0;
    const empoweredWhy = boneArmorJudgement({ rank, stacks, empowered: true, essence, inFight });
    options.push({ key: "empowered", available: !empoweredWhy, name: t("AZEROTH.NecroTalent.BoneArmorEmpowered", { n: BONE_ARMOR.essence }), description: empoweredWhy ? `<p>${t(`AZEROTH.NecroTalent.Refuse.${empoweredWhy}`, { name, feature: item.name, rank })}</p>` : "" });
    if (!options.some(o => o.available)) {
      const why = stacks >= rank ? "stacksFull" : "noServantNear";
      return refuse(why, { name, feature: item.name, feet: BONE_ARMOR.feet, rank });
    }
    const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.BoneArmorPrompt", { feature: item.name, feet: BONE_ARMOR.feet, n: stacks, rank }) });
    if (!pick) return null;
    if (pick.key === "empowered") {
      // **THE ESSENCE AND THE FIGHT ARE JUDGED AGAIN AS THEY STAND NOW** (the 4c review): the chooser
      // may have stood open while the pool moved, and this is the last read before the budget.
      const again = boneArmorJudgement({ rank, stacks: boneArmorStacks(actor), empowered: true, essence: essenceOf(actor)?.value ?? 0, inFight: Boolean(combatantOf(actor)) });
      if (again) return refuse(again, { name, feature: item.name, rank });
      return { kind: "boneArmor", empowered: true, sceneId: site.scene.id, tokenId: site.token.id };
    }
    const chosen = near.find(s => s.actor.id === pick.key);
    const why = boneArmorJudgement({ rank, stacks, servant: chosen });
    if (why) return refuse(why, { name, feature: item.name, feet: BONE_ARMOR.feet, rank });
    return { kind: "boneArmor", empowered: false, actorId: chosen.actor.id, target: refOf(chosen.token) };
  }
  if (necro.boneStorm) {
    const near = (await servantsNear(actor, site, { entries: SKELETONS })).filter(s => (s.feet ?? Infinity) <= BONE_STORM.feet + 1e-6);
    if (!near.length) return refuse("noSkeletonNear", { name, feature: item.name, feet: BONE_STORM.feet });
    const picked = await choose(item, near.map(s => ({ ...servantOption(s, null), checked: false })), null, { prompt: t("AZEROTH.NecroTalent.BoneStormPrompt", { feature: item.name, feet: BONE_STORM.feet }), max: Math.max(2, near.length) });
    if (!picked) return null;
    const ids = (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
    const chosen = near.filter(s => ids.includes(s.actor.id));
    if (!chosen.length) return null;
    // The enemies within 5 feet of each chosen skeleton, measured now, before any collapses.
    const { feetApart } = await import("../canvas/footprints.mjs");
    const { standingOf, combatantIn } = await import("../canvas/engaged.mjs");
    const { countsAsEnemy } = await import("../rules/distance.mjs");
    const fight = actor.activeFight?.() ?? null;
    const roller = standingOf(site.token, combatantIn(fight, actor, site.token), fight);
    const near5 = {};
    const victims = {};
    for (const other of site.scene.tokens ?? []) {
      if (!other.actor || chosen.some(s => s.token.id === other.id) || other.id === site.token.id) continue;
      if (!countsAsEnemy(roller, standingOf(other, combatantIn(fight, other.actor, other), fight), { gm: true })) continue;
      const n = chosen.filter(s => { const d = feetApart(s.token, other); return typeof d === "number" && d <= BONE_STORM.near + 1e-6; }).length;
      if (n > 0) { near5[other.id] = n; victims[other.id] = refOf(other); }
    }
    if (gmAbsentFor({ owned: Object.keys(victims).map(id => site.scene.tokens.get(id)?.actor?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM", { name });
    const hits = boneStormHits({ near: near5, tier, spellpower: actor.system?.spellpower?.shadow ?? 0 });
    return { kind: "boneStorm", actorIds: chosen.map(s => s.actor.id), sceneId: site.scene.id, hits, victims };
  }
  if (necro.sacrifice) {
    const near = await servantsNear(actor, site);
    const options = near.map(s => servantOption(s, servantJudgement({ servant: s, feet: ACOLYTES_SACRIFICE.feet })));
    if (!options.some(o => o.available)) return refuse("noServantNear", { name, feature: item.name, feet: ACOLYTES_SACRIFICE.feet });
    const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.SacrificePrompt", { feature: item.name, feet: ACOLYTES_SACRIFICE.feet }) });
    const chosen = pick ? near.find(s => s.actor.id === pick.key) : null;
    if (!chosen) return null;
    const empowered = await plainOrEmpowered(item, actor, { essence: ACOLYTES_SACRIFICE.essence, words: "AZEROTH.NecroTalent.SacrificeEmpowered" });
    if (empowered === null) return null;
    const index = await game.packs.get("azeroth-rpg.bestiary")?.getIndex();
    if (!index?.find(e => e.name === ACOLYTES_SACRIFICE.entry)) return refuse("noEntry", { entry: ACOLYTES_SACRIFICE.entry });
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM", { name });
    return { kind: "sacrifice", actorId: chosen.actor.id, empowered, sceneId: site.scene.id, tokenId: site.token.id, target: refOf(chosen.token) };
  }
  if (necro.unsummon) {
    if (roundMarked(actor, UNSUMMON.roundMark)) return refuse("roundUsed", { name, feature: item.name });
    const near = await servantsNear(actor, site);
    const options = near.map(s => servantOption(s, unsummonJudgement({ servant: s })));
    if (!options.some(o => o.available)) return refuse("noServantNear", { name, feature: item.name, feet: UNSUMMON.feet });
    const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.UnsummonPrompt", { feature: item.name, feet: UNSUMMON.feet }) });
    const chosen = pick ? near.find(s => s.actor.id === pick.key) : null;
    if (!chosen) return null;
    const fight = actor.activeFight?.() ?? null;
    const fresh = raisedThisRound(bondOf(chosen.actor), { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null });
    return { kind: "unsummon", actorId: chosen.actor.id, mana: unsummonMana({ intMod: actor.system?.abilities?.int?.mod ?? 0, raisedThisRound: fresh }), fresh, target: refOf(chosen.token) };
  }
  if (necro.circle) {
    const empowered = await plainOrEmpowered(item, actor, { essence: CIRCLE.essence, words: "AZEROTH.NecroTalent.CircleEmpowered" });
    if (empowered === null) return null;
    const point = await pickCirclePoint(actor, site, item, { feet: CIRCLE.feet });
    if (!point) return null;
    return { kind: "circle", empowered, origin: point, sceneId: site.scene.id, tokenId: site.token.id };
  }
  if (necro.moveCircle) {
    const circle = circleOf(actor);
    if (!circle) return refuse("noCircle", { name, feature: item.name });
    if (circle.parent?.id !== site.scene.id) return refuse("circleElsewhere", { name, feature: item.name });
    const point = await pickCirclePoint(actor, site, item, { feet: null });
    if (!point) return null;
    if (!circle.isOwner && needsAbsentGM([{ isOwner: false }])) return refuse("noGM", { name });
    return { kind: "moveCircle", regionId: circle.id, sceneId: site.scene.id, origin: point };
  }
  if (necro.fervor) {
    const allies = (await alliesNear(actor, UNHOLY_FERVOR.feet, { living: true }));
    if (!allies.length) return refuse("noLivingAlly", { name, feature: item.name, feet: UNHOLY_FERVOR.feet });
    const most = unholyFervorAllies(rank);
    const picked = await choose(item, allies.map(a => ({ key: a.token.id, available: true, checked: false, name: t("AZEROTH.NecroTalent.AllyOption", { name: a.token.name ?? a.actor.name, feet: Math.round(a.feet ?? 0) }), description: "" })), null,
      { prompt: t("AZEROTH.NecroTalent.FervorPrompt", { feature: item.name, n: most, feet: UNHOLY_FERVOR.feet }), ...(most > 1 ? { max: most } : {}) });
    if (!picked) return null;
    const ids = (Array.isArray(picked) ? picked : [picked]).map(o => o.key).slice(0, most);
    const chosen = allies.filter(a => ids.includes(a.token.id));
    if (!chosen.length) return null;
    if (needsAbsentGM(chosen.map(a => a.actor))) return refuse("noGM", { name });
    return { kind: "fervor", damage: unholyFervorDamage(actor.system?.abilities?.int?.mod ?? 0), allies: chosen.map(a => ({ ...refOf(a.token), actorUuid: a.actor.uuid })) };
  }
  if (necro.borrow) {
    const shades = hordeActorsOf(actor).filter(a => entryOf(a) === WATCHFUL_SHADES.entry && (a.system?.health?.value ?? 0) > 0);
    if (!shades.length) return refuse("noShade", { name, feature: item.name });
    const options = shades.map(a => {
      const scene = (game.scenes?.contents ?? []).find(s => tokenOn(a, s)) ?? null;
      return { key: a.id, available: Boolean(scene), name: t("AZEROTH.NecroTalent.ShadeOption", { name: a.name, scene: scene?.name ?? "-" }), description: scene ? "" : `<p>${t("AZEROTH.NecroTalent.Refuse.shadeNowhere", { name: a.name })}</p>` };
    });
    const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.BorrowPrompt", { feature: item.name }) });
    const shade = pick ? shades.find(a => a.id === pick.key) : null;
    if (!shade) return null;
    const scene = (game.scenes?.contents ?? []).find(s => tokenOn(shade, s)) ?? null;
    if (!scene) return refuse("shadeNowhere", { name: shade.name });
    const borrow = { kind: "borrow", shadeUuid: shade.uuid, sceneId: scene.id, tokenId: tokenOn(shade, scene).id, target: refOf(tokenOn(shade, scene)) };
    // The look judged before the Use's Half-Action (D-768's order): a scene this player may not view
    // refuses in words with nothing spent, where `lookThrough` used to refuse after the payment.
    const unseen = lookRefusal(borrow);
    if (unseen) { ui.notifications?.warn(unseen.words); return null; }
    return borrow;
  }
  if (necro.communion) {
    const why = darkCommunionJudgement({ inFight: Boolean(combatantOf(actor)), allies: 1 });
    if (why === "inFight") return refuse("inFight", { name, feature: item.name, minutes: DARK_COMMUNION.minutes });
    const allies = (await alliesNear(actor, 1e6)).filter(a => a.actor.type === "character" || a.actor.type === "npc");
    if (!allies.length) return refuse("noAlly", { name, feature: item.name });
    const picked = await choose(item, allies.map(a => ({ key: a.token.id, available: true, checked: false, name: t("AZEROTH.NecroTalent.AllyOption", { name: a.token.name ?? a.actor.name, feet: Math.round(a.feet ?? 0) }), description: "" })), null,
      { prompt: t("AZEROTH.NecroTalent.CommunionPrompt", { feature: item.name, n: DARK_COMMUNION.allies, minutes: DARK_COMMUNION.minutes }), max: DARK_COMMUNION.allies });
    if (!picked) return null;
    const ids = (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
    const chosen = allies.filter(a => ids.includes(a.token.id));
    const count = darkCommunionJudgement({ inFight: false, allies: chosen.length });
    if (count) return refuse(count, { name, feature: item.name, n: DARK_COMMUNION.allies });
    if (needsAbsentGM(chosen.map(a => a.actor))) return refuse("noGM", { name });
    return { kind: "communion", heal: darkCommunionHeal(tier), allies: chosen.map(a => ({ ...refOf(a.token), actorUuid: a.actor.uuid })) };
  }
  if (necro.blackRite) {
    const near = (await servantsNear(actor, site)).filter(s => (s.feet ?? Infinity) <= BLACK_RITE.feet + 1e-6);
    if (!near.length) return refuse("noServantNear", { name, feature: item.name, feet: BLACK_RITE.feet });
    const picked = await choose(item, near.map(s => ({ ...servantOption(s, null), checked: false })), null, { prompt: t("AZEROTH.NecroTalent.BlackRitePrompt", { feature: item.name, feet: BLACK_RITE.feet }), max: Math.max(2, near.length) });
    if (!picked) return null;
    const ids = (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
    const offerings = near.filter(s => ids.includes(s.actor.id));
    if (!offerings.length) return null;
    const allies = (await alliesNear(actor, BLACK_RITE.feet)).filter(a => !offerings.some(o => o.token.id === a.token.id));
    if (!allies.length) return refuse("noAlly", { name, feature: item.name });
    // One chooser for each creature that collapses: the same ally may be named again.
    const picks = [];
    for (let i = 0; i < offerings.length; i++) {
      const one = await choose(item, allies.map(a => ({ key: a.token.id, available: true, name: t("AZEROTH.NecroTalent.AllyOption", { name: a.token.name ?? a.actor.name, feet: Math.round(a.feet ?? 0) }), description: "" })), null,
        { prompt: t("AZEROTH.NecroTalent.BlackRiteAllyPrompt", { feature: item.name, n: i + 1, of: offerings.length, name: offerings[i].token.name }) });
      if (!one) return null;
      picks.push(one.key);
    }
    const plan = blackRitePlan({ offerings: offerings.length, picks, tier });
    if (!plan.ok) return refuse(plan.reason, { name, feature: item.name });
    const empowered = await plainOrEmpowered(item, actor, { essence: BLACK_RITE.essence, words: "AZEROTH.NecroTalent.BlackRiteEmpowered" });
    if (empowered === null) return null;
    const recipients = plan.heals.map(h => ({ ...h, ...refOf(allies.find(a => a.token.id === h.id).token), actorUuid: allies.find(a => a.token.id === h.id).actor.uuid }));
    if (needsAbsentGM(allies.filter(a => plan.heals.some(h => h.id === a.token.id)).map(a => a.actor))) return refuse("noGM", { name });
    return { kind: "blackRite", actorIds: offerings.map(s => s.actor.id), recipients, empowered, temp: Math.max(0, Math.trunc(Number(actor.system?.abilities?.int?.mod)) || 0) };
  }
  return null;
}

/** The permissive one-corpse row Gorge judges a corpse by: any creature's, any size. */
const GORGE_ROW = Object.freeze({ corpses: Object.freeze({ min: 1, max: 1 }), kinds: null, minSize: null, maxSize: null, entry: "Gorge" });

/**
 * **AN EMPOWERED SURGE, JUDGED** (Ghoul Frenzy, Commander of Bone, Plague Carrier: *As a
 * Half-Action, spend 1 Essence. Until the end of your next turn ...*): a creature of the talent's
 * kinds must stand in the horde, or the surge would buy nothing. The Essence is the feature's own
 * price, judged by `useFeature` before the budget.
 */
function judgeSurge(actor, item, key) {
  const entries = key === GHOUL_FRENZY.identifier ? GHOUL_FRENZY.entries
    : key === COMMANDER_OF_BONE.identifier ? COMMANDER_OF_BONE.entries : PLAGUE_CARRIER.entries;
  const any = hordeActorsOf(actor).some(a => entries.includes(entryOf(a)) && (a.system?.health?.value ?? 0) > 0);
  if (!any) return refuse("noServantKind", { name: actor.name, feature: item.name });
  return { kind: "surge", key };
}

/**
 * **A POINT FOR THE CIRCLE**: within 30 feet of the Necromancer (Circle of the Damned), or - for
 * Grand Circle's move - *a point you can see*: on this scene, and for a player inside what the board
 * shows them (`canvas.visibility`). Null where the pick was cancelled.
 */
async function pickCirclePoint(actor, site, item, { feet = null } = {}) {
  const { pickPoint } = await import("../canvas/place.mjs");
  const { pointAccept } = await import("../canvas/range.mjs");
  const near = feet !== null ? pointAccept(site.token, { kind: "feet", feet }, item.name) : null;
  const seen = point => {
    if (game.user?.isGM) return true;
    const ok = canvas?.visibility?.testVisibility?.(point, { tolerance: 2 }) ?? true;
    if (!ok) ui.notifications?.warn(t("AZEROTH.NecroTalent.Refuse.cannotSee", { name: actor.name }));
    return ok;
  };
  const accept = point => (near ? near(point) : true) && seen(point);
  const picked = CIRCLE_PICK ? await CIRCLE_PICK({ actor, site, feet }) : await pickPoint({ hint: t("AZEROTH.NecroTalent.CirclePick", { feature: item.name }), accept, sceneId: site.scene.id });
  if (!picked) return null;
  if (CIRCLE_PICK && !accept(picked)) return null;
  return { x: picked.x, y: picked.y };
}

/** A test's own pick for the circle's point (the Quench batch); null puts the board's back. */
let CIRCLE_PICK = null;
export function setCirclePick(fn) {
  CIRCLE_PICK = typeof fn === "function" ? fn : null;
}

/* ------------------------------------------------------------------ */
/*  The Uses, landed once paid for                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE USE DOES ONCE IT IS PAID FOR**: the card's lines. `targets` is the card's list (the
 * creatures the animation draws on), `onRisen` the card's rising record.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} plan  `judgeNecroTalentUse`'s
 * @param {{targets?: object[]|null, onRisen?: Function|null}} o
 * @returns {Promise<string[]>}
 */
export async function landNecroTalentUse(actor, item, plan, { targets = null, onRisen = null } = {}) {
  if (!plan) return [];
  const note = ref => { if (ref && Array.isArray(targets)) targets.push(ref); };
  const name = actor.name;
  switch (plan.kind) {
    case "surge": {
      await laySurge(actor, plan.key, item);
      // The creatures the surge reaches, for the card's picture (Ghoul Frenzy's drops on each ghoul).
      const entries = plan.key === GHOUL_FRENZY.identifier ? GHOUL_FRENZY.entries : plan.key === COMMANDER_OF_BONE.identifier ? COMMANDER_OF_BONE.entries : PLAGUE_CARRIER.entries;
      const scene = knightToken(actor, null)?.scene ?? null;
      for (const a of hordeActorsOf(actor)) {
        const tk = scene && entries.includes(entryOf(a)) ? tokenOn(a, scene) : null;
        if (tk) note(refOf(tk));
      }
      return [t("AZEROTH.NecroTalent.Surged", { name, feature: item.name })];
    }
    case "exhume":
      return [t("AZEROTH.NecroTalent.Exhumed", { name, feature: item.name })];
    case "mend": {
      const servant = game.actors.get(plan.actorId) ?? null;
      if (!servant || (servant.system?.health?.value ?? 0) <= 0) return [t("AZEROTH.NecroTalent.Refuse.noServant", { name })];
      note(plan.target);
      const before = servant.system?.health?.value ?? 0;
      await healOn(servant, plan.amount, { from: actor, featureName: item.name });
      return [t("AZEROTH.NecroTalent.Mended", { name: servant.name, n: Math.max(0, (servant.system?.health?.value ?? before) - before), feature: item.name })];
    }
    case "gorge": {
      const servant = game.actors.get(plan.actorId) ?? null;
      if (!servant || (servant.system?.health?.value ?? 0) <= 0) return [t("AZEROTH.NecroTalent.Refuse.noServant", { name })];
      let empowered = plan.empowered === true;
      const lines = [];
      if (empowered && !(await spendEssence(actor, GORGE.essence))) {
        empowered = false;
        lines.push(t("AZEROTH.NecroTalent.EssenceShortFallback", { name, feature: item.name, n: GORGE.essence }));
      }
      try {
        await viaGM("gorgeCorpse", { ownerUuid: actor.uuid, sceneId: plan.sceneId, servantTokenId: plan.servantTokenId, corpseId: plan.corpseId });
      } catch (err) {
        if (empowered) await refundEssence(actor, GORGE.essence);
        return [...lines, err.message];
      }
      note(plan.target);
      const max = servant.system?.health?.max ?? 0;
      const before = servant.system?.health?.value ?? 0;
      await healOn(servant, Math.max(0, max - before), { from: actor, featureName: item.name });
      lines.push(t("AZEROTH.NecroTalent.Gorged", { name: servant.name, n: Math.max(0, (servant.system?.health?.value ?? before) - before), feature: item.name }));
      if (empowered) {
        await tempOn(servant, plan.temp, { source: item.name });
        lines.push(t("AZEROTH.NecroTalent.GorgeTemp", { name: servant.name, n: plan.temp }));
      }
      return lines;
    }
    case "boneArmor": {
      if (plan.empowered) {
        if (await spendEssence(actor, BONE_ARMOR.essence)) {
          await layBoneArmor(actor, item, { encounter: true });
          return [t("AZEROTH.NecroTalent.BoneArmorEncounter", { name, feature: item.name, n: BONE_ARMOR.ap })];
        }
        // **THE POOL FELL SHORT AFTER THE HALF-ACTION WAS PAID** (Dark Ritual's shape): the Use
        // falls back to its plain line - a Risen Skeleton collapsed for a stack - and says so.
        return boneArmorFallback(actor, item, plan, note);
      }
      const servant = game.actors.get(plan.actorId) ?? null;
      if (!servant) return [t("AZEROTH.NecroTalent.Refuse.noServant", { name })];
      return boneArmorPlain(actor, item, servant, plan.target, note);
    }
    case "boneStorm": {
      const scene = game.scenes.get(plan.sceneId) ?? null;
      const lines = [];
      for (const id of plan.actorIds) {
        const servant = game.actors.get(id) ?? null;
        if (servant) await collapseHordeMember(actor, servant, { byChoice: true, reason: "boneStorm" });
      }
      for (const [tokenId, blows] of Object.entries(plan.hits.blows ?? {})) {
        const victim = scene?.tokens?.get(tokenId)?.actor ?? null;
        if (!victim) continue;
        note(plan.victims?.[tokenId] ?? null);
        for (let i = 0; i < blows; i++) {
          if ((victim.system?.health?.value ?? 0) <= 0 && victim.type === "npc") break;
          lines.push(...await strikeOn(victim, actor, { rating: plan.hits.perBlow, school: BONE_STORM.type, name: item.name }));
        }
      }
      return lines.length ? lines : [t("AZEROTH.NecroTalent.BoneStormNone", { name, feature: item.name })];
    }
    case "sacrifice": {
      let empowered = plan.empowered === true;
      const lines = [];
      if (empowered && !(await spendEssence(actor, ACOLYTES_SACRIFICE.essence))) {
        empowered = false;
        lines.push(t("AZEROTH.NecroTalent.EssenceShortFallback", { name, feature: item.name, n: ACOLYTES_SACRIFICE.essence }));
      }
      note(plan.target);
      try {
        const done = await askGM(RAISE_QUERY, raiseQueryHandler, {
          ownerUuid: actor.uuid, key: ACOLYTES_SACRIFICE.identifier, horde: true, sacrifice: { actorId: plan.actorId, empowered },
          sceneId: plan.sceneId, tokenId: plan.tokenId, entries: [ACOLYTES_SACRIFICE.entry], collapse: [plan.actorId], name: item.name, corpses: []
        });
        if (typeof onRisen === "function" && done?.tokenIds?.length) onRisen({ sceneId: done.sceneId, tokenIds: done.tokenIds });
        lines.push(t(empowered ? "AZEROTH.NecroTalent.ShadeRoseOutside" : "AZEROTH.NecroTalent.ShadeRose", { name, feature: item.name }));
      } catch (err) {
        if (empowered) await refundEssence(actor, ACOLYTES_SACRIFICE.essence);
        lines.push(err.message);
      }
      return lines;
    }
    case "unsummon": {
      const servant = game.actors.get(plan.actorId) ?? null;
      if (!servant) return [t("AZEROTH.NecroTalent.Refuse.noServant", { name })];
      if (!(await markRound(actor, UNSUMMON.roundMark))) return [t("AZEROTH.NecroTalent.Refuse.roundUsed", { name, feature: item.name })];
      note(plan.target);
      if (!(await collapseHordeMember(actor, servant, { byChoice: true, reason: "unsummon" }))) return [t("AZEROTH.NecroTalent.Refuse.noCollapse", { name, servant: servant.name, feature: item.name })];
      const { manaPool } = await import("../rules/pools.mjs");
      const { adjustPool } = await import("../documents/pool-writes.mjs");
      const pool = manaPool(actor.poolSnapshot?.() ?? []);
      const moved = pool && plan.mana > 0 ? await adjustPool(actor, { kind: pool.kind, name: pool.name }, plan.mana) : { before: 0, after: 0 };
      const gained = Math.max(0, (moved.after ?? 0) - (moved.before ?? 0));
      return [t(plan.fresh ? "AZEROTH.NecroTalent.UnsummonedFresh" : "AZEROTH.NecroTalent.Unsummoned", { name, servant: servant.name, n: gained })];
    }
    case "circle":
      return drawCircle(actor, item, plan);
    case "moveCircle": {
      try {
        await viaGMOrHere("moveCircle", { ownerUuid: actor.uuid, sceneId: plan.sceneId, regionId: plan.regionId, origin: plan.origin });
        return [t("AZEROTH.NecroTalent.CircleMoved", { name, feature: item.name })];
      } catch (err) {
        return [err.message];
      }
    }
    case "fervor": {
      const lines = [];
      for (const ally of plan.allies) {
        const target = docAt(ally.actorUuid);
        if (!target) continue;
        note(ally);
        try {
          await viaGMOrHere("fervor", { ownerUuid: actor.uuid, targetUuid: target.uuid, damage: plan.damage, name: item.name }, target);
          lines.push(t("AZEROTH.NecroTalent.Fervor", { name: ally.name ?? target.name, n: plan.damage, feature: item.name }));
        } catch (err) {
          lines.push(err.message);
        }
      }
      return lines;
    }
    case "borrow": {
      note(plan.target);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: t("AZEROTH.NecroTalent.BorrowEffect", { feature: item.name }), img: item.img || "icons/svg/eye.svg", origin: actor.uuid,
        description: `<p>${t("AZEROTH.NecroTalent.BorrowText", { name: plan.target?.name ?? "" })}</p>`,
        ...(untilNextTurnOrRound(actor) ?? {}),
        flags: { [SCOPE]: { [WATCHFUL_SHADES.flag]: { shadeUuid: plan.shadeUuid, sceneId: plan.sceneId, tokenId: plan.tokenId, source: item.name } } }
      }]);
      lookAfterCard(actor, plan);
      return [t("AZEROTH.NecroTalent.Borrowed", { name, shade: plan.target?.name ?? "", feature: item.name })];
    }
    case "communion": {
      const lines = [];
      for (const ally of plan.allies) {
        const target = docAt(ally.actorUuid);
        if (!target) continue;
        note(ally);
        const before = target.system?.health?.value ?? 0;
        await healOn(target, plan.heal, { from: actor, featureName: item.name });
        lines.push(t("AZEROTH.NecroTalent.Communed", { name: ally.name ?? target.name, n: Math.max(0, (target.system?.health?.value ?? before) - before) }));
      }
      return lines;
    }
    case "blackRite": {
      let empowered = plan.empowered === true;
      const lines = [];
      if (empowered && !(await spendEssence(actor, BLACK_RITE.essence))) {
        empowered = false;
        lines.push(t("AZEROTH.NecroTalent.EssenceShortFallback", { name, feature: item.name, n: BLACK_RITE.essence }));
      }
      let fell = 0;
      for (const id of plan.actorIds) {
        const servant = game.actors.get(id) ?? null;
        if (servant && await collapseHordeMember(actor, servant, { byChoice: true, reason: "blackRite" })) fell += 1;
      }
      // A creature that did not collapse buys nothing (*For each creature that collapses*): the heals
      // are worked out again for the offerings that fell, the earliest picks kept.
      const kept = keepPicks(plan.recipients, fell);
      const { layBoon } = await import("./banes.mjs");
      for (const r of kept) {
        const target = docAt(r.actorUuid);
        if (!target) continue;
        note({ sceneId: r.sceneId, tokenId: r.tokenId, name: r.name });
        const before = target.system?.health?.value ?? 0;
        await healOn(target, r.heal, { from: actor, featureName: item.name });
        lines.push(t("AZEROTH.NecroTalent.RiteHealed", { name: r.name ?? target.name, n: Math.max(0, (target.system?.health?.value ?? before) - before), times: r.times }));
        await layBoon({ victim: target, kind: "all", boons: 1, source: item.name, by: actor, lasting: true, span: untilEndOfNextTurnOrRound(target) });
        if (empowered && plan.temp > 0) {
          await tempOn(target, plan.temp, { source: item.name });
          lines.push(t("AZEROTH.NecroTalent.RiteTemp", { name: r.name ?? target.name, n: plan.temp }));
        }
      }
      if (fell < plan.actorIds.length) lines.push(t("AZEROTH.NecroTalent.RiteShort", { n: plan.actorIds.length - fell }));
      return lines;
    }
    default:
      return [];
  }
}

/** Bone Armor's plain line, landed: the skeleton collapses by choice and one stack is laid to the Long Rest. */
async function boneArmorPlain(actor, item, servant, target, note) {
  note(target);
  if (!(await collapseHordeMember(actor, servant, { byChoice: true, reason: "boneArmor" }))) return [t("AZEROTH.NecroTalent.Refuse.noCollapse", { name: actor.name, servant: servant.name, feature: item.name })];
  await layBoneArmor(actor, item, { encounter: false });
  return [t("AZEROTH.NecroTalent.BoneArmorRest", { name: actor.name, feature: item.name, n: boneArmorStacks(actor) })];
}

/**
 * **BONE ARMOR'S EMPOWERED LINE WHOSE ESSENCE RAN SHORT AFTER THE PAYMENT** (the 4c review): the
 * Half-Action is spent, so the Use falls back to its plain line where one is reachable - the one
 * chooser names the Risen Skeletons within 30 feet the plain judgement allows - and says in words
 * that the Half-Action bought nothing where none is, or where the chooser is closed.
 */
async function boneArmorFallback(actor, item, plan, note) {
  const name = actor.name;
  const short = t("AZEROTH.NecroTalent.BoneArmorShort", { name, feature: item.name, n: BONE_ARMOR.essence });
  const spent = t("AZEROTH.NecroTalent.BoneArmorSpent", { name, feature: item.name });
  const { rank } = grantedRank(actor, item);
  const site = knightToken(actor, plan.sceneId ? { sceneId: plan.sceneId, tokenId: plan.tokenId } : null);
  const near = site ? await servantsNear(actor, site, { entries: [BONE_ARMOR.entry] }) : [];
  const stacks = boneArmorStacks(actor);
  const options = near.map(s => servantOption(s, boneArmorJudgement({ rank, stacks, servant: s })));
  if (boneArmorFallbackWay({ rank, stacks, available: options.filter(o => o.available).length }) === "spent") return [short, spent];
  ui.notifications?.warn(short);
  const pick = await choose(item, options, null, { prompt: t("AZEROTH.NecroTalent.BoneArmorFallbackPrompt", { name, feature: item.name, feet: BONE_ARMOR.feet }) });
  const chosen = pick ? near.find(s => s.actor.id === pick.key) ?? null : null;
  if (!chosen) return [short, spent];
  const why = boneArmorJudgement({ rank, stacks: boneArmorStacks(actor), servant: chosen });
  if (why) return [short, t(`AZEROTH.NecroTalent.Refuse.${why}`, { name, feature: item.name, feet: BONE_ARMOR.feet, rank }), spent];
  return [short, ...await boneArmorPlain(actor, item, chosen.actor, refOf(chosen.token), note)];
}

/** The picks the offerings that fell still buy: the earliest first, each worth five times the tier. */
function keepPicks(recipients = [], fell = 0) {
  let left = Math.max(0, fell);
  const per = recipients.length ? recipients[0].heal / Math.max(1, recipients[0].times) : 0;
  const out = [];
  for (const r of recipients) {
    if (left <= 0) break;
    const times = Math.min(r.times, left);
    left -= times;
    out.push({ ...r, times, heal: per * times });
  }
  return out;
}

/** Run a GM act here where this client owns the document (or is the GM), else on the GM's client. */
async function viaGMOrHere(act, payload, doc = null) {
  if (game.user?.isGM || (doc && doc.isOwner && act !== "moveCircle")) return necroTalentQueryHandler({ act, ...payload }, { user: game.user });
  return viaGM(act, payload);
}

/** Heal a creature through the one healing door, here where this client owns it, else on the GM's. */
async function healOn(target, amount, { from = null, featureName = "" } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!target || n <= 0) return null;
  if (target.isOwner) return target.applyHealing?.(n, { from, feature: true, featureName });
  return viaGM("heal", { targetUuid: target.uuid, amount: n, giverUuid: from?.uuid ?? null, featureName });
}

/** Grant 05's temporary Health, here where this client owns the creature, else on the GM's. */
async function tempOn(target, amount, { source = "" } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!target || n <= 0) return null;
  const span = target.activeFight?.()?.started ? "encounter" : "longRest";
  if (target.isOwner) return target.grantTemporaryHealth?.(n, { source, span });
  return viaGM("temp", { targetUuid: target.uuid, amount: n, source });
}

/** One talent blow on one creature, through the area's one damage door (D-757), as a feature's. */
async function strikeOn(victim, caster, { rating = 0, school = "shadow", name = "" } = {}) {
  const { strikeFromArea } = await import("./area-strikes.mjs");
  if (victim.isOwner) return strikeFromArea({ actor: victim, caster, spell: { name, school: null, feature: true, takesSpellpower: false }, damage: { rating, school } });
  try {
    return (await viaGM("strike", { victimUuid: victim.uuid, casterUuid: caster.uuid, rating, school, name }))?.lines ?? [];
  } catch (err) {
    return [err.message];
  }
}

/* ------------------------------------------------------------------ */
/*  The surge and Bone Armor's effects                                  */
/* ------------------------------------------------------------------ */

/**
 * **AN EMPOWERED SURGE LAID ON THE NECROMANCER** until the end of its next turn (a round of the
 * world's clock out of a fight, D-778), flagged `necroSurge`: the bound sync reads it on every raised
 * creature (`boundEffects`' `raised` branch) and Plague Carrier's landing reads it at a failed Test.
 * A second of one key replaces the first.
 */
async function laySurge(actor, key, item) {
  const stale = actor.effects.filter(e => e.flags?.[SCOPE]?.[SURGE_FLAG]?.key === key).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.NecroTalent.SurgeEffect", { feature: item.name }), img: item.img || "icons/svg/aura.svg", origin: actor.uuid,
    description: `<p>${t(`AZEROTH.NecroTalent.SurgeText.${key}`)}</p>`,
    ...(untilEndOfNextTurnOrRound(actor) ?? {}),
    flags: { [SCOPE]: { [SURGE_FLAG]: { key, by: actor.uuid, source: item.name } } }
  }]);
  await actor.syncBound?.().catch(err => console.warn("azeroth-rpg | surge sync", err));
}

/** The surges standing on a Necromancer, by talent identifier. */
export function surgesOf(actor) {
  return [...(actor?.effects ?? [])].filter(e => e.active !== false && !e.disabled).map(e => e.flags?.[SCOPE]?.[SURGE_FLAG]?.key).filter(Boolean).sort();
}

/** Bone Armor's rest-long stacks standing. */
export function boneArmorStacks(actor) {
  return [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[BONE_ARMOR_FLAG]?.kind === "rest").length;
}

/** Lay one stack (to the Long Rest) or the encounter's armour (replacing an earlier one). */
async function layBoneArmor(actor, item, { encounter = false } = {}) {
  if (encounter) {
    const stale = actor.effects.filter(e => e.flags?.[SCOPE]?.[BONE_ARMOR_FLAG]?.kind === "encounter").map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  }
  const n = encounter ? 0 : boneArmorStacks(actor) + 1;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: encounter ? t("AZEROTH.NecroTalent.BoneArmorEncounterName", { feature: item.name }) : t("AZEROTH.NecroTalent.BoneArmorStackName", { feature: item.name, n }),
    img: item.img || "icons/svg/shield.svg", origin: actor.uuid,
    description: `<p>${t(encounter ? "AZEROTH.NecroTalent.BoneArmorEncounterText" : "AZEROTH.NecroTalent.BoneArmorRestText")}</p>`,
    system: { changes: boneArmorChanges() },
    ...(encounter ? (untilEncounterEnd(actor) ?? {}) : {}),
    // The encounter's armour ends by core's `combatEnd` expiry alone (`untilEncounterEnd`): a
    // `talentBuff` beside it would be deleted a second time by `_leaveFight`, a double delete.
    flags: { [SCOPE]: { [BONE_ARMOR_FLAG]: { kind: encounter ? "encounter" : "rest", source: item.name } } }
  }]);
}

/** **A LONG REST ENDS BONE ARMOR'S STACKS** (*until you finish a Long Rest*). */
export async function necroLongRest(actor) {
  const gone = [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[BONE_ARMOR_FLAG]?.kind === "rest").map(e => e.id);
  if (gone.length && actor.isOwner) await actor.deleteEmbeddedDocuments("ActiveEffect", gone);
  return gone.length;
}

/* ------------------------------------------------------------------ */
/*  Circle of the Damned                                                */
/* ------------------------------------------------------------------ */

/** This Necromancer's circle, on any scene, or null (*You have one circle at a time*). */
export function circleOf(actor) {
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) {
      const f = region.flags?.[SCOPE] ?? {};
      if (f.featureKey === CIRCLE_KEY && f.caster === actor?.uuid) return region;
    }
  }
  return null;
}

/** Every circle of this Necromancer, for the one-at-a-time rule. */
function circlesOf(actor) {
  const out = [];
  for (const scene of game.scenes ?? []) for (const region of scene.regions ?? []) {
    const f = region.flags?.[SCOPE] ?? {};
    if (f.featureKey === CIRCLE_KEY && f.caster === actor?.uuid) out.push(region);
  }
  return out;
}

/**
 * **THE CIRCLE, DRAWN** (04: *A 10 ft radius around it is your circle for 1 minute. Each ally that
 * starts its turn in your circle gains temporary Health equal to your rank. You have one circle at a
 * time*): the earlier circle goes, and one Region is laid at the point, NOT attached, carrying what
 * the area pipeline reads - the allies' temporary Health at the start of their turns (`areaTick.temp`,
 * `AzerothCombat#_areaTicks`), Cult Fervor's Boons as the area's riders (`areaTick.remains`, the aura
 * door's third centre), its minute (`lasts`, swept by `canvas/sustained-areas.mjs`) and the key its
 * cue and loop are filed under. Grand Circle's radius is read at the drawing.
 */
async function drawCircle(actor, item, plan) {
  let empowered = plan.empowered === true;
  const lines = [];
  if (empowered && !(await spendEssence(actor, CIRCLE.essence))) {
    empowered = false;
    lines.push(t("AZEROTH.NecroTalent.EssenceShortFallback", { name: actor.name, feature: item.name, n: CIRCLE.essence }));
  }
  const scene = game.scenes.get(plan.sceneId) ?? null;
  const token = scene?.tokens?.get(plan.tokenId) ?? null;
  if (!scene || !token) return [...lines, t("AZEROTH.NecroTalent.Refuse.noToken", { name: actor.name })];
  for (const old of circlesOf(actor)) {
    try { await viaGMOrHere("deleteCircle", { ownerUuid: actor.uuid, sceneId: old.parent.id, regionId: old.id }, old); } catch (err) { console.warn("azeroth-rpg | an old circle", err); }
  }
  const talents = talentsOf(actor);
  const rank = rankIn(talents, CIRCLE.identifier);
  const radius = circleRadius(rankIn(talents, GRAND_CIRCLE.identifier));
  const temp = circleTemp({ rank, intMod: actor.system?.abilities?.int?.mod ?? 0, empowered });
  const remains = circleRemains(rankIn(talents, "cult-fervor"), emptyRemains);
  const fight = actor.activeFight?.() ?? null;
  const { placeArea } = await import("../canvas/regions.mjs");
  const region = await placeArea({
    item, scene, origin: { x: plan.origin.x, y: plan.origin.y }, rotation: 0, token, attach: false,
    areaText: `A ${radius} ft radius`, color: CIRCLE.colour,
    title: t("AZEROTH.NecroTalent.CircleArea", { name: actor.name, feet: radius }),
    flags: {
      cast: foundry.utils.randomID(), caster: actor.uuid, source: { sceneId: scene.id, tokenId: token.id },
      featureKey: CIRCLE_KEY, identifier: CIRCLE_KEY, sustained: false,
      areaTick: circleTick({ base: emptyAreaTick(), temp, remains }),
      lasts: { rounds: CIRCLE.rounds },
      circle: { rank, empowered, radius, temp },
      spell: { name: item.name, school: null, tier: null, takesSpellpower: false, img: item.img ?? null, feature: true },
      placedAt: { combatId: fight?.started ? fight.id : null, round: fight?.started ? fight.round : null, turn: fight?.started ? fight.turn : null, time: game.time?.worldTime ?? 0 }
    }
  });
  lines.push(region
    ? t(empowered ? "AZEROTH.NecroTalent.CircleDrawnEmpowered" : "AZEROTH.NecroTalent.CircleDrawn", { name: actor.name, feet: radius, n: temp })
    : t("AZEROTH.NecroTalent.CircleNotDrawn", { name: actor.name }));
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Watchful Shades                                                     */
/* ------------------------------------------------------------------ */

/**
 * **THE SHADES SEE THE INVISIBLE** (04's Watchful Shades at rank 1: *Your Shades see invisible
 * creatures within 60 feet of them*): core's own detection mode on every Shade token of this
 * Necromancer and on its prototype - `seeInvisibility` at 60 feet, sight on - and off where the
 * talent is not held. The GM's client writes it.
 *
 * @param {Actor} owner
 * @returns {Promise<number>}  the tokens written
 */
export async function syncWatchfulShades(owner) {
  if (!owner || !game.user?.isGM) return 0;
  const held = rankOf(owner, WATCHFUL_SHADES.identifier) > 0;
  let n = 0;
  for (const shade of hordeActorsOf(owner).filter(a => entryOf(a) === WATCHFUL_SHADES.entry)) {
    const mode = { [`detectionModes.${WATCHFUL_SHADES.mode}`]: { enabled: held, range: WATCHFUL_SHADES.feet } };
    await shade.update({ ...Object.fromEntries(Object.entries(mode).map(([k, v]) => [`prototypeToken.${k}`, v])), ...(held ? { "prototypeToken.sight.enabled": true } : {}) });
    for (const scene of game.scenes ?? []) {
      const tokens = scene.tokens.filter(tk => tk.actorId === shade.id);
      if (!tokens.length) continue;
      await scene.updateEmbeddedDocuments("Token", tokens.map(tk => ({ _id: tk.id, ...mode, ...(held ? { "sight.enabled": true } : {}) })));
      n += tokens.length;
    }
  }
  return n;
}

/**
 * **WHETHER A LOOK CAN HAPPEN, ASKED BEFORE ANYTHING IS PAID** (the fix run 4 review: Spirit Anchor spent
 * its Half-Action and then `lookThrough` refused): the world read into `rules/necromancer-talents.mjs
 * #lookJudgement` - the scene stands, this user may view it, and a token the plan names stands on it.
 * Synchronous and silent; the door says the words.
 *
 * @param {{sceneId: string, tokenId?: string|null, name?: string, target?: {name?: string}|null}} plan  `lookThrough`'s
 * @returns {null|{reason: "noScene"|"cannotView"|"noToken", words: string}}
 */
export function lookRefusal(plan = {}) {
  const who = String(plan?.name ?? plan?.target?.name ?? "");
  const scene = game.scenes?.get?.(plan?.sceneId) ?? null;
  const reason = lookJudgement({
    scene: Boolean(scene),
    viewing: Boolean(scene) && canvas?.scene?.id === scene.id,
    gm: game.user?.isGM === true,
    limited: Boolean(scene?.testUserPermission?.(game.user, "LIMITED")),
    tokenNamed: Boolean(plan?.tokenId),
    tokenOnScene: Boolean(plan?.tokenId && scene?.tokens?.get?.(plan.tokenId))
  });
  if (!reason) return null;
  return { reason, words: t(`AZEROTH.NecroTalent.Look.${reason}`, { name: who, scene: scene?.name ?? "" }) };
}

/** How long the borrowed look waits for its Use's card before it looks anyway. */
export const LOOK_CARD_WAIT_MS = 3000;

/**
 * **THE BORROWED LOOK WAITS FOR ITS USE'S CARD** (team ANI's live run). The look controls the Shade's
 * token, and a token with sight controlled narrows this client's board to what the Shade sees: the
 * Necromancer's own token was then off the board when the card arrived, so the card's eyes at the
 * Necromancer, and their whisper, had no anchor (`no-anchor`) on the client that pressed the Use. The
 * look now runs once this actor's Watchful Shades card has been read (the director's hook runs first),
 * or after `LOOK_CARD_WAIT_MS` where no card comes. `lookRefusal` judged the look before the payment,
 * so a look that still fails here is said by `lookThrough` in its own words.
 *
 * @param {Actor} actor  the Necromancer
 * @param {object} plan  the borrow's plan, `lookThrough`'s argument
 */
function lookAfterCard(actor, plan) {
  let done = false;
  let timer = null;
  let hook = null;
  const go = () => {
    if (done) return;
    done = true;
    if (hook !== null) Hooks.off("createChatMessage", hook);
    if (timer !== null) clearTimeout(timer);
    lookThrough(plan).catch(err => console.warn("azeroth-rpg | looking through", err));
  };
  hook = Hooks.on("createChatMessage", message => {
    const flags = message?.flags?.[SCOPE];
    if (flags?.featureKey !== WATCHFUL_SHADES.identifier || message.speaker?.actor !== actor.id) return;
    setTimeout(go, 0);
  });
  timer = setTimeout(go, LOOK_CARD_WAIT_MS);
}

/**
 * **LOOK OUT THROUGH A CREATURE OR FROM A POINT, ON THIS CLIENT** (Watchful Shades at rank 2; team
 * 4c-S's Spirit Anchor reads the same door): the board goes to the scene the plan names where this
 * user may view it, then the token named is controlled and the board pans to it - or, with no token,
 * to the point named. **Every way it cannot is said in words** (the 4c review): a scene gone, a scene
 * this player may not view, and a token no longer on the board. The signature is stable.
 *
 * @param {{sceneId: string, tokenId?: string|null, point?: {x: number, y: number}|null, name?: string, target?: {name?: string}|null}} plan
 *   `name` (or `target.name`) the creature or the place looked through, for the words
 * @returns {Promise<{ok: boolean, reason: null|"noScene"|"cannotView"|"noToken"|"failed", words: string|null}>}
 */
export async function lookThrough(plan = {}) {
  const who = String(plan?.name ?? plan?.target?.name ?? "");
  const fail = (reason, data = {}) => {
    const words = t(`AZEROTH.NecroTalent.Look.${reason}`, { name: who, ...data });
    ui.notifications?.warn(words);
    return { ok: false, reason, words };
  };
  try {
    // The one judgement a door asks BEFORE it pays (`lookRefusal`), asked again at the look.
    const barred = lookRefusal(plan);
    const scene = game.scenes?.get?.(plan?.sceneId) ?? null;
    if (!scene || barred?.reason === "noScene") return fail("noScene");
    if (barred?.reason === "cannotView") return fail("cannotView", { scene: scene.name });
    if (barred?.reason === "noToken") return fail("noToken", { scene: scene.name });
    if (canvas?.scene?.id !== scene.id) await scene.view();
    if (plan.tokenId) {
      const token = canvas?.tokens?.get?.(plan.tokenId) ?? null;
      if (!token) return fail("noToken", { scene: scene.name });
      token.control?.({ releaseOthers: true });
      await canvas.animatePan?.({ x: token.center.x, y: token.center.y });
    } else if (Number.isFinite(Number(plan.point?.x)) && Number.isFinite(Number(plan.point?.y))) {
      await canvas.animatePan?.({ x: Number(plan.point.x), y: Number(plan.point.y) });
    }
    return { ok: true, reason: null, words: null };
  } catch (err) {
    console.warn("azeroth-rpg | looking through", err);
    return fail("failed");
  }
}

/* ------------------------------------------------------------------ */
/*  The turn starts                                                     */
/* ------------------------------------------------------------------ */

/**
 * **A TURN STARTS** (the active GM's `_onStartTurn`): Regenerating Tissue on one of the raised dead
 * whose owner holds it (*regains Health equal to your tier at the start of its turn*), and Unholy
 * Fervor's Health loss on a creature that carries it (*It loses 1 Health at the start of its next
 * turn, bypassing armor and Ward*), once.
 *
 * @param {Combatant} combatant
 * @returns {Promise<string[]>}
 */
export async function necroTalentTurnStart(combatant) {
  const actor = combatant?.actor ?? null;
  if (!actor || combatant.isDefeated) return [];
  const lines = [];
  const horde = hordeOwner(actor);
  if (horde && REGENERATING_TISSUE.entries.includes(entryOf(horde.world)) && (horde.world.system?.health?.value ?? 0) > 0) {
    const n = regenerationHeal({ tier: horde.owner.system?.tier ?? 1, rank: rankOf(horde.owner, REGENERATING_TISSUE.identifier) });
    const health = horde.world.system?.health ?? {};
    if (n > 0 && (health.value ?? 0) < (health.max ?? 0)) {
      const before = health.value ?? 0;
      await horde.world.applyHealing?.(n, { from: horde.owner, feature: true, featureName: game.i18n.localize("AZEROTH.NecroTalent.Name.regenerating-tissue") });
      const healed = Math.max(0, (horde.world.system?.health?.value ?? before) - before);
      if (healed > 0) {
        const token = combatant.token ?? null;
        await postFeatureCard(horde.owner, {
          key: REGENERATING_TISSUE.identifier, source: token ? refOf(token) : null,
          text: t("AZEROTH.NecroTalent.Regenerated", { name: token?.name ?? horde.world.name, n: healed }),
          targets: token ? [refOf(token)] : []
        });
        lines.push(t("AZEROTH.NecroTalent.Regenerated", { name: token?.name ?? horde.world.name, n: healed }));
      }
    }
  }
  for (const effect of [...(actor.effects ?? [])]) {
    const f = effect.flags?.[SCOPE]?.[UNHOLY_FERVOR.flag];
    if (!f || f.lost === true || effect.disabled) continue;
    await effect.update({ [`flags.${SCOPE}.${UNHOLY_FERVOR.flag}.lost`]: true });
    await actor.loseHealth?.(UNHOLY_FERVOR.lose);
    const words = t("AZEROTH.NecroTalent.FervorLoss", { name: actor.name, n: UNHOLY_FERVOR.lose, feature: f.source ?? "" });
    lines.push(words);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p class="azeroth-drain">${foundry.utils.escapeHTML(words)}</p>`, flags: { [SCOPE]: { kind: "tick" } } });
  }
  return lines;
}

/**
 * **RESTLESS BONES, AT THE NECROMANCER'S TURN START** (rank 1: *it stands again with half its
 * Health at the start of your next turn*): every skeleton of this Necromancer held up at 0 Health
 * stands, before the horde's turn start collapses what is still down (`hordeTurnStartNow`).
 *
 * @param {Actor} owner
 */
export async function restlessTurnStart(owner) {
  for (const actor of hordeActorsOf(owner)) {
    const pending = actor.getFlag?.(SCOPE, RESTLESS_BONES.pendingFlag);
    if (!pending || (actor.system?.health?.value ?? 1) > 0) continue;
    await standRestless(owner, actor);
  }
}

/** A skeleton stands again by Restless Bones: the Empowered Essence asked of the owner, the Health written, the card posted. */
async function standRestless(owner, world) {
  const empowered = (essenceOf(owner)?.value ?? 0) >= RESTLESS_BONES.essence
    && (await askEmpower(owner, { feature: game.i18n.localize("AZEROTH.NecroTalent.Name.restless-bones"), text: t("AZEROTH.NecroTalent.AskRestless", { name: world.name, n: RESTLESS_BONES.essence }) }));
  const health = restlessHealth(world.system?.health?.max ?? 0, { empowered });
  await world.update({
    "system.health.value": health,
    [`flags.${SCOPE}.${RESTLESS_BONES.flag}`]: true,
    [`flags.${SCOPE}.${RESTLESS_BONES.pendingFlag}`]: null
  });
  const status = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if (world.statuses?.has?.(status)) await world.toggleStatusEffect?.(status, { active: false });
  const ownerToken = knightToken(owner, null)?.token ?? null;
  const own = ownerToken ? tokenOn(world, ownerToken.parent) : (game.scenes?.contents ?? []).map(s => tokenOn(world, s)).find(Boolean) ?? null;
  await postFeatureCard(owner, {
    key: RESTLESS_BONES_KEY, source: ownerToken ? refOf(ownerToken) : null,
    text: t(empowered ? "AZEROTH.NecroTalent.RestlessFull" : "AZEROTH.NecroTalent.RestlessHalf", { name: world.name, n: health }),
    risen: own ? [{ sceneId: own.parent.id, tokenIds: [own.id] }] : []
  });
  return true;
}

/* ------------------------------------------------------------------ */
/*  One of the raised dead drops                                        */
/* ------------------------------------------------------------------ */

/**
 * **RESTLESS BONES, JUDGED AT 0 HEALTH** - the one 0-Health judgement's source, read off the
 * killing blow's record (`LAST_BLOW_FLAG`, written beside the Health by the damage door).
 *
 * @param {Actor} owner
 * @param {Actor} world  the skeleton's world actor
 */
export function restlessJudged(owner, world) {
  return restlessBonesJudgement({
    rank: rankOf(owner, RESTLESS_BONES.identifier), skeleton: isSkeleton({ entry: entryOf(world) }),
    type: world.getFlag?.(SCOPE, LAST_BLOW_FLAG)?.type ?? null, stood: Boolean(world.getFlag?.(SCOPE, RESTLESS_BONES.flag))
  });
}

/**
 * **RESTLESS BONES, LANDED**: at once (rank 2, or out of a fight), else held up until the
 * Necromancer's next turn start (`restlessTurnStart`).
 */
export async function restlessStands(owner, world, judged, { inFight = false } = {}) {
  if (standAgainNow({ when: judged.when, inFight })) return standRestless(owner, world);
  await world.update({ [`flags.${SCOPE}.${RESTLESS_BONES.pendingFlag}`]: { ownerUuid: owner.uuid, at: game.time?.worldTime ?? 0 } });
  return false;
}

/**
 * **BLOATED DEAD'S BURST** (04: *When one of your Risen Zombies, Plagued Ghouls or Abominations
 * drops to 0 Health, each enemy within a 5 ft radius of it takes Shadow damage equal to your tier*):
 * measured from the body's footprint before it collapses, the Empowered Essence asked of the owner,
 * each enemy struck through the area's one damage door, and a feature card from the body naming them.
 *
 * @param {Actor} owner
 * @param {Actor} world  the fallen creature's world actor
 */
export async function bloatedDeadOn(owner, world) {
  const rank = rankOf(owner, BLOATED_DEAD.identifier);
  const plain = bloatedDeadBurst({ rank, tier: owner.system?.tier ?? 1, entry: entryOf(world) });
  if (!plain) return [];
  const scenes = game.scenes?.contents ?? [];
  const body = (canvas?.scene ? tokenOn(world, canvas.scene) : null) ?? scenes.map(s => tokenOn(world, s)).find(Boolean) ?? null;
  if (!body) return [];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { standingOf, combatantIn } = await import("../canvas/engaged.mjs");
  const { countsAsEnemy } = await import("../rules/distance.mjs");
  const ownerToken = tokenOn(owner, body.parent);
  const fight = owner.activeFight?.() ?? null;
  const roller = standingOf(ownerToken ?? body, combatantIn(fight, owner, ownerToken), fight);
  const victims = (body.parent.tokens ?? []).filter(tk => {
    if (!tk.actor || tk.id === body.id) return false;
    const d = feetApart(body, tk);
    if (!(typeof d === "number" && d <= plain.feet + 1e-6)) return false;
    return countsAsEnemy(roller, standingOf(tk, combatantIn(fight, tk.actor, tk), fight), { gm: true });
  });
  if (!victims.length) return [];
  const empowered = (essenceOf(owner)?.value ?? 0) >= BLOATED_DEAD.essence
    && (await askEmpower(owner, { feature: game.i18n.localize("AZEROTH.NecroTalent.Name.bloated-dead"), text: t("AZEROTH.NecroTalent.AskBloated", { name: world.name, n: BLOATED_DEAD.essence, tier: plain.damage }) }));
  const burst = empowered ? bloatedDeadBurst({ rank, tier: owner.system?.tier ?? 1, entry: entryOf(world), empowered: true }) : plain;
  const { strikeFromArea } = await import("./area-strikes.mjs");
  const lines = [];
  for (const tk of victims) {
    lines.push(...await strikeFromArea({ actor: tk.actor, caster: owner, spell: { name: game.i18n.localize("AZEROTH.NecroTalent.Name.bloated-dead"), school: null, feature: true, takesSpellpower: false }, damage: { rating: burst.damage, school: burst.type } }));
  }
  await postFeatureCard(owner, {
    key: BLOATED_DEAD_KEY, source: refOf(body),
    text: t(empowered ? "AZEROTH.NecroTalent.BurstEmpowered" : "AZEROTH.NecroTalent.Burst", { name: body.name, n: burst.damage, feet: burst.feet, count: victims.length }),
    targets: victims.map(refOf)
  });
  return lines;
}

/**
 * **ASK THE NECROMANCER WHETHER TO SPEND ESSENCE NOW** (Bloated Dead's and Restless Bones' *you may
 * spend 1 Essence*): the yes is answered, and the Essence taken through the pool queue, on the client
 * that answers for the Necromancer (an active owning player, else the active GM) - only while the
 * asker still waits. Whether it was spent.
 */
export async function askEmpower(owner, { feature = "", text = "" } = {}) {
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(owner);
  if (!who) return false;
  try {
    const answer = who.id === game.user?.id
      ? await necroTalentQueryHandler({ act: "empower", ownerUuid: owner.uuid, feature, text }, { user: game.user })
      : await who.query(NECRO_TALENT_QUERY, { act: "empower", ownerUuid: owner.uuid, feature, text }, { timeout: 30000 });
    return answer?.spent === true;
  } catch (err) {
    console.warn("azeroth-rpg | an Essence ask", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  A collapse by choice: Sacrificial Strength                          */
/* ------------------------------------------------------------------ */

/**
 * **SACRIFICIAL STRENGTH, MEASURED BEFORE THE BODY GOES** (04: *When you collapse one of your raised
 * dead by your own choice, each ally within 10 feet of it gains temporary Health equal to your tier
 * per rank*): the allies of the Necromancer within 10 feet of the collapsing creature's token on the
 * viewed board, the creature itself left out. Null where the collapse is not by choice or the talent
 * is not held.
 *
 * @param {Actor} owner
 * @param {TokenDocument[]} tokens  the collapsing creature's tokens
 * @param {{byChoice?: boolean}} how
 */
export async function sacrificialPlan(owner, tokens = [], { byChoice = false } = {}) {
  const rank = rankOf(owner, SACRIFICIAL_STRENGTH.identifier);
  if (!owner || byChoice !== true || !rank) return null;
  const amount = sacrificialTemp({ tier: owner.system?.tier ?? 1, rank });
  const out = new Map();
  for (const tk of tokens) {
    const placeable = tk.object ?? null;
    if (!placeable) continue;
    for (const row of await alliesNear(owner, SACRIFICIAL_STRENGTH.feet, { from: placeable })) {
      if (tokens.some(x => x.id === row.token.id)) continue;
      out.set(row.actor.uuid, row.actor);
    }
  }
  return out.size ? { amount, recipients: [...out.values()] } : null;
}

/** Sacrificial Strength landed once the body has gone: each ally's temporary Health (the GM's client). */
export async function landSacrificial(plan) {
  if (!plan) return 0;
  let n = 0;
  for (const actor of plan.recipients) {
    const done = await tempOn(actor, plan.amount, { source: game.i18n.localize("AZEROTH.NecroTalent.Name.sacrificial-strength") });
    if (done?.landed) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  In the blow: Marrowguard and Life for a Life                        */
/* ------------------------------------------------------------------ */

/**
 * **MARROWGUARD AT THE DAMAGE DOOR** (a standing reduction, after the move and the halving): the
 * talent's rank off an ATTACK's Physical share, where one of this Necromancer's skeletons stands
 * adjacent (5 feet, footprint to footprint, D-732) on the scene the Necromancer stands on.
 *
 * @param {Actor} actor  the Necromancer struck
 * @param {{amount: number, type?: string|null, parts?: Array|null, attack?: boolean}} blow
 * @returns {Promise<{amount: number, parts: Array|null, cut: number}>}
 */
export async function marrowguardOn(actor, { amount = 0, type = null, parts = null, attack = false } = {}) {
  const rank = rankOf(actor, MARROWGUARD.identifier);
  if (!rank || attack !== true) return { amount, parts, cut: 0 };
  const mine = actor.getActiveTokens?.(false, true)?.[0] ?? null;
  const scene = mine?.parent ?? null;
  let adjacent = false;
  if (scene) {
    const { feetApart } = await import("../canvas/footprints.mjs");
    adjacent = hordeActorsOf(actor).some(a => {
      if (!isSkeleton({ entry: entryOf(a) }) || (a.system?.health?.value ?? 0) <= 0) return false;
      const tk = tokenOn(a, scene);
      const d = tk ? feetApart(mine, tk) : null;
      return typeof d === "number" && d <= MARROWGUARD.adjacent + 1e-6;
    });
  }
  const cut = marrowguardCut({ amount, type, parts, rank, adjacent, attack: true });
  if (cut.cut > 0) ui.notifications?.info(t("AZEROTH.NecroTalent.Marrowguard", { name: actor.name, from: amount, to: cut.amount }));
  return cut;
}

/**
 * **LIFE FOR A LIFE, JUDGED FOR ONE ASKED HOLD** (`effects/blow-doors.mjs#askToHold`): the holder's
 * rank, the ally inside the holder's circle, a raised dead within 30 feet of the ally, the round's one
 * use and the holder standing. Synchronous: the footprints module is imported by the caller first.
 *
 * @param {Actor} holder
 * @param {Actor} target
 * @param {Function} feetApart  `canvas/footprints.mjs#feetApart`
 * @returns {{ok: boolean, reason: string|null}}
 */
export function lifeForALifeJudged(holder, target, feetApart) {
  const circle = circleOf(holder);
  const at = circle ? tokenOn(target, circle.parent) ?? (target.isToken ? target.token : null) : null;
  let inCircle = false;
  try { inCircle = Boolean(at && circle && at.testInsideRegion(circle)); } catch { inCircle = false; }
  const servants = at ? hordeActorsOf(holder).map(a => {
    const tk = tokenOn(a, at.parent);
    return { feet: tk ? feetApart(at, tk) : null, health: a.system?.health?.value ?? 0 };
  }) : [];
  const reason = lifeForALifeJudgement({
    rank: rankOf(holder, LIFE_FOR_A_LIFE.identifier), inCircle, servants,
    roundUsed: roundMarked(holder, LIFE_FOR_A_LIFE.roundMark), holderUp: (holder.system?.health?.value ?? 0) > 0
  });
  return { ok: !reason, reason };
}

/**
 * **LIFE FOR A LIFE, ON THE HOLDER'S OWN CLIENT** (the asked hold's act): judged again, the one
 * chooser naming which of the raised dead within 30 feet of the ally collapses (a dismissed chooser
 * is a no), paid only while the asker still waits - the round's mark, then the collapse by choice -
 * and a card from the Necromancer naming the ally spared. Answers the hold and its heal (rank 2).
 *
 * @param {{holder: Actor, target: Actor, started?: number, askMs?: number}} o
 * @returns {Promise<{held: boolean, heal?: number, reason?: string}>}
 */
export async function lifeForALifeHere({ holder, target, started = Date.now(), askMs = 30000 } = {}) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { answerInTime, answerWindow } = await import("../rules/chromatic-talents.mjs");
  const first = lifeForALifeJudged(holder, target, feetApart);
  if (!first.ok) return { held: false, reason: first.reason };
  const circle = circleOf(holder);
  const at = tokenOn(target, circle.parent) ?? (target.isToken ? target.token : null);
  const servants = hordeActorsOf(holder).map(a => ({ actor: a, token: tokenOn(a, at.parent) }))
    .filter(s => s.token && (s.actor.system?.health?.value ?? 0) > 0)
    .map(s => ({ ...s, feet: feetApart(at, s.token) }))
    .filter(s => typeof s.feet === "number" && s.feet <= LIFE_FOR_A_LIFE.feet + 1e-6);
  const item = holder.items.find(i => i.type === "talent" && i.system?.identifier === LIFE_FOR_A_LIFE.identifier) ?? null;
  const options = servants.map(s => ({ key: s.actor.id, available: true, name: t("AZEROTH.NecroTalent.ServantOption", { name: s.token.name, health: s.actor.system?.health?.value ?? 0, feet: Math.round(s.feet) }), description: "" }));
  const pick = await Promise.race([
    choose(item ?? holder, options, null, { prompt: t("AZEROTH.NecroTalent.AskLifeForALife", { name: target.name, feature: item?.name ?? "" }) }),
    new Promise(resolve => setTimeout(() => resolve("late"), answerWindow(askMs)))
  ]);
  if (pick === "late") {
    for (const app of [...foundry.applications.instances.values()]) if (String(app.id ?? "") === `azeroth-choose-${(item ?? holder).id}`) await app.close().catch(() => {});
    return { held: false, reason: "late" };
  }
  const chosen = pick ? servants.find(s => s.actor.id === pick.key) : null;
  if (!chosen) return { held: false, reason: "declined" };
  const again = lifeForALifeJudged(holder, target, feetApart);
  if (!again.ok) {
    ui.notifications?.warn(t(`AZEROTH.NecroTalent.Refuse.${again.reason}`, { name: holder.name, feature: item?.name ?? "" }));
    return { held: false, reason: again.reason };
  }
  if (!answerInTime(started, Date.now(), askMs)) return { held: false, reason: "late" };
  if (!(await markRound(holder, LIFE_FOR_A_LIFE.roundMark))) return { held: false, reason: "roundUsed" };
  if (!(await collapseHordeMember(holder, chosen.actor, { byChoice: true, reason: "lifeForALife" }))) return { held: false, reason: "noCollapse" };
  const heal = lifeForALifeHeal({ rank: rankOf(holder, LIFE_FOR_A_LIFE.identifier), tier: holder.system?.tier ?? 1 });
  // A `deathHold` card (`animation/records.mjs`' hold record): the holder's token and the ally spared.
  const words = t(heal > 0 ? "AZEROTH.NecroTalent.LifeHeldHeal" : "AZEROTH.NecroTalent.LifeHeld", { name: target.name, servant: chosen.token.name, n: heal });
  const mine = knightToken(holder, null)?.token ?? null;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: holder }),
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line">${foundry.utils.escapeHTML(words)}</p></div></div>`,
    flags: { [SCOPE]: { kind: "deathHold", featureKey: LIFE_FOR_A_LIFE_KEY, source: mine ? refOf(mine) : null, targets: [refOf(at)] } }
  });
  return { held: true, heal };
}

/* ------------------------------------------------------------------ */
/*  Plague Carrier                                                      */
/* ------------------------------------------------------------------ */

/**
 * **PLAGUE CARRIER ON A HIT** (04: *When one of your Plagued Ghouls or Abominations hits a living
 * creature, the creature makes a Body Resilience Test against your Spell DC*): the owner and its
 * rank where the striker is one of its ghouls or Abominations; null otherwise. Read by
 * `effects/graft-riders.mjs#graftHitTests`, which posts the Test card.
 *
 * @param {Actor} striker
 * @returns {{owner: Actor, rank: number, dc: number}|null}
 */
export function plagueCarrierOf(striker) {
  const horde = hordeOwner(striker);
  if (!horde || !PLAGUE_CARRIER.entries.includes(entryOf(horde.world))) return null;
  const rank = rankOf(horde.owner, PLAGUE_CARRIER.identifier);
  if (!rank) return null;
  return { owner: horde.owner, rank, dc: Math.trunc(Number(horde.owner.system?.spellDC)) || 10 };
}

/** Whether the creature a hit reached is living (*hits a living creature*). */
export function livingTarget(victim) {
  return Boolean(victim) && isLiving(creatureSnapshot({ type: victim.type, system: victim.system, race: victim.raceItem?.name ?? null }));
}

/**
 * **PLAGUE CARRIER, ON A FAILED TEST** (on the client that rolled it, which owns the creature): the
 * tick (*Shadow damage equal to your rank at the start of each of its turns for 1 minute*) laid as
 * one carrier effect wearing `PLAGUE_CARRIER_FLAG` beside the tick (its state's loop), and - while the
 * Necromancer's Empowered surge stands - Poisoned 1 with the Spell DC to shed it. A second carrier
 * from the same Necromancer replaces the first.
 *
 * @param {{victim: Actor, owner: Actor, rank: number, dc: number, name?: string}} o
 * @returns {Promise<string[]>}
 */
export async function plagueCarrierLanded({ victim, owner, rank, dc, name = "" } = {}) {
  if (!victim || !owner) return [];
  const label = game.i18n.localize("AZEROTH.NecroTalent.Name.plague-carrier");
  const tick = { kind: "damage", type: PLAGUE_CARRIER.type, amount: Math.max(1, Math.trunc(Number(rank)) || 1), rounds: PLAGUE_CARRIER.rounds, until: "", when: "startOfTurn", spellpower: false, source: owner.uuid, name: label, via: "feature" };
  const lines = [];
  if (hasTick(tick) && victim.isOwner) {
    const stale = victim.effects.filter(e => e.flags?.[SCOPE]?.[PLAGUE_CARRIER_FLAG]?.by === owner.uuid).map(e => e.id);
    if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
    await victim.createEmbeddedDocuments("ActiveEffect", [{
      name: label, img: "icons/magic/unholy/orb-smoking-green.webp", origin: owner.uuid, description: `<p>${t("AZEROTH.NecroTalent.PlagueText", { n: tick.amount })}</p>`,
      ...(minuteSpan(victim, 1) ?? {}),
      flags: { [SCOPE]: { tick, [PLAGUE_CARRIER_FLAG]: { source: label, by: owner.uuid } } }
    }]);
    lines.push(t("AZEROTH.NecroTalent.PlagueLaid", { name: name || victim.name, n: tick.amount }));
  }
  if (surgesOf(owner).includes(PLAGUE_CARRIER.identifier)) {
    const { inflictCondition } = await import("./inflict.mjs");
    const { landedText } = await import("../helpers/rider-words.mjs");
    const done = await inflictCondition({ victim, id: "poisoned", value: PLAGUE_CARRIER.poisoned, by: owner, name: name || victim.name, marks: { [SHED_DC_FLAG]: { dc, source: label } } });
    lines.push(landedText(done));
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  The GM-side handler                                                 */
/* ------------------------------------------------------------------ */

/**
 * **EVERY TALENT WRITE ON A CREATURE THE ASKER DOES NOT OWN** (`NECRO_TALENT_QUERY`), on the active
 * GM's client - and the Essence ask (`empower`), on the client that answers for the Necromancer. The
 * asker must own the Necromancer; every amount is read off the Necromancer here, never trusted off the
 * payload past its own clamp. Throws with the reason, which travels back.
 */
export async function necroTalentQueryHandler(payload = {}, { user = null } = {}) {
  const owner = payload.ownerUuid ? await fromUuid(payload.ownerUuid) : (payload.casterUuid ? await fromUuid(payload.casterUuid) : (payload.giverUuid ? await fromUuid(payload.giverUuid) : null));
  if (owner && user && owner.documentName === "Actor" && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: owner.name }));
  const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);
  switch (payload.act) {
    case "empower": {
      if (owner?.documentName !== "Actor" || !owner.isOwner) return { spent: false };
      const { confirmHere } = await import("./blow-doors.mjs");
      const yes = await confirmHere(owner, { title: String(payload.feature ?? ""), text: foundry.utils.escapeHTML(String(payload.text ?? "")), ms: 20000 });
      if (!yes) return { spent: false };
      return { spent: await spendEssence(owner, 1) };
    }
    case "heal": {
      const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
      if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const cap = owner?.documentName === "Actor" ? 5 * Math.min(4, Math.max(1, owner.system?.tier ?? 1)) * 10 : 0;
      await target.applyHealing(Math.min(whole(payload.amount), cap), { from: owner?.documentName === "Actor" ? owner : null, givenBy: owner?.documentName === "Actor" ? null : "other", feature: true, featureName: String(payload.featureName ?? "") });
      return { ok: true };
    }
    case "temp": {
      const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
      if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const span = target.activeFight?.()?.started ? "encounter" : "longRest";
      return target.grantTemporaryHealth(Math.min(whole(payload.amount), 40), { source: String(payload.source ?? ""), span });
    }
    case "strike": {
      const victim = payload.victimUuid ? await fromUuid(payload.victimUuid) : null;
      if (victim?.documentName !== "Actor" || owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const cap = Math.min(4, Math.max(1, owner.system?.tier ?? 1)) + whole(owner.system?.spellpower?.shadow);
      const { strikeFromArea } = await import("./area-strikes.mjs");
      const lines = await strikeFromArea({ actor: victim, caster: owner, spell: { name: String(payload.name ?? ""), school: null, feature: true, takesSpellpower: false }, damage: { rating: Math.min(whole(payload.rating), cap), school: AZEROTH.damageTypes?.[payload.school] ? payload.school : "shadow" } });
      return { lines };
    }
    case "fervor": {
      const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
      if (target?.documentName !== "Actor" || owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const damage = Math.min(whole(payload.damage), unholyFervorDamage(owner.system?.abilities?.int?.mod ?? 0));
      const key = target.type === "character" ? `system.damageBonus.typed.attack.${UNHOLY_FERVOR.type}` : "system.damageBonus";
      const stale = target.effects.filter(e => e.flags?.[SCOPE]?.[UNHOLY_FERVOR.flag]?.by === owner.uuid).map(e => e.id);
      if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
      await target.createEmbeddedDocuments("ActiveEffect", [{
        name: String(payload.name ?? "Unholy Fervor"), img: "icons/magic/unholy/strike-body-explode-disintegrate.webp", origin: owner.uuid,
        description: `<p>${t("AZEROTH.NecroTalent.FervorText", { n: damage, lose: UNHOLY_FERVOR.lose })}</p>`,
        system: { changes: damage > 0 ? [{ key, type: "add", value: String(damage), phase: target.type === "character" ? "final" : "initial" }] : [] },
        ...(untilEndOfNextTurnOrRound(target) ?? {}),
        flags: { [SCOPE]: { [UNHOLY_FERVOR.flag]: { by: owner.uuid, lost: false, source: String(payload.name ?? "") } } }
      }]);
      return { ok: true };
    }
    case "gorgeCorpse": {
      if (owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
      const scene = game.scenes.get(payload.sceneId) ?? null;
      const servantToken = scene?.tokens?.get(payload.servantTokenId) ?? null;
      const servant = servantToken?.actor ? worldActorOf(servantToken.actor) : null;
      if (!servantToken || bondOf(servant)?.ownerUuid !== owner.uuid || !GORGE.entries.includes(entryOf(servant))) throw new Error(t("AZEROTH.NecroTalent.Refuse.wrongKind", { name: servantToken?.name ?? "" }));
      const { feetApart } = await import("../canvas/footprints.mjs");
      const rows = corpsesOn(owner, GORGE_ROW, { scene, from: servantToken, reach: GORGE.reach, viewer: user ?? game.user, feetApart });
      const row = rows.find(r => r.id === payload.corpseId) ?? null;
      if (!row || row.refusal) throw new Error(t(`AZEROTH.Raise.Refuse.${row?.refusal ?? "noCorpse"}`, { name: row?.name ?? "", spell: game.i18n.localize("AZEROTH.NecroTalent.Name.gorge") }));
      const taken = claimCorpses([row.id]);
      if (taken) throw new Error(t("AZEROTH.Raise.Refuse.raised", { name: row.name, spell: "", entry: "" }));
      try {
        await row.token.update({ [`flags.${SCOPE}.corpse`]: { state: "destroyed", by: owner.uuid, until: null } });
      } finally {
        releaseCorpses([row.id]);
      }
      return { ok: true };
    }
    case "deleteCircle": {
      const region = game.scenes.get(payload.sceneId)?.regions?.get(payload.regionId) ?? null;
      if (!region) return { ok: true };
      if (region.flags?.[SCOPE]?.caster !== owner?.uuid) throw new Error(t("AZEROTH.NecroTalent.Refuse.noCircle", { name: owner?.name ?? "", feature: "" }));
      await region.delete();
      return { ok: true };
    }
    case "moveCircle": {
      const scene = game.scenes.get(payload.sceneId) ?? null;
      const region = scene?.regions?.get(payload.regionId) ?? null;
      if (!region || region.flags?.[SCOPE]?.caster !== owner?.uuid) throw new Error(t("AZEROTH.NecroTalent.Refuse.noCircle", { name: owner?.name ?? "", feature: "" }));
      const x = Number(payload.origin?.x), y = Number(payload.origin?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(t("AZEROTH.NecroTalent.Refuse.cannotSee", { name: owner.name }));
      const { regionDataFor } = await import("../canvas/regions.mjs");
      const radius = Math.max(1, Math.trunc(Number(region.flags?.[SCOPE]?.circle?.radius)) || CIRCLE.radius);
      const data = regionDataFor({ areaText: `A ${radius} ft radius`, scene, origin: { x, y }, name: region.name, color: CIRCLE.colour, attach: false });
      if (!data) throw new Error(t("AZEROTH.NecroTalent.CircleNotDrawn", { name: owner.name }));
      // Asked of the world after the import was awaited (D-757): a circle deleted meanwhile is gone.
      if (!regionInWorld(region)) throw new Error(t("AZEROTH.NecroTalent.Refuse.noCircle", { name: owner?.name ?? "", feature: "" }));
      await region.update({ shapes: data.shapes });
      return { ok: true };
    }
    default:
      throw new Error(`necroTalent: no such act ${JSON.stringify(payload.act ?? null)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * The talents' hooks: a surge laid or ended re-syncs the bound creatures on the client that wrote it
 * (the GM's, where core's expiry deleted it), and so does a lead named or taken (Bone Vanguard reads
 * the lead); a Watchful Shades taken or dropped dresses the Shades on the GM's client.
 */
export function registerNecroTalentHooks() {
  const surge = (effect, options, userId) => {
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor" || !effect.flags?.[SCOPE]?.[SURGE_FLAG] || userId !== game.user?.id) return;
    actor.syncBound?.().catch(err => console.warn("azeroth-rpg | surge sync", err));
  };
  Hooks.on("createActiveEffect", surge);
  Hooks.on("deleteActiveEffect", surge);
  Hooks.on("updateActor", (actor, changed, options, userId) => {
    if (actor?.type !== "character" || userId !== game.user?.id) return;
    if (foundry.utils.hasProperty(changed, `flags.${SCOPE}.${HORDE_LEAD_FLAG}`) || foundry.utils.hasProperty(changed, `flags.${SCOPE}.-=${HORDE_LEAD_FLAG}`)) {
      actor.syncBound?.().catch(err => console.warn("azeroth-rpg | lead sync", err));
    }
  });
  Hooks.on("updateItem", (item, changed) => {
    if (item?.type !== "talent" || item.system?.identifier !== WATCHFUL_SHADES.identifier || item.system?.className !== NECRO_CLASS) return;
    if (!foundry.utils.hasProperty(changed, "system.taken") || !game.users?.activeGM?.isSelf) return;
    syncWatchfulShades(item.parent).catch(err => console.warn("azeroth-rpg | Watchful Shades", err));
  });
}
