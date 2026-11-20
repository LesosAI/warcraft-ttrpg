/**
 * **THE SAN'LAYN'S BLOOD, OUTSIDE THE REST** (02 §5's thirteenth people, 08 §12's Blood vial; the
 * San'layn plan's A.6 items 4 and 9; D-1148 to D-1150). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Two doors read this module:
 * - **Open Vein's unit** (02 §5: *a living creature that fails gives you 1 unit of blood for your
 *   next Short Rest*): the bite's Resist failing on a living creature adds 1 to the San'layn's
 *   feedings since its last rest (`rules/rest.mjs#BLOOD_SINCE_REST_FLAG`), once a creature a card.
 *   No vial is filled: the count records the unit (the plan's A.6 item 4).
 * - **Fill with blood** (08 §12: *A Vial, empty filled from a source the GM approves becomes a
 *   Blood vial*): a carried Vial, empty, filled on the GM's word through `azeroth-rpg.bloodFill`.
 */

/** The gear pack's identifiers: 08 §17's empty vial and 08 §12's Blood vial (the parser's slugs). */
export const VIAL_EMPTY = "vial-empty";
export const BLOOD_VIAL = "blood-vial";

/**
 * **WHERE BLOOD COMES FROM** (08 §12's *Where blood comes from*): the sources a vial may be filled
 * from, each the key of its row's words. *A downtime week* is not here: its blood fills no vial.
 * The GM approves every one (the lead, R3: *"from a source a GM approves"*).
 */
export const BLOOD_SOURCES = Object.freeze(["donor", "sleeper", "beast", "butcher", "apothecary", "slain", "globe"]);

/**
 * Why a vial may not be filled, or null.
 *
 * @param {{bloodFed?: boolean, item?: {type?: string, system?: object}|null, owned?: boolean,
 *   source?: string|null, gmAbsent?: boolean}} o
 * @returns {string|null}  an i18n key under `AZEROTH.BloodFill.Refuse`
 */
export function fillRefusal({ bloodFed = false, item = null, owned = true, source = null, gmAbsent = false } = {}) {
  if (bloodFed !== true) return "AZEROTH.BloodFill.Refuse.notBloodFed";
  if (!item || item.type !== "gear" || item.system?.identifier !== VIAL_EMPTY) return "AZEROTH.BloodFill.Refuse.notVial";
  if (owned !== true) return "AZEROTH.BloodFill.Refuse.notOwned";
  if (!BLOOD_SOURCES.includes(source)) return "AZEROTH.BloodFill.Refuse.noSource";
  // The GM approves every source, so with no GM online there is nobody to ask: refused before
  // anything is written (`rules/gm-writes.mjs#gmAbsentFor`, asked by the door).
  if (gmAbsent === true) return "AZEROTH.BloodFill.Refuse.noGM";
  return null;
}

/**
 * **WHETHER A RESIST ON THIS CARD GIVES THE BITER A UNIT** (02 §5's Open Vein; D-1149). The row is
 * the talent's own (`RACE_TALENT_EFFECTS.sanlayn["open-vein"].bloodUnit`), read off the biter's
 * talent, never off the card.
 *
 * @param {{row?: {living?: boolean, onFail?: boolean, units?: number}|null, failed?: boolean,
 *   living?: boolean, given?: string[], resister?: string|null}} o  `given` the creatures the card
 *   has already given a unit for, by uuid
 * @returns {number}  the units due, 0 for none
 */
export function bloodUnitDue({ row = null, failed = false, living = false, given = [], resister = null } = {}) {
  if (!row || !resister) return 0;
  if (row.onFail !== false && failed !== true) return 0;
  if (row.living !== false && living !== true) return 0;
  if ((given ?? []).includes(resister)) return 0;
  return Math.max(0, Math.trunc(Number(row.units ?? 1)) || 0);
}
