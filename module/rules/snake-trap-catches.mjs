/** A resisted poison still spends that creature's exposure to this trap. */
export function snakeTrapCatchPlan(record, actorUuid) {
  if (record?.version !== 1 || !["first", "all"].includes(record.reach)
    || typeof record.trapId !== "string" || !record.trapId
    || typeof actorUuid !== "string" || !actorUuid
    || !Array.isArray(record.catches) || record.catches.some(uuid => typeof uuid !== "string" || !uuid)) {
    return { ok: false, reason: "invalid" };
  }
  if (record.catches.includes(actorUuid)) return { ok: false, reason: "answered" };
  if (record.reach === "first" && record.catches.length) return { ok: false, reason: "spent" };
  return { ok: true, catches: [...record.catches, actorUuid] };
}
