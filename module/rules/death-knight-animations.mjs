/**
 * **WHAT THE DEATH KNIGHT LOOKS LIKE AND SOUNDS LIKE** (the Death Knight plan's Phase 6, run F5;
 * D-723 to D-730 are the standing rules). Pure data, no Foundry imports: three tables that
 * `rules/animation-table.mjs` spreads into its own -
 *
 *  - `DK_SPELL_ANIMATIONS`: a row for each of the sixteen tier 1 spells 07 §17 and the Death
 *    Knight's curated Shadow and Frost added, into `SPELL_ANIMATIONS`, whose census asks for one;
 *  - `DK_EXPANDED_SPELL_ANIMATIONS`: a row for every Death Knight spell above tier 1, into
 *    `spell-animation-expansion.mjs#EXPANDED_SPELL_ANIMATIONS` (the four that moved from the
 *    Warlock - Grave Coil, Graveblight, Necrotic Shell and Contagion - take the Death look here);
 *  - `DK_FEATURE_ANIMATIONS`: the class features and talents whose doors write a record, into
 *    `FEATURE_ANIMATIONS`, and the RUNE FLARE: `rune:blood` and `rune:frost`, played off the
 *    record the one rune door writes on every spend (`documents/runes.mjs#spendRunesOn`,
 *    `rules/animation-records.mjs#RUNE_SPEND_OPTION`).
 *
 * The grammar is the table's own (its file comment): a row is `{cues, loop?}` or `{reason}`, a
 * cue fires on an EVENT and a loop stands while the world holds its STATE (D-729), a failed
 * Casting Test never animates on any trigger and a miss has no impact step (`rules/animation.mjs
 * #plan`), and nothing is placed on a creature the record does not name (D-724 to D-726).
 * **Every asset is a full leaf key held against `tools/animation/assets.json`** (D-723) and
 * every one here is JB2A's or PSFX's: a Jinker's asset enters only through `COMPARISONS` and the
 * lead's pick (D-727). **Every number is a starting value**, read against the frames run F5
 * rendered and to be tuned on the lead's review.
 *
 * The colours: Blood is red, Frost is blue-white, and the Death school is a sickly grave-green
 * over shadow - WoW's three runes. JB2A carries few of those natively, so `DK_FILTERS` moves a
 * hue or lays a tint, each one a starting value read off the renders.
 */

import { RUNE_KEYS } from "./animation-records.mjs";

/** An effect step. */
const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
/** A sound step. */
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
/** A cue; a feature's `effect` cue may name the state it answers. */
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop; a feature's `effect` loop names the state it follows. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

/**
 * **THE DEATH KNIGHT'S RECOLOURS**, spread into `animation-table.mjs#FILTERS`. A hue rotation on a
 * coloured asset, a tint (which MULTIPLIES) on a near-white one - the table's own two kinds.
 */
export const DK_FILTERS = Object.freeze({
  /**
   * Blue into grave-green: a cast swirl, a misty step, a vortex, an aura. `FEL_B`'s hue, dimmed.
   * **READ OFF THE FIRST RENDERS** (run F5): -115 drew teal, and a purple asset moved by any hue
   * went grey, so purple assets keep their own colour (a shadowed register the Death school shares).
   */
  UNHOLY_B: Object.freeze({ hue: -145, saturate: 0.1, brightness: 0.75 }),
  /** Orange ground cracks into grave-green: `FEL_O`'s hue, dimmed. The first build's blue move drew them red. */
  UNHOLY_O: Object.freeze({ hue: 75, saturate: 0.2, brightness: 0.7 }),
  /** A near-white pulse washed grave-green. */
  UNHOLY_T: Object.freeze({ tint: "#86b34a", brightness: 0.85 }),
  /** A strand or a pulse washed blood red: a TINT, since the first build's hue move drew a purple heal green. */
  BLOOD_T: Object.freeze({ tint: "#ff3a3a", brightness: 1.1 }),
  /** Green into blood red: the spectral blade of Dancing Runeweapon. */
  BLOOD_G: Object.freeze({ hue: -115, saturate: 0.3, brightness: 0.8 }),
  /** A near-white pulse washed frost-blue. */
  FROST_T: Object.freeze({ tint: "#9fd8ff", brightness: 1.05 }),
  /** White ice washed the colour of old bone: Ossuary Wall's rising. */
  BONE: Object.freeze({ tint: "#cfc3a0", brightness: 0.9 }),
  /** An orange energy wall emptied to pale bone: Ossuary Wall while it stands. */
  BONE_O: Object.freeze({ saturate: -0.85, brightness: 1.15 }),
  /**
   * Ground cracks washed the grave-green of desecrated ground: a TINT, which multiplies.
   * **RETUNED OFF THE RENDERS** (D-1012, O-381): `UNHOLY_O`'s 0.2 saturation and 0.7 brightness under
   * a 0.55 opacity read grey-brown, and a hue move alone (75, saturation 0.5) left the cracks' white
   * cores white - a hue rotation cannot colour white. The wash greens the cores and darkens the
   * orange rims to olive.
   */
  DESECRATE: Object.freeze({ tint: "#8fd650", brightness: 1.1 })
});

