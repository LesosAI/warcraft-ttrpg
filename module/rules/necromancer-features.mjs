/**
 * **THE NECROMANCER'S FEATURES, AS LAW** (02 §7's *Features by level*; the Necromancer plan's
 * Phase 4 doors 3 and 5 to 11). Pure: no Foundry imports (CLAUDE.md §3). The doors are
 * `effects/necromancer-horde.mjs` and `effects/grave-guard.mjs`; every judgement here is asked
 * BEFORE the budget and the payment (D-768's order) and asked again where the write lands.
 *
 * - `hordeMember`, `hordeTurnFacts` - Command the Dead's shared turn, off the bond a horde
 *   creature carries and the Necromancer's `hordeLead` flag (`horde.mjs#leadFor`, `turnShape`);
 * - `deathlyVigor` - *it gains temporary Health equal to your Intelligence modifier*;
 * - `claimFallenJudgement` - *When a living creature dies within 30 feet of you, you may use your
 *   Reaction to cast Raise Dead or Animate Corpse on its corpse*;
 * - `graveGuardJudgement`, `graveGuardSplit`, `graveGuardInput` - *choose one of your raised dead
 *   within 10 feet of you. The blow damages that creature instead of you. That creature's Armor
 *   Points and Ward apply to it. Damage beyond that creature's Health is dealt to you*;
 * - `darkRitualJudgement`, `darkRitualMana` - *regain Mana equal to its current Health, up to
 *   three times your tier*;
 * - `unendingDeadJudgement`, `standAgainHealth` - *It stands again with half its Health. Each
 *   creature stands again this way once*;
 * - `enslaveRefusal` - 07's Enslave the Dead's target line;
 * - `LICH_WARD`, `PHYLACTERY` - Lichdom's Ward and its phylactery.
 */

import { leadFor, turnShape } from "./horde.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));

/** The feature names, as 02 §7 prints them. */
export const NECRO_FEATURES = Object.freeze({
  command: "Command the Dead",
  graveCalling: "Grave Calling",
  deathlyVigor: "Deathly Vigor",
  claimTheFallen: "Claim the Fallen",
  graveGuard: "Grave Guard",
  darkRitual: "Dark Ritual",
  unendingDead: "Unending Dead",
  lichdom: "Lichdom"
});

/** 02 §7's numbers, each in one place. */
export const CLAIM_THE_FALLEN = Object.freeze({ feet: 30, spells: Object.freeze(["raise-dead", "animate-corpse"]), essence: 1 });
export const GRAVE_GUARD = Object.freeze({ feet: 10, essence: 1, roundMark: "grave-guard" });
export const DARK_RITUAL = Object.freeze({ feet: 30, perTier: 3, essence: 1, grimSacramentPerRank: 2 });
export const UNENDING_DEAD = Object.freeze({ feet: 60, essence: 1 });
export const COMMAND_SURGE = Object.freeze({ essence: 1 });

/** Lichdom's *Ward 3 (Frost) and Ward 3 (Shadow)*. */
export const LICH_WARD = Object.freeze({ frost: 3, shadow: 3 });

/**
 * Lichdom's phylactery: the 08 gear item a lich binds itself to at a Long Rest, and the day it
 * takes to return (*you return to life 1 day later*). `flag` is the bond on the lich and on the item.
 */
export const PHYLACTERY = Object.freeze({ name: "Phylactery", seconds: 86400, flag: "phylactery", returnFlag: "phylacteryReturn", windowSeconds: 3600 });

/**
 * **THE PHYLACTERY'S WINDOW CLOSES** (the 4b review's S12: it never did). *When you finish a Long
 * Rest, you may bind yourself to a phylactery you carry*: the window the Long Rest opens stands for
 * an hour of the world's clock (MY READING, for the lead: the finishing of the rest, not the day
 * after it), and the next Long Rest opens a new one. Whether a window opened at `flag.at` is open now.
 *
 * @param {{at?: number}|null} flag
 * @param {number} now  the world's time
 */
export function phylacteryWindowOpen(flag, now = 0) {
  const at = Number(flag?.at);
  const t = Number(now);
  return Number.isFinite(at) && Number.isFinite(t) && t >= at - 1 && t - at <= PHYLACTERY.windowSeconds;
}

/** The flag a surged creature carries until its next turn (Command the Dead's Empowered line). */
export const HORDE_SURGE_FLAG = "hordeSurge";

