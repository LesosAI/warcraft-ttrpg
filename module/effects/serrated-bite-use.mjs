/** One paid NPC bite through the ordinary attack dialog and damage card. */
import { SERRATED_BITE as spec } from "../rules/serrated-bite.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { untilEndOfNextTurn, clockRounds } from "./durations.mjs";
import { laySerratedBite } from "./serrated-bite.mjs";
import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function useSerratedBite(actor, index, targets = []) {
  if (!gmHere()) { ui.notifications?.warn("The active GM must resolve Serrated Bite."); return null; }
  const { sourceOf, targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const snapshot = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }])[0];
  const source = sourceOf(actor), scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId);
  const token = targets.length === 1 && targets[0]?.sceneId === scene?.id ? scene.tokens.get(targets[0].tokenId) : null;
  const victim = token?.actor;
  if (!actor?.uuid || !victim?.uuid || victim === actor || origin?.actor !== actor || busy.has(actor.uuid)) return null;
  busy.add(actor.uuid);
  let paid = false, consumed = false, rolled = false;
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const valid = () => {
    const row = actor.system?.creatureAbilities?.[index], uses = row?.automation?.uses;
    const feet = feetApart(origin, token);
    return gmHere() && clock() === started && game.scenes.get(scene.id) === scene
      && scene.tokens.get(origin.id) === origin && origin.actor === actor
      && scene.tokens.get(token.id) === token && token.actor === victim
      && row?.name === spec.name && uses?.max === 1 && uses?.per === "short" && uses.value === (consumed ? 0 : 1)
      && actor.system.health?.value > 0 && !realmRefusalFor(actor, "ability") && !realmRefusalFor(victim, "ability")
      && Number.isFinite(feet) && feet >= 0 && feet <= spec.feet;
  };
  try {
    if (!valid()) { ui.notifications?.warn("Serrated Bite needs one target within five feet and an available use."); return null; }
    const { npcAttackWithDialog } = await import("../applications/actions.mjs");
    const { rollTest, spendTurnBudget } = await import("../dice/workflows.mjs");
    return await npcAttackWithDialog(actor, null, null, {
      title: spec.name, attack: { name: "Bite", bonus: spec.bonus, damage: spec.damage, traits: [] },
      targets, mode: "hand", singleAttack: true, budget: "none",
      run: async args => {
        if (rolled || paid || !valid() || args.actor !== actor) return null;
        const prepared = preparedVoidwalkerDefender(args, token, snapshot);
        if (!prepared || realmRefusalFor(prepared.actor, "ability")) return null;
        if (!await spendTurnBudget(actor, spec.action)) return null;
        paid = true;
        if (!valid() || !preparedVoidwalkerDefender(args, token, snapshot)) throw Error("Bite changed after payment");
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows }); consumed = true;
        if (!valid()) throw Error("Bite changed before roll");
        const defender = preparedVoidwalkerDefender(args, token, snapshot);
        if (!defender || realmRefusalFor(defender.actor, "ability")) throw Error("Bite defender changed before roll");
        rolled = true;
        const message = await rollTest({ ...args, targets: defender.targets, budget: "none",
          ...(Number.isFinite(args.dc) ? { dc: args.dc + defender.targets[0].defense - args.targets[0].defense } : {}) });
        if (!message || message.rolls?.[0]?.outcome?.success !== true) return message;
        await message.update({ "flags.azeroth-rpg.serratedBiteAttack": { sourceUuid: actor.uuid, targetUuid: defender.actor.uuid } });
        const result = await laySerratedBite({ message, source: actor, target: defender.actor,
          timing: untilEndOfNextTurn(defender.actor) ?? clockRounds(1) });
        if (!result.ok && !["immune", "withdrawn"].includes(result.reason))
          ui.notifications?.warn("The bite was rolled, but its Bleeding could not be confirmed. Check the existing attack card and effects; do not roll again.");
        return message;
      }
    });
  } catch {
    ui.notifications?.warn(paid ? "Serrated Bite stopped after payment. Check its use, attack card and effects before continuing."
      : "Serrated Bite could not be started.");
    return null;
  } finally { busy.delete(actor.uuid); }
}
