/**
 * **THE NECROMANCER'S VERDICT TABLE, AS DATA** (the Necromancer plan's Phase 7; the lead: *"I need
 * to make sure that all automations and animation/sounds are built and functional. Be sure to check
 * all talents, spells, features, etc"*). One row an item - 02 §7's eight features, 04's thirty-six
 * talents, the fifty-seven spells of `NECRO_SPELL_AUTOMATION`, the Skeletal Archer's attack and the
 * events no one item owns - naming the three things the bar asks of it:
 *
 * - **its door**: for a talent and a spell, the census rows that already name them
 *   (`NECRO_TALENT_DOORS`, `NECRO_SPELL_AUTOMATION` with `NECRO_SPELL_DOORS`), read by the Vitest;
 *   for a feature and an event, `doors` here, each `{file, fn, call}` a fragment the Vitest finds
 *   inside the named function with its comments blanked;
 * - **what it plays**: `anim`, the keys whose rows play for it (its own, or the row of what it rides,
 *   `via`), every cue of each holding a sound step and every asset a full leaf of the snapshot; or
 *   `quiet`, the words saying why nothing of its own is drawn;
 * - **the live test that presses its real control**: `live`, `[batch, title prefix]` pairs, each
 *   held by the Vitest to an `it("...` in that batch's file.
 *
 * Pure data with no Foundry import: `module/rules/necromancer-verify.test.mjs` holds every row, and
 * the review page is written from it.
 */

/** The batch files, by the short name a row uses. */
export const BATCH_FILES = Object.freeze({
  essence: "module/testing/quench-necromancer-essence.mjs",
  horde: "module/testing/quench-necromancer-horde.mjs",
  review: "module/testing/quench-necromancer-review.mjs",
  talents: "module/testing/quench-necromancer-talents.mjs",
  spells: "module/testing/quench-necromancer-spells.mjs",
  fixes: "module/testing/quench-necromancer-fixes.mjs",
  verify: "module/testing/quench-necromancer-verify.mjs"
});

/** The batch keys each file registers, for the report. */
export const BATCH_KEYS = Object.freeze({
  essence: ["azeroth-rpg.necromancer-essence"],
  horde: ["azeroth-rpg.necromancer-horde"],
  review: ["azeroth-rpg.necromancer-review"],
  talents: ["azeroth-rpg.necromancer-talents"],
  spells: ["azeroth-rpg.necromancer-spells", "azeroth-rpg.necromancer-spells-t3", "azeroth-rpg.necromancer-spells-t45"],
  fixes: ["azeroth-rpg.necromancer-fixes"],
  verify: ["azeroth-rpg.necromancer-verify"]
});

const d = (file, fn, call) => Object.freeze({ file, fn, call });
const HORDE = "module/effects/necromancer-horde.mjs";
const TALENT_FX = "module/effects/necromancer-talents.mjs";
const ACTOR = "module/documents/actor.mjs";
const WORKFLOWS = "module/dice/workflows.mjs";
const WATCH = "module/effects/death-watch.mjs";

/* ------------------------------------------------------------------ */
/*  02 §7's eight features                                             */
/* ------------------------------------------------------------------ */

