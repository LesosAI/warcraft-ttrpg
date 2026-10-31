import { WHIRLWIND_FLAG } from "./syndicate-whirlwind-state.mjs";
import { inspectWhirlwindSource } from "./syndicate-whirlwind-scene.mjs";
import { syndicateWhirlwindStep } from "../rules/syndicate-whirlwind.mjs";
import { whirlwindQueryHandler } from "./syndicate-whirlwind-use.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** One offer per observed cast. Reloaded channels need an explicit Use review;
 * paying/striking records are never resumed by a clock hook. */
export function registerWhirlwindLifecycle() {
  const offered = new Set();
  const actors = () => new Map([
    ...values(game.actors),
    ...values(game.scenes).flatMap(scene => values(scene.tokens).map(token => token.actor))
  ].filter(Boolean).map(actor => [actor.uuid, actor]));
  const key = (actor, record) => `${actor.uuid}:${record.castId}`;
  const holdPending = () => {
    let pending = 0;
    for (const actor of actors().values()) {
      const record = actor.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG);
      if (!["paying", "channeling", "striking"].includes(record?.phase)) continue;
      offered.add(key(actor, record)); pending++;
    }
    if (pending && writer()) ui.notifications?.warn("Pending Whirlwind actions require GM review. Use Whirlwind to review a channel; reconcile any partially resolved attacks before continuing.");
  };
  Hooks.on("ready", holdPending);
  let activeGM = game.users?.activeGM?.id;
  Hooks.on("updateUser", () => {
    const nextGM = game.users?.activeGM?.id;
    if (nextGM !== activeGM) { activeGM = nextGM; holdPending(); }
  });
  const scan = async () => {
    for (const actor of actors().values()) {
      const record = actor.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG);
      if (record?.phase !== "channeling" || offered.has(key(actor, record))) continue;
      const facts = inspectWhirlwindSource(actor, record);
      if (!facts) continue;
      const step = syndicateWhirlwindStep({ ...facts, record, interrupted: record.interrupted === true || facts.interrupted === true });
      if (!["strike", "cancel"].includes(step.action)) continue;
      offered.add(key(actor, record));
      if (!writer()) continue;
      try {
        const result = await whirlwindQueryHandler({ actorUuid: actor.uuid, operation: "resolve" }, { user: game.user });
        if (!result?.ok) ui.notifications?.warn("Whirlwind needs GM review. Use the ability to review its saved channel and attack cards.");
      } catch (error) {
        console.warn("azeroth-rpg | Whirlwind completion", error);
        ui.notifications?.warn("Whirlwind could not be confirmed. Review its saved state before repeating any attacks.");
      }
    }
  };
  Hooks.on("updateCombat", scan);
  Hooks.on("updateWorldTime", scan);
}
