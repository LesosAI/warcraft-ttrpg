import { widenArea } from "./areas.mjs";

/** Goblin Blast Radius applies to identified explosives, not all area effects. */
export function blastRadius(area, talents = [], { explosive = false } = {}) {
  const taken = explosive === true && talents.some(t => String(t.race ?? "").toLowerCase() === "goblin"
    && t.identifier === "blast-radius" && Number(t.taken) > 0);
  return taken ? widenArea(area, 5) : area;
}
