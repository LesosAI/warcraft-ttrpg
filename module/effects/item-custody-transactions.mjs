/** GM-only physical Item custody for Pact Escrow and Phoenix Courier.
 *
 * Foundry cannot atomically mutate Items embedded in several Actors. This
 * adapter therefore moves the real documents into one GM-owned Actor first,
 * persists every stage in a GM-private message, and exposes delivery/return
 * only after custody is confirmed. Any uncertain write enters review; retries
 * reconcile source, custody and destination documents before acting.
 */
import { weightFor } from "../rules/weight.mjs";
import { advanceItemCustody, createItemCustodyRecord } from "../rules/item-custody.mjs";
import { ITEM_CUSTODY_PENDING_FLAG, isItemCustodyPending } from "../rules/item-custody-guard.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";
import { feetApart } from "../canvas/footprints.mjs";

export const ITEM_CUSTODY_QUERY = "azeroth-rpg.itemCustody";
export const ITEM_CUSTODY_CONSENT_QUERY = "azeroth-rpg.itemCustodyConsent";
export const ITEM_CUSTODY_RECIPIENT_CONSENT = "azeroth-rpg.itemCustodyRecipientConsent";
export const ITEM_CUSTODY_CLAIM_QUERY = "azeroth-rpg.itemCustodyClaim";
export const ITEM_CUSTODY_FINISH_QUERY = "azeroth-rpg.itemCustodyFinish";
export const ITEM_CUSTODY_OPERATION_QUERY = "azeroth-rpg.itemCustodyOperation";
export const ITEM_CUSTODY_RECEIPT = "thematicItemCustody";
const CUSTODY_WRITE_OPTIONS = Object.freeze({azerothItemCustody: "bypass"});
const NS = "azeroth-rpg";
const refuse = reason => ({ok: false, reason});
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const messages = () => game.messages?.contents ?? [];
const stateOf = message => message?.flags?.[NS]?.[ITEM_CUSTODY_RECEIPT];
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const privateWhisper = () => [...(game.users?.contents ?? [])].filter(user => user.isGM).map(user => user.id);
const queue = new Map();
let hooksRegistered = false;

async function serialized(key, work) {
  const prior = queue.get(key) ?? Promise.resolve();
  const current = prior.then(work, work);
  queue.set(key, current.catch(() => {}));
  return current;
}

async function withLocks(keys, work) {
  let run = work;
  for (const key of [...new Set(keys)].sort().reverse()) {
    const next = run;
    run = () => serialized(`lock:${key}`, next);
  }
  return run();
}

function worldActor(uuid) {
  const actor = resolve(uuid);
  return actor?.documentName === "Actor" && !actor.isToken && game.actors?.get(actor.id) === actor ? actor : null;
}

function canonicalItem(item) {
  const data = item?.toObject?.();
  if (!data) return null;
  delete data._stats;
  if (data.flags?.[NS] && Object.keys(data.flags[NS]).length === 0) delete data.flags[NS];
  return data;
}

function pactPendingMarker(ticket, state, parcel, recipientUuid) {
  return {ticket, transactionId: state.transactionId, parcelId: parcel.parcelId,
    ownerUuid: parcel.ownerUuid, recipientUuid};
}

function pactDestinationData(ticket, state, parcel, recipientUuid) {
  const data = structuredClone(parcel.custodyData);
  if (data.system) data.system.container = null;
  const flags = data.flags ??= {};
  const namespace = flags[NS] ??= {};
  namespace[ITEM_CUSTODY_PENDING_FLAG] = pactPendingMarker(ticket, state, parcel, recipientUuid);
  return data;
}

async function removePactPendingMarker(item, expected) {
  const marker = item?.flags?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG]
    ?? item?.toObject?.()?.flags?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG];
  if (!marker) return !isItemCustodyPending(item);
  if (!same(marker, expected)) return false;
  if (typeof item.update === "function")
    await item.update({[`flags.${NS}.-=${ITEM_CUSTODY_PENDING_FLAG}`]: null}, CUSTODY_WRITE_OPTIONS);
  else if (typeof item.unsetFlag === "function") await item.unsetFlag(NS, ITEM_CUSTODY_PENDING_FLAG, CUSTODY_WRITE_OPTIONS);
  else return false;
  return !isItemCustodyPending(item);
}

function digestData(data) {
  return JSON.stringify(data);
}

async function askOwnerConsent(actor, payload) {
  const {answererOf, ASK_MS} = await import("./blow-doors.mjs");
  const owner = answererOf(actor);
  if (!owner) return refuse("owner-unavailable");
  let answer;
  try {
    answer = owner.id === game.user.id
      ? await itemCustodyConsentHandler(payload, {user: game.user})
      : await owner.query(ITEM_CUSTODY_CONSENT_QUERY, payload, {timeout: ASK_MS});
  } catch { return refuse("owner-unanswered"); }
  return answer === true ? {ok: true, ownerId: owner.id} : refuse("owner-declined");
}

async function askRecipientConsent(actor, payload) {
  const {answererOf, ASK_MS} = await import("./blow-doors.mjs");
  const owner = answererOf(actor);
  if (!owner) return refuse("recipient-unavailable");
  let answer;
  try {
    answer = owner.id === game.user.id
      ? await itemCustodyRecipientConsentHandler(payload, {user: game.user})
      : await owner.query(ITEM_CUSTODY_RECIPIENT_CONSENT, payload, {timeout: ASK_MS});
  } catch { return refuse("recipient-unanswered"); }
  return answer === true ? {ok: true, ownerId: owner.id} : refuse("recipient-declined");
}

async function ownerConsent(data, user) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const actor = worldActor(data.ownerUuid), item = actor && itemAt(actor, data.itemId);
  if (!actor || !item || item.uuid !== data.itemUuid || !actor.testUserPermission(game.user, "OWNER")) return false;
  const current = canonicalItem(item);
  if (digestData(current) !== data.itemDigest) return false;
  const {confirmHere} = await import("./blow-doors.mjs");
  const answer = await confirmHere(actor, {title: data.title,
    text: `${escape(data.summary)}\n\nThis removes the named physical item from your inventory for the recorded ${data.kind === "pact-escrow" ? "Pact Escrow exchange" : "Phoenix Courier delivery"}.${data.kind === "pact-escrow" ? " Either participant can cancel while the deposits remain in custody." : " The GM can return it if delivery fails."}`});
  const fresh = worldActor(data.ownerUuid), freshItem = fresh && itemAt(fresh, data.itemId);
  return answer === true && freshItem?.uuid === data.itemUuid && digestData(canonicalItem(freshItem)) === data.itemDigest
    && fresh.testUserPermission(game.user, "OWNER");
}

async function recipientConsent(data, user) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const actor = worldActor(data.recipientUuid);
  if (!actor || !actor.testUserPermission(game.user, "OWNER")) return false;
  const {confirmHere} = await import("./blow-doors.mjs");
  const answer = await confirmHere(actor, {title: "Phoenix Courier: recipient consent",
    text: `${escape(data.casterName)} proposes delivery of ${escape(data.parcelName)} to ${escape(actor.name)} at ${escape(data.destinationLabel)}. Do you agree to receive it?`});
  const fresh = worldActor(data.recipientUuid);
  return answer === true && fresh === actor && fresh.testUserPermission(game.user, "OWNER");
}

export async function itemCustodyConsentHandler(data = {}, {user} = {}) {
  if (!data || Object.keys(data).some(key => !["kind", "ownerUuid", "itemId", "itemUuid", "itemDigest", "title", "summary"].includes(key))
      || ![data.ownerUuid, data.itemId, data.itemUuid, data.itemDigest, data.title, data.summary].every(value => typeof value === "string")
      || !["pact-escrow", "phoenix-courier"].includes(data.kind)) return false;
  return ownerConsent(data, user);
}

