import { CRUSHRIDGE, crushridgeRage, crushridgeRageActive } from "../rules/crushridge.mjs";
export const CRUSHRIDGE_RAGE = "crushridgeRage";
const RECEIPTS = "crushridgeRageEvents", queues = new Map();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

export function activeCrushridgeRage(actor, now = globalThis.game?.time?.worldTime) {
  const held = values(actor?.effects).filter(effect => effect.origin === actor.uuid
    && effect.flags?.["azeroth-rpg"]?.identifier === "crushridge-rage"
    && effect.active !== false && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
    && crushridgeRageActive(effect.flags?.["azeroth-rpg"]?.[CRUSHRIDGE_RAGE], now));
  return held.length ? held[0].flags["azeroth-rpg"][CRUSHRIDGE_RAGE] : null;
}

/** Apply after the death event's recipient review. The durable event receipt
 * precedes the effect write, preventing replay even after the effect expires.
 * Partial writes require reconciliation instead of extending rage on retry. */
export async function applyCrushridgeRage({ actor, eventId, valid, source = null, startedAt } = {}) {
  if (!actor?.uuid || typeof eventId !== "string" || !eventId || typeof valid !== "function") return { ok: false, reason: "invalid" };
  const work = async () => {
    const check = () => writer() && fromUuidSync(actor.uuid) === actor && valid()
      && actor.type === "npc" && actor.system?.health?.value > 0
      && actor.system?.creatureAbilities?.some(row => row.name === CRUSHRIDGE.recipientAbility);
    if (!check()) return { ok: false, reason: "changed" };
    const receipts = actor.getFlag("azeroth-rpg", RECEIPTS) ?? [];
    if (!Array.isArray(receipts)) return { ok: false, reason: "receiptInvalid" };
    if (receipts.some(row => row.eventId === eventId)) return { ok: false, reason: "alreadyClaimed" };
    if (receipts.some(row => row.stage !== "complete")) return { ok: false, reason: "reconcile" };
    const held = values(actor.effects).filter(effect => effect.flags?.["azeroth-rpg"]?.[CRUSHRIDGE_RAGE]);
    if (held.length > 1 || held.some(effect => effect.origin !== actor.uuid
      || effect.flags?.["azeroth-rpg"]?.identifier !== "crushridge-rage")) return { ok: false, reason: "conflictingCarriers" };
    const now = game.time?.worldTime, observedAt = startedAt ?? now;
    if (!Number.isInteger(now) || !Number.isInteger(observedAt) || observedAt > now
      || !crushridgeRageActive(crushridgeRage(observedAt), now)) return { ok: false, reason: "clock" };
    // Reviewing an older death must neither restart its clock nor shorten a
    // newer rage already on this linked actor.
    const existing = activeCrushridgeRage(actor, now);
    const rage = crushridgeRage(Math.max(observedAt, existing?.startedAt ?? observedAt));
    const claim = { eventId, stage: "claimed", time: now };
    try {
      await actor.setFlag("azeroth-rpg", RECEIPTS, [...receipts, claim]);
      if (!check() || JSON.stringify(actor.getFlag("azeroth-rpg", RECEIPTS)) !== JSON.stringify([...receipts, claim])) return { ok: false, reason: "claimUnconfirmed" };
      const data = { name: CRUSHRIDGE.recipientAbility, img: "icons/skills/melee/strike-hammer-destructive-orange.webp",
        origin: actor.uuid, disabled: false, transfer: false, system: { changes: [] },
        start: { time: rage.startedAt }, duration: { value: CRUSHRIDGE.seconds, units: "seconds", expired: false },
        description: "Melee attacks gain +2 DR. On your turn, you may make one additional melee attack. Further fallen kin refresh this rage without stacking its benefits.",
        flags: { "azeroth-rpg": { identifier: "crushridge-rage", [CRUSHRIDGE_RAGE]: { ...rage, eventId } } } };
      let effect = held[0];
      if (effect) {
        if (!values(actor.effects).includes(effect)) return { ok: false, reason: "carrierChanged" };
        await effect.update(data);
      } else [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      if (!check() || !effect?.id || !values(actor.effects).includes(effect)
        || effect.flags?.["azeroth-rpg"]?.[CRUSHRIDGE_RAGE]?.eventId !== eventId || effect.disabled) return { ok: false, reason: "effectUnconfirmed" };
      const finished = [...receipts, { ...claim, stage: "complete", effectId: effect.id }];
      await actor.setFlag("azeroth-rpg", RECEIPTS, finished);
      if (!check() || JSON.stringify(actor.getFlag("azeroth-rpg", RECEIPTS)) !== JSON.stringify(finished)) return { ok: false, reason: "receiptUnconfirmed" };
      // Feedback follows the durable receipt. A failed announcement must never
      // turn a confirmed benefit into a retry that refreshes its duration.
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: "<p><strong>Fallen-Kin Rage</strong></p><p>The Warmonger roars at the loss of its kin. For 120 seconds from the witnessed death, its melee attacks gain +2 DR, and it can make one additional melee attack on its turn. Further losses refresh this rage without stacking its benefits. A delayed review does not restart the duration.</p>",
          flags: { "azeroth-rpg": { kind: "ability", eventId,
            source: source ?? null,
            featureKey: "ability:crushridge-fallen-kin-rage",
            casting: false, success: true, targets: [] } } });
      } catch (error) {
        console.warn("azeroth-rpg | Crushridge rage applied; feedback unavailable", error);
      }
      return { ok: true, effectId: effect.id };
    } catch (error) {
      console.warn("azeroth-rpg | Crushridge rage needs reconciliation", error);
      return { ok: false, reason: "writeUncertain" };
    }
  };
  const pending = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(actor.uuid, pending);
  try { return await pending; }
  finally { if (queues.get(actor.uuid) === pending) queues.delete(actor.uuid); }
}
