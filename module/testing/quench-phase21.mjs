/**
 * THE OFFER OF LOOT (D-721), driven in a live world.
 *
 * `rules/loot-offer.mjs` has its own Vitest and knows the law; nothing there
 * can see the three things this batch exists for:
 *
 * - **The claim is a query.** A player writes neither a world setting nor a
 *   GM's chat message, so every press travels through
 *   `CONFIG.queries[CLAIM_LOOT_QUERY]` to the designated GM's client. A wrapper
 *   counts the calls, and one real `User#query` round trip proves the handler
 *   is registered and that the payload and the answer both survive JSON.
 * - **The settle's lock is the DELETION of the offered card.** So the offered
 *   card being GONE and the settled one carrying the offer's own id is the
 *   assertion that says the lock was taken - not a flag, and not a count.
 * - **The window keeps no copy of the offer.** It redraws from the setting's
 *   `onChange` hook, so a claim written straight into the setting has to move
 *   the words in the row.
 *
 * Two fixture facts that are easy to get wrong and cost a run each:
 * `characterFor` refuses a GM who is not ASSIGNED a character (a GM owns every
 * actor, so the fallback searches would answer with somebody else's), which is
 * why `before` assigns one and `after` puts it back; and a claim by a player is
 * made by handing the handler `{user: player}` rather than by pretending to be
 * them, because Quench runs as the one GM in the world.
 */

import { cleanup, made, makeCharacter, settle } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { LOOT_OFFER_SETTING, lootOffer, setLootOffer } from "../settings.mjs";
import {
  CLAIM_LOOT_QUERY, cancelOffer, claimLootQueryHandler, finishOffer, presentLoot
} from "../documents/loot-offer.mjs";
import { openLootOffer } from "../applications/loot-offer.mjs";
import { offerableIn } from "../applications/loot-offer-folder.mjs";

const change = el => el.dispatchEvent(new Event("change", { bubbles: true }));

/** A draw that walks a fixed sequence, so a find is the same every run. */
function stepping(values = [0.5]) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** The loot generator with its draw pinned, as phase 13 builds it. */
const generatorOf = (values = [0.5, 0.2, 0.8, 0.35, 0.65, 0.05, 0.95, 0.45]) =>
  new (game.system.azeroth.loot)({ random: stepping(values) });

/** The one window, by the id it is registered under. */
const win = () => foundry.applications.instances.get("azeroth-loot-offer") ?? null;

/**
 * The OFFERED card for an offer, by its flag.
 *
 * Its own `_id` is the server's; the offer's id belongs to the SETTLED card.
 * Every assertion below that this card is gone is really an assertion about a
 * live **Open** button: the card is the only place one is drawn.
 */
const offeredCard = offerId => game.messages.find(m => {
  const flags = m.flags?.["azeroth-rpg"];
  return flags?.kind === "lootOffer" && flags.offerId === offerId;
}) ?? null;

/**
 * Poll until `fn` answers with something truthy, or fail naming what was
 * waited for. Every wait below is on EXACTLY the thing the next line asserts
 * (CLAUDE.md §15: an `until` that waits on one field and asserts another is a
 * race).
 */
