import { postStarfallOffers, refreshStarfallOffers } from "./starfall-offers.mjs";

let queue = Promise.resolve();
const gmReady = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
  && game.system?.azeroth?.readyWorkDone === true;

/** Recover presentation from saved snapshots/receipts only. Never capture a
 * new turn snapshot, deliver damage, clear an attempt, or refund anything.
 */
export function recoverStarfallOffers() {
  const run = async () => {
    if (!gmReady()) return;
    for (const combat of game.combats.values()) {
      if (!gmReady()) return;
      try {
        if (combat.started) await postStarfallOffers(combat);
        else await refreshStarfallOffers(combat);
      } catch (error) { console.warn("Starfall offer recovery failed", error); }
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

/** Native V14 userConnected fires after User.active changes. A replacement
 * active GM may therefore refresh offers without a combat turn advancing.
 * Startup calls recovery separately after migrations and feature sync.
 */
export function registerStarfallRecoveryHooks() {
  Hooks.on("userConnected", () => { void recoverStarfallOffers(); });
}
