/**
 * **THE CATALOGUE'S BOSS ACTIONS** (D-1829 to D-1831): the plan rows for every Boss Action the
 * 526 new entries of 14 print (D-1809 to D-1818), in `BOSS_PLANS`' own shape and read by the same
 * `applyPlanRow`. Pure: no Foundry. `boss-actions.mjs` folds this table into `BOSS_PLANS`, and a
 * creature named in both fails at load; `boss-action-census.test.mjs` holds the union to 14 both
 * ways and number for number.
 *
 * How a row was chosen, by what the words do:
 *
 * - **a Test the Boss forces**: the seed reads it; the row adds the damage's school (`physical`
 *   where the words name none, the lead's ruling on Q12), the span of the condition it lays, the
 *   circle it `gather`s, a push or a pull, an area on the ground;
 * - **its own blow**: `kind: "attack"` with the allowance the words count (*two attacks*, *every
 *   creature in reach* is `reach`), a Boon where the words give one, and a `disengage` door where
 *   the move provokes no Opportunity Attack. A blow's extra Damage Rating or extra damage is the
 *   GM's from the card (O-655);
 * - **another creature's blow**: the `allyAttack` door, at `boons: 0` where the words give none;
 * - **a spell by name**: `kind: "spell"`, with `freeMana` where the words say it is not paid for;
 * - **a heal on another creature**: `kind: "heal"` with the amount, the card's Apply on the target;
 * - **nothing a door lands** (a self-buff, a reflected spell, a raid mechanic): `kind: "none"` with
 *   the reason, announced through the door that still spends the point (D-1780's shape).
 *
 * Where the words lay two conditions on one failed Test, the row lays the first and the card
 * prints the second; where a summon names two kinds of creature, the first is placed (D-1830).
 */

/**
 * The kind of Test a laid Bane lands on, named once: a Bane is laid here, never a roll built
 * (`distance.test.mjs` censuses every literal Casting Test kind in `module/` as a roll), as
 * `creature-plans.mjs` names it.
 */
const CASTING_TESTS = "casting";

