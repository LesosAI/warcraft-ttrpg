import { reviewedAttackReaction } from "../rules/attack-reaction-review.mjs";
import { TRANSFER_DELIVERIES, reviewedDamageTransfer } from "../rules/damage-transfer-review.mjs";

export const ATTACK_RESOLUTION = "attackResolution";
const busy = new Set();
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = message => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id && fromUuidSync(message?.uuid) === message;

/** Share the attack writer's lock with a multi-receipt acknowledged review. */
export async function withAttackResolutionReviewLock(message, execute) {
  if (!writer(message)) return {ok:false,reason:'authority'};
  if (busy.has(message.uuid)) return {ok:false,reason:'busy'};
  busy.add(message.uuid);
  try { return await execute(); }
  finally { busy.delete(message.uuid); }
}

/** Seed only when creating a new attack card. Missing records on old cards
 * do not establish that damage has never been applied. Target UUIDs must be
 * resolved by the caller from the actual target documents. */
export function attackResolutionSeed(targetUuids, { damageRevealed = true } = {}) {
  if (!Array.isArray(targetUuids) || !targetUuids.length || !targetUuids.every(id)) return null;
  return { version: 1, ...(damageRevealed === false ? { damageRevealed: false } : {}),
    targets: targetUuids.map(targetUuid => ({ targetUuid, stage: "pending" })) };
}

/** Damage Apply, Phase Shift and an answering Ward enter here on the active GM.
 * Serialize the entire card because withdrawing its last hit can refund
 * shared resources. Persist the claim before invoking any side effects.
 * A thrown callback or lost acknowledgement leaves the claim unresolved;
 * retrying never repeats the potentially successful writes.
 * Apply may supply read-only `prepare({valid})` for owner choices. It must
 * neither pay nor write documents. It runs under the local card lock BEFORE
 * claiming, so cancellation/disconnection leaves the attack pending. Explicit
 * success is passed to execute as `prepared`; execute must revalidate mutable
 * choice facts before delivery, since the claim write itself is asynchronous. */
