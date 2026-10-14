/**
 * Fixture factory and the use-test helpers for the Quench batches.
 *
 * FOUNDRY-DEPENDENT - this runs inside a live world and nowhere else. It
 * generalises the `build()` helper the multiclass batch grew, so every batch
 * draws the same real documents from the same packs and tears them down the
 * same way.
 *
 * The rules this file exists to enforce, each learned the hard way:
 *
 * - MATCH BY NAME, NEVER BY RETURN ORDER. `createEmbeddedDocuments` makes no
 *   promise about order, and `contents[0]` draws a different document each run.
 * - RESTORE WHAT WAS HELD, NEVER A CONSTANT. A test that set a side to
 *   "friendly" regardless of what it found left the enemy on the party's side
 *   for the next test, which then failed for a reason that was not its own.
 * - ONE DELETE, NOT N. Mocha's 2s hook default is not enough for a batch's
 *   teardown once it holds more than a handful of documents.
 * - AWAIT A HOOK, NEVER A SLEEP. A drop or a click is async and the event
 *   dispatch does not await the handler; `untilHook` is the only honest wait.
 */

// The passes a batch's teardown waits out before it deletes a scene (the
// full-suite fix of D-757): the area queue, the aura latch, the arrival waits.
import { areasIdle, areasOwed } from "../canvas/sustained-areas.mjs";
import { aurasBusy, aurasIdle } from "../effects/auras.mjs";
import { arrivalsIdle, arrivalsPending } from "../canvas/arrival.mjs";

/** Every document a batch made, deleted together in `after`. */
export const made = [];

/**
 * Whether a document is still there to be deleted: its ROOT is still in the
 * collection that holds it.
 *
 * A bound creature the system deleted with its encounter, and an embedded item
 * whose actor went first, are both gone before `cleanup` reaches them.
 */
function stillThere(doc) {
  let root = doc;
  while (root?.parent) root = root.parent;
  const id = root?.id ?? null;
  if (!id) return true;
  return root.collection?.has?.(id) ?? true;
}

/**
 * Delete everything in `made`. Call from a batch's `after` with a long timeout.
 *
 * **A DELETE THE SERVER REFUSES IS NOT SILENT, EVEN WHEN THE PROMISE IS
 * CAUGHT.** Core raises `ui.notifications.error` for the refusal first, and
 * `Notifications#fetch` prints a queued one to the console when it is finally
 * *shown* - which, at four active and five seconds each, can be minutes and
 * several batches later. *The Actor &lt;id&gt; does not exist in actors* then arrives
 * during whatever happens to be running, and the smoke suite fails a run for a
 * teardown that went wrong somewhere else entirely. The bound batch registers
 * creatures the system itself deletes at the end of an encounter, which is
 * where these came from (2026-09-10). Ask only for what is still there.
 */
export async function cleanup() {
  for (const doc of made.splice(0)) {
    // A class grants its talents after the link lands; deleting the actor
    // under that create makes the server log a refusal (D-610). Wait for it.
    await doc._talentGrant?.catch?.(() => {});
    if (!stillThere(doc)) continue;
    await doc.delete().catch(() => {});
  }
}

/** A rendered element is not a laid-out one. Two frames, then measure. */
export const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * Record every `ui.notifications.warn` while `fn` runs, and say nothing.
 *
 * **A REFUSAL IS SAID IN WORDS** (D-737), so a test that expects one has to
 * read it rather than watch for a side effect that never happens. Swallowed
 * rather than passed through: core QUEUES a notification and prints it to the
 * console when it is finally shown, which can be minutes and several batches
 * later (`cleanup` above says why that matters).
 *
 * The restore puts the PROTOTYPE's method back rather than leaving an own
 * copy on the instance, which would outlive the batch.
 */
export async function warnings(fn) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  const said = [];
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    await fn();
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  return said;
}

/**
 * Record every `ui.notifications.error` while `fn` runs, and say nothing:
 * `warnings`' twin, for a test asserting that a write the SERVER would refuse
 * was never sent. Core raises the refusal as an error notification however the
 * promise is caught, and prints it to the console only when it is shown.
 */
export async function errorsDuring(fn) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "error");
  const held = ui.notifications.error;
  const said = [];
  ui.notifications.error = (...args) => { said.push(String(args[0]?.message ?? args[0] ?? "")); return null; };
  try {
    await fn();
  } finally {
    if (own) ui.notifications.error = held;
    else delete ui.notifications.error;
  }
  return said;
}

