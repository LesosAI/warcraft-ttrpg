/**
 * **WHAT THE CHRONOMANCER'S TWO BATCHES SHARE** (stage 2b): a viewed scene with linked tokens,
 * a started fight, a Chronomancer with its Hourglass in the Ranged slot and its Mana full,
 * the sheet's own Use control pressed (`featureAims` hands it the creatures targeted - D-774's
 * rule that a Quench test must press the sheet), the one chooser answered, the ask a Reaction
 * in another's Test opens answered, and a turn moved forward.
 */

import { made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, or say what was being waited for. */
export async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

export const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
export const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
export const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
export const sandOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "sand") ?? null;
export const manaOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana") ?? null;
export const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
export const textOf = message => parsed(message).body.textContent.replace(/\s+/g, " ");

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
export async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Chronomancer Scene", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(tokenOf(p.actor))), "every token drawn");
  await settle();
  return scene;
}

/** A started fight holding these actors. */
export async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id, sceneId: canvas.scene?.id, tokenId: tokenOf(a)?.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's budget", 30000);
  return combat;
}

/** Move a fight forward to this actor's turn, so its turn's start runs. */
export async function turnForward(combat, actor) {
  const mine = combat.getCombatantsByActor(actor)[0];
  for (let i = 0; i <= combat.turns.length + 1 && combat.combatant?.id !== mine.id; i++) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.nextTurn();
    await settled;
  }
  await settle();
}

/** The Half-Actions a spell's Action spends (05's ladder): a Half-Action 1, an action or a Full Action 2. */
export const halvesOf = spell => ({ half: 1, action: 2, full: 2 })[spell?.system?.action] ?? 0;

/**
 * **A CAST IN A FIGHT IS MADE ON THE CASTER'S OWN TURN, WITH THE HALF-ACTIONS IT SPENDS** (05,
 * D-659; the live fix): `castSpell` refuses *It is not your turn* off the caster's turn and
 * refuses a spent budget, and `fightWith` opens on whichever side the order puts first. Where
 * the actor is in a started fight, the turn is moved to it - a whole round on where its own
 * turn has too few Half-Actions left - so the cast after this has `halves` to spend. Out of
 * a fight it does nothing.
 *
 * @param {Actor} actor
 * @param {number} halves
 */
export async function freshTurn(actor, halves = 2) {
  const combat = actor?.activeFight?.() ?? null;
  if (!combat || !(halves > 0)) return null;
  const mine = combat.getCombatantsByActor(actor)[0];
  const enough = () => combat.combatant?.id === mine.id && (mine.budget?.halfActions ?? 0) >= halves;
  if (enough()) return mine;
  if (combat.combatant?.id === mine.id) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.nextTurn();
    await settled;
  }
  await turnForward(combat, actor);
  await until(enough, `${actor.name}'s turn with ${halves} Half-Actions`, 30000);
  return mine;
}

/**
 * A Chronomancer at a level, its Hourglass in the Ranged slot, its Mana full, and these
 * talents taken at these ranks. `sand` fills the pool once the glass is on.
 */
export async function chronomancerWith(name, { level = 20, ranks = {}, spells = [], sand = 0, abilities = { int: 18, con: 14 }, rarity = "epic" } = {}) {
  const c = await makeCharacter({ name, classes: [["Chronomancer", level]], race: "Gnome", spells, bags: ["Hourglass"], abilities });
  await c._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(c, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  const glass = await until(() => c.items.find(i => i.name === "Hourglass"), "the Hourglass carried");
  await glass.update({ "system.rarity": rarity, "system.equipped": true });
  await until(() => (sandOf(c)?.max ?? 0) > 0, "the Sand cap");
  const mana = await until(() => manaOf(c), "the Mana pool");
  await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  if (sand > 0) {
    const pool = sandOf(c);
    await c.updatePool({ itemId: pool.itemId, kind: "momentum", value: Math.min(pool.max, sand) });
  }
  return c;
}

/**
 * Press the feature's Use on the sheet's Combat tab at the tokens targeted, the roll dialog
 * skipped and the die pinned. Answers the pending card, so a chooser or a pick the Use opens
 * may be answered before it is awaited.
 */
export async function pressUse(actor, featureName, targets = [], face = 15) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
    ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${featureName}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  control.click();
  const done = async () => {
    try { return await posted; } finally {
      unpin();
      canvas.tokens?.setTargets([]);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      await sheet.close();
    }
  };
  return { feature, card: done() };
}