export async function resolveAttackOperation({ message, index, targetUuid, operation, validate, execute, prepare = null, wardBy = null, parryKey = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(message?.uuid) || !id(targetUuid) || !Number.isInteger(index) || index < 0
    || !["apply", "phase", "ward", "reveal", "block", "parry", "disperse"].includes(operation) || typeof validate !== "function"
    || (operation === "parry" ? !id(parryKey) : parryKey !== null)
    || typeof execute !== "function" || (prepare !== null && (operation !== "apply" || typeof prepare !== "function"))
    || (wardBy !== null && (operation !== "ward" || !id(wardBy))) || !writer(message)) return refuse("invalid");
  if (busy.has(message.uuid)) return refuse("busy");
  busy.add(message.uuid);
  const read = () => message.getFlag("azeroth-rpg", ATTACK_RESOLUTION);
  try {
    let expected = structuredClone(read());
    if (expected?.version !== 1 || !Array.isArray(expected.targets)) return refuse("unknownDelivery");
    const row = expected.targets[index];
    if (row?.targetUuid !== targetUuid) return refuse("targetChanged");
    if (expected.targets.some(entry => !["pending", "applied", "phased"].includes(entry?.stage))) return refuse("reconcile");
    if (row.stage !== "pending") return refuse("resolved");
    if (operation === "block" && row.blocked === true) return refuse("alreadyBlocked");
    if (operation === "parry" && row.parryAttempted === true) return refuse("alreadyParried");
    if (operation === "disperse" && row.dispersionAttempted === true) return refuse("alreadyDispersed");
    if (wardBy && row.wardedBy?.includes(wardBy)) return refuse("alreadyWarded");
    if (operation === "apply" && expected.damageRevealed === false) return refuse("unrevealed");
    if (operation === "reveal" && expected.damageRevealed !== false) return refuse("alreadyRevealed");
    const unchanged = () => writer(message) && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async (stage, revealed = false) => {
      if (!unchanged()) throw Error("Attack resolution changed");
      const next = structuredClone(expected);
      next.targets[index].stage = stage;
      if (operation === "apply" && stage === "applying") {
        next.targets[index].writerId = game.user.id;
      }
      if (["warding", "blocking", "parrying", "dispersing"].includes(stage)) next.targets[index].writerId = game.user.id;
      if (operation === "disperse" && stage !== "dispersing") {
        next.targets[index].dispersionAttempted = true;
        if (stage === "applied") next.targets[index].preventedByDispersion = true;
      }
      if (operation === "block" && stage === "pending") next.targets[index].blocked = true;
      if (operation === "parry") {
        next.targets[index].parryKey = parryKey;
        if (stage === "pending") next.targets[index].parryAttempted = true;
      }
      if (wardBy) {
        next.targets[index].wardBy = wardBy;
        if (stage === "pending") next.targets[index].wardedBy = [...(next.targets[index].wardedBy ?? []), wardBy];
      }
      if (revealed) next.damageRevealed = true;
      await message.setFlag("azeroth-rpg", ATTACK_RESOLUTION, next);
      if (!writer(message) || !same(read(), next)) throw Error("Attack resolution unconfirmed");
      expected = next;
    };
    if (!valid()) return refuse("changed");
    let prepared;
    if (prepare) {
      try { prepared = await prepare({ valid }); }
      catch { return refuse("preparationFailed"); }
      if (!valid()) return refuse("changed");
      if (prepared?.ok !== true) return refuse(id(prepared?.reason) ? prepared.reason : "preparationRefused");
    }
    await save({ apply: "applying", phase: "phasing", ward: "warding", reveal: "revealing", block: "blocking", parry: "parrying", disperse: "dispersing" }[operation]);
    if (!valid()) return refuse("changed");
    const result = await execute(prepare ? { valid, prepared } : { valid });
    // Only explicit success is terminal. Even false may follow a partial write.
    if (result?.ok !== true) return refuse("operationUncertain");
    if (operation === "disperse" && typeof result.prevented !== "boolean") return refuse("operationUncertain");
    if (!unchanged()) return refuse("changed");
    // A confirmed Ward modifies the pending blow; it does not consume it.
    await save(operation === "disperse" ? (result.prevented ? "applied" : "pending")
      : { apply: "applied", phase: "phased", ward: "pending", reveal: "pending", block: "pending", parry: "pending" }[operation], operation === "reveal");
    return { ok: true, operation };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(message.uuid); }
}

/** Manual reconciliation of one uncertain Chain Lightning hit, under the same
 * lock as Apply. Preserve every other row; never execute damage or refund. */
export async function reviewChainLightningHit({ message, index, expected, acknowledged, user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(message?.uuid) || !writer(message) || !user?.isGM || !user.active || game.users.get(user.id) !== user) return refuse("permission");
  if (acknowledged !== true) return refuse("acknowledgement");
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.kind !== "spell" || flags.identifier !== "chain-lightning" || !Number.isInteger(index) || index < 0) return refuse("card");
  if (busy.has(message.uuid)) return refuse("busy");
  busy.add(message.uuid);
  try {
    const state = message.getFlag("azeroth-rpg", ATTACK_RESOLUTION), row = state?.targets?.[index];
    if (state?.version !== 1 || !Array.isArray(state.targets) || !same(state, expected) || row?.stage !== "applying") return refuse("changed");
    // Transferred hits must reconcile both records together, even when the
    // transfer receipt is malformed and needs manual investigation.
    const transfers = message.getFlag("azeroth-rpg", TRANSFER_DELIVERIES);
    if (Array.isArray(transfers) && transfers.some(receipt => receipt?.index === index)) return refuse("transferReview");
    if (row.writerId && row.writerId !== game.user.id && game.users.get(row.writerId)?.active) return refuse("writerActive");
    const next = structuredClone(state);
    next.targets[index] = { ...next.targets[index], stage: "applied", reviewedBy: user.id, reviewedAt: Date.now() };
    await message.setFlag("azeroth-rpg", ATTACK_RESOLUTION, next);
    return writer(message) && same(message.getFlag("azeroth-rpg", ATTACK_RESOLUTION), next) ? { ok: true } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { busy.delete(message.uuid); }
}

