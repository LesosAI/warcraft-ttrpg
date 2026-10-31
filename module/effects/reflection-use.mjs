/** GM-reviewed activation of Reflection Field. Recipients are fixed at use. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layReflectionField } from "./reflection.mjs";

export const REFLECTION_QUERY = "azeroth-rpg.reflectionField";
const pending = new Set();
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function requestReflectionField(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  const gm = game.users?.activeGM;
  if (!game.user.isGM && !gm) { ui.notifications.warn("Reflection Field needs an active GM to confirm its recipients."); return null; }
  const result = game.user.isGM ? await reflectionQueryHandler(data, { user: game.user }) : await gm.query(REFLECTION_QUERY, data, { timeout: 180000 });
  if (result?.ok === false && result.reason !== "cancelled") ui.notifications.warn(result.message ?? "Reflection Field could not be activated. Check its uses, turn budget, and selected creatures.");
  return result;
}

export async function reflectionQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  if (!game.user?.isGM) throw new Error("Reflection Field must be resolved by the GM.");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this creature.");
  const rowAt = () => actor.system?.creatureAbilities?.[index];
  const held = () => Number.isInteger(index) && rowAt()?.name === "Reflection Field" && rowAt()?.automation?.uses?.max === 1 && rowAt()?.automation?.uses?.per === "short";
  if (!held()) throw new Error("This creature does not have Reflection Field.");
  if (pending.has(actor.uuid)) return { ok: false, reason: "pending" };
  pending.add(actor.uuid);
  try {
    if ((rowAt().automation.uses.value ?? 1) <= 0) return { ok: false, reason: "noUses" };
    if (realmRefusalFor(actor, "ability")) return { ok: false, reason: "realm" };
    const scene = game.scenes.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
    if (!sourceToken || sourceToken.actor?.uuid !== actor.uuid) return { ok: false, reason: "source" };
    const selected = [sourceToken];
    const candidates = [];
    for (const ref of targets) {
      const token = ref.sceneId === scene.id ? scene.tokens.get(ref.tokenId) : null;
      if (!token?.actor) return { ok: false, reason: "target" };
      if (token.actor.uuid !== actor.uuid && !candidates.some(t => t.actor.uuid === token.actor.uuid)) candidates.push(token);
    }
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const menu = { id: `${actor.id}-reflection`, name: "Reflection Field" };
    for (const token of candidates) {
      const distance = feetApart(sourceToken, token);
      if (!Number.isFinite(distance) || distance < 0 || distance > 10) return { ok: false, reason: "range" };
      const answer = await chooseOption(menu, [
        { key: "skip", name: "Skip this creature", description: "" },
        { key: "ally", name: "Protect this willing ally", description: "Protection lasts until the nullifier's next turn." }
      ], null, { prompt: `GM: Is ${token.name} a willing ally of ${actor.name}?` });
      if (!answer) return { ok: false, reason: "cancelled" };
      if (answer.key === "ally") selected.push(token);
    }
    const confirm = await chooseOption(menu, [
      { key: "cancel", name: "Cancel", description: "Spend nothing." },
      { key: "activate", name: "Activate Reflection Field", description: "Spend a Half-Action and one Short Rest use." }
    ], null, { prompt: `Protect: ${selected.map(t => t.name).join(", ")}.` });
    if (confirm?.key !== "activate") return { ok: false, reason: "cancelled" };
    const present = token => [...scene.tokens.values()].includes(token);
    if (!present(sourceToken) || sourceToken.actor?.uuid !== actor.uuid || selected.some(t => !present(t))) return { ok: false, reason: "target" };
    if (selected.some(t => t !== sourceToken && (!Number.isFinite(feetApart(sourceToken, t)) || feetApart(sourceToken, t) > 10))) return { ok: false, reason: "range" };
    if (!held() || (rowAt().automation.uses.value ?? 1) <= 0) return { ok: false, reason: "noUses" };
    if (realmRefusalFor(actor, "ability")) return { ok: false, reason: "realm" };
    if (!(await spendTurnBudget(actor, "half"))) return { ok: false, reason: "action" };
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    const protectedNames = [], failedNames = [];
    for (const token of selected) {
      const distance = token === sourceToken ? 0 : feetApart(sourceToken, token);
      if (!present(sourceToken) || !present(token) || !Number.isFinite(distance) || distance > 10) { failedNames.push(token.name); continue; }
      try {
        const made = await layReflectionField({ sourceToken, target: token.actor });
        (made ? protectedNames : failedNames).push(token.name);
      } catch { failedNames.push(token.name); }
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:reflection-field",
        casting: false, success: protectedNames.length > 0 } },
      content: `<p><strong>Reflection Field</strong></p><p>Protected until ${escape(actor.name)}'s next turn: ${escape(protectedNames.join(", ") || "none")}.</p>${failedNames.length ? `<p>Protection could not be applied to: ${escape(failedNames.join(", "))}. The action and use were spent.</p>` : ""}` });
    return { ok: failedNames.length === 0, reason: failedNames.length ? "partial" : null, protectedNames, failedNames,
      ...(failedNames.length ? { message: "Some creatures could not receive Reflection Field. Check the chat result; the action and use were spent." } : {}) };
  } finally { pending.delete(actor.uuid); }
}
