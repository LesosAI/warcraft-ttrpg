/** Consent, durable cast receipts and read-only burden projections for Pilgrims' Burden.
 * Physical items never move; the public card carries only the safe derived pair links.
 */
import { feetApart } from "../canvas/footprints.mjs";
import { burdenLoadState, redistributePilgrimsBurden } from "../rules/pilgrims-burden.mjs";
import { ledger as bagLedger } from "../rules/slots.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";
import { createPrivateSpellMessage, privateSpellMessage, privateSpellMessages,
  withPrivateSpellMessage, loadAuthorizedPrivateSpellMessages } from "./private-spell-records.mjs";

export const PILGRIMS_BURDEN_QUERY = "azeroth-rpg.pilgrimsBurden";
export const PILGRIMS_BURDEN_CONSENT = "azeroth-rpg.pilgrimsBurdenConsent";
export const PILGRIMS_BURDEN_REFRESH = "azeroth-rpg.pilgrimsBurdenRefresh";
export const PILGRIMS_BURDEN_RECEIPT = "pilgrimsBurdenReceipt";
export const PILGRIMS_BURDEN_LINKS = "pilgrimsBurdenLinks";
const NS = "azeroth-rpg";
const IDENTIFIER = "pilgrims-burden";
const HOUR = 3600;
const pendingLocks = new Map();
let hooksRegistered = false;
const knownParticipantUuids = new Set();
let refreshQueued = false;
const refuse = reason => ({ok: false, reason});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const stateOf = message => message?.flags?.[NS]?.[PILGRIMS_BURDEN_RECEIPT];
const tokenRef = token => {
  const doc = token?.document ?? token;
  return doc ? {sceneId: doc.parent?.id ?? doc.scene?.id ?? doc.sceneId ?? null, tokenId: doc.id ?? doc.tokenId,
    tokenUuid: doc.uuid ?? doc.tokenUuid ?? null, actorId: token.actor?.id ?? doc.actor?.id ?? doc.actorId ?? null} : null;
};
const tokenAt = ref => ref?.sceneId && ref?.tokenId ? game.scenes?.get(ref.sceneId)?.tokens?.get(ref.tokenId) ?? null : null;
const canonicalTokenRef = ref => tokenRef(ref?.tokenUuid ? resolve(ref.tokenUuid) : tokenAt(ref));
const messages = () => privateSpellMessages();
const privateWhisper = () => [...(game.users?.contents ?? [])].filter(user => user.isGM).map(user => user.id);
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const write = (message, state) => message.update({[`flags.${NS}.${PILGRIMS_BURDEN_RECEIPT}`]: foundry.data.operators.ForcedReplacement.create(state)});

async function serialized(key, work) {
  const before = pendingLocks.get(key) ?? Promise.resolve();
  const current = before.catch(() => {}).then(work);
  pendingLocks.set(key, current);
  try { return await current; }
  finally { if (pendingLocks.get(key) === current) pendingLocks.delete(key); }
}

async function sendQuery(payload) {
  if (gmHere()) return pilgrimsBurdenQueryHandler(payload, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm?.query) return refuse("no-active-gm");
  try { return await gm.query(PILGRIMS_BURDEN_QUERY, payload, {timeout: 300000}); }
  catch { return refuse("uncertain"); }
}

function sceneTokens(sceneId, user = game.user) {
  const scene = game.scenes?.get(sceneId);
  return [...(scene?.tokens?.contents ?? [])].filter(token => token.actor
    && (user?.isGM || token.actor.testUserPermission?.(user, "OBSERVER")));
}

function tokenOptions(sceneId) {
  return [{value: "", label: "— Choose a character —"}, ...sceneTokens(sceneId).map(token => ({
    value: token.uuid, label: `${token.actor.name}${token.name && token.name !== token.actor.name ? ` (${token.name})` : ""}`
  }))];
}

function proposalFields(sceneId) {
  const options = tokenOptions(sceneId);
  const fields = [];
  for (let i = 1; i <= 3; i++) fields.push(
    {name: `source${i}`, label: `Pair ${i}: whose counted load is shared`, options, required: false},
    {name: `target${i}`, label: `Pair ${i}: who bears the shared load`, options, required: false},
    {name: `slots${i}`, label: `Pair ${i}: occupied bag slots`, options: [
      {value: "", label: "— Choose —"},
      {value: "1", label: "1 slot"}, {value: "2", label: "2 slots"}
    ], required: false}
  );
  return fields;
}

