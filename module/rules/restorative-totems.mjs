/** 02's Totem table and 04's Restoration ranks. No Foundry dependencies. */
import {talentEffect} from "./talent-effects.mjs";
const DEFINITIONS = Object.freeze({
  "Healing Stream": Object.freeze({identifier: "healing-stream-totem", resource: "health", trigger: "owner", amount: 1, range: 30}),
  "Mana Tide": Object.freeze({identifier: "mana-tide-totem", resource: "mana", trigger: "recipient", amount: 2, range: 30})
});

/** Read the bound entry, not its editable actor display name. */
export function restorativeTotem(bond, talents = []) {
  if (bond?.kind !== "totem" || !bond.ownerUuid) return null;
  const definition = Object.hasOwn(DEFINITIONS, bond.entryName) ? DEFINITIONS[bond.entryName] : null;
  if (!definition) return null;
  const rank = Math.max(0, ...(talents ?? []).filter(t => String(t?.className).toLowerCase() === "shaman"
    && t.identifier === definition.identifier && talentEffect(t.className,t.identifier)?.restorativeTotem===bond.entryName)
    .map(t => Math.min(2, Math.max(0, Math.trunc(Number(t.taken)) || 0))));
  return {
    name: bond.entryName, identifier: definition.identifier, ownerUuid: bond.ownerUuid,
    resource: definition.resource, trigger: definition.trigger, rank,
    amount: definition.amount + rank,
    range: definition.range + (definition.resource === "mana" ? rank * 10 : 0),
    targets: definition.resource === "health" ? Math.max(1, rank) : null
  };
}

/** A use belongs to a source token and an indexed turn, including extra turns. */
export function restorativeTotemTurnKey({combatId, round, turn, sourceUuid} = {}) {
  if (!combatId || !sourceUuid || !Number.isInteger(round) || round < 1 || !Number.isInteger(turn) || turn < 0) return null;
  return JSON.stringify([combatId, round, turn, sourceUuid]);
}

/** Source-scene facts supplied by the adapter; no assumption about the viewed scene. */
export function restorativeTotemRefusal({restoration, source, current, target, distance} = {}) {
  if (!restoration || !source?.sceneId || !current?.sceneId || !target?.sceneId) return "missing";
  if (source.defeated || !Number.isFinite(source.health) || source.health <= 0) return "sourceInactive";
  if (source.sceneId !== current.sceneId || source.sceneId !== target.sceneId) return "scene";
  if (!Number.isFinite(distance) || distance < 0 || distance > restoration.range) return "range";
  if (restoration.trigger === "owner" && current.actorUuid !== restoration.ownerUuid) return "ownerTurn";
  // Token identity matters: two unlinked copies of the same world actor are
  // separate recipients, and only the one whose turn it is can recover Mana.
  if (restoration.trigger === "recipient" && (!current.tokenUuid || current.tokenUuid !== target.tokenUuid)) return "recipientTurn";
  return null;
}

/** All-or-nothing validation before any target is restored. Repeated ids cannot
 * spend the target allowance twice or multiply the recovery on one actor. */
export function restorativeTotemSelection(restoration, offered = [], selected = []) {
  if (!restoration || !Array.isArray(selected) || selected.length === 0) return {ok: false, reason: "empty", targets: []};
  if (new Set(selected).size !== selected.length) return {ok: false, reason: "duplicate", targets: []};
  if (restoration.targets !== null && selected.length > restoration.targets) return {ok: false, reason: "tooMany", targets: []};
  const rows = selected.map(id => offered.find(row => row.id === id));
  if (rows.some(row => !row || row.refusal)) return {ok: false, reason: "unavailable", targets: []};
  return {ok: true, reason: null, targets: rows};
}
