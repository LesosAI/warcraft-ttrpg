import { aberrationManaBurnPlan, ABERRATION_DEATH } from "../rules/arcane-aberration.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";

export const ABERRATION_DEATH_FLAG = "aberrationDeath";
const busy = new Set();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Resolve one reviewed target after the death coordinator has claimed the
 * source token. Every external write has a preceding durable receipt; uncertain
 * delivery stops and cannot be replayed by invoking this function again. */
export async function applyAberrationManaBurn({ token, victim, itemId = null, resisted, valid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!token?.uuid || !victim?.uuid || typeof valid !== "function"
    || busy.has(token.uuid) || busy.has(victim.uuid)) return refuse("argumentsOrBusy");
  const source = token.actor;
  const protection = iceBlockFor(victim);
  let receipt = structuredClone(token.getFlag("azeroth-rpg", ABERRATION_DEATH_FLAG) ?? null);
  const allowed = () => gmHere() && valid() && token.actor === source && source?.system?.health?.value === 0
    && fromUuidSync(token.uuid) === token && fromUuidSync(victim.uuid) === victim && victim !== source
    && iceBlockFor(victim) === protection
    && source.system?.creatureAbilities?.some(row => row.name === ABERRATION_DEATH.name)
    && receipt?.state === "claimed" && receipt.actorUuid === source.uuid && receipt.tokenUuid === token.uuid
    && same(token.getFlag("azeroth-rpg", ABERRATION_DEATH_FLAG), receipt);
  if (!allowed() || !(victim.system?.health?.value > 0)) return refuse("sourceOrTarget");
  const targets = receipt.targets ?? {};
  // Foundry expands dots in nested flag keys. Recognize both older shapes so
  // changing the storage key cannot replay an uncertain previous delivery.
  const targetKey = encodeURIComponent(victim.uuid).replaceAll(".", "%2E");
  if (typeof targets !== "object" || Array.isArray(targets)) return refuse("claimedTarget");
  const legacyTarget = victim.uuid.split(".").reduce((row, key) => row && Object.hasOwn(row, key) ? row[key] : undefined, targets);
  if (Object.hasOwn(targets, targetKey) || Object.hasOwn(targets, victim.uuid) || legacyTarget !== undefined) return refuse("claimedTarget");
  const snapshot = structuredClone(victim.poolSnapshot());
  let plan = aberrationManaBurnPlan({ pools: snapshot, itemId, resisted, npc: victim.type === "npc" });
  if (!plan) return refuse("pool");
  if (protection) plan = { ...plan, drained: 0, damage: 0, change: null };
  const save = async row => {
    if (!allowed()) return false;
    receipt = { ...receipt, targets: { ...receipt.targets, [targetKey]: structuredClone(row) } };
    await token.setFlag("azeroth-rpg", ABERRATION_DEATH_FLAG, receipt);
    return allowed();
  };
  const row = { phase: "draining", itemId, resisted, plannedDrain: plan.drained };
  busy.add(token.uuid); busy.add(victim.uuid);
  try {
    if (!await save(row) || !same(victim.poolSnapshot(), snapshot)) return refuse("changed");
    if (plan.change) await victim.updatePool([plan.change]);
    const expected = snapshot.map(pool => plan.change && pool.kind === "power" && pool.itemId === plan.change.itemId
      ? { ...pool, value: plan.change.value } : pool);
    if (!allowed() || !same(victim.poolSnapshot(), expected)) return refuse("unconfirmedDrain");
    row.drained = plan.drained; row.damage = plan.damage; row.phase = "drained";
    if (!await save(row)) return refuse("record");
    if (plan.damage > 0) {
      if (!(victim.system?.health?.value > 0)) return refuse("fallenTarget");
      row.phase = "damaging";
      if (!await save(row)) return refuse("record");
      const lines = await strikeFromArea({ actor: victim, caster: source,
        spell: { name: ABERRATION_DEATH.name, school: ABERRATION_DEATH.school,
          feature: true, isSpell: false, takesSpellpower: false },
        damage: { rating: plan.damage, school: ABERRATION_DEATH.school } });
      if (!Array.isArray(lines) || !lines.length || !allowed()) return refuse("unconfirmedDamage");
      row.lines = lines;
    }
    row.phase = "finished";
    if (!await save(row)) return refuse("record");
    return { ok: true, result: row };
  } catch (error) {
    console.warn("azeroth-rpg | Arcane Aberration Mana Burn", error);
    return refuse("writeUncertain");
  } finally { busy.delete(token.uuid); busy.delete(victim.uuid); }
}