/* ------------------------------------------------------------------ */
/*  Shared looks                                                       */
/* ------------------------------------------------------------------ */

const NECROTIC = "psfx.impacts.magicaleffects.necrotic";
const COLD = "psfx.impacts.magicaleffects.cold";
const WHISPER = "psfx.incantations.whispers.masc.001.forward.standard.003";
const SUMMON = "psfx.incantations.masculine.001.demonic.summon.003";

/** A Death cast at the knight's hand: the restrained swirl, grave-green. */
const deathCast = (scale = 0.8) => fx("jb2a.cast_generic.02.blue", { place: "source", scale, filter: "UNHOLY_B" });

/** A necromantic rune at the knight, for a spell whose corpse the card does not record. */
/** The words every stand-in the lead approved ends on (D-1012, O-381). */
const APPROVED = " The lead approved it as it stands (D-1012).";

const corpseRune = sound => [
  fx("jb2a.magic_signs.rune.necromancy.complete.green", { place: "source", scale: 0.6 }),
  snd(sound, { volume: 0.5 })
];

/**
 * **THE SAME RUNE WHERE THE CORPSE LAY** (O-396; the lead: *"Yes"*): a marking spell whose card
 * records the corpse it chose (`corpse`, D-1014) draws at that body, and a card that recorded none
 * keeps the rune at the knight (`fallback: "source"`), as Corpse Burst's burst does.
 */
const markedCorpseRune = sound => [
  fx("jb2a.magic_signs.rune.necromancy.complete.green", { place: "corpse", fallback: "source", scale: 0.6 }),
  snd(sound, { volume: 0.5 })
];

/**
 * **THE RISING** (07 §17's raise spells and 02's Army of the Dead): a necromantic circle at the
 * knight on the card, then - on the `rise` trigger - the ground breaking and grave-smoke on EVERY
 * token the raise stood up, which the card records (`risen`, the raise door's own placement). A
 * raise whose card recorded no token plays the circle alone; nothing is drawn on a corpse.
 */
function raiseRow({ scale = 1, roar = false } = {}) {
  return Object.freeze({
    cues: [
      cue("cast", [
        fx("jb2a.magic_signs.circle.02.necromancy.complete.dark_green", { place: "source", scale: 1.2 * scale, below: true }),
        snd(SUMMON, { volume: 0.55 })
      ]),
      cue("rise", [
        fx("jb2a.impact.ground_crack.01.orange", { place: "risen", scale: 1.6 * scale, below: true, filter: "UNHOLY_O" }),
        fx("jb2a.toll_the_dead.green.skull_smoke", { place: "risen", scale: 1.3 * scale, delay: 250 }),
        snd(roar ? "psfx.creature.dragons.roar.small" : "psfx.creature.movement.burrow.breach", { volume: 0.6 })
      ])
    ]
  });
}

/** A strand drawn from the target back into the knight, ending in a mark of what was taken. */
function drainRow(filter = null, { at = "jb2a.toll_the_dead.green.skull_smoke", sound = NECROTIC } = {}) {
  return Object.freeze({
    cues: [cue("cast", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", travel: "stretch", ...(filter ? { filter } : {}) }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.6 }),
      fx(at, { place: "target", scale: 0.8 }),
      snd(sound, { volume: 0.5 })
    ])]
  });
}

/** A brief cast at the knight with one sound: a utility spell with nothing else recorded. */
function selfRow(asset, sound, options = {}) {
  return Object.freeze({ cues: [cue("cast", [fx(asset, { place: "source", scale: 0.9, ...options }), snd(sound, { volume: 0.55 })])] });
}

