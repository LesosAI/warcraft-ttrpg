import { starfallContexts } from "./starfall-context.mjs";

export const STARFALL_START = "starfallStart";
const scope = "azeroth-rpg";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let queue = Promise.resolve();

/** Capture only from the post-upkeep turn lifecycle, never from a query or
 * token update. Even an empty snapshot is final for this combatant's turn.
 */
export function beginStarfallTurn(combat, combatant) {
  const run = async () => {
    const actor = combatant?.actor, scene = combatant?.token?.parent;
    const stamp = { combatId: combat?.id, round: combat?.round, turn: combat?.turn, combatantId: combatant?.id, casterUuid: actor?.uuid };
    const current = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id
      && game.combats.get(combat?.id) === combat && combat.started && combat.combatant === combatant
      && combat.round === stamp.round && combat.turn === stamp.turn && combatant.actor === actor;
    if (!current() || !actor || !scene) return { ok: false, reason: "context" };
    const prior = structuredClone(combat.getFlag(scope, STARFALL_START) ?? null);
    if (prior && Object.entries(stamp).every(([key, value]) => prior[key] === value)) return { ok: true, already: true };
    const inventory = starfallContexts(actor, scene);
    // Being down legitimately offers no strike; uncertain geometry must remain
    // a refused snapshot rather than being rebuilt later after movement.
    const talentRank = Math.max(0, ...(actor.takenTalents?.() ?? [])
      .filter(t => t.className === "Druid" && t.identifier === "starfall").map(t => Number(t.taken) || 0));
    const record = { ...stamp, version: 1, refusal: inventory.ok ? null : inventory.reason,
      casts: inventory.ok ? inventory.contexts.map(row => ({ regionUuid: row.regionUuid, cast: row.cast,
        candidates: row.candidates.map(candidate => candidate.uuid), talentRank })) : [] };
    if (!current() || !same(combat.getFlag(scope, STARFALL_START) ?? null, prior)) return { ok: false, reason: "changed" };
    await combat.setFlag(scope, STARFALL_START, record);
    if (!same(combat.getFlag(scope, STARFALL_START), record)) return { ok: false, reason: "review" };
    return { ok: true, record };
  };
  const result = queue.then(run, run).catch(() => ({ ok: false, reason: "review" }));
  queue = result.then(() => {});
  return result;
}
