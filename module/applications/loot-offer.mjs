/**
 * THE SHARED WINDOW AN OFFER OF LOOT IS READ AND CLAIMED IN (D-721).
 *
 * `rules/loot-offer.mjs` is the law, `documents/loot-offer.mjs` is the write,
 * and this is the one surface: the GM and every invited player look at the
 * SAME offer, out of the same world setting, so a find one player takes greys
 * on everybody else's screen a moment later.
 *
 * Three things about it are deliberate and easy to get wrong:
 *
 * - **The window keeps no copy of the offer.** `_prepareContext` reads
 *   `lootOffer()` fresh on every render, because the setting is the state of
 *   record and a cached row is a row that disagrees with the table. The only
 *   thing it holds between renders is which row a claim is travelling for and
 *   what the last refusal said.
 * - **`_canRender` RETURNS FALSE; it never throws.** A throw is caught by
 *   `ApplicationV2#render` and shown as a warning toast (`application.mjs`,
 *   verified at 14.367), so a player who is not invited would be toasted on
 *   every claim anybody else made. Refusing quietly is the whole of it.
 * - **`force` is for a presentation and nothing else.** `force: true`
 *   un-minimises the window and brings it to the front (`application.mjs:601`),
 *   which is right when a find is first offered and wrong every other time: a
 *   player reading their sheet should not have a window thrown over it because
 *   somebody else pressed Take.
 *
 * Colour is never the carrier (CLAUDE.md §12): every row says its state in
 * words - Open, Yours, Taken by Mira, You passed - and a greyed control has
 * the reason printed beside it.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { cancelOffer, characterFor, claimLoot, finishOffer, lootGM, settleOffer } from "../documents/loot-offer.mjs";
import { eligible, progress, rowState } from "../rules/loot-offer.mjs";
import { lootOffer } from "../settings.mjs";
import { chooseOption } from "../dice/workflows.mjs";
import { coins } from "../helpers/coins.mjs";
import { rarityClass } from "../helpers/rarity.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/loot-offer.hbs";

/** The window's id, so there is one of it however many doors open it. */
const WINDOW_ID = "azeroth-loot-offer";

/**
 * What a row reads as, in words, keyed by what `rowState` returns.
 *
 * A LITERAL MAP with every key written out whole, never a key built by
 * joining a branch to the state: a built key leaves only the branch behind in
 * the source, and `lang-unused.test.mjs` takes a branch as proof of use for
 * every string beneath it, so a state that was retired would keep its string
 * in `lang/en.json` for ever with nothing able to say so.
 *
 * The branch is not quoted in this comment either. The audit greps comments
 * as readily as code, so a sentence spelling the bad form out is itself an
 * occurrence of it - the fault rather than a description of it.
 *
 * What none of that buys is teeth. The audit's rule is a SUBSTRING test, so
 * any one key below satisfies the branch for all of its siblings whatever the
 * comments say. Writing them out whole is what makes a retired one findable
 * by hand, and by hand is the only way it will be found.
 */
const STATES = Object.freeze({
  open: "AZEROTH.LootOffer.State.Open",
  mine: "AZEROTH.LootOffer.State.Mine",
  taken: "AZEROTH.LootOffer.State.Taken",
  passed: "AZEROTH.LootOffer.State.Passed",
  gone: "AZEROTH.LootOffer.State.Gone"
});

