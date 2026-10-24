/**
 * **WHAT A FEATURE'S USE RECORDS FOR THE ANIMATION LAYER, AND HOW IT IS READ**
 * (the Legacy branches' door 2). Pure: no Foundry imports and no bare globals
 * (CLAUDE.md §3, `unbound.test.mjs`).
 *
 * D-724 to D-726 put the facts an animation needs on the card where the action
 * happened - who acted, at whom, which spell, whether it worked, who resisted -
 * and `module/animation/records.mjs` reads them back. Until door 2 only an attack
 * card and a spell card did: a feature's card carried its targets and its verdict
 * and named neither who used it nor which feature it was, so a talent, a class
 * feature or a gadget animated nothing at all. This module is the law for the
 * records a feature's doors write, and the one place their shapes are cleaned:
 *
 * - **the key** a feature's row is filed under (`featureKeyOf`, `abilityKeyOf`);
 * - **a move** a step made (`stepRecord`, `cleanSteps`): the token's CENTRE before
 *   and after, in canvas pixels, written by `effects/steps.mjs#stepTo` before the
 *   token moves - the departure point is gone from the board by the time the card
 *   arrives, so it can only be recorded, never read;
 * - **what a Use put on the board** (`risenRecord`, `cleanRisen`): the tokens a
 *   summon, a construct, a totem, a raise or a revive stood up;
 * - **a hold** (`cleanHold`): 04's Afterimage turning a hit into a miss, with the
 *   striker whose blow went through;
 * - **a laid state's own name for its source** (`stateSourcesOf`, `stateKeysOf`):
 *   every state B1 to B3 lay records the feature that laid it by NAME (`source:
 *   item.name`), a shape by its kind, an encounter buff by `talentBuff`; the key is
 *   that name's slug, so a state needs no second record to be found by its row;
 * - **what an attack's hit answers to** (`hitKeysOf`): the riders it carried, the
 *   bound attack patches that drew it, and the feature card it was made from.
 *
 * ## The key
 *
 * **A FEATURE'S KEY IS THE SLUG OF ITS NAME, the parser's own** (`tools/parse-book/
 * lib/markdown.mjs#slugify`, mirrored here and held to it by the Vitest): a
 * talent-granted feature's is its talent's (no talent grant renames its feature,
 * and every class talent's identifier is the slug of its name - both held by
 * `animation-records.test.mjs` over the pack and the table), a class feature's is
 * the slug of its own name, a gadget's is its key (the slug of its name too). It is
 * NOT `system.identifier` read off a talent at runtime: a race's talents are
 * stamped with core's `String#slugify`, which keeps an apostrophe, so
 * *Mekkatorque's Blueprint* would be filed under two keys - one on its card and
 * another on the state it laid. A creature's ability is `ability:<slug>`, kept
 * apart from the features so a creature's *Pummel* is never a Rogue's.
 */

import { SHAPE_KINDS } from "./shapes.mjs";
import { ESCAPE_FLAG, SHED_DC_FLAG } from "./escapes.mjs";
import { SLOWED_FEET_FLAG } from "./slowing.mjs";

/**
 * Garrote's and Paralytic's marks on a landed condition (`rules/class-talents.mjs`'
 * `NO_CASTING_FLAG` and `PARALYTIC_FLAG`), and a thrall's on its Charmed
 * (`rules/legacy-uses.mjs#THRALL_FLAG`), named here rather than imported so the
 * animation law does not load the whole talent table to read three words;
 * `animation-records.test.mjs` holds them to the constants.
 */
const NO_CASTING_FLAG = "noCasting";
export const PARALYTIC_FLAG = "paralytic";
const THRALL_FLAG = "thrall";

/**
 * Every trigger a feature row's cue may answer (the Legacy branches' door 2):
 *
 * - `use`     the Use's card - on a SUCCESSFUL Casting Test where the feature makes
 *             one (07 §8's rule, carried to a casting feature by D-775);
 * - `hit`     an attack's hit that the feature rode: a rider, a bound attack patch,
 *             or an attack made from the feature's own card;
 * - `hold`    a hold or a negation: Afterimage's miss, Hold the Thread's spared
 *             Death Step, a floor aura catching a blow;
 * - `arrive`  the destination of a step the Use made (`step-to`);
 * - `rise`    a creature the Use stood up: a summon or a construct placed, a totem
 *             planted, a Dark Minion raised, a creature revived;
 * - `effect`  a state the feature laid arriving on its holder;
 * - `region`  a Region the feature placed (a trap, a feature card's area).
 */
