/**
 * **THE NECROMANCER'S THIRTY-SIX TALENTS, AS LAW** (04-TALENTS' Flesh, Bone and Damned; the
 * Necromancer plan's Phase 4c-T and Phase 5). Pure: no Foundry imports (CLAUDE.md §3). The doors are
 * `effects/necromancer-talents.mjs` (the Uses, the turn starts, the raised dead dropping, the
 * collapses by choice, the asked hold and the circle) and the horde's own doors
 * (`effects/necromancer-horde.mjs`), which already read the raise talents by name.
 *
 * Every number 04 prints for a talent is held ONCE here, in a constant named for the talent, and
 * `necromancer-talents.test.mjs` reads every one of them back off 04's own Effect text at every
 * rank. Every judgement is asked BEFORE the budget and the payment (D-768's order) and asked again
 * where the write lands.
 *
 * - `raisedTalentRows` - what the owner's talents lay on ONE raised creature (`rules/bound.mjs
 *   #boundEffects`' `raised` branch, which the bound sync diffs): Ghoul Frenzy, Commander of Bone
 *   and their Empowered surges, and Bone Vanguard on a skeleton that leads;
 * - `boneArmorJudgement`, `unsummonJudgement`, `unsummonMana`, `gorgeJudgement`,
 *   `servantJudgement` - the Uses that collapse or feed a servant;
 * - `circleTemp`, `circleRadius`, `circleRemains`, `circleTick` - Circle of the Damned, Grand
 *   Circle and Cult Fervor, as the area pipeline reads an area (`rules/area-ticks.mjs`);
 * - `restlessBonesJudgement`, `standAgainNow` - the one 0-Health judgement's second source;
 * - `bloatedDeadBurst`, `boneStormHits` - the bursts;
 * - `lifeForALifeJudgement`, `blackRitePlan`, `darkCommunionJudgement` - the Damned's offerings.
 */

import { SKELETONS } from "./horde.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));

/** The class every row here is keyed under. */
export const NECRO_CLASS = "Necromancer";

/* ------------------------------------------------------------------ */
/*  04's numbers, each in one place                                     */
/* ------------------------------------------------------------------ */

// Flesh
/** *Each of your Plagued Ghouls adds your rank to its Damage Rating. At rank 3, ... 10 additional feet of Speed. Empowered. ... twice your rank*. */
export const GHOUL_FRENZY = Object.freeze({ identifier: "ghoul-frenzy", entries: Object.freeze(["Plagued Ghoul"]), speedRank: 3, speed: 10, surge: 2, essence: 1 });
/** *one of your Plagued Ghouls or Abominations and a corpse within its reach ... regains all its Health. Empowered. ... temporary Health equal to twice your tier*. */
export const GORGE = Object.freeze({ identifier: "gorge", entries: Object.freeze(["Plagued Ghoul", "Abomination"]), reach: 5, tempPerTier: 2, essence: 1 });
/** *hits a living creature ... Body Resilience Test against your Spell DC ... Shadow damage equal to your rank ... for 1 minute. Empowered ... Poisoned 1*. */
export const PLAGUE_CARRIER = Object.freeze({ identifier: "plague-carrier", entries: Object.freeze(["Plagued Ghoul", "Abomination"]), resilience: "body", type: "shadow", rounds: 10, poisoned: 1, essence: 1 });
/** *Risen Zombies, Plagued Ghouls or Abominations drops to 0 Health ... 5 ft radius ... your tier. At rank 2, the radius is 10 ft. Empowered ... twice your tier*. */
export const BLOATED_DEAD = Object.freeze({ identifier: "bloated-dead", entries: Object.freeze(["Risen Zombie", "Plagued Ghoul", "Abomination"]), feet: 5, feetAtRank2: 10, type: "shadow", surge: 2, essence: 1 });
/** *Plagued Ghouls and Abominations regains Health equal to your tier ... At rank 2, ... twice your tier. Empowered ... within 30 feet ... five times your tier*. */
export const REGENERATING_TISSUE = Object.freeze({ identifier: "regenerating-tissue", entries: Object.freeze(["Plagued Ghoul", "Abomination"]), feet: 30, empoweredPerTier: 5, essence: 1 });
/** *Once per Long Rest, you may cast Stitch Abomination with no corpses ... The GM judges the place*. */
export const EXHUME = Object.freeze({ identifier: "exhume", spell: "stitch-abomination", per: "long" });

// Bone
/** *choose one of your Risen Skeletons within 30 feet ... 1 additional Armor Point at every location until you finish a Long Rest ... up to your rank. Empowered ... until the end of the encounter, ... 1 more*. */
export const BONE_ARMOR = Object.freeze({ identifier: "bone-armor", entry: "Risen Skeleton", feet: 30, ap: 1, essence: 1 });
/** *While one of your skeletons is your lead, it adds your rank to its Damage Rating and to its Defense. Empowered ... three times your tier*. */
export const BONE_VANGUARD = Object.freeze({ identifier: "bone-vanguard", healPerTier: 3, essence: 1 });
/** *drops to 0 Health from anything but Holy damage, ... half its Health at the start of your next turn ... once. At rank 2 ... immediately. Empowered ... all its Health*. */
export const RESTLESS_BONES = Object.freeze({ identifier: "restless-bones", refuses: "holy", immediateRank: 2, essence: 1, flag: "restlessStood", pendingFlag: "restlessPending" });
/** *Each of your skeletons adds your rank to its Damage Rating. Empowered ... twice your rank*. */
export const COMMANDER_OF_BONE = Object.freeze({ identifier: "commander-of-bone", entries: SKELETONS, surge: 2, essence: 1 });
/** *Once per encounter ... your skeletons within 60 feet ... within 5 feet ... up to three ... your tier, and 1 further ... Spellpower: Shadow*. */
export const BONE_STORM = Object.freeze({ identifier: "bone-storm", feet: 60, near: 5, most: 3, type: "shadow" });
/** *While one of your skeletons is adjacent to you, the Physical damage an attack deals you falls by your rank*. */
export const MARROWGUARD = Object.freeze({ identifier: "marrowguard", adjacent: 5, type: "physical" });

