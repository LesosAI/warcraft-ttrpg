/** GM-owned single-target disease application with payment and range checks. */
import { MAGGOT_SLIME } from "../rules/maggot-slime.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layMaggotSlime } from "./maggot-slime.mjs";
export const MAGGOT_SLIME_QUERY = "azeroth-rpg.maggotSlime";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestMaggotSlime(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await maggotSlimeQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(MAGGOT_SLIME_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Maggot Slime stopped after payment. Check the result card before continuing."
      : "Maggot Slime needs one target within five feet and an available use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Maggot Slime request", error);
    ui.notifications?.warn("Maggot Slime could not be confirmed. Check the creature and target before trying again.");
    return null;
  }
}

export async function maggotSlimeQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const result = { attempted: false, applied: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const ability = actor.system?.creatureAbilities?.[index];
  const dc = ability?.automation?.dc;
  if (!Number.isInteger(index) || ability?.name !== MAGGOT_SLIME.name || ![15, 16].includes(dc)) return refuse("ability");
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  const token = targets[0]?.sceneId === scene?.id ? scene?.tokens.get(targets[0]?.tokenId) : null;
  const victim = token?.actor;
  if (!victim?.uuid || victim.uuid === actor.uuid || origin?.actor !== actor) return refuse("target");
  const keys = [actor.uuid, victim.uuid];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  keys.forEach(key => busy.add(key));
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (row?.name !== MAGGOT_SLIME.name || row.automation?.dc !== dc || row.automation?.action !== "half"
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system?.health?.value > 0) || !(victim.system?.health?.value > 0)
      || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")) return "sourceOrRealm";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    const distance = feetApart(origin, token);
    return !Number.isFinite(distance) || distance < 0 || distance > MAGGOT_SLIME.feet ? "range" : null;
  };
  const report = () => `${victim.name}: ${result.resisted === true ? "resisted" : result.immune ? "immune to disease"
    : result.applied ? "Maggot Slime applied; attack Damage Rating reduced by 2" : result.attempted ? "effect not confirmed" : "no effect applied"}.`;
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, "half")) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: "body", dc, subtitle: MAGGOT_SLIME.name });
    result.test = card?.id ?? null;
    result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.attempted = true;
      const landed = await layMaggotSlime({ victim, by: actor, valid: () => validate() === null });
      result.immune = landed?.immune === true;
      result.effectId = landed?.effectId ?? null;
      result.applied = landed?.ok === true && !!landed.effectId;
      if (!landed?.ok) return refuse("condition");
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Maggot Slime</strong></p><p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:maggot-slime",
        casting: false, success: true, maggotSlime: result,
        targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) {
    console.warn("azeroth-rpg | Maggot Slime", error); return refuse("write");
  } finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>Maggot Slime stopped after payment. ${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "maggotSlimeReport", maggotSlime: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Maggot Slime partial report", error); }
    }
  }
}
