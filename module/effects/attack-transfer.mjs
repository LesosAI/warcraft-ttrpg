import { chooseDamageTransfer } from "./damage-transfer-choice.mjs";
import { readDamageTransferInput } from "./damage-transfer-input.mjs";
import { damageTransferCandidates, refreshDamageTransferChoice } from "./damage-transfer-candidates.mjs";
import { TRANSFER_DELIVERIES } from "../rules/damage-transfer-review.mjs";
import { halvesFor } from "../rules/resisted.mjs";
import { signatureApplyRows } from "../rules/signature-apply.mjs";
export { TRANSFER_DELIVERIES };

const SCOPE = "azeroth-rpg";
const permits = new WeakMap();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requireTrue = value => { if (!value) throw Error("Damage transfer changed or unconfirmed"); };

/** Read-only owner choice, called under the attack's local lock before its
 * durable Apply claim. No document references are supplied by a remote client. */
export async function prepareAttackTransfer({ target, message, index, by = null }, { valid }) {
  const read = () => {
    const flags = message.flags[SCOPE], effective = signatureApplyRows(flags, index);
    requireTrue(Boolean(effective));
    const base = effective.row;
    const row = halvesFor(flags, flags.targets?.[index]) ? effective.passedRow ?? base : base;
    return readDamageTransferInput({ target, row, messageId: message.id,
      type: flags.damageType ?? base.type ?? null, attack: flags.notAttack !== true,
      spell: flags.kind === "spell", by });
  };
  const choice = await chooseDamageTransfer(read, { valid });
  if (!choice.ok) return choice;
  return { ok: true, target, message, index, read, candidate: choice.candidate,
    sourceState: structuredClone(read().sourceState) };
}

/** Called after Apply's durable claim. The one-use permit never enters flags
 * or query arguments. A separate receipt records partial transfer delivery
 * without mutating the attack-resolution state owned by its coordinator. */
export async function beginAttackTransfer(prepared, { valid }) {
  const { target, message, index, read, candidate } = prepared;
  requireTrue(valid());
  const input = read();
  requireTrue(same(input.sourceState, prepared.sourceState));
  if (candidate) requireTrue(refreshDamageTransferChoice(candidate, input).ok);
  else {
    const current = damageTransferCandidates(input);
    requireTrue(current.ok && current.candidates.length === 0);
  }
  let expected = structuredClone(message.getFlag(SCOPE, TRANSFER_DELIVERIES) ?? []);
  requireTrue(Array.isArray(expected));
  let entry = null;
  const write = async phase => {
    requireTrue(valid());
    if (!candidate) return;
    requireTrue(same(message.getFlag(SCOPE, TRANSFER_DELIVERIES) ?? [], expected));
    const next = structuredClone(expected);
    const position = next.findIndex(row => row.index === index);
    const updated = { ...entry, phase, history: [...(entry?.history ?? []), phase] };
    if (position < 0) next.push(updated); else next[position] = updated;
    await message.setFlag(SCOPE, TRANSFER_DELIVERIES, next);
    requireTrue(valid() && same(message.getFlag(SCOPE, TRANSFER_DELIVERIES), next));
    expected = next; entry = updated;
  };
  if (candidate) {
    requireTrue(!expected.some(row => row.index === index));
    const plan = candidate.plan;
    // Public attack flags must not disclose the private Health/defense
    // snapshots used to validate the choice. Keep only intended delivery.
    const delivery = candidate.kind === "soulLink"
      ? { original: plan.damage.caster, recipients: [{ actorUuid: plan.recipient.uuid, ...plan.damage.recipient }] }
      : candidate.kind === "division"
        ? { original: { damage: plan.keep }, recipients: plan.others.map(part => ({ actorUuid: part.actor.uuid, damage: part.share })) }
        : { recipients: [{ actorUuid: plan.holder.uuid, damage: plan.moved }] };
    entry = { version: 1, index, targetUuid: target.uuid, writerId: game.user.id,
      kind: candidate.kind, key: candidate.key, delivery: structuredClone(delivery), history: [] };
    await write("claimed");
  }
  let used = false;
  const token = Object.freeze({});
  permits.set(token, { target, messageId: message.id, input, candidate, note: write,
    consume: () => {
      requireTrue(!used && valid());
      // A receipt write can yield to world updates. Check all choice facts once
      // more before the actor consumes its first reaction or Health write.
      const current = read();
      requireTrue(same(current.sourceState, input.sourceState));
      if (candidate) requireTrue(refreshDamageTransferChoice(candidate, current).ok);
      else {
        const options = damageTransferCandidates(current);
        requireTrue(options.ok && options.candidates.length === 0);
      }
      used = true;
    } });
  return { token, finish: async result => {
    permits.delete(token);
    requireTrue(used && result?.ok === true);
    await write("complete");
    return result;
  }, cancel: () => permits.delete(token) };
}

export function consumeAttackTransfer(token, { target, messageId }) {
  const permit = permits.get(token);
  requireTrue(permit && permit.target === target && permit.messageId === messageId);
  permits.delete(token);
  permit.consume();
  return permit;
}
