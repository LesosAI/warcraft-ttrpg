/**
 * WHAT A COMPLETED ACTION LOOKS LIKE, as data (D-727, D-728). Pure: no Foundry
 * imports, and this file imports nothing at all.
 *
 * `rules/animation.mjs` is the law that reads this; `module/animation/` (Phase
 * 4) is the only thing that touches Sequencer. Here there is nothing but a
 * table: one recipe for every `STRIKE_FORMS` key (D-725), one row for every
 * tier 1 spell in 07, the filters they recolour with and the cast cues several
 * of them share.
 *
 * **EVERY ASSET IS A FULL LEAF KEY.** `Sequencer.Database.entryExists` is a
 * PREFIX match (sequencer.js 4.2.3, L6709-6724), so `jb2a.ice` "exists" and
 * resolves to `ice_spikes`; a branch key would play something nobody chose and
 * nothing would say so. `tools/animation/assets.json` is the committed
 * snapshot of the three installed libraries and `animation-table.test.mjs`
 * holds every key here against it, refusing a branch, a mis-cased path and a
 * registered key with no file.
 *
 * **A STEP'S LIBRARY IS ITS KEY'S ROOT**: `jb2a` is `JB2A_DnD5e`, `psfx` is
 * `psfx`, `jaamod` is Jinker's Animated Art. `plan` drops a step whose module
 * is off, so turning one library off costs its steps and nothing else.
 *
 * **NEAREST STAND-IN** (D-727, the lead's call, amending the design document's
 * *own shapes* line): where the free libraries have no shape for a thing - a
 * sling stone, a blowgun dart, a javelin, a thrown axe, hammer or spear - the
 * row takes the nearest thing that reads right and says so in `standIn`.
 * Jinker's pack fills none of those; what it adds is closer matches for many
 * spells, a thrown net and a saw blade.
 *
 * **JINKER'S ASSETS ENTER ONLY THROUGH THE LEAD'S PICKS** (D-727). A name is
 * not a picture, so where Jinker's pack names a direction more closely than
 * the JB2A draft the candidate is recorded in `COMPARISONS` and Phase 5
 * renders both; the JB2A draft is what ships until the lead chooses. The three
 * `sustain-resisted` loops the candidates would add - Hex, Enslave Demon and
 * Banish - are NOT in `SPELL_ANIMATIONS`; the binding exists and waits for
 * them.
 *
 * **The numbers are starting values.** Scales, delays, opacities and every
 * hue in `FILTERS` are tuned against Phase 5's frames: PIXI's hue rotation is
 * not perceptual and a number that reads right in the head does not on the
 * board.
 *
 * ## The shape of a row
 *
 *     { cues: [{trigger, steps}], loop?: {binding, layers} }   or   { reason }
 *
 * **Triggers** (D-728):
 *
 *  - `cast`         the card, on a SUCCESSFUL Casting Test;
 *  - `region`       a Region placed from a successful card;
 *  - `resist`       a FAILED Resilience Test recorded on a successful card;
 *  - `cast|effect`  the recorded targets at cast; with none recorded, ONCE PER
 *                   RECIPIENT - the trigger is `createActiveEffect`, which
 *                   fires for every effect an Apply lays, so a buff that lands
 *                   on three allies plays on all three. (The plan's *the token
 *                   the cast's FIRST laid effect lands on* is superseded;
 *                   D-729 records it, and `azeroth-rpg.animation` pins it.)
 *
 * **Bindings** (a loop runs while the game holds the state it follows):
 *
 *  - `sustain-self`      the caster holds the Sustain; anchored on the caster;
 *  - `sustain-target`    the same, anchored on the recorded target;
 *  - `sustain-channel`   the same, drawn between the target and the caster;
 *  - `sustain-region`    the same, while its Region stands;
 *  - `effect`            while the laid effect exists and is active;
 *  - `effect-region`     while its Region AND its laid effect both exist;
 *  - `sustain-resisted`  while the caster holds the Sustain AND that target's
 *                        recorded Resilience Test failed. Built, unused: the
 *                        three rows that would use it are the lead's to pick.
 *
 * **A spell's card may record a STEP too** (07's Shadow Walk and Dark Passage,
 * the Legacy branches' door 3): its cue at `cast` may place at `step-from`, and an
 * `arrive` cue plays at `step-to`, both off the moves the card recorded.
 *
 * ## A feature's row (the Legacy branches' door 2)
 *
 * `FEATURE_ANIMATIONS` is keyed by the FEATURE'S KEY (`rules/animation-records.mjs
 * #featureKeyOf`: the slug of the granting talent's name, a class feature's own, a
 * gadget's key; a creature's ability is `ability:<slug>`) and takes the spell row's
 * shape, with its own vocabulary (`FEATURE_TRIGGERS`, `FEATURE_BINDINGS` there):
 *
 *     { cues: [{trigger, steps}], loop?: {binding, layers}, strike? }   or   { reason }
 *
 *  - triggers `use`, `hit`, `hold`, `arrive`, `rise`, `effect`, `region`;
 *  - bindings `effect`, `mark`, `region`, `sustain-self`;
 *  - `strike`, a strike recipe in `STRIKE_ANIMATIONS`' own shape, which an attack
 *    card plays INSTEAD of its form's where the card records the feature it was
 *    made from or a bound attack patch that drew it (04's Serpent Ward: the
 *    Searing totem's spit plays the patch's recipe, not the totem's strike form).
 *
 * A Use whose Casting Test failed plays nothing on any trigger, a `hit` cue on a
 * blow that missed says `missed`, and the Tier 2 and higher spells a Legacy branch
 * teaches - Darkward and Dark Passage - sit in `TAUGHT_SPELL_ANIMATIONS` beside the
 * tier 1 table, so neither table's census is loosened for the other.
 *
 * ## The shape of a step
 *
 * A recipe step is a PLACEMENT and a look; `plan` resolves the placement into
 * pixels from the record and the facts, and never the other way round.
 *
 *  - `kind`     `effect` or `sound`
 *  - `asset`    a full leaf key
 *  - `place`    where it goes, from `PLACES`
 *  - `travel`   `stretch` (Sequencer stretches the file between two points),
 *               `move` (it is flown), `span` (laid at the midpoint, rotated
 *               along the axis and scaled to the length). Only `stretch` is
 *               held against the library's own range entries and templates.
 *  - `scale`    a multiple of the anchor token's width
 *  - `area`     a fraction of the area's diameter, or `[min, max]` for a
 *               scatter. Only where there IS an area to measure: the record's
 *               own for a cue, the Region's for a `*-region` loop
 *  - `sizeFt`   an absolute DIAMETER in feet, for a self-centred sustained
 *               area, which has no Region and no card to read one off
 *  - `filter`   a name in `FILTERS`
 *  - `opacity`, `below` (under the tokens), `rotation`
 *  - `delay`    ms before it starts
 *  - `waitFor: "travel"` with `overlap`  starts when the step before it has
 *               travelled; the overlap is negative to land early
 *  - `grow`, `hold`, `fadeIn`, `fadeOut`   ms
 *  - `count`, `stagger`, `spin`            for repeats and orbits
 *  - `volume`, `bucketed`                  sounds only
 *  - `mask`     true where an area effect is clipped to its Region
 */

/* ------------------------------------------------------------------ */
/*  Where a step can go                                                */
/* ------------------------------------------------------------------ */

/**
 * Every placement a recipe may ask for. `plan` refuses a step whose anchor it
 * cannot resolve rather than guessing one, so an unrecorded target is a step
 * that does not play instead of a step on the wrong creature.
 */
export const PLACES = Object.freeze([
  // On a creature
  "source", "target", "targets", "beside-target", "resisted", "effect", "holder",
  // On a placed area
  "region", "region-scatter", "region-line", "region-cone",
  // Between two things
  "source>target", "target>source", "chain", "missiles", "channel", "channel-back",
  // Round a creature
  "orbit",
  // What a feature's or a spell's card RECORDED (the Legacy branches' door 2): where
  // each mover a step moved stood before (`step-from`) and stands now (`step-to`),
  // the line between (`step`), every creature the Use stood up (`risen`), and the
  // striker whose blow a hold turned aside (`striker`).
  "step-from", "step-to", "step", "risen", "striker"
]);

/** The placements that draw between two points, and so may be stretched. */
export const SPANNING_PLACES = Object.freeze([
  "source>target", "target>source", "chain", "missiles", "channel", "channel-back",
  "region-line", "region-cone", "step"
]);

/** The three libraries, by the root of their keys. */
export const LIBRARY_BY_ROOT = Object.freeze({
  jb2a: "JB2A_DnD5e",
  psfx: "psfx",
  jaamod: "jaamod"
});

/** Which module a key belongs to, or null for a key that names no library. */
export function libraryOf(asset) {
  const root = String(asset ?? "").split(".")[0];
  return Object.hasOwn(LIBRARY_BY_ROOT, root) ? LIBRARY_BY_ROOT[root] : null;
}

/* ------------------------------------------------------------------ */
/*  Recolouring                                                        */
/* ------------------------------------------------------------------ */

/**
 * NAMED RECOLOURS, applied as Sequencer's `filter("ColorMatrix", …)` and, where
 * a flat wash is wanted instead, as a `tint`.
 *
 * The free libraries carry a few colours and the book has eight schools, so
 * most rows borrow a shape and move its hue. `hue` is degrees, `saturate` and
 * `brightness` are PIXI's own multipliers about 0 and 1.
 *
 * **These are starting values.** Hue rotation is not perceptual - a blue moved
 * 90 degrees is not the green the eye expects - and every one of them is tuned
 * against Phase 5's frames.
 */
export const FILTERS = Object.freeze({
  /** Colour taken out, for a weapon shape standing in for another (08 §5's whip, a fist). */
  DESATURATE: Object.freeze({ saturate: -0.9 }),
  /** Dimmed without a hue move: Fade's cast cue, which must not read as invisibility. */
  DIM: Object.freeze({ brightness: 0.6 }),
  /** A pale toss darkened into a net. */
  DARKEN: Object.freeze({ saturate: -0.35, brightness: 0.45 }),
  /** Yellow sacred flame into Flamestrike's fire column. */
  SCORCH: Object.freeze({ hue: -25, saturate: 0.4 }),
  /**
   * A blue-white pulse or a sleet curtain into fire.
   *
   * **A TINT, NOT A HUE ROTATION** (read off `anim-rain-of-fire-loop.png`,
   * 2026-09-15). Both assets this is used on are nearly WHITE, and rotating
   * white's hue moves nothing while the saturation boost blows it out: Rain of
   * Fire's curtain photographed as a pure white-out that swallowed the board
   * and the tokens under it. A tint MULTIPLIES, so white times orange is
   * orange, which is the whole reason `FILTERS` carries both kinds.
   */
  FIRE_B: Object.freeze({ tint: "#ff6a1e", brightness: 0.95 }),
  /** An orange energy wall into ice. */
  ICE_O: Object.freeze({ hue: 175, saturate: 0.15, brightness: 1.05 }),
  /** A blue marker light warmed into Flare's hanging light. */
  WARM: Object.freeze({ hue: 150, saturate: -0.3, brightness: 1.1 }),
  /** Blue into starlight: Moonfire's column and Starfall's stars. */
  STAR: Object.freeze({ saturate: -0.35, brightness: 1.15 }),
  /** Yellow into starlight, for Starfire's descending star. */
  STAR_Y: Object.freeze({ hue: 200, saturate: -0.2, brightness: 1.1 }),
  /** Blue into arcane purple. */
  PURPLE_B: Object.freeze({ hue: 45 }),
  /** Green into arcane purple, for Drain Life's gathered strands. */
  PURPLE_G: Object.freeze({ hue: 150 }),
  /** The two psychic pulses, which are a wash rather than a hue move. */
  PSYCHIC: Object.freeze({ tint: "#9b6bd6", saturate: 0.2 }),
  /** Grey smoke into Hex's sickly light. */
  HEX: Object.freeze({ hue: 90, saturate: 0.5 }),
  /** A blue marker into Faerie Fire's cold violet. */
  FAERIE: Object.freeze({ hue: 55, brightness: 1.05 }),
  /** An orange impact into Wrath's green-gold. */
  GREENGOLD: Object.freeze({ hue: 60, saturate: 0.25 }),
  /** An orange ground crack into earth and dust. */
  EARTH: Object.freeze({ hue: -15, saturate: -0.45, brightness: 0.85 }),
  /** A cold breath cone emptied into moving air. */
  AIR: Object.freeze({ saturate: -0.75, brightness: 1.15 }),
  /** A projectile darkened for the Shadow school. */
  DARK: Object.freeze({ saturate: -0.1, brightness: 0.6 }),
  /** Blue into shadow. */
  SHADOW_B: Object.freeze({ hue: 55, saturate: 0.3, brightness: 0.6 }),
  /** Red bats into a dark swarm. */
  SHADOW_R: Object.freeze({ saturate: -0.55, brightness: 0.45 }),
  /** Orange fire into fel green - the commonest recolour in the table. */
  FEL_O: Object.freeze({ hue: 75, saturate: 0.5 }),
  /** Blue into fel green. */
  FEL_B: Object.freeze({ hue: -145, saturate: 0.4 }),
  /** Red into fel green. */
  FEL_R: Object.freeze({ hue: 95, saturate: 0.4 }),
  /** Purple into fel green. */
  FEL_P: Object.freeze({ hue: 155, saturate: 0.35 }),
  /** A pink-teal sound cue into a demonic one. */
  FEL_SOUND: Object.freeze({ hue: 95, saturate: 0.4 }),
  /** Blue into the Light's gold. */
  GOLD_B: Object.freeze({ hue: 195, saturate: 0.45, brightness: 1.05 }),
  /** A blue splash into a serpent's venom green (04's Serpent Ward). */
  VENOM_B: Object.freeze({ hue: -110, saturate: 0.35, brightness: 0.9 })
});

/* ------------------------------------------------------------------ */
/*  The short sounds several rows share                                */
/* ------------------------------------------------------------------ */

/**
 * PSFX's short impacts and cues, named once. A `[b]` in the draft is a
 * distance-bucketed sound and carries `bucketed: true` on its step; the test
 * holds every one of those against a `range` entry in the snapshot.
 */
export const SOUNDS = Object.freeze({
  fire: "psfx.impacts.magicaleffects.fire",
  cold: "psfx.impacts.magicaleffects.cold",
  lightning: "psfx.impacts.magicaleffects.lightning",
  necrotic: "psfx.impacts.magicaleffects.necrotic",
  psychic: "psfx.impacts.magicaleffects.psychic",
  generic: "psfx.impacts.magicaleffects.generic.002.001",
  boon: "psfx.conditions.boon.002.01",
  bless1: "psfx.1st-level-spells.bless.v1.001",
  bless2: "psfx.1st-level-spells.bless.v1.002",
  gust: "psfx.cantrips.gust.v1",
  strands: "psfx.ranged-magic.generic.energy-strands.001",
  explode: "psfx.3rd-level-spells.fireball.v1.001.explosion",
  slash: "psfx.impacts.slashing.v1",
  blunt: "psfx.impacts.bludgeoning.v1",
  /**
   * 08's swings. PSFX carries six interchangeable takes of each; the table
   * names one, and the other five are variants Phase 5 may audition.
   */
  swingLight: "psfx.weapon-swooshes.light.v1.group01",
  swingHeavy: "psfx.weapon-swooshes.heavy.v1.group01",
  longbow: "psfx.ranged-weapons.longbow.v1",
  revolver: "psfx.ranged-weapons.guns.single-fire.revolver"
});

/* -------------------------------------------- */

/** An effect step. Every optional field is left out rather than written null. */
function fx(asset, options = {}) {
  return Object.freeze({ kind: "effect", asset, ...options });
}

