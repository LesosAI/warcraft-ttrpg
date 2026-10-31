/** 07 Flare: twenty feet of bright light for one minute. */
export const MOBILE_FLARE_FLAG = "mobileAlertFlare";
export const MOBILE_FLARE = Object.freeze({ radius: 20, seconds: 60 });
/** Suppression is local to the illuminated token, never its shared Actor. */
export function mobileFlareReveals({ record, ownerRecord, now, sameLevel, hiddenByGM, lightHidden, illuminated } = {}) {
  return record?.version === 1 && Number.isFinite(now) && Number.isFinite(record.created)
    && Number.isFinite(record.expires) && now >= record.created && now < record.expires
    && ownerRecord?.cast === record.cast && sameLevel === true
    && hiddenByGM === false && lightHidden === false && illuminated === true;
}
export function mobileFlareData({ ownerUuid, cast, level, x, y, elevation, now, hidden = false } = {}) {
  if (![ownerUuid, cast, level].every(value => typeof value === "string" && value.length)
    || ![x, y, elevation, now].every(Number.isFinite)) return null;
  return { name: "Flare", x: Math.round(x), y: Math.round(y), elevation, levels: [level],
    walls: true, vision: false, hidden, locked: true,
    config: { bright: MOBILE_FLARE.radius, dim: 0, attenuation: 0, color: "#fff0c2", alpha: 0.2 },
    flags: { "azeroth-rpg": { [MOBILE_FLARE_FLAG]: { version: 1, ownerUuid, cast,
      created: now, expires: now + MOBILE_FLARE.seconds } } } };
}

export function mobileFlareExpired(record, now, ownerRecord) {
  if (record?.version !== 1 || !Number.isFinite(record.expires)) return false;
  return !ownerRecord || ownerRecord.cast !== record.cast
    || (Number.isFinite(now) && now >= record.expires);
}
