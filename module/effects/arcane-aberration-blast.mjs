import { ABERRATION_BLAST as SPEC, aberrationBlastDamage } from "../rules/arcane-aberration.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
export const ABERRATION_BLAST_QUERY = "azeroth-rpg.aberrationBlast";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const receiptOf = card => card?.flags?.["azeroth-rpg"]?.aberrationBlast;

export async function requestAberrationBlast(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await aberrationBlastQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ABERRATION_BLAST_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Arcane Blast did not finish. Check its receipt and any spent Action or Mana before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Arcane Blast request", error);
    ui.notifications?.warn("Arcane Blast could not be confirmed. Check its receipt before repeating it.");
    return null;
  }
}

/** Review before paying, then persist each attempted payment and target. */
export async function aberrationBlastQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const results = [];
  let receipt = null;
  const refuse = reason => ({ ok: false, reason, receiptId: receipt?.id ?? null, results });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("request");
  const actor = fromUuidSync(actorUuid), scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  if (actor?.type !== "npc" || token?.actor !== actor || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actorUuid)) return refuse("busy");
  const level = token._source?.level, position = JSON.stringify([token.x, token.y, token.elevation, level]);
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : game.time?.worldTime;
  const started = clock();
  const pool = () => (actor.poolSnapshot?.() ?? []).find(row => row.kind === "power" && (row.name === "mana" || row.name == null));
  const valid = () => {
    const ability = actor.system?.creatureAbilities?.[index], stamp = ability?.automation;
    return gmHere() && fromUuidSync(actorUuid) === actor && actor.testUserPermission(user, "OWNER")
      && game.scenes.get(scene.id) === scene && scene.tokens.get(token.id) === token && token.actor === actor
      && scene.levels?.get(level) && JSON.stringify([token.x, token.y, token.elevation, token._source?.level]) === position
      && started != null && clock() === started && actor.system.health?.value > 0
      && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
      && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
      && Number.isInteger(index) && ability?.name === SPEC.name && stamp?.kind === "utility"
      && stamp.action === SPEC.action && stamp.cost?.pool === "power" && stamp.cost.amount === SPEC.mana;
  };
  const record = { requestId, userId: user.id, actorUuid, source, phase: "reviewed", results };
  const save = async phase => {
    if (!valid()) return false;
    record.phase = phase;
    await receipt.update({ "flags.azeroth-rpg.aberrationBlast": structuredClone(record),
      content: `<p><strong>${SPEC.name}</strong></p><p>${foundry.utils.escapeHTML(phase)}</p>`
        + results.map(row => `<p>${foundry.utils.escapeHTML(row.name)}: ${foundry.utils.escapeHTML(row.phase)}${row.lines ? ` — ${foundry.utils.escapeHTML(row.lines.join(" "))}` : ""}</p>`).join("") });
    return valid() && JSON.stringify(receiptOf(receipt)) === JSON.stringify(record);
  };
  busy.add(actorUuid);
  try {
    if ((game.messages?.contents ?? []).some(card => receiptOf(card)?.requestId === requestId && receiptOf(card)?.userId === user.id)) return refuse("duplicate");
    if (!valid() || !Number.isInteger(pool()?.value) || pool().value < SPEC.mana) return refuse("unavailable");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption, name: SPEC.name,
      radius: SPEC.radius, validOrigin: valid, includeToken: target => target._source?.level === level,
      payment: "Spend one Action and 3 Mana. Each exposed enemy makes a Reflex Test at DC 17 for half damage." });
    if (!selection.ok) return refuse(selection.reason);
    const targets = [];
    for (const target of selection.targets) {
      if (!valid() || !selection.valid()) return refuse("changedArea");
      if (!(target.actor.system?.health?.value > 0)) continue;
      const cover = await chooseOption({ id: token.id, name: SPEC.name }, [
        { key: "blocked", name: "Protected by solid cover", description: "The blast cannot reach this enemy." },
        { key: "exposed", name: "Exposed", description: "Resolve this enemy's Reflex Test and Arcane damage." }
      ], null, { prompt: `GM: Can the blast reach ${target.token.name}?` });
      if (!valid() || !selection.valid() || !["blocked", "exposed"].includes(cover?.key)) return refuse("cover");
      if (cover.key === "exposed") targets.push({ ...target,
        position: JSON.stringify([target.token.x, target.token.y, target.token.elevation, target.token._source?.level]) });
    }
    if (!targets.length) return refuse("noTargets");
    const targetsValid = () => selection.valid() && targets.every(target =>
      JSON.stringify([target.token.x, target.token.y, target.token.elevation, target.token._source?.level]) === target.position);
    receipt = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      whisper: game.users.filter(entry => entry.isGM).map(entry => entry.id),
      content: `<p>${SPEC.name}: reviewed; payment pending.</p>`,
      flags: { "azeroth-rpg": { kind: "aberrationBlastReceipt", aberrationBlast: structuredClone(record) } } });
    if (!receipt || JSON.stringify(receiptOf(receipt)) !== JSON.stringify(record) || !targetsValid()) return refuse("receipt");
    if (!await save("paying-action") || !targetsValid()) return refuse("record");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    record.actionPaid = true;
    if (!await save("paying-mana") || !targetsValid() || !Number.isInteger(pool()?.value) || pool().value < SPEC.mana) return refuse("changed");
    const remaining = pool().value - SPEC.mana;
    await actor.updatePool({ itemId: pool().itemId ?? null, kind: "power", value: remaining });
    if (!valid() || pool()?.value !== remaining) return refuse("manaUnconfirmed");
    record.manaPaid = true;
    if (!await save("resolving")) return refuse("record");
    for (const target of targets) {
      const current = () => valid() && targetsValid() && target.token.actor === target.actor
        && scene.tokens.get(target.token.id) === target.token && !realmRefusalFor(target.actor, "ability");
      if (!current()) return refuse("changedTarget");
      if (!(target.actor.system?.health?.value > 0)) continue;
      const row = { name: target.token.name, actorUuid: target.actor.uuid, phase: "testing" }; results.push(row);
      if (!await save("resolving")) return refuse("record");
      const test = await rollResilience({ actor: target.actor, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      row.resisted = test?.rolls?.[0]?.outcome?.success; row.testId = test?.uuid ?? null;
      const rating = aberrationBlastDamage(row.resisted);
      if (rating === null || !current()) return refuse("test");
      row.phase = "damaging";
      if (!await save("resolving")) return refuse("record");
      row.lines = await strikeFromArea({ actor: target.actor, caster: actor,
        spell: { name: SPEC.name, school: SPEC.school, takesSpellpower: false, feature: true, isSpell: false },
        damage: { rating, school: SPEC.school } });
      if (!Array.isArray(row.lines) || !row.lines.length || !current()) return refuse("damageUnconfirmed");
      row.phase = "finished";
      if (!await save("resolving")) return refuse("record");
    }
    if (!await save("finished")) return refuse("record");
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        whisper: game.users.filter(entry => entry.isGM).map(entry => entry.id),
        content: `<p>${SPEC.name}: resolved. See the cast record for individual results.</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:aberration-arcane-blast",
          casting: false, success: true, targets: [], receiptId: receipt.id } } });
    } catch (error) { console.warn("azeroth-rpg | Arcane Blast feedback", error); }
    return { ok: true, receiptId: receipt.id, results };
  } catch (error) {
    console.warn("azeroth-rpg | Arcane Blast", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actorUuid); }
}
