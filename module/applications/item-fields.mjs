/**
 * What an item sheet shows, per subtype, in the order the book prints it.
 *
 * PURE DATA, NO FOUNDRY IMPORTS — the same rule that keeps `module/rules/`
 * testable. `item-sheet.mjs` reads `foundry.applications.sheets` at import time
 * and cannot be loaded under Vitest at all, so anything worth asserting has to
 * live here.
 *
 * **The order is the book's, and that is the point** (D2 §3). A spell's fields
 * are 07 §9's — Mana, Action, Range, Target, Duration, Damage, Test,
 * Prerequisite, Classes — and an item's are D4 §10.1's — Rating, AP, Range,
 * Traits, Rarity, Budget, Cost, Weight, Provenance. `check-spells.ps1` and
 * `check-equipment.ps1` hold the chapters to those orders because the importer
 * depends on them; this holds the SHEET to the same order, so a reader who
 * knows the book can find a field on the sheet without hunting.
 *
 * A descriptor is `{ path, label, type }` where `path` is relative to
 * `item.system`. `type` chooses the widget:
 *
 *  - `text` / `number` / `checkbox` — a scalar
 *  - `coin` — copper, shown and typed as 08 §2's mixed coin (D-672)
 *  - `select` — a scalar with `choices` naming a `CONFIG.AZEROTH` key
 *  - `tags` — an array of strings, rendered as chips
 *  - `table` — an array of objects, rendered read-only with `columns`
 *
 * A field whose value is empty is **omitted from the render, never drawn
 * blank** — D4 §10.1's rule for the printed page, applied to the sheet.
 *
 * A descriptor may also carry `lock` and `hint`. **`lock` is the one place a
 * field is drawn READ-ONLY on a sheet its reader may otherwise edit**: a talent
 * embedded on a character is owned by the player, so `isEditable` is true and
 * `taken` was a number box that bypassed every refund rule the tree enforces
 * (the final review, 2026-09-13). `hint` is the words beside it saying why.
 */

// The rules layer owns what these things ARE; this file only says where they
// are drawn. Each returns keys and numbers, never words (CLAUDE.md §11).
import { categoryTraits } from "../rules/armor.mjs";
import { capacityParts } from "../rules/containers.mjs";
import { bagSlotsOf, isMount, wellsOf } from "../rules/slots.mjs";
import { useParts } from "../rules/consumables.mjs";
import { DISEASES } from "../rules/afflictions.mjs";
// Every profession that makes an item (O-662, D-1960).
import { craftsOf } from "../rules/recipes.mjs";

/** Fields every imported item carries, shown under the header. */
export const PROVENANCE_FIELDS = Object.freeze([
  { path: "source.document", label: "AZEROTH.Item.SourceDocument", type: "text" },
  { path: "source.section", label: "AZEROTH.Item.SourceSection", type: "text" }
]);

/**
 * D4 §10.1's economy run, shared by every physical item. Kept as one constant
 * because the order is a contract: Rarity, Budget, Cost, Weight, Provenance.
 */
const ECONOMY = Object.freeze([
  { path: "rarity", label: "AZEROTH.Item.Rarity", type: "select", choices: "rarities" },
  { path: "budget", label: "AZEROTH.Item.Budget", type: "number" },
  // Stored in copper and PRINTED in the coin a shop would name (08 §2,
  // D-672). `240` is not a price anybody quotes; `2s 40c` is, and the field
  // takes either back (`helpers/coins.mjs#copperFrom`).
  { path: "cost", label: "AZEROTH.Item.Cost", type: "coin" },
  { path: "weight", label: "AZEROTH.Item.Weight", type: "number" },
  { path: "provenance", label: "AZEROTH.Item.Provenance", type: "text" }
]);

/**
 * 08 §10's `1, one school`, on every physical item (D-690).
 *
 * The POINTS are the item's and the SCHOOL is the wearer's, chosen when the
 * thing is bought. The select is where that choice is made - drawn the way
 * `launcher` and `slot` are, empty on a locked sheet - and the derived line
 * beneath it says the choice is still to be made, because until it is the item
 * grants nothing at all. Once it is made the grant itself says it, in the
 * Grants block under the description, so the line goes quiet.
 */
const SCHOOL_POINTS = Object.freeze([
  { path: "school", label: "AZEROTH.Item.School", type: "select", choices: "schools" },
  { path: "schoolPoints", label: "AZEROTH.Item.SchoolPoints", type: "derived" }
]);

/**
 * What the thing costs the bags, on every physical item (05 *Speed and
 * movement*, 08 §11; D-735, D-736).
 *
 * DERIVED and read off the published weight the row above it prints, so the
 * two can never disagree: a 65 lb suit of plate says *4 lb* nowhere and
 * *6 bag slots* here. A mount says it is not carried at all, and a container
 * says what it adds while it is worn — the Backpack's own 8 was a fact the
 * sheet held all the numbers for and stated nowhere.
 */
