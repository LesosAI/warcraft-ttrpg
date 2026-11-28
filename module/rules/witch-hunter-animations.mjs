/**
 * **WHAT THE WITCH HUNTER LOOKS LIKE AND SOUNDS LIKE** (the Witch Hunter plan's wave 3; D-2095 to D-2099). D-723 to
 * D-730 are the standing rules, and `demon-hunter-animations.mjs` is the shape. Pure data and pure record readers, no
 * Foundry imports. What it hands the tables:
 *
 *  - `WH_FEATURE_ANIMATIONS`: 02's features whose doors write a record (the Signs one by one, Expose Weakness,
 *    Whirling Steel, the Medallion, Read the Trail, The Last Hunt), the nineteen brews (`brew:<identifier>`: a
 *    drink, an oil on the blade, a bomb's burst), the states the class lays (the Rowan Ward, the Vulnerable Expose
 *    Weakness lays, The Last Hunt's minute, the Ash ring's Region) and the Tempo's rise and fall, spread into
 *    `animation-table.mjs#FEATURE_ANIMATIONS`;
 *  - `WH_TALENT_ANIMATIONS`: 04's talents that do something on the board, spread only once the door that writes
 *    their record has landed (`liveWhTalentAnimations`, the Demon Hunter's way), so no row waits on a door that does
 *    not exist yet;
 *  - `WH_NO_ROW`: every feature and talent that plays nothing of its own, each with its reason in words (the
 *    brief's *quiet* reason, enforced by `witch-hunter-animations.test.mjs`).
 *
 * **The Signs are one feature with three Signs in it** (02's **Signs**: Gale, Ember and Rowan), so the card's own
 * `featureKey` (`signs`) cannot say which was used. The card records the Sign (`whSign`), and `witchHunterCardKey`
 * files the card under the Sign's own key (`gale-sign`, `ember-sign`, `rowan-sign`; `ash-sign` and `lull-sign` are
 * already their features' keys), with an Empowered Sign's `empowered` state beside it (**Greater Signs**).
 *
 * The grammar is the table's own: a cue fires on an EVENT and a loop stands while the world holds its STATE (D-729),
 * so the reconciler ends the Rowan Ward's shell, the Vulnerable mark and The Last Hunt's circle when their effects go,
 * and the Ash ring's smoke when its Region goes. A miss has no impact step, a failed Casting Test never animates
 * (no Witch Hunter Use makes one), and a condition a failure lays (Scorched, Prone, Charmed, Slowed, Blinded,
 * Entangled, Silenced) is the condition's own picture. **Every asset is a full leaf key held against
 * `tools/animation/assets.json`** (D-723), JB2A's or PSFX's, **every cue carries a sound step**, and **every number is
 * a starting value** for the lead to read in play.
 */

import { ASH_RING_KEY } from "./witch-hunter-features.mjs";
import { BREW_IDENTIFIERS, brewOf } from "./witch-hunter-brews.mjs";
import { LAST_HUNT_FLAG } from "./witch-hunter-standing.mjs";
import { VULNERABLE_FLAG } from "./laid-vulnerable.mjs";
import { WH_STATE_NAMES } from "./animation-records.mjs";

/** An effect step. */
const fx = (asset, options = {}) => Object.freeze({ kind: "effect", asset, ...options });
/** A sound step. */
const snd = (asset, options = {}) => Object.freeze({ kind: "sound", asset, ...options });
/** A cue; a cue naming a `state` answers only a record that carries it. */
const cue = (trigger, steps, { state = null } = {}) => Object.freeze({ trigger, steps: Object.freeze(steps), ...(state ? { state } : {}) });
/** A loop; an `effect` loop names the state it follows. */
const loop = (binding, layers, { state = null } = {}) => Object.freeze({ binding, layers: Object.freeze(layers), ...(state ? { state } : {}) });

/**
 * **THE WITCH HUNTER'S RECOLOURS**, spread into `animation-table.mjs#FILTERS`. A tint MULTIPLIES, so it suits a
 * near-white or grey file: silver for the Order's steel and dust, ash grey for the Ash ring, rowan amber for the
 * Rowan Ward and its dust, a dark blood for the Decoction. Tempo takes Momentum red (D11).
 */
export const WH_FILTERS = Object.freeze({
  WH_SILVER: Object.freeze({ tint: "#dfe6ee", saturate: -0.6, brightness: 1.15 }),
  WH_ASH: Object.freeze({ saturate: -0.95, brightness: 0.7 }),
  WH_ROWAN: Object.freeze({ tint: "#f0a040", brightness: 1.05 }),
  WH_BLOOD: Object.freeze({ tint: "#b02a22", brightness: 0.9 }),
  WH_TEMPO: Object.freeze({ tint: "#e04030", brightness: 1 })
});

/* ------------------------------------------------------------------ */
/*  The keys the class's doors write                                   */
/* ------------------------------------------------------------------ */

/** A Sign's own key off the Sign the card recorded (`whSign.sign`), or null. */
export function signAnimationKey(sign) {
  return typeof sign === "string" && /^(gale|ember|rowan|ash|lull)$/.test(sign) ? `${sign}-sign` : null;
}

/** The three Signs **Signs** holds, whose keys no feature carries (the census's `VALID_KEYS` takes them). */
export const SIGN_EVENT_KEYS = Object.freeze(["gale-sign", "ember-sign", "rowan-sign"]);

/** An Empowered Sign's state word (**Greater Signs**), carried on the card's record. */
export const EMPOWERED_STATE = "empowered";

/**
 * **THE KEY A WITCH HUNTER'S FEATURE CARD IS FILED UNDER**, where it is not the card's own `featureKey`: a Sign's card
 * under the Sign used, with the Empowered state where **Greater Signs** paid for it. Null for any other card.
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @returns {{key: string, states: string[]}|null}
 */
export function witchHunterCardKey(flags = {}) {
  if (flags?.kind !== "feature") return null;
  const key = signAnimationKey(flags?.whSign?.sign);
  if (!key) return null;
  return { key, states: flags.whSign.empowered === true ? [EMPOWERED_STATE] : [] };
}

