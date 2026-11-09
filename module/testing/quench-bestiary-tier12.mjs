/** The 26 Classic/Warcraft III additions, exercised as real pack actors and sheet controls. */
import { cleanup, fromPack, made, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn } from "./fixtures.mjs";
import { npcAttackWithDialog } from "../applications/actions.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { weaponReloadState } from "../effects/reload-state.mjs";

const until = async (fn, what, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 50)); }
  throw new Error(`Timed out: ${what}`);
};
const parsed = card => { const div = document.createElement("div"); div.innerHTML = card.content; return div; };

export function bestiaryTier12Batch({ describe, it, assert, before, after }) {
  describe("Classic tier 1 and 2 additions", function () {
    let setting, scene, target, targetToken;
    const actors = new Map();
    const names = ["Defias Pillager", "Defias Trapper", "Dalaran Apprentice", "Defias Squallshaper", "Dark Iron Rifleman", "Venture Co. Geologist",
      "Scarlet Neophyte", "Bristleback Shaman", "Razormane Geomancer", "Burning Blade Neophyte", "Frostmane Shadowcaster",
      "Gnarlpine Shaman", "Rockjaw Ambusher", "Southsea Cannoneer", "Kolkar Wrangler", "Vile Sprite",
      "Scarlet Friar", "Grimtotem Geomancer", "Dragonmaw Shadowwarder", "Dragonmaw Bonewarder", "Twilight Aquamancer",
      "Twilight Elementalist", "Blackrock Outrunner", "Dark Iron Demolitionist", "Scarlet Evoker", "Kobold Geomancer"];
    before(async function () {
      this.timeout(120000);
      setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      scene = await Scene.create({ name: "ZZ Tier 1 and 2", width: 2400, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      // V14 Scene#view refuses a switch while the initial canvas is loading.
      // game.ready alone does not mean that its textures have finished loading.
      await until(() => canvas.initialized && !canvas.loading, "initial canvas loading", 60000);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "test scene");
      for (const name of names) actors.set(name, await makeNpc(name));
      target = await makeNpc("Kobold");
      const rows = [];
      for (const actor of actors.values()) rows.push(await tokenData(actor, { x: 500, y: 500, actorLink: true }));
      rows.push(await tokenData(target, { x: 700, y: 500, actorLink: true }));
      const placed = await scene.createEmbeddedDocuments("Token", rows);
      targetToken = placed.find(t => t.actorId === target.id);
      await until(() => placed.every(t => tokenDrawn(t.object)), "tokens drawn");
      await settle();
    });
    after(async function () {
      this.timeout(90000);
      canvas.tokens.setTargets([]);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      for (const actor of actors.values()) await actor.sheet.close().catch(() => {});
      await cleanup();
    });

    it("all 26 imported actors retain their equipment and all 18 casters expose their spell controls", async function () {
      this.timeout(180000);
      let casters = 0;
      for (const actor of actors.values()) {
        assert.ok(actor.items.some(i => i.type === "weapon"), `${actor.name}: no carried weapon`);
        if (!actor.system.spells.names.length) continue;
        casters++;
        const sheet = await openSheet(actor);
        try {
          await sheet.changeTab("spells", "primary");
          await settle();
          const rows = [...sheet.element.querySelectorAll("li.azeroth-spell")];
          for (const name of actor.system.spells.names) {
            const row = rows.find(r => r.dataset.name === name);
            assert.ok(row, `${actor.name}: missing ${name}`);
            assert.isFalse(row.querySelector('[data-action="castSpell"]').disabled, `${actor.name}: unavailable ${name}`);
          }
        } finally { await sheet.close(); }
      }
      assert.equal(casters, 18);
    });

    for (const [name, spellName] of [["Defias Pillager", "Fireball"], ["Dalaran Apprentice", "Frostbolt"], ["Defias Squallshaper", "Scorch"], ["Venture Co. Geologist", "Lightning Bolt"]]) {
      it(`${name}: every spell is available on the sheet and ${spellName} spends Power`, async function () {
        this.timeout(60000);
        const actor = actors.get(name);
        canvas.tokens.setTargets([targetToken.id]);
        const sheet = await openSheet(actor);
        await sheet.changeTab("spells", "primary");
        await settle();
        const rows = [...sheet.element.querySelectorAll("li.azeroth-spell")];
        for (const known of actor.system.spells.names) {
          const row = rows.find(r => r.dataset.name === known);
          assert.ok(row, `${known} is missing`);
          assert.isFalse(row.querySelector('[data-action="castSpell"]').disabled, `${known} cannot cast`);
        }
        const spell = await fromPack("azeroth-rpg.spells", spellName);
        const old = new Set(game.messages.map(m => m.id));
        const power = actor.system.power.value;
        const unpin = pinDie(15);
        try {
          rows.find(r => r.dataset.name === spellName).querySelector('[data-action="castSpell"]').click();
          const card = await until(() => game.messages.find(m => !old.has(m.id) && m.speaker.actor === actor.id), "spell card");
          made.push(card);
          assert.include(card.content, spellName);
          await until(() => actor.system.power.value === power - spell.system.mana, "Power spent");
        } finally { unpin(); await sheet.close(); }
      });
    }

    it("Gift of Ragnaros reaches the real attack once; Backstab is an optional melee damage line", async function () {
      this.timeout(60000);
      canvas.tokens.setTargets([]);
      const rifleman = actors.get("Dark Iron Rifleman");
      assert.equal(rifleman.system.damageBonus, 2);
      const rifle = rifleman.items.find(i => i.system.launcher === "firearm");
      const ammunition = rifleman.items.find(i => i.system.fits?.includes("firearm"));
      assert.equal(ammunition.system.quantity, 20);
      const unpin = pinDie(15);
      try {
        const card = await npcAttackWithDialog(rifleman, 0);
        assert.ok(card);
        made.push(card);
        const damage = card.flags["azeroth-rpg"].damage;
        assert.equal(damage.damage - damage.effectiveSL, 7, "unarmored rifle hit carries exactly base 5 plus Gift 2");
        await until(() => ammunition.system.quantity === 19, "one round spent");
        await until(() => weaponReloadState(rifleman, rifle.id).remaining === 2, "two reload steps owed");
        assert.isNull(await npcAttackWithDialog(rifleman, 0), "printed row bypasses Reload");
      } finally { unpin(); }
      const trapper = actors.get("Defias Trapper");
      const spec = { kind: "attack", damage: { rating: 2 }, strike: { rangeKind: "melee" }, modifiers: [] };
      const melee = prepareRoll(trapper, spec);
      assert.ok(melee.damageLines.some(l => l.id === "npc-backstab" && l.amount === 2 && !l.checked));
      const thrown = prepareRoll(trapper, { ...spec, strike: { rangeKind: "thrown" } });
      assert.isFalse(thrown.damageLines.some(l => l.id === "npc-backstab"));
    });

    it("Trapper Net refuses beyond 20 feet without spending, then nets on a failed save and exhausts its use", async function () {
      this.timeout(90000);
      const trapper = actors.get("Defias Trapper");
      const index = trapper.system.creatureAbilities.findIndex(a => a.name === "Trapper Net");
      const use = () => trapper.system.creatureAbilities[index].automation.uses.value;
      canvas.tokens.setTargets([targetToken.id]);
      await targetToken.update({ x: 1100 });
      await settle();
      const workflows = game.system.azeroth.workflows;
      assert.isNull(await workflows.useAbility({ actor: trapper, list: "creatureAbilities", index }));
      assert.equal(use(), 1, "range refusal spent the net");
      await targetToken.update({ x: 700 });
      await settle();
      const sheet = await openSheet(trapper);
      await sheet.changeTab("traits", "primary");
      await settle();
      const button = sheet.element.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`);
      assert.ok(button);
      const old = new Set(game.messages.map(m => m.id));
      button.click();
      const card = await until(() => game.messages.find(m => !old.has(m.id) && m.flags["azeroth-rpg"]?.title === "Trapper Net"), "net card");
      made.push(card);
      await until(() => use() === 0, "net use spent");
      const resist = parsed(card).querySelector('[data-action="resistTest"]');
      assert.ok(resist, "net offers no save");
      const unpin = pinDie(1);
      try { await CARD_ACTIONS.resistTest(resist, card); } finally { unpin(); }
      const effect = await until(() => target.effects.find(e => e.statuses.has("entangled")), "Entangled on failed Reflex save");
      assert.ok(Number(effect.duration.value) > 0 || Number(effect.duration.seconds) > 0 || Number(effect.duration.rounds) > 0, "net has no expiry");
      assert.isNull(await workflows.useAbility({ actor: trapper, list: "creatureAbilities", index }));
      assert.equal(use(), 0);
      await sheet.close();
    });
  });
}
