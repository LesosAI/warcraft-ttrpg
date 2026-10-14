/**
 * WHAT A REACTION WRITES BACK ONTO THE CARD IT ANSWERED (06 §6, D-720).
 *
 * A Parry or a Block is pressed on the attacker's own card and the mark it
 * leaves is spent inside `AzerothActor#applyDamage` - so the card went on
 * printing **Apply 9** after a Block had taken four off it, and the only place
 * the smaller number appeared was a toast that had already gone. The lead read
 * it as the Reaction doing nothing.
 *
 * The write is the MESSAGE's, and a player does not own the attacker's card, so
 * it goes through v14's `User#query` on the GM's client exactly as a laid Bane
 * does (D-693); never `game.socket`.
 *
 * **It is an annotation and never the number applied.** `damageByTarget[i]
 * .damage` is left exactly as the roll worked it out, because `applyDamage` is
 * still what spends the mark; `to`, `mitigated` and `reaction` sit beside it so
 * the card can say what happened. Patching `damage` itself would take the four
 * off twice.
 *
 * **AND WHO RESISTED A SPELL, ON THE SPELL'S CARD** (07 §2, D-726). A target's
 * owner presses their row on the caster's card, and the card is the caster's,
 * so the record rides this same query with `kind: "resist"` - no second query
 * and no socket. The handler trusts two message ids and nothing else: the
 * record is built from the Resilience card's own roll.
 *
 * **AND WHAT AN AREA'S TEST CAME TO, ON THE AREA'S CARD** (the final review of
 * D-757): `kind: "areaTest"`, the same two ids, and a record that is written
 * ONCE - what the Test lands is landed only where the record was, so a card
 * pressed twice lands its damage and conditions once.
 */

import { mitigatedDamage } from "../rules/reactions.mjs";
import { resistKey, resistRecord, rowMatches } from "../rules/records.mjs";

export const ANNOTATE_QUERY = "azeroth-rpg.annotateCard";

/**
 * Write the annotation here, on a client that owns the message.
 * @returns {Promise<object|null>} the annotated row
 */
export async function annotateHere({ messageId, index, reaction, to, mitigated } = {}) {
  const message = game.messages.get(messageId);
  const i = Number(index);
  if (!message || !Number.isInteger(i) || i < 0) return null;
  const rows = foundry.utils.deepClone(message.flags?.["azeroth-rpg"]?.damageByTarget ?? []);
  if (!rows[i]) return null;
  rows[i] = { ...rows[i], reaction: reaction ?? null, to, mitigated };
  await message.update({ "flags.azeroth-rpg.damageByTarget": rows });
  return rows[i];
}

/**
 * The actor a card's target snapshot points at: its token on its scene, else
 * the world actor. One resolver, shared with `dice/chat.mjs`, because the GM
 * side has to land on exactly the document the Reaction's own door wrote its
 * mark on.
 */
export function targetActorOf(t) {
  const scene = (t?.sceneId && game.scenes.get(t.sceneId)) || canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors.get(t.actorId) : null) ?? null;
}

/**
 * WHAT THE ROW SHOULD SAY, WORKED OUT HERE (06 §6, D-720).
 *
 * The query runs on the GM's client with a payload a player composed, so
 * **nothing in that payload is trusted but which card and which row**. The
 * caller's numbers are thrown away and recomputed from the card's own stored
 * damage and the mark the Reaction left, through the one `mitigatedDamage` the
 * Health is written with; the name of the Reaction comes off the mark too.
 *
 * Two gates, the shape `effects/banes.mjs#layBaneQueryHandler` already uses:
 *
 * - **The row is the DEFENDER's to annotate**, so the user has to own the
 *   creature that row names. Without it any player could rewrite the number on
 *   any Apply button of any card in the log.
 * - **The mark has to be for THIS card.** A Block is answered on the attack it
 *   was pressed on (`AzerothActor#applyDamage` spends it the same way), so a
 *   mark standing for another blow annotates nothing here.
 *
 * @param {object} o
 * @param {string} o.messageId
 * @param {number} o.index
 * @param {User|null} [o.user]  the asking user; null is this client's own call
 * @returns {{ok: boolean, reason?: string, params?: object, payload?: object}}
 */
