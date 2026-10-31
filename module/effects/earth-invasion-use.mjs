import { EARTH_INVASION_ABILITIES } from "../rules/earth-invasion.mjs";
import { runEarthInvasionAbility } from "./earth-invasion-state.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";

export const EARTH_INVASION_QUERY = "azeroth-rpg.earthInvasion";
const ANIMATION_KEYS = Object.freeze({
  "Crushing Knockdown": "ability:crushing-knockdown",
  "Avalanchion's Trample": "ability:avalanchions-trample",
  "Ground Tremor": "ability:ground-tremor",
  "Hurled Boulder": "ability:hurled-boulder"
});
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);
const warning = "This ability could not be confirmed. Review its recorded payment and results before trying again.";

export async function requestEarthInvasionAbility(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await earthInvasionQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(EARTH_INVASION_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(warning);
    return result;
  } catch { ui.notifications?.warn(warning); return null; }
}

export async function earthInvasionQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const name = actor.system?.creatureAbilities?.[index]?.name;
  const spec = Object.hasOwn(EARTH_INVASION_ABILITIES, name ?? "") ? EARTH_INVASION_ABILITIES[name] : null;
  if (!spec) return refuse("ability");
  const scene = game.scenes?.get(source?.sceneId), origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  const initial = [...scene.tokens.values()];
  const snapshots = new Map(initial.map(t => [t, { actor: t.actor, point: point(t) }]));
  const walls = () => JSON.stringify([...(scene.walls?.values?.() ?? [])].map(w => w._source));
  const wallStamp = walls();
  const clock = () => { const c = actor.activeFight?.(); return c?.started ? `${c.uuid}:${c.round}:${c.turn}`
    : Number.isFinite(game.time?.worldTime) ? game.time.worldTime : null; };
  const started = clock(), damaged = new Set();
  let consumed = false, targets = [], selection;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(r => r.name === name).length !== 1 || row?.name !== name || a?.kind !== "utility"
      || a.action !== spec.action || a.dc !== spec.dc || a.cost?.amount > 0) return false;
    if (spec.per ? a.uses?.max !== 1 || a.uses.per !== spec.per || a.uses.value !== (consumed ? 0 : 1)
      : a.uses?.max > 0) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)
      || !initial.every(t => scene.tokens.get(t.id) === t && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return targets.every(t => t !== origin && t.actor !== actor && t.actor?.uuid !== actor.uuid
      && t._source?.level === origin._source?.level && fromUuidSync(t.actor?.uuid) === t.actor
      && (damaged.has(t.actor.uuid) || t.actor.system?.health?.value > 0)
      && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability")
      && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= spec.range);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name, radius: spec.range,
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level && t.actor?.system?.health?.value > 0,
      payment: spec.per ? "Spend one Action and one Short Rest use." : "Spend one Action.",
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
        ? { ...option, description: "An enemy with a clear path to the source." }
        : option.key === "other" ? { ...option, name: "Unaffected", description: "An ally or a creature protected by an obstacle." }
          : option.key === "burst" && spec.targets === "one"
            ? { ...option, name: "Choose one target", description: "Choose one reviewed enemy before spending the Action." }
            : option), note, settings) });
    if (!selection.ok) return refuse(selection.reason);
    targets = selection.targets.map(r => r.token);
    if (!targets.length || !validate() || !selection.valid()) return refuse("target");
    if (spec.targets === "one") {
      const picked = await chooseOption({ id: `${actor.id}-earth-target`, name },
        targets.map(t => ({ key: t.id, name: t.name })), null, { prompt: "Choose one enemy." });
      if (!picked) return refuse("cancelled");
      const token = targets.find(t => t.id === picked.key);
      if (!token || !validate() || !selection.valid()) return refuse("target");
      targets = [token];
    }
    const byUuid = new Map(targets.map(t => [t.actor.uuid, t]));
    if (byUuid.size !== targets.length) return refuse("duplicateActor");
    const result = await runEarthInvasionAbility({ actor, name, requestId, targets: [...byUuid.keys()], validate,
      pay: async () => {
        if (!validate() || !selection.valid()) return false;
        if (!await spendTurnBudget(actor, spec.action)) return false;
        if (!validate() || !selection.valid()) return undefined;
        if (spec.per) {
          const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
          await actor.update({ "system.creatureAbilities": rows });
          consumed = actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
          if (!consumed) return undefined;
        }
        return validate() ? true : undefined;
      },
      resist: async uuid => {
        const token = byUuid.get(uuid); if (!token || !validate()) return null;
        const card = await rollResilience({ actor: token.actor, resilience: spec.resist, dc: spec.dc, subtitle: name });
        return { passed: card?.rolls?.[0]?.outcome?.success, cardUuid: card?.uuid };
      },
      damage: async (uuid, outcome, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid() || !(token.actor.system?.health?.value > 0)) return null;
        const snapshot = targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene }])[0];
        const dealt = resolveDamage({ rating: outcome.damage, sl: 0, kind: "physical", school: "physical", location: "body",
          apByLocation: snapshot.apByLocation, immune: snapshot.immune, vulnerable: snapshot.vulnerable,
          slAddsToDamage: false, dealtHalved: dealtHalvedBy(actor) });
        if (!dealt.immune) await token.actor.applyDamage(dealt.damage, { struck: true, attack: true, location: "body",
          type: "physical", by: actor, spell: false, messageId: claim.messageUuid?.split(".").at(-1), parts: dealt.parts ?? null });
        damaged.add(uuid);
        return { ok: true, lines: [dealt.immune ? "Immune to Physical damage." : `${dealt.damage} Physical damage applied.`] };
      },
      stun: async (uuid, _outcome, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid()) return null;
        if (token.actor.system?.health?.value <= 0) return { ok: true, dead: true };
        const landed = await inflictCondition({ victim: token.actor, by: actor, id: "stunned", name: token.name,
          until: untilEndOfNextTurnOrRound(token.actor) });
        if (landed?.reason === "immune") return { ok: true, immune: true };
        const effect = [...(token.actor.effects ?? [])].find(e => !e.disabled && !e.isSuppressed && e.statuses?.has("stunned"));
        return landed?.landed === true && effect?.id ? { ok: true, effectId: effect.id } : null;
      } });
    if (result.ok) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>Resistance Tests and ability effects resolved.</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: ANIMATION_KEYS[name],
          casting: false, success: true, targets: targets.map(t => ({ sceneId: scene.id, tokenId: t.id })),
          earthInvasion: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Earth invasion feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
