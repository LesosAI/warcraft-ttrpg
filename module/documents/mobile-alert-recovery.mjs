import { MOBILE_ALERT_FLAG } from "../rules/mobile-alert.mjs";
import { mobileAlertRecovery } from "../rules/mobile-alert-recovery.mjs";
import { mobileAlertBusy as busy, releaseMobileAlert } from "../effects/mobile-alert-lock.mjs";

const values = collection => [...collection.values()];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = token => token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG) ?? null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inCombat = token => values(game.combats).some(combat => values(combat.combatants)
  .some(row => (row.tokenId === token.id && (row.sceneId ?? combat.scene?.id) === token.parent.id)
    || (token.actor?.uuid && row.actor?.uuid === token.actor.uuid)));

/** Explicit active-GM reconciliation after stopping any pending operation.
 * A complete scene inventory is mandatory before concluding a token is gone. */
export async function recoverMobileAlert({ token, operation = "recover", review } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !token?.uuid || typeof review !== "function" || busy.has(token.uuid)) return refuse("authorityOrBusy");
  busy.add(token.uuid);
  try {
    let receipt = structuredClone(flag(token));
    const scene = token.parent, actor = token.actor;
    const allowed = () => gmHere() && game.scenes?.get(scene?.id) === scene
      && scene.tokens.get(token.id) === token && token.actor === actor && same(flag(token), receipt);
    const inventory = () => {
      if (!game.scenes?.values || !game.combats?.values) return null;
      const documents = [];
      for (const scene of values(game.scenes)) {
        if (!scene.tokens?.values) return null;
        documents.push(...values(scene.tokens));
      }
      return documents;
    };
    const decide = documents => mobileAlertRecovery({ ownerUuid: token.uuid, record: receipt,
      operation, pendingStopped: true, inCombat: inCombat(token), inventoryComplete: documents !== null,
      tokens: documents?.map(t => ({ ...flag(t), uuid: t.uuid, inCombat: inCombat(t) })) });
    if (!allowed()) return refuse("source");
    let documents = inventory(), plan = decide(documents);
    if (!plan.ok) return plan;
    const initialPlan = structuredClone(plan);
    if (!await review({ token, operation, record: structuredClone(receipt), plan: initialPlan,
      prompt: "Stop any pending alarm operation and inspect its Action and sentries. Recovery never rerolls, refunds, heals or creates a reinforcement. Reset removes only this alarm's reviewed sentries." })) return refuse("cancelled");
    if (!allowed()) return refuse("changed");
    documents = inventory(); plan = decide(documents);
    if (!plan.ok || !same(plan, initialPlan)) return refuse("inventoryChanged");
    if (plan.action === "retain") {
      receipt = plan.record;
      await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
      return allowed() ? { ok: true, action: "retain", record: receipt } : refuse("writeUncertain");
    }
    receipt = { ...receipt, phase: "clearing", tokens: [...plan.tokens] };
    await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
    if (!allowed()) return refuse("claimUncertain");
    for (const uuid of plan.tokens) {
      documents = inventory(); const next = decide(documents);
      if (!allowed() || !next.ok) return refuse("changed");
      const target = documents.find(t => t.uuid === uuid);
      if (!target || !next.tokens.includes(uuid)) return refuse("identity");
      await target.delete();
      if (!allowed() || inventory()?.some(t => t.uuid === uuid)) return refuse("deleteUncertain");
    }
    const final = decide(inventory());
    if (!allowed() || !final.ok || final.action !== "clear") return refuse("inventoryChanged");
    await token.unsetFlag("azeroth-rpg", MOBILE_ALERT_FLAG);
    receipt = null;
    return allowed() ? { ok: true, action: "clear" } : refuse("clearUncertain");
  } catch (error) {
    console.warn("azeroth-rpg | Mobile Alert recovery uncertain; inspect the remaining alarm record and tokens", error);
    return refuse("writeUncertain");
  } finally { releaseMobileAlert(token); }
}
