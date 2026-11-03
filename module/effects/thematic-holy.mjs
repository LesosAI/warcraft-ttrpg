/** GM-owned receipts for Prayer of Mending and Gentle Verdict. The ordinary
 * spell workflow owns payment/Test; this door owns finite post-cast state. */
import { holySpell, startMending, mendingOnDamage, mendingJump, startVerdict,
  verdictOnAttempt, verdictConsequence } from "../rules/thematic-holy.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";
import { castDealsDamage } from "../rules/area-ticks.mjs";
import { areaFor } from "../rules/areas.mjs";

export const HOLY_QUERY = "azeroth-rpg.thematicHoly";
export const HOLY_CONSENT = "azeroth-rpg.thematicHolyConsent";
const NS = "azeroth-rpg";
const jobs = new Map();
const refused = reason => ({ ok: false, reason });
const ref = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);
const refOf = value => value ? { sceneId: value.sceneId ?? null, tokenId: value.tokenId ?? null, actorId: value.actorId ?? null } : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = value => game.scenes?.get(value?.sceneId)?.tokens.get(value?.tokenId) ?? null;
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const stateOf = message => message?.flags?.[NS]?.holyReceipt;
const words = key => game.i18n.localize(`AZEROTH.Holy.${key}`);
const write = (message, state) => message.update({ [`flags.${NS}.holyReceipt`]: foundry.data.operators.ForcedReplacement.create(state) });
const privateUsers = actor => [...game.users].filter(user => user.isGM || actor.testUserPermission(user, "OWNER")).map(user => user.id);
const textContent = value => `<p>${foundry.utils.escapeHTML(value)}</p>`;

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(payload) {
  if (gmHere()) return holyQueryHandler(payload, { user: game.user });
  if (!game.users?.activeGM) return refused("noGM");
  try { return await game.users.activeGM.query(HOLY_QUERY, payload, { timeout: 300000 }); }
  catch { return refused("unanswered"); }
}

function liveEffect(effect) {
  if (!effect || effect.disabled || effect.isSuppressed || effect.active === false || effect.duration?.expired) return false;
  const mark = effect.flags?.[NS]?.holyMending ?? effect.flags?.[NS]?.holyVerdict;
  return mark?.version === 1 && ref(mark.ticket) && ref(mark.cast);
}

/** Lightweight discovery only. Every write reopens and checks the GM receipt. */
export function mendingFor(actor) {
  const now = game.time?.worldTime ?? 0;
  const effect = [...actor?.effects ?? []].find(effect => liveEffect(effect)
    && effect.flags?.[NS]?.holyMending?.holderUuid === actor.uuid
    && effect.flags[NS].holyMending.pending !== true
    && effect.flags[NS].holyMending.expiresAt > now);
  const mark = effect?.flags?.[NS]?.holyMending;
  return mark ? { ticket: mark.ticket, cast: mark.cast, effectId: effect.id } : null;
}

export function verdictFor(actor) {
  const effect = [...actor?.effects ?? []].find(effect => liveEffect(effect)
    && effect.flags?.[NS]?.holyVerdict?.casterUuid === actor.uuid);
  const mark = effect?.flags?.[NS]?.holyVerdict;
  return mark ? { ticket: mark.ticket, cast: mark.cast, effectId: effect.id } : null;
}

function targetOf(value) {
  const token = tokenAt(value);
  return value?.tokenId ? token?.actor : game.actors?.get(value?.actorId);
}

