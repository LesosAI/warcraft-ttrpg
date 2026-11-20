/** The death watch (`effects/death-watch.mjs`) keeps the Health baseline for every actor on
 * every client and hands a new death to this listener on the active GM's client alone. */
import { aberrationDeath } from "../rules/arcane-aberration.mjs";
import { onDeath } from "./death-watch.mjs";
import { resolveAberrationDeath } from "./arcane-aberration-death.mjs";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => collection?.values?.() ?? collection ?? [];

export function registerAberrationDeathHooks() {
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
      const positions = new Map(tokens.map(t => [t, { x: t.x, y: t.y, elevation: t.elevation, level: t._source?.level }]));
      let token = tokens.length === 1 ? tokens[0] : null;
      if (tokens.length > 1) {
        const { chooseOption } = await import("../dice/workflows.mjs");
        const picked = await chooseOption({ id: `${actor.id}-death-origin`, name: "Unraveling Mana" },
          tokens.map(t => ({ key: t.uuid, name: `${t.name} — ${t.parent.name}`, description: "Use this token as the death burst's origin." })),
          null, { prompt: "Which token represents the Arcane Aberration that died?" });
        token = tokens.find(t => t.uuid === picked?.key) ?? null;
      }
      if (!token || !gmHere() || clock() !== started || actor.system?.health?.value !== 0
        || game.scenes?.get(token.parent.id) !== token.parent || token.parent.tokens?.get(token.id) !== token
        || token.actor !== actor || !Object.entries(positions.get(token)).every(([key, value]) => (key === "level" ? token._source?.level : token[key]) === value)) {
        ui.notifications?.warn("Unraveling Mana needs the dead Arcane Aberration's scene token. Its burst has not been resolved.");
        return;
      }
      const result = await resolveAberrationDeath({ actor, token, observedDeath: true });
      if (!result?.ok) ui.notifications?.warn("Unraveling Mana could not be fully resolved. Review its death claim and result card before making a correction.");
    } catch (error) {
      console.warn("azeroth-rpg | Unraveling Mana death event", error);
      ui.notifications?.warn("Unraveling Mana could not be confirmed. Check Mana and Health before making a correction.");
    } finally { pending.delete(actor.uuid); }
  };
  onDeath(event => (event.healthFell && aberrationDeath(event) ? resolveDeath(event.actor) : undefined));
}
