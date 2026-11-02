/** Compel owns a distinct Charmed carrier: a generic condition cannot prove
 * command or be removed with the caster's Sustain without affecting others. */
import { sustainedSpellLive } from "./sustained-spells.mjs";
import { cleanEscape } from "../rules/escapes.mjs";
import { nextEnslaveMinute } from '../rules/enslave-clock.mjs';

const SCOPE = "azeroth-rpg";
const queues = new Map();

export function dominationDeliveryViews(actor) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !actor || fromUuidSync(actor.uuid) !== actor) return [];
  const receipts = actor.getFlag(SCOPE, 'dominationDeliveries') ?? [];
  if (!Array.isArray(receipts)) return [];
  return receipts.filter(row => row?.state === 'pending').map(row => structuredClone({
    actorUuid: actor.uuid, casterUuid: row.caster, cast: row.cast, receipts,
    sustaining: fromUuidSync(row.caster)?.getFlag(SCOPE, 'sustaining') ?? null,
    effects: [...actor.effects].map(effect => effect.toObject?.() ?? {
      id: effect.id, origin: effect.origin, flags: effect.flags, disabled: effect.disabled, statuses: [...(effect.statuses ?? [])]
    })
  }));
}

export async function reviewDominationDelivery({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid);
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || acknowledged !== true || !actor) return { ok: false, reason: 'authority' };
  if (queues.has(actorUuid)) return { ok: false, reason: 'busy' };
  const run = async () => {
    const current = dominationDeliveryViews(actor).find(row => row.cast === expected?.cast && row.casterUuid === expected?.casterUuid);
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, reason: 'changed' };
    const receipt = current.receipts.find(row => row.cast === current.cast && row.caster === current.casterUuid);
    if (receipt.writerId !== game.user.id && game.users.get?.(receipt.writerId)?.active) return { ok: false, reason: 'writerActive' };
    receipt.state = 'complete'; receipt.reviewed = true; receipt.reviewedBy = game.user.id;
    await actor.setFlag(SCOPE, 'dominationDeliveries', current.receipts);
    return { ok: true };
  };
  const task = Promise.resolve().then(run); queues.set(actorUuid, task);
  try { return await task; } finally { if (queues.get(actorUuid) === task) queues.delete(actorUuid); }
}

/** Backfill only missing repeat records from an exact original cast. This is
 * idempotent metadata repair, never a new charm or a current-stat DC guess. */
export async function repairCompelEscapes(actor) {
  const result = { repaired: 0, unresolved: 0 };
  const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
  if (!writer() || !actor?.isOwner) return result;
  for (const effect of [...(actor.effects ?? [])]) {
    const f = effect.flags?.[SCOPE];
    if (!["compel", "dominate"].includes(f?.identifier) || effect.disabled || effect.active === false
      || !effect.statuses?.has("charmed")) continue;
    if (cleanEscape(f.escape)?.identifier === f.identifier) continue;
    const card = game.messages?.get(f.messageId), cast = card?.flags?.[SCOPE];
    if (f.escape != null || cast?.kind !== "spell" || cast.identifier !== f.identifier || cast.success !== true
      || !f.cast || cast.cast !== f.cast || cast.caster !== effect.origin || cast.sustained !== true
      || !Number.isSafeInteger(cast.spellDC) || cast.spellDC <= 0 || !sustainedSpellLive(effect)) {
      result.unresolved++; continue;
    }
    const escape = cleanEscape({ identifier: f.identifier, condition: "charmed", on: "turnEnd", resilience: "spirit",
      dc: cast.spellDC, by: cast.caster, source: cast.spellName ?? "Compel", cast: cast.cast });
    if (!writer() || !actor.isOwner || ![...actor.effects].includes(effect)) continue;
    try {
      await effect.setFlag(SCOPE, "escape", escape);
      if (JSON.stringify(effect.flags?.[SCOPE]?.escape) === JSON.stringify(escape)) result.repaired++;
      else result.unresolved++;
    } catch { result.unresolved++; }
  }
  return result;
}
/** Resolve the selected demon exactly; a missing scene token must not fall
 * back to its base actor or to a token on the currently viewed scene. */
export function compelTarget(targets) {
  return dominationTarget('compel', null, targets);
}

export function underMindSoothe(target, casterUuid) {
  return Boolean(casterUuid && [...(target?.effects ?? [])].some(effect => !effect.disabled && effect.active !== false
    && effect.origin === casterUuid && effect.flags?.[SCOPE]?.identifier === 'mind-soothe'));
}

export function dominationTarget(identifier, caster, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return null;
  const row = targets[0];
  let actor;
  if (row?.sceneId || row?.tokenId) {
    if (!row.sceneId || !row.tokenId) return null;
    actor = game.scenes?.get(row.sceneId)?.tokens?.get(row.tokenId)?.actor;
    if (!actor || actor.id !== row.actorId) return null;
  } else actor = row?.actorId ? game.actors?.get(row.actorId) : null;
  if (identifier === 'dominate') return actor
    && String(actor.system?.typeMarker ?? '').trim().toLowerCase() !== 'mindless'
    && underMindSoothe(actor, caster?.uuid) ? actor : null;
  return ['compel', 'enslave-demon'].includes(identifier) && actor?.system?.creatureType === "demon" ? actor : null;
}

