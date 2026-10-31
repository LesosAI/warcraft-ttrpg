import { CRUSHRIDGE } from "../rules/crushridge.mjs";
import { CRUSHRIDGE_SOURCE_REVIEW, selectCrushridgeDeathSource } from "./crushridge-death-source.mjs";
import { CRUSHRIDGE_DEATH, resolveCrushridgeDeath } from "./crushridge-death-resolve.mjs";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** GM maintenance only: resume a recorded death, never manufacture a new one. */
export async function resumeCrushridgeDeath(actor, { choose } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const valid = () => writer() && actor?.type === "npc" && actor.system?.health?.value <= 0
    && actor.system?.creatureAbilities?.some(row => row.name === CRUSHRIDGE.donorAbility);
  if (!valid() || !actor.uuid) return refuse("gmOrActor");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  try {
    const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
    const tokens = () => values(game.scenes).flatMap(scene => values(scene.tokens)).filter(token => token.actor === actor);
    const selection = actor.getFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW);
    let source;
    if (selection?.eventId && ["pending", "selected"].includes(selection.phase)) {
      const candidates = tokens().filter(token => selection.candidates?.some(row => row.uuid === token.uuid));
      source = selection.phase === "pending"
        ? await selectCrushridgeDeathSource({ actor, sources: candidates, eventId: selection.eventId, choose: chooser })
        : candidates.find(token => token.uuid === selection.sourceUuid);
      if (!source || !valid() || !tokens().includes(source)) return refuse("source");
      const point = JSON.stringify([source.x, source.y, source.elevation, source._source?.level]);
      if (!selection.candidates.some(row => row.uuid === source.uuid && row.point === point)) return refuse("movedSource");
      const held = source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH);
      if (held?.eventId !== selection.eventId) {
        if (held && !["complete", "cancelled"].includes(held.phase)) return refuse("reconcile");
        const record = { eventId: selection.eventId, sourceUuid: source.uuid, actorUuid: actor.uuid,
          observation: selection.candidates.find(row => row.uuid === source.uuid)?.observation ?? null,
          phase: "pending", results: [], previous: held ? [...(held.previous ?? []), { ...held, previous: undefined }] : [] };
        await source.setFlag("azeroth-rpg", CRUSHRIDGE_DEATH, record);
        if (!valid() || JSON.stringify(source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH)) !== JSON.stringify(record)) return refuse("writeUnconfirmed");
      }
    } else {
      const candidates = tokens().filter(token => token.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH)?.phase === "pending");
      if (candidates.length !== 1) return refuse(candidates.length ? "ambiguous" : "noPendingDeath");
      [source] = candidates;
    }
    if (!valid()) return refuse("changed");
    const result = await resolveCrushridgeDeath({ source, choose: chooser });
    const savedSelection = actor.getFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW);
    if (result?.ok && valid() && savedSelection?.eventId === source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH)?.eventId) {
      await actor.setFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW, { ...savedSelection, phase: "complete" });
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Crushridge death review", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