/** The one chooser, opened for this item. */
export async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/** Pick an option by name in the chooser and press its button. */
export async function pick(app, name) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(name));
    if (!option) throw new Error(`the chooser offers no ${name}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) box.checked = (box.closest("label")?.textContent?.trim() ?? "").startsWith(name);
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** Answer the next ask a Reaction in another's Test opens (`effects/blow-doors.mjs#confirmHere`). */
export async function answerAsk(yes = true) {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask")) ?? null, "the Reaction's question");
  app.element.querySelector(`button[data-action="${yes ? "yes" : "no"}"]`).click();
}

/* -------------------------------------------- */
/*  THE SWEEP'S HARNESS (the lead's play-test,   */
/*  2026-11-10; stage 1 of the playtest brief)   */
/* -------------------------------------------- */

/*
 * The batches before the play-test drove the doors by direct calls on one actor with pinned
 * dice, and the four faults the lead found sat BETWEEN doors: a card's button pressed after the
 * token moved, a flag that fires at a later turn's start in a started fight, a Reaction's Health,
 * a marker on the board. These helpers press the real controls - the card's own buttons in the
 * chat log, the sheet's Use and Cast, the combat tracker's Next Turn - and read the RESULT.
 */

/** The token document an actor stands on: a synthetic actor's own token, else its first on the board. */
export const tokenDocOf = actor => (actor?.isToken ? actor.token : tokenOf(actor)?.document) ?? null;

/**
 * **A CHRONOMANCER IN A STARTED FIGHT** on a viewed scene: `chronomancerWith`'s options, its
 * linked token at `at`, each creature named in `enemies` made from the bestiary as an UNLINKED
 * hostile token - what a GM drags from the compendium, and what the lead fought - and each in
 * `allies` a linked friendly character. Every token in the fight. Answers the actors, the
 * creatures' LIVE (token) actors and their token documents.
 *
 * @param {string} name
 * @param {object} [o]  `chronomancerWith`'s, plus `at`, `enemies: [{name, x, y, health}]`, `allies: [{name, classes, x, y}]`
 */
export async function chronoInFight(name, { at = { x: 800, y: 1000 }, enemies = [{ name: "Raptor", x: 1300, y: 1000 }], allies = [], ...opts } = {}) {
  const c = await chronomancerWith(name, opts);
  const friends = [];
  for (const a of allies) friends.push({ actor: await makeCharacter({ name: a.name, classes: a.classes ?? [["Warrior", 5]] }), x: a.x, y: a.y });
  const scene = await sceneWith([{ actor: c, ...at }, ...friends.map(f => ({ actor: f.actor, x: f.x, y: f.y }))]);
  const foes = [];
  for (const e of enemies) {
    const base = await makeNpc(e.name);
    if (e.health) await base.update({ "system.health.value": e.health, "system.health.max": e.health });
    const [doc] = await scene.createEmbeddedDocuments("Token", [await tokenData(base, { x: e.x, y: e.y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
    await until(() => tokenDrawn(doc.object), `${e.name}'s token drawn`);
    foes.push({ base, doc, get actor() { return doc.actor; } });
  }
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", [
    ...[c, ...friends.map(f => f.actor)].map(a => ({ actorId: a.id, sceneId: scene.id, tokenId: tokenOf(a)?.id })),
    ...foes.map(f => ({ actorId: f.base.id, sceneId: scene.id, tokenId: f.doc.id }))
  ]);
  const settled = untilHook("combatTurnChange", 60000, x => x.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(x => x.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's budget", 30000);
  await settle();
  return { c, scene, combat, foes, friends: friends.map(f => f.actor) };
}

/**
 * **PRESS A BUTTON ON A CHAT CARD AS DRAWN** - the element the render hook wired, never
 * `CARD_ACTIONS` called by hand - with the roll dialog skipped and, where a face is named,
 * the die pinned until `release()`. Refuses a disabled button in words unless allowed, so a
 * test cannot press what a player could not.
 *
 * @param {ChatMessage|string} message
 * @param {string} selector  inside the card, e.g. `button[data-action="applyDamage"][data-target-index="0"]`
 * @param {{face?: number|null, skip?: boolean, ms?: number, allowDisabled?: boolean}} [o]
 * @returns {Promise<{button: HTMLElement, release: () => Promise<void>}>}
 */
export async function pressCard(message, selector, { face = null, skip = true, ms = 20000, allowDisabled = false } = {}) {
  const id = typeof message === "string" ? message : message?.id;
  const button = await until(() => document.querySelector(`#chat [data-message-id="${id}"] ${selector}`)
    ?? document.querySelector(`[data-message-id="${id}"] ${selector}`), `the card's ${selector}`, ms);
  if (button.disabled && !allowDisabled) throw new Error(`the card's ${selector} is disabled: ${button.textContent.replace(/\s+/g, " ").trim()}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  if (skip) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = face ? pinDie(face) : () => {};
  button.click();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    unpin();
    if (skip) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  };
  return { button, release };
}

/** A card's button as drawn now, or null: for reading its words and whether it is greyed. */
export const cardButton = (message, selector) => document.querySelector(`#chat [data-message-id="${message?.id ?? message}"] ${selector}`)
  ?? document.querySelector(`[data-message-id="${message?.id ?? message}"] ${selector}`);

/** Answer a Reaction's ask if one opens within `ms`; answers whether one did. */
export async function answerAskIfAny(yes = false, ms = 4000) {
  try {
    const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask")) ?? null, "an ask", ms);
    app.element.querySelector(`button[data-action="${yes ? "yes" : "no"}"]`).click();
    return true;
  } catch { return false; }
}

/**
 * **MOVE THE FIGHT ON WITH THE TRACKER'S OWN NEXT TURN** until it is this creature's turn, so
 * every turn end and turn start between runs exactly as at the table. Falls back to
 * `combat.nextTurn()` only where the tracker is not drawn for this fight.
 *
 * @param {Actor|Combatant} who  an actor (its combatant in the fight) or a combatant
 * @param {Combat} [combat]
 */
export async function nextTurnUntil(who, combat = game.combat) {
  const mine = who?.documentName === "Combatant" ? who
    : combat.combatants.find(x => x.actor === who || x.actor?.id === who?.id || x.token?.actor === who) ?? null;
  if (!mine) throw new Error(`${who?.name ?? "the creature"} is not in the fight`);
  for (let i = 0; i <= combat.turns.length + 1 && combat.combatant?.id !== mine.id; i++) {
    const settled = untilHook("combatTurnChange", 60000, x => x.id === combat.id);
    const control = ui.combat?.viewed?.id === combat.id ? ui.combat.element?.querySelector('button[data-action="nextTurn"]') : null;
    if (control && !control.disabled) control.click();
    else await combat.nextTurn();
    await settled;
  }
  if (combat.combatant?.id !== mine.id) throw new Error(`the fight never reached ${mine.name}'s turn`);
  await settle();
  return mine;
}

/**
 * **WHAT THE WORLD SAYS NOW**, for a sweep's record: each actor's Health, statuses, effects
 * with their spans and token position, and the Regions on the scene with the system flags they
 * carry and their behaviors. Sorted, so two reads compare.
 *
 * @param {{actors?: Actor[], scene?: Scene}} [o]
 */
export function boardRead({ actors = [], scene = canvas?.scene ?? null } = {}) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  return {
    actors: actors.filter(Boolean).map(a => {
      const t = tokenDocOf(a);
      return {
        name: a.name, health: a.system?.health?.value ?? null, temp: a.system?.health?.temp ?? 0,
        statuses: [...(a.statuses ?? [])].sort(),
        effects: [...(a.effects ?? [])].map(e => ({ id: e.id, name: e.name, statuses: [...(e.statuses ?? [])].sort(), rounds: e.duration?.rounds ?? null, seconds: e.duration?.seconds ?? null, flags: Object.keys(e.flags?.["azeroth-rpg"] ?? {}).sort() })).sort(byName),
        token: t ? { x: t.x, y: t.y, elevation: t.elevation } : null
      };
    }),
    regions: [...(scene?.regions ?? [])].map(r => ({ id: r.id, name: r.name, flags: Object.keys(r.flags?.["azeroth-rpg"] ?? {}).sort(), behaviors: r.behaviors?.size ?? 0, shapes: r.shapes?.length ?? 0 })).sort(byName)
  };
}

/**
 * **CAST FROM THE SHEET'S OWN CAST BUTTON** at the tokens targeted. With `lines` the roll dialog
 * is opened and those talent lines ticked (`tline-<identifier>`) before its Roll is pressed;
 * without, it is skipped. Answers the spell's card, or null where the cast was refused.
 *
 * @param {Actor} actor
 * @param {string} spellName
 * @param {{targets?: Token[], face?: number, lines?: string[], ms?: number}} [o]
 */
export async function castFromSheet(actor, spellName, { targets = [], face = 15, lines = null, ms = 30000 } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
    ?? sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  if (!control) throw new Error(`the sheet draws no Cast for ${spellName}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, lines ? "always" : "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    if (lines) {
      const dialog = await until(() => {
        const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
        return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
      }, `${spellName}'s roll dialog`);
      for (const id of lines) {
        const box = dialog.element.querySelector(`input[name="tline-${id}"]`);
        if (!box) throw new Error(`the dialog draws no line ${id}`);
        if (box.disabled) throw new Error(`the dialog's line ${id} is greyed`);
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
      dialog.element.querySelector('button[data-action="roll"]').click();
    }
    return await posted;
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}