/** The Medallion's whispered sense of a cast (`effects/witch-hunter-features.mjs#postSense`). */
export const MEDALLION_SENSE_KEY = "medallion:sense";
/** The Medallion's warning pressed on an ally (`effects/witch-hunter-features.mjs#warnFromCard`). */
export const MEDALLION_WARN_KEY = "medallion:warn";
/** Read the Trail's card (`effects/witch-hunter-features.mjs#readTheTrail`), filed under the feature's own key. */
export const READ_THE_TRAIL_KEY = "read-the-trail";

/** A brew's key (`brew:<identifier>`), the one a bomb's feature card already carries (`throwBomb`). */
export const brewKey = identifier => `brew:${identifier}`;
/** The nineteen brews' keys, in 08 §12's order. */
export const BREW_KEYS = Object.freeze(BREW_IDENTIFIERS.map(brewKey));

/**
 * **THE CARD A WITCH HUNTER DOOR POSTS THAT IS NO FEATURE CARD**: a brew drunk or an oil laid (kind `whBrewUse`,
 * `effects/witch-hunter-brews.mjs#useBrew`), the Medallion's whispered sense and Read the Trail's card (kind
 * `witchHunterCard`). Each speaks from the hunter's token. Any other card of these kinds plays nothing (the pulse's
 * whisper rides the Medallion's own feature card, which plays the pulse; a Lull Sign's end is the GM's word).
 *
 * @param {object} flags  the card's `flags["azeroth-rpg"]`
 * @returns {{key: string, trigger: string}|null}
 */
export function witchHunterCardCue(flags = {}) {
  if (flags?.kind === "whBrewUse") {
    const id = typeof flags.identifier === "string" ? flags.identifier : "";
    return BREW_IDENTIFIERS.includes(id) ? { key: brewKey(id), trigger: "use" } : null;
  }
  if (flags?.kind !== "witchHunterCard") return null;
  if (flags.sense && typeof flags.sense === "object") return { key: MEDALLION_SENSE_KEY, trigger: "use" };
  if (flags.trail && typeof flags.trail === "object") return { key: READ_THE_TRAIL_KEY, trigger: "use" };
  return null;
}

/** 04's Ashen Ring's key: the Ash ring's Region with its Holy `against` row (`witch-hunter-features.mjs#ashRingTick`). */
export const ASHEN_RING_KEY = "ashen-ring";

/**
 * **THE KEY AN ASH RING'S REGION IS FILED UNDER**: `ashen-ring` where the ring carries 04's Ashen Ring (its area tick
 * deals Holy damage to an undead or a demon: the `against` row `ashRingTick` writes for the talent's rank), else the
 * Region's own key. Read off what the Region recorded when it was placed (D-724), never off the talent held now.
 *
 * @param {object} flags  the Region's `flags["azeroth-rpg"]`
 * @returns {string|null}
 */
export function ashRingKeyOf(flags = {}) {
  const key = typeof flags?.featureKey === "string" && flags.featureKey ? flags.featureKey : null;
  if (key !== ASH_RING_KEY) return key;
  const against = Array.isArray(flags?.areaTick?.against) ? flags.areaTick.against : [];
  return against.some(a => a?.school === "holy" && Number(a?.rating) > 0) ? ASHEN_RING_KEY : key;
}

/* ------------------------------------------------------------------ */
/*  Tempo's rise and fall                                              */
/* ------------------------------------------------------------------ */

/** The option a Tempo write carries its cue under (`AzerothActor#writePoolsNow`). */
export const TEMPO_CUE_OPTION = "azerothTempoCue";
export const TEMPO_GAIN_KEY = "tempo:gain";
export const TEMPO_SPEND_KEY = "tempo:spend";
/** The Tempo pool's name (`momentum.mjs`'s `tempo`). */
export const TEMPO_POOL = "tempo";

const idOf = value => (typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null);

/**
 * **THE CUE A TEMPO WRITE CARRIES**, or null: a rise is a gain, a fall that leaves some Tempo is a spend, and a fall
 * to nothing is an emptying (two idle rounds, the **Guard** action, a Critical Injury, the fight's end), which plays
 * nothing (MY READING, D-2097: 05 empties Tempo as bookkeeping, and an emptying is no spend). A write with no token of
 * the hunter's on the writer's board records none (D-724: what happened is written where it happened).
 *
 * @param {{before?: number, after?: number, token?: {sceneId?: string|null, tokenId?: string}|null}} o
 * @returns {{sceneId: string|null, tokenId: string, kind: "gain"|"spend", amount: number}|null}
 */
export function tempoCue({ before = 0, after = 0, token = null } = {}) {
  const b = Math.trunc(Number(before)) || 0;
  const a = Math.trunc(Number(after)) || 0;
  if (a === b) return null;
  if (a < b && a <= 0) return null;
  return cleanTempoCue({ sceneId: token?.sceneId ?? null, tokenId: token?.tokenId ?? null, kind: a > b ? "gain" : "spend", amount: Math.abs(a - b) });
}

/** A Tempo cue as an operation carried it, cleaned, or null. */
export function cleanTempoCue(raw) {
  const tokenId = idOf(raw?.tokenId);
  if (!tokenId || !["gain", "spend"].includes(raw?.kind)) return null;
  return { sceneId: idOf(raw?.sceneId), tokenId, kind: raw.kind, amount: Math.max(1, Math.trunc(Number(raw?.amount)) || 1) };
}

/**
 * **THE RECORD AN ACTOR UPDATE'S TEMPO CUE IMPLIES** (`animation/director.mjs`'s `updateActor` hook; the Sovereign's
 * pool cues' shape): one `use` record under `tempo:gain` or `tempo:spend`, at the hunter's token.
 *
 * @param {object} options  an `updateActor` hook's operation options
 * @returns {object[]}
 */
export function tempoRecords(options = {}) {
  const c = cleanTempoCue(options?.[TEMPO_CUE_OPTION] ?? null);
  if (!c) return [];
  const source = { sceneId: c.sceneId, tokenId: c.tokenId };
  return [{
    trigger: "use", kind: "feature", contentVisible: true, sceneId: c.sceneId, identifier: c.kind === "gain" ? TEMPO_GAIN_KEY : TEMPO_SPEND_KEY,
    casting: false, success: true, area: null, source, targets: [], steps: [], risen: [], hold: null
  }];
}

/* ------------------------------------------------------------------ */
/*  The states the class lays                                          */
/* ------------------------------------------------------------------ */