export const FEATURE_TRIGGERS = Object.freeze(["use", "hit", "hold", "arrive", "rise", "effect", "region"]);

/**
 * Every binding a feature row's loop may take:
 *
 * - `effect`        while a state the feature laid stands on its holder, active;
 * - `mark`          while the feature's mark names a creature (The Challenge, The
 *                   Long Watch), anchored on the creature MARKED - The Long Watch's
 *                   only where this client owns the warden (the lead: *"Yes"*);
 * - `region`        while a Region the feature placed stands;
 * - `sustain-self`  while the user holds the Sustain the Use began (Big Bad Voodoo).
 */
export const FEATURE_BINDINGS = Object.freeze(["effect", "mark", "region", "sustain-self"]);

/** What a creature ability's key opens with. */
export const ABILITY_PREFIX = "ability:";

/** The kinds a step's mover may be (`rules/steps.mjs#STEP_KINDS`), as a record keeps them. */
export const MOVE_KINDS = Object.freeze(["self", "friend", "party", "pull"]);

/**
 * The flags a condition's effect takes AFTER it is toggled on (`effects/inflict.mjs`
 * writes them in a second update; a thrall's Charmed takes its mark the same way,
 * `effects/legacy-uses.mjs#bindThrall`), each naming the talent or feature whose
 * landing it is. A condition's arrival is cued off these appearing in an update, and
 * off nothing else an update carries: an aura is rewritten on every pass of its door,
 * and reading every flag on every update would cue it each time.
 *
 * **TWO MARKS ARE NOT HERE, AND WHY** (the B4 review): Paralytic's records the
 * poisoner's UUID as its `source` (`dice/chat.mjs`), which names no feature, so it
 * could never cue; and Permafrost's feet (`SLOWED_FEET_FLAG`) are a MODIFIER - its
 * `source` is the talent that ADDED feet to a Slowed, never what laid it, and its own
 * second update (`effects/speed-drop.mjs#addSlowedFeet`) cued one landing twice.
 */
export const CONDITION_MARK_FLAGS = Object.freeze([ESCAPE_FLAG, SHED_DC_FLAG, NO_CASTING_FLAG, THRALL_FLAG]);

/**
 * **THE FLAGS WHOSE `source` NAMES WHAT CHANGED A STATE, NEVER WHAT LAID IT**: never
 * read as a state's source at all. Permafrost's feet on a Slowed (`rules/slowing.mjs`)
 * name Permafrost on a Slowed Frostbolt laid.
 */
export const MODIFIER_FLAGS = Object.freeze([SLOWED_FEET_FLAG]);

/* ------------------------------------------------------------------ */
/*  Keys                                                               */
/* ------------------------------------------------------------------ */

/**
 * **THE PARSER'S SLUG**, mirrored (`tools/parse-book/lib/markdown.mjs#slugify`):
 * lower case, decomposed, apostrophes dropped, every run of anything else one
 * hyphen, none at either end.
 *
 * @param {string} name
 * @returns {string}  empty for nothing
 */
