/** Ancient Core Hounds have one innate special, not a six-spell repertoire.
 * Numeric combat effects are authored separately; this is choice identity. */
export const ANCIENT_SPECIAL_FLAG = "ancientCoreHoundSpecial";
export const ANCIENT_SPECIALS = Object.freeze([
  Object.freeze({ key: "ground-stomp", name: "Ground Stomp", spellId: 19364 }),
  Object.freeze({ key: "ancient-dread", name: "Ancient Dread", spellId: 19365 }),
  Object.freeze({ key: "ancient-despair", name: "Ancient Despair", spellId: 19369 }),
  Object.freeze({ key: "cauterizing-flames", name: "Cauterizing Flames", spellId: 19366 }),
  Object.freeze({ key: "withering-heat", name: "Withering Heat", spellId: 19367 }),
  Object.freeze({ key: "ancient-hysteria", name: "Ancient Hysteria", spellId: 19372 })
]);

export function ancientSpecialOf(state) {
  if (!state || state.version !== 1 || typeof state.ownerUuid !== "string" || !state.ownerUuid.trim()) return null;
  return ANCIENT_SPECIALS.find(row => row.key === state.key) ?? null;
}

/** A chosen special is stable across uses and reloads. Resetting it must be an
 * explicit separate GM configuration action; requesting another does not reset. */
export function chooseAncientSpecial({ ownerUuid, key, existing = null, draw = null } = {}) {
  const refuse = reason => ({ ok: false, reason, state: null, special: null });
  if (typeof ownerUuid !== "string" || !ownerUuid.trim()) return refuse("owner");
  if (existing !== null) {
    const held = ancientSpecialOf(existing);
    if (!held || existing.ownerUuid !== ownerUuid) return refuse("state");
    if (key !== held.key && key !== "random") return refuse("locked");
    return { ok: true, reason: null, state: { ...existing }, special: held };
  }
  let chosen;
  if (key === "random") {
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return refuse("draw");
    chosen = ANCIENT_SPECIALS[Math.floor(draw * ANCIENT_SPECIALS.length)];
  } else chosen = ANCIENT_SPECIALS.find(row => row.key === key);
  if (!chosen) return refuse("choice");
  return { ok: true, reason: null, state: { version: 1, ownerUuid, key: chosen.key }, special: chosen };
}

/** The caller supplies the actual actor/token UUID; a shared base actor's choice
 * must not silently authorize a different unlinked token's special. */
export function ancientSpecialAllowed(state, ownerUuid, name) {
  const special = ancientSpecialOf(state);
  return Boolean(special && state.ownerUuid === ownerUuid && special.name === name);
}
