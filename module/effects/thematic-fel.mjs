/**
 * Runtime receipts for Summoner's Writ and Fel Surety.
 *
 * The active GM owns every receipt. Writ receipts are private, temporary
 * command permissions; they never change Foundry ownership or the demon's
 * existing bond. Fel Surety claims serialize by receipt before a caller pays
 * an ability cost, so one native ability attempt can reserve the promise.
 */
import {
  createSummonersWrit, mayDelegateDemonCommand,
  revokeSummonersWrit as makeRevokedWrit, createFelSurety,
  suretyPowerCost, resolveFelSurety, SURETY_RANGE_FEET
} from "../rules/thematic-fel.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { worldActorOf, bondOf, boundOf } from "../documents/bound.mjs";
import { createPrivateSpellMessage, privateSpellMessage, privateSpellMessages,
  withPrivateSpellMessage, loadAuthorizedPrivateSpellMessages } from "./private-spell-records.mjs";

export const THEMATIC_FEL_QUERY = "azeroth-rpg.thematicFel";
export const THEMATIC_FEL_CONSENT = "azeroth-rpg.thematicFelConsent";
const NS = "azeroth-rpg";
const jobs = new Map();
const spellDialogs = new Map();
const refuse = reason => ({ok: false, reason});
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const stateOf = message => message?.flags?.[NS]?.thematicFelReceipt;
const write = (message, state) => message.update({[`flags.${NS}.thematicFelReceipt`]: foundry.data.operators.ForcedReplacement.create(state)});
const tokenAt = ref => game.scenes?.get(ref?.sceneId)?.tokens.get(ref?.tokenId) ?? null;
const tokenRef = token => token?.sceneId && token?.tokenId ? refOf(token)
  : token ? {sceneId: token.document?.parent?.id ?? token.parent?.id, tokenId: token.id, actorId: token.actor?.id ?? null} : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const textContent = text => `<p>${foundry.utils.escapeHTML(text)}</p>`;
const spellKind = identifier => identifier === "summoners-writ" || identifier === "fel-surety";

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(payload) {
  if (gmHere()) return thematicFelQueryHandler(payload, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm) return refuse("noGM");
  try { return await gm.query(THEMATIC_FEL_QUERY, payload, {timeout: 300000}); }
  catch { return refuse("unanswered"); }
}

function actorHasWarlock(actor) {
  return Boolean(warlockClassItem(actor));
}

function warlockClassItem(actor) {
  return [...(actor?.items ?? [])].find(item => item.type === "class"
    && String(item.name ?? item.system?.name ?? "").trim().toLowerCase() === "warlock"
    && (actor.system?.classes ?? []).some(track => track.itemId === item.id)) ?? null;
}

function warlockManaPool(actor) {
  const item = warlockClassItem(actor);
  if (!item) return null;
  return (actor.poolSnapshot?.() ?? []).find(pool => pool.itemId === item.id && pool.kind === "power" && pool.name === "mana") ?? null;
}

const poolRef = pool => pool ? {itemId: pool.itemId ?? null, kind: pool.kind, name: pool.name ?? null} : null;

function poolAt(actor, ref) {
  if (!ref) return null;
  return (actor?.poolSnapshot?.() ?? []).find(pool => pool.itemId === (ref.itemId ?? null)
    && pool.kind === ref.kind && (pool.name ?? null) === (ref.name ?? null)) ?? null;
}

function refOf(ref) {
  return ref ? {sceneId: ref.sceneId ?? null, tokenId: ref.tokenId ?? null, actorId: ref.actorId ?? null} : null;
}

function sourceTokenOf(ref, actor) {
  const token = tokenAt(ref);
  if (ref?.tokenId) return token?.actor?.uuid === actor.uuid ? token : null;
  return null;
}

function tokenForActor(actor, preferred = null) {
  const requested = tokenAt(preferred);
  if (requested?.actor?.uuid === actor?.uuid) return requested;
  return [...(game.scenes ?? [])].flatMap(scene => [...scene.tokens])
    .find(token => token.actor?.uuid === actor?.uuid) ?? null;
}

function touchDistance(source, target) {
  if (!source || !target || source.document?.parent?.id !== target.document?.parent?.id) return null;
  const value = feetApart(source, target);
  return Number.isFinite(value) ? value : null;
}

function allReceipts() {
  return privateSpellMessages().flatMap(message => {
    const state = stateOf(message);
    return state ? [{...state, receiptId: message.id}] : [];
  });
}

function liveWritsForCaster(casterUuid, now = game.time.worldTime) {
  return allReceipts().filter(state => state.kind === "writ" && state.writ?.casterUuid === casterUuid
    && state.status === "active" && state.writ.expiresAt > now && state.writ.revokedAt == null)
    .map(state => state.writ);
}

