/** Repair the original note-only Restorative Potion without overwriting custom uses. */
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { sameUse as same } from "./0.11.2-consumable-use.mjs";

export const RESTORATIVE_ENDS = Object.freeze(["blinded", "charmed", "deafened", "frightened", "numbed", "silenced"]);
const OLD_NOTE = "As a Half-Action, end every instance of **Blinded**, **Charmed**, **Deafened**, **Frightened**, **Numbed** and **Silenced** on yourself.";

export function buildRestorativeUpdate(raw, pack, name) {
  if (name !== "Restorative Potion" || !same(pack?.use?.ends,RESTORATIVE_ENDS)) return null;
  const old={...pack.use,ends:[],note:OLD_NOTE};
  if (!same(raw?.use,old)) return null;
  return {"system.use.ends":[...RESTORATIVE_ENDS],"system.use.note":pack.use.note};
}

export async function migrate(log=console.log) {
  const gear=await packSystems("azeroth-rpg.gear");
  const pack=gear.byName.get("Restorative Potion");
  if (!same(pack?.use?.ends,RESTORATIVE_ENDS)) throw new Error("Rebuild the gear pack before migrating Restorative Potion.");
  return walkWorld({item:doc=>doc.type==="gear" ? buildRestorativeUpdate(rawSystem(doc),pack,doc.name) : null},log);
}
