/** GM-owned Shadow receipts and private mental-channel delivery. */
import { CHANNEL_RULES, MENTAL_CHANNELS, SHADOW_SPELLS, channelDelivery,
  channelMessage, channelSenses, mindstaticActive, mindstaticEffectData,
  mindlinkBearing, mindlinkEffectActive, mindlinkEffectData, mindlinkShockRecipients,
  phantomActive, phantomChoice, phantomEffectData, phantomRepeatTest,
  startMentalChannel, startMindstatic, startPhantom } from "../rules/thematic-shadow.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";

export const SHADOW_QUERY = "azeroth-rpg.thematicShadow";
export const SHADOW_CONSENT = "azeroth-rpg.thematicShadowConsent";
const NS = "azeroth-rpg";
const jobs = new Map();
const no = reason => ({ ok: false, reason });
const ref = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tokenAt = value => game.scenes?.get(value?.sceneId)?.tokens.get(value?.tokenId) ?? null;
const actorAt = value => value?.tokenId ? tokenAt(value)?.actor : game.actors?.get(value?.actorId);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const refOf = value => value ? { sceneId: value.sceneId ?? null, tokenId: value.tokenId ?? null, actorId: value.actorId ?? null } : null;
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const stateOf = message => message?.flags?.[NS]?.shadowReceipt;
const write = (message, state) => message.update({ [`flags.${NS}.shadowReceipt`]: foundry.data.operators.ForcedReplacement.create(state) });
const words = key => game.i18n.localize(`AZEROTH.ThematicShadow.${key}`);
const content = value => `<p>${foundry.utils.escapeHTML(value)}</p>`;
const gmIds = () => [...game.users].filter(user => user.isGM).map(user => user.id);
const phantomAudio = Object.freeze({
  footsteps: "modules/psfx/library/creature/movement/footsteps/outdoors/001/footsteps-sequence-outdoors-001.ogg",
  knock: "modules/psfx/library/doors/clean/wooden/01/wooden-test-clean-01.ogg",
  "indistinct-whisper": "modules/psfx/library/1st-level-spells/dissonant-whispers/v1/001/dissonant-whispers-001-03.ogg"
});
const heardCues = new Set();
const phantomTimers = new Map();
const healthHeld = actor => {
  const value = actor?.system?.health?.value, temp = actor?.system?.health?.temp ?? 0;
  return Number.isSafeInteger(value) && Number.isSafeInteger(temp) && temp >= 0 ? value + temp : null;
};
const combatTurn = () => game.combat?.id && Number.isSafeInteger(game.combat.round) && Number.isSafeInteger(game.combat.turn)
  ? { combatId: game.combat.id, round: game.combat.round, turn: game.combat.turn } : null;
const sustainHeld = (actor, cast, identifier) => (actor?.getFlag?.(NS, "sustaining") ?? [])
  .some(row => row.cast === cast && row.identifier === identifier);
async function consentFor(member, caster, spell, label) {
  const { answererOf, ASK_MS } = await import("./blow-doors.mjs");
  const owner = answererOf(member);
  if (!owner) return false;
  const data = { memberUuid: member.uuid, casterUuid: caster.uuid, spellUuid: spell.uuid, label };
  try {
    const accepted = owner.id === game.user.id ? await shadowConsentHandler(data, { user: game.user })
      : await owner.query(SHADOW_CONSENT, data, { timeout: ASK_MS });
    return accepted === true && member.testUserPermission(owner, "OWNER");
  } catch { return false; }
}

export async function shadowConsentHandler(data, { user } = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const member = resolve(data.memberUuid), caster = resolve(data.casterUuid), spell = resolve(data.spellUuid);
  if (!member || !caster || spell?.system?.identifier !== data.label
    || !member.testUserPermission(game.user, "OWNER")) return false;
  const { confirmHere } = await import("./blow-doors.mjs");
  return confirmHere(member, { title: spell.name, text: words(data.label === "sending" ? "SendingConsent" : "MindlinkConsent") });
}
function tokenPoint(token) {
  const grid = token?.parent?.grid;
  if (!token || !grid?.size || !Number.isFinite(grid.distance)) return null;
  return { sceneId: token.parent.id, xFt: (token.x + token.width * grid.size / 2) * grid.distance / grid.size,
    yFt: (token.y + token.height * grid.size / 2) * grid.distance / grid.size };
}

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(data) {
  if (gmHere()) return shadowQueryHandler(data, { user: game.user });
  if (!game.users?.activeGM) return no("noGM");
  try { return await game.users.activeGM.query(SHADOW_QUERY, data, { timeout: 300000 }); }
  catch { return no("unanswered"); }
}