function context(payload, user) {
  const actor = resolve(payload.actorUuid), spell = resolve(payload.spellUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refused("owner");
  const definition = holySpell(spell?.system?.identifier);
  if (spell?.type !== "spell" || !definition || (spell.actor && spell.actor.uuid !== actor.uuid)) return refused("spell");
  const targets = payload.targets;
  if (!Array.isArray(targets) || targets.length !== (definition.identifier === "prayer-of-mending" ? 1 : 0)) return refused("targets");
  const sourceToken = tokenAt(payload.source);
  if (payload.source?.tokenId && (!sourceToken || sourceToken.actor?.uuid !== actor.uuid)) return refused("source");
  const recipient = targets.length ? targetOf(targets[0]) : actor;
  if (!recipient || (targets[0]?.actorId && recipient.id !== targets[0].actorId)) return refused("targets");
  const targetToken = tokenAt(targets[0]);
  const measured = targets.length === 0 || Boolean(sourceToken && targetToken);
  if (measured && targets.length && (sourceToken.parent?.id !== targetToken.parent?.id
    || !Number.isFinite(feetApart(sourceToken, targetToken)) || feetApart(sourceToken, targetToken) > definition.rangeFt)) return refused("range");
  return { ok: true, actor, spell, definition, recipient, measured };
}

async function consent(actor, caster, spell) {
  const { answererOf, ASK_MS } = await import("./blow-doors.mjs");
  const who = answererOf(actor);
  if (!who) return null;
  const payload = { recipientUuid: actor.uuid, casterUuid: caster.uuid, spellUuid: spell.uuid };
  try {
    const answer = who.id === game.user.id ? await holyConsentHandler(payload, { user: game.user })
      : await who.query(HOLY_CONSENT, payload, { timeout: ASK_MS });
    return answer === true && actor.testUserPermission(who, "OWNER") ? { userId: who.id } : null;
  } catch { return null; }
}

export async function holyConsentHandler(payload, { user } = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const actor = resolve(payload.recipientUuid), caster = resolve(payload.casterUuid), spell = resolve(payload.spellUuid);
  if (!actor || !caster || !holySpell(spell?.system?.identifier) || !actor.testUserPermission(game.user, "OWNER")) return false;
  const { confirmHere } = await import("./blow-doors.mjs");
  return confirmHere(actor, { title: spell.name, text: words("Consent") });
}

/** The caller supplies selected token/actor refs, never a free-form UUID. */
export async function prepareHolyCast({ actor, spell, source = null, targets = [] } = {}) {
  if (!holySpell(spell?.system?.identifier)) return null;
  return request({ phase: "prepare", actorUuid: actor?.uuid, spellUuid: spell.uuid,
    source: refOf(source), targets: targets.map(refOf) });
}

export const claimHolyCast = (ticket, cast) => request({ phase: "claim", ticket, cast });
export const finishHolyCast = (ticket, messageId) => request({ phase: "finish", ticket, messageId });
export const mendingAfterDamage = ({ targetUuid, eventId, healthBefore, healthAfter, sourceMessageId } = {}) =>
  request({ phase: "damage", targetUuid, eventId, healthBefore, healthAfter, sourceMessageId });
export const mendingChooseNext = ({ ticket, source = null, targets = [] } = {}) =>
  request({ phase: "jump", ticket, source: refOf(source), targets: targets.map(refOf) });
/** GM adjudication after an interrupted healing acknowledgement. */
export const recoverMendingDamage = ({ ticket, healingLanded } = {}) =>
  request({ phase: "recover", ticket, healingLanded });
/** Review before spending the next spell's budget. Null means it does not
 * qualify, so the ordinary cast may continue without consuming Verdict. */
export async function prepareVerdictAttempt({ actor, spell, targets = [], attemptId, viaItem = false } = {}) {
  if (viaItem || !actor || !spell || !ref(attemptId)) return null;
  const held = verdictFor(actor);
  if (!held) return null;
  return request({ phase: "verdictPrepare", ticket: held.ticket, actorUuid: actor.uuid,
    spellUuid: spell.uuid, targets: targets.map(refOf), attemptId });
}
export const claimVerdictAttempt = ({ ticket, attemptId } = {}) => request({ phase: "verdictAttempt", ticket, attemptId });
export const releaseVerdictAttempt = ({ ticket, attemptId } = {}) => request({ phase: "verdictRelease", ticket, attemptId });
export const resolveVerdictDamage = ({ messageId, target, healthBefore, healthAfter } = {}) =>
  request({ phase: "verdictDamage", messageId, targetUuid: target?.uuid, healthBefore, healthAfter });
export const recoverVerdictDamage = ({ messageId, targetUuid, outcome, handled = false } = {}) =>
  request({ phase: "verdictRecover", messageId, targetUuid, outcome, handled });

const tokenRef = token => ({ sceneId: token.parent?.id ?? null, tokenId: token.id, actorId: token.actor?.id ?? null });

/** Names are shown to the caster; identity and range are checked again by GM
 * when the actual jump is requested. No UUID is typed into the picker. */
export async function chooseMendingTarget(ticket) {
  const listed = await request({ phase: "jumpCandidates", ticket });
  if (!listed?.ok) return listed;
  const options = [{ value: "none", label: words("NoRecipient") }, ...listed.options];
  const picked = await utilityDialog({ title: words("MendingJump"), note: words("ChooseRecipient"),
    fields: [{ name: "recipient", label: words("Recipient"), options }] });
  if (!picked) return refused("cancelled");
  if (picked.recipient === "none") return mendingChooseNext({ ticket });
  try {
    const selected = JSON.parse(picked.recipient);
    return mendingChooseNext({ ticket, source: selected.source, targets: selected.targets });
  } catch { return refused("targets"); }
}

function jumpCandidates(state, user) {
  if (state?.identifier !== "prayer-of-mending" || state.status !== "complete"
    || state.record?.status !== "choosing" || state.pendingDamage?.status !== "delivered"
    || (state.userId !== user.id && !user.isGM)) return refused("ticket");
  const holder = resolve(state.pendingDamage.holderUuid);
  if (!holder) return refused("holder");
  const options = [], seen = new Set(), sources = [];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) if (token.actor?.uuid === holder.uuid) sources.push(token);
  }
  for (const source of sources) {
    for (const token of source.parent?.tokens ?? []) {
      const actor = token.actor;
      if (!actor || actor.uuid === holder.uuid || (!user.isGM && token.hidden)
        || !actor.testUserPermission(user, "OBSERVER") || hasMending(actor, state.receiptId)) continue;
      const feet = feetApart(source, token);
      if (!Number.isFinite(feet) || feet > 15 || feet < 0) continue;
      const value = JSON.stringify({ source: tokenRef(source), targets: [tokenRef(token)] });
      if (!seen.has(value)) { seen.add(value); options.push({ value, label: token.name ?? actor.name }); }
    }
  }
  if (!sources.length) {
    for (const actor of game.actors ?? []) {
      if (actor.uuid === holder.uuid || !actor.testUserPermission(user, "OBSERVER") || hasMending(actor, state.receiptId)) continue;
      const value = JSON.stringify({ source: null, targets: [{ sceneId: null, tokenId: null, actorId: actor.id }] });
      if (!seen.has(value)) { seen.add(value); options.push({ value, label: actor.name }); }
    }
  }
  return { ok: true, options: options.sort((a, b) => a.label.localeCompare(b.label)) };
}

