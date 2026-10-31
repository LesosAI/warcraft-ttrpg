import { MOBILE_ALERT_FLAG } from "../rules/mobile-alert.mjs";
import { MOBILE_FLARE_FLAG, mobileFlareData, mobileFlareExpired } from "../rules/mobile-alert-flare.mjs";

const busy = new Set();
const cleaning = new Set();
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = document => document?.getFlag?.("azeroth-rpg", MOBILE_FLARE_FLAG);

/** The receipt is saved before creating the light. An uncertain creation is
 * never retried as a new light. Its owned document can be reconciled instead. */
export async function ensureMobileFlare({ token, valid } = {}) {
  if (!gmHere() || !token?.uuid || typeof valid !== "function" || busy.has(token.uuid)) return { ok: false, reason: "authorityOrBusy" };
  busy.add(token.uuid);
  try {
    const scene = token.parent, alarm = token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG);
    const cast = alarm?.cast;
    const allowed = () => gmHere() && valid() && game.scenes?.get(scene?.id) === scene
      && scene.tokens.get(token.id) === token
      && token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG)?.cast === cast
      && token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG)?.phase === "summoned";
    if (!allowed() || !cast) return { ok: false, reason: "source" };
    const owned = () => values(scene.lights).filter(light => flag(light)?.ownerUuid === token.uuid && flag(light)?.cast === cast);
    let receipt = flag(token);
    if (receipt?.cast === cast) {
      const lights = owned();
      if (lights.length > 1) return { ok: false, reason: "duplicate" };
      if (Number.isFinite(receipt.expires) && game.time.worldTime >= receipt.expires) return { ok: true, expired: true };
      if (lights.length === 1) return { ok: true, light: lights[0] };
      return { ok: false, reason: "creationUncertain" };
    }
    if (owned().length) return { ok: false, reason: "unclaimedLight" };
    const level = alarm.point?.level;
    if (!scene.levels?.has(level)) return { ok: false, reason: "level" };
    const data = mobileFlareData({ ownerUuid: token.uuid, cast, level,
      x: alarm.point.x + (token.width ?? 1) * (scene.grid.sizeX ?? scene.grid.size) / 2,
      y: alarm.point.y + (token.height ?? 1) * (scene.grid.sizeY ?? scene.grid.size) / 2,
      elevation: alarm.point.elevation, now: game.time.worldTime, hidden: token.hidden === true });
    if (!data) return { ok: false, reason: "geometry" };
    receipt = { ...data.flags["azeroth-rpg"][MOBILE_FLARE_FLAG], phase: "creating" };
    await token.setFlag("azeroth-rpg", MOBILE_FLARE_FLAG, receipt);
    if (!allowed() || JSON.stringify(flag(token)) !== JSON.stringify(receipt) || owned().length) return { ok: false, reason: "claimUncertain" };
    const created = await scene.createEmbeddedDocuments("AmbientLight", [data]);
    if (!allowed() || created?.length !== 1 || owned().length !== 1
      || scene.lights.get(created[0].id) !== created[0] || owned()[0] !== created[0]) return { ok: false, reason: "creationUncertain" };
    // The durable claim plus the owned light is sufficient: no second write
    // can fail and invite another creation after the first already succeeded.
    return { ok: true, light: created[0] };
  } catch (error) {
    console.warn("azeroth-rpg | Alarm Flare requires review", error);
    return { ok: false, reason: "writeUncertain" };
  } finally {
    busy.delete(token.uuid);
    await cleanMobileFlares().catch(error => console.warn("azeroth-rpg | Alarm Flare cleanup", error));
  }
}

/** Reset/deletion removes only this system's owned lights. Ordinary death
 * leaves a launched flare burning until its original deadline. */
export async function cleanMobileFlares() {
  if (!gmHere()) return;
  for (const scene of values(game.scenes)) for (const light of values(scene.lights)) {
    if (!gmHere()) return;
    const record = flag(light);
    if (record?.version !== 1) continue;
    const owner = values(scene.tokens).find(token => token.uuid === record.ownerUuid);
    if (busy.has(record.ownerUuid)) continue;
    if (mobileFlareExpired(record, game.time.worldTime, owner?.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG))) {
      const key = `${scene.id}:${light.id}`;
      if (cleaning.has(key)) continue;
      cleaning.add(key);
      try { await light.delete(); } finally { cleaning.delete(key); }
    }
  }
}
