/** A GM-held selection ticket joins the pre-payment menu to one cast card. */
import { curePoisonJudgement, cureBleedingPlan } from "../rules/cure-poison.mjs";
import { plainEffect, archmageCasters } from "./dispel.mjs";
import { resolveCurePoison } from "./cure-poison.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { castingDC } from "../rules/casting.mjs";
import { completeSpellLockGates } from "./spell-lock-gates.mjs";

export const CURE_QUERY = "azeroth-rpg.curePoison";
const tickets = new Map();
const words = key => game.i18n.localize(`AZEROTH.CurePoison.${key}`);
const tokenAt = ref => game.scenes?.get(ref?.sceneId)?.tokens.get(ref?.tokenId) ?? null;
const gmHere = () => game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const sameRef = (a, b) => a?.sceneId === b?.sceneId && a?.tokenId === b?.tokenId;
const fingerprint = target => JSON.stringify([...target.effects].map(plainEffect).sort((a, b) => a.id.localeCompare(b.id)));
const selectedFingerprint = (target, choice) => JSON.stringify([...target.effects].map(plainEffect)
  .filter(e => choice.kind === "effect" ? e.id === choice.effectId : e.statuses.includes("bleeding"))
  .sort((a, b) => a.id.localeCompare(b.id)));

async function request(data) {
  if (game.user?.isGM) return curePoisonQueryHandler(data, { user: game.user });
  if (!game.users?.activeGM) return { ok: false, reason: "noGM" };
  return game.users.activeGM.query(CURE_QUERY, data, { timeout: 180000 });
}

export async function prepareCurePoison({ actor, spell, source, targets = [] }) {
  return request({ phase: "prepare", actorUuid: actor.uuid, spellUuid: spell.uuid, source,
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) });
}

export async function finishCurePoison(ticket, messageId) {
  return request({ phase: "finish", ticket, messageId });
}

export async function curePoisonQueryHandler(data = {}, { user = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id) return refuse("gmRequired");
  for (const [id, held] of tickets) if (held.expires <= Date.now()) tickets.delete(id);
  if (data.phase === "finish") {
    const held = tickets.get(data.ticket);
    if (!held || held.userId !== user.id) return refuse("ticket");
    const card = game.messages?.get(data.messageId), flags = card?.flags?.["azeroth-rpg"];
    if (!card || card.author?.id !== user.id || flags?.kind !== "spell" || flags.cureTicket !== data.ticket
      || flags.caster !== held.actor.uuid || flags.spellUuid !== held.spell.uuid
      || flags.spellName !== "Cure Poison" || !sameRef(flags.source, held.source)
      || flags.targets?.length !== 1 || !sameRef(flags.targets[0], held.ref)) return refuse("card");
    // Consume before any asynchronous mutation. Failed casts also retire their
    // ticket; a missing response must never prompt a second cure.
    tickets.delete(data.ticket);
    if (flags.success !== true) return { ok: true, cured: false };
    if (!held.actor.testUserPermission(user, "OWNER") || tokenAt(held.source) !== held.sourceToken
      || tokenAt(held.ref) !== held.targetToken || held.sourceToken.actor !== held.actor
      || held.targetToken.actor !== held.target) return refuse("target");
    if (selectedFingerprint(held.target, held.choice) !== held.fingerprint) return refuse("changedEffect");
    const distance = feetApart(held.sourceToken, held.targetToken);
    if (!Number.isFinite(distance) || distance > 5) return refuse("range");
    const { gateCastingTest } = await import("../dice/workflows.mjs");
    const gateRolls = [];
    const result = await resolveCurePoison({ caster: held.actor, target: held.target, choice: held.choice,
      classification: held.classification, gateTest: async () => {
        const roll = await gateCastingTest(held.actor, { source: held.source,
          dc: castingDC({ tier: held.actor.system.tier ?? 1, targetDefense: held.target.system?.defense ?? null }) });
        if (roll) gateRolls.push(roll);
        return roll;
      } });
    await card.update({ "flags.azeroth-rpg.cureResult": result });
    await completeSpellLockGates({ actor: held.actor, rolls: gateRolls, message: card });
    return result;
  }
  if (data.phase !== "prepare") return refuse("phase");
  const actor = await fromUuid(data.actorUuid), spell = await fromUuid(data.spellUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (spell?.documentName !== "Item" || spell.type !== "spell" || spell.name !== "Cure Poison") return refuse("spell");
  if (!Array.isArray(data.targets) || data.targets.length !== 1) return refuse("target");
  const sourceToken = tokenAt(data.source), ref = data.targets[0], targetToken = tokenAt(ref);
  if (!sourceToken || sourceToken.actor !== actor || !targetToken?.actor || data.source.sceneId !== ref.sceneId) return refuse("target");
  const target = targetToken.actor;
  const distance = feetApart(sourceToken, targetToken);
  if (!Number.isFinite(distance) || distance > 5) return refuse("range");
  const before = fingerprint(target), effects = [...target.effects].map(plainEffect), archmage = archmageCasters(effects);
  const { chooseOption } = await import("../dice/workflows.mjs");
  const options = effects.filter(e => !e.disabled).map(effect => {
    const judged = curePoisonJudgement(effect, { archmage });
    return { key: `effect:${effect.id}`, name: effect.name, description: "", effect,
      available: judged.ok || judged.reason === "needsReview", tag: words(judged.ok ? "Eligible" : "Review") };
  });
  if (cureBleedingPlan(effects)?.removed) options.push({ key: "bleeding", name: words("Bleeding"), description: "", available: true });
  if (!options.some(o => o.available)) return refuse("noChoice");
  const pick = await chooseOption(spell, options, null, { prompt: words("Choose") });
  if (!pick?.available) return refuse("cancelled");
  let classification = null;
  const choice = { targetId: target.uuid, kind: pick.key === "bleeding" ? "bleeding" : "effect",
    ...(pick.effect ? { effectId: pick.effect.id } : {}) };
  if (pick.effect && !curePoisonJudgement(pick.effect, { archmage }).ok) {
    const review = await chooseOption(spell, ["cancel", "poison", "disease"].map(key => ({ key, name: words(key), description: "" })), null, { prompt: words("Classify") });
    if (!["poison", "disease"].includes(review?.key)) return refuse("cancelled");
    classification = { harmful: true, category: review.key };
  }
  if (fingerprint(target) !== before || tokenAt(data.source) !== sourceToken || tokenAt(ref) !== targetToken
    || sourceToken.actor !== actor || targetToken.actor !== target) return refuse("changedEffect");
  const finalDistance = feetApart(sourceToken, targetToken);
  if (!Number.isFinite(finalDistance) || finalDistance > 5) return refuse("range");
  const ticket = foundry.utils.randomID();
  tickets.set(ticket, { actor, spell, target, sourceToken, targetToken, source: data.source, ref,
    userId: user.id, choice, classification, fingerprint: selectedFingerprint(target, choice), expires: Date.now() + 600000 });
  return { ok: true, ticket };
}
