/** Sea Spray's Geyser: a resisted push and Slow, never damage. Pure law. */
export const GEYSER = Object.freeze({ name: "Geyser", action: "action", uses: 1,
  per: "encounter", radius: 10, push: 10, dc: 17, resist: "body", condition: "slowed", until: "nextTurnEnd" });

/** The caller measures distance, checks walls/level and authenticates ownership.
 * Refuse an invalid selection before paying; never silently drop a target. */
export function geyserTargets(targets = []) {
  if (!Array.isArray(targets) || !targets.length) return { ok: false, reason: "targets" };
  const seen = new Set();
  for (const target of targets) {
    if (!target?.uuid || seen.has(target.uuid)) return { ok: false, reason: "identity" };
    seen.add(target.uuid);
    if (target.enemy !== true || target.alive !== true) return { ok: false, reason: "enemy" };
    if (target.sameLevel !== true || target.clearPath !== true) return { ok: false, reason: "path" };
    if (!Number.isFinite(target.distance) || target.distance < 0 || target.distance > GEYSER.radius)
      return { ok: false, reason: "range" };
  }
  return { ok: true, targets: targets.map(target => target.uuid) };
}

/** An immutable per-target receipt. Each mutation must be claimed and saved
 * before the runtime performs it. An unresolved claim requires reconciliation;
 * it must never be treated as permission to retry the mutation. */
export function geyserResolution(targetUuid, passed) {
  if (typeof targetUuid !== "string" || !targetUuid || typeof passed !== "boolean") return null;
  return { version: 1, targetUuid, passed, stage: passed ? "complete" : "push", pending: null, push: null, slow: null };
}

export function claimGeyserStep(state) {
  if (!state || state.version !== 1 || state.pending || !["push", "slow"].includes(state.stage)) return null;
  return { ...state, pending: state.stage };
}

/** A blocked push is a resolved outcome, not a successful save. Slow still
 * follows. Condition immunity similarly does not undo an already resolved push. */
export function finishGeyserStep(state, step, outcome) {
  if (!state || state.version !== 1 || state.stage !== step || state.pending !== step) return null;
  if (step === "push") {
    if (!outcome || typeof outcome.moved !== "boolean" || !Number.isFinite(outcome.feet)
      || outcome.feet < 0 || outcome.feet > GEYSER.push || (!outcome.moved && outcome.feet !== 0)) return null;
    return { ...state, pending: null, stage: "slow", push: { moved: outcome.moved, feet: outcome.feet, reason: outcome.reason ?? null } };
  }
  if (step === "slow") {
    if (!outcome || !["applied", "existing", "immune", "fallen"].includes(outcome.status)) return null;
    return { ...state, pending: null, stage: "complete", slow: { status: outcome.status } };
  }
  return null;
}