export async function itemCustodyRecipientConsentHandler(data = {}, {user} = {}) {
  if (!data || Object.keys(data).some(key => !["recipientUuid", "casterName", "parcelName", "destinationLabel"].includes(key))
      || ![data.recipientUuid, data.casterName, data.parcelName, data.destinationLabel].every(value => typeof value === "string")) return false;
  return recipientConsent(data, user);
}

export async function itemCustodyPrepareQueryHandler(data = {}, {user} = {}) {
  if (data?.choose === true) return chooseCustodyCast(data, user);
  const allowed = ["kind", "casterUuid", "casterTokenUuid", "spellUuid", "parcels", "mission"];
  if (!gmHere() || !user?.id || !data || Array.isArray(data) || Object.keys(data).some(key => !allowed.includes(key))
      || !["pact-escrow", "phoenix-courier"].includes(data.kind) || !Array.isArray(data.parcels)
      || typeof data.casterUuid !== "string" || typeof data.casterTokenUuid !== "string" || typeof data.spellUuid !== "string")
    return refuse("authority-or-shape");
  const parcelsAllowed = ["ownerUuid", "recipientUuid", "itemId", "participantTokenUuid"];
  if (data.parcels.some(row => !row || Array.isArray(row) || Object.keys(row).some(key => !parcelsAllowed.includes(key))
      || parcelsAllowed.some(key => typeof row[key] !== "string"))) return refuse("parcel-shape");
  if (data.mission && (Object.keys(data.mission).some(key => !["destinationKey", "destinationLabel", "distanceMiles"].includes(key))
      || typeof data.mission.destinationKey !== "string" || typeof data.mission.destinationLabel !== "string"
      || !Number.isFinite(data.mission.distanceMiles))) return refuse("mission-shape");
  return prepareItemCustody({...data, requestedByUserId: user.id});
}

/** A caster requests the GM's named-item picker; private inventories stay on
 * the GM client and every deposit still receives its owner's approval. */
export function prepareItemCustodyCast({actor, spell, source} = {}) {
  const kind = spell?.system?.identifier;
  if (!["pact-escrow", "phoenix-courier"].includes(kind)) return null;
  if (!source?.sceneId || !source?.tokenId) return Promise.resolve(refuse("caster-token"));
  return requestItemCustodyPreparation({choose: true, kind, casterUuid: actor.uuid,
    casterTokenUuid: `Scene.${source.sceneId}.Token.${source.tokenId}`, spellUuid: spell.uuid});
}

async function chooseCustodyCast(data, user) {
  const allowed = ["choose", "kind", "casterUuid", "casterTokenUuid", "spellUuid"];
  if (!gmHere() || !user?.id || Object.keys(data).some(key => !allowed.includes(key))) return refuse("authority-or-shape");
  const caster = worldActor(data.casterUuid), spell = resolve(data.spellUuid);
  const token = tokenRef(data.casterTokenUuid, data.casterUuid);
  if (!caster || !spell || !token || !caster.testUserPermission(user, "OWNER")
      || spell.parent?.uuid !== caster.uuid || spell.system?.identifier !== data.kind
      || !["pact-escrow", "phoenix-courier"].includes(data.kind)) return refuse("cast-context");
  const pact = data.kind === "pact-escrow", candidates = [];
  for (const target of token.parent?.tokens ?? []) {
    const owner = target.actor;
    if (!owner || owner.isToken || (!pact && owner.uuid !== caster.uuid)
        || !withinTouch(token.uuid, target.uuid, caster.uuid, owner.uuid)) continue;
    for (const item of owner.items?.values?.() ?? owner.items ?? []) {
      const parcel = physicalParcel(owner, item.id);
      if (!parcel || parcel.weightLb > (pact ? 10 : 1) || item.system?.equipped) continue;
      candidates.push({ownerUuid: owner.uuid, itemId: item.id, participantTokenUuid: target.uuid,
        label: `${owner.name}: ${item.name} (${parcel.weightLb} lb)`});
    }
  }
  if (!candidates.length) return refuse("no-eligible-parcels");
  const options = candidates.map((row, index) => ({value: String(index), label: row.label}));
  const recipients = (game.actors?.contents ?? []).filter(row => !row.isToken);
  const choice = await utilityDialog({title: `GM: ${spell.name}`, note:
    "Choose the specific deposits agreed at the table. Each owner will approve before anything is spent or moved.", fields: [
    {name: "first", label: pact ? "First deposit" : "Parcel", options},
    ...(pact ? [{name: "second", label: "Second deposit", options}]
      : [{name: "recipient", label: "Named recipient", options: recipients.map(row => ({value: row.uuid, label: row.name}))},
        {name: "destination", label: "Previously visited destination"},
        {name: "miles", type: "number", min: 0, max: 20, label: "Route distance in miles"}])
  ]});
  if (!choice) return refuse("cancelled");
  const first = candidates.find((_row, index) => String(index) === choice.first);
  const second = pact ? candidates.find((_row, index) => String(index) === choice.second) : null;
  if (!first || (pact && (!second || first.ownerUuid === second.ownerUuid))) return refuse("deposits");
  if (!pact && !recipients.some(row => row.uuid === choice.recipient)) return refuse("recipient");
  const parcel = (row, recipientUuid) => ({ownerUuid: row.ownerUuid, itemId: row.itemId,
    participantTokenUuid: row.participantTokenUuid, recipientUuid});
  return prepareItemCustody({kind: data.kind, casterUuid: caster.uuid, casterTokenUuid: token.uuid,
    spellUuid: spell.uuid, requestedByUserId: user.id,
    parcels: pact ? [parcel(first, second.ownerUuid), parcel(second, first.ownerUuid)] : [parcel(first, choice.recipient)],
    mission: pact ? null : {destinationKey: choice.destination, destinationLabel: choice.destination, distanceMiles: choice.miles}});
}

export async function itemCustodyClaimQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id || !data || Array.isArray(data)
      || Object.keys(data).some(key => !["ticket", "cast", "casterUuid", "spellUuid"].includes(key))
      || ![data.ticket, data.cast, data.casterUuid, data.spellUuid].every(value => typeof value === "string")) return refuse("authority-or-shape");
  return claimItemCustody(data.ticket, data, user);
}

export async function itemCustodyFinishQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id || !data || Array.isArray(data)
      || Object.keys(data).some(key => !["ticket", "messageId"].includes(key))
      || ![data.ticket, data.messageId].every(value => typeof value === "string")) return refuse("authority-or-shape");
  return finishItemCustody(data.ticket, data.messageId, user);
}

export async function itemCustodyOperationQueryHandler(data = {}, {user} = {}) {
  if (!user?.id || !gmHere() || !data || Array.isArray(data)
      || Object.keys(data).some(key => !["ticket", "operation", "cast"].includes(key))
      || typeof data.ticket !== "string" || !["cancel", "recall", "abort-unpaid", "pact-cleanup"].includes(data.operation)
      || (data.cast !== undefined && typeof data.cast !== "string")) return refuse("authority-or-shape");
  const state = stateOf(game.messages.get(data.ticket));
  if (!state) return refuse("ticket");
  if (data.operation === "abort-unpaid") return abortUnpaidItemCustody(data.ticket, {cast: data.cast}, user);
  if (data.operation === "pact-cleanup") {
    if (state.kind !== "pact-escrow" || state.record?.status !== "delivered") return refuse("pact-not-committed");
    return reconcilePactDelivery(data.ticket);
  }
  if (data.operation === "cancel") {
    if (state.kind !== "pact-escrow" || !["held", "needs-review", "paid"].includes(state.status)
        || !state.parcels.some(parcel => worldActor(parcel.ownerUuid)?.testUserPermission(user, "OWNER"))) return refuse("not-authorized-to-cancel");
  } else if (state.kind !== "phoenix-courier" || !["held", "in-transit", "delivery-pending", "needs-review"].includes(state.status)
      || !worldActor(state.casterUuid)?.testUserPermission(user, "OWNER")) return refuse("not-authorized-to-recall");
  return returnItemCustody(data.ticket);
}

