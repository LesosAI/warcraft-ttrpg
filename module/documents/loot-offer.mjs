/**
 * AN OFFER OF LOOT, ON THE WORLD'S SIDE (D-721).
 *
 * `rules/loot-offer.mjs` is the law and knows nothing of Foundry; this is the
 * door every write goes through. Three facts of the platform shape all of it,
 * each verified against the shipped source at 14.367:
 *
 * - **A player can write neither a world setting nor a GM's chat message.**
 *   `SETTINGS_MODIFY` is a GAMEMASTER permission the server enforces, so every
 *   claim is a query to the designated GM's client (`CONFIG.queries`, D-643),
 *   never `game.socket`.
 * - **A query reaches EVERY socket of the target user**, so a GM with two tabs
 *   open runs the handler twice on one press. That is why a repeat of a user's
 *   own state is a no-op rather than a refusal, and why the settle takes a lock
 *   before it hands anything over. **The lock is the DELETE of the offered
 *   card**, because a delete of a document that is already gone is the write
 *   the server refuses under the collection's own semaphore
 *   (`${l} "${o[t]}" does not exist!`). A create carrying the offer's `_id`
 *   under `keepId` is NOT a lock: the duplicate check is `m?.has(o._id)`
 *   against the PARENT's embedded collection, so it fires for embedded
 *   documents alone and a world ChatMessage written twice simply overwrites -
 *   both tabs would pass it and both would hand the loot out. `keepId` stays
 *   for the one thing it does do here: the settled card is findable by the
 *   offer's id, which is what lets a Resume take over a settle that stalled.
 *   (Both verified in `dist/database/backend/server-backend.mjs` at 14.367.)
 * - **The settle never runs inside the query's ack path.** The last claimant
 *   would sit waiting on every embed, every ownership write and a chat card
 *   before their own button came back. The handler writes the claim, acks, and
 *   puts the settle on the same chain behind itself.
 *
 * Everything here is serialised through one promise chain, so two claims
 * landing in the same tick cannot read the same offer and write over each
 * other.
 */

import {
  claim, distribution, eligible, isComplete, offerFrom, pendingTakes, rowOf, rowState
} from "../rules/loot-offer.mjs";
import { admit } from "../rules/slots.mjs";
import { lootOffer, setLootOffer } from "../settings.mjs";
import { coins } from "../helpers/coins.mjs";
import { AZEROTH } from "../config.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/** The card both modes render (D11 §5). */
export const CARD_TEMPLATE = "systems/azeroth-rpg/templates/chat/loot-card.hbs";

/** A player's claim, run on the GM's client. */
export const CLAIM_LOOT_QUERY = "azeroth-rpg.claimLoot";

/**
 * Every refusal the law can return, as the LITERAL key of its sentence.
 *
 * A map rather than a branch joined to the code, so `lang-unused` can see each
 * one: a key built by concatenation leaves only its parent behind in the
 * source, the audit takes that as proof of use for every string beneath it,
 * and a key left behind by a retired refusal would never be found.
 *
 * The branch is not quoted in this comment either. The audit greps comments as
 * readily as code, so a sentence spelling the bad form out is itself an
 * occurrence of it - the fault rather than a description of it.
 */
export const REFUSALS = Object.freeze({
  closed: "AZEROTH.LootOffer.Refuse.Closed",
  notInvited: "AZEROTH.LootOffer.Refuse.NotInvited",
  noRow: "AZEROTH.LootOffer.Refuse.NoRow",
  notEligible: "AZEROTH.LootOffer.Refuse.NotEligible",
  taken: "AZEROTH.LootOffer.Refuse.Taken",
  notYours: "AZEROTH.LootOffer.Refuse.NotYours",
  gone: "AZEROTH.LootOffer.Refuse.Gone",
  noRoom: "AZEROTH.LootOffer.Refuse.NoRoom",
  badAction: "AZEROTH.LootOffer.Refuse.BadAction"
});

/** Why the loot stopped being on offer, in the card's words. */
const REASONS = Object.freeze({
  complete: "AZEROTH.LootOffer.Card.Reason.complete",
  finished: "AZEROTH.LootOffer.Card.Reason.finished",
  cancelled: "AZEROTH.LootOffer.Card.Reason.cancelled"
});

/* -------------------------------------------- */
/*  Who runs it, and who it is for               */
/* -------------------------------------------- */

/**
 * The GM whose client runs the offer.
 *
 * `getDesignatedUser` picks the same user on every client (highest role, then
 * the lowest id), so a player and the GM agree about where a claim is going
 * without anybody being told. An Assistant without `SETTINGS_MODIFY` cannot
 * write the setting, so they are not eligible to hold an offer either.
 *
 * @returns {User|null}
 */
export function lootGM() {
  return game.users?.getDesignatedUser?.(u => u.active && u.isGM && u.hasPermission("SETTINGS_MODIFY")) ?? null;
}

/**
 * The character a user's loot goes to: the actor they are assigned, else a
 * Party actor they own (D-658), else the first character they own.
 *
 * **THE ONE RESOLVER.** Both doors offer through it and the settle hands over
 * through it, so the sheet that receives the find is the one the picker named
 * when the offer was made.
 *
 * @param {User|null} user
 * @returns {{actor: Actor|null, reason: string|null}} `reason` is a lang KEY
 */