/** The flag a raised dead carries once Unending Dead has stood it again (*once*). */
export const STOOD_AGAIN_FLAG = "stoodAgain";

/**
 * **ONE HORDE CREATURE, AS THE LAW READS IT** off its world actor's bond: `{id, entry,
 * raisedAt, outside, controlled: false, keepsReaction, places, health}`. Null where the actor
 * carries no horde bond.
 *
 * @param {{id: string, name?: string, health?: number|null, bond?: object|null}} o
 */
export function hordeMember({ id, name = "", health = null, bond = null } = {}) {
  if (!bond || bond.kind !== "raised" || bond.horde !== true) return null;
  return {
    id: String(id ?? ""), entry: String(bond.entryName ?? name ?? ""), raisedAt: Number(bond.since) || 0,
    outside: bond.outside === true, controlled: false, keepsReaction: bond.keepsReaction === true,
    health: typeof health === "number" ? health : null
  };
}

/** The members that count against the places: standing (Health above 0) and not outside. */
export function countedMembers(members = []) {
  return (members ?? []).filter(m => m && m.outside !== true && !(typeof m.health === "number" && m.health <= 0));
}

/**
 * **WHAT ONE HORDE CREATURE TAKES ON ITS TURN** (02 §7's Command the Dead), for
 * `AzerothCombatant#_turnFacts`: the lead its own turn, every other creature one Half-Action and
 * no Reaction unless its raise kept one, and Command the Dead's surge two Half-Actions.
 *
 * @param {{self: object, members: object[], flag?: object|null, startingTurnOf?: string|null, surged?: boolean}} o
 * @returns {{halfActions: number, reactions: number, isLead: boolean}}
 */
export function hordeTurnFacts({ self, members = [], flag = null, startingTurnOf = null, surged = false } = {}) {
  const lead = leadFor({ flag, members: (members ?? []).filter(m => !(typeof m.health === "number" && m.health <= 0)), startingTurnOf });
  const isLead = Boolean(self?.id) && lead === self.id;
  return { ...turnShape({ isLead, keepsReaction: self?.keepsReaction === true, surged }), isLead };
}

/**
 * **THE LEAD NAMED AT A CAST** (02 §7: *When you cast a spell, you may name another of your raised
 * dead your lead, from that creature's next turn*): the flag `leadFor` reads - the one named, the
 * lead standing now as `previous`, `taken: false` until the named creature starts a turn.
 *
 * @param {{named: string, current?: string|null}} o
 */
export function namedLead({ named, current = null } = {}) {
  return { id: String(named), previous: current ? String(current) : null, taken: false };
}

/** Deathly Vigor's temporary Health: the Intelligence modifier, nothing where it is not above 0. */
export function deathlyVigor(intMod = 0) {
  return whole(intMod);
}

/**
 * **CLAIM THE FALLEN, JUDGED** before the Reaction is offered and again at its press: a living
 * creature dead within 30 feet, the Reaction left, a known Raise Dead or Animate Corpse, and -
 * empowered - 1 Essence held.
 *
 * @param {{living?: boolean, feet?: number|null, reactionLeft?: boolean, known?: string[], empowered?: boolean, essence?: number}} o
 * @returns {{ok: boolean, reason: string|null, spells: string[]}}
 */
export function claimFallenJudgement({ living = false, feet = null, reactionLeft = true, known = [], empowered = false, essence = 0 } = {}) {
  const spells = CLAIM_THE_FALLEN.spells.filter(k => (known ?? []).includes(k));
  if (living !== true) return { ok: false, reason: "notLiving", spells };
  if (!(typeof feet === "number" && Number.isFinite(feet) && feet <= CLAIM_THE_FALLEN.feet + 1e-6)) return { ok: false, reason: "tooFar", spells };
  if (!spells.length) return { ok: false, reason: "noSpell", spells };
  if (reactionLeft !== true) return { ok: false, reason: "noReaction", spells };
  if (empowered && whole(essence) < CLAIM_THE_FALLEN.essence) return { ok: false, reason: "noEssence", spells };
  return { ok: true, reason: null, spells };
}

/**
 * **GRAVE GUARD, JUDGED** (02 §7): one of your raised dead within 10 feet and standing, then the
 * price - the Reaction, or (empowered) 1 Essence and the round's one use. A blow of nothing is
 * nothing to guard.
 *
 * @param {{amount?: number, servants?: Array<{feet: number|null, health: number}>, reactionLeft?: boolean,
 *   empowered?: boolean, essence?: number, roundUsed?: boolean, held?: boolean}} o
 * @returns {{ok: boolean, reason: string|null}}
 */
