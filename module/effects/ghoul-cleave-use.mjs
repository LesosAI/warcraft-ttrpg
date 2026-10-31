import { GHOUL_CLEAVE as SPEC, ghoulAttackPlan } from "../rules/naxxramas-ghoul.mjs";
import { reachOf } from "../rules/distance.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollGhoulStrikes } from "./ghoul-strikes.mjs";
import { runGhoulCleave } from "./ghoul-cleave-state.mjs";
export const GHOUL_CLEAVE_QUERY = "azeroth-rpg.ghoulCleave";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

export async function requestGhoulCleave(actor, index, targets = []) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(),
      targets: targets.map(target => ({ sceneId: target.sceneId, tokenId: target.tokenId })) };
    const result = gmHere() ? await ghoulCleaveQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(GHOUL_CLEAVE_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      "Ghoul Cleave could not finish. Review its saved attempt, Action, encounter use and attack cards before continuing.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Ghoul Cleave request", error);
    ui.notifications?.warn("Ghoul Cleave's response was interrupted. Review its saved attempt before trying again.");
    return null;
  }
}

/** The GM confirms allegiance and a clear melee path. Geometry, identity,
 * weapon, clock, walls and payment are revalidated around every dialog. */
export async function ghoulCleaveQueryHandler({ actorUuid, index, source, targets = [], requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length < 1 || targets.length > SPEC.targets) return refuse("targets");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  const tokens = targets.map(target => target?.sceneId === scene.id ? scene.tokens.get(target.tokenId) : null);
  if (tokens.some(token => !token?.actor?.uuid || token.actor.uuid === actor.uuid)
    || new Set(tokens.map(token => token.actor.uuid)).size !== tokens.length) return refuse("target");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  let consumed = false;
  const actors = new Map(tokens.map(token => [token, token.actor]));
  const points = new Map([origin, ...tokens].map(token => [token, point(token)]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source));
  const wallStamp = walls();
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return false;
    if (started === null || clock() !== started || walls() !== wallStamp) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(entry => entry.name === SPEC.name).length !== 1 || row?.name !== SPEC.name
      || a?.kind !== "utility" || a.action !== SPEC.action || a.cost?.amount
      || a.uses?.max !== SPEC.uses || a.uses?.per !== SPEC.per || a.uses.value !== (consumed ? 0 : 1)) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || point(origin) !== points.get(origin) || !scene.levels.get(origin._source?.level)) return false;
    return tokens.every(token => {
      const feet = feetApart(origin, token);
      return scene.tokens.get(token.id) === token && token.actor === actors.get(token)
        && fromUuidSync(token.actor.uuid) === token.actor && point(token) === points.get(token)
        && token._source?.level === origin._source?.level && Number.isFinite(feet) && feet >= 0 && feet <= reachOf(actor.system.attacks?.find(row => row.name === "Claws")?.traits ?? [])
        && !realmRefusalFor(token.actor, "ability") && !projectionRefusal(token.actor, "ability");
    });
  };
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "confirm", name: "Attack these enemies",
      description: `Spend one Action and the encounter use to attack ${tokens.map(token => token.name).join(", ")} separately. Confirm each is an enemy and that the claws has a clear melee path to each.` }], null);
    if (choice?.key !== "confirm") return refuse("cancelled");
    if (!validate()) return refuse("changed");
    const plan = ghoulAttackPlan({ ability: SPEC.name, attacks: actor.system.attacks, targets: tokens.map(token => ({ uuid: token.actor.uuid,
      alive: token.actor.system?.health?.value > 0, hostile: true, sameLevel: true, clearPath: true, feet: feetApart(origin, token) })) });
    if (!plan) return refuse("plan");
    const result = await runGhoulCleave({ actor, requestId, targets: plan.targets, validate,
      pay: async () => {
        if (!validate()) return { paid: false, consumed: false };
        if (!await spendTurnBudget(actor, SPEC.action)) return { paid: false, consumed: false };
        if (!validate()) return { paid: true, consumed: false };
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows });
        consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
        return { paid: true, consumed };
      },
      roll: control => rollGhoulStrikes({ actor, plan, ability: SPEC.name, pay: control.pay, checkpoint: control.checkpoint,
        readCurrent: async () => await control.valid() ? { source: origin, targets: tokens } : null })
    });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Ghoul Cleave</strong></p><p>${result.cards.length} separate claws attacks resolved.</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:ghoul-cleave",
            casting: false, success: true, targets: [], ghoulCleave: { requestId, cards: result.cards } } } });
      } catch (error) { console.warn("azeroth-rpg | Ghoul Cleave resolved; feedback unavailable", error); }
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Ghoul Cleave", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
