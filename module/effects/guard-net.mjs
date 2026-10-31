import { guardNetEffect, GUARD_NET } from "../rules/guard-net.mjs";
const RECEIPTS = "guardNetApplications", busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** Called only after a confirmed failed Reflex Test. Saved target receipts
 * prevent an uncertain creation from being repeated, even after escape. */
export async function applyGuardNet({ source, target, eventId, valid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const data = guardNetEffect({ sourceUuid: source?.uuid, eventId });
  if (!data || !target?.uuid || typeof valid !== "function" || !writer()) return refuse("invalid");
  if (busy.has(target.uuid)) return refuse("busy");
  busy.add(target.uuid);
  const check = () => writer() && fromUuidSync(source.uuid) === source && fromUuidSync(target.uuid) === target
    && source.system?.health?.value > 0 && target.system?.health?.value > 0
    && !(target.system?.conditionImmunities ?? []).includes(GUARD_NET.condition) && valid();
  try {
    if (!check()) return refuse("changed");
    const records = target.getFlag("azeroth-rpg", RECEIPTS) ?? [];
    if (!Array.isArray(records)) return refuse("receiptInvalid");
    if (records.some(row => row?.eventId === eventId && row?.sourceUuid === source.uuid)) return refuse("alreadyClaimed");
    if (records.some(row => row?.stage !== "complete")) return refuse("reconcile");
    const claim = { eventId, sourceUuid: source.uuid, stage: "claimed" };
    await target.setFlag("azeroth-rpg", RECEIPTS, [...records, claim]);
    if (!check() || JSON.stringify(target.getFlag("azeroth-rpg", RECEIPTS)) !== JSON.stringify([...records, claim])) return refuse("claimUnconfirmed");
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect?.id || !values(target.effects).includes(effect)
      || effect.flags?.["azeroth-rpg"]?.guardNet?.eventId !== eventId) return refuse("effectUnconfirmed");
    if (!check()) {
      // If immunity or target eligibility changed during creation, remove only
      // this carrier. Its uncertain receipt remains held for reconciliation.
      if (writer() && fromUuidSync(target.uuid) === target && values(target.effects).includes(effect)) await effect.delete();
      return refuse("changed");
    }
    const complete = [...records, { ...claim, stage: "complete", effectId: effect.id }];
    await target.setFlag("azeroth-rpg", RECEIPTS, complete);
    if (!check() || JSON.stringify(target.getFlag("azeroth-rpg", RECEIPTS)) !== JSON.stringify(complete)) return refuse("receiptUnconfirmed");
    return { ok: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Guard Net application needs reconciliation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(target.uuid); }
}
