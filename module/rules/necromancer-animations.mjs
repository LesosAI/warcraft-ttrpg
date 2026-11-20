/**
 * **WHAT THE NECROMANCER LOOKS LIKE AND SOUNDS LIKE** (the Necromancer plan's Phase 6; D-723 to
 * D-730 are the standing rules, the Death Knight's `death-knight-animations.mjs` the shape). Pure
 * data and pure record builders, no Foundry imports. Three tables that the animation tables
 * spread into their own -
 *
 *  - `NECRO_SPELL_ANIMATIONS`: a row for each of the Necromancer's twelve tier 1 spells (07 §17,
 *    *Restricted Necromancer*), into `animation-table.mjs#SPELL_ANIMATIONS`, whose census holds
 *    every tier 1 spell to a row and a reviewed direction (`tools/animation/directions.mjs`);
 *  - `NECRO_EXPANDED_SPELL_ANIMATIONS`: a row for each of its thirty-eight spells above tier 1,
 *    into `spell-animation-expansion.mjs#EXPANDED_SPELL_ANIMATIONS`. Graveblight and Contagion,
 *    which the Necromancer shares with the knight, keep the knight's rows (they already play a
 *    picture and a sound, and Graveblight's loop stands while its Sustain is held);
 *  - `NECRO_FEATURE_ANIMATIONS`: 02 §7's features and 04's Flesh, Bone and Damned talents whose
 *    doors write a record, and four EVENTS no one feature owns - the Essence wisp
 *    (`ESSENCE_GAIN_KEY`, 4a's record on the pool write), a raised dead collapsing
 *    (`COLLAPSE_KEY`, on the token delete), raised dead standing up outside a raise card
 *    (`HORDE_RISE_KEY`) and a graft's stitching (`GRAFT_KEY`, on the raise card) - into
 *    `animation-table.mjs#FEATURE_ANIMATIONS`.
 *
 * **What a door must write for each row to play** is `F:/tmp/necromancer/team/animation-contract.md`
 * and, for the census, `NECRO_RECORDS` below: the triggers, states and bindings each key's door
 * fires, which `animation-table.test.mjs#firesOf` reads, and `NECRO_DOORS_PENDING`, the keys whose
 * door is not built yet (the `SPELL_ANIMATIONS_PENDING` idiom: the Vitest fails on a pending key
 * whose door has landed, and on a struck one whose door is missing).
 *
 * The grammar is the table's own: a row is `{cues, loop?}` or `{reason}`, a cue fires on an EVENT
 * and a loop stands while the world holds its STATE (D-729), a failed Casting Test never animates
 * on any trigger and a miss has no impact step (`rules/animation.mjs#plan`), and nothing is placed
 * on a creature the record does not name (D-724 to D-726). **Every asset is a full leaf key held
 * against `tools/animation/assets.json`** (D-723), JB2A's or PSFX's: a Jinker's asset enters only
 * through `COMPARISONS` and the lead's pick (D-727). **Every row carries a sound step.** **Every
 * number is a starting value**, to be tuned on the lead's review of rendered frames.
 *
 * The colours are the Death school's, as the knight's: grave-green over shadow (`UNHOLY_*`), old
 * bone (`BONE`, `BONE_O`), and three of the Necromancer's own below.
 */

import { ESSENCE_GAIN_KEY, cleanCorpse, cleanEssenceGain, corpseRecord, risenRecord } from "./animation-records.mjs";

/** An effect step. */
const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
/** A sound step. */
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
/** A cue; a feature's `effect` cue may name the state it answers. */
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop; a feature's `effect` loop names the state it follows. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

/**
 * **THE NECROMANCER'S RECOLOURS**, spread into `animation-table.mjs#FILTERS` beside the knight's.
 * A tint MULTIPLIES, so each washes a near-white asset.
 */
export const NECRO_FILTERS = Object.freeze({
  /** A white fog washed the sick yellow of 07's Plague Cloud (*a low yellow fog*). */
  PLAGUE_Y: Object.freeze({ tint: "#c9c36a", brightness: 0.85 }),
  /** Green strands washed the dull red of gut thread: a graft stitched in. */
  FLESH_T: Object.freeze({ tint: "#c47a68", brightness: 0.95 }),
  /** A coloured shape emptied to pale grave vapour: a wraith, a Shade, a banshee. */
  SPIRIT_W: Object.freeze({ saturate: -0.8, brightness: 1.2 })
});

/* ------------------------------------------------------------------ */
/*  The records the event rows are played off                          */
/* ------------------------------------------------------------------ */

/** A raised dead collapsing: the key its row is filed under, and the delete operation's option. */
export const COLLAPSE_KEY = "horde:collapse";
export const COLLAPSE_OPTION = "azerothCollapse";
/** Raised dead standing up with no raise card of their own (Plague of Undeath's victims). */
export const HORDE_RISE_KEY = "horde:rise";
/** A graft stitched into a creature as it rises (Stitch Abomination, Grafted Flesh). */
export const GRAFT_KEY = "graft:stitch";
/** 04's Skeletal Mastery's Empowered mage, on the raise card's `raisedWith` (the 4b review's MUST-FIX 5). */
export const MASTERY_KEY = "skeletal-mastery";
/** The raise card's flag naming what rode the raise, and which keys it may name. */
export const RAISED_WITH_FLAG = "raisedWith";
export const RAISED_WITH_KEYS = Object.freeze([GRAFT_KEY, "deathly-vigor", MASTERY_KEY]);
/**
 * **THE GRAFTS THAT FIRE ON THEIR OWN** (the lead's Q7 of the 4b review: *"auto"*): Meat Hook's pull
 * and Grasping Arms' hold on a creature that failed the Test its hit asked, and Plague Bladder's
 * Poisoned on an enemy that failed the Test its turn start asked - each a feature card from the
 * grafted creature naming the creature the graft reached (`effects/graft-riders.mjs`).
 */
export const GRAFT_HOOK_KEY = "graft:meat-hook";
export const GRAFT_BLADDER_KEY = "graft:plague-bladder";
export const GRAFT_ARMS_KEY = "graft:grasping-arms";
/** Lichdom's phylactery bound at a Long Rest's window: a feature card from the lich (the review's missing cue). */
export const LICH_BIND_KEY = "lichdom:bind";
/** Enslave the Dead's control ending - the hour, a hand, a collapse at the places: a feature card naming the creature handed back. */
export const ENSLAVE_END_KEY = "enslave:end";
/** The flag Plague Carrier's carrier effect names the talent in (`stateEntriesOf` reads its `source`). */
export const PLAGUE_CARRIER_FLAG = "plagueCarrier";
/** Circle of the Damned's Region key (`featureKey` on the Region's flags, as Desecration's). */
export const CIRCLE_KEY = "circle-of-the-damned";
/**
 * **THE KEYS OF THE TALENT DOORS THAT HAVE NO USE BUTTON** (Phase 4c-T): each door posts its card
 * under its own constant, which is the census's marker (a door must import it) - Bloated Dead's
 * burst and Restless Bones' stand on the raised-dead event, Life for a Life's asked hold, and 4c-S's
 * Barbed Bone on Bone Shield's Reaction.
 */
