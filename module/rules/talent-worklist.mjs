/**
 * **THE TALENT WORKLIST** (D-768): every talent the hardened census finds
 * (`talent-effects.mjs#talentCensus`), by class, with the detectors that found
 * it. It is the floor each class phase of the talent plan drives to zero:
 * the Druid first, then the Warrior, Paladin, Ranger, Rogue, Priest, Shaman,
 * Mage and Warlock.
 *
 * `talent-effects.test.mjs` holds this list to the census BOTH ways: a gap the
 * census finds that is not here fails, and a line here the census no longer
 * finds fails until it is struck. `WORKLIST_CEILING` is each class's count and
 * MAY ONLY FALL: raising one is a decision a reviewer has to see.
 *
 * The detectors: `gap` (the row says what is not built), `emptyPatch` (a
 * `modifies` patch with nothing but the feature's name), `attackSpend`,
 * `costsLess`, `reducesDamage`, `restoresHealth`, `risesBy`, `perRankStat`,
 * `temporaryHealth`, `startOfTurn`, `inflictsCondition`, `slTrigger`,
 * `criticalRange` and `namesFeature` - see `CENSUS_DETECTORS`.
 *
 * Data, not law: nothing in the system imports this file.
 */

export const TALENT_WORKLIST = Object.freeze({
  // D-771 (the talent plan's Phase 3): two lines left, each a QUESTION for the
  // lead, its reason on the row's own `gap`. D-777 built Living Seed's
  // temporary Health (the lead: *"raise HP past max as temp hp"*), and D-778
  // Typhoon's push (the lead: *"Yes."*, away from the area's centre): none left.
  druid: Object.freeze({}),
  // D-775 (the talent plan's Phase 10): ten lines left, each a `gap` whose reason
  // is on the row - and every one a QUESTION for the lead or a door 07 never built.
  // D-777 built Ice Barrier's temporary Health; D-778 the upkeep by the entry
  // (Arcane Concentration, Netherwind's reduction), forced movement (Blast
  // Wave), Slowed in feet (Permafrost) and the Tests 07 gives a held or Stunned
  // creature (Frost Nova, Deep Freeze, Absolute Zero). D-779 built Overchannel
  // Mastery's doubled Mana (the lead: *"Per cast"*), and one is left: Spellsteal's
  // rank 2 moving a Sustain, what it laid and the area it placed to another caster
  // (the lead: *"Yes."*) - a door of its own, not built (O-230).
  mage: Object.freeze({
    "spellsteal": ["gap"]
  }),
  // D-772 (the talent plan's Phase 5): two lines left, each a `gap` whose reason
  // is on the row. D-777 built 07's floor at 1 Health and Aegis of the Light's
  // heal on it, and one is left: Sacrifice's *one more Critical Injury before
  // dying* has no rule in 06 to change, and the lead's ruling on moved damage
  // left it unanswered (CLARIFY).
  paladin: Object.freeze({
    "sacrifice": ["gap"]
  }),
  // D-774 (the talent plan's Phase 8): nine lines left, each a `gap` whose reason
  // is on the row and each a QUESTION for the lead. D-777 built temporary Health
  // (Power Word: Shield, Light's Grace) and D-778 02's Dispel (Rapture; the lead:
  // *"selected Effects, not conditions."*), and D-779 the last six on the lead's
  // answers: a Ward pressed from the incoming card (Foresight), Barrier's Ward on
  // the creatures chosen, Divine Aegis's schools named at the cast, Lightwell's
  // font, Miracle's Use and Devouring Plague's two landings. None left.
  priest: Object.freeze({}),
  // D-773 (the talent plan's Phase 6): three lines left, each a `gap` whose
  // reason is on the row. D-779 built all three on the lead's answers: Shared
  // Quarry's rank 1, Snake Trap's poison and Master of the Land's first sentence.
  ranger: Object.freeze({}),
  // D-773 (the talent plan's Phase 7): two lines left, each a QUESTION for the
  // lead on 06 §6's Parry. D-779 built both on the lead's answer (*"Parry is
  // limited to melee unless a feature allows ranged parry."*): Anticipation's
  // ranged Parry, and Main Gauche reworked to one free Parry a turn.
  rogue: Object.freeze({}),
  // D-774 (the talent plan's Phase 9): five lines left, each a `gap` whose reason
  // is on the row. D-778 built Thunderstorm's push (the lead: *"Yes."*), and
  // D-779 three on the lead's answers - Flametongue's Sustain, Lava Lash's
  // Scorched and Elemental Blademaster's magical blows - and one is left: Earth
  // Shock's rank 2 has no carrier for a Reaction barred through a turn.
  shaman: Object.freeze({
    "earth-shock": ["gap"]
  }),
  // D-775 (the talent plan's Phase 11): two lines left, each waiting on what 02's
  // Dispel ends. D-778 built Dispel (the lead: *"selected Effects, not
  // conditions."*) and both on it - Unstable Affliction's *ends one of your ongoing
  // effects early* and Everlasting Affliction's rank 2: none left.
  warlock: Object.freeze({}),
  // D-772 (the talent plan's Phase 4): five lines left, each a `gap` whose
  // reason is on the row. D-777 built Last Stand's temporary Health, and D-779
  // Undying Rage's hold (the lead: *"Heals cancel the fall."*) and Bracing's span
  // (*"Next move"*). Two are left: Second Strike's re-roll (no door rolls a posted
  // attack again) and Titan's Presence's two-handed weapon in each hand (D-689's
  // bar is read at every equip door and by the bag law's judge, D-737).
  warrior: Object.freeze({
    "second-strike": ["gap"],
    "titans-presence": ["gap"]
  })
});

