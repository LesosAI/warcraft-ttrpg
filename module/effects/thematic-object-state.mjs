/** Paid cast receipts for GM-adjudicated object utility spells.
 *
 * `prepare` records a GM-approved proposal, `claim` binds it to one cast before
 * payment, and `finish` binds the successful paid card before creating the
 * private state record. The state stays in a GM-whispered ChatMessage. The
 * original card receives only a ticket/status pointer; illusion knowledge,
 * content digests, routes and object declarations never enter public flags.
 */
import { SUPPORTED_THEMATIC_OBJECT_CASTS, THEMATIC_OBJECT_SPELLS, arcaneSealAccess,
  createThematicObjectRecord, transitionThematicObject } from "../rules/thematic-objects.mjs";
import { THEMATIC_SPELL_ANIMATIONS } from "../rules/thematic-spell-animations.mjs";
import { SequencerPlayer } from "../animation/player.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";

export const THEMATIC_OBJECT_QUERY = "azeroth-rpg.thematicObject";
export const THEMATIC_OBJECT_OPERATION_QUERY = "azeroth-rpg.thematicObjectOperation";
export const THEMATIC_OBJECT_ACCESS_QUERY = "azeroth-rpg.thematicObjectAccess";
const NS = "azeroth-rpg";
const RECEIPT = "thematicObjectReceipt";
const PRIVATE_CUE = "thematicPrivateCue";
const SPELLWRIGHTS_MARK_VERIFICATION_CUE = "spellwrights-mark-verification";
const SUPPORTED_CASTS = new Set(SUPPORTED_THEMATIC_OBJECT_CASTS);
const jobs = new Map();
const playedPrivateNotices = new WeakSet();
let objectHooksRegistered = false;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const refuse = reason => ({ok: false, reason});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stateOf = message => message?.flags?.[NS]?.[RECEIPT];
const refOf = ref => ref ? {sceneId: ref.sceneId ?? null, tokenId: ref.tokenId ?? null, actorId: ref.actorId ?? null} : null;
const tokenAt = ref => ref?.sceneId && ref?.tokenId ? game.scenes?.get(ref.sceneId)?.tokens.get(ref.tokenId) ?? null : null;
const privateWhisper = () => [...(game.users?.contents ?? [])].filter(user => user.isGM).map(user => user.id);
const write = (message, state) => message.update({[`flags.${NS}.${RECEIPT}`]: foundry.data.operators.ForcedReplacement.create(state)});
const messages = () => game.messages?.contents ?? [];
export const supportsThematicObject = identifier => SUPPORTED_CASTS.has(identifier);
const privateAudience = (...actors) => [...(game.users?.contents ?? [])]
  .filter(user => user.isGM || actors.some(actor => actor?.testUserPermission?.(user, "OWNER")))
  .map(user => user.id);
const privateNotice = async (actors, content, {privateCue = null} = {}) => {
  const whisper = privateAudience(...actors);
  if (whisper.length) await ChatMessage.create({author: game.user.id, whisper, blind: true,
    content: `<p>${foundry.utils.escapeHTML(content)}</p>`,
    ...(privateCue ? {flags: {[NS]: {[PRIVATE_CUE]: privateCue}}} : {})});
};

/** Play a GM-marked private tone only on clients included in that whisper. */
function playPrivateNoticeCue(message) {
  if (!message || playedPrivateNotices.has(message)) return;
  const flags = message.flags?.[NS];
  if (flags?.[PRIVATE_CUE] !== SPELLWRIGHTS_MARK_VERIFICATION_CUE
      || !Array.isArray(message.whisper) || !message.whisper.includes(game.user?.id)) return;
  const authorId = message.author?.id;
  const author = game.users?.get?.(authorId) ?? (game.users?.contents ?? []).find(user => user.id === authorId);
  if (author?.isGM !== true || typeof globalThis.Sequence !== "function") return;
  playedPrivateNotices.add(message);
  const sound = THEMATIC_SPELL_ANIMATIONS["spellwrights-mark"]?.privateSound?.asset;
  if (!sound) return;
  new SequencerPlayer().playCue([{kind: "sound", asset: sound, volume: 0.55}]);
}

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(payload) {
  if (gmHere()) return thematicObjectQueryHandler(payload, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm?.query) return refuse("no-active-gm");
  try { return await gm.query(THEMATIC_OBJECT_QUERY, payload, {timeout: 300000}); }
  catch { return refuse("unanswered"); }
}

