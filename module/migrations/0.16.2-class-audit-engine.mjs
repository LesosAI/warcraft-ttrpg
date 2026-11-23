/**
 * Migration to 0.16.2 - the class talent audit's shared engine (the lead, 2026-11-22: *"All other
 * propsals are approved. Build these changes"*; D-1860 to D-1868).
 *
 * What the engine changed and what each needs of a world:
 *
 * 1. **BLEEDING BY SOURCE** (R8, D-1866): a Bleeding laid again by the same source refreshes, by
 *    another adds, and the condition's own effect carries the layers as
 *    `flags.azeroth-rpg.bleedSources`. A Bleeding a world holds from before carries one `value` and
 *    no layers: it takes that value as its one unsourced layer (`"unsourced"`, `rules/bleeding.mjs
 *    #UNSOURCED`), so the next landing adds to
 *    it or refreshes it exactly as `rules/bleeding.mjs#bleedLayers` already reads it. Only a
 *    condition's OWN effect is touched (`condition-carriers.mjs#conditionEffectOf`): a tick or an
 *    affliction carrier holding the status is not the condition. An effect already layered is left.
 * 2. **A DRUID ALREADY WEARING A FORM ABOVE THEIR TIER** (C6, D-1867) is LOGGED, never ended: the
 *    form was legal when it was taken and ends at the Druid's own hand or rest. The next Shapeshift
 *    refuses it (`useFeature`) and the chooser greys it.
 * 3. **NOTHING ELSE IS STORED.** The turn's Attack count (R6) is on the budget `freshTurn` writes
 *    at every turn's reset; the hold records (R4) are fight flags that go with the fight; the cast
 *    cap (R3), the next spell's floor (R7), the tier cap (R1), the form tier (C6) and the casting
 *    modifier are derived at the door; `uses.refill` and a full heal are a feature's stamp, which
 *    the sync restamps at world load (D-621) once a class row names them.
 *
 * Idempotent: a second run finds every Bleeding layered and writes nothing. Every document touched
 * is logged by `walkWorld`'s actor builder.
 */

import { BLEED_SOURCES_FLAG, UNSOURCED } from "../rules/bleeding.mjs";
import { conditionEffectOf } from "../rules/condition-carriers.mjs";
import { SHAPE_FLAG, formOverTier, readShape } from "../rules/shapes.mjs";
import { secondaryLevel, tierForLevel } from "../rules/progression.mjs";
import { walkWorld } from "./walk.mjs";

/**
 * The Druid tier a character's stored classes give (02 §10: a second class one tier behind), or null
 * for a character who holds no Druid class.
 *
 * @param {{system?: object, items?: Iterable<object>}} doc
 * @returns {number|null}
 */
export function druidTierOf(doc) {
  const sys = doc?._source?.system ?? doc?.system ?? {};
  const classes = Array.isArray(sys.classes) ? sys.classes : [];
  const items = [...(doc?.items ?? [])];
  const level = Math.max(1, Math.trunc(Number(sys.level ?? classes[0]?.level)) || 1);
  const index = classes.findIndex(c => items.find(i => i.id === c.itemId)?.name === "Druid");
  if (index < 0) return null;
  return tierForLevel(index === 0 ? level : secondaryLevel(level));
}

/**
 * The form above the Druid's tier a character wears now, or null: a Shapeshift shape effect (`shape`
 * flag, kind `shapeshift`) whose snapshot's tier is past it (`formOverTier`).
 *
 * @param {Iterable<object>} effects
 * @param {number|null} tier
 * @returns {{name: string, tier: number}|null}
 */
export function overTierShape(effects = [], tier = null) {
  if (tier === null || tier === undefined) return null;
  for (const e of effects ?? []) {
    const shape = readShape(e?.flags?.["azeroth-rpg"]?.[SHAPE_FLAG] ?? null);
    if (shape?.kind !== "shapeshift") continue;
    const over = formOverTier(shape.forms, { tier });
    if (over) return over;
  }
  return null;
}

/**
 * The effect updates one actor's Bleeding takes, or an empty list: its own Bleeding effect, where it
 * carries a value and no layers, takes that value as its unsourced layer.
 *
 * @param {Iterable<object>} effects  the actor's ActiveEffects (documents or sources)
 * @returns {Array<{_id: string, [key: string]: unknown}>}
 */
export function bleedBackfill(effects = []) {
  const own = conditionEffectOf([...(effects ?? [])], "bleeding");
  if (!own) return [];
  const flags = own.flags?.["azeroth-rpg"] ?? {};
  if (flags[BLEED_SOURCES_FLAG] && typeof flags[BLEED_SOURCES_FLAG] === "object") return [];
  const value = Math.max(0, Math.trunc(Number(flags.value ?? 1)) || 0);
  if (value <= 0) return [];
  const id = own.id ?? own._id ?? null;
  return id ? [{ _id: id, [`flags.azeroth-rpg.${BLEED_SOURCES_FLAG}`]: { [UNSOURCED]: value } }] : [];
}

export async function migrate(log = console.log) {
  let layered = 0;
  const touched = await walkWorld({
    actor: async doc => {
      if (doc.type === "character") {
        const tier = druidTierOf(doc);
        const over = overTierShape(doc.effects ?? [], tier);
        if (over) log(`azeroth-rpg | 0.16.2: ${doc.name} wears ${over.name} (tier ${over.tier}) above their Druid tier ${tier}; left worn, refused at the next Shapeshift (C6)`);
      }
      const plan = bleedBackfill(doc.effects ?? []);
      if (plan.length) {
        await doc.updateEmbeddedDocuments("ActiveEffect", plan, { render: false });
        layered += plan.length;
        log(`azeroth-rpg | 0.16.2: ${doc.name}'s Bleeding takes its value as one layer (R8)`);
      }
      return null;
    }
  }, log);
  return touched + layered;
}
