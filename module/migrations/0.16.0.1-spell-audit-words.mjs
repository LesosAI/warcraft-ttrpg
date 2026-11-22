/**
 * **THE WORDS A HELD COPY CARRIED BEFORE THE SPELL AUDIT** (D-1700 to D-1705; the system half,
 * D-1715). Generated once from 07 as it stood before the book agent's edits, one row an audited
 * spell: the effect as plain words, and the Mana, action and tier the old pack printed. The
 * migration (`0.16.0.1-spell-audit.mjs`) restamps a held copy only while its words are these or
 * the new book's, so a GM's own rewrite is kept. Never hand-edited.
 */
export const OLD_WORDS = Object.freeze({
  "afterlight":
    "The target regains 8 Health, and the next time it is healed within the next minute it regains twice that amount.",
  "annihilation":
    "You pay 8 Health, and that damage cannot be reduced by armor or Ward. The target takes 20 Fel damage, bypassing armor and Ward. If this reduces it to 0 Health it does not die so much as stop having been there: it leaves no body, nothing it was carrying survives, and it cannot be raised by any means in this book.",
  "backburn":
    "Cast when a creature you can see takes Fire damage. It takes 2 further Fire damage, and the fire jumps: the nearest other creature within 10 feet of it takes the same. The jump is not aimed and it will take an ally as readily as an enemy.",
  "barkskin":
    "Damage the target takes is reduced by 3 for the duration, and it cannot be Bleeding. While it holds, the target's Speed drops by 5 feet and it has a Bane on any Test to move unnoticed.",
  "blessing-of-freedom":
    "The target sheds Slowed and Entangled, cannot gain either for the duration, and ignores Difficult ground.",
  "bloom":
    "The target regains 4 Health, then 3 Health at the start of each of its turns for the duration. One condition on the target ends when you cast it.",
  "cinderfall":
    "The fall lands at the start of your next turn. Every creature in the area then makes a Reflex Resilience Test against your Spell DC: on a failure it takes 12 Fire damage and is knocked Prone, and on a success it takes half of that, rounded down. Ash lies over the area for the duration: it is Difficult ground, and a creature inside it cannot see out and cannot be seen from outside.",
  "condemnation":
    "A creature in the area must be marked by your Holy Brand, or the spell does nothing and the Mana is spent. The Holy Brand ends. Every creature in the area makes a Spirit Resilience Test against your Spell DC. On a failure it takes 5 Holy damage, and half of that, rounded down, on a success. Against an undead creature or a demon the Damage Rating is 9 instead, and it makes the Test with a Bane.",
  "cone-of-cold":
    "Every creature in the cone makes a Reflex Resilience Test against your Spell DC. On a failure it takes 2 Frost damage and is Slowed until the end of your next turn, and on a success it takes half of that, rounded down, and is not Slowed.",
  "darkward":
    "Each target gains Ward 2 against Shadow for the duration. The first time each target would take Shadow damage, the Ward stops it entirely.",
  "demonic-circle":
    "For the duration you know the position of every creature in the area and every demon within a mile of it. A demon inside the area obeys you unless it passes a Spirit Resilience Test against your Spell DC when it enters, and one that fails may not attempt the Test again while the circle stands. A demon held this way counts as Bound and does not count against the number your Bound Demon class feature allows you, however many of them are standing in the circle. Any creature you name as you cast may not be targeted by a demon inside it. The circle stays where you drew it and you may leave.",
  "devotion-aura":
    "Allies within 20 feet of you gain 1 to their Defense, checked when each attack is made. An ally who leaves the radius loses it and gets it back on returning. While sustaining this spell you pay 1 Mana at the start of each of your turns.",
  "divert-timeway":
    "Choose up to 12 creatures within 60 feet. The result of any event within the last 1 minute is undone. The GM decides what implications this may have. When this spell resolves, all targets have no memory of the events prior; except you. You may cast this once. If this spell is cast more than once you gain 2 levels of exhaustion that can't be removed and you expend a Spirit Tether. Every casting of it after your first, in your whole life, gives you 2 Fatigue that no rest removes and nothing treats, and spends 1 Spirit's Tether, on top of its Mana.",
  "divine-shield":
    "Until the end of your next turn you take no damage and no condition, and every effect currently on you is suspended rather than ended. You cannot attack or cast for the duration. You may use Divine Shield once between Long Rests.",
  "dread-cry":
    "Every enemy within 20 feet of you makes a Spirit Resilience Test against your Spell DC. On a failure it is Frightened of you until the end of its next turn.",
  "dread-whisper":
    "The target makes a Spirit Resilience Test against your Spell DC. On a failure it is Frightened of you until the end of its next turn.",
  "earthskin":
    "The target gains 8 temporary Health for the duration and a Boon on Body Resilience Tests. Its Speed drops by 10 feet for the duration.",
  "elemental-convergence":
    "Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 16 Nature damage, and half of that, rounded down, on a success. For the duration the area is Difficult ground, ranged attacks across it take a Bane, and no fire burns in it. The elements do not do this twice for the same request: casting it again inside a week asks the GM whether they are still willing.",
  "exorcism":
    "The target takes 5 Holy damage. Against an undead creature or a demon the Damage Rating is 9 instead, and one Sustained spell such a creature is holding ends.",
  "exsanguinate":
    "The target must have been drained by your Drain Life since the end of its last turn. It takes 6 Shadow damage and gains no benefit from healing until the end of your next turn. You regain Health equal to the damage dealt, and any of it above your Health maximum is kept as temporary Health until your next Long Rest.",
  "eye-beam":
    "Each creature in the line makes a Reflex Resilience Test against your Spell DC. On a failure it takes 4 Fel damage and is Scorched 2. On a success it takes half the damage, rounded down, and is not Scorched.",
  "fade":
    "Attack Tests and Casting Tests against you take a Bane while any other creature is within 15 feet of you. The spell ends if you deal damage.",
  "faerie-fire":
    "The target sheds dim light out to a 10 ft radius, its Defense drops by 2 for the duration, and it cannot become invisible or hide.",
  "fel-covenant":
    "Each target gains Ward 3 against Fel and Ward 3 against Shadow for the duration. At the start of each of your turns each target loses 1 Health, bypassing armor and Ward, and a target may end the covenant on itself at any time. A target reduced to 1 Health by the covenant is released from it.",
  "firebrand":
    "One weapon the target is holding burns for the duration. Its attacks deal 2 further Fire damage, and it sheds bright light out to a 20 ft radius. The fire does not harm the creature holding it, and it goes out if the weapon leaves that creature's hand.",
  "firewake":
    "The area must contain a creature burning from your Wildfire, or the spell does nothing and the Mana is spent. Every creature in the area makes a Reflex Resilience Test against your Spell DC. On a failure it takes 7 Fire damage, and half of that, rounded down, on a success. The area burns for the duration, sheds bright light out to 40 feet, and spreads 10 feet in a direction of the GM's choosing at the start of each of your turns.",
  "flashover":
    "The target must have taken damage from Flame Shock since the end of its last turn. It takes 5 Fire damage, and the Flame Shock moves to a creature within 15 feet of it rather than ending, its duration beginning again.",
  "frost-strike":
    "Your next melee hit this turn deals 4 additional Frost damage.",
  "frozen-rune":
    "The first creature to enter the space must pass a Reflex Resilience Test against your Spell DC or be Entangled until it spends an action and passes another Reflex Resilience Test against your Spell DC. The rune is invisible to anything that has not been told it is there. While sustaining this spell you pay 2 Mana at the start of each of your turns.",
  "glaciate":
    "The target must be Stunned by your Frostbind. It takes 2 Frost damage, and a target that fails a Body Resilience Test against your Spell DC is closed inside ice: it cannot act, move, cast or be moved, and nothing can affect it, including you. It gets no further Test and stays closed for as long as you go on sustaining the spell. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "grave-touch":
    "The target takes 4 Shadow damage. You regain 2 Health.",
  "hammer-of-justice":
    "A creature that fails a Body Resilience Test against your Spell DC is Stunned until the end of its next turn. The spell deals no damage, so no Ward applies to it.",
  "heartrend":
    "The target takes 6 Shadow damage and you regain Health equal to half the damage dealt, rounded down.",
  "hoarfrost":
    "A creature takes 2 Frost damage when it starts its turn inside the area and its Speed drops by 10 feet until it leaves. The area is Difficult ground, every liquid in it freezes solid, and at the start of each of your turns it grows by 5 feet in every direction. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "holy-fire":
    "The target takes 4 Holy damage, then 2 Holy damage at the start of its next turn, and 1 further Holy damage on that turn for each point of Spellpower: Holy you carry.",
  "hourstrike":
    "Your next weapon attack this turn deals 2 more Physical damage on a hit and lays Decay 1 on the creature it hits.",
  "ice-block":
    "Until the end of your next turn you cannot act, move, cast or be moved, nothing can affect you, and every condition on you ends. You may use Ice Block once between Short Rests.",
  "ice-lance":
    "The target takes 1 Frost damage. Against a target that is Slowed, Entangled or Prone the Damage Rating is 5 instead.",
  "icelock":
    "Every creature in the area must have been caught by your Frost Nova since the end of your last turn, or the spell does nothing and the Mana is spent. Each makes a Body Resilience Test against your Spell DC. On a failure it is frozen where it stands: it may not move and may not take a Reaction, though it may otherwise act. It may repeat the Test at the end of each of its turns. Fire damage from any source ends it on that creature.",
  "insect-swarm":
    "A creature takes 3 Nature damage when it starts its turn inside the area, and has a Bane on its Attack Tests while it remains there. The swarm stays where it was cast and does not follow.",
  "ley-wound":
    "The target must have been caught in your Ley Rift since the end of its last turn. It takes 4 Arcane damage at the start of each of its turns for the duration. While it runs the target cannot be healed above half its Health maximum.",
  "lightbrand":
    "One weapon the target is holding carries the Light for the duration. Its attacks deal 2 further Holy damage, 6 further Holy damage against an undead creature or a demon, and it sheds bright light out to a 20 ft radius. The weapon cannot be disarmed while it burns.",
  "lightning-rod":
    "The target must have been struck by your Chain Lightning since the end of its last turn. It takes 6 Nature damage. For the duration every arc of your Chain Lightning reaches it first and reaches it again as its last arc, and your Nature spells against it gain a Boon on the Casting Test.",
  "living-flame":
    "A fire elemental appears in the space, using the stat block in 14-BESTIARY, and acts on its own initiative. It fights what you are fighting for as long as you sustain the spell, and it will not do anything else you ask. If you stop sustaining while it still has Health it stays, and it decides for itself what to do next. While sustaining this spell you pay 5 Mana at the start of each of your turns.",
  "manastorm":
    "Every creature in the area makes a Spirit Resilience Test against your Spell DC. On a failure it takes 4 Arcane damage and loses 4 Mana, and on a success it takes half of that, rounded down, and loses no Mana. A creature that loses Mana this way takes 2 further Arcane damage for each point it did not have to lose.",
  "meteor":
    "The area must be your Scorched Earth, or the spell does nothing and the Mana is spent. The meteor lands at the start of your next turn. Every creature in the area then makes a Reflex Resilience Test against your Spell DC: on a failure it takes 12 Fire damage and is knocked Prone, and on a success it takes half of that, rounded down, and keeps its feet. The crater is Difficult ground for the duration.",
  "natures-grasp":
    "The next creature to hit you with a melee attack must pass a Reflex Resilience Test against your Spell DC or be Entangled and unable to make Opportunity Attacks while it is held. The spell then ends whether the Test passed or failed.",
  "nether-snare":
    "A demon that fails a Spirit Resilience Test against your Spell DC cannot teleport, turn invisible or pass through a portal for the duration. Banish and Soulchains against it gain a Boon.",
  "nullify":
    "A creature that fails a Spirit Resilience Test against your Spell DC is Silenced for the duration and may repeat the Test at the end of each of its turns.",
  "pain-suppression":
    "Damage the target takes is reduced by 3 for the duration, and the target may ignore one Bleeding effect for the duration.",
  "rebuke":
    "The target takes 2 Holy damage, and a target that fails a Spirit Resilience Test against your Spell DC is Silenced until the end of its next turn and loses any Sustained spell it was holding. Against an undead creature or a demon the Test is made with a Bane.",
  "rejuvenation":
    "The target regains 2 Health at the start of each of its turns for the duration.",
  "renew":
    "The target regains 2 Health at the start of each of its turns for the duration.",
  "revival":
    "The creature returns to life with 1 Health and every condition on it ended. It must have died within the last day, it must have a body, and it must be willing. It cannot be raised this way twice, and a creature killed by fel or by the plague of undeath cannot be raised this way at all. You pay 10 Health to cast it, and that damage cannot be reduced by armor or Ward.",
  "rimeguard":
    "Each target gains Ward 2 against Frost for the duration. The first time each target would take Frost damage, the Ward stops it entirely.",
  "scouring-veil":
    "Each creature that hits you with a melee attack takes 3 Physical damage and gains Decay 1.",
  "shadowveil":
    "Each target gains Ward 3 against Shadow for the duration and a Boon on any Test to move unnoticed. The first time each target would take damage, the dark takes it instead and that target takes none. Cast as a Reaction when an attack or a spell is about to strike an ally.",
  "slagfall":
    "The ground must already be burning from Scorched Earth. A creature takes 4 Fire damage when it starts its turn in the area, the area is Difficult ground, and a creature that ends its turn there has its Speed drop by 10 feet until it leaves. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "slow-fall":
    "The target falls at a walking pace for the duration and takes no damage from landing.",
  "smite":
    "The target takes 3 Holy damage. Against an undead creature the Damage Rating is 5 instead.",
  "soul-reaper":
    "The target must be under a spell or curse of yours, or the spell does nothing and the Mana is spent. It takes 4 Fel damage at the start of each of its turns, and that amount doubles on each of its turns after the first. Nothing reduces this damage and no Ward applies to it. It ends when the target dies, when you stop sustaining, or when the target puts a mile between you. While sustaining this spell you pay 5 Mana at the start of each of your turns.",
  "spell-relay":
    "Your next tier 1–3 instantaneous cone or line spell may originate from the relay. You must see the relay and chosen area, and the relay must remain within 30 ft when used. The original spell retains its size and reach measured from the relay, cost, Test, targets and friendly-fire rules; this can extend its overall reach from you by up to 30 ft. The relay is spent on the attempt, including failure. It cannot relay itself, a Sustained effect, teleport, summon or a spell from an item.",
  "splinter":
    "The target must have taken Frost damage since the end of its last turn, or the spell does nothing. It takes 2 Frost damage. Against a target that is Slowed, Entangled, Prone or Stunned the Damage Rating is 10 instead.",
  "starfire":
    "The target takes 6 Arcane damage. At SL 3 or better it is Blinded until the end of its next turn.",
  "starweave":
    "Cast into an area where you are sustaining Starfall. While you hold both, a creature that starts its turn in the area makes a Spirit Resilience Test against your Spell DC or is Slowed until the start of your next turn, and your Starfall strikes two creatures each turn rather than one. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "stay-the-hand":
    "The first time the target would drop to 0 Health for the duration, it stays at 1 instead and the spell ends. Healing the target receives is increased by 2 for the duration.",
  "stormfury":
    "The target takes 20 Nature damage, bypassing armor and Ward. Every creature within 15 feet of it makes a Reflex Resilience Test against your Spell DC or takes 10 Nature damage. If the target is wearing or holding metal it takes the Test with a Bane, and if it is standing in water every creature in the water takes the 10 as well.",
  "stormwall":
    "Your Thunderhead must be running, or the spell does nothing and the Mana is spent. A wall of wind and lightning stands along the line for the duration. It blocks sight and ranged attacks, and a creature that tries to cross makes a Body Resilience Test against your Spell DC: on a failure it does not cross and its turn ends, and on a success it crosses and is Slowed until the end of its next turn. The Thunderhead ends.",
  "sunfire":
    "Make a Casting Test against DC 26. On a failure nothing happens and the Mana is spent. On a success every creature in the area makes a Reflex Resilience Test against your Spell DC: on a failure it takes 12 Fire damage, and half of that, rounded down, on a success. Anything reduced to 0 Health by it leaves nothing behind, and the light is seen from thirty miles.",
  "temporal-sanctuary":
    "While an ally is in the area it cannot gain a condition, and the conditions and effects already on it do nothing and do not count down. They resume when it leaves the area or the spell ends. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "thorns":
    "A creature that hits the target with a melee attack takes 3 Nature damage, and 1 further Nature damage for each point of Spellpower: Nature you carry.",
  "tidecall":
    "Cast into an area where you are sustaining Healing Rain. An ally that starts its turn in the area regains 5 Health rather than 3, one condition on it ends, and it may stand from Prone without spending movement. While sustaining this spell you pay 3 Mana at the start of each of your turns.",
  "time-trap":
    "You lay a glyph with a radius of 5 feet times your Intelligence modifier. The first enemy to enter it makes a Spirit Resilience Test against your Spell DC, and on a failure it is Stunned. The glyph then fades.",
  "unholy-frenzy":
    "The target's melee hits deal 2 additional Shadow damage for the duration. The target loses 1 Health at the start of each of its turns for the duration.",
  "vein-rend":
    "The target makes a Body Resilience Test against your Spell DC. On a failure it takes 4 Shadow damage and is Bleeding for the duration, and on a success it takes half of that, rounded down, and is not Bleeding.",
  "verdance":
    "The target must be under your Rejuvenation. It regains 4 Health at the start of each of its turns for the duration rather than 2, and each time it does, one ally within 15 feet of it regains 2 Health as well.",
  "verdict":
    "The target must have been struck by your Exorcism since the end of its last turn. It takes 9 Holy damage. Against an undead creature or a demon the Damage Rating is 16 instead, and such a creature reduced to 0 Health by this cannot be raised, resummoned or returned by any means."
});

