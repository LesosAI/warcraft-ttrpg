/**
 * **THE LEGACY BRANCHES' BODIES, LIVE** (the approved plan's phase B2). The seven
 * branches' talent ROWS land in phase B6, and the bestiary pack takes 14's new
 * construct blocks at the next `packs:parse`, so a door is driven here through what
 * Foundry already holds - 02's Blink, 07's Shadow Walk and Dark Passage, the
 * gnome's two racial talents (whose rows are B2's own), the summon door, the
 * combatant's queued doors and a trap Region - and B8 presses each Legacy talent
 * from the sheet's own control once its row exists:
 *
 * - door 3: Blink from the sheet's Use, the pick answered on the board and the token
 *   displaced; a pick dismissed costs nothing; Shadow Walk moves only on a success;
 *   Dark Passage moves the caster and the target together;
 * - door 4: a bound creature placed at a point, on the owner's side and in the
 *   owner's fight, with a Half-Action a turn of its own;
 * - door 6: two constructs share one turn, and a wrecked one takes no healing;
 * - door 7: Mekkatorque's Blueprint builds a gadget known with its own use and the
 *   Long Rest takes it; Overclock strikes that gadget's use; the Net-o-Matic's
 *   attack lays Entangled with its escape;
 * - door 26: a Shadow Trap's Region is sprung by the first ENEMY to enter it, never
 *   by an ally, and is gone.
 *
 * **THE B2 REVIEW'S FIXES, LIVE** (the B1 fix run, folding in the B2 review): Dark
 * Passage cast from the sheet carries the burst's allies and never the enemy targeted;
 * a summon lands on the scene its summoner stood on though the GM views another where
 * the summoner also stands; the GM's undo gives a construct's Half-Action back on the
 * tinker's record, which stands until the tinker's own turn begins; a construct whose
 * tinker is not in the fight takes the shared allowance as its own; and Overclock
 * marks a gadget, whose own next Use (pressed on the sheet) fires it and breaks it.
 *
 * Written in B2 and in the B1 fix run, and NOT run in either (the brief: offline,
 * Vitest only). Run alone with `QUENCH_BATCH=azeroth-rpg.legacy-bodies`. Every
 * document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { cancelPick, pickState } from "../canvas/place.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { bind } from "../documents/bound.mjs";
import { placeSummon } from "../documents/summon.mjs";
import { TRAP_FLAG, trapArea } from "../rules/traps.mjs";
import { BLUEPRINT_FLAG, OVERCLOCK_FLAG } from "../rules/gadgets.mjs";
import { ESCAPE_FLAG, featureEscapeRecord } from "../rules/escapes.mjs";
import { CONSTRUCT_TURN_FLAG } from "../rules/constructs.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const workflows = () => game.system.azeroth.workflows;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");

/** Fill a pool. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => poolOf(actor, name).value === pool.max, `${name} full`);
  return poolOf(actor, name);
}

/** Press the 2D board at a canvas point, as a browser does (`quench-pick-state.mjs`'s shape). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Legacy Bodies Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens?.(true)?.[0]?.document ?? null;
    return token ? { actorId: a.id, tokenId: token.id, sceneId: token.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** The chooser an item opened, once rendered. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/** Pick these options by name in the chooser, select or checklist alike, and press its button. */
async function pick(app, names) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
    if (!option) throw new Error(`the chooser offers no ${names[0]}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) {
      const label = box.closest("label")?.textContent?.trim() ?? "";
      box.checked = names.some(n => label.startsWith(n));
    }
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** A gnome with one or both of the race's tier 3 and 4 talents taken, waiting for what each grants. */
async function gnomeWith(name, talents = []) {
  const gnome = await makeCharacter({ name, race: "Gnome", classes: [["Rogue", 9]] });
  for (const t of talents) {
    const talent = await until(() => talentNamed(gnome, t), `${t} on the sheet`);
    await talent.update({ "system.taken": 1 });
  }
  for (const t of talents) await until(() => featureNamed(gnome, t), `${t}'s Use granted`);
  await settle();
  return gnome;
}

