/** Display only. A receipt never authorizes replay or proves Health loss:
 * completed means the damage workflow returned and that fact was recorded.
 */
export function starfallReceiptSummary(receipt) {
  const unknown = { state: "review", valid: false, total: null, completed: null, attempted: null, pending: null, rows: [] };
  if (!receipt || receipt.version !== 1 || !["claimed", "done"].includes(receipt.state)) return unknown;
  const { targets, completed, attempted } = receipt;
  const identities = list => Array.isArray(list) && list.every(uuid => typeof uuid === "string" && uuid.trim())
    && new Set(list).size === list.length;
  if (!identities(targets) || !identities(completed) || completed.length > targets.length
    || completed.some((uuid, index) => uuid !== targets[index])
    || (attempted !== null && attempted !== targets[completed.length])
    || attempted === undefined) return unknown;
  const finished = completed.length === targets.length && attempted === null;
  if (receipt.state === "done" && !finished) return unknown;
  return { state: receipt.state === "done" ? "done" : "review", valid: true,
    total: targets.length, completed: completed.length, attempted: attempted !== null ? 1 : 0,
    pending: targets.length - completed.length - (attempted !== null ? 1 : 0),
    rows: targets.map((uuid, index) => ({ uuid, state: index < completed.length ? "completed" : uuid === attempted ? "attempted" : "pending" })) };
}
