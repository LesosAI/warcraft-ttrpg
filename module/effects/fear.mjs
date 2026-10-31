import { cleanEscape } from "../rules/escapes.mjs";
import { fearEndsOnDamage } from "../rules/fear.mjs";

const SCOPE = "azeroth-rpg";
const pending = new Map();

function queued(actor, run) {
  const key = actor.uuid;
  const next = (pending.get(key) ?? Promise.resolve()).then(run, run);
  pending.set(key, next);
  const clear = () => { if (pending.get(key) === next) pending.delete(key); };
  next.then(clear, clear);
  return next;
}

/** Called after damage is written; temporary Health absorbed is damage too. */
export function endFearOnDamage(actor, by, amount) {
  if (!actor?.isOwner) return Promise.resolve(0);
  return queued(actor, async () => {
    if (!actor.isOwner) return 0;
    const ids = [...(actor.effects ?? [])]
      .filter(e => fearEndsOnDamage(e.flags?.[SCOPE]?.fear, by?.uuid ?? null, amount)).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  });
}

/** Fear carries its own condition so a passed Test ends only this casting. */
export function layFear(actor, { escape, spellUuid, spellImg, timing } = {}) {
  const record = cleanEscape(escape);
  if (!actor?.isOwner || record?.source !== "Fear" || record.condition !== "frightened"
    || record.on !== "turnEnd" || record.resilience !== "spirit" || !record.by || !record.cast
    || (actor.system?.conditionImmunities ?? []).includes("frightened")) return Promise.resolve(null);
  const run = async () => {
    if (!actor.isOwner || (actor.system?.conditionImmunities ?? []).includes("frightened")) return null;
    const mine = [...(actor.effects ?? [])].filter(e => e.flags?.[SCOPE]?.fear?.by === record.by);
    const same = mine.find(e => e.flags[SCOPE].fear.cast === record.cast);
    if (same) return same;
    if (mine.length) await actor.deleteEmbeddedDocuments("ActiveEffect", mine.map(e => e.id));
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: record.source, img: spellImg || "icons/svg/terror.svg", origin: record.by,
      statuses: ["frightened"], ...timing,
      flags: { [SCOPE]: { spell: spellUuid ?? null, identifier: "fear", cast: record.cast,
        escape: record, fear: { by: record.by, cast: record.cast } } }
    }]);
    return effect ?? null;
  };
  return queued(actor, run);
}
