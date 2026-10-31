import { completeSpellLockWindow } from "./spell-lock-query.mjs";

/** Publish nested Casting Tests on the enclosing operation's completed card,
 * then resolve their aftermath. Gate rolls never finish their own windows.
 * Existing primary-cast markers and unrelated rolls are preserved. */
export async function completeSpellLockGates({ actor, rolls = [], message,
  complete = completeSpellLockWindow } = {}) {
  const gates = rolls.filter(roll => roll?.options?.spellLock);
  if (!gates.length) return { ok: true, completed: [] };
  const completed = [];
  const refuse = reason => {
    globalThis.ui?.notifications?.warn("The operation resolved, but a casting reaction could not be confirmed. Check the reaction records; do not repeat completed effects.");
    return { ok: false, reason, completed };
  };
  if (!actor?.uuid || !message?.uuid || typeof message.update !== "function") return refuse("message");
  const ids = gates.map(roll => roll.options.spellLock.castId);
  if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) return refuse("duplicate");
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  if (flags.spellLockCaster && flags.spellLockCaster !== actor.uuid) return refuse("caster");
  const held = [...(message.rolls ?? [])], additions = [];
  for (const gate of gates) {
    const matches = held.filter(roll => roll.options?.spellLock?.castId === gate.options.spellLock.castId);
    if (matches.length > 1) return refuse("duplicate");
    if (!matches.length) additions.push(gate);
    else if (matches[0].options.spellLock.banes !== gate.options.spellLock.banes) return refuse("rollChanged");
  }
  try {
    const update = { "flags.azeroth-rpg.spellLockCaster": actor.uuid,
      "flags.azeroth-rpg.spellLockCasts": [...new Set([...(flags.spellLockCasts ?? []), ...ids])] };
    if (additions.length) update.rolls = [...held, ...additions].map(roll => roll.toJSON?.() ?? roll);
    await message.update(update);
    for (const castId of ids) {
      const result = await complete({ actor, castId, message });
      if (!result?.ok) return refuse("aftermathUncertain");
      completed.push(castId);
    }
    return { ok: true, completed };
  } catch { return refuse("writeUncertain"); }
}