/** How many `(talent, detector)` lines each class holds today. May only fall (D-768). */
export const WORKLIST_CEILING = Object.freeze({
  // 23 to 22 (D-769): Chimera's patch takes two forms. 22 to 14 (D-770):
  // Mangle, Rip and Feral Charge ride the attack dialog as riders. 14 to 2
  // (D-771): every Druid talent built but Living Seed and Typhoon's push. 2 to
  // 1 (D-777): Living Seed's temporary Health. 1 to 0 (D-778): Typhoon's push.
  druid: 0,
  // 17 to 10 (D-775): every Mage talent built but ten, each a gap with its reason.
  // 10 to 9 (D-777): Ice Barrier's temporary Health. 9 to 2 (D-778): Arcane
  // Concentration, Netherwind, Blast Wave, Permafrost, Frost Nova, Deep Freeze and
  // Absolute Zero. 2 to 1 (D-779): Overchanneller's doubled Mana.
  mage: 1,
  // 13 to 2 (D-772): every Paladin talent built but Aegis of the Light's heal
  // and Sacrifice, each a gap with its reason. 2 to 1 (D-777): 07's floor and
  // Aegis of the Light's heal on it.
  paladin: 1,
  // 19 to 9 (D-774): every Priest talent built but nine, each a gap with its
  // question for the lead. 9 to 7 (D-777): Power Word: Shield's and Light's
  // Grace's temporary Health. 7 to 6 (D-778): Rapture, on 02's Dispel. 6 to 0
  // (D-779): Foresight, Barrier, Divine Aegis, Lightwell, Miracle, Devouring Plague.
  priest: 0,
  // 13 to 3 (D-773): every Ranger talent built but Snake Trap, Shared Quarry's
  // rank 1 and Master of the Land's first sentence, each a gap with its reason.
  // 3 to 0 (D-779): all three.
  ranger: 0,
  // 24 to 2 (D-773): every Rogue talent built but Main Gauche and Anticipation,
  // two questions for the lead on 06 §6's Parry. 2 to 0 (D-779): both.
  rogue: 0,
  // 15 to 5 (D-774): every Shaman talent built but five, each a gap with its
  // reason, four of them questions for the lead. 5 to 4 (D-778): Thunderstorm's
  // push. 4 to 1 (D-779): Flametongue, Lava Lash, Elemental Blademaster.
  shaman: 1,
  // 14 to 13 (D-769): Demonic Ascendance's gap is built - the shape is read.
  // 13 to 2 (D-775): every Warlock talent built but Unstable Affliction and
  // Everlasting Affliction's rank 2, both waiting on what Dispel ends. 2 to 0
  // (D-778): both, on 02's Dispel.
  warlock: 0,
  // 22 to 5 (D-772): every Warrior talent built but Last Stand, Second
  // Strike's re-roll, Titan's Presence's second weapon, Undying Rage and
  // Bracing, each a gap with its reason. 5 to 4 (D-777): Last Stand's
  // temporary Health. 4 to 2 (D-779): Undying Rage and Bracing.
  warrior: 2
});
