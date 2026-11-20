/**
 * **THE DEATH KNIGHT'S DOORS, AS LAW** (02 §7's class entry; the plan
 * *i-want-to-work-vast-candy*, Phase 4 doors 1 to 8; run F2). Pure: no Foundry imports
 * (CLAUDE.md §3). `rules/runes.mjs` is the rune law (slots, the one spend); this module
 * holds what the features add on top of it, each number once:
 *
 * - **Inscribed Runeweapon** - when an inscription may be made (`inscriptionRefusal`'s
 *   window, D-950) and the ratios the one chooser offers;
 * - **Death Strike** - a rider on the attack's own dialog (D-770's door), its heal off the
 *   damage ledger (`rules/recent-damage.mjs`, D-867's *since the start of your last turn*);
 * - **Death Grip** - the pull's reach and its size rule (`forced-movement.mjs`);
 * - **Runic Discipline** - every maneuver at 1 Runic Power from level 5;
 * - **Plague** - two riders paid on a hit, each laying a typed tick carrier;
 * - **Desecration** - a placed area: its ground, its start-of-turn Spirit Test and the Ward
 *   against Shadow a failure takes (the lead's D-938).
 *
 * The book's own words are quoted where each is built.
 */

import { emptyAreaTick, emptyCheck } from "./area-ticks.mjs";
import { emptyAreaGround } from "./area-ground.mjs";
import { featureTick, layTick } from "./ticks.mjs";

/** 02 §7's class name, as the class item and a talent's `className` carry it. */
export const DK_CLASS_NAME = "Death Knight";

/** A taken talent's rank by IDENTIFIER (the inline census reads `rankOf`; D-768). */
const rankOf = (talents, identifier) => Math.max(0, Math.trunc(Number((talents ?? []).find(t => t?.identifier === identifier)?.taken)) || 0);

/* ------------------------------------------------------------------ */
/*  Inscribed Runeweapon (door 1)                                       */
/* ------------------------------------------------------------------ */

/**
 * The actor flag that opens the inscription window: `{open, gen}`, written by the Long
 * Rest door with the rest's generation, closed by the first rune spent afterwards.
 */
export const INSCRIBE_FLAG = "inscription";

/** 02 §7's feature name: *Inscribed Runeweapon*. */
export const INSCRIBED_RUNEWEAPON = "Inscribed Runeweapon";

/**
 * **WHEN AN INSCRIPTION MAY BE MADE** (02 §7: *When you finish a Long Rest, inscribe a Blood
 * rune or a Frost rune in each rune slot of the weapons you wield, in any ratio*; D-950, the
 * implementer's reading of *the Long Rest window*, for the lead):
 *
 * - **never in a started fight** - `fight`;
 * - **at once where no weapon the character owns carries an inscription** - a new Death
 *   Knight, made by the creator, inscribes before its first fight rather than waiting a day;
 * - **otherwise from the end of a Long Rest until the first rune is spent** - the Long Rest
 *   door opens it (`{open: true, gen}`) and the one rune door closes it in the same write as
 *   the spend; anything else is `window`. **The first spend is the only thing that closes
 *   it** (the F2 review's should-fix 3): a Short Rest between moves no generation the
 *   window is read against, so it closes nothing. `gen` is kept on the flag as the record
 *   of which rest opened it, and is not judged.
 *
 * @param {{flag?: {open?: boolean, gen?: number}|null, inFight?: boolean, inscribedAny?: boolean}} o
 * @returns {"fight"|"window"|null}
 */
export function inscriptionWindowRefusal({ flag = null, inFight = false, inscribedAny = false } = {}) {
  if (inFight) return "fight";
  if (!inscribedAny) return null;
  if (flag?.open === true) return null;
  return "window";
}

/** The flag a Long Rest writes: the window open at this rest's generation. */
export function inscriptionOpened(restGeneration = 0) {
  return { open: true, gen: Math.trunc(Number(restGeneration)) || 0 };
}

/**
 * The ratios the one chooser offers for a weapon of `slots` rune slots: every split of
 * Blood and Frost that fills them, Blood first (*in any ratio*).
 *
 * @param {number} slots
 * @returns {Array<{blood: number, frost: number}>}
 */
export function ratioOptions(slots = 0) {
  const n = Math.max(0, Math.trunc(Number(slots)) || 0);
  return Array.from({ length: n + 1 }, (_, i) => ({ blood: n - i, frost: i }));
}

