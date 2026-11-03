/**
 * Pure state law for seven GM-adjudicated thematic object spells.
 *
 * Declarations contain only recorded facts. `gmApproval` is supplied by the
 * active-GM adapter after an explicit review; these functions do not inspect a
 * scene, move an item, alter a wall, read handwriting, or create harvest.
 */
export const SUPPORTED_THEMATIC_OBJECT_CASTS = Object.freeze(["arcane-seal", "rime-arrest", "spellwrights-mark", "seedwake", "heat-mirage", "icevein-passage"]);
export const THEMATIC_OBJECT_SPELLS = Object.freeze([
  "arcane-seal", "rime-arrest", "spellwrights-mark", "seedwake",
  "icevein-passage", "heat-mirage", "phoenix-courier"
]);

// Foundry world time is measured in seconds. All state deadlines use that clock.
const HOUR = 60 * 60;
const MINUTE = 60;
const id = value => typeof value === "string" && value.trim().length > 0 && value.length <= 240;
const time = value => Number.isFinite(value) && value >= 0;
const finitePositive = value => Number.isFinite(value) && value > 0;
const sha256 = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
const clone = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const ok = (record, outcome = null) => Object.freeze({ok: true, record: freeze(record), outcome: outcome && freeze(outcome)});
const no = reason => Object.freeze({ok: false, reason});
const uniqueIds = (value, max) => Array.isArray(value) && value.length <= max
  && value.every(id) && new Set(value).size === value.length;

function base(input, status, durationSeconds, data) {
  if (!exactKeys(input, ["spellId", "objectId", "actorUuid", "castId", "operationId", "now", "gmApproval", "declaration", "activeRecords"])) return no("unknown-or-missing-field");
  const {spellId, objectId, actorUuid, castId, operationId, now, gmApproval, declaration, activeRecords = []} = input;
  if (!THEMATIC_OBJECT_SPELLS.includes(spellId) || !id(objectId) || !id(actorUuid) || !id(castId)
      || !id(operationId) || !time(now) || !id(gmApproval) || !Array.isArray(activeRecords)) return no("invalid-request");
  if (activeRecords.some(record => record?.castId === castId || record?.operationIds?.includes(operationId))) return no("replayed-operation");
  return {spellId, objectId, actorUuid, castId, operationId, createdAt: now,
    expiresAt: durationSeconds === null ? null : now + durationSeconds,
    gmApproval, operationIds: [operationId], status, ...data};
}

