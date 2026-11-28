/**
 * **WHAT EACH WITCH HUNTER ITEM MUST PLAY, AND WHERE ITS CONTROL IS PRESSED** (the Witch Hunter plan's wave 3;
 * D-2095 to D-2099). Pure data, read by the `azeroth-rpg.witch-hunter-animations` batch
 * (`quench-witch-hunter-animations.mjs`) and held to the class by `witch-hunter-animation-items.test.mjs`: every row
 * the class spreads into the feature table is an item here, with the cues it must play and the scenario titles whose
 * real controls press it.
 *
 * `from` lists title PREFIXES of the tests whose bodies press the control (in the brews, tome, signs and features
 * batches the animation batch reruns, or its own `ANI:` gaps); `who` is the role a cue is placed for: `caster` (the
 * record's source is the hunter), `target` (an effect step on a creature other than the hunter), `point` (an effect
 * step at a canvas point), `any`. `state` asks for a record carrying that state (an Empowered Sign); `loop` asks that
 * the row's loop also stood; an expectation with `loopOnly` asks only that.
 */

const use = (key, who = "caster", extra = {}) => ({ trigger: "use", key, who, ...extra });
const region = (key, extra = {}) => ({ trigger: "region", key, who: "point", ...extra });
const loopOf = key => ({ loopOnly: true, key });

/** The Signs and 02's features. */
export const WH_FEATURE_ITEMS = [
  { group: "Signs", name: "Gale Sign", from: ["GALE SIGN:"], expect: [use("gale-sign"), region("gale-sign")] },
  { group: "Signs", name: "Ember Sign", from: ["EMBER SIGN:"], expect: [use("ember-sign"), region("ember-sign")] },
  { group: "Signs", name: "Rowan Sign", from: ["ROWAN SIGN:"], expect: [use("rowan-sign", "any"), loopOf("rowan-sign")] },
  { group: "Signs", name: "Greater Signs (an Empowered Gale Sign)", from: ["GREATER SIGNS:"], expect: [use("gale-sign", "caster", { state: "empowered" })] },
  { group: "Signs", name: "Ash Sign", from: ["ASH SIGN:"], expect: [use("ash-sign"), region("ash-sign", { loop: true })] },
  { group: "Signs", name: "Lull Sign", from: ["LULL SIGN:"], expect: [use("lull-sign")] },
  { group: "02's features", name: "Read the Trail", from: ["READ THE TRAIL:"], expect: [use("read-the-trail")] },
  { group: "02's features", name: "Expose Weakness", from: ["EXPOSE WEAKNESS:"], expect: [use("expose-weakness", "target"), loopOf("expose-weakness")] },
  { group: "02's features", name: "Whirling Steel", from: ["WHIRLING STEEL:"], expect: [use("whirling-steel")] },
  { group: "02's features", name: "Medallion", from: ["MEDALLION:"], expect: [use("medallion"), use("medallion:sense"), use("medallion:warn", "target")] },
  { group: "02's features", name: "The Last Hunt", from: ["THE LAST HUNT:"], expect: [use("the-last-hunt", "caster", { loop: true })] },
  { group: "Tempo", name: "Tempo gained and spent", from: ["ANI: Tempo"], expect: [use("tempo:gain"), use("tempo:spend")] }
];

/** 08 §12's nineteen brews. */
export const WH_BREW_ITEMS = [
  ...["liferoot-tonic", "kingsblood-draught", "peacebloom-draught", "mageroyal-draught", "goldthorn-draught", "fadeleaf-drops",
    "wintersbite-draught", "silverleaf-tonic", "gromsblood-draught", "firebloom-cordial", "decoction"]
    .map(id => ({ group: "elixirs and the Decoction", name: id, from: ["ANI: every elixir"], expect: [use(`brew:${id}`)] })),
  ...["hunters-oil", "silvering-oil", "blindweed-oil"]
    .map(id => ({ group: "oils", name: id, from: ["ANI: every oil"], expect: [use(`brew:${id}`)] })),
  ...["liquid-fire", "sungrass-flash", "icecap-flask", "silver-dust", "rowan-dust"]
    .map(id => ({ group: "bombs", name: id, from: ["each bomb posts one card"], expect: [use(`brew:${id}`, "target")] }))
];

/**
 * 04's talents whose rows the table spreads: all ten since the architect review's A3 (wave 2d-A, D-2133) emptied
 * `WH_TALENT_DOORS_PENDING` and Bear's Endurance gained its picture (D-2134). Each is pressed by its own `ANI:` gap
 * test in the animations batch (wave 2d-B's titles).
 */
export const WH_TALENT_ITEMS = [
  { group: "04's talents", name: "Ashen Ring", from: ["ANI: Ashen Ring"], expect: [region("ashen-ring", { loop: true })] },
  { group: "04's talents", name: "Firestream", from: ["ANI: Firestream"], expect: [region("firestream", { loop: true })] },
  { group: "04's talents", name: "Bursting Rowan", from: ["ANI: Bursting Rowan"], expect: [use("bursting-rowan", "target")] },
  { group: "04's talents", name: "Tumble", from: ["ANI: Tumble"], expect: [use("tumble")] },
  { group: "04's talents", name: "Second Cut", from: ["ANI: Second Cut"], expect: [use("second-cut", "target")] },
  { group: "04's talents", name: "Cat's Dance", from: ["ANI: Cat's Dance"], expect: [use("cats-dance", "target")] },
  { group: "04's talents", name: "Thunderous Swing", from: ["ANI: Thunderous Swing"], expect: [{ trigger: "arrive", key: "thunderous-swing", who: "point" }] },
  { group: "04's talents", name: "Mountain Bear", from: ["ANI: Mountain Bear"], expect: [use("mountain-bear", "caster", { loop: true })] },
  { group: "04's talents", name: "Second Brewing", from: ["ANI: Second Brewing"], expect: [use("second-brewing")] },
  { group: "04's talents", name: "Bear's Endurance", from: ["ANI: Bear's Endurance"], expect: [use("bears-endurance")] }
];
