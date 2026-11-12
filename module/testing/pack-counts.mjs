/**
 * What each compendium pack holds, in one place.
 *
 * **This is the `check-bookparity.ps1` pattern** (CLAUDE.md §20): the numbers
 * were stated twice - in `tools/check-packs.mjs`, which diffs `packs-src`
 * against the chapters, and again in `module/testing/quench-classic.mjs`,
 * which counts the COMPILED pack in a live world. The gear count went stale
 * in the Quench copy twice in one day (D-689's Mantle, then D-690's fourteen
 * recovered finds) and took the whole in-Foundry run red both times, on a
 * number that had legitimately moved.
 *
 * **Both readings are kept**, because they catch different things. The
 * checker reads the source and fails on a parser that returned half a
 * chapter; Quench reads the LevelDB and fails when a world held the pack open
 * through a build, which reports success and writes nothing. Two readers of
 * one number is the point. Two copies of the number was the bug.
 *
 * No imports, so a browser module and a node script can both read it.
 *
 * `classic` is the subset of an equipment pack rendered from the vendored
 * record rather than from a chapter (D-685, D-690); the other packs have none.
 */
export const PACK_COUNTS = Object.freeze({
  conditions: { count: 15, why: "A1 holds fifteen (D-307, D-472, D-519, D-695)" },
  talents: {
    count: 492, branches: 41, legacy: 84,
    why: "10 classes x 3 branches x 12 (the Chronomancer the tenth, D-847) and the Chromatic Champion's 4 x 12 (04 §2, 02 §6), plus the seven Legacy branches x 12 that 04 §1's roster gives four of them (D-781)"
  },
  gadgets: {
    count: 16,
    why: "04 §2's Gadgets table under the Tinker: eight original gadgets plus eight additions (2026-10-24)"
  },
  spells: {
    count: 469,
    why: "07 holds 469 across seven schools and five tiers, including the 24 approved thematic additions the Chromatic Champion's five Earth-Warder spells (Stone Grip, Thunderlash, Earthmeld, Earthen Spike, Shattering Bolt), and the Chronomancer's 34 sand spells (D-847)"
  },
  careers: { count: 53, why: "03 holds 53 across four tiers" },
  races: { count: 12, why: "02 §5's twelve races: eleven peoples and the Chromatic Outcast" },
  classes: { count: 11, why: "02 §7's eleven classes (the Chronomancer the eleventh, D-847)" },
  traits: {
    count: 74,
    why: "08 §5: form 16 + cut 4 + effect 11 + enchantment 28 = 59, matching 06 §3's roster, plus 15 Mount traits that belong to 08 §15 alone (D-399)"
  },
  bestiary: {
    count: 374,
    why: "14 holds 374 across five weight classes: the prior 348 plus 26 researched tier 1/2 faction NPCs (BESTIARY-TIER12-EXPANSION.md); verification status is recorded in the production tracker"
  },
  legacies: { count: 7, why: "15 §2's seven, one per Legacy on 04 §1's roster, lore and no ranks (D-781)" },
  affixes: {
    count: 76,
    why: "08 §6: 27 prefixes + 12 attribute + 7 Ward + 7 Spellpower + 23 skill suffixes. The POOLS, not the cross-product — see D2 §8.1"
  },
  // The three equipment packs also render the vendored Classic record through
  // `module/rules/classic-loot.mjs` (D-685), so their counts are the chapter's
  // plus the finds. 2,115 records convert to 1,771 documents: 296 are folded
  // into a class set's suit (L3) and 47 cannot reach their rarity's budget
  // floor and are refused. It was 1,755 against 64 until D-690 gave a spell
  // power line with no school its points at 08 §10's rate: fourteen records
  // that could not reach their floor now can. D-692 added three, all gear: a
  // found Epic spends to 7 rather than to 5 and a found RARE to 5 rather than
  // to 3, and a set bonus that is an 08 §6 grant is folded into the item's own
  // lines instead of quoted. The Rare's ceiling is what let *Heart of the
  // Scale* through - its whole conversion is a converting `Use:` at 4, which
  // 08 §4's own 3 could not buy, so it reached no floor and was refused.
  weapons: {
    count: 662, classic: 517,
    why: "08 §7's weapon tables, every row (D-406 launchers included), plus §20's 15 named weapons and shot (D-632), plus 517 Classic finds off the vendored record (D-685)"
  },
  armor: {
    count: 280, classic: 203,
    why: "08's armor categories, every row, §8's 12 shields (D-636), plus §20's 12 named suits and shields (D-632), plus 203 Classic finds off the vendored record (D-685)"
  },
  gear: {
    count: 1531, classic: 1052,
    why: "08 §9 to §17's catalogue tables by header name, two Augments a class (seven classes, the Broodstone the seventh) and the Chronomancer's one ungraded Hourglass (D-847), and §20's Epic consumables and the Grimoire (D-632), plus §11's Leggings and Trinket (D-686), Mantle (D-689), eighteen approved special designs and provisions (D-813), and 1,052 Classic finds off the vendored record (D-685, D-690, D-692)"
  },
  services: {
    count: 41,
    why: "08 §15's Hired transport (10) and §16's Lodging (7), Upkeep (5), Hire (9) and Services (10), one gear document a row; never carried, so the gear pack skips them"
  },
  rules: { count: 18, why: "one JournalEntry per chapter in docs/book" },
  criticals: { count: 3, why: "06 §8: Body, Head and Limb, d20 over seven bands each" }
});