/** The Rowan Ward's flag on the creature warded (`effects/witch-hunter-signs.mjs#ROWAN_FLAG`). */
export const ROWAN_STATE = "whRowan";
/** The Last Hunt's carrier flag (`witch-hunter-standing.mjs#LAST_HUNT_FLAG`). */
export const LAST_HUNT_STATE = LAST_HUNT_FLAG;
/** Expose Weakness's laid Vulnerable (`laid-vulnerable.mjs#VULNERABLE_FLAG`, its `source` naming the feature). */
export const EXPOSED_STATE = VULNERABLE_FLAG;
/** Mountain Bear's minute (04's Bear), the flag its door lays (`wave-3-interfaces.md`). */
export const MOUNTAIN_BEAR_STATE = "whMountainBear";

/**
 * **THE NAMES THE CLASS'S FLAGS GIVE FOR WHAT LAID THEM**, held where `rules/animation-records.mjs#stateEntriesOf`
 * reads them beside the Demon Hunter's: the Rowan Ward and The Last Hunt carry no `source` of their own.
 */
export { WH_STATE_NAMES };

/** The event keys no one feature or talent owns (the census's `VALID_KEYS` takes them). */
export const WH_EVENT_KEYS = Object.freeze([...SIGN_EVENT_KEYS, MEDALLION_SENSE_KEY, MEDALLION_WARN_KEY, ...BREW_KEYS, TEMPO_GAIN_KEY, TEMPO_SPEND_KEY]);

/* ------------------------------------------------------------------ */
/*  Shared looks                                                       */
/* ------------------------------------------------------------------ */

const DRINK = "psfx.consumables.potions-vials.drink-liquid.002";
const CORK = "psfx.consumables.potions-vials.cork-bottle.002";
const GUST = "psfx.cantrips.gust.v1";
const FIRE = "psfx.impacts.magicaleffects.fire";
const COLD = "psfx.impacts.magicaleffects.cold";
const GENERIC = "psfx.impacts.magicaleffects.generic.002.001";
const PSYCHIC = "psfx.impacts.magicaleffects.psychic";
const CAST_FIRE = "psfx.casting.fire.001";
const SHIELD = "psfx.1st-level-spells.shield-spell.intro.v1.003";
const WHISPER_M = "psfx.incantations.whispers.masc.001.forward.standard.003";
const WHISPER_F = "psfx.incantations.whispers.fem.001.forward.standard.002";
const DETECT = "psfx.1st-level-spells.detect-magic.v1.001";
const BOON = "psfx.conditions.boon.002.01";
const BLESS = "psfx.1st-level-spells.bless.v1.001";
const EXPLODE = "psfx.3rd-level-spells.fireball.v1.001.explosion";
const SWING_LIGHT = "psfx.weapon-swooshes.light.v1.group01";
const SWING_HEAVY = "psfx.weapon-swooshes.heavy.v1.group01";
const SLASH = "psfx.impacts.slashing.v1";
const BLUNT = "psfx.impacts.bludgeoning.v1";
const SLEEP = "psfx.1st-level-spells.sleep.v1.001";
const MISTY = "psfx.2nd-level-spells.misty-step.v1.intro.generic";
const CURE = "psfx.1st-level-spells.cure-wounds.v1.001";
const SIGNS_CIRCLE = "psfx.magic-signs.circle.v1.divination.complete";
const SWOOSH_FIRE = "psfx.weapon-swooshes.fire.v1.group01";
const SWOOSH_COLD = "psfx.weapon-swooshes.cold.v1.group01";

const RUNE_AIR = "jb2a.magic_signs.rune.transmutation.complete.yellow";
const RUNE_FIRE = "jb2a.magic_signs.rune.evocation.complete.red";
const RUNE_WARD = "jb2a.magic_signs.rune.abjuration.complete.blue";
const RUNE_CHARM = "jb2a.magic_signs.rune.enchantment.complete.pink";
const RUNE_ASH = "jb2a.magic_signs.rune.necromancy.complete.green";
const RUNE_SIGHT = "jb2a.magic_signs.rune.divination.complete.blue";
const OUTPULSE = "jb2a.extras.tmfx.outpulse.circle.01.normal";
const INFLOW = "jb2a.extras.tmfx.inflow.circle.01";
const OUTFLOW = "jb2a.extras.tmfx.outflow.circle.01";
const GLINT = "jb2a.glint.yellow.many";
const GLINT_FEW = "jb2a.glint.yellow.few";
const BUBBLE = "jb2a.markers.bubble.complete.blue";
const SMOKE = "jb2a.smoke.puff.centered.grey";
const SMOKE_RING = "jb2a.smoke.puff.ring.01.white";
const FLASK = "jb2a.throwable.throw.flask.01.orange";
const MARK = "jb2a.hunters_mark.pulse.01.green";
const MARK_LOOP = "jb2a.hunters_mark.loop.01.green";
const SHELL_IN = "jb2a.shield.01.intro.blue";
const SHELL_LOOP = "jb2a.shield.01.loop.blue";
const RING = "jb2a.fire_ring.500px.red";
const HOLY_CIRCLE = "jb2a.magic_signs.circle.02.abjuration.loop.blue";
const SIGHT_CIRCLE = "jb2a.magic_signs.circle.02.divination.loop.blue";
const WHIRL = "jb2a.melee_generic.whirlwind.01.orange";
const HEAL = "jb2a.healing_generic.200px.green";

/** A Sign drawn at the hunter's hand: what every Sign plays as it is made. */
const sigil = (asset, sound, filter = null) => [
  fx(asset, { place: "source", scale: 0.5, ...(filter ? { filter } : {}) }),
  snd(sound, { volume: 0.45 })
];
/** The Empowered line (**Greater Signs**): a gold ring out from the hunter as the 2 more Energy is spent. */
const empoweredCue = () => cue("use", [
  fx(OUTPULSE, { place: "source", scale: 1.6, filter: "GOLD_B", delay: 150 }),
  snd(BLESS, { volume: 0.4, delay: 150 })
], { state: EMPOWERED_STATE });

/** A drink: the cork drawn, a swallow, and a glow at the drinker in the brew's colour. */
const drink = (asset, { filter = null, scale = 0.7, sound = null } = {}) => ({
  cues: [cue("use", [
    snd(CORK, { volume: 0.4 }),
    fx(asset, { place: "source", scale, delay: 250, ...(filter ? { filter } : {}) }),
    snd(DRINK, { volume: 0.5, delay: 250 }),
    ...(sound ? [snd(sound, { volume: 0.3, delay: 500 })] : [])
  ])]
});