function selectedPairs(answer) {
  const pairs = [];
  for (let i = 1; i <= 3; i++) {
    const sourceTokenUuid = answer?.[`source${i}`] || "";
    const targetTokenUuid = answer?.[`target${i}`] || "";
    const slotText = answer?.[`slots${i}`] || "";
    if (!sourceTokenUuid && !targetTokenUuid && !slotText) continue;
    if (!sourceTokenUuid || !targetTokenUuid || !["1", "2"].includes(String(slotText))) return null;
    pairs.push({sourceTokenUuid, targetTokenUuid, slots: Number(slotText)});
  }
  return pairs.length ? pairs : null;
}

/** Player-facing group picker; all decisions are freshly rechecked by the GM. */
export async function preparePilgrimsBurden({actor, spell, source} = {}) {
  if (spell?.system?.identifier !== IDENTIFIER) return null;
  const sourceRef = tokenRef(source);
  if (!sourceRef?.sceneId || !sourceRef?.tokenId) return refuse("source-token");
  const answer = await utilityDialog({title: spell.name, note: "Choose up to three disjoint pairs. Each character can join one pair; one or two occupied bag slots are shared by the partner for eight hours while within 30 feet.", fields: proposalFields(sourceRef.sceneId)});
  if (!answer) return refuse("cancelled");
  const pairs = selectedPairs(answer);
  if (!pairs) return refuse("invalid-pairs");
  return sendQuery({phase: "prepare", actorUuid: actor.uuid, spellUuid: spell.uuid, source: sourceRef, pairs});
}

export async function claimPilgrimsBurden(ticket, cast) {
  return sendQuery({phase: "claim", ticket, cast});
}

export async function finishPilgrimsBurden(ticket, messageId) {
  return sendQuery({phase: "finish", ticket, messageId});
}

export async function endPilgrimsBurden(ticket) {
  return sendQuery({phase: "end", ticket});
}

/** Consenting owner's query. This returns only a yes/no answer and writes nothing. */
export async function pilgrimsBurdenConsentHandler(data = {}, {user} = {}) {
  if (!game.user?.isGM || game.user.id !== game.users?.activeGM?.id
      || !user?.isGM || user.id !== game.users.activeGM.id || !data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some(key => !["castKey", "participantUuid", "partnerUuid", "slots", "role"].includes(key))
      || !data.castKey || !data.participantUuid || !data.partnerUuid || ![1, 2].includes(data.slots)
      || !["source", "recipient"].includes(data.role)) return false;
  const participant = resolve(data.participantUuid), partner = resolve(data.partnerUuid);
  if (participant?.documentName !== "Actor" || partner?.documentName !== "Actor"
      || !participant.testUserPermission(game.user, "OWNER")) return false;
  const {confirmHere} = await import("./blow-doors.mjs");
  const answer = await confirmHere(participant, {title: "Pilgrims’ Burden: consent",
    text: data.role === "source"
      ? `${escape(partner.name)} asks to share away the counted load of ${data.slots} occupied bag slot${data.slots === 1 ? "" : "s"} from you. The items stay with you; sharing suspends beyond 30 feet and resumes on return for the remaining duration. Do you consent?`
      : `${escape(partner.name)} asks you to bear the counted load of ${data.slots} occupied bag slot${data.slots === 1 ? "" : "s"} from their carried gear. The items stay with them; sharing suspends beyond 30 feet and resumes on return for the remaining duration. Do you consent?`});
  return answer === true && participant.testUserPermission(game.user, "OWNER") && resolve(data.partnerUuid) === partner;
}

async function askConsent(participant, partner, slots, role, castKey, user) {
  const {answererOf, ASK_MS} = await import("./blow-doors.mjs");
  const owner = answererOf(participant);
  if (!owner) return refuse("participant-unavailable");
  const payload = {castKey, participantUuid: participant.uuid, partnerUuid: partner.uuid, slots, role};
  let answer = false;
  try { answer = owner.id === game.user.id
    ? await pilgrimsBurdenConsentHandler(payload, {user: game.user})
    : await owner.query(PILGRIMS_BURDEN_CONSENT, payload, {timeout: ASK_MS}); }
  catch { return refuse("consent-uncertain"); }
  return answer === true && participant.testUserPermission(owner, "OWNER")
    ? {ok: true, consentUserId: owner.id} : refuse("consent-declined");
}