// Damned
/** *one of your raised dead within 30 feet ... A Shade ... rises in its space ... until your next Long Rest. Empowered ... no place in your horde*. */
export const ACOLYTES_SACRIFICE = Object.freeze({ identifier: "acolytes-sacrifice", feet: 30, entry: "Shade", essence: 1 });
/** *Once a round, as a Half-Action ... within 30 feet ... Mana equal to your Intelligence modifier ... none for a creature raised this round. At rank 2, Unsummon takes no action*. */
export const UNSUMMON = Object.freeze({ identifier: "unsummon", feet: 30, roundMark: "unsummon", freeRank: 2 });
/** *a point within 30 feet ... A 10 ft radius ... for 1 minute ... temporary Health equal to your rank ... one circle at a time. Empowered ... your rank plus your Intelligence modifier*. */
export const CIRCLE = Object.freeze({ identifier: "circle-of-the-damned", feet: 30, radius: 10, rounds: 10, essence: 1, colour: "#5a3f6b" });
/** *Each ally in your circle has a Boon on Spirit Resilience Tests. At rank 2, ... Body Resilience Tests*. */
export const CULT_FERVOR = Object.freeze({ identifier: "cult-fervor", boons: Object.freeze(["spirit"]), boonsAtRank2: Object.freeze(["spirit", "body"]) });
/** *collapse one of your raised dead by your own choice, each ally within 10 feet of it ... temporary Health equal to your tier per rank*. */
export const SACRIFICIAL_STRENGTH = Object.freeze({ identifier: "sacrificial-strength", feet: 10 });
/** *one living ally within 30 feet ... half your Intelligence modifier, rounded down ... loses 1 Health ... At rank 2, choose two living allies*. */
export const UNHOLY_FERVOR = Object.freeze({ identifier: "unholy-fervor", feet: 30, lose: 1, type: "shadow", flag: "unholyFervor" });
/** *Your Shades see invisible creatures within 60 feet ... At rank 2, ... see and hear through one of your Shades ... until the start of your next turn*. */
export const WATCHFUL_SHADES = Object.freeze({ identifier: "watchful-shades", entry: "Shade", feet: 60, mode: "seeInvisibility", sightRank: 2, flag: "watchfulShade" });
/** *Your circle's radius is 15 feet. At rank 2, it is 20 feet. At rank 2, you may move your circle to a point you can see as a Half-Action*. */
export const GRAND_CIRCLE = Object.freeze({ identifier: "grand-circle", radii: Object.freeze([15, 20]), moveRank: 2 });
/** *Once a round, when an ally in your circle would drop to 0 Health ... within 30 feet of that ally ... 1 Health ... At rank 2, ... your tier*. */
export const LIFE_FOR_A_LIFE = Object.freeze({ identifier: "life-for-a-life", feet: 30, roundMark: "life-for-a-life", healRank: 2 });
/** *Your Dark Ritual's cap rises by 2 Mana per rank* (read by `necromancer-features.mjs#darkRitualCap`). */
export const GRIM_SACRAMENT = Object.freeze({ identifier: "grim-sacrament", perRank: 2 });
/** *Once per Short Rest ... a 10-minute rite with up to five willing allies ... three times your tier*. */
export const DARK_COMMUNION = Object.freeze({ identifier: "dark-communion", allies: 5, perTier: 3, minutes: 10, per: "short" });
/** *Once per Long Rest, as a Half-Action ... within 60 feet ... five times your tier ... Boon on every Test ... Empowered ... temporary Health equal to your Intelligence modifier*. */
export const BLACK_RITE = Object.freeze({ identifier: "the-black-rite", feet: 60, perTier: 5, essence: 1, per: "long" });

/**
 * **EVERY TALENT'S DOORS, BY THE FUNCTION THAT CALLS THEM** (the knight's `DK_SPELL_DOORS` shape,
 * D-983): one row or more for each of the thirty-six, `{file, fn, call}` - `necromancer-talents.test`
 * slices `file` to `fn` after `tools/strip-comments.mjs` blanks the comments and fails a `call` the
 * slice does not hold, so a door in a comment, or in the wrong function, is no door. Barbed Bone's is
 * team 4c-S's (Bone Shield's Reaction), its card posting under `BARBED_BONE_KEY`.
 */