function choiceFields(identifier, currentSceneId) {
  if (identifier === "arcane-seal") return [
    {name: "objectLabel", label: "Which door, lid or shutter? Include a clear location"},
    {name: "objectKind", label: "Object", options: ["door", "lid", "shutter"].map(value => ({value, label: value}))},
    ...actorFields("authorized", "Authorized Actor")
  ];
  if (identifier === "rime-arrest") return [
    {name: "objectLabel", label: "Which mechanism? Include a clear location"},
    {name: "mechanismKind", label: "Mundane mechanism"},
    {name: "affectedLengthFt", type: "number", min: 0.1, max: 5, label: "Affected portion, in feet (maximum 5)"},
    {name: "operatingConsequence", maxLength: 300, label: "What stops, as judged by the GM"}
  ];
  if (identifier === "spellwrights-mark") return [
    {name: "objectLabel", label: "Which page or closed packet seal? Include a clear location"},
    {name: "targetKind", label: "Target", options: ["page", "packet-seal"].map(value => ({value, label: value}))},
    {name: "originalText", multiline: true, maxLength: 12000, label: "Exact text to seal (kept private; normalized and hashed locally)"},
    ...actorFields("verifier", "Authorized verifier")
  ];
  if (identifier === "seedwake") return [
    {name: "objectLabel", label: "Prepared plot name or location"},
    {name: "radiusFt", type: "number", min: 0.1, max: 20, label: "Prepared plot radius in feet (maximum 20)"},
    {name: "seasonDaysRemaining", type: "number", min: 0, max: 3650, label: "Approximate days until the next natural season ends"}
  ];
  if (identifier === "heat-mirage") return [
    {name: "objectLabel", label: "Location of the fixed illusion anchor"},
    {name: "imageDescription", maxLength: 500, label: "Describe the static visual image"}
  ];
  if (identifier === "icevein-passage") return [
    {name: "objectLabel", label: "Describe the course through existing ice"},
    {name: "routeKey", label: "Stable route label"},
    {name: "lengthFt", type: "number", min: 0.1, max: 100, label: "Course length (feet; maximum 100)"},
    {name: "widthFt", type: "number", min: 0.1, max: 10, label: "Course width (feet; maximum 10)"}
  ];
  return [];
}

function actorOptions() {
  const visible = (game.actors?.contents ?? []).filter(actor => game.user?.isGM
    || actor.testUserPermission?.(game.user, "OBSERVER"));
  return [{value: "", label: "— None —"}, ...visible.map(actor => ({value: actor.uuid, label: actor.name}))];
}

function actorFields(prefix, label) {
  const options = actorOptions();
  return Array.from({length: 6}, (_, index) => ({name: `${prefix}${index + 1}`, label: `${label} ${index + 1}`,
    options, required: false}));
}

function selectedActorUuids(value, prefix) {
  const rows = Array.from({length: 6}, (_, index) => value?.[`${prefix}${index + 1}`]).filter(Boolean);
  return rows.every(uuid => typeof uuid === "string") && new Set(rows).size === rows.length ? rows : null;
}

function stableObjectKey(label, sceneId) {
  if (typeof label !== "string" || !label.trim() || label.length > 240) return null;
  const slug = label.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `object:${sceneId || "world"}:${slug}` : null;
}

function validHeatImagePath(path) {
  return typeof path === "string" && path.length <= 1000 && !path.startsWith("/")
    && !/[\\\u0000-\u001f]/.test(path) && !/(?:^|\/)\.\.(?:\/|$)/.test(path)
    && !/^[a-z][a-z0-9+.-]*:/i.test(path);
}

async function pickHeatMirageImage() {
  const Picker = foundry.applications.apps.FilePicker.implementation;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const picker = new Picker({type: "image", current: "data/", callback: path => finish(path)});
    const close = picker.close.bind(picker);
    picker.close = async (...args) => { finish(null); return close(...args); };
    void picker.browse();
  });
}

async function ensureHeatMirageTile(receipt, state) {
  const record = state?.record;
  if (record?.spellId !== "heat-mirage" || record.status !== "active") return {ok: true};
  const scene = game.scenes?.get(record.anchor.sceneId);
  if (!scene || !validHeatImagePath(record.imagePath)) return refuse("illusion-scene-or-image-missing");
  const existing = scene.tiles?.contents?.find(tile => tile.flags?.[NS]?.heatMirageTicket === receipt.id);
  if (existing) return {ok: true, tileId: existing.id};
  const gridSize = Number(scene.grid?.size), gridDistance = Number(scene.grid?.distance);
  if (!(gridSize > 0) || !(gridDistance > 0)) return refuse("illusion-scene-grid-missing");
  const side = Math.round((10 / gridDistance) * gridSize);
  if (!(side > 0)) return refuse("illusion-anchor-invalid");
  try {
    const [tile] = await scene.createEmbeddedDocuments("Tile", [{name: "Heat Mirage",
      texture: {src: record.imagePath}, x: Math.round(record.anchor.x - side / 2),
      y: Math.round(record.anchor.y - side / 2), width: side, height: side,
      flags: {[NS]: {heatMirageTicket: receipt.id, visualOnly: true}}}]);
    return tile ? {ok: true, tileId: tile.id} : refuse("illusion-tile-create-uncertain");
  } catch { return refuse("illusion-tile-create-failed"); }
}

