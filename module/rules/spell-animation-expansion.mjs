/**
 * Tier 2-5 spell cue choices from 07-MAGIC. These are spell-specific choices,
 * not a school fallback: the catalogue below names the visual family and anchor
 * for every spell. Only recorded targets and placed Regions are used.
 *
 * Utility magic with no recorded object/location gets a restrained caster cue;
 * it does not invent an object, remote viewpoint, message recipient or terrain.
 * Mental restraints play at resist, after the failed Resilience Test. Damage
 * cues never imply that an additional, unrecorded jump target was chosen.
 *
 * These cues are finite. They do not pretend that a one-shot animation is a
 * persistent object or a second source of game state. Existing reconciliation
 * handles the sustained area loops included here.
 */

const fx = (asset, options = {}) => Object.freeze({kind: "effect", asset, ...options});
const snd = (asset, options = {}) => Object.freeze({kind: "sound", asset, volume: 0.6, ...options});
const cue = (trigger, steps) => Object.freeze({trigger, steps: Object.freeze(steps)});

const THEMES = Object.freeze({
  frost: {cast: "jb2a.cast_generic.water.02.blue", impact: "jb2a.impact_themed.ice_shard.blue", shield: "jb2a.shield_themed.above.ice.01.blue", sound: "psfx.impacts.magicaleffects.cold"},
  fire: {cast: "jb2a.cast_generic.fire.01.orange", impact: "jb2a.impact.fire.01.orange", shield: "jb2a.shield_themed.above.fire.01.orange", sound: "psfx.impacts.magicaleffects.fire"},
  holy: {cast: "jb2a.cast_generic.01.yellow", impact: "jb2a.sacred_flame.target.yellow", shield: "jb2a.shield.01.intro.blue", filter: "GOLD_B", sound: "psfx.1st-level-spells.bless.v1.001"},
  arcane: {cast: "jb2a.cast_generic.02.blue", impact: "jb2a.explosion.02.blue", shield: "jb2a.shield.01.intro.blue", filter: "PURPLE_B", sound: "psfx.impacts.magicaleffects.generic.002.001"},
  nature: {cast: "jb2a.cast_generic.earth.01.browngreen", impact: "jb2a.impact.ground_crack.orange.02", shield: "jb2a.markers.shield.green.01", sound: "psfx.casting.water.001"},
  fel: {cast: "jb2a.cast_generic.fire.01.orange", impact: "jb2a.impact.fire.01.orange", shield: "jb2a.shield.01.intro.blue", filter: "FEL_O", sound: "psfx.impacts.magicaleffects.necrotic"},
  shadow: {cast: "jb2a.cast_generic.02.blue", impact: "jb2a.energy_strands.complete.blue.01", shield: "jb2a.shield.01.intro.blue", filter: "SHADOW_B", sound: "psfx.1st-level-spells.dissonant-whispers.v1.001"},
  // The Chronomancer's sand (07 §12, D-864): Arcane spells in sand-gold (`FILTERS.SAND`).
  sand: {cast: "jb2a.cast_generic.02.blue", impact: "jb2a.impact.ground_crack.orange.02", shield: "jb2a.shield.01.intro.blue", filter: "SAND", sound: "psfx.cantrips.gust.v1"}
});

/** Shape choices are independent of school: lightning, roots and healing do
 * not inherit the earth crack merely because they are Nature spells. */
