import { geyserResolution, claimGeyserStep, finishGeyserStep } from "../rules/geyser.mjs";
export const GEYSER_RECEIPTS = "geyserReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Server-owned orchestration. Callbacks authenticate/measure, pay, roll and
 * mutate through existing Foundry doors. Claims precede side effects; lost
 * acknowledgements leave a receipt requiring reconciliation, never replay. */
export async function runGeyser({ actor, requestId, targets, validate, pay, resist, push, slow } = {}) {
  const refuse = reason => ({ok:false, reason});
  if (!writer() || !actor?.uuid || typeof requestId !== "string" || !requestId.trim()
    || !Array.isArray(targets) || !targets.length || targets.some(id => typeof id !== "string" || !id.trim())
    || new Set(targets).size !== targets.length || [validate,pay,resist,push,slow].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", GEYSER_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete","cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && JSON.stringify(read()) === JSON.stringify(expected);
    const valid = async target => unchanged() && await validate(target) && unchanged();
    const save = async patch => {
      if (!unchanged()) throw new Error("Geyser receipt changed");
      const next = structuredClone(expected);
      next[index] = {...record,...patch};
      await actor.setFlag("azeroth-rpg",GEYSER_RECEIPTS,next);
      if (!current() || JSON.stringify(read()) !== JSON.stringify(next)) throw new Error("Geyser receipt unconfirmed");
      expected=next; record=next[index];
    };
    if (!await valid()) return refuse("changed");
    await save({requestId,targets:[...targets],stage:"paying",paid:null,consumed:null,results:[]});
    if (!await valid()) return refuse("changed");
    const payment=await pay();
    if (payment?.paid !== true || payment?.consumed !== true) {
      await save({stage:payment?.paid === false && payment?.consumed === false ? "cancelled" : "unresolved",
        paid:payment?.paid ?? null,consumed:payment?.consumed ?? null});
      return refuse("payment");
    }
    await save({stage:"resolving",paid:true,consumed:true});
    for (const target of targets) {
      if (!await valid(target)) return refuse("changed");
      await save({stage:"rolling",pendingTarget:target});
      if (!await valid(target)) return refuse("changed");
      const test=await resist(target);
      const resolution=geyserResolution(target,test?.passed);
      if (!resolution || typeof test?.cardId !== "string" || !test.cardId.trim()) return refuse("testUncertain");
      await save({stage:"resolving",pendingTarget:null,results:[...record.results,{...resolution,cardId:test.cardId}]});
      const resultIndex=record.results.length-1;
      for (const step of ["push","slow"]) {
        const state=record.results[resultIndex];
        if (state.stage === "complete") break;
        if (!await valid(target)) return refuse("changed");
        const claimed=claimGeyserStep(state);
        if (!claimed || claimed.pending !== step) return refuse("stateInvalid");
        const results=structuredClone(record.results); results[resultIndex]=claimed;
        await save({results});
        if (!await valid(target)) return refuse("changed");
        const outcome=await (step === "push" ? push : slow)(target, {valid:() => valid(target)});
        const finished=finishGeyserStep(claimed,step,outcome);
        if (!finished) return refuse("outcomeUncertain");
        const confirmed=structuredClone(record.results); confirmed[resultIndex]=finished;
        await save({results:confirmed});
      }
    }
    if (!unchanged() || record.results.length !== targets.length || record.results.some(row => row.stage !== "complete")) return refuse("incomplete");
    await save({stage:"complete"});
    return {ok:true,paid:true,consumed:true,results:structuredClone(record.results)};
  } catch (error) {
    console.warn("azeroth-rpg | Geyser requires reconciliation",error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
