import { TERRIFYING_ROAR as SPEC } from "../rules/king-mosh.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { resolveTerrifyingRoar } from "./terrifying-roar-targets.mjs";
import { runTerrifyingRoar } from "./terrifying-roar-state.mjs";
export const TERRIFYING_ROAR_QUERY = "azeroth-rpg.terrifyingRoar";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

export async function requestTerrifyingRoar(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await terrifyingRoarQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(TERRIFYING_ROAR_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      "Terrifying Roar could not finish. Review its saved attempt, Action, encounter use and Spirit Tests and conditions before continuing.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Terrifying Roar request", error);
    ui.notifications?.warn("Terrifying Roar's response was interrupted. Review its saved attempt before trying again.");
    return null;
  }
}

/** The GM confirms allegiance and hearing. Geometry, identity,
 * clock, walls and payment are revalidated around every dialog. */
export async function terrifyingRoarQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  let tokens = [], selection = null;
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  let consumed = false;
  const actors = new Map();
  const points = new Map([...scene.tokens.values()].map(token => [token, point(token)]));
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
    if (!(actor.system?.health?.value > 0) || (actor.statuses?.has("stunned") || actor.statuses?.has("silenced"))
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor
      || point(origin) !== points.get(origin) || !scene.levels.get(origin._source?.level)) return false;
    if (selection && !selection.valid()) return false;
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
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name: SPEC.name,
      radius: SPEC.feet, validOrigin: () => gmHere() && scene.tokens.get(origin.id) === origin
        && origin.actor === actor && point(origin) === points.get(origin) && walls() === wallStamp && clock() === started,
      includeToken: token => token._source?.level === origin._source?.level,
      payment: "Spend one Action and the encounter use. Each reviewed enemy makes a DC 17 Spirit Test or becomes Frightened until its next turn ends.",
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "other"
        ? { ...option, name: "Ally, neutral or unable to hear", description: "Exclude allies, fallen creatures and creatures that cannot hear the roar." }
        : option.key === "enemy" ? { ...option, name: "Living enemy that can hear", description: "This creature makes a DC 17 Spirit Test against the roar." } : option), note, settings)
    });
    if (!selection.ok) return refuse(selection.reason);
    tokens = selection.targets.map(row => row.token);
    if (new Set(tokens.map(token => token.actor.uuid)).size !== tokens.length) return refuse("target");
    for (const token of tokens) actors.set(token, token.actor);
    if (!validate()) return refuse("changed");
    if (tokens.some(token => !(token.actor.system?.health?.value > 0))) return refuse("target");
    const result = await runTerrifyingRoar({ actor, requestId, targets: tokens.map(token => token.actor.uuid), validate,
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
      resolve: control => resolveTerrifyingRoar({ actor, targets: tokens, ...control })
    });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Terrifying Roar</strong></p><p>${result.results.length} creatures resolved the roar. See their Spirit Tests and conditions.</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:terrifying-roar",
            casting: false, success: true, targets: tokens.filter(token => result.results.some(row => row.actorUuid === token.actor.uuid && row.outcome === "frightened")).map(token => ({ sceneId: scene.id, tokenId: token.id })), terrifyingRoar: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Terrifying Roar resolved; feedback unavailable", error); }
    }
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Terrifying Roar", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
