import { vilebranchShrinkScale } from "../rules/vilebranch-shrink.mjs";

/** Core V14 first restores texture fit, mirroring and dynamic-ring adjustment.
 * Apply a render-only multiplier afterward. No TokenDocument data is written. */
export function shrinkTokenClass(BaseToken) {
  return class ShrinkToken extends BaseToken {
    _refreshMeshSizeAndScale() {
      super._refreshMeshSizeAndScale();
      const factor = vilebranchShrinkScale(this.actor?.effects ?? []);
      if (factor !== 1 && this.mesh?.scale) {
        this.mesh.scale.set(this.mesh.scale.x * factor, this.mesh.scale.y * factor);
      }
    }
  };
}

export function registerTokenShrinkHooks() {
  CONFIG.Token.objectClass = shrinkTokenClass(CONFIG.Token.objectClass);
  const refresh = actor => {
    for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
      if (!actor || token.actor === actor) token.renderFlags?.set({ refreshMesh: true });
    }
  };
  for (const event of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(event, effect => { if (effect.parent?.documentName === "Actor") refresh(effect.parent); });
  }
  Hooks.on("updateActor", actor => refresh(actor));
  Hooks.on("updateWorldTime", () => refresh());
  Hooks.on("updateCombat", () => refresh());
}
