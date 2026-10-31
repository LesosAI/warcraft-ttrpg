import { MOBILE_ALERT_FLAG } from "../rules/mobile-alert.mjs";
import { MOBILE_FLARE_FLAG, mobileFlareReveals } from "../rules/mobile-alert-flare.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** Core's light source test includes its wall polygon, elevation and surface
 * collisions (14.367 BaseEffectSource#testPoint). No canvas means no guess. */
export function revealedByMobileFlare(token) {
  const scene = token?.parent;
  if (!scene || token.hidden || globalThis.canvas?.ready !== true || canvas.scene?.id !== scene.id) return false;
  const point = { x: token.x + (token.width ?? 1) * (scene.grid.sizeX ?? scene.grid.size) / 2,
    y: token.y + (token.height ?? 1) * (scene.grid.sizeY ?? scene.grid.size) / 2, elevation: token.elevation };
  if (![point.x, point.y, point.elevation].every(Number.isFinite)) return false;
  return values(scene.lights).some(light => {
    const record = light.getFlag?.("azeroth-rpg", MOBILE_FLARE_FLAG);
    if (record?.version !== 1) return false;
    const owner = values(scene.tokens).find(row => row.uuid === record.ownerUuid);
    const source = light.object?.lightSource;
    return mobileFlareReveals({ record, ownerRecord: owner?.getFlag?.("azeroth-rpg", MOBILE_ALERT_FLAG),
      now: game.time.worldTime, sameLevel: source?.level?.id === token._source?.level,
      hiddenByGM: token.hidden === true, lightHidden: light.hidden === true,
      illuminated: source?.active === true && source.testPoint(point) === true });
  });
}

/** Use an explicit source for attacks. Ambiguous actor-only queries do not
 * treat one illuminated linked token as every copy of that actor. */
export function actorRevealedByMobileFlare(actor, source = null) {
  if (!actor?.uuid) return false;
  if (source) {
    const token = game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId);
    return token?.actor?.uuid === actor.uuid && revealedByMobileFlare(token);
  }
  if (actor.isToken && actor.token) return revealedByMobileFlare(actor.token);
  const tokens = values(globalThis.canvas?.scene?.tokens).filter(token => token.actor?.uuid === actor.uuid);
  const controlled = tokens.filter(token => token.object?.controlled);
  const token = controlled.length === 1 ? controlled[0] : tokens.length === 1 ? tokens[0] : null;
  return token ? revealedByMobileFlare(token) : false;
}

/** Extend the configured TokenDocument, preserving other document behavior.
 * DetectionMode and the invisibility filter both use hasStatusEffect in V14. */
export function registerMobileFlareVisibility() {
  const Base = CONFIG.Token.documentClass;
  CONFIG.Token.documentClass = class MobileFlareTokenDocument extends Base {
    hasStatusEffect(statusId) {
      const present = super.hasStatusEffect(statusId);
      if (present && statusId === CONFIG.specialStatusEffects.INVISIBLE && revealedByMobileFlare(this)) return false;
      return present;
    }
  };
  const refresh = () => {
    if (globalThis.canvas?.ready !== true) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (token.mesh) token._updateSpecialStatusFilterEffects?.();
      token.renderFlags?.set({ refreshVisibility: true });
    }
    canvas.perception?.update({ refreshVision: true });
  };
  for (const hook of ["canvasReady", "updateWorldTime", "updateToken", "createAmbientLight", "updateAmbientLight", "deleteAmbientLight", "applyTokenStatusEffect"])
    Hooks.on(hook, refresh);
  // Lighting rebuilds its polygon after document hooks. Refresh the filter
  // after that rebuild without requesting another lighting/vision cycle.
  Hooks.on("lightingRefresh", () => {
    if (globalThis.canvas?.ready !== true) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (token.mesh) token._updateSpecialStatusFilterEffects?.();
    }
  });
}
