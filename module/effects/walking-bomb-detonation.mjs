import { claimWalkingBombDetonation, WALKING_BOMB_FLAG } from "./walking-bomb.mjs";

const activeGM = () => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id;

/** Deliver only a newly claimed detonation. Each irreversible operation is
 * preceded by a confirmed receipt write. A failed/uncertain operation stays
 * recorded for GM review; calling this again never replays it.
 * deliver() and destroy() must return {ok:true} only after confirmed writes.
 */
export async function detonateWalkingBomb({ token, attack, targets, validate, deliver, destroy } = {}) {
  if (!Array.isArray(targets) || typeof deliver !== "function" || typeof destroy !== "function"
    || typeof validate !== "function") return { ok: false, reason: "arguments" };
  const unique = [];
  const seen = new Set();
  for (const target of targets) {
    if (!target || typeof target.tokenUuid !== "string" || !target.tokenUuid.trim()
      || typeof target.actorUuid !== "string" || !target.actorUuid.trim()) return { ok: false, reason: "targets" };
    if (target.actorUuid === token?.actor?.uuid || seen.has(target.actorUuid)) continue;
    seen.add(target.actorUuid);
    unique.push({ tokenUuid: target.tokenUuid, actorUuid: target.actorUuid, phase: "pending" });
  }
  let receipt = await claimWalkingBombDetonation({ token, attack, validate });
  if (!receipt) return { ok: false, reason: "claim" };
  const held = () => JSON.stringify(token.getFlag("azeroth-rpg", WALKING_BOMB_FLAG)) === JSON.stringify(receipt);
  const current = () => activeGM() && validate() && held();
  const save = async patch => {
    if (!current()) return false;
    receipt = { ...receipt, ...patch };
    await token.update({ [`flags.azeroth-rpg.${WALKING_BOMB_FLAG}`]: receipt });
    return current();
  };
  try {
    if (!await save({ phase: "detonating", targets: unique })) return { ok: false, reason: "record" };
    for (let index = 0; index < receipt.targets.length; index++) {
      const rows = receipt.targets.map((row, i) => i === index ? { ...row, phase: "applying" } : row);
      if (!await save({ targets: rows })) return { ok: false, reason: "record" };
      const outcome = await deliver({ ...rows[index] }, current);
      if (outcome?.ok !== true) return { ok: false, reason: "damageUnconfirmed" };
      if (!await save({ targets: receipt.targets.map((row, i) => i === index
        ? { ...row, phase: "delivered", result: outcome.result ?? null } : row) })) return { ok: false, reason: "record" };
    }
    if (!await save({ phase: "destroying" })) return { ok: false, reason: "record" };
    const destroyed = await destroy(current);
    if (destroyed?.ok !== true) return { ok: false, reason: "destructionUnconfirmed" };
    if (!await save({ phase: "finished" })) return { ok: false, reason: "record" };
    return { ok: true, receipt };
  } catch (error) {
    console.warn("azeroth-rpg | Walking Bomb detonation", error);
    return { ok: false, reason: "writeUncertain" };
  }
}