/** A sound step. */
function snd(asset, options = {}) {
  return Object.freeze({ kind: "sound", asset, ...options });
}

/**
 * A cue: what plays on one trigger. A feature's `effect` cue may name the `state` it
 * answers (`{state}`): the flag of the laid state whose arrival plays it.
 */
function cue(trigger, steps, { state = null } = {}) {
  return Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
}

/* ------------------------------------------------------------------ */
/*  Cast cues several rows share                                       */
/* ------------------------------------------------------------------ */

/**
 * THE RESTRAINED CAST CUES. Six Shadow entries and two Fel ones are told, in
 * the design document's own words, to show *a restrained cast cue only* and to
 * *not invent visible wounds, restraints, or a successful mental condition
 * before resistance resolves*. They share one cue rather than eight copies of
 * it, so a change to how a curse reads changes all six at once.
 */
export const SCHOOL_CUES = Object.freeze({
  shadow: Object.freeze([
    fx("jb2a.cast_generic.02.blue", { place: "source", scale: 0.7, filter: "SHADOW_B" }),
    snd("psfx.1st-level-spells.dissonant-whispers.v1.001", { volume: 0.7 })
  ]),
  fel: Object.freeze([
    fx("jb2a.cast_generic.fire.01.orange", { place: "source", scale: 0.8, filter: "FEL_O" })
  ])
});

/* ------------------------------------------------------------------ */
/*  Strikes: one recipe per STRIKE_FORMS key (Appendix B)              */
/* ------------------------------------------------------------------ */

/**
 * A strike recipe.
 *
 *  - `swing`  what leaves the attacker: a melee shape stretched source to
 *             target, a projectile flown or stretched the same way, or - a
 *             bite - something placed AT the target with nothing to swing.
 *             `miss` overrides it where a miss looks different.
 *  - `launch` anything at the attacker's own feet: a muzzle flash.
 *  - `impact` what happens at the target, ON A HIT ONLY. A miss has no impact
 *             step at all (the document's own rule: *misses do not show
 *             successful impacts*).
 *  - `ret`    a returning shape, on a hit.
 *  - `standIn` names what was borrowed, where the libraries had no shape.
 */
function strike({ swing, launch = null, impact = null, ret = null, standIn = null }) {
  const row = { swing: Object.freeze(swing) };
  if (launch) row.launch = Object.freeze(launch);
  if (impact) row.impact = Object.freeze(impact);
  if (ret) row.ret = Object.freeze(ret);
  if (standIn) row.standIn = standIn;
  return Object.freeze(row);
}

/** A melee swing: stretched from the attacker to the target, with a swoosh. */
function melee(asset, { heavy = false, scale = null, filter = null, volume = 1 } = {}) {
  const step = { asset, place: "source>target", travel: "stretch" };
  if (scale !== null) step.scale = scale;
  if (filter) step.filter = filter;
  return { ...step, sound: snd(heavy ? SOUNDS.swingHeavy : SOUNDS.swingLight, { volume }) };
}

/** The blow landing: a generic impact at the target, about a third of a second in. */
/**
 * **0.8, NOT 0.45** (read off `anim-hit.png`, 2026-09-15). `scaleToObject`
 * measures the whole FRAME of a clip and an impact is mostly transparent
 * padding, so at 0.45 of a token's width a landed blow photographed as a
 * thirty-pixel spark between two creatures - smaller than either of them and
 * easy to miss. A blow that lands is the one thing at the table that has to
 * read at a glance.
 */
function blow(sound, { volume = 1, scale = 0.8, asset = "jb2a.impact.001.blue", filter = "DESATURATE", delay = 380 } = {}) {
  return { asset, place: "target", scale, filter, delay, sound: snd(sound, { volume, delay }) };
}

/**
 * EVERY FORM A STRIKE CAN RECORD, one recipe each (D-725's `STRIKE_FORMS` is
 * the vocabulary and `strikes.test.mjs` holds the two against each other in
 * both directions).
 *
 * `hammer` and `sting` have recipes and no pack row produces either: 08 §7's
 * light hammer is a `hammer` a GM can still hand out, and 14 writes every tail
 * as a sweep. A form with no recipe would be a silent hole the day one appears.
 */
