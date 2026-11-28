/**
 * **WHAT THE WITCH HUNTER'S LIVE BATCHES SHARE** (the Witch Hunter plan's wave 2d-B). Every helper presses what a
 * player presses and reads what the door wrote: the Hunter panel's own Use and Prepare, the sheet's Use and its
 * maneuvers, the Combat tab's attack, the roll dialog's own lines read off its checkboxes, a card's buttons, the board
 * where a pick waits. The d20 is pinned through `fixtures.mjs#pinDie`. Nothing here calls a door's pure law to stand in
 * for a control.
 *
 * Selectors are read off the templates they press: `templates/actor/partials/hunter-panel.hbs` (`whUseBrew`,
 * `whPrepare`, `[data-wh-toxicity]`), `templates/dialog/brew-prepare.hbs` (`brewStep`, `[data-brew-count]`,
 * `[data-brew-studied]`, `.azeroth-brew-doses`, `[data-brew-reason]`), `templates/dialog/roll-test.hbs` (every line is
 * a checkbox named `line-<id>` inside its label, a talent line `tline-<identifier>`), `templates/actor/combat.hbs`
 * (`useManeuver`, `stealth`, `rollAttack`), `templates/chat/roll-card.hbs` (`reactParry`, `applyDamage`, `evade`,
 * `extraStrike`), `templates/chat/feature-card.hbs` and `spell-card.hbs` (`resistTest`), `area-card.hbs` (the area
 * Test's `resistTest` with `data-purpose="area"`).
 */