/**
 * **A CLASS FEATURE THAT GIVES A SPELL** (02 §7's Unholy Lore: *You know Death Coil. It does not
 * count against your spells known. You pay its cost in Runic Power*; O-343): the feature and the
 * spell it embeds, read by the feature sync beside a talent's `spell` row (D-642's embed,
 * flagged with the feature and withdrawn with it). The Runic Power is D-944's 1 for 1.
 */
export const FEATURE_SPELLS = Object.freeze({
  "Unholy Lore": Object.freeze({ className: DK_CLASS_NAME, spell: "Death Coil" }),
  // 02 §7's Grave Calling (the Necromancer plan's door 5): *You know Raise Dead and Animate Corpse.
  // They do not count against your spells known* - two spells, one row each.
  "Grave Calling": Object.freeze({ className: "Necromancer", spells: Object.freeze(["Raise Dead", "Animate Corpse"]) })
});

/**
 * The spells the held features give, one row a feature, sorted by feature id.
 *
 * @param {Array<{id: string, name: string, className?: string}>} features
 * @returns {Array<{featureId: string, spell: string}>}
 */
export function featureSpellGrants(features = []) {
  return (features ?? [])
    .filter(f => FEATURE_SPELLS[f?.name] && (!f.className || f.className === FEATURE_SPELLS[f.name].className))
    .flatMap(f => (FEATURE_SPELLS[f.name].spells ?? [FEATURE_SPELLS[f.name].spell]).map(spell => ({ featureId: String(f.id), spell })))
    .sort((a, b) => a.featureId.localeCompare(b.featureId) || a.spell.localeCompare(b.spell));
}

/* ------------------------------------------------------------------ */
/*  Death Strike and Plague: riders on the attack (doors 4 and 7)       */
/* ------------------------------------------------------------------ */

/** 02 §7: *up to 4 plus twice your tier*. */
export const DEATH_STRIKE = Object.freeze({ feature: "Death Strike", identifier: "death-strike", cap: "4+2*tier" });

/**
 * 02 §7's Plague: *When your attack hits, you may spend any type of rune. If you do, the
 * target gains your Frost Fever or your Blood Plague for 1 minute. A creature with your Frost
 * Fever takes Frost damage equal to your tier at the start of each of its turns, and it is
 * Slowed while the disease lasts. A creature with your Blood Plague takes Shadow damage equal
 * to your tier at the start of each of its turns, and the healing it receives is halved,
 * rounded down, while the disease lasts.*
 */
export const PLAGUE = Object.freeze({
  feature: "Plague",
  rounds: 10,
  kinds: Object.freeze({
    frostFever: Object.freeze({ identifier: "plague-frost-fever", type: "frost", statuses: Object.freeze(["slowed"]), halvesHealing: false }),
    bloodPlague: Object.freeze({ identifier: "plague-blood-plague", type: "shadow", statuses: Object.freeze([]), halvesHealing: true })
  })
});

/**
 * **THE CLASS FEATURES THAT RIDE AN ATTACK** (D-770's rider door, read by
 * `AzerothActor#riderLines` beside the talents' rows): a rune price, paid through the one
 * rune door (`documents/runes.mjs#settleRuneRiders`, never `updatePool`), and what a hit
 * does. Keyed by the line's identifier; `feature` is the feature that must be held.
 */
export const FEATURE_RIDERS = Object.freeze({
  [DEATH_STRIKE.identifier]: Object.freeze({
    feature: DEATH_STRIKE.feature,
    rider: Object.freeze({ cost: Object.freeze({ pool: "runes", amount: 1, kind: "any" }), onHit: Object.freeze({ recentHeal: DEATH_STRIKE.cap }) })
  }),
  [PLAGUE.kinds.frostFever.identifier]: Object.freeze({
    feature: PLAGUE.feature, label: "AZEROTH.DeathKnight.Plague.FrostFever",
    rider: Object.freeze({ cost: Object.freeze({ pool: "runes", amount: 1, kind: "any" }), pays: "hit", exclusive: "plague", onHit: Object.freeze({ plague: "frostFever" }) })
  }),
  [PLAGUE.kinds.bloodPlague.identifier]: Object.freeze({
    feature: PLAGUE.feature, label: "AZEROTH.DeathKnight.Plague.BloodPlague",
    rider: Object.freeze({ cost: Object.freeze({ pool: "runes", amount: 1, kind: "any" }), pays: "hit", exclusive: "plague", onHit: Object.freeze({ plague: "bloodPlague" }) })
  })
});