const SHAPES = Object.freeze({
  cast: {},
  impact: {},
  burst: {asset: "jb2a.template_circle.out_pulse.01.burst.bluewhite"},
  shield: {sound: "psfx.1st-level-spells.shield-spell.intro.v1.003"},
  heal: {asset: "jb2a.healing_generic.400px.green", sound: "psfx.conditions.boon.002.01"},
  lightheal: {asset: "jb2a.healing_generic.400px.yellow", sound: "psfx.1st-level-spells.bless.v1.002"},
  moon: {asset: "jb2a.moonbeam.01.intro.blue", filter: "STAR", sound: "psfx.impacts.magicaleffects.generic.002.001"},
  ice: {asset: "jb2a.ice_spikes.radial.burst.white", sound: "psfx.impacts.magicaleffects.cold"},
  snow: {asset: "jb2a.sleet_storm.01.blue", sound: "psfx.cantrips.gust.v1"},
  ash: {asset: "jb2a.sleet_storm.01.blue", filter: "DARKEN", sound: "psfx.casting.fire-side.001"},
  insects: {asset: "jb2a.fireflies.many.01.green", filter: "DARKEN", sound: "psfx.cantrips.gust.v1"},
  fire: {asset: "jb2a.explosion.01.orange", sound: "psfx.impacts.magicaleffects.fire"},
  flame: {asset: "jb2a.flames.02.orange", sound: "psfx.casting.fire.001"},
  earth: {asset: "jb2a.impact.ground_crack.orange.02", filter: "EARTH", sound: "psfx.impacts.bludgeoning.v1"},
  roots: {asset: "jb2a.entangle.02.complete.02.green", sound: "psfx.casting.water.001"},
  water: {asset: "jb2a.template_square.raindrops.001.5x5.instant.combined.blue", sound: "psfx.casting.water.001"},
  wind: {asset: "jb2a.template_circle.vortex.intro.blue", filter: "AIR", sound: "psfx.cantrips.gust.v1"},
  lightning: {asset: "jb2a.lightning_strike.blue", sound: "psfx.impacts.magicaleffects.lightning"},
  portal: {asset: "jb2a.portals.vertical.ring.bright_yellow", sound: "psfx.ranged-magic.generic.energy-strands.001"},
  step: {asset: "jb2a.misty_step.01.blue", sound: "psfx.cantrips.gust.v1"},
  detect: {asset: "jb2a.detect_magic.circle.blue", sound: "psfx.impacts.magicaleffects.generic.002.001"},
  mental: {asset: "jb2a.cast_generic.02.blue", filter: "PSYCHIC", sound: "psfx.1st-level-spells.dissonant-whispers.v1.001"},
  darkness: {asset: "jb2a.darkness.black", sound: "psfx.impacts.magicaleffects.necrotic"},
  vortex: {asset: "jb2a.template_circle.vortex.intro.blue", sound: "psfx.ranged-magic.generic.energy-strands.001"},
  spirit: {asset: "jb2a.spirit_guardians.blueyellow.ring", sound: "psfx.conditions.boon.002.01"},
  cone: {asset: "jb2a.cone_of_cold.blue", sound: "psfx.5th-level-spells.cone-of-cold.v1.001"},
  wall: {asset: "jb2a.wall_of_fire.300x100.yellow", sound: "psfx.casting.fire.001"},
  stormwall: {asset: "jb2a.lightning_bolt.wide.blue", sound: "psfx.impacts.magicaleffects.lightning"}
});

/** A finite cue, with an optional loop only where the game records its binding.
 * `area` uses the Region/card diameter. Remote and mile-wide magic deliberately
 * uses a small source cue rather than painting an invented scene-sized area. */
function spell(school, shape, place = "target", trigger = "cast", scale = 1, binding = null) {
  const theme = THEMES[school];
  const look = SHAPES[shape];
  const asset = look.asset ?? (shape === "cast" ? theme.cast : shape === "shield" ? theme.shield : theme.impact);
  let filter = look.filter ?? theme.filter;
  // The named filters are tied to the original asset's hue, not its school.
  if (["heal", "lightheal", "roots", "water", "lightning", "ice", "snow", "earth", "wind", "spirit", "darkness", "stormwall"].includes(shape)) filter = look.filter;
  if (school === "fire" && shape === "burst") filter = "FIRE_B";
  if (school === "fel" && ["shield", "burst", "vortex", "step"].includes(shape)) filter = "FEL_B";
  if (shape === "portal") filter = school === "fel" ? "FEL_O" : school === "arcane" ? "STAR_Y" : null;
  if (school === "frost" && shape === "shield") filter = null;
  if (school === "holy" && !["shield", "burst", "detect", "step"].includes(shape)) filter = look.filter;
  const region = place.startsWith("region");
  const visual = fx(asset, {
    place,
    ...(region || scale === "area" ? {area: 1} : {scale}),
    ...(filter ? {filter} : {}),
    ...(place === "region-line" ? {travel: "span"} : place === "region-cone" ? {travel: "stretch"} : {}),
    ...(shape === "darkness" || shape === "snow" ? {opacity: 0.45} : {}),
    hold: 1200, fadeOut: 400
  });
  const row = {cues: [cue(trigger, [visual, snd(look.sound ?? theme.sound)])]};
  const standIns = {
    ash: "A dim desaturated sleet curtain stands in for drifting ash; visual tuning awaits rendered review.",
    insects: "Small darkened fireflies stand in for the biting insect swarm; no locust asset is installed.",
    roots: "The installed entangle vines stand in for both rising roots and thorn growth.",
    portal: "The installed yellow doorway ring is recoloured for the spell's school; its hue awaits rendered review."
  };
  if (standIns[shape]) row.standIn = standIns[shape];
  const loopAsset = {
    shield: "jb2a.shield.01.loop.blue",
    roots: "jb2a.entangle.02.loop.02.green",
    wind: "jb2a.template_circle.vortex.loop.blue",
    vortex: "jb2a.template_circle.vortex.loop.blue",
    fire: "jb2a.flames.04.loop.orange",
    flame: "jb2a.flames.04.loop.orange",
    moon: "jb2a.moonbeam.01.loop.blue",
    lightning: "jb2a.template_circle.lightning.01.loop.bluepurple",
    burst: "jb2a.template_circle.aura.01.loop.large.bluepurple"
  }[shape] ?? asset;
  if (binding) row.loop = Object.freeze({binding, layers: Object.freeze([
    fx(loopAsset, {place: binding.endsWith("region") ? "region" : "holder", ...(region ? {area: 1, mask: true} : {scale: 1.35}), ...(filter ? {filter} : {}), opacity: 0.35})
  ])});
  return Object.freeze(row);
}

