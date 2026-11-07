/**
 * Bestiary presentation recipes. These cues announce a use; they do not claim
 * a failed save, move a token, summon an actor, or maintain an untracked aura.
 * Inherent traits are deliberately quiet. Existing bespoke recipes in the main
 * table take precedence over this catalogue.
 */
export const PRESENTATION_ONLY_ABILITIES = Object.freeze([
  // **WHAT IS STILL ANNOUNCED**: a creature's ability with no Use of its own. The thirteen
  // Boss Actions that were announced here (Shadow Step, Elsewhere, Raise the Fallen, Sent to
  // a Room, Class Call, Enfeeble, Step Aside, Three Places at Once, and D-807's Unholy
  // Command, Sell Them Out, Amani Fury, Gyth Takes the Air and The Dead Attend) each have a
  // door now (D-809, `effects/boss-doors.mjs`) and are pressed like any other Use; their cues
  // play off the same rows below.
  "Not Your Business", "Ejector Seat"
]);

/** Prose geometry only: the GM still places the area and resolves its effects. */
export const CREATURE_PRESENTATION_AREAS = Object.freeze({
  "ability:breath": "30 ft cone", "ability:frost-breath": "20 ft cone",
  "ability:arcane-breath": "30 ft cone", "ability:whelp-breath": "10 ft cone",
  "ability:deep-breath": "60 ft line", "ability:storm-breath": "20 ft line"
});