function castContext(data, user) {
  const actor = resolve(data.actorUuid), spell = resolve(data.spellUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return no("owner");
  const identifier = spell?.system?.identifier;
  if (spell?.type !== "spell" || !Object.hasOwn(SHADOW_SPELLS, identifier)
    || spell.actor && spell.actor.uuid !== actor.uuid) return no("spell");
  const source = tokenAt(data.source);
  if (data.source?.tokenId && (!source || source.actor?.uuid !== actor.uuid)) return no("source");
  if (identifier === "phantom-footsteps") {
    if (!Array.isArray(data.targets) || data.targets.length !== 1) return no("target");
    const target = actorAt(data.targets[0]), token = tokenAt(data.targets[0]);
    if (!target || data.targets[0]?.actorId && target.id !== data.targets[0].actorId) return no("target");
    if (source && token && (source.parent?.id !== token.parent?.id || feetApart(source, token) > 60)) return no("range");
    return { ok: true, actor, spell, identifier, target, source, token, measured: Boolean(source && token) };
  }
  if (data.targets?.length) return no("targets");
  if (!data.point || !ref(data.point.sceneId) || !Number.isFinite(data.point.xFt) || !Number.isFinite(data.point.yFt)) return no("point");
  return { ok: true, actor, spell, identifier, source, measured: false };
}

/** The caller supplies a measured canvas point. A GM confirms visible placement. */
export function prepareShadowCast({ actor, spell, source = null, targets = [], point = null,
  casterPoint = null, targetPoint = null } = {}) {
  if (!Object.hasOwn(SHADOW_SPELLS, spell?.system?.identifier)) return null;
  return request({ phase: "prepare", actorUuid: actor?.uuid, spellUuid: spell.uuid,
    source: refOf(source), targets: targets.map(refOf), point, casterPoint, targetPoint });
}

/** Pick a visible scene point before payment; all geometry uses scene feet. */
export async function prepareShadowCastWithPoint({ actor, spell, source = null, targets = [] } = {}) {
  if (!Object.hasOwn(SHADOW_SPELLS, spell?.system?.identifier)) return null;
  const scene = canvas?.scene, grid = scene?.grid;
  if (!scene || !grid?.size || !Number.isFinite(grid.distance) || grid.distance <= 0
    || source?.sceneId && source.sceneId !== scene.id) return no("scene");
  const sourceToken = tokenAt(source);
  if (source?.tokenId && !sourceToken || sourceToken && sourceToken.parent?.id !== scene.id) return no("scene");
  const targetToken = spell.system.identifier === "phantom-footsteps" ? tokenAt(targets[0]) : null;
  if (spell.system.identifier === "phantom-footsteps"
    && (!targetToken || targetToken.parent?.id !== scene.id)) return no("scene");
  const { pickPoint } = await import("../canvas/place.mjs");
  const chosen = await pickPoint({ sceneId: scene.id, hint: words("PickPoint"),
    accept: point => Number.isFinite(point?.x) && Number.isFinite(point?.y) });
  if (!chosen || canvas?.scene?.id !== scene.id) return no("cancelled");
  const point = { sceneId: scene.id, xFt: chosen.x * grid.distance / grid.size,
    yFt: chosen.y * grid.distance / grid.size };
  return prepareShadowCast({ actor, spell, source, targets, point,
    casterPoint: tokenPoint(sourceToken), targetPoint: tokenPoint(targetToken) });
}
export const claimShadowCast = (ticket, cast) => request({ phase: "claim", ticket, cast });
export const finishShadowCast = (ticket, messageId) => request({ phase: "finish", ticket, messageId });

function validateCard(receipt, state, card) {
  const flags = card?.flags?.[NS];
  return card && card.author?.id === state.userId && flags?.shadowTicket === receipt.id
    && flags.kind === "spell" && flags.identifier === state.identifier && flags.caster === state.actorUuid
    && flags.spellUuid === state.spellUuid && flags.cast === state.claimCast
    && same(refOf(flags.source), state.source) && same((flags.targets ?? []).map(refOf), state.targets);
}

export async function shadowQueryHandler(data = {}, { user } = {}) {
  if (!gmHere() || !user?.id) return no("authority");
  if (data.phase === "shock") {
    const actor = resolve(data.actorUuid);
    if (!actor || !actor.testUserPermission(user, "OWNER") || !ref(data.eventId)
      || !Number.isSafeInteger(data.before) || !Number.isSafeInteger(data.after)
      || data.after >= data.before || healthHeld(actor) !== data.after) return no("damage");
    const result = await mindlinkAfterDamage({ actor, before: data.before, after: data.after, eventId: data.eventId });
    return result.ok ? { ok: true } : no("shockUnresolved");
  }
  if (["claim", "finish", "repeat", "openChannel", "deliver", "leaveChannel", "members", "bearings", "recoverChannel", "recoverCue"].includes(data.phase))
    return serialized(data.ticket ?? data.messageId, () => shadowOperation(data, user));
  if (data.phase === "playback") {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt), target = resolve(state?.targetUuid);
    if (state?.identifier !== "phantom-footsteps" || !["complete", "cueing"].includes(state.status) || !target
      || !user.isGM && !target.testUserPermission(user, "OWNER")
      || !phantomActive(target.effects.get(state.effectId), target.uuid, game.time.worldTime)) return no("unavailable");
    return { ok: true, sound: state.record.sound, point: { ...state.record.point }, targetUuid: target.uuid };
  }
  if (data.phase !== "prepare") return no("phase");
  const ctx = castContext(data, user);
  if (!ctx.ok) return ctx;
  const phantom = ctx.identifier === "phantom-footsteps";
  const chosen = await utilityDialog({ title: ctx.spell.name, note: phantom ? words("PhantomReview") : words("StaticReview"),
    fields: phantom ? [
      { name: "sound", label: words("Sound"), options: SHADOW_SPELLS["phantom-footsteps"].sounds.map(value => ({ value, label: words(value) })) },
      { name: "minded", type: "checkbox", label: words("Minded") },
      { name: "visible", type: "checkbox", label: words("Visible") },
      ...(!ctx.measured ? [{ name: "range", type: "checkbox", label: words("Range") }] : [])
    ] : [{ name: "stationary", type: "checkbox", label: words("Stationary") },
      { name: "placement", type: "checkbox", label: words("Placement") }] });
  if (!chosen || phantom && (!chosen.minded || !chosen.visible || !ctx.measured && !chosen.range)
    || !phantom && (!chosen.stationary || !chosen.placement)) return no("cancelled");
  const casterPoint = tokenPoint(ctx.source) ?? data.casterPoint;
  const targetPoint = tokenPoint(ctx.token) ?? data.targetPoint;
  const choice = phantom ? phantomChoice({ sound: chosen.sound, point: data.point }, {
    caster: casterPoint, target: targetPoint, targetHasMind: true, pointVisibleToTarget: true
  }) : startMindstatic({ cast: "provisional", casterUuid: ctx.actor.uuid,
    area: { ...data.point, radiusFt: 15 } });
  if (!phantom && casterPoint && (casterPoint.sceneId !== data.point.sceneId
    || Math.hypot(casterPoint.xFt - data.point.xFt, casterPoint.yFt - data.point.yFt) > 30)) return no("range");
  if (!choice.ok) return choice;
  const fresh = castContext(data, user);
  if (!fresh.ok || fresh.target?.uuid !== ctx.target?.uuid) return no("changed");
  const state = { version: 1, status: "prepared", userId: user.id, wallExpires: Date.now() + 600000,
    identifier: ctx.identifier, actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid, point: data.point,
    source: refOf(data.source), targets: (data.targets ?? []).map(refOf), choice: choice.value,
    targetUuid: ctx.target?.uuid ?? null, effectId: foundry.utils.randomID(), cueMessageId: foundry.utils.randomID() };
  const receipt = await ChatMessage.create({ whisper: gmIds(), content: content(ctx.spell.name),
    flags: { [NS]: { shadowReceipt: state } } });
  return { ok: true, ticket: receipt.id };
}