function participantSet(pairs) {
  const rows = new Map();
  for (const pair of pairs) {
    for (const [tokenUuid, role] of [[pair.sourceTokenUuid, "source"], [pair.targetTokenUuid, "recipient"]]) {
      const token = resolve(tokenUuid), actor = token?.actor;
      if (token?.documentName !== "Token" || actor?.documentName !== "Actor") return null;
      if (rows.has(actor.uuid)) return null;
      rows.set(actor.uuid, {actor, token, role, partnerUuid: role === "source" ? resolve(pair.targetTokenUuid)?.actor?.uuid : resolve(pair.sourceTokenUuid)?.actor?.uuid});
    }
  }
  return rows.size >= 2 && rows.size <= 6 ? rows : null;
}

function activeLinks() {
  return messages().flatMap(message => {
    const state = stateOf(message);
    return state?.status === "complete" && Array.isArray(state.links) ? state.links : [];
  });
}

function occupiedParticipants(now) {
  const set = new Set(activeLinks().filter(link => link.expiresAt > now)
    .flatMap(link => [link.sourceUuid, link.targetUuid]));
  for (const message of messages()) {
    const state = stateOf(message);
    if ((state?.status === "prepared" && state.wallExpires > Date.now()) || ["claimed", "recording"].includes(state?.status))
      for (const uuid of state.participantUuids ?? []) set.add(uuid);
  }
  return set;
}

function touchValid(sourceToken, pairs) {
  if (!sourceToken) return false;
  for (const pair of pairs) for (const uuid of [pair.sourceTokenUuid, pair.targetTokenUuid]) {
    const token = resolve(uuid);
    if (!token || token.parent?.id !== sourceToken.parent?.id) return false;
    const distance = feetApart(sourceToken, token);
    if (!Number.isFinite(distance) || distance < 0 || distance > 5) return false;
  }
  return true;
}

function validatePairs(sourceToken, pairs) {
  if (!Array.isArray(pairs) || pairs.length < 1 || pairs.length > 3) return refuse("pair-count");
  if (pairs.some(row => !row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).some(key => !["sourceTokenUuid", "targetTokenUuid", "slots"].includes(key))
      || !["sourceTokenUuid", "targetTokenUuid", "slots"].every(key => Object.hasOwn(row, key)))) return refuse("pair-shape");
  const participants = participantSet(pairs);
  if (!participants) return refuse("participant-count-or-overlap");
  const source = sourceToken?.actor;
  if (!source || !touchValid(sourceToken, pairs)) return refuse("touch-range-or-scene");
  const normalized = [];
  for (const row of pairs) {
    const a = resolve(row.sourceTokenUuid), b = resolve(row.targetTokenUuid);
    if (!a || !b || a.actor.uuid === b.actor.uuid || ![1, 2].includes(row.slots)) return refuse("invalid-pair");
    normalized.push({sourceUuid: a.actor.uuid, targetUuid: b.actor.uuid, sourceToken: tokenRef(a), targetToken: tokenRef(b), slots: row.slots});
  }
  return {ok: true, participantUuids: [...participants.keys()], pairs: normalized, participants};
}

function duplicateReservation(participantUuids, now, exceptTicket = null) {
  const occupied = occupiedParticipants(now);
  if (exceptTicket) {
    for (const message of messages()) {
      const state = stateOf(message);
      if (state?.ticket === exceptTicket && ["prepared", "claimed", "recording"].includes(state.status))
        for (const uuid of state.participantUuids ?? []) occupied.delete(uuid);
    }
  }
  return participantUuids.some(uuid => occupied.has(uuid));
}

/** Active-GM handler registered in CONFIG.queries. */
export async function pilgrimsBurdenQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id || !data || typeof data !== "object" || Array.isArray(data)) return refuse("authority");
  await loadAuthorizedPrivateSpellMessages();
  if (data.phase === "prepare") return serialized("prepare", () => prepareOnGm(data, user));
  if (data.phase === "claim") return serialized(`ticket:${data.ticket}`, () => claimOnGm(data, user));
  if (data.phase === "finish") return serialized(`ticket:${data.ticket}`, () => finishOnGm(data, user));
  if (data.phase === "end") return serialized(`ticket:${data.ticket}`, () => endOnGm(data, user));
  return refuse("phase");
}