/** An oil drawn along the blade: a glint at the hunter in the oil's colour, and the edge's rasp. */
const oil = (filter = null) => ({
  cues: [cue("use", [
    snd(CORK, { volume: 0.35 }),
    fx(GLINT, { place: "source", scale: 0.8, delay: 200, ...(filter ? { filter } : {}) }),
    snd(SLASH, { volume: 0.35, delay: 250 })
  ])]
});

/** A bomb: a flask thrown to each creature in the blast, and its burst where it breaks. */
const bomb = (burst, sound, extra = []) => ({
  cues: [cue("use", [
    fx(FLASK, { place: "source>target", travel: "stretch", scale: 0.8 }),
    snd(SWING_LIGHT, { volume: 0.35 }),
    ...burst.map(b => fx(b.asset, { place: "targets", scale: b.scale ?? 0.9, waitFor: "travel", overlap: -150, ...(b.filter ? { filter: b.filter } : {}) })),
    snd(sound, { volume: 0.55, waitFor: "travel", overlap: -150 }),
    ...extra
  ])]
});

/* ------------------------------------------------------------------ */
/*  The features, the Signs, the brews and the states                  */
/* ------------------------------------------------------------------ */

const BREW_ROWS = {
  // Elixirs: a swallow and a glow in the brew's colour.
  "liferoot-tonic": drink(HEAL, { sound: CURE }),
  "kingsblood-draught": drink(INFLOW, { filter: "WH_BLOOD", scale: 0.8, sound: BLUNT }),
  "peacebloom-draught": drink("jb2a.healing_generic.200px.yellow", { sound: CURE }),
  "mageroyal-draught": drink("jb2a.healing_generic.200px.blue", { sound: GENERIC }),
  "goldthorn-draught": drink(BUBBLE, { filter: "GOLD_B", scale: 0.8 }),
  "fadeleaf-drops": drink("jb2a.eyes.01.dark_green.few", { scale: 0.6, sound: DETECT }),
  "wintersbite-draught": drink(BUBBLE, { scale: 0.8, sound: COLD }),
  "silverleaf-tonic": drink(OUTFLOW, { filter: "WH_SILVER", scale: 0.8, sound: GENERIC }),
  "gromsblood-draught": drink(INFLOW, { filter: "WH_BLOOD", scale: 0.9, sound: SLASH }),
  "firebloom-cordial": drink("jb2a.flames.01.orange", { scale: 0.5, sound: CAST_FIRE }),
  // Oils: the Order's silver, a hunter's gold, Blindweed's dark.
  "hunters-oil": oil("GOLD_B"),
  "silvering-oil": oil("WH_SILVER"),
  "blindweed-oil": oil("SHADOW_B"),
  // Bombs: each burst in its own look.
  "liquid-fire": bomb([{ asset: "jb2a.explosion.01.orange" }], EXPLODE),
  "sungrass-flash": bomb([{ asset: "jb2a.explosion.03.blueyellow", filter: "STAR" }, { asset: GLINT, scale: 1 }], GENERIC),
  "icecap-flask": bomb([{ asset: "jb2a.ice_spikes.radial.burst.white", scale: 0.7 }], COLD),
  "silver-dust": bomb([{ asset: SMOKE, filter: "WH_SILVER" }, { asset: GLINT, scale: 1 }], PSYCHIC),
  "rowan-dust": bomb([{ asset: SMOKE, filter: "WH_ROWAN" }], PSYCHIC),
  // The Decoction: a darker draught and a heartbeat at the hunter.
  decoction: {
    cues: [cue("use", [
      snd(CORK, { volume: 0.4 }),
      fx(INFLOW, { place: "source", scale: 0.9, filter: "WH_BLOOD", delay: 250 }),
      fx("jb2a.ui.heartbeat.01.green", { place: "source", scale: 0.8, filter: "WH_BLOOD", delay: 500 }),
      snd(DRINK, { volume: 0.5, delay: 250 })
    ])]
  }
};