export const BLOATED_DEAD_KEY = "bloated-dead";
export const RESTLESS_BONES_KEY = "restless-bones";
export const LIFE_FOR_A_LIFE_KEY = "life-for-a-life";
export const BARBED_BONE_KEY = "barbed-bone";
/** The Essence gains that draw a wisp: from a creature, never a refund or a hand (`essence.mjs#ESSENCE_GAIN_SOURCES`). */
export const ESSENCE_WISP_SOURCES = Object.freeze(["death", "soulCage", "soulRip"]);

/** The event keys no one feature owns, which `VALID_KEYS` takes in the census. */
export const NECRO_EVENT_KEYS = Object.freeze([
  ESSENCE_GAIN_KEY, COLLAPSE_KEY, HORDE_RISE_KEY, GRAFT_KEY, GRAFT_HOOK_KEY, GRAFT_BLADDER_KEY, GRAFT_ARMS_KEY, LICH_BIND_KEY, ENSLAVE_END_KEY
]);

const idOf = value => (typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null);
const refOf = raw => {
  const tokenId = idOf(raw?.tokenId);
  return tokenId ? { sceneId: idOf(raw?.sceneId), tokenId } : null;
};

/**
 * A finished feature record, in `module/animation/records.mjs#featureRecord`'s shape, so the
 * director only wires a hook: `plan` reads every key here.
 */
function featureRecordOf({ trigger, sceneId = null, identifier, success = true, casting = false, source = null, targets = [], risen = [], corpse = null, contentVisible = true }) {
  return {
    trigger, kind: "feature", contentVisible, sceneId, identifier, casting, success, area: null,
    source, targets, steps: [], risen, hold: null, ...(corpse ? { corpse } : {})
  };
}

/**
 * **THE ESSENCE WISP'S PLAN RECORD** off the pool write's option (`ESSENCE_GAIN_OPTION`, 4a's
 * `rules/animation-records.mjs`): a `use` record under `ESSENCE_GAIN_KEY`, its source the
 * Necromancer's token and its one target the creature the Essence came from. Null where the
 * option carried nothing readable.
 *
 * @param {unknown} raw  the option's value
 * @param {string} [identifier]  the key the wisp plays under: the Essence wisp's, or Soul Harvest's
 *   (`animation-records.mjs#SOUL_HARVEST_KEY`), which rides the same cue shape
 */
export function essenceGainRecord(raw, identifier = ESSENCE_GAIN_KEY) {
  const gain = cleanEssenceGain(raw);
  if (!gain) return null;
  return featureRecordOf({
    trigger: "use", sceneId: gain.sceneId, identifier,
    source: { sceneId: gain.sceneId, tokenId: gain.tokenId },
    targets: gain.corpse ? [gain.corpse] : []
  });
}

/**
 * **A COLLAPSE'S CUE**, written on the Token delete operation that removes raised dead: who
 * collapsed them (the Necromancer's token, or null) and where each body stood, as its CENTRE in
 * canvas pixels (`corpseRecord`'s input: the token's top-left `from`, its grid size and the
 * scene's grid), because the token is gone by the time any client draws.
 *
 * @param {{by?: object|null, bodies?: object[]}} o
 * @returns {{by: {sceneId: string|null, tokenId: string}|null, bodies: object[]}|null}
 */
export function collapseCue({ by = null, bodies = [] } = {}) {
  return cleanCollapse({ by, bodies: (Array.isArray(bodies) ? bodies : []).map(b => corpseRecord(b ?? {})) });
}

/** A collapse cue as an operation carried it, cleaned, or null with no body. */
export function cleanCollapse(raw) {
  const bodies = (Array.isArray(raw?.bodies) ? raw.bodies : []).map(cleanCorpse).filter(Boolean);
  if (!bodies.length) return null;
  return { by: refOf(raw?.by), bodies };
}

/**
 * **THE PLAN RECORD FOR ONE DELETED TOKEN**: the `deleteToken` hook fires once a token with the
 * operation's options, so the body whose token this is plays and every other body is the other
 * hook calls' business. Null for a token the cue does not name.
 *
 * @param {unknown} raw  the option's value
 * @param {string} tokenId  the deleted token's id
 */
export function collapseRecordFor(raw, tokenId) {
  const cue = cleanCollapse(raw);
  const body = cue?.bodies.find(b => b.tokenId === tokenId) ?? null;
  if (!body) return null;
  return featureRecordOf({ trigger: "use", sceneId: body.sceneId ?? cue.by?.sceneId ?? null, identifier: COLLAPSE_KEY, source: cue.by, corpse: body });
}

/**
 * **ONE ENTRY OF A RAISE CARD'S `raisedWith`**: a key `RAISED_WITH_KEYS` names and the tokens it
 * touched (`risenRecord`'s input, the raise door's `{sceneId, tokenIds}`). Null for an unknown key
 * or no token.
 */
export function raisedWithEntry({ key = null, placed = null } = {}) {
  const risen = risenRecord(placed);
  return RAISED_WITH_KEYS.includes(key) && risen ? { key, risen: [risen] } : null;
}

/** A card's `raisedWith`, cleaned: each entry a known key and at least one token. */
export function cleanRaisedWith(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(e => (RAISED_WITH_KEYS.includes(e?.key) ? { key: e.key, risen: (Array.isArray(e.risen) ? e.risen : []).map(risenRecord).filter(Boolean) } : null))
    .filter(e => e && e.risen.length);
}

/**
 * **THE `rise` RECORDS A RAISE CARD'S `raisedWith` IMPLIES**, one an entry, each carrying the
 * card's own verdict - a failed Casting Test stood nothing up and plays nothing.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @param {{success?: boolean, source?: object|null, sceneId?: string|null, contentVisible?: boolean}} primary  the card's record
 */
export function raisedWithRecords(flags, primary = {}) {
  return cleanRaisedWith(flags?.[RAISED_WITH_FLAG]).map(e => featureRecordOf({
    trigger: "rise", sceneId: primary.sceneId ?? e.risen[0]?.sceneId ?? null, identifier: e.key,
    casting: true, success: primary.success === true, source: refOf(primary.source), risen: e.risen,
    contentVisible: primary.contentVisible !== false
  }));
}

/* ------------------------------------------------------------------ */
/*  Shared looks                                                       */
/* ------------------------------------------------------------------ */