const door = (file, fn, call) => Object.freeze({ file, fn, call });
const FX = "module/effects/necromancer-talents.mjs";
const HORDE_FX = "module/effects/necromancer-horde.mjs";
export const NECRO_TALENT_DOORS = Object.freeze({
  "ghoul-frenzy": [door("module/rules/bound.mjs", "boundEffects", "raisedTalentRows("), door("module/documents/bound.mjs", "syncBoundFor", "map(e => e.flags?.[\"azeroth-rpg\"]?.necroSurge?.key)"), door(FX, "landNecroTalentUse", "laySurge(")],
  "shambling-horde": [door("module/rules/raise.mjs", "hordeRaiseRow", "ranksOf(talent)"), door(HORDE_FX, "judgeHordeRaise", "hordeRaiseRow(key, ranksOf(actor))")],
  "gorge": [door(FX, "judgeNecroTalentUse", "gorgeJudgement("), door(FX, "landNecroTalentUse", "viaGM(\"gorgeCorpse\""), door(FX, "necroTalentQueryHandler", "corpsesOn(owner, GORGE_ROW, { scene, from: servantToken, reach: GORGE.reach")],
  "grafted-flesh": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Grafted Flesh\")")],
  "plague-carrier": [door("module/dice/workflows.mjs", "rollTest", "graftHitTests({ striker: actor, targets: list, attackName: title"), door("module/effects/graft-riders.mjs", "graftHitTests", "plagueCarrierTests("), door("module/effects/graft-riders.mjs", "graftTestLanded", "plagueCarrierLanded("), door(FX, "plagueCarrierLanded", "victim.createEmbeddedDocuments(\"ActiveEffect\", [{"), door(FX, "plagueCarrierLanded", "inflictCondition({ victim, id: \"poisoned\", value: PLAGUE_CARRIER.poisoned")],
  "flesh-offering": [door("module/documents/actor.mjs", "castLineOffer", "fleshOfferingLines(")],
  "surgeons-hand": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Surgeon's Hand\")")],
  "practiced-stitcher": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Practiced Stitcher\")")],
  "bloated-dead": [door(HORDE_FX, "onRaisedDown", "bloatedDeadOn("), door(FX, "bloatedDeadOn", "strikeFromArea({ actor: tk.actor, caster: owner")],
  "regenerating-tissue": [door("module/documents/combat.mjs", "_onStartTurn", "necroTalentTurnStart("), door(FX, "necroTalentTurnStart", "regenerationHeal("), door(FX, "judgeNecroTalentUse", "regenerationMend(")],
  // The Use (its Long Rest counter, the grant's) handed to the talent door by the feature door, and
  // landed with its words (the final review's nit: a message line alone was no door). Stitch
  // Abomination already asks for no corpse (`raise.mjs#RAISES`, `corpses: null`).
  "exhume": [door(HORDE_FX, "judgeNecroUse", "judgeNecroTalentUse(actor, item, { onUse, source })"), door(FX, "landNecroTalentUse", "t(\"AZEROTH.NecroTalent.Exhumed\", { name, feature: item.name })")],
  "masterwork-abomination": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Masterwork Abomination\")"), door(HORDE_FX, "makeHordeRaise", "ranksOf(owner)(\"Masterwork Abomination\")")],
  "skeletal-archery": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Skeletal Archery\")")],
  "skeletal-mastery": [door(HORDE_FX, "judgeHordeRaise", "ranksOf(actor)(\"Skeletal Mastery\")"), door("module/documents/actor.mjs", "castLineOffer", "skeletalMasteryLines(")],
  "bone-armor": [door(FX, "landNecroTalentUse", "layBoneArmor("), door("module/documents/actor.mjs", "longRest", "necroLongRest(")],
  "bone-vanguard": [door("module/rules/bound.mjs", "boundEffects", "raisedTalentRows({ entry: creature.entry ?? creature.name ?? null, isLead: Boolean(creature.id) && owner.hordeLead === creature.id"), door("module/documents/bound.mjs", "syncBoundFor", "hordeLead: leadFor({"), door(FX, "judgeNecroTalentUse", "vanguardMend(")],
  "restless-bones": [door(HORDE_FX, "onRaisedDown", "restlessJudged("), door(HORDE_FX, "hordeTurnStartNow", "restlessTurnStart("), door("module/documents/actor.mjs", "applyDamage", "killingBlowType(")],
  "marrowguard": [door("module/documents/actor.mjs", "applyDamage", "marrowguardOn(")],
  "swelling-ranks": [door(HORDE_FX, "capacityOf", "rankNamed(\"Swelling Ranks\")"), door("module/rules/horde.mjs", "hordeCapacity", "Math.max(0, int(swellingRanks))")],
  "ranks-of-bone": [door("module/rules/raise.mjs", "hordeRaiseRow", "ranksOf(talent)"), door(HORDE_FX, "judgeHordeRaise", "hordeRaiseRow(key, ranksOf(actor))")],
  // Team 4c-S's door, on Bone Shield's Reaction (`effects/necromancer-spells.mjs`).
  "barbed-bone": [door("module/effects/necromancer-spells.mjs", "barbedBoneStrikes", "resolveRecordedDamage({ rating, sl: 0, kind: \"magical\", school: BARBED_BONE.type"), door("module/effects/necromancer-spells.mjs", "barbedBoneStrikes", "postFeatureCard(holder, {")],
  "commander-of-bone": [door("module/rules/bound.mjs", "boundEffects", "raisedTalentRows("), door(FX, "landNecroTalentUse", "laySurge(")],
  "bone-storm": [door(FX, "judgeNecroTalentUse", "boneStormHits("), door(FX, "landNecroTalentUse", "strikeOn(")],
  "the-endless-host": [door(HORDE_FX, "capacityOf", "rankNamed(\"The Endless Host\")"), door("module/rules/horde.mjs", "hordeCapacity", "Math.max(0, int(arcanaRanks))")],
  "acolytes-sacrifice": [door(FX, "landNecroTalentUse", "askGM(RAISE_QUERY, raiseQueryHandler, {"), door(HORDE_FX, "makeHordeRaise", "game.actors.get(String(offering.actorId ?? \"\"))")],
  "unsummon": [door(FX, "judgeNecroTalentUse", "unsummonMana("), door(FX, "landNecroTalentUse", "markRound(actor, UNSUMMON.roundMark)")],
  "circle-of-the-damned": [door(FX, "landNecroTalentUse", "drawCircle("), door("module/documents/combat.mjs", "_areaTicks", "actor.grantTemporaryHealth?.(payload.temp,"), door("module/rules/area-ticks.mjs", "tickFor", "Math.trunc(Number(tick.temp))")],
  "cult-fervor": [door(FX, "drawCircle", "circleRemains(rankIn(talents, \"cult-fervor\")")],
  "sacrificial-strength": [door(HORDE_FX, "collapseHordeTokens", "sacrificialPlan(owner, tokens, { byChoice: true })"), door(HORDE_FX, "collapseHordeTokens", "landSacrificial(sacrificial)"), door(FX, "landSacrificial", "tempOn(actor, plan.amount")],
  "unholy-fervor": [door(FX, "landNecroTalentUse", "viaGMOrHere(\"fervor\""), door(FX, "necroTalentQueryHandler", "unholyFervorDamage(owner.system?.abilities?.int?.mod ?? 0)"), door(FX, "necroTalentTurnStart", "actor.loseHealth?.(UNHOLY_FERVOR.lose)")],
  "watchful-shades": [door(HORDE_FX, "makeHordeRaise", "syncWatchfulShades(owner)"), door(FX, "syncWatchfulShades", "scene.updateEmbeddedDocuments(\"Token\""), door(FX, "judgeNecroTalentUse", "lookRefusal(borrow)"), door(FX, "landNecroTalentUse", "lookAfterCard(actor, plan)"), door(FX, "lookAfterCard", "lookThrough(plan)")],
  "grand-circle": [door(FX, "drawCircle", "circleRadius("), door(FX, "necroTalentQueryHandler", "region.update({ shapes: data.shapes })")],
  "life-for-a-life": [door("module/effects/blow-doors.mjs", "askToHold", "lifeForALifeJudged("), door("module/effects/blow-doors.mjs", "holdHere", "lifeForALifeHere(")],
  "grim-sacrament": [door(HORDE_FX, "landNecroUse", "ranksOf(actor)(\"Grim Sacrament\")")],
  "dark-communion": [door(FX, "judgeNecroTalentUse", "darkCommunionJudgement("), door(FX, "landNecroTalentUse", "healOn(target, plan.heal")],
  "the-black-rite": [door(FX, "judgeNecroTalentUse", "blackRitePlan("), door(FX, "landNecroTalentUse", "layBoon(")]
});