function mendingEffect(state, receipt, spell, effectId, messageId) {
  return { _id: effectId, name: spell.name, img: spell.img, description: spell.system?.effect ?? "", origin: spell.uuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: state.startsAt }, duration: { value: 60, units: "seconds", expiry: "turnStart", expired: false },
    flags: { [NS]: { identifier: "prayer-of-mending", cast: state.cast, messageId,
      holyMending: { version: 1, ticket: receipt.id,
      cast: state.cast, casterUuid: state.casterUuid, holderUuid: state.holderUuid,
      charges: state.charges, startsAt: state.startsAt, expiresAt: state.expiresAt } } } };
}

function verdictEffect(state, receipt, spell, effectId, messageId) {
  return { _id: effectId, name: spell.name, img: spell.img, description: spell.system?.effect ?? "", origin: spell.uuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: state.timing.start, duration: { ...state.timing.duration, expired: false },
    flags: { [NS]: { identifier: "gentle-verdict", cast: state.cast, messageId,
      holyVerdict: { version: 1, ticket: receipt.id,
      cast: state.cast, casterUuid: state.casterUuid } } } };
}

function hasMending(actor, exceptTicket = null) {
  return [...actor?.effects ?? []].some(effect => liveEffect(effect)
    && effect.flags?.[NS]?.holyMending?.expiresAt > game.time.worldTime
    && effect.flags[NS].holyMending.ticket !== exceptTicket);
}

export async function holyQueryHandler(data = {}, { user } = {}) {
  if (!gmHere() || !user?.id) return refused("authority");
  if (["claim", "finish", "jump", "recover", "verdictPrepare", "verdictAttempt", "verdictRelease"].includes(data.phase)) {
    return serialized(data.ticket, () => {
      if (data.phase === "claim") return claim(data, user);
      if (data.phase === "finish") return finish(data, user);
      if (data.phase === "jump") return jump(data, user);
      if (data.phase === "recover") return recover(data, user);
      if (data.phase === "verdictPrepare") return verdictPrepare(data, user);
      if (data.phase === "verdictRelease") return verdictRelease(data, user);
      return verdictAttempt(data, user);
    });
  }
  if (data.phase === "damage") return damage(data, user);
  if (data.phase === "jumpCandidates") {
    const receipt = game.messages.get(data.ticket);
    return jumpCandidates({ ...stateOf(receipt), receiptId: receipt?.id }, user);
  }
  if (data.phase === "verdictDamage") {
    const card = game.messages.get(data.messageId), ticket = card?.flags?.[NS]?.verdictTicket;
    if (!ref(ticket)) return refused("card");
    return serialized(ticket, () => verdictDamage(data, user, card, ticket));
  }
  if (data.phase === "verdictRecover") {
    const card = game.messages.get(data.messageId), ticket = card?.flags?.[NS]?.verdictTicket;
    if (!ref(ticket)) return refused("card");
    return serialized(ticket, () => verdictRecover(data, user, card, ticket));
  }
  if (data.phase !== "prepare") return refused("phase");
  const ctx = context(data, user);
  if (!ctx.ok) return ctx;
  let consentUserId = null;
  if (ctx.definition.identifier === "prayer-of-mending") {
    if (hasMending(ctx.recipient)) return refused("stack");
    const review = await utilityDialog({ title: ctx.spell.name, note: words("MendingReview"), fields: [
      { name: "eligible", type: "checkbox", label: words("Ally") },
      ...(!ctx.measured ? [{ name: "reach", type: "checkbox", label: words("Reach") }] : [])
    ] });
    if (!review?.eligible || (!ctx.measured && !review.reach)) return refused("cancelled");
    const agreed = await consent(ctx.recipient, ctx.actor, ctx.spell);
    if (!agreed) return refused("declined");
    consentUserId = agreed.userId;
  }
  const fresh = context(data, user);
  if (!fresh.ok || fresh.recipient.uuid !== ctx.recipient.uuid || (ctx.definition.identifier === "prayer-of-mending" && hasMending(fresh.recipient))) return refused("changed");
  const state = { version: 1, status: "prepared", userId: user.id, wallExpires: Date.now() + 600000,
    identifier: ctx.definition.identifier, actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid,
    source: refOf(data.source), targets: data.targets.map(refOf), recipientUuid: ctx.recipient.uuid,
    consentUserId,
    effectId: foundry.utils.randomID(), resultId: foundry.utils.randomID() };
  const receipt = await ChatMessage.create({ whisper: [...game.users].filter(who => who.isGM).map(who => who.id),
    content: textContent(ctx.spell.name), flags: { [NS]: { holyReceipt: state } } });
  return { ok: true, ticket: receipt.id };
}