export function graveGuardJudgement({ amount = 0, servants = [], reactionLeft = true, empowered = false, essence = 0, roundUsed = false, held = true } = {}) {
  if (held !== true) return { ok: false, reason: "notHeld" };
  if (!(whole(amount) > 0)) return { ok: false, reason: "nothing" };
  const near = (servants ?? []).filter(s => typeof s?.feet === "number" && Number.isFinite(s.feet) && s.feet <= GRAVE_GUARD.feet + 1e-6 && (Number(s.health) || 0) > 0);
  if (!near.length) return { ok: false, reason: "noServant" };
  if (empowered) {
    if (whole(essence) < GRAVE_GUARD.essence) return { ok: false, reason: "noEssence" };
    if (roundUsed === true) return { ok: false, reason: "roundUsed" };
    return { ok: true, reason: null };
  }
  if (reactionLeft !== true) return { ok: false, reason: "noReaction" };
  return { ok: true, reason: null };
}

/**
 * **WHAT THE SERVANT TAKES AND WHAT COMES BACK** (*Damage beyond that creature's Health is dealt
 * to you*): the blow as the servant's Armor Points and Ward left it, the servant's Health
 * before it - and what passes that Health returns to the Necromancer. Temporary Health stands in
 * front of the servant's Health, as 05 says it stands in front of any.
 *
 * @param {{damage?: number, health?: number, temp?: number}} o
 * @returns {{servant: number, overflow: number}}
 */
export function graveGuardSplit({ damage = 0, health = 0, temp = 0 } = {}) {
  const d = whole(damage);
  const room = whole(health) + whole(temp);
  return { servant: Math.min(d, room), overflow: Math.max(0, d - room) };
}

/**
 * **THE BLOW, MET BY THE SERVANT** (*That creature's Armor Points and Ward apply to it*): the
 * blow's recorded resolver inputs (`rules/damage-record.mjs`, D-1004) with the Necromancer's own
 * Armor Points, Ward, armor by school, immunities and weaknesses replaced by the servant's. The
 * resolver itself is the caller's (`blow-records.mjs#resolveRecord`).
 *
 * @param {object|null} input  the record's `input`
 * @param {{apByLocation?: object, wardBySchool?: object, schoolArmorBySchool?: object, immune?: string[], vulnerable?: string[]}} servant
 * @returns {object|null}
 */
export function graveGuardInput(input, servant = {}) {
  if (!input || typeof input !== "object") return null;
  const school = input.school ?? null;
  const ap = servant.apByLocation ?? {};
  const wards = servant.wardBySchool ?? {};
  const armor = servant.schoolArmorBySchool ?? {};
  return {
    ...input,
    apByLocation: ap,
    ward: school ? whole(wards[school]) : 0,
    wardBySchool: wards,
    schoolArmor: school ? whole(armor[school]) : 0,
    schoolArmorBySchool: armor,
    immune: Array.isArray(servant.immune) ? servant.immune : [],
    vulnerable: Array.isArray(servant.vulnerable) ? servant.vulnerable : [],
    fireTakenBonus: 0
  };
}

/**
 * **DARK RITUAL'S MANA** (02 §7: *equal to its current Health, up to three times your tier*; 04's
 * Grim Sacrament: *Your Dark Ritual's cap rises by 2 Mana per rank* - the CAP rises, so a servant
 * with less Health than the cap gives its Health and nothing more; the 4b review's MUST-FIX 1),
 * and the Empowered line's Health equal to it.
 *
 * @param {{health?: number, tier?: number, grimSacrament?: number}} o
 * @returns {number}
 */
export function darkRitualMana({ health = 0, tier = 1, grimSacrament = 0 } = {}) {
  return Math.min(whole(health), darkRitualCap({ tier, grimSacrament }));
}

/** Dark Ritual's cap: three times your tier, risen by 2 Mana a rank of Grim Sacrament. */
export function darkRitualCap({ tier = 1, grimSacrament = 0 } = {}) {
  const t = Math.min(4, Math.max(1, int(tier) || 1));
  return DARK_RITUAL.perTier * t + DARK_RITUAL.grimSacramentPerRank * whole(grimSacrament);
}