function liveSuretyForDemon(demonUuid, now = game.time.worldTime) {
  return allReceipts().filter(state => state.kind === "surety" && state.surety?.demonUuid === demonUuid
    && state.status === "active" && state.surety.expiresAt > now && state.surety.consumedAt == null)
    .sort((a, b) => b.surety.createdAt - a.surety.createdAt)[0] ?? null;
}

function validateSpell(data, user) {
  const caster = resolve(data.actorUuid), spell = resolve(data.spellUuid);
  if (caster?.documentName !== "Actor" || !caster.testUserPermission(user, "OWNER")) return refuse("owner");
  if (spell?.type !== "spell" || !spellKind(spell.system?.identifier) || (spell.actor && spell.actor.uuid !== caster.uuid)) return refuse("spell");
  if (!actorHasWarlock(caster)) return refuse("class");
  return {ok: true, caster, spell, identifier: spell.system.identifier};
}

async function askDelegateConsent(delegate, caster, spell) {
  const {answererOf, ASK_MS} = await import("./blow-doors.mjs");
  const who = answererOf(delegate);
  if (!who) return null;
  const payload = {delegateUuid: delegate.uuid, casterUuid: caster.uuid, spellUuid: spell.uuid, name: spell.name};
  try {
    const answer = who.id === game.user.id ? await thematicFelConsentHandler(payload, {user: game.user})
      : await who.query(THEMATIC_FEL_CONSENT, payload, {timeout: ASK_MS});
    return answer === true && delegate.testUserPermission(who, "OWNER") ? {actorUuid: delegate.uuid, userId: who.id} : null;
  } catch { return null; }
}

/** Build a prepared GM receipt before the ordinary spell workflow spends Mana. */
export async function prepareThematicFel({actor, spell, source, demon = null, delegate = null,
  demonToken = null, delegateToken = null, targets = []} = {}) {
  const identifier = spell?.system?.identifier;
  if (!spellKind(identifier)) return null;
  let sourceRef = tokenRef(source) ?? refOf(source);
  if (!sourceRef) {
    const {sourceOf} = await import("../applications/roll-dialog.mjs");
    sourceRef = sourceOf(actor);
  }
  const sourceToken = sourceTokenOf(sourceRef, actor);
  if (!sourceToken) return refuse("source");
  const maxRange = identifier === "summoners-writ" ? 5 : SURETY_RANGE_FEET;
  const selectedTargets = new Set((targets ?? []).map(ref => {
    const picked = refOf(ref);
    return picked?.tokenId ? `${picked.sceneId}:${picked.tokenId}` : "";
  }));
  const sceneTokens = [...(sourceToken.parent?.tokens ?? [])];
  const tokenChoices = (candidate, range) => sceneTokens.filter(token => token.actor?.uuid === candidate.uuid
    && Number.isFinite(touchDistance(sourceToken, token)) && touchDistance(sourceToken, token) <= range);
  const bound = boundOf(actor, "demon").map(worldActorOf).filter(candidate => bondOf(candidate)?.temporarilyEnslaved !== true);
  const demons = bound.flatMap(candidate => tokenChoices(candidate, maxRange).map(token => ({actor: candidate, token})));
  if (!demons.length) return refuse("demon");
  let selectedDemon = demon?.documentName === "Actor" ? demon : resolve(demon?.uuid) ?? (typeof demon === "string" ? resolve(demon) : null);
  const demonTokenRef = tokenRef(demonToken) ?? demonToken;
  let selectedDemonToken = tokenAt(demonTokenRef);
  if (!selectedDemon && selectedTargets.size === 1) {
    const targetKey = [...selectedTargets][0];
    const match = demons.find(row => `${row.token.parent.id}:${row.token.id}` === targetKey);
    if (match) { selectedDemon = match.actor; selectedDemonToken = match.token; demonToken = tokenRef(match.token); }
  }
  if (!selectedDemon || !selectedDemonToken || selectedDemonToken.actor?.uuid !== selectedDemon.uuid
    || !demons.some(row => row.actor.uuid === selectedDemon.uuid && row.token.id === selectedDemonToken.id)) {
    const options = demons.map(({actor: candidate, token}) => ({
      value: JSON.stringify({actorUuid: candidate.uuid, token: tokenRef(token)}),
      label: `${candidate.name} — ${token.name}`
    }));
    const picked = await felDialog(spell, [{name: "demon", label: "Bound demon", options}], "Choose a bound demon.");
    if (!picked) return refuse("cancelled");
    try {
      const parsed = JSON.parse(picked.demon);
      selectedDemon = resolve(parsed.actorUuid);
      selectedDemonToken = tokenAt(parsed.token);
      demonToken = parsed.token;
    } catch { return refuse("demon"); }
  }
  let selectedDelegate = delegate?.documentName === "Actor" ? delegate : resolve(delegate?.uuid) ?? (typeof delegate === "string" ? resolve(delegate) : null);
  const delegateTokenRef = tokenRef(delegateToken) ?? delegateToken;
  let selectedDelegateToken = tokenAt(delegateTokenRef);
  if (identifier === "summoners-writ") {
    const delegates = [...(game.actors ?? [])].filter(candidate => candidate.uuid !== actor.uuid
      && candidate.uuid !== selectedDemon.uuid && candidate.testUserPermission(game.user, "OWNER"))
      .flatMap(candidate => tokenChoices(candidate, 5).map(token => ({actor: candidate, token})));
    if (!delegates.length) return refuse("delegate");
    if (!selectedDelegate && selectedTargets.size === 1) {
      const targetKey = [...selectedTargets][0];
      const match = delegates.find(row => `${row.token.parent.id}:${row.token.id}` === targetKey);
      if (match) { selectedDelegate = match.actor; selectedDelegateToken = match.token; delegateToken = tokenRef(match.token); }
    }
    if (!selectedDelegate || !selectedDelegateToken || selectedDelegateToken.actor?.uuid !== selectedDelegate.uuid
      || !delegates.some(row => row.actor.uuid === selectedDelegate.uuid && row.token.id === selectedDelegateToken.id)) {
      const options = delegates.map(({actor: candidate, token}) => ({
        value: JSON.stringify({actorUuid: candidate.uuid, token: tokenRef(token)}),
        label: `${candidate.name} — ${token.name}`
      }));
      const picked = await felDialog(spell, [{name: "delegate", label: "Willing delegate", options}], "Choose who may issue the demon's ordinary commands.");
      if (!picked) return refuse("cancelled");
      try {
        const parsed = JSON.parse(picked.delegate);
        selectedDelegate = resolve(parsed.actorUuid);
        selectedDelegateToken = tokenAt(parsed.token);
        delegateToken = parsed.token;
      } catch { return refuse("delegate"); }
    }
    if (!selectedDelegate) return refuse("delegate");
  }
  const selectedTargetRefs = identifier === "summoners-writ"
    ? [tokenRef(selectedDemonToken), tokenRef(selectedDelegateToken)] : [tokenRef(selectedDemonToken)];
  return request({phase: "prepare", actorUuid: actor.uuid, spellUuid: spell.uuid,
    source: sourceRef, demonUuid: selectedDemon.uuid, delegateUuid: selectedDelegate?.uuid ?? null,
    demonToken: tokenRef(selectedDemonToken), delegateToken: tokenRef(selectedDelegateToken), targets: selectedTargetRefs});
}

