/**
 * The bestiary, actually automated (D-691), driven against the real thing.
 *
 * The census in `rules/bestiary-automation.test.mjs` says the descriptors are
 * there. This says the CONSUMERS moved, which is the fault a unit test cannot
 * see (CLAUDE.md §15): a Boss spends its points and is refused when short,
 * the points refresh at the top of the round, Archaedas refuses Prone, a
 * footman beside another footman takes +1 Defense and loses it when the other
 * falls, a regenerating creature ticks at the start of its turn and mends
 * nothing after Fire, a creature's Heavy attack draws its Bane, a Sundering
 * critical offers the armor break, and a summon's card places its creatures.
 */

import { cleanup, made, makeNpc, openSheet, pinDie, settle } from "./fixtures.mjs";
import { npcAttackWithDialog } from "../applications/actions.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { SUMMONED_FLAG } from "../documents/summon.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { AZEROTH } from "../config.mjs";

const until = async (fn, what, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
};

/**
 * Collect what a call SAYS, and restore the notifier. Both channels: a
 * refusal warns, and `toggleStatusEffect` names a refused condition with
 * `info` (D-654), so watching one alone reports a silent refusal that spoke.
 */
async function saidDuring(fn) {
  const said = [];
  const originals = { warn: ui.notifications.warn, info: ui.notifications.info };
  for (const key of ["warn", "info"]) {
    ui.notifications[key] = function (message, ...rest) { said.push(String(message)); return originals[key].call(this, message, ...rest); };
  }
  try { return { result: await fn(), said }; }
  finally { Object.assign(ui.notifications, originals); }
}

/** The index of a named row in one of the creature's two lists. */
const rowIndex = (actor, list, name) => (actor.system[list] ?? []).findIndex(r => r.name === name);

