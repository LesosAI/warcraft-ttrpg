/**
 * **WHAT THE LEGACY BRANCHES' USES DO BEYOND THEIR DESCRIPTOR, B3's HALF** (the
 * Legacy branches' door 25). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * `onUseSpirits` reads the granting talent's `onUse` at the rank, one key a
 * mechanism, each read by ONE door (`workflows.useFeature`, unless named):
 *
 * | Key | 04's words | What the door does |
 * |---|---|---|
 * | `conceal {feet, allies, until, ends}` | Gnomish Cloaking Device: *You and every ally within 10 feet are hidden, even while observed, for one minute. It ends for each of you who attacks or casts a spell*; Wind Walk at rank 2: *you are also hidden, even while observed, until you next attack* | core's hidden status on an effect of its own on each, `CONCEAL_FLAG`, ended by the attack or cast door (`effects/stealth.mjs#reveal`) |
 * | `cures {count, friendly, except}` | Voodoo Mending: *one condition of your choice on it ends, **Charmed** and **Stunned** included*; the Recombobulator; Arclight Spanner on a construct | one condition the creature carries, chosen through the one chooser before anything is paid, ended as A1 §2 ends one (`curableOn`) |
 * | `areaDispel {within, radius, count, damage}` | Disenchant: *end one effect on each creature within 15 feet of a point within 60 feet, or two at rank 2. A summoned or bound creature there also takes Nature damage equal to twice your tier* | 02's Dispel's law (`rules/dispel.mjs#dispelJudgement`) over every creature in the area, the effects chosen before anything is paid and ended on a success; the damage on the card's own Apply |
 * | `healsDealt` | Life Drain: *You recover Health equal to the damage it takes* | the card carries it, and the one damage door heals the user by what the blow took off the creature |
 * | `thrall {feet, minutes}` | Thrall of the Banshee: *Charmed by you for one minute, obeys your spoken commands and acts on your Initiative* | the named creature's Resist failing lays Charmed carrying `THRALL_FLAG` and binds the token's own actor through D-643's bond (`thrallBond`, on the GM's client, no ownership), which the tracker's side and Initiative and the stat block's banner read; the GM releases it there, and the Charmed's end releases it |
 * | `revive {feet}` | Ancestral Spirit | `rules/death-holds.mjs`' law, written through the gift door |
 * | `armor {ap, ward, until}` | The Mountain Wakes: *Until the encounter ends your Armor Points rise by 2, you have Ward 2 against every school*; Bladestorm: *Until your next turn your Armor Points rise by your Dexterity modifier* | one buff on the user beside its damage: the encounter's, lifted by `_leaveFight`, or `until: "userTurnStart"`'s, expired at the user's next turn (`ARMOR_SPANS`) |
 * | `ethereal {until}` | Ethereal Form | `rules/spirit-realm.mjs`' state, on the user and on Kindred Spirits' allies |
 * | `halvesDealt {until, bossBoon}` | Drawn Across: *the damage it deals is halved, rounded down, until the end of its next turn. A Boss makes the Test with a Boon* | the Resist's failure lays `HALVES_DEALT_FLAG`; every `resolveDamage` the creature's blow goes through halves it before Armor Points and Ward (`dealtHalvedBy`) |
 * | `transporter {feet, perRank}` | Ultrasafe Transporter | `PAD_FLAG` set over a Short Rest; the travel a Full Action once per Long Rest |
 * | `immunity {conditions, ends, until}` | Unfettered: ***Slowed** ends on you, and you cannot be **Slowed** until your next turn. At rank 2 the same holds for **Entangled*** | the conditions ended and `IMMUNE_FLAG` laid, read into `conditionImmunities` by both actor models |
 * | `sustain {identifier, upkeep}` | Big Bad Voodoo: *While you Sustain it ... Sustaining it costs 5 Mana a turn* | a Sustain entry of its own, its upkeep the row's (`rules/upkeep.mjs`), and the aura gated on it (`rules/auras.mjs`' `sustain:` gate) |
 * | `freeMove {ignoresGround}` | Wind Walk: *Move up to your Speed, ignoring **Difficult ground***; Bladestorm's *Move up to your Speed* | one Move that costs no Half-Action through the combatant's queued door (D-712), and the ground ignored for it |
 * | `lift {feet, heal}` | Ancestor's Hand (phase B6): *Every Dying friendly target within 30 feet restores Health equal to your tier per rank and stands* | every ally within the feet who is Dying (`rules/spirit-realm.mjs#isDying`), measured before anything is paid, healed through the one healing door and stood up from Prone for nothing, as Ancestral Spirit's return stands one |
 *
 * And `etherealAllies` (Kindred Spirits) and `spiritRealm` (The Crossing) are
 * top-level rows `rules/spirit-realm.mjs` reads; `deathHold` (Hold the Thread) is
 * `rules/death-holds.mjs`'.
 */