async function felDialog(spell, fields, note) {
  const {utilityDialog} = await import("../applications/thematic-utility-dialog.mjs");
  return utilityDialog({title: spell.name, note, fields});
}

export function finishThematicFel(ticket, messageId, castId) {
  return request({phase: "finish", ticket, messageId, castId});
}

/** Bind a prepared special spell to the ordinary workflow's unique cast id. */
export function claimThematicFel(ticket, castId) {
  return request({phase: "claim", ticket, castId});
}

/** Claim an eligible native ability promise before its action/resource payment. */
export function claimFelSuretyForAbility({demon, ability, list = "creatureAbilities", index = 0, attemptId} = {}) {
  if (list !== "creatureAbilities" || suretyPowerCost(ability) === null || !attemptId) return Promise.resolve(null);
  return request({phase: "claimSurety", demonUuid: worldActorOf(demon)?.uuid, ability, list, index, attemptId});
}

/** Call after the ability's priced cost is paid, before its Test/result is known. */
export function commitFelSuretyUse({ticket, attemptId, claimId} = {}) {
  return request({phase: "commitSurety", ticket, attemptId, claimId});
}

/** Cancel a reservation only when the native ability was not paid. */
export function releaseFelSuretyClaim({ticket, attemptId, claimId} = {}) {
  return request({phase: "releaseSurety", ticket, attemptId, claimId});
}

export async function thematicFelConsentHandler(payload, {user} = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const delegate = resolve(payload.delegateUuid), caster = resolve(payload.casterUuid), spell = resolve(payload.spellUuid);
  if (!delegate || !caster || !spell || spell.system?.identifier !== "summoners-writ"
    || !actorHasWarlock(caster) || !delegate.testUserPermission(game.user, "OWNER")) return false;
  const {confirmHere} = await import("./blow-doors.mjs");
  return confirmHere(delegate, {title: spell.name, text: `${foundry.utils.escapeHTML(caster.name)} asks you to issue ordinary commands to their bound demon for eight hours.`});
}