async function until(fn, what, ms = 30000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** Every item the tool made, so the batch can take them back out. */
function keep(result) {
  for (const item of result.items ?? []) made.push(item);
  return result;
}

export function lootOfferBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The loot offer (D-721)", function () {
    /** @type {User} */ let player;
    /** @type {User} */ let stranger;
    /** @type {Actor} */ let looter;
    /** @type {Actor} */ let gmActor;
    let savedOffer = null;
    let savedCharacter = null;

    /** Fresh finds in the Generated Items folder, registered for teardown. */
    async function finds(count = 2) {
      const result = keep(await generatorOf().apply({
        scenario: "dungeon", tier: 2, table: { count: [count, count] }
      }));
      assert.isTrue(result.ok, `the generator refused: ${JSON.stringify(result.reasons)}`);
      assert.lengthOf(result.items, count, "the generator made a different number of finds");
      return result;
    }

    /** A fresh find offered to the users named. */
    async function offerTo(userIds, { count = 2, copper = 0 } = {}) {
      const result = await finds(count);
      const offer = await presentLoot({
        items: result.items, copper, label: "ZZ Quench offer", stamp: result.stamp ?? null, userIds
      });
      assert.ok(offer, "presentLoot refused the offer");
      return { offer, items: result.items, coin: result.coin };
    }

    /** Withdraw whatever is standing, and wait for it to be gone. */
    async function clearOffer() {
      if (!lootOffer()) return;
      await cancelOffer();
      await until(() => lootOffer() === null, "the offer to close");
    }

    /**
     * A claim the handler must refuse, in the offer's own words.
     *
     * The MESSAGE is asserted rather than a code: `User#query` carries
     * `e.message` and nothing else, so the sentence is the whole of what a
     * player ever sees.
     */
    async function refuses(payload, user, words) {
      let error = null;
      try {
        await claimLootQueryHandler(payload, { user });
      } catch (err) {
        error = err;
      }
      assert.ok(error, `the handler allowed "${payload.action}" where it should have refused`);
      assert.equal(error.message, words, "the refusal is not in the words the offer says it in");
      return error;
    }

    before(async function () {
      this.timeout(240000);
      savedOffer = game.settings.get("azeroth-rpg", LOOT_OFFER_SETTING) ?? null;
      savedCharacter = game.user.character?.id ?? null;

      player = await User.create({ name: "ZZ Quench Looter", role: CONST.USER_ROLES.PLAYER });
      stranger = await User.create({ name: "ZZ Quench Bystander", role: CONST.USER_ROLES.PLAYER });
      looter = await makeCharacter({ name: "ZZ Looter" });
      await looter.update({ ownership: { [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
      await player.update({ character: looter.id });

      // **A GM IS INVITED ONLY IF THEY ARE ASSIGNED A CHARACTER.**
      // `characterFor` refuses a GM otherwise on purpose - a GM owns every
      // actor in the world, so the Party and first-character searches would
      // answer with somebody else's - so the tests that invite this client
      // need one, and `after` puts back whatever was there.
      gmActor = await makeCharacter({ name: "ZZ Looting GM" });
      await game.user.update({ character: gmActor.id });

      await clearOffer();
    });

    after(async function () {
      this.timeout(240000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-loot") || app.id?.startsWith("azeroth-choose-loot")) {
          await app.close().catch(() => {});
        }
      }
      if (lootOffer()) await cancelOffer().catch(() => {});
      await game.settings.set("azeroth-rpg", LOOT_OFFER_SETTING, savedOffer).catch(() => {});
      await game.user.update({ character: savedCharacter }).catch(() => {});
      const cards = game.messages
        .filter(m => ["lootOffer", "lootSettled"].includes(m.flags?.["azeroth-rpg"]?.kind))
        .map(m => m.id);
      if (cards.length) await ChatMessage.deleteDocuments(cards).catch(() => {});
      await cleanup();
      for (const user of [player, stranger]) {
        if (user) await user.delete().catch(() => {});
      }
      const folder = game.folders.find(f => f.type === "Item" && f.name === game.i18n.localize("AZEROTH.Loot.Folder"));
      if (folder) await folder.delete().catch(() => {});
    });

    /* -------------------------------------------- */

    it("offers a rolled find: the setting holds it, every item is readable and marked, the purse is one share each, and the card carries the Open button for the invited", async function () {
      this.timeout(180000);
      const generator = generatorOf();
      const result = keep(await generator.present({
        state: { scenario: "dungeon", tier: 2, table: { count: [2, 2] } },
        userIds: [player.id]
      }));
      try {
        assert.isTrue(result.ok, JSON.stringify(result.reasons));
        assert.ok(result.offer, "present made no offer");
        const offer = lootOffer();
        assert.ok(offer, "the world setting holds no offer");
        assert.equal(offer.id, result.offer.id, "the setting holds a different offer");
        assert.equal(offer.status, "open");

        // A player needs LIMITED+ to open a world Item's sheet at all, so the
        // presentation LENDS ownership, and the mark is what the drag refusal
        // and the settle both read.
        const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        for (const item of result.items) {
          assert.equal(item.ownership[player.id], OBSERVER, `${item.name} is not readable by the player`);
          assert.equal(item.getFlag("azeroth-rpg", "offer")?.id, offer.id, `${item.name} carries no offer mark`);
        }
        assert.lengthOf(offer.rows.filter(r => r.kind === "item"), result.items.length);

        // ONE SHARE A PLAYER, split at presentation (the lead's call).
        assert.isAbove(result.coin.copper, 0, "the fixture rolled no purse to split");
        const shares = offer.rows.filter(r => r.kind === "coin");
        assert.lengthOf(shares, 1, "one share a player, and there is one player");
        assert.equal(shares[0].forUserId, player.id);
        assert.equal(shares[0].copper, result.coin.copper, "one player's share is not the whole purse");

        const card = game.messages.find(m => {
          const flags = m.flags?.["azeroth-rpg"];
          return flags?.kind === "lootOffer" && flags.offerId === offer.id;
        });
        assert.ok(card, "no offered card was posted");
        const html = await card.renderHTML();
        const open = html.querySelector('[data-action="openLootOffer"]');
        assert.ok(open, "the card carries no Open button");
        assert.equal(open.dataset.offerId, offer.id, "the Open button names another offer");
        // OUTSIDE the actions strip: the card is GM-authored, so the ownership
        // rule in `dice/chat.mjs` would take the button off every player it was
        // posted for.
        assert.isNull(open.closest(".azeroth-card-actions"),
          "the Open button sits in the actions strip, where the ownership rule strips it");
        const block = open.closest("[data-offer-users]");
        assert.ok(block, "the Open button names no audience");
        assert.include(block.dataset.offerUsers.split(","), player.id,
          "the invited player is not in the card's audience");

        // The presentation RAISES the window for this client, once.
        const app = await until(() => (win()?.rendered ? win() : null), "the GM's loot window to open");
        assert.isTrue(app.rendered);
      } finally {
        await clearOffer();
      }
    });

    it("a press in the window reaches the handler through CONFIG.queries exactly once, and the query survives a real socket round trip", async function () {
      this.timeout(180000);
      const { offer } = await offerTo([game.user.id, player.id], { count: 2, copper: 0 });
      const real = CONFIG.queries[CLAIM_LOOT_QUERY];
      let calls = 0;
      CONFIG.queries[CLAIM_LOOT_QUERY] = (payload, ctx) => {
        calls += 1;
        return real(payload, ctx);
      };
      try {
        const rowId = offer.rows[0].id;
        assert.equal(offer.rows[0].kind, "item", "the first row is not a find");
        // RE-QUERIED at the moment of the press: the presentation forces a
        // render, and a control held across one is detached.
        const take = await until(
          () => win()?.element?.querySelector(`li[data-row-id="${rowId}"] [data-action="lootOfferTake"]`) ?? null,
          "the first row's Take button"
        );
        take.click();
        await until(() => lootOffer()?.rows?.[0]?.claimedBy === game.user.id, "the claim to land in the setting");
        assert.equal(calls, 1, "the press did not go through CONFIG.queries exactly once");

        // ONE REAL ROUND TRIP. `User#query` on this client still goes out over
        // the socket and comes back, so this is what proves the handler is
        // registered under its name and that the payload and the answer are
        // both JSON.
        const answer = await game.user.query(
          CLAIM_LOOT_QUERY, { offerId: offer.id, rowId, action: "release" }, { timeout: 5000 }
        );
        assert.isTrue(answer?.ok, `the round trip refused: ${JSON.stringify(answer)}`);
        await until(() => lootOffer()?.rows?.[0]?.claimedBy === null, "the release to land in the setting");
      } finally {
        CONFIG.queries[CLAIM_LOOT_QUERY] = real;
        await clearOffer();
      }
    });

    it("refuses in the offer's own words - taken, not invited, another player's share, not yours, gone, closed - and answers a repeat with a no-op", async function () {
      this.timeout(180000);
      const { offer } = await offerTo([game.user.id, player.id], { count: 2, copper: 120 });
      try {
        const itemRows = offer.rows.filter(r => r.kind === "item");
        const [first, second] = itemRows;
        const gmShare = offer.rows.find(r => r.kind === "coin" && r.forUserId === game.user.id);
        assert.ok(gmShare, "the GM was invited and holds no share of the purse");

        const took = await claimLootQueryHandler({ offerId: offer.id, rowId: first.id, action: "take" }, { user: game.user });
        assert.isTrue(took.ok);
        assert.equal(took.state, "mine");

        // Somebody else is holding it, and the sentence says who.
        await refuses({ offerId: offer.id, rowId: first.id, action: "take" }, player,
          game.i18n.format("AZEROTH.LootOffer.Refuse.Taken", { name: game.user.name }));

        // A GM'S SECOND TAB RUNS THE HANDLER AGAIN ON ONE PRESS. That must be
        // a no-op, never *you already took it* naming the claimant themselves.
        const again = await claimLootQueryHandler({ offerId: offer.id, rowId: first.id, action: "take" }, { user: game.user });
        assert.isTrue(again.ok);
        assert.isTrue(again.noop, "the second run of one press was judged as a fresh claim");

        await refuses({ offerId: offer.id, rowId: second.id, action: "take" }, stranger,
          game.i18n.localize("AZEROTH.LootOffer.Refuse.NotInvited"));

        await refuses({ offerId: offer.id, rowId: gmShare.id, action: "take" }, player,
          game.i18n.format("AZEROTH.LootOffer.Refuse.NotEligible", { name: game.user.name }));

        await refuses({ offerId: offer.id, rowId: first.id, action: "release" }, player,
          game.i18n.localize("AZEROTH.LootOffer.Refuse.NotYours"));

        // A find deleted out of the folder cannot be TAKEN - and can still be
        // passed, or the row would never resolve and Finish would be the only
        // way out of the offer.
        const world = game.items.get(second.id);
        assert.ok(world, "the row's world copy is not in the world");
        await world.delete();
        await refuses({ offerId: offer.id, rowId: second.id, action: "take" }, player,
          game.i18n.localize("AZEROTH.LootOffer.Refuse.Gone"));
        const passed = await claimLootQueryHandler({ offerId: offer.id, rowId: second.id, action: "pass" }, { user: player });
        assert.isTrue(passed.ok, "a find that no longer exists could not be passed");

        await refuses({ offerId: foundry.utils.randomID(), rowId: first.id, action: "take" }, player,
          game.i18n.localize("AZEROTH.LootOffer.Refuse.Closed"));
      } finally {
        await clearOffer();
      }
    });

    it("a claim written into the setting redraws the row on every client through the hook", async function () {
      this.timeout(180000);
      const { offer } = await offerTo([game.user.id, player.id], { count: 1, copper: 0 });
      try {
        await until(() => (win()?.rendered ? win() : null), "the loot window to open");
        const rowId = offer.rows[0].id;
        const stateOf = () => win()?.element
          ?.querySelector(`li[data-row-id="${rowId}"] .azeroth-loot-offer-state`)?.textContent?.trim() ?? "";
        // The state IS the assertion: it is the words the row says, never the
        // grey and never the absence of a button.
        await until(() => stateOf() === game.i18n.localize("AZEROTH.LootOffer.State.Open"), "the row to read Open");

        const claimed = {
          ...offer,
          rows: offer.rows.map(row => (row.id === rowId ? { ...row, claimedBy: player.id } : row))
        };
        await setLootOffer(claimed, "claim");
        const taken = game.i18n.format("AZEROTH.LootOffer.State.Taken", { name: player.name });
        await until(() => stateOf() === taken, "the row to name the player who took it");
      } finally {
        await clearOffer();
      }
    });

    it("settles itself when every row is taken or passed: the character holds what it took, the world copy stays stamped as given, and the settled card is the offer's own id", async function () {
      this.timeout(240000);
      const { offer } = await offerTo([player.id], { count: 2, copper: 75 });
      const itemRows = offer.rows.filter(r => r.kind === "item");
      const [taken, passed] = itemRows;
      const share = offer.rows.find(r => r.kind === "coin");
      assert.ok(share, "no share was made for the one invited player");
      assert.equal(share.copper, 75, "one player takes the whole purse");
      const coinBefore = looter.system.coin;
      const heldBefore = looter.items.size;

      await claimLootQueryHandler({ offerId: offer.id, rowId: taken.id, action: "take" }, { user: player });
      await claimLootQueryHandler({ offerId: offer.id, rowId: passed.id, action: "pass" }, { user: player });
      await claimLootQueryHandler({ offerId: offer.id, rowId: share.id, action: "take" }, { user: player });
      // `null` is the settle's LAST write, so waiting on it waits for the whole
      // hand-over rather than for its beginning.
      await until(() => lootOffer() === null, "the offer to settle itself");

      const gained = looter.items.find(i => i.name === taken.name);
      assert.ok(gained, `${taken.name} never reached the character`);
      assert.equal(looter.items.size, heldBefore + 1, "more than the taken find landed on the sheet");
      assert.ok(gained.getFlag("azeroth-rpg", "loot"), "the find lost its loot stamp on the way");
      assert.isUndefined(gained.getFlag("azeroth-rpg", "offer"), "the offer's own mark travelled onto the sheet");
      assert.isFalse(gained.system.equipped, "the find arrived already worn");
      assert.isNull(gained.system.container ?? null, "the find arrived inside a container of the world's");
      assert.equal(looter.system.coin, coinBefore + 75, "the share of the purse did not land");

      // THE WORLD COPY STAYS IN THE FOLDER (the lead's call), stamped as given
      // so it is never offered twice, and the reading rights come back.
      const world = game.items.get(taken.id);
      assert.ok(world, "the taken find's world copy was deleted rather than kept");
      const given = world.getFlag("azeroth-rpg", "loot")?.given;
      assert.ok(given, "the world copy is not stamped as given");
      assert.equal(given.actorUuid, looter.uuid, "the stamp names another character");
      assert.isUndefined(world.ownership[player.id], "the offer's lent key was not taken back");
      const left = game.items.get(passed.id);
      assert.ok(left, "the passed find left the folder");
      assert.isUndefined(left.getFlag("azeroth-rpg", "loot")?.given, "a passed find was stamped as given");
      assert.isUndefined(left.ownership[player.id], "the offer's lent key survived on a passed find");

      // **THE LOCK IS THE DELETION OF THE OFFERED CARD**, so the offered card
      // being gone is what says the lock was taken; the settled card carries
      // the offer's id, which is what a Resume finds it by.
      assert.isNull(offeredCard(offer.id), "the offered card survived the settle, so the lock was never taken");
      const settled = game.messages.get(offer.id);
      assert.ok(settled, "no settled card carries the offer's id");
      assert.equal(settled.flags["azeroth-rpg"].kind, "lootSettled");
      assert.equal(settled.flags["azeroth-rpg"].reason, "complete");
      assert.include(settled.content, "@UUID[Actor.", "the card does not link what landed on the sheet");

      await until(() => !win()?.rendered, "the window to close with the offer");
    });

    it("Finish hands over what was taken and leaves the rest in the folder", async function () {
      this.timeout(240000);
      const { offer } = await offerTo([player.id], { count: 2, copper: 0 });
      const itemRows = offer.rows.filter(r => r.kind === "item");
      const [taken, open] = itemRows;
      const heldBefore = looter.items.size;

      await claimLootQueryHandler({ offerId: offer.id, rowId: taken.id, action: "take" }, { user: player });
      await finishOffer();
      await until(() => lootOffer() === null, "Finish to close the offer");

      assert.ok(looter.items.find(i => i.name === taken.name), `${taken.name} was taken and did not land`);
      assert.equal(looter.items.size, heldBefore + 1, "an open row was handed over with the taken one");
      const world = game.items.get(open.id);
      assert.ok(world, "the open row left the folder");
      assert.isNull(world.getFlag("azeroth-rpg", "offer") ?? null, "the open row is still marked as on offer");
      assert.isUndefined(world.getFlag("azeroth-rpg", "loot")?.given, "an open row was stamped as given");
      assert.equal(game.messages.get(offer.id)?.flags?.["azeroth-rpg"]?.reason, "finished");
      // **THE OFFERED CARD GOES WITH IT.** Finish does not contend for the lock
      // - it skips it deliberately, since the card may have been deleted by
      // hand - so the removal here is the settle's own tidying up, and without
      // it a card carrying a live Open button stood beside the settled one and
      // opened a window on an offer that had closed.
      assert.isNull(offeredCard(offer.id), "the offered card still stands after Finish, Open button and all");
    });

    it("Cancel hands nothing over, takes the lent reading rights back and clears the setting", async function () {
      this.timeout(240000);
      const { offer } = await offerTo([player.id], { count: 2, copper: 60 });
      const itemRows = offer.rows.filter(r => r.kind === "item");
      const share = offer.rows.find(r => r.kind === "coin");
      const heldBefore = looter.items.size;
      const coinBefore = looter.system.coin;

      await claimLootQueryHandler({ offerId: offer.id, rowId: itemRows[0].id, action: "take" }, { user: player });
      await claimLootQueryHandler({ offerId: offer.id, rowId: share.id, action: "take" }, { user: player });
      await cancelOffer();
      await until(() => lootOffer() === null, "Cancel to close the offer");

      assert.equal(looter.items.size, heldBefore, "a withdrawn offer handed a find over");
      assert.equal(looter.system.coin, coinBefore, "a withdrawn offer handed the purse over");
      for (const row of itemRows) {
        const world = game.items.get(row.id);
        assert.ok(world, `${row.name} left the folder`);
        assert.isNull(world.getFlag("azeroth-rpg", "offer") ?? null, `${row.name} is still marked as on offer`);
        assert.isUndefined(world.getFlag("azeroth-rpg", "loot")?.given, `${row.name} was stamped as given`);
        assert.isUndefined(world.ownership[player.id], `${row.name} kept the key the offer lent`);
      }
      assert.isNull(lootOffer(), "the setting still holds a withdrawn offer");
      assert.equal(game.messages.get(offer.id)?.flags?.["azeroth-rpg"]?.reason, "cancelled");
      // Withdrawn means withdrawn: nothing is left in the log offering it.
      assert.isNull(offeredCard(offer.id), "the offered card still stands after Cancel, Open button and all");
    });

    it("a find under offer cannot be dragged onto a sheet, and can the moment the offer is withdrawn", async function () {
      this.timeout(240000);
      const { offer } = await offerTo([player.id], { count: 1, copper: 0 });
      const world = game.items.get(offer.rows[0].id);
      assert.ok(world, "the offered find is not in the world");
      const before = looter.items.size;

      // EVERY DOOR MEETS THE SAME RULE: the sheet drop creates from
      // `item.toObject()`, so the offer's mark arrives at `_preCreate`.
      const refused = await Item.create(world.toObject(), { parent: looter });
      assert.isUndefined(refused, "a find under offer was created on the sheet");
      assert.equal(looter.items.size, before, "the drag landed after all");

      await clearOffer();
      const allowed = await Item.create(world.toObject(), { parent: looter });
      try {
        assert.ok(allowed, "the find could not be dragged once the offer was withdrawn");
        assert.equal(looter.items.size, before + 1);
      } finally {
        await allowed?.delete();
      }
    });

    it("an Item folder's right click offers what it holds, no other directory does, and a find already handed over is not offered again", async function () {
      this.timeout(120000);
      const { items } = await finds(1);
      const mine = items[0];
      const folder = game.folders.find(f => f.type === "Item" && f.name === game.i18n.localize("AZEROTH.Loot.Folder"));
      assert.ok(folder, "the Generated Items folder is not there");

      const options = [];
      Hooks.call("getFolderContextOptions", ui.items, options);
      const entry = options.find(o => o.label === "AZEROTH.LootOffer.PresentFolder");
      assert.ok(entry, "the Item directory's folder menu carries no Offer entry");

      // Core hands `visible` the folder HEADER and the folder is read off the
      // row above it, which is what this synthetic markup reproduces.
      const row = document.createElement("div");
      row.className = "directory-item";
      row.dataset.uuid = folder.uuid;
      const header = document.createElement("header");
      row.appendChild(header);
      assert.isTrue(entry.visible(header), "the entry is hidden on an Item folder");

      // THE HOOK FIRES ON EVERY DIRECTORY, so the guard is the only thing
      // keeping this off the Actors tab.
      const elsewhere = [];
      Hooks.call("getFolderContextOptions", ui.actors, elsewhere);
      assert.isUndefined(elsewhere.find(o => o.label === "AZEROTH.LootOffer.PresentFolder"),
        "the Offer entry reached the Actor directory");

      assert.include(offerableIn(folder).map(i => i.id), mine.id, "a fresh find in the folder is not offerable");
      const stamp = mine.getFlag("azeroth-rpg", "loot") ?? {};
      await mine.setFlag("azeroth-rpg", "loot", {
        ...stamp,
        given: { offerId: "quenchtest000000", actorUuid: looter.uuid, actorName: looter.name, at: Date.now() }
      });
      assert.notInclude(offerableIn(folder).map(i => i.id), mine.id,
        "a find already handed over is offered a second time");
    });

    it("the window measures clean, every control has a handler, another player's share says whose it is, and a name opens the thing itself", async function () {
      this.timeout(180000);
      const { offer } = await offerTo([game.user.id, player.id], { count: 2, copper: 90 });
      let sheet = null;
      try {
        // THE ONE WINDOW. Its id is fixed, so constructing a second instance
        // here would put two elements carrying `#azeroth-loot-offer` in the
        // document and leave the module's own copy as the one the hook closes.
        openLootOffer(offer.id);
        const app = await until(() => (win()?.rendered ? win() : null), "the loot window to open");
        assert.instanceOf(app, game.system.azeroth.lootOfferWindow, "the window is not the class the system exposes");
        await settle();

        const findings = checkText(app.element);
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
        // THE FRAME, NOT THE ELEMENT (phase 13's own scoping): core's window
        // header carries `close`, `minimize` and `toggleControls`, which core
        // handles itself and which are in no application's actions map.
        const frame = app.element.querySelector(".azeroth-generator-frame");
        assert.ok(frame, "the window drew no frame");
        for (const el of frame.querySelectorAll("[data-action]")) {
          assert.isFunction(app.options.actions?.[el.dataset.action], `${el.dataset.action} has no handler`);
        }

        // EVERY ROW SAYS ITS STATE IN WORDS (CLAUDE.md §12).
        const rows = [...app.element.querySelectorAll("li[data-row-id]")];
        assert.lengthOf(rows, offer.rows.length, "the list drew a different number of rows than the offer holds");
        for (const li of rows) {
          const state = li.querySelector(".azeroth-loot-offer-state");
          assert.ok(state?.textContent.trim().length, "a row says nothing about its state");
        }

        // A share that is not this reader's is greyed AND says whose it is.
        const theirs = app.element.querySelector(`li[data-row-id="coin-${player.id}"]`);
        assert.ok(theirs, "the other player's share is not drawn at all");
        assert.include(theirs.textContent, player.name, "the other player's share does not say whose it is");
        assert.isNull(theirs.querySelector('[data-action="lootOfferTake"]'),
          "the GM is offered another player's share");

        const view = app.element.querySelector('[data-action="lootOfferView"]');
        assert.ok(view, "no find's name is a control");
        const uuid = view.dataset.uuid;
        view.click();
        // `rendered` IS the wait, not a second assertion after it: core
        // registers an application in `instances` and then awaits the DOM
        // insert before the state moves (`application.mjs:581-585`, 14.367),
        // so a poll that stops at the map catches it mid-flight.
        sheet = await until(
          () => [...foundry.applications.instances.values()].find(a => a.document?.uuid === uuid && a.rendered) ?? null,
          "the find's own sheet to open"
        );
      } finally {
        if (sheet) await sheet.close().catch(() => {});
        await clearOffer();
      }
    });

    it("the generator's Offer button opens the ONE chooser, ticked for the connected players, with a row that ticks the lot - and a dismissal makes nothing", async function () {
      this.timeout(180000);
      const generator = generatorOf();
      const itemsBefore = game.items.size;
      try {
        await generator.render({ force: true });
        await settle();
        await generator.setState({ scenario: "dungeon", tier: 2, table: { count: [2, 2] } });
        generator.element.querySelector('[data-action="lootRoll"]').click();
        await until(
          () => generator.state.rows.length > 0
            && generator.element.querySelectorAll("li[data-index]").length === generator.state.rows.length,
          "the rolled rows to draw"
        );

        generator.element.querySelector('[data-action="lootPresent"]').click();
        const dialog = await until(
          () => foundry.applications.instances.get("azeroth-choose-loot-present") ?? null,
          "the player picker"
        );
        await settle();

        const mine = [...dialog.element.querySelectorAll(".azeroth-choose-option")]
          .find(o => o.querySelector("dt")?.textContent.includes(player.name));
        assert.ok(mine, "the picker does not list the player");
        const box = mine.querySelector('input[name="choice"]');
        assert.ok(box, "the player's row is not a checkbox, so the picker fell back to a single select");
        assert.isFalse(box.disabled, "a player with a character to hand loot to is greyed");
        // Offered and not connected is a note, never a tick: a find waits for
        // them, and the GM says so deliberately.
        assert.isFalse(box.checked, "a player who is not connected starts ticked");

        const all = dialog.element.querySelector('input[name="all"]');
        assert.ok(all, "the picker has no Select all row");
        assert.isUndefined(all.dataset.action, "the Select all box carries a data-action");
        all.checked = true;
        change(all);
        await settle();
        assert.isTrue(box.checked, "Select all did not tick the player");

        // THE PICKER RUNS BEFORE ANYTHING IS MADE, so dismissing it leaves the
        // world exactly as it was found.
        await dialog.close();
        await settle();
        assert.equal(game.items.size, itemsBefore, "a dismissed picker created something");
        assert.isNull(lootOffer(), "a dismissed picker opened an offer");
      } finally {
        await generator.close().catch(() => {});
        await clearOffer();
      }
    });
  });
}
