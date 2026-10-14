/**
 * Bound creatures: the door (D-643).
 *
 * A feature's pick - the Companion's beast, the Bound Demon's demon, the
 * Elemental Bond's elemental, the Totem's totem - and a talent's summons
 * make a WORLD ACTOR the bond links: in the Bound folder, owned by the
 * character's owners, its token friendly and linked for a held creature,
 * carrying `flags.azeroth-rpg.bond` back to the owner, and recorded on the
 * feature's `known`. The owner's talents ride it as Active Effects
 * (`rules/bound.mjs#boundEffects`), refreshed by `syncBoundFor` after every
 * feature sync and at every fight's end.
 *
 * A player cannot create a world actor, so a player's bind goes through
 * v14's `User#query` to the active GM's client (`CONFIG.queries`, registered
 * in `module/queries.mjs`); a GM's runs the handler directly. The handler
 * checks what the caller may do before it writes anything.
 */

import { AZEROTH } from "../config.mjs";
import { bindingFor, boundEffects, boundSignatureEffects, capacity, healthAfterMaxChange } from "../rules/bound.mjs";
import { prototypeTokenFor } from "../rules/bestiary.mjs";

export const BIND_QUERY = "azeroth-rpg.bind";
export const UNBIND_QUERY = "azeroth-rpg.unbind";
const FLAG = "bond";

/**
 * The world actor behind a token's synthetic one (D-650). A bond lives on
 * the world actor: a token placed before the bond carries none, and a
 * release pressed on a token's sheet must reach the world, or the slot
 * stays full.
 */
export function worldActorOf(actor) {
  if (!actor) return null;
  return actor.isToken ? (game.actors.get(actor.id) ?? actor) : actor;
}

/** The bond a creature carries, or null - read off the world actor. */
export function bondOf(actor) {
  return worldActorOf(actor)?.getFlag?.("azeroth-rpg", FLAG) ?? null;
}

/** The names of what an owner holds of a kind, for a refusal or a note. */
export function heldNames(owner, kind = null) {
  return boundOf(owner, kind).map(a => a.name);
}

/** The world actors bound to an owner, of one kind or every kind. */
export function boundOf(owner, kind = null) {
  if (!owner) return [];
  return game.actors.filter(a => {
    const b = bondOf(a);
    return b && b.ownerUuid === owner.uuid && (!kind || b.kind === kind);
  });
}

/** How many of a kind count against the owner's capacity. */
export function boundCount(owner, kind) {
  return boundOf(owner, kind).filter(a => !bondOf(a)?.uncounted).length;
}

/** The owner's talents as the rule reads them. */
function talentsOf(owner) {
  return owner.items.filter(i => i.type === "talent").map(i => ({ identifier: i.system.identifier, taken: i.system.taken ?? 0 }));
}

/**
 * An Actor folder by localised name, found or made.
 *
 * **THE `await` IS LOAD-BEARING.** Without it the `??` yields the PROMISE
 * `Folder.create` returns, every caller reads `folder?.id` off a Promise and
 * gets `undefined`, and the creature is made at the root — so the very first
 * creature anybody bound, the one that had to create the folder, never went
 * into it (found while chasing the lead's *generated items aren't staying in
 * their folder*, 2026-09-07).
 */
export async function actorFolder(key) {
  const name = game.i18n.localize(key);
  const held = game.folders.find(f => f.type === "Actor" && f.name === name);
  return held ?? await Folder.create({ name, type: "Actor" });
}

/** The Bound folder, found or made. */
async function boundFolder() {
  return actorFolder("AZEROTH.Bound.Folder");
}

/**
 * The Unbound folder, found or made (the lead, 2026-09-07).
 *
 * A released creature stayed in Bound with no bond on it, so the folder
 * gathered every creature anybody had ever bound and said nothing about which
 * were still held. A release moves it out.
 */
async function unboundFolder() {
  return actorFolder("AZEROTH.Bound.UnboundFolder");
}

