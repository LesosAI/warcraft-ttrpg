/**
 * **THE CHROMATIC CHAMPION'S CLASS FEATURES AND DRAKE CAPSTONES, LIVE** (stage 2B of the
 * Chromatic Champion plan): every feature of 02 §7's *Features by level* and the four
 * drake capstones of 04, pressed through the sheet's own Use control - so `featureAims`
 * and the Combat tab are what hand `useFeature` its targets (D-774) - and read back off
 * the card, the board and the actor.
 *
 * - Scales: plate costs a Champion no Speed and no Stealth Bane; a Warrior's still does;
 * - Breath: a cone aimed, the creatures in it gathered, 4 Energy, the leading branch's
 *   school, half on a pass; a tie asks; a drake form names its own;
 * - Hardened Scales: Ward 1 added against Fire, Frost and Nature over Flightblood's;
 * - Wing Buffet: 10 feet pushed, Body Resist rows, a target out of reach refused free;
 * - Draconic Leap: Entangled ended, the leap a displacement, the Boon promised;
 * - Dread Presence: Spirit Resist rows, once an encounter;
 * - Scales of the Flight: a tie named, Ward 1 against it;
 * - Chromatic Breath: any of the seven schools;
 * - a capstone's feature takes its drake form through the sheet.
 *
 * **WRITTEN, NOT YET RUN** (stage 2B: the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chromatic-features`. Every document a test makes is deleted
 * in `after`.
 */