/**
 * **LET EVERY PASS OF OURS THAT IS OWED RUN, BEFORE A SCENE GOES** (the
 * full-suite fix of D-757, 2026-09-26). The arrival waits a move started, the
 * area queue (sweeps, the ground, the leavers, a first entry, a growth) and the
 * aura pass all write AFTER whatever started them; a batch that deletes its
 * scene with one still owed has that write reach the server after the scene
 * has gone. Each can start another, so the three are drained until one round
 * finds all three idle - and a round that never comes is a fault, said here
 * rather than left to time a teardown out.
 */
export async function drainAreaWork() {
  for (let round = 0; round < 20; round++) {
    await arrivalsIdle();
    await areasIdle();
    await aurasIdle();
    await settle();
    if (!arrivalsPending() && !areasOwed() && !aurasBusy()) return;
  }
  throw new Error("the area, aura and arrival passes did not settle in twenty rounds");
}

/**
 * Resolve when a hook fires, or reject after `ms`. The *result* of the hook
 * is what the test asserts; the wait itself is not the assertion.
 */
export function untilHook(name, ms = 5000, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const id = Hooks.on(name, (...args) => {
      if (!predicate(...args)) return;
      Hooks.off(name, id);
      clearTimeout(timer);
      resolve(args);
    });
    const timer = setTimeout(() => {
      Hooks.off(name, id);
      reject(new Error(`hook "${name}" did not fire within ${ms}ms`));
    }, ms);
  });
}

/** A named document from a pack, or a clear error naming what was asked for. */
export async function fromPack(packId, name) {
  const pack = game.packs.get(packId);
  if (!pack) throw new Error(`no pack ${packId}`);
  const index = await pack.getIndex();
  const entry = index.find(e => e.name === name);
  if (!entry) throw new Error(`${packId} holds no "${name}"`);
  return pack.getDocument(entry._id);
}

/**
 * The first pack document matching a predicate on its index entry.
 *
 * **THE INDEX MAY CARRY NO `system` AT ALL.** `getIndex()` answers the
 * declared index fields alone, and a predicate reading `d.system.school`
 * throws a `TypeError` on a pack nothing has primed with
 * `getIndex({fields})`. The two Augment tests that do exactly that passed in
 * the whole suite - another batch had asked for the fields first - and failed
 * with *Cannot read properties of undefined* when their batch was run alone
 * (2026-09-20). A batch that cannot be run by itself is a trap, so the
 * predicate is guarded and the documents are the fallback.
 */
export async function firstFromPack(packId, predicate = () => true) {
  const pack = game.packs.get(packId);
  if (!pack) throw new Error(`no pack ${packId}`);
  const safe = entry => { try { return predicate(entry); } catch { return false; } };
  const index = await pack.getIndex();
  const entry = index.find(safe);
  if (entry) return pack.getDocument(entry._id);
  const found = (await pack.getDocuments()).find(safe);
  if (!found) throw new Error(`${packId} holds nothing matching`);
  return found;
}

/** Which pack holds each Item subtype; the rest are synthetic. */
export const PACK_FOR = Object.freeze({
  race: "azeroth-rpg.races", class: "azeroth-rpg.classes", career: "azeroth-rpg.careers",
  talent: "azeroth-rpg.talents", legacy: "azeroth-rpg.legacies", spell: "azeroth-rpg.spells",
  weapon: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor", trait: "azeroth-rpg.traits",
  gear: "azeroth-rpg.affixes",
  // 08 §9 to §17 and §20 (D-632); `gear` above is the affix pool the fixtures always embedded.
  equipment: "azeroth-rpg.gear"
});

/**
 * A character built from real pack documents.
 *
 * `classes` writes `system.classes[]` directly UNTIL the class-drop hook lands
 * (plan Phase 1); after that, prefer `viaDrop: true` so the fixture exercises
 * the door a player uses. Both stay available - a migration-era world may hold
 * entries no drop created.
 */
/**
 * What a batch of embeds asked for and did not get.
 *
 * **A REFUSED EMBED IS SILENT** (D-737): `AzerothItem._preCreateOperation`
 * splices a document with no bag slot out of the batch, so
 * `createEmbeddedDocuments` resolves with fewer documents than it was handed
 * and nothing throws. A fixture that proceeded would be testing a character
 * holding less than the test asked for, and the failure would land three
 * assertions later on something that did nothing wrong.
 */
