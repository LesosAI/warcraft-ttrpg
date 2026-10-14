/**
 * The Short Rest window: what is eaten and what is drunk (05 §16, 08 §12;
 * D-733).
 *
 * `workflows.chooseOption` is the system's ONE chooser (D-673) and it answers
 * one pick or one checklist. A Short Rest is **two independent picks** - a
 * food and a drink, either of which may be declined - so this is its own small
 * `DialogV2.wait` on the roll dialog's model rather than a second general
 * chooser. D-673 still stands for a single list.
 *
 * Everything the window needs is in the first paint: the two selects, the
 * numbers each pick returns, and the reason the Rest button is greyed. The
 * `render` callback binds `change` and toggles exactly two things - the
 * footer button's `disabled` and the reason text - because **ApplicationV2
 * freezes `options`** and a write to `dialog.options.content` THROWS halfway
 * through a swap (D-731). State lives in the DOM and in the closure below.
 *
 * The roll dialog's skip setting is NOT consulted: the pick is the point of
 * the window, and a Short Rest with nothing chosen recovers nothing.
 */

import { shortRest } from "../rules/rest.mjs";
import { provisionOptions, tierAgain } from "../rules/provisions.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/rest.hbs";

/** The window's element id for an actor - fixed, so a second click focuses the first. */
export function restDialogId(actor) {
  return `azeroth-rest-${actor.id}`;
}

/**
 * What a rest would return, worked out ONCE through the pure rule on the
 * actor's own snapshot, so the window can never disagree with the card.
 *
 * Health and Mana are asked for separately - `eats` alone and `drinks` alone -
 * because the two picks are independent and the note under each row says what
 * THAT row is worth. The hot meal's extra is the rule's own `tierAgain` gain,
 * which lands after the rest's recovery and is capped with it: a character
 * one point below their maximum is told +1, not +1 and another +3.
 */
function restNumbers(actor) {
  const s = actor.system ?? {};
  const base = {
    health: s.health, conMod: s.abilities?.con?.mod ?? 0, tier: s.tier ?? 1,
    fatigue: s.fatigue ?? 0, pools: actor.poolSnapshot?.() ?? []
  };
  const amountOf = (r, kind) => r.gains.find(g => g.kind === kind)?.amount ?? 0;
  const eaten = amountOf(shortRest({ ...base, eats: true }), "health");
  // The hot meal's OWN line, already capped by the rule. The card prints the
  // same gain, so the window cannot promise a point the maximum swallows.
  const hot = amountOf(shortRest({ ...base, eats: true, tierAgain: true }), "tierAgain");
  const mana = shortRest({ ...base, drinks: true }).gains
    .filter(g => g.kind === "pool" && g.name === "mana")
    .reduce((sum, g) => sum + g.amount, 0);
  return {
    health: eaten,
    hotMeal: hot,
    mana,
    // Whether there is a Mana pool for a drink to fill at all.
    hasMana: base.pools.some(p => p.kind === "power" && p.name === "mana"),
    // 05 §12 gives Focus back on a Short Rest and mentions no drink, so the
    // window says so wherever the character holds one.
    focus: base.pools.some(p => p.kind === "power" && p.name === "focus")
  };
}

/** One select's rows: the `""` abstention first, then what is carried. */
function optionsFor(rows, preselect = true) {
  return rows.map((row, i) => ({
    value: row.itemId,
    label: row.quantity > 1
      ? `${row.name} ${game.i18n.format("AZEROTH.Rest.Quantity", { n: row.quantity })}`
      : row.name,
    // 08 §12's hot meal and feast, marked so the choice is made with the rule
    // in view rather than by remembering which row it was.
    tag: tierAgain(row.kind) ? game.i18n.localize("AZEROTH.Rest.TierAgainTag") : null,
    // THE FIRST CARRIED ROW IS PRESELECTED: the point of the rest is to eat
    // and drink, and *Nothing* is the explicit abstention.
    selected: preselect && i === 0
  }));
}

