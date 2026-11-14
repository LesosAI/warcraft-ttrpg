/**
 * **THE DEATH KNIGHT'S BLOOD AND FROST, THROUGH THE REAL DOORS** (04; the plan's Phase 5, run
 * F4a), and the F3 architect review's fixes. Every granted talent is pressed from the sheet's own
 * Use control (D-774: a targeted Use is pressed with the creature targeted), every rune spent
 * through the one rune door, every attack rolled from the sheet, every card's Apply pressed as
 * drawn, and the result read off the documents.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.death-knight-talents`. Every document a test makes is
 * deleted in `after`, the raised dead (named for their 14 entry) among them.
 */

import { cleanup, drainAreaWork, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { answerAsk, chooser, featureNamed, fightWith, freshTurn, pressCard, pressUse, sceneWith, talentNamed, textOf, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { npcAttackWithDialog } from "../applications/actions.mjs";
import { CORPSE_FLAG, RAISE_FLAG } from "../rules/raise.mjs";
import { PRESENCE_FLAG } from "../rules/death-knight.mjs";
import { DK_FLAGS, VENGEFUL_OFFER_KIND } from "../rules/death-knight-talents.mjs";
import { NEXT_SPELL_FLAG } from "../rules/casting.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { bondOf } from "../documents/bound.mjs";
import { inscribeRunes, spendRunesOn } from "../documents/runes.mjs";
import { layPlague } from "../effects/death-knight.mjs";
import { corpseQueryHandler, raiseQueryHandler } from "../effects/death-knight-necromancy.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

/** A card's own button, parsed off its content, pressed through the card's own action. */
async function applyOn(message, index = 0) {
  // **A FORESIGHT PRIEST IN THE WORLD HOLDS THE DAMAGE BACK** (CLAUDE.md §14, 2026-11-04): where the
  // card was posted unrevealed, the GM reveals it first through the card's own action.
  if (game.messages.get(message.id)?.flags?.["azeroth-rpg"]?.attackResolution?.damageRevealed === false) {
    await CARD_ACTIONS.revealAttackDamage({ dataset: { targetIndex: String(index) } }, game.messages.get(message.id));
    await until(() => game.messages.get(message.id)?.flags?.["azeroth-rpg"]?.attackResolution?.damageRevealed !== false, "the damage revealed");
  }
  const fresh = game.messages.get(message.id);
  const button = new DOMParser().parseFromString(fresh.content, "text/html").querySelector(`[data-action="applyDamage"][data-target-index="${index}"]`);
  if (!button) throw new Error(`the card draws no Apply for row ${index}: ${JSON.stringify(fresh.flags?.["azeroth-rpg"] ?? {}).slice(0, 300)}`);
  await CARD_ACTIONS.applyDamage(button, fresh);
}

const SCOPE = "azeroth-rpg";
const runicPower = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "runicPower") ?? null;
const runes = actor => actor.system?.runes ?? { weapons: [], value: 0, max: 0, blood: { value: 0 }, frost: { value: 0 } };
const health = actor => actor.system?.health?.value ?? 0;
const raisedOf = (owner, raise) => game.actors.filter(a => bondOf(a)?.kind === "raised" && bondOf(a)?.ownerUuid === owner.uuid && (!raise || bondOf(a)?.raise === raise));

/**
 * A Human Death Knight at a level, wielding these weapons at a rarity, with these talents taken at
 * these ranks, each wielded weapon inscribed half Blood and half Frost (Blood first).
 */
async function knightWith(name, { level = 20, weapons = ["Greatsword"], rarity = "rare", ranks = {}, spells = [], cha = 16 } = {}) {
  const k = await makeCharacter({ name, classes: [["Death Knight", level]], race: "Human", weapons, spells, abilities: { str: 16, cha, con: 14 } });
  await k._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(k, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  for (const [i, n] of weapons.entries()) {
    const item = await until(() => k.items.find(x => x.type === "weapon" && x.name === n && x.system?.equipped !== true), `${n} carried`);
    await item.update({ "system.rarity": rarity, "system.equipped": true, ...(i > 0 ? { "system.offHand": true } : {}) });
    await until(() => k.items.get(item.id)?.system?.equipped === true, `${n} wielded`);
  }
  await until(() => runes(k).slots > 0, "the rune slots");
  for (const row of runes(k).weapons) {
    const w = k.items.get(row.itemId);
    const blood = Math.ceil(row.slots / 2);
    await inscribeRunes(k, w, { blood, frost: row.slots - blood, grip: row.grip ?? null });
  }
  await until(() => runes(k).value === runes(k).slots, "every slot inscribed");
  await k.update({ "system.health.value": k.system.health.max });
  await settle();
  return k;
}

/** Runic Power banked by a GM's hand (`runicGain: "hand"`). */
async function bank(knight, value = 13) {
  const rp = runicPower(knight);
  await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value }, {}, { runicGain: "hand" });
  await until(() => runicPower(knight).value === Math.min(value, rp.max), "Runic Power banked");
}

