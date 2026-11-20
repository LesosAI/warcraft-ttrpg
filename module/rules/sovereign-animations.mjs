/**
 * **WHAT THE SOVEREIGN LOOKS LIKE AND SOUNDS LIKE** (the San'layn and Sovereign plan's C14 and Phase 6;
 * D-723 to D-730 are the standing rules, `death-knight-animations.mjs` and `necromancer-animations.mjs`
 * the shape). Pure data and pure record builders, no Foundry imports. Three tables the animation tables
 * spread into their own, beside CORE's pool cues (`sovereign-core-animations.mjs`) -
 *
 *  - `SOV_SPELL_ANIMATIONS`: a row for each of the Sovereign's twelve tier 1 spells (07 §17, *Restricted
 *    Sovereign*; ten in the first batch and two in the second eighteen), into
 *    `animation-table.mjs#SPELL_ANIMATIONS`, whose census holds every tier 1 spell to a row and a reviewed
 *    direction (`tools/animation/directions.mjs`);
 *  - `SOV_EXPANDED_SPELL_ANIMATIONS`: a row for each of its forty-two spells above tier 1, into
 *    `spell-animation-expansion.mjs#EXPANDED_SPELL_ANIMATIONS`. The five borrowed spells (Drain Life,
 *    Siphon Life, Exsanguinate, Graveblight and Contagion) keep the rows they already play;
 *  - `SOV_FEATURE_ANIMATIONS`: the STATES the Sovereign's spells and features lay (a blood curse, the
 *    blood magic it wears, Blood Prison's bonds, the latch, the leash, the Blood Monarch's wings, the prey
 *    mark) and 02 §7's features and 04's talents whose doors write a record, into
 *    `animation-table.mjs#FEATURE_ANIMATIONS`.
 *
 * The grammar is the table's own: a row is `{cues, loop?|loops?}` or `{reason}`, **a cue fires on an
 * EVENT and a loop stands while the world holds its STATE** (D-729), so the reconciler ends a curse's
 * loop when its effect goes and no code here ends anything. A failed Casting Test never animates on any
 * trigger, a miss has no impact step and a Parry is not an attack (`rules/animation.mjs#plan`, D-756);
 * nothing is placed on a creature the record does not name (D-724 to D-726), and a condition's picture
 * waits for the creature's own failed Test (`resist`). **Every asset is a full leaf key held against
 * `tools/animation/assets.json`** (D-723), JB2A's or PSFX's: a Jinker's asset enters only through
 * `COMPARISONS` and the lead's pick (D-727). **Every cue carries a sound step.** **Every number is a
 * starting value**, to be tuned on the lead's review of rendered frames.
 *
 * The colours: blood made solid is a deep wet red (`SOV_BOLT`, `SOV_BLOOD`), shadow-drawn blood is red
 * over dark, and majesty is crimson with a little gold.
 */

import { PREY_FLAG, cleanPrey, preyActive } from "./prey.mjs";

/** An effect step. */
const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
/** A sound step. */
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
/** A cue; a feature's `effect` cue names the state it answers. */
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop; a feature's `effect` loop names the state it follows. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

/**
 * **THE SOVEREIGN'S RECOLOURS**, spread into `animation-table.mjs#FILTERS` beside the knight's and the
 * Necromancer's. A hue rotation on a coloured asset, a tint (which MULTIPLIES) on a near-white one.
 */
export const SOV_FILTERS = Object.freeze({
  /**
   * JB2A's orange fire bolt turned to a wet blood red: Bloodbolt and its kin. A TINT, which multiplies, so the orange
   * keeps its red channel and loses the rest (FIXC, O-482); the hue rotation it replaced (hue -25, saturate 0.45,
   * brightness 0.8) only darkened the dark-orange projectile that was here before.
   */
  SOV_BOLT: Object.freeze({ tint: "#ff3a3a", brightness: 1.15 }),
  /** A near-white pulse, ring or mist washed the deep red of blood. */
  SOV_BLOOD: Object.freeze({ tint: "#b3122e", brightness: 1.05 }),
  /** A blue mist, shimmer or swirl turned crimson. */
  SOV_BLOOD_B: Object.freeze({ hue: 140, saturate: 0.3, brightness: 0.75 }),
  /** Green eyes and motes turned to a red gaze. */
  SOV_GAZE_G: Object.freeze({ hue: -115, saturate: 0.35, brightness: 0.85 }),
  /** A near-white glow washed crimson-gold: majesty. */
  SOV_MAJESTY: Object.freeze({ tint: "#e0506a", brightness: 1.1 }),
  /** JB2A's dark-purple fear turned to a bruised crimson: the court's terror (the second eighteen, D-1391). */
  SOV_PURPLE: Object.freeze({ hue: 70, saturate: 0.2, brightness: 0.85 }),
  /** A pink charm turned to a deep rose: Mesmerize and Blood Bond (D-1391). */
  SOV_PINK: Object.freeze({ hue: 20, saturate: 0.35, brightness: 0.8 }),
  /**
   * JB2A's purple energy strands turned round to red and lifted (FIXC, O-482): the feeding stream (`vitae:feed`) was
   * the purple file under the knight's red tint, and a tint multiplies, so purple's dark red channel was all that was
   * left and the stream read nearly black - the black streak in Sanguine Draught's frame was this stream, which plays
   * on the same cast, and not the spell's own bolt.
   */
  SOV_STREAM: Object.freeze({ hue: 80, saturate: 0.25, brightness: 1.35 })
});

/* ------------------------------------------------------------------ */
/*  The keys and the records                                           */
/* ------------------------------------------------------------------ */

/**
 * **THE STATE KEYS NO ONE FEATURE OWNS** (D-729: a loop is state), which `rules/animation-records.mjs
 * #stateEntriesOf` names off the Sovereign's flags (`SOVEREIGN_STATE_NAMES` there): every blood curse,
 * and the blood magic the Sovereign's spells lay - Bleed for Me's bleeding, Royal Command's and Grant an
 * Audience's hold, and the spells the Sovereign wears (`sovereignOwn`). Kept apart from the spells'
 * identifiers, because a state is one table's or the other's (`animation-table.test.mjs`).
 */
export const BLOOD_CURSE_KEY = "blood-curse";
export const BLOOD_MAGIC_KEY = "sovereigns-blood-magic";
export const SOV_STATE_KEYS = Object.freeze([BLOOD_CURSE_KEY, BLOOD_MAGIC_KEY, "prey-mark"]);

/**
 * The states the blood magic row follows: a flag word each, or the identifier of the spell worn. The second
 * eighteen add five worn spells (Sanguine Barrier, Scent of Blood, Veil of Mist, Crimson Carapace and Hour of
 * the Court's flight with its Sanguine Shield) and two charms (`CHARM_STATES`).
 */
export const OWN_STATES = Object.freeze([
  "bloodbolt-ascension", "mantle-of-majesty", "majesty-unbound", "unfading-glory",
  "sanguine-barrier", "scent-of-blood", "veil-of-mist", "crimson-carapace", "hour-of-the-court"
]);
/** Mesmerize's Charmed (`sovereignCommand` kind `charm`) and Blood Bond's (`bloodBond`), each its own loop. */
export const CHARM_STATES = Object.freeze(["charm", "bloodBond"]);
export const QUIET_OWN = Object.freeze({
  "air-of-majesty": "a social Boon for ten minutes; its cast plays, and a glow standing in a parlour for that long would be noise",
  "read-the-supplicant": "a quiet Boon on Insight for ten minutes; its cast plays, and nothing about it is meant to be seen"
});

/**
 * **THE PREY MARK'S CUE** (02 §7's Hunt Mortal, Blood-Forged Claws' re-mark and Unending Pursuit's free
 * mark): written on the SAME update that sets the Sovereign's prey flag (`effects/sovereign-core.mjs
 * #markPrey`), so every client's `updateActor` hook plays it for itself (D-994's shape). The mark that
 * stands is a loop on the prey, read off the flag (`animation/records.mjs#stateSnapshot`).
 */
export const PREY_CUE_OPTION = "azerothPreyMark";
/**
 * **ONE KEY FOR THE MARK, WHICHEVER DOOR WROTE IT** - Hunt Mortal's Use, the Combat tab's Mark, the claws'
 * *Mark as prey* and Unending Pursuit's free mark all go through `markPrey`, so the cue rides the write and
 * the Use cards that call it play nothing of their own (a second cue would play one mark twice). The
 * standing mark is named the same (`PREY_MARK_SOURCE`), so the cue and the loop are one row.
 */
export const PREY_MARK_KEY = "prey-mark";
export const PREY_MARK_SOURCE = "Prey Mark";
const PREY_WAYS = Object.freeze(["hunt", "claws", "pursuit"]);