async function activeGMQuery(queryId, payload, localHandler) {
  if (game.user?.isGM && gmHere()) return localHandler(payload, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm?.query) return refuse("no-active-gm");
  try { return await gm.query(queryId, payload, {timeout: 300000}); }
  catch { return refuse("unanswered"); }
}

export function requestItemCustodyPreparation(payload = {}) {
  return activeGMQuery(ITEM_CUSTODY_QUERY, payload, itemCustodyPrepareQueryHandler);
}

export function requestItemCustodyClaim(payload = {}) {
  return activeGMQuery(ITEM_CUSTODY_CLAIM_QUERY, payload, itemCustodyClaimQueryHandler);
}

export function requestItemCustodyFinish(payload = {}) {
  return activeGMQuery(ITEM_CUSTODY_FINISH_QUERY, payload, itemCustodyFinishQueryHandler);
}

export async function requestItemCustodyOperation({ticket, operation, cast} = {}) {
  return activeGMQuery(ITEM_CUSTODY_OPERATION_QUERY, {ticket, operation, ...(cast ? {cast} : {})}, itemCustodyOperationQueryHandler);
}

/** Release a paid-cast reservation after its budget was refused, before any Item moved. */
export async function requestItemCustodyAbort(ticket, cast) {
  return requestItemCustodyOperation({ticket, operation: "abort-unpaid", cast});
}

function physicalParcel(actor, itemId) {
  const item = actor?.items?.get?.(itemId);
  if (!item || isItemCustodyPending(item) || !["gear", "weapon", "armor"].includes(item.type)) return null;
  const itemData = canonicalItem(item);
  if (!itemData) return null;
  const weightLb = weightFor(itemData);
  if (!Number.isFinite(weightLb) || weightLb <= 0) return null;
  const hasContents = [...(actor.items?.values?.() ?? actor.items ?? [])]
    .some(row => row.system?.container === item.id);
  if (hasContents || item.system?.capacity || item.system?.charges) return null;
  const originalContainerId = item.system?.container ?? null;
  const custodyData = structuredClone(itemData);
  if (custodyData.system) custodyData.system.container = null;
  return {item, itemId: item.id, itemUuid: item.uuid, itemData, custodyData, weightLb, originalContainerId};
}

function tokenRef(uuid, actorUuid) {
  const token = uuid ? resolve(uuid) : null;
  return token?.documentName === "Token" && token.actor?.uuid === actorUuid ? token : null;
}

function withinTouch(sourceUuid, targetUuid, sourceActorUuid, targetActorUuid) {
  const source = tokenRef(sourceUuid, sourceActorUuid), target = tokenRef(targetUuid, targetActorUuid);
  if (!source || !target || source.parent?.id !== target.parent?.id) return false;
  const distance = feetApart(source, target);
  return Number.isFinite(distance) && distance >= 0 && distance <= 5;
}

async function getCustodyActor() {
  if (!gmHere()) return null;
  let actor = [...(game.actors?.contents ?? [])].find(row => row.getFlag?.(NS, "thematicItemCustody") === true);
  if (actor) return actor.testUserPermission(game.user, "OWNER") ? actor : null;
  actor = await Actor.create({name: "GM Item Custody", type: "npc", ownership: {default: 0, [game.user.id]: 3},
    flags: {[NS]: {thematicItemCustody: true}}});
  if (!actor || actor.getFlag?.(NS, "thematicItemCustody") !== true || actor.testUserPermission(game.user, "OWNER") !== true) return null;
  return actor;
}

async function writeReceipt(message, state) {
  await message.update({[`flags.${NS}.${ITEM_CUSTODY_RECEIPT}`]: foundry.data.operators.ForcedReplacement.create(state)});
  const saved = same(stateOf(message), state);
  if (saved && state.cardId) {
    const card = game.messages.get(state.cardId);
    if (card?.flags?.[NS]?.itemCustodyTicket === message.id) {
      await card.update({[`flags.${NS}.itemCustodyStatus`]: state.status});
    }
  }
  return saved;
}

function itemAt(actor, id) { return actor?.items?.get?.(id) ?? null; }

async function createItem(actor, data) {
  const made = await actor.createEmbeddedDocuments("Item", [structuredClone(data)], CUSTODY_WRITE_OPTIONS);
  const item = made?.[0] ?? null;
  return item && itemAt(actor, item.id) === item ? item : null;
}

async function deleteItem(actor, item) {
  if (!item || itemAt(actor, item.id) !== item) return false;
  await actor.deleteEmbeddedDocuments("Item", [item.id], CUSTODY_WRITE_OPTIONS);
  return itemAt(actor, item.id) === null;
}

function updateRecord(state, operation, data = {}) {
  return advanceItemCustody(state.record, {operationId: foundry.utils.randomID(), operation,
    at: game.time.worldTime, gmApproval: game.user.id, data});
}

async function moveIntoCustody(message, state, parcel) {
  const custody = worldActor(state.custodyActorUuid);
  const source = worldActor(parcel.ownerUuid);
  if (!custody || !source) throw Error("actor");
  const existing = itemAt(custody, parcel.itemId);
  const original = itemAt(source, parcel.itemId);
  if (existing && !original && same(canonicalItem(existing), parcel.custodyData)) {
    if (state.record.held.some(row => row.parcelId === parcel.parcelId)) return existing;
    const transition = updateRecord(state, "held", {parcelId: parcel.parcelId, custodyItemId: existing.id});
    if (!transition.ok) throw Error(transition.reason);
    const next = {...state, status: transition.record.status, record: transition.record};
    if (!await writeReceipt(message, next)) throw Error("receipt-uncertain");
    return existing;
  }
  if (!original || existing || !same(canonicalItem(original), parcel.itemData)) throw Error("item-changed");
  if (!await deleteItem(source, original)) throw Error("delete-uncertain");
  let made;
  try { made = await createItem(custody, parcel.custodyData); }
  catch (error) {
    if (!itemAt(source, parcel.itemId) && !itemAt(custody, parcel.itemId)) {
      const restored = await createItem(source, parcel.itemData);
      if (!restored) throw Error("restore-uncertain");
    }
    throw error;
  }
  if (!made && !itemAt(source, parcel.itemId) && !itemAt(custody, parcel.itemId)) {
    const restored = await createItem(source, parcel.itemData);
    if (!restored) throw Error("restore-uncertain");
  }
  if (!made || !same(canonicalItem(made), parcel.custodyData)) throw Error("custody-create-uncertain");
  const transition = updateRecord(state, "held", {parcelId: parcel.parcelId, custodyItemId: made.id});
  if (!transition.ok) throw Error(transition.reason);
  const next = {...state, status: transition.record.status, record: transition.record};
  if (!await writeReceipt(message, next)) throw Error("receipt-uncertain");
  return made;
}

async function placeFromCustody(message, state, parcel, destinationUuid, destinationData, onCreated = null) {
  const custody = worldActor(state.custodyActorUuid), destination = worldActor(destinationUuid);
  if (!custody || !destination) throw Error("actor");
  const held = itemAt(custody, parcel.itemId), alreadyThere = itemAt(destination, parcel.itemId);
  if (alreadyThere && !held && same(canonicalItem(alreadyThere), destinationData)) return alreadyThere;
  if (!held || alreadyThere || !same(canonicalItem(held), parcel.custodyData)) throw Error("custody-changed");
  if (!await deleteItem(custody, held)) throw Error("custody-delete-uncertain");
  let made;
  try { made = await createItem(destination, destinationData); }
  catch (error) {
    if (!itemAt(custody, parcel.itemId) && !itemAt(destination, parcel.itemId)) {
      const restored = await createItem(custody, parcel.custodyData);
      if (!restored) throw Error("custody-restore-uncertain");
    }
    throw error;
  }
  if (!made && !itemAt(custody, parcel.itemId) && !itemAt(destination, parcel.itemId)) {
    const restored = await createItem(custody, parcel.custodyData);
    if (!restored) throw Error("custody-restore-uncertain");
  }
  if (made && typeof onCreated === "function") onCreated(made);
  if (!made || !same(canonicalItem(made), destinationData)) throw Error("destination-create-uncertain");
  return made;
}

