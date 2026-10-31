import { fireguardAbility, fireguardOutcome } from "../rules/fireguard.mjs";
import { fireguardReport } from "../rules/fireguard-report.mjs";
import { fireguardTarget } from "./fireguard-target.mjs";
import { layFireguardBurn } from "./fireguard-burn.mjs";
import { areaDamageOn } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const FIREGUARD_QUERY = "azeroth-rpg.fireguardCast";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = message => message?.flags?.["azeroth-rpg"]?.fireguardCast;
const warning = () => ui.notifications?.warn(game.i18n.localize("AZEROTH.Fireguard.CastInterrupted"));

export async function requestFireguardCast(actor, index, key) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const targets = [...(game.user.targets ?? [])].map(token => ({
    sceneId: token.document?.parent?.id, tokenId: token.id, actorUuid: token.actor?.uuid
  }));
  const data = { actorUuid: actor.uuid, index, key, source: sourceOf(actor), targets,
    requestId: foundry.utils.randomID() };
  try {
    const result = gmHere() ? await fireguardCastQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(FIREGUARD_QUERY, data, { timeout: 180000 });
    if (!result?.ok) warning();
    return result;
  } catch (error) { console.warn("azeroth-rpg | Fireguard request", error); warning(); return null; }
}

/** A permanent chat receipt precedes payment. Re-delivery of the same request
 * never repeats payment, initial damage, or a removed burn. Uncertain writes
 * stop; the receipt records which operations were attempted for GM review.
 */
