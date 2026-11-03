/** Shadow perception and mental-channel laws. Coordinates are scene feet,
 * supplied by the adapter from measured token/point positions. */
export const SHADOW_SPELLS = Object.freeze({
  "phantom-footsteps": Object.freeze({ name: "Phantom Footsteps", mana: 3, action: "halfAction", rangeFt: 60,
    pointRangeFt: 30, seconds: 60, sounds: Object.freeze(["footsteps", "knock", "dripping-water", "indistinct-whisper"]) }),
  mindstatic: Object.freeze({ name: "Mindstatic", mana: 6, action: "action", rangeFt: 30,
    radiusFt: 15, sustainedMana: 3 })
});
export const MENTAL_CHANNELS = Object.freeze(["mindlink", "sending", "mind-vision", "distant-mind"]);
export const CHANNEL_RULES = Object.freeze({
  mindlink: Object.freeze({ maxMembers: 6, rangeFt: 30, seconds: 3600, willing: true, delivery: "message" }),
  sending: Object.freeze({ maxMembers: 2, words: 25, met: true, delivery: "message" }),
  "mind-vision": Object.freeze({ maxMembers: 2, rangeFt: 120, resist: "spirit", sustained: true, delivery: "senses" }),
  "distant-mind": Object.freeze({ maxMembers: 2, rangeFt: 5280, met: true, resist: "spirit", sustained: true, delivery: "senses" })
});

const ref = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);
const clock = value => Number.isSafeInteger(value) && value >= 0;
const turn = value => ref(value?.combatId) && Number.isSafeInteger(value.round) && value.round >= 0
  && Number.isSafeInteger(value.turn) && value.turn >= 0;
const point = value => ref(value?.sceneId) && Number.isFinite(value.xFt) && Number.isFinite(value.yFt);
const distance = (a, b) => Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt);
const refused = reason => ({ ok: false, reason });
const success = value => ({ ok: true, value });

export function phantomChoice(raw, { caster, target, targetHasMind, pointVisibleToTarget } = {}) {
  if (!SHADOW_SPELLS["phantom-footsteps"].sounds.includes(raw?.sound) || !point(raw?.point)
    || !point(caster) || !point(target) || caster.sceneId !== target.sceneId
    || raw.point.sceneId !== target.sceneId || targetHasMind !== true || pointVisibleToTarget !== true
    || distance(caster, target) > 60 || distance(raw.point, target) > 30) return refused("choice");
  return success({ sound: raw.sound, point: { sceneId: raw.point.sceneId, xFt: raw.point.xFt, yFt: raw.point.yFt } });
}

export function startPhantom({ cast, casterUuid, targetUuid, choice, now, failedResist } = {}) {
  if (!ref(cast) || !ref(casterUuid) || !ref(targetUuid) || !clock(now) || !clock(now + 60)
    || !SHADOW_SPELLS["phantom-footsteps"].sounds.includes(choice?.sound) || !point(choice?.point)) return refused("cast");
  if (failedResist !== true) return refused("resisted");
  return success({ version: 1, identifier: "phantom-footsteps", cast, casterUuid, targetUuid,
    sound: choice.sound, point: { ...choice.point }, startsAt: now, expiresAt: now + 60,
    status: "active", seenTests: [] });
}

function validPhantom(state) {
  return state?.version === 1 && state.identifier === "phantom-footsteps" && ref(state.cast)
    && ref(state.casterUuid) && ref(state.targetUuid) && point(state.point)
    && SHADOW_SPELLS["phantom-footsteps"].sounds.includes(state.sound)
    && clock(state.startsAt) && state.expiresAt === state.startsAt + 60
    && ["active", "ended"].includes(state.status) && Array.isArray(state.seenTests)
    && state.seenTests.every(ref) && new Set(state.seenTests).size === state.seenTests.length;
}

/** A second Spirit Test is earned by physical contradiction or an action
 * examining the sound. Success ends it; failure does not compel any behavior. */
