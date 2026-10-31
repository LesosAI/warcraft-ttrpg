import { openSpellLockWindow, finishSpellLockWindow, SPELL_LOCK_WINDOWS } from "./spell-lock-window.mjs";
import { collectSpellLockReactions } from "./spell-lock-reactions.mjs";
import { postSpellLockResult } from "./spell-lock-feedback.mjs";

export const SPELL_LOCK_QUERY = "azeroth-rpg.spellLock";
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const identity = value => typeof value === "string" && value.trim().length > 0;
const refuse = reason => ({ ok: false, reason });

/** Resolve the declared Test from current documents, not a client-provided
 * name or automation object. Gate Tests belong to an enclosing operation;
 * their final card must carry the same cast marker as ordinary Tests. */
function testExists(actor, test) {
  if (test?.kind === "gate") return true;
  if (test?.kind === "spell" || test?.kind === "feature") {
    const item = identity(test.itemUuid) ? fromUuidSync(test.itemUuid) : null;
    if (item?.documentName !== "Item" || item.type !== test.kind) return false;
    return test.kind === "spell" || (item.parent === actor && item.system?.casting === true);
  }
  if (test?.kind === "ability" && ["creatureAbilities", "bossActions"].includes(test.list)
    && Number.isInteger(test.index) && test.index >= 0) return actor.system?.[test.list]?.[test.index]?.automation?.casting === true;
  return false;
}

/** A result card is completion evidence only when both the card and its
 * evaluated Casting Test record this window and its frozen Bane count.
 * An unrelated or merely declared cast cannot trigger post-cast Silence. */
function completed(actor, castId, message, user) {
  const windows = actor.getFlag("azeroth-rpg", SPELL_LOCK_WINDOWS);
  const window = Array.isArray(windows) ? windows.find(row => row.castId === castId) : null;
  if (!window || window.casterUuid !== actor.uuid || window.requesterId !== user.id
    || !Number.isInteger(window.banes) || window.banes < 0) return false;
  if (message?.documentName !== "ChatMessage" || fromUuidSync(message.uuid) !== message
    || !message.author || !(message.author.id === user.id || message.author.isGM
      || (user.isGM && actor.testUserPermission(message.author, "OWNER")))) return false;
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.spellLockCaster !== actor.uuid || !Array.isArray(flags.spellLockCasts)
    || flags.spellLockCasts.filter(id => id === castId).length !== 1) return false;
  const matching = [...(message.rolls ?? [])].filter(roll => roll.options?.spellLock?.castId === castId);
  if (matching.length !== 1) return false;
  const roll = matching[0];
  return roll.options?.azeroth === true && roll.options.kind === "casting"
    && roll.options.spellLock.banes === window.banes && Number.isFinite(roll.options.banes)
    && roll.options.banes >= window.banes && Number.isFinite(roll.total)
    && typeof roll.outcome?.success === "boolean";
}

export async function spellLockQueryHandler(data = {}, { user } = {}) {
  const { phase, actorUuid, castId, issuedAt, source = null, test, messageUuid } = data;
  if (!gmHere() || !identity(user?.id) || !identity(actorUuid) || !/^[A-Za-z0-9]{16}$/.test(castId ?? "")
    || !Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 5000 || Date.now() >= issuedAt + 600000
    || !["open", "finish"].includes(phase)) return refuse("request");
  const actor = await fromUuid(actorUuid);
  const owner = () => gmHere() && actor?.documentName === "Actor" && fromUuidSync(actorUuid) === actor
    && actor.testUserPermission(user, "OWNER");
  if (!owner()) return refuse("owner");
  if (phase === "open") {
    const origin = source ? game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId) : null;
    const valid = () => owner() && actor.system?.health?.value > 0 && testExists(actor, test)
      && (!source || (origin?.actor === actor && game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId) === origin));
    if (!valid()) return refuse("testOrSource");
    return openSpellLockWindow({ actor, castId, requesterId: user.id, validate: valid,
      collect: args => collectSpellLockReactions({ ...args, actor, source }) });
  }
  const message = identity(messageUuid) ? await fromUuid(messageUuid) : null;
  const valid = () => owner() && completed(actor, castId, message, user);
  if (!valid()) return refuse("completion");
  const result = await finishSpellLockWindow({ actor, castId, requesterId: user.id, validate: valid });
  if (result.ok && result.aftermath?.length) {
    try {
      if (!await postSpellLockResult({ actor, castId })) throw new Error("Missing result feedback");
    } catch {
      globalThis.ui?.notifications?.warn("Spell Lock resolved, but its result message could not be confirmed. Its effects are unchanged.");
    }
  }
  return result;
}

async function request(data) {
  try {
    if (gmHere()) return await spellLockQueryHandler(data, { user: game.user });
    const gm = game.users?.activeGM;
    if (!gm) return refuse("noGM");
    return await gm.query(SPELL_LOCK_QUERY, data, { timeout: 180000 }) ?? refuse("requestUncertain");
  } catch { return refuse("requestUncertain"); }
}

/** The caller must await ok before building the roll and stamp the returned
 * castId/banes on roll.options.spellLock. Failure is not permission to roll. */
export async function requestSpellLockWindow({ actor, source = null, test } = {}) {
  return request({ phase: "open", actorUuid: actor?.uuid, castId: foundry.utils.randomID(), issuedAt: Date.now(), source, test });
}

/** The enclosing workflow adds spellLockCaster and spellLockCasts to its
 * completed result card, then calls this once for each captured Test. */
export async function completeSpellLockWindow({ actor, castId, message } = {}) {
  return request({ phase: "finish", actorUuid: actor?.uuid, castId, issuedAt: Date.now(), messageUuid: message?.uuid });
}