async function rollbackDeliveryToCustody(ticket, state, row) {
  const custody = worldActor(state.custodyActorUuid), recipient = worldActor(row.recipientUuid);
  const parcel = state.parcels.find(candidate => candidate.parcelId === row.parcelId);
  if (!custody || !recipient || !parcel) throw Error("rollback-actor-or-parcel");
  const held = itemAt(custody, parcel.itemId);
  const destination = (row.recipientItemId && itemAt(recipient, row.recipientItemId)) ?? itemAt(recipient, parcel.itemId);
  if (held && !destination && same(canonicalItem(held), parcel.custodyData)) return true;
  const expectedDestination = pactDestinationData(ticket, state, parcel, row.recipientUuid);
  if (!destination || held || !same(canonicalItem(destination), expectedDestination)) throw Error("rollback-item-changed");
  if (!await deleteItem(recipient, destination)) throw Error("rollback-delete-uncertain");
  let restored;
  try { restored = await createItem(custody, parcel.custodyData); }
  catch (error) {
    if (!itemAt(custody, parcel.itemId) && !itemAt(recipient, destination.id)) {
      const recover = await createItem(recipient, expectedDestination);
      if (!recover) throw Error("rollback-restore-uncertain");
    }
    throw error;
  }
  if (!restored || !same(canonicalItem(restored), parcel.custodyData)) throw Error("rollback-custody-uncertain");
  return true;
}

async function finishCommittedPactDelivery(ticket, message, initial) {
  if (!initial || initial.kind !== "pact-escrow" || initial.record?.status !== "delivered") return refuse("pact-not-committed");
  let state = initial;
  if (state.status !== "delivered") {
    state = {...state, status: "delivered", exchangeCommittedAt: state.exchangeCommittedAt ?? game.time.worldTime};
    if (!await writeReceipt(message, state)) return refuse("receipt-uncertain");
  }
  for (const parcel of state.parcels) {
    const delivered = state.record.delivered.find(row => row.parcelId === parcel.parcelId);
    const recipientUuid = parcel.recipientUuid;
    const recipient = worldActor(recipientUuid);
    const item = (delivered?.recipientItemId && itemAt(recipient, delivered.recipientItemId)) ?? itemAt(recipient, parcel.itemId);
    const expected = pactDestinationData(ticket, state, parcel, recipientUuid);
    if (!item) return markPactCleanupReview(message, state, "A committed Pact item is missing from its recipient.");
    const marker = item.flags?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG]
      ?? item.toObject?.()?.flags?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG];
    const cleanExpected = structuredClone(parcel.custodyData);
    if (cleanExpected.system) cleanExpected.system.container = null;
    if (marker) {
      if (!same(marker, expected.flags?.[NS]?.[ITEM_CUSTODY_PENDING_FLAG]) || !same(canonicalItem(item), expected))
        return markPactCleanupReview(message, state, "Pact item changed while locked; inspect the item before clearing its marker.");
      let removed = false;
      try { removed = await removePactPendingMarker(item, marker); }
      catch { removed = false; }
      if (!removed)
        return markPactCleanupReview(message, state, "Pact item lock cleanup is uncertain; inspect the item flags.");
    }
    if (!same(canonicalItem(item), cleanExpected))
      return markPactCleanupReview(message, state, "A committed Pact item changed before lock cleanup.");
  }
  if (state.status !== "delivered" || !state.exchangeCommittedAt) {
    state = {...state, status: "delivered", exchangeCommittedAt: state.exchangeCommittedAt ?? game.time.worldTime};
    if (!await writeReceipt(message, state)) return refuse("receipt-uncertain");
  }
  return {ok: true, status: "delivered", ticket};
}

async function markPactCleanupReview(message, state, failure) {
  const next = {...state, status: "needs-review", failure, cleanupPending: true};
  await writeReceipt(message, next);
  return refuse("needs-review");
}

/** Build a GM-private ticket before payment. `parcels` identify real embedded Items. */
export function prepareItemCustody(input = {}) {
  const keys = [...(input.parcels ?? []).map(row => `item:${row.ownerUuid}:${row.itemId}`)];
  if (input.kind === "phoenix-courier") keys.push(`phoenix:${input.casterUuid}`);
  return withLocks(keys, () => prepareItemCustodyInternal(input));
}