function contextFor(data, user, {checkConsent = true} = {}) {
  const valid = validateSpell(data, user);
  if (!valid.ok) return valid;
  const {caster, spell, identifier} = valid;
  const demon = resolve(data.demonUuid);
  const worldDemon = worldActorOf(demon);
  if (!worldDemon || worldDemon.documentName !== "Actor") return refuse("demon");
  const bond = bondOf(worldDemon);
  if (bond?.kind !== "demon" || bond.ownerUuid !== caster.uuid || bond.temporarilyEnslaved === true) return refuse("bond");
  const sourceToken = sourceTokenOf(data.source, caster);
  const demonToken = tokenForActor(worldDemon, data.demonToken);
  if (!sourceToken || !demonToken) return refuse("range");
  const casterDemonFeet = touchDistance(sourceToken, demonToken);
  const maxRange = identifier === "summoners-writ" ? 5 : SURETY_RANGE_FEET;
  if (!Number.isFinite(casterDemonFeet) || casterDemonFeet > maxRange) return refuse(identifier === "summoners-writ" ? "touch" : "range");
  let delegate = null;
  let delegateToken = null;
  if (identifier === "summoners-writ") {
    delegate = resolve(data.delegateUuid);
    if (!delegate || delegate.uuid === caster.uuid || delegate.uuid === worldDemon.uuid) return refuse("delegate");
    if (checkConsent && (data.consent?.actorUuid !== delegate.uuid
      || !delegate.testUserPermission(game.users.get(data.consent.userId), "OWNER"))) return refuse("consent");
    delegateToken = tokenForActor(delegate, data.delegateToken);
    const casterDelegateFeet = touchDistance(sourceToken, delegateToken);
    if (!Number.isFinite(casterDelegateFeet) || casterDelegateFeet > 5) return refuse("touch");
  }
  return {ok: true, caster, spell, identifier, demon: worldDemon, delegate, bond,
    sourceToken, demonToken, delegateToken, casterDemonFeet};
}