const NECROTIC = "psfx.impacts.magicaleffects.necrotic";
const COLD = "psfx.impacts.magicaleffects.cold";
const WHISPER = "psfx.incantations.whispers.masc.001.forward.standard.002";
const SUMMON = "psfx.incantations.masculine.002.demonic.summon.006";
const MENDING = "psfx.cantrips.mending.v1.001.with-cast";
const BELL = "psfx.cantrips.toll-the-dead.ominous-bell.001";
const RASP = "psfx.cantrips.toll-the-dead.rasping-whispers.001";
const BREACH = "psfx.creature.movement.burrow.breach";
const SHIELD = "psfx.1st-level-spells.shield-spell.intro.v1.003";
const POISON = "psfx.cantrips.poison-spray.v1";
const BOON = "psfx.conditions.boon.002.01";
const RUNE = "psfx.magic-signs.rune.v1.conjuration.complete";
const CIRCLE = "psfx.magic-signs.circle.v1.conjuration.complete";

const NECRO_CIRCLE = "jb2a.magic_signs.circle.02.necromancy.complete.dark_green";
const NECRO_RUNE = "jb2a.magic_signs.rune.necromancy.complete.green";
const SKULL_SMOKE = "jb2a.toll_the_dead.green.skull_smoke";
const STRANDS_IN = "jb2a.energy_strands.in.green.01";

/** A brief cast at the caster with one sound: a utility spell with nothing else recorded. */
function selfRow(asset, sound, options = {}) {
  return Object.freeze({ cues: [cue("cast", [fx(asset, { place: "source", scale: 0.9, ...options }), snd(sound, { volume: 0.5 })])] });
}

/** The necromantic rune at the caster's hand: a ritual or a sense with no target recorded. */
function runeRow(sound, scale = 0.6) {
  return selfRow(NECRO_RUNE, sound, { scale });
}

/**
 * **THE RISING, BY WHAT RISES** (07 §17's raises): a necromantic circle at the caster on the card,
 * then - on the `rise` trigger - the ground breaking and grave-smoke on EVERY token the raise stood
 * up (`risen`), and the creature's own mark over it: bone dust for a skeleton, blood for flesh, gut
 * thread for an Abomination, pale vapour for a spirit, a roar for a Crypt Horror, a tolling bell
 * for a host. A card that recorded no token plays the circle alone; nothing is drawn on a corpse.
 */
const RISE_MARKS = Object.freeze({
  bone: [fx("jb2a.smoke.puff.centered.grey", { place: "risen", scale: 0.9, filter: "BONE", delay: 450 })],
  flesh: [fx("jb2a.markers.drop.red.02", { place: "risen", scale: 0.7, delay: 450 })],
  stitched: [fx(STRANDS_IN, { place: "risen", scale: 1.2, filter: "FLESH_T", delay: 450 }), snd(MENDING, { volume: 0.45, delay: 450 })],
  spirit: [fx("jb2a.misty_step.02.blue", { place: "risen", scale: 1.1, filter: "SPIRIT_W", delay: 300 }), snd("psfx.incantations.feminine.001.reverb.summon.009", { volume: 0.5, delay: 300 })],
  horror: [snd("psfx.creature.dragons.roar.small", { volume: 0.5, delay: 400 })],
  host: [snd(BELL, { volume: 0.55 })]
});

function raiseRow(mark, { scale = 1 } = {}) {
  return Object.freeze({
    cues: [
      cue("cast", [
        fx(NECRO_CIRCLE, { place: "source", scale: 1.2 * scale, below: true }),
        snd(SUMMON, { volume: 0.55 })
      ]),
      cue("rise", [
        fx("jb2a.impact.ground_crack.01.orange", { place: "risen", scale: 1.6 * scale, below: true, filter: "UNHOLY_O" }),
        fx(SKULL_SMOKE, { place: "risen", scale: 1.3 * scale, delay: 250 }),
        snd(BREACH, { volume: 0.6 }),
        ...RISE_MARKS[mark]
      ])
    ]
  });
}

/** A strand drawn from the target back into the caster, ending in a mark of what was taken. */
function drainRow({ filter = null, at = SKULL_SMOKE, sound = NECROTIC } = {}) {
  return Object.freeze({
    cues: [cue("cast", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", travel: "stretch", ...(filter ? { filter } : {}) }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.55 }),
      fx(at, { place: "target", scale: 0.8 }),
      snd(sound, { volume: 0.5 })
    ])]
  });
}

/** Dark strands knitting into an undead creature healed: never the Light's gold. */
function mendRow(scale = 0.9) {
  return Object.freeze({
    cues: [cue("cast", [
      fx(STRANDS_IN, { place: "target", scale, filter: "DARK" }),
      snd(MENDING, { volume: 0.5 })
    ])]
  });
}

/** A condition's picture on the creature that FAILED its Test, and nothing before it. */
function resistRow(asset, sound, options = {}, cast = null) {
  return Object.freeze({
    cues: [
      ...(cast ? [cast] : []),
      cue("resist", [fx(asset, { place: "resisted", scale: 0.9, ...options }), snd(sound, { volume: 0.55 })])
    ]
  });
}

/**
 * A recipient group: every recorded target at cast, else each creature the Apply reaches. No loop:
 * the expansion's rows loop only while a Sustain is held (`spell-animation-expansion.test.mjs`), so
 * a laid skin above tier 1 is its cast's picture alone.
 */
function groupRow(asset, sound, options = {}) {
  return Object.freeze({
    cues: [cue("cast|effect", [
      fx(asset, { place: "targets", scale: 0.9, ...options }),
      snd(sound, { volume: 0.5 })
    ])]
  });
}

/* ------------------------------------------------------------------ */
/*  The twelve tier 1 spells                                           */
/* ------------------------------------------------------------------ */