const idOf = value => (typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null);
const refOf = raw => {
  const tokenId = idOf(raw?.tokenId);
  return tokenId ? { sceneId: idOf(raw?.sceneId), tokenId } : null;
};

/**
 * One prey mark's cue, cleaned, or null with no Sovereign token: who marked, the creature marked and
 * which door marked it.
 *
 * @param {{holder?: object|null, prey?: object|null, way?: string}} o
 */
export function preyCue({ holder = null, prey = null, way = "hunt" } = {}) {
  return cleanPreyCue({ sceneId: holder?.sceneId ?? null, tokenId: holder?.tokenId ?? null, prey, way });
}

/** A prey cue as an operation carried it, cleaned, or null. */
export function cleanPreyCue(raw) {
  const tokenId = idOf(raw?.tokenId);
  if (!tokenId) return null;
  const prey = refOf(raw?.prey);
  return {
    sceneId: idOf(raw?.sceneId), tokenId,
    prey: prey && prey.tokenId !== tokenId ? prey : null,
    way: PREY_WAYS.includes(raw?.way) ? raw.way : "hunt"
  };
}

/**
 * **THE RECORDS AN ACTOR UPDATE'S OPTIONS IMPLY**: the prey mark's `use` record, at the Sovereign, its
 * one target the creature marked. Any other update implies nothing.
 *
 * @param {object} options  an `updateActor` hook's operation options
 * @returns {object[]}
 */
export function sovereignAnimationRecords(options = {}) {
  const mark = cleanPreyCue(options?.[PREY_CUE_OPTION] ?? null);
  if (!mark) return [];
  const source = { sceneId: mark.sceneId, tokenId: mark.tokenId };
  return [{
    trigger: "use", kind: "feature", contentVisible: true, sceneId: mark.sceneId, identifier: PREY_MARK_KEY,
    casting: false, success: true, area: null, source, targets: mark.prey ? [mark.prey] : [], steps: [], risen: [], hold: null
  }];
}

/**
 * **THE PREY MARK THAT STANDS** (02 §7's Hunt Mortal: *The mark ends when your prey dies or the fight
 * ends. Outside a fight ... the mark lasts 1 minute*), read off the Sovereign's own prey flag by
 * `rules/prey.mjs#preyActive` - the one judgement CORE's doors use - so the loop on the prey stands
 * exactly while the mark does. The prey's token is the one the flag recorded; a caller resolves a mark
 * made on an actor alone to its token on the viewed scene. Null where no mark stands.
 *
 * @param {unknown} raw  the Sovereign's `flags["azeroth-rpg"].prey`
 * @param {{liveCombats?: string[], now?: number, preyDead?: boolean}} [facts]
 * @returns {{actorUuid: string, sceneId: string|null, tokenId: string|null, source: string}|null}
 */
export function preyMarkState(raw, { liveCombats = [], now = 0, preyDead = false } = {}) {
  const mark = cleanPrey(raw);
  if (!mark || !preyActive(mark, { liveCombats, now, preyDead })) return null;
  const parts = String(mark.tokenUuid ?? "").split(".");
  const at = parts.lastIndexOf("Token");
  const sc = parts.lastIndexOf("Scene");
  return {
    actorUuid: mark.actorUuid,
    sceneId: sc >= 0 ? idOf(parts[sc + 1]) : null,
    tokenId: at >= 0 ? idOf(parts[at + 1]) : null,
    source: PREY_MARK_SOURCE
  };
}
export { PREY_FLAG };

/**
 * **THE CARDS A SOVEREIGN DOOR POSTS THAT ARE NO USE CARD** (`effects/sovereign-features.mjs#card`, kind
 * `sovereign`): each names what happened by one flag, and this reads which cue it plays - the key, the
 * trigger, and which uuid on the card names the creature it happened to (`target`). A card naming none of
 * them plays nothing. Three are events no one feature's Use owns, kept apart by their colon as `rune:` is:
 * a blood curse thrown off (`curse:defied`, whatever the curser holds), Blood Prison's blood tearing at its
 * prisoner (`blood-prison:tear`, at the turn's end) and the latch's drain (`latch:drain`, at the turn's
 * start).
 */
export const CURSE_DEFIED_KEY = "curse:defied";
export const PRISON_TEAR_KEY = "blood-prison:tear";
export const LATCH_DRAIN_KEY = "latch:drain";
/**
 * **THE SECOND EIGHTEEN'S EVENTS** (07 §17; D-1392): Burden of Sin striking its bearer back
 * (`effects/sovereign-spells.mjs#strikeBurden`, on a `burdenStruck` card), Hemoplague's spread at the
 * carrier's turn start (`hemoplagueSpread`, a card naming each creature it reached by token uuid), and
 * Summons to Court's pull, which the one forced-movement door records on the displacement under
 * `SUMMONS_PULL_KEY` - a key of its own, because a feature row may never use a spell's identifier.
 */
export const BURDEN_STRUCK_KEY = "burden:struck";
export const HEMOPLAGUE_SPREAD_KEY = "hemoplague:spread";
export const SUMMONS_PULL_KEY = "summoned-to-court";
/**
 * **SHROUD OF SORROW'S TICK** (07 §17: *Each enemy that starts its turn within 10 feet of you takes Shadow damage
 * equal to half your Charisma modifier ... You regain 1 Health for each enemy that takes damage from this spell*;
 * FIXC, O-482): an area tick cued nothing anywhere in the system, so the Shroud's standing loop carried its whole
 * picture. The tick lands on the active GM inside `AzerothCombat#_areaTicks`, and the drain door posts a
 * `shroudTick` card spoken from the caster naming the enemy struck, which every client's director plays. Kept to the
 * Shroud's own tick: a generic area-tick cue is a cue on every area spell in 07, a larger change than this one.
 */
export const SHROUD_TICK_KEY = "shroud:tick";
export const SOV_EVENT_KEYS = Object.freeze([CURSE_DEFIED_KEY, PRISON_TEAR_KEY, LATCH_DRAIN_KEY, BURDEN_STRUCK_KEY, HEMOPLAGUE_SPREAD_KEY, SUMMONS_PULL_KEY, SHROUD_TICK_KEY]);
export const SOV_CARD_CUES = Object.freeze({
  tooBeautiful: Object.freeze({ key: "too-beautiful-to-die", trigger: "hold", target: "self" }),
  royalDue: Object.freeze({ key: "royal-due", trigger: "use", target: "targetUuid" }),
  tastingBite: Object.freeze({ key: "tasting-bite", trigger: "use", target: "targetUuid" }),
  latchOn: Object.freeze({ key: "latch-on", trigger: "use", target: "targetUuid" }),
  latchTick: Object.freeze({ key: LATCH_DRAIN_KEY, trigger: "use", target: "targetUuid" }),
  prison: Object.freeze({ key: PRISON_TEAR_KEY, trigger: "use", target: null }),
  curseThrownOff: Object.freeze({ key: CURSE_DEFIED_KEY, trigger: "use", target: "source" }),
  burdenStruck: Object.freeze({ key: BURDEN_STRUCK_KEY, trigger: "use", target: "self" }),
  hemoplagueSpread: Object.freeze({ key: HEMOPLAGUE_SPREAD_KEY, trigger: "use", target: "targetUuids", list: true }),
  shroudTick: Object.freeze({ key: SHROUD_TICK_KEY, trigger: "use", target: "targetUuid" })
});

/**
 * Which cue a `sovereign` card plays, or null: its first flag in `SOV_CARD_CUES`' order that is set, and
 * the uuid on the card naming its creature (null where the cue is the speaker's alone). A cue whose spec is a
 * `list` names every creature it reached in `targetUuids`.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @returns {{key: string, trigger: string, self: boolean, targetUuid: string|null, targetUuids?: string[]}|null}
 */
