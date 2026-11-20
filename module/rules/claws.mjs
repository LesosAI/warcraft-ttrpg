/**
 * **THE SOVEREIGN'S CLAWS, AS AN ITEM THE CLASS FEATURE KEEPS** (02 §7's Blood-Forged
 * Claws; the San'layn and Sovereign plan, C1; the lead, R5 and R6). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * *"this is considered "unarmed" but should be able to be "equipped" on the character
 * sheet without taking a gear slot"* (R5), and *"An Equip toggle on the sheet. No bag slot
 * and no paper-doll tile of their own. While equipped, the off hand is the claws, so no
 * shield or second weapon. Still one off-hand claw attack a round."* (R6).
 *
 * The claws are the weapons pack's `sovereign-claws`, parsed from 08 §7's row, embedded
 * on the character because the card's Off-Hand button needs an item id. **The feature is
 * what keeps them**: `AzerothActor#_syncClassFeaturesNow` asks `clawsDue` after every
 * sync and writes its answer with the operation key `azerothClaws: "sync"`, the one key
 * `AzerothItem`'s batch seam lets through (D-1164):
 *
 * - holding Blood-Forged Claws and no claws: embed one, UNEQUIPPED;
 * - holding the feature and more than one: delete the extras, keeping the first by id
 *   (an embedded collection's order is not stable across a re-sync, CLAUDE.md §15);
 * - not holding the feature: delete every claws item.
 *
 * `clawsRefusal` is the batch seam's judgement of every other write, in words.
 */

import { CLAWS_ID, isClaws } from "./unarmed.mjs";

/** The class feature that grants the claws (02 §7, level 1). */
export const CLAWS_FEATURE = "Blood-Forged Claws";

/** The operation key the sync writes with, and the only write the seam lets past (D-1164). */
export const CLAWS_SYNC_KEY = "azerothClaws";
export const CLAWS_SYNC = "sync";

export { CLAWS_ID };

/**
 * **THE EQUIP TOGGLE'S CUE** (the plan's C14: *"claw rake; ... the Equip toggle (a brief
 * cue)"*; D-1168): the sheet's equip write carries `{sceneId, tokenId}` under this option, and
 * every client's `updateItem` hook plays the `claws-equip` row for itself
 * (`animation/records.mjs#clawsEquipRecords`). An unequip, and any other item, implies nothing.
 */
export const CLAWS_EQUIP_OPTION = "azerothClawsEquip";

/** The animation row the cue plays (`animation-table.mjs#FEATURE_ANIMATIONS`). */
export const CLAWS_EQUIP_CUE = "claws-equip";

/**
 * The cue's facts, or null: the claws, an update that equips them, and a token named.
 *
 * @param {object} item  the updated item
 * @param {object} changed  the update's diff
 * @param {object} options  the operation's options
 * @returns {{sceneId: string, tokenId: string}|null}
 */
export function clawsEquipCue(item, changed, options) {
  if (!item || item.type !== "weapon" || !isClaws(item)) return null;
  if (changed?.system?.equipped !== true) return null;
  const at = options?.[CLAWS_EQUIP_OPTION] ?? null;
  if (!at || typeof at.sceneId !== "string" || typeof at.tokenId !== "string" || !at.sceneId || !at.tokenId) return null;
  return { sceneId: at.sceneId, tokenId: at.tokenId };
}

/** Every refusal, as `lang/en.json` keys. */
export const CLAWS_REFUSALS = Object.freeze({
  delete: "AZEROTH.Claws.Refuse.Delete",
  create: "AZEROTH.Claws.Refuse.Create",
  offHand: "AZEROTH.Claws.Refuse.OffHand",
  container: "AZEROTH.Claws.Refuse.Container",
  forge: "AZEROTH.Claws.Refuse.Forge",
  coating: "AZEROTH.Claws.Refuse.Coating",
  affix: "AZEROTH.Claws.Refuse.Affix"
});