async function prepareOnGm(data, user) {
  const keys = ["phase", "actorUuid", "spellUuid", "source", "pairs"];
  if (Object.keys(data).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(data, key))
      || !Array.isArray(data.pairs) || !data.source) return refuse("shape");
  const caster = resolve(data.actorUuid), spell = resolve(data.spellUuid), sourceToken = resolve(data.source?.tokenUuid);
  // Accept a token reference from the picker, never a caster-selected world-space coordinate.
  const canonicalSource = sourceToken ? tokenRef(sourceToken) : null;
  if (!caster || caster.documentName !== "Actor" || !caster.testUserPermission(user, "OWNER")
      || spell?.type !== "spell" || spell.system?.identifier !== IDENTIFIER || spell.parent?.uuid !== caster.uuid
      || !canonicalSource || !same(canonicalSource, data.source) || sourceToken.actor?.uuid !== caster.uuid) return refuse("caster-spell-source");
  const checked = validatePairs(sourceToken, data.pairs);
  if (!checked.ok) return checked;
  if (duplicateReservation(checked.participantUuids, game.time.worldTime)) return refuse("participant-already-paired");
  const castKey = foundry.utils.randomID(24);
  const consents = [];
  for (const pair of checked.pairs) {
    for (const [participantUuid, partnerUuid, role] of [
      [pair.sourceUuid, pair.targetUuid, "source"], [pair.targetUuid, pair.sourceUuid, "recipient"]
    ]) {
      const participant = resolve(participantUuid), partner = resolve(partnerUuid);
      const consent = await askConsent(participant, partner, pair.slots, role, castKey, user);
      if (!consent.ok) return consent;
      consents.push({participantUuid, partnerUuid, consentUserId: consent.consentUserId, role});
    }
  }
  // Recheck after asynchronous consent. Never reserve stale positions or changed pairings.
  const fresh = validatePairs(sourceToken, data.pairs);
  if (!fresh.ok || !same(fresh.pairs, checked.pairs) || duplicateReservation(checked.participantUuids, game.time.worldTime)) return refuse("changed");
  const approval = await utilityDialog({title: "GM review: Pilgrims’ Burden", note:
    `${checked.participantUuids.length} consenting participants in ${checked.pairs.length} disjoint pair(s). Confirm the touch-range group and that one minute of casting has elapsed before payment.`, fields: [
      {name: "eligible", type: "checkbox", label: "The selected participants and pairings are valid"},
      {name: "castTimeElapsed", type: "checkbox", label: "One minute of casting has elapsed"}
    ]});
  if (!approval?.eligible || !approval?.castTimeElapsed) return refuse("gm-declined-or-cast-time");
  const state = {version: 1, status: "prepared", ticket: null, userId: user.id, gmApproval: game.user.id,
    castKey, preparedAt: game.time.worldTime, wallExpires: Date.now() + 600000,
    casterUuid: caster.uuid, spellUuid: spell.uuid, source: canonicalSource,
    pairs: checked.pairs, participantUuids: checked.participantUuids, consents,
    operationId: foundry.utils.randomID(24), castTimeElapsed: true};
  const receipt = await createPrivateSpellMessage({whisper: privateWhisper(), blind: true,
    content: `<p>${escape(spell.name)}: group consent and the cast minute were confirmed. No load, item, or resource has changed yet.</p>`,
    flags: {[NS]: {[PILGRIMS_BURDEN_RECEIPT]: state}}});
  if (!receipt) return refuse("receipt-uncertain");
  await write(receipt, {...state, ticket: receipt.id});
  return stateOf(receipt)?.ticket === receipt.id ? {ok: true, ticket: receipt.id, participantUuids: checked.participantUuids} : refuse("receipt-uncertain");
}