/** A travelling bolt or beam, followed by its impact. The card supplies the
 * recipient; splash and chained recipients are never invented from proximity. */
function projectile(school, asset, {filter = null, scale = 1, count = 1, sound = null} = {}) {
  const theme = THEMES[school];
  return Object.freeze({cues: [cue("cast", [
    fx(asset, {place: count > 1 ? "missiles" : "source>target", travel: "stretch", scale, ...(filter ? {filter} : {}), ...(count > 1 ? {count, stagger: 180} : {})}),
    snd(sound ?? theme.sound),
    fx(theme.impact, {place: "target", scale: Math.min(1.5, scale), ...(theme.filter ? {filter: theme.filter} : {}), waitFor: "travel", overlap: -150}),
    snd(theme.sound, {waitFor: "travel", overlap: -150, volume: 0.45})
  ])]});
}

/** Recipient groups enumerate every recorded token. An empty target list uses
 * the Apply effect's recipient. Self-and-allies rows explicitly include the
 * caster at cast, deduplicated by the planner when also selected as a target. */
function group(school, shape, includeSource = false) {
  const row = spell(school, shape, "targets", "cast|effect");
  if (!includeSource) return row;
  return Object.freeze({...row, cues: Object.freeze(row.cues.map(c => cue(c.trigger,
    c.steps.map(s => s.kind === "effect" ? Object.freeze({...s, includeSource: true}) : s)
  )))});
}