export const STRIKE_ANIMATIONS = Object.freeze({
  /* ---- edges, points and weights (08 §7) ---- */
  sword: strike({ swing: melee("jb2a.sword.melee.01.white"), impact: blow(SOUNDS.slash) }),
  greatsword: strike({ swing: melee("jb2a.greatsword.melee.standard.white", { heavy: true }), impact: blow(SOUNDS.slash) }),
  shortsword: strike({ swing: melee("jb2a.shortsword.melee.01.white"), impact: blow(SOUNDS.slash) }),
  scimitar: strike({ swing: melee("jb2a.scimitar.melee.01.white"), impact: blow(SOUNDS.slash) }),
  rapier: strike({ swing: melee("jb2a.rapier.melee.01.white"), impact: blow(SOUNDS.slash, { volume: 0.6 }), standIn: "sound" }),
  dagger: strike({ swing: melee("jb2a.dagger.melee.02.white"), impact: blow(SOUNDS.slash, { volume: 0.6 }), standIn: "sound" }),
  axe: strike({ swing: melee("jb2a.melee_attack.02.battleaxe.01", { heavy: true }), impact: blow(SOUNDS.slash) }),
  greataxe: strike({ swing: melee("jb2a.greataxe.melee.standard.white", { heavy: true }), impact: blow(SOUNDS.slash) }),
  scythe: strike({ swing: melee("jb2a.melee_attack.05.scythe.01", { heavy: true }), impact: blow(SOUNDS.slash) }),
  sickle: strike({ swing: melee("jb2a.melee_attack.01.sickle.01"), impact: blow(SOUNDS.slash) }),
  glaive: strike({ swing: melee("jb2a.glaive.melee.01.white", { heavy: true }), impact: blow(SOUNDS.slash) }),
  halberd: strike({ swing: melee("jb2a.halberd.melee.01.white", { heavy: true }), impact: blow(SOUNDS.slash) }),
  spear: strike({ swing: melee("jb2a.spear.melee.01.white"), impact: blow(SOUNDS.slash, { volume: 0.6 }), standIn: "sound" }),
  mace: strike({ swing: melee("jb2a.mace.melee.01.white"), impact: blow(SOUNDS.blunt) }),
  club: strike({ swing: melee("jb2a.club.melee.01.white"), impact: blow(SOUNDS.blunt) }),
  greatclub: strike({ swing: melee("jb2a.greatclub.standard.white", { heavy: true }), impact: blow(SOUNDS.blunt) }),
  flail: strike({ swing: melee("jb2a.melee_attack.01.flail.01", { heavy: true }), impact: blow(SOUNDS.blunt) }),
  warhammer: strike({ swing: melee("jb2a.warhammer.melee.01.white", { heavy: true }), impact: blow(SOUNDS.blunt), standIn: "war pick" }),
  hammer: strike({ swing: melee("jb2a.hammer.melee.01.white"), impact: blow(SOUNDS.blunt) }),
  maul: strike({ swing: melee("jb2a.maul.melee.standard.white", { heavy: true }), impact: blow(SOUNDS.blunt) }),
  quarterstaff: strike({ swing: melee("jb2a.quarterstaff.melee.01.white"), impact: blow(SOUNDS.blunt) }),
  wrench: strike({ swing: melee("jb2a.wrench.melee.01.white"), impact: blow(SOUNDS.blunt) }),
  // 08 §7's whip: there is no whip shape in the free library, so a generic
  // slash desaturated stands in for the crack of it.
  whip: strike({ swing: melee("jb2a.melee_generic.slash.02.001.blue", { filter: "DESATURATE" }), impact: blow(SOUNDS.slash, { volume: 0.5 }), standIn: "visual" }),
  unarmed: strike({ swing: melee("jb2a.unarmed_strike.physical.01.blue", { filter: "DESATURATE" }), impact: blow(SOUNDS.blunt, { volume: 0.7 }) }),
  shield: strike({ swing: melee("jb2a.melee_attack.06.shield.01", { heavy: true }), impact: blow(SOUNDS.blunt) }),
  implement: strike({ swing: melee("jb2a.club.melee.01.white"), impact: blow(SOUNDS.blunt, { volume: 0.6 }), standIn: "visual" }),

  /* ---- what a creature strikes with (14) ---- */
  claw: strike({ swing: melee("jb2a.melee_generic.creature_attack.claw.001.red"), impact: blow(SOUNDS.slash) }),
  // NOTHING TO SWING. A bite happens at the target: the full shape on a hit,
  // a small one beside the target on a miss.
  bite: strike({
    swing: {
      asset: "jb2a.bite.400px.red", place: "target", sound: snd(SOUNDS.swingLight),
      miss: { asset: "jb2a.bite.200px.red", place: "beside-target" }
    },
    impact: blow(SOUNDS.slash, { volume: 0.7 }),
    standIn: "sound"
  }),
  slam: strike({ swing: melee("jb2a.melee_generic.creature_attack.fist.001.red", { heavy: true }), impact: blow(SOUNDS.blunt) }),
  gore: strike({ swing: melee("jb2a.spear.melee.01.white", { heavy: true, filter: "DESATURATE" }), impact: blow(SOUNDS.blunt), standIn: "visual" }),
  sting: strike({ swing: melee("jb2a.spear.melee.01.white", { scale: 0.7, filter: "DESATURATE" }), impact: blow(SOUNDS.slash, { volume: 0.6 }), standIn: "visual, sound" }),
  pincer: strike({ swing: melee("jb2a.melee_generic.creature_attack.pincer.001.red"), impact: blow(SOUNDS.slash) }),
  tentacle: strike({ swing: melee("jb2a.melee_generic.creature_attack.fist.001.red", { heavy: true }), impact: blow(SOUNDS.blunt), standIn: "visual" }),
  touch: strike({ swing: melee("jb2a.unarmed_strike.magical.01.blue"), impact: blow(SOUNDS.necrotic, { volume: 0.6 }), standIn: "visual" }),

  /* ---- what a launcher shoots (08 §7) ---- */
  arrow: strike({
    swing: { asset: "jb2a.arrow.physical.white.01", place: "source>target", travel: "stretch", sound: snd(SOUNDS.longbow, { bucketed: true }) },
    impact: blow(SOUNDS.blunt, { volume: 0.45, scale: 0.35, waitFor: "travel", overlap: -250 }),
    standIn: "sound"
  }),
  bolt: strike({
    swing: { asset: "jb2a.bolt.physical.orange", place: "source>target", travel: "stretch", sound: snd(SOUNDS.longbow, { bucketed: true, volume: 0.8 }) },
    impact: blow(SOUNDS.blunt, { volume: 0.45, scale: 0.35, waitFor: "travel", overlap: -250 }),
    standIn: "sound"
  }),
  bullet: strike({
    swing: { asset: "jb2a.bullet.01.orange", place: "source>target", travel: "stretch", sound: snd(SOUNDS.revolver) },
    launch: [fx("jb2a.muzzle_flash.single.01.yellow", { place: "source", scale: 0.5 })],
    impact: blow(SOUNDS.blunt, { volume: 0.6, scale: 0.35, waitFor: "travel", overlap: -250 })
  }),
  // A sling stone: the free libraries have no sling, so the smallest thrown
  // stone stands in for it.
  "sling-stone": strike({
    swing: { asset: "jb2a.boulder.toss.02.01.stone.brown", place: "source>target", travel: "stretch", scale: 0.3, sound: snd(SOUNDS.swingLight) },
    impact: blow(SOUNDS.blunt, { volume: 0.6, scale: 0.35, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  "blowgun-dart": strike({
    swing: { asset: "jb2a.arrow.physical.white.01", place: "source>target", travel: "stretch", scale: 0.45, sound: snd(SOUNDS.swingLight, { volume: 0.4 }) },
    impact: blow(SOUNDS.slash, { volume: 0.3, scale: 0.3, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  boulder: strike({
    swing: { asset: "jb2a.boulder.toss.02.01.stone.brown", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingHeavy) },
    impact: blow(SOUNDS.blunt, { scale: 0.5, waitFor: "travel", overlap: -250 })
  }),

  /* ---- what a hand throws (08 §5's Thrown) ---- */
  dart: strike({
    swing: { asset: "jb2a.arrow.physical.white.01", place: "source>target", travel: "stretch", scale: 0.6, sound: snd(SOUNDS.swingLight) },
    impact: blow(SOUNDS.slash, { volume: 0.5, scale: 0.3, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  "thrown-dagger": strike({
    swing: { asset: "jb2a.dagger.throw.01.white", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingLight) },
    impact: blow(SOUNDS.slash, { volume: 0.6, scale: 0.35, waitFor: "travel", overlap: -250 }),
    standIn: "sound"
  }),
  "thrown-axe": strike({
    swing: { asset: "jb2a.dagger.throw.01.white", place: "source>target", travel: "stretch", scale: 1.25, sound: snd(SOUNDS.swingHeavy) },
    impact: blow(SOUNDS.slash, { scale: 0.45, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  "thrown-hammer": strike({
    swing: { asset: "jb2a.dagger.throw.01.white", place: "source>target", travel: "stretch", scale: 1.25, sound: snd(SOUNDS.swingHeavy) },
    impact: blow(SOUNDS.blunt, { scale: 0.45, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  javelin: strike({
    swing: { asset: "jb2a.arrow.physical.white.01", place: "source>target", travel: "stretch", scale: 1.4, sound: snd(SOUNDS.swingHeavy) },
    impact: blow(SOUNDS.blunt, { volume: 0.5, scale: 0.4, waitFor: "travel", overlap: -250 }),
    standIn: "visual, sound"
  }),
  // A moonglaive comes back, and only on a hit.
  "glaive-return": strike({
    swing: { asset: "jb2a.shield_attack.ranged.throw.01.white.01", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingLight) },
    impact: blow(SOUNDS.slash, { scale: 0.4, waitFor: "travel", overlap: -250 }),
    ret: fx("jb2a.shield_attack.ranged.return.01.white.01", { place: "target>source", travel: "stretch", delay: 500 }),
    standIn: "visual"
  }),
  net: strike({
    swing: { asset: "jb2a.snowball_toss.white.01", place: "source>target", travel: "stretch", filter: "DARKEN", sound: snd(SOUNDS.swingLight) },
    impact: { asset: "jb2a.web.01", place: "target", scale: 0.9, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.blunt, { volume: 0.3 }) },
    standIn: "visual"
  }),
  bola: strike({
    swing: { asset: "jb2a.boulder.toss.02.01.stone.brown", place: "source>target", travel: "stretch", scale: 0.35, sound: snd(SOUNDS.swingLight) },
    impact: blow(SOUNDS.blunt, { volume: 0.5, scale: 0.3, waitFor: "travel", overlap: -250 }),
    standIn: "visual"
  }),
  flask: strike({
    swing: { asset: "jb2a.throwable.throw.flask.01.orange", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingLight) },
    impact: { asset: "jb2a.explosion.01.orange", place: "target", scale: 0.6, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.explode, { volume: 0.4 }) }
  }),
  bomb: strike({
    swing: { asset: "jb2a.throwable.throw.bomb.01.black", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingLight) },
    impact: { asset: "jb2a.explosion.shrapnel.bomb.01.black", place: "target", scale: 0.6, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.explode, { volume: 0.5 }) }
  }),
  cannon: strike({
    swing: { asset: "jb2a.throwable.launch.cannon_ball.01.black", place: "source>target", travel: "stretch", sound: snd(SOUNDS.revolver) },
    launch: [fx("jb2a.muzzle_flash.single.01.yellow", { place: "source", scale: 0.8 })],
    impact: { asset: "jb2a.explosion.01.orange", place: "target", scale: 0.7, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.explode, { volume: 0.6 }) },
    standIn: "sound"
  }),

  /* ---- 14's rows that are spells or machine parts in all but name ---- */
  firebolt: strike({
    swing: { asset: "jb2a.fire_bolt.orange", place: "source>target", travel: "stretch", sound: snd("psfx.cantrips.fire-bolt.v1", { bucketed: true }) },
    impact: { asset: "jb2a.impact.fire.01.orange", place: "target", scale: 0.6, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.fire) }
  }),
  shard: strike({
    swing: { asset: "jb2a.spell_projectile.ice_shard.blue", place: "source>target", travel: "stretch", sound: snd("psfx.cantrips.ray-of-frost.v1") },
    impact: { asset: "jb2a.impact_themed.ice_shard.blue", place: "target", scale: 0.6, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.cold) }
  }),
  shock: strike({
    swing: { asset: "jb2a.chain_lightning.primary.blue", place: "source>target", travel: "stretch", sound: snd("psfx.3rd-level-spells.call-lightning.v1.primary") },
    impact: { asset: "jb2a.static_electricity.01.blue", place: "target", scale: 0.8, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.lightning) }
  }),
  // New with Jinker's pack: two saw arms that had no fair stand-in before.
  saw: strike({
    swing: { asset: "jaamod.traps.saw_blade", place: "target", scale: 0.8, hold: 600, sound: snd(SOUNDS.swingHeavy) },
    impact: blow(SOUNDS.slash),
    standIn: "visual"
  })
});

/* ------------------------------------------------------------------ */
/*  Spells: one row per tier 1 entry in 07 (Appendix A)                */
/* ------------------------------------------------------------------ */

/** A row that plays nothing, and why. A row has cues or a reason, never both. */
function silent(reason) {
  return Object.freeze({ reason });
}

/**
 * A loop: what stands while the world holds the state it follows. A feature's
 * `effect` loop names the `state` it follows (`{state}`): the flag of the laid state,
 * where a Use lays more than one (04's Wind Walk lays three).
 */
function loop(binding, layers, { state = null } = {}) {
  return Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });
}

/**
 * THE 105 TIER 1 SPELLS, in 07's own order of schools.
 *
 * Keyed by the identifier the pack stamps, and `animation-table.test.mjs`
 * holds the keys against `packs-src/spells` in BOTH directions, so a spell
 * added to the chapter fails here until it is treated.
 *
 * **A failed Casting Test never animates** (D-728), on any trigger, and that
 * is `plan`'s business rather than the table's: a row says what a success
 * looks like and nothing else.
 *
 * **A self-centred area plays at cast** (D-728) on the recorded caster, sized
 * from the Target line's own radius (`area: 1` is the whole diameter); it
 * never waits for Place area. Only the eleven PLACED areas - six ground
 * circles, Flare, three cones and the line - carry a `region` cue.
 */
export const SPELL_ANIMATIONS = Object.freeze({
  /* ================= Fire ================= */
  fireball: {
    cues: [cue("cast", [
      fx("jb2a.fire_bolt.orange", { place: "source>target", travel: "stretch" }),
      snd("psfx.cantrips.fire-bolt.v1", { bucketed: true }),
      fx("jb2a.explosion.01.orange", { place: "target", scale: 1.6, waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.fire, { waitFor: "travel", overlap: -250 })
    ])]
  },
  scorch: {
    cues: [cue("cast", [
      fx("jb2a.scorching_ray.01.orange", { place: "source>target", travel: "stretch", speed: 1.4 }),
      snd("psfx.2nd-level-spells.scorching-ray.v1", { bucketed: true }),
      fx("jb2a.impact.fire.01.orange", { place: "target", scale: 0.5, waitFor: "travel", overlap: -250 })
    ])]
  },
  "searing-pain": {
    cues: [cue("cast", [
      fx("jb2a.impact.fire.01.orange", { place: "target", scale: 0.7 }),
      snd(SOUNDS.fire)
    ])]
  },
  "flame-shock": {
    cues: [cue("cast", [
      fx("jb2a.impact.fire.01.orange", { place: "target", scale: 0.7 }),
      snd(SOUNDS.fire)
    ])]
  },
  immolate: {
    cues: [cue("cast", [
      fx("jb2a.impact.fire.01.orange", { place: "target", scale: 0.8 }),
      snd("psfx.casting.fire.001")
    ])],
    loop: loop("sustain-target", [fx("jb2a.flames.04.loop.orange", { place: "holder", scale: 1.3, opacity: 0.85 })])
  },
  conflagrate: {
    cues: [cue("cast", [
      fx("jb2a.explosion.08.orange", { place: "target", scale: 1 }),
      snd(SOUNDS.fire)
    ])]
  },
  flamestrike: {
    cues: [cue("region", [
      fx("jb2a.sacred_flame.target.yellow", { place: "region", area: 0.7, filter: "SCORCH" }),
      fx("jb2a.impact.ground_crack.orange.02", { place: "region", area: 1, below: true, delay: 550 }),
      snd(SOUNDS.explode, { delay: 550 })
    ])]
  },
  "blast-wave": {
    cues: [cue("cast", [
      fx("jb2a.template_circle.out_pulse.01.burst.bluewhite", { place: "source", area: 1, filter: "FIRE_B" }),
      snd("psfx.casting.fire-side.001")
    ])]
  },
  "rain-of-fire": {
    cues: [cue("region", [
      fx("jb2a.impact.fire.01.orange", { place: "region", area: 0.5 }),
      snd(SOUNDS.fire)
    ])],
    // **THE CURTAIN AT 0.8** (read off `anim-rain-of-fire-loop.png`,
    // 2026-09-15). A twenty-foot curtain drawn over the whole area at full
    // opacity hides the ground, the grid and every creature standing in it -
    // and the creatures in it are exactly who the GM is looking at. The tokens
    // have to stay readable under a loop that may run for a whole fight.
    loop: loop("sustain-region", [
      fx("jb2a.sleet_storm.01.blue", { place: "region", area: 1, mask: true, filter: "FIRE_B", opacity: 0.8 }),
      fx("jb2a.ground_cracks.01.orange", { place: "region", area: 1, below: true, opacity: 0.55 })
    ])
  },
  "fire-nova": {
    cues: [cue("cast", [
      fx("jb2a.fire_ring.500px.red", { place: "source", area: 1, below: true, grow: 500, hold: 1400 }),
      snd("psfx.casting.fire.001")
    ])]
  },
  "fire-ward": {
    cues: [cue("cast|effect", [fx("jb2a.impact.fire.01.orange", { place: "target", scale: 0.5 })])],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.fire.01.orange", { place: "holder", scale: 1.5, below: true }),
      fx("jb2a.shield_themed.above.fire.01.orange", { place: "holder", scale: 1.5 })
    ])
  },
  immolation: {
    cues: [cue("cast", [fx("jb2a.impact.fire.01.orange", { place: "source", scale: 0.9 })])],
    loop: loop("sustain-self", [fx("jb2a.flames.04.loop.orange", { place: "holder", scale: 1.3, opacity: 0.85 })])
  },
  "blazing-speed": {
    cues: [cue("cast", [fx("jb2a.flames.02.orange", { place: "source", below: true, hold: 1200, fadeOut: 400 })])]
  },
  flare: {
    cues: [cue("region", [
      fx("jb2a.markers.light.intro.blue", { place: "region", area: 0.5, filter: "WARM" }),
      snd("psfx.cantrips.light.v1.001")
    ])],
    loop: loop("effect-region", [fx("jb2a.markers.light.nopulse.blue", { place: "region", area: 0.5, filter: "WARM", opacity: 0.9 })])
  },
  kindle: silent("no object targeting; nothing records an object, a position or light-or-douse"),

  /* ================= Frost ================= */
  frostbolt: {
    cues: [cue("cast", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch" }),
      snd("psfx.cantrips.ray-of-frost.v1"),
      fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.8, waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.cold, { waitFor: "travel", overlap: -250 })
    ])]
  },
  "ice-lance": {
    cues: [cue("cast", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch", scale: 0.55, speed: 1.5 }),
      snd("psfx.cantrips.ray-of-frost.v1", { volume: 0.8 }),
      fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.45, waitFor: "travel", overlap: -250 })
    ])]
  },
  "ice-spear": {
    cues: [cue("cast", [
      fx("jb2a.spell_projectile.ice_shard.blue", { place: "source>target", travel: "stretch", scale: 1.6, speed: 0.7 }),
      snd("psfx.cantrips.ray-of-frost.v1"),
      fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 1.3, waitFor: "travel", overlap: -250 }),
      fx("jb2a.impact.ground_crack.frost.01.white", { place: "target", scale: 1.2, below: true, waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.cold, { waitFor: "travel", overlap: -250 })
    ])]
  },
  "cone-of-cold": {
    cues: [cue("region", [
      fx("jb2a.cone_of_cold.blue", { place: "region-cone", travel: "stretch" }),
      snd("psfx.5th-level-spells.cone-of-cold.v1.001")
    ])]
  },
  "frost-nova": {
    cues: [cue("cast", [
      fx("jb2a.impact.ground_crack.frost.01.white", { place: "source", area: 1, below: true }),
      snd(SOUNDS.cold)
    ])]
  },
  blizzard: {
    cues: [cue("region", [
      fx("jb2a.impact_themed.ice_shard.blue", { place: "region", area: 0.4 }),
      snd(SOUNDS.cold)
    ])],
    loop: loop("sustain-region", [fx("jb2a.sleet_storm.01.blue", { place: "region", area: 1, mask: true, opacity: 0.9 })])
  },
  "numbing-frost": {
    cues: [cue("cast", [fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.6 })])]
  },
  frostbite: silent("07 says there is nothing to see"),
  "winters-chill": {
    cues: [cue("resist", [fx("jb2a.shimmer.01.blue", { place: "resisted", scale: 1.3, opacity: 0.7 })])]
  },
  "frost-armor": {
    cues: [cue("cast", [
      fx("jb2a.impact_themed.ice_shard.blue", { place: "source", scale: 0.6 }),
      snd("psfx.casting.water.001")
    ])],
    // Borderline: an hour is a long time to hold a rime. The stop door and the
    // loops setting are the release valve.
    loop: loop("effect", [fx("jb2a.shield_themed.below.ice.01.blue", { place: "holder", scale: 1.35, opacity: 0.6, below: true })])
  },
  "frost-ward": {
    cues: [cue("cast|effect", [fx("jb2a.impact_themed.ice_shard.blue", { place: "target", scale: 0.5 })])],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.ice.01.blue", { place: "holder", scale: 1.5, below: true }),
      fx("jb2a.shield_themed.above.ice.01.blue", { place: "holder", scale: 1.5 })
    ])
  },
  "wall-of-ice": {
    cues: [cue("region", [
      fx("jb2a.template_line.ice.01.blue", { place: "region-line", travel: "stretch" }),
      snd(SOUNDS.cold)
    ])],
    loop: loop("sustain-region", [fx("jb2a.energy_wall.01.25x05ft.01.loop.orange", { place: "region-line", travel: "span", filter: "ICE_O" })])
  },
  "cold-snap": {
    cues: [cue("cast", [fx("jb2a.template_circle.out_pulse.01.burst.bluewhite", { place: "source", scale: 1.6, below: true })])]
  },
  icewalk: {
    cues: [cue("cast", [fx("jb2a.impact.ground_crack.frost.01.white", { place: "source", scale: 1.2, below: true, hold: 1500, fadeOut: 400 })])]
  },
  "conjure-water": {
    cues: [cue("cast", [
      fx("jb2a.cast_generic.water.02.blue", { place: "source", scale: 1.2 }),
      snd("psfx.casting.water.001")
    ])]
  },

  /* ================= Arcane ================= */
  "arcane-missiles": {
    cues: [cue("cast", [
      fx("jb2a.magic_missile.purple", { place: "missiles", travel: "stretch", count: 3, stagger: 180 }),
      snd("psfx.1st-level-spells.magic-missile.v1", { bucketed: true })
    ])]
  },
  "mana-burn": {
    cues: [cue("cast", [
      fx("jb2a.particle_burst.01.circle.bluepurple", { place: "target", scale: 1 }),
      snd(SOUNDS.generic)
    ])]
  },
  moonfire: {
    cues: [cue("cast", [
      fx("jb2a.moonbeam.01.intro.blue", { place: "target", scale: 1.3, filter: "STAR" }),
      fx("jb2a.markers.light.complete.blue", { place: "target", opacity: 0.6, delay: 900 })
    ])]
  },
  starfire: {
    cues: [cue("cast", [
      fx("jb2a.sacred_flame.target.yellow", { place: "target", scale: 1.5, filter: "STAR_Y" }),
      fx("jb2a.explosion.04.blue", { place: "target", delay: 700 }),
      fx("jb2a.particle_burst.01.star.bluepurple", { place: "target", delay: 700 })
    ])]
  },
  "arcane-explosion": {
    cues: [cue("cast", [
      fx("jb2a.particle_burst.01.circle.bluepurple", { place: "source", area: 1 }),
      fx("jb2a.template_circle.out_pulse.02.burst.bluewhite", { place: "source", area: 1, filter: "PURPLE_B" })
    ])]
  },
  starfall: {
    cues: [cue("region", [fx("jb2a.particle_burst.01.star.bluepurple", { place: "region", area: 0.4 })])],
    loop: loop("sustain-region", [
      fx("jb2a.sleet_storm.02.blue", { place: "region", area: 1, mask: true, filter: "STAR", opacity: 0.6 }),
      fx("jb2a.particle_burst.01.star.bluepurple", { place: "region-scatter", count: 3, area: [0.25, 0.4], stagger: 900, filter: "STAR" })
    ])
  },
  "ley-snare": silent("07 says the thread is neither visible nor physical"),
  slow: silent("07 says from outside it looks like nothing at all"),
  "mana-shield": {
    cues: [cue("cast", [
      fx("jb2a.shield.01.intro.blue", { place: "source", scale: 1.5, filter: "PURPLE_B" }),
      snd("psfx.1st-level-spells.shield-spell.intro.v1.003")
    ])],
    loop: loop("sustain-self", [fx("jb2a.shield.01.loop.blue", { place: "holder", scale: 1.5, filter: "PURPLE_B", opacity: 0.6 })])
  },
  "dampen-magic": {
    cues: [cue("cast|effect", [fx("jb2a.shimmer.01.blue", { place: "target", scale: 1.3, filter: "PURPLE_B" })])],
    // Borderline: an hour of lattice. The stop door is the release valve.
    loop: loop("effect", [fx("jb2a.shield_themed.above.eldritch_web.01.dark_purple", { place: "holder", opacity: 0.4 })])
  },
  displacement: silent("the card records no positions"),
  "slow-fall": {
    cues: [cue("cast|effect", [
      fx("jb2a.swirling_feathers.outburst.01.textured", { place: "target", below: true, opacity: 0.8 }),
      snd(SOUNDS.gust)
    ])]
  },
  "arcane-intellect": {
    cues: [cue("cast|effect", [
      fx("jb2a.on_token_buff.001.001.bluepurple", { place: "target", scale: 1.2 }),
      snd(SOUNDS.boon)
    ])]
  },
  "amplify-magic": {
    cues: [cue("cast|effect", [
      fx("jb2a.on_token_buff.001.001.bluepurple", { place: "target", scale: 1.2 }),
      snd(SOUNDS.boon)
    ])]
  },
  "detect-magic": {
    cues: [cue("cast", [
      fx("jb2a.detect_magic.circle.blue", { place: "source", scale: 3, opacity: 0.6 }),
      snd("psfx.1st-level-spells.detect-magic.v1.001")
    ])]
  },

  /* ================= Nature ================= */
  "lightning-bolt": {
    cues: [cue("cast", [
      fx("jb2a.chain_lightning.primary.blue", { place: "source>target", travel: "stretch" }),
      snd("psfx.3rd-level-spells.call-lightning.v1.primary"),
      fx("jb2a.static_electricity.01.blue", { place: "target", delay: 300 }),
      snd(SOUNDS.lightning, { delay: 300 })
    ])]
  },
  wrath: {
    cues: [cue("cast", [
      fx("jb2a.swirling_leaves.ranged.greenorange", { place: "source>target", travel: "stretch", speed: 0.7 }),
      snd("psfx.ranged-magic.generic.projectile.ranged.001", { bucketed: true }),
      fx("jb2a.impact.005.orange", { place: "target", filter: "GREENGOLD", waitFor: "travel", overlap: -250 })
    ])]
  },
  "earth-shock": {
    cues: [cue("cast", [
      fx("jb2a.impact.ground_crack.01.orange", { place: "target", below: true, filter: "EARTH" }),
      snd("psfx.casting.earth.001")
    ])]
  },
  "chain-lightning": {
    cues: [cue("cast", [
      fx("jb2a.chain_lightning.primary.blue", { place: "chain", travel: "stretch", stagger: 350, secondary: "jb2a.chain_lightning.secondary.blue" }),
      snd("psfx.3rd-level-spells.call-lightning.v1.primary"),
      fx("jb2a.static_electricity.01.blue", { place: "targets", stagger: 350, delay: 300 }),
      snd(SOUNDS.lightning, { delay: 300 })
    ])]
  },
  "gust-of-wind": {
    cues: [cue("region", [
      fx("jb2a.breath_weapons.cold.cone.blue", { place: "region-cone", travel: "stretch", filter: "AIR", opacity: 0.8 }),
      snd(SOUNDS.gust)
    ])]
  },
  "lightning-shield": {
    cues: [cue("cast", [
      fx("jb2a.static_electricity.01.blue", { place: "source", scale: 1.2 }),
      snd(SOUNDS.lightning)
    ])],
    // Borderline (an hour). Three charges at shoulder height, orbiting: the
    // direction refuses one lightning ball and refuses three attacks.
    //
    // **0.45, NOT 0.3** (read off `anim-lightning-shield-a.png`, 2026-09-15):
    // at a third of a token's width the charges photographed as three blue
    // specks about ten screen pixels across, which reads as a rendering
    // artefact rather than as three charges. The pair of frames 400 ms apart
    // is what says they are orbiting at all.
    loop: loop("effect", [fx("jb2a.lightning_ball.blue", { place: "orbit", count: 3, scale: 0.45, offset: 0.6, spin: 3600 })])
  },
  "healing-wave": {
    cues: [cue("cast", [
      fx("jb2a.healing_generic.03.burst.bluegreen", { place: "target", scale: 1.5 }),
      snd("psfx.1st-level-spells.cure-wounds.v1.001")
    ])]
  },
  rejuvenation: {
    cues: [cue("cast|effect", [
      fx("jb2a.healing_generic.200px.green", { place: "target", scale: 1.2 }),
      snd(SOUNDS.boon)
    ])],
    // Borderline: a minute of soft growth.
    loop: loop("effect", [fx("jb2a.swirling_leaves.loop.01.green", { place: "holder", opacity: 0.55 })])
  },
  "natures-grasp": {
    cues: [cue("cast", [
      fx("jb2a.vine.complete.nature.single.01.green", { place: "source", below: true }),
      snd("psfx.1st-level-spells.entangle.vines.v1.001.intro")
    ])]
  },
  // No frog: the token is never touched, and the appearance would have to wait
  // for a failed resistance in any case (the `sustain-resisted` candidate).
  hex: {
    cues: [cue("resist", [
      fx("jb2a.smoke.puff.centered.grey", { place: "resisted", scale: 1.3, filter: "HEX" }),
      snd(SOUNDS.generic)
    ])]
  },
  "faerie-fire": {
    cues: [cue("cast|effect", [fx("jb2a.markers.light.intro.blue", { place: "target", scale: 1.2, filter: "FAERIE" })])],
    loop: loop("effect", [fx("jb2a.markers.light.nopulse.blue", { place: "holder", filter: "FAERIE", opacity: 0.55 })])
  },
  "ghost-wolf": {
    cues: [cue("cast", [
      fx("jb2a.shimmer.01.blue", { place: "source", scale: 1.5 }),
      fx("jb2a.smoke.puff.ring.01.white", { place: "source" })
    ])]
  },
  "water-walking": {
    cues: [cue("cast|effect", [fx("jb2a.water_splash.circle.01.blue", { place: "target", below: true, hold: 1600, fadeOut: 400 })])]
  },
  "mark-of-the-wild": {
    cues: [cue("cast|effect", [
      fx("jb2a.on_token_buff.001.001.greenyellow", { place: "target", scale: 1.2 }),
      snd(SOUNDS.boon)
    ])]
  },
  "cure-poison": {
    cues: [cue("cast", [
      fx("jb2a.particles.outward.greenyellow.01.01", { place: "target", scale: 1.1 }),
      snd(SOUNDS.boon)
    ])]
  },

  /* ================= Shadow ================= */
  "shadow-bolt": {
    cues: [cue("cast", [
      fx("jb2a.overcharged_sphere.01.01.dark_purple", { place: "source>target", travel: "stretch", filter: "DARK" }),
      snd("psfx.ranged-magic.generic.missile.complete.001", { bucketed: true }),
      fx("jb2a.impact.004.blue", { place: "target", filter: "SHADOW_B", waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.necrotic, { waitFor: "travel", overlap: -250 })
    ])]
  },
  "mind-blast": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.inpulse.circle.01.normal", { place: "target", filter: "PSYCHIC" }),
      snd(SOUNDS.psychic)
    ])]
  },
  // No return drain: the healing use is a separate thing the card does not record.
  "death-coil": {
    cues: [cue("cast", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "source>target", travel: "stretch", filter: "DARK" }),
      fx("jb2a.toll_the_dead.green.skull_smoke", { place: "target", waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.necrotic, { waitFor: "travel", overlap: -250 })
    ])]
  },
  "carrion-swarm": {
    cues: [cue("region", [
      fx("jb2a.bats.loop.01.red", { place: "region-cone", travel: "move", duration: 1100, filter: "SHADOW_R" }),
      fx("jb2a.bats.loop.01.red", { place: "region-cone", travel: "move", duration: 1100, filter: "SHADOW_R", delay: 220, offset: 0.25 }),
      snd("psfx.cantrips.toll-the-dead.rasping-whispers.001")
    ])]
  },
  fear: { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "shadow-word-pain": { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "curse-of-agony": { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "curse-of-weakness": { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "curse-of-tongues": { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "mind-vision": { cues: [cue("cast", SCHOOL_CUES.shadow)] },
  "drain-life": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.in.green.01", { place: "target", filter: "PURPLE_G" }),
      snd(SOUNDS.strands, { bucketed: true })
    ])],
    loop: loop("sustain-channel", [fx("jb2a.energy_strands.range.standard.purple.01", { place: "channel", travel: "stretch", opacity: 0.85 })])
  },
  "psychic-scream": {
    cues: [cue("cast", [
      fx("jb2a.extras.tmfx.outpulse.circle.02.normal", { place: "source", scale: 2, filter: "PSYCHIC" }),
      snd("psfx.cantrips.mind-sliver.v1")
    ])]
  },
  "shadow-ward": {
    cues: [cue("cast|effect", [fx("jb2a.shimmer.01.blue", { place: "target", scale: 1.3, filter: "SHADOW_B" })])],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.eldritch_web.01.dark_purple", { place: "holder", scale: 1.5, below: true }),
      fx("jb2a.shield_themed.above.eldritch_web.01.dark_purple", { place: "holder", scale: 1.5 })
    ])
  },
  // The token's alpha is never touched: the priest stays visible (07's own words).
  fade: {
    cues: [cue("cast", [fx("jb2a.smoke.puff.ring.01.white", { place: "source", scale: 1.1, filter: "DIM" })])]
  },
  // **THE CARD RECORDS THE MOVE NOW** (the Legacy branches' doors 2 and 3): the
  // departure where the priest stood, at cast, and the arrival where the step put
  // them - both off the card's own `steps`, never off where the token stands when
  // the card arrives, which is already the destination.
  "shadow-walk": {
    cues: [
      cue("cast", [
        fx("jb2a.misty_step.01.blue", { place: "step-from", scale: 1.1, filter: "SHADOW_B" }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.7 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SHADOW_B" }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.7 })
      ])
    ]
  },

  /* ================= Fel ================= */
  "fel-bolt": {
    cues: [cue("cast", [
      fx("jb2a.ranged.04.projectile.01.green", { place: "source>target", travel: "stretch" }),
      snd("psfx.cantrips.fire-bolt.v1", { bucketed: true }),
      fx("jb2a.impact.fire.01.orange", { place: "target", filter: "FEL_O", waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.fire, { waitFor: "travel", overlap: -250 })
    ])]
  },
  "doom-bolt": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.in.green.01", { place: "source" }),
      fx("jb2a.ranged.04.projectile.01.green", { place: "source>target", travel: "stretch", scale: 1.5, delay: 1000 }),
      snd("psfx.cantrips.fire-bolt.v2", { bucketed: true, delay: 1000 }),
      fx("jb2a.explosion.08.orange", { place: "target", scale: 1.5, filter: "FEL_O", waitFor: "travel", overlap: -250 }),
      fx("jb2a.impact.ground_crack.orange.02", { place: "target", below: true, filter: "FEL_O", waitFor: "travel", overlap: -250 }),
      snd(SOUNDS.explode, { waitFor: "travel", overlap: -250 })
    ])]
  },
  hellfire: {
    cues: [cue("cast", [
      fx("jb2a.explosion.08.orange", { place: "source", area: 0.6, filter: "FEL_O" }),
      snd(SOUNDS.fire)
    ])],
    // 20 ft radius centered on you: forty feet across. A `sustain-*` loop has
    // no Region to measure, so the diameter is carried here and a census holds
    // it against this entry's own Target line.
    loop: loop("sustain-self", [
      fx("jb2a.ground_cracks.01.orange", { place: "holder", sizeFt: 40, below: true, filter: "FEL_O", opacity: 0.7 }),
      fx("jb2a.flames.02.orange", { place: "holder", scale: 1.2, filter: "FEL_O", opacity: 0.7 })
    ])
  },
  "rain-of-chaos": {
    cues: [cue("region", [
      fx("jb2a.impact.fire.01.orange", { place: "region-scatter", count: 5, area: [0.18, 0.34], stagger: 160, filter: "FEL_O" }),
      snd(SOUNDS.explode),
      snd(SOUNDS.explode, { delay: 480, volume: 0.7 })
    ])]
  },
  "drain-soul": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.in.green.01", { place: "target" }),
      snd(SOUNDS.strands, { bucketed: true })
    ])],
    loop: loop("sustain-channel", [fx("jb2a.energy_strands.range.standard.purple.03", { place: "channel", travel: "stretch", filter: "FEL_P" })])
  },
  "curse-of-exhaustion": silent("07 says there is nothing to see or break"),
  "howl-of-terror": {
    cues: [cue("cast", [
      fx("jb2a.cast_generic.sound.01.pinkteal", { place: "source", scale: 2.5, filter: "FEL_SOUND" }),
      snd("psfx.incantations.masculine.001.demonic.harm.001")
    ])]
  },
  // No disappearance at cast: 07 sends the thing back only on a failed
  // resistance, which is the chains on the resist trigger.
  banish: {
    cues: [
      cue("cast", SCHOOL_CUES.fel),
      cue("resist", [fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "resisted", filter: "FEL_B" })])
    ]
  },
  "enslave-demon": {
    cues: [
      cue("cast", SCHOOL_CUES.fel),
      cue("resist", [fx("jb2a.markers.chain.standard.complete.02.red", { place: "resisted", filter: "FEL_R" })])
    ]
  },
  consume: silent("nothing resolves; no sacrifice is recorded"),
  "health-funnel": {
    cues: [cue("cast", [
      fx("jb2a.energy_strands.in.green.01", { place: "source" }),
      snd(SOUNDS.strands, { bucketed: true })
    ])],
    loop: loop("sustain-channel", [fx("jb2a.energy_strands.range.standard.purple.04", { place: "channel-back", travel: "stretch", filter: "FEL_P" })])
  },
  "fel-armor": {
    cues: [cue("cast", [fx("jb2a.impact.fire.01.orange", { place: "source", scale: 0.6, filter: "FEL_O" })])],
    // Borderline (an hour).
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.fire.01.orange", { place: "holder", scale: 1.5, below: true, filter: "FEL_O" }),
      fx("jb2a.shield_themed.above.fire.01.orange", { place: "holder", scale: 1.5, filter: "FEL_O" })
    ])
  },
  "soul-link": {
    cues: [cue("cast|effect", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "FEL_P", opacity: 0.8 }),
      snd(SOUNDS.strands, { bucketed: true })
    ])],
    // Borderline (an hour): a thin thread between the two, drawn from the
    // caster who laid it to whoever holds it.
    loop: loop("effect", [fx("jb2a.energy_strands.range.standard.purple.01", { place: "channel-back", travel: "stretch", filter: "FEL_P", opacity: 0.35 })])
  },
  felstep: {
    cues: [cue("cast", [fx("jb2a.shimmer.01.blue", { place: "source", below: true, filter: "FEL_B" })])]
  },
  "demonic-sight": {
    cues: [cue("cast", [fx("jb2a.eyes.01.dark_green.single", { place: "source", hold: 1600, fadeOut: 400 })])]
  },

  /* ================= Holy ================= */
  smite: {
    cues: [cue("cast", [
      fx("jb2a.sacred_flame.target.yellow", { place: "target", scale: 1.2 }),
      snd("psfx.cantrips.sacred-flame.v1.001.target")
    ])]
  },
  "holy-fire": {
    cues: [cue("cast", [
      fx("jb2a.sacred_flame.target.yellow", { place: "target", scale: 1.3 }),
      fx("jb2a.markers.light.complete.blue", { place: "target", filter: "GOLD_B", opacity: 0.7, delay: 1100 })
    ])]
  },
  "holy-nova": {
    cues: [cue("cast", [
      fx("jb2a.template_circle.out_pulse.01.burst.bluewhite", { place: "source", area: 1, filter: "GOLD_B" }),
      snd(SOUNDS.bless2)
    ])]
  },
  consecration: {
    cues: [cue("region", [
      fx("jb2a.impact.006.yellow", { place: "region", area: 0.5, below: true }),
      snd(SOUNDS.bless1)
    ])],
    loop: loop("sustain-region", [fx("jb2a.ward.rune.yellow.01", { place: "region", area: 1, below: true, mask: true, opacity: 0.55 })])
  },
  "holy-light": {
    cues: [cue("cast", [
      fx("jb2a.healing_generic.400px.yellow", { place: "target", scale: 1.6 }),
      snd("psfx.1st-level-spells.cure-wounds.v1.001")
    ])]
  },
  "flash-of-light": {
    cues: [cue("cast", [
      fx("jb2a.impact.006.yellow", { place: "target", scale: 1, speed: 1.5 }),
      snd(SOUNDS.bless1)
    ])]
  },
  renew: {
    cues: [cue("cast|effect", [
      fx("jb2a.healing_generic.200px.yellow", { place: "target", scale: 1.2, opacity: 0.7 }),
      snd(SOUNDS.boon)
    ])]
  },
  "power-word-shield": {
    cues: [cue("cast|effect", [
      fx("jb2a.shield.01.intro.blue", { place: "target", scale: 1.5, filter: "GOLD_B" }),
      snd("psfx.1st-level-spells.shield-spell.intro.v1.003")
    ])],
    loop: loop("effect", [fx("jb2a.shield.01.loop.blue", { place: "holder", scale: 1.5, filter: "GOLD_B", opacity: 0.55 })])
  },
  "holy-ward": {
    cues: [cue("cast|effect", [
      fx("jb2a.shield.01.intro.blue", { place: "target", scale: 1.5, filter: "GOLD_B" }),
      snd("psfx.1st-level-spells.shield-spell.intro.v1.003")
    ])],
    loop: loop("effect", [fx("jb2a.shield.01.loop.blue", { place: "holder", scale: 1.5, filter: "GOLD_B", opacity: 0.55 })])
  },
  "devotion-aura": {
    cues: [cue("cast", [
      fx("jb2a.impact.006.yellow", { place: "source", scale: 2 }),
      snd(SOUNDS.bless1)
    ])],
    // Each ally within 20 ft: forty feet across, carried here for the same
    // reason Hellfire's is.
    loop: loop("sustain-self", [fx("jb2a.template_circle.aura.01.loop.large.bluepurple", { place: "holder", sizeFt: 40, below: true, filter: "GOLD_B", opacity: 0.35 })])
  },
  // No destruction: 07 turns undead on a failed Resilience Test and by tier,
  // neither of which the Casting Test decides.
  "turn-undead": {
    cues: [cue("cast", [
      fx("jb2a.divine_smite.caster.blueyellow", { place: "source", scale: 2 }),
      snd("psfx.class-features.divine-smite.v1.001.caster")
    ])]
  },
  "hammer-of-justice": {
    cues: [cue("cast", [
      fx("jb2a.divine_smite.target.blueyellow", { place: "target", scale: 1.3 }),
      snd("psfx.class-features.divine-smite.v1.001.target")
    ])]
  },
  "blessing-of-freedom": {
    cues: [cue("cast|effect", [
      fx("jb2a.on_token_buff.001.001.orangeyellow", { place: "target", scale: 1.2 }),
      snd(SOUNDS.bless1)
    ])]
  },
  levitate: {
    cues: [cue("cast|effect", [
      fx("jb2a.smoke.puff.ring.01.white", { place: "target", below: true, opacity: 0.5 }),
      snd(SOUNDS.gust)
    ])]
  },
  cleanse: {
    cues: [cue("cast", [
      fx("jb2a.particle_burst.01.circle.bluepurple", { place: "target", filter: "GOLD_B" }),
      snd(SOUNDS.bless1)
    ])]
  }
});