export const FEATURE_VERDICT = Object.freeze({
  "command-the-dead": {
    name: "Command the Dead",
    doors: [d(WORKFLOWS, "useFeature", "onUse?.hordeSurge"), d(HORDE, "judgeNecroUse", "if (onUse.hordeSurge) {"), d(HORDE, "landNecroUse", "const refs = await hordeSurge(actor);"), d("module/documents/combat.mjs", "_turnFacts", "hordeTurnFor(this.actor, { ownTurn: this._azerothOwnTurn === true })")],
    anim: ["command-the-dead"],
    live: [["horde", "Command the Dead's Empowered line gives every creature"], ["horde", "the shared turn: the named lead"], ["review", "the panel's Make lead names a new lead"]]
  },
  "grave-calling": {
    name: "Grave Calling",
    doors: [d("module/rules/death-knight.mjs", "FEATURE_SPELLS", "\"Grave Calling\": Object.freeze({ className: \"Necromancer\", spells: Object.freeze([\"Raise Dead\", \"Animate Corpse\"]) })"), d(ACTOR, "_syncClassFeaturesNow", "this.spellGrantTable({ talents: taken })")],
    anim: ["raise-dead", "animate-corpse"], via: "the two spells it teaches, cast through their own rows",
    live: [["verify", "Grave Calling: a level 1 Necromancer"], ["horde", "Raise Dead twice and Ghoul Rising fill 5 of 5"]]
  },
  "deathly-vigor": {
    name: "Deathly Vigor",
    doors: [d(HORDE, "makeHordeRaise", "deathlyVigor(owner.system?.abilities?.int?.mod ?? 0)")],
    anim: ["deathly-vigor"],
    live: [["horde", "Raise Dead twice and Ghoul Rising fill 5 of 5"], ["verify", "Raise Dead from the sheet's Cast"]]
  },
  "claim-the-fallen": {
    name: "Claim the Fallen",
    doors: [d(HORDE, "offerClaim", "const judged = claimFallenJudgement({ living, feet: feetApart(token, corpse), reactionLeft: reactionLeft(actor), known });"), d(HORDE, "claimFromCard", "return await castSpell({"), d("module/dice/chat.mjs", "CARD_ACTIONS", "claimTheFallen: async button => (await import(\"../effects/necromancer-horde.mjs\")).claimFromCard(button),")],
    anim: ["raise-dead", "animate-corpse"], via: "the raise it casts as a Reaction plays that spell's row",
    live: [["horde", "Claim the Fallen offers Raise Dead"], ["review", "Claim the Fallen empowered casts with no Mana"]]
  },
  "grave-guard": {
    name: "Grave Guard",
    doors: [d(ACTOR, "applyDamage", "const guard = await graveGuardInBlow(this, { amount, type, attack, spell, location, by, mitigation, messageId });"), d("module/effects/grave-guard.mjs", "graveGuardInBlow", "act: \"graveGuard\", holderUuid: holder.uuid")],
    anim: ["grave-guard"],
    live: [["review", "Grave Guard, through a real attack card's Apply"], ["horde", "Grave Guard moves a blow to a skeleton"], ["review", "Grave Guard's overflow is an attack that hits"], ["fixes", "Grave Guard's overflow reaches the Necromancer"]]
  },
  "dark-ritual": {
    name: "Dark Ritual",
    doors: [d(HORDE, "judgeNecroUse", "if (onUse.darkRitual) {"), d(HORDE, "landNecroUse", "ranksOf(actor)(\"Grim Sacrament\")")],
    anim: ["dark-ritual", "horde:collapse"],
    live: [["horde", "Dark Ritual at tier 3 collapses a ghoul"], ["review", "Grim Sacrament 2: Dark Ritual"], ["verify", "Dark Ritual from the sheet (a feature)"]]
  },
  "unending-dead": {
    name: "Unending Dead",
    doors: [d(HORDE, "onRaisedDown", "const unending = unendingDeadJudgement({"), d(HORDE, "unendingFromCard", "await collapseHordeMember(holder, servant, { byChoice: true, reason: \"dead\" });")],
    anim: ["unending-dead"],
    live: [["horde", "Unending Dead stands a fallen skeleton again"], ["review", "Unending Dead: Let it fall collapses"], ["review", "Unending Dead out of a fight"]]
  },
  "lichdom": {
    name: "Lichdom (with the phylactery)",
    doors: [d("module/data/actor/character.mjs", "afterFinalPhase", "addLichWard(this.ward)"), d(HORDE, "bindPhylactery", "await postFeatureCard(actor, { key: LICH_BIND_KEY, text: lines[0] });"), d(HORDE, "lichDied", "const judged = phylacteryReturnJudgement({"), d(HORDE, "lichReturnFromCard", "await postFeatureCard(lich, { key: \"lichdom\"")],
    anim: ["lichdom", "lichdom:bind"],
    live: [["horde", "a lich takes Ward 3 Frost and Shadow"], ["review", "a lich's heal is refused on a living ally"]]
  }
});

