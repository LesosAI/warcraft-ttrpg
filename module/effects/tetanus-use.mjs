import { TETANUS as SPEC } from "../rules/tetanus.mjs";
import { TETANUS_REQUESTS, tetanusRequestClaim } from "../rules/tetanus.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { layTetanus } from "./tetanus.mjs";

export const TETANUS_QUERY = "azeroth-rpg.tetanus";
const busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestTetanus(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = writer() ? await tetanusQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(TETANUS_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Tetanus was not completed. Check its report before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Tetanus request", error);
    ui.notifications?.warn("Tetanus could not be confirmed. Check the golem's Action and the target's effects before trying again.");
    return null;
  }
}

/** The GM chooses one concrete scene token and confirms the cost before payment.
 * Checks are repeated after each awaited choice, payment and resistance roll.
 */
export async function tetanusQueryHandler({ actorUuid, index, source, requestId, issuedAt } = {}, { user } = {}) {
  let paid = false, finished = false, target = null;
  const result = {};
  const refuse = reason => ({ ok: false, reason, paid, result });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const positionOf = t => JSON.stringify([t.x, t.y, t.elevation, t._source?.level]);
  const level = token?._source?.level, originPosition = token ? positionOf(token) : null;
  let targetPosition = null;
  const started = clock();
  const dc = actor.system.creatureAbilities?.[index]?.automation?.dc;
  const validate = () => {
    if (!writer() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return "source";
    if (!scene.levels?.get(level) || token._source?.level !== level || positionOf(token) !== originPosition) return "position";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== SPEC.name || row.automation?.kind !== "utility"
      || row.automation.action !== SPEC.action || row.automation.dc !== dc || dc !== SPEC.dc) return "ability";
    if (!(actor.system.health?.value > 0) || actor.statuses?.has("stunned")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (target) {
      if (scene.tokens.get(target.id) !== target || target.actor !== result.victim || !(target.actor.system.health?.value > 0)) return "target";
      if (target._source?.level !== level || positionOf(target) !== targetPosition) return "position";
      const distance = feetApart(token, target);
      if (!Number.isFinite(distance) || distance < 0 || distance > SPEC.feet) return "range";
      if (projectionPhaseFor(target.actor) || realmRefusalFor(target.actor, "ability")) return "protected";
    }
    return null;
  };
  const claim = () => tetanusRequestClaim({ requestId, issuedAt, now: Date.now(),
    receipts: actor.getFlag("azeroth-rpg", TETANUS_REQUESTS) ?? [] });
  try {
    const initialClaim = claim(); if (!initialClaim.ok) return refuse(initialClaim.reason);
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const candidates = [...scene.tokens.values()].filter(other => {
      if (other._source?.level !== level || !other.actor?.uuid || other.actor === actor || !(other.actor.system.health?.value > 0)) return false;
      const distance = feetApart(token, other);
      return Number.isFinite(distance) && distance >= 0 && distance <= SPEC.feet;
    });
    if (!candidates.length) return refuse("empty");
    const menu = { id: `${actor.id}-tetanus`, name: SPEC.name };
    const picked = await chooseOption(menu, candidates.map(other => ({ key: other.id, name: other.name,
      description: `Body Resilience DC ${dc}, or carries Lockjaw: Constitution reduced by 2 until the disease is cured.` })), null, { prompt: "Choose a creature within 5 feet." });
    if (!picked) return refuse("cancelled");
    target = candidates.find(other => other.id === picked.key);
    if (!target) return refuse("target");
    result.victim = target.actor; targetPosition = positionOf(target);
    reason = validate(); if (reason) return refuse(reason);
    const confirm = await chooseOption(menu, [{ key: "cancel", name: "Cancel", description: "Keep your Action." },
      { key: "expose", name: `Expose ${target.name}`, description: "Spend an Action." }], null, { prompt: "GM: Confirm the target is visible and has no solid cover, then use Tetanus." });
    if (confirm?.key !== "expose") return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    const receipt = claim(); if (!receipt.ok) return refuse(receipt.reason);
    // Durable before payment: a delayed duplicate must not pay or roll again,
    // including after a reload or a response lost after the write succeeded.
    await actor.setFlag("azeroth-rpg", TETANUS_REQUESTS, receipt.receipts);
    if (!actor.getFlag("azeroth-rpg", TETANUS_REQUESTS)?.some(row => row.requestId === requestId))
      return refuse("receiptUncertain");
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    reason = validate(); if (reason) return refuse(reason);
    const card = await rollResilience({ actor: target.actor, resilience: SPEC.resilience, dc, subtitle: SPEC.name });
    result.test = card?.id ?? null; result.resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof result.resisted !== "boolean") return refuse("unresolved");
    reason = validate(); if (reason) return refuse(reason);
    if (!result.resisted) {
      result.effect = await layTetanus({ victim: target.actor, by: actor, valid: () => validate() === null });
      if (!result.effect.ok) return refuse(result.effect.reason);
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
      content: `<p><strong>Tetanus</strong></p><p>${foundry.utils.escapeHTML(target.name)} ${result.resisted ? "resisted the disease." : result.effect?.immune ? "is immune to disease." : result.effect?.already ? "already carries Lockjaw; nothing changes." : "carries Lockjaw: Constitution reduced by 2 (minimum 3) until the disease is cured, and maximum Health falls with it."}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:tetanus",
        casting: false, success: true, tetanus: { test: result.test, resisted: result.resisted, effect: result.effect ?? null },
        targets: [{ sceneId: scene.id, tokenId: target.id, actorUuid: target.actor.uuid, name: target.name }] } } });
    finished = true;
    return { ok: true, paid, result: { test: result.test, resisted: result.resisted, effect: result.effect ?? null } };
  } catch (error) { console.warn("azeroth-rpg | Tetanus", error); return refuse("writeUncertain"); }
  finally {
    delete result.victim;
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
        content: "<p>Tetanus stopped after payment. Check the Action, resistance Test, disease effect and current Health before resolving it manually. Do not repeat completed steps.</p>",
        flags: { "azeroth-rpg": { kind: "tetanusReport", tetanus: { ...result } } } });
      } catch (error) { console.warn("azeroth-rpg | Tetanus report", error); }
    }
  }
}