async function removeHeatMirageTile(record, ticket) {
  const scene = game.scenes?.get(record?.anchor?.sceneId);
  const ids = (scene?.tiles?.contents ?? []).filter(tile => tile.flags?.[NS]?.heatMirageTicket === ticket).map(tile => tile.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Tile", ids);
}

async function proposedDeclaration(identifier, raw) {
  if (identifier === "arcane-seal") {
    const authorizedUuids = selectedActorUuids(raw, "authorized");
    return authorizedUuids && {objectKind: raw.objectKind, closed: true, mundane: true, authorizedUuids};
  }
  if (identifier === "rime-arrest") return {
    mechanismKind: raw.mechanismKind, exposed: true, mundane: true, moving: true,
    affectedLengthFt: raw.affectedLengthFt, operatingConsequence: raw.operatingConsequence
  };
  if (identifier === "spellwrights-mark") {
    const verifierUuids = selectedActorUuids(raw, "verifier");
    const originalDigest = await sha256ThematicText(raw.originalText);
    return verifierUuids && originalDigest && {targetKind: raw.targetKind, originalDigest, verifierUuids};
  }
  if (identifier === "seedwake") return {plotLabel: raw.objectLabel, radiusFt: raw.radiusFt,
    seasonDaysRemaining: raw.seasonDaysRemaining, viableSeeds: true, conditionsSupported: true};
  if (identifier === "heat-mirage") return {sceneId: canvas.scene?.id, x: raw.x, y: raw.y,
    imageDescription: raw.imageDescription};
  if (identifier === "icevein-passage") return {routeKey: raw.routeKey, connectedNonmagicalIce: true,
    courseClear: true, lengthFt: raw.lengthFt, widthFt: raw.widthFt};
  return null;
}

/** Optional SHA-256 helper for a caller that has the page's actual text. */
export async function sha256ThematicText(text) {
  if (typeof text !== "string" || !globalThis.crypto?.subtle || typeof globalThis.TextEncoder !== "function") return null;
  const bytes = new globalThis.TextEncoder().encode(text.normalize("NFC"));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Player-facing preparation; the GM reviews every object fact before payment. */
export async function prepareThematicObject({actor, spell, source, targets = []} = {}) {
  const identifier = spell?.system?.identifier;
  if (!SUPPORTED_CASTS.has(identifier)) return THEMATIC_OBJECT_SPELLS.includes(identifier) ? refuse("adapter-not-implemented") : null;
  const fields = choiceFields(identifier);
  const choice = await utilityDialog({title: spell.name, fields,
    note: "Declare the object or plot. The active GM must confirm its identity, eligibility, reach and any required cast time before payment."});
  if (!choice) return refuse("cancelled");
  if (identifier === "heat-mirage") {
    const sceneId = refOf(source)?.sceneId ?? globalThis.canvas?.scene?.id;
    if (!sceneId || globalThis.canvas?.scene?.id !== sceneId) return refuse("source-scene");
    const {pickPoint} = await import("../canvas/place.mjs");
    const point = await pickPoint({hint: "Choose the fixed centre of Heat Mirage's 10-foot cube", sceneId});
    if (!point || globalThis.canvas?.scene?.id !== sceneId) return refuse("cancelled");
    choice.x = point.x;
    choice.y = point.y;
  }
  const declaration = await proposedDeclaration(identifier, choice);
  if (!declaration) return refuse("invalid-declaration");
  const objectId = stableObjectKey(identifier === "seedwake" ? declaration.plotLabel : choice.objectLabel, refOf(source)?.sceneId);
  if (!objectId) return refuse("invalid-object-label");
  return request({phase: "prepare", actorUuid: actor.uuid, spellUuid: spell.uuid,
    source: refOf(source), targets: targets.map(refOf), objectId,
    objectLabel: identifier === "seedwake" ? declaration.plotLabel : choice.objectLabel,
    declaration});
}

export async function claimThematicObject(ticket, cast) {
  return request({phase: "claim", ticket, cast});
}

export async function finishThematicObject(ticket, messageId) {
  return request({phase: "finish", ticket, messageId});
}

/** Explicit GM operation; never accepts a player-proposed outcome as authority. */
export async function requestThematicObjectOperation({ticket, operation, data = {}, operationId = foundry.utils.randomID()} = {}) {
  if (game.user?.isGM && gmHere()) return applyThematicObjectOperation({ticket, operation, data, operationId});
  const gm = game.users?.activeGM;
  if (!gm?.query) return refuse("no-active-gm");
  try { return await gm.query(THEMATIC_OBJECT_OPERATION_QUERY, {ticket, operation, data, operationId}, {timeout: 300000}); }
  catch { return refuse("unanswered"); }
}

export async function requestThematicObjectAccess({ticket, actorUuid} = {}) {
  if (gmHere()) return thematicObjectAccessQueryHandler({ticket, actorUuid}, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm?.query) return refuse("no-active-gm");
  try { return await gm.query(THEMATIC_OBJECT_ACCESS_QUERY, {ticket, actorUuid}, {timeout: 300000}); }
  catch { return refuse("unanswered"); }
}

/** Sustain integration: inspect only the active GM's private object receipts. */
export function activeHeatMirageForCast(actorUuid, castId) {
  if (!actorUuid || !castId) return null;
  for (const message of messages()) {
    const state = stateOf(message), record = state?.record;
    if (state?.status === "complete" && state.identifier === "heat-mirage"
        && record?.spellId === "heat-mirage" && record.actorUuid === actorUuid && record.castId === castId
        && record.status === "active") return {ticket: message.id, record};
  }
  return null;
}

/** Called by the active-GM Sustain reconciler when this cast loses Sustain. */
export async function endHeatMirageForCast(actorUuid, castId) {
  if (!gmHere()) return refuse("authority");
  const active = activeHeatMirageForCast(actorUuid, castId);
  if (!active) return {ok: true, ended: false};
  const result = await applyThematicObjectOperation({ticket: active.ticket, operation: "end"});
  return result.ok ? {...result, ended: true} : result;
}

/** Reconcile private illusion records with the normal, paid Sustain ledger. */
export async function reconcileHeatMirages() {
  if (!gmHere()) return;
  for (const message of messages()) {
    const state = stateOf(message), record = state?.record;
    if (state?.status !== "complete" || record?.spellId !== "heat-mirage") continue;
    const caster = resolve(record.actorUuid);
    const held = caster?.getFlag?.(NS, "sustaining") ?? [];
    if (record.status !== "active") {
      const kept = held.filter(entry => entry.identifier !== "heat-mirage" || entry.cast !== record.castId);
      if (kept.length !== held.length) await caster.setFlag(NS, "sustaining", kept);
      await removeHeatMirageTile(record, message.id);
      continue;
    }
    const tile = await ensureHeatMirageTile(message, state);
    if (!tile.ok) console.warn(`azeroth-rpg | Heat Mirage presentation could not be reconciled: ${tile.reason}`);
    if (!held.some(entry => entry.identifier === "heat-mirage" && entry.cast === record.castId)) {
      await endHeatMirageForCast(record.actorUuid, record.castId);
    }
  }
}

/** Active-GM handler registered by module/queries.mjs. */
export async function thematicObjectQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id || !data || typeof data !== "object" || Array.isArray(data)) return refuse("authority");
  if (data.phase === "prepare") {
    const key = `prepare:${String(data.actorUuid)}:${String(data.objectId)}`;
    return serialized(key, () => prepareOnGm(data, user));
  }
  if (data.phase === "claim") return serialized(data.ticket, () => claimOnGm(data, user));
  if (data.phase === "finish") return serialized(data.ticket, () => finishOnGm(data, user));
  return refuse("phase");
}