async function claimOnGm(data, user) {
  if (Object.keys(data).some(key => !["phase", "ticket", "cast"].includes(key))
      || !data.ticket || typeof data.cast !== "string" || !data.cast.trim() || data.cast.length > 240) return refuse("shape");
  const receipt = privateSpellMessage(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "prepared" || state.userId !== user.id || state.wallExpires <= Date.now()) return refuse("ticket");
  if (messages().some(message => stateOf(message)?.castId === data.cast)) return refuse("cast-replayed");
  const caster = resolve(state.casterUuid), spell = resolve(state.spellUuid), sourceToken = resolve(state.source.tokenUuid);
  if (!caster?.testUserPermission(user, "OWNER") || spell?.parent?.uuid !== caster.uuid
      || spell.system?.identifier !== IDENTIFIER) return refuse("owner-or-spell-changed");
  const current = validatePairs(sourceToken, state.pairs.map(pair => ({sourceTokenUuid: pair.sourceToken.tokenUuid,
    targetTokenUuid: pair.targetToken.tokenUuid, slots: pair.slots})));
  if (!current.ok || !same(current.pairs, state.pairs)
      || duplicateReservation(state.participantUuids, game.time.worldTime, receipt.id)) return refuse("preflight-changed");
  for (const consent of state.consents) {
    const actor = resolve(consent.participantUuid), owner = game.users.get(consent.consentUserId);
    if (!actor || !owner || !actor.testUserPermission(owner, "OWNER")) return refuse("consent-changed");
  }
  await write(receipt, {...state, status: "claimed", claimCast: data.cast, claimedAt: game.time.worldTime});
  return stateOf(receipt)?.claimCast === data.cast ? {ok: true} : refuse("claim-uncertain");
}

async function finishOnGm(data, user) {
  if (Object.keys(data).some(key => !["phase", "ticket", "messageId"].includes(key))
      || !data.ticket || !data.messageId) return refuse("shape");
  const receipt = privateSpellMessage(data.ticket), state = stateOf(receipt), card = privateSpellMessage(data.messageId);
  const flags = card?.flags?.[NS];
  if (!state || !card || (user.id !== state.userId && !user.isGM) || card.author?.id !== state.userId
      || flags?.kind !== "spell" || flags.identifier !== IDENTIFIER || flags.caster !== state.casterUuid
      || flags.spellUuid !== state.spellUuid || flags.cast !== state.claimCast || !state.claimCast
      || flags.pilgrimsBurdenTicket !== receipt.id || !same(canonicalTokenRef(flags.source), state.source)) return refuse("card-mismatch");
  if (state.cardId && state.cardId !== card.id) return refuse("already-bound");
  if (["complete", "failed"].includes(state.status)) return {ok: true, complete: state.status === "complete"};
  if (flags.success !== true) {
    await write(receipt, {...state, cardId: card.id, status: "failed"});
    await card.update({[`flags.${NS}.pilgrimsBurdenTicket`]: receipt.id, [`flags.${NS}.pilgrimsBurdenStatus`]: "failed"});
    return {ok: true, complete: false};
  }
  const castWorldTime = flags.pilgrimsBurdenCastTime;
  if (!Number.isFinite(castWorldTime) || castWorldTime < state.claimedAt || castWorldTime > game.time.worldTime) return refuse("invalid-cast-time");
  const links = state.pairs.map(pair => ({cast: flags.cast, sourceUuid: pair.sourceUuid, targetUuid: pair.targetUuid,
    sourceToken: pair.sourceToken, targetToken: pair.targetToken, slots: pair.slots, createdAt: castWorldTime,
    expiresAt: castWorldTime + 8 * HOUR, rangeState: "active"}));
  const next = {...state, status: "recording", cardId: card.id, castId: flags.cast, castWorldTime, links};
  await write(receipt, next);
  if (!same(stateOf(receipt)?.links, links)) return refuse("receipt-uncertain");
  const publicLinks = links.map(({cast, sourceUuid, targetUuid, sourceToken, targetToken, slots, createdAt, expiresAt, rangeState}) =>
    ({cast, sourceUuid, targetUuid, sourceToken, targetToken, slots, createdAt, expiresAt, rangeState}));
  await card.update({[`flags.${NS}.pilgrimsBurdenTicket`]: receipt.id,
    [`flags.${NS}.${PILGRIMS_BURDEN_LINKS}`]: publicLinks,
    [`flags.${NS}.pilgrimsBurdenStatus`]: "active"});
  if (card.flags?.[NS]?.pilgrimsBurdenTicket !== receipt.id || !same(card.flags?.[NS]?.[PILGRIMS_BURDEN_LINKS], publicLinks)) return refuse("card-projection-uncertain");
  await write(receipt, {...next, status: "complete"});
  if (stateOf(receipt)?.status !== "complete") return refuse("receipt-update-uncertain");
  return {ok: true, complete: true, links: publicLinks};
}

