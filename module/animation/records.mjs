/**
 * WHAT THE WORLD SAYS HAPPENED, in the shapes the law reads (D-729).
 *
 * `rules/animation.mjs` is pure and knows nothing about Foundry: it takes a
 * RECORD (one completed action) and FACTS (what this client can see), or a
 * STATE (what the world currently holds), and answers with pictures. This is
 * the reader that builds all three, and it is the only place in
 * `module/animation/` that touches a document.
 *
 * Everything it reads was written where the action happened (D-724 to D-726):
 * `source` and `strike` on the card, `cast`, `identifier` and `success` on a
 * spell card, `cast` on the Region a card placed and on the effect it laid,
 * `cast` and `targets` on the Sustain entry, and the per-target Resist record.
 * **A missing key means NOTHING RECORDED** - never a guess. That is why a
 * wrong creature is impossible here rather than merely unlikely.
 *
 * Two things this file is careful about:
 *
 *  - **`visible` is `token.visible && !(doc.hidden && !isGM)`, never
 *    `Token#isVisible`.** The latter re-runs vision testing from the token's
 *    own point of view and answers a different question; `visible` is what the
 *    board is actually drawing for this reader.
 *  - **One entry per (effect, token) PAIR.** A linked actor standing on the
 *    board twice is two creatures wearing one effect, and collapsing them to
 *    one would leave the second bare.
 */

import { pixelsPerFoot } from "../canvas/regions.mjs";
import { loopIdentifiers } from "../rules/animation-table.mjs";
import { librariesOn, soundsOn } from "./availability.mjs";

/**
 * The spells whose row loops on a recorded Resilience Test, which is the only
 * binding `state.resists` feeds. **Empty in the shipped table** (D-727), so
 * `resistsFor` never walks chat; a row the lead later picks fills it and
 * nothing else changes.
 */
const RESISTED_IDENTIFIERS = new Set(loopIdentifiers("sustain-resisted"));

/* ------------------------------------------------------------------ */
/*  What this client may not see (D-729)                               */
/* ------------------------------------------------------------------ */

/**
 * THE CASTS WHOSE CARD THIS CLIENT MAY NOT READ.
 *
 * `plan` refuses a cue on a card that is not `isContentVisible`, and a LOOP had
 * no such gate: a GM casting Immolation on a visible NPC as a blind or private
 * roll hid the card and then stood a flame over the creature on every screen,
 * because the loop is computed from the caster's `sustaining` FLAG, which a
 * player can read where the card is hidden from them. That is the design
 * document's sixth integration rule - *private rolls must not broadcast hidden
 * results through effects or sound* - and it is the one gate the world state
 * cannot supply on its own, because the world state is not what was private.
 *
 * **THE RULE: a loop is dropped only where this client KNOWS the cast's card
 * and may not read it.** A cast this client knows no card for still plays - a
 * held Sustain whose card the GM cleared is world state, not a private roll,
 * and treating an unknown card as private would silently stop every loop in a
 * world whose chat had been swept. The set therefore only ever grows from cards
 * this client has actually seen, and a card that IS readable takes its cast
 * back out again.
 */
const PRIVATE_CASTS = new Set();

/** Whether chat has been read for what this client may not see. */
let privacySeeded = false;

/**
 * THE SET `visibleLoops` FILTERS BY, and it seeds itself.
 *
 * **The seeding window is the whole risk of the gate.** `visibleLoops` takes an
 * empty set as *nothing is private* - a pure function cannot fail closed
 * without breaking every loop for a caller that omits the option - so a reader
 * asking before chat has been read would be told a private cast is public, ONCE,
 * and play it. The one reliable guard is here rather than in a hook order: the
 * first reader to ask, whoever it is and whenever, reads chat first. The
 * director's own walk at `ready` and at the settle gate then finds this already
 * done and costs nothing.
 */
export function privateCasts() {
  if (!privacySeeded && game.messages) seedPrivacy();
  return PRIVATE_CASTS;
}

/** Read chat once for what this client may not see. Returns whether it walked. */
export function seedPrivacy() {
  if (privacySeeded) return false;
  privacySeeded = true;
  for (const message of game.messages?.contents ?? []) notePrivacy(message);
  return true;
}

/** Say the walk has been made, for a caller that folded it into its own. */
export function markPrivacySeeded() {
  privacySeeded = true;
}

/**
 * Take note of one card's privacy. Called for every card as it arrives and for
 * every card already in chat at `ready`.
 */
export function notePrivacy(message) {
  const cast = flagsOf(message).cast ?? null;
  if (!cast) return;
  if (message?.isContentVisible === false) PRIVATE_CASTS.add(cast);
  else PRIVATE_CASTS.delete(cast);
}

