import { TAINTED_BLOOD } from "../rules/tainted-blood.mjs";
import { layTaintedBloodAura } from "./tainted-blood-carrier.mjs";
import { runTaintedBlood } from "./tainted-blood-state.mjs";
import { postTaintedBloodActivation } from "./tainted-blood-feedback.mjs";
import { endLesserInvisibility } from "./lesser-invisibility.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const TAINTED_BLOOD_QUERY = "azeroth-rpg.taintedBlood";
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const fightStamp = actor => {
  const fight = actor?.activeFight?.();
  return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : null;
};

export async function requestTaintedBlood(actor, index) {
  try {
    const data = { actorUuid: actor.uuid, index, requestId: foundry.utils.randomID(), issuedAt: Date.now() };
    const result = gmHere() ? await taintedBloodQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(TAINTED_BLOOD_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("Tainted Blood could not be confirmed. Check its Action, Short Rest use and existing effect before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("Tainted Blood could not be confirmed. Check its payment record before trying again.");
    return null;
  }
}

export async function taintedBloodQueryHandler({ actorUuid, index, requestId, issuedAt } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof actorUuid !== "string" || !Number.isInteger(index) || index < 0
    || !/^[A-Za-z0-9]{16}$/.test(requestId ?? "") || !Number.isSafeInteger(issuedAt)
    || issuedAt > Date.now() + 5000 || Date.now() >= issuedAt + 600000) return refuse("request");
  const actor = await fromUuid(actorUuid);
  const start = game.time?.worldTime, fight = fightStamp(actor);
  const health = actor?.system?.health?.value, temp = actor?.system?.health?.temp;
  let consumed = false;
  const valid = () => {
    if (!gmHere() || actor?.documentName !== "Actor" || actor.type !== "npc" || fromUuidSync(actorUuid) !== actor
      || !actor.testUserPermission(user, "OWNER") || !Number.isSafeInteger(start) || start < 0
      || game.time?.worldTime !== start || fightStamp(actor) !== fight || !(health > 0)
      || actor.system.health.value !== health || actor.system.health.temp !== temp) return false;
    const rows = actor.system.creatureAbilities ?? [], row = rows[index], automation = row?.automation;
    if (row?.name !== TAINTED_BLOOD.name || rows.filter(r => r.name === TAINTED_BLOOD.name).length !== 1
      || automation?.kind !== "utility" || automation.action !== "action" || automation.cost?.amount > 0
      || automation.uses?.max !== 1 || automation.uses.per !== "short" || automation.uses.value !== (consumed ? 0 : 1)) return false;
    return !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
      && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability");
  };
  if (!valid()) return refuse("ineligible");
  const { spendTurnBudget } = await import("../dice/workflows.mjs");
  const result = await runTaintedBlood({ actor, requestId, validate: valid,
    payAction: async () => valid() ? spendTurnBudget(actor, "action") : false,
    payUse: async () => {
      if (!valid()) return undefined;
      const rows = structuredClone(actor.system.creatureAbilities);
      rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows }); consumed = true;
      if (!valid()) return undefined;
      await endLesserInvisibility(actor, { event: "ability" });
      return valid() ? true : undefined;
    },
    apply: ({ valid: claimValid }) => layTaintedBloodAura({ owner: actor, castId: requestId, valid: claimValid })
  });
  if (result.ok) {
    try {
      const { sourceOf } = await import("../applications/roll-dialog.mjs");
      if (!await postTaintedBloodActivation({ actor, requestId, effectId: result.effectId, source: sourceOf(actor) }))
        throw Error("Missing activation feedback");
    } catch {
      ui.notifications?.warn("Tainted Blood is active, but its feedback could not be confirmed. Do not spend another use to repeat the message.");
    }
  }
  return result;
}