/** Press a granted Use with these tokens targeted; the posted card, or null. */
async function use(actor, name, targets = [], face = 15) {
  const { card } = await pressUse(actor, name, targets, face);
  return card;
}

/** An attack from the sheet's weapon row at one target, the die pinned; every card it posts. */
async function attackFromSheet(actor, weapon, target, { face = 20, cards = 1 } = {}) {
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  canvas.tokens.setTargets([target.id]);
  const posted = [];
  const hook = Hooks.on("createChatMessage", m => {
    if (m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack") posted.push(m);
  });
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`).click();
    await until(() => posted.length >= cards, `${cards} attack card(s)`, 30000);
    await settle();
    for (const m of posted) made.push(m);
    return posted;
  } finally {
    Hooks.off("createChatMessage", hook);
    unpin();
    canvas.tokens.setTargets([]);
    await sheet.close();
  }
}

/** A corpse: a Kobold at 0 Health. */
async function corpse(name, entry = "Kobold") {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

/** Cast a raise spell through `castSpell`, the corpses taken as the one chooser offers them. */
async function castRaise(knight, spellName) {
  const spell = knight.items.find(i => i.type === "spell" && i.name === spellName);
  const unpin = pinDie(20);
  try {
    const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] });
    const app = await chooser(spell);
    app.element.querySelector('button[data-action="choose"]').click();
    const card = await going;
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

export function deathKnightTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Death Knight's Blood and Frost, and the F3 review (run F4a)", function () {
    let restoreDialog = null;
    let restoreText = null;
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      await drainAreaWork();
      const knights = new Set(made.filter(d => d instanceof Actor).map(d => d.uuid));
      for (const a of game.actors.filter(x => bondOf(x)?.kind === "raised" && knights.has(bondOf(x)?.ownerUuid))) await a.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    /* ---------------- Part A: the F3 review ---------------- */

    describe("the F3 review", function () {
      it("A1/A2: the GM's raise handler refuses a stale corpse, another token, a raise not held; the earlier raise stands", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK4 Raise", { spells: ["Raise Ghoul"] });
        const one = await corpse("Raise One");
        const other = await makeNpc("Kobold");
        const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: one, x: 700, y: 500, side: "hostile" }, { actor: other, x: 900, y: 500, side: "hostile" }]);
        await bank(knight);
        await castRaise(knight, "Raise Ghoul");
        const first = await until(() => raisedOf(knight, "raise-ghoul")[0], "the ghoul bound");
        const payload = { ownerUuid: knight.uuid, key: "raise-ghoul", sceneId: scene.id, tokenId: tokenOf(knight).id, corpses: [tokenOf(one).id], name: "Raise Ghoul" };
        let refused = null;
        try { await raiseQueryHandler(payload, { user: game.user }); } catch (err) { refused = err.message; }
        assert.ok(refused, "a corpse risen already is refused on the GM's client");
        assert.isTrue(game.actors.has(first.id), "and the earlier raise still stands");
        assert.lengthOf(knight.effects.filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "raise-ghoul"), 1, "its carrier with it");
        // A forged centre and a raise the knight does not hold.
        let other1 = null;
        try { await raiseQueryHandler({ ...payload, tokenId: tokenOf(other).id }, { user: game.user }); } catch (err) { other1 = err.message; }
        assert.match(other1 ?? "", /own token/, "a token that is not the knight's is refused");
        let notHeld = null;
        try { await raiseQueryHandler({ ...payload, key: "raise-skeleton" }, { user: game.user }); } catch (err) { notHeld = err.message; }
        assert.match(notHeld ?? "", /does not hold/, "a raise the knight does not hold is refused");
        assert.lengthOf(raisedOf(knight), 1, "nothing more was made");
      });

      it("A2: the GM's corpse handler re-judges: a destroyed corpse takes no Stay the Rot", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Corpse", { spells: ["Stay the Rot"] });
        const body = await corpse("Corpse Burst Body");
        const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
        await tokenOf(body).document.setFlag(SCOPE, CORPSE_FLAG, { state: "destroyed", by: knight.uuid, until: null });
        let refused = null;
        try {
          await corpseQueryHandler({ ownerUuid: knight.uuid, key: "stay-the-rot", sceneId: scene.id, tokenId: tokenOf(knight).id, corpse: tokenOf(body).id }, { user: game.user });
        } catch (err) { refused = err.message; }
        assert.match(refused ?? "", /destroyed/, "a forged mark over a destroyed corpse is refused");
        assert.equal(tokenOf(body).document.getFlag(SCOPE, CORPSE_FLAG)?.state, "destroyed", "the mark stands");
      });

      it("A4: a GM types a higher Runic Power into the pool box and it lands as a hand", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK4 Typed");
        const sheet = await openSheet(knight);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const rp = runicPower(knight);
          const input = [...sheet.element.querySelectorAll("input.azeroth-pool-value")].find(i => i.dataset.kind === "momentum" && (i.dataset.itemId || null) === (rp.itemId || null));
          assert.ok(input, "the sheet draws the Runic Power box");
          input.value = "7";
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await until(() => runicPower(knight).value === 7, "the typed rise landed");
        } finally {
          await sheet.close();
        }
      });

      it("A5: a raise's clock outlives its fight on the world's clock, and the clock collapses the dead", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK4 Clock");
        const a = await corpse("Clock A");
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: a, x: 700, y: 500, side: "hostile" }, { actor: foe, x: 1500, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await freshTurn(knight, 2);
        await bank(knight);
        const { card } = await pressUse(knight, "Army of the Dead");
        const app = await chooser(featureNamed(knight, "Army of the Dead"));
        app.element.querySelector('button[data-action="choose"]').click();
        assert.ok(await card, "Army of the Dead posted its card");
        const raised = await until(() => raisedOf(knight, "army-of-the-dead")[0], "the skeleton bound");
        await combat.delete();
        await settle();
        const carrier = knight.effects.find(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "army-of-the-dead");
        assert.ok(carrier, "the fight's end leaves the raise to its clock");
        await game.time.advance(60);
        await until(() => !game.actors.has(raised.id), "the world's clock collapses the dead after its three rounds", 30000);
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "army-of-the-dead"), "with their carrier");
      });

      it("A6: a deleted scene collapses the raise whose dead stood only there", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK4 Scene", { spells: ["Raise Ghoul"] });
        const one = await corpse("Scene One");
        const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: one, x: 700, y: 500, side: "hostile" }]);
        await bank(knight);
        await castRaise(knight, "Raise Ghoul");
        const ghoul = await until(() => raisedOf(knight, "raise-ghoul")[0], "the ghoul bound");
        await scene.delete();
        await until(() => !game.actors.has(ghoul.id), "the ghoul collapses with its scene", 30000);
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "raise-ghoul"), "and its carrier goes");
      });

      it("A6: a Long Rest ends March of the Damned with the presence", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 March");
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await bank(knight);
        assert.ok(await use(knight, "March of the Damned"), "the march posted its card");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "march"), "the march laid");
        await knight.longRest();
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "march"), "the Long Rest ends the march");
      });
    });

    /* ---------------- Part B: Blood ---------------- */

    describe("Blood", function () {
      it("Rune Tap: a Blood rune for its Runic Power, and Health equal to the tier plus 2 per rank", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Rune Tap", { ranks: { "Blood Shield": 1, "Rune Tap": 2 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await knight.update({ "system.health.value": knight.system.health.max - 20 });
        const before = health(knight);
        const blood = runes(knight).blood.value;
        assert.ok(await use(knight, "Rune Tap"), "Rune Tap posted its card");
        await until(() => runes(knight).blood.value === blood - 1, "one Blood rune spent");
        await until(() => runicPower(knight).value === 4, "its Runic Power: 3 plus half of +3");
        await until(() => health(knight) === before + (knight.system.tier ?? 1) + 4, "the tier plus 4 Health at rank 2");
      });

      it("Blood Tap: spent Blood runes refilled by the rank, once per Short Rest", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Blood Tap", { ranks: { "Blood Tap": 2 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        const full = runes(knight).blood.value;
        await spendRunesOn(knight, { kind: "blood", count: 2 });
        await until(() => runes(knight).blood.value === full - 2, "two Blood runes spent");
        assert.ok(await use(knight, "Blood Tap"), "Blood Tap posted its card");
        await until(() => runes(knight).blood.value === full, "two refilled at rank 2");
        assert.equal(featureNamed(knight, "Blood Tap").system.uses.value, 0, "the Short Rest's use is struck");
      });

      it("Vampiric Blood: a heal the knight takes gives 1 more a rank while it stands", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Vampiric", { ranks: { "Blood Shield": 1, "Rune Tap": 1, "Vampiric Blood": 2 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await knight.update({ "system.health.value": knight.system.health.max - 20 });
        assert.ok(await use(knight, "Vampiric Blood"), "Vampiric Blood posted its card");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.vampiric]), "the state laid");
        const before = health(knight);
        await knight.applyHealing(3, { from: knight, feature: true, featureName: "Death Strike" });
        await until(() => health(knight) === before + 5, "3 Health and 2 more at rank 2");
      });

      it("Sanguine Tide: a Blood rune spent strikes each enemy within 10 feet for the rank, the knight 1 Health for each", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Tide", { ranks: { "Sanguine Tide": 2 } });
        const near = await makeNpc("Kobold");
        const far = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: near, x: 600, y: 500, side: "hostile" }, { actor: far, x: 1500, y: 500, side: "hostile" }]);
        await knight.update({ "system.health.value": knight.system.health.max - 5 });
        const kBefore = health(knight);
        const nearBefore = health(tokenOf(near).actor);
        const farBefore = health(tokenOf(far).actor);
        await spendRunesOn(knight, { kind: "blood", count: 1 });
        await until(() => health(tokenOf(near).actor) === nearBefore - 2, "2 Shadow on the enemy beside the knight");
        await until(() => health(knight) === kBefore + 1, "1 Health back for the one struck");
        assert.equal(health(tokenOf(far).actor), farBefore, "the enemy far off takes nothing");
      });

      it("Dark Command: Taunt's Bane mark on the creature targeted for 2 Runic Power", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Command", { ranks: { "Dark Command": 1 } });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
        await bank(knight, 6);
        assert.ok(await use(knight, "Dark Command", [tokenOf(foe)]), "Dark Command posted its card");
        await until(() => runicPower(knight).value === 4, "2 Runic Power spent");
        await until(() => tokenOf(foe).actor.effects.some(e => e.flags?.[SCOPE]?.[LAID_BANE_FLAG]), "the Bane laid on the creature");
      });

      it("Dancing Runeweapon: with an Epic greatsword, its attack makes one more roll whose Apply heals half", async function () {
        this.timeout(180000);
        // An Epic greatsword's six slots: three Blood runes for the Use's price.
        const knight = await knightWith("ZZ DK4 Dancing", { rarity: "epic", ranks: { "Blood Tap": 1, "Dancing Runeweapon": 1 } });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        assert.ok(await use(knight, "Dancing Runeweapon"), "the Use posted its card");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.dancing]), "the Dancing Runeweapon fights beside the knight");
        await knight.update({ "system.health.value": knight.system.health.max - 10 });
        const blade = knight.items.find(i => i.name === "Greatsword");
        const cards = await attackFromSheet(knight, blade, tokenOf(foe), { cards: 2 });
        const dancing = cards.find(c => c.flags?.[SCOPE]?.dancingRuneweapon);
        assert.ok(dancing, "the second card is the Dancing Runeweapon's");
        const before = health(knight);
        const foeBefore = health(tokenOf(foe).actor);
        const said = await warnings(() => applyOn(dancing, 0));
        const row = (game.messages.get(dancing.id)?.flags?.[SCOPE]?.damageByTarget ?? [])[0] ?? null;
        await until(() => health(tokenOf(foe).actor) < foeBefore, `the Dancing Runeweapon's blow lands (${foeBefore}; row ${JSON.stringify(row)?.slice(0, 200)}; said ${said.join(" | ")}; outcome ${JSON.stringify(dancing.rolls?.[0]?.outcome ?? null)})`);
        const took = foeBefore - health(tokenOf(foe).actor);
        await until(() => health(knight) === before + Math.floor(took / 2), `half its ${took} damage back (${before} -> ${health(knight)})`);
      });
    });

    describe("Blood and Frost at the shared doors", function () {
      it("Grim Harvest: a greatsword's hit on a creature at half its Health gives the rank back", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 Harvest", { ranks: { "Grim Harvest": 2 } });
        const base = await makeNpc("Plagued Ghoul");
        await base.update({ "system.health.value": Math.floor(base.system.health.max / 2) });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: base, x: 600, y: 500, side: "hostile" }]);
        await knight.update({ "system.health.value": knight.system.health.max - 10 });
        const before = health(knight);
        const blade = knight.items.find(i => i.name === "Greatsword");
        const [card] = await attackFromSheet(knight, blade, tokenOf(base), { cards: 1 });
        assert.ok(card, "the attack posted its card");
        const diag = () => JSON.stringify({ strike: card.flags[SCOPE].strike ?? null, wield: knight.gateFacts?.()?.wield ?? null, health: targetSnapshots([tokenOf(base)])[0]?.health ?? null, now: health(knight), before, text: new DOMParser().parseFromString(card.content, "text/html").body.textContent.replace(/\s+/g, " ").slice(0, 300) });
        // A level 20 knight's Attack is two rolls (Extra Attack); the Harvest rides the first alone.
        await until(() => health(knight) === before + 2, `2 Health back at rank 2 ${diag()}`);
        await settle();
        assert.equal(health(knight), before + 2, `once an Attack, not once a roll ${diag()}`);
      });

      it("Crimson Coil and Chill of the Grave: Death Coil's Apply gives the knight temporary Health equal to what it dealt, and Slows the creature", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 Coil", { ranks: { "Crimson Coil": 1, "Chill of the Grave": 1 } });
        // A living foe: Death Coil heals an undead one instead.
        const living = await makeNpc("Kobold");
        await living.update({ "system.health.max": 30, "system.health.value": 30 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: living, x: 700, y: 500, side: "hostile" }]);
        await bank(knight);
        const coil = await until(() => knight.items.find(i => i.type === "spell" && i.name === "Death Coil"), "Death Coil known");
        const [target] = targetSnapshots([tokenOf(living)]);
        const unpin = pinDie(20);
        let card = null;
        try { card = await game.system.azeroth.workflows.castSpell({ actor: knight, spell: coil, dc: 5, targets: [target] }); } finally { unpin(); }
        assert.ok(card, "Death Coil posted its card");
        made.push(card);
        const lifeBefore = health(living);
        await applyOn(card, 0);
        await until(() => health(living) < lifeBefore, "Death Coil's damage lands");
        const dealt = lifeBefore - health(living);
        await until(() => (knight.system.health.temp ?? 0) === dealt, `temporary Health equal to the ${dealt} dealt`);
        await until(() => living.statuses.has("slowed"), "the creature Slowed");
      });

      it("Black Ice and Sanguine Plague: a Frost Fever ticks the tier and the rank, and a Blood Plague's tick heals the knight what it dealt", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK4 Plague", { ranks: { "Black Ice": 2, "Sanguine Plague": 1 } });
        const a = await makeNpc("Kobold");
        const b = await makeNpc("Kobold");
        for (const x of [a, b]) await x.update({ "system.health.max": 40, "system.health.value": 40 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: a, x: 1100, y: 500, side: "hostile" }, { actor: b, x: 1500, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, a, b]);
        await layPlague({ victim: tokenOf(a).actor, kind: "frostFever", by: knight });
        const fever = await until(() => tokenOf(a).actor.effects.find(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Frost Fever laid");
        assert.equal(fever.flags[SCOPE].tick.amount, (knight.system.tier ?? 1) + 2, "the tier and 2 at rank 2");
        await layPlague({ victim: tokenOf(b).actor, kind: "bloodPlague", by: knight });
        await until(() => tokenOf(b).actor.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "bloodPlague"), "the Blood Plague laid");
        await knight.update({ "system.health.value": knight.system.health.max - 10 });
        const kBefore = health(knight);
        const bBefore = health(tokenOf(b).actor);
        await turnForward(combat, b);
        await until(() => health(tokenOf(b).actor) < bBefore, "the Blood Plague ticks");
        const dealt = bBefore - health(tokenOf(b).actor);
        await until(() => health(knight) === Math.min(knight.system.health.max, kBefore + dealt), `the knight regains the ${dealt} it dealt`);
        await combat.delete();
      });
    });

    /* ---------------- Part B: Frost ---------------- */

    describe("Frost", function () {
      it("Killing Machine and Runic Frost: a Frost rune gives 4 plus the rank with a blade in each hand, and lays the next Frost spell's discount", async function () {
        this.timeout(120000);
        // Two Versatile longswords, one in each hand: Frost's grip.
        const knight = await knightWith("ZZ DK4 Machine", { weapons: ["Longsword", "Mace"], ranks: { "Killing Machine": 2, "Runic Frost": 1 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await spendRunesOn(knight, { kind: "frost", count: 1 });
        await until(() => runicPower(knight).value === 6, "6 Runic Power: 4 and 2 more at rank 2");
        const next = await until(() => (knight.getFlag(SCOPE, NEXT_SPELL_FLAG) ?? []).find(e => e.source === "runic-frost"), "Runic Frost's discount laid");
        assert.deepEqual(next.schools, ["frost"], "on a Frost spell alone");
        assert.equal(next.amount, 2);
        await spendRunesOn(knight, { kind: "blood", count: 1 });
        await until(() => runicPower(knight).value === 10, "a Blood rune gives its 4 alone");
      });

      it("Icebound Fortitude: asked in the blow, a Frost rune and the Reaction paid, the blow halved before Armor Points, and the next one too", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 Icebound", { ranks: { "Icebound Fortitude": 1 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        const frost = runes(knight).frost.value;
        const before = health(knight);
        const input = { rating: 12, sl: 0, kind: "physical", location: "body", apByLocation: { body: 6 } };
        const blow = knight.applyDamage(6, { struck: true, attack: true, type: "physical", mitigation: { version: 1, input } });
        await answerAsk(true);
        await blow;
        await until(() => runes(knight).frost.value === frost - 1, "a Frost rune spent");
        assert.equal(health(knight), before, "12 against Armor Points 6, halved first, deals 0");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.icebound]), "the state laid");
        await knight.applyDamage(6, { struck: true, attack: true, type: "physical", mitigation: { version: 1, input } });
        assert.equal(health(knight), before, "the next blow is halved with no ask");
        assert.equal(featureNamed(knight, "Icebound Fortitude").system.uses.value, 0, "the encounter's use struck");
      });

      it("Empower Runeweapon: the knight's own Frost Fevers in reach ended, a Frost rune refilled for each", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK4 Empower", { ranks: { "Empower Runeweapon": 1 } });
        const a = await makeNpc("Kobold");
        const b = await makeNpc("Kobold");
        const far = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: a, x: 600, y: 500, side: "hostile" }, { actor: b, x: 500, y: 600, side: "hostile" }, { actor: far, x: 1500, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, a, b, far]);
        for (const x of [a, b, far]) await layPlague({ victim: tokenOf(x).actor, kind: "frostFever", by: knight });
        for (const x of [a, b, far]) await until(() => tokenOf(x).actor.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Fever laid");
        const full = runes(knight).frost.value;
        await spendRunesOn(knight, { kind: "frost", count: 2 });
        await freshTurn(knight, 1);
        assert.ok(await use(knight, "Empower Runeweapon"), "the Use posted its card");
        await until(() => !tokenOf(a).actor.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Fever within 15 feet ends");
        await until(() => !tokenOf(b).actor.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "and the other");
        assert.isTrue(tokenOf(far).actor.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Fever 50 feet off stands");
        await until(() => runes(knight).frost.value === full, "two Frost runes refilled");
        await combat.delete();
      });

      it("Remorseless Winter: an enemy starting its turn inside takes the tier in Frost and is Slowed", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK4 Winter", { ranks: { "Icebound Fortitude": 1, "Remorseless Winter": 1 } });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await freshTurn(knight, 1);
        // A Rare greatsword holds 2 Frost runes: the winter's 3 need a fourth slot, so the knight is given an Epic one.
        const blade = knight.items.find(i => i.name === "Greatsword");
        await blade.update({ "system.rarity": "epic" });
        await until(() => runes(knight).slots === 6, "an Epic greatsword's six slots");
        await inscribeRunes(knight, knight.items.get(blade.id), { blood: 3, frost: 3, grip: null });
        await until(() => runes(knight).frost.value === 3, "three Frost runes");
        assert.ok(await use(knight, "Remorseless Winter"), "the Use posted its card");
        await until(() => runes(knight).frost.value === 0, "3 Frost runes spent");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.winter]), "the winter laid");
        const theirs = tokenOf(foe).actor;
        const before = health(theirs);
        await turnForward(combat, foe);
        await until(() => health(theirs) < before, "the tier in Frost at its turn start");
        await until(() => theirs.statuses.has("slowed"), "and Slowed");
        await combat.delete();
      });

      it("Relentless Advance: a Slowed creature within the knight's reach cannot Disengage", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 Relentless", { ranks: { "Icy Grip": 1, "Relentless Advance": 1 } });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const theirs = tokenOf(foe).actor;
        await theirs.toggleStatusEffect("slowed", { active: true });
        const { disengage } = await import("../applications/combat-actions.mjs");
        const done = await disengage(theirs);
        assert.isNull(done, "the Disengage is refused");
        assert.isFalse(theirs.statuses.has("disengaging"), "and nothing was written");
      });

      it("Hungering Cold: a Frost rune and the encounter's use, the card carrying the Body Test and an Entangled ended only by its Test", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK4 Hungering", { ranks: { "Icy Grip": 1, "Relentless Advance": 1, "Hungering Cold": 1 } });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const frost = runes(knight).frost.value;
        const card = await use(knight, "Hungering Cold");
        assert.ok(card, "the Use posted its card");
        await until(() => runes(knight).frost.value === frost - 1, "a Frost rune spent");
        const inflicts = card.flags[SCOPE].inflicts ?? featureNamed(knight, "Hungering Cold").system.inflicts;
        const row = (inflicts ?? []).find(i => i.condition === "entangled");
        assert.ok(row, "the Entangled rides the Use");
        assert.equal(row.escape?.on, "turnEnd", "ended by the Test at the end of each turn");
        assert.equal(row.escape?.resilience, "body");
      });

      it("Glacial Advance: a Charisma +4 knight's line deals 5 plus 2 (D-974)", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK4 Glacial", { cha: 18, spells: ["Glacial Advance"] });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }]);
        await bank(knight, 14);
        const spell = knight.items.find(i => i.type === "spell" && i.name === "Glacial Advance");
        const [target] = targetSnapshots([tokenOf(foe)]);
        const unpin = pinDie(20);
        let card = null;
        try {
          card = await game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [target] });
        } finally { unpin(); }
        assert.ok(card, "the cast posted its card");
        made.push(card);
        // The Kobold holds no Ward against Frost: what lands is the Rating.
        const f = card.flags[SCOPE];
        const dealt = f.damageByTarget?.[0]?.damage ?? null;
        assert.equal(dealt, 7, `5 and half of +4 (card: ${JSON.stringify({ byTarget: f.damageByTarget, targets: (f.targets ?? []).length, success: f.success }).slice(0, 400)})`);
      });
    });

    /* ---------------- Part C: the grip alternates (D-1017) ---------------- */

    describe("the grip alternates (D-1017)", function () {
      /** The attack cards this knight posts while `fn` runs, each pushed to `made`. */
      async function cardsDuring(knight, fn) {
        const posted = [];
        const hook = Hooks.on("createChatMessage", m => {
          if (m.speaker?.actor === knight.id && m.flags?.[SCOPE]?.kind === "attack") posted.push(m);
        });
        try { await fn(posted); } finally { Hooks.off("createChatMessage", hook); }
        for (const m of posted) made.push(m);
        return posted;
      }

      it("Grim Harvest: an Off-Hand Attack in two one-handers on a creature at half Health gives 2 per rank", async function () {
        this.timeout(150000);
        // Level 4: one roll an Attack, so the card's own off-hand button is the one pressed.
        const knight = await knightWith("ZZ DK5 Harvest Off", { level: 4, weapons: ["Longsword", "Mace"], ranks: { "Grim Harvest": 2 } });
        assert.isTrue(knight.gateFacts().wield.oneInEach, "a one-handed weapon in each hand");
        const foe = await makeNpc("Plagued Ghoul");
        await foe.update({ "system.health.max": 40, "system.health.value": 20 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        await knight.update({ "system.health.value": knight.system.health.max - 10 });
        const sword = knight.items.find(i => i.name === "Longsword");
        const [main] = await attackFromSheet(knight, sword, tokenOf(foe), { cards: 1 });
        assert.ok(main, "the main hand's card");
        await settle();
        const before = health(knight);
        canvas.tokens.setTargets([tokenOf(foe).id]);
        let pressed = null;
        const off = await cardsDuring(knight, async posted => {
          pressed = await pressCard(main, '[data-action="offHandFromCard"]', { face: 20 });
          await until(() => posted.length >= 1, "the Off-Hand Attack's card", 30000);
        });
        await pressed?.release();
        canvas.tokens.setTargets([]);
        assert.isTrue(off[0].flags[SCOPE].offHand === true, "the card is the Off-Hand Attack's");
        await until(() => health(knight) === before + 4, `2 Health per rank at half Health (${before} -> ${health(knight)}): ${textOf(off[0]).slice(0, 300)}`);
      });

      it("Vengeful Blood: a melee blow in two one-handers offers the riposte; taking it spends the Reaction and the round's Off-Hand Attack, and adds the rank plus 1 in Shadow (O-398's A)", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Riposte", { level: 4, weapons: ["Longsword", "Mace"], ranks: { "Vengeful Blood": 2 } });
        const foe = await makeNpc("Kobold");
        await foe.update({ "system.health.max": 60, "system.health.value": 60 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await turnForward(combat, foe);
        const mine = combat.getCombatantsByActor(knight)[0];
        await until(() => (mine.budget?.reactions ?? 0) === 1 && (mine.budget?.offHandAttacks ?? 0) === 1, "the knight's Reaction and Off-Hand Attack");
        const halves = mine.budget.halfActions;
        // The Kobold's melee blow at the knight, landed through the card's own Apply.
        canvas.tokens.setTargets([tokenOf(knight).id]);
        const unpin = pinDie(20);
        let blow = null;
        try { blow = await npcAttackWithDialog(tokenOf(foe).actor, 0, null, {}); } finally { unpin(); canvas.tokens.setTargets([]); }
        assert.ok(blow, "the Kobold's card");
        made.push(blow);
        assert.equal(blow.flags[SCOPE].strike?.rangeKind, "melee", "a melee blow");
        const offers = () => game.messages.filter(m => m.flags?.[SCOPE]?.kind === VENGEFUL_OFFER_KIND && m.flags[SCOPE].holder === knight.uuid);
        const had = offers().length;
        const life = health(knight);
        await applyOn(blow, 0);
        await until(() => health(knight) < life, "the blow damages the knight");
        const offer = await until(() => offers().length > had ? offers().at(-1) : null, "the riposte offered");
        made.push(offer);
        let pressed = null;
        const struck = await cardsDuring(knight, async posted => {
          pressed = await pressCard(offer, '[data-action="vengefulRiposte"]', { face: 20 });
          await until(() => posted.length >= 1, "the riposte's card", 30000);
        });
        await pressed?.release();
        const card = struck[0];
        assert.isTrue(card.flags[SCOPE].offHand === true, "the riposte is the Off-Hand Attack");
        // Rank 2 plus 1 (the lead's raise, O-398's A).
        assert.include(textOf(card), "3 additional Shadow damage", `the rank plus 1 in Shadow on the hit: ${textOf(card).slice(0, 300)}`);
        await until(() => mine.budget.reactions === 0 && mine.budget.offHandAttacks === 0, `the Reaction and the round's Off-Hand Attack spent (${JSON.stringify(mine.budget)})`);
        assert.equal(mine.budget.halfActions, halves, "no Half-Action spent");
        // The round marked once the card exists (the press's last write, awaited before the fight is deleted).
        await until(() => (mine.getFlag(SCOPE, "round")?.once ?? []).includes("vengeful-blood"), "the round's mark spent");
        // Not open once the round's Off-Hand Attack is made: a second press is refused in words.
        const said = await warnings(async () => {
          await CARD_ACTIONS.vengefulRiposte(document.querySelector(`#chat [data-message-id="${offer.id}"] [data-action="vengefulRiposte"]`));
        });
        assert.isTrue(said.some(s => s.includes("Vengeful Blood")), `the second press refused in words: ${said.join(" | ")}`);
        await settle();
        await combat.delete();
      });

      it("Frozen Edge: a greatsword's first melee hit this turn Slows the creature until the end of its next turn, and the next hit on it adds Frost", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Edge Two", { level: 4, ranks: { "Frozen Edge": 2 } });
        assert.isTrue(knight.gateFacts().wield.bothHands, "a two-handed weapon");
        const foe = await makeNpc("Kobold");
        await foe.update({ "system.health.max": 80, "system.health.value": 80 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await freshTurn(knight, 2);
        const blade = knight.items.find(i => i.name === "Greatsword");
        const theirs = tokenOf(foe).actor;
        assert.isFalse(theirs.statuses.has("slowed"), "not Slowed before");
        const [first] = await attackFromSheet(knight, blade, tokenOf(foe), { cards: 1 });
        await until(() => theirs.statuses.has("slowed"), `the first melee hit Slows it: ${textOf(first).slice(0, 300)}`);
        assert.notInclude(textOf(first), "2 additional Frost damage", "the hit that Slows it is no hit on a Slowed creature");
        const slowed = theirs.effects.find(e => e.statuses?.has?.("slowed"));
        assert.ok(slowed?.duration?.units || slowed?._source?.duration?.units, "Slowed carries a span");
        const [second] = await attackFromSheet(knight, blade, tokenOf(foe), { cards: 1 });
        const words = textOf(second);
        assert.include(words, "2 additional Frost damage", `the next hit on a Slowed creature adds the rank in Frost: ${words.slice(0, 300)}`);
        assert.notInclude(words, "the first melee hit this turn", "the turn's first hit is spent");
        await combat.delete();
      });

      it("Killing Machine: a greatsword's hit at SL 2 gives 1 Runic Power per rank once a round on a creature that is not Slowed (O-398's C), and at rank 2 a hit on a Slowed creature a Critical Injury", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Machine Two", { level: 4, ranks: { "Killing Machine": 2 } });
        const foe = await makeNpc("Kobold");
        await foe.update({ "system.health.max": 80, "system.health.value": 80 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await freshTurn(knight, 2);
        const blade = knight.items.find(i => i.name === "Greatsword");
        const theirs = tokenOf(foe).actor;
        assert.isFalse(theirs.statuses.has("slowed"), "not Slowed before");
        const rpBefore = runicPower(knight).value;
        // A 19, no natural 20: a Critical Injury would be the talent's, not the die's.
        const [first] = await attackFromSheet(knight, blade, tokenOf(foe), { face: 19, cards: 1 });
        const outcome = first.rolls?.[0]?.outcome ?? null;
        assert.isAtLeast(outcome?.sl ?? -9, 2, `the hit reaches SL 2 (${JSON.stringify(outcome)})`);
        // C: the Runic Power needs no Slowed creature.
        await until(() => runicPower(knight).value === rpBefore + 2, `2 Runic Power at rank 2 on a creature that is not Slowed (${rpBefore} -> ${runicPower(knight).value})`);
        assert.isNull(new DOMParser().parseFromString(first.content, "text/html").querySelector('[data-action="criticalInjury"]'), "no Critical Injury on a creature that is not Slowed");
        // The rank 2 Critical Injury keeps its Slowed gate (MY READING of C).
        await theirs.toggleStatusEffect("slowed", { active: true });
        await until(() => theirs.statuses.has("slowed"), "the Kobold Slowed");
        const [second] = await attackFromSheet(knight, blade, tokenOf(foe), { face: 19, cards: 1 });
        await settle();
        assert.equal(runicPower(knight).value, rpBefore + 2, "once a round");
        assert.ok(new DOMParser().parseFromString(second.content, "text/html").querySelector('[data-action="criticalInjury"]'), "a hit at SL 2 on a Slowed creature inflicts one");
        await combat.delete();
      });

      it("Relentless Advance: a greatsword's Opportunity Attack is offered at 10 feet at rank 2, and its hit adds the tier in Frost", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Relentless Two", { level: 4, ranks: { "Icy Grip": 1, "Relentless Advance": 2 } });
        const foe = await makeNpc("Kobold");
        await foe.update({ "system.health.max": 80, "system.health.value": 80 });
        // Ten feet apart: two squares, outside a greatsword's five and inside its five plus five.
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        await turnForward(combat, foe);
        const offered = () => game.messages.filter(m => m.flags?.[SCOPE]?.reaction === "opportunityAttack");
        const before = offered().length;
        const doc = tokenOf(foe).document;
        await doc.update({ x: 1200, y: 500 });
        await until(() => doc.x === 1200, "the Kobold walks away", 20000);
        const offer = await until(() => offered().length > before ? offered().at(-1) : null, "the departure offering the knight an Opportunity Attack");
        made.push(offer);
        const box = document.createElement("div");
        box.innerHTML = offer.content;
        const button = box.querySelector('[data-action="opportunityAttack"]');
        assert.equal(button?.dataset?.actorUuid, knight.uuid, "the offer is the knight's");
        assert.equal(Number(button.dataset.distance), 10, "measured at 10 feet");
        const unpin = pinDie(20);
        let card = null;
        try { card = await CARD_ACTIONS.opportunityAttack(button, offer); } finally { unpin(); }
        assert.ok(card, "the Opportunity Attack rolled");
        made.push(card);
        const tier = knight.system.tier ?? 1;
        assert.include(textOf(card), `${tier} additional Frost damage on the Opportunity Attack`, `the tier in Frost: ${textOf(card).slice(0, 300)}`);
        await combat.delete();
      });
    });
  });
}