export function slugOf(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A plain non-empty string, or null. */
function text(value) {
  return typeof value === "string" && value ? value : null;
}

/**
 * **THE KEY A FEATURE'S ROW IS FILED UNDER**: the gadget's key where the feature
 * is a gadget known, else the slug of the talent that granted it, else the slug
 * of its own name. Null for nothing to key.
 *
 * @param {{gadget?: string|null, talent?: string|null, name?: string|null}} o
 *   `gadget` the gadget's key (`rules/gadgets.mjs`), `talent` the granting talent's NAME
 * @returns {string|null}
 */
export function featureKeyOf({ gadget = null, talent = null, name = null } = {}) {
  const g = text(gadget);
  if (g) return g;
  const t = slugOf(talent);
  if (t) return t;
  const n = slugOf(name);
  return n || null;
}

/**
 * **THE KEY A CREATURE'S ABILITY IS FILED UNDER**: `ability:<slug>`, or null.
 *
 * @param {string} name  the ability's name as 14 prints it
 */
export function abilityKeyOf(name) {
  const slug = slugOf(name);
  return slug ? `${ABILITY_PREFIX}${slug}` : null;
}

/* ------------------------------------------------------------------ */
/*  Points                                                             */
/* ------------------------------------------------------------------ */

/** A finite number, or null. `Number(null)` is 0, so nothing is coerced. */
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A point, or null. */
function pointOf(raw) {
  const x = finite(raw?.x);
  const y = finite(raw?.y);
  return x === null || y === null ? null : { x, y };
}

/** A document id as a record keeps one: letters and digits, else null. */
function idOf(value) {
  return typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/*  A step's move                                                      */
/* ------------------------------------------------------------------ */

/**
 * **ONE MOVE A STEP MADE, AS A CARD RECORDS IT** (door 3's `stepTo`, door 2's
 * reader): the mover's token, what kind of mover it was, and its CENTRE before and
 * after in canvas pixels - the top-left each time plus half the box it fills.
 * Null where any of it cannot be read.
 *
 * @param {{sceneId?: string|null, tokenId: string, kind?: string, from: {x: number, y: number},
 *   to: {x: number, y: number}, width?: number, height?: number, sizeX?: number, sizeY?: number}} o
 *   `from` and `to` the token's TOP-LEFT before and after; `width` and `height` its squares;
 *   `sizeX` and `sizeY` the grid's pixels a square
 * @returns {{sceneId: string|null, tokenId: string, kind: string, from: {x: number, y: number}, to: {x: number, y: number}}|null}
 */
export function stepRecord({ sceneId = null, tokenId = null, kind = "self", from = null, to = null, width = 1, height = 1, sizeX = 100, sizeY = 100 } = {}) {
  const token = idOf(tokenId);
  const a = pointOf(from);
  const b = pointOf(to);
  if (!token || !a || !b) return null;
  const w = (finite(width) && width > 0 ? width : 1) * (finite(sizeX) && sizeX > 0 ? sizeX : 100);
  const h = (finite(height) && height > 0 ? height : 1) * (finite(sizeY) && sizeY > 0 ? sizeY : 100);
  return {
    sceneId: idOf(sceneId),
    tokenId: token,
    kind: MOVE_KINDS.includes(kind) ? kind : "self",
    from: { x: a.x + w / 2, y: a.y + h / 2 },
    to: { x: b.x + w / 2, y: b.y + h / 2 }
  };
}

/** One recorded move, cleaned, or null. Centres already. */
function cleanStep(raw) {
  const token = idOf(raw?.tokenId);
  const from = pointOf(raw?.from);
  const to = pointOf(raw?.to);
  if (!token || !from || !to) return null;
  return { sceneId: idOf(raw?.sceneId), tokenId: token, kind: MOVE_KINDS.includes(raw?.kind) ? raw.kind : "self", from, to };
}

/**
 * The moves a card recorded, cleaned: a list, in the order made, nothing that
 * cannot be read.
 *
 * @param {unknown} raw
 * @returns {Array<{sceneId: string|null, tokenId: string, kind: string, from: object, to: object}>}
 */
export function cleanSteps(raw) {
  return (Array.isArray(raw) ? raw : []).map(cleanStep).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  What a Use stood up                                                */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A PLACING DOOR ANSWERED, AS A RECORD**: `documents/summon.mjs#placeSummon`
 * answers `{tokenIds, sceneId}`, `documents/totems.mjs#plantTotem` `{placed,
 * tokenId, sceneId}`. Null where nothing was placed.
 *
 * @param {object|null} placed
 * @returns {{sceneId: string|null, tokenIds: string[]}|null}
 */
export function risenRecord(placed) {
  if (!placed || typeof placed !== "object" || placed.placed === false) return null;
  const ids = Array.isArray(placed.tokenIds) ? placed.tokenIds : (placed.tokenId ? [placed.tokenId] : []);
  const tokenIds = [...new Set(ids.map(idOf).filter(Boolean))];
  return tokenIds.length ? { sceneId: idOf(placed.sceneId), tokenIds } : null;
}

/**
 * What a card recorded it stood up, cleaned: a list of `{sceneId, tokenIds}`.
 *
 * @param {unknown} raw
 */
export function cleanRisen(raw) {
  return (Array.isArray(raw) ? raw : []).map(risenRecord).filter(Boolean);
}

/** Every token a cleaned risen list names, in order, each once. */
export function risenTokens(risen) {
  const out = [];
  for (const r of cleanRisen(risen)) {
    for (const tokenId of r.tokenIds) if (!out.some(o => o.tokenId === tokenId)) out.push({ sceneId: r.sceneId, tokenId });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  A hold                                                             */
/* ------------------------------------------------------------------ */

/** A token reference as a card stores one, or null. */
export function tokenRef(raw) {
  const tokenId = idOf(raw?.tokenId);
  return tokenId ? { sceneId: idOf(raw?.sceneId), tokenId } : null;
}

/**
 * **A HOLD, AS A FEATURE CARD RECORDS IT**: 04's Afterimage (`negate`), the card
 * whose row it turned into a miss, and the striker whose blow went through.
 *
 * @param {unknown} raw
 * @returns {{kind: string, messageId: string|null, index: number|null, striker: {sceneId: string|null, tokenId: string}|null}|null}
 */
export function cleanHold(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = text(raw.kind);
  if (!kind) return null;
  return {
    kind,
    messageId: idOf(raw.messageId),
    index: Number.isInteger(raw.index) && raw.index >= 0 ? raw.index : null,
    striker: tokenRef(raw.striker)
  };
}

/* ------------------------------------------------------------------ */
/*  A laid state's source                                              */
/* ------------------------------------------------------------------ */

/** A document UUID rather than a name: a tick's `source` is the caster's uuid. */
function uuidLike(value) {
  return /^(Actor|Item|Scene|Compendium|JournalEntry|Macro|User)\./.test(String(value ?? ""));
}

/**
 * **THE NAMES A LAID STATE'S FLAGS GIVE FOR WHAT LAID IT** (door 2's reading of
 * B1 to B3's states): every object flag carrying a `source` name - a concealment's,
 * an ethereal form's, a timed immunity's, a laid Bane's, a condition's escape, an
 * aura's - the feature a SHAPE kind is taken by (`rules/shapes.mjs#SHAPE_KINDS`),
 * and an encounter buff's `talentBuff`. Sorted, each once.
 *
 * **A CAST'S OWN IS THE SPELL'S**: an effect carrying a `cast` was laid by a spell's
 * card (D-657, D-724) and belongs to the spell table, and a flag object carrying one
 * (a spell's escape record) is the spell's too.
 *
 * @param {object} flags  an effect's `flags["azeroth-rpg"]`, or an update's diff of them
 * @param {{only?: string[]|null}} [o]  read these flag keys alone (an update's
 *   condition marks, `CONDITION_MARK_FLAGS`)
 * @returns {string[]}
 */
export function stateSourcesOf(flags, { only = null } = {}) {
  return [...new Set(stateEntriesOf(flags, { only }).map(e => e.name))].sort();
}

/**
 * **EACH FLAG A LAID STATE CARRIES, AND THE NAME IT GIVES FOR WHAT LAID IT** (the B4
 * review's B7 half): `stateSourcesOf`'s reading with the flag kept beside the name, so
 * a row can say WHICH of a feature's states it follows - 04's Wind Walk lays an
 * `unanswered`, a `freeWalk` and, at rank 2, a `concealed`, all naming *Wind Walk*, and a
 * loop on every one would stand three pictures on one creature. Sorted by name, then
 * flag; a `MODIFIER_FLAGS` flag is never read.
 *
 * @param {object} flags  an effect's `flags["azeroth-rpg"]`, or an update's diff of them
 * @param {{only?: string[]|null}} [o]
 * @returns {Array<{flag: string, name: string, by: string|null}>}  `by` the uuid of who
 *   laid it, where the flag records one (`by`, `caster`, `setter`, `ownerUuid`)
 */
export function stateEntriesOf(flags, { only = null } = {}) {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return [];
  if (text(flags.cast)) return [];
  const keys = Array.isArray(only) ? only : Object.keys(flags);
  const out = [];
  const seen = new Set();
  const add = (flag, name, by = null) => {
    const id = `${flag}\u0000${name}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ flag, name, by: uuidLike(by) ? by : null });
  };
  for (const key of keys) {
    if (!Object.hasOwn(flags, key) || MODIFIER_FLAGS.includes(key)) continue;
    const value = flags[key];
    if (key === "talentBuff") {
      if (text(value)) add(key, value);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (key === "shape") {
      const feature = text(SHAPE_KINDS[value.kind]?.feature);
      if (feature) add(key, feature);
      continue;
    }
    if (text(value.cast)) continue;
    const source = text(value.source);
    if (source && !uuidLike(source)) add(key, source, value.by ?? value.caster ?? value.setter ?? value.ownerUuid ?? null);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.flag.localeCompare(b.flag));
}

/**
 * **WHO LAID A STATE**: the uuid its own flag records (`stateEntriesOf`'s `by`), else
 * the effect's `origin`. Null where neither names an actor.
 *
 * `effects/talent-states.mjs#layState` stamps the HOLDER as `origin`, so a state laid on
 * an ally reads its layer off the flag's own `by` (a concealment's, an Ethereal Form's)
 * and a state the user lays on itself reads the user off `origin` - which is it.
 *
 * @param {{by?: string|null}} entry  one `stateEntriesOf` entry
 * @param {string|null} [origin]  the effect's `origin`
 * @returns {string|null}
 */
export function stateLayerOf(entry, origin = null) {
  if (uuidLike(entry?.by)) return entry.by;
  return uuidLike(origin) ? origin : null;
}

/**
 * **THE ACTOR ID ONE UUID NAMES**: the id after its LAST `Actor.` segment, so a token's
 * synthetic actor (`Scene.s.Token.t.Actor.<id>`) and its world actor (`Actor.<id>`) name
 * the same one, as a card's speaker does (`ChatMessage.getSpeaker`). An item's uuid names
 * the actor that holds it. Null for anything else.
 *
 * @param {string|null} uuid
 * @returns {string|null}
 */
export function actorIdOfUuid(uuid) {
  const parts = String(uuid ?? "").split(".");
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "Actor") return idOf(parts[i + 1]);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Privacy (D-729, carried to the features by the B4 review)          */
/* ------------------------------------------------------------------ */

/**
 * **THE KEY A FEATURE'S PRIVACY IS NOTED UNDER**: the user's actor and the feature's key.
 * A Use's card names both (its speaker and its `featureKey`), and everything the Use
 * laid names both too - the feature by its source name, the user by the flag's `by` or
 * the effect's `origin` - so a card this client may not read takes the pictures of
 * what that Use laid with it, without a second record on any of them. Null where
 * either is missing.
 *
 * @param {string|null} actorId
 * @param {string|null} key  the feature's key
 * @returns {string|null}
 */
export function featurePrivacyKey(actorId, key) {
  const actor = idOf(actorId);
  const k = text(key);
  return actor && k ? `feature:${actor}:${k}` : null;
}

/**
 * **WHETHER A STATE'S ARRIVAL CUE MAY BE DECIDED YET** (the B4 review): a Use lays its
 * states and THEN posts its card (`workflows.useFeature`), so a state can arrive on a
 * client before the card that says whether it was private. A state that arrives with
 * no card of its (user, feature) seen recently waits a moment for one; the card
 * decides it, and a wait that ends with no card decides by the last card this client
 * saw of that pair - public where it saw none, the spell rule's fail-open (D-729).
 *
 * @param {{card?: {at: number, private: boolean}|null, arrivedAt?: number, now?: number,
 *   freshMs?: number, waitMs?: number}} o  `card` the last card this client saw for the pair
 * @returns {{ready: boolean, private: boolean}}
 */
export function stateCueVerdict({ card = null, arrivedAt = 0, now = 0, freshMs = 10000, waitMs = 1500 } = {}) {
  const at = finite(card?.at);
  const fresh = at !== null && at >= arrivedAt - freshMs;
  if (fresh) return { ready: true, private: card.private === true };
  if (now - arrivedAt < waitMs) return { ready: false, private: false };
  return { ready: true, private: card?.private === true };
}

/* ------------------------------------------------------------------ */
/*  What this reader can see                                           */
/* ------------------------------------------------------------------ */

/**
 * **WHETHER A TOKEN IS AN ANCHOR THIS READER CAN SEE** (D-728's `visible`, and the B4
 * review's MUST-FIX): what the board draws - `token.visible` - and never a token the GM
 * has hidden, for anybody but a GM. **A token still DRAWING is read off its document**:
 * core's `CanvasDocument#_onCreate` calls `object.draw()` unawaited, and
 * `PlaceableObject#draw` holds `visible` and `renderable` false until the texture is in
 * (14.367 `placeable-object.mjs` L528-553), so a summon, a construct, a totem or a raise
 * whose art was not cached read as unseen on every client and its `rise` cue said
 * `no-anchor`.
 *
 * @param {{visible?: boolean, drawing?: boolean, hidden?: boolean, isGM?: boolean}} o
 * @returns {boolean}
 */
export function anchorVisible({ visible = false, drawing = false, hidden = false, isGM = false } = {}) {
  if (hidden === true && isGM !== true) return false;
  return drawing === true ? true : visible === true;
}

/** Core's `REGION_VISIBILITY` (14.367 `common/constants.mjs` L2202-2228), by name. */
export const REGION_VISIBILITY = Object.freeze({ LAYER_UNLOCKED: 4, LAYER: 0, GAMEMASTER: 1, OBSERVER: 3, ALWAYS: 2 });

/**
 * **WHETHER A REGION IS DRAWN FOR THIS READER, off the Region layer** (the B4 review's
 * MUST-FIX): v14's `Region#isVisible` (14.367 `client/canvas/placeables/region.mjs` L82)
 * with the layer's own branches left out - a picture standing on a Region follows the
 * board, not the GM's tool. A hidden Region is the GM's alone; `GAMEMASTER` the GM's;
 * `OBSERVER` whoever may observe the Region; `ALWAYS` everyone; `LAYER` and
 * `LAYER_UNLOCKED` nobody off the layer.
 *
 * @param {{hidden?: boolean, visibility?: number, isGM?: boolean, isObserver?: boolean}} o
 * @returns {boolean}
 */
export function regionShown({ hidden = false, visibility = REGION_VISIBILITY.ALWAYS, isGM = false, isObserver = false } = {}) {
  if (hidden === true && isGM !== true) return false;
  switch (visibility) {
    case REGION_VISIBILITY.GAMEMASTER: return isGM === true;
    case REGION_VISIBILITY.OBSERVER: return isObserver === true || isGM === true;
    case REGION_VISIBILITY.ALWAYS: return true;
    default: return false;
  }
}

/**
 * The feature keys a laid state names: `stateSourcesOf`'s names as slugs, sorted,
 * each once.
 *
 * @param {object} flags
 * @param {{only?: string[]|null}} [o]
 * @returns {string[]}
 */
export function stateKeysOf(flags, o = {}) {
  return [...new Set(stateSourcesOf(flags, o).map(slugOf).filter(Boolean))].sort();
}

/**
 * The cast part of a feature state's loop key: the effect's id and the key. Two
 * keys on one effect (a condition whose escape and whose shed DC name two talents)
 * are two loops, and the loop key's own grammar splits on `:` alone.
 *
 * @param {string} id   the effect's id
 * @param {string} key  the feature's key - an `ability:` key's colon written as a
 *   hyphen, since the loop key's grammar splits on it (`director.mjs#keyCast`)
 */
export function stateCast(id, key) {
  return `${id}.${String(key ?? "").replace(/:/g, "-")}`;
}

/* ------------------------------------------------------------------ */
/*  What an attack's hit answers to                                    */
/* ------------------------------------------------------------------ */

/**
 * **THE KEYS AN ATTACK CARD'S HIT ANSWERS TO** (`workflows.rollTest`'s records):
 * the feature card the attack was made from, then the bound attack patches that
 * drew it (04's Serpent Ward on the Searing totem), then the riders it carried
 * (04's Jinx). Each once, in that order.
 *
 * @param {object} flags  the attack card's `flags["azeroth-rpg"]`
 * @returns {string[]}
 */
export function hitKeysOf(flags = {}) {
  const out = [];
  const add = key => {
    const k = text(key);
    if (k && !out.includes(k)) out.push(k);
  };
  add(flags?.fromFeature?.key);
  for (const key of Array.isArray(flags?.patchedBy) ? flags.patchedBy : []) add(key);
  for (const key of Array.isArray(flags?.ridden) ? flags.ridden : []) add(key);
  return out;
}

/**
 * The feature card an attack was made from, as the attack card records it, or null.
 *
 * @param {unknown} raw
 * @returns {{messageId: string|null, key: string}|null}
 */
export function cleanFromFeature(raw) {
  const key = text(raw?.key);
  return key ? { messageId: idOf(raw?.messageId), key } : null;
}
