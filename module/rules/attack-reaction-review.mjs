/** Acknowledged manual reconciliation closes a reaction attempt. Dispersion
 * additionally requires the whole hit to have been settled and closes it.
 * The caller must serialize and authorize the write. No payment, effect, damage
 * or refund is inferred here; replay guards remain even after a failed attempt. */
export function reviewedAttackReaction(state, index, { userId, at, damageReconciled = false } = {}) {
  if (state?.version !== 1 || !Array.isArray(state.targets) || !Number.isInteger(index) || index < 0
    || typeof userId !== "string" || !userId || !Number.isFinite(at)) return null;
  const row = state.targets[index];
  if (!row || !["warding", "blocking", "parrying", "dispersing"].includes(row.stage)
    || typeof row.targetUuid !== "string" || !row.targetUuid) return null;
  if (row.stage === "warding" && (typeof row.wardBy !== "string" || !row.wardBy
    || (row.wardedBy !== undefined && !Array.isArray(row.wardedBy)))) return null;
  if (row.stage === "parrying" && (typeof row.parryKey !== "string" || !row.parryKey)) return null;
  if (row.reactionReviews !== undefined && !Array.isArray(row.reactionReviews)) return null;
  if (row.stage === "dispersing" && damageReconciled !== true) return null;
  const next = structuredClone(state), result = next.targets[index];
  if (row.stage === "warding") result.wardedBy = [...new Set([...(row.wardedBy ?? []), row.wardBy])];
  if (row.stage === "blocking") result.blocked = true;
  if (row.stage === "parrying") result.parryAttempted = true;
  if (row.stage === "dispersing") result.dispersionAttempted = true;
  result.reactionReviews = [...(row.reactionReviews ?? []), {
    stage: row.stage, userId, at,
    ...(row.stage === "dispersing" ? { damageReconciled: true } : {}),
    ...(row.stage === "warding" ? { wardBy: row.wardBy } : {}),
    ...(row.stage === "parrying" ? { parryKey: row.parryKey } : {})
  }];
  result.stage = row.stage === "dispersing" ? "applied" : "pending";
  return next;
}
