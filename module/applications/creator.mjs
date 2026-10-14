/**
 * The character creator (D-636): one window that walks 01-CHARACTER-CREATION's
 * ten steps in the chapter's order and makes the character at the end with
 * every side effect a drop gives. `rules/creation.mjs` is the law and this is
 * the form around it; the summary prints every reason the book refuses, and
 * every judgement it leaves to the table, beside Finish.
 *
 * Two doors. The Actor directory's New character button (creator-button.mjs)
 * makes a new actor on Finish; the Build button on a blank character sheet
 * fills that actor, which is the player's path when the GM hands one over.
 * Nothing is written before Finish, so Cancel is a close.
 *
 * FINISH REPRODUCES THE DROP PATH. `Actor.create({items})` skips every race,
 * class and career side effect - core dispatches descendant events only for
 * a parent that exists - so the actor is made (or taken) first and the race,
 * class, career, spells and gear are embedded in ONE call, which runs
 * `AzerothActor#_onCreateDescendantDocuments` once: the career link, the class
 * entry with Power full, the 36 class talents, the 8 racial talents and the
 * level-1 features (`_talentGrant`). The picks and the Ranks follow the grant.
 */

import { AZEROTH } from "../config.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { coins } from "../helpers/coins.mjs";
import { rarityClass } from "../helpers/rarity.mjs";
import { bindPickers } from "./picker.mjs";
import { ABILITIES, abilityModifier } from "../rules/abilities.mjs";
import { featuresFor } from "../rules/class-features.mjs";
import { RANK_MAX, rankCost } from "../rules/xp.mjs";
import {
  ARRAY, CLASS_ORDER, METHODS, POINT_BUY, PURSE, ROLL_DICE, ROLL_KEEP, STARTING_XP, STEPS,
  accessNote, inCareerSkills, kitRows, numbersFor, plan, pointBuyCost, pointBuyTotal,
  primaryAbilities, rankSpend,
  rollFloorMet, sideFor, skillUuid, spellsRequired, stepsFor, castsSpells, validate
} from "../rules/creation.mjs";
import { arrange } from "../rules/slots.mjs";
import { sectionTail } from "./browser-categories.mjs";
import { SKILL_TEXT } from "../rules/skill-text.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE = "systems/azeroth-rpg/templates/creator/creator.hbs";
const DEFAULT_IMG = "icons/svg/mystery-man.svg";
const PACKS = {
  races: "azeroth-rpg.races", classes: "azeroth-rpg.classes", careers: "azeroth-rpg.careers",
  talents: "azeroth-rpg.talents", spells: "azeroth-rpg.spells",
  weapons: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor", gear: "azeroth-rpg.gear"
};

/** How long Finish waits for the grant chain's documents, in 50ms steps. */
const GRANT_POLL = 200;

