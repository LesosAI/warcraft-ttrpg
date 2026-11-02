/** Cleanup in progress on this client; reconciliation must wait for it to settle. */
export const sealingFlameWrites = new Set();
export const sealingFlameReservations = new Set();
