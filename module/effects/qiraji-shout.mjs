/** One reviewed enemy area; primary stun and nearby fear resolve separately. */
import { QIRAJI_SHOUT as SPEC } from "../rules/qiraji-champion.mjs";
import { championBusy as busy } from "./qiraji-champion-use.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
export const CHAMPION_SHOUT_QUERY = "azeroth-rpg.qirajiShout";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestChampionShout(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await championShoutQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CHAMPION_SHOUT_QUERY, data, { timeout: 300000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Frightening Shout stopped after payment. Check its remaining use and the recorded resistance results and effects."
      : "Frightening Shout was not used. Select one enemy within 10 feet and check the Action and remaining use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Frightening Shout request", error);
    ui.notifications?.warn("Frightening Shout could not be confirmed. Check its result before trying again.");
    return null;
  }
}

export async function championShoutQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null;
  const results = [], keys = [];
  const refuse = reason => ({ ok: false, reason, paid, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("primary");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const primary = targets[0]?.sceneId === scene?.id ? scene?.tokens.get(targets[0]?.tokenId) : null;
  const victim = primary?.actor;
  if (origin?.actor !== actor || !victim?.uuid || victim.uuid === actor.uuid) return refuse("primary");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid); keys.push(actor.uuid);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor) return "owner";
    if (started === null || clock() !== started) return "clock";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor) return "source";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return "source";
    const row = actor.system?.creatureAbilities?.[index], auto = row?.automation;
    if (row?.name !== SPEC.name || auto?.kind !== "utility" || auto.action !== SPEC.action || auto.dc !== SPEC.dc
      || auto.uses?.max !== 1 || auto.uses.per !== "short" || auto.uses.value !== (consumed ? 0 : 1)) return "ability";
    if (scene.tokens.get(primary.id) !== primary || primary.actor !== victim || fromUuidSync(victim.uuid) !== victim
      || !(victim.system?.health?.value > 0)) return "primary";
    const feet = feetApart(origin, primary);
    if (!Number.isFinite(feet) || feet < 0 || feet > SPEC.feet) return "range";
    if (selection && (!selection.valid() || !selection.targets.some(t => t.token === primary && t.actor === victim)
      || selection.targets.some(t => fromUuidSync(t.actorUuid) !== t.actor || realmRefusalFor(t.actor, "ability")))) return "changedArea";
    return null;
  };
  const report = () => results.map(row => `${row.name}: ${row.immune ? `immune to ${row.condition}`
    : row.applied ? `${row.condition} until the end of its next turn` : row.resisted ? "resisted"
    : row.skipped ? "already at 0 Health" : "not resolved"}.`).join(" ");
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, chooseOption, name: SPEC.name, radius: SPEC.radius,
      payment: `Spend one Action and one Short Rest use. ${primary.name} is the primary target: Spirit DC 20 or Stunned. Other enemies resist Frightened.` });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { busy.add(target.actorUuid); keys.push(target.actorUuid); }
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    for (const target of selection.targets) {
      reason = validate(); if (reason) return refuse(reason);
      const who = target.actor, condition = who === victim ? SPEC.main : SPEC.others;
      const row = { actorUuid: who.uuid, name: target.token.name, condition, applied: false }; results.push(row);
      if (!(who.system?.health?.value > 0)) { row.skipped = true; continue; }
      const card = await rollResilience({ actor: who, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      row.test = card?.id ?? null; row.resisted = card?.rolls?.[0]?.outcome?.success;
      if (typeof row.resisted !== "boolean") return refuse("unresolved");
      reason = validate(); if (reason) return refuse(reason);
      if (!(who.system?.health?.value > 0)) return refuse("targetChanged");
      if (!row.resisted) {
        row.attempted = true;
        const landed = await inflictCondition({ victim: who, by: actor, id: condition, name: target.token.name,
          until: untilEndOfNextTurnOrRound(who) });
        row.immune = landed?.reason === "immune"; row.applied = landed?.landed === true;
        if (!row.applied && !row.immune) return refuse("effectUncertain");
      }
      reason = validate(); if (reason) return refuse(reason);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Frightening Shout</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:frightening-shout",
        casting: false, success: true, championShout: results,
        targets: selection.targets.filter(t => results.some(row => row.actorUuid === t.actorUuid && row.applied))
          .map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true; return { ok: true, paid, results };
  } catch (error) { console.warn("azeroth-rpg | Frightening Shout", error); return refuse("writeUncertain"); }
  finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>Frightening Shout stopped after payment. Do not repeat completed tests or effects.</p><p>${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "championShoutReport", championShout: results, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Frightening Shout partial report", error); }
    }
  }
}