import { evaluateExpression } from "./expressions.mjs";

/** The Active Effect flag a concealment stands under: `{source, ends}`. */
export const CONCEAL_FLAG = "concealed";

/** The Active Effect flag Drawn Across's halving stands under, on the creature: `{source, by}`. */
export const HALVES_DEALT_FLAG = "halvesDealt";

/** The Active Effect flag a thrall's Charmed carries: `{ownerUuid, ownerName, source}` (its release reads the bond). */
export const THRALL_FLAG = "thrall";

/** The Active Effect flag a timed immunity stands under: `{conditions, source}`. */
export const IMMUNE_FLAG = "immuneTo";

/** The actor flag a transporter pad stands under: `{sceneId, x, y, sceneName, source}`. */
export const PAD_FLAG = "transporterPad";

/** What ends a concealment: an attack, a cast. */
export const CONCEAL_ENDS = Object.freeze(["attack", "cast"]);

/** How long a concealment lasts: a minute, or until the next attack. */
export const CONCEAL_SPANS = Object.freeze(["minute", "attack"]);

/** The spans a timed state may take, each `effects/durations.mjs`' (D-778): never a bare turn. */
export const STATE_SPANS = Object.freeze(["userTurnStart", "userTurnEnd", "endOfNextTurn"]);

/**
 * How long a Use's Armor Points and Ward stand: the encounter (04's The Mountain Wakes,
 * *Until the encounter ends*), or until the user's next turn (04's Bladestorm, *Until
 * your next turn your Armor Points rise by your Dexterity modifier*; the Legacy
 * branches' B6) - one round of the world's clock out of a fight (D-778).
 */
export const ARMOR_SPANS = Object.freeze(["encounter", "userTurnStart"]);

/** The two choices 04's Ultrasafe Transporter's Use offers. */
export const TRANSPORTER_CHOICES = Object.freeze(["set", "travel"]);

/** The face a transporter's d6 is unkind on (*on a 1 that creature arrives **Fatigued***). */
export const TRANSPORT_FATIGUE_FACE = 1;

/** What of these Uses stays the table's, each with its reason. */
export const LEGACY_USE_REASONS = Object.freeze({
  continent: "AZEROTH.Transporter.Reason.Continent",
  willing: "AZEROTH.Transporter.Reason.Willing",
  thrallObeys: "AZEROTH.Thrall.Reason.Obeys"
});

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** An amount at the rank and tier: a number, or an expression in the grammar. */
function at(expr, scope) {
  if (typeof expr === "number") return whole(expr);
  return whole(evaluateExpression(String(expr ?? ""), scope));
}

/** A row's clauses at a rank. */
export function atRankOfRow(row, rank) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of Array.isArray(row?.atRank) ? row.atRank : []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/** A list of condition ids, each once, in the order given. */
function conditionList(list, known = null) {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id !== "string" || !id || out.includes(id)) continue;
    if (known && !known.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * **THE LEGACY BRANCHES' B3 USES, AT THE RANK**: every key of the table above, null
 * where the row says nothing, its amounts worked out at the rank and tier.
 *
 * @param {object|null} onUse  the granting talent's (or a gadget's) `onUse`
 * @param {{rank?: number, tier?: number, scope?: object, conditions?: string[]|null}} [o]
 *   `conditions` A1's ids (`AZEROTH.conditions`' keys), where the caller has them
 */
