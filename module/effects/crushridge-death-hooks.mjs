import { CRUSHRIDGE, crushridgeDeath } from "../rules/crushridge.mjs";
import { CRUSHRIDGE_DEATH, resolveCrushridgeDeath } from "./crushridge-death-resolve.mjs";
import { CRUSHRIDGE_SOURCE_REVIEW, selectCrushridgeDeathSource } from "./crushridge-death-source.mjs";
import { captureCrushridgeDeath } from "./crushridge-review.mjs";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Seed observations on load/handoff, never infer an unobserved death. Pending
 * or partial records survive reload for explicit review instead of replay. */
export function registerCrushridgeDeathHooks() {
  const health = new Map(), pending = new Set();
  const tokens = () => values(game.scenes).flatMap(scene => values(scene.tokens));
  const seed = () => {
    health.clear();
    for (const token of tokens()) if (token.actor?.uuid) health.set(token.actor.uuid, token.actor.system?.health?.value);
  };
  Hooks.on("ready", seed);
  let gmId = game.users?.activeGM?.id;
  Hooks.on("updateUser", () => {
    const next = game.users?.activeGM?.id;
    if (next !== gmId) { gmId = next; seed(); }
  });
  Hooks.on("createToken", token => {
    if (token.actor?.uuid) health.set(token.actor.uuid, token.actor.system?.health?.value);
  });
  Hooks.on("updateActor", async actor => {
    if (!actor?.uuid) return;
    const previous = health.get(actor.uuid), current = actor.system?.health?.value;
    health.set(actor.uuid, current);
    if (!writer() || !crushridgeDeath(previous, current) || pending.has(actor.uuid)
      || !actor.system?.creatureAbilities?.some(row => row.name === CRUSHRIDGE.donorAbility)) return;
    const sources = tokens().filter(token => token.actor === actor);
    const observations = new Map(sources.map(token => [token.uuid, captureCrushridgeDeath(token)]));
    pending.add(actor.uuid);
    try {
      const { chooseOption } = await import("../dice/workflows.mjs");
      const eventId = foundry.utils.randomID();
      const source = sources.length === 1 ? sources[0]
        : await selectCrushridgeDeathSource({ actor, sources, eventId, choose: chooseOption, observations });
      if (!source || !writer() || source.actor !== actor || actor.system.health.value > 0) return;
      const held = source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH);
      if (held && held.phase !== "complete" && held.phase !== "cancelled") {
        ui.notifications?.warn("A previous Crushridge death remains unresolved. Review it before resolving this new death.");
        return;
      }
      const record = { eventId, sourceUuid: source.uuid, actorUuid: actor.uuid,
        observation: observations.get(source.uuid),
        time: game.time?.worldTime, phase: "pending", results: [],
        previous: held ? [...(held.previous ?? []), { ...held, previous: undefined }] : [] };
      await source.setFlag("azeroth-rpg", CRUSHRIDGE_DEATH, record);
      if (!writer() || source.actor !== actor || actor.system.health.value > 0
        || source.getFlag("azeroth-rpg", CRUSHRIDGE_DEATH)?.eventId !== record.eventId) return;
      const result = await resolveCrushridgeDeath({ source, choose: chooseOption });
      const selected = actor.getFlag?.("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW);
      if (result?.ok && writer() && selected?.eventId === eventId) {
        await actor.setFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW, { ...selected, phase: "complete" });
      }
      if (!result?.ok) ui.notifications?.warn("Crushridge death remains pending. Review its saved recipient results before repeating any effects.");
    } catch (error) {
      console.warn("azeroth-rpg | Crushridge death observation", error);
      ui.notifications?.warn("Crushridge death could not be confirmed. Review its saved event before retrying.");
    } finally { pending.delete(actor.uuid); }
  });
}
