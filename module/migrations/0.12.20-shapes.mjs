/**
 * Migration to 0.12.20 - a shape is one Active Effect (02 §7; D-769).
 *
 * Before this a Druid's form was the actor flag `flags.azeroth-rpg.form =
 * {uuid, name}`, written by Shapeshift alone (the Avatar of the Wild and
 * Metamorphosis wrote nothing), and nothing read the block it named: the sheet
 * kept the character's own numbers and the token never moved. A shape is now
 * the effect `documents/shapes.mjs` writes, carrying the block's physical half,
 * and the flag is retired - `shapes.test.mjs` fails a reader of it anywhere in
 * `module/` but here.
 *
 * **Every character the walk reaches** (CLAUDE.md §10: world actors, the
 * unlinked token actors on every scene, unlocked world packs) that still holds
 * the flag:
 *
 * - a flag naming a **uuid that resolves** to a 14-BESTIARY entry becomes the
 *   Shapeshift effect, built through the one builder `takeShape` uses
 *   (`shapeEffectData`), so the migrated shape and a shift made today are the
 *   same document. Only Shapeshift ever wrote the flag, so the kind is always
 *   `shapeshift`. The tokens are dressed by the effect's own create hook on
 *   this, the GM's, client;
 * - a flag that is **only a string** (an older test fixture's `"bear"`), names
 *   **no uuid**, or names one that **no longer resolves** is dropped, and the
 *   log says which and why.
 *
 * **Compared against what is stored, never against `undefined`** (D-665): the
 * builder reads the flag on the stored document, and a second run finds no flag
 * anywhere and touches nothing (0). A character that somehow already wears a
 * shape effect keeps it, and only loses the stale flag.
 *
 * **It never throws** (CLAUDE.md §15: `runMigrations` runs every CHAIN entry on
 * load until one passes): a missing bestiary pack resolves no uuid, and the flag
 * is then dropped and logged rather than the chain stopped.
 */

import { walkWorld } from "./walk.mjs";
import { shapeEffectData, shapeEffectsOf } from "../documents/shapes.mjs";
import { snapshotOf } from "../rules/shapes.mjs";

/** The retired flag's key, named once so the census can find its one reader. */
const OLD_FLAG = "form";

/**
 * What the stored flag holds, read off the document's source, or undefined.
 * @param {Actor} doc
 */
function storedForm(doc) {
  const flags = doc._source?.flags?.["azeroth-rpg"] ?? doc.toObject?.().flags?.["azeroth-rpg"] ?? {};
  return Object.prototype.hasOwnProperty.call(flags, OLD_FLAG) ? flags[OLD_FLAG] : undefined;
}

/**
 * The one judgement, pure enough to test: what a stored flag becomes.
 *
 * @param {*} flag  `flags.azeroth-rpg.form` as stored
 * @returns {{action: "none"}|{action: "drop", reason: string}|{action: "convert", uuid: string}}
 */
export function formFlagPlan(flag) {
  if (flag === undefined) return { action: "none" };
  if (flag === null) return { action: "drop", reason: "empty" };
  if (typeof flag === "string") return { action: "drop", reason: "string" };
  if (typeof flag !== "object" || !flag.uuid || typeof flag.uuid !== "string") return { action: "drop", reason: "no uuid" };
  return { action: "convert", uuid: flag.uuid };
}

export async function migrate(log = console.log) {
  return walkWorld({
    actor: async doc => {
      if (doc.type !== "character") return null;
      const flag = storedForm(doc);
      const plan = formFlagPlan(flag);
      if (plan.action === "none") return null;
      const drop = { flags: { "azeroth-rpg": { [OLD_FLAG]: foundry.data.operators.ForcedDeletion.create() } } };
      if (plan.action === "drop") {
        log(`azeroth-rpg | 0.12.20: ${doc.name} (${doc.id}) - the old form flag dropped (${plan.reason})`);
        return drop;
      }
      let entry = null;
      try {
        entry = await fromUuid(plan.uuid);
      } catch {
        entry = null;
      }
      if (!entry || entry.documentName !== "Actor") {
        log(`azeroth-rpg | 0.12.20: ${doc.name} (${doc.id}) - the old form flag dropped (${plan.uuid} does not resolve)`);
        return drop;
      }
      if (!shapeEffectsOf(doc).length) {
        // **A REFUSED CREATE IS LOGGED, AND THE FLAG STILL GOES** (the review):
        // nothing reads the flag any more, so keeping it keeps nothing, and a
        // throw here would stop the chain on every load (CLAUDE.md §15).
        try {
          const forms = [snapshotOf(entry.toObject(), { uuid: entry.uuid })];
          await doc.createEmbeddedDocuments("ActiveEffect", [shapeEffectData(doc, { kind: "shapeshift", forms })]);
          log(`azeroth-rpg | 0.12.20: ${doc.name} (${doc.id}) - ${entry.name} is now a shape effect`);
        } catch (err) {
          log(`azeroth-rpg | 0.12.20: ${doc.name} (${doc.id}) - ${entry.name} could not be made a shape effect (${err?.message ?? err}); the old form flag dropped`);
        }
      }
      return drop;
    }
  }, log);
}