export const NECRO_SPELL_ANIMATIONS = Object.freeze({
  // A fistful of splinters flown at the target: the ice shard washed old bone, and its crack.
  "bone-shards": {
    cues: [cue("cast", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch", scale: 0.55, speed: 1.4, filter: "BONE" }),
      snd("psfx.ranged-magic.generic.projectile.ranged.001", { volume: 0.55 }),
      fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.55, filter: "BONE", waitFor: "travel", overlap: -150 }),
      snd("psfx.impacts.slashing.v1", { volume: 0.55, waitFor: "travel", overlap: -150 })
    ])]
  },
  // The mould ring where the corpse lay (`corpse`, the card's record, as Corpse Burst's), and a
  // blister on each creature the card records; with no corpse recorded the blisters alone.
  "grave-rot": {
    cues: [cue("cast", [
      fx("jb2a.template_circle.smoke.001.complete.400px.001.greenpurple", { place: "corpse", scale: 4, filter: "PLAGUE_Y", opacity: 0.8 }),
      fx("jb2a.markers.poison.dark_green.01", { place: "targets", scale: 0.6, delay: 250 }),
      snd(POISON, { volume: 0.55 })
    ])]
  },
  "grave-touch": drainRow(),
  // A presence at the target's ear at the cast; the fear only on its failed Spirit Test.
  "dread-whisper": resistRow("jb2a.markers.fear.dark_purple.01", "psfx.incantations.whispers.masc.001.forward.standard.006", {}, cue("cast", [
    fx("jb2a.eyes.01.dark_green.single", { place: "target", scale: 0.6, opacity: 0.85 }),
    snd(WHISPER, { volume: 0.45 })
  ])),
  // Plates of bone clicking into place, and a close skin of them while the effect stands.
  "bone-ward": {
    cues: [cue("cast", [
      fx("jb2a.aura_themed.01.inward.complete.metal.01.grey", { place: "source", scale: 1.1, filter: "BONE" }),
      snd(SHIELD, { volume: 0.55 })
    ])],
    loop: loop("effect", [fx("jb2a.shield_themed.below.molten_earth.01.orange", { place: "holder", scale: 1.3, below: true, filter: "BONE_O", opacity: 0.55 })])
  },
  "mend-the-dead": mendRow(),
  "raise-dead": raiseRow("bone"),
  "animate-corpse": raiseRow("flesh"),
  "grave-sense": selfRow("jb2a.extras.tmfx.radar.circle.pulse.01.normal", WHISPER, { scale: 1.4, filter: "UNHOLY_T" }),
  // At the caster's hand alone: only the caster and the raised dead see the corpse's light.
  "corpse-candle": selfRow("jb2a.markers.light.complete.blue", "psfx.cantrips.light.v1.001", { scale: 0.6, filter: "UNHOLY_B" }),
  "deathmask": selfRow("jb2a.smoke.puff.ring.01.white", "psfx.incantations.whispers.masc.001.forward.standard.008", { scale: 0.8, filter: "DIM" }),
  "bone-courier": runeRow("psfx.incantations.whispers.masc.001.forward.standard.004")
});

/* ------------------------------------------------------------------ */
/*  The thirty-eight above tier 1                                      */
/* ------------------------------------------------------------------ */