async function shadowOperation(data, user) {
  if (data.phase === "openChannel") return openChannel(data, user);
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state) return no("ticket");
  if (data.phase === "claim") {
    if (state.userId !== user.id || state.status !== "prepared" || state.claimCast
      || !ref(data.cast) || Date.now() > state.wallExpires) return no("ticket");
    const ctx = castContext(state, user);
    if (!ctx.ok || (ctx.target?.uuid ?? null) !== state.targetUuid) return no("changed");
    if (state.identifier === "mindstatic" && tokenPoint(ctx.source)
      && (tokenPoint(ctx.source).sceneId !== state.point?.sceneId
        || Math.hypot(tokenPoint(ctx.source).xFt - state.point.xFt,
          tokenPoint(ctx.source).yFt - state.point.yFt) > 30)) return no("range");
    await write(receipt, { ...state, claimCast: data.cast, claimTime: game.time.worldTime });
    return { ok: true };
  }
  if (data.phase === "finish") return finish(receipt, state, data, user);
  if (data.phase === "repeat") return repeat(receipt, state, data, user);
  if (data.phase === "deliver") return deliver(receipt, state, data, user);
  if (data.phase === "leaveChannel") return leaveChannel(receipt, state, data, user);
  if (data.phase === "members") return channelMembers(state, user);
  if (data.phase === "bearings") return bearings(state, data, user);
  if (data.phase === "recoverChannel") return recoverChannel(receipt, state, user);
  if (data.phase === "recoverCue") return recoverCue(receipt, state, user);
  return no("phase");
}

async function finish(receipt, state, data, user) {
  if (state.userId !== user.id && !user.isGM || !state.claimCast) return no("ticket");
  const card = game.messages.get(data.messageId);
  if (!validateCard(receipt, state, card)) return no("card");
  if (state.cardId && state.cardId !== card.id) return no("bound");
  if (state.status === "complete" || state.status === "failed") return { ok: true, complete: state.status === "complete" };
  if (card.flags[NS].success !== true) {
    await write(receipt, { ...state, cardId: card.id, status: "failed" });
    return { ok: true, complete: false };
  }
  const ctx = castContext(state, user);
  if (!ctx.ok || (ctx.target?.uuid ?? null) !== state.targetUuid) return no("changed");
  if (state.identifier === "mindstatic" && !sustainHeld(ctx.actor, state.claimCast, "mindstatic")) return no("sustain");
  if (state.identifier === "phantom-footsteps" && !state.record) {
    const answer = await utilityDialog({ title: ctx.spell.name, note: words("ResistReview"),
      fields: [{ name: "failed", type: "checkbox", label: words("FailedSpirit") }] });
    if (!answer) return no("cancelled");
    if (!answer.failed) {
      await write(receipt, { ...state, cardId: card.id, status: "failed" });
      return { ok: true, complete: false };
    }
  }
  let record = state.record;
  if (!record) {
    const made = state.identifier === "phantom-footsteps" ? startPhantom({ cast: state.claimCast,
      casterUuid: state.actorUuid, targetUuid: state.targetUuid, choice: state.choice,
      now: state.claimTime, failedResist: true }) : startMindstatic({ cast: state.claimCast,
      casterUuid: state.actorUuid, area: state.choice.area });
    if (!made.ok) return made;
    record = made.value;
    await write(receipt, { ...state, record, cardId: card.id, status: "applying" });
  }
  const owner = state.identifier === "phantom-footsteps" ? ctx.target : ctx.actor;
  let effect = owner.effects.get(state.effectId);
  if (state.effectStatus === "writing" && !effect) return no("effectUnresolved");
  if (!effect) {
    await write(receipt, { ...state, record, cardId: card.id, status: "applying", effectStatus: "writing" });
    const options = { ticket: receipt.id, spellUuid: state.spellUuid, messageId: card.id,
      effectId: state.effectId, img: ctx.spell.img, description: ctx.spell.system.effect };
    const source = state.identifier === "phantom-footsteps" ? phantomEffectData(record, options) : mindstaticEffectData(record, options);
    if (!source) return no("effect");
    [effect] = await owner.createEmbeddedDocuments("ActiveEffect", [source], { keepId: true });
  }
  const mark = effect?.flags?.[NS]?.[state.identifier === "phantom-footsteps" ? "phantomFootsteps" : "mindstatic"];
  if (effect?.origin !== state.spellUuid || mark?.ticket !== receipt.id || mark.cast !== state.claimCast) return no("effectMismatch");
  if (state.identifier === "phantom-footsteps") {
    const cueId = state.cueMessageId;
    if (state.cueStatus === "writing" && !game.messages.get(cueId)) return no("cueUnresolved");
    if (state.cueStatus !== "complete") {
      await write(receipt, { ...state, record, cardId: card.id, status: "cueing",
        effectStatus: "complete", cueStatus: "writing" });
      if (!game.messages.get(cueId)) {
        await createPhantomCue(receipt, state, owner);
      }
    }
  }
  await write(receipt, { ...state, record, cardId: card.id, status: "complete", effectStatus: "complete",
    ...(state.identifier === "phantom-footsteps" ? { cueStatus: "complete" } : {}) });
  return { ok: true, complete: true };
}

async function createPhantomCue(receipt, state, target) {
  const owners = [...game.users].filter(who => !who.isGM && target.testUserPermission(who, "OWNER"));
  return ChatMessage.create({ _id: state.cueMessageId,
    whisper: owners.length ? owners.map(who => who.id) : gmIds(),
    content: content(words("PrivateSound")), flags: { [NS]: { phantomCue: { ticket: receipt.id,
      targetUuid: target.uuid } } } }, { keepId: true });
}

export const recoverPhantomCue = ticket => request({ phase: "recoverCue", ticket });
async function recoverCue(receipt, state, user) {
  const target = resolve(state.targetUuid);
  if (!user.isGM || state.identifier !== "phantom-footsteps" || state.status !== "cueing"
    || !target || !phantomActive(target.effects?.get(state.effectId), target.uuid, game.time.worldTime)) return no("ticket");
  if (!game.messages.get(state.cueMessageId)) {
    const reviewed = await utilityDialog({ title: words("ReviewCue"), note: words("CueMissing"),
      fields: [{ name: "absent", type: "checkbox", label: words("ConfirmCueAbsent") }] });
    if (!reviewed?.absent) return no("cueUnresolved");
    await createPhantomCue(receipt, state, target);
  }
  await write(receipt, { ...state, status: "complete", cueStatus: "complete" });
  return { ok: true, complete: true };
}

