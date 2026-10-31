import { DEMON_GUARDIANS, DEMON_GUARDIAN_FLAG, demonGuardianPlan, demonGuardianClaim,
  confirmDemonGuardian, reconcileDemonGuardian } from "../rules/demon-guardian.mjs";
import { summonedActor } from "./summon.mjs";
import { ringSpots } from "../rules/summon-places.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const DEMON_GUARDIAN_QUERY = "azeroth-rpg.demonGuardian";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = document => document?.getFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG) ?? null;
const fighting = token => (game.combats?.contents ?? [...(game.combats ?? [])]).some(combat =>
  combat.combatants.some(row => row.tokenId === token.id && (row.sceneId ?? combat.scene?.id) === token.parent.id));
const snapshot = token => ({ ...flag(token), uuid: token.uuid, inCombat: fighting(token) });

export async function requestDemonGuardian(actor, index) {
  const ability = actor.system.creatureAbilities?.[index]?.name;
  const entries = DEMON_GUARDIANS[ability];
  if (!entries) return null;
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const source = sourceOf(actor), userId = game.user.id;
  const held = structuredClone(flag(actor));
  const options = [
    { key: "summon", name: "Summon guardian", description: "Call one companion outside combat. An existing companion keeps its current Health." },
    { key: "dismiss", name: "Dismiss guardian", description: "Dismiss your companion. Neither creature can be in combat." }
  ];
  if (game.user.isGM) options.push(
    { key: "recover", name: "Recover interrupted summon", description: "Find the original companion across all scenes and restore its link without healing it." },
    { key: "clear", name: "Clear missing guardian", description: "Clear the link only if the GM finds no companion on any scene. This does not summon another." }
  );
  const choice = await chooseOption({ name: ability, actor, img: actor.img }, options, null);
  if (!choice || !options.some(option => option.key === choice.key)) return null;
  let entry = held?.entry ?? null;
  if (choice.key === "summon" && !held) {
    if (entries.length === 1) entry = entries[0];
    else {
      const picked = await chooseOption({ name: ability, actor, img: actor.img }, entries.map(name => ({
        key: name, name, description: `One ${name}, with its own turn and Threat Share. It remains until dismissed.`
      })), null);
      if (!picked || !entries.includes(picked.key)) return null;
      entry = picked.key;
    }
  }
  if (game.user.id !== userId || actor.system.creatureAbilities?.[index]?.name !== ability
    || JSON.stringify(flag(actor)) !== JSON.stringify(held)) return null;
  const data = { actorUuid: actor.uuid, index, source, entry,
    operation: choice.key === "clear" ? "recover" : choice.key, clearMissing: choice.key === "clear" };
  try {
    const result = gmHere() ? await demonGuardianQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(DEMON_GUARDIAN_QUERY, data, { timeout: 180000 });
    if (result?.ok) ui.notifications?.info({ create: "Your guardian has arrived.", existing: "Your guardian is already present.",
      dismiss: "Your guardian has been dismissed.", retain: "The original guardian's link has been restored.",
      clear: "The missing guardian's link has been cleared." }[result.action]);
    else ui.notifications?.warn("The guardian could not be changed. Check combat, the caster token and the guardian link. An uncertain summon needs GM recovery.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Demon guardian request", error);
    ui.notifications?.warn("The guardian change could not be confirmed. Ask the GM to review its link before trying again.");
    return null;
  }
}

