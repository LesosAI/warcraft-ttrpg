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
 *
 * **AND WHAT A FEATURE'S DOORS RECORDED** (the Legacy branches' door 2;
 * `rules/animation-records.mjs` is its law): a feature's or a creature ability's
 * card (`source`, `featureKey`, `casting`, `success`, `steps`, `risen`, `hold`),
 * the steps on a spell's card, an attack card's `fromFeature`, `patchedBy` and
 * `ridden`, Hold the Thread's card and a raise's, a Region a feature placed, the
 * catch a floor records on its effect, and the states every Legacy door lays -
 * which name the feature that laid them by its NAME, `source: item.name`, so the
 * key is that name's slug and no second record is needed.
 */

import { pixelsPerFoot } from "../canvas/regions.mjs";
import { loopIdentifiers } from "../rules/animation-table.mjs";
import {
  CONDITION_MARK_FLAGS, abilityKeyOf, actorIdOfUuid, anchorVisible, cleanFromFeature, cleanHold, cleanRisen, cleanSteps,
  featurePrivacyKey, hitKeysOf, regionShown, slugOf, stateCast, stateEntriesOf, stateLayerOf, tokenRef
} from "../rules/animation-records.mjs";
import { CHALLENGE_FLAG, WATCH_FLAG } from "../rules/marks.mjs";
import { TRAP_FLAG } from "../rules/traps.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
import { CUTTING_GEAR } from "../rules/escapes.mjs";
import { librariesOn, soundsOn } from "./availability.mjs";
import { reflectionPaths } from "../rules/reflection.mjs";

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
  for (const message of game.messages?.contents ?? []) notePrivacy(message, { at: 0 });
  return true;
}

/** Say the walk has been made, for a caller that folded it into its own. */
export function markPrivacySeeded() {
  privacySeeded = true;
}

/**
 * **THE LAST FEATURE CARD THIS CLIENT SAW, BY (USER, FEATURE)** (the B4 review): when it
 * arrived and whether it was private here. `rules/animation-records.mjs
 * #stateCueVerdict` reads it, so a state laid before its Use's card waits for the card.
 */
const FEATURE_CARDS = new Map();

/**
 * Take note of one card's privacy. Called for every card as it arrives and for
 * every card already in chat at `ready`.
 *
 * **AND A FEATURE'S CARD NOTES ITS (USER, FEATURE) PAIR** (the B4 review: D-729's rule
 * never reached a feature, whose states and loops carry no `cast`): a Use's card this
 * client may not read puts `feature:<actor>:<key>` in the same set, which every loop
 * and every cue of what that Use laid is filtered by - and a readable card of the same
 * pair takes it back out, as a readable spell card takes its cast.
 */
export function notePrivacy(message, { at = Date.now() } = {}) {
  const flags = flagsOf(message);
  const hidden = message?.isContentVisible === false;
  const cast = flags.cast ?? null;
  if (cast) {
    if (hidden) PRIVATE_CASTS.add(cast);
    else PRIVATE_CASTS.delete(cast);
  }
  const key = cardPrivacyKey(message);
  if (!key) return;
  if (hidden) PRIVATE_CASTS.add(key);
  else PRIVATE_CASTS.delete(key);
  // `at` is when THIS client saw it arrive; a card read out of chat at `ready` is 0, so
  // it never speaks for a state laid now (`stateCueVerdict`'s freshness).
  FEATURE_CARDS.set(key, { at, private: hidden });
}

/**
 * The (user, feature) pair a feature's or a creature ability's card names: its speaker's
 * actor and its `featureKey`. Null for any other card.
 */
export function cardPrivacyKey(message) {
  const flags = flagsOf(message);
  if (flags.kind !== "feature" && flags.kind !== "ability") return null;
  return featurePrivacyKey(message?.speaker?.actor ?? null, flags.featureKey ?? null);
}

/** The last feature card noted for one pair, or null. */
export function featureCardSeen(key) {
  return key ? FEATURE_CARDS.get(key) ?? null : null;
}

