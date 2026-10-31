import { MIGHTY_BLOW } from "../rules/mighty-blow.mjs";
import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";

/** One ordinary attack with a temporary row override. The caller owns the
 * persistent claim, target legality and Action/use payment. */
export async function rollMightyBlow({ actor, plan, readCurrent, pay } = {}) {
  let paid = false;
  const stop = reason => ({ ok: false, paid, card: null, reason });
  if (!actor || !plan || plan.damageBonus !== MIGHTY_BLOW.damageBonus || !Number.isInteger(plan.index)
    || typeof readCurrent !== "function" || typeof pay !== "function") return stop("invalid");
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  try {
    const initial = await readCurrent(), source = initial?.source, target = initial?.target;
    if (!source || source.actor !== actor || target?.actor?.uuid !== plan.targetUuid) return stop("identity");
    const victim = target.actor, weapon = JSON.stringify(actor.system?.attacks?.[plan.index]);
    if (weapon !== JSON.stringify(plan.attack)) return stop("weapon");
    const valid = async () => {
      const now = await readCurrent();
      return now?.source === source && now.target === target && source.actor === actor && target.actor === victim
        && victim.system?.health?.value > 0 && JSON.stringify(actor.system.attacks[plan.index]) === weapon;
    };
    const snapshots = () => targetSnapshots([{ id: target.id, actor: victim, name: target.name, scene: target.parent }]);
    const snapshot = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }])[0];
    if (!await valid()) return stop("changed");
    let entered = false;
    const card = await npcAttackWithDialog(actor, plan.index, null, {
      title: MIGHTY_BLOW.name, budget: "none", singleAttack: true, mode: "hand", targets: snapshots(),
      attack: { ...plan.attack, traits: [...plan.attack.traits], damage: plan.attack.damage + MIGHTY_BLOW.damageBonus },
      run: async args => {
        if (entered) return null;
        entered = true;
        if (args.actor !== actor || !await valid()) return null;
        const selected = args.targets;
        if (!preparedVoidwalkerDefender(args, target, snapshot)) return null;
        if (!await pay()) return null;
        paid = true;
        if (!await valid()) return null;
        const defender = preparedVoidwalkerDefender(args, target, snapshot);
        if (!defender) return null;
        const fresh = defender.targets;
        if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense) || !Number.isFinite(selected[0].defense)) return null;
        return rollTest({ ...args, targets: fresh, budget: "none", source: { sceneId: source.parent.id, tokenId: source.id },
          ...(Number.isFinite(args.dc) ? { dc: args.dc + fresh[0].defense - selected[0].defense } : {}) });
      }
    });
    return paid && card?.id && typeof card.rolls?.[0]?.outcome?.success === "boolean"
      ? { ok: true, paid, card, reason: null } : stop("notRolled");
  } catch (error) {
    console.warn("azeroth-rpg | Mighty Blow strike interrupted", error); return stop("interrupted");
  }
}