export function onUseSpirits(onUse, { rank = 1, tier = 1, scope = {}, conditions = null } = {}) {
  const o = onUse ? atRankOfRow(onUse, rank) : {};
  const s = { rank, tier, ...(scope ?? {}) };
  const conceal = o.conceal && typeof o.conceal === "object" ? (() => {
    const c = atRankOfRow(o.conceal, rank);
    const until = CONCEAL_SPANS.includes(c.until) ? c.until : "minute";
    const ends = conditionList(c.ends ?? (until === "attack" ? ["attack"] : CONCEAL_ENDS)).filter(e => CONCEAL_ENDS.includes(e));
    // **WHAT THE ATTACK THAT ENDS IT ADDS** (04's Wind Walk at rank 2: *until you next
    // attack, and that attack adds your Dexterity modifier to its damage*; the B6
    // review): read at the Use, a negative modifier adding nothing, and carried on the
    // concealment itself - so the attack that ends it adds it, in a fight or out of one.
    const damage = c.damage !== undefined && c.damage !== null ? at(c.damage, s) : 0;
    return { feet: whole(c.feet), allies: c.allies === true, until, ends: ends.length ? ends : ["attack"], ...(damage > 0 ? { damage } : {}) };
  })() : null;
  const cures = typeof o.cures === "number" || (o.cures && typeof o.cures === "object") ? (() => {
    const c = typeof o.cures === "number" ? { count: o.cures } : o.cures;
    const count = Math.max(1, at(c.count ?? 1, s));
    return { count, friendly: c.friendly === true, except: conditionList(c.except, conditions) };
  })() : null;
  const dispel = o.areaDispel && typeof o.areaDispel === "object" ? (() => {
    const d = atRankOfRow(o.areaDispel, rank);
    const within = whole(d.within);
    const radius = whole(d.radius);
    if (!(within > 0) || !(radius > 0)) return null;
    const amount = d.damage ? at(d.damage.amount ?? 0, s) : 0;
    return {
      within, radius, count: Math.max(1, at(d.count ?? 1, s)),
      damage: amount > 0 ? { amount, type: typeof d.damage.type === "string" && d.damage.type ? d.damage.type : null } : null
    };
  })() : null;
  const transporter = o.transporter && typeof o.transporter === "object" ? (() => {
    const t = atRankOfRow(o.transporter, rank);
    const feet = whole(t.feet);
    const perRank = whole(t.perRank);
    return feet > 0 ? { feet, perRank, count: perRank * Math.max(1, Math.trunc(Number(rank)) || 1) } : null;
  })() : null;
  const immunity = o.immunity && typeof o.immunity === "object" ? (() => {
    const i = atRankOfRow(o.immunity, rank);
    const list = conditionList(i.conditions, conditions);
    return list.length ? { conditions: list, ends: i.ends !== false, until: STATE_SPANS.includes(i.until) ? i.until : "userTurnStart" } : null;
  })() : null;
  const armor = o.armor && typeof o.armor === "object" ? (() => {
    const a = atRankOfRow(o.armor, rank);
    const ap = at(a.ap ?? 0, s);
    const ward = at(a.ward ?? 0, s);
    return ap > 0 || ward > 0 ? { ap, ward, until: ARMOR_SPANS.includes(a.until) ? a.until : "encounter" } : null;
  })() : null;
  const sustain = o.sustain && typeof o.sustain === "object" && typeof o.sustain.identifier === "string" && o.sustain.identifier
    ? {
        identifier: o.sustain.identifier,
        upkeep: o.sustain.upkeep && typeof o.sustain.upkeep === "object" ? { mana: whole(o.sustain.upkeep.mana), health: whole(o.sustain.upkeep.health) } : null
      }
    : null;
  return {
    conceal,
    cures,
    areaDispel: dispel,
    healsDealt: o.healsDealt === true,
    thrall: o.thrall && typeof o.thrall === "object" ? { feet: whole(o.thrall.feet), minutes: Math.max(1, whole(o.thrall.minutes) || 1) } : null,
    revive: o.revive && typeof o.revive === "object" && whole(o.revive.feet) > 0 ? { feet: whole(o.revive.feet) } : null,
    armor,
    ethereal: o.ethereal && typeof o.ethereal === "object" ? { until: STATE_SPANS.includes(o.ethereal.until) ? o.ethereal.until : "userTurnStart" } : null,
    halvesDealt: o.halvesDealt && typeof o.halvesDealt === "object"
      ? { until: STATE_SPANS.includes(o.halvesDealt.until) ? o.halvesDealt.until : "endOfNextTurn", bossBoon: o.halvesDealt.bossBoon === true }
      : null,
    transporter,
    immunity,
    sustain,
    freeMove: o.freeMove && typeof o.freeMove === "object" ? { ignoresGround: o.freeMove.ignoresGround === true } : null,
    // Ancestor's Hand's Dying friends, the Health worked out at the rank and tier (phase B6).
    lift: o.lift && typeof o.lift === "object" && whole(o.lift.feet) > 0 ? { feet: whole(o.lift.feet), amount: at(o.lift.heal ?? "tier", s) } : null
  };
}

/* -------------------------------------------- */
/*  A concealment                                */
/* -------------------------------------------- */

/**
 * Whether one concealment ends at this kind of act (*It ends for each of you who
 * attacks or casts a spell*; *until you next attack*).
 *
 * @param {{ends?: string[]}|null} flag  the effect's `CONCEAL_FLAG`
 * @param {"attack"|"cast"} kind
 */
export function concealEnds(flag, kind) {
  if (!flag || typeof flag !== "object") return false;
  const ends = Array.isArray(flag.ends) && flag.ends.length ? flag.ends : CONCEAL_ENDS;
  return ends.includes(kind);
}

