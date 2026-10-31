import { SPELL_LOCK, spellLockAftermath } from "../rules/spell-lock.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { SPELL_LOCK_WINDOWS } from "./spell-lock-window.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = value => typeof value === "string" && value.trim().length > 0;
const busy = new Set();

/** Resolve only a claim the active GM's cast ledger has marked applying.
 * finishSpellLockWindow owns the durable claim; an uncertain Test or effect
 * acknowledgement leaves that claim unresolved, never automatically retried.
 * The condition gets its own carrier so expiring it cannot shorten or remove
 * another source's Silence. The current cast is already resolved here. */
export async function resolveSpellLockAftermath({ actor, cast, claim, valid,
  rollResilience = null } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!identity(actor?.uuid) || typeof valid !== "function"
    || cast?.casterUuid !== actor.uuid || !spellLockAftermath(claim, cast)) return refuse("invalid");
  const key = `${actor.uuid}:${cast.id}:${claim.reactorUuid}`;
  if (busy.has(key)) return refuse("busy");
  const current = () => {
    if (globalThis.game?.user?.isGM !== true || game.users?.activeGM?.id !== game.user.id
      || fromUuidSync(actor.uuid) !== actor || !valid()) return false;
    const windows = actor.getFlag("azeroth-rpg", SPELL_LOCK_WINDOWS);
    const window = Array.isArray(windows) ? windows.find(row => row.castId === cast.id) : null;
    const index = window?.claims?.findIndex(row => same(row, claim)) ?? -1;
    return window?.casterUuid === actor.uuid && window.stage === "resolving" && index >= 0
      && window.aftermath?.[index]?.reactorUuid === claim.reactorUuid
      && window.aftermath[index].stage === "applying";
  };
  const owned = effect => {
    const mark = effect.flags?.["azeroth-rpg"]?.spellLock;
    return mark?.version === 1 && mark.castId === cast.id && mark.casterUuid === actor.uuid
      && mark.reactorUuid === claim.reactorUuid;
  };
  if (!current()) return refuse("claim");
  if (values(actor.effects).some(owned)) return refuse("alreadyApplied");
  busy.add(key);
  try {
    const roll = rollResilience ?? (await import("../dice/workflows.mjs")).rollResilience;
    if (!current()) return refuse("changed");
    const card = await roll({ actor, resilience: SPELL_LOCK.resilience, dc: SPELL_LOCK.dc, subtitle: SPELL_LOCK.name });
    if (!current()) return refuse("changed");
    const resistancePassed = card?.rolls?.[0]?.outcome?.success;
    if (typeof resistancePassed !== "boolean" || !identity(card?.uuid)) return refuse("resistanceUncertain");
    const silenceImmune = (actor.system?.conditionImmunities ?? []).includes("silenced");
    const result = { ok: true, resistancePassed, silenceImmune, resistanceCardUuid: card.uuid, effectId: null };
    if (!spellLockAftermath(claim, cast, result).silence) return result;
    // Verify v14's clock input rather than letting an absent world clock turn
    // a six-second condition into a carrier whose start time is guessed.
    if (!Number.isSafeInteger(game.time?.worldTime) || game.time.worldTime < 0) return refuse("clock");
    const span = untilEndOfNextTurnOrRound(actor);
    if (!current()) return refuse("changed");
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Spell Lock — Silenced",
      img: globalThis.CONFIG?.statusEffects?.find(row => row.id === "silenced")?.img ?? "icons/svg/aura.svg",
      origin: claim.reactorUuid,
      description: "You are Silenced until the end of your next turn (6 seconds outside combat). This does not change the cast that triggered Spell Lock.",
      transfer: false, statuses: ["silenced"], ...span,
      flags: { "azeroth-rpg": { identifier: "spell-lock", laidBy: [claim.reactorUuid],
        spellLock: { version: 1, castId: cast.id, casterUuid: actor.uuid, reactorUuid: claim.reactorUuid,
          resistanceCardUuid: card.uuid } } }
    }]);
    if (!current() || !identity(effect?.id) || !values(actor.effects).includes(effect) || !owned(effect)
      || !effect.statuses?.has("silenced") || effect.disabled === true || effect.active === false
      || effect.isSuppressed === true) return refuse("effectUncertain");
    return { ...result, effectId: effect.id };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(key); }
}
