/**
 * **THE DEMON HUNTER'S CLASS FEATURES, AS LAW** (02 §7; the Demon Hunter plan's Phase 4a, D-1520 to
 * D-1529). Pure: no Foundry imports (CLAUDE.md §3). Every number here is 02's and `demon-hunter-
 * features.test.mjs` reads it back off the chapter; the doors are `effects/demon-hunter-features.mjs`
 * (judge, then budget, then pay; D-768), the attack door's riders (`rules/riders.mjs`, D-770), the cast
 * dialog's Fel Surge line, the rest door (`AzerothActor#_hatredAtRest`) and the death watch
 * (`effects/death-watch.mjs`, the ONE observer).
 *
 * The lead's rulings this module carries (the plan's C-rows, verbatim where they are short):
 *
 * - C3: Spectral Sight *"change to 10 feet per 5 Fel"*.
 * - C7: Fel Lash *"remove Fel corruption equal to half your tier to a min of 1 if the attack hits"*.
 * - C8: *"Having a spell or feature prevent death goes against this"* - nothing here holds the hunter
 *   above 0, and `demon-hunter-features.test.mjs` holds every Demon Hunter row to that (the C8 census).
 * - C10: Hunter's Leap *"2x Dexterity modifier"*, answered *2x Dex in squares*: 10 feet a point, at
 *   least 5 feet.
 * - C12: Demon Unleashed spends all your Hatred, *"remove limitation"* (MY READING: at least 1).
 * - C14: *"Add AP 2 to all slots"*; C15: Energy *"Refill 5 a turn"* at Fel 15 or more; C16: *"list the
 *   speed, assume tier 4"* - a flying Speed of 240 feet at Fel 10 or more.
 * - C48: Hunter's Stride, 5 feet for each tier reached.
 * - C17, C19: I Have Prepared; the cost is half of (20 minus the Fel held when it was used), rounded up.
 * - D-1721 (the lead's ruling of 2026-11-22, *"fel lash - slightly reduce fel lash shed amount"*): the FIRST Fel Lash
 *   hit in a turn takes Fel off, a later hit that turn none, whatever the shape (Q11 is moot: Demon Unleashed adds no
 *   shed limit of its own).
 * - Q13: Demon Unleashed may be used out of a fight. Q14: the cap is never trimmed by a fall in Fel.
 *
 * **WHICH FEL EACH NUMBER READS.** A feature's SCALE reads `hatred.mjs#felFor` (I Have Prepared's 20,
 * Embrace the Pain's 5 more); whether the TRACK has ended (Fel Lash sheds nothing at 20) and what I
 * Have Prepared costs read the Fel really held (`hatred.mjs#heldFel`), as 10 §9 and 02 say.
 */

import { DEMON_HUNTER, DEMON_HUNTER_NAME, EMBRACE_THE_PAIN, FEL_STEP, FEL_TRACK_TOP, HATRED } from "./hatred.mjs";
// 04's Wings of the Betrayer and the demon's two shapes (the Demon Hunter plan's Phase 5).
import { inDemonShape, wingsFeet } from "./demon-hunter-talents.mjs";
// The ONE answer to *is this an unarmed strike* (the review's M3, the orchestrator's ruling on C11).
import { isUnarmedStrike } from "./unarmed.mjs";
// The one resolver, for Beyond Limits' after-the-roll judgement (D-1724).
import { resolveTest } from "./resolution.mjs";
// Whether a creature shows spells (the NPC sheet's own test), for H2's real caster.
import { showsCreatureSpells } from "./casting.mjs";
// The compass the Hunter's Brand reads, for Spectral Sight's demons (the review's S1).
import { compassOf } from "./demon-hunter-spells.mjs";

export { DEMON_HUNTER, DEMON_HUNTER_NAME, HATRED };

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));
const tierOf = t => Math.min(4, Math.max(1, int(t) || 1));
const felSteps = fel => Math.floor(Math.min(FEL_TRACK_TOP, whole(fel)) / FEL_STEP);

/* ------------------------------------------------------------------ */
/*  The numbers, one home each                                          */
/* ------------------------------------------------------------------ */

/** 02's Spectral Sight: *Within 30 feet, plus 10 feet for each 5 Fel Corruption you hold* (C3). */
export const SPECTRAL_SIGHT = Object.freeze({
  feature: "Spectral Sight", base: 30, step: 10, demons: 60, immune: Object.freeze(["blinded"]),
  // 04's Eyes of the Nether: *Spectral Sight reaches 20 feet further* (Phase 5's row reads this).
  eyesOfTheNether: Object.freeze({ name: "Eyes of the Nether", feet: 20 })
});

/** 02's Bane of the Legion: extra damage equal to your tier; the hit lays a mark for the hunter's next turn. */
export const BANE_OF_THE_LEGION = Object.freeze({ feature: "Bane of the Legion", flag: "legionBane" });

/**
 * 02's Beyond Limits: *Once each turn, gain 1 Hatred and choose one*. The five choices, in 02's order;
 * the last is offered after a Body or Reflex Resilience Test's die, at its seam (*after you roll it and see the
 * result*; D-1720, D-1724: `effects/demon-hunter-features.mjs#offerBeyondLimits`).
 */
export const BEYOND_LIMITS = Object.freeze({
  feature: "Beyond Limits", identifier: "beyond-limits", gain: 1, feet: 10, resilience: 2,
  kinds: Object.freeze(["body", "reflex"]),
  choices: Object.freeze(["further", "ground", "noOpportunity", "climbSwim", "resilience"]),
  // The effect flags its choices lay on the hunter, each named for the door that reads it.
  climbFlag: "climbsSwimsFree", spareFlag: "spareOpportunity",
  // Out of a fight there is no turn: once a round of the world's clock (MY READING, D-778's).
  clockFlag: "beyondLimitsAt",
  // 04's Steady Footing (Phase 5's row): *it also ends Slowed and Entangled on you*.
  steadyFooting: Object.freeze({ name: "Steady Footing", ends: Object.freeze(["slowed", "entangled"]) })
});

/**
 * 02's Fel Lash: 2 Hatred as part of a weapon attack; tier plus 1 for each 5 Fel; half the tier off the track on the
 * first hit in a turn (D-1721). `shedMark` is the turn's once on the round's record (`fel-lash-shed@<turn>`); out of a
 * fight `clockFlag` holds the world time of the last shed, and a round of the clock (6 seconds) is the turn.
 */