export function creatureAnimations({ fx, snd, cue, SOUNDS }) {
  const rows = {};
  const slug = name => name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const add = (names, asset, sound, options = {}) => {
    for (const name of names.split("|")) rows[`ability:${slug(name)}`] = {
      cues: [cue("use", [fx(asset, { place: "source", scale: 0.65, ...options }),
        snd(sound, { volume: 0.35 })])]
    };
  };
  const quiet = (names, reason) => {
    for (const name of names.split("|")) rows[`ability:${slug(name)}`] = { reason };
  };
  // A restrained source cue precedes adjudication. No victim is shown afflicted
  // merely because the creature announced its test or reaction.
  add("Gut Spill|Blightcloud|Venom|Fevered Bite|Plague Slick|Grave Plague|Ravenholdt Venom|The Altar Takes",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.necrotic, { opacity: 0.65 });
  add("Winter Comes Down|Frostbite|Frost Breath|Frost Blast|Glacier|Rimebind|Whiteout|Deep Cold|Deathchill|Made of Ice|Numbing Cold|Chill in Reach",
    "jb2a.cast_generic.02.blue", SOUNDS.cold);
  add("The Water Rises|Undertow|Drag Under|The Caverns Wail",
    "jb2a.water_splash.circle.01.blue", "psfx.casting.water.001");
  add("Breath|Whelp Breath|Crowned in Fire|Hand of Thaurissan|Firestorm|Immolation|Deep Breath|Wrath of Ragnaros|Melt|Set Alight|Firebox|Call of Flame",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire);
  add("Felfire|Hellfire|Arrival|Infernal|Summon Hellcaller Guardian|Summon Voidwalker Guardian|Summon Imp Guardian|Send the Hounds|Call the Stranded",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire, { filter: "FEL_O" });
  add("Storm-Struck|Thunderhead|Storm Breath|Arcane Torrent",
    "jb2a.cast_generic.02.blue", SOUNDS.lightning, { filter: "AIR" });
  add("Arcane Breath|Reave the Ley|Arcane Lash|Arcane Storm|Arcane Explosion|Pull the Lever|Vent the Section|Obsidian Reservoir|Drain Mana|Counterspell|Spell Steal|Feedback|Class Call|Three Places at Once|Not Your Business|Elsewhere|Sent to a Room|Shadow Step|Step Aside",
    "jb2a.cast_generic.02.blue", SOUNDS.generic);
  // **EACH SHADOW AND MIND ABILITY ITS OWN PICTURE AND VOICE** (the bestiary audit, D-807).
  // Twenty-eight of these shared the Shadow school's restrained cast cue - one blue cast
  // darkened, one dissonant whisper - so Cho'gall's whispering god, Hakkar's blood and a night
  // elf melting into the dark all looked and sounded alike. Every cue still plays at the user
  // and never on a creature before its Test.
  add("Possession", "jb2a.smoke.plumes.01.grey", "psfx.incantations.whispers.fem.001.forward.standard.004",
    { filter: "DARK", scale: 0.6, opacity: 0.7 });
  add("The Whisper Answers", "jb2a.eyes.01.dark_green.many", "psfx.incantations.whispers.masc.001.forward.standard.007",
    { scale: 0.8 });
  add("Shadow Cleave", "jb2a.melee_attack.03.trail.01.pinkpurple", "psfx.weapon-swooshes.necrotic.v1.group01",
    { filter: "DARK", scale: 0.8 });
  add("Drain the Living", "jb2a.particles.inward.greenyellow.01.01", SOUNDS.necrotic,
    { filter: "PURPLE_G", scale: 0.7 });
  add("Shadow Lecture", "jb2a.toll_the_dead.green.shockwave", "psfx.cantrips.toll-the-dead.ominous-bell.001",
    { scale: 0.8 });
  add("Names You", "jb2a.icon.runes.orange", "psfx.incantations.masculine.002.demonic.harm.004",
    { filter: "FEL_O", scale: 0.5 });
  add("Blood of the Gurubashi", "jb2a.template_circle.symbol.normal.drop.red", "psfx.incantations.masculine.001.reverb.harm.001",
    { scale: 0.8 });
  add("Drain the Chamber", "jb2a.template_circle.aura.03.inward.002.complete.combined.blue", "psfx.incantations.masculine.002.reverb.harm.004",
    { filter: "SHADOW_B", scale: 0.8 });
  add("Speak for the God", "jb2a.markers.fear.dark_purple.02", "psfx.incantations.masculine.002.dry.harm.004",
    { scale: 0.8 });
  add("Blood for the Dreamer", "jb2a.liquid.splash_side02.red", "psfx.incantations.masculine.001.dry.harm.001",
    { scale: 0.5 });
  add("Shadow Fissure", "jb2a.impact.ground_crack.03.orange", SOUNDS.necrotic,
    { filter: "DARK", below: true, scale: 0.8 });
  add("Bind", "jb2a.markers.chain.standard.complete.02.red", "psfx.incantations.masculine.002.demonic.help.005",
    { filter: "FEL_R", scale: 0.6 });
  add("Sorrow", "jb2a.toll_the_dead.green.skull_smoke", "psfx.cantrips.toll-the-dead.rasping-whispers.001",
    { filter: "DARK", scale: 0.8 });
  add("Shadow Nova", "jb2a.arms_of_hadar.dark_purple", "psfx.1st-level-spells.arms-of-hadar.v1.001",
    { scale: 0.8 });
  add("The Bargain", "jb2a.condition.curse.01.012.red", "psfx.incantations.masculine.001.demonic.harm.001",
    { filter: "FEL_R", scale: 0.6 });
  add("Whispers", "jb2a.magic_signs.circle.02.enchantment.complete.dark_pink", "psfx.incantations.whispers.masc.001.forward.standard.002",
    { scale: 0.5 });
  add("Unseen", "jb2a.darkness.black", "psfx.2nd-level-spells.misty-step.v1.intro.generic",
    { scale: 0.4, opacity: 0.6 });
  add("Seduction", "jb2a.markers.heart.pink.01", "psfx.incantations.whispers.fem.001.forward.standard.001",
    { scale: 0.6 });
  add("True Fulfillment", "jb2a.magic_signs.circle.02.illusion.complete.purple", "psfx.cantrips.mind-sliver.v1",
    { scale: 0.6 });
  add("Hex the Loudest", "jb2a.condition.curse.01.001.red", "psfx.incantations.feminine.001.reverb.harm.007",
    { filter: "VOODOO_R", scale: 0.6 });
  add("Take the Mind", "jb2a.template_circle.symbol.normal.horror.purple", SOUNDS.psychic,
    { scale: 0.6 });
  add("Mask of the Loa", "jb2a.template_circle.symbol.normal.fear.dark_purple", "psfx.incantations.whispers.masc.001.forward.standard.009",
    { scale: 0.8 });
  add("Enfeeble", "jb2a.icon.shield_cracked.purple", "psfx.weapon-swooshes.psychic.v1.group01",
    { scale: 0.5 });
  add("Shadowmeld", "jb2a.extras.tmfx.inflow.circle.01", "psfx.2nd-level-spells.misty-step.v1.outro.generic",
    { filter: "SHADOW_B", scale: 0.5, opacity: 0.6 });
  add("Not There", "jb2a.misty_step.01.blue", "psfx.2nd-level-spells.misty-step.v1.complete.generic",
    { filter: "DARK", scale: 0.7 });
  add("Deliver Judgement|Hands On|Sermon|Raise Mograine|Healing Stream",
    "jb2a.cast_generic.02.blue", SOUNDS.bless1, { filter: "GOLD_B" });
  add("Thornmail|The Thorn Answers|Root the Ground|The Cavern Is Alive|Rooted|Shake the Roots|Stone Mends Stone|Fetish|Wake the Grove",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.boon);
  add("Ground Stroke|Stone Grip|Fissure|Landslide|Avalanche|Stoneform|Smash|Sweep the Hall|Grounding|Stoneskin|Tremor",
    "jb2a.impact.ground_crack.orange.02", SOUNDS.blunt, { filter: "EARTH", below: true });
  add("Coil|Second Coil|Bear Hug|Snaring Web|Ensnare|Grab|Seized|Devour|Knock Aside|Deathcharger's Trample|Thrash|Sweep|Sweep the Road|The Sun Overhead|Down the Wall|Fight Me|Hold Fast|Unstoppable|Throw the Axe|Sentinel Knock Away|Ring the Helm|Shield Slam|Disarm",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.blunt, { opacity: 0.5 });
  add("Bellow|Terrifying|Emperor's Command|Break Them|Make an Example|A Price on Everything|Raise Alarm|Calls the Watch|Orders|Hold at Bay|Righteous Fury|Vengeance|Fallen-Kin Rage|Endurance|Will of the Forsaken|Red Mask",
    "jb2a.cast_generic.sound.01.pinkteal", SOUNDS.boon, { filter: "DESATURATE" });
  add("Fuse|Last Delivery|Goblin-Built|Field Repair|Makes It Work|Ejector Seat",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.generic, { scale: 0.45 });
  add("Raise the Warren|Raise the Fallen|Wake the Guardians|Call the Pack|Call the Warren|Call the Steps|Twilight Rite|Open the Gate|The Class Recites|Call the Crew|The Forge Answers|The Priests Chant|The Attendants|The Court Attends|Call the House|The Dead Sit Up|The Experiment|Whelps|The Highborne Attend|Sons of the Flame|The Spire Answers|Call the Vilebranch|Call the Amani|Raise the Dead|Searing Totem",
    "jb2a.cast_generic.02.blue", SOUNDS.strands, { opacity: 0.6 });
  // The attack card owns hit/miss and plays its actual weapon form. This is a
  // quiet wind-up on the creature, never an impact on an unconfirmed victim.
  add("Cleave the Line|Cut and Turn|Breaks the Line|Shrieking Dive|Glaive Bounce|Maul|Sentinel Mortal Strike|Serrated Bite|Death Roll|Elder Thrash|Mortal Strike|Couched|From Above|Sweeping Tail|Whirlwind",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.swingHeavy, { scale: 0.4, opacity: 0.35 });
  add("Burrower|Bolts|A Way Out|Cut and Run|Sneak|Bounds Away|Wing Buffet",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.gust, { scale: 0.4, opacity: 0.25 });
  add("Sacrifice|Mana Tide|Windfury",
    "jb2a.cast_generic.02.blue", SOUNDS.boon, { opacity: 0.6 });
  quiet("Any School|Winged|Aura of Despair|Gore|Overwhelming Response|Never Halts|Guild Discipline|Tracks Magic|Fel-shod|Pack Law|Cut the Cord|Defenseless|Moonlit|Held by the Pylons|The Dream Beneath|Grave Chill|Ogre Law|The Family Name|The Council's Voice|Killing Stroke|Ten Thousand Years of Practice|At Sundown|Flanker|Warchief in His Own Hall|Steady|Loose Bones|Owl at Watch|Lifts Anything|Great Frame|Hold the Line|From Cover|Under Everything|Force of Nature|The Den Holds Him|Reads the Field|Plague-Marked|Pack Frenzy|Hallowed Step|Charger's Blessing|Reads the Ground|Immovable|Waits|Crushridge Kin|Named Quarry|Strong Swimmer|Carries It Anyway|In the Walker|The Headmaster|The Inquisition",
    "Standing trait, encounter setup, or conditional rule; no discrete audiovisual action. Its ordinary movement, strike or effect owns any presentation.");
  quiet("Sure Footed|Keen Sight|Amphibious|Locked Shields|Watchful Heads|Fire and Arcane Reflection|Shadow and Frost Reflection|Titan-Wrought|Talks to the Absent|Unyielding Stone|Wild Regrowth|Unbound|Weight of Numbers|Unyielding Flame|Keen Senses|Blood Rage|Living Flame|Curse of the Bleakheart|Scavenger|Regeneration|Two Heads|Aquatic|Hunter Senses|Maddened|Strong Swimmer|Call for Kin|Island Blood|Backstab|Made of Air|Made of Stone|Paranoia|Never Tires|Made of Fire|Wall-Walker|Laughs|Runs Until Stopped|Night Hunter|Made of Wood|The Master's Voice|Dark-Adapted|Extra Attack|Shifting Aggression|Living Water|Fluid Body|Intruder Scanner|Walks the Rows|Many Eyes|Scourge Tenacity|Multiattack (Double Attack)|Netherborn|Unyielding Waters|Submerged|Scent of the Tainted|Shifting Body|Living Spray|Voodoo Mask|Wanders|The Prophet's Mouth|Unyielding Storm|Stone Body|Tainted Water|Contact Detonation|Living Wind|Unwavering|Made of Water",
    "Inherent passive anatomy, sense, immunity, modifier, or conditional trigger. No manual Use animation; the actual attack, damage, movement or triggered effect presents its outcome.");
  // These creature abilities cast through the spell workflow; its spell row
  // owns both animation and sound, avoiding a second unrelated cast cue.
  quiet("Ice Shield|Hailstorm|Mana Burn", "Delegated to the named spell's animation and sound through the spell workflow.");
  quiet("Ancient Special", "Encounter setup chooses a special; the selected special's own use supplies its animation and sound.");
  // Read off the bite that wounds and never pressed (the bestiary audit, D-807): its own door
  // posts `ability:devour-magic-result` when the drain or the Silence lands.
  quiet("Devour Magic", "Read off the bite that wounds, never pressed: its own door plays the devour-magic-result cue once the drain or the Silence lands.");
  // **ANNOUNCED, AND NOT AN ATTACK** (D-807): what these do is the table's, so each plays at the
  // creature alone. The Troll Berserker's Berserk is its Half-Action shell; the rest announce.
  add("Unholy Command", "jb2a.magic_signs.circle.02.necromancy.complete.dark_green", "psfx.incantations.masculine.001.reverb.help.002",
    { scale: 0.6 });
  add("Sell Them Out", "jb2a.markers.skull.dark_orange.01", "psfx.incantations.whispers.masc.001.forward.standard.005",
    { scale: 0.5 });
  add("Amani Fury", "jb2a.on_token_buff.001.001.purplered", "psfx.creature.dragons.roar.small",
    { scale: 0.6 });
  add("Berserk", "jb2a.on_token_buff.001.001.orangeyellow", "psfx.creature.dragons.roar.small",
    { filter: "BLOOD_RAGE", scale: 0.5, opacity: 0.8 });
  // A reroll of a failed Test, never a second blow (D-807): a glint at the sellsword.
  add("Veteran", "jb2a.glint.yellow.few", SOUNDS.boon, { scale: 0.5, opacity: 0.7 });
  add("Gyth Takes the Air", "jb2a.swirling_feathers.outburst.01.textured", "psfx.creature.movement.flight.wings.small",
    { scale: 0.8, opacity: 0.7 });
  add("The Dead Attend", "jb2a.magic_signs.circle.02.necromancy.complete.green", "psfx.incantations.masculine.001.reverb.summon.003",
    { below: true, scale: 0.9, opacity: 0.7 });
  quiet("Mana Tide|Firebox|Call of Flame|Feedback|Bounds Away|Stoneskin|Tremor|Windfury|Made of Ice|The Traitor's Due",
    "Standing aura, attack rider, passive movement permission or encounter condition; no discrete Use event. Present through its actual resolved action, not a fabricated cast.");
  // Explicitly opted-in prose announcements. The runtime posts the description
  // and source cue only; the GM resolves the prose and no outcome is automated.

  // Summoning is a call at the summoner, never an invented creature or an arrival
  // at an unrecorded point. Families differ in silhouette, colour and sound.
  const call = (names, asset, sound, options = {}) => add(names, asset, sound,
    { below: true, scale: 0.85, opacity: 0.7, ...options });
  call("Raise the Warren|Raise the Fallen|Open the Gate|The Class Recites|The Dead Sit Up|Raise the Dead",
    "jb2a.energy_strands.in.green.01", SOUNDS.necrotic, { filter: "DARK" });
  call("Wake the Guardians|The Forge Answers",
    "jb2a.ground_cracks.01.orange", SOUNDS.blunt, { filter: "EARTH" });
  call("Sons of the Flame|Infernal|Searing Totem",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire);
  call("Twilight Rite|The Experiment|The Highborne Attend",
    "jb2a.particle_burst.01.rune.bluepurple", SOUNDS.strands);
  call("Summon Hellcaller Guardian|Summon Voidwalker Guardian|Summon Imp Guardian|Send the Hounds|Call the Stranded",
    "jb2a.energy_strands.in.green.01", "psfx.incantations.masculine.001.demonic.summon.003", { filter: "FEL_B" });
  call("Wake the Grove|Call the Warren|Call the Pack|Whelps",
    "jb2a.particles.swirl.greenyellow.01.01", SOUNDS.gust);
  call("Call the Steps|Call the Crew|The Priests Chant|The Attendants|The Court Attends|Call the House|The Spire Answers|Call the Vilebranch|Call the Amani",
    "jb2a.cast_generic.sound.01.pinkteal", SOUNDS.boon, { filter: "DESATURATE", below: false });

  // Healing Stream is water/Nature, not the Light. Rock closes into Theradras;
  // the two parasitic heals draw inward rather than blessing their recipients.
  add("Healing Stream", "jb2a.healing_generic.03.burst.bluegreen", "psfx.casting.water.001");
  add("Stone Mends Stone", "jb2a.ground_cracks.01.orange", SOUNDS.blunt,
    { filter: "EARTH", below: true, scale: 0.9, fadeOut: 600 });
  add("Hands On", "jb2a.healing_generic.200px.yellow", "psfx.1st-level-spells.cure-wounds.v1.001");
  add("Soulflay|Feed", "jb2a.energy_strands.in.green.01", SOUNDS.necrotic,
    { filter: "DARK", scale: 0.8 });

  // The web flies to the recorded aim point; it never wraps a victim before a
  // result exists. The axe borrows the actual handaxe silhouette and flies it;
  // the free library has no thrown-axe projectile (same stand-in law as strikes).
  add("Snaring Web", "jb2a.web.01", "psfx.1st-level-spells.entangle.vines.v1.001.intro",
    { place: "source>target", travel: "move", scale: 0.25 });
  add("Throw the Axe", "jb2a.handaxe.melee.standard.white", SOUNDS.swingHeavy,
    { place: "source>target", travel: "move", scale: 0.5, spin: 720 });
  add("Ensnare", "jb2a.web.02", SOUNDS.swingLight,
    { place: "source>target", travel: "move", scale: 0.3 });
  add("Thornmail|The Thorn Answers|Root the Ground|The Cavern Is Alive|Rooted|Shake the Roots",
    "jb2a.entangle.02.complete.02.green", "psfx.1st-level-spells.entangle.vines.v1.001.intro",
    { scale: 0.5, below: true });
  add("Fuse|Last Delivery", "jb2a.cast_generic.fire.01.orange", SOUNDS.fire,
    { scale: 0.25, opacity: 0.8 });
  add("Burrower", "jb2a.ground_cracks.01.orange", SOUNDS.blunt,
    { filter: "EARTH", below: true, scale: 0.55 });
  add("Burrower", "jb2a.smoke.puff.centered.grey", "psfx.creature.movement.burrow.breach",
    { below: true, scale: 0.8 });
  add("Field Repair|Makes It Work", "jb2a.swirling_sparkles.01.blue", "psfx.cantrips.mending.v1.001.with-cast",
    { scale: 0.4 });
  add("Gut Spill", "jb2a.liquid.splash02.red", "psfx.cantrips.poison-spray.v1",
    { scale: 0.7, opacity: 0.8 });
  add("Blightcloud|Plague Slick|Grave Plague", "jb2a.smoke.puff.centered.grey", "psfx.cantrips.poison-spray.v1",
    { filter: "VENOM_B", scale: 0.8, opacity: 0.65 });
  add("Venom|Ravenholdt Venom", "jb2a.liquid.blob.blue", "psfx.cantrips.acid-splash.v1",
    { filter: "VENOM_B", scale: 0.25 });
  add("Winter Comes Down|Glacier|Whiteout", "jb2a.side_impact.part.slow.snowflake.blue", "psfx.cantrips.ray-of-frost.v1",
    { scale: 0.8 });
  add("Bellow|Terrifying|Fight Me", "jb2a.cast_generic.sound.01.pinkteal", "psfx.creature.dragons.roar.small",
    { filter: "DESATURATE", scale: 0.85 });
  add("Wing Buffet", "jb2a.smoke.puff.ring.01.white", "psfx.creature.movement.flight.wings.small",
    { opacity: 0.45, scale: 0.9 });
  add("Whirlwind", "jb2a.melee_generic.whirlwind.01.orange", SOUNDS.swingHeavy,
    { filter: "DESATURATE", scale: 0.8, opacity: 0.45 });
  add("Ground Stroke|Stone Grip|Fissure|Landslide|Avalanche", "jb2a.ground_cracks.01.orange", "psfx.casting.earth.001",
    { filter: "EARTH", below: true, scale: 0.8 });
  add("Frost Breath|Arcane Breath|Breath|Whelp Breath", "jb2a.smoke.puff.side.02.white", "psfx.creature.dragons.attacks.breath.small.cold",
    { scale: 0.4, opacity: 0.6 });
  add("Deep Breath", "jb2a.cast_generic.fire.01.orange", "psfx.creature.dragons.attacks.breath.small.fire",
    { scale: 0.9 });
  add("Storm Breath", "jb2a.swirling_sparkles.01.blue", SOUNDS.lightning,
    { scale: 0.5 });

  // Region geometry is authoritative. Breaths never guess direction from the
  // currently selected target, and no cue paints a successful wound or restraint.
  const breath = (name, asset, sound, place, options = {}) => {
    const key = `ability:${slug(name)}`;
    rows[key] = { cues: [...rows[key].cues, cue("region", [
      fx(asset, { place, travel: "stretch", ...options }), snd(sound, { volume: 0.55 })
    ])] };
  };
  // Generic flight breaths retain an uncoloured air silhouette: their stored
  // ability does not identify a school and the recipe must not guess one.
  breath("Breath", "jb2a.breath_weapons.cold.cone.blue", SOUNDS.gust, "region-cone", { filter: "AIR" });
  breath("Whelp Breath", "jb2a.breath_weapons.cold.cone.blue", SOUNDS.gust, "region-cone", { filter: "AIR" });
  breath("Frost Breath", "jb2a.breath_weapons.cold.cone.blue", SOUNDS.cold, "region-cone");
  breath("Arcane Breath", "jb2a.breath_weapons.cold.cone.blue", SOUNDS.strands, "region-cone", { filter: "PURPLE_B" });
  breath("Deep Breath", "jb2a.breath_weapons.fire.line.orange", SOUNDS.fire, "region-line");
  breath("Storm Breath", "jb2a.breath_weapons.lightning.line.blue", SOUNDS.lightning, "region-line");
  add("Named Quarry", "jb2a.cast_generic.02.blue", SOUNDS.boon,
    { scale: 0.45, opacity: 0.5 });
  return Object.freeze(rows);
}
