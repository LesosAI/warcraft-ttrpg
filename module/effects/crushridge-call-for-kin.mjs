import { CRUSHRIDGE, crushridgeHelpDue } from "../rules/crushridge.mjs";
const FLAG = "crushridgeCallForKin", busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** The observer provides the prior Health. A failed or uncertain announcement
 * is held, not repeated; encounter-use reset alone cannot clear that hold. */
export async function announceCrushridgeHelp(actor, previous) {
  if (!writer() || !actor?.uuid || actor.type !== "npc" || busy.has(actor.uuid)) return false;
  const rows = actor.system?.creatureAbilities ?? [], index = rows.findIndex(row => row.name === CRUSHRIDGE.helpAbility);
  const ability = rows[index], uses = ability?.automation?.uses, health = actor.system?.health;
  if (rows.filter(row => row.name === CRUSHRIDGE.helpAbility).length !== 1 || uses?.max !== 1 || uses.per !== "encounter"
    || uses.value !== 1 || !crushridgeHelpDue({ previous, current: health?.value, maximum: health?.max })) return false;
  const old = actor.getFlag("azeroth-rpg", FLAG);
  if (old && old.stage !== "complete") return false;
  busy.add(actor.uuid);
  const stamp = JSON.stringify(rows), hitHealth = health.value;
  const valid = () => writer() && fromUuidSync(actor.uuid) === actor && actor.system.health.value === hitHealth
    && JSON.stringify(actor.system.creatureAbilities) === stamp;
  try {
    if (!valid()) return false;
    const record = { eventId: foundry.utils.randomID(), stage: "claimed", time: game.time?.worldTime, health: hitHealth };
    await actor.setFlag("azeroth-rpg", FLAG, record);
    if (!valid() || actor.getFlag("azeroth-rpg", FLAG)?.eventId !== record.eventId) return false;
    const next = structuredClone(rows); next[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": next });
    if (!writer() || actor.system.health.value <= 0 || JSON.stringify(actor.system.creatureAbilities) !== JSON.stringify(next)) return false;
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const source = sourceOf(actor);
    const card = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Call for Kin</strong></p><p>The Warmonger bellows for help. Allied Crushridge within 30 feet that can hear the call are alerted. The GM decides whether and how they join the fight.</p>",
      flags: { "azeroth-rpg": { kind: "ability", eventId: record.eventId,
        source: source ?? null,
        featureKey: "ability:crushridge-call-for-kin",
        casting: false, success: true, targets: [] } } });
    if (!writer() || !card?.id) return false;
    const complete = { ...record, stage: "complete", messageId: card.id };
    await actor.setFlag("azeroth-rpg", FLAG, complete);
    return JSON.stringify(actor.getFlag("azeroth-rpg", FLAG)) === JSON.stringify(complete);
  } catch (error) {
    console.warn("azeroth-rpg | Crushridge call for help needs reconciliation", error);
    return false;
  } finally { busy.delete(actor.uuid); }
}

export function registerCrushridgeHelpHooks() {
  const health = new Map();
  const seed = () => {
    health.clear();
    const actors = [...values(game.actors), ...values(game.scenes).flatMap(scene => values(scene.tokens).map(token => token.actor))];
    for (const actor of actors) if (actor?.uuid) health.set(actor.uuid, actor.system?.health?.value);
  };
  Hooks.on("ready", seed);
  let gmId = game.users?.activeGM?.id;
  Hooks.on("updateUser", () => { const next = game.users?.activeGM?.id; if (next !== gmId) { gmId = next; seed(); } });
  Hooks.on("createToken", token => { if (token.actor?.uuid) health.set(token.actor.uuid, token.actor.system?.health?.value); });
  Hooks.on("updateActor", async actor => {
    const previous = health.get(actor.uuid); health.set(actor.uuid, actor.system?.health?.value);
    const crossed = crushridgeHelpDue({ previous, current: actor.system?.health?.value, maximum: actor.system?.health?.max });
    if (writer() && crossed && !await announceCrushridgeHelp(actor, previous)
      && actor.getFlag?.("azeroth-rpg", FLAG)?.stage === "claimed") {
      ui.notifications?.warn("Call for Kin needs review. Check the saved announcement and encounter use before repeating it.");
    }
  });
}
