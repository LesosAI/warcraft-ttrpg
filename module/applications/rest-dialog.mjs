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

import { bloodNeeded, bloodRestPlan, longRest, shortRest, vialUnits } from "../rules/rest.mjs";
import { provisionOptions, tierAgain } from "../rules/provisions.mjs";
import { shownName } from "../helpers/identify-words.mjs";

/**
 * What the character carries to eat and drink, each row named as THIS user sees the thing (08 §4;
 * D-1435). `provisionOptions` is pure and reads the true name; the window disguises it here.
 */
function shownProvisions(actor) {
  const carried = provisionOptions(actor.items ?? []);
  const shown = rows => rows.map(row => {
    const item = actor.items?.get?.(row.itemId) ?? null;
    return item ? { ...row, name: shownName(item) } : row;
  });
  return { food: shown(carried.food), drink: shown(carried.drink), blood: shown(carried.blood) };
}

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/rest.hbs";
/** A San'layn's window, both modes (02 §5; D-1141 to D-1144). */
const BLOOD_TEMPLATE = "systems/azeroth-rpg/templates/dialog/rest-blood.hbs";

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

  const carried = shownProvisions(actor);
  const {sharedFeastOptions}=await import("../effects/shared-feast.mjs");
  const sharedMeals=await sharedFeastOptions(actor);
  const foodOptions=[...optionsFor(carried.food),...sharedMeals];
  const numbers = restNumbers(actor);
  const empty = !carried.food.length && !sharedMeals.length && !carried.drink.length;
  const content = await renderTemplate(TEMPLATE, {
    name: actor.name,
    food: foodOptions,
    // A DRINK IS NOT PRESELECTED FOR A CHARACTER WITH NO MANA while there is
    // food to rest on: the default would spend an ale on a Warrior for nothing.
    // With no food carried it is the only way to rest at all, so it is offered.
    drink: optionsFor(carried.drink, numbers.hasMana || !carried.food.length),
    // The numbers each pick returns, in the row's own note.
    eatReturns: game.i18n.format("AZEROTH.Rest.EatReturns", { n: numbers.health }),
    hotMealReturns: sharedMeals.length||carried.food.some(r => tierAgain(r.kind))
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
        // Undeath's rung at 5 needs no food (the F1 review's note): the rest may be taken with
        // nothing chosen, and a drink is still what returns Mana.
        const picked = Boolean(form?.elements.food?.value) || Boolean(form?.elements.drink?.value) || actor.system?.needsNoFood === true;
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
      callback: (clicked, target) => {
        const food=target.form.elements.food?.value||null;
        if(food?.startsWith("feast:")){const value=food.slice(6),split=value.lastIndexOf(":");return {food:null,drink:target.form.elements.drink?.value||null,feast:{payerUuid:value.slice(0,split),sessionId:value.slice(split+1)}};}
        return {food,drink:target.form.elements.drink?.value||null};
      }
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
  // **A SAN'LAYN IS ASKED FOR BLOOD, AND FOR NOTHING ELSE** (02 §5; D-1141). Before the
  // exemption below: a San'layn Death Knight still needs its blood (D-1142).
  if (actor.system?.bloodFed === true) return bloodRestWithDialog(actor, "short");
  // **A CHARACTER WHO DOES NOT EAT OR DRINK IS ASKED FOR NEITHER** (the lead: *"They do
  // recover health but do not have to eat or drink."*; D-946): the Death Knight, the
  // Forsaken and the Risen rest at once, and the card says why nothing was eaten.
  if (actor.system?.needsNoFood === true && actor.system?.needsNoDrink === true) return actor.shortRest({});
  const picks = await promptRest(actor);
  if (!picks) return null;
  return actor.shortRest(picks);
}

/**
 * **THE SHEET'S LONG REST** (02 §5; the plan's A.6 item 2, *for a blood-fed character, it opens
 * the dialog in long mode first, asking for `bloodLongRest` units*; D-1144). Anybody else rests at
 * once, exactly as the sheet's button always did.
 *
 * @param {Actor} actor
 */
export async function longRestWithDialog(actor) {
  if (!actor) return null;
  if (actor.system?.bloodFed === true) return bloodRestWithDialog(actor, "long");
  return actor.longRest();
}

/** The `bloodLongRest` world setting, or the rule's default where it cannot be read. */
function bloodLongRestSetting() {
  try { return game.settings.get("azeroth-rpg", "bloodLongRest"); } catch { return undefined; }
}

/**
 * **A SAN'LAYN'S REST, BOTH MODES** (02 §5, *Your hunger.*; D-1141 to D-1144). Where the feedings
 * since the last rest already cover it, or the GM's setting asks for none, the rest is taken at
 * once (the plan's F4: *the race's rest door counts it before asking for vials*); otherwise the
 * window asks, and the door re-judges what it is handed.
 *
 * @param {Actor} actor
 * @param {"short"|"long"} kind
 */
export async function bloodRestWithDialog(actor, kind = "short") {
  if (!actor) return null;
  const door = picks => (kind === "long" ? actor.longRest(picks) : actor.shortRest(picks));
  const needed = bloodNeeded(kind, kind === "long" ? bloodLongRestSetting() : 1);
  const since = Math.max(0, Number(actor.bloodSinceRest) || 0);
  if (needed === 0 || since >= needed) return door({});
  const picks = await promptBloodRest(actor, kind, { needed, since });
  if (!picks) return null;
  return door(picks);
}

/**
 * Open the San'layn's window and wait. Resolves to the door's picks - `{blood, fresh}` - or null
 * where it was dismissed or is already open.
 *
 * @param {Actor} actor
 * @param {"short"|"long"} kind
 * @param {{needed: number, since: number}} o
 */
export async function promptBloodRest(actor, kind, { needed, since }) {
  const { DialogV2 } = foundry.applications.api;
  const { renderTemplate } = foundry.applications.handlebars;
  const id = `${restDialogId(actor)}-blood-${kind}`;
  const open = foundry.applications.instances?.get(id);
  if (open?.rendered) {
    open.bringToFront();
    return null;
  }
  const short = kind !== "long";
  const carried = shownProvisions(actor).blood;
  // What the rest returns once its blood is met, worked out through the pure rule (D-1141).
  const s = actor.system ?? {};
  const base = { health: s.health, conMod: s.abilities?.con?.own?.mod ?? s.abilities?.con?.mod ?? 0, tier: s.tier ?? 1, fatigue: s.fatigue ?? 0, pools: actor.poolSnapshot?.() ?? [] };
  const r = short ? shortRest({ ...base, bloodFed: true, blood: true }) : longRest({ ...base });
  const health = r.gains.find(g => g.kind === "health")?.amount ?? 0;
  const power = r.gains.filter(g => g.kind === "pool").reduce((n, g) => n + g.amount, 0);
  const vials = carried.map((row, i) => ({
    value: row.itemId,
    quantity: row.quantity,
    label: row.quantity > 1 ? `${row.name} ${game.i18n.format("AZEROTH.Rest.Quantity", { n: row.quantity })}` : row.name,
    // Short: the first vial carried is preselected. Long: every vial is ticked, and the door
    // drinks only what the rest still needs.
    selected: short ? i === 0 : true
  }));
  const content = await renderTemplate(BLOOD_TEMPLATE, {
    id: actor.id,
    mode: kind,
    short,
    needed,
    vials,
    needLine: game.i18n.format(short ? "AZEROTH.Rest.BloodNeedShort" : "AZEROTH.Rest.BloodNeedLong", { name: actor.name, n: needed }),
    sinceLine: since > 0 ? game.i18n.format("AZEROTH.Rest.BloodSinceNote", { n: since }) : null,
    returns: game.i18n.format("AZEROTH.Rest.BloodReturns", { health, power }),
    reason: ""
  });
  const unitsFrom = form => {
    if (!form) return { fresh: 0, vials: 0 };
    const fresh = short ? (form.elements.fresh?.checked ? 1 : 0) : Math.max(0, Math.trunc(Number(form.elements.fresh?.value)) || 0);
    const picked = short
      ? (form.elements.blood?.value ? [{ quantity: carried.find(c => c.itemId === form.elements.blood.value)?.quantity ?? 1 }] : [])
      : [...form.querySelectorAll("[data-blood-vial]")].filter(el => el.checked).map(el => ({ quantity: Number(el.dataset.units) || 1 }));
    return { fresh, vials: vialUnits(picked) };
  };
  return DialogV2.wait({
    id,
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-rest", "azeroth-rest-blood"],
    window: { title: game.i18n.localize(short ? "AZEROTH.Sheet.ShortRest" : "AZEROTH.Sheet.LongRest"), icon: short ? "fa-solid fa-campground" : "fa-solid fa-bed" },
    position: { width: 440 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const button = dialog.element.querySelector('button[data-action="rest"]');
      const line = form?.querySelector("[data-rest-reason]");
      const update = () => {
        const { fresh, vials: units } = unitsFrom(form);
        const plan = bloodRestPlan({ needed, sinceRest: since, fresh, vials: units });
        // A SHORT REST WITHOUT ITS UNIT IS REFUSED, AS A MEAL-LESS ONE IS; A LONG REST NEVER IS.
        // Either way the reason is said in words, never by the grey alone.
        if (button) button.disabled = short && !plan.met;
        if (line) {
          line.textContent = plan.met
            ? ""
            : (short
              ? game.i18n.format("AZEROTH.Rest.NeedsBlood", { name: actor.name })
              : game.i18n.format("AZEROTH.Rest.BloodShortLong", { n: needed - Math.min(needed, since + fresh + units) }));
        }
      };
      form?.addEventListener("change", update);
      form?.addEventListener("input", update);
      update();
    },
    buttons: [{
      action: "rest",
      label: "AZEROTH.Rest.Rest",
      icon: short ? "fa-solid fa-campground" : "fa-solid fa-bed",
      default: true,
      // ALWAYS an object (D-733's note on `DialogV2#_onClickButton`).
      callback: (clicked, target) => {
        const form = target.form;
        if (short) return { blood: form.elements.blood?.value || null, fresh: form.elements.fresh?.checked === true };
        return {
          blood: [...form.querySelectorAll("[data-blood-vial]")].filter(el => el.checked).map(el => el.value),
          fresh: Math.max(0, Math.trunc(Number(form.elements.fresh?.value)) || 0)
        };
      }
    }]
  });
}
