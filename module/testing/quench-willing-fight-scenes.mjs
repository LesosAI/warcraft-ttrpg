/**
 * **07 §2's *ally* IS A WILLING TARGET, AND A FIGHT CORE MADE STANDS ON ITS COMBATANTS' SCENES**
 * (O-296, O-294; the lead, 2026-11-10: *"296 - ally means willing target"*, *"294 - yes que this
 * work"*). Through the real controls:
 *
 * - **O-296**: the sheet's own Cast of Hour of Dust (*One creature*, tier 3) out of a fight, at a
 *   fellow adventurer on the caster's side of the board who is in no fight and not in the Party,
 *   rolls against 07 §2's 10 + 2 a tier (16) - the one predicate for willing the range door reads
 *   (`canvas/range.mjs#willingOf`, D-893) - and at a hostile Raptor against the Raptor's Defense.
 *   D-755's ally alone called the adventurer no ally, so the cast rolled against their Defense.
 * - **O-294**: a fight made as the tracker makes one (`Combat.create({})`, no scene), with a
 *   character's combatant added: the character's bound creature standing on the same scene joins
 *   the fight beside it (`AzerothCombat#_onEnter`, D-643), once. It read `this.scene` alone and
 *   never joined at the table.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.willing-fight-scenes`. Every document a test makes is
 * deleted in `after`.
 */

import { made, makeCharacter, makeNpc, tokenData, untilHook } from "./fixtures.mjs";
import { castFromSheet, chronomancerWith, manaOf, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { AT, FT, frame, sleep } from "./quench-chronomancer-sweep-t12.mjs";

/** The caster's Mana back to full. */
async function fill(c) {
  const mana = manaOf(c);
  if (mana && mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  await until(() => manaOf(c)?.value === manaOf(c)?.max, "the Mana full");
}

/** The Casting Test's DC the card's roll carries. */
const dcOf = card => Number(game.messages.get(card?.id)?.rolls?.[0]?.options?.dc ?? card?.rolls?.[0]?.options?.dc);

export function willingFightScenesBatch(context) {
  const { describe, it, assert } = context;

  describe("07 §2's ally is a willing target, and a fight core made stands on its combatants' scenes (O-296, O-294)", function () {
    frame(context);

    it("O-296: Hour of Dust from the sheet at a FRIENDLY adventurer in no fight and not in the Party rolls against 16 (10 + 2 a tier); at a hostile Raptor, against its Defense", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ WFS Willing", { level: 11, spells: ["Hour of Dust"] });
      const friend = await makeCharacter({ name: "ZZ WFS Friend", classes: [["Warrior", 5]] });
      const raptor = await makeNpc("Raptor");
      await sceneWith([
        { actor: c, ...AT },
        { actor: friend, x: AT.x + 20 * FT, y: AT.y },
        { actor: raptor, x: AT.x + 30 * FT, y: AT.y + 200, side: "hostile" }
      ]);
      assert.isFalse(friend.isParty === true || c.isParty === true, "neither is in the Party: D-755 alone calls the friend no ally out of a fight");
      assert.isNull(c.activeFight?.() ?? null, "the caster is in no fight");
      const spell = c.items.find(i => i.type === "spell" && i.name === "Hour of Dust");
      assert.equal(Number(spell.system.tier), 3, "Hour of Dust is tier 3");
      await fill(c);
      const atFriend = await castFromSheet(c, "Hour of Dust", { targets: [tokenOf(friend)], face: 18 });
      assert.ok(atFriend, "the cast at the friend posted a card");
      assert.equal(dcOf(atFriend), 16, "aimed at a willing creature: 10 + 2 a tier (07 §2), never the friend's Defense");
      await fill(c);
      const atRaptor = await castFromSheet(c, "Hour of Dust", { targets: [tokenOf(raptor)], face: 18 });
      assert.ok(atRaptor, "the cast at the Raptor posted a card");
      const defense = Number(raptor.system.defense);
      assert.notEqual(defense, 16, "the Raptor's Defense differs from the tier's number, so the read means something");
      assert.equal(dcOf(atRaptor), defense, "aimed at an unwilling creature: its Defense (07 §2)");
    });

    it("O-294: a fight made with no scene; the character's combatant enters and its bound creature on the same scene joins beside it, once", async function () {
      this.timeout(240000);
      const owner = await makeCharacter({ name: "ZZ WFS Owner", classes: [["Warrior", 5]] });
      const beast = await makeNpc("Raptor");
      await beast.setFlag("azeroth-rpg", "bond", { ownerUuid: owner.uuid, kind: "companion", entryName: "Raptor" });
      const scene = await sceneWith([
        { actor: owner, ...AT },
        { actor: beast, x: AT.x + 10 * FT, y: AT.y }
      ]);
      const mine = tokenOf(owner)?.document;
      const its = tokenOf(beast)?.document;
      assert.ok(mine && its, "both tokens on the scene");
      const combat = await Combat.create({});
      made.push(combat);
      assert.isNull(combat.scene ?? null, "the fight is unlinked, as the tracker makes one");
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: owner.id, tokenId: mine.id, sceneId: scene.id }]);
      const joined = await until(() => combat.combatants.find(x => x.tokenId === its.id) ?? null, "the bound creature joined the fight beside its owner", 20000);
      assert.equal(joined.sceneId, scene.id, "it joined from the scene it stands on");
      await sleep(1500);
      assert.equal(combat.combatants.filter(x => x.tokenId === its.id).length, 1, "it joined once");
      // A second creature not bound to the owner stays out.
      const stranger = await makeNpc("Raptor");
      const [strangerToken] = await scene.createEmbeddedDocuments("Token", [await tokenData(stranger, { x: AT.x + 20 * FT, y: AT.y, actorLink: true })]);
      const friend = await makeCharacter({ name: "ZZ WFS Owner Two", classes: [["Warrior", 5]] });
      const [friendToken] = await scene.createEmbeddedDocuments("Token", [await tokenData(friend, { x: AT.x, y: AT.y + 200, actorLink: true })]);
      const entered = untilHook("createCombatant", 10000, x => x.tokenId === friendToken.id).catch(() => null);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: friend.id, tokenId: friendToken.id, sceneId: scene.id }]);
      await entered;
      await sleep(1500);
      assert.isFalse(combat.combatants.some(x => x.tokenId === strangerToken.id), "a creature bound to nobody here does not join");
    });
  });
}
