import { readSustainTransferInventory } from "./sustain-transfer-inventory.mjs";
import { reconcileSustainedSpells } from "./sustained-spells.mjs";
import { sweepAreas } from "../canvas/sustained-areas.mjs";

const scope = "azeroth-rpg";
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter(key => key !== "_stats").sort().map(key => [key, stable(value[key])])) : value;
export const sameSustainSnapshot = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** Paid coordinator only. Persist each attempted ending before using the normal
 * ending door; a lost acknowledgement is retained for review, never replayed. */
export async function replaceSustainsForTransfer({ mage, plan, validate, save }) {
  const replacements = plan.replacements ?? [];
  let expected = [...plan.capacity.dropped, ...plan.capacity.retained];
  const completed = [];
  const check = async () => {
    if (!await validate() || !sameSustainSnapshot(mage.getFlag(scope, "sustaining") ?? [], expected)) throw Error("Replacement state changed");
    if (!sameSustainSnapshot(readSustainTransferInventory(fromUuidSync(plan.casterUuid), plan.cast), plan.inventory)) {
      throw Error("Incoming Sustain changed");
    }
    for (const row of replacements.filter(row => !completed.includes(row.cast))) {
      if (!sameSustainSnapshot(readSustainTransferInventory(mage, row.cast), row)) throw Error("Replacement carrier changed");
    }
  };
  await check();
  for (const row of replacements) {
    await save({ state: "pending", attempted: row.cast, completed: [...completed], inventories: replacements });
    await check();
    const ended = await game.system.azeroth.workflows.endSustain({ actor: mage, cast: row.cast });
    if (!sameSustainSnapshot(ended, row.entry)) throw Error("Replacement ending unconfirmed");
    expected = expected.filter(entry => entry.cast !== row.cast);
    completed.push(row.cast);
    await check();
    await reconcileSustainedSpells();
    await check();
    // Await the same serialized, marked cleanup used by ordinary Sustain
    // endings. Restrict it to the inventoried Regions, including other scenes.
    for (const region of row.regions) {
      await check();
      const current = fromUuidSync(region.uuid);
      if (!current) continue;
      const flags = current.flags?.[scope];
      if (flags?.cast !== row.cast || flags.caster !== mage.uuid || flags.sustained !== true) {
        throw Error("Replacement Region identity changed");
      }
      const scene = fromUuidSync(region.parentUuid);
      if (!scene) throw Error("Replacement scene missing");
      await sweepAreas({ scenes: [scene], caster: mage.uuid, ids: [region._id] });
      await check();
    }
    if ([...row.effects, ...row.regions].some(doc => fromUuidSync(doc.uuid))) throw Error("Replacement cleanup unconfirmed");
    await save({ state: "pending", attempted: null, completed: [...completed], inventories: replacements });
  }
  await save({ state: "done", attempted: null, completed, inventories: replacements });
}
