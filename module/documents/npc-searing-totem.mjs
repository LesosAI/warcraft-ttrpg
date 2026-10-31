import { NPC_SEARING_TOTEM as SPEC, searingTotemCleanup, recoverSearingTotem, searingTotemPlan, searingTotemClaim } from "../rules/npc-searing-totem.mjs";
import { summonedActor } from "./summon.mjs";
import { reviewNpcSearingPlacement } from "./npc-searing-placement.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

export const NPC_SEARING_QUERY = "azeroth-rpg.npcSearingTotem";

const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = doc => doc?.getFlag("azeroth-rpg", SPEC.flag) ?? null;
const tokens = () => [...game.scenes].flatMap(scene => [...scene.tokens]);
const snapshot = token => ({ ...flag(token), uuid: token.uuid, health: token.actor?.system?.health?.value });
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function joinTotemCombat(token, record) {
  const fight = record.combatId ? game.combats?.get(record.combatId) : null;
  if (!fight || !fight.combatants.some(c => c.tokenId === record.source?.tokenId && c.sceneId === record.source?.sceneId)) return true;
  const held = () => fight.combatants.some(c => c.tokenId === token.id && c.sceneId === record.source.sceneId);
  if (!held()) await fight.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: record.source.sceneId, actorId: token.actorId }]);
  return held();
}

export async function requestNpcSearingTotem(actor, index) {
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const options = [{ key: "plant", name: "Plant Searing Totem", description: "Choose an empty space within 5 feet, then spend a Half-Action and 2 Mana. A held totem is kept without another charge." }];
  if (game.user.isGM) options.push(
    { key: "recover", name: "Recover interrupted placement", description: "Find the original totem without spending Mana, healing it or extending its lifetime." },
    { key: "clear", name: "Clear missing totem", description: "Clear the record only when no totem remains on any scene. This does not refund payment or create a replacement." }
  );
  const chosen = await chooseOption({ name: SPEC.ability, actor, img: actor.img }, options, null);
  if (!chosen) return null;
  const payload = { actorUuid: actor.uuid, index, source: sourceOf(actor), operation: chosen.key };
  try {
    const result = gmHere() ? await npcSearingTotemQueryHandler(payload, { user: game.user })
      : await game.users?.activeGM?.query(NPC_SEARING_QUERY, payload, { timeout: 180000 });
    if (result?.ok) ui.notifications?.info({ create: "Searing Totem planted.", existing: "Your Searing Totem is already standing.",
      retain: "The original totem is linked with its remaining lifetime.", clear: "The missing totem record is cleared.", delete: "The expired or destroyed totem has been removed." }[result.action]);
    else if (result?.reason !== "cancelled") ui.notifications?.warn(result?.paid || result?.reason === "unconfirmed"
      ? "Placement could not be confirmed. Ask the GM to recover the original totem before trying again. Payment has not been refunded."
      : "The totem could not be placed. Check the caster, Mana, Half-Action, and summon record.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | NPC Searing Totem request", error);
    ui.notifications?.warn("The totem change could not be confirmed. Ask the GM to review its record before trying again.");
    return null;
  }
}

