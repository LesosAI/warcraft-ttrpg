/** Fey Dragon's resisted, bounded Mana transfer, executed by the active GM. */
import { NULLIFY_MANA, nullifyManaPayment, nullifyManaPlan } from "../rules/nullify-mana.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";

export const NULLIFY_MANA_QUERY = "azeroth-rpg.nullifyMana";
const busy = new Set();
const gmHere = () => game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const words = (key, args = {}) => game.i18n.format(`AZEROTH.NullifyMana.${key}`, args);

export async function requestNullifyMana(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const result = await useNullifyMana(actor, index, { source: sourceOf(actor), targets });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(words(result?.paid ? "PaidFailure" : "Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Nullify Mana request", error);
    ui.notifications?.warn(words("Unknown"));
    return null;
  }
}

export async function useNullifyMana(actor, index, { source, targets = [] } = {}) {
  const data = { actorUuid: actor.uuid, index, source,
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  if (gmHere()) return nullifyManaQueryHandler(data, { user: game.user });
  if (!game.users?.activeGM) return { ok: false, reason: "noGM" };
  return game.users.activeGM.query(NULLIFY_MANA_QUERY, data, { timeout: 180000 });
}

export async function nullifyManaQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id) return refuse("noGM");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
  const ref = targets[0], token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref.tokenId) : null;
  const target = token?.actor;
  if (!target?.uuid || target === actor) return refuse("target");
  const keys = [actor.uuid, target.uuid];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  keys.forEach(key => busy.add(key));
  let paid = false, consumed = false;
  const clock = () => game.combat?.started
    ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const row = () => actor.system?.creatureAbilities?.[index];
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (clock() !== started) return "clock";
    if (!Number.isInteger(index) || row()?.name !== NULLIFY_MANA.name || row()?.automation?.action !== "action"
      || row()?.automation?.uses?.max !== 1 || row()?.automation?.uses?.per !== "short"
      || row()?.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (game.scenes.get(source.sceneId) !== scene || scene.tokens.get(source.tokenId) !== sourceToken || sourceToken?.actor !== actor
      || scene.tokens.get(ref.tokenId) !== token || token.actor !== target) return "target";
    if (realmRefusalFor(actor, "ability") || realmRefusalFor(target, "ability")) return "realm";
    if (iceBlockFor(actor) || iceBlockFor(target)) return "iceBlock";
    if (!(actor.system?.health?.value > 0) || !(target.system?.health?.value > 0)) return "down";
    if ((target.system?.immune ?? []).includes("arcane")) return "immune";
    const distance = feetApart(sourceToken, token);
    if (!Number.isFinite(distance) || distance < 0 || distance > NULLIFY_MANA.feet) return "range";
    return null;
  };
  try {
    let reason = validate();
    if (reason) return refuse(reason);
    if (!nullifyManaPayment(actor.poolSnapshot()) || !nullifyManaPlan({ source: actor.poolSnapshot(), target: target.poolSnapshot() })) return refuse("pool");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ id: `${actor.id}-nullify`, name: NULLIFY_MANA.name }, [
      { key: "cancel", name: words("Cancel"), description: words("NoCost") },
      { key: "use", name: words("Use"), description: words("Cost") }
    ], null, { prompt: words("Target", { name: target.name }) });
    if (choice?.key !== "use") return refuse("cancelled");
    reason = validate();
    const payment = nullifyManaPayment(actor.poolSnapshot());
    if (reason || !payment) return refuse(reason ?? "pool");
    const paymentBefore = JSON.stringify(actor.poolSnapshot());
    if (!await spendTurnBudget(actor, "action")) return refuse("action");
    paid = true;
    reason = validate();
    if (reason) return { ...refuse(reason), paid };
    if (JSON.stringify(actor.poolSnapshot()) !== paymentBefore) return { ...refuse("poolChanged"), paid };
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.updatePool(payment, { "system.creatureAbilities": abilities });
    consumed = true;
    reason = validate();
    if (reason) return { ...refuse(reason), paid };
    const card = await rollResilience({ actor: target, resilience: "spirit", dc: 15, subtitle: NULLIFY_MANA.name });
    const success = card?.rolls?.[0]?.outcome?.success;
    if (typeof success !== "boolean") return { ...refuse("unresolved"), paid };
    reason = validate();
    if (reason) return { ...refuse(reason), paid };
    let drained = 0, restored = 0;
    if (!success) {
      const plan = nullifyManaPlan({ source: actor.poolSnapshot(), target: target.poolSnapshot() });
      if (!plan) return { ...refuse("pool"), paid };
      const receiverBefore = JSON.stringify(actor.poolSnapshot());
      if (plan.targetChange) await target.updatePool(plan.targetChange);
      drained = plan.drained;
      reason = validate();
      if (reason || JSON.stringify(actor.poolSnapshot()) !== receiverBefore) return { ...refuse(reason ?? "poolChanged"), paid, drained };
      if (plan.sourceChange) await actor.updatePool(plan.sourceChange);
      restored = plan.restored;
    }
    const text = words(success ? "Resisted" : "Applied", { name: target.name, drained, restored });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:nullify-mana",
        casting: false,
        success: !success && drained > 0, targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: target.uuid, name: target.name }] } } });
    return { ok: true, paid, resisted: success, drained, restored };
  } catch (error) {
    console.warn("azeroth-rpg | Nullify Mana", error);
    return { ...refuse("write"), paid };
  } finally { keys.forEach(key => busy.delete(key)); }
}
