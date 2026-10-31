import { reviewCrushridgeDeath } from "./crushridge-review.mjs";
import { applyCrushridgeRage } from "./crushridge-rage.mjs";
export const CRUSHRIDGE_DEATH = "crushridgeDeath";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Resolve only a persisted pending event. Applying/uncertain events are
 * deliberately not replayed; their saved results support GM reconciliation. */
export async function resolveCrushridgeDeath({ source, choose } = {}) {
  if (!writer() || !source?.uuid || typeof choose !== "function") return { ok: false, reason: "invalid" };
  if (busy.has(source.uuid)) return { ok: false, reason: "busy" };
  busy.add(source.uuid);
  const read = () => source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH);
  const initial = read();
  const validEvent = () => writer() && game.scenes?.get(source.parent?.id)?.tokens?.get(source.id) === source
    && read()?.eventId === initial?.eventId && ["pending", "applying"].includes(read()?.phase);
  const save = async record => {
    if (!validEvent()) throw new Error("Crushridge death changed");
    await source.setFlag("azeroth-rpg", CRUSHRIDGE_DEATH, record);
    if (!writer() || JSON.stringify(read()) !== JSON.stringify(record)) throw new Error("Crushridge death write unconfirmed");
  };
  try {
    if (!initial?.eventId || initial.sourceUuid !== source.uuid || initial.phase !== "pending" || !validEvent()) return { ok: false, reason: "notPending" };
    const review = await reviewCrushridgeDeath({ source, eventId: initial.eventId, validEvent, choose, observation: initial.observation });
    if (!review || !validEvent()) return { ok: false, reason: "review" };
    // Linked tokens share one effect collection. Record all reviewed bodies,
    // but apply once per actor rather than refreshing the same event twice.
    const groups = new Map();
    for (const token of review.targets) {
      if (!review.validTarget(token)) return { ok: false, reason: "changed" };
      const group = groups.get(token.actor.uuid) ?? { actor: token.actor, tokens: [] };
      group.tokens.push(token); groups.set(token.actor.uuid, group);
    }
    let record = { ...initial, phase: "applying", results: [] };
    await save(record);
    for (const { actor, tokens } of groups.values()) {
      const valid = () => validEvent() && tokens.every(token => token.actor === actor && review.validTarget(token));
      if (!valid()) return { ok: false, reason: "changed", results: record.results };
      const entry = { actorUuid: actor.uuid, tokenUuids: tokens.map(t => t.uuid), stage: "applying" };
      record = { ...record, results: [...record.results, entry] }; await save(record);
      const result = await applyCrushridgeRage({ actor, eventId: initial.eventId, valid,
        startedAt: initial.observation?.time,
        source: { sceneId: tokens[0].parent.id, tokenId: tokens[0].id } });
      record = { ...record, results: [...record.results.slice(0, -1), { ...entry,
        stage: result.ok ? "complete" : "unresolved", result }] };
      await save(record);
      if (!result.ok) return { ok: false, reason: "recipient", results: record.results };
    }
    await save({ ...record, phase: "complete" });
    return { ok: true, results: record.results };
  } catch (error) {
    console.warn("azeroth-rpg | Crushridge death needs reconciliation", error);
    return { ok: false, reason: "writeUncertain" };
  } finally { busy.delete(source.uuid); }
}