async function claim(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.userId !== user.id || state.status !== "prepared" || state.claimCast
    || !ref(data.cast) || Date.now() > state.wallExpires) return refused("ticket");
  const ctx = context(state, user);
  if (!ctx.ok || ctx.recipient.uuid !== state.recipientUuid
    || (state.identifier === "prayer-of-mending" && (hasMending(ctx.recipient)
      || !ctx.recipient.testUserPermission(game.users.get(state.consentUserId), "OWNER")))) return refused("changed");
  const holyTiming = state.identifier === "gentle-verdict" ? untilEndOfNextTurnOrRound(ctx.actor) : null;
  const claimTime = game.time.worldTime;
  await write(receipt, { ...state, claimCast: data.cast, claimTime, holyTiming });
  return { ok: true, holyTiming };
}

async function finish(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || (state.userId !== user.id && !user.isGM) || !state.claimCast) return refused("ticket");
  const card = game.messages.get(data.messageId), flags = card?.flags?.[NS];
  if (!card || card.author?.id !== state.userId || flags?.kind !== "spell" || flags.holyTicket !== receipt.id
    || flags.caster !== state.actorUuid || flags.spellUuid !== state.spellUuid || flags.identifier !== state.identifier
    || flags.cast !== state.claimCast || !same(refOf(flags.source), state.source)
    || !same((flags.targets ?? []).map(refOf), state.targets)) return refused("card");
  if (state.cardId && state.cardId !== card.id) return refused("alreadyBound");
  if (state.status === "complete" || state.status === "failed") return { ok: true, complete: state.status === "complete" };
  if (flags.success !== true) {
    await write(receipt, { ...state, cardId: card.id, status: "failed" });
    return { ok: true, complete: false };
  }
  const ctx = context(state, user);
  if (!ctx.ok || ctx.recipient.uuid !== state.recipientUuid) return refused("changed");
  if (state.identifier === "prayer-of-mending" && (hasMending(ctx.recipient, receipt.id)
    || !ctx.recipient.testUserPermission(game.users.get(state.consentUserId), "OWNER"))) return refused("changed");
  let record = state.record;
  if (!record) {
    const made = state.identifier === "prayer-of-mending"
      ? startMending({ cast: state.claimCast, casterUuid: state.actorUuid, holderUuid: state.recipientUuid,
        now: state.claimTime, alreadyHeld: hasMending(ctx.recipient, receipt.id) })
      : startVerdict({ cast: state.claimCast, casterUuid: state.actorUuid, timing: state.holyTiming });
    if (!made.ok) return made;
    record = made.value;
    await write(receipt, { ...state, record, cardId: card.id, status: "writing" });
  }
  const existing = ctx.recipient.effects.get(state.effectId);
  if (state.status === "writing" && !existing) return refused("effectUnresolved");
  if (!existing) {
    const source = state.identifier === "prayer-of-mending"
      ? mendingEffect(record, receipt, ctx.spell, state.effectId, card.id)
      : verdictEffect(record, receipt, ctx.spell, state.effectId, card.id);
    await ctx.recipient.createEmbeddedDocuments("ActiveEffect", [source], { keepId: true });
  }
  const landed = ctx.recipient.effects.get(state.effectId);
  const marker = state.identifier === "prayer-of-mending" ? landed?.flags?.[NS]?.holyMending : landed?.flags?.[NS]?.holyVerdict;
  if (!landed || landed.origin !== ctx.spell.uuid || marker?.ticket !== receipt.id || marker?.cast !== record.cast
    || landed.flags?.[NS]?.messageId !== card.id) return refused("effectMismatch");
  if (!game.messages.get(state.resultId)) await ChatMessage.create({ _id: state.resultId,
    whisper: privateUsers(ctx.actor), speaker: ChatMessage.getSpeaker({ actor: ctx.actor }),
    content: textContent(ctx.spell.name), flags: { [NS]: { holyResult: { ticket: receipt.id, cardId: card.id } } }
  }, { keepId: true });
  await write(receipt, { ...state, record, cardId: card.id, status: "complete" });
  return { ok: true, complete: true };
}

async function damage(data, user) {
  const target = resolve(data.targetUuid), held = mendingFor(target);
  if (!target || !held || (!user.isGM && !target.testUserPermission(user, "OWNER"))) return refused("holder");
  return serialized(held.ticket, () => damageHere(data, user, target, held));
}