/** Build a gadget through Mekkatorque's Blueprint, answering its chooser, and wait for the gadget's own feature. */
async function blueprintGadget(gnome, gadget) {
  const blueprint = featureNamed(gnome, "Mekkatorque's Blueprint");
  const pending = workflows().useFeature({ actor: gnome, item: blueprint });
  await pick(await chooser(blueprint), [gadget]);
  const card = await pending;
  if (card) made.push(card);
  return until(() => gnome.items.find(i => i.type === "feature" && i.name === gadget && i.getFlag("azeroth-rpg", "feature")?.gadget), `${gadget} built`);
}

export function legacyBodiesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Legacy branches' bodies (B2)", function () {
    let restore = null;
    let wasViewing = null;
    let quietText = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quietText = await quietScrollingText();
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      cancelPick();
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Door 3 ------------------------------------------------------------ */

    it("DOOR 3: Blink from the sheet's own Use opens the pick, and a press within 20 feet displaces the mage there, said on the card", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ LB Blink", classes: [["Mage", 3]] });
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }]);
      const before = (await fill(mage, "mana")).value;
      const blink = await until(() => featureNamed(mage, "Blink"), "Blink granted");
      const sheet = await openSheet(mage);
      try {
        const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${blink.id}"] [data-action="useFeature"]`)
          ?? sheet.element.querySelector(`[data-item-id="${blink.id}"] [data-action="useFeature"]`);
        assert.ok(control, "the sheet draws no Use for Blink");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === mage.id);
        control.click();
        await until(() => pickState()?.mode === "point", "Blink's pick");
        assert.include(pickState().hint, "20", "the pick does not say how far");
        pressBoard({ x: 1350, y: 1050 });
        // `untilHook` resolves with the hook's arguments, the message first.
        const [card] = await posted;
        made.push(card);
        const token = mage.getActiveTokens(true)[0];
        await until(() => token.document.x === 1300 && token.document.y === 1000, "the mage displaced to the space picked");
        assert.include(textOf(card), game.i18n.format("AZEROTH.Step.Moved", { name: token.name, feet: 20, source: "Blink" }));
        await until(() => poolOf(mage, "mana").value === before - 2, "Blink's 2 Mana");
      } finally {
        await sheet.close();
      }
    });

    it("DOOR 3: a space past the reach is refused in words and the pick waits; a pick dismissed costs nothing", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ LB Blink Far", classes: [["Mage", 3]] });
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }]);
      const before = (await fill(mage, "mana")).value;
      const blink = await until(() => featureNamed(mage, "Blink"), "Blink granted");
      let result = "pending";
      const said = await warnings(async () => {
        const pending = workflows().useFeature({ actor: mage, item: blink });
        await until(() => pickState()?.mode === "point", "Blink's pick");
        pressBoard({ x: 2050, y: 1050 });
        await new Promise(r => setTimeout(r, 300));
        assert.equal(pickState()?.mode, "point", "a refused space closed the pick");
        cancelPick();
        result = await pending;
      });
      assert.isNull(result, "a dismissed pick still made the Use");
      assert.isTrue(said.some(w => w.includes(game.i18n.format("AZEROTH.Step.Refuse.Far", { name: mage.getActiveTokens(true)[0].name, feet: 20 }))), `no refusal in words: ${JSON.stringify(said)}`);
      assert.equal(poolOf(mage, "mana").value, before, "the dismissed pick spent Mana");
      const token = mage.getActiveTokens(true)[0];
      assert.equal(token.document.x, 1000, "the mage moved");
    });

    it("DOOR 3: Shadow Walk moves its caster only on a success; a failed Casting Test spends the Mana and moves nobody", async function () {
      this.timeout(180000);
      const priest = await makeCharacter({ name: "ZZ LB Shadow Walk", classes: [["Priest", 3]], spells: ["Shadow Walk"], abilities: { wis: 16 } });
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }]);
      const spell = await until(() => spellNamed(priest, "Shadow Walk"), "Shadow Walk known");
      const token = priest.getActiveTokens(true)[0];
      // A failure: the pick is made, the Mana is spent, nobody moves.
      let before = (await fill(priest, "mana")).value;
      let unpin = pinDie(1);
      try {
        const pending = workflows().castSpell({ actor: priest, spell, targets: [] });
        await until(() => pickState()?.mode === "point", "Shadow Walk's pick");
        pressBoard({ x: 1450, y: 1050 });
        const card = await pending;
        made.push(card);
        assert.include(textOf(card), game.i18n.format("AZEROTH.Step.NotCast", { name: "Shadow Walk" }));
      } finally {
        unpin();
      }
      await until(() => poolOf(priest, "mana").value === before - spell.system.mana, "the failed cast's Mana");
      assert.equal(token.document.x, 1000, "a failed Casting Test moved the priest");
      // A success: the token is displaced to the space picked.
      before = (await fill(priest, "mana")).value;
      unpin = pinDie(20);
      try {
        const pending = workflows().castSpell({ actor: priest, spell, targets: [] });
        await until(() => pickState()?.mode === "point", "Shadow Walk's pick");
        assert.include(pickState().hint, game.i18n.format("AZEROTH.Step.PickShadow", { name: token.name, feet: 30 }).slice(0, 20));
        pressBoard({ x: 1450, y: 1050 });
        const card = await pending;
        made.push(card);
        assert.include(textOf(card), game.i18n.format("AZEROTH.Step.Moved", { name: token.name, feet: 30, source: "Shadow Walk" }));
      } finally {
        unpin();
      }
      await until(() => token.document.x === 1400 && token.document.y === 1000, "the priest displaced on the success");
    });

    it("DOOR 3 AND THE B2 REVIEW'S MUST-FIX 1: Dark Passage, cast from the sheet, carries every ally within its 10 ft burst as they stood - targeted or not - and never the enemy targeted", async function () {
      this.timeout(180000);
      const priest = await makeCharacter({ name: "ZZ LB Passage", classes: [["Priest", 9]], spells: ["Dark Passage"], abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ LB Passage Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      // 07's *Each ally within 10 ft*: out of a fight an ally is the Party's (D-755).
      await priest.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }]);
      const spell = await until(() => spellNamed(priest, "Dark Passage"), "Dark Passage known");
      await fill(priest, "mana");
      const allyToken = ally.getActiveTokens(true)[0];
      const ghoulToken = ghoul.getActiveTokens(true)[0];
      // The ENEMY is the one targeted, and the ally is not.
      canvas.tokens.setTargets([ghoulToken.id]);
      const sheet = await openSheet(priest);
      const unpin = pinDie(20);
      try {
        const cast = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`);
        assert.ok(cast, "the Spells tab draws no Cast for Dark Passage");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === priest.id);
        cast.click();
        await until(() => pickState()?.mode === "point", "Dark Passage's pick");
        pressBoard({ x: 1450, y: 1250 });
        const [card] = await posted;
        made.push(card);
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const own = priest.getActiveTokens(true)[0];
      await until(() => own.document.x === 1400 && own.document.y === 1200, "the priest displaced");
      await until(() => allyToken.document.x === 1500 && allyToken.document.y === 1200, "the untargeted ally displaced beside the priest, as it stood");
      await new Promise(r => setTimeout(r, 500));
      assert.deepEqual([ghoulToken.document.x, ghoulToken.document.y], [1000, 1100], "the targeted enemy was carried with the priest");
    });

    /* ---- Door 4 ------------------------------------------------------------ */

    it("DOOR 4: a bound creature is placed at the point picked, on the owner's side and in the owner's fight, with its own one Half-Action", async function () {
      this.timeout(120000);
      const owner = await makeCharacter({ name: "ZZ LB Summoner", classes: [["Warlock", 5]] });
      const scene = await sceneWith([{ actor: owner, x: 1000, y: 1000 }]);
      const combat = await fightWith([owner]);
      const entry = await fromPack("azeroth-rpg.bestiary", "Risen Skeleton");
      const boundActor = await bind({ owner, feature: null, entry, kind: "summon", until: "encounter", count: 2, sourceName: "ZZ Pocket", halfActions: 1 });
      assert.ok(boundActor, "nothing was bound");
      made.push(boundActor);
      const placed = await placeSummon({ summoner: owner, actor: boundActor, count: 2, at: { x: 1650, y: 1050 } });
      assert.equal(placed?.count, 2, "two did not stand");
      const tokens = scene.tokens.filter(t => t.actorId === boundActor.id);
      assert.lengthOf(tokens, 2);
      assert.isTrue(tokens.some(t => t.x === 1600 && t.y === 1000), "the first does not stand at the point picked");
      assert.isTrue(tokens.every(t => t.disposition === owner.getActiveTokens(true)[0].document.disposition), "not on the owner's side");
      await until(() => combat.combatants.filter(c => tokens.some(t => t.id === c.tokenId)).length === 2, "both in the owner's fight");
      for (const c of combat.combatants.filter(cb => tokens.some(t => t.id === cb.tokenId))) {
        assert.equal(c.budget.halfActions, 1, "a called creature took 05's two Half-Actions rather than its own one");
      }
    });

    it("DOOR 4 AND THE B2 REVIEW'S MUST-FIX 4: a summon lands on the scene the summoner's Use was made on, though the GM is viewing another where the summoner also stands", async function () {
      this.timeout(120000);
      const owner = await makeCharacter({ name: "ZZ LB Two Scenes", classes: [["Warlock", 5]] });
      const home = await sceneWith([{ actor: owner, x: 1000, y: 1000 }]);
      // The same linked actor stands on a second scene, and the GM is looking at that one.
      const elsewhere = await sceneWith([{ actor: owner, x: 2000, y: 1000 }]);
      assert.equal(canvas.scene?.id, elsewhere.id, "the GM is not viewing the other scene");
      const entry = await fromPack("azeroth-rpg.bestiary", "Risen Skeleton");
      const boundActor = await bind({ owner, feature: null, entry, kind: "summon", until: "encounter", count: 1, sourceName: "ZZ Two Scenes" });
      assert.ok(boundActor, "nothing was bound");
      made.push(boundActor);
      const placed = await placeSummon({ summoner: owner, actor: boundActor, count: 1, sceneId: home.id });
      assert.equal(placed?.count, 1, "nothing stood");
      assert.equal(placed.sceneId, home.id, "the summon was placed on the scene the GM is viewing");
      assert.isTrue(home.tokens.some(t => t.actorId === boundActor.id), "no summon on the summoner's own scene");
      assert.isFalse(elsewhere.tokens.some(t => t.actorId === boundActor.id), "a summon on the scene the GM happened to be viewing");
    });

    /* ---- Door 6 ------------------------------------------------------------ */

    it("DOOR 6: two constructs share one Half-Action and one Reaction each turn, on the tinker's record, and a grant opens one more", async function () {
      this.timeout(180000);
      const tinker = await makeCharacter({ name: "ZZ LB Tinker", classes: [["Rogue", 5]] });
      const [one, two] = [await makeNpc("Plagued Ghoul"), await makeNpc("Plagued Ghoul")];
      for (const [i, c] of [one, two].entries()) {
        await c.update({ name: `ZZ LB Construct ${i + 1}` });
        await c.setFlag("azeroth-rpg", "bond", {
          ownerUuid: tinker.uuid, ownerName: tinker.name, kind: "construct", sourceId: null, sourceName: "ZZ Bench",
          entryUuid: null, entryName: c.name, until: null, uncounted: false, school: null, count: 1, since: Date.now()
        });
      }
      const combat = await fightWith([tinker, one, two]);
      const [mine, a, b] = [tinker, one, two].map(x => combat.getCombatantsByActor(x)[0]);
      // Each construct spends on its OWN turn (the lead: *"Refuse off-turn Half-Actions"*).
      // The three share the tinker's Initiative and no token gives a side, so the order is
      // by name: Construct 1, Construct 2, then the tinker - and handing the turn from one
      // construct to the other never starts the tinker's.
      await giveTurn(combat, one);
      assert.equal(a.budget.halfActions, 1, "the shared turn does not clamp a construct to one Half-Action");
      const spent = await a.spendAction("half");
      assert.isTrue(spent.ok, "the first construct could not spend the shared Half-Action");
      await until(() => (mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.halves ?? 0) === 1, "the tinker's record of the Half-Action");
      await giveTurn(combat, two);
      assert.equal(mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.halves ?? 0, 1, "the second construct's own turn started the shared turn over");
      assert.equal(b.budget.halfActions, 0, "the second construct still sees a Half-Action");
      let refused = null;
      const said = await warnings(async () => { refused = await b.spendAction("half"); });
      assert.isFalse(refused.ok, "the second construct spent a Half-Action the first had taken");
      assert.isTrue(said.some(w => w.includes(game.i18n.format("AZEROTH.Construct.SharedHalves", { name: b.name }))), `no refusal in words: ${JSON.stringify(said)}`);
      // **THE GM'S UNDO GIVES IT BACK ON THE TINKER'S RECORD TOO** (the B2 review, item a).
      assert.isTrue((await a.restoreAction("half")).ok, "the GM's undo was refused");
      await until(() => (mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.halves ?? 0) === 0, "the tinker's record given the Half-Action back");
      await until(() => b.budget.halfActions === 1, "the Half-Action given back reaching the second construct");
      assert.isTrue((await b.spendAction("half")).ok, "the second construct could not spend the Half-Action given back");
      await until(() => (mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.halves ?? 0) === 1, "the tinker's record of the second construct's Half-Action");
      // The Reaction is shared the same way.
      assert.isTrue((await a.spendAction("reaction")).ok, "the first construct's Reaction");
      await until(() => (mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.reactions ?? 0) === 1, "the tinker's record of the Reaction");
      assert.equal(b.budget.reactions, 0, "the second construct still sees the Reaction");
      // Remote Control at rank 2's door: one more Half-Action on the shared turn.
      await mine.grantConstructHalf(1);
      await until(() => b.budget.halfActions === 1, "the granted Half-Action reaching the second construct");
      assert.isTrue((await b.spendAction("half")).ok, "the granted Half-Action could not be spent");
      // **THE RECORD IS THE TINKER'S TURN, NEVER THE ROUND'S** (the B2 review, item b): a
      // construct's own turn coming round leaves it standing, and the tinker's clears it.
      const standing = mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG);
      assert.ok(standing, "no shared record stood");
      // Forward, a turn at a time (core runs a turn's start only going forward), across
      // the round's end if it comes, until the tinker's own turn begins.
      for (let i = 0; i < 6; i++) {
        const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.nextTurn();
        await settled;
        if (combat.combatant?.actorId === tinker.id) break;
        await new Promise(r => setTimeout(r, 500));
        assert.deepEqual(mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG), standing, "a turn not the tinker's - a construct's, or a new round - started the shared turn over");
      }
      assert.equal(combat.combatant?.actorId, tinker.id, "the tinker's turn never came round");
      await until(() => mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG) === undefined, "the shared record cleared as the tinker's own turn began", 30000);
    });

    it("DOOR 6 AND THE B2 REVIEW'S ITEM c: a construct whose tinker is not in the fight takes the shared allowance as its own - one Half-Action - never 05's two", async function () {
      this.timeout(120000);
      const tinker = await makeCharacter({ name: "ZZ LB Absent Tinker", classes: [["Rogue", 5]] });
      const lone = await makeNpc("Plagued Ghoul");
      await lone.update({ name: "ZZ LB Lone Construct" });
      await lone.setFlag("azeroth-rpg", "bond", {
        ownerUuid: tinker.uuid, ownerName: tinker.name, kind: "construct", sourceId: null, sourceName: "ZZ Bench",
        entryUuid: null, entryName: lone.name, until: null, uncounted: false, school: null, count: 1, since: Date.now()
      });
      const combat = await fightWith([lone]);
      const c = combat.getCombatantsByActor(lone)[0];
      await until(() => c.budget?.halfActions !== undefined, "the construct's budget");
      assert.equal(c.budget.halfActions, 1, "a construct alone took 05's two Half-Actions");
    });

    it("DOOR 6: a wrecked construct takes no healing, in words", async function () {
      this.timeout(120000);
      const tinker = await makeCharacter({ name: "ZZ LB Wreck Tinker", classes: [["Rogue", 5]] });
      const construct = await makeNpc("Plagued Ghoul");
      await construct.setFlag("azeroth-rpg", "bond", {
        ownerUuid: tinker.uuid, ownerName: tinker.name, kind: "construct", sourceId: null, sourceName: "ZZ Bench",
        entryUuid: null, entryName: construct.name, until: null, uncounted: false, school: null, count: 1, since: Date.now()
      });
      await construct.update({ "system.health.value": 0 });
      await until(() => construct.system.health.value === 0, "the construct wrecked");
      const infos = [];
      const info = ui.notifications.info;
      ui.notifications.info = (...args) => { infos.push(String(args[0])); return info.apply(ui.notifications, args); };
      try {
        await construct.applyHealing(5);
      } finally {
        ui.notifications.info = info;
      }
      assert.equal(construct.system.health.value, 0, "a wrecked construct was healed");
      assert.isTrue(infos.some(t => t === game.i18n.format("AZEROTH.Construct.WreckedNoHeal", { name: construct.name })), `not said: ${JSON.stringify(infos)}`);
    });

    /* ---- Door 7 ------------------------------------------------------------ */

    it("DOOR 7: Mekkatorque's Blueprint builds a gadget known with its own use, once a Short Rest, and the Long Rest takes it", async function () {
      this.timeout(240000);
      const gnome = await gnomeWith("ZZ LB Blueprint", ["Mekkatorque's Blueprint"]);
      const built = await blueprintGadget(gnome, "Recombobulator");
      assert.deepEqual({ max: built.system.uses.max, per: built.system.uses.per }, { max: 1, per: "short" }, "the gadget's own use");
      assert.equal(gnome.getFlag("azeroth-rpg", BLUEPRINT_FLAG)?.gadget, "recombobulator");
      await gnome.longRest();
      await until(() => !featureNamed(gnome, "Recombobulator"), "the Long Rest taking what the Blueprint built");
      assert.isUndefined(gnome.getFlag("azeroth-rpg", BLUEPRINT_FLAG), "the Blueprint's record outlived the Long Rest");
    });

    it("DOOR 7 AND THE B2 REVIEW'S MUST-FIX 5: Overclock marks a gadget known and strikes no use; the gadget's own next Use, pressed on the sheet, works one step better, says so, and breaks", async function () {
      this.timeout(240000);
      const gnome = await gnomeWith("ZZ LB Overclock", ["Overclock", "Mekkatorque's Blueprint"]);
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }]);
      const gadget = await blueprintGadget(gnome, "Recombobulator");
      assert.equal(gadget.system.uses.value, 1, "the gadget was built spent");
      const overclock = featureNamed(gnome, "Overclock");
      const sheet = await openSheet(gnome);
      const useOf = item => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        assert.ok(useOf(overclock), "the sheet draws no Use for Overclock");
        let posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === gnome.id);
        useOf(overclock).click();
        await pick(await chooser(overclock), ["Recombobulator"]);
        const [marking] = await posted;
        made.push(marking);
        assert.include(textOf(marking), game.i18n.format("AZEROTH.Overclock.Gadget", { name: "Recombobulator", talent: "Overclock" }));
        await until(() => gnome.items.get(gadget.id)?.getFlag("azeroth-rpg", OVERCLOCK_FLAG)?.by === "Overclock", "the gadget marked as overclocked");
        assert.equal(gnome.items.get(gadget.id).system.uses.value, 1, "Overclock struck the gadget's use and fired nothing");
        // The gadget's own Use: the Recombobulator's *creature you touch* - the gnome's own token, targeted.
        canvas.tokens.setTargets([gnome.getActiveTokens(true)[0].id]);
        await until(() => useOf(gnome.items.get(gadget.id)), "the gadget's Use drawn");
        posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === gnome.id);
        useOf(gnome.items.get(gadget.id)).click();
        const [fired] = await posted;
        made.push(fired);
        assert.include(textOf(fired), game.i18n.format("AZEROTH.Overclock.Fired", { name: "Recombobulator", talent: "Overclock" }), "the gadget's card does not say it is overclocked");
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      await until(() => gnome.items.get(gadget.id)?.system?.uses?.value === 0, "the overclocked gadget broken by its own use");
      assert.isUndefined(gnome.items.get(gadget.id).getFlag("azeroth-rpg", OVERCLOCK_FLAG), "the mark outlived the Use it was for");
    });

    it("DOOR 7: the Net-o-Matic Projector's card attacks with the gadget, and its hit lays Entangled with the Test that ends it", async function () {
      this.timeout(240000);
      const gnome = await gnomeWith("ZZ LB Net", ["Mekkatorque's Blueprint"]);
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const net = await blueprintGadget(gnome, "Net-o-Matic Projector");
      const ghoulToken = ghoul.getActiveTokens(true)[0];
      // **PRESSED ON THE SHEET'S OWN USE, THE GHOUL TARGETED** (D-774: a test that hands
      // `useFeature` its targets cannot see the button's reading of them; B8b's review).
      canvas.tokens.setTargets([ghoulToken.id]);
      const sheet = await openSheet(gnome);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const control = sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${net.id}"] [data-action="useFeature"]`)
          ?? sheet.element?.querySelector(`[data-item-id="${net.id}"] [data-action="useFeature"]`) ?? null;
        assert.ok(control, "the sheet draws no Use for the Net-o-Matic Projector");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === gnome.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
        control.click();
        [card] = await posted;
        made.push(card);
      } finally {
        await sheet.close();
      }
      assert.equal(card.flags["azeroth-rpg"].gadgetAttack?.range, 40, "the card does not carry the gadget's attack");
      const button = parsed(card).querySelector('button[data-action="attackFromCard"]');
      assert.ok(button, "the card draws no Attack");
      canvas.tokens.setTargets([ghoulToken.id]);
      const unpin = pinDie(20);
      try {
        const attack = await CARD_ACTIONS.attackFromCard(button, card);
        if (attack) made.push(attack);
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
      }
      await until(() => ghoul.statuses.has("entangled"), "the net's Entangled landing");
      const effect = ghoul.effects.find(e => e.statuses?.has("entangled"));
      assert.equal(effect?.getFlag("azeroth-rpg", ESCAPE_FLAG)?.resilience, "reflex", "the Entangled carries no Reflex escape");
      assert.equal(effect?.getFlag("azeroth-rpg", ESCAPE_FLAG)?.on, "action", "the escape is not on the creature's action");
    });

    /* ---- Door 26 ----------------------------------------------------------- */

    it("DOOR 26: a Shadow Trap's Region is passed by an ally untouched, and sprung by the first enemy, who is Entangled with its escape", async function () {
      this.timeout(240000);
      const rogue = await makeCharacter({ name: "ZZ LB Trapper", classes: [["Rogue", 5]] });
      const ally = await makeCharacter({ name: "ZZ LB Trap Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([
        { actor: rogue, x: 600, y: 1000 }, { actor: ally, x: 1000, y: 600 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }
      ]);
      await fightWith([rogue, ally, ghoul]);
      const escape = featureEscapeRecord({ on: "action", resilience: "reflex", dc: "spellDc", banes: 0 }, { condition: "entangled", spellDc: 13, caster: rogue.uuid, source: "Shadow Trap" });
      const region = await placeArea({
        areaText: trapArea(5), name: "ZZ Shadow Trap", scene, origin: { x: 1050, y: 1050 }, color: null,
        flags: { [TRAP_FLAG]: { setter: rogue.uuid, identifier: "shadow-trap", source: "Shadow Trap", condition: "entangled", escape, who: "enemy", setAt: 0 } }
      });
      assert.ok(region, "the trap's Region was not placed");
      made.push(region);
      // The ally walks through it.
      const allyToken = ally.getActiveTokens(true)[0];
      await allyToken.document.update({ x: 1000, y: 1000 });
      await until(() => allyToken.document.x === 1000 && allyToken.document.y === 1000, "the ally arriving");
      await new Promise(r => setTimeout(r, 750));
      assert.isTrue(scene.regions.has(region.id), "an ally sprang the trap");
      assert.isFalse(ally.statuses.has("entangled"), "an ally was Entangled");
      await allyToken.document.update({ x: 1000, y: 600 });
      await until(() => allyToken.document.y === 600, "the ally walking off");
      // The ghoul walks into it.
      const ghoulToken = ghoul.getActiveTokens(true)[0];
      await ghoulToken.document.update({ x: 1000, y: 1000 });
      await until(() => ghoul.statuses.has("entangled"), "the trap's Entangled landing on the enemy");
      await until(() => !scene.regions.has(region.id), "the sprung trap taken up");
      const effect = ghoul.effects.find(e => e.statuses?.has("entangled"));
      assert.equal(effect?.getFlag("azeroth-rpg", ESCAPE_FLAG)?.dc, 13, "the trap's Entangled carries no escape at the setter's Spell DC");
    });
  });
}