/** Owner/GM-only playback. The sound and point stay in the private receipt. */
export function phantomFor(target) {
  const now = game.time?.worldTime ?? 0;
  return [...target?.effects ?? []].filter(effect => phantomActive(effect, target.uuid, now))
    .map(effect => ({ ticket: effect.flags[NS].phantomFootsteps.ticket, effectId: effect.id }));
}
export const examinePhantom = (ticket, { contradiction = false, spentAction = false, passed = false } = {}) =>
  request({ phase: "repeat", ticket, contradiction, spentAction, passed, testId: foundry.utils.randomID() });

/** Small water droplets synthesized into the local interface context. */
function playDrippingWater() {
  const ctx = game.audio?.interface;
  if (!ctx?.createOscillator || !ctx?.createGain || !ctx.gainNode) return false;
  for (const delay of [0, 0.43, 0.91]) {
    const at = ctx.currentTime + delay, tone = ctx.createOscillator(), gain = ctx.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(1050, at);
    tone.frequency.exponentialRampToValueAtTime(390, at + 0.12);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(0.12, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.17);
    tone.connect(gain); gain.connect(ctx.gainNode);
    tone.start(at); tone.stop(at + 0.18);
  }
  return true;
}

async function playPrivateSound(sound) {
  if (sound === "dripping-water") return playDrippingWater();
  const src = Object.hasOwn(phantomAudio, sound) ? phantomAudio[sound] : null;
  if (!src || !game.modules?.get("psfx")?.active || !game.audio?.play) return false;
  try {
    // Foundry 14.367 AudioHelper.play(..., false) resolves to this local call.
    await game.audio.play(src, { volume: 0.48, loop: false, context: game.audio.interface });
    return true;
  } catch { return false; }
}

function playPrivatePoint(point) {
  const scene = globalThis.canvas?.scene;
  if (!scene || scene.id !== point.sceneId || !scene.grid?.distance || !globalThis.Sequence
    || !globalThis.Sequencer?.Database) return false;
  try {
    const pixels = { x: point.xFt * scene.grid.size / scene.grid.distance,
      y: point.yFt * scene.grid.size / scene.grid.distance };
    const sequence = new globalThis.Sequence();
    sequence.effect().file("jb2a.cast_generic.02.blue").atLocation(pixels).scale(0.35).opacity(0.35).locally();
    void Promise.resolve(sequence.play({ local: true })).catch(() => {});
    return true;
  } catch { return false; }
}

export async function playPhantom(ticket) {
  const result = await request({ phase: "playback", ticket });
  if (result?.ok) {
    const audio = await playPrivateSound(result.sound);
    const visual = playPrivatePoint(result.point);
    ui.notifications?.info(`${words("YouHear")} ${words(result.sound)}`);
    return { ...result, audio, visual };
  }
  return result;
}

function repeatPrivatePhantom(ticket) {
  if (phantomTimers.has(ticket)) return;
  const timer = setTimeout(async () => {
    phantomTimers.delete(ticket);
    try { const result = await playPhantom(ticket); if (result?.ok) repeatPrivatePhantom(ticket); }
    catch { /* A missed private cue never becomes a public retry. */ }
  }, 12000);
  timer.unref?.();
  phantomTimers.set(ticket, timer);
}

export async function reviewPhantomTest(ticket) {
  if (!game.user?.isGM) return examinePhantom(ticket, { spentAction: true });
  const answer = await utilityDialog({ title: words("RepeatTest"), note: words("RepeatReview"), fields: [
    { name: "contradiction", type: "checkbox", label: words("Contradiction") },
    { name: "spentAction", type: "checkbox", label: words("ExamineAction") },
    { name: "passed", type: "checkbox", label: words("PassedSpirit") }
  ] });
  if (!answer) return no("cancelled");
  return examinePhantom(ticket, answer);
}

async function repeat(receipt, state, data, user) {
  if (state.identifier !== "phantom-footsteps" || state.status !== "complete") return no("ticket");
  const target = resolve(state.targetUuid);
  if (!target || !user.isGM && !target.testUserPermission(user, "OWNER")
    || !phantomActive(target.effects.get(state.effectId), target.uuid, game.time.worldTime)) return no("target");
  let answer = { contradiction: data.contradiction, spentAction: data.spentAction, passed: data.passed };
  if (!user.isGM) {
    answer = await utilityDialog({ title: words("RepeatTest"), note: target.name, fields: [
      { name: "contradiction", type: "checkbox", label: words("Contradiction") },
      { name: "spentAction", type: "checkbox", label: words("ExamineAction") },
      { name: "passed", type: "checkbox", label: words("PassedSpirit") }
    ] });
    if (!answer) return no("cancelled");
  }
  const next = phantomRepeatTest(state.record, { testId: data.testId, contradiction: answer.contradiction,
    spentAction: answer.spentAction, passed: answer.passed, now: game.time.worldTime });
  if (!next.ok) return next;
  await write(receipt, { ...state, record: next.value });
  if (next.value.status === "ended") await target.deleteEmbeddedDocuments("ActiveEffect", [state.effectId]);
  return { ok: true, ended: next.value.status === "ended" };
}

/** Read active GM receipts, plus a live caster effect. Movement changes the answer. */
export function mindstaticAreas() {
  const areas = [];
  for (const receipt of game.messages?.values?.() ?? []) {
    const state = stateOf(receipt);
    if (state?.identifier !== "mindstatic" || state.status !== "complete") continue;
    const caster = resolve(state.actorUuid), effect = caster?.effects?.get(state.effectId);
    if (mindstaticActive(effect) && sustainHeld(caster, state.claimCast, "mindstatic")) areas.push(state.record.area);
  }
  return areas;
}

function location(actor) {
  const token = actor?.getActiveTokens?.(true, true)?.[0]?.document;
  const scene = token?.parent, grid = scene?.grid;
  if (!token || !grid?.size || !Number.isFinite(grid.distance)) return null;
  return { sceneId: scene.id, xFt: (token.x + token.width * grid.size / 2) * grid.distance / grid.size,
    yFt: (token.y + token.height * grid.size / 2) * grid.distance / grid.size };
}

/** A four-spell cast card opens a private channel after GM review of its book gate. */
export const openMentalChannel = (messageId, { answerUntil = null } = {}) =>
  request({ phase: "openChannel", messageId, answerUntil });

