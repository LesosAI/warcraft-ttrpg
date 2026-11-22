/**
 * **WHAT EACH DEMON HUNTER ITEM MUST PLAY, AND WHERE ITS CONTROL IS PRESSED** (the Demon Hunter plan's Phase 6;
 * D-1580). Pure data, read by the `azeroth-rpg.demon-hunter-animations` batch (`quench-demon-hunter-animations.mjs`)
 * and held to the class by `demon-hunter-animation-items.test.mjs`: every spell 07 gives the Demon Hunter of its
 * own, every feature row and every talent row is an item here, with the cues it must play and the scenario titles
 * whose real controls press it.
 *
 * `from` lists title PREFIXES of the tests whose bodies press the control (in the spells and features batches the
 * animation batch reruns, or its own `ANI:` gaps); `who` is the role a cue is placed for: `caster` (the record's
 * source is the hunter), `target` (an effect step on a creature other than the hunter), `point` (an effect step at
 * a canvas point), `any`. `loop` asks that the row's loop also stood; an expectation with `loopOnly` asks only that.
 */

const cast = (key, who = "caster") => ({ trigger: "cast", key, who });
const resisted = key => ({ trigger: "resist", key, who: "target" });
const region = (key, extra = {}) => ({ trigger: "region", key, who: "point", ...extra });
const use = (key, who = "any", extra = {}) => ({ trigger: "use", key, who, ...extra });
const hit = key => ({ trigger: "hit", key, who: "target" });
const arrive = key => ({ trigger: "arrive", key, who: "point" });
const effect = (key, extra = {}) => ({ trigger: "effect", key, who: "any", ...extra });
const loopOf = key => ({ loopOnly: true, key });

/** The twenty spells of the class's own (`azeroth-rpg.demon-hunter-animations`). */
export const DH_SPELL_ITEMS = [
  { group: "tier 1", name: "Hunter's Brand", from: ["Hunter's Brand:"], expect: [cast("hunters-brand", "target")] },
  { group: "tier 1", name: "Searing Edge", from: ["Searing Edge:"], expect: [cast("searing-edge")] },
  { group: "tier 1", name: "Gaze of the Sightless", from: ["Gaze of the Sightless:"], expect: [cast("gaze-of-the-sightless")] },
  { group: "tier 1", name: "Spellsunder", from: ["Spellsunder:"], expect: [cast("spellsunder", "target"), resisted("spellsunder")] },
  { group: "tier 1", name: "Immolation Aura", from: ["Immolation Aura:"], expect: [cast("immolation-aura", "caster"), loopOf("immolation-aura")] },
  { group: "tier 1", name: "Demon Spikes", from: ["Demon Spikes:"], expect: [cast("demon-spikes"), loopOf("demon-spikes")] },
  { group: "tier 1", name: "Agonizing Flames", from: ["Agonizing Flames:"], expect: [cast("agonizing-flames", "target"), loopOf("agonizing-flames")] },
  { group: "tier 1", name: "Call the Glaives", from: ["Call the Glaives:"], expect: [cast("call-the-glaives")] },
  { group: "tier 2", name: "Hellstrike", from: ["Hellstrike:"], expect: [cast("hellstrike")] },
  { group: "tier 2", name: "Siphon the Weave", from: ["Siphon the Weave:"], expect: [cast("siphon-the-weave", "target")] },
  { group: "tier 2", name: "Unnatural Agility", from: ["Unnatural Agility:"], expect: [cast("unnatural-agility")] },
  { group: "tier 2", name: "Nether Snare", from: ["Nether Snare:"], expect: [cast("nether-snare"), resisted("nether-snare")] },
  { group: "tier 2", name: "Eye Beam", from: ["Eye Beam:", "ANI: Eye Beam and Draw Soul"], expect: [cast("eye-beam"), resisted("eye-beam"), region("eye-beam")] },
  { group: "tier 2", name: "Flame Crash", from: ["Flame Crash:"], expect: [cast("flame-crash"), region("flame-crash:ground", { loop: true })] },
  { group: "tier 3", name: "Hunting Ground", from: ["Hunting Ground:"], expect: [cast("hunting-ground"), loopOf("hunting-ground")] },
  { group: "tier 3", name: "Devour the Spell", from: ["Devour the Spell at a creature's turn start"], expect: [cast("devour-the-spell", "target")] },
  { group: "tier 3", name: "Glaive Tempest", from: ["Glaive Tempest:"], expect: [cast("glaive-tempest")] },
  { group: "tier 3", name: "Shear", from: ["Shear:"], expect: [cast("shear", "target"), resisted("shear")] },
  { group: "tier 3", name: "Draw Soul", from: ["Draw Soul:", "ANI: Eye Beam and Draw Soul"], expect: [cast("draw-soul"), resisted("draw-soul"), region("draw-soul")] },
  { group: "tier 3", name: "Inner Demon", from: ["Inner Demon:"], expect: [cast("inner-demon"), resisted("inner-demon"), effect("inner-demons-torment", { loop: true })] }
];

/** 02's features with a row, the states they lay, and 04's talents with a row. */
export const DH_FEATURE_ITEMS = [
  { group: "02's features", name: "Beyond Limits", from: ["Beyond Limits lays"], expect: [use("beyond-limits", "caster")] },
  { group: "02's features", name: "Hunter's Leap", from: ["Hunter's Leap at Dexterity"], expect: [use("hunters-leap", "caster"), arrive("hunters-leap")] },
  { group: "02's features", name: "Demon Unleashed", from: ["Demon Unleashed spends all"], expect: [use("demon-unleashed", "caster"), effect("demon-unleashed", { loop: true })] },
  { group: "02's features", name: "I Have Prepared", from: ["I Have Prepared reads"], expect: [use("i-have-prepared", "caster"), effect("i-have-prepared", { loop: true })] },
  { group: "02's features", name: "Fel Lash", from: ["a Fel Lash hit at Fel 6"], expect: [hit("fel-lash")] },
  { group: "02's features", name: "Mana Rend", from: ["Mana Rend takes"], expect: [hit("mana-rend")] },
  { group: "02's features", name: "Devour Soul", from: ["Devour Soul is offered"], expect: [use("devour-soul", "target")] },
  { group: "04's talents", name: "Gift of the Skull", from: ["ANI: Gift of the Skull and Chaos Blast"], expect: [use("gift-of-the-skull", "caster"), effect("gift-of-the-skull", { loop: true })] },
  { group: "04's talents", name: "Chaos Blast", from: ["ANI: Gift of the Skull and Chaos Blast"], expect: [use("chaos-blast", "target")] },
  { group: "04's talents", name: "Silence the Weave", from: ["ANI: Silence the Weave"], expect: [use("silence-the-weave", "caster")] }
];
