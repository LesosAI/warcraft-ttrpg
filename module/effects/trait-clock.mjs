/**
 * **08 §5's PLAGUEBOUND, ON THE WORLD'S CLOCK** (D-911; the lead: *"Corruption
 * given by an item should require a test to resist"* and *"DC is 12+2xtier"*).
 *
 * *Once a month, a living wielder makes a Body Resilience Test at DC 12 plus twice
 * their tier. On a failure, they gain 1 Undeath Corruption.* The Greater grade:
 * *the Corruption Test comes weekly.* The law is `rules/trait-corruption.mjs`
 * (`traitExposures`, `clockTestsDue`); this is the door, on the active GM's client,
 * on `updateWorldTime`, one pass at a time.
 *
 * The clock is a stamp on the WEAPON (`flags.azeroth-rpg.traitClock.<occasion>`):
 * the world time its last Test was due. **A weapon put down KEEPS its stamp** (D-913,
 * the lead's adopted recommendation: setting the blade down must not skip a Test) and
 * is marked `away`; the next time it is wielded, the periods that passed come due as
 * ONE Test (`clockTestsDue`'s `cap`). Each Test is `workflows.corruptionExposure`, the
 * door every other occasion uses.
 */

import { TRAIT_PERIODS, clockTestsDue, traitExposures } from "../rules/trait-corruption.mjs";
import { chainLightningLiving } from "../rules/chain-lightning.mjs";

/** The weapon flag a trait's clock keeps its stamp in. */
export const TRAIT_CLOCK_FLAG = "traitClock";

/** The clock occasions, in the order a pass reads them. */
const CLOCKS = Object.freeze(["month", "week"]);

let running = null;

/** Whether a creature lives, 07's Chain Lightning's own reading. */
function lives(actor) {
  return chainLightningLiving({
    creatureType: actor?.system?.creatureType ?? null,
    race: actor?.raceItem?.system?.identifier ?? actor?.raceItem?.name ?? actor?.system?.race ?? null,
    statuses: [...(actor?.statuses ?? [])]
  });
}

/**
 * One pass over the world's characters: every equipped weapon whose trait runs a
 * clock is stamped, and every whole period since its stamp is one Test.
 *
 * @param {{now?: number}} [o]
 * @returns {Promise<number>}  the Tests made
 */
export async function advanceTraitClocks({ now = game.time?.worldTime ?? 0 } = {}) {
  if (!game.users?.activeGM?.isSelf) return 0;
  let made = 0;
  for (const actor of game.actors ?? []) {
    if (actor.type !== "character") continue;
    const tier = actor.system?.tier ?? 1;
    const living = lives(actor);
    // What is WIELDED (`readyWeapons`, D-769): a blade melded into a shape is in nobody's hand.
    const wielded = new Set((actor.readyWeapons?.() ?? []).map(i => i.id));
    for (const item of actor.items ?? []) {
      if (item.type !== "weapon") continue;
      const held = item.getFlag("azeroth-rpg", TRAIT_CLOCK_FLAG) ?? null;
      if (!wielded.has(item.id)) {
        if (held && held.away !== true) await item.setFlag("azeroth-rpg", TRAIT_CLOCK_FLAG, { ...held, away: true });
        continue;
      }
      const stamps = { ...(held ?? {}) };
      // Back in hand after a time set down: what came due meanwhile is ONE Test (D-913).
      const cap = stamps.away === true ? 1 : Infinity;
      let moved = false;
      if (stamps.away === true) { stamps.away = false; moved = true; }
      for (const occasion of CLOCKS) {
        const rows = traitExposures([{ name: item.name, traits: item.system?.traits ?? [] }], occasion, { tier, living });
        if (!rows.length) continue;
        const since = Number.isFinite(Number(stamps[occasion])) && stamps[occasion] !== null ? Number(stamps[occasion]) : null;
        const { due, since: next } = clockTestsDue({ since, now, period: TRAIT_PERIODS[occasion], cap });
        if (since !== next) { stamps[occasion] = next; moved = true; }
        for (let i = 0; i < due; i++) {
          for (const row of rows) {
            await game.system.azeroth.workflows.corruptionExposure({
              actor, track: row.track, dc: row.dc, resilience: row.resilience, points: row.amount, occasion: "gear"
            });
            made++;
          }
        }
      }
      if (moved) await item.setFlag("azeroth-rpg", TRAIT_CLOCK_FLAG, stamps);
    }
  }
  return made;
}

/** Register the pass on the world's clock, one at a time. */
export function registerTraitClockHooks() {
  Hooks.on("updateWorldTime", () => {
    if (running) return;
    running = advanceTraitClocks()
      .catch(err => console.warn("azeroth-rpg | trait clock", err))
      .finally(() => { running = null; });
  });
}
