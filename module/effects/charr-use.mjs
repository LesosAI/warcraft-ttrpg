import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { layFlameBuffet } from "./flame-buffet.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { CHARR_ABILITIES } from "../rules/flame-buffet.mjs";
import { runCharrAbility } from "./charr-state.mjs";

export const CHARR_QUERY = "azeroth-rpg.charrAbility";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = t => JSON.stringify([t.x, t.y, t.elevation, t.width, t.height, t.rotation, t.disposition, t._source?.level]);
const TEXT = Object.freeze({
  Unconfirmed: "This ability was not fully confirmed. Review its recorded results before trying again.",
  VolleyPayment: "Spend an Action, 4 Mana and one Short Rest use.",
  BuffetPayment: "Spend an Action and 2 Mana after choosing one target.",
  Exposed: "An enemy with a clear path from the caster can be affected.",
  Unaffected: "Ally, neutral or covered creature", Excluded: "Exclude this creature from the ability.",
  Resolved: "Resistance Tests, Fire damage and any Flame Buffet stacks have been resolved."
});
const words = key => TEXT[key];

export async function requestCharrAbility(actor, index) {
  try {
    const { sourceOf } = await import("../applications/roll-dialog.mjs");
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), requestId: foundry.utils.randomID() };
    const result = gmHere() ? await charrQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(CHARR_QUERY, data, { timeout: 300000 });
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(words("Unconfirmed"));
    return result;
  } catch { ui.notifications?.warn(words("Unconfirmed")); return null; }
}

export async function charrQueryHandler({ actorUuid, index, source, requestId } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const name = actor.system?.creatureAbilities?.[index]?.name;
  const spec = Object.hasOwn(CHARR_ABILITIES, name ?? "") ? CHARR_ABILITIES[name] : null;
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
      && Number.isFinite(feetApart(origin, t)) && feetApart(origin, t) >= 0 && feetApart(origin, t) <= (spec.radius ?? spec.range));
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: origin, name, radius: (spec.radius ?? spec.range),
      validOrigin: validate, includeToken: t => t._source?.level === origin._source?.level && t.actor?.system?.health?.value > 0,
      payment: words(spec.uses ? "VolleyPayment" : "BuffetPayment"),
      chooseOption: (menu, options, note, settings) => chooseOption(menu, options.map(option => option.key === "enemy"
        ? { ...option, description: words("Exposed") }
        : option.key === "other" ? { ...option, name: words("Unaffected"), description: words("Excluded") }
          : option.key === "burst" && name === "Flame Buffet"
            ? { ...option, name: "Choose one target", description: "Continue to choose one of the reviewed enemies. Nothing is spent yet." }
            : option), note, settings) });
    if (!selection.ok) return refuse(selection.reason);
    targets = selection.targets.map(row => row.token);
    if (!targets.length || !validate() || !selection.valid()) return refuse("target");
    if (name === "Flame Buffet") {
      const picked = await chooseOption({ id: `${actor.id}-flame-buffet-target`, name },
        targets.map(t => ({ key: t.id, name: t.name, description: "4 Fire damage and one stack on a failed Reflex Test; half damage and no stack on success." })),
        null, { prompt: "Choose one enemy. Spend an Action and 2 Mana to use Flame Buffet." });
      if (!picked) return refuse("cancelled");
      const token = targets.find(t => t.id === picked.key);
      if (!token || !validate() || !selection.valid()) return refuse("target");
      targets = [token];
    }
    const byUuid = new Map(targets.map(t => [t.actor.uuid, t]));
    if (byUuid.size !== targets.length) return refuse("duplicateActor");
    const result = await runCharrAbility({ actor, name, requestId, targets: [...byUuid.keys()], validate,
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
      stack: async (uuid, claim) => {
        const token = byUuid.get(uuid); if (!token || !claim.valid()) return null;
        if (token.actor.system?.health?.value <= 0) return { ok: true, dead: true };
        return layFlameBuffet({ victim: token.actor, by: actor, requestId: claim.applicationId, valid: claim.valid });
      } });
    if (result.ok) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>${foundry.utils.escapeHTML(words("Resolved"))}</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: name === "Flame Buffet" ? "ability:flame-buffet" : "ability:fireball-volley",
          casting: false, success: true, targets: targets.map(t => ({ sceneId: scene.id, tokenId: t.id })),
          charrAbility: { requestId, results: result.results } } } });
      } catch (error) { console.warn("azeroth-rpg | Baron Charr feedback unavailable", error); }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