export async function thematicFelQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id) return refuse("authority");
  await loadAuthorizedPrivateSpellMessages();
  if (data.phase === "prepare") {
    const ctx = contextFor(data, user, {checkConsent: false});
    if (!ctx.ok) return ctx;
    let consent = null;
    if (ctx.identifier === "summoners-writ") {
      consent = await askDelegateConsent(ctx.delegate, ctx.caster, ctx.spell);
      if (!consent) return refuse("declined");
    }
    const fresh = contextFor({...data, consent}, user, {checkConsent: false});
    if (!fresh.ok || fresh.caster.uuid !== ctx.caster.uuid || fresh.demon.uuid !== ctx.demon.uuid
      || fresh.delegate?.uuid !== ctx.delegate?.uuid) return refuse("changed");
    const receipt = await createPrivateSpellMessage({
      whisper: [...game.users].filter(person => person.isGM).map(person => person.id),
      content: textContent(`${fresh.spell.name}: ${fresh.demon.name}${fresh.delegate ? ` — ${fresh.delegate.name}` : ""}`),
      flags: {[NS]: {thematicFelReceipt: {
        version: 1, kind: fresh.identifier === "summoners-writ" ? "writ" : "surety",
        status: "prepared", userId: user.id, casterUuid: fresh.caster.uuid,
        spellUuid: fresh.spell.uuid, demonUuid: fresh.demon.uuid,
        delegateUuid: fresh.delegate?.uuid ?? null, consent,
        source: refOf(data.source), demonToken: refOf(data.demonToken), delegateToken: refOf(data.delegateToken),
        targets: Array.isArray(data.targets) && data.targets.length ? data.targets.map(refOf)
          : [refOf(data.demonToken), ...(fresh.delegate ? [refOf(data.delegateToken)] : [])],
        wallExpires: Date.now() + 600000,
        preparedAt: game.time.worldTime
      }}}
    });
    return {ok: true, ticket: receipt.id, source: refOf(data.source), targets: receipt.flags?.[NS]?.thematicFelReceipt?.targets ?? []};
  }
  if (data.phase === "claim") return serialized(data.ticket, async () => {
    const receipt = privateSpellMessage(data.ticket), stored = stateOf(receipt), state = foundry.utils.deepClone(stored);
    if (!state || state.userId !== user.id || state.status !== "prepared" || Date.now() > state.wallExpires
      || typeof data.castId !== "string" || !data.castId) return refuse("ticket");
    if (state.claimCast) return state.claimCast === data.castId
      ? {ok: true, replay: true, claimedAt: state.claimedAt}
      : refuse("alreadyClaimed");
    const fresh = contextFor({actorUuid: state.casterUuid, spellUuid: state.spellUuid,
      demonUuid: state.demonUuid, delegateUuid: state.delegateUuid, consent: state.consent, source: state.source,
      demonToken: state.demonToken, delegateToken: state.delegateToken}, user);
    if (!fresh.ok) return fresh;
    if (state.kind === "writ" && liveWritsForCaster(fresh.caster.uuid).length) return refuse("alreadyDelegated");
    state.claimCast = data.castId;
    state.claimedAt = game.time.worldTime;
    await write(receipt, state);
    return {ok: true};
  });
  if (data.phase === "finish") return serialized(data.ticket, async () => {
    const receipt = privateSpellMessage(data.ticket), state = foundry.utils.deepClone(stateOf(receipt));
    if (!state || (state.userId !== user.id && !(user.isGM && user.id === game.users?.activeGM?.id))) return refuse("ticket");
    const card = privateSpellMessage(data.messageId), flags = card?.flags?.[NS];
    if (!card || card.author?.id !== state.userId || flags?.kind !== "spell" || flags.identifier !== (state.kind === "writ" ? "summoners-writ" : "fel-surety")
      || flags.caster !== state.casterUuid || flags.spellUuid !== state.spellUuid
      || flags.cast !== data.castId || flags.felTicket !== receipt.id || state.claimCast !== data.castId
      || !same(refOf(flags.source), state.source)
      || !same((flags.targets ?? []).map(refOf), state.targets)
      || typeof data.castId !== "string") return refuse("card");
    if (state.status === "active" && state.cardId === card.id && state.castAt === state.claimedAt) {
      return {ok: true, complete: true, replay: true, ticket: receipt.id};
    }
    if (state.status === "failed" && state.cardId === card.id && state.claimCast === data.castId) {
      return {ok: true, complete: false, replay: true};
    }
    if (state.status !== "prepared") return refuse("ticket");
    if (flags.success !== true) {
      state.status = "failed";
      state.cardId = card.id;
      state.castAt = state.claimedAt;
      await write(receipt, state);
      return {ok: true, complete: false};
    }
    if (!Number.isFinite(state.claimedAt) || state.claimedAt < state.preparedAt) return refuse("castTime");
    const fresh = contextFor({actorUuid: state.casterUuid, spellUuid: state.spellUuid,
      demonUuid: state.demonUuid, delegateUuid: state.delegateUuid, consent: state.consent, source: state.source,
      demonToken: state.demonToken, delegateToken: state.delegateToken}, user);
    if (!fresh.ok) return fresh;
    if (state.kind === "writ") {
      const result = createSummonersWrit({casterUuid: fresh.caster.uuid, casterClass: "Warlock",
        demonUuid: fresh.demon.uuid, delegateUuid: fresh.delegate.uuid, bond: fresh.bond,
        delegateConsented: true, touches: {casterDemon: true, casterDelegate: true},
        temporarilyEnslaved: fresh.bond.temporarilyEnslaved === true,
        activeWrits: liveWritsForCaster(fresh.caster.uuid, state.claimedAt), now: state.claimedAt});
      if (!result.ok) return result;
      state.writ = result.writ;
    } else {
      const result = createFelSurety({casterUuid: fresh.caster.uuid, casterClass: "Warlock",
        demonUuid: fresh.demon.uuid, bond: fresh.bond,
        demonFeetFromCaster: touchDistance(fresh.sourceToken, fresh.demonToken), now: state.claimedAt});
      if (!result.ok) return result;
      state.surety = result.surety;
    }
    state.cardId = card.id;
    state.castAt = state.claimedAt;
    state.status = "active";
    await write(receipt, state);
    return {ok: true, complete: true, ticket: receipt.id};
  });
  if (data.phase === "command") return authorizeCommand(data, user);
  if (data.phase === "commandOptions") {
    const authorized = await authorizeCommand(data, user);
    if (!authorized.ok) return authorized;
    const demon = authorized.demon;
    const abilities = (demon?.system?.creatureAbilities ?? []).flatMap((row, index) => {
      const kind = row?.automation?.kind;
      if (!row?.name || !kind || kind === "none" || kind === "passive") return [];
      return [{index, name: row.name, spell: kind === "spell"}];
    });
    return {ok: true, abilities};
  }
  if (data.phase === "issueCommand") return issueCommand(data, user);
  if (data.phase === "issueOrder") return serialized(data.ticket, () => issueOrdinaryOrder(data, user));
  if (data.phase === "revokeWrit") return serialized(data.ticket, async () => {
    const receipt = privateSpellMessage(data.ticket), state = foundry.utils.deepClone(stateOf(receipt));
    if (!state || state.kind !== "writ" || state.status !== "active" || state.revokePending) return refuse("ticket");
    const caster = resolve(state.casterUuid);
    if (!caster?.testUserPermission(user, "OWNER")) return refuse("owner");
    const result = makeRevokedWrit(state.writ, {actorUuid: caster.uuid, now: game.time.worldTime});
    if (!result.ok) return result;
    const pending = {...state, revokePending: {userId: user.id, at: game.time.worldTime, id: foundry.utils.randomID()}};
    await write(receipt, pending);
    const {spendTurnBudget} = await import("../dice/workflows.mjs");
    if (!await spendTurnBudget(caster, "half")) {
      delete pending.revokePending;
      await write(receipt, pending);
      return refuse("action");
    }
    await write(receipt, {...pending, status: "revoked", writ: result.writ, revokedAt: game.time.worldTime, revokePending: null});
    return {ok: true, action: "half", spent: true};
  });
  if (data.phase === "claimSurety") return claimSurety(data, user);
  if (data.phase === "commitSurety") return commitSurety(data, user);
  if (data.phase === "releaseSurety") return releaseSurety(data, user);
  return refuse("phase");
}