/** Validate a GM-approved declaration and return its canonical immutable record. */
export function createThematicObjectRecord(input = {}) {
  const {spellId, declaration} = input;
  let record;
  switch (spellId) {
    case "arcane-seal": {
      if (!exactKeys(declaration, ["objectKind", "closed", "mundane", "authorizedUuids"])
          || !["door", "lid", "shutter"].includes(declaration.objectKind)
          || declaration.closed !== true || declaration.mundane !== true
          || !uniqueIds(declaration.authorizedUuids, 6)) return no("invalid-seal-target-or-authority");
      if ((input.activeRecords ?? []).some(row => row?.spellId === spellId && row.objectId === input.objectId
          && row.status === "active" && row.expiresAt > input.now)) return no("replace-existing-seal-first");
      record = base(input, "active", 8 * HOUR, {objectKind: declaration.objectKind,
        authorizedUuids: [...declaration.authorizedUuids]});
      break;
    }
    case "rime-arrest": {
      if (!exactKeys(declaration, ["mechanismKind", "exposed", "mundane", "moving", "affectedLengthFt", "operatingConsequence"])
          || !id(declaration.mechanismKind) || declaration.mechanismKind.toLowerCase().includes("construct")
          || declaration.exposed !== true || declaration.mundane !== true || declaration.moving !== true
          || !finitePositive(declaration.affectedLengthFt) || declaration.affectedLengthFt > 5 || !id(declaration.operatingConsequence)) return no("invalid-mechanism");
      record = base(input, "active", MINUTE, {mechanismKind: declaration.mechanismKind,
        affectedLengthFt: declaration.affectedLengthFt, operatingConsequence: declaration.operatingConsequence,
        restart: "ordinary operation when the GM confirms the ice is removed; no force or break threshold is calculated"});
      break;
    }
    case "spellwrights-mark": {
      if (!exactKeys(declaration, ["targetKind", "originalDigest", "verifierUuids"])
          || !["page", "packet-seal"].includes(declaration.targetKind) || !sha256(declaration.originalDigest)
          || !uniqueIds(declaration.verifierUuids, 6)) return no("invalid-mark");
      record = base(input, "active", 720 * HOUR, {targetKind: declaration.targetKind,
        digestAlgorithm: "SHA-256", originalDigest: declaration.originalDigest.toLowerCase(), verifierUuids: [...declaration.verifierUuids], markId: input.castId,
        identitySource: input.actorUuid});
      break;
    }
    case "seedwake": {
      if (!exactKeys(declaration, ["plotKey", "radiusFt", "viableSeeds", "conditionsSupported", "naturalSeasonEndsAt"])
          || !id(declaration.plotKey) || declaration.viableSeeds !== true || declaration.conditionsSupported !== true
          || !finitePositive(declaration.radiusFt) || declaration.radiusFt > 20
          || !time(declaration.naturalSeasonEndsAt) || declaration.naturalSeasonEndsAt <= input.now + 8 * HOUR) return no("plot-not-ready-or-season-unverified");
      if ((input.activeRecords ?? []).some(row => row?.spellId === spellId && row?.plotKey === declaration.plotKey
          && ["growing", "completed"].includes(row?.status) && row.naturalSeasonEndsAt > input.now)) return no("plot-season-already-used");
      record = base(input, "growing", 8 * HOUR, {plotKey: declaration.plotKey, radiusFt: declaration.radiusFt,
        naturalSeasonEndsAt: declaration.naturalSeasonEndsAt, harvest: "ordinary plot yield only; GM adjudicates, no quantity is generated"});
      break;
    }
    case "icevein-passage": {
      if (!exactKeys(declaration, ["routeKey", "connectedNonmagicalIce", "courseClear", "lengthFt", "widthFt"])
          || !id(declaration.routeKey) || declaration.connectedNonmagicalIce !== true || declaration.courseClear !== true
          || !finitePositive(declaration.lengthFt) || declaration.lengthFt > 100
          || !finitePositive(declaration.widthFt) || declaration.widthFt > 10) return no("route-not-gm-cleared");
      record = base(input, "opening", 8 * HOUR, {routeKey: declaration.routeKey,
        lengthFt: declaration.lengthFt, widthFt: declaration.widthFt, opensAt: input.now + MINUTE,
        closesAt: input.now + 8 * HOUR, closingAt: input.now + 8 * HOUR + MINUTE,
        closure: "GM confirms occupants have left; never crush or imprison"});
      break;
    }
    case "heat-mirage": {
      if (!exactKeys(declaration, ["sceneId", "x", "y", "imageDescription", "imagePath"])
          || !id(declaration.sceneId) || !Number.isFinite(declaration.x) || !Number.isFinite(declaration.y)
          || !id(declaration.imageDescription) || !localImagePath(declaration.imagePath)) return no("invalid-illusion-anchor");
      record = base(input, "active", null, {anchor: {sceneId: declaration.sceneId, x: declaration.x, y: declaration.y, widthFt: 10, heightFt: 10, depthFt: 10},
        imagePath: declaration.imagePath, imageDescription: declaration.imageDescription, knownBy: [],
        upkeepManaPerTurn: 2,
        limits: "visual only; no sound, force, light, damage, creature concealment or passage through a wall"});
      break;
    }
    case "phoenix-courier": {
      if (!exactKeys(declaration, ["parcelUuid", "parcelWeightLb", "parcelLiving", "recipientUuid", "destinationKey", "destinationVisited", "recipientWilling", "distanceMiles", "routeTraversable"])
          || !id(declaration.parcelUuid) || !finitePositive(declaration.parcelWeightLb) || declaration.parcelWeightLb > 1
          || declaration.parcelLiving !== false || !id(declaration.recipientUuid) || !id(declaration.destinationKey)
          || declaration.destinationVisited !== true || declaration.recipientWilling !== true
          || !Number.isFinite(declaration.distanceMiles) || declaration.distanceMiles < 0 || declaration.distanceMiles > 20
          || declaration.routeTraversable !== true) return no("delivery-not-gm-cleared");
      if ((input.activeRecords ?? []).some(row => row?.spellId === spellId && row?.actorUuid === input.actorUuid
          && ["active", "awaiting-custody", "delivery-attempted", "returning"].includes(row?.status))) return no("recall-existing-courier-first");
      record = base(input, "awaiting-custody", 8 * HOUR, {parcelUuid: declaration.parcelUuid,
        parcelWeightLb: declaration.parcelWeightLb, recipientUuid: declaration.recipientUuid,
        destinationKey: declaration.destinationKey, distanceMiles: declaration.distanceMiles,
        limits: "one delivery attempt along a physically traversable route; no scouting, barriers, attacks, creature cargo or parcel activation; outside harm can affect the parcel",
        integrationPending: "inventory must confirm parcel custody before any courier mission is active"});
      break;
    }
    default: return no("unknown-spell");
  }
  if (record?.ok === false) return record;
  return ok(freeze(record));
}