export const CATALOGUE_BOSS_PLANS = Object.freeze({
  "Agathelos the Raging": {
    "Agathelos Rampage": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Left for Dead": { type: "physical", inflicts: { until: "endOfNextTurn", condition: "stunned", value: null, onFail: true } }
  },
  "Aggem Thorncurse": {
    "Call the Boar Spirits": {},
    "Prophet's Shout": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Alzzin the Wildshaper": {
    "Wither": { until: "endOfNextTurn" },
    "Enervate": { plan: { poolLoss: { pool: "power", amount: 3, on: "fail" } } },
    "Alzzin's Minions": {}
  },
  "Ambassador Flamelash": {
    "Call the Runes": {},
    "Ambassador's Fireball": {},
    "Runes Flare": {}
  },
  "Ancient Stone Keeper": {
    "Sand Storms": {},
    "Scouring Sand": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 15 } } },
    "Grinding Step": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Anger'rel": {
    "Anger'rel Sunder Armor": { plan: { sunder: { location: "body", amount: 1, on: "fail" } } },
    "Shield Block": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Strike of the Seven": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Antu'sul": {
    "Call the Sul'lithuz": {},
    "Earthgrab Totem": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Healing Wave of Antu'sul": { plan: { selfHeal: true } }
  },
  "Anub'Rekhan": {
    "Anub'Rekhan Impale": { type: "physical" },
    "Locust Swarm": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Crypt Guards": {}
  },
  "Anub'shiah": {
    "Enveloping Web": { inflicts: { until: "endOfNextTurn", condition: "entangled", value: null, onFail: true } },
    "Anub'shiah Banish": { until: "endOfNextTurn" },
    "Curse the Ring": { plan: { gather: { who: "enemy", feet: 30 }, bane: { kind: CASTING_TESTS, on: "fail" } } }
  },
  "Araj the Summoner": {
    "Illusory Wraiths": {},
    "Lich's Frost": { until: "endOfNextTurn" },
    "Araj Frost Nova": { kind: "spell", spell: "Frost Nova", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Arcanist Doan": {
    "Detonation": { plan: { gather: { who: "creature", feet: 30 } } },
    "Doan Polymorph": { until: "endOfNextTurn" }
  },
  "Archivist Galford": {
    "Burning Winds": { inflicts: { until: "endOfNextTurn", condition: "stunned", value: null, onFail: true } },
    "Nova of Cinders": { plan: { gather: { who: "enemy", feet: 10 } } },
    "Fire on the Shelves": { kind: "spell", spell: "Flamestrike", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Atal'alarion": {
    "Sweeping Slam": { type: "physical", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Demolish": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Banishment's End": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Avatar of Hakkar": {
    "Avatar Cause Insanity": { until: "endOfNextTurn" },
    "Taste of the Soul": {},
    "The Shrine Answers": {}
  },
  "Ayamiss the Hunter": {
    "Stinger Spray": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Swarmers": {},
    "Paralyze": { type: "physical", until: "endOfNextTurn" }
  },
  "Azshir the Sleepless": {
    "Call of the Grave": {},
    "Azshir Terrify": { until: "endOfNextTurn" }
  },
  "Bael'Gar": {
    "Spawn of Bael'Gar": {},
    "Searing Splash": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "Heat of the Gate": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Baelog": {
    "Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Volley": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Rally the Lost": { kind: "utility", clear: ["inflicts", "passive"], plan: { gather: { who: "ally", feet: 30 }, boon: { kind: "attack", on: "press" } } }
  },
  "Balnazzar": {
    "Crusader's Hammer": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Balnazzar Shadow Shock": { plan: { gather: { who: "enemy", feet: 15 } } },
    "Domination": { until: "endOfNextTurn" }
  },
  "Baron Aquanis": {
    "Tidal Surge": { plan: { gather: { who: "creature", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Engulf": { until: "endOfNextTurn" }
  },
  "Baron Geddon": {
    "Geddon's Inferno": { plan: { gather: { who: "creature", feet: 15 } } },
    "Geddon Living Bomb": { plan: { gather: { who: "creature", feet: 15 } } },
    "Ignite Mana": { plan: { gather: { who: "enemy", feet: 30 }, poolLoss: { pool: "mana", amount: 3, on: "fail" } } }
  },
  "Baron Silverlaine": {
    "The Baron's Lament": { plan: { gather: { who: "creature", feet: 20 } } },
    "Leave My Table": { until: "endOfNextTurn" }
  },
  "Baroness Anastari": {
    "Banshee Wail": {},
    "Anastari Banshee Curse": { plan: { gather: { who: "enemy", feet: 30 }, bane: { kind: "attack", on: "fail" } } },
    "Anastari Silence": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Battleguard Sartura": {
    "Sartura Whirlwind": { type: "physical", clear: ["passive", "inflicts"] },
    "Sartura Frenzy": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Rally the Guard": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Bazil Thredd": {
    "Thredd Smoke Bomb": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Call the Cells": {}
  },
  "Bazzalan": {
    "Into the Dark Ramps": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } },
    "Flurry of Blades": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Blind Hunter": {
    "Echoing Shriek": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Blind Hunter Out of the Dark": { kind: "attack", plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Bloodlord Mandokir": {
    "Mandokir Charge": { kind: "attack", until: "endOfNextTurn", plan: { attack: { allowance: 1 } } },
    "Mandokir Whirlwind": { type: "physical", plan: { gather: { who: "enemy", feet: "reach" } } },
    "Intimidating Shout": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Bloodmage Thalnos": {
    "Flame Spike": { plan: { gather: { who: "creature", feet: 10 } } },
    "Call the Restless": {}
  },
  "Bloodsail Captain": {
    "Rally the Crew": { kind: "utility", clear: ["inflicts", "passive"], plan: { gather: { who: "ally", feet: 30 }, boon: { kind: "attack", on: "press" } } }
  },
  "Broodlord Lashlayer": {
    "Broodlord Blast Wave": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } },
    "Broodlord Mortal Strike": { type: "physical" },
    "Broodlord Knock Away": { plan: { forced: { on: "fail", feet: 20, toward: "away" } } }
  },
  "Bruegal Ironknuckle": {
    "Welcome to the Stockade": { clear: ["damage", "dc"], plan: { escape: { resilience: "reflex", dc: 18, skill: "athletics" }, grip: { type: "physical", damage: 5 } } },
    "Shank and Twist": { type: "physical" }
  },
  "Buru the Gorger": {
    "Creeping Plague": { plan: { gather: { who: "enemy", feet: 60 } } },
    "Hatchlings": {},
    "Buru Gorge": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "C'Thun": {
    "Dark Glare": {},
    "Claw Tentacle": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 15 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Devour": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Cannon Master Willey": {
    "Willey Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Summon Riflemen": {},
    "Covering Fire": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Captain Balinda Stonehearth": {
    "Balinda's Water Elementals": {},
    "Balinda's Polymorph": { until: "endOfNextTurn" },
    "Balinda's Mass Slow": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Captain Galvangar": {
    "Galvangar Whirlwind": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "Galvangar Mortal Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Galvangar Frightening Shout": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Captain Greenskin": {
    "Greenskin Cleave": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "All Hands": {}
  },
  "Captain Kromcrush": {
    "Kromcrush Frightening Shout": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Kromcrush Intruder Alert": {},
    "Captain's Order": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 0 } }
  },
  "Celebras the Cursed": {
    "Celebras Entangling Roots": { until: "endOfNextTurn" },
    "Twisted Tranquility": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Corrupt Force of Nature": {}
  },
  "Cho'Rush the Observer": {
    "Cho'Rush Bloodlust": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 1 } },
    "Healing Chain": { kind: "heal", heal: 10, clear: ["passive"] },
    "Cho'Rush Earthgrab Totem": { until: "endOfNextTurn", area: "A 15 ft radius on the ground" }
  },
  "Chromaggus": {
    "Chromaggus Chromatic Breath": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Brood Affliction": { kind: "none", reason: "tableCall", clear: ["damage", "inflicts", "heal", "passive"] },
    "Chromaggus Frenzy": { kind: "attack", plan: { attack: { allowance: 2, boons: 1 } } }
  },
  "Colonel Kurzen": {
    "Call the Commandos": {},
    "Melt into the Brush": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } }
  },
  "Commander Springvale": {
    "Rally the Garrison": {},
    "Stand to the Wall": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Cookie": {
    "Cookie's Cooking": {},
    "Acid Splash": {}
  },
  "Crowd Pummeler 9-60": {
    "Crowd Pummel": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Crowd Pummeler Trample": { type: "physical" }
  },
  "Dark Iron Ambassador": {
    "Call the Burning Servants": {},
    "Envoy's Flame": {}
  },
  "Death Speaker Jargba": {
    "Dominate Mind": { until: "endOfNextTurn", plan: { sideSwitch: { until: "endOfNextTurn" } } },
    "Word of the Death Speaker": { until: "endOfNextTurn" }
  },
  "Death Talon Captain": {
    "Mark of Detonation": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Dextren Ward": {
    "Dextren Frightening Shout": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Dextren Strike": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Doctor Theolen Krastinov": {
    "Krastinov Backhand": { until: "endOfNextTurn" },
    "Open the Wound": { type: "physical" },
    "Frenzied Hacking": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Doom'rel": {
    "Doom'rel's Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Call the Void": {},
    "Doom'rel Banish": { until: "endOfNextTurn" }
  },
  "Doomguard Commander": {
    "Rally the Legion": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Dope'rel": {
    "Gouge": { until: "endOfNextTurn" },
    "Rupture": { type: "physical" },
    "Dope'rel Sinister Strike": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Dreamscythe": {
    "Scything Pass": { type: "physical" },
    "Spreading Acid": {},
    "Nightmare Gaze": { until: "endOfNextTurn" }
  },
  "Drek'Thar": {
    "Drek'Thar Whirlwind": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "Frostwolf Knockdown": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Call the Warmasters": {}
  },
  "Dustwraith": {
    "Dustwraith Sinister Strike": { kind: "attack", clear: ["inflicts"], plan: { attack: { allowance: 1 } } },
    "Into the Dust": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } },
    "Poison in the Wound": {}
  },
  "Earthcaller Halmgar": {
    "Halmgar's Rumbler": {},
    "The Earth Binds": { until: "endOfNextTurn", area: "A 10 ft radius on the ground", plan: { zone: { lasts: "encounter", difficult: true } } }
  },
  "Ebonroc": {
    "Shadow of Ebonroc": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Ebonroc Wing Buffet": { type: "physical", plan: { gather: { who: "enemy", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Ebonroc Shadow Flame": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Electrocutioner 6000": {
    "Megavolt": { until: "endOfNextTurn" },
    "Overcharge": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Emeriss": {
    "Seeping Fog": {},
    "Emeriss Volatile Infection": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Corruption of the Earth": { plan: { gather: { who: "enemy", feet: 60 } } }
  },
  "Emperor Vek'lor": {
    "Twin Teleport": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Arcane Burst": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Explode Bug": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Emperor Vek'nilash": {
    "Vek'nilash Uppercut": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Unbalancing Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Mutate Bug": { summon: { entry: "Scarab", count: 2 } }
  },
  "Eric \"The Swift\"": {
    "Eric Rushing Charge": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Run Rings": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } },
    "Quick Blades": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Eviscerator": {
    "Eviscerator Vicious Rend": { type: "physical" },
    "Eviscerator Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Eviscerator Anti-Magic Shield": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Fallen Champion": {
    "Sweeping Blow": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Iron Stride": { kind: "attack", plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Fankriss the Unyielding": {
    "Spawn of Fankriss": {},
    "Fankriss Entangle": { until: "endOfNextTurn" },
    "Rending Pincers": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Fenrus the Devourer": {
    "Arugal's Voidwalkers": {},
    "Roar Through the Keep": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 30 } } }
  },
  "Fineous Darkvire": {
    "Fineous Kick": { until: "endOfNextTurn" },
    "The Architect's Weight": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Light in Hand": { kind: "spell", spell: "Holy Light", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Firemaw": {
    "Firemaw Wing Buffet": { type: "physical", plan: { gather: { who: "enemy", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Firemaw Shadow Flame": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Firemaw Flame Buffet": { plan: { gather: { who: "enemy", feet: 60 } } }
  },
  "Flamegor": {
    "Flamegor Fire Nova": { plan: { gather: { who: "creature", feet: 20 } } },
    "Flamegor Frenzy": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Flamegor Wing Buffet": { type: "physical", plan: { gather: { who: "enemy", feet: 15 } } }
  },
  "Gahz'ranka": {
    "Gahz'ranka Frost Breath": { until: "endOfNextTurn", plan: { poolLoss: { pool: "power", amount: 1, on: "fail" } } },
    "Gahz'ranka Massive Geyser": { type: "physical" },
    "Gahz'ranka Slam": { type: "physical", plan: { gather: { who: "enemy", feet: "reach" }, forced: { on: "fail", feet: 10, toward: "away" } } }
  },
  "Gahz'rilla": {
    "Gahz'rilla Slam": { type: "physical", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Freeze Solid": { until: "endOfNextTurn" },
    "Many Heads": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Galgann Firehammer": {
    "Call the Geologists": {},
    "Amplify Flames": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Burning Hammer": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Garr": {
    "Antimagic Pulse": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Magma Shackles": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Call the Firesworn": {}
  },
  "Gasher": {
    "Gash": { type: "physical" },
    "Off the Ledge": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Dead Man's Fury": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Gehennas": {
    "Gehennas' Curse": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Brimstone Fall": { area: "A 15 ft radius on the ground" },
    "Call the Guard": {}
  },
  "Gelihast": {
    "Call the Blindlight": {},
    "Twin Cuts": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "General Angerforge": {
    "Intruder Alert": {},
    "Angerforge Sunder Armor": { plan: { sunder: { location: "body", amount: 1, on: "fail" } } },
    "Flurry": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "General Drakkisath": {
    "Drakkisath Conflagration": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Drakkisath Pierce Armor": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "The Hand's Guard": {}
  },
  "General Rajaxx": {
    "Thundercrash": { plan: { gather: { who: "creature", feet: 30 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "The Army of the Sands": {},
    "Attack Order": { kind: "utility", plan: { door: "marked", feet: 60, boons: 1 } }
  },
  "Ghamoo-ra": {
    "Ghamoo-ra Trample": { kind: "attack", type: "physical", plan: { attack: { allowance: 1 } } },
    "Snapping Lunge": { kind: "attack", clear: ["passive"], plan: { door: "disengage", attack: { allowance: 1, boons: 1 } } }
  },
  "Gilnid": {
    "Molten Metal": { until: "endOfNextTurn" },
    "Melt Ore": { plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Gizrul the Slavener": {
    "Gizrul Fatal Bite": { kind: "attack", clear: ["heal"], plan: { attack: { allowance: 1 } } },
    "Gizrul Frenzy": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1, boons: 1 } } },
    "Slavener's Lunge": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Gloom'rel": {
    "Gloom'rel Mortal Strike": { type: "physical" },
    "Gloom'rel Hamstring": { until: "endOfNextTurn" },
    "Gloom'rel Cleave": { kind: "attack", plan: { attack: { allowance: "reach" } } }
  },
  "Gluth": {
    "Decimate": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Gluth Terrifying Roar": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Zombie Chow": {}
  },
  "Glutton": {
    "Gorge": {},
    "Bowl Over": {},
    "Spew": {}
  },
  "Golem Lord Argelmach": {
    "Wake the Golems": {},
    "Argelmach Shock": {},
    "Argelmach Overcharge": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 1 } }
  },
  "Golemagg the Incinerator": {
    "Golemagg Pyroblast": {},
    "Golemagg's Earthquake": { type: "physical", plan: { gather: { who: "creature", feet: 30 } } },
    "Loose the Ragers": {}
  },
  "Goraluk Anvilcrack": {
    "Goraluk Backhand": { type: "physical", until: "endOfNextTurn" },
    "Goraluk Head Crack": { type: "physical", plan: { bane: { kind: "resilience", on: "fail" } } },
    "Goraluk Strike": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1 } } }
  },
  "Gordok Mage-Lord": {
    "Mage-Lord Bloodlust": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 0 } }
  },
  "Gorosh the Dervish": {
    "Gorosh Whirlwind": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } },
    "Gorosh Mortal Strike": { type: "physical" },
    "Bloodlust of the Pit": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1, boons: 1 } } }
  },
  "Gothik the Harvester": {
    "Harvest Soul": { plan: { gather: { who: "enemy", feet: 60 } } },
    "The Unrelenting": {},
    "The Dead Return": { kind: "summon", summon: { entry: "Shade", count: 1 }, plan: { door: "raise", feet: 60, all: true } }
  },
  "Grand Widow Faerlina": {
    "Poison Bolt Volley": {},
    "Faerlina Frenzy": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "The Congregation": {}
  },
  "Gri'lek": {
    "Gri'lek Ground Tremor": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Iron Blow": { type: "physical", until: "endOfNextTurn" },
    "Sweeping Strikes": { kind: "attack", plan: { attack: { allowance: "reach" } } }
  },
  "Grimlok": {
    "Bloodlust": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 0 } },
    "Shrink": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Crystalline Slumber": { until: "endOfNextTurn" }
  },
  "Grizzle": {
    "Grizzle Ground Tremor": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } },
    "Grizzle Cleave": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "Red Rage": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Grobbulus": {
    "Mutating Injection": { plan: { gather: { who: "creature", feet: 10 } } },
    "Slime Spray": {},
    "Slime Stream": {}
  },
  "Grubbis": {
    "Call the Tunnels": {},
    "Cloud of Disease": { type: "nature", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Guard Fengus": {
    "Fengus Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "On Patrol": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } },
    "Sound the Patrol": {}
  },
  "Guard Mol'dar": {
    "Mol'dar Shield Bash": { until: "endOfNextTurn" },
    "Shield Charge": { plan: { forced: { on: "fail", feet: 10, toward: "away" } } },
    "Call the Commons": {}
  },
  "Guard Slip'kik": {
    "Frost Trap": { until: "endOfNextTurn", area: "A 10 ft radius on the ground" },
    "Slip'kik Shield Bash": { until: "endOfNextTurn" },
    "Help the Guard": {}
  },
  "Gurubashi Berserker": {
    "Berserker's Bellow": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Halycon": {
    "Halycon Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Guard the Litter": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "The Litter": {}
  },
  "Hamhock": {
    "Hamhock Bloodlust": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 1 } },
    "Second Voice": { kind: "spell", spell: "Chain Lightning", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Hate'rel": {
    "Hate'rel's Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Hate'rel Shadow Shield": {},
    "Hate'rel Flurry": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Hazza'rah": {
    "Hazza'rah Mass Sleep": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Nightmare Illusions": { type: "shadow" },
    "Hazza'rah Mana Burn": { plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Hazzas": {
    "Bulldoze": { type: "physical", area: "A 40 ft line" },
    "Crushing Weight": { type: "physical", until: "endOfNextTurn" },
    "Roar of the Nightmare": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Hearthsinger Forresten": {
    "Enchanting Lullaby": {},
    "Forresten Demoralizing Shout": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Multi-Shot": { kind: "attack", plan: { attack: { allowance: 3 } } }
  },
  "Hedrum the Creeper": {
    "Paralyzing Poison": { until: "endOfNextTurn" },
    "Hedrum Web Explosion": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Hedrum Crazed": { kind: "attack", plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Heigan the Unclean": {
    "Heigan Eruption": { area: "A 20 ft radius on the ground" },
    "Heigan Plague Cloud": { plan: { door: "relocateSelf", feet: 60 } },
    "Decrepit Fever": { plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Herod": {
    "Herod Whirlwind": { kind: "attack", plan: { attack: { allowance: "reach" } } },
    "Herod Rushing Charge": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1 } } }
  },
  "High Inquisitor Fairbanks": {
    "Curse of Blood": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Fairbanks Sleep": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } }
  },
  "High Interrogator Gerstahn": {
    "The Question": {},
    "Break the Prisoner": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } },
    "Call the Wardens": {}
  },
  "High Priest Thekal": {
    "Force Punch": { type: "physical", plan: { gather: { who: "enemy", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Speed Slash": { type: "physical", plan: { gather: { who: "enemy", feet: "reach" } } },
    "Call the Guardians": {}
  },
  "High Priest Venoxis": {
    "Venoxis Poison Cloud": { plan: { gather: { who: "creature", feet: 10 } } },
    "Venoxis Venom Spit": {},
    "Call the Cobras": {}
  },
  "High Priestess Arlokk": {
    "Ravage": { type: "physical", until: "endOfNextTurn" },
    "Arlokk Whirlwind": { type: "physical", plan: { gather: { who: "enemy", feet: "reach" } } },
    "Call the Prowlers": {}
  },
  "High Priestess Jeklik": {
    "Jeklik Sonic Burst": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Jeklik Swoop": { type: "physical", until: "endOfNextTurn" },
    "Bloodseeker Bats": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } }
  },
  "High Priestess Mar'li": {
    "Mar'li Poison Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Enveloping Webs": { inflicts: { until: "endOfNextTurn", condition: "entangled", value: null, onFail: true }, plan: { gather: { who: "enemy", feet: 20 } } },
    "Spawn of Mar'li": {}
  },
  "Highlord Mograine": {
    "Highlord's Judgement": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } },
    "War Rides": {},
    "Ashes of the Order": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Highlord Omokk": {
    "Omokk Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 20, toward: "away" } } },
    "Omokk Frenzy": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1 } } },
    "The Spirestone Come": {}
  },
  "Houndmaster Grebmar": {
    "Grebmar Pummel": { type: "physical", until: "endOfNextTurn" },
    "Demoralizing Shout": { plan: { gather: { who: "enemy", feet: 10 }, bane: { kind: "attack", on: "fail" } } },
    "Loose the Pack": { kind: "attack", plan: { attack: { allowance: "reach" } } }
  },
  "Houndmaster Loksey": {
    "Release the Hounds": {},
    "Sic Them": {}
  },
  "Hukku": {
    "Hukku Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Hukku's Guardians": {},
    "Siphon the Cursed": {}
  },
  "Hydromancer Velratha": {
    "Crashing Wave": { plan: { forced: { on: "fail", feet: 10, toward: "away" } } },
    "Water Bolt": { until: "endOfNextTurn" },
    "Tidal Mending": { kind: "heal", heal: 8, clear: ["passive"] }
  },
  "Hydrospawn": {
    "Riptide": { plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Massive Geyser": { plan: { gather: { who: "creature", feet: 10 } } },
    "Hydrolings": {}
  },
  "Illyanna Ravenoak": {
    "Illyanna Multi-Shot": {},
    "Illyanna Volley": { plan: { gather: { who: "creature", feet: 150 } } },
    "Concussive Shot": { until: "endOfNextTurn" }
  },
  "Instructor Malicia": {
    "Malicia Call of the Grave": {},
    "Creeping Corruption": { plan: { gather: { who: "enemy", feet: 20 } } },
    "Malicia's Mending": { kind: "heal", heal: 8, clear: ["passive"] }
  },
  "Instructor Razuvious": {
    "Disrupting Shout": { type: "physical", plan: { gather: { who: "enemy", feet: 30 }, poolLoss: { pool: "mana", amount: 2, on: "fail" } } },
    "Razuvious Unbalancing Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Call the Class": {}
  },
  "Interrogator Vishas": {
    "Naughty Secrets": { until: "endOfNextTurn" },
    "Purged by Pain": { kind: "attack", clear: ["inflicts"], plan: { attack: { allowance: 1, landsOnHit: [{ condition: "bleeding", value: 2 }] } } }
  },
  "Ironaya": {
    "Ironaya Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 20, toward: "away" } } },
    "Ironaya War Stomp": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Titan's Reach": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Ironspine": {
    "Ironspine Poison Cloud": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 15 } } },
    "Bone Crush": { kind: "attack", clear: ["inflicts"], plan: { attack: { allowance: 1, landsOnHit: [{ condition: "prone", value: null }] } } }
  },
  "Jandice Barov": {
    "Illusions of Jandice": { kind: "spell", spell: "Mirror Image", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } },
    "Jandice Curse of Blood": { plan: { gather: { who: "enemy", feet: 20 } } },
    "Jandice Banish": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Jed Runewatcher": {
    "Blackhand Charge": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Heroic Strike": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1 } } },
    "Jed Shield Bash": { type: "physical", until: "endOfNextTurn" }
  },
  "Jergosh the Invoker": {
    "Call the Searing Blade": {},
    "Feed the Flames": { plan: { gather: { who: "creature", feet: 60 } } }
  },
  "Jin'do the Hexxer": {
    "Brain Wash Totem": {},
    "Shades of Jin'do": {},
    "Into the Pit": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Kam Deepfury": {
    "Deepfury Shield Slam": { type: "physical", until: "endOfNextTurn" },
    "Deepfury Shield Wall": {}
  },
  "Kirtonos the Herald": {
    "Swoop": { type: "physical", until: "endOfNextTurn" },
    "Wing Flap": { plan: { forced: { on: "fail", feet: 20, toward: "away" } } },
    "Kirtonos Disarm": { until: "endOfNextTurn" }
  },
  "Kresh": {
    "Into the Shell": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Shell Ram": { type: "physical" }
  },
  "Kurinnaxx": {
    "Sand Trap": { inflicts: { until: "endOfNextTurn", condition: "blinded", value: null, onFail: true } },
    "Kurinnaxx Wide Slash": { type: "physical" },
    "Kurinnaxx Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Lady Anacondra": {
    "Call the Raptors": {},
    "Serpent Lords' Storm": { plan: { gather: { who: "enemy", feet: 15 } } }
  },
  "Lady Blaumeux": {
    "Void Zone": {},
    "First Blood": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } },
    "Famine's Touch": {}
  },
  "Lady Illucia Barov": {
    "Illucia Shadow Shock": {},
    "Illucia Silence": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } },
    "Agony of the House": { plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Lady Sarevess": {
    "Slay Them": {},
    "Slip the Current": { kind: "attack", plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Landslide the Enthralled": {
    "Landslide Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Landslide Trample": { type: "physical" },
    "The Ground Gives Way": { until: "endOfNextTurn" }
  },
  "Lethon": {
    "Seeping Fog": {},
    "Shadow Bolt Whirl": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Draw Spirit": { until: "endOfNextTurn", clear: ["heal"], plan: { gather: { who: "enemy", feet: 60 }, drain: { fixed: 8 } } }
  },
  "Lethtendris": {
    "Lethtendris Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Enlarge": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "The Web Feeds": { kind: "utility", plan: { poolGain: { pool: "power", amount: 4 } } }
  },
  "Loatheb": {
    "Inevitable Doom": { plan: { gather: { who: "enemy", feet: 60 } } },
    "Spore Burst": { plan: { gather: { who: "enemy", feet: 20 } } },
    "Fungal Smother": { type: "nature" }
  },
  "Lord Alexei Barov": {
    "Alexei Veil of Shadow": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Barov Fire": {},
    "Unholy Pulse": { plan: { gather: { who: "enemy", feet: 15 } } }
  },
  "Lord Cobrahn": {
    "Call the Pythons": {},
    "Coiling Strike": { kind: "attack", clear: ["passive"], plan: { door: "disengage", attack: { allowance: 1, boons: 1 } } }
  },
  "Lord Incendius": {
    "Fire Storm": { plan: { gather: { who: "creature", feet: 60 } } },
    "Incendius Mighty Blow": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Curse of the Elemental Lord": { plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Lord Kazzak": {
    "Kazzak Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 120 } } },
    "Mark of Kazzak": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Kazzak Thunderclap": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } }
  },
  "Lord Kri": {
    "Kri Toxic Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Royal Cleave": { type: "physical" },
    "Kri Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Lord Magmus": {
    "Fiery Burst": { plan: { gather: { who: "creature", feet: 60 } } },
    "Magmus War Stomp": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Wake the Statues": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Lord Pythas": {
    "Thunderclap": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Call the Fang": {}
  },
  "Lord Roccor": {
    "Roccor Ground Tremor": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 20 } } },
    "Shock upon Shock": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Reflective Skin": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Lord Serpentis": {
    "Intruders in the Lair": {},
    "The Serpent King": { kind: "heal", heal: 6, clear: ["passive", "inflicts"], plan: { gather: { who: "ally", feet: 30 }, boon: { kind: "attack", on: "press" } } }
  },
  "Lord Valthalak": {
    "Shadow Wrath": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Spectral Assassins": {},
    "Valthalak Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 60 } } }
  },
  "Lord Vyletongue": {
    "Vyletongue Smoke Bomb": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Vyletongue's Volley": { type: "physical" },
    "Call the Shadowstalkers": {}
  },
  "Lorekeeper Polkelt": {
    "Corrosive Acid": {},
    "Noxious Catalyst": { plan: { bane: { kind: "resilience", on: "fail" } } },
    "Volatile Infection": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Loro": {
    "Loro Improved Blocking": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Loro Shield Slam": { type: "physical", until: "endOfNextTurn" },
    "Hold the Ledge": { plan: { forced: { on: "fail", feet: 15, toward: "away" } } }
  },
  "Lucifron": {
    "Impending Doom": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Lucifron's Curse": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Call the Protectors": {}
  },
  "Maexxna": {
    "Web Wrap": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Maexxna Web Spray": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Spiderlings": {}
  },
  "Magister Kalendris": {
    "Sentence of Pain": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Kalendris Dominate Mind": { until: "endOfNextTurn" },
    "Flay": { until: "endOfNextTurn" }
  },
  "Magistrate Barthilas": {
    "Barthilas Crowd Pummel": { type: "physical", plan: { gather: { who: "enemy", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Barthilas Mighty Blow": { type: "physical" },
    "Draining Strike": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } }
  },
  "Magmadar": {
    "Panic": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Lava Bomb": { area: "A 10 ft radius on the ground" },
    "Magmadar Frenzy": { kind: "attack", plan: { attack: { allowance: 2, boons: 1 } } }
  },
  "Majordomo Executus": {
    "Magic Reflection": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Teleport": {},
    "Call the Retinue": {}
  },
  "Maleki the Pallid": {
    "Ice Tomb": { until: "endOfNextTurn" },
    "Pallid Chill": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } },
    "Cold Hunger": { kind: "spell", spell: "Drain Life", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Marduk Blackpool": {
    "Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Marduk Shadow Shield": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Runeblade Sweep": { kind: "attack", plan: { attack: { allowance: "reach" } } }
  },
  "Meshlok the Harvester": {
    "Meshlok War Stomp": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Harvesting Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Root and Rot": { until: "endOfNextTurn" }
  },
  "Mijan": {
    "Mijan's Mending": { kind: "heal", heal: 12, clear: ["passive"] },
    "Thorns Aura": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Ward of the Six": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Moam": {
    "Arcane Eruption": { plan: { gather: { who: "creature", feet: 30 } } },
    "Turn to Stone": {},
    "Moam Trample": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Mor Grayhoof": {
    "Grayhoof Healing Touch": { plan: { selfHeal: true } },
    "Reflection": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Grayhoof Sleep": { until: "endOfNextTurn" }
  },
  "Mordresh Fire Eye": {
    "The Fire Eye": {},
    "Pyre of Bones": { plan: { gather: { who: "creature", feet: 10 } } },
    "Incite the Dead": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Morphaz": {
    "Call the Nightmare": {},
    "Hungering Bite": { type: "physical", clear: ["heal"], plan: { drain: { fixed: 5 } } },
    "Command the Brood": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Mother Smolderweb": {
    "Crystallize": { until: "endOfNextTurn" },
    "Strike from the Web": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "The Brood": {}
  },
  "Mr. Smite": {
    "Smite Slam": { type: "physical", until: "endOfNextTurn" },
    "Smite Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Nekrum Gutchewer": {
    "Call the Pyramid": {},
    "Fevered Plague": {},
    "Gutchewer's Bite": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Nerub'enkan": {
    "Crypt Scarabs": { type: "physical" },
    "Raise Undead Scarab": {},
    "Web Lash": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Noth the Plaguebringer": {
    "Curse of the Plaguebringer": { plan: { gather: { who: "ally", feet: 15 } } },
    "Plaguebringer's Blink": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 }, door: "relocateSelf", feet: 30, bane: { kind: "attack", on: "fail" } } },
    "The Balcony": {}
  },
  "Noxxion": {
    "Toxic Volley": { plan: { gather: { who: "enemy", feet: 15 } } },
    "Noxxion Uppercut": { type: "physical", plan: { forced: { on: "fail", feet: 10, toward: "away" } } },
    "The Body Splits": {}
  },
  "Obsidian Sentinel": {
    "Shard Burst": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } },
    "Glass Edge": { type: "physical" },
    "Dark Mirror": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Odo the Blindwatcher": {
    "Call the Roost": {},
    "Shriek in the Dark": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 30 } } }
  },
  "Oggleflint": {
    "Call the Tunnels": {},
    "Cleaving Charge": { kind: "attack", plan: { door: "disengage", attack: { allowance: "reach" } } }
  },
  "Ogom the Wretched": {
    "Withering Word": {},
    "Curse the Faithless": { plan: { gather: { who: "enemy", feet: 30 }, bane: { kind: "attack", on: "fail" } } },
    "The Dead Serve": {}
  },
  "Ok'thor the Breaker": {
    "Ok'thor's Polymorph": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Breaker's Burst": { plan: { gather: { who: "creature", feet: 15 } } },
    "Me Smash": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Olaf": {
    "Olaf Shield Slam": { type: "physical", until: "endOfNextTurn" },
    "Shield Wall": { kind: "none", reason: "aura", clear: ["damage", "inflicts", "heal", "passive"] },
    "Bash Aside": { plan: { forced: { on: "fail", feet: 10, toward: "away" } } }
  },
  "Old Serra'kis": {
    "Deep Pulse": { plan: { gather: { who: "creature", feet: 20 } } },
    "Out of the Dark": { kind: "attack", until: "endOfNextTurn", plan: { door: "disengage", attack: { allowance: 1, boons: 1 } } }
  },
  "Ossirian the Unscarred": {
    "Ossirian Enveloping Winds": { until: "endOfNextTurn" },
    "Ossirian Stomp": { type: "physical", plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 20, toward: "away" } } },
    "Sand Vortex": { type: "physical", until: "endOfNextTurn" }
  },
  "Ouro": {
    "Ouro Sweep": { type: "physical", plan: { gather: { who: "creature", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Ouro Sand Blast": { until: "endOfNextTurn" },
    "Scarabs": {}
  },
  "Overlord Ramtusk": {
    "Overlord's Thunderclap": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "For Agamaggan": { kind: "utility", clear: ["inflicts", "passive"], plan: { gather: { who: "ally", feet: 30 }, boon: { kind: "attack", on: "press" } } }
  },
  "Overlord Wyrmthalak": {
    "Wyrmthalak Demoralizing Shout": { plan: { gather: { who: "enemy", feet: 30 }, bane: { kind: "attack", on: "fail" } } },
    "Wyrmthalak Sweeping Slam": { type: "physical", plan: { forced: { on: "fail", feet: 10, toward: "away" } } },
    "The Overlord's Defense": {}
  },
  "Patchwerk": {
    "Hateful Strike": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } },
    "Play Time": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Slime Bolt": { plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Phalanx": {
    "Phalanx Fireball Volley": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Phalanx Mighty Blow": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Phalanx Thunderclap": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Plaguemaw the Rotting": {
    "Rotting Bite": { type: "physical" },
    "The Rot Spreads": { clear: ["inflicts"] },
    "The Stench Rolls Out": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Princess Huhuran": {
    "Wyvern Sting": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Huhuran Poison Bolt Volley": {},
    "Huhuran Frenzy": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Princess Moira Bronzebeard": {
    "The Empress's Mercy": { kind: "heal", heal: 10, clear: ["passive"] },
    "A Wife's Shield": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Royal Reproof": {}
  },
  "Princess Yauj": {
    "Royal Terror": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Great Heal": { kind: "heal", heal: 10, clear: ["passive"] },
    "Feed on the Fallen": {}
  },
  "Pusillin": {
    "Fire Blast": {},
    "Skip Away": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } },
    "Wildspawn Imps": {}
  },
  "Pyroguard Emberseer": {
    "Encage": { until: "endOfNextTurn" },
    "Emberseer Flame Buffet": {},
    "Emberseer Fire Nova": { plan: { gather: { who: "creature", feet: 15 } } }
  },
  "Pyromancer Loregrain": {
    "Molten Blast": {},
    "Scorching Totem": {},
    "Shock in Hand": { kind: "spell", spell: "Flame Shock", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Quartermaster Zigris": {
    "Hooked Net": { type: "physical" },
    "Stun Bomb": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 60 } } },
    "Drink Healing Potion": { plan: { selfHeal: true } }
  },
  "Ragglesnout": {
    "Dark Mending": { kind: "heal", heal: 8, clear: ["passive"] },
    "Litany of Agony": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Death's Head Litany": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 20 } } }
  },
  "Ramstein the Gorger": {
    "Ramstein Trample": { type: "physical", plan: { gather: { who: "enemy", feet: 10 } } },
    "Knockout": { type: "physical", until: "endOfNextTurn", plan: { forced: { on: "fail", feet: 10, toward: "away" } } },
    "Ramstein Flurry": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Ras Frostwhisper": {
    "Chill Nova": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } },
    "Freeze": { until: "endOfNextTurn" },
    "Frostbolt Volley": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Rattlegore": {
    "Rattlegore Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Rattlegore Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Rattlegore War Stomp": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Razorclaw the Butcher": {
    "Joint the Carcass": { kind: "attack", clear: ["inflicts"], plan: { attack: { allowance: 1, landsOnHit: [{ condition: "bleeding", value: 2 }] } } },
    "The Larder Door": { plan: { gather: { who: "creature", feet: 10 }, forced: { on: "fail", feet: 10, toward: "away" } } }
  },
  "Razorgore the Untamed": {
    "Razorgore War Stomp": { type: "physical", plan: { gather: { who: "enemy", feet: 15 } } },
    "Razorgore Fireball Volley": {},
    "The Brood's Keepers": {}
  },
  "Razorlash": {
    "Razorlash Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Shred the Green": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } },
    "Grasping Thorns": { until: "endOfNextTurn", plan: { forced: { on: "fail", feet: 20, toward: "toward" } } }
  },
  "Renataki": {
    "Thousand Blades": { type: "physical", plan: { gather: { who: "enemy", feet: 20 } } },
    "Renataki Gouge": { until: "endOfNextTurn" },
    "Renataki Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } }
  },
  "Rethilgore": {
    "Open the Kennels": {},
    "Into the Cell": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } }
  },
  "Revelosh": {
    "Arcing Bolt": {},
    "Thunder in the Stone": { plan: { gather: { who: "enemy", feet: 10 } } },
    "Scatter the Diggers": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Rhahk'Zor": {
    "Rhahk'Zor Slam": { type: "physical", until: "endOfNextTurn" },
    "Call the Diggers": {}
  },
  "Roogug": {
    "Call the Rumbler": {},
    "Lightning in the Stone": { until: "endOfNextTurn" }
  },
  "Rotgrip": {
    "Fatal Bite": { type: "physical" },
    "Drag Under": { until: "endOfNextTurn", plan: { forced: { on: "fail", feet: 10, toward: "toward" } } },
    "Churn the Water": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Ruuzlu": {
    "Ruuzlu Cleave": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Execute": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Right Hand of the Chief": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } }
  },
  "Sapphiron": {
    "Icebolt": { until: "endOfNextTurn" },
    "Sapphiron Frost Breath": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Sapphiron Life Drain": {}
  },
  "Scarlet Commander Mograine": {
    "Purify the Infidel": { kind: "attack", until: "endOfNextTurn", plan: { attack: { allowance: 1 } } },
    "Judgement of the Cathedral": {}
  },
  "Seeth'rel": {
    "Rime Burst": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Winter's Breath": { until: "endOfNextTurn" },
    "Frostbolt Answer": { kind: "spell", spell: "Frostbolt", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Sergeant Bly": {
    "Bly Shield Bash": { type: "physical", until: "endOfNextTurn" },
    "Revenge": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } },
    "Step and Strike": { kind: "attack", plan: { door: "disengage", attack: { allowance: 1 } } }
  },
  "Shade of Eranikus": {
    "Deep Slumber": { until: "endOfNextTurn" },
    "Eranikus War Stomp": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Eranikus Acid Breath": {}
  },
  "Shadow Hunter Vosh'gajin": {
    "Vosh'gajin Curse of Blood": { plan: { gather: { who: "enemy", feet: 30 } } },
    "Shadow Hunter's Hex": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Smolderthorn Answer": {}
  },
  "Shadowpriest Sezz'ziz": {
    "Send the Faithful": {},
    "Dark Mending": { kind: "heal", heal: 8, clear: ["passive"] },
    "Shadow Lash": {}
  },
  "Shazzrah": {
    "Shazzrah's Curse": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Shazzrah Counterspell": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Shazzrah Blink": { plan: { door: "relocateSelf", feet: 60 } }
  },
  "Sir Zeliek": {
    "Zeliek Wrath of the Light": { plan: { gather: { who: "enemy", feet: 10 } } },
    "Conqueror's Charge": { kind: "attack", until: "endOfNextTurn", plan: { attack: { allowance: 1 } } },
    "Hammer of the Fallen": { plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Skul": {
    "Skul Frost Shock": { until: "endOfNextTurn" },
    "Arcane Bolt": {},
    "Skul Frostbolt": { kind: "spell", spell: "Frostbolt", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Skum": {
    "Skum Discharge": { until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Lowered Horns": {}
  },
  "Sneed's Shredder": {
    "Shredder Terrify": { until: "endOfNextTurn" },
    "Distracting Pain": { type: "physical", plan: { bane: { kind: CASTING_TESTS, on: "press" } } }
  },
  "Solakar Flamewreath": {
    "Solakar War Stomp": { type: "physical", until: "endOfNextTurn", plan: { gather: { who: "creature", feet: 10 } } },
    "Hatch the Clutch": {},
    "Guard the Eggs": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Southsea Captain": {
    "Cut and Reload": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } }
  },
  "Stomper Kreeg": {
    "Booze Spit": { plan: { bane: { kind: "attack", on: "fail" } } },
    "Kreeg War Stomp": { plan: { gather: { who: "creature", feet: 10 } } },
    "Kreeg Whirlwind": { plan: { gather: { who: "creature", feet: "reach" } } }
  },
  "Stonespine": {
    "Stoop": { kind: "attack", plan: { attack: { allowance: 1, boons: 1 } } },
    "Stone Wings": { type: "physical", plan: { gather: { who: "enemy", feet: 10 } } },
    "Stonespine Stoneform": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Sulfuron Harbinger": {
    "Hand of Ragnaros": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } },
    "Flame Spear": { plan: { gather: { who: "creature", feet: 10 } } },
    "Inspire": { kind: "utility", clear: ["passive", "inflicts"], plan: { door: "allyAttack", feet: 30, boons: 1 } }
  },
  "Taerar": {
    "Seeping Fog": {},
    "Taerar Arcane Blast": { plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Taerar Bellowing Roar": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Taragaman the Hungerer": {
    "Uppercut": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Taragaman Fire Nova": { plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Targorr the Dread": {
    "Targorr Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Targorr Enrage": { kind: "none", reason: "narrative", clear: ["passive", "uses"] }
  },
  "Tendris Warpwood": {
    "Tendris Grasping Vines": { inflicts: { until: "endOfNextTurn", condition: "entangled", value: null, onFail: true }, plan: { gather: { who: "enemy", feet: 20 } } },
    "Tendris Entangle": { until: "endOfNextTurn" },
    "The Protectors Wake": {}
  },
  "Thaddius": {
    "Polarity Shift": { plan: { gather: { who: "enemy", feet: 60 } } },
    "Storm Chain": {},
    "Coil Overload": { type: "nature", plan: { gather: { who: "enemy", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } }
  },
  "Thane Korth'azz": {
    "Korth'azz Meteor": { plan: { gather: { who: "creature", feet: 10 } } },
    "Ride Them Down": { type: "physical" },
    "To Arms": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "The Beast": {
    "Flamebreak": { plan: { gather: { who: "creature", feet: 15 }, forced: { on: "fail", feet: 15, toward: "away" } } },
    "Beast Terrifying Roar": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Berserker Charge": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } }
  },
  "The Ravenian": {
    "Ravenian Trample": { type: "physical", plan: { gather: { who: "enemy", feet: 10 } } },
    "Ravenian Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Sundering Cleave": { kind: "attack", plan: { attack: { allowance: 3 } } }
  },
  "The Unforgiven": {
    "Unrelenting Anguish": {},
    "Vengeful Phantoms": {},
    "Unforgiven Grave Frost": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } }
  },
  "Theka the Martyr": {
    "Cursed Swarm": {},
    "Fevered Plague": {},
    "Strike of the Martyr": { kind: "attack", plan: { attack: { allowance: 1 } } }
  },
  "Timmy the Cruel": {
    "Timmy Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Ravenous Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Timmy's Howl": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Tinkerer Gizlock": {
    "Goblin Dragon Gun": {},
    "Satchel Bomb": { area: "A 5 ft radius on the ground" },
    "Flash Bomb": { until: "endOfNextTurn" }
  },
  "Tuten'kash": {
    "Web Spray": { until: "endOfNextTurn" },
    "Curse of Tuten'kash": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Wake the Nest": {}
  },
  "Twilight Lord Kelris": {
    "Twilight Command": { until: "endOfNextTurn", plan: { sideSwitch: { until: "endOfNextTurn" } } },
    "Dust to Dust": {}
  },
  "Urok Doomhowl": {
    "Intimidating Roar": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Urok Strike": { kind: "attack", clear: ["passive"], plan: { attack: { allowance: 1 } } },
    "Urok's Tribute": {}
  },
  "Vaelastrasz the Corrupt": {
    "Burning Adrenaline": { until: "endOfNextTurn" },
    "Vaelastrasz Flame Breath": {},
    "Vaelastrasz Tail Swipe": { type: "physical", plan: { gather: { who: "creature", feet: 15 } } }
  },
  "Vanndar Stormpike": {
    "Storm Bolt": { type: "physical", until: "endOfNextTurn" },
    "Vanndar Thunderclap": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Avatar of Dun Baldar": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] }
  },
  "Vectus": {
    "Searing Wave": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 15 } } },
    "Pillar of Flame": { area: "A 10 ft radius on the ground" },
    "The Students Rise": {}
  },
  "Vem": {
    "Vem Charge": { kind: "attack", clear: ["inflicts"], plan: { attack: { allowance: 1, landsOnHit: [{ condition: "prone", value: null }] } } },
    "Vem Knock Away": { type: "physical", plan: { forced: { on: "fail", feet: 15, toward: "away" } } },
    "Vem Knockdown": {}
  },
  "Verdan the Everliving": {
    "Grasping Vines": { type: "physical", inflicts: { until: "endOfNextTurn", condition: "entangled", value: null, onFail: true }, plan: { gather: { who: "creature", feet: 15 } } },
    "Trampling Roots": { type: "physical" }
  },
  "Vile'rel": {
    "Mend the Seven": { kind: "heal", heal: 10, clear: ["passive"] },
    "Ward of the Tomb": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Vile'rel's Rebuke": {}
  },
  "Viscidus": {
    "Poison Volley": { plan: { gather: { who: "enemy", feet: 60 } } },
    "Poison Shock": { plan: { gather: { who: "creature", feet: 15 } } },
    "Toxin": { until: "encounter" }
  },
  "Viscous Fallout": {
    "Viscous Fallout Toxic Volley": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } },
    "Seep Away": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } }
  },
  "War Master Voone": {
    "Voone Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Voone Mortal Strike": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Snap Kick": { type: "physical", until: "endOfNextTurn" }
  },
  "Warder Stilgiss": {
    "Vault Freeze": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 10 } } },
    "Verek's Thrash": { kind: "attack", plan: { attack: { allowance: 2 } } },
    "Frostbolt in Hand": { kind: "spell", spell: "Frostbolt", clear: ["damage", "inflicts", "heal", "passive"], plan: { freeMana: true } }
  },
  "Weaver": {
    "Second Breath": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Weave the Dream": { until: "endOfNextTurn" },
    "Tail Lash": { type: "physical", plan: { gather: { who: "creature", feet: 10 } } }
  },
  "Witch Doctor Zum'rah": {
    "Awaken the Graves": {},
    "Ward of Zum'rah": {},
    "Shadow Bolt Volley": { plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Wolf Master Nandos": {
    "Call the Worgs": {},
    "Mark the Prey": { kind: "utility", clear: ["passive"], plan: { door: "marked", boons: 1 } }
  },
  "Woodpaw Alpha": {
    "Den Roar": {}
  },
  "Wushoolay": {
    "Wushoolay Forked Lightning": {},
    "Wushoolay Lightning Cloud": { plan: { gather: { who: "creature", feet: 15 } } },
    "Storm-Mad Rush": { plan: { door: "disengage" } }
  },
  "Ysondre": {
    "Seeping Fog": {},
    "Lightning Wave": {},
    "Demented Spirits": { until: "endOfNextTurn", plan: { gather: { who: "enemy", feet: 30 } } }
  },
  "Zerillis": {
    "Weighted Net": { until: "endOfNextTurn" },
    "Loose": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Fall Back": { kind: "utility", clear: ["passive"], plan: { door: "disengage" } }
  },
  "Zevrim Thornhoof": {
    "Intense Pain": { plan: { gather: { who: "enemy", feet: 20 } } },
    "Cloven Rush": { kind: "attack", plan: { attack: { allowance: 1 } } },
    "Feed the Altar": { plan: { drain: { dealt: true } } }
  },
  "Zolo": {
    "Arc Lightning": { plan: { gather: { who: "enemy", feet: 15 } } },
    "Skeleton Totem": {},
    "Zolo Thunderclap": { until: "endOfNextTurn" }
  },
  "Zul'Lor": {
    "Reaping Cleave": { type: "physical", plan: { gather: { who: "enemy", feet: "reach" } } },
    "Champion's Challenge": { kind: "none", reason: "narrative", clear: ["damage", "inflicts", "heal", "passive"] },
    "Unbroken": { plan: { selfHeal: true } }
  }
});
