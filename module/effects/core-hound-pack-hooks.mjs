/** V14 lifecycle bridge. Serialize each combat's work, including Health
 * updates caused by revival, so they cannot overwrite a pending pack claim. */
import { CORE_HOUND_PACK_FLAG } from "../rules/core-hound-pack.mjs";
import { advanceFoundryCoreHoundPack } from "./core-hound-pack-foundry.mjs";
import { reportCoreHoundPack } from "./core-hound-pack-report.mjs";

const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const packsOf = combat => combat?.flags?.["azeroth-rpg"]?.[CORE_HOUND_PACK_FLAG] ?? {};

export function queueCoreHoundPacks(combat, options = {}) {
  if (!gmHere() || !combat?.uuid || !combat.started || !Object.keys(packsOf(combat)).length) return Promise.resolve([]);
  const expectedRound = combat.round, expectedTurn = combat.turn;
  const prior = queues.get(combat.uuid) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(async () => {
    if (!gmHere() || combat.round !== expectedRound || combat.turn !== expectedTurn) return [];
    const results = [];
    for (const packId of Object.keys(packsOf(combat))) {
      const result = await advanceFoundryCoreHoundPack(combat, packId, options);
      results.push({ packId, ...result });
      try { await reportCoreHoundPack(combat, packId, result); }
      catch { ui.notifications?.warn("Core Hound revival results could not be posted. Check Health and defeated markers; do not repeat the revival write."); }
      if (!result.ok && result.reason !== "busy") {
        ui.notifications?.warn("Core Hound pack revival could not be fully resolved. Review the pack before continuing.");
      }
    }
    return results;
  });
  queues.set(combat.uuid, next);
  void next.finally(() => { if (queues.get(combat.uuid) === next) queues.delete(combat.uuid); }).catch(() => {});
  return next;
}

export function registerCoreHoundPackHooks() {
  const run = (combat, options) => { void queueCoreHoundPacks(combat, options).catch(() => {
    ui.notifications?.warn("Core Hound pack revival could not be checked.");
  }); };
  Hooks.on("combatTurnChange", (combat, previous, current) => {
    if (Number.isInteger(previous?.round) && previous.round >= 1 && current?.round === previous.round + 1)
      run(combat, { roundEnd: true, endedRound: previous.round });
    else run(combat);
  });
  Hooks.on("updateActor", actor => {
    if (!gmHere()) return;
    for (const combat of game.combats?.contents ?? []) {
      if ((combat.combatants?.contents ?? []).some(row => row.actor === actor)) run(combat);
    }
  });
  Hooks.on("ready", () => { for (const combat of game.combats?.contents ?? []) run(combat); });
}
