import { NPC_DISARM as SPEC } from "../rules/npc-disarm.mjs";
import { stonemaulGrip } from "../rules/stonemaul-grip.mjs";
import { disarmSelectionValid } from "../rules/npc-disarm-options.mjs";
import { attackModes } from "../rules/ammunition.mjs";
import { rowAttackModes } from "../rules/strikes.mjs";
import { projectionRefusal, projectionPhaseFor } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { disarmInventory, pickDisarmWeapon } from "./npc-disarm-picker.mjs";
import { disarmedAttack } from "./npc-disarm.mjs";
import { rollDisarmSide } from "./npc-disarm-roll.mjs";
import { resolveNpcDisarmAttempt } from "./npc-disarm-attempt.mjs";
import { reveal } from "./stealth.mjs";

export const NPC_DISARM_QUERY = "azeroth-rpg.npcDisarm";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestNpcDisarm(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = writer() ? await npcDisarmQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(NPC_DISARM_QUERY, data, { timeout: 180000 });
    if (result?.reason === "immune") ui.notifications?.warn(game.i18n.localize("AZEROTH.StonemaulGrip.Immune"));
    else if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Disarm was not completed. Check its saved attempt and report before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Disarm request", error);
    ui.notifications?.warn("Disarm could not be confirmed. Check the Action, Tests and effect before trying again.");
    return null;
  }
}

function usable(actor, picked, { defending = false } = {}) {
  if (!picked || !disarmSelectionValid(picked.selection, disarmInventory(actor), { rowConfirmed: picked.rowConfirmed })) return false;
  const ref = picked.selection.weapon;
  if (ref.kind === "item") {
    const item = actor.items.get(ref.itemId);
    return (defending || attackModes(item.system).includes("hand")) && !disarmedAttack(actor, { weaponId: item.id });
  }
  const row = actor.system.attacks[ref.index];
  return (defending || rowAttackModes(row).includes("hand")) && !disarmedAttack(actor, { strike: { row: { index: ref.index, name: row.name } } });
}

export async function npcDisarmQueryHandler({ actorUuid, index, source, requestId, issuedAt } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason, paid: false });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.type !== "npc" || actor.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  let target = null, victim = null, attackerPick = null, defenderPick = null, result = null;
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const position = t => JSON.stringify([t.x, t.y, t.elevation, t._source?.level]);
  const initialPosition = token ? position(token) : null, level = token?._source?.level;
  let targetPosition = null;
  const clock = () => { const combat = actor.activeFight?.(); return combat?.started
    ? `${combat.uuid}:${combat.round}:${combat.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!writer() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return "source";
    if (!scene.levels?.get(level) || position(token) !== initialPosition) return "position";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== SPEC.name || row.automation?.kind !== "utility" || row.automation.action !== SPEC.action) return "ability";
    if (!(actor.system.health?.value > 0) || actor.statuses?.has("stunned") || realmRefusalFor(actor, "ability")
      || projectionRefusal(actor, "ability") || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (target) {
      if (stonemaulGrip(victim?.takenTalents?.() ?? [])) return "immune";
      if (scene.tokens.get(target.id) !== target || target.actor !== victim || !(victim.system.health?.value > 0)) return "target";
      if (position(target) !== targetPosition || target._source?.level !== level) return "position";
      const feet = feetApart(token, target);
      if (!Number.isFinite(feet) || feet < 0 || feet > SPEC.feet) return "range";
      if (projectionPhaseFor(victim) || realmRefusalFor(victim, "ability")) return "protected";
    }
    if (attackerPick && !usable(actor, attackerPick)) return "attackerWeapon";
    // Once the resulting effect exists, its own new restriction is expected.
    if (defenderPick && !disarmSelectionValid(defenderPick.selection, disarmInventory(victim), { rowConfirmed: defenderPick.rowConfirmed })) return "defenderWeapon";
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption } = await import("../dice/workflows.mjs");
    const candidates = [...scene.tokens.values()].filter(other => other.actor?.uuid && other.actor !== actor
      && other.actor.system.health?.value > 0 && other._source?.level === level
      && Number.isFinite(feetApart(token, other)) && feetApart(token, other) >= 0 && feetApart(token, other) <= SPEC.feet);
    if (!candidates.length) return refuse("empty");
    const menu = { id: `${actor.id}-disarm`, name: SPEC.name };
    const selected = await chooseOption(menu, candidates.map(other => ({ key: other.id, name: other.name,
      description: "Opposed Attack Tests. On a win, one held weapon cannot be used for six seconds." })), null, { prompt: "Choose a creature within 5 feet." });
    if (!selected) return refuse("cancelled");
    target = candidates.find(other => other.id === selected.key);
    if (!target) return refuse("target");
    victim = target.actor; targetPosition = position(target);
    reason = validate(); if (reason) return refuse(reason);
    attackerPick = await pickDisarmWeapon(actor, { choose: chooseOption, valid: () => validate() === null });
    if (!attackerPick) return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    defenderPick = await pickDisarmWeapon(victim, { choose: chooseOption, valid: () => validate() === null });
    if (!defenderPick) return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    if (!usable(victim, defenderPick, { defending: true })) return refuse("defenderWeapon");
    const confirm = await chooseOption(menu, [{ key: "cancel", name: "Cancel", description: "Keep your Action." },
      { key: "use", name: "Use Disarm", description: "Spend an Action and resolve both Attack Tests at DC 12." }], null,
    { prompt: "GM: Confirm both creatures can physically contest the selected weapons, with no solid cover between them." });
    if (confirm?.key !== "use") return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    if (!usable(victim, defenderPick, { defending: true })) return refuse("defenderWeapon");
    result = await resolveNpcDisarmAttempt({ actor, victim, weapon: defenderPick.selection.weapon, requestId, issuedAt,
      valid: () => validate() === null,
      rollAttacker: async () => { await reveal(actor, { acting: true, kind: "attack" });
        return rollDisarmSide(actor, attackerPick, { valid: () => validate() === null, source }); },
      rollDefender: () => rollDisarmSide(victim, defenderPick, { valid: () => validate() === null, defending: true,
        source: { sceneId: scene.id, tokenId: target.id } }) });
    if (result.ok && result.effect?.ok && result.contest?.winner === "attacker") {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
        content: "<p><strong>Disarm</strong></p><p>The selected weapon cannot be used for six seconds.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:npc-disarm",
          casting: false, success: true,
          targets: [{ sceneId: scene.id, tokenId: target.id, actorUuid: victim.uuid, name: target.name }] } } });
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
      content: `<p><strong>Disarm</strong></p><p>${result.ok
        ? result.contest?.winner === "attacker" ? "The selected weapon cannot be used for six seconds." : "The target keeps use of its weapon."
        : "Disarm stopped. Check the saved attempt, completed Tests and effect before resolving it manually. Do not repeat completed steps."}</p>`,
      flags: { "azeroth-rpg": { kind: "npcDisarmReport", npcDisarm: result, source } } });
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Disarm scene adapter", error);
    return result ? { ...result, ok: false, reason: "reportUncertain" } : refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