async function damageHere(data, user, target, held) {
  const receipt = game.messages.get(held.ticket), state = stateOf(receipt);
  if (!state || state.status !== "complete" || state.identifier !== "prayer-of-mending"
    || state.record?.status !== "active" || state.record.holderUuid !== target.uuid
    || state.record.cast !== held.cast || !ref(data.eventId)
    || state.pendingDamage
    || !Number.isSafeInteger(data.healthBefore) || !Number.isSafeInteger(data.healthAfter)
    || target.system?.health?.value !== data.healthAfter
    || (!user.isGM && !ref(data.sourceMessageId))) return refused("event");
  const source = ref(data.sourceMessageId) ? game.messages.get(data.sourceMessageId) : null;
  if (data.sourceMessageId && !source) return refused("source");
  const review = await utilityDialog({ title: words("MendingDamage"),
    note: `${target.name}: ${data.healthBefore} → ${data.healthAfter}${source ? ` (${source.id})` : ""}`,
    fields: [{ name: "hostile", type: "checkbox", label: words("Hostile") }] });
  const planned = mendingOnDamage(state.record, { eventId: data.eventId, holderUuid: target.uuid,
    healthBefore: data.healthBefore, healthAfter: data.healthAfter, hostile: review?.hostile === true,
    now: game.time.worldTime });
  if (!planned.ok || !planned.triggered) return planned.ok ? { ok: true, triggered: false } : planned;
  // Claim the event durably before applying healing. An ambiguous write never
  // runs a second heal automatically; only a GM can reconcile it.
  const pendingDamage = { eventId: data.eventId, holderUuid: target.uuid, sourceMessageId: data.sourceMessageId ?? null,
    status: "healing", heal: planned.heal, nextState: planned.state };
  await write(receipt, { ...state, pendingDamage });
  const effect = target.effects.get(state.effectId);
  if (!effect) return refused("effectUnresolved");
  await effect.update({ [`flags.${NS}.holyMending`]: {
    ...effect.flags[NS].holyMending, charges: planned.state.charges, pending: true
  } });
  const outcome = {};
  const caster = resolve(state.actorUuid);
  await target.applyHealing(planned.heal, { from: caster, spell: true, outcome });
  if (outcome.complete !== true) return refused("healingUncertain");
  await write(receipt, { ...state, record: planned.state,
    pendingDamage: { ...pendingDamage, status: "delivered", restored: outcome.restored ?? 0 } });
  if (planned.state.status === "ended") {
    await target.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
    await write(receipt, { ...state, record: planned.state, pendingDamage: null });
  }
  return { ok: true, triggered: true, restored: outcome.restored ?? 0,
    needsJump: planned.state.status === "choosing", ticket: receipt.id };
}

async function recover(data, user) {
  if (!user.isGM || user.id !== game.users.activeGM?.id || typeof data.healingLanded !== "boolean") return refused("authority");
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt), pending = state?.pendingDamage;
  if (!state || state.identifier !== "prayer-of-mending" || state.status !== "complete"
    || !pending || !["healing", "retrying"].includes(pending.status)) return refused("ticket");
  const target = resolve(pending.holderUuid), caster = resolve(state.actorUuid);
  if (!target || !caster) return refused("holder");
  if (!data.healingLanded) {
    await write(receipt, { ...state, pendingDamage: { ...pending, status: "retrying" } });
    const outcome = {};
    await target.applyHealing(pending.heal, { from: caster, spell: true, outcome });
    if (outcome.complete !== true) return refused("healingUncertain");
    pending.restored = outcome.restored ?? 0;
  }
  const advanced = { ...state, record: pending.nextState,
    pendingDamage: { ...pending, status: "delivered", restored: pending.restored ?? null } };
  await write(receipt, advanced);
  if (pending.nextState.status === "ended") {
    await target.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
    await write(receipt, { ...advanced, pendingDamage: null });
  }
  return { ok: true, recovered: true, needsJump: pending.nextState.status === "choosing" };
}