/** GM ends the whole cast without changing any carried item or normal ledger. */
async function endOnGm(data, user) {
  if (Object.keys(data).some(key => !["phase", "ticket"].includes(key)) || !data.ticket
      || !user?.isGM || user.id !== game.user.id) return refuse("permission-or-shape");
  const receipt = privateSpellMessage(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "complete" || !Array.isArray(state.links)) return refuse("not-active");
  const links = state.links.map(link => ({...link, rangeState: "ended"}));
  await write(receipt, {...state, status: "ended", endedAt: game.time.worldTime, endReason: "gm-dispel", links});
  if (stateOf(receipt)?.status !== "ended") return refuse("receipt-uncertain");
  const card = privateSpellMessage(state.cardId);
  await card?.update({[`flags.${NS}.${PILGRIMS_BURDEN_LINKS}`]: [], [`flags.${NS}.pilgrimsBurdenStatus`]: "ended"});
  const ids = [...new Set(links.flatMap(link => [link.sourceUuid, link.targetUuid]))];
  Hooks.callAll(PILGRIMS_BURDEN_REFRESH, ids);
  const actors = ids.map(resolve).filter(Boolean);
  const audience = [...(game.users?.contents ?? [])].filter(candidate => candidate.isGM
    || actors.some(actor => actor.testUserPermission?.(candidate, "OWNER"))).map(candidate => candidate.id);
  if (audience.length) await createPrivateSpellMessage({whisper: audience, blind: true,
    content: "<p>Pilgrims’ Burden was ended by the GM. Each participant now has their ordinary counted load. No item or capacity changed.</p>"});
  return {ok: true, ended: true};
}

/** Read active pair links from public paid-card projections, or an explicit injected set in tests. */
export function activePilgrimsBurdenLinks({links, now = game.time.worldTime} = {}) {
  return allPilgrimsBurdenLinks({links}).filter(link => Number.isFinite(link.expiresAt) && link.expiresAt > now);
}

export function allPilgrimsBurdenLinks({links} = {}) {
  return links ?? messages().flatMap(message => message.flags?.[NS]?.[PILGRIMS_BURDEN_LINKS] ?? []);
}

/** Recompute derived loads from ordinary bag totals and live token distances. */
export function derivePilgrimsBurdenLoads({participants = {}, links, now = game.time.worldTime} = {}) {
  const allLinks = links ?? messages().flatMap(message => message.flags?.[NS]?.[PILGRIMS_BURDEN_LINKS] ?? []);
  const enriched = Object.fromEntries(Object.entries(participants).map(([uuid, p]) => [uuid, {...p, sceneId: null}]));
  const distances = {};
  for (const link of allLinks) {
    const sourceToken = tokenAt(link.sourceToken), targetToken = tokenAt(link.targetToken);
    if (enriched[link.sourceUuid]) enriched[link.sourceUuid].sceneId = sourceToken?.parent?.id ?? null;
    if (enriched[link.targetUuid]) enriched[link.targetUuid].sceneId = targetToken?.parent?.id ?? null;
    distances[link.cast] ??= {};
    distances[link.cast][link.sourceUuid] ??= {};
    distances[link.cast][link.sourceUuid][link.targetUuid] = sourceToken && targetToken ? feetApart(sourceToken, targetToken) : null;
  }
  return redistributePilgrimsBurden({participants: enriched, links: allLinks, distances, now});
}

/** CharacterData can pass its ordinary bag ledger and snapshots for all linked actors. */
export function derivePilgrimsBurdenLoadState({actorUuid, ledger, participants, links, now = game.time.worldTime} = {}) {
  if (!actorUuid || !ledger || !participants?.[actorUuid]) return null;
  const derived = derivePilgrimsBurdenLoads({participants, links, now});
  const state = burdenLoadState(ledger, derived.loads[actorUuid]);
  return state ? Object.freeze({...state, sharing: derived.accepted, suspended: derived.suspended, rejected: derived.rejected}) : null;
}

/**
 * Build ordinary slot-ledger snapshots for every actor linked to this character.
 * The caller supplies this actor's freshly computed ordinary ledger; linked
 * actors are recomputed from their items and `system.bagSlots.base`, never their
 * already-adjusted `system.bagSlots.used` value.
 */
