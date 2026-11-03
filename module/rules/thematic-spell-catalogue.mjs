/**
 * Thematic spells have dedicated workflows; their prose must not grant the
 * generic spell-card automation inferred for ordinary spells.
 */
export const identifierSet = new Set([
  "heat-mirage",
  "phoenix-courier",
  "icevein-passage",
  "arcane-seal",
  "spell-relay",
  "grand-lexicon",
  "scentweave",
  "tidebreath",
  "phantom-footsteps",
  "mindstatic",
  "summoners-writ",
  "prayer-of-mending",
  "ash-assay",
  "rime-arrest",
  "exacting-measure",
  "spellwrights-mark",
  "seedwake",
  "watershed",
  "borrowed-voice",
  "dream-theatre",
  "pact-escrow",
  "fel-surety",
  "gentle-verdict",
  "pilgrims-burden"
]);

const ONE_MINUTE_CASTS = new Set([
  "spellwrights-mark",
  "seedwake",
  "dream-theatre",
  "pact-escrow",
  "pilgrims-burden"
]);

function identifierOf(value) {
  if (typeof value === "string") return value;
  return value?.system?.identifier ?? value?.identifier ?? "";
}

export function isThematicSpell(value) {
  return identifierSet.has(identifierOf(value));
}

/** Seconds required to complete a thematic spell's explicitly timed cast. */
export function castingSeconds(value) {
  return ONE_MINUTE_CASTS.has(identifierOf(value)) ? 60 : 0;
}
