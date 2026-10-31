import { MIGHTY_BLOW_RECEIPTS, resumeMightyBlow } from "./mighty-blow-state.mjs";
import { resolveMightyBlowPush } from "./mighty-blow-push.mjs";
import { mightyBlowHit } from "../rules/mighty-blow.mjs";
export const MIGHTY_BLOW_APPLY_QUERY = "azeroth-rpg.mightyBlowApply";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

/** Called after the target's ordinary damage Apply, including absorbed hits.
 * The saved use identifies this attack; no client-supplied ability or DC is used. */
export async function mightyBlowApplyQueryHandler({ messageUuid, index } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || index !== 0) return refuse("unavailable");
  const card = await fromUuid(messageUuid), flags = card?.flags?.["azeroth-rpg"];
  if (card?.documentName !== "ChatMessage" || game.messages?.get(card.id) !== card
    || !mightyBlowHit({ flags, index })) return refuse("hit");
  const scene = game.scenes?.get(flags.source?.sceneId);
  const source = scene?.tokens.get(flags.source?.tokenId), actor = source?.actor;
  const targetRow = flags.targets?.[0];
  const target = targetRow?.sceneId === scene?.id ? scene?.tokens.get(targetRow.tokenId) : null;
  if (!actor || !target?.actor || flags.targets.length !== 1) return refuse("identity");
  if (!target.actor.testUserPermission(user, "OWNER")) return refuse("permission");
  const receipts = actor.getFlag("azeroth-rpg", MIGHTY_BLOW_RECEIPTS);
  if (!Array.isArray(receipts)) return refuse("absent");
  const matching = receipts.filter(row => row?.attackCardId === card.id);
  if (matching.length !== 1) return refuse("absent");
  const record = matching[0], saved = record.progress;
  if (record.stage !== "awaitingApply") return refuse("alreadyClaimed");
  if (!saved || saved.stage !== "awaitingApply" || saved.source?.sceneId !== scene.id
    || saved.source.tokenId !== source.id || saved.target?.sceneId !== scene.id
    || saved.target.tokenId !== target.id || saved.targetUuid !== target.actor.uuid) return refuse("identity");
  const victim = target.actor;
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const validate = () => gmHere() && game.scenes.get(scene.id) === scene
    && scene.tokens.get(source.id) === source && scene.tokens.get(target.id) === target
    && source.actor === actor && target.actor === victim && fromUuidSync(victim.uuid) === victim
    && victim.testUserPermission(user, "OWNER") && clock() === saved.clock
    && point(source) === saved.sourcePoint && point(target) === saved.targetPoint
    && scene.levels?.has(source._source?.level) && source._source?.level === target._source?.level
    && JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source)) === saved.walls;
  const result = await resumeMightyBlow({ actor, card, validate,
    resolve: control => resolveMightyBlowPush({ actor, source, target, ...control }) });
  if (result.ok && result.result?.pushed === true) {
    try {
      const useSource = { sceneId: scene.id, tokenId: source.id };
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p><strong>Mighty Blow</strong></p><p>The target is pushed away.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: useSource ?? null,
          featureKey: "ability:mighty-blow-push",
          casting: false, success: true, targets: [{ sceneId: scene.id, tokenId: target.id }],
          mightyBlow: { attackCardId: card.id } } } });
    } catch (error) { console.warn("azeroth-rpg | Mighty Blow resolved; push feedback unavailable", error); }
  }
  return result;
}

export async function requestMightyBlowApply(message, index) {
  if (index !== 0 || !mightyBlowHit({ flags: message?.flags?.["azeroth-rpg"], index })) return null;
  const flags = message.flags["azeroth-rpg"];
  const actor = game.scenes?.get(flags.source?.sceneId)?.tokens.get(flags.source?.tokenId)?.actor;
  const receipts = actor?.getFlag("azeroth-rpg", MIGHTY_BLOW_RECEIPTS);
  if (!Array.isArray(receipts) || !receipts.some(row => row?.attackCardId === message.id)) return null;
  try {
    const data = { messageUuid: message.uuid, index };
    const result = gmHere() ? await mightyBlowApplyQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(MIGHTY_BLOW_APPLY_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "alreadyClaimed")
      ui.notifications?.warn("Mighty Blow's push could not finish. Review its saved attack and push before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Mighty Blow Apply interrupted", error);
    ui.notifications?.warn("Mighty Blow's push was interrupted. Review its saved attempt before continuing.");
    return null;
  }
}