/** The ownership a bound creature takes: every non-GM owner of the character, at OWNER. */
function ownershipFor(owner) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const out = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  for (const [userId, level] of Object.entries(owner.ownership ?? {})) {
    if (userId === "default" || level < OWNER || game.users.get(userId)?.isGM) continue;
    out[userId] = OWNER;
  }
  return out;
}

/**
 * Make the world actor for a bond. `entry` is a bestiary document; `block`
 * is `{name, img, system}` for a creature 14 prints no block for (a totem,
 * built by `rules/bound.mjs#totemBlock`). One actor stands for a multiple
 * summon, its tokens unlinked so each carries its own Health.
 */
export async function createBoundActor({ owner, feature = null, entry = null, block = null, kind, until = null, uncounted = false, school = null, count = 1 }) {
  const data = entry
    ? entry.toObject()
    : { name: block.name, type: "npc", img: block.img ?? "icons/svg/mystery-man.svg", system: block.system };
  delete data._id;
  const folder = await boundFolder();
  const linked = count === 1 && until === null;
  const actor = await Actor.create({
    ...data,
    folder: folder?.id ?? null,
    ownership: ownershipFor(owner),
    prototypeToken: { ...prototypeTokenFor({ name: data.name, img: data.img, size: data.system?.size ?? "medium" }), disposition: 1, actorLink: linked },
    flags: {
      ...(data.flags ?? {}),
      "azeroth-rpg": {
        ...(data.flags?.["azeroth-rpg"] ?? {}),
        [FLAG]: {
          ownerUuid: owner.uuid, ownerName: owner.name, kind,
          sourceId: feature?.id ?? null, sourceName: feature?.name ?? null,
          entryUuid: entry?.uuid ?? null, entryName: data.name,
          until, uncounted, school, count, since: Date.now()
        }
      }
    }
  });
  if (feature) {
    const known = (feature.system.known ?? []).map(k => ({ uuid: k.uuid, name: k.name }));
    await feature.update({ "system.known": [...known, { uuid: actor.uuid, name: actor.name }] });
  }
  return actor;
}

/**
 * The GM-side handler of a bind (`CONFIG.queries`): the caller must own the
 * character, the entry must be 14's, and the kind must have room. Throws
 * with the reason, which travels back to the caller as the refusal.
 */