/* ------------------------------------------------------------------ */
/*  The sixteen tier 1 spells                                          */
/* ------------------------------------------------------------------ */

export const DK_SPELL_ANIMATIONS = Object.freeze({
  /* ---- Death (07 §17) ---- */
  // The burst where the corpse lay, which the card records (`corpse`, D-1014, O-383); a card that
  // recorded no corpse keeps the first build's burst on each creature it records. No bone
  // shrapnel is installed, so the toll's shockwave stands in for the corpse breaking.
  "corpse-burst": {
    cues: [cue("cast", [
      deathCast(0.7),
      fx("jb2a.toll_the_dead.green.shockwave", { place: "corpse", fallback: "targets", scale: 1.6 }),
      snd(NECROTIC)
    ])],
    standIn: `No bone-shrapnel asset is installed; the toll's green shockwave stands in for the corpse bursting.${APPROVED}`
  },
  // Damage lands either way (half on a success), so the wound plays at cast; Bleeding is the
  // condition's.
  "vein-rend": {
    cues: [cue("cast", [
      fx("jb2a.claws.200px.red", { place: "target", scale: 0.8 }),
      fx("jb2a.markers.drop.red.02", { place: "target", scale: 0.8, delay: 200 }),
      snd("psfx.impacts.slashing.v1", { volume: 0.7 })
    ])]
  },
  "unholy-mending": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.in.green.01", { place: "target", scale: 0.9, filter: "DARK" }),
      snd(NECROTIC, { volume: 0.45 })
    ])]
  },
  // A placed ground circle: the dead's hands at the Region, briefly; the Entangled is the
  // failed Test's, and nothing stands for it.
  "grasp-of-the-grave": {
    cues: [cue("region", [
      fx("jb2a.impact.ground_crack.01.orange", { place: "region", area: 0.9, below: true, filter: "UNHOLY_O" }),
      fx("jb2a.black_tentacles.dark_purple", { place: "region", area: 0.9, hold: 1400, fadeOut: 500, delay: 200 }),
      snd("psfx.creature.movement.burrow.breach", { volume: 0.7 })
    ])],
    standIn: `No grasping-hands asset is installed; JB2A's black tentacles stand in, over grave-green cracks.${APPROVED}`
  },
  // A skin while the temporary Health's effect stands: the loop is the laid effect's.
  "unholy-armor": {
    cues: [cue("cast", [
      fx("jb2a.shield_themed.above.eldritch_web.01.dark_purple", { place: "source", scale: 1.3 }),
      snd("psfx.1st-level-spells.shield-spell.intro.v1.003", { volume: 0.6 })
    ])],
    loop: loop("effect", [fx("jb2a.shield_themed.below.eldritch_web.01.dark_purple", { place: "holder", scale: 1.35, below: true, opacity: 0.55 })])
  },
  "deaths-advance": {
    cues: [cue("cast", [
      fx("jb2a.misty_step.01.blue", { place: "source", scale: 0.9, below: true, filter: "UNHOLY_B" }),
      snd("psfx.cantrips.gust.v1", { volume: 0.5 })
    ])]
  },
  "read-the-dead": { cues: [cue("cast", corpseRune(WHISPER))] },
  // Drawn at the corpse it preserves, which the card records (O-396); at the knight where none is.
  "stay-the-rot": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.runes.circle.simple.necromancy", { place: "corpse", fallback: "source", scale: 0.9, below: true, filter: "UNHOLY_T" }),
      snd("psfx.magic-signs.rune.v1.abjuration.complete", { volume: 0.4 })
    ])]
  },
  "plaguesight": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.radar.circle.pulse.01.normal", { place: "source", scale: 1.4, filter: "UNHOLY_T" }),
      snd(WHISPER, { volume: 0.4 })
    ])]
  },
  // On each willing creature named, or each the Apply reaches where none was named.
  "kinship-of-the-dead": {
    cues: [cue("cast|effect", [
      fx("jb2a.markers.skull.purple.01", { place: "targets", scale: 0.6 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.005", { volume: 0.4 })
    ])]
  },
  "raise-skeleton": raiseRow(),
  "raise-ghoul": raiseRow(),

  /* ---- The curated Shadow and Frost ---- */
  // A cold lance at the caster it interrupts; no silenced mark, since the silence waits on that
  // caster's failed Test.
  "mind-freeze": {
    cues: [cue("cast", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch", scale: 0.5, speed: 1.5 }),
      snd("psfx.cantrips.ray-of-frost.v1", { volume: 0.6 }),
      fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.5, waitFor: "travel", overlap: -150 })
    ])]
  },
  // Damage lands either way; the Slowed is the failed Test's.
  "icy-touch": {
    cues: [cue("cast", [
      fx("jb2a.ray_of_frost.blue", { place: "source>target", travel: "stretch" }),
      snd("psfx.cantrips.ray-of-frost.v2", { volume: 0.7 }),
      fx("jb2a.impact.ground_crack.frost.01.white", { place: "target", scale: 0.8, below: true, waitFor: "travel", overlap: -200 }),
      snd(COLD, { waitFor: "travel", overlap: -200 })
    ])]
  },
  // The frost drawn into the weapon; the hit it promises plays that weapon's own blow.
  "frost-strike": {
    cues: [cue("cast", [
      fx("jb2a.aura_themed.01.inward.complete.cold.01.blue", { place: "source", scale: 1 }),
      snd("psfx.weapon-swooshes.cold.v1.group01", { volume: 0.6 })
    ])]
  },
  // A self-centred area: at cast, on the knight, over the card's own 30 ft (D-728). No horn
  // sound is installed; the thunderclap stands in for the blast.
  "horn-of-winter": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.outpulse.circle.01.normal", { place: "source", area: 1, filter: "FROST_T" }),
      snd("psfx.cantrips.thunderclap.v1", { volume: 0.55 }),
      fx("jb2a.aura_themed.01.outward.complete.cold.01.blue", { place: "source", scale: 1.4, delay: 150 })
    ])],
    standIn: "No horn sound is installed in PSFX; the thunderclap stands in for the horn's blast."
  }
});