async function jump(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "complete" || state.identifier !== "prayer-of-mending"
    || state.record?.status !== "choosing" || state.pendingDamage?.status !== "delivered"
    || (state.userId !== user.id && !user.isGM)) return refused("ticket");
  const old = resolve(state.pendingDamage.holderUuid);
  if (!old) return refused("holder");
  if (state.jump) {
    const target = resolve(state.jump.targetUuid);
    if (!target || state.jump.status !== "writing" || !target.effects.get(state.jump.effectId)) return refused("effectUnresolved");
    await old.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
    await write(receipt, { ...state, record: state.jump.nextState, effectId: state.jump.effectId,
      pendingDamage: null, jump: null });
    return { ok: true, jumped: true, holderUuid: target.uuid };
  }
  const refs = data.targets;
  if (!Array.isArray(refs) || refs.length > 1) return refused("targets");
  const target = refs.length ? targetOf(refs[0]) : null;
  if (refs.length && (!target || (refs[0].actorId && target.id !== refs[0].actorId))) return refused("targets");
  const sourceToken = tokenAt(data.source), targetToken = tokenAt(refs[0]);
  if (data.source?.tokenId && sourceToken?.actor?.uuid !== old.uuid) return refused("source");
  if (sourceToken && targetToken && sourceToken.parent?.id !== targetToken.parent?.id) return refused("range");
  let distanceFt = null;
  if (sourceToken && targetToken && sourceToken.parent?.id === targetToken.parent?.id) distanceFt = feetApart(sourceToken, targetToken);
  if (target) {
    if (hasMending(target, receipt.id)) return refused("stack");
    const review = await utilityDialog({ title: words("MendingJump"), note: target.name,
      fields: [{ name: "eligible", type: "checkbox", label: words("Ally") },
        ...(distanceFt === null ? [{ name: "reach", type: "checkbox", label: words("Reach") }] : [])] });
    if (!review?.eligible || (distanceFt === null && !review.reach)) return refused("cancelled");
    if (!await consent(target, resolve(state.actorUuid), resolve(state.spellUuid))) return refused("declined");
    if (targetOf(refs[0])?.uuid !== target.uuid || hasMending(target, receipt.id)) return refused("changed");
    if (sourceToken && targetToken && (sourceToken.parent?.id !== targetToken.parent?.id
      || !Number.isFinite(feetApart(sourceToken, targetToken)) || feetApart(sourceToken, targetToken) > 15)) return refused("range");
  }
  const advanced = mendingJump(state.record, { targetUuid: target?.uuid ?? null, willing: Boolean(target),
    distanceFt: distanceFt ?? 15, alreadyHeld: target ? hasMending(target, receipt.id) : false,
    now: game.time.worldTime });
  if (!advanced.ok) return advanced;
  if (!target) {
    await old.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
    await write(receipt, { ...state, record: advanced.value, pendingDamage: null });
    return { ok: true, ended: true };
  }
  const jumpState = { targetUuid: target.uuid, effectId: foundry.utils.randomID(), status: "writing", nextState: advanced.value };
  await write(receipt, { ...state, jump: jumpState });
  const existing = target.effects.get(jumpState.effectId);
  if (!existing) await target.createEmbeddedDocuments("ActiveEffect", [mendingEffect(advanced.value, receipt,
    resolve(state.spellUuid), jumpState.effectId, state.cardId)], { keepId: true });
  await old.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
  await write(receipt, { ...state, record: advanced.value, effectId: jumpState.effectId,
    pendingDamage: null, jump: null });
  return { ok: true, jumped: true, holderUuid: target.uuid };
}

function verdictSource(state, data, user) {
  const actor = resolve(state.actorUuid), effect = actor?.effects.get(state.effectId);
  const spell = resolve(data.spellUuid);
  const target = Array.isArray(data.targets) && data.targets.length === 1 ? targetOf(data.targets[0]) : null;
  const living = target?.type === "character" || (target?.type === "npc"
    && !["undead", "demon", "construct"].includes(target.system?.creatureType));
  if (!actor || !effect || !liveEffect(effect) || !actor.testUserPermission(user, "OWNER")
    || !spell || spell.type !== "spell" || spell.actor?.uuid !== actor.uuid || spell.system?.school !== "holy"
    || !castDealsDamage(spell.system) || areaFor(spell.system?.target ?? "") || !target || !living) return null;
  return { actor, effect, spell, target };
}

async function verdictPrepare(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "complete" || state.identifier !== "gentle-verdict"
    || state.userId !== user.id || state.record?.status !== "ready" || !ref(data.attemptId)
    || data.actorUuid !== state.actorUuid) return refused("ticket");
  if (state.pendingAttempt && Date.now() <= state.pendingAttempt.wallExpires) {
    return state.pendingAttempt.attemptId === data.attemptId ? { ok: true, ticket: receipt.id } : refused("pending");
  }
  const source = verdictSource(state, data, user);
  if (!source) return null;
  const review = await utilityDialog({ title: words("VerdictReview"), note: source.spell.name,
    fields: [{ name: "noDestroy", type: "checkbox", label: words("NoDestroy") }] });
  if (!review) return refused("cancelled");
  const fresh = verdictSource(state, data, user);
  if (!fresh || fresh.target.uuid !== source.target.uuid || fresh.spell.uuid !== source.spell.uuid) return refused("changed");
  const pendingAttempt = { attemptId: data.attemptId, spellUuid: source.spell.uuid,
    targetUuid: source.target.uuid, targets: data.targets.map(refOf),
    noDestroy: review.noDestroy === true, wallExpires: Date.now() + 600000 };
  await write(receipt, { ...state, pendingAttempt });
  return { ok: true, ticket: receipt.id };
}

