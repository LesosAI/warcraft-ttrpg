/** Two-press Stinger Charge: declare, move normally, then use again to attack. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { createVeknissChargeStore } from "./vekniss-charge.mjs";
import { rollVeknissCharge } from "./vekniss-attack.mjs";
import { VEKNISS_FLAG } from "../rules/vekniss.mjs";

export const STINGER_QUERY = "azeroth-rpg.stingerCharge";
const store = createVeknissChargeStore();
const declarations = new Map();
const pending = new Set();
const sourceExists = uuid => {
  if (typeof uuid !== "string" || !uuid) return false;
  try {
    const actor = fromUuidSync(uuid);
    return actor?.documentName === "Actor" && actor.uuid === uuid;
  } catch { return false; }
};

export async function requestStingerCharge(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const gm = game.users?.activeGM;
  if (!gm) { ui.notifications.warn("Stinger Charge needs an active GM."); return null; }
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  const result = gm.id === game.user.id ? await stingerQueryHandler(data, { user: game.user })
    : await gm.query(STINGER_QUERY, data, { timeout: 180000 });
  if (result?.message) ui.notifications.info(result.message);
  else if (result?.ok === false && result.reason !== "cancelled") ui.notifications.warn(`Stinger Charge could not be completed (${result.reason}).`);
  return result;
}

export async function stingerQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) throw new Error("Stinger Charge requires the active GM.");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this creature.");
  if (pending.has(actor.uuid)) return { ok: false, reason: "pending" };
  pending.add(actor.uuid);
  try {
    const held = () => Number.isInteger(index) && actor.system?.creatureAbilities?.[index]?.name === "Stinger Charge";
    if (!held()) return { ok: false, reason: "ability" };
    if (!Array.isArray(targets) || targets.length !== 1) return { ok: false, reason: "oneTarget" };
    const scene = game.scenes.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
    const ref = targets[0], targetToken = ref?.sceneId === scene?.id ? scene?.tokens.get(ref.tokenId) : null;
    if (!sourceToken || sourceToken.actor !== actor || !targetToken?.actor) return { ok: false, reason: "target" };
    const victim = targetToken.actor, combat = game.combat;
    const clock = () => ({ round: combat?.round, turn: combat?.turn });
    const valid = () => held() && actor.testUserPermission(user, "OWNER") && !realmRefusalFor(actor, "ability")
      && scene.tokens.get(sourceToken.id) === sourceToken && sourceToken.actor === actor
      && scene.tokens.get(targetToken.id) === targetToken && targetToken.actor === victim
      && game.combat === combat && combat?.started && combat.combatant?.actor === actor
      && combat.combatant?.tokenId === sourceToken.id && combat.getCombatantsByActor(victim)?.length
      && !combat.combatant.isDefeated && actor.system?.health?.value > 0;
    if (!valid()) return { ok: false, reason: "encounter" };
    let saved = declarations.get(actor.uuid);
    if (saved && (saved.combat !== combat || saved.round !== combat.round || saved.turn !== combat.turn)) {
      store.cancel(actor.uuid); declarations.delete(actor.uuid); saved = null;
    }
    const { chooseOption } = await import("../dice/workflows.mjs");
    const menu = { id: `${actor.id}-stinger-charge`, name: "Stinger Charge" };
    if (!saved || !store.has(actor.uuid)) {
      const choice = await chooseOption(menu, [
        { key: "cancel", name: "Cancel", description: "Spend nothing." },
        { key: "walk", name: "Declare a ground charge", description: "Move directly toward the target, then use Stinger Charge again to attack." },
        { key: "fly", name: "Declare a flying charge", description: "Fly directly toward the target, then use Stinger Charge again to attack." }
      ], null, { prompt: `Declare a charge against ${victim.name}. Movement and the attack pay their normal costs.` });
      if (!["walk", "fly"].includes(choice?.key)) return { ok: false, reason: "cancelled" };
      if (!valid()) return { ok: false, reason: "encounter" };
      const action = choice.key;
      if (action === "fly" && !(actor.system.flyingSpeed > 0)) return { ok: false, reason: "cannotFly" };
      const speed = combat.combatant._pace({ passed: { waypoints: [{ action }] } });
      const result = store.declare({ sourceUuid: actor.uuid, targetUuid: victim.uuid, combatUuid: combat.uuid,
        sceneId: scene.id, sourceTokenId: sourceToken.id, targetTokenId: targetToken.id, clock: clock(),
        distance: feetApart(sourceToken, targetToken), speed, reach: 5, onTurn: true, hasAbility: true }, sourceToken, targetToken, action);
      if (result.ok) declarations.set(actor.uuid, { combat, round: combat.round, turn: combat.turn, sourceToken, targetToken, action });
      return { ...result, ...(result.ok ? { message: "Charge declared. Move at least 10 feet directly toward the target, within one Speed, then use Stinger Charge again. Movement and the attack cost their normal actions." } : {}) };
    }
    if (saved.sourceToken !== sourceToken || saved.targetToken !== targetToken) return { ok: false, reason: "declaredTarget" };
    const choice = await chooseOption(menu, [
      { key: "wait", name: "Keep the declaration", description: "Finish moving before attacking." },
      { key: "cancel", name: "Cancel the charge", description: "Movement already spent is not refunded." },
      { key: "attack", name: "Confirm route and attack", description: "GM confirms a direct, unobstructed approach. The normal attack costs a Half-Action." }
    ], null, { prompt: `GM: Did ${actor.name} move directly toward ${victim.name}, without teleporting or being moved by another creature?` });
    if (choice?.key === "cancel") { store.cancel(actor.uuid); declarations.delete(actor.uuid); return { ok: false, reason: "cancelled" }; }
    if (choice?.key !== "attack") return { ok: false, reason: "cancelled" };
    const attackIndex = actor.system.attacks?.findIndex(a => a.name === "Sting") ?? -1;
    if (attackIndex < 0) return { ok: false, reason: "stingMissing" };
    const approvedHistory = JSON.stringify(sourceToken._source?._movementHistory ?? []);
    const readCurrent = () => {
      if (!valid()) return null;
      if (JSON.stringify(sourceToken._source?._movementHistory ?? []) !== approvedHistory) return null;
      const action = saved.action;
      const speed = combat.combatant._pace({ passed: { waypoints: [{ action }] } });
      // Mixed-mode history cannot be justified by multiplying all paid Moves
      // by a faster mode. Refuse rather than overstate the paid allowance.
      if ((sourceToken._source?._movementHistory ?? []).some(w => w.action !== action)) return null;
      const paid = combat.combatant.getFlag("azeroth-rpg", "moveHalves") ?? 0;
      return { source: sourceToken, target: targetToken, paidFeet: paid * speed,
        context: { sourceUuid: actor.uuid, targetUuid: victim.uuid, combatUuid: combat.uuid,
          sceneId: scene.id, sourceTokenId: sourceToken.id, targetTokenId: targetToken.id, clock: clock(),
          distance: feetApart(sourceToken, targetToken), speed, onTurn: true, hasAbility: true, directApproach: true,
          effects: [...victim.effects].filter(e => e.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG]).map(e => ({ active: e.active !== false && !e.disabled
            && [...(e.statuses ?? [])].includes("poisoned") && sourceExists(e.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG]?.sourceUuid),
          state: e.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG] })) } };
    };
    if (!readCurrent()) return { ok: false, reason: "movementOrEncounter" };
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const snapshots = targetSnapshots([{ id: targetToken.id, actor: victim, name: targetToken.name, scene }]);
    const card = await rollVeknissCharge({ actor, index: attackIndex, targets: snapshots, store, readCurrent });
    if (!store.has(actor.uuid)) declarations.delete(actor.uuid);
    return card ? { ok: true, cardId: card.id } : { ok: false, reason: "notRolled" };
  } finally { pending.delete(actor.uuid); }
}
