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
  // play off the same rows below. Four of 14's Boss Actions are announced again (D-1780): the
  // GM lands what they do from the card, and the point is spent at the press (O-628).
  "Ejector Seat", "Mark of Frost", "Reflection", "Corrupted Blood", "Shadow Flame"
]);

/** Prose geometry only: the GM still places the area and resolves its effects. */
export const CREATURE_PRESENTATION_AREAS = Object.freeze({
  "ability:breath": "30 ft cone", "ability:frost-breath": "20 ft cone",
  "ability:whelp-breath": "10 ft cone",
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
  add("Gut Spill|Blightcloud|Venom|Fevered Bite|Plague Slick|Grave Plague|Ravenholdt Venom|The Altar Takes|Poison Cloud|Disease Cloud",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.necrotic, { opacity: 0.65 });
  add("Winter Comes Down|Frostbite|Frost Breath|Frost Blast|Glacier|Rimebind|Whiteout|Deep Cold|Deathchill|Made of Ice|Numbing Cold|Chill in Reach|Mark of Frost",
    "jb2a.cast_generic.02.blue", SOUNDS.cold);
  add("The Water Rises|Undertow",
    "jb2a.water_splash.circle.01.blue", "psfx.casting.water.001");
  add("Breath|Whelp Breath|Crowned in Fire|Hand of Thaurissan|Firestorm|Immolation|Deep Breath|Wrath of Ragnaros|Melt|Set Alight|Firebox|Call of Flame",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire);
  add("Felfire|Hellfire|Arrival|Infernal|Inferno|Summon Hellcaller Guardian|Summon Voidwalker Guardian|Summon Imp Guardian|Send the Hounds|Call the Stranded",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire, { filter: "FEL_O" });
  add("Storm-Struck|Thunderhead|Storm Breath|Arcane Torrent",
    "jb2a.cast_generic.02.blue", SOUNDS.lightning, { filter: "AIR" });
  add("Arcane Storm|Arcane Explosion|Arcane Vacuum|Reflection|Vent the Section|Obsidian Reservoir|Drain Mana|Counterspell|Spell Steal|Feedback|Class Call|Three Places at Once|Sent to a Room|Shadow Step|Step Aside",
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
  add("Corrupted Blood", "jb2a.template_circle.symbol.normal.drop.red", "psfx.incantations.masculine.001.reverb.harm.001",
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
  add("Thornmail|The Thorn Answers|Root the Ground|Rooted|Shake the Roots|Stone Mends Stone|Fetish|Wake the Grove",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.boon);
  add("Ground Stroke|Stone Grip|Fissure|Landslide|Avalanche|Stoneform|Smash|Sweep the Hall|Grounding|Stoneskin|Tremor|Dust Field|Thundercrack|War Stomp|Head Butt",
    "jb2a.impact.ground_crack.orange.02", SOUNDS.blunt, { filter: "EARTH", below: true });
  add("Coil|Bear Hug|Snaring Web|Ensnare|Grab|Seized|Knock Aside|Deathcharger's Trample|Thrash|Sweep|Sweep the Road|The Sun Overhead|Down the Wall|Fight Me|Hold Fast|Unstoppable|Sentinel Knock Away|Ring the Helm|Shield Slam|Disarm",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.blunt, { opacity: 0.5 });
  add("Bellow|Terrifying|Emperor's Command|Break Them|Make an Example|A Price on Everything|Raise Alarm|Calls the Watch|Orders|Hold at Bay|Righteous Fury|Vengeance|Fallen-Kin Rage|Endurance|Will of the Forsaken|Red Mask|The Bear Roars|Repulsive Gaze",
    "jb2a.cast_generic.sound.01.pinkteal", SOUNDS.boon, { filter: "DESATURATE" });
  add("Fuse|Last Delivery|Goblin-Built|Field Repair|Makes It Work|Ejector Seat",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.generic, { scale: 0.45 });
  add("Raise the Warren|Raise the Fallen|Wake the Guardians|Call the Pack|Call the Warren|Call the Steps|Twilight Rite|Open the Gate|The Class Recites|Call the Crew|The Forge Answers|The Priests Chant|The Attendants|The Court Attends|Call the House|The Dead Sit Up|The Experiment|Whelps|The Highborne Attend|Sons of the Flame|The Spire Answers|Call the Vilebranch|Call the Amani|Raise the Dead|Searing Totem|Activate Bombs|Serpent Ward",
    "jb2a.cast_generic.02.blue", SOUNDS.strands, { opacity: 0.6 });
  // The attack card owns hit/miss and plays its actual weapon form. This is a
  // quiet wind-up on the creature, never an impact on an unconfirmed victim.
  add("Cleave the Line|Cut and Turn|Breaks the Line|Shrieking Dive|Glaive Bounce|Maul|Sentinel Mortal Strike|Serrated Bite|Death Roll|Elder Thrash|Mortal Strike|Gordok Mortal Strike|Couched|From Above|Sweeping Tail|Whirlwind",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.swingHeavy, { scale: 0.4, opacity: 0.35 });
  add("Burrower|Bolts|A Way Out|Cut and Run|Sneak|Bounds Away|Wing Buffet",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.gust, { scale: 0.4, opacity: 0.25 });
  add("Sacrifice|Mana Tide|Windfury",
    "jb2a.cast_generic.02.blue", SOUNDS.boon, { opacity: 0.6 });
  quiet("Any School|Shapes of the Loa|The Failures Rise|Winged|Aura of Despair|Gore|Overwhelming Response|Never Halts|Guild Discipline|Tracks Magic|Fel-shod|Pack Law|Cut the Cord|Defenseless|Moonlit|Held by the Pylons|The Dream Beneath|Grave Chill|Ogre Law|The Family Name|The Council's Voice|Killing Stroke|Ten Thousand Years of Practice|At Sundown|Flanker|Warchief in His Own Hall|Steady|Loose Bones|Owl at Watch|Lifts Anything|Great Frame|Hold the Line|From Cover|Under Everything|Force of Nature|The Den Holds Him|Reads the Field|Pack Frenzy|Hallowed Step|Charger's Blessing|Reads the Ground|Immovable|Waits|Crushridge Kin|Named Quarry|Strong Swimmer|Carries It Anyway|In the Walker|The Headmaster|The Inquisition",
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
  // creature alone. The rest announce; the Troll Berserker's Berserk is a Half-Action that lays
  // Amani Fury's Boons for the encounter since D-811, and its cue still plays at the berserker.
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
  add("Soulflay|Feed|Cannibalize", "jb2a.energy_strands.in.green.01", SOUNDS.necrotic,
    { filter: "DARK", scale: 0.8 });
  // D-1758, D-1759: Nefarian's two-school cone and the Nightmare's stun, each at the Boss.
  add("Shadow Flame", "jb2a.cast_generic.fire.01.orange", SOUNDS.fire, { filter: "DARK" });
  add("Naralex's Nightmare", "jb2a.sleep.symbol.dark_pink", SOUNDS.psychic, { scale: 0.6 });

  // The web flies to the recorded aim point; it never wraps a victim before a
  // result exists. The axe borrows the actual handaxe silhouette and flies it;
  // the free library has no thrown-axe projectile (same stand-in law as strikes).
  add("Snaring Web", "jb2a.web.01", "psfx.1st-level-spells.entangle.vines.v1.001.intro",
    { place: "source>target", travel: "move", scale: 0.25 });
  add("Ensnare", "jb2a.web.02", SOUNDS.swingLight,
    { place: "source>target", travel: "move", scale: 0.3 });
  add("Thornmail|The Thorn Answers|Root the Ground|Rooted|Shake the Roots",
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
  // The Wolf's Plague-Marked states Grave Plague's Test since D-1789, and takes its picture.
  add("Blightcloud|Plague Slick|Grave Plague|Plague-Marked", "jb2a.smoke.puff.centered.grey", "psfx.cantrips.poison-spray.v1",
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
  add("Frost Breath|Breath|Whelp Breath", "jb2a.smoke.puff.side.02.white", "psfx.creature.dragons.attacks.breath.small.cold",
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
  breath("Deep Breath", "jb2a.breath_weapons.fire.line.orange", SOUNDS.fire, "region-line");
  breath("Storm Breath", "jb2a.breath_weapons.lightning.line.blue", SOUNDS.lightning, "region-line");
  add("Named Quarry", "jb2a.cast_generic.02.blue", SOUNDS.boon,
    { scale: 0.45, opacity: 0.5 });
  // A moving mesh announces the throw; it does not wrap a target before its save.
  add("Trapper Net", "jb2a.web.02", SOUNDS.swingLight,
    { place: "source>target", travel: "move", scale: 0.3 });
  rows["ability:trapper-net"].standIn = "The installed web mesh stands in for a thrown rope net.";
  quiet("Gift of Ragnaros", "Standing Damage Rating bonus; the rifle shot and melee impact carry its presentation.");
  add("Sprite Poison", "jb2a.particles.outward.greenyellow.01.01", SOUNDS.necrotic,
    { scale: 0.35, opacity: 0.65 });
  add("Raise Bone Guardian", "jb2a.cast_generic.02.blue", SOUNDS.necrotic,
    { opacity: 0.55 });
  add("Call Aqua Guardian", "jb2a.water_splash.circle.01.blue", "psfx.casting.water.001",
    { scale: 0.5 });
  add("Thrown Bomb", "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.swingLight,
    { opacity: 0.35 });
  rows["ability:thrown-bomb"].cues.push(cue("region", [
    fx("jb2a.cast_generic.fire.01.orange", { place: "region", scale: 0.6 }),
    snd(SOUNDS.fire, { volume: 0.5 })
  ]));



  // **THE 902-ENTRY BESTIARY** (D-1825): every ability and Boss Action label the 526 new blocks
  // print, and the eleven an older block gained, by the look its author proposed in the P01 to P19
  // handoffs, matched on the RENAMED label (D-1813, D-1817). One row a label; a label with a Use
  // plays a restrained cue at the creature through the families above, and a label with nothing
  // to press (automation kind none or passive) is quiet with its reason.
  // A quiet wind-up at the creature; the attack card plays each blow's own form and its hit.
  add(
    "Alpha Strike|Alzzin Mangle|Anger'rel Sunder Armor|Angerforge Sunder Armor|Anub'Rekhan Impale|"
    + "Argent Bulwark|Avatar Lash|Barthilas Crowd Pummel|Barthilas Mighty Blow|Bloodseeker Bats|"
    + "Bloody Strike|Bone Crush|Broodlord Mortal Strike|Brute Strike|Buru Gorge|Chromaggus Frenzy|"
    + "Coiling Strike|Covering Fire|Crushing Weight|Crypt Scarabs|Deep Puncture|Demolish|Dextren Strike|"
    + "Dismember|Distracting Pain|Dope'rel Sinister Strike|Drag Away|Drag Under|"
    + "Dustwraith Sinister Strike|Elite Guard Mortal Strike|Eviscerator Vicious Rend|Execute|"
    + "Fankriss Entangle|Fatal Bite|Fengus Strike|Firegut Strike|First Blood|Flayer Thrash|Flurry|"
    + "Flurry of Blades|Frenzied Hacking|Gahz'ranka Thrash|Galvangar Mortal Strike|Garrote|Gash|"
    + "Glass Edge|Gloom'rel Hamstring|Gloom'rel Mortal Strike|Goraluk Head Crack|Goraluk Strike|"
    + "Gordok Backhand|Gorosh Mortal Strike|Grebmar Pummel|Grog-soaked Blade|Guard the Eggs|"
    + "Guard the Litter|Gutchewer's Bite|Halycon Rend|Halycon Thrash|Hamstring|Harvesting Strike|"
    + "Hate'rel's Strike|Hateful Strike|Heroic Strike|Highlord's Judgement|Hold the Ledge|"
    + "Hungering Bite|Iron Blow|Iron Stride|Ironfur Swipe|Joint the Carcass|Krastinov Backhand|"
    + "Kri Thrash|Kurinnaxx Thrash|Kurinnaxx Wide Slash|Loose the Pack|Lowered Horns|Magmadar Frenzy|"
    + "Mangle|Many Heads|Monk Thrash|Mortal Cleave|Nightcrawler Backstab|Open the Wound|Out of the Dark|"
    + "Play Time|Prowler's Thrash|Purged by Pain|Purify the Infidel|Quick Blades|Rake|Ramstein Flurry|"
    + "Rattlegore Strike|Ravage|Ravenous Strike|Razorlash Thrash|Razuvious Unbalancing Strike|"
    + "Reaver's Strike|Red Rage|Renataki Gouge|Renataki Thrash|Rend Flesh|Retaliation|Revenge|"
    + "Ride Them Down|Royal Cleave|Rupture|Ruuzlu Cleave|Sartura Frenzy|Scalp Slash|Scything Pass|"
    + "Shank and Twist|Shard Burst|Shardtooth Maul|Shell Ram|Shred the Green|Slavener's Lunge|"
    + "Slayer Hamstring|Smite Thrash|Snap|Speed Slash|Stone Wings|Stoop|Strike|Strike of the Martyr|"
    + "Strike of the Seven|Sundering Cleave|Tail Lash|Targorr Thrash|The Baron's Guard|The Larder Door|"
    + "Thorn Puncture|Timmy Thrash|Titan's Reach|Trampling Roots|Twin Cuts|Unbalancing Strike|Undermine|"
    + "Urok Strike|Vaelastrasz Tail Swipe|Verek's Thrash|Voone Mortal Strike|Voone Thrash|Willey Pummel",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.swingHeavy, { scale: 0.4, opacity: 0.35 });
  // A shove, a knock, a spin or a disarm: a pulse at the creature, never a victim moved before its Test.
  add(
    "Anvilrage Disarm|Arcing Smash|Arlokk Whirlwind|Backhand|Bash Aside|Battleguard Slam|"
    + "Bly Shield Bash|Broodlord Knock Away|Bulldoze|Chromatic Knockdown|Crowd Pummeler Arcing Smash|"
    + "Deepfury Shield Slam|Defender Shield Bash|Drek'Thar Whirlwind|Earthen Guardian Whirlwind|"
    + "Fineous Kick|Force Punch|Galvangar Whirlwind|Gladiator Uppercut|Gloom'rel Cleave|"
    + "Gnarlpine Whirlwind|Goraluk Backhand|Gorosh Whirlwind|Gouge|Greenskin Cleave|Grizzle Cleave|"
    + "Herod Whirlwind|Hive'Ashi Cripple|Hive'Ashi Disarm|Hive'Zora Knockdown|Incendius Mighty Blow|"
    + "Into the Cell|Ironaya Knock Away|Jaw Trap|Jed Shield Bash|Kirtonos Disarm|Knockdown|Knockout|"
    + "Kreeg Whirlwind|Kul Tiras Marine Shield Bash|Landslide Knock Away|Lasher Punt|Lasher Whirlwind|"
    + "Left for Dead|Loro Shield Slam|Mandokir Whirlwind|Mauler Backhand|Mol'dar Shield Bash|Monk Kick|"
    + "Noxxion Uppercut|Olaf Shield Slam|Omokk Knock Away|Ouro Sweep|Phalanx Mighty Blow|"
    + "Rattlegore Knock Away|Ravenian Knock Away|Reaping Cleave|Reaping Sweep|Rending Pincers|Run Down|"
    + "Runeblade Sweep|Sartura Whirlwind|Shield Bash|Slip'kik Shield Bash|Snap Kick|Snapping Lunge|"
    + "Sneed Disarm|Spined Hide|Stonespine Vicious Rend|Storm Bolt|Swashbuckler Disarm|Sweeping Blow|"
    + "Sweeping Strikes|Syndicate Thief Disarm|Tail Sweep|Theradrim Knockdown|Thousand Blades|Throw Axe|"
    + "Uppercut|Vek'nilash Uppercut|Vem Knock Away|Vem Knockdown|Welcome to the Stockade|Wide Slash|"
    + "Willey Knock Away",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.blunt, { opacity: 0.5 });
  // A stomp, a slam, a trample or a shockwave: the ground cracks under the creature.
  add(
    "Agathelos Rampage|Atal'alarion Ground Tremor|Claw Tentacle|Commander's War Stomp|Crowd Pummel|"
    + "Crowd Pummeler Trample|Deeprot Stomp|Defender Thunderclap|Earthshaker|Eranikus War Stomp|"
    + "Frostwolf Knockdown|Gahz'ranka Slam|Gahz'rilla Slam|Geolord's Tremor|Ghamoo-ra Trample|"
    + "Golemagg's Earthquake|Gri'lek Ground Tremor|Grizzle Ground Tremor|Ground Rupture|"
    + "Guardian Thunderclap|Gurubashi Thunderclap|Ironaya War Stomp|Kazzak Thunderclap|Kreeg War Stomp|"
    + "Landslide Trample|Magmus War Stomp|Me Smash|Meshlok War Stomp|Moam Trample|Ossirian Stomp|"
    + "Overlord's Thunderclap|Patchwork Stomp|Phalanx Thunderclap|Ramstein Trample|Rattlegore War Stomp|"
    + "Ravenian Trample|Razorgore War Stomp|Rhahk'Zor Slam|Roccor Ground Tremor|Smite Slam|Smite Stomp|"
    + "Solakar War Stomp|Sweeping Slam|Tendris Trample|The Architect's Weight|Thunder in the Stone|"
    + "Thunderclap|Thundercrash|Trample the Line|Vanndar Thunderclap|Vault Warder Trample|"
    + "Wyrmthalak Sweeping Slam|Zolo Thunderclap",
    "jb2a.impact.ground_crack.orange.02", SOUNDS.blunt, { filter: "EARTH", below: true });
  // A charge, a leap, a pounce or a dive: a gust as it sets off; the move draws itself.
  add(
    "Berserker Charge|Blackhand Charge|Blind Hunter Out of the Dark|Boar Charge|Bowl Over|"
    + "Cleaving Charge|Cloven Rush|Conqueror's Charge|Cut and Reload|Eric Rushing Charge|Ferra's Charge|"
    + "Galak Marauder Rushing Charge|Grinding Step|Hedrum Crazed|Herod Rushing Charge|Into the Dust|"
    + "Jeklik Swoop|Leaping Rush|Mandokir Charge|Matriarch's Stampede|Off the Ledge|Pounce|"
    + "Pridewing Dive|Reed Pounce|Savannah Charge|Sentry Charge|Shield Charge|Step and Strike|Swoop|"
    + "Vem Charge",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.gust, { scale: 0.4, opacity: 0.25 });
  // Wings beat: Wing Buffet's ring of air.
  add(
    "Dreamscythe Wing Flap|Ebonroc Wing Buffet|Firemaw Wing Buffet|Flamegor Wing Buffet|"
    + "Hazzas Wing Flap|Morphaz Wing Flap|Weaver Wing Flap|Wing Flap",
    "jb2a.smoke.puff.ring.01.white", "psfx.creature.movement.flight.wings.small", { opacity: 0.45, scale: 0.9 });
  // A shield raised or a guard taken: a grey shield flares once at the creature.
  add(
    "Anger'rel Shield Wall|Anvilrage Shield Block|Blaumeux Shield Wall|Close the Way|"
    + "Deepfury Shield Wall|Evasion|Improved Blocking|Korth'azz Shield Wall|Mograine Shield Wall|"
    + "Shield the Others|Warder Shield Block|Zeliek Shield Wall",
    "jb2a.shield.01.intro.blue", SOUNDS.blunt, { filter: "DESATURATE", scale: 0.5, opacity: 0.6 });
  // A shot or a volley loosed: the bowstring at the creature; the attack card plays the missile.
  add(
    "Concussive Shot|Illyanna Multi-Shot|Loose|Multi-Shot|Stone Volley|Taskmaster Piercing Shot|"
    + "Volley|Vyletongue's Volley",
    "jb2a.extras.tmfx.inpulse.circle.01.normal", SOUNDS.longbow, { scale: 0.4, opacity: 0.35 });
  // A flier lands hard: the ground cracks where it comes down.
  add(
    "Earthen Landing",
    "jb2a.impact.ground_crack.orange.02", "psfx.creature.movement.flight.landing.impact.small", { filter: "EARTH", below: true });
  // A burrower goes under: Burrower's breach.
  add(
    "Ouro Burrow",
    "jb2a.smoke.puff.centered.grey", "psfx.creature.movement.burrow.breach", { below: true, scale: 0.8 });
  // A web or a net flies to the recorded aim; it never wraps a victim before the result.
  add(
    "Darkmist Web|Electrified Net|Enveloping Web|Gelihast Net|Hatecrest Net|Hooked Net|Net|"
    + "Strike from the Web|The Web Feeds|Web Lash|Web Snare|Weighted Net",
    "jb2a.web.02", SOUNDS.swingLight, { place: "source>target", travel: "move", scale: 0.3 });
  // A burst or a spray of web around the creature.
  add(
    "Encasing Webs|Enveloping Webs|Hedrum Web Explosion|Maexxna Web Spray|Web Explosion|Web Spray",
    "jb2a.web.01", "psfx.1st-level-spells.entangle.vines.v1.001.intro", { scale: 0.5, opacity: 0.8 });
  // A smoke bomb breaks at the creature's feet.
  add(
    "Smoke Bomb|Thredd Smoke Bomb|Vyletongue Smoke Bomb",
    "jb2a.smoke.puff.centered.grey", "psfx.2nd-level-spells.misty-step.v1.intro.generic", { scale: 0.9, opacity: 0.8 });
  // Fire at the creature: the restrained fire cast.
  add(
    "Ambassador's Fire Blast|Ambassador's Fireball|Armageddon|Ashes of the Order|Aura of Flames|"
    + "Barov Fire|Beastmaster Exploding Shot|Brimstone Fall|Broodlord Blast Wave|Burning Adrenaline|"
    + "Burning Core|Burning Hammer|Burning Spirits|Burning Winds|Captain's Ignite|Chromaggus Incinerate|"
    + "Curse of the Elemental Lord|Defender Meteor|Destroyer Fireball Volley|Detonation|"
    + "Drakkisath Conflagration|Emberseer Fire Nova|Emberseer Flame Buffet|Envoy's Flame|Eruption|"
    + "Explode Bug|Feed the Flames|Fiery Burst|Fire Blast|Fire on the Shelves|Fire Storm|"
    + "Firemaw Flame Buffet|Firesworn Immolation|Flame Lash|Flame Spear|Flame Spike|Flamebreak|"
    + "Flamegor Fire Nova|Geddon Living Bomb|Geddon's Inferno|Goblin Dragon Gun|Golemagg Pyroblast|"
    + "Golemagg's Magma Splash|Gout of Flame|Guardian Meteor|Guardian's End|Hand of Ragnaros|"
    + "Heat of the Gate|Ignite Flesh|Ignite Mana|Immolation Trap|Korth'azz Meteor|Lava Bomb|"
    + "Magma Shackles|Magma Spit|Magma Splash|Mana Fire|Mark of Detonation|Melt Ore|Molten Blast|"
    + "Molten Metal|Nova of Cinders|Patrol Heat|Phalanx Fireball Volley|Pillar of Flame|Pyre of Bones|"
    + "Razorgore Conflagration|Razorgore Fireball Volley|Runes Flare|Satchel Bomb|Searing Splash|"
    + "Searing Wave|Servant's Fall|Shock in Hand|Soul Burn|Stun Bomb|Surge|Taragaman Fire Nova|"
    + "The Fire Eye|Torch Burst|War Rides|Warder Fire Nova|Warder Flame Lash|Wyrmkin Fireball Volley",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire);
  // Fel fire at the creature.
  add(
    "Dazzling Lights|Winterfall Firewater",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire, { filter: "FEL_O" });
  // A fire breath drawn in: Deep Breath's look at the dragon.
  add(
    "Drakonid Breath|Shadowflame Breath|Vaelastrasz Flame Breath",
    "jb2a.cast_generic.fire.01.orange", "psfx.creature.dragons.attacks.breath.small.fire", { scale: 0.9 });
  // A frost breath drawn in: Frost Breath's look at the dragon.
  add(
    "Gahz'ranka Frost Breath|Winter's Breath",
    "jb2a.smoke.puff.side.02.white", "psfx.creature.dragons.attacks.breath.small.cold", { scale: 0.4, opacity: 0.6 });
  // Frost at the creature: the restrained cold cast.
  add(
    "Araj Frost Nova|Chains of Frost|Chill Nova|Engulf|Freeze|Freeze Solid|Frost Aura|Frost Burn|"
    + "Frost Trap|Frostbolt Answer|Frostbolt in Hand|Frostbolt Volley|Grave Frost|Ice Claw|Ice Tomb|"
    + "Icebolt|Icicle|Lich's Frost|Massive Geyser|Pallid Chill|Ras Chilled|Rime Burst|Skul Chilled|"
    + "Skul Frost Shock|Skul Frostbolt|Unforgiven Grave Frost|Vault Freeze|Zerillis Frost Shot",
    "jb2a.cast_generic.02.blue", SOUNDS.cold);
  // Water at the creature: The Water Rises' splash.
  add(
    "Churn the Water|Crashing Wave|Gahz'ranka Massive Geyser|Riptide|Slip the Current|Submersion|"
    + "Tidal Surge|Water Bolt",
    "jb2a.water_splash.circle.01.blue", "psfx.casting.water.001");
  // Lightning at the creature: Storm-Struck's look.
  add(
    "Arc Lightning|Arcing Bolt|Argelmach Overcharge|Argelmach Shock|Ball Lightning|C'Thun Eye Beam|"
    + "Chained Bolt|Chained Thunder|Coil Overload|Electrocutioner Shock|Forked Lightning|"
    + "Lightning in the Stone|Lightning Wave|Megavolt|Poison Shock|Polarity Shift|Second Voice|"
    + "Serpent Lords' Storm|Shock Blast|Skum Discharge|Storm Chain|Storm-Mad Rush|Thunderhawk Clap|"
    + "Wushoolay Forked Lightning|Wushoolay Lightning Cloud",
    "jb2a.cast_generic.02.blue", SOUNDS.lightning, { filter: "AIR" });
  // The Light at the creature: Deliver Judgement's gold.
  add(
    "Champion Holy Strike|Crusader's Hammer|Fairbanks Dispel|Flash Bomb|Hammer of the Fallen|"
    + "Holy Strike|Judgement of the Cathedral|Light in Hand|Mograine Lay on Hands|"
    + "Praetorian Holy Strike|Retribution Aura|Zeliek Wrath of the Light",
    "jb2a.cast_generic.02.blue", SOUNDS.bless1, { filter: "GOLD_B" });
  // Arcane force at the creature: Arcane Lash's restrained blue.
  add(
    "Antimagic Pulse|Arcane Bolt|Arcane Burst|Arcane Eruption|Balinda's Mass Slow|Balinda's Polymorph|"
    + "Breaker's Burst|Brood Power|Chromaggus Time Lapse|Crystal Flash|Crystallize|Defender Last Stand|"
    + "Demented Spirits|Doan Polymorph|Doan Silence|Enervate|Eradicator Drain Mana|Gaze of Immol'thar|"
    + "Hazza'rah Mana Burn|Illusions of Jandice|Illyanna Volley|Interpose|Mage-Lord Polymorph|"
    + "Moam Drain Mana|Moonflare Totem|Obsidian Reflection|Shazzrah Counterspell|Spell Reflection|"
    + "Spirit of Runn Tum|Taerar Arcane Blast|The Crystals|Time Stop",
    "jb2a.cast_generic.02.blue", SOUNDS.generic);
  // A sleep or a stupor: Naralex's Nightmare's sigil at the caster, never on a sleeper before its Test.
  add(
    "Balnazzar Sleep|Crystalline Slumber|Deep Slumber|Dream Fog|Druid's Slumber|Enchanting Lullaby|"
    + "Fairbanks Sleep|Grayhoof Sleep|Hazza'rah Mass Sleep|Kelris Sleep|Nightmare Gaze|Seeping Fog|"
    + "Serpentis Sleep|Wyvern Sting",
    "jb2a.sleep.symbol.dark_pink", SOUNDS.psychic, { scale: 0.6 });
  // A blink or a teleport: a misty step where the creature stood.
  add(
    "Bone Blink|Fel Step|Flicker|Hatefury Vanish|Plaguebringer's Blink|Shazzrah Blink|Teleport",
    "jb2a.misty_step.01.blue", "psfx.2nd-level-spells.misty-step.v1.complete.generic", { scale: 0.7 });
  // A vanish into stealth: Shadowmeld's inflow.
  add(
    "Arlokk Vanish|Faded|Melt into the Brush|Renataki Vanish",
    "jb2a.extras.tmfx.inflow.circle.01", "psfx.2nd-level-spells.misty-step.v1.outro.generic", { filter: "SHADOW_B", scale: 0.5, opacity: 0.6 });
  // A fire shield or ward flares once at the creature it guards.
  add(
    "Aegis of Ragnaros|Lesser Infernal Fire Shield|Quick Flame Ward",
    "jb2a.shield_themed.above.fire.01.orange", SOUNDS.fire, { scale: 0.6, opacity: 0.8 });
  // A frost ward flares once.
  add(
    "Quick Frost Ward",
    "jb2a.shield_themed.above.ice.01.blue", SOUNDS.cold, { scale: 0.6, opacity: 0.8 });
  // A shadow or bone barrier flares once.
  add(
    "Bone Armor|Bone Barrier|Gerstahn Shadow Shield|Hate'rel Shadow Shield|Shadow Shield|"
    + "Warder Shadow Shield",
    "jb2a.shield_themed.above.eldritch_web.01.dark_purple", SOUNDS.necrotic, { scale: 0.6, opacity: 0.8 });
  // An arcane shield flares once.
  add(
    "Arcane Bubble|Hakkari Anti-Magic Shield|Majordomo's Damage Shield|Moonwalker Anti-Magic Shield",
    "jb2a.shield.01.intro.blue", SOUNDS.generic, { scale: 0.6, opacity: 0.8 });
  // Shadow gathers at the creature as dark smoke; the Shadow school's own cue is never borrowed (D-807).
  add(
    "Agony of the House|Anub'shiah Banish|Arugal's Gift|Balnazzar Shadow Shock|Call of the Grave|"
    + "Corruption of the Earth|Creeping Corruption|Dark Glare|Deathwalker's Spirit|"
    + "Defender Shadow Storm|Dismounting Blast|Doom'rel Banish|Doom'rel's Volley|Draw Spirit|"
    + "Dust to Dust|Encage|Eviscerator Shadow Bolt Volley|Famine's Touch|Flay|Frailty|"
    + "Guardian Shadow Storm|Harvest Soul|Haunting Spirits|Hukku Shadow Bolt Volley|"
    + "Illucia Shadow Shock|Impending Doom|Inevitable Doom|Intense Pain|Into the Dark Ramps|"
    + "Kazzak Shadow Bolt Volley|Lethtendris Shadow Bolt Volley|Litany of Agony|Lucifron Shadow Shock|"
    + "Malicia Call of the Grave|Mark of Blaumeux|Mark of Korth'azz|Mark of Mograine|Mark of Zeliek|"
    + "Nightmare Illusions|Possess|Sentence of Pain|Shades of Jin'do|Shades of Taerar|"
    + "Shadow Bolt Volley|Shadow Bolt Whirl|Shadow Lash|Taint of Sargeras|Taste of the Soul|"
    + "The Baron's Lament|The Question|The Rot Spreads|Twisted Reflection|Unholy Aura|Unholy Frenzy|"
    + "Unholy Pulse|Unrelenting Anguish|Valthalak Shadow Bolt Volley|Void Bolt|Void Zone|Wavering Will|"
    + "Zevrim Sacrifice",
    "jb2a.smoke.plumes.01.grey", SOUNDS.necrotic, { filter: "DARK", scale: 0.6, opacity: 0.7 });
  // Blood magic: Blood for the Dreamer's splash.
  add(
    "Blood Leech|Hukku Curse of Blood|Jandice Curse of Blood|Stilgiss Curse of Blood|"
    + "Vosh'gajin Curse of Blood",
    "jb2a.liquid.splash_side02.red", SOUNDS.necrotic, { scale: 0.5 });
  // A curse, a silence or a withering: the curse sigil at the caster.
  add(
    "Anastari Banshee Curse|Anastari Silence|Curse of the Deadwood|Curse of the Plaguebringer|"
    + "Curse of Thorns|Curse of Tuten'kash|Curse the Faithless|Curse the Ring|Delusions of Jin'do|"
    + "Illucia Silence|Ironspine Curse|Kurzen Shrink|Slayer Silence|Thekal Silence|Veil of Shadow|"
    + "Wither Touch|Withering Word",
    "jb2a.condition.curse.01.001.red", SOUNDS.necrotic, { filter: "DARK", scale: 0.6 });
  // A drain: Soulflay's strands drawn in to the creature.
  add(
    "Butcher Drain|Cold Hunger|Deep Pulse|Draining Strike|Feed the Altar|Leech Pulse|"
    + "Sapphiron Life Drain|Siphon the Cursed|Soul Drain|Soul Siphon",
    "jb2a.energy_strands.in.green.01", SOUNDS.necrotic, { filter: "DARK", scale: 0.8 });
  // A charm, a domination or a mind blast: Take the Mind's sigil at the caster.
  add(
    "Avatar Cause Insanity|Brain Wash Totem|Brainwasher Cause Insanity|Dominate Mind|Domination|"
    + "Kalendris Dominate Mind|Royal Reproof|Twilight Command|Vile'rel's Rebuke|"
    + "Word of the Death Speaker",
    "jb2a.template_circle.symbol.normal.horror.purple", SOUNDS.psychic, { scale: 0.6 });
  // Poison, venom, acid or disease: green motes at the creature.
  add(
    "Acid Breath|Acid Splash|Ambusher Venom|Baneful Poison|Binding Totem|Chromaggus Corrosive Acid|"
    + "Contaminating Touch|Corrosive Acid|Darkmist Venom|Decrepit Fever|Deviate Toxin|Dunestalker Venom|"
    + "Dustwraith Virulent Poison|Eranikus Acid Breath|Flayer Venom|Gizrul Infected Bite|"
    + "Hatchling Swarm|Hatefury Venom|Heigan Eruption|Hethiss's Venom|Huhuran Acid Spit|Infected Bite|"
    + "Kurzen's Elixir|Locust Swarm|Mar'li Enlarge|Mother's Milk|Mutating Injection|"
    + "Necrofiend Deadly Poison|Noxious Breath|Noxious Catalyst|Overseer's Poison|Paralyze|"
    + "Paralyzing Poison|Poison|Poison Charge|Poison in the Wound|Poison Stinger|Poisoned Harpoon|"
    + "Poisoned Shot|Poisonous Stab|Putrid Mushroom|Putrid Stench|Rabid|Razzashi Venom|Rotting Bite|"
    + "Shadra's Venom|Slime Bolt|Slime Stream|Slowing Poison|Spawn Venom|Spew|Spreading Acid|"
    + "Tarantula Venom|Thief's Poison|Tidehunter Venom|Tomb Venom|Toxic Saliva|Venom Web Bite|"
    + "Venoxis Venom Spit|Volatile Infection|Webwood Venom|Wither",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.necrotic, { opacity: 0.65 });
  // A poison cloud, a plague or a volley: Blightcloud's green puff.
  add(
    "Booze Spit|Cloud of Disease|Creeping Plague|Defender Plague|Fevered Plague|"
    + "Grobbulus Poison Cloud|Guardian Plague|Heigan Plague Cloud|Huhuran Poison Bolt Volley|"
    + "Ironspine Poison Cloud|Kri Toxic Volley|Mar'li Poison Bolt Volley|Patchwork Disease Cloud|"
    + "Poison Bolt Volley|Poison Volley|Spore Burst|Stinger Spray|The Earth Binds|Toxic Remains|"
    + "Toxic Volley|Toxin|Venoxis Poison Cloud|Viscous Fallout Toxic Volley",
    "jb2a.smoke.puff.centered.grey", "psfx.cantrips.poison-spray.v1", { filter: "VENOM_B", scale: 0.8, opacity: 0.65 });
  // Roots and vines at the creature: Root the Ground's look.
  add(
    "Celebras Entangling Roots|Cho'Rush Earthgrab Totem|Earthgrab Totem|Grasping Thorns|"
    + "Grasping Vines|Gri'lek Entangle|Lost One Seer Earthgrab Totem|Root and Rot|Root Snare|Takes Root|"
    + "Tendris Entangle|Tendris Grasping Vines",
    "jb2a.entangle.02.complete.02.green", "psfx.1st-level-spells.entangle.vines.v1.001.intro", { scale: 0.5, below: true });
  // Nature or the Dream: Thornmail's green motes.
  add(
    "Dream Haze|Fungal Smother|Mark of Nature|Twisted Tranquility|Weave the Dream",
    "jb2a.particles.outward.greenyellow.01.01", SOUNDS.boon);
  // Sand and wind: a ring of dust at the creature.
  add(
    "Ossirian Enveloping Winds|Ouro Sand Blast|Sand Trap|Sand Vortex|Scouring Sand",
    "jb2a.smoke.puff.ring.01.white", SOUNDS.gust, { filter: "EARTH", scale: 0.9, opacity: 0.6 });
  // A creature takes another shape: a puff where it changes.
  add(
    "Aspect of Shadra|Cobrahn Serpent Form|Serpent Form|Theka Transform|Wildshaper",
    "jb2a.smoke.puff.centered.grey", "psfx.2nd-level-spells.misty-step.v1.complete.generic", { scale: 0.8, opacity: 0.7 });
  // A roar, a shout, a howl or an order: Bellow's sound ring.
  add(
    "Attack Order|Azshir Terrify|Banishment's End|Banshee Wail|Battle Shout|Beast Terrifying Roar|"
    + "Bellowing Roar|Berserker's Bellow|Blood Howl|Break the Prisoner|Calls for Help|Captain's Order|"
    + "Death's Head Litany|Demoralizing Shout|Den Roar|Dextren Frightening Shout|Disrupting Shout|"
    + "Doomwarder Battle Shout|Drive Them On|Earn Your Pay|Echoing Shriek|For Agamaggan|Frostmaw's Roar|"
    + "Furious Howl|Galvangar Frightening Shout|Gluth Terrifying Roar|Herald's Shout|Highborne Lament|"
    + "Howling Screech|Inspire|Intimidating Orders|Intimidating Roar|Intimidating Shout|"
    + "Jeklik Sonic Burst|Khan's Horn|Kromcrush Frightening Shout|Leave My Table|Loose the Hound|"
    + "Lord's Bellow|Lost One Chieftain Rally the Lost|Mark of Arlokk|Mark the Prey|"
    + "Mosh'Ogg Intimidation|Naughty Secrets|Panic|Piercing Howl|Rally the Crew|Rally the Lost|"
    + "Roar of the Nightmare|Roar Through the Keep|Royal Terror|Serve to the Last|Shredder Terrify|"
    + "Shriek in the Dark|Shy-Rotam Terrifying Roar|Slayer's Cry|Sound the Horn|Taerar Bellowing Roar|"
    + "The Legion's Patience|The Worm Unbound|Threatening Gaze|Threatening Growl|Timmy's Howl|"
    + "Understudy Taunt|Vengeful Brood|Woodpaw Battle Shout|Wyrmthalak Demoralizing Shout",
    "jb2a.cast_generic.sound.01.pinkteal", "psfx.creature.dragons.roar.small", { filter: "DESATURATE", scale: 0.85 });
  // An enrage, a frenzy or a bloodlust: Berserk's red glow.
  add(
    "Angerforge's Enrage|Battle Fury|Battlemaster's Frenzy|Bloodlust|Bloodlust of the Pit|"
    + "Cho'Rush Bloodlust|Crazed|Crushridge Bloodlust|Frenzy|Gizrul Frenzy|Grebmar Bloodlust|"
    + "Gri'lek's Avatar|Hamhock Bloodlust|Loksey Bloodlust|Mage-Lord Bloodlust|Omokk Frenzy|Paired Fury|"
    + "Recklessness|Savagery|Spitelash Enrage",
    "jb2a.on_token_buff.001.001.orangeyellow", "psfx.creature.dragons.roar.small", { filter: "BLOOD_RAGE", scale: 0.5, opacity: 0.8 });
  // A heal: Hands On's warm glow.
  add(
    "Abbot's Benediction|Drink Healing Potion|Heal|Heal Brother|Malicia's Mending|Mend the Seven|"
    + "Revivify|Seal of Reckoning|The Empress's Mercy",
    "jb2a.healing_generic.200px.yellow", "psfx.1st-level-spells.cure-wounds.v1.001");
  // A nature or water heal: Healing Stream's burst.
  add(
    "Alzzin Wild Regeneration|Anacondra Healing Touch|Cobrahn Healing Touch|Cookie's Cooking|Eat Tree|"
    + "Grayhoof Healing Touch|Great Heal|Healing Chain|Healing Touch|Healing Ward|"
    + "Healing Wave of Antu'sul|Lore of the Wild|Lost One Seer Healing Ward|Mijan Healing Ward|"
    + "Mijan's Mending|Powerful Healing Ward|Pythas Healing Touch|Serpentis Healing Touch|"
    + "The Serpent King|Tidal Mending|Woodpaw Brand",
    "jb2a.healing_generic.03.burst.bluegreen", "psfx.casting.water.001");
  // A dark heal or a feeding: Feed's strands drawn in.
  add(
    "Blood Chant|Blood Offering|Capture Soul|Dark Mending|Devour Zombie|Essence of the Altar|"
    + "Feed on the Fallen|Gizrul Fatal Bite|Unbroken|Withered Touch",
    "jb2a.energy_strands.in.green.01", SOUNDS.necrotic, { filter: "DARK", scale: 0.8 });
  // The dead are called.
  call(
    "Awaken the Graves|Call the Class|Call the Restless|Corpse Scarabs|Crypt Guards|Illusory Wraiths|"
    + "Into Shadow|Raise Undead Scarab|Rally the Garrison|Skeletal Rising|Skeleton Totem|"
    + "Spectral Assassins|Summon Risen Lackey|The Balcony|The Dead Return|The Dead Serve|"
    + "The Students Rise|The Unrelenting|Vengeful Phantoms|Wake the Nest|Ward of Zum'rah|Zombie Chow",
    "jb2a.energy_strands.in.green.01", SOUNDS.necrotic, { filter: "DARK" });
  // Demons are called.
  call(
    "Alzzin's Minions|Arugal's Voidwalkers|Call the Shadowstalkers|Call the Void|Hukku's Guardians|"
    + "Summoner's Imp|The Eyes Open|Wildspawn Imps",
    "jb2a.energy_strands.in.green.01", "psfx.incantations.masculine.001.demonic.summon.003", { filter: "FEL_B" });
  // Beasts, insects, whelps and the wild are called.
  call(
    "Brood|Buru's Eggs|Call of the King|Call the Boar Spirits|Call the Cobras|Call the Guardians|"
    + "Call the Nightmare|Call the Prowlers|Call the Pythons|Call the Raptors|Call the Roost|"
    + "Call the Sul'lithuz|Call the Worgs|Corrupt Force of Nature|Cursed Swarm|Hatch the Clutch|"
    + "Hatchlings|Loose the Ragers|Mutate Bug|Open the Kennels|Release the Hounds|Scarabs|Slime Spray|"
    + "Spawn of Fankriss|Spawn of Mar'li|Spiderlings|Spire Spiderlings|Swarmers|The Body Splits|"
    + "The Brood|The Hand's Guard|The Litter|The Protectors Wake",
    "jb2a.particles.swirl.greenyellow.01.01", SOUNDS.gust);
  // Stone, sand and constructs answer from the ground.
  call(
    "Call the Rumbler|Halmgar's Rumbler|Sand Storms|Shardlings Gather|The Ground Gives Way",
    "jb2a.ground_cracks.01.orange", SOUNDS.blunt, { filter: "EARTH" });
  // Fire answers the call.
  call(
    "Call the Burning Servants|Call the Firesworn|Call the Guard|Call the Protectors|Call the Retinue|"
    + "Call the Runes|Lava Spawn|Scorching Totem|Spawn of Bael'Gar",
    "jb2a.cast_generic.fire.01.orange", SOUNDS.fire);
  // Water answers the call.
  call(
    "Balinda's Water Elementals|Hydrolings",
    "jb2a.water_splash.circle.01.blue", "psfx.casting.water.001");
  // Arcane things answer the call.
  call(
    "Turn to Stone|Wake the Golems",
    "jb2a.particle_burst.01.rune.bluepurple", SOUNDS.strands);
  // Soldiers, cultists and kin are called by voice.
  call(
    "All Hands|Call the Blindlight|Call the Cells|Call the Commandos|Call the Commons|"
    + "Call the Diggers|Call the Fang|Call the Geologists|Call the Pyramid|Call the Searing Blade|"
    + "Call the Tunnels|Call the Wardens|Call the Warmasters|Help the Guard|Intruder Alert|"
    + "Intruders in the Lair|Kromcrush Intruder Alert|Send the Faithful|Slay Them|Smolderthorn Answer|"
    + "Sound the Patrol|Summon Riflemen|The Army of the Sands|The Brood's Keepers|The Congregation|"
    + "The Overlord's Defense|The Shrine Answers|The Spirestone Come|Twenty Trainees|Urok's Tribute",
    "jb2a.cast_generic.sound.01.pinkteal", SOUNDS.boon, { filter: "DESATURATE", below: false });
  // D-1818: Kel'Thuzad's Guardians of Icecrown take The Dead Attend's place on his block, and its picture.
  add("Guardians of Icecrown", "jb2a.magic_signs.circle.02.necromancy.complete.green", "psfx.incantations.masculine.001.reverb.summon.003",
    { below: true, scale: 0.9, opacity: 0.7 });
  quiet(
    "Aura of Nature|Avatar of War|Behind the Pack|Bloodlord's Rise|Bound to the Lich|"
    + "Bound to the Prophet|Brood Defense|Captain of Stonehearth|Chief Advisor|Clan Ranks|Corrupted|"
    + "Corrupted Mind|Cursebound|Defender's Choice|Dope'rel Backstab|Drawn to the Mark|"
    + "Dun Baldar's Marshals|Ferra|Flight of Its Making|Forge-Born Flame|From the Dig's Shadows|"
    + "Get Digging|Guardian Blood Tap|Guardian Powers|Guardian's Revenge|Gurubashi Enrage|"
    + "Held in the Hall of Binding|Hopeless|Hunts the Casters|Iceblood Captain|In a Trance|"
    + "Incorporeal Defense|Landing|Light on His Feet|Maexxna Frenzy|Mana Battery|Mind of the Orb|"
    + "Mire Ambush|Moonshadow Coat|Ohgan|Pack Code|Pack Hunter|Paid in Advance|Pimgib|Pride Hunt|"
    + "Ragefire Chieftain|Renataki Enrage|Riot|Royal Guard|Scatter the Diggers|Shadowmaw Sneak|"
    + "Shadowstalk|Share of the Prize|Sheds Curses|Shell Breaks|Slime Body|Snowdrift Stalk|"
    + "Splintered Obsidian|Stalagg and Feugen|Tamed Hyena|The Chase|The Eye and the Body|"
    + "The Gorger's Chase|The Oath Outlasts Him|The Royal Three|The Widow's Due|Thredd Battle Shout|"
    + "Three Fights in One|Three Weapons|Two Breaths|Unhorsed|Verek|Wall of the Dead|Wall-Crawler|"
    + "Woven Dark|Yield to the Firelord",
    "Standing trait, encounter setup, or conditional rule; no discrete audiovisual action. Its ordinary movement, strike or effect owns any presentation.");
  quiet(
    "Addled by Radiation|Ambusher|Anvil's Keeper|Arugal's Hound|Back to Back|Blood for the Soulflayer|"
    + "Bodiless|Chomper's Nose|Clockwork Heart|Commando Backstab|Deep Swimmer|Drakkisath Rage|"
    + "Drunken Rage|Elder's Frenzy|Fankriss Unyielding|Fen Swimmer|Forge Watch|Four Shapes|"
    + "Getting Hungry|Golemagg's Trust|Grizzle Frenzy|Guano Madness|Hears Everything|"
    + "Hoarder of the Hall|Hunts by Sound|In the Cockpit|Jungle Coat|Keeper of the Temple Hall|"
    + "Lake-Bred|Liquid Body|Lord of the House|Noxious Body|Packmaster|Qiraji General|Rider and Strider|"
    + "Sand-Sense|Separation Anxiety|Set in Stone|Ship's Parrot|Shrine Water|Sight Without Eyes|"
    + "Sleepless|Snarl|Snow Coat|Spirit Unbound|Stands Its Post|Straw-Stuffed|Swims the Channels|"
    + "The King's Gauntlets|The Mind's Eye|The Old God|The Staff Taken Up|The Zealots|Three Brothers|"
    + "Timbermaw Watch|Timeways|Tinkerer|Unshaken|Urok's Hand|Verdan Regeneration|Watcher of the Makers|"
    + "Web Sense|Zulian Stalk",
    "Inherent passive anatomy, sense, immunity, modifier, or conditional trigger. No manual Use animation; the actual attack, damage, movement or triggered effect presents its outcome.");
  quiet(
    "Butcher's Finish|Crusader Strike|Crushing Bite|Curse of the Dreadmaul|Deepfury Defensive Stance|"
    + "Dragon Guard Sunder Armor|Draining Blow|Eranikus Thrash|Fallen Champion Execute|Furious Anger|"
    + "Gluth Mortal Wound|Head Crack|Infected Wound|Loro Improved Blocking|Mortal Wound|Necrotic Poison|"
    + "Overcharge|Pierce Armor|Plaguehound Infected Wound|Rager Mangle|Ravenous Claw|Righteous Fire|"
    + "Rushing Charge|Sartura Sundering Cleave|Scourge Champion Mortal Strike|Shield Block|Silithid Pox|"
    + "Sinister Strike|Stormpike Charge|Thekal Mortal Cleave|Thorns Aura|Vilebranch Strike|"
    + "Viscidus Shatter|Wolf Rider Mortal Strike",
    "Attack rider with no Use of its own: the attack card plays the weapon's form and its hit, and what the rider lays follows the blow.");
  quiet(
    "Fall Back|On Patrol|Right Hand of the Chief|Run Rings|Seep Away|Skip Away",
    "A move with no effect of its own: the token's own movement draws it, and its author proposed a gap line rather than a look.");
  quiet(
    "Ambusher Sneak|Asleep in the Wall|Coat of Thistlefur|Fresh Meat|Gorge|Hatefury Backstab|"
    + "Heart of Lava|It Breaks|Marauder's Rage|Open Wounds|Reaver's Fury|Sandstalker Sneak|"
    + "Slavering Hunger|Supreme|Turnkey",
    "A stance, a stealth, a standing Boon or a move with nothing to see: its author proposed no look, and the Use's card presents it.");
  quiet(
    "A Wife's Shield|Alexei Veil of Shadow|Amplify Flames|Argent Oath|Aspect of Bethekk|"
    + "Aspect of Hethiss|Aspect of Hir'eek|Aspect of Shirvallah|Avatar of Dun Baldar|Bleakheart Enrage|"
    + "Bloodsail Summon Imp|Bound Imp|Bound to Golemagg|Brood Affliction|Burrow|Carapace of C'Thun|"
    + "Champion's Challenge|Chromaggus Chromatic Breath|Command the Brood|Cult Devotion|Curse of Blood|"
    + "Dark Mirror|Dathrohan's Face|Dead Man's Fury|Decimate|Defender Reflection|Defender Shield Wall|"
    + "Defiling Aura|Demon Skin|Devour|Drakkisath Pierce Armor|Ebonroc Shadow Flame|Eject Sneed|"
    + "Emeriss Volatile Infection|Enlarge|Enrage|Essence of the Red|Eviscerator Anti-Magic Shield|"
    + "Faerlina Frenzy|Fengus Frenzy|Final Order|Firemaw Shadow Flame|Flamegor Frenzy|"
    + "Forresten Demoralizing Shout|Freezing|Gehennas' Curse|Gloom'rel Recklessness|Guardian Reflection|"
    + "Hate'rel Flurry|Herod Frenzy|Howling Rage|Huhuran Berserk|Huhuran Frenzy|Incite the Dead|"
    + "Into the Pit|Into the Shell|Jandice Banish|Krastinov Frenzy|"
    + "Kurzen Jungle Fighter Improved Blocking|Loa's Favour|Lucifron's Curse|Magic Grounding|"
    + "Magic Reflection|Marduk Shadow Shield|Mark of Kazzak|Myrmidon Enrage|Ok'thor's Polymorph|"
    + "Out of the Sand|Prophet's Shout|Rally the Guard|Rally the Legion|Rank and File|Reflective Skin|"
    + "Return to the Whole|Sapphiron Frost Breath|Second Breath|Shadow Hunter's Hex|Shadow of Ebonroc|"
    + "Shadow Wrath|Shadowform|Shattered Rage|Shazzrah's Curse|Shield Wall|Shimmer|Shock upon Shock|"
    + "Shrink|Sic Them|Stand to the Wall|Stonespine Stoneform|Syndicate Voidwalker|Targorr Enrage|"
    + "Tell Me Everything|The Archive Burns|The Basilisk|The Father Flame|The Mate's Answer|"
    + "The Stench Rolls Out|To Arms|Twin Teleport|Wake the Statues|Ward of the Six|Ward of the Tomb|"
    + "Web Wrap",
    "No Use of its own yet (automation kind none): nothing is pressed and no card is posted, so a cue would never fire. The GM resolves the prose; its author's look waits for a door.");
  return Object.freeze(rows);
}
