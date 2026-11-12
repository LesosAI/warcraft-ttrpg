/** Actor-carried Sustains follow their caster across scenes, on the active GM. */
import { sustainTransferPending } from "../rules/sustain-transfer-suspension.mjs";
import { mindControlRecord } from "../rules/mind-control.mjs";
// O-303: who a held cast still holds, and whether a freeing ends its Sustain.
import { creatureHeld, freedEndsSustain, holdMarkOf } from "../rules/held-sustains.mjs";
const SCOPE = "azeroth-rpg";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export function sustainedSpellLive(effect) {
  const flags = effect?.flags?.[SCOPE];
  if (flags?.sustained !== true) return true;
  if (sustainTransferPending(effect)) return false;
  if (!flags.cast || !effect.origin) return false;
  if (flags.identifier === "mind-flay" && String(effect.parent?.system?.typeMarker ?? "").trim().toLowerCase() === "mindless") return false;
  let caster;
  try { caster = fromUuidSync(effect.origin); } catch { return false; }
  if (!caster || !(caster.system?.health?.value > 0)) return false;
  return (caster.getFlag(SCOPE, "sustaining") ?? []).some(entry => entry?.cast === flags.cast);
}

let pending = Promise.resolve();
export function reconcileSustainedSpells() {
  const run = async () => {
    if (!writer()) return 0;
    const actors = new Map();
    for (const actor of values(game.actors)) actors.set(actor.uuid, actor);
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
      if (token.actor) actors.set(token.actor.uuid, token.actor);
    }
    let removed = 0;
    for (const actor of actors.values()) for (const effect of values(actor.effects)) {
      if (!writer()) return removed;
      if (fromUuidSync(actor.uuid) !== actor || !values(actor.effects).includes(effect)) continue;
      // Inert transfer carriers are recovery evidence, not orphan spells. The
      // same marker stops tick consumers through sustainedSpellLive above.
      if (sustainTransferPending(effect)) continue;
      if (effect.flags?.[SCOPE]?.sustained !== true || sustainedSpellLive(effect)) continue;
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      removed++;
    }
    return removed;
  };
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}

/** A successful escape or dispel ends the corresponding domination Sustain.
 * Transfer carriers are recovery evidence and must never trigger this cleanup. */
export async function endDeletedDomination(effect) {
  const flags = effect?.flags?.[SCOPE];
  const control = flags?.identifier === 'mind-control' ? mindControlRecord(flags.mindControl) : null;
  const cast = flags?.cast ?? control?.messageUuid;
  const domination = ["compel", "dominate", "enslave-demon"].includes(flags?.identifier) && effect.statuses?.has("charmed");
  const mindControl = control && control.casterUuid === effect.origin
    && control.targetUuid === effect.parent?.uuid && control.messageUuid === cast;
  if (!writer() || (!mindControl && flags?.sustained !== true) || !cast || !effect.origin
    || (!domination && !mindControl) || sustainTransferPending(effect)) return false;
  const { endSustain } = await import("../dice/workflows.mjs");
  const caster = fromUuidSync(effect.origin);
  if (!writer() || !caster || !(caster.getFlag(SCOPE, "sustaining") ?? []).some(row => row.cast === cast)) return false;
  await endSustain({ actor: caster, cast });
  if ((caster.getFlag(SCOPE, "sustaining") ?? []).some(row => row.cast === cast)) throw Error("Domination Sustain cleanup incomplete");
  return true;
}

/**
 * **HOW MANY CREATURES A CAST STILL HOLDS** (O-292, O-303): every creature ON THE BOARD - the
 * actor of every token on every scene, a linked token's world actor and an unlinked token's own,
 * once each - that `rules/held-sustains.mjs#creatureHeld` calls held: above 0 Health, carrying a
 * condition effect the cast laid (`sustained`, `cast`), on or only suspended. A world actor with no
 * token on any scene is off the board (its token was deleted, O-303) and is not counted, nor is
 * `except` (the creature leaving).
 *
 * @param {string|null} cast
 * @param {{except?: string|null}} [o]  an actor uuid not to count
 * @returns {number}
 */
export function heldByCast(cast, { except = null } = {}) {
  if (!cast) return 0;
  const actors = new Map();
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  let held = 0;
  for (const actor of actors.values()) {
    if (except && actor.uuid === except) continue;
    const health = actor.system?.health?.value;
    if (creatureHeld({ effects: values(actor.effects), cast, health: typeof health === "number" ? health : null })) held++;
  }
  return held;
}

/**
 * **THE HOLD MARKS A CREATURE CARRIES**, `{cast, by}` once per cast: what a creature that has just
 * left the board, or fallen, was held by.
 *
 * @param {Actor|null} actor
 */
function holdMarksOn(actor) {
  const seen = new Map();
  for (const effect of values(actor?.effects)) {
    const mark = holdMarkOf(effect);
    if (mark && !seen.has(mark.cast)) seen.set(mark.cast, mark);
  }
  return [...seen.values()];
}

/** The hold marks the creatures on a deleted scene carried, once per cast. */
export function sceneHoldMarks(scene) {
  const seen = new Map();
  for (const token of values(scene?.tokens)) {
    for (const mark of holdMarksOn(actorOfToken(token))) if (!seen.has(mark.cast)) seen.set(mark.cast, mark);
  }
  return [...seen.values()];
}

/** The actor a deleted token stood for: its synthetic actor, else its world actor. */
function actorOfToken(token) {
  let actor = null;
  try { actor = token?.actor ?? null; } catch { actor = null; }
  if (!actor && token?.actorId) actor = game.actors?.get?.(token.actorId) ?? null;
  return actor;
}