export function characterFor(user) {
  const none = { actor: null, reason: "AZEROTH.LootOffer.NoCharacter" };
  if (!user) return none;
  const assigned = user.character;
  if (assigned?.type === "character") return { actor: assigned, reason: null };
  // **A GM OWNS EVERYTHING.** `testUserPermission(user, "OWNER")` is true of
  // every actor in the world for a GM, so the two searches below would answer
  // with whichever Party actor happens to be first - somebody else's party,
  // most likely - rather than with nothing. A GM invited to an offer says who
  // they are playing by being ASSIGNED a character, and is refused otherwise.
  if (user.isGM) return none;
  const party = game.actors?.find(a => a.isParty === true && a.testUserPermission(user, "OWNER")) ?? null;
  if (party) return { actor: party, reason: null };
  const own = game.actors?.find(a => a.type === "character" && a.testUserPermission(user, "OWNER")) ?? null;
  if (own) return { actor: own, reason: null };
  return none;
}

/* -------------------------------------------- */
/*  One thing at a time                          */
/* -------------------------------------------- */

/**
 * The chain every write joins. Two players pressing Take on the same row in
 * the same tick would otherwise both read the offer before either wrote it,
 * and the second write would carry the first one's row back untouched.
 *
 * A rejection is swallowed on the CHAIN and rethrown to the CALLER: a refusal
 * has to reach the player who asked, and it must not stop the next claim.
 */
let chain = Promise.resolve();

export function serialised(fn) {
  const next = chain.then(() => fn());
  chain = next.catch(() => {});
  return next;
}

/* -------------------------------------------- */
/*  Presenting                                   */
/* -------------------------------------------- */

/** Warn in the user's own words and hand back nothing. */
function refuse(key, params = null) {
  ui.notifications?.warn(params ? game.i18n.format(key, params) : game.i18n.localize(key));
  return null;
}

/**
 * How high a rung the item sits on. `AZEROTH.rarities` is declared common to
 * legendary (`config.mjs`), so the key's own index IS the rung and an item with
 * no rarity at all - a hand-made thing out of a folder - answers -1 and sorts
 * last.
 */
function rarityRank(item) {
  const order = Object.keys(AZEROTH.rarities ?? {});
  return order.indexOf(item?.system?.rarity ?? "");
}

/**
 * THE ORDER THE OFFER IS READ IN: rolled finds first, then the best of them.
 *
 * **The generator's own on-screen order is not recoverable and that is why
 * this is the rule.** A find's stamp (`flags.azeroth-rpg.loot`) records the
 * scenario, the tier, the dungeon, the boss, the version, the time and the
 * rarity - and no index - so the row's position in the generator is written
 * down nowhere on the item; the only thing that ever carried it was the array
 * `Item.createDocuments` handed back, which is the unpromised order this sort
 * exists to replace. So the rule is the one a reader can see for themselves:
 *
 * 1. a **rolled find** (it carries the generator's stamp) before a hand-made
 *    thing offered out of a folder, because a folder's contents are the odds
 *    and ends and the find is what the offer is about;
 * 2. then **rarity, best first** - `AZEROTH.rarities`' own order reversed, so
 *    an epic heads the list and a common tails it, which is the order every
 *    other surface in the system tints for;
 * 3. then the **name**, and the **id** behind it. The name alone is not a
 *    total order - two identical finds roll often - and a sort that leaves a
 *    tie unbroken is back to depending on the order it was handed.
 */
