import { SPELL_USES_FLAG, spellLimit, spellUsesRemaining, spendSpellUse, resetSpellUses } from "../rules/spell-limits.mjs";

export const SPELL_LIMIT_QUERY = "azeroth-rpg.spellRestUse";
const queues = new Map();
const limitFor = (actor, spell) => spellLimit({ type: actor?.type, spell, talents: actor?.takenTalents?.() ?? [] });
const words = key => game.i18n.localize(`AZEROTH.SpellLimit.${key}`);

export function spellLimitRefusal(actor, spell) {
  const limit = limitFor(actor, spell);
  return limit && spellUsesRemaining(limit, actor.getFlag?.("azeroth-rpg", SPELL_USES_FLAG)) < 1
    ? game.i18n.format("AZEROTH.SpellLimit.Exhausted", { name: spell.name, rest: words(limit.per) }) : null;
}

/** Active GM serializes both casting and rests, including requests from two owners. */
export async function spellLimitQueryHandler({ actorUuid, spellUuid, action = null, rest = null } = {}, { user } = {}) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error(words("NeedGM"));
  const actor = await fromUuid(actorUuid);
  if (!actor?.testUserPermission(user, "OWNER")) throw new Error(words("NotYours"));
  if (rest && !["short", "long"].includes(rest)) throw new Error(words("Invalid"));
  const spell = rest ? null : await fromUuid(spellUuid);
  if (!rest && spell?.type !== "spell") throw new Error(words("Invalid"));
  const run = async () => {
    const uses = actor.getFlag("azeroth-rpg", SPELL_USES_FLAG) ?? {};
    if (rest) {
      await actor.setFlag("azeroth-rpg", SPELL_USES_FLAG, resetSpellUses(uses, rest));
      return { ok: true };
    }
    const limit = limitFor(actor, spell);
    const next = limit ? spendSpellUse(limit, uses) : null;
    if (limit && !next) return { ok: false, reason: spellLimitRefusal(actor, spell) };
    if (!(await game.system.azeroth.workflows.spendTurnBudget(actor, action))) return { ok: false };
    // An attempted casting consumes the use, as it consumes Mana even on a failed Test.
    if (next) await actor.setFlag("azeroth-rpg", SPELL_USES_FLAG, next);
    return { ok: true };
  };
  const waiting = queues.get(actor.uuid) ?? Promise.resolve();
  const result = waiting.then(run, run);
  queues.set(actor.uuid, result);
  try { return await result; } finally { if (queues.get(actor.uuid) === result) queues.delete(actor.uuid); }
}

async function request(payload) {
  const gm = game.users.activeGM;
  if (!gm) throw new Error(words("NeedGM"));
  return gm.id === game.user.id ? spellLimitQueryHandler(payload, { user: game.user })
    : gm.query(SPELL_LIMIT_QUERY, payload);
}

/** Every choice/refusal precedes this combined turn-budget and limited-use payment. */
export async function spendSpellBudget(actor, spell, action, spend = game.system.azeroth.workflows.spendTurnBudget) {
  if (!limitFor(actor, spell)) return spend(actor, action);
  const result = await request({ actorUuid: actor.uuid, spellUuid: spell.uuid, action });
  if (result.reason) ui.notifications?.warn(result.reason);
  return result.ok;
}

export async function restoreSpellUses(actor, event) {
  if (!["short", "long"].includes(event) || !Object.keys(actor.getFlag("azeroth-rpg", SPELL_USES_FLAG) ?? {}).length) return;
  await request({ actorUuid: actor.uuid, rest: event });
}