export function collectBurdenParticipants({actor, ledger, now = game.time.worldTime} = {}) {
  if (!actor?.uuid || !ledger || !Number.isInteger(ledger.used) || !Number.isInteger(ledger.capacity)) return null;
  const links = activePilgrimsBurdenLinks({now});
  const refs = new Map([[actor.uuid, {actor, isCurrent: true}]]);
  for (const link of links) for (const [uuid, tokenRefForActor] of [
    [link.sourceUuid, link.sourceToken], [link.targetUuid, link.targetToken]
  ]) {
    if (refs.has(uuid)) continue;
    const linkedActor = tokenAt(tokenRefForActor)?.actor ?? resolve(uuid);
    if (linkedActor?.uuid === uuid) refs.set(uuid, {actor: linkedActor, tokenRef: tokenRefForActor, isCurrent: false});
  }
  const participants = {};
  for (const [uuid, entry] of refs) {
    const token = entry.tokenRef ? tokenAt(entry.tokenRef)
      : links.flatMap(link => [link.sourceUuid === uuid ? link.sourceToken : null, link.targetUuid === uuid ? link.targetToken : null]).filter(Boolean).map(tokenAt)[0];
    const base = entry.actor.system?.bagSlots?.base;
    const ordinary = entry.isCurrent ? ledger : Number.isInteger(base) && base >= 0
      ? bagLedger([...(entry.actor.items ?? [])], base) : {used: null, capacity: null};
    participants[uuid] = {load: ordinary.used, capacity: ordinary.capacity, sceneId: token?.parent?.id ?? null};
  }
  return {participants, links};
}

/** Check pair distance after movement and notify both owners when sharing suspends/resumes. */
export async function refreshPilgrimsBurdenRanges() {
  if (!gmHere()) return refuse("authority");
  return serialized("range-refresh", async () => {
    const now = game.time.worldTime;
    const updates = [];
    for (const receipt of messages().filter(message => stateOf(message)?.status === "complete")) {
      const state = stateOf(receipt);
      let changed = false;
      const links = state.links.map(link => {
        const source = tokenAt(link.sourceToken), target = tokenAt(link.targetToken);
        const distance = source && target && source.parent?.id === target.parent?.id ? feetApart(source, target) : null;
        const rangeState = link.expiresAt <= now ? "expired" : Number.isFinite(distance) && distance <= 30 ? "active" : "suspended";
        if (rangeState !== link.rangeState) { changed = true; updates.push({link, previous: link.rangeState, next: rangeState, distance}); }
        return {...link, rangeState};
      });
      if (!changed) continue;
      await write(receipt, {...state, links});
      const card = privateSpellMessage(state.cardId);
      const publicLinks = links.map(({cast, sourceUuid, targetUuid, sourceToken, targetToken, slots, createdAt, expiresAt, rangeState}) =>
        ({cast, sourceUuid, targetUuid, sourceToken, targetToken, slots, createdAt, expiresAt, rangeState}));
      await card?.update({[`flags.${NS}.${PILGRIMS_BURDEN_LINKS}`]: publicLinks,
        [`flags.${NS}.pilgrimsBurdenStatus`]: links.every(link => link.rangeState === "expired") ? "expired" : "active"});
    }
    for (const update of updates) {
      if (!((update.previous === "active" && update.next === "suspended")
        || (update.previous === "suspended" && update.next === "active"))) continue;
      const source = resolve(update.link.sourceUuid), target = resolve(update.link.targetUuid);
      const message = update.next === "suspended"
        ? `Pilgrims’ Burden is suspended for ${source?.name ?? "one partner"} and ${target?.name ?? "the other partner"}; each returns to their ordinary counted load. Their pair remains assigned until the spell ends.`
        : `Pilgrims’ Burden has resumed for ${source?.name ?? "one partner"} and ${target?.name ?? "the other partner"}.`;
      const audience = [...(game.users?.contents ?? [])].filter(user => user.isGM
        || source?.testUserPermission?.(user, "OWNER") || target?.testUserPermission?.(user, "OWNER")).map(user => user.id);
      if (audience.length) await createPrivateSpellMessage({whisper: audience, blind: true, content: `<p>${escape(message)}</p>`, flags: {[NS]: {pilgrimsBurdenNotice: true}}});
    }
    return {ok: true, updates};
  });
}

