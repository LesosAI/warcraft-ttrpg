/** Self-only paid Jadefire, executed by the active GM. */
import { JADEFIRE as SPEC } from "../rules/jadefire.mjs";
const FLAG = "jadefire";
import { layJadefire } from "./jadefire.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
export const JADEFIRE_USE_QUERY = "azeroth-rpg.jadefire";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestJadefire(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await jadefireQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(JADEFIRE_USE_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Jadefire stopped after payment. Check Mana, the use, and the effect before resolving it manually."
      : "Jadefire requires a living creature, 2 Mana, a Half-Action and an available use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Jadefire request", error);
    ui.notifications?.warn("Jadefire could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function jadefireQueryHandler({ actorUuid, index, source = null } = {}, { user } = {}) {
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
      || row.automation?.cost?.pool !== "power" || Number(row.automation?.cost?.amount) !== SPEC.power
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max) || health.value <= 0
      || realmRefusalFor(actor, "ability")) return "healthOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.power
      || actor.system.power.value !== mana - (consumed ? SPEC.power : 0)) return "mana";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    if ([...actor.effects].some(e => e.flags?.["azeroth-rpg"]?.[FLAG])) return refuse("existing");
    const startedAt = game.time?.worldTime;
    if (!Number.isInteger(startedAt)) return refuse("clock");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows, "system.power.value": mana - SPEC.power });
    consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    result.attempted = true;
    const landed = await layJadefire({ actor, startedAt, valid: () => validate() === null });
    result.effectId = landed?.effectId ?? null;
    result.applied = landed?.ok === true && Boolean(landed.effectId);
    if (!result.applied) return refuse("effect");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Jadefire</strong></p><p>Gain 2 Armor Points at each existing location for 12 seconds. A creature that lands a melee hit against you takes 3 Fire damage.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:jadefire",
        casting: false, success: true, jadefire: result,
        targets: token ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid, name: actor.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Jadefire", error); return refuse("write"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Jadefire stopped after payment. Check Mana, the use and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "jadefireReport", jadefire: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Jadefire partial report", error); }
    }
  }
}
