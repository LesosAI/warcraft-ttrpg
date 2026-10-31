import { beginConsumeShadows, interruptConsumeShadows, consumeShadowsRecovery } from "../rules/consume-shadows.mjs";

export const CONSUME_RECOVERIES = "consumeShadowsRecoveries";
const flagPath = `flags.azeroth-rpg.${CONSUME_RECOVERIES}`;
const queues = new Map();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id && globalThis.fromUuidSync?.(actor?.uuid) === actor;
const read = actor => structuredClone(actor.getFlag("azeroth-rpg", CONSUME_RECOVERIES) ?? []);
const refused = reason => ({ ok: false, reason });

// An interruption arriving during an awaited start write must run afterward,
// not be discarded as "busy". Capture events before joining this queue.
function enqueue(actor, operation) {
  if (!actor?.uuid) return Promise.resolve(refused("invalid"));
  const previous = queues.get(actor.uuid) ?? Promise.resolve();
  const task = previous.then(operation, operation).catch(() => refused("writeUncertain"));
  queues.set(actor.uuid, task);
  return task.finally(() => { if (queues.get(actor.uuid) === task) queues.delete(actor.uuid); });
}

async function write(actor, expected, records, changes = {}) {
  if (!writer(actor) || !same(read(actor), expected)) return false;
  // The start receipt and use payment are one Actor database update.
  // A lost acknowledgement can be recognized from the resulting document.
  try { await actor.update({ ...changes, [flagPath]: records }); } catch { /* verify below */ }
  if (!writer(actor) || !same(read(actor), records)) return false;
  if (Object.hasOwn(changes, "system.creatureAbilities") && !same(actor.system.creatureAbilities, changes["system.creatureAbilities"])) return false;
  return true;
}

export function startConsumeShadows({ actor, index, requestId, snapshot, validate } = {}) {
  return enqueue(actor, async () => {
    if (!writer(actor) || typeof snapshot !== "function" || typeof validate !== "function" || validate() !== true) return refused("invalid");
    const rows = read(actor);
    if (!Array.isArray(rows)) return refused("receiptInvalid");
    if (rows.some(r => r?.requestId === requestId)) return refused("alreadyClaimed");
    if (rows.some(r => !["complete", "interrupted"].includes(r?.state))) return refused("recovering");
    const abilities = structuredClone(actor.system.creatureAbilities);
    const ability = Number.isInteger(index) && abilities?.[index];
    const uses = ability?.automation?.uses;
    if (ability?.name !== "Consume Shadows" || uses?.per !== "short" || !Number.isInteger(uses.value)
        || uses.value < 1 || uses.max !== 1) return refused("uses");
    const record = beginConsumeShadows({ ...snapshot(), requestId });
    if (!record || validate() !== true) return refused("changed");
    uses.value -= 1;
    const records = [...rows, record];
    if (!await write(actor, rows, records, { "system.creatureAbilities": abilities })) return refused("writeUncertain");
    return { ok: true, state: "recovering", requestId, readyAt: record.readyAt };
  });
}

export function advanceConsumeShadows({ actor, event, snapshot } = {}) {
  const captured = event ? structuredClone(event) : null;
  return enqueue(actor, async () => {
    if (!writer(actor) || typeof snapshot !== "function") return refused("invalid");
    const rows = read(actor);
    if (!Array.isArray(rows)) return refused("receiptInvalid");
    const active = rows.map((r, i) => r?.state === "recovering" ? i : -1).filter(i => i >= 0);
    if (rows.some(r => r?.state === "healing")) return refused("reconcile");
    if (!active.length) return { ok: true, state: "idle" };
    if (active.length !== 1) return refused("receiptInvalid");
    const index = active[0], record = rows[index];
    const next = captured ? interruptConsumeShadows(record, captured) : record;
    if (!next) return refused("receiptInvalid");
    const records = structuredClone(rows);
    if (next.state === "interrupted") {
      records[index] = next;
      return await write(actor, rows, records) ? { ok: true, state: "interrupted", reason: next.reason } : refused("writeUncertain");
    }
    const proposal = consumeShadowsRecovery(record, snapshot());
    if (!proposal) return { ok: true, state: "recovering" };
    if (typeof actor.applyHealing !== "function") return refused("healingUnavailable");
    records[index] = { ...record, state: "healing", healthBefore: proposal.before };
    if (!await write(actor, rows, records)) return refused("writeUncertain");
    // Use the normal healing door: blocked/halved healing, talent riders and
    // healing shares must not be bypassed by writing Health directly.
    // An interrupted acknowledgement leaves "healing" durable for review;
    // an expiry poll or reload must never repeat that potentially applied heal.
    let result;
    try { result = await actor.applyHealing(3, { from: actor, feature: true, featureName: "Consume Shadows" }); }
    catch { return refused("healUncertain"); }
    if (result !== actor || !writer(actor) || !same(read(actor), records)) return refused("healUncertain");
    const after = actor.system?.health?.value;
    if (!Number.isFinite(after)) return refused("healUncertain");
    const healed = Math.max(0, after - proposal.before);
    const completed = structuredClone(records);
    completed[index] = { ...records[index], state: "complete", healed, healthAfter: after };
    if (!await write(actor, records, completed)) return refused("writeUncertain");
    return { ok: true, state: "complete", healed, requestId: record.requestId };
  });
}
