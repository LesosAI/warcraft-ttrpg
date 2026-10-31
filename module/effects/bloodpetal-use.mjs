/** GM-owned activation: validate, confirm, pay, resist, lay one root effect. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layBloodpetalRoots } from "./bloodpetal.mjs";
import { BLOODPETAL, BLOODPETAL_FLAG, validBloodpetal, rootDifficulty } from "../rules/bloodpetal.mjs";
export const BLOODPETAL_QUERY = "azeroth-rpg.bloodpetalRoots";
const pending = new Set();
const text = (key, data = {}) => game.i18n.format(`AZEROTH.Bloodpetal.${key}`, data);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function requestBloodpetalRoots(actor, index, targets = []) {
  const gm = game.users?.activeGM;
  if (!gm) { ui.notifications?.warn(text("NeedGM")); return null; }
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  const result = gm.id === game.user.id ? await bloodpetalQueryHandler(data, { user: game.user }) : await gm.query(BLOODPETAL_QUERY, data, { timeout: 180000 });
  if (result?.ok === false && result.reason !== "cancelled") ui.notifications?.warn(text(result.paid ? "PaidFailure" : "Refused"));
  return result;
}

export async function bloodpetalQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) throw new Error("Bloodpetal roots require the active GM.");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this creature.");
  if (pending.has(actor.uuid)) return { ok: false, reason: "pending" };
  pending.add(actor.uuid);
  try {
    const rowAt = () => actor.system?.creatureAbilities?.[index];
    const hasAbility = () => Number.isInteger(index) && rowAt()?.name === BLOODPETAL.name
      && rowAt()?.automation?.action === "action" && rowAt()?.automation?.uses?.max === 1 && rowAt()?.automation?.uses?.per === "short";
    if (!hasAbility()) throw new Error("This creature does not have Bloodpetal Entangling Roots.");
    const dc = rootDifficulty(rowAt().automation);
    if (dc === null) return { ok: false, reason: "invalidDC" };
    if (!Array.isArray(targets) || targets.length !== 1) return { ok: false, reason: "oneTarget" };
    const scene = game.scenes.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
    const ref = targets[0], token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
    const victim = token?.actor, combat = game.combat?.started ? game.combat : null;
    const validate = (paid = false) => {
      if (!hasAbility() || (!paid && (rowAt().automation.uses.value ?? 1) <= 0)) return "noUses";
      if (rootDifficulty(rowAt().automation) !== dc) return "changedDC";
      if (!actor.testUserPermission(user, "OWNER")) return "ownership";
      if (!sourceToken || scene.tokens.get(source.tokenId) !== sourceToken || sourceToken.actor !== actor) return "source";
      if (!victim || scene.tokens.get(ref.tokenId) !== token || token.actor !== victim || victim === actor) return "target";
      if (realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")) return "realm";
      if (combat ? !combat.started || game.combat !== combat || !combat.getCombatantsByActor(actor)?.length || !combat.getCombatantsByActor(victim)?.length
        : game.combat?.started || !Number.isFinite(game.time?.worldTime)) return "encounter";
      const distance = feetApart(sourceToken, token);
      if (!Number.isFinite(distance) || distance < 0 || distance > BLOODPETAL.feet) return "range";
      if ((victim.system?.conditionImmunities ?? []).includes("entangled")) return "immune";
      if ([...victim.effects].some(e => validBloodpetal(e.flags?.["azeroth-rpg"]?.[BLOODPETAL_FLAG]))) return "alreadyAffected";
      return null;
    };
    let reason = validate();
    if (reason) return { ok: false, reason };
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ id: `${actor.id}-roots`, name: text("Name") }, [
      { key: "cancel", name: text("Cancel"), description: text("SpendNothing") },
      { key: "activate", name: text("Activate"), description: text("Cost", { dc }) }
    ], null, { prompt: text("Target", { name: victim.name }) });
    if (choice?.key !== "activate") return { ok: false, reason: "cancelled" };
    reason = validate();
    if (reason) return { ok: false, reason };
    if (!(await spendTurnBudget(actor, "action"))) return { ok: false, reason: "action" };
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    let result;
    try {
      reason = validate(true);
      if (reason) result = { ok: false, reason };
      else {
        const card = await rollResilience({ actor: victim, resilience: "reflex", dc, subtitle: text("Name") });
        const success = card?.rolls?.[0]?.outcome?.success;
        if (typeof success !== "boolean") result = { ok: false, reason: "testUnresolved" };
        else if (success) result = { ok: true, resisted: true };
        else {
          reason = validate(true);
          result = reason ? { ok: false, reason } : await layBloodpetalRoots({ source: actor, target: victim, combat, dc });
        }
      }
    } catch { result = { ok: false, reason: "applicationFailed" }; }
    const message = result.resisted ? text("Resisted", { name: victim.name }) : result.ok ? text("Applied", { name: victim.name }) : text("PaidFailure");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${escape(message)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:entangling-roots",
        casting: false,
        success: result.ok && !result.resisted, targets: [{ sceneId: scene.id, tokenId: ref.tokenId, actorUuid: victim.uuid, name: victim.name }] } } });
    return { ...result, paid: true };
  } finally { pending.delete(actor.uuid); }
}