export const WH_FEATURE_ANIMATIONS = Object.freeze({
  /* ---- 02 §7's Signs ---- */
  // The Gale Sign drawn at the hunter's hand, and a gust along the cone the card set down; the push is the forced
  // move's own picture.
  "gale-sign": {
    cues: [
      cue("use", sigil(RUNE_AIR, GUST, "AIR")),
      cue("region", [fx("jb2a.breath_weapons.cold.cone.blue", { place: "region-cone", travel: "stretch", filter: "AIR", opacity: 0.85 }), snd(GUST, { volume: 0.55 })]),
      empoweredCue()
    ]
  },
  // The Ember Sign drawn at the hunter's hand, and Liquid Fire's flame along the cone; the Scorched is the
  // condition's own picture.
  "ember-sign": {
    cues: [
      cue("use", sigil(RUNE_FIRE, CAST_FIRE)),
      cue("region", [fx("jb2a.breath_weapons.fire.cone.orange.01", { place: "region-cone", travel: "stretch" }), snd(FIRE, { volume: 0.55 })]),
      empoweredCue()
    ]
  },
  // The Rowan Sign: an amber ward rising on the creature warded (the hunter where nothing was targeted), and a
  // faint shell on it for as long as the Ward stands.
  "rowan-sign": {
    cues: [
      cue("use", [
        ...sigil(RUNE_WARD, WHISPER_M, "WH_ROWAN"),
        fx(SHELL_IN, { place: "targets", fallback: "source", scale: 0.9, filter: "WH_ROWAN", delay: 200 }),
        snd(SHIELD, { volume: 0.45, delay: 200 })
      ]),
      empoweredCue()
    ],
    loop: loop("effect", [fx(SHELL_LOOP, { place: "holder", scale: 0.9, filter: "WH_ROWAN", opacity: 0.45 })], { state: ROWAN_STATE })
  },
  // The Ash Sign drawn grey at the hunter's hand; the ring's smoke where the card's Region is laid, and a grey ring
  // of ash smouldering for as long as the Region stands.
  "ash-sign": {
    cues: [
      cue("use", sigil(RUNE_ASH, WHISPER_M, "WH_ASH")),
      cue("region", [fx(SMOKE_RING, { place: "region", area: 0.9, filter: "WH_ASH" }), snd(BLUNT, { volume: 0.4 })]),
      empoweredCue()
    ],
    loop: loop("region", [fx(RING, { place: "region", area: 1, filter: "WH_ASH", opacity: 0.55, below: true })])
  },
  // The Lull Sign drawn at the hunter's hand and a soft thread to each creature named: the attempt, never the
  // Charmed, which waits for the creature's failed Test and is the condition's own picture.
  "lull-sign": {
    cues: [
      cue("use", [
        ...sigil(RUNE_CHARM, WHISPER_F),
        fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "FAERIE", opacity: 0.7, delay: 200 }),
        snd(SLEEP, { volume: 0.35, delay: 200 })
      ]),
      empoweredCue()
    ]
  },

  /* ---- 02 §7's other features ---- */
  // A gold hunter's mark on the creature exposed, and a fainter mark on it for as long as it stays Vulnerable.
  "expose-weakness": {
    cues: [cue("use", [
      fx(MARK, { place: "targets", scale: 0.8, filter: "GOLD_B" }),
      snd(WHISPER_M, { volume: 0.4 })
    ])],
    loop: loop("effect", [fx(MARK_LOOP, { place: "holder", scale: 0.7, filter: "GOLD_B", opacity: 0.6 })], { state: EXPOSED_STATE })
  },
  // A whirl of steel about the hunter; each blow is its own attack card and plays its weapon's strike.
  "whirling-steel": {
    cues: [cue("use", [
      fx(WHIRL, { place: "source", scale: 1.3, filter: "WH_SILVER" }),
      snd(SWING_HEAVY, { volume: 0.6 }),
      snd(SWING_LIGHT, { volume: 0.4, delay: 200 })
    ])]
  },
  // The Medallion's pulse: a silver ring out across its 60 feet (120 across) from the hunter.
  medallion: {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", sizeFt: 120, filter: "WH_SILVER", opacity: 0.6 }),
      fx(GLINT_FEW, { place: "source", scale: 0.6 }),
      snd(SIGNS_CIRCLE, { volume: 0.45 })
    ])]
  },
  // The medallion stirring at the hunter as a spell is cast within 60 feet (the whispered sense, seen only where the
  // whisper is read).
  [MEDALLION_SENSE_KEY]: {
    cues: [cue("use", [fx(GLINT_FEW, { place: "source", scale: 0.6, filter: "WH_SILVER" }), snd(WHISPER_F, { volume: 0.35 })])]
  },
  // The warning pressed: a silver thread from the hunter to the ally warned, and a boon chime on the ally.
  [MEDALLION_WARN_KEY]: {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "WH_SILVER", opacity: 0.8 }),
      fx(GLINT_FEW, { place: "targets", scale: 0.6, delay: 250 }),
      snd(BOON, { volume: 0.45, delay: 250 })
    ])]
  },
  // Read the Trail: a sigil of sight at the hunter as the scene is examined; what it reveals is the GM's.
  [READ_THE_TRAIL_KEY]: {
    cues: [cue("use", [fx(RUNE_SIGHT, { place: "source", scale: 0.55, filter: "WH_SILVER" }), snd(DETECT, { volume: 0.45 })])]
  },
  // The Last Hunt: a silver burst at the hunter as the minute begins, and a circle of silver light under the hunter
  // for as long as the minute lasts.
  "the-last-hunt": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", scale: 2.2, filter: "WH_SILVER" }),
      fx(RUNE_SIGHT, { place: "source", scale: 0.7, filter: "WH_SILVER", delay: 120 }),
      snd(SIGNS_CIRCLE, { volume: 0.55 }),
      snd(SWING_HEAVY, { volume: 0.35, delay: 150 })
    ])],
    loop: loop("effect", [fx(SIGHT_CIRCLE, { place: "holder", scale: 1.3, filter: "WH_SILVER", opacity: 0.45, below: true })], { state: LAST_HUNT_STATE })
  },

  /* ---- Tempo (05 §11's Momentum; 02 §7's Tempo) ---- */
  // A small red rush into the hunter as Tempo rises.
  [TEMPO_GAIN_KEY]: {
    cues: [cue("use", [fx(INFLOW, { place: "source", scale: 0.5, filter: "WH_TEMPO", opacity: 0.8 }), snd(SWOOSH_FIRE, { volume: 0.2 })])]
  },
  // A small red rush out of the hunter as Tempo is spent.
  [TEMPO_SPEND_KEY]: {
    cues: [cue("use", [fx(OUTFLOW, { place: "source", scale: 0.5, filter: "WH_TEMPO", opacity: 0.8 }), snd(SWOOSH_COLD, { volume: 0.2 })])]
  },

  /* ---- 08 §12's brews ---- */
  ...Object.fromEntries(Object.entries(BREW_ROWS).map(([id, row]) => [brewKey(id), row]))
});

/**
 * **04's TALENTS THAT DO SOMETHING ON THE BOARD**, keyed by the talent's slug. Ashen Ring reads the Ash ring's own
 * Region (`ashRingKeyOf`); the rest read a record a talent door writes (`wave-3-interfaces.md` names each), and are
 * spread only once that door has landed (`WH_TALENT_DOORS_PENDING`).
 */