async function verdictRelease(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.identifier !== "gentle-verdict" || state.userId !== user.id
    || state.record?.status !== "ready" || state.pendingAttempt?.attemptId !== data.attemptId) return refused("ticket");
  await write(receipt, { ...state, pendingAttempt: null });
  return { ok: true, released: true };
}

async function verdictAttempt(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt), pending = state?.pendingAttempt;
  if (!state || state.status !== "complete" || state.identifier !== "gentle-verdict"
    || state.userId !== user.id || state.record?.status !== "ready"
    || !pending || pending.attemptId !== data.attemptId || Date.now() > pending.wallExpires) return refused("ticket");
  const source = verdictSource(state, pending, user);
  if (!source || source.target.uuid !== pending.targetUuid || source.spell.uuid !== pending.spellUuid) return refused("changed");
  const attempted = verdictOnAttempt(state.record, { attemptId: pending.attemptId, casterUuid: source.actor.uuid,
    sourceKind: "spell", school: source.spell.system.school, damaging: true,
    direct: true, area: false, ongoing: false, weapon: false, explicitDestroy: !pending.noDestroy,
    targetKind: "living", targetCount: 1, active: liveEffect(source.effect) });
  if (!attempted.ok || !attempted.consumed) return attempted;
  await write(receipt, { ...state, record: attempted.state, pendingAttempt: null,
    verdictGrant: attempted.grant, verdictTargetUuid: source.target.uuid, verdictSpellUuid: source.spell.uuid });
  await source.actor.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
  return { ok: true, consumed: true, grant: attempted.grant };
}

async function verdictDamage(data, user, card, ticket) {
  const receipt = game.messages.get(ticket), state = stateOf(receipt), flags = card?.flags?.[NS];
  const target = resolve(data.targetUuid), grant = state?.verdictGrant;
  if (!state || state.identifier !== "gentle-verdict" || state.record?.status !== "spent"
    || !grant || state.resolvedDamage || !target
    || (state.userId !== user.id && !user.isGM && !target.testUserPermission(user, "OWNER"))
    || card.author?.id !== state.userId || flags.kind !== "spell" || flags.success !== true
    || flags.cast !== grant.attemptId || flags.caster !== state.actorUuid
    || flags.spellUuid !== state.verdictSpellUuid || state.verdictTargetUuid !== target.uuid
    || !Array.isArray(flags.targets) || flags.targets.length !== 1
    || targetOf(flags.targets[0])?.uuid !== target.uuid
    || !Number.isSafeInteger(data.healthBefore) || !Number.isSafeInteger(data.healthAfter)
    || target.system?.health?.value !== data.healthAfter) return refused("damage");
  const consequence = verdictConsequence(grant, { attemptId: flags.cast, hit: true,
    healthBefore: data.healthBefore, healthAfter: data.healthAfter });
  if (!consequence.ok) return consequence;
  await write(receipt, { ...state, resolvedDamage: { messageId: card.id, targetUuid: target.uuid } });
  return consequence;
}

function verdictPendingEntries(target) {
  const stored = target?.flags?.[NS]?.verdictDamagePending;
  return Array.isArray(stored) ? stored : stored ? [stored] : [];
}

function verdictResolutionEntries(target) {
  const stored = target?.flags?.[NS]?.verdictDamageResolution;
  return Array.isArray(stored) ? stored : stored ? [stored] : [];
}

async function clearVerdictPending(target, messageId) {
  const rest = verdictPendingEntries(target).filter(entry => entry?.messageId !== messageId);
  if (rest.length) await target.setFlag(NS, "verdictDamagePending", rest);
  else await target.unsetFlag(NS, "verdictDamagePending");
}