export const FEL_LASH = Object.freeze({
  feature: "Fel Lash", identifier: "fel-lash", hatred: 2, type: "fel", shedMark: "fel-lash-shed", clockFlag: "felLashShedAt", clockSeconds: 6
});

/** 02's Hunter's Leap: a Reaction and 2 Energy; 10 feet for each point of the Dexterity modifier, never less than 5. */
export const HUNTERS_LEAP = Object.freeze({ feature: "Hunter's Leap", energy: 2, perPoint: 10, min: 5 });

/** 02's Hunter's Stride: 5 feet for each tier reached. */
export const HUNTERS_STRIDE = Object.freeze({ feature: "Hunter's Stride", perTier: 5 });

/** 02's Mana Rend: 3 Energy as part of a weapon attack; Power lost equal to the Wisdom modifier, at least 1. */
export const MANA_REND = Object.freeze({ feature: "Mana Rend", identifier: "mana-rend", energy: 3, min: 1, type: "fel", gain: 1 });

/** 02's Devour Soul: a Reaction within 10 feet; twice your tier plus your Wisdom modifier; a demon's soul gives 2 Hatred. */
export const DEVOUR_SOUL = Object.freeze({
  feature: "Devour Soul", feet: 10, demonHatred: 2, flag: "devourStruck", given: "soulDevoured",
  // The creature kinds that give nothing (02: *A construct, an undead without a soul and a creature whose
  // soul is held elsewhere give you nothing*). *Undead without a soul* is the GM's: MY READING, every undead
  // is offered and the card says so, because no block records a soul.
  refuses: Object.freeze(["construct"])
});

/** 02's Warding Tattoos, read by `hatred.mjs#restModifiersOf`. */
export const WARDING_TATTOOS = Object.freeze({ feature: "Warding Tattoos", leftOut: 3 });

/**
 * 04's Quiet the Whispers (the Sufferer's tier 3; the brief: its order belongs to the rest door): *Once
 * per Long Rest per rank ... make a Spirit Resilience Test after every other talent and feature has
 * reduced it. The DC is 10 plus the Hatred you held when the rest ended.*
 */
export const QUIET_THE_WHISPERS = Object.freeze({ name: "Quiet the Whispers", base: 10, kind: "spirit", flag: "quietWhispers" });

/** 02's Demon Unleashed: the `unleashed` shape (`rules/shapes.mjs#SHAPE_KINDS.unleashed`). */
export const DEMON_UNLEASHED = Object.freeze({
  feature: "Demon Unleashed", kind: "unleashed", damageRating: 2, ap: 2,
  ward: Object.freeze({ school: "fel", value: 2 }), immune: Object.freeze(["frightened", "charmed"]),
  wingsAt: 10, flying: 240, refillAt: 15, refill: 5, baseRefill: 3,
  // Sources that may still raise Hatred while unleashed: I Have Prepared's own fill (its words name it), a
  // refund of a price taken back, and a GM's hand (MY READING).
  gainsAllowed: Object.freeze(["prepared", "refund", "hand"])
});

/** 02's I Have Prepared: Fel read as 20, Hatred filled to 13, a minute, half of (20 minus the Fel held) at the end. */
export const I_HAVE_PREPARED = Object.freeze({
  feature: "I Have Prepared", readAs: 20, hatred: 13, minutes: 1, flag: "prepared", startFlag: "preparedFrom"
});

/** Every feature 02 §7 gives the Demon Hunter, in its table's order. */
export const DH_FEATURE_NAMES = Object.freeze([
  "Spectral Sight", "Bane of the Legion", "Beyond Limits", "Fel Lash", "Hunter's Leap", "Fel Surge",
  "Extra Attack", "Hunter's Stride", "Mana Rend", "Devour Soul", "Warding Tattoos", "Demon Unleashed",
  "I Have Prepared"
]);

/* ------------------------------------------------------------------ */
/*  Spectral Sight                                                      */
/* ------------------------------------------------------------------ */

/**
 * How far Spectral Sight reaches: 30 feet, plus 10 for each 5 Fel (`felFor`'s reading), plus 20 a rank of
 * Eyes of the Nether.
 *
 * @param {number} fel  `felFor`'s answer
 * @param {{eyes?: number}} [o]
 * @returns {number}
 */
export function spectralSightFeet(fel = 0, { eyes = 0, extra = 0 } = {}) {
  // `extra` is what a worn item adds (the Blindfold of the Illidari: *Spectral Sight reaches 10 feet
  // further*; D-2156), read off its patch through `class-talents.mjs#patchRowsOf`.
  return SPECTRAL_SIGHT.base + SPECTRAL_SIGHT.step * felSteps(fel) + SPECTRAL_SIGHT.eyesOfTheNether.feet * whole(eyes) + Math.max(0, whole(extra));
}

/** The token flag that records the feet Spectral Sight wrote, so a feature taken away can put the sight back. */
export const SIGHT_MARK = "spectralSight";

/**
 * **THE TALENTS THAT MOVE SPECTRAL SIGHT'S REACH**: 04's Eyes of the Nether (*20 feet further*) and 04's Embrace
 * the Pain, whose 5 more Fel `hatred.mjs#felFor` reads for the sight (*Spectral Sight, Fel Lash and your Hatred
 * cap*). A talent of either name taken, given back, embedded or deleted reads the token's sight again; before this,
 * Embrace taken left the sight at the Fel really held until something else moved it.
 *
 * @param {{type?: string, name?: string, system?: {identifier?: string}}|null} item
 * @returns {boolean}
 */
export function movesSpectralSight(item) {
  if (item?.type !== "talent") return false;
  const names = [SPECTRAL_SIGHT.eyesOfTheNether.name, EMBRACE_THE_PAIN];
  const ids = ["eyes-of-the-nether", "embrace-the-pain"];
  return names.includes(item.name) || ids.includes(item.system?.identifier);
}

