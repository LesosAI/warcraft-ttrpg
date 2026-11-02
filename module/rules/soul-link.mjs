/** Soul Link's split (07-MAGIC; approved Ward order, 2026-10-29).
 * Pure arithmetic. The caller supplies damage BEFORE the caster's Ward;
 * this is not the already-mitigated amount accepted by Actor#applyDamage.
 * Eligibility, consent, effect lifetime and durable delivery belong to the
 * adapter. Never feed a transferred share back through this split.
 */
import { resolveDamage } from "./mitigation.mjs";
import { shrinkDamage } from "./gadgets.mjs";
import { etherealTaken } from "./spirit-realm.mjs";
import { woundedBeastTaken } from "./class-talents.mjs";

/**
 * Split one damage amount, keeping the odd point with the caster. `ward`
 * is the applicable Ward for the caster's share, already selected by school
 * and eligibility (e.g. Vulnerable disables Ward). The recipient's Armor
 * and Ward never enter this calculation. Temporary Health is spent later.
 *
 * @returns {{incoming: number, transferred: number, retained: number,
 *   wardPrevented: number, casterDamage: number}|null} null for malformed input.
 */
export function soulLinkSplit({ damage, rank = 0, ward = 0 } = {}) {
  if (!Number.isSafeInteger(damage) || damage < 0
    || !Number.isInteger(rank) || rank < 0 || rank > 2
    || !Number.isSafeInteger(ward) || ward < 0) return null;
  const transferred = Math.floor(damage / 2);
  const retained = damage - transferred;
  const wardPrevented = rank === 2 ? Math.min(retained, ward) : 0;
  return { incoming: damage, transferred, retained, wardPrevented,
    casterDamage: retained - wardPrevented };
}

/** Resolve the original typed blow with caster Ward deferred, then split each
 * damage type separately (lead ruling, 2026-10-29). The existing resolver owns
 * Armor, immunity, vulnerability, same-type merging, scaling and extra amounts.
 * This plan is not damage delivery: recipient defenses never enter it, and
 * `flatReduction` is supplied by the authoritative damage door: remove main
 * damage first, then extra types in their recorded order, before splitting.
 * `negate` is the authoritative Parry outcome, not card metadata. It removes
 * every lane before flat reductions, splitting or Ward. `ethereal` halves only
 * Physical after the one-blow flat reduction; `standingReduction` follows it.
 * The caller must not include that standing amount in `flatReduction` as well.
 * Temporary Health and holds remain downstream.
 */
export function soulLinkDamage(input = {}, { rank = 0, shrink = 0, flatReduction = 0, negate = false, ethereal = false, standingReduction = 0, woundedRanks = 0, halve = false } = {}) {
  if (!input || typeof input !== "object" || !soulLinkSplit({ damage: 0, rank })) return null;
  if (!Number.isSafeInteger(shrink) || shrink < 0) return null;
  if (!Number.isSafeInteger(flatReduction) || flatReduction < 0) return null;
  if (typeof negate !== "boolean" || typeof ethereal !== "boolean" || typeof halve !== "boolean"
    || !Number.isSafeInteger(standingReduction) || standingReduction < 0
    || !Number.isSafeInteger(woundedRanks) || woundedRanks < 0) return null;
  const beforeWard = shrinkDamage(resolveDamage({ ...input, ward: 0, wardBySchool: {} }), shrink);
  const main = { ...beforeWard, damage: beforeWard.mainDamage ?? beforeWard.damage };
  const lanes = [main, ...(beforeWard.parts ?? [])];
  // Approved 2026-11-01: halve each type separately, rounding down before splitting.
  let reductionLeft = flatReduction;
  let negated = 0;
  let etherealPrevented = 0, standingLeft = standingReduction, halvingPrevented = 0;
  const staged = lanes.map(lane => {
    if (!Number.isSafeInteger(lane.damage) || lane.damage < 0) return null;
    const remaining = negate ? 0 : lane.damage;
    negated += lane.damage - remaining;
    const incoming = halve ? Math.floor(remaining / 2) : remaining;
    halvingPrevented += remaining - incoming;
    const prevented = Math.min(incoming, reductionLeft);
    reductionLeft -= prevented;
    // Preserve the actor's order: one-blow reduction, Physical-only halving,
    // then standing reduction. Each flat stage consumes the main lane first.
    const afterBlock = incoming - prevented;
    const afterEthereal = ethereal ? etherealTaken({ main: afterBlock, mainType: lane.type }).total : afterBlock;
    etherealPrevented += afterBlock - afterEthereal;
    const standingTook = Math.min(afterEthereal, standingLeft);
    standingLeft -= standingTook;
    return { ...lane, damage: afterEthereal - standingTook };
  });
  if (staged.some(lane => !lane)) return null;
  // Wounded Beast adds to the blow's main type after defenses, only if damage
  // remains. The caller supplies zero ranks for a non-attack.
  const remainingTotal = staged.reduce((sum, lane) => sum + lane.damage, 0);
  const woundedAdded = woundedBeastTaken({ amount: remainingTotal, attack: true, ranks: woundedRanks }) - remainingTotal;
  staged[0].damage += woundedAdded;
  const shares = staged.map((lane, index) => {
    const ward = lane.type === "physical" || lane.immune || lane.vulnerable || input.bypass === true
      ? 0 : index === 0 ? input.ward ?? 0 : input.wardBySchool?.[lane.type] ?? 0;
    const split = soulLinkSplit({ damage: lane.damage, ward, rank });
    return split ? { type: lane.type, ...split } : null;
  });
  if (shares.some(share => !share)) return null;
  const sum = field => shares.reduce((total, share) => total + share[field], 0);
  return { beforeWard, shares, negated, halvingPrevented, etherealPrevented, woundedAdded, standingPrevented: standingReduction - standingLeft,
    flatPrevented: flatReduction - reductionLeft, casterDamage: sum("casterDamage"),
    transferred: sum("transferred"), wardPrevented: sum("wardPrevented") };
}

/** Read a link's current eligibility without mutating or deleting its carrier.
 * `expiresAt` and `worldTime` are seconds on the same Foundry world clock.
 * The adapter resolves exact actor/token identities and supplies measured feet.
 * Unknown facts refuse a transfer but are not evidence for permanent deletion.
 * Disabled effects can resume; a confirmed break must be removed by the adapter.
 */
export function soulLinkAvailability({ casterHealth, recipientHealth, expiresAt,
  worldTime, distance, enabled = true } = {}) {
  const result = (active, ended, reason) => ({ active, ended, reason });
  const healthValid = n => Number.isFinite(n) && n >= 0;
  if ((healthValid(casterHealth) && casterHealth === 0)
    || (healthValid(recipientHealth) && recipientHealth === 0)) return result(false, true, "health");
  const clockValid = Number.isFinite(expiresAt) && Number.isFinite(worldTime);
  if (clockValid && worldTime >= expiresAt) return result(false, true, "expired");
  const distanceValid = Number.isFinite(distance) && distance >= 0;
  // 07 says "breaks at 60 feet", not "beyond 60 feet".
  if (distanceValid && distance >= 60) return result(false, true, "range");
  if (!healthValid(casterHealth) || !healthValid(recipientHealth)) return result(false, false, "healthUnknown");
  if (!clockValid) return result(false, false, "timeUnknown");
  if (!distanceValid) return result(false, false, "distanceUnknown");
  if (enabled !== true) return result(false, false, "inactive");
  return result(true, false, null);
}
