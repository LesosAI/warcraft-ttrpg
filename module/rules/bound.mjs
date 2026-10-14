/**
 * Bound creatures (02 §7, 04, D2 §7; D-643). Pure: no Foundry.
 *
 * Every creature a character puts under their control is one kind of five:
 * the Ranger's companion, the Warlock's demon, the Shaman's elemental, the
 * Shaman's totem, and a summon a talent calls. D2 §7 already treats them
 * as one class - they act on their owner's Initiative and roll no slot of
 * their own - and this file says what the system can do with each: how many
 * a character holds, how long one stays, which entries may be bound, and
 * the Active Effects the owner's talents lay on the creature.
 */

import { bandFor } from "./bestiary.mjs";
import { tierForLevel } from "./progression.mjs";

export const BOUND_KINDS = Object.freeze(["companion", "demon", "elemental", "totem", "summon"]);

/** A feature's menu, to the kind it binds. */
export const KIND_OF_CHOICE = Object.freeze({
  beasts: "companion", demons: "demon", greaterDemons: "demon", elementals: "elemental", totems: "totem"
});

/** How long each kind stays (02 §7): held until released, or until the encounter ends. */
export const UNTIL = Object.freeze({ companion: null, demon: null, elemental: "encounter", totem: "encounter", summon: "encounter" });

/** Metamorphosis, Avatar and Shapeshift are the character's own body, never a creature. */
const SHAPES = new Set(["Metamorphosis", "Avatar of the Wild", "Shapeshift"]);

/**
 * What a feature's pick binds, or null where the pick is a shape or no
 * creature at all. Ritual of Summoning's three count against nothing.
 */
export function bindingFor({ name = "", choice = null } = {}) {
  if (SHAPES.has(name)) return null;
  const kind = KIND_OF_CHOICE[choice] ?? null;
  if (!kind) return null;
  return { kind, until: UNTIL[kind], uncounted: name === "Ritual of Summoning" };
}

const rankOf = (talents, identifier) => {
  const t = (talents ?? []).find(x => x.identifier === identifier);
  return t && (Number(t.taken) || 0) > 0 ? Number(t.taken) : 0;
};

/**
 * How many of a kind a character may hold at once: one, and a second with
 * Second Beast (04) or Master Summoner at rank 2; **as many totems as the
 * character's tier** (02 §7, D-709 — the lead's call, replacing one totem
 * with four from Totem Mastery at level 11); summons without limit.
 *
 * The tier is 02 §6's own ladder through `tierForLevel`, never a level
 * threshold written again here.
 */
export function capacity(kind, { level = 1, talents = [] } = {}) {
  switch (kind) {
    case "companion": return 1 + (rankOf(talents, "second-beast") > 0 ? 1 : 0);
    case "demon": return 1 + (rankOf(talents, "master-summoner") >= 2 ? 1 : 0);
    case "elemental": return 1;
    case "totem": return tierForLevel(level);
    case "summon": return Infinity;
    default: return 1;
  }
}

/**
 * **WHETHER A SUMMON CAN BE MADE, JUDGED BEFORE ANYTHING IS PAID** (D-768).
 * `useFeature` paid the action and the Mana and then looked the entries up,
 * WARNING and skipping one 14 does not print: Feral Spirit spent 6 Mana on two
 * spirit wolves the bestiary has never held. The two refusals that can be known
 * in advance are asked here - every entry named in the pack, and room for one
 * creature each under the kind's capacity - and the door refuses in words with
 * nothing spent. The GM-side bind still refuses on its own (D-643); this only
 * moves what can be known to before the payment.
 *
 * @param {{names: string[], known: Iterable<string>, room?: number, held?: number}} o
 *   `known` is the bestiary's entry names; `room` the kind's `capacity`, `held`
 *   its `boundCount` (a summon holds no limit today, D-709's table).
 * @returns {null|{reason: "NoEntry", names: string[]}|{reason: "Full", room: number}}
 */
export function summonRefusal({ names = [], known = [], room = Infinity, held = 0 } = {}) {
  const have = new Set(known);
  const missing = [...new Set(names)].filter(n => !have.has(n));
  if (missing.length) return { reason: "NoEntry", names: missing };
  if ((Number(held) || 0) + names.length > room) return { reason: "Full", room };
  return null;
}