/**
 * **WHAT A TOKEN SEES BY** (v14 `TokenDocument.sight` and the keyed `detectionModes`, verified against
 * 14.367 `common/documents/token.mjs` and `client/documents/token.mjs#_prepareDetectionModes`): darkness and
 * magical darkness seen through as darkvision to the feet (`sight.range` with the darkvision mode), and invisible
 * creatures to the feet (`seeInvisibility`). **LIT VISION IS NEVER CAPPED** (the review's M4): core's
 * `lightPerception` reads every lit thing in sight at any range, and `basicSight` is left alone - core derives it
 * from `sight.range` (`detectionModes.basicSight ??= {range: this.sight.range}`), so writing it would only pin a
 * stale number. Flat keys, so a GM's angle, colour and the rest of the token survive; the token's own flag
 * records the feet (`SIGHT_MARK`). Null where the feet are not a number.
 *
 * @param {number} feet
 * @returns {Record<string, unknown>|null}
 */
export function spectralSightPatch(feet) {
  const f = whole(feet);
  if (!f) return null;
  return {
    "sight.enabled": true,
    "sight.range": f,
    "sight.visionMode": "darkvision",
    "detectionModes.seeInvisibility": { enabled: true, range: f },
    [`flags.azeroth-rpg.${SIGHT_MARK}`]: f
  };
}

/**
 * **THE SIGHT PUT BACK** (the review's L12): a token Spectral Sight wrote (`SIGHT_MARK` present) whose actor no
 * longer holds the feature goes back to core's own sight for a character (`rules/tokens.mjs#CHARACTER_TOKEN`: sight
 * on, range 0, basic), its See Invisibility taken off and the mark cleared. Nothing for a token it never wrote.
 * `detectionModes` without the key is handed back whole for the door to replace (a TypedObjectField key cannot be
 * deleted by a dotted path).
 *
 * @param {object} token  the plain source
 * @returns {{sight: object, detectionModes: object}|null}
 */
export function sightWithdrawn(token = {}) {
  if (token?.flags?.["azeroth-rpg"]?.[SIGHT_MARK] === undefined) return null;
  const modes = { ...(token?.detectionModes ?? {}) };
  delete modes.seeInvisibility;
  return { sight: { enabled: true, range: 0, visionMode: "basic" }, detectionModes: modes };
}

/**
 * **WHERE EVERY DEMON WITHIN 60 FEET LIES** (02's Spectral Sight: *You know the direction of every demon within 60
 * feet*; the review's S1): the creatures of the demon kind, measured footprint to footprint, within the feet, each
 * with its compass point (`demon-hunter-spells.mjs#compassOf`, the Hunter's Brand's own) and its feet, sorted by
 * distance then name. *You see the aura of a spell or a magic item and know its school* stays the GM's call
 * (`SPECTRAL_SIGHT_TABLE`): no document records an aura.
 *
 * @param {Array<{name?: string, kinds?: Iterable<string>, feet?: number|null, dx?: number, dy?: number}>} rows
 * @param {{reach?: number}} [o]
 * @returns {Array<{name: string, feet: number, point: string}>}
 */
export function demonsSensed(rows = [], { reach = SPECTRAL_SIGHT.demons } = {}) {
  return (rows ?? [])
    .filter(r => new Set(r?.kinds ?? []).has("demon") && r?.feet !== null && r?.feet !== undefined && Number.isFinite(Number(r.feet)) && Number(r.feet) <= Number(reach) + 1e-6)
    .map(r => ({ name: String(r.name ?? ""), feet: Math.round(Number(r.feet)), point: compassOf(r.dx, r.dy) ?? "here" }))
    .sort((a, b) => a.feet - b.feet || a.name.localeCompare(b.name));
}

/** What stays the GM's of Spectral Sight (a census `reason`, D2 §12): the aura of a spell or a magic item. */
export const SPECTRAL_SIGHT_TABLE = "an aura and its school are the GM's to tell: no document records the aura of a spell or a magic item (02's Spectral Sight: \"You see the aura of a spell or a magic item and know its school\")";

/**
 * The keys of a patch that differ from what a token holds now, so a token that already sees as it should
 * is never written. `token` is the plain source (`toObject()` or `_source`).
 *
 * @param {object} token
 * @param {Record<string, unknown>|null} patch
 * @returns {Record<string, unknown>}
 */
export function sightChanges(token = {}, patch = null) {
  const out = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    const held = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), token ?? {});
    if (JSON.stringify(held ?? null) !== JSON.stringify(value)) out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Bane of the Legion                                                  */
/* ------------------------------------------------------------------ */

/**
 * **WHETHER BANE OF THE LEGION REACHES A CREATURE** (02: *against a demon, and against a creature that
 * holds Mana or is Sustaining a spell*): its kinds (`creature-kinds.mjs#kindsOf`, a Set or a list), a
 * Mana pool held (any amount: *holds Mana*, MY READING - a pool, whatever is left in it), or a Sustain.
 *
 * @param {{kinds?: Iterable<string>, holdsMana?: boolean, sustaining?: boolean}} o
 * @returns {boolean}
 */
export function baneReaches({ kinds = [], holdsMana = false, sustaining = false } = {}) {
  const set = new Set(kinds ?? []);
  return set.has("demon") || holdsMana === true || sustaining === true;
}

/**
 * **WHETHER A CREATURE REALLY HOLDS A POWER POOL** (the review's H2): every creature's block carries a Power FLOOR
 * the tier derives (`NpcData#prepareDerivedData`, D-705), so a wolf and a bandit snapshot with a Power pool they
 * never had. A creature holds one only where its block STATES a Power maximum (`_source`'s `power.max`), or it is a
 * caster (`casting.mjs#showsCreatureSpells`: a Spells line, a Spell DC, or a spell item given). A character holds
 * whatever pools its classes give.
 *
 * @param {{type?: string, statedPowerMax?: number|null, spellNames?: string[], spellDC?: number|null, spellItems?: number}} facts
 * @returns {boolean}
 */
export function realPowerOf({ type = "npc", statedPowerMax = null, spellNames = [], spellDC = null, spellItems = 0 } = {}) {
  if (type !== "npc") return true;
  if (statedPowerMax !== null && statedPowerMax !== undefined && Number.isFinite(Number(statedPowerMax))) return true;
  return showsCreatureSpells({ names: spellNames ?? [], dc: spellDC ?? null, spellItems: Number(spellItems) || 0 });
}

/**
 * **WHETHER A CREATURE HOLDS MANA** (Bane of the Legion, Feed on Power; the review's H2): a pool named Mana, or a
 * creature's unnamed Power pool where it really holds one (`realPowerOf`: a stated maximum or a caster), never the
 * derived floor every creature carries.
 *
 * @param {{type?: string, pools?: Array<{kind: string, name?: string|null}>}} facts  and `realPowerOf`'s facts
 * @returns {boolean}
 */