export const WH_TALENT_ANIMATIONS = Object.freeze({
  // The Ash ring with Holy fire in it: the ring's smoke where it is laid, then the grey ring with a gold circle inside
  // it for as long as the Region stands.
  [ASHEN_RING_KEY]: {
    cues: [cue("region", [fx(SMOKE_RING, { place: "region", area: 0.9, filter: "WH_ASH" }), snd(BLESS, { volume: 0.4 })])],
    loop: loop("region", [
      fx(RING, { place: "region", area: 1, filter: "WH_ASH", opacity: 0.55, below: true }),
      fx(HOLY_CIRCLE, { place: "region", area: 0.9, filter: "GOLD_B", opacity: 0.35, below: true })
    ])
  },
  // Firestream: flame bursting up along the Ember Sign's cone where it stays alight, and fire burning in it for as
  // long as the Region stands.
  firestream: {
    cues: [cue("region", [fx("jb2a.breath_weapons.fire.cone.orange.01", { place: "region-cone", travel: "stretch", opacity: 0.8 }), snd(FIRE, { volume: 0.45 })])],
    loop: loop("region", [fx("jb2a.flames.01.orange", { place: "region-scatter", area: [0.15, 0.25], opacity: 0.7, count: 4 })])
  },
  // Bursting Rowan: an amber burst on the creature warded, and a flare on each enemy beside it.
  "bursting-rowan": {
    cues: [cue("use", [
      fx(OUTPULSE, { place: "source", scale: 1.2, filter: "WH_ROWAN" }),
      fx("jb2a.impact.fire.01.orange", { place: "targets", scale: 0.55, delay: 150 }),
      snd(FIRE, { volume: 0.45 })
    ])]
  },
  // Tumble: a puff of dust where the hunter lands after the miss.
  tumble: {
    cues: [cue("use", [fx(SMOKE_RING, { place: "source", scale: 0.6, filter: "WH_ASH" }), snd(MISTY, { volume: 0.35 })])]
  },
  // Second Cut: a silver flash of steel on the same creature as the second blow is taken.
  "second-cut": {
    cues: [cue("use", [fx(GLINT_FEW, { place: "targets", scale: 0.6, filter: "WH_SILVER" }), snd(SWING_LIGHT, { volume: 0.4 })])]
  },
  // Cat's Dance: a quick silver thread from the hunter to the next creature as the blow turns to it.
  "cats-dance": {
    cues: [cue("use", [
      fx("jb2a.energy_strands.range.standard.purple.01", { place: "source>target", travel: "stretch", filter: "WH_SILVER", opacity: 0.7 }),
      snd(SWING_LIGHT, { volume: 0.4 })
    ])]
  },
  // Thunderous Swing: the ground cracking where the creature is pushed to.
  "thunderous-swing": {
    cues: [cue("arrive", [fx("jb2a.impact.ground_crack.01.orange", { place: "step-to", scale: 0.6, filter: "WH_ASH", below: true }), snd(BLUNT, { volume: 0.5 })])]
  },
  // Mountain Bear: a heavy burst of dust at the hunter as the minute begins, and an iron grey aura under the hunter
  // for as long as the minute lasts.
  "mountain-bear": {
    cues: [cue("use", [fx("jb2a.impact.ground_crack.01.orange", { place: "source", scale: 0.9, filter: "WH_ASH", below: true }), snd(SWING_HEAVY, { volume: 0.55 })])],
    loop: loop("effect", [fx("jb2a.template_circle.out_pulse.02.loop.bluewhite", { place: "holder", scale: 1.3, filter: "WH_ASH", opacity: 0.35, below: true })], { state: MOUNTAIN_BEAR_STATE })
  },
  // Second Brewing: a burst of bubbles at the hunter as the doses come back.
  "second-brewing": {
    cues: [cue("use", [fx(BUBBLE, { place: "source", scale: 0.9, filter: "GOLD_B" }), snd(CORK, { volume: 0.4 }), snd(DRINK, { volume: 0.3, delay: 200 })])]
  },
  // Bear's Endurance: an iron grey shell rising on the hunter as the temporary Health lands below half (wave 2d-A).
  "bears-endurance": {
    cues: [cue("use", [fx(SHELL_IN, { place: "source", scale: 0.9, filter: "WH_ASH" }), snd(SHIELD, { volume: 0.45 }), snd(BLUNT, { volume: 0.3, delay: 150 })])]
  }
});

/**
 * **THE TALENT ROWS STILL WAITING ON THEIR DOOR**: empty. Wave 2b landed every door that writes a talent's record
 * (Firestream's Region, Thunderous Swing's push, the Bursting Rowan, Tumble, Second Cut and Cat's Dance event cards,
 * Mountain Bear's and Second Brewing's granted Uses), and the architect review's A3 took the eight off this list
 * (wave 2d-A, D-2133). A talent row written before its door goes on it again until the door lands.
 */
export const WH_TALENT_DOORS_PENDING = Object.freeze([]);

/**
 * The talents' rows less any key handed in as still waiting on its door.
 *
 * @param {string[]} pending
 * @returns {object}
 */
export function liveWhTalentAnimations(pending = WH_TALENT_DOORS_PENDING) {
  const waiting = new Set(pending ?? []);
  return Object.freeze(Object.fromEntries(Object.entries(WH_TALENT_ANIMATIONS).filter(([key]) => !waiting.has(key))));
}

/* ------------------------------------------------------------------ */
/*  The directions (tools/animation/directions.mjs spreads them)        */
/* ------------------------------------------------------------------ */

const BREW_DIRECTION = {
  elixir: "A brief glow at the drinker in the brew's colour as the cork is drawn and the elixir is swallowed.",
  oil: "A brief glint of the oil along the hunter's blade, with the rasp of the edge.",
  bomb: "A flask thrown from the hunter to each creature in the blast and a brief burst where it breaks, in the bomb's own look.",
  decoction: "A brief dark draught swallowed at the hunter and a heartbeat in dark blood."
};

/**
 * **THE DIRECTION FOR EVERY ROW** (`tools/animation/directions.mjs#FEATURE_DIRECTIONS` spreads it): what the picture
 * should look like, and the loop rule's input (a row loops exactly where its direction says the picture stands).
 * Written from 02, 04 and 08's own entries; the lead has not yet read them.
 */
