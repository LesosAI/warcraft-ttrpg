/** GM-authoritative limited Cleave and low-Health Vengeance. */
import { QIRAJI_CLEAVE, QIRAJI_VENGEANCE, championStrikePlan, vengeanceEligible, vengeanceSpeedEffect } from "../rules/qiraji-champion.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { roundsOrClock } from "./durations.mjs";
import { rollChampionStrikes } from "./qiraji-champion-strikes.mjs";
export const CHAMPION_QUERY = "azeroth-rpg.qirajiChampion";
export const championBusy = new Set();
const busy = championBusy;
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestChampionStrikes(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await championQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CHAMPION_QUERY, data, { timeout: 300000 });
    if (!result?.ok) ui.notifications?.warn(result?.paid
      ? "The Champion's ability stopped after payment. Check the recorded strikes, remaining use and any Speed effect before continuing."
      : "The Champion's ability was not used. Check its targets, reach, available use and Health requirement.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Champion request", error);
    ui.notifications?.warn("The Champion's ability could not be confirmed. Check its recorded results before trying again.");
    return null;
  }
}

export async function championQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false, speedAttempted = false, speedEffect = null;
  let strikeResult = { cards: [], skipped: [] };
  const refuse = reason => ({ ...strikeResult, ok: false, reason, paid, speedAttempted, speedEffect });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length < 1 || targets.length > 3) return refuse("targets");
  const row = actor.system?.creatureAbilities?.[index];
  const rule = [QIRAJI_CLEAVE, QIRAJI_VENGEANCE].find(spec => spec.name === row?.name);
  if (!rule) return refuse("ability");
  const vengeance = rule === QIRAJI_VENGEANCE;
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor) return refuse("source");
  const tokens = targets.map(t => t.sceneId === scene.id ? scene.tokens.get(t.tokenId) : null);
  if (tokens.some(t => !t?.actor?.uuid || t.actor.uuid === actor.uuid)) return refuse("target");
  const actors = new Map(tokens.map(t => [t, t.actor]));
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!gmHere() || !actor.testUserPermission(user, "OWNER") || fromUuidSync(actor.uuid) !== actor) return "owner";
    if (started === null || clock() !== started) return "clock";
    const held = actor.system?.creatureAbilities?.[index], auto = held?.automation;
    if (held?.name !== rule.name || auto?.kind !== "utility" || auto.action !== rule.action
      || auto.uses?.max !== 1 || auto.uses.per !== "short" || auto.uses.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system?.health?.value > 0) || realmRefusalFor(actor, "ability") || sleepRefusal(actor, "ability")
      || despairRefusal(actor, "ability") || actor.statuses?.has("stunned")) return "source";
    if (vengeance && !consumed && !vengeanceEligible(actor.system.health)) return "health";
    if (vengeance && !speedAttempted && Array.from(actor.effects ?? []).some(effect => effect.active === true
      && effect.flags?.["azeroth-rpg"]?.qirajiVengeance?.sourceUuid === actor.uuid)) return "active";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor) return "source";
    for (const token of tokens) {
      if (scene.tokens.get(token.id) !== token || token.actor !== actors.get(token)
        || fromUuidSync(token.actor.uuid) !== token.actor || realmRefusalFor(token.actor, "ability")) return "target";
      const feet = feetApart(origin, token);
      if (!Number.isFinite(feet) || feet < 0 || feet > rule.feet) return "range";
    }
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const plan = championStrikePlan({ name: rule.name, attacks: actor.system.attacks, health: actor.system.health,
      targets: tokens.map(t => ({ uuid: t.actor.uuid, alive: t.actor.system?.health?.value > 0, feet: feetApart(origin, t) })) });
    if (!plan) return refuse("plan");
    const { spendTurnBudget } = await import("../dice/workflows.mjs");
    const pay = async () => {
      if (paid || validate()) return false;
      if (!await spendTurnBudget(actor, rule.action)) return false;
      paid = true;
      if (validate()) return false;
      const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
      rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows }); consumed = true;
      if (validate()) return false;
      if (vengeance) {
        const effect = vengeanceSpeedEffect({ sourceUuid: actor.uuid, timing: roundsOrClock(actor, rule.rounds) });
        if (!effect) return false;
        speedAttempted = true;
        const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
        if (!created?.id) return false;
        speedEffect = created.id;
      }
      return !validate();
    };
    strikeResult = await rollChampionStrikes({ actor, plan, title: rule.name, pay,
      readCurrent: () => validate() ? null : { source: origin, targets: tokens } });
    if (!strikeResult.ok) return refuse(strikeResult.reason ?? "strikes");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${rule.name}</strong></p><p>${strikeResult.cards.length} strike(s) resolved.${vengeance ? " Speed increases by 10 feet for three rounds." : " Each declared target was attacked separately."}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: vengeance ? "ability:qiraji-vengeance" : "ability:qiraji-cleave",
        casting: false, success: true, champion: { cards: strikeResult.cards, skipped: strikeResult.skipped, speedEffect },
        targets: [] } } });
    finished = true;
    return { ok: true, paid, ...strikeResult, speedAttempted, speedEffect };
  } catch (error) { console.warn("azeroth-rpg | Champion ability", error); return refuse("writeUncertain"); }
  finally {
    busy.delete(actor.uuid);
    if (paid && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>The Champion's ability stopped after payment. Do not repeat completed strikes or Speed effects. Check its remaining use and recorded cards.</p>",
        flags: { "azeroth-rpg": { kind: "championReport", cards: strikeResult.cards, skipped: strikeResult.skipped,
          useConsumed: consumed, speedAttempted, speedEffect } } });
      } catch (error) { console.warn("azeroth-rpg | Champion partial report", error); }
    }
  }
}
