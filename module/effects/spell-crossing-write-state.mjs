/** Live writer guard; persisted claims remain authoritative after disconnect. */
export const crossingWrites = new Set();