const idOf = item => String(item?.id ?? item?._id ?? "");

/**
 * What the sync owes: `{create, remove}`.
 *
 * @param {{holdsFeature: boolean, items?: Iterable<object>}} o
 *   `holdsFeature`: Blood-Forged Claws stands on the actor after this sync; `items`: every
 *   item the actor holds.
 * @returns {{create: boolean, remove: string[]}}
 */
export function clawsDue({ holdsFeature = false, items = [] } = {}) {
  const held = [...(items ?? [])].filter(i => i && i.type === "weapon" && isClaws(i))
    .sort((a, b) => idOf(a).localeCompare(idOf(b)));
  if (!holdsFeature) return { create: false, remove: held.map(idOf).filter(Boolean) };
  if (!held.length) return { create: true, remove: [] };
  return { create: false, remove: held.slice(1).map(idOf).filter(Boolean) };
}

/**
 * The shape kinds of 04's Red Feast form (the Blood Monarch, R57; the plan's B.11 names
 * `bloodQueen`), either of which spends no Blooded Claws use.
 */
export const RED_FEAST_SHAPES = Object.freeze(["bloodMonarch", "bloodQueen"]);

/** The talents the claw count reads, by identifier (04's Ravenous). */
export const CLAW_TALENTS = Object.freeze({ blooded: "blooded-claws", raking: "raking-claws" });

/**
 * **THE CLAW FACTS, AS ONE PLAIN OBJECT** (the plan's C16; D-1166): what
 * `initiative.mjs#offHandRolls` and `#freeOffHand` read, off the talents taken, the
 * claws in hand, the shape worn, the tier and the uses spent. `AzerothActor#clawFacts`
 * hands this the actor's own facts; a door may hand it its own.
 *
 * @param {{talents?: Array<{identifier?: string, taken?: number}>, claws?: boolean, shapeKind?: string|null, tier?: number, spent?: number}} o
 * @returns {{claws: boolean, bloodedClawsRank: number, rakingClawsRank: number, redFeastForm: boolean, tier: number, spent: number}}
 */
export function clawFactsFrom({ talents = [], claws = false, shapeKind = null, tier = 1, spent = 0 } = {}) {
  const rank = id => Math.max(0, Math.trunc(Number((talents ?? []).find(t => t?.identifier === id)?.taken)) || 0);
  return {
    claws: claws === true,
    bloodedClawsRank: rank(CLAW_TALENTS.blooded),
    rakingClawsRank: rank(CLAW_TALENTS.raking),
    redFeastForm: RED_FEAST_SHAPES.includes(shapeKind),
    tier: Math.max(1, Math.trunc(Number(tier)) || 1),
    spent: Math.max(0, Math.trunc(Number(spent)) || 0)
  };
}

/**
 * The claws as the sync embeds them: the pack copy's data, unequipped, in the off hand,
 * in no container, with no coating, no affix and no Forge record.
 *
 * @param {object} data  the pack copy's `toObject()`
 * @returns {object}
 */
export function clawsCreateData(data = {}) {
  const system = { ...(data.system ?? {}), equipped: false, offHand: true, container: null };
  if ("well" in system) system.well = null;
  const flags = { ...(data.flags ?? {}) };
  const own = { ...(flags["azeroth-rpg"] ?? {}) };
  delete own.coating;
  delete own.generated;
  flags["azeroth-rpg"] = own;
  const out = { ...data, system, flags };
  delete out._id;
  return out;
}

/** A value read off a nested or a dotted change. */
function changed(change, path) {
  if (!change || typeof change !== "object") return { has: false, value: undefined };
  if (Object.hasOwn(change, path)) return { has: true, value: change[path] };
  const parts = path.split(".");
  let at = change;
  for (const part of parts) {
    if (!at || typeof at !== "object" || !Object.hasOwn(at, part)) return { has: false, value: undefined };
    at = at[part];
  }
  return { has: true, value: at };
}

