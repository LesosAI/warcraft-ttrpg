import { GUARD_NET as SPEC, guardNetTarget } from "../rules/guard-net.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { applyGuardNet } from "./guard-net.mjs";
export const GUARD_NET_QUERY = "azeroth-rpg.guardNet";
const FLAG = "guardNetThrows", busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

export async function requestGuardNet(actor, index, targets = []) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const request = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(),
      targets: targets.map(target => ({ sceneId: target.sceneId, tokenId: target.tokenId })) };
    const result = writer() ? await guardNetQueryHandler(request, { user: game.user })
      : await game.users?.activeGM?.query(GUARD_NET_QUERY, request, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      "Guard Net could not finish. Review its saved throw, Action, encounter use and Reflex Test before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Guard Net request", error);
    ui.notifications?.warn("Guard Net's response was interrupted. Review its saved throw before continuing.");
    return null;
  }
}

export async function guardNetQueryHandler({ actorUuid, index, source, targets = [], requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const ref = targets[0], token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref.tokenId) : null, victim = token?.actor;
  if (!origin || origin.actor !== actor || !victim?.uuid || victim === actor || !scene.levels?.get(origin._source?.level)) return refuse("sourceOrTarget");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  let consumed = false;
  const originPoint = point(origin), targetPoint = point(token);
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source));
  const wallStamp = walls();
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const owned = () => writer() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER");
  const validate = () => {
    if (!owned() || fromUuidSync(victim.uuid) !== victim || started === null || clock() !== started || walls() !== wallStamp) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(entry => entry.name === SPEC.name).length !== 1 || row?.name !== SPEC.name || a?.kind !== "utility"
      || a.action !== SPEC.action || a.cost?.amount || a.uses?.max !== SPEC.uses || a.uses?.per !== SPEC.per
      || a.uses.value !== (consumed ? 0 : 1)) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || realmRefusalFor(actor, "ability")
      || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim || point(origin) !== originPoint || point(token) !== targetPoint
      || !scene.levels.get(origin._source?.level) || realmRefusalFor(victim, "ability") || projectionRefusal(victim, "ability")) return false;
    return guardNetTarget({ feet: feetApart(origin, token), alive: victim.system?.health?.value > 0,
      sameLevel: token._source?.level === origin._source?.level, hostile: true,
      immune: (victim.system?.conditionImmunities ?? []).includes(SPEC.condition) });
  };
  const records = actor.getFlag("azeroth-rpg", FLAG) ?? [];
  let record;
  const save = async next => {
    if (!owned()) throw new Error("Guard Net writer changed");
    await actor.setFlag("azeroth-rpg", FLAG, [...records, next]);
    if (!owned() || JSON.stringify(actor.getFlag("azeroth-rpg", FLAG)) !== JSON.stringify([...records, next])) throw new Error("Guard Net receipt unconfirmed");
    record = next;
  };
  try {
    if (!Array.isArray(records)) return refuse("receiptInvalid");
    if (records.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (records.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "confirm", name: `Throw a net at ${token.name}`,
      description: "Spend one Action and the encounter use. Confirm this creature is an enemy and the net has a clear path. It resists with a DC 12 Reflex Test." }], null);
    if (choice?.key !== "confirm") return refuse("cancelled");
    if (!validate()) return refuse("changed");
    await save({ requestId, targetUuid: victim.uuid, source, target: ref, stage: "claimed", paid: false, consumed: false });
    if (!validate()) { await save({ ...record, stage: "cancelled" }); return refuse("changed"); }
    await save({ ...record, stage: "paying", paid: null });
    if (!validate()) return refuse("changed");
    if (!await spendTurnBudget(actor, SPEC.action)) { await save({ ...record, stage: "cancelled", paid: false }); return refuse("action"); }
    await save({ ...record, paid: true });
    if (!validate()) return refuse("changed");
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows });
    consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
    await save({ ...record, consumed, stage: "resisting" });
    if (!consumed || !validate()) return refuse("changed");
    const card = await rollResilience({ actor: victim, resilience: "reflex", dc: SPEC.dc, subtitle: SPEC.name });
    const resisted = card?.rolls?.[0]?.outcome?.success;
    if (!card?.id || typeof resisted !== "boolean") return refuse("testUnresolved");
    await save({ ...record, resistanceCardId: card.id, resisted });
    if (!validate()) return refuse("changed");
    const result = resisted ? { ok: true, resisted: true }
      : await applyGuardNet({ source: actor, target: victim, eventId: requestId, valid: validate });
    await save({ ...record, stage: result.ok ? "complete" : "unresolved", result });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Guard Net</strong></p><p>${resisted ? "The target avoids the net." : "The target is Entangled. Spend an Action and pass a DC 12 Reflex Resilience Test to escape."}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:guard-net",
            casting: false, success: !resisted,
            targets: resisted ? [] : [ref], guardNet: { requestId, resistanceCardId: card.id, effectId: result.effectId ?? null } } } });
      } catch (error) { console.warn("azeroth-rpg | Guard Net resolved; feedback unavailable", error); }
    }
    return { ...result, paid: true, consumed: true, resistanceCardId: card.id };
  } catch (error) {
    console.warn("azeroth-rpg | Guard Net throw needs reconciliation", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