export const NECRO_EXPANDED_SPELL_ANIMATIONS = Object.freeze({
  /* ---- tier 2 ---- */
  // Damage lands either way (half on a success), so the lash plays at cast.
  "soul-lash": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.range.standard.purple.02", { place: "source>target", travel: "stretch", filter: "DARK" }),
      snd("psfx.weapon-swooshes.necrotic.v1.group01", { volume: 0.6 }),
      fx("jb2a.impact.004.blue", { place: "target", scale: 0.7, filter: "SHADOW_B", waitFor: "travel", overlap: -200 }),
      snd(NECROTIC, { volume: 0.5, waitFor: "travel", overlap: -200 })
    ])]
  },
  "cripple": resistRow("jb2a.condition.curse.01.004.red", NECROTIC, { filter: "DESATURATE" }),
  // A placed fog, and the fog standing while the Sustain is held and the Region stands.
  "plague-cloud": {
    cues: [cue("region", [
      fx("jb2a.fog_cloud.01.white", { place: "region", area: 1, filter: "PLAGUE_Y", hold: 900, fadeOut: 400 }),
      snd(POISON, { volume: 0.55 })
    ])],
    loop: loop("sustain-region", [fx("jb2a.fog_cloud.01.white", { place: "region", area: 1, mask: true, filter: "PLAGUE_Y", opacity: 0.6 })])
  },
  "field-of-bones": {
    cues: [cue("region", [
      fx("jb2a.ice_spikes.radial.burst.white", { place: "region", area: 0.9, filter: "BONE" }),
      snd(BREACH, { volume: 0.65 })
    ])]
  },
  "frenzy-of-the-dead": groupRow("jb2a.markers.drop.red.02", "psfx.creature.dragons.roar.small", { scale: 0.7 }),
  // The caster smears out where they stood and gathers where the step lands (the card's `steps`).
  "grave-step": {
    cues: [
      cue("cast", [
        fx("jb2a.smoke.puff.ring.01.white", { place: "step-from", fallback: "source", scale: 1, filter: "DIM" }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.5 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SPIRIT_W" }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.5 })
      ])
    ]
  },
  "ghoul-rising": raiseRow("flesh", { scale: 1.1 }),
  "ghostly-servant": selfRow("jb2a.smoke.puff.ring.01.white", "psfx.cantrips.gust.v1", { filter: "SPIRIT_W" }),
  "grave-ward": selfRow("jb2a.extras.tmfx.runes.circle.simple.necromancy", "psfx.magic-signs.rune.v1.abjuration.complete", { below: true, filter: "UNHOLY_T" }),
  // The caster's eyes film over, and the servant's sockets turn.
  "borrowed-senses": {
    cues: [cue("cast", [
      fx("jb2a.eyes.01.dark_green.single", { place: "source", scale: 0.6 }),
      fx("jb2a.eyes.01.dark_green.single", { place: "target", scale: 0.6, delay: 300 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.003", { volume: 0.45 })
    ])]
  },
  "deaths-tidings": selfRow("jb2a.liquid.blob.blue", "psfx.casting.water.001", { scale: 0.6, filter: "DARK" }),

  /* ---- tier 3 ---- */
  "wraith-bolt": {
    cues: [cue("cast", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "source>target", travel: "stretch", scale: 1.2, filter: "SPIRIT_W" }),
      snd("psfx.incantations.feminine.001.reverb.harm.007", { volume: 0.5 }),
      fx(SKULL_SMOKE, { place: "target", scale: 1.1, waitFor: "travel", overlap: -250 }),
      snd(NECROTIC, { volume: 0.55, waitFor: "travel", overlap: -250 })
    ])]
  },
  "plague-wind": {
    cues: [cue("region", [
      fx("jb2a.breath_weapons.poison.cone.green", { place: "region-cone", travel: "stretch", filter: "DARK" }),
      snd(POISON, { volume: 0.65 })
    ])]
  },
  "grave-tide": {
    cues: [cue("region", [
      fx("jb2a.template_line.ice.01.blue", { place: "region-line", travel: "stretch", filter: "BONE" }),
      snd("psfx.creature.movement.burrow.001.ranged", { volume: 0.6 })
    ])]
  },
  // The skull sign on the placed ground; the fear only on each creature that failed.
  "terror-of-the-grave": {
    cues: [
      cue("region", [
        fx("jb2a.template_circle.symbol.normal.skull.purple", { place: "region", area: 0.9, opacity: 0.85 }),
        snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.55 })
      ]),
      cue("resist", [
        fx("jb2a.markers.fear.dark_purple.01", { place: "resisted", scale: 0.8 }),
        snd("psfx.incantations.whispers.masc.001.forward.standard.009", { volume: 0.4 })
      ])
    ]
  },
  "bone-shield": selfRow("jb2a.shield_themed.above.molten_earth.01.orange", "psfx.impacts.bludgeoning.v1", { scale: 1.2, filter: "BONE_O" }),
  "unholy-restoration": mendRow(1.2),
  "stitch-abomination": raiseRow("stitched", { scale: 1.4 }),
  "bind-banshee": raiseRow("spirit"),
  "spirit-anchor": selfRow("jb2a.eyes.01.dark_green.few", "psfx.incantations.whispers.masc.001.forward.standard.005", { scale: 0.7 }),
  "death-trance": selfRow("jb2a.smoke.puff.ring.01.white", "psfx.conditions.generic-layer.002", { filter: "DESATURATE" }),
  "bone-bridge": selfRow(NECRO_RUNE, BREACH, { scale: 0.7, filter: "BONE" }),
  "mark-of-the-grave": {
    cues: [cue("cast", [
      fx("jb2a.markers.skull.purple.01", { place: "target", scale: 0.6 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.007", { volume: 0.4 })
    ])]
  },

  /* ---- tier 4 ---- */
  "raise-crypt-horror": raiseRow("horror", { scale: 1.5 }),
  "enslave-the-dead": resistRow("jb2a.markers.chain.spectral_standard.complete.02.blue", NECROTIC, { filter: "UNHOLY_B" }),
  // The ribs closing on the creature that failed; the Entangled is the condition's to show.
  "bone-prison": resistRow("jb2a.ice_spikes.radial.burst.white", BREACH, { scale: 1.3, filter: "BONE" }),
  "necrotic-nova": {
    cues: [cue("region", [
      fx("jb2a.toll_the_dead.green.shockwave", { place: "region", area: 1 }),
      snd(BELL, { volume: 0.6 })
    ])]
  },
  "soul-cage": resistRow("jb2a.antilife_shell.blue_no_circle", COLD, { scale: 1, filter: "SPIRIT_W" }),
  // Damage lands either way; the shred of light is drawn back into the caster.
  "soul-rip": drainRow({ filter: "SPIRIT_W", at: "jb2a.impact.004.blue", sound: "psfx.weapon-swooshes.necrotic.v1.group01" }),
  "shroud-of-bone": groupRow("jb2a.aura_themed.01.inward.complete.metal.01.grey", SHIELD, { filter: "BONE" }),
  "unholy-renewal": {
    cues: [cue("cast", [
      fx(STRANDS_IN, { place: "targets", scale: 0.9, filter: "UNHOLY_T" }),
      snd(BOON, { volume: 0.5 })
    ])]
  },
  "call-the-departed": selfRow("jb2a.magic_signs.circle.02.necromancy.complete.green", "psfx.incantations.whispers.fem.001.forward.standard.003", { scale: 0.8, below: true }),

  /* ---- tier 5 ---- */
  // The caster slumps at the cast; the eyes go grey only on the failed Test.
  "puppet-of-flesh": resistRow("jb2a.eyes.01.dark_green.single", "psfx.incantations.masculine.002.demonic.harm.004", { scale: 0.7 }, cue("cast", [
    fx("jb2a.smoke.puff.ring.01.white", { place: "source", scale: 0.8, filter: "DIM" }),
    snd(WHISPER, { volume: 0.45 })
  ])),
  "plague-of-undeath": {
    cues: [cue("region", [
      fx("jb2a.template_circle.smoke.001.complete.400px.001.greenpurple", { place: "region", area: 1, filter: "PLAGUE_Y" }),
      fx("jb2a.particles.outward.greenyellow.01.01", { place: "region", area: 0.8, opacity: 0.7, delay: 200 }),
      snd(POISON, { volume: 0.6 })
    ])]
  },
  // A ring of scythe-light at the caster over the card's own 20 ft (self-centred, D-728).
  "reaping": {
    cues: [cue("cast", [
      fx("jb2a.spiritual_weapon.scythe.01.spectral.02.green", { place: "source", scale: 2.4, opacity: 0.9 }),
      snd("psfx.weapon-swooshes.heavy.v1.group03", { volume: 0.6 }),
      fx("jb2a.extras.tmfx.outpulse.circle.01.normal", { place: "source", area: 1, filter: "UNHOLY_T", delay: 200 }),
      snd(NECROTIC, { volume: 0.5, delay: 200 })
    ])]
  },
  "sever-the-soul": {
    cues: [
      cue("cast", [
        fx("jb2a.impact.ground_crack.01.orange", { place: "target", scale: 1, below: true, filter: "UNHOLY_O" }),
        fx(SKULL_SMOKE, { place: "target", scale: 1.2, delay: 200 }),
        snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.6 })
      ]),
      cue("resist", [
        fx("jb2a.markers.fear.dark_purple.01", { place: "resisted", scale: 0.8 }),
        snd(RASP, { volume: 0.4 })
      ])
    ]
  },
  "the-dead-rise": raiseRow("host", { scale: 1.6 }),
  // On each creature the card records, the caster among them where chosen (*You and up to five allies*).
  "shroud-of-the-grave": groupRow("jb2a.smoke.puff.ring.01.white", "psfx.incantations.whispers.fem.001.forward.standard.006", { filter: "DESATURATE" })
});

/* ------------------------------------------------------------------ */
/*  The features, the talents and the events                          */
/* ------------------------------------------------------------------ */

/** A small burst of grave-green at the Necromancer as an Empowered surge is spent. */
const surge = (asset = NECRO_RUNE, sound = RUNE, options = {}) => [
  fx(asset, { place: "source", scale: 0.7, ...options }),
  snd(sound, { volume: 0.45 })
];
/** Mana drawn back in at the Necromancer (Dark Ritual, Unsummon). */
const manaIn = [
  fx("jb2a.extras.tmfx.inflow.circle.01", { place: "source", scale: 1.2, filter: "UNHOLY_T" }),
  snd(CIRCLE, { volume: 0.45 })
];

