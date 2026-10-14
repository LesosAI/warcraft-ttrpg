/**
 * Reach and range on the table (06, D-669; D-716): a melee blow WARNED outside
 * reach, a shot's Bane past its Range and a refusal past twice it, and the
 * Bane a ranged attack takes while Engaged.
 *
 * **D-716 moved the melee half.** D-669 refused a blow outside reach at the
 * door; at the table that read as the system settling a step nobody had taken,
 * so the blow is made and the dialog carries a checked, zero-cost line saying
 * how far it is. The shot past twice its Range keeps its hard refusal.
 *
 * Everything here needs real tokens on a scene, because the distance is
 * measured and not assumed - that was the whole fault.
 */

import { cleanup, made, makeCharacter, makeNpc, settle } from "./fixtures.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
import { distanceBetween, prepareRoll } from "../applications/roll-dialog.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** A scene at five feet a square, with the actors placed on it. */
async function sceneWith(placements) {
  const scene = await Scene.create({
    name: "ZZ Distance Scene", width: 12000, height: 2000,
    grid: { size: 100, distance: 5, units: "ft" }
  });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "hostile" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    // EVERY token core makes is HOSTILE by default (14.367's schema), so a
    // character and a ghoul sat on the same side and nothing was ever
    // Engaged. A test that means "an enemy" says which side it is on.
    data.push((await actor.getTokenDocument({
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/**
 * Put an actor's token at a distance in feet from the origin, and WAIT FOR
 * IT TO ARRIVE.
 *
 * v14 moves a token along a path and interpolates the DOCUMENT's own
 * position while it travels, so a measurement taken straight after the
 * update reads the token mid-stride: this test measured 14 ft where it had
 * asked for 75, because the ghoul was at 790 of the 2000 it was sent to
 * (2026-09-06). `await doc.update()` resolves when the movement is
 * accepted, not when it is over.
 */
async function placeAt(actor, feet, { from = 500, y = 500 } = {}) {
  const doc = actor.getActiveTokens(true)[0]?.document;
  if (!doc) throw new Error(`${actor.name} has no token on the scene`);
  const x = from + (feet / 5) * 100;
  await doc.update({ x, y });
  for (let i = 0; i < 200 && doc.x !== x; i++) await new Promise(r => setTimeout(r, 50));
  await settle();
  if (doc.x !== x) throw new Error(`${actor.name} stopped at ${doc.x} on its way to ${x}`);
}

/** What the scene and the tokens actually are, for a failure that has to explain itself. */
function whereEverythingIs(a, b) {
  const grid = canvas?.scene?.grid ?? {};
  const at = actor => {
    const d = actor?.getActiveTokens?.(true)[0]?.document;
    return d ? `${actor.name} (${d.x},${d.y} ${d.width}x${d.height})` : `${actor?.name} has no token`;
  };
  return `scene ${canvas?.scene?.name} ${canvas?.scene?.width}x${canvas?.scene?.height}`
    + ` grid ${grid.type}/${grid.size}/${grid.distance}${grid.units} - ${at(a)} vs ${at(b)}`;
}

/**
 * Target a token the way a player does, so the attack reads it. v14 moved
 * this onto the layer: `User#updateTokenTargets` is gone (14.367).
 */
function target(actor) {
  const token = actor?.getActiveTokens?.(true)[0] ?? null;
  canvas.tokens.setTargets(token ? [token.id] : []);
  return token;
}

export function distanceBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Reach and range (06, D-669)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      // The scene this batch was found on, so it is handed back at the end:
      // deleting a VIEWED scene tears the canvas down and leaves the world
      // with none, which every later run then starts from (2026-09-06).
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(120000);
      canvas?.tokens?.setTargets?.([]);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // Step off the scene before it is deleted, and put back what was here.
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    const notice = () => {
      const warns = [];
      const original = ui.notifications.warn;
      ui.notifications.warn = (...args) => { warns.push(args[0]); return original.apply(ui.notifications, args); };
      return { warns, done: () => { ui.notifications.warn = original; } };
    };

    it("a sword swings at a token four squares away, WARNS, and says how far it is (D-716)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Reach Attacker", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      const npc = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 900, y: 500 }]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      target(npc);
      const sword = actor.items.find(i => i.name === "Longsword");

      // **D-716 REPLACED D-669's REFUSAL**: the blow is made and the dialog
      // says how far it is, because the tokens are where the GM last dragged
      // them and a step is not modelled. What the pure rule hands the dialog:
      const prepared = prepareRoll(actor, {
        kind: "attack", modifiers: [], rangeKind: "melee",
        rangeBand: { band: "beyond", banes: 0, ok: true, warn: true, max: 5, distance: 20 }
      });
      const line = prepared.situational.automatic.find(l => l.id === "outOfReach");
      assert.ok(line, "no out-of-reach line on the dialog");
      assert.equal(line.banes, 0, "06 gives a blow past reach no Bane, so the line costs nothing");
      assert.isTrue(line.checked, "the measured line is not checked");
      assert.include(line.name, "20", "the line does not say how far the target is");
      assert.include(line.name, "5", "the line does not say what the sword reaches");
      assert.include(prepared.situational.warnings, "AZEROTH.Modifier.Warn.OutOfReach");

      // And the attack itself: a card, with the line named in its provenance.
      const watch = notice();
      try {
        const card = await attackWithDialog(actor, sword);
        assert.ok(card, "a blow outside reach was still refused");
        assert.lengthOf(watch.warns, 0, `a blow outside reach warned instead of rolling: ${watch.warns.join(" | ")}`);
        assert.include(card.content, game.i18n.localize("AZEROTH.Modifier.OutOfReach"),
          "the card does not say the blow was out of reach");
      } finally {
        watch.done();
      }
    });

    it("a Reach weapon strikes at ten feet with no such line, where a sword carries one", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Halberd", classes: [["Warrior", 3]], weapons: ["Halberd", "Longsword"] });
      const npc = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 700, y: 500 }]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      target(npc);
      const watch = notice();
      try {
        const short = await attackWithDialog(actor, actor.items.find(i => i.name === "Longsword"));
        assert.ok(short, "the sword's blow at ten feet was refused");
        assert.include(short.content, game.i18n.localize("AZEROTH.Modifier.OutOfReach"),
          "the sword's card does not say it was out of reach");
        const card = await attackWithDialog(actor, actor.items.find(i => i.name === "Halberd"));
        assert.ok(card, "the halberd could not reach ten feet");
        assert.notInclude(card.content, game.i18n.localize("AZEROTH.Modifier.OutOfReach"),
          "the halberd's card says it was out of reach at ten feet");
        assert.lengthOf(watch.warns, 0, `a melee blow warned: ${watch.warns.join(" | ")}`);
      } finally {
        watch.done();
      }
    });

    it("a bow shoots clean inside its Range, takes a Bane past it, and is refused beyond twice", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Archer", classes: [["Ranger", 3]], weapons: ["Shortbow", "Hunting arrows"] });
      const npc = await makeNpc("Plagued Ghoul");
      const bow = actor.items.find(i => i.name === "Shortbow");
      const range = bow.system.range;
      assert.isAbove(range, 0, "the bow carries no Range");
      assert.isBelow(500 + ((range * 2 + 20) / 5) * 100, 12000, "the scene cannot hold twice the Range");
      const banesOf = card => card.rolls?.[0]?.options?.banes ?? 0;

      // Inside the Range: no line about distance at all.
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      target(npc);
      await placeAt(npc, range - 5);
      assert.equal(distanceBetween(actor, npc), range - 5, `the near shot was not measured where it was put: ${whereEverythingIs(actor, npc)}`);
      const near = await attackWithDialog(actor, bow);
      assert.ok(near, "the bow refused a target inside its Range");
      assert.equal(banesOf(near), 0, "a Bane inside the Range");

      // Past it, to twice: a Bane.
      await placeAt(npc, range + 20);
      assert.equal(distanceBetween(actor, npc), range + 20, `the long shot was not measured where it was put: ${whereEverythingIs(actor, npc)}`);
      const far = await attackWithDialog(actor, bow);
      assert.ok(far, "the bow refused a target inside twice its Range");
      assert.equal(banesOf(far), 1, "no Bane past the Range");

      // Beyond twice: refused, with the distance and the maximum.
      await placeAt(npc, range * 2 + 20);
      assert.equal(distanceBetween(actor, npc), range * 2 + 20, `the far shot was not measured where it was put: ${whereEverythingIs(actor, npc)}`);
      const watch = notice();
      try {
        assert.isNull(await attackWithDialog(actor, bow), "the bow shot past twice its Range");
        assert.lengthOf(watch.warns, 1, "no warning beyond twice the Range");
        assert.include(watch.warns[0], String(range * 2), "the warning does not say the maximum");
      } finally {
        watch.done();
      }
    });

    it("a shot taken with an enemy inside your reach carries 06's Bane", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Pressed Archer", classes: [["Ranger", 3]], weapons: ["Shortbow", "Hunting arrows"] });
      const near = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      await sceneWith([
        { actor, x: 500, y: 500, side: "friendly" },
        { actor: near, x: 600, y: 500 },
        { actor: far, x: 1000, y: 500 }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      target(far);
      const card = await attackWithDialog(actor, actor.items.find(i => i.name === "Shortbow"));
      assert.ok(card, "the shot was refused");
      assert.equal(card.rolls?.[0]?.options?.banes ?? 0, 1, "no Bane while Engaged (06)");

      // And with nobody inside reach, the same shot is clean.
      await placeAt(near, 45);
      assert.isAbove(distanceBetween(actor, near), 5, "the near enemy did not move");
      const clear = await attackWithDialog(actor, actor.items.find(i => i.name === "Shortbow"));
      assert.equal(clear.rolls?.[0]?.options?.banes ?? 0, 0, "a Bane with nobody in reach");
    });

    it("nothing is measured without tokens, and the attack goes through as it always did", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Unplaced", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      canvas?.tokens?.setTargets?.([]);
      const card = await attackWithDialog(actor, actor.items.find(i => i.name === "Longsword"));
      assert.ok(card, "an attack with no target on the canvas was refused");
    });

    /* ---------------------------------------------------------------- */
    /*  Targeting itself (the lead's item 12, 2026-09-13)                */
    /* ---------------------------------------------------------------- */

    it("targets can be taken, swapped, added to and cleared, all through core's own door", async function () {
      this.timeout(90000);
      // The lead reported *"targets cannot be removed and re-targeted."* The
      // only place this system re-targets is `takeOpportunity`, and that now
      // puts the previous set back (see `quench-reactions.mjs`). THIS is the
      // probe over core's own behaviour: if it passes, the cause is outside
      // the system.
      const actor = await makeCharacter({ name: "ZZ Retarget Attacker", classes: [["Warrior", 3]] });
      const a = await makeNpc("Plagued Ghoul");
      const b = await makeNpc("Plagued Ghoul");
      await sceneWith([
        { actor, x: 500, y: 500, side: "friendly" },
        { actor: a, x: 700, y: 500 },
        { actor: b, x: 900, y: 500 }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      const idOf = npc => npc.getActiveTokens(true)[0].id;
      const targeted = () => [...game.user.targets].map(t => t.id).sort();

      canvas.tokens.setTargets([idOf(a)]);
      assert.deepEqual(targeted(), [idOf(a)].sort(), "targeting one did not take");

      // UNTARGET: `release` takes one off without touching the rest.
      canvas.tokens.setTargets([idOf(a)], { mode: "release" });
      assert.deepEqual(targeted(), [], "a target could not be released");

      // RE-TARGET: a plain set REPLACES, which is what a click does.
      canvas.tokens.setTargets([idOf(b)]);
      assert.deepEqual(targeted(), [idOf(b)].sort(), "re-targeting after an untarget did not take");
      canvas.tokens.setTargets([idOf(a)]);
      assert.deepEqual(targeted(), [idOf(a)].sort(), "a second target did not replace the first");

      // ACQUIRE: both at once, which is what shift-click does.
      canvas.tokens.setTargets([idOf(a), idOf(b)]);
      assert.deepEqual(targeted(), [idOf(a), idOf(b)].sort(), "two targets could not be held");

      // And cleared.
      canvas.tokens.setTargets([]);
      assert.deepEqual(targeted(), [], "the targets could not be cleared");
    });
  });
}