/* ------------------------------------------------------------------ */
/*  Spells above tier 1 that a Legacy branch teaches                   */
/* ------------------------------------------------------------------ */

/**
 * **THE TIER 2 AND HIGHER SPELLS A LEGACY BRANCH TEACHES** (the Legacy branches'
 * door 2): 04's Embrace the Shadows (*You know **Dark Passage***) and Shadow Hunt at
 * rank 2 (*and at rank 2 **Darkward** and **Dark Passage** as well*). Shadow Walk and
 * Shadow Ward, the other two they teach, are tier 1 and in `SPELL_ANIMATIONS`.
 *
 * **A SIBLING, NOT A ROW OF THE TIER 1 TABLE**, so that table's census - a row for
 * every tier 1 spell and for nothing else - stays exactly as strict, and this one is
 * held to 04's own words instead: `animation-table.test.mjs` reads every spell 04's
 * branch tables teach and fails one above tier 1 with no row here, and a row here
 * that no branch teaches.
 */
export const TAUGHT_SPELL_ANIMATIONS = Object.freeze({
  // Shadow Ward's skin, on each ally the Ward reaches.
  darkward: {
    cues: [cue("cast|effect", [fx("jb2a.shimmer.01.blue", { place: "target", scale: 1.3, filter: "SHADOW_B" })])],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.eldritch_web.01.dark_purple", { place: "holder", scale: 1.4, below: true, opacity: 0.8 }),
      fx("jb2a.shield_themed.above.eldritch_web.01.dark_purple", { place: "holder", scale: 1.4, opacity: 0.8 })
    ])
  },
  // Shadow Walk's departure and arrival, once for every creature the step carried.
  "dark-passage": {
    cues: [
      cue("cast", [
        fx("jb2a.misty_step.01.blue", { place: "step-from", scale: 1.1, filter: "SHADOW_B", stagger: 90 }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.8 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SHADOW_B", stagger: 90 }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.8 })
      ])
    ]
  }
});

