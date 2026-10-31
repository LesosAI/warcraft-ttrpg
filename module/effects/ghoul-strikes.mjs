import { GHOUL_CLEAVE, RENDING_CLAWS, FLESH_ROT } from "../rules/naxxramas-ghoul.mjs";
import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";

/** Caller owns authorization, geometry and durable use receipts. */
export async function rollGhoulStrikes({ actor, ability, plan, readCurrent, pay, checkpoint } = {}) {
  let paid = false;
  const cards = [];
  const stop = reason => ({ ok: false, paid, cards, skipped: [], reason });
  const spec = [GHOUL_CLEAVE, RENDING_CLAWS, FLESH_ROT].find(row => row.name === ability);
  if (!spec || !actor || !plan || !Number.isInteger(plan.index) || !Array.isArray(plan.targets)
    || !plan.targets.length || plan.targets.length > spec.targets
    || new Set(plan.targets).size !== plan.targets.length
    || typeof readCurrent !== "function" || typeof pay !== "function"
    || typeof checkpoint !== "function") return stop("invalid");
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  try {
    const initial = await readCurrent(), source = initial?.source;
    if (source?.actor !== actor || !Array.isArray(initial?.targets)) return stop("identity");
    const targets = new Map(initial.targets.map(token => [token.actor?.uuid, token]));
    const actors = new Map(initial.targets.map(token => [token, token.actor]));
    if (targets.size !== initial.targets.length || plan.targets.some(uuid => !targets.has(uuid))) return stop("target");
    const base = actor.system?.attacks?.[plan.index];
    if (base?.name !== "Claws" || !Array.isArray(base.traits)) return stop("weapon");
    const weapon = JSON.stringify(base);
    const override = { ...base, traits: [...base.traits], damage: base.damage + (spec.strikeBonus ?? 0) };
    if (JSON.stringify(override) !== JSON.stringify(plan.attack)) return stop("weapon");
    const valid = async token => {
      const now = await readCurrent();
      return now?.source === source && source.actor === actor && now.targets?.includes(token)
        && token.actor === actors.get(token) && token.actor.system?.health?.value > 0
        && JSON.stringify(actor.system?.attacks?.[plan.index]) === weapon;
    };
    const snapshots = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }]);
    for (const uuid of plan.targets) {
      const token = targets.get(uuid);
      if (!await valid(token)) return stop("changed");
      let entered = false, struck = null;
      const card = await npcAttackWithDialog(actor, plan.index, null, {
        title: spec.name, budget: "none", singleAttack: true, mode: "hand", targets: snapshots(token),
        attack: { ...override, traits: [...override.traits] },
        run: async args => {
          if (entered) return null;
          entered = true;
          if (args.actor !== actor || !await valid(token)) return null;
          const selected = args.targets;
          if (!preparedVoidwalkerDefender(args, token, t => snapshots(t)[0])) return null;
          if (!paid) {
            if (!await pay()) return null;
            paid = true;
          }
          if (!await valid(token)) return null;
          const defender = preparedVoidwalkerDefender(args, token, t => snapshots(t)[0]);
          if (!defender) return null;
          const fresh = defender.targets;
          if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense) || !Number.isFinite(selected[0].defense)) return null;
          struck = { sceneId: defender.token.parent.id, tokenId: defender.token.id, actorUuid: defender.actor.uuid };
          return rollTest({ ...args, targets: fresh, budget: "none", source: { sceneId: source.parent.id, tokenId: source.id },
            ...(Number.isFinite(args.dc) ? { dc: args.dc + fresh[0].defense - selected[0].defense } : {}) });
        }
      });
      if (!struck || !card?.id || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return stop("notRolled");
      cards.push(card.id);
      // The owning controller must save this card before another attack opens.
      if (!await checkpoint({ strike: cards.length - 1, uuid, defender: struck, cards: [...cards], skipped: [] })) return stop("checkpoint");
    }
    return { ok: true, paid, cards, skipped: [], reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Ghoul strikes interrupted", error);
    return stop("interrupted");
  }
}
