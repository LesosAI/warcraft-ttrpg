/**
 * A Short Rest takes food or drink (05 §16, 08 §12; D-733).
 *
 * The rule is absolute and the defaults withhold: food recovers the Health,
 * drink recovers the Mana, and a rest with neither recovers neither. That is
 * a rule a unit test can only half see - `rules/rest.mjs` is pure and knows
 * nothing about an item being spent, a warning being raised, a flag being
 * left alone or a window being greyed - so everything below drives the REAL
 * door: `AzerothActor#shortRest`, the sheet's button, the window it opens and
 * the card it posts.
 *
 * What each test here exists to catch:
 *
 * - A REFUSAL THAT CHANGES SOMETHING. Half a rest taken and then refused is
 *   worse than no rest: the count, the dressing, the coatings and the uses all
 *   ride on it, so a refused rest is asserted to have moved NONE of them.
 * - A PICK THAT IS NOT THIS CHARACTER'S. An Item is resolved by id on the
 *   actor's own collection, so another character's bread is no pick at all.
 * - A CARD THAT SAYS THE WRONG HALF IS MISSING. A Warrior holds no Mana, so a
 *   Warrior's card must not mention a drink; a Mage's must.
 * - THE NUMBERS THE WINDOW PROMISES. They are worked out through the same pure
 *   rule the card prints, so the two can never disagree.
 */

import { cleanup, give, made, makeCharacter, makeNpc, openSheet, restDialogFor, settle, useAction } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { provisionOptions } from "../rules/provisions.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, the way every other batch does. */
const until = async (fn, what, ms = 10000) => {
  const t0 = Date.now();
  let value = fn();
  while (!value) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
    value = fn();
  }
  return value;
};

/**
 * Collect the warnings a call raises, and put the notifier back.
 *
 * A REFUSAL IS SAID IN WORDS (D-733), so the words are what is asserted:
 * a null return with a silent notifier would read as a broken button.
 */
async function warningsDuring(fn) {
  const warned = [];
  const original = ui.notifications.warn;
  ui.notifications.warn = function (message, ...rest) { warned.push(String(message)); return original.call(this, message, ...rest); };
  try { return { result: await fn(), warned }; }
  finally { ui.notifications.warn = original; }
}

/** The newest card, registered for the teardown, flattened to text. */
function lastCard() {
  const message = game.messages.contents.at(-1) ?? null;
  if (message) made.push(message);
  const el = document.createElement("div");
  el.innerHTML = message?.content ?? "";
  return { message, text: el.textContent.replace(/\s+/g, " ").trim() };
}

/** One of the actor's Power pools, by name. */
const poolNamed = (actor, name) => (actor.system.powers ?? []).find(p => p.name === name) ?? null;

/** Empty a pool so a rest has somewhere to put the recovery. */
async function emptyPool(actor, name) {
  const pool = poolNamed(actor, name);
  if (!pool) throw new Error(`${actor.name} holds no ${name}`);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value: 0 });
  return poolNamed(actor, name);
}

/** What the rest's own recovery comes to on this actor, read off the actor. */
const foodGain = actor => Math.max(0, (actor.system.abilities?.con?.mod ?? 0) + (actor.system.tier ?? 1));

/** The window's two selects and its footer, once it has painted. */
function windowParts(app) {
  return {
    food: app.element.querySelector('select[name="food"]'),
    drink: app.element.querySelector('select[name="drink"]'),
    button: app.element.querySelector('button[data-action="rest"]'),
    reason: app.element.querySelector("[data-rest-reason]"),
    body: app.element.querySelector(".azeroth-dialog")
  };
}

/**
 * CORE'S OWN FOOTER BUTTON, excused by name (D-608's shape: a debt is named
 * with its reason, never left unmeasured).
 *
 * `button` in core's `elements.forms` layer carries
 * `--button-text-color: var(--color-light-3)` on `--color-cool-5-50`, which
 * over our parchment measures **#e7d1b1 on #7a736a at 3.16:1** - under the
 * lead's 4.5:1 floor. It is core's styling on EVERY dialog this system opens
 * (the roll dialog's Roll and Cancel are the same button), so it is a standing
 * debt for the lead rather than this window's to invent a look for. The
 * DISABLED state is measured, because that one is ours.
 */
const CORE_FOOTER_BUTTON = ".form-footer button:not([disabled])";