export class AzerothLootOffer extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: WINDOW_ID,
    // A DIV, not a form: nothing here is submitted. Every control is a button
    // and every button goes through the actions map (CLAUDE.md §5).
    tag: "div",
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-generator", "azeroth-loot-offer"],
    window: { title: "AZEROTH.LootOffer.Title", resizable: true },
    position: { width: 560, height: 620 },
    actions: {
      lootOfferView: AzerothLootOffer.#onView,
      lootOfferTake: AzerothLootOffer.#onTake,
      lootOfferRelease: AzerothLootOffer.#onRelease,
      lootOfferPass: AzerothLootOffer.#onPass,
      lootOfferUnpass: AzerothLootOffer.#onUnpass,
      lootOfferFinish: AzerothLootOffer.#onFinish,
      lootOfferCancel: AzerothLootOffer.#onCancel,
      lootOfferResume: AzerothLootOffer.#onResume
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-generator-pane"] } };

  /** The row a claim is travelling for, so its controls grey until it lands. */
  #pending = null;

  /** What the handler refused, by row, printed beside the control it refused. */
  #refusals = new Map();

  /** The offer last drawn: a new one clears what the old one was saying. */
  #offerId = null;

  /* -------------------------------------------- */
  /*  Who may look at it                           */
  /* -------------------------------------------- */

  /**
   * @inheritDoc
   *
   * FALSE, NEVER A THROW. `#render` catches a throw and warns
   * (`application.mjs:523-528`), which would toast an uninvited player on
   * every re-render the offer caused - and a claim causes one on every client.
   */
  _canRender(options) {
    if (game.user.isGM) return undefined;
    const offer = lootOffer();
    if (!offer) return false;
    if (!offer.players.some(p => p.userId === game.user.id)) return false;
    return undefined;
  }

  /* -------------------------------------------- */
  /*  Drawing                                      */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const offer = lootOffer();
    const isGM = game.user.isGM;

    // A window standing open when the offer ends: the hook closes it, but a
    // render can still reach here first, and an empty frame reads as a fault.
    if (!offer) {
      this.#offerId = null;
      this.#pending = null;
      this.#refusals.clear();
      return Object.assign(context, { isGM, empty: game.i18n.localize("AZEROTH.LootOffer.Empty"), rows: [] });
    }

    // A FRESH OFFER SAYS NOTHING THE LAST ONE SAID. A refusal printed beside a
    // row of an offer that has been settled is a sentence about a thing that
    // no longer exists.
    if (this.#offerId !== offer.id) {
      this.#offerId = offer.id;
      this.#pending = null;
      this.#refusals.clear();
    }

    const userId = game.user.id;
    const invited = offer.players.some(p => p.userId === userId);
    const settling = offer.status === "settling";
    const { resolved, total } = progress(offer);

    return Object.assign(context, {
      isGM,
      empty: null,
      label: offer.label || null,
      invited: offer.players.length
        ? game.i18n.format("AZEROTH.LootOffer.Invited", { names: nameList(offer.players.map(p => p.name)) })
        : null,
      progress: game.i18n.format("AZEROTH.LootOffer.Progress", { resolved, total }),
      // Every control is off while the loot is being handed over: the offer is
      // no longer anybody's to change, and the banner says so rather than
      // leaving a dead button to be pressed.
      settling: settling ? game.i18n.localize("AZEROTH.LootOffer.Settling") : null,
      // Re-evaluated on every render, and `userConnected` forces one: the GM
      // whose client runs the offer can close their browser mid-offer.
      noGM: lootGM() ? null : game.i18n.localize("AZEROTH.LootOffer.NoGM"),
      // A GM watching an offer they were not invited to has no row to take,
      // and the words are what say why (never the absence of a button).
      notInvited: invited ? null : game.i18n.localize("AZEROTH.LootOffer.NotInvited"),
      rows: offer.rows.map(row => this.#rowContext(row, offer, { userId, settling })),
      // Settling disables every control: the offer is no longer anybody's to
      // change, and Resume is the one thing left to press.
      canFinish: isGM && !settling,
      canCancel: isGM && !settling,
      canResume: isGM && settling
    });
  }

  /**
   * One row as the template draws it.
   *
   * **Everything the row needs is spread ONTO the row** (CLAUDE.md §15): a
   * bare name inside `{{#each}}` resolves against the row and not the root, so
   * `mine` or `pending` read off the context would be undefined on every line
   * of the list and every control would draw as though it were the reader's.
   */
  #rowContext(row, offer, { userId, settling }) {
    const coin = row.kind === "coin";
    // `gone` is a mark the law reads off the row (`rules/loot-offer.mjs`), not
    // something it can look up: this module is where the world is.
    const gone = !coin && !game.items.has(row.id);
    const state = rowState({ ...row, gone }, userId);
    const may = eligible(row, offer).includes(userId);
    const passed = Array.isArray(row.passed) && row.passed.includes(userId);
    const pending = this.#pending === row.id;
    // A claim in flight DISABLES the row's controls rather than removing
    // them: a row whose buttons vanish and come back has moved under the
    // reader's cursor, and the next row's Take is where this one's was.
    const open = offer.status === "open" && !settling;
    const claimant = row.claimedBy
      ? (offer.players.find(p => p.userId === row.claimedBy)?.name ?? game.users.get(row.claimedBy)?.name ?? "")
      : "";

    // A share is its own player's alone, and a row nobody may act on says so
    // in words beside the greying (CLAUDE.md §12, D5 §8).
    const note = coin && !may
      ? game.i18n.format("AZEROTH.LootOffer.Refuse.NotEligible", { name: row.name })
      : null;

    return {
      id: row.id,
      mine: may,
      pending,
      isCoin: coin,
      name: coin ? game.i18n.format("AZEROTH.LootOffer.Share", { name: row.name }) : row.name,
      uuid: row.uuid ?? null,
      img: row.img ?? null,
      rarityClass: coin ? "" : rarityClass(row.rarity),
      quantity: !coin && row.quantity && row.quantity > 1
        ? game.i18n.format("AZEROTH.LootOffer.Quantity", { n: row.quantity })
        : null,
      price: coin ? coins(row.copper) : coins(row.price),
      viewLabel: game.i18n.format("AZEROTH.LootOffer.View", { name: row.name }),
      state: game.i18n.format(STATES[state] ?? STATES.open, { name: claimant }),
      note,
      refusal: this.#refusals.get(row.id) ?? null,
      // What the state and the viewer allow. Taking a thing you passed on is
      // reconsidering and the law folds the pass in with it, so a passed row
      // offers both.
      //
      // **View alone ignores `open`**, on purpose: reading a find is not a
      // claim on it, so the name stays live through the hand-over and on a
      // row somebody else took. Every other control is off while `settling`.
      canView: !coin && Boolean(row.uuid),
      canTake: open && may && !gone && !row.claimedBy,
      canRelease: open && may && row.claimedBy === userId,
      // `passed`, never `state === "passed"`: a find that no longer exists
      // reads as *gone* whatever the reader did with it, so keying the pass
      // on the state would offer Pass a second time on a row already passed.
      //
      // **A ROW ANOTHER PLAYER IS HOLDING OFFERS WORDS AND NOTHING ELSE.**
      // `claim` refuses a pass on a row somebody else took (code `taken`,
      // `rules/loot-offer.mjs`), so drawing Pass beside *Taken by Mira* put
      // up a control whose only possible outcome was *Mira already took it*;
      // Reconsider was the same fault one step along, on a row the reader had
      // passed and another player has since claimed. The matrix this draws:
      // open - Take, Pass; yours - Put back, Pass; taken by another - words
      // only; passed and still unclaimed - Take, Reconsider; gone - Pass, or
      // Reconsider where the reader had already passed on it. A gone row is
      // still passable on purpose (the handler refuses only a TAKE on one, or
      // the row could never resolve and Finish would be the only way out).
      canPass: open && may && !passed && (!row.claimedBy || row.claimedBy === userId),
      canUnpass: open && may && passed && !row.claimedBy
    };
  }

  /* -------------------------------------------- */
  /*  Acting                                       */
  /* -------------------------------------------- */

  /** Open the thing itself. The GM stamped OBSERVER on it at presentation. */
  static async #onView(event, target) {
    const uuid = target?.dataset?.uuid ?? null;
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc) {
      // `localize`, not `format`: the key carries no placeholder, and a
      // formatted call with a made-up `name` is a reader's invitation to add
      // one to the string that nothing would ever fill.
      ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.Refuse.Gone"));
      return null;
    }
    return doc.sheet?.render({ force: true });
  }

  static async #onTake(event, target) { return this.#claimRow(target, "take"); }

  static async #onRelease(event, target) { return this.#claimRow(target, "release"); }

  static async #onPass(event, target) { return this.#claimRow(target, "pass"); }

  static async #onUnpass(event, target) { return this.#claimRow(target, "unpass"); }

  /**
   * Take, put back, pass or reconsider.
   *
   * The row greys while the claim travels, because the answer comes from
   * another client and a button that looks live for half a second is a button
   * somebody presses twice. The refusal is printed BESIDE the row rather than
   * only toasted: a toast is gone before the reader has found the row it was
   * about.
   */
  async #claimRow(target, action) {
    const rowId = target?.closest?.("[data-row-id]")?.dataset?.rowId ?? null;
    if (!rowId) return null;
    this.#pending = rowId;
    this.#refusals.delete(rowId);
    await this.render();
    const verdict = await claimLoot({ rowId, action });
    this.#pending = null;
    if (verdict?.ok === false && verdict.reason) this.#refusals.set(rowId, verdict.reason);
    return this.render();
  }

  /**
   * Forget every refusal printed on the list.
   *
   * **A REFUSAL OUTLIVES THE STATE THAT CAUSED IT.** *Mira already took it*
   * is a true sentence for exactly as long as Mira is holding the find; the
   * moment she puts it back the row reads Open, draws Take, and went on
   * saying it. The hook calls this on every claim write, which is the whole
   * of the repair: the refusals are cheap to lose and dangerous to keep, and
   * a reader who presses again gets the current answer.
   *
   * It is deliberately blunt - every row, not the one that moved - because
   * the alternative is remembering each row's `claimedBy` and `passed` as
   * last drawn, which is a second copy of the offer inside a window whose
   * first rule is that it keeps none. The cost is a refusal set in the same
   * instant somebody else claims, which is cleared before it is read.
   *
   * `#pending` is NOT cleared here: another client's claim says nothing about
   * whether this reader's own is still travelling, and un-greying a row mid
   * flight is the double press the greying exists to stop.
   */
  forgetRefusals() {
    this.#refusals.clear();
  }

  /** The GM's two ways out: hand over what was taken, or withdraw the lot. */
  static async #onFinish() { return finishOffer(); }

  static async #onCancel() { return cancelOffer(); }

  /**
   * Take over a settle that began and did not end - a browser closed half way
   * through, a world restarted. `settleOffer` is the door for a caller outside
   * the chain and resumes past the rows already handed over.
   *
   * **THE REASON IS READ BACK OFF THE LOCK, NEVER ASSUMED.** The settle's
   * first write is a message carrying the offer's id and the reason it was
   * settled for (`documents/loot-offer.mjs`), and *cancelled* is the one
   * reason that hands over NOTHING. A Resume that named `finished` on a
   * cancelled settle that died after its message was made would take the
   * distribution branch and give away everything the GM had just withdrawn.
   */
  static async #onResume() {
    const offer = lootOffer();
    if (!offer) return null;
    const reason = game.messages.get(offer.id)?.flags?.["azeroth-rpg"]?.reason ?? "finished";
    return settleOffer(offer, { reason, resume: true });
  }
}

