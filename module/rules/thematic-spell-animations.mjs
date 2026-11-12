/**
 * Proposed finite audiovisual treatments for the twenty-four spells selected
 * in SPELL-EXPANSION-TIERS-2-4-PLAN.md. These are intentionally separate from
 * the shared spell catalogue until their trigger adapters are reviewed.
 *
 * A cast cue announces an attempt only. Stateful outcomes belong to the rule
 * adapters named on each row; no animation here moves an object, changes a
 * scene, transfers a spell, heals, or grants a condition.
 */
const fx = (asset, place = "source", options = {}) => Object.freeze({kind: "effect", asset, place, ...options});
const snd = asset => Object.freeze({kind: "sound", asset, volume: 0.55});
const cue = (trigger, steps) => Object.freeze({trigger, steps: Object.freeze(steps)});
const recipe = (visual, sound, options = {}) => Object.freeze({
  cues: Object.freeze([cue(options.trigger ?? "cast", [fx(visual, options.place ?? "source", options.visualOptions), snd(sound)])]),
  ...(options.standIn ? {standIn: options.standIn} : {}),
  ...(options.requires ? {requires: Object.freeze(options.requires)} : {}),
  ...(options.privateSound ? {privateSound: Object.freeze(options.privateSound)} : {})
});

/**
 * The privateSound descriptor is documentation for a future recipient-scoped
 * playback adapter. The current spell planner ignores it on purpose; Phantom
 * Footsteps therefore has no public sound step.
 */