export async function npcSearingTotemQueryHandler({ actorUuid, index, source, operation = "plant" } = {}, { user } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid, consumed });
  if (!gmHere() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (["recover", "clear"].includes(operation)) return user.isGM
    ? recoverNpcSearingTotem(actor, { clearMissing: operation === "clear" }) : refuse("gm");
  if (operation !== "plant" || !Number.isInteger(index) || busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const scene = game.scenes.get(source?.sceneId), anchor = scene?.tokens.get(source?.tokenId);
  const power = actor.system.power?.value, now = game.time.worldTime;
  const fightOf = () => game.combats?.find(c => c.combatants.some(cb => cb.tokenId === anchor?.id && (cb.sceneId ?? c.scene?.id) === scene?.id)) ?? null;
  const fight = fightOf();
  const turn = fight ? `${fight.round}:${fight.turn}` : null;
  let selection = null;
  const valid = () => gmHere() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
    && scene && game.scenes.get(scene.id) === scene && scene.tokens.get(anchor?.id) === anchor && anchor?.actor === actor
    && actor.system.health?.value > 0 && actor.system.creatureAbilities?.[index]?.name === SPEC.ability
    && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
    && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
    && game.time.worldTime === now && Number.isFinite(now)
    && fightOf() === fight
    && (!fight || (game.combats.get(fight.id) === fight && `${fight.round}:${fight.turn}` === turn))
    && actor.system.power?.value === power - (consumed ? SPEC.power : 0)
    && (!selection || selection.valid());
  try {
    if (!valid()) return refuse("invalid");
    await cleanupOwner(actor);
    if (!valid()) return refuse("changed");
    const plan = searingTotemPlan({ ownerUuid: actor.uuid, alive: true, power, now, record: flag(actor), tokens: tokens().map(snapshot) });
    if (!plan.ok || plan.action === "existing") return plan;
    const totem = await summonedActor(SPEC.entry);
    if (!valid()) return refuse("changed");
    const prototype = totem.prototypeToken.toObject();
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    selection = await reviewNpcSearingPlacement({ actor, scene, sourceToken: anchor, prototype, chooseOption });
    if (!selection || !valid() || flag(actor)) return refuse("cancelled");
    if (!await spendTurnBudget(actor, SPEC.action)) return refuse("action");
    paid = true;
    if (!valid()) return refuse("changed");
    const claim = searingTotemClaim({ ownerUuid: actor.uuid, cast: foundry.utils.randomID(), now });
    Object.assign(claim, { combatId: fight?.id ?? null, source: { sceneId: scene.id, tokenId: anchor.id } });
    await actor.update({ "system.power.value": plan.powerAfter, [`flags.azeroth-rpg.${SPEC.flag}`]: claim });
    consumed = true;
    if (!valid() || !same(flag(actor), claim)) return refuse("unconfirmed");
    const placed = await scene.createEmbeddedDocuments("Token", [{ ...prototype, actorId: totem.id, actorLink: false,
      disposition: anchor.disposition, x: selection.x, y: selection.y, elevation: selection.elevation,
      flags: { ...prototype.flags, "azeroth-rpg": { ...prototype.flags?.["azeroth-rpg"], [SPEC.flag]: {
        ownerUuid: actor.uuid, cast: claim.cast, expiresAt: claim.expiresAt } } } }]);
    const token = placed?.[0];
    const recovered = placed?.length === 1 && scene.tokens.get(token?.id) === token
      ? recoverSearingTotem({ record: claim, tokens: [snapshot(token)], inventoryComplete: true }) : null;
    if (!recovered?.ok) return refuse("unconfirmed");
    await actor.setFlag("azeroth-rpg", SPEC.flag, recovered.record);
    if (!same(flag(actor), recovered.record)) return refuse("unconfirmed");
    if (!await joinTotemCombat(token, recovered.record)) return refuse("combatUnconfirmed");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>Searing Totem</strong></p><p>A Searing Totem is planted. It lasts 42 seconds or until destroyed.</p>",
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:npc-searing-totem",
        casting: false, success: true,
        targets: [{ sceneId: scene.id, tokenId: token.id, actorUuid: token.actor?.uuid ?? null, name: token.name }] } } });
    return { ok: true, action: "create", tokenUuid: token.uuid, paid, consumed };
  } catch (error) { console.warn("azeroth-rpg | NPC Searing Totem placement", error); return refuse("unconfirmed"); }
  finally { busy.delete(actor.uuid); }
}

/** Called under the same per-owner lock as placement. An uncertain deletion
 * keeps the receipt so a subsequent complete inventory can finish cleanup. */
