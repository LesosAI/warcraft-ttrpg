/** GM-owned payment, resistance and initial damage for the worm's poisons. */
import { DREDGE_POISONS, DREDGE_POISON_FLAG, validDredgePoison } from "../rules/dredge-poison.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { layDredgePoison } from "./dredge-poison.mjs";

export const DREDGE_POISON_QUERY = "azeroth-rpg.dredgePoison";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const words = (key, values = {}) => game.i18n.format(`AZEROTH.DredgePoison.${key}`, values);
const featureKeys = { venom: "ability:venom-spit", poison: "ability:dredge-poison" };

export async function requestDredgePoison(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await dredgePoisonQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DREDGE_POISON_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(words(result?.paid ? "Incomplete" : "Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Dredge poison request", error);
    ui.notifications?.warn(words("Unconfirmed")); return null;
  }
}

export async function dredgePoisonQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  const result = { damageAttempted: false, damageApplied: false, poisonAttempted: false, poisonApplied: false };
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const row = actor.system?.creatureAbilities?.[index];
  // Maggot Goo shares the dose lifecycle, but only its death trigger may start it.
  const kind = ["venom", "poison"].find(key => DREDGE_POISONS[key].name === row?.name);
  if (!Number.isInteger(index) || !kind) return refuse("ability");
  const spec = DREDGE_POISONS[kind];
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
    const current = actor.system?.creatureAbilities?.[index];
    if (current?.name !== spec.name || current.automation?.action !== spec.action
      || current.automation?.uses?.max !== 1 || current.automation?.uses?.per !== "short"
      || current.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || realmRefusalFor(victim, "ability")) return "sourceOrRealm";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    const distance = feetApart(origin, token);
    if (!Number.isFinite(distance) || distance < 0 || distance > spec.feet) return "range";
    return null;
  };
  const report = () => words("Result", { name: victim.name, ability: spec.name,
    damage: result.damageApplied ? words("DamageApplied", { amount: result.damage })
      : result.damageAttempted ? words("DamageUncertain") : words("NoDamage"),
    poison: words(result.resisted === true ? "Resisted" : result.poisonImmune ? "Immune" : result.existing ? "Existing"
      : result.poisonApplied ? "Applied" : result.poisonAttempted ? "PoisonUncertain" : "NotApplied") });
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, spec.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows }); consumed = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: spec.resilience, dc: spec.dc, subtitle: spec.name });
    const resisted = card?.rolls?.[0]?.outcome?.success;
    result.test = card?.id ?? null;
    if (typeof resisted !== "boolean") return refuse("unresolved");
    result.resisted = resisted;
    reason = validate(); if (reason) return refuse(reason);
    if (spec.immediate > 0) {
      const s = victim.system ?? {};
      const damage = resolveDamage({ rating: spec.immediate, sl: 0, kind: "magical", school: "nature",
        ward: wardBySchool(s.ward).nature ?? 0, schoolArmor: schoolArmorBySchool(s.schoolArmor).nature ?? 0,
        immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false,
        dealtHalved: dealtHalvedBy(actor), passedHalf: resisted });
      result.damage = damage.damage; result.damageImmune = damage.immune;
      if (!damage.immune && damage.damage > 0) {
        result.damageAttempted = true;
        await victim.applyDamage(damage.damage, { struck: true, attack: true, location: "body", type: "nature",
          by: actor, spell: false, wardTook: damage.wardTook ?? 0, messageId: card?.id ?? null, parts: damage.parts ?? null });
        result.damageApplied = true;
      }
      reason = validate(); if (reason) return refuse(reason);
    }
    if (!resisted) {
      result.existing = [...(victim.effects ?? [])].some(effect => {
        const held = effect.flags?.["azeroth-rpg"]?.[DREDGE_POISON_FLAG];
        return validDredgePoison(held) && held.kind === kind && held.targetUuid === victim.uuid;
      });
      if (!result.existing) {
        result.poisonAttempted = true;
        const landed = await layDredgePoison({ source: actor, target: victim, kind, valid: () => validate() === null });
        result.effectId = landed?.effectId ?? null;
        result.poisonImmune = landed?.immune === true;
        result.poisonApplied = landed?.ok === true && !!landed.effectId;
        if (!landed?.ok) return refuse("poison");
        reason = validate(); if (reason) return refuse(reason);
      }
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${foundry.utils.escapeHTML(report())}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: featureKeys[kind],
        casting: false, success: true, dredgePoison: result,
        targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] } } });
    finished = true; return { ok: true, paid, result };
  } catch (error) {
    console.warn("azeroth-rpg | Dredge poison", error); return refuse("write");
  } finally {
    keys.forEach(key => busy.delete(key));
    if (paid && !finished) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p>${words("Incomplete")}</p><p>${foundry.utils.escapeHTML(report())}</p>`,
          flags: { "azeroth-rpg": { kind: "dredgePoisonReport", dredgePoison: result, useConsumed: consumed } } });
      } catch (error) { console.warn("azeroth-rpg | Dredge poison partial report", error); }
    }
  }
}