/**
 * Whether an entry may be bound as a kind. A companion is a Beast, or a
 * Dragonkin with Master of Wilds, and needs a Handling DC on its entry
 * (02 §7; an entry with none is O-33's, the book's to give).
 */
export function eligible(kind, entry = {}, { talents = [], tier = null } = {}) {
  if (kind === "companion") {
    const type = entry.creatureType ?? null;
    const dragon = type === "dragonkin" && rankOf(talents, "master-of-wilds") > 0;
    if (type !== "beast" && !dragon) return { ok: false, reason: "NotBeast" };
    if (entry.handlingDC === null || entry.handlingDC === undefined) return { ok: false, reason: "NoHandling" };
  }
  // A creature above the character's tier waits on the level (D-650): the
  // chapter's own band, the lead's ruling to gate the list by level.
  if (tier !== null && tier !== undefined && (entry.tier ?? 1) > tier) return { ok: false, reason: "Tier" };
  return { ok: true, reason: null };
}

const add = (key, value) => ({ key, type: "add", value });
const override = (key, value) => ({ key, type: "override", value });

/**
 * 04's Demonic Aegis at rank 2 (*Ward 1 against Fel or against Shadow, chosen when
 * you summon it*; D-775): the rank, the Ward and the two schools, held to 04's
 * cell and to the talent's own patch (`class-talents.mjs#aegisWardFor`) by
 * `warlock-talents.test.mjs`.
 */
export const AEGIS_WARD = Object.freeze({ rank: 2, ward: 1, schools: Object.freeze(["fel", "shadow"]) });
const locations = ["body", "head", "limb"];

/**
 * The effects the owner's talents lay on a bound creature, one per talent,
 * as v14 changes on the creature's stored numbers. `owner` is a snapshot:
 * the Health maximum, the tier, whether Wild Bond is held, whether the
 * Warlock stands in Metamorphosis. `encounter` names the buffs switched on
 * for this fight, by talent identifier, with the rank paid.
 *
 * @returns {Array<{talent: string, label: string, encounter: boolean, changes: object[]}>}
 */
export function boundEffects(kind, owner = {}, talents = [], creature = {}, encounter = {}) {
  const out = [];
  const third = Math.floor((Number(owner.healthMax) || 0) / 3);
  const tier = Number(owner.tier) || 1;
  const ap = creature.ap ?? {};
  const present = locations.filter(l => ap[l] !== null && ap[l] !== undefined);
  const push = (talent, label, changes, isEncounter = false) => {
    if (changes.length) out.push({ talent, label, encounter: isEncounter, changes });
  };

  if (kind === "companion") {
    const bonded = rankOf(talents, "bonded");
    if (bonded) push("bonded", "AZEROTH.Bound.Effect.Bonded", [add("system.health.max", third * bonded)]);
    const hardy = rankOf(talents, "hardy-companion");
    if (hardy) push("hardy-companion", "AZEROTH.Bound.Effect.HardyCompanion", present.map(l => add(`system.ap.${l}`, hardy)));
    const wrath = Number(encounter?.["bestial-wrath"]) || 0;
    if (wrath) push("bestial-wrath", "AZEROTH.Bound.Effect.BestialWrath", [add("system.damageBonus", 2 * wrath)], true);
    if (owner.wildBond) push("wild-bond", "AZEROTH.Bound.Effect.WildBond", [add("system.damageBonus", 5), override("system.sunders", true)]);
    if (rankOf(talents, "master-of-wilds") && creature.weightClass && creature.tier) {
      // "The stat block one tier above its own": 14 prints no beast at two
      // tiers, so the band's own deltas stand in (D-643).
      const now = bandFor({ weightClass: creature.weightClass, tier: creature.tier });
      const up = bandFor({ weightClass: creature.weightClass, tier: creature.tier + 1 });
      if (up.tier !== now.tier) {
        push("master-of-wilds", "AZEROTH.Bound.Effect.MasterOfWilds", [
          add("system.health.max", up.health - now.health),
          add("system.defense", up.defense - now.defense),
          add("system.damageBonus", up.damage - now.damage)
        ]);
      }
    }
  }

  if (kind === "demon") {
    const embrace = rankOf(talents, "demonic-embrace");
    if (embrace) push("demonic-embrace", "AZEROTH.Bound.Effect.DemonicEmbrace", [add("system.health.max", third * embrace)]);
    const aegis = rankOf(talents, "demonic-aegis");
    // **AND AT RANK 2, WARD 1 AGAINST THE SCHOOL CHOSEN** (04: *At rank 2 it gains
    // Ward 1 against Fel or against Shadow, chosen when you summon it*; D-775): the
    // bond's own `school`, written at the summoning. In the `final` phase, where
    // `NpcData` seeds a school the block does not print at 0 (D-755) - an `add` on
    // a school the stored map lacks is refused as NaN in the `initial` one.
    const aegisSchool = aegis >= AEGIS_WARD.rank && AEGIS_WARD.schools.includes(creature.school) ? creature.school : null;
    if (aegis) {
      push("demonic-aegis", "AZEROTH.Bound.Effect.DemonicAegis", [
        ...present.map(l => add(`system.ap.${l}`, aegis)),
        ...(aegisSchool ? [{ key: `system.ward.${aegisSchool}`, type: "add", value: AEGIS_WARD.ward, phase: "final" }] : [])
      ]);
    }
    const empowered = Number(encounter?.["demonic-empowerment"]) || 0;
    if (empowered) push("demonic-empowerment", "AZEROTH.Bound.Effect.DemonicEmpowerment", [add("system.damageBonus", 2 * empowered)], true);
    if (rankOf(talents, "demonic-ascendance") && owner.inMetamorphosis) {
      push("demonic-ascendance", "AZEROTH.Bound.Effect.DemonicAscendance", [add("system.damageBonus", tier)]);
    }
  }

  if (kind === "totem") {
    const flame = rankOf(talents, "call-of-flame");
    if (flame && /searing/i.test(creature.name ?? "")) push("call-of-flame", "AZEROTH.Bound.Effect.CallOfFlame", [add("system.damageBonus", flame)]);
  }

  return out;
}

