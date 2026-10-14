/**
 * THE LAW OF AN OFFER OF LOOT (D-721). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * The loot generator (D-666) rolls a find, makes the items and stops there:
 * the GM drags each one onto a sheet by hand and the purse is a notification
 * line that lands on nobody. This is the rest of that loop — who was offered
 * what, who took it, who passed, and what each character ends up holding.
 *
 * **Nothing here is the book's.** 08 publishes no rule for dividing a find and
 * D-552 is why there is no loot table either; the split among the invited
 * players and the per-player pass are the TOOL's rulings, the lead's calls of
 * 2026-09-14, and the window says so on its own face exactly as the loot
 * generator's does.
 *
 * Two kinds of row and ONE code path over them. An item row is offered to
 * every invited player; a share of the purse is offered to its own player
 * alone. Every rule below asks `eligible(row, offer)` rather than switching on
 * `kind`, so a rule written for the one cannot quietly miss the other.
 *
 * **The offer is the world's state of record**, held whole in a world setting
 * and written whole on every change (`module/settings.mjs`), which is why
 * `cleanOffer` rebuilds the object rather than cleaning the keys it was
 * handed: §15's present-key rule is about `migrateData` over a PARTIAL update,
 * and there is no partial write of this shape anywhere.
 */

/** What a claim may ask for. Anything else is `badAction`. */
export const CLAIM_ACTIONS = Object.freeze(["take", "release", "pass", "unpass"]);

/**
 * Whether this thing is still SPOKEN FOR by an offer somebody is reading.
 *
 * `presentLoot` stamps `flags.azeroth-rpg.offer = {id, rowId}` on every item
 * it lends out and the settle clears it, so the mark travels on the item's own
 * data — which is what makes `AzerothItem#_preCreate` able to refuse a find
 * dragged out of a player's sidebar while somebody else still holds it in the
 * window (D-721).
 *
 * **IT IS ASKED AT TWO DOORS AND THE TWO MAY NEVER DRIFT.** The document's
 * veto is the rule; the character sheet asks the same question BEFORE it
 * writes anything, because a door that puts away what a newcomer displaces
 * and then has the newcomer refused has taken a ring off for nothing. A
 * second copy of `flags?.["azeroth-rpg"]?.offer?.id` spelled out at the sheet
 * would be that rule written twice, and the wrong half would go quiet first.
 *
 * Reads a live document and `toObject()` data alike: `Document#flags` is the
 * source object.
 *
 * @param {{flags?: object}} data   an Item, or the data one is created from
 */
export function underOffer(data) {
  return Boolean(data?.flags?.["azeroth-rpg"]?.offer?.id);
}

/** The two kinds of row: a thing, and a share of the purse. */
export const ROW_KINDS = Object.freeze(["item", "coin"]);

/* -------------------------------------------- */
/*  Building an offer                            */
/* -------------------------------------------- */

/** An integer or null, never NaN. */
function int(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : null;
}

