import { REAVER_CLEAVE as SPEC, reaverCleavePlan } from "../rules/crypt-reaver.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { rollChampionStrikes } from "./qiraji-champion-strikes.mjs";
export const REAVER_CLEAVE_QUERY = "azeroth-rpg.reaverCleave";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestReaverCleave(actor, index, targets = []) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
      targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
    const result = gmHere() ? await reaverCleaveQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(REAVER_CLEAVE_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(
      "Reaver Cleave could not finish. Check its Action, remaining use and recorded attack cards before trying again.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Reaver Cleave request", error);
    ui.notifications?.warn("Reaver Cleave's response was interrupted. Review its payment and attack cards before continuing.");
    return null;
  }
}

/** The active GM reviews enemy identities; all geometry comes from live
 * scene tokens, not the requesting client's distances or actor claims. */
export async function reaverCleaveQueryHandler({ actorUuid, index, source, targets = [] } = {}, { user } = {}) {
  let paid = false, consumed = false, finished = false;
  let strikes = { cards: [], skipped: [] };
  const refuse = reason => ({ ...strikes, ok: false, reason, paid, consumed });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || !Array.isArray(targets) || targets.length < 1 || targets.length > SPEC.targets) return refuse("targets");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor) return refuse("source");
  const tokens = targets.map(t => t?.sceneId === scene.id ? scene.tokens.get(t.tokenId) : null);
  if (tokens.some(t => !t?.actor?.uuid || t.actor.uuid === actor.uuid) || new Set(tokens.map(t => t.actor.uuid)).size !== tokens.length) return refuse("target");
  const actors = new Map(tokens.map(t => [t, t.actor]));
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started
    ? `${fight.uuid}:${fight.round}:${fight.turn}` : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null; };
  const started = clock();
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")) return "owner";
    if (started === null || clock() !== started) return "clock";
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    if (row?.name !== SPEC.name || a?.kind !== "utility" || a.action !== SPEC.action || a.cost?.amount
      || a.uses?.max !== SPEC.uses || a.uses?.per !== SPEC.per || a.uses.value !== (consumed ? 0 : 1)) return "ability";
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return "source";
    if (game.scenes.get(scene.id) !== scene || scene.tokens.get(origin.id) !== origin || origin.actor !== actor) return "source";
    for (const token of tokens) {
      if (scene.tokens.get(token.id) !== token || token.actor !== actors.get(token) || fromUuidSync(token.actor.uuid) !== token.actor
        || realmRefusalFor(token.actor, "ability") || projectionRefusal(token.actor, "ability")) return "target";
      const feet = feetApart(origin, token);
      if (!Number.isFinite(feet) || feet < 0 || feet > SPEC.feet || (token.elevation ?? 0) !== (origin.elevation ?? 0)) return "range";
    }
    return null;
  };
  try {
    let reason = validate(); if (reason) return refuse(reason);
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "confirm", name: "Attack these enemies",
      description: `Spend an Action and the Short Rest use to attack ${tokens.map(t => t.name).join(", ")} separately. Confirm that each is an enemy.` }], null);
    if (choice?.key !== "confirm") return refuse("cancelled");
    reason = validate(); if (reason) return refuse(reason);
    const plan = reaverCleavePlan({ attacks: actor.system.attacks, targets: tokens.map(t => ({ uuid: t.actor.uuid,
      alive: t.actor.system?.health?.value > 0, hostile: true, feet: feetApart(origin, t) })) });
    if (!plan) return refuse("plan");
    strikes = await rollChampionStrikes({ actor, plan, title: SPEC.name,
      readCurrent: () => validate() ? null : { source: origin, targets: tokens },
      pay: async () => {
        if (paid !== false || validate()) return false;
        paid = null;
        if (!await spendTurnBudget(actor, SPEC.action)) { paid = false; return false; }
        paid = true;
        if (validate()) return false;
        const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await actor.update({ "system.creatureAbilities": rows }); consumed = true;
        return !validate();
      } });
    if (!strikes.ok) return refuse(strikes.reason ?? "strikes");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Reaver Cleave</strong></p><p>${strikes.cards.length} separate attacks resolved.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:reaver-cleave",
        casting: false, success: true, targets: [], reaver: { cards: strikes.cards, skipped: strikes.skipped } } } });
    finished = true;
    return { ...strikes, ok: true, paid, consumed };
  } catch (error) { console.warn("azeroth-rpg | Reaver Cleave", error); return refuse("writeUncertain"); }
  finally {
    busy.delete(actor.uuid);
    if (paid !== false && !finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p>Reaver Cleave stopped after payment began. Review the Action, remaining use and recorded attack cards. Do not repeat completed attacks.</p>",
        flags: { "azeroth-rpg": { kind: "reaverReport", paid, consumed, cards: strikes.cards, skipped: strikes.skipped } } });
      } catch (error) { console.warn("azeroth-rpg | Reaver Cleave partial report", error); }
    }
  }
}