export const WH_DIRECTIONS = Object.freeze({
  "gale-sign": "A brief Sign drawn at the hunter's hand and a gust of wind along the cone the card set down; the push is the forced move's own picture.",
  "ember-sign": "A brief Sign drawn in fire at the hunter's hand and a flame along the cone the card set down; the Scorched is the condition's.",
  "rowan-sign": "An amber ward rising on the creature warded as the Sign is drawn, and a faint shell on it for as long as the Ward stands.",
  "ash-sign": "A grey Sign drawn at the hunter's hand and smoke where the ring is laid, then a ring of ash smouldering for as long as the Region stands.",
  "lull-sign": "A brief Sign drawn at the hunter's hand and a soft thread to each creature named; the Charmed waits for the creature's failed Test.",
  "expose-weakness": "A gold hunter's mark on the creature exposed, and a fainter mark on it for as long as it stays Vulnerable.",
  "whirling-steel": "A brief whirl of steel about the hunter; each blow is its own attack card and plays its weapon's strike.",
  medallion: "A brief silver ring out across the medallion's 60 feet from the hunter as it counts the Studied types.",
  [MEDALLION_SENSE_KEY]: "A brief glint at the medallion as a spell is cast within 60 feet, seen only where the whisper is read.",
  [MEDALLION_WARN_KEY]: "A brief silver thread from the hunter to the ally warned, and a boon chime on the ally.",
  [READ_THE_TRAIL_KEY]: "A brief sigil of sight at the hunter as the scene is examined; what it reveals is the GM's.",
  "the-last-hunt": "A silver ring out from the hunter as the minute begins, and a circle of silver light under the hunter for as long as the minute lasts.",
  [TEMPO_GAIN_KEY]: "A brief small red rush into the hunter as Tempo rises.",
  [TEMPO_SPEND_KEY]: "A brief small red rush out of the hunter as Tempo is spent.",
  ...Object.fromEntries(BREW_IDENTIFIERS.map(id => [brewKey(id), BREW_DIRECTION[brewOf(id).kind]])),
  [ASHEN_RING_KEY]: "Smoke where the Ash ring is laid, then the ring of ash with a gold circle of Holy fire inside it for as long as the Region stands.",
  firestream: "Flame along the Ember Sign's cone where it stays alight, and fire burning in it for as long as the Region stands.",
  "bursting-rowan": "A brief amber burst on the creature warded and a flare on each enemy beside it.",
  tumble: "A brief puff of dust where the hunter lands after the miss.",
  "second-cut": "A brief silver glint of steel on the same creature as the second blow is taken.",
  "cats-dance": "A brief silver thread from the hunter to the next creature as the blow turns to it.",
  "thunderous-swing": "A brief crack of the ground where the creature is pushed to.",
  "mountain-bear": "A heavy crack of dust at the hunter as the minute begins, and an iron grey aura under the hunter for as long as the minute lasts.",
  "second-brewing": "A brief burst of bubbles at the hunter as the doses come back.",
  "bears-endurance": "A brief iron grey shell rising on the hunter as the temporary Health lands."
});

/** The directions of every row the table spreads now: the features' and the talents' whose door has landed. */
export function liveWhDirections(pending = WH_TALENT_DOORS_PENDING) {
  const waiting = new Set(pending ?? []);
  return Object.freeze(Object.fromEntries(Object.entries(WH_DIRECTIONS).filter(([key]) => !waiting.has(key))));
}

/* ------------------------------------------------------------------ */
/*  What each key's door fires, and what has no row                    */
/* ------------------------------------------------------------------ */

/**
 * **WHAT EACH KEY'S DOOR FIRES** (the contract, as data; `DH_RECORDS`' shape): the triggers, states and bindings
 * `animation-table.test.mjs#firesOf` adds for these keys, a `door` naming who writes the record, and the `marker` the
 * census looks for in `module/` outside this file. A talent's contract is held only once its door has landed.
 */
const r = (triggers, door, marker, { states = [], bindings = [] } = {}) =>
  Object.freeze({ triggers: Object.freeze(triggers), states: Object.freeze(states), bindings: Object.freeze(bindings), door, marker });

export const WH_RECORDS = Object.freeze({
  "gale-sign": r(["use", "region"], "the Signs' card records the Sign (whSign), and afterSignCard sets the cone down under the Sign's key", "featureKey: signAnimationKey(plan.sign)", { states: [EMPOWERED_STATE] }),
  "ember-sign": r(["use", "region"], "the Signs' card records the Sign (whSign), and afterSignCard sets the cone down under the Sign's key", "featureKey: signAnimationKey(plan.sign)", { states: [EMPOWERED_STATE] }),
  "rowan-sign": r(["use", "effect"], "the Signs' card records the Sign, and rowanHere lays the Ward under ROWAN_FLAG", "[ROWAN_FLAG]: { by: hunter.uuid, value }", { states: [ROWAN_STATE, EMPOWERED_STATE], bindings: ["effect"] }),
  "ash-sign": r(["use", "region"], "landAsh places the ring's Region keyed ASH_RING_KEY", "featureKey: ASH_RING_KEY", { states: [EMPOWERED_STATE], bindings: ["region"] }),
  "lull-sign": r(["use"], "the Lull Sign's card records the Sign, Empowered or not", "empowered: plan.empower === true", { states: [EMPOWERED_STATE] }),
  "expose-weakness": r(["use", "effect"], "exposeHere lays the Vulnerable whose source names Expose Weakness", "[VULNERABLE_FLAG]: { types: [judged.damage], source: EXPOSE_WEAKNESS }", { states: [EXPOSED_STATE], bindings: ["effect"] }),
  "the-last-hunt": r(["use", "effect"], "startLastHunt lays the minute's carrier under LAST_HUNT_FLAG", "[LAST_HUNT_FLAG]: { by: actor.uuid", { states: [LAST_HUNT_STATE], bindings: ["effect"] }),
  [MEDALLION_SENSE_KEY]: r(["use"], "postSense whispers the sense card (kind witchHunterCard, sense)", "sense: { by: hunter.uuid"),
  [MEDALLION_WARN_KEY]: r(["use"], "warnFromCard posts the warning's event card under MEDALLION_WARN_KEY", "featureKey: MEDALLION_WARN_KEY"),
  [READ_THE_TRAIL_KEY]: r(["use"], "readTheTrail posts its card (kind witchHunterCard, trail)", "kind: \"witchHunterCard\", trail: record"),
  [TEMPO_GAIN_KEY]: r(["use"], "writePoolsNow carries the Tempo cue on the write that moves the Tempo", "[TEMPO_CUE_OPTION]: tempoMoved"),
  [TEMPO_SPEND_KEY]: r(["use"], "writePoolsNow carries the Tempo cue on the write that moves the Tempo", "[TEMPO_CUE_OPTION]: tempoMoved"),
  ...Object.fromEntries(BREW_IDENTIFIERS.map(id => [brewKey(id), brewOf(id).kind === "bomb"
    ? r(["use"], "throwBomb posts the bomb's feature card keyed brew:<identifier>", "featureKey: `brew:${stamped.identifier}`")
    : r(["use"], "useBrew posts the drink's or the oil's card (kind whBrewUse) naming the brew", "kind: \"whBrewUse\", identifier")])),
  [ASHEN_RING_KEY]: r(["region"], "the Ash ring's Region carries Ashen Ring's Holy against row, which the records key ashen-ring", "ashRingKeyOf(flags)", { bindings: ["region"] }),
  firestream: r(["region"], "Firestream's lingering cone placed with featureKey firestream", "featureKey: \"firestream\"", { bindings: ["region"] }),
  "bursting-rowan": r(["use"], "Bursting Rowan's burst posted as a feature event", "featureKey: \"bursting-rowan\""),
  tumble: r(["use"], "Tumble's free step posted as a feature event keyed by the evade row's identifier (chat.mjs#evadeFromCard)", "featureKey: evade.identifier"),
  "second-cut": r(["use"], "Second Cut's paid strike posted as a feature event keyed by the offer's identifier (chat.mjs#extraStrikeFromCard)", "featureKey: offer.identifier"),
  "cats-dance": r(["use"], "Cat's Dance's paid strike posted as a feature event keyed by the offer's identifier (chat.mjs#extraStrikeFromCard)", "featureKey: offer.identifier"),
  "thunderous-swing": r(["arrive"], "Thunderous Swing's push through forceMove with its key", "key: \"thunderous-swing\""),
  "mountain-bear": r(["use", "effect"], "Mountain Bear's granted Use posts its feature card, and its minute is laid under whMountainBear", "[MOUNTAIN_BEAR_FLAG]: { tier: tierOf(actor), by: actor.uuid }", { states: [MOUNTAIN_BEAR_STATE], bindings: ["effect"] }),
  "second-brewing": r(["use"], "Second Brewing's granted Use posts its feature card, filed under the granting talent (featureKeyOf)", "onUse: { wh: { talent: \"secondBrewing\" } }"),
  "bears-endurance": r(["use"], "whWhenStruck posts Bear's Endurance's event card once the temporary Health has landed", "featureKey: BEARS_ENDURANCE.identifier")
});