export function sovereignCardCue(flags = {}) {
  if (flags?.kind !== "sovereign") return null;
  for (const [flag, spec] of Object.entries(SOV_CARD_CUES)) {
    if (!flags[flag]) continue;
    if (spec.list) {
      const list = Array.isArray(flags[spec.target]) ? flags[spec.target].filter(u => typeof u === "string" && u) : [];
      return { key: spec.key, trigger: spec.trigger, self: false, targetUuid: null, targetUuids: [...new Set(list)] };
    }
    const uuid = spec.target && spec.target !== "self" && typeof flags[spec.target] === "string" && flags[spec.target] ? flags[spec.target] : null;
    return { key: spec.key, trigger: spec.trigger, self: spec.target === "self", targetUuid: uuid };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Shared looks                                                       */
/* ------------------------------------------------------------------ */

const WET = "psfx.cantrips.acid-splash.v1";
const SLASH = "psfx.impacts.slashing.v1";
const BLUNT = "psfx.impacts.bludgeoning.v1";
const NECROTIC = "psfx.impacts.magicaleffects.necrotic";
const SWOOSH = "psfx.weapon-swooshes.necrotic.v1.group01";
const STRANDS = "psfx.ranged-magic.generic.energy-strands.001";
const PROJECTILE = "psfx.ranged-magic.generic.projectile.ranged.001";
const WHISPER_F = "psfx.incantations.whispers.fem.001.forward.standard.004";
const WHISPER_M = "psfx.incantations.whispers.masc.001.forward.standard.006";
const HARM = "psfx.incantations.feminine.001.demonic.harm.007";
const HELP = "psfx.incantations.feminine.001.demonic.help.008";
const SHIELD = "psfx.1st-level-spells.shield-spell.intro.v1.003";
const WINGS = "psfx.creature.movement.flight.wings.small";
const BITE = "psfx.consumables.food-and-drink.consume.food.bite.soft.001";
const SWALLOW = "psfx.consumables.food-and-drink.consume.food.swallow.001";
const SIP = "psfx.consumables.food-and-drink.consume.drink.sip.polite.001";
const RUNE_SOUND = "psfx.magic-signs.rune.v1.abjuration.complete";
const CIRCLE_SOUND = "psfx.magic-signs.circle.v1.abjuration.complete";
const BOON = "psfx.conditions.boon.002.01";
const TOLL = "psfx.cantrips.toll-the-dead.v1.002";
const ROYAL_HELP = "psfx.incantations.masculine.001.demonic.help.002";
const VEIL_SOUND = "psfx.2nd-level-spells.misty-step.v1.intro.generic";

/**
 * The blood bolt (FIXC, O-482): JB2A's orange fire bolt under `SOV_BOLT`'s red tint. It was the dark-orange projectile,
 * which no frame ever showed - Bloodbolt's shot was blank in every run and a probe paused it at 0.75 to 1.36 s of 1.83
 * with nothing drawn - so the blood spells' bolt read as nothing at the table either.
 */
const BOLT = "jb2a.fire_bolt.orange";
const SPLASH = "jb2a.liquid.splash02.red";
const SPLASH_SIDE = "jb2a.liquid.splash_side02.red";
const DROP = "jb2a.markers.drop.red.01";
const DROPS = "jb2a.markers.drop.red.03";
const RUNE = "jb2a.magic_signs.rune.evocation.complete.red";
const CIRCLE = "jb2a.magic_signs.circle.02.evocation.complete.dark_red";
const CHAIN = "jb2a.markers.chain.standard.complete.02.red";
const STRAND = "jb2a.energy_strands.range.standard.purple.01";
const INFLOW = "jb2a.extras.tmfx.inflow.circle.01";
const OUTPULSE = "jb2a.extras.tmfx.outpulse.circle.01.normal";
const MAJESTY = "jb2a.on_token_buff.001.001.purplered";
const FEAR = "jb2a.markers.fear.dark_purple.02";

/** The sigil at the Sovereign's hand as a blood spell is spoken: what a cast plays before its Test. */
const sigil = (sound = WHISPER_M, scale = 0.55) => [fx(RUNE, { place: "source", scale }), snd(sound, { volume: 0.45 })];

/**
 * **A BOLT OF BLOOD MADE SOLID** (R8: Physical, meets Armor Points): a wet red bolt from the Sovereign to
 * the target and a splash of blood where it lands, with a wet impact.
 */
function boltCue({ scale = 0.9, extra = [] } = {}) {
  return cue("cast", [
    fx(BOLT, { place: "source>target", travel: "stretch", scale, filter: "SOV_BOLT" }),
    snd(PROJECTILE, { volume: 0.5 }),
    fx(SPLASH, { place: "target", scale: 0.7, waitFor: "travel", overlap: -150 }),
    snd(WET, { volume: 0.6, waitFor: "travel", overlap: -150 }),
    ...extra
  ]);
}

/** A curse's picture on the creature that FAILED its Test, and nothing before it. */
function curseRow(asset, sound, options = {}, { cast = sigil() } = {}) {
  return Object.freeze({
    cues: [
      cue("cast", cast),
      cue("resist", [fx(asset, { place: "resisted", scale: 0.85, ...options }), snd(sound, { volume: 0.55 })])
    ]
  });
}

/** A brief look at the Sovereign alone: a spell worn, a sense or a rite with no target recorded. */
function selfRow(asset, sound, options = {}) {
  return Object.freeze({ cues: [cue("cast", [fx(asset, { place: "source", scale: 0.9, ...options }), snd(sound, { volume: 0.5 })])] });
}

/**
 * **A RING OF BLOOD ACROSS THE CARD'S OWN RADIUS AT THE SOVEREIGN** (a self-centred area, D-728): the
 * ring, and a splash on each creature the card records.
 */
function ringRow({ sound = HARM, extra = [], resist = null } = {}) {
  return Object.freeze({
    cues: [
      cue("cast", [
        fx(OUTPULSE, { place: "source", area: 1, filter: "SOV_BLOOD" }),
        snd(sound, { volume: 0.55 }),
        ...extra
      ]),
      ...(resist ? [resist] : [])
    ]
  });
}

/** The Bleeding a failure lays: blood drops on the creature that failed, with a cut. */
const bleedResist = (scale = 0.7) => cue("resist", [fx(DROPS, { place: "resisted", scale }), snd(SLASH, { volume: 0.45 })]);

/* ------------------------------------------------------------------ */
/*  The ten tier 1 spells                                              */
/* ------------------------------------------------------------------ */

export const SOV_SPELL_ANIMATIONS = Object.freeze({
  // A wet red bolt and a splash where it lands; the Bleeding 1 is the condition's own.
  bloodbolt: { cues: [boltCue()] },
  // The decrees: the sigil at the cast, the curse only on the creature that failed.
  "decree-of-frailty": curseRow("jb2a.condition.curse.01.004.red", NECROTIC),
  "leaden-decree": curseRow(CHAIN, BLUNT, { scale: 0.75 }),
  // The cut opens on the creature that failed; the Bleeding 3 is the condition's.
  "bleed-for-me": curseRow(SPLASH, SLASH, { scale: 0.7 }, { cast: sigil(WHISPER_F, 0.5) }),
  // A crimson shimmer over the Sovereign as the temporary Health lands.
  "veil-of-majesty": selfRow(MAJESTY, SHIELD, { scale: 1 }),
  // Red eyes at the Sovereign at the cast; the leash only on the creature that failed.
  "captivating-gaze": curseRow(CHAIN, WHISPER_F, { scale: 0.7, opacity: 0.85 }, {
    cast: [fx("jb2a.eyes.01.dark_green.single", { place: "source", scale: 0.55, filter: "SOV_GAZE_G" }), snd(WHISPER_F, { volume: 0.4 })]
  }),
  // A crimson mist at the Sovereign as it steps toward its prey (the door displaces the token itself).
  "royal-approach": selfRow("jb2a.misty_step.01.blue", "psfx.2nd-level-spells.misty-step.v1.complete.generic", { scale: 1, filter: "SOV_BLOOD_B" }),
  // A drop of blood at the Sovereign's lips.
  "taste-of-lineage": selfRow(DROP, SIP, { scale: 0.5 }),
  // A sealing sigil at the Sovereign's hand; the sealed thing is nothing the card records on the board.
  "royal-seal": selfRow(RUNE, RUNE_SOUND, { scale: 0.5 }),
  // A few gold glints at the Sovereign.
  "air-of-majesty": selfRow("jb2a.glint.yellow.few", BOON, { scale: 0.8 }),

  /* ---- the second eighteen's tier 1 (07 §17; D-1393) ---- */
  // A crimson ward closing round the Sovereign; the barrier that stands is the blood magic's own loop.
  "sanguine-barrier": selfRow("jb2a.shield.01.intro.blue", SHIELD, { scale: 1.1, filter: "SOV_BLOOD_B" }),
  // A red gaze at the Sovereign and a faint red pulse round it as it scents the blood. Nothing is drawn on the
  // creatures it finds: their pings are the caster's alone (`effects/sovereign-spells.mjs#scentLands`).
  "scent-of-blood": {
    cues: [cue("cast", [
      fx("jb2a.eyes.01.dark_green.single", { place: "source", scale: 0.55, filter: "SOV_GAZE_G" }),
      fx(OUTPULSE, { place: "source", scale: 1.8, filter: "SOV_BLOOD", opacity: 0.6, delay: 150 }),
      snd(WHISPER_F, { volume: 0.4 })
    ])]
  }
});

/* ------------------------------------------------------------------ */
/*  The twenty-six above tier 1                                        */
/* ------------------------------------------------------------------ */

export const SOV_EXPANDED_SPELL_ANIMATIONS = Object.freeze({
  /* ---- tier 2 ---- */
  // The bolt, and a dark red ring at the target as it splashes on those beside it.
  "twilight-bloodbolt": {
    cues: [boltCue({ extra: [fx(OUTPULSE, { place: "target", scale: 1.6, filter: "SOV_BLOOD", waitFor: "travel", overlap: -100 })] })]
  },
  // A bite at the creature touched and its blood drawn back into the Sovereign.
  "sovereigns-kiss": {
    cues: [cue("cast", [
      fx("jb2a.bite.200px.red", { place: "target", scale: 0.7 }),
      snd(BITE, { volume: 0.6 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 200 }),
      snd(SWALLOW, { volume: 0.5, delay: 450 })
    ])]
  },
  "overawe": curseRow("jb2a.markers.fear.dark_purple.01", WHISPER_M),
  // Blood chains close on the creature that failed, with a wet clank.
  "shackles-of-the-court": curseRow(CHAIN, BLUNT, { scale: 0.85 }, {
    cast: [fx(RUNE, { place: "source", scale: 0.55 }), snd(WET, { volume: 0.4 })]
  }),
  // A red shimmer over the Sovereign as the blow arrives.
  "mirror-of-self": selfRow("jb2a.shimmer.01.blue", SHIELD, { scale: 1.2, filter: "SOV_BLOOD_B" }),
  // The sigil and the beat of wings at the Sovereign, and the swarm wheeling on the prey's area while the
  // Sustain is held and the Region stands. The door lays the Region before the card exists, so a `region` cue
  // could never prove its cast (`records.mjs#castParts`) and the loop carries the picture (D-1276).
  "swarming-shadows": {
    cues: [
      cue("cast", [fx(RUNE, { place: "source", scale: 0.55 }), snd(WHISPER_F, { volume: 0.45 }), snd(WINGS, { volume: 0.5, delay: 200 })])
    ],
    loop: loop("sustain-region", [fx("jb2a.bats.loop.01.red", { place: "region", area: 1, filter: "SHADOW_R", opacity: 0.75 })])
  },
  // A blood circle under the Sovereign as the oath is sworn.
  "oath-of-fealty": selfRow(CIRCLE, CIRCLE_SOUND, { scale: 1, below: true }),
  // A red mist at the Sovereign as the herald steps out of it.
  "royal-herald": selfRow("jb2a.smoke.puff.ring.01.white", "psfx.incantations.masculine.001.reverb.summon.003", { scale: 1, filter: "SOV_BLOOD" }),
  "read-the-supplicant": selfRow("jb2a.eyes.01.dark_green.few", WHISPER_F, { scale: 0.6, filter: "SOV_GAZE_G" }),

  /* ---- tier 3 ---- */
  // Keleseth's lance: a dark bolt to the target and a shadowed impact.
  "shadow-lance": {
    cues: [cue("cast", [
      fx("jb2a.eldritch_blast.purple", { place: "source>target", travel: "stretch", filter: "DARK" }),
      snd(SWOOSH, { volume: 0.6 }),
      fx("jb2a.impact.004.blue", { place: "target", scale: 0.8, filter: "SHADOW_B", waitFor: "travel", overlap: -200 }),
      snd(NECROTIC, { volume: 0.55, waitFor: "travel", overlap: -200 })
    ])]
  },
  "edict-of-denial": curseRow("jb2a.condition.curse.01.010.red", NECROTIC),
  // A ring of blood at the Sovereign across its own 10 feet; the Bleeding only on each that failed.
  "tithe-of-the-many": ringRow({
    extra: [fx("jb2a.template_circle.symbol.normal.drop.red", { place: "source", area: 0.8, opacity: 0.8, delay: 150 })],
    resist: bleedResist()
  }),
  // The Sovereign rises on blood wings and every enemy in the 20 feet is splashed (Bloodbolt Whirl).
  "bloodbolt-ascension": ringRow({
    sound: WINGS,
    extra: [
      fx("jb2a.swirling_feathers.outburst.01.textured", { place: "source", scale: 1.3, filter: "SOV_BLOOD" }),
      fx(SPLASH, { place: "targets", scale: 0.6, delay: 300 }),
      snd(WET, { volume: 0.55, delay: 300 })
    ]
  }),
  "edict-of-stillness": curseRow(CHAIN, BLUNT, { scale: 0.9 }, {
    cast: [fx(RUNE, { place: "source", scale: 0.6 }), snd(WET, { volume: 0.4 })]
  }),
  "mantle-of-majesty": selfRow(MAJESTY, SHIELD, { scale: 1.25 }),
  // Bats lift from the Sovereign.
  "eyes-of-the-swarm": selfRow("jb2a.bats.complete.01.red", WINGS, { scale: 1, filter: "SHADOW_R" }),
  // The sigil at the cast; a charm's hearts only on the creature that failed.
  "royal-command": curseRow("jb2a.markers.heart.pink.02", WHISPER_F, { scale: 0.6 }),
  "grant-an-audience": curseRow("jb2a.markers.simple.001.complete.001.red", WHISPER_F, { scale: 0.6 }),

  /* ---- tier 4 ---- */
  // A blood circle under the Sovereign and majesty rising over it.
  "majesty-unbound": {
    cues: [cue("cast", [
      fx(CIRCLE, { place: "source", scale: 1.3, below: true }),
      fx(MAJESTY, { place: "source", scale: 1.3, delay: 200 }),
      snd("psfx.incantations.masculine.001.demonic.help.002", { volume: 0.55 })
    ])]
  },
  // The crown's sign on the placed ground; the curse only on each creature that failed.
  "edict-of-the-crown": {
    cues: [
      cue("region", [
        fx("jb2a.template_circle.symbol.normal.drop.red", { place: "region", area: 0.9, opacity: 0.85 }),
        snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.55 })
      ]),
      cue("resist", [fx("jb2a.condition.curse.01.016.red", { place: "resisted", scale: 0.85 }), snd(NECROTIC, { volume: 0.5 })])
    ]
  },
  // A torrent of blood along the placed line with a wet crash; Prone and Bleeding are each failure's.
  "crimson-cascade": {
    cues: [
      cue("region", [
        fx("jb2a.breath_weapons.acid.line.green", { place: "region-line", travel: "stretch", filter: "SOV_GAZE_G" }),
        snd(WET, { volume: 0.7 }),
        snd(BLUNT, { volume: 0.5, delay: 200 })
      ]),
      bleedResist(0.8)
    ]
  },
  // A deep bite at the held creature, its blood drawn into the Sovereign, and a red inflow there.
  "embrace-of-the-vampyr": {
    cues: [cue("cast", [
      fx("jb2a.bite.400px.red", { place: "target", scale: 0.8 }),
      snd(BITE, { volume: 0.7 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 250 }),
      fx(INFLOW, { place: "source", scale: 1.1, filter: "SOV_BLOOD", delay: 550 }),
      snd(SWALLOW, { volume: 0.6, delay: 550 })
    ])]
  },
  "gaze-from-the-throne": selfRow("jb2a.eyes.01.dark_green.many", WHISPER_F, { scale: 0.7, filter: "SOV_GAZE_G" }),

  /* ---- tier 5 ---- */
  // A great ring of blood at the Sovereign across its 90 feet; Bleeding only on each that failed.
  "the-crimson-tithe": ringRow({
    sound: "psfx.incantations.masculine.002.demonic.harm.004",
    extra: [fx("jb2a.template_circle.symbol.normal.drop.red", { place: "source", scale: 2.5, opacity: 0.8, delay: 200 })],
    resist: bleedResist(0.8)
  }),
  // The heart's blood torn out of the creature touched: a splash, a spray beside it and a wet tearing;
  // the Stunned is the failure's own.
  "aortic-unraveling": {
    cues: [cue("cast", [
      fx(SPLASH, { place: "target", scale: 1 }),
      fx(SPLASH_SIDE, { place: "target", scale: 0.8, delay: 120 }),
      snd(WET, { volume: 0.7 }),
      snd(SLASH, { volume: 0.55, delay: 120 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 350 })
    ])]
  },
  // A blood circle and a crimson-gold glory over the Sovereign.
  "unfading-glory": {
    cues: [cue("cast", [
      fx("jb2a.magic_signs.circle.02.evocation.complete.red", { place: "source", scale: 1.4, below: true }),
      fx("jb2a.healing_generic.400px.yellow", { place: "source", scale: 0.9, filter: "SOV_MAJESTY", delay: 250 }),
      snd("psfx.conditions.boon.004.01", { volume: 0.55 })
    ])]
  },

  /* ---- the second eighteen above tier 1 (07 §17; D-1393) ---- */
  /* tier 2 */
  // Blood claws rake the creature touched with a wet tearing (R8: Physical, so it lands wet); the Bleeding and the
  // Bane are the failure's, and the drops wait for it.
  // The claws are drawn at 1.4 of the creature and at half speed (FIXC, O-482): at 0.8 the 200px file put 80 pixels
  // of claw on a 100-pixel token, and the rake shows only in the file's first 0.6 s, which Sequencer had already
  // played through by the time the file was ready (a probe read 0.43 to 0.72 s gone at the first drawn frame).
  "delirious-slash": {
    cues: [
      cue("cast", [
        fx("jb2a.claws.200px.red", { place: "target", scale: 1.4, speed: 0.5 }),
        snd(SLASH, { volume: 0.55 }),
        fx(SPLASH, { place: "target", scale: 0.7, delay: 150 }),
        snd(WET, { volume: 0.55, delay: 150 })
      ]),
      bleedResist()
    ]
  },
  // The sigil at the cast; blood chains only on the creature that failed. The pull itself plays on the
  // displacement (`summoned-to-court`), the Slowed is the condition's.
  "summons-to-court": curseRow(CHAIN, BLUNT, { scale: 0.75 }),
  // The sigil and a dark command at the cast; the court's terror on the placed point, and a crimson fear only on
  // each creature that failed. Every enemy makes a Test first, so nothing is drawn on them at the cast.
  "incite-terror": {
    cues: [
      cue("cast", sigil(HARM, 0.6)),
      cue("region", [
        fx("jb2a.template_circle.symbol.normal.fear.dark_purple", { place: "region", area: 0.9, filter: "SOV_PURPLE", opacity: 0.85 }),
        snd("psfx.1st-level-spells.dissonant-whispers.v1.002", { volume: 0.55 })
      ]),
      cue("resist", [fx(FEAR, { place: "resisted", scale: 0.7, filter: "SOV_PURPLE" }), snd(WHISPER_M, { volume: 0.45 })])
    ]
  },
  "wracking-pain": curseRow("jb2a.condition.curse.01.006.red", "psfx.cantrips.toll-the-dead.rasping-whispers.001"),
  // A crimson mist rising round the Sovereign; the veil that stands is the blood magic's own loop.
  "veil-of-mist": selfRow("jb2a.smoke.puff.ring.01.white", VEIL_SOUND, { scale: 1.2, filter: "SOV_BLOOD" }),
  // A red gaze at the Sovereign; a charm's rose only on the creature that failed.
  "mesmerize": curseRow("jb2a.markers.heart.pink.01", WHISPER_F, { scale: 0.6, filter: "SOV_PINK" }, {
    cast: [fx("jb2a.eyes.01.dark_green.single", { place: "source", scale: 0.55, filter: "SOV_GAZE_G" }), snd(WHISPER_F, { volume: 0.4 })]
  }),

  /* tier 3 */
  // A dark pulse rolling out across the Shroud's own 10 feet, and a dark mist standing round the Sovereign while the
  // Sustain is held. The area IS the caster's token, so the card places no Region and the layers carry their own
  // diameter (`sizeFt`, twice the radius).
  "shroud-of-sorrow": {
    cues: [cue("cast", [
      fx(OUTPULSE, { place: "source", sizeFt: 20, filter: "DARK" }),
      snd(TOLL, { volume: 0.5 })
    ])],
    loop: loop("sustain-self", [
      fx("jb2a.darkness.black", { place: "holder", sizeFt: 20, below: true, opacity: 0.4 }),
      fx(DROP, { place: "holder", scale: 0.4, opacity: 0.6 })
    ])
  },
  "burden-of-sin": curseRow("jb2a.condition.curse.01.012.red", NECROTIC),
  "edict-of-silence": curseRow("jb2a.markers.mute.dark_red.03", WHISPER_M, { scale: 0.7 }),
  // Blood plates closing over the Sovereign with a heavy clank; the carapace that stands is the blood magic's loop.
  "crimson-carapace": {
    cues: [cue("cast", [
      fx("jb2a.shield_themed.above.molten_earth.01.orange", { place: "source", scale: 1.2, filter: "SOV_BOLT" }),
      snd(SHIELD, { volume: 0.5 }),
      snd(BLUNT, { volume: 0.35, delay: 200 })
    ])]
  },
  // The bleeding creature's blood torn out of it and flung across the gap into the Sovereign: a splash at the
  // creature and a bolt of blood from it to the Sovereign. CORE's feeding stream (`vitae:feed`) plays the Vitae's
  // strand and gulp on the same cast, so this draws the spell's reach and never a second pool cue.
  "sanguine-draught": {
    cues: [cue("cast", [
      fx(SPLASH, { place: "target", scale: 0.55 }),
      snd(WET, { volume: 0.4 }),
      fx(BOLT, { place: "target>source", travel: "stretch", scale: 0.8, filter: "SOV_BOLT", delay: 150 }),
      snd(PROJECTILE, { volume: 0.45, delay: 150 })
    ])]
  },

  /* tier 4 */
  // The sigil at the cast; a wet burst of blood only on the creature that failed. The spread plays at each turn's
  // start (`hemoplague:spread`), the curse's own loop stands.
  "hemoplague": curseRow(SPLASH, SLASH, { scale: 0.75 }, { cast: sigil(WHISPER_F, 0.6) }),
  // The sigil and a splash of blood on each creature the card records (every one takes the blow, half on a pass),
  // a ring of blood on the placed ground, and drops only on each that failed.
  "blood-wound": {
    cues: [
      cue("cast", [
        fx(RUNE, { place: "source", scale: 0.6 }),
        snd(WHISPER_M, { volume: 0.4 }),
        fx(SPLASH, { place: "targets", scale: 0.6, delay: 250 }),
        snd(WET, { volume: 0.6, delay: 250 })
      ]),
      cue("region", [
        fx("jb2a.template_circle.symbol.normal.drop.red", { place: "region", area: 0.9, opacity: 0.85 }),
        snd(WET, { volume: 0.6 })
      ]),
      bleedResist(0.75)
    ]
  },
  // A bond of blood drawn between the creature touched and the Sovereign, and a rose on it; the bond that stands
  // is the blood magic's own loop.
  "blood-bond": {
    cues: [cue("cast", [
      fx("jb2a.markers.heart.pink.02", { place: "target", scale: 0.6, filter: "SOV_PINK" }),
      snd(HELP, { volume: 0.45 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 200 })
    ])]
  },

  /* tier 5 */
  // The sigil and a splash on each creature the card records, the cauldron boiling on the placed ground, and drops
  // only on each that failed.
  "cauldron-of-blood": {
    cues: [
      cue("cast", [
        fx(RUNE, { place: "source", scale: 0.7 }),
        snd("psfx.incantations.masculine.002.demonic.harm.004", { volume: 0.5 }),
        fx(SPLASH, { place: "targets", scale: 0.6, delay: 300 })
      ]),
      cue("region", [
        fx("jb2a.template_circle.symbol.normal.drop.red", { place: "region", area: 1, opacity: 0.85 }),
        fx("jb2a.bubble.002.002.complete.blue", { place: "region", area: 0.6, filter: "SOV_BLOOD_B", delay: 200 }),
        snd(WET, { volume: 0.7 }),
        snd(BLUNT, { volume: 0.4, delay: 250 })
      ]),
      bleedResist(0.8)
    ]
  },
  // A great ring of blood and a crimson eruption at the Sovereign as it rises over its court; a crimson fear only on
  // each enemy that failed. The flight and the Shield that stand are the blood magic's own loop.
  "hour-of-the-court": ringRow({
    sound: WINGS,
    extra: [
      fx("jb2a.swirling_feathers.outburst.01.textured", { place: "source", scale: 1.5, filter: "SOV_BLOOD", delay: 150 }),
      fx(MAJESTY, { place: "source", scale: 1.3, delay: 300 }),
      snd(ROYAL_HELP, { volume: 0.5, delay: 300 })
    ],
    resist: cue("resist", [fx(FEAR, { place: "resisted", scale: 0.7, filter: "SOV_PURPLE" }), snd(BLUNT, { volume: 0.4 })])
  })
});

