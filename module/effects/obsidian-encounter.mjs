/** Initialize a Destroyer's empty reservoir once per combat, never per reload. */
import { DESTROYER_DRAINS } from "./obsidian-drain-transfer.mjs";
export const DESTROYER_ENCOUNTER = "destroyerEncounter";
const pending = new Set();
export const destroyerOperations = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const isDestroyer = actor => actor?.type === "npc"
  && ["Drain Mana", "Obsidian Purge"].every(name => actor.system?.creatureAbilities?.some(row => row.name === name));
const fightOf = actor => (game.combats?.contents ?? []).find(combat => combat.started && combat.getCombatantsByActor(actor)?.length) ?? null;

/** A new combat has a distinct UUID. Restarting the same Combat document
 * deliberately does not erase a paid drain or an unfinished Purge report. */
export async function initializeDestroyerEncounter(actor) {
  if (!gmHere() || !isDestroyer(actor) || !actor.uuid || fromUuidSync(actor.uuid) !== actor) return { ok: false, reason: "actorOrGM" };
  if (pending.has(actor.uuid) || destroyerOperations.has(actor.uuid)) return { ok: false, reason: "busy" };
  const combat = fightOf(actor), key = combat?.uuid ?? "unplaced";
  const held = actor.flags?.["azeroth-rpg"]?.[DESTROYER_ENCOUNTER];
  // Leaving combat is not a new encounter. Preserve the receipt until the
  // next combat instead of deleting it and allowing reload to reset Mana.
  if (held?.version === 1 && (held.key === key || !combat)) return { ok: true, changed: false };
  pending.add(actor.uuid);
  try {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || fightOf(actor) !== combat) return { ok: false, reason: "changed" };
    const record = { version: 1, key };
    await actor.update({ "system.power.value": 0,
      [`flags.azeroth-rpg.${DESTROYER_ENCOUNTER}`]: record,
      [`flags.azeroth-rpg.${DESTROYER_DRAINS}`]: {} });
    const persisted = actor.flags?.["azeroth-rpg"]?.[DESTROYER_ENCOUNTER];
    return { ok: actor.system.power.value === 0 && persisted?.version === 1 && persisted.key === key, changed: true };
  } finally { pending.delete(actor.uuid); }
}

export async function initializeDestroyers() {
  if (!gmHere()) return;
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  for (const actor of actors.values()) if (isDestroyer(actor)) {
    const result = await initializeDestroyerEncounter(actor);
    if (!result.ok && result.reason !== "busy") throw new Error("Destroyer initialization was not confirmed");
  }
}

/** GM-only reset between encounters. Never repairs uncertain target writes. */
export async function resetDestroyerEncounter(actor, { choose } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !isDestroyer(actor) || fromUuidSync(actor.uuid) !== actor) return refuse("actorOrGM");
  if (pending.has(actor.uuid) || destroyerOperations.has(actor.uuid)) return refuse("busy");
  if (fightOf(actor)) return refuse("combat");
  const before = JSON.stringify({ mana: actor.system.power?.value, flags: actor.flags?.["azeroth-rpg"] });
  const valid = () => gmHere() && isDestroyer(actor) && fromUuidSync(actor.uuid) === actor && !fightOf(actor)
    && !destroyerOperations.has(actor.uuid)
    && before === JSON.stringify({ mana: actor.system.power?.value, flags: actor.flags?.["azeroth-rpg"] });
  pending.add(actor.uuid);
  try {
    const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
    const answer = await chooser({ id: `${actor.id}-reservoir`, name: "Reset Obsidian Reservoir" }, [
      { key: "cancel", name: "Cancel", description: "Keep Mana and the recorded transfers." },
      { key: "reset", name: "Prepare a new encounter", description: "Empty Mana and clear this Destroyer's drain receipts. Health and target pools do not change." }
    ], null, { prompt: "GM: Resolve any unfinished transfers or Purge results before resetting." });
    if (answer?.key !== "reset") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    await actor.update({ "system.power.value": 0,
      [`flags.azeroth-rpg.${DESTROYER_ENCOUNTER}`]: { version: 1, key: "unplaced" },
      [`flags.azeroth-rpg.${DESTROYER_DRAINS}`]: {} });
    return { ok: actor.system.power.value === 0
      && actor.flags?.["azeroth-rpg"]?.[DESTROYER_ENCOUNTER]?.key === "unplaced"
      && Object.keys(actor.flags?.["azeroth-rpg"]?.[DESTROYER_DRAINS] ?? { missing: true }).length === 0 };
  } finally { pending.delete(actor.uuid); }
}

export function registerDestroyerEncounterHooks() {
  const sync = () => { void initializeDestroyers().catch(error => {
    console.warn("azeroth-rpg | Destroyer encounter initialization", error);
    ui.notifications?.warn("A Destroyer's starting Mana could not be confirmed. Check its pool before using Drain Mana or Purge.");
  }); };
  for (const hook of ["ready", "createActor", "createToken", "createCombatant"]) Hooks.on(hook, sync);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) sync(); });
}
