/**
 * The Shaman's totems and the ground each one holds (02 §7, D-708).
 * Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 02 §7's Totems table is the authority and **nothing here invents a number**.
 * Every row names the distance the totem reaches in its own effect sentence —
 * *Up to 5 targets within 30 feet of the totem gain 1 AP*, *Up to 5 targets
 * within 15 feet add 1 to their weapon Attack Tests* — so the radius is READ
 * OFF THE ROW rather than kept in a second table here. A hand table of seven
 * numbers is exactly the shape that drifts when the chapter is retuned, and
 * `totems.test.mjs` reads the chapter to prove this one cannot.
 *
 * **What this file DOES hold is the element**, which the chapter does not
 * state anywhere: the token art does. `assets/art/totems/manifest.json`
 * assigns Stoneskin and Tremor to Earth, Healing Stream and Mana Tide to
 * Water, Windfury and Grounding to Air, and Searing to Fire, and
 * `assets/MANIFEST.md` records that the ring on each token is enamelled to
 * match — *ochre for Earth, turquoise for Water, blue for Air, and Fire
 * retains Searing's red*. The aura takes that colour so the ground a totem
 * holds is the colour of the totem holding it.
 *
 * `ELEMENT_COLORS` was MEASURED off the art rather than picked to taste: the
 * modal enamel pixel in the outer annulus of each of the seven 512px tokens
 * in `assets/art/totems/tokens/`, which comes back identical for both members
 * of every pair. The files are gitignored (CLAUDE.md §1), so the test cites
 * the manifest and never reads them.
 *
 * **What a totem DOES is not automated** (D2 §12). The aura says where the
 * effect reaches; whether a target inside it takes the Armor Point, the Boon
 * or the Health is the table's call, exactly as the thirty feet a totem is
 * cast through has always been (D-674).
 */

/**
 * 02 §7's seven totems, to the element their token art enamels
 * (`assets/art/totems/manifest.json`). The keys are the chapter's own names,
 * without the word *Totem* — the class table writes `Stoneskin` and the
 * bestiary block writes `Stoneskin Totem`, and `bareName` reconciles them.
 */
export const TOTEM_ELEMENTS = Object.freeze({
  "Stoneskin": "earth",
  "Searing": "fire",
  "Healing Stream": "water",
  "Windfury": "air",
  "Grounding": "air",
  "Tremor": "earth",
  "Mana Tide": "water"
});

/**
 * The enamel on the ring of each totem's token, measured off
 * `assets/art/totems/tokens/*.png` (see the note above).
 *
 *  - `earth`  ochre      — Stoneskin, Tremor
 *  - `water`  turquoise  — Healing Stream, Mana Tide
 *  - `air`    blue       — Windfury, Grounding
 *  - `fire`   red        — Searing, whose original art the other six copy
 */
export const ELEMENT_COLORS = Object.freeze({
  earth: "#b06b11",
  water: "#11b0aa",
  air: "#116fb0",
  fire: "#b03411"
});

/**
 * *within 30 feet*, *within 15 ft*. 02 writes the word out and 07 §9's own
 * grammar abbreviates it, so both are read; the FIRST distance in the row is
 * the one the totem reaches, which is true of all seven.
 */
const WITHIN = /\bwithin\s+(\d+)\s*(?:feet|foot|ft)\b/i;

/** Strip any markup and the trailing word *Totem*, so both spellings key alike. */
export function bareName(name = "") {
  return String(name ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+Totems?$/i, "")
    .trim();
}

/** Is this one of 02 §7's seven? Takes `Searing` or `Searing Totem` alike. */
export function isTotemName(name = "") {
  return Object.hasOwn(TOTEM_ELEMENTS, bareName(name));
}

/** The element a totem belongs to, or null for one 02 does not name. */
export function elementOf(name = "") {
  return TOTEM_ELEMENTS[bareName(name)] ?? null;
}

/**
 * The ground a totem holds, from its row in 02 §7's table.
 *
 * @param {object} totem
 * @param {string} totem.name         `Stoneskin`, or `Stoneskin Totem`.
 * @param {string} totem.description  The row's effect text, verbatim.
 * @returns {{feet: number, element: string|null, color: string|null,
 *            name: string, areaText: string} | null}
 *   `null` where the row names no distance, which is the honest answer for a
 *   totem that reaches nowhere — the caller then plants it and draws nothing.
 */
export function totemAura({ name = "", description = "" } = {}) {
  const feet = radiusOf(description);
  if (feet === null) return null;
  const element = elementOf(name);
  return {
    feet,
    element,
    color: element ? ELEMENT_COLORS[element] ?? null : null,
    name: bareName(name),
    // 07 §9's own phrasing, so `rules/areas.mjs#areaFor` reads it with no
    // second grammar and `canvas/regions.mjs` attaches the Region to the
    // token it is centred on. *Centered on you* is the totem's own you.
    areaText: `A ${feet} ft radius centered on you`
  };
}

/** The distance a row names, in feet, or null. */
export function radiusOf(description = "") {
  const match = String(description ?? "").match(WITHIN);
  if (!match) return null;
  const feet = Number(match[1]);
  return Number.isFinite(feet) && feet > 0 ? feet : null;
}
