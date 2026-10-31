import { crushridgeExtraAttack } from "../rules/crushridge.mjs";

export const CRUSHRIDGE_ATTACKS = "crushridgeExtraAttacks";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** The GM's attack adapter supplies current scene/weapon/rage facts and the
 * ordinary attack roller. Call only after the user confirms the extra attack.
 * A persisted claim is a spent use even if the later roll is cancelled. */
export async function runCrushridgeExtraAttack({ combatant, inspect, roll } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !combatant?.uuid || typeof inspect !== "function" || typeof roll !== "function") return refuse("invalid");
  if (busy.has(combatant.uuid)) return refuse("busy");
  busy.add(combatant.uuid);
  const read = () => combatant.getFlag("azeroth-rpg", CRUSHRIDGE_ATTACKS) ?? [];
  const current = async () => {
    if (!writer() || game.combats?.get(combatant.parent?.id)?.combatants?.get(combatant.id) !== combatant) return null;
    const facts = await inspect();
    if (!writer() || !facts || facts.combatantId !== combatant.id || facts.combat?.id !== combatant.parent.id
      || facts.tokenUuid !== combatant.token?.uuid) return null;
    return facts;
  };
  const save = async records => {
    if (!writer()) throw new Error("Crushridge writer changed");
    await combatant.setFlag("azeroth-rpg", CRUSHRIDGE_ATTACKS, records);
    if (!writer() || JSON.stringify(read()) !== JSON.stringify(records)) throw new Error("Crushridge receipt unconfirmed");
  };
  try {
    const records = read();
    if (!Array.isArray(records)) return refuse("receiptInvalid");
    if (records.some(row => row.stage !== "complete" && row.stage !== "cancelled")) return refuse("reconcile");
    const facts = await current();
    if (!facts) return refuse("changed");
    const judged = crushridgeExtraAttack({ ...facts, spent: records });
    if (!judged.ok) return judged;
    const claim = { ...judged.claim, stage: "claimed", attackId: null };
    await save([...records, claim]);
    // Revalidate after the write without counting our own claim as a rival use.
    const valid = async () => {
      const latest = await current();
      if (!latest) return false;
      const next = crushridgeExtraAttack({ ...latest, spent: records });
      return next.ok && JSON.stringify(next.claim) === JSON.stringify(judged.claim)
        && JSON.stringify(read()) === JSON.stringify([...records, claim]);
    };
    if (!await valid()) {
      await save([...records, { ...claim, stage: "cancelled", reason: "changed" }]);
      return refuse("changed");
    }
    // Adapter must call valid again immediately before its ordinary roll.
    const result = await roll({ valid, claim: judged.claim });
    if (typeof result?.attackId !== "string" || !result.attackId) return refuse("unresolved");
    await save([...records, { ...claim, stage: "complete", attackId: result.attackId }]);
    return { ok: true, attackId: result.attackId };
  } catch (error) {
    console.warn("azeroth-rpg | Crushridge extra attack needs reconciliation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(combatant.uuid); }
}