async function prepareItemCustodyInternal({kind, transactionId = foundry.utils.randomID(), parcels = [],
  casterUuid, casterTokenUuid, spellUuid, requestedByUserId, mission = null} = {}) {
  if (!gmHere()) return refuse("authority");
  // Authenticate the caster before asking another owner for consent or
  // creating any custody document on the GM's client.
  const caster = worldActor(casterUuid), spell = resolve(spellUuid);
  const requester = game.users?.get?.(requestedByUserId);
  const spellIdentifier = kind === "phoenix-courier" ? "phoenix-courier" : "pact-escrow";
  if (!caster || !spell || spell.type !== "spell" || spell.system?.identifier !== spellIdentifier
      || spell.parent?.uuid !== caster.uuid || !requester || !caster.testUserPermission(requester, "OWNER"))
    return refuse("cast-context");
  if (!Array.isArray(parcels) || parcels.length !== (kind === "pact-escrow" ? 2 : 1)) return refuse("parcel-count");
  if (kind === "phoenix-courier" && messages().some(message => {
    const state = stateOf(message);
    return state?.kind === "phoenix-courier" && state.casterUuid === casterUuid
      && !["delivered", "returned", "cancelled", "failed", "expired"].includes(state.status);
  })) return refuse("recall-existing-courier-first");
  const rows = [];
  for (const entry of parcels) {
    const owner = worldActor(entry.ownerUuid), recipient = worldActor(entry.recipientUuid);
    const found = physicalParcel(owner, entry.itemId);
    if (!owner || !recipient || !found) return refuse("item-not-eligible");
    const allowedWeight = kind === "phoenix-courier" ? 1 : 10;
    if (found.weightLb > allowedWeight) return refuse("item-too-heavy");
    if (kind === "pact-escrow" && (found.item.system?.equipped === true
        || !withinTouch(casterTokenUuid, entry.participantTokenUuid, casterUuid, owner.uuid))) return refuse("participant-not-in-touch");
    if (kind === "phoenix-courier" && (owner.uuid !== casterUuid
        || !withinTouch(casterTokenUuid, entry.participantTokenUuid, casterUuid, owner.uuid))) return refuse("parcel-not-touched");
    rows.push({parcelId: entry.parcelId ?? foundry.utils.randomID(), itemUuid: found.itemUuid, itemId: found.itemId,
      ownerUuid: owner.uuid, recipientUuid: recipient.uuid, weightLb: found.weightLb,
      itemData: found.itemData, custodyData: found.custodyData, originalContainerId: found.originalContainerId,
      itemDigest: digestData(found.itemData)});
  }
  const reserved = rows.some(row => messages().some(message => {
    const current = stateOf(message);
    return !["delivered", "returned", "cancelled", "failed", "expired"].includes(current?.status)
      && current?.parcels?.some(prior => prior.itemUuid === row.itemUuid);
  }));
  if (reserved) return refuse("item-already-reserved");
  const summary = rows.map(row => `${worldActor(row.ownerUuid).name} deposits ${row.itemData.name} (${row.weightLb} lb) for ${worldActor(row.recipientUuid).name}`).join("; ");
  for (const row of rows) {
    const actor = worldActor(row.ownerUuid);
    const consent = await askOwnerConsent(actor, {kind, ownerUuid: actor.uuid, itemId: row.itemId, itemUuid: row.itemUuid,
      itemDigest: row.itemDigest, title: kind === "pact-escrow" ? "Pact Escrow deposit approval" : "Phoenix Courier parcel approval", summary});
    if (!consent.ok) return consent;
  }
  if (kind === "pact-escrow") {
    // This review is authoritative for every prepare route, including the
    // direct parcels query. The chooser is convenience only and never supplies
    // the rules-critical casting-time or unattended-object judgement.
    const review = await utilityDialog({title: "GM review: Pact Escrow", note:
      `Confirm the one-minute casting time elapsed and both selected items stayed unattended as specific, nonliving objects: ${rows.map(row => row.itemData.name).join(" and ")}.`, fields: [
      {name: "minute", type: "checkbox", label: "The one-minute casting time has elapsed"},
      {name: "unattended", type: "checkbox", label: "Both are specific unattended nonliving objects"}
    ]});
    if (!review?.minute || !review?.unattended) return refuse("pact-terms-not-approved");
  }
  if (kind === "phoenix-courier") {
    if (!mission || typeof mission.destinationKey !== "string" || !mission.destinationKey.trim()
        || typeof mission.destinationLabel !== "string" || !mission.destinationLabel.trim()
        || !Number.isFinite(mission.distanceMiles) || mission.distanceMiles < 0 || mission.distanceMiles > 20) return refuse("destination");
    const row = rows[0], recipient = worldActor(row.recipientUuid), caster = worldActor(row.ownerUuid);
    const consent = await askRecipientConsent(recipient, {recipientUuid: recipient.uuid, casterName: caster.name,
      parcelName: row.itemData.name, destinationLabel: mission.destinationLabel});
    if (!consent.ok) return consent;
  }
  let approvedMission = null;
  if (kind === "phoenix-courier") {
    const review = await utilityDialog({title: "GM review: Phoenix Courier", note: `${rows[0].itemData.name} to ${mission.destinationLabel} (${mission.distanceMiles} miles). Confirm the destination was visited and route is physically traversable.`, fields: [
      {name: "visited", type: "checkbox", label: "The caster has visited this destination"},
      {name: "withinRange", type: "checkbox", label: "This destination is within 20 miles"},
      {name: "route", type: "checkbox", label: "A physically traversable route exists and closed barriers will stop the courier"},
      {name: "eligible", type: "checkbox", label: "I confirm one nonliving parcel at or below 1 lb and a willing named recipient"}
    ]});
    if (!review?.visited || !review?.withinRange || !review?.route || !review?.eligible) return refuse("route-or-destination-not-approved");
    approvedMission = {destinationKey: mission.destinationKey.trim(), destinationLabel: mission.destinationLabel.trim(),
      distanceMiles: mission.distanceMiles, visited: true, routeTraversable: true};
  }
  for (const row of rows) {
    const actor = worldActor(row.ownerUuid), current = actor && itemAt(actor, row.itemId);
    if (!current || current.uuid !== row.itemUuid || digestData(canonicalItem(current)) !== row.itemDigest) return refuse("item-changed-during-consent");
  }
  if (rows.some(row => messages().some(message => {
    const current = stateOf(message);
    return !["delivered", "returned", "cancelled", "failed", "expired"].includes(current?.status)
      && current?.parcels?.some(prior => prior.itemUuid === row.itemUuid);
  })))
    return refuse("item-already-reserved");
  const custody = await getCustodyActor();
  if (!custody) return refuse("custody-actor");
  const expires = game.time.worldTime + (kind === "phoenix-courier" ? 8 * 3600 : 600);
  const pureRows = rows.map(({custodyData, itemDigest, originalContainerId, ...row}) => row);
  const made = createItemCustodyRecord({transactionId, kind, createdAt: game.time.worldTime, expiresAt: expires,
    custodyActorUuid: custody.uuid, parcels: pureRows});
  if (!made.ok) return made;
  const receipt = await ChatMessage.create({whisper: privateWhisper(), blind: true,
    content: `<p>GM-private physical item custody prepared.</p>`,
    flags: {[NS]: {[ITEM_CUSTODY_RECEIPT]: {version: 1, status: "prepared", transactionId, kind,
      custodyActorUuid: custody.uuid, record: made.record, parcels: rows, casterUuid: caster.uuid,
      casterTokenUuid, touchRefs: parcels.map(row => ({ownerUuid: row.ownerUuid, tokenUuid: row.participantTokenUuid})),
      spellUuid: spell.uuid, requestedByUserId: requestedByUserId ?? null, mission: approvedMission, createdBy: game.user.id}}}});
  return receipt && stateOf(receipt)?.transactionId === transactionId ? {ok: true, ticket: receipt.id} : refuse("receipt-uncertain");
}

/** On successful paid card only: move each actual Item into GM-owned custody. */
export async function claimItemCustody(ticket, {cast, casterUuid, spellUuid} = {}, user = game.user) {
  if (!gmHere() || !user?.id) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    const caster = worldActor(casterUuid), spell = resolve(spellUuid);
    if (!state || !["prepared", "claimed"].includes(state.status) || state.casterUuid !== casterUuid || state.spellUuid !== spellUuid
        || !caster || !spell || spell.parent?.uuid !== caster.uuid || !caster.testUserPermission(user, "OWNER")
        || state.requestedByUserId !== user.id
        || typeof cast !== "string" || !cast.trim()) return refuse("claim-context");
    if (state.status === "claimed") return state.cast === cast && state.userId === user.id
      ? {ok: true, ticket, cast} : refuse("already-claimed");
    if (game.time.worldTime >= state.record.expiresAt) return refuse("preparation-expired");
    if (!Array.isArray(state.touchRefs) || state.touchRefs.length !== state.parcels.length
        || state.touchRefs.some(row => !withinTouch(state.casterTokenUuid, row.tokenUuid, caster.uuid, row.ownerUuid)))
      return refuse("participant-not-in-touch");
    if (state.parcels.some(row => {
      const item = itemAt(worldActor(row.ownerUuid), row.itemId);
      return !item || item.uuid !== row.itemUuid || digestData(canonicalItem(item)) !== row.itemDigest;
    })) return refuse("item-changed-before-claim");
    const next = {...state, status: "claimed", cast, userId: user.id, claimedAt: game.time.worldTime};
    if (!await writeReceipt(message, next)) return refuse("receipt-uncertain");
    return {ok: true, ticket, cast};
  });
}

/** Cancel a prepared/claimed reservation when the spell's budget was refused. */
export async function abortUnpaidItemCustody(ticket, {cast} = {}, user = game.user) {
  if (!gmHere() || !user?.id) return refuse("authority");
  return serialized(ticket, async () => {
    const receipt = game.messages.get(ticket), state = stateOf(receipt);
    if (!state || !["prepared", "claimed"].includes(state.status) || state.record?.status !== "holding"
        || (state.record?.held?.length ?? 0) !== 0 || state.cardId) return refuse("not-unpaid");
    if (state.status === "prepared" && state.requestedByUserId !== user.id) return refuse("not-authorized-to-abort");
    if (state.status === "claimed" && (state.userId !== user.id || typeof cast !== "string" || cast !== state.cast))
      return refuse("not-authorized-to-abort");
    if (state.parcels.some(parcel => {
      const item = itemAt(worldActor(parcel.ownerUuid), parcel.itemId);
      return !item || item.uuid !== parcel.itemUuid || digestData(canonicalItem(item)) !== parcel.itemDigest
        || itemAt(worldActor(state.custodyActorUuid), parcel.itemId);
    })) return refuse("item-moved-or-changed");
    const transition = updateRecord(state, "cancel", {});
    if (!transition.ok || transition.record.status !== "cancelled") return refuse("not-unpaid");
    const next = {...state, status: "cancelled", record: transition.record, cancelledAt: game.time.worldTime,
      cancellation: {reason: "budget-refused", cast: state.status === "claimed" ? cast : null}};
    if (!await writeReceipt(receipt, next)) return refuse("receipt-uncertain");
    return {ok: true, status: next.status, ticket};
  });
}