export async function bindQueryHandler({ ownerUuid, featureId = null, entryUuid = null, block = null, kind, until = null, uncounted = false, school = null, count = 1 } = {}, { user = null } = {}) {
  const owner = await fromUuid(ownerUuid);
  if (!owner || owner.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  const entry = entryUuid ? await fromUuid(entryUuid) : null;
  if (entryUuid && (!entry || entry.documentName !== "Actor" || entry.pack !== "azeroth-rpg.bestiary")) {
    throw new Error(game.i18n.format("AZEROTH.Bound.NoEntry", { name: entryUuid }));
  }
  if (!entry && !block?.system) throw new Error(game.i18n.format("AZEROTH.Bound.NoEntry", { name: block?.name ?? "" }));
  const feature = featureId ? owner.items.get(featureId) ?? null : null;
  const room = capacity(kind, { level: owner.system.level ?? 1, talents: talentsOf(owner) });
  if (!uncounted && boundCount(owner, kind) >= room) {
    throw new Error(game.i18n.format("AZEROTH.Bound.Full", { owner: owner.name, count: room, kind: game.i18n.localize(AZEROTH.boundKinds[kind] ?? kind), names: heldNames(owner, kind).join(", ") }));
  }
  const actor = await createBoundActor({ owner, feature, entry, block, kind, until, uncounted, school, count });
  return { uuid: actor.uuid };
}

/** The GM-side handler of a release that deletes: a called creature and its tokens. */
export async function unbindQueryHandler({ uuid } = {}, { user = null } = {}) {
  const bound = await fromUuid(uuid);
  if (!bound || bound.documentName !== "Actor") return { deleted: false };
  const owner = bondOf(bound)?.ownerUuid ? await fromUuid(bondOf(bound).ownerUuid) : null;
  if (user && !(bound.testUserPermission(user, "OWNER") || owner?.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  }
  for (const scene of game.scenes) {
    const ids = scene.tokens.filter(t => t.actorId === bound.id).map(t => t.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
  }
  await bound.delete();
  return { deleted: true };
}

/** Run a query on the GM's client, or the handler here where this client is a GM. */
async function askGM(name, handler, payload) {
  if (game.user.isGM) return handler(payload, { user: game.user });
  const gm = game.users.activeGM;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  return gm.query(name, payload, { timeout: 15000 });
}

/**
 * Bind a creature to a character: the actor made through the GM where it
 * must be, the owner's talents laid on it, the refusal shown where there is
 * one. Resolves to the bound actor, or null.
 */
export async function bind({ owner, feature = null, entry = null, block = null, kind, until = null, uncounted = false, school = null, count = 1 }) {
  const payload = {
    ownerUuid: owner.uuid, featureId: feature?.id ?? null, entryUuid: entry?.uuid ?? null, block,
    kind, until, uncounted, school, count
  };
  let uuid;
  try {
    ({ uuid } = await askGM(BIND_QUERY, bindQueryHandler, payload));
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
  const actor = await fromUuid(uuid);
  await syncBoundFor(owner);
  // A totem standing moves the owner's own passives (04's Earthen Shield, D-774).
  if (kind === "totem") await owner.syncTalentEffects?.()?.catch?.(err => console.error("azeroth-rpg | talent effects", err));
  ui.notifications?.info(game.i18n.format("AZEROTH.Bound.Bound", { owner: owner.name, name: actor?.name ?? "" }));
  return actor;
}

/**
 * The owner's feature that binds a kind - Companion for a companion, Bound
 * Demon for a demon, Elemental Bond, Totem - or null.
 */
export function featureForKind(owner, kind) {
  return (owner?.items ?? []).find(i => i.type === "feature" && bindingFor({ name: i.name, choice: i.system?.choice ?? null })?.kind === kind) ?? null;
}

/**
 * Bind a creature that already stands in the world (D-649): a Boar dragged
 * in from 14, a companion picked before the door existed. The bond flag is
 * written onto it, the character's owners take ownership, the token goes
 * friendly and linked, the actor moves to the Bound folder, the owner's
 * feature learns it, and the owner's talents lay their effects. Held until
 * released. Refused at capacity, and where this client cannot write the
 * creature.
 */
export async function adopt({ owner, actor, kind, feature = null, until = null, uncounted = false, school = null }) {
  actor = worldActorOf(actor);
  if (!owner || owner.type !== "character" || !actor || actor.type !== "npc" || !AZEROTH.boundKinds[kind]) return null;
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.NotOwner"));
    return null;
  }
  const room = capacity(kind, { level: owner.system.level ?? 1, talents: talentsOf(owner) });
  // **A CREATURE THAT COUNTS AGAINST NOTHING** (04's Command Demon: *does not
  // count against the number of Bound Demons you may hold*; D-775) is bound at any
  // count, as Ritual of Summoning's three are (D-643).
  if (!uncounted && boundCount(owner, kind) >= room) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Bound.Full", { owner: owner.name, count: room, kind: game.i18n.localize(AZEROTH.boundKinds[kind]), names: heldNames(owner, kind).join(", ") }));
    return null;
  }
  const folder = await boundFolder();
  const source = actor._stats?.compendiumSource ?? null;
  await actor.update({
    folder: folder?.id ?? actor.folder?.id ?? null,
    ownership: { ...(actor.ownership ?? {}), ...ownershipFor(owner) },
    "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    "prototypeToken.actorLink": true,
    [`flags.azeroth-rpg.${FLAG}`]: {
      ownerUuid: owner.uuid, ownerName: owner.name, kind,
      sourceId: feature?.id ?? null, sourceName: feature?.name ?? null,
      entryUuid: typeof source === "string" && source.startsWith("Compendium.azeroth-rpg.bestiary.") ? source : null, entryName: actor.name,
      // *Bound to you until your next Long Rest* (04's Command Demon, D-775):
      // `releaseAtLongRest` reads it.
      until: until === "longRest" ? "longRest" : null, uncounted: uncounted === true,
      // Demonic Aegis's school, chosen at the pick (04 at rank 2; D-775).
      school: typeof school === "string" && school ? school : null, count: 1, since: Date.now()
    }
  });
  if (feature && !(feature.system.known ?? []).some(k => k.uuid === actor.uuid)) {
    const known = (feature.system.known ?? []).map(k => ({ uuid: k.uuid, name: k.name }));
    await feature.update({ "system.known": [...known, { uuid: actor.uuid, name: actor.name }] });
  }
  // Its tokens already on the table follow the world actor from here: linked, and friendly.
  for (const scene of game.scenes) {
    const updates = scene.tokens.filter(t => t.actorId === actor.id && (!t.actorLink || t.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY))
      .map(t => ({ _id: t.id, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
  await syncBoundFor(owner);
  if (kind === "totem") await owner.syncTalentEffects?.()?.catch?.(err => console.error("azeroth-rpg | talent effects", err));
  ui.notifications?.info(game.i18n.format("AZEROTH.Bound.Bound", { owner: owner.name, name: actor.name }));
  return actor;
}

/** The query Command Demon's bind of a creature this client does not own goes through (D-775). */
export const ADOPT_QUERY = "azeroth-rpg.adopt";

/**
 * The GM-side handler of Command Demon's bind (04: *On success that Demon is Bound
 * to you until your next Long Rest and does not count against the number of Bound
 * Demons you may hold*; D-775). The asker must own the warlock, and the creature is
 * judged again here: an NPC, a demon, held by nobody. Throws with the reason.
 *
 * @returns {Promise<{uuid: string}>}
 */
export async function adoptQueryHandler({ ownerUuid = null, actorUuid = null, featureId = null } = {}, { user = null } = {}) {
  const owner = ownerUuid ? await fromUuid(ownerUuid) : null;
  if (owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  const target = worldActorOf(actorUuid ? await fromUuid(actorUuid) : null);
  if (target?.documentName !== "Actor" || target.type !== "npc") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (target.system?.creatureType !== "demon") throw new Error(game.i18n.format("AZEROTH.CommandDemon.NotDemon", { target: target.name }));
  if (bondOf(target)) throw new Error(game.i18n.format("AZEROTH.CommandDemon.Bound", { target: target.name }));
  const feature = featureId ? owner.items.get(featureId) ?? null : null;
  const made = await adopt({ owner, actor: target, kind: "demon", feature, until: "longRest", uncounted: true });
  if (!made) throw new Error(game.i18n.format("AZEROTH.CommandDemon.Refused", { target: target.name }));
  return { uuid: made.uuid };
}

/**
 * **COMMAND DEMON'S BIND** (04, D-775): D-649's adopt, held until the warlock's next
 * Long Rest and counted against nothing - here where this client may write the
 * demon, through the active GM's client otherwise (`ADOPT_QUERY`), never
 * `game.socket`. The refusal is said in words.
 *
 * @param {{owner: Actor, actor: Actor, feature?: Item|null}} o
 * @returns {Promise<Actor|null>}
 */
export async function commandDemon({ owner, actor, feature = null }) {
  const target = worldActorOf(actor);
  if (!owner || !target) return null;
  if (target.isOwner) return adopt({ owner, actor: target, kind: "demon", feature, until: "longRest", uncounted: true });
  try {
    const { uuid } = await askGM(ADOPT_QUERY, adoptQueryHandler, { ownerUuid: owner.uuid, actorUuid: target.uuid, featureId: feature?.id ?? null });
    return uuid ? await fromUuid(uuid) : null;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * **WHAT A LONG REST RELEASES** (04's Command Demon: *Bound to you until your next
 * Long Rest*; D-775): every bond the owner holds *until* one, through the one
 * release door - the creature unbound and left standing.
 *
 * @param {Actor} owner
 */
export async function releaseAtLongRest(owner) {
  for (const bound of boundOf(owner)) {
    if (bondOf(bound)?.until === "longRest") await release(owner, bound.uuid);
  }
}

/**
 * Release a bond: the owner's effects and the flag come off a held creature,
 * which stays in the folder; a creature called for the encounter goes, with
 * its tokens. The feature's `known` forgets it either way.
 */
export async function release(owner, uuid) {
  for (const feature of owner.items.filter(i => i.type === "feature" && (i.system.known ?? []).some(k => k.uuid === uuid))) {
    await feature.update({ "system.known": feature.system.known.filter(k => k.uuid !== uuid).map(k => ({ uuid: k.uuid, name: k.name })) });
  }
  // A token's uuid resolves to its synthetic actor; the bond is the world's (D-650).
  const bound = worldActorOf(await fromUuid(uuid));
  if (!bound) return null;
  const bond = bondOf(bound);
  if (bond?.until === "encounter") {
    try {
      await askGM(UNBIND_QUERY, unbindQueryHandler, { uuid: bound.uuid });
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
    return null;
  }
  const effects = bound.effects.filter(e => e.getFlag("azeroth-rpg", FLAG)).map(e => e.id);
  if (effects.length && bound.isOwner) await bound.deleteEmbeddedDocuments("ActiveEffect", effects);
  if (bound.isOwner) await bound.unsetFlag("azeroth-rpg", FLAG);
  // Out of Bound and into Unbound: the folder is what says which creatures are
  // still held, and a released one that stays in it says the opposite. Only
  // where it is IN the Bound folder, so a creature adopted from the world
  // (D-649) goes back to wherever it came from rather than being swept up.
  if (bound.isOwner) {
    const from = await boundFolder();
    if (from?.id && bound.folder?.id === from.id) {
      const to = await unboundFolder();
      if (to?.id) await bound.update({ folder: to.id });
    }
  }
  // A totem gone moves the owner's own passives (04's Earthen Shield, D-774).
  if (bond?.kind === "totem") await owner.syncTalentEffects?.()?.catch?.(err => console.error("azeroth-rpg | talent effects", err));
  ui.notifications?.info(game.i18n.format("AZEROTH.Bound.Released", { owner: owner.name, name: bound.name }));
  return bound;
}

/**
 * **A BOUND TOTEM DELETED** (04's Earthen Shield: *While a totem of yours
 * stands*; D-774): a totem destroyed, or one the fight's end took (`_leaveFight`
 * deletes what was called for the encounter, D-643), moves its owner's passives.
 * Run on the active GM's client alone, which may write every owner, so two
 * clients never sync one character at once.
 */
export function registerBoundHooks() {
  Hooks.on("deleteActor", actor => {
    if (!game.users?.activeGM?.isSelf) return;
    const bond = actor?.getFlag?.("azeroth-rpg", FLAG) ?? null;
    if (bond?.kind !== "totem" || !bond.ownerUuid) return;
    let owner = null;
    try {
      owner = fromUuidSync(bond.ownerUuid);
    } catch {
      owner = null;
    }
    owner?.syncTalentEffects?.()?.catch?.(err => console.error("azeroth-rpg | talent effects", err));
  });
}

const sameChanges = (a, b) => JSON.stringify((a ?? []).map(c => [c.key, c.type, String(c.value)]))
  === JSON.stringify((b ?? []).map(c => [c.key, c.type, String(c.value)]));

/**
 * Lay the owner's talents on every creature bound to them (D-643): one
 * Active Effect per talent, created, updated or deleted as the ranks and
 * the fight's buffs say, and the creature's Health kept in step with a
 * maximum that moved. `encounter` names the buffs switched on for this
 * fight by talent identifier; null clears them.
 */
export async function syncBoundFor(owner, { encounter } = {}) {
  if (owner?.type !== "character") return { updated: 0 };
  if (encounter === null) await owner.unsetFlag("azeroth-rpg", "boundEncounter");
  else if (encounter && typeof encounter === "object") {
    await owner.setFlag("azeroth-rpg", "boundEncounter", { ...(owner.getFlag("azeroth-rpg", "boundEncounter") ?? {}), ...encounter });
  }
  const active = owner.getFlag("azeroth-rpg", "boundEncounter") ?? {};
  const talents = talentsOf(owner);
  const snapshot = {
    healthMax: owner.system.health?.max ?? 0,
    tier: owner.system.tier ?? 1,
    wildBond: owner.items.some(i => i.type === "feature" && i.name === "Wild Bond"),
    // Whether the owner wears Metamorphosis (02 §7, D-769): Demonic
    // Ascendance's *While you hold that form, your Bound Demons add your tier to
    // their damage*. It was `false` and nothing set it.
    inMetamorphosis: owner.shape?.kind === "metamorphosis"
  };
  let touched = 0;
  for (const bound of boundOf(owner)) {
    if (!bound.isOwner) continue;
    const bond = bondOf(bound);
    // The school chosen at the summoning rides the bond (04's Demonic Aegis at rank
    // 2, D-775), and `boundEffects` lays its Ward.
    const creature = { name: bound.name, ap: bound._source.system?.ap ?? {}, weightClass: bound.system.weightClass, tier: bound.system.tier, school: bond?.school ?? null };
    // **AND WHAT THE OWNER IS WEARING** (D-698). Four Ahn'Qiraj set bonuses
    // improve a bound creature, and a Signature had no way to reach one; the
    // rows are in `boundEffects`' own shape and are diffed beside the
    // talents, keyed by the ITEM rather than by a talent identifier.
    const desired = [
      ...boundEffects(bond.kind, snapshot, talents, creature, active),
      ...boundSignatureEffects(owner.system?.signatureEffects?.bound ?? [])
    ];
    const held = bound.effects.filter(e => e.getFlag("azeroth-rpg", FLAG)?.talent);
    const oldMax = bound.system.health?.max ?? 0;
    const creates = [];
    const updates = [];
    for (const d of desired) {
      const data = {
        name: d.name ? `${game.i18n.localize(d.label)} (${d.name})` : game.i18n.localize(d.label),
        img: "icons/svg/aura.svg", origin: owner.uuid,
        system: { changes: d.changes },
        flags: { "azeroth-rpg": { [FLAG]: { talent: d.talent, encounter: d.encounter } } }
      };
      const have = held.find(e => e.getFlag("azeroth-rpg", FLAG).talent === d.talent);
      if (!have) creates.push(data);
      else if (!sameChanges(have.system?.changes, d.changes)) updates.push({ _id: have.id, ...data });
    }
    const deletes = held.filter(e => !desired.some(d => d.talent === e.getFlag("azeroth-rpg", FLAG).talent)).map(e => e.id);
    if (!creates.length && !updates.length && !deletes.length) continue;
    if (deletes.length) await bound.deleteEmbeddedDocuments("ActiveEffect", deletes);
    if (updates.length) await bound.updateEmbeddedDocuments("ActiveEffect", updates);
    if (creates.length) await bound.createEmbeddedDocuments("ActiveEffect", creates);
    touched++;
    const newMax = bound.system.health?.max ?? 0;
    const value = healthAfterMaxChange(bound.system.health?.value ?? 0, oldMax, newMax);
    if (value !== (bound.system.health?.value ?? 0)) await bound.update({ "system.health.value": value });
  }
  return { updated: touched };
}

/** A fight's end (D2 §7): the buffs bought for it lapse and the creatures called for it go. */
export async function endBoundEncounter(owner) {
  if (owner?.type !== "character") return;
  for (const bound of boundOf(owner)) {
    if (bondOf(bound)?.until === "encounter") await release(owner, bound.uuid);
  }
  await syncBoundFor(owner, { encounter: null });
}

/** Every bond an owner holds, released - for the owner's own deletion. */
export async function releaseAll(owner) {
  for (const bound of boundOf(owner)) await release(owner, bound.uuid);
}