async function openChannel(data, user) {
  const card = game.messages.get(data.messageId), flags = card?.flags?.[NS];
  if (!card || card.author?.id !== user.id && !user.isGM || flags?.kind !== "spell"
    || !MENTAL_CHANNELS.includes(flags.identifier) || flags.success !== true || !ref(flags.cast)) return no("card");
  const caster = resolve(flags.caster), spell = resolve(flags.spellUuid), law = CHANNEL_RULES[flags.identifier];
  if (!caster || spell?.system?.identifier !== flags.identifier || !caster.testUserPermission(user, "OWNER")) return no("owner");
  if (law.sustained && !sustainHeld(caster, flags.cast, flags.identifier)) return no("sustain");
  const targets = (flags.targets ?? []).map(actorAt);
  if (targets.some(target => !target) || !targets.length
    || targets.length + (flags.identifier === "mindlink" ? 0 : 1) > law.maxMembers
    || new Set(targets.map(target => target.uuid)).size !== targets.length
    || flags.identifier !== "mindlink" && targets.some(target => target.uuid === caster.uuid)) return no("targets");
  const existing = [...game.messages.values()].find(message => stateOf(message)?.channelCardId === card.id);
  if (existing) {
    if (stateOf(existing).status !== "complete") return no("channelUnresolved");
    if (flags.mentalTicket !== existing.id) await card.update({ [`flags.${NS}.mentalTicket`]: existing.id });
    return { ok: true, ticket: existing.id, already: true };
  }
  const source = tokenAt(flags.source), measured = targets.every((target, index) => {
    const token = tokenAt(flags.targets[index]);
    return source && token && source.parent?.id === token.parent?.id
      && Number.isFinite(feetApart(source, token)) && feetApart(source, token) <= (law.rangeFt ?? Infinity);
  });
  if (law.rangeFt && source && !measured) return no("range");
  const answer = await utilityDialog({ title: spell.name, note: words("ChannelReview"), fields: [
    ...(law.willing ? [{ name: "willing", type: "checkbox", label: words("Willing") }] : []),
    ...(law.met ? [{ name: "met", type: "checkbox", label: words("Met") }] : []),
    ...(law.resist ? [{ name: "failed", type: "checkbox", label: words("FailedSpirit") }] : []),
    ...(flags.identifier === "sending" ? [{ name: "noAnchor", type: "checkbox", label: words("NoArcaneAnchor") }] : []),
    ...(law.rangeFt && !measured ? [{ name: "range", type: "checkbox", label: words("Range") }] : [])
  ] });
  if (!answer || law.willing && !answer.willing || law.met && !answer.met
    || law.resist && !answer.failed || flags.identifier === "sending" && !answer.noAnchor
    || law.rangeFt && !measured && !answer.range) return no("eligibility");
  if (law.willing || flags.identifier === "sending") {
    for (const target of targets) if (!await consentFor(target, caster, spell, flags.identifier)) return no("declined");
  }
  if (flags.identifier === "mindlink" && (!Number.isSafeInteger(flags.mentalCastTime)
    || flags.mentalCastTime < 0 || flags.mentalCastTime + 3600 <= game.time.worldTime)) return no("castTime");
  const answerTurn = flags.identifier === "sending" && game.combat?.combatant?.actor?.uuid === caster.uuid
    ? combatTurn() : null;
  if (flags.identifier === "sending" && game.combat && !answerTurn) return no("answerWindow");
  let answerUntil = data.answerUntil;
  if (flags.identifier === "sending" && !answerTurn && !Number.isSafeInteger(answerUntil)) {
    const review = await utilityDialog({ title: spell.name, note: words("SendingWindowReview"),
      fields: [{ name: "worldClock", type: "checkbox", label: words("NextClockAdvance") }] });
    if (!review?.worldClock) return no("cancelled");
    answerUntil = game.time.worldTime;
  }
  const made = startMentalChannel({ identifier: flags.identifier, cast: flags.cast, casterUuid: caster.uuid,
    memberUuids: flags.identifier === "mindlink" ? targets.map(target => target.uuid)
      : [caster.uuid, ...targets.map(target => target.uuid)],
    now: flags.identifier === "mindlink" ? flags.mentalCastTime : game.time.worldTime,
    willing: Boolean(answer.willing), met: Boolean(answer.met), failedResist: Boolean(answer.failed),
    answerUntil, answerTurn });
  if (!made.ok) return made;
  const rows = flags.identifier === "mindlink" ? targets.map(target => ({ actorUuid: target.uuid,
    effectId: foundry.utils.randomID(), status: "pending" })) : [];
  const state = { version: 1, status: rows.length ? "applying" : "complete", channelCardId: card.id,
    userId: user.id, spellUuid: spell.uuid, record: made.value, rows, deliveries: [], shocks: [] };
  const receipt = await ChatMessage.create({ whisper: gmIds(), content: content(spell.name),
    flags: { [NS]: { shadowReceipt: state } } });
  for (const row of rows) {
    const member = resolve(row.actorUuid);
    row.status = "writing";
    await write(receipt, { ...state, rows });
    const source = mindlinkEffectData(made.value, { actorUuid: member.uuid, ticket: receipt.id,
      spellUuid: spell.uuid, messageId: card.id, effectId: row.effectId,
      img: spell.img, description: spell.system.effect });
    if (!source) return no("effect");
    const [effect] = await member.createEmbeddedDocuments("ActiveEffect", [source], { keepId: true });
    if (effect?.origin !== spell.uuid || effect.flags?.[NS]?.mindlinkChannel?.ticket !== receipt.id) return no("effectMismatch");
    row.status = "complete";
    await write(receipt, { ...state, rows });
  }
  if (rows.length) await write(receipt, { ...state, rows, status: "complete" });
  await card.update({ [`flags.${NS}.mentalTicket`]: receipt.id });
  return { ok: true, ticket: receipt.id };
}

export const deliverMentalChannel = (ticket, { fromUuid, toUuid, text, kind = "message", reply = false } = {}) =>
  request({ phase: "deliver", ticket, deliveryId: foundry.utils.randomID(), fromUuid, toUuid, text, kind, reply });

export const recoverMindlinkChannel = ticket => request({ phase: "recoverChannel", ticket });

