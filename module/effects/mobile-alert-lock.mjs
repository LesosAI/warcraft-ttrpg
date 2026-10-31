/** One active operation per alarm on this GM client. Durable receipts remain
 * the authority across clients, reconnects and GM handoffs. */
export const mobileAlertBusy = new Set();

/** Revisit a deferred interruption after an awaited menu or document write.
 * The lifecycle listener never starts another automatic placement here. */
export function releaseMobileAlert(token) {
  mobileAlertBusy.delete(token.uuid);
  globalThis.Hooks?.callAll?.("azerothMobileAlertIdle", token);
}