async function prepareOnGm(data, user) {
  const keys = ["phase", "actorUuid", "spellUuid", "source", "targets", "objectId", "objectLabel", "declaration"];
  if (Object.keys(data).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(data, key))
      || !Array.isArray(data.targets) || !data.declaration || typeof data.declaration !== "object") return refuse("shape");
  const actor = resolve(data.actorUuid), spell = resolve(data.spellUuid);
  if (actor?.documentName !== "Actor" || actor.isToken || game.actors?.get(actor.id) !== actor
      || actor.uuid !== data.actorUuid || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  const identifier = spell?.system?.identifier;
  if (!SUPPORTED_CASTS.has(identifier) || spell.type !== "spell" || spell.parent?.uuid !== actor.uuid) return refuse("spell");
  const source = refOf(data.source);
  if (data.source && (!source || (source.tokenId && tokenAt(source)?.actor?.uuid !== actor.uuid))) return refuse("source");
  const targetRefs = data.targets.map(refOf);
  if (targetRefs.some((ref, index) => !ref || !same(ref, data.targets[index]))) return refuse("targets");
  if (typeof data.objectId !== "string" || !data.objectId.trim() || data.objectId.length > 240
      || typeof data.objectLabel !== "string" || !data.objectLabel.trim() || data.objectLabel.length > 240) return refuse("object");
  if (messages().some(message => {
    const pending = stateOf(message);
    return pending?.actorUuid === actor.uuid && pending?.identifier === identifier
      && pending?.objectId === data.objectId && ["prepared", "claimed", "recording"].includes(pending?.status)
      && pending.wallExpires > Date.now();
  })) return refuse("object-cast-already-reserved");
  const actorRefs = identifier === "arcane-seal" ? data.declaration.authorizedUuids
    : identifier === "spellwrights-mark" ? data.declaration.verifierUuids : [];
  if (!Array.isArray(actorRefs) || actorRefs.some(uuid => {
    const candidate = resolve(uuid);
    return candidate?.documentName !== "Actor" || candidate.isToken || game.actors?.get(candidate.id) !== candidate;
  })) return refuse("actor-uuid");

  const note = `${spell.name}: ${data.objectLabel} (record key ${data.objectId}); confirm this association, the actual target, eligibility, range and limits.`;
  const fields = [
    {name: "eligible", type: "checkbox", label: "I confirm the declared target and spell limits are valid"},
    {name: "reach", type: "checkbox", label: "I confirm the caster can reach the recorded object or plot"},
    ...(identifier === "arcane-seal" ? [
      {name: "closed", type: "checkbox", label: "The door, lid or shutter is closed and mundane"}
    ] : []),
    ...(identifier === "rime-arrest" ? [
      {name: "joint", type: "checkbox", label: "This is an exposed moving joint of a mundane mechanism"}
    ] : []),
    ...(["spellwrights-mark", "seedwake"].includes(identifier) ? [
      {name: "castTimeElapsed", type: "checkbox", label: "The one-minute casting time has elapsed before payment"}
    ] : []),
    ...(identifier === "seedwake" ? [
      {name: "radiusConfirmed", type: "checkbox", label: "The plot radius is 20 feet or less"},
      {name: "plotReady", type: "checkbox", label: "Viable seed, soil, water, climate and nutrients support the ordinary crop"},
      {name: "seasonDaysRemaining", type: "number", min: 0, max: 3650,
        value: data.declaration.seasonDaysRemaining, label: "Days until the next natural season ends (GM world clock estimate)"},
      {name: "seasonVerified", type: "checkbox", label: "I confirm this is the next natural season end"}
    ] : []),
    ...(identifier === "heat-mirage" ? [
      {name: "anchorConfirmed", type: "checkbox", label: "I confirm this fixed anchor is within the caster’s range and image stays within one 10-foot cube"}
    ] : []),
    ...(identifier === "icevein-passage" ? [
      {name: "iceCourseConfirmed", type: "checkbox", label: "I confirm the course follows connected nonmagical ice and avoids occupied spaces, rock, construction and enchanted ice"}
    ] : [])
  ];
  const review = await utilityDialog({title: `GM review: ${spell.name}`, note, fields});
  if (!review?.eligible || !review.reach) return refuse("gm-declined");
  let declaration = structuredClone(data.declaration);
  if (identifier === "arcane-seal") declaration = {...declaration, closed: review.closed === true, mundane: review.closed === true};
  if (identifier === "rime-arrest") declaration = {...declaration, exposed: review.joint === true, mundane: review.joint === true, moving: review.joint === true};
  if (["spellwrights-mark", "seedwake"].includes(identifier) && review.castTimeElapsed !== true) return refuse("cast-time-not-confirmed");
  if (identifier === "seedwake") declaration = {plotKey: data.objectId, radiusFt: declaration.radiusFt,
    viableSeeds: review.plotReady === true,
    conditionsSupported: review.plotReady === true && review.radiusConfirmed === true,
    naturalSeasonEndsAt: review.seasonVerified
      ? game.time.worldTime + review.seasonDaysRemaining * 24 * 60 * 60 : null};
  if (identifier === "heat-mirage" && review.anchorConfirmed !== true) return refuse("anchor-not-confirmed");
  if (identifier === "heat-mirage") {
    declaration.imagePath = await pickHeatMirageImage();
    if (!validHeatImagePath(declaration.imagePath)) return refuse("local-image-required");
  }
  if (identifier === "icevein-passage") {
    if (review.iceCourseConfirmed !== true) return refuse("route-not-confirmed");
    declaration = {...declaration, connectedNonmagicalIce: true, courseClear: true};
  }

  const ticket = foundry.utils.randomID();
  const castProbe = `preflight-${ticket}`;
  const checked = createThematicObjectRecord({spellId: identifier, objectId: data.objectId,
    actorUuid: actor.uuid, castId: castProbe, operationId: `preflight-${ticket}`,
    now: game.time.worldTime, gmApproval: game.user.id, declaration,
    activeRecords: messages().map(message => stateOf(message)?.record).filter(Boolean)});
  if (!checked.ok) return checked;

  const state = {version: 1, status: "prepared", userId: user.id, gmApproval: game.user.id,
    preparedAt: game.time.worldTime, wallExpires: Date.now() + 600000, ticket,
    identifier, actorUuid: actor.uuid, spellUuid: spell.uuid, source,
    targets: targetRefs, objectId: data.objectId, objectLabel: data.objectLabel, declaration,
    operationId: foundry.utils.randomID(), castTimeElapsed: review.castTimeElapsed === true};
  const receipt = await ChatMessage.create({whisper: privateWhisper(), blind: true,
    content: `<p>${foundry.utils.escapeHTML(spell.name)}: GM-approved object-state cast prepared.</p>`,
    flags: {[NS]: {[RECEIPT]: state}}});
  return receipt && stateOf(receipt)?.ticket === ticket ? {ok: true, ticket: receipt.id} : refuse("receipt-uncertain");
}

