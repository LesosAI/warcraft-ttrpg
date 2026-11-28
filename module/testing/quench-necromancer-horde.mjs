/**
 * **THE NECROMANCER'S HORDE, ITS GRAFTS, ITS FEATURES AND LICHDOM, THROUGH THE REAL DOORS** (the
 * Necromancer plan's Phase 4b: door 3, the raise spells, door 15, the features with doors, door 14;
 * Phase 7's live checks). Every raise is cast from the sheet's own Cast with its choosers answered
 * as a player answers them; every Use is pressed from the sheet; every offer is pressed on its card;
 * every death is written as a blow writes it.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-horde`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, fightWith, manaOf, pick, pressCard, pressUse, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { capacityOf, hordeActorsOf, membersOf, setStitchPick } from "../effects/necromancer-horde.mjs";
import { HORDE_LEAD_FLAG } from "../rules/horde.mjs";
import { hordeLoad } from "../rules/horde.mjs";
import { countedMembers, standAgainHealth } from "../rules/necromancer-features.mjs";
import { checkOverlap, checkText } from "./geometry.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const bondOf = actor => actor.getFlag(SCOPE, "bond") ?? null;
const NECROS = [];

/** A Necromancer at a level, Intelligence 16 (+3, five places), Constitution 14 (a cap of 5). */
async function necromancerWith(name, { level = 5, race = "Human", spells = [], talents = [] } = {}) {
  const n = await makeCharacter({ name, classes: [["Necromancer", level]], race, spells, talents, abilities: { int: 16, con: 14 } });
  NECROS.push(n);
  await until(() => essenceOf(n), "the Essence pool");
  // Grave Calling's two spells, embedded by the feature sync.
  await until(() => ["Raise Dead", "Animate Corpse"].every(s => n.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
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
  // The chooser names a corpse by its TOKEN's name, so the prototype takes the test's name too.
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

/** The world's horde creatures of this Necromancer, oldest first. */
const hordeOf = necro => hordeActorsOf(necro).sort((a, b) => (bondOf(a).since ?? 0) - (bondOf(b).since ?? 0));

/** Tick these names in a multi-pick chooser and press its button. */
async function tick(app, names) {
  for (const box of app.element.querySelectorAll('input[name="choice"]')) {
    const label = box.closest("label")?.textContent?.trim() ?? "";
    box.checked = names.some(n => label.startsWith(n));
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/**
 * **CAST FROM THE SHEET, ANSWERING EACH CHOOSER IN TURN** - `steps` a list of `async app => ...`, one
 * a chooser the cast opens (the corpses, what they rise as, the grafts, the school, the places). The
 * spell card, or null where the cast posted none within the wait.
 */
async function castWith(actor, spellName, steps = [], { face = 19, ms = 40000, targets = [], lines = [] } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  if (!control) throw new Error(`the sheet draws no Cast for ${spellName}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, lines.length ? "always" : "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    const warned = [];
    const original = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
    try {
      control.click();
      // The cast dialog's own lines, ticked by their checkboxes, then Roll.
      if (lines.length) {
        const dialog = await until(() => {
          const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
          return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
        }, `${spellName}'s roll dialog`);
        for (const id of lines) {
          const box = dialog.element.querySelector(`input[name="tline-${id}"]`);
          if (!box) throw new Error(`the dialog draws no line ${id}`);
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
        dialog.element.querySelector('button[data-action="roll"]').click();
      }
      for (const step of steps) {
        let app = null;
        try {
          app = await chooser(spell, 15000);
        } catch (err) {
          throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}`);
        }
        await step(app);
        await sleep(150);
      }
      const card = await posted;
      if (!card && warned.length) throw new Error(`${spellName} posted no card; warnings: ${warned.join(" | ")}`);
      return card;
    } finally {
      ui.notifications.warn = original;
    }
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** The Combat tab's horde panel, rendered. */
async function panelOf(actor) {
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const group = sheet.element.querySelector('details[data-combat-section="horde"]');
  if (group && !group.open) group.open = true;
  await settle();
  return { sheet, panel: sheet.element.querySelector(".azeroth-horde-panel") };
}

export function necromancerHordeBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Necromancer's horde (Phase 4b)", function () {
    let restoreDialog = null;
    let restoreText = null;
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(240000);
      setStitchPick(null);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-grave-guard-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      // The raised dead are world actors the test's ZZ sweep does not name: every one bound to a
      // Necromancer this batch made goes, and each Necromancer's horde folder after them.
      const owners = new Set(NECROS.map(n => n.uuid));
      for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete().catch(() => {});
      for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    describe("door 3: Command the Dead and the raise spells", function () {
      let necro = null;
      it("Raise Dead twice and Ghoul Rising fill 5 of 5 places, each one linked actor with Deathly Vigor's 3 temporary Health, in the caster's own folder", async function () {
        this.timeout(240000);
        necro = await necromancerWith("ZZ Necro Horde", { level: 5, spells: ["Ghoul Rising", "Grave Sense"] });
        const a = await corpse("Bandit", "Corpse A");
        const b = await corpse("Bandit", "Corpse B");
        const c = await corpse("Bandit", "Corpse C");
        await sceneWith([
          { actor: necro, x: 300, y: 600 },
          { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }, { actor: c, x: 500, y: 1000, side: "hostile" }
        ]);
        for (const [spell, who] of [["Raise Dead", "ZZ Corpse A"], ["Raise Dead", "ZZ Corpse B"], ["Ghoul Rising", "ZZ Corpse C"]]) {
          await bankMana(necro);
          const card = await castWith(necro, spell, [app => pick(app, who)]);
          assert.ok(card?.flags[SCOPE].success, `${spell} was cast`);
          assert.isAbove(card.flags[SCOPE].risen?.[0]?.tokenIds?.length ?? 0, 0, `${spell}'s card records what rose`);
        }
        const horde = hordeOf(necro);
        assert.deepEqual(horde.map(x => x.name), ["Risen Skeleton", "Risen Skeleton", "Risen Skeleton", "Risen Skeleton", "Plagued Ghoul"], "two pairs and a ghoul");
        const load = hordeLoad(countedMembers(membersOf(necro)), capacityOf(necro));
        assert.equal(load.counted, 5, "the horde reads 5 places");
        assert.equal(capacityOf(necro).total, 5, "of 5: 2 plus Intelligence +3");
        for (const x of horde) {
          assert.isTrue(x.prototypeToken.actorLink, `${x.name} is one linked actor`);
          assert.equal(x.system.health.temp, 3, `${x.name} rose with Deathly Vigor's 3 temporary Health`);
          assert.isFalse(x.system.creatureAbilities.some(ab => ab.name === "Loose Bones"), `${x.name} does not use Loose Bones`);
          assert.equal(necro.effects.filter(e => e.flags?.[SCOPE]?.raised?.raiseId === bondOf(x).raiseId).length, 1, `${x.name} has one carrier`);
        }
        const folder = game.folders.find(f => f.type === "Actor" && f.getFlag(SCOPE, "hordeOf") === necro.uuid);
        assert.ok(folder, "the Necromancer's own Actors folder exists");
        assert.include(folder.name, necro.name, "named for the caster");
        assert.isTrue(horde.every(x => x.folder?.id === folder.id), "every raised dead stands in it");
        assert.equal(necro.getFlag(SCOPE, HORDE_LEAD_FLAG)?.id, horde[0].id, "the first creature raised is the lead");
        // The corpse rule: each corpse used up.
        assert.equal(tokenOf(a).document.getFlag(SCOPE, "corpse")?.state, "raised", "a raise uses up its corpse");
      });

      it("a fourth raise opens the collapse chooser BEFORE any Mana is paid, and a dismissed chooser pays nothing", async function () {
        this.timeout(120000);
        const d = await corpse("Bandit", "Corpse D");
        await d.update({ "prototypeToken.actorLink": true });
        await canvas.scene.createEmbeddedDocuments("Token", [await tokenData(d, { x: 700, y: 600, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
        await until(() => tokenOf(d), "corpse D on the board");
        await bankMana(necro);
        const manaBefore = manaOf(necro).value;
        const spell = necro.items.find(i => i.name === "Raise Dead");
        let posted = false;
        const id = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell") posted = true; });
        try {
          const sheet = await openSheet(necro);
          sheet.changeTab("spells", "primary");
          await settle();
          sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`).click();
          await pick(await chooser(spell), "ZZ Corpse D");
          const collapse = await chooser(spell);
          assert.match(collapse.element.textContent, /collapse/i, "the places chooser asks who collapses");
          assert.equal(manaOf(necro).value, manaBefore, "no Mana is paid while it stands open");
          await collapse.close();
          await sleep(1500);
          await sheet.close();
        } finally {
          Hooks.off("createChatMessage", id);
        }
        assert.isFalse(posted, "no card: the cast stopped");
        assert.equal(manaOf(necro).value, manaBefore, "a dismissed chooser pays nothing");
        assert.equal(hordeOf(necro).length, 5, "nothing collapsed");
      });

      it("one skeleton of a pair is dismissed alone from the panel, through its carrier", async function () {
        this.timeout(60000);
        const [first, second] = hordeOf(necro);
        const { sheet, panel } = await panelOf(necro);
        assert.ok(panel, "the Combat tab draws the horde panel");
        assert.match(panel.textContent, /5 \/ 5 places/, "the panel reads 5 / 5 places");
        assert.match(panel.textContent, /Lead/i, "the lead is marked in words");
        // Legible and unoverprinted, measured (D-608), on the Combat tab and the Overview's row.
        const text = checkText(panel, { requireGroundWithin: true });
        assert.deepEqual(text, [], `the panel's text: ${JSON.stringify(text).slice(0, 400)}`);
        const over = checkOverlap(panel);
        assert.deepEqual(over, [], `the panel overprints: ${JSON.stringify(over).slice(0, 400)}`);
        sheet.changeTab("overview", "primary");
        await settle();
        const row = sheet.element.querySelector("[data-horde-overview]");
        assert.ok(row, "the Overview draws the compact Essence row");
        assert.match(row.textContent, /Essence \d+ \/ 5/, "Essence n / cap");
        assert.deepEqual(checkText(row.parentElement, { requireGroundWithin: true }).filter(f => row.contains(f.el ?? null)), [], "the row's text is legible");
        sheet.changeTab("combat", "primary");
        await settle();
        const button = panel.querySelector(`[data-horde-id="${second.id}"] [data-action="dismissRaised"]`);
        assert.ok(button, "the row has its own Dismiss");
        button.click();
        await until(() => !game.actors.has(second.id), "the skeleton collapsed");
        assert.isTrue(game.actors.has(first.id), "its pair still stands");
        // The creature goes first and its carrier straight after (`collapseNow`): wait for the carrier.
        await until(() => !necro.effects.some(e => e.flags?.[SCOPE]?.raised?.actorUuid === second.uuid), "its carrier went with it");
        await sheet.close();
      });

      it("the shared turn: the named lead takes two Half-Actions and a Reaction, every other one Half-Action and none", async function () {
        this.timeout(180000);
        const horde = hordeOf(necro);
        const ghoul = horde.find(x => x.name === "Plagued Ghoul");
        const skeleton = horde.find(x => x.name === "Risen Skeleton");
        // **NAMED AT A CAST THROUGH THE CAST DIALOG'S OWN LINE** (the 4b review's tests: the real
        // control, never `nameLead`): Grave Sense (no corpse, no target) cast from the sheet with the
        // line ticked, the one chooser naming the ghoul. Out of a cast a lead standing is not replaced:
        // the panel draws no Make lead on the ghoul's row while the first skeleton leads (the fix
        // runs' review: the panel's own control, never `nameLead` called by hand).
        {
          const sheet = await openSheet(necro);
          try {
            sheet.changeTab("combat", "primary");
            await settle();
            const group = sheet.element.querySelector('details[data-combat-section="horde"]');
            if (group && !group.open) group.open = true;
            await settle();
            const row = await until(() => sheet.element.querySelector(`[data-horde-id="${ghoul.id}"]`), "the ghoul's row on the panel");
            assert.isNull(row.querySelector('[data-action="makeHordeLead"]'), "a lead standing: the panel offers no Make lead");
          } finally {
            await sheet.close();
          }
        }
        await bankMana(necro);
        const cast = await castWith(necro, "Grave Sense", [app => pick(app, "Plagued Ghoul")], { lines: ["horde-lead"] });
        assert.ok(cast, "the cast was made with the line ticked");
        assert.deepEqual(necro.getFlag(SCOPE, HORDE_LEAD_FLAG), { id: ghoul.id, previous: horde[0].id, taken: false }, "from the ghoul's next turn"); 
        const combat = await fightWith([necro, ...horde]);
        const budgetOf = actor => combat.combatants.find(c => c.actorId === actor.id)?.getFlag(SCOPE, "budget") ?? null;
        // Each creature's own turn writes its budget: move the fight to each in turn.
        const { nextTurnUntil } = await import("./quench-chronomancer-common.mjs");
        await nextTurnUntil(ghoul, combat);
        await until(() => budgetOf(ghoul)?.halfActions === 2 && budgetOf(ghoul)?.reactions === 1, "the lead's own turn");
        assert.isTrue(necro.getFlag(SCOPE, HORDE_LEAD_FLAG)?.taken, "the lead is taken at its turn");
        await nextTurnUntil(skeleton, combat);
        await until(() => budgetOf(skeleton)?.halfActions === 1, "a skeleton's turn");
        assert.equal(budgetOf(skeleton).reactions, 0, "a skeleton keeps no Reaction");
        await combat.delete();
      });

      it("Command the Dead's Empowered line gives every creature two Half-Actions on its next turn, for 1 Essence", async function () {
        this.timeout(120000);
        await bankEssence(necro, 2);
        const { card } = await pressUse(necro, "Command the Dead");
        const message = await card;
        assert.ok(message, "the Use posted its card");
        assert.equal(message.flags[SCOPE].featureKey, "command-the-dead", "under its key");
        assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
        assert.isAbove(message.flags[SCOPE].targets?.length ?? 0, 0, "the horde's tokens recorded");
        const skeleton = hordeOf(necro).find(x => x.name === "Risen Skeleton");
        assert.ok(skeleton.getFlag(SCOPE, "hordeSurge"), "the skeleton carries the surge");
        const combat = await fightWith([necro, ...hordeOf(necro)]);
        const { nextTurnUntil } = await import("./quench-chronomancer-common.mjs");
        await nextTurnUntil(skeleton, combat);
        await until(() => combat.combatants.find(c => c.actorId === skeleton.id)?.getFlag(SCOPE, "budget")?.halfActions === 2, "two Half-Actions on its next turn");
        await until(() => !skeleton.getFlag(SCOPE, "hordeSurge"), "the surge spent by that turn");
        await combat.delete();
      });
    });

    describe("door 15: Stitch Abomination's grafts", function () {
      it("Meat Hook, Warded Hide (Fire) and Swollen for 3 Essence, no corpse asked; the Abomination keeps its Reaction and takes 2 places", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Stitcher", { level: 11, spells: ["Stitch Abomination"] });
        await sceneWith([{ actor: necro, x: 400, y: 800 }]);
        await bankMana(necro);
        await bankEssence(necro, 3);
        setStitchPick(() => ({ x: 750, y: 850 }));
        const card = await castWith(necro, "Stitch Abomination", [
          app => tick(app, ["Meat Hook", "Warded Hide", "Swollen"]),
          app => pick(app, "Fire")
        ]);
        setStitchPick(null);
        assert.ok(card?.flags[SCOPE].success, "cast");
        const abom = hordeOf(necro).find(x => x.name === "Abomination");
        assert.ok(abom, "an Abomination rose");
        assert.deepEqual(abom.getFlag(SCOPE, "grafts"), ["meatHook", "wardedHide", "swollen"], "its sheet lists the three grafts");
        assert.equal(abom.system.ward.fire, 3, "Warded Hide: Ward 3 against Fire");
        assert.equal(abom.system.health.max, 80 + 15, "Swollen: five times tier 3");
        assert.equal(abom.system.attacks.find(r => r.name === "Chain hook").range, 30, "the Chain hook reaches 30 ft");
        assert.ok(abom.system.creatureAbilities.some(r => r.automation?.plan?.forced?.toward === "toward"), "the Hook's pull is an ability");
        assert.equal(essenceOf(necro).value, 0, "3 Essence spent");
        assert.isTrue(bondOf(abom).keepsReaction, "it keeps its Reaction");
        assert.equal(hordeLoad(countedMembers(membersOf(necro)), capacityOf(necro)).counted, 2, "an Abomination takes 2 places");
        const raisedWith = card.flags[SCOPE].raisedWith ?? [];
        assert.ok(raisedWith.some(e => e.key === "graft:stitch"), "the card records the stitching");
      });
    });

    describe("the features with doors", function () {
      it("Claim the Fallen offers Raise Dead when a living enemy dies within 30 feet, and casts it as a Reaction on that corpse", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Claimer", { level: 9 });
        const foe = await makeNpc("Bandit");
        await foe.update({ name: "ZZ Claimed Bandit" });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const offered = untilHook("createChatMessage", 20000, m => m.flags?.[SCOPE]?.offer === "claim").then(([m]) => { made.push(m); return m; });
        await foe.update({ "system.health.value": 0 });
        const offer = await offered;
        assert.ok(offer, "the offer card posted");
        const manaBefore = manaOf(necro).value;
        const castDone = untilHook("createChatMessage", 30000, m => m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell").then(([m]) => { made.push(m); return m; });
        const { release } = await pressCard(offer, 'button[data-action="claimTheFallen"][data-spell="raise-dead"][data-empowered="false"]', { face: 19 });
        const card = await castDone;
        await release();
        assert.ok(card?.flags[SCOPE].success, "Raise Dead cast");
        assert.equal(hordeOf(necro).length, 2, "two skeletons from that corpse");
        assert.equal(manaOf(necro).value, manaBefore - 5, "the spell's Mana paid");
      });

      it("Grave Guard moves a blow to a skeleton within 10 feet, and what passes its Health is dealt to the Necromancer", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Guard", { level: 11 });
        const c = await corpse("Bandit", "Guard Corpse");
        const brute = await makeNpc("Bandit");
        await brute.update({ name: "ZZ Guard Brute", "prototypeToken.name": "ZZ Guard Brute" });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: c, x: 500, y: 600, side: "hostile" }, { actor: brute, x: 200, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", [app => pick(app, "ZZ Guard Corpse")]);
        const skeleton = hordeOf(necro)[0];
        const skelToken = tokenOf(skeleton);
        await skelToken.document.update({ x: 400, y: 600 });
        await sleep(800);
        // One point of room: the brute's blow passes it, and the rest comes back to the Necromancer.
        await skeleton.update({ "system.health.temp": 0, "system.health.value": 1 });
        await necro.update({ "system.health.value": necro.system.health.max });
        const before = necro.system.health.value;
        // **A REAL ATTACK CARD, PRESSED** (the 4b review's tests): the brute's Hand axe from its own
        // sheet, then the card's Apply - the blow carries its record, so the servant's Armor Points
        // re-resolve it (D-1074).
        canvas.tokens?.setTargets([tokenOf(necro).id]);
        const bruteSheet = await openSheet(brute);
        const unpin = pinDie(19);
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === brute.id && m.flags?.[SCOPE]?.kind === "attack").then(([m]) => { made.push(m); return m; });
        let attack = null;
        try {
          (await until(() => bruteSheet.element.querySelector('[data-action="rollAttack"][data-attack="0"]'), "the brute's attack")).click();
          attack = await posted;
        } finally {
          unpin();
          canvas.tokens?.setTargets([]);
          await bruteSheet.close();
        }
        const { release } = await pressCard(attack, '[data-action="applyDamage"]');
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-grave-guard-")) ?? null, "Grave Guard's question");
        ask.element.querySelector(`button[data-action="r:${skeleton.id}"]`).click();
        await until(() => !game.actors.has(skeleton.id), "the skeleton at 0 collapses");
        await until(() => necro.system.health.value < before, "the overflow dealt to the Necromancer");
        await release();
        const guard = game.messages.contents.filter(m => m.flags?.[SCOPE]?.featureKey === "grave-guard").at(-1);
        assert.match(guard?.content ?? "", /comes back|beyond|passes|dealt/i, "the card says what passed the servant");
      });

      it("Dark Ritual at tier 3 collapses a ghoul at 12 Health and restores 9 Mana", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Ritual", { level: 14, spells: ["Ghoul Rising"] });
        const c = await corpse("Bandit", "Ritual Corpse");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: c, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Ghoul Rising", [app => pick(app, "ZZ Ritual Corpse")]);
        const ghoul = hordeOf(necro)[0];
        await ghoul.update({ "system.health.temp": 0 });
        await bankMana(necro, 10);
        const feature = necro.items.find(i => i.type === "feature" && i.name === "Dark Ritual");
        const { card } = await pressUse(necro, "Dark Ritual");
        await pick(await chooser(feature), "Plagued Ghoul");
        const message = await card;
        assert.ok(message, "the Use posted its card");
        await until(() => !game.actors.has(ghoul.id), "the ghoul collapsed");
        assert.equal(manaOf(necro).value, Math.min(manaOf(necro).max, 19), "12 Health, capped at three times tier 3: 9 Mana");
      });

      it("Unending Dead stands a fallen skeleton again with half its Health, for 1 Essence, once", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Unending", { level: 17 });
        const c = await corpse("Bandit", "Unending Corpse");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: c, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", [app => pick(app, "ZZ Unending Corpse")]);
        await bankEssence(necro, 2);
        const skeleton = hordeOf(necro)[0];
        const offered = untilHook("createChatMessage", 20000, m => m.flags?.[SCOPE]?.offer === "unending").then(([m]) => { made.push(m); return m; });
        await skeleton.update({ "system.health.temp": 0, "system.health.value": 0 });
        const offer = await offered;
        const { release } = await pressCard(offer, 'button[data-action="unendingDead"][data-fall="false"]');
        // Half its maximum, read through the rule (the phase 5 run: the test pinned 1, half of the Risen Skeleton's
        // old 3, and D-1900 raised the bestiary's Health a quarter, to 4).
        const half = standAgainHealth(skeleton.system.health.max);
        await until(() => skeleton.system.health.value === half, `standing again with half its Health (${half})`);
        await release();
        assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
        assert.isTrue(skeleton.getFlag(SCOPE, "stoodAgain"), "once");
      });

      it("Enslave the Dead holds an undead creature in the horde, and hands it back without deleting it", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Enslaver", { level: 17, spells: ["Enslave the Dead"] });
        const ghoul = await makeNpc("Risen Skeleton");
        await ghoul.update({ name: "ZZ Wild Skeleton" });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: ghoul, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Enslave the Dead", [], { targets: [tokenOf(ghoul)] });
        assert.ok(card?.flags[SCOPE].enslave, "the card carries the control's plan");
        const { release } = await pressCard(card, '[data-resist-owner] button[data-action]', { face: 1 });
        await until(() => ghoul.effects.some(e => e.flags?.[SCOPE]?.enslaved), "the control laid");
        await release();
        assert.equal(tokenOf(ghoul).document.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY, "on the caster's side");
        assert.ok(membersOf(necro).some(m => m.controlled), "it counts in the horde");
        const effect = ghoul.effects.find(e => e.flags?.[SCOPE]?.enslaved);
        await effect.delete();
        await until(() => tokenOf(ghoul).document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE, "handed back to its own side");
        assert.isTrue(game.actors.has(ghoul.id), "and never deleted");
      });

      it("The Dead Rise stands its dead outside the horde for an hour", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Necro Rising", { level: 20, spells: ["The Dead Rise"] });
        const a = await corpse("Bandit", "Rise A");
        const b = await corpse("Bandit", "Rise B");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "The Dead Rise", [app => tick(app, ["ZZ Rise A", "ZZ Rise B"]), app => pick(app, "2 Risen Skeleton")]);
        assert.ok(card?.flags[SCOPE].success, "cast");
        const risen = hordeOf(necro);
        assert.equal(risen.length, 2, "two rose");
        assert.isTrue(risen.every(x => bondOf(x).outside), "outside the horde");
        assert.equal(hordeLoad(countedMembers(membersOf(necro)), capacityOf(necro)).counted, 0, "taking no places");
        assert.isTrue(necro.effects.filter(e => e.flags?.[SCOPE]?.raised).every(e => e.duration?.seconds || e.duration?.rounds), "their carriers run an hour");
      });
      it("Plague of Undeath: a creature that fails is plagued, and when it dies it rises as a Plagued Ghoul into the horde at the caster's turn", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Necro Plague", { level: 20, spells: ["Plague of Undeath"] });
        const victim = await makeNpc("Bandit");
        await victim.update({ name: "ZZ Plagued Bandit", "prototypeToken.name": "ZZ Plagued Bandit" });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: victim, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Plague of Undeath", [], { targets: [tokenOf(victim)] });
        assert.ok(card?.flags[SCOPE].success, "cast");
        const { release } = await pressCard(card, '[data-resist-owner] button[data-action="resistTest"]', { face: 1 });
        await until(() => victim.effects.some(e => e.flags?.[SCOPE]?.plagueRise), "the plague's tick and mark laid on the creature that failed");
        await release();
        const tick = victim.effects.find(e => e.flags?.[SCOPE]?.plagueRise).flags[SCOPE].tick;
        assert.include(tick, { kind: "damage", type: "shadow", amount: 4 }, "4 Shadow at the start of each of its turns");
        await victim.update({ "system.health.value": 0 });
        // The rising rides the corpse's own token since the 4b review (MUST-FIX 4), never a queue on the caster.
        await until(() => tokenOf(victim)?.document?.getFlag(SCOPE, "plagueRising")?.casterUuid === necro.uuid, "its death marked on its corpse");
        const offered = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.offer === "rising").then(([m]) => { made.push(m); return m; });
        const combat = await fightWith([necro]);
        const offer = await offered;
        const risenCard = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.featureKey === "horde:rise").then(([m]) => { made.push(m); return m; });
        await pressCard(offer, 'button[data-action="hordeRise"]');
        const rose = await risenCard;
        assert.isAbove(rose.flags[SCOPE].risen?.[0]?.tokenIds?.length ?? 0, 0, "the summon card records the ghoul under horde:rise");
        const ghoul = hordeOf(necro).find(x => x.name === "Plagued Ghoul");
        assert.ok(ghoul, "a Plagued Ghoul stands in the horde");
        assert.isFalse(bondOf(ghoul).keepsReaction, "keeping no Reaction");
        await combat.delete();
      });
    });

    describe("door 11: Lichdom", function () {
      it("a lich takes Ward 3 Frost and Shadow, refuses another's Holy heal in words, and returns through its phylactery", async function () {
        this.timeout(180000);
        const lich = await necromancerWith("ZZ Necro Lich", { level: 20, race: "Human" });
        await until(() => lich.items.some(i => i.type === "feature" && i.name === "Lichdom"), "Lichdom granted");
        assert.isTrue(lich.system.undead, "the lich is undead");
        assert.isAtLeast(lich.system.ward.frost, 3, "Ward 3 Frost");
        assert.isAtLeast(lich.system.ward.shadow, 3, "Ward 3 Shadow");
        const priest = await makeCharacter({ name: "ZZ Necro Priest", classes: [["Priest", 5]], race: "Human", spells: ["Holy Light"] });
        await lich.update({ "system.health.value": 5 });
        // **A PRIEST CASTS THE HEAL** (the fix runs' review: never `applyHealing` by hand): Holy Light from
        // the Priest's sheet at the lich, then the card's own Apply, refused in words.
        await sceneWith([{ actor: lich, x: 300, y: 600 }, { actor: priest, x: 500, y: 600 }]);
        await bankMana(priest);
        const healCard = await castWith(priest, "Holy Light", [], { targets: [tokenOf(lich)] });
        assert.ok(healCard?.flags?.[SCOPE]?.success, "Holy Light was cast");
        // The refusal is said as a line (`HEALING_REFUSAL_WORDS`, an info), naming the lich.
        const said = [];
        const info = ui.notifications.info.bind(ui.notifications);
        const warn = ui.notifications.warn.bind(ui.notifications);
        ui.notifications.info = (msg, ...rest) => { said.push(String(msg)); return info(msg, ...rest); };
        ui.notifications.warn = (msg, ...rest) => { said.push(String(msg)); return warn(msg, ...rest); };
        try {
          const { release } = await pressCard(healCard, '[data-action="applyHealing"]');
          await sleep(1500);
          await release();
        } finally {
          ui.notifications.info = info;
          ui.notifications.warn = warn;
        }
        assert.equal(lich.system.health.value, 5, "another's Holy heal does nothing");
        assert.ok(said.some(w => w.includes(lich.name)), `refused in words: ${said.join(" | ") || "none"}`);
        // The phylactery: bound in a Long Rest's window, through Lichdom's Use.
        const pack = game.packs.get("azeroth-rpg.gear");
        const phylactery = (await pack.getDocuments()).find(d => d.name === "Phylactery");
        assert.ok(phylactery, "the gear pack holds the Phylactery");
        await lich.createEmbeddedDocuments("Item", [phylactery.toObject()], { azerothBags: "bypass" });
        // **THE SHEET'S OWN LONG REST OPENS THE WINDOW** (the 4b review's tests: the real control).
        {
          const sheet = await openSheet(lich);
          const restBefore = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
          try {
            (await until(() => sheet.element.querySelector('[data-action="longRest"]'), "the Long Rest control")).click();
            await until(() => Boolean(lich.getFlag(SCOPE, "phylacteryWindow")), "the window opened by the Long Rest", 60000);
          } finally {
            await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restBefore);
            await sheet.close();
          }
        }
        const feature = lich.items.find(i => i.type === "feature" && i.name === "Lichdom");
        // Lichdom's Use pays nothing and binds; its binding card (`lichdom:bind`, the cue) is the review
        // batch's to read, so here the chooser is answered and the bond itself awaited.
        pressUse(lich, "Lichdom").catch(() => null);
        await pick(await chooser(feature), "Bind yourself");
        const item = lich.items.find(i => i.name === "Phylactery");
        await until(() => lich.getFlag(SCOPE, "phylactery") === item.uuid, "bound to the phylactery");
        // The lich dies: a carrier counts a day.
        await lich.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED ?? "dead", { active: true, overlay: true });
        await until(() => lich.effects.some(e => e.flags?.[SCOPE]?.phylacteryReturn), "the day counting");
        const cardPosted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.offer === "lich").then(([m]) => { made.push(m); return m; });
        await game.time.advance(86400 + 60);
        const returned = await cardPosted;
        assert.ok(returned, "a card 1 day later tells the GM where the lich returns");
        // **THE GM PRESSES THE RETURN CARD** (the real control): full Health, the defeated mark gone.
        const back = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.featureKey === "lichdom").then(([m]) => { made.push(m); return m; });
        await pressCard(returned, 'button[data-action="lichReturn"]');
        await back;
        await until(() => lich.system.health.value === lich.system.health.max, "the lich returns with full Health");
        assert.isFalse(lich.statuses.has(CONFIG.specialStatusEffects.DEFEATED ?? "dead"), "the defeated mark lifted");
        // Destroyed first: no card.
        await lich.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED ?? "dead", { active: true, overlay: true });
        await until(() => lich.effects.some(e => e.flags?.[SCOPE]?.phylacteryReturn), "a second day counting");
        let second = false;
        const id = Hooks.on("createChatMessage", m => { if (m.flags?.[SCOPE]?.offer === "lich") second = true; });
        try {
          await item.delete();
          await until(() => !lich.effects.some(e => e.flags?.[SCOPE]?.phylacteryReturn), "the carrier gone with the phylactery");
          await sleep(1500);
        } finally {
          Hooks.off("createChatMessage", id);
        }
        assert.isFalse(second, "no return card once the phylactery is destroyed");
      });
    });
  });
}
