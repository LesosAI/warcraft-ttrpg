import { LIGHTNING_CLOUD as SPEC, lightningCloudTick } from "../rules/lightning-cloud.mjs";
import { reviewLightningCloudArea } from "./lightning-cloud-area.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const LIGHTNING_CLOUD_QUERY = "azeroth-rpg.lightningCloud";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestLightningCloud(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor) };
    const result = gmHere() ? await lightningCloudQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(LIGHTNING_CLOUD_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "Lightning Cloud stopped after payment. Review its Region and recorded hits before continuing."
      : "Lightning Cloud was not used. Check the point, Action, Mana and remaining use.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Cloud request", error);
    ui.notifications?.warn("Lightning Cloud could not be confirmed. Check its results before trying again.");
    return null;
  }
}

/** Payment and the Short Rest use are persisted together before the Region.
 * Initial-hit claims live on that Region before damage; no automatic replay
 * is offered after an uncertain write. Later pulses use normal area ticks. */
export async function lightningCloudQueryHandler({ actorUuid, index, source } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, selection = null, region = null;
  const results = [], locks = [];
  const refuse = reason => ({ ok: false, reason, paid, consumed, regionUuid: region?.uuid ?? null, results });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || busy.has(actor.uuid)) return refuse("abilityOrBusy");
  busy.add(actor.uuid); locks.push(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), token = scene?.tokens.get(source?.tokenId);
  const mana = actor.system.power?.value;
  const fightOf = () => { const fight = actor.activeFight?.(); return fight?.started ? fight : null; };
  const clock = () => { const fight = fightOf(); return fight
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const valid = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER") || !started || clock() !== started) return false;
    if (!scene || game.scenes.get(scene.id) !== scene || scene.tokens.get(token?.id) !== token || token?.actor !== actor) return false;
    if (!(actor.system.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")) return false;
    const a = actor.system.creatureAbilities?.[index];
    if (a?.name !== SPEC.name || a.automation?.kind !== "utility" || a.automation.action !== SPEC.action
      || a.automation.uses?.max !== 1 || a.automation.uses.per !== "short"
      || a.automation.uses.value !== (consumed ? 0 : 1)) return false;
    if (!Number.isInteger(mana) || mana < SPEC.power || (actor.system.power?.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? SPEC.power : 0)) return false;
    return !selection || (selection.valid() && selection.targets.every(t => fromUuidSync(t.actorUuid) === t.actor && !realmRefusalFor(t.actor, "ability")));
  };
  try {
    if (!valid()) return refuse("invalid");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    selection = await reviewLightningCloudArea({ actor, scene, sourceToken: token, chooseOption,
      payment: "Spend one Action, 3 Mana and one Short Rest use. The cloud lasts three rounds." });
    if (!selection.ok) return refuse(selection.reason);
    if (selection.targets.some(t => busy.has(t.actorUuid))) return refuse("busy");
    for (const t of selection.targets) { busy.add(t.actorUuid); locks.push(t.actorUuid); }
    if (!valid()) return refuse("changed");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    if (!valid()) return refuse("changed");
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = 0;
    await actor.update({ "system.power.value": mana - SPEC.power, "system.creatureAbilities": abilities });
    consumed = true;
    if (!valid()) return refuse("paymentUnconfirmed");
    const cast = foundry.utils.randomID(), fight = fightOf();
    const spell = { name: SPEC.name, school: SPEC.school, feature: true, isSpell: false, takesSpellpower: false };
    region = await placeArea({ scene, name: SPEC.name, areaText: "A 10 ft radius on the ground",
      origin: selection.origin, token, attach: false, color: "#6aa8df",
      flags: { cast, caster: actor.uuid, source, identifier: "lightning-cloud", featureKey: "ability:lightning-cloud",
        sustained: false, areaTick: lightningCloudTick(), lasts: { rounds: SPEC.rounds }, spell,
        placedAt: { combatId: fight?.id ?? null, round: fight?.round ?? null, turn: fight?.turn ?? null, time: game.time.worldTime },
        lightningCloudHits: [] } });
    if (!region || scene.regions?.get(region.id) !== region || region.flags?.["azeroth-rpg"]?.cast !== cast) return refuse("regionUnconfirmed");
    for (const t of selection.targets) {
      if (!valid() || scene.regions.get(region.id) !== region) return refuse("changed");
      const row = { actorUuid: t.actorUuid, name: t.token.name, attempted: false, applied: false };
      results.push(row);
      if (!(t.actor.system?.health?.value > 0)) { row.skipped = true; continue; }
      row.attempted = true;
      await region.update({ "flags.azeroth-rpg.lightningCloudHits": foundry.utils.deepClone(results) });
      const claim = region.flags?.["azeroth-rpg"]?.lightningCloudHits?.find(hit => hit.actorUuid === t.actorUuid);
      if (!valid() || !claim?.attempted) return refuse("claimUnconfirmed");
      const lines = await strikeFromArea({ actor: t.actor, caster: actor, spell,
        damage: { rating: SPEC.initial, school: SPEC.school } });
      if (!Array.isArray(lines) || !lines.length) return refuse("damageUnconfirmed");
      row.applied = true; row.lines = lines;
      await region.update({ "flags.azeroth-rpg.lightningCloudHits": foundry.utils.deepClone(results) });
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Lightning Cloud</strong></p><p>${foundry.utils.escapeHTML(results.flatMap(r => r.lines ?? []).join(" ") || "The cloud forms on empty ground.")}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:lightning-cloud",
        casting: false, success: true, cast, lightningCloud: results, regionUuid: region.uuid,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid })) } } });
    finished = true;
    return { ok: true, paid, consumed, regionUuid: region.uuid, results };
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Cloud", error);
    return refuse("writeUncertain");
  } finally {
    locks.forEach(key => busy.delete(key));
    if (paid && !finished) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p>Lightning Cloud stopped after payment. Check Mana, the use, Region and initial-hit receipts before correcting unfinished work. Do not replay confirmed hits.</p>",
      flags: { "azeroth-rpg": { kind: "lightningCloudReport", consumed, regionUuid: region?.uuid ?? null, results } } })
      .catch(error => console.warn("azeroth-rpg | Lightning Cloud partial report", error));
  }
}