export const NECRO_FEATURE_ANIMATIONS = Object.freeze({
  /* ---- the events ---- */
  // A green wisp from the creature the Essence came from to the Necromancer, and a glow there.
  [ESSENCE_GAIN_KEY]: {
    cues: [cue("use", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "target>source", travel: "stretch", scale: 0.7, opacity: 0.85 }),
      snd("psfx.incantations.whispers.fem.001.forward.standard.002", { volume: 0.35 }),
      fx("jb2a.particles.inward.greenyellow.01.01", { place: "source", scale: 0.9, opacity: 0.8, waitFor: "travel", overlap: -150 }),
      snd(NECROTIC, { volume: 0.3, waitFor: "travel", overlap: -150 })
    ])]
  },
  // Bone dust and grave-smoke where the body stood, recorded before the token went.
  [COLLAPSE_KEY]: {
    cues: [cue("use", [
      fx("jb2a.smoke.puff.centered.grey", { place: "corpse", scale: 1, filter: "BONE" }),
      fx(SKULL_SMOKE, { place: "corpse", scale: 0.8, delay: 150, opacity: 0.8 }),
      snd(RASP, { volume: 0.35 })
    ])]
  },
  // Raised dead standing up with no raise card (Plague of Undeath's victims): the rising itself.
  [HORDE_RISE_KEY]: {
    cues: [cue("rise", [
      fx("jb2a.impact.ground_crack.01.orange", { place: "risen", scale: 1.4, below: true, filter: "UNHOLY_O" }),
      fx(SKULL_SMOKE, { place: "risen", scale: 1.2, delay: 250 }),
      snd(BREACH, { volume: 0.55 })
    ])]
  },
  // Gut thread pulled through each grafted creature as it stands.
  [GRAFT_KEY]: {
    cues: [cue("rise", [
      fx(STRANDS_IN, { place: "risen", scale: 1.2, filter: "FLESH_T", delay: 500 }),
      snd(MENDING, { volume: 0.5, delay: 500 })
    ])]
  },
  // The hook's chain hauled from the Abomination to the creature it drags in.
  [GRAFT_HOOK_KEY]: {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "FLESH_T" }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.55 }),
      fx("jb2a.impact.004.blue", { place: "target", scale: 0.6, filter: "DARK", waitFor: "travel", overlap: -150 }),
      snd("psfx.impacts.bludgeoning.v1", { volume: 0.5, waitFor: "travel", overlap: -150 })
    ])]
  },
  // The bladder's sick spray on the enemy that breathed it in.
  [GRAFT_BLADDER_KEY]: {
    cues: [cue("use", [
      fx("jb2a.markers.poison.dark_green.01", { place: "targets", scale: 0.6 }),
      fx("jb2a.liquid.splash02.red", { place: "targets", scale: 0.5, filter: "PLAGUE_Y", delay: 150 }),
      snd(POISON, { volume: 0.5 })
    ])]
  },
  // Stitched arms closing on the creature the Abomination hit.
  [GRAFT_ARMS_KEY]: {
    cues: [cue("use", [
      fx(STRANDS_IN, { place: "target", scale: 1, filter: "FLESH_T" }),
      fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "target", scale: 0.7, filter: "DARK", delay: 200 }),
      snd("psfx.impacts.bludgeoning.v1", { volume: 0.5 })
    ])]
  },
  // The phylactery bound: a necromantic circle closing at the lich.
  [LICH_BIND_KEY]: {
    cues: [cue("use", [
      fx(NECRO_CIRCLE, { place: "source", scale: 1, below: true }),
      fx(SKULL_SMOKE, { place: "source", scale: 0.8, delay: 300, opacity: 0.8 }),
      snd(RUNE, { volume: 0.5 })
    ])]
  },
  // The chains falling from an undead creature handed back.
  [ENSLAVE_END_KEY]: {
    cues: [cue("use", [
      fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "targets", scale: 0.8, filter: "UNHOLY_B", opacity: 0.8 }),
      snd(RASP, { volume: 0.4 })
    ])]
  },

  /* ---- 02 §7's features ---- */
  "command-the-dead": {
    cues: [cue("use", [
      fx("jb2a.toll_the_dead.green.bell", { place: "source", scale: 0.9 }),
      snd(BELL, { volume: 0.5 }),
      fx("jb2a.eyes.01.dark_green.single", { place: "targets", scale: 0.5, delay: 300 })
    ])]
  },
  "deathly-vigor": {
    cues: [cue("rise", [
      fx("jb2a.shield_themed.below.eldritch_web.01.dark_purple", { place: "risen", scale: 1.2, below: true, opacity: 0.7, delay: 600 }),
      snd(SHIELD, { volume: 0.4, delay: 600 })
    ])]
  },
  "grave-guard": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "BONE" }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.5 }),
      fx("jb2a.shield_themed.above.eldritch_web.01.dark_purple", { place: "target", scale: 1.1, delay: 250 }),
      snd(SHIELD, { volume: 0.5, delay: 250 })
    ])]
  },
  "dark-ritual": { cues: [cue("use", manaIn)] },
  "unending-dead": {
    cues: [cue("rise", [
      fx(NECRO_RUNE, { place: "risen", scale: 0.9, below: true }),
      fx(SKULL_SMOKE, { place: "risen", scale: 1.1, delay: 200 }),
      snd(SUMMON, { volume: 0.45 })
    ])]
  },
  // The phylactery's return: the lich stands again where the card placed its token.
  "lichdom": {
    cues: [cue("rise", [
      fx(NECRO_CIRCLE, { place: "risen", scale: 2, below: true }),
      fx(SKULL_SMOKE, { place: "risen", scale: 1.5, delay: 300 }),
      snd("psfx.incantations.masculine.001.demonic.summon.003", { volume: 0.6 })
    ])]
  },

  /* ---- 04's Flesh ---- */
  "ghoul-frenzy": {
    cues: [cue("use", [
      ...surge("jb2a.markers.drop.red.02", "psfx.creature.dragons.roar.small"),
      fx("jb2a.markers.drop.red.01", { place: "targets", scale: 0.6, delay: 200 })
    ])]
  },
  "gorge": {
    cues: [cue("use", [
      fx("jb2a.bite.200px.red", { place: "target", scale: 0.8 }),
      snd("psfx.consumables.food-and-drink.consume.food.chew.soft.001", { volume: 0.6 }),
      fx("jb2a.healing_generic.200px.green", { place: "target", scale: 0.8, filter: "DARK", delay: 400 })
    ])]
  },
  // The surge at the Necromancer, the splash as the plague takes a creature, and its mark on that
  // creature while the carrier effect stands (`PLAGUE_CARRIER_FLAG`).
  "plague-carrier": {
    cues: [
      cue("use", surge("jb2a.markers.poison.dark_green.01", POISON)),
      cue("effect", [fx("jb2a.liquid.splash02.red", { place: "effect", scale: 0.6, filter: "DARK" }), snd(POISON, { volume: 0.4 })], { state: PLAGUE_CARRIER_FLAG })
    ],
    loop: loop("effect", [fx("jb2a.markers.poison.dark_green.02", { place: "holder", scale: 0.7, opacity: 0.75 })], { state: PLAGUE_CARRIER_FLAG })
  },
  // At the body that burst (the card's `source`), and a splash on each enemy it reached.
  "bloated-dead": {
    cues: [cue("use", [
      fx("jb2a.toll_the_dead.green.shockwave", { place: "source", scale: 1.4, filter: "PLAGUE_Y" }),
      snd("psfx.cantrips.acid-splash.v1", { volume: 0.6 }),
      fx("jb2a.liquid.splash02.red", { place: "targets", scale: 0.6, filter: "DARK", delay: 150 })
    ])]
  },
  "regenerating-tissue": {
    cues: [cue("use", [
      fx(STRANDS_IN, { place: "target", scale: 1, filter: "FLESH_T" }),
      snd(MENDING, { volume: 0.5 })
    ])]
  },
  // Exhume's once-a-Long-Rest Use: the ground breaking at the Necromancer where the dead lie buried.
  "exhume": {
    cues: [cue("use", [
      fx("jb2a.impact.ground_crack.01.orange", { place: "source", scale: 1.2, below: true, filter: "UNHOLY_O" }),
      snd(BREACH, { volume: 0.5 })
    ])]
  },

  /* ---- 04's Bone ---- */
  "bone-armor": {
    cues: [cue("use", [
      fx("jb2a.aura_themed.01.inward.complete.metal.01.grey", { place: "source", scale: 1.1, filter: "BONE" }),
      snd("psfx.impacts.bludgeoning.v1", { volume: 0.5 })
    ])]
  },
  "bone-vanguard": {
    cues: [cue("use", [
      fx(STRANDS_IN, { place: "target", scale: 0.9, filter: "BONE" }),
      snd(MENDING, { volume: 0.5 })
    ])]
  },
  "restless-bones": {
    cues: [cue("rise", [
      fx("jb2a.ice_spikes.radial.burst.white", { place: "risen", scale: 0.8, filter: "BONE" }),
      fx("jb2a.smoke.puff.centered.grey", { place: "risen", scale: 0.8, filter: "BONE", delay: 200 }),
      snd(BREACH, { volume: 0.5 })
    ])]
  },
  "barbed-bone": {
    cues: [cue("use", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch", scale: 0.45, speed: 1.6, filter: "BONE" }),
      snd("psfx.impacts.slashing.v1", { volume: 0.5, waitFor: "travel", overlap: -150 })
    ])]
  },
  "commander-of-bone": { cues: [cue("use", surge("jb2a.magic_signs.rune.necromancy.complete.green", RUNE, { filter: "BONE" }))] },
  // Skeletal Mastery's Empowered mage: a necromantic rune on the skeleton the Essence turned.
  [MASTERY_KEY]: {
    cues: [cue("rise", [
      fx(NECRO_RUNE, { place: "risen", scale: 0.6, delay: 500 }),
      snd(RUNE, { volume: 0.45, delay: 500 })
    ])]
  },
  "bone-storm": {
    cues: [cue("use", [
      ...surge(),
      fx("jb2a.ice_spikes.radial.burst.white", { place: "targets", scale: 0.9, filter: "BONE", delay: 200 }),
      snd("psfx.impacts.slashing.v1", { volume: 0.55, delay: 200 })
    ])]
  },

  /* ---- 04's Damned ---- */
  "acolytes-sacrifice": {
    cues: [
      cue("use", surge()),
      cue("rise", [
        fx("jb2a.misty_step.02.blue", { place: "risen", scale: 1.1, filter: "SPIRIT_W" }),
        fx(SKULL_SMOKE, { place: "risen", scale: 1, delay: 200, opacity: 0.8 }),
        snd("psfx.incantations.feminine.001.reverb.summon.009", { volume: 0.5 })
      ])
    ]
  },
  "unsummon": { cues: [cue("use", manaIn)] },
  // Its own Region (`featureKey: "circle-of-the-damned"`), cued as it is drawn and turning on the
  // ground while it stands; Grand Circle's move carries the Region, so the loop follows it.
  [CIRCLE_KEY]: {
    cues: [cue("region", [
      fx(NECRO_CIRCLE, { place: "region", area: 1, below: true }),
      snd(CIRCLE, { volume: 0.5 })
    ])],
    loop: loop("region", [fx("jb2a.magic_signs.circle.02.necromancy.loop.dark_green", { place: "region", area: 1, below: true, mask: true, opacity: 0.6 })])
  },
  // Grand Circle's move at rank 2: the circle sign at the Necromancer; the Region itself carries its loop.
  "grand-circle": {
    cues: [cue("use", [
      fx(NECRO_RUNE, { place: "source", scale: 0.7 }),
      snd(CIRCLE, { volume: 0.45 })
    ])]
  },
  "unholy-fervor": {
    cues: [cue("use", [
      fx("jb2a.on_token_buff.001.001.greenpurple", { place: "targets", scale: 1, opacity: 0.85 }),
      snd("psfx.incantations.masculine.001.demonic.help.002", { volume: 0.5 })
    ])]
  },
  "watchful-shades": { cues: [cue("use", surge("jb2a.eyes.01.dark_green.single", "psfx.incantations.whispers.fem.001.forward.standard.008"))] },
  "life-for-a-life": {
    cues: [cue("hold", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "UNHOLY_T" }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.5 }),
      fx("jb2a.healing_generic.200px.green", { place: "target", scale: 0.9, filter: "DARK", delay: 250 }),
      snd(BOON, { volume: 0.45, delay: 250 })
    ])]
  },
  "dark-communion": {
    cues: [cue("use", [
      fx(NECRO_CIRCLE, { place: "source", scale: 1.4, below: true }),
      snd(CIRCLE, { volume: 0.5 }),
      fx("jb2a.healing_generic.200px.green", { place: "targets", scale: 0.8, filter: "DARK", delay: 300 })
    ])]
  },
  "the-black-rite": {
    cues: [cue("use", [
      fx(NECRO_CIRCLE, { place: "source", scale: 2.2, below: true }),
      snd(BELL, { volume: 0.6 }),
      fx("jb2a.healing_generic.400px.green", { place: "targets", scale: 0.9, filter: "DARK", delay: 400 }),
      snd(BOON, { volume: 0.45, delay: 400 })
    ])]
  }
});