function tokenForActorInScene(actor, sceneId) {
  const scene = game.scenes?.get(sceneId);
  return [...(scene?.tokens ?? [])].find(token => token.actor?.uuid === actor?.uuid) ?? null;
}

async function authorizeCommand(data, user) {
  const receipt = privateSpellMessage(data.ticket), state = stateOf(receipt);
  if (!state || state.kind !== "writ" || state.status !== "active" || state.writ?.revokedAt != null || state.revokePending) return refuse("noWrit");
  const worldDemon = worldActorOf(resolve(state.writ.demonUuid));
  const requester = resolve(data.requesterActorUuid);
  if (!worldDemon || !requester || requester.uuid !== state.writ.delegateUuid || !user || !requester.testUserPermission(user, "OWNER")) return refuse("owner");
  const delegateToken = tokenAt(data.delegateToken);
  if (delegateToken?.actor?.uuid !== requester.uuid) return refuse("token");
  const token = tokenForActorInScene(worldDemon, delegateToken.parent?.id);
  if (!token) return refuse("token");
  const bond = bondOf(worldDemon);
  const feet = touchDistance(token, delegateToken);
  const result = mayDelegateDemonCommand(state.writ, {requesterUuid: requester.uuid,
    operation: data.operation ?? "ordinary", demonUuid: worldDemon.uuid, bond,
    delegateFeetFromDemon: feet, now: game.time.worldTime});
  return result.ok ? {...result, ticket: receipt.id, demon: worldDemon, demonToken: token, delegateToken} : result;
}

/** Query-backed command check for an existing owner-only demon command door. */
export function authorizeSummonersWritCommand({ticket, requesterActor, delegateToken, operation = "ordinary"} = {}) {
  return request({phase: "command", ticket, requesterActorUuid: requesterActor?.uuid,
    delegateToken: tokenRef(delegateToken), operation});
}

export function revokeSummonersWrit(ticket) { return request({phase: "revokeWrit", ticket}); }

async function issueCommand(data, user) {
  const authorized = await authorizeCommand(data, user);
  if (!authorized.ok) return authorized;
  const demon = authorized.demon;
  const index = data.index;
  const row = demon?.system?.creatureAbilities?.[index];
  if (!Number.isInteger(index) || !row?.automation || row.automation.kind === "none" || row.automation.kind === "passive") return refuse("ability");
  const tokens = [];
  for (const ref of data.targets ?? []) {
    const token = tokenAt(ref);
    if (!token?.actor || (ref.actorId && token.actor.id !== ref.actorId)) return refuse("targets");
    tokens.push(token.object ?? {actor: token.actor, id: token.id, scene: token.parent, name: token.name});
  }
  if (row.automation.kind === "spell") {
    const spellName = row.automation.spell || row.name;
    const pack = game.packs.get("azeroth-rpg.spells");
    const entry = pack ? (await pack.getIndex()).find(item => item.name === spellName) ?? null : null;
    const spell = entry ? await pack.getDocument(entry._id) : null;
    if (!spell) return refuse("spell");
    const {sourceOf, targetSnapshots} = await import("../applications/roll-dialog.mjs");
    const source = sourceOf(demon);
    if (!source?.sceneId || !source?.tokenId) return refuse("source");
    const snapshots = targetSnapshots(tokens);
    const {castWithDialog} = await import("../applications/actions.mjs");
    const {castSpell} = await import("../dice/workflows.mjs");
    const run = args => castSpell({...args, actor: demon, spell, source, targets: snapshots});
    const card = await castWithDialog(demon, spell, null, {targets: snapshots, run});
    return card ? {ok: true, messageId: card.id ?? null} : refuse("ability");
  }
  const {targetSnapshots} = await import("../applications/roll-dialog.mjs");
  const {useAbility} = await import("../dice/workflows.mjs");
  const card = await useAbility({actor: demon, list: "creatureAbilities", index, targets: targetSnapshots(tokens)});
  return card ? {ok: true, messageId: card.id ?? null} : refuse("ability");
}

/** Ordinary movement, attacks and table orders remain GM-resolved through the
 * demon's normal turn. This delegates authority, never ownership or extra actions. */
