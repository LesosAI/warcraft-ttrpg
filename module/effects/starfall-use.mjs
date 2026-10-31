import { starfallContexts } from "./starfall-context.mjs";
import { createStarfallDelivery } from "./starfall-delivery.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { STARFALL_START } from "./starfall-turn.mjs";
import { refreshStarfallOffers } from "./starfall-offers.mjs";

export const STARFALL_RECEIPTS = "starfallTurns";
export const STARFALL_QUERY = "azeroth-rpg.starfall";
const scope = "azeroth-rpg";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
let queue = Promise.resolve();

/** Active-GM writer. The caller identity comes from Foundry's query context.
 * Counts, damage and candidate membership are always read on the GM.
 */
export function deliverStarfall(payload = {}, { user = game.user } = {}) {
  const request = structuredClone(payload);
  const run = async () => {
    const combat = game.combats.get(request.combatId);
    const scene = combat?.combatant?.token?.parent;
    const caster = combat?.combatant?.actor;
    const region = scene?.regions?.get(request.regionId);
    const owns = () => user?.isGM || caster?.testUserPermission?.(user, "OWNER");
    const read = () => {
      if (!gmHere() || !owns() || !combat || game.combats.get(combat.id) !== combat
        || !combat.started || combat.round !== request.round || combat.turn !== request.turn
        || combat.combatant?.id !== request.combatantId || combat.combatant?.actor !== caster
        || scene?.regions?.get(request.regionId) !== region) return null;
      const inventory = starfallContexts(caster, scene);
      const context = inventory.ok && inventory.contexts.find(row => row.regionUuid === region?.uuid && row.cast === request.cast);
      if (!context) return null;
      const start = combat.getFlag(scope, STARFALL_START);
      if (start?.version !== 1 || start.refusal || start.combatId !== combat.id
        || start.round !== request.round || start.turn !== request.turn
        || start.combatantId !== request.combatantId || start.casterUuid !== caster.uuid) return null;
      const offered = start.casts?.find(row => row.cast === context.cast && row.regionUuid === region.uuid);
      if (!offered || !Array.isArray(offered.candidates)) return null;
      // Starweave must be associated with its specific Starfall area. Until
      // placement records that link, refuse rather than silently use one target.
      const held = caster.getFlag(scope, "sustaining") ?? [];
      if (held.some(entry => entry.identifier === "starweave" || entry.name === "Starweave")) return null;
      const talentRank = Math.max(0, ...(caster.takenTalents?.() ?? [])
        .filter(t => t.className === "Druid" && t.identifier === "starfall").map(t => Number(t.taken) || 0));
      return { combatUuid: combat.uuid, combatantId: combat.combatant.id, round: combat.round, turn: combat.turn,
        casterUuid: caster.uuid, regionUuid: region.uuid, cast: context.cast,
        candidates: context.candidates.map(row => row.uuid).filter(uuid => offered.candidates.includes(uuid)),
        talentRank: Math.min(talentRank, offered.talentRank), starweave: false };
    };
    if (!read()) return { ok: false, reason: "context" };
    let expected = structuredClone(combat.getFlag(scope, STARFALL_RECEIPTS) ?? []);
    if (!Array.isArray(expected) || expected.some(row => !row || typeof row.key !== "string")
      || new Set(expected.map(row => row.key)).size !== expected.length) return { ok: false, reason: "record" };
    const engine = createStarfallDelivery({
      read,
      readReceipt: key => {
        const rows = combat.getFlag(scope, STARFALL_RECEIPTS) ?? [];
        if (!Array.isArray(rows) || !same(rows, expected)) throw Error("Starfall receipt collection changed");
        return rows.find(row => row.key === key);
      },
      writeReceipt: async (key, receipt) => {
        if (!read() || !same(combat.getFlag(scope, STARFALL_RECEIPTS) ?? [], expected)) throw Error("Starfall context changed");
        const next = expected.some(row => row.key === key)
          ? expected.map(row => row.key === key ? receipt : row) : [...expected, receipt];
        await combat.setFlag(scope, STARFALL_RECEIPTS, next);
        if (!same(combat.getFlag(scope, STARFALL_RECEIPTS), next)) throw Error("Starfall receipt unconfirmed");
        expected = structuredClone(next);
      },
      strike: async ({ uuid, damage }) => {
        const now = read();
        if (!now?.candidates.includes(uuid)) throw Error("Starfall target changed");
        const actor = fromUuidSync(uuid);
        if (actor?.documentName !== "Actor") throw Error("Starfall target missing");
        await strikeFromArea({ actor, caster, spell: region.flags?.[scope]?.spell ?? { name: "Starfall", school: "arcane" }, damage });
      }
    });
    return engine(request.targets);
  };
  const result = queue.then(run, run).catch(() => ({ ok: false, reason: "review" })).then(async result => {
    // A presentation failure must not change a settled damage result.
    const combat = game.combats.get(request.combatId);
    if (combat) await refreshStarfallOffers(combat).catch(error => console.warn("Starfall card refresh failed", error));
    return result;
  });
  queue = result.then(() => {});
  return result;
}
