/**
 * **WHAT THE DEMON HUNTER LOOKS LIKE AND SOUNDS LIKE** (the Demon Hunter plan's Phase 6; D-1580). D-723 to
 * D-730 are the standing rules, and `sovereign-animations.mjs` and `death-knight-animations.mjs` are the
 * shape. Pure data and pure record readers, no Foundry imports. Four tables the animation tables spread into
 * their own:
 *
 *  - `DH_SPELL_ANIMATIONS`: a row for each of the class's eight tier 1 spells (07, *Restricted Demon
 *    Hunter*), into `animation-table.mjs#SPELL_ANIMATIONS`, whose census holds every tier 1 spell to a row and
 *    a reviewed direction (`tools/animation/directions.mjs`);
 *  - `DH_EXPANDED_SPELL_ANIMATIONS`: a row for each of its twelve spells above tier 1, into
 *    `spell-animation-expansion.mjs#EXPANDED_SPELL_ANIMATIONS`. The ten borrowed Fel spells keep the rows they
 *    already play, for the Warlock and the hunter alike;
 *  - `DH_FEATURE_ANIMATIONS`: 02's features whose doors write a record, and the states the class lays (the
 *    demon's shape, I Have Prepared's minute, Inner Demon's torment, Flame Crash's burning ground), into
 *    `animation-table.mjs#FEATURE_ANIMATIONS`;
 *  - `DH_TALENT_ANIMATIONS`: 04's talents whose Use posts a card, spread into the same table only once the
 *    talent's row has landed (`liveTalentAnimations`), so no row waits on a door that does not exist yet.
 *
 * The grammar is the table's own: a row is `{cues, loop?|loops?}` or `{reason}`, **a cue fires on an EVENT
 * and a loop stands while the world holds its STATE** (D-729), so the reconciler ends the shape's aura when
 * its effect goes and no code here ends anything. A failed Casting Test never animates (D-756), a miss has no
 * impact step, and a condition's picture waits for the creature's own failed Test (`resist`). **Every asset
 * is a full leaf key held against `tools/animation/assets.json`** (D-723), JB2A's or PSFX's; a Jinker's asset
 * enters only through `COMPARISONS` and the lead's pick (D-727). **Every cue carries a sound step.** **Every
 * number is a starting value**, to be tuned on the lead's review of rendered frames.
 *
 * The colours: fel fire is JB2A's orange turned green (`FEL_O`), and a near-white file is tinted fel green
 * (`DH_FEL_W`). The Fel track's own badge is fel green too, which is fine on the board: the sheet's Hatred
 * bar is Momentum red (D11), so the two never meet on one surface.
 */

/** An effect step. */
const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
/** A sound step. */
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
/** A cue; a feature's `effect` cue names the state it answers. */
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop; a feature's `effect` loop names the state it follows. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

/**
 * **THE DEMON HUNTER'S RECOLOURS**, spread into `animation-table.mjs#FILTERS` beside the Sovereign's. A tint
 * MULTIPLIES, so it suits a near-white file; a coloured one takes the table's own `FEL_O`, `FEL_B`, `FEL_P`.
 */
export const DH_FILTERS = Object.freeze({
  /** A near-white file (spikes, a thrown blade, smoke, a glaive's arc) washed fel green. */
  DH_FEL_W: Object.freeze({ tint: "#4dff5a", brightness: 1.1 }),
  /** A near-white file washed a darker, sicklier fel: the demon's own aura. */
  DH_FEL_DARK: Object.freeze({ tint: "#2fbf3a", brightness: 0.9 })
});

/* ------------------------------------------------------------------ */
/*  The keys the class's doors write                                   */
/* ------------------------------------------------------------------ */

/**
 * **THE STATE WORDS THE DEMON'S SHAPE IS NAMED BY** (`rules/animation-records.mjs#stateEntriesOf`): an
 * `unleashed` shape is Demon Unleashed's, and its `winged` stamp says the hunter took it at Fel 10 or more
 * (`effects/demon-hunter-features.mjs#takeUnleashed`). MY READING: the wings drawn are the ones the hunter had
 * when the shape was taken; I Have Prepared reads Fel as 20, so its shape is always winged.
 */
export const UNLEASHED_STATE = "shape";
export const UNLEASHED_WINGED_STATE = "unleashedWinged";
/** I Have Prepared's carrier flag (`demon-hunter-features.mjs#I_HAVE_PREPARED.flag`), its state word. */
export const PREPARED_STATE = "prepared";
/** Inner Demon's torment carrier (`demon-hunter-spells.mjs#TORMENT_FLAG`), its state word. */
export const TORMENT_STATE = "innerDemon";