/** The talents whose Empowered surge lays a turn's state on the Necromancer (`necroSurge`). */
export const SURGE_TALENTS = Object.freeze([GHOUL_FRENZY.identifier, COMMANDER_OF_BONE.identifier, PLAGUE_CARRIER.identifier]);

/** The flag an Empowered surge rides on the Necromancer's own effect (`{key, by}`). */
export const SURGE_FLAG = "necroSurge";
/** The flag Bone Armor's stacks and its encounter armour ride (`{kind: "rest"|"encounter"}`). */
export const BONE_ARMOR_FLAG = "boneArmor";

/* ------------------------------------------------------------------ */
/*  Ranks                                                               */
/* ------------------------------------------------------------------ */

/** A Necromancer talent's rank taken, by identifier, 0 where it is not. */
export function rankIn(talents = [], identifier) {
  const row = (talents ?? []).find(t => t?.identifier === identifier && (!t.className || t.className === NECRO_CLASS));
  return whole(row?.taken);
}

/* ------------------------------------------------------------------ */
/*  What the owner's talents lay on one raised creature                 */
/* ------------------------------------------------------------------ */

const addChange = (key, value) => ({ key, type: "add", value });

/**
 * **THE OWNER'S TALENTS ON ONE OF ITS RAISED DEAD** - `boundEffects`' `raised` branch (finding 17):
 *
 * - **Ghoul Frenzy** on a Plagued Ghoul: its rank to the Damage Rating, twice it while the
 *   Empowered surge stands; at rank 3, 10 feet of Speed;
 * - **Commander of Bone** on a skeleton: its rank to the Damage Rating, twice it while surged;
 * - **Bone Vanguard** on a skeleton that leads: its rank to the Damage Rating and to Defense.
 *
 * One row a talent, `boundEffects`' own shape, in a fixed order.
 *
 * @param {{entry?: string|null, isLead?: boolean, talents?: object[], surges?: string[]}} o
 * @returns {Array<{talent: string, label: string, encounter: boolean, changes: object[]}>}
 */