/** Whether this client knows the pair's last card was private. */
function pairPrivate(key) {
  return Boolean(key) && privateCasts().has(key);
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
      // away by a flame standing over it. **A token still DRAWING is read off
      // its document** (the B4 review): `PlaceableObject#draw` holds `visible`
      // and `renderable` false until its texture is in, which refused every
      // `rise` cue on a summon whose art was not cached.
      visible: anchorVisible({ visible: token.visible === true, drawing: token.renderable === false, hidden: doc?.hidden === true, isGM })
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
 * ONE COMPLETED ACTION, off its own card: the card's PRIMARY record.
 *
 * An attack, a spell and - since the Legacy branches' door 2 - a feature's or a
 * creature ability's Use, Hold the Thread's card and a raise's card animate; every
 * other card - a Signature, a skill Test, a rest - returns null, and `plan` would
 * answer `no-row` for it anyway. **A missing key is nothing recorded**: a feature
 * card posted before door 2 names no `featureKey` and answers `no-row`.
 *
 * `cardRecords` is the whole list a card implies - this record, then the `hit`,
 * `arrive`, `rise` and `hold` records its own facts add.
 */
export function cardRecord(message) {
  const flags = flagsOf(message);
  const contentVisible = message?.isContentVisible !== false;
  if (flags.kind === "attack") {
    const fromFeature = cleanFromFeature(flags.fromFeature);
    return {
      trigger: "cast",
      kind: "attack",
      contentVisible,
      sceneId: flags.source?.sceneId ?? null,
      parry: flags.parry === true,
      hit: hitOf(message),
      strike: flags.strike ?? null,
      // What drew the blow beside its form (door 2): the feature card it was made
      // from - **carrying THAT card's verdict** (the B4 review: a Use whose Casting
      // Test failed still drew its strike and cued its hit), the bound attack patches
      // that shaped it, and the riders it carried (a rider's row may draw the blow too:
      // 04's Black Arrow, Storm Bolt, Shadow Strike).
      fromFeature: fromFeature ? { ...fromFeature, success: featureCardLanded(fromFeature.messageId) } : null,
      patchedBy: Array.isArray(flags.patchedBy) ? flags.patchedBy.filter(k => typeof k === "string" && k) : [],
      ridden: Array.isArray(flags.ridden) ? flags.ridden.filter(k => typeof k === "string" && k) : [],
      source: flags.source ?? null,
      targets: Array.isArray(flags.targets) ? flags.targets : []
    };
  }
  if (flags.kind === "spell") {
    const relayPlacement = flags.spellRelayPlacement;
    const relayOrigin = relayPlacement?.sceneId === flags.source?.sceneId
      && Number.isFinite(relayPlacement?.origin?.x) && Number.isFinite(relayPlacement?.origin?.y)
      ? { sceneId: relayPlacement.sceneId, x: relayPlacement.origin.x, y: relayPlacement.origin.y,
        ...(Number.isFinite(relayPlacement.rotation) ? { rotation: relayPlacement.rotation } : {}) }
      : null;
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
      // The caster remains `source` for identity. Relay's reviewed placement
      // supplies the visual launch point for the same spell card.
      relayOrigin,
      targets: Array.isArray(flags.targets) ? flags.targets : [],
      // Where the spell moved its caster and its party (Shadow Walk, Dark Passage).
      steps: cleanSteps(flags.steps)
    };
  }
  // **A USE** (door 2): a feature's card, or a creature ability's - one table, the
  // ability's key under `ability:`. A Use that made a Casting Test animates only on
  // its success; one that made none is its own proof.
  if (flags.kind === "feature" || flags.kind === "ability") {
    const casting = flags.casting === true;
    return featureRecord({
      trigger: "use", contentVisible,
      sceneId: flags.source?.sceneId ?? null,
      identifier: flags.featureKey ?? null,
      casting,
      success: casting ? flags.success === true : flags.success !== false,
      area: flags.area ?? null,
      source: tokenRef(flags.source),
      targets: Array.isArray(flags.targets) ? flags.targets : [],
      steps: cleanSteps(flags.steps),
      risen: cleanRisen(flags.risen),
      hold: cleanHold(flags.hold)
    });
  }
  // **A DEATH STEP HELD BACK** (04's Hold the Thread; `AzerothActor#takeDeathStep`):
  // the holder who answered and the creature it spared.
  if (flags.kind === "deathHold") {
    const targets = (Array.isArray(flags.targets) ? flags.targets : []).map(tokenRef).filter(Boolean);
    return featureRecord({
      trigger: "hold", contentVisible,
      sceneId: flags.source?.sceneId ?? targets[0]?.sceneId ?? null,
      identifier: flags.featureKey ?? null,
      source: tokenRef(flags.source),
      targets
    });
  }
  // **A SUMMON'S ARRIVAL CARD** (04's Dark Minion's raise, `effects/after-blow.mjs`;
  // a creature's summon placed from its card, `dice/chat.mjs#placeSummonFromCard`):
  // the tokens that rose, and the key of what called them.
  if (flags.kind === "summon") {
    const risen = cleanRisen(flags.risen);
    return featureRecord({
      trigger: "rise", contentVisible,
      sceneId: flags.source?.sceneId ?? risen[0]?.sceneId ?? null,
      identifier: flags.featureKey ?? null,
      source: tokenRef(flags.source),
      risen
    });
  }
  // **A CONSTRUCT'S CUTTING GEAR** (14 §13's Tinker constructs; the lead, 2026-10-22):
  // its own card (`effects/legacy-uses.mjs#useCuttingGear`), which names the construct
  // as its SPEAKER - `ChatMessage.getSpeaker` records the token it spoke from, at the
  // moment it spoke - and nothing else; the ability's key is its name's.
  if (flags.kind === "cuttingGear") {
    const source = speakerToken(message);
    return featureRecord({
      trigger: "use", contentVisible,
      sceneId: source?.sceneId ?? null,
      identifier: abilityKeyOf(CUTTING_GEAR.name),
      source
    });
  }
  return null;
}