export async function layCompel(actor, message, timing = {}, result = null) {
  if (message?.flags?.[SCOPE]?.identifier !== "compel") return null;
  return layDomination(actor, message, timing, result);
}

export async function layDomination(actor, message, timing = {}, result = null, valid = () => true) {
  const key = actor?.uuid;
  const run = async () => {
    const f = message?.flags?.[SCOPE];
    const signature = flags => JSON.stringify(['identifier', 'kind', 'success', 'sustained', 'cast', 'caster', 'spellUuid', 'spellDC'].map(key => flags?.[key]));
    const original = signature(f);
    const eligible = () => {
      const deleted = actor?.getFlag?.(SCOPE, 'deletedDomination') ?? [];
      return valid() && actor?.isOwner && signature(message?.flags?.[SCOPE]) === original
        && ['compel', 'dominate', 'enslave-demon'].includes(f?.identifier)
        && (f.identifier === 'dominate' ? String(actor.system?.typeMarker ?? '').trim().toLowerCase() !== 'mindless'
          && underMindSoothe(actor, f.caster) : actor.system?.creatureType === 'demon')
        && f.kind === 'spell' && f.success === true && f.sustained === true && Boolean(f.cast && f.caster)
        && Array.isArray(deleted) && !deleted.some(row => row?.casterUuid === f.caster && row?.cast === f.cast);
    };
    if (!eligible()) return null;
    // Deletion can precede the returning GM's Sustain cleanup. Neither pending
    // nor reviewed deletion evidence permits the old cast to recreate control.
    // The parent card records resistance after its effects land. Read the
    // actual linked result now, not the parent's not-yet-written summary.
    const resistanceMatches = () => {
      const rolled = result?.flags?.[SCOPE], roll = result?.rolls?.[0];
      return rolled?.kind === 'resilience' && rolled.resilience === 'spirit'
        && rolled.resistOf?.messageId === message.id && rolled.resistOf.actorId === actor.id
        && roll?.outcome?.success === false
        && (!Number.isSafeInteger(f.spellDC) || f.spellDC <= 0 || roll.options?.dc === f.spellDC);
    };
    if (!resistanceMatches()) return null;
    const flags = { identifier: f.identifier, cast: f.cast, sustained: true, spell: f.spellUuid ?? null,
      spellName: f.spellName ?? "Compel", messageId: message.id };
    if (Number.isSafeInteger(f.spellDC) && f.spellDC > 0) flags.spellDC = f.spellDC;
    if (["compel", "dominate"].includes(f.identifier) && Number.isSafeInteger(f.spellDC) && f.spellDC > 0) flags.escape = cleanEscape({
      identifier: f.identifier, condition: "charmed", on: "turnEnd", resilience: "spirit",
      dc: f.spellDC, by: f.caster, source: f.spellName ?? "Compel", cast: f.cast
    });
    const source = { origin: f.caster, flags: { [SCOPE]: flags } };
    if (!sustainedSpellLive(source)) return null;
    const existing = [...actor.effects].find(e => e.origin === f.caster && e.flags?.[SCOPE]?.cast === f.cast
      && e.flags[SCOPE].identifier === f.identifier && e.statuses?.has("charmed"));
    if (existing) return existing;
    const receipts = actor.getFlag(SCOPE, 'dominationDeliveries') ?? [];
    if (!Array.isArray(receipts) || receipts.some(row => row?.cast === f.cast && row?.caster === f.caster)) return null;
    const receipt = { cast: f.cast, caster: f.caster, messageId: message.id, state: 'pending', writerId: globalThis.game?.user?.id ?? null };
    const claimed = [...receipts, receipt];
    await actor.setFlag(SCOPE, 'dominationDeliveries', claimed);
    if (!eligible() || JSON.stringify(actor.getFlag(SCOPE, 'dominationDeliveries')) !== JSON.stringify(claimed)
      || !sustainedSpellLive(source) || !resistanceMatches()) return null;
    // Claim persistence may span a world-clock advance. Start the interval at
    // delivery, not before the awaited claim, and never reset an existing cast.
    if (f.identifier === 'enslave-demon') flags.enslaveNextSave = nextEnslaveMinute(globalThis.game?.time?.worldTime);
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      ...timing, ...source, name: f.spellName ?? "Compel", img: f.spellImg ?? "icons/svg/sleep.svg",
      description: f.effectHTML ?? "", statuses: ["charmed"], system: { changes: [] }
    }]);
    if (effect) {
      if (!valid() || !actor.isOwner || JSON.stringify(actor.getFlag(SCOPE, 'dominationDeliveries')) !== JSON.stringify(claimed)) return null;
      await actor.setFlag(SCOPE, 'dominationDeliveries', [...receipts, { ...receipt, state: 'complete', effectId: effect.id }]);
    }
    return effect ?? null;
  };
  const task = (queues.get(key) ?? Promise.resolve()).then(run, run);
  queues.set(key, task);
  try { return await task; } finally { if (queues.get(key) === task) queues.delete(key); }
}
