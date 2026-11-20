/** The death watch (`effects/death-watch.mjs`) keeps the Health baseline for every actor on
 * every client and hands a new death to this listener on the active GM's client alone. */
import { maggotGooDeath } from "../rules/maggot-goo.mjs";
import { onDeath } from "./death-watch.mjs";
import { resolveMaggotGoo } from "./maggot-goo-burst.mjs";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => collection?.values?.() ?? collection ?? [];

export function registerMaggotGooHooks() {
  const pending = new Set();
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
        const picked = await chooseOption({ id: `${actor.id}-death-origin`, name: "Maggot Goo" },
          tokens.map(t => ({ key: t.uuid, name: `${t.name} — ${t.parent.name}`, description: "Use this token as the death burst's origin." })),
          null, { prompt: "Which token represents the Devourer that died?" });
        token = tokens.find(t => t.uuid === picked?.key) ?? null;
      }
      if (!token || !gmHere() || clock() !== started || actor.system?.health?.value !== 0
        || game.scenes?.get(token.parent.id) !== token.parent || token.parent.tokens?.get(token.id) !== token
        || token.actor !== actor || !Object.entries(positions.get(token)).every(([key, value]) => token[key] === value)) {
        ui.notifications?.warn("Maggot Goo needs the dead Devourer's scene token. Its burst has not been resolved.");
        return;
      }
      const result = await resolveMaggotGoo({ actor, token, observedDeath: true,
        deathId: `${actor.uuid}:${foundry.utils.randomID()}` });
      if (!result?.ok && result?.reason !== "claimed") ui.notifications?.warn("Maggot Goo could not be fully resolved. Review its result card before making a correction.");
    } catch (error) {
      console.warn("azeroth-rpg | Maggot Goo death event", error);
      ui.notifications?.warn("Maggot Goo could not be confirmed. Check Health and poison before making a correction.");
    } finally { pending.delete(actor.uuid); }
  };
  onDeath(event => (event.healthFell && maggotGooDeath({ before: event.before, after: event.after, hasAbility: (event.actor.system?.creatureAbilities ?? []).some(row => row.name === "Maggot Goo") }) ? resolveDeath(event.actor) : undefined));
}