async function issueOrdinaryOrder(data, user) {
  if (typeof data.order !== "string" || !data.order.trim() || data.order.length > 1000
      || typeof data.commandId !== "string" || !data.commandId || data.commandId.length > 100) return refuse("order");
  let authorized = await authorizeCommand({...data, operation: "ordinary"}, user);
  if (!authorized.ok) return authorized;
  const receipt = privateSpellMessage(data.ticket), state = stateOf(receipt);
  const prior = (state.orders ?? []).find(row => row.id === data.commandId);
  if (prior) return prior.messageId && privateSpellMessage(prior.messageId)
    ? {ok: true, messageId: prior.messageId, already: true} : refuse("orderUnresolved");
  const answer = await felDialog({name: "GM: Summoner's Writ order"}, [
    {name: "ordinary", type: "checkbox", label: "This is an ordinary command; it does not dismiss, transfer or change the bond"}
  ], `${resolve(data.requesterActorUuid)?.name}: ${data.order.trim()}\nResolve any movement, attack or action using the demon's existing initiative and budget.`);
  if (!answer?.ordinary) return refuse("cancelled");
  authorized = await authorizeCommand({...data, operation: "ordinary"}, user);
  if (!authorized.ok) return authorized;
  const messageId = foundry.utils.randomID();
  const latest = stateOf(receipt);
  await write(receipt, {...latest, orders: [...(latest.orders ?? []), {id: data.commandId, messageId, order: data.order.trim()}]});
  const requester = resolve(data.requesterActorUuid), caster = resolve(latest.casterUuid);
  const whisper = [...game.users].filter(who => who.isGM || requester?.testUserPermission(who, "OWNER")
    || caster?.testUserPermission(who, "OWNER")).map(who => who.id);
  const card = await createPrivateSpellMessage({_id: messageId, whisper,
    content: textContent(`${requester.name} directs ${authorized.demon.name}: ${data.order.trim()} — GM resolves this with the demon's ordinary actions.`),
    flags: {[NS]: {writOrder: {ticket: receipt.id, commandId: data.commandId}}}}, {keepId: true});
  return card ? {ok: true, messageId: card.id} : refuse("orderUnresolved");
}

export async function requestSummonersWritCommand({ticket, requesterActor, delegateToken, index, targets = []} = {}) {
  return request({phase: "issueCommand", ticket,
    requesterActorUuid: requesterActor?.uuid,
    delegateToken: tokenRef(delegateToken), index, targets: targets.map(tokenRef)});
}

async function issueCommandFromCard(ticket) {
  const tokens = [...(globalThis.canvas?.tokens?.placeables ?? [])].filter(token => token.actor
    && token.actor.testUserPermission(game.user, "OWNER"));
  if (!tokens.length) return refuse("delegate");
  const actorPick = await felDialog({name: "Issue command"}, [{name: "delegate", label: "Your character", options:
    tokens.map(token => ({value: JSON.stringify({actorUuid: token.actor.uuid, token: tokenRef(token)}),
      label: `${token.actor.name} — ${token.name}`}))}], "Choose the character issuing the command.");
  if (!actorPick) return refuse("cancelled");
  let selected;
  try { selected = JSON.parse(actorPick.delegate); } catch { return refuse("delegate"); }
  const requester = resolve(selected.actorUuid), delegateToken = tokenAt(selected.token);
  if (!requester || !delegateToken) return refuse("token");
  const base = {ticket, requesterActorUuid: requester.uuid, delegateToken: tokenRef(delegateToken)};
  const options = await request({phase: "commandOptions", ...base});
  if (!options?.ok) return options;
  const abilityPick = await felDialog({name: "Issue command"}, [{name: "ability", label: "Command",
    options: [{value: "ordinary", label: "Ordinary order (movement, attack or other instruction)"},
      ...options.abilities.map(row => ({value: String(row.index), label: row.name}))]}], "Choose an ordinary order or an ability for the demon to use.");
  if (!abilityPick) return refuse("cancelled");
  if (abilityPick.ability === "ordinary") {
    const order = await felDialog({name: "Issue ordinary order"}, [{name: "order", label: "Instruction", maxLength: 1000}],
      "The GM resolves this with the demon's existing actions. Dismissal and the bond remain with its warlock.");
    if (!order) return refuse("cancelled");
    return request({phase: "issueOrder", ...base, order: order.order, commandId: foundry.utils.randomID()});
  }
  const targets = [...(game.user?.targets ?? [])].map(token => token.document ?? token);
  return request({phase: "issueCommand", ...base, index: Number(abilityPick.ability), targets: targets.map(tokenRef)});
}

/** Add Half-Action revocation and ordinary command controls to the Writ card. */
export function registerThematicFelCardHooks() {
  Hooks.on("renderChatMessageHTML", withPrivateSpellMessage((message, html) => {
    const flags = message.flags?.[NS];
    if (flags?.kind !== "spell" || flags.identifier !== "summoners-writ" || !flags.felTicket) return;
    const container = html.querySelector(".azeroth-card");
    if (!container) return;
    const caster = resolve(flags.caster);
    if (game.user?.isGM || caster?.testUserPermission(game.user, "OWNER")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Revoke Writ (Half-Action)";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await revokeSummonersWrit(flags.felTicket);
          if (!result?.ok) ui.notifications?.warn("The Writ could not be revoked; confirm the caster's Half-Action and active Writ.");
        } finally { button.disabled = false; }
      });
      container.append(button);
    }
    const command = document.createElement("button");
    command.type = "button";
    command.textContent = "Issue Command";
    command.addEventListener("click", async () => {
      command.disabled = true;
      try {
        const result = await issueCommandFromCard(flags.felTicket);
        if (!result?.ok) ui.notifications?.warn("The command could not be completed; confirm the delegate, range, and active Writ.");
      } finally { command.disabled = false; }
    });
    container.append(command);
  }));
}