/**
 * **DARK RITUAL, JUDGED**: a raised dead within 30 feet and standing, the encounter's use left,
 * and - empowered - 1 Essence.
 *
 * @param {{servant?: {feet: number|null, health: number}|null, usesLeft?: number, empowered?: boolean, essence?: number}} o
 * @returns {{ok: boolean, reason: string|null}}
 */
export function darkRitualJudgement({ servant = null, usesLeft = 1, empowered = false, essence = 0 } = {}) {
  if (!(whole(usesLeft) > 0)) return { ok: false, reason: "noUses" };
  if (!servant) return { ok: false, reason: "noServant" };
  if (!(typeof servant.feet === "number" && servant.feet <= DARK_RITUAL.feet + 1e-6)) return { ok: false, reason: "tooFar" };
  if (!((Number(servant.health) || 0) > 0)) return { ok: false, reason: "noServant" };
  if (empowered && whole(essence) < DARK_RITUAL.essence) return { ok: false, reason: "noEssence" };
  return { ok: true, reason: null };
}

/**
 * **UNENDING DEAD, JUDGED** (02 §7): one of your raised dead at 0 Health within 60 feet, never
 * stood again this way, and 1 Essence held.
 *
 * @param {{held?: boolean, stoodAgain?: boolean, feet?: number|null, essence?: number, health?: number}} o
 * @returns {{ok: boolean, reason: string|null}}
 */
export function unendingDeadJudgement({ held = false, stoodAgain = false, feet = null, essence = 0, health = 0 } = {}) {
  if (held !== true) return { ok: false, reason: "notHeld" };
  if (stoodAgain === true) return { ok: false, reason: "once" };
  if ((Number(health) || 0) > 0) return { ok: false, reason: "standing" };
  if (!(typeof feet === "number" && Number.isFinite(feet) && feet <= UNENDING_DEAD.feet + 1e-6)) return { ok: false, reason: "tooFar" };
  if (whole(essence) < UNENDING_DEAD.essence) return { ok: false, reason: "noEssence" };
  return { ok: true, reason: null };
}

/** *It stands again with half its Health*: half its maximum, rounded down, never below 1. */
export function standAgainHealth(max = 0) {
  return Math.max(1, Math.floor(whole(max) / 2));
}

/**
 * **ENSLAVE THE DEAD'S TARGET LINE** (07: *One undead creature that is not a Boss, of your tier
 * or lower*), judged before anything is paid. A lang key's tail, or null.
 *
 * **A CREATURE BOUND TO SOMEBODY ELSE IS A TARGET** (the lead's Q3 of the 4b review, 2026-11-19:
 * *"Yes"*): 07's target line names no bond, so none refuses. The enslave suspends nothing in the
 * other bond - its owner keeps the creature's ownership and its bond, and the Necromancer's owners
 * are added beside them for the hour (`enslaveGrant`).
 *
 * @param {{undead?: boolean, weightClass?: string|null, tier?: number, casterTier?: number}} o
 * @returns {"notUndead"|"boss"|"tier"|null}
 */
export function enslaveRefusal({ undead = false, weightClass = null, tier = 1, casterTier = 1 } = {}) {
  if (undead !== true) return "notUndead";
  if (String(weightClass ?? "").toLowerCase() === "boss") return "boss";
  if (int(tier) > int(casterTier)) return "tier";
  return null;
}

/** A document's ownership map as plain whole levels, `default` kept. */
function levels(map) {
  const out = {};
  for (const [key, n] of Object.entries(map ?? {})) {
    const v = Math.trunc(Number(n));
    if (/^[A-Za-z0-9_-]+$/.test(key) && Number.isInteger(v) && v >= -1 && v <= 3) out[key] = v;
  }
  return out;
}

/** 14.367's OWNER level. */
const OWNER_LEVEL = 3;

/**
 * **THE NECROMANCER'S PLAYER CONTROLS AN ENSLAVED UNDEAD** (the lead's Q3: *"Yes"*; the reading:
 * OWNER ownership for the duration, written on the GM's client and removed when it ends): what the
 * creature's ownership becomes, and the grant recorded so the end can take back exactly that -
 * every user the caster's owners name, at OWNER, beside whatever the creature already held. A user
 * already at OWNER is granted nothing (nothing to take back).
 *
 * @param {Record<string, number>} prior  the creature's ownership now
 * @param {string[]} owners  the user ids that own the Necromancer (no GM: a GM owns everything)
 * @returns {{ownership: Record<string, number>, granted: string[]}}
 */