/* ------------------------------------------------------------------ */
/*  What each door must fire, and which doors are not built yet       */
/* ------------------------------------------------------------------ */

/**
 * **WHAT EACH KEY'S DOOR FIRES** (the contract, as data): the triggers, the states and the
 * bindings `animation-table.test.mjs#firesOf` reads for these keys, a `door` saying who writes the
 * record, and the `marker` the census looks for in `module/` once the door is built: a constant's
 * NAME (it must appear in a source file other than this module), or `"row"` (the feature's or
 * talent's own row must carry a Use: `onUse`, `grants` and their kin), or both.
 */
const r = (triggers, door, marker = "row", { states = [], bindings = [] } = {}) =>
  Object.freeze({ triggers: Object.freeze(triggers), states: Object.freeze(states), bindings: Object.freeze(bindings), door, marker });

export const NECRO_RECORDS = Object.freeze({
  [ESSENCE_GAIN_KEY]: r(["use"], "the death watch's pool write carries ESSENCE_GAIN_OPTION; records.mjs reads it through essenceGainRecord", "essenceGainRecord"),
  [COLLAPSE_KEY]: r(["use"], "the Token delete that collapses raised dead carries COLLAPSE_OPTION; records.mjs reads it through collapseRecordFor", "COLLAPSE_OPTION"),
  [HORDE_RISE_KEY]: r(["rise"], "Plague of Undeath's rising posts a summon card under HORDE_RISE_KEY with `risen`", "HORDE_RISE_KEY"),
  [GRAFT_KEY]: r(["rise"], "the raise card's `raisedWith` names the grafted tokens; records.mjs reads it through raisedWithRecords", "raisedWithRecords"),
  [GRAFT_HOOK_KEY]: r(["use"], "a creature failing the Test its Chain hook hit asked is pulled, and the graft door posts a feature card from the Abomination naming it", "GRAFT_HOOK_KEY"),
  [GRAFT_BLADDER_KEY]: r(["use"], "an enemy failing the Test its turn start beside the bladder asked is Poisoned, and the graft door posts a feature card naming it", "GRAFT_BLADDER_KEY"),
  [GRAFT_ARMS_KEY]: r(["use"], "a creature failing the Test a melee hit asked is Entangled, and the graft door posts a feature card naming it", "GRAFT_ARMS_KEY"),
  [LICH_BIND_KEY]: r(["use"], "Lichdom's Use binds the phylactery in a Long Rest's window and posts a feature card from the lich", "LICH_BIND_KEY"),
  [ENSLAVE_END_KEY]: r(["use"], "the control's end hands the creature back and posts a feature card naming it", "ENSLAVE_END_KEY"),
  [MASTERY_KEY]: r(["rise"], "the raise card's `raisedWith` names the mage Skeletal Mastery's Empowered line stood up", "MASTERY_KEY"),
  "command-the-dead": r(["use"], "the Empowered surge's Use card"),
  "deathly-vigor": r(["rise"], "the raise card's `raisedWith` names the tokens given temporary Health", "raisedWithRecords"),
  "grave-guard": r(["use"], "the Reaction at the damage door posts a feature card naming the servant"),
  "dark-ritual": r(["use"], "the Use card"),
  "unending-dead": r(["rise"], "the raisedDown offer's card records the servant in `risen`"),
  "lichdom": r(["rise"], "the phylactery return card records the lich's placed token in `risen`"),
  "ghoul-frenzy": r(["use"], "the Empowered surge's Use card"),
  "gorge": r(["use"], "the Use card naming the ghoul or Abomination"),
  "plague-carrier": r(["use", "effect"], "the surge's Use card, and the tick laid on a failed Test carrying PLAGUE_CARRIER_FLAG", "PLAGUE_CARRIER_FLAG", { states: [PLAGUE_CARRIER_FLAG], bindings: ["effect"] }),
  "bloated-dead": r(["use"], "the raisedDown door posts a feature card from the body that burst", "BLOATED_DEAD_KEY"),
  "regenerating-tissue": r(["use"], "the Empowered surge's Use card, and the turn start's mending card on the creature"),
  "exhume": r(["use"], "the once-a-Long-Rest Use card"),
  "grand-circle": r(["use"], "the rank 2 move's Use card; the circle's own Region carries its loop to the new point"),
  "bone-armor": r(["use"], "the Use card"),
  "bone-vanguard": r(["use"], "the Empowered surge's Use card"),
  "restless-bones": r(["rise"], "the raisedDown door's card records the skeleton in `risen`", "RESTLESS_BONES_KEY"),
  "barbed-bone": r(["use"], "Bone Shield's door posts a feature card naming the attacker", "BARBED_BONE_KEY"),
  "commander-of-bone": r(["use"], "the Empowered surge's Use card"),
  "bone-storm": r(["use"], "the Use card naming the enemies damaged"),
  "acolytes-sacrifice": r(["use", "rise"], "the Use card, recording the Shade in `risen`"),
  "unsummon": r(["use"], "the Use card"),
  [CIRCLE_KEY]: r(["region"], "the circle door's one Region carries featureKey and identifier CIRCLE_KEY", "CIRCLE_KEY", { bindings: ["region"] }),
  "unholy-fervor": r(["use"], "the Use card naming the living allies"),
  "watchful-shades": r(["use"], "the rank 2 Use card"),
  "life-for-a-life": r(["hold"], "the asked hold posts a deathHold card naming the ally spared", "LIFE_FOR_A_LIFE_KEY"),
  "dark-communion": r(["use"], "the rite's Use card naming the allies healed"),
  "the-black-rite": r(["use"], "the Use card naming the allies chosen")
});

