/**
 * **THE PHASE 4b REVIEW'S WORKLIST, THROUGH THE REAL CONTROLS** (2026-11-19): every raise cast from
 * the sheet's own Cast with its dialog's lines ticked and its choosers answered as a player answers
 * them; every offer pressed on its card; every blow dealt through a real attack card's Apply; every
 * rest taken from the sheet's own Long Rest; every Test pressed on its card. The pure laws and the
 * source censuses are `module/rules/necromancer-review4b.test.mjs`.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-review`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, fightWith, manaOf, nextTurnUntil, pick, pressCard, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { capacityOf, hordeActorsOf, membersOf, setStitchPick } from "../effects/necromancer-horde.mjs";
import { HORDE_LEAD_FLAG, hordeLoad } from "../rules/horde.mjs";
import { countedMembers } from "../rules/necromancer-features.mjs";
import { cardRecords } from "../animation/records.mjs";
import { FEATURE_ANIMATIONS } from "../rules/animation-table.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const bondOf = actor => actor.getFlag(SCOPE, "bond") ?? null;
const NECROS = [];

/** A Necromancer at a level, Intelligence 16 (+3, five places), Constitution 14, its talents at ranks. */
async function necromancerWith(name, { level = 5, spells = [], ranks = {}, int = 16, arcana = 0 } = {}) {
  const n = await makeCharacter({ name, classes: [["Necromancer", level]], race: "Human", spells, abilities: { int, con: 14 }, ...(arcana ? { skillRanks: { arcana } } : {}) });
  NECROS.push(n);
  await until(() => essenceOf(n), "the Essence pool");
  await until(() => ["Raise Dead", "Animate Corpse"].every(s => n.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
  await n._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => n.items.find(i => i.type === "talent" && i.name === talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  return n;
}

async function bankEssence(actor, value) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === Math.min(value, pool.max), "Essence banked");
}

async function bankMana(actor, value = 99) {
  const pool = manaOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value: Math.min(value, pool.max) });
  await until(() => manaOf(actor).value === Math.min(value, pool.max), "Mana banked");
}

/** A corpse: a bestiary creature, named for the test, at 0 Health. */
async function corpse(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

/** A living creature named for the test. */
async function creature(entry, name, health = null) {
  const npc = await makeNpc(entry);
  const max = health ?? npc.system.health.max;
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.max": max, "system.health.value": max });
  return npc;
}

const hordeOf = necro => hordeActorsOf(necro).sort((a, b) => (bondOf(a).since ?? 0) - (bondOf(b).since ?? 0));

/** Tick these names in a multi-pick chooser and press its button. */
export async function tick(app, names) {
  for (const box of app.element.querySelectorAll('input[name="choice"]')) {
    const label = box.closest("label")?.textContent?.trim() ?? "";
    box.checked = names.some(n => label.startsWith(n));
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** The labels a chooser offers, read off the window as drawn. */
function offered(app) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) return [...select.options].map(o => o.textContent.trim());
  return [...app.element.querySelectorAll('input[name="choice"]')].map(b => b.closest("label")?.textContent?.trim() ?? "");
}

/**
 * **CAST FROM THE SHEET**: the cast dialog's lines ticked by their checkboxes where `lines` names any
 * (the dialog opens), then each chooser the cast opens answered in turn. The card, or null.
 */
export async function castWith(actor, spellName, { lines = [], steps = [], targets = [], face = 19, ms = 45000 } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const control = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
    ?? sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  if (!control) throw new Error(`the sheet draws no Cast for ${spellName}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, lines.length ? "always" : "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    control.click();
    if (lines.length) {
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
    for (const step of steps) {
      let app = null;
      try { app = await chooser(spell, 15000); } catch (err) { throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}`); }
      await step(app);
      await sleep(150);
    }
    const card = await posted;
    if (!card && warned.length) throw new Error(`${spellName} posted no card; warnings: ${warned.join(" | ")}`);
    return card;
  } finally {
    ui.notifications.warn = original;
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** The words a cast refused in, or null where it cast: the warning caught, nothing posted. */
export async function refusedCast(actor, spellName, options = {}) {
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    const card = await castWith(actor, spellName, { ...options, ms: options.ms ?? 6000 });
    return card ? null : warned.join(" | ");
  } catch (err) {
    return warned.join(" | ") || err.message;
  } finally {
    ui.notifications.warn = original;
  }
}

