import { isNpcSneakEffect, npcSneakEnds } from "../rules/npc-sneak.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const queues = new Map();

/** Activation and cleanup share the actor queue to avoid a stale cleanup
 * deleting a replacement carrier. Failed work must not poison later work. */
export async function withNpcSneakLock(uuid, work) {
  const previous = queues.get(uuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(uuid, next);
  try { return await next; }
  finally { if (queues.get(uuid) === next) queues.delete(uuid); }
}

export function npcSneakInCombat(actor) {
  return values(globalThis.game?.combats).some(combat => combat.started
    && values(combat.combatants).some(row => row.actor?.uuid === actor?.uuid));
}

/** Deletes only this actor's identified Sneak carrier. Core status toggling
 * would also strip independent invisibility, so it must not be used here. */
export async function endNpcSneak(actor, { event = null } = {}) {
  if (!actor?.uuid || actor.isOwner !== true) return false;
  return withNpcSneakLock(actor.uuid, async () => {
    if (!actor.isOwner || !npcSneakEnds({ event, inCombat: npcSneakInCombat(actor), health: actor.system?.health?.value })) return false;
    const ids = values(actor.effects).filter(effect => isNpcSneakEffect(effect, actor.uuid)).map(effect => effect.id);
    if (!ids.length) return false;
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return true;
  });
}

/** Active GM handles engagement/death and reconciles saved carriers on load,
 * including synthetic actors on scenes other than the currently viewed one. */
export function registerNpcSneakHooks() {
  const clean = actor => gmHere() ? endNpcSneak(actor).catch(error => {
    console.warn("azeroth-rpg | Sneak cleanup", error);
    globalThis.ui?.notifications?.warn("Sneak cleanup failed. Check concealment and Speed on the affected creature.");
  }) : undefined;
  const scan = () => {
    if (!gmHere()) return;
    const actors = [...values(game.actors), ...values(game.scenes).flatMap(scene => values(scene.tokens).map(token => token.actor))];
    const unique = new Map(actors.filter(actor => actor?.uuid).map(actor => [actor.uuid, actor]));
    return Promise.all([...unique.values()].map(clean));
  };
  Hooks.on("ready", scan);
  Hooks.on("updateCombat", scan);
  Hooks.on("createCombatant", scan);
  Hooks.on("updateCombatant", scan);
  Hooks.on("updateUser", scan);
  Hooks.on("updateActor", clean);
  Hooks.on("createActiveEffect", effect => effect.parent?.documentName === "Actor" ? clean(effect.parent) : undefined);
}
