/**
 * **A MOUNT MADE OVER A LONG REST** (02 §7's Deathcharger, Charger's Blessing and Ritual of the
 * Steed; the Death Knight plan's Phase 4 door 9). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Three class features say the same thing in three classes' words - *Over a Long Rest, choose a
 * mount you own*, it gains one or two of 08 §5's mount traits and *keeps everything else it was*,
 * and *You hold one ... at a time* - so they are one law and one door
 * (`effects/mount-works.mjs`):
 *
 * - `MOUNT_WORKS` - each feature, the class it belongs to, and the choices it offers: the
 *   Deathcharger's undead (**Steadfast** and **Deathless**) or spectral (**Spectral**), Charger's
 *   Blessing's **Hallowed**, Ritual of the Steed's **Felwrought**. `mount-works.test.mjs` holds
 *   every trait to 02's row and to 08 §5's own list;
 * - `mountWorkRefusal` - when one may be made: never in a started fight, once a Long Rest (the
 *   rest's generation the last one was made at), and only with a mount owned;
 * - `mountWorkWrites` - the writes: the mount chosen gains the traits it lacked, and the mount
 *   this feature worked before loses exactly what this feature gave it (*one at a time*), never a
 *   trait it carried of its own;
 * - `spectralMoveCost` - 08 §5's Spectral: *As a Half-Action, its rider dismisses it into their
 *   Inscribed Runeweapon or calls it to an unoccupied space beside them* - the Stable and the
 *   mount place on the Gear tab, a Half-Action in a started fight.
 *
 * What the traits DO stays where 08 §5 says it is: Felwrought's Corruption Test a Long Rest and
 * Charger's Blessing's *does not survive you turning from the Light* are the table's (O-349).
 */

/** The flag a worked mount carries: `{feature, option, added: string[], gen}`. */
export const MOUNT_WORK_FLAG = "mountWork";

/** 08 §5's Spectral trait, by its name. */
export const SPECTRAL_TRAIT = "Spectral";

/**
 * The three features, by 02's name. `options` is keyed by the choice's word; `traits` are 08
 * §5's names, exactly as a mount's `system.traits` carries them.
 */
export const MOUNT_WORKS = Object.freeze({
  // 02 §7 (Death Knight, 15): *make it undead or spectral ... An undead mount becomes a
  // deathcharger and gains Steadfast and Deathless. A spectral mount becomes a spectral steed and
  // gains Spectral.*
  "Deathcharger": Object.freeze({
    className: "Death Knight",
    options: Object.freeze({
      undead: Object.freeze({ traits: Object.freeze(["Steadfast", "Deathless"]), label: "AZEROTH.MountWork.Option.undead" }),
      spectral: Object.freeze({ traits: Object.freeze([SPECTRAL_TRAIT]), label: "AZEROTH.MountWork.Option.spectral" })
    })
  }),
  // 02 §7 (Paladin, 15): *It becomes a Zealous Charger and gains Hallowed.*
  "Charger's Blessing": Object.freeze({
    className: "Paladin",
    options: Object.freeze({ hallowed: Object.freeze({ traits: Object.freeze(["Hallowed"]), label: "AZEROTH.MountWork.Option.hallowed" }) })
  }),
  // 02 §7 (Warlock, 15): *work a mount you own into a Felsteed. It gains Felwrought.*
  "Ritual of the Steed": Object.freeze({
    className: "Warlock",
    options: Object.freeze({ felsteed: Object.freeze({ traits: Object.freeze(["Felwrought"]), label: "AZEROTH.MountWork.Option.felsteed" }) })
  })
});

/** The feature a name is, or null. */
export function mountWorkOf(name) {
  return MOUNT_WORKS[String(name ?? "")] ?? null;
}

const traitsOf = m => (Array.isArray(m?.traits) ? m.traits.filter(t => typeof t === "string") : []);

/**
 * **WHEN A MOUNT MAY BE WORKED**: never in a started fight (`fight`), once a Long Rest - the
 * actor's `MOUNT_WORKED_FLAG` names the features used since the last one, and the Long Rest clears
 * it (a Short Rest does not: *Over a Long Rest*) - and never with no mount owned (`noMount`). A
 * lang key's last part, or null.
 *
 * @param {{inFight?: boolean, worked?: string[], mounts?: Array<object>, feature?: string}} o
 * @returns {"fight"|"rested"|"noMount"|null}
 */
export function mountWorkRefusal({ inFight = false, worked = [], mounts = [], feature = "" } = {}) {
  if (inFight === true) return "fight";
  if (!(mounts ?? []).length) return "noMount";
  if ((Array.isArray(worked) ? worked : []).includes(feature)) return "rested";
  return null;
}

/** The actor flag naming the features worked since the last Long Rest, which the Long Rest clears. */
export const MOUNT_WORKED_FLAG = "mountWorked";

/**
 * **THE WRITES ONE WORKING MAKES**: the chosen mount gains the traits the option names that it
 * did not already carry, recorded on its flag as what THIS feature gave it; every other mount
 * this feature worked loses exactly that and its flag. Sorted by id.
 *
 * @param {{mounts: Array<{id: string, traits?: string[], work?: object|null}>, mountId: string,
 *   option: string, feature: string, gen?: number}} o
 * @returns {Array<{_id: string, "system.traits": string[], flag: object|null}>}  `flag` null to clear
 */
export function mountWorkWrites({ mounts = [], mountId = null, option = null, feature = "", gen = 0 } = {}) {
  const row = mountWorkOf(feature)?.options?.[option] ?? null;
  if (!row || !mountId) return [];
  const out = [];
  for (const m of [...(mounts ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const held = traitsOf(m);
    const before = m.work?.feature === feature ? (Array.isArray(m.work.added) ? m.work.added : []) : [];
    if (m.id === mountId) {
      // A mount worked anew loses what the old working gave it first, then gains the new.
      const bare = held.filter(t => !before.includes(t));
      const added = row.traits.filter(t => !bare.includes(t));
      out.push({ _id: m.id, "system.traits": [...bare, ...added], flag: { feature, option, added: [...added], gen: Math.trunc(Number(gen)) || 0 } });
    } else if (m.work?.feature === feature) {
      out.push({ _id: m.id, "system.traits": held.filter(t => !before.includes(t)), flag: null });
    }
  }
  return out;
}

/**
 * **WHAT MOVING A MOUNT BETWEEN THE STABLE AND THE MOUNT PLACE COSTS**: a Spectral mount's
 * dismiss or call is a Half-Action in a started fight (08 §5); any other mount's move costs the
 * table's call, as before. `null` where nothing is spent.
 *
 * @param {{traits?: string[], inFight?: boolean}} o
 * @returns {"half"|null}
 */
export function spectralMoveCost({ traits = [], inFight = false } = {}) {
  return inFight === true && traitsOf({ traits }).includes(SPECTRAL_TRAIT) ? "half" : null;
}