/**
 * **WHY A WRITE ON THE CLAWS IS REFUSED**, as a key, or null (D-1164). The plan's C1:
 * `offHand: false`, a container write, the Forge, a coating, an affix. The claws are an
 * unarmed strike, never carried, sold, forged or coated (B.5).
 *
 * @param {object} change  an update's change, expanded or dotted
 * @returns {string|null}
 */
export function clawsUpdateRefusal(change = {}) {
  const off = changed(change, "system.offHand");
  if (off.has && off.value !== true) return CLAWS_REFUSALS.offHand;
  const box = changed(change, "system.container");
  if (box.has && box.value !== null && box.value !== "" && box.value !== undefined) return CLAWS_REFUSALS.container;
  const coat = changed(change, "flags.azeroth-rpg.coating");
  if (coat.has && coat.value) return CLAWS_REFUSALS.coating;
  const forged = changed(change, "flags.azeroth-rpg.generated");
  if (forged.has && forged.value) return CLAWS_REFUSALS.forge;
  const affixes = changed(change, "system.affixes");
  if (affixes.has && Array.isArray(affixes.value) && affixes.value.length) return CLAWS_REFUSALS.affix;
  const rarity = changed(change, "system.rarity");
  if (rarity.has && rarity.value && rarity.value !== "common") return CLAWS_REFUSALS.forge;
  return null;
}

/**
 * **WHY A CREATE OF THE CLAWS ON A CHARACTER IS REFUSED**, or null. Only the sync makes
 * them; a hand create is refused unless the character holds the feature and no claws yet
 * (a GM restoring them by hand), and a forged copy never.
 *
 * @param {{data: object, holdsFeature: boolean, held: number, sync: boolean}} o
 * @returns {string|null}
 */
export function clawsCreateRefusal({ data = {}, holdsFeature = false, held = 0, sync = false } = {}) {
  if (sync) return null;
  if (data?.flags?.["azeroth-rpg"]?.generated) return CLAWS_REFUSALS.forge;
  if (data?.flags?.["azeroth-rpg"]?.coating) return CLAWS_REFUSALS.coating;
  if (!holdsFeature || held > 0) return CLAWS_REFUSALS.create;
  return null;
}

/**
 * **THE TURN A CLAW ROLL WAS MADE IN, STAMPED ON ITS CARD** (D-1166's next-roll button; the review's S1): in
 * a fight its id, round and turn; out of one the world second. The next roll's button answers for that
 * turn alone, as `extraStrikeFromCard` reads the round's record.
 *
 * @param {{id?: string, round?: number, turn?: number}|null} fight  the fight as it stands, or null
 * @param {number} worldTime
 */
export function clawRollStamp(fight = null, worldTime = 0) {
  return fight?.id
    ? { combatId: fight.id, round: fight.round ?? null, turn: fight.turn ?? null }
    : { combatId: null, at: Number(worldTime) || 0 };
}

/** A round of world time out of a fight, in seconds (05: a round is six seconds). */
export const CLAW_ROLL_SECONDS = 6;

/**
 * **WHY A CLAW ROLL'S BUTTON NO LONGER ANSWERS**, or null: another fight, round or turn than the one its card
 * was made in, out of a fight more than a round of world time later, or a card that carries no stamp at all.
 *
 * @param {object|null} stamp  the card's `clawRoll` record
 * @param {{fight?: {id: string, round: number, turn: number}|null, worldTime?: number}} now
 * @returns {"stale"|null}
 */
export function clawRollStale(stamp, { fight = null, worldTime = 0 } = {}) {
  if (!stamp || typeof stamp !== "object" || !("combatId" in stamp)) return "stale";
  if (fight?.id) return stamp.combatId === fight.id && stamp.round === fight.round && stamp.turn === fight.turn ? null : "stale";
  if (stamp.combatId) return "stale";
  return Number(worldTime) - (Number(stamp.at) || 0) > CLAW_ROLL_SECONDS ? "stale" : null;
}