/* -------------------------------------------- */
/*  The one window                               */
/* -------------------------------------------- */

/** The window itself, so a second door raises it rather than opening another. */
let win = null;

/** Every offer this client has already opened a window for, by id. */
const opened = new Set();

function windowFor() {
  win ??= new AzerothLootOffer();
  return win;
}

/** Names as a sentence lists them, through core's own formatter. */
function nameList(names) {
  return names.length ? game.i18n.getListFormatter().format(names) : "";
}

/** Whether this client has any business looking at the offer at all. */
function mayWatch(offer) {
  if (game.user.isGM) return true;
  return Boolean(offer?.players?.some(p => p.userId === game.user.id));
}

/**
 * Open the offer's window, or say why there is nothing to open.
 *
 * The card's button (`dice/chat.mjs`) is the caller, and a card outlives the
 * offer it announced: pressing Open on last week's card has to say *that offer
 * has been settled* rather than raising an empty frame.
 *
 * @param {string|null} [offerId]  The offer the card was posted for.
 */
export function openLootOffer(offerId = null) {
  const offer = lootOffer();
  if (!offer || (offerId && offer.id !== offerId)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.Closed"));
    return null;
  }
  if (!mayWatch(offer)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.NotInvited"));
    return null;
  }
  opened.add(offer.id);
  return windowFor().render({ force: true });
}