/**
 * Open the window and wait. Resolves to `{food, drink}` ids (either may be
 * null), or null when the window was dismissed or is already open.
 *
 * @param {Actor} actor
 * @returns {Promise<{food: string|null, drink: string|null}|null>}
 */
export async function promptRest(actor) {
  const { DialogV2 } = foundry.applications.api;
  const { renderTemplate } = foundry.applications.handlebars;
  const id = restDialogId(actor);

  // A second click focuses the window that is already open rather than
  // stacking a second one over it (the roll dialog's own rule).
  const open = foundry.applications.instances?.get(id);
  if (open?.rendered) {
    open.bringToFront();
    return null;
  }

  const carried = provisionOptions(actor.items ?? []);
  const numbers = restNumbers(actor);
  const empty = !carried.food.length && !carried.drink.length;
  const content = await renderTemplate(TEMPLATE, {
    name: actor.name,
    food: optionsFor(carried.food),
    // A DRINK IS NOT PRESELECTED FOR A CHARACTER WITH NO MANA while there is
    // food to rest on: the default would spend an ale on a Warrior for nothing.
    // With no food carried it is the only way to rest at all, so it is offered.
    drink: optionsFor(carried.drink, numbers.hasMana || !carried.food.length),
    // The numbers each pick returns, in the row's own note.
    eatReturns: game.i18n.format("AZEROTH.Rest.EatReturns", { n: numbers.health }),
    hotMealReturns: carried.food.some(r => tierAgain(r.kind))
      ? game.i18n.format("AZEROTH.Rest.HotMealReturns", { n: numbers.hotMeal })
      : null,
    drinkReturns: numbers.hasMana
      ? game.i18n.format("AZEROTH.Rest.DrinkReturns", { n: numbers.mana })
      : game.i18n.localize("AZEROTH.Use.NoMana"),
    focus: numbers.focus,
    // The window opens saying why it cannot be pressed, where it cannot.
    reason: empty ? game.i18n.format("AZEROTH.Rest.NeedsProvision", { name: actor.name }) : ""
  });

  return DialogV2.wait({
    id,
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-rest"],
    window: { title: game.i18n.localize("AZEROTH.Sheet.ShortRest"), icon: "fa-solid fa-campground" },
    position: { width: 420 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      // Core's own footer button: DialogV2's button config has no live
      // `disabled`, so the greying is done here on the rendered element.
      const button = dialog.element.querySelector('button[data-action="rest"]');
      const line = form?.querySelector("[data-rest-reason]");
      const update = () => {
        const picked = Boolean(form?.elements.food?.value) || Boolean(form?.elements.drink?.value);
        if (button) button.disabled = !picked;
        // A REFUSAL IS SAID IN WORDS, never by the grey alone: nothing carried
        // is a different problem from nothing chosen.
        if (line) {
          line.textContent = picked
            ? ""
            : (empty
              ? game.i18n.format("AZEROTH.Rest.NeedsProvision", { name: actor.name })
              : game.i18n.localize("AZEROTH.Rest.PickOne"));
        }
      };
      // The selects carry no `data-action` - DialogV2 has no actions map, and
      // an action fires on click alone.
      form?.addEventListener("change", update);
      update();
    },
    buttons: [{
      action: "rest",
      label: "AZEROTH.Rest.Rest",
      icon: "fa-solid fa-campground",
      default: true,
      // ALWAYS an object: a callback that returns null falls through to the
      // button's own action (`DialogV2#_onClickButton`, 14.367), and the caller
      // would then be handed the string "rest".
      callback: (clicked, target) => ({
        food: target.form.elements.food?.value || null,
        drink: target.form.elements.drink?.value || null
      })
    }]
  });
}

/**
 * The sheet's Short Rest: ask what is eaten and drunk, then rest.
 *
 * A dismissed window rests not at all - the rest is not taken until the picks
 * are made - and `AzerothActor#shortRest` re-checks both of them at its own
 * door, because a window is a record of a moment.
 */
export async function shortRestWithDialog(actor) {
  if (!actor) return null;
  const picks = await promptRest(actor);
  if (!picks) return null;
  return actor.shortRest(picks);
}
