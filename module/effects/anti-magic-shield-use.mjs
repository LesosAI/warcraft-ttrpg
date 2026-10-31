/** Self-only paid Anti-Magic Shield, executed by the active GM. */
import { ANTI_MAGIC_SHIELD as SPEC } from "../rules/banshee-roles.mjs";
import { antiMagicShieldEffect, ANTI_MAGIC_SHIELD_FLAG as FLAG } from "../rules/anti-magic-shield.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
export const ANTI_MAGIC_SHIELD_QUERY = "azeroth-rpg.antiMagicShield";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestAntiMagicShield(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await antiMagicShieldQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ANTI_MAGIC_SHIELD_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Anti-Magic Shield stopped after payment. Check Mana, the use, and the effect before resolving it manually."
      : "Anti-Magic Shield requires a living creature, 3 Mana, an Action and an available use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Anti-Magic Shield request", error);
    ui.notifications?.warn("Anti-Magic Shield could not be confirmed. Check the result before trying again.");
    return null;
  }
}

export async function antiMagicShieldQueryHandler({ actorUuid, index, source = null } = {}, { user } = {}) {
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
    if (row?.name !== SPEC.name || row.automation?.kind !== "utility" || row.automation?.action !== SPEC.action
      || row.automation?.cost?.pool !== "power" || Number(row.automation?.cost?.amount) !== SPEC.mana
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!Number.isFinite(health?.value) || !Number.isFinite(health?.max) || health.value <= 0
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")
      || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return "healthOrRealm";
    if ((actor.system?.power?.name ?? "mana") !== "mana" || !Number.isFinite(mana) || mana < SPEC.mana
      || actor.system.power.value !== mana - (consumed ? SPEC.mana : 0)) return "mana";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const startedAt = game.time?.worldTime;
    if (!Number.isInteger(startedAt)) return refuse("clock");
    if ([...actor.effects].some(e => e.flags?.["azeroth-rpg"]?.[FLAG]
      && !e.disabled && !e.isSuppressed && e.active !== false
      && !(e.duration?.units === "seconds" && Number.isFinite(e.start?.time)
        && Number.isFinite(e.duration.value) && e.start.time + e.duration.value <= startedAt))) return refuse("existing");
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
    const data = antiMagicShieldEffect({ sourceUuid: actor.uuid, cast: foundry.utils.randomID(), time: startedAt });
    if (!data) return refuse("clock");
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    result.effectId = effect?.id ?? null;
    result.applied = Boolean(effect?.id) && effect.flags?.["azeroth-rpg"]?.[FLAG]?.cast === data.flags["azeroth-rpg"][FLAG].cast;
    if (!result.applied) return refuse("effect");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Anti-Magic Shield</strong></p><p>For 12 seconds, gain Ward 8 against every school of magic. If your Ward against a school is already higher, use that value instead.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:anti-magic-shield",
        casting: false, success: true, antiMagicShield: result,
        targets: token ? [{ sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid, name: actor.name }] : [] } } });
    finished = true;
    return { ok: true, paid, result };
  } catch (error) { console.warn("azeroth-rpg | Anti-Magic Shield", error); return refuse("write"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Anti-Magic Shield stopped after payment. Check Mana, the use and any created effect; do not repeat completed writes.</p>",
        flags: { "azeroth-rpg": { kind: "antiMagicShieldReport", antiMagicShield: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Anti-Magic Shield partial report", error); }
    }
  }
}
