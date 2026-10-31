import { FLESH_ROT } from "../rules/naxxramas-ghoul.mjs";
import { rollGhoulStrikes } from "./ghoul-strikes.mjs";

/** The temporary +2 DR belongs to this strike, never to the stored weapon. */
export async function rollFleshRot({ actor, plan, readCurrent, pay, checkpoint } = {}) {
  const stop = (reason, paid = false) => ({ ok: false, paid, card: null, reason });
  if (plan?.attack?.name !== FLESH_ROT.weapon || plan.targets?.length !== 1) return stop("invalid");
  const result = await rollGhoulStrikes({ actor, ability: FLESH_ROT.name, plan, readCurrent, pay, checkpoint });
  if (!result?.ok || result.cards?.length !== 1) return stop(result?.reason ?? "strikeUnresolved", result?.paid === true);
  const card = game.messages?.get(result.cards[0]);
  if (!card || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return stop("cardMissing", result.paid);
  return { ok: true, paid: result.paid, card, reason: null };
}