/**
 * Every spell row the law looks up: the tier 1 table and the taught one. No
 * identifier is in both (`animation-table.test.mjs`).
 */
export const ALL_SPELL_ANIMATIONS = Object.freeze({ ...SPELL_ANIMATIONS, ...TAUGHT_SPELL_ANIMATIONS });

/* ------------------------------------------------------------------ */
/*  Features (the Legacy branches' door 2)                             */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A TALENT, A CLASS FEATURE, A GADGET OR A CREATURE'S ABILITY LOOKS LIKE**,
 * keyed by the feature's key (`rules/animation-records.mjs#featureKeyOf`). The file
 * comment gives the row's shape and its vocabulary.
 *
 * **02's Blink, Shadowstep and Avatar of the Wild proved the path** (phase B4); **the
 * Legacy branches' rows are the treatment** (phase B7): every active talent of the seven
 * branches, the Tinker's eight gadgets, the constructs' own abilities, the Gnomish Battle
 * Rig's shape, and every state the branches lay - a mark, a concealment, an Ethereal
 * Form, the Spirit Realm, a trap, a Sustain, a Stun or a hold with its escape, a bound
 * attack's spit, an aura. A passive with nothing to see has no row.
 *
 * Four rules every row keeps, each held by `animation-table.test.mjs` against the
 * talent table itself, so a row its door can never fire fails in Node:
 *
 * - **a trigger only where the feature fires it**: `use` on a feature the sync grants
 *   (or a gadget, or a creature's ability), `hit` and `strike` on what an attack card
 *   records (the card's own Attack, a bound attack patch, a rider), `rise` where the Use
 *   stands something up, `arrive` where it moves something, `region` where it places
 *   one, `hold` where it holds a blow or a Death Step;
 * - **an `effect` cue or loop names the `state` it follows**, a flag the feature's own
 *   door writes with its name - never a condition a failed Resist lays bare, which names
 *   no feature at all (the B4 review);
 * - **nothing is drawn on a creature before its Test**: a Use that asks a Resist plays at
 *   its user, and the condition's picture waits for the landing's own marks;
 * - **a creature's ability is never a state's** (`ability:` rows cue at `use` alone).
 *
 * `tools/animation/directions.mjs#FEATURE_DIRECTIONS` holds the direction each row
 * was written from, and the loop rule is re-derived from it as the spells' is.
 * **Every number is a starting value** (D-727), read against the frames in B8.
 */
export const FEATURE_ANIMATIONS = Object.freeze({
  /* ---- 02 §7's Mage ---- */
  blink: {
    cues: [
      cue("use", [
        fx("jb2a.misty_step.01.blue", { place: "step-from", scale: 1.2 }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic")
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.2 }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic")
      ])
    ]
  },

  /* ---- 02 §7's Rogue ---- */
  shadowstep: {
    cues: [
      cue("use", [
        fx("jb2a.smoke.puff.centered.grey", { place: "step-from", scale: 1.1, filter: "DARK" }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.6 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SHADOW_B" }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.6 })
      ])
    ]
  },

  /* ---- 02 §7's Druid ---- */
  // The shape is a state (D-769's one Active Effect), so the loop follows the effect
  // the Use laid and ends with it - a rest, 0 Health, the Half-Action to leave.
  // Borderline: the form stands until a rest, and the stop door is the release valve.
  "avatar-of-the-wild": {
    cues: [cue("use", [
      fx("jb2a.swirling_leaves.complete.02.green", { place: "source", scale: 1.6 }),
      snd("psfx.casting.earth.001")
    ])],
    loop: loop("effect", [fx("jb2a.swirling_leaves.loop.02.green", { place: "holder", scale: 1.4, opacity: 0.5 })], { state: "shape" })
  },

  /* ---- 02 §5's racial Uses (the B8a2 pass) ---- */
  // The tauren's stamp: the ground cracking and a ring of dust thrown out at the hooves.
  // Nothing is drawn on an enemy: who falls Prone is its Test's, and the failure lands it.
  "war-stomp": {
    cues: [cue("use", [
      fx("jb2a.impact.ground_crack.orange.02", { place: "source", scale: 2.2, below: true, filter: "EARTH" }),
      fx("jb2a.smoke.puff.ring.01.white", { place: "source", scale: 2.4, delay: 120, filter: "EARTH" }),
      snd(SOUNDS.blunt, { volume: 0.9 }),
      snd("psfx.casting.earth.001", { delay: 150, volume: 0.7 })
    ])]
  },
  // The troll's fury, flared at the Use, and an ember-glow under him for the encounter the
  // Boon on his attacks lasts (the laid Boon's effect carries the encounter's `talentBuff`).
  berserking: {
    cues: [cue("use", [
      fx("jb2a.cast_generic.fire.01.orange", { place: "source", scale: 1.4, filter: "DESATURATE" }),
      snd("psfx.creature.dragons.roar.small", { volume: 0.6 })
    ])],
    loop: loop("effect", [fx("jb2a.flames.04.loop.orange", { place: "holder", scale: 1.3, below: true, opacity: 0.35 })], { state: "talentBuff" })
  },
  // The orc's word to a friend: a brief blessing on the creature named. The Boon itself
  // waits for that creature's next Test and is spent by it.
  "thralls-discipline": {
    cues: [cue("use", [
      fx("jb2a.bless.200px.intro.yellow", { place: "target", scale: 1.1 }),
      snd(SOUNDS.boon, { volume: 0.7 })
    ])]
  },

  /* ================= Blademaster (Orc Warrior) ================= */
  // A Reaction at any time: the free Move is the player's own drag, so there is no
  // step to record - the wind gathers at the blademaster, and stands on him while no
  // blow may answer him (the `unanswered` state) and while he stays hidden at rank 2
  // (the `concealed` one, which core's own invisible status hides from other eyes).
  "wind-walk": {
    cues: [cue("use", [
      fx("jb2a.wind_stream.white", { place: "source", scale: 1.4, opacity: 0.85, hold: 900, fadeOut: 300 }),
      snd(SOUNDS.gust, { volume: 0.8 })
    ])],
    loops: [
      loop("effect", [fx("jb2a.wind_stream.white", { place: "holder", scale: 1.3, opacity: 0.4 })], { state: "unanswered" }),
      loop("effect", [fx("jb2a.condition.boon.02.001.refraction", { place: "holder", scale: 1.2, opacity: 0.45 })], { state: "concealed" })
    ]
  },
  // The creature named, and its marker for as long as the mark holds (door 18).
  "the-challenge": {
    cues: [cue("use", [
      fx("jb2a.impact.013.001.orangeyellow", { place: "target", scale: 0.8 }),
      snd("psfx.creature.dragons.roar.small", { volume: 0.5 })
    ])],
    loop: loop("mark", [fx("jb2a.ui.indicator.yellow.01.01", { place: "holder", scale: 1.1, opacity: 0.9 })])
  },
  // The hit turned into a miss, on the blademaster it was aimed at (the card's `hold`).
  afterimage: {
    cues: [cue("hold", [
      fx("jb2a.misty_step.01.blue", { place: "target", scale: 1.2, filter: "DESATURATE", opacity: 0.8 }),
      fx("jb2a.ui.miss.white", { place: "target", scale: 0.9, delay: 150 }),
      snd(SOUNDS.swingLight, { volume: 0.7 })
    ])]
  },
  // The storm gathered at the Use, standing for the round no blow may answer, and every
  // blow its card's Attack makes a whirling cut rather than the blade's own swing.
  bladestorm: {
    cues: [cue("use", [
      fx("jb2a.template_circle.whirl.intro.blue", { place: "source", scale: 2.2, filter: "DESATURATE" }),
      snd(SOUNDS.swingHeavy)
    ])],
    loop: loop("effect", [fx("jb2a.template_circle.whirl.loop.blue", { place: "holder", scale: 2, opacity: 0.45, filter: "DESATURATE" })], { state: "unanswered" }),
    strike: strike({ swing: melee("jb2a.melee_generic.whirlwind.01.orange", { heavy: true }), impact: blow(SOUNDS.slash) })
  },

  /* ================= Mountain King (Dwarf Warrior) ================= */
  // A jolt on the blow that rode it, a beat after the weapon's own impact lands.
  bash: {
    cues: [cue("hit", [
      fx("jb2a.impact.013.001.orangeyellow", { place: "target", scale: 0.7, delay: 420 }),
      snd(SOUNDS.blunt, { delay: 420, volume: 0.8 })
    ])]
  },
  // The hammer thrown and come back (*The weapon returns to your hand*), lightning where
  // it lands. A shield's throw stands in for the hammer, as `thrown-hammer`'s does.
  "storm-bolt": {
    strike: strike({
      swing: { asset: "jb2a.shield_attack.ranged.throw.01.white.01", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingHeavy) },
      impact: { asset: "jb2a.static_electricity.01.blue", place: "target", scale: 0.9, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.lightning) },
      ret: fx("jb2a.shield_attack.ranged.return.01.white.01", { place: "target>source", travel: "stretch", delay: 500 }),
      standIn: "visual"
    })
  },
  "thunder-clap": {
    cues: [cue("use", [
      fx("jb2a.thunderwave.center.blue", { place: "source", area: 1 }),
      snd("psfx.cantrips.thunderclap.v1"),
      fx("jb2a.impact.ground_crack.orange.02", { place: "source", area: 0.6, below: true, delay: 150, filter: "EARTH" })
    ])]
  },
  // The aura's Armor Point on each ally at the dwarf's shoulder (D-755's laid aura).
  "shoulder-to-shoulder": {
    loop: loop("effect", [fx("jb2a.shield_themed.below.molten_earth.01.orange", { place: "holder", scale: 1.3, below: true, opacity: 0.4, filter: "EARTH" })], { state: "aura" })
  },
  bedrock: {
    cues: [cue("use", [
      fx("jb2a.shield_themed.above.molten_earth.01.orange", { place: "source", scale: 1.4, filter: "EARTH", hold: 1200, fadeOut: 400 }),
      snd("psfx.casting.earth.001")
    ])]
  },
  // The encounter's Armor Points, Ward and Damage Rating ride one buff (`talentBuff`).
  "the-mountain-wakes": {
    cues: [cue("use", [
      fx("jb2a.impact.ground_crack.orange.02", { place: "source", scale: 2.4, below: true, filter: "EARTH" }),
      fx("jb2a.cast_generic.earth.01.browngreen", { place: "source", scale: 1.6 }),
      snd("psfx.casting.earth.001")
    ])],
    loop: loop("effect", [
      fx("jb2a.shield_themed.below.molten_earth.01.orange", { place: "holder", scale: 1.5, below: true, opacity: 0.6, filter: "EARTH" }),
      fx("jb2a.shield_themed.above.molten_earth.01.orange", { place: "holder", scale: 1.5, opacity: 0.6, filter: "EARTH" })
    ], { state: "talentBuff" })
  },

  /* ================= Dark Ranger (Forsaken Ranger) ================= */
  // The rider's own arrow, and its mark for as long as the creature recovers nothing.
  "black-arrow": {
    strike: strike({
      swing: { asset: "jb2a.arrow.poison.green.01", place: "source>target", travel: "stretch", filter: "DARK", sound: snd(SOUNDS.longbow, { bucketed: true }) },
      impact: { asset: "jb2a.toll_the_dead.green.skull_smoke", place: "target", scale: 0.7, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.necrotic, { volume: 0.7 }) }
    }),
    loop: loop("effect", [fx("jb2a.markers.skull.purple.01", { place: "holder", scale: 1.1, opacity: 0.55 })], { state: "noHealing" })
  },
  // The raise's own card (`effects/after-blow.mjs#raiseFallen`): the skeleton's token.
  "dark-minion": {
    cues: [cue("rise", [
      fx("jb2a.toll_the_dead.green.skull_smoke", { place: "risen", scale: 1.2 }),
      fx("jb2a.impact.ground_crack.orange.02", { place: "risen", scale: 1.1, below: true, filter: "DARK" }),
      snd("psfx.cantrips.toll-the-dead.ominous-bell.001", { volume: 0.7 })
    ])]
  },
  // At the ranger alone: who is Frightened is the Resist's, and 07's rule waits for it.
  "banshees-wail": {
    cues: [cue("use", [
      fx("jb2a.toll_the_dead.green.shockwave", { place: "source", area: 1 }),
      snd("psfx.incantations.feminine.001.reverb.harm.007")
    ])]
  },
  "hush-of-the-grave": {
    cues: [cue("region", [
      fx("jb2a.template_circle.out_pulse.02.burst.bluewhite", { place: "region", area: 1, filter: "DARK" }),
      fx("jb2a.markers.mute.dark_red.01", { place: "region", area: 0.3, delay: 300, hold: 1200, fadeOut: 400 }),
      snd("psfx.cantrips.toll-the-dead.rasping-whispers.001", { volume: 0.8 })
    ])]
  },
  // Drawn from the creature to the ranger.
  "life-drain": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", travel: "stretch" }),
      snd(SOUNDS.strands, { bucketed: true }),
      fx("jb2a.energy_strands.in.green.01", { place: "target", filter: "PURPLE_G", delay: 200 })
    ])]
  },
  // The call at the ranger; the chains only when the creature's Test fails and its
  // Charmed takes the thrall's mark (`effects/legacy-uses.mjs#bindThrall`).
  "thrall-of-the-banshee": {
    cues: [
      cue("use", [
        fx("jb2a.cast_generic.sound.01.pinkteal", { place: "source", scale: 1.6, filter: "SHADOW_B" }),
        snd("psfx.incantations.whispers.fem.001.forward.standard.001", { volume: 0.8 })
      ]),
      cue("effect", [
        fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "effect", scale: 1.2 }),
        snd("psfx.incantations.whispers.fem.001.forward.standard.002", { volume: 0.6 })
      ], { state: "thrall" })
    ],
    loop: loop("effect", [fx("jb2a.markers.chain.spectral_standard.loop.02.blue", { place: "holder", scale: 1.2, opacity: 0.7 })], { state: "thrall" })
  },

  /* ================= Warden (Night Elf Rogue) ================= */
  // The trap set, the rune it stands as, and the chains on whatever it caught - the
  // Entangled its spring lays carries the trap's name on its escape.
  "shadow-trap": {
    cues: [
      cue("region", [
        fx("jb2a.particle_burst.01.rune.bluepurple", { place: "region", area: 1, filter: "SHADOW_B" }),
        snd("psfx.magic-signs.rune.v1.abjuration.intro", { volume: 0.7 })
      ]),
      cue("effect", [
        fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "effect", scale: 1.2, filter: "SHADOW_B" }),
        snd(SOUNDS.blunt, { volume: 0.4 })
      ], { state: "escape" })
    ],
    loops: [
      loop("region", [fx("jb2a.template_circle.symbol.normal.runes.orange", { place: "region", area: 1, below: true, opacity: 0.45, filter: "SHADOW_B" })]),
      loop("effect", [fx("jb2a.markers.chain.spectral_standard.loop.02.blue", { place: "holder", scale: 1.2, opacity: 0.7, filter: "SHADOW_B" })], { state: "escape" })
    ]
  },
  // The knives about the warden at the Use, and every attack its card makes a throw.
  "fan-of-knives": {
    cues: [cue("use", [
      fx("jb2a.cloud_of_daggers.daggers.purple", { place: "source", scale: 1.8, hold: 900, fadeOut: 300, filter: "DESATURATE" }),
      snd(SOUNDS.swingLight)
    ])],
    strike: strike({
      swing: { asset: "jb2a.dagger.throw.01.white", place: "source>target", travel: "stretch", sound: snd(SOUNDS.swingLight) },
      impact: blow(SOUNDS.slash, { volume: 0.6, scale: 0.35, waitFor: "travel", overlap: -250 }),
      standIn: "sound"
    })
  },
  // The rider's own throw, darkened, and the Bleeding it opens.
  "shadow-strike": {
    strike: strike({
      swing: { asset: "jb2a.dagger.throw.01.white", place: "source>target", travel: "stretch", filter: "DARK", sound: snd(SOUNDS.swingLight) },
      impact: { asset: "jb2a.liquid.splash02.red", place: "target", scale: 0.5, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.slash, { volume: 0.7 }) }
    })
  },
  unfettered: {
    cues: [cue("use", [
      fx("jb2a.particle_burst.01.circle.bluepurple", { place: "source", scale: 1, filter: "SHADOW_B" }),
      snd(SOUNDS.gust, { volume: 0.6 })
    ])]
  },
  // The Finisher's Entangled, whose escape carries Shackle's name (`finisherShackle`).
  shackle: {
    cues: [cue("effect", [
      fx("jb2a.markers.chain.standard.complete.02.red", { place: "effect", scale: 1.2, filter: "DESATURATE" }),
      snd(SOUNDS.blunt, { volume: 0.5 })
    ], { state: "escape" })],
    loop: loop("effect", [fx("jb2a.markers.chain.standard.loop.02.red", { place: "holder", scale: 1.2, opacity: 0.75, filter: "DESATURATE" })], { state: "escape" })
  },
  // On the creature watched, and only on a client that owns the warden (door 18).
  "the-long-watch": {
    loop: loop("mark", [fx("jb2a.ui.indicator.bluegreen.02.01", { place: "holder", scale: 1, opacity: 0.75 })])
  },
  "fade-step": {
    cues: [
      cue("use", [
        fx("jb2a.misty_step.01.blue", { place: "step-from", scale: 1.1, filter: "SHADOW_B", movers: ["self"] }),
        snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.6 })
      ]),
      cue("arrive", [
        fx("jb2a.misty_step.02.blue", { place: "step-to", scale: 1.1, filter: "SHADOW_B", movers: ["self"] }),
        snd("psfx.2nd-level-spells.misty-step.v1.outro.generic", { volume: 0.6 })
      ])
    ]
  },
  "the-vault-opens": {
    cues: [
      cue("use", [
        fx("jb2a.template_circle.out_pulse.02.burst.bluewhite", { place: "source", area: 1, filter: "SHADOW_B" }),
        snd("psfx.magic-signs.circle.v1.abjuration.intro", { volume: 0.8 })
      ]),
      cue("effect", [fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "effect", scale: 1.2 })], { state: "escape" })
    ],
    loop: loop("effect", [fx("jb2a.markers.chain.spectral_standard.loop.02.blue", { place: "holder", scale: 1.2, opacity: 0.7 })], { state: "escape" })
  },
  "wardens-cage": {
    cues: [
      cue("use", [fx("jb2a.cast_generic.02.blue", { place: "source", scale: 0.8, filter: "SHADOW_B" })]),
      cue("effect", [
        fx("jb2a.bubble.001.001.complete.blue", { place: "effect", scale: 1.3, filter: "SHADOW_B" }),
        snd("psfx.magic-signs.circle.v1.abjuration.intro", { volume: 0.5 })
      ], { state: "escape" })
    ],
    loop: loop("effect", [fx("jb2a.bubble.001.001.loop.blue", { place: "holder", scale: 1.3, opacity: 0.6, filter: "SHADOW_B" })], { state: "escape" })
  },
  // Every creature pulled, each its own drag and its own chains; the warden moves not.
  "none-escape": {
    cues: [
      cue("use", [fx("jb2a.cast_generic.02.blue", { place: "source", scale: 1, filter: "SHADOW_B" })]),
      cue("arrive", [
        fx("jb2a.energy_strands.range.standard.purple.02", { place: "step", travel: "stretch", movers: ["pull"], filter: "SHADOW_B", stagger: 120 }),
        fx("jb2a.markers.chain.spectral_standard.complete.02.blue", { place: "step-to", movers: ["pull"], scale: 1.1, stagger: 120, delay: 300 }),
        snd(SOUNDS.strands, { bucketed: true })
      ])
    ]
  },

  /* ================= Tinker (Gnome Rogue) ================= */
  // A construct built or rebuilt, where its token stands up.
  "the-bench": {
    cues: [cue("rise", [
      fx("jb2a.fumes.steam.white", { place: "risen", scale: 1.3, opacity: 0.85 }),
      fx("jb2a.static_electricity.02.blue", { place: "risen", scale: 0.9, delay: 200 }),
      snd("psfx.cantrips.mending.v1.001.with-cast")
    ])]
  },
  // Over the area the card placed; the construct it is fired from is recorded nowhere
  // the Region carries, so no rocket is drawn from it.
  "cluster-rockets": {
    cues: [cue("region", [
      fx("jb2a.explosion.01.orange", { place: "region-scatter", count: 4, area: [0.3, 0.45], stagger: 140 }),
      fx("jb2a.explosion.shrapnel.bomb.01.black", { place: "region", area: 0.6, delay: 280 }),
      snd(SOUNDS.explode),
      snd(SOUNDS.explode, { delay: 420, volume: 0.7 })
    ])]
  },
  "remote-control": {
    cues: [cue("use", [
      fx("jb2a.static_electricity.01.blue", { place: "source", scale: 0.6 }),
      snd("psfx.cantrips.shocking-grasp.v1.001", { volume: 0.5 })
    ])]
  },
  "arclight-spanner": {
    cues: [cue("use", [
      fx("jb2a.static_electricity.03.blue", { place: "target", scale: 0.9 }),
      fx("jb2a.swirling_sparkles.01.blue", { place: "target", scale: 1, delay: 250 }),
      snd("psfx.cantrips.mending.v1.001.with-cast")
    ])]
  },
  "pocket-factory": {
    cues: [cue("rise", [
      fx("jb2a.smoke.puff.centered.grey", { place: "risen", scale: 1, stagger: 150 }),
      fx("jb2a.static_electricity.02.blue", { place: "risen", scale: 0.8, stagger: 150, delay: 150 }),
      snd("psfx.cantrips.mending.v1.001.with-cast", { volume: 0.8 })
    ])]
  },
  // On the gnome and each creature carried, where the pad put them; a traveller taken
  // to another scene has no token here to draw on.
  "ultrasafe-transporter": {
    cues: [cue("use", [
      fx("jb2a.teleport.01.blue", { place: "source", scale: 1.4 }),
      fx("jb2a.teleport.01.blue", { place: "targets", scale: 1.4, stagger: 120 }),
      snd("psfx.2nd-level-spells.misty-step.v1.complete.generic")
    ])]
  },
  // The shape (D-769's one Active Effect), as Avatar of the Wild's is.
  "gnomish-battle-rig": {
    cues: [cue("use", [
      fx("jb2a.fumes.steam.white", { place: "source", scale: 2 }),
      fx("jb2a.static_electricity.02.blue", { place: "source", scale: 1.6, delay: 200 }),
      snd(SOUNDS.blunt)
    ])],
    loop: loop("effect", [fx("jb2a.fumes.steam.white", { place: "holder", scale: 1.3, opacity: 0.3 })], { state: "shape" })
  },

  /* ---- 04's eight gadgets ---- */
  // The card's own Attack is the net's throw, and the web stands on the creature held.
  "net-o-matic-projector": {
    strike: strike({
      swing: { asset: "jb2a.snowball_toss.white.01", place: "source>target", travel: "stretch", filter: "DARKEN", sound: snd(SOUNDS.swingLight) },
      impact: { asset: "jb2a.web.01", place: "target", scale: 0.9, waitFor: "travel", overlap: -250, sound: snd(SOUNDS.blunt, { volume: 0.3 }) },
      standIn: "visual"
    }),
    loop: loop("effect", [fx("jb2a.web.loop.002.white", { place: "holder", scale: 1.1, opacity: 0.75 })], { state: "escape" })
  },
  "gnomish-cloaking-device": {
    cues: [
      cue("use", [
        fx("jb2a.static_electricity.01.blue", { place: "source", scale: 0.7 }),
        snd("psfx.casting.generic.001", { volume: 0.6 })
      ]),
      cue("effect", [fx("jb2a.shimmer.01.blue", { place: "effect", scale: 1.2, opacity: 0.8 })], { state: "concealed" })
    ],
    loop: loop("effect", [fx("jb2a.condition.boon.02.001.refraction", { place: "holder", scale: 1.2, opacity: 0.45 })], { state: "concealed" })
  },
  "alarm-o-bot": {
    cues: [cue("region", [
      fx("jb2a.detect_magic.circle.blue", { place: "region", area: 1, opacity: 0.55 }),
      snd("psfx.cantrips.light.v1.001", { volume: 0.7 })
    ])]
  },
  "discombobulator-ray": {
    cues: [cue("use", [
      fx("jb2a.energy_beam.normal.bluepink.02", { place: "source>target", travel: "stretch" }),
      snd("psfx.ranged-magic.generic.beam.001")
    ])]
  },
  "gnomish-universal-remote": {
    cues: [cue("use", [
      fx("jb2a.ranged.03.instant.01.bluegreen", { place: "source>target", travel: "stretch" }),
      snd("psfx.cantrips.shocking-grasp.v1.002", { volume: 0.7 }),
      fx("jb2a.static_electricity.01.blue", { place: "target", scale: 0.8, delay: 300 })
    ])]
  },
  "harm-prevention-belt": {
    cues: [cue("use", [
      fx("jb2a.shield.01.intro.blue", { place: "source", scale: 1.4 }),
      snd("psfx.1st-level-spells.shield-spell.intro.v1.003", { volume: 0.8 })
    ])]
  },
  recombobulator: {
    cues: [cue("use", [
      fx("jb2a.healing_generic.200px.blue", { place: "target", scale: 1.1 }),
      fx("jb2a.static_electricity.01.blue", { place: "target", scale: 0.7, delay: 200 }),
      snd("psfx.cantrips.mending.v1.001.with-cast")
    ])]
  },
  "parachute-cloak": {
    cues: [cue("use", [
      fx("jb2a.swirling_feathers.outburst.01.textured", { place: "source", below: true, opacity: 0.8 }),
      snd(SOUNDS.gust)
    ])]
  },

  /* ---- 14 §13's constructs: their own abilities ---- */
  // Each attack a construct makes already plays its form (Peck a bite, Claws a claw,
  // the Flame jet a fire bolt, a Kick and the rig's Piston fist a slam; held by
  // `animation-table.test.mjs`). Breath is no construct's alone - 14's Drake breathes
  // its flight's school and Nefarian his own - so `ability:breath` takes no row.
  "ability:battle-squawk": {
    cues: [cue("use", [
      fx("jb2a.cast_generic.sound.01.pinkteal", { place: "source", scale: 1.8, filter: "DESATURATE" }),
      snd("psfx.creature.dragons.roar.small", { volume: 0.35 })
    ])]
  },
  "ability:vent": {
    cues: [cue("use", [
      fx("jb2a.fire_ring.500px.red", { place: "source", sizeFt: 25, below: true, grow: 400, hold: 1000 }),
      fx("jb2a.fumes.steam.white", { place: "source", scale: 1.6, delay: 150 }),
      snd(SOUNDS.fire)
    ])]
  },
  "ability:self-destruct": {
    cues: [cue("use", [
      fx("jb2a.explosion.01.orange", { place: "source", scale: 2.2 }),
      fx("jb2a.explosion.shrapnel.bomb.01.black", { place: "source", scale: 2, delay: 120 }),
      snd(SOUNDS.explode)
    ])]
  },
  // Its own card (`effects/legacy-uses.mjs#useCuttingGear`), read by its speaker.
  "ability:cutting-gear": {
    cues: [cue("use", [
      fx("jb2a.impact.013.001.orangeyellow", { place: "source", scale: 0.6 }),
      snd(SOUNDS.slash, { volume: 0.6 })
    ])]
  },

  /* ================= Shadow Hunter (Troll Shaman) ================= */
  "trolls-blood": {
    cues: [cue("use", [
      fx("jb2a.healing_generic.burst.greenorange", { place: "target", scale: 1.1 }),
      snd(SOUNDS.boon)
    ])]
  },
  // On the blow that rode it, a beat after the weapon's own impact.
  jinx: {
    cues: [cue("hit", [
      fx("jb2a.condition.curse.01.001.red", { place: "target", scale: 0.9, delay: 420, hold: 1200, fadeOut: 400 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.001", { delay: 420, volume: 0.5 })
    ])]
  },
  "voodoo-mending": {
    cues: [cue("use", [
      fx("jb2a.healing_generic.burst.greenorange", { place: "target", scale: 1.3 }),
      fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "target", scale: 1.1, delay: 200 }),
      snd("psfx.1st-level-spells.cure-wounds.v1.001")
    ])]
  },
  // The Searing totem's spit under the patch (door 20), and the Poisoned it lays,
  // whose shed DC carries the talent's name.
  "serpent-ward": {
    strike: strike({
      swing: { asset: "jb2a.ranged.04.projectile.01.green", place: "source>target", travel: "stretch", sound: snd("psfx.cantrips.poison-spray.v1", { volume: 0.8 }) },
      impact: { asset: "jb2a.liquid.splash.blue", place: "target", scale: 0.6, filter: "VENOM_B", waitFor: "travel", overlap: -250, sound: snd(SOUNDS.necrotic, { volume: 0.5 }) }
    }),
    loop: loop("effect", [fx("jb2a.markers.poison.dark_green.01", { place: "holder", scale: 1.1, opacity: 0.65 })], { state: "shedDc" })
  },
  "evil-eye": {
    cues: [cue("use", [
      fx("jb2a.eyes.01.dark_green.many", { place: "source", area: 0.7, hold: 1400, fadeOut: 400 }),
      snd("psfx.incantations.masculine.002.dry.harm.004", { volume: 0.8 })
    ])]
  },
  // The aura's Bane on each enemy within 30 feet of the Tremor totem (door 20).
  "loa-drum": {
    loop: loop("effect", [fx("jb2a.markers.runes.dark_orange.01", { place: "holder", scale: 1.1, below: true, opacity: 0.45 })], { state: "aura" })
  },
  // The Stun's own escape carries the talent's name.
  "bad-mojo": {
    cues: [
      cue("use", [
        fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "source", scale: 1 }),
        snd("psfx.incantations.masculine.002.dry.harm.004", { volume: 0.8 })
      ]),
      cue("effect", [fx("jb2a.condition.curse.01.001.red", { place: "effect", scale: 1.1, hold: 1200, fadeOut: 400 })], { state: "escape" })
    ],
    loop: loop("effect", [fx("jb2a.markers.on_token_mask.loop.01.orange", { place: "holder", scale: 1.1, opacity: 0.85 })], { state: "escape" })
  },
  // Its own Sustain (`identifier: "big-bad-voodoo"`, held to the row's key by the
  // census), and each catch of the floor its aura lays (07's Aegis floor's own write).
  "big-bad-voodoo": {
    cues: [
      cue("use", [
        fx("jb2a.healing_generic.burst.greenorange", { place: "source", scale: 2 }),
        fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "source", scale: 1.4, delay: 250 }),
        snd("psfx.incantations.masculine.002.reverb.help.005")
      ]),
      cue("hold", [
        fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "targets", scale: 1.1 }),
        fx("jb2a.healing_generic.burst.greenorange", { place: "targets", scale: 0.9, delay: 150 }),
        snd(SOUNDS.boon)
      ])
    ],
    loop: loop("sustain-self", [
      fx("jb2a.markers.on_token_mask.loop.01.orange", { place: "holder", scale: 1.3, opacity: 0.8 }),
      fx("jb2a.template_circle.aura.01.loop.large.bluepurple", { place: "holder", sizeFt: 40, below: true, opacity: 0.25, filter: "GREENGOLD" })
    ])
  },

  /* ================= Spirit Walker (Tauren Shaman) ================= */
  // The Death Step held back (`AzerothActor#takeDeathStep`'s card): holder to spared.
  "hold-the-thread": {
    cues: [cue("hold", [
      fx("jb2a.energy_strands.range.standard.purple.02", { place: "source>target", travel: "stretch", filter: "GOLD_B" }),
      fx("jb2a.shimmer.01.blue", { place: "target", scale: 1.3, delay: 250 }),
      snd(SOUNDS.boon)
    ])]
  },
  // Its Use from the sheet - the table's own door for a hit no card carried.
  "shared-burden": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.03", { place: "target>source", travel: "stretch", filter: "GOLD_B" }),
      snd(SOUNDS.strands, { bucketed: true, volume: 0.7 })
    ])]
  },
  "ancestors-hand": {
    cues: [
      cue("use", [fx("jb2a.spirit_guardians.blueyellow.ring", { place: "source", scale: 2.4, opacity: 0.7, hold: 1100, fadeOut: 400 })]),
      cue("rise", [
        fx("jb2a.divine_smite.caster.blueyellow", { place: "risen", scale: 1.1, stagger: 150 }),
        fx("jb2a.healing_generic.burst.greenorange", { place: "risen", scale: 1, stagger: 150, delay: 200 }),
        snd("psfx.1st-level-spells.cure-wounds.v1.001")
      ])
    ]
  },
  // The Spirit Realm's state on the shaman (door 10); the body stands where it was.
  "the-crossing": {
    cues: [cue("use", [
      fx("jb2a.shimmer.01.blue", { place: "source", scale: 1.4 }),
      fx("jb2a.smoke.puff.ring.01.white", { place: "source", opacity: 0.6 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.003", { volume: 0.6 })
    ])],
    loop: loop("effect", [fx("jb2a.spirit_guardians.blueyellow.ring", { place: "holder", scale: 1.6, below: true, opacity: 0.4 })], { state: "spiritRealm" })
  },
  disenchant: {
    cues: [cue("use", [
      fx("jb2a.particle_burst.01.circle.bluepurple", { place: "targets", scale: 0.9, stagger: 120 }),
      snd("psfx.magic-signs.circle.v1.abjuration.outro", { volume: 0.8 })
    ])]
  },
  "burial-ground": {
    cues: [cue("region", [
      fx("jb2a.eyes.01.dark_green.few", { place: "region-scatter", count: 3, area: [0.12, 0.2], stagger: 250 }),
      snd("psfx.cantrips.toll-the-dead.ominous-bell.001", { volume: 0.6 })
    ])],
    loop: loop("region", [fx("jb2a.spirit_guardians.blueyellow.ring", { place: "region", area: 1, below: true, mask: true, opacity: 0.35 })])
  },
  // On the shaman and each friend Kindred Spirits covers, each its own arrival.
  "ethereal-form": {
    cues: [cue("effect", [
      fx("jb2a.shimmer.01.blue", { place: "effect", scale: 1.3 }),
      snd("psfx.incantations.whispers.masc.001.forward.standard.003", { volume: 0.5 })
    ], { state: "ethereal" })],
    loop: loop("effect", [fx("jb2a.markers.smoke.ring.loop.bluepurple", { place: "holder", scale: 1.3, opacity: 0.5 })], { state: "ethereal" })
  },
  // The thread at the Use; the halving on the creature only once its Test has failed.
  "drawn-across": {
    cues: [
      cue("use", [
        fx("jb2a.energy_strands.range.standard.purple.03", { place: "source>target", travel: "stretch", filter: "GOLD_B" }),
        snd(SOUNDS.strands, { bucketed: true, volume: 0.7 })
      ]),
      cue("effect", [fx("jb2a.shimmer.01.blue", { place: "effect", scale: 1.3, filter: "DIM" })], { state: "halvesDealt" })
    ],
    loop: loop("effect", [fx("jb2a.energy_field.01.blue", { place: "holder", scale: 1.2, opacity: 0.35 })], { state: "halvesDealt" })
  },
  "ancestral-spirit": {
    cues: [
      cue("use", [
        fx("jb2a.divine_smite.caster.blueyellow", { place: "source", scale: 1.6 }),
        snd("psfx.class-features.divine-smite.v1.001.caster", { volume: 0.7 })
      ]),
      cue("rise", [
        fx("jb2a.divine_smite.caster.reversed.blueyellow", { place: "risen", scale: 1.3 }),
        fx("jb2a.healing_generic.burst.greenorange", { place: "risen", scale: 1.2, delay: 300 }),
        snd("psfx.1st-level-spells.cure-wounds.v1.001")
      ])
    ]
  }
});

