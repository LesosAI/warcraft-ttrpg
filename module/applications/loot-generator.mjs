/**
 * The loot generator (D-666): what a party finds, by scenario and tier,
 * offered to the GM row by row before anything is created.
 *
 * The window is the Forge's shape, as the creator and the NPC generator are
 * (CLAUDE.md §5): a private `#state` that survives renders, `#load()`
 * reading the packs once, `_onRender` binding `change` on the window's
 * `data-loot` controls, a summary of reasons and notes beside the submit,
 * and an `apply(state)` the batches drive without clicking. Every bounded
 * choice is a `<select>` (the lead, 2026-09-06).
 *
 * The law is `rules/loot.mjs` and the legality is `rules/forge.mjs#plan`,
 * so a row the chapter refuses never reaches the list. The odds are the
 * TOOL'S and the window says so on its own face: D-552 stands.
 *
 * What it makes is what the Forge makes - `flags.azeroth-rpg.generated`
 * carries the whole base - so a generated item opens in the Forge and
 * re-forges from what it was.
 *
 * **A DUNGEON IS THE WHOLE DUNGEON, AND A BOSS IS ONE BOSS** (D-703). The
 * Dungeon select reads the dungeon alone - it used to read `<dungeon> · <its
 * one Boss>`, which made all 436 of Naxxramas' finds look like Kel'Thuzad's 36
 * - and the Boss scenario carries a second select under it listing the CLASSIC
 * record's bosses for that place, with a drop count each. `#bossName()` is the
 * one reader, beside `#dungeonName()`, and every draw site goes through both.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { AZEROTH } from "../config.mjs";
import { affixOf } from "./affix-dialog.mjs";
import { AzerothCharacterCreator } from "./creator.mjs";
import { coins } from "../helpers/coins.mjs";
import { LOOT_FOLDER_SETTING, lootOffer } from "../settings.mjs";
import { presentLoot } from "../documents/loot-offer.mjs";
import { pickLootPlayers } from "./loot-offer.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import {
  RARITIES, SCENARIOS, TIERS,
  bossesIn, itemDataFor, poolsFrom, purseFor, reviewRows, rollLoot, rollRow, tableFor, tierForPartyLevel, zoneTiers
} from "../rules/loot.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/loot-generator.hbs";

/** 05 §1's level bands, for the dungeon list's groups. */
const BANDS = Object.freeze({ 1: "1–4", 2: "5–10", 3: "11–15", 4: "16–20" });

const PACKS = {
  weapons: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear", affixes: "azeroth-rpg.affixes", bestiary: "azeroth-rpg.bestiary"
};

/** The dials `tableFor` fills; one the GM has moved is theirs. */
const SUGGESTED = Object.freeze([
  "table.count.0", "table.count.1", "table.combat", "table.named", "table.days",
  ...RARITIES.map(r => `table.weights.${r}`)
]);

/** A select's rows from a keyed map of labels. */
function choicesOf(map, selected, { blank = null } = {}) {
  return [
    ...(blank ? [{ value: "", label: blank, selected: !selected }] : []),
    ...Object.entries(map).map(([value, label]) => ({ value, label: game.i18n.localize(label), selected: value === selected }))
  ];
}

/** A share as ten steps of ten per cent. */
function shareChoices(selected) {
  return Array.from({ length: 11 }, (_, i) => {
    const value = i / 10;
    return { value, label: game.i18n.format("AZEROTH.Loot.Percent", { n: i * 10 }), selected: Math.round(selected * 10) === i };
  });
}

