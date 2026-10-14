/**
 * Copper as the chapter prints it (08 §2, D-422): 100 copper make a silver
 * and 100 silver a gold. `6000` → `60s`, `24000` → `2g 40s`, `751` → `7s 51c`.
 *
 * Presentation only; the arithmetic stays in copper everywhere else. Lived on
 * the Forge until the creator's purse and the Gear tab needed it too (D-636),
 * and 08 §2 is why it now reaches every surface that prints a price (D-672):
 * *prices are quoted in the coin a shop would actually name — coppers for
 * rope and bread, silver for weapons and armor, gold for a war mount or a
 * boat.* A longsword is `2s 40c`, never `240`.
 */
export function coins(copper) {
  if (copper === null || copper === undefined) return null;
  const n = Math.trunc(Number(copper)) || 0;
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const g = Math.floor(abs / 10000);
  const s = Math.floor((abs % 10000) / 100);
  const c = abs % 100;
  const parts = [];
  if (g) parts.push(`${g}g`);
  if (s) parts.push(`${s}s`);
  if (c || !parts.length) parts.push(`${c}c`);
  return sign + parts.join(" ");
}

/**
 * The other direction, so a price can be TYPED the way it is printed: the
 * sheet's Cost field takes `2g 40s`, `7s 51c`, `24s` or a bare `2400`, and
 * stores copper either way.
 *
 * A bare number is copper, which is what the field held before this existed
 * and what every pack source still carries. The book's own prose forms are
 * read too — *2 silver 40*, *1 silver 20* — because that is how 08 §2 writes
 * a wage, and a trailing number after a unit is the next unit down.
 *
 * @param {string|number|null} text
 * @returns {number|null} copper, or null where there is no number at all
 */
export function copperFrom(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return Number.isFinite(text) ? Math.trunc(text) : null;
  const raw = String(text).trim().replace(/,/g, "");
  if (!raw) return null;
  // A bare number is copper: the stored shape, and every pack source.
  if (/^[-−+]?\d+$/.test(raw)) return Math.trunc(Number(raw.replace("−", "-")));

  const negative = /^[-−]/.test(raw);
  const body = raw.replace(/^[-−+]\s*/, "");
  const UNITS = { g: 10000, gold: 10000, gp: 10000, s: 100, silver: 100, sp: 100, c: 1, copper: 1, cp: 1 };
  const token = /(\d+)\s*(gold|silver|copper|gp|sp|cp|g|s|c)?/gi;
  let total = 0;
  let seen = false;
  let last = null;
  let match;
  while ((match = token.exec(body)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2] ? UNITS[match[2].toLowerCase()] : null;
    if (unit) {
      total += amount * unit;
      last = unit;
      seen = true;
      continue;
    }
    // A number with no unit after one that had a unit is the next unit down
    // (*2 silver 40*); with nothing before it, it is copper.
    if (last === null) { total += amount; seen = true; continue; }
    if (last === 1) return null;                       // `7c 51` names nothing
    total += amount * (last === 10000 ? 100 : 1);
    last = last === 10000 ? 100 : 1;
    seen = true;
  }
  if (!seen) return null;
  return negative ? -total : total;
}
