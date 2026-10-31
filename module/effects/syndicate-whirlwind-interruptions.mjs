import { WHIRLWIND_FLAG, interruptWhirlwind } from "./syndicate-whirlwind-state.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { hasSyndicateWhirlwind } from "../rules/syndicate-whirlwind.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const active = actor => ["channeling", "striking"].includes(actor?.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG)?.phase);
const changed = (change, key) => Object.hasOwn(change ?? {}, key);

/** Register only once at system init. Foundry sends update operation options
 * to each client's updateCombatant hook. Only the active GM writes cancellation.
 */
export function registerWhirlwindInterruptions() {
  const cancel = (actor, reason) => active(actor)
    ? interruptWhirlwind(actor, reason).catch(error => console.warn("azeroth-rpg | Whirlwind interruption", error)) : undefined;
  const inspect = actor => {
    if (!active(actor)) return;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability") || realmRefusalFor(actor, "ability")) return cancel(actor, "incapacitated");
    const record = actor.getFlag("azeroth-rpg", WHIRLWIND_FLAG);
    if (JSON.stringify(actor.system?.attacks?.[record.index]) !== JSON.stringify(record.attack)) return cancel(actor, "weaponChanged");
    if (!hasSyndicateWhirlwind(actor.system?.creatureAbilities)) return cancel(actor, "abilityChanged");
  };
  Hooks.on("deleteCombatant", row => cancel(row.actor, "combatantRemoved"));
  Hooks.on("updateCombatant", (row, change, options) => {
    if (["half", "action", "full", "reaction"].includes(options?.azerothActionSpent)) return cancel(row.actor, "actionSpent");
  });
  Hooks.on("updateToken", (token, change) => {
    const record = token.actor?.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG);
    if (record?.tokenUuid !== token.uuid) return;
    if (["x", "y", "elevation", "level"].some(key => changed(change, key))) return cancel(token.actor, "movement");
    return inspect(token.actor);
  });
  Hooks.on("deleteToken", token => token.actor?.getFlag?.("azeroth-rpg", WHIRLWIND_FLAG)?.tokenUuid === token.uuid
    ? cancel(token.actor, "sourceDeleted") : undefined);
  Hooks.on("updateActor", inspect);
  for (const event of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(event, effect => effect.parent?.documentName === "Actor" ? inspect(effect.parent) : undefined);
  }
  Hooks.on("deleteCombat", combat => Promise.all(values(combat.combatants).map(row => cancel(row.actor, "combatEnded"))));
}
