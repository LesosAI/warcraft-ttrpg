/** Pure state law for GM-mediated movement of actual item documents.
 *
 * This records a recoverable multi-document transaction. It does not pretend
 * that Foundry can atomically write to several Actors. Each physical write is
 * acknowledged separately and duplicate/replay outcomes are rejected.
 */
const id = value => typeof value === "string" && value.trim().length > 0 && value.length <= 240;
const time = value => Number.isFinite(value) && value >= 0;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
const fail = reason => Object.freeze({ok: false, reason});
const ok = record => Object.freeze({ok: true, record: Object.freeze(record)});
const clone = value => structuredClone(value);

export function createItemCustodyRecord(input = {}) {
  if (!exactKeys(input, ["transactionId", "kind", "createdAt", "expiresAt", "custodyActorUuid", "parcels"])
      || !id(input.transactionId) || !["pact-escrow", "phoenix-courier"].includes(input.kind)
      || !time(input.createdAt) || !time(input.expiresAt) || input.expiresAt <= input.createdAt
      || !id(input.custodyActorUuid) || !Array.isArray(input.parcels)
      || input.parcels.length !== (input.kind === "pact-escrow" ? 2 : 1)) return fail("invalid-transaction");
  const parcels = input.parcels.map(row => {
    if (!exactKeys(row, ["parcelId", "itemUuid", "itemId", "ownerUuid", "recipientUuid", "weightLb", "itemData"])
        || ![row.parcelId, row.itemUuid, row.itemId, row.ownerUuid, row.recipientUuid].every(id)
        || !Number.isFinite(row.weightLb) || row.weightLb <= 0 || !row.itemData || typeof row.itemData !== "object") return null;
    return clone(row);
  });
  if (parcels.some(row => !row) || new Set(parcels.map(row => row.parcelId)).size !== parcels.length
      || new Set(parcels.map(row => row.itemUuid)).size !== parcels.length
      || (input.kind === "pact-escrow" && parcels.some(row => row.weightLb > 10))
      || (input.kind === "phoenix-courier" && parcels[0].weightLb > 1)) return fail("invalid-parcels");
  if (input.kind === "pact-escrow" && (parcels[0].ownerUuid === parcels[1].ownerUuid
      || parcels[0].recipientUuid !== parcels[1].ownerUuid || parcels[1].recipientUuid !== parcels[0].ownerUuid)) return fail("not-opposite-participants");
  return ok(Object.freeze({version: 1, transactionId: input.transactionId, kind: input.kind,
    createdAt: input.createdAt, expiresAt: input.expiresAt, custodyActorUuid: input.custodyActorUuid,
    status: "holding", parcels, held: [], delivered: [], returned: [], operationIds: [], lastOperation: null}));
}