async function claimOnGm(data, user) {
  if (Object.keys(data).some(key => !["phase", "ticket", "cast"].includes(key))
      || !data.ticket || typeof data.cast !== "string" || !data.cast.trim() || data.cast.length > 240) return refuse("shape");
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "prepared" || state.userId !== user.id || Date.now() > state.wallExpires) return refuse("ticket");
  if (messages().some(message => {
    const other = stateOf(message);
    return other?.ticket !== state.ticket && other?.claimCast === data.cast;
  })) return refuse("cast-replayed");
  const actor = resolve(state.actorUuid), spell = resolve(state.spellUuid);
  if (!actor || !spell || !actor.testUserPermission(user, "OWNER")
      || spell.parent?.uuid !== actor.uuid || spell.system?.identifier !== state.identifier) return refuse("changed");
  const preflight = createThematicObjectRecord({spellId: state.identifier, objectId: state.objectId,
    actorUuid: state.actorUuid, castId: data.cast, operationId: state.operationId,
    now: game.time.worldTime, gmApproval: state.gmApproval, declaration: state.declaration,
    activeRecords: messages().map(message => stateOf(message)?.record).filter(Boolean)});
  if (!preflight.ok) return preflight;
  await write(receipt, {...state, status: "claimed", claimCast: data.cast, claimedAt: game.time.worldTime});
  return stateOf(receipt)?.claimCast === data.cast ? {ok: true} : refuse("claim-uncertain");
}