export function holdsManaOf(facts = {}) {
  const pools = Array.isArray(facts?.pools) ? facts.pools : [];
  if (pools.some(p => p?.kind === "power" && p.name === "mana")) return true;
  return facts?.type === "npc" && pools.some(p => p?.kind === "power" && !p.name) && realPowerOf(facts);
}

/** Bane of the Legion's extra damage: the hunter's tier. */
export function baneDamage(tier = 1) {
  return tierOf(tier);
}

/* ------------------------------------------------------------------ */
/*  Beyond Limits                                                       */
/* ------------------------------------------------------------------ */

/**
 * **WHY BEYOND LIMITS CANNOT BE USED NOW**, or null (02: *Once each turn*): in a fight, the turn's mark
 * already on the round's record; out of one, a round of the world's clock since the last use (MY READING,
 * D-778's one round). A key under `AZEROTH.DemonHunter.BeyondLimits.Refuse.`.
 *
 * @param {{inFight?: boolean, used?: string[], mark?: string|null, lastAt?: number|null, now?: number}} o
 * @returns {null|"turn"|"clock"}
 */
export function beyondLimitsRefusal({ inFight = false, used = [], mark = null, lastAt = null, now = 0 } = {}) {
  if (inFight) return mark && !(used ?? []).includes(mark) ? null : "turn";
  if (lastAt === null || lastAt === undefined || !Number.isFinite(Number(lastAt))) return null;
  return Number(now) - Number(lastAt) < 6 ? "clock" : null;
}

/**
 * **WHETHER BEYOND LIMITS' 2 IS WORTH OFFERING AFTER THE ROLL** (02: *add 2 to a Body or Reflex Resilience Test
 * after you roll it and see the result*; D-1720, D-1724): only where it turns the result or moves its Success Level,
 * read through the one resolver (`rules/resolution.mjs#resolveTest`, the natural 20 and 1 included). Never on a
 * result something else fixed (`forced`: Trueshot's SL, a forced miss, a Disrupt Weave), and never on a Test with no
 * die.
 *
 * @param {{total?: number, dc?: number, natural?: number|null, criticalOn?: number, forced?: boolean}} o
 * @returns {boolean}
 */
export function beyondLimitsWorth({ total = 0, dc = 10, natural = null, criticalOn = 20, forced = false } = {}) {
  if (forced === true || natural === null || natural === undefined || !Number.isFinite(Number(natural))) return false;
  const n = Number(natural);
  const modifier = (Number(total) || 0) - n;
  const before = resolveTest({ natural: n, modifier, dc: Number(dc) || 10, criticalOn });
  const after = resolveTest({ natural: n, modifier: modifier + BEYOND_LIMITS.resilience, dc: Number(dc) || 10, criticalOn });
  return before.success !== after.success || before.sl !== after.sl;
}

/**
 * **WHAT ONE CHOICE LAYS ON THE HUNTER** for the rest of the turn (one round of the world's clock out of a
 * fight): an Active Effect's changes and flags. MY READINGS: *your next Move this turn goes 10 feet
 * further* is +10 feet Speed for the turn; *one Move ignores Difficult ground* and *one Move provokes no
 * Opportunity Attack from one creature you choose* hold for the turn, since a turn has one Move to make
 * after the choice; the climb and the swim are 05's free pace for the turn.
 *
 * @param {"further"|"ground"|"noOpportunity"|"climbSwim"} choice
 * @param {{spare?: {actorUuid?: string|null, tokenId?: string|null, name?: string}|null}} [o]
 * @returns {{changes: object[], flags: object}|null}  null for the Resilience choice, which lays nothing
 */
export function beyondLimitsLays(choice, { spare = null } = {}) {
  switch (choice) {
    case "further":
      return { changes: [{ key: "system.speed", type: "add", value: String(BEYOND_LIMITS.feet), phase: "final" }], flags: {} };
    case "ground":
      return { changes: [], flags: { ignoresGround: true } };
    case "noOpportunity":
      return spare ? { changes: [], flags: { [BEYOND_LIMITS.spareFlag]: { actorUuid: spare.actorUuid ?? null, tokenId: spare.tokenId ?? null, name: String(spare.name ?? "") } } } : null;
    case "climbSwim":
      return { changes: [], flags: { [BEYOND_LIMITS.climbFlag]: true } };
    default:
      return null;
  }
}

/**
 * **WHETHER A MOVER SPARES ONE THREATENER ITS OPPORTUNITY ATTACK** (Beyond Limits' third choice): a
 * mover's active effect names it, by actor uuid or token id.
 *
 * @param {Array<object>} flagsList  each ACTIVE effect's `flags["azeroth-rpg"]`
 * @param {{actorUuid?: string|null, tokenId?: string|null}} threatener
 * @returns {boolean}
 */
export function sparesOpportunity(flagsList = [], { actorUuid = null, tokenId = null } = {}) {
  for (const f of flagsList ?? []) {
    const s = f?.[BEYOND_LIMITS.spareFlag];
    if (!s || typeof s !== "object") continue;
    if ((s.actorUuid && s.actorUuid === actorUuid) || (s.tokenId && s.tokenId === tokenId)) return true;
  }
  return false;
}

/** Whether a mover's active effects lay Beyond Limits' free climb and swim. */
export function climbsAndSwimsFree(flagsList = []) {
  return (flagsList ?? []).some(f => f?.[BEYOND_LIMITS.climbFlag] === true);
}

/* ------------------------------------------------------------------ */
/*  Fel Lash                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fel Lash's damage: your tier, plus 1 for each 5 Fel held before the hit (`felFor`'s reading, so I Have
 * Prepared's 20 gives tier plus 4, as 02 says), plus Fel-Tempered's rank and the rest a talent adds.
 *
 * @param {{tier?: number, fel?: number, more?: number}} o
 * @returns {number}
 */
export function felLashDamage({ tier = 1, fel = 0, more = 0 } = {}) {
  return tierOf(tier) + felSteps(fel) + whole(more);
}