async function cleanupOwner(owner) {
  const record = flag(owner);
  if (!record) return { ok: true, action: "none" };
  if (record.ownerUuid !== owner.uuid) return { ok: false, reason: "owner" };
  const all = tokens();
  const plan = searingTotemCleanup({ record, tokens: all.map(snapshot), now: game.time.worldTime, inventoryComplete: true });
  if (!plan.ok || plan.action === "retain") return plan;
  if (!gmHere() || !same(flag(owner), record)) return { ok: false, reason: "changed" };
  if (plan.action === "delete") {
    const token = all.find(t => t.uuid === plan.tokenUuid);
    await token.delete();
    if (tokens().some(t => t.uuid === plan.tokenUuid)) return { ok: false, reason: "unconfirmed" };
  }
  if (!same(flag(owner), record)) return { ok: false, reason: "changed" };
  await owner.unsetFlag("azeroth-rpg", SPEC.flag);
  return flag(owner) === null ? plan : { ok: false, reason: "unconfirmed" };
}

/** Sweep world and synthetic owners. The active GM inventories every scene,
 * including scenes not viewed by any client. Never uses canvas membership. */
export async function cleanupNpcSearingTotems() {
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return [];
  const all = tokens();
  const owners = new Map([...game.actors, ...all.map(t => t.actor)].filter(a => a?.uuid && flag(a)).map(a => [a.uuid, a]));
  const results = [];
  for (const owner of owners.values()) {
    if (busy.has(owner.uuid)) continue;
    busy.add(owner.uuid);
    try { results.push({ ownerUuid: owner.uuid, ...await cleanupOwner(owner) }); }
    catch (error) { console.warn("azeroth-rpg | Searing Totem cleanup", error); results.push({ ownerUuid: owner.uuid, ok: false, reason: "unconfirmed" }); }
    finally { busy.delete(owner.uuid); }
  }
  // A deleted summoner or lost owner receipt must not make a totem immortal.
  // Its own creation flag retains the original deadline. Uncertain receipts
  // are left for explicit review instead of guessing their identity here.
  for (const token of tokens()) {
    const record = flag(token);
    const owner = record?.ownerUuid ? fromUuidSync(record.ownerUuid) : null;
    if (!record?.ownerUuid || !record.cast || !Number.isFinite(record.expiresAt)
      || game.time.worldTime < record.expiresAt || flag(owner) || busy.has(record.ownerUuid)) continue;
    try {
      if (!gmHere()) break;
      await token.delete();
      results.push({ tokenUuid: token.uuid, ok: !tokens().some(t => t.uuid === token.uuid), action: "orphanExpiry" });
    } catch (error) { console.warn("azeroth-rpg | Orphaned Searing Totem expiry", error); }
  }
  return results;
}

/** GM-only repair, also used after a placement response was lost. */
export async function recoverNpcSearingTotem(owner, { clearMissing = false } = {}) {
  if (!gmHere() || !owner?.uuid || busy.has(owner.uuid)) return { ok: false, reason: "gmOrBusy" };
  busy.add(owner.uuid);
  try {
    const record = flag(owner);
    if (record?.ownerUuid !== owner.uuid) return { ok: false, reason: "owner" };
    const plan = recoverSearingTotem({ record, tokens: tokens().map(snapshot), inventoryComplete: true, clearMissing });
    if (!plan.ok) return plan;
    if (plan.record) await owner.setFlag("azeroth-rpg", SPEC.flag, plan.record);
    else await owner.unsetFlag("azeroth-rpg", SPEC.flag);
    if (!same(flag(owner), plan.record)) return { ok: false, reason: "unconfirmed" };
    // An already-expired recovered token must not gain another turn.
    if (!plan.record) return plan;
    const cleaned = await cleanupOwner(owner);
    if (cleaned.ok && cleaned.action === "retain") {
      const token = tokens().find(t => t.uuid === cleaned.tokenUuid);
      if (!token || !await joinTotemCombat(token, plan.record)) return { ok: false, reason: "combatUnconfirmed" };
    }
    return cleaned;
  } catch (error) {
    console.warn("azeroth-rpg | Searing Totem recovery", error);
    return { ok: false, reason: "unconfirmed" };
  } finally { busy.delete(owner.uuid); }
}
