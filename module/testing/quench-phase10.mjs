/**
 * The NPC generator (D-637): a creature built to 13 §5's band, the chapter's
 * refusals and D-104's notes, the Boss table, Rework on a pack creature in
 * place, the pack's own Boss Actions and Power now on the sheet, the doors,
 * and the window at the floor.
 */

import { cleanup, forgeDrop, made, makeNpc, openSheet, settle, useAction } from "./fixtures.mjs";
import { baseTrait } from "../rules/bestiary.mjs";
import { checkText } from "./geometry.mjs";
// A pool's count is an input on an editable sheet (2026-09-13).
import { poolCount } from "./expectations.mjs";
import { AZEROTH } from "../config.mjs";

const change = el => el.dispatchEvent(new Event("change", { bubbles: true }));

export function generatorBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The NPC generator", function () {
    after(async function () {
      this.timeout(90000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-npc-generator")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    const generatorOf = actor => new (game.system.azeroth.generator)(actor ? { actor } : {});
    const BEHAVIOR = { behavior: "Goes for whoever holds the lantern.", lore: "", tactics: "", ecology: "" };
    const PICK = [{ name: "Pick", ability: "str", bonus: 4, damage: 5, traits: [], range: null }];
    const kobold = (over = {}) => ({
      name: "ZZ Kobold Digger",
      identity: { weightClass: "standard", tier: 1, creatureType: "humanoid", typeMarker: null, size: "small", race: null, corruption: null, handlingDC: null, dungeon: null },
      attacks: PICK,
      prose: BEHAVIOR,
      ...over
    });

    it("makes a tier-1 Standard with the band's numbers, its share, and a hostile one-square token", async function () {
      this.timeout(60000);
      const before = game.actors.size;
      const result = await generatorOf(null).apply(kobold());
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const actor = result.actor;
      made.push(actor);
      assert.equal(game.actors.size, before + 1);
      const s = actor.system;
      assert.equal(s.health.max, 12);
      assert.equal(s.health.value, 12);
      assert.equal(s.defense, 12);
      assert.equal(s.threatShare, 1);
      assert.deepEqual({ body: s.ap.body, head: s.ap.head, limb: s.ap.limb }, { body: 2, head: 1, limb: 1 });
      assert.equal(s.attacks[0].bonus, 4);
      assert.equal(s.attacks[0].damage, 5);
      assert.equal(s.source.document, "", "a world creature comes from no chapter");
      assert.ok(actor.getFlag("azeroth-rpg", "built")?.version, "the built flag is missing");
      assert.equal(actor.prototypeToken.width, 1);
      assert.equal(actor.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.HOSTILE);
      assert.equal(actor.prototypeToken.bar1.attribute, "health");
      assert.isFalse(actor.prototypeToken.actorLink);
      assert.equal(actor.system.proficiency, 2);
    });

    it("suggests a tier-2 Boss's centre, DC and actions, refuses it without a Dungeon, and makes it with one", async function () {
      this.timeout(90000);
      const generator = generatorOf(null);
      await generator.render({ force: true });
      await settle();
      const weight = generator.element.querySelector("select[name=weightClass]");
      weight.value = "boss";
      change(weight);
      await settle();
      const tier = generator.element.querySelector("select[name=tier]");
      tier.value = "2";
      change(tier);
      await settle();
      const state = generator.state;
      assert.equal(state.numbers.health, 194, "the Boss centre was not suggested");
      const lines = [...generator.element.querySelectorAll(".azeroth-forge-cost")].map(e => e.textContent).join(" ");
      assert.include(lines, "DC 18", "the Boss line does not print the tier's DC");
      const actions = [
        { name: "Deliver Judgement", description: "One creature within 30 feet takes 5 damage.", cost: 1 },
        { name: "Call the Guard", description: "Two Scarlet Knights step out of the chapel and act on her side from the next round.", cost: 2 }
      ];
      const refused = await generator.apply(kobold({ name: "ZZ Quench Boss", bossActions: actions, identity: { weightClass: "boss", tier: 2, dungeon: null } }));
      assert.isFalse(refused.ok);
      assert.include(refused.reasons.map(r => r.code), "BossDungeon");
      const made2 = await generator.apply({ identity: { dungeon: "The Scarlet Monastery" } });
      assert.isTrue(made2.ok, JSON.stringify(made2.reasons));
      made.push(made2.actor);
      const s = made2.actor.system;
      assert.equal(s.health.max, 194);
      assert.isNull(s.threatShare);
      assert.equal(s.bossActions.length, 2);
      assert.equal(s.bossActions[1].cost, 2);
      assert.equal(s.bossDC, 18);
      assert.equal(s.bossActionCount, 2);
    });

    it("refuses a Beast without a Handling DC, a Chaff with a Boss Action, and a spell 07 lacks", async function () {
      this.timeout(60000);
      const generator = generatorOf(null);
      const before = game.actors.size;
      const beast = await generator.apply(kobold({ name: "ZZ Quench Wolf", identity: { creatureType: "beast", handlingDC: null } }));
      assert.include(beast.reasons.map(r => r.code), "BeastHandling");
      const chaff = await generator.apply(kobold({ name: "ZZ Quench Chaff", identity: { weightClass: "chaff" }, bossActions: [{ name: "Shove", description: "Pushes 10 feet.", cost: 1 }] }));
      assert.include(chaff.reasons.map(r => r.code), "BossActions");
      const spell = await generator.apply(kobold({ name: "ZZ Quench Caster", bossActions: [], spells: { caster: true, dc: 15, names: ["Fireballz"] } }));
      assert.include(spell.reasons.map(r => r.code), "Spell");
      assert.equal(game.actors.size, before, "a refusal made an actor");
    });

    it("notes a Defense off the band and makes the creature anyway, and sizes a Huge one's token at three squares", async function () {
      this.timeout(60000);
      const off = await generatorOf(null).apply(kobold({ name: "ZZ Quench Dodger", numbers: { defense: 14 } }));
      assert.isTrue(off.ok, JSON.stringify(off.reasons));
      made.push(off.actor);
      assert.include(off.notes.map(n => n.code), "Defense");
      assert.equal(off.actor.system.defense, 14);
      const huge = await generatorOf(null).apply(kobold({ name: "ZZ Quench Devilsaur", identity: { size: "huge" } }));
      assert.isTrue(huge.ok, JSON.stringify(huge.reasons));
      made.push(huge.actor);
      assert.equal(huge.actor.prototypeToken.width, 3);
      assert.equal(huge.actor.prototypeToken.height, 3);
    });

    it("re-suggests what the GM has not touched when the tier changes, and leaves a typed Defense alone", async function () {
      this.timeout(60000);
      const generator = generatorOf(null);
      await generator.render({ force: true });
      await settle();
      const defense = generator.element.querySelector("input[name=defense]");
      defense.value = "15";
      change(defense);
      await settle();
      const tier = generator.element.querySelector("select[name=tier]");
      tier.value = "2";
      change(tier);
      await settle();
      const state = generator.state;
      assert.equal(state.numbers.health, 32, "an untouched Health did not take the band");
      assert.equal(state.numbers.defense, 15, "a typed Defense was overwritten");
      assert.include(state.touched, "numbers.defense");
      await generator.close();
    });

    it("reworks Whitemane in place: her Defense changes, her actions and Power stay", async function () {
      this.timeout(90000);
      const whitemane = await makeNpc("High Inquisitor Whitemane");
      const generator = generatorOf(whitemane);
      const result = await generator.apply({ numbers: { defense: 16 } });
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.equal(result.actor.id, whitemane.id);
      const s = whitemane.system;
      assert.equal(s.defense, 16);
      assert.equal(s.health.max, 194);
      assert.equal(s.health.value, 194, "an unhurt creature keeps full Health");
      assert.equal(s.bossActions.length, 2);
      assert.equal(s.bossActions.find(a => a.name === "Raise Mograine")?.cost, 2);
      assert.equal(s.power.max, 10);
      assert.deepEqual(Object.keys(s.skills).sort(), ["insight", "intimidation", "leadership", "spiritLore"]);
      assert.deepEqual(s.ward, { shadow: 2 }, "the rework dropped her Ward");
      assert.equal(s.dungeon, "The Scarlet Monastery");
      assert.ok(whitemane.getFlag("azeroth-rpg", "built"), "a reworked creature carries the built flag");
    });

    it("holds a Ward in two schools (D-644): the sheet prints both, the generator rows them, and the roll pipeline reads each", async function () {
      this.timeout(90000);
      const result = await generatorOf(null).apply(kobold({ name: "ZZ Quench Warded", numbers: { wards: [{ school: "shadow", value: 2 }, { school: "holy", value: 1 }] } }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const actor = result.actor;
      assert.deepEqual(actor.system.ward, { shadow: 2, holy: 1 });
      const { wardBySchool } = await import("../rules/ward.mjs");
      assert.deepEqual(wardBySchool(actor.system.ward), { shadow: 2, holy: 1 });
      const shadow = game.i18n.localize(AZEROTH.schools.shadow);
      const holy = game.i18n.localize(AZEROTH.schools.holy);
      const sheet = await openSheet(actor);
      try {
        const text = sheet.element.querySelector("section[data-tab='statistics']").textContent.replace(/\s+/g, " ");
        assert.include(text, `2 ${shadow}`, "the sheet does not print the Shadow Ward");
        assert.include(text, `1 ${holy}`, "the sheet does not print the Holy Ward");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
      const generator = generatorOf(actor);
      await generator.render({ force: true });
      await settle();
      try {
        const rows = () => [...generator.element.querySelectorAll("select[name^=ward-school-]")];
        assert.deepEqual(rows().map(r => r.value), ["shadow", "holy"], "the generator does not row the two Wards");
        assert.notInclude([...rows()[1].options].map(o => o.value), "shadow", "a row offers a school another row holds");
        const add = useAction(generator, "generatorAddWard");
        assert.ok(add.el && add.registered, "no Add a Ward");
        add.el.click();
        await settle();
        assert.lengthOf(rows(), 3, "Add a Ward added no row");
        assert.equal(rows()[2].value, Object.keys(AZEROTH.schools).find(k => !["shadow", "holy"].includes(k)), "the new row is not the first unheld school");
        generator.element.querySelector('[data-action="generatorRemoveWard"][data-index="2"]').click();
        await settle();
        assert.lengthOf(rows(), 2, "Remove left the row");
        const findings = checkText(generator.element);
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await generator.close();
      }
    });

    it("builds a swarm of six zombies (13 §4, D-646): the members' Health and share, Defense two under, one attack on every target, no Critical Injury, Thinned below half, an Elite refused", async function () {
      this.timeout(120000);
      const { ROLL_DIALOG_SETTING } = await import("../settings.mjs");
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const { npcAttackWithDialog } = await import("../applications/actions.mjs");
      const { pinDie } = await import("./fixtures.mjs");
      const prior = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      try {
        const member = await makeNpc("Risen Zombie");
        const m = member.system;
        const generator = generatorOf(null);
        const result = await generator.apply({
          ...kobold({ name: "ZZ Quench Zombie Swarm" }),
          identity: { weightClass: m.weightClass, tier: m.tier, creatureType: m.creatureType, typeMarker: null, size: m.size, race: null, corruption: m.corruption, handlingDC: null, dungeon: null, swarm: { members: 6, of: "Risen Zombie" } },
          numbers: { health: m.health.max, defense: m.defense },
          attacks: [{ name: "Claws", ability: "str", bonus: 4, damage: 5, traits: [], range: null }],
          prose: { ...BEHAVIOR, swarm: "Slow to turn, and a torch scatters it." }
        });
        assert.isTrue(result.ok, JSON.stringify(result.reasons));
        const swarm = result.actor;
        const s = swarm.system;
        assert.deepEqual(s.swarm, { members: 6, of: "Risen Zombie" });
        assert.equal(s.health.max, m.health.max * 6, "the swarm's Health is not six members'");
        assert.equal(s.defense, m.defense - 2, "the swarm's Defense is not two under");
        assert.equal(s.threatShare, Math.round(m.threatShare * 6 * 100) / 100, "the swarm's share is not six members'");
        assert.isTrue(s.isSwarm);
        assert.isFalse(s.thinned);
        assert.include(s.swarmNote, "torch");
        const sheet = await openSheet(swarm);
        try {
          const banner = sheet.element.querySelector(".azeroth-banner");
          assert.include(banner.textContent, game.i18n.format("AZEROTH.Sheet.SwarmOf", { n: 6, name: "Risen Zombie" }));
          assert.notInclude(banner.textContent, game.i18n.localize("AZEROTH.Sheet.Thinned"));
          await sheet.changeTab("traits", "primary");
          await settle();
          assert.include(sheet.element.querySelector("section[data-tab='traits']").textContent, "torch", "the Traits tab does not print the Swarm rider");
          const findings = checkText(sheet.element);
          assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
        } finally {
          await sheet.close();
        }
        // One attack, resolved against every creature it is engaged with, and no Critical Injury on a 20.
        const snap = (actor, i) => ({ tokenId: null, sceneId: null, actorId: actor.id, name: `${actor.name} ${i}`, defense: actor.system.defense, apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], size: "medium", swarm: false });
        const unpin = pinDie(20);
        let card;
        try {
          card = await npcAttackWithDialog(swarm, 0, null, { targets: [snap(member, 1), snap(member, 2)] });
        } finally {
          unpin();
        }
        assert.ok(card, "the swarm's attack posted no card");
        made.push(card);
        const html = new DOMParser().parseFromString(card.content, "text/html");
        assert.lengthOf(html.querySelectorAll('[data-action="applyDamage"]'), 2, "the card does not resolve against both targets");
        assert.isNull(html.querySelector('[data-action="criticalInjury"]'), "a swarm rolled a Critical Injury");
        assert.include(card.content, game.i18n.localize("AZEROTH.Swarm.AttackNote"));
        // Thinned below half: the Bane on the dialog's own line, two off the Rating, the badge.
        await swarm.update({ "system.health.value": Math.floor(s.health.max / 2) - 1 });
        assert.isTrue(swarm.system.thinned, "below half is not Thinned");
        const attack = prepareRoll(swarm, { kind: "attack", targets: [snap(member, 1)] });
        assert.deepEqual(attack.situational.automatic.filter(l => l.id === "swarmThinned").map(l => l.checked), [true], "no Thinned line on the attack");
        const reflex = prepareRoll(swarm, { kind: "resilience", resilience: "reflex", targets: [] });
        assert.include(reflex.situational.automatic.map(l => l.id), "swarmReflex", "no Reflex line for a swarm");
        const body = prepareRoll(swarm, { kind: "resilience", resilience: "body", targets: [] });
        assert.notInclude(body.situational.automatic.map(l => l.id), "swarmReflex");
        const unpin2 = pinDie(15);
        let thin;
        try {
          thin = await npcAttackWithDialog(swarm, 0, null, { targets: [snap(member, 1)] });
        } finally {
          unpin2();
        }
        made.push(thin);
        const explanation = new DOMParser().parseFromString(thin.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";
        assert.match(explanation, /^3 /, `a Thinned swarm's Rating is not two under 5: ${explanation}`);
        assert.include(thin.content, game.i18n.localize("AZEROTH.Sheet.Thinned"));
        const sheet2 = await openSheet(swarm);
        try {
          assert.include(sheet2.element.querySelector(".azeroth-banner").textContent, game.i18n.localize("AZEROTH.Sheet.Thinned"), "no Thinned badge on the banner");
        } finally {
          await sheet2.close();
        }
        // An Elite never swarms.
        const elite = await generatorOf(null).apply(kobold({ name: "ZZ Quench Elite Swarm", identity: { weightClass: "elite", tier: 1, creatureType: "humanoid", typeMarker: null, size: "medium", race: null, corruption: null, handlingDC: null, dungeon: null, swarm: { members: 6, of: null } } }));
        assert.isTrue(elite.ok, "an Elite with a swarm set was refused rather than written as one body");
        assert.deepEqual(elite.actor.system.swarm, { members: null, of: null }, "an Elite kept a swarm");
        // The generator's own control: a Standard ticks on at four, and the window reads at the floor.
        const window = generatorOf(null);
        await window.render({ force: true });
        try {
          const tick = window.element.querySelector("input[name=swarm]");
          assert.ok(tick, "no swarm tick on a Standard");
          assert.isFalse(tick.checked);
          const healthBefore = window.state.numbers.health;
          tick.checked = true;
          change(tick);
          await settle();
          assert.deepEqual(window.state.identity.swarm, { members: 4, of: null });
          assert.equal(window.state.numbers.health, healthBefore * 4, "ticking the swarm did not multiply the Health");
          assert.ok(window.element.querySelector("textarea[name=swarmNote]"), "no Swarm rider field once ticked");
          const findings = checkText(window.element);
          assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
          // The render replaced the control: query it again, or the change lands on a detached element.
          const tick2 = window.element.querySelector("input[name=swarm]");
          assert.isTrue(tick2.checked, "the tick did not survive the render");
          tick2.checked = false;
          change(tick2);
          await settle();
          assert.equal(window.state.numbers.health, healthBefore, "unticking did not restore the member's Health");
        } finally {
          await window.close();
        }
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, prior);
      }
    });

    it("automates an ability (D-647): Use posts the Test at the DC, damage through the Ward, the condition, a use struck; a Boss Action pays its pool; Whitemane casts by name", async function () {
      this.timeout(120000);
      const { ROLL_DIALOG_SETTING } = await import("../settings.mjs");
      const { seedAutomation, emptyAutomation } = await import("../rules/ability-automation.mjs");
      const { castNamedSpell } = await import("../applications/actions.mjs");
      const prior = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      try {
        const prose = "Each creature in a 15 ft cone makes a Body Resilience Test at DC 12 or takes 5 shadow damage and is Diseased.";
        const seed = seedAutomation(prose);
        assert.equal(seed.kind, "test");
        const breath = { name: "Plague Breath", description: prose, automation: { ...emptyAutomation(), kind: "test", resist: "body", dc: 12, damage: { amount: 5, type: "shadow" }, inflicts: { condition: "diseased", value: null, until: "endOfNextTurn" }, area: "15 ft cone", uses: { max: 2, value: 2, per: "encounter" } } };
        const shove = { name: "Shove", description: "Pushes 10 feet.", cost: 1, automation: { ...emptyAutomation(), kind: "utility", action: "half", cost: { pool: "power", amount: 2 } } };
        const result = await generatorOf(null).apply(kobold({
          name: "ZZ Quench Plaguebreather",
          identity: { weightClass: "boss", tier: 1, creatureType: "undead", typeMarker: null, size: "medium", race: null, corruption: "undeath", handlingDC: null, dungeon: "Scholomance" },
          creatureAbilities: [breath], bossActions: [shove, { name: "Sweep", description: "Hits everyone nearby.", cost: 1, automation: emptyAutomation() }],
          keywords: { skills: {}, resilience: [], immune: [], vulnerable: [], inflicts: ["diseased"], momentum: { name: null, max: null }, power: { name: null, max: 8 } }
        }));
        assert.isTrue(result.ok, JSON.stringify(result.reasons));
        const boss = result.actor;
        assert.equal(boss.system.creatureAbilities[0].automation.kind, "test");
        const w = game.system.azeroth.workflows;
        const snap = { tokenId: null, sceneId: null, actorId: boss.id, name: "Warded One", defense: 12, apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: { shadow: 2 }, immune: [], vulnerable: [], statuses: [], size: "medium", swarm: false };
        const card = await w.useAbility({ actor: boss, list: "creatureAbilities", index: 0, targets: [snap] });
        assert.ok(card, "Use posted no card");
        made.push(card);
        const html = new DOMParser().parseFromString(card.content, "text/html");
        const resist = html.querySelector('[data-action="resistTest"]');
        assert.ok(resist, "no Resist button");
        assert.equal(resist.dataset.dc, "12");
        assert.equal(resist.dataset.resilience, "body");
        assert.equal(html.querySelector(".azeroth-damage strong")?.textContent.trim(), "3", "5 shadow through a Shadow Ward of 2 is not 3");
        const inflict = html.querySelector('[data-action="applyCondition"]');
        assert.ok(inflict, "no Inflict button");
        assert.equal(inflict.dataset.condition, "diseased");
        assert.equal(inflict.dataset.until, "endOfNextTurn");
        assert.equal(inflict.dataset.targetIndex, "0");
        assert.ok(html.querySelector('[data-action="placeArea"]'), "no Place area for the cone");
        assert.equal(boss.system.creatureAbilities[0].automation.uses.value, 1, "a use was not struck");
        // The Boss Action pays its Power.
        const paid = await w.useAbility({ actor: boss, list: "bossActions", index: 0, targets: [] });
        assert.ok(paid, "the Boss Action posted no card");
        made.push(paid);
        assert.equal(boss.system.power.value, 6, "Shove did not pay 2 Power");
        assert.isNull(await w.useAbility({ actor: boss, list: "bossActions", index: 1, targets: [] }), "a prose-only action posted a card");
        // The sheet offers Use on the automated rows alone.
        const sheet = await openSheet(boss);
        try {
          await sheet.changeTab("traits", "primary");
          await settle();
          const uses = [...sheet.element.querySelectorAll('[data-action="useAbility"]')];
          assert.deepEqual(uses.map(b => `${b.dataset.list}:${b.dataset.index}`), ["creatureAbilities:0", "bossActions:0"]);
          const findings = checkText(sheet.element);
          assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
        } finally {
          await sheet.close();
        }
        // The generator seeds the descriptor off the words, and the review holds it.
        const generator = generatorOf(null);
        await generator.render({ force: true });
        try {
          await generator.setState({ creatureAbilities: [{ name: "Plague Breath", description: prose, automation: emptyAutomation() }] });
          await settle();
          const seedButton = generator.element.querySelector('[data-action="generatorSeedAbility"][data-list="creatureAbilities"][data-index="0"]');
          assert.ok(seedButton, "no Read the ability");
          seedButton.click();
          await settle();
          const auto = generator.state.creatureAbilities[0].automation;
          assert.equal(auto.kind, "test");
          assert.equal(auto.dc, 12);
          assert.equal(auto.resist, "body");
          assert.deepEqual(auto.damage, { amount: 5, type: "shadow" });
          assert.equal(auto.inflicts.condition, "diseased");
          assert.ok(generator.element.querySelector("select[name='ability-auto-resist-0']"), "the Test fields did not open");
          const findings = checkText(generator.element);
          assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
          const refused = await generator.apply({ name: "ZZ Quench Poor", creatureAbilities: [{ name: "Costly", description: "x", automation: { ...emptyAutomation(), kind: "utility", cost: { pool: "momentum", amount: 2 } } }], attacks: PICK, prose: BEHAVIOR });
          assert.isFalse(refused.ok, "a cost off a pool the block lacks was allowed");
          assert.include(refused.reasons.map(r => r.code), "AutomationPool");
        } finally {
          if (generator.rendered) await generator.close();
        }
        // Whitemane casts one of her spells by name, at her own DC.
        const whitemane = await makeNpc("High Inquisitor Whitemane");
        const name = whitemane.system.spells.names[0];
        assert.ok(name, "Whitemane names no spell");
        const powerBefore = whitemane.system.power.value;
        const cast = await castNamedSpell(whitemane, name);
        assert.ok(cast, `${name} posted no card`);
        made.push(cast);
        assert.include(cast.content, name);
        assert.isBelow(whitemane.system.power.value, powerBefore, "the cast spent no Power");
        const sheet2 = await openSheet(whitemane);
        try {
          assert.ok(sheet2.element.querySelector(`[data-action="castSpell"][data-name="${name}"]`), "no Cast for her spell on the sheet");
        } finally {
          await sheet2.close();
        }
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, prior);
      }
    });

    it("the pack's Boss shows her two actions and her Power on the sheet", async function () {
      this.timeout(60000);
      const whitemane = await makeNpc("High Inquisitor Whitemane");
      const sheet = await openSheet(whitemane);
      try {
        await sheet.changeTab("traits", "primary");
        await settle();
        const heading = [...sheet.element.querySelectorAll(".azeroth-panel-heading")].find(h => /Boss Actions/.test(h.textContent));
        assert.ok(heading, "no Boss Actions heading");
        assert.include(heading.textContent, "(2)");
        const rows = heading.nextElementSibling?.querySelectorAll("li") ?? [];
        assert.lengthOf(rows, 2);
        assert.ok([...rows].some(li => /×2/.test(li.textContent)), "the ×2 mark is missing");
        await sheet.changeTab("statistics", "primary");
        await settle();
        // `poolCount` reads the stepper's input as well as the plain span:
        // an editable pool's value is no longer in `textContent` (2026-09-13).
        const power = [...sheet.element.querySelectorAll(".azeroth-pool-head")].find(h => !h.classList.contains("is-absent") && /^10 \/ 10$/.test(poolCount(h)));
        assert.ok(power, "the Power pool is not held at 10 / 10");
        assert.equal(whitemane.system.threatShare, null);
        assert.deepEqual([...whitemane.system.vulnerable], []);
      } finally {
        await sheet.close();
      }
    });

    it("the Actor directory's footer carries New creature once, and an NPC's banner Rework, for a GM", async function () {
      this.timeout(30000);
      const { addGeneratorButton, GENERATOR_BUTTON_CLASS } = await import("../applications/npc-generator-button.mjs");
      await ui.actors.render({ force: true });
      await settle();
      const element = ui.actors.element;
      assert.ok(element.querySelector(`.${GENERATOR_BUTTON_CLASS}`), "no New creature button");
      assert.isFalse(addGeneratorButton(element), "a second render stacked a button");
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      try {
        const door = useAction(sheet, "rework");
        assert.ok(door.el, "the banner carries no Rework");
        assert.isTrue(door.registered);
      } finally {
        await sheet.close();
      }
    });

    it("renders at the floor, blank and on Whitemane", async function () {
      this.timeout(90000);
      const blank = generatorOf(null);
      await blank.render({ force: true });
      await settle();
      const frame = blank.element.querySelector(".azeroth-generator-frame");
      let findings = checkText(blank.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      for (const el of frame.querySelectorAll("[data-action]")) {
        assert.isFunction(blank.options.actions?.[el.dataset.action], `${el.dataset.action} has no handler`);
      }
      await blank.close();
      const whitemane = await makeNpc("High Inquisitor Whitemane");
      const rework = generatorOf(whitemane);
      await rework.render({ force: true });
      await settle();
      findings = checkText(rework.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      assert.equal(rework.element.querySelector("input[name=name]")?.value, whitemane.name);
      assert.equal(rework.element.querySelector("input[name=health]")?.value, "194");
      await rework.close();
    });

    it("starts from a pack entry picked off the list inside the window, and then treats every number as the GM's (D-638)", async function () {
      this.timeout(60000);
      const generator = generatorOf(null);
      await generator.render({ force: true });
      await settle();
      assert.isNull(generator.element.querySelector("datalist"), "a native datalist popup");
      const input = generator.element.querySelector("input[name=startFrom]");
      const list = generator.element.querySelector("[data-picker-list=entries]");
      assert.isTrue(list.hidden, "every creature listed before anything is typed");
      input.value = "plagued gh";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      assert.isFalse(list.hidden);
      assert.deepEqual([...list.querySelectorAll("li[data-search]:not([hidden])")].map(li => li.dataset.search), ["plagued ghoul"]);
      list.querySelector("li:not([hidden]) button[data-action=generatorStartFrom]")
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const t0 = Date.now();
      while (generator.state?.from !== "Plagued Ghoul") {
        if (Date.now() - t0 > 5000) throw new Error("timed out waiting for the entry to load");
        await new Promise(r => setTimeout(r, 25));
      }
      const state = generator.state;
      assert.equal(state.name, "Plagued Ghoul");
      assert.equal(state.from, "Plagued Ghoul");
      assert.equal(state.numbers.health, 12);
      assert.include(state.touched, "numbers.health");
      const tier = generator.element.querySelector("select[name=tier]");
      tier.value = "3";
      change(tier);
      await settle();
      assert.equal(generator.state.numbers.health, 12, "a loaded entry's Health moved with the tier");
      // A trait is picked off the attack's own list, inside the window, and appended.
      const search = generator.element.querySelector("input[name=attack-trait-search-0]");
      assert.ok(search, "no trait picker on the first attack");
      search.value = "re";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const row = generator.element.querySelector("[data-picker-list=traits-0] li[data-search]:not([hidden])");
      assert.ok(row, "no trait opens on 're'");
      const picked = row.querySelector("button[data-action=generatorAddTrait]").dataset.name;
      row.querySelector("button[data-action=generatorAddTrait]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const t1 = Date.now();
      while (!generator.state.attacks[0].traits.includes(baseTrait(picked))) {
        if (Date.now() - t1 > 5000) throw new Error(`timed out waiting for ${picked} to join the attack`);
        await new Promise(r => setTimeout(r, 25));
      }
      await generator.close();
    });

    it("takes a trait from the browser in pick mode and from a drop, refuses a weapon and a mount trait, and strips the pack's placeholder (D-645)", async function () {
      this.timeout(90000);
      const generator = generatorOf(null);
      await generator.render({ force: true });
      await settle();
      try {
        const browse = useAction(generator, "generatorBrowseTraits");
        assert.ok(browse.el && browse.registered, "no Browse on the attack row");
        browse.el.click();
        let browser = null;
        for (let i = 0; i < 100 && !browser?.element?.querySelector(".azeroth-browser-entry"); i++) {
          browser = foundry.applications.instances.get("azeroth-compendium-browser") ?? null;
          await new Promise(r => setTimeout(r, 100));
        }
        assert.ok(browser?.rendered, "Browse opened no browser");
        assert.include(browser.title, game.i18n.localize("AZEROTH.Generator.AttackName"), "the browser does not say what it picks for");
        const fast = [...browser.element.querySelectorAll("[data-category=traits] li[data-uuid]")].find(li => li.querySelector(".azeroth-browser-name")?.textContent.trim() === "Fast");
        assert.ok(fast, "the Traits category lists no Fast");
        fast.click();
        const t0 = Date.now();
        while (!generator.state.attacks[0].traits.includes("Fast")) {
          if (Date.now() - t0 > 5000) throw new Error("the picked trait did not join the attack");
          await new Promise(r => setTimeout(r, 25));
        }
        for (let i = 0; i < 40 && browser.rendered; i++) await new Promise(r => setTimeout(r, 50));
        assert.isFalse(browser.rendered, "the browser stayed open after the pick");
        // A drop on the row: a trait joins, a weapon is refused, a mount trait is refused.
        const traits = game.packs.get("azeroth-rpg.traits");
        const index = await traits.getIndex({ fields: ["system.kind"] });
        const uuidOf = name => `Compendium.azeroth-rpg.traits.Item.${index.find(e => e.name === name)._id}`;
        const row = () => generator.element.querySelector(".azeroth-generator-attacks li[data-index='0']");
        forgeDrop(row(), { type: "Item", uuid: uuidOf("Slow") });
        const t1 = Date.now();
        while (!generator.state.attacks[0].traits.includes("Slow")) {
          if (Date.now() - t1 > 5000) throw new Error("the dropped trait did not join the attack");
          await new Promise(r => setTimeout(r, 25));
        }
        const weapons = game.packs.get("azeroth-rpg.weapons");
        const sword = (await weapons.getIndex()).find(e => e.name === "Longsword");
        const before = [...generator.state.attacks[0].traits];
        forgeDrop(row(), { type: "Item", uuid: `Compendium.azeroth-rpg.weapons.Item.${sword._id}` });
        await settle();
        assert.deepEqual(generator.state.attacks[0].traits, before, "a weapon joined the traits");
        const mount = index.find(e => e.system?.kind === "mount");
        assert.ok(mount, "the traits pack holds no mount trait to refuse");
        forgeDrop(row(), { type: "Item", uuid: uuidOf(mount.name) });
        await settle();
        assert.deepEqual(generator.state.attacks[0].traits, before, "a mount trait joined the attack");
        // The placeholder comes off and the caret waits at the end of the field.
        forgeDrop(row(), { type: "Item", uuid: uuidOf("Pierce X") });
        const t2 = Date.now();
        while (!generator.state.attacks[0].traits.includes("Pierce")) {
          if (Date.now() - t2 > 5000) throw new Error("Pierce X did not join as Pierce");
          await new Promise(r => setTimeout(r, 25));
        }
        assert.notInclude(generator.state.attacks[0].traits, "Pierce X");
        await settle();
        const field = generator.element.querySelector("input[name='attack-traits-0']");
        assert.equal(document.activeElement, field, "the caret is not in the traits field after a placeholder");
        assert.equal(field.selectionStart, field.value.length, "the caret is not at the end");
        // A rated use of it passes review with the pack's own names.
        const result = await generator.apply({ name: "ZZ Quench Piker", attacks: [{ name: "Pike", ability: "str", bonus: 4, damage: 5, traits: ["Pierce 2"], range: null }], prose: BEHAVIOR });
        assert.isTrue(result.ok, JSON.stringify(result.reasons));
      } finally {
        if (generator.rendered) await generator.close();
      }
    });

    it("Cancel leaves nothing behind", async function () {
      this.timeout(30000);
      const before = game.actors.size;
      const generator = generatorOf(null);
      await generator.render({ force: true });
      await generator.setState(kobold({ name: "ZZ Never Made Creature" }));
      generator.element.querySelector('[data-action="generatorCancel"]').click();
      await settle();
      assert.isFalse(generator.rendered);
      assert.equal(game.actors.size, before);
    });
  });
}
