/**
 * Migration to 0.15.6 - what a character already holds is KNOWN (08 §4, *Unidentified items*;
 * D-1435; the architect's review of Phases 1-2, must-fix 2).
 *
 * 08 §4 hides an Uncommon or higher thing a character GAINS, and `AzerothItem`'s create seam
 * stamps it on arrival. A thing a character held before that rule existed carries no flag, and
 * an absent flag is stamped the next time the thing is created anywhere - a stack split, a drag
 * to another sheet, a hand-off through the loot window - so a sword a character has carried for
 * months would turn up unidentified the first time it moved.
 *
 * Every Uncommon+ weapon, suit and gear item embedded on a CHARACTER - a world actor, an
 * unlinked token on a scene, or a character in an unlocked world pack - with no flag takes
 * `flags.azeroth-rpg.unidentified = false`, in one batch per actor (`walkWorld`'s `items`
 * builder, which carries the bags' bypass). A creature's things are never hidden, a world item
 * or a pack document stays flagless so a GM's hand-out is still found, and a flag already
 * written either way is left alone, so a second run writes nothing. Every document touched is
 * logged by `walkWorld`.
 */

import { knownBatch } from "../rules/identify.mjs";
import { walkWorld } from "./walk.mjs";

export async function migrate(log = console.log) {
  return walkWorld({
    items: actor => {
      if (actor?.type !== "character") return null;
      const batch = knownBatch([...(actor.items ?? [])].map(i => ({ _id: i.id, type: i.type, system: i._source?.system ?? i.system, flags: i._source?.flags ?? i.flags })));
      if (batch.length) log(`azeroth-rpg | 0.15.6: ${actor.name} holds ${batch.length} thing(s) already known (08 §4)`);
      return batch;
    }
  }, log);
}