export async function finishItemCustody(ticket, messageId, user = game.user) {
  if (!gmHere() || !user?.id) return refuse("authority");
  const receipt = game.messages.get(ticket), state = stateOf(receipt), card = game.messages.get(messageId);
  const flags = card?.flags?.[NS];
  const identifier = state?.kind === "phoenix-courier" ? "phoenix-courier" : "pact-escrow";
  const retryableHold = state?.status === "needs-review" && state.cardId === card?.id && state.record?.status === "holding";
  if (!state || !card || (!(["claimed", "paid", "held"].includes(state.status)) && !retryableHold) || state.userId !== user.id
      || (state.cardId && state.cardId !== card.id)
      || card.author?.id !== user.id || flags?.kind !== "spell" || flags.identifier !== identifier
      || flags.caster !== state.casterUuid || flags.spellUuid !== state.spellUuid || flags.cast !== state.cast
      || flags.itemCustodyTicket !== ticket) return refuse("card-mismatch");
  if (flags.success !== true) {
    if (state.status === "claimed") await writeReceipt(receipt, {...state, status: "failed", cardId: card.id});
    return {ok: true, complete: false};
  }
  if (state.status === "held") return {ok: true, ticket, status: "held"};
  if (state.status === "claimed") {
    const castTime = flags.itemCustodyCastTime;
    if (!Number.isFinite(castTime) || castTime < state.claimedAt || castTime > game.time.worldTime) return refuse("invalid-cast-time");
    const pureRows = state.parcels.map(({custodyData, itemDigest, originalContainerId, ...row}) => row);
    const duration = state.kind === "phoenix-courier" ? 8 * 3600 : 600;
    const started = createItemCustodyRecord({transactionId: state.transactionId, kind: state.kind, createdAt: castTime,
      expiresAt: castTime + duration, custodyActorUuid: state.custodyActorUuid, parcels: pureRows});
    if (!started.ok) return started;
    const next = {...state, status: "paid", record: started.record, cardId: card.id, cardCastTime: castTime};
    if (!await writeReceipt(receipt, next)) return refuse("receipt-uncertain");
  }
  const held = await holdItemCustody(ticket);
  if (!held.ok) return held;
  await card.update({[`flags.${NS}.itemCustodyStatus`]: "held"});
  return held;
}

export async function holdItemCustody(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), initial = stateOf(message);
    const retryableHold = initial?.status === "needs-review" && initial.cardId && initial.record?.status === "holding";
    if (!initial || (initial.status !== "paid" && !retryableHold)) return refuse("ticket");
    let state = initial;
    for (const parcel of state.parcels) {
      if (state.record.held.some(row => row.parcelId === parcel.parcelId)) continue;
      try { await moveIntoCustody(message, state, parcel); }
      catch (error) {
        const fresh = stateOf(message);
        await writeReceipt(message, {...fresh, status: "needs-review", failure: error?.message ?? "item movement uncertain"});
        return refuse("needs-review");
      }
      state = stateOf(message);
    }
    state = {...state, status: kindIsPact(state) ? "held" : "held"};
    if (!await writeReceipt(message, state)) return refuse("receipt-uncertain");
    return {ok: true, status: state.status, ticket};
  });
}

function kindIsPact(state) { return state?.kind === "pact-escrow"; }

/** Deliver held physical documents. Pact deposits release to opposite owners. */
export async function deliverItemCustody(ticket, {destinationByParcel = {}} = {}) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), initial = stateOf(message);
    if (!initial || initial.kind !== "pact-escrow") return refuse("ticket-not-held");
    if (initial.record?.status === "delivered") return finishCommittedPactDelivery(ticket, message, initial);
    if (initial.status !== "held") return refuse("ticket-not-held");
    if (initial.parcels.some(parcel => destinationByParcel[parcel.parcelId]
        && destinationByParcel[parcel.parcelId] !== parcel.recipientUuid)) return refuse("recipient-mismatch");
    if (game.time.worldTime >= initial.record.expiresAt) return refuse("escrow-expired-return-required");
    const start = updateRecord(initial, "begin-delivery", {});
    if (!start.ok) return start;
    let state = {...initial, status: start.record.status, record: start.record};
    if (!await writeReceipt(message, state)) return refuse("receipt-uncertain");
    const attempted = [];
    for (const parcel of state.parcels) {
      const recipientUuid = destinationByParcel[parcel.parcelId] ?? parcel.recipientUuid;
      const data = pactDestinationData(ticket, state, parcel, recipientUuid);
      const movement = {parcelId: parcel.parcelId, recipientUuid, recipientItemId: null};
      attempted.push(movement);
      try {
        const made = await placeFromCustody(message, state, parcel, recipientUuid, data, item => { movement.recipientItemId = item.id; });
        const transition = updateRecord(state, "delivered", {parcelId: parcel.parcelId, recipientItemId: made.id});
        if (!transition.ok) throw Error(transition.reason);
        state = {...state, status: transition.record.status, record: transition.record};
        state.delivered = [...(state.delivered ?? []), parcel.parcelId];
        if (!await writeReceipt(message, state)) throw Error("receipt-uncertain");
      } catch {
        if (state.record.status === "delivered") {
          const current = stateOf(message) ?? state;
          const committed = {...current, status: "delivered", record: state.record,
            delivered: state.delivered, exchangeCommittedAt: current.exchangeCommittedAt ?? game.time.worldTime};
          if (await writeReceipt(message, committed)) return finishCommittedPactDelivery(ticket, message, committed);
          await writeReceipt(message, {...current, status: "needs-review", record: state.record,
            failure: "Pact exchange is physically complete but its receipt commit is uncertain; deposits remain locked.", cleanupPending: true});
          return refuse("needs-review");
        }
        let rollbackComplete = true;
        for (const row of attempted.slice().reverse()) {
          try { await rollbackDeliveryToCustody(ticket, state, row); }
          catch { rollbackComplete = false; }
        }
        const current = stateOf(message) ?? state;
        await writeReceipt(message, {...current, status: "needs-review",
          failure: rollbackComplete ? "Pact exchange rolled back to GM custody; return both deposits to their owners." : "Pact exchange delivery or rollback is uncertain; inspect every physical Item before resolving.",
          deliveryRollback: {attempted: attempted.map(row => row.parcelId), complete: rollbackComplete, at: game.time.worldTime}});
        return refuse("needs-review");
      }
    }
    return finishCommittedPactDelivery(ticket, message, state);
  });
}

export async function reconcilePactDelivery(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    return finishCommittedPactDelivery(ticket, message, state);
  });
}

/** Start Phoenix Courier only after GM confirms a visited, traversable route. */
export async function startPhoenixCourier(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    if (!state || state.kind !== "phoenix-courier" || state.status !== "held" || !state.mission
        || game.time.worldTime >= state.record.expiresAt) return refuse("ticket-or-route");
    const held = itemAt(worldActor(state.custodyActorUuid), state.parcels[0].itemId);
    if (!held || !same(canonicalItem(held), state.parcels[0].custodyData)) return refuse("parcel-missing-or-changed");
    const review = await utilityDialog({title: "GM: dispatch Phoenix Courier",
      note: `Destination: ${state.mission.destinationLabel} (${state.mission.distanceMiles} miles). The courier follows this route physically and cannot cross barriers.`, fields: [
        {name: "routeTraversable", type: "checkbox", label: "I confirm the route is still physically traversable, with no closed barrier on its path"},
        {name: "visited", type: "checkbox", label: "I reconfirm this is a visited destination within 20 miles"},
        {name: "parcelHeld", type: "checkbox", label: "The actual parcel remains in GM custody and has not been damaged or removed"}
      ]});
    if (!review?.routeTraversable || !review?.visited || !review?.parcelHeld) return refuse("route-not-confirmed");
    const routeConfirmationId = foundry.utils.randomID();
    const destinationKey = state.mission.destinationKey;
    const transition = updateRecord(state, "mission-started", {destinationKey, routeConfirmationId});
    if (!transition.ok) return transition;
    const next = {...state, status: transition.record.status, record: transition.record,
      destinationKey, routeConfirmationId};
    if (!await writeReceipt(message, next)) return refuse("receipt-uncertain");
    return {ok: true, status: next.status};
  });
}

