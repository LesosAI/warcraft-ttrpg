/** GM authority for the Elder's limited attack burst and casting response. */
import { ELDER_THRASH, ELDER_PUMMEL, elderThrashPlan } from "../rules/elder-diemetradon.mjs";
import { tendonRipTargetValid } from "./tendon-rip.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollElderThrash } from "./elder-thrash.mjs";
import { layBane } from "./banes.mjs";

export const ELDER_QUERY = "azeroth-rpg.elderDiemetradon";
const busy = new Set();
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const words = (key, args = {}) => game.i18n.format(`AZEROTH.ElderDiemetradon.${key}`, args);

export async function requestElderAbility(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await elderQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ELDER_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(words(result?.paid ? "PaidFailure" : "Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Elder ability request", error);
    ui.notifications?.warn(words("Unknown"));
    return null;
  }
}

export async function elderQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!tendonRipTargetValid(actor, source, targets)) return refuse("target");
  const row = () => actor.system?.creatureAbilities?.[index];
  const rule = [ELDER_THRASH, ELDER_PUMMEL].find(r => r.name === row()?.name);
  if (!rule) return refuse("ability");
  const scene = game.scenes.get(source.sceneId), origin = scene.tokens.get(source.tokenId);
  const token = scene.tokens.get(targets[0].tokenId), victim = token.actor;
  const keys = [actor.uuid, victim.uuid];
  if (keys.some(k => busy.has(k))) return refuse("busy");
  keys.forEach(k => busy.add(k));
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const valid = () => gmHere() && actor.testUserPermission(user, "OWNER") && clock() === started
    && Number.isInteger(index) && row()?.name === rule.name && row().automation?.action === rule.action
    && row().automation?.uses?.max === 1 && row().automation?.uses?.per === "short"
    && row().automation?.uses?.value === (consumed ? 0 : 1)
    && game.scenes.get(scene.id) === scene && scene.tokens.get(origin.id) === origin
    && scene.tokens.get(token.id) === token && token.actor === victim
    && tendonRipTargetValid(actor, source, targets) && !realmRefusalFor(actor, "ability")
    && actor.system.health?.value > 0 && victim.system.health?.value > 0;
  try {
    if (!valid()) return refuse("changed");
    if (rule === ELDER_THRASH && !elderThrashPlan(actor.system.attacks)) return refuse("bite");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    const pay = async () => {
      if (paid || !valid()) return false;
      if (!await spendTurnBudget(actor, rule.action)) return false;
      paid = true;
      if (!valid()) return false;
      const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
      rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows });
      consumed = true;
      return valid();
    };
    if (rule === ELDER_THRASH) {
      const result = await rollElderThrash({ actor, pay, readCurrent: () => valid() ? { source: origin, target: token } : null });
      return { ...result, paid: paid || result.paid };
    }
    if (!await pay()) return refuse("payment");
    const laid = await layBane({ victim, kind: rule.testKind, banes: rule.banes, source: rule.name, by: actor });
    if (!laid) return refuse("effect");
    const text = words("PummelApplied", { name: victim.name });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:pummel",
        casting: false,
        success: true, targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] } } });
    return { ok: true, paid, effectId: laid.effectId };
  } catch (error) {
    console.warn("azeroth-rpg | Elder ability", error);
    return refuse("write");
  } finally { keys.forEach(k => busy.delete(k)); }
}
