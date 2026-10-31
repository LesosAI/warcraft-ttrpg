import { NPC_DISARM, npcDisarmContest } from "../rules/npc-disarm.mjs";
import { layNpcDisarm } from "./npc-disarm-apply.mjs";

const busy = new Set();
const FLAG = "npcDisarmRequests";
const snapshot = card => {
  const roll = card?.rolls?.[0];
  if (!card?.id || typeof roll?.outcome?.success !== "boolean" || !Number.isInteger(roll.outcome.sl)
    || !Number.isFinite(roll.total)) return null;
  return { messageId: card.id, total: roll.total, outcome: { success: roll.outcome.success, sl: roll.outcome.sl } };
};

/** Internal paid-attempt executor. The activation adapter supplies current
 * token/range/selection validation and the two non-damaging Attack dialogs.
 * Saved stages are evidence for manual resolution, never automatic retries.
 */
export async function resolveNpcDisarmAttempt({ actor, victim, weapon, requestId, issuedAt,
  valid, rollAttacker, rollDefender } = {}) {
  const result = { paid: false, attacker: null, defender: null, contest: null, effect: null };
  const refuse = reason => ({ ok: false, reason, ...result });
  const permitted = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && actor?.documentName === "Actor" && actor.type === "npc" && victim?.documentName === "Actor"
    && typeof valid === "function" && valid();
  if (!permitted() || typeof rollAttacker !== "function" || typeof rollDefender !== "function") return refuse("authority");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  let receipt;
  const persist = async stage => {
    const current = actor.getFlag("azeroth-rpg", FLAG);
    if (!Array.isArray(current) || !current.some(row => row.requestId === requestId)) throw new Error("Disarm receipt missing");
    receipt = { ...receipt, stage, result: structuredClone(result) };
    await actor.setFlag("azeroth-rpg", FLAG, current.map(row => row.requestId === requestId ? receipt : row));
    const saved = actor.getFlag("azeroth-rpg", FLAG)?.find(row => row.requestId === requestId);
    if (JSON.stringify(saved) !== JSON.stringify(receipt)) throw new Error("Disarm receipt unconfirmed");
  };
  try {
    const now = Date.now();
    if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId)
      || !Number.isSafeInteger(issuedAt) || issuedAt > now + 5000 || now >= issuedAt + 600000) return refuse("request");
    const records = actor.getFlag("azeroth-rpg", FLAG) ?? [];
    if (!Array.isArray(records)) return refuse("receipts");
    const current = records.filter(row => Number.isFinite(row?.expiresAt) && row.expiresAt > now);
    if (current.some(row => row.requestId === requestId)) return refuse("replay");
    receipt = { requestId, expiresAt: issuedAt + 600000, victimUuid: victim.uuid, weapon: structuredClone(weapon), stage: "claimed" };
    await actor.setFlag("azeroth-rpg", FLAG, [...current, receipt]);
    await persist("claimed");
    if (!permitted()) return refuse("changed");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, NPC_DISARM.action)) return refuse("action");
    result.paid = true;
    await persist("paid");
    if (!permitted()) return refuse("changed");
    result.attacker = snapshot(await rollAttacker());
    await persist("attacker");
    if (!result.attacker) return refuse("attackerUnresolved");
    if (!permitted()) return refuse("changed");
    result.defender = snapshot(await rollDefender());
    await persist("defender");
    if (!result.defender) return refuse("defenderUnresolved");
    if (!permitted()) return refuse("changed");
    result.contest = npcDisarmContest(result.attacker, result.defender);
    await persist("resolved");
    if (!permitted()) return refuse("changed");
    if (result.contest.winner === "attacker") {
      result.effect = await layNpcDisarm({ victim, by: actor, weapon, castId: requestId, valid: permitted });
      await persist("effect");
      if (!result.effect.ok) return refuse(result.effect.reason);
    }
    await persist("complete");
    return { ok: true, ...result };
  } catch (error) {
    console.warn("azeroth-rpg | Disarm attempt stopped; inspect saved stages", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
