import { CONSUME_RECOVERIES } from "./consume-shadows-state.mjs";
import { hasConsumeRecovery, advanceConsumeRecovery } from "./consume-shadows-use.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const actors = () => [...new Set([...values(game.actors), ...values(game.scenes).flatMap(s => values(s.tokens).map(t => t.actor))].filter(Boolean))];
const pending = actor => actor?.getFlag?.("azeroth-rpg", CONSUME_RECOVERIES)?.find?.(r => r.state === "recovering");
const location = token => ({ sceneUuid: token.parent?.uuid, tokenUuid: token.uuid, level: token._source?.level,
  x: token.x, y: token.y, elevation: token.elevation });

export function registerConsumeShadowsHooks() {
  const health = new WeakMap(), reviewing = new Set();
  let observedGM = null;
  const prime = () => { for (const actor of actors()) if (!health.has(actor)) health.set(actor, actor.system?.health?.value); };
  const advance = async (actor, event) => {
    if (!gmHere() || !hasConsumeRecovery(actor)) return;
    const result = await advanceConsumeRecovery(actor, event);
    if (!result?.ok) console.warn("azeroth-rpg | Consume Shadows requires reconciliation", actor.uuid, result?.reason);
    return result;
  };
  const review = async () => {
    observedGM = game.users?.activeGM?.id ?? null;
    prime();
    if (!gmHere()) return;
    const recoveryActors = actors().filter(a => pending(a));
    for (const actor of recoveryActors) reviewing.add(actor.uuid);
    try {
      const { chooseOption } = await import("../dice/workflows.mjs");
      for (const actor of recoveryActors) {
        if (!gmHere() || !pending(actor)) continue;
        const record = pending(actor);
        const choice = await chooseOption({ id: `${actor.id}-consume-review`, name: "Consume Shadows" },
          [{ key: "continue", name: "Recovery remained uninterrupted" }, { key: "cancel", name: "Recovery was interrupted" }], null,
          { prompt: `${actor.name ?? "This creature"} has a recovery from before this connection. Confirm that it did not move, take damage, act or enter combat while the GM was disconnected.` });
        if (!gmHere() || pending(actor)?.requestId !== record.requestId) continue;
        const result = await advance(actor, choice?.key === "continue" ? undefined : { kind: "cancel" });
        if (result?.ok) reviewing.delete(actor.uuid);
      }
    } catch (error) {
      // Leave unreviewed recoveries paused locally; a failed dialog must not
      // allow the next clock tick to heal an unverified offline interval.
      console.warn("azeroth-rpg | Consume Shadows reconnect review unavailable", error);
    }
  };
  Hooks.on("ready", review);
  Hooks.on("updateUser", () => {
    const current = game.users?.activeGM?.id ?? null;
    if (current === observedGM) return;
    observedGM = current;
    if (gmHere()) return review();
  });
  Hooks.on("canvasReady", prime);
  Hooks.on("createActor", actor => health.set(actor, actor.system?.health?.value));
  Hooks.on("createToken", token => { if (token.actor) health.set(token.actor, token.actor.system?.health?.value); });
  Hooks.on("updateActor", (actor, change = {}, options = {}) => {
    const before = health.get(actor), after = actor.system?.health?.value;
    health.set(actor, after);
    // The damage writer includes absorbed temporary Health in the same
    // update operation, so the GM sees this before a later clock event.
    if (Number.isFinite(options.azerothDamageApplied) && options.azerothDamageApplied > 0) {
      return advance(actor, { kind: "damage", amount: options.azerothDamageApplied });
    }
    if (Number.isFinite(before) && Number.isFinite(after) && after < before) return advance(actor, { kind: "damage", amount: before - after });
    // Out-of-combat defensive reactions record this mark before rolling.
    if (Object.hasOwn(change, "flags.azeroth-rpg.reacted") || Object.hasOwn(change.flags?.["azeroth-rpg"] ?? {}, "reacted")) {
      return advance(actor, { kind: "action" });
    }
  });
  Hooks.on("updateToken", (token, change) => {
    if (!["x", "y", "elevation", "level", "actorId", "actorLink"].some(k => Object.hasOwn(change ?? {}, k))) return;
    return Promise.all(actors().filter(a => pending(a)?.location?.tokenUuid === token.uuid)
      .map(a => advance(a, { kind: "position", location: token.actor === a ? location(token) : null })));
  });
  Hooks.on("deleteToken", token => Promise.all(actors().filter(a => pending(a)?.location?.tokenUuid === token.uuid)
    .map(a => advance(a, { kind: "deleted" }))));
  Hooks.on("deleteScene", scene => Promise.all(actors().filter(a => pending(a)?.location?.sceneUuid === scene.uuid)
    .map(a => advance(a, { kind: "deleted" }))));
  Hooks.on("updateCombat", combat => combat.started
    ? Promise.all(values(combat.combatants).map(row => advance(row.actor, { kind: "combat" }))) : undefined);
  Hooks.on("createCombatant", row => row.parent?.started ? advance(row.actor, { kind: "combat" }) : undefined);
  Hooks.on("updateCombatant", (row, _change, options) => ["half", "action", "full", "reaction"].includes(options?.azerothActionSpent)
    ? advance(row.actor, { kind: "action" }) : undefined);
  Hooks.on("updateWorldTime", () => Promise.all(actors().filter(a => !reviewing.has(a.uuid)).map(a => advance(a))));
}