/** The flags every record is read out of. */
function flagsOf(document) {
  return document?.flags?.["azeroth-rpg"] ?? {};
}

/** The scene being looked at. */
function viewed() {
  return canvas?.scene ?? null;
}

/* ------------------------------------------------------------------ */
/*  Facts: what this client can see                                    */
/* ------------------------------------------------------------------ */

/**
 * Every token on the viewed scene, as the law wants them: CENTRES in pixels,
 * pixel width and height, and whether this reader can see it.
 */
export function tokenFacts(ids = null) {
  const out = {};
  const isGM = game.user?.isGM === true;
  const wanted = ids instanceof Set ? ids : null;
  for (const token of canvas?.tokens?.placeables ?? []) {
    const id = token?.id;
    if (!id || (wanted && !wanted.has(id))) continue;
    const doc = token.document;
    const centre = token.center ?? null;
    if (!centre) continue;
    out[id] = {
      x: centre.x,
      y: centre.y,
      width: token.w ?? 0,
      height: token.h ?? 0,
      // NOT `Token#isVisible`: that asks whether the token WOULD be seen from
      // its own vision test. `visible` is what is on the screen, and the
      // hidden clause is what keeps a GM's hidden creature from being given
      // away by a flame standing over it.
      visible: token.visible === true && !(doc?.hidden === true && !isGM)
    };
  }
  return out;
}

/**
 * The facts one `plan` call needs. `contentVisible` rides on the record so a
 * card the chat selector hid never announces itself on the board.
 *
 * **`libraries` is not optional.** `plan` treats a missing list as *every
 * library is on*, which is the opposite of what a disabled module means.
 */
export function factsFor(record = null, ids = null) {
  return {
    sceneId: viewed()?.id ?? null,
    contentVisible: record?.contentVisible !== false,
    soundsOn: soundsOn(),
    libraries: librariesOn(),
    pxPerFt: pixelsPerFoot(viewed()),
    tokens: tokenFacts(ids)
  };
}

/* ------------------------------------------------------------------ */
/*  Records: one completed action                                      */
/* ------------------------------------------------------------------ */

/**
 * The spell card one join answers to: by its own id, then by a scan on `cast`.
 *
 * A GM who clears chat mid-fight orphans the card, and the scan finds nothing;
 * the caller then reads the cast as unproven, which is what makes a Region
 * placed from a card nobody can check play nothing at all.
 */
export function linkedCard(messageId, cast) {
  const byId = messageId ? game.messages?.get(messageId) ?? null : null;
  const flags = flagsOf(byId);
  if (byId && flags.kind === "spell" && (!cast || flags.cast === cast)) return byId;
  if (!cast) return null;
  for (const message of game.messages?.contents ?? []) {
    const f = flagsOf(message);
    if (f.kind === "spell" && f.cast === cast) return message;
  }
  return null;
}

/** An attack card's own verdict: the Attack Test's margin, not its SL (D-678). */
function hitOf(message) {
  return message?.rolls?.[0]?.outcome?.success === true;
}

/**
 * ONE COMPLETED ACTION, off its own card.
 *
 * An attack and a spell are the two kinds that animate; every other card -
 * a feature, a creature ability, a Signature, a skill Test - returns null, and
 * `plan` would answer `no-row` for it anyway.
 */
export function cardRecord(message) {
  const flags = flagsOf(message);
  const contentVisible = message?.isContentVisible !== false;
  if (flags.kind === "attack") {
    return {
      trigger: "cast",
      kind: "attack",
      contentVisible,
      sceneId: flags.source?.sceneId ?? null,
      parry: flags.parry === true,
      hit: hitOf(message),
      strike: flags.strike ?? null,
      source: flags.source ?? null,
      targets: Array.isArray(flags.targets) ? flags.targets : []
    };
  }
  if (flags.kind === "spell") {
    return {
      trigger: "cast",
      kind: "spell",
      contentVisible,
      sceneId: flags.source?.sceneId ?? null,
      identifier: flags.identifier ?? null,
      cast: flags.cast ?? null,
      success: flags.success === true,
      area: flags.area ?? null,
      source: flags.source ?? null,
      targets: Array.isArray(flags.targets) ? flags.targets : []
    };
  }
  return null;
}

/** A Region's own shape, as plain data the geometry helpers read. */
function shapeOf(region) {
  const shape = region?.shapes?.[0] ?? null;
  if (!shape?.type) return null;
  const out = { type: shape.type, x: shape.x ?? null, y: shape.y ?? null };
  if (shape.type === "circle") out.radius = shape.radius ?? null;
  else if (shape.type === "cone") {
    out.radius = shape.radius ?? null;
    out.angle = shape.angle ?? null;
    out.rotation = shape.rotation ?? 0;
  } else if (shape.type === "line") {
    out.length = shape.length ?? null;
    out.width = shape.width ?? null;
    out.rotation = shape.rotation ?? 0;
  }
  return out;
}