/** Record the single arrival attempt; it cannot be repeated after absence. */
export async function recordPhoenixCourierAttempt(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    if (!state || state.kind !== "phoenix-courier" || state.status !== "in-transit"
        || game.time.worldTime >= state.record.expiresAt) return refuse("ticket-not-in-transit");
    const held = itemAt(worldActor(state.custodyActorUuid), state.parcels[0].itemId);
    if (!held || !same(canonicalItem(held), state.parcels[0].custodyData)) return refuse("parcel-missing-or-changed");
    const review = await utilityDialog({title: `GM: Phoenix Courier arrival at ${state.mission.destinationLabel}`,
      note: "The GM adjudicates the route and arrival. The parcel makes one delivery attempt.", fields: [
        {name: "arrived", type: "checkbox", label: "The courier physically reached the named destination"},
        {name: "recipientPresent", type: "checkbox", label: "The named willing recipient is present to take the parcel"},
        {name: "parcelHeld", type: "checkbox", label: "The actual parcel remains intact in GM custody"}
      ]});
    if (!review?.arrived || !review?.parcelHeld) return refuse("arrival-not-confirmed");
    const recipientPresent = review.recipientPresent === true;
    const routeConfirmationId = foundry.utils.randomID();
    const transition = updateRecord(state, "delivery-attempted", {recipientPresent, routeConfirmationId});
    if (!transition.ok) return transition;
    const next = {...state, status: transition.record.status, record: transition.record};
    if (!await writeReceipt(message, next)) return refuse("receipt-uncertain");
    return {ok: true, status: next.status};
  });
}

/** Transfer the held physical parcel to the recipient after the GM records presence. */
export async function completePhoenixCourierDelivery(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    if (!state || state.kind !== "phoenix-courier" || state.status !== "delivery-pending"
        || game.time.worldTime >= state.record.expiresAt) return refuse("ticket-not-delivery-pending");
    const parcel = state.parcels[0];
    try {
      const made = await placeFromCustody(message, state, parcel, parcel.recipientUuid, parcel.custodyData);
      const transition = updateRecord(state, "delivered", {parcelId: parcel.parcelId, recipientItemId: made.id});
      if (!transition.ok) throw Error(transition.reason);
      const next = {...state, status: transition.record.status, record: transition.record, delivered: [parcel.parcelId]};
      if (!await writeReceipt(message, next)) throw Error("receipt-uncertain");
      return {ok: true, status: next.status};
    } catch {
      await writeReceipt(message, {...stateOf(message), status: "needs-review", failure: "delivery stage uncertain"});
      return refuse("needs-review");
    }
  });
}

/** Record an outside-harm adjudication after the GM has applied the actual Item edit. */
export async function recordPhoenixCourierCondition(ticket, {note} = {}) {
  if (!gmHere() || typeof note !== "string" || !note.trim() || note.length > 500) return refuse("authority-or-note");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    if (!state || state.kind !== "phoenix-courier" || !["held", "in-transit", "delivery-pending", "returning"].includes(state.status))
      return refuse("ticket-status");
    const parcel = state.parcels[0], custody = worldActor(state.custodyActorUuid), item = itemAt(custody, parcel.itemId);
    if (!item || item.id !== parcel.itemId || item.type !== parcel.itemData.type) return refuse("parcel-missing-or-replaced");
    const current = canonicalItem(item);
    if (!current) return refuse("parcel-unreadable");
    const transition = updateRecord(state, "condition-noted", {note: note.trim()});
    if (!transition.ok) return transition;
    const custodyData = structuredClone(current);
    if (custodyData.system) custodyData.system.container = null;
    const itemData = structuredClone(custodyData);
    if (itemData.system) itemData.system.container = parcel.originalContainerId
      && itemAt(worldActor(parcel.ownerUuid), parcel.originalContainerId) ? parcel.originalContainerId : null;
    const parcels = state.parcels.map(row => row.parcelId === parcel.parcelId ? {...row, custodyData, itemData,
      weightLb: weightFor(current), itemDigest: digestData(itemData)} : row);
    const next = {...state, status: transition.record.status, record: transition.record, parcels};
    if (!await writeReceipt(message, next)) return refuse("receipt-uncertain");
    return {ok: true, status: next.status};
  });
}

/** GM can explicitly destroy a parcel when outside harm destroys the actual item. */
export async function recordPhoenixCourierLoss(ticket, reason) {
  if (!gmHere() || typeof reason !== "string" || !reason.trim() || reason.length > 500) return refuse("authority-or-reason");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), state = stateOf(message);
    if (!state || state.kind !== "phoenix-courier" || !["held", "in-transit", "delivery-pending", "returning"].includes(state.status))
      return refuse("ticket-status");
    const parcel = state.parcels[0], custody = worldActor(state.custodyActorUuid), item = itemAt(custody, parcel.itemId);
    if (!item || item.id !== parcel.itemId) return refuse("parcel-not-in-custody");
    const transition = updateRecord(state, "lost", {reason: reason.trim()});
    if (!transition.ok) return transition;
    if (!await deleteItem(custody, item)) return refuse("item-delete-uncertain");
    const next = {...state, status: transition.record.status, record: transition.record, lossReason: reason.trim()};
    if (!await writeReceipt(message, next)) return refuse("receipt-uncertain");
    return {ok: true, status: next.status};
  });
}

/** Reconcile or cancel by returning held/delivered documents to original owners. */
export async function returnItemCustody(ticket) {
  if (!gmHere()) return refuse("authority");
  return serialized(ticket, async () => {
    const message = game.messages.get(ticket), initial = stateOf(message);
    if (!initial || ["returned", "delivered", "cancelled", "lost", "failed", "expired"].includes(initial.status)) return refuse("ticket-ended");
    let state = initial;
    if (state.record.status !== "returning") {
      const begin = advanceItemCustody(state.record, {operationId: foundry.utils.randomID(), operation: "begin-return",
        at: game.time.worldTime, gmApproval: game.user.id, data: {}});
      if (!begin.ok) return begin;
      state = {...state, status: "returning", record: begin.record};
      if (!await writeReceipt(message, state)) return refuse("receipt-uncertain");
    }
    for (const parcel of state.parcels) {
      if (state.record.returned.some(row => row.parcelId === parcel.parcelId)) continue;
      const currentSource = worldActor(parcel.ownerUuid), custody = worldActor(state.custodyActorUuid);
      const currentRecipient = worldActor(parcel.recipientUuid);
      const dataAtDest = parcel.custodyData;
      let item = itemAt(custody, parcel.itemId);
      const sourceItem = itemAt(currentSource, parcel.itemId);
      const recipientItem = itemAt(currentRecipient, parcel.itemId);
      if (sourceItem && !item && !recipientItem && same(canonicalItem(sourceItem), parcel.itemData)) {
        const transition = advanceItemCustody(state.record, {operationId: foundry.utils.randomID(), operation: "returned",
          at: game.time.worldTime, gmApproval: game.user.id, data: {parcelId: parcel.parcelId, ownerItemId: sourceItem.id}});
        if (!transition.ok) return refuse("needs-review");
        state = {...state, status: transition.record.status, record: transition.record};
        if (!await writeReceipt(message, state)) return refuse("needs-review");
        continue;
      }
      const recipientData = state.kind === "pact-escrow"
        ? pactDestinationData(ticket, state, parcel, parcel.recipientUuid) : dataAtDest;
      if (!item && recipientItem && same(canonicalItem(recipientItem), recipientData)) {
        if (!await deleteItem(currentRecipient, recipientItem)) return refuse("needs-review");
        try { item = await createItem(custody, dataAtDest); }
        catch {
          if (!itemAt(custody, parcel.itemId) && !itemAt(currentRecipient, parcel.itemId)) await createItem(currentRecipient, dataAtDest);
          return refuse("needs-review");
        }
        if (!item && !itemAt(custody, parcel.itemId) && !itemAt(currentRecipient, parcel.itemId))
          await createItem(currentRecipient, dataAtDest);
        if (!item) return refuse("needs-review");
      }
      if (!item && !itemAt(currentSource, parcel.itemId)) item = await createItem(custody, dataAtDest);
      if (!item || !same(canonicalItem(item), dataAtDest)) return refuse("needs-review");
      let returnData = structuredClone(parcel.itemData);
      if (parcel.originalContainerId && !itemAt(currentSource, parcel.originalContainerId) && returnData.system)
        returnData.system.container = null;
      const held = itemAt(custody, parcel.itemId);
      if (!await deleteItem(custody, held)) return refuse("needs-review");
      let returned;
      try { returned = await createItem(currentSource, returnData); }
      catch {
        if (!itemAt(currentSource, parcel.itemId) && !itemAt(custody, parcel.itemId)) await createItem(custody, dataAtDest);
        return refuse("needs-review");
      }
      if (!returned && !itemAt(currentSource, parcel.itemId) && !itemAt(custody, parcel.itemId))
        await createItem(custody, dataAtDest);
      if (!returned || !same(canonicalItem(returned), returnData)) return refuse("needs-review");
      const transition = advanceItemCustody(state.record, {operationId: foundry.utils.randomID(), operation: "returned",
        at: game.time.worldTime, gmApproval: game.user.id, data: {parcelId: parcel.parcelId, ownerItemId: returned.id}});
      if (!transition.ok) return refuse("needs-review");
      state = {...state, status: transition.record.status, record: transition.record};
      if (!await writeReceipt(message, state)) return refuse("needs-review");
    }
    return {ok: true, status: state.status, ticket};
  });
}