export function phantomRepeatTest(state, { testId, contradiction = false, spentAction = false, passed, now } = {}) {
  if (!validPhantom(state) || !ref(testId) || !clock(now) || typeof passed !== "boolean") return refused("test");
  if (state.status !== "active" || now >= state.expiresAt) return refused("inactive");
  if (state.seenTests.includes(testId)) return refused("replay");
  if (contradiction !== true && spentAction !== true) return refused("trigger");
  return success({ ...state, seenTests: [...state.seenTests, testId], status: passed ? "ended" : "active" });
}

export function phantomEffectData(state, { ticket, spellUuid, messageId, effectId, img, description = "" } = {}) {
  if (!validPhantom(state) || !ref(ticket) || !ref(spellUuid) || !ref(messageId) || !ref(effectId)) return null;
  return { _id: effectId, name: SHADOW_SPELLS["phantom-footsteps"].name,
    img: ref(img) ? img : "icons/svg/sound.svg", description: typeof description === "string" ? description : "",
    origin: spellUuid, disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: state.startsAt }, duration: { value: 60, units: "seconds", expiry: "turnStart", expired: false },
    flags: { "azeroth-rpg": { identifier: "phantom-footsteps", cast: state.cast, messageId,
      phantomFootsteps: { version: 1, ticket, cast: state.cast, targetUuid: state.targetUuid,
        startsAt: state.startsAt, expiresAt: state.expiresAt } } } };
}

export function phantomActive(effect, targetUuid, now) {
  const flag = effect?.flags?.["azeroth-rpg"]?.phantomFootsteps;
  return ref(targetUuid) && clock(now) && flag?.version === 1 && flag.targetUuid === targetUuid
    && ref(flag.ticket) && ref(flag.cast) && clock(flag.startsAt) && flag.expiresAt === flag.startsAt + 60
    && now >= flag.startsAt && now < flag.expiresAt && !effect.disabled && !effect.isSuppressed
    && effect.active !== false && !effect.duration?.expired;
}

export function startMindstatic({ cast, casterUuid, area } = {}) {
  if (!ref(cast) || !ref(casterUuid) || !point(area) || area.radiusFt !== 15) return refused("area");
  return success({ version: 1, identifier: "mindstatic", cast, casterUuid,
    area: { sceneId: area.sceneId, xFt: area.xFt, yFt: area.yFt, radiusFt: 15 }, status: "active" });
}

/** Only these four channels are gated. A cross-scene endpoint is outside this
 * scene's circle; the XOR is symmetric and grants no ally exception. */
export function mentalBoundary(identifier, area, from, to) {
  if (!MENTAL_CHANNELS.includes(identifier) || !point(area) || area.radiusFt !== 15
    || !point(from) || !point(to)) return { blocked: false, reason: "notEvaluable" };
  const inside = endpoint => endpoint.sceneId === area.sceneId && distance(endpoint, area) <= 15;
  return { blocked: inside(from) !== inside(to), reason: inside(from) !== inside(to) ? "mindstatic" : null };
}

export function mindstaticEffectData(state, { ticket, spellUuid, messageId, effectId, img, description = "" } = {}) {
  if (state?.version !== 1 || state.identifier !== "mindstatic" || state.status !== "active"
    || !ref(state.cast) || !ref(state.casterUuid) || !point(state.area)
    || !ref(ticket) || !ref(spellUuid) || !ref(messageId) || !ref(effectId)) return null;
  return { _id: effectId, name: SHADOW_SPELLS.mindstatic.name,
    img: ref(img) ? img : "icons/svg/aura.svg", description: typeof description === "string" ? description : "",
    origin: spellUuid, disabled: false, transfer: false, statuses: [], system: { changes: [] },
    flags: { "azeroth-rpg": { identifier: "mindstatic", cast: state.cast, messageId,
      mindstatic: { version: 1, ticket, cast: state.cast, casterUuid: state.casterUuid,
        area: { ...state.area } } } } };
}

