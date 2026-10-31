/** Active-GM adapter for an explicitly configured pack on a Combat flag.
 * Uses V14 Combat.scene and TokenDocument.actor; linked tokens are refused
 * because writing one shared actor's Health cannot revive an individual. */
import { CORE_HOUND_PACK_FLAG, validCoreHoundPack } from "../rules/core-hound-pack.mjs";
import { advanceCoreHoundPack } from "./core-hound-pack.mjs";

const namespace = "azeroth-rpg";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);

export function coreHoundPackAdapter(combat, packId, { roundEnd = false, endedRound = null } = {}) {
  if (!combat || typeof packId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(packId)
    || typeof roundEnd !== "boolean"
    || (endedRound !== null && (!roundEnd || !Number.isInteger(endedRound)
      || endedRound < 1 || combat.round !== endedRound + 1))) return null;
  const liveRound = combat.round, round = liveRound, turn = combat.turn;
  const identities = new Map();
  const path = `flags.${namespace}.${CORE_HOUND_PACK_FLAG}.${packId}`;
  const read = () => {
    if (!gmHere() || resolve(combat.uuid) !== combat || !combat.started
      || combat.round !== liveRound || combat.turn !== turn) return null;
    const state = combat.flags?.[namespace]?.[CORE_HOUND_PACK_FLAG]?.[packId];
    if (!validCoreHoundPack(state) || state.combatUuid !== combat.uuid) return null;
    const scene = combat.scene;
    if (!scene || scene.uuid !== state.sceneUuid || resolve(scene.uuid) !== scene) return null;
    const actors = new Set(), members = [];
    for (const tokenUuid of state.tokenUuids) {
      const token = resolve(tokenUuid), actor = token?.actor;
      if (!token || token.documentName !== "Token" || token.parent !== scene
        || scene.tokens?.get(token.id) !== token || token.actorLink !== false
        || !actor || actor.type !== "npc" || actors.has(actor)
        || !(actor.system?.creatureAbilities ?? []).some(row => row.name === "Pack Rekindling")
        || !(combat.combatants?.contents ?? []).some(row => row.tokenId === token.id
          && row.sceneId === scene.id)) return null;
      const prior = identities.get(tokenUuid);
      if (prior && (prior.token !== token || prior.actor !== actor)) return null;
      identities.set(tokenUuid, { token, actor });
      actors.add(actor);
      members.push({ tokenUuid, health: { value: actor.system.health?.value, max: actor.system.health?.max } });
    }
    return { state: clone(state), snapshot: { sceneUuid: scene.uuid, combatUuid: combat.uuid,
      round, roundEnd, ...(endedRound === null ? {} : { completedRound: endedRound }), members } };
  };
  const assertCurrent = expected => {
    const current = read();
    if (!current || !same(current, expected)) throw Error("Core Hound pack changed before write");
  };
  return {
    key: `${combat.uuid}.${packId}`,
    read,
    async writeState(next, expected) {
      assertCurrent(expected);
      await combat.update({ [path]: clone(next) });
    },
    async restore(tokenUuid, health, expected) {
      assertCurrent(expected);
      if (!expected.state.tokenUuids.includes(tokenUuid)) throw Error("Unknown pack member");
      const token = resolve(tokenUuid);
      if (token.actor.system.health.value !== 0 || token.actor.system.health.max !== health)
        throw Error("Core Hound Health changed before revival");
      await token.actor.update({ "system.health.value": health });
      const revived = { ...expected, snapshot: { ...expected.snapshot,
        members: expected.snapshot.members.map(member => member.tokenUuid === tokenUuid
          ? { ...member, health: { ...member.health, value: health } } : member) } };
      assertCurrent(revived);
      const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
      for (const effect of [...(token.actor.effects ?? [])]) {
        if (!effect.statuses?.has(defeated)) continue;
        assertCurrent(revived);
        const statuses = [...effect.statuses].filter(status => status !== defeated);
        // A combined effect may carry other statuses or changes. Preserve it.
        if (statuses.length || effect.system?.changes?.length || effect.changes?.length) await effect.update({ statuses });
        else await effect.delete();
      }
      assertCurrent(revived);
      const combatants = (combat.combatants?.contents ?? []).filter(row => row.tokenId === token.id
        && row.sceneId === token.parent.id);
      for (const combatant of combatants) {
        assertCurrent(revived);
        if (combatant.defeated === true) await combatant.update({ defeated: false });
      }
      assertCurrent(revived);
      if (token.actor.statuses?.has(defeated) || combatants.some(row => row.defeated === true))
        throw Error("Core Hound defeat markers remain unresolved");
    }
  };
}

export async function advanceFoundryCoreHoundPack(combat, packId, options) {
  const adapter = coreHoundPackAdapter(combat, packId, options);
  if (!adapter) return { ok: false, reason: "arguments", restored: [], uncertain: [], deferred: [] };
  return advanceCoreHoundPack(adapter);
}
