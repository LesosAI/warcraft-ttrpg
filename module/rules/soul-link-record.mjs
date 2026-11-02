import { resolveRecordedDamage } from "./damage-record.mjs";
import { soulLinkDamage } from "./soul-link.mjs";
import { resolveDamage } from "./mitigation.mjs";

/** A transferred share bypasses Armor and Ward, not immunity, vulnerability
 * or target-side Fire bonuses. No new Test or SL is added. Actor delivery
 * still owns Ethereal Form, standing reduction, temporary Health and floors. */
export function soulLinkRecipientDamage(row, { immune = [], vulnerable = [], fireTakenBonus = 0 } = {}) {
  const lanes = [{ type: row.type, damage: row.mainDamage ?? row.damage }, ...(row.parts ?? [])];
  const met = lanes.map(lane => ({ type: lane.type, wardTook: 0,
    damage: lane.damage > 0 ? resolveDamage({ rating: lane.damage, kind: lane.type && lane.type !== "physical" ? "magical" : "physical",
      school: lane.type, bypass: true, immune, vulnerable, fireTakenBonus }).damage : 0 }));
  return { damage: met.reduce((sum, lane) => sum + lane.damage, 0), type: met[0].type, wardTook: 0,
    ...(met.length > 1 ? { mainDamage: met[0].damage, parts: met.slice(1) } : {}) };
}

const same = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};

/** Validate recorded mitigation before computing two typed delivery rows.
 * Old cards and unexplained edits cannot authorize reconstructed damage.
 * The caller still owns link eligibility, claims, reactions and actor writes. */
export function soulLinkRecordedDamage(row, { rank = 0, flatReduction = 0, negate = false, ethereal = false, standingReduction = 0, woundedRanks = 0, halve = false, preventPhysical = false } = {}) {
  const source = row?.mitigationSource;
  if (row?.withdrawn === true || row?.hit !== true) return { ok: false, reason: "notHit" };
  if (source?.version !== 1 || !source.input || typeof source.input !== "object" || Array.isArray(source.input))
    return { ok: false, reason: "source" };
  const shrink = source.shrink ?? 0;
  if (!Number.isSafeInteger(shrink) || shrink < 0) return { ok: false, reason: "source" };
  try {
    const expected = resolveRecordedDamage(source.input, { shrink });
    // Compare every resolver-owned field, but allow later non-damage metadata.
    if (!Object.keys(expected).every(key => same(row[key], expected[key]))
      || ["parts", "mainDamage", "shrinkReduction"].some(key => !(key in expected) && key in row))
      return { ok: false, reason: "changed" };
    const options = { rank, shrink, flatReduction, negate, ethereal, standingReduction, woundedRanks };
    // Validate the historical row above, then account for protection gained
    // after publication before dividing the current incoming hit.
    const input=preventPhysical?{...source.input,immune:[...new Set([...(source.input.immune??[]),'physical'])]}:source.input;
    const plan = soulLinkDamage(input, { ...options, halve });
    if (!plan) {
      const unhalved = halve === true && !negate ? soulLinkDamage(input, options) : null;
      return { ok: false, reason: unhalved ? "halvingPending" : "input" };
    }
    const delivery = recipient => {
      const lanes = plan.shares.map(share => ({ type: share.type,
        damage: recipient ? share.transferred : share.casterDamage,
        wardTook: recipient ? 0 : share.wardPrevented }));
      return { damage: lanes.reduce((total, lane) => total + lane.damage, 0),
        type: lanes[0].type, wardTook: lanes[0].wardTook,
        ...(lanes.length > 1 ? { mainDamage: lanes[0].damage, parts: lanes.slice(1) } : {}) };
    };
    return { ok: true, plan, caster: delivery(false), recipient: delivery(true) };
  } catch { return { ok: false, reason: "input" }; }
}
