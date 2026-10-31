import { IMAGE_PROJECTION_FLAG, projectionPhaseEffect, validProjectionRecord } from "../rules/image-projection.mjs";
import { PROJECTION_COPY_FLAG, hideProjectionSource } from "../effects/image-projection-lifecycle.mjs";
const SCOPE = "azeroth-rpg";
const flags = effect => effect?.flags?.[SCOPE]?.[IMAGE_PROJECTION_FLAG];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Commit a paid, reviewed cast under imageProjectionWrite. The caller owns
 * payment and its durable receipt; this function never charges or retries it.
 * Persist an uncommitted phase before tokens so interrupted creation is an
 * abort on recovery, not a heal or an invitation to create more copies. */
export async function createProjectionTokens({ actor, sourceToken, scene, combat, record, projection, positions, valid }) {
  const refuse = reason => ({ ok: false, reason });
  if (![actor, sourceToken, scene, combat, projection].every(Boolean) || !validProjectionRecord(record)
    || typeof valid !== "function" || !Array.isArray(positions) || positions.length !== 5
    || positions.some(p => ![p?.x, p?.y, p?.elevation].every(Number.isFinite))) return refuse("invalid");
  const ids = record.tokens.map(uuid => uuid.startsWith(`${scene.uuid}.Token.`) ? uuid.slice(`${scene.uuid}.Token.`.length) : null);
  if (ids.some(id => !id || id.includes("."))) return refuse("invalid");
  const current = () => writer() && fromUuidSync(actor.uuid) === actor && sourceToken.actor === actor
    && scene.tokens.get(sourceToken.id) === sourceToken && sourceToken.uuid === record.sourceTokenUuid
    && actor.uuid === record.sourceUuid && scene.id === record.sceneId && combat.id === record.combatId
    && game.combats.get(combat.id) === combat && combat.started && combat.round === record.round
    && valid();
  if (!current()) return refuse("changed");
  // An uncertain prior write needs recovery. Never duplicate its tokens.
  if ([...actor.effects].some(e => flags(e)) || ids.some(id => scene.tokens.has(id))) return refuse("existing");
  const data = projectionPhaseEffect(record);
  data.flags[SCOPE][IMAGE_PROJECTION_FLAG].committed = false;
  const made = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  const effect = made?.[0];
  if (!effect || ![...actor.effects].includes(effect) || flags(effect)?.record?.cast !== record.cast || !current()) return refuse("unconfirmed");
  const prototype = projection.prototypeToken.toObject();
  const tokens = positions.map((position, i) => ({ ...prototype, ...position, _id: ids[i], actorId: projection.id,
    actorLink: false, disposition: sourceToken.disposition,
    flags: { ...prototype.flags, [SCOPE]: { ...prototype.flags?.[SCOPE], [PROJECTION_COPY_FLAG]: {
      version: 1, cast: record.cast, sourceUuid: record.sourceUuid
    } } } }));
  await scene.createEmbeddedDocuments("Token", tokens, { keepId: true });
  const placed = ids.map(id => scene.tokens.get(id));
  if (!current() || placed.some((token, i) => token?.uuid !== record.tokens[i]
    || token.flags?.[SCOPE]?.[PROJECTION_COPY_FLAG]?.cast !== record.cast)) return refuse("unconfirmed");
  const sourceCombatant = combat.combatants.get(record.combatantId);
  if (!sourceCombatant || sourceCombatant.tokenId !== sourceToken.id || !Number.isFinite(sourceCombatant.initiative)) return refuse("combat");
  // They take ordinary turns after the Tutor, not free attacks in this workflow.
  await combat.createEmbeddedDocuments("Combatant", placed.map(token => ({ tokenId: token.id, sceneId: scene.id,
    actorId: token.actorId, initiative: sourceCombatant.initiative - 0.01 })));
  if (!current() || placed.some(token => ![...combat.combatants.values()].some(c => c.tokenId === token.id && c.sceneId === scene.id))) return refuse("unconfirmed");
  if (!await hideProjectionSource(sourceToken, record) || !current()) return refuse("unconfirmed");
  await effect.update({ [`flags.${SCOPE}.${IMAGE_PROJECTION_FLAG}.committed`]: true });
  if (flags(effect)?.committed !== true) return refuse("unconfirmed");
  return { ok: true, cast: record.cast, tokens: [...record.tokens] };
}
