import { VICIOUS_REND as SPEC } from "../rules/king-mosh.mjs";
import { mightyBlowHit } from "../rules/mighty-blow.mjs";
import { inflictCondition } from "./inflict.mjs";
import { spellTiming } from "./durations.mjs";

/** Run only after accepted ordinary damage Apply, under a claimed use receipt.
 * The attack keeps its normal damage/reactions. This adds only the wound. */
export async function resolveViciousRendWound({ actor, source, target, card, valid, checkpoint } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!actor?.uuid || source?.actor !== actor || !target?.actor || !card?.id
    || [valid, checkpoint].some(fn => typeof fn !== "function")) return refuse("invalid");
  const victim = target.actor;
  const current = async () => {
    if (!await valid() || game.messages?.get(card.id) !== card || target.actor !== victim || source.actor !== actor) return false;
    const flags = card.flags?.["azeroth-rpg"];
    return flags?.source?.sceneId === source.parent?.id && flags.source.tokenId === source.id
      && flags.targets?.length === 1 && flags.targets[0].sceneId === target.parent?.id
      && flags.targets[0].tokenId === target.id && mightyBlowHit({ flags, index: 0 });
  };
  if (!await current()) return refuse("hit");
  const skip = () => !(victim.system?.health?.value > 0) ? "fallen"
    : (victim.system?.conditionImmunities ?? []).includes(SPEC.condition) ? "immune"
    : victim.statuses?.has(SPEC.condition) ? "alreadyBleeding" : null;
  let reason = skip();
  if (reason) return { ok: true, applied: false, reason };
  if (!await checkpoint({ stage: "inflicting", attackCardId: card.id }) || !await current()) return refuse("changed");
  reason = skip();
  if (reason) return { ok: true, applied: false, reason };
  const until = spellTiming(victim, { value: SPEC.seconds, units: "seconds" });
  if (!until || !Number.isFinite(until.start?.time)) return refuse("clock");
  const result = await inflictCondition({ victim, by: actor, id: SPEC.condition, name: target.name, until });
  if (result?.landed === true) return { ok: true, applied: true, reason: null };
  if (result?.reason === "immune") return { ok: true, applied: false, reason: "immune" };
  return refuse("effectUnresolved");
}
