/** Ancient Dread: one GM-reviewed area, one payment, one Test per enemy. */
import { ANCIENT_DREAD } from "../rules/ancient-dread.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { ANCIENT_SPECIAL_FLAG, ancientSpecialAllowed } from "../rules/ancient-core-hound.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layAncientDread } from "./ancient-dread.mjs";

export const ANCIENT_DREAD_QUERY = "azeroth-rpg.ancientDread";
import { ancientSpecialBusy as busy } from "./ancient-special-lock.mjs";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const words = (key, values = {}) => ({
  Payment: "Spend one Action and the use until your next Short Rest.",
  Incomplete: "Ancient Dread stopped after payment. Review the recorded results before continuing.",
  Refused: "Ancient Dread cannot be used now. Choose this hound's Ancient Special and check its remaining use.",
  Unconfirmed: "The result could not be confirmed. Check the hound and affected creatures before trying again.",
  Resisted: "resisted", Applied: "attacks and casting slowed", Immune: "immune",
  Uncertain: "effect not confirmed", NotApplied: "no effect applied", NoTargets: "No targets resolved."
}[key] ?? (key === "Result" ? `${values.name}: ${values.outcome}.` : key));

export async function requestAncientDread(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await ancientDreadQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ANCIENT_DREAD_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(words(result?.paid ? "Incomplete" : "Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Ancient Dread request", error);
    ui.notifications?.warn(words("Unconfirmed"));
    return null;
  }
}

export async function ancientDreadQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const results = [], keys = [];
  const refuse = reason => ({ ok: false, reason, paid, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  keys.push(actor.uuid); busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  let selection = null;
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!ancientSpecialAllowed(actor.flags?.["azeroth-rpg"]?.[ANCIENT_SPECIAL_FLAG], actor.uuid, ANCIENT_DREAD.name)) return "special";
    if (clock() !== started) return "clock";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(source?.tokenId) !== sourceToken
      || sourceToken?.actor !== actor) return "source";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability")) return "source";
    const row = actor.system?.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== ANCIENT_DREAD.name || row.automation?.action !== ANCIENT_DREAD.action
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (selection && (!selection.valid() || selection.targets.some(t => realmRefusalFor(t.actor, "ability")))) return "changedArea";
    return null;
  };
  const report = () => results.map(row => words("Result", { name: row.name,
    outcome: words(row.resisted === true ? "Resisted" : row.immune ? "Immune" : row.applied ? "Applied"
      : row.attempted ? "Uncertain" : "NotApplied") })).join(" ");
  try {
    let reason = validate();
    if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken, chooseOption,
      name: ANCIENT_DREAD.name, radius: ANCIENT_DREAD.radius,
      payment: words("Payment") });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const target of selection.targets) { keys.push(target.actorUuid); busy.add(target.actorUuid); }
    reason = validate();
    if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, ANCIENT_DREAD.action)) return refuse("action");
    paid = true;
    reason = validate();
    if (reason) return refuse(reason);
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    consumed = true;
    for (const target of selection.targets) {
      reason = validate();
      if (reason) return refuse(reason);
      const victim = target.actor;
      const row = { actorUuid: victim.uuid, name: target.token.name, attempted: false, applied: false };
      results.push(row);
      const card = await rollResilience({ actor: victim, resilience: ANCIENT_DREAD.resilience,
        dc: ANCIENT_DREAD.dc, subtitle: ANCIENT_DREAD.name });
      const resisted = card?.rolls?.[0]?.outcome?.success;
      row.test = card?.id ?? null;
      if (typeof resisted !== "boolean") return refuse("unresolved");
      row.resisted = resisted;
      reason = validate();
      if (reason) return refuse(reason);
      if (!resisted) {
        row.attempted = true;
        const landed = await layAncientDread({ victim, by: actor, valid: () => validate() === null });
        row.effectId = landed?.effectId ?? null;
        row.immune = landed?.immune === true;
        row.applied = landed?.ok === true && !!landed.effectId;
        if (!landed?.ok) return refuse("condition");
        reason = validate();
        if (reason) return refuse(reason);
      }
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${ANCIENT_DREAD.name}</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:ancient-dread",
        casting: false, success: true, ancientDread: results,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, paid, results };
  } catch (error) {
    console.warn("azeroth-rpg | Ancient Dread", error);
    return refuse("write");
  } finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p>${words("Incomplete")}</p><p>${foundry.utils.escapeHTML(report() || words("NoTargets"))}</p>`,
          flags: { "azeroth-rpg": { kind: "ancientDreadReport", ancientDread: results, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Ancient Dread partial report", error); }
    }
  }
}