/**
 * **THE KEYS NO ONE FEATURE OR SPELL OWNS** (a state is one table's or the other's, so a spell's own
 * identifier is never a feature key): Inner Demon's torment standing on its victim, and Flame Crash's burning
 * ground, a Region the GM's client places with this key beside its cast (`effects/demon-hunter-spells.mjs
 * #placeCrashHere`), so the ground stands a loop for as long as the Region does, though the spell is timed.
 */
export const TORMENT_KEY = "inner-demons-torment";
export const TORMENT_NAME = "Inner Demon's Torment";
export const FLAME_CRASH_GROUND_KEY = "flame-crash:ground";
export const DH_STATE_KEYS = Object.freeze([TORMENT_KEY, FLAME_CRASH_GROUND_KEY]);

/**
 * **THE CARD A DEMON HUNTER DOOR POSTS THAT IS NO USE CARD** (kind `demonHunterCard`): Devour Soul's landed
 * devour (`effects/demon-hunter-features.mjs#devourFromCard`), naming the creature whose soul was taken.
 * Any other `demonHunterCard` card plays nothing.
 */
export const DH_CARD_KIND = "demonHunterCard";
export const DH_CARD_CUES = Object.freeze({
  devoured: Object.freeze({ key: "devour-soul", trigger: "use", target: "targetUuid" })
});

/**
 * Which cue a `demonHunterCard` card plays, or null: its first flag in `DH_CARD_CUES`' order that is set, and
 * the uuid on the card naming the creature it happened to.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @returns {{key: string, trigger: string, targetUuid: string|null}|null}
 */