function missingFrom(asked, made) {
  const held = new Map();
  for (const doc of made) held.set(doc.name, (held.get(doc.name) ?? 0) + 1);
  const short = [];
  for (const data of asked) {
    const left = held.get(data.name) ?? 0;
    if (left > 0) held.set(data.name, left - 1);
    else short.push(data.name);
  }
  return short;
}

/** Throw naming what a create did not make, or hand the documents back. */
function orThrow(asked, made, who) {
  const short = missingFrom(asked, made);
  if (short.length) {
    throw new Error(`${who} was refused ${short.length} embed(s): ${short.join(", ")}`
      + " — no bag slot for it (08 §11, D-737). Wear a container, or ask for less.");
  }
  return made;
}

export async function makeCharacter({
  name = "ZZ Quench Character",
  classes = [],          // [["Warrior", 5], ["Rogue", 3]]
  career = null,         // "Watchman"
  race = null,           // "Orc"
  spells = [], weapons = [], armor = [], gear = [], talents = [],   // names
  bags = [],             // names from the equipment pack: worn BEFORE the rest
  corruption = {},       // {fel: 5, void: 0, undeath: 0}
  conditions = [],       // status ids
  xp = null,             // {earned, spent}
  skillRanks = null,     // {athletics: 3}
  abilities = null,      // {str: 16}
  viaDrop = false
} = {}) {
  const actor = await Actor.create({ name, type: "character" });
  made.push(actor);

  // **THE BAGS GO ON FIRST, IN THEIR OWN BATCH** (D-736). A batch cannot place
  // into a container born in the same batch: `admit` judges every newcomer
  // against the ledger of what the character ALREADY holds, so a backpack
  // created beside twenty things adds no wells to the judgement that houses
  // them. Nor may a container be created already equipped and expect its
  // place: `ledger` reads the bar off what is stored.
  if (bags.length) {
    const carried = [];
    for (const n of bags) carried.push((await fromPack(PACK_FOR.equipment, n)).toObject());
    const holders = orThrow(carried, await actor.createEmbeddedDocuments("Item", carried), name);
    await actor.updateEmbeddedDocuments("Item", holders.map(h => ({ _id: h.id, "system.equipped": true })));
    for (const holder of holders) {
      if (holder.system?.equipped !== true) throw new Error(`${name} could not wear ${holder.name}`);
    }
  }

  const embed = [];
  const named = [];
  for (const [n] of classes) { embed.push((await fromPack(PACK_FOR.class, n)).toObject()); named.push(n); }
  if (career) embed.push((await fromPack(PACK_FOR.career, career)).toObject());
  if (race) embed.push((await fromPack(PACK_FOR.race, race)).toObject());
  for (const [packId, names] of [[PACK_FOR.spell, spells], [PACK_FOR.weapon, weapons],
    [PACK_FOR.armor, armor], [PACK_FOR.gear, gear], [PACK_FOR.talent, talents]]) {
    for (const n of names) embed.push((await fromPack(packId, n)).toObject());
  }
  const items = embed.length ? orThrow(embed, await actor.createEmbeddedDocuments("Item", embed), name) : [];

  // A class brings its thirty-six talents with it, after the link update
  // lands. Wait for them here so no test sees the sheet re-render under it.
  if (classes.length) {
    const want = 36 * classes.length;
    // Class talents only: a race's eight land on the same chain (D-620) and
    // would otherwise satisfy the count before the class's had arrived.
    for (let i = 0; i < 200 && actor.items.filter(t => t.type === "talent" && !t.system?.race).length < want; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  if (race) {
    for (let i = 0; i < 200 && actor.items.filter(t => t.type === "talent" && t.system?.race === race).length < 8; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  const update = {};
  if (classes.length && !viaDrop) {
    update["system.classes"] = classes.map(([n, level]) => ({
      itemId: items.find(i => i.name === n && i.type === "class").id,
      level,
      power: { value: 0 },
      momentum: { value: 0 }
    }));
  }
  for (const [track, value] of Object.entries(corruption)) update[`system.corruption.${track}`] = value;
  if (xp) { update["system.xp.earned"] = xp.earned ?? 0; update["system.xp.spent"] = xp.spent ?? 0; }
  if (abilities) for (const [k, v] of Object.entries(abilities)) update[`system.abilities.${k}.value`] = v;
  if (skillRanks) update["flags.azeroth-rpg.skillRanks"] = skillRanks;
  if (Object.keys(update).length) await actor.update(update);

  for (const id of conditions) await actor.toggleStatusEffect(id, { active: true });

  if (classes.length && !viaDrop) {
    const primary = actor.items.get(actor.system.classes[0]?.itemId);
    if (primary?.name !== classes[0][0]) throw new Error("the fixture did not put the intended class first");
  }
  return actor;
}

/** A creature from the bestiary, by name. */
export async function makeNpc(name) {
  const source = await fromPack("azeroth-rpg.bestiary", name);
  const actor = await Actor.create({ ...source.toObject(), name: `ZZ ${name}` });
  made.push(actor);
  return actor;
}

/** The first Boss in the bestiary - a Boss is any entry with a dungeon (D-528). */
export async function makeBoss() {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const docs = await pack.getDocuments();
  const boss = docs.find(d => d.system?.dungeon);
  if (!boss) throw new Error("the bestiary holds no Boss");
  const actor = await Actor.create({ ...boss.toObject(), name: `ZZ ${boss.name}` });
  made.push(actor);
  return actor;
}

/**
 * A named pack document embedded on an actor.
 *
 * **THE DEFAULT PACK IS 08 SS9 TO SS17**, not the affix pool: `makeCharacter`'s
 * own `gear:` list embeds from `PACK_FOR.gear`, which is the affix pack
 * (CLAUDE.md SS15), so a ration, a pint or a bandage has always had to be
 * embedded by hand. This is that hand, promoted out of the consumables batch
 * so the rest tests and the use tests draw their food the same way.
 *
 * @param {Actor} actor
 * @param {string} name    the document's name in the pack
 * @param {string} [packId]
 */
export async function give(actor, name, packId = PACK_FOR.equipment) {
  const doc = await fromPack(packId, name);
  const data = doc.toObject();
  const [item] = orThrow([data], await actor.createEmbeddedDocuments("Item", [data]), actor.name);
  return item;
}

/**
 * An item of a subtype: a real pack document where a pack exists, a synthetic
 * one otherwise. `owned` embeds it on an actor, which is what makes a sheet
 * editable and a spell castable.
 */
export async function itemOf(type, { owned = null, name = null } = {}) {
  const packId = PACK_FOR[type];
  let data;
  if (packId) {
    const doc = name ? await fromPack(packId, name) : await firstFromPack(packId, e => e.type === type || !e.type);
    data = doc.toObject();
  } else {
    data = { name: `ZZ Quench ${type}`, type };
  }
  if (owned) {
    const [item] = await owned.createEmbeddedDocuments("Item", [data]);
    return item;
  }
  const item = await Item.create(data);
  made.push(item);
  return item;
}

/** Render a document's sheet and wait for layout. */
export async function openSheet(doc) {
  const sheet = doc.sheet;
  await sheet.render({ force: true });
  await settle();
  return sheet;
}

/**
 * The compendium browser on a category, with its rows arrived.
 * `CategoryBrowser` renders before its data (a loading message first), so a
 * test asserting straight after `browse()` is testing the loading message.
 */
export async function browserOpen(category, filters = {}) {
  const browser = await game.system.azeroth.browser.browse({ category, filters });
  for (let i = 0; i < 100; i++) {
    if (browser.element?.querySelector(".azeroth-browser-entry")) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return browser;
}

/**
 * The control for an action, with the two things a use test asserts first:
 * that the markup carries the action, and that the app registered a handler
 * for it. An unregistered action is a silent no-op (application.mjs:1947).
 */
export function useAction(app, action, { within = null } = {}) {
  const root = within ?? app.element;
  const el = root.querySelector(`[data-action="${action}"]`);
  const registered = typeof app.options?.actions?.[action] === "function";
  return { el, registered };
}

/* -------------------------------------------- */
/*  The Gear tab as bag slots (D-738)            */
/* -------------------------------------------- */

/**
 * The Gear tab's own section on a rendered character sheet.
 *
 * Every helper below goes through this rather than through `sheet.element`,
 * because the NPC sheet draws a Gear tab too and its rows are still
 * `carried-row.hbs` (05 keeps a creature in pounds).
 */
export function gearTab(sheet) {
  return sheet?.element?.querySelector('section[data-tab="gear"]') ?? null;
}

/** One tile, by the item it draws. A taken well is NEVER this: it carries no id. */
export function gearTile(sheet, id) {
  return gearTab(sheet)?.querySelector(`.azeroth-bag-tile[data-item-id="${CSS.escape(id)}"]`) ?? null;
}

/**
 * One thing's hidden inspector card.
 *
 * **The bags come BEFORE the inspector in the DOM**, so a bare
 * `[data-item-id="X"]` finds the tile; this names the card explicitly.
 */
export function gearInspector(sheet, id) {
  return gearTab(sheet)?.querySelector(`.azeroth-bag-inspect[data-item-id="${CSS.escape(id)}"]`) ?? null;
}

/**
 * A drop zone on the Gear tab, by key.
 *
 * `"equipped"`, `"bar"`, `"mount"`, `"stable"` and `"inspector"` are the
 * `data-bag-zone` keys; `""` is the base pack's panel and an item id is the
 * panel of the bag that thing is (D-738's drop table).
 */
export function bagZone(sheet, key) {
  const tab = gearTab(sheet);
  if (!tab) return null;
  if (["equipped", "bar", "mount", "stable", "inspector"].includes(key)) {
    return tab.querySelector(`[data-bag-zone="${key}"]`);
  }
  return tab.querySelector(`.azeroth-bag-panel[data-container-id="${CSS.escape(key ?? "")}"]`);
}

/** The panel a thing's tile stands in: `""` for the base pack, else the holder's id or a zone. */
export function bagOf(sheet, id) {
  const tile = gearTile(sheet, id);
  const panel = tile?.closest(".azeroth-bag-panel") ?? null;
  if (!panel) return tile?.closest("[data-bag-zone]")?.dataset.bagZone ?? null;
  return panel.dataset.bagZone ?? panel.dataset.containerId ?? null;
}

/**
 * ONE WELL of one panel — a tile, a taken well or an empty one (the lead,
 * 2026-09-20).
 *
 * The CELL is what a drop aims at now, so a test that means *put it in well
 * twelve* has to dispatch at well twelve and not at the panel: the zone is
 * still the panel, and the well is read off the cell under the pointer.
 */
export function bagWell(sheet, key, index) {
  return bagZone(sheet, key)?.querySelector(`.azeroth-bag-grid > [data-well="${index}"]`) ?? null;
}

/** The well a thing's tile stands in, off the rendered panel. Null where it is in none. */
export function wellOfTile(sheet, id) {
  const at = gearTile(sheet, id)?.dataset.well;
  return at === undefined ? null : Number(at);
}

/**
 * Pick a thing up and hand back its card.
 *
 * **A click never re-renders** (D-738): the card is already in the DOM and is
 * only unhidden, so this returns the same element every time and a control
 * queried off it stays live. It still awaits a frame, because the class the
 * tile takes is what a shot and a geometry check measure.
 */
export async function inspect(sheet, id) {
  const tile = gearTile(sheet, id);
  if (!tile) throw new Error(`no bag tile for ${id}`);
  tile.click();
  await settle();
  return gearInspector(sheet, id);
}

/** Pin the d20 so an outcome is deterministic; returns the restore function. */
export function pinDie(face, faces = 20) {
  const original = CONFIG.Dice.randomUniform;
  // Core maps a random r in [0,1) to ceil((1 - r) * faces) (dice.mjs
  // #mapRandomFace, verified 14.367): a LOW r is a HIGH face, which is why
  // the usable batch pins to 0 for a natural 20. Face f is r in
  // [1 - f/faces, 1 - (f-1)/faces). This helper claimed the opposite for
  // its first months and nothing asserted on the face it gave.
  CONFIG.Dice.randomUniform = () => (faces - face) / faces + 0.001;
  return () => { CONFIG.Dice.randomUniform = original; };
}

/** Write back exactly what a document held before a test touched it. */
export function snapshot(doc, paths) {
  return Object.fromEntries(paths.map(p => [p, foundry.utils.getProperty(doc, p)]));
}
export async function restore(doc, snap) {
  const update = {};
  for (const [p, v] of Object.entries(snap)) update[p] = foundry.utils.deepClone(v);
  return doc.update(update);
}

/**
 * Forge the drop a browser row or a sidebar entry would produce and dispatch
 * it on a target. `DragDrop.bind` sets native `ondrop`/`ondragover` on the app
 * root (client/applications/ux/drag-drop.mjs:75-97), so a synthetic DragEvent
 * reaches `_onDrop` exactly as a real drop does. The payload mirrors what the
 * browser's `#onDragStart` writes: `{type, uuid}`.
 *
 * **`kind` is the EVENT**, so the same helper aims a `dragover` at the same
 * element a drop is aimed at (the lead, 2026-09-20: *check that all slot drag
 * in works*). Core's `_handleDragOver` is bound to the application ROOT's
 * `ondragover` (drag-drop.mjs:88, verified at 14.367), so a bubbling
 * synthetic event reaches `_onDragOver` from any descendant - which is the
 * whole point: what lights has to be what takes the drop, measured from the
 * pixel the reader is actually over.
 */
export function forgeDrop(target, data, { clientX = 0, clientY = 0, kind = "drop" } = {}) {
  const dt = new DataTransfer();
  dt.setData("text/plain", JSON.stringify(data));
  const event = new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true, clientX, clientY });
  target.dispatchEvent(event);
  return event;
}

/**
 * Drag over an element and hand back the zone that lit, or null.
 *
 * The sheet lights ONE element at a time, so the answer is a single node;
 * a test asserts on identity rather than on a class name.
 */
export function dragOver(target, data = { type: "Item", uuid: "" }) {
  forgeDrop(target, data, { kind: "dragover" });
  // Scoped to the window the target is in: another sheet left open by an
  // earlier test lights its own zones and is none of this one's business.
  const root = target.closest(".application") ?? target.ownerDocument;
  return root.querySelector(".azeroth-drop-into");
}

/**
 * **PRESS THE SCENE-CONTROL BAR CORE DRAWS, NEVER A TOOL'S `onChange`** (D-766).
 * Every test of the Measure control called `tool.onChange()` by hand and passed
 * while the bar itself fired the Circle on its own and never offered Cone or
 * Line. A control is its `button[data-action="control"]` and a tool its
 * `button[data-action="tool"]` in `#scene-controls-tools` (core's
 * `templates/ui/scene-controls-*.hbs`, 14.367); a click is what a player makes.
 */
export const controlButton = name =>
  ui.controls.element?.querySelector(`button[data-action="control"][data-control="${name}"]`) ?? null;

/** A tool's button on the bar core draws now, or null. */
export const toolButton = name =>
  ui.controls.element?.querySelector(`#scene-controls-tools button[data-action="tool"][data-tool="${name}"]`) ?? null;

/** Press a control on the bar, and wait until the bar has drawn it. */
export async function chooseControl(name, ms = 10000) {
  const button = controlButton(name);
  if (!button) throw new Error(`the bar draws no ${name} control`);
  button.click();
  const start = Date.now();
  while (!(ui.controls.control?.name === name && controlButton(name)?.getAttribute("aria-pressed") === "true")) {
    if (Date.now() - start > ms) throw new Error(`the bar never switched to ${name}`);
    await new Promise(r => setTimeout(r, 25));
  }
  await settle();
}

/** Press a tool of the control the bar is drawing. */
export function pressTool(name) {
  const button = toolButton(name);
  if (!button) throw new Error(`the bar draws no ${name} tool: it draws ${ui.controls.control?.name}'s`);
  button.click();
}

/**
 * A chat card of one kind, rendered in the log. Returns the message and the
 * card's element in `#chat-log` so geometry can measure it where it lives.
 */
/**
 * Put the fight's turn on this actor's combatant, and wait for it to land.
 *
 * **WHOSE TURN IT IS IS A RULE** (06 §1, D-720): an Off-Hand Attack is made in
 * a turn in which you Attack, so the door refuses one pressed on somebody
 * else's turn. Two combatants made with no tokens are both HOSTILE - `side`
 * reads the token's disposition and defaults hostile - so the order is
 * whichever Initiative came out higher, and a test that means to swing with
 * the off hand has to say whose turn it is rather than hope.
 *
 * Moving the turn runs core's turn events, which reset the budget; call it
 * before anything is spent.
 */
export async function giveTurn(combat, actor, ms = 60000) {
  const mine = combat.getCombatantsByActor(actor)[0];
  if (!mine) throw new Error(`${actor.name} is not in that fight`);
  const index = combat.turns.findIndex(c => c.id === mine.id);
  if (index >= 0 && index !== combat.turn) {
    const settled = untilHook("combatTurnChange", ms, c => c.id === combat.id);
    await combat.update({ turn: index });
    await settled;
  }
  for (let i = 0; i < 200 && combat.combatant?.id !== mine.id; i++) await new Promise(r => setTimeout(r, 50));
  if (combat.combatant?.id !== mine.id) throw new Error(`${actor.name} never took the turn`);
  return mine;
}

/**
 * A window with a fixed id, once it has rendered its form, or null after `ms`.
 *
 * The id is the point: both dialogs name themselves after the actor so a
 * second click focuses the one that is open, and that is the only handle a
 * test has on a window nothing returned to it.
 */
async function windowById(id, ms) {
  for (let i = 0; i < ms / 50; i++) {
    const app = foundry.applications.instances.get(id);
    if (app?.rendered && app.element?.querySelector("form")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/** The actor's roll dialog once it has rendered, or null after `ms`. */
export async function dialogFor(actor, ms = 4000) {
  return windowById(`azeroth-roll-${actor.id}`, ms);
}

/**
 * The actor's Short Rest window once it has rendered, or null after `ms`
 * (05 SS16, 08 SS12; D-733). `restDialogId` writes the same id.
 */
export async function restDialogFor(actor, ms = 4000) {
  return windowById(`azeroth-rest-${actor.id}`, ms);
}

export async function cardOf(kind, actor, opts = {}) {
  const w = game.system.azeroth.workflows;
  const unpin = pinDie(opts.face ?? 15);
  let message;
  // The log renders a message on its own schedule; the card's element is what
  // renderChatMessageHTML hands the hook, so take it from there rather than
  // querying #chat-log after a guess at a delay.
  let rendered = null;
  const hookId = Hooks.on("renderChatMessageHTML", (msg, html) => {
    if (message && msg.id === message.id) rendered = html;
    else if (!message) rendered ??= null;
  });
  const pending = new Map();
  const captureId = Hooks.on("renderChatMessageHTML", (msg, html) => pending.set(msg.id, html));
  try {
    switch (kind) {
      case "attack":
        message = await w.rollTest({ actor, kind: "attack", dc: 12, title: "Quench attack",
          location: opts.location ?? "body", modifiers: [{ label: "AZEROTH.Sheet.Proficiency", value: 2 }],
          damage: { rating: 4, kind: "physical" }, ...opts.args });
        break;
      case "skill":
        message = await w.rollTest({ actor, kind: "skill", dc: 12, title: "Quench skill",
          modifiers: [{ label: "AZEROTH.Sheet.Rank", value: 1 }], ...opts.args });
        break;
      case "spell": {
        const spell = opts.spell ?? actor.items.find(i => i.type === "spell");
        // castSpell pays first (07 SS8): a pool below the cost refuses, so fill it.
        const pool = (actor.system.powers ?? []).find(p => p.name === "mana");
        if (pool && pool.value < (spell?.system?.mana ?? 0)) {
          await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
        }
        message = await w.castSpell({ actor, spell, targets: [], ...opts.args });
        break;
      }
      case "corruption":
        message = await w.corruptionExposure({ actor, track: opts.track ?? "fel", dc: opts.dc ?? 12, ...opts.args });
        break;
      case "critical":
        message = await w.rollCriticalInjury({ actor, location: opts.location ?? "body", ...opts.args });
        break;
      default:
        throw new Error(`no card kind "${kind}"`);
    }
  } finally {
    unpin();
  }
  if (message) made.push(message);
  // Give the log up to two seconds to render it, then read the card off the
  // element the hook delivered (or, failing that, off the log).
  let element = null;
  if (message) {
    for (let i = 0; i < 20 && !pending.has(message.id); i++) await new Promise(r => setTimeout(r, 100));
    const html = pending.get(message.id);
    element = html?.querySelector?.(".azeroth-card")
      ?? (html?.classList?.contains("azeroth-card") ? html : null)
      ?? document.querySelector(`#chat-log [data-message-id="${message.id}"] .azeroth-card`);
  }
  Hooks.off("renderChatMessageHTML", hookId);
  Hooks.off("renderChatMessageHTML", captureId);
  await settle();
  return { message, element };
}