/** A non-empty string, or null. */
function str(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The purse split among `n` players: `n` whole coppers, the remainder ONE
 * COPPER EACH to the first shares rather than a fraction to everybody.
 *
 * `coinShares(25, 3)` is `[9, 8, 8]`. Nobody is owed a tenth of a copper and
 * the shares still add up to the purse, which is the only property that
 * matters when the coin lands on four different sheets.
 *
 * @param {number} copper
 * @param {number} n
 * @returns {number[]} `[]` for `n <= 0`
 */
export function coinShares(copper, n) {
  const count = Math.trunc(Number(n)) || 0;
  if (count <= 0) return [];
  const total = Math.max(0, Math.trunc(Number(copper)) || 0);
  const base = Math.floor(total / count);
  const over = total - (base * count);
  return Array.from({ length: count }, (_, i) => base + (i < over ? 1 : 0));
}

/**
 * One player of an offer, as the offer stores them.
 * @returns {{userId: string, name: string, actorUuid: string|null, actorName: string}|null}
 */
function playerOf(raw) {
  const userId = str(raw?.userId);
  if (!userId) return null;
  return {
    userId,
    name: typeof raw?.name === "string" ? raw.name : "",
    actorUuid: str(raw?.actorUuid),
    actorName: typeof raw?.actorName === "string" ? raw.actorName : ""
  };
}

/**
 * The offer a presentation makes: the item rows in the order they were given,
 * then one share of the purse per invited player.
 *
 * The id is the CALLER's (`foundry.utils.randomID()` at the door), because it
 * doubles as the settled chat message's `_id` — the lock that stops a GM with
 * two tabs open handing the same loot out twice.
 *
 * @param {object} o
 * @param {string} o.id
 * @param {number} [o.at]
 * @param {string|null} [o.by]
 * @param {string} [o.label]      The caller's words: "Stratholme · tier 3", or a folder's name.
 * @param {object|null} [o.stamp] What made it: the generator's scenario, or `{folder}`.
 * @param {object[]} [o.players]  `{userId, name, actorUuid, actorName}`, deduped by user.
 * @param {object[]} [o.items]    `{id, uuid, name, img, rarity, quantity, price}`.
 * @param {number} [o.copper]     The purse, split at presentation.
 * @returns {object} the offer
 */
export function offerFrom({ id, at = 0, by = null, label = "", stamp = null, players = [], items = [], copper = 0 } = {}) {
  const seen = new Set();
  const invited = [];
  for (const raw of Array.isArray(players) ? players : []) {
    const player = playerOf(raw);
    if (!player || seen.has(player.userId)) continue;
    seen.add(player.userId);
    invited.push(player);
  }

  const rows = [];
  const ids = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const rowId = str(raw?.id);
    // The row's id IS the world Item's id: that is what lets the handler ask
    // whether the thing still exists before anybody claims it.
    if (!rowId || ids.has(rowId)) continue;
    ids.add(rowId);
    rows.push({
      id: rowId,
      kind: "item",
      uuid: str(raw?.uuid),
      name: typeof raw?.name === "string" ? raw.name : "",
      img: str(raw?.img),
      rarity: str(raw?.rarity),
      quantity: int(raw?.quantity),
      price: int(raw?.price),
      claimedBy: null,
      passed: [],
      settled: false
    });
  }

  const purse = Math.max(0, Math.trunc(Number(copper)) || 0);
  if (purse > 0 && invited.length) {
    const shares = coinShares(purse, invited.length);
    invited.forEach((player, i) => {
      rows.push({
        id: `coin-${player.userId}`,
        kind: "coin",
        copper: shares[i],
        forUserId: player.userId,
        // The player's own name; the window and the card put the possessive
        // round it, because words are `lang/en.json`'s and this module is pure.
        name: player.name,
        claimedBy: null,
        passed: [],
        settled: false
      });
    });
  }

  return {
    id: String(id ?? ""),
    at: Math.trunc(Number(at)) || 0,
    by: str(by),
    status: "open",
    label: typeof label === "string" ? label : "",
    stamp: stamp && typeof stamp === "object" && !Array.isArray(stamp) ? { ...stamp } : null,
    players: invited,
    rows
  };
}

/* -------------------------------------------- */
/*  Reading an offer                             */
/* -------------------------------------------- */

/**
 * Who may act on a row: every invited player for a thing, its own player for
 * a share of the purse.
 *
 * @returns {string[]} user ids
 */
export function eligible(row, offer) {
  const invited = (offer?.players ?? []).map(p => p.userId);
  if (row?.kind === "coin") {
    const mine = str(row.forUserId);
    return mine && invited.includes(mine) ? [mine] : [];
  }
  return invited;
}

/**
 * What a row reads as to one viewer, as a word the window turns into a
 * sentence: `open`, `mine`, `taken`, `passed`, `gone`.
 *
 * **`gone` is a mark on the row, not a lookup**, because this module is pure:
 * the window spreads `gone: !game.items.has(row.id)` onto its copy of the row
 * before it draws it, and the handler refuses a claim on one. A thing that no
 * longer exists reads as gone whoever held it — the settle has nothing to
 * hand over either way.
 */
export function rowState(row, userId) {
  if (!row) return "gone";
  if (row.gone === true) return "gone";
  if (row.claimedBy && row.claimedBy === userId) return "mine";
  if (row.claimedBy) return "taken";
  if (Array.isArray(row.passed) && row.passed.includes(userId)) return "passed";
  return "open";
}

/** The row of an offer by id, or null. */
export function rowOf(offer, rowId) {
  if (!Array.isArray(offer?.rows)) return null;
  return offer.rows.find(r => r.id === rowId) ?? null;
}

/**
 * Whether a row needs nothing further: taken, already handed over, or passed
 * on by everybody who could have taken it.
 *
 * **An empty eligible list never resolves.** `[].every()` is `true`, so a row
 * nobody may act on would otherwise complete the offer the moment it opened
 * and hand out nothing; the GM's Finish is the way out of that instead.
 */