/**
 * **WHAT AN ATTACK MADE FROM A CONCEALMENT ADDS TO ITS DAMAGE** (04's Wind Walk at rank
 * 2: *hidden, even while observed, until you next attack, and that attack adds your
 * Dexterity modifier to its damage*; the B6 review). *That attack* is the one that ENDS
 * the concealment, whenever it comes: each concealment standing on the attacker that an
 * attack ends, and the damage it carries - read by the attack door before its reveal
 * takes it. It was a next-attack promise held to the encounter, so out of a fight the
 * Dexterity never came.
 *
 * @param {Array<object|null>} flags  the concealments standing on the attacker (`CONCEAL_FLAG`'s)
 * @returns {{damage: number, by: string[]}}
 */
export function concealStrike(flags = []) {
  let damage = 0;
  const by = [];
  for (const f of Array.isArray(flags) ? flags : []) {
    if (!concealEnds(f, "attack")) continue;
    const n = whole(f.damage);
    if (!(n > 0)) continue;
    damage += n;
    const name = typeof f.source === "string" && f.source ? f.source : "";
    if (name && !by.includes(name)) by.push(name);
  }
  return { damage, by };
}

/* -------------------------------------------- */
/*  A condition ended                            */
/* -------------------------------------------- */

/**
 * **WHICH CONDITIONS A CURE MAY END ON THIS CREATURE** (A1 §2: *Where an effect ends
 * one condition, it reduces Bleeding and Scorched to 0, sheds every stack of
 * Poisoned, and otherwise ends the named condition outright*): every one of A1's it
 * carries but what the row excepts, sorted so a chooser lists them one way.
 *
 * @param {Iterable<string>} statuses  the creature's
 * @param {{conditions?: string[], except?: string[]}} [o]  `conditions` A1's ids
 * @returns {string[]}
 */
export function curableOn(statuses = [], { conditions = [], except = [] } = {}) {
  const held = new Set([...(statuses ?? [])].map(String));
  return (conditions ?? []).filter(id => held.has(id) && !(except ?? []).includes(id)).sort();
}

/**
 * Why a cure is refused before anything is paid, or null: a friendly cure aimed at
 * a hostile creature (Voodoo Mending's *A friendly target*).
 *
 * @param {{friendly?: boolean}} cure
 * @param {{hostile?: boolean}} target
 */
export function cureRefusal(cure, { hostile = false } = {}) {
  if (cure?.friendly === true && hostile === true) return "AZEROTH.Cure.NotFriendly";
  return null;
}

/* -------------------------------------------- */
/*  Damage dealt, halved                         */
/* -------------------------------------------- */

/**
 * **WHETHER A CREATURE'S DAMAGE IS HALVED** (04's Drawn Across), off the flags of its
 * active effects.
 *
 * @param {Array<object>} flagsList  each active effect's `flags["azeroth-rpg"]`
 * @returns {{source: string, by: string|null}|null}
 */
export function dealtHalved(flagsList = []) {
  for (const f of flagsList ?? []) {
    const raw = f?.[HALVES_DEALT_FLAG];
    if (raw && typeof raw === "object") return { source: String(raw.source ?? ""), by: typeof raw.by === "string" && raw.by ? raw.by : null };
  }
  return null;
}

/**
 * **AN AMOUNT A HALVED SOURCE DEALS** (04's Drawn Across: *the damage it deals is
 * halved, rounded down*; the B3 review): the door that lands a number no
 * `resolveDamage` met - 08 §12's untyped poison tick, 04's Entrapment, a creature's
 * untyped ability, a Signature's retaliation - halves it here, off the same
 * `dealtHalvedBy` reading every resolved blow takes.
 *
 * @param {number} amount
 * @param {object|null|boolean} halving  `dealtHalvedBy`'s, or a boolean
 * @returns {number}
 */
export function halvedAmount(amount, halving) {
  const a = whole(amount);
  return halving ? Math.floor(a / 2) : a;
}

/**
 * **WHETHER THIS CREATURE IS THE ONE THE USE NAMED** (04's Thrall of the Banshee and
 * Drawn Across: *A creature within 30 feet ... makes a Spirit Resilience Test*; the B3
 * review): the card records the creature targeted (`actorUuid`, the token's own actor
 * for an unlinked creature), and its Resist binds or halves that creature alone -
 * never whoever else pressed the button with a token selected.
 *
 * @param {{actorUuid?: string}|null} rec  the card's record of the creature named
 * @param {string|null} uuid  the resister's actor uuid
 * @returns {boolean}
 */