async function finishOnGm(data, user) {
  if (Object.keys(data).some(key => !["phase", "ticket", "messageId"].includes(key))
      || !data.ticket || !data.messageId) return refuse("shape");
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || (state.userId !== user.id && !user.isGM)) return refuse("ticket");
  const card = game.messages.get(data.messageId), flags = card?.flags?.[NS];
  if (!card || card.author?.id !== state.userId || flags?.kind !== "spell"
      || flags.thematicObjectTicket !== receipt.id || flags.caster !== state.actorUuid
      || flags.spellUuid !== state.spellUuid || flags.identifier !== state.identifier
      || flags.cast !== state.claimCast || !state.claimCast
      || !same(refOf(flags.source), state.source)
      || !same((flags.targets ?? []).map(refOf), state.targets)) return refuse("card-mismatch");
  if (state.cardId && state.cardId !== card.id) return refuse("already-bound");
  if (["complete", "failed"].includes(state.status)) return {ok: true, complete: state.status === "complete"};
  if (flags.success !== true) {
    await write(receipt, {...state, cardId: card.id, status: "failed"});
    return {ok: true, complete: false};
  }
  const actor = resolve(state.actorUuid), spell = resolve(state.spellUuid);
  if (!actor || !spell || !actor.testUserPermission(user, "OWNER") || spell.parent?.uuid !== actor.uuid) return refuse("owner-or-spell-changed");
  if (!same(refOf(flags.source), state.source) || !same((flags.targets ?? []).map(refOf), state.targets)) return refuse("targets-changed");
  const castWorldTime = flags.thematicObjectCastTime;
  if (!Number.isFinite(castWorldTime) || castWorldTime < state.claimedAt || castWorldTime > game.time.worldTime) return refuse("invalid-card-cast-time");

  let record = state.record;
  if (!record) {
    const made = createThematicObjectRecord({spellId: state.identifier, objectId: state.objectId,
      actorUuid: state.actorUuid, castId: flags.cast, operationId: state.operationId,
      now: castWorldTime, gmApproval: state.gmApproval, declaration: state.declaration,
      activeRecords: messages().map(message => stateOf(message)?.record).filter(Boolean)});
    if (!made.ok) return made;
    record = made.record;
    state.record = record;
    state.cardId = card.id;
    state.status = "recording";
    await write(receipt, state);
    if (!same(stateOf(receipt)?.record, record)) return refuse("state-uncertain");
  }
  if (state.identifier === "heat-mirage") {
    const tile = await ensureHeatMirageTile(receipt, state);
    if (!tile.ok) return tile;
  }
  const safeFlags = {...flags, thematicObjectStateTicket: receipt.id, thematicObjectStateStatus: "recorded"};
  await card.update({[`flags.${NS}`]: safeFlags});
  if (card.flags?.[NS]?.thematicObjectStateTicket !== receipt.id) return refuse("card-update-uncertain");
  state.status = "complete";
  await write(receipt, state);
  if (stateOf(receipt)?.status !== "complete") return refuse("receipt-update-uncertain");
  return {ok: true, complete: true, ticket: receipt.id};
}

/** GM-only durable transition API. Call only from an explicit GM control. */
export async function applyThematicObjectOperation({ticket, operation, data = {}, operationId = foundry.utils.randomID()} = {}) {
  if (!gmHere() || !ticket || typeof operation !== "string") return refuse("authority");
  return serialized(ticket, async () => {
    const receipt = game.messages.get(ticket), state = stateOf(receipt);
    if (!state || state.status !== "complete" || !state.record) return refuse("record");
    const updated = transitionThematicObject(state.record, {operationId, operation,
      at: game.time.worldTime, gmApproval: game.user.id, data});
    if (!updated.ok) return updated;
    const next = {...state, record: updated.record, lastOutcome: updated.outcome};
    await write(receipt, next);
    if (!same(stateOf(receipt)?.record, updated.record)) return refuse("transition-uncertain");
    if (state.identifier === "heat-mirage" && updated.record.status !== "active") {
      const caster = resolve(updated.record.actorUuid);
      const held = caster?.getFlag?.(NS, "sustaining") ?? [];
      const kept = held.filter(entry => entry.identifier !== "heat-mirage" || entry.cast !== updated.record.castId);
      if (kept.length !== held.length) await caster.setFlag(NS, "sustaining", kept);
      await removeHeatMirageTile(updated.record, receipt.id);
    }
    const card = game.messages.get(state.cardId);
    await card?.update({[`flags.${NS}.thematicObjectStateStatus`]: updated.record.status});
    if (operation === "verify" && updated.outcome) {
      const verifier = resolve(data.verifierUuid);
      const caster = resolve(updated.outcome.verifiedCasterUuid);
      const authorship = updated.outcome.casterPlacedMark ? `placed by ${caster?.name ?? "the verified caster"}` : "not verified as placed by the caster";
      const changed = updated.outcome.writingOrSealChanged ? "The writing or seal has changed." : "The writing or seal matches the marked content.";
      await privateNotice([verifier], `Spellwright’s Mark: ${authorship}. ${changed}`,
        {privateCue: SPELLWRIGHTS_MARK_VERIFICATION_CUE});
    }
    if (operation === "discover" && state.identifier === "heat-mirage") {
      const viewer = resolve(data.viewerUuid);
      await privateNotice([viewer], `You have discovered the illusion: ${updated.record.imageDescription}. Other viewers’ knowledge is not revealed.`);
    }
    return {ok: true, status: updated.record.status, outcome: updated.outcome};
  });
}