/**
 * A GM's own bonuses on a physical thing (the lead, 2026-11-02): Spellpower in a
 * school, a Damage Rating, an Attack Test bonus and a Casting Test bonus.
 * `rules/item-bonuses.mjs` is the law. They are drawn on every editable sheet
 * whatever the thing is and however empty they are, so a GM can always type one
 * (an editable sheet keeps empty fields); `lock` makes them text for a player on
 * a copy they own, and `zeroEmpty` keeps a read-only sheet from printing four
 * zeros on every item in the book.
 */
const BONUSES = Object.freeze([
  { path: "bonus.spellpower.points", label: "AZEROTH.Item.BonusSpellpower", type: "number", lock: "ownedByPlayer", hint: "AZEROTH.Item.BonusLocked", zeroEmpty: true },
  { path: "bonus.spellpower.school", label: "AZEROTH.Item.BonusSpellpowerSchool", type: "select", choices: "schools", lock: "ownedByPlayer", hint: "AZEROTH.Item.BonusLocked" },
  { path: "bonus.damageRating", label: "AZEROTH.Item.BonusDamageRating", type: "number", lock: "ownedByPlayer", hint: "AZEROTH.Item.BonusLocked", zeroEmpty: true },
  { path: "bonus.attack", label: "AZEROTH.Item.BonusAttack", type: "number", lock: "ownedByPlayer", hint: "AZEROTH.Item.BonusLocked", zeroEmpty: true },
  { path: "bonus.casting", label: "AZEROTH.Item.BonusCasting", type: "number", lock: "ownedByPlayer", hint: "AZEROTH.Item.BonusLocked", zeroEmpty: true }
]);

const BAG_SLOTS = Object.freeze({ path: "bagSlots", label: "AZEROTH.Item.BagSlots", type: "derived" });