export const THEMATIC_SPELL_ANIMATIONS = Object.freeze({
  // **HEAT MIRAGE AND MINDSTATIC PLAY IN THEIR AREA** (O-314; the lead, 2026-11-11: *"yes if
  // there is an animation for the effected area"*). Each places a Region from its card at the
  // point its cast recorded, and is cued there and nowhere else: silent at the cast, like every
  // area 07 places (Flamestrike). Heat Mirage's refraction is a heat shimmer, played ONCE as the
  // image is made; it stands no loop, because a shimmer standing on the image would mark the
  // illusion for every viewer (asked of the lead, O-315). Mindstatic's boundary stands a loop
  // while its Region does and the Sustain is held.
  "heat-mirage": Object.freeze({
    cues: Object.freeze([cue("region", [
      fx("jb2a.template_circle.aura.04.outward.001.complete.combined.refraction", "region", {area: 1}),
      snd("psfx.casting.fire-side.001")
    ])]),
    requires: Object.freeze(["gm-authored illusion anchor", "viewer knowledge", "the card's Place area at the anchor the cast recorded"])
  }),
  "phoenix-courier": recipe("jb2a.fireflies.many.01.green", "psfx.cantrips.gust.v1", {visualOptions: {filter: "FIRE_B"}, standIn: "Amber-filtered motes are only an ember-bird departure/arrival stand-in; no courier, parcel, route or cross-scene flight is represented.", requires: ["parcel custody", "delivery mission", "GM completion/failure"]}),
  "icevein-passage": recipe("jb2a.ice_spikes.radial.burst.white", "psfx.impacts.magicaleffects.cold", {requires: ["GM-approved ice route", "terrain geometry", "expiry"]}),
  "arcane-seal": recipe("jb2a.detect_magic.circle.blue", "psfx.impacts.magicaleffects.generic.002.001", {requires: ["registered object", "authorized creature list", "override/dispel controls"]}),
  "spell-relay": recipe("jb2a.template_circle.out_pulse.01.burst.bluewhite", "psfx.casting.generic.002.001", {requires: ["committed relay origin in range/cover/region records"]}),
  "grand-lexicon": recipe("jb2a.cast_generic.02.blue", "psfx.conditions.boon.002.01", {trigger: "effect", place: "targets", requires: ["willing speaker language", "temporary language overlay"]}),
  "scentweave": recipe("jb2a.fireflies.few.01.green", "psfx.casting.water.001", {trigger: "effect", place: "target", requires: ["chosen sampled scent", "private GM tracking resolution"]}),
  "tidebreath": recipe("jb2a.cast_generic.water.02.blue", "psfx.casting.water.001", {trigger: "effect", place: "targets", requires: ["recipient breathing/speech flags", "expiry"]}),
  "phantom-footsteps": Object.freeze({
    cues: Object.freeze([cue("resist", [fx("jb2a.cast_generic.02.blue", "resisted", {scale: 0.6})])]),
    requires: Object.freeze(["failed resistance result", "recipient-scoped visual delivery", "chosen apparent point and sound", "repeat-Test record"]),
    privacy: Object.freeze({audience: "affected player only; GM for NPC", status: "current planner has no private spell cue routing; keep this recipe out of shared playback until an adapter enforces the audience"}),
    privateSound: Object.freeze({adapter: "module/effects/thematic-shadow.mjs#playPhantom", trigger: "failed Resist",
      choices: Object.freeze(["footsteps", "knock", "indistinct-whisper", "dripping-water"]),
      audience: "affected player only; GM for NPC", status: "played by the private whisper route; never use the shared planner"}),
    standIn: "The violet flicker follows only a failed Resist and is intended for the affected player; the shared planner cannot enforce that privacy yet. The phantom sound is not in the public recipe."
  }),
  "mindstatic": Object.freeze({
    cues: Object.freeze([cue("region", [
      fx("jb2a.template_circle.out_pulse.01.burst.bluewhite", "region", {area: 1}),
      snd("psfx.impacts.magicaleffects.psychic")
    ])]),
    loop: Object.freeze({binding: "sustain-region", layers: Object.freeze([
      fx("jb2a.template_circle.aura.01.loop.large.bluepurple", "region", {area: 1, mask: true, opacity: 0.35})
    ])}),
    requires: Object.freeze(["the card's Place area at the point the cast recorded", "mental-channel endpoints", "suspend/resume state"])
  }),
  "summoners-writ": recipe("jb2a.cast_generic.fire.01.orange", "psfx.casting.generic.001", {requires: ["GM-approved delegate permission", "range and bond checks on every command", "revocation state"]}),
  "prayer-of-mending": recipe("jb2a.particle_burst.01.circle.bluepurple", "psfx.conditions.boon.002.01", {trigger: "effect", place: "target", visualOptions: {filter: "GOLD_B", scale: 0.4}, requires: ["gold mote when applied to the recorded recipient", "hostile damage event identity", "atomic charge spend and heal", "committed recipient transfer; healing bell and traveling spark wait for that record"]}),

  "ash-assay": recipe("jb2a.cast_generic.fire.side01.orange", "psfx.casting.fire-side.001", {requires: ["recorded sample", "GM-authored broad material result"]}),
  "rime-arrest": recipe("jb2a.ice_spikes.radial.burst.white", "psfx.impacts.magicaleffects.cold", {requires: ["registered mundane mechanism", "Half-Action budget"]}),
  "exacting-measure": recipe("jb2a.detect_magic.circle.blue", "psfx.impacts.magicaleffects.generic.002.001", {requires: ["recorded points and measurements", "GM interpretation"]}),
  "spellwrights-mark": Object.freeze({...recipe("jb2a.cast_generic.02.blue", "psfx.casting.generic.002.001", {requires: ["page or closed-packet mark", "immutable caster-identity and content-integrity receipt", "authorized verifier result; no automatic image or handwriting interpretation"]}),
    privateSound: Object.freeze({asset: "psfx.impacts.magicaleffects.generic.002.001", trigger: "authorized verification", audience: "authorized verifier only", status: "played locally from the GM-private verification notice; never through shared playback"})}),
  "seedwake": recipe("jb2a.entangle.02.complete.02.green", "psfx.casting.water.001", {requires: ["recorded seed/soil location", "GM-approved growth result"]}),
  "watershed": recipe("jb2a.template_circle.out_pulse.01.burst.bluewhite", "psfx.casting.water.001", {requires: ["recorded water source and destination", "Half-Action budget", "GM-approved flow result"]}),
  "borrowed-voice": recipe("jb2a.cast_generic.02.blue", "psfx.casting.generic.002.001", {trigger: "effect", place: "source", requires: ["Warlock-only gate", "chosen known voice sample", "duration and identity record"]}),
  "dream-theatre": recipe("jb2a.spirit_guardians.blueyellow.ring", "psfx.conditions.boon.002.01", {requires: ["GM-authored shared dream scene", "participant privacy"]}),
  "pact-escrow": recipe("jb2a.cast_generic.fire.01.orange", "psfx.casting.generic.001", {requires: ["two consenting participants and two specific unattended nonliving objects, each at most 10 lb", "locked custody after both approvals", "atomic simultaneous physical object swap or rollback; no duplication"]}),
  "fel-surety": recipe("jb2a.shield.01.intro.blue", "psfx.impacts.magicaleffects.necrotic", {requires: ["priced eligible ability", "Reaction budget", "durable guarantee and settlement"]}),
  "gentle-verdict": recipe("jb2a.cast_generic.01.yellow", "psfx.1st-level-spells.bless.v1.002", {place: "source", visualOptions: {filter: "GOLD_B"}, requires: ["setup blessing before next direct damaging Holy spell", "declared pre-cast modifier and recorded outcome"]}),
  "pilgrims-burden": recipe("jb2a.spirit_guardians.blueyellow.ring", "psfx.conditions.boon.002.01", {requires: ["two occupied bag slots per linked pair", "derived counted-load transfer only; physical items stay put", "slot accounting only; no pounds; recipient may become overloaded"], standIn: "An abstract caster-side blessing cue only; this recipe draws no pair links because the planner record does not contain the committed pair map."})
});
