import { soulLinkState } from "./soul-link.mjs";
import { soulLinkRecordedDamage, soulLinkRecipientDamage } from "../rules/soul-link-record.mjs";
import { buffetStacks } from "../rules/flame-buffet.mjs";
import { SOUL_LINK_CLAIM } from "./soul-link-casting.mjs";

const SCOPE = "azeroth-rpg";
const refuse = reason => ({ ok: false, reason });

/** Read-only preparation for the authoritative damage writer. Unknown link
 * state must not silently turn into an ordinary unshared hit. The snapshot is
 * evidence for revalidation/receipts, not permission to write either actor.
 * The damage door supplies current one-blow reduction, Ethereal Form and
 * standing reduction separately from the card, preserving their order. */
export function prepareSoulLinkDamage(actor, row, { flatReduction = 0, negate = false, ethereal = false, standingReduction = 0, woundedRanks = 0, halve = false } = {}) {
  try {
    if (!actor?.uuid || fromUuidSync(actor.uuid) !== actor) return refuse("actor");
    if (actor.getFlag?.(SCOPE, SOUL_LINK_CLAIM)) return refuse("creationPending");
    const effects = [...(actor.effects?.values?.() ?? actor.effects ?? [])]
      .filter(effect => effect.flags?.[SCOPE]?.identifier === "soul-link");
    const active = [];
    for (const effect of effects) {
      const state = soulLinkState(effect);
      if (state.active) active.push({ effect, state });
      else if (!state.ended && state.reason !== "inactive") return refuse(state.reason);
    }
    if (!active.length) return { ok: true, linked: false };
    if (active.length !== 1) return refuse("multipleLinks");
    const { effect, state } = active[0];
    if (state.caster !== actor || state.recipient === actor) return refuse("endpoint");
    if (typeof halve !== "boolean") return refuse("input");
    const rank = actor.talentRanks?.("Soul Link") ?? 0;
    const result = soulLinkRecordedDamage(row, { rank, flatReduction, negate, ethereal, standingReduction, woundedRanks, halve });
    if (!result.ok) return result;
    const recipientDefenses = { immune: [...(state.recipient.system?.immune ?? [])],
      vulnerable: [...(state.recipient.system?.vulnerable ?? [])],
      fireTakenBonus: buffetStacks([...(state.recipient.effects ?? [])], game.time?.worldTime) };
    const damage = { ...result, recipient: soulLinkRecipientDamage(result.recipient, recipientDefenses) };
    const health = endpoint => ({ value: endpoint.system?.health?.value,
      temp: endpoint.system?.health?.temp ?? 0 });
    const snapshot = structuredClone({ casterUuid: actor.uuid, recipientUuid: state.recipient.uuid,
      effectId: effect.id, cast: effect.flags[SCOPE].cast, link: effect.flags[SCOPE].soulLink,
      start: effect._source?.start ?? effect.start, duration: effect._source?.duration ?? effect.duration,
      rank, flatReduction, negate, ethereal, standingReduction, woundedRanks, halve, row, recipientDefenses,
      casterHealth: health(actor), recipientHealth: health(state.recipient) });
    return { ok: true, linked: true, caster: actor, recipient: state.recipient,
      effect, snapshot, damage };
  } catch { return refuse("unavailable"); }
}

/** Re-evaluate eligibility as well as identity. Clock advancement alone does
 * not stale a snapshot, but expiry, movement and either Health change do. */
export function soulLinkDamageStillCurrent(prepared, row, { flatReduction = 0, negate = false, ethereal = false, standingReduction = 0, woundedRanks = 0, halve = false } = {}) {
  if (!prepared?.ok || !prepared.linked) return false;
  const next = prepareSoulLinkDamage(prepared.caster, row, { flatReduction, negate, ethereal, standingReduction, woundedRanks, halve });
  return next.ok && next.linked && next.recipient === prepared.recipient && next.effect === prepared.effect
    && JSON.stringify(next.snapshot) === JSON.stringify(prepared.snapshot);
}