/**
 * What every client does when the offer moves.
 *
 * The setting's `onChange` fires on EVERY client for a create and an update
 * alike and carries the write's own tag (`module/settings.mjs`), which is the
 * whole synchronisation story - no socket, and no query in this direction.
 *
 * - `null` closes the window and forgets the offer.
 * - A `present` write RAISES the window, once per offer id: a find arriving is
 *   worth interrupting for, and a second presentation of the same offer (a
 *   settle marking rows, a reconnect) is not.
 * - Anything else re-renders what is already open, unforced, so a claim never
 *   throws the window over what somebody was reading.
 *
 * **NEVER GUARDED ON `rendered`, AND THAT IS THE LOAD-BEARING PART.**
 * `rendered` is `state === RENDERED` and the state is RENDERING for the whole
 * of `_replaceHTML` (`application.mjs:552`, 14.367), so a guarded update that
 * arrived while a render was in flight was simply dropped. The settle emits
 * one write per player back to back and then `null`, which is exactly that
 * shape: the `null` was skipped and the window stayed up reading *Nothing is
 * on offer*. Unguarded is safe in both directions - a forceless render on a
 * window that has never been opened or has been closed returns at
 * `application.mjs:521` (`isFirstRender` is `state <= NONE`, and CLOSED is
 * below it), and `close()` on one with no element returns at `:998` - and both
 * queue on the application's own semaphore, so neither can interleave.
 */