export function bestiaryAutomationBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The bestiary, automated (D-691)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      await cleanup();
    });

    /* ---- the descriptors reach the pack ---------------------------------- */

    it("drops a creature out of the pack with its abilities already automated", async function () {
      this.timeout(30000);
      const archaedas = await makeNpc("Archaedas");
      const rows = [...archaedas.system.creatureAbilities, ...archaedas.system.bossActions];
      const inert = rows.filter(r => r.automation.kind === "none" && !r.automation.reason);
      assert.deepEqual(inert.map(r => r.name), [], "an entry that does nothing and does not say why");
      const titan = archaedas.system.creatureAbilities.find(r => r.name === "Titan-Wrought");
      assert.equal(titan.automation.kind, "passive");
      assert.include(titan.automation.passive.refuses, "prone");
    });

    /* ---- passives are ENFORCED (decision 1) ------------------------------ */

    it("refuses Prone on Archaedas through the one door, and names the reason", async function () {
      this.timeout(30000);
      const archaedas = await makeNpc("Archaedas");
      assert.include(archaedas.system.conditionImmunities, "prone", "the refusal never reached the actor");
      const { result, said } = await saidDuring(() => archaedas.toggleStatusEffect("prone", { active: true }));
      assert.isFalse(result, "the toggle went through");
      assert.isFalse(archaedas.statuses.has("prone"));
      assert.isTrue(said.some(s => s.includes(archaedas.name)), `the refusal said nothing: ${JSON.stringify(said)}`);
      // A condition it does NOT refuse still lands.
      assert.isNotFalse(await archaedas.toggleStatusEffect("blinded", { active: true }));
      await archaedas.toggleStatusEffect("blinded", { active: false });
    });

    it("gives a footman +1 Defense beside another footman and takes it back when the other falls", async function () {
      this.timeout(60000);
      const scene = await Scene.create({ name: "ZZ Locked Shields", width: 2000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      const one = await makeNpc("Alliance Footman");
      const two = await makeNpc("Alliance Footman");
      // The gate reads the block's own name, so the tokens must carry it.
      await one.update({ name: "Alliance Footman", "prototypeToken.actorLink": true });
      await two.update({ name: "Alliance Footman", "prototypeToken.actorLink": true });
      // The stored Defense, before anything stands beside it. A creature with
      // no token measures nothing and keeps the passive, so the base is read
      // off the source rather than off an unplaced actor.
      const base = one.system._source.defense;
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 20000);
      const [tokenOne, tokenTwo] = await scene.createEmbeddedDocuments("Token", [
        { ...one.prototypeToken.toObject(), actorId: one.id, actorLink: true, x: 500, y: 500 },
        { ...two.prototypeToken.toObject(), actorId: two.id, actorLink: true, x: 600, y: 500 }
      ]);
      try {
        // Five feet apart: the wall is locked, both ways.
        await until(() => one.system.defense === base + 1, "the shield wall to lock", 10000);
        assert.equal(two.system.defense, base + 1, "the second footman takes nothing from the first");
        // The other falls, and there is nobody to lock shields with.
        await two.update({ "system.health.value": 0 });
        await until(() => one.system.defense === base, "the shield wall to break", 10000);
        // And back up when it stands again.
        await two.update({ "system.health.value": two.system.health.max });
        await until(() => one.system.defense === base + 1, "the shield wall to re-form", 10000);
      } finally {
        await scene.deleteEmbeddedDocuments("Token", [tokenOne.id, tokenTwo.id].filter(Boolean)).catch(() => {});
      }
    });

    it("raises a Grunt's Damage Rating below half its Health, on the attack the sheet rolls", async function () {
      this.timeout(30000);
      const grunt = await makeNpc("Grunt");
      const max = grunt.system.health.max;
      await grunt.update({ "system.health.value": max });
      assert.equal(grunt.system.damageBonus, 0, "Blood Rage is on at full Health");
      await grunt.update({ "system.health.value": Math.floor(max / 2) - 1 });
      assert.equal(grunt.system.damageBonus, 1, "Blood Rage never reached the block");
      const unpin = pinDie(15);
      try {
        const message = await npcAttackWithDialog(grunt, 0);
        made.push(message);
        const rating = grunt.system.attacks[0].damage + 1;
        assert.include(message.content, String(rating), "the card's damage does not carry the standing bonus");
      } finally { unpin(); }
    });

    it("puts a creature's standing Boon and Bane on the roll dialog's own lines", async function () {
      this.timeout(30000);
      const gnoll = await makeNpc("Gnoll");
      assert.include(Object.keys(gnoll.system.skillBanes ?? {}), "stealth", "the Gnoll's Bane on Stealth never reached the block");
      const stealth = prepareRoll(gnoll, { kind: "skill", skill: "stealth", modifiers: [] });
      const bane = stealth.situational.automatic.find(l => l.id === "standingBane");
      assert.ok(bane, "the dialog carries no line for the Gnoll's own Bane");
      assert.equal(bane.banes, 1);
      assert.isTrue(bane.checked, "the roller's own state comes checked");
      // A skill the passive does not name carries nothing.
      const other = prepareRoll(gnoll, { kind: "skill", skill: "athletics", modifiers: [] });
      assert.isUndefined(other.situational.automatic.find(l => l.id === "standingBane"));
      // And the Chimaera's Boon on Perception rides 08 §6's own line.
      const chimaera = await makeNpc("Chimaera");
      const perception = prepareRoll(chimaera, { kind: "skill", skill: "perception", modifiers: [] });
      assert.ok(perception.situational.automatic.find(l => l.id === "gearBoon"), "the Chimaera's Boon on Perception is not on the dialog");
    });

    it("prints what a creature refuses and senses on its own sheet", async function () {
      this.timeout(30000);
      const murloc = await makeNpc("Murloc");
      const sheet = await openSheet(murloc);
      await sheet.changeTab("traits", "primary");
      await settle();
      const text = sheet.element.textContent;
      assert.include(text, game.i18n.localize("AZEROTH.Sheet.Senses"));
      assert.include(text, game.i18n.localize(AZEROTH.creatureSenses.waterBreathing));
      assert.include(text, game.i18n.localize("AZEROTH.Sheet.Refuses"));
      // A passive is not pressed: no Use button on its row.
      const passives = murloc.system.creatureAbilities.filter(r => r.automation.kind === "passive").length;
      assert.isTrue(passives > 0, "the murloc has no standing passive to draw");
      const uses = [...sheet.element.querySelectorAll('[data-action="useAbility"][data-list="creatureAbilities"]')];
      const pressed = uses.map(b => murloc.system.creatureAbilities[Number(b.dataset.index)]);
      assert.deepEqual(pressed.filter(r => r.automation.kind === "passive"), [], "a standing passive carries a Use button");
      await sheet.close();
    });

    /* ---- regeneration ticks at the start of the turn --------------------- */

    it("mends a regenerating creature at the start of its turn, and not after Fire", async function () {
      this.timeout(60000);
      const troll = await makeNpc("Troll Headhunter");
      const row = troll.system.creatureAbilities.find(r => r.name === "Regeneration");
      assert.ok(row, "the headhunter has no Regeneration");
      assert.equal(row.automation.tick.heal, 2);
      assert.equal(row.automation.tick.unless, "fire");
      const max = troll.system.health.max;
      await troll.update({ "system.health.value": max - 8 });

      // TWO COMBATANTS, because the window the rule names is the one BETWEEN
      // the creature's turns: `_onEndTurn` starts the record over, so damage
      // taken during the troll's own turn is *before* the end of its last one
      // and withholds nothing. With one combatant there is no window at all.
      const other = await makeNpc("Kobold");
      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: troll.id }, { actorId: other.id }]);
        await combat.startCombat();
        const toTroll = async () => {
          for (let i = 0; i < 8 && combat.combatant?.actorId !== troll.id; i++) await combat.nextTurn();
          assert.equal(combat.combatant?.actorId, troll.id, "the tracker never reached the troll");
        };
        await toTroll();
        await until(() => troll.system.health.value === max - 6, "the regeneration tick", 15000);

        // Its turn ends; THEN it takes Fire, in the window before its next.
        await combat.nextTurn();
        await new Promise(r => setTimeout(r, 400));
        await troll.applyDamage(1, { struck: true, type: "fire" });
        const after = troll.system.health.value;
        await toTroll();
        await new Promise(r => setTimeout(r, 900));
        assert.equal(troll.system.health.value, after, "Fire did not withhold the regeneration");
      } finally {
        await combat.delete();
      }
    });

    it("records the kind of damage a blow lands, so the withholding has something to read", async function () {
      this.timeout(30000);
      const troll = await makeNpc("Troll Berserker");
      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: troll.id }]);
        await combat.startCombat();
        const combatant = combat.combatants.find(c => c.actorId === troll.id);
        await troll.applyDamage(3, { struck: true, type: "fire" });
        await until(() => (combatant.getFlag("azeroth-rpg", "damageTypes") ?? []).includes("fire"), "the damage type recorded", 8000);
      } finally {
        await combat.delete();
      }
    });

    /* ---- the Boss Action economy (14 §1) --------------------------------- */

    it("spends a Boss's points, refuses when they are short, and never touches its turn", async function () {
      this.timeout(60000);
      const boss = await makeNpc("Archaedas");
      const max = boss.system.bossPoints.max;
      assert.isAbove(max, 0, "Archaedas holds no Boss Action points");
      assert.equal(max, boss.system.bossActions.length, "the label's N is not what it holds");
      await boss.update({ "system.bossPoints.value": max });

      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: boss.id }]);
        await combat.startCombat();
        const combatant = combat.combatants.find(c => c.actorId === boss.id);
        const halvesBefore = combatant.budget.halfActions;

        const one = rowIndex(boss, "bossActions", boss.system.bossActions.find(r => r.cost === 1)?.name);
        assert.isAtLeast(one, 0, "Archaedas has no one-point Boss Action");
        const card = await game.system.azeroth.workflows.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] });
        if (card) made.push(card);
        await until(() => boss.system.bossPoints.value === max - 1, "a point to be spent");
        assert.equal(combatant.budget.halfActions, halvesBefore, "a Boss Action spent a Half-Action");

        // ×2 with one point left is refused, and nothing is spent.
        const two = rowIndex(boss, "bossActions", boss.system.bossActions.find(r => r.cost === 2)?.name);
        assert.isAtLeast(two, 0, "Archaedas has no ×2 Boss Action");
        await boss.update({ "system.bossPoints.value": 1 });
        const { result, said } = await saidDuring(() =>
          game.system.azeroth.workflows.useAbility({ actor: boss, list: "bossActions", index: two, targets: [] }));
        assert.isNull(result, "a ×2 action went through on one point");
        assert.isTrue(said.some(w => /\d/.test(w)), "the refusal did not name the cost");
        assert.equal(boss.system.bossPoints.value, 1, "the refusal spent a point anyway");

        // They refresh at the top of the round and the unspent are lost.
        await combat.nextRound();
        await until(() => boss.system.bossPoints.value === max, "the points to refresh", 15000);
      } finally {
        await combat.delete();
      }
    });

    /* ---- a summon posts a card with a button (decision 2) ---------------- */

    it("places what a summon calls up, on the boss's side, from the card's button", async function () {
      this.timeout(90000);
      const scene = await Scene.create({ name: "ZZ Wake the Guardians", width: 3000, height: 3000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      const boss = await makeNpc("Archaedas");
      await boss.update({ "prototypeToken.actorLink": true });
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 20000);
      const [token] = await scene.createEmbeddedDocuments("Token", [
        { ...boss.prototypeToken.toObject(), actorId: boss.id, actorLink: true, x: 1000, y: 1000 }
      ]);
      const combat = await Combat.create({ scene: scene.id });
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: boss.id }]);
        await combat.startCombat();
        await boss.update({ "system.bossPoints.value": boss.system.bossPoints.max });

        const index = boss.system.bossActions.findIndex(r => r.automation.kind === "summon");
        assert.isAtLeast(index, 0, "Archaedas calls nothing up");
        const row = boss.system.bossActions[index];
        const card = await game.system.azeroth.workflows.useAbility({ actor: boss, list: "bossActions", index, targets: [] });
        assert.ok(card, "the summon posted no card");
        made.push(card);
        const summon = card.flags["azeroth-rpg"].summon;
        assert.equal(summon.entry, row.automation.summon.entry);
        assert.equal(summon.count, row.automation.summon.count);

        const html = document.createElement("div");
        html.innerHTML = card.content;
        const button = html.querySelector('[data-action="placeSummon"]');
        assert.ok(button, "the card carries no Place button");
        assert.include(button.textContent, summon.entry, "the button does not name what arrives");

        const before = scene.tokens.size;
        await CARD_ACTIONS.placeSummon(button, card);
        await until(() => scene.tokens.size === before + summon.count, "the summoned tokens", 20000);
        const placed = scene.tokens.filter(t => t.id !== token.id);
        assert.equal(placed.length, summon.count);
        for (const t of placed) {
          assert.equal(t.actor.name, summon.entry, "something else arrived");
          assert.equal(t.disposition, token.disposition, "they did not arrive on the boss's side");
          assert.isTrue(combat.combatants.some(c => c.tokenId === t.id), "they are not in the fight");
        }
        // The world actor is made once and reused: the block is imported under
        // a flag of our own, not under the server-managed compendium source.
        const world = game.actors.filter(a => a.getFlag("azeroth-rpg", SUMMONED_FLAG));
        assert.equal(world.length, 1, "the summon imported its block more than once");
        assert.equal(world[0].name, summon.entry);
        made.push(...world);
        // And a second press reuses it rather than importing again.
        const twice = scene.tokens.size;
        await CARD_ACTIONS.placeSummon(button, card);
        await until(() => scene.tokens.size === twice + summon.count, "the second placement", 20000);
        assert.equal(game.actors.filter(a => a.getFlag("azeroth-rpg", SUMMONED_FLAG)).length, 1,
          "the second placement imported the block again");
      } finally {
        await combat.delete();
      }
    });

    /* ---- a creature's attack traits fire (08 §5) ------------------------- */

    it("draws Heavy's Bane on a creature's blow and offers Sundering's armor break on the critical", async function () {
      this.timeout(60000);
      const archaedas = await makeNpc("Archaedas");
      const attack = archaedas.system.attacks.find(a => (a.traits ?? []).some(t => /Heavy/i.test(t)));
      assert.ok(attack, "Archaedas swings nothing Heavy");
      assert.isTrue((attack.traits ?? []).some(t => /Sundering/i.test(t)), "the stone fists are not Sundering");
      const index = archaedas.system.attacks.indexOf(attack);

      const unpin = pinDie(20);
      try {
        const message = await npcAttackWithDialog(archaedas, index);
        made.push(message);
        const html = document.createElement("div");
        html.innerHTML = message.content;
        const sunder = html.querySelector('[data-action="applySundered"]');
        assert.ok(sunder, "a Sundering critical offers no armor break");
        assert.equal(Number(sunder.dataset.sunder), 2, "08 §5 breaks two Armor Points");
      } finally { unpin(); }

      // A weak creature swinging a Heavy weapon takes the Bane; 08 §5's
      // threshold is Strength 13 and the rule reads the block's own score.
      const weak = await makeNpc("Kobold");
      await weak.update({
        "system.abilities.str.value": 8,
        "system.attacks": [{ name: "Great maul", bonus: 3, damage: 4, traits: ["Heavy"], range: null }]
      });
      const unpin2 = pinDie(10);
      try {
        const message = await npcAttackWithDialog(weak, 0);
        made.push(message);
        assert.include(message.content, game.i18n.localize("AZEROTH.Modifier.HeavyWeapon"),
          "a Heavy weapon below Strength 13 drew no Bane on a creature");
      } finally { unpin2(); }
    });
  });
}