async function claimSurety(data, user) {
  const demon = worldActorOf(resolve(data.demonUuid));
  const abilityRow = demon?.system?.[data.list]?.[data.index];
  if (!demon || !abilityRow || !same(abilityRow, data.ability) || suretyPowerCost(abilityRow) === null) return refuse("ability");
  if (!demon.testUserPermission(user, "OWNER")) return refuse("owner");
  const active = liveSuretyForDemon(demon.uuid);
  if (!active) return refuse("noSurety");
  return serialized(active.receiptId, async () => {
    const receipt = privateSpellMessage(active.receiptId), state = foundry.utils.deepClone(stateOf(receipt));
    if (!state || state.status !== "active" || state.surety.consumedAt != null) return refuse("consumed");
    if (state.claim) {
      if (state.claim.attemptId !== data.attemptId) return refuse("claimed");
      return {ok: true, ticket: receipt.id, claimId: state.claim.claimId, attemptId: state.claim.attemptId,
        demonUuid: demon.uuid, casterUuid: state.casterUuid, cost: state.claim.cost,
        payer: state.claim.payer, payerPool: state.claim.payerPool};
    }
    const caster = resolve(state.casterUuid), bond = bondOf(demon);
    if (!actorHasWarlock(caster)) return refuse("class");
    const casterToken = sourceTokenOf(state.source, caster) ?? tokenForActor(caster);
    const demonToken = tokenForActor(demon, state.demonToken);
    const distance = touchDistance(casterToken, demonToken);
    const casterPool = warlockManaPool(caster);
    const demonPool = demon.poolSnapshot?.().find(pool => pool.kind === "power");
    const resolved = resolveFelSurety(state.surety, {casterUuid: caster?.uuid, demonUuid: demon.uuid,
      bond, demonFeetFromCaster: distance, ability: abilityRow, casterMana: casterPool?.value,
      demonPower: demonPool?.value, payerChoice: "warlock", now: game.time.worldTime});
    if (!resolved.ok) return resolved;
    const claimId = foundry.utils.randomID();
    state.claim = {attemptId: data.attemptId, claimId, createdAt: game.time.worldTime,
      cost: resolved.cost, payer: resolved.payer, status: "reserved",
      payerPool: poolRef(resolved.payer === "warlock" ? casterPool : demonPool),
      poolBefore: resolved.payer === "warlock" ? casterPool.value : demonPool.value};
    await write(receipt, state);
    return {ok: true, ticket: receipt.id, claimId, attemptId: data.attemptId,
      demonUuid: demon.uuid, casterUuid: caster.uuid, cost: resolved.cost, payer: resolved.payer,
      payerPool: state.claim.payerPool};
  });
}

async function commitSurety(data, user) {
  return serialized(data.ticket, async () => {
    const receipt = privateSpellMessage(data.ticket), state = foundry.utils.deepClone(stateOf(receipt));
    if (!state || state.kind !== "surety" || state.claim?.attemptId !== data.attemptId
      || state.claim?.claimId !== data.claimId) return refuse("claim");
    if (state.status === "consumed" && state.claim.status === "paid") return {ok: true, consumed: true, replay: true};
    if (state.status !== "active" || state.claim.status !== "reserved") return refuse("claim");
    const demon = resolve(state.demonUuid), caster = resolve(state.casterUuid);
    if (!demon || !caster || (!demon.testUserPermission(user, "OWNER") && !user.isGM)) return refuse("owner");
    const payer = state.claim.payer === "warlock" ? caster : demon;
    const pool = poolAt(payer, state.claim.payerPool);
    if (!pool || pool.value !== state.claim.poolBefore - state.claim.cost) return refuse("paymentNotObserved");
    state.claim.status = "paid";
    state.claim.paidAt = game.time.worldTime;
    state.surety = {...state.surety, consumedAt: game.time.worldTime};
    state.status = "consumed";
    await write(receipt, state);
    return {ok: true, consumed: true};
  });
}

async function releaseSurety(data, user) {
  return serialized(data.ticket, async () => {
    const receipt = privateSpellMessage(data.ticket), state = foundry.utils.deepClone(stateOf(receipt));
    if (!state || state.kind !== "surety" || state.claim?.attemptId !== data.attemptId
      || state.claim?.claimId !== data.claimId || state.claim.status !== "reserved") return refuse("claim");
    const demon = resolve(state.demonUuid);
    if (!demon?.testUserPermission(user, "OWNER") && !user.isGM) return refuse("owner");
    const payer = state.claim.payer === "warlock" ? resolve(state.casterUuid) : demon;
    const pool = poolAt(payer, state.claim.payerPool);
    if (!pool || pool.value !== state.claim.poolBefore) return refuse("alreadyPaid");
    state.claim = null;
    await write(receipt, state);
    return {ok: true, released: true};
  });
}
