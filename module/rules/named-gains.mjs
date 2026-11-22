/**
 * **A POOL THAT RISES THROUGH A NAMED DOOR ALONE** (the San'layn and Sovereign plan's C3 and
 * B.12 finding 4). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Five pools may rise only where a door names its source, and each had (or would have had) its
 * own copy of the same refusal beside the others in `AzerothActor#writePoolsNow`:
 *
 * | Pool | Kind | The rule | Sources |
 * |---|---|---|---|
 * | **Runic Power** (the Death Knight) | Momentum | *"Runic Power is only gained by consuming runes"* (D-921) | `RUNIC_GAIN_SOURCES` |
 * | **Essence** (the Necromancer) | Momentum | *You gain Essence in no other way unless a feature, talent or spell says so* | `ESSENCE_GAIN_SOURCES` |
 * | **Tribute** (the Sovereign) | Momentum | *You gain Tribute in no other way unless a feature, talent or spell says so* (02 §7) | `TRIBUTE_GAIN_SOURCES` |
 * | **Vitae** (the Sovereign) | Power | *"Feeding only"* (the lead, R9) | `VITAE_GAIN_SOURCES` |
 * | **Hatred** (the Demon Hunter) | Momentum | *Hitting, SL 2 and winning an Opposed Test give you none* (the Demon Hunter plan's class entry) | `HATRED_GAIN_SOURCES` |
 *
 * This module is the ONE table and the ONE refusal. `runes.mjs` and `essence.mjs` re-export their
 * lists and keep their named refusals as wrappers over `namedGainRefusal`, so every reader that
 * named them before reads the same rule. A fall or no change is never judged; a rise needs a
 * source on the pool's list, and `hand` is a GM's.
 */

/** The Death Knight's Runic Power (D-921, D-1019): a rune spent, Feeds on Blows, a refund, a GM's hand, Killing Machine. */
export const RUNIC_GAIN_SOURCES = Object.freeze(["rune", "feedsOnBlows", "refund", "hand", "killingMachine"]);

/** The Necromancer's Essence: a death, Soul Cage, Soul Rip, a refund, a GM's hand. */
export const ESSENCE_GAIN_SOURCES = Object.freeze(["death", "soulCage", "soulRip", "refund", "hand"]);

/**
 * **THE SOVEREIGN'S TRIBUTE** (02 §7; the lead, R17: *"the claw attacks should give tribute regardless
 * of once per round. The target failing any resilience test from the Sovereign should provide 1
 * tribute once per round"*). The two lanes, and every feature, talent and spell that names Tribute
 * as a gain (the plan's B.4 *Named* row), each by its own word so a census can read the door:
 *
 * - `claw` - your claws hit your prey (no round limit);
 * - `will` - your prey fails a Resilience Test against your spell, feature or talent (once a round);
 * - `pursuit` - Unending Pursuit, when your prey dies;
 * - `homage` - Homage, a cursed creature other than your prey failing;
 * - `beneathMe` - Beneath Me, an attack that misses you;
 * - `unmarred` - Unmarred, temporary Health that absorbs a whole blow;
 * - `lastDraught` - Last Draught's feeding at a death;
 * - `kiss` - Sovereign's Kiss on your prey;
 * - `aortic` - Aortic Unraveling's kill, Tribute up to your cap;
 * - `refund` - a withdrawn use giving back a price it took;
 * - `hand` - a GM's own hand on the sheet. A player's hand is refused.
 */
export const TRIBUTE_GAIN_SOURCES = Object.freeze([
  "claw", "will", "pursuit", "homage", "beneathMe", "unmarred", "lastDraught", "kiss", "aortic", "refund", "hand"
]);

/**
 * **THE SOVEREIGN'S VITAE** (the lead, R9: *"Feeding only"*; the plan's V5):
 *
 * - `feed` - a feeding: The Blood Royal, Latch On's free feeding, Drink Deep, Last Draught, the
 *   Blood Monarch form's claw-hit feeding, Embrace of the Vampyr;
 * - `vial` - a Blood vial drunk (2 x tier);
 * - `source` - one of 08 §12's blood sources a GM approved, recorded by hand on the GM's door;
 * - `refund` - a withdrawn use giving back a price it took;
 * - `hand` - a GM's own hand on the sheet. A player's hand is refused.
 *
 * A rest, a drink, a Mana draught, Hymn of Hope and every other Mana effect name none of these, so
 * nothing but a feeding refills it.
 */
export const VITAE_GAIN_SOURCES = Object.freeze(["feed", "vial", "source", "refund", "hand"]);

