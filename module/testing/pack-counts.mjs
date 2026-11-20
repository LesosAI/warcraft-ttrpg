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
    count: 588, branches: 49, legacy: 84,
    why: "12 classes x 3 branches x 12 (the Chronomancer the tenth, D-847; the Necromancer's Flesh, Bone and Damned; the Sovereign's Dominion, Vainglorious and Ravenous, D-1128 to D-1130), the Chromatic Champion's 4 x 12 (04 §2, 02 §6) and the Death Knight's 2 x 12 (D-927), plus the seven Legacy branches x 12 that 04 §1's roster gives four of them (D-781)"
  },
  gadgets: {
    count: 16,
    why: "04 §2's Gadgets table under the Tinker: eight original gadgets plus eight additions (2026-10-24)"
  },
  spells: {
    count: 620,
    why: "07 holds 620 across eight schools and five tiers, including the 24 approved thematic additions, the Chromatic Champion's five Earth-Warder spells (Stone Grip, Thunderlash, Earthmeld, Earthen Spike, Shattering Bolt), the Chronomancer's 34 sand spells (D-847), and the Death Knight's 47 (35 new Death spells, Raise Dracolich among them, and twelve Restricted to it in Frost and Shadow; D-918, D-922, D-932), and the Necromancer's 50 new Death spells (12, 11 and 12 at tiers 1 to 3, 9 at tier 4, 6 at tier 5), and the Sovereign's 54 (12, 15 and 14 at tiers 1 to 3, 8 at tier 4, 5 at tier 5; D-1131, and the second batch's 18, D-1340)"
  },
  careers: { count: 53, why: "03 holds 53 across four tiers" },
  races: { count: 13, why: "02 §5's thirteen races: eleven mortal peoples, the Chromatic Outcast and the San'layn (D-1151)" },
  classes: { count: 14, why: "02 §7's fourteen classes (the Chronomancer the eleventh, D-847; the Death Knight the twelfth, D-917; the Necromancer the thirteenth; the Sovereign the fourteenth, D-1120)" },
  traits: {
    count: 76,
    why: "08 §5: form 17 (Deft the seventeenth, D-1124) + cut 4 + effect 11 + enchantment 28 = 60, matching 06 §3's roster, plus 16 Mount traits that belong to 08 §15 alone (D-399), Spectral the sixteenth (the Death Knight's Deathcharger, D-924)"
  },
  bestiary: {
    count: 376,
    why: "14 holds 376 across five weight classes: the prior 348 plus 26 researched tier 1/2 faction NPCs (BESTIARY-TIER12-EXPANSION.md), the Dracolich (D-932) and the Necromancer's Skeletal Archer; verification status is recorded in the production tracker"
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
    count: 673, classic: 517,
    why: "08 §7's weapon tables, every row (D-406 launchers included; the Sovereign's Claws under Unarmed, D-1123), plus §20's 25 named weapons and shot (D-632; ten Legendaries added by D-909), plus 517 Classic finds off the vendored record (D-685)"
  },
  armor: {
    count: 285, classic: 203,
    why: "08's armor categories, every row, §8's 12 shields (D-636), plus §20's 17 named suits and shields (D-632; five Legendaries added by D-909), plus 203 Classic finds off the vendored record (D-685)"
  },
  gear: {
    count: 1545, classic: 1052,
    why: "08 §9 to §17's catalogue tables by header name, two Augments a class (nine classes, the Broodstone the seventh, the Necromancer's Bonecharm the eighth and the Sovereign's Bloodglass the ninth, D-1133), §12's Blood vial (D-1107) and the Chronomancer's one ungraded Hourglass (D-847), the Necromancer's Phylactery, and §20's Epic consumables and the Grimoire (D-632) and its eight Legendary worn things and Augments (D-909), plus §11's Leggings and Trinket (D-686), Mantle (D-689), eighteen approved special designs and provisions (D-813), and 1,052 Classic finds off the vendored record (D-685, D-690, D-692)"
  },
  services: {
    count: 41,
    why: "08 §15's Hired transport (10) and §16's Lodging (7), Upkeep (5), Hire (9) and Services (10), one gear document a row; never carried, so the gear pack skips them"
  },
  rules: { count: 18, why: "one JournalEntry per chapter in docs/book" },
  criticals: { count: 3, why: "06 §8: Body, Head and Limb, d20 over seven bands each" }
});