export const ITEM_FIELDS = Object.freeze({
  // ---- progression -------------------------------------------------------

  // 02 §5. A people touches no Health, Defense or ability score (D-545).
  race: Object.freeze([
    { path: "size", label: "AZEROTH.Item.Size", type: "select", choices: "sizes" },
    { path: "speed", label: "AZEROTH.Item.Speed", type: "number" },
    { path: "trait.name", label: "AZEROTH.Item.Trait", type: "text" },
    { path: "languages", label: "AZEROTH.Item.Languages", type: "tags" },
    { path: "classes", label: "AZEROTH.Item.ClassAccess", type: "tags" },
    {
      path: "talents", label: "AZEROTH.Item.RacialTalents", type: "table",
      columns: [
        { path: "name", label: "AZEROTH.Item.Name" },
        { path: "description", label: "AZEROTH.Item.Effect" }
      ]
    }
  ]),

  // 02 §6. Frame, the two pools, tradition access, and the feature ladder.
  class: Object.freeze([
    { path: "frame", label: "AZEROTH.Item.Frame", type: "select", choices: "frames" },
    // A choice off the config, as Power is; a text box here drew an empty
    // white field on every class without Momentum (D-611).
    { path: "momentum.name", label: "AZEROTH.Item.MomentumPool", type: "select", choices: "momentumTypes" },
    { path: "momentum.max", label: "AZEROTH.Item.PoolCap", type: "number" },
    // The schema and the pack say `power.name`; `power.type` read nothing, so no
    // class sheet ever showed its Power pool (sheet-matrix, run 1).
    { path: "power.name", label: "AZEROTH.Item.PowerPool", type: "select", choices: "powerTypes" },
    { path: "castingAbility", label: "AZEROTH.Item.CastingAbility", type: "select", choices: "abilities" },
    { path: "resiliences", label: "AZEROTH.Item.Resiliences", type: "tags" },
    { path: "schools", label: "AZEROTH.Item.Schools", type: "tags" },
    { path: "armor", label: "AZEROTH.Item.ArmorAccess", type: "tags" },
    { path: "shields", label: "AZEROTH.Item.Shields", type: "checkbox" },
    { path: "weapons", label: "AZEROTH.Item.WeaponAccess", type: "text" },
    // A branch is {name, description}, not a string: as tags it printed
    // [object Object] three times on every class sheet (sheet-matrix, run 1).
    {
      path: "branches", label: "AZEROTH.Item.Branches", type: "table",
      columns: [
        { path: "name", label: "AZEROTH.Item.Name" },
        { path: "description", label: "AZEROTH.Item.Effect" }
      ]
    },
    {
      path: "features", label: "AZEROTH.Item.Features", type: "table",
      columns: [
        { path: "level", label: "AZEROTH.Item.Level" },
        { path: "name", label: "AZEROTH.Item.Name" },
        { path: "description", label: "AZEROTH.Item.Effect" }
      ]
    },
    // 01 §6's suggested kit (D-636), the road kit included.
    {
      path: "kit", label: "AZEROTH.Item.Kit", type: "table",
      columns: [
        { path: "name", label: "AZEROTH.Item.Name" },
        { path: "quantity", label: "AZEROTH.Item.Quantity" }
      ]
    }
  ]),

  // A career is a hidden legacy type for one version (D-1903): a stale one still opens, and
  // shows nothing but its description until migration 0.17.0 deletes it.
  career: Object.freeze([]),

  // 04 §2's row: Tier, Talent, Ranks, Requires, Effect. The tier is the
  // BRANCH tier, gated by points spent in that branch, not by character level.
  talent: Object.freeze([
    { path: "className", label: "AZEROTH.Item.Class", type: "text" },
    { path: "branch", label: "AZEROTH.Item.Branch", type: "text" },
    // A Legacy's people (D-781); empty, and so not drawn, on a class's own three.
    { path: "legacy", label: "AZEROTH.Item.LegacyPeople", type: "text" },
    { path: "tier", label: "AZEROTH.Item.BranchTier", type: "number" },
    { path: "ranks", label: "AZEROTH.Item.Ranks", type: "number" },
    // **THE TREE IS THE DOOR, AND THE GM KEEPS THE OVERRIDE** (04 §1, D-713;
    // the final review, 2026-09-13). A talent embedded on a character is the
    // player's to edit — `isEditable` is true for its owner — so this number
    // box put a point back with no `canUntake`, no *between fights*, and
    // nothing to say a talent above it in the branch had just lost its gate.
    // Read-only on an owned talent for anybody but a GM; the pack copy and an
    // unowned talent are still typed into, which is how content is authored.
    {
      path: "taken", label: "AZEROTH.Item.RanksTaken", type: "number",
      lock: "ownedByPlayer", hint: "AZEROTH.Item.RanksTakenLocked"
    },
    { path: "requires", label: "AZEROTH.Item.Requires", type: "text" },
    { path: "uses.value", label: "AZEROTH.Item.UsesLeft", type: "number" },
    { path: "uses.max", label: "AZEROTH.Item.UsesMax", type: "number" },
    { path: "uses.per", label: "AZEROTH.Item.UsesPer", type: "select", choices: "usesPer" }
  ]),

  // A class feature (D-612): the class and level that granted it, what it
  // costs, how often, and the numbers it heals or deals. `uses.value` is the
  // one field a player changes in play; the rest is the table's.
  feature: Object.freeze([
    { path: "className", label: "AZEROTH.Item.Class", type: "text" },
    { path: "level", label: "AZEROTH.Item.Level", type: "number" },
    { path: "kind", label: "AZEROTH.Item.FeatureKind", type: "select", choices: "featureKinds" },
    { path: "action", label: "AZEROTH.Item.Action", type: "select", choices: "actions" },
    // 05 §11's kind word too (02 §5's War Stomp spends *4 Momentum*; the B8a pass).
    { path: "cost.pool", label: "AZEROTH.Item.CostPool", type: "select", choices: "costPoolTypes" },
    { path: "cost.amount", label: "AZEROTH.Item.CostAmount", type: "number" },
    { path: "casting", label: "AZEROTH.Item.CastingTest", type: "checkbox" },
    { path: "uses.value", label: "AZEROTH.Item.UsesLeft", type: "number" },
    { path: "uses.max", label: "AZEROTH.Item.UsesMax", type: "number" },
    { path: "uses.per", label: "AZEROTH.Item.UsesPer", type: "select", choices: "usesPer" },
    { path: "heal", label: "AZEROTH.Item.Heal", type: "text" },
    { path: "damage.amount", label: "AZEROTH.Item.DamageAmount", type: "text" },
    { path: "damage.type", label: "AZEROTH.Item.DamageType", type: "select", choices: "damageTypes" },
    { path: "resist", label: "AZEROTH.Item.Resist", type: "select", choices: "resiliences" }
  ]),

  talentTree: Object.freeze([
    { path: "className", label: "AZEROTH.Item.Class", type: "text" },
    {
      path: "branches", label: "AZEROTH.Item.Branches", type: "table",
      columns: [{ path: "name", label: "AZEROTH.Item.Name" }]
    }
  ]),

  // 04 §1's roster row and 02's *What it builds* (D-781). The lore is the
  // description, which the sheet draws as prose; the branch is twelve talents.
  legacy: Object.freeze([
    { path: "race", label: "AZEROTH.Item.Race", type: "text" },
    { path: "className", label: "AZEROTH.Item.Class", type: "text" },
    { path: "branch", label: "AZEROTH.Item.Branch", type: "text" },
    { path: "builds", label: "AZEROTH.Item.Builds", type: "text" }
  ]),

  // 03 §2's eight fields, in order (D-1931): Ability, Gathers, Tools, Makes, then the
  // skills, five at tier 1 and four at each tier after. Then what the character has done
  // with it: the Rank (D-1905) and the two picked at each tier (D-1906). The trainer
  // gates nothing any more (D-1913) and is shown so a stub's text is not lost.
  profession: Object.freeze([
    { path: "ability", label: "AZEROTH.Item.ProfessionAbility", type: "select", choices: "abilities" },
    { path: "gathers.family", label: "AZEROTH.Item.Gathers", type: "select", choices: "gatherFamilies" },
    { path: "gathers.skill", label: "AZEROTH.Item.GatherSkill", type: "select", choices: "skills" },
    { path: "tools", label: "AZEROTH.Item.ProfessionTool", type: "tags" },
    { path: "makes", label: "AZEROTH.Item.Makes", type: "text" },
    { path: "skills.1", label: "AZEROTH.Item.ProfessionSkills1", type: "tags", choices: "skills" },
    { path: "skills.2", label: "AZEROTH.Item.ProfessionSkills2", type: "tags", choices: "skills" },
    { path: "skills.3", label: "AZEROTH.Item.ProfessionSkills3", type: "tags", choices: "skills" },
    { path: "skills.4", label: "AZEROTH.Item.ProfessionSkills4", type: "tags", choices: "skills" },
    { path: "rank", label: "AZEROTH.Item.Rank", type: "number" },
    { path: "picks.2", label: "AZEROTH.Item.ProfessionPicks2", type: "tags", choices: "skills" },
    { path: "picks.3", label: "AZEROTH.Item.ProfessionPicks3", type: "tags", choices: "skills" },
    { path: "picks.4", label: "AZEROTH.Item.ProfessionPicks4", type: "tags", choices: "skills" },
    { path: "trainer", label: "AZEROTH.Item.Trainer", type: "text" }
  ]),

  // ---- magic -------------------------------------------------------------

  // 07 §9's field order exactly. `check-spells.ps1` enforces it on the page
  // because the importer reads it in order; this keeps the sheet in step.
  spell: Object.freeze([
    // A spell's school is a SPELL school (D-941): a Death spell drew a blank select.
    { path: "school", label: "AZEROTH.Item.School", type: "select", choices: "spellSchools" },
    { path: "tier", label: "AZEROTH.Item.Tier", type: "number" },
    { path: "mana", label: "AZEROTH.Item.Mana", type: "number" },
    // The pool 07 prints the cost in (D-944): Runic Power on a spell only a Death Knight learns.
    { path: "costPool", label: "AZEROTH.Item.CostPool", type: "select", choices: "spellCostPools" },
    // A rung of the ladder, or 07's timed *1 minute* (O-351).
    { path: "action", label: "AZEROTH.Item.Action", type: "select", choices: "spellActions" },
    { path: "range", label: "AZEROTH.Item.Range", type: "text" },
    { path: "target", label: "AZEROTH.Item.Target", type: "text" },
    { path: "duration.text", label: "AZEROTH.Item.Duration", type: "text" },
    { path: "damage.rating", label: "AZEROTH.Item.Damage", type: "number" },
    { path: "test.ability", label: "AZEROTH.Item.Test", type: "text" },
    { path: "prerequisite", label: "AZEROTH.Item.Prerequisite", type: "text" },
    { path: "classes", label: "AZEROTH.Item.ClassAccess", type: "tags" },
    // Read off the effect by the parser (D-625), after the chapter's own run.
    { path: "heal.amount", label: "AZEROTH.Item.HealAmount", type: "number" },
    { path: "heal.perTurn", label: "AZEROTH.Item.HealPerTurn", type: "number" }
  ]),

  // ---- equipment ---------------------------------------------------------

  // D4 §10.1: Rating, AP, Range, Traits, Rarity, Budget, Cost, Weight,
  // Provenance. A weapon has no AP, so that slot is simply absent — the field
  // is omitted, never written empty.
  weapon: Object.freeze([
    { path: "rating", label: "AZEROTH.Item.Rating", type: "number" },
    { path: "range", label: "AZEROTH.Item.Range", type: "number" },
    { path: "traits", label: "AZEROTH.Item.Traits", type: "tags" },
    // 08 §7's Type column (the Legacy branches' door 15): what Axe and Hammer and
    // Storm Bolt read. A GM's own weapon is typed here; the parser stamps a pack's.
    { path: "weaponType", label: "AZEROTH.Item.WeaponType", type: "select", choices: "weaponTypes" },
    // What it shoots with, and what a shot is cut to (08 §7's Fits column, D-641).
    { path: "launcher", label: "AZEROTH.Item.Launcher", type: "select", choices: "launcherKinds" },
    { path: "fits", label: "AZEROTH.Item.Fits", type: "tags", choices: "launcherKinds" },
    // A Legendary's own rune slots by grip (08 §20's table, D-919): a Death Knight's count.
    { path: "runeSlots.two", label: "AZEROTH.Item.RuneSlotsTwo", type: "number" },
    { path: "runeSlots.one", label: "AZEROTH.Item.RuneSlotsOne", type: "number" },
    ...SCHOOL_POINTS,
    ...BONUSES,
    ...ECONOMY,
    // **WHO MAKES IT** (D-1918, D-1960): *Crafted by Blacksmithing, tier 1*, every profession
    // its stamp names, off 08's Crafting tables. Derived from the stored stamp and read-only:
    // the parser writes it and a GM never types it (O-673).
    { path: "craft", label: "AZEROTH.Item.CraftedBy", type: "derived" },
    // A bundle's count (D-407); a weapon that is not shot carries none.
    { path: "quantity", label: "AZEROTH.Item.Quantity", type: "number" },
    BAG_SLOTS,
    { path: "equipped", label: "AZEROTH.Item.Equipped", type: "checkbox" },
    { path: "offHand", label: "AZEROTH.Item.OffHand", type: "checkbox" }
  ]),

  armor: Object.freeze([
    { path: "category", label: "AZEROTH.Item.ArmorCategory", type: "select", choices: "armorCategories" },
    { path: "shield", label: "AZEROTH.Item.Shield", type: "checkbox" },
    // Body Armor Points over the category's: a named suit's margin, Reinforced, a shield's own (D-632).
    { path: "apBonus", label: "AZEROTH.Item.ApBonus", type: "number" },
    // What the suit actually stops, category and bonus together: derived by
    // `ArmorData#prepareDerivedData` and never stored, so it is read-only.
    // Without it a Reinforced suit showed a bonus of 1 and no Armor Points at
    // all, and read as no better than the Common one (the lead, 2026-09-06).
    { path: "armorPoints", label: "AZEROTH.Sheet.ArmorPoints", type: "derived" },
    { path: "traits", label: "AZEROTH.Item.Traits", type: "tags" },
    // 08 §5's Cut, which moves Armor Points between locations and pays for
    // them. It was STORED ON TWENTY SUITS AND DRAWN NOWHERE, so a brigandine
    // never said it was Harnessed (the lead, 2026-09-07).
    { path: "cuts", label: "AZEROTH.Item.Cuts", type: "tags", choices: "armorCuts" },
    // What the CATEGORY carries: 08 §8 makes Mail and Plate Encumbering and
    // says it nowhere else, so a plate suit's Traits row was empty and the
    // suit read as though it had none. Derived, never stored (D-512).
    { path: "suitTraits", label: "AZEROTH.Item.SuitTraits", type: "derived" },
    ...SCHOOL_POINTS,
    ...BONUSES,
    ...ECONOMY,
    // **WHO MAKES IT** (D-1918, D-1960): *Crafted by Blacksmithing, tier 1*, every profession
    // its stamp names, off 08's Crafting tables. Derived from the stored stamp and read-only:
    // the parser writes it and a GM never types it (O-673).
    { path: "craft", label: "AZEROTH.Item.CraftedBy", type: "derived" },
    BAG_SLOTS,
    { path: "equipped", label: "AZEROTH.Item.Equipped", type: "checkbox" }
  ]),

  gear: Object.freeze([
    { path: "traits", label: "AZEROTH.Item.Traits", type: "tags" },
    // Which of 08 §11's thirteen slots it is worn in, or none (D-686,
    // D-689). Nullable, as `launcher` is on a weapon: most gear is worn in
    // no slot at all.
    { path: "slot", label: "AZEROTH.Item.Slot", type: "select", choices: "wornSlots" },
    // What a Short Rest may eat or drink of it (08 §12, D-733). Stamped by the
    // parser off the shelf's own category cell; editable so a GM can mark a
    // hand-made stew, since a thing that is not in the chapter has no row to
    // be read off.
    { path: "provision", label: "AZEROTH.Item.Provision", type: "select", choices: "provisionKinds" },
    // 08 §9's Augment, where this is one: whose it is and what it is worth
    // on a Casting Test (07 §3, D-674). DERIVED from the section and the
    // name, so the sheet cannot disagree with the pack; the field is absent
    // on everything that is not an Augment, as an empty field always is.
    { path: "augment.className", label: "AZEROTH.Item.AugmentClass", type: "derived" },
    { path: "augment.bonus", label: "AZEROTH.Item.AugmentBonus", type: "derived" },
    // What it holds, what it has to spend, and what pressing Use does
    // (08 §11 to §13; D-668, D-671). All three were stored and none was drawn:
    // a backpack's sheet never said 40 lb and a poison's never said it was a
    // coating (the lead, 2026-09-07).
    { path: "capacity", label: "AZEROTH.Item.Capacity", type: "derived" },
    { path: "charges", label: "AZEROTH.Item.Charges", type: "derived" },
    { path: "use", label: "AZEROTH.Item.Use", type: "derived" },
    ...SCHOOL_POINTS,
    ...BONUSES,
    ...ECONOMY,
    // **WHO MAKES IT** (D-1918, D-1960): *Crafted by Blacksmithing, tier 1*, every profession
    // its stamp names, off 08's Crafting tables. Derived from the stored stamp and read-only:
    // the parser writes it and a GM never types it (O-673).
    { path: "craft", label: "AZEROTH.Item.CraftedBy", type: "derived" },
    // **WHAT KIND OF MATERIAL IT IS** (08 §17, D-1958): *Ore, tier 1*. Derived from the stamp.
    { path: "material", label: "AZEROTH.Item.Material", type: "derived" },
    { path: "quantity", label: "AZEROTH.Item.Quantity", type: "number" },
    BAG_SLOTS,
    { path: "equipped", label: "AZEROTH.Item.Equipped", type: "checkbox" }
  ]),

  // 08 §5 owns the fifty-four trait definitions; 06 §3 only names them (D-391).
  // This is the definition, so it carries the mechanics.
  trait: Object.freeze([
    { path: "kind", label: "AZEROTH.Item.TraitKind", type: "select", choices: "traitKinds" },
    { path: "family", label: "AZEROTH.Item.Family", type: "text" },
    { path: "grade", label: "AZEROTH.Item.Grade", type: "text" },
    { path: "school", label: "AZEROTH.Item.School", type: "select", choices: "schools" },
    { path: "firesOn", label: "AZEROTH.Item.FiresOn", type: "text" },
    { path: "value", label: "AZEROTH.Item.Value", type: "number" },
    { path: "cost", label: "AZEROTH.Item.Cost", type: "number" }
  ])
});

