/** Foundry updateActor observes the updated document. Retain a local Health
 * baseline on every client; only the active GM resolves a new death. */
import { mindslayerDeathObserver } from "../rules/mindslayer.mjs";
import { resolveDyingMind } from "./mindslayer-death.mjs";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => collection?.values?.() ?? collection ?? [];

export function registerMindslayerDeathHooks() {
  const observer = mindslayerDeathObserver(), pending = new Set();
  const prime = () => {
    for (const actor of values(game.actors)) observer.prime(actor);
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) observer.prime(token.actor);
  };
  const resolveDeath = async actor => {
    if (!gmHere() || pending.has(actor.uuid)) return;
    pending.add(actor.uuid);
    try {
      const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
      const started = clock();
      const tokens = [];
      for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
        if (token.actor === actor) tokens.push(token);
      }
      const positions = new Map(tokens.map(t => [t, { x: t.x, y: t.y, elevation: t.elevation, level: t.level }]));
      let token = tokens.length === 1 ? tokens[0] : null;
      if (tokens.length > 1) {
        const { chooseOption } = await import("../dice/workflows.mjs");
        const picked = await chooseOption({ id: `${actor.id}-death-origin`, name: "Dying Mind" },
          tokens.map(t => ({ key: t.uuid, name: `${t.name} — ${t.parent.name}`, description: "Use this token as the death burst's origin." })),
          null, { prompt: "Which token represents the Mindslayer that died?" });
        token = tokens.find(t => t.uuid === picked?.key) ?? null;
      }
      if (!token || !gmHere() || clock() !== started || actor.system?.health?.value !== 0
        || game.scenes?.get(token.parent.id) !== token.parent || token.parent.tokens?.get(token.id) !== token
        || token.actor !== actor || !Object.entries(positions.get(token)).every(([key, value]) => token[key] === value)) {
        ui.notifications?.warn("Dying Mind needs the dead Mindslayer's scene token. Its burst has not been resolved.");
        return;
      }
      const result = await resolveDyingMind({ actor, token, observedDeath: true });
      if (!result?.ok) ui.notifications?.warn("Dying Mind could not be fully resolved. Review its death claim and result card before making a correction.");
    } catch (error) {
      console.warn("azeroth-rpg | Dying Mind death event", error);
      ui.notifications?.warn("Dying Mind could not be confirmed. Check Mana, Health and fear before making a correction.");
    } finally { pending.delete(actor.uuid); }
  };
  Hooks.on("ready", prime);
  Hooks.on("canvasReady", prime);
  Hooks.on("createActor", actor => observer.prime(actor));
  Hooks.on("createToken", token => observer.prime(token.actor));
  Hooks.on("updateActor", actor => observer.observe(actor) ? resolveDeath(actor) : undefined);
}