/** What the old pack printed, for the census: the Mana, the action and the tier. */
export const OLD_FIELDS = Object.freeze({
  "afterlight": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "annihilation": Object.freeze({ mana: 24, action: "full", tier: 5 }),
  "backburn": Object.freeze({ mana: 5, action: "reaction", tier: 3 }),
  "barkskin": Object.freeze({ mana: 5, action: "half", tier: 3 }),
  "blessing-of-freedom": Object.freeze({ mana: 2, action: "action", tier: 1 }),
  "bloom": Object.freeze({ mana: 4, action: "half", tier: 2 }),
  "cinderfall": Object.freeze({ mana: 20, action: "full", tier: 5 }),
  "condemnation": Object.freeze({ mana: 12, action: "action", tier: 4 }),
  "cone-of-cold": Object.freeze({ mana: 3, action: "action", tier: 1 }),
  "darkward": Object.freeze({ mana: 4, action: "reaction", tier: 2 }),
  "demonic-circle": Object.freeze({ mana: 16, action: "action", tier: 5 }),
  "devotion-aura": Object.freeze({ mana: 2, action: "action", tier: 1 }),
  "divert-timeway": Object.freeze({ mana: 30, action: "full", tier: 5 }),
  "divine-shield": Object.freeze({ mana: 6, action: "reaction", tier: 2 }),
  "dread-cry": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "dread-whisper": Object.freeze({ mana: 3, action: "action", tier: 1 }),
  "earthskin": Object.freeze({ mana: 4, action: "half", tier: 2 }),
  "elemental-convergence": Object.freeze({ mana: 22, action: "full", tier: 5 }),
  "exorcism": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "exsanguinate": Object.freeze({ mana: 7, action: "action", tier: 3 }),
  "eye-beam": Object.freeze({ mana: 6, action: "action", tier: 2 }),
  "fade": Object.freeze({ mana: 2, action: "half", tier: 1 }),
  "faerie-fire": Object.freeze({ mana: 1, action: "half", tier: 1 }),
  "fel-covenant": Object.freeze({ mana: 7, action: "reaction", tier: 3 }),
  "firebrand": Object.freeze({ mana: 5, action: "action", tier: 3 }),
  "firewake": Object.freeze({ mana: 13, action: "action", tier: 4 }),
  "flashover": Object.freeze({ mana: 4, action: "half", tier: 2 }),
  "frost-strike": Object.freeze({ mana: 2, action: "half", tier: 1 }),
  "frozen-rune": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "glaciate": Object.freeze({ mana: 8, action: "full", tier: 3 }),
  "grave-touch": Object.freeze({ mana: 3, action: "action", tier: 1 }),
  "hammer-of-justice": Object.freeze({ mana: 2, action: "half", tier: 1 }),
  "heartrend": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "hoarfrost": Object.freeze({ mana: 7, action: "action", tier: 3 }),
  "holy-fire": Object.freeze({ mana: 3, action: "full", tier: 1 }),
  "hourstrike": Object.freeze({ mana: 5, action: "half", tier: 2 }),
  "ice-block": Object.freeze({ mana: 4, action: "reaction", tier: 2 }),
  "ice-lance": Object.freeze({ mana: 1, action: "half", tier: 1 }),
  "icelock": Object.freeze({ mana: 11, action: "half", tier: 4 }),
  "insect-swarm": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "ley-wound": Object.freeze({ mana: 6, action: "half", tier: 3 }),
  "lightbrand": Object.freeze({ mana: 6, action: "action", tier: 3 }),
  "lightning-rod": Object.freeze({ mana: 6, action: "half", tier: 3 }),
  "living-flame": Object.freeze({ mana: 18, action: "action", tier: 5 }),
  "manastorm": Object.freeze({ mana: 7, action: "action", tier: 3 }),
  "meteor": Object.freeze({ mana: 14, action: "full", tier: 4 }),
  "natures-grasp": Object.freeze({ mana: 2, action: "reaction", tier: 1 }),
  "nether-snare": Object.freeze({ mana: 5, action: "action", tier: 2 }),
  "nullify": Object.freeze({ mana: 4, action: "action", tier: 2 }),
  "pain-suppression": Object.freeze({ mana: 5, action: "reaction", tier: 2 }),
  "rebuke": Object.freeze({ mana: 6, action: "half", tier: 3 }),
  "rejuvenation": Object.freeze({ mana: 2, action: "half", tier: 1 }),
  "renew": Object.freeze({ mana: 2, action: "action", tier: 1 }),
  "revival": Object.freeze({ mana: 14, action: "half", tier: 4 }),
  "rimeguard": Object.freeze({ mana: 4, action: "reaction", tier: 2 }),
  "scouring-veil": Object.freeze({ mana: 9, action: "half", tier: 3 }),
  "shadowveil": Object.freeze({ mana: 6, action: "reaction", tier: 3 }),
  "slagfall": Object.freeze({ mana: 7, action: "half", tier: 3 }),
  "slow-fall": Object.freeze({ mana: 1, action: "reaction", tier: 1 }),
  "smite": Object.freeze({ mana: 2, action: "action", tier: 1 }),
  "soul-reaper": Object.freeze({ mana: 18, action: "action", tier: 5 }),
  "spell-relay": Object.freeze({ mana: 7, action: "action", tier: 3 }),
  "splinter": Object.freeze({ mana: 4, action: "half", tier: 2 }),
  "starfire": Object.freeze({ mana: 3, action: "full", tier: 1 }),
  "starweave": Object.freeze({ mana: 7, action: "half", tier: 3 }),
  "stay-the-hand": Object.freeze({ mana: 5, action: "reaction", tier: 2 }),
  "stormfury": Object.freeze({ mana: 19, action: "action", tier: 5 }),
  "stormwall": Object.freeze({ mana: 12, action: "reaction", tier: 4 }),
  "sunfire": Object.freeze({ mana: 20, action: "full", tier: 5 }),
  "temporal-sanctuary": Object.freeze({ mana: 12, action: "action", tier: 3 }),
  "thorns": Object.freeze({ mana: 3, action: "half", tier: 2 }),
  "tidecall": Object.freeze({ mana: 8, action: "action", tier: 3 }),
  "time-trap": Object.freeze({ mana: 6, action: "action", tier: 2 }),
  "unholy-frenzy": Object.freeze({ mana: 3, action: "action", tier: 2 }),
  "vein-rend": Object.freeze({ mana: 2, action: "action", tier: 1 }),
  "verdance": Object.freeze({ mana: 6, action: "half", tier: 3 }),
  "verdict": Object.freeze({ mana: 7, action: "action", tier: 3 })
});
