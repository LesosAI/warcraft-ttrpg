import { activeSentinelPowers } from "./anubisath-pack.mjs";

/** Knock Away's passive protects against the named Taunt talent. It is not
 * general Bane immunity and does not suppress Judgement, Feint or Challenge. */
export function sentinelRejectsTaunt(actor, source) {
  return typeof source === "string" && source.trim().toLowerCase() === "taunt"
    && actor?.system?.health?.value > 0 && activeSentinelPowers(actor).includes("knock-away");
}