/** Close a manually reconciled reaction attempt without repeating it or applying
 * damage. Dispersion also closes its explicitly reconciled hit. The same card
 * lock protects both ordinary operations and review. */
export async function reviewAttackReaction({ message, index, expected, acknowledged, damageReconciled = false, user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(message?.uuid) || !writer(message) || !user?.isGM || !user.active || game.users.get(user.id) !== user) return refuse("permission");
  if (acknowledged !== true) return refuse("acknowledgement");
  const flags = message.flags?.["azeroth-rpg"];
  if (!(flags?.kind === "attack" && !flags.parry && !flags.notAttack)
    && !(flags?.kind === "spell" && flags.success === true
      && expected?.targets?.[index]?.stage === "dispersing")) return refuse("card");
  if (busy.has(message.uuid)) return refuse("busy");
  busy.add(message.uuid);
  try {
    const state = message.getFlag("azeroth-rpg", ATTACK_RESOLUTION);
    if (!same(state, expected)) return refuse("changed");
    const next = reviewedAttackReaction(state, index, { userId: user.id, at: Date.now(), damageReconciled });
    if (!next) return refuse("changed");
    const previousWriter = state.targets[index].writerId;
    if (previousWriter && previousWriter !== game.user.id && game.users.get(previousWriter)?.active) return refuse("writerActive");
    await message.setFlag("azeroth-rpg", ATTACK_RESOLUTION, next);
    return writer(message) && same(message.getFlag("azeroth-rpg", ATTACK_RESOLUTION), next) ? { ok: true } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { busy.delete(message.uuid); }
}

/** Acknowledged whole-hit reconciliation. One document update closes both
 * receipts; no actor, resource, effect or damage operation runs here. */
export async function reviewAttackTransfer({ message, index, expected, acknowledged, user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (message?.documentName !== "ChatMessage" || !id(message?.uuid) || !writer(message) || !user?.isGM || !user.active || game.users.get(user.id) !== user) return refuse("permission");
  if (acknowledged !== true) return refuse("acknowledgement");
  const flags = message.flags?.["azeroth-rpg"];
  const eligible = flags?.kind === "attack" && !flags.parry && !flags.notAttack
    || flags?.kind === "spell" && flags.success === true && flags.attackResolution?.version === 1;
  if (!eligible) return refuse("card");
  if (busy.has(message.uuid)) return refuse("busy");
  busy.add(message.uuid);
  try {
    const state = message.getFlag("azeroth-rpg", ATTACK_RESOLUTION), receipts = message.getFlag("azeroth-rpg", TRANSFER_DELIVERIES);
    if (!same({ state, receipts }, expected)) return refuse("changed");
    const next = reviewedDamageTransfer(state, receipts, index, { userId: user.id, at: Date.now() });
    if (!next) return refuse("changed");
    const receipt = receipts.find(row => row.index === index);
    for (const previous of [receipt.writerId, state.targets[index].writerId]) {
      if (previous && previous !== game.user.id && game.users.get(previous)?.active) return refuse("writerActive");
    }
    await message.update({ [`flags.azeroth-rpg.${ATTACK_RESOLUTION}`]: next.state,
      [`flags.azeroth-rpg.${TRANSFER_DELIVERIES}`]: next.receipts });
    return writer(message) && same(message.getFlag("azeroth-rpg", ATTACK_RESOLUTION), next.state)
      && same(message.getFlag("azeroth-rpg", TRANSFER_DELIVERIES), next.receipts) ? { ok: true } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { busy.delete(message.uuid); }
}
