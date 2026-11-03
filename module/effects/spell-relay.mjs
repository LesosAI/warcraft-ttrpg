/** Spell Relay's GM-owned setup and one-use attempt receipts. */
import {attemptSpellRelay, createSpellRelay, relaySpellRefusal} from "../rules/spell-relay.mjs";
import {areaFor, lengthenArea, widenArea} from "../rules/areas.mjs";
import {spellAreaFor} from "../rules/talent-effects.mjs";
import {feetToPoint} from "../canvas/footprints.mjs";
import {pickFacing, pickPoint} from "../canvas/place.mjs";
import {untilEndOfNextTurnOrRound} from "./durations.mjs";
import {utilityDialog} from "../applications/thematic-utility-dialog.mjs";

export const SPELL_RELAY_QUERY = "azeroth-rpg.spellRelay";
const NS = "azeroth-rpg";
const jobs = new Map();
const rejected = reason => ({ok: false, reason});
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const stateOf = (message, flag = "spellRelayReceipt") => message?.flags?.[NS]?.[flag];
const write = (message, flag, state) => message.update({[`flags.${NS}.${flag}`]: foundry.data.operators.ForcedReplacement.create(state)});
const effectsOf = actor => actor?.effects?.contents ?? [...(actor?.effects?.values?.() ?? actor?.effects ?? [])];
const tokenAt = ref => ref?.sceneId && ref?.tokenId ? game.scenes?.get(ref.sceneId)?.tokens.get(ref.tokenId) ?? null : null;
const privateUsers = actor => [...game.users].filter(user => user.isGM || actor.testUserPermission(user, "OWNER")).map(user => user.id);
const text = value => `<p>${foundry.utils.escapeHTML(value)}</p>`;
const refOf = token => {
  if (token?.sceneId && token?.tokenId) return {sceneId: token.sceneId, tokenId: token.tokenId, actorId: token.actorId ?? null};
  const doc = token?.document ?? token;
  const sceneId = doc?.parent?.id ?? doc?.scene?.id ?? null;
  const tokenId = doc?.id ?? token?.id ?? null;
  const actor = doc?.actor ?? token?.actor ?? null;
  return {sceneId, tokenId, actorId: actor?.id ?? null};
};
const validSource = (ref, actor) => {
  const token = tokenAt(ref);
  return token && actor?.uuid && token.actor?.uuid === actor.uuid ? token : null;
};