/* ------------------------------------------------------------------ */
/*  Jinker's candidates, for the lead to pick from in Phase 5          */
/* ------------------------------------------------------------------ */

/**
 * WHAT JINKER'S PACK NAMES MORE CLOSELY THAN THE DRAFT (D-727).
 *
 * A name is not a picture. Every row here is an asset whose NAME matches the
 * design document's direction better than the shipped JB2A key does; Phase 5
 * renders both at the same moment of the cue or loop and the lead chooses.
 * **Nothing here plays until then** - the `draft` column is what
 * `SPELL_ANIMATIONS` and `STRIKE_ANIMATIONS` hold today.
 *
 * `binding` marks the three rows that would ADD a loop rather than replace an
 * asset: Hex, Enslave Demon and Banish have cue-only rows, and Jinker's token
 * overlays would give each a `sustain-resisted` loop - a lasting appearance
 * that waits for a failed Resilience Test, which is what 07 asks for and what
 * nothing could express before the resist record existed (D-726). The binding
 * is built and unused.
 *
 * Keyed by identifier for a spell, by `strike:<form>` for a strike and by
 * `feature:<key>` for a feature's row (the Legacy branches' phase B7), so Phase 5
 * can render a pair without matching prose.
 */
export const COMPARISONS = Object.freeze({
  immolate: { what: "loop", direction: "flames on the affected creature", draft: "jb2a.flames.04.loop.orange", candidate: "jaamod.condition.burning" },
  immolation: { what: "loop", direction: "flames on the caster", draft: "jb2a.flames.04.loop.orange", candidate: "jaamod.condition.burning" },
  "fire-nova": { what: "cue", direction: "a low ring of flame from the caster's feet", draft: "jb2a.fire_ring.500px.red", candidate: "jaamod.fire.fire_ring" },
  conflagrate: { what: "cue", direction: "a sudden compact flare", draft: "jb2a.explosion.08.orange", candidate: "jaamod.misc.fire_boom" },
  flamestrike: { what: "cue", direction: "a descending fire column at the point", draft: "jb2a.sacred_flame.target.yellow", candidate: "jaamod.misc.lava_burst" },
  "rain-of-fire": { what: "loop", direction: "a steady downward curtain", draft: "jb2a.sleet_storm.01.blue", candidate: "jaamod.spells_effects.incendiary_cloud" },
  "fire-ward": { what: "loop", direction: "a close protective sheath of flame", draft: "jb2a.shield_themed.below.fire.01.orange", candidate: "jaamod.condition.fire_shield" },
  "fel-armor": { what: "loop", direction: "a close skin of green flame", draft: "jb2a.shield_themed.below.fire.01.orange", candidate: "jaamod.condition.fire_shield", filter: "FEL_O" },
  frostbolt: { what: "cue", direction: "the cold spreads from where it lands", draft: "jb2a.impact_themed.ice_shard.blue", candidate: "jaamod.misc.ice_burst" },
  "ice-lance": { what: "cue", direction: "the cold spreads from where it lands", draft: "jb2a.impact_themed.ice_shard.blue", candidate: "jaamod.misc.ice_burst" },
  "cone-of-cold": { what: "cue", direction: "a wedge of cold along the cone", draft: "jb2a.cone_of_cold.blue", candidate: "jaamod.breath_weapon.dragon_born_silver_white_cold15_cone" },
  "frost-nova": { what: "cue", direction: "ice spreading across the floor", draft: "jb2a.impact.ground_crack.frost.01.white", candidate: "jaamod.misc.freezing_blast" },
  blizzard: { what: "loop", direction: "falling ice over the area", draft: "jb2a.sleet_storm.01.blue", candidate: "jaamod.spells_effects.sleet_storm" },
  moonfire: { what: "cue", direction: "a narrow blue-white column", draft: "jb2a.moonbeam.01.intro.blue", candidate: "jaamod.spells_effects.moonbeam" },
  "mana-shield": { what: "loop", direction: "a translucent shell", draft: "jb2a.shield.01.loop.blue", candidate: "jaamod.condition.magic_shield", filter: "PURPLE_B" },
  "power-word-shield": { what: "loop", direction: "a thin visible shell", draft: "jb2a.shield.01.loop.blue", candidate: "jaamod.condition.magic_shield", filter: "GOLD_B" },
  "holy-ward": { what: "loop", direction: "a thin visible shell", draft: "jb2a.shield.01.loop.blue", candidate: "jaamod.condition.magic_shield", filter: "GOLD_B" },
  "shadow-ward": { what: "loop", direction: "a close dark protective skin", draft: "jb2a.shield_themed.below.eldritch_web.01.dark_purple", candidate: "jaamod.condition.magic_shield", filter: "SHADOW_B" },
  "earth-shock": { what: "cue", direction: "a small ground jolt at the feet", draft: "jb2a.impact.ground_crack.01.orange", candidate: "jaamod.spells_effects.earth_tremor" },
  "gust-of-wind": { what: "cue", direction: "an air wedge along the cone", draft: "jb2a.breath_weapons.cold.cone.blue", candidate: "jaamod.spells_effects.gustof_wind" },
  "lightning-shield": { what: "loop", direction: "three charges at shoulder height", draft: "jb2a.lightning_ball.blue", candidate: "jaamod.misc.lightning_ball" },
  "natures-grasp": { what: "cue", direction: "roots gathering beneath the caster", draft: "jb2a.vine.complete.nature.single.01.green", candidate: "jaamod.spells_effects.vines4" },
  "faerie-fire": { what: "loop", direction: "cold clinging light, no flames", draft: "jb2a.markers.light.nopulse.blue", candidate: "jaamod.spells_effects.faerie_fire_violet" },
  wrath: { what: "cue", direction: "a slower, heavier green-gold projectile", draft: "jb2a.swirling_leaves.ranged.greenorange", candidate: "jaamod.sequencer_fx_master.projectile.green", also: "jaamod.sequencer_fx_master.vector_boom.green" },
  "water-walking": { what: "cue", direction: "a small ripple at the feet", draft: "jb2a.water_splash.circle.01.blue", candidate: "jaamod.misc.water_splash3" },
  "conjure-water": { what: "cue", direction: "water gathering near the caster", draft: "jb2a.cast_generic.water.02.blue", candidate: "jaamod.misc.fountain_spray" },
  "shadow-bolt": { what: "cue", direction: "a dark purple-black orb", draft: "jb2a.overcharged_sphere.01.01.dark_purple", candidate: "jaamod.sequencer_fx_master.projectile.purple", also: "jaamod.sequencer_fx_master.vector_boom.purple" },
  "carrion-swarm": { what: "cue", direction: "small dark creatures sweeping forward", draft: "jb2a.bats.loop.01.red", candidate: "jaamod.misc.bat_swarm" },
  "drain-life": { what: "loop", direction: "a narrow channel", draft: "jb2a.energy_strands.range.standard.purple.01", candidate: "jaamod.sequencer_fx_master.green_ray", filter: "PURPLE_G" },
  "drain-soul": { what: "loop", direction: "a narrow channel", draft: "jb2a.energy_strands.range.standard.purple.03", candidate: "jaamod.sequencer_fx_master.green_ray" },
  "health-funnel": { what: "loop", direction: "a narrow channel, caster to recipient", draft: "jb2a.energy_strands.range.standard.purple.04", candidate: "jaamod.sequencer_fx_master.green_ray" },
  fade: { what: "cue", direction: "a brief cast cue; the priest stays visible", draft: "jb2a.smoke.puff.ring.01.white", candidate: "jaamod.smoke.color.purple" },
  "fel-bolt": { what: "cue", direction: "a green fel projectile", draft: "jb2a.ranged.04.projectile.01.green", candidate: "jaamod.sequencer_fx_master.projectile.green", also: "jaamod.sequencer_fx_master.vector_boom.green" },
  "doom-bolt": { what: "cue", direction: "a green fel projectile that gathers longer", draft: "jb2a.energy_strands.in.green.01", candidate: "jaamod.assets.pentagram_spin", filter: "FEL_O" },
  hellfire: { what: "loop", direction: "fel fire over the ground around the caster", draft: "jb2a.ground_cracks.01.orange", candidate: "jaamod.fire.fire_flat", filter: "FEL_O" },
  "rain-of-chaos": { what: "cue", direction: "uneven descending pieces of fel fire", draft: "jb2a.impact.fire.01.orange", candidate: "jaamod.spells_effects.meteor_swarm", filter: "FEL_O" },
  banish: { what: "cue", direction: "a brief fel cast cue", draft: "jb2a.cast_generic.fire.01.orange", candidate: "jaamod.assets.pentagram_spin", filter: "FEL_O" },
  "enslave-demon": { what: "cue", direction: "a brief fel cast cue", draft: "jb2a.cast_generic.fire.01.orange", candidate: "jaamod.assets.pentagram_spin", filter: "FEL_O" },
  felstep: { what: "cue", direction: "a brief Nether shimmer at the feet", draft: "jb2a.shimmer.01.blue", candidate: "jaamod.smoke.top_down.green" },
  "demonic-sight": { what: "cue", direction: "a small eye-focused fel cue", draft: "jb2a.eyes.01.dark_green.single", candidate: "jaamod.misc.eyes_blink.green" },
  smite: { what: "cue", direction: "descending golden light", draft: "jb2a.sacred_flame.target.yellow", candidate: "jaamod.spells_effects.sunbeam" },
  "holy-fire": { what: "cue", direction: "descending golden light", draft: "jb2a.sacred_flame.target.yellow", candidate: "jaamod.spells_effects.sunbeam" },
  "hammer-of-justice": { what: "cue", direction: "descending golden light", draft: "jb2a.divine_smite.target.blueyellow", candidate: "jaamod.spells_effects.sunbeam" },
  "holy-nova": { what: "cue", direction: "a golden pulse", draft: "jb2a.template_circle.out_pulse.01.burst.bluewhite", candidate: "jaamod.spells_effects.sunburst" },
  "turn-undead": { what: "cue", direction: "light raised at the caster", draft: "jb2a.divine_smite.caster.blueyellow", candidate: "jaamod.spells_effects.sunburst" },
  consecration: { what: "loop", direction: "golden light on the patch of ground", draft: "jb2a.ward.rune.yellow.01", candidate: "jaamod.spells_effects.dawn" },
  "devotion-aura": { what: "loop", direction: "a restrained golden ground aura", draft: "jb2a.template_circle.aura.01.loop.large.bluepurple", candidate: "jaamod.spells_effects.auraof_vitality" },
  // The three that would ADD a loop rather than replace an asset.
  "hex:resisted": { what: "loop", binding: "sustain-resisted", spell: "hex", direction: "the lasting appearance follows a failed resistance", draft: null, candidate: "jaamod.condition.hexed" },
  "enslave-demon:resisted": { what: "loop", binding: "sustain-resisted", spell: "enslave-demon", direction: "control waits for a failed resistance", draft: null, candidate: "jaamod.condition.charmed", filter: "FEL_O" },
  "banish:resisted": { what: "loop", binding: "sustain-resisted", spell: "banish", direction: "disappearance waits for a failed resistance", draft: null, candidate: "jaamod.misc.hell_portal" },
  // Strikes.
  "strike:net": { what: "strike", direction: "the net landing on a hit", draft: "jb2a.web.01", candidate: "jaamod.traps.trap_net" },
  "strike:bullet": { what: "strike", direction: "the muzzle", draft: "jb2a.muzzle_flash.single.01.yellow", candidate: "jaamod.misc.gun_muzzle_flash" },
  "strike:cannon": { what: "strike", direction: "the muzzle", draft: "jb2a.muzzle_flash.single.01.yellow", candidate: "jaamod.fire.canonfire" },
  // **THE LEGACY BRANCHES' ROWS** (phase B7), keyed `feature:<key>` - the feature table's
  // own key - so a pair is found without matching prose; the draft is what ships.
  "feature:wind-walk": { what: "loop", direction: "a refraction for as long as the blademaster stays hidden", draft: "jb2a.condition.boon.02.001.refraction", candidate: "jaamod.condition.invisible" },
  "feature:bladestorm": { what: "loop", direction: "a whirl of steel standing about the blademaster", draft: "jb2a.template_circle.whirl.loop.blue", candidate: "jaamod.spells_effects.blade_barrier", filter: "DESATURATE" },
  "feature:thunder-clap": { what: "cue", direction: "a burst of thunder from the dwarf's feet", draft: "jb2a.thunderwave.center.blue", candidate: "jaamod.spells_effects.thunder_wave" },
  "feature:the-mountain-wakes": { what: "cue", direction: "the ground cracking under the dwarf as the mountain wakes", draft: "jb2a.impact.ground_crack.orange.02", candidate: "jaamod.spells_effects.earth_tremor", filter: "EARTH" },
  "feature:storm-bolt": { what: "strike", direction: "a crack of lightning where the hammer lands", draft: "jb2a.static_electricity.01.blue", candidate: "jaamod.sequencer_fx_master.lightning_blue" },
  "feature:dark-minion": { what: "cue", direction: "the fallen rising as a skeleton", draft: "jb2a.toll_the_dead.green.skull_smoke", candidate: "jaamod.misc.emerging_arms" },
  "feature:banshees-wail": { what: "cue", direction: "a wave of the banshee's wail from the ranger", draft: "jb2a.toll_the_dead.green.shockwave", candidate: "jaamod.spells_effects.fear" },
  "feature:life-drain": { what: "cue", direction: "a channel drawn from the creature to the ranger", draft: "jb2a.energy_strands.range.standard.purple.01", candidate: "jaamod.sequencer_fx_master.green_ray", filter: "PURPLE_G" },
  "feature:thrall-of-the-banshee": { what: "loop", direction: "the thrall's binding, standing on it for as long as it is bound", draft: "jb2a.markers.chain.spectral_standard.loop.02.blue", candidate: "jaamod.condition.charmed" },
  "feature:shadow-trap": { what: "loop", direction: "the trap standing on the ground", draft: "jb2a.template_circle.symbol.normal.runes.orange", candidate: "jaamod.traps.bear_trap" },
  "feature:fan-of-knives": { what: "cue", direction: "a cloud of knives about the warden", draft: "jb2a.cloud_of_daggers.daggers.purple", candidate: "jaamod.spells_effects.cloudof_daggers_s" },
  "feature:the-vault-opens": { what: "loop", direction: "spectral chains on each creature held", draft: "jb2a.markers.chain.spectral_standard.loop.02.blue", candidate: "jaamod.spells_effects.chain1" },
  "feature:shackle": { what: "loop", direction: "iron chains on the creature the Finisher holds", draft: "jb2a.markers.chain.standard.loop.02.red", candidate: "jaamod.spells_effects.chain2", filter: "DESATURATE" },
  "feature:wardens-cage": { what: "loop", direction: "a cage of shadow about the creature Stunned", draft: "jb2a.bubble.001.001.loop.blue", candidate: "jaamod.condition.stunned" },
  "feature:alarm-o-bot": { what: "cue", direction: "the alarm set over its area", draft: "jb2a.detect_magic.circle.blue", candidate: "jaamod.spells_effects.alarm" },
  "feature:gnomish-cloaking-device": { what: "loop", direction: "a refraction on each creature hidden", draft: "jb2a.condition.boon.02.001.refraction", candidate: "jaamod.condition.invisible" },
  "feature:net-o-matic-projector": { what: "strike", direction: "the net landing on a hit", draft: "jb2a.web.01", candidate: "jaamod.traps.trap_net" },
  "feature:arclight-spanner": { what: "cue", direction: "sparks of repair on the construct", draft: "jb2a.static_electricity.03.blue", candidate: "jaamod.misc.welder_sparks" },
  "feature:pocket-factory": { what: "cue", direction: "smoke where each clockwork gnome assembles", draft: "jb2a.smoke.puff.centered.grey", candidate: "jaamod.misc.dust_poof" },
  "feature:ultrasafe-transporter": { what: "cue", direction: "a teleport onto the pad", draft: "jb2a.teleport.01.blue", candidate: "jaamod.sci_fi.teleporter" },
  "feature:serpent-ward": { what: "loop", direction: "a poison mark on the creature the totem's venom struck", draft: "jb2a.markers.poison.dark_green.01", candidate: "jaamod.condition.poisoned" },
  "feature:evil-eye": { what: "cue", direction: "a crowd of eyes about the troll", draft: "jb2a.eyes.01.dark_green.many", candidate: "jaamod.misc.eyes_blink.green" },
  "feature:bad-mojo": { what: "loop", direction: "the voodoo curse on the creature Stunned", draft: "jb2a.markers.on_token_mask.loop.01.orange", candidate: "jaamod.condition.cursed" },
  "feature:big-bad-voodoo": { what: "loop", direction: "a ring standing about the troll while it is Sustained", draft: "jb2a.template_circle.aura.01.loop.large.bluepurple", candidate: "jaamod.spells_effects.auraof_life", filter: "GREENGOLD" },
  "feature:the-crossing": { what: "loop", direction: "a ring of spirits about the body left standing", draft: "jb2a.spirit_guardians.blueyellow.ring", candidate: "jaamod.spells_effects.spirit_guardians_trans50" },
  "feature:burial-ground": { what: "loop", direction: "a ring of spirits over the ground blessed", draft: "jb2a.spirit_guardians.blueyellow.ring", candidate: "jaamod.spells_effects.spirit_guardians" },
  "feature:ability:self-destruct": { what: "cue", direction: "the clockwork gnome bursting", draft: "jb2a.explosion.01.orange", candidate: "jaamod.misc.fire_boom" }
});