export function isResolved(row, offer) {
  if (!row) return true;
  if (row.settled === true) return true;
  if (row.claimedBy) return true;
  const may = eligible(row, offer);
  if (!may.length) return false;
  const passed = Array.isArray(row.passed) ? row.passed : [];
  return may.every(userId => passed.includes(userId));
}

/** Whether every row of the offer is resolved. An offer with no rows never is. */
export function isComplete(offer) {
  const rows = offer?.rows ?? [];
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.every(row => isResolved(row, offer));
}

/** `{resolved, total}` for the window's progress line. */
export function progress(offer) {
  const rows = Array.isArray(offer?.rows) ? offer.rows : [];
  return { resolved: rows.filter(row => isResolved(row, offer)).length, total: rows.length };
}

/* -------------------------------------------- */
/*  Claiming                                     */
/* -------------------------------------------- */

/** A row with one key replaced, leaving the original untouched. */
function withRow(offer, rowId, changes) {
  const players = Array.isArray(offer.players) ? offer.players : [];
  const rows = Array.isArray(offer.rows) ? offer.rows : [];
  return {
    ...offer,
    players: players.map(p => ({ ...p })),
    rows: rows.map(row => {
      const next = row.id === rowId ? { ...row, ...changes } : { ...row };
      // **THE PASS LIST IS COPIED TOO.** `{...row}` is shallow, so every row a
      // claim did not touch - and a touched one whose change does not name
      // `passed`, which is every release - handed the CALLER'S OWN array back
      // inside the new offer, and *every export returns a new object* was true
      // of the offer and false of the one field a claim writes most.
      next.passed = [...(next.passed ?? [])];
      return next;
    })
  };
}

/** The offer copied whole, for a claim that changes nothing: no row id matches. */
function copyOf(offer) {
  return withRow(offer, null, {});
}

/**
 * One claim, judged: `{ok: true, offer, noop?}` or `{ok: false, code}`.
 *
 * **A REPEAT OF THE USER'S OWN STATE IS `noop`, NEVER A REFUSAL.** A query is
 * emitted to every socket of the target user, so a GM with two tabs open runs
 * the handler twice on one press (verified at 14.367); the second run must not
 * come back as *somebody already took it* naming the claimant themselves.
 *
 * @param {object|null} offer
 * @param {{rowId: string, userId: string, action: string}} what
 * @returns {{ok: boolean, code?: string, offer?: object, noop?: boolean}}
 */
export function claim(offer, { rowId, userId, action } = {}) {
  if (!offer || typeof offer !== "object" || offer.status !== "open") return { ok: false, code: "closed" };
  if (!Array.isArray(offer.players) || !offer.players.some(p => p.userId === userId)) {
    return { ok: false, code: "notInvited" };
  }
  const row = rowOf(offer, rowId);
  if (!row) return { ok: false, code: "noRow" };
  if (!eligible(row, offer).includes(userId)) return { ok: false, code: "notEligible" };
  if (!CLAIM_ACTIONS.includes(action)) return { ok: false, code: "badAction" };

  const passed = Array.isArray(row.passed) ? row.passed : [];
  const without = passed.filter(id => id !== userId);

  switch (action) {
    case "take": {
      if (row.claimedBy === userId) return { ok: true, offer: copyOf(offer), noop: true };
      if (row.claimedBy) return { ok: false, code: "taken" };
      // Taking after passing is reconsidering: the pass goes with it.
      return { ok: true, offer: withRow(offer, rowId, { claimedBy: userId, passed: without }) };
    }
    case "release": {
      if (!row.claimedBy) return { ok: true, offer: copyOf(offer), noop: true };
      if (row.claimedBy !== userId) return { ok: false, code: "notYours" };
      return { ok: true, offer: withRow(offer, rowId, { claimedBy: null }) };
    }
    case "pass": {
      if (row.claimedBy && row.claimedBy !== userId) return { ok: false, code: "taken" };
      if (!row.claimedBy && passed.includes(userId)) return { ok: true, offer: copyOf(offer), noop: true };
      // Passing on what you were holding puts it back and passes in one press.
      return { ok: true, offer: withRow(offer, rowId, { claimedBy: null, passed: [...without, userId] }) };
    }
    case "unpass": {
      if (!passed.includes(userId)) return { ok: true, offer: copyOf(offer), noop: true };
      return { ok: true, offer: withRow(offer, rowId, { passed: without }) };
    }
    default:
      return { ok: false, code: "badAction" };
  }
}

/* -------------------------------------------- */
/*  Settling                                     */
/* -------------------------------------------- */

