import { etherealTaken } from "./spirit-realm.mjs";
import { woundedBeastTaken } from "./class-talents.mjs";

const whole = n => Math.max(0, Math.trunc(Number(n)) || 0);

/** Ordinary damage after the original target's one-blow reaction, before a
 * transfer is chosen. Guardian/Shared Burden see `redirectAmount`; Spirit
 * Link Totem sees `divisionAmount`. Neither includes temporary Health or
 * protective floors. Soul Link must instead reconstruct its pre-Ward lanes.
 *
 * When a redirection has already retained a smaller amount, the actor calls
 * this again with that remainder. Additional damage occupies its recorded
 * lanes up to the remaining total, matching Actor#applyDamage's existing law.
 */
export function damageTransferStages({ amount = 0, type = null, parts = null,
  ethereal = false, standing = 0, woundedRanks = 0, attack = false } = {}) {
  const redirectAmount = whole(amount);
  let left = redirectAmount;
  const shares = (ethereal && Array.isArray(parts) ? parts : []).map(part => {
    const damage = Math.min(left, whole(part?.damage));
    left -= damage;
    return { type: part?.type ?? null, damage };
  });
  const physical = ethereal
    ? etherealTaken({ main: left, mainType: type, parts: shares })
    : { total: redirectAmount, halved: 0 };
  const standingDamage = Math.max(0, physical.total - whole(standing));
  return { redirectAmount, etherealDamage: physical.total, etherealPrevented: physical.halved,
    standingDamage, standingTook: physical.total - standingDamage,
    divisionAmount: woundedBeastTaken({ amount: standingDamage, attack, ranks: woundedRanks }) };
}
