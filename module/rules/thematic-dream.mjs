/** Dream Theatre is a voluntary shared invention. Its state never imports
 * facts from a scene, grants a Rank, or makes an invented detail true. */
export const DREAM_THEATRE = Object.freeze({ identifier: "dream-theatre", name: "Dream Theatre",
  classes: Object.freeze(["Priest"]), mana: 10, castSeconds: 60, rangeFt: 30,
  maxMembers: 6, seconds: 3600 });

const ref = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);
const clock = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 2000
  && !/[\u0000-\u001f\u007f]/u.test(value);
const refused = reason => ({ ok: false, reason });
const success = value => ({ ok: true, value });

function valid(state) {
  return state?.version === 1 && state.identifier === DREAM_THEATRE.identifier
    && ref(state.cast) && ref(state.casterUuid) && clock(state.startsAt)
    && state.expiresAt === state.startsAt + DREAM_THEATRE.seconds
    && ["active", "ended"].includes(state.status) && Array.isArray(state.members)
    && state.members.length >= 1 && state.members.length <= DREAM_THEATRE.maxMembers
    && state.members.every(row => ref(row?.actorUuid) && ["active", "left"].includes(row.status))
    && new Set(state.members.map(row => row.actorUuid)).size === state.members.length;
}

/** `ready` rows must come from actual owner consent and GM sleep review. */
export function startDream({ cast, casterUuid, members, now } = {}) {
  if (!ref(cast) || !ref(casterUuid) || !clock(now) || !clock(now + DREAM_THEATRE.seconds)
    || !Array.isArray(members) || members.length < 1 || members.length > DREAM_THEATRE.maxMembers
    || members.some(row => !ref(row?.actorUuid) || row.willing !== true || row.sleeping !== true)
    || new Set(members.map(row => row.actorUuid)).size !== members.length) return refused("members");
  return success({ version: 1, identifier: DREAM_THEATRE.identifier, cast, casterUuid,
    startsAt: now, expiresAt: now + DREAM_THEATRE.seconds, status: "active",
    members: members.map(row => ({ actorUuid: row.actorUuid, status: "active" })) });
}

export function activeDreamMembers(state, now) {
  if (!valid(state) || !clock(now) || state.status !== "active" || now >= state.expiresAt) return [];
  return state.members.filter(row => row.status === "active").map(row => row.actorUuid);
}

/** A member deliberately contributes a recollection or an invention. Every
 * recollection remains explicitly unverified; neither kind asserts truth. */
export function dreamContribution(state, raw, now) {
  if (!valid(state) || !clock(now) || !raw || typeof raw !== "object" || Array.isArray(raw)
    || Object.keys(raw).some(key => !["actorUuid", "kind", "text"].includes(key))
    || !ref(raw.actorUuid) || !["memory", "invention"].includes(raw.kind) || !text(raw.text)) return refused("contribution");
  if (!activeDreamMembers(state, now).includes(raw.actorUuid)) return refused("member");
  return success({ actorUuid: raw.actorUuid, kind: raw.kind, text: raw.text.trim(),
    label: raw.kind === "memory" ? "Participant memory (unverified)" : "Participant invention (imagined)",
    uncertain: true });
}

/** Leaving, waking and actual outside damage remove only that member. */
export function leaveDream(state, { actorUuid, reason, now } = {}) {
  if (!valid(state) || !ref(actorUuid) || !["left", "woke", "damage"].includes(reason) || !clock(now)) return refused("leave");
  if (!activeDreamMembers(state, now).includes(actorUuid)) return refused("member");
  const members = state.members.map(row => row.actorUuid === actorUuid ? { actorUuid, status: "left" } : { ...row });
  return success({ ...state, members, status: members.every(row => row.status === "left") ? "ended" : "active" });
}

/** An Active Effect is a membership marker only. No dream text goes in flags. */
export function dreamEffectData(state, { actorUuid, ticket, spellUuid, messageId, effectId, img, description = "" } = {}) {
  if (!valid(state) || !activeDreamMembers(state, state.startsAt).includes(actorUuid)
    || !ref(ticket) || !ref(spellUuid) || !ref(messageId) || !ref(effectId)) return null;
  return { _id: effectId, name: DREAM_THEATRE.name,
    img: ref(img) ? img : "icons/svg/sleep.svg", description: typeof description === "string" ? description : "",
    origin: spellUuid, disabled: false, transfer: false, statuses: [], system: { changes: [] },
    start: { time: state.startsAt }, duration: { value: DREAM_THEATRE.seconds, units: "seconds", expiry: "turnStart", expired: false },
    flags: { "azeroth-rpg": { identifier: DREAM_THEATRE.identifier, cast: state.cast, messageId,
      dreamTheatre: { version: 1, ticket, cast: state.cast, casterUuid: state.casterUuid,
        actorUuid, startsAt: state.startsAt, expiresAt: state.expiresAt } } } };
}

/** Explicit expiry and suppression avoid relying on delayed document cleanup. */
export function dreamEffectActive(effect, actorUuid, now) {
  const flags = effect?.flags?.["azeroth-rpg"], mark = flags?.dreamTheatre;
  return ref(actorUuid) && clock(now) && flags?.identifier === DREAM_THEATRE.identifier
    && mark?.version === 1 && mark.actorUuid === actorUuid && ref(mark.ticket) && ref(mark.cast)
    && ref(mark.casterUuid) && clock(mark.startsAt) && mark.expiresAt === mark.startsAt + DREAM_THEATRE.seconds
    && now >= mark.startsAt && now < mark.expiresAt && !effect.disabled && !effect.isSuppressed
    && effect.active !== false && !effect.duration?.expired;
}
