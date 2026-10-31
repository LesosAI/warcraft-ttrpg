import { VICIOUS_REND } from "../rules/king-mosh.mjs";
import { rollChampionStrikes } from "./qiraji-champion-strikes.mjs";

/** One unchanged Jaws attack, returned as its actual card for the saved Apply
 * lifecycle. The caller owns geometry, payment and the durable use receipt. */
export async function rollViciousRend({ actor, plan, readCurrent, pay } = {}) {
  const stop = (reason, paid = false) => ({ ok: false, paid, card: null, reason });
  if (plan?.attack?.name !== VICIOUS_REND.weapon || plan.targets?.length !== 1) return stop("invalid");
  const result = await rollChampionStrikes({ actor, plan, readCurrent, pay, title: VICIOUS_REND.name });
  if (!result?.ok || result.cards?.length !== 1) return stop(result?.reason ?? "strikeUnresolved", result?.paid === true);
  const card = game.messages?.get(result.cards[0]);
  if (!card || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return stop("cardMissing", result.paid);
  return { ok: true, paid: result.paid, card, reason: null };
}