/**
 * **ONE END AT A TIME** (O-303; D-760's one-queue rule for this door): two freeings landing at once
 * (a GM deleting both of a creature's conditions in one batch, a token and its actor deleted
 * together) both judge against the board as it stands when their turn comes, and the caster's
 * list is read again inside the turn, so a Sustain is never ended twice.
 */
let ending = Promise.resolve();

/**
 * **A HELD SUSTAIN ENDS WHEN ITS LAST CREATURE IS FREED, BY ANY ROUTE** (O-303; the lead,
 * 2026-11-10: *"303 - end it however the creature is freed of the effect"*): on the active GM, for
 * each cast named, where the caster still holds it and no creature on the board is held by it
 * (`rules/held-sustains.mjs#freedEndsSustain`) - through the one door that ends one Sustain
 * (`workflows.endSustain`, matched on the cast), so the upkeep stops and the sweep takes whatever
 * else the cast laid. A Sustain that another door ended first finds nothing to end, and the
 * sweep's own deletes of a cast already gone find its caster holding nothing. Answers how many it
 * ended.
 *
 * @param {Array<{cast: string, by: string|null}>} marks
 * @returns {Promise<number>}
 */
export function endFreedSustains(marks = []) {
  const run = async () => {
    if (!writer()) return 0;
    let ended = 0;
    const done = new Set();
    for (const mark of marks ?? []) {
      if (!mark?.cast || !mark.by || done.has(mark.cast)) continue;
      done.add(mark.cast);
      let caster = null;
      try { caster = fromUuidSync(mark.by); } catch { caster = null; }
      if (!caster) continue;
      const casterHolds = (caster.getFlag(SCOPE, "sustaining") ?? []).some(row => row?.cast === mark.cast);
      if (!freedEndsSustain({ casterHolds, othersHeld: heldByCast(mark.cast) })) continue;
      const { endSustain } = await import("../dice/workflows.mjs");
      if (!writer()) return ended;
      if (await endSustain({ actor: caster, cast: mark.cast, notice: "AZEROTH.Escape.SustainLeftNotice" })) ended++;
    }
    return ended;
  };
  const next = ending.then(run, run);
  ending = next.catch(() => {});
  return next;
}

/**
 * **WHICH CASTS A CHANGE TO AN EFFECT MAY HAVE FREED A CREATURE FROM** (O-303): a hold carrier
 * deleted, switched off, or stripped of its conditions. Pure over the effect and the change.
 *
 * @param {ActiveEffect} effect
 * @param {object|null} [changed]  an update's changes, or null for a delete
 * @returns {Array<{cast: string, by: string|null}>}
 */
export function freedBy(effect, changed = null) {
  if (changed === null) {
    const mark = holdMarkOf(effect);
    return mark ? [mark] : [];
  }
  const off = changed?.disabled === true;
  const stripped = Object.hasOwn(changed ?? {}, "statuses");
  if (!off && !stripped) return [];
  // The mark as it stood: an update that strips the conditions leaves none to read it by.
  const flags = effect?.flags?.[SCOPE] ?? {};
  if (flags.sustained !== true || typeof flags.cast !== "string" || !flags.cast) return [];
  const before = holdMarkOf({ ...effect, flags: effect.flags, origin: effect.origin, statuses: ["held"] });
  return before ? [before] : [];
}

export function registerSustainedSpellHooks() {
  const sweep = () => {
    if (writer()) void reconcileSustainedSpells().catch(error => {
      console.warn("azeroth-rpg | Sustained spell cleanup", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.SustainCleanupFailed"));
    });
  };
  for (const hook of ["updateActor", "deleteActor", "deleteToken", "createActiveEffect", "updateUser"]) Hooks.on(hook, sweep);
  const freed = marks => {
    if (!writer() || !marks.length) return;
    void endFreedSustains(marks).catch(error => {
      console.warn("azeroth-rpg | Sustain left empty", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.SustainCleanupFailed"));
    });
  };
  Hooks.on("deleteActiveEffect", effect => {
    void endDeletedDomination(effect).catch(error => {
      console.warn("azeroth-rpg | Domination Sustain cleanup", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.SustainCleanupFailed"));
    });
    // O-292, O-303: the last creature freed of a held spell, by ANY route - a passed escape, a
    // GM's hand, Unfading, a rest, an expiry - ends its Sustain.
    freed(freedBy(effect));
  });
  // A condition switched off or stripped rather than deleted (O-303). A suspension that switches
  // it back on is not a freeing (`rules/held-sustains.mjs#suspendedOnly`).
  Hooks.on("updateActiveEffect", (effect, changed) => freed(freedBy(effect, changed)));
  // A creature off the board, or fallen, is freed (O-303): what it was held by is read off it.
  Hooks.on("deleteToken", token => freed(holdMarksOn(actorOfToken(token))));
  // **A SCENE DELETED TAKES ITS TOKENS OFF THE BOARD WITH NO `deleteToken`** (stage 11, D-906;
  // CLAUDE.md §15: 14.367's `Scene#_onDelete` never visits its tokens). The deleted scene's object
  // still holds them on the client and `game.scenes` no longer does, so the creatures standing on
  // it are read here and judged against the board without them, through the one queue.
  Hooks.on("deleteScene", scene => freed(sceneHoldMarks(scene)));
  Hooks.on("deleteActor", actor => freed(holdMarksOn(actor)));
  Hooks.on("updateActor", (actor, changed) => {
    const health = foundry.utils.getProperty(changed ?? {}, "system.health.value");
    if (typeof health === "number" && health <= 0) freed(holdMarksOn(actor));
  });
  Hooks.once("ready", sweep);
}
