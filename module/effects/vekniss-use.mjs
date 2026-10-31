/** GM-owned Itch activation, using combat turns or exploration world time. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layVeknissItch } from "./vekniss.mjs";
import { VEKNISS, VEKNISS_FLAG, validVeknissState } from "../rules/vekniss.mjs";

export const VEKNISS_QUERY = "azeroth-rpg.veknissItch";
const pending = new Set();
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function requestVeknissItch(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const gm = game.users?.activeGM;
  if (!gm) { ui.notifications.warn("Vekniss Itch needs an active GM."); return null; }
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  const result = gm.id === game.user.id ? await veknissQueryHandler(data, { user: game.user })
    : await gm.query(VEKNISS_QUERY, data, { timeout: 180000 });
  if (result?.ok === false && result.reason !== "cancelled") ui.notifications.warn(result.message ?? `Vekniss Itch could not be completed (${result.reason}).`);
  return result;
}

export async function veknissQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) throw new Error("Vekniss Itch must be resolved by the active GM.");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this creature.");
  if (pending.has(actor.uuid)) return { ok: false, reason: "pending" };
  pending.add(actor.uuid);
  try {
    const rowAt = () => actor.system?.creatureAbilities?.[index];
    const held = () => Number.isInteger(index) && rowAt()?.name === "Vekniss Itch"
      && rowAt()?.automation?.uses?.max === 1 && rowAt()?.automation?.uses?.per === "short";
    if (!held()) throw new Error("This creature does not have Vekniss Itch.");
    if (!Array.isArray(targets) || targets.length !== 1) return { ok: false, reason: "oneTarget" };
    const scene = game.scenes.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
    const ref = targets[0], targetToken = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
    const victim = targetToken?.actor, combat = game.combat?.started ? game.combat : null;
    const validate = ({ paid = false } = {}) => {
      if (!held() || (!paid && (rowAt().automation.uses.value ?? 1) <= 0)) return "noUses";
      if (!actor.testUserPermission(user, "OWNER")) return "ownership";
      if (realmRefusalFor(actor, "ability")) return "realm";
      if (!sourceToken || scene.tokens.get(source.tokenId) !== sourceToken || sourceToken.actor !== actor) return "source";
      if (!victim || scene.tokens.get(ref.tokenId) !== targetToken || targetToken.actor !== victim || victim === actor) return "target";
      if (combat ? !combat.started || game.combat !== combat || !combat.getCombatantsByActor(actor)?.length || !combat.getCombatantsByActor(victim)?.length
        : game.combat?.started || !Number.isFinite(game.time?.worldTime)) return "encounter";
      const distance = feetApart(sourceToken, targetToken);
      if (!Number.isFinite(distance) || distance < 0 || distance > 30) return "range";
      if ((victim.system?.conditionImmunities ?? []).includes("poisoned")) return "immune";
      if ([...victim.effects].some(e => validVeknissState(e.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG]))) return "alreadyAffected";
      return null;
    };
    let reason = validate();
    if (reason) return { ok: false, reason };
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ id: `${actor.id}-itch`, name: "Vekniss Itch" }, [
      { key: "cancel", name: "Cancel", description: "Spend nothing." },
      { key: "activate", name: "Use Vekniss Itch", description: "Spend a Half-Action and one Short Rest use. The target makes a DC 20 Body Test." }
    ], null, { prompt: `Target: ${victim.name}.` });
    if (choice?.key !== "activate") return { ok: false, reason: "cancelled" };
    reason = validate();
    if (reason) return { ok: false, reason };
    if (!(await spendTurnBudget(actor, "half"))) return { ok: false, reason: "action" };
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    let result;
    try {
      reason = validate({ paid: true });
      if (reason) result = { ok: false, reason };
      else {
        const card = await rollResilience({ actor: victim, resilience: "body", dc: VEKNISS.dc, subtitle: "Vekniss Itch" });
        const success = card?.rolls?.[0]?.outcome?.success;
        if (typeof success !== "boolean") result = { ok: false, reason: "testUnresolved" };
        else if (success) result = { ok: true, resisted: true };
        else {
          reason = validate({ paid: true });
          result = reason ? { ok: false, reason } : await layVeknissItch({ source: actor, target: victim, combat });
        }
      }
    } catch { result = { ok: false, reason: "applicationFailed" }; }
    const text = result.resisted ? `${victim.name} resisted Vekniss Itch.`
      : result.ok ? `${victim.name} has Vekniss Itch. ${combat ? "It becomes Catalyst at the start of their next turn." : "It becomes Catalyst after six seconds of world time."}`
      : `Vekniss Itch could not be completed (${result.reason}). The action and use were spent; check the Test and effect before resolving it manually.`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${escape(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:vekniss-itch",
        casting: false, success: result.ok && !result.resisted,
        targets: [{ sceneId: scene.id, tokenId: ref.tokenId, actorUuid: victim.uuid, name: victim.name }] } } });
    return { ...result, paid: true, ...(!result.ok ? { message: text } : {}) };
  } finally { pending.delete(actor.uuid); }
}