export function mindstaticActive(effect) {
  const mark = effect?.flags?.["azeroth-rpg"]?.mindstatic;
  return mark?.version === 1 && ref(mark.ticket) && ref(mark.cast) && ref(mark.casterUuid)
    && point(mark.area) && mark.area.radiusFt === 15 && !effect.disabled && !effect.isSuppressed
    && effect.active !== false && !effect.duration?.expired;
}

/** A separate channel record preserves its own duration while Mindstatic
 * suspends delivery. It resumes whenever the boundary no longer crosses. */
export function channelDelivery(channel, areas, from, to, now) {
  if (!MENTAL_CHANNELS.includes(channel?.identifier) || !ref(channel.cast)
    || !clock(now) || !point(from) || !point(to) || channel.active !== true
    || (channel.expiresAt !== null && (!clock(channel.expiresAt) || now >= channel.expiresAt))) {
    return { allowed: false, reason: "inactive" };
  }
  const blocked = (areas ?? []).some(area => mentalBoundary(channel.identifier, area, from, to).blocked);
  return { allowed: !blocked, reason: blocked ? "mindstatic" : null };
}

/** Endpoint membership and original expiry are independent of Mindstatic. */
export function startMentalChannel({ identifier, cast, casterUuid, memberUuids, now,
  failedResist = false, willing = false, met = false, answerUntil = null, answerTurn = null } = {}) {
  const law = Object.hasOwn(CHANNEL_RULES, identifier) ? CHANNEL_RULES[identifier] : null;
  if (!law || !ref(cast) || !ref(casterUuid) || !clock(now) || !Array.isArray(memberUuids)
    || memberUuids.length < (identifier === "mindlink" ? 1 : 2) || memberUuids.length > law.maxMembers
    || !memberUuids.every(ref) || new Set(memberUuids).size !== memberUuids.length
    || identifier !== "mindlink" && !memberUuids.includes(casterUuid)) return refused("members");
  if (law.willing && !willing || law.met && !met || law.resist && !failedResist) return refused("eligibility");
  if (identifier === "sending" && !turn(answerTurn) && (!clock(answerUntil) || answerUntil < now)) return refused("answerWindow");
  return success({ version: 1, identifier, cast, casterUuid, memberUuids: [...memberUuids],
    startsAt: now, expiresAt: law.seconds ? now + law.seconds : null,
    answerUntil: identifier === "sending" ? answerUntil : null,
    answerTurn: identifier === "sending" && turn(answerTurn) ? { ...answerTurn } : null,
    status: "active", leftUuids: [] });
}

export function channelMessage(record, { fromUuid, toUuid, text, now, reply = false, currentTurn = null } = {}) {
  if (record?.version !== 1 || !Object.hasOwn(CHANNEL_RULES, record.identifier)
    || CHANNEL_RULES[record.identifier].delivery !== "message" || record.status !== "active"
    || !ref(fromUuid) || !ref(toUuid) || fromUuid === toUuid || !record.memberUuids?.includes(fromUuid)
    || !record.memberUuids.includes(toUuid) || record.leftUuids?.includes(fromUuid)
    || record.leftUuids?.includes(toUuid) || !clock(now) || (record.expiresAt !== null && now >= record.expiresAt)
    || typeof text !== "string" || !text.trim() || text.length > 2000) return refused("message");
  const clean = text.trim();
  if (record.identifier === "sending") {
    if (clean.split(/\s+/u).length > 25
      || (record.answerTurn ? !(turn(currentTurn) && currentTurn.combatId === record.answerTurn.combatId
        && currentTurn.round === record.answerTurn.round && currentTurn.turn === record.answerTurn.turn)
        : now > record.answerUntil)
      || reply && fromUuid === record.casterUuid || !reply && fromUuid !== record.casterUuid) return refused("sending");
  }
  return success({ fromUuid, toUuid, text: clean, reply: Boolean(reply) });
}