export function namesCreature(rec, uuid) {
  return typeof rec?.actorUuid === "string" && rec.actorUuid.length > 0 && rec.actorUuid === uuid;
}

/**
 * Why Drawn Across is refused before anything is paid (*a creature within 30 feet makes
 * a Spirit Resilience Test*; the B3 review): one creature named, never the user.
 *
 * @param {{named?: number, self?: boolean}} o
 * @returns {string|null}
 */
export function halvesDealtRefusal({ named = 0, self = false } = {}) {
  if (whole(named) !== 1) return "AZEROTH.HalvesDealt.OneTarget";
  if (self === true) return "AZEROTH.HalvesDealt.NotSelf";
  return null;
}

/**
 * **THE ONE READING EVERY DAMAGE DOOR ASKS OF THE BLOW'S SOURCE** (Drawn Across:
 * *the damage it deals is halved* - *any blow whose SOURCE carries the effect, Boss
 * Actions included*): duck-typed over an actor's effects, so the pure door and the
 * cards ask the same question. Null for no source.
 *
 * @param {{effects?: Iterable<{active?: boolean, disabled?: boolean, flags?: object}>}|null} actor
 */
export function dealtHalvedBy(actor) {
  if (!actor) return null;
  const flags = [];
  for (const e of actor.effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    flags.push(e?.flags?.["azeroth-rpg"] ?? {});
  }
  return dealtHalved(flags);
}

/* -------------------------------------------- */
/*  A thrall                                     */
/* -------------------------------------------- */

/**
 * **THE THRALL A CREATURE IS**, off its active effects' flags: the owner its Charmed
 * names, or null.
 *
 * @param {Array<object>} flagsList
 * @returns {{ownerUuid: string, ownerName: string, source: string}|null}
 */
export function thrallOf(flagsList = []) {
  for (const f of flagsList ?? []) {
    const raw = f?.[THRALL_FLAG];
    if (raw && typeof raw === "object" && typeof raw.ownerUuid === "string" && raw.ownerUuid) {
      return { ownerUuid: raw.ownerUuid, ownerName: String(raw.ownerName ?? ""), source: String(raw.source ?? "") };
    }
  }
  return null;
}

/**
 * Why a thrall is refused before anything is paid (*A creature within 30 feet that is
 * not a Boss*), and again on the GM's client at the bind, a key or null.
 *
 * - `character`: **A THRALL IS ONE OF THE GM'S CREATURES** (the lead, 2026-10-22: *"Have
 *   the creature stat block for the token set to bound to the player by GM who can then
 *   remove it"*): the bond it takes is D-643's, which binds a creature and never a
 *   character (MY READING, for the lead: a character named is refused).
 * - `bound`: a creature already bound - to this owner or another, a thrall already -
 *   takes no second bond; the first would be lost (the B3 review: a second press wrote
 *   the thralled state over the creature's own).
 *
 * @param {{named?: number, boss?: boolean, distance?: number|null, feet?: number, self?: boolean,
 *   character?: boolean, bound?: boolean}} o
 */
export function thrallRefusal({ named = 0, boss = false, distance = null, feet = 30, self = false, character = false, bound = false } = {}) {
  if (whole(named) !== 1) return "AZEROTH.Thrall.OneTarget";
  if (self === true) return "AZEROTH.Thrall.NotSelf";
  if (character === true) return "AZEROTH.Thrall.NotCreature";
  if (boss === true) return "AZEROTH.Thrall.Boss";
  if (bound === true) return "AZEROTH.Thrall.AlreadyBound";
  if (distance !== null && (typeof distance !== "number" || distance > whole(feet))) return "AZEROTH.Thrall.TooFar";
  return null;
}

/** The bond kind a thrall is held under (D-643's door; the lead's ruling of 2026-10-22). */
export const THRALL_KIND = "thrall";

/**
 * **THE BOND A THRALL TAKES** (the lead: *"Have the creature stat block for the token
 * set to bound to the player by GM who can then remove it"*): D-643's bond record, on
 * the TOKEN'S own actor - one creature, never every token of a world actor - held
 * while the Charmed stands (`until: "charmed"`), counted against nothing, and
 * carrying what its release puts back (`restore`: the token's own side). It grants no
 * ownership: the GM runs the thrall on the owner's spoken commands.
 *
 * @param {{ownerUuid: string, ownerName?: string, source?: string, name?: string,
 *   disposition?: number|null, tokenUuid?: string|null, since?: number}} o
 * @returns {object}
 */
