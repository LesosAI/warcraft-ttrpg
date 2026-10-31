import { IMAGE_PROJECTION_FLAG, projectionPhaseFor, projectionSettlement, validProjectionRecord } from "../rules/image-projection.mjs";

export const PROJECTION_COPY_FLAG = "spectralProjection";
export const PROJECTION_RECEIPT_FLAG = "projectionRecovery";
export const PROJECTION_VISIBILITY_FLAG = "projectionVisibility";
const SCOPE = "azeroth-rpg";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flag = (document, key) => document?.flags?.[SCOPE]?.[key];
const copyOf = (token, record) => {
  const copy = flag(token, PROJECTION_COPY_FLAG);
  return copy?.version === 1 && copy.cast === record.cast && copy.sourceUuid === record.sourceUuid
    && record.tokens.includes(token.uuid);
};
const present = (actor, effect) => resolve(actor.uuid) === actor && values(actor.effects).includes(effect);

/** Persist the original visibility with the hide. A retry must not replace it
 * with the already-hidden value from this cast. */
export async function hideProjectionSource(token, record) {
  if (!writer() || !validProjectionRecord(record) || resolve(token?.uuid) !== token
    || token.uuid !== record.sourceTokenUuid || token.actor?.uuid !== record.sourceUuid
    || flag(projectionPhaseFor(token.actor), IMAGE_PROJECTION_FLAG)?.record?.cast !== record.cast) return false;
  const previous = flag(token, PROJECTION_VISIBILITY_FLAG);
  if (previous) return previous.cast === record.cast && previous.sourceUuid === record.sourceUuid && token.hidden === true;
  await token.update({ hidden: true, [`flags.${SCOPE}.${PROJECTION_VISIBILITY_FLAG}`]: {
    cast: record.cast, sourceUuid: record.sourceUuid, wasHidden: token.hidden === true
  } }, { azerothProjectionVisibility: record.cast });
  return token.hidden === true && flag(token, PROJECTION_VISIBILITY_FLAG)?.cast === record.cast;
}

export async function restoreProjectionVisibility(token, cast) {
  if (!writer() || resolve(token?.uuid) !== token) return false;
  const owned = flag(token, PROJECTION_VISIBILITY_FLAG);
  if (!owned || owned.cast !== cast) return true;
  const update = { [`flags.${SCOPE}.${PROJECTION_VISIBILITY_FLAG}`]: null };
  if (owned.wasHidden === false && token.hidden === true) update.hidden = false;
  await token.update(update, { azerothProjectionVisibility: cast });
  if (flag(token, PROJECTION_VISIBILITY_FLAG)) throw new Error("Projection visibility restoration was not confirmed.");
  return true;
}

/** A later manual visibility choice belongs to the GM, not to this cast. */
export function preserveProjectionVisibilityChoice(token, change, options = {}) {
  const owned = flag(token, PROJECTION_VISIBILITY_FLAG);
  if (owned && Object.hasOwn(change, "hidden") && options.azerothProjectionVisibility !== owned.cast) {
    change[`flags.${SCOPE}.${PROJECTION_VISIBILITY_FLAG}`] = null;
  }
}

function snapshot(token) {
  const defeated = values(game.combats).some(combat => values(combat.combatants).some(c =>
    c.tokenId === token.id && (c.sceneId ?? combat.scene?.id) === token.parent?.id && c.defeated));
  return { uuid: token.uuid, ...flag(token, PROJECTION_COPY_FLAG), health: token.actor?.system?.health?.value, defeated };
}

/** A recovery receipt and its Health gain are one Actor update. If the response
 * is lost after persistence, a later sweep sees the receipt and only finishes
 * cleanup. Never split "healed" and Health into separately awaited writes. */
async function settle(actor, effect, reason) {
  const record = flag(effect, IMAGE_PROJECTION_FLAG)?.record;
  if (!writer() || !present(actor, effect) || !validProjectionRecord(record) || record.sourceUuid !== actor.uuid) return false;
  const tokens = record.tokens.map(resolve).filter(token => token && copyOf(token, record));
  const plan = projectionSettlement(record, tokens.map(snapshot), { reason, sourceAlive: actor.system?.health?.value > 0 });
  if (!plan) return false;
  if (flag(actor, PROJECTION_RECEIPT_FLAG)?.cast !== record.cast) {
    const health = actor.system?.health;
    if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max)) throw new Error("Projection recovery requires valid Health.");
    const healed = Math.max(0, Math.min(plan.heal, health.max - health.value));
    const update = { [`flags.${SCOPE}.${PROJECTION_RECEIPT_FLAG}`]: { cast: record.cast, reason, healed } };
    if (healed > 0) update["system.health.value"] = health.value + healed;
    await actor.update(update);
    if (flag(actor, PROJECTION_RECEIPT_FLAG)?.cast !== record.cast) throw new Error("Projection recovery was not confirmed.");
  }
  for (const uuid of plan.remove) {
    if (!writer()) return false;
    const token = resolve(uuid);
    if (!token || !copyOf(token, record)) continue;
    await token.delete();
    if (resolve(uuid)) throw new Error("Projection removal was not confirmed.");
  }
  if (!writer() || !present(actor, effect)) return false;
  const source = resolve(record.sourceTokenUuid);
  if (source && !await restoreProjectionVisibility(source, record.cast)) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  if (values(actor.effects).includes(effect)) throw new Error("Projection phase removal was not confirmed.");
  return true;
}

