import { syndicateWhirlwindStep } from "../rules/syndicate-whirlwind.mjs";

export const WHIRLWIND_FLAG = "syndicateWhirlwind";
const busy = new Set(), interrupted = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const held = record => ["paying", "channeling", "striking"].includes(record?.phase);
const read = actor => actor.getFlag("azeroth-rpg", WHIRLWIND_FLAG);
async function save(actor, record) {
  if (!writer()) throw new Error("Whirlwind writer changed");
  await actor.setFlag("azeroth-rpg", WHIRLWIND_FLAG, record);
  if (JSON.stringify(read(actor)) !== JSON.stringify(record)) throw new Error("Whirlwind write unconfirmed");
}

/** Payment is supplied by activation and reports both costs explicitly.
 * A paying/striking record left by a reload requires manual reconciliation.
 */
export async function startWhirlwind({ actor, record, valid, pay } = {}) {
  if (!writer() || actor?.uuid !== record?.actorUuid || record.phase !== "channeling"
    || typeof valid !== "function" || typeof pay !== "function" || !valid()) return { ok: false, reason: "invalid" };
  if (busy.has(actor.uuid) || held(read(actor)) || read(actor)?.castId === record.castId) return { ok: false, reason: "held" };
  busy.add(actor.uuid); interrupted.delete(actor.uuid);
  try {
    await save(actor, { ...record, phase: "paying", payment: null });
    if (!valid() || interrupted.has(actor.uuid)) {
      await save(actor, { ...record, phase: "cancelled", reason: "changedBeforePayment" });
      return { ok: false, reason: "changed" };
    }
    const payment = await pay();
    const paid = payment?.paid === true && payment?.consumed === true;
    const refused = payment?.paid === false && payment?.consumed === false;
    const cancelled = interrupted.has(actor.uuid) || !valid();
    // An incomplete payment remains held, rather than being retried as fresh.
    const next = { ...record, payment: payment ?? null,
      phase: refused ? "cancelled" : paid ? cancelled ? "cancelled" : "channeling" : "paying" };
    await save(actor, next);
    return { ok: paid && !cancelled, reason: refused ? "paymentRefused" : !paid ? "paymentUncertain" : cancelled ? "interrupted" : null, record: next };
  } catch (error) {
    console.warn("azeroth-rpg | Whirlwind start requires reconciliation", error);
    return { ok: false, reason: "writeUncertain" };
  } finally { busy.delete(actor.uuid); }
}

/** Latch immediately, including while an attack dialog holds the queue. The
 * reader passed to the volley sees this before it can roll the next attack.
 */
export async function interruptWhirlwind(actor, reason = "interrupted") {
  if (!writer() || !actor?.uuid || !held(read(actor))) return false;
  interrupted.add(actor.uuid);
  if (busy.has(actor.uuid)) return true;
  busy.add(actor.uuid);
  try {
    const record = read(actor);
    // Never erase an uncertain payment or partially resolved volley.
    await save(actor, { ...record, interrupted: true, reason,
      ...(record.phase === "channeling" ? { phase: "cancelled" } : {}) });
    return true;
  } finally { busy.delete(actor.uuid); }
}

/** inspect returns authoritative rule inputs plus concrete source/target
 * documents. volley owns normal attack dialogs; this function owns receipts.
 */
export async function advanceWhirlwind({ actor, inspect, volley } = {}) {
  if (!writer() || !actor?.uuid || typeof inspect !== "function" || typeof volley !== "function") return { ok: false, reason: "invalid" };
  if (busy.has(actor.uuid)) return { ok: false, reason: "busy" };
  busy.add(actor.uuid);
  try {
    const record = read(actor);
    if (record?.phase !== "channeling") return { ok: false, reason: "heldOrFinished" };
    const current = await inspect();
    if (!current) return { ok: false, reason: "unavailable" };
    const step = syndicateWhirlwindStep({ ...current, record,
      interrupted: record.interrupted === true || interrupted.has(actor.uuid) || current.interrupted === true });
    if (step.action === "wait") return { ok: true, waiting: true };
    if (step.action === "refuse") return { ok: false, reason: step.reason };
    if (step.action === "cancel") { await save(actor, step.record); return { ok: true, cancelled: true }; }
    if (!Array.isArray(current.targets)) return { ok: false, reason: "targets" };
    await save(actor, { ...step.record, volley: { stage: "claimed", results: [] } });
    const result = await volley({ actor, record: step.record, targets: current.targets,
      readCurrent: async () => writer() && !interrupted.has(actor.uuid) && read(actor)?.castId === record.castId
        && read(actor)?.phase === "striking" ? inspect() : null,
      checkpoint: async progress => {
        if (!writer() || progress.castId !== record.castId) return false;
        const latest = read(actor);
        if (latest?.castId !== record.castId || latest.phase !== "striking") return false;
        await save(actor, { ...latest, interrupted: interrupted.has(actor.uuid), volley: structuredClone(progress) });
        return true;
      } });
    const latest = read(actor);
    if (latest?.castId !== record.castId || latest.phase !== "striking") return { ok: false, reason: "changed" };
    await save(actor, { ...latest, phase: result?.ok ? "complete" : "striking", result: structuredClone(result),
      interrupted: interrupted.has(actor.uuid) });
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Whirlwind advance requires reconciliation", error);
    return { ok: false, reason: "writeUncertain" };
  } finally { busy.delete(actor.uuid); }
}
