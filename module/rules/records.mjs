/**
 * WHAT AN ACTION RECORDS, for whatever reads it after the die (D-724). Pure:
 * no Foundry imports (CLAUDE.md §3).
 *
 * A chat card is the only record of an action this system keeps, and anything
 * that happens afterwards - an animation, a Resist pressed by the target's
 * owner, a GM reading back what landed - reads the card and nothing else. So
 * the facts are written where the action happens, before any await that could
 * change what was selected, and they are records of what happened in the way
 * `damageByTarget` is: worth having with no animation module installed, and a
 * reader treats a missing key as nothing recorded.
 *
 * This file holds the judgements those records need: `chooseSource` names who
 * acted (D-724), and the Resist record's key, its link, its row match, the
 * record itself and the order a card reads them in say who resisted a spell
 * and how it came out (D-726).
 */

/** A source as a card stores it, `{sceneId, tokenId}`, or null where no token is named. */
function cleanSource(source) {
  if (!source || typeof source !== "object") return null;
  const tokenId = typeof source.tokenId === "string" && source.tokenId ? source.tokenId : null;
  if (!tokenId) return null;
  const sceneId = typeof source.sceneId === "string" && source.sceneId ? source.sceneId : null;
  return { sceneId, tokenId };
}

/**
 * WHICH TOKEN MADE THE ACTION - OR NONE, RATHER THAN A GUESS (D-724).
 *
 * In order:
 *
 *   1. what the caller named (`spec.source`), which only a door that knows
 *      better than the selection passes;
 *   2. a synthetic token actor's own token, which is the one creature it is;
 *   3. among the actor's tokens on the viewed scene, **exactly one** that is
 *      controlled;
 *   4. else exactly one token at all;
 *   5. else exactly one that is linked - a world actor rolled from its sheet
 *      with its linked token standing among unlinked copies of itself IS that
 *      linked token;
 *   6. **else null**.
 *
 * Core's `ChatMessage.getSpeaker` takes the first controlled token or else the
 * first token, which is right for a speaker's name and wrong for a record:
 * five unlinked Kobolds on a scene, none selected, and a GM rolling from the
 * Kobold's sheet in the sidebar gives the first Kobold the list happens to
 * hold. An animation drawn from a guessed token is drawn from the wrong
 * creature, and a record that says *nobody* is one a reader can decline.
 *
 * @param {object} [candidates]
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} [candidates.given]
 * @param {{sceneId?: string|null, tokenId?: string|null}|null} [candidates.synthetic]
 * @param {Array<{sceneId?: string|null, tokenId?: string|null, controlled?: boolean, linked?: boolean}>} [candidates.tokens]
 * @returns {{sceneId: string|null, tokenId: string}|null}
 */
export function chooseSource({ given = null, synthetic = null, tokens = [] } = {}) {
  const named = cleanSource(given);
  if (named) return named;
  const own = cleanSource(synthetic);
  if (own) return own;
  const standing = (Array.isArray(tokens) ? tokens : [])
    .map(t => ({ source: cleanSource(t), controlled: t?.controlled === true, linked: t?.linked === true }))
    .filter(t => t.source);
  const onlyOne = list => (list.length === 1 ? list[0].source : null);
  return onlyOne(standing.filter(t => t.controlled))
    ?? onlyOne(standing)
    ?? onlyOne(standing.filter(t => t.linked))
    ?? null;
}

/* ------------------------------------------------------------------------ */
/*  Who resisted a spell, and how it came out (D-726)                        */
/* ------------------------------------------------------------------------ */

/**
 * A document id as a flag path may carry one: letters and digits, nothing
 * else. Foundry's own ids are sixteen of them; anything with a dot in it would
 * write somewhere other than where it says.
 */
function plainId(value) {
  return typeof value === "string" && /^[A-Za-z0-9]+$/.test(value) ? value : null;
}