export function demonHunterCardCue(flags = {}) {
  if (flags?.kind !== DH_CARD_KIND) return null;
  for (const [flag, spec] of Object.entries(DH_CARD_CUES)) {
    if (!flags[flag]) continue;
    const uuid = typeof flags[spec.target] === "string" && flags[spec.target] ? flags[spec.target] : null;
    return { key: spec.key, trigger: spec.trigger, targetUuid: uuid };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Shared looks                                                       */
/* ------------------------------------------------------------------ */

const FIRE = "psfx.impacts.magicaleffects.fire";
const CAST_FIRE = "psfx.casting.fire.001";
const SWOOSH = "psfx.weapon-swooshes.necrotic.v1.group01";
const HEAVY = "psfx.weapon-swooshes.heavy.v1.group01";
const SLASH = "psfx.impacts.slashing.v1";
const BLUNT = "psfx.impacts.bludgeoning.v1";
const NECROTIC = "psfx.impacts.magicaleffects.necrotic";
const HARM_F = "psfx.incantations.feminine.001.demonic.harm.007";
const HARM_M = "psfx.incantations.masculine.001.demonic.harm.001";
const HARM_DEEP = "psfx.incantations.masculine.002.demonic.harm.004";
const WHISPER = "psfx.incantations.whispers.masc.001.forward.standard.003";
const MISTY_IN = "psfx.2nd-level-spells.misty-step.v1.intro.generic";
const MISTY_OUT = "psfx.2nd-level-spells.misty-step.v1.outro.generic";
const WINGS = "psfx.creature.movement.flight.wings.small";
const BEAM = "psfx.ranged-magic.generic.beam.001";
const STRANDS_SOUND = "psfx.ranged-magic.generic.energy-strands.001";
const PROJECTILE = "psfx.ranged-magic.generic.projectile.ranged.001";
const SHIELD = "psfx.1st-level-spells.shield-spell.intro.v1.003";
const TOLL = "psfx.cantrips.toll-the-dead.v1.002";
const EXPLODE = "psfx.3rd-level-spells.fireball.v1.001.explosion";
const DREAD = "psfx.1st-level-spells.dissonant-whispers.v1.002";

const FEL_IMPACT = "jb2a.impact.fire.01.orange";
const FEL_BOLT = "jb2a.fire_bolt.orange";
const FEL_FLAMES = "jb2a.flames.04.loop.orange";
const FEL_BURST = "jb2a.explosion.08.orange";
const OUTPULSE = "jb2a.extras.tmfx.outpulse.circle.01.normal";
const INFLOW = "jb2a.extras.tmfx.inflow.circle.01";
const OUTFLOW = "jb2a.extras.tmfx.outflow.circle.01";
const STRAND = "jb2a.energy_strands.range.standard.purple.01";
const DISPEL_HIT = "jb2a.impact.004.blue";
const GLAIVE = "jb2a.spiritual_weapon.glaive.01.spectral.02.green";
const GLAIVE_ARC = "jb2a.glaive.melee.01.white";
const EYES = "jb2a.eyes.01.dark_green.single";
const EYES_MANY = "jb2a.eyes.01.dark_green.many";
const CRACK = "jb2a.impact.ground_crack.01.orange";
const SHADOW = "jb2a.drop_shadow.dark_black";
const FEATHERS = "jb2a.swirling_feathers.outburst.01.textured";
const SIGIL = "jb2a.magic_signs.rune.evocation.complete.red";

/** The fel sigil at the hunter's hand as a spell is spoken: what a cast plays before its Test. */
const sigil = (sound = WHISPER, scale = 0.5) => [fx(SIGIL, { place: "source", scale, filter: "FEL_R" }), snd(sound, { volume: 0.45 })];

/**
 * **A SPELL ENDED** (Spellsunder, Siphon the Weave, Devour the Spell): the weave pulled out of the creature
 * and drawn into the hunter - an inflow on the creature, a strand back to the hunter, a dull fel snap.
 */
const unravel = (place = "target") => [
  fx(DISPEL_HIT, { place, scale: 0.7, filter: "FEL_B" }),
  fx(INFLOW, { place, scale: 0.8, filter: "DH_FEL_W", delay: 100 }),
  snd(NECROTIC, { volume: 0.5 })
];

/* ------------------------------------------------------------------ */
/*  The eight tier 1 spells                                            */
/* ------------------------------------------------------------------ */

export const DH_SPELL_ANIMATIONS = Object.freeze({
  // A green hunter's mark pulsing on the creature branded; the brand's compass is a card line.
  "hunters-brand": {
    cues: [cue("cast", [
      fx(EYES, { place: "source", scale: 0.5 }),
      fx("jb2a.hunters_mark.pulse.01.green", { place: "target", scale: 0.8, delay: 150 }),
      snd(WHISPER, { volume: 0.45 })
    ])]
  },
  // A lick of fel fire along the hunter's blades with a hiss.
  "searing-edge": {
    cues: [cue("cast", [
      fx(FEL_IMPACT, { place: "source", scale: 0.55, filter: "FEL_O" }),
      snd(SWOOSH, { volume: 0.5 }),
      snd(CAST_FIRE, { volume: 0.35, delay: 100 })
    ])]
  },
  // Green eyes opening round the hunter across its own 15 feet (thirty across): what the gaze sees is the reader's.
  "gaze-of-the-sightless": {
    cues: [cue("cast", [
      fx(EYES_MANY, { place: "source", scale: 0.7 }),
      fx(OUTPULSE, { place: "source", sizeFt: 30, filter: "DH_FEL_W", opacity: 0.6, delay: 150 }),
      snd(WHISPER, { volume: 0.45 })
    ])]
  },
  // A touch at the cast; the weave torn out only of the creature that failed.
  spellsunder: {
    cues: [
      cue("cast", [fx(FEL_IMPACT, { place: "target", scale: 0.45, filter: "FEL_O" }), snd(SLASH, { volume: 0.4 })]),
      cue("resist", unravel("resisted"))
    ]
  },
  // Fel fire wreathing the hunter as it rises, and the fire standing on the hunter while the Sustain is held.
  "immolation-aura": {
    cues: [cue("cast", [
      fx(FEL_IMPACT, { place: "source", scale: 0.9, filter: "FEL_O" }),
      snd(CAST_FIRE, { volume: 0.55 })
    ])],
    loop: loop("sustain-self", [fx(FEL_FLAMES, { place: "holder", scale: 1.4, filter: "FEL_O", opacity: 0.8 })])
  },
  // Bone spikes breaking through the hunter's skin, and a close skin of spikes standing while the effect does.
  "demon-spikes": {
    cues: [cue("cast", [
      fx("jb2a.ice_spikes.radial.burst.white", { place: "source", scale: 0.45, filter: "DH_FEL_W" }),
      snd(SLASH, { volume: 0.5 }),
      snd(SHIELD, { volume: 0.35, delay: 150 })
    ])],
    loop: loop("effect", [fx("jb2a.ice_spikes.radial.loop.white", { place: "holder", scale: 0.4, filter: "DH_FEL_W", opacity: 0.55 })])
  },
  // A bolt of fel fire to the creature, and flames on it while the rising burn stands.
  "agonizing-flames": {
    cues: [cue("cast", [
      fx(FEL_BOLT, { place: "source>target", travel: "stretch", scale: 0.8, filter: "FEL_O" }),
      snd(PROJECTILE, { volume: 0.45 }),
      fx(FEL_IMPACT, { place: "target", scale: 0.6, filter: "FEL_O", waitFor: "travel", overlap: -150 }),
      snd(FIRE, { volume: 0.5, waitFor: "travel", overlap: -150 })
    ])],
    loop: loop("effect", [fx("jb2a.flames.01.orange", { place: "holder", scale: 0.7, filter: "FEL_O", opacity: 0.75 })])
  },
  // Spectral fel glaives whirling back to the hunter's hands with a whoosh; where they lay is the card's.
  "call-the-glaives": {
    cues: [cue("cast", [
      fx(GLAIVE, { place: "source", scale: 0.8 }),
      snd(HEAVY, { volume: 0.5 }),
      snd(SWOOSH, { volume: 0.35, delay: 200 })
    ])]
  }
});

/* ------------------------------------------------------------------ */
/*  The twelve above tier 1                                            */
/* ------------------------------------------------------------------ */

export const DH_EXPANDED_SPELL_ANIMATIONS = Object.freeze({
  /* ---- tier 2 ---- */
  // The hunter lands in a burst of fel fire that cracks the ground, and a blow on each creature beside it; the
  // Prone is each failure's. The card is posted where the hunter landed, so `source` is the landing.
  hellstrike: {
    cues: [cue("cast", [
      fx(CRACK, { place: "source", scale: 1.1, filter: "FEL_O", below: true }),
      fx(FEL_BURST, { place: "source", scale: 0.9, filter: "FEL_O" }),
      snd(BLUNT, { volume: 0.6 }),
      snd(EXPLODE, { volume: 0.45, delay: 80 }),
      fx(FEL_IMPACT, { place: "targets", scale: 0.55, filter: "FEL_O", delay: 200 })
    ])]
  },
  // The spell pulled out of the creature it stood on and drawn into the hunter as Energy.
  "siphon-the-weave": {
    cues: [cue("cast", [
      ...unravel("target"),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "FEL_P", delay: 250 }),
      snd(STRANDS_SOUND, { volume: 0.4, delay: 250 })
    ])]
  },
  // A green shimmer slipping over the hunter.
  "unnatural-agility": {
    cues: [cue("cast", [fx("jb2a.shimmer.01.blue", { place: "source", scale: 1.1, filter: "FEL_B" }), snd(MISTY_IN, { volume: 0.5 })])]
  },
  // The sigil at the cast; spectral fel chains only on the demon that failed.
  "nether-snare": {
    cues: [
      cue("cast", sigil()),
      cue("resist", [fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "resisted", scale: 0.85, filter: "FEL_B" }), snd(BLUNT, { volume: 0.45 })])
    ]
  },
  // Green eyes flaring at the hunter, then fel fire pouring along the placed line; the Scorched only on each
  // creature that failed.
  "eye-beam": {
    cues: [
      cue("cast", [fx(EYES, { place: "source", scale: 0.6 }), snd(HARM_F, { volume: 0.45 })]),
      cue("region", [
        fx("jb2a.breath_weapons.acid.line.green", { place: "region-line", travel: "stretch" }),
        snd(BEAM, { volume: 0.6 }),
        snd(FIRE, { volume: 0.45, delay: 200 })
      ]),
      cue("resist", [fx(FEL_IMPACT, { place: "resisted", scale: 0.55, filter: "FEL_O" }), snd(FIRE, { volume: 0.45 })])
    ]
  },
  // The glaives hurled from the hunter's hands; the burning ground where they land is its own row
  // (`flame-crash:ground`), on the Region the GM's client places.
  "flame-crash": {
    cues: [cue("cast", [
      fx(GLAIVE, { place: "source", scale: 0.8 }),
      snd(HEAVY, { volume: 0.55 }),
      snd(CAST_FIRE, { volume: 0.35, delay: 150 })
    ])]
  },

  /* ---- tier 3 ---- */
  // A wave of fel rolling out across the hunter's own 30 feet (sixty across), and a faint fel ring standing round
  // the hunter while the Sustain is held.
  "hunting-ground": {
    cues: [cue("cast", [
      fx(OUTPULSE, { place: "source", sizeFt: 60, filter: "DH_FEL_W", opacity: 0.7 }),
      snd(HARM_M, { volume: 0.5 })
    ])],
    loop: loop("sustain-self", [fx("jb2a.template_circle.out_pulse.02.loop.bluewhite", { place: "holder", sizeFt: 60, filter: "FEL_B", opacity: 0.3, below: true })])
  },
  // The Sustained spell torn out of whatever held it, drawn into the hunter as Hatred.
  "devour-the-spell": {
    cues: [cue("cast", [
      ...unravel("target"),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "FEL_P", delay: 250 }),
      fx(INFLOW, { place: "source", scale: 0.8, filter: "DH_FEL_DARK", delay: 550 }),
      snd(STRANDS_SOUND, { volume: 0.45, delay: 250 })
    ])]
  },
  // A whirl of fel glaives about the hunter; each blow is its own attack card and plays its weapon's strike.
  "glaive-tempest": {
    cues: [cue("cast", [
      fx(GLAIVE_ARC, { place: "source", scale: 1.3, filter: "DH_FEL_W" }),
      fx(GLAIVE, { place: "source", scale: 0.9, delay: 120 }),
      snd(HEAVY, { volume: 0.6 }),
      snd(SWOOSH, { volume: 0.45, delay: 150 })
    ])]
  },
  // A slash at the creature touched; the fel curse of the shorn Health only on the creature that failed.
  shear: {
    cues: [
      cue("cast", [fx(GLAIVE_ARC, { place: "target", scale: 0.8, filter: "DH_FEL_W" }), snd(SLASH, { volume: 0.5 })]),
      cue("resist", [fx("jb2a.condition.curse.01.002.red", { place: "resisted", scale: 0.7, filter: "FEL_R" }), snd(NECROTIC, { volume: 0.5 })])
    ]
  },
  // Fel smoke pouring out along the placed cone, and each soul that failed torn half out of its creature.
  "draw-soul": {
    cues: [
      cue("cast", sigil(HARM_DEEP, 0.55)),
      cue("region", [
        fx("jb2a.breath_weapons.poison.cone.green", { place: "region-cone", travel: "stretch", opacity: 0.85 }),
        snd(DREAD, { volume: 0.55 })
      ]),
      cue("resist", [fx(OUTFLOW, { place: "resisted", scale: 0.7, filter: "DH_FEL_W" }), snd(STRANDS_SOUND, { volume: 0.4 })])
    ]
  },
  // Green eyes at the hunter; a fel terror only on the creature that failed. The torment that stands is its own
  // row (`inner-demons-torment`).
  "inner-demon": {
    cues: [
      cue("cast", [fx(EYES, { place: "source", scale: 0.55 }), snd(HARM_F, { volume: 0.45 })]),
      cue("resist", [fx("jb2a.markers.fear.dark_purple.02", { place: "resisted", scale: 0.7, filter: "FEL_P" }), snd(DREAD, { volume: 0.5 })])
    ]
  }
});

