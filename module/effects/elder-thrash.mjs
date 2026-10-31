/** Three ordinary NPC bite rolls, with one caller-owned payment and fixed target. */
import { elderThrashPlan } from "../rules/elder-diemetradon.mjs";
import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";

export async function rollElderThrash({ actor, readCurrent, pay } = {}) {
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  const initial = await readCurrent();
  const plan = elderThrashPlan(actor?.system?.attacks);
  if (!initial || !plan) return { ok: false, paid: false, cards: [], reason: "invalid" };
  const { source, target } = initial;
  const victim = target?.actor;
  const bite = JSON.stringify(actor.system.attacks[plan.index]);
  let paid = false;
  const cards = [];
  const validate = async () => {
    const now = await readCurrent();
    return now?.source === source && now?.target === target && source.actor === actor
      && target.actor === victim
      && JSON.stringify(actor.system.attacks[plan.index]) === bite ? now : null;
  };
  const snapshots = () => targetSnapshots([{ id: target.id, actor: target.actor, name: target.name, scene: target.parent }]);
  const snapshot = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }])[0];
  try {
    for (let strike = 0; strike < plan.strikes; strike++) {
      if (!await validate()) return { ok: false, paid, cards, reason: "changed" };
      let entered = false;
      const card = await npcAttackWithDialog(actor, plan.index, null, {
        ...plan.options, title: `Thrash (${strike + 1}/${plan.strikes})`, targets: snapshots(), mode: "hand",
        run: async args => {
          // A dialog callback is a single-use continuation, not a second door.
          if (entered) return null;
          entered = true;
          if (args.actor !== actor || !await validate()) return null;
          const selected = args.targets ?? [];
          if (!preparedVoidwalkerDefender(args, target, snapshot)) return null;
          if (!paid) {
            if (!await pay()) return null;
            paid = true;
            if (!await validate()) return null;
          }
          // Each bite prepares protection anew; this dialog must still have
          // that same defender after the one payment has completed.
          const defender = preparedVoidwalkerDefender(args, target, snapshot);
          if (!defender) return null;
          const fresh = defender.targets;
          const defenseDelta = Number.isFinite(fresh[0]?.defense) && Number.isFinite(selected[0]?.defense)
            ? fresh[0].defense - selected[0].defense : 0;
          return rollTest({ ...args, targets: fresh, budget: "none",
            ...(Number.isFinite(args.dc) ? { dc: args.dc + defenseDelta } : {}) });
        }
      });
      if (!card || typeof card.rolls?.[0]?.outcome?.success !== "boolean") {
        return { ok: false, paid, cards, reason: "notRolled" };
      }
      cards.push(card.id);
    }
    return { ok: true, paid, cards };
  } catch (error) {
    console.warn("azeroth-rpg | Thrash interrupted", error);
    return { ok: false, paid, cards, reason: "interrupted" };
  }
}