/**
 * **WHAT HAS NO ROW, AND WHY**: every feature and talent of the class that plays nothing of its own, each with its
 * quiet reason. A passive changes a number, a Test or a dialog line; a door that already plays another row says which.
 */
export const WH_NO_ROW = Object.freeze({
  /* 02 §7 */
  "field-brews": "its Use opens the Prepare window; each brew made plays its own row when it is used (`brew:*`)",
  "tome-of-silver-and-ash": "the learning Test is an Investigation roll at a rest, a line on the card; nothing on the board",
  studied: "passive: extra damage, Tempo and a Boon against a Studied type, numbers on the card; the Tempo's rise plays its own cue",
  signs: "the card is filed under the Sign used (`gale-sign`, `ember-sign`, `rowan-sign`), each a row of its own",
  "extra-attack": "two attack rolls in one Attack, each playing its weapon's strike",
  decoctions: "passive: the Decoction row in the Prepare window; the Decoction drunk plays its own row (`brew:decoction`)",
  "greater-signs": "the Empowered line on each Sign's chooser; each Sign's row plays its `empowered` cue",
  /* 04's Wolf */
  "extra-measure": "passive: one more dose a rank in the Prepare window",
  "field-notes": "passive: a Boon on the Tome's learning Test, a line on its dialog",
  "potent-brews": "passive: more Health and bomb damage, numbers on the brew's card; the brew plays its own row",
  "sharper-oils": "passive: Hunter's oil's damage, a number on the attack card",
  "wide-blast": "passive: a bomb's reach and radius, numbers on its card; the bomb plays its own row",
  "practiced-hands": "a brew used as a free action; the brew plays its own row",
  "lasting-brews": "passive: an elixir's minute, its carrier's span",
  forewarned: "passive: one more Studied type a rank in the Prepare window",
  "cluster-bomb": "a second bomb thrown as a free action; that bomb plays its own row",
  "refined-decoctions": "passive: the Decoction's count against the Toxicity limit",
  "seasoned-blood": "passive: the Toxicity limit, a number on the Hunter panel",
  /* 04's Gryphon */
  "far-signs": "passive: a Sign's cone and reach, the area the Sign's own row draws",
  "searing-script": "passive: the Ember Sign's damage, a number on its card",
  "quick-script": "passive: the first Sign's Energy, a number on the chooser",
  "shattering-gale": "its damage rides the Gale Sign's card, whose own row plays (`gale-sign`)",
  "deep-lull": "passive: the Charmed's span, the condition's own",
  "living-rowan": "passive: the Rowan Ward's value, which the Ward's own row draws (`rowan-sign`)",
  "twin-signs": "passive: the second Sign's Energy, a number on the chooser",
  "holy-ember": "the Ember Sign's damage turned Holy on its card; the Sign's own row plays (`ember-sign`)",
  "sign-of-the-order": "passive: every Sign's Energy, a number on the chooser",
  /* 04's Bear */
  "bears-hide": "passive: plate without a Bane and no Encumbering, numbers on the sheet",
  "bears-weight": "passive: two-handed damage, a number on the attack card",
  "iron-stomach": "passive: SL on a Body Resilience Test, a number on the roll",
  "bears-wrath": "a Tempo rise when hit, which plays the Tempo's own cue (`tempo:gain`)",
  unbowed: "passive: a Boon and a refused forced move, lines on the roll and the move",
  "splitting-blow": "passive: Sunder's Tempo price",
  "crushing-sweep": "passive: Whirling Steel's Tempo price; its own row plays (`whirling-steel`)",
  "steel-guard": "a Tempo rise on a successful Parry, which plays the Tempo's own cue (`tempo:gain`)",
  "ursine-fury": "passive: the Tempo cap, a number on the Hunter panel",
  /* 04's Cat */
  "cats-step": "passive: Speed on the sheet",
  "feline-reflexes": "passive: Defense on the sheet",
  "lethal-edge": "passive: the Critical Injury range, the attack card's own",
  "hunters-riposte": "passive: the Riposte's Tempo price and damage, numbers on its card",
  "hobbling-cut": "its Slowed is the condition's own picture",
  "leaping-strike": "passive: a damage line on the next attack card",
  "night-eyes": "passive: a Boon on Stealth and damage from hiding, numbers on the roll and the card",
  "kill-rhythm": "a Tempo rise on a Critical Injury, which plays the Tempo's own cue (`tempo:gain`)",
  "nine-lives": "passive: the half on a Reflex Resilience Test, a number on the card"
});