export function verifiedAnnotation({ messageId, index, user = null } = {}) {
  const message = game.messages.get(messageId);
  const i = Number(index);
  if (!message || !Number.isInteger(i) || i < 0) return { ok: false, reason: "AZEROTH.Card.AnnotateFailed" };
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const row = flags.damageByTarget?.[i] ?? null;
  const snapshot = flags.targets?.[i] ?? null;
  if (!row || !snapshot) return { ok: false, reason: "AZEROTH.Card.AnnotateFailed" };
  const defender = targetActorOf(snapshot);
  if (!defender) return { ok: false, reason: "AZEROTH.Reaction.Refuse.Gone" };
  if (user && !defender.testUserPermission(user, "OWNER")) {
    return { ok: false, reason: "AZEROTH.Reaction.Refuse.NotYours", params: { name: defender.name } };
  }
  const mark = defender.getFlag("azeroth-rpg", "mitigate") ?? null;
  if (!mark || mark.messageId !== message.id) {
    return { ok: false, reason: "AZEROTH.Card.AnnotateNoMark", params: { name: defender.name } };
  }
  const before = Math.max(0, Math.trunc(Number(row.damage)) || 0);
  const to = mitigatedDamage(before, mark);
  return {
    ok: true,
    payload: { messageId: message.id, index: i, reaction: mark.reaction ?? null, to, mitigated: before - to }
  };
}

/**
 * The GM-side handler, registered on `CONFIG.queries` (`module/queries.mjs`).
 *
 * Core only checks `QUERY_USER`, so the handler checks the rest itself - the
 * same division `layBaneQueryHandler` makes. The refusal is thrown, and
 * `annotateMitigation` shows it to whoever asked.
 */
export async function annotateQueryHandler(payload = {}, { user = null } = {}) {
  // A Resist's record on a spell card (D-726). Two ids are read off the
  // payload and every other key in it is ignored.
  if (payload?.kind === "resist") return writeResist({ messageId: payload.messageId, resultId: payload.resultId }, user);
  // And an area's Test on the area's own card (the final review of D-757), the
  // same two ids and nothing else.
  if (payload?.kind === "areaTest") return writeAreaTest({ messageId: payload.messageId, resultId: payload.resultId }, user);
  const verdict = verifiedAnnotation({ messageId: payload.messageId, index: payload.index, user });
  if (!verdict.ok) throw new Error(game.i18n.format(verdict.reason, verdict.params ?? {}));
  const done = await annotateHere(verdict.payload);
  if (!done) throw new Error(game.i18n.localize("AZEROTH.Card.AnnotateFailed"));
  return done;
}

/**
 * Annotate the row a Reaction answered: here where this client owns the card,
 * on the active GM's client otherwise.
 *
 * The number is worked out from the card's own stored damage and the mark the
 * Reaction left, through `rules/reactions.mjs#mitigatedDamage` - the same
 * function `applyDamage` uses, so the button and the Health cannot disagree.
 *
 * @param {object} o
 * @param {string|null} o.messageId
 * @param {number|null} o.index      the target row on the card
 * @param {object} o.mark            the `mitigate` flag just written
 * @param {string} o.reaction        "block" | "parry"
 */
