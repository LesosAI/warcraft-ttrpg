import { TOXIC_POISONS } from "../rules/toxic-horror.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { runToxicPoison } from "./toxic-horror-state.mjs";
import { toxicTargetAdapters } from "./toxic-horror-targets.mjs";

export const TOXIC_QUERY = "azeroth-rpg.toxicHorror";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x,t.y,t.elevation,t.width,t.height,t.rotation,t.disposition,t._source?.level]);

export async function requestToxicPoison(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid:actor.uuid, index, source:sourceOf(actor), requestId:foundry.utils.randomID() };
    const result = gmHere() ? await toxicPoisonQueryHandler(data,{user:game.user})
      : await game.users?.activeGM?.query(TOXIC_QUERY,data,{timeout:300000});
    if (!result?.ok && result?.reason !== "cancelled")
      ui.notifications?.warn("The poison ability could not be completed. Ask the GM to review its saved result before trying again.");
    return result;
  } catch {
    ui.notifications?.warn("The poison ability could not be confirmed. Ask the GM to review its saved result before trying again.");
    return null;
  }
}

/** Authenticate ownership and the complete scene before spending or applying. */
export async function toxicPoisonQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user,"OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const kind = Object.keys(TOXIC_POISONS).find(key => TOXIC_POISONS[key].name === actor.system?.creatureAbilities?.[index]?.name);
  if (!kind) return refuse("ability");
  const spec = TOXIC_POISONS[kind];
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const snapshots = new Map(initial.map(t => [t,{ actor:t.actor, point:point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? `${c.uuid}:${c.round}:${c.turn}` : game.time?.worldTime; };
  const started = clock();
  let consumed = false, targets = [], selection = null;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user,"OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(r => r.name === spec.name).length !== 1 || row?.name !== spec.name || a?.kind !== "utility"
      || a.action !== "action" || a.cost?.amount) return false;
    if (kind === "deadly" && (a.uses?.max !== 1 || a.uses?.per !== "encounter" || a.uses.value !== (consumed ? 0 : 1))) return false;
    if (kind === "localized" && a.uses?.max > 0) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor,"ability") || projectionRefusal(actor,"ability")
      || sleepRefusal(actor,"ability") || despairRefusal(actor,"ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)
      || !initial.every(t => scene.tokens.get(t.id) === t && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return targets.every(t => t._source?.level === origin._source?.level && fromUuidSync(t.actor.uuid) === t.actor
      && !realmRefusalFor(t.actor,"ability") && !projectionRefusal(t.actor,"ability"));
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    if (kind === "deadly") {
      selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name: spec.name, radius: spec.feet,
        validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level,
        payment: "Spend one Action and this encounter's use.",
        chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
          ? { ...option, name:"Enemy with a clear path", description:"This enemy is in the poison burst and must resist it." }
          : option.key === "other" ? { ...option, name:"Ally, neutral creature or blocked target",
            description:"This creature is not affected by the poison burst." } : option), note, settings) });
      if (!selection.ok) return refuse(selection.reason);
      targets = selection.targets.map(r => r.token);
    } else {
      const candidates = initial.filter(t => t.actor && t.actor !== actor && t.actor.system?.health?.value > 0
        && t._source?.level === origin._source?.level && Number.isFinite(feetApart(origin,t)) && feetApart(origin,t) <= spec.feet);
      if (!candidates.length) return refuse("target");
      const answer = await chooseOption({ id: actor.id, name: spec.name }, candidates.map(t => ({ key:t.id, name:t.name,
        description:"Target this enemy with Localized Toxin." })), null,
      { prompt:"GM: Choose one enemy within 5 feet with a clear path. This spends one Action." });
      if (!answer) return refuse("cancelled");
      const target = candidates.find(t => t.id === answer.key);
      if (!target) return refuse("target");
      targets = [target];
    }
    if (!validate() || targets.some(t => !(t.actor.system?.health?.value > 0)
      || !Number.isFinite(feetApart(origin,t)) || feetApart(origin,t) > spec.feet)) return refuse("target");
    const adapters = toxicTargetAdapters({ actor, source:origin, targets, kind, valid:validate });
    if (!adapters) return refuse("target");
    const result = await runToxicPoison({ actor, kind, requestId, targets:targets.map(t => t.uuid), validate, ...adapters,
      pay: async () => {
        if (!validate() || (selection && !selection.valid())) return { paid:false, consumed:false };
        if (!await spendTurnBudget(actor,"action")) return { paid:false, consumed:false };
        if (!validate()) return { paid:true, consumed:false };
        if (kind === "localized") return { paid:true, consumed:true };
        const rows = structuredClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities":rows });
        consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
        return { paid:true, consumed };
      } });
    if (result.ok) {
      // Feedback follows confirmed resolution and never retries the ability.
      // The source burst indicates use; target cues include only new doses.
      try {
        const affected = targets.filter(t => result.results.some(r => r.targetUuid === t.uuid && r.outcome?.applied));
        await ChatMessage.create({ speaker:ChatMessage.getSpeaker({actor}),
          content:`<p><strong>${spec.name}</strong></p><p>Resistance resolved. ${affected.length} creature(s) received poison.</p>`,
          flags:{"azeroth-rpg":{kind:"ability",source,casting:false,success:true,
            featureKey:kind === "localized" ? "ability:localized-toxin" : "ability:deadly-poison",
            targets:affected.map(t=>({sceneId:scene.id,tokenId:t.id})),
            toxicHorror:{requestId,kind,results:result.results}}} });
      } catch (error) { console.warn("azeroth-rpg | Toxic Horror resolved; feedback unavailable",error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