export function enslaveGrant(prior = {}, owners = []) {
  const ownership = levels(prior);
  const granted = [];
  for (const id of [...new Set((owners ?? []).filter(u => typeof u === "string" && /^[A-Za-z0-9]+$/.test(u)))].sort()) {
    if ((ownership[id] ?? -1) >= OWNER_LEVEL) continue;
    granted.push(id);
    ownership[id] = OWNER_LEVEL;
  }
  return { ownership, granted };
}

/**
 * **THE OWNERSHIP AN ENDED ENSLAVE HANDS BACK**: each user the grant added goes back to what it
 * held before (or off the map, where it held nothing), but only where it still holds the OWNER the
 * grant gave - a GM's later edit wins. Every other key is left as it stands.
 *
 * @param {{current?: Record<string, number>, prior?: Record<string, number>, granted?: string[]}} o
 * @returns {Record<string, number>}  the whole map to write
 */
export function enslaveRestore({ current = {}, prior = {}, granted = [] } = {}) {
  const out = levels(current);
  const before = levels(prior);
  for (const id of granted ?? []) {
    if (out[id] !== OWNER_LEVEL) continue;
    if (Object.hasOwn(before, id)) out[id] = before[id];
    else delete out[id];
  }
  return out;
}

/**
 * **THE SOURCES THAT MAY STAND ONE OF YOUR RAISED DEAD AGAIN AT 0 HEALTH** (the 4b review's
 * SHOULD-FIX 11; the lead's Q1: *a raised creature at 0 Health leaves no corpse*): 02 §7's Unending
 * Dead, and **04's Restless Bones** (Phase 4c: *it stands again with half its Health at the start
 * of your next turn*), so the 0-Health door asks every source through `standAgainJudgement` before
 * anything collapses. Restless Bones is first: it asks nobody and costs nothing, so a skeleton it
 * stands is never offered Unending Dead's Essence for the same fall.
 */
export const STAND_AGAIN_SOURCES = Object.freeze(["restless-bones", "unending-dead"]);

/** The sources that stand a creature on their own, asking nobody (Restless Bones). */
export const STANDS_UNASKED = Object.freeze(["restless-bones"]);

/**
 * **ONE JUDGEMENT AT 0 HEALTH** (S11): whether any stand-again source may answer, and how long the
 * creature waits for it. In a fight it waits until the Necromancer's next turn starts
 * (`hordeTurnStart` collapses what still stands at 0); out of a fight it waits only until the
 * world's clock moves on, so an unanswered offer never leaves it up for ever. With no source open
 * it collapses at once.
 *
 * **A SOURCE THAT ASKS NOBODY STANDS IT** (Restless Bones): the answer then names it (`stands`)
 * and its `when` (`rules/necromancer-talents.mjs#restlessBonesJudgement`), and nothing is offered.
 *
 * @param {{sources?: Record<string, {ok?: boolean, when?: string|null}>, inFight?: boolean}} o
 * @returns {{collapse: boolean, offers: string[], waits: null|"turnStart"|"clock", stands?: string, when?: string|null}}
 */
export function standAgainJudgement({ sources = {}, inFight = false } = {}) {
  const stands = STANDS_UNASKED.find(k => sources?.[k]?.ok === true) ?? null;
  if (stands) return { collapse: false, offers: [], waits: null, stands, when: sources[stands].when ?? null };
  const offers = STAND_AGAIN_SOURCES.filter(k => !STANDS_UNASKED.includes(k) && sources?.[k]?.ok === true);
  if (!offers.length) return { collapse: true, offers: [], waits: null };
  return { collapse: false, offers, waits: inFight ? "turnStart" : "clock" };
}

/**
 * **STITCH ABOMINATION'S SPACE** (07: *rises under your control in an unoccupied space within
 * range*), judged where it is picked and again on the GM's client (the 4b review's S12): within
 * the reach of the caster's own squares (`half` the half-width of its footprint, D-732), and no
 * token standing on the point. A lang key's tail under `AZEROTH.Horde.Refuse`, or null.
 *
 * @param {{apart?: number|null, half?: number, feet?: number, occupied?: boolean}} o
 * @returns {"spaceRange"|"spaceOccupied"|null}
 */
