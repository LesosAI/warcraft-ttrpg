import { NPC_SHIELD_SLAM as SPEC, shieldSlamShield } from "../rules/npc-shield-slam.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollNpcShieldSlam } from "./npc-shield-slam-attack.mjs";

export const NPC_SHIELD_SLAM_QUERY = "azeroth-rpg.npcShieldSlam";
const FLAG = "npcShieldSlamRequests", busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestNpcShieldSlam(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = writer() ? await npcShieldSlamQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(NPC_SHIELD_SLAM_QUERY, data, { timeout: 180000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Shield Slam was not completed. Check its saved attempt and attack card before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Shield Slam request", error);
    ui.notifications?.warn("Shield Slam could not be confirmed. Check the Action, encounter use and existing cards before trying again.");
    return null;
  }
}

export async function npcShieldSlamQueryHandler({ actorUuid, index, source, requestId, issuedAt } = {}, { user } = {}) {
  const result = { paid: false, consumed: false, attackId: null };
  const refuse = reason => ({ ok: false, reason, ...result });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const shield = shieldSlamShield([...(actor.items?.values() ?? [])]);
  const position = t => JSON.stringify([t.x, t.y, t.elevation, t._source?.level]);
  const originPosition = token ? position(token) : null, level = token?._source?.level;
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  let target = null, victim = null, targetPosition = null, receipt = null;
  const validate = () => {
    if (!writer() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return "source";
    if (!scene.levels?.get(level) || position(token) !== originPosition) return "position";
    if (started === null || clock() !== started) return "clock";
    if (!shield || !shieldSlamShield([...(actor.items?.values() ?? [])], shield.id)) return "shield";
    const row = actor.system.creatureAbilities?.[index], a = row?.automation;
    if (!Number.isInteger(index) || row?.name !== SPEC.name || a?.kind !== "utility" || a.action !== SPEC.action
      || a.cost?.amount || a.uses?.max !== 1 || a.uses.per !== SPEC.per || a.uses.value !== (result.consumed ? 0 : 1)) return "ability";
    if (!(actor.system.health?.value > 0) || actor.statuses?.has("stunned") || realmRefusalFor(actor, "ability")
      || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (target) {
      if (scene.tokens.get(target.id) !== target || target.actor !== victim || !(victim.system.health?.value > 0)) return "target";
      if (position(target) !== targetPosition || target._source?.level !== level) return "position";
      const feet = feetApart(token, target);
      if (!Number.isFinite(feet) || feet < 0 || feet > SPEC.feet) return "range";
      if (projectionPhaseFor(victim) || realmRefusalFor(victim, "ability")) return "protected";
    }
    return null;
  };
  const persist = async stage => {
    const records = actor.getFlag("azeroth-rpg", FLAG);
    if (!Array.isArray(records) || !records.some(r => r.requestId === requestId)) throw new Error("Shield Slam receipt missing");
    receipt = { ...receipt, stage, result: { ...result } };
    await actor.setFlag("azeroth-rpg", FLAG, records.map(r => r.requestId === requestId ? receipt : r));
    if (JSON.stringify(actor.getFlag("azeroth-rpg", FLAG)?.find(r => r.requestId === requestId)) !== JSON.stringify(receipt)) throw new Error("Shield Slam receipt unconfirmed");
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const now = Date.now(), records = actor.getFlag("azeroth-rpg", FLAG) ?? [];
    if (typeof requestId !== "string" || !/^[A-Za-z0-9]{16}$/.test(requestId) || !Number.isSafeInteger(issuedAt)
      || issuedAt > now + 5000 || now >= issuedAt + 600000 || !Array.isArray(records)) return refuse("request");
    if (records.some(r => r.requestId === requestId && r.expiresAt > now)) return refuse("replay");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const candidates = [...scene.tokens.values()].filter(t => t.actor?.uuid && t.actor !== actor && t.actor.system.health?.value > 0
      && t._source?.level === level && Number.isFinite(feetApart(token, t)) && feetApart(token, t) >= 0 && feetApart(token, t) <= SPEC.feet);
    if (!candidates.length) return refuse("empty");
    const picked = await chooseOption({ name: SPEC.name, id: `${actor.id}-shield-slam` }, candidates.map(t => ({ key: t.id, name: t.name,
      description: "Action, once per encounter. A hit deals Damage Rating 4 and forces a DC 15 Body Test against Stunned." })), null,
    { prompt: "GM: Choose a creature within 5 feet with no solid cover. Confirm the attack in the following dialog." });
    if (!picked) return refuse("cancelled");
    target = candidates.find(t => t.id === picked.key); if (!target) return refuse("target");
    victim = target.actor; targetPosition = position(target);
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollNpcShieldSlam({ actor, shieldId: shield.id,
      readCurrent: () => validate() ? null : { source: token, target },
      pay: async () => {
        if (result.paid || receipt || validate()) return false;
        const currentTime = Date.now();
        if (currentTime >= issuedAt + 600000) return false;
        const current = actor.getFlag("azeroth-rpg", FLAG) ?? [];
        if (!Array.isArray(current) || current.some(r => r.requestId === requestId && r.expiresAt > currentTime)) return false;
        receipt = { requestId, expiresAt: issuedAt + 600000, stage: "claimed", targetUuid: victim.uuid, shieldId: shield.id };
        await actor.setFlag("azeroth-rpg", FLAG, [...current.filter(r => r.expiresAt > currentTime), receipt]);
        await persist("claimed");
        if (validate() || !await spendTurnBudget(actor, SPEC.action)) return false;
        result.paid = true; await persist("paid");
        if (validate()) return false;
        const rows = structuredClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows });
        result.consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
        await persist("consumed");
        return result.consumed && !validate();
      } });
    result.attackId = card?.id ?? null;
    if (receipt) await persist(result.attackId ? "rolled" : "unresolved");
    if (!result.attackId || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return refuse(result.paid ? "unresolved" : "cancelled");
    return { ok: true, ...result };
  } catch (error) {
    console.warn("azeroth-rpg | Shield Slam stopped; inspect saved attempt", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