import { dialogFor, give, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { chooser, pick, pressCard, pressUse, until } from "./quench-chronomancer-common.mjs";
import { pickState } from "../canvas/place.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SIGNS } from "../rules/witch-hunter-features.mjs";
import { BREW_IDENTIFIERS, brewOf } from "../rules/witch-hunter-brews.mjs";
import { TOME_FLAG } from "../rules/witch-hunter-standing.mjs";

export const SCOPE = "azeroth-rpg";
export const tempoOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tempo") ?? null;
export const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
export const brewsHeld = actor => actor.items.filter(i => i.type === "gear" && BREW_IDENTIFIERS.includes(i.system?.identifier));
export const talentOf = (actor, identifier) => actor.items.find(i => i.type === "talent" && i.system?.identifier === identifier && i.system?.className === "Witch Hunter") ?? null;

/** Ten formulas a tier 2 hunter may know (six elixirs, two oils, two bombs), the flat list `chooseFormulas` takes. */
export const TIER2_FORMULAS = Object.freeze([
  "peacebloom-draught", "kingsblood-draught", "liferoot-tonic", "mageroyal-draught", "goldthorn-draught", "fadeleaf-drops",
  "hunters-oil", "silvering-oil", "liquid-fire", "sungrass-flash"
]);

/** Fail the batch at once where the class is not in the compiled packs. */
export async function needsClass() {
  const index = await game.packs.get("azeroth-rpg.classes").getIndex();
  if (!index.some(e => e.name === "Witch Hunter")) throw new Error("the classes pack holds no Witch Hunter: run packs:parse and rebuild the packs");
}

/**
 * A Human Witch Hunter at a level, its Tome holding these types and these Studied, its formulas known (a FLAT list,
 * which `chooseFormulas({picks})` takes), its talents at their ranks and its Energy full.
 */
export async function hunterWith(name, { level = 10, ranks = {}, weapons = [], armor = [], known = ["undead", "beast", "humanoid"], studied = ["humanoid"],
  formulas = null, abilities = { str: 16, dex: 14, con: 14, int: 16, wis: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [["Witch Hunter", level]], race: "Human", weapons, armor, abilities });
  await actor._talentGrant;
  await until(() => tempoOf(actor) && energyOf(actor), "the Tempo and Energy pools");
  await actor.setFlag(SCOPE, TOME_FLAG, { known, studied, damaged: [], defeated: [], learned: false, learnOpen: null, started: true });
  if (formulas) {
    if (!Array.isArray(formulas)) throw new Error("hunterWith takes formulas as a flat list of identifiers");
    await (await import("../effects/witch-hunter-brews.mjs")).chooseFormulas(actor, { picks: [...formulas] });
  }
  for (const [identifier, taken] of Object.entries(ranks)) await atRank(actor, identifier, taken);
  const energy = energyOf(actor);
  if (energy && energy.value !== energy.max) await fill(actor, "power", "energy", energy.max);
  await settle();
  return actor;
}

/** A talent of the four branches set to a rank, waited for. */
export async function atRank(actor, identifier, taken) {
  const talent = await until(() => talentOf(actor, identifier), `${identifier} embedded`);
  if (talent.system?.taken !== taken) await talent.update({ "system.taken": taken });
  await until(() => talentOf(actor, identifier)?.system?.taken === taken, `${identifier} at rank ${taken}`);
  await settle();
}

/** A pool set by a GM's hand. */
export async function fill(actor, kind, name, value) {
  const pool = actor.poolSnapshot().find(p => p.kind === kind && p.name === name);
  await actor.updatePool({ itemId: pool.itemId, kind, value });
  await until(() => actor.poolSnapshot().find(p => p.kind === kind && p.name === name)?.value === value, `${value} ${name}`);
}

/** Equip a weapon by name, in two hands where it is Versatile or two-handed. */
export async function equip(actor, name) {
  const weapon = actor.items.find(i => i.type === "weapon" && i.name === name);
  await weapon.update({ "system.equipped": true, "system.offHand": false });
  await settle();
  return actor.items.get(weapon.id);
}

/** Wear a suit by name. */
export async function wear(actor, name) {
  const suit = actor.items.find(i => i.type === "armor" && i.name === name);
  await suit.update({ "system.equipped": true });
  await settle();
  return actor.items.get(suit.id);
}

/** A hostile creature from the bestiary, its own unlinked token on the viewed scene. */
export async function foeAt(scene, name, x, y, update = null) {
  const base = await makeNpc(name);
  if (update) await base.update(update);
  const [doc] = await scene.createEmbeddedDocuments("Token", [await tokenData(base, { x, y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
  await until(() => tokenDrawn(doc.object), `${name}'s token drawn`);
  return doc;
}

/** A brew from the gear pack on an actor, as though `maker` brewed it at a generation. */
export async function brewFor(actor, identifier, { maker = actor, doses = 1, type = null, school = null, generation = 0 } = {}) {
  const item = await give(actor, brewOf(identifier).name, PACK_FOR.equipment);
  const spellDC = (await import("../effects/witch-hunter-brews.mjs")).whSpellDC(maker);
  await item.update({ "system.quantity": doses, [`flags.${SCOPE}.whBrewed`]: { maker: maker.uuid, generation, brewed: doses, type, school, spellDC, tier: maker.system?.tier ?? 1 } });
  return actor.items.get(item.id);
}

/** Press the Hunter panel's own Use for one brew, the roll dialog skipped and the die pinned; the card. */
export async function pressBrewUse(actor, item, { face = 10, targets = [] } = {}) {
  if (canvas?.scene || targets.length) canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-action="whUseBrew"][data-item-id="${item.id}"]`);
  if (!control) throw new Error(`the Hunter panel draws no Use for ${item.name}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && ["whBrewUse", "feature"].includes(m.flags?.[SCOPE]?.kind))
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    unpin();
    if (canvas?.scene) canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Every line a roll dialog draws, read off its own checkboxes: `[{name, checked, disabled, text}]`. */
export function readLines(dialog) {
  return [...dialog.element.querySelectorAll('input[type="checkbox"][name^="line-"], input[type="checkbox"][name^="tline-"]')].map(b => ({
    name: b.name, checked: b.checked, disabled: b.disabled, text: (b.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim()
  }));
}

/** The first line whose words match, or null. */
export const lineMatching = (lines, pattern) => lines.find(l => pattern.test(l.text)) ?? null;

/**
 * **OPEN THE DIALOG A CONTROL OPENS, READ IT, AND ROLL OR CLOSE IT** (the roll dialog set to "always"): `press` clicks
 * the control; `roller` is the actor whose dialog opens (a creature resisting, the hunter attacking); `roll` presses
 * the dialog's own Roll with the die pinned to `face` and answers the card it posts.
 *
 * @returns {Promise<{lines: object[], card: ChatMessage|null}>}
 */
export async function throughDialog(roller, press, { roll = false, face = 10, tick = [], cardFrom = null } = {}) {
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
  const unpin = roll ? pinDie(face) : () => {};
  try {
    await press();
    const dialog = await dialogFor(roller, 10000);
    if (!dialog) throw new Error(`${roller.name}'s roll dialog did not open`);
    const lines = readLines(dialog);
    for (const name of tick) {
      const box = dialog.element.querySelector(`input[name="${name}"]`);
      if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    if (!roll) {
      await dialog.close();
      return { lines, card: null };
    }
    const posted = untilHook("createChatMessage", 30000, m => m.rolls?.length && (cardFrom ? cardFrom(m) : true))
      .then(([m]) => { made.push(m); return m; }).catch(() => null);
    const button = dialog.element.querySelector('button[data-action="roll"]');
    await until(() => !button.disabled, "the Roll button enabled", 5000);
    button.click();
    return { lines, card: await posted };
  } finally {
    unpin();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  }
}

/**
 * Open the attack dialog from the Combat tab, read it, optionally roll it, the die pinned: `{lines, card}`, every line
 * by its checkbox, and the FIRST card the Attack posts where `roll` (Extra Attack's second card follows it).
 */
export async function attackFrom(actor, weapon, targets = [], { face = 20, roll = true, tick = [] } = {}) {
  const sheet = await openSheet(actor);
  canvas.tokens.setTargets(targets.map(t => t.id));
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    const control = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`);
    if (!control) throw new Error(`the Combat tab draws no attack for ${weapon.name}`);
    const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
    const unpin = roll ? pinDie(face) : () => {};
    try {
      control.click();
      const dialog = await dialogFor(actor, 8000);
      if (!dialog) throw new Error("the attack dialog did not open");
      const lines = readLines(dialog);
      for (const name of tick) {
        const box = dialog.element.querySelector(`input[name="${name}"]`);
        if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      if (!roll) {
        await dialog.close();
        return { lines, card: null };
      }
      const select = dialog.element.querySelector('select[name="extraWeapon"]');
      if (select && !select.value) {
        const first = [...select.options].find(o => o.value && !o.disabled);
        if (first) { select.value = first.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      // **EXTRA ATTACK'S SECOND ROLL IS HELD TO THE SAME PIN** (02 §6, D-704): one Attack, two cards, and the second
      // is rolled after the first card stands. The die stays pinned until the second card has posted too, or a test
      // reading the first roll's SL would meet a second roll on a random face.
      const cards = [];
      const hook = Hooks.on("createChatMessage", m => {
        if (m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack") cards.push(m);
      });
      try {
        const button = dialog.element.querySelector('button[data-action="roll"]');
        await until(() => !button.disabled, "the Roll button enabled", 5000);
        button.click();
        await until(() => cards[0], "the attack's card", 30000);
        if (actor.items.some(i => i.type === "feature" && i.name === "Extra Attack")) {
          await until(() => cards[1], "Extra Attack's second card", 8000).catch(() => null);
        }
      } finally {
        Hooks.off("createChatMessage", hook);
      }
      made.push(...cards);
      return { lines, card: cards[0], second: cards[1] ?? null };
    } finally {
      unpin();
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    }
  } finally {
    canvas.tokens.setTargets([]);
    await sheet.close();
  }
}

/** Press the board where a pick waits, at a point in canvas pixels. */
export function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/**
 * A Sign used from the sheet's own Use: the chooser's pick by its label (an Empowered line by its own words), a cone's
 * aim or the Ash ring's point where it asks one; the card.
 */
export async function useSign(actor, feature, sign, { targets = [], aim = null, point = null, empower = false } = {}) {
  const { feature: item, card } = await pressUse(actor, feature, targets);
  // `judgeSign` opens the one chooser only where there is more than one row: **Signs** names three, and **Greater
  // Signs** gives every Sign an Empowered row; the Ash Sign or the Lull Sign alone is one row and asks nothing.
  const asks = feature === "Signs" || actor.items.some(i => i.type === "feature" && i.name === "Greater Signs");
  if (asks) await pickSign(await chooser(item), sign, { empower });
  if (aim) {
    await until(() => pickState()?.mode === "facing", `${SIGNS[sign].name}'s aim`);
    pressBoard(aim);
  }
  if (point) {
    await until(() => pickState()?.mode === "point", `${SIGNS[sign].name}'s point`);
    pressBoard(point);
  }
  return card;
}

/**
 * Pick a Sign in the one chooser by its row's own words (`AZEROTH.WhSign.Option`, *Gale Sign (3 Energy)*, and
 * `OptionEmpowered`, *Gale Sign, Empowered (5 Energy)*): the plain row starts with the name and a parenthesis, the
 * Empowered row with the name and *, Empowered*.
 */
export async function pickSign(app, sign, { empower = false } = {}) {
  const name = SIGNS[sign].name;
  const prefix = empower ? `${name}, ${game.i18n.localize("AZEROTH.WhSign.OptionEmpowered").split(",")[1]?.trim().split(" ")[0] ?? "Empowered"}` : `${name} (`;
  const select = app.element.querySelector("#azeroth-choose-select");
  if (!select) return pick(app, prefix);
  const option = [...select.options].find(o => o.textContent.trim().startsWith(prefix));
  if (!option) throw new Error(`the chooser offers no row starting "${prefix}": ${[...select.options].map(o => o.textContent.trim()).join(" | ")}`);
  if (option.disabled) throw new Error(`the chooser greys "${option.textContent.trim()}"`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** Press a feature card's Resist for a row, the dialog skipped and the die pinned; the Resilience card. */
export async function resistOn(card, index, face) {
  const posted = untilHook("createChatMessage", 30000, m => m.rolls?.length && m.id !== card.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
  const { release } = await pressCard(card, `button[data-action="resistTest"][data-target-index="${index}"]`, { face });
  try { return await posted; } finally { await release(); }
}

/** A card's Resist for a row, through its OWN roll dialog: the lines it draws, and the roll where asked. */
export async function resistDialog(card, selector, resister, { roll = false, face = 10 } = {}) {
  return throughDialog(resister, async () => {
    await pressCard(card, selector, { skip: false });
  }, { roll, face, cardFrom: m => m.id !== card.id });
}

/**
 * A creature's attack row at a target, the dialog skipped and the die pinned, with no turn budget spent (the attack is
 * the scene's setup; the control under test is the defender's): the attack card.
 */
export async function npcSwing(foe, target, face = 20) {
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  canvas.tokens.setTargets([target.id]);
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === foe.id && m.flags?.[SCOPE]?.kind === "attack")
    .then(([m]) => { made.push(m); return m; });
  try {
    await npcAttackWithDialog(foe, 0, null, { budget: "none" });
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  }
}

/** Press a maneuver's Use on the Combat tab; the maneuver card. */
export async function pressManeuver(actor, key) {
  const sheet = await openSheet(actor);
  try {
    const control = sheet.element.querySelector(`section[data-tab="combat"] [data-action="useManeuver"][data-maneuver="${key}"]`);
    if (!control) throw new Error(`the Combat tab draws no ${key}`);
    if (control.disabled) throw new Error(`the Combat tab greys ${key}`);
    const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "maneuver")
      .then(([c]) => { made.push(c); return c; });
    control.click();
    return await posted;
  } finally {
    await sheet.close();
  }
}

/** The brewing window opened as a rest opens it (`witchHunterRest`, the rest's own door). */
export async function openBrewing(actor, kind = "short") {
  const { witchHunterRest } = await import("../effects/witch-hunter-brews.mjs");
  await witchHunterRest(actor, kind, { generation: Number(actor.getFlag(SCOPE, "restGeneration")) || 0, gains: [] });
}

/** The Prepare window opened from the Hunter panel's own Prepare (found by the id the window gives itself). */
export async function openPrepare(actor) {
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector('section[data-tab="combat"] [data-action="whPrepare"]');
  if (!control) throw new Error("the Hunter panel draws no Prepare (is the brewing window open?)");
  control.click();
  const id = `azeroth-brew-prepare-${actor.id}`;
  const app = await until(() => {
    const found = foundry.applications.instances.get(id);
    return found?.rendered ? found : null;
  }, "the Prepare window");
  return { app, sheet };
}

/** A character of another class, for a target or an ally. */
export async function plainCharacter(name, cls = "Warrior", level = 5) {
  return makeCharacter({ name, classes: [[cls, level]], race: "Human" });
}

/**
 * Characters of The Party (D-658). **Out of a fight an ALLY is a Party member** (D-755,
 * `rules/distance.mjs#countsAsAlly`): a friendly token alone is not one, so the Rowan Sign and the Medallion's warning
 * refuse an ally that is not in the Party (found in wave 4's live run; the Chromatic batch's `partyOf` shape).
 */
export async function partyOf(...actors) {
  for (const a of actors) await a.setParty(true);
  await until(() => actors.every(a => a.isParty), "the Party marked");
}

export { until, pressCard, pressUse, chooser, pick, settle };