export class AzerothLootGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "azeroth-loot-generator",
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-generator", "azeroth-loot"],
    tag: "form",
    window: { title: "AZEROTH.Loot.Title", resizable: true },
    position: { width: 760, height: 820 },
    form: { handler: AzerothLootGenerator.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      lootRoll: AzerothLootGenerator.#onRoll,
      lootRerollRow: AzerothLootGenerator.#onRerollRow,
      lootLockRow: AzerothLootGenerator.#onLockRow,
      lootRemoveRow: AzerothLootGenerator.#onRemoveRow,
      lootAddRow: AzerothLootGenerator.#onAddRow,
      lootBrowseRow: AzerothLootGenerator.#onBrowseRow,
      lootResuggest: AzerothLootGenerator.#onResuggest,
      lootPresent: AzerothLootGenerator.#onPresent,
      lootCancel: AzerothLootGenerator.#onCancel
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-generator-pane"] } };

  /**
   * @param {object} [options]
   * @param {() => number} [options.random]  The draw, injected so a test can pin it.
   */
  constructor({ random = null, ...options } = {}) {
    super(options);
    this.#random = random ?? (() => CONFIG.Dice.randomUniform());
  }

  #state = null;
  #data = null;
  #random;

  /** The current state (a copy), for the tests and the summary. */
  get state() {
    return this.#state ? foundry.utils.deepClone({ ...this.#state, touched: [...this.#state.touched] }) : null;
  }

  /** Merge a partial state, the way the tests drive the window. */
  async setState(partial = {}) {
    await this.#load();
    this.#state ??= this.#initialState();
    this.#merge(partial);
    if (this.rendered) await this.render();
    return this.state;
  }

  #merge(partial) {
    const touched = partial.touched ? new Set(partial.touched) : this.#state.touched;
    const structural = ["scenario", "tier", "dungeon", "boss"].some(k => k in partial);
    const merged = foundry.utils.mergeObject(this.#state, foundry.utils.deepClone({ ...partial, touched: undefined }), { inplace: false });
    delete merged.touched;
    if (Array.isArray(partial.rows)) merged.rows = foundry.utils.deepClone(partial.rows);
    this.#state = { ...merged, touched };
    for (const path of SUGGESTED) if (foundry.utils.hasProperty(partial, path)) this.#state.touched.add(path);
    if (foundry.utils.hasProperty(partial, "table.weights")) for (const r of RARITIES) this.#state.touched.add(`table.weights.${r}`);
    if (foundry.utils.hasProperty(partial, "table.count")) { this.#state.touched.add("table.count.0"); this.#state.touched.add("table.count.1"); }
    // A boss belongs to the dungeon it was picked in and to the Boss scenario
    // (D-703): moving either without naming a new boss clears it.
    if (("dungeon" in partial || "scenario" in partial) && !("boss" in partial)) this.#state.boss = null;
    if (!AzerothLootGenerator.hasBoss(this.#state.scenario)) this.#state.boss = null;
    if (structural) this.#resuggest();
    this.#state.coin = purseFor(this.#state.table.days);
  }

  /* -------------------------------------------- */
  /*  Loading                                      */
  /* -------------------------------------------- */

  async #load() {
    if (this.#data) return;
    // `flags` rides alongside `system`, because `classicBoss` reads the
    // conversion's own record off `flags.azeroth-rpg.classic.boss` (D-703).
    // Core's server builds the projection with `setProperty(proj, path, 1)`
    // over whatever paths it is handed and denies `password`/`passwordSalt`
    // alone, so a `flags.` path indexes - but nothing in this system had ever
    // asked for one, so `system.provenance` is indexed beside it and
    // `classicBoss` falls back to reading the boss out of that.
    const index = async (id, fields) => {
      const pack = game.packs.get(id);
      if (!pack) return [];
      const entries = await pack.getIndex({ fields });
      return entries.map(e => ({
        uuid: `Compendium.${id}.${pack.documentName}.${e._id}`,
        name: e.name, img: e.img, type: e.type,
        flags: e.flags ?? null,
        ...(e.system ?? {})
      }));
    };
    const affixes = async () => {
      const pack = game.packs.get(PACKS.affixes);
      const docs = pack ? await pack.getDocuments() : [];
      return docs.map(affixOf).filter(a => a.kind === "prefix" || a.kind === "suffix");
    };
    const BOSS_FIELDS = ["system.provenance", "flags.azeroth-rpg.classic.boss"];
    const [weapons, armor, gear, affixList, bestiary] = await Promise.all([
      index(PACKS.weapons, ["system.cost", "system.rarity", "system.rating", "system.range", "system.traits", "system.quantity", "system.fits", "system.budget", "system.source", ...BOSS_FIELDS]),
      index(PACKS.armor, ["system.cost", "system.rarity", "system.category", "system.shield", "system.apBonus", "system.traits", "system.budget", "system.source", ...BOSS_FIELDS]),
      // **`system.use` IS INDEXED, AND THE WINDOW WAS BLIND WITHOUT IT**
      // (D-677's rule, found 2026-09-14). `rules/affixes.mjs#canGoOn` refuses
      // an affix on a thing that is USED UP - *a draught, a poison and a manual
      // are spent*, the lead's own call - and it reads `system.use`, which this
      // projection did not ask for. So `poolsFrom` listed every Manual as
      // affixable, the draw offered one, `pairs()` found a legal prefix and
      // suffix for it, and `itemDataFor` then refused the row at `plan()` with
      // *Sturdy does not go on Lost codex*: the generator reported `rowIllegal`
      // on a find it had chosen itself. **A filter reading an UNINDEXED field
      // matches nothing and says nothing**, and the Node model could not see it
      // — `rules/loot.test.mjs` spreads the WHOLE stored `system`, so its pools
      // were right and only the live window's were wrong.
      //
      // **`loot-generator.test.mjs` BESIDE THIS FILE IS THE ASSERTION THAT THE
      // CONSUMER MOVED** (D-681, 2026-09-15). It reads all four of these field
      // lists out of this source, projects the packs down to exactly them, and fails
      // on a pool that differs from the same rules handed everything, on a row
      // the whole document would refuse, and on a path `canGoOn` reads that a
      // pack carries and a list here does not name. **Add a field to a list
      // here and nothing needs adding there**; take one away that is read and
      // it says which, in Node.
      index(PACKS.gear, ["system.cost", "system.rarity", "system.quantity", "system.traits", "system.budget", "system.source", "system.use", ...BOSS_FIELDS]),
      affixes(),
      index(PACKS.bestiary, ["system.weightClass", "system.tier", "system.dungeon"])
    ]);
    // 14 §14's index, read off the pack: every Boss holds somewhere (D-528).
    // The pack carries no Province, so the list is grouped by party level.
    const dungeons = bestiary
      .filter(b => b.weightClass === "boss" && b.dungeon)
      .map(b => ({ uuid: b.uuid, boss: b.name, dungeon: b.dungeon, tier: b.tier ?? 1 }))
      .sort((a, b) => a.dungeon.localeCompare(b.dungeon));
    // D-702: the Classic zones, bound to those dungeons and to their tiers.
    // An unresolved zone takes its whole shelf of finds out of the generator,
    // so it is SAID rather than dropped in silence.
    const { zones, unresolved } = zoneTiers(dungeons);
    if (unresolved.length) {
      console.warn(`azeroth-rpg | loot: ${unresolved.length} Classic zone(s) resolve to no tier: ${unresolved.join(", ")}`);
    }
    const pools = poolsFrom({ weapons, armor, gear, affixes: affixList, zones });
    const found = AzerothLootGenerator.#foundCounts(pools);
    // NEITHER READING REACHED THE BOSS, which would leave the Boss select
    // empty on every dungeon with no word about why (D-703, D-681). Say it.
    if (found.total && !found.withBoss) {
      console.warn(`azeroth-rpg | loot: ${found.total} Classic finds and not one names a boss; `
        + "neither flags.azeroth-rpg.classic.boss nor system.provenance reached the index.");
    }
    this.#data = { dungeons, pools, found };
  }

  /** How many Classic finds each dungeon holds, and how many each tier does (D-702). */
  static #foundCounts(pools) {
    const byDungeon = new Map();
    const byTier = new Map();
    let total = 0;
    let withBoss = 0;
    for (const rarity of ["rare", "epic"]) {
      for (const kind of ["combat", "noncombat"]) {
        for (const base of pools.found?.[rarity]?.[kind] ?? []) {
          const { dungeon, tier, boss } = base.found ?? {};
          total++;
          if (boss) withBoss++;
          if (dungeon) byDungeon.set(dungeon, (byDungeon.get(dungeon) ?? 0) + 1);
          if (tier) byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
        }
      }
    }
    return { byDungeon, byTier, total, withBoss };
  }

  /**
   * 14 §14's own name for the place, ONLY where the scenario admits one
   * (D-702). A Boss names its dungeon too (D-528), which is the lead's L2.
   * One reader: every draw site calls this, or a select left behind by a
   * scenario change would keep scoping the pool after the row was hidden.
   */
  #dungeonName() {
    const s = this.#state;
    return AzerothLootGenerator.hasDungeon(s?.scenario) ? (s.dungeon?.dungeon ?? null) : null;
  }

  /**
   * The Classic boss the draw is scoped to, ONLY where the scenario admits one
   * and a dungeon is named (D-703). The same one-reader rule `#dungeonName()`
   * carries: a boss left behind by a scenario change would go on scoping the
   * pool long after the select stopped being drawn, which is precisely the bug
   * `#dungeonName()` exists to prevent.
   */
  #bossName() {
    const s = this.#state;
    if (!AzerothLootGenerator.hasBoss(s?.scenario) || !this.#dungeonName()) return null;
    return s.boss || null;
  }

  /** The scenarios that name a place: a dungeon, and a Boss standing in one. */
  static hasDungeon(scenario) {
    return scenario === "dungeon" || scenario === "boss";
  }

  /** The one scenario that names a single boss inside that place (D-703). */
  static hasBoss(scenario) {
    return scenario === "boss";
  }

  /** What the window opens on: a tier-1 dungeon, its dials, and nothing rolled. */
  #initialState() {
    const scenario = "dungeon";
    const tier = 1;
    let folder = null;
    try { folder = game.settings.get("azeroth-rpg", LOOT_FOLDER_SETTING) || null; } catch { folder = null; }
    if (folder && !game.folders.get(folder)) folder = null;
    const table = tableFor(scenario, tier);
    return { scenario, tier, dungeon: null, boss: null, table, rows: [], coin: purseFor(table.days), folder, touched: new Set() };
  }

  /** Take the table again for every dial the GM has not moved, then re-roll what is not locked. */
  #resuggest() {
    const s = this.#state;
    const fresh = tableFor(s.scenario, s.tier);
    const set = (path, value) => { if (!s.touched.has(path)) foundry.utils.setProperty(s, path, value); };
    set("table.count.0", fresh.count[0]);
    set("table.count.1", fresh.count[1]);
    for (const rarity of RARITIES) set(`table.weights.${rarity}`, fresh.weights[rarity]);
    set("table.combat", fresh.combat);
    set("table.named", fresh.named);
    set("table.days", fresh.days);
    s.coin = purseFor(s.table.days);
    if (s.rows.length) this.#roll();
  }

  /** Roll every row that is not locked; a locked one keeps its place and its content. */
  #roll() {
    const s = this.#state;
    const locked = s.rows.map((row, index) => ({ index, row })).filter(r => r.row.locked);
    const { rows, coin } = rollLoot({
      tier: s.tier, table: s.table, pools: this.#data.pools, random: this.#random,
      dungeon: this.#dungeonName(), boss: this.#bossName(), locked
    });
    s.rows = rows;
    s.coin = coin;
  }

  /* -------------------------------------------- */
  /*  Rendering                                    */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await this.#load();
    this.#state ??= this.#initialState();
    const s = this.#state;
    const v = reviewRows(s.rows);
    // The prefixes stay literal, dot and all, so the lang audit can follow them.
    const reason = entry => game.i18n.format(`AZEROTH.Loot.Reason.${entry.code}`, this.#say(entry.params ?? {}));
    const noted = entry => game.i18n.format(`AZEROTH.Loot.Note.${entry.code}`, this.#say(entry.params ?? {}));
    const weightTotal = RARITIES.reduce((sum, r) => sum + (Number(s.table.weights[r]) || 0), 0);

    const bands = [...new Set(this.#data.dungeons.map(d => d.tier))].sort();
    const accepted = s.rows.filter(r => r.accepted).length;
    // THE OPTION SAYS THE DUNGEON AND NOTHING ELSE (D-703). It used to read
    // `<dungeon> · <its one Boss>` off 14 §14's index, which made a whole
    // dungeon's loot read as that Boss's; the row behind it still supplies
    // the tier, and it is still a Boss row, but it is no longer printed as
    // though it owned the find.
    const dungeonName = this.#dungeonName();
    const bosses = AzerothLootGenerator.hasBoss(s.scenario) ? bossesIn(this.#data.pools, dungeonName) : [];

    return Object.assign(context, {
      scenarios: choicesOf(AZEROTH.lootScenarios, s.scenario),
      tiers: TIERS.map(t => ({ value: t, selected: t === s.tier })),
      // A Boss stands in a dungeon too (D-528, D-702's L2).
      hasDungeon: AzerothLootGenerator.hasDungeon(s.scenario),
      found: this.#foundLine(),
      dungeonGroups: bands.map(tier => ({
        label: game.i18n.format("AZEROTH.Loot.Band", { band: BANDS[tier] ?? tier, tier }),
        entries: this.#data.dungeons.filter(d => d.tier === tier).map(d => ({
          uuid: d.uuid, selected: d.uuid === s.dungeon?.uuid,
          label: game.i18n.format("AZEROTH.Loot.DungeonOption", { dungeon: d.dungeon })
        }))
      })),
      dungeon: s.dungeon
        ? { ...s.dungeon, line: game.i18n.format("AZEROTH.Loot.DungeonLine", { dungeon: s.dungeon.dungeon, band: BANDS[s.dungeon.tier] ?? "", tier: s.dungeon.tier }) }
        : null,
      // The Boss select: offered only where the record holds bosses for the
      // dungeon named, so a dungeon with no Classic loot shows no empty
      // control - the found line says why instead.
      hasBossList: bosses.length > 0,
      bosses: [
        { value: "", label: game.i18n.format("AZEROTH.Loot.AnyBoss", { dungeon: dungeonName ?? "" }), selected: !s.boss },
        ...bosses.map(({ boss, count }) => ({
          value: boss, selected: boss === s.boss,
          label: game.i18n.format("AZEROTH.Loot.BossOption", { boss, n: count })
        }))
      ],
      folders: [{ id: "", name: game.i18n.localize("AZEROTH.Loot.Folder"), selected: !s.folder },
        ...(game.items._formatFolderSelectOptions?.() ?? []).map(f => ({ ...f, selected: f.id === s.folder }))],
      counts: {
        low: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, selected: i + 1 === s.table.count[0] })),
        high: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, selected: i + 1 === s.table.count[1] }))
      },
      weights: RARITIES.map(rarity => ({
        key: rarity, label: game.i18n.localize(AZEROTH.rarities[rarity]), value: s.table.weights[rarity],
        share: weightTotal ? game.i18n.format("AZEROTH.Loot.Percent", { n: Math.round((s.table.weights[rarity] / weightTotal) * 100) }) : "—"
      })),
      combat: shareChoices(s.table.combat),
      named: shareChoices(s.table.named),
      days: s.table.days,
      coin: game.i18n.format("AZEROTH.Loot.Purse", { days: s.coin.days, coins: coins(s.coin.copper) }),
      addRarities: RARITIES.map(r => ({ value: r, label: game.i18n.localize(AZEROTH.rarities[r]), selected: r === "common" })),
      rows: s.rows.map((row, index) => ({
        index,
        name: row.name,
        rarityClass: rarityClass(row.rarity),
        rarities: RARITIES.map(r => ({ value: r, label: game.i18n.localize(AZEROTH.rarities[r]), selected: r === row.rarity })),
        kinds: Object.entries({ combat: "AZEROTH.Loot.Kind.Combat", noncombat: "AZEROTH.Loot.Kind.Noncombat" })
          .map(([value, label]) => ({ value, label: game.i18n.localize(label), selected: value === row.kind })),
        detail: this.#detailOf(row),
        grants: this.#grantsOf(row),
        quantity: row.quantity && row.quantity > 1 ? game.i18n.format("AZEROTH.Loot.Quantity", { n: row.quantity }) : null,
        price: row.price === null || row.price === undefined ? game.i18n.localize("AZEROTH.Forge.NotSold") : coins(row.price),
        img: row.base.img,
        named: Boolean(row.fixedUuid),
        accepted: row.accepted,
        locked: row.locked,
        notes: (row.notes ?? []).map(noted)
      })),
      summary: {
        ok: v.ok,
        reasons: v.reasons.map(reason),
        notes: v.notes.map(noted),
        line: game.i18n.format("AZEROTH.Loot.Running", {
          n: accepted, scenario: game.i18n.localize(AZEROTH.lootScenarios[s.scenario]), tier: s.tier
        })
      },
      createLabel: game.i18n.format("AZEROTH.Loot.Create", { n: accepted }),
      // The second door out of this window (D-721): make the find AND hand it
      // to the players, rather than making it and dragging it over by hand.
      presentLabel: game.i18n.format("AZEROTH.LootOffer.Present", { n: accepted })
    });
  }

  /**
   * WHAT THIS PLACE HOLDS, in words (D-702). 18 of the 41 dungeons 14 §14
   * names carry no Classic loot at all — Karazhan, Zul'Aman, both Alterac
   * Valley halls, the east and west Dire Maul wings among them — and a GM
   * who picks one would otherwise be left wondering why nothing found is
   * ever from there. With no dungeon named the line says what the TIER
   * holds, which is the rule the draw is actually following.
   */
  #foundLine() {
    const s = this.#state;
    if (!AzerothLootGenerator.hasDungeon(s.scenario)) return null;
    const dungeon = this.#dungeonName();
    if (!dungeon) {
      const n = this.#data.found.byTier.get(s.tier) ?? 0;
      return n ? game.i18n.format("AZEROTH.Loot.FoundAtTier", { n, tier: s.tier }) : null;
    }
    const n = this.#data.found.byDungeon.get(dungeon) ?? 0;
    if (!n) return game.i18n.format("AZEROTH.Loot.FoundNone", { dungeon });
    // A boss named says what that boss drops OF the dungeon's own total, so
    // the narrowing is on the window's face rather than implied (D-703).
    const boss = this.#bossName();
    if (boss) {
      const count = bossesIn(this.#data.pools, dungeon).find(b => b.boss === boss)?.count ?? 0;
      return game.i18n.format("AZEROTH.Loot.FoundBoss", { boss, n: count, dungeon, total: n });
    }
    return game.i18n.format("AZEROTH.Loot.FoundHere", { n, dungeon });
  }

  /**
   * A row's line: what the catalogue printed, and where it files the thing
   * when the catalogue printed no numbers - a suit and most gear carry
   * neither a Rating nor a trait, and an empty line reads as a fault.
   */
  #detailOf(row) {
    const flat = { ...row.base.system, type: row.base.type, name: row.base.name };
    const numbers = AzerothCharacterCreator.detailOf(flat);
    const shelf = AzerothCharacterCreator.shelfOf(flat)?.label ?? "";
    return numbers ? `${shelf} \u00b7 ${numbers}` : shelf;
  }

  /**
   * WHAT THE FIND IS WORTH HAVING: the affixes' own sentences (08 §6), which
   * is the only thing separating an Uncommon from the Common it was made
   * from. Without it a row read as a plain thing with a bigger price (the
   * lead, 2026-09-06).
   */
  #grantsOf(row) {
    const out = [];
    for (const affix of [row.prefix, row.suffix].filter(Boolean)) {
      if (affix.enchantment) out.push(`${affix.name} (${(row.greater ?? []).includes(affix.name) ? "Greater" : "Lesser"})`);
      else if (affix.grants) out.push(affix.grants);
    }
    // A named thing out of the pack says what it does in its own Signature.
    if (row.fixedUuid && row.base.system.signature) out.push(game.i18n.localize("AZEROTH.Item.Signature"));
    return out;
  }

  /** Localise what a note carries before it is formatted in. */
  #say(params) {
    const out = { ...params };
    if (out.rarity && AZEROTH.rarities[out.rarity]) out.rarity = game.i18n.localize(AZEROTH.rarities[out.rarity]);
    return out;
  }

  /* -------------------------------------------- */
  /*  The form                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-loot]")) {
      el.addEventListener("change", () => {
        this.#readForm(el);
        this.render();
      });
    }
  }

  /**
   * Read the form into the state. A dial the GM moves is theirs; a change to
   * the scenario, the tier or the dungeon takes the table again. Fields
   * absent from the form keep their value.
   */
  #readForm(changed = null) {
    const form = this.element;
    const s = this.#state;
    if (!form || !s) return;
    const el = name => form.elements?.[name] ?? null;
    const read = (name, apply) => { const e = el(name); if (e) apply(e); };
    const num = v => (v === "" || v === null || v === undefined ? 0 : Number(v));
    const was = { scenario: s.scenario, tier: s.tier, dungeon: s.dungeon?.uuid ?? null, boss: s.boss ?? null };

    read("scenario", e => { s.scenario = e.value; });
    read("tier", e => { s.tier = Number(e.value) || 1; });
    read("folder", e => { s.folder = e.value || null; });
    read("dungeon", e => {
      const found = this.#data.dungeons.find(d => d.uuid === e.value) ?? null;
      s.dungeon = found ? { ...found } : null;
    });
    read("boss", e => { s.boss = e.value || null; });
    read("countLow", e => { s.table.count[0] = num(e.value) || 1; s.touched.add("table.count.0"); });
    read("countHigh", e => { s.table.count[1] = Math.max(s.table.count[0], num(e.value) || 1); s.touched.add("table.count.1"); });
    for (const rarity of RARITIES) {
      read(`weight-${rarity}`, e => { s.table.weights[rarity] = Math.max(0, num(e.value)); s.touched.add(`table.weights.${rarity}`); });
    }
    read("combatShare", e => { s.table.combat = num(e.value); s.touched.add("table.combat"); });
    read("namedShare", e => { s.table.named = num(e.value); s.touched.add("table.named"); });
    read("days", e => { s.table.days = Math.max(0, Math.trunc(num(e.value))); s.touched.add("table.days"); });
    s.rows.forEach((row, i) => {
      read(`accept-${i}`, e => { row.accepted = e.checked; });
    });
    s.coin = purseFor(s.table.days);

    // A dungeon names its tier (14 §14); the GM may still say otherwise.
    if (s.dungeon && s.dungeon.uuid !== was.dungeon) s.tier = s.dungeon.tier;
    // A boss belongs to the dungeon it was picked in and to the Boss scenario
    // (D-703). The select is rebuilt on the render AFTER this, so the stale
    // value is still in the form here and has to be dropped by hand.
    if ((s.dungeon?.uuid ?? null) !== was.dungeon || s.scenario !== was.scenario) s.boss = null;
    if (!AzerothLootGenerator.hasBoss(s.scenario)) s.boss = null;
    if (s.scenario !== was.scenario || s.tier !== was.tier
      || (s.dungeon?.uuid ?? null) !== was.dungeon || (s.boss ?? null) !== was.boss) this.#resuggest();

    // A row's own select redraws that row alone.
    const row = changed?.closest?.("li[data-index]");
    if (row && changed.name?.startsWith("row-")) this.#redrawRow(Number(row.dataset.index), changed);
  }

  /** One row again, at whatever rarity and kind its selects now say. */
  #redrawRow(index, changed) {
    const s = this.#state;
    const row = s.rows[index];
    if (!row) return;
    const rarity = changed.name.startsWith("row-rarity") ? changed.value : row.rarity;
    const kind = changed.name.startsWith("row-kind") ? changed.value : row.kind;
    const taken = new Set(s.rows.filter((_, i) => i !== index).map(r => r.base?.uuid).filter(Boolean));
    const made = rollRow({
      tier: s.tier, table: s.table, pools: this.#data.pools, random: this.#random,
      rarity, kind, dungeon: this.#dungeonName(), boss: this.#bossName(), taken
    });
    if (made) s.rows[index] = { ...made, accepted: row.accepted, locked: false };
  }

  /* -------------------------------------------- */
  /*  Create                                       */
  /* -------------------------------------------- */

  /** The "Generated Items" folder, found or made (the bound door's shape). */
  async #folder() {
    const s = this.#state;
    const held = s.folder ? game.folders.get(s.folder) : null;
    if (held?.type === "Item") return held;
    const name = game.i18n.localize("AZEROTH.Loot.Folder");
    const found = game.folders.find(f => f.type === "Item" && f.name === name);
    if (found) return found;
    // A refused create returns nothing, and `folder?.id ?? null` then puts
    // every generated item at the ROOT in silence (2026-09-07). Say so.
    const made = await Folder.create({ name, type: "Item" });
    if (!made) ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.NoFolder", { name }));
    return made ?? null;
  }

  /**
   * Load, merge, roll where nothing is rolled yet, and review.
   *
   * The opening BOTH doors share (D-721): Create and *Offer to players* have
   * to agree about what is legal, and a second copy of this would be a second
   * place for `reviewRows` to be forgotten.
   *
   * @returns {Promise<{ok: boolean, v: object, coin: object}>}
   */
  async #confirm(state = null) {
    await this.#load();
    this.#state ??= this.#initialState();
    if (state) this.#merge(state);
    const s = this.#state;
    if (!s.rows.length) this.#roll();

    const v = reviewRows(s.rows);
    const coin = { ...s.coin, text: game.i18n.format("AZEROTH.Loot.Purse", { days: s.coin.days, coins: coins(s.coin.copper) }) };
    if (v.ok) return { ok: true, v, coin };
    const reasons = v.reasons.map(r => game.i18n.format(`AZEROTH.Loot.Reason.${r.code}`, this.#say(r.params ?? {})));
    ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.Refused", { reasons: reasons.join("; ") }));
    if (this.rendered) await this.render();
    return { ok: false, v, coin };
  }

  /**
   * What the offer is called, in the caller's words: the place, the scenario
   * and the tier. It is the offer's own label and the picker's title, and it
   * is what a player reads at the top of the window a find arrives in.
   */
  #offerLabel() {
    const s = this.#state;
    const place = this.#bossName() || this.#dungeonName();
    const scenario = game.i18n.localize(AZEROTH.lootScenarios[s.scenario] ?? "");
    const tier = `${game.i18n.localize("AZEROTH.Sheet.Tier")} ${s.tier}`;
    return [place, scenario, tier].filter(Boolean).join(" \u00b7 ");
  }

  /**
   * Make the accepted rows as world Items. **THE ONE CREATE PATH** (D-721):
   * Create makes them and stops, Offer makes them and hands them to the
   * players, and a find has to be exactly the same thing either way.
   *
   * @param {string} purse  The purse in words, for the line that says what
   *   landed - and EMPTY where the coin is not being handed over at the table
   *   (the offer splits it into a share each, D-721).
   * @returns {Promise<{ok: boolean, reasons: object[], items: Item[], stamp: object|null}>}
   */
  async #create(purse = "") {
    const s = this.#state;
    const folder = await this.#folder();
    const stamp = {
      scenario: s.scenario, tier: s.tier, dungeon: this.#dungeonName(), boss: this.#bossName(),
      version: game.system.version, at: Date.now()
    };
    const payloads = [];
    const refused = [];
    for (const row of s.rows.filter(r => r.accepted)) {
      const doc = await fromUuid(row.base.uuid);
      if (!doc) {
        refused.push({ code: "rowIllegal", params: { name: row.name ?? "", why: row.base.name } });
        continue;
      }
      if (row.fixedUuid) {
        // A named thing out of the pack, as it stands (08 §20).
        const data = doc.toObject();
        delete data._id;
        data.folder = folder?.id ?? null;
        foundry.utils.setProperty(data, "flags.azeroth-rpg.loot", { ...stamp, rarity: row.rarity });
        payloads.push(data);
        continue;
      }
      const base = { name: doc.name, type: doc.type, system: doc.system.toObject() };
      const made = itemDataFor(row, base);
      if (!made) {
        refused.push({ code: "rowIllegal", params: { name: row.name ?? doc.name, why: doc.name } });
        continue;
      }
      payloads.push({
        ...made, img: doc.img, folder: folder?.id ?? null,
        flags: { "azeroth-rpg": { ...made.flags["azeroth-rpg"], loot: { ...stamp, rarity: row.rarity } } }
      });
    }
    if (refused.length) {
      const reasons = refused.map(r => game.i18n.format(`AZEROTH.Loot.Reason.${r.code}`, this.#say(r.params ?? {})));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.Refused", { reasons: reasons.join("; ") }));
      return { ok: false, reasons: refused, items: [], stamp };
    }

    const items = await Item.createDocuments(payloads);
    try { await game.settings.set("azeroth-rpg", LOOT_FOLDER_SETTING, folder?.id ?? ""); } catch { /* a client setting; never worth failing for */ }
    // Trimmed, because an empty purse leaves the sentence trailing a space.
    ui.notifications?.info(game.i18n.format("AZEROTH.Loot.Created", { n: items.length, folder: folder?.name ?? "", purse }).trim());
    return { ok: true, reasons: [], items, stamp };
  }

  /**
   * Make the accepted rows. A partial `state` merges in first (the tests
   * drive the window this way), and an empty list rolls once so a caller
   * may ask for a scenario and nothing else. The purse is reported, never
   * created: 13 §8 hands over coin at the table.
   *
   * `stamp` comes back with the items (D-721): the offer records what made a
   * find, and the stamp is the only place that is written down.
   *
   * @returns {Promise<{ok: boolean, reasons: object[], notes: object[], items: Item[], coin: object, stamp: object|null}>}
   */
  async apply(state = null) {
    const ready = await this.#confirm(state);
    const { v, coin } = ready;
    if (!ready.ok) return { ok: false, reasons: v.reasons, notes: v.notes, items: [], coin, stamp: null };

    const made = await this.#create(coin.text);
    if (!made.ok) {
      if (this.rendered) await this.render();
      return { ok: false, reasons: made.reasons, notes: v.notes, items: [], coin, stamp: made.stamp };
    }
    await this.close();
    return { ok: true, reasons: [], notes: v.notes, items: made.items, coin, stamp: made.stamp };
  }

  /**
   * Make the accepted rows AND offer them to the players named (D-721).
   *
   * The door the batches drive without clicking, exactly as `apply` is. The
   * picker is the BUTTON's job rather than this one's: a caller who already
   * knows who the find is for should not be asked, and a dismissed picker has
   * to leave the world untouched, which means it runs before anything here.
   *
   * @param {object} o
   * @param {object|null} [o.state]   A partial state, merged first.
   * @param {string[]} [o.userIds]    Who the find is offered to.
   * @returns {Promise<{ok: boolean, reasons: object[], notes: object[], items: Item[], coin: object, offer: object|null}>}
   */
  async present({ state = null, userIds = [] } = {}) {
    const ready = await this.#confirm(state);
    const { v, coin } = ready;
    if (!ready.ok) return { ok: false, reasons: v.reasons, notes: v.notes, items: [], coin, offer: null };
    // ONE OFFER AT A TIME, and refused BEFORE the items are made: a find
    // created for an offer that cannot open is loot nobody asked for.
    if (lootOffer()) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.AlreadyOpen"));
      return { ok: false, reasons: [], notes: v.notes, items: [], coin, offer: null };
    }

    // **NO PURSE IN THE TOAST HERE.** Create says what landed and names the
    // purse because 13 §8 hands the coin over at the table; the offer does
    // not, it splits the same coin into a share a player takes for
    // themselves, and a notification naming the whole purse an instant before
    // the window divides it says the money arrived twice. The count and the
    // folder are what this door reports.
    const made = await this.#create();
    if (!made.ok) {
      if (this.rendered) await this.render();
      return { ok: false, reasons: made.reasons, notes: v.notes, items: [], coin, offer: null };
    }
    const offer = await presentLoot({
      items: made.items, copper: coin.copper, label: this.#offerLabel(), stamp: made.stamp, userIds
    });
    // A refused presentation leaves the finds in the folder, which is where
    // the GM would have had to drag them from anyway - so the window stays
    // open only where there is still something to do with it.
    if (offer) await this.close();
    return { ok: Boolean(offer), reasons: [], notes: v.notes, items: made.items, coin, offer };
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onSubmit() {
    this.#readForm();
    return this.apply();
  }

  /**
   * Offer the find to the players (D-721).
   *
   * **THE PICKER RUNS BEFORE ANYTHING IS MADE.** A GM who opens the list of
   * players and thinks better of it has created nothing, which is the whole
   * difference between this and pressing Create and then changing their mind:
   * there is no folder to clean up afterwards.
   *
   * The rows are reviewed here as well as inside `present`, so an illegal
   * find is refused before the GM is asked who it is for.
   */
  static async #onPresent() {
    this.#readForm();
    if (lootOffer()) {
      ui.notifications?.warn(game.i18n.localize("AZEROTH.LootOffer.AlreadyOpen"));
      return null;
    }
    const v = reviewRows(this.#state.rows);
    if (!v.ok) {
      const reasons = v.reasons.map(r => game.i18n.format(`AZEROTH.Loot.Reason.${r.code}`, this.#say(r.params ?? {})));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.Refused", { reasons: reasons.join("; ") }));
      return this.render();
    }
    const userIds = await pickLootPlayers({ title: this.#offerLabel() });
    if (!userIds?.length) return null;
    return this.present({ userIds });
  }

  static async #onCancel() {
    return this.close();
  }

  static async #onRoll() {
    this.#readForm();
    this.#roll();
    return this.render();
  }

  static async #onRerollRow(event, target) {
    this.#readForm();
    const s = this.#state;
    const index = Number(target.closest("li[data-index]")?.dataset.index);
    const row = s.rows[index];
    if (!row) return;
    const taken = new Set(s.rows.filter((_, i) => i !== index).map(r => r.base?.uuid).filter(Boolean));
    const made = rollRow({
      tier: s.tier, table: s.table, pools: this.#data.pools, random: this.#random,
      rarity: row.rarity, kind: row.kind, dungeon: this.#dungeonName(), boss: this.#bossName(), taken
    });
    if (made) s.rows[index] = { ...made, accepted: row.accepted, locked: false };
    return this.render();
  }

  static async #onLockRow(event, target) {
    this.#readForm();
    const index = Number(target.closest("li[data-index]")?.dataset.index);
    const row = this.#state.rows[index];
    if (row) row.locked = !row.locked;
    return this.render();
  }

  static async #onRemoveRow(event, target) {
    this.#readForm();
    const index = Number(target.closest("li[data-index]")?.dataset.index);
    this.#state.rows.splice(index, 1);
    return this.render();
  }

  static async #onAddRow() {
    this.#readForm();
    const s = this.#state;
    const rarity = this.element.elements?.addRarity?.value ?? "common";
    const taken = new Set(s.rows.map(r => r.base?.uuid).filter(Boolean));
    const made = rollRow({
      tier: s.tier, table: s.table, pools: this.#data.pools, random: this.#random,
      rarity, dungeon: this.#dungeonName(), boss: this.#bossName(), taken
    });
    if (made) s.rows.push(made);
    return this.render();
  }

  /** Browse opens the compendium browser in pick mode; the row picked becomes this find (D-645). */
  static async #onBrowseRow(event, target) {
    this.#readForm();
    const index = Number(target.closest("li[data-index]")?.dataset.index);
    const row = this.#state.rows[index];
    if (!row) return;
    const category = { weapon: "weapons", armor: "armor", gear: "gear" }[row.base.type] ?? "gear";
    const title = game.i18n.format("AZEROTH.Loot.PickItem", { rarity: game.i18n.localize(AZEROTH.rarities[row.rarity]) });
    return game.system.azeroth.browser.browse({ category, pick: { title, onPick: doc => this.takeItem(index, doc) } });
  }

  /**
   * A document offered to a row. A Legendary is never loot (08 §20: one in
   * the world), an affix is not a thing, and anything but a weapon, a suit
   * or gear is refused with its reason. A Common pick is re-affixed at the
   * row's rarity; a pack Rare or Epic becomes the row as it stands.
   */
  async takeItem(index, doc) {
    const s = this.#state;
    const row = s.rows[index];
    if (!row) return false;
    if (doc?.documentName !== "Item" || !["weapon", "armor", "gear"].includes(doc.type)) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.NotItem", { name: doc?.name ?? "" }));
      return false;
    }
    if (doc.getFlag?.("azeroth-rpg", "affix")) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.NotAffix", { name: doc.name }));
      return false;
    }
    const rarity = doc.system?.rarity ?? "common";
    if (rarity === "legendary") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Loot.NotLegendary", { name: doc.name }));
      return false;
    }
    const base = { uuid: doc.uuid, name: doc.name, img: doc.img, type: doc.type, system: doc.system.toObject() };
    if (rarity !== "common") {
      s.rows[index] = { ...row, rarity, base, fixedUuid: doc.uuid, prefix: null, suffix: null, greater: [], quantity: null, name: doc.name, price: base.system.cost ?? null, spent: base.system.budget ?? null, notes: [], locked: true };
      await this.render();
      return true;
    }
    // A Common pick keeps the row's rarity where the affixes still go on it.
    const taken = new Set(s.rows.filter((_, i) => i !== index).map(r => r.base?.uuid).filter(Boolean));
    const pools = { ...this.#data.pools, bases: { ...this.#data.pools.bases }, affixable: { ...this.#data.pools.affixable } };
    pools.bases[row.kind] = [base];
    pools.affixable[row.kind] = [base];
    // The hand-picked base is the ONLY draw, so both named shelves are
    // blanked - the book's and D-702's Classic finds alike, or a find could
    // still be drawn over the GM's own pick.
    pools.fixed = { rare: { combat: [], noncombat: [] }, epic: { combat: [], noncombat: [] } };
    pools.found = { rare: { combat: [], noncombat: [] }, epic: { combat: [], noncombat: [] } };
    const made = rollRow({ tier: s.tier, table: s.table, pools, random: this.#random, rarity: row.rarity, kind: row.kind, taken });
    if (made) s.rows[index] = { ...made, accepted: row.accepted, locked: true };
    await this.render();
    return true;
  }

  static async #onResuggest() {
    this.#readForm();
    this.#state.touched = new Set();
    this.#resuggest();
    return this.render();
  }
}

export { tierForPartyLevel, SCENARIOS };