/**
 * The ITEM rows one user is holding and has not been handed over yet.
 *
 * **A take is judged for room before the settle** (08 §11, D-737), and a
 * player who has already taken three things has to be judged against all four
 * at once: the settle embeds them in ONE batch, and a check that looked at a
 * single row would let somebody fill their bags four times over and then lose
 * the overflow at the hand-over, silently.
 *
 * A row already `settled` is theirs and is on their sheet; a coin row takes no
 * bag slot at all.
 *
 * @returns {object[]} rows, in the offer's own order
 */
export function pendingTakes(offer, userId) {
  const rows = Array.isArray(offer?.rows) ? offer.rows : [];
  return rows.filter(row => row.kind === "item" && row.settled !== true && row.claimedBy === userId);
}

/**
 * What each player takes away, and what nobody did.
 *
 * In `players` order, so two clients settling from the same offer compose the
 * same card. **A row already `settled` is skipped**: the settle marks a
 * player's rows as it goes, so a world restarted half way through resumes past
 * what was already handed over rather than handing it over twice.
 *
 * @returns {{byPlayer: object[], left: object[]}}
 */
export function distribution(offer) {
  const players = Array.isArray(offer?.players) ? offer.players : [];
  const rows = (Array.isArray(offer?.rows) ? offer.rows : []).filter(row => row.settled !== true);
  const held = new Set(players.map(p => p.userId));
  const byPlayer = players.map(player => {
    const mine = rows.filter(row => row.claimedBy === player.userId);
    return {
      userId: player.userId,
      actorUuid: player.actorUuid ?? null,
      actorName: player.actorName ?? "",
      name: player.name ?? "",
      rows: mine.filter(row => row.kind === "item").map(row => ({ ...row })),
      copper: mine.filter(row => row.kind === "coin").reduce((sum, row) => sum + (Math.trunc(Number(row.copper)) || 0), 0)
    };
  });
  // Nobody's: unclaimed, or claimed by somebody no longer invited.
  const left = rows.filter(row => !row.claimedBy || !held.has(row.claimedBy)).map(row => ({ ...row }));
  return { byPlayer, left };
}

/* -------------------------------------------- */
/*  Reading what a world stored                  */
/* -------------------------------------------- */

/** One stored row, rebuilt, or null where it is past reading. */
function cleanRow(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = str(raw.id);
  const kind = ROW_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !kind) return null;
  const passed = Array.isArray(raw.passed) ? [...new Set(raw.passed.filter(u => str(u)))] : [];
  const common = {
    id,
    kind,
    claimedBy: str(raw.claimedBy),
    passed,
    settled: raw.settled === true,
    name: typeof raw.name === "string" ? raw.name : ""
  };
  if (kind === "coin") {
    const forUserId = str(raw.forUserId);
    if (!forUserId) return null;
    return { ...common, copper: Math.max(0, Math.trunc(Number(raw.copper)) || 0), forUserId };
  }
  return {
    ...common,
    uuid: str(raw.uuid),
    img: str(raw.img),
    rarity: str(raw.rarity),
    quantity: int(raw.quantity),
    price: int(raw.price)
  };
}

/**
 * The offer a world is holding, whatever shape it happens to be in.
 *
 * A setting has no `migrateData` and no document validation behind it, so this
 * is the only guard there is: an offer written by an older version, by a hand
 * edit, or by a macro is read through here or not at all. **It rebuilds rather
 * than patching**, which is safe precisely because the setting is always
 * written whole — CLAUDE.md §15's present-key rule is about a partial update,
 * and this shape has no partial write anywhere.
 *
 * @returns {object|null} null where there is no offer to read
 */
export function cleanOffer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!str(raw.id)) return null;
  if (!Array.isArray(raw.players) || !Array.isArray(raw.rows)) return null;

  const seen = new Set();
  const players = [];
  for (const entry of raw.players) {
    const player = playerOf(entry);
    if (!player || seen.has(player.userId)) continue;
    seen.add(player.userId);
    players.push(player);
  }

  const ids = new Set();
  const rows = [];
  for (const entry of raw.rows) {
    const row = cleanRow(entry);
    if (!row || ids.has(row.id)) continue;
    ids.add(row.id);
    rows.push(row);
  }

  return {
    id: raw.id,
    at: Math.trunc(Number(raw.at)) || 0,
    by: str(raw.by),
    status: raw.status === "settling" ? "settling" : "open",
    label: typeof raw.label === "string" ? raw.label : "",
    stamp: raw.stamp && typeof raw.stamp === "object" && !Array.isArray(raw.stamp) ? { ...raw.stamp } : null,
    players,
    rows
  };
}