/** CONFIG.queries handler for the separately registered GM operation endpoint. */
export async function thematicObjectOperationQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.isGM || user.id !== game.user.id || !data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some(key => !["ticket", "operation", "data", "operationId"].includes(key))
      || !data.ticket || typeof data.operation !== "string" || !data.operationId
      || !data.data || typeof data.data !== "object" || Array.isArray(data.data)) return refuse("authority-or-shape");
  return applyThematicObjectOperation(data);
}

/** Return Arcane Seal permission privately; this does not animate or open the object. */
export async function thematicObjectAccessQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id || !data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some(key => !["ticket", "actorUuid"].includes(key))
      || !data.ticket || typeof data.actorUuid !== "string") return refuse("authority-or-shape");
  const receipt = game.messages.get(data.ticket), record = stateOf(receipt)?.record;
  const actor = resolve(data.actorUuid);
  if (record?.spellId !== "arcane-seal" || !actor || actor.documentName !== "Actor" || actor.isToken
      || game.actors?.get(actor.id) !== actor || !actor.testUserPermission(user, "OWNER")) return refuse("actor-or-record");
  const result = arcaneSealAccess(record, actor.uuid, game.time.worldTime);
  await privateNotice([actor], result.allowed
    ? `${actor.name} is authorized by the Arcane Seal. The GM still adjudicates physical opening; no door or scene state was changed.`
    : `${actor.name} is not authorized by the Arcane Seal. Use the ordinary lock Test or dispel; no door or scene state was changed.`);
  return {ok: true, ...result};
}