export async function demonGuardianQueryHandler({ actorUuid, index, source, entry = null, operation = "summon", clearMissing = false } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user?.id) return refuse("gm");
  if (!["summon", "dismiss", "recover"].includes(operation) || (operation === "recover" && !user.isGM)) return refuse("operation");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (!Number.isInteger(index) || busy.has(actor.uuid)) return refuse("busy");
  const ability = actor.system.creatureAbilities?.[index]?.name;
  const choices = DEMON_GUARDIANS[ability];
  if (!choices) return refuse("ability");
  const heldEntry = flag(actor)?.entry;
  entry ??= heldEntry ?? (choices.length === 1 ? choices[0] : null);
  if (!choices.includes(entry)) return refuse("species");
  busy.add(actor.uuid);
  const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
  const level = sourceToken?._source?.level;
  const position = JSON.stringify([sourceToken?.x, sourceToken?.y, sourceToken?.elevation, level]);
  const valid = () => gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
    && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(sourceToken?.id) === sourceToken
    && sourceToken?.actor === actor && actor.system.health?.value > 0
    && actor.system.creatureAbilities?.[index]?.name === ability
    && scene.levels?.get(level)
    && JSON.stringify([sourceToken.x, sourceToken.y, sourceToken.elevation, sourceToken._source?.level]) === position
    && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
    && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
    && ![...game.scenes].some(s => [...s.tokens].some(t => t.actor === actor && fighting(t)));
  try {
    if (!valid()) return refuse("invalid");
    const record = flag(actor);
    const owned = [...game.scenes].flatMap(s => [...s.tokens]).filter(t => flag(t)?.ownerUuid === actor.uuid);
    if (operation === "recover") {
      const result = reconcileDemonGuardian({ ownerUuid: actor.uuid, record, tokens: owned.map(snapshot),
        inventoryComplete: true, clearMissing: clearMissing === true });
      if (!result.ok) return result;
      if (result.record) await actor.setFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG, result.record);
      else await actor.unsetFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG);
      return valid() && JSON.stringify(flag(actor)) === JSON.stringify(result.record) ? result : refuse("unconfirmed");
    }
    // Inventory also catches an orphaned token when the owner receipt is lost.
    if ((!record && owned.length) || owned.length > 1) return refuse("inventoryConflict");
    const held = record?.tokenUuid ? await fromUuid(record.tokenUuid) : null;
    if (!valid() || JSON.stringify(flag(actor)) !== JSON.stringify(record)) return refuse("changed");
    const plan = demonGuardianPlan({ ownerUuid: actor.uuid, alive: true, record, ability, entry,
      token: held ? snapshot(held) : null, guardianInCombat: owned.some(fighting), operation });
    if (!plan.ok) return plan;
    if (plan.action === "existing") return plan;
    if (plan.action === "dismiss") {
      await held.delete();
      if (await fromUuid(held.uuid)) return refuse("unconfirmed");
      if (!valid() || JSON.stringify(flag(actor)) !== JSON.stringify(record)) return refuse("unconfirmed");
      await actor.unsetFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG);
      return valid() && flag(actor) === null ? { ok: true, action: "dismiss" } : refuse("unconfirmed");
    }
    const guardian = await summonedActor(entry);
    if (!valid() || flag(actor) !== null) return refuse("changed");
    const prototype = guardian.prototypeToken.toObject();
    const cell = { w: scene.grid.sizeX ?? scene.grid.size, h: scene.grid.sizeY ?? scene.grid.size };
    const size = { width: Math.max(1, prototype.width ?? 1) * cell.w, height: Math.max(1, prototype.height ?? 1) * cell.h };
    const standing = scene.tokens.filter(t => t._source?.level === level)
      .map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h }));
    const [spot] = ringSpots({ origin: { x: sourceToken.x, y: sourceToken.y }, count: 1, cell, size,
      standing, board: scene.dimensions?.rect ?? null, includeOrigin: false });
    if (!spot) return refuse("space");
    const claim = demonGuardianClaim({ ownerUuid: actor.uuid, cast: foundry.utils.randomID(), ability, entry });
    await actor.setFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG, claim);
    if (!valid() || JSON.stringify(flag(actor)) !== JSON.stringify(claim)) return refuse("unconfirmed");
    const placed = await scene.createEmbeddedDocuments("Token", [{ ...prototype, actorId: guardian.id, actorLink: false,
      level, disposition: sourceToken.disposition, elevation: sourceToken.elevation ?? 0,
      x: Math.round(spot.x), y: Math.round(spot.y), flags: { ...prototype.flags,
        "azeroth-rpg": { ...prototype.flags?.["azeroth-rpg"], [DEMON_GUARDIAN_FLAG]: { ownerUuid: actor.uuid, cast: claim.cast, ability, entry } } } }]);
    const token = placed?.[0];
    const confirmed = placed?.length === 1 && scene.tokens.get(token?.id) === token
      ? confirmDemonGuardian(claim, snapshot(token)) : null;
    if (!confirmed || !valid() || JSON.stringify(flag(actor)) !== JSON.stringify(claim)) return refuse("unconfirmed");
    await actor.setFlag("azeroth-rpg", DEMON_GUARDIAN_FLAG, confirmed);
    if (!valid() || JSON.stringify(flag(actor)) !== JSON.stringify(confirmed)) return refuse("unconfirmed");
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        whisper: [game.user.id],
        content: "<p>A demon guardian arrives and remains until dismissed. It has its own turn and Threat Share.</p>",
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:demon-guardian-arrival",
          casting: false, success: true,
          targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: token.actor?.uuid ?? null, name: token.name }],
          guardianEntry: entry, guardianCast: claim.cast } } });
    } catch (error) { console.warn("azeroth-rpg | Demon guardian feedback", error); }
    return { ok: true, action: "create", tokenUuid: token.uuid };
  } catch (error) {
    console.warn("azeroth-rpg | Demon guardian requires review", error);
    return refuse("unconfirmed");
  } finally { busy.delete(actor.uuid); }
}
