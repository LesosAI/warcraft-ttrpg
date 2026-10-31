/** Resolve an already-paid, durably claimed Whirlwind volley.
 * readCurrent owns scene/range/hostility and source-state validation.
 * checkpoint must persist each stage and return true only after confirmation.
 * No retry/resume is inferred from a partial list of attack cards.
 */
export async function rollWhirlwindStrikes({ actor, record, targets, readCurrent, checkpoint } = {}) {
  const results = [];
  const stop = reason => ({ ok: false, reason, results });
  if (globalThis.game?.user?.isGM !== true || game.users?.activeGM?.id !== game.user.id
    || actor?.uuid !== record?.actorUuid || record?.phase !== "striking" || !record.castId
    || !Array.isArray(targets) || new Set(targets.map(t => t?.uuid)).size !== targets.length
    || targets.some(t => !t?.uuid || !t.actor?.uuid || !t.parent?.id)
    || typeof readCurrent !== "function" || typeof checkpoint !== "function") return stop("invalid");
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  const initial = await readCurrent();
  const source = initial?.source;
  if (source?.actor !== actor || source.uuid !== record.tokenUuid) return stop("source");
  const actors = new Map(targets.map(t => [t, t.actor]));
  const snapshot = t => targetSnapshots([{ id: t.id, actor: t.actor, name: t.name, scene: t.parent }]);
  const state = async target => {
    const current = await readCurrent();
    if (game.users?.activeGM?.id !== game.user.id || !game.user.isGM || current?.source !== source || source.actor !== actor
      || JSON.stringify(actor.system?.attacks?.[record.index]) !== JSON.stringify(record.attack)) return "source";
    if (target.actor !== actors.get(target)) return "replaced";
    if (!(target.actor.system?.health?.value > 0) || !current.targets?.includes(target)) return "ineligible";
    return null;
  };
  const save = async stage => (await checkpoint({ castId: record.castId, stage, results: structuredClone(results) })) === true;
  try {
    if (!await save("started")) return stop("receipt");
    for (const token of targets) {
      let reason = await state(token);
      if (reason === "source" || reason === "replaced") return stop(reason);
      const entry = { tokenUuid: token.uuid, actorUuid: token.actor.uuid, status: reason ? "skipped" : "pending", attackId: null };
      results.push(entry);
      if (reason) { if (!await save("skipped")) return stop("receipt"); continue; }
      if (!await save("pending")) return stop("receipt");
      let entered = false;
      const card = await npcAttackWithDialog(actor, record.index, null, {
        title: `Whirlwind (${results.length}/${targets.length})`, budget: "none", singleAttack: true, mode: "hand", targets: snapshot(token),
        run: async args => {
          if (entered) return null; entered = true;
          reason = await state(token);
          if (reason || args.actor !== actor) return null;
          const selected = args.targets ?? [];
          if (selected.length !== 1 || selected[0].sceneId !== token.parent.id || selected[0].tokenId !== token.id
            || !Number.isFinite(args.dc) || !Number.isFinite(selected[0].defense)) return null;
          if (!await save("rolling")) return null;
          reason = await state(token); if (reason) return null;
          const fresh = snapshot(token);
          if (fresh.length !== 1 || !Number.isFinite(fresh[0].defense)) return null;
          return rollTest({ ...args, targets: fresh, budget: "none", dc: args.dc + fresh[0].defense - selected[0].defense,
            source: { sceneId: source.parent.id, tokenId: source.id } });
        }
      });
      entry.attackId = card?.id ?? null;
      const success = card?.rolls?.[0]?.outcome?.success;
      if (!entry.attackId || typeof success !== "boolean") {
        entry.status = "unresolved"; await save("unresolved"); return stop("unresolved");
      }
      entry.status = "rolled"; entry.hit = success;
      if (!await save("rolled")) return stop("receipt");
    }
    if (!await save("complete")) return stop("receipt");
    return { ok: true, results };
  } catch (error) {
    console.warn("azeroth-rpg | Whirlwind volley stopped; inspect saved attack stages", error);
    return stop("writeUncertain");
  }
}
