import { sentinelEnrageDue } from "../rules/sentinel-enrage.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { sentinelFeedback } from "./sentinel-feedback.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function triggerSentinelEnrage(actor) {
  const pack = actor?.flags?.["azeroth-rpg"]?.sentinelPack;
  const valid = () => gmHere() && actor?.uuid && fromUuidSync(actor.uuid) === actor
    && actor.type === "npc" && actor.system?.creatureAbilities?.some(row => row.name === "Sentinel Enrage")
    && actor.flags?.["azeroth-rpg"]?.sentinelPack?.assignment?.id === pack?.assignment?.id
    && activeSentinelPowers(actor).length > 0;
  if (!valid() || pending.has(actor.uuid) || !sentinelEnrageDue(actor.system.health, pack?.enraged)) return false;
  pending.add(actor.uuid);
  try {
    await actor.update({ "flags.azeroth-rpg.sentinelPack.enraged": true });
    const confirmed = Boolean(valid() && actor.flags?.["azeroth-rpg"]?.sentinelPack?.enraged === true);
    if (confirmed) await sentinelFeedback(actor, "ability:sentinel-enrage", `${actor.name} becomes enraged.`);
    return confirmed;
  } finally { pending.delete(actor.uuid); }
}

export function registerSentinelEnrageHooks() {
  const run = actor => { void triggerSentinelEnrage(actor).catch(error => {
    console.warn("azeroth-rpg | Sentinel Enrage", error);
    ui.notifications?.warn("Sentinel Enrage could not be confirmed. Check its pack record and attack bonuses.");
  }); };
  Hooks.on("updateActor", run);
  Hooks.on("ready", () => {
    for (const actor of game.actors ?? []) run(actor);
    for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) run(token.actor);
  });
}