/** Read `system.a.b.c` off a plain object. */
export function readPath(source, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), source);
}

/**
 * A field is drawn only when it holds something.
 *
 * D4 §10.1 omits an inapplicable field rather than printing it empty, and a
 * sheet full of blank rows is the same fault in another medium. `false` and `0`
 * are values, not absences — an unequipped weapon and a Rating of 0 both matter.
 */
export function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Whether a descriptor's `lock` holds for this reader.
 *
 * One rule today, and it is named rather than implied: `ownedByPlayer` locks a
 * field on an item embedded on an Actor for anybody who is not a GM. The pack
 * copy, an unowned world item and the GM's own view are untouched.
 *
 * @param {string|null|undefined} lock
 * @param {{owned?: boolean, isGM?: boolean}} reader
 */
export function fieldLocked(lock, { owned = false, isGM = false } = {}) {
  if (lock !== "ownedByPlayer") return false;
  return Boolean(owned) && !isGM;
}

/**
 * The fields to draw for one item, in the book's order, with empties dropped.
 *
 * @param {string} type            The item subtype.
 * @param {object} system          The item's `system` data.
 * @param {object} [reader]
 * @param {boolean} [reader.editable]  An editable sheet keeps empty fields, so
 *                                 they can be filled in; a locked one hides them.
 * @param {object|null} [reader.labels]  Localised words for a derived line.
 * @param {boolean} [reader.owned]  Whether the item is embedded on an Actor.
 * @param {boolean} [reader.isGM]   Whether the reader is a GM.
 */
