import { MIGHTY_BLOW as SPEC, mightyBlowPlan, mightyBlowHit } from "../rules/mighty-blow.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollMightyBlow } from "./mighty-blow-strike.mjs";
import { runMightyBlow } from "./mighty-blow-state.mjs";
export const MIGHTY_BLOW_QUERY = "azeroth-rpg.mightyBlow";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

export async function requestMightyBlow(actor, index, targets = []) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID(),
      targets: targets.map(target => ({ sceneId: target.sceneId, tokenId: target.tokenId })) };
    const result = gmHere() ? await mightyBlowQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(MIGHTY_BLOW_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      "Mighty Blow could not finish. Review its saved attempt, Action, encounter use and attack cards before continuing.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Mighty Blow request", error);
    ui.notifications?.warn("Mighty Blow's response was interrupted. Review its saved attempt before trying again.");
    return null;
  }
}

/** The GM confirms allegiance and a clear melee path. Geometry, identity,
 * weapon, clock, walls and payment are revalidated around every dialog. */
export async function mightyBlowQueryHandler({ actorUuid, index, source, targets = [], requestId } = {}, { user } = {}) {
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
        && token._source?.level === origin._source?.level && Number.isFinite(feet) && feet >= 0 && feet <= SPEC.feet
        && !realmRefusalFor(token.actor, "ability") && !projectionRefusal(token.actor, "ability");
    });
  };
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "confirm", name: "Strike this enemy",
      description: `Spend one Action and the encounter use to attack ${tokens.map(token => token.name).join(", ")} with Stamp at +2 DR. Confirm the target is an enemy and there is a clear melee path. After damage Apply, a failed DC 15 Body Test pushes it up to 10 feet away.` }], null);
    if (choice?.key !== "confirm") return refuse("cancelled");
    if (!validate()) return refuse("changed");
    const plan = mightyBlowPlan({ attacks: actor.system.attacks, targets: tokens.map(token => ({ uuid: token.actor.uuid,
      alive: token.actor.system?.health?.value > 0, hostile: true, sameLevel: token._source?.level === origin._source?.level, feet: feetApart(origin, token) })) });
    if (!plan) return refuse("plan");
    const result = await runMightyBlow({ actor, requestId, validate,
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
      roll: control => rollMightyBlow({ actor, plan, pay: control.pay,
        readCurrent: async () => await control.valid() ? { source: origin, target: tokens[0] } : null }),
      resolve: async ({ card, checkpoint }) => {
        if (game.messages?.get(card.id) !== card) return refuse("attackMissing");
        const flags = card.flags?.["azeroth-rpg"] ?? {};
        if (flags.kind !== "attack" || flags.notAttack === true || flags.parry === true
          || flags.source?.sceneId !== scene.id || flags.source?.tokenId !== origin.id
          || flags.targets?.length !== 1 || flags.targets[0].sceneId !== scene.id
          || flags.targets[0].tokenId !== tokens[0].id) return refuse("attackIdentity");
        const success = card.rolls?.[0]?.outcome?.success;
        if (success === false && flags.damageByTarget?.[0] === null) return { ok: true, reason: "miss" };
        if (success !== true || !mightyBlowHit({ flags, index: 0 })) return refuse("attackUnresolved");
        if (!await checkpoint({ stage: "awaitingApply", source, target: targets[0],
          targetUuid: tokens[0].actor.uuid, sourcePoint: point(origin), targetPoint: point(tokens[0]),
          clock: started, walls: wallStamp, abilityIndex: index })) return refuse("changed");
        return { ok: true, pending: true };
      }
    });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Mighty Blow</strong></p><p>${result.result?.pending ? "Apply the attack damage after reactions, then resolve the Body Test and push." : "The Stamp missed; no push follows."}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:mighty-blow",
            casting: false, success: true, targets: [], mightyBlow: { requestId, attackCardId: result.attackCardId } } } });
      } catch (error) { console.warn("azeroth-rpg | Mighty Blow resolved; feedback unavailable", error); }
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Mighty Blow", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