/** A finite number, or null. `Number(null)` is 0, so nothing is coerced. */
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A row index: a whole number from 0, or null. */
function rowIndex(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * WHERE A TARGET'S RESIST RECORD SITS ON THE SPELL CARD (D-726): under its
 * token, else under its actor.
 *
 * The record is written as `flags.azeroth-rpg.resists.<key>`, ONE KEY PER
 * WRITE, so the key has to be a plain id - a key that is not one names
 * nothing and the answer is null.
 *
 * @param {{tokenId?: string|null, actorId?: string|null}|null} ref
 * @returns {string|null}
 */
export function resistKey(ref) {
  const { tokenId = null, actorId = null } = ref ?? {};
  return plainId(tokenId) ?? plainId(actorId);
}

/**
 * WHAT A RESILIENCE TEST MADE FROM A SPELL CARD CARRIES BACK TO IT (D-726):
 * which card and which row, which creature, and which cast the card recorded
 * (D-724). The Resilience card stores it as `resistOf`, and it is the one
 * thing tying that Test to the spell it answered.
 *
 * Exactly nine keys, whatever a caller hands in beside them, and null without
 * a card to answer.
 *
 * @param {object} parts
 * @returns {{messageId: string, key: string|null, index: number|null, sceneId: string|null,
 *   tokenId: string|null, actorId: string|null, spellUuid: string|null,
 *   identifier: string|null, cast: string|null}|null}
 */
export function resistLink({ messageId = null, index = null, sceneId = null, tokenId = null, actorId = null, spellUuid = null, identifier = null, cast = null } = {}) {
  const card = plainId(messageId);
  if (!card) return null;
  const text = value => (typeof value === "string" && value ? value : null);
  return {
    messageId: card,
    key: resistKey({ tokenId, actorId }),
    index: rowIndex(index),
    sceneId: plainId(sceneId),
    tokenId: plainId(tokenId),
    actorId: plainId(actorId),
    spellUuid: text(spellUuid),
    identifier: text(identifier),
    cast: plainId(cast)
  };
}

/**
 * WHETHER A CARD'S TARGET ROW NAMES THE CREATURE A TEST WAS MADE FOR (D-726).
 *
 * A row that names a token is that token and nothing else - on that scene,
 * where both sides name one - because five unlinked Kobolds share one actor
 * and are five creatures. A row naming no token is its actor. Where both sides
 * name an actor, the actors agree or nothing matches.
 *
 * @param {{sceneId?: string|null, tokenId?: string|null, actorId?: string|null}|null} snapshot  the card's row
 * @param {{sceneId?: string|null, tokenId?: string|null, actorId?: string|null}|null} ref       who made the Test
 * @returns {boolean}
 */
export function rowMatches(snapshot, ref) {
  if (!snapshot || !ref) return false;
  const rowActor = plainId(snapshot.actorId);
  const refActor = plainId(ref.actorId);
  if (rowActor && refActor && rowActor !== refActor) return false;
  const rowToken = plainId(snapshot.tokenId);
  if (!rowToken) return Boolean(rowActor) && rowActor === refActor;
  if (rowToken !== plainId(ref.tokenId)) return false;
  const rowScene = plainId(snapshot.sceneId);
  const refScene = plainId(ref.sceneId);
  return !(rowScene && refScene && rowScene !== refScene);
}

/**
 * WHAT ONE TARGET'S RESILIENCE TEST CAME TO, as the spell card records it
 * (D-726). Built from the Test's own card - its roll, its author, its time -
 * and never from anything a caller says the roll was.
 *
 * **THE LATEST ROLL WINS.** A table that re-rolls a Resilience Test has
 * accepted the second result, so a newer Test replaces the record and `count`
 * says how many there have been. The same Test recorded twice is one Test, and
 * a Test OLDER than the record - two clients answering one row at once, the
 * earlier arriving last - is counted and replaces nothing.
 *
 * @param {object} o
 * @param {object} o.link        the row the Test answered, as `resistLink` builds one
 * @param {string} [o.name]      the target as the card names it
 * @param {boolean} o.success
 * @param {number|null} [o.total]
 * @param {number|null} [o.dc]
 * @param {number|null} [o.sl]
 * @param {string|null} [o.resultId]  the Resilience card
 * @param {string|null} [o.userId]    who rolled it
 * @param {number|null} [o.at]        when it was rolled
 * @param {object|null} [o.previous]  the record already under that key
 * @returns {object|null}  null where the link names no creature
 */
export function resistRecord({ link = null, name = "", success = false, total = null, dc = null, sl = null, resultId = null, userId = null, at = null, previous = null } = {}) {
  const key = resistKey(link);
  if (!key) return null;
  const prior = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : null;
  const result = plainId(resultId);
  const sameTest = Boolean(prior && result && prior.resultId === result);
  const counted = prior ? (Number.isInteger(prior.count) && prior.count > 0 ? prior.count : 1) : 0;
  const count = sameTest ? counted : counted + 1;
  const record = {
    key,
    index: rowIndex(link.index),
    sceneId: plainId(link.sceneId),
    tokenId: plainId(link.tokenId),
    actorId: plainId(link.actorId),
    name: typeof name === "string" ? name : "",
    success: success === true,
    total: finite(total),
    dc: finite(dc),
    sl: finite(sl),
    resultId: result,
    userId: plainId(userId),
    at: finite(at),
    count
  };
  const older = Boolean(prior) && !sameTest && finite(prior.at) !== null && record.at !== null && prior.at > record.at;
  return older ? { ...prior, count } : record;
}

/**
 * The records a card holds, in the order a reader meets them: by the row they
 * answer, a Test from no row after every row, then by name and by key. Never
 * the order an object's keys happen to come out in.
 *
 * @param {object|null} resists  `flags.azeroth-rpg.resists`
 * @returns {Array<object>}
 */
export function orderedResists(resists) {
  if (!resists || typeof resists !== "object" || Array.isArray(resists)) return [];
  const rank = r => (rowIndex(r.index) ?? Number.MAX_SAFE_INTEGER);
  return Object.values(resists)
    .filter(r => r && typeof r === "object" && plainId(r.key))
    .sort((a, b) => rank(a) - rank(b)
      || String(a.name ?? "").localeCompare(String(b.name ?? ""))
      || String(a.key ?? "").localeCompare(String(b.key ?? "")));
}
