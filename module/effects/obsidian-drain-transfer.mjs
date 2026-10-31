/** Execute a reviewed Drain Mana plan once on the active GM. No targeting,
 * Action payment or resistance rolls occur here; the Use adapter owns them. */
import { destroyerDrainPlan, destroyerConfirmedGain } from "../rules/obsidian-destroyer.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
export const DESTROYER_DRAINS = "destroyerDrains";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function transferDestroyerMana({ source, targets = [], cast, valid } = {}) {
  const result = { ok: false, reason: "invalid", claimed: false, losses: [], gained: 0 };
  const protections = Array.isArray(targets) ? targets.map(t => iceBlockFor(t.actor)) : [];
  const allowed = () => gmHere() && present(source) && typeof valid === "function" && valid()
    && targets.every((t, index) => present(t.actor) && t.actor !== source && iceBlockFor(t.actor) === protections[index]);
  if (typeof cast !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(cast) || !Array.isArray(targets) || !allowed()) return result;
  const keys = [source.uuid, ...targets.map(t => t.actor.uuid)];
  if (new Set(keys).size !== keys.length || keys.some(key => busy.has(key))) return { ...result, reason: "busyOrDuplicate" };
  const claims = source.flags?.["azeroth-rpg"]?.[DESTROYER_DRAINS] ?? {};
  if (!claims || typeof claims !== "object" || Array.isArray(claims) || Object.hasOwn(claims, cast)) return { ...result, reason: "claimed" };
  const mana = source.system?.power?.value, maximum = source.system?.power?.max;
  const snapshots = targets.map(t => ({ uuid: t.actor.uuid, itemId: t.itemId, hostile: t.hostile,
    distance: t.distance, resisted: t.resisted, pools: structuredClone(t.actor.poolSnapshot()) }));
  const plan = destroyerDrainPlan({ mana, maximum, targets: snapshots });
  if (!plan.ok) return { ...result, reason: plan.reason };
  for (let i = 0; i < plan.targets.length; i++) if (protections[i]) plan.targets[i] = { ...plan.targets[i], drained: 0 };
  keys.forEach(key => busy.add(key));
  const claim = { state: "claimed", sourceUuid: source.uuid, targets: plan.targets.map(t => t.uuid) };
  const sourceUnchanged = () => source.system.power.value === mana && source.system.power.max === maximum;
  try {
    // Claim before the first target write. An uncertain claim or transfer is
    // never retried by this cast, including after reload or GM handoff.
    await source.setFlag("azeroth-rpg", DESTROYER_DRAINS, { ...claims, [cast]: claim });
    result.claimed = same(source.flags?.["azeroth-rpg"]?.[DESTROYER_DRAINS]?.[cast], claim);
    if (!result.claimed || !allowed() || !sourceUnchanged()) return { ...result, reason: "changed" };
    for (let i = 0; i < plan.targets.length; i++) {
      const row = plan.targets[i], actor = targets[i].actor;
      if (!allowed() || !sourceUnchanged() || !same(actor.poolSnapshot(), snapshots[i].pools)) return { ...result, reason: "changed" };
      if (row.drained === 0) continue;
      await actor.updatePool([{ itemId: row.itemId, kind: "power", value: row.value }]);
      const expected = snapshots[i].pools.map(pool => pool.kind === "power" && pool.itemId === row.itemId ? { ...pool, value: row.value } : pool);
      if (!present(actor) || !same(actor.poolSnapshot(), expected)) return { ...result, reason: "unconfirmedLoss" };
      result.losses.push({ uuid: row.uuid, drained: row.drained });
    }
    if (!allowed() || !sourceUnchanged()) return { ...result, reason: "changed" };
    const gain = destroyerConfirmedGain({ mana, maximum, losses: result.losses });
    if (!gain) return { ...result, reason: "gain" };
    if (gain.gained) {
      await source.update({ "system.power.value": gain.value });
      if (!present(source) || source.system.power.value !== gain.value) return { ...result, reason: "unconfirmedGain" };
      result.gained = gain.gained;
    }
    return { ...result, ok: true, reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Destroyer Mana transfer", error);
    return { ...result, reason: "writeUncertain" };
  } finally { keys.forEach(key => busy.delete(key)); }
}