/* ------------------------------------------------------------------ */
/*  The features and the states                                        */
/* ------------------------------------------------------------------ */

/** The demon's aura, standing on the hunter while a shape lasts. */
const demonAura = (extra = []) => [
  fx(FEL_FLAMES, { place: "holder", scale: 1.25, filter: "FEL_O", opacity: 0.55, below: true }),
  ...extra
];

export const DH_FEATURE_ANIMATIONS = Object.freeze({
  /* ---- 02 §7's features ---- */
  // A rush of fel wind round the hunter as it pushes past its limits.
  "beyond-limits": {
    cues: [cue("use", [
      fx("jb2a.wind_lines.01.01.white", { place: "source", scale: 0.9, filter: "DH_FEL_W", opacity: 0.8 }),
      snd(SWOOSH, { volume: 0.45 })
    ])]
  },
  // A fel smoke where the hunter sprang from and a hard landing where the step put it (the card's recorded step).
  "hunters-leap": {
    cues: [
      cue("use", [
        fx("jb2a.smoke.puff.ring.01.white", { place: "step-from", fallback: "source", scale: 0.8, filter: "DH_FEL_W" }),
        snd(MISTY_IN, { volume: 0.45 })
      ]),
      cue("arrive", [
        fx(CRACK, { place: "step-to", scale: 0.7, filter: "FEL_O", below: true }),
        fx("jb2a.smoke.puff.ring.01.white", { place: "step-to", scale: 0.8, filter: "DH_FEL_W", delay: 80 }),
        snd(BLUNT, { volume: 0.5 })
      ])
    ]
  },
  // The demon let out: a fel eruption at the hunter with the beat of wings, and while the shape lasts the fel
  // aura beneath it - with a shadow below and fel feathers about it where it took the shape winged (Fel 10 or
  // more, or I Have Prepared's minute).
  "demon-unleashed": {
    cues: [
      cue("use", [
        fx(FEL_BURST, { place: "source", scale: 1.1, filter: "FEL_O" }),
        fx(FEATHERS, { place: "source", scale: 1.3, filter: "DH_FEL_DARK", delay: 150 }),
        snd(HARM_DEEP, { volume: 0.55 }),
        snd(WINGS, { volume: 0.5, delay: 200 })
      ]),
      cue("effect", [fx(FEL_IMPACT, { place: "effect", scale: 0.7, filter: "FEL_O" }), snd(FIRE, { volume: 0.35 })], { state: UNLEASHED_STATE }),
      cue("effect", [fx(FEATHERS, { place: "effect", scale: 1, filter: "DH_FEL_DARK" }), snd(WINGS, { volume: 0.45 })], { state: UNLEASHED_WINGED_STATE })
    ],
    loops: [
      loop("effect", demonAura(), { state: UNLEASHED_STATE }),
      loop("effect", demonAura([
        fx(SHADOW, { place: "holder", scale: 1.15, below: true, opacity: 0.6 }),
        fx("jb2a.wind_lines.01.01.white", { place: "holder", scale: 1, filter: "DH_FEL_W", opacity: 0.4 })
      ]), { state: UNLEASHED_WINGED_STATE })
    ]
  },
  // Every ward the tattoos hold shut opened at once: a great fel eruption and a circle of fel under the hunter,
  // standing for as long as the minute lasts.
  "i-have-prepared": {
    cues: [
      cue("use", [
        fx(FEL_BURST, { place: "source", scale: 1.6, filter: "FEL_O" }),
        fx(OUTPULSE, { place: "source", scale: 2.4, filter: "DH_FEL_W", delay: 150 }),
        snd(HARM_DEEP, { volume: 0.65 }),
        snd(EXPLODE, { volume: 0.4, delay: 150 })
      ]),
      cue("effect", [fx(OUTPULSE, { place: "effect", scale: 1.4, filter: "DH_FEL_W" }), snd(HARM_M, { volume: 0.4 })], { state: PREPARED_STATE })
    ],
    loop: loop("effect", [
      fx("jb2a.magic_signs.circle.02.evocation.loop.dark_red", { place: "holder", scale: 1.4, below: true, filter: "FEL_R", opacity: 0.55 })
    ], { state: PREPARED_STATE })
  },
  // The blow's fel flare on the creature struck.
  "fel-lash": {
    cues: [cue("hit", [
      fx(FEL_IMPACT, { place: "targets", scale: 0.65, filter: "FEL_O" }),
      snd(FIRE, { volume: 0.5 })
    ])]
  },
  // The creature's power torn out along a fel strand and burned off.
  "mana-rend": {
    cues: [cue("hit", [
      fx(DISPEL_HIT, { place: "targets", scale: 0.6, filter: "FEL_B" }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "FEL_P", delay: 150 }),
      snd(STRANDS_SOUND, { volume: 0.45, delay: 150 })
    ])]
  },
  // The soul drawn out of the fallen creature into the hunter (Devour Soul's landed card).
  "devour-soul": {
    cues: [cue("use", [
      fx(OUTFLOW, { place: "targets", scale: 0.7, filter: "DH_FEL_W" }),
      fx(STRAND, { place: "target>source", travel: "stretch", filter: "FEL_P", delay: 200 }),
      fx(INFLOW, { place: "source", scale: 0.9, filter: "DH_FEL_DARK", delay: 500 }),
      snd(STRANDS_SOUND, { volume: 0.45, delay: 200 }),
      snd(NECROTIC, { volume: 0.4, delay: 500 })
    ])]
  },

  /* ---- the states no one feature owns ---- */
  // Inner Demon's torment: a fel terror settling on the victim, and a faint fel fire on it for as long as the
  // torment holds it.
  [TORMENT_KEY]: {
    cues: [cue("effect", [fx("jb2a.markers.fear.dark_purple.02", { place: "effect", scale: 0.55, filter: "FEL_P" }), snd(DREAD, { volume: 0.3 })], { state: TORMENT_STATE })],
    loop: loop("effect", [fx("jb2a.flames.02.orange", { place: "holder", scale: 0.6, filter: "FEL_O", opacity: 0.6 })], { state: TORMENT_STATE })
  },
  // Flame Crash's burning ground: fel fire bursting up where the glaives land, and burning green for as long as
  // the Region stands.
  [FLAME_CRASH_GROUND_KEY]: {
    cues: [cue("region", [
      fx(FEL_BURST, { place: "region", area: 0.8, filter: "FEL_O" }),
      snd(EXPLODE, { volume: 0.5 })
    ])],
    loop: loop("region", [fx("jb2a.fire_ring.500px.red", { place: "region", area: 1, filter: "FEL_R", opacity: 0.6 })])
  }
});