function localImagePath(value) {
  return typeof value === "string" && value.length <= 1000 && !value.startsWith("/")
    && !/[\\\u0000-\u001f]/.test(value) && !/(?:^|\/)\.\.(?:\/|$)/.test(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/** Arcane Seal authorizes names only; everyone else still uses the normal lock Test or dispel. */
export function arcaneSealAccess(record, actorUuid, now) {
  if (record?.spellId !== "arcane-seal" || record.status !== "active" || !id(actorUuid) || !time(now)) return Object.freeze({allowed: false, reason: "seal-inactive-or-invalid"});
  if (now >= record.expiresAt) return Object.freeze({allowed: false, reason: "seal-expired"});
  return record.authorizedUuids.includes(actorUuid)
    ? Object.freeze({allowed: true, reason: "authorized"})
    : Object.freeze({allowed: false, reason: "ordinary-lock-test-or-dispel"});
}

/** Apply one unique, GM-approved transition. Unknown command data is rejected. */
export function transitionThematicObject(record, command = {}) {
  if (!record || !exactKeys(command, ["operationId", "operation", "at", "gmApproval", "data"])) return no("unknown-or-missing-command-field");
  const {operationId, operation, at, gmApproval, data} = command;
  if (!id(operationId) || !id(gmApproval) || !time(at) || !id(operation) || !Array.isArray(record.operationIds)) return no("invalid-command");
  if (record.operationIds.includes(operationId)) return no("replayed-operation");
  let next = clone(record), outcome = null;
  const finish = (status, extra = {}) => {
    next.status = status;
    Object.assign(next, extra);
    next.operationIds = [...record.operationIds, operationId];
    next.lastOperation = {operation, operationId, at, gmApproval};
    return ok(next, outcome);
  };

  switch (record.spellId) {
    case "arcane-seal":
      if (record.status !== "active" || !["break", "dispel", "expire", "replace"].includes(operation)
          || !exactKeys(data, [])) return no("invalid-seal-transition");
      if (operation === "expire" && at < record.expiresAt) return no("not-expired");
      return finish("ended", {endReason: operation});
    case "rime-arrest":
      if (record.status !== "active" || !["break", "thaw", "expire"].includes(operation)
          || !exactKeys(data, [])) return no("invalid-arrest-transition");
      if (operation === "expire" && at < record.expiresAt) return no("not-expired");
      return finish("ended", {endReason: operation, mechanismRestartPermitted: true});
    case "spellwrights-mark":
      if (record.status !== "active" || !["verify", "dispel", "expire"].includes(operation)) return no("invalid-mark-transition");
      if (operation === "dispel" && exactKeys(data, [])) return finish("ended", {endReason: "dispel"});
      if (operation === "expire" && exactKeys(data, []) && at >= record.expiresAt) return finish("ended", {endReason: "expire"});
      if (record.status !== "active" || operation !== "verify"
          || !exactKeys(data, ["verifierUuid", "touching", "knowsCasterIdentity", "sameMark", "currentDigest"])
          || !id(data.verifierUuid) || !record.verifierUuids.includes(data.verifierUuid)
          || data.touching !== true || data.knowsCasterIdentity !== true || typeof data.sameMark !== "boolean" || !sha256(data.currentDigest)
          || at >= record.expiresAt) return no("verification-not-authorized-or-not-present");
      outcome = Object.freeze({casterPlacedMark: data.sameMark,
        writingOrSealChanged: data.sameMark && data.currentDigest.toLowerCase() !== record.originalDigest,
        verifiedCasterUuid: data.sameMark ? record.identitySource : null,
        truthCertified: false, handwritingInterpreted: false});
      next.verifications = [...(record.verifications ?? []), {operationId, verifierUuid: data.verifierUuid, at,
        casterPlacedMark: outcome.casterPlacedMark, writingOrSealChanged: outcome.writingOrSealChanged}];
      return finish(record.status);
    case "seedwake":
      if (record.status !== "growing" || operation !== "complete" || !exactKeys(data, [])) return no("invalid-growth-transition");
      if (at < record.expiresAt) return no("growth-not-finished");
      return finish("completed", {completedAt: at, harvestAdjudicationPending: true,
        nextEligibleAt: record.naturalSeasonEndsAt});
    case "icevein-passage":
      if (operation === "finish-open" && record.status === "opening" && exactKeys(data, ["mapChanged"])
          && data.mapChanged === true
          && at >= record.opensAt && at < record.closesAt)
        return finish("active", {openedAt: at, mapEditPending: false});
      if (operation === "begin-close" && ["opening", "active"].includes(record.status) && exactKeys(data, []) && at >= record.closesAt)
        return finish("closing", {closeRequestedAt: at});
      if (operation === "finish-close" && record.status === "closing"
          && exactKeys(data, ["occupantsClear", "mapChanged"]) && typeof data.occupantsClear === "boolean"
          && typeof data.mapChanged === "boolean" && at >= record.closingAt) {
        if (!data.occupantsClear) return finish("closing-paused", {closeBlockedByOccupant: true});
        if (!data.mapChanged) return no("map-closure-not-confirmed");
        return finish("closed", {closedAt: at, mapEditPending: false});
      }
      if (operation === "finish-close" && record.status === "closing-paused"
          && exactKeys(data, ["occupantsClear", "mapChanged"]) && typeof data.occupantsClear === "boolean"
          && typeof data.mapChanged === "boolean" && data.occupantsClear && data.mapChanged)
        return finish("closed", {closedAt: at, closeBlockedByOccupant: false, mapEditPending: false});
      return no("invalid-passage-transition");
    case "heat-mirage":
      if (operation === "discover" && record.status === "active"
          && exactKeys(data, ["viewerUuid", "method", "contactConfirmed", "testPassed"])
          && id(data.viewerUuid) && ["contact", "test"].includes(data.method)
          && (data.method === "contact" ? data.contactConfirmed === true && data.testPassed === false
            : data.contactConfirmed === false && data.testPassed === true)
          && !record.knownBy.includes(data.viewerUuid)) {
        next.knownBy = [...record.knownBy, data.viewerUuid];
        next.operationIds = [...record.operationIds, operationId];
        next.lastOperation = {operation, operationId, at, gmApproval};
        return ok(next, {knownBy: [...next.knownBy]});
      }
      if (!exactKeys(data, [])) return no("invalid-illusion-transition");
      if (operation === "end" && record.status === "active") return finish("ended", {endedAt: at});
      return no("invalid-illusion-transition");
    case "phoenix-courier":
      if (operation === "custody-confirmed" && record.status === "awaiting-custody"
          && exactKeys(data, ["inventoryReceiptId"]) && id(data.inventoryReceiptId) && at < record.expiresAt)
        return finish("active", {custodyReceiptId: data.inventoryReceiptId});
      if (operation === "recall" && ["awaiting-custody", "active", "delivery-attempted", "returning"].includes(record.status)
          && exactKeys(data, ["inventoryReturnReceiptId"]) && id(data.inventoryReturnReceiptId))
        return finish("recalled", {inventoryReturnReceiptId: data.inventoryReturnReceiptId, inventoryIntegrationPending: true});
      if (operation === "attempt-delivery" && record.status === "active"
          && exactKeys(data, ["routeConfirmationId", "recipientPresent"]) && id(data.routeConfirmationId) && typeof data.recipientPresent === "boolean")
        return finish(data.recipientPresent ? "delivery-attempted" : "returning", {deliveryAttempt: 1, routeConfirmationId: data.routeConfirmationId});
      if (operation === "delivered" && record.status === "delivery-attempted"
          && exactKeys(data, ["inventoryReceiptId"]) && id(data.inventoryReceiptId))
        return finish("delivered", {deliveryConfirmationId: record.routeConfirmationId, inventoryReceiptId: data.inventoryReceiptId});
      if (operation === "returned" && record.status === "returning"
          && exactKeys(data, ["routeConfirmationId", "inventoryReceiptId"]) && id(data.routeConfirmationId) && id(data.inventoryReceiptId))
        return finish("returned", {returnConfirmationId: data.routeConfirmationId, inventoryReceiptId: data.inventoryReceiptId});
      return no("invalid-courier-transition");
    default: return no("unknown-spell");
  }
}
