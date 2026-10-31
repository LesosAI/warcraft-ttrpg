import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { BLAZING_ABILITIES } from "../rules/blazing-invader.mjs";
import { runBlazingAbility } from "./blazing-invader-state.mjs";
import { independentSlowEffect, FELGUARD_SLOW_FLAG } from "../rules/frost-shot.mjs";

export const BLAZING_QUERY = "azeroth-rpg.blazingInvader";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);
const words = key => game.i18n.localize(`AZEROTH.BlazingInvader.${key}`);

export async function requestBlazingAbility(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await blazingInvaderQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(BLAZING_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(words("Unconfirmed"));
    return result;
  } catch { ui.notifications?.warn(words("Unconfirmed")); return null; }
}

export async function blazingInvaderQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const name = actor.system?.creatureAbilities?.[index]?.name;
  const spec = Object.hasOwn(BLAZING_ABILITIES, name ?? "") ? BLAZING_ABILITIES[name] : null;
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
  const started = clock(), mana = actor.system?.power?.value;
  const sourceTiming = spec.sourceExpiry ? untilEndOfNextTurnOrRound(actor) : null;
  const damaged = new Set();
  let consumed = false, targets = [], selection;
  const validate = () => {
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user, "OWNER")
      || started == null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows = actor.system?.creatureAbilities ?? [], row = rows[index], a = row?.automation;
    if (rows.filter(r => r.name === name).length !== 1 || row?.name !== name
      || a?.kind !== "utility" || a.action !== spec.action || (a.dc ?? null) !== spec.dc
      || a.cost?.pool !== "power" || a.cost.amount !== spec.mana) return false;
    if (spec.uses ? a.uses?.max !== spec.uses.max || a.uses.per !== spec.uses.per || a.uses.value !== (consumed ? 0 : 1)
      : a.uses?.max > 0) return false;
    if (!Number.isFinite(mana) || mana < spec.mana || (actor.system.power.name ?? "mana") !== "mana"
      || actor.system.power.value !== mana - (consumed ? spec.mana : 0)) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor, "ability") || projectionRefusal(actor, "ability")
      || sleepRefusal(actor, "ability") || despairRefusal(actor, "ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)
      || !initial.every(t => scene.tokens.get(t.id) === t && t.actor === snapshots.get(t).actor && point(t) === snapshots.get(t).point)) return false;
    return targets.every(t => t !== origin && t.actor !== actor && t.actor?.uuid !== actor.uuid
      && t._source?.level === origin._source?.level && fromUuidSync(t.actor?.uuid) === t.actor
      && (damaged.has(t.actor.uuid) || t.actor.system?.health?.value > 0)
      && !realmRefusalFor(t.actor, "ability") && !projectionRefusal(t.actor, "ability")
      && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= spec.radius);
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name, radius: spec.radius,
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level && t.actor?.system?.health?.value > 0,
      payment: words(spec.sourceExpiry ? "FelguardPayment" : spec.uses ? "WavePayment" : "PulsePayment"),
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
        ? { ...option, description: words("Exposed") }
        : option.key === "other" ? { ...option, name: words("Unaffected"), description: words("Excluded") }
          : option), note, settings) });
    if (!selection.ok) return refuse(selection.reason);
    targets = selection.targets.map(row => row.token);
    if (!targets.length || !validate() || !selection.valid()) return refuse("target");
    const byUuid = new Map(targets.map(t => [t.actor.uuid, t]));
    if (byUuid.size !== targets.length) return refuse("duplicateActor");
    const result = await runBlazingAbility({ actor, name, requestId, targets: [...byUuid.keys()], validate,
      pay: async () => {
        if (!validate() || !selection.valid()) return false;
        if (!await spendTurnBudget(actor, spec.action)) return false;
        if (!validate() || !selection.valid()) return undefined;
        const patch = { "system.power.value": mana - spec.mana };
        if (spec.uses) {
          const rows = foundry.utils.deepClone(actor.system.creatureAbilities); rows[index].automation.uses.value = 0;
          patch["system.creatureAbilities"] = rows;
        }
        await actor.update(patch);
        consumed = actor.system.power.value === mana - spec.mana
          && (!spec.uses || actor.system.creatureAbilities[index]?.automation?.uses?.value === 0);
        return consumed && validate() ? true : undefined;
      },
      resist: async uuid => {
        const token = byUuid.get(uuid); if (!token || !validate()) return null;
        const card = await rollResilience({ actor: token.actor, resilience: spec.resilience, dc: spec.dc, subtitle: name });
        return { passed: card?.rolls?.[0]?.outcome?.success, cardUuid: card?.uuid };
      },
      damage: async (uuid, outcome, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid() || !(token.actor.system?.health?.value > 0)) return null;
        const lines = await strikeFromArea({ actor: token.actor, caster: actor,
          spell: { name, school: "fire", takesSpellpower: false, feature: true, isSpell: false },
          damage: { rating: outcome.rating, school: "fire" } });
        damaged.add(uuid);
        return { ok: true, lines };
      },
      slow: async (uuid, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid()) return null;
        if (token.actor.system?.health?.value <= 0) return { ok: true, dead: true };
        if (spec.sourceExpiry) {
          const immune = () => (token.actor.system?.conditionImmunities ?? []).includes("slowed");
          if (immune()) return { ok: true, immune: true };
          const data = independentSlowEffect({ sourceUuid: actor.uuid, targetUuid: uuid,
            messageUuid: claim.messageUuid, timing: sourceTiming, flag: FELGUARD_SLOW_FLAG,
            name: words("FelguardSlow"), img: "icons/svg/fire.svg" });
          if (!data || !claim.valid()) return null;
          const [effect] = await token.actor.createEmbeddedDocuments("ActiveEffect", [data]);
          if (!effect?.id) return null;
          if (immune()) {
            await token.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
            return { ok: true, immune: true };
          }
          return claim.valid() ? { ok: true, effectId: effect.id } : null;
        }
        const landed = await inflictCondition({ victim: token.actor, by: actor, id: "slowed", name: token.name,
          until: untilEndOfNextTurnOrRound(token.actor) });
        if (landed?.reason === "immune") return { ok: true, immune: true };
        const effect = [...(token.actor.effects ?? [])].find(e => !e.disabled && !e.isSuppressed && e.statuses?.has("slowed"));
        return landed?.landed === true && effect?.id ? { ok: true, effectId: effect.id } : null;
      } });
    if (result.ok) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>${foundry.utils.escapeHTML(words("Resolved"))}</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: name === "Felguard Blast Wave" ? "ability:felguard-blast-wave"
            : name === "Blazing Wave" ? "ability:blazing-wave" : "ability:searing-pulse",
          casting: false, success: true, targets: targets.map(t => ({ sceneId: scene.id, tokenId: t.id })),
          blazingInvader: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Blazing Invader feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