function onOfferChanged(offer, options = {}) {
  if (!offer) {
    opened.clear();
    win?.close();
    return;
  }
  // A viewer with no business here is not merely left alone: if they have the
  // window open from an offer they WERE part of, it has to go, or a stale
  // list of somebody else's finds stands on their screen for the rest of the
  // session (`_canRender` refuses to redraw it, which is what preserves it).
  if (!mayWatch(offer)) {
    win?.close();
    return;
  }
  // A claim moves the state every printed refusal was about. See
  // `forgetRefusals` for why this is every row rather than the one that moved.
  if (options?.azerothLoot === "claim") win?.forgetRefusals();
  if (options?.azerothLoot === "present" && !opened.has(offer.id)) {
    opened.add(offer.id);
    return windowFor().render({ force: true });
  }
  win?.render();
  return undefined;
}

/**
 * Register the window's listeners (called from `azeroth.mjs` at init).
 *
 * The `ready` opener is SEPARATE from the entry point's own ready hook, as the
 * world map's is (`world-map-button.mjs:74-78`): it is about this window and
 * belongs beside it, and a throw in it must not take the migration chain down.
 */
export function registerLootOfferHooks() {
  Hooks.on("azerothLootOffer", (offer, options) => onOfferChanged(offer, options));

  // THE OFFER OUTLIVES A REFRESH. A player who joins - or reloads - while a
  // find is on offer would otherwise see the card and nothing else, and a GM
  // whose client died mid-settle needs the Resume button to be somewhere.
  Hooks.once("ready", () => {
    const offer = lootOffer();
    if (!offer) return;
    const invited = offer.players.some(p => p.userId === game.user.id);
    if (!invited && !(game.user.isGM && offer.status === "settling")) return;
    opened.add(offer.id);
    windowFor().render({ force: true });
  });

  // The GM whose client runs the offer can leave: the line that says so is
  // derived, so somebody has to ask for the render (D-681 - a derived value
  // with no consumer that re-reads it is a value nobody ever sees change).
  // Unguarded, as `onOfferChanged` is and for the same reason: a forceless
  // render is a no-op on a window that is closed and is NOT one on a window
  // that is half way through drawing.
  Hooks.on("userConnected", () => { win?.render(); });
}

/* -------------------------------------------- */
/*  The picker both doors open                   */
/* -------------------------------------------- */

/**
 * Who is offered the find: a checklist over the table's players, the system's
 * ONE chooser (D-673, D-710) with D-721's `checked` and Select all.
 *
 * **Shared by both doors on purpose.** The generator and an Item folder's
 * right click ask the same question, and a second copy of it is a second place
 * for the greying to rot. A player with nowhere to put a find is listed,
 * greyed, and told why - `characterFor` is the one resolver and the settle
 * hands over through it, so what the picker names is what receives the loot.
 *
 * @param {object} [options]
 * @param {string} [options.title]  What the window is picking for.
 * @returns {Promise<string[]|null>} user ids, or null where nothing was picked
 */
export async function pickLootPlayers({ title = null } = {}) {
  const players = game.users?.players ?? [];
  if (!players.length) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.NoPlayers"));
    return null;
  }
  const options = players.map(user => {
    const { actor, reason } = characterFor(user);
    return {
      key: user.id,
      name: user.name,
      description: actor
        ? game.i18n.format("AZEROTH.LootOffer.Playing", { name: actor.name })
        : game.i18n.localize(reason ?? "AZEROTH.LootOffer.NoCharacter"),
      // Not connected is a note, never a refusal: a find offered to somebody
      // who is offline is waiting for them when they log in.
      tag: user.active ? null : game.i18n.localize("AZEROTH.LootOffer.Offline"),
      available: Boolean(actor),
      checked: Boolean(actor) && user.active === true
    };
  });

  const picked = await chooseOption(
    { id: "loot-present", name: title ?? game.i18n.localize("AZEROTH.LootOffer.PickPlayers") },
    options,
    game.i18n.localize("AZEROTH.LootOffer.PickNote"),
    {
      label: "AZEROTH.LootOffer.PresentFolder",
      prompt: game.i18n.localize("AZEROTH.LootOffer.PickPrompt"),
      // A CHECKLIST EVEN AT ONE PLAYER. `chooseOption` falls back to a single
      // select at `max: 1`, which cannot answer *nobody* and draws no Select
      // all row - so a table of one would meet a different window from a table
      // of four. The ceiling is never reached either way: there are only ever
      // `options.length` rows to tick.
      max: Math.max(2, options.length),
      selectAll: true
    }
  );
  const chosen = (Array.isArray(picked) ? picked : (picked ? [picked] : []))
    .map(o => o.key)
    .filter(Boolean);
  return chosen.length ? chosen : null;
}