/* ------------------------------------------------------------------ */
/*  The states, the features, the talents and the events               */
/* ------------------------------------------------------------------ */

const CHAIN_LOOP_PRISON = "jb2a.markers.chain.standard.loop.01.red";
const CHAIN_LOOP_LEASH = "jb2a.markers.chain.standard.loop.02.red";
const SHADOW = "jb2a.drop_shadow.dark_black";
const MENDING = "psfx.cantrips.mending.v1.001.with-cast";
const MISTY_IN = "psfx.2nd-level-spells.misty-step.v1.intro.generic";
const MISTY_OUT = "psfx.2nd-level-spells.misty-step.v1.outro.generic";
const ROYAL = "psfx.incantations.masculine.001.demonic.help.002";
const COMMAND = "psfx.incantations.masculine.001.demonic.harm.001";

/** A brief look at the Sovereign alone, on a Use card. */
function selfRowFeature(asset, sound, options = {}) {
  return Object.freeze({ cues: [cue("use", [fx(asset, { place: "source", scale: 0.9, ...options }), snd(sound, { volume: 0.5 })])] });
}

export const SOV_FEATURE_ANIMATIONS = Object.freeze({
  /* ---- the states the blood magic lays (D-729: a loop is state) ---- */
  // Every blood curse: a faint red sigil turning under the creature while the curse holds it. The spell's or
  // the feature's own cue draws the moment it lands; the arrival here settles quietly.
  [BLOOD_CURSE_KEY]: {
    cues: [cue("effect", [fx("jb2a.condition.curse.01.002.red", { place: "effect", scale: 0.6, opacity: 0.8 }), snd(WHISPER_M, { volume: 0.25 })], { state: "bloodCurse" })],
    loop: loop("effect", [fx("jb2a.markers.simple.001.loop.001.red", { place: "holder", scale: 0.65, below: true, opacity: 0.55 })], { state: "bloodCurse" })
  },
  // The blood magic the Sovereign's spells lay, a loop for each state: Bleed for Me's dripping, Royal
  // Command's charm, an audience held, and the spells it wears - risen on blood (Bloodbolt Ascension's 30 ft
  // of flight), the Mantle, Majesty Unbound and Unfading Glory.
  [BLOOD_MAGIC_KEY]: {
    cues: [cue("effect", [fx("jb2a.markers.mute.dark_red.02", { place: "effect", scale: 0.55 }), snd(WHISPER_F, { volume: 0.3 })], { state: "audience" })],
    loops: [
      loop("effect", [fx("jb2a.markers.drop.red.02", { place: "holder", scale: 0.5, opacity: 0.8 })], { state: "bleedForMe" }),
      loop("effect", [fx("jb2a.markers.heart.pink.03", { place: "holder", scale: 0.45, opacity: 0.8 })], { state: "command" }),
      loop("effect", [fx("jb2a.markers.mute.dark_red.01", { place: "holder", scale: 0.45, opacity: 0.8 })], { state: "audience" }),
      loop("effect", [
        fx(SHADOW, { place: "holder", scale: 1.1, below: true, opacity: 0.7 }),
        fx("jb2a.wind_lines.01.01.white", { place: "holder", scale: 1, filter: "SOV_BLOOD", opacity: 0.45 })
      ], { state: "bloodbolt-ascension" }),
      loop("effect", [fx("jb2a.shield_themed.below.fire.01.orange", { place: "holder", scale: 1.3, below: true, filter: "SOV_BOLT", opacity: 0.6 })], { state: "mantle-of-majesty" }),
      loop("effect", [fx("jb2a.magic_signs.circle.02.evocation.loop.dark_red", { place: "holder", scale: 1.3, below: true, opacity: 0.55 })], { state: "majesty-unbound" }),
      loop("effect", [fx("jb2a.bless.200px.loop.yellow", { place: "holder", scale: 1.1, filter: "SOV_MAJESTY", opacity: 0.55 })], { state: "unfading-glory" }),
      // The second eighteen (D-1394): a crimson ward round the Sovereign while Sanguine Barrier lasts, a red gaze
      // over it for the turn Scent of Blood lasts, a crimson mist while Veil of Mist does, blood plates under it
      // while Crimson Carapace does, and the Hour of the Court's shadow and bats while it flies on its Shield.
      // Read off `anim-sov2-barrier-loop.png`: at 0.5 the ward was a pink cast over the token, so it is drawn fuller.
      loop("effect", [fx("jb2a.shield.01.loop.blue", { place: "holder", scale: 1.3, filter: "SOV_BLOOD_B", opacity: 0.85 })], { state: "sanguine-barrier" }),
      loop("effect", [fx("jb2a.eyes.01.dark_green.single", { place: "holder", scale: 0.4, filter: "SOV_GAZE_G", opacity: 0.6 })], { state: "scent-of-blood" }),
      loop("effect", [fx("jb2a.fog_cloud.01.white", { place: "holder", scale: 1.4, filter: "SOV_BLOOD", opacity: 0.45 })], { state: "veil-of-mist" }),
      loop("effect", [fx("jb2a.shield_themed.below.molten_earth.01.orange", { place: "holder", scale: 1.3, below: true, filter: "SOV_BOLT", opacity: 0.6 })], { state: "crimson-carapace" }),
      loop("effect", [
        fx(SHADOW, { place: "holder", scale: 1.1, below: true, opacity: 0.7 }),
        // Read off `anim-sov2-hour-loop.png`: at 0.5 the bats were faint streaks, so the Blood Monarch's 0.6 and more.
        fx("jb2a.bats.loop.01.red", { place: "holder", scale: 1.3, opacity: 0.7 })
      ], { state: "hour-of-the-court" }),
      // Mesmerize's charm: a rose turning over the creature; Blood Bond's: a rose heart, held until the bond ends.
      loop("effect", [fx("jb2a.sleep.symbol.dark_pink", { place: "holder", scale: 0.45, filter: "SOV_PINK", opacity: 0.75 })], { state: "charm" }),
      loop("effect", [fx("jb2a.markers.heart.pink.01", { place: "holder", scale: 0.45, filter: "SOV_PINK", opacity: 0.75 })], { state: "bloodBond" })
    ]
  },
  // The prey: a red hunter's sign on the creature as the mark is written (from every door that marks), and
  // the mark turning on the prey while it stands.
  [PREY_MARK_KEY]: {
    cues: [cue("use", [
      fx("jb2a.hunters_mark.pulse.01.green", { place: "targets", scale: 0.8, filter: "SOV_GAZE_G" }),
      snd(WHISPER_F, { volume: 0.4 })
    ])],
    loop: loop("mark", [fx("jb2a.hunters_mark.loop.01.green", { place: "holder", scale: 0.7, filter: "SOV_GAZE_G", opacity: 0.75 })])
  },

  /* ---- 02 §7's features ---- */
  // Preening: the Sovereign sets itself right - a glint of gold and a crimson twinkle, with a tidying charm.
  "prim-and-proper": {
    cues: [cue("use", [
      fx("jb2a.twinkling_stars.points07.white", { place: "source", scale: 0.8, filter: "SOV_MAJESTY" }),
      fx("jb2a.glint.yellow.few", { place: "source", scale: 0.8, delay: 250 }),
      snd(MENDING, { volume: 0.5 }),
      snd(BOON, { volume: 0.4, delay: 400 })
    ])]
  },
  // The direction of the prey sensed: red eyes at the Sovereign.
  "unending-pursuit": selfRowFeature("jb2a.eyes.01.dark_green.single", WHISPER_F, { scale: 0.55, filter: "SOV_GAZE_G" }),
  // Royal Due's toll: shadow on the prey and its blood drawn to the Sovereign.
  "royal-due": {
    cues: [cue("use", [
      fx("jb2a.impact.004.blue", { place: "targets", scale: 0.7, filter: "SHADOW_B" }),
      snd(NECROTIC, { volume: 0.5 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 200 }),
      snd(STRANDS, { volume: 0.4, delay: 200 })
    ])]
  },
  // Look Upon Me: majesty rolling out from the Sovereign across its 60 feet, and red eyes on each enemy whose
  // failed Test laid the Bane.
  "look-upon-me": {
    cues: [
      cue("use", [
        fx(OUTPULSE, { place: "source", scale: 3, filter: "SOV_MAJESTY" }),
        fx("jb2a.glint.yellow.many", { place: "source", scale: 1.2, delay: 150 }),
        snd(ROYAL, { volume: 0.55 })
      ]),
      cue("effect", [fx("jb2a.eyes.01.dark_green.single", { place: "effect", scale: 0.5, filter: "SOV_GAZE_G" }), snd(WHISPER_F, { volume: 0.35 })], { state: "laidBane" })
    ]
  },
  // Blood Prison: a heartbeat at the Sovereign as it seizes the blood, red bonds closing on the creature that
  // failed, and bonds of blood (never shadow) holding it while the prison stands.
  "blood-prison": {
    cues: [
      cue("use", [
        fx("jb2a.ui.heartbeat.01.green", { place: "source", scale: 0.8, filter: "BLOOD_T" }),
        snd(WHISPER_M, { volume: 0.45 })
      ]),
      cue("effect", [
        fx(CHAIN, { place: "effect", scale: 0.9 }),
        fx(SPLASH, { place: "effect", scale: 0.55, delay: 150 }),
        snd(WET, { volume: 0.5 })
      ], { state: "bloodPrison" })
    ],
    loop: loop("effect", [
      fx(CHAIN_LOOP_PRISON, { place: "holder", scale: 0.9, opacity: 0.85 }),
      fx(DROPS, { place: "holder", scale: 0.5, opacity: 0.6 })
    ], { state: "bloodPrison" })
  },
  // A blood crown: a circle under the Sovereign and majesty over it, and the circle turning while it is crowned.
  "crowned-in-blood": {
    cues: [cue("use", [
      fx(CIRCLE, { place: "source", scale: 1.6, below: true }),
      fx(MAJESTY, { place: "source", scale: 1.3, delay: 200 }),
      snd(ROYAL, { volume: 0.6 })
    ])],
    loop: loop("effect", [fx("jb2a.magic_signs.circle.02.evocation.loop.red", { place: "holder", scale: 1.2, below: true, opacity: 0.45 })], { state: "crownedInBlood" })
  },

  /* ---- 04's Dominion ---- */
  "bound-to-the-court": {
    cues: [
      cue("use", sigil(WHISPER_M, 0.6)),
      cue("effect", [fx(CHAIN, { place: "effect", scale: 0.75 }), snd(BLUNT, { volume: 0.45 })], { state: "leash" })
    ],
    loop: loop("effect", [fx(CHAIN_LOOP_LEASH, { place: "holder", scale: 0.7, opacity: 0.8 })], { state: "leash" })
  },
  "kneel": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", scale: 2, filter: "SOV_MAJESTY" }),
      snd(COMMAND, { volume: 0.6 })
    ])]
  },
  "abject-obedience": {
    cues: [
      cue("use", [fx(RUNE, { place: "source", scale: 0.8 }), snd(COMMAND, { volume: 0.55 })]),
      cue("effect", [fx("jb2a.eyes.01.dark_green.single", { place: "effect", scale: 0.6, filter: "SOV_GAZE_G" }), snd(WHISPER_M, { volume: 0.4 })], { state: "obedience" })
    ],
    loop: loop("effect", [fx(MAJESTY, { place: "holder", scale: 1, opacity: 0.45 })], { state: "obedience" })
  },

  /* ---- 04's Vainglorious ---- */
  "above-such-things": selfRowFeature("jb2a.smoke.puff.ring.01.white", BOON, { scale: 0.8, filter: "SOV_MAJESTY" }),
  // The blow turned aside (`hold`, Afterimage's negate) and the step to where the Sovereign lands.
  "mirrored-self": {
    cues: [
      cue("hold", [
        fx("jb2a.shimmer.01.blue", { place: "source", scale: 1.2, filter: "SOV_BLOOD_B" }),
        snd(SHIELD, { volume: 0.55 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SOV_BLOOD_B" }),
        snd(MISTY_OUT, { volume: 0.55 })
      ])
    ]
  },
  // The blow that would have dropped the Sovereign held at 1, and a gold-crimson glory as the cup is spent.
  "too-beautiful-to-die": {
    cues: [cue("hold", [
      fx("jb2a.healing_generic.400px.yellow", { place: "source", scale: 0.9, filter: "SOV_MAJESTY" }),
      fx("jb2a.glint.yellow.many", { place: "source", scale: 1, delay: 200 }),
      snd("psfx.conditions.boon.004.01", { volume: 0.55 })
    ])]
  },

  /* ---- 04's Ravenous ---- */
  "sanguine-edge": {
    cues: [cue("use", [
      fx(INFLOW, { place: "source", scale: 1, filter: "SOV_BLOOD" }),
      snd(SWOOSH, { volume: 0.55 })
    ])]
  },
  "tasting-bite": {
    cues: [cue("use", [
      fx("jb2a.bite.200px.red", { place: "targets", scale: 0.7 }),
      snd(BITE, { volume: 0.6 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 200 })
    ])]
  },
  // The latch: a deep bite as it takes hold, and a strand of blood held between the prey and the Sovereign
  // while the latch does.
  "latch-on": {
    cues: [cue("use", [
      fx("jb2a.bite.400px.red", { place: "targets", scale: 0.75 }),
      snd(BITE, { volume: 0.65 }),
      fx(SPLASH, { place: "targets", scale: 0.5, delay: 150 })
    ])],
    loop: loop("effect", [
      fx(STRAND, { place: "channel", travel: "stretch", filter: "SOV_STREAM", opacity: 0.6 }),
      fx("jb2a.markers.drop.red.02", { place: "holder", scale: 0.45, opacity: 0.8 })
    ], { state: "latch" })
  },
  "bloodletting": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", scale: 1.4, filter: "SOV_BLOOD" }),
      fx(SPLASH, { place: "targets", scale: 0.6, delay: 150 }),
      snd(SLASH, { volume: 0.55, delay: 150 }),
      snd(WET, { volume: 0.4, delay: 200 })
    ])]
  },
  // A crimson mist where the Sovereign stood and where it lands beside its prey (the card's recorded step).
  "blood-rush": {
    cues: [
      cue("use", [
        fx("jb2a.misty_step.01.blue", { place: "step-from", fallback: "source", scale: 1, filter: "SOV_BLOOD_B" }),
        snd(MISTY_IN, { volume: 0.5 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1, filter: "SOV_BLOOD_B" }),
        snd(MISTY_OUT, { volume: 0.5 })
      ])
    ]
  },
  // The Blood Monarch: a crimson eruption at the Sovereign as the wings spread, and - while the form lasts -
  // the Sovereign aloft on a swirl of blood bats (no wing asset is installed; the bats stand in).
  "blood-monarch": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", scale: 2.2, filter: "SOV_BLOOD" }),
      fx("jb2a.swirling_feathers.outburst.01.textured", { place: "source", scale: 1.6, filter: "SOV_BLOOD", delay: 150 }),
      snd(WINGS, { volume: 0.65 }),
      snd(HARM, { volume: 0.5, delay: 200 })
    ])],
    loop: loop("effect", [
      fx(SHADOW, { place: "holder", scale: 1.2, below: true, opacity: 0.7 }),
      // Read off `anim-sov-blood-monarch-loop.png`: the shadow wash greyed the bats, so the form keeps their red.
      fx("jb2a.bats.loop.01.red", { place: "holder", scale: 1.3, opacity: 0.6 })
    ], { state: "shape" })
  },

  /* ---- the events no one feature's Use owns ---- */
  // A blood curse thrown off: the curse snaps back on the creature that threw it off.
  [CURSE_DEFIED_KEY]: {
    cues: [cue("use", [
      fx("jb2a.impact.004.blue", { place: "targets", scale: 0.6, filter: "SHADOW_B" }),
      snd(NECROTIC, { volume: 0.45 })
    ])]
  },
  // Blood Prison's tear at the end of a turn the prisoner walked: its own blood tears at it.
  [PRISON_TEAR_KEY]: {
    cues: [cue("use", [
      fx(SPLASH, { place: "source", scale: 0.7 }),
      fx(SPLASH_SIDE, { place: "source", scale: 0.6, delay: 120 }),
      snd(SLASH, { volume: 0.5 })
    ])]
  },
  // The latch's drain at the start of the Sovereign's turn: the prey's blood drawn up the strand.
  [LATCH_DRAIN_KEY]: {
    cues: [cue("use", [
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM" }),
      fx(INFLOW, { place: "source", scale: 0.9, filter: "SOV_BLOOD", delay: 300 }),
      snd(SWALLOW, { volume: 0.5, delay: 300 })
    ])]
  },
  // Burden of Sin striking back: its sin turns on the creature whose attack drew blood (the card speaks from it).
  [BURDEN_STRUCK_KEY]: {
    cues: [cue("use", [
      fx("jb2a.condition.curse.01.012.red", { place: "source", scale: 0.6 }),
      fx("jb2a.impact.004.blue", { place: "source", scale: 0.6, filter: "SHADOW_B", delay: 120 }),
      snd(NECROTIC, { volume: 0.5 })
    ])]
  },
  // Hemoplague's spread at the carrier's turn start: a red pulse across its 10 feet and drops on each creature it
  // reached (a 5 ft token and 10 feet each side: 25 feet across).
  [HEMOPLAGUE_SPREAD_KEY]: {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", sizeFt: 25, filter: "SOV_BLOOD", opacity: 0.7 }),
      fx(DROPS, { place: "targets", scale: 0.55, delay: 200 }),
      snd(SLASH, { volume: 0.4, delay: 200 })
    ])]
  },
  // Summons to Court's pull: a strand of blood along the path the creature was dragged and a crimson puff where it
  // lands beside the Sovereign, with a wet clank.
  [SUMMONS_PULL_KEY]: {
    cues: [cue("arrive", [
      fx(STRAND, { place: "step", travel: "stretch", movers: ["pull"], filter: "SOV_STREAM", opacity: 0.85 }),
      fx("jb2a.smoke.puff.side.grey", { place: "step-to", movers: ["pull"], scale: 0.8, filter: "SOV_BLOOD", delay: 250 }),
      snd(BLUNT, { volume: 0.45 }),
      snd(WET, { volume: 0.35, delay: 250 })
    ])]
  },
  // Shroud of Sorrow's tick at an enemy's turn start: a shadowed impact on the enemy the dark strikes, and a thread of
  // its blood drawn back into the Sovereign for the 1 Health the drain gives (the card speaks from the caster).
  [SHROUD_TICK_KEY]: {
    cues: [cue("use", [
      fx("jb2a.impact.004.blue", { place: "target", scale: 0.6, filter: "SHADOW_B" }),
      snd(NECROTIC, { volume: 0.45 }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "SOV_STREAM", delay: 200 }),
      fx(INFLOW, { place: "source", scale: 0.8, filter: "SOV_BLOOD", delay: 450 })
    ])]
  }
});