/**
 * The half of a spell record that comes off the card rather than off the join.
 *
 * **A CARD THAT IS GONE IS A CAST THAT CANNOT BE PROVEN**, and an unproven
 * cast reads as a failure: `plan` answers `failed-cast`. That is the safe way
 * round - 07 §8 charges the Mana for a failed Casting Test and the card still
 * offers Place area, so a Region with no card to check must not draw the
 * picture a success would.
 */
function castParts(card, flags) {
  const f = flagsOf(card);
  return {
    identifier: flags.identifier ?? f.identifier ?? null,
    cast: flags.cast ?? f.cast ?? null,
    success: f.success === true,
    area: f.area ?? null,
    source: flags.source ?? f.source ?? null,
    targets: Array.isArray(f.targets) ? f.targets : [],
    contentVisible: card ? card.isContentVisible !== false : true
  };
}

/** A REGION PLACED FROM A CARD. A measured area or a totem's aura carries no `cast`. */
export function regionRecord(region) {
  const flags = flagsOf(region);
  if (!flags.cast) return null;
  const card = linkedCard(flags.messageId ?? null, flags.cast);
  return {
    trigger: "region",
    kind: "spell",
    sceneId: region?.parent?.id ?? null,
    ...castParts(card, flags),
    region: { id: region.id, sceneId: region?.parent?.id ?? null, shape: shapeOf(region) }
  };
}

/** The token a document's holder is standing on, on the viewed scene. */
function tokenIdsOf(actor) {
  if (!actor) return [];
  const sceneId = viewed()?.id ?? null;
  if (actor.isToken) {
    const doc = actor.token ?? null;
    return doc && doc.parent?.id === sceneId ? [doc.id] : [];
  }
  return (actor.getActiveTokens?.(false, true) ?? [])
    .filter(doc => doc?.parent?.id === sceneId)
    .map(doc => doc.id);
}

/** Where an effect came FROM, for a channel drawn back to its caster. */
function originSource(effect) {
  const origin = effect?.origin ?? null;
  if (!origin) return null;
  let actor = null;
  try { actor = fromUuidSync(origin); } catch { actor = null; }
  const carrier = actor?.documentName === "Actor" ? actor : actor?.actor ?? null;
  const tokenId = tokenIdsOf(carrier)[0] ?? null;
  return tokenId ? { sceneId: viewed()?.id ?? null, tokenId } : null;
}

/**
 * AN EFFECT LAID BY A CARD'S Apply.
 *
 * This is the `cast|effect` fallback's anchor: a buff with no recorded target
 * is animated on whoever it landed on. `plan` refuses it where the cast DID
 * record targets (`recorded-targets`), so the two never both fire.
 */
export function effectRecord(effect) {
  const flags = flagsOf(effect);
  if (!flags.cast) return null;
  const card = linkedCard(flags.messageId ?? null, flags.cast);
  const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
  const tokenId = tokenIdsOf(actor)[0] ?? null;
  return {
    trigger: "effect",
    kind: "spell",
    sceneId: viewed()?.id ?? null,
    ...castParts(card, flags),
    effect: { id: effect.id, sceneId: viewed()?.id ?? null, tokenId, actorId: actor?.id ?? null }
  };
}

/**
 * A RESILIENCE TEST RECORDED ON A SPELL CARD (D-726).
 *
 * The law plays a `resist` cue only for a FAILED Test - 07's transformations
 * and banishments wait for one - and answers `resisted` for a success, which
 * is a word rather than a silence.
 *
 * @param {ChatMessage} message  the spell card
 * @param {object} entry  one `flags.azeroth-rpg.resists.<key>` record
 */
export function resistCueRecord(message, entry) {
  const flags = flagsOf(message);
  if (flags.kind !== "spell" || !entry?.key) return null;
  return {
    trigger: "resist",
    kind: "spell",
    contentVisible: message?.isContentVisible !== false,
    sceneId: flags.source?.sceneId ?? entry.sceneId ?? null,
    identifier: flags.identifier ?? null,
    cast: flags.cast ?? null,
    success: flags.success === true,
    area: flags.area ?? null,
    source: flags.source ?? null,
    targets: Array.isArray(flags.targets) ? flags.targets : [],
    resist: {
      tokenId: entry.tokenId ?? null,
      actorId: entry.actorId ?? null,
      success: entry.success === true
    }
  };
}

/* ------------------------------------------------------------------ */
/*  State: what the world currently holds                              */
/* ------------------------------------------------------------------ */

