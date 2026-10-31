import { sentinelManaBurnPlan } from "../rules/sentinel-mana-burn.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const packOf = actor => actor?.flags?.["azeroth-rpg"]?.sentinelPack;

/** Commit one area cast's reviewed drains. The caller applies Shadow damage
 * only from `losses`, never from the intended drain or an uncertain write.
 * A persisted cast claim prevents replay after reload or an interrupted cast. */
export async function burnSentinelMana({ source, targets, cast, valid } = {}) {
  const result = { ok: false, claimed: false, losses: [], reason: "invalid" };
  if (!Array.isArray(targets) || !targets.length || typeof cast !== "string"
    || !/^[a-zA-Z0-9_-]{1,64}$/.test(cast) || typeof valid !== "function") return result;
  const packId = packOf(source)?.assignment?.id;
  const protections = targets.map(target => iceBlockFor(target.actor));
  const allowed = () => gmHere() && present(source) && valid() && source.system?.health?.value > 0
    && packOf(source)?.assignment?.id === packId && activeSentinelPowers(source).includes("mana-burn")
    && targets.every((target, index) => present(target.actor) && target.actor !== source && target.actor.system?.health?.value > 0
      && iceBlockFor(target.actor) === protections[index]);
  if (!allowed()) return result;
  const keys = [source.uuid, ...targets.map(target => target.actor.uuid)];
  if (new Set(keys).size !== keys.length || keys.some(key => busy.has(key))) return { ...result, reason: "busyOrDuplicate" };
  const claims = packOf(source).manaBurns ?? {};
  if (typeof claims !== "object" || Array.isArray(claims) || Object.hasOwn(claims, cast)) return { ...result, reason: "claimed" };
  const snapshots = targets.map(target => structuredClone(target.actor.poolSnapshot()));
  const plans = targets.map((target, index) => sentinelManaBurnPlan({ pools: snapshots[index],
    itemId: target.itemId, resisted: target.resisted, npc: target.actor.type === "npc" }));
  if (plans.some(plan => !plan)) return { ...result, reason: "pool" };
  for (let i = 0; i < plans.length; i++) if (protections[i]) plans[i] = { ...plans[i], drained: 0, change: null };
  keys.forEach(key => busy.add(key));
  const claim = { targets: targets.map(target => target.actor.uuid) };
  try {
    await source.update({ "flags.azeroth-rpg.sentinelPack.manaBurns": { ...claims, [cast]: claim } });
    result.claimed = same(packOf(source)?.manaBurns?.[cast], claim);
    if (!result.claimed || !allowed()) return { ...result, reason: "changed" };
    for (let index = 0; index < targets.length; index++) {
      const actor = targets[index].actor, plan = plans[index];
      if (!allowed() || !same(actor.poolSnapshot(), snapshots[index])) return { ...result, reason: "changed" };
      if (!plan.change) { result.losses.push({ uuid: actor.uuid, drained: 0 }); continue; }
      await actor.updatePool([plan.change]);
      const expected = snapshots[index].map(pool => pool.kind === "power" && pool.itemId === plan.change.itemId
        ? { ...pool, value: plan.change.value } : pool);
      if (!present(actor) || !same(actor.poolSnapshot(), expected)) return { ...result, reason: "unconfirmedLoss" };
      result.losses.push({ uuid: actor.uuid, drained: plan.drained });
    }
    return { ...result, ok: true, reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel Mana Burn", error);
    return { ...result, reason: "writeUncertain" };
  } finally { keys.forEach(key => busy.delete(key)); }
}