/* ------------------------------------------------------------------ */
/*  What each key's door fires, and what has no row                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT EACH KEY'S DOOR FIRES** (the contract, as data; `necromancer-animations.mjs#NECRO_RECORDS`' shape):
 * the triggers, states and bindings `animation-table.test.mjs#firesOf` reads for these keys - added to what
 * a key's talent or feature row already says - a `door` naming who writes the record, and the `marker` the
 * census looks for in `module/` outside this file: a constant's or a flag's NAME.
 */
const r = (triggers, door, marker, { states = [], bindings = [] } = {}) =>
  Object.freeze({ triggers: Object.freeze(triggers), states: Object.freeze(states), bindings: Object.freeze(bindings), door, marker });

export const SOV_RECORDS = Object.freeze({
  [BLOOD_CURSE_KEY]: r(["effect"], "every blood curse's effect carries the bloodCurse tag (SPELLS' layBloodCurse, FEATURES' bloodCurseEffectData)", "BLOOD_CURSE_FLAG", { states: ["bloodCurse"], bindings: ["effect"] }),
  [BLOOD_MAGIC_KEY]: r(["effect"], "Bleed for Me's Bleeding, Royal Command's and Mesmerize's Charmed, Blood Bond's own Charmed, an audience held and every spell the Sovereign wears (layOwn's sovereignOwn)", "BLEED_FOR_ME_FLAG",
    { states: ["bleedForMe", "command", "audience", ...CHARM_STATES, ...OWN_STATES, ...Object.keys(QUIET_OWN)], bindings: ["effect"] }),
  [PREY_MARK_KEY]: r(["use"], "markPrey writes PREY_CUE_OPTION on the update that sets the prey flag; the mark stands off the flag", "PREY_CUE_OPTION", { bindings: ["mark"] }),
  "blood-prison": r(["effect"], "Blood Prison's curse carries its own bloodPrison flag", "bloodPrison", { states: ["bloodPrison"], bindings: ["effect"] }),
  "look-upon-me": r(["effect"], "each failed Test lays a Bane whose source is Look Upon Me", "LOOK_UPON_ME", { states: ["laidBane"] }),
  "crowned-in-blood": r(["effect"], "the crown's effect carries crownedInBlood", "crownedInBlood", { states: ["crownedInBlood"], bindings: ["effect"] }),
  "bound-to-the-court": r(["effect"], "the leash on a failure names Bound to the Court as its source", "BOUND_TO_THE_COURT", { states: ["leash"], bindings: ["effect"] }),
  "abject-obedience": r(["effect"], "the control's carrier carries obedience", "layObedience", { states: ["obedience"], bindings: ["effect"] }),
  "latch-on": r(["use", "effect"], "the latch's offer posts a latchOn card; the carrier names Latch On as its source", "latchOn", { states: ["latch", "leash"], bindings: ["effect"] }),
  "tasting-bite": r(["use"], "the bite's offer, pressed, posts a tastingBite card", "tastingBite"),
  "royal-due": r(["use"], "Royal Due's offer, pressed, posts a royalDue card", "royalDue"),
  "too-beautiful-to-die": r(["hold"], "the hold at 1 posts a tooBeautiful card", "tooBeautiful"),
  "mirrored-self": r(["arrive"], "the step after the negated blow rides the Use card's steps", "cardFlags"),
  "blood-rush": r(["arrive"], "the step to the prey rides the Use card's steps", "cardFlags"),
  "blood-monarch": r(["effect"], "the form is a bloodQueen shape, named for the talent", "bloodQueen", { states: ["shape"], bindings: ["effect"] }),
  [CURSE_DEFIED_KEY]: r(["use"], "a curse thrown off posts a curseThrownOff card in the curser's name", "curseThrownOff"),
  [PRISON_TEAR_KEY]: r(["use"], "Blood Prison's tear at a turn's end posts a prison card", "prison: true"),
  [LATCH_DRAIN_KEY]: r(["use"], "the latch's drain at a turn's start posts a latchTick card", "latchTick"),
  [BURDEN_STRUCK_KEY]: r(["use"], "Burden of Sin's strike on its bearer posts a burdenStruck card spoken from the bearer", "burdenStruck: true"),
  [HEMOPLAGUE_SPREAD_KEY]: r(["use"], "Hemoplague's spread at the carrier's turn start posts a hemoplagueSpread card naming each creature reached", "hemoplagueSpread: true"),
  [SUMMONS_PULL_KEY]: r(["arrive"], "Summons to Court's pull goes through forceMove with SUMMONS_PULL_KEY as its cue's key", "key: SUMMONS_PULL_KEY"),
  [SHROUD_TICK_KEY]: r(["use"], "Shroud of Sorrow's tick on an enemy posts a shroudTick card spoken from the caster, naming the enemy struck", "shroudTick: true")
});