export function itemCustodyReceipt(ticket) {
  if (!gmHere()) return null;
  return stateOf(game.messages.get(ticket)) ?? null;
}

/** Expired Pact circles and undelivered Phoenix missions return their real Items. */
export function registerItemCustodyHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  Hooks.on("updateWorldTime", () => {
    if (!gmHere()) return;
    for (const message of messages()) {
      const state = stateOf(message);
      if (!state || state.record.expiresAt > game.time.worldTime || ["delivered", "returned", "cancelled", "failed", "expired", "lost"].includes(state.status)) continue;
      if (["prepared", "claimed"].includes(state.status)) {
        void writeReceipt(message, {...state, status: "expired"});
        continue;
      }
      void returnItemCustody(message.id);
    }
  });
}

/** Add owner cancel/recall and active-GM commit/dispatch controls to paid cards. */
export function registerItemCustodyCardHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message.flags?.[NS], ticket = flags?.itemCustodyTicket;
    if (!ticket || flags.kind !== "spell" || !["pact-escrow", "phoenix-courier"].includes(flags.identifier)) return;
    const state = game.user?.isGM ? stateOf(game.messages.get(ticket)) : null;
    if (game.user?.isGM && (!state || state.cardId !== message.id)) return;
    const container = html.querySelector(".azeroth-card");
    if (!container) return;
    const add = (label, operation, data = {}) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          let result;
          if (operation === "pact-deliver") result = await deliverItemCustody(ticket);
          else if (operation === "pact-cleanup") result = await requestItemCustodyOperation({ticket, operation: "pact-cleanup"});
          else if (operation === "custody-retry") result = await requestItemCustodyFinish({ticket, messageId: message.id});
          else if (operation === "phoenix-start") result = await startPhoenixCourier(ticket);
          else if (operation === "phoenix-attempt") result = await recordPhoenixCourierAttempt(ticket);
          else if (operation === "phoenix-deliver") result = await completePhoenixCourierDelivery(ticket);
          else if (operation === "phoenix-condition") {
            const answer = await utilityDialog({title: "Record Phoenix parcel condition", note: "First make the actual item change in the GM-only custody Actor. This records that current item data and its effect on the mission.", fields: [
              {name: "note", multiline: true, maxLength: 500, label: "What outside harm changed the parcel?"}
            ]});
            if (!answer?.note) return;
            result = await recordPhoenixCourierCondition(ticket, {note: answer.note});
          }
          else if (operation === "phoenix-loss") {
            const answer = await utilityDialog({title: "Record destroyed Phoenix parcel", note: "Use this only if outside harm irrecoverably destroyed the actual parcel. The item will be deleted from GM custody and the courier ends lost.", fields: [
              {name: "reason", maxLength: 500, label: "What destroyed the parcel?"},
              {name: "confirmDestroyed", type: "checkbox", label: "I confirm the actual parcel is destroyed and can no longer be returned or delivered"}
            ]});
            if (!answer?.reason || !answer.confirmDestroyed) return;
            result = await recordPhoenixCourierLoss(ticket, answer.reason);
          }
          else if (game.user?.isGM && operation === "return") result = await returnItemCustody(ticket);
          else result = await requestItemCustodyOperation({ticket, operation});
          if (!result?.ok) ui.notifications.warn(`Item custody action refused: ${result?.reason ?? "unknown"}`);
          else ui.notifications.info(`Item custody recorded: ${result.status ?? operation}.`);
        } catch { ui.notifications.warn("Item custody could not be confirmed; ask the GM to reconcile the private receipt."); }
        finally { button.disabled = false; }
      });
      container.append(button);
    };
    if (game.user?.isGM) {
      if (state.kind === "pact-escrow" && state.status === "held") {
        add("GM: Complete Pact Escrow exchange", "pact-deliver");
        add("GM: Return both Pact deposits", "return");
      }
      if (state.kind === "phoenix-courier" && ["held", "in-transit", "delivery-pending"].includes(state.status)) {
        add("GM: Reconcile parcel condition", "phoenix-condition");
        add("GM: Record destroyed parcel", "phoenix-loss");
      }
      if (state.kind === "phoenix-courier" && state.status === "held") add("GM: Dispatch Phoenix Courier", "phoenix-start");
      if (state.kind === "phoenix-courier" && state.status === "in-transit") add("GM: Record courier arrival", "phoenix-attempt");
      if (state.kind === "phoenix-courier" && state.status === "delivery-pending") {
        add("GM: Complete parcel delivery", "phoenix-deliver");
        add("GM: Return parcel to caster", "return");
      }
      if (state.status === "needs-review" && state.record?.status === "holding" && state.cardId === message.id)
        add("GM: Retry item custody from this cast", "custody-retry");
      if (state.kind === "pact-escrow" && state.record?.status === "delivered" && state.parcels.some(parcel => {
        const delivered = state.record.delivered.find(row => row.parcelId === parcel.parcelId);
        const item = (delivered?.recipientItemId && itemAt(worldActor(parcel.recipientUuid), delivered.recipientItemId))
          ?? itemAt(worldActor(parcel.recipientUuid), parcel.itemId);
        return isItemCustodyPending(item);
      })) add("GM: Reconcile Pact item locks", "pact-cleanup");
      if (["returning", "needs-review"].includes(state.status) && state.record?.status !== "delivered")
        add("GM: Reconcile and return item custody", "return");
    } else if ((flags.identifier === "pact-escrow" && ["held", "needs-review"].includes(flags.itemCustodyStatus))
        || (flags.identifier === "phoenix-courier" && ["held", "in-transit", "delivery-pending"].includes(flags.itemCustodyStatus))) {
      add(flags.identifier === "pact-escrow" ? "Cancel Pact Escrow" : "Recall Phoenix Courier", flags.identifier === "pact-escrow" ? "cancel" : "recall");
    }
  });
}