export function fieldsFor(type, system, { editable = false, labels = null, owned = false, isGM = false } = {}) {
  const spec = ITEM_FIELDS[type] ?? [];
  return spec
    .map(field => ({
      ...field,
      // A locked field is drawn as TEXT even on an editable sheet; the sheet
      // reads this rather than working the rule out a second time.
      readOnly: fieldLocked(field.lock, { owned, isGM }),
      value: field.type === "derived" ? derivedValue(field.path, system, labels) : readPath(system, field.path)
    }))
    .filter(field => editable || (hasValue(field.value) && !(field.zeroEmpty && Number(field.value) === 0)));
}

/**
 * The words a derived line prints, where a caller passes none.
 *
 * A derived line is composed HERE, in the pure module, so it can be tested;
 * the words come in from the sheet, already localised, because this file may
 * not touch `game.i18n` (CLAUDE.md §11). `item-sheet.mjs#derivedWords()` fills
 * the bag from `lang/en.json` and `item-fields.test.mjs` asserts every key a
 * line reads is one the sheet supplies.
 */
const DERIVED_WORDS = Object.freeze({
  body: "Body",
  head: "Head",
  limb: "Limb",
  encumbering: "Encumbering",
  capacityWeight: "{n} lb of gear",
  capacityCount: "{n} {of}",
  chargesOf: "{value} of {max}",
  chargesUnit: "a {unit}",
  bagSlotsTakes: "Takes {n} bag slots",
  // The only count that can be one: a container adds 2 at the least and a
  // mount 16, so neither needs a singular of its own.
  bagSlotsTakesOne: "Takes 1 bag slot",
  bagSlotsNone: "Not carried",
  bagSlotsAdds: "Adds {n} bag slots while worn",
  bagSlotsCarries: "Adds {n} bag slots while it is with you",
  bagSlotsWhy: Object.freeze({
    tooBig: "Too big to travel on a person",
    words: "Its Carries figure is not a weight, so it adds no bag slots",
    unknownKind: "Nothing prices what it holds in bag slots",
    noMount: "Adds nothing without a mount"
  }),
  awaiting: Object.freeze({
    spellpower: "{n} Spellpower, awaiting a school",
    ward: "{n} Ward, awaiting a school"
  }),
  hold: Object.freeze({}),
  // Who makes it and what it is made of (D-1918, D-1958): the frames and the two enums.
  craftedBy: "Crafted by {trade}, tier {tier}",
  craftedByMore: "{trade}, tier {tier}",
  materialTier: "{family}, tier {tier}",
  professions: Object.freeze({}),
  materialFamilies: Object.freeze({}),
  consumable: Object.freeze({}),
  action: Object.freeze({}),
  target: Object.freeze({}),
  goesOn: Object.freeze({}),
  afflictions: Object.freeze({ statuses: Object.freeze({}), beat: Object.freeze({}) })
});

