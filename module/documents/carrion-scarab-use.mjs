import { CARRION_SCARAB as SPEC } from "../rules/carrion-scarab.mjs";
import { scarabClaims, scarabWriter, scarabWrite, createCarrionScarab } from "./carrion-scarab-creation.mjs";
import { reconcileCarrionScarabs, joinScarabCombat } from "./carrion-scarab-lifecycle.mjs";
import { reviewScarabPlacement } from "./carrion-scarab-placement.mjs";
import { summonedActor } from "./summon.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const CARRION_SCARAB_QUERY = "azeroth-rpg.carrionScarab";

export async function requestCarrionScarab(actor, index) {
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const options = [{ key: "summon", name: SPEC.name,
    description: "Spend an Action and one use to summon a scarab within 5 feet. You can have up to three scarabs at once." }];
  if (game.user.isGM) {
    options.push({ key: "recover", name: "Recover interrupted summons", description: "Find the original scarabs and remove expired ones. This does not spend another Action or use." });
    for (const claim of scarabClaims(actor)) if (claim.phase !== "active") options.push({ key: `clear:${claim.cast}`,
      name: "Clear a missing summon", description: `Review payment for summon ${claim.cast} first. Clear its record only if no token remains. Nothing is refunded or summoned again.` });
  }
  const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, options, null);
  if (!choice) return null;
  const clear = choice.key.startsWith("clear:");
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), operation: clear ? "clear" : choice.key,
    ...(clear ? { cast: choice.key.slice(6) } : {}) };
  try {
    const result = scarabWriter() ? await carrionScarabQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CARRION_SCARAB_QUERY, data, { timeout: 180000 });
    if (result?.ok) ui.notifications?.info(result.action === "create" ? "Carrion Scarab summoned." : "Summon records reviewed.");
    else if (result?.reason !== "cancelled") ui.notifications?.warn("The summon could not be confirmed. Check the Action, remaining uses and summon records before trying again. Interrupted summons can be recovered by the GM.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Carrion Scarab request", error);
    ui.notifications?.warn("The summon response was interrupted. Ask the GM to recover the original summon before trying again.");
    return null;
  }
}

/** Review placement before entering the shared creation/recovery queue. All
 * source checks are repeated inside it; creation owns the changing use count.
 * Recovery is awaited outside the queue so it cannot recursively deadlock.
 */
export async function carrionScarabQueryHandler({ actorUuid, index, source, operation = "summon", cast } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason, paid: false, consumed: false });
  if (!scarabWriter() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (operation === "recover" || operation === "clear") {
    if (!user.isGM || (operation === "clear" && (typeof cast !== "string" || !scarabClaims(actor).some(c => c.cast === cast && c.phase !== "active")))) return refuse("repair");
    return reconcileCarrionScarabs(actor, { clearMissingCast: operation === "clear" ? cast : null });
  }
  if (operation !== "summon" || !Number.isInteger(index)) return refuse("ability");
  const scene = game.scenes.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const now = game.time?.worldTime;
  const fights = () => [...game.combats].filter(c => c.started && [...c.combatants].some(cb =>
    cb.tokenId === token?.id && (cb.sceneId ?? c.scene?.id) === scene?.id));
  const initial = fights(), combat = initial[0] ?? null;
  const turn = combat ? `${combat.round}:${combat.turn}` : null;
  const valid = () => {
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    const current = fights();
    return scarabWriter() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
      && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(token?.id) === token && token?.actor === actor
      && Number.isFinite(now) && game.time.worldTime === now && initial.length <= 1 && current.length === initial.length
      && (current[0] ?? null) === combat && (!combat || `${combat.round}:${combat.turn}` === turn)
      && Number.isFinite(actor.system.health?.value) && actor.system.health.value > 0
      && row?.name === SPEC.name && a?.kind === "utility" && a.action === SPEC.action
      && (!a.cost || !a.cost.amount) && a.uses?.max === SPEC.uses && a.uses?.per === SPEC.per
      && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
      && !realmRefusalFor(actor, "ability") && !projectionRefusal(actor, "ability")
      && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability");
  };
  let result = null;
  try {
    if (!valid()) return refuse("invalid");
    const recovered = await reconcileCarrionScarabs(actor);
    if (!recovered.ok) return refuse("recovery");
    if (!valid()) return refuse("changed");
    const summon = await summonedActor(SPEC.entry);
    if (!valid() || !summon?.id) return refuse("entry");
    const prototype = { ...summon.prototypeToken.toObject(), actorId: summon.id };
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const selection = await reviewScarabPlacement({ actor, scene, sourceToken: token, prototype, chooseOption });
    if (!selection) return refuse("cancelled");
    result = await scarabWrite(actor.uuid, async () => {
      const made = await createCarrionScarab({ actor, scene, sourceToken: token, prototype, selection, index, valid, spendTurnBudget, combat });
      if (!made.ok) return made;
      if (!await joinScarabCombat(made.token, made.claim)) return { ...made, ok: false, reason: "combatUnconfirmed" };
      return made;
    });
    if (!result.ok) return { ok: false, reason: result.reason, paid: result.paid, consumed: result.consumed };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Summon Carrion Scarab</strong></p><p>A Carrion Scarab appears. It lasts one minute, until destroyed, or until its summoner dies.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:summon-carrion-scarab",
        casting: false, success: true,
        targets: [{ sceneId: scene.id, tokenId: result.token.id, actorUuid: result.token.actor?.uuid ?? null, name: result.token.name }] } } });
    return { ok: true, action: "create", tokenUuid: result.token.uuid, paid: result.paid, consumed: result.consumed };
  } catch (error) {
    console.warn("azeroth-rpg | Carrion Scarab use", error);
    return { ok: false, reason: "writeUncertain", paid: result?.paid ?? null, consumed: result?.consumed ?? null };
  }
}