/** The token a card's speaker names, as a record keeps one, or null. */
function speakerToken(message) {
  const speaker = message?.speaker ?? null;
  return speaker?.token ? tokenRef({ sceneId: speaker.scene ?? null, tokenId: speaker.token }) : null;
}

/**
 * **WHETHER THE FEATURE CARD AN ATTACK WAS MADE FROM LANDED ITS USE** (the B4 review): a
 * Use that made a Casting Test landed on its success, and one that made none is its own
 * proof - `cardRecord`'s own reading of a Use's card. **A card that is gone is a Use
 * that cannot be proven**, and reads as one that failed: the attack then plays its own
 * form, and the feature's `hit` cue does not play (the spell's rule, D-728).
 */
function featureCardLanded(messageId) {
  const card = messageId ? game.messages?.get(messageId) ?? null : null;
  const flags = flagsOf(card);
  if (!card || (flags.kind !== "feature" && flags.kind !== "ability")) return false;
  return flags.casting === true ? flags.success === true : flags.success !== false;
}

/**
 * A feature record with every key `plan` reads, the absent ones empty. `states` are the
 * flags a laid state's arrival named its feature in (`rules/animation-records.mjs
 * #stateEntriesOf`), which a row's `state` reads; `privacy` the (user, feature) pair a
 * state's record answers to (`featurePrivacyKey`), which the director holds a state's
 * cue against until its Use's card has said whether it was private.
 */