export function channelSenses(record, { reporterUuid, recipientUuid, text, now } = {}) {
  if (record?.version !== 1 || !Object.hasOwn(CHANNEL_RULES, record.identifier)
    || !["senses", "message"].includes(CHANNEL_RULES[record.identifier].delivery) || record.status !== "active"
    || !record.memberUuids?.includes(reporterUuid) || !record.memberUuids?.includes(recipientUuid)
    || reporterUuid === recipientUuid || record.leftUuids?.includes(reporterUuid)
    || record.leftUuids?.includes(recipientUuid) || !clock(now)
    || record.expiresAt !== null && now >= record.expiresAt
    || record.identifier !== "mindlink" && (reporterUuid === record.casterUuid || recipientUuid !== record.casterUuid)
    || typeof text !== "string" || !text.trim() || text.length > 2000) return refused("senses");
  return success({ reporterUuid, recipientUuid, text: text.trim(), gmAuthored: true });
}

/** Damage propagates to every other member still inside the one-hour link. */
export function mindlinkShockRecipients(record, damagedUuid, now) {
  if (record?.version !== 1 || record.identifier !== "mindlink" || record.status !== "active"
    || !ref(damagedUuid) || !record.memberUuids?.includes(damagedUuid)
    || record.leftUuids?.includes(damagedUuid) || !clock(now) || now >= record.expiresAt) return [];
  return record.memberUuids.filter(uuid => uuid !== damagedUuid && !record.leftUuids.includes(uuid));
}

/** A map can establish bearings only for tokens on the same scene. */
export function mindlinkBearing(record, fromUuid, toUuid, from, to, now) {
  if (record?.identifier !== "mindlink" || !record.memberUuids?.includes(fromUuid)
    || !record.memberUuids?.includes(toUuid) || fromUuid === toUuid
    || record.leftUuids?.includes(fromUuid) || record.leftUuids?.includes(toUuid)
    || !clock(now) || now >= record.expiresAt || !point(from) || !point(to)
    || from.sceneId !== to.sceneId) return null;
  const feet = distance(from, to), angle = Math.atan2(to.yFt - from.yFt, to.xFt - from.xFt);
  const directions = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
  const direction = directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  return { direction, roughFeet: feet < 30 ? "near" : feet < 300 ? "hundreds" : feet < 5280 ? "distant" : "far" };
}

export function mindlinkEffectData(record, { actorUuid, ticket, spellUuid, messageId, effectId,
  img, description = "" } = {}) {
  if (record?.version !== 1 || record.identifier !== "mindlink" || record.status !== "active"
    || !ref(actorUuid) || !record.memberUuids?.includes(actorUuid) || !ref(ticket)
    || !ref(spellUuid) || !ref(messageId) || !ref(effectId) || !clock(record.startsAt)
    || record.expiresAt !== record.startsAt + 3600) return null;
  return { _id: effectId, name: "Mindlink", img: ref(img) ? img : "icons/svg/aura.svg",
    description: typeof description === "string" ? description : "", origin: spellUuid,
    disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: record.startsAt }, duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false },
    flags: { "azeroth-rpg": { identifier: "mindlink", cast: record.cast, messageId,
      mindlinkChannel: { version: 1, ticket, cast: record.cast, actorUuid,
        startsAt: record.startsAt, expiresAt: record.expiresAt } } } };
}

export function mindlinkEffectActive(effect, actorUuid, now) {
  const mark = effect?.flags?.["azeroth-rpg"]?.mindlinkChannel;
  return ref(actorUuid) && clock(now) && mark?.version === 1 && ref(mark.ticket)
    && ref(mark.cast) && mark.actorUuid === actorUuid && clock(mark.startsAt)
    && mark.expiresAt === mark.startsAt + 3600 && now >= mark.startsAt && now < mark.expiresAt
    && !effect.disabled && !effect.isSuppressed && effect.active !== false && !effect.duration?.expired;
}