/**
 * **THE FEL CORRUPTION A FEL LASH HIT TAKES OFF** (C7, D-1721: *The first time Fel Lash hits in a turn, that hit
 * also takes Fel Corruption off you equal to half your tier, rounded down, and at least 1. A later hit in the same
 * turn takes none*): never more than is held; nothing from a track that has ended (10 §9: *Fel 20*), nothing while I
 * Have Prepared lasts (*Fel Lash takes no Fel Corruption off you*), and nothing once the turn's shed is spent
 * (`shedThisTurn`, for any hit in any shape). `held` is the Fel REALLY held (`heldFel`), never `felFor`'s.
 *
 * The door claims the turn's once BEFORE it asks this (MY READING, the orchestrator's: a first hit that sheds
 * nothing - Fel 0, Fel 20, I Have Prepared - still is *the first time Fel Lash hits in a turn*).
 *
 * @param {{tier?: number, held?: number, prepared?: boolean, shedThisTurn?: boolean}} o
 * @returns {{points: number, reason: null|"ended"|"prepared"|"once"|"none"}}
 */
export function felLashShed({ tier = 1, held = 0, prepared = false, shedThisTurn = false } = {}) {
  const h = whole(held);
  // The reasons in the order a card says them: the track's end and I Have Prepared before the turn's once.
  if (h >= FEL_TRACK_TOP) return { points: 0, reason: "ended" };
  if (prepared === true) return { points: 0, reason: "prepared" };
  if (shedThisTurn === true) return { points: 0, reason: "once" };
  if (h === 0) return { points: 0, reason: "none" };
  return { points: Math.min(h, Math.max(1, Math.floor(tierOf(tier) / 2))), reason: null };
}

/**
 * **WHETHER THE TURN'S FEL LASH SHED IS SPENT OUT OF A FIGHT** (D-1721): a shed within a round of the world's clock
 * (6 seconds, MY READING, D-778's one round) of the last. `lastAt` is the `FEL_LASH.clockFlag` the door stamped.
 *
 * @param {{lastAt?: number|null, now?: number}} o
 * @returns {boolean}
 */
export function felLashClockSpent({ lastAt = null, now = 0 } = {}) {
  if (lastAt === null || lastAt === undefined || !Number.isFinite(Number(lastAt))) return false;
  return Number(now) - Number(lastAt) < FEL_LASH.clockSeconds;
}

/**
 * **A TRACK LOWERED BY A FEATURE** (C7, 10's *The Demon Hunter's Fel*): the points come off, floored at 0;
 * a track at its top has ended and cannot fall (10 §9). Pure: what `workflows.reduceCorruption` writes.
 *
 * @param {{before?: number, points?: number}} o
 * @returns {{after: number, lost: number, refused: null|"ended"|"none"}}
 */
export function corruptionReduction({ before = 0, points = 0 } = {}) {
  const b = Math.min(FEL_TRACK_TOP, whole(before));
  const p = whole(points);
  if (b >= FEL_TRACK_TOP) return { after: b, lost: 0, refused: "ended" };
  if (p === 0 || b === 0) return { after: b, lost: 0, refused: "none" };
  const after = Math.max(0, b - p);
  return { after, lost: b - after, refused: null };
}

/* ------------------------------------------------------------------ */
/*  The two riders                                                      */
/* ------------------------------------------------------------------ */

/**
 * **THE RIDER ROWS THE HUNTER'S FEATURES CARRY** (D-770's shape, read by `ridersFor` beside the talents',
 * as the Death Knight's `FEATURE_RIDERS` are). Paid when the attack rolls (02: *As part of a weapon
 * attack, spend*); what each does on a hit is the door's (`effects/demon-hunter-features.mjs
 * #demonHunterOnHit`), keyed `felLash` and `manaRend` on `onHit`. Mana Rend writes on the creature struck,
 * so `riders.mjs#riderWritesOnTarget` asks a GM for it before anything is paid.
 */
export const DH_FEATURE_RIDERS = Object.freeze({
  [FEL_LASH.identifier]: Object.freeze({
    feature: FEL_LASH.feature,
    rider: Object.freeze({ cost: Object.freeze({ pool: HATRED, amount: FEL_LASH.hatred }), onHit: Object.freeze({ felLash: true }) })
  }),
  [MANA_REND.identifier]: Object.freeze({
    feature: MANA_REND.feature,
    rider: Object.freeze({ cost: Object.freeze({ pool: "energy", amount: MANA_REND.energy }), onHit: Object.freeze({ manaRend: true }) })
  })
});

/**
 * The rider rows a hunter's held features carry, as `death-knight.mjs#featureRiders` hands the knight's:
 * a row a feature, and the lookup that hands back its rider. Sorted by identifier.
 *
 * **NEVER ON AN UNARMED STRIKE** (the review's M3; the orchestrator's ruling on C11): both are *As part of a weapon
 * attack*, and a fist or the Sovereign's Claws is no weapon attack (`rules/unarmed.mjs#isUnarmedStrike`), so an
 * unarmed blow draws neither line.
 *
 * @param {string[]} featureNames
 * @param {{unarmed?: boolean}} [o]
 * @returns {{talents: Array<object>, rowOf: (className: string, identifier: string) => object|null}}
 */