/**
 * **THE DEMON HUNTER'S HATRED** (the Demon Hunter plan's class entry: *Gain Hatred equal to 1 plus the
 * tier of the spell each time you cast one, 1 each time you use Beyond Limits, and Hatred wherever a
 * feature or talent says so. Hitting, SL 2 and winning an Opposed Test give you none.*), each door by
 * its own word so a census can read it:
 *
 * - `cast` - a spell cast, 1 plus its tier, on a successful and a failed Casting Test (C63, Q7);
 * - `limit` - Beyond Limits, 1 once a turn;
 * - `devour` - a soul devoured: Devour Soul's demon, Swallow Their Magic, Feast of Souls, a
 *   Crystalized Soul spent for Hatred, Devour the Spell;
 * - `rend` - Mana Rend's hit;
 * - `flows` - Taste of Power's fill to the cap;
 * - `prepared` - I Have Prepared's fill to 13;
 * - `refund` - a withdrawn use giving back a price it took;
 * - `hand` - a GM's own hand on the sheet. A player's hand is refused.
 */
export const HATRED_GAIN_SOURCES = Object.freeze(["cast", "limit", "devour", "rend", "flows", "prepared", "refund", "hand"]);

/** The table: pool key (`AZEROTH.poolTypes`) to the sources a rise may name. */
export const NAMED_GAIN_SOURCES = Object.freeze({
  runicPower: RUNIC_GAIN_SOURCES,
  essence: ESSENCE_GAIN_SOURCES,
  tribute: TRIBUTE_GAIN_SOURCES,
  vitae: VITAE_GAIN_SOURCES,
  hatred: HATRED_GAIN_SOURCES
});

/**
 * The write option a door names its source under, by pool: `{runicGain: "rune"}` on a Runic Power
 * rise, `{vitaeGain: "feed"}` on a Vitae rise. One option a pool, so a write that raises two pools
 * (a refund) names each.
 */
export const GAIN_OPTION = Object.freeze({
  runicPower: "runicGain",
  essence: "essenceGain",
  tribute: "tributeGain",
  vitae: "vitaeGain",
  hatred: "hatredGain"
});

/** The lang key prefix a refusal is said in, by pool: the prefix, then the reason (`unsourced`, `hand`). */
export const GAIN_WORDS = Object.freeze({
  runicPower: "AZEROTH.Runes.Refuse.gain.",
  essence: "AZEROTH.Essence.Refuse.gain.",
  tribute: "AZEROTH.Tribute.Refuse.gain.",
  vitae: "AZEROTH.Vitae.Refuse.gain.",
  hatred: "AZEROTH.Hatred.Refuse.gain."
});

/** Whether a pool rises only through a named door. */
export function isNamedGainPool(pool) {
  return typeof pool === "string" && Object.hasOwn(NAMED_GAIN_SOURCES, pool);
}

/** Every option key `writePoolsNow` reads and never sends (the five of `GAIN_OPTION`). */
export const GAIN_OPTION_KEYS = Object.freeze(Object.values(GAIN_OPTION));

/**
 * The source a write names for a pool, off the write's options.
 *
 * @param {string} pool
 * @param {Record<string, unknown>} [options]
 * @returns {string|null}
 */
export function gainSourceFor(pool, options = {}) {
  const key = GAIN_OPTION[pool];
  const v = key ? options?.[key] : null;
  return typeof v === "string" && v ? v : null;
}

const int = v => Math.trunc(Number(v)) || 0;

/**
 * **WHY THIS WRITE MAY NOT RAISE THE POOL**, or null where it may. A pool not on the table is
 * never judged; a fall or no change is never judged; a rise needs a source on the pool's list,
 * and `hand` needs a GM.
 *
 * @param {string} pool  a key of `NAMED_GAIN_SOURCES`
 * @param {{before?: number, after?: number, source?: string|null, gm?: boolean}} o
 * @returns {"unsourced"|"hand"|null}
 */
export function namedGainRefusal(pool, { before = 0, after = 0, source = null, gm = false } = {}) {
  if (!isNamedGainPool(pool)) return null;
  if (!(int(after) > int(before))) return null;
  if (!NAMED_GAIN_SOURCES[pool].includes(source)) return "unsourced";
  if (source === "hand" && gm !== true) return "hand";
  return null;
}

/** The lang key a refusal is said in. */
export function namedGainWords(pool, reason) {
  return `${GAIN_WORDS[pool] ?? GAIN_WORDS.runicPower}${reason}`;
}

/** Options naming one source for every pool on the table: a GM's hand, a refund. */
export function everyGain(source) {
  return Object.fromEntries(GAIN_OPTION_KEYS.map(k => [k, source]));
}
