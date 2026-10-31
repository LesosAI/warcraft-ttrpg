/** Detection ignores stealth and invisibility, not physical cover. The GM
 * confirms line of sight before the alarm begins. GM-hidden tokens are never
 * interpreted as concealed creatures automatically. Sixty feet is the
 * tabletop sensor range, not a conversion of the source aura's modifier. */
export const MOBILE_ALERT_SENSOR_RANGE = 60;
export function mobileAlertCandidate({ distance, sameLevel, hostile, hiddenByGM, alive } = {}) {
  return Number.isFinite(distance) && distance >= 0 && distance <= MOBILE_ALERT_SENSOR_RANGE
    && sameLevel === true && hostile === true && hiddenByGM === false && alive === true;
}
