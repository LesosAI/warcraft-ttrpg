import { rollChampionStrikes } from "./qiraji-champion-strikes.mjs";
import { ROYAL_TRAMPLE } from "../rules/king-mosh.mjs";

/** Resolve every reviewed target through the ordinary NPC attack adapter.
 * Persist each returned card before advancing. The controller owns the saved
 * target set, range/path checks and durable claim before payment. */
export async function rollRoyalTrample({ actor, plan, readCurrent, pay, checkpoint } = {}) {
  let paid = false;
  const cards = [], skipped = [];
  const stop = reason => ({ ok: false, paid, cards, skipped, reason });
  if (!actor || plan?.feet !== ROYAL_TRAMPLE.feet || !Array.isArray(plan.targets)
    || !plan.targets.length || new Set(plan.targets).size !== plan.targets.length
    || [readCurrent, pay, checkpoint].some(fn => typeof fn !== "function")) return stop("invalid");
  try {
    for (const [strike, uuid] of plan.targets.entries()) {
      const result = await rollChampionStrikes({ actor, plan: { ...plan, targets: [uuid] },
        title: `${ROYAL_TRAMPLE.name} (${strike + 1}/${plan.targets.length})`, readCurrent,
        pay: async () => {
          if (paid) return true;
          paid = await pay() === true;
          return paid;
        } });
      if (!result || !Array.isArray(result.cards) || !Array.isArray(result.skipped)) return stop("resultInvalid");
      cards.push(...result.cards);
      skipped.push(...result.skipped.map(row => ({ ...row, strike })));
      if (!await checkpoint({ strike, uuid, cards: [...cards], skipped: structuredClone(skipped), paid })) return stop("checkpoint");
      if (!result.ok && result.reason !== "noLivingTargets") return stop(result.reason ?? "interrupted");
    }
    return { ok: paid && cards.length > 0, paid, cards, skipped, reason: paid ? null : "noLivingTargets" };
  } catch (error) {
    console.warn("azeroth-rpg | Royal Trample interrupted", error);
    return stop("interrupted");
  }
}