function offerOrder(a, b) {
  const rolled = Number(Boolean(b.getFlag?.("azeroth-rpg", "loot"))) - Number(Boolean(a.getFlag?.("azeroth-rpg", "loot")));
  if (rolled) return rolled;
  const rung = rarityRank(b) - rarityRank(a);
  if (rung) return rung;
  const name = String(a.name ?? "").localeCompare(String(b.name ?? ""));
  if (name) return name;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

/**
 * Offer a find to the players named (GM only).
 *
 * Nothing is created here - the items already exist, in the folder they were
 * generated into - so presenting is three writes: OBSERVER on every offered
 * item for every invited user (a player needs LIMITED to open a sheet at all),
 * the offer into the world setting, and the card into chat.
 *
 * @param {object} o
 * @param {Item[]} o.items
 * @param {number} [o.copper]     The purse, split into a share each.
 * @param {string} [o.label]      The caller's words for what this find is.
 * @param {object|null} [o.stamp] What made it: the generator's scenario, or `{folder}`.
 * @param {string[]} o.userIds    Who was ticked in the picker.
 * @returns {Promise<object|null>} the offer, or null with the reason shown
 */
export async function presentLoot({ items = [], copper = 0, label = "", stamp = null, userIds = [] } = {}) {
  if (!game.user.isGM || !game.user.hasPermission("SETTINGS_MODIFY")) return refuse("AZEROTH.LootOffer.NotGM");
  if (lootOffer()) return refuse("AZEROTH.LootOffer.AlreadyOpen");

  const users = [...new Set(userIds ?? [])].map(id => game.users.get(id)).filter(Boolean);
  if (!users.length) return refuse("AZEROTH.LootOffer.NoPlayers");

  // **What is already spoken for is not the caller's to offer.** Both doors
  // filter it - the folder's list and the generator's own fresh items - but a
  // macro or a batch hands documents straight in, and re-offering a find that
  // is already on somebody's sheet would stamp a second offer's mark over the
  // first one's. Handing in items and having none of them survive REFUSES,
  // rather than quietly offering the purse alone.
  const handed = (items ?? []).filter(i => i?.id);
  // SORTED BEFORE THE ROWS ARE BUILT (CLAUDE.md §15: sort before you build a
  // list a person reads). `offerFrom` keeps the order it is given and the
  // window draws the rows in that order, so whatever arrives here IS what
  // every player sees - and the generator hands in the return of
  // `Item.createDocuments`, whose order is not promised, so the same find
  // moved up and down the list between one offer and the next.
  const things = handed.filter(i => !i.getFlag?.("azeroth-rpg", "loot")?.given
    && !i.getFlag?.("azeroth-rpg", "offer")?.id)
    .sort(offerOrder);
  const purse = Math.max(0, Math.trunc(Number(copper)) || 0);
  if (!things.length && (purse <= 0 || handed.length)) return refuse("AZEROTH.LootOffer.NoRows");

  const players = [];
  for (const user of users) {
    const { actor, reason } = characterFor(user);
    // A picked user with nowhere to put a find refuses the whole offer rather
    // than being dropped from it in silence: the picker greys them, so this is
    // only ever reached by a macro or a batch.
    if (!actor) return refuse(reason ?? "AZEROTH.LootOffer.NoCharacter");
    players.push({ userId: user.id, name: user.name, actorUuid: actor.uuid, actorName: actor.name });
  }

  const id = foundry.utils.randomID();
  const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  // ONE write over every item: a partial `ownership` object MERGES into what
  // the document holds, so nobody else's key is touched.
  //
  // **THE OFFER ONLY EVER LENDS**, and only where the user is below OBSERVER.
  // A partial ownership merge writes OBSERVER over whatever level was there,
  // so a blanket stamp DOWNGRADED a player who already owned the item - the
  // folder door offers things that have been sitting in the world, some of them
  // with a player's own key on them - and the take-back at the settle then
  // deleted the key altogether, because by then it "still equals OBSERVER".
  // Below the level the offer needs is the only case there is anything to lend.
  if (things.length) {
    await Item.updateDocuments(things.map(item => {
      const lend = Object.fromEntries(players
        .filter(p => (item.ownership?.[p.userId] ?? -1) < OBSERVER)
        .map(p => [p.userId, OBSERVER]));
      const update = { _id: item.id, "flags.azeroth-rpg.offer": { id, rowId: item.id } };
      // Nothing to lend is no `ownership` key at all: an empty object is a
      // write of nothing, and core cleans update data in place.
      if (Object.keys(lend).length) update.ownership = lend;
      return update;
    }));
  }

  const offer = offerFrom({
    id,
    at: Date.now(),
    by: game.user.id,
    label,
    stamp,
    players,
    items: things.map(item => ({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      rarity: item.system?.rarity ?? null,
      quantity: item.system?.quantity ?? null,
      price: item.system?.cost ?? null
    })),
    copper: purse
  });

  await setLootOffer(offer, "present");
  await postLootCard({ mode: "offered", offer });
  return offer;
}

/* -------------------------------------------- */
/*  Claiming                                     */
/* -------------------------------------------- */

/** The words a refusal is shown in, with the name its sentence names. */
function refusalText(code, { offer = null, row = null } = {}) {
  const key = REFUSALS[code] ?? REFUSALS.badAction;
  let name = "";
  if (code === "taken") {
    name = offer?.players?.find(p => p.userId === row?.claimedBy)?.name
      ?? game.users.get(row?.claimedBy)?.name ?? "";
  } else if (code === "notEligible") {
    name = offer?.players?.find(p => p.userId === row?.forUserId)?.name ?? row?.name ?? "";
  } else if (code === "noRoom") {
    name = row?.name ?? "";
  }
  return game.i18n.format(key, { name });
}

/**
 * Whether this take has nowhere to land (08 §11, D-737).
 *
 * **Judged against every row this player is already holding**, because the
 * settle embeds them in ONE batch under the bypass: a check that looked at a
 * single row would let a player take four things into two free wells and lose
 * two of them at the hand-over with no word to anybody.
 *
 * A player whose character cannot be resolved is NOT refused: the settle
 * already strands those rows and leaves the world copies theirs to drag, and
 * refusing here would deadlock the offer instead.
 *
 * @param {object} offer
 * @param {object} row    the item row being taken
 * @param {User} user
 */
function noRoomFor(offer, row, user) {
  const { actor } = characterFor(user);
  if (actor?.type !== "character") return false;
  const taking = [...pendingTakes(offer, user.id).filter(r => r.id !== row.id), row];
  const newcomers = [];
  for (const take of taking) {
    const doc = game.items.get(take.id) ?? null;
    if (!doc) continue;
    newcomers.push({ ...carriedCopy(doc), id: doc.id });
  }
  if (!newcomers.length) return false;
  const held = actor.items.map(item => ({ ...item.toObject(), id: item.id }));
  const verdicts = admit(held, actor.system?.bagSlots?.base ?? 0, newcomers);
  return verdicts.some(v => v.ok === false);
}

/**
 * Whether the row already reads the way this action would leave it.
 *
 * **The transport's problem, not the game's.** `claim` already answers a
 * repeat with a no-op while the offer is open; this covers the one gap that
 * leaves - a GM's second tab running the handler after the first has already
 * completed the offer and moved it into `settling`, where the law can only
 * say `closed`. Without it a successful press would come back as a refusal.
 */
function alreadyThere(row, userId, action) {
  if (!row) return false;
  const state = rowState(row, userId);
  const passed = Array.isArray(row.passed) && row.passed.includes(userId);
  if (action === "take") return state === "mine";
  if (action === "release") return !row.claimedBy;
  if (action === "pass") return !row.claimedBy && passed;
  if (action === "unpass") return !passed;
  return false;
}

/**
 * The GM-side handler, registered on `CONFIG.queries` (`module/queries.mjs`).
 *
 * Core checks only `QUERY_USER`; everything else is checked here, against the
 * offer as it stands at this instant rather than as the caller believed it to
 * be. A refusal is THROWN, which is how `User#query` carries a message back
 * (`e.message` and nothing else).
 *
 * @param {{offerId: string, rowId: string, action: string}} payload
 * @param {{user?: User}} context  core hands the asking user in here
 */
export async function claimLootQueryHandler(payload = {}, { user = null } = {}) {
  // `payload ?? {}` rather than the default alone: a caller that passes an
  // explicit `null` skips the default, and the destructuring inside `claimHere`
  // would throw a TypeError whose message - *Cannot destructure property...* -
  // travels back to the presser as though it were the refusal.
  return serialised(() => claimHere(payload ?? {}, user));
}

async function claimHere({ offerId, rowId, action } = {}, user = null) {
  const offer = lootOffer();
  if (!offer || offer.id !== offerId) throw new Error(refusalText("closed"));
  if (!user || !game.users.get(user.id)) throw new Error(refusalText("notInvited"));

  const row = rowOf(offer, rowId);
  // The world copy is the thing itself: a find deleted out of the folder while
  // the window was open cannot be TAKEN, and says so rather than handing over
  // nothing at the settle.
  //
  // **Only a take.** Refusing every action on a gone row deadlocks the offer -
  // nobody can take it and nobody can pass it, so it never resolves and the
  // GM's Finish becomes the only way out. Passing on a thing that no longer
  // exists is exactly what a player should be able to do.
  if (row && row.kind === "item" && action === "take" && !game.items.has(row.id)) {
    throw new Error(refusalText("gone", { offer, row }));
  }
  // **AND A TAKE WITH NO BAG SLOT IS REFUSED HERE**, before the row is
  // claimed (08 §11, D-737). The settle embeds under the bypass, because a row
  // a player was told they had must never be dropped at the hand-over - so the
  // claim is the only place the room can be judged, and it is judged against
  // everything this player is already holding in the offer.
  if (row && row.kind === "item" && action === "take" && noRoomFor(offer, row, user)) {
    throw new Error(refusalText("noRoom", { offer, row }));
  }
  // The double run, and ONLY for somebody the offer would have let act: an
  // uninvited caller is refused here exactly as `claim` would refuse them.
  const invited = (offer.players ?? []).some(p => p.userId === user.id);
  if (invited && row && eligible(row, offer).includes(user.id) && alreadyThere(row, user.id, action)) {
    return { ok: true, noop: true, state: rowState(row, user.id) };
  }

  const verdict = claim(offer, { rowId, userId: user.id, action });
  if (!verdict.ok) throw new Error(refusalText(verdict.code, { offer, row }));

  const next = verdict.offer;
  // ONE WRITE, carrying the status with it. The claim that completes an offer
  // closes it in the same write: two writes would leave an instant where the
  // offer is complete and still open, and a second tab's claim landing in it
  // would change what was about to be handed over.
  const complete = !verdict.noop && isComplete(next);
  if (!verdict.noop) await setLootOffer(complete ? { ...next, status: "settling" } : next, "claim");
  if (complete) {
    // The settle goes on the chain BEHIND this handler: awaiting it here would
    // keep the last claimant's button spinning through every embed, every
    // ownership write and a chat card.
    //
    // **The promise is DROPPED, so its rejection has to be caught here.** An
    // unhandled one is a line in a console nobody is reading, and the offer is
    // left standing in `settling` with no word to anybody. This runs on the
    // GM's own client, so the toast lands where the Resume button is.
    serialised(() => settleHere(next, { reason: "complete" })).catch(err => {
      console.error("azeroth-rpg | loot settle failed", err);
      ui.notifications?.error(err.message);
    });
  }

  // The no-op travels back: the window prints nothing different for it, but a
  // caller that asked whether anything moved is entitled to the answer, and a
  // `noop` dropped here reads as a claim that landed.
  return { ok: true, ...(verdict.noop ? { noop: true } : {}), state: rowState(rowOf(next, rowId), user.id) };
}

/**
 * Take, put back, pass or reconsider: here where this client is the offer's
 * GM, on that GM's client otherwise.
 *
 * The refusal is SHOWN rather than thrown - a window that threw would toast
 * twice and leave the row mid-press - and handed back so the caller can print
 * it beside the row.
 *
 * @param {{rowId: string, action: string}} what
 * @returns {Promise<{ok: boolean, state?: string, reason?: string}>}
 */
export async function claimLoot({ rowId, action } = {}) {
  const offer = lootOffer();
  if (!offer) {
    const reason = game.i18n.localize("AZEROTH.LootOffer.Closed");
    ui.notifications?.warn(reason);
    return { ok: false, reason };
  }
  const payload = { offerId: offer.id, rowId, action };
  try {
    const gm = lootGM();
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.LootOffer.NoGM"));
    // THROUGH THE REGISTRY even on the GM's own client, so the one door is the
    // one a test can wrap and count.
    if (gm.isSelf) return await CONFIG.queries[CLAIM_LOOT_QUERY](payload, { user: game.user });
    return await gm.query(CLAIM_LOOT_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false, reason: err.message };
  }
}

/* -------------------------------------------- */
/*  Settling                                     */
/* -------------------------------------------- */

/**
 * The GM's way out of an open offer: hand over what was taken, or withdraw it
 * and hand over nothing. Both go on the chain, so neither can overtake a claim
 * that is already being written.
 */
export async function finishOffer() {
  return serialised(() => endHere("finished"));
}

export async function cancelOffer() {
  return serialised(() => endHere("cancelled"));
}

async function endHere(reason) {
  if (!game.user.isGM || !game.user.hasPermission("SETTINGS_MODIFY")) return refuse("AZEROTH.LootOffer.NotGM");
  const offer = lootOffer();
  if (!offer) return refuse("AZEROTH.LootOffer.Closed");
  // **A SETTLE ALREADY RUNNING IS NOT FINISHED AGAIN.** Finish and Cancel used
  // to read no status at all, so a press while the settle was working - or the
  // same press from a second tab - wrote `settling` over it and ran a second
  // hand-over with `resume`, which skips the lock: every taken row landed on
  // its sheet twice. Resume is the one way to take over a settle that stalled,
  // and it says so.
  if (offer.status === "settling") return refuse("AZEROTH.LootOffer.Refuse.Settling");
  await setLootOffer({ ...offer, status: "settling" }, "claim");
  // A deliberate press takes the offer straight to the hand-over rather than
  // contending for the lock: the guard above is what stops a second press, and
  // the offered card may have been deleted out of the log by hand, which would
  // otherwise leave Finish doing nothing at all.
  return settleHere(offer, { reason, resume: true });
}

/**
 * Settle the offer: the door for a caller OUTSIDE the chain - the GM's Resume
 * button, a macro, a batch.
 *
 * **Never call this from inside `serialised`**: a link that awaits a link
 * queued behind it waits for itself. The handler and `endHere` call
 * `settleHere` directly for that reason.
 *
 * @param {object} offer
 * @param {object} how
 * @param {"complete"|"finished"|"cancelled"} [how.reason]
 * @param {boolean} [how.resume]  take over a settle that already began
 */
export async function settleOffer(offer, { reason = "complete", resume = false } = {}) {
  if (!game.user.isGM) return null;
  return serialised(() => settleHere(offer, { reason, resume }));
}

/**
 * The offered card for one offer, or null.
 *
 * Read off the flag rather than off an id of its own: the offered card is
 * posted with whatever `_id` the server gives it, and the offer's own id
 * belongs to the SETTLED card (the anchor a Resume finds).
 */
function offeredCard(offerId) {
  return game.messages.find(m => {
    const flags = m.flags?.["azeroth-rpg"];
    return flags?.kind === "lootOffer" && flags.offerId === offerId;
  }) ?? null;
}

/**
 * Hand the loot over, on this client.
 *
 * **DELETING THE OFFERED CARD IS THE LOCK**, and it is taken before anything
 * is handed over. A GM with two tabs open runs the handler that completed the
 * offer on both of them, so both reach this; the server resolves a delete
 * against the collection it is deleting from and throws
 * `... "<id>" does not exist!` for a document that is already gone, under the
 * same semaphore, so exactly one of the two gets past the delete and the loser
 * returns having written nothing at all.
 *
 * **A create under `keepId` is not a lock and this used to rely on one.** The
 * duplicate-id refusal is `m?.has(o._id)` against the PARENT's embedded
 * collection (`dist/database/backend/server-backend.mjs`, 14.367), so a world
 * ChatMessage created twice with the same `_id` simply overwrites: both tabs
 * passed, and both handed the loot out. The id stays on the settled card as the
 * ANCHOR - `game.messages.get(offer.id)` is how a Resume finds the card a
 * stalled settle left behind - and `resume` skips the delete, because a
 * deliberate press is not contending with anybody for it.
 *
 * **The deliberate path removes the offered card too, and it is BEST EFFORT**:
 * Finish and Cancel leave nothing behind holding a live Open button on an offer
 * that has closed, but the removal takes no lock and a failure never aborts the
 * hand-over.
 *
 * Each player's rows are marked `settled` as they land, so a world that
 * restarts mid-settle resumes past what was already handed over rather than
 * giving it a second time.
 */
export async function settleHere(offer, { reason = "complete", resume = false } = {}) {
  if (!offer?.id || !game.user.isGM) return null;

  let working = {
    ...offer,
    status: "settling",
    players: Array.isArray(offer.players) ? offer.players : [],
    rows: Array.isArray(offer.rows) ? offer.rows : []
  };
  const gave = [];
  const notes = [];

  // The local cache is synchronised, so the cheap check comes first: a settled
  // card already carrying this offer's id means somebody has handed it over.
  let message = game.messages.get(offer.id) ?? null;
  if (message && !resume) return null;

  // THE LOCK (see the note above). The offered card is the token, and the
  // delete is the one write the server refuses to do twice.
  if (!resume) {
    const offered = offeredCard(offer.id);
    // Gone already is the ordinary shape of losing the race - the other tab's
    // delete has propagated - so this is a debug line rather than a warning.
    if (!offered) {
      console.debug(`azeroth-rpg | no offered card to lock on for offer ${offer.id}`);
      return null;
    }
    try {
      await offered.delete();
    } catch (err) {
      console.debug(`azeroth-rpg | another client is already settling offer ${offer.id}`, err);
      return null;
    }
  } else {
    // THE DELIBERATE PATH TIDIES UP; IT DOES NOT LOCK. Finish, Cancel and
    // Resume reach here with `resume`, so nothing above deleted the offered
    // card - and the card left standing carried a live **Open** button beside
    // the settled one, which opened a window on an offer that no longer
    // exists. Removing it here is BEST EFFORT and deliberately not the lock:
    // the guard on `settling` in `endHere` is what stops a second press, the
    // card may have been deleted out of the log by hand, and a failure must
    // never abort a hand-over that is already under way.
    const offered = offeredCard(offer.id);
    if (offered) {
      try {
        await offered.delete();
      } catch (err) {
        console.debug(`azeroth-rpg | the offered card for ${offer.id} could not be removed`, err);
      }
    }
  }

  // Past the lock, and a failure from here is REPORTED rather than swallowed:
  // the caller's own catch says so and the GM's Resume is the way back in.
  if (!message) {
    message = await ChatMessage.create({
      _id: offer.id,
      speaker: cardSpeaker(),
      content: await lootCardHTML({ mode: "settling", offer: working, reason }),
      flags: { "azeroth-rpg": { kind: "lootSettled", offerId: offer.id, reason } }
    }, { keepId: true });
  }
  if (!message) return null;

  // Cancelled hands nothing over: everything offered is left where it is.
  const { byPlayer, left } = reason === "cancelled"
    ? { byPlayer: [], left: (working.rows ?? []).filter(r => r.settled !== true) }
    : distribution(working);

  // Whose world copies stay theirs to drag because their character is gone.
  const stranded = new Map();

  for (const player of byPlayer) {
    const actor = player.actorUuid ? await fromUuid(player.actorUuid) : null;
    const who = player.actorName || player.name;
    if (!actor || actor.documentName !== "Actor") {
      notes.push(game.i18n.format("AZEROTH.LootOffer.Card.NoActor", { name: player.name || who }));
      for (const row of player.rows) stranded.set(row.id, player.userId);
      continue;
    }

    const payloads = [];
    for (const row of player.rows) {
      const doc = (row.uuid ? await fromUuid(row.uuid) : null) ?? game.items.get(row.id) ?? null;
      if (!doc || doc.documentName !== "Item") {
        notes.push(game.i18n.format("AZEROTH.LootOffer.Card.Gone", { name: row.name }));
        continue;
      }
      payloads.push(carriedCopy(doc));
    }

    // **THE BAG DOORS ARE BYPASSED AT THE SETTLE** (D-737). A row already
    // approved may never be dropped: `AzerothItem._preCreateOperation` splices
    // a refused document out of the batch, and the lines below would then mark
    // it `settled` anyway - the player would be told they had it, the offer
    // would close, and the thing would be nowhere. The room was judged at the
    // TAKE, in `noRoomFor`, which is the door that can still say no.
    const made = payloads.length
      ? await actor.createEmbeddedDocuments("Item", payloads, { azerothLootSettle: true, azerothBags: "bypass" })
      : [];
    if (player.copper > 0) {
      await actor.update({ "system.coin": (actor.system?.coin ?? 0) + player.copper });
    }
    gave.push(gaveLine({ name: who, made, copper: player.copper }));

    // ONE setting write a player: what they hold is theirs now, whatever
    // happens to the rest of the settle. A player who took NOTHING has nothing
    // to mark, and a write of the same offer back over itself is a round trip
    // and a re-render on every client for no change at all.
    const mine = new Set(player.rows.map(r => r.id));
    if (player.copper > 0) for (const row of working.rows) if (row.kind === "coin" && row.claimedBy === player.userId) mine.add(row.id);
    if (mine.size) {
      working = { ...working, rows: working.rows.map(r => (mine.has(r.id) ? { ...r, settled: true } : r)) };
      await setLootOffer(working, "claim");
    }
  }

  // `working`, not the argument: its rows and players are known to be arrays
  // whatever a macro handed in, and the claims on it are the same.
  await releaseWorldCopies(working, { stranded, reason });

  await message.update({
    content: await lootCardHTML({ mode: "settled", offer: working, reason, gave, left, notes })
  });
  await setLootOffer(null, reason === "cancelled" ? "cancel" : "settle");
  return message;
}

/**
 * The copy that goes onto the sheet.
 *
 * `loot`, `generated` and the Active Effects are KEPT - the Forge re-forges an
 * item from `generated`, so dropping it would make a find cost twice what it
 * was made for. What goes is everything that was true of the WORLD copy alone:
 * its id, its folder, the ownership the offer stamped, the offer's own mark,
 * and any state of being worn or stowed.
 */
function carriedCopy(doc) {
  const data = doc.toObject();
  delete data._id;
  delete data.folder;
  delete data.ownership;
  delete data.sort;
  const flags = data.flags?.["azeroth-rpg"];
  if (flags) delete flags.offer;
  const system = data.system ?? {};
  if ("equipped" in system) system.equipped = false;
  if ("offHand" in system) system.offHand = false;
  if ("ammunition" in system) system.ammunition = null;
  // Where a thing was kept is the world copy's fact (D-671): a container id
  // from the Items directory names nothing on a character's sheet.
  if ("container" in system) system.container = null;
  return data;
}

/**
 * One player's line on the settled card: what they took, and their share.
 *
 * **The name is ESCAPED and the link labels are not.** The template prints
 * these lines with a triple stash, because they carry `@UUID[...]` marks core
 * enriches; a character called `<Kael>` would otherwise be read as a tag and
 * vanish. A label INSIDE a `@UUID` is safe - the enricher writes it as text
 * into the link it builds - so only what is composed here needs the escape.
 */
function gaveLine({ name, made, copper }) {
  const links = made.map(doc => `@UUID[${doc.uuid}]{${doc.name}}`);
  const who = foundry.utils.escapeHTML(String(name ?? ""));
  const takes = game.i18n.format("AZEROTH.LootOffer.Card.Gave", { name: who });
  if (links.length && copper > 0) {
    return `${takes} ${links.join(", ")} ${game.i18n.format("AZEROTH.LootOffer.Card.Coin", { coins: coins(copper) })}`;
  }
  if (links.length) return `${takes} ${links.join(", ")}`;
  if (copper > 0) return `${takes} ${coins(copper)}`;
  return game.i18n.format("AZEROTH.LootOffer.Card.TookNothing", { name: who });
}

/**
 * Give the world copies back to the GM.
 *
 * ONE write over every offered item: the taken ones are stamped as given, so a
 * find is never offered twice, and every one of them loses the offer's mark
 * and the viewing rights it lent the players.
 *
 * **Only a key reading exactly OBSERVER is taken back.** A player holding the
 * item at any other level held it before the offer existed - the folder door
 * offers things that have been sitting in the world - and a blanket removal
 * would quietly take that away too. `presentLoot` is the other half of the
 * rule: it lends OBSERVER only where the user was BELOW it, so an owner keeps
 * their ownership through the offer and keeps it afterwards.
 *
 * One case is still open and it is the lead's to settle: a player who already
 * held exactly OBSERVER on an offered item loses that key here, because
 * nothing on the item records who the offer lent to. Recording the lent ids on
 * `flags.azeroth-rpg.offer` would close it; it is a stored-shape change and it
 * is not made here.
 */
async function releaseWorldCopies(offer, { stranded = new Map(), reason = "complete" } = {}) {
  const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const players = Array.isArray(offer.players) ? offer.players : [];
  const invited = players.map(p => p.userId);
  const at = Date.now();
  const updates = [];

  for (const row of Array.isArray(offer.rows) ? offer.rows : []) {
    if (row.kind !== "item") continue;
    const item = game.items.get(row.id);
    if (!item) continue;
    const ownership = { ...item.ownership };
    for (const userId of invited) {
      if (ownership[userId] === OBSERVER) delete ownership[userId];
    }
    const strandedWith = stranded.get(row.id) ?? null;
    if (strandedWith) ownership[strandedWith] = OWNER;
    const update = {
      _id: row.id,
      // NEVER `-=offer`: the `-=key` deletion syntax is deprecated in v14 and
      // the smoke test fails on the warning. A null flag is falsy, which is
      // all any reader of it asks.
      "flags.azeroth-rpg.offer": null,
      ownership: foundry.data.operators.ForcedReplacement.create(ownership)
    };
    const player = players.find(p => p.userId === row.claimedBy) ?? null;
    if (reason !== "cancelled" && player && !strandedWith) {
      update["flags.azeroth-rpg.loot.given"] = {
        offerId: offer.id, actorUuid: player.actorUuid, actorName: player.actorName, at
      };
    }
    updates.push(update);
  }
  if (updates.length) await Item.updateDocuments(updates);
  return updates.length;
}

/* -------------------------------------------- */
/*  The card                                     */
/* -------------------------------------------- */

/**
 * WHO THE LOOT CARDS SPEAK AS: the GM, by their own user name.
 *
 * **Never `ChatMessage.getSpeaker()`.** Core's resolver reaches for the
 * CONTROLLED TOKEN first (`client/documents/chat-message.mjs`), so an offer
 * made while a token happened to be selected was announced by that token - the
 * settled card read *Stitches* handing the party their loot, with the
 * creature's portrait beside it. Neither card is anybody's speech: the offer is
 * the tool talking, so it takes the GM's name and no actor, scene or token at
 * all.
 *
 * A bare `{alias}` is a legal speaker. The schema's `scene`, `actor` and
 * `token` are `ForeignDocumentField`s, which default `nullable: true` with an
 * `initial` of `null` (verified in `common/data/fields.mjs` at 14.367), so the
 * three omitted keys clean to null; `ChatMessage#alias` then reads
 * `speaker.alias` before it would have read the actor's name.
 */
function cardSpeaker() {
  return { alias: game.user?.name ?? "" };
}

/** Names as a sentence lists them: "Mira, Tobin and Ana" (core's own formatter). */
function nameList(names) {
  return names.length ? game.i18n.getListFormatter().format(names) : "";
}

/**
 * The card's HTML, in either mode. Separate from the posting because the
 * settled card is UPDATED into the message the settle locked with, rather
 * than posted as a second one.
 */
export async function lootCardHTML({ mode = "offered", offer, reason = "complete", gave = [], left = [], notes = [] } = {}) {
  const offered = mode === "offered";
  const purse = (offer?.rows ?? []).filter(r => r.kind === "coin").reduce((sum, r) => sum + (r.copper ?? 0), 0);
  const count = (offer?.rows ?? []).filter(r => r.kind === "item").length;
  const names = nameList((offer?.players ?? []).map(p => p.name));
  const by = game.users.get(offer?.by)?.name ?? "";
  // A PHRASE, not a count: "{n} finds" read as *1 finds* on every single-item
  // offer, which is most of them. The sentence takes the words already made.
  const finds = count === 1
    ? game.i18n.localize("AZEROTH.LootOffer.Card.OneFind")
    : game.i18n.format("AZEROTH.LootOffer.Card.NFinds", { n: count });

  return renderTemplate(CARD_TEMPLATE, {
    kind: offered ? "lootOffer" : "lootSettled",
    title: game.i18n.localize(offered
      ? "AZEROTH.LootOffer.Card.Offered"
      : (mode === "settling" ? "AZEROTH.LootOffer.Card.Settling" : "AZEROTH.LootOffer.Card.Settled")),
    subtitle: offer?.label || null,
    text: offered
      ? (purse > 0
        ? game.i18n.format("AZEROTH.LootOffer.Card.OfferedText", { by, finds, coins: coins(purse), names })
        : game.i18n.format("AZEROTH.LootOffer.Card.OfferedNoCoin", { by, finds, names }))
      : null,
    reason: offered ? null : game.i18n.localize(REASONS[reason] ?? REASONS.complete),
    lines: offered ? [] : gave,
    leftLabel: game.i18n.localize("AZEROTH.LootOffer.Card.Left"),
    left: offered ? [] : left
      .filter(row => row.kind === "item")
      .map(row => {
        const item = game.items.get(row.id);
        // The link's label is the enricher's to write; the FALLBACK is a raw
        // name going straight into a triple stash, so it is escaped here.
        return item ? `@UUID[${item.uuid}]{${item.name}}` : foundry.utils.escapeHTML(String(row.name ?? ""));
      }),
    notes,
    offerId: offer?.id ?? "",
    // The Open button is the OFFERED card's alone: the settled card is the
    // same message updated in place, and by then there is no window to open.
    open: offered && Boolean(offer?.id),
    // Who may open the window from the card. `dice/chat.mjs` reads this off
    // the block and strips it for anybody else.
    userIds: (offer?.players ?? []).map(p => p.userId).join(",")
  });
}

/**
 * Post the offered card (D11 §5). The settled one is the message this offer's
 * settle locked with, updated in place, so it is never posted from here.
 *
 * A consumer switches on `flags.azeroth-rpg.kind`, so the two cards carry two
 * kinds rather than one with a mode inside it.
 */
export async function postLootCard({ mode = "offered", offer, reason = "complete", gave = [], left = [], notes = [] } = {}) {
  const content = await lootCardHTML({ mode, offer, reason, gave, left, notes });
  return ChatMessage.create({
    speaker: cardSpeaker(),
    content,
    flags: {
      "azeroth-rpg": {
        kind: mode === "offered" ? "lootOffer" : "lootSettled",
        offerId: offer?.id ?? null,
        ...(mode === "offered" ? {} : { reason })
      }
    }
  });
}
