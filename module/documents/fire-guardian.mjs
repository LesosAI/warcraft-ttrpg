import { FIRE_GUARDIAN as SPEC, fireGuardianPlan, fireGuardianClaim,
  confirmFireGuardian, reconcileFireGuardian } from "../rules/fire-guardian.mjs";
import { summonedActor } from "./summon.mjs";
import { ringSpots } from "../rules/summon-places.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const FIRE_GUARDIAN_QUERY = "azeroth-rpg.fireGuardian";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = document => document?.getFlag("azeroth-rpg", SPEC.flag) ?? null;
const fighting = token => (game.combats?.contents ?? [...(game.combats ?? [])]).some(combat =>
  combat.combatants.some(row => row.tokenId === token.id && (row.sceneId ?? combat.scene?.id) === token.parent.id));
const snapshot = token => ({ ...flag(token), uuid: token.uuid, inCombat: fighting(token) });

export async function requestFireGuardian(actor, index) {
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const options = [
    { key: "summon", name: "Summon Fire Elemental", description: "Call one guardian outside combat. If you already have one, keep it with its current Health." },
    { key: "dismiss", name: "Dismiss guardian", description: "Remove your guardian. Neither creature can be in combat." }
  ];
  if (game.user.isGM) options.push(
    { key: "recover", name: "Recover interrupted summon", description: "Find the original guardian across all scenes and restore its link. This does not summon or heal it." },
    { key: "clear", name: "Clear missing guardian", description: "Clear the link only if no guardian remains on any scene. This does not summon a replacement." }
  );
  const choice = await chooseOption({ name: SPEC.ability, actor, img: actor.img }, options, null);
  if (!choice) return null;
  const data = { actorUuid: actor.uuid, index, source: sourceOf(actor),
    operation: choice.key === "clear" ? "recover" : choice.key, clearMissing: choice.key === "clear" };
  try {
    const result = gmHere() ? await fireGuardianQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(FIRE_GUARDIAN_QUERY, data, { timeout: 180000 });
    if (result?.ok) ui.notifications?.info({ create: "Your Fire Elemental has arrived.", existing: "Your guardian is already present.",
      dismiss: "Your guardian has been dismissed.", retain: "The original guardian's link has been restored.", clear: "The missing guardian's link has been cleared." }[result.action]);
    else ui.notifications?.warn({ combat: "Neither you nor your guardian can be in combat.",
      missing: "No guardian was found. Use Clear missing guardian to clear its link.",
      none: "You have no guardian to dismiss.", inventoryConflict: "The guardian's link needs GM review. No creature was created or removed.",
      unconfirmed: "The summon could not be confirmed. Ask the GM to recover the original guardian before trying again." }[result?.reason]
      ?? "The guardian could not be changed. Check the caster token, ability, and guardian link.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Fire guardian request", error);
    ui.notifications?.warn("The guardian change could not be confirmed. Ask the GM to review its link.");
    return null;
  }
}

/** A persistent pet is not the repeatable boss-summon button. Persist intent
 * before creating the unlinked token, and retain it on every uncertain write.
 * Recovery inventories every scene on the authoritative GM, never the canvas. */
