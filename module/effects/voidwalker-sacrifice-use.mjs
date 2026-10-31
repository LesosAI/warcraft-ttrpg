import { bondOf } from "../documents/bound.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { untilNextTurnOrRound } from "./durations.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { activeVoidwalkerSacrifices, voidwalkerSacrificeEffect, voidwalkerSacrificeInRange,
  VOIDWALKER_SACRIFICE_FLAG } from "../rules/voidwalker-sacrifice.mjs";

const RECEIPTS = "voidwalkerSacrificeUses";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** GM-side activation transaction. The feature menu is connected only when
 * attack interception is available. An uncertain write is never replayed. */
export async function activateVoidwalkerSacrifice({ actor, index, sourceToken, ownerToken, activationId, user } = {}) {
  let paid = false;
  const refuse = reason => ({ ok: false, reason, paid });
  if (!gmHere() || !user?.id || actor?.documentName !== "Actor" || actor.type !== "npc"
    || !actor.testUserPermission(user, "OWNER") || resolve(actor.uuid) !== actor) return refuse("owner");
  if (typeof activationId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(activationId)) return refuse("request");
  if (busy.has(actor.uuid)) return refuse("busy");
  const receipts = () => actor.getFlag("azeroth-rpg", RECEIPTS) ?? [];
  if (!Array.isArray(receipts())) return refuse("receipt");
  const prior = receipts().find(row => row.activationId === activationId);
  if (prior) return prior.stage === "complete"
    ? { ok: true, paid: true, effectId: prior.effectId, replay: true } : refuse("unconfirmedPriorUse");
  const owner = ownerToken?.actor, scene = sourceToken?.parent;
  const clock = () => {
    const fight = actor.activeFight?.();
    return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}`
      : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null;
  };
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || resolve(actor.uuid) !== actor
      || !owner?.uuid || resolve(owner.uuid) !== owner || owner === actor) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== "Sacrifice" || row.automation?.kind !== "utility"
      || row.automation.action !== "half" || bondOf(actor)?.ownerUuid !== owner.uuid) return "bondOrAbility";
    if (!(actor.system?.health?.value > 0) || !(owner.system?.health?.value > 0)
      || realmRefusalFor(actor, "ability") || realmRefusalFor(owner, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability") || actor.statuses?.has("stunned")) return "cannotAct";
    if (!scene?.id || game.scenes?.get(scene.id) !== scene || sourceToken.actor !== actor
      || scene.tokens?.get(sourceToken.id) !== sourceToken || scene.tokens.get(ownerToken.id) !== ownerToken
      || ownerToken.actor !== owner || !scene.levels?.get(sourceToken._source?.level)) return "tokens";
    return voidwalkerSacrificeInRange({ feet: feetApart(sourceToken, ownerToken), sameScene: ownerToken.parent === scene,
      sameLevel: ownerToken._source?.level === sourceToken._source.level }) ? null : "range";
  };
  const save = async record => {
    const next = receipts().filter(row => row.activationId !== activationId);
    next.push({ activationId, ...record });
    await actor.setFlag("azeroth-rpg", RECEIPTS, next);
    const saved = receipts().find(row => row.activationId === activationId);
    if (JSON.stringify(saved) !== JSON.stringify(next.at(-1))) throw new Error("Sacrifice receipt was not confirmed");
  };
  busy.add(actor.uuid);
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const active = [...(actor.effects ?? [])].some(effect => {
      const identity = effect.flags?.["azeroth-rpg"]?.[VOIDWALKER_SACRIFICE_FLAG];
      return identity?.sourceUuid === actor.uuid && activeVoidwalkerSacrifices([effect], identity).length > 0;
    });
    if (active) return refuse("alreadyActive");
    const data = voidwalkerSacrificeEffect({ sourceUuid: actor.uuid, ownerUuid: owner.uuid,
      sourceTokenUuid: sourceToken.uuid, ownerTokenUuid: ownerToken.uuid, activationId,
      timing: untilNextTurnOrRound(actor), labels: { name: game.i18n.localize("AZEROTH.VoidwalkerSacrifice.Name"),
        description: game.i18n.localize("AZEROTH.VoidwalkerSacrifice.Description") } });
    if (!data) return refuse("timing");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    reason = validate(); if (reason) return refuse(reason);
    await save({ stage: "claimed" });
    reason = validate(); if (reason) return refuse(reason);
    if (!await spendTurnBudget(actor, "half")) { await save({ stage: "refused" }); return refuse("budget"); }
    paid = true;
    await save({ stage: "paid" });
    reason = validate(); if (reason) return refuse(reason);
    const created = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    const effect = created?.[0];
    if (!effect?.id || !activeVoidwalkerSacrifices(actor.effects, data.flags["azeroth-rpg"][VOIDWALKER_SACRIFICE_FLAG])
      .some(row => row.id === effect.id && row.flags["azeroth-rpg"][VOIDWALKER_SACRIFICE_FLAG].activationId === activationId))
      return refuse("effectUnconfirmed");
    await save({ stage: "complete", effectId: effect.id });
    return { ok: true, paid: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Voidwalker Sacrifice activation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