/**
 * A poison's Carried descriptor as one readable line (D12), the localised
 * words handed in. Pure: `readCarried` made the descriptor, this prints it.
 */
export function carriedLine(carried, words = {}) {
  if (!carried || typeof carried !== "object") return null;
  const w = words.afflictions ?? {};
  if (carried.carried === false) return w.notCarried ?? "";
  const parts = [];
  if (carried.value > 0) parts.push(fill(w.poisoned ?? "", { n: carried.value }));
  for (const id of carried.statuses ?? []) {
    if (id === "poisoned" && carried.value > 0) continue;
    parts.push(w.statuses?.[id] ?? id);
  }
  if (carried.damage > 0) parts.push(fill(w.damage ?? "", { n: carried.damage }));
  if (carried.fatigue > 0) parts.push(fill(w.fatigue ?? "", { n: carried.fatigue }));
  if (carried.firstTestBane === "attack") parts.push(w.baneAttack ?? "");
  if (carried.firstTestBane === "casting") parts.push(w.baneCasting ?? "");
  if (carried.healingFactor === 0.5) parts.push(w.halveHealing ?? "");
  const beats = (carried.beats ?? []).map(b => w.beat?.[b] ?? b);
  const line = joinParts(parts);
  if (!line) return null;
  return beats.length ? `${line} (${beats.join(", ")})` : line;
}