export function demonHunterRiders(featureNames = [], { unarmed = false, price = {} } = {}) {
  const held = new Set(unarmed === true ? [] : (featureNames ?? []));
  const talents = Object.entries(DH_FEATURE_RIDERS)
    .filter(([, row]) => held.has(row.feature))
    .map(([identifier, row]) => ({ className: DEMON_HUNTER_NAME, identifier, name: row.feature, taken: 1 }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
  // **A PRICE SET BY A WORN ITEM** (the Warglaive of Azzinoth's Twin Blades: *Fel Lash costs them 1
  // Hatred*; D-2157): the rider's amount at the lower of its own and the price handed in, so the
  // dialog's line, the judgement and the payment read the same row (D-770).
  const riderOf = identifier => {
    const rider = DH_FEATURE_RIDERS[identifier]?.rider ?? null;
    if (!rider) return null;
    const set = Number.isInteger(price?.[identifier]) && price[identifier] >= 0 ? price[identifier] : null;
    if (set === null || !(set < (rider.cost?.amount ?? 0))) return rider;
    return { ...rider, cost: { ...rider.cost, amount: set } };
  };
  return { talents, rowOf: (className, identifier) => (DH_FEATURE_RIDERS[identifier] ? { rider: riderOf(identifier) } : null) };
}

/**
 * **A FEL LASH THAT COSTS NO HATRED** (02's Demon Unleashed: *Fel Lash costs no Hatred*): the line priced
 * at 0 and open while the pool exists, the name of what made it free carried as `freeBy`. Every other line
 * is handed back as it was.
 *
 * @param {Array<object>} lines  `ridersFor`'s
 * @param {{freeBy?: string|null}} [o]
 * @returns {Array<object>}
 */
export function freeFelLash(lines = [], { freeBy = null } = {}) {
  if (!freeBy) return lines;
  return (lines ?? []).map(l => {
    if (l?.identifier !== FEL_LASH.identifier || l.reason?.key === "AZEROTH.Rider.Refused.NoPool") return l;
    return { ...l, cost: 0, spend: 0, available: true, reason: null, freeBy };
  });
}

/**
 * **WHETHER A BLOW IS ONE OF THE HUNTER'S WEAPON ATTACKS** (02's Bane of the Legion, Fel Lash and Mana Rend: *Your
 * weapon attacks*, *As part of a weapon attack*; the review's M3): struck with a weapon, and never an unarmed strike
 * (`rules/unarmed.mjs#isUnarmedStrike`, the one predicate). The attack door's on-hit call and the rider offer ask it.
 *
 * @param {{weaponId?: string|null, strike?: object|null}} o
 * @returns {boolean}
 */
export function dhWeaponAttack({ weaponId = null, strike = null } = {}) {
  return Boolean(weaponId) && !isUnarmedStrike(strike);
}

/**
 * **WHICH POOL OF A NAME IS THE DEMON HUNTER'S** (the review's M2; superseded for Energy by the lead's ruling of
 * 2026-11-22, D-1719 and D-1723: a Demon Hunter with a Rogue or a Chromatic Champion holds ONE merged Energy pool, held
 * by the first of the two classes, its `itemIds` naming both, and every write mirrored into the other entry): the pool
 * of that kind and name whose holder or member is the class item, else the only one, else the first. Null where none
 * is held.
 *
 * @param {Array<{itemId?: string|null, kind: string, name?: string|null}>} pools
 * @param {{kind?: string, name?: string, classId?: string|null}} o
 * @returns {object|null}
 */
export function dhPoolIn(pools = [], { kind = "power", name = "energy", classId = null } = {}) {
  const named = (Array.isArray(pools) ? pools : []).filter(p => p?.kind === kind && p.name === name);
  return named.find(p => classId && (p.itemId === classId || (p.itemIds ?? []).includes(classId))) ?? named[0] ?? null;
}

/**
 * Whether Fel Lash may ride this roll: every attack roll, Extra Attack's second included (02: *You may
 * use it on each attack you make, paying each time*). The only rider that does (D-770 rides the first).
 */
export const PER_ROLL_RIDERS = Object.freeze([FEL_LASH.identifier]);

/* ------------------------------------------------------------------ */
/*  Fel Surge                                                           */
/* ------------------------------------------------------------------ */

/** 02's Fel Surge (level 3): the feature's name, and the Actions it reaches (`hatred.mjs#FEL_SURGE_ACTIONS`). */
export const FEL_SURGE_FEATURE = "Fel Surge";
const FEL_SURGE_REACH = Object.freeze(["half", "action"]);

/**
 * **FEL SURGE'S LINES ON A SPELL'S DIALOG** (C64; the brief's *a stepper 0..tier ... chooser per point*): one
 * unticked line a point and a half - *add 1 to the spell's damage* or *add 1 to your Spell DC* - up to the tier,
 * each line a point the player chooses (MY READING: the dialog's lines are the stepper; the sheet phase may draw
 * them as one). A spell with no damage takes no damage points and one with no Test no DC points (C64 (b)). Where
 * the spell's Action is not a Half-Action or an Action, or no Hatred is held, ONE line is drawn, greyed, with its
 * reason. `castSpell` judges the ticked lines again through `hatred.mjs#felSurgePlan` before anything is paid.
 *
 * @param {{holds?: boolean, held?: number, tier?: number, action?: string|null, hasDamage?: boolean, hasTest?: boolean}} o
 * @returns {Array<object>}  `talentLines` rows, kind `felSurge`, each with its `part`
 */
export function felSurgeLines({ holds = false, held = 0, tier = 1, action = null, hasDamage = true, hasTest = true } = {}) {
  if (holds !== true || (!hasDamage && !hasTest)) return [];
  const h = whole(held);
  const closed = !FEL_SURGE_REACH.includes(action) ? "action" : h === 0 ? "none" : null;
  const line = (part, n, reason = null) => ({
    id: `talent-line-fel-surge${part ? `-${part}-${n}` : ""}`, identifier: part ? `fel-surge-${part}-${n}` : "fel-surge",
    name: FEL_SURGE_FEATURE, kind: "felSurge", part, amount: 1, left: h, available: reason === null,
    reason: reason ? `AZEROTH.DemonHunter.FelSurge.Refuse.${reason}` : null,
    doesKey: part === "dc" ? "AZEROTH.TalentLine.Does.felSurgeDc" : "AZEROTH.TalentLine.Does.felSurgeDamage"
  });
  if (closed) return [line(null, 0, closed)];
  const out = [];
  const points = Math.min(tierOf(tier), h);
  for (const part of ["damage", "dc"]) {
    if (part === "damage" ? !hasDamage : !hasTest) continue;
    for (let n = 1; n <= points; n++) out.push(line(part, n));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Mana Rend                                                           */
/* ------------------------------------------------------------------ */

/**
 * **WHAT MANA REND TAKES** (02: *the target loses Power equal to your Wisdom modifier, and at least 1, from
 * its Mana or any Power pool it holds. It takes 1 Fel damage for each point it could not lose*). The pool:
 * Mana where it holds one, else the Power pool holding the most (MY READING), else none. Pure: the GM's
 * client writes `change`.
 *
 * @param {Array<{itemId?: string|null, kind: string, name?: string|null, value: number}>} pools
 * @param {{wis?: number}} [o]
 * @returns {{amount: number, lost: number, shortage: number, pool: object|null, change: object|null}}
 */
export function manaRendPlan(pools = [], { wis = 0 } = {}) {
  const amount = Math.max(MANA_REND.min, int(wis));
  // Never the Death Knight's runes (the review's C7): a derived pool the rune door alone writes (D-943).
  const power = (Array.isArray(pools) ? pools : []).filter(p => p?.kind === "power" && p.name !== "runes" && Number.isFinite(Number(p.value)));
  const mana = power.find(p => p.name === "mana" || !p.name) ?? null;
  const pool = mana ?? [...power].sort((a, b) => whole(b.value) - whole(a.value) || String(a.itemId ?? "").localeCompare(String(b.itemId ?? "")))[0] ?? null;
  const held = whole(pool?.value);
  const lost = Math.min(amount, held);
  return {
    amount, lost, shortage: amount - lost, pool,
    change: pool && lost > 0 ? { itemId: pool.itemId ?? null, kind: "power", value: held - lost } : null
  };
}

/* ------------------------------------------------------------------ */
/*  Devour Soul                                                         */
/* ------------------------------------------------------------------ */

/**
 * **THE CREATURES A HUNTER HAS DAMAGED THIS ROUND** (Devour Soul: *a creature you damaged this round*):
 * the record the attack door keeps on the hunter, read for now. In a fight it is that fight's round; out
 * of one, a round of the world's clock (6 seconds).
 *
 * @param {object|null} record  `{combatId, round, time, uuids}`
 * @param {{combatId?: string|null, round?: number|null, time?: number}} now
 * @returns {string[]}
 */
export function struckThisRound(record, { combatId = null, round = null, time = 0 } = {}) {
  if (!record || typeof record !== "object") return [];
  const uuids = (Array.isArray(record.uuids) ? record.uuids : []).filter(u => typeof u === "string" && u);
  if (combatId) return record.combatId === combatId && int(record.round) === int(round) ? uuids : [];
  return !record.combatId && Number(time) - (Number(record.time) || 0) <= 6 ? uuids : [];
}

/**
 * The record with one more creature struck, a new round's record starting empty.
 *
 * @param {object|null} record
 * @param {string} uuid
 * @param {{combatId?: string|null, round?: number|null, time?: number}} now
 * @returns {{combatId: string|null, round: number|null, time: number, uuids: string[]}}
 */
export function markStruck(record, uuid, { combatId = null, round = null, time = 0 } = {}) {
  const kept = struckThisRound(record, { combatId, round, time });
  const uuids = [...new Set([...kept, ...(uuid ? [uuid] : [])])].sort();
  return { combatId: combatId || null, round: combatId ? int(round) : null, time: Number(time) || 0, uuids };
}

/**
 * **WHETHER A FALLEN CREATURE'S SOUL MAY BE DEVOURED** (02's Devour Soul), judged before the offer and
 * again at the press: damaged by the hunter this round, within the feet (D-732's footprints), a Reaction
 * left, not a construct, not devoured already, and not the hunter. A key under
 * `AZEROTH.DemonHunter.Devour.Refuse.`.
 *
 * The hunter at 0 Health devours nothing (the orchestrator's ruling on C8: refused in words, `zero`), judged before
 * the budget like every other refusal.
 *
 * @param {{struck?: boolean, feet?: number|null, reach?: number, reactionLeft?: boolean, kinds?: Iterable<string>, devoured?: boolean, self?: boolean, hunterHealth?: number}} o
 * @returns {null|"struck"|"far"|"reaction"|"soulless"|"devoured"|"self"|"zero"}
 */
export function devourRefusal({ struck = false, feet = null, reach = DEVOUR_SOUL.feet, reactionLeft = true, kinds = [], devoured = false, self = false, hunterHealth = 1 } = {}) {
  if (self) return "self";
  if (Number(hunterHealth) <= 0) return "zero";
  if (devoured) return "devoured";
  const set = new Set(kinds ?? []);
  if (DEVOUR_SOUL.refuses.some(k => set.has(k))) return "soulless";
  if (!struck) return "struck";
  if (feet === null || feet === undefined || !Number.isFinite(Number(feet)) || Number(feet) > Number(reach)) return "far";
  if (!reactionLeft) return "reaction";
  return null;
}

/** Devour Soul's Health: twice your tier plus your Wisdom modifier, and nothing below 0. */
export function devourHeal({ tier = 1, wis = 0, more = 0 } = {}) {
  return Math.max(0, 2 * tierOf(tier) + int(wis) + whole(more));
}

/** The Hatred a devoured soul gives: 2 for a demon's, none for any other. */
export function devourHatred(kinds = []) {
  return new Set(kinds ?? []).has("demon") ? DEVOUR_SOUL.demonHatred : 0;
}

/**
 * **WHAT THE GM'S CLIENT REFUSES OF A HUNTER'S ASK** (the review's C5: core checks only `QUERY_USER`, so the handler
 * judges the asker and the world itself): the asker owns the hunter; Mana Rend and Bane of the Legion need the
 * feature held and the creature on the hunter's record of who it damaged this round (`struckThisRound`, written by
 * the attack door before it asks); a soul marked devoured needs a hunter who can devour and a creature at 0 Health.
 * A reason, or null.
 *
 * @param {{act?: string, owner?: boolean, holdsFeature?: boolean, struck?: boolean, victimHealth?: number}} o
 * @returns {null|"owner"|"feature"|"struck"|"alive"|"act"}
 */
export function featureQueryRefusal({ act = null, owner = false, holdsFeature = false, struck = false, victimHealth = 1 } = {}) {
  if (owner !== true) return "owner";
  switch (act) {
    case "rend":
    case "bane":
      if (holdsFeature !== true) return "feature";
      return struck === true ? null : "struck";
    case "devoured":
      if (holdsFeature !== true) return "feature";
      return Number(victimHealth) > 0 ? "alive" : null;
    default:
      return "act";
  }
}

/** How near the hunter must stand to pick a thrown glaive up: within 5 feet of where it lies (MY READING). */
export const PICK_UP_FEET = 5;

/**
 * **WHY A THROWN GLAIVE CANNOT BE PICKED UP**, or null (07's Flame Crash: *A thrown glaive lies where it landed
 * until you pick it up or cast **Call the Glaives***; the review's C4): it lies away, on the scene the hunter's token
 * stands on, within `PICK_UP_FEET` of the hunter's footprint. A key under `AZEROTH.DemonHunter.PickUp.Refuse.`.
 *
 * @param {{away?: object|null, sceneId?: string|null, feet?: number|null}} o
 * @returns {null|"notAway"|"elsewhere"|"far"}
 */
export function pickUpRefusal({ away = null, sceneId = null, feet = null } = {}) {
  if (!away) return "notAway";
  if (!sceneId || away.sceneId !== sceneId) return "elsewhere";
  return feet !== null && feet !== undefined && Number.isFinite(Number(feet)) && Number(feet) <= PICK_UP_FEET + 1e-6 ? null : "far";
}

/* ------------------------------------------------------------------ */
/*  Hunter's Leap, Hunter's Stride                                      */
/* ------------------------------------------------------------------ */

/** Hunter's Leap's reach: 10 feet for each point of the Dexterity modifier, never less than 5 feet. */
export function huntersLeapFeet(dexMod = 0) {
  return Math.max(HUNTERS_LEAP.min, HUNTERS_LEAP.perPoint * int(dexMod));
}

/** Hunter's Stride's feet: 5 for each tier reached (10 at tier 2, 15 at 3, 20 at 4). */
export function huntersStrideFeet(tier = 1) {
  return HUNTERS_STRIDE.perTier * tierOf(tier);
}

/* ------------------------------------------------------------------ */
/*  Demon Unleashed                                                     */
/* ------------------------------------------------------------------ */

/**
 * **WHY DEMON UNLEASHED CANNOT BE USED**, or null: no Hatred held (C12, MY READING: at least 1), or the
 * shape already stands. A key under `AZEROTH.DemonHunter.Unleashed.Refuse.`.
 *
 * @param {{held?: number, unleashed?: boolean}} o
 * @returns {null|"empty"|"already"}
 */
export function unleashedRefusal({ held = 0, unleashed = false } = {}) {
  if (unleashed === true) return "already";
  return whole(held) < 1 ? "empty" : null;
}

/** The rounds the shape lasts: 1 for each Hatred spent, plus a talent's (Eternal Hunger, Phase 5). */
export function unleashedRounds(spent = 0, { more = 0 } = {}) {
  return Math.max(1, whole(spent) + whole(more));
}

/** The flying Speed the shape gives at this Fel (`felFor`'s): 240 at 10 or more, none below. */
export function unleashedFlying(fel = 0) {
  return whole(fel) >= DEMON_UNLEASHED.wingsAt ? DEMON_UNLEASHED.flying : null;
}

/** What the shape adds to Energy's turn refill: 2 more (5 in place of 3) at Fel 15 or more. */
export function unleashedRefillExtra({ unleashed = false, fel = 0 } = {}) {
  return unleashed === true && whole(fel) >= DEMON_UNLEASHED.refillAt ? DEMON_UNLEASHED.refill - DEMON_UNLEASHED.baseRefill : 0;
}

/**
 * **YOU GAIN NO HATRED WHILE UNLEASHED** (02): a rise refused, except I Have Prepared's own fill, a refund
 * and a GM's hand. A key under `AZEROTH.Hatred.Refuse.gain.` or null.
 *
 * @param {{unleashed?: boolean, source?: string|null, before?: number, after?: number}} o
 * @returns {null|"unleashed"}
 */
export function unleashedGainRefusal({ unleashed = false, source = null, before = 0, after = 0 } = {}) {
  if (unleashed !== true || !(int(after) > int(before))) return null;
  return DEMON_UNLEASHED.gainsAllowed.includes(source) ? null : "unleashed";
}

/* ------------------------------------------------------------------ */
/*  I Have Prepared                                                     */
/* ------------------------------------------------------------------ */

/** The Fel gained when the minute ends: half of (20 minus the Fel held when it was used), rounded up. */
export function preparedEndFel(start = 0) {
  return Math.ceil(Math.max(0, FEL_TRACK_TOP - Math.min(FEL_TRACK_TOP, whole(start))) / 2);
}

/** I Have Prepared's flag on the actor, read leniently: `{from, until?}` or null. */
export function preparedOf(flag) {
  if (!flag || typeof flag !== "object") return null;
  return Number.isFinite(Number(flag.from)) ? { from: Math.min(FEL_TRACK_TOP, whole(flag.from)) } : null;
}

/* ------------------------------------------------------------------ */
/*  The rest: Quiet the Whispers                                        */
/* ------------------------------------------------------------------ */

/** Quiet the Whispers' DC: 10 plus the Hatred held when the rest ended. */
export function quietWhispersDC(held = 0) {
  return QUIET_THE_WHISPERS.base + whole(held);
}

/**
 * Whether Quiet the Whispers rolls at this rest: Fel left to cancel, a rank taken, a use left of the rank's
 * once-a-Long-Rest count (`used` since the last Long Rest).
 *
 * @param {{fel?: number, rank?: number, used?: number}} o
 * @returns {boolean}
 */
export function quietWhispersRolls({ fel = 0, rank = 0, used = 0 } = {}) {
  return whole(fel) > 0 && whole(rank) > whole(used);
}

/* ------------------------------------------------------------------ */
/*  What the character's derived data reads                              */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE FEATURES ADD TO A CHARACTER'S DERIVED NUMBERS**, read once by `CharacterData`: Spectral
 * Sight's refused condition, Hunter's Stride's Speed part, and the shape's wings at its Fel. Nothing for a
 * character who holds none of them.
 *
 * @param {{features?: Iterable<string>, tier?: number, shapeKind?: string|null, fel?: number}} o
 * @returns {{immune: string[], speed: number, flying: number|null}}
 */
export function dhDerived({ features = [], tier = 1, shapeKind = null, fel = 0, wings = 0 } = {}) {
  const held = new Set(features ?? []);
  // 04's Wings of the Betrayer (Phase 5): *While you are in the demon's shape Demon Unleashed or Gift of the
  // Skull gives you, you have wings whatever your Fel Corruption* - 30 feet, 60 at rank 2 - and the greater of
  // that and Demon Unleashed's own 240 at Fel 10 or more.
  const own = shapeKind === DEMON_UNLEASHED.kind ? unleashedFlying(fel) : null;
  const talentWings = inDemonShape(shapeKind) ? wingsFeet(wings) : null;
  const flying = [own, talentWings].filter(v => Number(v) > 0);
  return {
    immune: held.has(SPECTRAL_SIGHT.feature) ? [...SPECTRAL_SIGHT.immune] : [],
    speed: held.has(HUNTERS_STRIDE.feature) ? huntersStrideFeet(tier) : 0,
    flying: flying.length ? Math.max(...flying) : null
  };
}