async function recoverChannel(receipt, state, user) {
  if (!user.isGM || state.status !== "applying" || state.record?.identifier !== "mindlink") return no("ticket");
  const card = game.messages.get(state.channelCardId), spell = resolve(state.spellUuid);
  if (!card || !spell || state.record.expiresAt <= game.time.worldTime) return no("expired");
  for (const row of state.rows) {
    if (row.status === "complete") continue;
    const member = resolve(row.actorUuid);
    if (!member) return no("memberGone");
    let effect = member.effects?.get(row.effectId);
    if (row.status === "writing" && !effect) {
      const answer = await utilityDialog({ title: words("ReviewChannel"), note: `${member.name}: ${words("EffectMissing")}`,
        fields: [{ name: "absent", type: "checkbox", label: words("ConfirmAbsent") }] });
      if (!answer?.absent) return no("effectUnresolved");
    }
    if (!effect) {
      row.status = "writing";
      await write(receipt, { ...state, rows: state.rows });
      const source = mindlinkEffectData(state.record, { actorUuid: member.uuid, ticket: receipt.id,
        spellUuid: spell.uuid, messageId: card.id, effectId: row.effectId,
        img: spell.img, description: spell.system.effect });
      if (!source) return no("effect");
      [effect] = await member.createEmbeddedDocuments("ActiveEffect", [source], { keepId: true });
    }
    if (effect?.origin !== spell.uuid || effect.flags?.[NS]?.mindlinkChannel?.ticket !== receipt.id
      || effect.flags[NS].mindlinkChannel.actorUuid !== member.uuid) return no("effectMismatch");
    row.status = "complete";
    await write(receipt, { ...state, rows: state.rows });
  }
  await write(receipt, { ...state, status: "complete", rows: state.rows });
  if (card.flags?.[NS]?.mentalTicket !== receipt.id) await card.update({ [`flags.${NS}.mentalTicket`]: receipt.id });
  return { ok: true, complete: true };
}

function channelMembers(state, user) {
  const record = state.record;
  if (state.status !== "complete" || !record || record.status !== "active") return no("ticket");
  const members = record.memberUuids.map(resolve).filter(actor => actor && (record.identifier !== "mindlink"
    || mindlinkEffectActive(actor.effects?.get(state.rows?.find(row => row.actorUuid === actor.uuid)?.effectId),
      actor.uuid, game.time.worldTime)));
  if (CHANNEL_RULES[record.identifier]?.delivery === "senses"
    && !user.isGM && !resolve(record.casterUuid)?.testUserPermission(user, "OWNER")) return no("owner");
  const owned = members.filter(actor => user.isGM || actor.testUserPermission(user, "OWNER"));
  if (!owned.length) return no("owner");
  return { ok: true, identifier: record.identifier, casterUuid: record.casterUuid,
    from: owned.map(actor => ({ value: actor.uuid, label: actor.name })),
    to: members.filter(actor => !record.leftUuids.includes(actor.uuid)).map(actor => ({ value: actor.uuid, label: actor.name })) };
}

/** Named actor choices, with no UUID field exposed to the player. */
export async function composeMentalChannel(ticket) {
  const list = await request({ phase: "members", ticket });
  if (!list?.ok) return list;
  const chosen = await utilityDialog({ title: words("SendMessage"), note: words("PrivateChannel"), fields: [
    { name: "from", label: words("From"), options: list.from },
    { name: "to", label: words("To"), options: list.to },
    { name: "text", label: words("Message"), multiline: true, maxLength: 2000 }
  ] });
  if (!chosen) return no("cancelled");
  return deliverMentalChannel(ticket, { fromUuid: chosen.from, toUuid: chosen.to, text: chosen.text,
    reply: list.identifier === "sending" && chosen.from !== list.casterUuid });
}

export async function reportMentalSenses(ticket) {
  if (!game.user?.isGM) return no("gmOnly");
  const list = await request({ phase: "members", ticket });
  if (!list?.ok || !["mindlink", "mind-vision", "distant-mind"].includes(list.identifier)) return no("channel");
  const chosen = await utilityDialog({ title: words("SenseReport"), note: words("UnverifiedReport"), fields: [
    { name: "from", label: words("PerceivedThrough"), options: list.to },
    { name: "to", label: words("Recipient"), options: list.to },
    ...(list.identifier === "mindlink" ? [{ name: "action", type: "checkbox", label: words("HalfAction") }] : []),
    { name: "text", label: words("Report"), multiline: true, maxLength: 2000 }
  ] });
  if (!chosen || list.identifier === "mindlink" && !chosen.action) return no("cancelled");
  return deliverMentalChannel(ticket, { fromUuid: chosen.from, toUuid: chosen.to, text: chosen.text, kind: "senses" });
}

async function deliver(receipt, state, data, user) {
  if (state.status !== "complete" || !state.record || !ref(data.deliveryId)) return no("ticket");
  const record = state.record, from = resolve(data.fromUuid), to = resolve(data.toUuid);
  if (!from || !to || !record.memberUuids.includes(from.uuid) || !record.memberUuids.includes(to.uuid)) return no("members");
  if (record.identifier === "mindlink" && [from, to].some(actor => !mindlinkEffectActive(
    actor.effects?.get(state.rows?.find(row => row.actorUuid === actor.uuid)?.effectId), actor.uuid, game.time.worldTime))) return no("memberInactive");
  if (CHANNEL_RULES[record.identifier]?.sustained
    && !sustainHeld(resolve(record.casterUuid), record.cast, record.identifier)) return no("sustain");
  if (data.kind === "senses" ? !user.isGM : !user.isGM && !from.testUserPermission(user, "OWNER")) return no("owner");
  const now = game.time.worldTime;
  const checked = data.kind === "senses" ? channelSenses(record,
    { reporterUuid: from.uuid, recipientUuid: to.uuid, text: data.text, now })
    : channelMessage(record, { fromUuid: from.uuid, toUuid: to.uuid, text: data.text, now,
      reply: data.reply, currentTurn: combatTurn() });
  if (!checked.ok) return checked;
  const prior = state.deliveries.find(row => row.id === data.deliveryId);
  if (prior?.status === "complete") return { ok: true, messageId: prior.messageId };
  if (record.identifier === "sending" && state.deliveries.some(row => row.status === "complete"
    && row.reply === Boolean(data.reply))) return no("alreadySent");
  const areas = mindstaticAreas();
  const fromPoint = location(from), toPoint = location(to);
  if (areas.length && (!fromPoint || !toPoint)) {
    const fields = areas.flatMap((area, index) => [
      ...(!fromPoint ? [{ name: `from${index}`, label: `${from.name}: ${words("AreaSide")} ${index + 1}`,
        options: [{ value: "review", label: words("ChooseSide") },
          { value: "inside", label: words("Inside") }, { value: "outside", label: words("Outside") }] }] : []),
      ...(!toPoint ? [{ name: `to${index}`, label: `${to.name}: ${words("AreaSide")} ${index + 1}`,
        options: [{ value: "review", label: words("ChooseSide") },
          { value: "inside", label: words("Inside") }, { value: "outside", label: words("Outside") }] }] : [])
    ]);
    const decided = await utilityDialog({ title: words("BoundaryReview"), note: words("BoundaryUnknown"), fields });
    if (!decided) return no("cancelled");
    const side = (point, area, value) => point
      ? point.sceneId === area.sceneId && Math.hypot(point.xFt - area.xFt, point.yFt - area.yFt) <= 15
      : value === "inside" ? true : value === "outside" ? false : null;
    for (const [index, area] of areas.entries()) {
      const a = side(fromPoint, area, decided[`from${index}`]);
      const b = side(toPoint, area, decided[`to${index}`]);
      if (a === null || b === null) return no("locationUnknown");
      if (a !== b) return no("mindstatic");
    }
  } else {
    const boundary = channelDelivery({ identifier: record.identifier, cast: record.cast, active: true,
      expiresAt: record.expiresAt }, areas, fromPoint ?? { sceneId: "unlocated", xFt: 0, yFt: 0 },
    toPoint ?? { sceneId: "unlocated", xFt: 0, yFt: 0 }, now);
    if (!boundary.allowed) return no(boundary.reason);
  }
  if (prior?.status === "writing" && !game.messages.get(prior.messageId)) return no("deliveryUnresolved");
  const entry = prior ?? { id: data.deliveryId, messageId: foundry.utils.randomID(), status: "writing",
    fromUuid: from.uuid, toUuid: to.uuid, reply: Boolean(data.reply) };
  if (!prior) await write(receipt, { ...state, deliveries: [...state.deliveries, entry] });
  const audience = new Set(gmIds());
  const recipients = data.kind === "senses" ? (record.identifier === "mindlink"
    ? record.memberUuids.map(resolve).filter(Boolean) : [to]) : [from, to];
  for (const actor of recipients) for (const owner of game.users)
    if (actor.testUserPermission(owner, "OWNER")) audience.add(owner.id);
  if (!game.messages.get(entry.messageId)) await ChatMessage.create({ _id: entry.messageId,
    whisper: [...audience], content: content(data.kind === "senses" ? `${words("UnverifiedReport")}: ${checked.value.text}` : checked.value.text),
    flags: { [NS]: { mentalDelivery: { ticket: receipt.id, id: entry.id, identifier: record.identifier } } }
  }, { keepId: true });
  const latest = stateOf(receipt);
  await write(receipt, { ...latest,
    deliveries: latest.deliveries.map(row => row.id === entry.id ? { ...row, status: "complete" } : row) });
  return { ok: true, messageId: entry.messageId };
}