export class AzerothCharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-creator"],
    tag: "form",
    window: { title: "AZEROTH.Creator.Title", resizable: true },
    position: { width: 760, height: 820 },
    form: { handler: AzerothCharacterCreator.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      creatorGo: AzerothCharacterCreator.#onGo,
      creatorBack: AzerothCharacterCreator.#onBack,
      creatorNext: AzerothCharacterCreator.#onNext,
      creatorCancel: AzerothCharacterCreator.#onCancel,
      creatorRoll: AzerothCharacterCreator.#onRoll,
      creatorReroll: AzerothCharacterCreator.#onRoll,
      creatorStepScore: AzerothCharacterCreator.#onStepScore,
      creatorStepRank: AzerothCharacterCreator.#onStepRank,
      creatorAddSpell: AzerothCharacterCreator.#onAddSpell,
      creatorRemoveSpell: AzerothCharacterCreator.#onRemoveSpell,
      creatorKit: AzerothCharacterCreator.#onKit,
      creatorAddItem: AzerothCharacterCreator.#onAddItem,
      creatorRemoveItem: AzerothCharacterCreator.#onRemoveItem,
      creatorStepQuantity: AzerothCharacterCreator.#onStepQuantity,
      creatorPortrait: AzerothCharacterCreator.#onPortrait,
      // A row's name opens what the entry says (2026-09-06); the shelves sort on one toggle.
      creatorExpand: AzerothCharacterCreator.#onExpand,
      creatorSort: AzerothCharacterCreator.#onSort
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-creator-pane"] } };

  /**
   * @param {object} [options]
   * @param {Actor|null} [options.actor]  A blank character to fill; null makes one on Finish.
   */
  constructor({ actor = null, ...options } = {}) {
    super({ ...options, id: actor ? `azeroth-creator-${actor.id}` : "azeroth-creator" });
    this.actor = actor;
  }

  /** The form's state between renders. */
  #state = null;
  /** The packs, read once. */
  #data = null;

  /** @inheritDoc */
  get title() {
    return this.actor
      ? game.i18n.format("AZEROTH.Creator.TitleFor", { name: this.actor.name })
      : game.i18n.localize("AZEROTH.Creator.Title");
  }

  /** A character with neither race nor class, owned by the user: the Build door. */
  static canBuild(actor) {
    return Boolean(actor) && actor.type === "character" && actor.isOwner
      && !actor.raceItem && !(actor.classItems?.length);
  }

  /** The current state (a copy), for the tests and the summary. */
  get state() {
    return this.#state ? foundry.utils.deepClone(this.#state) : null;
  }

  /** Replace what a partial state names, the way the tests drive the window. */
  async setState(partial = {}) {
    await this.#load();
    this.#state ??= this.#initialState();
    this.#state = { ...this.#state, ...foundry.utils.deepClone(partial) };
    if (this.rendered) await this.render();
    return this.state;
  }

  /** Show a step, by key or index. */
  async goTo(step) {
    await this.#load();
    this.#state ??= this.#initialState();
    const key = typeof step === "number" ? STEPS[step] : step;
    if (STEPS.includes(key)) this.#state.step = key;
    if (this.rendered) await this.render();
    return this.#state.step;
  }

  /* -------------------------------------------- */
  /*  Loading                                      */
  /* -------------------------------------------- */

  async #load() {
    if (this.#data) return;
    const docs = async id => {
      const pack = game.packs.get(id);
      return pack ? (await pack.getDocuments()).map(d => ({ uuid: d.uuid, name: d.name, img: d.img, ...d.system.toObject() })) : [];
    };
    const index = async (id, fields) => {
      const pack = game.packs.get(id);
      if (!pack) return [];
      const entries = await pack.getIndex({ fields });
      return entries.map(e => ({
        uuid: `Compendium.${id}.${pack.documentName}.${e._id}`,
        name: e.name, img: e.img, type: e.type,
        ...(e.system ?? {})
      }));
    };
    const [races, classes, careers, talents, spells, weapons, armor, gear] = await Promise.all([
      docs(PACKS.races), docs(PACKS.classes), docs(PACKS.careers),
      index(PACKS.talents, ["system.className", "system.branch", "system.tier", "system.race", "system.effect", "system.identifier", "system.ranks", "system.requires"]),
      // The prose rides the index so a row can open on it without a second read (2026-09-06).
      index(PACKS.spells, ["system.tier", "system.school", "system.classes", "system.mana", "system.action",
        // 07 §9's mechanical run rides the index too, so a row SAYS what the
        // spell does rather than only what it is called: the step showed a
        // school, a Mana and an action and nothing else (the lead, 2026-09-07).
        "system.range", "system.target", "system.duration", "system.damage",
        "system.description", "system.effect"]),
      // **THE WEIGHT, THE CAPACITY AND THE SLOT RIDE THE INDEX TOO** (D-735):
      // `validate` holds the kit to the bag slots the character will have, and
      // a row with no weight is a dash that takes one well while a Backpack
      // with no `capacity` adds none. A field the index does not carry reads as
      // absent rather than as an error, so the refusal would simply be wrong.
      index(PACKS.weapons, ["system.cost", "system.rarity", "system.rating", "system.range", "system.quantity", "system.source", "system.traits", "system.description",
        "system.weight", "system.launcher", "system.fits"]),
      index(PACKS.armor, ["system.cost", "system.rarity", "system.category", "system.shield", "system.apBonus", "system.source", "system.traits", "system.description",
        "system.weight"]),
      index(PACKS.gear, ["system.cost", "system.rarity", "system.quantity", "system.source", "system.traits", "system.description",
        "system.weight", "system.capacity", "system.slot"])
    ]);
    const catalogue = [...weapons, ...armor, ...gear]
      .filter(i => (i.rarity ?? "common") === "common")
      .sort((a, b) => a.name.localeCompare(b.name));
    this.#data = { races, classes, careers, talents, spells, catalogue };
  }

  /** The state the window opens on: nothing chosen, the array, the road ahead. */
  #initialState() {
    return {
      step: "race",
      race: null, cls: null,
      method: "array",
      abilities: Object.fromEntries(ABILITIES.map(k => [k, null])),
      rolled: null,
      career: null, allowTier2: false,
      ranks: {},
      adaptable: null,
      racialTalent: null, classTalent: null,
      spells: [],
      side: null,
      equipment: [],
      kitLoadedFor: null,
      itemSearch: "", spellSearch: "",
      // The shelves open, the rows opened on their entry, the sort (2026-09-06).
      shelves: [], expanded: [], itemSort: "name",
      // The GM's door hands the character to a player; null keeps it the GM's.
      player: null,
      name: this.actor?.name ?? "",
      img: this.actor?.img ?? DEFAULT_IMG,
      motive: this.actor?.system?.motive ?? ""
    };
  }

  #raceDoc(s = this.#state) { return this.#data.races.find(r => r.uuid === s.race) ?? null; }
  #classDoc(s = this.#state) { return this.#data.classes.find(c => c.uuid === s.cls) ?? null; }
  #careerDoc(s = this.#state) { return this.#data.careers.find(c => c.uuid === s.career) ?? null; }
  #catalogueItem(uuid) { return this.#data.catalogue.find(i => i.uuid === uuid) ?? null; }

  /** The state as the rule reads it: plain data off the loaded documents. */
  #proposal(s = this.#state) {
    const race = this.#raceDoc(s);
    const cls = this.#classDoc(s);
    const career = this.#careerDoc(s);
    const classTalent = s.classTalent ? this.#data.talents.find(t => t.identifier === s.classTalent && t.className === cls?.name && !t.race) ?? null : null;
    return {
      race, cls, career,
      method: s.method,
      abilities: { ...s.abilities },
      rolled: s.rolled ? [...s.rolled] : null,
      allowTier2: Boolean(s.allowTier2) && game.user.isGM,
      ranks: { ...s.ranks },
      adaptable: s.adaptable,
      racialTalent: s.racialTalent ? race?.talents?.find(t => t.name === s.racialTalent) ?? { name: s.racialTalent, tier: 99 } : null,
      classTalent: classTalent ? { identifier: classTalent.identifier, name: classTalent.name, tier: classTalent.tier, className: classTalent.className } : null,
      spells: s.spells.map(uuid => this.#data.spells.find(sp => sp.uuid === uuid)).filter(Boolean),
      side: s.side,
      equipment: s.equipment.map(row => {
        const item = this.#catalogueItem(row.uuid);
        return item ? { ...item, quantity: row.quantity ?? 1, road: Boolean(row.road) } : null;
      }).filter(Boolean),
      name: s.name, img: s.img, motive: s.motive
    };
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
    const p = this.#proposal(s);
    const v = validate(p);
    const numbers = numbersFor(p);
    const reasonsAt = step => v.reasons.filter(r => r.step === step);
    const notesAt = step => v.notes.filter(n => n.step === step);
    const say = (prefix, entry) => game.i18n.format(`${prefix}.${entry.code}`, this.#say(entry.data ?? {}));

    // A class that casts nothing walks nine steps; the spells step is not on its strip (2026-09-06).
    const steps = stepsFor(p);
    if (!steps.includes(s.step)) s.step = "talents";
    const index = steps.indexOf(s.step);
    const pane = {};
    switch (s.step) {
      case "race": pane.races = await this.#racePane(s); break;
      case "class": pane.classes = await this.#classPane(s, p); break;
      case "abilities": Object.assign(pane, this.#abilitiesPane(s, numbers)); break;
      case "career": Object.assign(pane, await this.#careerPane(s, p)); break;
      case "skills": Object.assign(pane, this.#skillsPane(s, p, numbers)); break;
      case "talents": Object.assign(pane, await this.#talentsPane(s, p)); break;
      case "spells": Object.assign(pane, await this.#spellsPane(s, p)); break;
      case "languages": Object.assign(pane, this.#languagesPane(s, p, numbers)); break;
      case "equipment": Object.assign(pane, await this.#equipmentPane(s, p, numbers)); break;
      case "numbers": Object.assign(pane, this.#numbersPane(p, numbers)); break;
      case "name": Object.assign(pane, this.#namePane(s)); break;
    }

    return Object.assign(context, {
      step: s.step,
      stepIndex: index + 1,
      stepCount: steps.length,
      stepLabel: game.i18n.localize(`AZEROTH.Creator.Step.${s.step}`),
      steps: steps.map((key, i) => ({
        key, number: i + 1,
        label: game.i18n.localize(`AZEROTH.Creator.Step.${key}`),
        active: key === s.step,
        refused: reasonsAt(key).length
      })),
      canBack: index > 0,
      canNext: index < steps.length - 1,
      pane,
      summary: {
        ok: v.ok,
        reasons: reasonsAt(s.step).map(r => say("AZEROTH.Creator.Refused", r)),
        notes: notesAt(s.step).map(n => say("AZEROTH.Creator.Note", n)),
        elsewhere: v.reasons.filter(r => r.step !== s.step).length,
        health: numbers.health,
        defense: numbers.defense,
        change: coins(numbers.coin),
        over: numbers.coin < 0
      },
      building: Boolean(this.actor),
      isGM: game.user.isGM
    });
  }

  /** Localise what a reason or note carries before it is formatted in. */
  #say(data) {
    const out = { ...data };
    if (out.skill && AZEROTH.skills[out.skill]) out.skill = game.i18n.localize(AZEROTH.skills[out.skill]);
    if (out.side && AZEROTH.sides[out.side]) out.side = game.i18n.localize(AZEROTH.sides[out.side]);
    if (Number.isFinite(out.copper)) out.copper = coins(out.copper);
    return out;
  }

  async #racePane(s) {
    return Promise.all(this.#data.races.map(async r => ({
      uuid: r.uuid, name: r.name, img: r.img,
      selected: r.uuid === s.race,
      size: game.i18n.localize(AZEROTH.sizes[r.size] ?? r.size),
      trait: r.trait?.name ?? "",
      traitHtml: await enrich(r.trait?.description ?? ""),
      languages: (r.languages ?? []).map(l => game.i18n.localize(AZEROTH.languages[l] ?? l)).join(", "),
      classes: (r.classes ?? []).join(", ")
    })));
  }

  async #classPane(s, p) {
    // The tiles in 02 §7's order, the Warrior first; a class the chapter does not order goes last.
    const place = c => { const i = CLASS_ORDER.indexOf(c.identifier); return i < 0 ? CLASS_ORDER.length : i; };
    const ordered = [...this.#data.classes].sort((a, b) => place(a) - place(b));
    return Promise.all(ordered.map(async c => {
      const open = p.race ? p.race.classes.includes(c.name) : true;
      const pools = [c.momentum?.name, c.power?.name].filter(Boolean).map(n => game.i18n.localize(AZEROTH.poolTypes[n] ?? n));
      return {
        uuid: c.uuid, name: c.name, img: c.img,
        selected: c.uuid === s.cls,
        open,
        frame: game.i18n.localize(AZEROTH.frames[c.frame] ?? c.frame),
        pools: pools.join(" · "),
        resiliences: (c.resiliences ?? []).map(r => game.i18n.localize(AZEROTH.resiliences[r] ?? r)).join(", "),
        armor: (c.armor ?? []).filter(a => a !== "none").map(a => game.i18n.localize(AZEROTH.armorCategories[a] ?? a)).join(", ") || game.i18n.localize(AZEROTH.armorCategories.none),
        shields: Boolean(c.shields),
        weapons: c.weapons ?? "",
        casting: c.castingAbility ? game.i18n.localize(AZEROTH.abilities[c.castingAbility]) : null,
        // The other half of 01 §3's sentence (the lead, 2026-09-13). A class
        // that casts nothing printed nothing at all here, so the tile said
        // where the 16 goes only for the seven that cast.
        fighting: primaryAbilities(c).primary
          ? game.i18n.localize(AZEROTH.abilities[primaryAbilities(c).primary])
          : null,
        html: await enrich(c.description ?? "")
      };
    }));
  }

  #abilitiesPane(s, numbers) {
    // 01 §3: *"A 16 in the ability your class fights or casts with."* The
    // chapter says it once and the pane said it nowhere - a player picking
    // Warrior had no way to know the 16 goes in Strength short of reading 02
    // (the lead, 2026-09-13). The star is INK, never gold: gold is 1.78:1 on
    // parchment (D-608), and the word is on the tooltip and the aria-label so
    // the mark is never the only carrier.
    const { primary, casting } = primaryAbilities(this.#classDoc(s));
    const set = s.method === "array" ? [...ARRAY] : s.method === "roll" ? (s.rolled ? [...s.rolled] : []) : null;
    const remaining = value => {
      if (!set) return 0;
      const inSet = set.filter(v => v === value).length;
      const used = ABILITIES.filter(k => s.abilities[k] === value).length;
      return inSet - used;
    };
    const values = set ? [...new Set(set)].sort((a, b) => b - a) : [];
    const spent = s.method === "pointBuy" ? pointBuyTotal(s.abilities) : null;
    const rows = ABILITIES.map(key => {
      const value = s.abilities[key];
      // A Ranger fights with Dexterity and casts with Wisdom, so BOTH rows are
      // starred and each says which it is.
      const marks = [];
      if (key === primary) marks.push(game.i18n.localize("AZEROTH.Creator.FightsWithTip"));
      if (key === casting) marks.push(game.i18n.localize("AZEROTH.Creator.CastsWithTip"));
      const row = {
        key,
        label: game.i18n.localize(AZEROTH.abilities[key]),
        value,
        primary: marks.length > 0,
        primaryText: marks.join(" · "),
        mod: value === null ? null : abilityModifier(value),
        modText: value === null ? "—" : (abilityModifier(value) < 0 ? `−${Math.abs(abilityModifier(value))}` : `+${abilityModifier(value)}`)
      };
      if (set) {
        row.options = values.map(v => ({ value: v, selected: v === value, disabled: v !== value && remaining(v) <= 0 }));
      } else {
        const score = value ?? POINT_BUY.floor;
        const upCost = pointBuyCost(score + 1) === null ? null : pointBuyCost(score + 1) - pointBuyCost(score);
        row.value = score;
        row.cost = pointBuyCost(score);
        row.canDown = score > POINT_BUY.floor;
        row.canUp = upCost !== null && score < POINT_BUY.ceiling && spent + upCost <= POINT_BUY.points;
      }
      return row;
    });
    return {
      methods: METHODS.map(m => ({ key: m, label: game.i18n.localize(`AZEROTH.Creator.Method.${m}`), selected: m === s.method })),
      method: s.method,
      isArray: s.method === "array",
      isPointBuy: s.method === "pointBuy",
      isRoll: s.method === "roll",
      array: ARRAY.join(" · "),
      points: { spent, of: POINT_BUY.points, left: POINT_BUY.points - (spent ?? 0) },
      rolled: s.rolled ? s.rolled.map(v => ({ value: v })) : null,
      rolledText: s.rolled ? [...s.rolled].sort((a, b) => b - a).join(" · ") : null,
      floorMet: s.rolled ? rollFloorMet(s.rolled) : false,
      dice: `${ROLL_DICE}d6`, keep: ROLL_KEEP,
      abilityRows: rows
    };
  }

  async #careerPane(s, p) {
    const side = sideFor(p.race);
    const tiers = s.allowTier2 && game.user.isGM ? [1, 2] : [1];
    const groups = [];
    for (const key of ["anyone", "alliance", "horde"]) {
      const careers = this.#data.careers
        .filter(c => tiers.includes(c.tier) && (c.side ?? "anyone") === key)
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
        .map(c => ({
          uuid: c.uuid, name: c.name, tier: c.tier, selected: c.uuid === s.career,
          foreign: key !== "anyone" && key !== side,
          inCareer: (c.inCareer ?? []).map(k => game.i18n.localize(AZEROTH.skills[k] ?? k)).join(", ")
        }));
      if (careers.length) groups.push({ key, label: game.i18n.localize(AZEROTH.sides[key]), careers });
    }
    const chosen = p.career ? {
      name: p.career.name,
      grantor: p.career.grantor ?? "",
      entry: p.career.entry ?? "",
      signature: p.career.signature?.name ?? "",
      signatureHtml: await enrich(p.career.signature?.description ?? ""),
      inCareer: (p.career.inCareer ?? []).map(k => game.i18n.localize(AZEROTH.skills[k] ?? k)).join(", "),
      html: await enrich(p.career.description ?? "")
    } : null;
    return { groups, chosen, allowTier2: Boolean(s.allowTier2) };
  }

  #skillsPane(s, p, numbers) {
    const inCareer = inCareerSkills({ career: p.career, adaptable: s.adaptable });
    const spent = rankSpend(s.ranks, inCareer);
    // 02 §8's own words, under the row they belong to. The step had NO
    // explanation of any skill at all: a player choosing where a hundred
    // experience goes could not read what Warfare or Handling covers without
    // leaving the window (the lead, 2026-09-07). It expands in place, the way
    // a spell's entry does on the Spells step, so the row you are reading
    // about stays under the cursor.
    const expanded = new Set(s.expanded ?? []);
    const rows = Object.entries(AZEROTH.skills).map(([key, label]) => {
      const rank = Number(s.ranks[key]) || 0;
      const ability = AZEROTH.skillAbility[key];
      const next = rank < RANK_MAX ? rankCost(rank + 1, inCareer.has(key)) : null;
      return {
        key, label: game.i18n.localize(label),
        abilityAbbr: game.i18n.localize(AZEROTH.abilities[ability].replace(/\.Label$/, ".Abbr")),
        rank,
        inCareer: inCareer.has(key),
        nextCost: next,
        canUp: next !== null && spent + next <= STARTING_XP,
        canDown: rank > 0,
        total: numbers.skills[key].total,
        expanded: expanded.has(key),
        text: expanded.has(key) ? (SKILL_TEXT[key] ?? "") : ""
      };
    });
    return {
      human: p.race?.identifier === "human",
      adaptableOptions: Object.entries(AZEROTH.skills).map(([key, label]) => ({ key, label: game.i18n.localize(label), selected: key === s.adaptable })),
      rows,
      xp: { spent, of: STARTING_XP, held: STARTING_XP - spent }
    };
  }

  async #talentsPane(s, p) {
    const race = p.race;
    const cls = p.cls;
    const racial = await Promise.all((race?.talents ?? []).map(async t => ({
      name: t.name, tier: t.tier,
      selected: t.name === s.racialTalent,
      available: (t.tier ?? 1) <= 1,
      html: await enrich(t.description ?? "")
    })));
    const branches = [];
    if (cls) {
      const names = (cls.branches ?? []).map(b => b.name);
      const mine = this.#data.talents.filter(t => t.className === cls.name && !t.race && Number(t.tier) === 1);
      for (const name of names.length ? names : [...new Set(mine.map(t => t.branch))]) {
        const talents = await Promise.all(mine.filter(t => t.branch === name).sort((a, b) => a.name.localeCompare(b.name)).map(async t => ({
          identifier: t.identifier, name: t.name, ranks: t.ranks ?? 1,
          selected: t.identifier === s.classTalent,
          html: await enrich(t.effect ?? "")
        })));
        branches.push({ name, talents });
      }
    }
    const features = cls ? await Promise.all(featuresFor(cls, 1).map(async f => ({
      name: f.name, html: await enrich(f.description ?? "")
    }))) : [];
    return {
      racial, raceName: race?.name ?? null,
      branches, className: cls?.name ?? null,
      features
    };
  }

  /**
   * The spells step (07 §5, 2026-09-06): the count the class grants at level
   * 1, the spells chosen, and every eligible tier-1 spell of the class's
   * schools - each row opening on the entry's lore and effect, enriched, so
   * a spell is read before it is taken.
   */
  async #spellsPane(s, p) {
    const cls = p.cls;
    const required = spellsRequired(cls, p.abilities);
    const eligible = cls ? this.#data.spells.filter(sp =>
      Number(sp.tier) === 1 && cls.schools?.includes(sp.school)
      && (!Array.isArray(sp.classes) || !sp.classes.length || sp.classes.includes(cls.name))) : [];
    const expanded = new Set(s.expanded ?? []);
    const row = async (sp, extra = {}) => ({
      uuid: sp.uuid, name: sp.name, search: sp.name.toLowerCase(),
      school: game.i18n.localize(AZEROTH.schools[sp.school] ?? sp.school),
      mana: sp.mana ?? null,
      action: AZEROTH.actions[sp.action] ? game.i18n.localize(AZEROTH.actions[sp.action]) : null,
      // The mechanics, on the row. 07 §9's order: Range, Target, Duration,
      // Damage — the four a player weighs one tier-1 spell against another by.
      mechanics: [
        sp.range || null,
        sp.target || null,
        sp.duration?.text || null,
        sp.damage?.rating ? game.i18n.format("AZEROTH.Creator.SpellDamage", {
          rating: sp.damage.rating,
          school: game.i18n.localize(AZEROTH.schools[sp.damage.school ?? sp.school] ?? "")
        }) : null
      ].filter(Boolean).join(" · "),
      expanded: expanded.has(sp.uuid),
      lore: expanded.has(sp.uuid) ? await enrich(sp.description ?? "") : "",
      effect: expanded.has(sp.uuid) ? await enrich(sp.effect ?? "") : "",
      ...extra
    });
    const chosen = [];
    for (const [i, uuid] of s.spells.entries()) {
      const sp = this.#data.spells.find(e => e.uuid === uuid);
      if (sp) chosen.push(await row(sp, { index: i }));
    }
    const options = [];
    for (const sp of eligible.filter(sp => !s.spells.includes(sp.uuid)).sort((a, b) => a.name.localeCompare(b.name))) options.push(await row(sp));
    return {
      className: cls?.name ?? null,
      spells: {
        required, chosen, count: chosen.length,
        caster: castsSpells(cls),
        options,
        search: s.spellSearch ?? ""
      }
    };
  }

  #languagesPane(s, p, numbers) {
    const side = sideFor(p.race);
    return {
      languages: numbers.languages.map(l => game.i18n.localize(AZEROTH.languages[l] ?? l)),
      asks: Boolean(p.race) && side === null,
      sides: ["alliance", "horde"].map(key => ({
        key, label: game.i18n.localize(AZEROTH.sides[key]),
        tongue: game.i18n.localize(AZEROTH.languages[AZEROTH.SIDE_LANGUAGE[key]]),
        selected: key === s.side
      })),
      raised: side ? game.i18n.localize(AZEROTH.sides[side]) : null
    };
  }

  /**
   * The shelf a catalogue item sits on (2026-09-06): 08 §7's weapon
   * categories, §8's armor categories and its shields, and the shelves of
   * §9 to §17 as the gear pack's own section names them. The key orders the
   * shelves - weapons, then armor, then gear - and the label is what the
   * summary prints.
   */
  static shelfOf(item) {
    const section = String(item.source?.section ?? "");
    const type = game.i18n.localize(`TYPES.Item.${item.type}`);
    if (item.type === "weapon") {
      const m = /—\s*(.+)$/.exec(section);
      const name = m ? m[1].trim() : (/^20\b/.test(section) ? game.i18n.localize("AZEROTH.Creator.Unique") : type);
      return { key: `1:${name}`, label: `${type} · ${name}` };
    }
    if (item.type === "armor") {
      const name = item.shield ? game.i18n.localize("AZEROTH.Item.Shield")
        : (AZEROTH.armorCategories[item.category] ? game.i18n.localize(AZEROTH.armorCategories[item.category]) : type);
      return { key: `2:${name}`, label: `${type} · ${name}` };
    }
    const tail = sectionTail(section) ?? section.replace(/^\d+\s*/, "") ?? type;
    return { key: `3:${tail}`, label: `${type} · ${tail}` };
  }

  /** What a row's detail line says beside the prose: the numbers the catalogue printed. */
  static detailOf(item) {
    const parts = [];
    if (item.type === "weapon") {
      if (item.rating != null) parts.push(`${game.i18n.localize("AZEROTH.Sheet.DMG")} ${item.rating}`);
      if (item.range != null) parts.push(`${game.i18n.localize("AZEROTH.Item.Range")} ${item.range} ft`);
    }
    if (item.type === "armor" && item.apBonus) parts.push(`${game.i18n.localize("AZEROTH.Item.ApBonus")} ${item.apBonus}`);
    if (Array.isArray(item.traits) && item.traits.length) parts.push(item.traits.join(", "));
    return parts.join(" · ");
  }

  async #equipmentPane(s, p, numbers) {
    const ogre = p.race?.identifier === "ogre";
    const priced = item => item.cost * (ogre && item.type === "armor" && !item.shield ? 2 : 1);
    const expanded = new Set(s.expanded ?? []);
    const rows = [];
    for (const [index, row] of p.equipment.entries()) {
      const price = row.cost === null ? 0 : priced(row);
      const note = accessNote(row, p.cls);
      rows.push({
        index, uuid: row.uuid, name: row.name, img: row.img,
        type: game.i18n.localize(`TYPES.Item.${row.type}`),
        quantity: row.quantity,
        rarityClass: rarityClass(row.rarity),
        price: row.cost === null ? game.i18n.localize("AZEROTH.Creator.Issued") : coins(price),
        total: coins(price * row.quantity),
        road: row.road,
        note: note ? game.i18n.format(`AZEROTH.Creator.Note.${note}`, { name: row.name }) : null,
        expanded: expanded.has(row.uuid),
        description: expanded.has(row.uuid) ? await enrich(row.description ?? "") : "",
        detail: expanded.has(row.uuid) ? AzerothCharacterCreator.detailOf(row) : ""
      });
    }
    const kit = p.cls ? kitRows(p.cls, (name, type) => this.#data.catalogue.find(i => i.name === name && i.type === type)) : { rows: [], missing: [] };

    // The whole Common catalogue, shelved by kind, sorted on the toggle, and
    // filtered inside the window (D-638). A shelf's rows are still the
    // picker's rows: a term typed opens every shelf.
    const sort = s.itemSort === "cost" ? "cost" : "name";
    const byShelf = new Map();
    for (const i of this.#data.catalogue) {
      const shelf = AzerothCharacterCreator.shelfOf(i);
      if (!byShelf.has(shelf.key)) byShelf.set(shelf.key, { ...shelf, items: [] });
      byShelf.get(shelf.key).items.push({
        uuid: i.uuid, name: i.name, search: i.name.toLowerCase(),
        cost: i.cost == null ? -1 : priced(i),
        price: i.cost == null ? game.i18n.localize("AZEROTH.Creator.Issued") : coins(priced(i)),
        expanded: expanded.has(i.uuid),
        description: expanded.has(i.uuid) ? await enrich(i.description ?? "") : "",
        detail: expanded.has(i.uuid) ? AzerothCharacterCreator.detailOf(i) : ""
      });
    }
    const open = new Set(s.shelves ?? []);
    const shelves = [...byShelf.values()].sort((a, b) => a.key.localeCompare(b.key)).map(shelf => ({
      key: shelf.key, label: shelf.label, count: shelf.items.length,
      open: open.has(shelf.key),
      items: shelf.items.sort((a, b) => (sort === "cost" ? (a.cost - b.cost) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)))
    }));
    return {
      rows,
      hasKit: kit.rows.length > 0,
      missing: kit.missing.join(", "),
      shelves,
      sort,
      search: s.itemSearch ?? "",
      purse: { of: coins(PURSE), spent: coins(numbers.spent), change: coins(numbers.coin), over: numbers.coin < 0 }
    };
  }

  #numbersPane(p, numbers) {
    const fig = (key, value, note = null) => ({ key, label: game.i18n.localize(`AZEROTH.Creator.Numbers.${key}`), value, note });
    const signed = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
    const tiles = [
      fig("proficiency", signed(numbers.proficiency)),
      fig("health", numbers.health),
      fig("defense", numbers.defense),
      fig("initiative", numbers.initiative),
      fig("speed", `${numbers.speed} ft`),
      fig("resolve", numbers.resolve),
      fig("tether", numbers.spiritTether),
      fig("momentum", numbers.momentum ? `0 / ${numbers.momentum.max}` : "—", numbers.momentum ? game.i18n.localize(AZEROTH.poolTypes[numbers.momentum.name]) : null),
      fig("power", numbers.power ? `${numbers.power.max}` : "—", numbers.power ? game.i18n.localize(AZEROTH.poolTypes[numbers.power.name]) : null),
      fig("spellDC", numbers.spellDC ?? "—"),
      fig("ap", `${numbers.ap.body} · ${numbers.ap.head} · ${numbers.ap.limb}`, game.i18n.localize("AZEROTH.Creator.Numbers.apNote")),
      // BAG SLOTS, not pounds (D-735). `numbers.carry` became a count of bag
      // slots when the character stopped counting pounds, and the unit here
      // was left printing "19 lb" at a number that is nineteen wells.
      fig("carry", `${numbers.carry}`),
      fig("attack", `${signed(numbers.attack.melee)} / ${signed(numbers.attack.ranged)}`, game.i18n.localize("AZEROTH.Creator.Numbers.attackNote"))
    ];
    const skills = Object.entries(numbers.skills).map(([key, sk]) => ({
      key, label: game.i18n.localize(AZEROTH.skills[key]),
      abilityAbbr: game.i18n.localize(AZEROTH.abilities[sk.ability].replace(/\.Label$/, ".Abbr")),
      rank: sk.rank, total: signed(sk.total)
    }));
    return { tiles, skills, spellsKnown: numbers.spellsKnown };
  }

  #namePane(s) {
    return {
      name: s.name, img: s.img || DEFAULT_IMG, motive: s.motive,
      canBrowse: game.user.can("FILES_BROWSE"),
      // The GM's door offers the players; a player's own door makes them the owner (2026-09-06).
      players: game.user.isGM
        ? game.users.filter(u => !u.isGM).map(u => ({ id: u.id, name: u.name, selected: u.id === s.player }))
        : []
    };
  }

  /** Who owns the character Finish makes: the player making it, or the player the GM named. */
  #ownership() {
    const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const ownership = {};
    if (!game.user.isGM) ownership[game.user.id] = OWNER;
    if (game.user.isGM && this.#state?.player && game.users.has(this.#state.player)) ownership[this.#state.player] = OWNER;
    return ownership;
  }

  /* -------------------------------------------- */
  /*  The form                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-creator]")) {
      el.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }
    bindPickers(this.element);
    // The shelves (2026-09-06): a shelf opened by hand stays open across a
    // render; a term typed opens every shelf and hides the empty ones.
    for (const details of this.element.querySelectorAll(".azeroth-creator-shelf details")) {
      details.addEventListener("toggle", () => {
        const term = (this.element.querySelector("input[name=itemSearch]")?.value ?? "").trim();
        if (term) return;
        const key = details.closest("[data-shelf]")?.dataset.shelf;
        const open = new Set(this.#state.shelves ?? []);
        if (details.open) open.add(key); else open.delete(key);
        this.#state.shelves = [...open];
      });
    }
    const search = this.element.querySelector("input[name=itemSearch]");
    if (search) {
      search.addEventListener("input", () => this.#syncShelves());
      this.#syncShelves();
    }
  }

  /** Open every shelf while a term is typed and hide the ones with no row showing; restore the hand-opened set otherwise. */
  #syncShelves() {
    const term = (this.element.querySelector("input[name=itemSearch]")?.value ?? "").trim();
    const open = new Set(this.#state?.shelves ?? []);
    for (const shelf of this.element.querySelectorAll(".azeroth-creator-shelf")) {
      const details = shelf.querySelector("details");
      const showing = shelf.querySelectorAll("li[data-search]:not([hidden])").length;
      shelf.hidden = Boolean(term) && showing === 0;
      if (details) details.open = term ? true : open.has(shelf.dataset.shelf);
    }
  }

  /** Read the form into the state. Fields absent from the form keep their value. */
  #readForm() {
    const form = this.element;
    const s = this.#state;
    if (!form || !s) return;
    const el = name => form.elements?.[name] ?? null;
    const value = name => { const e = el(name); return e ? e.value : undefined; };

    const race = value("race"); if (race !== undefined) s.race = race || null;
    const cls = value("cls"); if (cls !== undefined) s.cls = cls || null;
    const method = value("method");
    if (method !== undefined && METHODS.includes(method) && method !== s.method) {
      s.method = method;
      s.abilities = Object.fromEntries(ABILITIES.map(k => [k, method === "pointBuy" ? POINT_BUY.floor : null]));
    }
    for (const key of ABILITIES) {
      const v = value(`ability-${key}`);
      if (v !== undefined && s.method !== "pointBuy") s.abilities[key] = v === "" ? null : Number(v);
    }
    const career = value("career"); if (career !== undefined) s.career = career || null;
    if (el("allowTier2")) s.allowTier2 = Boolean(el("allowTier2").checked);
    const adaptable = value("adaptable"); if (adaptable !== undefined) s.adaptable = adaptable || null;
    const racial = value("racialTalent"); if (racial !== undefined) s.racialTalent = racial || null;
    const talent = value("classTalent"); if (talent !== undefined) s.classTalent = talent || null;
    const side = value("side"); if (side !== undefined) s.side = side || null;
    const name = value("name"); if (name !== undefined) s.name = name;
    const img = value("img"); if (img !== undefined) s.img = img.trim() || DEFAULT_IMG;
    const motive = value("motive"); if (motive !== undefined) s.motive = motive;
    const player = value("player"); if (player !== undefined) s.player = player || null;
    // The pickers' terms, so a render redraws the list filtered as it was.
    const itemSearch = value("itemSearch"); if (itemSearch !== undefined) s.itemSearch = itemSearch;
    const spellSearch = value("spellSearch"); if (spellSearch !== undefined) s.spellSearch = spellSearch;
  }

  /* -------------------------------------------- */
  /*  Finish                                       */
  /* -------------------------------------------- */

  /**
   * Make the character. A partial `state` replaces what it names (the tests
   * drive the window this way); the form is read otherwise. Refuses with the
   * book's reasons and writes nothing; otherwise returns the actor.
   */
  async apply(state = null) {
    await this.#load();
    this.#state ??= this.#initialState();
    if (state) this.#state = { ...this.#state, ...foundry.utils.deepClone(state) };
    const proposal = this.#proposal();
    const v = validate(proposal);
    if (!v.ok) {
      const reasons = v.reasons.map(r => game.i18n.format(`AZEROTH.Creator.Refused.${r.code}`, this.#say(r.data ?? {})));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Creator.Refused.Summary", { reasons: reasons.join("; ") }));
      if (this.rendered) await this.render();
      return { ok: false, reasons: v.reasons, actor: null };
    }

    const p = plan(proposal);
    const created = !this.actor;
    let actor = this.actor;
    const createdItems = [];
    try {
      // The maker owns what Finish makes, and the GM may hand it to a player (2026-09-06).
      const ownership = this.#ownership();
      if (created) actor = await Actor.create({ ...p.create, ...(Object.keys(ownership).length ? { ownership } : {}) });

      // ONE embed, so the grant chain runs once (actor.mjs, _talentGrant).
      const docs = [];
      for (const e of p.embeds) {
        const doc = await fromUuid(e.uuid);
        if (!doc) throw new Error(`no document at ${e.uuid}`);
        const data = doc.toObject();
        if (e.system) foundry.utils.mergeObject(data, { system: e.system });
        docs.push(data);
      }
      // **THE BAG DOORS ARE BYPASSED HERE, AND ONLY HERE** (D-737). The race
      // arrives in the SAME batch as the kit, so `AzerothItem`'s create hook
      // would judge a goblin at Medium and a tauren at Medium too - the size
      // rung is read off a race item the actor does not hold yet. The kit was
      // already held to the character's own bag slots by `validate`'s `noRoom`
      // refusal, which reads the size off the proposal, and `arrange` below
      // puts everything where it fits.
      const items = await actor.createEmbeddedDocuments("Item", docs, { azerothBags: "bypass" });
      createdItems.push(...items.map(i => i.id));
      await this.#untilGranted(actor, proposal);

      // ONE arrange, after the grant, so the containers in the kit are holding
      // what they should be holding rather than everything sitting loose.
      const placings = arrange([...actor.items].map(item => ({ ...item.toObject(), id: item.id })), actor.system?.bagSlots?.base ?? 0);
      if (placings.length) {
        await actor.updateEmbeddedDocuments("Item",
          // The WELL travels with the bag (the lead, 2026-09-20): the write
          // carries the bypass, so nothing downstream would stamp one, and a
          // kit that landed with no positions would draw in a different order
          // from the one `arrange` worked out.
          placings.map(w => ({ _id: w._id, "system.container": w.system.container, "system.well": w.system.well })),
          { render: false, azerothBags: "bypass" });
      }

      // The picks: a racial pick and the level's one talent point, then
      // Adaptable's skill on the Human trait feature (the Core tab's "Known").
      const updates = [];
      if (p.picks.racial) {
        const talent = actor.items.find(i => i.type === "talent" && i.system.race && i.name === p.picks.racial);
        if (talent) updates.push({ _id: talent.id, "system.taken": 1 });
      }
      if (p.picks.classTalent) {
        const talent = actor.items.find(i => i.type === "talent" && !i.system.race && i.system.identifier === p.picks.classTalent);
        if (talent) updates.push({ _id: talent.id, "system.taken": 1 });
      }
      if (p.picks.adaptable) {
        const raceId = actor.raceItem?.id;
        const trait = actor.items.find(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.classId === raceId);
        if (trait) {
          updates.push({ _id: trait.id, "system.known": [{
            uuid: skillUuid(p.picks.adaptable),
            name: game.i18n.localize(AZEROTH.skills[p.picks.adaptable])
          }] });
        }
      }
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

      // The Ranks, the spend and its ledger - the sheet's own shape, with the kind D2 §2.4 names.
      const update = {
        "flags.azeroth-rpg.skillRanks": p.update["flags.azeroth-rpg.skillRanks"],
        "system.xp.spent": p.update["system.xp.spent"],
        "flags.azeroth-rpg.xpLedger": p.update.ledger.map(row => ({
          amount: row.amount,
          label: game.i18n.format("AZEROTH.Sheet.LedgerRank", { skill: game.i18n.localize(AZEROTH.skills[row.skill]), rank: row.rank }),
          at: Date.now(),
          kind: row.kind
        }))
      };
      if (!created) {
        // The Build door: the fields the new door passed to Actor.create.
        if (Object.keys(ownership).length) update.ownership = { ...actor.ownership, ...ownership };
        // THE WHOLE PROTOTYPE TOKEN, flattened (the lead, 2026-09-13). This
        // named `actorLink` and the two sizes, so a character filled in
        // through Build kept core's HOSTILE disposition, hidden name and
        // missing Health bar while one made through New character got all
        // five - two doors, two different tokens. `_preCreate` cannot help
        // here: the actor already exists.
        Object.assign(update, foundry.utils.flattenObject({ system: p.create.system }), {
          name: p.create.name, img: p.create.img,
          ...foundry.utils.flattenObject({ prototypeToken: p.create.prototypeToken })
        });
      }
      await actor.update(update);
    } catch (err) {
      console.error("azeroth-rpg | the creator could not finish", err);
      if (created) await actor?.delete().catch(() => {});
      else if (createdItems.length) await actor.deleteEmbeddedDocuments("Item", createdItems).catch(() => {});
      ui.notifications?.error(game.i18n.localize("AZEROTH.Creator.Failed"));
      return { ok: false, reasons: [{ code: "failed", step: "name" }], actor: null, error: err };
    }

    ui.notifications?.info(game.i18n.format(created ? "AZEROTH.Creator.Created" : "AZEROTH.Creator.Filled", { name: actor.name }));
    await this.close();
    actor.sheet?.render({ force: true });
    return { ok: true, reasons: [], actor };
  }

  /** Wait for the grant chain: the class's talents, the race's, and the race trait feature. */
  async #untilGranted(actor, proposal) {
    await actor._talentGrant?.catch?.(() => {});
    const wantClass = proposal.cls ? 36 : 0;
    const wantRace = proposal.race ? 8 : 0;
    const done = () => {
      const classTalents = actor.items.filter(i => i.type === "talent" && !i.system?.race).length;
      const raceTalents = actor.items.filter(i => i.type === "talent" && i.system?.race).length;
      const trait = !proposal.race || actor.items.some(i => i.type === "feature" && i.getFlag("azeroth-rpg", "feature")?.classId === actor.raceItem?.id);
      return classTalents >= wantClass && raceTalents >= wantRace && trait;
    };
    for (let i = 0; i < GRANT_POLL && !done(); i++) await new Promise(r => setTimeout(r, 50));
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onSubmit() {
    this.#readForm();
    return this.apply();
  }

  static async #onGo(event, target) {
    this.#readForm();
    return this.goTo(target.dataset.step);
  }

  static async #onBack() {
    this.#readForm();
    const steps = stepsFor(this.#proposal());
    return this.goTo(steps[Math.max(0, steps.indexOf(this.#state.step) - 1)]);
  }

  static async #onNext() {
    this.#readForm();
    const steps = stepsFor(this.#proposal());
    return this.goTo(steps[Math.min(steps.length - 1, steps.indexOf(this.#state.step) + 1)]);
  }

  /** A row's name opens what the entry says, and closes it again (2026-09-06). */
  static async #onExpand(event, target) {
    this.#readForm();
    const key = target.dataset.key;
    if (!key) return;
    const open = new Set(this.#state.expanded ?? []);
    if (open.has(key)) open.delete(key); else open.add(key);
    this.#state.expanded = [...open];
    this.render();
  }

  /** The shelves sort by name or by cost, on one toggle. */
  static async #onSort() {
    this.#readForm();
    this.#state.itemSort = this.#state.itemSort === "cost" ? "name" : "cost";
    this.render();
  }

  static async #onCancel() {
    return this.close();
  }

  /** Six scores of 4d6 drop the lowest, posted once; the floor decides whether they stand. */
  async roll() {
    await this.#load();
    this.#state ??= this.#initialState();
    const rolls = [];
    for (let i = 0; i < ABILITIES.length; i++) {
      rolls.push(await new Roll(`${ROLL_DICE}d6kh${ROLL_KEEP}`).evaluate());
    }
    const set = rolls.map(r => r.total);
    const met = rollFloorMet(set);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor ?? undefined }),
      flavor: game.i18n.localize("AZEROTH.Creator.RolledFlavor"),
      content: `<p>${game.i18n.format(met ? "AZEROTH.Creator.RolledCard" : "AZEROTH.Creator.RolledBelow", { set: set.join(", ") })}</p>`,
      rolls
    });
    this.#state.method = "roll";
    this.#state.rolled = set;
    this.#state.abilities = Object.fromEntries(ABILITIES.map(k => [k, null]));
    if (this.rendered) await this.render();
    return set;
  }

  static async #onRoll() {
    this.#readForm();
    return this.roll();
  }

  static async #onStepScore(event, target) {
    this.#readForm();
    const s = this.#state;
    const key = target.dataset.ability;
    const delta = Number(target.dataset.delta) || 0;
    const score = (s.abilities[key] ?? POINT_BUY.floor) + delta;
    if (score < POINT_BUY.floor || score > POINT_BUY.ceiling) return;
    const next = { ...s.abilities, [key]: score };
    if (pointBuyTotal(next) > POINT_BUY.points) return;
    s.abilities = next;
    this.render();
  }

  static async #onStepRank(event, target) {
    this.#readForm();
    const s = this.#state;
    const key = target.dataset.skill;
    const delta = Number(target.dataset.delta) || 0;
    const rank = (Number(s.ranks[key]) || 0) + delta;
    if (rank < 0 || rank > RANK_MAX) return;
    const inCareer = inCareerSkills({ career: this.#careerDoc(s), adaptable: s.adaptable });
    const next = { ...s.ranks, [key]: rank };
    if (rankSpend(next, inCareer) > STARTING_XP) return;
    if (rank === 0) delete next[key];
    s.ranks = next;
    this.render();
  }

  /** A picker row names its spell by uuid; the typed term is the fallback for a call with no row. */
  static async #onAddSpell(event, target) {
    this.#readForm();
    const input = this.element.querySelector("input[name=spellSearch]");
    const wanted = (input?.value ?? "").trim().toLowerCase();
    const cls = this.#classDoc();
    const uuid = target?.dataset?.uuid;
    const entry = (uuid ? this.#data.spells.find(sp => sp.uuid === uuid) : null)
      ?? this.#data.spells.find(sp => sp.name.toLowerCase() === wanted)
      ?? (wanted.length > 2 ? this.#data.spells.find(sp => sp.name.toLowerCase().startsWith(wanted)) : null);
    if (!entry || !cls) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Creator.NoSpell", { name: input?.value ?? "" }));
      return;
    }
    if (!this.#state.spells.includes(entry.uuid)) this.#state.spells.push(entry.uuid);
    this.render();
  }

  static async #onRemoveSpell(event, target) {
    this.#readForm();
    this.#state.spells.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** The class's suggested kit, replacing what is in the cart. */
  static async #onKit() {
    this.#readForm();
    this.loadKit();
    this.render();
  }

  /** Put the class's kit in the cart (01 §6). Returns the rows; nothing without a class. */
  loadKit() {
    const cls = this.#classDoc();
    if (!cls) return [];
    const { rows } = kitRows(cls, (name, type) => this.#data.catalogue.find(i => i.name === name && i.type === type));
    this.#state.equipment = rows.map(r => ({ uuid: r.uuid, quantity: r.quantity, road: r.road }));
    this.#state.kitLoadedFor = cls.uuid;
    return this.#state.equipment;
  }

  /** A picker row names its item by uuid; the typed term is the fallback for a call with no row. */
  static async #onAddItem(event, target) {
    this.#readForm();
    const input = this.element.querySelector("input[name=itemSearch]");
    const wanted = (input?.value ?? "").trim().toLowerCase();
    const uuid = target?.dataset?.uuid;
    const entry = (uuid ? this.#catalogueItem(uuid) : null)
      ?? this.#data.catalogue.find(i => i.name.toLowerCase() === wanted)
      ?? (wanted.length > 2 ? this.#data.catalogue.find(i => i.name.toLowerCase().startsWith(wanted)) : null);
    if (!entry) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Creator.NoItem", { name: input?.value ?? "" }));
      return;
    }
    const held = this.#state.equipment.find(r => r.uuid === entry.uuid);
    if (held) held.quantity = (held.quantity ?? 1) + 1;
    else this.#state.equipment.push({ uuid: entry.uuid, quantity: 1, road: false });
    this.render();
  }

  static async #onRemoveItem(event, target) {
    this.#readForm();
    this.#state.equipment.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onStepQuantity(event, target) {
    this.#readForm();
    const row = this.#state.equipment[Number(target.dataset.index)];
    if (!row) return;
    row.quantity = Math.max(1, (row.quantity ?? 1) + (Number(target.dataset.delta) || 0));
    this.render();
  }

  static async #onPortrait() {
    this.#readForm();
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const picker = new FilePicker({
      type: "image",
      current: this.#state.img,
      callback: path => { this.#state.img = path; this.render(); }
    });
    return picker.browse();
  }
}