/**
 * **WHAT HAS NO ROW, AND WHY**: every feature and talent of the class that plays nothing of its own. A
 * passive changes a number, a Test or a dialog line; a door that already plays another row says which.
 */
export const SOV_NO_ROW = Object.freeze({
  /* 02 §7 */
  "hunt-mortal": "its mark plays as `prey-mark` on the flag write, from every door that marks, and stands on the prey while it lasts; a cue on its Use card as well would play one mark twice",
  "blood-forged-claws": "the claws coming out play `claws-equip`, a claw blow plays the `claw` strike and a re-mark plays `prey-mark`",
  "the-blood-royal": "its feeding plays CORE's feeding stream (`vitae:feed`) on the Vitae write; its Use hands straight to the feeding door and posts no card of its own",
  "withering-contempt": "passive: a cut on the prey's weapon blows and a Bane line on a cast dialog, drawn on no blow",
  /* 04's Dominion */
  "sovereign-will": "passive: a penalty on a curse's repeat Test, a number on the prompt",
  "heavy-tread": "passive: Speed falls under a curse, a number on the sheet; the curse's own loop stands",
  "price-of-defiance": "its damage rides the curse thrown off, which plays `curse:defied`",
  "lingering-decree": "its Slowed rides the curse thrown off (`curse:defied`), and a condition's picture is the condition's",
  "unworthy-hand": "passive: a cut on a cursed creature's weapon blows, drawn on no blow",
  "homage": "its Tribute plays CORE's Tribute wisp (`tribute:gain`)",
  "example-to-others": "the spread lays a blood curse, whose own arrival and loop play (`blood-curse`)",
  "no-pardon": "its Frightened rides the curse thrown off (`curse:defied`), and a condition's picture is the condition's",
  "gilded-cage": "passive: Blood Prison's price and damage, numbers on its own card",
  /* 04's Vainglorious */
  "gilded-skin": "passive: more temporary Health on Prim and Proper, whose own cue plays",
  "beneath-me": "its Tribute plays CORE's Tribute wisp (`tribute:gain`)",
  "exquisite-taste": "passive: one more Health on a drain, a number on the heal",
  "untouchable": "passive: Defense while temporary Health lasts, a number on the sheet",
  "overflowing-cup": "passive: a drain's spill becomes temporary Health, a number on the heal",
  "insolence-repaid": "passive: a Boon line on the next dialog, a word rather than a picture",
  "serene-disdain": "passive: conditions refused, a refusal in words",
  "unmarred": "its Tribute plays CORE's Tribute wisp (`tribute:gain`)",
  "the-crimson-throne": "passive: the Tribute cap and a Bane line on weapon attacks, numbers and words",
  /* 04's Ravenous */
  "blooded-claws": "passive: more claw rolls and Shadow on a claw hit, each claw blow playing the `claw` strike",
  "raking-claws": "passive: the claws' Bleeding raised, each claw blow playing the `claw` strike",
  "crimson-flourish": "passive: a Boon and a discount the spell and the claw blow carry, each playing its own cue",
  "drink-deep": "passive: feeding widened, and a feeding plays CORE's feeding stream (`vitae:feed`)",
  "last-draught": "its feeding plays CORE's feeding stream (`vitae:feed`) when its offer is pressed",
  "swift-hunger": "passive: a spell cast as a Half-Action, whose own cast cue plays"
});
