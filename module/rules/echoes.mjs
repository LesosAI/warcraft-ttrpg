/**
 * **04's ECHO OF THE BLADE** (the Chronomancer's Guardian of Time, stage 2c; the lead: *"tier
 * 2 talent while wielding a shield. this should be a chance of an extra attack on a 18-20 as
 * an echo"*, *"if an echo of the blade attack rolls a 16-17 it triggers again. and the same
 * for that attack if the roll is 14-15. then the echo stops."*, and on the bands: **lowering
 * floor**). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * *While you wield a shield, when your Attack Test's d20 shows 18, 19 or 20, make one more
 * attack roll, an echo, against the same creature or another within reach, as part of the
 * same Attack. When that echo's d20 shows 16 or higher, it echoes again, and when the second
 * echo's d20 shows 14 or higher, it echoes a third time. A third echo does not echo.*
 *
 * A roll's DEPTH is 0 for the Attack Test itself, 1 for the first echo, 2 for the second and
 * 3 for the third. `echoBand(depth)` is the band the roll at that depth must show for one more
 * echo, and null at depth 3. Each echo is one more ROLL of the same Attack (05's one Attack a
 * round holds; D-160's Extra Attack shape, D-704), posted on its own card through
 * `budget: "none"` (`applications/actions.mjs#rollWithDialog`, the door), its depth on the
 * card's strike record.
 */

/** The talent's key, the slug of its name (`animation-records.mjs#featureKeyOf`). */
export const ECHO_KEY = "echo-of-the-blade";

/** The floor of the band at each depth, as 04 prints it: 18, then 16, then 14. */
export const ECHO_FLOORS = Object.freeze([18, 16, 14]);

/** The highest face a d20 shows. */
const TOP = 20;

/**
 * The band the roll at `depth` must show for one more echo, or null where it echoes no more.
 *
 * @param {number} depth  0 the Attack Test, 1 to 3 an echo
 * @param {number[]} [floors]  a row's own floors, else 04's
 * @returns {{min: number, max: number}|null}
 */
export function echoBand(depth = 0, floors = ECHO_FLOORS) {
  const d = Math.trunc(Number(depth));
  if (!Number.isInteger(d) || d < 0) return null;
  const list = Array.isArray(floors) && floors.length ? floors : ECHO_FLOORS;
  const floor = Number(list[d]);
  if (!Number.isFinite(floor)) return null;
  return { min: floor, max: TOP };
}

/**
 * Whether a roll at `depth` whose d20 shows `natural` gives one more echo.
 *
 * @param {number|null} natural
 * @param {number} depth
 * @param {number[]} [floors]
 */
export function echoes(natural, depth = 0, floors = ECHO_FLOORS) {
  const band = echoBand(depth, floors);
  const face = Math.trunc(Number(natural));
  return Boolean(band) && Number.isInteger(face) && face >= band.min && face <= band.max;
}

/**
 * **WHETHER THE ROLLER HOLDS THE ECHO NOW**: the talent's row, taken, and a shield carried
 * (*While you wield a shield*). Answers `{name, identifier, floors}` or null.
 *
 * @param {{talents?: Array, shield?: boolean}} o
 * @param {Function} rowOf  the talent table's lookup
 */
export function echoHeld({ talents = [], shield = false } = {}, rowOf) {
  if (shield !== true) return null;
  for (const t of talents ?? []) {
    if (!(Math.trunc(Number(t?.taken) || 0) > 0)) continue;
    const row = rowOf?.(t.className, t.identifier, t.race ?? null)?.echo ?? null;
    if (!row) continue;
    const floors = Array.isArray(row.floors) && row.floors.length ? row.floors.map(Number) : [...ECHO_FLOORS];
    return { name: t.name, identifier: t.identifier, floors };
  }
  return null;
}

/**
 * Whether an attack card's roll may echo: an Attack Test that is an attack (never a Parry,
 * whose *meet or beat* is no attack) at a depth the floors still reach.
 *
 * @param {{kind?: string, parry?: boolean, depth?: number, natural?: number|null}} o
 * @param {number[]} [floors]
 */
export function rollEchoes({ kind = "attack", parry = false, depth = 0, natural = null } = {}, floors = ECHO_FLOORS) {
  if (kind !== "attack" || parry === true) return false;
  return echoes(natural, depth, floors);
}