/**
 * **04's TALENTS WHOSE USE POSTS A CARD** (the Betrayer's Gift of the Skull and Chaos Blast and the Sufferer's
 * Silence the Weave, each a granted Use; their row in `talent-effects.mjs` is the talents phase's). Gift of the
 * Skull's lesser shape (`shapes.mjs#SHAPE_KINDS.skull`) stands its own loop. Spread only once the talent is
 * through `liveTalentAnimations`, and the census judges each against the row that fires it.
 */
export const DH_TALENT_ANIMATIONS = Object.freeze({
  // Illidan's first change at the Skull of Gul'dan: a smaller fel eruption at the hunter, and while the lesser shape
  // lasts a thinner fel fire beneath it (the shape kind `skull`, named for the talent).
  "gift-of-the-skull": {
    cues: [
      cue("use", [
        fx(FEL_BURST, { place: "source", scale: 0.8, filter: "FEL_O" }),
        snd(HARM_M, { volume: 0.5 })
      ]),
      cue("effect", [fx(FEL_IMPACT, { place: "effect", scale: 0.6, filter: "FEL_O" }), snd(FIRE, { volume: 0.3 })], { state: UNLEASHED_STATE })
    ],
    loop: loop("effect", [fx(FEL_FLAMES, { place: "holder", scale: 1.05, filter: "FEL_O", opacity: 0.4, below: true })], { state: UNLEASHED_STATE })
  },
  // WC3's chaos attack: a fel bolt from the demon to the creature and a burst where it strikes.
  "chaos-blast": {
    cues: [cue("use", [
      fx(FEL_BOLT, { place: "source>target", travel: "stretch", scale: 1, filter: "FEL_O" }),
      snd(PROJECTILE, { volume: 0.5 }),
      fx(FEL_BURST, { place: "targets", scale: 0.6, filter: "FEL_O", waitFor: "travel", overlap: -150 }),
      snd(FIRE, { volume: 0.5, waitFor: "travel", overlap: -150 })
    ])]
  },
  // A dull toll and a wave of fel rolling out from the Sufferer across its 30 feet, unravelling the weave.
  "silence-the-weave": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", sizeFt: 60, filter: "DH_FEL_W" }),
      fx(INFLOW, { place: "source", scale: 1.2, filter: "DH_FEL_DARK", delay: 200 }),
      snd(TOLL, { volume: 0.55 })
    ])]
  }
});