/** Advance only after the adapter verified the matching physical document write. */
export function advanceItemCustody(record, command = {}) {
  if (!record || !exactKeys(command, ["operationId", "operation", "at", "gmApproval", "data"])) return fail("invalid-command-shape");
  const {operationId, operation, at, gmApproval, data} = command;
  if (![operationId, operation, gmApproval].every(id) || !time(at) || !data || typeof data !== "object" || Array.isArray(data)) return fail("invalid-command");
  if (record.operationIds.includes(operationId)) return fail("replayed-operation");
  const next = clone(record);
  const finish = (status = next.status) => {
    next.status = status;
    next.operationIds.push(operationId);
    next.lastOperation = {operationId, operation, at, gmApproval};
    return ok(Object.freeze(next));
  };
  const parcel = idValue => next.parcels.find(row => row.parcelId === idValue);
  if (operation === "held" && next.status === "holding"
      && exactKeys(data, ["parcelId", "custodyItemId"]) && parcel(data.parcelId) && id(data.custodyItemId)
      && !next.held.some(row => row.parcelId === data.parcelId)) {
    next.held.push({parcelId: data.parcelId, custodyItemId: data.custodyItemId, at});
    if (next.held.length === next.parcels.length) next.status = "held";
    return finish();
  }
  if (operation === "cancel" && ["holding", "held"].includes(next.status) && exactKeys(data, [])) {
    return finish(next.held.length ? "returning" : "cancelled");
  }
  if (operation === "begin-delivery" && next.status === "held" && exactKeys(data, [])) return finish("delivering");
  if (operation === "delivered" && next.status === "delivering"
      && exactKeys(data, ["parcelId", "recipientItemId"]) && parcel(data.parcelId) && id(data.recipientItemId)
      && !next.delivered.some(row => row.parcelId === data.parcelId)) {
    next.delivered.push({parcelId: data.parcelId, recipientItemId: data.recipientItemId, at});
    if (next.delivered.length === next.parcels.length) next.status = "delivered";
    return finish();
  }
  if (operation === "mission-started" && next.kind === "phoenix-courier" && next.status === "held"
      && exactKeys(data, ["destinationKey", "routeConfirmationId"]) && id(data.destinationKey) && id(data.routeConfirmationId)
      && at < next.expiresAt) {
    next.destinationKey = data.destinationKey;
    next.routeConfirmationId = data.routeConfirmationId;
    return finish("in-transit");
  }
  if (operation === "delivery-attempted" && next.kind === "phoenix-courier" && next.status === "in-transit"
      && exactKeys(data, ["recipientPresent", "routeConfirmationId"]) && typeof data.recipientPresent === "boolean"
      && id(data.routeConfirmationId) && !next.deliveryAttempt && at < next.expiresAt) {
    next.deliveryAttempt = {recipientPresent: data.recipientPresent, routeConfirmationId: data.routeConfirmationId, at};
    return finish(data.recipientPresent ? "delivery-pending" : "returning");
  }
  if (operation === "begin-return" && ["holding", "held", "delivering", "in-transit", "delivery-pending", "needs-review"].includes(next.status)
      && exactKeys(data, [])) return finish("returning");
  if (operation === "delivered" && next.kind === "phoenix-courier" && next.status === "delivery-pending"
      && exactKeys(data, ["parcelId", "recipientItemId"]) && parcel(data.parcelId) && id(data.recipientItemId)) {
    next.delivered.push({parcelId: data.parcelId, recipientItemId: data.recipientItemId, at});
    return finish("delivered");
  }
  if (operation === "condition-noted" && next.kind === "phoenix-courier"
      && ["held", "in-transit", "delivery-pending", "returning"].includes(next.status)
      && exactKeys(data, ["note"]) && id(data.note) && data.note.length <= 500) {
    next.conditionNotes = [...(next.conditionNotes ?? []), {note: data.note, at}];
    return finish();
  }
  if (operation === "loss-pending" && next.kind === "phoenix-courier"
      && ["held", "in-transit", "delivery-pending", "returning"].includes(next.status)
      && exactKeys(data, ["reason"]) && id(data.reason) && data.reason.length <= 500) {
    next.lossPending = {reason: data.reason, at};
    return finish();
  }
  if (operation === "lost" && next.kind === "phoenix-courier"
      && ["held", "in-transit", "delivery-pending", "returning"].includes(next.status)
      && exactKeys(data, ["reason"]) && id(data.reason) && data.reason.length <= 500)
    return finish("lost", {lostAt: at, lossReason: data.reason});
  if (operation === "returned" && next.status === "returning"
      && exactKeys(data, ["parcelId", "ownerItemId"]) && parcel(data.parcelId) && id(data.ownerItemId)
      && !next.returned.some(row => row.parcelId === data.parcelId)) {
    next.returned.push({parcelId: data.parcelId, ownerItemId: data.ownerItemId, at});
    if (next.returned.length === next.parcels.length) next.status = "returned";
    return finish();
  }
  if (operation === "review" && next.status !== "delivered" && next.status !== "returned"
      && exactKeys(data, ["reason"]) && id(data.reason)) {
    next.reviewReason = data.reason;
    return finish("needs-review");
  }
  return fail("invalid-transition");
}