/* ------------------------------------------------------------------ */
/*  04's thirty-six talents (doors: NECRO_TALENT_DOORS)               */
/* ------------------------------------------------------------------ */

export const TALENT_VERDICT = Object.freeze({
  /* Flesh */
  "ghoul-frenzy": { anim: ["ghoul-frenzy"], live: [["talents", "Ghoul Frenzy, Commander of Bone and Bone Vanguard lie"], ["talents", "Ghoul Frenzy's and Commander of Bone's Empowered surges"]] },
  "shambling-horde": { anim: ["animate-corpse"], via: "Animate Corpse's rising on each zombie", live: [["review", "Animate Corpse under Shambling Horde 1"]] },
  "gorge": { anim: ["gorge"], live: [["talents", "Gorge: the ghoul devours a corpse"]] },
  "grafted-flesh": { anim: ["graft:stitch"], via: "the graft stitching on the raise card", live: [["review", "Grafted Flesh gives an Animate Corpse zombie a graft"]] },
  "plague-carrier": { anim: ["plague-carrier"], live: [["talents", "Plague Carrier: the ghoul's hit asks"], ["talents", "Plague Carrier's Empowered surge"]] },
  "flesh-offering": { anim: [], via: "the Death spell's own row, whose cast it discounts", quiet: "a discount priced on the Death spell's own dialog; the spell's row plays the cast it rides", live: [["fixes", "the dialog draws the lower price, the corpse is destroyed"]] },
  "surgeons-hand": { anim: ["graft:stitch"], via: "a graft given plays the stitching", live: [["review", "Grafted Flesh gives an Animate Corpse zombie a graft for 1 Essence; Surgeon's Hand 2"]] },
  "practiced-stitcher": { anim: ["graft:stitch"], via: "the grafts it discounts play the stitching", live: [["review", "Practiced Stitcher 1 takes 1 off the grafts"]] },
  "bloated-dead": { anim: ["bloated-dead"], live: [["talents", "Bloated Dead: a zombie that drops bursts"], ["talents", "Bloated Dead's Empowered line"]] },
  "regenerating-tissue": { anim: ["regenerating-tissue"], live: [["talents", "Regenerating Tissue's Empowered mending"], ["talents", "Regenerating Tissue at rank 2"]] },
  "exhume": { anim: ["exhume"], gm: "the place the dead lie buried is the GM's (the lead's ruling)", live: [["talents", "Exhume: once per Long Rest"]] },
  "masterwork-abomination": { anim: ["stitch-abomination", "graft:stitch"], via: "Stitch Abomination's rising and the stitching", live: [["review", "Practiced Stitcher 1 takes 1 off the grafts, and Masterwork Abomination"]] },
  /* Bone */
  "skeletal-archery": { anim: ["raise-dead"], via: "Raise Dead's rising on the archer, whose bow plays the arrow", live: [["review", "Skeletal Archery and Mastery 1 offer"], ["verify", "the Skeletal Archer's Bone bow"]] },
  "skeletal-mastery": { anim: ["skeletal-mastery"], live: [["review", "Skeletal Archery and Mastery 1 offer"]] },
  "bone-armor": { anim: ["bone-armor", "horde:collapse"], live: [["talents", "Bone Armor at rank 2"], ["talents", "Bone Armor's Empowered line, in a fight"], ["verify", "Bone Armor from the sheet (a talent)"]] },
  "bone-vanguard": { anim: ["bone-vanguard"], live: [["talents", "Ghoul Frenzy, Commander of Bone and Bone Vanguard lie"], ["talents", "Regenerating Tissue's Empowered mending and Bone Vanguard's"]] },
  "restless-bones": { anim: ["restless-bones"], live: [["talents", "Restless Bones: a skeleton felled"], ["talents", "Restless Bones at rank 1 in a fight"], ["talents", "Restless Bones at rank 2 in a fight"], ["talents", "Restless Bones' Empowered line"]] },
  "marrowguard": { anim: [], quiet: "a standing reduction on the blow's Physical share, landed inside the damage door; the blow's own card is what plays", live: [["talents", "Marrowguard: an attack's Physical damage falls"]] },
  "swelling-ranks": { anim: [], quiet: "horde places, a number the panel reads; no event of its own", live: [["review", "Swelling Ranks and The Endless Host add skeleton-only places"]] },
  "ranks-of-bone": { anim: ["raise-dead"], via: "Raise Dead's rising on each skeleton", live: [["review", "Ranks of Bone 1 lets Raise Dead take two corpses"]] },
  "barbed-bone": { anim: ["barbed-bone"], live: [["spells", "Bone Shield: refused from the sheet; asked when a blow lands"], ["review", "Grave Guard's overflow is an attack that hits"]] },
  "commander-of-bone": { anim: ["commander-of-bone"], live: [["talents", "Ghoul Frenzy, Commander of Bone and Bone Vanguard lie"], ["talents", "Ghoul Frenzy's and Commander of Bone's Empowered surges"]] },
  "bone-storm": { anim: ["bone-storm"], live: [["talents", "Bone Storm: a skeleton beside the foe collapses"], ["talents", "Bone Storm: once per encounter"]] },
  "the-endless-host": { anim: [], quiet: "horde places from Arcana Ranks, a number the panel reads; no event of its own", live: [["review", "Swelling Ranks and The Endless Host add skeleton-only places"]] },
  /* Damned */
  "acolytes-sacrifice": { anim: ["acolytes-sacrifice"], live: [["talents", "Acolyte's Sacrifice: a servant collapses"], ["talents", "Acolyte's Sacrifice's Empowered line"]] },
  "circle-of-the-damned": { anim: ["circle-of-the-damned"], live: [["talents", "Circle of the Damned at rank 3"], ["talents", "Circle of the Damned's Empowered line"], ["verify", "Circle of the Damned pressed on the board"]] },
  "cult-fervor": { anim: ["circle-of-the-damned"], via: "the circle's own loop, which stands while its Boons do", live: [["talents", "Circle of the Damned at rank 3 with Grand Circle 2 and Cult Fervor 2"]] },
  "sacrificial-strength": { anim: ["horde:collapse"], via: "the collapse by choice it rides", live: [["talents", "Sacrificial Strength at rank 2"]] },
  "unholy-fervor": { anim: ["unholy-fervor"], live: [["talents", "Unholy Fervor at rank 2"]] },
  "unsummon": { anim: ["unsummon"], live: [["talents", "Unsummon: a servant collapses"], ["talents", "Unsummon at rank 2 takes no action"], ["talents", "Unsummon on a creature raised this round"]] },
  "watchful-shades": { anim: ["watchful-shades"], live: [["talents", "Acolyte's Sacrifice: a servant collapses and a Shade rises"]] },
  "grand-circle": { anim: ["grand-circle", "circle-of-the-damned"], live: [["talents", "Circle of the Damned at rank 3 with Grand Circle 2"], ["verify", "Circle of the Damned pressed on the board"]] },
  "life-for-a-life": { anim: ["life-for-a-life"], live: [["talents", "Life for a Life: an ally in the circle"]] },
  "grim-sacrament": { anim: ["dark-ritual"], via: "Dark Ritual's own row, whose cap it raises", live: [["review", "Grim Sacrament 2: Dark Ritual"]] },
  "dark-communion": { anim: ["dark-communion"], live: [["talents", "Dark Communion: out of a fight"], ["talents", "Dark Communion is refused in a fight"]] },
  "the-black-rite": { anim: ["the-black-rite"], live: [["talents", "The Black Rite: a servant collapses"], ["talents", "The Black Rite's Empowered line"]] }
});