/**
 * The talents' rows less any identifier handed in as still waiting on its row. Every talent's row has landed
 * (D-1560) and the class's pending constant is gone (the review's S4), so the table spreads them all.
 *
 * @param {string[]} pending  the pending talent identifiers
 * @returns {object}
 */
export function liveTalentAnimations(pending = []) {
  const waiting = new Set(pending ?? []);
  return Object.freeze(Object.fromEntries(Object.entries(DH_TALENT_ANIMATIONS).filter(([key]) => !waiting.has(key))));
}

/* ------------------------------------------------------------------ */
/*  What each key's door fires, and what has no row                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT EACH KEY'S DOOR FIRES** (the contract, as data; `sovereign-animations.mjs#SOV_RECORDS`' shape): the
 * triggers, states and bindings `animation-table.test.mjs#firesOf` adds for these keys, a `door` naming who
 * writes the record, and the `marker` the census looks for in `module/` outside this file.
 */
const r = (triggers, door, marker, { states = [], bindings = [] } = {}) =>
  Object.freeze({ triggers: Object.freeze(triggers), states: Object.freeze(states), bindings: Object.freeze(bindings), door, marker });

export const DH_RECORDS = Object.freeze({
  "demon-unleashed": r(["effect"], "takeUnleashed writes an unleashed shape, stamped winged at Fel 10 or more", "const winged = featureFel(actor)", { states: [UNLEASHED_STATE, UNLEASHED_WINGED_STATE], bindings: ["effect"] }),
  "gift-of-the-skull": r(["effect"], "the talent's Use takes the lesser shape, kind skull (`SHAPE_KINDS.skull`)", "skull: Object.freeze({", { states: [UNLEASHED_STATE], bindings: ["effect"] }),
  "i-have-prepared": r(["effect"], "startPrepared lays the minute's carrier under I_HAVE_PREPARED.flag", "I_HAVE_PREPARED.flag", { states: [PREPARED_STATE], bindings: ["effect"] }),
  "hunters-leap": r(["arrive"], "the leap's step rides the Use card's steps (landLeap stashes it on the plan)", "plan.step = moved.step"),
  "fel-lash": r(["hit"], "a paid Fel Lash rides the attack card's ridden list (DH_FEATURE_RIDERS)", "DH_FEATURE_RIDERS"),
  "mana-rend": r(["hit"], "a paid Mana Rend rides the attack card's ridden list (DH_FEATURE_RIDERS)", "DH_FEATURE_RIDERS"),
  "devour-soul": r(["use"], "devourFromCard posts a demonHunterCard card flagged devoured, naming the soul's creature", "devoured: true"),
  [TORMENT_KEY]: r(["effect"], "Inner Demon's failure lays the torment carrier under TORMENT_FLAG", "[TORMENT_FLAG]:", { states: [TORMENT_STATE], bindings: ["effect"] }),
  [FLAME_CRASH_GROUND_KEY]: r(["region"], "placeCrashHere places the burning Region with FLAME_CRASH_GROUND_KEY as its featureKey", "featureKey: FLAME_CRASH_GROUND_KEY", { bindings: ["region"] })
});

