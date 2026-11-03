import { lashOfPainProfile } from "../rules/demon-abilities.mjs";
import { runLashOfPain } from "./lash-of-pain-state.mjs";
import { reachOf } from "../rules/distance.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const LASH_QUERY = "azeroth-rpg.lashOfPain";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);
const warning = "Lash of Pain could not be confirmed. Check its recorded Action, Mana and attack card before trying again.";

export async function requestLashOfPain(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const payload = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await lashOfPainQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(LASH_QUERY, payload, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(warning);
    return result;
  } catch { ui.notifications?.warn(warning); return null; }
}

export async function lashOfPainQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const profile = lashOfPainProfile(actor.system?.attacks);
  if (!profile) return refuse("whip");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const radius = reachOf(profile.attack.traits), mana = actor.system?.power?.value;
  const profileStamp = JSON.stringify(profile);
  const initial = [...scene.tokens.values()];
  const points = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const fight = actor.activeFight?.(); return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}`
    : Number.isFinite(game.time?.worldTime) ? game.time.worldTime : null; };
  const started = clock();
  let victim = null, selection, consumed = false, attempted = false;
  let suretyTools = null, suretyQuote = null, abilityPayer = actor, payerPool = null, suretyCommitted = false;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started === null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene
      || !scene.levels.get(origin._source?.level)) return false;
    const row = actor.system?.creatureAbilities?.[index], a = row?.automation;
    if (row?.name !== "Lash of Pain" || a?.kind !== "utility" || a.action !== "action"
      || a.cost?.pool !== "power" || a.cost.amount !== 2 || a.uses?.max > 0
      || JSON.stringify(lashOfPainProfile(actor.system?.attacks)) !== profileStamp) return false;
    if (!Number.isFinite(mana) || mana < 2 || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed && abilityPayer === actor ? 2 : 0)) return false;
    if (abilityPayer !== actor) {
      const current = abilityPayer?.poolSnapshot?.().find(p => p.itemId === payerPool?.itemId && p.kind === payerPool?.kind && p.name === payerPool?.name);
      if (!payerPool || !current || current.value !== payerPool.value - (consumed ? 2 : 0)) return false;
    }
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !initial.every(t => scene.tokens.get(t.id) === t
      && t.actor === points.get(t).actor && point(t) === points.get(t).point)) return false;
    return !victim || (victim !== origin && victim.actor !== actor && victim._source?.level === origin._source?.level
      && fromUuidSync(victim.actor.uuid) === victim.actor && victim.actor.system?.health?.value > 0
      && !realmRefusalFor(victim.actor, "ability") && !projectionRefusal(victim.actor, "ability")
      && Number.isFinite(feetApart(origin, victim)) && feetApart(origin, victim) >= 0 && feetApart(origin, victim) <= radius);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollTest } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name: "Lash of Pain", radius,
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level && t.actor?.system?.health?.value > 0,
      payment: "Choose one enemy, then spend one Action and 2 Mana when confirming the attack.", chooseOption });
    if (!selection.ok) return refuse(selection.reason);
    const picked = await chooseOption({ id: `${actor.id}-lash-target`, name: "Lash of Pain" },
      selection.targets.map(r => ({ key: r.token.id, name: r.token.name })), null, { prompt: "Choose one enemy within the whip's reach." });
    if (!picked) return refuse("cancelled");
    victim = selection.targets.find(r => r.token.id === picked.key)?.token;
    if (!victim || !validate() || !selection.valid()) return refuse("target");
    if (actor.getFlag?.("azeroth-rpg", "bond")?.kind === "demon") {
      const ability = actor.system.creatureAbilities[index];
      suretyTools = await import("../effects/thematic-fel.mjs");
      const quote = await suretyTools.claimFelSuretyForAbility({demon: actor, ability, index, attemptId: requestId});
      if (quote?.ok) {
        suretyQuote = quote;
        abilityPayer = quote.payer === "warlock" ? fromUuidSync(quote.casterUuid) : actor;
        payerPool = quote.payerPool;
        if (quote.payer === "warlock" && (!abilityPayer?.testUserPermission(game.user, "OWNER")
          || !abilityPayer.poolSnapshot?.().some(p => p.itemId === payerPool?.itemId && p.kind === payerPool?.kind
            && p.name === payerPool?.name && p.value >= 2))) return refuse("suretyPayer");
      } else if (quote?.reason !== "noSurety") return refuse("suretyClaim");
    }
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const snapshot = () => targetSnapshots([{ id: victim.id, name: victim.name, actor: victim.actor, scene }]);
    const declared = snapshot(), declaredStamp = JSON.stringify(declared);
    if (declared.length !== 1 || !Number.isFinite(declared[0].defense)) return refuse("defense");
    const { npcAttackWithDialog } = await import("../applications/actions.mjs");
    let response = refuse("cancelled");
    await npcAttackWithDialog(actor, null, null, { title: "Lash of Pain", attack: profile.attack,
      damageSchool: profile.damageSchool, targets: declared, mode: "hand", singleAttack: true, budget: "none",
      run: async args => {
        if (attempted) return null;
        attempted = true;
        const ready = () => validate() && selection.valid() && JSON.stringify(snapshot()) === declaredStamp;
        if (!ready() || args.actor !== actor || args.targets?.length !== 1 || args.targets[0].sceneId !== scene.id
          || args.targets[0].tokenId !== victim.id || args.damage?.kind !== "magical" || args.damage.school !== "shadow"
          || args.strike?.rangeKind !== "melee") { response = refuse("changed"); return null; }
        let attackCard = null;
        response = await runLashOfPain({ actor, requestId, targetUuid: victim.actor.uuid, validate: ready,
          payAction: async () => {
            if (!ready()) return false;
            const fight = actor.activeFight?.(), combatant = fight?.getCombatantsByActor(actor)?.[0];
            if (combatant) {
              const spent = await combatant.spendAction("action", { isAttack: true, isOffHand: false, rangeKind: "melee" });
              return typeof spent?.ok === "boolean" ? spent.ok : undefined;
            }
            return spendTurnBudget(actor, "action");
          },
          payMana: async () => {
            if (!ready()) return undefined;
            if (suretyQuote?.payer === "warlock") {
              const current = abilityPayer.poolSnapshot?.().find(p => p.itemId === payerPool.itemId && p.kind === payerPool.kind && p.name === payerPool.name);
              if (!current) return undefined;
              await abilityPayer.updatePool({itemId: payerPool.itemId, kind: payerPool.kind,
                value: Math.max(0, current.value - 2)});
              const committed = await suretyTools.commitFelSuretyUse(suretyQuote);
              suretyCommitted = committed?.ok === true;
              if (!suretyCommitted) console.warn("azeroth-rpg | Fel Surety use acknowledgement needs GM reconciliation");
            } else {
              await actor.update({ "system.power.value": mana - 2 });
              if (suretyQuote) {
                const committed = await suretyTools.commitFelSuretyUse(suretyQuote);
                suretyCommitted = committed?.ok === true;
                if (!suretyCommitted) console.warn("azeroth-rpg | Fel Surety use acknowledgement needs GM reconciliation");
              }
            }
            consumed = true;
            return ready() ? true : undefined;
          },
          roll: async claim => {
            if (!claim.valid()) return null;
            attackCard = await rollTest({ ...args, targets: declared, source, budget: "none" });
            return { messageUuid: attackCard?.uuid, passed: attackCard?.rolls?.[0]?.outcome?.success };
          } });
        return attackCard;
      } });
    if (response.ok) {
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          content: "<p><strong>Lash of Pain</strong></p><p>One Action and 2 Mana spent. Resolve the Shadow whip attack on its attack card; Snag does not apply.</p>",
          flags: { "azeroth-rpg": { kind: "ability",
            source: source ?? null,
            featureKey: "ability:lash-of-pain",
            casting: false, success: true, lashOfPain: response,
            targets: [{ sceneId: scene.id, tokenId: victim.id }] } } });
      } catch (error) { console.warn("azeroth-rpg | Lash of Pain feedback unavailable", error); }
    }
    return response;
  } catch { return refuse("writeUncertain"); }
  finally {
    if (suretyQuote && !suretyCommitted) {
      try { await suretyTools.releaseFelSuretyClaim(suretyQuote); }
      catch (error) { console.warn("azeroth-rpg | Fel Surety release needs GM reconciliation", error); }
    }
    busy.delete(actor.uuid);
  }
}
