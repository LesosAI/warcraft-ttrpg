/**
 * **THE CLASS TALENT AUDIT'S MAGE, WARLOCK AND DRUID PICTURES** (D-1890 to D-1899), spread into
 * `animation-table.mjs#FEATURE_ANIMATIONS`. Pure data, no Foundry imports. Each row is keyed by the
 * feature's key (`animation-records.mjs#featureKeyOf`: the granting talent's slug, else the
 * feature's), cues at `use` - the one trigger every Use fires - and carries an effect step AND a
 * sound step, every asset a full Sequencer leaf key held against `tools/animation/assets.json`. A
 * casting Use whose Test failed plays nothing (`animation.mjs#plan`'s `failed-cast`, D-756).
 */

const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop: what stands while the world holds the state it follows (D-729), `animation-table.mjs#loop`'s shape. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

export const AUDIT_ARCANE_ANIMATIONS = Object.freeze({
  /* ---- 02's Mage ---- */
  // Evocation: the Mana drawn back in, once a Long Rest.
  evocation: {
    cues: [cue("use", [
      fx("jb2a.magic_signs.circle.02.divination.complete.blue", { place: "source", scale: 1.2, below: true }),
      fx("jb2a.energy_field.01.blue", { place: "source", scale: 0.8, delay: 300 }),
      snd("psfx.1st-level-spells.detect-magic.v1.001", { volume: 0.6 })
    ])]
  },
  // Time Warp: the three Half-Actions, once an encounter.
  "time-warp": {
    cues: [cue("use", [
      fx("jb2a.magic_signs.circle.02.illusion.complete.purple", { place: "source", scale: 1.3, below: true }),
      snd("psfx.impacts.magicaleffects.psychic", { volume: 0.6 })
    ])]
  },
  /* ---- 04's Mage ---- */
  // Arcane Power: the surge on the mage.
  "arcane-power": {
    cues: [cue("use", [
      fx("jb2a.energy_field.01.blue", { place: "source", scale: 0.9 }),
      snd("psfx.impacts.magicaleffects.generic.002.001", { volume: 0.6 })
    ])]
  },
  // Pyroblast: the great bolt of fire, and its burst on the target.
  pyroblast: {
    cues: [cue("use", [
      fx("jb2a.fireball.beam.orange", { place: "source>target" }),
      fx("jb2a.fireball.explosion.orange", { place: "target", scale: 0.8, delay: 600 }),
      snd("psfx.3rd-level-spells.fireball.v1.001.explosion", { volume: 0.7 })
    ])]
  },
  // Shattering Cold: the frozen Stun on the Entangled creature (its own event card,
  // `effects/feature-events.mjs`, written where the Stun landed).
  "shattering-cold": {
    cues: [cue("use", [
      fx("jb2a.impact.ground_crack.frost.01.white", { place: "target", scale: 0.6, below: true }),
      fx("jb2a.ice_spikes.radial.burst.white", { place: "target", scale: 0.5, delay: 150 }),
      snd("psfx.impacts.magicaleffects.cold", { volume: 0.6 })
    ])]
  },
  // Firestorm: the burning ground, laid from the card.
  firestorm: {
    cues: [cue("use", [
      fx("jb2a.explosion.01.orange", { place: "source", scale: 1.2 }),
      snd("psfx.impacts.magicaleffects.fire", { volume: 0.7 })
    ])]
  },

  /* ---- 02's Warlock ---- */
  // Drain: the warlock opens to what their blows take.
  drain: {
    cues: [cue("use", [
      fx("jb2a.magic_signs.circle.02.necromancy.complete.dark_green", { place: "source", scale: 1, below: true }),
      snd("psfx.impacts.magicaleffects.necrotic", { volume: 0.6 })
    ])]
  },
  // Curse: the Bane laid on the creature named.
  curse: {
    cues: [cue("use", [
      fx("jb2a.markers.chain.standard.complete.02.red", { place: "target", scale: 0.9, filter: "DARK" }),
      snd("psfx.incantations.masculine.002.demonic.harm.004", { volume: 0.6 })
    ])]
  },
  // Ritual of Summoning: the circle that calls the Greater Demons.
  "ritual-of-summoning": {
    cues: [cue("use", [
      fx("jb2a.magic_signs.circle.02.necromancy.complete.dark_green", { place: "source", scale: 2, below: true }),
      fx("jb2a.darkness.black", { place: "source", scale: 0.9, opacity: 0.6, delay: 400 }),
      snd("psfx.incantations.masculine.002.demonic.summon.006", { volume: 0.8 })
    ])]
  },
  /* ---- 04's Warlock ---- */
  // Dark Pact: the demon's power drawn into the warlock.
  "dark-pact": {
    cues: [cue("use", [
      fx("jb2a.markers.chain.standard.complete.02.red", { place: "source", scale: 0.8 }),
      snd("psfx.incantations.masculine.002.demonic.help.005", { volume: 0.6 })
    ])]
  },
  // Dark Harvest: at the warlock's turn start, shadow drawn out of each creature it strikes
  // (its own event card, `effects/feature-events.mjs`, posted by the turn's tick).
  "dark-harvest": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "target>source", opacity: 0.85 }),
      snd("psfx.impacts.magicaleffects.necrotic", { volume: 0.6 })
    ])]
  },
  // Shadowfury: the burst of shadow that stuns.
  shadowfury: {
    cues: [cue("use", [
      fx("jb2a.darkness.black", { place: "source", scale: 0.8, opacity: 0.7 }),
      fx("jb2a.markers.stun.purple.01", { place: "targets", scale: 0.6, delay: 400 }),
      snd("psfx.impacts.magicaleffects.necrotic", { volume: 0.7 })
    ])]
  },

  /* ---- 02's Druid ---- */
  // Regrowth: the healing on the creature named.
  regrowth: {
    cues: [cue("use", [
      fx("jb2a.healing_generic.200px.green", { place: "target", scale: 0.9 }),
      snd("psfx.1st-level-spells.cure-wounds.v1.001", { volume: 0.6 })
    ])]
  },
  // Hurricane: the wind round the druid's chosen ground.
  hurricane: {
    cues: [cue("use", [
      fx("jb2a.whirlwind.bluegrey", { place: "source", scale: 1.2 }),
      snd("psfx.cantrips.gust.v1", { volume: 0.7 })
    ])]
  },
  // Entangling Roots: the roots rising.
  "entangling-roots": {
    cues: [cue("use", [
      fx("jb2a.entangle.green", { place: "source", scale: 1.1, below: true }),
      snd("psfx.1st-level-spells.entangle.vines.v1.001.intro", { volume: 0.6 })
    ])]
  },
  // Heart of the Grove: the aura laid on each ally in its reach (D-755), a STATE - so a loop
  // the reconciler ends when the aura comes off (D-729), and a brief growth with a sound as
  // it arrives on a creature.
  "heart-of-the-grove": {
    cues: [cue("effect", [
      fx("jb2a.plant_growth.03.round.2x2.complete.greenyellow", { place: "effect", scale: 0.6, below: true }),
      snd("psfx.1st-level-spells.entangle.vines.v1.001.intro", { volume: 0.35 })
    ], { state: "aura" })],
    loop: loop("effect", [
      fx("jb2a.plant_growth.03.round.2x2.loop.greenyellow", { place: "holder", scale: 0.6, below: true, opacity: 0.45 })
    ], { state: "aura" })
  },
  // Hibernate: the party's short sleep.
  hibernate: {
    cues: [cue("use", [
      fx("jb2a.healing_generic.200px.blue", { place: "source", scale: 0.9 }),
      snd("psfx.1st-level-spells.sleep.v1.001", { volume: 0.5 })
    ])]
  }
});
