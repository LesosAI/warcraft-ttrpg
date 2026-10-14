/**
 * **A CREATURE SWINGS WHAT A GM PUT IN ITS HANDS** (the lead's N2, 2026-09-10).
 * The live layer under `rules/held-attacks.test.mjs`.
 *
 * The route is `attackWithDialog` — the door every character attack already
 * goes through — because it takes a weapon **Item** end to end: the Rating, 08
 * §5's traits, Pierce, 06's reach and range, the bundle a launcher fires, what
 * is coated on the blade and the off hand. Teaching the block's own path about
 * Items would have been a second copy of all of that.
 *
 * So the risk this batch exists for is the other direction: **a creature
 * swinging a sword must not change what happens when a character swings one.**
 * The last test here rolls a character's longsword and reads every row of the
 * card back.
 */

import { cleanup, fromPack, makeCharacter, makeNpc, pinDie, settle, PACK_FOR } from "./fixtures.mjs";
import { attackWithDialog, reactionStateOf, takeOpportunity } from "../applications/actions.mjs";
import { canReact, defensiveReactions } from "../rules/reactions.mjs";
import { THINNED_RATING_DROP } from "../rules/swarm.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

const until = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
};

/** A weapon out of 08 §7, in the actor's hands. */
async function arm(actor, name) {
  const doc = await fromPack(PACK_FOR.weapon, name);
  if (!doc) throw new Error(`the weapons pack holds no "${name}"`);
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...doc.toObject(), system: { ...doc.toObject().system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} to be in hand`);
  return actor.items.get(item.id);
}

/** The provenance rows a card's roll carries, label to value. */
function provenance(card) {
  return (card?.rolls?.[0]?.options?.provenance ?? []).map(p => ({ label: p.label, value: p.value ?? null, formula: p.formula ?? null }));
}

/** What the card says the damage was built from: `"6 + 2"`. */
function damageText(card) {
  return new DOMParser().parseFromString(card.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";
}

export function creatureSwingBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A creature swings what it holds (N2)", function () {
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

    /* ---- the blow itself ---------------------------------------------------- */

    it("rolls Proficiency plus the ability modifier, and deals the weapon's Rating", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const sword = await arm(actor, "Longsword");
      const sys = actor.system;
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, sword);
        assert.ok(card, "the creature's swing posted no card");
        // 14 §1's own arithmetic, measured over all 221 printed rows: `1 + tier`
        // plus one of the creature's own modifiers, and 06 §1 says which one.
        const want = sys.proficiency + (sys.abilities.str.mod ?? 0) + (sys.attackBonus ?? 0);
        assert.equal(card.rolls[0].options.modifier, want,
          `the swing's modifier is not Proficiency ${sys.proficiency} plus Strength ${sys.abilities.str.mod}`);
        const labels = provenance(card).map(p => p.label);
        assert.include(labels, "AZEROTH.Sheet.Proficiency", "the card does not say Proficiency was counted");
        assert.include(labels, "AZEROTH.Ability.Str.Label", "the card does not say a swing added Strength (06 §1)");
        assert.match(damageText(card), new RegExp(`^${sword.system.rating} \\+ `),
          `the damage is not the Longsword's ${sword.system.rating} plus the SL: ${damageText(card)}`);
        assert.equal(card.content.includes("NaN"), false, "the card printed a NaN");
      } finally {
        unpin();
      }
    });

    it("adds `system.damageBonus` — a bond's, a passive's — to what it swings", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const sword = await arm(actor, "Longsword");
      const rating = sword.system.rating;
      await actor.update({ "system.damageBonus": 2 });
      await until(() => actor.system.damageBonus === 2, "the creature's damage bonus");
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, sword);
        assert.match(damageText(card), new RegExp(`^${rating + 2} \\+ `),
          `a bound wolf's bonus vanished when it picked up a sword: ${damageText(card)}`);
        // And the card says WHY, in the block path's own words.
        assert.include(provenance(card).map(p => p.label), "AZEROTH.Bound.DamageBonus",
          "the Rating moved and nothing on the card says what moved it");
      } finally {
        unpin();
      }
    });

    it("thins a swarm's held weapon exactly as it thins its bite (13 §4)", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      const sword = await arm(actor, "Longsword");
      const rating = sword.system.rating;
      // 13 §4: six Chaff make a swarm, and below half its Health it is Thinned.
      await actor.update({ "system.swarm.members": 6, "system.health.max": 18, "system.health.value": 4 });
      await until(() => actor.system.thinned === true, "the swarm to be Thinned");
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, sword);
        assert.match(damageText(card), new RegExp(`^${rating - THINNED_RATING_DROP} \\+ `),
          `a Thinned swarm swung at full Rating: ${damageText(card)}`);
        assert.include(provenance(card).map(p => p.label), "AZEROTH.Sheet.Thinned");
        // And the Bane is the dialog's own automatic line, off the roller's state.
        assert.isAbove(card.rolls[0].options.banes ?? 0, 0, "a Thinned swarm took no Bane on its Attack Test");
      } finally {
        unpin();
      }
    });

    it("lets a creature with NO ability scores swing at all (the Searing Totem)", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Searing Totem");
      assert.isNull(actor.system.abilities.str.mod, "the fixture has a Strength, so this proves nothing");
      const sword = await arm(actor, "Longsword");
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, sword);
        assert.ok(card, "a creature with no ability scores could not swing");
        assert.equal(card.rolls[0].options.modifier, actor.system.proficiency,
          "a `—` ability was read as something other than no modifier");
        assert.notInclude(card.content, "NaN", "a `—` ability reached the card as NaN");
        assert.notInclude(String(card.rolls[0].formula), "null", "a `—` ability reached the formula");
      } finally {
        unpin();
      }
    });

    /* ---- 06 §6's Reactions -------------------------------------------------- */

    it("offers its held weapons for an Opportunity Attack, BEHIND the block's own rows", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      const block = actor.system.attacks.map(a => a.name);
      assert.isNotEmpty(block, "the fixture has no attack rows, so the order proves nothing");
      await arm(actor, "Longsword");
      const state = reactionStateOf(actor);
      assert.deepEqual(state.attacks, [...block, "Longsword"],
        "a creature's held weapons are missing from the Opportunity Attack, or they displaced its own rows");
      assert.equal(canReact("opportunityAttack", state).with, block[0],
        "a held sword displaced 14's own row as what the creature strikes with");
      // **A PARRY NOW COSTS A POINT** (06 §6, D-720). The sword is in hand and
      // the Reaction is still refused - for the POINT, because `creaturePools`
      // gives every creature a derived Momentum maximum (D-705's floor) and a
      // fight starts every pool at 0 (02 §7). This assertion read
      // `parry.ok === true` until the Requires cell grew two clauses.
      const bare = defensiveReactions(state).find(r => r.key === "parry");
      assert.isFalse(bare.ok, "a creature with an empty Momentum pool was offered a Parry");
      assert.equal(bare.reason, "AZEROTH.Reaction.Refuse.NoMomentum");
      assert.equal(state.pools.filter(p => p.kind === "momentum").length, 1,
        "a creature's derived Momentum floor is gone, and the refusal above turns on it");
      // Holding a point, it may Parry with the sword: D-720's other half.
      const withPool = defensiveReactions({
        ...state, pools: [{ itemId: null, kind: "momentum", name: null, value: 3, max: 6 }]
      }).find(r => r.key === "parry");
      assert.isTrue(withPool.ok, "a creature holding a sword and a point cannot Parry with it");
      assert.equal(withPool.with, "Longsword");
    });

    it("strikes a departure with a held sword where the block has no row for it", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      // A creature whose own rows are gone: the held weapon is all it has.
      await actor.update({ "system.attacks": [] });
      await until(() => actor.system.attacks.length === 0, "the block's rows to be cleared");
      await arm(actor, "Longsword");
      assert.deepEqual(reactionStateOf(actor).attacks, ["Longsword"]);
      const unpin = pinDie(15);
      try {
        const card = await takeOpportunity(actor, { distance: 5 });
        assert.ok(card, "the Opportunity Attack posted no card");
        assert.include(card.content, "Longsword", "the Opportunity Attack did not swing the held sword");
      } finally {
        unpin();
        await actor.unsetFlag("azeroth-rpg", "reacted");
      }
    });

    /* ---- and the one that matters: nothing moved for a character ------------ */

    it("leaves a CHARACTER's swing exactly where it was", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Swing Warrior", classes: [["Warrior", 1]], abilities: { str: 16 }, weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await settle();
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, sword);
        assert.ok(card, "the character's swing posted no card");
        // The three rows the door has always composed, and no fourth.
        const labels = provenance(card).map(p => p.label);
        assert.deepEqual(labels, ["AZEROTH.Roll.Die", "AZEROTH.Ability.Str.Label", "AZEROTH.Sheet.Proficiency"],
          `a creature-side row reached a character's card: ${labels.join(", ")}`);
        assert.notInclude(labels, "AZEROTH.Bound.DamageBonus");
        assert.notInclude(labels, "AZEROTH.Sheet.Thinned");
        assert.equal(card.rolls[0].options.modifier,
          actor.system.abilities.str.mod + actor.system.proficiency,
          "a character's attack modifier moved");
        assert.match(damageText(card), new RegExp(`^${sword.system.rating} \\+ `),
          `a character's Damage Rating moved: ${damageText(card)}`);
        // `thinned` is a creature's own derived flag and reaches no character.
        assert.isUndefined(actor.system.thinned, "a character now carries a swarm's Thinned flag");
        // **`damageBonus` IS NO LONGER CREATURE-ONLY** (D-711 phase 2): a
        // character derives a MAP by lane and by damage type for 04's talents,
        // where a creature's is one number. This line asserted it was undefined
        // and that is the fact that moved; what keeps a creature's rule off a
        // character is the type guard at the door, which is asserted here and
        // in `rules/held-attacks.test.mjs`.
        assert.isObject(actor.system.damageBonus, "a character carries no damage-bonus map");
        assert.equal(actor.system.damageBonus.attack.all, 0, "a character's lane did not start at zero");
        assert.notInclude(labels, "AZEROTH.Card.TalentDamage");
      } finally {
        unpin();
      }
    });
  });
}