/** Only signals recalculation; the character model owns derived-data integration. */
export function registerPilgrimsBurdenHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  const collectProjectionUuids = message => {
    const links = [...activePilgrimsBurdenLinks(), ...allPilgrimsBurdenLinks(),
      ...(message?.flags?.[NS]?.[PILGRIMS_BURDEN_LINKS] ?? [])];
    const ids = new Set([...knownParticipantUuids]);
    for (const link of links) {
      if (link?.sourceUuid) ids.add(link.sourceUuid);
      if (link?.targetUuid) ids.add(link.targetUuid);
    }
    knownParticipantUuids.clear();
    for (const id of [...ids].slice(0, 512)) knownParticipantUuids.add(id);
    return [...knownParticipantUuids];
  };
  const queueRefresh = ids => {
    for (const id of ids.slice(0, 512)) knownParticipantUuids.add(id);
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      Hooks.callAll(PILGRIMS_BURDEN_REFRESH, [...knownParticipantUuids].slice(0, 512));
      knownParticipantUuids.clear();
    });
  };
  const projectionChange = message => queueRefresh(collectProjectionUuids(message));
  Hooks.once("ready", async () => {
    if (gmHere()) await loadAuthorizedPrivateSpellMessages();
    const ids = collectProjectionUuids();
    queueRefresh(ids);
    if (gmHere()) await refreshPilgrimsBurdenRanges();
  });
  Hooks.on("createChatMessage", withPrivateSpellMessage(message => projectionChange(message)));
  Hooks.on("updateChatMessage", withPrivateSpellMessage(message => projectionChange(message)));
  Hooks.on("deleteChatMessage", withPrivateSpellMessage(message => projectionChange(message)));
  const actorInventoryChange = document => {
    const actor = document?.documentName === "Actor" ? document : document?.parent;
    if (!actor?.uuid) return;
    const linked = collectProjectionUuids();
    if (linked.includes(actor.uuid)) queueRefresh(linked);
  };
  for (const hook of ["createItem", "updateItem", "deleteItem", "updateActor"]) {
    Hooks.on(hook, document => actorInventoryChange(document));
  }
  const refresh = async (_token, changes = {}) => {
    if (!Object.keys(changes).some(key => ["x", "y", "elevation", "hidden"].includes(key))) return;
    const links = activePilgrimsBurdenLinks();
    const ids = [...new Set(links.flatMap(link => [link.sourceUuid, link.targetUuid]))];
    queueRefresh(ids);
    if (gmHere()) await refreshPilgrimsBurdenRanges();
  };
  Hooks.on("updateToken", refresh);
  Hooks.on("createToken", token => refresh(token, {x: token.x, y: token.y}));
  Hooks.on("deleteToken", token => refresh(token, {x: token.x, y: token.y}));
  Hooks.on("updateWorldTime", () => {
    const ids = collectProjectionUuids();
    queueRefresh(ids);
    if (gmHere()) void refreshPilgrimsBurdenRanges();
  });
  Hooks.on("canvasReady", () => {
    const ids = collectProjectionUuids();
    queueRefresh(ids);
    if (gmHere()) void refreshPilgrimsBurdenRanges();
  });
}

/** Character-data integration subscribes here and recomputes after token range changes. */
export function registerPilgrimsBurdenLoadRefresh(callback) {
  if (typeof callback !== "function") return false;
  Hooks.on(PILGRIMS_BURDEN_REFRESH, callback);
  return true;
}

export function registerPilgrimsBurdenCardHooks() {
  Hooks.on("renderChatMessageHTML", withPrivateSpellMessage((message, html) => {
    const flags = message.flags?.[NS];
    if (!flags?.pilgrimsBurdenTicket) return;
    const container = html.querySelector(".azeroth-card");
    if (!container) return;
    const add = (label, fn) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await fn(); } catch { ui.notifications.warn("Could not update Pilgrims’ Burden state."); }
        finally { button.disabled = false; }
      });
      container.append(button);
    };
    if (! ["active", "expired", "ended", "failed"].includes(flags.pilgrimsBurdenStatus)
        && (game.user?.isGM || message.author?.id === game.user?.id)) {
      add("Record Pilgrims’ Burden", async () => {
        const result = await finishPilgrimsBurden(flags.pilgrimsBurdenTicket, message.id);
        if (!result?.ok) ui.notifications.warn("Could not record this cast; ask the GM to review the private receipt.");
      });
    }
    if (game.user?.isGM && gmHere() && flags.pilgrimsBurdenStatus === "active") add("GM: end Pilgrims’ Burden", async () => {
      const result = await endPilgrimsBurden(flags.pilgrimsBurdenTicket);
      if (!result?.ok) ui.notifications.warn(`Could not end Pilgrims’ Burden: ${result.reason}`);
    });
  }));
}