export async function fireGuardianQueryHandler({ actorUuid, index, source, operation = "summon", clearMissing = false } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id) return refuse("gm");
  if (!["summon", "dismiss", "recover"].includes(operation) || (operation === "recover" && !user.isGM)) return refuse("operation");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
  const sourcePosition = JSON.stringify([sourceToken?.x, sourceToken?.y, sourceToken?.elevation, sourceToken?._source?.level]);
  const valid = () => gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
    && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(sourceToken?.id) === sourceToken
    && sourceToken?.actor === actor && actor.system.health?.value > 0
    && scene.levels?.has(sourceToken._source?.level)
    && JSON.stringify([sourceToken.x, sourceToken.y, sourceToken.elevation, sourceToken._source?.level]) === sourcePosition
    && actor.system.creatureAbilities?.[index]?.name === SPEC.ability
    && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
    && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
    && ![...game.scenes].some(s => [...s.tokens].some(t => t.actor === actor && fighting(t)));
  try {
    if (!valid()) return refuse("invalid");
    const record = flag(actor);
    const owned = [...game.scenes].flatMap(s => [...s.tokens]).filter(t => flag(t)?.ownerUuid === actor.uuid);
    if (operation === "recover") {
      const result = reconcileFireGuardian({ ownerUuid: actor.uuid, record, tokens: owned.map(snapshot),
        inventoryComplete: true, clearMissing: clearMissing === true });
      if (!result.ok) return result;
      if (result.record) await actor.setFlag("azeroth-rpg", SPEC.flag, result.record);
      else await actor.unsetFlag("azeroth-rpg", SPEC.flag);
      return JSON.stringify(flag(actor)) === JSON.stringify(result.record) ? result : refuse("unconfirmed");
    }
    // Inventory also catches an orphaned token when the owner receipt is lost.
    if ((!record && owned.length) || owned.length > 1) return refuse("inventoryConflict");
    const held = record?.tokenUuid ? await fromUuid(record.tokenUuid) : null;
    if (!valid()) return refuse("changed");
    const plan = fireGuardianPlan({ ownerUuid: actor.uuid, alive: true, record,
      token: held ? snapshot(held) : null, guardianInCombat: owned.some(fighting), operation });
    if (!plan.ok) return plan;
    if (plan.action === "existing") return plan;
    if (plan.action === "dismiss") {
      await held.delete();
      if (!valid()) return refuse("changed");
      if (await fromUuid(held.uuid)) return refuse("unconfirmed");
      await actor.unsetFlag("azeroth-rpg", SPEC.flag);
      return flag(actor) === null ? { ok: true, action: "dismiss" } : refuse("unconfirmed");
    }
    const guardian = await summonedActor(SPEC.entry);
    if (!valid() || flag(actor) !== null) return refuse("changed");
    const prototype = guardian.prototypeToken.toObject();
    const cell = { w: scene.grid.sizeX ?? scene.grid.size, h: scene.grid.sizeY ?? scene.grid.size };
    const size = { width: Math.max(1, prototype.width ?? 1) * cell.w, height: Math.max(1, prototype.height ?? 1) * cell.h };
    const standing = scene.tokens.map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h }));
    const [spot] = ringSpots({ origin: { x: sourceToken.x, y: sourceToken.y }, count: 1, cell, size,
      standing, board: scene.dimensions?.rect ?? null, includeOrigin: false });
    if (!spot) return refuse("space");
    const claim = fireGuardianClaim(actor.uuid, foundry.utils.randomID());
    await actor.setFlag("azeroth-rpg", SPEC.flag, claim);
    if (!valid() || JSON.stringify(flag(actor)) !== JSON.stringify(claim)) return refuse("unconfirmed");
    const placed = await scene.createEmbeddedDocuments("Token", [{ ...prototype, actorId: guardian.id, actorLink: false,
      disposition: sourceToken.disposition, elevation: sourceToken.elevation ?? 0,
      level: sourceToken._source.level,
      x: Math.round(spot.x), y: Math.round(spot.y), flags: { ...prototype.flags,
        "azeroth-rpg": { ...prototype.flags?.["azeroth-rpg"], [SPEC.flag]: { ownerUuid: actor.uuid, cast: claim.cast, entry: SPEC.entry } } } }]);
    const token = placed?.[0];
    const confirmed = placed?.length === 1 && scene.tokens.get(token?.id) === token
      ? confirmFireGuardian(claim, snapshot(token)) : null;
    if (!confirmed || !valid()) return refuse("unconfirmed");
    await actor.setFlag("azeroth-rpg", SPEC.flag, confirmed);
    if (JSON.stringify(flag(actor)) !== JSON.stringify(confirmed)) return refuse("unconfirmed");
    try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Summon Fire Elemental</strong></p><p>A Fire Elemental arrives and remains until dismissed.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:summon-fire-elemental",
        casting: false, success: true,
        targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: token.actor?.uuid ?? null, name: token.name }] } } });
    } catch (error) { console.warn("azeroth-rpg | Fire guardian created; feedback unavailable", error); }
    return { ok: true, action: "create", tokenUuid: token.uuid };
  } catch (error) {
    console.warn("azeroth-rpg | Fire guardian requires review", error);
    return refuse("unconfirmed");
  } finally { busy.delete(actor.uuid); }
}
