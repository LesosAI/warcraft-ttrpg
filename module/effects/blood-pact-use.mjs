import { BLOOD_PACT } from "../rules/blood-pact.mjs";
import { grantBloodPact } from "./blood-pact-grant.mjs";
import { runBloodPact } from "./blood-pact-state.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const BLOOD_PACT_QUERY = "azeroth-rpg.bloodPact";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);

export async function requestBloodPact(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const payload = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await bloodPactQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(BLOOD_PACT_QUERY, payload, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn("Blood Pact could not be confirmed. Review its payment and recipient records before trying again.");
    return result;
  } catch { ui.notifications?.warn("Blood Pact could not be confirmed. Check its recorded use and effects."); return null; }
}

export async function bloodPactQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const positions = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : game.time?.worldTime; };
  const started = clock();
  let consumed = false, recipients = [origin];
  const valid = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
        || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene
        || !scene.levels.get(origin._source?.level)) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = Number.isInteger(index) && rows[index], a = row?.automation;
    if (row?.name !== "Blood Pact" || rows.filter(r => r.name === "Blood Pact").length !== 1 || a?.kind !== "utility"
        || a.action !== "action" || a.cost?.amount > 0 || a.uses?.max !== 1 || a.uses.per !== "short"
        || a.uses.value !== (consumed ? 0 : 1)) return false;
    if (!(actor.system.health.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
        || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
        || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !initial.every(t => scene.tokens.get(t.id) === t
        && t.actor === positions.get(t).actor && point(t) === positions.get(t).point)) return false;
    return recipients.every(t => t.actor && fromUuidSync(t.actor.uuid) === t.actor
      && t._source?.level === origin._source?.level && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability")
      && Number.isInteger(t.actor.system?.health?.temp) && t.actor.system.health.temp >= 0
      && (t === origin || (Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= BLOOD_PACT.radius)));
  };
  busy.add(actor.uuid);
  try {
    if (!valid()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const seen = new Set([actor.uuid]);
    for (const token of initial) {
      if (!token.actor?.uuid || seen.has(token.actor.uuid) || token._source?.level !== origin._source?.level) continue;
      if (!token.actor.system?.health) continue;
      const distance = feetApart(origin, token);
      if (!Number.isFinite(distance) || distance < 0) return refuse("distance");
      if (distance > BLOOD_PACT.radius) continue;
      seen.add(token.actor.uuid);
      const choice = await chooseOption({ id: `${actor.id}-blood-pact-allies`, name: "Blood Pact" }, [
        { key: "ally", name: "Ally with a clear path", description: "This ally receives Blood Pact along with the imp." },
        { key: "other", name: "Unaffected", description: "An enemy, neutral creature or creature separated by an obstacle." }
      ], null, { prompt: `GM: Can ${token.name} receive Blood Pact from ${actor.name}?` });
      if (!choice) return refuse("cancelled");
      if (!["ally", "other"].includes(choice.key)) return refuse("classification");
      if (choice.key === "ally") recipients.push(token);
      if (!valid()) return refuse("changed");
    }
    const confirm = await chooseOption({ id: `${actor.id}-blood-pact-confirm`, name: "Blood Pact" }, [
      { key: "use", name: "Use Blood Pact", description: `Affect ${recipients.map(t => t.name).join(", ")}. Spend one Action and one Short Rest use.` },
      { key: "cancel", name: "Cancel", description: "Keep the Action and use." }
    ], null, { prompt: "Confirm the imp and all allies within 10 feet. Each gains 2 temporary Health for 1 minute; equal or larger buffers are kept." });
    if (confirm?.key !== "use") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    const byUuid = new Map(recipients.map(t => [t.actor.uuid, t.actor]));
    const result = await runBloodPact({ actor, requestId, targets: [...byUuid.keys()], validate: valid,
      pay: async () => {
        if (!valid()) return false;
        if (!await spendTurnBudget(actor, "action")) return false;
        if (!valid()) return undefined;
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows }); consumed = true;
        return valid() ? true : undefined;
      },
      apply: (uuid, claim) => grantBloodPact({ actor: byUuid.get(uuid), by: actor, requestId, valid: claim.valid }) });
    if (result.ok) {
      try {
        const granted = result.results.filter(r => r.landed).length;
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>Blood Pact</strong></p><p>${granted} creature(s) gained 2 temporary Health for 1 minute. Equal or larger buffers were kept. The effect does not refill as creatures move.</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:blood-pact",
            casting: false, success: true, bloodPact: result,
            targets: recipients.map(t => ({ sceneId: scene.id, tokenId: t.id })) } } });
      } catch (error) { console.warn("azeroth-rpg | Blood Pact feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