/**
 * Open the window the way a player does: the sheet's own button.
 *
 * **THE SETTLE IS 500ms, NOT TWO FRAMES.** Core's `button` carries
 * `transition: 0.5s` over every property, so a button greyed in the `render`
 * callback ANIMATES from core's dark ground to ours: measured at render time
 * the disabled Rest button reads 2.92:1 and measured settled it reads 7.2:1,
 * and the first is a picture of the animation rather than of the window.
 */
async function openRestWindow(actor, assert) {
  const sheet = await openSheet(actor);
  const { el, registered } = useAction(sheet, "shortRest");
  assert.ok(el && registered, "no Short Rest button on the character sheet, or no handler for it");
  el.click();
  const app = await restDialogFor(actor, 8000);
  assert.ok(app, "the Short Rest button opened no window");
  await settle();
  await new Promise(r => setTimeout(r, 600));
  return { sheet, app };
}

export function restBatch(context) {
  const { describe, it, assert, after } = context;

  describe("A Short Rest takes food or drink (05 §16, 08 §12; D-733)", function () {
    let priorSetting = null;

    after(async function () {
      this.timeout(120000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-rest-")) await app.close();
      }
      if (priorSetting !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      await cleanup();
    });

    /* ---- the door refuses ---------------------------------------------- */

    it("refuses a character carrying neither, in words, and changes nothing at all", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Empty", classes: [["Warrior", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      // A flag the rest would clear, set before it: a refusal must not reach it.
      await actor.setFlag("azeroth-rpg", "dressed", true);
      const messages = game.messages.size;

      const { result, warned } = await warningsDuring(() => actor.shortRest());
      assert.isNull(result, "an empty-handed Short Rest was taken");
      assert.lengthOf(warned, 1, `the refusal said ${warned.length} things: ${warned.join(" | ")}`);
      assert.include(warned[0], actor.name, "the refusal does not name who is carrying nothing");
      assert.equal(game.messages.size, messages, "a refused rest posted a card");
      assert.equal(actor.system.health.value, 1, "a refused rest restored Health");
      assert.isNotOk(actor.getFlag("azeroth-rpg", "shortRests"), "a refused rest was counted against the day");
      assert.isTrue(actor.getFlag("azeroth-rpg", "dressed"), "a refused rest cleared the dressing");
    });

    it("refuses a pick that is not this character's, by name, and leaves it on its owner", async function () {
      this.timeout(90000);
      const mine = await makeCharacter({ name: "ZZ Rest Mine", classes: [["Warrior", 3]], abilities: { con: 14 } });
      const theirs = await makeCharacter({ name: "ZZ Rest Theirs", classes: [["Warrior", 3]] });
      await mine.update({ "system.health.value": 1 });
      const bread = await give(theirs, "Bread and cheese");
      const messages = game.messages.size;

      const { result, warned } = await warningsDuring(() => mine.shortRest({ food: bread }));
      assert.isNull(result, "another character's bread fed this one");
      assert.include(warned.join(" | "), bread.name, "the refusal does not name the thing that was not theirs");
      assert.ok(theirs.items.get(bread.id), "another character's bread was eaten");
      assert.equal(mine.system.health.value, 1, "a refused rest restored Health");
      assert.equal(game.messages.size, messages, "a refused rest posted a card");
    });

    it("refuses the Waterskin as drink, spends nothing else for it, and never lists it (the lead's decision 3)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Waterskin", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const bread = await give(actor, "Bread and cheese");
      const skin = await give(actor, "Waterskin");
      const charges = skin.system.charges?.value ?? null;
      assert.isNotNull(charges, "the waterskin carries no charges to protect");

      // BOTH PICKS ARE JUDGED BEFORE EITHER IS SPENT: a legal meal beside an
      // illegal drink costs the character nothing.
      const { result, warned } = await warningsDuring(() => actor.shortRest({ food: bread, drink: skin }));
      assert.isNull(result, "a waterskin was drunk at a rest");
      assert.include(warned.join(" | "), skin.name, "the refusal does not name the waterskin");
      assert.ok(actor.items.get(bread.id), "the meal was eaten for a refused rest");
      assert.equal(actor.items.get(skin.id).system.charges.value, charges, "the refusal spent a charge");
      assert.equal(actor.system.health.value, 1, "a refused rest restored Health");

      const offered = provisionOptions(actor.items);
      assert.notOk(offered.drink.some(r => r.itemId === skin.id), "the waterskin is offered as drink");
      assert.ok(offered.food.some(r => r.itemId === bread.id), "the meal is not offered as food");
    });

    /* ---- what each half restores ---------------------------------------- */

    it("food alone restores the Health and no Mana, and the card names both the meal and the missing drink", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Fed Mage", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const mana = await emptyPool(actor, "mana");
      assert.isAbove(mana.max, 0, "the fixture holds no Mana, so the missing drink says nothing");
      const bread = await give(actor, "Bread and cheese");
      const gain = foodGain(actor);
      assert.isAbove(gain, 0, "the fixture recovers nothing even when it eats");

      assert.ok(await actor.shortRest({ food: bread }), "a fed rest was refused");
      assert.equal(actor.system.health.value, Math.min(actor.system.health.max, 1 + gain), "the meal restored the wrong Health");
      assert.equal(poolNamed(actor, "mana").value, 0, "a rest with no drink restored Mana");
      assert.isNull(actor.items.get(bread.id) ?? null, "the meal was not spent");

      const card = lastCard();
      assert.include(card.text, "Ate", "the card does not say it was eaten");
      assert.include(card.text, bread.name);
      assert.include(card.text, "No drink", "a Mage's card does not say the Mana is missing");
      assert.notMatch(card.text, /Mana\s*\+/, "the card claimed Mana with nothing drunk");
    });

    it("drink alone restores half the Mana and no Health, and the card says which half was missing", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Drinker", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const mana = await emptyPool(actor, "mana");
      const ale = await give(actor, "Ale, a pint");

      assert.ok(await actor.shortRest({ drink: ale }), "a rest on a pint was refused");
      assert.equal(poolNamed(actor, "mana").value, Math.floor(mana.max / 2), "the pint restored the wrong Mana");
      assert.equal(actor.system.health.value, 1, "a rest with nothing eaten restored Health");
      assert.isNull(actor.items.get(ale.id) ?? null, "the pint was not spent");

      const card = lastCard();
      assert.include(card.text, "Drank");
      assert.include(card.text, ale.name);
      assert.include(card.text, "No food", "the card does not say the Health is missing");
      assert.notMatch(card.text, /Health\s*\+/, "the card claimed Health with nothing eaten");
    });

    it("a Warrior's card says nothing about a pool the Warrior has not got, while a Mage's does", async function () {
      this.timeout(90000);
      // 05 §12's Mana line reaches a character who holds Mana and nobody else:
      // *No drink: no Mana recovered.* on a Warrior's card is a rule about a
      // pool that does not exist.
      const warrior = await makeCharacter({ name: "ZZ Rest Warrior Card", classes: [["Warrior", 3]], abilities: { con: 14 } });
      await warrior.update({ "system.health.value": 1 });
      assert.isNull(poolNamed(warrior, "mana"), "the fixture Warrior holds Mana");
      assert.ok(await warrior.shortRest({ food: await give(warrior, "Rations, one day") }));
      const plain = lastCard();
      assert.include(plain.text, "Ate");
      assert.notInclude(plain.text, "No drink", "a Warrior's card mentions a Mana pool it has not got");

      const mage = await makeCharacter({ name: "ZZ Rest Mage Card", classes: [["Mage", 3]], abilities: { con: 14 } });
      await mage.update({ "system.health.value": 1 });
      assert.ok(await mage.shortRest({ food: await give(mage, "Rations, one day") }));
      assert.include(lastCard().text, "No drink", "a Mage's card does not say the Mana is missing");
    });

    it("a Ranger's Focus comes back on food alone (05 §12)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Ranger", classes: [["Ranger", 5]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const focus = await emptyPool(actor, "focus");
      assert.isAbove(focus.max, 0, "a Ranger 5 should hold Focus");

      assert.ok(await actor.shortRest({ food: await give(actor, "Rations, one day") }));
      assert.equal(poolNamed(actor, "focus").value, focus.max, "Focus did not come back on a Short Rest");
      assert.isAbove(actor.system.health.value, 1, "the meal restored no Health");
    });

    it("both halves restore both, and the card carries neither refusal line", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Both", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const mana = await emptyPool(actor, "mana");
      const bread = await give(actor, "Bread and cheese");
      const ale = await give(actor, "Ale, a pint");
      const gain = foodGain(actor);

      assert.ok(await actor.shortRest({ food: bread, drink: ale }));
      assert.equal(actor.system.health.value, Math.min(actor.system.health.max, 1 + gain));
      assert.equal(poolNamed(actor, "mana").value, Math.floor(mana.max / 2));
      assert.isNull(actor.items.get(bread.id) ?? null, "the meal was not spent");
      assert.isNull(actor.items.get(ale.id) ?? null, "the pint was not spent");

      const card = lastCard();
      assert.include(card.text, bread.name);
      assert.include(card.text, ale.name);
      assert.notInclude(card.text, "No food");
      assert.notInclude(card.text, "No drink");
      assert.notInclude(card.text, "Nothing to recover", "a rest that fed and watered printed nothing to recover");
    });

    it("a hot meal adds the tier again on top, on its own line, and a feast is spent whole (08 §12)", async function () {
      this.timeout(90000);
      // 08 §12's worked case: a Warrior at Constitution 14 (+2), tier 1, on 1
      // Health. The rest's own recovery is 3 and the meal's tier is 1 more.
      const actor = await makeCharacter({ name: "ZZ Rest Hot Meal", classes: [["Warrior", 1]], abilities: { con: 14 } });
      assert.equal(actor.system.abilities.con.mod, 2, "the fixture's Constitution modifier moved");
      assert.equal(actor.system.tier, 1, "the fixture's tier moved");
      assert.isAtLeast(actor.system.health.max, 5, "the fixture cannot hold the five Health this case counts");
      await actor.update({ "system.health.value": 1 });

      const meal = await give(actor, "Hot meal at an inn");
      assert.equal(meal.system.provision, "hotMeal", "the pack's hot meal is not stamped as one");
      assert.ok(await actor.shortRest({ food: meal }));
      assert.equal(actor.system.health.value, 5, "Con +2 and tier 1, then the tier again, from 1 Health");
      const card = lastCard();
      assert.match(card.text, /Health\s*\+3/, "the rest's own recovery is not on the card");
      assert.match(card.text, /Hot meal\s*\+1/, "08 §12's tier again is not on its own line");
      assert.isNull(actor.items.get(meal.id) ?? null, "the meal was not spent");

      // A feast is ONE item under one-item-one-rest, and it goes whole.
      await actor.update({ "system.health.value": 1 });
      const feast = await give(actor, "Feast, for six");
      assert.equal(feast.system.provision, "hotMeal");
      assert.ok(await actor.shortRest({ food: feast }));
      assert.equal(actor.system.health.value, 5, "the feast fed the rest differently from the meal");
      assert.match(lastCard().text, /Hot meal\s*\+1/);
      assert.isNull(actor.items.get(feast.id) ?? null, "the feast survived the rest it fed");
    });

    /* ---- one item, one rest ---------------------------------------------- */

    it("marks one off a stack, deletes the last, and eats what is kept in a backpack", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Rest Stack", classes: [["Warrior", 3]], abilities: { con: 14 } });
      const rations = await give(actor, "Rations, one day");
      await rations.update({ "system.quantity": 2 });

      await actor.update({ "system.health.value": 1 });
      assert.ok(await actor.shortRest({ food: rations }));
      assert.equal(actor.items.get(rations.id)?.system.quantity, 1, "two days of rations did not fall to one");

      await actor.update({ "system.health.value": 1 });
      assert.ok(await actor.shortRest({ food: rations }));
      assert.isNull(actor.items.get(rations.id) ?? null, "the last ration was not eaten");

      // WHAT IS IN A CONTAINER IS STILL CARRIED (D-671): Foundry has no item
      // inside an item, so a meal in a pack is an owned item naming its pack.
      // **THE PACK GOES ON FIRST** (08 §11, D-736): a bag off the bar holds
      // nothing, and a move into one is refused in words.
      const pack = await give(actor, "Backpack");
      await pack.update({ "system.equipped": true });
      await until(() => actor.items.get(pack.id)?.system.equipped === true, "the pack to go on");
      const stowed = await give(actor, "Bread and cheese");
      await stowed.update({ "system.container": pack.id });
      await until(() => actor.items.get(stowed.id)?.system.container === pack.id, "the meal to go in the pack");
      assert.ok(provisionOptions(actor.items).food.some(r => r.itemId === stowed.id), "a meal in a pack is not offered");

      await actor.update({ "system.health.value": 1 });
      assert.ok(await actor.shortRest({ food: stowed }));
      assert.isNull(actor.items.get(stowed.id) ?? null, "the meal in the pack was not spent");
      assert.ok(actor.items.get(pack.id), "the pack went with the meal inside it");
    });

    /* ---- the window ------------------------------------------------------ */

    it("opens a window with nothing to pick, greyed and saying why, and measures clean", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Rest Window Empty", classes: [["Warrior", 3]] });
      const { sheet, app } = await openRestWindow(actor, assert);
      try {
        const parts = windowParts(app);
        assert.deepEqual([...parts.food.options].map(o => o.value), [""], "the Eat row offers something");
        assert.deepEqual([...parts.drink.options].map(o => o.value), [""], "the Drink row offers something");
        assert.isTrue(parts.button.disabled, "the Rest button is live with nothing to eat or drink");
        assert.include(parts.reason.textContent, actor.name, "the window does not say why it cannot be pressed");
        // THE WHOLE WINDOW, not the content alone: the greyed footer button
        // took core's dark disabled ground on our parchment and came out as
        // the most emphatic thing in the window - the opposite of what it says
        // - and a measurement of the body could never see it (D-611, D-733).
        const findings = checkText(app.element, { ignore: [CORE_FOOTER_BUTTON] });
        assert.deepEqual(findings, [], `the refused window: ${findings.map(f => f.detail).join(" | ")}`);
      } finally {
        await app.close();
        await sheet.close();
      }
    });

    it("opens on what is carried: both rows for a Mage, the drink left alone for a Warrior who holds no Mana", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ Rest Window Mage", classes: [["Mage", 3]], abilities: { con: 14 } });
      await mage.update({ "system.health.value": 1 });
      await emptyPool(mage, "mana");
      const mageBread = await give(mage, "Bread and cheese");
      const mageAle = await give(mage, "Ale, a pint");
      const first = await openRestWindow(mage, assert);
      try {
        const parts = windowParts(first.app);
        assert.equal(parts.food.value, mageBread.id, "the Eat row did not open on the meal carried");
        assert.equal(parts.drink.value, mageAle.id, "a caster's Drink row did not open on the pint carried");
        assert.isFalse(parts.button.disabled, "the Rest button is greyed with both rows filled");
        assert.equal(parts.reason.textContent.trim(), "", "a window with both rows filled printed a reason");
        const findings = checkText(first.app.element, { ignore: [CORE_FOOTER_BUTTON] });
        assert.deepEqual(findings, [], `the caster's window: ${findings.map(f => f.detail).join(" | ")}`);
      } finally {
        await first.app.close();
        await first.sheet.close();
      }

      const warrior = await makeCharacter({ name: "ZZ Rest Window Warrior", classes: [["Warrior", 3]], abilities: { con: 14 } });
      await warrior.update({ "system.health.value": 1 });
      const bread = await give(warrior, "Bread and cheese");
      await give(warrior, "Ale, a pint");
      const second = await openRestWindow(warrior, assert);
      try {
        const parts = windowParts(second.app);
        assert.equal(parts.food.value, bread.id, "the Eat row did not open on the meal carried");
        // A DRINK IS NOT PRESELECTED FOR A CHARACTER WITH NO MANA while there
        // is food to rest on: the default would spend the pint for nothing.
        assert.equal(parts.drink.value, "", "a Warrior's window spent a pint on a pool it has not got");
        assert.lengthOf([...parts.drink.options], 2, "the pint is not offered at all");
        assert.include(parts.body.textContent, "No Mana pool to restore", "the Drink row promises Mana to a Warrior");
        assert.isFalse(parts.button.disabled, "the Rest button is greyed with a meal picked");
      } finally {
        await second.app.close();
        await second.sheet.close();
      }
    });

    it("greys the Rest button when both rows are set to Nothing, says which, and takes it back", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Rest Window Pick", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const bread = await give(actor, "Bread and cheese");
      await give(actor, "Ale, a pint");
      const { sheet, app } = await openRestWindow(actor, assert);
      try {
        let parts = windowParts(app);
        assert.isFalse(parts.button.disabled, "the Rest button opened greyed with both rows filled");

        for (const select of [parts.food, parts.drink]) {
          select.value = "";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await settle();
        // RE-QUERY: a control read before a render is dead after it.
        parts = windowParts(app);
        assert.isTrue(parts.button.disabled, "Nothing in both rows left the Rest button live");
        assert.isNotEmpty(parts.reason.textContent.trim(), "a greyed button with no reason beside it");
        assert.notInclude(parts.reason.textContent, actor.name, "the reason is the empty-handed one, not the unchosen one");

        parts.food.value = bread.id;
        parts.food.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        parts = windowParts(app);
        assert.isFalse(parts.button.disabled, "a meal picked again did not take the greying off");
        assert.equal(parts.reason.textContent.trim(), "", "the reason outlived the refusal");
      } finally {
        await app.close();
        await sheet.close();
      }
    });

    it("rests not at all when the window is dismissed", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Rest Dismissed", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      await emptyPool(actor, "mana");
      const bread = await give(actor, "Bread and cheese");
      const ale = await give(actor, "Ale, a pint");
      const messages = game.messages.size;
      const { sheet, app } = await openRestWindow(actor, assert);
      try {
        await app.close();
        // The close resolves the window's promise; give the door its turn.
        await new Promise(r => setTimeout(r, 300));
        assert.equal(game.messages.size, messages, "a dismissed window posted a card");
        assert.equal(actor.system.health.value, 1, "a dismissed window rested");
        assert.equal(poolNamed(actor, "mana").value, 0, "a dismissed window restored Mana");
        assert.ok(actor.items.get(bread.id), "a dismissed window ate the meal");
        assert.ok(actor.items.get(ale.id), "a dismissed window drank the pint");
        assert.isNotOk(actor.getFlag("azeroth-rpg", "shortRests"), "a dismissed window counted a rest");
      } finally {
        await sheet.close();
      }
    });

    it("opens even where the roll dialog is set to be skipped: the pick is the point", async function () {
      this.timeout(90000);
      priorSetting ??= game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const actor = await makeCharacter({ name: "ZZ Rest Skip Setting", classes: [["Mage", 3]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1 });
      const mana = await emptyPool(actor, "mana");
      await give(actor, "Ale, a pint");
      const messages = game.messages.size;
      const { sheet, app } = await openRestWindow(actor, assert);
      try {
        const parts = windowParts(app);
        assert.isFalse(parts.button.disabled, "the window opened greyed with a pint carried");
        parts.button.click();
        await until(() => poolNamed(actor, "mana").value === Math.floor(mana.max / 2), "the Mana the pint returns");
        assert.equal(actor.system.health.value, 1, "a rest on a pint alone restored Health");
        // THE CARD IS POSTED AFTER THE POOL IS WRITTEN, so waiting on the pool
        // and then reading the newest message reads the PREVIOUS test's card
        // (CLAUDE.md §15: wait for exactly what you assert).
        await until(() => game.messages.size > messages, "the rest card");
        assert.include(lastCard().text, "Drank");
      } finally {
        await sheet.close();
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      }
    });

    /* ---- the creature is exempt ------------------------------------------ */

    it("a creature rests with no window and no provisions at all (14 carries no rations)", async function () {
      this.timeout(60000);
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.health.value": 1 });
      const messages = game.messages.size;

      const { result, warned } = await warningsDuring(() => npc.shortRest());
      assert.ok(result, "a creature's Short Rest was refused");
      assert.lengthOf(warned, 0, `a creature was asked for food: ${warned.join(" | ")}`);
      assert.isAbove(npc.system.health.value, 1, "the creature did not rest");
      assert.equal(game.messages.size, messages + 1, "the creature's rest posted no card");
      assert.isNull(await restDialogFor(npc, 200), "a creature's rest opened the food window");
      const card = lastCard();
      assert.notInclude(card.text, "No food", "a creature's card asked it for rations");
      assert.notInclude(card.text, "No drink", "a creature's card asked it for a drink");
    });

    /* ---- the world migration (CLAUDE.md §10) ----------------------------- */

    it("stamps a world's food and drink once, leaves a hand-made meal alone, and a second run touches nothing (0.12.9)", async function () {
      this.timeout(600000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.9-provisions.mjs");
      const actor = await makeCharacter({ name: "ZZ Migration 0.12.9", classes: [["Warrior", 1]] });

      // A world made before the field existed: the pack's own bread carrying
      // the schema's null, which is no food at all at a rest.
      const bread = await give(actor, "Bread and cheese");
      await bread.update({ "system.provision": null });
      await until(() => (bread.system.provision ?? null) === null, "the stale bread");
      // And a GM's own stew, which no row in 08 describes: it stays null and
      // the select on its item sheet is the door for it (D-689 on guessing).
      const [stew] = await actor.createEmbeddedDocuments("Item", [{ name: "ZZ Stew", type: "gear" }]);
      assert.isNull(stew.system.provision ?? null, "a hand-made meal came out of the schema stamped");

      const touched = await migrate(() => {});
      assert.isAbove(touched, 0, "the migration touched nothing at all");
      await until(() => actor.items.get(bread.id)?.system.provision === "food", "the pack's answer reaching the stale bread");
      assert.isNull(actor.items.get(stew.id).system.provision ?? null, "the migration guessed at a hand-made meal");

      assert.equal(await migrate(() => {}), 0, "a second run of the migration touched a document");
    });
  });
}