/* ------------------------------------------------------------------ */
/*  The Death Knight's spells above tier 1                             */
/* ------------------------------------------------------------------ */

export const DK_EXPANDED_SPELL_ANIMATIONS = Object.freeze({
  /* ---- tier 2 ---- */
  "black-mist": {
    cues: [cue("region", [
      fx("jb2a.fog_cloud.01.white", { place: "region", area: 1, filter: "DARKEN", hold: 900, fadeOut: 400 }),
      snd("psfx.cantrips.gust.v1", { volume: 0.5 })
    ])],
    loop: loop("sustain-region", [fx("jb2a.fog_cloud.01.white", { place: "region", area: 1, mask: true, filter: "DARKEN", opacity: 0.65 })])
  },
  "blood-bind": {
    cues: [cue("cast", [
      fx("jb2a.markers.chain.standard.complete.02.red", { place: "target", scale: 1 }),
      snd(NECROTIC, { volume: 0.5 })
    ])]
  },
  "bloodtrail": selfRow("jb2a.markers.drop.red.01", WHISPER, { scale: 0.7 }),
  "chains-of-ice": {
    cues: [cue("cast", [
      fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "target", scale: 1 }),
      snd(COLD, { volume: 0.6 })
    ])]
  },
  "death-and-decay": {
    cues: [cue("region", [
      fx("jb2a.template_circle.smoke.001.complete.400px.001.greenpurple", { place: "region", area: 1, filter: "DARK" }),
      snd(NECROTIC, { volume: 0.6 })
    ])],
    loop: loop("sustain-region", [
      fx("jb2a.ground_cracks.01.orange", { place: "region", area: 1, below: true, filter: "UNHOLY_O", opacity: 0.5 }),
      fx("jb2a.template_circle.smoke.001.loop.400px.001.greenpurple", { place: "region", area: 1, mask: true, filter: "DARK", opacity: 0.65 })
    ])
  },
  "death-pact": drainRow(null, { at: "jb2a.toll_the_dead.green.skull_smoke" }),
  "dread-cry": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.outpulse.circle.02.normal", { place: "source", area: 1, filter: "UNHOLY_T" }),
      snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.6 })
    ])]
  },
  "echo-of-the-slain": { cues: [cue("cast", corpseRune("psfx.incantations.whispers.masc.001.forward.standard.007"))] },
  "grave-labor": { cues: [cue("cast", corpseRune(SUMMON))] },
  "heartrend": {
    cues: [cue("cast", [
      fx("jb2a.markers.drop.red.03", { place: "target", scale: 0.9 }),
      snd("psfx.impacts.slashing.v1", { volume: 0.6 })
    ])]
  },
  "howling-blast": {
    cues: [cue("region", [
      fx("jb2a.ice_spikes.radial.burst.white", { place: "region", area: 0.9 }),
      snd("psfx.5th-level-spells.cone-of-cold.v1.001", { volume: 0.6 })
    ])]
  },
  "mask-of-the-living": selfRow("jb2a.smoke.puff.ring.01.white", WHISPER, { filter: "DIM" }),
  "ossuary-wall": {
    cues: [cue("region", [
      fx("jb2a.template_line.ice.01.blue", { place: "region-line", travel: "stretch", filter: "BONE" }),
      snd("psfx.creature.movement.burrow.breach", { volume: 0.6 })
    ])],
    loop: loop("sustain-region", [fx("jb2a.energy_wall.01.25x05ft.01.loop.orange", { place: "region-line", travel: "span", filter: "BONE_O" })]),
    standIn: `No bone wall is installed; JB2A's ice line washed bone rises, and its energy wall emptied to pale bone stands.${APPROVED}`
  },
  "raise-crypt-fiend": raiseRow({ scale: 1.2 }),
  "strangulate": {
    cues: [cue("cast", [
      fx("jb2a.markers.chain.standard.complete.02.red", { place: "target", scale: 0.8, filter: "DARK" }),
      snd(NECROTIC, { volume: 0.5 })
    ])]
  },
  "unholy-frenzy": {
    cues: [cue("cast|effect", [
      fx("jb2a.markers.drop.red.02", { place: "target", scale: 0.8 }),
      snd("psfx.creature.dragons.roar.small", { volume: 0.4 })
    ])]
  },
  "grave-coil": {
    cues: [cue("cast", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "source>target", travel: "stretch", filter: "DARK", scale: 1.3 }),
      fx("jb2a.toll_the_dead.green.skull_smoke", { place: "target", scale: 1.2, waitFor: "travel", overlap: -250 }),
      snd(NECROTIC, { waitFor: "travel", overlap: -250 })
    ])]
  },

  /* ---- tier 3 ---- */
  "bone-threshold": selfRow("jb2a.extras.tmfx.runes.circle.simple.necromancy", "psfx.magic-signs.rune.v1.abjuration.complete", { filter: "BONE", below: true }),
  "corpse-eyes": { cues: [cue("cast", corpseRune("psfx.incantations.whispers.masc.001.forward.standard.009"))] },
  "deaths-embrace": drainRow(),
  "dread-visage": selfRow("jb2a.markers.fear.dark_purple.01", "psfx.incantations.masculine.001.demonic.harm.001", { scale: 0.8 }),
  // 07's cone, poured from the knight once the Region is placed; the roar at cast.
  "frostwyrm-breath": {
    cues: [
      cue("cast", [
        fx("jb2a.cast_generic.water.02.blue", { place: "source", scale: 1 }),
        snd("psfx.creature.dragons.roar.small", { volume: 0.7 })
      ]),
      cue("region", [
        fx("jb2a.breath_weapons.cold.cone.blue", { place: "region-cone", travel: "stretch" }),
        snd("psfx.creature.dragons.attacks.breath.small.cold", { volume: 0.7 })
      ])
    ]
  },
  "glacial-advance": {
    cues: [cue("region", [
      fx("jb2a.template_line.ice.01.blue", { place: "region-line", travel: "stretch" }),
      snd(COLD, { volume: 0.6 })
    ])]
  },
  "gravewell": {
    cues: [cue("region", [
      fx("jb2a.template_circle.vortex.intro.blue", { place: "region", area: 1, filter: "UNHOLY_B" }),
      snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.6 })
    ])],
    loop: loop("sustain-region", [fx("jb2a.template_circle.vortex.loop.blue", { place: "region", area: 1, mask: true, filter: "UNHOLY_B", opacity: 0.55 })])
  },
  "lichward": selfRow("jb2a.shield_themed.above.eldritch_web.01.dark_purple", "psfx.1st-level-spells.shield-spell.intro.v1.003", { scale: 1.3 }),
  // Centred on the knight and held: forty feet across, on the knight, while the Sustain is held.
  "pall-of-despair": {
    cues: [cue("cast", [
      fx("jb2a.template_circle.smoke.001.complete.800px.001.greenpurple", { place: "source", sizeFt: 40, filter: "DARK" }),
      snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.5 })
    ])],
    loop: loop("sustain-self", [fx("jb2a.template_circle.smoke.001.loop.800px.001.greenpurple", { place: "holder", sizeFt: 40, below: true, filter: "DARK", opacity: 0.5 })])
  },
  "pestilence": {
    cues: [cue("cast", [
      fx("jb2a.toll_the_dead.green.shockwave", { place: "target", scale: 1.6 }),
      snd(NECROTIC, { volume: 0.6 })
    ])]
  },
  "raise-abomination": raiseRow({ scale: 1.4 }),
  // At the corpse it seals, which the card records (O-396); at the knight where none is.
  "seal-the-soul": { cues: [cue("cast", markedCorpseRune("psfx.magic-signs.rune.v1.abjuration.complete"))] },
  "soul-rend": drainRow(null, { at: "jb2a.impact.004.blue" }),
  // Unholy Blight's swarm about the knight while the Sustain is held: no locust asset is
  // installed, so the darkened fireflies stand in, as the expansion's `insects` shape does.
  "unholy-blight": {
    cues: [cue("cast", [
      deathCast(1),
      snd("psfx.cantrips.gust.v1", { volume: 0.5 })
    ])],
    loop: loop("sustain-self", [fx("jb2a.fireflies.many.01.green", { place: "holder", sizeFt: 20, opacity: 0.9 })]),
    standIn: `No locust swarm is installed; JB2A's green fireflies stand in for the blight's insects.${APPROVED}`
  },
  "graveblight": {
    cues: [cue("region", [
      fx("jb2a.template_circle.smoke.001.complete.800px.001.greenpurple", { place: "region", area: 1 }),
      snd(NECROTIC, { volume: 0.6 })
    ])],
    loop: loop("sustain-region", [fx("jb2a.template_circle.smoke.001.loop.800px.001.greenpurple", { place: "region", area: 1, mask: true, opacity: 0.55 })])
  },
  "necrotic-shell": selfRow("jb2a.shield_themed.above.eldritch_web.01.dark_purple", "psfx.1st-level-spells.shield-spell.intro.v1.003", { scale: 1.4 }),

  /* ---- tier 4 and 5 ---- */
  "contagion": {
    cues: [cue("region", [
      fx("jb2a.darkness.green", { place: "region", area: 1, opacity: 0.45, hold: 1200, fadeOut: 400 }),
      snd(NECROTIC, { volume: 0.6 })
    ])]
  },
  "raise-dracolich": raiseRow({ scale: 2, roar: true })
});

