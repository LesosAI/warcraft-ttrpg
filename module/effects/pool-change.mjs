/**
 * The `pool` change type (2026-09-06): an Active Effect change whose key is
 * a pool's name and whose value is the points its cap rises by. A cap is
 * derived per class, not a key on the actor, so core's field-guided apply
 * cannot reach it; v14's `CONFIG.ActiveEffect.changeTypes` takes a system
 * type with a handler (CLAUDE.md §6), and the handler is `raisePool` on the
 * prepared system. Verified against `client/documents/active-effect.mjs`
 * (14.367): `applyChange` runs a configured handler before any field.
 */

import { POOL_CHANGE_TYPE, raisePool } from "../rules/pool-change.mjs";

export function registerPoolChange() {
  CONFIG.ActiveEffect.changeTypes[POOL_CHANGE_TYPE] = {
    label: "AZEROTH.Effects.PoolChange",
    defaultPriority: 20,
    handler: (targetDoc, change, { modifyTarget = true } = {}) => {
      if (!modifyTarget || !targetDoc?.system) return;
      raisePool(targetDoc.system, change.key, change.value, { type: targetDoc.type });
    }
  };
}