export async function annotateMitigation({ messageId = null, index = null, mark = null, reaction = null } = {}) {
  const i = Number(index);
  if (!messageId || !Number.isInteger(i) || i < 0) return null;
  const message = game.messages.get(messageId);
  if (!message) return null;
  const row = message.flags?.["azeroth-rpg"]?.damageByTarget?.[i] ?? null;
  if (!row) return null;
  const before = Math.max(0, Math.trunc(Number(row.damage)) || 0);
  const to = mitigatedDamage(before, mark);
  const payload = { messageId, index: i, reaction, to, mitigated: before - to };
  try {
    if (message.isOwner) return await annotateHere(payload);
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return await gm.query(ANNOTATE_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* -------------------------------------------- */
/*  Who resisted a spell (07 §2, D-726)          */
/* -------------------------------------------- */

/**
 * A message this client has, waiting briefly for one that was only just made.
 *
 * The Resilience card is created on the roller's client and the query that
 * names it follows at once, so the GM's client may be answering before the
 * creation has reached its own collection.
 */
async function messageArriving(id, ms = 5000) {
  if (typeof id !== "string" || !id) return null;
  for (let waited = 0; waited < ms && !game.messages.get(id); waited += 50) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return game.messages.get(id) ?? null;
}

/**
 * The creature a Resist names: the token it names on the scene it names, else
 * the world actor. **A token that is not there is nobody**, rather than
 * falling back to its actor, because the record would then be filed under a
 * token that does not exist.
 *
 * **This is the law for a card's ROW as well as for a Test with no row**, and
 * `targetActorOf` is not it: a row's `actorId` for an UNLINKED token is the
 * base actor's, which every other token off that actor shares. A Blizzard on
 * three Plagued Ghouls, one of them killed, would otherwise roll that row's
 * Test on the world *Plagued Ghoul* and land the condition on all three
 * (D-726). `dice/chat.mjs#resistersOf` is the door that reads it.
 */
export function resisterOf(link) {
  if (link?.tokenId) {
    const scene = (link.sceneId && game.scenes.get(link.sceneId)) || canvas?.scene || null;
    const token = scene?.tokens?.get(link.tokenId) ?? null;
    return token?.actor ? { actor: token.actor, sceneId: scene.id, tokenId: token.id, name: token.name } : null;
  }
  const actor = link?.actorId ? game.actors.get(link.actorId) ?? null : null;
  return actor ? { actor, sceneId: null, tokenId: null, name: actor.name } : null;
}

/**
 * WHAT A RESIST ROW RECORDS, WORKED OUT HERE (D-726).
 *
 * The write can run on the GM's client with ids a player sent, so **nothing is
 * taken on trust but the two message ids**, and everything else comes off the
 * two cards:
 *
 * - the spell card is a spell card, and the Resilience card is one whose own
 *   `resistOf` names that spell card;
 * - the asker made the Resilience Test - they are its author - and owns the
 *   creature that made it, which is its speaker;
 * - on a card that recorded targets, the Test answers the row it names and that
 *   row names the same creature (`rules/records.mjs#rowMatches`). A Test from no
 *   row - the card's one button, where nothing was targeted - is filed under
 *   the creature that made it;
 * - the success, the total, the DC and the Success Level are the Resilience
 *   card's own roll, whatever a payload says they were.
 *
 * @param {object} o
 * @param {string} o.messageId   the spell card
 * @param {string} o.resultId    the Resilience card
 * @param {User|null} [o.user]   the asking user; null trusts the caller entirely
 * @returns {Promise<{ok: boolean, reason?: string, params?: object, record?: object}>}
 */
export async function verifiedResist({ messageId, resultId, user = null } = {}) {
  const unlinked = { ok: false, reason: "AZEROTH.Card.ResistUnlinked" };
  const message = typeof messageId === "string" ? game.messages.get(messageId) ?? null : null;
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (!message || flags.kind !== "spell") return unlinked;
  const result = await messageArriving(resultId);
  const link = result?.flags?.["azeroth-rpg"]?.kind === "resilience" ? result.flags["azeroth-rpg"].resistOf ?? null : null;
  if (!link || link.messageId !== message.id) return unlinked;
  if (user && result.author?.id !== user.id) return { ok: false, reason: "AZEROTH.Card.NotYours" };

  // Which creature, and which row: the row the link names, else - on an older
  // card that recorded targets and drew one button - the row that names this
  // creature, else no row at all.
  const targets = Array.isArray(flags.targets) ? flags.targets : [];
  let index = Number.isInteger(link.index) ? link.index : null;
  let row = null;
  if (index !== null) {
    row = targets[index] ?? null;
    if (!row || !rowMatches(row, link)) return unlinked;
  } else if (targets.length) {
    // **A CARD THAT RECORDED TARGETS RECORDS NOTHING FOR A CREATURE IT NEVER
    // NAMED.** The asker authors the Resilience card, so its `resistOf` is
    // theirs to compose; without this, `index: null` on a card whose rows match
    // nobody fell through to `resisterOf(link)` and wrote *Bob: Success* onto a
    // Fireball aimed at somebody else - printed to every reader by
    // `showResists` and read as a real Test by anything downstream of it.
    // The no-row path below is the EMPTY card's alone (D-726).
    const found = targets.findIndex(t => rowMatches(t, link));
    if (found < 0) return unlinked;
    index = found;
    row = targets[found];
  }
  let who = null;
  if (row) {
    // The door's own law, so a row whose token has gone names nobody here too.
    const there = resisterOf(row);
    who = there ? { ...there, tokenId: row.tokenId ?? null, name: row.name ?? there.name } : null;
  } else {
    who = resisterOf(link);
  }
  if (!who) return { ok: false, reason: "AZEROTH.Card.TargetGone" };
  // The Test is that creature's: a synthetic actor's id is its base actor's,
  // so this holds for a token's copy and for the world actor alike.
  if (ChatMessage.getSpeakerActor(result.speaker)?.id !== who.actor.id) return unlinked;
  if (user && !who.actor.testUserPermission(user, "OWNER")) return { ok: false, reason: "AZEROTH.Card.NotYours" };

  const roll = result.rolls?.[0] ?? null;
  const outcome = roll?.outcome ?? null;
  if (!outcome) return unlinked;
  const ids = { index, sceneId: who.sceneId, tokenId: who.tokenId, actorId: who.actor.id };
  const record = resistRecord({
    link: ids,
    name: who.name ?? "",
    success: outcome.success === true,
    total: roll.total,
    dc: roll.options?.dc ?? null,
    sl: outcome.sl,
    resultId: result.id,
    userId: result.author?.id ?? null,
    // **WHEN IT WAS ROLLED IS THE SERVER'S**, not the card's. `timestamp` is an
    // ordinary field the creating client supplies (core only fills it where it
    // is null), so a player could author a Resilience card at `9e15` and
    // `resistRecord`'s older-loses branch would then refuse every later Test,
    // the GM's own re-roll included. `_stats.modifiedTime` is in
    // `DocumentStatsField.managedFields` and is IGNORED if it appears in
    // creation or update data (14.367, `common/data/fields.mjs`).
    at: result._stats?.modifiedTime ?? result.timestamp ?? null,
    previous: flags.resists?.[resistKey(ids)] ?? null
  });
  return record ? { ok: true, record } : unlinked;
}

/**
 * Write one target's record onto the spell card: **ONE KEY PER WRITE**.
 *
 * `flags.azeroth-rpg.resists.<key>` and nothing beside it, so two targets
 * answering at once each land their own row. Rewriting the whole map - as
 * `annotateHere` rewrites `damageByTarget` - is last-write-wins, and the second
 * Test would erase the first.
 *
 * @returns {Promise<object>} the record written
 */
async function writeResist({ messageId, resultId } = {}, user = null) {
  const verdict = await verifiedResist({ messageId, resultId, user });
  if (!verdict.ok) throw new Error(game.i18n.format(verdict.reason, verdict.params ?? {}));
  const message = game.messages.get(messageId);
  await message.update({ [`flags.azeroth-rpg.resists.${verdict.record.key}`]: verdict.record });
  return verdict.record;
}

/**
 * Record a Resist row's Test on the spell card it answered (D-726): here where
 * this client owns the card, through the active GM otherwise, and in words
 * where there is no GM to ask.
 *
 * @param {object} o
 * @param {ChatMessage} o.message  the spell card
 * @param {ChatMessage} o.result   the Resilience card the Test posted
 * @returns {Promise<object|null>} the record, or null where it was refused
 */
export async function recordResist({ message = null, result = null } = {}) {
  if (!message?.id || !result?.id) return null;
  const payload = { kind: "resist", messageId: message.id, resultId: result.id };
  try {
    if (message.isOwner) return await writeResist(payload, game.user);
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Card.ResistNeedsGM"));
    return await gm.query(ANNOTATE_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* -------------------------------------------- */
/*  An area's Test, made ONCE (D-757's review)   */
/* -------------------------------------------- */

/**
 * The area cards whose record this client is writing now. Checked and added
 * before the handler's first `await`, so two presses reaching the writing
 * client together - a player's and the GM's - cannot both find the card
 * unrecorded.
 */
const AREA_WRITES = new Set();

/** The creature an area's card is for, by name, for the words a refusal says. */
export function areaTestName(message) {
  const area = message?.flags?.["azeroth-rpg"]?.area ?? {};
  let actor = null;
  try {
    actor = area.actorUuid ? fromUuidSync(area.actorUuid) : null;
  } catch {
    actor = null;
  }
  return actor?.name ?? message?.speaker?.alias ?? "";
}

/**
 * The words a recorded area Test comes to: *Plagued Ghoul*, *Failure*, *9*,
 * *14* - what `AZEROTH.Card.ResistOutcome` and `AZEROTH.AreaTest.Already` say.
 *
 * @param {object} record  `flags.azeroth-rpg.areaResult`
 */
export function areaResultWords(record = {}) {
  const dash = "—";
  return {
    name: record?.name ?? "",
    outcome: game.i18n.localize(record?.success ? "AZEROTH.Roll.Outcome.Success" : "AZEROTH.Roll.Outcome.Failure"),
    total: record?.total ?? dash,
    dc: record?.dc ?? dash
  };
}

/**
 * WHAT AN AREA'S TEST RECORDS, WORKED OUT HERE (the final review of D-757).
 *
 * An area's Resist card (`effects/area-strikes.mjs#postAreaTest`) was pressed
 * again and again, and every press re-rolled the Test and re-landed its damage,
 * its conditions, its Bane and its lost turn. **The Test is made once**, and
 * this is its record, in `verifiedResist`'s shape: nothing is taken on trust but
 * the two message ids - the card is an area's Test card with nothing recorded
 * on it yet; the Resilience card's own `resistOf` names it; the asker made that
 * Test and owns the creature the card is for, which made it; and the numbers
 * are that card's own roll.
 *
 * @param {object} o
 * @param {string} o.messageId   the area's Test card
 * @param {string} o.resultId    the Resilience card
 * @param {User|null} [o.user]   the asking user; null trusts the caller entirely
 * @returns {Promise<{ok: boolean, reason?: string, params?: object, record?: object}>}
 */
export async function verifiedAreaTest({ messageId, resultId, user = null } = {}) {
  const unlinked = { ok: false, reason: "AZEROTH.Card.ResistUnlinked" };
  const message = typeof messageId === "string" ? game.messages.get(messageId) ?? null : null;
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (!message || flags.kind !== "areaTest" || !flags.area?.check) return unlinked;
  if (flags.areaResult) return { ok: false, reason: "AZEROTH.AreaTest.Already", params: areaResultWords(flags.areaResult) };
  const result = await messageArriving(resultId);
  const link = result?.flags?.["azeroth-rpg"]?.kind === "resilience" ? result.flags["azeroth-rpg"].resistOf ?? null : null;
  if (!link || link.messageId !== message.id) return unlinked;
  if (user && result.author?.id !== user.id) return { ok: false, reason: "AZEROTH.Card.NotYours" };
  let who = null;
  try {
    who = flags.area.actorUuid ? fromUuidSync(flags.area.actorUuid) : null;
  } catch {
    who = null;
  }
  if (!who) return { ok: false, reason: "AZEROTH.Card.TargetGone" };
  // The Test is that creature's: a synthetic actor's id is its base actor's.
  if (ChatMessage.getSpeakerActor(result.speaker)?.id !== who.id) return unlinked;
  if (user && !who.testUserPermission(user, "OWNER")) return { ok: false, reason: "AZEROTH.Card.NotYours" };
  const roll = result.rolls?.[0] ?? null;
  const outcome = roll?.outcome ?? null;
  if (!outcome) return unlinked;
  const record = resistRecord({
    link: { index: null, sceneId: link.sceneId ?? null, tokenId: link.tokenId ?? null, actorId: who.id },
    name: who.name ?? "",
    success: outcome.success === true,
    total: roll.total,
    dc: roll.options?.dc ?? null,
    sl: outcome.sl,
    resultId: result.id,
    userId: result.author?.id ?? null,
    // When it was rolled is the server's (`verifiedResist`'s reason).
    at: result._stats?.modifiedTime ?? result.timestamp ?? null
  });
  return record ? { ok: true, record } : unlinked;
}

/**
 * Write an area Test's record onto its card, on the client that owns the card.
 * A second write for the same card while this one is in flight is refused in
 * words before anything is awaited.
 *
 * @returns {Promise<object>} the record written
 */
async function writeAreaTest({ messageId, resultId } = {}, user = null) {
  const message = typeof messageId === "string" ? game.messages.get(messageId) ?? null : null;
  if (message && AREA_WRITES.has(message.id)) {
    throw new Error(game.i18n.format("AZEROTH.AreaTest.Pending", { name: areaTestName(message) }));
  }
  if (message) AREA_WRITES.add(message.id);
  try {
    const verdict = await verifiedAreaTest({ messageId, resultId, user });
    if (!verdict.ok) throw new Error(game.i18n.format(verdict.reason, verdict.params ?? {}));
    await message.update({ "flags.azeroth-rpg.areaResult": verdict.record });
    return verdict.record;
  } finally {
    if (message) AREA_WRITES.delete(message.id);
  }
}

/**
 * Record an area's Test on the area's own card: here where this client owns
 * the card, through the active GM otherwise. **What the Test lands is landed
 * only where this wrote the record** (`dice/chat.mjs#resistTestFromCard`), so
 * a second press anywhere lands nothing and is told why.
 *
 * @param {object} o
 * @param {ChatMessage} o.message  the area's Test card
 * @param {ChatMessage} o.result   the Resilience card the Test posted
 * @returns {Promise<object|null>} the record, or null where it was refused (and said)
 */
export async function recordAreaTest({ message = null, result = null } = {}) {
  if (!message?.id || !result?.id) return null;
  const payload = { kind: "areaTest", messageId: message.id, resultId: result.id };
  try {
    if (message.isOwner) return await writeAreaTest(payload, game.user);
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.AreaTest.NeedsGM"));
    return await gm.query(ANNOTATE_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}