export function thrallBond({ ownerUuid, ownerName = "", source = "", name = "", disposition = null, tokenUuid = null, since = 0 } = {}) {
  return {
    ownerUuid: String(ownerUuid ?? ""), ownerName: String(ownerName ?? ""), kind: THRALL_KIND,
    sourceId: null, sourceName: String(source ?? "") || null, entryUuid: null, entryName: String(name ?? ""),
    until: "charmed", uncounted: true, school: null, count: 1, since: Number(since) || 0,
    restore: { disposition: Number.isInteger(disposition) ? disposition : null, tokenUuid: typeof tokenUuid === "string" && tokenUuid ? tokenUuid : null }
  };
}

/**
 * Whether a bond is a thrall's (`thrallBond`'s).
 *
 * @param {object|null} bond
 */
export function isThrallBond(bond) {
  return Boolean(bond && typeof bond === "object" && bond.kind === THRALL_KIND && typeof bond.ownerUuid === "string" && bond.ownerUuid);
}

/* -------------------------------------------- */
/*  A timed immunity                             */
/* -------------------------------------------- */

/**
 * **THE CONDITIONS A CREATURE CANNOT BE NOW** (04's Unfettered), off its active
 * effects' flags: each once, sorted.
 *
 * @param {Array<object>} flagsList
 * @returns {string[]}
 */
export function immunitiesFrom(flagsList = []) {
  const out = new Set();
  for (const f of flagsList ?? []) {
    const raw = f?.[IMMUNE_FLAG];
    for (const id of Array.isArray(raw?.conditions) ? raw.conditions : []) if (typeof id === "string" && id) out.add(id);
  }
  return [...out].sort();
}

/* -------------------------------------------- */
/*  An encounter's Armor Points and Ward         */
/* -------------------------------------------- */

/**
 * **THE CHANGES THE MOUNTAIN WAKES LAYS** (*your Armor Points rise by 2, you have
 * Ward 2 against every school*), every one `final` because every key is derived
 * (CLAUDE.md §15): an `add` at each location the creature HAS (`rules/auras.mjs`'
 * rule: no location is grown), and an `add` on Ward in every school.
 *
 * @param {{ap?: number, ward?: number}} armor
 * @param {{apLocations?: string[], schools?: string[]}} o
 * @returns {Array<{key: string, type: "add", value: string, phase: "final"}>}
 */
export function armorChanges(armor, { apLocations = [], schools = [] } = {}) {
  const out = [];
  const ap = whole(armor?.ap);
  const ward = whole(armor?.ward);
  if (ap > 0) for (const location of apLocations ?? []) out.push({ key: `system.ap.${location}`, type: "add", value: String(ap), phase: "final" });
  if (ward > 0) for (const school of schools ?? []) out.push({ key: `system.ward.${school}`, type: "add", value: String(ward), phase: "final" });
  return out;
}

/* -------------------------------------------- */
/*  What a dispel's damage reaches               */
/* -------------------------------------------- */

/**
 * **WHETHER A CREATURE IS SUMMONED OR BOUND** (04's Disenchant: *A summoned or bound
 * creature there also takes Nature damage*): a bond to anybody (D-643), or a
 * creature a Boss's ability called up (`documents/summon.mjs`' `SUMMONED_FLAG`).
 *
 * @param {{bond?: object|null, summoned?: string|null}} o
 */
export function summonedOrBound({ bond = null, summoned = null } = {}) {
  return Boolean(bond && typeof bond === "object") || (typeof summoned === "string" && summoned.length > 0);
}

/* -------------------------------------------- */
/*  The transporter pad                          */
/* -------------------------------------------- */

/**
 * A pad as it may stand, cleaned, or null.
 *
 * @param {unknown} raw
 * @returns {{sceneId: string, x: number, y: number, sceneName: string, source: string}|null}
 */