/** Press the 2D board at a canvas point, as a browser does. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** An NPC's attack row pressed on its own sheet at a target; the attack card. */
export async function npcAttacks(npc, rowName, target, { face = 19 } = {}) {
  const index = npc.system.attacks.findIndex(a => a.name === rowName);
  if (index < 0) throw new Error(`${npc.name} has no ${rowName}`);
  canvas.tokens?.setTargets([tokenOf(target)?.id ?? target.id]);
  const sheet = await openSheet(npc);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === npc.id && m.flags?.[SCOPE]?.kind === "attack")
    .then(([card]) => { made.push(card); return card; });
  try {
    const control = await until(() => sheet.element.querySelector(`[data-action="rollAttack"][data-attack="${index}"]`), `${rowName}'s control`);
    control.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** The next card of a kind, with what it carries. */
export const nextCard = (predicate, ms = 30000) => untilHook("createChatMessage", ms, predicate).then(([m]) => { made.push(m); return m; });

/** The sheet's own Long Rest, pressed; resolves once `done` holds. */
async function pressLongRest(actor, done, what = "the Long Rest") {
  const sheet = await openSheet(actor);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  try {
    const control = await until(() => sheet.element.querySelector('[data-action="longRest"]'), "the Long Rest control");
    control.click();
    await until(done, what, 60000);
  } finally {
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

export function necromancerReviewBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Phase 4b review's worklist, through the real controls", function () {
    let restoreDialog = null;
    let restoreText = null;
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(300000);
      setStitchPick(null);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-grave-guard-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      const owners = new Set(NECROS.map(n => n.uuid));
      for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete().catch(() => {});
      for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    /* ---------------------------------------------------------------- */
    /*  The raise spells the 4b batch never cast                         */
    /* ---------------------------------------------------------------- */

    describe("the raise spells and the Bone talents", function () {
      it("Animate Corpse under Shambling Horde 1 takes three corpses and stands three zombies", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Shambler", { level: 5, ranks: { "Shambling Horde": 1 } });
        const bodies = [await corpse("Bandit", "Rev Zed A"), await corpse("Bandit", "Rev Zed B"), await corpse("Bandit", "Rev Zed C")];
        await sceneWith([{ actor: necro, x: 300, y: 600 }, ...bodies.map((b, i) => ({ actor: b, x: 500, y: 500 + i * 150, side: "hostile" }))]);
        await bankMana(necro);
        const card = await castWith(necro, "Animate Corpse", { steps: [app => tick(app, ["ZZ Rev Zed A", "ZZ Rev Zed B", "ZZ Rev Zed C"])] });
        assert.ok(card?.flags[SCOPE].success, "Animate Corpse was cast");
        assert.deepEqual(hordeOf(necro).map(x => x.name), ["Risen Zombie", "Risen Zombie", "Risen Zombie"], "three zombies, one a corpse");
      });

      it("Ranks of Bone 1 lets Raise Dead take two corpses: four skeletons", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Ranks", { level: 5, int: 18, ranks: { "Ranks of Bone": 1 } });
        const a = await corpse("Bandit", "Rev Bone A");
        const b = await corpse("Bandit", "Rev Bone B");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Raise Dead", { steps: [app => tick(app, ["ZZ Rev Bone A", "ZZ Rev Bone B"])] });
        assert.ok(card?.flags[SCOPE].success, "Raise Dead was cast");
        assert.lengthOf(hordeOf(necro), 4, "two skeletons from each corpse");
      });

      it("Bind Banshee stands a Banshee that keeps its Reaction", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Binder", { level: 11, spells: ["Bind Banshee"] });
        const body = await corpse("Bandit", "Rev Wailer");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Bind Banshee", { steps: [app => pick(app, "ZZ Rev Wailer")] });
        assert.ok(card?.flags[SCOPE].success, "Bind Banshee was cast");
        const banshee = hordeOf(necro).find(x => x.name === "Banshee");
        assert.ok(banshee, "a Banshee rose");
        assert.isTrue(bondOf(banshee).keepsReaction, "it keeps its Reaction");
      });

      it("Raise Crypt Horror refuses a Medium corpse in words and stands a Horror from a Large one", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Horror", { level: 17, spells: ["Raise Crypt Horror"] });
        const bandit = await corpse("Bandit", "Rev Small");
        const bear = await corpse("Black Bear", "Rev Bear");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: bandit, x: 500, y: 600, side: "hostile" }, { actor: bear, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Raise Crypt Horror", { steps: [async app => {
          const labels = offered(app);
          assert.ok(labels.some(l => l.startsWith("ZZ Rev Bear")), "the Large corpse is offered");
          await pick(app, "ZZ Rev Bear");
        }] });
        assert.ok(card?.flags[SCOPE].success, "Raise Crypt Horror was cast");
        const horror = hordeOf(necro).find(x => x.name === "Crypt Horror");
        assert.ok(horror, "a Crypt Horror rose");
        assert.isTrue(bondOf(horror).keepsReaction, "it keeps its Reaction");
      });

      it("Skeletal Archery and Mastery 1 offer an archer and a mage; the Empowered line, ticked on the dialog, stands both as mages for 1 Essence", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Mastery", { level: 5, int: 18, ranks: { "Skeletal Archery": 1, "Skeletal Mastery": 1 } });
        const a = await corpse("Bandit", "Rev Mage A");
        const b = await corpse("Bandit", "Rev Mage B");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        // Plain: an archer and a mage is a choice, two mages is not.
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Mage A"), async app => {
          const labels = offered(app);
          assert.ok(labels.some(l => /1 Skeletal Archer/.test(l) && /1 Skeletal Mage/.test(l)), `an archer and a mage offered: ${labels.join(" / ")}`);
          assert.notOk(labels.some(l => /2 Skeletal Mage/.test(l)), "two mages are not offered without the Essence");
          const option = labels.find(l => /1 Skeletal Archer/.test(l) && /1 Skeletal Mage/.test(l));
          await pick(app, option);
        }] });
        assert.sameMembers(hordeOf(necro).map(x => x.name), ["Skeletal Archer", "Skeletal Mage"], "an archer and a mage rose");
        // Empowered: the line ticked on the cast dialog, 1 Essence, and both rise as mages.
        await bankMana(necro);
        await bankEssence(necro, 2);
        const card = await castWith(necro, "Raise Dead", { lines: ["skeletal-mastery-empowered"], steps: [app => pick(app, "ZZ Rev Mage B"), async app => {
          const labels = offered(app);
          const both = labels.find(l => /2 Skeletal Mage/.test(l));
          assert.ok(both, `two mages offered with the Essence: ${labels.join(" / ")}`);
          await pick(app, both);
        }] });
        assert.ok(card?.flags[SCOPE].success, "the empowered Raise Dead was cast");
        assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
        assert.equal(hordeOf(necro).filter(x => x.name === "Skeletal Mage").length, 3, "both new skeletons rose as mages");
        assert.ok((card.flags[SCOPE].raisedWith ?? []).some(e => e.key === "skeletal-mastery"), "the card records the empowered mage for its cue");
      });

      it("Swelling Ranks and The Endless Host add skeleton-only places, read on the panel", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Rev Host", { level: 20, arcana: 3, ranks: { "Bone Vanguard": 1, "Swelling Ranks": 2, "The Endless Host": 1 } });
        const cap = capacityOf(necro);
        assert.deepEqual(cap, { general: 5, skeletons: 5, total: 10 }, "2 + Int +3, then 2 for Swelling Ranks and 3 for Arcana Ranks");
        const sheet = await openSheet(necro);
        sheet.changeTab("combat", "primary");
        await settle();
        const group = sheet.element.querySelector('details[data-combat-section="horde"]');
        if (group && !group.open) group.open = true;
        await settle();
        assert.match(sheet.element.querySelector(".azeroth-horde-panel")?.textContent ?? "", /0 \/ 10 places/, "the panel reads 0 / 10 places");
        await sheet.close();
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Flesh                                                            */
    /* ---------------------------------------------------------------- */

    describe("Flesh's grafts", function () {
      it("Grafted Flesh gives an Animate Corpse zombie a graft for 1 Essence; Surgeon's Hand 2 widens the menu", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Grafter", { level: 11, ranks: { "Grafted Flesh": 1, "Surgeon's Hand": 2 } });
        const body = await corpse("Bandit", "Rev Graft");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 2);
        const card = await castWith(necro, "Animate Corpse", { steps: [app => tick(app, ["ZZ Rev Graft"]), async app => {
          const labels = offered(app);
          for (const g of ["Bone Plating", "Butcher's Arm", "Plague Bladder", "Grasping Arms"]) assert.ok(labels.some(l => l.startsWith(g)), `${g} offered: ${labels.join(" / ")}`);
          await tick(app, ["Bone Plating"]);
        }] });
        assert.ok(card?.flags[SCOPE].success, "cast");
        const zombie = hordeOf(necro).find(x => x.name === "Risen Zombie");
        assert.deepEqual(zombie.getFlag(SCOPE, "grafts"), ["bonePlating"], "the zombie carries its graft");
        assert.equal(zombie.system.ap.body, 1 + 2, "Bone Plating: 2 more Armor Points");
        assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
      });

      it("Practiced Stitcher 1 takes 1 off the grafts, and Masterwork Abomination doubles the Health and lets a graft be given twice", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Master", { level: 20, spells: ["Stitch Abomination"], ranks: { "Practiced Stitcher": 1, "Masterwork Abomination": 1 } });
        await sceneWith([{ actor: necro, x: 400, y: 800 }]);
        await bankMana(necro);
        await bankEssence(necro, 3);
        setStitchPick(() => ({ x: 750, y: 850 }));
        try {
          const card = await castWith(necro, "Stitch Abomination", { steps: [async app => {
            const labels = offered(app);
            assert.ok(labels.filter(l => /Bone Plating/.test(l)).length >= 2, `Masterwork offers a graft twice: ${labels.join(" / ")}`);
            // Exactly two grafts: Bone Plating once and Swollen (its second copy left unticked).
            for (const box of app.element.querySelectorAll('input[name="choice"]')) {
              const label = box.closest("label")?.textContent?.trim() ?? "";
              box.checked = label === "Bone Plating" || label === "Swollen";
            }
            app.element.querySelector('button[data-action="choose"]').click();
            await until(() => !app.rendered, "the chooser to close");
          }] });
          assert.ok(card?.flags[SCOPE].success, "cast");
        } finally {
          setStitchPick(null);
        }
        const abom = hordeOf(necro).find(x => x.name === "Abomination");
        assert.equal(essenceOf(necro).value, 2, "two grafts less Practiced Stitcher's 1: 1 Essence");
        assert.equal(abom.system.health.max, 64 * 2 + 5 * 4, "Masterwork doubles 64, then Swollen's five times tier 4");
      });
    });

    describe("a raise the GM's client refuses", function () {
      it("gives back the Mana and every Essence the cast paid (the grafts and an empower line), said on the card", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Refund", { level: 11, spells: ["Stitch Abomination"] });
        const blocker = await creature("Bandit", "Rev Blocker");
        await sceneWith([{ actor: necro, x: 400, y: 800 }]);
        await bankMana(necro);
        await bankEssence(necro, 3);
        const manaBefore = manaOf(necro).value;
        const point = { x: 750, y: 850 };
        setStitchPick(() => point);
        // Between the pick and the GM's raise, a creature steps into the space: the GM's client judges
        // it again (S12) and refuses.
        let blocked = false;
        const hook = Hooks.on("updateActor", actor => {
          if (actor.id !== necro.id || blocked) return;
          blocked = true;
          tokenData(blocker, { x: 700, y: 800, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })
            .then(data => canvas.scene.createEmbeddedDocuments("Token", [data]));
        });
        let card = null;
        try {
          card = await castWith(necro, "Stitch Abomination", { lines: ["empower-farReaching"], steps: [app => tick(app, ["Meat Hook", "Swollen"])] });
        } finally {
          setStitchPick(null);
          Hooks.off("updateActor", hook);
        }
        assert.ok(card, "the cast posted its card");
        assert.lengthOf(hordeOf(necro), 0, "nothing rose");
        await until(() => essenceOf(necro).value === 3, "the grafts' 2 Essence and Far-reaching's 1 given back");
        await until(() => manaOf(necro).value === manaBefore, "the Mana given back");
        assert.match(card.content, /given back|refunded|back/i, "the card says so");
      });
    });

    /* ---------------------------------------------------------------- */
    /*  The features, empowered and once a round                         */
    /* ---------------------------------------------------------------- */

    describe("the features' Empowered lines", function () {
      it("Grim Sacrament 2: Dark Ritual on a ghoul at 5 Health restores 5 Mana, never 5 plus the ranks; empowered, the Health follows", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Sacrament", { level: 14, spells: ["Ghoul Rising"], ranks: { "Grim Sacrament": 2 } });
        const body = await corpse("Bandit", "Rev Ritual");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Ghoul Rising", { steps: [app => pick(app, "ZZ Rev Ritual")] });
        const ghoul = hordeOf(necro)[0];
        await ghoul.update({ "system.health.temp": 0, "system.health.value": 5 });
        await bankMana(necro, 10);
        await bankEssence(necro, 1);
        await necro.update({ "system.health.value": Math.max(1, necro.system.health.max - 20) });
        const hpBefore = necro.system.health.value;
        const feature = necro.items.find(i => i.type === "feature" && i.name === "Dark Ritual");
        const { pressUse } = await import("./quench-chronomancer-common.mjs");
        const { card } = await pressUse(necro, "Dark Ritual");
        await pick(await chooser(feature), "Plagued Ghoul");
        await pick(await chooser(feature), "Empowered");
        assert.ok(await card, "the Use posted its card");
        await until(() => !game.actors.has(ghoul.id), "the ghoul collapsed");
        await until(() => manaOf(necro).value === Math.min(manaOf(necro).max, 15), "5 Mana: the servant's Health, under the risen cap of 13");
        assert.equal(essenceOf(necro).value, 0, "the Empowered line's Essence");
        await until(() => necro.system.health.value === hpBefore + 5, "Health equal to the Mana regained");
      });

      it("Claim the Fallen empowered casts with no Mana for 1 Essence, judged in the cast, and a second press is refused", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Claimer", { level: 9 });
        const foe = await creature("Bandit", "Rev Claimed");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        const offered1 = nextCard(m => m.flags?.[SCOPE]?.offer === "claim");
        await foe.update({ "system.health.value": 0 });
        const offer = await offered1;
        const manaBefore = manaOf(necro).value;
        // The death itself gave 1 Essence (a living enemy within 120 feet), so the pool is read at the press.
        await sleep(1000);
        const essenceBefore = essenceOf(necro).value;
        const castDone = nextCard(m => m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell");
        const { release } = await pressCard(offer, 'button[data-action="claimTheFallen"][data-spell="raise-dead"][data-empowered="true"]', { face: 19 });
        const card = await castDone;
        await release();
        assert.ok(card?.flags[SCOPE].success, "Raise Dead cast");
        assert.equal(manaOf(necro).value, manaBefore, "no Mana paid");
        await until(() => essenceOf(necro).value === essenceBefore - 1, "1 Essence paid in the cast");
        // A second press: the corpse is used up, refused in words, nothing spent.
        const warned = [];
        const original = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
        try {
          const again = await pressCard(offer, 'button[data-action="claimTheFallen"][data-spell="raise-dead"][data-empowered="false"]', { face: 19 });
          await sleep(2500);
          await again.release();
        } finally {
          ui.notifications.warn = original;
        }
        assert.lengthOf(hordeOf(necro), 2, "no second raise from one corpse");
        assert.isAbove(warned.length, 0, "the second press was refused in words");
      });

      it("Grave Guard, through a real attack card's Apply, re-resolves the blow on the skeleton's Armor Points; empowered once a round", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Guard", { level: 11 });
        const body = await corpse("Bandit", "Rev Guard Corpse");
        const brute = await creature("Bandit", "Rev Brute", 30);
        const brute2 = await creature("Bandit", "Rev Brute Two", 30);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }, { actor: brute, x: 200, y: 600, side: "hostile" }, { actor: brute2, x: 300, y: 500, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Guard Corpse")] });
        const [skel] = hordeOf(necro);
        await tokenOf(skel).document.update({ x: 400, y: 600 });
        await sleep(800);
        await skel.update({ "system.health.temp": 0, "system.health.max": 40, "system.health.value": 40 });
        const combat = await fightWith([necro, skel, brute, brute2]);
        await bankEssence(necro, 2);
        // The two brutes in the order the tracker runs them, both inside one round.
        const order = combat.turns.map(c => c.actorId);
        const [firstBrute, secondBrute] = [brute, brute2].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
        await nextTurnUntil(firstBrute, combat);
        const round = combat.round;
        // The first brute's Hand axe hits the Necromancer; its card's Apply asks Grave Guard.
        const attack = await npcAttacks(firstBrute, "Hand axe", necro);
        const damage = Number(document.querySelector(`[data-message-id="${attack.id}"] [data-action="applyDamage"]`)?.dataset?.damage ?? 0);
        assert.isAbove(damage, 0, "the blow deals damage");
        const necroBefore = necro.system.health.value;
        const skelBefore = skel.system.health.value;
        const { release } = await pressCard(attack, '[data-action="applyDamage"]');
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-grave-guard-")) ?? null, "Grave Guard's question");
        ask.element.querySelector(`button[data-action="e:${skel.id}"]`).click();
        await until(() => skel.system.health.value < skelBefore, "the skeleton took the blow");
        await release();
        assert.equal(necro.system.health.value, necroBefore, "the Necromancer took nothing");
        assert.equal(essenceOf(necro).value, 1, "the empowered use spent 1 Essence");
        const guardCard = await until(() => game.messages.contents.filter(m => m.flags?.[SCOPE]?.featureKey === "grave-guard").at(-1), "the guard's card for its cue");
        assert.isTrue(cardRecords(guardCard).some(r => r.identifier === "grave-guard" && FEATURE_ANIMATIONS["grave-guard"]), "the card's record plays the guard's row");
        // Once a round: the second brute's blow, the same round, offers no empowered guard.
        await nextTurnUntil(secondBrute, combat);
        assert.equal(combat.round, round, "the second blow lands in the same round");
        const attack2 = await npcAttacks(secondBrute, "Hand axe", necro);
        const r2 = await pressCard(attack2, '[data-action="applyDamage"]');
        // **ASKED, WITH THE REACTION ALONE** (the fix runs' review: the half that could not fail): the
        // empowered use spent no Reaction, so the plain guard is still offered - and the empowered one
        // is not, the round's mark taken.
        const ask2 = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-grave-guard-")) ?? null, "the second question", 15000);
        assert.ok(ask2.element.querySelector(`button[data-action="r:${skel.id}"]`), "the plain guard, with the Reaction, is still offered");
        assert.isNull(ask2.element.querySelector(`button[data-action="e:${skel.id}"]`), "no empowered guard twice in a round");
        ask2.element.querySelector('button[data-action="no"]').click();
        await r2.release();
        await combat.delete();
      });

      it("Grave Guard's overflow is an attack that hits the Necromancer: Bone Shield is asked on it, takes 6 off, and Barbed Bone fires (the lead: \"yes it should\")", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Guard Shield", { level: 11, spells: ["Bone Shield"], ranks: { "Barbed Bone": 1 } });
        const body = await corpse("Bandit", "Rev Guard Shield Corpse");
        const brute = await creature("Bandit", "Rev Shield Brute", 30);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }, { actor: brute, x: 200, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Guard Shield Corpse")] });
        const [skel] = hordeOf(necro);
        await tokenOf(skel).document.update({ x: 400, y: 600 });
        await sleep(800);
        // One Health and no Armor Points: the blow is larger than the servant can hold, so it overflows.
        await skel.update({ "system.health.temp": 0, "system.health.max": 40, "system.health.value": 1, "system.ap.body": 0, "system.ap.head": 0, "system.ap.limb": 0 });
        const shield = necro.items.find(i => i.type === "spell" && i.name === "Bone Shield");
        assert.ok(shield, "Bone Shield known");
        const attack = await npcAttacks(brute, "Hand axe", necro);
        const necroBefore = necro.system.health.value;
        const manaBefore = manaOf(necro).value;
        const bruteBefore = brute.system.health.value;
        const shieldCard = untilHook("createChatMessage", 60000, m => m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell");
        // The die is pinned for the press: Bone Shield's Casting Test is rolled inside the blow, and
        // an unpinned d20 failed it about one run in four (team V, 2026-11-19), a stale test.
        const { release } = await pressCard(attack, '[data-action="applyDamage"]', { face: 19 });
        let overflow = null;
        try {
          // Out of a fight the Reaction is not budgeted, so the plain guard and then Bone Shield are both askable.
          const guardAsk = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-grave-guard-")) ?? null, "Grave Guard's question");
          guardAsk.element.querySelector(`button[data-action="r:${skel.id}"]`).click();
          const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-bone-shield-")) ?? null, "Bone Shield asked on the overflow", 30000);
          // The amount the question names is the overflow - what passed the servant's 1 Health.
          const pre = game.i18n.format("AZEROTH.NecroSpell.Shield.Ask", { name: necro.name, n: "\u0000", spell: shield.name, mana: shield.system?.mana ?? 0 }).split("\u0000")[0];
          const text = ask.element.querySelector(".window-content p")?.textContent ?? "";
          overflow = Number(text.slice(text.indexOf(pre) + pre.length).match(/^\d+/)?.[0]);
          assert.isAbove(overflow, 0, `the question names the overflow (${text})`);
          ask.element.querySelector('button[data-action="yes"]').click();
          const [card] = await shieldCard;
          made.push(card);
          assert.ok(card.flags[SCOPE].success, "Bone Shield was cast on the overflow");
          await until(() => skel.system.health.value === 0 || !game.actors.has(skel.id), "the servant took what it could hold");
          await until(() => necro.system.health.value === necroBefore - Math.max(0, overflow - 6), `the overflow less 6 (${overflow}), Health ${necro.system.health.value} of ${necroBefore}`, 30000);
        } finally {
          await release();
        }
        assert.equal(manaOf(necro).value, manaBefore - (shield.system?.mana ?? 10), "Bone Shield's Mana paid once");
        await until(() => brute.system.health.value === bruteBefore - 2, "Barbed Bone's 2 Shadow on the attacker", 20000);
        // Once a blow: no second Bone Shield question stands.
        await sleep(1500);
        assert.isUndefined([...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-bone-shield-")), "asked once");
      });

      it("Unending Dead: Let it fall collapses the servant by choice, once; a standing offer collapses at the Necromancer's turn start", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Unending", { level: 17, int: 18 });
        const a = await corpse("Bandit", "Rev Fall A");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Fall A")] });
        const [first, second] = hordeOf(necro);
        await bankEssence(necro, 2);
        let byChoice = null;
        const hook = Hooks.on("azerothHordeCollapse", e => { if (e.actor?.id === first.id) byChoice = e.byChoice; });
        try {
          const offer1 = nextCard(m => m.flags?.[SCOPE]?.offer === "unending" && m.flags[SCOPE].servant === first.uuid);
          await first.update({ "system.health.temp": 0, "system.health.value": 0 });
          const card = await offer1;
          const { release } = await pressCard(card, 'button[data-action="unendingDead"][data-fall="true"]');
          await until(() => !game.actors.has(first.id), "it fell");
          await release();
          assert.isTrue(byChoice, "Let it fall is a collapse by choice (the lead's Q4)");
          await until(() => game.messages.get(card.id)?.flags?.[SCOPE]?.pressed?.unendingDead === true, "the press recorded on the card");
        } finally {
          Hooks.off("azerothHordeCollapse", hook);
        }
        // In a fight, an offer left standing collapses at the Necromancer's next turn start.
        const combat = await fightWith([necro, second]);
        const offer2 = nextCard(m => m.flags?.[SCOPE]?.offer === "unending" && m.flags[SCOPE].servant === second.uuid);
        await second.update({ "system.health.temp": 0, "system.health.value": 0 });
        await offer2;
        await nextTurnUntil(second, combat);
        await nextTurnUntil(necro, combat);
        await until(() => !game.actors.has(second.id), "it collapsed at the turn start");
        await combat.delete();
      });

      it("Unending Dead out of a fight: the offer stands until the world's clock moves on", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Clock", { level: 17 });
        const a = await corpse("Bandit", "Rev Clock A");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Clock A")] });
        const [skel] = hordeOf(necro);
        await bankEssence(necro, 1);
        const offer = nextCard(m => m.flags?.[SCOPE]?.offer === "unending" && m.flags[SCOPE].servant === skel.uuid);
        await skel.update({ "system.health.temp": 0, "system.health.value": 0 });
        await offer;
        await sleep(1000);
        assert.isTrue(game.actors.has(skel.id), "it waits while the clock stands");
        await game.time.advance(6);
        await until(() => !game.actors.has(skel.id), "the clock moved and it collapsed");
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Spans, the panel, the Long Rest                                  */
    /* ---------------------------------------------------------------- */

    describe("the horde's spans, the panel's lead and the Long Rest", function () {
      it("The Dead Rise's hour ends on the clock, and Lasting doubles it", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Host Hour", { level: 20, spells: ["The Dead Rise"] });
        const a = await corpse("Bandit", "Rev Hour A");
        const b = await corpse("Bandit", "Rev Hour B");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "The Dead Rise", { steps: [app => tick(app, ["ZZ Rev Hour A"]), app => pick(app, "1 Risen Skeleton")] });
        const [plain] = hordeOf(necro);
        const carrierOf = actor => necro.effects.find(e => e.flags?.[SCOPE]?.raised?.actorUuid === actor.uuid);
        assert.equal(carrierOf(plain).duration.seconds, 3600, "an hour");
        await game.time.advance(3610);
        await until(() => !game.actors.has(plain.id), "the hour ended", 30000);
        // A tier 5 spell is cast once a Long Rest (07 §4): the sheet's Long Rest, then Lasting.
        const { spellLimitRefusal } = await import("../effects/spell-limits.mjs");
        const host = necro.items.find(i => i.type === "spell" && i.name === "The Dead Rise");
        assert.ok(spellLimitRefusal(necro, host), "once a Long Rest: spent");
        await pressLongRest(necro, () => !spellLimitRefusal(necro, host), "the Long Rest gives the cast back");
        await bankMana(necro);
        await bankEssence(necro, 1);
        await castWith(necro, "The Dead Rise", { lines: ["empower-lasting"], steps: [app => tick(app, ["ZZ Rev Hour B"]), app => pick(app, "1 Risen Skeleton")] });
        const [lasting] = hordeOf(necro);
        assert.equal(carrierOf(lasting).duration.seconds, 7200, "Lasting doubles it");
        await game.time.advance(3610);
        await sleep(1500);
        assert.isTrue(game.actors.has(lasting.id), "the doubled span still stands after the first hour");
        await game.time.advance(3600);
        await until(() => !game.actors.has(lasting.id), "the doubled span ended", 30000);
      });

      it("the panel's Make lead names a new lead once the lead has collapsed, and the cast dialog's line names one at a cast", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Lead", { level: 5, spells: ["Ghoul Rising"] });
        const a = await corpse("Bandit", "Rev Lead A");
        const b = await corpse("Bandit", "Rev Lead B");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Lead A")] });
        await bankMana(necro);
        // Ghoul Rising with the new-lead line ticked: the chooser names the second skeleton.
        const [lead, other] = hordeOf(necro);
        await castWith(necro, "Ghoul Rising", { lines: ["horde-lead"], steps: [app => pick(app, "ZZ Rev Lead B"), app => pick(app, other.name)] });
        const flag = necro.getFlag(SCOPE, HORDE_LEAD_FLAG);
        assert.equal(flag?.id, other.id, "the line named the other skeleton");
        assert.isFalse(flag.taken, "from that creature's next turn");
        // The lead collapses; the panel's Make lead names the ghoul.
        const sheet = await openSheet(necro);
        sheet.changeTab("combat", "primary");
        await settle();
        const group = sheet.element.querySelector('details[data-combat-section="horde"]');
        if (group && !group.open) group.open = true;
        await settle();
        // The lead standing until the named one's turn is the first skeleton: dismissed, no lead stands.
        sheet.element.querySelector(`[data-horde-id="${lead.id}"] [data-action="dismissRaised"]`)?.click();
        await until(() => !game.actors.has(lead.id), "the lead collapsed");
        const ghoul = hordeOf(necro).find(x => x.name === "Plagued Ghoul");
        const make = await until(() => sheet.element.querySelector(`[data-horde-id="${ghoul.id}"] [data-action="makeHordeLead"]`), "the panel's Make lead");
        make.click();
        await until(() => necro.getFlag(SCOPE, HORDE_LEAD_FLAG)?.id === ghoul.id, "the ghoul leads");
        await sheet.close();
      });

      it("the sheet's Long Rest collapses the whole horde", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Rest", { level: 5 });
        const a = await corpse("Bandit", "Rev Rest A");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Rest A")] });
        const ids = hordeOf(necro).map(x => x.id);
        assert.lengthOf(ids, 2);
        await pressLongRest(necro, () => ids.every(id => !game.actors.has(id)), "the horde collapsed at the Long Rest");
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Plague of Undeath                                                */
    /* ---------------------------------------------------------------- */

    describe("Plague of Undeath's rising", function () {
      it("two plagued deaths at once both rise; a double press stands one ghoul; a forged rising is refused", async function () {
        this.timeout(300000);
        const necro = await necromancerWith("ZZ Rev Plague", { level: 20, int: 18, spells: ["Plague of Undeath"] });
        const v1 = await creature("Bandit", "Rev Plagued A", 20);
        const v2 = await creature("Bandit", "Rev Plagued B", 20);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: v1, x: 700, y: 600, side: "hostile" }, { actor: v2, x: 700, y: 750, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Plague of Undeath", { targets: [tokenOf(v1), tokenOf(v2)] });
        assert.ok(card?.flags[SCOPE].success, "cast");
        for (const v of [v1, v2]) {
          const { release } = await pressCard(card, `[data-resist-owner="${v.uuid}"] button[data-action="resistTest"]`, { face: 1 });
          await until(() => v.effects.some(e => e.flags?.[SCOPE]?.plagueRise), `${v.name} plagued`);
          await release();
        }
        const tick0 = v1.effects.find(e => e.flags?.[SCOPE]?.plagueRise).flags[SCOPE].tick;
        assert.isTrue(tick0.spellpower, "Shadow Spellpower reaches the tick (07 §9)");
        // Two deaths at once: each rides its own corpse token.
        await Promise.all([v1.update({ "system.health.value": 0 }), v2.update({ "system.health.value": 0 })]);
        await until(() => [v1, v2].every(v => tokenOf(v)?.document?.getFlag(SCOPE, "plagueRising")?.casterUuid === necro.uuid), "both risings marked on their corpses");
        const offers = [];
        const id = Hooks.on("createChatMessage", m => { if (m.flags?.[SCOPE]?.offer === "rising") { offers.push(m); made.push(m); } });
        let combat = null;
        try {
          combat = await fightWith([necro]);
          await until(() => offers.length === 2, "both risings offered at the turn start");
        } finally {
          Hooks.off("createChatMessage", id);
        }
        // A forged rising for a corpse with no mark is refused on the GM's client.
        const { hordeRaiseQueryHandler } = await import("../effects/necromancer-horde.mjs");
        const own = tokenOf(necro).document;
        let forged = null;
        try {
          await hordeRaiseQueryHandler({ horde: true, rising: true, ownerUuid: necro.uuid, key: "plague-of-undeath", sceneId: own.parent.id, tokenId: own.id, corpses: [own.id], entries: ["Plagued Ghoul"], grafts: [[]], name: "Plague of Undeath" }, { user: game.user });
        } catch (err) {
          forged = err.message;
        }
        assert.ok(forged, "a corpse with no rising mark stands nothing");
        // A double press on one card stands one ghoul.
        const offer = offers.find(o => o.flags[SCOPE].corpse.tokenId === tokenOf(v1).document.id);
        const risen = nextCard(m => m.flags?.[SCOPE]?.featureKey === "horde:rise", 60000);
        const p1 = await pressCard(offer, 'button[data-action="hordeRise"]');
        await sleep(200);
        const second = document.querySelector(`[data-message-id="${offer.id}"] button[data-action="hordeRise"]`);
        second?.click();
        await risen;
        await p1.release();
        await sleep(2500);
        assert.equal(hordeOf(necro).filter(x => x.name === "Plagued Ghoul").length, 1, "one ghoul from one press");
        assert.equal(tokenOf(v1).document.getFlag(SCOPE, "corpse")?.state, "raised", "the corpse used up on the GM's client");
        await until(() => !document.querySelector(`[data-message-id="${offer.id}"] button[data-action="hordeRise"]`), "the card's button gives way to its words");
        await combat?.delete();
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Enslave the Dead                                                 */
    /* ---------------------------------------------------------------- */

    describe("Enslave the Dead", function () {
      it("takes 07's Bane on a Mindless target, gives the caster's owners control, and hands it back with a cue when the hour ends", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Slaver", { level: 17, spells: ["Enslave the Dead"] });
        const skel = await creature("Risen Skeleton", "Rev Thrall");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: skel, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const before = foundry.utils.deepClone(skel.ownership);
        const card = await castWith(necro, "Enslave the Dead", { targets: [tokenOf(skel)] });
        assert.ok((card.flags[SCOPE].resistBanes ?? []).some(b => /Mindless/i.test(b.name)), "the Mindless Bane rides the Resist");
        assert.ok(card.flags[SCOPE].enslave?.paid, "the card records what it paid");
        const { release } = await pressCard(card, '[data-resist-owner] button[data-action]', { face: 1 });
        await until(() => skel.effects.some(e => e.flags?.[SCOPE]?.enslaved), "the control laid");
        await release();
        const owners = Object.entries(necro.ownership).filter(([id, l]) => id !== "default" && l >= 3 && !game.users.get(id)?.isGM).map(([id]) => id);
        for (const id of owners) assert.equal(skel.ownership[id], 3, "the caster's player owns it for the duration");
        const ended = nextCard(m => m.flags?.[SCOPE]?.featureKey === "enslave:end");
        await game.time.advance(3610);
        const endCard = await ended;
        await until(() => tokenOf(skel).document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE, "handed back to its side");
        assert.isTrue(game.actors.has(skel.id), "never deleted");
        assert.deepEqual(skel.ownership, before, "the ownership handed back as it was");
        assert.isTrue(cardRecords(endCard).some(r => r.identifier === "enslave:end"), "the end's card plays its row");
      });

      it("lands the control and collapses the raised dead chosen at the places", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Slaver Lands", { level: 17, int: 10, spells: ["Enslave the Dead"] });
        const a = await corpse("Bandit", "Rev Land A");
        const thrall = await creature("Risen Skeleton", "Rev Land Thrall");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: thrall, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Land A")] });
        assert.lengthOf(hordeOf(necro), 2, "two skeletons fill both places");
        await bankMana(necro);
        // The chooser: the first skeleton's box alone.
        const card = await castWith(necro, "Enslave the Dead", { targets: [tokenOf(thrall)], steps: [async app => {
          const boxes = [...app.element.querySelectorAll('input[name="choice"]')];
          boxes.forEach((b, i) => { b.checked = i === 0; });
          app.element.querySelector('button[data-action="choose"]').click();
          await until(() => !app.rendered, "the chooser to close");
        }] });
        const chosen = card.flags[SCOPE].enslave.collapse;
        assert.lengthOf(chosen, 1, "one collapse rides the card");
        const { release } = await pressCard(card, `[data-resist-owner="${thrall.uuid}"] button[data-action="resistTest"]`, { face: 1 });
        await until(() => thrall.effects.some(e => e.flags?.[SCOPE]?.enslaved), "the control laid");
        await release();
        await until(() => !game.actors.has(chosen[0]), "the chosen skeleton collapsed at the lay");
        assert.equal(hordeLoad(countedMembers(membersOf(necro)), capacityOf(necro)).counted, 2, "one skeleton and the enslaved creature: 2 of 2 places");
      });

      it("collapses the raised dead chosen at the places, and refunds the Mana where the GM's client refuses", async function () {
        this.timeout(300000);
        const necro = await necromancerWith("ZZ Rev Slaver Places", { level: 17, int: 10, spells: ["Enslave the Dead"] });
        const a = await corpse("Bandit", "Rev Place A");
        const t1 = await creature("Risen Skeleton", "Rev Thrall A");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: t1, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Place A")] });
        assert.equal(capacityOf(necro).total, 2, "Int 10: two places");
        const [s1] = hordeOf(necro);
        await bankMana(necro);
        const card = await castWith(necro, "Enslave the Dead", { targets: [tokenOf(t1)], steps: [app => tick(app, [s1.name])] });
        assert.ok(card?.flags[SCOPE].enslave?.collapse?.length, "the collapse rides the card");
        // Refusal: the second skeleton gone before the control lands, a raise filling the places again.
        const manaBefore = manaOf(necro).value;
        const filler = await corpse("Bandit", "Rev Place B");
        await canvas.scene.createEmbeddedDocuments("Token", [await tokenData(filler, { x: 500, y: 900, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
        await until(() => tokenOf(filler), "the filler corpse");
        await bankMana(necro);
        const second = await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Rev Place B"), app => tick(app, [s1.name])] });
        assert.ok(second?.flags?.[SCOPE]?.success, "the second Raise Dead was cast, collapsing the skeletons chosen at the places");
        assert.lengthOf(hordeOf(necro), 2, `two new skeletons stand: ${hordeOf(necro).map(x => x.name).join(", ")}`);
        const manaAfterRaise = manaOf(necro).value;
        assert.deepEqual(hordeOf(necro).map(x => x.id).filter(id => id === s1.id), [], "the chosen skeleton collapsed at the second raise");
        assert.equal(hordeLoad(countedMembers(membersOf(necro)), capacityOf(necro)).counted, 2, "the places are full again");
        const warned = [];
        const original = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
        try {
          const { release } = await pressCard(card, `[data-resist-owner="${t1.uuid}"] button[data-action="resistTest"]`, { face: 1 });
          try {
            await until(() => manaOf(necro).value > manaAfterRaise, "the Mana refunded", 30000);
          } catch (err) {
            throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}; enslaved: ${t1.effects.some(e => e.flags?.[SCOPE]?.enslaved)}; card: ${JSON.stringify(game.messages.get(card.id)?.flags?.[SCOPE]?.pressed ?? {})}`);
          } finally {
            await release();
          }
        } finally {
          ui.notifications.warn = original;
        }
        assert.isFalse(t1.effects.some(e => e.flags?.[SCOPE]?.enslaved), "no control laid");
        assert.ok(warned.some(w => /no longer fits/.test(w)), "the refusal said in words");
        assert.isAtLeast(manaBefore, 0);
      });
    });

    /* ---------------------------------------------------------------- */
    /*  The grafts that fire on their own (Q7)                           */
    /* ---------------------------------------------------------------- */

    describe("Meat Hook, Grasping Arms and Plague Bladder fire on their own (the lead's Q7)", function () {
      it("a Chain hook hit asks the Test and a failure pulls the creature beside the Abomination, with its cue", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Hooker", { level: 11, spells: ["Stitch Abomination"], ranks: { "Surgeon's Hand": 2 } });
        const foe = await creature("Bandit", "Rev Hooked", 40);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 1300, y: 650, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 3);
        setStitchPick(() => ({ x: 750, y: 650 }));
        try {
          await castWith(necro, "Stitch Abomination", { steps: [app => tick(app, ["Meat Hook", "Grasping Arms", "Plague Bladder"])] });
        } finally {
          setStitchPick(null);
        }
        const abom = hordeOf(necro).find(x => x.name === "Abomination");
        assert.equal(abom.getFlag(SCOPE, "graftDC"), necro.system.spellDC, "the Spell DC stamped at the raise");
        assert.isTrue(abom.system.creatureAbilities.filter(a => /Meat Hook|Plague Bladder|Grasping Arms/.test(a.name)).every(a => a.automation.kind === "passive"), "no Use button to press twice");
        const asked = nextCard(m => m.flags?.[SCOPE]?.kind === "graftTest" && m.flags[SCOPE].graftTest.graft === "meatHook");
        await npcAttacks(abom, "Chain hook", foe);
        const test = await asked;
        const pulled = nextCard(m => m.flags?.[SCOPE]?.featureKey === "graft:meat-hook");
        const startX = tokenOf(foe).document.x;
        const { release } = await pressCard(test, 'button[data-action="resistTest"][data-purpose="graft"]', { face: 1 });
        const cue = await pulled;
        await release();
        await until(() => tokenOf(foe).document.x < startX, "pulled toward the Abomination");
        assert.isTrue(cardRecords(cue).some(r => r.identifier === "graft:meat-hook" && FEATURE_ANIMATIONS["graft:meat-hook"]), "the pull plays its cue");
        // The Test is made once.
        const warned = [];
        const original = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
        try {
          const again = await pressCard(test, 'button[data-action="resistTest"][data-purpose="graft"]', { face: 1, allowDisabled: true }).catch(() => null);
          await sleep(1500);
          await again?.release?.();
        } finally {
          ui.notifications.warn = original;
        }
        assert.ok(game.messages.get(test.id).flags[SCOPE].pressed?.graftTest, "the press is recorded on the card");
      });

      it("a melee hit asks Grasping Arms and a failure lays Entangled with A1's escape; an enemy starting its turn beside the bladder is asked", async function () {
        this.timeout(300000);
        const necro = await necromancerWith("ZZ Rev Arms", { level: 11, spells: ["Stitch Abomination"], ranks: { "Surgeon's Hand": 2 } });
        const foe = await creature("Bandit", "Rev Held", 60);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 850, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 2);
        setStitchPick(() => ({ x: 750, y: 650 }));
        try {
          await castWith(necro, "Stitch Abomination", { steps: [app => tick(app, ["Grasping Arms", "Plague Bladder"])] });
        } finally {
          setStitchPick(null);
        }
        const abom = hordeOf(necro).find(x => x.name === "Abomination");
        const asked = nextCard(m => m.flags?.[SCOPE]?.kind === "graftTest" && m.flags[SCOPE].graftTest.graft === "graspingArms");
        await npcAttacks(abom, "Cleaver", foe);
        const test = await asked;
        const { release } = await pressCard(test, 'button[data-action="resistTest"][data-purpose="graft"]', { face: 1 });
        // The escape is written onto the condition's own effect straight after it lands: wait for it.
        const held = await until(() => foe.effects.find(e => e.statuses?.has?.("entangled") && e.flags?.[SCOPE]?.escape), "Entangled, carrying its escape");
        await release();
        assert.include(held.flags[SCOPE].escape, { condition: "entangled", on: "action", resilience: "reflex", dc: necro.system.spellDC }, "A1's escape at the Spell DC");
        // The bladder: the foe starts its turn within 5 feet of the Abomination.
        const bladder = nextCard(m => m.flags?.[SCOPE]?.kind === "graftTest" && m.flags[SCOPE].graftTest.graft === "plagueBladder", 60000);
        const combat = await fightWith([necro, abom, foe]);
        await nextTurnUntil(foe, combat);
        const card = await bladder;
        assert.equal(card.flags[SCOPE].graftTest.victimUuid, foe.uuid, "asked of the enemy starting its turn");
        await combat.delete();
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Lichdom                                                          */
    /* ---------------------------------------------------------------- */

    describe("Lichdom", function () {
      it("a lich's heal is refused on a living ally in words; the Long Rest opens the window and the binding plays its cue", async function () {
        this.timeout(240000);
        const lich = await necromancerWith("ZZ Rev Lich", { level: 20 });
        await until(() => lich.items.some(i => i.type === "feature" && i.name === "Lichdom"), "Lichdom granted");
        const ally = await makeCharacter({ name: "ZZ Rev Living Ally", classes: [["Warrior", 5]], race: "Human" });
        await ally.update({ "system.health.value": 3 });
        await ally.applyHealing(6, { from: lich, spell: true, school: "shadow" });
        assert.equal(ally.system.health.value, 3, "the lich's heal does not reach a living ally");
        const pack = game.packs.get("azeroth-rpg.gear");
        const phylactery = (await pack.getDocuments()).find(d => d.name === "Phylactery");
        await lich.createEmbeddedDocuments("Item", [phylactery.toObject()], { azerothBags: "bypass" });
        await pressLongRest(lich, () => Boolean(lich.getFlag(SCOPE, "phylacteryWindow")), "the window opened by the sheet's Long Rest");
        const feature = lich.items.find(i => i.type === "feature" && i.name === "Lichdom");
        const bound = nextCard(m => m.flags?.[SCOPE]?.featureKey === "lichdom:bind");
        const { pressUse } = await import("./quench-chronomancer-common.mjs");
        pressUse(lich, "Lichdom").catch(() => null);
        await pick(await chooser(feature), "Bind yourself");
        const card = await bound;
        assert.isTrue(cardRecords(card).some(r => r.identifier === "lichdom:bind"), "the binding plays its row");
        // The window closes after its hour.
        await lich.setFlag(SCOPE, "phylacteryWindow", { at: game.time.worldTime - 4000 });
        const warned = [];
        const original = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
        try {
          pressUse(lich, "Lichdom").catch(() => null);
          await sleep(2000);
        } finally {
          ui.notifications.warn = original;
        }
        assert.ok(warned.some(w => /Long Rest/.test(w)), "a window an hour old is closed, said in words");
      });
    });

    /* ---------------------------------------------------------------- */
    /*  The empower lines fix run 1 left untested live                   */
    /* ---------------------------------------------------------------- */

    describe("Lasting on a carrier and Far-reaching at targets and at Place area", function () {
      it("Far-reaching lets Field of Bones' Place area land past its 60 feet, refused in words without it", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Rev Place", { level: 5, spells: ["Field of Bones"] });
        await sceneWith([{ actor: necro, x: 300, y: 600 }]);
        await canvas.animatePan({ x: 1300, y: 650, scale: 0.5, duration: 0 });
        await settle();
        const far = { x: tokenOf(necro).center.x + 90 * 20, y: tokenOf(necro).center.y };
        const regionsOf = card => canvas.scene.regions.filter(r => r.flags?.[SCOPE]?.cast === card.flags[SCOPE].cast);
        await bankMana(necro);
        // Plain: a point 90 feet off is refused in words, and the pick waits on.
        const plain = await castWith(necro, "Field of Bones");
        assert.ok(plain?.flags[SCOPE].success, "cast");
        const warned = [];
        const original = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
        try {
          const p1 = await pressCard(plain, 'button[data-action="placeArea"]');
          await until(() => game.system.azeroth.canvas.pickState(), "the pick to wait", 10000);
          await settle();
          pressBoard(far);
          await sleep(1200);
          assert.lengthOf(regionsOf(plain), 0, "no area 90 feet off a 60 ft Range");
          assert.isAbove(warned.length, 0, "refused in words");
          game.system.azeroth.canvas.cancelPick();
          await p1.release();
        } finally {
          ui.notifications.warn = original;
        }
        // Far-reaching: the same point lands.
        await bankMana(necro);
        await bankEssence(necro, 1);
        const empowered = await castWith(necro, "Field of Bones", { lines: ["empower-farReaching"] });
        assert.equal(empowered.flags[SCOPE].empower?.farReaching, true, "the card records Far-reaching");
        const p2 = await pressCard(empowered, 'button[data-action="placeArea"]');
        await until(() => game.system.azeroth.canvas.pickState(), "the pick to wait", 10000);
        await settle();
        pressBoard(far);
        await until(() => regionsOf(empowered).length === 1, "the area 90 feet off, inside the doubled 120");
        await p2.release();
      });

      it("Far-reaching lets Bone Shards reach a target past its 30 feet, refused without it", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Reach", { level: 5, spells: ["Bone Shards"] });
        const foe = await creature("Bandit", "Rev Far", 30);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 1100, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        const words = await refusedCast(necro, "Bone Shards", { targets: [tokenOf(foe)] });
        assert.ok(words, "40 feet past a 30 ft Range is refused");
        const card = await castWith(necro, "Bone Shards", { lines: ["empower-farReaching"], targets: [tokenOf(foe)] });
        assert.ok(card?.flags[SCOPE].success, "doubled to 60 feet, it is cast");
        assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
      });

      it("Lasting doubles a laid spell's span on its carrier (Bone Ward, 1 minute to 2)", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Rev Lasting", { level: 5, spells: ["Bone Ward"] });
        await sceneWith([{ actor: necro, x: 300, y: 600 }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        const card = await castWith(necro, "Bone Ward", { lines: ["empower-lasting"], targets: [tokenOf(necro)] });
        assert.ok(card?.flags[SCOPE].success, "cast");
        const apply = document.querySelector(`[data-message-id="${card.id}"] [data-action="applySpellEffect"]`);
        if (apply) apply.click();
        const ward = await until(() => necro.effects.find(e => e.name === "Bone Ward"), "the ward's carrier");
        assert.equal(ward.duration.seconds ?? (ward.duration.rounds ?? 0) * 6, 120, "two minutes, doubled from one");
      });
    });
  });
}