/** Fill `{name}` placeholders. The sheet's i18n does this; the bag carries the template. */
function fill(template, params) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ""));
}

/** Join the parts of a derived line the way every other derived line joins them. */
const joinParts = parts => {
  const kept = parts.filter(p => p !== null && p !== undefined && String(p).trim() !== "");
  return kept.length ? kept.join(" · ") : null;
};

/**
 * A derived figure as ONE STRING, wherever it is drawn: the item sheet's own
 * line and the inline detail under a row both read this. `system.armorPoints`
 * is a map by location, and left as an object it printed `[object Object]`
 * on every row that carried a suit (D-667).
 *
 * @param {string} path
 * @param {object} system    The PREPARED system: a derived figure is absent
 *                           from a raw source.
 * @param {object|null} labels  Localised location names; the English words
 *                           stand in for a caller without an i18n table.
 * @returns {string|null}
 */
export function derivedValue(path, system, labels = null) {
  const words = { ...DERIVED_WORDS, ...(labels ?? {}) };
  if (path === "armorPoints") {
    const ap = system?.armorPoints ?? null;
    if (!ap || typeof ap !== "object") return null;
    const parts = ["body", "head", "limb"]
      .filter(key => (ap[key] ?? 0) > 0)
      .map(key => `${words[key] ?? key} ${ap[key]}`);
    return parts.length ? parts.join(" \u00b7 ") : null;
  }

  // 08 \u00a78's category table is the only place Mail and Plate are called
  // Encumbering, so nothing on a plate suit said so.
  if (path === "suitTraits") {
    return joinParts(categoryTraits(system?.category, system?.traits ?? [])
      .map(key => words[key] ?? key));
  }

  // What the thing costs the bags, and what it adds (05, 08 \u00a711; D-735).
  //
  // Composed HERE off the stored weight and capacity rather than read off
  // `system.bagSlots`, so the line is the same on a prepared document and on
  // the pack source a census walks.
  if (path === "bagSlots") {
    const mount = isMount(system);
    const holds = wellsOf(system, { mounted: true });
    const n = bagSlotsOf(system);
    const takes = mount
      ? words.bagSlotsNone
      : fill(n === 1 ? words.bagSlotsTakesOne : words.bagSlotsTakes, { n });
    // A Barrel, a rowboat, a Component pouch: it looks like a holder and adds
    // nothing, and the reason is the only useful thing to print.
    const adds = holds.reason && holds.reason !== "notAHolder"
      ? (words.bagSlotsWhy?.[holds.reason] ?? null)
      : (holds.wells > 0
        ? fill(mount ? words.bagSlotsCarries : words.bagSlotsAdds,
          { n: holds.wells, of: words.hold?.[holds.of] ?? holds.of ?? "" }).trim()
        : null);
    return joinParts([takes, adds]);
  }

  // 08 \u00a711's Holds and Carries runs.
  if (path === "capacity") {
    const held = capacityParts(system?.capacity ?? null);
    if (!held) return null;
    const line = held.key === "count"
      ? fill(words.capacityCount, { n: held.n, of: words.hold?.[held.of] ?? held.of ?? "" })
      : fill(words.capacityWeight, { n: held.n });
    return joinParts([line.trim(), held.note]);
  }

  // A waterskin's day of water (08 \u00a711).
  if (path === "charges") {
    const c = system?.charges ?? null;
    if (!c || c.max === null || c.max === undefined) return null;
    // The unit is the CHAPTER'S OWN WORD ("a day"), so it is filled into a
    // localised frame rather than translated.
    return joinParts([
      fill(words.chargesOf, { value: c.value ?? 0, max: c.max }),
      c.unit ? fill(words.chargesUnit, { unit: c.unit }) : null
    ]);
  }

  // 08 \u00a710's `1, one school`, while the school is still unchosen (D-690).
  // The item grants NOTHING until it is picked, and the fault this line exists
  // for was exactly that silence: fifteen items stamped the points and no
  // reader anywhere looked at them.
  if (path === "schoolPoints") {
    // Chosen: the grant itself says it, under the description.
    if (system?.school) return null;
    const held = system?.schoolPoints ?? null;
    if (!held || typeof held !== "object") return null;
    return joinParts(Object.entries(held)
      .filter(([, n]) => Number(n) > 0)
      .map(([family, n]) => fill(words.awaiting?.[family] ?? "", { n })));
  }

  // **WHO MAKES IT** (D-1918, D-1960): *Crafted by Blacksmithing, tier 1 · Engineering, tier 1*.
  if (path === "craft") {
    const stamps = craftsOf({ type: system?.type ?? "gear", system: { craft: system?.craft ?? null } });
    if (!stamps.length) return null;
    return joinParts(stamps.map((s, i) => fill(i === 0 ? words.craftedBy : words.craftedByMore,
      { trade: words.professions?.[s.trade] ?? s.trade, tier: s.tier })));
  }

  // **WHAT KIND OF MATERIAL IT IS** (D-1958): *Ore, tier 1*, or the family alone where no tier is stated.
  if (path === "material") {
    const m = system?.material ?? null;
    if (!m || !m.family) return null;
    const family = words.materialFamilies?.[m.family] ?? m.family;
    return m.tier === null || m.tier === undefined ? family : fill(words.materialTier, { family, tier: m.tier });
  }

  // What the Use button does (08 \u00a712, \u00a713).
  if (path === "use") {
    const held = useParts(system?.use ?? null);
    if (!held) return null;
    return joinParts([
      words.consumable?.[held.kind] ?? held.kind,
      words.action?.[held.action] ?? held.action,
      words.goesOn?.[held.goesOn] ?? held.goesOn,
      words.target?.[held.target] ?? held.target,
      held.cures ? fill(words.afflictions?.cures ?? "", { name: DISEASES[held.cures]?.name ?? held.cures }) : null,
      held.carried ? fill(words.afflictions?.carried ?? "", { line: carriedLine(held.carried, words) ?? "" }) : null,
      held.note
    ]);
  }

  const held = readPath(system, path);
  return held === null || held === undefined || typeof held === "object" ? null : String(held);
}
