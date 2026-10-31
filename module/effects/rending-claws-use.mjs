import { RENDING_CLAWS as SPEC } from "../rules/naxxramas-ghoul.mjs";
import { ghoulAttackPlan } from "../rules/naxxramas-ghoul.mjs";
import { mightyBlowHit as rendingClawsHit } from "../rules/mighty-blow.mjs";
import { reachOf } from "../rules/distance.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollRendingClaws } from "./rending-claws-strike.mjs";
import { runRendingClaws } from "./rending-claws-state.mjs";
export const RENDING_CLAWS_QUERY = "azeroth-rpg.rendingClaws";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

export async function requestRendingClaws(actor, index, targets = []) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(),
      targets: targets.map(target => ({ sceneId: target.sceneId, tokenId: target.tokenId })) };
    const result = gmHere() ? await rendingClawsQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(RENDING_CLAWS_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      game.i18n.localize("AZEROTH.RendingClaws.Review"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Rending Claws request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.RendingClaws.Interrupted"));
    return null;
  }
}

/** The GM confirms allegiance and a clear melee path. Geometry, identity,
 * weapon, clock, walls and payment are revalidated around every dialog. */
export async function rendingClawsQueryHandler({ actorUuid, index, source, targets = [], requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length !== 1) return refuse("targets");
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
        && token._source?.level === origin._source?.level && Number.isFinite(feet) && feet >= 0 && feet <= reachOf(actor.system.attacks?.find(row => row.name === SPEC.weapon)?.traits ?? [])
        && !realmRefusalFor(token.actor, "ability") && !projectionRefusal(token.actor, "ability");
    });
  };
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "confirm", name: game.i18n.localize("AZEROTH.RendingClaws.Confirm"),
      description: game.i18n.format("AZEROTH.RendingClaws.ConfirmDescription", { name: tokens[0].name }) }], null);
    if (choice?.key !== "confirm") return refuse("cancelled");
    if (!validate()) return refuse("changed");
    const plan = ghoulAttackPlan({ ability: "Rending Claws", attacks: actor.system.attacks, targets: tokens.map(token => ({ uuid: token.actor.uuid,
      alive: token.actor.system?.health?.value > 0, hostile: true, clearPath: true, sameLevel: token._source?.level === origin._source?.level, feet: feetApart(origin, token) })) });
    if (!plan) return refuse("plan");
    const result = await runRendingClaws({ actor, requestId, validate,
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
      roll: control => rollRendingClaws({ actor, plan, pay: control.pay,
        readCurrent: async () => await control.valid() ? { source: origin, targets: tokens } : null }),
      resolve: async ({ card, checkpoint }) => {
        if (game.messages?.get(card.id) !== card) return refuse("attackMissing");
        const flags = card.flags?.["azeroth-rpg"] ?? {};
        if (flags.kind !== "attack" || flags.notAttack === true || flags.parry === true
          || flags.source?.sceneId !== scene.id || flags.source?.tokenId !== origin.id
          || flags.targets?.length !== 1 || flags.targets[0].sceneId !== scene.id
          || flags.targets[0].tokenId !== tokens[0].id) return refuse("attackIdentity");
        const success = card.rolls?.[0]?.outcome?.success;
        if (success === false && flags.damageByTarget?.[0] === null) return { ok: true, reason: "miss" };
        if (success !== true || !rendingClawsHit({ flags, index: 0 })) return refuse("attackUnresolved");
        if (!await checkpoint({ stage: "awaitingApply", source, target: targets[0],
          targetUuid: tokens[0].actor.uuid, sourcePoint: point(origin), targetPoint: point(tokens[0]),
          clock: started, walls: wallStamp, abilityIndex: index })) return refuse("changed");
        return { ok: true, pending: true };
      }
    });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${game.i18n.localize("AZEROTH.RendingClaws.Name")}</strong></p><p>${result.result?.pending ? game.i18n.localize("AZEROTH.RendingClaws.Pending") : game.i18n.localize("AZEROTH.RendingClaws.Miss")}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:rending-claws",
            casting: false, success: true, targets: [], rendingClaws: { requestId, attackCardId: result.attackCardId } } } });
      } catch (error) { console.warn("azeroth-rpg | Rending Claws resolved; feedback unavailable", error); }
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Rending Claws", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