export const leaveMentalChannel = (ticket, actorUuid) => request({ phase: "leaveChannel", ticket, actorUuid });

export async function leaveOwnMindlink(ticket) {
  const list = await request({ phase: "members", ticket });
  if (!list?.ok || list.identifier !== "mindlink" || !list.from.length) return no("member");
  const picked = list.from.length === 1 ? list.from[0].value : (await utilityDialog({ title: words("LeaveMindlink"),
    note: words("CannotRejoin"), fields: [{ name: "member", label: words("Member"), options: list.from }] }))?.member;
  if (!picked) return no("cancelled");
  return leaveMentalChannel(ticket, picked);
}

function bearings(state, data, user) {
  const record = state.record, member = resolve(data.actorUuid), now = game.time.worldTime;
  if (state.status !== "complete" || record?.identifier !== "mindlink" || now >= record.expiresAt
    || !member || !record.memberUuids.includes(member.uuid) || record.leftUuids.includes(member.uuid)
    || !user.isGM && !member.testUserPermission(user, "OWNER")) return no("member");
  if (!mindlinkEffectActive(member.effects?.get(state.rows?.find(row => row.actorUuid === member.uuid)?.effectId),
    member.uuid, now)) return no("memberInactive");
  const from = location(member), areas = mindstaticAreas();
  const rows = record.memberUuids.filter(uuid => uuid !== member.uuid && !record.leftUuids.includes(uuid)).map(uuid => {
    const other = resolve(uuid), to = location(other);
    if (!other || !mindlinkEffectActive(other.effects?.get(state.rows?.find(row => row.actorUuid === uuid)?.effectId),
      uuid, now)) return null;
    const crossed = areas.length && (!from || !to || !channelDelivery({ identifier: "mindlink", cast: record.cast,
      active: true, expiresAt: record.expiresAt }, areas, from, to, now).allowed);
    return { name: other.name, bearing: crossed ? null : mindlinkBearing(record, member.uuid, other.uuid, from, to, now) };
  }).filter(Boolean);
  return { ok: true, rows };
}

export async function mindlinkBearingsFor(ticket, actorUuid) {
  const result = await request({ phase: "bearings", ticket, actorUuid });
  if (result?.ok) ui.notifications?.info(result.rows.map(row => `${row.name}: ${row.bearing
    ? `${words(row.bearing.direction)}, ${words(row.bearing.roughFeet)}` : words("BearingUnknown")}`).join("; "));
  return result;
}

/** Read-only candidates for the GM's verified damage hook; Mindstatic can suppress a shock. */
export function mindlinkShockCandidates(damagedActor, now = game.time?.worldTime ?? 0) {
  if (!gmHere() || !damagedActor || !Number.isSafeInteger(now)) return [];
  const areas = mindstaticAreas(), hits = [];
  for (const receipt of game.messages?.values?.() ?? []) {
    const state = stateOf(receipt), record = state?.record;
    if (state?.status !== "complete" || record?.identifier !== "mindlink") continue;
    const memberRow = state.rows?.find(row => row.actorUuid === damagedActor.uuid);
    if (!memberRow || !mindlinkEffectActive(damagedActor.effects?.get(memberRow.effectId),
      damagedActor.uuid, now)) continue;
    const from = location(damagedActor);
    for (const uuid of mindlinkShockRecipients(record, damagedActor.uuid, now)) {
      const recipient = resolve(uuid), to = location(recipient);
      const otherRow = state.rows?.find(row => row.actorUuid === uuid);
      if (!otherRow || !mindlinkEffectActive(recipient?.effects?.get(otherRow.effectId), uuid, now)) continue;
      if (!recipient || areas.length && (!from || !to || !channelDelivery({ identifier: "mindlink",
        cast: record.cast, active: true, expiresAt: record.expiresAt }, areas, from, to, now).allowed)) continue;
      hits.push({ ticket: receipt.id, recipientUuid: uuid, cast: record.cast });
    }
  }
  return hits;
}

