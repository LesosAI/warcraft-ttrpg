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
// The Tinker's constructs (the Legacy branches' door 6): what the talents give them.
import { SHAPE_KINDS } from "./shapes.mjs";
import { constructCapacity, constructEligible, constructsFor } from "./constructs.mjs";
import { evaluateExpression } from "./expressions.mjs";
import { talentEffect } from "./talent-effects.mjs";

/**
 * The bound kinds (D-643). `construct` is the sixth (the Legacy branches' door 6):
 * 04's Tinker builds one through The Bench and holds it until it is released.
 * `thrall` is the seventh (04's Thrall of the Banshee; the lead, 2026-10-22: *"Have the
 * creature stat block for the token set to bound to the player by GM who can then
 * remove it"*): bound on the token's own actor while its Charmed stands, by the
 * thrall's door alone (`effects/legacy-uses.mjs#bindThrall`), never from the banner's
 * Bind to.
 */
export const BOUND_KINDS = Object.freeze(["companion", "demon", "elemental", "totem", "summon", "construct", "thrall"]);

/** The kinds the banner's Bind to offers a GM: every kind but a thrall's, which its Use binds. */
export const BINDABLE_KINDS = Object.freeze(BOUND_KINDS.filter(k => k !== "thrall"));

/** A feature's menu, to the kind it binds. */
export const KIND_OF_CHOICE = Object.freeze({
  beasts: "companion", demons: "demon", greaterDemons: "demon", elementals: "elemental", totems: "totem",
  // 04's The Bench: *You build constructs from the Constructs table below* (door 6).
  constructs: "construct"
});

/**
 * How long each kind stays (02 §7): held until released, or until the encounter
 * ends. A construct is HELD (*You hold one at a time*): one wrecked at 0 Health
 * stays held until The Bench rebuilds it.
 */
export const UNTIL = Object.freeze({ companion: null, demon: null, elemental: "encounter", totem: "encounter", summon: "encounter", construct: null, thrall: "charmed" });

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
export function capacity(kind, { level = 1, talents = [] } = {}, rowOf = talentEffect) {
  switch (kind) {
    case "companion": return 1 + (rankOf(talents, "second-beast") > 0 ? 1 : 0);
    case "demon": return 1 + (rankOf(talents, "master-summoner") >= 2 ? 1 : 0);
    case "elemental": return 1;
    // **AND 04's THE LOA GATHER** (*You may have one more totem standing than your
    // tier allows*): the `totems {more}` row kind, read by row (the Legacy branches'
    // B2; its row is B6's).
    case "totem": return tierForLevel(level) + moreTotemsFor(talents, rowOf);
    case "summon": return Infinity;
    // **THE TINKER'S** (door 6): The Bench's one, and Assembly Line's second, off the
    // `constructs` rows - never by name or identifier, so a talent the pack does not
    // hold yet is read the day its row lands.
    case "construct": return constructCapacity(constructsFor(talents, { tier: tierForLevel(level) }, rowOf));
    default: return 1;
  }
}

/**
 * **MORE TOTEMS STANDING THAN THE TIER ALLOWS** (04's The Loa Gather: *You may have
 * one more totem standing than your tier allows*): what the taken `totems` rows add,
 * summed.
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {number}
 */