/** Resolve ticketed successful object cards; retries never cast or spend again. */
export function registerThematicObjectCardHooks() {
  if (!objectHooksRegistered) {
    objectHooksRegistered = true;
    const reconcile = () => {
      void reconcileHeatMirages().catch(error => console.warn("azeroth-rpg | Heat Mirage Sustain reconciliation", error));
    };
    Hooks.on("ready", reconcile);
    Hooks.on("updateActor", reconcile);
    Hooks.on("deleteActor", reconcile);
    Hooks.on("updateChatMessage", reconcile);
    Hooks.on("updateWorldTime", () => {
      if (!gmHere()) return;
      for (const message of messages()) {
        const state = stateOf(message), record = state?.record;
        if (state?.status === "complete" && record?.spellId === "icevein-passage"
            && ["opening", "active"].includes(record.status) && game.time.worldTime >= record.closesAt) {
          void applyThematicObjectOperation({ticket: message.id, operation: "begin-close"});
        }
      }
    });
  }
  Hooks.on("renderChatMessageHTML", (message, html) => {
    playPrivateNoticeCue(message);
    const flags = message.flags?.[NS];
    if (!flags?.thematicObjectTicket) return;
    const container = html.querySelector(".azeroth-card");
    if (!container) return;
    const addButton = (label, onClick) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await onClick(); }
        catch { ui.notifications.warn("Could not record object state. Review the GM-private receipt."); }
        finally { button.disabled = false; }
      });
      container.append(button);
    };
    if (!flags.thematicObjectStateTicket && (game.user?.isGM || message.author?.id === game.user?.id)) {
      addButton("Record object state", async () => {
        const result = await finishThematicObject(flags.thematicObjectTicket, message.id);
        if (!result?.ok) ui.notifications.warn("Could not record this cast; ask the GM to review it.");
      });
    }
    if (!game.user?.isGM || !gmHere() || !flags.thematicObjectStateTicket) return;
    const record = stateOf(game.messages.get(flags.thematicObjectTicket))?.record;
    const buttons = {
      "arcane-seal": ["break", "dispel", "expire", "replace"],
      "rime-arrest": ["break", "thaw", "expire"],
      "spellwrights-mark": ["verify", "dispel", "expire"],
      "seedwake": record?.status === "growing" ? ["complete"] : [],
      "heat-mirage": record?.status === "active" ? ["discover", "end"] : [],
      "icevein-passage": record?.status === "opening" ? ["finish-open"]
        : record?.status === "active" ? ["begin-close"]
          : ["closing", "closing-paused"].includes(record?.status) ? ["finish-close"] : []
    }[flags.identifier] ?? [];
    for (const operation of buttons) addButton(`GM: ${operation}`, async () => {
      let data = {};
      if (operation === "verify") {
        const record = stateOf(game.messages.get(flags.thematicObjectTicket))?.record;
        const allowed = new Set(record?.verifierUuids ?? []);
        const options = [{value: "", label: "Choose verifier"}, ...(game.actors?.contents ?? [])
          .filter(actor => allowed.has(actor.uuid) && (game.user?.isGM || actor.testUserPermission?.(game.user, "OBSERVER")))
          .map(actor => ({value: actor.uuid, label: actor.name}))];
        const answer = await utilityDialog({title: "Verify Spellwright’s Mark", fields: [
          {name: "verifierUuid", label: "Verifier", options},
          {name: "currentText", multiline: true, maxLength: 12000, label: "Current text (kept private; normalized and hashed locally)"},
          {name: "touching", type: "checkbox", required: false, label: "Verifier is touching the marked page or seal"},
          {name: "knowsCasterIdentity", type: "checkbox", required: false, label: "Verifier already knows the caster’s identity"},
          {name: "sameMark", type: "checkbox", required: false, label: "GM confirms this is the original mark, not a copy"}
        ]});
        if (!answer) return;
        const currentDigest = await sha256ThematicText(answer.currentText);
        if (!currentDigest) { ui.notifications.warn("Could not hash the current text in this browser."); return; }
        data = {verifierUuid: answer.verifierUuid, currentDigest, touching: answer.touching === true,
          knowsCasterIdentity: answer.knowsCasterIdentity === true, sameMark: answer.sameMark === true};
      }
      if (operation === "discover") {
        const answer = await utilityDialog({title: "Record Heat Mirage discovery", note:
          "Choose the creature and the rule-supported way it discovered the visual: actual contact, or a successful GM-adjudicated Test. This records private knowledge only; it does not establish truth or reveal other viewers.", fields: [
          {name: "viewerUuid", label: "Viewer who discovered it", options: actorOptions()},
          {name: "method", label: "Discovery basis", options: [
            {value: "contact", label: "Touched the illusion"},
            {value: "test", label: "Passed the GM-adjudicated discovery Test"}
          ]}
        ]});
        if (!answer?.viewerUuid || !["contact", "test"].includes(answer.method)) return;
        const confirmed = await utilityDialog({title: "Confirm Heat Mirage discovery", fields: [
          {name: "contactConfirmed", type: "checkbox", label: "The selected creature made contact with the illusion"},
          {name: "testPassed", type: "checkbox", label: "The GM has adjudicated the selected creature’s relevant discovery Test as successful"}
        ]});
        if (!confirmed) return;
        data = {viewerUuid: answer.viewerUuid, method: answer.method,
          contactConfirmed: answer.method === "contact" && confirmed.contactConfirmed === true,
          testPassed: answer.method === "test" && confirmed.testPassed === true};
      }
      if (["finish-open", "finish-close"].includes(operation)) {
        const opening = operation === "finish-open";
        const answer = await utilityDialog({title: opening ? "Confirm Icevein Passage opening" : "Confirm Icevein Passage closure", note: opening
          ? "After the one-minute opening period, edit the scene terrain/map to represent the passage. Confirm only after checking the recorded route against the actual scene. This control records your edit; it does not change map geometry."
          : "After the eight-hour duration and one-minute closing period, confirm no creatures remain, then edit the scene terrain/map to close the passage. This control records your edit; it does not change map geometry.", fields: [
          ...(!opening ? [{name: "occupantsClear", type: "checkbox", label: "I confirm the passage is clear of all creatures before closure"}] : []),
          {name: "mapChanged", type: "checkbox", label: opening ? "I edited the scene terrain/map to show this passage" : "I safely edited the scene terrain/map to close this passage"}
        ]});
        if (!answer) return;
        data = opening ? {mapChanged: answer.mapChanged === true}
          : {occupantsClear: answer.occupantsClear === true, mapChanged: answer.mapChanged === true};
      }
      const result = await requestThematicObjectOperation({ticket: flags.thematicObjectTicket, operation, data});
      if (!result?.ok) ui.notifications.warn(`Object-state operation refused: ${result.reason}`);
      else if (operation === "discover") ui.notifications.info("Heat Mirage discovery recorded privately for the selected creature’s owners.");
      else if (operation !== "verify") ui.notifications.info(`Recorded ${operation} for ${flags.identifier}. A GM must apply or confirm any physical scene change separately.`);
    });
    if (flags.identifier === "arcane-seal") addButton("GM: check authorized Actor", async () => {
      const answer = await utilityDialog({title: "Arcane Seal access check", fields: [
        {name: "actorUuid", label: "Actor", options: actorOptions()}
      ]});
      if (!answer?.actorUuid) return;
      const result = await requestThematicObjectAccess({ticket: flags.thematicObjectTicket, actorUuid: answer.actorUuid});
      if (!result?.ok) ui.notifications.warn(`Access check refused: ${result.reason}`);
    });
  });
}