/** Cheap local marker check before a player-owned damage write queries the GM. */
export function mindlinkFor(actor) {
  const now = game.time?.worldTime ?? 0;
  const effect = [...actor?.effects ?? []].find(row => mindlinkEffectActive(row, actor.uuid, now));
  const mark = effect?.flags?.[NS]?.mindlinkChannel;
  return mark ? { ticket: mark.ticket, cast: mark.cast } : null;
}

export function requestMindlinkDamage({ actor, before, after, eventId } = {}) {
  if (!mindlinkFor(actor) || !Number.isSafeInteger(before) || !Number.isSafeInteger(after)
    || after >= before || !ref(eventId)) return null;
  return request({ phase: "shock", actorUuid: actor.uuid, before, after, eventId });
}

/** GM damage hook: claim before each Bane write. An interrupted write needs GM review. */
export async function mindlinkAfterDamage({ actor, before, after, eventId } = {}) {
  if (!gmHere() || !actor || !ref(eventId) || !Number.isSafeInteger(before)
    || !Number.isSafeInteger(after) || after >= before || healthHeld(actor) !== after) return no("damage");
  const hits = mindlinkShockCandidates(actor);
  const { layBane } = await import("./banes.mjs");
  const applied = [];
  for (const hit of hits) {
    const result = await serialized(hit.ticket, async () => {
      const receipt = game.messages.get(hit.ticket), state = stateOf(receipt);
      if (state?.status !== "complete" || state.record?.cast !== hit.cast) return no("ticket");
      const id = `${eventId}:${hit.recipientUuid}`;
      const prior = (state.shocks ?? []).find(row => row.id === id);
      if (prior?.status === "complete") return { ok: true, already: true };
      if (prior) return no("shockUnresolved");
      const recipient = resolve(hit.recipientUuid);
      if (!recipient) return no("recipient");
      const entry = { id, recipientUuid: recipient.uuid, status: "writing" };
      await write(receipt, { ...state, shocks: [...(state.shocks ?? []), entry] });
      const laid = await layBane({ victim: recipient, kind: "all", banes: 1,
        source: "Mindlink", by: actor, lasting: false });
      if (!laid?.effectId) return no("shockUnresolved");
      await write(receipt, { ...state, shocks: [...(state.shocks ?? []), { ...entry, status: "complete", effectId: laid.effectId }] });
      return { ok: true, effectId: laid.effectId };
    });
    applied.push({ ...hit, ...result });
  }
  return { ok: applied.every(row => row.ok), applied };
}
async function leaveChannel(receipt, state, data, user) {
  const actor = resolve(data.actorUuid), record = state.record;
  if (!actor || record?.identifier !== "mindlink" || !record.memberUuids.includes(actor.uuid)
    || !user.isGM && !actor.testUserPermission(user, "OWNER")) return no("member");
  if (record.leftUuids.includes(actor.uuid)) return { ok: true, already: true };
  const row = state.rows?.find(entry => entry.actorUuid === actor.uuid);
  if (!row) return no("member");
  await write(receipt, { ...state, leaving: actor.uuid });
  if (actor.effects?.get(row.effectId)) await actor.deleteEmbeddedDocuments("ActiveEffect", [row.effectId]);
  await write(receipt, { ...state, leaving: null,
    record: { ...record, leftUuids: [...record.leftUuids, actor.uuid] } });
  return { ok: true };
}

export function registerShadowCardHooks() {
  const receiveCue = message => {
    const cue = message.flags?.[NS]?.phantomCue;
    if (!cue || heardCues.has(message.id) || !message.whisper?.includes(game.user?.id)) return;
    const target = resolve(cue.targetUuid);
    if (!target?.testUserPermission(game.user, "OWNER")) return;
    heardCues.add(message.id);
    void playPhantom(cue.ticket).then(result => { if (result?.ok) repeatPrivatePhantom(cue.ticket); }).catch(() => {});
  };
  Hooks.on("createChatMessage", receiveCue);
  Hooks.once("ready", () => { for (const message of game.messages?.values?.() ?? []) receiveCue(message); });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message.flags?.[NS];
    if (!flags) return;
    const mount = html.querySelector(".azeroth-card") ?? html.querySelector(".message-content") ?? html;
    const button = (label, action) => {
      const element = document.createElement("button");
      element.type = "button"; element.textContent = label;
      element.addEventListener("click", async () => {
        element.disabled = true;
        try { const result = await action(); if (!result?.ok) ui.notifications?.warn(words("Unavailable")); }
        finally { element.disabled = false; }
      });
      mount.append(element);
    };
    if (game.user.isGM && flags.shadowReceipt?.status === "applying"
      && flags.shadowReceipt.record?.identifier === "mindlink") {
      button(words("ReviewChannel"), () => recoverMindlinkChannel(message.id));
      return;
    }
    if (game.user.isGM && flags.shadowReceipt?.status === "cueing"
      && flags.shadowReceipt.identifier === "phantom-footsteps") {
      button(words("ReviewCue"), () => recoverPhantomCue(message.id));
      return;
    }
    if (flags.success !== true) return;
    if (flags.shadowTicket && (game.user.isGM || message.author?.id === game.user.id))
      button(words("Resolve"), () => finishShadowCast(flags.shadowTicket, message.id));
    if (flags.shadowTicket && flags.identifier === "phantom-footsteps") {
      const target = actorAt(flags.targets?.[0]);
      if (target && (game.user.isGM || target.testUserPermission(game.user, "OWNER"))) {
        button(words("Hear"), () => playPhantom(flags.shadowTicket));
        button(words("RepeatTest"), () => reviewPhantomTest(flags.shadowTicket));
      }
    }
    if (MENTAL_CHANNELS.includes(flags.identifier)
      && (game.user.isGM || message.author?.id === game.user.id))
      button(words("OpenChannel"), () => openMentalChannel(message.id));
    if (flags.mentalTicket && ["mindlink", "sending"].includes(flags.identifier)) {
      button(words("SendMessage"), () => composeMentalChannel(flags.mentalTicket));
    }
    if (flags.mentalTicket && game.user.isGM && flags.identifier !== "sending")
      button(words("SenseReport"), () => reportMentalSenses(flags.mentalTicket));
    if (flags.mentalTicket && flags.identifier === "mindlink") {
      const self = (flags.targets ?? []).map(actorAt).find(actor => actor
        && (game.user.isGM || actor.testUserPermission(game.user, "OWNER")));
      if (self) {
        button(words("Bearings"), () => mindlinkBearingsFor(flags.mentalTicket, self.uuid));
        button(words("LeaveMindlink"), () => leaveOwnMindlink(flags.mentalTicket));
      }
    }
  });
}