export function moreTotemsFor(talents = [], rowOf = talentEffect) {
  let more = 0;
  for (const t of talents ?? []) {
    if (!((Number(t?.taken) || 0) > 0)) continue;
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.totems ?? null;
    const n = Math.trunc(Number(row?.more));
    if (n > 0) more += n;
  }
  return more;
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
 *
 * **OR A MINDLESS UNDEAD THAT IS NOT A BOSS, WITH 04's GRAVE BOND** (the Legacy
 * branches' door 26: *Your Companion class feature may bond a Mindless Undead that
 * is not a Boss ... In place of the Handling Test, it makes a Spirit Resilience Test
 * against your Spell DC, and on a failure it is bound to you*; the lead: *"The undead
 * resists your Spell DC"*, *"No cap"*). Such an entry needs no Handling DC, and the
 * answer says the bond is made by the undead's own Test (`test: "spirit"`) - the
 * door posts it and binds on a failure. `graveBond` is the caller's reading of the
 * talent (`graveBondFor`); *Mindless* is the block's type marker (`typeMarker`,
 * 14's identity run).
 *
 * **A CONSTRUCT** (door 6) is one of 04's Constructs table at the character's tier
 * or below, which `rules/constructs.mjs#constructEligible` answers; the tier gate
 * below holds it too.
 */
export function eligible(kind, entry = {}, { talents = [], tier = null, graveBond = false } = {}) {
  // The construct's own law (the B2 review: this comment named it and nothing called
  // it): one of 04's table, at the tinker's tier or below.
  if (kind === "construct") {
    const fit = constructEligible(entry, { tier: tier ?? 1 });
    return fit.ok ? { ok: true, reason: null } : { ok: false, reason: fit.reason === "tier" ? "Tier" : "NotConstruct" };
  }
  if (kind === "companion") {
    const type = entry.creatureType ?? null;
    const dragon = type === "dragonkin" && rankOf(talents, "master-of-wilds") > 0;
    if (type === "undead" && graveBond === true) {
      if (String(entry.typeMarker ?? "").toLowerCase() !== "mindless") return { ok: false, reason: "NotMindless" };
      if (entry.weightClass === "boss") return { ok: false, reason: "Boss" };
      // **NO CAP** (the lead): Grave Bond names no tier, so an undead of any tier
      // may be bonded - the tier gate below is the Handling Test's, not this one's.
      return { ok: true, reason: null, test: "spirit" };
    }
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
 * **THE TINKER'S CONSTRUCTS** (the Legacy branches' door 6) take one row per
 * `constructs` talent that gives them a number - Reinforced Plating's Health and
 * Armor Point, Engineering Upgrade's damage - keyed by the talent, and the Gnomish
 * Battle Rig's tier while the owner wears it (`owner.shapeKind`; *While you wear it,
 * your constructs add your tier to their damage*).
 *
 * **A BOUND ATTACK PATCH** (door 20: 04's Serpent Ward, *Your Searing totem spits
 * venom. Its attack deals Nature damage rather than Fire*): a `boundAttack` row
 * naming the kind and the creature (`match`, a word of its name) overrides the
 * creature's attack school and, where it names one, the form its strike is drawn as
 * - two derived scalars `NpcData` seeds empty (`system.attackSchool`,
 * `system.attackForm`), in the `final` phase. What the hit lays is read at the
 * attack door off the same row (`boundAttacksFor`).
 *
 * @returns {Array<{talent: string, label: string, encounter: boolean, changes: object[]}>}
 */
export function boundEffects(kind, owner = {}, talents = [], creature = {}, encounter = {}, rowOf = talentEffect) {
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

  if (kind === "construct") {
    // One row a talent, its numbers at its rank (`rules/constructs.mjs` reads the
    // same rows for the capacity and the shared turn).
    for (const t of [...(talents ?? [])].sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
      if (!((Number(t?.taken) || 0) > 0)) continue;
      const given = constructsFor([t], { tier }, rowOf);
      if (!given.by.length) continue;
      const changes = [];
      if (given.health) changes.push(add("system.health.max", given.health));
      if (given.ap) for (const l of present) changes.push(add(`system.ap.${l}`, given.ap));
      if (given.damage) changes.push(add("system.damageBonus", given.damage));
      if (changes.length) out.push({ talent: t.identifier, label: "AZEROTH.Bound.Effect.ConstructTalent", name: t.name ?? "", encounter: false, changes });
    }
    // The Gnomish Battle Rig worn: *your constructs add your tier to their damage*.
    const rig = SHAPE_KINDS.battlerig;
    if (owner.shapeKind === "battlerig" && rig?.boundDamage) {
      const n = Math.max(0, Math.trunc(Number(evaluateExpression(String(rig.boundDamage), { tier }))) || 0);
      if (n) push("battle-rig", "AZEROTH.Bound.Effect.BattleRig", [add("system.damageBonus", n)]);
    }
  }

  // **A BOUND ATTACK PATCH** (door 20): the school, and the strike's form where named.
  for (const row of boundAttacksFor(talents, { kind, name: creature.name ?? "" }, rowOf)) {
    const changes = [];
    if (row.school) changes.push({ key: "system.attackSchool", type: "override", value: row.school, phase: "final" });
    if (row.form) changes.push({ key: "system.attackForm", type: "override", value: row.form, phase: "final" });
    if (changes.length) out.push({ talent: row.identifier, label: "AZEROTH.Bound.Effect.AttackPatch", name: row.name, encounter: false, changes });
  }

  return out;
}

/** The bound attack patch's change vocabulary: the schools an attack may be made of. */
const ATTACK_PATCH_SCHOOLS = Object.freeze(["fire", "frost", "arcane", "holy", "shadow", "nature", "fel"]);

/**
 * **WHAT THE OWNER'S TALENTS DO TO A BOUND CREATURE'S ATTACK** (door 20: 04's Serpent
 * Ward): every taken `boundAttack` row naming this kind and a word of this creature's
 * name (`match`), at its rank - the school its attack deals, the strike form it is
 * drawn as, and what its hit lays (`lays`: `{condition, value, until, shed,
 * minRank}`, *a creature it hits is **Poisoned** 1, and the DC to shed it is your
 * Spell DC. At rank 2 that creature is also **Slowed** until the end of its next
 * turn*). Sorted by identifier.
 *
 * @param {Array} talents  the OWNER's
 * @param {{kind: string, name?: string}} o  the creature's bound kind and its name
 * @param {Function} [rowOf]
 * @returns {Array<{identifier: string, name: string, school: string|null, form: string|null,
 *   lays: Array<{condition: string, value: number|null, until: string|null, shed: string|null}>}>}
 */
export function boundAttacksFor(talents = [], { kind = null, name = "" } = {}, rowOf = talentEffect) {
  const out = [];
  for (const t of talents ?? []) {
    const rank = Math.trunc(Number(t?.taken)) || 0;
    if (!(rank > 0)) continue;
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.boundAttack ?? null;
    if (!row || typeof row !== "object" || row.kind !== kind) continue;
    if (row.match && !String(name ?? "").toLowerCase().includes(String(row.match).toLowerCase())) continue;
    const lays = (Array.isArray(row.lays) ? row.lays : [])
      .filter(l => l && typeof l.condition === "string" && /^[a-z]+$/.test(l.condition) && rank >= (Math.trunc(Number(l.minRank)) || 1))
      .map(l => ({
        condition: l.condition,
        value: Number.isInteger(l.value) && l.value > 0 ? l.value : null,
        until: typeof l.until === "string" && l.until ? l.until : null,
        shed: l.shed === "spellDc" ? "spellDc" : null
      }));
    out.push({
      identifier: String(t.identifier), name: String(t.name ?? ""),
      school: ATTACK_PATCH_SCHOOLS.includes(row.school) ? row.school : null,
      form: typeof row.form === "string" && /^[a-z][a-zA-Z0-9-]*$/.test(row.form) ? row.form : null,
      lays
    });
  }
  return out.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * **04's GRAVE BOND, READ BY ROW** (door 26): whether the Companion may bond a
 * Mindless Undead, and the Test that binds it - `graveBond {resist}` - or null.
 *
 * @param {Array} talents
 * @param {Function} [rowOf]
 * @returns {{name: string, resist: string}|null}
 */
export function graveBondFor(talents = [], rowOf = talentEffect) {
  for (const t of [...(talents ?? [])].sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    if (!((Number(t?.taken) || 0) > 0)) continue;
    const row = rowOf(t.className, t.identifier, t.race ?? null)?.graveBond ?? null;
    if (!row || typeof row !== "object") continue;
    return { name: String(t.name ?? ""), resist: ["body", "reflex", "spirit"].includes(row.resist) ? row.resist : "spirit" };
  }
  return null;
}

/**
 * **THE CREATURES THAT RESISTED A GRAVE BOND, ON THE BONDER** (02's Companion: *On a
 * failure that beast will not be tried again*; the B2 review): 04's Grave Bond's Test
 * stands in place of the Handling Test, so a creature that RESISTS it is a failure of
 * the bond, and it was tried again for nothing until it bound. The flag holds the uuid
 * the pick named - a world creature's own, or 14's entry where the pick was the entry
 * (MY READING, for the lead: an entry names no one creature, so the entry is greyed) -
 * and the Companion's menu greys each in words.
 */
export const GRAVE_BOND_RESISTED_FLAG = "graveBondResisted";

/**
 * The resisted list as it stands, cleaned: uuids, sorted, once each.
 *
 * @param {unknown} raw  the bonder's flag
 * @returns {string[]}
 */
export function resistedBonds(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).filter(u => typeof u === "string" && u))].sort();
}

/**
 * The resisted list once another creature has resisted.
 *
 * @param {unknown} raw
 * @param {string|null} uuid
 * @returns {string[]}
 */
export function withResistedBond(raw, uuid) {
  return resistedBonds([...resistedBonds(raw), ...(typeof uuid === "string" && uuid ? [uuid] : [])]);
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