/**
 * Every actor that could be holding a Sustain or wearing a laid effect: the
 * world's own, and the unlinked actors standing on the viewed scene.
 *
 * The same two lists `liftSpellEffects` walks, and for the same reason -
 * a Sustain is held by an actor, and an actor is either the world's or a
 * token's.
 */
function carriers() {
  const seen = new Set();
  const out = [];
  for (const actor of game.actors ?? []) {
    if (actor && !seen.has(actor.uuid)) { seen.add(actor.uuid); out.push(actor); }
  }
  for (const token of viewed()?.tokens ?? []) {
    const actor = token.actor;
    if (actor && !seen.has(actor.uuid)) { seen.add(actor.uuid); out.push(actor); }
  }
  return out;
}

/**
 * THE RESILIENCE TESTS RECORDED FOR THE CASTS CURRENTLY HELD.
 *
 * **ONLY THE CASTS OF A SPELL WHOSE ROW ACTUALLY TAKES A `sustain-resisted`
 * LOOP**, and the shipped table has none (D-727), so on every world today this
 * is handed an empty set and does not touch chat at all. That matters: the
 * walk is thousands of messages on a long session's log, and the reconcile
 * runs on every token move, every effect and every Region change while a fight
 * is going on. Gating it on the Sustain alone would have walked the log on
 * every stride of a held Blizzard, for a binding nothing uses.
 *
 * Newest first, because a re-rolled Test is the one the table accepted (D-726).
 */
function resistsFor(casts) {
  if (!casts.size) return [];
  const out = [];
  const messages = game.messages?.contents ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const flags = flagsOf(messages[i]);
    if (flags.kind !== "spell" || !flags.cast || !casts.has(flags.cast)) continue;
    for (const record of Object.values(flags.resists ?? {})) {
      if (!record?.key) continue;
      out.push({
        cast: flags.cast,
        tokenId: record.tokenId ?? null,
        actorId: record.actorId ?? null,
        sceneId: record.sceneId ?? null,
        success: record.success === true
      });
    }
  }
  return out;
}

/**
 * WHAT THE WORLD HOLDS, as `loopsFor` reads it.
 *
 * Every ending falls out of this: a Sustain dropped by any of its five paths
 * is an entry that is no longer here, a deleted effect is a row that is gone,
 * a deleted Region the same, and a scene change rebuilds the whole snapshot.
 * There is no "end the loop" code path anywhere in this layer.
 *
 * @param {{resisted?: Set<string>}} [options]  which identifiers take a
 *   `sustain-resisted` loop. Defaults to the shipped table's (an empty set);
 *   a caller injecting a table into `loopsFor` passes the matching set here,
 *   or the loop it added would find no record to stand on.
 */
export function stateSnapshot({ resisted = RESISTED_IDENTIFIERS } = {}) {
  const scene = viewed();
  const sceneId = scene?.id ?? null;
  const sustains = [];
  const effects = [];
  const regions = [];

  for (const actor of carriers()) {
    for (const entry of actor.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
      if (!entry?.cast) continue;
      sustains.push({
        cast: entry.cast,
        identifier: entry.identifier ?? null,
        name: entry.name ?? null,
        actorId: actor.id,
        source: entry.source ?? null,
        targets: Array.isArray(entry.targets) ? entry.targets : []
      });
    }
    const tokenIds = tokenIdsOf(actor);
    if (!tokenIds.length) continue;
    for (const effect of actor.effects ?? []) {
      const flags = flagsOf(effect);
      if (!flags.cast) continue;
      const source = originSource(effect);
      // ONE ROW PER (EFFECT, TOKEN) PAIR: a linked actor standing on the board
      // twice wears one effect and is two creatures.
      for (const tokenId of tokenIds) {
        effects.push({
          id: effect.id,
          cast: flags.cast,
          identifier: flags.identifier ?? null,
          active: effect.active !== false,
          sceneId,
          tokenId,
          actorId: actor.id,
          name: flags.spellName ?? effect.name ?? null,
          source
        });
      }
    }
  }

  for (const region of scene?.regions ?? []) {
    const flags = flagsOf(region);
    if (!flags.cast) continue;
    regions.push({
      id: region.id,
      sceneId,
      cast: flags.cast,
      identifier: flags.identifier ?? null,
      shape: shapeOf(region)
    });
  }

  return {
    sceneId,
    isGM: game.user?.isGM === true,
    pxPerFt: pixelsPerFoot(scene),
    tokens: tokenFacts(),
    sustains,
    effects,
    regions,
    // See `resistsFor`: the casts of a SUSTAIN WHOSE ROW TAKES THAT BINDING,
    // never every held Sustain. The shipped table makes this an empty set.
    resists: resistsFor(new Set(sustains.filter(s => resisted.has(s.identifier)).map(s => s.cast)))
  };
}
