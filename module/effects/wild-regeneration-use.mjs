/** Self-only paid Wild Regeneration, executed by the active GM. */
import { WILD_REGENERATION as SPEC, WILD_REGENERATION_FLAG as FLAG,
  seedWildRegeneration } from "../rules/wild-regeneration.mjs";
import { layWildRegeneration } from "./wild-regeneration.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
export const WILD_REGENERATION_QUERY = "azeroth-rpg.wildRegeneration";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestWildRegeneration(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await wildRegenerationQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WILD_REGENERATION_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Wild Regeneration stopped after payment. Check Mana, the use, and the effect before resolving it manually."
      : "Wild Regeneration requires a living creature at or below half Health, 3 Mana, an Action and an available use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Wild Regeneration request", error);
    ui.notifications?.warn("Wild Regeneration could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function wildRegenerationQueryHandler({ actorUuid, index, source = null } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const result = { attempted: false, applied: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const fight = () => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
  const clock = () => { const combat = fight(); return combat
    ? { combatUuid: combat.uuid, clock: { round: combat.round, turn: combat.turn } } : { time: game.time?.worldTime }; };
  const started = JSON.stringify(clock());
  const mana = actor.system?.power?.value;
  const scene = source ? game.scenes?.get(source.sceneId) : null;
  const token = scene?.tokens.get(source?.tokenId);
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor) return "owner";
    if (JSON.stringify(clock()) !== started) return "clock";
    if (source && (game.scenes.get(scene?.id) !== scene || scene?.tokens.get(token?.id) !== token || token?.actor !== actor)) return "source";
    const row = actor.system?.creatureAbilities?.[index], health = actor.system?.health;
    if (row?.name !== SPEC.name || row.automation?.action !== SPEC.action
      || row.automation?.cost?.pool !== "power" || Number(row.automation?.cost?.amount) !== SPEC.mana
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max) || health.value <= 0
      || health.value > health.max / 2 || realmRefusalFor(actor, "ability")) return "healthOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.mana
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    if ([...actor.effects].some(e => e.flags?.["azeroth-rpg"]?.[FLAG])) return refuse("existing");
    const state = seedWildRegeneration({ actorUuid: actor.uuid, health: actor.system.health, mana, ...clock() });
    if (!state) return refuse("clock");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows, "system.power.value": mana - SPEC.mana });
    consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    result.attempted = true;
    const landed = await layWildRegeneration({ actor, state, valid: () => validate() === null });
    result.effectId = landed?.effectId ?? null;
    result.applied = landed?.ok === true && Boolean(landed.effectId);
    if (!result.applied) return refuse("effect");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Wild Regeneration</strong></p><p>Restore 4 Health at each of your next three turn starts, or every six seconds outside combat. No Health is restored immediately. This effect ends if you reach zero Health.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:wild-regeneration",
        casting: false, success: true, wildRegeneration: result,
        targets: token ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid, name: actor.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Wild Regeneration", error); return refuse("write"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Wild Regeneration stopped after payment. Check Mana, the use and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "wildRegenerationReport", wildRegeneration: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Wild Regeneration partial report", error); }
    }
  }
}
