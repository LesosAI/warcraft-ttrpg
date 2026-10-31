/** Compel owns a distinct Charmed carrier: a generic condition cannot prove
 * command or be removed with the caster's Sustain without affecting others. */
import { sustainedSpellLive } from "./sustained-spells.mjs";
import { cleanEscape } from "../rules/escapes.mjs";

const SCOPE = "azeroth-rpg";
const queues = new Map();

/** Backfill only missing repeat records from an exact original cast. This is
 * idempotent metadata repair, never a new charm or a current-stat DC guess. */
export async function repairCompelEscapes(actor) {
  const result = { repaired: 0, unresolved: 0 };
  const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
  if (!writer() || !actor?.isOwner) return result;
  for (const effect of [...(actor.effects ?? [])]) {
    const f = effect.flags?.[SCOPE];
    if (f?.identifier !== "compel" || effect.disabled || effect.active === false
      || !effect.statuses?.has("charmed")) continue;
    if (cleanEscape(f.escape)?.identifier === "compel") continue;
    const card = game.messages?.get(f.messageId), cast = card?.flags?.[SCOPE];
    if (f.escape != null || cast?.kind !== "spell" || cast.identifier !== "compel" || cast.success !== true
      || !f.cast || cast.cast !== f.cast || cast.caster !== effect.origin || cast.sustained !== true
      || !Number.isSafeInteger(cast.spellDC) || cast.spellDC <= 0 || !sustainedSpellLive(effect)) {
      result.unresolved++; continue;
    }
    const escape = cleanEscape({ identifier: "compel", condition: "charmed", on: "turnEnd", resilience: "spirit",
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
  if (!Array.isArray(targets) || targets.length !== 1) return null;
  const row = targets[0];
  let actor;
  if (row?.sceneId || row?.tokenId) {
    if (!row.sceneId || !row.tokenId) return null;
    actor = game.scenes?.get(row.sceneId)?.tokens?.get(row.tokenId)?.actor;
    if (!actor || actor.id !== row.actorId) return null;
  } else actor = row?.actorId ? game.actors?.get(row.actorId) : null;
  return actor?.system?.creatureType === "demon" ? actor : null;
}

export async function layCompel(actor, message, timing = {}, result = null) {
  const key = actor?.uuid;
  const run = async () => {
    const f = message?.flags?.[SCOPE];
    if (!actor?.isOwner || actor.system?.creatureType !== "demon" || f?.identifier !== "compel"
      || f.kind !== "spell" || f.success !== true || f.sustained !== true || !f.cast || !f.caster) return null;
    // The parent card records resistance after its effects land. Read the
    // actual linked result now, not the parent's not-yet-written summary.
    const rolled = result?.flags?.[SCOPE];
    if (rolled?.kind !== "resilience" || rolled.resistOf?.messageId !== message.id
      || rolled.resistOf.actorId !== actor.id || result.rolls?.[0]?.outcome?.success !== false) return null;
    const flags = { identifier: "compel", cast: f.cast, sustained: true, spell: f.spellUuid ?? null,
      spellName: f.spellName ?? "Compel", messageId: message.id };
    if (Number.isSafeInteger(f.spellDC) && f.spellDC > 0) flags.escape = cleanEscape({
      identifier: "compel", condition: "charmed", on: "turnEnd", resilience: "spirit",
      dc: f.spellDC, by: f.caster, source: f.spellName ?? "Compel", cast: f.cast
    });
    const source = { origin: f.caster, flags: { [SCOPE]: flags } };
    if (!sustainedSpellLive(source)) return null;
    const existing = [...actor.effects].find(e => e.origin === f.caster && e.flags?.[SCOPE]?.cast === f.cast
      && e.flags[SCOPE].identifier === "compel" && e.statuses?.has("charmed"));
    if (existing) return existing;
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      ...timing, ...source, name: f.spellName ?? "Compel", img: f.spellImg ?? "icons/svg/sleep.svg",
      description: f.effectHTML ?? "", statuses: ["charmed"], system: { changes: [] }
    }]);
    return effect ?? null;
  };
  const task = (queues.get(key) ?? Promise.resolve()).then(run, run);
  queues.set(key, task);
  try { return await task; } finally { if (queues.get(key) === task) queues.delete(key); }
}