/**
 * The rider rows a character's held features carry, as the rider door reads a talent: a
 * row `{className, identifier, name, taken: 1}` for each, and the lookup that hands back its
 * rider. Sorted by identifier, so the lines never swap between renders.
 *
 * @param {string[]} featureNames  the names of the feature items the character holds
 * @param {(key: string) => string} [label]  localises a line's own name (Plague's two)
 * @returns {{talents: Array<object>, rowOf: (className: string, identifier: string) => object|null}}
 */
export function featureRiders(featureNames = [], label = k => k) {
  const held = new Set(featureNames ?? []);
  const talents = Object.entries(FEATURE_RIDERS)
    .filter(([, row]) => held.has(row.feature))
    .map(([identifier, row]) => ({ className: DK_CLASS_NAME, identifier, name: row.label ? label(row.label) : row.feature, taken: 1 }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
  return { talents, rowOf: (className, identifier) => (FEATURE_RIDERS[identifier] ? { rider: FEATURE_RIDERS[identifier].rider } : null) };
}

/** Death Strike's heal: the damage taken since, no more than the cap at this tier. */
export function deathStrikeHeal({ taken = 0, tier = 1 } = {}) {
  const cap = 4 + 2 * Math.max(1, Math.trunc(Number(tier)) || 1);
  return Math.max(0, Math.min(cap, Math.trunc(Number(taken)) || 0));
}

/**
 * **WHAT THE GM'S PLAGUE HANDLER CAN JUDGE AGAIN** (the final review's finding 4, D-997): the asker
 * names a victim, a kind and the knight. No record of the hit exists when it asks - the attack's
 * Plague is laid before its card is posted, and Pestilence and a Blood Plague's spread lay it
 * "as if your Plague had laid it" off other cards - so what is judged is what the WORLD holds: the
 * kind is one 02 §7 prints, and the knight holds Plague. The hit and the rune stay the asker's word
 * (O-386, the trust model of O-379 and the F4a review's N6).
 *
 * @param {{kind?: string|null, featureNames?: string[]}} o
 * @returns {"kind"|"notHeld"|null}
 */
export function plagueAskRefusal({ kind = null, featureNames = [] } = {}) {
  if (!kind || !Object.hasOwn(PLAGUE.kinds, kind)) return "kind";
  if (!(featureNames ?? []).includes(PLAGUE.feature)) return "notHeld";
  return null;
}

/**
 * **THE TICK A PLAGUE LAYS**, in the shape `rules/ticks.mjs#layTick` stores: Frost or
 * Shadow damage equal to the knight's tier at the start of each of the target's turns, for
 * ten rounds (*1 minute*), laid by a feature, its kind named (`plague`) so the carrier's
 * Slowed and its halved healing can be read off it. Null for a kind 02 does not print.
 *
 * @param {"frostFever"|"bloodPlague"} kind
 * @param {{tier?: number, source?: string|null, name?: string}} o
 */
export function plagueTick(kind, { tier = 1, source = null, name = "", add = 0 } = {}) {
  const row = PLAGUE.kinds[kind];
  if (!row) return null;
  const stored = featureTick({ kind: "damage", type: row.type, amount: "tier", rounds: PLAGUE.rounds });
  // `add`: what a talent adds to the tick (04's Black Ice on a Frost Fever; run F4a).
  const laid = layTick(stored, { source, name, tier, add, via: "feature" });
  return laid ? { ...laid, plague: kind } : null;
}

/**
 * What the carrier holds besides its tick: Frost Fever's **Slowed** while the disease lasts,
 * as a status AND the condition's own change (`effects/conditions.mjs`' Slowed halves Speed in
 * the `final` phase), so the carrier is the condition for as long as it stands.
 *
 * @param {"frostFever"|"bloodPlague"} kind
 * @returns {{statuses: string[], changes: object[]}}
 */
export function plagueCarrier(kind) {
  const row = PLAGUE.kinds[kind];
  if (!row) return { statuses: [], changes: [] };
  return {
    statuses: [...row.statuses],
    changes: row.statuses.includes("slowed") ? [{ key: "system.speed", type: "multiply", value: 0.5, phase: "final" }] : []
  };
}

/**
 * **BLOOD PLAGUE HALVES THE HEALING ITS CARRIER RECEIVES** (02 §7), read where every healing
 * door reads `healingHalved` (`CharacterData`, `NpcData`): an active effect carrying a Blood
 * Plague tick.
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 */
export function plagueHalvesHealing(effects = []) {
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    const kind = e?.flags?.["azeroth-rpg"]?.tick?.plague ?? null;
    if (kind && PLAGUE.kinds[kind]?.halvesHealing) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Death Grip (door 5)                                                 */
/* ------------------------------------------------------------------ */

/**
 * 02 §7: *As a Half-Action, spend any type of rune. Choose one creature you can see within
 * 30 feet. The target makes a Body Resilience Test against your Spell DC. On a failure you
 * pull it into an unoccupied space within your reach. Death Grip ignores size limits unless
 * the target is a Boss. A creature whose own ability says it cannot be moved against its
 * will still refuses.*
 */
export const DEATH_GRIP = Object.freeze({ feature: "Death Grip", feet: 30, resilience: "body" });

/** The reach Death Grip takes: 30 feet, 60 with 04's Icy Grip at rank 2. */
export function deathGripFeet(talents = []) {
  return rankOf(talents, "icy-grip") >= 2 ? 60 : DEATH_GRIP.feet;
}

/* ------------------------------------------------------------------ */
/*  Runic Discipline (door 6)                                           */
/* ------------------------------------------------------------------ */

/** 02 §7: *Each maneuver costs you 1 Runic Power, whatever its listed price.* */
export const RUNIC_DISCIPLINE = Object.freeze({ feature: "Runic Discipline", price: 1 });

// The price a held feature sets on every maneuver lives beside the maneuver pool's law
// (`rules/maneuver-pool.mjs`), which `maneuvers.mjs` reads without a cycle.
export { maneuverPriceOf } from "./maneuver-pool.mjs";

/* ------------------------------------------------------------------ */
/*  Desecration (door 8)                                                */
/* ------------------------------------------------------------------ */

/**
 * 02 §7 (the lead's D-938): *As a Half-Action, spend 3 Runic Power. The ground within 10
 * feet of you is desecrated for 10 minutes, and it is Difficult ground for your enemies. Each
 * creature other than you that starts its turn in the area makes a Spirit Resilience Test
 * against your Spell DC. On a failure, its Ward against Shadow is reduced by your Charisma
 * modifier, to no lower than 0, until the start of its next turn. A creature immune to
 * Shadow damage ignores Desecration.*
 */
export const DESECRATION = Object.freeze({
  feature: "Desecration", key: "desecration", cost: 3, feet: 10, widerFeet: 15, minutes: 10,
  resilience: "spirit", school: "shadow"
});

/** The radius: 10 feet, 15 with 04's Frozen Desecration at rank 2. */
export function desecrationFeet(talents = []) {
  return rankOf(talents, "frozen-desecration") >= 2 ? DESECRATION.widerFeet : DESECRATION.feet;
}

/** *A creature immune to Shadow damage ignores Desecration*: the ground and the Test alike. */
export function ignoresDesecration(immune = []) {
  return (immune ?? []).includes(DESECRATION.school);
}

/**
 * **THE AREA'S START-OF-TURN TEST**, in D-756's area-tick shape, so the one pipeline posts it
 * (`AzerothCombat#_areaTicks` through `checksFor`) and the Resist card's door lands it
 * (`effects/area-strikes.mjs#areaTestOutcome`): every creature other than the knight
 * (`exempt: "caster"`, the lead's words read literally, allies included), a Spirit Test, a
 * failure taking the knight's Charisma modifier off its Ward against Shadow (`wardDrop`),
 * and nothing for a creature immune to Shadow (`spareImmune`). It lasts ten minutes:
 * a hundred of the fight's rounds, the world's clock outside one.
 *
 * @param {{chaMod?: number}} o  the knight's Charisma modifier at the Use
 */
export function desecrationTick({ chaMod = 0 } = {}) {
  const check = emptyCheck();
  return {
    ...emptyAreaTick(),
    who: "creature",
    lasts: { rounds: DESECRATION.minutes * 10 },
    checks: [{
      ...check,
      on: "turn",
      resilience: DESECRATION.resilience,
      exempt: "caster",
      spareImmune: DESECRATION.school,
      fail: { ...check.fail, wardDrop: { school: DESECRATION.school, amount: Math.max(0, Math.trunc(Number(chaMod)) || 0) } }
    }]
  };
}

/**
 * **THE AREA'S GROUND**, in D-757's `areaGround` shape: Difficult ground for the knight's
 * enemies, sparing a creature immune to Shadow.
 */
export function desecrationGround() {
  return { ...emptyAreaGround(), difficult: true, who: "enemy", spares: DESECRATION.school, lasts: { rounds: DESECRATION.minutes * 10 } };
}

/**
 * What a failure takes off the creature's Ward against Shadow: the knight's modifier, never
 * more than the Ward holds (*to no lower than 0*). Nothing where it holds none.
 *
 * @param {{amount?: number, ward?: number}} o
 */
export function wardDropFor({ amount = 0, ward = 0 } = {}) {
  return Math.max(0, Math.min(Math.trunc(Number(amount)) || 0, Math.trunc(Number(ward)) || 0));
}

/* ------------------------------------------------------------------ */
/*  Unholy Presence and March of the Damned (doors 10 and 12)           */
/* ------------------------------------------------------------------ */

/**
 * 02 §7 (level 14): *As a Half-Action, spend 8 Runic Power. You take up your presence until you
 * end it, you drop to 0 Health or you finish a Long Rest. It is not a Sustain. While your
 * presence lasts, once a round, when a blow damages you, gain 1 Runic Power. While your
 * presence lasts, you cannot be Frightened. While your presence lasts, each ally within 30
 * feet of you, you included, has +10 feet Speed. While your presence lasts, each undead ally
 * within 30 feet of you, you included, regains 1 Health at the start of its turn.*
 */
export const UNHOLY_PRESENCE = Object.freeze({
  feature: "Unholy Presence", key: "unholyPresence", cost: 8, feet: 30, speed: 10, regen: 1, strike: 1,
  immune: Object.freeze(["frightened"])
});

/**
 * 02 §7 (level 20): *As an action, spend 5 Runic Power. You and each ally within 30 feet of you
 * ignore Difficult ground for 1 minute. You and those allies cannot be Frightened or Slowed for
 * 1 minute. You and those allies cannot be moved against your will for 1 minute. Each undead
 * ally within 60 feet of you, you included, deals Shadow damage equal to half your Charisma
 * modifier, rounded down, on each melee hit for 1 minute.*
 */
export const MARCH_OF_THE_DAMNED = Object.freeze({
  feature: "March of the Damned", key: "marchOfTheDamned", cost: 5, feet: 30, undeadFeet: 60, minutes: 1,
  immune: Object.freeze(["frightened", "slowed"]), school: "shadow"
});

/** The flag the knight's own laid effect rides: `{kind: "presence"|"march", shadow?}`. */
export const PRESENCE_FLAG = "deathKnightPresence";

/** Once a round: the mark Feeds on Blows takes on the combatant's round record. */
export const FEEDS_ON_BLOWS_MARK = "feeds-on-blows";

/**
 * The knight's own laid presence of a kind (`presence` or `march`), active and switched on, or
 * null - what Feeds on Blows asks at the damage door and what a second Use of Unholy Presence ends.
 *
 * @param {Iterable<{id?: string, active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @param {"presence"|"march"} [kind]
 */
export function presenceOf(effects = [], kind = "presence") {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    if (e.flags?.["azeroth-rpg"]?.[PRESENCE_FLAG]?.kind === kind) return e;
  }
  return null;
}

/**
 * **THE LAID STATES 0 HEALTH ENDS** (02 §7's Unholy Presence: *you drop to 0 Health*; and March of
 * the Damned by the lead's ruling on O-355, run F4b, D-987: *"Yes."*): read by the one end-at-0
 * door, `AzerothActor#_endPresenceAtZero`.
 */
export const PRESENCE_ENDS_AT_ZERO = Object.freeze(["presence", "march"]);

/** Whether an Unholy Presence stands on the knight (Feeds on Blows' gate). */
export function holdsPresence(effects = []) {
  return Boolean(presenceOf(effects, "presence"));
}

/** March of the Damned's Shadow on a melee hit: half the Charisma modifier, rounded down, never below 0. */
export function marchShadow(chaMod = 0) {
  return Math.max(0, Math.floor((Math.trunc(Number(chaMod)) || 0) / 2));
}

/**
 * **THE AURAS THE KNIGHT'S OWN LAID EFFECTS HOLD UP** (doors 10 and 12), in the aura door's
 * source shape (`effects/auras.mjs#auraSourcesOf`), one per radius and per *who*, so the one
 * pass lays and lifts them as an ally steps in and out:
 *
 * - Unholy Presence - +10 feet Speed to every ally within 30 feet, the knight included, and 1
 *   Health at the start of its turn to every UNDEAD ally within 30 feet (`who.undead`);
 * - March of the Damned - Difficult ground ignored, Frightened and Slowed refused and no move
 *   against the will for every ally within 30 feet, the knight included; and the Shadow on a
 *   melee hit, stamped at the Use, for every UNDEAD ally within 60.
 *
 * Plain effects in, sorted by key. An effect switched off holds nothing up.
 *
 * @param {Array<{id: string, active?: boolean, disabled?: boolean, flags?: object, description?: string}>} effects
 * @param {{uuid: string, name?: string}} holder
 * @returns {Array<{key: string, group: string, name: string, origin: string, text: string, aura: object}>}
 */
export function presenceAuraSources(effects = [], { uuid = "", name = "" } = {}) {
  const out = [];
  const base = { targets: "allies", centre: "self", excludeOwner: false, holderOnly: false, gate: null };
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const raw = e.flags?.["azeroth-rpg"]?.[PRESENCE_FLAG] ?? null;
    if (!raw || typeof raw !== "object") continue;
    const text = String(e.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const source = (key, label, aura) => out.push({ key: `${uuid}:${key}`, group: key, name: label, origin: uuid, text, aura: { ...base, ...aura } });
    if (raw.kind === "presence") {
      source(`${UNHOLY_PRESENCE.key}:speed`, UNHOLY_PRESENCE.feature, { feet: UNHOLY_PRESENCE.feet, speed: UNHOLY_PRESENCE.speed });
      source(`${UNHOLY_PRESENCE.key}:regen`, UNHOLY_PRESENCE.feature, { feet: UNHOLY_PRESENCE.feet, tick: { heal: UNHOLY_PRESENCE.regen }, who: { faction: null, living: false, undead: true } });
    } else if (raw.kind === "march") {
      source(`${MARCH_OF_THE_DAMNED.key}:allies`, MARCH_OF_THE_DAMNED.feature, {
        feet: MARCH_OF_THE_DAMNED.feet, ignoresGround: true, unmovable: true, immune: { conditions: [...MARCH_OF_THE_DAMNED.immune] }
      });
      const shadow = Math.max(0, Math.trunc(Number(raw.shadow)) || 0);
      if (shadow > 0) {
        source(`${MARCH_OF_THE_DAMNED.key}:undead`, MARCH_OF_THE_DAMNED.feature, {
          feet: MARCH_OF_THE_DAMNED.undeadFeet, meleeTyped: { type: MARCH_OF_THE_DAMNED.school, amount: shadow }, who: { faction: null, living: false, undead: true }
        });
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ */
/*  Blood Plague spreads (D-962)                                        */
/* ------------------------------------------------------------------ */

/**
 * The lead (D-962): *"Have blood plague trigger a body resilience test against caster DC to
 * targets within 5ft. On a failure they contract blood plague as well."*
 */
export const BLOOD_PLAGUE_SPREAD = Object.freeze({ feet: 5, resilience: "body" });

/**
 * **WHO A BLOOD PLAGUE'S DAMAGE TESTS** (D-962): every creature within 5 feet of the carrier
 * (measured footprint to footprint, D-732), other than the knight and the carrier, allies
 * included (the lead's words read literally), and never one already carrying the knight's
 * Blood Plague. Sorted by uuid, so the cards come out in one order.
 *
 * @param {Array<{uuid: string, feet: number|null, carries?: boolean, down?: boolean}>} rows
 * @param {{knightUuid?: string|null, carrierUuid?: string|null}} o
 * @returns {string[]}  the uuids to test
 */
export function spreadTargets(rows = [], { knightUuid = null, carrierUuid = null } = {}) {
  return (rows ?? [])
    .filter(r => r?.uuid && r.uuid !== knightUuid && r.uuid !== carrierUuid && r.carries !== true && r.down !== true
      && r.feet !== null && r.feet !== undefined && Number.isFinite(Number(r.feet)) && Number(r.feet) <= BLOOD_PLAGUE_SPREAD.feet)
    .map(r => r.uuid)
    .filter((u, i, a) => a.indexOf(u) === i)
    .sort();
}

/** The Test a spreading Blood Plague asks, in the area check's whole shape (`postSplashTest`). */
export function spreadCheck() {
  const check = emptyCheck();
  return { ...check, on: "turn", resilience: BLOOD_PLAGUE_SPREAD.resilience, fail: { ...check.fail, plague: "bloodPlague" } };
}