function featureRecord({
  trigger, contentVisible = true, sceneId = null, identifier = null, casting = false, success = true,
  area = null, source = null, targets = [], steps = [], risen = [], hold = null, hit = undefined,
  effect = undefined, region = undefined, states = undefined, privacy = undefined
} = {}) {
  return {
    trigger, kind: "feature", contentVisible, sceneId, identifier, casting, success, area, source,
    targets, steps, risen, hold,
    ...(hit !== undefined ? { hit } : {}),
    ...(effect !== undefined ? { effect } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(states !== undefined ? { states } : {}),
    ...(privacy !== undefined ? { privacy } : {})
  };
}

/**
 * **EVERY RECORD ONE CARD IMPLIES** (the Legacy branches' door 2), each planned on
 * its own:
 *
 * - the card's primary record (`cardRecord`);
 * - on an attack that is no Parry, a `hit` record for each key its hit answers to
 *   (`rules/animation-records.mjs#hitKeysOf`: the feature card it was made from, the
 *   bound attack patches, the riders), carrying the blow's own verdict - a miss is
 *   the law's `missed`, said rather than silent;
 * - on a spell's card or a Use's that recorded a step, an `arrive` record;
 * - on a Use's card that stood something up, a `rise` record, and one that turned a
 *   hit into a miss, a `hold` record on the user it held.
 *
 * @param {ChatMessage} message
 * @returns {object[]}
 */
export function cardRecords(message) {
  const primary = cardRecord(message);
  if (!primary) return [];
  const out = [primary];
  if (primary.kind === "spell") {
    const paths = reflectionPaths(flagsOf(message));
    if (paths.length) {
      // The spell travels to the protected creature; only its returned payload
      // targets the caster. The second cue is an indicator, not a second cast.
      primary.targets = [...primary.targets];
      for (const path of paths) {
        primary.targets[path.index] = path.source;
        out.push(featureRecord({ trigger: "use", contentVisible: primary.contentVisible,
          sceneId: primary.sceneId, identifier: "ability:reflection-return",
          source: tokenRef(path.source), targets: [tokenRef(path.target)] }));
      }
    }
  }
  if (primary.kind === "attack" && primary.parry !== true) {
    for (const key of hitKeysOf(flagsOf(message))) {
      // **THE FEATURE CARD'S OWN VERDICT** (the B4 review): the key the attack was made
      // from answers to that card's Use, and a Use that failed - or a card that is gone -
      // plays no `hit` cue. A patch or a rider has no card behind it, and is the blow's.
      const fromThat = primary.fromFeature?.key === key;
      out.push(featureRecord({
        trigger: "hit", contentVisible: primary.contentVisible, sceneId: primary.sceneId, identifier: key,
        success: fromThat ? primary.fromFeature.success === true : true,
        source: tokenRef(primary.source), targets: primary.targets, hit: primary.hit === true
      }));
    }
    return out;
  }
  const isUse = primary.kind === "feature" && primary.trigger === "use";
  if ((primary.kind === "spell" || isUse) && primary.steps?.length) out.push({ ...primary, trigger: "arrive" });
  if (isUse && primary.risen.length) out.push({ ...primary, trigger: "rise" });
  if (isUse && primary.hold) out.push({ ...primary, trigger: "hold", targets: primary.source ? [primary.source] : [] });
  return out;
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

/**
 * A REGION PLACED FROM A CARD. A measured area or a totem's aura carries no `cast`.
 *
 * **AND A REGION A FEATURE PLACED** (the Legacy branches' door 2), which is the
 * feature's own record before it is a cast's: the key `regionFlagsFromCard` copies
 * off a feature's card - only where the Use did not fail, so a Region carrying one is
 * itself the proof - or the key a trap names (04's Shadow Trap, placed after the
 * payment). Its anchor is the one the Region recorded, else the trap's setter.
 */
export function regionRecord(region) {
  const flags = flagsOf(region);
  const featureKey = featureKeyOfRegion(flags);
  // **A REGION THIS READER IS NOT SHOWN ANNOUNCES NOTHING** (the B4 review's MUST-FIX):
  // a GM's hidden trap, or one set to the GM's or its observers' eyes, plays no cue on
  // a board that does not draw it - for a feature's Region and a spell's alike.
  const shown = regionShownHere(region);
  if (featureKey) {
    const privacy = featurePrivacyKey(actorIdOfUuid(regionLayerUuid(flags)), featureKey);
    const record = featureRecord({
      trigger: "region",
      contentVisible: shown,
      sceneId: region?.parent?.id ?? null,
      identifier: featureKey,
      source: tokenRef(flags.source) ?? sourceOfUuid(flags[TRAP_FLAG]?.setter ?? null),
      region: { id: region.id, sceneId: region?.parent?.id ?? null, shape: shapeOf(region) },
      ...(privacy ? { privacy } : {})
    });
    // A trap is set BEFORE its Use's card is posted: the director holds its cue for the
    // card, which says whether this reader may see the Use (the B4 review).
    return privacy ? { ...record, awaitCard: true } : record;
  }
  if (!flags.cast) return null;
  const card = linkedCard(flags.messageId ?? null, flags.cast);
  const parts = castParts(card, flags);
  return {
    trigger: "region",
    kind: "spell",
    sceneId: region?.parent?.id ?? null,
    ...parts,
    contentVisible: parts.contentVisible && shown,
    region: { id: region.id, sceneId: region?.parent?.id ?? null, shape: shapeOf(region) }
  };
}

/**
 * Whether a Region is drawn for this reader off the Region layer (`rules/animation-records
 * .mjs#regionShown`, v14's `Region#isVisible` less the layer's own branches).
 */
function regionShownHere(region) {
  const isGM = game.user?.isGM === true;
  let isObserver = isGM;
  try {
    isObserver = isGM || region?.testUserPermission?.(game.user, "OBSERVER") === true;
  } catch {
    isObserver = isGM;
  }
  return regionShown({ hidden: region?.hidden === true, visibility: region?.visibility, isGM, isObserver });
}

/** Who placed a feature's Region: the card's caster, else a trap's setter. */
function regionLayerUuid(flags) {
  return flags?.caster ?? flags?.[TRAP_FLAG]?.setter ?? null;
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
  return sourceOfUuid(effect?.origin ?? null);
}

/**
 * The token, on the viewed scene, of the actor (or the item's actor) one uuid
 * names: an effect's `origin`, a trap's setter, a floor's holder.
 */
function sourceOfUuid(uuid) {
  if (!uuid) return null;
  let actor = null;
  try { actor = fromUuidSync(uuid); } catch { actor = null; }
  const carrier = actor?.documentName === "Actor" ? actor : actor?.actor ?? null;
  const tokenId = tokenIdsOf(carrier)[0] ?? null;
  return tokenId ? { sceneId: viewed()?.id ?? null, tokenId } : null;
}

/** The feature key a Region records, or null: a feature card's, else a trap's. */
function featureKeyOfRegion(flags) {
  const key = flags?.featureKey ?? flags?.[TRAP_FLAG]?.identifier ?? null;
  return typeof key === "string" && key ? key : null;
}

/**
 * The actor's OWN tokens on the viewed scene - its synthetic token, or its LINKED
 * ones - never an unlinked copy of its world actor, which is another creature.
 */
function ownTokenIdsOf(actor) {
  if (!actor) return [];
  const sceneId = viewed()?.id ?? null;
  if (actor.isToken) {
    const doc = actor.token ?? null;
    return doc && doc.parent?.id === sceneId ? [doc.id] : [];
  }
  return (actor.getActiveTokens?.(true, true) ?? [])
    .filter(doc => doc?.parent?.id === sceneId)
    .map(doc => doc.id);
}

/**
 * The features a state's flags name for what laid it, each key once
 * (`rules/animation-records.mjs#stateEntriesOf`): the key, the name, the FLAGS that
 * named it (`states`, sorted - what a row's `state` reads) and the (user, feature) pair
 * its privacy answers to.
 *
 * @param {object} flags
 * @param {string[]|null} [only]
 * @param {string|null} [origin]  the effect's `origin`, the layer where no flag names one
 * @returns {Array<{identifier: string, name: string, states: string[], privacy: string|null}>}
 */
function stateNames(flags, only = null, origin = null) {
  const out = new Map();
  for (const entry of stateEntriesOf(flags, { only })) {
    const key = slugOf(entry.name);
    if (!key) continue;
    const held = out.get(key) ?? { identifier: key, name: entry.name, states: [], privacy: null };
    if (!held.states.includes(entry.flag)) held.states.push(entry.flag);
    held.privacy ??= featurePrivacyKey(actorIdOfUuid(stateLayerOf(entry, origin)), key);
    out.set(key, held);
  }
  return [...out.values()].map(s => ({ ...s, states: s.states.sort() }));
}

/**
 * **A STATE A FEATURE LAID, ARRIVING** (the Legacy branches' door 2): one `effect`
 * record a feature its flags name, on EVERY token the effect's holder stands on here -
 * the loop stands on each (the B4 review: the cue played on the first alone), each
 * carrying the flags that named it (`states`) and its privacy pair.
 */
function featureEffectRecords(effect, flags, only = null, { born = "create" } = {}) {
  const named = stateNames(flags, only, effect?.origin ?? null);
  if (!named.length) return [];
  const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
  const tokenIds = tokenIdsOf(actor);
  const sceneId = viewed()?.id ?? null;
  const source = originSource(effect);
  const out = [];
  for (const { identifier, states, privacy } of named) {
    for (const tokenId of tokenIds.length ? tokenIds : [null]) {
      const record = featureRecord({
        trigger: "effect", sceneId, identifier, source,
        // **A STATE BORN WITH ITS EFFECT MAY HAVE BEEN LAID BEFORE ITS USE'S CARD**: the
        // director holds it for the card (`awaitCard`). A condition's marks arrive by a
        // card's own button - the card is in - and are judged by what it said.
        contentVisible: born === "update" ? !pairPrivate(privacy) : true,
        effect: { id: effect.id, sceneId, tokenId, actorId: actor?.id ?? null },
        states, ...(privacy ? { privacy } : {})
      });
      out.push(born === "create" && privacy ? { ...record, awaitCard: true } : record);
    }
  }
  return out;
}

/**
 * **EVERY CUE AN EFFECT'S CREATION IMPLIES**: the spell's (`effectRecord`, the
 * `cast|effect` fallback) on every token its holder stands on here, and one for each
 * feature whose state it is.
 *
 * @param {ActiveEffect} effect
 * @returns {object[]}
 */
export function effectRecords(effect) {
  const out = [];
  const spell = effectRecord(effect);
  if (spell) {
    // ONE A TOKEN, as the loop stands one a token (the B4 review, pulled in for the
    // spells beside the features): a linked actor on the board twice is two creatures.
    const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
    const tokenIds = tokenIdsOf(actor);
    if (tokenIds.length > 1) {
      for (const tokenId of tokenIds) out.push({ ...spell, effect: { ...spell.effect, tokenId } });
    } else out.push(spell);
  }
  out.push(...featureEffectRecords(effect, flagsOf(effect)));
  return out;
}

/**
 * **EVERY CUE AN EFFECT'S UPDATE IMPLIES** (the Legacy branches' door 2), read off
 * the update's own diff and nothing else - an effect is written for many reasons,
 * and only two of them are events:
 *
 * - **a floor caught a blow** (`effects/blow-doors.mjs#aegisFloor` writes its catch
 *   count each time; 04's Big Bad Voodoo's aura floor): a `hold` record on the
 *   creature held, from whoever's floor it is;
 * - **a condition's landing marks arrived** (`effects/inflict.mjs` writes them after
 *   the condition is toggled on): an `effect` record for each feature they name -
 *   04's Bad Mojo's Stun, Serpent Ward's Poisoned - read from `CONDITION_MARK_FLAGS`
 *   alone, so an aura rewritten on its door's every pass cues nothing.
 *
 * @param {ActiveEffect} effect
 * @param {object} changed  the update's diff, as `updateActiveEffect` hands it
 * @returns {object[]}
 */
export function effectUpdateRecords(effect, changed) {
  const diff = changed?.flags?.["azeroth-rpg"] ?? null;
  if (!diff || typeof diff !== "object") return [];
  const out = [];
  const caught = diff[FLOOR_FLAG];
  if (caught && typeof caught === "object" && Object.hasOwn(caught, "caught")) {
    const hold = floorHoldRecord(effect);
    if (hold) out.push(hold);
  }
  out.push(...featureEffectRecords(effect, diff, CONDITION_MARK_FLAGS, { born: "update" }));
  return out;
}

/**
 * A floor's catch, as a `hold` record: on the creature held - EVERY token it stands on
 * here (the B4 review) - from the floor's holder, under the holder's privacy pair.
 */
function floorHoldRecord(effect) {
  const floor = flagsOf(effect)[FLOOR_FLAG] ?? null;
  const identifier = slugOf(floor?.name ?? "");
  if (!identifier) return null;
  const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
  const tokenIds = tokenIdsOf(actor);
  const sceneId = viewed()?.id ?? null;
  const privacy = featurePrivacyKey(actorIdOfUuid(floor?.by ?? null), identifier);
  return featureRecord({
    trigger: "hold", sceneId, identifier,
    contentVisible: !pairPrivate(privacy),
    source: sourceOfUuid(floor?.by ?? null),
    targets: tokenIds.map(tokenId => ({ sceneId, tokenId })),
    effect: { id: effect.id, sceneId, tokenId: tokenIds[0] ?? null, actorId: actor?.id ?? null },
    ...(privacy ? { privacy } : {})
  });
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
    // Each committed utility carrier announces only its own recipient. The
    // whole original target list here would replay all six recipients six times.
    ...(flags.utilitySpell ? {targets: []} : {}),
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
  // **THE MARKS A FEATURE NAMES A CREATURE WITH** (04's The Challenge and The Long
  // Watch; the Legacy branches' doors 2 and 18), on the creature marked: read off
  // the user whether or not the user stands on this board, since the marked
  // creature is the one that has to.
  const marks = [];

  for (const actor of carriers()) {
    for (const entry of actor.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
      if (!entry?.cast) continue;
      // **A SPELL'S SUSTAIN NAMES ITS SPELL; A FEATURE'S NAMES NONE** (`castSpell`
      // writes `spellId`, `holdUseSustain` and Flametongue's door `null`), and a
      // feature's anchors on the holder's own tokens where no source was recorded.
      const feature = !entry.spellId;
      sustains.push({
        cast: entry.cast,
        identifier: entry.identifier ?? null,
        name: entry.name ?? null,
        actorId: actor.id,
        source: entry.source ?? null,
        targets: Array.isArray(entry.targets) ? entry.targets : [],
        kind: feature ? "feature" : "spell",
        ...(feature && !entry.source?.tokenId ? { tokenIds: ownTokenIdsOf(actor) } : {}),
        // The holder's privacy pair for what its Use began (the B4 review).
        ...(feature ? { privacy: featurePrivacyKey(actor.id, entry.identifier ?? null) } : {})
      });
    }
    // The Long Watch: the user's own flag, on the creature watched, seen only where
    // this client owns the user (the lead: *"Yes"*).
    const watch = markRow("watch", actor.getFlag?.("azeroth-rpg", WATCH_FLAG) ?? null, { cast: actor.id, owned: actor.isOwner === true, actorId: actor.id });
    if (watch) marks.push(watch);
    for (const effect of actor.effects ?? []) {
      if (effect.active === false) continue;
      const challenge = markRow("challenge", flagsOf(effect)[CHALLENGE_FLAG] ?? null, { cast: effect.id, owned: true, actorId: actor.id });
      if (challenge) marks.push(challenge);
    }
    const tokenIds = tokenIdsOf(actor);
    if (!tokenIds.length) continue;
    for (const effect of actor.effects ?? []) {
      const flags = flagsOf(effect);
      // **A STATE A FEATURE LAID** (door 2): by the name its own flags give for its
      // source - one row a (key, token) pair, keyed by the effect AND the key.
      if (!flags.cast) {
        const named = stateNames(flags, null, effect.origin ?? null);
        if (!named.length) continue;
        const source = originSource(effect);
        for (const { identifier, name, states, privacy } of named) {
          for (const tokenId of tokenIds) {
            effects.push({
              id: effect.id, cast: stateCast(effect.id, identifier), identifier, kind: "feature",
              active: effect.active !== false, sceneId, tokenId, actorId: actor.id, name, source,
              // Which of the feature's states this is (a row's `state`), and whose Use
              // laid it, for its privacy (the B4 review).
              states, privacy
            });
          }
        }
        continue;
      }
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
          ...(flags.identifier === "lightning-shield" && flags.lightningShield
            ? { charges: flags.lightningShield.charges } : {}),
          source
        });
      }
    }
  }

  for (const region of scene?.regions ?? []) {
    const flags = flagsOf(region);
    // **WHETHER THIS READER IS SHOWN THE REGION** (the B4 review's MUST-FIX): v14's
    // `Region#isVisible` off the layer (`regionShown`) - a GM's hidden trap is the GM's
    // alone, an OBSERVER one stands for whoever the Region's own ownership lets observe
    // it, and the GM's own rule holds for a spell's Region as for a feature's.
    const shown = regionShownHere(region);
    // **A REGION A FEATURE PLACED** (door 2), keyed by the Region itself: it is the
    // state, and no cast stands behind a trap.
    const featureKey = featureKeyOfRegion(flags);
    if (featureKey) {
      regions.push({
        id: region.id, sceneId, cast: region.id, identifier: featureKey, kind: "feature",
        name: region.name ?? null, shape: shapeOf(region), shown,
        privacy: featurePrivacyKey(actorIdOfUuid(regionLayerUuid(flags)), featureKey)
      });
    }
    if (!flags.cast) continue;
    regions.push({
      id: region.id,
      sceneId,
      cast: flags.cast,
      identifier: flags.identifier ?? null,
      shape: shapeOf(region),
      shown
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
    marks,
    // See `resistsFor`: the casts of a SUSTAIN WHOSE ROW TAKES THAT BINDING,
    // never every held Sustain. The shipped table makes this an empty set.
    resists: resistsFor(new Set(sustains.filter(s => resisted.has(s.identifier)).map(s => s.cast)))
  };
}

/**
 * One mark as the snapshot keeps it: the feature's key off the name the mark
 * records (`source`, written by `workflows.useFeature` beside the creature), the
 * creature marked, and whether this client may see it. Null for a mark that names
 * no creature or no feature - one laid before door 2 recorded its source.
 */
function markRow(kind, raw, { cast, owned, actorId = null }) {
  const tokenId = typeof raw?.tokenId === "string" && raw.tokenId ? raw.tokenId : null;
  const identifier = slugOf(raw?.source ?? "");
  if (!tokenId || !identifier || !cast) return null;
  return {
    kind, identifier, cast, owned: owned === true, name: raw.source,
    target: { sceneId: typeof raw.sceneId === "string" && raw.sceneId ? raw.sceneId : null, tokenId },
    // The marker's privacy pair (the B4 review): the mark is carried by the user.
    privacy: featurePrivacyKey(actorId, identifier)
  };
}

/**
 * **EVERY FEATURE LOOP'S CAST THE WORLD STILL HOLDS, on any scene** (the director's
 * pruning, `liveCasts`'s other half): a state's `effect.key`, a mark's (the Challenge's
 * effect, the Long Watch's warden), a feature's Region. A feature's Sustain is a
 * `sustaining` entry, which `liveCasts` reads already.
 *
 * @returns {Set<string>}
 */
export function liveFeatureCasts() {
  const casts = new Set();
  const seen = new Set();
  const carriers = [...(game.actors ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) if (featureKeyOfRegion(flagsOf(region))) casts.add(region.id);
    for (const token of scene.tokens ?? []) if (token.actor) carriers.push(token.actor);
  }
  for (const actor of carriers) {
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    if (actor.getFlag?.("azeroth-rpg", WATCH_FLAG)) casts.add(actor.id);
    for (const effect of actor.effects ?? []) {
      const flags = flagsOf(effect);
      if (flags[CHALLENGE_FLAG]) casts.add(effect.id);
      if (flags.cast) continue;
      for (const { identifier } of stateNames(flags)) casts.add(stateCast(effect.id, identifier));
    }
  }
  return casts;
}