export function cleanPad(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (typeof raw.sceneId !== "string" || !raw.sceneId || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { sceneId: raw.sceneId, x: Math.round(x), y: Math.round(y), sceneName: String(raw.sceneName ?? ""), source: String(raw.source ?? "") };
}

/**
 * **WHY THE TRANSPORTER IS REFUSED**, a key or null, before anything is paid:
 *
 * - `set`: *Over a Short Rest, set a transporter pad where you stand* - never in a
 *   fight, and never with no token to stand on;
 * - `travel`: a pad standing on a scene the world still has, and no more creatures
 *   than the rank carries (*up to two willing creatures per rank*), each within the
 *   feet (*within 10 feet of you*) and none hostile (*willing*: a creature the user
 *   counts as an ally, MY READING).
 *
 * **AND THE TRAVEL'S OWN TWO** (the B3 review): `spent` - the Long Rest's one use gone,
 * which refuses the travel and never the pad (*Over a Short Rest, set a transporter
 * pad*: free, so the feature's use is asked here and not before the choice); and a
 * pad on ANOTHER scene while any traveller fights (`inFight`, `padHere`) - a token
 * carried off its scene is made anew and the old one deleted, which orphans its
 * combatant in a running fight.
 *
 * @param {"set"|"travel"} choice
 * @param {{inFight?: boolean, token?: boolean, pad?: object|null, padScene?: boolean, others?: number, allowed?: number, far?: boolean, hostile?: boolean,
 *   spent?: boolean, padHere?: boolean}} o
 */
export function transportRefusal(choice, { inFight = false, token = true, pad = null, padScene = true, others = 0, allowed = 0, far = false, hostile = false, spent = false, padHere = true } = {}) {
  if (choice === "set") {
    if (inFight) return "AZEROTH.Transporter.Refuse.SetInFight";
    if (!token) return "AZEROTH.Transporter.Refuse.NoToken";
    return null;
  }
  if (choice !== "travel") return "AZEROTH.Transporter.Refuse.NoChoice";
  if (spent) return "AZEROTH.Transporter.Refuse.Spent";
  if (!cleanPad(pad)) return "AZEROTH.Transporter.Refuse.NoPad";
  if (!padScene) return "AZEROTH.Transporter.Refuse.PadGone";
  if (!token) return "AZEROTH.Transporter.Refuse.NoToken";
  if (inFight && !padHere) return "AZEROTH.Transporter.Refuse.FightScene";
  if (whole(others) > whole(allowed)) return "AZEROTH.Transporter.Refuse.TooMany";
  if (hostile) return "AZEROTH.Transporter.Refuse.NotWilling";
  if (far) return "AZEROTH.Transporter.Refuse.TooFar";
  return null;
}

/**
 * **WHETHER A USE'S FIRST CHOICE IS FREE, SO ITS USE IS ASKED AFTER IT** (04's Ultrasafe
 * Transporter: *Over a Short Rest, set a transporter pad ... Once per Long Rest, as a
 * Full Action, you ... arrive on the pad*; the B3 review): the feature's one use is
 * the travel's, so a spent use refuses the travel (`transportRefusal`'s `spent`) and
 * leaves the pad to be set.
 *
 * @param {object|null} onUse
 * @returns {boolean}
 */
export function usesAskedLater(onUse) {
  return Boolean(onUse?.transporter && typeof onUse.transporter === "object");
}

/**
 * **WHETHER DISENCHANT'S AREA REACHES A CREATURE** (04: *end one effect on each creature
 * within 15 feet of a point*; the B3 review): never a defeated one, and - on a player's
 * client - never one hidden from the players (the GM's own `hidden`, or D-717's Hide),
 * or the chooser names what the table cannot see. `standing` is
 * `canvas/engaged.mjs#standingOf`'s.
 *
 * @param {{defeated?: boolean, hidden?: boolean}} standing
 * @param {{gm?: boolean}} [o]
 * @returns {boolean}
 */
export function areaDispelReaches(standing = {}, { gm = false } = {}) {
  if (standing?.defeated === true) return false;
  if (standing?.hidden === true && gm !== true) return false;
  return true;
}

/**
 * Whether a creature arrives Fatigued (*Roll a d6 for each; on a 1 that creature
 * arrives Fatigued*).
 *
 * @param {number} face  the d6's
 */
export function transportFatigues(face) {
  return Math.trunc(Number(face)) === TRANSPORT_FATIGUE_FACE;
}

/* -------------------------------------------- */
/*  What a B6 row of these kinds must be         */
/* -------------------------------------------- */

/**
 * **THE FAULTS IN ONE ROW'S B3 KINDS** - so a row phase B6 writes is legal or fails
 * `talent-effects.test.mjs` in words, and the synthetic rows `legacy-spirits.test.mjs`
 * sketches are held to the same rule. Empty where the row is sound.
 *
 * @param {object} entry  a `TALENT_EFFECTS` row
 * @param {{conditions: string[], schools: string[], pools: string[], scope?: object}} vocab
 * @returns {string[]}
 */
export function legacyUseFaults(entry, { conditions = [], schools = [], pools = [], scope = { rank: 2, tier: 2 } } = {}) {
  const faults = [];
  const u = entry?.onUse ?? null;
  const num = (v, s = scope) => (typeof v === "number" ? v : evaluateExpression(String(v ?? ""), s));
  if (u?.crossing && !(whole(u.crossing.minutes ?? 1) > 0)) faults.push("onUse.crossing.minutes");
  if (u?.conceal) {
    if (u.conceal.until !== undefined && !CONCEAL_SPANS.includes(u.conceal.until)) faults.push("onUse.conceal.until");
    for (const e of u.conceal.ends ?? []) if (!CONCEAL_ENDS.includes(e)) faults.push(`onUse.conceal.ends ${e}`);
    if (u.conceal.allies === true && !(whole(u.conceal.feet) > 0)) faults.push("onUse.conceal.feet");
  }
  if (u?.cures !== undefined && u?.cures !== null) {
    const c = typeof u.cures === "number" ? { count: u.cures } : u.cures;
    if (!(Number(num(c?.count ?? 1)) >= 1)) faults.push("onUse.cures.count");
    for (const id of c?.except ?? []) if (!conditions.includes(id)) faults.push(`onUse.cures.except ${id}`);
  }
  if (u?.areaDispel) {
    if (!(whole(u.areaDispel.within) > 0) || !(whole(u.areaDispel.radius) > 0)) faults.push("onUse.areaDispel.feet");
    if (!(Number(num(u.areaDispel.count ?? 1)) >= 1)) faults.push("onUse.areaDispel.count");
    if (u.areaDispel.damage && !schools.includes(u.areaDispel.damage.type)) faults.push("onUse.areaDispel.damage.type");
    if (u.areaDispel.damage && num(u.areaDispel.damage.amount) === null) faults.push("onUse.areaDispel.damage.amount");
  }
  if ("healsDealt" in (u ?? {}) && u.healsDealt !== true) faults.push("onUse.healsDealt");
  if (u?.thrall && !(whole(u.thrall.feet) > 0)) faults.push("onUse.thrall.feet");
  if (u?.revive && !(whole(u.revive.feet) > 0)) faults.push("onUse.revive.feet");
  if (u?.armor && num(u.armor.ap ?? 0) === null) faults.push("onUse.armor.ap");
  if (u?.armor && num(u.armor.ward ?? 0) === null) faults.push("onUse.armor.ward");
  if (u?.armor && u.armor.until !== undefined && !ARMOR_SPANS.includes(u.armor.until)) faults.push("onUse.armor.until");
  if (u?.ethereal && u.ethereal.until !== undefined && !STATE_SPANS.includes(u.ethereal.until)) faults.push("onUse.ethereal.until");
  if (u?.halvesDealt && u.halvesDealt.until !== undefined && !STATE_SPANS.includes(u.halvesDealt.until)) faults.push("onUse.halvesDealt.until");
  if (u?.transporter && (!(whole(u.transporter.feet) > 0) || !(whole(u.transporter.perRank) > 0))) faults.push("onUse.transporter");
  if (u?.immunity) {
    const all = [...(u.immunity.conditions ?? []), ...(u.immunity.atRank ?? []).flatMap(c => c?.conditions ?? [])];
    if (!all.length) faults.push("onUse.immunity.conditions");
    for (const id of all) if (!conditions.includes(id)) faults.push(`onUse.immunity ${id}`);
  }
  if (u?.sustain && (typeof u.sustain.identifier !== "string" || !u.sustain.identifier)) faults.push("onUse.sustain.identifier");
  if (u?.sustain?.upkeep && !(Number.isFinite(Number(u.sustain.upkeep.mana ?? 0)) && Number(u.sustain.upkeep.mana ?? 0) >= 0)) faults.push("onUse.sustain.upkeep");
  if (u?.freeMove && typeof u.freeMove !== "object") faults.push("onUse.freeMove");
  if (u?.lift) {
    if (!(whole(u.lift.feet) > 0)) faults.push("onUse.lift.feet");
    if (num(u.lift.heal ?? "tier") === null) faults.push("onUse.lift.heal");
  }
  if (entry?.deathHold) {
    if (!(whole(entry.deathHold.feet) > 0)) faults.push("deathHold.feet");
    if (entry.deathHold.cost && !pools.includes(entry.deathHold.cost.pool)) faults.push(`deathHold.cost.pool ${entry.deathHold.cost.pool}`);
  }
  if (entry?.spiritRealm) {
    const r = entry.spiritRealm;
    if (r.heals !== undefined && r.heals !== null && r.heals !== "others") faults.push("spiritRealm.heals");
    for (const h of [r.halfActions, ...(r.atRank ?? []).map(c => c?.halfActions)].filter(v => v !== undefined)) {
      if (!(Number(h) >= 1 && Number(h) <= 2)) faults.push("spiritRealm.halfActions");
    }
  }
  if (entry?.etherealAllies) {
    if (!(whole(entry.etherealAllies.feet) > 0)) faults.push("etherealAllies.feet");
    if (!(Number(num(entry.etherealAllies.count ?? "rank")) > 0)) faults.push("etherealAllies.count");
  }
  return faults;
}