export function stitchSpaceRefusal({ apart = null, half = 0, feet = 30, occupied = false } = {}) {
  const a = apart === null || apart === undefined ? NaN : Number(apart);
  if (!Number.isFinite(a) || a - (Number(half) || 0) > (Number(feet) || 0) + 1e-6) return "spaceRange";
  if (occupied === true) return "spaceOccupied";
  return null;
}

/**
 * **WHETHER A PLAGUE GHOUL MAY RISE FROM THIS CORPSE** (07's Plague of Undeath: *When a creature
 * that failed dies before the duration ends, it rises as a Plagued Ghoul under your control*; the
 * 4b review's MUST-FIX 3), asked again on the GM's client: the corpse token carries the rising mark
 * the death wrote for THIS caster (written only for a death inside the plague's duration), and no
 * raise has used it up. A lang key's tail, or null.
 *
 * @param {{mark?: {casterUuid?: string}|null, casterUuid?: string|null, corpse?: {state?: string}|null}} o
 * @returns {"risingGone"|"raised"|"destroyed"|"sealed"|"kept"|null}
 */
export function risingRefusal({ mark = null, casterUuid = null, corpse = null } = {}) {
  if (!mark || typeof mark !== "object" || !casterUuid || mark.casterUuid !== casterUuid) return "risingGone";
  if (corpse && ["raised", "destroyed", "sealed", "kept"].includes(corpse.state)) return corpse.state;
  return null;
}

/**
 * **A REFUSED PLAGUE RISING IS OFFERED AGAIN** (the fix runs' review, MUST-FIX 2): a press the GM's
 * client refused, or whose grafts' Essence could not be paid, leaves the card's one press spent; the
 * rising mark is put back to `offered: false`, so the caster's next turn start posts a fresh card.
 * True only where the mark is still this caster's, the corpse still open (`risingRefusal`) and the
 * mark is marked offered - a rising already raised, destroyed, kept, sealed or gone is never revived.
 *
 * @param {{mark?: object|null, casterUuid?: string|null, corpse?: {state?: string}|null}} o
 * @returns {boolean}
 */
export function risingReoffer({ mark = null, casterUuid = null, corpse = null } = {}) {
  return risingRefusal({ mark, casterUuid, corpse }) === null && mark.offered === true;
}

/**
 * **THE PHYLACTERY'S RETURN, JUDGED** (02 §7's Lichdom: *When you die while your phylactery
 * exists, you return to life 1 day later*): the lich holds the feature, the phylactery it bound
 * still exists, and no return is already counting.
 *
 * @param {{lich?: boolean, bound?: string|null, exists?: boolean, counting?: boolean}} o
 * @returns {{ok: boolean, reason: string|null}}
 */
export function phylacteryReturnJudgement({ lich = false, bound = null, exists = false, counting = false } = {}) {
  if (lich !== true) return { ok: false, reason: "notLich" };
  if (!bound) return { ok: false, reason: "none" };
  if (exists !== true) return { ok: false, reason: "destroyed" };
  if (counting === true) return { ok: false, reason: "counting" };
  return { ok: true, reason: null };
}

/**
 * Lichdom's Ward laid into a derived Ward map before 05's cap of 10 applies (`ward.mjs#wardCap`):
 * the map, changed in place, for `CharacterData#prepareDerivedData`.
 *
 * @param {Record<string, number>} ward
 * @returns {Record<string, number>}
 */
export function addLichWard(ward = {}) {
  for (const [school, n] of Object.entries(LICH_WARD)) ward[school] = (Number(ward[school]) || 0) + n;
  return ward;
}

/**
 * **THE CAST'S NEW-LEAD LINE** (02 §7: *When you cast a spell, you may name another of your raised
 * dead your lead, from that creature's next turn*): one unticked line on the cast dialog, greyed in
 * words where no other creature stands to name. `standing` the raised dead standing, `lead` whether
 * one leads now.
 *
 * @param {{standing?: number, lead?: boolean}} o
 * @returns {object[]}
 */
export function hordeLeadLines({ standing = 0, lead = false } = {}) {
  const n = whole(standing);
  if (n < 1) return [];
  const available = n > (lead ? 1 : 0);
  return [{
    id: "talent-line-horde-lead", identifier: "horde-lead", talentId: null, name: "AZEROTH.Horde.LeadLine", kind: "hordeLead",
    amount: 0, doesKey: "AZEROTH.Horde.LeadLineDoes", pool: null, left: 1, available, checked: false,
    reason: available ? null : "AZEROTH.Horde.LeadLineNone"
  }];
}