// CATALOGUE
export const EXPANDED_SPELL_ANIMATIONS = Object.freeze({
  // frost
  "absolute-zero": spell("frost", "ice", "region", "region", 1),
  "chilblain": spell("frost", "ice", "target", "cast", 1),
  "cold-cipher": spell("frost", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "cold-front": spell("frost", "snow", "source", "cast", 1),
  "cold-trail": spell("frost", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "coldforge": spell("frost", "ice", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "coldsleep": group("frost", "shield"),
  "deep-winter": spell("frost", "snow", "region", "region", 1, "sustain-region"),
  "deepwinter": spell("frost", "snow", "source", "cast", "area"),
  "entombment": spell("frost", "shield", "resisted", "resist", 1),
  "frostbind": spell("frost", "ice", "target", "cast", 1),
  "frostshroud": group("frost", "shield"),
  "frostwake": spell("frost", "ice", "target", "cast", 1),
  "frozen-ground": spell("frost", "ice", "region", "region", 1),
  "frozen-rune": Object.freeze({...spell("frost", "cast", "source", "cast", 0.45),
    standIn: "A small caster announcement only: the ground point is unrecorded and the rune is invisible to creatures not told about it; no trap or victim is revealed."}),
  "glacial-spike": projectile("frost", "jb2a.spell_projectile.ice_shard.blue", {scale: 1.6, sound: "psfx.cantrips.ray-of-frost.v1"}),
  "glaciate": spell("frost", "ice", "target", "cast", 1),
  "glacier": spell("frost", "ice", "region", "region", 1),
  "hailstorm": spell("frost", "snow", "region", "region", 1, "sustain-region"),
  "hoarfrost": spell("frost", "snow", "region", "region", 1, "sustain-region"),
  "ice-barrage": spell("frost", "cone", "region-cone", "region", 1),
  "ice-barrier": spell("frost", "shield", "source", "cast", 1),
  "ice-block": spell("frost", "shield", "source", "cast", 1),
  "icefall": spell("frost", "snow", "region", "region", 1),
  "icehold": spell("frost", "ice", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "icelock": spell("frost", "ice", "region", "region", 1),
  "icespan": spell("frost", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "killing-frost": spell("frost", "ice", "target", "cast", 1),
  "killing-winter": spell("frost", "ice", "target", "cast", 1),
  "preservation": spell("frost", "shield", "target", "cast|effect", 1),
  "rimebind": spell("frost", "ice", "region", "region", 1),
  "rimeblood": spell("frost", "cast", "source", "cast", 1),
  "rimeburst": spell("frost", "ice", "region", "region", 1),
  "rimeguard": group("frost", "shield"),
  "rimeshard": projectile("frost", "jb2a.spell_projectile.ice_shard.blue", {sound: "psfx.cantrips.ray-of-frost.v1"}),
  "splinter": spell("frost", "ice", "target", "cast", 1),
  "stillfrost": spell("frost", "shield", "target", "cast|effect", 1),
  "the-long-winter": spell("frost", "snow", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "whiteout": spell("frost", "snow", "region", "region", 1),
  "winterborn": spell("frost", "cast", "source", "cast", 1),
  "winterheart": spell("frost", "shield", "source", "cast", 1),
  "winters-grip": spell("frost", "snow", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "winterskin": spell("frost", "shield", "source", "cast", 1),
  // holy
  "absolution": spell("holy", "lightheal", "target", "cast|effect", 1),
  "aegis-of-the-light": group("holy", "shield"),
  "afterlight": spell("holy", "lightheal", "target", "cast|effect", 1),
  "anathema": spell("holy", "mental", "resisted", "resist", 1),
  "aura-of-courage": group("holy", "spirit"),
  "barrier": spell("holy", "shield", "region", "region", 1, "sustain-region"),
  "beacon-of-light": spell("holy", "cast", "target", "cast|effect", 1),
  "blessing-of-kings": group("holy", "cast"),
  "blessing-of-might": group("holy", "cast"),
  "condemnation": spell("holy", "impact", "region", "region", 1),
  "deliverance": spell("holy", "lightheal", "region", "region", 1),
  "divine-shield": spell("holy", "shield", "source", "cast", 1),
  "exorcism": spell("holy", "impact", "target", "cast", 1),
  "hallowed-ground": spell("holy", "burst", "region", "region", 1, "sustain-region"),
  "halo": spell("holy", "burst", "source", "cast", "area"),
  "haven": spell("holy", "shield", "source", "cast", "area"),
  "holy-brand": spell("holy", "impact", "target", "cast", 1),
  "holy-wrath": spell("holy", "impact", "source", "cast", "area"),
  "hymn": group("holy", "spirit"),
  "intercession": spell("holy", "shield", "target", "cast|effect", 1),
  "light-unending": group("holy", "shield", true),
  "lightbrand": spell("holy", "impact", "target", "cast|effect", 1),
  "lights-reach": spell("holy", "lightheal", "target", "cast|effect", 1),
  "litany": group("holy", "spirit"),
  // O-225 (the lead: *"Just the animation should fire in the targetted area."*): at the Region its
  // card places, sized to its 20 ft radius. Its effect stays the table's (D2 §12).
  "mass-dispel": spell("holy", "burst", "region", "region", 1),
  "pain-suppression": spell("holy", "shield", "target", "cast|effect", 1),
  "power-word-fortitude": group("holy", "cast"),
  "prayer-of-healing": group("holy", "lightheal"),
  "prayer-of-the-road": group("holy", "cast"),
  "rebuke": spell("holy", "impact", "target", "cast", 1),
  "repentance": spell("holy", "mental", "resisted", "resist", 1),
  "return": spell("holy", "lightheal", "target", "cast|effect", 1),
  "revelation": group("holy", "detect"),
  "revival": spell("holy", "lightheal", "target", "cast|effect", 1),
  "salvation": spell("holy", "lightheal", "target", "cast|effect", 1),
  "sanctification": spell("holy", "burst", "region", "region", 1),
  "sanctuary": spell("holy", "shield", "region", "region", 1, "sustain-region"),
  "spirit-of-redemption": spell("holy", "spirit", "source", "cast", 1),
  "stay-the-hand": spell("holy", "shield", "target", "cast|effect", 1),
  "the-fifth-light": spell("holy", "impact", "region", "region", 1),
  "the-last-word": spell("holy", "impact", "target", "cast", 1),
  "verdict": spell("holy", "impact", "target", "cast", 1),
  "vigil": group("holy", "detect"),
  // the Chronomancer's sand spells, tiers 2 to 5 (07 §12, D-864): every one its own cue,
  // a loop where the game holds the state (a held area, a held shell, a laid effect).
  "sandstorm": spell("sand", "snow", "region", "region", 1, "sustain-region"),
  "withering-sands": spell("sand", "ash", "region", "region", 1, "sustain-region"),
  "dilation": spell("sand", "shield", "target", "cast|effect", 1.2),
  "reversion": spell("sand", "lightheal", "target", "cast|effect", 1.2),
  "time-trap": spell("sand", "burst", "region", "region", 1),
  "accelerate": spell("sand", "wind", "target", "cast|effect", 1.1, "sustain-target"),
  "drag-of-ages": spell("sand", "ash", "region", "region", 1),
  "sandwall": spell("sand", "snow", "region-line", "region", 1, "sustain-region"),
  "hourstrike": spell("sand", "cast", "source", "cast", 1.1),
  "hour-of-dust": projectile("sand", "jb2a.magic_missile.purple", {filter: "SAND", scale: 1.2}),
  "shifting-hours": spell("sand", "wind", "region", "region", 1, "sustain-region"),
  "sand-prison": spell("sand", "snow", "target", "resist", 1.2, "sustain-target"),
  "sands-run-back": group("sand", "lightheal"),
  "dune-collapse": spell("sand", "impact", "region", "region", 1),
  "never-was": spell("sand", "cast", "target", "cast", 1.2),
  "temporal-sanctuary": spell("sand", "burst", "source", "cast", "area", "sustain-self"),
  "scouring-veil": spell("sand", "shield", "source", "cast", 1.3),
  "epoch": projectile("sand", "jb2a.magic_missile.purple", {filter: "SAND", scale: 1.5}),
  "hour-of-haste": group("sand", "wind"),
  "timeslip": group("sand", "cast"),
  "deserts-weight": spell("sand", "ash", "region", "region", 1),
  "pristine-timeline": group("sand", "shield"),
  "bastion-of-hours": spell("sand", "shield", "source", "cast", 1.4, "sustain-self"),
  "divert-timeway": group("sand", "burst"),
  // arcane
  "aegis": group("arcane", "shield", true),
  "aftersight": spell("arcane", "detect", "source", "cast", "area"),
  "arcane-anchor": spell("arcane", "vortex", "region", "region", 1),
  "arcane-barrage": projectile("arcane", "jb2a.magic_missile.purple", {count: 3}),
  "arcane-binding": spell("arcane", "mental", "resisted", "resist", 1),
  "arcane-brilliance": group("arcane", "cast"),
  "arcane-nova": spell("arcane", "burst", "source", "cast", "area"),
  "archmage": spell("arcane", "cast", "source", "cast", 1),
  "celestial-alignment": spell("arcane", "cast", "source", "cast", 1),
  "disintegration": projectile("arcane", "jb2a.disintegrate.green", {filter: "PURPLE_G", scale: 1.5, sound: "psfx.ranged-magic.generic.energy-strands.001"}),
  "elunes-answer": group("arcane", "moon"),
  "farsight": spell("arcane", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "farstep": spell("arcane", "step", "source", "cast", 1),
  "gate": spell("arcane", "portal", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "halt": spell("arcane", "mental", "region", "region", 1),
  "invisibility": spell("arcane", "step", "target", "cast|effect", 1),
  "ley-cage": spell("arcane", "vortex", "region", "region", 1, "sustain-region"),
  "ley-collapse": spell("arcane", "vortex", "region", "region", 1),
  "ley-rift": spell("arcane", "vortex", "region", "region", 1),
  "ley-storm": spell("arcane", "vortex", "region", "region", 1),
  "ley-wound": spell("arcane", "impact", "target", "cast", 1),
  "mana-lattice": spell("arcane", "shield", "target", "cast|effect", 1),
  "mana-sear": spell("arcane", "impact", "target", "cast", 1),
  "manafount": spell("arcane", "cast", "target", "cast|effect", 1),
  "manastorm": spell("arcane", "vortex", "region", "region", 1),
  "mirror-image": spell("arcane", "cast", "source", "cast", 1),
  "moonfall": spell("arcane", "moon", "region", "region", 1),
  "moonglow": spell("arcane", "moon", "target", "cast", 1),
  "moonpath": spell("arcane", "step", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "moonwell": spell("arcane", "moon", "region", "region", 1, "sustain-region"),
  "nullify": spell("arcane", "mental", "resisted", "resist", 1),
  "portal": spell("arcane", "portal", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "prismatic-cascade": group("arcane", "shield"),
  "prismatic-shield": spell("arcane", "shield", "source", "cast", 1),
  "sanctum": spell("arcane", "portal", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "sending": spell("arcane", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "skyfall": spell("arcane", "moon", "region", "region", 1),
  "starbind": spell("arcane", "moon", "target", "cast", 1),
  "starsurge": spell("arcane", "moon", "target", "cast", 1),
  "starweave": spell("arcane", "moon", "region", "region", 1, "sustain-region"),
  "stasis": spell("arcane", "mental", "resisted", "resist", 1),
  "translocate": spell("arcane", "step", "target", "cast", 1),
  "unweave": spell("arcane", "impact", "target", "cast|effect", 1),
  // nature
  "ancestral-tide": group("nature", "heal"),
  "barkskin": spell("nature", "shield", "target", "cast|effect", 1),
  "bloom": spell("nature", "heal", "target", "cast|effect", 1),
  "commune": spell("nature", "detect", "source", "cast", "area"),
  "convocation": spell("nature", "spirit", "source", "cast", 1),
  "cure-blight": spell("nature", "heal", "target", "cast|effect", 1),
  "cyclone": spell("nature", "wind", "resisted", "resist", 1),
  "dreamsight": spell("nature", "detect", "source", "cast", 1),
  "dreamway": spell("nature", "spirit", "source", "cast", 1),
  "earthfast": spell("nature", "shield", "target", "cast|effect", 1),
  "earthguard": spell("nature", "shield", "source", "cast", 1),
  "earthskin": spell("nature", "shield", "target", "cast|effect", 1),
  "elemental-convergence": spell("nature", "lightning", "region", "region", 1),
  "entangling-vines": spell("nature", "roots", "region", "region", 1),
  "fissure": spell("nature", "earth", "region", "region", 1),
  "grove": spell("nature", "roots", "region", "region", 1),
  "healing-rain": spell("nature", "water", "region", "region", 1, "sustain-region"),
  "insect-swarm": spell("nature", "insects", "region", "region", 1),
  "landslide": spell("nature", "earth", "region", "region", 1),
  "lightning-rod": spell("nature", "lightning", "target", "cast", 1),
  "lightning-strike": spell("nature", "lightning", "target", "cast", 1),
  "natures-cure": spell("nature", "heal", "target", "cast|effect", 1),
  "rainmaking": spell("nature", "water", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "rebirth": spell("nature", "heal", "target", "cast|effect", 1),
  "restoration": spell("nature", "heal", "region", "region", 1),
  "rootbind": spell("nature", "roots", "target", "cast", 1),
  "stone-spike": spell("nature", "earth", "target", "cast", 1),
  "stormfury": spell("nature", "lightning", "target", "cast", 1),
  "stormwall": spell("nature", "stormwall", "region-line", "region", 1),
  "sundering": spell("nature", "earth", "region-line", "region", 1),
  "tempest": spell("nature", "wind", "region", "region", 1, "sustain-region"),
  "the-great-wild": spell("nature", "roots", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "thornguard": spell("nature", "roots", "region", "region", 1, "sustain-region"),
  "thorns": spell("nature", "shield", "target", "cast|effect", 1),
  "thunderhead": spell("nature", "lightning", "region", "region", 1, "sustain-region"),
  "tidecall": spell("nature", "water", "region", "region", 1, "sustain-region"),
  "tranquility": group("nature", "heal"),
  "tree-of-life": spell("nature", "spirit", "source", "cast", 1),
  "verdance": spell("nature", "heal", "target", "cast|effect", 1),
  "wellspring": group("nature", "heal"),
  "windrush": group("nature", "wind"),
  "windshear": spell("nature", "wind", "target", "cast", 1),
  "windwalk": spell("nature", "wind", "source", "cast", 1),
  // fel
  "annihilation": projectile("fel", "jb2a.disintegrate.green", {scale: 1.5, sound: "psfx.ranged-magic.generic.energy-strands.001"}),
  "blood-pact": spell("fel", "cast", "target", "cast", 1),
  "bloodboil": spell("fel", "fire", "region", "region", 1),
  "cataclysm": spell("fel", "fire", "region", "region", 1),
  "chaos-bolt": projectile("fel", "jb2a.eldritch_blast.purple", {filter: "FEL_P", scale: 1.5}),
  "chaos-lash": projectile("fel", "jb2a.energy_strands.range.standard.purple.01", {filter: "FEL_P", sound: "psfx.ranged-magic.generic.energy-strands.001"}),
  "chaosbrand": spell("fel", "fire", "target", "cast", 1),
  "compel": spell("fel", "mental", "resisted", "resist", 1),
  "contract": spell("fel", "cast", "target", "cast|effect", 1),
  "curse-of-doom": spell("fel", "cast", "target", "cast", 1),
  "curse-of-ruin": spell("fel", "mental", "resisted", "resist", 1),
  "demonheart": spell("fel", "cast", "source", "cast", 1),
  "demonhide": spell("fel", "shield", "source", "cast", 1),
  "demonic-circle": spell("fel", "vortex", "source", "cast", "area"),
  "demonic-gateway": spell("fel", "portal", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "doomfall": spell("fel", "fire", "region", "region", 1, "sustain-region"),
  "doomfire": spell("fel", "fire", "region", "region", 1),
  "eyes-of-kilrogg": spell("fel", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "fel-covenant": group("fel", "shield"),
  "fel-tether": spell("fel", "vortex", "region", "region", 1),
  "felfire-aura": spell("fel", "flame", "source", "cast", "area"),
  "felscript": spell("fel", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "hellbind": spell("fel", "mental", "resisted", "resist", 1),
  "hellquake": spell("fel", "fire", "region", "region", 1),
  "nether-collapse": spell("fel", "vortex", "region", "region", 1, "sustain-region"),
  "nether-howl": spell("fel", "mental", "region", "region", 1),
  "nether-passage": group("fel", "step", true),
  "nether-rift": spell("fel", "vortex", "region", "region", 1, "sustain-region"),
  "nether-ward": spell("fel", "shield", "target", "cast|effect", 1),
  "netherstorm": spell("fel", "fire", "region", "region", 1, "sustain-region"),
  "rend-the-veil": spell("fel", "detect", "source", "cast", 1),
  "ritual-circle": spell("fel", "vortex", "region", "region", 1, "sustain-region"),
  "ruination": spell("fel", "fire", "target", "cast", 1),
  "soul-ledger": spell("fel", "cast", "source", "cast", 1),
  "soul-reaper": spell("fel", "cast", "target", "cast", 1),
  "soulburn": spell("fel", "fire", "target", "cast", 1),
  "soulchains": spell("fel", "vortex", "target", "cast", 1),
  "soulshield": spell("fel", "shield", "source", "cast", 1),
  "soulstone": spell("fel", "cast", "target", "cast|effect", 1),
  "soulwell": spell("fel", "vortex", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "the-black-harvest": spell("fel", "mental", "resisted", "resist", 1),
  "the-long-bargain": spell("fel", "cast", "source", "cast", 1),
  "unmaking": spell("fel", "fire", "target", "cast", 1),
  // fire
  "ashfall": spell("fire", "ash", "region", "region", 1),
  "ashmantle": spell("fire", "shield", "source", "cast", 1),
  "backburn": spell("fire", "fire", "target", "cast", 1),
  "cinderburst": spell("fire", "fire", "region", "region", 1),
  "cinderfall": spell("fire", "cast", "source", "cast", 1.4), // Delayed impact: the cast does not show damage landing early.
  "cinderpact": spell("fire", "fire", "target", "cast", 1),
  "conflagration": spell("fire", "fire", "target", "cast", 1),
  "crucible": spell("fire", "flame", "region", "region", 1, "sustain-region"),
  "ember-road": spell("fire", "step", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "ember-skin": spell("fire", "shield", "source", "cast", 1),
  "emberflight": spell("fire", "step", "source", "cast", 1),
  "emberlash": projectile("fire", "jb2a.scorching_ray.01.orange", {sound: "psfx.2nd-level-spells.scorching-ray.v1"}),
  // O-225 (the lead, 2026-11-11: *"Just the animation should fire in the targetted area."*): the
  // fire burns where the card's Place area put its 10 ft of ground, never at the caster. An object
  // the card places no area on records no point, and nothing plays (`not-this-trigger` at the cast).
  // A cue, not a loop: Everburn is not Sustained, and a spell row has no loop on a Region alone.
  "everburn": spell("fire", "flame", "region", "region", 1),
  "fire-shield": spell("fire", "shield", "target", "cast|effect", 1),
  "firebrand": spell("fire", "flame", "target", "cast|effect", 1),
  "firebreak": spell("fire", "burst", "region-line", "region", 1),
  "firelands": spell("fire", "flame", "region", "region", 1, "sustain-region"),
  "firewake": spell("fire", "flame", "region", "region", 1),
  "firewalk": spell("fire", "cast", "source", "cast", 1),
  "flame-burst": spell("fire", "burst", "region", "region", 1),
  "flameforge": spell("fire", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "flamesong": group("fire", "cast"),
  "flashover": spell("fire", "fire", "target", "cast", 1),
  "forge-flame": spell("fire", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "incinerate": projectile("fire", "jb2a.scorching_ray.01.orange", {scale: 1.35, sound: "psfx.2nd-level-spells.scorching-ray.v1"}),
  "living-flame": spell("fire", "flame", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "meteor": spell("fire", "cast", "source", "cast", 1.4), // Delayed impact: the cast does not show damage landing early.
  "purging-flame": spell("fire", "fire", "target", "cast", 1),
  "pyre": spell("fire", "fire", "target", "cast", 1),
  "pyroclasm": spell("fire", "fire", "region", "region", 1),
  "ring-of-fire": spell("fire", "burst", "region", "region", 1, "sustain-region"),
  "scorched-earth": spell("fire", "flame", "region", "region", 1),
  "scour": spell("fire", "burst", "region", "region", 1),
  "sealing-flame": spell("fire", "shield", "target", "cast|effect", 1),
  "signal-fire": spell("fire", "cast", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "slagfall": spell("fire", "flame", "region", "region", 1, "sustain-region"),
  "smolder": spell("fire", "flame", "target", "cast", 1),
  "soulfire": spell("fire", "fire", "target", "cast", 1),
  "sunfire": spell("fire", "burst", "source", "cast", "area"),
  "the-burning": spell("fire", "flame", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "wall-of-flame": spell("fire", "wall", "region-line", "region", 1),
  "watchfire": spell("fire", "flame", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "wildfire": spell("fire", "burst", "region", "region", 1),
  // shadow
  "bargain": spell("shadow", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "blackout": spell("shadow", "darkness", "region", "region", 1, "sustain-region"),
  "contagion": spell("shadow", "darkness", "region", "region", 1),
  "curse-of-the-elements": spell("shadow", "mental", "resisted", "resist", 1),
  "descent": group("shadow", "step", true),
  "dispersion": spell("shadow", "step", "source", "cast", 1),
  "distant-mind": spell("shadow", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "dominate": spell("shadow", "mental", "resisted", "resist", 1),
  "entropy": spell("shadow", "impact", "target", "cast", 1),
  "exsanguinate": spell("shadow", "impact", "target", "cast", 1),
  "faceless": spell("shadow", "mental", "resisted", "resist", 1),
  "grave-coil": spell("shadow", "impact", "target", "cast", 1),
  "graveblight": spell("shadow", "darkness", "region", "region", 1, "sustain-region"),
  "horrify": spell("shadow", "mental", "resisted", "resist", 1),
  "mind-sear": spell("shadow", "burst", "region", "region", 1),
  "mind-soothe": spell("shadow", "mental", "resisted", "resist", 1),
  "mindfetter": spell("shadow", "mental", "resisted", "resist", 1),
  "mindlink": group("shadow", "cast"),
  "necrosis": spell("shadow", "impact", "target", "cast", 1),
  "necrotic-shell": spell("shadow", "shield", "source", "cast", 1),
  "nightburn": projectile("shadow", "jb2a.eldritch_blast.purple", {filter: "DARK", scale: 1.3}),
  "nightfall": spell("shadow", "darkness", "region", "region", 1),
  "nightreach": spell("shadow", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "puppet": spell("shadow", "mental", "resisted", "resist", 1),
  "rewrite": spell("shadow", "mental", "resisted", "resist", 1),
  "shadow-wave": spell("shadow", "cone", "region-cone", "region", 1),
  "shadow-word-anguish": spell("shadow", "impact", "target", "cast", 1),
  "shadow-word-hunger": spell("shadow", "impact", "target", "cast", 1),
  "shadowmend": spell("shadow", "cast", "source", "cast", 1),
  "shadowveil": group("shadow", "shield"),
  "siphon-life": spell("shadow", "impact", "target", "cast", 1),
  "speak-with-the-dead": spell("shadow", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "the-deep": spell("shadow", "darkness", "region", "region", 1, "sustain-region"),
  "the-whisper": spell("shadow", "detect", "source", "cast", 1.1), // No object/remote destination is recorded: cast cue only.
  "thoughtsteal": spell("shadow", "mental", "resisted", "resist", 1),
  "umbra": spell("shadow", "cast", "source", "cast", 1),
  "void-eruption": spell("shadow", "burst", "region", "region", 1),
  "void-rift": spell("shadow", "vortex", "region", "region", 1, "sustain-region"),
  "void-tide": spell("shadow", "burst", "region", "region", 1),
  "wasting": spell("shadow", "impact", "target", "cast", 1),
});