/**
 * **WHAT THE OWNER'S EQUIPPED SIGNATURES LAY ON A BOUND CREATURE** (D-698).
 *
 * Four Ahn'Qiraj set bonuses are *increases your pet's damage*, and D-643's
 * bond is what a pet is here. They are rows in `boundEffects`' own shape, so
 * `syncBoundFor` diffs them beside the talents with no second path — the key
 * is the ITEM rather than a talent identifier, which is what keeps the two
 * apart in the diff.
 *
 * A creature of any kind takes them: the sentence says *every creature you
 * have bound*, where a talent's row names the companion, the demon or the
 * totem.
 *
 * @param {Array<{key: string, name: string, damage: number}>} sources
 *   `signatureEffects().bound`
 * @returns {Array<{talent: string, label: string, name: string, encounter: boolean, changes: object[]}>}
 */
export function boundSignatureEffects(sources = []) {
  const out = [];
  for (const source of sources) {
    const damage = Math.trunc(Number(source?.damage) || 0);
    if (!source?.key || damage <= 0) continue;
    out.push({
      talent: `signature:${source.key}`,
      label: "AZEROTH.Bound.Effect.Signature",
      name: source.name ?? "",
      encounter: false,
      changes: [add("system.damageBonus", damage)]
    });
  }
  return out;
}

/** Health after its maximum moved: full stays full, else clamped. */
export function healthAfterMaxChange(value, oldMax, newMax) {
  const v = Number(value) || 0;
  const was = Number(oldMax) || 0;
  const now = Math.max(0, Number(newMax) || 0);
  if (v >= was) return now;
  return Math.min(v, now);
}

/**
 * The six totems 14 prints no block for (02 §7, D-526): 1 Health, 0 Armor
 * Points, no Defense, standing where they were planted. Nothing invented:
 * the numbers are the feature's own.
 */
export function totemBlock({ name = "", description = "", tier = 1 } = {}) {
  return {
    weightClass: "chaff",
    tier: Math.max(1, Math.min(4, Math.trunc(Number(tier)) || 1)),
    creatureType: "elemental",
    size: "small",
    health: { value: 1, max: 1 },
    defense: 0,
    ap: { body: 0, head: null, limb: null },
    speed: 0,
    initiative: 0,
    threatShare: 0,
    attacks: [],
    creatureAbilities: [{ name, description }],
    behavior: ""
  };
}
