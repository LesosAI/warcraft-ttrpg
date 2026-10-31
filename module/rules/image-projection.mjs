/** Spectral Tutor's tabletop adaptation; Classic evidence is in the design review. */
export const IMAGE_PROJECTION_FLAG = "imageProjection";
export const IMAGE_PROJECTION = Object.freeze({ name: "Image Projection", action: "action", mana: 4,
  count: 5, feet: 15, healEach: 4, uses: 1, per: "short" });
export const TUTOR_SILENCE = Object.freeze({ name: "Tutor Silence", action: "half", mana: 2,
  radius: 15, dc: 20, resilience: "spirit", uses: 1, per: "short" });
const id = value => typeof value === "string" && value.trim().length > 0;

/** A cast owns concrete tokens, never every projection with the same name. */
export function projectionRecord({ cast, sourceUuid, sourceTokenUuid, sceneId, combatId, combatantId, round, tokens } = {}) {
  if (![cast, sourceUuid, sourceTokenUuid, sceneId, combatId, combatantId].every(id)
    || !Number.isInteger(round) || round < 1 || !Array.isArray(tokens)
    || tokens.length !== IMAGE_PROJECTION.count || !tokens.every(id)
    || new Set(tokens).size !== tokens.length || tokens.includes(sourceTokenUuid)) return null;
  return { version: 1, cast, sourceUuid, sourceTokenUuid, sceneId, combatId, combatantId, round, tokens: [...tokens] };
}

export function validProjectionRecord(record) {
  return record?.version === 1 && projectionRecord(record) !== null;
}

/** Only the Tutor's own active phase grants protection, never a copy's mark. */
export function projectionPhaseFor(actor) {
  return [...(actor?.effects ?? [])].find(effect => {
    const phase = effect.flags?.["azeroth-rpg"]?.[IMAGE_PROJECTION_FLAG];
    return !effect.disabled && !effect.isSuppressed && effect.active !== false
      && ["projecting", "settling"].includes(phase?.state)
      && validProjectionRecord(phase?.record) && phase.record.sourceUuid === actor.uuid;
  }) ?? null;
}

export function projectionRefusal(actor, operation) {
  if (!projectionPhaseFor(actor) || operation === "resilience") return null;
  return "AZEROTH.ImageProjection.CannotAct";
}

export function projectionPhaseEffect(record) {
  if (!validProjectionRecord(record)) return null;
  return { name: IMAGE_PROJECTION.name, origin: record.sourceUuid, img: "icons/svg/ghost.svg",
    disabled: false, statuses: [],
    system: { changes: [{ key: "system.speed", type: "override", value: "0", phase: "final", priority: 100 }] },
    flags: { "azeroth-rpg": { [IMAGE_PROJECTION_FLAG]: { state: "projecting", record: { ...record, tokens: [...record.tokens] } } } } };
}

/** Source's next turn, not a projection's turn or an unrelated combat. */
export function projectionTurnDue(record, { combatId, combatantId, round } = {}) {
  return validProjectionRecord(record) && record.combatId === combatId
    && record.combatantId === combatantId && Number.isInteger(round) && round > record.round;
}

/** Pure settlement plan. The adapter must durably claim it before any writes.
 * Token snapshots carry this cast's flag; deleted, foreign and defeated copies
 * cannot contribute healing. Abort removes surviving owned tokens without healing.
 */
export function projectionSettlement(record, tokens = [], { reason = "abort", sourceAlive = false } = {}) {
  if (!validProjectionRecord(record) || !["complete", "abort"].includes(reason) || !Array.isArray(tokens)) return null;
  const mine = new Map();
  for (const token of tokens) {
    if (!record.tokens.includes(token?.uuid) || token?.cast !== record.cast || token?.sourceUuid !== record.sourceUuid) continue;
    if (!mine.has(token.uuid)) mine.set(token.uuid, token);
  }
  const survivors = [...mine.values()].filter(t => Number.isFinite(t.health) && t.health > 0 && t.defeated !== true);
  return { cast: record.cast, remove: [...mine.keys()], survivors: survivors.map(t => t.uuid),
    heal: reason === "complete" && sourceAlive === true ? survivors.length * IMAGE_PROJECTION.healEach : 0 };
}
