/**
 * **CORPSE CANDLE'S LIGHT, SEEN BY ITS OWNERS ALONE** (07 §17: *The corpse sheds dim light out to a 20 ft
 * radius for the duration. Only you and your raised dead can see this light*; fix run 4-S).
 *
 * Core's token light is drawn for every viewer, so the candle is not one. The corpse's token carries the
 * candle's record (`flags.azeroth-rpg.corpseCandle {by, dim}`, written on the GM's client by
 * `effects/necromancer-spells.mjs`), and each client draws a light source of its own beside the token's
 * where its user owns the caster (`rules/necromancer-spells.mjs#candleSeen`): the caster's players and
 * the GM. Elune's Light's separate source is the shape (`canvas/elunes-light.mjs`; v14.367's
 * `Token#initializeLightSource` and `PointLightSource`, verified locally).
 */
import { candleSeen } from "../rules/necromancer-spells.mjs";

const SCOPE = "azeroth-rpg";
const FLAG = "corpseCandle";

/** The candle's green, dim and faint (the colour the GM's handler once wrote on the token). */
export const CANDLE_COLOR = "#5fd17a";

/**
 * Whether the caster still carries the candle's own effect (the hour, `effects/necromancer-spells.mjs
 * #candleLands`) - for this token where one is named. **The effect is the truth** (the fix run 4
 * review): the token's record is cleared on the active GM's client, and with no GM online it would
 * stand, so every client reads the effect's presence and the light goes out as the effect ends.
 */
export function candleLit(caster, token = null) {
  return [...(caster?.effects ?? [])].some(e => {
    const rec = e?.flags?.[SCOPE]?.[FLAG] ?? null;
    if (!rec || e.disabled || rec.by !== caster.uuid) return false;
    return !token || (rec.tokenId === token.id && rec.sceneId === token.parent?.id);
  });
}

/** Whether this client draws the candle on a token: a record, this user owns its caster, and the caster's effect still stands. */
export function seesCandle(record, user = globalThis.game?.user ?? null, token = null) {
  if (!record?.by) return false;
  const caster = globalThis.fromUuidSync?.(record.by) ?? null;
  return candleSeen({ ownsCaster: Boolean(caster && user && caster.testUserPermission?.(user, "OWNER")), lit: candleLit(caster, token) });
}

/** The token class that draws the candle beside the token's own light. */
export function corpseCandleTokenClass(BaseToken) {
  return class CorpseCandleToken extends BaseToken {
    initializeLightSource(options = {}) {
      super.initializeLightSource(options);
      this.refreshCorpseCandle(options);
    }

    refreshCorpseCandle({ deleted = false } = {}) {
      const record = this.document?.getFlag?.(SCOPE, FLAG) ?? null;
      const dim = deleted || this.destroyed || this.isPreview || this.document?.hidden || !seesCandle(record, globalThis.game?.user ?? null, this.document) ? 0 : Math.max(0, Number(record.dim) || 0);
      if (!dim) {
        if (!this.corpseCandleSource) return;
        this.corpseCandleSource.destroy();
        this.corpseCandleSource = undefined;
      } else {
        this.corpseCandleSource ??= new CONFIG.Canvas.lightSourceClass({ sourceId: `${this.sourceId}.corpseCandle`, object: this });
        this.corpseCandleSource.initialize({ ...this.document.getLightOrigin(), level: this.document.level,
          dim: this.getLightRadius(dim), bright: 0, angle: 360, walls: true, color: CANDLE_COLOR, alpha: 0.4,
          externalRadius: this.externalRadius, preview: false, disabled: false });
        this.corpseCandleSource.add();
      }
      canvas.perception.update({ refreshLighting: true, refreshVision: true });
    }
  };
}

/**
 * The class wrapped once, and a token's candle redrawn whenever its record, its caster's ownership or
 * the caster's candle effect moves. **Registered synchronously at `init`** (`azeroth.mjs`, beside
 * Elune's Light; the fix run 4 review): the swap of `CONFIG.Token.objectClass` must land before the
 * canvas draws its first token, never after an awaited import.
 */
export function registerCorpseCandle() {
  if (CONFIG.Token.objectClass?.corpseCandle === true) return;
  const Wrapped = corpseCandleTokenClass(CONFIG.Token.objectClass);
  Wrapped.corpseCandle = true;
  CONFIG.Token.objectClass = Wrapped;
  Hooks.on("updateToken", token => { if (FLAG in (token.flags?.[SCOPE] ?? {}) || token.object?.corpseCandleSource) token.object?.refreshCorpseCandle?.(); });
  Hooks.on("updateActor", (actor, changed) => {
    if (!("ownership" in (changed ?? {}))) return;
    for (const token of globalThis.canvas?.tokens?.placeables ?? []) if (token.document?.getFlag?.(SCOPE, FLAG)?.by === actor.uuid) token.refreshCorpseCandle?.();
  });
  // The caster's candle effect laid, switched or ended - on every client, a GM online or not.
  for (const event of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(event, effect => {
      const by = effect?.flags?.[SCOPE]?.[FLAG]?.by ?? null;
      if (!by) return;
      for (const token of globalThis.canvas?.tokens?.placeables ?? []) if (token.document?.getFlag?.(SCOPE, FLAG)?.by === by) token.refreshCorpseCandle?.();
    });
  }
}