/* ------------------------------------------------------------------ */
/*  The features, the talents and the rune flare                       */
/* ------------------------------------------------------------------ */

const [BLOOD_RUNE, FROST_RUNE] = RUNE_KEYS;

export const DK_FEATURE_ANIMATIONS = Object.freeze({
  /**
   * **THE RUNE FLARE** (02 §7: every rune spent, for any reason): played off the record
   * `documents/runes.mjs#spendRunesOn` writes on its own update, one cue a kind spent, at the
   * knight's token. Blood is the red sign, Frost the blue one - JB2A's own colours, no filter.
   */
  [BLOOD_RUNE]: {
    cues: [cue("use", [
      fx("jb2a.magic_signs.rune.evocation.complete.red", { place: "source", scale: 1.1 }),
      snd("psfx.weapon-swooshes.necrotic.v1.group01", { volume: 0.35 })
    ])]
  },
  [FROST_RUNE]: {
    cues: [cue("use", [
      fx("jb2a.magic_signs.rune.abjuration.complete.blue", { place: "source", scale: 1.1 }),
      snd("psfx.weapon-swooshes.cold.v1.group01", { volume: 0.35 })
    ])]
  },
  // The inscription's own card (`effects/death-knight.mjs#useInscription`, `kind: "inscription"`).
  "inscribed-runeweapon": {
    cues: [cue("use", [
      fx("jb2a.magic_signs.circle.02.necromancy.complete.green", { place: "source", scale: 0.8, below: true }),
      snd("psfx.magic-signs.rune.v1.conjuration.complete", { volume: 0.4 })
    ])]
  },
  // The grip thrown at the creature named; then, on its failed Test, the PULL (D-1015, O-383):
  // the forced-movement door records the displacement on its own operation
  // (`rules/animation-records.mjs#FORCED_MOVE_OPTION`) and the `arrive` cue draws the strands
  // along the path the creature was dragged, from where it stood to where it lands beside the
  // knight, and the chain on it there. A creature that passes its Test is not moved and draws no pull.
  "death-grip": {
    cues: [
      cue("use", [
        fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch" }),
        snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.6 }),
        fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "target", scale: 0.8, filter: "UNHOLY_B", delay: 300 })
      ]),
      cue("arrive", [
        fx("jb2a.energy_strands.range.standard.purple.01", { place: "step", travel: "stretch", movers: ["pull"] }),
        snd("psfx.ranged-magic.generic.energy-strands.001", { volume: 0.5 }),
        fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "step-to", movers: ["pull"], scale: 0.8, filter: "UNHOLY_B", delay: 250 })
      ])
    ]
  },
  // A rider on the attack's dialog: the blood drawn back on the hit, `missed` on a miss.
  "death-strike": {
    cues: [cue("hit", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", travel: "stretch", filter: "BLOOD_T" }),
      fx("jb2a.markers.drop.red.02", { place: "source", scale: 0.9, delay: 350 }),
      snd("psfx.weapon-swooshes.necrotic.v1.group01", { volume: 0.6 })
    ])]
  },
  // The Fevers: the carrier's arrival, and a picture on the creature for as long as it carries one.
  "plague": {
    cues: [
      cue("effect", [fx("jb2a.impact_themed.ice_shard.blue", { place: "effect", scale: 0.6 }), snd(COLD, { volume: 0.4 })], { state: "frostFever" }),
      cue("effect", [fx("jb2a.markers.drop.red.01", { place: "effect", scale: 0.6 }), snd(NECROTIC, { volume: 0.4 })], { state: "bloodPlague" })
    ],
    loops: [
      loop("effect", [fx("jb2a.markers.snowflake.blue.01", { place: "holder", scale: 0.8, opacity: 0.75 })], { state: "frostFever" }),
      loop("effect", [fx("jb2a.markers.drop.red.02", { place: "holder", scale: 0.8, opacity: 0.75 })], { state: "bloodPlague" })
    ]
  },
  // Its own Region (`placeDesecration`), cued as it is laid and standing while it stands.
  "desecration": {
    cues: [cue("region", [
      fx("jb2a.magic_signs.circle.02.necromancy.complete.dark_green", { place: "region", area: 0.9, below: true }),
      snd(NECROTIC, { volume: 0.5 })
    ])],
    loop: loop("region", [fx("jb2a.ground_cracks.01.orange", { place: "region", area: 1, below: true, mask: true, filter: "DESECRATE", opacity: 0.8 })])
  },
  // A laid presence on the knight: cued as it arrives, its aura standing on the knight.
  "unholy-presence": {
    cues: [cue("effect", [
      fx("jb2a.extras.tmfx.outpulse.circle.01.normal", { place: "effect", sizeFt: 65, filter: "UNHOLY_T" }),
      snd("psfx.incantations.masculine.001.demonic.help.002", { volume: 0.5 })
    ], { state: "deathKnightPresence" })],
    loop: loop("effect", [fx("jb2a.template_circle.aura.01.loop.small.bluepurple", { place: "holder", scale: 3, below: true, filter: "UNHOLY_B", opacity: 0.55 })], { state: "deathKnightPresence" })
  },
  "march-of-the-damned": {
    cues: [cue("effect", [
      fx("jb2a.toll_the_dead.green.shockwave", { place: "effect", scale: 2.2 }),
      snd("psfx.cantrips.toll-the-dead.ominous-bell.001", { volume: 0.6 })
    ], { state: "deathKnightPresence" })],
    loop: loop("effect", [fx("jb2a.template_circle.aura.01.loop.large.bluepurple", { place: "holder", sizeFt: 65, below: true, filter: "UNHOLY_B", opacity: 0.3 })], { state: "deathKnightPresence" })
  },
  "army-of-the-dead": {
    cues: [
      cue("use", [
        fx("jb2a.magic_signs.circle.02.necromancy.complete.dark_green", { place: "source", scale: 2, below: true }),
        snd("psfx.cantrips.toll-the-dead.ominous-bell.001", { volume: 0.6 })
      ]),
      cue("rise", [
        fx("jb2a.impact.ground_crack.01.orange", { place: "risen", scale: 1.6, below: true, filter: "UNHOLY_O" }),
        fx("jb2a.toll_the_dead.green.skull_smoke", { place: "risen", scale: 1.3, delay: 250 }),
        snd("psfx.creature.movement.burrow.breach", { volume: 0.6 })
      ])
    ]
  },
  // The mount-work card (`effects/mount-works.mjs#useMountWork`), by the kind chosen.
  "deathcharger": {
    cues: [
      cue("use", [
        fx("jb2a.toll_the_dead.green.skull_smoke", { place: "source", scale: 1.1 }),
        snd("psfx.incantations.masculine.001.demonic.summon.003", { volume: 0.5 })
      ], { state: "undead" }),
      cue("use", [
        fx("jb2a.misty_step.02.blue", { place: "source", scale: 1.2 }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.5 })
      ], { state: "spectral" })
    ]
  },

  /* ---- 04's Blood ---- */
  "rune-tap": {
    cues: [cue("use", [
      fx("jb2a.markers.drop.red.02", { place: "source", scale: 1 }),
      snd(NECROTIC, { volume: 0.4 })
    ])]
  },
  "mark-of-blood": {
    cues: [cue("use", [
      fx("jb2a.markers.drop.red.03", { place: "target", scale: 0.8 }),
      snd(NECROTIC, { volume: 0.5 })
    ])]
  },
  "dark-command": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "BLOOD_T" }),
      snd("psfx.incantations.masculine.001.demonic.harm.001", { volume: 0.5 })
    ])]
  },
  "vampiric-blood": {
    cues: [cue("use", [
      fx("jb2a.markers.drop.red.01", { place: "source", scale: 1 }),
      fx("jb2a.markers.drop.red.03", { place: "source", scale: 1, delay: 200 }),
      snd(NECROTIC, { volume: 0.5 })
    ])]
  },
  "blood-tap": {
    cues: [cue("use", [
      fx("jb2a.magic_signs.rune.evocation.complete.red", { place: "source", scale: 0.7 }),
      snd("psfx.magic-signs.rune.v1.conjuration.complete", { volume: 0.4 })
    ])]
  },
  // The blade arriving as the state is laid, and dancing at the knight while it stands.
  "dancing-runeweapon": {
    cues: [cue("effect", [
      fx("jb2a.magic_signs.rune.evocation.complete.red", { place: "effect", scale: 0.9 }),
      snd("psfx.weapon-swooshes.heavy.v1.group02", { volume: 0.6 })
    ], { state: "dancingRuneweapon" })],
    // The blade is a small figure inside a wide frame, so the frame is scaled past the token
    // (D-1012, O-381: read off the renders).
    loop: loop("effect", [fx("jb2a.spiritual_weapon.greatsword.01.spectral.02.green", { place: "holder", scale: 3.2, filter: "BLOOD_G", opacity: 0.9 })], { state: "dancingRuneweapon" })
  },

  /* ---- 04's Frost ---- */
  // At the knight alone: who is held is its Test's (the Champion's rule for a Use that asks one).
  "hungering-cold": {
    cues: [cue("use", [
      fx("jb2a.ice_spikes.radial.burst.white", { place: "source", scale: 2.2 }),
      snd(COLD, { volume: 0.6 })
    ])]
  },
  "empower-runeweapon": {
    cues: [cue("use", [
      fx("jb2a.magic_signs.rune.abjuration.complete.blue", { place: "source", scale: 0.8 }),
      snd("psfx.weapon-swooshes.cold.v1.group01", { volume: 0.5 })
    ])]
  },
  // Asked inside a blow, so no Use card: the state's arrival is the cue, and the ice stands while it does.
  "icebound-fortitude": {
    cues: [cue("effect", [
      fx("jb2a.impact.ground_crack.frost.01.white", { place: "effect", scale: 1.1, below: true }),
      snd(COLD, { volume: 0.6 })
    ], { state: "iceboundFortitude" })],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.ice.01.blue", { place: "holder", scale: 1.4, below: true, opacity: 0.8 }),
      fx("jb2a.shield_themed.above.ice.01.blue", { place: "holder", scale: 1.4, opacity: 0.8 })
    ], { state: "iceboundFortitude" })
  },
  // The winter about the knight: fifteen feet past its square, while the state stands.
  "remorseless-winter": {
    cues: [cue("effect", [
      fx("jb2a.aura_themed.01.outward.complete.cold.01.blue", { place: "effect", sizeFt: 35 }),
      snd("psfx.cantrips.gust.v1", { volume: 0.6 })
    ], { state: "remorselessWinter" })],
    loop: loop("effect", [fx("jb2a.aura_themed.01.orbit.loop.cold.01.blue", { place: "holder", sizeFt: 35, opacity: 0.6 })], { state: "remorselessWinter" })
  }
});
