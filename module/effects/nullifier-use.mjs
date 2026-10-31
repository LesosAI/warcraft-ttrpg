/** Mass Nullify's GM-reviewed selection and payment workflow. */
import { nullifyJudgement, nullifySelection, NULLIFY_CATEGORIES } from "../rules/nullifier.mjs";
import { plainEffect, archmageCasters } from "./dispel.mjs";
import { endNullifiedEffect } from "./nullifier.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { castingDC } from "../rules/casting.mjs";
import { completeSpellLockGates } from "./spell-lock-gates.mjs";

export const NULLIFY_QUERY = "azeroth-rpg.massNullify";
const busy = new Set();
const reasonWords = reason => ({
  noUses: "Mass Nullify has no uses left until a Short Rest.", pending: "Mass Nullify is already being resolved.",
  range: "A selected creature is no longer within 10 feet.", empty: "No harmful effects were selected.",
  source: "Place the nullifier on the scene before using this ability.", target: "A selected creature is no longer on the scene.",
  changedEffect: "An effect changed during review. Select it again.", action: "The nullifier cannot spend a Half-Action now.",
  gateFailed: "The curse resisted removal.", missingEffect: "The selected effect is no longer present.",
  realm: "A spirit cannot use this ability.", notRemoved: "The effect could not be removed."
}[reason] ?? "The selected effect could not be removed.");
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function requestMassNullify(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const source = sourceOf(actor);
  const data = { actorUuid: actor.uuid, index, source,
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  let result;
  if (game.user.isGM) result = await massNullifyQueryHandler(data, { user: game.user });
  else {
    const gm = game.users?.activeGM;
    if (!gm) { ui.notifications.warn("Mass Nullify needs an active GM to review effects."); return null; }
    result = await gm.query(NULLIFY_QUERY, data, { timeout: 180000 });
  }
  if (result?.ok === false && result.reason !== "cancelled") ui.notifications.warn(reasonWords(result.reason));
  return result;
}

export async function massNullifyQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user = null } = {}) {
  if (game.user?.isGM !== true) throw new Error("Mass Nullify must be resolved by the GM.");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this creature.");
  const rowAt = () => actor.system?.creatureAbilities?.[index];
  const row = rowAt();
  if (!Number.isInteger(index) || row?.name !== "Mass Nullify" || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short") throw new Error("This creature does not have Mass Nullify.");
  if (realmRefusalFor(actor, "ability")) return { ok: false, reason: "realm" };
  if (busy.has(actor.uuid)) return { ok: false, reason: "pending" };
  busy.add(actor.uuid);
  try {
    if ((row.automation.uses.value ?? 1) <= 0) return { ok: false, reason: "noUses" };
    const scene = game.scenes.get(source?.sceneId);
    const sourceToken = scene?.tokens.get(source?.tokenId);
    if (!sourceToken || sourceToken.actor?.uuid !== actor.uuid) return { ok: false, reason: "source" };
    const tokens = [];
    for (const ref of targets) {
      const token = ref.sceneId === scene.id ? scene.tokens.get(ref.tokenId) : null;
      if (!token?.actor) return { ok: false, reason: "target" };
      if (!tokens.some(t => t.actor.uuid === token.actor.uuid)) tokens.push(token);
    }
    if (!tokens.length) return { ok: false, reason: "empty" };
    const { chooseOption, spendTurnBudget, gateCastingTest } = await import("../dice/workflows.mjs");
    const menu = { id: `${actor.id}-nullify`, name: "Mass Nullify" };
    const choices = [], classifications = new Map(), reviewed = new Map();
    for (const token of tokens) {
      const distance = feetApart(sourceToken, token);
      if (!Number.isFinite(distance) || distance > 10) return { ok: false, reason: "range" };
      const confirm = await chooseOption(menu, [
        { key: "skip", name: "Skip this creature", description: "" },
        { key: "ally", name: "Confirm willing ally", description: "Include this creature in Mass Nullify." }
      ], null, { prompt: `GM: Is ${token.name} a willing ally of ${actor.name}?` });
      if (!confirm) return { ok: false, reason: "cancelled" };
      if (confirm.key !== "ally") continue;
      const effects = [...token.actor.effects].map(plainEffect);
      const archmage = archmageCasters(effects);
      const options = effects.filter(e => !e.disabled).map(effect => {
        const judgement = nullifyJudgement(effect, { archmage });
        return { key: effect.id, name: effect.name, description: "",
          available: judgement.ok || judgement.reason === "needsReview",
          tag: judgement.ok ? judgement.category : judgement.reason === "needsReview" ? "Needs GM review" : "Protected", effect };
      });
      if (!options.some(o => o.available)) continue;
      const pick = await chooseOption(menu, options, null, { prompt: `Choose one harmful effect to end on ${token.name}.` });
      if (!pick || !pick.available) return { ok: false, reason: "cancelled" };
      let classification = null;
      if (!nullifyJudgement(pick.effect, { archmage }).ok) {
        const kind = await chooseOption(menu, [
          { key: "keep", name: "Keep this effect", description: "Beneficial, unrelated, or uncertain." },
          ...NULLIFY_CATEGORIES.map(key => ({ key, name: `Harmful ${key}`, description: "GM confirms this classification." }))
        ], null, { prompt: `Classify ${pick.name} before removing it.` });
        if (!kind || kind.key === "keep") return { ok: false, reason: "cancelled" };
        classification = { harmful: true, category: kind.key };
      }
      choices.push({ targetId: token.actor.uuid, effectId: pick.key });
      classifications.set(token.actor.uuid, { [pick.key]: classification });
      reviewed.set(token.actor.uuid, JSON.stringify(pick.effect));
    }
    if (scene.tokens.get(source.tokenId) !== sourceToken || sourceToken.actor?.uuid !== actor.uuid) return { ok: false, reason: "source" };
    if (tokens.some(token => ![...scene.tokens.values()].includes(token))) return { ok: false, reason: "target" };
    if (realmRefusalFor(actor, "ability")) return { ok: false, reason: "realm" };
    const snapshots = tokens.map(token => ({ id: token.actor.uuid, allied: true, willing: true,
      distance: feetApart(sourceToken, token), effects: [...token.actor.effects].map(plainEffect),
      classifications: classifications.get(token.actor.uuid) ?? {} }));
    const checked = nullifySelection(snapshots, choices, { archmage: archmageCasters(snapshots.flatMap(t => t.effects)) });
    if (!checked.ok) return checked;
    for (const choice of choices) {
      const snapshot = snapshots.find(t => t.id === choice.targetId)?.effects.find(e => e.id === choice.effectId);
      if (JSON.stringify(snapshot) !== reviewed.get(choice.targetId)) return { ok: false, reason: "changedEffect" };
    }
    const current = rowAt();
    if (current?.name !== row.name || (current.automation?.uses?.value ?? 1) <= 0) return { ok: false, reason: "noUses" };
    if (!(await spendTurnBudget(actor, "half"))) return { ok: false, reason: "action" };
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": abilities });
    const results = [], rolls = [];
    for (const choice of choices) {
      const target = tokens.find(t => t.actor.uuid === choice.targetId).actor;
      const distance = feetApart(sourceToken, tokens.find(t => t.actor.uuid === choice.targetId));
      if (!Number.isFinite(distance) || distance > 10) { results.push({ target: target.name, ok: false, reason: "range" }); continue; }
      const result = await endNullifiedEffect({ dispeller: actor, target, effectId: choice.effectId,
        classification: classifications.get(choice.targetId)?.[choice.effectId] ?? null,
        gateTest: async () => {
          const roll = await gateCastingTest(actor, { source, dc: castingDC({ tier: actor.system.tier ?? 1, targetDefense: target.system?.defense ?? null }) });
          if (roll) rolls.push(roll);
          return roll;
        } });
      results.push({ target: target.name, ...result });
      if (result.reason === "gateUnconfirmed") return { ok: false, reason: "gateUnconfirmed", results };
    }
    const message = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:mass-nullify",
        casting: false, success: true } },
      content: `<p><strong>Mass Nullify</strong></p>${results.map(r => `<p>${escape(r.target)}: ${escape(r.ok ? `Removed ${r.ended.map(e => e.name).join(", ")}.` : reasonWords(r.reason))}${r.consequenceError ? ` — ${escape(r.consequenceError)}` : ""}</p>`).join("")}` });
    await completeSpellLockGates({ actor, rolls, message });
    return { ok: true, results };
  } finally { busy.delete(actor.uuid); }
}
