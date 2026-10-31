/** 02: one Boon on Body Resilience against poison, irrespective of talent tier. */
export function irradiatedMemory(talents = [], { resilience, poison = false } = {}) {
  if (resilience !== "body" || poison !== true) return null;
  return talents.some(t => String(t.race ?? "").toLowerCase() === "gnome"
    && t.identifier === "irradiated-memory" && Number(t.taken) > 0)
    ? { boons: 1, names: ["Irradiated Memory"] } : null;
}