export async function fireguardCastQueryHandler({ actorUuid, index, key, source, targets, requestId } = {}, { user } = {}) {
  const spec = fireguardAbility(key), locks = [];
  let receipt = null, paid = false, finished = false;
  const result = { ok: false, paid: false, manaPaid: false, damageAttempted: false, damageApplied: false, burnAttempted: false };
  const refuse = reason => ({ ...result, reason, receiptId: receipt?.id ?? null });
  if (!spec || !gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const selection = fireguardTarget(actor, key, source, targets);
  if (!selection) return refuse("target");
  for (const uuid of [actor.uuid, selection.actor.uuid]) {
    if (busy.has(uuid)) { locks.forEach(id => busy.delete(id)); return refuse("busy"); }
    busy.add(uuid); locks.push(uuid);
  }
  const time = game.time.worldTime;
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started ? [fight.uuid, fight.round, fight.turn].join(":") : null; };
  const started = clock();
  const position = token => [token.x, token.y, token.elevation].join(":");
  const originPosition = position(selection.origin), targetPosition = position(selection.token);
  const pool = () => (actor.poolSnapshot?.() ?? []).find(p => p.kind === "power");
  const valid = () => {
    const current = fireguardTarget(actor, key, source, targets), row = actor.system?.creatureAbilities?.[index], stamp = row?.automation;
    return gmHere() && fromUuidSync(actor.uuid) === actor && fromUuidSync(selection.actor.uuid) === selection.actor
      && actor.testUserPermission(user, "OWNER") && Number.isFinite(time) && game.time.worldTime === time && clock() === started
      && current?.scene === selection.scene && current.origin === selection.origin && current.token === selection.token && current.actor === selection.actor
      && position(selection.origin) === originPosition && position(selection.token) === targetPosition
      && actor.system.health?.value > 0 && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
      && Number.isInteger(index) && row?.name === spec.name && stamp?.kind === "utility"
      && stamp.action === spec.action && stamp.cost?.pool === "power" && stamp.cost.amount === spec.mana;
  };
  const save = async patch => {
    Object.assign(result, patch);
    const data = { requestId, actorUuid, userId: user.id, key, targetUuid: selection.actor.uuid, ...result };
    const escape = foundry.utils.escapeHTML;
    const rows = fireguardReport(result).map(row => {
      const label = game.i18n.localize(`AZEROTH.Fireguard.Report.${row.label}`);
      const value = row.translate ? game.i18n.localize(`AZEROTH.Fireguard.Report.${row.value}`) : row.value;
      return `<li>${escape(label)}: ${escape(value)}</li>`;
    }).join("");
    await receipt.update({ "flags.azeroth-rpg.fireguardCast": data,
      content: `<p><strong>${escape(spec.name)}</strong> — ${escape(selection.token.name ?? selection.actor.name ?? "")}</p><ul>${rows}</ul>` });
    if (JSON.stringify(flag(receipt)) !== JSON.stringify(data)) throw new Error("Unconfirmed Fireguard receipt");
  };
  try {
    const previous = [...game.messages].find(message => flag(message)?.requestId === requestId && flag(message)?.userId === user.id);
    if (previous) return { ok: false, reason: "duplicate", receiptId: previous.id };
    if (!valid() || !pool() || pool().value < spec.mana) return refuse("unavailable");
    receipt = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${game.i18n.localize("AZEROTH.Fireguard.CastReceipt")}</p>`,
      flags: { "azeroth-rpg": { kind: "fireguardReceipt", fireguardCast: {
        requestId, actorUuid, userId: user.id, key, targetUuid: selection.actor.uuid, ...result
      } } } });
    if (!receipt || flag(receipt)?.requestId !== requestId || !valid()) return refuse("receipt");
    const { spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    await save({ paymentAttempted: true });
    if (!valid()) return refuse("changed");
    paid = null;
    if (!await spendTurnBudget(actor, spec.action)) { paid = false; return refuse("action"); }
    paid = true; await save({ paid: true });
    if (!valid() || !pool() || pool().value < spec.mana) return refuse("changed");
    const remaining = pool().value - spec.mana;
    await save({ manaAttempted: true });
    if (!valid()) return refuse("changed");
    await actor.updatePool({ itemId: null, kind: "power", value: remaining });
    if (pool()?.value !== remaining) return refuse("manaUnconfirmed");
    await save({ manaPaid: true });
    if (!valid()) return refuse("changed");
    const test = await rollResilience({ actor: selection.actor, resilience: spec.resilience, dc: spec.dc, subtitle: spec.name });
    const resisted = test?.rolls?.[0]?.outcome?.success, outcome = fireguardOutcome(key, resisted);
    if (!outcome || !valid()) return refuse("resistance");
    await save({ testId: test.id, resisted });
    if (!valid()) return refuse("changed");
    const damage = areaDamageOn({ actor: selection.actor, caster: actor,
      spell: { name: spec.name, school: "fire", takesSpellpower: false, feature: true, isSpell: false },
      damage: { rating: outcome.rating, school: "fire" } });
    await save({ damage: damage.damage, immune: damage.immune, damageAttempted: !damage.immune && damage.damage > 0 });
    if (!valid()) return refuse("changed");
    if (!damage.immune && damage.damage > 0) {
      await selection.actor.applyDamage(damage.damage, { struck: true, attack: true, location: "body", type: "fire",
        by: actor, spell: false, messageId: receipt.id, wardTook: damage.wardTook ?? 0, parts: damage.parts ?? null });
      await save({ damageApplied: true });
    }
    if (!valid()) return refuse("changed");
    if (outcome.burn && !damage.immune && (selection.actor.type !== "npc" || selection.actor.system.health?.value > 0)) {
      await save({ burnAttempted: true });
      if (!valid()) return refuse("changed");
      const burn = await layFireguardBurn({ source: actor, target: selection.actor, castId: receipt.uuid, valid });
      await save({ burn });
      if (!burn.ok) return refuse("burn");
    }
    if (!valid()) return refuse("changed");
    await save({ ok: true });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${spec.name}</strong></p><p>${foundry.utils.escapeHTML(selection.token.name ?? selection.actor.name)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: key === "immolate" ? "ability:fireguard-immolate" : "ability:fireguard-fire-blast",
        casting: false, targets, success: true, fireguardReceipt: receipt.uuid } } });
    finished = true; return { ...result, receiptId: receipt.id };
  } catch (error) { console.warn("azeroth-rpg | Fireguard cast interrupted", error); return refuse("writeUncertain"); }
  finally {
    locks.forEach(uuid => busy.delete(uuid));
    if (!finished && (receipt || paid !== false)) warning();
  }
}
