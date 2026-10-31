import { regionDataFor } from "../canvas/regions.mjs";
import { snarePlacementProof, snarePlacementReviewPlan } from "../rules/snare-placement-review.mjs";

export const SNARE_PLACEMENT_QUERY = "azeroth-rpg.snarePlacement";
export const SNARE_PLACEMENT_REVIEW_QUERY = "azeroth-rpg.snarePlacementReview";
const pending = new Set();
const gridOf = scene => [scene?.grid?.type ?? null, scene?.grid?.size ?? null, scene?.grid?.distance ?? null];

/** Claim the card before creating a Region. Unknown writes are never retried. */
export async function snarePlacementHandler({ messageId, sceneId, origin } = {}, { user } = {}) {
  const authority = () => user?.id && game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  if (!authority() || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) return null;
  const message = game.messages.get(messageId), scene = game.scenes.get(sceneId);
  const flags = message?.flags?.["azeroth-rpg"];
  if (!message || !scene || (!user.isGM && user.viewedScene !== sceneId) || pending.has(messageId) || flags?.kind !== "feature" || flags.featureKey !== "snare"
    || flags.success === false || flags.snarePlacement != null || flags.snareTrigger != null) return null;
  const source = flags.source;
  const sourceToken = source?.sceneId && source?.tokenId ? game.scenes.get(source.sceneId)?.tokens.get(source.tokenId) : null;
  const actor = source?.sceneId && source?.tokenId ? sourceToken?.actor : game.actors.get(message.speaker?.actor);
  const item = actor?.items.get(flags.itemId);
  if (!actor?.testUserPermission(user, "OWNER") || item?.type !== "feature" || item.name !== "Snare") return null;
  // Legacy cards may already own an outline without a placement receipt.
  if ([...game.scenes].some(s => [...s.regions].some(r => r.flags?.["azeroth-rpg"]?.messageId === messageId))) return null;
  const live = () => authority() && game.messages.get(messageId) === message && game.scenes.get(sceneId) === scene
    && (user.isGM || user.viewedScene === sceneId)
    && (sourceToken ? game.scenes.get(source.sceneId)?.tokens.get(source.tokenId)?.actor === actor
      : game.actors.get(message.speaker?.actor) === actor)
    && actor.testUserPermission(user, "OWNER") && actor.items.get(item.id) === item;
  pending.add(messageId);
  try {
    const { regionFlagsFromCard } = await import("../dice/chat.mjs");
    if (!live() || message.flags["azeroth-rpg"].snarePlacement != null || message.flags["azeroth-rpg"].snareTrigger != null) return null;
    const regionId = foundry.utils.randomID();
    const record = { version: 1, phase: "claimed", sceneId, regionId, origin: { x: origin.x, y: origin.y } };
    const data = regionDataFor({ item, areaText: item.system.area, scene, origin: record.origin,
      flags: regionFlagsFromCard(message, actor, item) });
    if (!data) return null;
    record.proof = snarePlacementProof(data);
    record.grid = gridOf(scene);
    if (!record.proof) return null;
    await message.update({ "flags.azeroth-rpg.snarePlacement": record });
    if (!live() || JSON.stringify(message.flags["azeroth-rpg"].snarePlacement) !== JSON.stringify(record)) return null;
    const [region] = await scene.createEmbeddedDocuments("Region", [{ ...data, _id: regionId }], { keepId: true });
    if (!live() || !region || scene.regions.get(regionId) !== region
      || JSON.stringify(message.flags["azeroth-rpg"].snarePlacement) !== JSON.stringify(record)) return null;
    await message.update({ "flags.azeroth-rpg.snarePlacement.phase": "placed" });
    return live() ? region.uuid : null;
  } finally { pending.delete(messageId); }
}

/** Read-only recovery inspection. Never creates, deletes or refunds anything. */
export function snarePlacementReviewState(message) {
  const flags = message?.flags?.["azeroth-rpg"];
  const record = flags?.snarePlacement;
  const scene = game.scenes.get(record?.sceneId);
  const region = scene?.regions.get(record?.regionId);
  const stamp = JSON.stringify(record ?? null);
  if (flags?.kind !== "feature" || flags.featureKey !== "snare"
    || JSON.stringify(record?.grid) !== JSON.stringify(gridOf(scene))) return { ok: false, reason: "state", stamp };
  return { ...snarePlacementReviewPlan(record, region?.toObject() ?? null,
    { triggered: flags.snareTrigger != null, pending: pending.has(message.id) }), stamp, regionUuid: region?.uuid ?? null };
}

/** A GM explicitly confirms the exact existing Region after inspecting the claim. */
export async function snarePlacementReviewHandler({ messageId, expected } = {}, { user } = {}) {
  const authority = () => user?.id && user.isGM && game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  if (!authority()) return { ok: false, reason: "authority" };
  const message = game.messages.get(messageId);
  const state = snarePlacementReviewState(message);
  if (!state.ok || expected !== state.stamp) return { ok: false, reason: state.ok ? "changed" : state.reason };
  pending.add(messageId);
  try {
    await message.update({ "flags.azeroth-rpg.snarePlacement.phase": "placed",
      "flags.azeroth-rpg.snarePlacement.reviewedBy": user.id,
      "flags.azeroth-rpg.snarePlacement.reviewedAt": game.time?.worldTime ?? 0 });
    const record = message.flags?.["azeroth-rpg"]?.snarePlacement;
    const scene = game.scenes.get(record?.sceneId), region = scene?.regions.get(record?.regionId);
    return { ok: Boolean(authority() && game.messages.get(messageId) === message && record?.phase === "placed"
      && region?.uuid === state.regionUuid && JSON.stringify(snarePlacementProof(region.toObject())) === JSON.stringify(state.proof)) };
  } finally { pending.delete(messageId); }
}

export async function placeSnareFromCard(message, { scene, origin }) {
  const gm = game.users?.activeGM;
  try {
    if (!gm) throw new Error("No active GM");
    const payload = { messageId: message.id, sceneId: scene.id, origin: { x: origin.x, y: origin.y } };
    const uuid = gm.id === game.user.id ? await snarePlacementHandler(payload, { user: game.user })
      : await gm.query(SNARE_PLACEMENT_QUERY, payload, { timeout: 15000 });
    if (uuid) return await fromUuid(uuid);
  } catch (error) { console.warn("azeroth-rpg | Snare placement was not confirmed", error); }
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Snare.PlacementRefused"));
  return null;
}
