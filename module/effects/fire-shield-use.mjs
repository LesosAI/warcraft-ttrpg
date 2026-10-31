import { FIRE_SHIELD } from "../rules/fire-shield.mjs";
import { layFireShield } from "./fire-shield-carrier.mjs";
import { runFireShield } from "./fire-shield-state.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const FIRE_SHIELD_QUERY = "azeroth-rpg.fireShield";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token.width, token.height, token.rotation, token.disposition, token._source?.level]);
const local = key => game.i18n.localize(`AZEROTH.FireShield.${key}`);

export async function requestFireShield(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await fireShieldQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(FIRE_SHIELD_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(local("UseInterrupted"));
    return result;
  } catch { ui.notifications?.warn(local("UseInterrupted")); return null; }
}

export async function fireShieldQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("request");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const positions = new Map(initial.map(token => [token, { actor: token.actor, point: point(token) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall => wall._source));
  const wallStamp = walls();
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : game.time?.worldTime; };
  const started = clock();
  let consumed = false, recipient = null;
  const eligible = token => token?.actor && token.actor !== actor && fromUuidSync(token.actor.uuid) === token.actor
    && token._source?.level === origin._source?.level && !realmRefusalFor(token.actor, "ability") && !projectionRefusal(token.actor, "ability")
    && Number.isFinite(feetApart(origin, token)) && feetApart(origin, token) >= 0 && feetApart(origin, token) <= FIRE_SHIELD.radius;
  const valid = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
        || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene
        || !scene.levels.get(origin._source?.level)) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = Number.isInteger(index) && rows[index], automation = row?.automation;
    if (row?.name !== FIRE_SHIELD.name || rows.filter(r => r.name === FIRE_SHIELD.name).length !== 1 || automation?.kind !== "utility"
        || automation.action !== "action" || automation.cost?.amount > 0 || automation.uses?.max !== 1 || automation.uses.per !== "short"
        || automation.uses.value !== (consumed ? 0 : 1)) return false;
    if (!(actor.system.health.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
        || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
        || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !initial.every(token => scene.tokens.get(token.id) === token
        && token.actor === positions.get(token).actor && point(token) === positions.get(token).point)) return false;
    return !recipient || eligible(recipient);
  };
  busy.add(actor.uuid);
  try {
    if (!valid()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const candidates = initial.filter(eligible);
    if (!candidates.length) return refuse("target");
    const chosen = await chooseOption({ id: `${actor.id}-fire-shield-target`, name: FIRE_SHIELD.name },
      candidates.map(token => ({ key: token.id, name: token.name, description: local("TargetDescription") })), null,
      { prompt: local("TargetPrompt") });
    if (!chosen) return refuse("cancelled");
    recipient = candidates.find(token => token.id === chosen.key);
    if (!recipient) return refuse("target");
    if (!valid()) return refuse("changed");
    const confirmed = await chooseOption({ id: `${actor.id}-fire-shield-confirm`, name: FIRE_SHIELD.name }, [
      { key: "use", name: local("Use"), description: local("Cost") },
      { key: "cancel", name: local("Cancel"), description: local("Keep") }
    ], null, { prompt: game.i18n.format("AZEROTH.FireShield.Confirm", { name: recipient.name }) });
    if (confirmed?.key !== "use") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    const result = await runFireShield({ actor, requestId, targetUuid: recipient.actor.uuid, validate: valid,
      pay: async () => {
        if (!valid()) return false;
        if (!await spendTurnBudget(actor, "action")) return false;
        if (!valid()) return undefined;
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows }); consumed = true;
        return valid() ? true : undefined;
      },
      apply: (_uuid, claim) => layFireShield({ owner: recipient.actor, caster: actor, castId: requestId, valid: claim.valid }) });
    if (result.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${local("Name")}</strong></p><p>${local("Description")}</p>`,
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:fire-shield",
            casting: false, success: true,
            fireShield: result, targets: [{ sceneId: scene.id, tokenId: recipient.id }] } } });
      } catch { ui.notifications?.warn(local("FeedbackInterrupted")); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
