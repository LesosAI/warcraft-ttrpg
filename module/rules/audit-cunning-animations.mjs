/**
 * **THE CLASS TALENT AUDIT'S ROGUE, PRIEST AND SHAMAN PICTURES** (D-1880 to D-1887), spread into
 * `animation-table.mjs#FEATURE_ANIMATIONS`. Pure data, no Foundry imports. Each row is keyed by the
 * feature's key (`animation-records.mjs#featureKeyOf`: the granting talent's slug, else the
 * feature's), cues at `use` - the one trigger every Use fires - and carries an effect step AND a
 * sound step, every asset a full Sequencer leaf key held against `tools/animation/assets.json`.
 * Eye of the Storm and Flametongue are Sustains of their own, so each loops on `sustain-self`
 * while held (D-729: the reconciler ends it with the Sustain).
 */

const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

export const AUDIT_CUNNING_ANIMATIONS = Object.freeze({
  /* ---- 04's Rogue ---- */
  // Master of Shadows' minute: the Rogue folds into shadow.
  "master-of-shadows": {
    cues: [cue("use", [
      fx("jb2a.smoke.puff.centered.grey", { place: "source", scale: 1.1, filter: "DARK" }),
      snd("psfx.2nd-level-spells.misty-step.v1.intro.generic", { volume: 0.5 })
    ])]
  },
  // Death Mark's naming: a mark on the Rogue as the target is named.
  "death-mark": {
    cues: [cue("use", [
      fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "source", scale: 0.9, filter: "DARK" }),
      snd("psfx.incantations.masculine.002.dry.harm.004", { volume: 0.6 })
    ])]
  },
  // Adrenaline's Combo Point bought with Energy.
  adrenaline: {
    cues: [cue("use", [
      fx("jb2a.static_electricity.01.blue", { place: "source", scale: 0.5, filter: "GOLD_B" }),
      snd("psfx.cantrips.gust.v1", { volume: 0.4 })
    ])]
  },

  /* ---- 04's Priest ---- */
  // Spirit Shell: a shield of Light washing out over every ally within 20 feet.
  "spirit-shell": {
    cues: [cue("use", [
      fx("jb2a.template_circle.aura.01.loop.large.bluepurple", { place: "source", sizeFt: 40, below: true, opacity: 0.4, filter: "GREENGOLD", hold: 1400, fadeOut: 500 }),
      fx("jb2a.healing_generic.burst.greenorange", { place: "source", scale: 1.6, delay: 200 }),
      snd("psfx.incantations.masculine.002.reverb.help.005", { volume: 0.7 })
    ])]
  },
  // Miracle's minute: the Light gathers on the priest.
  miracle: {
    cues: [cue("use", [
      fx("jb2a.healing_generic.burst.greenorange", { place: "source", scale: 2 }),
      snd("psfx.incantations.masculine.002.reverb.help.005")
    ])]
  },
  // Herald of the Void's minute: the Void wells up about the priest.
  "herald-of-the-void": {
    cues: [cue("use", [
      fx("jb2a.markers.on_token_mask.complete.01.orange", { place: "source", scale: 1.3, filter: "DARK" }),
      snd("psfx.impacts.magicaleffects.necrotic", { volume: 0.6 })
    ])]
  },
  // 02's Divine Hymn: Ward 3 sung out over every creature it reaches.
  "divine-hymn": {
    cues: [cue("use", [
      fx("jb2a.template_circle.aura.01.loop.large.bluepurple", { place: "source", sizeFt: 120, below: true, opacity: 0.3, filter: "GREENGOLD", hold: 1600, fadeOut: 600 }),
      snd("psfx.incantations.masculine.002.reverb.help.005", { volume: 0.8 })
    ])]
  },

  /* ---- 04's Shaman ---- */
  // Eye of the Storm: the storm gathered at the cast, and held about the shaman while Sustained.
  "eye-of-the-storm": {
    cues: [cue("use", [
      fx("jb2a.static_electricity.01.blue", { place: "source", scale: 1.2 }),
      snd("psfx.cantrips.gust.v1", { volume: 0.6 })
    ])],
    loop: loop("sustain-self", [
      fx("jb2a.static_electricity.01.blue", { place: "holder", scale: 0.9, opacity: 0.6 })
    ])
  },
  // Tide of the Ancestors: a healing tide where the totem is set.
  "tide-of-the-ancestors": {
    cues: [cue("use", [
      fx("jb2a.healing_generic.burst.greenorange", { place: "source", scale: 1.8 }),
      snd("psfx.incantations.masculine.002.reverb.help.005", { volume: 0.7 })
    ])]
  },
  // Flametongue: flame along the blade at the beginning, held while Sustained.
  flametongue: {
    cues: [cue("use", [
      fx("jb2a.explosion.01.orange", { place: "source", scale: 0.4 }),
      snd("psfx.impacts.magicaleffects.necrotic", { volume: 0.35 })
    ])],
    loop: loop("sustain-self", [
      fx("jb2a.markers.on_token_mask.loop.01.orange", { place: "holder", scale: 0.8, opacity: 0.55 })
    ])
  }
});
