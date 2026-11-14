/**
 * **THE DEATH KNIGHT'S ANIMATION AND SOUND, THROUGH THE REAL DOORS** (the Death Knight plan's
 * Phase 6, run F5; D-723 to D-730). Every record is written by the door that writes it in play -
 * the one rune door, the cast, the Plague door, the blow that asks Icebound Fortitude, the sheet's
 * own Use - read by the real reader (`module/animation/records.mjs`) and planned by the real law,
 * and the recorder (`testing/animation-recorder.mjs`) reports what the layer would have played on
 * which token. A loop is started by laying the state and ended by deleting it, with no code path
 * of its own (D-729).
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.death-knight-animation`. Every document a test makes is
 * deleted in `after`; the switches and the roll dialog are put back as they were found.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { answerAsk, chooser, featureNamed, pressCard, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { FLARE_CARD_WAIT_MS, FORCED_MOVE_KEY, attackPrivacyKey, featurePrivacyKey } from "../rules/animation-records.mjs";
import { forceMove } from "../effects/forced-movement.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { inscribeRunes, spendRunesOn } from "../documents/runes.mjs";
import { layPlague } from "../effects/death-knight.mjs";
import { castWithDialog } from "../applications/actions.mjs";
import { DK_FLAGS } from "../rules/death-knight-talents.mjs";
import { PRESENCE_FLAG } from "../rules/death-knight.mjs";

const SCOPE = "azeroth-rpg";
const api = () => game.system.azeroth.animations;
const runes = actor => actor.system?.runes ?? { weapons: [], value: 0, slots: 0, blood: { value: 0 }, frost: { value: 0 } };
const runicPower = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "runicPower") ?? null;

/** A Human Death Knight 20, Charisma 16, its greatsword Rare, wielded and inscribed half and half. */
async function knightWith(name, { ranks = {}, spells = [] } = {}) {
  const k = await makeCharacter({ name, classes: [["Death Knight", 20]], race: "Human", weapons: ["Greatsword"], spells, abilities: { str: 16, cha: 16, con: 14 } });
  await k._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(k, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  const blade = await until(() => k.items.find(i => i.type === "weapon" && i.name === "Greatsword"), "the greatsword carried");
  await blade.update({ "system.rarity": "rare", "system.equipped": true });
  await until(() => runes(k).slots > 0, "the rune slots");
  for (const row of runes(k).weapons) {
    const blood = Math.ceil(row.slots / 2);
    await inscribeRunes(k, k.items.get(row.itemId), { blood, frost: row.slots - blood, grip: row.grip ?? null });
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

/** A corpse: a Kobold (Small, Humanoid) at 0 Health. */
async function corpse(name) {
  const npc = await makeNpc("Kobold");
  await npc.update({ name: `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

/** Press a feature's Use on the sheet's Combat tab, these tokens targeted; the card, or null. */
async function pressFeature(actor, name, { targets = [], ms = 15000 } = {}) {
  const feature = await until(() => featureNamed(actor, name), `${name} granted`);
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${name}`);
  canvas.tokens.setTargets(targets.map(t => t.id));
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "feature")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  const unpin = pinDie(15);
  try {
    control.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await sheet.close();
  }
}

/** Press the one chooser's button with whatever it preselected. */
async function chooseAsOffered(item) {
  const app = await chooser(item);
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

export function deathKnightAnimationBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Death Knight's animation and sound, through the real doors (run F5)", function () {
    const held = {};
    let recorder = null;
    let previousPlayer = null;
    let restoreText = null;

    /** Wait for the settle gate on the viewed board, and say which reason stood if it never opens. */
    async function untilAvailable(ms = 20000) {
      const start = Date.now();
      for (;;) {
        const state = animationAvailability();
        if (state.ok) return state;
        if (Date.now() - start > ms) throw new Error(`nothing may play here: ${state.reason}`);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    /** The cues one trigger played for one key, waited for. */
    const cueOf = (trigger, key, what) => until(() => recorder.cuesFor(trigger, key).at(-1) ?? null, what, 15000);
    /** The loops of one key the recorder holds as playing. */
    const playingOf = key => [...recorder.activeLoops().keys()].filter(k => recorder.loops.some(l => l.key === k && l.loop?.identifier === key));
    /** Force a reconcile and wait for a loop of a key to stand, or to be gone. */
    async function loopStands(key, yes = true) {
      return until(() => {
        api().director.reconcile({ force: true });
        return yes ? playingOf(key).length > 0 : playingOf(key).length === 0;
      }, `${key}'s loop ${yes ? "standing" : "ended"}`, 15000);
    }

    before(async function () {
      this.timeout(120000);
      for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
        held[key] = game.settings.get(SCOPE, key);
        await game.settings.set(SCOPE, key, true);
      }
      held.photosensitive = game.settings.get("core", "photosensitiveMode");
      if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", false);
      held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
      recorder = new (api().Recorder)();
      previousPlayer = api().director.setPlayer(recorder);
    });

    after(async function () {
      this.timeout(180000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | DK animation teardown (${what}): ${err?.message ?? err}`); } };
      await restore("the player", () => { if (previousPlayer) api().director.setPlayer(previousPlayer); });
      await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
      await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog));
      await restore("photosensitive mode", async () => { if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", true); });
      await restore("the switches", async () => {
        for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) await game.settings.set(SCOPE, key, held[key]);
      });
      await restore("the raised dead", async () => {
        const knights = new Set(made.filter(d => d instanceof Actor).map(d => d.uuid));
        for (const a of game.actors.filter(x => knights.has(x.getFlag?.(SCOPE, "bond")?.ownerUuid))) await a.delete();
      });
      await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
      await cleanup();
      await restoreText?.();
    });

    it("a rune spent through the one rune door flares at the knight: Blood red, Frost blue, each with its sound", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Runes");
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      const mine = tokenOf(knight).id;
      recorder.reset();
      assert.isTrue((await spendRunesOn(knight, { kind: "blood", count: 1 })).ok, "a Blood rune spent");
      const blood = await cueOf("use", "rune:blood", "the Blood rune's flare");
      assert.equal(blood.record.source?.tokenId, mine, "recorded on the knight's own token");
      assert.deepEqual(blood.steps.map(s => s.kind).sort(), ["effect", "sound"]);
      assert.equal(blood.steps.find(s => s.kind === "effect").asset, "jb2a.magic_signs.rune.evocation.complete.red");
      assert.equal(blood.steps.find(s => s.kind === "effect").on, mine);
      assert.isTrue((await spendRunesOn(knight, { kind: "frost", count: 1 })).ok, "a Frost rune spent");
      const frost = await cueOf("use", "rune:frost", "the Frost rune's flare");
      assert.equal(frost.steps.find(s => s.kind === "effect").asset, "jb2a.magic_signs.rune.abjuration.complete.blue");
      // A Blood spend never flared Frost, and an update that spends nothing flares nothing.
      assert.equal(recorder.cuesFor("use", "rune:frost").length, 1);
      const count = recorder.cues.length;
      await knight.update({ "system.health.value": knight.system.health.max - 1 });
      await settle();
      assert.equal(recorder.cues.filter(c => String(c.record?.identifier ?? "").startsWith("rune:")).length, 2, `no flare off a Health write (${recorder.cues.length - count} other cues)`);
    });

    it("Corpse Burst cast from the real door cues at cast on the creature it records, and a failed cast records failed-cast", async function () {
      this.timeout(150000);
      const knight = await knightWith("ZZ DK Anim Burst", { spells: ["Corpse Burst"] });
      const body = await corpse("Anim Burst Body");
      const second = await corpse("Anim Burst Body Two");
      const foe = await makeNpc("Kobold");
      await sceneWith([
        { actor: knight, x: 500, y: 500 }, { actor: body, x: 700, y: 500, side: "hostile" },
        { actor: foe, x: 800, y: 500, side: "hostile" }, { actor: second, x: 500, y: 800, side: "hostile" }
      ]);
      await untilAvailable();
      await bank(knight);
      const burst = knight.items.find(i => i.type === "spell" && i.name === "Corpse Burst");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      recorder.reset();
      let unpin = pinDie(20);
      try {
        const going = castWithDialog(knight, burst);
        await chooseAsOffered(burst);
        const card = await going;
        if (card) made.push(card);
        assert.ok(card, "Corpse Burst posted its card");
      } finally { unpin(); canvas.tokens.setTargets([]); }
      const cast = await cueOf("cast", "corpse-burst", "Corpse Burst's cast cue");
      // **WHERE THE CORPSE LAY** (D-1014, O-383): the card records the corpse the chooser took, its
      // centre at the cast, and the burst is drawn there - never on a creature the card records.
      const recorded = cast.record.corpse;
      assert.ok(recorded, `the card records the corpse: ${JSON.stringify(cast.record)}`);
      const bodyToken = canvas.scene.tokens.get(recorded.tokenId);
      assert.include([tokenOf(body).id, tokenOf(second).id], recorded.tokenId, "one of the two corpses");
      assert.deepEqual({ x: recorded.x, y: recorded.y }, { x: bodyToken.object.center.x, y: bodyToken.object.center.y }, "at its centre");
      const wave = cast.steps.find(s => s.asset === "jb2a.toll_the_dead.green.shockwave");
      assert.deepEqual(wave?.at, { x: recorded.x, y: recorded.y }, "the burst where the corpse lay");
      assert.isUndefined(wave?.on, "and not on the creature the card recorded");
      assert.deepEqual(cast.steps.find(s => s.kind === "sound")?.at, { x: recorded.x, y: recorded.y }, "with its sound there");
      // A failed Casting Test spends its Runic Power and plays nothing (07 §8, D-756).
      await bank(knight);
      recorder.reset();
      unpin = pinDie(1);
      try {
        const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell: burst, dc: 30, targets: [] });
        await chooseAsOffered(burst);
        const card = await going;
        if (card) made.push(card);
        assert.equal(card?.flags?.[SCOPE]?.success, false, "the Casting Test failed");
      } finally { unpin(); }
      await until(() => recorder.skips.some(s => s.record?.identifier === "corpse-burst"), "the failed cast's refusal");
      const words = recorder.skips.filter(s => s.record?.identifier === "corpse-burst").map(s => s.skip);
      assert.include(words, "failed-cast", `the failed cast says failed-cast: ${words.join(", ")}`);
      assert.equal(recorder.cuesFor("cast", "corpse-burst").length, 0, "and plays nothing");
    });

    it("a Frost Fever laid through the Plague door is cued on its carrier and stands while it stands; deleting it ends the loop", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Fever");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      await untilAvailable();
      recorder.reset();
      const theirs = tokenOf(foe).actor;
      await layPlague({ victim: theirs, kind: "frostFever", by: knight });
      const carrier = await until(() => theirs.effects.find(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Fever's carrier");
      const arrived = await cueOf("effect", "plague", "the Fever's arrival");
      assert.deepEqual(arrived.record.states, ["frostFever"]);
      assert.equal(arrived.steps.find(s => s.kind === "effect").on, tokenOf(foe).id, "on the creature carrying it");
      await loopStands("plague");
      const [key] = playingOf("plague");
      assert.include(key, tokenOf(foe).id, "the loop stands on the carrier's token");
      await carrier.delete();
      await loopStands("plague", false);
      assert.include(recorder.ended, key, "the loop ended when the carrier was deleted");
    });

    it("Icebound Fortitude, asked in the blow, flares its Frost rune, cues the state's arrival and stands the ice until the state is deleted", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Icebound", { ranks: { "Icebound Fortitude": 1 } });
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      recorder.reset();
      const input = { rating: 12, sl: 0, kind: "physical", location: "body", apByLocation: { body: 6 } };
      const blow = knight.applyDamage(6, { struck: true, attack: true, type: "physical", mitigation: { version: 1, input } });
      await answerAsk(true);
      await blow;
      const state = await until(() => knight.effects.find(e => e.flags?.[SCOPE]?.[DK_FLAGS.icebound]), "the state laid");
      await cueOf("use", "rune:frost", "the Frost rune's flare");
      const arrived = await cueOf("effect", "icebound-fortitude", "Icebound's arrival");
      assert.deepEqual(arrived.record.states, [DK_FLAGS.icebound]);
      await loopStands("icebound-fortitude");
      assert.equal(recorder.cuesFor("use", "icebound-fortitude").length, 0, "no Use card, so no use cue");
      await state.delete();
      await loopStands("icebound-fortitude", false);
    });

    it("Unholy Presence from the sheet cues as it is taken up and stands its aura; a second Use ends it and the aura with it", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Presence");
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      await bank(knight);
      recorder.reset();
      assert.ok(await pressFeature(knight, "Unholy Presence"), "the Use posted its card");
      await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "presence"), "the presence laid");
      const arrived = await cueOf("effect", "unholy-presence", "the presence's arrival");
      assert.include(arrived.record.states, PRESENCE_FLAG);
      await loopStands("unholy-presence");
      assert.isNull(await pressFeature(knight, "Unholy Presence", { ms: 4000 }), "a second Use ends it with no card");
      await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "presence"), "the presence ended");
      await loopStands("unholy-presence", false);
    });

    it("Desecration from the sheet cues at its own Region and stands the cracked ground; deleting the Region ends it", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Desecration");
      const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      await bank(knight);
      recorder.reset();
      assert.ok(await pressFeature(knight, "Desecration"), "the Use posted its card");
      const region = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.featureKey === "desecration"), "the desecrated ground");
      const cue = await cueOf("region", "desecration", "the ground's cue");
      assert.isTrue(cue.steps.some(s => s.kind === "sound"), "with its sound");
      await loopStands("desecration");
      await region.delete();
      await loopStands("desecration", false);
    });

    it("Death Grip from the sheet throws its grip from the knight to the creature targeted", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Grip");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 1000, y: 500, side: "hostile" }]);
      await untilAvailable();
      recorder.reset();
      assert.ok(await pressFeature(knight, "Death Grip", { targets: [tokenOf(foe)] }), "the Use posted its card");
      const use = await cueOf("use", "death-grip", "Death Grip's cue");
      const strand = use.steps.find(s => s.asset === "jb2a.energy_strands.range.standard.purple.01");
      assert.equal(strand?.fromToken, tokenOf(knight).id);
      assert.equal(strand?.toToken, tokenOf(foe).id);
    });

    it("Death Grip's failed Test pulls the creature, and the pull is drawn along its path to the knight (D-1015)", async function () {
      this.timeout(150000);
      const knight = await knightWith("ZZ DK Anim Pull");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 1100, y: 500, side: "hostile" }]);
      await untilAvailable();
      // A token's centre as the board draws it - the anchor the layer reads (`records.mjs#tokenFacts`).
      // `tokenOf` hands back the placeable (`Actor#getActiveTokens(linked)`), whose centre is drawn.
      const centreOf = token => ({ x: token.center.x, y: token.center.y });
      const standing = centreOf(tokenOf(foe));
      recorder.reset();
      const card = await pressFeature(knight, "Death Grip", { targets: [tokenOf(foe)] });
      assert.ok(card, "the Use posted its card");
      assert.equal(card.flags?.[SCOPE]?.forced?.toward, "toward", "the card carries the pull");
      // A passing grip draws no pull; this one fails (a 1 on the die).
      const pressed = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
      let pull = null;
      try { pull = await cueOf("arrive", "death-grip", "the pull's cue"); } finally { await pressed.release(); }
      // The drawn token may still be travelling (CLAUDE.md §15): wait for it to stand still.
      let last = null;
      const landed = await until(() => {
        const now = centreOf(tokenOf(foe));
        const still = last && now.x === last.x && now.y === last.y && now.x < standing.x;
        last = now;
        return still ? now : null;
      }, "the pulled token at rest", 15000);
      assert.isBelow(landed.x, standing.x, `the creature was pulled toward the knight (${JSON.stringify({ standing, landed })})`);
      assert.equal(pull.record.source?.tokenId, tokenOf(knight).id, "the knight's token is the pull's source");
      assert.notEqual(pull.record.contentVisible, false, "a public Use's pull is seen");
      const drag = pull.steps.find(s => s.asset === "jb2a.energy_strands.range.standard.purple.01");
      assert.deepEqual(drag?.from, standing, "from where the creature stood");
      assert.deepEqual(drag?.to, landed, "to where it lands beside the knight");
      assert.deepEqual(pull.steps.find(s => s.asset === "jb2a.markers.chain.spectral_standard.complete.02.blue")?.at, landed, "the chain on it there");
      assert.isTrue(pull.steps.some(s => s.kind === "sound"), "with its sound");
    });

    it("a private Use's rune flare waits for its card and is hidden where the card may not be read (D-1013, O-382)", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Private");
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      // A second user the card is whispered to: on this (the GM's) client a card another user wrote
      // and whispered to themselves alone is not readable, which is the shape a private Use takes on
      // every other player's client (core's `ChatMessage#isContentVisible`).
      const other = await User.create({ name: `ZZ DK anim player ${foundry.utils.randomID(6)}`, role: 1, password: "" });
      const cardFor = (key, whisper) => ChatMessage.create({
        ...(whisper ? { author: other.id, whisper: [other.id] } : {}),
        speaker: ChatMessage.getSpeaker({ actor: knight }), content: "<p>ZZ DK flare privacy</p>",
        flags: { [SCOPE]: { kind: "feature", featureKey: key, source: { sceneId: canvas.scene.id, tokenId: tokenOf(knight).id } } }
      });
      try {
        recorder.reset();
        assert.isTrue((await spendRunesOn(knight, { kind: "blood", count: 1, privacy: featurePrivacyKey(knight.id, "rune-tap") })).ok, "a Blood rune spent for a Use");
        await new Promise(r => setTimeout(r, 250));
        assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "the flare waits for its Use's card");
        made.push(await cardFor("rune-tap", true));
        await until(() => recorder.skips.some(s => s.record?.identifier === "rune:blood" && s.skip === "hidden"), "the flare refused as hidden");
        assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "and it never played");
        // The same Use made public a moment later flares: an earlier card never speaks for a later flare.
        recorder.reset();
        assert.isTrue((await spendRunesOn(knight, { kind: "frost", count: 1, privacy: featurePrivacyKey(knight.id, "rune-tap") })).ok, "a Frost rune spent for the next Use");
        made.push(await cardFor("rune-tap", false));
        const shown = await cueOf("use", "rune:frost", "the public Use's flare");
        assert.notEqual(shown.record.contentVisible, false);
        // A spend no Use paid for carries no pair and flares at once, as before.
        recorder.reset();
        assert.isTrue((await spendRunesOn(knight, { kind: "blood", count: 1 })).ok, "a bare Blood rune spent");
        const bare = await cueOf("use", "rune:blood", "the bare spend's flare");
        assert.isUndefined(bare.record.privacy, "with no pair");
      } finally {
        await other.delete();
      }
    });

    it("a flare whose card never arrives waits FLARE_CARD_WAIT_MS and is then hidden (the close review's finding 5, O-395)", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Late");
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      recorder.reset();
      const spentAt = Date.now();
      assert.isTrue((await spendRunesOn(knight, { kind: "blood", count: 1, privacy: featurePrivacyKey(knight.id, "rune-tap") })).ok, "a Blood rune spent for a Use");
      // Past the state cue's old 1.5 seconds it is still waiting (O-395's longer wait).
      await new Promise(r => setTimeout(r, 2000));
      assert.isFalse(recorder.skips.some(s => s.record?.identifier === "rune:blood"), "still waiting at 2 seconds");
      assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "and nothing played");
      // No card ever comes: the flare is refused as hidden once the wait ends, never played.
      await until(() => recorder.skips.some(s => s.record?.identifier === "rune:blood" && s.skip === "hidden"), "the late flare refused as hidden", FLARE_CARD_WAIT_MS + 10000);
      assert.isAtLeast(Date.now() - spentAt, FLARE_CARD_WAIT_MS - 50, "not before the wait ended");
      assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "it never played");
    });

    it("a private attack's card hides the flare of the runes its riders spent, and a public one shows it (O-394)", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Attack");
      await sceneWith([{ actor: knight, x: 500, y: 500 }]);
      await untilAvailable();
      const other = await User.create({ name: `ZZ DK anim attacker ${foundry.utils.randomID(6)}`, role: 1, password: "" });
      // The attack card's own shape (`kind: "attack"`), whispered to another user alone, as a
      // private roll reads on every other client.
      const attackCard = whisper => ChatMessage.create({
        ...(whisper ? { author: other.id, whisper: [other.id] } : {}),
        speaker: ChatMessage.getSpeaker({ actor: knight }), content: "<p>ZZ DK attack privacy</p>",
        flags: { [SCOPE]: { kind: "attack", targets: [], source: { sceneId: canvas.scene.id, tokenId: tokenOf(knight).id } } }
      });
      try {
        recorder.reset();
        // The pair the rider settle hands the rune door (`workflows.rollTest`, O-394).
        assert.isTrue((await spendRunesOn(knight, { kind: "blood", count: 1, privacy: attackPrivacyKey(knight.id) })).ok, "a rider's Blood rune spent");
        await new Promise(r => setTimeout(r, 250));
        assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "the flare waits for the attack's card");
        made.push(await attackCard(true));
        await until(() => recorder.skips.some(s => s.record?.identifier === "rune:blood" && s.skip === "hidden"), "the private attack's flare refused as hidden");
        assert.equal(recorder.cuesFor("use", "rune:blood").length, 0, "and it never played");
        recorder.reset();
        assert.isTrue((await spendRunesOn(knight, { kind: "frost", count: 1, privacy: attackPrivacyKey(knight.id) })).ok, "the next attack's Frost rune spent");
        made.push(await attackCard(false));
        const shown = await cueOf("use", "rune:frost", "the public attack's flare");
        assert.notEqual(shown.record.contentVisible, false, "a public attack's flare is seen");
      } finally {
        await other.delete();
      }
    });

    it("a push no feature names is drawn along its recorded path through the generic forced-move row (O-397)", async function () {
      this.timeout(120000);
      const knight = await knightWith("ZZ DK Anim Push");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      await untilAvailable();
      recorder.reset();
      const doc = tokenOf(foe).document;
      const standing = { x: doc.object.center.x, y: doc.object.center.y };
      const pushed = await forceMove({ token: doc, from: tokenOf(knight).document.getCenterPoint(), feet: 10, toward: "away", by: knight, name: foe.name });
      assert.isTrue(pushed.moved, `the Kobold was pushed: ${JSON.stringify(pushed)}`);
      const drawn = await cueOf("arrive", FORCED_MOVE_KEY, "the push's cue");
      const landed = await until(() => {
        const c = doc.object?.center;
        return c && c.x !== standing.x ? { x: c.x, y: c.y } : null;
      }, "the pushed token at rest", 15000);
      assert.isAbove(landed.x, standing.x, "pushed away from the knight");
      const streak = drawn.steps.find(s => s.asset === "jb2a.energy_strands.range.standard.purple.03");
      assert.deepEqual(streak?.from, standing, "the streak starts where it stood");
      assert.deepEqual(streak?.to, landed, "and ends where it landed");
      assert.isTrue(drawn.steps.some(s => s.kind === "sound"), "with its sound");
      assert.equal(drawn.record.steps?.[0]?.kind, "push", "recorded as a push");
    });

    for (const [spell, asset] of [["Stay the Rot", "jb2a.extras.tmfx.runes.circle.simple.necromancy"], ["Seal the Soul", "jb2a.magic_signs.rune.necromancy.complete.green"]]) {
      it(`${spell} draws at the corpse its card records (O-396)`, async function () {
        this.timeout(150000);
        const knight = await knightWith(`ZZ DK Anim ${spell}`, { spells: [spell] });
        const body = await corpse(`Anim ${spell} Body`);
        // Both spells are Touch: the corpse stands in the next square.
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
        await untilAvailable();
        await bank(knight);
        const item = knight.items.find(i => i.type === "spell" && i.name === spell);
        assert.ok(item, `${spell} held`);
        const key = spell.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        recorder.reset();
        const unpin = pinDie(20);
        try {
          const going = castWithDialog(knight, item);
          await chooseAsOffered(item).catch(() => null);
          const card = await going;
          if (card) made.push(card);
          assert.ok(card, `${spell} posted its card`);
        } finally { unpin(); }
        const cast = await cueOf("cast", key, `${spell}'s cast cue`);
        const recorded = cast.record.corpse;
        assert.ok(recorded, `the card records the corpse: ${JSON.stringify(cast.record)}`);
        assert.equal(recorded.tokenId, tokenOf(body).id, "the corpse on the board");
        const rune = cast.steps.find(s => s.asset === asset);
        assert.deepEqual(rune?.at, { x: recorded.x, y: recorded.y }, "drawn where the corpse lay");
        assert.isUndefined(rune?.on, "and not on the knight");
      });
    }

    it("Raise Ghoul's card records the dead it raised, and the rising plays on that token", async function () {
      this.timeout(150000);
      const knight = await knightWith("ZZ DK Anim Raise", { spells: ["Raise Ghoul"] });
      const body = await corpse("Anim Raise Body");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: body, x: 700, y: 500, side: "hostile" }]);
      await untilAvailable();
      await bank(knight);
      recorder.reset();
      const spell = knight.items.find(i => i.type === "spell" && i.name === "Raise Ghoul");
      const unpin = pinDie(20);
      let card = null;
      try {
        const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] });
        await chooseAsOffered(spell);
        card = await going;
        if (card) made.push(card);
      } finally { unpin(); }
      assert.ok(card, "the raise posted its card");
      const risen = card.flags?.[SCOPE]?.risen ?? [];
      assert.equal(risen.length, 1, `the card records what rose: ${JSON.stringify(risen)}`);
      const [tokenId] = risen[0].tokenIds;
      assert.ok(canvas.scene.tokens.get(tokenId), "the token it records stands on the board");
      await cueOf("cast", "raise-ghoul", "the raise's circle");
      const rise = await cueOf("rise", "raise-ghoul", "the rising");
      assert.isTrue(rise.steps.filter(s => s.kind === "effect").every(s => s.on === tokenId), "on the raised ghoul's own token");
      assert.isTrue(rise.steps.some(s => s.kind === "sound"), "with its sound");
    });
  });
}