/** Recover a missed start-turn hook as well as the current Tutor turn. */
export function projectionRecoveryReason(actor, effect) {
  const record = flag(effect, IMAGE_PROJECTION_FLAG)?.record;
  if (!validProjectionRecord(record) || record.sourceUuid !== actor.uuid) return "abort";
  if (flag(effect, IMAGE_PROJECTION_FLAG)?.committed === false) return "abort";
  const source = resolve(record.sourceTokenUuid), combat = game.combats?.get(record.combatId);
  const combatant = combat?.combatants?.get(record.combatantId);
  if (projectionPhaseFor(actor) !== effect || !(actor.system?.health?.value > 0)
    || !source || source.actor !== actor || source.parent?.id !== record.sceneId
    || !combat?.started || !combatant || combatant.defeated
    || combatant.tokenId !== source.id || (combatant.sceneId ?? combat.scene?.id) !== record.sceneId) return "abort";
  const index = (combat.turns ?? []).findIndex(c => c.id === record.combatantId);
  if (!Number.isInteger(combat.round) || !Number.isInteger(combat.turn) || index < 0) return "abort";
  if (combat.round < record.round) return "abort";
  if (combat.round > record.round + 1 || (combat.round === record.round + 1 && combat.turn >= index)) return "complete";
  return null;
}

let pending = Promise.resolve();
/** Creation and recovery share this queue. Callers must not enqueue recursively. */
export function imageProjectionWrite(run) {
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}
export function reconcileImageProjections() {
  const run = async () => {
    if (!writer()) return 0;
    const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) if (token.actor) actors.set(token.actor.uuid, token.actor);
    let settled = 0;
    for (const actor of actors.values()) for (const effect of values(actor.effects)) {
      if (!writer()) return settled;
      if (!flag(effect, IMAGE_PROJECTION_FLAG) || !present(actor, effect)) continue;
      const reason = projectionRecoveryReason(actor, effect);
      if (reason && await settle(actor, effect, reason)) settled++;
    }
    // A deleted source or manually removed phase has no Actor left to settle.
    // Only this feature's versioned copy flags authorize orphan removal.
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
      if (!writer()) return settled;
      const visibility = flag(token, PROJECTION_VISIBILITY_FLAG);
      if (visibility?.cast && visibility.sourceUuid) {
        const phase = projectionPhaseFor(resolve(visibility.sourceUuid));
        if (flag(phase, IMAGE_PROJECTION_FLAG)?.record?.cast !== visibility.cast) await restoreProjectionVisibility(token, visibility.cast);
      }
      const copy = flag(token, PROJECTION_COPY_FLAG);
      if (copy?.version !== 1 || !copy.cast || !copy.sourceUuid) continue;
      const actor = resolve(copy.sourceUuid);
      const held = values(actor?.effects).some(effect => {
        const record = flag(effect, IMAGE_PROJECTION_FLAG)?.record;
        return validProjectionRecord(record) && copyOf(token, record);
      });
      if (!held && resolve(token.uuid) === token) await token.delete();
    }
    return settled;
  };
  return imageProjectionWrite(run);
}

export function registerImageProjectionHooks() {
  const sweep = () => {
    if (writer()) void reconcileImageProjections().catch(error => {
      console.warn("azeroth-rpg | Image Projection recovery", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.ImageProjection.RecoveryFailed"));
    });
  };
  Hooks.on("preUpdateToken", preserveProjectionVisibilityChoice);
  for (const hook of ["updateCombat", "deleteCombat", "deleteCombatant", "updateActor", "deleteActor", "deleteToken", "updateActiveEffect", "deleteActiveEffect", "updateUser"]) Hooks.on(hook, sweep);
  Hooks.once("ready", sweep);
}