/* ------------------------------------------------------------------ */
/*  Reading the table                                                  */
/* ------------------------------------------------------------------ */

/** Every step inside one strike recipe, cues and sounds alike. */
function strikeSteps(row) {
  const out = [];
  const take = step => {
    if (!step) return;
    out.push(step);
    if (step.sound) out.push(step.sound);
    if (step.miss) take(step.miss);
  };
  take(row.swing);
  for (const step of row.launch ?? []) take(step);
  take(row.impact);
  take(row.ret);
  return out;
}

/**
 * Every step a spell row or a feature row can play, over every cue and every loop
 * layer - and a feature row's strike override, whose steps play on an attack card.
 */
function spellSteps(row) {
  if (!row || row.reason) return [];
  const out = [];
  for (const c of row.cues ?? []) out.push(...c.steps);
  for (const lp of loopsOf(row)) for (const layer of lp.layers ?? []) out.push(layer);
  if (row.strike?.swing) out.push(...strikeSteps(row.strike));
  return out;
}

/**
 * Every loop a row carries: a spell's `loop`, or a feature row's `loops` (one a binding;
 * 04's Shadow Trap stands one on the trap and one on what it caught). The law reads the
 * same through `rules/animation.mjs#rowLoops`.
 */
export function loopsOf(row) {
  if (!row || row.reason) return [];
  if (Array.isArray(row.loops)) return row.loops.filter(Boolean);
  return row.loop ? [row.loop] : [];
}

