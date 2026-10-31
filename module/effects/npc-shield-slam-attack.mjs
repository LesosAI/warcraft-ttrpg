import { NPC_SHIELD_SLAM as SPEC, shieldSlamShield } from "../rules/npc-shield-slam.mjs";

/** One declared shield strike through the ordinary NPC attack pipeline.
 * The activation owns scene/range/permission validation and durable payment.
 * This adapter rechecks those facts and the same equipped shield after the
 * dialog. It never applies damage or stun itself.
 */
export async function rollNpcShieldSlam({ actor, shieldId, readCurrent, pay } = {}) {
  if (actor?.type !== "npc" || typeof readCurrent !== "function" || typeof pay !== "function") return null;
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  const initial = await readCurrent();
  const source = initial?.source, target = initial?.target, victim = target?.actor;
  if (!source?.parent || source.actor !== actor || !target?.parent || !victim?.uuid) return null;
  const valid = async () => {
    const current = await readCurrent();
    return current?.source === source && current?.target === target && source.actor === actor
      && target.actor === victim && victim.system?.health?.value > 0
      && shieldSlamShield([...(actor.items?.values() ?? [])], shieldId) !== null;
  };
  const snapshots = () => targetSnapshots([{ id: target.id, actor: victim, name: target.name, scene: target.parent }]);
  if (!await valid()) return null;
  let entered = false;
  return npcAttackWithDialog(actor, null, null, {
    title: SPEC.name, attack: { name: "Shield bash", bonus: SPEC.bonus, damage: SPEC.rating, traits: [] },
    mode: "hand", budget: "none", singleAttack: true, targets: snapshots(),
    run: async args => {
      if (entered) return null;
      entered = true;
      if (args.actor !== actor || !await valid()) return null;
      const selected = args.targets ?? [];
      if (selected.length !== 1 || selected[0].sceneId !== target.parent.id || selected[0].tokenId !== target.id) return null;
      if (!await pay() || !await valid()) return null;
      const fresh = snapshots();
      if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense) || !Number.isFinite(selected[0].defense)
        || !Number.isFinite(args.dc)) return null;
      return rollTest({ ...args, targets: fresh, budget: "none",
        npcShieldSlamShieldId: shieldId,
        dc: args.dc + fresh[0].defense - selected[0].defense,
        source: { sceneId: source.parent.id, tokenId: source.id } });
    }
  });
}
