import { MOBILE_ALERT } from "./mobile-alert.mjs";
const id = value => typeof value === "string" && value.trim().length > 0;
const refuse = reason => ({ ok: false, reason });

/** Recovery never creates or heals a sentry. Reset explicitly removes the
 * reviewed alarm's remaining tokens before its receipt can be cleared. */
export function mobileAlertRecovery({ ownerUuid, record, tokens, inventoryComplete = false,
  operation = "recover", pendingStopped = false, inCombat = false } = {}) {
  if (!id(ownerUuid) || record?.version !== 1 || record.tokenUuid !== ownerUuid || !id(record.cast)
    || !["paying", "arming", "placing", "summoned", "cancelled", "reviewed", "clearing"].includes(record.phase)) return refuse("record");
  if (!["recover", "reset"].includes(operation) || !pendingStopped) return refuse("review");
  if (!inventoryComplete || !Array.isArray(tokens)) return refuse("inventory");
  const owned = tokens.filter(token => token?.ownerUuid === ownerUuid);
  if (inCombat || owned.some(token => token.inCombat)) return refuse("combat");
  if (owned.length > MOBILE_ALERT.count || new Set(owned.map(token => token.uuid)).size !== owned.length) return refuse("multiple");
  if (owned.some(token => !id(token.uuid) || token.cast !== record.cast || token.entry !== MOBILE_ALERT.entry)) return refuse("identity");
  const uuids = owned.map(token => token.uuid).sort();
  if (operation === "reset") return { ok: true, action: uuids.length ? "remove" : "clear", tokens: uuids };
  return { ok: true, action: "retain", record: { ...record,
    phase: uuids.length === MOBILE_ALERT.count ? "summoned" : "reviewed", tokens: uuids } };
}