export function raisedTalentRows({ entry = null, isLead = false, talents = [], surges = [] } = {}) {
  const out = [];
  const name = String(entry ?? "");
  const surged = new Set(surges ?? []);
  const frenzy = rankIn(talents, GHOUL_FRENZY.identifier);
  if (frenzy && GHOUL_FRENZY.entries.includes(name)) {
    const dr = surged.has(GHOUL_FRENZY.identifier) ? GHOUL_FRENZY.surge * frenzy : frenzy;
    const changes = [addChange("system.damageBonus", dr)];
    if (frenzy >= GHOUL_FRENZY.speedRank) changes.push(addChange("system.speed", GHOUL_FRENZY.speed));
    out.push({ talent: GHOUL_FRENZY.identifier, label: "AZEROTH.NecroTalent.Bound.GhoulFrenzy", encounter: false, changes });
  }
  const skeleton = SKELETONS.includes(name);
  const commander = rankIn(talents, COMMANDER_OF_BONE.identifier);
  if (commander && skeleton) {
    const dr = surged.has(COMMANDER_OF_BONE.identifier) ? COMMANDER_OF_BONE.surge * commander : commander;
    out.push({ talent: COMMANDER_OF_BONE.identifier, label: "AZEROTH.NecroTalent.Bound.CommanderOfBone", encounter: false, changes: [addChange("system.damageBonus", dr)] });
  }
  const vanguard = rankIn(talents, BONE_VANGUARD.identifier);
  if (vanguard && skeleton && isLead === true) {
    out.push({ talent: BONE_VANGUARD.identifier, label: "AZEROTH.NecroTalent.Bound.BoneVanguard", encounter: false, changes: [addChange("system.damageBonus", vanguard), addChange("system.defense", vanguard)] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  The Uses that collapse or feed a servant                            */
/* ------------------------------------------------------------------ */

/**
 * **ONE OF YOUR RAISED DEAD WITHIN N FEET, STANDING, OF THE KINDS NAMED** - the one judgement every
 * Use that picks a servant asks (Gorge, Bone Armor, Acolyte's Sacrifice, Unsummon, Regenerating
 * Tissue's mending, Bone Vanguard's). A lang key's tail, or null.
 *
 * @param {{servant?: {entry?: string, feet?: number|null, health?: number}|null, feet: number, entries?: string[]|null}} o
 * @returns {"noServant"|"tooFar"|"wrongKind"|null}
 */
export function servantJudgement({ servant = null, feet = 30, entries = null } = {}) {
  if (!servant || !((Number(servant.health) || 0) > 0)) return "noServant";
  if (Array.isArray(entries) && !entries.includes(String(servant.entry ?? ""))) return "wrongKind";
  if (!(typeof servant.feet === "number" && Number.isFinite(servant.feet) && servant.feet <= Number(feet) + 1e-6)) return "tooFar";
  return null;
}

/**
 * **BONE ARMOR, JUDGED** (*You may have this benefit a number of times up to your rank*; the
 * architect's Q2: the Empowered line is a separate armour *until the end of the encounter*, never a
 * free stack). `stacks` the rest-long stacks standing; `servant` the Risen Skeleton chosen (none
 * for the Empowered line). A lang key's tail, or null.
 *
 * @param {{rank?: number, stacks?: number, empowered?: boolean, essence?: number, inFight?: boolean, servant?: object|null}} o
 * @returns {string|null}
 */
export function boneArmorJudgement({ rank = 0, stacks = 0, empowered = false, essence = 0, inFight = false, servant = null } = {}) {
  if (empowered) {
    if (inFight !== true) return "noEncounter";
    if (whole(essence) < BONE_ARMOR.essence) return "noEssence";
    return null;
  }
  if (whole(stacks) >= whole(rank)) return "stacksFull";
  return servantJudgement({ servant, feet: BONE_ARMOR.feet, entries: [BONE_ARMOR.entry] });
}

/**
 * **WHERE BONE ARMOR'S EMPOWERED LINE GOES WHEN ITS ESSENCE RUNS SHORT AFTER THE PAYMENT** (the 4c
 * review; Dark Ritual's shape): the Half-Action is spent, so the plain line is offered where a stack
 * is free and a Risen Skeleton the plain judgement allows stands within 30 feet (`plain`), and
 * otherwise the Half-Action is said spent for nothing (`spent`).
 *
 * @param {{rank?: number, stacks?: number, available?: number}} o  `available` the skeletons the plain judgement allows
 * @returns {"plain"|"spent"}
 */
export function boneArmorFallbackWay({ rank = 0, stacks = 0, available = 0 } = {}) {
  if (whole(stacks) >= whole(rank)) return "spent";
  return whole(available) > 0 ? "plain" : "spent";
}

/** Bone Armor's Armor Point changes on every location the bearer has (`final`: Armor Points are derived). */
export function boneArmorChanges(locations = ["body", "head", "limb"]) {
  return (locations ?? []).map(l => ({ key: `system.ap.${l}`, type: "add", value: BONE_ARMOR.ap, phase: "final" }));
}

/**
 * **UNSUMMON, JUDGED** (the architect's Q1: *once a round, as a Half-Action; rank 2 makes that one
 * use take no action*): a servant within 30 feet, and the round's one use. A lang key's tail, or null.
 *
 * @param {{servant?: object|null, roundUsed?: boolean}} o
 */
export function unsummonJudgement({ servant = null, roundUsed = false } = {}) {
  if (roundUsed === true) return "roundUsed";
  return servantJudgement({ servant, feet: UNSUMMON.feet });
}

/** *You regain Mana equal to your Intelligence modifier. You regain none for a creature raised this round*. */
export function unsummonMana({ intMod = 0, raisedThisRound = false } = {}) {
  return raisedThisRound === true ? 0 : whole(intMod);
}

/**
 * **WHETHER A CREATURE WAS RAISED THIS ROUND** off its bond's raise record (`raisedRound` and
 * `raisedCombat`, stamped by the raise in a started fight), against the fight now. Out of a fight
 * there is no round, so nothing was raised in it.
 *
 * @param {{raisedCombat?: string|null, raisedRound?: number|null}|null} bond
 * @param {{combatId?: string|null, round?: number|null}} now
 */
export function raisedThisRound(bond = null, { combatId = null, round = null } = {}) {
  if (!bond || !combatId || !bond.raisedCombat) return false;
  return bond.raisedCombat === combatId && int(bond.raisedRound) === int(round);
}

/**
 * **GORGE, JUDGED**: one of your Plagued Ghouls or Abominations, standing, and a corpse within its
 * reach (D-732's footprints), and - empowered - 1 Essence. A lang key's tail, or null.
 *
 * @param {{servant?: object|null, corpseFeet?: number|null, reach?: number, empowered?: boolean, essence?: number}} o
 */
export function gorgeJudgement({ servant = null, corpseFeet = null, reach = GORGE.reach, empowered = false, essence = 0 } = {}) {
  if (!servant || !((Number(servant.health) || 0) > 0)) return "noServant";
  if (!GORGE.entries.includes(String(servant.entry ?? ""))) return "wrongKind";
  if (!(typeof corpseFeet === "number" && Number.isFinite(corpseFeet) && corpseFeet <= Number(reach) + 1e-6)) return "noCorpse";
  if (empowered && whole(essence) < GORGE.essence) return "noEssence";
  return null;
}

/** Gorge's Empowered temporary Health: twice your tier. */
export function gorgeTemp(tier = 1) {
  return GORGE.tempPerTier * tierOf(tier);
}

/** Regenerating Tissue at a turn's start: your tier, twice it at rank 2; nothing untaken. */
export function regenerationHeal({ tier = 1, rank = 0 } = {}) {
  const r = whole(rank);
  if (!r) return 0;
  return tierOf(tier) * (r >= 2 ? 2 : 1);
}

/** Regenerating Tissue's Empowered mending: five times your tier. */
export function regenerationMend(tier = 1) {
  return REGENERATING_TISSUE.empoweredPerTier * tierOf(tier);
}

/** Bone Vanguard's Empowered mending: three times your tier. */
export function vanguardMend(tier = 1) {
  return BONE_VANGUARD.healPerTier * tierOf(tier);
}

/* ------------------------------------------------------------------ */
/*  Circle of the Damned, Grand Circle and Cult Fervor                  */
/* ------------------------------------------------------------------ */

/** The circle's temporary Health: your rank, or - empowered at the drawing - your rank plus your Intelligence modifier. */
export function circleTemp({ rank = 0, intMod = 0, empowered = false } = {}) {
  const r = whole(rank);
  if (!r) return 0;
  return empowered ? r + whole(intMod) : r;
}

/** The circle's radius: 10 feet, 15 with Grand Circle, 20 at its rank 2. */
export function circleRadius(grandRank = 0) {
  const g = whole(grandRank);
  if (!g) return CIRCLE.radius;
  return GRAND_CIRCLE.radii[Math.min(g, GRAND_CIRCLE.radii.length) - 1];
}

/**
 * **CULT FERVOR'S BOONS, AS THE AREA'S RIDERS** (the aura door's third centre, D-757: what a placed
 * area lays on a creature while it remains): one row a Resilience, on every ally inside - Spirit, and
 * Body as well at rank 2. Each row is `area-ticks.mjs#emptyRemains`' shape, `boon` a Resilience's name
 * (`riderPayload` reads it as a Boon on that Resilience alone).
 *
 * @param {number} rank
 * @param {() => object} emptyRow  `emptyRemains`, handed in so this module stays leaf
 */
export function circleRemains(rank = 0, emptyRow = () => ({})) {
  const r = whole(rank);
  if (!r) return [];
  const boons = r >= 2 ? CULT_FERVOR.boonsAtRank2 : CULT_FERVOR.boons;
  return boons.map(resilience => ({ ...emptyRow(), when: "inside", who: "ally", boon: resilience }));
}

/**
 * **THE CIRCLE AS THE AREA PIPELINE READS IT** - an `areaTick` whose subject is every ally (the
 * Necromancer among them, D-755), carrying the temporary Health `tickFor` hands the turn's start
 * (`temp`, read by `AzerothCombat#_areaTicks` and granted through `grantTemporaryHealth`) and Cult
 * Fervor's riders. `base` is `area-ticks.mjs#emptyAreaTick()`.
 *
 * @param {{base: object, temp: number, remains?: object[]}} o
 */
export function circleTick({ base = {}, temp = 0, remains = [] } = {}) {
  return { ...base, who: "ally", temp: whole(temp), remains: [...(remains ?? [])], lasts: { rounds: CIRCLE.rounds }, reason: "" };
}

/* ------------------------------------------------------------------ */
/*  Restless Bones: the 0-Health judgement's second source              */
/* ------------------------------------------------------------------ */

/**
 * **RESTLESS BONES, JUDGED** (04: *When one of your skeletons drops to 0 Health from anything but
 * Holy damage, it stands again with half its Health at the start of your next turn. Each skeleton
 * stands again this way once. At rank 2, it stands again immediately*): the talent held, a skeleton,
 * a killing blow whose type is not Holy (read off the blow's record the damage door stamped), and
 * never twice. `when` is `immediate` at rank 2, else `turnStart` (the lead's Q1 reading: held up
 * until the start of the Necromancer's next turn).
 *
 * @param {{rank?: number, skeleton?: boolean, type?: string|null, stood?: boolean}} o
 * @returns {{ok: boolean, reason: string|null, when: null|"immediate"|"turnStart"}}
 */
export function restlessBonesJudgement({ rank = 0, skeleton = false, type = null, stood = false } = {}) {
  if (!whole(rank)) return { ok: false, reason: "notHeld", when: null };
  if (skeleton !== true) return { ok: false, reason: "notSkeleton", when: null };
  if (String(type ?? "") === RESTLESS_BONES.refuses) return { ok: false, reason: "holy", when: null };
  if (stood === true) return { ok: false, reason: "once", when: null };
  return { ok: true, reason: null, when: whole(rank) >= RESTLESS_BONES.immediateRank ? "immediate" : "turnStart" };
}

/**
 * **THE KILLING BLOW'S TYPE, AS RESTLESS BONES READS IT**: Holy where the blow's own type is Holy or
 * any of its second amounts that reached the creature is (*from anything but Holy damage*), else the
 * blow's type, or null for a blow that names none.
 *
 * @param {{type?: string|null, parts?: Array<{type?: string|null, damage?: number}>|null}} blow
 * @returns {string|null}
 */
export function killingBlowType({ type = null, parts = null } = {}) {
  const holy = RESTLESS_BONES.refuses;
  if (type === holy || (Array.isArray(parts) && parts.some(p => p?.type === holy && whole(p.damage) > 0))) return holy;
  return typeof type === "string" && type ? type : null;
}

/**
 * **WHETHER THE STAND IS MADE NOW**: at rank 2 at once; at rank 1 at the start of the Necromancer's
 * next turn in a fight, and - out of a fight, where there is no turn to wait for - at once (MY
 * READING, for the lead: the next turn is the next moment).
 */
export function standAgainNow({ when = null, inFight = false } = {}) {
  if (when === "immediate") return true;
  return when === "turnStart" && inFight !== true;
}

/** *It stands with all its Health* (empowered) or *half its Health*, never below 1. */
export function restlessHealth(max = 0, { empowered = false } = {}) {
  const m = whole(max);
  return empowered ? Math.max(1, m) : Math.max(1, Math.floor(m / 2));
}

/* ------------------------------------------------------------------ */
/*  Marrowguard                                                         */
/* ------------------------------------------------------------------ */

/** Physical, or a blow that names no type (`rules/invulnerability-potion.mjs`' reading: a claw names none). */
const isPhysicalType = t => t === null || t === undefined || t === "" || t === MARROWGUARD.type;

/**
 * **MARROWGUARD'S CUT** (04: *While one of your skeletons is adjacent to you, the Physical damage an
 * attack deals you falls by your rank*): a standing reduction on the Physical share of an ATTACK's
 * blow alone - the blow's main amount where its type is Physical or unnamed, then each Physical second
 * amount (`parts`, `{type, damage}`, already inside `amount`). Nothing where no skeleton stands
 * adjacent, where the blow is no attack, or where nothing of it is Physical: a Fire spell meets the
 * Necromancer's Ward instead (the plan's reading).
 *
 * @param {{amount?: number, type?: string|null, parts?: Array<{type?: string|null, damage?: number}>|null, rank?: number, adjacent?: boolean, attack?: boolean}} o
 * @returns {{amount: number, parts: Array|null, cut: number}}
 */
export function marrowguardCut({ amount = 0, type = null, parts = null, rank = 0, adjacent = false, attack = false } = {}) {
  const total = whole(amount);
  const list = Array.isArray(parts) ? parts.map(p => ({ ...p, damage: whole(p?.damage) })) : null;
  let left = whole(rank);
  if (!left || adjacent !== true || attack !== true || total <= 0) return { amount: total, parts, cut: 0 };
  const inParts = (list ?? []).reduce((n, p) => n + p.damage, 0);
  let main = Math.max(0, total - inParts);
  let cut = 0;
  if (isPhysicalType(type) && main > 0) {
    const off = Math.min(left, main);
    main -= off; left -= off; cut += off;
  }
  for (const p of list ?? []) {
    if (left <= 0) break;
    if (!isPhysicalType(p.type) || p.damage <= 0) continue;
    const off = Math.min(left, p.damage);
    p.damage -= off; left -= off; cut += off;
  }
  return { amount: total - cut, parts: list, cut };
}

/* ------------------------------------------------------------------ */
/*  The bursts                                                          */
/* ------------------------------------------------------------------ */

/**
 * **BLOATED DEAD'S BURST**: the radius by rank (5 ft, 10 at rank 2) and the Shadow it deals - your
 * tier, twice it where the Empowered Essence was spent - or null where the talent is not held or the
 * creature is not one of its kinds.
 *
 * @param {{rank?: number, tier?: number, entry?: string|null, empowered?: boolean}} o
 * @returns {{feet: number, damage: number, type: string}|null}
 */
export function bloatedDeadBurst({ rank = 0, tier = 1, entry = null, empowered = false } = {}) {
  const r = whole(rank);
  if (!r || !BLOATED_DEAD.entries.includes(String(entry ?? ""))) return null;
  return { feet: r >= 2 ? BLOATED_DEAD.feetAtRank2 : BLOATED_DEAD.feet, damage: tierOf(tier) * (empowered ? BLOATED_DEAD.surge : 1), type: BLOATED_DEAD.type };
}

/**
 * **BONE STORM'S BLOWS**: for each enemy, how many of the collapsing skeletons stand within 5 feet of
 * it, up to three - one blow each - and the Shadow each blow deals (your tier plus your Spellpower:
 * Shadow). `near[enemyId]` is the count of chosen skeletons within 5 feet, measured by the door.
 *
 * @param {{near?: Record<string, number>, tier?: number, spellpower?: number}} o
 * @returns {{perBlow: number, blows: Record<string, number>}}
 */
export function boneStormHits({ near = {}, tier = 1, spellpower = 0 } = {}) {
  const blows = {};
  for (const [id, n] of Object.entries(near ?? {})) {
    const k = Math.min(BONE_STORM.most, whole(n));
    if (k > 0) blows[id] = k;
  }
  return { perBlow: tierOf(tier) + whole(spellpower), blows };
}

/* ------------------------------------------------------------------ */
/*  The Damned's offerings                                              */
/* ------------------------------------------------------------------ */

/** Sacrificial Strength's temporary Health: your tier per rank. */
export function sacrificialTemp({ tier = 1, rank = 0 } = {}) {
  return tierOf(tier) * whole(rank);
}

/** Unholy Fervor's Shadow on each hit: half your Intelligence modifier, rounded down. */
export function unholyFervorDamage(intMod = 0) {
  return Math.floor(whole(intMod) / 2);
}

/** How many living allies Unholy Fervor names at a rank: one, two at rank 2. */
export function unholyFervorAllies(rank = 1) {
  return whole(rank) >= 2 ? 2 : 1;
}

/**
 * **A LOOK, JUDGED BEFORE IT IS PAID FOR** (Watchful Shades at rank 2 and 07's Spirit Anchor, the fix run
 * 4 review): the scene the look names still stands, this user may view it (already viewing it, a GM, or
 * LIMITED on the scene), and a token the look names still stands on it. `lookThrough`'s own refusals
 * in the same order, asked before the Half-Action, so a look that cannot happen costs nothing.
 *
 * @param {{scene?: boolean, viewing?: boolean, gm?: boolean, limited?: boolean, tokenNamed?: boolean, tokenOnScene?: boolean}} o
 * @returns {null|"noScene"|"cannotView"|"noToken"}
 */
export function lookJudgement({ scene = false, viewing = false, gm = false, limited = false, tokenNamed = false, tokenOnScene = false } = {}) {
  if (!scene) return "noScene";
  if (!(viewing || gm || limited)) return "cannotView";
  if (tokenNamed && !tokenOnScene) return "noToken";
  return null;
}

/**
 * **LIFE FOR A LIFE, JUDGED** (04: *Once a round, when an ally in your circle would drop to 0 Health,
 * you may collapse one of your raised dead within 30 feet of that ally*): the talent held, the ally
 * inside this Necromancer's circle, a servant standing within 30 feet of the ally, the round's one
 * use. A lang key's tail, or null.
 *
 * @param {{rank?: number, inCircle?: boolean, servants?: Array<{feet: number|null, health: number}>, roundUsed?: boolean, holderUp?: boolean}} o
 */
export function lifeForALifeJudgement({ rank = 0, inCircle = false, servants = [], roundUsed = false, holderUp = true } = {}) {
  if (!whole(rank)) return "notHeld";
  if (holderUp !== true) return "down";
  if (inCircle !== true) return "notInCircle";
  const near = (servants ?? []).some(s => typeof s?.feet === "number" && s.feet <= LIFE_FOR_A_LIFE.feet + 1e-6 && (Number(s.health) || 0) > 0);
  if (!near) return "noServant";
  if (roundUsed === true) return "roundUsed";
  return null;
}

/** Life for a Life's heal: your tier at rank 2, nothing below it. */
export function lifeForALifeHeal({ rank = 0, tier = 1 } = {}) {
  return whole(rank) >= LIFE_FOR_A_LIFE.healRank ? tierOf(tier) : 0;
}

/** Dark Communion's heal: three times your tier. */
export function darkCommunionHeal(tier = 1) {
  return DARK_COMMUNION.perTier * tierOf(tier);
}

/**
 * **DARK COMMUNION, JUDGED**: a 10-minute rite, never in a started fight; up to five willing allies
 * and at least one. A lang key's tail, or null.
 *
 * @param {{inFight?: boolean, allies?: number}} o
 */
export function darkCommunionJudgement({ inFight = false, allies = 0 } = {}) {
  if (inFight === true) return "inFight";
  const n = whole(allies);
  if (n < 1) return "noAlly";
  if (n > DARK_COMMUNION.allies) return "tooMany";
  return null;
}

/** The Black Rite's heal for each time an ally is chosen: five times your tier. */
export function blackRiteHeal(tier = 1) {
  return BLACK_RITE.perTier * tierOf(tier);
}

/**
 * **THE BLACK RITE'S PLAN** (04: *For each creature that collapses, choose an ally ... You may choose
 * the same ally more than once. Each time you choose an ally, it regains Health equal to five times
 * your tier*): the picks, one an offering, folded into one heal an ally with its count. A pick list
 * longer or shorter than the offerings is refused.
 *
 * @param {{offerings?: number, picks?: string[], tier?: number}} o
 * @returns {{ok: boolean, reason: string|null, heals: Array<{id: string, times: number, heal: number}>}}
 */
export function blackRitePlan({ offerings = 0, picks = [], tier = 1 } = {}) {
  const n = whole(offerings);
  if (n < 1) return { ok: false, reason: "noServant", heals: [] };
  const list = (picks ?? []).filter(p => typeof p === "string" && p);
  if (list.length !== n) return { ok: false, reason: "picks", heals: [] };
  const times = new Map();
  for (const id of list) times.set(id, (times.get(id) ?? 0) + 1);
  const each = blackRiteHeal(tier);
  return { ok: true, reason: null, heals: [...times.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, k]) => ({ id, times: k, heal: each * k })) };
}