/* ------------------------------------------------------------------ */
/*  The fifty-seven spells (doors: NECRO_SPELL_AUTOMATION)            */
/* ------------------------------------------------------------------ */

const s = (...live) => live;
export const SPELL_VERDICT = Object.freeze({
  /* tier 1 */
  "bone-shards": { live: s(["spells", "Bone Shards: 5 Shadow"], ["essence", "Potent on Bone Shards at tier 2"]) },
  "grave-rot": { live: s(["spells", "Grave Rot: a corpse picked"]) },
  "grave-touch": { live: s(["spells", "Grave Touch: the target takes"]) },
  "dread-whisper": { live: s(["spells", "Dread Whisper: a failed Spirit Test"]) },
  "bone-ward": { live: s(["spells", "Bone Ward: the self Apply"], ["review", "Lasting doubles a laid spell's span"]) },
  "mend-the-dead": { live: s(["spells", "Mend the Dead: refused on a living target"]) },
  "raise-dead": { anim: ["raise-dead", "deathly-vigor"], live: s(["spells", "Raise Dead and Animate Corpse stand"], ["horde", "Raise Dead twice and Ghoul Rising"], ["verify", "Raise Dead from the sheet's Cast"]) },
  "animate-corpse": { live: s(["spells", "Raise Dead and Animate Corpse stand"], ["review", "Animate Corpse under Shambling Horde 1"]) },
  "grave-sense": { live: s(["spells", "Grave Sense: a card to the caster"]) },
  "corpse-candle": { live: s(["spells", "Corpse Candle: dim light"]) },
  "deathmask": { live: s(["spells", "Deathmask: the caster wears"], ["spells", "Deathmask: a corpse dead a day"]) },
  "bone-courier": { live: s(["spells", "Bone Courier: the message"]) },
  /* tier 2 */
  "soul-lash": { live: s(["spells", "Soul Lash: the blow"]) },
  "cripple": { live: s(["spells", "Cripple: Slowed"], ["fixes", "lays a Bane on Cripple's Resist"]) },
  "plague-cloud": { live: s(["spells", "Plague Cloud: the placed fog"], ["fixes", "Plague Cloud, laid by the card's Place area"], ["verify", "Plague Cloud (an area spell)"]) },
  "field-of-bones": { live: s(["spells", "Field of Bones: the placed area"], ["review", "Far-reaching lets Field of Bones' Place area land"]) },
  "frenzy-of-the-dead": { live: s(["spells", "Frenzy of the Dead: each raised dead"], ["spells", "Frenzy of the Dead with Far-reaching"]) },
  "grave-step": { live: s(["spells", "Grave Step: a space beside a corpse"]) },
  "ghoul-rising": { live: s(["spells", "Ghoul Rising stands a Plagued Ghoul"], ["horde", "Raise Dead twice and Ghoul Rising"]) },
  "ghostly-servant": { live: s(["spells", "Ghostly Servant: a point picked"]) },
  "grave-ward": { live: s(["spells", "Grave Ward: the ward set"]) },
  "borrowed-senses": { live: s(["spells", "Borrowed Senses: through one of the caster's raised dead"]) },
  "deaths-tidings": { live: s(["spells", "Death's Tidings: a creature named"]) },
  /* tier 3 */
  "wraith-bolt": { live: s(["spells", "Wraith Bolt: 9 Shadow"]) },
  "plague-wind": { live: s(["spells", "Plague Wind: a failed Body Test"]) },
  "grave-tide": { live: s(["spells", "Grave Tide: the enemy takes the blow"]) },
  "terror-of-the-grave": { live: s(["spells", "Terror of the Grave: a failed Spirit Test"]) },
  "bone-shield": { anim: ["bone-shield", "barbed-bone"], live: s(["spells", "Bone Shield: refused from the sheet"], ["spells", "Bone Shield: the GM asks"], ["review", "Grave Guard's overflow is an attack that hits"]) },
  "unholy-restoration": { live: s(["spells", "Unholy Restoration: an undead creature regains 11"]) },
  "stitch-abomination": { anim: ["stitch-abomination", "graft:stitch"], gm: "the corpses or dead flesh enough to build a Large creature are the GM's (the lead)", live: s(["spells", "Stitch Abomination and Bind Banshee stand"], ["horde", "Meat Hook, Warded Hide (Fire) and Swollen"], ["verify", "Stitch Abomination: the graft chooser answered"]) },
  "bind-banshee": { gm: "the corpse being a female Humanoid's is the GM's (the lead)", live: s(["spells", "Stitch Abomination and Bind Banshee stand"], ["review", "Bind Banshee stands a Banshee"]) },
  "spirit-anchor": { live: s(["spells", "Spirit Anchor: the anchor set"], ["spells", "Spirit Anchor: a look whose scene cannot be viewed"]) },
  "death-trance": { live: s(["spells", "Death Trance: no breath"]) },
  "bone-bridge": { live: s(["spells", "Bone Bridge: the card's Place area"]) },
  "mark-of-the-grave": { live: s(["spells", "Mark of the Grave: the mark laid"]) },
  "graveblight": { live: s(["spells", "Graveblight: a Necromancer pays 7 Mana"]) },
  /* tier 4 */
  "raise-crypt-horror": { live: s(["spells", "Raise Crypt Horror and Enslave the Dead"], ["review", "Raise Crypt Horror refuses a Medium corpse"]) },
  "enslave-the-dead": { anim: ["enslave-the-dead", "enslave:end"], live: s(["spells", "Raise Crypt Horror and Enslave the Dead"], ["horde", "Enslave the Dead holds an undead creature"], ["review", "takes 07's Bane on a Mindless target"], ["fixes", "takes control of a Death Knight's raised skeleton"]) },
  "bone-prison": { live: s(["spells", "Bone Prison: Entangled"]) },
  "necrotic-nova": { live: s(["spells", "Necrotic Nova: the enemy takes the blow"]) },
  "soul-cage": { live: s(["spells", "Soul Cage: half Health gated"]) },
  "soul-rip": { live: s(["spells", "Soul Rip: the blow"]) },
  "shroud-of-bone": { live: s(["spells", "Shroud of Bone: refused past four"]) },
  "unholy-renewal": { live: s(["spells", "Unholy Renewal: only the undead allies"]) },
  "call-the-departed": { live: s(["spells", "Call the Departed: a spirit called"]) },
  "speak-with-the-dead": { live: s(["spells", "Speak with the Dead: the corpse answers"], ["spells", "Speak with the Dead: a corpse dead a month"]) },
  "contagion": { live: s(["spells", "Contagion: under the caster's Graveblight"], ["spells", "Contagion: Cure Blight cast on a creature inside"], ["essence", "refuses Contagion until Graveblight is known"]) },
  /* tier 5 */
  "puppet-of-flesh": { live: s(["spells", "Puppet of Flesh: the creature controlled"]) },
  "plague-of-undeath": { anim: ["plague-of-undeath", "horde:rise"], live: s(["spells", "Plague of Undeath: a failed Body Test lays the diseases"], ["horde", "Plague of Undeath: a creature that fails is plagued"], ["review", "two plagued deaths at once both rise"]) },
  "reaping": { live: s(["spells", "Reaping: every enemy within 20 feet"]) },
  "sever-the-soul": { live: s(["spells", "Sever the Soul: the target takes the blow"]) },
  "the-dead-rise": { live: s(["spells", "The Dead Rise stands the corpses within 60 feet"], ["horde", "The Dead Rise stands its dead outside the horde"], ["review", "The Dead Rise's hour ends on the clock"]) },
  "shroud-of-the-grave": { live: s(["spells", "Shroud of the Grave: 12 temporary Health"]) },
  /* shared */
  "drain-life": { live: s(["spells", "Drain Life (the lead"]) },
  "curse-of-agony": { live: s(["spells", "Curse of Agony: the Apply lays its tick"], ["fixes", "Curse of Agony's tick takes Potent"]) },
  "curse-of-weakness": { live: s(["spells", "Curse of Weakness: a failed Spirit Test"], ["spells", "Curse of Weakness with Lasting"]) },
  "curse-of-tongues": { live: s(["spells", "Curse of Tongues: a failed Spirit Test"]) }
});

