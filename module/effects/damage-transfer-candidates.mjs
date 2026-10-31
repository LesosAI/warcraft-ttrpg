import { redirectCandidates, divisionCandidates } from "./blow-doors.mjs";
import { prepareSoulLinkDamage } from "./soul-link-damage.mjs";

const whole = n => Number.isSafeInteger(n) && n >= 0;
const keyFor = (...parts) => JSON.stringify(parts);
const refuse = reason => ({ ok: false, reason, candidates: [] });

/** Read-only composition for the original target's one-transfer chooser.
 * Amounts belong to different existing mitigation stages: the damage writer
 * must supply both explicitly. Soul Link reconstructs its own pre-Ward lanes
 * from the recorded hit and takes one-blow reduction, Ethereal Form and
 * standing reduction separately. Do not combine the two reduction stages.
 * Returned document references stay on the authoritative client; they are not
 * a query payload or permission to deliver damage.
 */
export function damageTransferCandidates({ target, row, redirectAmount, divisionAmount, flatReduction,
  type = null, attack = false, spell = false, messageId = null, by = null,
  moved = false, shared = false, transferred = false, negate = false, ethereal = false, standingReduction = 0,
  woundedRanks = 0, halve = false, sourceState = null } = {}) {
  // A transferred share cannot start any further transfer, including a
  // reciprocal Soul Link. Do not even consult the other discovery services.
  if (moved === true || shared === true || transferred === true) return { ok: true, candidates: [] };
  if (!target?.uuid || !whole(redirectAmount) || !whole(divisionAmount) || !whole(flatReduction)) return refuse("input");
  if (typeof negate !== "boolean" || (negate && (redirectAmount !== 0 || divisionAmount !== 0))) return refuse("input");
  if (typeof ethereal !== "boolean" || typeof halve !== "boolean" || !whole(standingReduction) || !whole(woundedRanks)) return refuse("input");
  // The authoritative damage stage supplies Parry's outcome. A fully negated
  // hit cannot transfer, even when its pre-Ward record still contains damage.
  if (negate) return { ok: true, candidates: [] };
  try {
    const link = prepareSoulLinkDamage(target, row, { flatReduction, ethereal, standingReduction, woundedRanks, halve });
    if (!link.ok) return refuse(link.reason);
    const blow = structuredClone({ messageId, type, attack, spell, byUuid: by?.uuid ?? null, row, sourceState });
    const candidates = [];
    const hit = { target, amount: redirectAmount, type, attack, spell, messageId, by };
    for (const plan of redirectCandidates(hit)) {
      candidates.push({ kind: "redirect", key: keyFor("redirect", plan.key), available: true, plan,
        evidence: { blow, targetUuid: target.uuid, holderUuid: plan.holder.uuid, row: structuredClone(plan.row),
          amount: redirectAmount, moved: plan.moved, type, attack, spell, messageId, byUuid: by?.uuid ?? null } });
    }
    for (const plan of divisionCandidates({ target, amount: divisionAmount })) {
      candidates.push({ kind: "division", key: keyFor("division", plan.key), available: plan.available === true, plan,
        evidence: { blow, targetUuid: target.uuid, holderUuid: plan.holderUuid, totemUuid: plan.totemUuid,
          tokenUuid: plan.tokenUuid, amount: divisionAmount, keep: plan.keep,
          others: plan.others.map(p => ({ actorUuid: p.actor.uuid, share: p.share })).sort((a, b) => a.actorUuid.localeCompare(b.actorUuid)) } });
    }
    if (link.linked) candidates.push({ kind: "soulLink",
      key: keyFor("soulLink", target.uuid, link.effect.id, link.snapshot.cast, link.recipient.uuid),
      available: true, plan: link, evidence: { blow, link: link.snapshot } });
    candidates.sort((a, b) => a.key.localeCompare(b.key));
    return { ok: true, candidates };
  } catch { return refuse("unavailable"); }
}

/** Re-discover the exact selected option. A changed choice never substitutes
 * a different holder/totem/link or silently falls back to unshared damage.
 * The caller must supply current mitigation values, not reuse stored evidence.
 */
export function refreshDamageTransferChoice(selected, current) {
  if (!selected?.key || !selected.evidence) return refuse("selection");
  const fresh = damageTransferCandidates(current);
  if (!fresh.ok) return fresh;
  const candidate = fresh.candidates.find(option => option.key === selected.key);
  if (!candidate || !candidate.available || JSON.stringify(candidate.evidence) !== JSON.stringify(selected.evidence))
    return refuse("choiceChanged");
  return { ok: true, candidate };
}
