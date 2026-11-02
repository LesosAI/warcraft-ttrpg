import { elunesLightRadius } from '../rules/elunes-light.mjs';
const scope = 'azeroth-rpg', flag = 'elunesLight';

/** V14.367 Token.initializeLightSource/_onAnimationUpdate and PointLightSource
 * verified locally. A separate source preserves ordinary and negative lights. */
export function elunesLightTokenClass(BaseToken) {
  return class ElunesLightToken extends BaseToken {
    initializeLightSource(options = {}) {
      super.initializeLightSource(options);
      this.refreshElunesLight(options);
    }

    _onAnimationUpdate(changed, context) {
      super._onAnimationUpdate(changed, context);
      if (['x', 'y', 'elevation', 'level', 'width', 'height', 'depth'].some(key => key in changed))
        this.refreshElunesLight();
    }

    refreshElunesLight({ deleted = false } = {}) {
      const radius = deleted || this.destroyed || this.isPreview ? 0 : elunesLightRadius({
        confirmed: this.document.getFlag(scope, flag) === true,
        hidden: this.document.hidden,
        burrowed: this.document.hasStatusEffect(CONFIG.specialStatusEffects.BURROW),
        talents: Array.from(this.actor?.items ?? [])
      });
      if (!radius) {
        if (!this.elunesLightSource) return;
        this.elunesLightSource.destroy();
        this.elunesLightSource = undefined;
      } else {
        this.elunesLightSource ??= new CONFIG.Canvas.lightSourceClass({ sourceId: `${this.sourceId}.elunesLight`, object: this });
        this.elunesLightSource.initialize({ ...this.document.getLightOrigin(), level: this.document.level,
          bright: this.getLightRadius(radius), dim: 0, angle: 360, walls: true,
          externalRadius: this.externalRadius, preview: false, disabled: false });
        this.elunesLightSource.add();
      }
      canvas.perception.update({ refreshLighting: true, refreshVision: true });
    }
  };
}

export function registerElunesLightHooks() {
  CONFIG.Token.objectClass = elunesLightTokenClass(CONFIG.Token.objectClass);
  const refresh = actor => {
    for (const token of globalThis.canvas?.tokens?.placeables ?? [])
      if (!actor || token.actor === actor) token.refreshElunesLight?.();
  };
  for (const event of ['createItem', 'updateItem', 'deleteItem'])
    Hooks.on(event, item => { if (item.type === 'talent') refresh(item.parent); });
  Hooks.on('updateActor', actor => refresh(actor));
  Hooks.on('updateToken', token => token.object?.refreshElunesLight?.());
  Hooks.on('applyTokenStatusEffect', token => token.refreshElunesLight?.());
}

export async function useElunesLight(actor, source) {
  const token = game.scenes?.get(source?.sceneId)?.tokens?.get(source?.tokenId);
  const words = key => game.i18n.localize(`AZEROTH.ElunesLight.${key}`);
  if (!token?.isOwner || token.actor !== actor) { ui.notifications?.warn(words('Target')); return null; }
  const active = token.getFlag(scope, flag) === true;
  const accepted = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${words('Title')} — ${token.name}` }, content: `<p>${words(active ? 'End' : 'Confirm')}</p>`,
    yes: { default: false }, no: { default: true }, rejectClose: false
  });
  if (accepted !== true) return null;
  if (!token.isOwner || token.actor !== actor || game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId) !== token) return null;
  if ((token.getFlag(scope, flag) === true) !== active) return null;
  if (!active && !elunesLightRadius({ confirmed: true, talents: Array.from(actor.items) })) return null;
  const updated = await token.setFlag(scope, flag, !active);
  if (!token.isOwner || token.actor !== actor
    || game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId) !== token
    || token.getFlag(scope, flag) !== !active) return null;
  return updated;
}
