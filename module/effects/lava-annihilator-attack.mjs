import { annihilatorTargetAllowed } from "../rules/lava-annihilator.mjs";
import { requestAnnihilatorReservation, reviewAnnihilatorReservation } from "./lava-annihilator-reservation.mjs";
const busy = new Set();

/** Wrap the ordinary attack workflow without replacing its action payment,
 * Taunt modifiers or damage law. observe() must read current scene facts after
 * the dialog; scope separates creatures and encounters. */
export function annihilatorAttackWorkflow({ actor, workflow, observe, refused, request = requestAnnihilatorReservation }) {
  return async args => {
    if (!actor?.isOwner || busy.has(actor.uuid)) return null;
    busy.add(actor.uuid);
    try {
      const facts = observe(args);
      if (!facts?.scope || !facts.targetId) { refused("target"); return null; }
      // Linked tokens share an Actor but must remember their own last opponent.
      const record = facts.recordDocument ?? actor;
      if (!record.isOwner) { refused("record"); return null; }
      // Foundry's generator also works on home-LAN HTTP clients, where
      // crypto.randomUUID is unavailable outside a secure browser context.
      const requestId = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto.randomUUID();
      const reservation = { tokenUuid: record.uuid, requestId };
      const acquired = await request({ ...reservation, operation: "reserve" });
      if (!acquired?.ok) {
        refused(acquired?.reason === "busy" ? "busy" : "record");
        if (acquired?.reason === "busy" && globalThis.game?.user?.isGM) await reviewAnnihilatorReservation(record);
        return null;
      }
      const cancel = async reason => {
        const result = await request({ ...reservation, operation: "cancel" });
        if (reason || !result?.ok) refused(result?.ok ? reason : "record");
        return null;
      };
      // Query round trips can outlast a movement or target change. Reobserve
      // before spending, using the GM's last-target snapshot rather than a
      // possibly stale document update on this client.
      const refreshed = observe(args);
      if (!refreshed || refreshed.scope !== facts.scope || refreshed.targetId !== facts.targetId
        || (refreshed.recordDocument ?? actor) !== record) return await cancel("target");
      const previous = acquired.previous;
      const previousTargetId = previous?.scope === facts.scope ? previous.targetId : null;
      if (!annihilatorTargetAllowed({ ...refreshed, previousTargetId })) return await cancel("switch");
      const card = await workflow(args);
      if (!card) return await cancel(null);
      // A miss is still an attempted attack. A refused/cancelled roll above is not.
      const state = { scope: facts.scope, targetId: facts.targetId, cardUuid: card.uuid };
      const committed = await request({ ...reservation, ...state, operation: "commit" });
      if (!committed?.ok) { refused("record"); return null; }
      return card;
    } catch (error) {
      console.warn("azeroth-rpg | Lava Annihilator attack record", error);
      refused("record");
      return null;
    } finally { busy.delete(actor.uuid); }
  };
}
