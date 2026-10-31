/** GM-owned Dire Growl payment, resistance and timed weakening. */
import { DIRE_GROWL, direGrowlChanges } from "../rules/dire-growl.mjs";
import { tendonRipTargetValid } from "./tendon-rip.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const DIRE_GROWL_QUERY = "azeroth-rpg.direGrowl";
const busy = new Set();
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const words = (key, args = {}) => game.i18n.format(`AZEROTH.DireGrowl.${key}`, args);

export async function requestDireGrowl(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await direGrowlQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DIRE_GROWL_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(words(result?.paid ? "PaidFailure" : "Refused"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Dire Growl request", error);
    ui.notifications?.warn(words("Unknown"));
    return null;
  }
}

export async function direGrowlQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!tendonRipTargetValid(actor, source, targets)) return refuse("target");
  const scene = game.scenes.get(source.sceneId);
  const token = scene.tokens.get(targets[0].tokenId), victim = token.actor;
  const keys = [actor.uuid, victim.uuid];
  if (keys.some(k => busy.has(k))) return refuse("busy");
  keys.forEach(k => busy.add(k));
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index];
    if (!Number.isInteger(index) || row?.name !== DIRE_GROWL.name || row.automation?.action !== DIRE_GROWL.action
      || row.automation?.uses?.max !== 1 || row.automation?.uses?.per !== "short"
      || row.automation?.uses?.value !== (consumed ? 0 : 1)) return "ability";
    if (!tendonRipTargetValid(actor, source, targets) || game.scenes.get(scene.id) !== scene
      || scene.tokens.get(token.id) !== token || token.actor !== victim) return "target";
    if (realmRefusalFor(actor, "ability")) return "realm";
    if (!direGrowlChanges(victim.system?.abilities).length) return "abilities";
    return null;
  };
  try {
    let reason = validate();
    if (reason) return refuse(reason);
    const { spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(actor, DIRE_GROWL.action)) return refuse("action");
    paid = true;
    reason = validate();
    if (reason) return refuse(reason);
    const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
    rows[index].automation.uses.value = 0;
    await actor.update({ "system.creatureAbilities": rows });
    consumed = true;
    reason = validate();
    if (reason) return refuse(reason);
    const card = await rollResilience({ actor: victim, resilience: DIRE_GROWL.resilience, dc: DIRE_GROWL.dc, subtitle: DIRE_GROWL.name });
    const resisted = card?.rolls?.[0]?.outcome?.success;
    if (typeof resisted !== "boolean") return refuse("unresolved");
    reason = validate();
    if (reason) return refuse(reason);
    if (!resisted) {
      const data = { name: DIRE_GROWL.name, img: "icons/creatures/abilities/mouth-teeth-long-red.webp", origin: actor.uuid,
        disabled: false, system: { changes: direGrowlChanges(victim.system.abilities) },
        ...untilEndOfNextTurnOrRound(victim), flags: { "azeroth-rpg": { direGrowl: true } } };
      const held = victim.effects.filter(e => e.flags?.["azeroth-rpg"]?.direGrowl === true);
      if (held.length) {
        await held[0].update(data);
        if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(e => e.id));
      } else {
        const made = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
        if (!made?.length) return refuse("effect");
      }
    }
    const message = words(resisted ? "Resisted" : "Applied", { name: victim.name });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${foundry.utils.escapeHTML(message)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:dire-growl",
        casting: false,
        success: true, targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: victim.uuid, name: victim.name }] } } });
    return { ok: true, paid, resisted };
  } catch (error) {
    console.warn("azeroth-rpg | Dire Growl", error);
    return refuse("write");
  } finally { keys.forEach(k => busy.delete(k)); }
}
