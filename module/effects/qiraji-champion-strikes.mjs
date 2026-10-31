/** Bounded Cleave/Vengeance strikes through ordinary NPC attack resolution.
 * The caller owns authorization, range, clock and limited-use payment. */
export async function rollChampionStrikes({ actor, plan, readCurrent, pay, title } = {}) {
  if (!actor || !plan || !Array.isArray(plan.targets) || plan.targets.length < 1 || plan.targets.length > 3
    || !Number.isInteger(plan.index) || typeof readCurrent !== "function" || typeof pay !== "function")
    return { ok: false, paid: false, cards: [], skipped: [], reason: "invalid" };
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  let paid = false;
  const cards = [], skipped = [];
  const stop = reason => ({ ok: false, paid, cards, skipped, reason });
  try {
    const initial = await readCurrent();
    if (!initial?.source || initial.source.actor !== actor || !Array.isArray(initial.targets)) return stop("invalid");
    const source = initial.source, targets = new Map(initial.targets.map(token => [token.actor?.uuid, token]));
    const actors = new Map(initial.targets.map(token => [token, token.actor]));
    if (targets.size !== initial.targets.length || plan.targets.some(uuid => !targets.has(uuid))) return stop("target");
    const weapon = JSON.stringify(actor.system?.attacks?.[plan.index]);
    if (!plan.attack || weapon !== JSON.stringify(plan.attack)) return stop("weapon");
    const validate = async token => {
      const now = await readCurrent();
      return now?.source === source && source.actor === actor && now.targets?.includes(token)
        && token.actor === actors.get(token) && token.actor?.uuid && targets.get(token.actor.uuid) === token
        && JSON.stringify(actor.system.attacks[plan.index]) === weapon;
    };
    const snapshots = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }]);
    for (const [strike, uuid] of plan.targets.entries()) {
      const token = targets.get(uuid);
      if (!await validate(token)) return stop("changed");
      if (!(token.actor.system?.health?.value > 0)) { skipped.push({ strike, uuid, reason: "dead" }); continue; }
      let entered = false;
      const card = await npcAttackWithDialog(actor, plan.index, null, {
        budget: "none", singleAttack: true, mode: "hand", title: `${title} (${strike + 1}/${plan.targets.length})`,
        targets: snapshots(token),
        run: async args => {
          if (entered) return null;
          entered = true;
          if (args.actor !== actor || !await validate(token) || !(token.actor.system?.health?.value > 0)) return null;
          const selected = args.targets ?? [];
          if (selected.length !== 1 || selected[0].sceneId !== token.parent.id || selected[0].tokenId !== token.id) return null;
          if (!paid) {
            if (!await pay()) return null;
            paid = true;
            if (!await validate(token) || !(token.actor.system?.health?.value > 0)) return null;
          }
          const fresh = snapshots(token);
          if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense) || !Number.isFinite(selected[0].defense)) return null;
          const defenseDelta = fresh[0].defense - selected[0].defense;
          return rollTest({ ...args, targets: fresh, budget: "none",
            source: { sceneId: source.parent.id, tokenId: source.id },
            ...(Number.isFinite(args.dc) ? { dc: args.dc + defenseDelta } : {}) });
        }
      });
      if (!card?.id || typeof card.rolls?.[0]?.outcome?.success !== "boolean") return stop("notRolled");
      cards.push(card.id);
    }
    return { ok: paid, paid, cards, skipped, reason: paid ? null : "noLivingTargets" };
  } catch (error) {
    console.warn("azeroth-rpg | Champion strikes interrupted", error);
    return stop("interrupted");
  }
}
