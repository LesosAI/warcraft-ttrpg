/** Soul Link endpoint/lifetime reader and active-GM cleanup.
 * Creation/consent and damage delivery use this reader; neither is implied by
 * the existence of a carrier. V14 origin/duration and moveToken's accepted
 * waypoints/destination verified against installed Foundry 14.367.
 */
import { soulLinkAvailability } from "../rules/soul-link.mjs";
import { feetApart } from "../canvas/footprints.mjs";

const SCOPE = "azeroth-rpg";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const unknown = reason => ({ active: false, ended: false, reason });
function resolve(uuid) {
  try { return { document: fromUuidSync(uuid), failed: false }; }
  catch { return { document: null, failed: true }; }
}

/** A versioned carrier lives on the caster, naming exact actor and token UUIDs.
 * Missing geometry suspends transfer; it never guesses a different active token.
 * `position` is an accepted movement waypoint, not a proposed movement plan.
 */
export function soulLinkState(effect, { tokenUuid = null, position = null } = {}) {
  const flags = effect?.flags?.[SCOPE];
  const link = flags?.soulLink;
  if (flags?.identifier !== "soul-link" || link?.version !== 1
    || typeof flags.cast !== "string" || !flags.cast
    || typeof link.casterUuid !== "string" || !link.casterUuid
    || typeof link.recipientUuid !== "string" || !link.recipientUuid
    || effect.parent?.uuid !== link.casterUuid) return unknown("carrier");
  const caster = resolve(link.casterUuid), recipient = resolve(link.recipientUuid);
  if (caster.failed || recipient.failed) return unknown("endpointUnknown");
  if (!caster.document || !recipient.document) return { active: false, ended: true, reason: "endpointDeleted" };
  if (caster.document !== effect.parent) return unknown("staleCaster");
  let distance = null;
  const sourceToken = link.sourceTokenUuid ? resolve(link.sourceTokenUuid).document : null;
  const targetToken = link.targetTokenUuid ? resolve(link.targetTokenUuid).document : null;
  if (sourceToken?.actor?.uuid === link.casterUuid && targetToken?.actor?.uuid === link.recipientUuid) {
    distance = feetApart(sourceToken, targetToken, {
      from: sourceToken.uuid === tokenUuid ? position ?? {} : {},
      to: targetToken.uuid === tokenUuid ? position ?? {} : {}
    });
  }
  const duration = effect._source?.duration ?? effect.duration ?? {};
  const start = effect._source?.start ?? effect.start;
  const seconds = duration.units === "seconds" ? duration.value : effect.duration?.seconds;
  const expiresAt = Number.isFinite(start?.time) && Number.isFinite(seconds)
    && seconds >= 0 ? start.time + seconds : null;
  return { ...soulLinkAvailability({
    casterHealth: caster.document.system?.health?.value,
    recipientHealth: recipient.document.system?.health?.value,
    worldTime: game.time?.worldTime, expiresAt, distance,
    enabled: !effect.disabled && !effect.isSuppressed && effect.active !== false
  }), caster: caster.document, recipient: recipient.document, distance };
}

let pending = Promise.resolve();
function actorsInWorld() {
  const actors = new Map();
  for (const actor of values(game.actors)) actors.set(actor.uuid, actor);
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  return actors;
}
function identity(effect) {
  const flags = effect.flags?.[SCOPE], link = flags?.soulLink;
  const duration = effect._source?.duration ?? effect.duration ?? {};
  const start = effect._source?.start ?? effect.start;
  return JSON.stringify([flags?.cast, link?.version, link?.casterUuid, link?.recipientUuid,
    link?.sourceTokenUuid, link?.targetTokenUuid, start?.time, duration.value, duration.units]);
}
const record = (actor, effect) => ({ actorUuid: actor.uuid, effectId: effect.id, identity: identity(effect) });
function linksTo(uuid) {
  return [...actorsInWorld().values()].flatMap(actor => values(actor.effects).flatMap(effect => {
    const flags = effect.flags?.[SCOPE], link = flags?.soulLink;
    return flags?.identifier === "soul-link" && link?.version === 1
      && [link.casterUuid, link.recipientUuid].includes(uuid)
      ? [record(actor, effect)] : [];
  }));
}
export function reconcileSoulLinks({ tokenUuid = null, positions = [], broken = [] } = {}) {
  // Capture the event against the effects that existed when it arrived, not
  // whatever a delayed writer finds after another cast or a clock correction.
  const observed = broken.map(row => ({ ...row }));
  if (writer()) for (const actor of actorsInWorld().values()) for (const effect of values(actor.effects)) {
    if (soulLinkState(effect).ended || positions.some(position =>
      soulLinkState(effect, { tokenUuid, position }).ended)) observed.push(record(actor, effect));
  }
  const run = async () => {
    if (!writer()) return 0;
    const actors = actorsInWorld();
    let removed = 0;
    for (const actor of actors.values()) for (const effect of values(actor.effects)) {
      if (!writer()) return removed;
      if (resolve(actor.uuid).document !== actor || !values(actor.effects).includes(effect)) continue;
      const observedBreak = observed.some(row => row.actorUuid === actor.uuid && row.effectId === effect.id
        && row.identity === identity(effect));
      const ended = observedBreak || soulLinkState(effect).ended;
      if (!ended) continue;
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      removed++;
    }
    return removed;
  };
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}

export function registerSoulLinkHooks() {
  const sweep = options => {
    if (writer()) void reconcileSoulLinks(options).catch(error => {
      console.warn("azeroth-rpg | Soul Link cleanup", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.SoulLink.CleanupFailed"));
    });
  };
  // Capture the exact existing links when Health hits zero. Healing before the
  // queued sweep must not resurrect them or remove a newer, different cast.
  Hooks.on("updateActor", actor => sweep({ broken: actor.system?.health?.value === 0 ? linksTo(actor.uuid) : [] }));
  for (const hook of ["deleteActor", "updateToken", "deleteToken", "updateWorldTime",
    "createActiveEffect", "updateActiveEffect", "updateUser"]) Hooks.on(hook, () => sweep());
  Hooks.on("moveToken", (document, movement) => sweep({ tokenUuid: document.uuid,
    positions: [...(movement?.passed?.waypoints ?? []), movement?.destination].filter(Boolean) }));
  Hooks.once("ready", () => sweep());
}