/**
 * **WHAT HAS NO ROW, AND WHY**: every feature and talent of the class that plays nothing of its own. A passive
 * changes a number, a Test or a dialog line; a door that already plays another row says which.
 */
export const DH_NO_ROW = Object.freeze({
  /* 02 §7 */
  "spectral-sight": "passive: the token's darkvision and See Invisibility and a refused Blinded, nothing an event plays",
  "bane-of-the-legion": "its extra damage rides the blow, whose weapon strike plays; the mark it leaves is a word on the card",
  "fel-surge": "points ticked on the cast dialog; the spell's own cast cue plays",
  "extra-attack": "two attack rolls in one Attack, each playing its weapon's strike",
  "hunters-stride": "passive: Speed on the sheet",
  "warding-tattoos": "passive: Hatred left out of the count at a rest, a line on the rest card",
  /* 04's Betrayer */
  "twin-blades": "passive: the off-hand blow's penalty and damage, each blow playing its weapon's strike",
  "fel-tempered": "passive: Fel Lash's damage, whose own hit cue plays (`fel-lash`)",
  "demonic-visage": "passive: an Armor Point and an Intimidation bonus, numbers on the sheet",
  "taste-of-power": "a pool write (Fel, Hatred, Energy) with no board event of its own",
  "embrace-the-pain": "passive: the Fel the features read, numbers on the sheet",
  "wings-of-the-betrayer": "passive: a flying Speed in the shape, whose own loop stands (`demon-unleashed`)",
  "feed-on-power": "passive: Energy on a Fel Lash hit, whose own hit cue plays (`fel-lash`)",
  "eternal-hunger": "passive: Demon Unleashed's Damage Rating and rounds, whose own cue and loop play",
  "fall-upon-them": "its landing rides Hunter's Leap's arrival (`hunters-leap`), and the Prone is the condition's",
  "betrayers-bargain": "Demon Unleashed's span changed; the shape's own cue and loop play",
  /* 04's Souleater */
  "soul-hunger": "its devour lands through Devour Soul's door, whose landed card plays (`devour-soul`)",
  "reapers-grip": "passive: the scythe's Damage Rating and Soul Hunger's reach",
  "gorging-lash": "passive: healing on a Fel Lash hit, whose own hit cue plays (`fel-lash`)",
  "hoarded-soul": "the soul kept is a gear item in the bags; its keeping rides the devour, whose card plays (`devour-soul`)",
  "demons-due": "passive: the next Fel Lash's price and damage, whose own hit cue plays",
  "sweeping-arc": "its Shadow damage rides the scythe's hit, whose weapon strike plays",
  "kill-after-kill": "its free leap plays Hunter's Leap's own cues (`hunters-leap`)",
  "tear-the-soul": "passive: Fel Lash's damage below half Health, whose own hit cue plays",
  "hobbling-reap": "its Slowed is the condition's own picture",
  "endless-appetite": "passive: Devour Soul's reach and its Reaction, whose card plays (`devour-soul`)",
  "swallow-their-magic": "its ended spells take their own loops away (D-729), and the devour's card plays (`devour-soul`)",
  "feast-of-souls": "its Spirit Test is each creature's own Resist, and the devour's card plays (`devour-soul`)",
  /* 04's Sufferer */
  "iron-will": "passive: a bonus on a Resilience Test, a number on the dialog",
  "measured-breath": "passive: Fel taken off the rest's conversion, a line on the rest card",
  "eyes-of-the-nether": "passive: Spectral Sight's reach on the token",
  "warding-ink": "passive: Hatred left out of the rest's count, a line on the rest card",
  "glaive-ward": "a Ward against one casting, a number in the blow's mitigation",
  "steady-footing": "conditions ended on Beyond Limits, whose own cue plays (`beyond-limits`)",
  "quiet-the-whispers": "a Test at a rest, a line on the rest card",
  "turn-their-fire": "Energy and a caster's Fel damage on a passed Resist, lines on the card",
  "sight-beyond-sight": "passive: illusions and true forms, the table's",
  "bridle-the-demon": "passive: the rest's conversion rate, a line on the rest card",
  "refuse-the-legion": "passive: a refused Charmed and a Bane line on a demon's cast dialog"
});
