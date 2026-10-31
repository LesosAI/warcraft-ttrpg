/** GM-authoritative Drain Mana: selected enemies, one Mana pool per target. */
import { OBSIDIAN_DESTROYER as SPEC, destroyerDrainPlan } from "../rules/obsidian-destroyer.mjs";
import { transferDestroyerMana } from "./obsidian-drain-transfer.mjs";
import { initializeDestroyerEncounter, destroyerOperations } from "./obsidian-encounter.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
export const DESTROYER_DRAIN_QUERY = "azeroth-rpg.destroyerDrain";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestDestroyerDrain(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await destroyerDrainQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DESTROYER_DRAIN_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Drain Mana stopped after spending the Action. Check the recorded transfers before continuing."
      : "Drain Mana was not used. Select up to three enemies within 30 feet with Mana pools.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Drain Mana request", error);
    ui.notifications?.warn("Drain Mana could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function destroyerDrainQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, finished = false, transfer = null;
  const results = [], locks = [];
  const refuse = reason => ({ ok: false, reason, paid, results, transfer });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.type !== "npc" || actor.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length < 1 || targets.length > SPEC.targets) return refuse("targets");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const rows = targets.map(ref => {
    const token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref.tokenId) : null;
    return { token, actor: token?.actor };
  });
  if (rows.some(row => !row.actor?.uuid || row.actor === actor) || new Set(rows.map(row => row.actor.uuid)).size !== rows.length) return refuse("targets");
  const keys = [actor.uuid, ...rows.map(row => row.actor.uuid)];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  const initialized = await initializeDestroyerEncounter(actor);
  if (!initialized.ok || destroyerOperations.has(actor.uuid)) return refuse("initializationOrBusy");
  destroyerOperations.add(actor.uuid);
  keys.forEach(key => { busy.add(key); locks.push(key); });
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock(), mana = actor.system?.power?.value;
  const validate = (afterTransfer = false) => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (started === null || clock() !== started) return "clock";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(origin?.id) !== origin || origin?.actor !== actor) return "source";
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== "Drain Mana" || row.automation?.kind !== "utility" || row.automation.action !== "action" || row.automation.dc !== SPEC.dc) return "ability";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return "sourceOrRealm";
    if ((actor.system.power?.name ?? "mana") !== "mana" || actor.system.power?.max !== SPEC.capacity
      || !Number.isInteger(mana) || mana < 0 || mana >= SPEC.capacity
      || (!afterTransfer && actor.system.power.value !== mana)) return "mana";
    for (const target of rows) {
      if (scene.tokens.get(target.token.id) !== target.token || target.token.actor !== target.actor
        || fromUuidSync(target.actor.uuid) !== target.actor || !(target.actor.system?.health?.value > 0)
        || realmRefusalFor(target.actor, "ability")) return "target";
      const distance = feetApart(origin, target.token);
      if (!Number.isFinite(distance) || distance < 0 || distance > SPEC.range) return "range";
    }
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    for (const target of rows) {
      const pools = target.actor.poolSnapshot().filter(p => p.kind === "power" && (p.name === "mana" || p.name == null));
      if (!pools.length) return refuse("pool");
      const options = [{ key: "cancel", name: "Cancel", description: "Keep the Action." }, ...pools.map((pool, n) => ({
        key: `pool-${n}`, name: target.actor.items?.get?.(pool.itemId)?.name ?? "Mana",
        description: `Enemy: drain from this pool (${pool.value} Mana). Spirit DC 20 reduces the drain from 4 to 2.` }))];
      const choice = await chooseOption({ id: `${actor.id}-drain`, name: "Drain Mana" }, options, null,
        { prompt: `GM: Confirm ${target.token.name} is an enemy and choose its Mana pool.` });
      const selected = options.findIndex(option => option.key === choice?.key) - 1;
      if (selected < 0) return refuse("cancelled");
      target.itemId = pools[selected].itemId;
      reason = validate(); if (reason) return refuse(reason);
    }
    const preflight = destroyerDrainPlan({ mana, maximum: actor.system.power.max, targets: rows.map(row => ({
      uuid: row.actor.uuid, itemId: row.itemId, hostile: true, distance: feetApart(origin, row.token),
      resisted: false, pools: row.actor.poolSnapshot() })) });
    if (!preflight.ok) return refuse(preflight.reason);
    if (!await spendTurnBudget(actor, "action")) return refuse("action");
    paid = true;
    for (const target of rows) {
      reason = validate(); if (reason) return refuse(reason);
      const card = await rollResilience({ actor: target.actor, resilience: "spirit", dc: SPEC.dc, subtitle: "Drain Mana" });
      target.resisted = card?.rolls?.[0]?.outcome?.success;
      results.push({ actorUuid: target.actor.uuid, test: card?.id ?? null, resisted: target.resisted });
      if (typeof target.resisted !== "boolean") return refuse("unresolved");
    }
    reason = validate(); if (reason) return refuse(reason);
    transfer = await transferDestroyerMana({ source: actor, cast: foundry.utils.randomID(), valid: () => validate() === null,
      targets: rows.map(row => ({ actor: row.actor, itemId: row.itemId, hostile: true,
        distance: feetApart(origin, row.token), resisted: row.resisted })) });
    if (!transfer.ok) return refuse(transfer.reason);
    reason = validate(true); if (reason) return refuse(reason);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Drain Mana</strong></p><p>${rows.map(row => `${foundry.utils.escapeHTML(row.token.name)}: ${transfer.losses.find(loss => loss.uuid === row.actor.uuid)?.drained ?? 0} Mana lost`).join("; ")}. Destroyer gained ${transfer.gained} Mana.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:destroyer-drain-mana",
        casting: false, success: transfer.gained > 0, destroyerDrain: transfer,
        targets: rows.filter(row => transfer.losses.some(loss => loss.uuid === row.actor.uuid && loss.drained > 0))
          .map(row => ({ sceneId: scene.id, tokenId: row.token.id, actorUuid: row.actor.uuid, name: row.token.name })) } } });
    finished = true;
    return { ok: true, paid, results, transfer };
  } catch (error) { console.warn("azeroth-rpg | Drain Mana", error); return refuse("writeUncertain"); }
  finally {
    locks.forEach(key => busy.delete(key));
    destroyerOperations.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Drain Mana stopped after spending the Action. Check the recorded resistance tests, target Mana losses and Destroyer Mana gain. Do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "destroyerDrainReport", results, transfer } } });
      } catch (error) { console.warn("azeroth-rpg | Drain Mana partial report", error); }
    }
  }
}
