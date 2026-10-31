import { RENDING_CLAWS } from "../rules/naxxramas-ghoul.mjs";
import { rollChampionStrikes } from "./qiraji-champion-strikes.mjs";

/** One unchanged Claws attack, returned as its actual card for the saved Apply
 * lifecycle. The caller owns geometry, payment and the durable use receipt. */
export async function rollRendingClaws({ actor, plan, readCurrent, pay } = {}) {
  const stop = (reason, paid = false) => ({ ok: false, paid, card: null, reason });
  if (plan?.attack?.name !== RENDING_CLAWS.weapon || plan.targets?.length !== 1) return stop("invalid");
  const result = await rollChampionStrikes({ actor, plan, readCurrent, pay, title: RENDING_CLAWS.name });
  if (!result?.ok || result.cards?.length !== 1) return stop(result?.reason ?? "strikeUnresolved", result?.paid === true);
  const card = game.messages?.get(result.cards[0]);
  if (!card || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return stop("cardMissing", result.paid);
  return { ok: true, paid: result.paid, card, reason: null };
}