import { cleanup, fromPack, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { cancelPick, pickState } from "../canvas/place.mjs";
import { BREATH_CUE_MS } from "../rules/chromatic-features.mjs";
import { FLIGHT_SCHOOL_FLAG, HARDENED_SCALES_FLAG } from "../rules/chromatic-features.mjs";
import { NEXT_ATTACK_FLAG } from "../rules/next-attack.mjs";
import { layForcedShape } from "../documents/shapes.mjs";

const CHAMPION = "Chromatic Champion";
const OUTCAST = "Chromatic Outcast";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const poolOf = (actor, name) => (actor.poolSnapshot?.() ?? []).find(p => p.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => parsed(message).body.textContent.replace(/\s+/g, " ");
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;

/**
 * A spent Use, read where the reader meets it: the sheet greys the control (it carries
 * `disabled`, so a click on it does nothing and says nothing - the Combat tab's own rule),
 * and the door itself refuses in words with nothing made (the Paladin batch's shape).
 */
async function assertSpent(assert, actor, featureName) {
  await until(() => featureNamed(actor, featureName)?.system?.uses?.value === 0, `${featureName}'s use struck`);
  const item = featureNamed(actor, featureName);
  const sheet = await openSheet(actor);
  try {
    const control = await until(() => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`), `${featureName}'s Use drawn`);
    assert.isTrue(control.disabled, `the sheet does not grey ${featureName}'s spent Use`);
  } finally { await sheet.close(); }
  let card = null;
  const said = await warnings(async () => { card = await game.system.azeroth.workflows.useFeature({ actor, item: featureNamed(actor, featureName) }); });
  assert.isNull(card, `a spent ${featureName} was made`);
  assert.include(said.join(" "), game.i18n.format("AZEROTH.Feature.NoUses", { name: featureName }));
}

/** Press the board where a pick is waiting, at a point in canvas pixels. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** The one chooser, opened for this feature. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/** Pick an option by name in the chooser and press its button. */
async function pick(app, name) {
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

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Chromatic Features Scene", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
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

/** A Champion at a level, its Energy full, with these branch talents taken at these ranks. */
async function championWith(name, { level = 20, ranks = {}, armor = [] } = {}) {
  const champion = await makeCharacter({ name, classes: [[CHAMPION, level]], race: OUTCAST, armor });
  await champion._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(champion, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  for (const item of champion.items.filter(i => i.type === "armor")) await item.update({ "system.equipped": true });
  const energy = await until(() => poolOf(champion, "energy"), "the Champion's Energy");
  await champion.updatePool({ itemId: energy.itemId, kind: "power", value: energy.max });
  await until(() => poolOf(champion, "energy").value === energy.max, "the Energy full");
  return champion;
}

/**
 * Press the feature's Use on the sheet's Combat tab at the tokens targeted, the roll dialog
 * skipped and the die pinned, and hand back the pending card - so a pick or a chooser the Use
 * opens may be answered before it is awaited.
 */
async function pressUse(actor, featureName, targets = [], face = 15) {
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

export function chromaticFeaturesBatch(context) {
  const { describe, it, after, assert } = context;

  describe("the Chromatic Champion's class features and capstones (the plan's stage 2B)", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("SCALES: plate costs a Champion no Speed and no Stealth Bane, and still costs a Warrior both", async function () {
      this.timeout(90000);
      const champion = await championWith("ZZ CF Scales", { level: 1, armor: ["Field plate"] });
      await until(() => champion.system.scalesWaive === true, "Scales read off the plate");
      assert.notInclude(champion.system.armorBanes, "stealth", "Scales left the Stealth Bane on the plate");
      assert.ok(champion.system.speedParts.some(p => p.key === "scales" && p.value === 5), "Scales gave back no Speed");
      const warrior = await makeCharacter({ name: "ZZ CF Plate Warrior", classes: [["Warrior", 1]], armor: ["Field plate"] });
      for (const item of warrior.items.filter(i => i.type === "armor")) await item.update({ "system.equipped": true });
      await until(() => warrior.system.armorBanes?.includes("stealth"), "08 §5's Stealth Bane on a Warrior's plate");
      assert.notOk(warrior.system.speedParts.some(p => p.key === "scales"));
    });

    it("BREATH: the cone aimed from the sheet gathers the creatures in it, costs 4 Energy and breathes the leading branch's school", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Breath", { level: 5, ranks: { "Kindled Blood": 2 } });
      const front = await makeNpc("Defias Footpad");
      const behind = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }, { actor: behind, x: 800, y: 1000, side: "hostile" }]);
      const energy = poolOf(champion, "energy").value;
      const { card } = await pressUse(champion, "Breath");
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.ok(posted, "Breath posted no card");
      const f = posted.flags["azeroth-rpg"];
      assert.equal(f.damageType, "fire", "Life-Binder leads, and the Breath is not Fire");
      const reached = (f.targets ?? []).map(t => t.actorId);
      assert.include(reached, front.id, "the creature in the cone was not gathered");
      assert.notInclude(reached, behind.id, "the creature behind was gathered");
      assert.notInclude(reached, champion.id, "the Champion breathed on itself");
      assert.equal(f.halfOnPass, true, "a passed Reflex Test does not halve it");
      await until(() => poolOf(champion, "energy").value === energy - 4, "4 Energy spent");
      // WAIT FOR THE REGION ITSELF (the stage 2 review, should-fix 1): the card is created
      // before the cone is placed, so reading the scene at once raced the write.
      await until(() => canvas.scene.regions.some(r => r.getFlag("azeroth-rpg", "messageId") === posted.id), "the cone set down");
      // *"Remove after the cue"* (the lead, 2026-11-08): the active GM's queue takes it away
      // once its cue has played, as the sweep's own.
      await until(() => !canvas.scene.regions.some(r => r.getFlag("azeroth-rpg", "messageId") === posted.id), "the cone removed after its cue", BREATH_CUE_MS + 15000);
    });

    it("BREATH: a tie asks which school", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Breath Tie", { level: 5 });
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }]);
      const energy = poolOf(champion, "energy").value;
      const { feature, card } = await pressUse(champion, "Breath");
      await pick(await chooser(feature), game.i18n.localize("AZEROTH.School.Frost"));
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.equal(posted.flags["azeroth-rpg"].damageType, "frost", "the school picked is not the Breath's");
      assert.equal(poolOf(champion, "energy").value, energy - 4);
    });

    it("BREATH: a chooser closed and an aim cancelled with Escape cost no card, no Energy and no Half-Action (should-fix 2)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CF Breath Dismissed", { level: 5 });
      const front = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await Combat.create({ scene: scene.id });
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [champion, front].map(a => ({ actorId: a.id, tokenId: tokenOf(a).id, sceneId: scene.id })));
      const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await started;
      const mine = await giveTurn(combat, champion);
      const energy = poolOf(champion, "energy").value;
      const budget = JSON.stringify(mine.getFlag("azeroth-rpg", "budget") ?? null);
      // The tie's chooser, closed by its own window control.
      const first = await pressUse(champion, "Breath");
      const app = await chooser(first.feature);
      await app.close();
      assert.isNull(await first.card, "a closed chooser posted a card");
      // The aim, cancelled through Escape's own path.
      const second = await pressUse(champion, "Breath");
      await pick(await chooser(second.feature), game.i18n.localize("AZEROTH.School.Fire"));
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      cancelPick();
      assert.isNull(await second.card, "a cancelled aim posted a card");
      assert.equal(poolOf(champion, "energy").value, energy, "a dismissal cost Energy");
      assert.equal(JSON.stringify(combat.combatants.get(mine.id).getFlag("azeroth-rpg", "budget") ?? null), budget, "a dismissal spent the Half-Action");
    });

    it("BREATH: too little Energy is refused before the cone is aimed (should-fix 3)", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Breath Short", { level: 5, ranks: { "Kindled Blood": 2 } });
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }]);
      const pool = poolOf(champion, "energy");
      await champion.updatePool({ itemId: pool.itemId, kind: pool.kind, value: 2 });
      await until(() => poolOf(champion, "energy").value === 2, "2 Energy");
      let aimed = false;
      const said = await warnings(async () => {
        const { card } = await pressUse(champion, "Breath");
        const watch = setInterval(() => { if (pickState()?.mode === "facing") aimed = true; }, 25);
        try { assert.isNull(await card, "a short pool breathed"); } finally { clearInterval(watch); }
      });
      assert.isFalse(aimed, "the cone was aimed before the refusal");
      assert.ok(said.length, "the refusal said nothing");
      assert.equal(poolOf(champion, "energy").value, 2);
    });

    it("CHROMATIC BREATH in the Bronze form carries no Slowed, and deals twice Breath's damage (must-fix 1; should-fix 5)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CF Chromatic Bronze", { level: 20, ranks: { "Sands of Time": 2, "Bronze Drake": 1 } });
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1300, y: 1000, side: "hostile" }]);
      assert.ok(await (await pressUse(champion, "Bronze Drake")).card, "the capstone posted no card");
      await until(() => champion.shape?.kind === "drake" && champion.shape.forms[0].name === "Bronze Drake", "the Bronze form");
      const { feature, card } = await pressUse(champion, "Chromatic Breath");
      await pick(await chooser(feature), game.i18n.localize("AZEROTH.School.Shadow"));
      await until(() => pickState()?.mode === "facing", "the cone's aim");
      pressBoard({ x: 1800, y: 1050 });
      const posted = await card;
      const f = posted.flags["azeroth-rpg"];
      assert.deepEqual(f.onFailInflicts ?? [], [], "Chromatic Breath carried the Bronze Drake's Slowed");
      assert.notInclude(textOf(posted), game.i18n.format("AZEROTH.Chromatic.BreathDrake", { talent: "Bronze Drake", feature: "Chromatic Breath" }));
      // The Footpad holds no Shadow Ward, so its row is the whole Rating: 2 x Con modifier + 4.
      const con = champion.system.abilities.con.mod;
      const row = (f.damageByTarget ?? []).find(r => r) ?? null;
      assert.equal(row?.damage, 2 * con + 4, "Chromatic Breath is not twice Breath's 2 + Constitution modifier");
    });

    it("HARDENED SCALES: Ward 1 against Fire, Frost and Nature, added to Flightblood's, once a Short Rest", async function () {
      this.timeout(120000);
      const champion = await championWith("ZZ CF Hardened", { level: 5 });
      const tier = champion.system.tier;
      await until(() => champion.system.ward.fire === tier, "Flightblood's Ward equal to tier");
      const { card } = await pressUse(champion, "Hardened Scales");
      assert.ok(await card, "Hardened Scales posted no card");
      await until(() => champion.system.ward.fire === tier + 1, "the Ward added");
      assert.equal(champion.system.ward.frost, tier + 1);
      assert.equal(champion.system.ward.nature, tier + 1);
      assert.equal(champion.system.ward.arcane, tier, "Arcane took Hardened Scales' Ward");
      const laid = champion.effects.find(e => e.getFlag("azeroth-rpg", HARDENED_SCALES_FLAG));
      assert.ok(laid?.duration?.value, "the Ward has no ten minutes on it");
      await assertSpent(assert, champion, "Hardened Scales");
    });

    it("WING BUFFET: a creature out of reach is refused for nothing; one beside is pushed 10 feet with a Body Resist row", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Buffet", { level: 5 });
      const near = await makeNpc("Defias Footpad");
      const far = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }, { actor: far, x: 1500, y: 1000, side: "hostile" }]);
      const energy = poolOf(champion, "energy").value;
      const said = await warnings(async () => {
        const refused = await pressUse(champion, "Wing Buffet", [tokenOf(far)]);
        assert.isNull(await refused.card, "a creature out of reach was buffeted");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Chromatic.OutOfReach", { name: "Wing Buffet", target: tokenOf(far).name, feet: 5 }));
      assert.equal(poolOf(champion, "energy").value, energy, "the refusal cost Energy");
      const { card } = await pressUse(champion, "Wing Buffet", [tokenOf(near)]);
      const posted = await card;
      assert.ok(posted, "Wing Buffet posted no card");
      await until(() => tokenOf(near).document.x === 1300, "the creature pushed 10 feet");
      assert.ok(parsed(posted).querySelector('[data-action="resistTest"]'), "no Body Resist row on the card");
      assert.equal(poolOf(champion, "energy").value, energy - 3);
    });

    it("DRACONIC LEAP: Entangled ends, the leap lands where it was picked, and costs 3 Energy", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Leap", { level: 9 });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }]);
      await champion.toggleStatusEffect("entangled", { active: true });
      await until(() => champion.statuses.has("entangled"), "the Champion Entangled");
      const energy = poolOf(champion, "energy").value;
      const { card } = await pressUse(champion, "Draconic Leap");
      await until(() => pickState()?.mode === "point", "the leap's landing");
      pressBoard({ x: 1450, y: 1050 });
      const posted = await card;
      assert.ok(posted, "the leap posted no card");
      await until(() => tokenOf(champion).document.x === 1400, "the Champion landed 20 feet on");
      assert.isFalse(champion.statuses.has("entangled"), "the leap left the Champion Entangled");
      assert.equal(poolOf(champion, "energy").value, energy - 3);
      // Out of a fight there is no turn to hold the Boon to (D-772's reading), and the card says so.
      assert.include(textOf(posted), game.i18n.format("AZEROTH.NextAttack.NoFight", { name: champion.name, talent: "Draconic Leap" }));
      assert.notOk((champion.getFlag("azeroth-rpg", NEXT_ATTACK_FLAG) ?? []).length);
    });

    it("DRACONIC LEAP: a Reaction on another creature's turn, refused as one on its own, and its Boon held in a fight (should-fix 5)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CF Leap Fight", { level: 9 });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await Combat.create({ scene: scene.id });
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [champion, foe].map(a => ({ actorId: a.id, tokenId: tokenOf(a).id, sceneId: scene.id })));
      const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await started;
      // On the foe's turn the leap is the Reaction: the rung chooser offers it.
      await giveTurn(combat, foe);
      const offTurn = await pressUse(champion, "Draconic Leap");
      const rung = await chooser(offTurn.feature).catch(() => null);
      if (rung) await pick(rung, game.i18n.localize("AZEROTH.Action.Reaction"));
      await until(() => pickState()?.mode === "point", "the leap's landing");
      pressBoard({ x: 1250, y: 1050 });
      assert.ok(await offTurn.card, "the off-turn leap posted no card");
      const mine = combat.getCombatantsByActor(champion)[0];
      await until(() => combat.combatants.get(mine.id)?.getFlag("azeroth-rpg", "budget")?.reactions === 0, "the Reaction spent");
      // In a fight the Boon is held to the end of the Champion's next turn (02).
      await until(() => (champion.getFlag("azeroth-rpg", NEXT_ATTACK_FLAG) ?? []).some(e => e.boons > 0 && e.lasts === "nextTurn"), "the Boon promised");
      // On its own turn the Reaction is refused: the leap is the Half-Action there.
      await giveTurn(combat, champion);
      const own = await pressUse(champion, "Draconic Leap");
      const ownRung = await chooser(own.feature, 3000).catch(() => null);
      if (ownRung) {
        const reaction = [...ownRung.element.querySelectorAll("option, label")].find(el => el.textContent.trim().startsWith(game.i18n.localize("AZEROTH.Action.Reaction")));
        assert.ok(!reaction || reaction.disabled || reaction.querySelector?.("input")?.disabled, "the Reaction is offered on the Champion's own turn");
        await ownRung.close();
      }
      await own.card;
    });

    it("DREAD PRESENCE: a Spirit Resist row for each creature chosen, once an encounter", async function () {
      this.timeout(120000);
      const champion = await championWith("ZZ CF Dread", { level: 11 });
      const near = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }]);
      const { feature, card } = await pressUse(champion, "Dread Presence", [tokenOf(near)]);
      const posted = await card;
      assert.ok(posted, "Dread Presence posted no card");
      const row = parsed(posted).querySelector('[data-action="resistTest"]');
      assert.ok(row, "no Resist row");
      assert.equal(posted.flags["azeroth-rpg"].onFailInflicts?.[0]?.condition, "frightened");
      await until(() => champion.items.get(feature.id).system.uses.value === 0, "the encounter's use struck");
      // THE SPAN, NOT ONLY THE FLAG (should-fix 5): a failed Test lays Frightened held to
      // the end of the creature's next turn - out of a fight, a round of the world's clock.
      const resist = await until(() => document.querySelector(`[data-message-id="${posted.id}"] [data-action="resistTest"]`), "the Resist row drawn");
      const unpin = pinDie(1);
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      try { resist.click(); } finally { setTimeout(unpin, 3000); }
      const frightened = await until(() => near.effects.find(e => e.statuses?.has("frightened")), "Frightened laid on a failure", 30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      assert.ok(Number(frightened.duration?.value) > 0 || Number(frightened.duration?.seconds) > 0 || Number(frightened.duration?.rounds) > 0, "Frightened carries no span");
    });

    it("SCALES OF THE FLIGHT: a tie is named once a Long Rest, and the Ward follows it", async function () {
      this.timeout(120000);
      const champion = await championWith("ZZ CF Flight", { level: 17, ranks: { "Kindled Blood": 2, "Sands of Time": 2 } });
      const tier = champion.system.tier;
      assert.deepEqual(champion.system.flightSchool?.open, ["fire", "arcane"], "the tie is not open");
      const { feature, card } = await pressUse(champion, "Scales of the Flight");
      await pick(await chooser(feature), game.i18n.localize("AZEROTH.School.Arcane"));
      assert.ok(await card, "the Use posted no card");
      await until(() => champion.getFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG) === "arcane", "the school named");
      await until(() => champion.system.ward.arcane === tier + 1, "Ward 1 against the school named, over Flightblood's");
      await champion.longRest();
      await until(() => !champion.getFlag("azeroth-rpg", FLIGHT_SCHOOL_FLAG), "the Long Rest clears the name");
    });

    it("CHROMATIC BREATH: any of the seven schools, once a Long Rest", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CF Chromatic", { level: 20 });
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }]);
      const { feature, card } = await pressUse(champion, "Chromatic Breath");
      await pick(await chooser(feature), game.i18n.localize("AZEROTH.School.Shadow"));
      await until(() => pickState()?.mode === "facing", "the cone's aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.equal(posted.flags["azeroth-rpg"].damageType, "shadow");
      await until(() => champion.items.get(feature.id).system.uses.value === 0, "the Long Rest's use struck");
    });

    it("A CAPSTONE: the Blue Drake's feature takes its form from the sheet, its Breath is Frost, and Hex does not replace it", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CF Blue Drake", { level: 20, ranks: { "Kindled Blood": 2, "Blue Drake": 1 }, armor: ["Field plate"] });
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1200, y: 1000, side: "hostile" }]);
      const own = { body: champion.system.ap.body };
      const { card } = await pressUse(champion, "Blue Drake");
      assert.ok(await card, "the capstone's Use posted no card");
      await until(() => champion.shape?.kind === "drake", "the drake form taken");
      assert.equal(champion.shape.forms[0].name, "Blue Drake");
      const block = await fromPack("azeroth-rpg.bestiary", "Blue Drake");
      assert.equal(champion.system.ap.body, Math.max(own.body, block.system.ap.body), "the better Body Armor Points");
      const breath = await pressUse(champion, "Breath");
      // At level 20 the Breath is 02's Great Breath, *a 30 ft cone or a 60 ft line*: the
      // one chooser asks which before the aim (`breathAreas`). The drake's Frost leaves no
      // school to ask.
      await pick(await chooser(breath.feature), "A 30 ft cone");
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      pressBoard({ x: 1700, y: 1050 });
      const posted = await breath.card;
      assert.equal(posted.flags["azeroth-rpg"].damageType, "frost", "the Blue Drake's Breath is not Frost");
      // *Only when champion ends it.*: a failed Test against Hex lays nothing, said on a card.
      const laid = await layForcedShape({ target: champion, kind: "hexed", card: null });
      assert.isFalse(laid.laid, "Hex replaced the drake form");
      assert.equal(laid.reason, "kept");
      assert.equal(champion.shape?.kind, "drake");
    });
  });
}