async function serialized(key, work) {
  const prior = jobs.get(key) ?? Promise.resolve();
  const current = prior.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(payload) {
  if (gmHere()) return thematicSpellRelayQueryHandler(payload, {user: game.user});
  const gm = game.users?.activeGM;
  if (!gm) return rejected("noGM");
  try { return await gm.query(SPELL_RELAY_QUERY, payload, {timeout: 300000}); }
  catch { return rejected("unanswered"); }
}

function relayReceipts(actor) {
  return [...(game.messages?.contents ?? [])].filter(message => {
    const state = stateOf(message);
    return state?.version === 1 && state.status === "active" && state.actorUuid === actor.uuid;
  }).sort((a, b) => (stateOf(b)?.armedAt ?? 0) - (stateOf(a)?.armedAt ?? 0));
}

/** Prepare a Relay cast: choose a point locally, then have the GM review and record it. */
export async function prepareSpellRelay({actor, spell, source, targets = []} = {}) {
  if (spell?.system?.identifier !== "spell-relay") return null;
  if (!actor?.uuid || !actor.testUserPermission(game.user, "OWNER") || spell.actor?.uuid !== actor.uuid) return rejected("owner");
  const sourceRef = refOf(source);
  const sourceToken = validSource(sourceRef, actor);
  if (!sourceToken || sourceRef.sceneId !== canvas?.scene?.id) return rejected("source");
  const origin = await pickPoint({hint: "Choose a visible point for Spell Relay", sceneId: sourceRef.sceneId});
  if (!point(origin)) return rejected("cancelled");
  const distanceFt = feetToPoint(sourceToken, origin);
  if (!Number.isFinite(distanceFt) || distanceFt < 0 || distanceFt > 30) return rejected("range");
  const prepared = await request({phase: "setupPrepare", actorUuid: actor.uuid, spellUuid: spell.uuid,
    source: sourceRef, targets: targets.map(refOf), origin: {x: origin.x, y: origin.y}, sceneId: sourceRef.sceneId});
  return prepared;
}

/** Claim the setup cast after its payment/action reservation, before its Test. */
export async function claimSpellRelaySetup(ticket, cast) {
  return request({phase: "setupClaim", ticket, cast});
}

/** Bind the setup receipt to its exact successful or failed casting card. */
export async function finishSpellRelaySetup(ticket, messageId) {
  return request({phase: "setupFinish", ticket, messageId});
}

/** Review a prospective relay before paying. The returned geometry is immutable. */
export async function prepareRelayAttempt({actor, spell, source, targets = [], area = null,
  viaItem = false, summons = false, teleports = false} = {}) {
  if (!actor?.uuid || !spell || spell.type !== "spell" || spell.actor?.uuid !== actor.uuid) return null;
  const refusal = relaySpellRefusal(spell, {viaItem, summons, teleports});
  if (refusal) return null;
  if (!actor.testUserPermission(game.user, "OWNER")) return rejected("owner");
  const receipt = relayReceipts(actor)[0];
  if (!receipt) return null;
  const record = stateOf(receipt);
  const carrier = actor.effects?.get?.(record.effectId);
  if (!carrier || carrier.disabled || carrier.isSuppressed) return null;
  const sourceRef = refOf(source), sourceToken = validSource(sourceRef, actor);
  if (!sourceToken || sourceRef.sceneId !== canvas?.scene?.id || record.sceneId !== sourceRef.sceneId) return rejected("source");
  const talentArea = spellAreaFor(actor.takenTalents?.() ?? [], {name: spell.name});
  const chosenArea = area ?? lengthenArea(widenArea(areaFor(spell.system?.target ?? ""), talentArea.widen), talentArea.lengthen);
  if (!chosenArea || !["cone", "line"].includes(chosenArea.shape)) return rejected("shape");
  if (area && !same(area, chosenArea)) return rejected("area");
  const rotation = await pickFacing({origin: record.origin, area: chosenArea, scene: canvas.scene, label: spell.name,
    color: globalThis.CONFIG?.AZEROTH?.schoolColors?.[spell.system?.school] ?? null});
  if (!Number.isFinite(rotation) || rotation < 0 || rotation >= 360) return rejected("cancelled");
  const attemptId = foundry.utils.randomID();
  return request({phase: "attemptPrepare", actorUuid: actor.uuid, spellUuid: spell.uuid,
    source: sourceRef, targets: targets.map(refOf), relayTicket: receipt.id, attemptId,
    sceneId: sourceRef.sceneId, area: chosenArea, rotation, viaItem, summons, teleports});
}

/** Consume only after action/Mana payment succeeded and immediately before Test. */
export async function claimRelayAttempt(ticket, cast) {
  return request({phase: "attemptClaim", ticket, cast});
}

/** Bind the spend to the exact cast card; the Relay stays spent if that Test fails. */
export async function finishRelayAttempt(ticket, messageId) {
  return request({phase: "attemptFinish", ticket, messageId});
}

function setupContext(data, user) {
  const actor = resolve(data.actorUuid), spell = resolve(data.spellUuid), sourceToken = validSource(data.source, actor);
  if (!actor || !actor.testUserPermission(user, "OWNER")) return rejected("owner");
  if (spell?.type !== "spell" || spell.system?.identifier !== "spell-relay" || spell.actor?.uuid !== actor.uuid) return rejected("spell");
  if (!sourceToken || sourceToken.parent?.id !== data.sceneId || !point(data.origin)
    || !Array.isArray(data.targets) || data.targets.length > 20) return rejected("source");
  const distanceFt = feetToPoint(sourceToken, data.origin);
  if (!Number.isFinite(distanceFt) || distanceFt < 0 || distanceFt > 30) return rejected("range");
  return {actor, spell, sourceToken, distanceFt};
}

function attemptContext(data, user, state) {
  const actor = resolve(data.actorUuid), spell = resolve(data.spellUuid), sourceToken = validSource(data.source, actor);
  if (!actor || !actor.testUserPermission(user, "OWNER")) return rejected("owner");
  if (spell?.type !== "spell" || spell.actor?.uuid !== actor.uuid) return rejected("spell");
  const refusal = relaySpellRefusal(spell, {viaItem: data.viaItem, summons: data.summons, teleports: data.teleports});
  if (refusal) return rejected(refusal);
  const talentArea = spellAreaFor(actor.takenTalents?.() ?? [], {name: spell.name});
  const authoredArea = lengthenArea(widenArea(areaFor(spell.system?.target ?? ""), talentArea.widen), talentArea.lengthen);
  if (!sourceToken || sourceToken.parent?.id !== data.sceneId || state.actorUuid !== actor.uuid
    || state.sceneId !== data.sceneId || !point(state.origin) || !data.area || !same(data.area, authoredArea)
    || !["cone", "line"].includes(authoredArea?.shape) || !Number.isFinite(authoredArea?.distanceFt)
    || !Number.isFinite(data.rotation) || data.rotation < 0 || data.rotation >= 360
    || !Array.isArray(data.targets) || data.targets.length > 20) return rejected("source");
  const distanceFt = feetToPoint(sourceToken, state.origin);
  if (!Number.isFinite(distanceFt) || distanceFt < 0 || distanceFt > 30) return rejected("range");
  return {actor, spell, sourceToken, distanceFt, area: authoredArea};
}

async function reviewSetup(ctx, data) {
  return utilityDialog({title: ctx.spell.name,
    note: `Relay point (${Math.round(data.origin.x)}, ${Math.round(data.origin.y)}), ${ctx.distanceFt} ft from ${ctx.actor.name}. Confirm the point is visible to the caster.`,
    fields: [{name: "visible", type: "checkbox", label: "The caster can see this point."}]});
}

async function reviewAttempt(ctx, data) {
  return utilityDialog({title: ctx.spell.name,
    note: `Spell Relay at (${Math.round(data.relayOrigin.x)}, ${Math.round(data.relayOrigin.y)}); chosen ${data.area.shape}, ${data.area.distanceFt} ft, facing ${Math.round(data.rotation)}°. Confirm the caster can see the Relay and the entire chosen area.`,
    fields: [{name: "visibleRelay", type: "checkbox", label: "The caster can see the Relay."},
      {name: "visibleArea", type: "checkbox", label: "The caster can see the entire chosen area."}]});
}

async function cardFor(state, messageId, user, {phase, flag}) {
  const card = game.messages.get(messageId), flags = card?.flags?.[NS];
  if (!card || (card.author?.id !== state.userId && !user.isGM) || flags?.kind !== "spell"
    || flags[flag] !== state.ticket || flags.caster !== state.actorUuid || flags.spellUuid !== state.spellUuid
    || flags.cast !== state.claimCast || !same(refOf(flags.source), state.source)
    || !same((flags.targets ?? []).map(refOf), state.targets)) return null;
  if (phase === "setup" && flags.identifier !== "spell-relay") return null;
  return {card, flags};
}

/** GM-only handler; every point, range, caster, card and spend is rechecked here. */
export async function thematicSpellRelayQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id) return rejected("authority");
  if (data.phase === "setupPrepare") {
    const ctx = setupContext(data, user);
    if (ctx.reason) return ctx;
    const review = await reviewSetup(ctx, data);
    if (!review?.visible) return rejected("visibility");
    const state = {version: 1, kind: "setup", status: "prepared", userId: user.id,
      actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid, source: data.source, targets: data.targets,
      sceneId: data.sceneId, origin: data.origin, preparedAt: game.time.worldTime,
      wallExpires: Date.now() + 600000};
    const receipt = await ChatMessage.create({whisper: privateUsers(ctx.actor), content: text(`${ctx.spell.name}: Spell Relay point reviewed`),
      flags: {[NS]: {spellRelayReceipt: state}}});
    state.ticket = receipt.id;
    await write(receipt, "spellRelayReceipt", state);
    return {ok: true, ticket: receipt.id, origin: state.origin, sceneId: state.sceneId};
  }
  if (data.phase === "setupClaim") return serialized(data.ticket, async () => {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
    if (state?.kind === "setup" && state.status === "claimed" && state.userId === user.id && state.claimCast === data.cast) return {ok: true};
    if (!state || state.kind !== "setup" || state.status !== "prepared" || state.userId !== user.id
      || Date.now() > state.wallExpires || typeof data.cast !== "string" || !data.cast) return rejected("ticket");
    const ctx = setupContext(state, user);
    if (ctx.reason) return ctx;
    await write(receipt, "spellRelayReceipt", {...state, status: "claimed", cast: data.cast, claimCast: data.cast, claimedAt: game.time.worldTime});
    return {ok: true};
  });
  if (data.phase === "setupFinish") return serialized(data.ticket, async () => {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
    if (!state || state.kind !== "setup" || !["claimed", "active", "failed"].includes(state.status)
      || (state.userId !== user.id && !user.isGM)) return rejected("ticket");
    const bound = await cardFor({...state, ticket: receipt.id}, data.messageId, user, {phase: "setup", flag: "spellRelayTicket"});
    if (!bound) return rejected("card");
    if (state.messageId && state.messageId !== bound.card.id) return rejected("alreadyBound");
    if (state.status === "active" || state.status === "failed") return {ok: true, active: state.status === "active", effectId: state.effectId ?? null};
    if (bound.flags.success !== true) {
      await write(receipt, "spellRelayReceipt", {...state, status: "failed", messageId: bound.card.id});
      return {ok: true, active: false};
    }
    const ctx = setupContext(state, user);
    if (ctx.reason) return ctx;
    const timing = untilEndOfNextTurnOrRound(ctx.actor);
    if (!timing) return rejected("timing");
    const priorEffect = effectsOf(ctx.actor).find(effect => effect.flags?.[NS]?.spellRelayCarrier?.ticket === receipt.id) ?? null;
    const applying = {...state, status: "applying", messageId: bound.card.id, timing: state.timing ?? timing};
    await write(receipt, "spellRelayReceipt", applying);
    const effectData = {name: "Spell Relay", img: ctx.spell.img, origin: ctx.actor.uuid,
      description: "One eligible cone or line spell may originate at this recorded point.",
      system: {changes: []}, ...applying.timing,
      flags: {[NS]: {spellRelayCarrier: {ticket: receipt.id, cast: state.cast, origin: state.origin, sceneId: state.sceneId}}}};
    const effect = priorEffect ?? (await ctx.actor.createEmbeddedDocuments("ActiveEffect", [effectData]))[0];
    if (!effect?.id || !ctx.actor.effects.get(effect.id)) return rejected("effect");
    const activeState = {...applying, status: "active", effectId: effect.id, armedAt: game.time.worldTime};
    await write(receipt, "spellRelayReceipt", activeState);
    return {ok: true, active: true, effectId: effect.id, origin: activeState.origin, sceneId: activeState.sceneId};
  });
  if (data.phase === "attemptPrepare") {
    const setupReceipt = game.messages.get(data.relayTicket), setup = stateOf(setupReceipt);
    const ctx = setup && setup.status === "active" ? attemptContext(data, user, setup) : rejected("relay");
    if (ctx.reason) return ctx;
    const carrier = ctx.actor.effects.get(setup.effectId);
    if (!carrier || carrier.disabled || carrier.isSuppressed || carrier.flags?.[NS]?.spellRelayCarrier?.ticket !== setupReceipt.id) return rejected("expired");
    const lawRelay = createSpellRelay({cast: setup.cast, casterUuid: setup.actorUuid, sceneId: setup.sceneId, origin: setup.origin}).relay;
    const law = attemptSpellRelay({relay: lawRelay, spell: ctx.spell, attemptId: data.attemptId, casterUuid: ctx.actor.uuid,
      sceneId: data.sceneId, distanceFt: ctx.distanceFt, seesRelay: true, seesArea: true, active: true, area: data.area,
      viaItem: data.viaItem, summons: data.summons, teleports: data.teleports});
    if (!law.ok) return law;
    const review = await reviewAttempt(ctx, {...data, relayOrigin: setup.origin});
    if (!review?.visibleRelay || !review?.visibleArea) return rejected("visibility");
    const ticket = foundry.utils.randomID();
    const state = {version: 1, kind: "attempt", status: "prepared", ticket, userId: user.id,
      actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid, source: data.source, targets: data.targets,
      sceneId: data.sceneId, setupTicket: setupReceipt.id, attemptId: data.attemptId,
      area: law.geometry.area, rotation: data.rotation, geometry: {sceneId: data.sceneId,
        origin: {...setup.origin}, rotation: data.rotation, area: {...law.geometry.area}, attach: false},
      preparedAt: game.time.worldTime, wallExpires: Date.now() + 600000};
    const receipt = await ChatMessage.create({whisper: privateUsers(ctx.actor), content: text(`${ctx.spell.name}: Spell Relay placement reviewed`),
      flags: {[NS]: {spellRelayAttempt: state}}});
    state.ticket = receipt.id;
    await write(receipt, "spellRelayAttempt", state);
    return {ok: true, ticket: receipt.id, geometry: state.geometry, placementOverride: state.geometry};
  }
  if (data.phase === "attemptClaim") {
    const initial = stateOf(game.messages.get(data.ticket), "spellRelayAttempt");
    if (!initial?.setupTicket) return rejected("ticket");
    return serialized(initial.setupTicket, async () => {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt, "spellRelayAttempt");
    if (state?.status === "claimed" && state.claimCast === data.cast) return {ok: true, geometry: state.geometry, placementOverride: state.geometry};
    if (!state || state.kind !== "attempt" || state.status !== "prepared" || state.userId !== user.id
      || Date.now() > state.wallExpires || typeof data.cast !== "string" || !data.cast) return rejected("ticket");
    const actor = resolve(state.actorUuid), setupReceipt = game.messages.get(state.setupTicket), setup = stateOf(setupReceipt);
    const spell = resolve(state.spellUuid), sourceToken = validSource(state.source, actor);
    const refusal = relaySpellRefusal(spell);
    const alreadySpentHere = setup?.status === "spent" && setup.spentBy === state.attemptId && setup.attemptTicket === receipt.id;
    if (!actor?.testUserPermission(user, "OWNER") || !sourceToken || !setup
      || !(setup.status === "active" || alreadySpentHere)
      || setup.effectId == null || !actor.effects.get(setup.effectId) || (setup.spentBy && !alreadySpentHere)
      || refusal || spell?.actor?.uuid !== actor.uuid || !same(refOf(sourceToken), state.source)) return rejected("changed");
    const distanceFt = feetToPoint(sourceToken, setup.origin);
    if (!Number.isFinite(distanceFt) || distanceFt > 30) return rejected("range");
    // Commit the one-use spend before returning to the workflow to begin its Test.
    if (!alreadySpentHere) {
      await write(setupReceipt, "spellRelayReceipt", {...setup, status: "spent", spentBy: state.attemptId,
        spentAt: game.time.worldTime, attemptTicket: receipt.id});
      const fresh = stateOf(setupReceipt);
      if (fresh?.status !== "spent" || fresh.spentBy !== state.attemptId) return rejected("write");
    }
    const claimed = {...state, status: "claimed", claimCast: data.cast, claimedAt: game.time.worldTime};
    await write(receipt, "spellRelayAttempt", claimed);
    return {ok: true, geometry: claimed.geometry, placementOverride: claimed.geometry};
    });
  }
  if (data.phase === "attemptFinish") return serialized(data.ticket, async () => {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt, "spellRelayAttempt");
    if (!state || state.kind !== "attempt" || !["claimed", "complete", "failed"].includes(state.status)
      || (state.userId !== user.id && !user.isGM)) return rejected("ticket");
    const bound = await cardFor({...state, ticket: receipt.id}, data.messageId, user, {phase: "attempt", flag: "spellRelayAttemptTicket"});
    if (!bound) return rejected("card");
    if (state.messageId && state.messageId !== bound.card.id) return rejected("alreadyBound");
    if (["complete", "failed"].includes(state.status)) return {ok: true, completed: true, success: state.status === "complete"};
    const status = bound.flags.success === true ? "complete" : "failed";
    await write(receipt, "spellRelayAttempt", {...state, status, messageId: bound.card.id});
    return {ok: true, completed: true, success: status === "complete"};
  });
  return rejected("phase");
}

/** Add a card control for setup receipts; the cast workflow may also call finish directly. */
export function registerSpellRelayCardHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const state = message.flags?.[NS];
    if (!state?.spellRelayTicket || state.success !== true || !game.user?.isGM) return;
    const container = html.querySelector(".azeroth-card");
    if (!container || container.querySelector("[data-spell-relay-finish]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.spellRelayFinish = "true";
    button.textContent = "Activate Spell Relay";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await finishSpellRelaySetup(state.spellRelayTicket, message.id);
        if (!result?.ok) ui.notifications.warn("Spell Relay could not be activated.");
      } finally { button.disabled = false; }
    });
    container.append(button);
  });
}
