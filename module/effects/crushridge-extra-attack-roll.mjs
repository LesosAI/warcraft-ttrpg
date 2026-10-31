import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";

/** One already-claimed melee attack through the ordinary NPC workflow.
 * readCurrent owns scene/reach/hostility checks; valid owns the durable turn
 * receipt. Neither callback is client supplied. Damage stays in rollTest. */
export async function rollCrushridgeExtraAttack({ actor, index, readCurrent, valid } = {}) {
  if (actor?.type !== "npc" || !Number.isInteger(index) || index < 0
    || typeof readCurrent !== "function" || typeof valid !== "function") return null;
  const attack = actor.system?.attacks?.[index];
  if (!attack || attack.range != null || !Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage)) return null;
  const stamp = JSON.stringify(attack);
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  const initial = await readCurrent(), source = initial?.source, target = initial?.target, victim = target?.actor;
  if (!source?.parent || source.actor !== actor || !target?.parent || !victim?.uuid) return null;
  const unchanged = async () => {
    if (!await valid()) return false;
    const current = await readCurrent();
    return current?.source === source && current?.target === target && source.actor === actor
      && target.actor === victim && victim.system?.health?.value > 0
      && JSON.stringify(actor.system?.attacks?.[index]) === stamp && await valid();
  };
  const snapshots = () => targetSnapshots([{ id: target.id, actor: victim, name: target.name, scene: target.parent }]);
  const snapshot = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }])[0];
  if (!await unchanged()) return null;
  let entered = false;
  const card = await npcAttackWithDialog(actor, index, null, {
    title: "Fallen-Kin Rage: extra attack", mode: "hand", budget: "none", singleAttack: true, targets: snapshots(),
    run: async args => {
      if (entered) return null;
      entered = true;
      if (args.actor !== actor || !await unchanged()) return null;
      const selected = args.targets ?? [];
      const defender = preparedVoidwalkerDefender(args, target, snapshot);
      if (!defender) return null;
      const fresh = defender.targets;
      if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense) || !Number.isFinite(selected[0].defense)
        || !Number.isFinite(args.dc)) return null;
      return rollTest({ ...args, targets: fresh, budget: "none", dc: args.dc + fresh[0].defense - selected[0].defense,
        source: { sceneId: source.parent.id, tokenId: source.id } });
    }
  });
  return typeof card?.id === "string" && card.id ? { attackId: card.id } : null;
}