/** Reconcile the committed blow, never apply its damage or roll a delayed injury. */
async function verdictRecover(data, user, card, ticket) {
  if (!user.isGM || user.id !== game.users.activeGM?.id) return refused("authority");
  const target = resolve(data.targetUuid), flags = card?.flags?.[NS];
  if (target?.documentName !== "Actor" || flags?.verdictTicket !== ticket
    || !Array.isArray(flags.targets) || flags.targets.length !== 1
    || targetOf(flags.targets[0])?.uuid !== target.uuid) return refused("target");
  const pending = verdictPendingEntries(target).find(entry => entry?.messageId === card.id);
  const prior = verdictResolutionEntries(target).find(entry => entry?.messageId === card.id);
  if (!pending) return prior?.messageId === card.id && prior?.ticket === ticket
    ? { ok: true, complete: true, outcome: prior.outcome } : refused("pending");
  if (pending.messageId !== card.id || pending.ticket !== ticket
    || !Number.isSafeInteger(pending.healthBefore) || !Number.isSafeInteger(pending.healthAfter)) return refused("pending");
  if (prior?.messageId === card.id && prior?.ticket === ticket) {
    await clearVerdictPending(target, card.id);
    return { ok: true, complete: true, outcome: prior.outcome };
  }
  const receipt = game.messages.get(ticket), state = stateOf(receipt), grant = state?.verdictGrant;
  const bound = state?.identifier === "gentle-verdict" && state.record?.status === "spent"
    && grant && card.author?.id === state.userId && flags.kind === "spell" && flags.success === true
    && flags.cast === grant.attemptId && flags.caster === state.actorUuid
    && flags.spellUuid === state.verdictSpellUuid && state.verdictTargetUuid === target.uuid
    && (!state.resolvedDamage || (state.resolvedDamage.messageId === card.id
      && state.resolvedDamage.targetUuid === target.uuid));
  const consequence = bound ? verdictConsequence(grant, { attemptId: flags.cast, hit: true,
    healthBefore: pending.healthBefore, healthAfter: pending.healthAfter }) : null;
  const protectedBlow = consequence?.ok === true && consequence.suppressNewCriticalInjury === true;
  if (data.outcome === "protected") {
    if (!protectedBlow) return refused("grant");
    if (!state.resolvedDamage) await write(receipt, { ...state,
      resolvedDamage: { messageId: card.id, targetUuid: target.uuid } });
    if (consequence.stabilizeAtZero && target.system?.health?.value === 0) {
      await target.setFlag(NS, "stabilized", true);
    }
  } else if (data.outcome === "handled") {
    if (protectedBlow || data.handled !== true) return refused("review");
  } else return refused("outcome");
  const outcome = data.outcome;
  await target.setFlag(NS, "verdictDamageResolution", [
    ...verdictResolutionEntries(target).filter(entry => entry?.messageId !== card.id),
    { ticket, messageId: card.id, outcome }
  ]);
  await clearVerdictPending(target, card.id);
  return { ok: true, complete: true, outcome };
}

/** A card can retry the same finish, but never spend the same Holy cast twice. */
export function registerHolyCardHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message.flags?.[NS];
    const receipt = flags?.holyReceipt;
    const mount = html.querySelector(".azeroth-card") ?? html.querySelector(".message-content") ?? html;
    if (receipt?.identifier === "prayer-of-mending" && ["healing", "retrying"].includes(receipt.pendingDamage?.status)
      && game.user.isGM) {
      const recoverButton = document.createElement("button");
      recoverButton.type = "button";
      recoverButton.textContent = words("MendingRecovery");
      recoverButton.addEventListener("click", async () => {
        const picked = await utilityDialog({ title: words("MendingRecovery"), note: words("RecoveryCheck"),
          fields: [{ name: "outcome", label: words("RecoveryOutcome"), options: [
            { value: "landed", label: words("HealingLanded") },
            { value: "notLanded", label: words("HealingNotLanded") }
          ] }] });
        if (!picked) return;
        recoverButton.disabled = true;
        try {
          const result = await recoverMendingDamage({ ticket: message.id, healingLanded: picked.outcome === "landed" });
          if (!result?.ok) ui.notifications?.warn(words("AfterFailed"));
        } finally { recoverButton.disabled = false; }
      });
      mount.append(recoverButton);
    }
    if (flags?.verdictTicket && game.user.isGM && Array.isArray(flags.targets) && flags.targets.length === 1) {
      const target = targetOf(flags.targets[0]);
      const pending = verdictPendingEntries(target).find(entry => entry?.messageId === message.id);
      if (pending?.messageId === message.id && pending.ticket === flags.verdictTicket) {
        const recoverButton = document.createElement("button");
        recoverButton.type = "button";
        recoverButton.textContent = words("VerdictRecovery");
        recoverButton.addEventListener("click", async () => {
          const picked = await utilityDialog({ title: words("VerdictRecovery"), note: words("VerdictRecoveryCheck"),
            fields: [{ name: "outcome", label: words("VerdictRecoveryOutcome"), options: [
              { value: "protected", label: words("VerdictProtected") },
              { value: "handled", label: words("VerdictInjuriesHandled") }
            ] }, { name: "handled", type: "checkbox", label: words("VerdictHandledConfirm") }] });
          if (!picked) return;
          recoverButton.disabled = true;
          try {
            const result = await recoverVerdictDamage({ messageId: message.id, targetUuid: target.uuid,
              outcome: picked.outcome, handled: picked.handled === true });
            if (!result?.ok) ui.notifications?.warn(words("AfterFailed"));
          } finally { recoverButton.disabled = false; }
        });
        mount.append(recoverButton);
      }
    }
    if (!flags?.holyTicket || flags.success !== true || !(game.user.isGM || message.author?.id === game.user.id)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = words("Resolve");
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await finishHolyCast(flags.holyTicket, message.id);
        if (!result?.ok) ui.notifications?.warn(words("AfterFailed"));
      } finally { button.disabled = false; }
    });
    mount.append(button);
    if (flags.identifier === "prayer-of-mending") {
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.textContent = words("MendingJump");
      jumpButton.addEventListener("click", async () => {
        jumpButton.disabled = true;
        try {
          const result = await chooseMendingTarget(flags.holyTicket);
          if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(words("JumpUnavailable"));
        } finally { jumpButton.disabled = false; }
      });
      mount.append(jumpButton);
    }
  });
}