/* ------------------------------------------------------------------ */
/*  The Skeletal Archer's attack and the events                        */
/* ------------------------------------------------------------------ */

export const EVENT_VERDICT = Object.freeze({
  "skeletal-archer-attack": {
    name: "The Skeletal Archer's attack (Bone bow)",
    doors: [d("module/applications/npc-sheet.mjs", "#onRollAttack", "npcAttackWithDialog("), d(HORDE, "judgeHordeRaise", "ranksOf(actor)(\"Skeletal Archery\")")],
    strike: "arrow",
    live: [["verify", "the Skeletal Archer's Bone bow"]]
  },
  "essence-gain": {
    name: "Essence gain (the death watch)",
    doors: [d(WATCH, "harvest", "const verdict = essenceFromDeath({ living, enemy: essenceEnemy(mine, theirs), feet, pool });"), d(WATCH, "deathWatchQueryHandler", "essenceGain: \"death\", ...(cue ? { [ESSENCE_GAIN_OPTION]: cue } : {})")],
    anim: ["essence:gain"],
    live: [["verify", "the Skeletal Archer's Bone bow"], ["essence", "a living enemy dying 100 feet away gives 1 Essence"], ["fixes", "two Necromancers on one death each gain 1"], ["fixes", "in a started fight the tracker's sides decide"]]
  },
  "soul-harvest": {
    name: "Soul Harvest (the Warlock's, through the death watch)",
    doors: [d(WATCH, "harvest", "if (soulHarvestGain({ feet, pool: mana }).gain > 0) await ask(holder, { act: \"soulHarvest\", holderUuid: holder.uuid, deathId, ...(nearest ? cueSource(nearest) : {}) });"), d(WATCH, "deathWatchQueryHandler", "cue ? { [SOUL_HARVEST_OPTION]: cue } : {}")],
    anim: ["soul-harvest"],
    live: [["verify", "the Skeletal Archer's Bone bow"], ["essence", "Soul Harvest gives a Warlock 2 Mana"]]
  },
  "essence-rest": {
    name: "The Essence Long Rest exposure",
    doors: [d(ACTOR, "longRest", "const essenceRisk = this.type === \"character\" ? restExposure({ held: essenceHeld }) : null;")],
    anim: [], quiet: "a Resilience Test card (10's exposure, as every exposure card), which no row plays",
    live: [["verify", "the sheet's Long Rest, holding 2 Essence"], ["verify", "the sheet's Long Rest for a Forsaken Necromancer"]]
  },
  "empower": {
    name: "The four empower benefits (Potent, Binding, Lasting, Far-reaching)",
    doors: [d(ACTOR, "castLineOffer", "...empowerLines(spellSystem, { essence: essenceHeld, tier: this.system?.tier ?? 1 })"), d(WORKFLOWS, "castSpell", "const essenceCast = essenceDue({"), d(WORKFLOWS, "castSpell", "const farReachingAsked = (talentLines ?? []).includes(\"empower-farReaching\");")],
    anim: [], via: "the empowered spell's own row", quiet: "lines on the cast's own dialog, paid with the cast; the spell's row plays the cast they ride",
    live: [["essence", "Potent on Bone Shards at tier 2"], ["essence", "a failed Casting Test still spends the Essence"], ["essence", "the dialog greys the empower lines"], ["fixes", "lays a Bane on Cripple's Resist"], ["review", "Lasting doubles a laid spell's span"], ["review", "Far-reaching lets Bone Shards reach a target"], ["spells", "Potent once per cast"], ["spells", "Binding spent only on the roll"]]
  },
  "grafts": {
    name: "Grafts (Stitch Abomination, Grafted Flesh, and the three that fire on their own)",
    doors: [d(HORDE, "judgeHordeRaise", "const picks = await chooseGrafts(actor, item, entries[i], menu);"), d("module/effects/graft-riders.mjs", "graftHitTests", "const riders = graftHitRiders({ grafts, attackName, rangeKind });"), d("module/documents/combat.mjs", "_onStartTurn", "bladderTurnStart")],
    anim: ["graft:stitch", "graft:meat-hook", "graft:plague-bladder", "graft:grasping-arms"],
    live: [["horde", "Meat Hook, Warded Hide (Fire) and Swollen"], ["verify", "Stitch Abomination: the graft chooser answered"], ["review", "a Chain hook hit asks the Test"], ["review", "a melee hit asks Grasping Arms"], ["fixes", "a failed Plague Bladder Test lays Poisoned 1"]]
  },
  "horde-capacity": {
    name: "The horde's places",
    doors: [d(HORDE, "judgeHordeRaise", "const judged = hordeRefusal({ members, adding, capacity });"), d(HORDE, "capacityOf", "swellingRanks: rankNamed(\"Swelling Ranks\"), endlessHost: rankNamed(\"The Endless Host\"),")],
    anim: ["horde:collapse"], via: "the collapse the places chooser asks for",
    live: [["horde", "a fourth raise opens the collapse chooser BEFORE any Mana is paid"], ["review", "Swelling Ranks and The Endless Host add skeleton-only places"]]
  },
  "collapse": {
    name: "A raised dead collapsing",
    doors: [d(HORDE, "collapseHordeTokens", "await scene.deleteEmbeddedDocuments(\"Token\", tokens.map(tk => tk.id), cue ? { [COLLAPSE_OPTION]: cue } : {});")],
    anim: ["horde:collapse"],
    live: [["horde", "one skeleton of a pair is dismissed alone from the panel"], ["review", "the sheet's Long Rest collapses the whole horde"], ["verify", "Bone Armor from the sheet (a talent)"]]
  },
  "shared-turn": {
    name: "The horde's shared turn",
    doors: [d("module/documents/combat.mjs", "_turnFacts", "if (horde) return { extraAttack: this._hasExtraAttack(), freeMove: this._freeMoves(), halfActions: horde.halfActions, reactions: horde.reactions };"), d("module/documents/combat.mjs", "resetBudget", "await leadTaken(")],
    anim: [], quiet: "a budget each creature's turn writes; the tracker shows it and nothing on the board changes",
    live: [["horde", "the shared turn: the named lead"], ["horde", "Command the Dead's Empowered line gives every creature"]]
  },
  "circle": {
    name: "Circle of the Damned's Region (cue and loop)",
    doors: [d(TALENT_FX, "drawCircle", "featureKey: CIRCLE_KEY, identifier: CIRCLE_KEY, sustained: false,"), d("module/documents/combat.mjs", "_areaTicks", "actor.grantTemporaryHealth?.(payload.temp,")],
    anim: ["circle-of-the-damned"],
    live: [["verify", "Circle of the Damned pressed on the board"], ["talents", "Circle of the Damned at rank 3"]]
  },
  "phylactery": {
    name: "The Phylactery item",
    doors: [d(HORDE, "bindPhylacteryAtRest", "const carried = actor.items.filter(i => i.type === \"gear\" && i.name === PHYLACTERY.name);"), d(HORDE, "lichDied", "flags: { [SCOPE]: { [PHYLACTERY.returnFlag]: { item: item.uuid, at: start + PHYLACTERY.seconds } } }")],
    anim: ["lichdom:bind", "lichdom"],
    live: [["horde", "a lich takes Ward 3 Frost and Shadow"], ["review", "a lich's heal is refused on a living ally"]]
  },
  "learning-door": {
    name: "The learning door (07 §9)",
    doors: [d("module/documents/item.mjs", "learnSpells", "const verdict = actor.learnVerdict(data, {"), d(ACTOR, "learnVerdict", "const refused = spellLearnRefusal({")],
    anim: [], quiet: "a refusal in words or the GM's confirm; nothing happens on the board",
    live: [["essence", "refuses a Necromancer spell to a Death Knight"], ["essence", "refuses Contagion until Graveblight is known"], ["fixes", "the document's seam refuses a player's tier 5 spell"]]
  },
  "cast-cap": {
    name: "07 §4's cast cap and the GM's teach-anyway",
    doors: [d(WORKFLOWS, "castSpell", "const capped = actor?.castCapWords?.(spell) ?? null;"), d("module/applications/character-sheet.mjs", "_onDropItem", "window: { title: game.i18n.localize(\"AZEROTH.Spell.Teach.Title\") },")],
    anim: [], quiet: "a refusal in words before anything is spent, or the GM's confirm; no cast is made",
    live: [["fixes", "the sheet's Cast refuses a tier 1 Necromancer's tier 3 spell"], ["fixes", "the GM's drop of a tier 5 spell asks teach-anyway"]]
  }
});

/** The rows where a clause stays the GM's by the lead's ruling, and nothing else. */
export const GM_CALLS = Object.freeze(["stitch-abomination", "bind-banshee", "exhume"]);