/**
 * EVERY ASSET THE TABLE CAN PLAY, sorted and distinct.
 *
 * `animation-table.test.mjs` holds every one of these against the committed
 * snapshot - present in `entries`, absent from `refused` - so a branch key, a
 * mis-cased path or a registered key with no file fails in Node rather than
 * playing nothing at the table. A Quench test asks the live database the same
 * question (Phase 5).
 *
 * Chain Lightning's `secondary` is an asset too, and is counted here.
 */
export function allAssetKeys() {
  const keys = new Set();
  for (const row of Object.values(STRIKE_ANIMATIONS)) {
    for (const step of strikeSteps(row)) {
      if (step.asset) keys.add(step.asset);
      if (step.secondary) keys.add(step.secondary);
    }
  }
  // The tier 1 spells, the taught ones above tier 1, and the features (door 2).
  for (const row of [...Object.values(SPELL_ANIMATIONS), ...Object.values(TAUGHT_SPELL_ANIMATIONS), ...Object.values(FEATURE_ANIMATIONS)]) {
    for (const step of spellSteps(row)) {
      if (step.asset) keys.add(step.asset);
      if (step.secondary) keys.add(step.secondary);
    }
  }
  return [...keys].sort();
}

/**
 * The Jinker's candidates, as keys. Separate from `allAssetKeys` on purpose:
 * nothing here plays until the lead picks it, and a reader asking what CAN
 * play should not be handed a list of what might.
 */
export function comparisonAssetKeys() {
  const keys = new Set();
  for (const row of Object.values(COMPARISONS)) {
    if (row.candidate) keys.add(row.candidate);
    if (row.also) keys.add(row.also);
  }
  return [...keys].sort();
}

/**
 * THE IDENTIFIERS WHOSE ROW LOOPS ON ONE BINDING.
 *
 * Written for `sustain-resisted`, which is the one binding whose state costs
 * something to gather: a Resilience Test record lives on a chat card, so
 * `module/animation/records.mjs` would have to walk the whole of chat on every
 * reconcile to find one. **No shipped row takes that binding** (D-727: the
 * three Appendix C candidates are the lead's to pick), so the answer is an
 * empty list and the walk never happens - and the day the lead picks one, the
 * list is no longer empty and nothing else has to change.
 *
 * @param {string} binding
 * @param {object} [table]  injected, as `plan`'s and `loopsFor`'s are
 * @returns {string[]}  sorted, so two readers agree
 */
export function loopIdentifiers(binding, table = SPELL_ANIMATIONS) {
  return Object.entries(table)
    .filter(([, row]) => loopsOf(row).some(lp => lp.binding === binding))
    .map(([identifier]) => identifier)
    .sort();
}

/** Every step of a row, for a test or a reader. Strikes, spells and features alike. */
export function stepsOf(row) {
  if (!row) return [];
  return row.swing ? strikeSteps(row) : spellSteps(row);
}

/**
 * The feature table's strike recipe builder, for a row whose attack card plays an
 * override (the file comment): `{swing, launch, impact, ret, standIn}`, the shape
 * `STRIKE_ANIMATIONS` takes, frozen the same way.
 */
export function strikeRecipe(parts) {
  return strike(parts);
}