/**
 * **THE KEYS WHOSE DOOR IS NOT BUILT YET** (the Necromancer plan's Phase 4, run beside this one).
 * The door team strikes a key as its door lands; the Vitest fails a pending key whose door has
 * landed, and a struck key whose door is missing.
 */
export const NECRO_DOORS_PENDING = Object.freeze([
  // Phase 4c-T built the other eighteen; Barbed Bone rides Bone Shield's Reaction, 4c-S's door
  // (`effects/necromancer-spells.mjs#barbedBoneStrikes`), whose card posts under `BARBED_BONE_KEY`.
]);

/**
 * **WHAT HAS NO ROW, AND WHY**: every feature and talent of the class that plays nothing of its
 * own. A passive changes a number the sheet shows, or a raise's result, and a picture would stand
 * for nothing that happened.
 */
export const NECRO_NO_ROW = Object.freeze({
  /* 02 §7 */
  "grave-calling": "passive: it adds two spells to those known, and each casts through its own row",
  "claim-the-fallen": "its Reaction casts Raise Dead or Animate Corpse through the raise door, and that spell's card plays the raise",
  /* 04's Flesh */
  "shambling-horde": "passive: Animate Corpse takes more corpses, and the raise card plays a rising on each",
  "grafted-flesh": "its grafts ride the raise card's `raisedWith` and play as the graft stitching (`graft:stitch`)",
  "flesh-offering": "passive: a corpse destroyed for a discount at the Death spell's own cast, which plays",
  "surgeons-hand": "passive: it widens the graft menu, and a graft given plays as the graft stitching",
  "practiced-stitcher": "passive: a discount on grafts, which change no picture",
  "masterwork-abomination": "passive: the Abomination's Health doubles and a graft may be given twice; the raise and the stitching play",
  /* 04's Bone */
  "skeletal-archery": "passive: a Raise Dead's skeletons rise as archers, and the raise card plays the rising on each",
  "marrowguard": "passive: a standing reduction to Physical damage, drawn on no blow",
  "swelling-ranks": "passive: horde places, a number on the panel",
  "ranks-of-bone": "passive: Raise Dead takes more corpses, and the raise card plays a rising on each",
  "the-endless-host": "passive: horde places, a number on the panel",
  /* 04's Damned */
  "cult-fervor": "passive: a Boon to allies in the circle, whose own loop stands while it does",
  "sacrificial-strength": "a rider on every collapse by choice, whose own picture (`horde:collapse`) plays; a card for each would be chat spam",
  "grim-sacrament": "passive: Dark Ritual's cap, a number on its card"
});
