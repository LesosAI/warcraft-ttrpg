/**
 * The NPC generator (D-637): one window where a GM builds a creature the way
 * 13 §5 says to - say what it is, choose a weight class and a tier, take its
 * numbers from the table, give it one thing to do, write its Behavior - and
 * lands it in the world's bestiary shaped exactly like the pack's creatures.
 * `rules/bestiary.mjs` is the law and this is the form around it: every band
 * figure is a suggestion the GM overwrites, the summary prints every reason
 * the chapter refuses and every deviation D-104 allows, beside Create.
 *
 * Two doors. The Actor directory's New creature button opens it blank; the
 * Rework button on an NPC's banner opens it on that creature and Apply
 * updates in place - the sheet stays a reading surface (D11 §6). Start from
 * an entry loads a pack creature into the form, because 13 §5 says reskin
 * before you build.
 *
 * Changing the weight class, the tier or what the creature is re-suggests
 * every figure the GM has not touched; a figure once typed is theirs.
 */

import { AZEROTH } from "../config.mjs";
import { enrich } from "../helpers/enrich.mjs";
import { bindPickers } from "./picker.mjs";
import { ABILITIES, abilityModifier } from "../rules/abilities.mjs";
import { injuryConditions } from "../rules/injuries.mjs";
import { RANK_MAX } from "../rules/xp.mjs";
import {
  BOSS, TYPES, WEIGHTS, attackBonus, bandFor, baseTrait, prototypeTokenFor, reachesPastMelee, review,
  htmlFromProse, stateFromSystem, suggest, toSystem, traitPlaceholder
} from "../rules/bestiary.mjs";
import { buildSwarm, canSwarm, swarmsFrom } from "../rules/swarm.mjs";
import { cleanAutomation, emptyAutomation, hasAutomation, mergeSeed, seedAutomation } from "../rules/ability-automation.mjs";
import { tokenSize } from "../rules/size.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/npc-generator.hbs";

/** A select's options off a config enum, the current value selected, with an optional blank row. */
function choicesOf(map, selected, { blank = null } = {}) {
  return [
    ...(blank ? [{ value: "", label: blank, selected: !selected }] : []),
    ...Object.entries(map).map(([value, label]) => ({ value, label: game.i18n.localize(label), selected: value === selected }))
  ];
}
const DEFAULT_IMG = "icons/svg/mystery-man.svg";
export const FOLDER_SETTING = "generatorFolder";

/** The paths `suggest` fills and a GM may overwrite; a touched one is left alone on re-suggestion. */
const SUGGESTED = Object.freeze([
  "numbers.health", "numbers.defense", "numbers.ap.body", "numbers.ap.head", "numbers.ap.limb",
  "numbers.wards.0.value", "numbers.initiative", "spells.dc", "keywords.power.max"
]);
/** A change to one of these re-suggests the rest. */
const STRUCTURAL = Object.freeze([
  "identity.weightClass", "identity.tier", "identity.creatureType", "identity.typeMarker", "identity.size",
  "numbers.armor", "numbers.hasHead", "numbers.hasLimbs", "numbers.wards.0.school", "numbers.flies", "spells.caster"
]);

export class AzerothNpcGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-generator"],
    tag: "form",
    window: { title: "AZEROTH.Generator.Title", resizable: true },
    position: { width: 780, height: 840 },
    form: { handler: AzerothNpcGenerator.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      generatorStartFrom: AzerothNpcGenerator.#onStartFrom,
      generatorPortrait: AzerothNpcGenerator.#onPortrait,
      generatorAddAttack: AzerothNpcGenerator.#onAddAttack,
      generatorRemoveAttack: AzerothNpcGenerator.#onRemoveAttack,
      generatorAddSpell: AzerothNpcGenerator.#onAddSpell,
      generatorAddTrait: AzerothNpcGenerator.#onAddTrait,
      generatorBrowseTraits: AzerothNpcGenerator.#onBrowseTraits,
      generatorRemoveSpell: AzerothNpcGenerator.#onRemoveSpell,
      generatorAddAbility: AzerothNpcGenerator.#onAddAbility,
      generatorRemoveAbility: AzerothNpcGenerator.#onRemoveAbility,
      generatorAddBossAction: AzerothNpcGenerator.#onAddBossAction,
      generatorRemoveBossAction: AzerothNpcGenerator.#onRemoveBossAction,
      generatorAddSkill: AzerothNpcGenerator.#onAddSkill,
      generatorRemoveSkill: AzerothNpcGenerator.#onRemoveSkill,
      generatorAddWard: AzerothNpcGenerator.#onAddWard,
      generatorSeedAbility: AzerothNpcGenerator.#onSeedAbility,
      generatorRemoveWard: AzerothNpcGenerator.#onRemoveWard,
      generatorSuggestInflicts: AzerothNpcGenerator.#onSuggestInflicts,
      generatorResuggest: AzerothNpcGenerator.#onResuggest,
      generatorReload: AzerothNpcGenerator.#onReload,
      generatorCancel: AzerothNpcGenerator.#onCancel
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-generator-pane"] } };

  /**
   * @param {object} [options]
   * @param {Actor|null} [options.actor]  An NPC to rework; null builds a new one.
   */
  constructor({ actor = null, ...options } = {}) {
    super({ ...options, id: actor ? `azeroth-npc-generator-${actor.id}` : "azeroth-npc-generator" });
    this.actor = actor;
  }

  #state = null;
  #data = null;

  /** @inheritDoc */
  get title() {
    return this.actor
      ? game.i18n.format("AZEROTH.Generator.TitleFor", { name: this.actor.name })
      : game.i18n.localize("AZEROTH.Generator.Title");
  }

  /** A creature the GM may rework: an NPC they own. */
  static reworkable(actor) {
    return Boolean(actor) && actor.type === "npc" && game.user.isGM && actor.isOwner;
  }

  /** The current state (a copy), for the tests and the summary. */
  get state() {
    return this.#state ? foundry.utils.deepClone({ ...this.#state, touched: [...this.#state.touched] }) : null;
  }

  /** Merge a partial state, the way the tests drive the window; nested objects merge, arrays replace. */
  async setState(partial = {}) {
    await this.#load();
    this.#state ??= this.#initialState();
    this.#merge(partial);
    if (this.rendered) await this.render();
    return this.state;
  }

  #merge(partial) {
    const was = { identity: { swarm: this.#state?.identity?.swarm ?? null } };
    const touched = partial.touched ? new Set(partial.touched) : this.#state.touched;
    const merged = foundry.utils.mergeObject(this.#state, foundry.utils.deepClone({ ...partial, touched: undefined }), { inplace: false });
    delete merged.touched;
    this.#state = { ...merged, touched };
    // What a caller sets by hand is theirs.
    for (const path of SUGGESTED) {
      if (foundry.utils.hasProperty(partial, path)) this.#state.touched.add(path);
    }
    // A swarm set by a caller takes its numbers from the member's, as a tick does.
    if (foundry.utils.hasProperty(partial, "identity.swarm")) this.#applySwarm(was?.identity?.swarm ?? null);
    (partial.attacks ?? []).forEach((a, i) => {
      if (a && "bonus" in a) this.#state.touched.add(`attacks.${i}.bonus`);
      if (a && "damage" in a) this.#state.touched.add(`attacks.${i}.damage`);
    });
  }

  /* -------------------------------------------- */
  /*  Loading                                      */
  /* -------------------------------------------- */

  async #load() {
    if (this.#data) return;
    const index = async (id, fields) => {
      const pack = game.packs.get(id);
      if (!pack) return [];
      const entries = await pack.getIndex({ fields });
      return entries.map(e => ({ uuid: `Compendium.${id}.${pack.documentName}.${e._id}`, name: e.name, img: e.img, ...(e.system ?? {}) }));
    };
    const [bestiary, races, spells, traits] = await Promise.all([
      index("azeroth-rpg.bestiary", ["system.weightClass", "system.tier", "system.creatureType"]),
      index("azeroth-rpg.races", ["system.size"]),
      // D-706: the tier, the Mana and the Prerequisite are what `review` holds
      // a creature's list to - the ceiling, the effect gate and what the pool
      // can buy.
      index("azeroth-rpg.spells", ["system.tier", "system.school", "system.mana", "system.prerequisite"]),
      index("azeroth-rpg.traits", ["system.kind"])
    ]);
    this.#data = {
      bestiary: bestiary.sort((a, b) => a.name.localeCompare(b.name)),
      raceSizes: new Map(races.map(r => [r.name, r.size])),
      spells: spells.map(s => ({ name: s.name, tier: s.tier ?? 1, school: s.school ?? null, mana: s.mana ?? 0, prerequisite: s.prerequisite ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
      spellNames: spells.map(s => s.name).sort((a, b) => a.localeCompare(b)),
      traitNames: traits.filter(t => t.kind !== "mount").map(t => t.name).sort((a, b) => a.localeCompare(b))
    };
  }

  /** What the window opens on: a blank tier-1 Standard humanoid with the band filled in, or the creature reworked. */
  #initialState() {
    if (this.actor) {
      const state = stateFromSystem(this.actor.system.toObject(), { name: this.actor.name, img: this.actor.img });
      return { ...state, mode: "rework", actorId: this.actor.id, folder: this.actor.folder?.id ?? null, from: null, touched: new Set(SUGGESTED) };
    }
    const proposed = suggest({ weightClass: "standard", tier: 1, creatureType: "humanoid", size: "medium" });
    const state = stateFromSystem(proposed, { name: "", img: DEFAULT_IMG });
    state.attacks = [{ name: "", ability: "str", bonus: proposed.attack.bonus, damage: proposed.attack.damage, traits: [], range: null }];
    let folder = null;
    try { folder = game.settings.get("azeroth-rpg", FOLDER_SETTING) || null; } catch { folder = null; }
    if (folder && !game.folders.get(folder)) folder = null;
    return { ...state, mode: "create", actorId: null, folder, from: null, touched: new Set() };
  }

  /** The spec `suggest` reads off the state. */
  #spec(s = this.#state) {
    return {
      weightClass: s.identity.weightClass, tier: s.identity.tier, creatureType: s.identity.creatureType,
      typeMarker: s.identity.typeMarker, size: s.identity.size, race: s.identity.race,
      abilities: { ...s.abilities }, armor: s.numbers.armor ?? "typical",
      hasHead: s.numbers.hasHead !== false, hasLimbs: s.numbers.hasLimbs !== false,
      ward: s.numbers.wards?.[0]?.school ?? null, caster: Boolean(s.spells?.caster), flies: Boolean(s.numbers.flies),
      attackAbility: "str"
    };
  }

  /** Re-apply the band to every figure the GM has not touched. */
  #resuggest() {
    const s = this.#state;
    const p = suggest(this.#spec(s));
    const set = (path, value) => { if (!s.touched.has(path)) foundry.utils.setProperty(s, path, value); };
    // A swarm's band is the member's times the members, Defense two under (13 §4).
    const members = canSwarm(s.identity.weightClass) ? (s.identity.swarm?.members ?? null) : null;
    const swarm = members ? buildSwarm({ health: p.health.max, defense: p.defense }, members) : null;
    set("numbers.health", swarm ? swarm.health.max : p.health.max);
    set("numbers.defense", swarm ? swarm.defense : p.defense);
    if (swarm && !s.touched.has("numbers.health") && !s.touched.has("numbers.defense")) s.identity.swarmBase = { health: p.health.max, defense: p.defense };
    set("numbers.ap.body", p.ap.body);
    set("numbers.ap.head", p.ap.head);
    set("numbers.ap.limb", p.ap.limb);
    // The band suggests the first Ward's number; any further school is the GM's (D-644).
    const firstWard = s.numbers.wards?.[0]?.school;
    if (firstWard && p.ward[firstWard] !== undefined) set("numbers.wards.0.value", p.ward[firstWard]);
    set("numbers.initiative", p.initiative);
    set("spells.dc", p.spells.dc);
    set("keywords.power.max", p.power.max);
    if (s.identity.typeMarker === "Mindless") {
      for (const key of ["int", "cha"]) if (s.abilities[key] === 10) s.abilities[key] = null;
    }
    s.attacks.forEach((a, i) => {
      const mod = s.abilities[a.ability ?? "str"] === null ? 0 : abilityModifier(s.abilities[a.ability ?? "str"] ?? 10);
      if (!s.touched.has(`attacks.${i}.bonus`)) a.bonus = attackBonus(mod, s.identity.tier);
      if (!s.touched.has(`attacks.${i}.damage`)) a.damage = p.attack.damage;
    });
  }

  #system(s = this.#state) {
    return toSystem(s);
  }

  #review(s = this.#state) {
    return review({ name: s.name, system: this.#system(s) }, {
      spellNames: this.#data.spellNames,
      // D-706: so Apply refuses an over-tier pick with its reason in the
      // summary. The picker greys nothing - the words are the refusal.
      spells: new Map(this.#data.spells.map(sp => [sp.name, sp])),
      traitNames: this.#data.traitNames, raceSizes: this.#data.raceSizes
    });
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
    const system = this.#system(s);
    const v = this.#review(s);
    const band = bandFor({ weightClass: s.identity.weightClass, tier: s.identity.tier });
    const heldWards = new Set((s.numbers.wards ?? []).map(w => w.school));
    const boss = s.identity.weightClass === "boss";
    // The prefixes stay literal, dot and all, so the lang audit can follow them.
    const reason = entry => game.i18n.format(`AZEROTH.Generator.Reason.${entry.code}`, this.#say(entry.params ?? {}));
    const noted = entry => game.i18n.format(`AZEROTH.Generator.Note.${entry.code}`, this.#say(entry.params ?? {}));
    const signed = n => (n === null || n === undefined ? "—" : n < 0 ? `−${Math.abs(n)}` : `+${n}`);
    const dash = game.i18n.localize("AZEROTH.Generator.None");

    const scores = ABILITIES.map(key => ({
      key, label: game.i18n.localize(AZEROTH.abilities[key]),
      value: s.abilities[key],
      mod: s.abilities[key] === null ? "—" : signed(abilityModifier(s.abilities[key])),
      disabled: s.identity.typeMarker === "Mindless" && (key === "int" || key === "cha")
    }));
    const mods = Object.fromEntries(ABILITIES.map(k => [k, s.abilities[k] === null ? 0 : abilityModifier(s.abilities[k] ?? 10)]));

    return Object.assign(context, {
      mode: s.mode,
      rework: s.mode === "rework",
      name: s.name, img: s.img || DEFAULT_IMG, from: s.from,
      canBrowse: game.user.can("FILES_BROWSE"),
      folders: [{ id: "", name: game.i18n.localize("AZEROTH.Generator.NoFolder"), selected: !s.folder },
        ...(game.actors._formatFolderSelectOptions?.() ?? []).map(f => ({ ...f, selected: f.id === s.folder }))],
      // Every creature in 14, filtered inside the window as the GM types (D-638).
      bestiary: this.#data.bestiary.map(e => ({
        name: e.name, search: e.name.toLowerCase(),
        line: game.i18n.format("AZEROTH.Picker.Entry", {
          weight: game.i18n.localize(AZEROTH.weightClasses[e.weightClass] ?? e.weightClass ?? ""), tier: e.tier ?? 1
        })
      })),
      search: { entry: s.search?.entry ?? "", spell: s.search?.spell ?? "" },
      identity: {
        weightClasses: choicesOf(AZEROTH.weightClasses, s.identity.weightClass),
        tiers: [1, 2, 3, 4].map(t => ({ value: t, selected: t === s.identity.tier })),
        types: choicesOf(AZEROTH.creatureTypes, s.identity.creatureType),
        mindless: s.identity.typeMarker === "Mindless",
        sizes: choicesOf(AZEROTH.sizes, s.identity.size),
        races: [{ value: "", label: dash, selected: !s.identity.race },
          ...[...this.#data.raceSizes.keys()].sort().map(name => ({ value: name, label: name, selected: name === s.identity.race }))],
        tracks: choicesOf(AZEROTH.corruptionTracks, s.identity.corruption, { blank: dash }),
        boss, beast: s.identity.creatureType === "beast",
        handlingDC: s.identity.handlingDC, dungeon: s.identity.dungeon ?? "",
        share: band.share === null ? "—" : String(band.share),
        // A swarm (13 §4, D-646): on a weight class that swarms, from the chapter's count.
        canSwarm: canSwarm(s.identity.weightClass),
        swarm: {
          on: (s.identity.swarm?.members ?? null) !== null,
          members: s.identity.swarm?.members ?? swarmsFrom(s.identity.weightClass) ?? "",
          of: s.identity.swarm?.of ?? "",
          from: swarmsFrom(s.identity.weightClass) ?? 2,
          band: game.i18n.format("AZEROTH.Generator.SwarmBand", {
            n: s.identity.swarm?.members ?? swarmsFrom(s.identity.weightClass) ?? 2,
            share: band.share === null ? "—" : String(Math.round(band.share * (s.identity.swarm?.members ?? swarmsFrom(s.identity.weightClass) ?? 2) * 100) / 100)
          })
        },
        bossLine: boss ? game.i18n.format("AZEROTH.Generator.BossLine", {
          dc: band.spellDC, actions: band.bossActions.max, damage: band.actionDamage, area: band.actionDamage - 1
        }) : null
      },
      numbers: {
        health: s.numbers.health, healthBand: band.health,
        healthNote: boss ? game.i18n.format("AZEROTH.Generator.Centre", { n: band.health }) : String(band.health),
        defense: s.numbers.defense, defenseBand: band.defense,
        ap: s.numbers.ap, apBand: band.ap, hasHead: s.numbers.hasHead !== false, hasLimbs: s.numbers.hasLimbs !== false,
        armors: [{ value: "typical", label: game.i18n.localize("AZEROTH.Generator.Typical"), selected: (s.numbers.armor ?? "typical") === "typical" },
          ...choicesOf(AZEROTH.armorCategories, s.numbers.armor)],
        // One row a school, each select offering its own and the unheld ones (D-644).
        wards: (s.numbers.wards ?? []).map((w, index) => ({
          index, school: w.school, value: w.value,
          options: choicesOf(Object.fromEntries(Object.entries(AZEROTH.schools).filter(([k]) => k === w.school || !heldWards.has(k))), w.school)
        })),
        wardOptions: Object.entries(AZEROTH.schools).filter(([k]) => !heldWards.has(k)).map(([value, label]) => ({ value, label: game.i18n.localize(label) })),
        wardBand: band.ward,
        speed: s.numbers.speed, flies: Boolean(s.numbers.flies),
        flying: game.i18n.format("AZEROTH.Generator.Flying", { pace: system.flyingSpeed ?? (s.identity.tier >= 3 ? 240 : 120) }),
        initiative: s.numbers.initiative, initiativeBand: 10 + mods.dex,
        scores
      },
      attacks: s.attacks.map((a, index) => ({
        index, name: a.name, bonus: a.bonus, damage: a.damage, range: a.range,
        traits: (a.traits ?? []).join(", "),
        abilities: ABILITIES.map(k => ({ value: k, label: game.i18n.localize(AZEROTH.abilities[k].replace(/\.Label$/, ".Abbr")), selected: k === (a.ability ?? "str") })),
        bonusBand: attackBonus(mods[a.ability ?? "str"], s.identity.tier), damageBand: band.damage,
        ranged: reachesPastMelee(a)
      })),
      traitOptions: this.#data.traitNames.map(n => ({ name: n, search: n.toLowerCase() })),
      spells: {
        caster: Boolean(s.spells.caster), dc: s.spells.dc, dcBand: band.spellDC,
        names: s.spells.names.map((name, index) => ({ index, name })),
        options: this.#data.spells.filter(sp => !s.spells.names.includes(sp.name)).map(sp => ({
          name: sp.name, search: sp.name.toLowerCase(),
          line: game.i18n.format("AZEROTH.Picker.Spell", { school: game.i18n.localize(AZEROTH.schools[sp.school] ?? sp.school ?? ""), tier: sp.tier })
        }))
      },
      abilities: s.creatureAbilities.map((a, index) => ({ index, name: a.name, description: a.description, prefix: "ability", list: "creatureAbilities", auto: this.#automationContext(a.automation) })),
      bossActions: {
        allowed: band.bossActions.max > 0,
        band: game.i18n.format("AZEROTH.Generator.ActionsBand", { n: band.bossActions.max, damage: band.actionDamage ?? "—" }),
        rows: s.bossActions.map((a, index) => ({ index, name: a.name, description: a.description, cost: a.cost ?? 1, prefix: "boss", list: "bossActions", auto: this.#automationContext(a.automation) }))
      },
      keywords: {
        skills: Object.entries(s.keywords.skills).map(([key, rank], index) => ({
          index, key, rank,
          options: Object.entries(AZEROTH.skills).map(([k, label]) => ({ value: k, label: game.i18n.localize(label), selected: k === key }))
        })),
        skillOptions: Object.entries(AZEROTH.skills).filter(([k]) => !(k in s.keywords.skills)).map(([k, label]) => ({ value: k, label: game.i18n.localize(label) })),
        rankMax: RANK_MAX,
        resiliences: Object.entries(AZEROTH.resiliences).map(([key, label]) => ({ key, label: game.i18n.localize(label), checked: s.keywords.resilience.includes(key) })),
        damageTypes: Object.entries(AZEROTH.damageTypes).map(([key, label]) => ({
          key, label: game.i18n.localize(label), immune: s.keywords.immune.includes(key), vulnerable: s.keywords.vulnerable.includes(key)
        })),
        conditions: Object.entries(AZEROTH.conditions).map(([key, label]) => ({ key, label: game.i18n.localize(label), checked: s.keywords.inflicts.includes(key) })),
        momentum: { names: choicesOf(AZEROTH.momentumTypes, s.keywords.momentum.name, { blank: dash }), max: s.keywords.momentum.max },
        power: { names: choicesOf(AZEROTH.powerTypes, s.keywords.power.name, { blank: dash }), max: s.keywords.power.max, band: band.power }
      },
      prose: s.prose,
      summary: {
        ok: v.ok,
        reasons: v.reasons.map(reason),
        notes: v.notes.map(noted),
        line: game.i18n.format("AZEROTH.Generator.Running", {
          weight: game.i18n.localize(AZEROTH.weightClasses[s.identity.weightClass] ?? ""), tier: s.identity.tier,
          health: system.health.max, defense: system.defense, token: tokenSize(s.identity.size)
        })
      }
    });
  }

  /**
   * An ability's automation as the row draws it (D-647): the kind, and every
   * field with its choices, each select carrying its own selection.
   */
  #automationContext(automation) {
    const a = cleanAutomation(automation);
    const dash = game.i18n.localize("AZEROTH.Generator.None");
    return {
      ...a,
      on: hasAutomation(a),
      kinds: choicesOf(AZEROTH.abilityKinds, a.kind),
      actions: choicesOf(AZEROTH.actions, a.action, { blank: dash }),
      pools: choicesOf(AZEROTH.npcPoolKinds, a.cost.pool, { blank: dash }),
      pers: choicesOf(AZEROTH.abilityUsesPer, a.uses.per, { blank: dash }),
      types: choicesOf(AZEROTH.damageTypes, a.damage.type, { blank: game.i18n.localize("AZEROTH.Generator.Automation.Untyped") }),
      resists: choicesOf(AZEROTH.resiliences, a.resist, { blank: dash }),
      conditions: choicesOf(AZEROTH.conditions, a.inflicts.condition, { blank: dash }),
      untils: choicesOf(AZEROTH.untilKinds, a.inflicts.until, { blank: game.i18n.localize("AZEROTH.Generator.Automation.UntilRemoved") }),
      traits: (a.attack.traits ?? []).join(", "),
      isAttack: a.kind === "attack", isTest: a.kind === "test", isSpell: a.kind === "spell", isHeal: a.kind === "heal"
    };
  }

  /** The automation fields of one row off the form; a field absent from the form keeps its value. */
  #readAutomation(prefix, i, current, read, num) {
    const a = cleanAutomation(current);
    const f = name => `${prefix}-auto-${name}-${i}`;
    read(f("kind"), e => { a.kind = e.value; });
    read(f("action"), e => { a.action = e.value || null; });
    read(f("pool"), e => { a.cost.pool = e.value || null; });
    read(f("amount"), e => { a.cost.amount = num(e.value); });
    read(f("casting"), e => { a.casting = e.checked; });
    read(f("dc"), e => { a.dc = num(e.value); });
    read(f("uses"), e => { const max = num(e.value); a.uses.max = max; a.uses.value = max === null ? null : Math.min(a.uses.value ?? max, max); });
    read(f("per"), e => { a.uses.per = e.value || null; });
    read(f("heal"), e => { a.heal = num(e.value); });
    read(f("damage"), e => { a.damage.amount = num(e.value); });
    read(f("type"), e => { a.damage.type = e.value || null; });
    read(f("resist"), e => { a.resist = e.value || null; });
    read(f("bonus"), e => { a.attack.bonus = num(e.value); });
    read(f("rating"), e => { a.attack.damage = num(e.value); });
    read(f("traits"), e => { a.attack.traits = e.value.split(",").map(t => t.trim()).filter(Boolean); });
    read(f("area"), e => { a.area = e.value.trim(); });
    read(f("condition"), e => { a.inflicts.condition = e.value || null; });
    read(f("value"), e => { a.inflicts.value = num(e.value); });
    read(f("until"), e => { a.inflicts.until = e.value || null; });
    read(f("spell"), e => { a.spell = e.value.trim(); });
    read(f("note"), e => { a.note = e.value.trim(); });
    return cleanAutomation(a);
  }

  /** Read the ability (D-647): the prose's one clear figure of each kind fills what is still at its default. */
  static async #onSeedAbility(event, target) {
    this.#readForm();
    const row = this.#state[target.dataset.list]?.[Number(target.dataset.index)];
    if (!row) return;
    row.automation = mergeSeed(row.automation, seedAutomation(htmlFromProse(row.description)));
    this.render();
  }

  /** Localise what a reason or note carries before it is formatted in. */
  #say(params) {
    const out = { ...params };
    if (out.ability && AZEROTH.abilities[out.ability]) out.ability = game.i18n.localize(AZEROTH.abilities[out.ability]);
    if (out.skill && AZEROTH.skills[out.skill]) out.skill = game.i18n.localize(AZEROTH.skills[out.skill]);
    if (out.condition && AZEROTH.conditions[out.condition]) out.condition = game.i18n.localize(AZEROTH.conditions[out.condition]);
    if (out.track && AZEROTH.corruptionTracks[out.track]) out.track = game.i18n.localize(AZEROTH.corruptionTracks[out.track]);
    for (const key of ["want", "have"]) if (out[key] && AZEROTH.sizes[out[key]]) out[key] = game.i18n.localize(AZEROTH.sizes[out[key]]);
    if (out.row) out.row = game.i18n.localize(out.row === "immune" ? "AZEROTH.Sheet.Immune" : "AZEROTH.Sheet.Vulnerable");
    if (out.weight && AZEROTH.weightClasses[out.weight]) out.weight = game.i18n.localize(AZEROTH.weightClasses[out.weight]);
    if (out.pool && AZEROTH.npcPoolKinds[out.pool]) out.pool = game.i18n.localize(AZEROTH.npcPoolKinds[out.pool]);
    return out;
  }

  /* -------------------------------------------- */
  /*  The form                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-generator]")) {
      el.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }
    bindPickers(this.element);
    // An attack's row takes a dropped trait (D-645). DragDrop binds `drop`
    // on every element the selector matches inside this window.
    new foundry.applications.ux.DragDrop.implementation({
      dropSelector: ".azeroth-generator-attacks li[data-index]",
      permissions: { drop: () => this.isEditable !== false },
      callbacks: { drop: this.#onDropTrait.bind(this) }
    }).bind(this.element);
  }

  /**
   * Read the form into the state. A figure `suggest` filled that the GM has
   * changed is marked touched; a change to what the creature is re-suggests
   * the rest. Fields absent from the form keep their value.
   */
  #readForm() {
    const form = this.element;
    const s = this.#state;
    if (!form || !s) return;
    const el = name => form.elements?.[name] ?? null;
    const before = foundry.utils.deepClone({ ...s, touched: undefined });
    const num = v => (v === "" || v === null || v === undefined ? null : Number(v));
    const read = (name, apply) => { const e = el(name); if (e) apply(e); };

    read("name", e => { s.name = e.value; });
    // The pickers' terms, so a render redraws each list filtered as it was.
    read("startFrom", e => { s.search = { ...(s.search ?? {}), entry: e.value }; });
    read("spellSearch", e => { s.search = { ...(s.search ?? {}), spell: e.value }; });
    read("img", e => { s.img = e.value.trim() || DEFAULT_IMG; });
    read("folder", e => { s.folder = e.value || null; });
    read("weightClass", e => { s.identity.weightClass = e.value; });
    read("tier", e => { s.identity.tier = Number(e.value) || 1; });
    read("creatureType", e => { s.identity.creatureType = e.value; });
    read("mindless", e => { s.identity.typeMarker = e.checked ? "Mindless" : null; });
    read("size", e => { s.identity.size = e.value; });
    read("race", e => {
      s.identity.race = e.value || null;
      const size = e.value ? this.#data.raceSizes.get(e.value) : null;
      if (size) s.identity.size = size;
    });
    read("corruption", e => { s.identity.corruption = e.value || null; });
    read("handlingDC", e => { s.identity.handlingDC = num(e.value); });
    read("swarm", e => {
      const on = e.checked && canSwarm(s.identity.weightClass);
      const members = num(el("swarm-members")?.value) ?? swarmsFrom(s.identity.weightClass) ?? 2;
      s.identity.swarm = { members: on ? Math.max(2, Math.trunc(members)) : null, of: el("swarm-of")?.value?.trim() || s.identity.swarm?.of || null };
    });
    read("swarmNote", e => { s.prose.swarm = e.value; });
    read("dungeon", e => { s.identity.dungeon = e.value; });
    read("health", e => { s.numbers.health = num(e.value) ?? 0; });
    read("defense", e => { s.numbers.defense = num(e.value) ?? 0; });
    read("hasHead", e => { s.numbers.hasHead = e.checked; });
    read("hasLimbs", e => { s.numbers.hasLimbs = e.checked; });
    read("ap-body", e => { s.numbers.ap.body = num(e.value) ?? 0; });
    read("ap-head", e => { if (s.numbers.hasHead !== false) s.numbers.ap.head = num(e.value) ?? 0; });
    read("ap-limb", e => { if (s.numbers.hasLimbs !== false) s.numbers.ap.limb = num(e.value) ?? 0; });
    read("armor", e => { s.numbers.armor = e.value || "typical"; });
    (s.numbers.wards ?? []).forEach((w, i) => {
      read(`ward-school-${i}`, e => { w.school = e.value || null; });
      read(`ward-value-${i}`, e => { w.value = num(e.value) ?? 0; });
    });
    read("speed", e => { s.numbers.speed = num(e.value) ?? 30; });
    read("flies", e => { s.numbers.flies = e.checked; });
    read("initiative", e => { s.numbers.initiative = num(e.value) ?? 10; });
    for (const key of ABILITIES) read(`ability-${key}`, e => { s.abilities[key] = e.disabled ? null : (num(e.value) ?? null); });
    s.attacks.forEach((a, i) => {
      read(`attack-name-${i}`, e => { a.name = e.value; });
      read(`attack-ability-${i}`, e => { a.ability = e.value; });
      read(`attack-bonus-${i}`, e => { a.bonus = num(e.value) ?? 0; });
      read(`attack-damage-${i}`, e => { a.damage = num(e.value); });
      read(`attack-traits-${i}`, e => { a.traits = e.value.split(",").map(t => t.trim()).filter(Boolean); });
      read(`attack-range-${i}`, e => { a.range = num(e.value); });
    });
    read("caster", e => { s.spells.caster = e.checked; });
    read("spell-dc", e => { s.spells.dc = num(e.value); });
    s.creatureAbilities.forEach((a, i) => {
      read(`ability-name-${i}`, e => { a.name = e.value; });
      read(`ability-text-${i}`, e => { a.description = e.value; });
      a.automation = this.#readAutomation("ability", i, a.automation, read, num);
    });
    s.bossActions.forEach((a, i) => {
      read(`boss-name-${i}`, e => { a.name = e.value; });
      read(`boss-text-${i}`, e => { a.description = e.value; });
      read(`boss-cost-${i}`, e => { a.cost = Number(e.value) === 2 ? 2 : 1; });
      a.automation = this.#readAutomation("boss", i, a.automation, read, num);
    });
    const skills = {};
    Object.keys(s.keywords.skills).forEach((key, i) => {
      const k = el(`skill-key-${i}`)?.value ?? key;
      const r = num(el(`skill-rank-${i}`)?.value) ?? s.keywords.skills[key];
      if (k) skills[k] = r ?? 1;
    });
    s.keywords.skills = skills;
    s.keywords.resilience = Object.keys(AZEROTH.resiliences).filter(k => el(`res-${k}`)?.checked ?? s.keywords.resilience.includes(k));
    const types = Object.keys(AZEROTH.damageTypes);
    if (el(`immune-${types[0]}`)) s.keywords.immune = types.filter(k => el(`immune-${k}`)?.checked);
    if (el(`vulnerable-${types[0]}`)) s.keywords.vulnerable = types.filter(k => el(`vulnerable-${k}`)?.checked);
    const conditions = Object.keys(AZEROTH.conditions);
    if (el(`inflicts-${conditions[0]}`)) s.keywords.inflicts = conditions.filter(k => el(`inflicts-${k}`)?.checked);
    read("momentum-name", e => { s.keywords.momentum.name = e.value || null; });
    read("momentum-max", e => { s.keywords.momentum.max = num(e.value); });
    read("power-name", e => { s.keywords.power.name = e.value || null; });
    read("power-max", e => { s.keywords.power.max = num(e.value); });
    for (const field of ["behavior", "lore", "tactics", "ecology"]) read(field, e => { s.prose[field] = e.value; });

    // What moved by hand is touched; what the creature is re-suggests the rest.
    for (const path of SUGGESTED) {
      if (foundry.utils.getProperty(before, path) !== foundry.utils.getProperty(s, path)) s.touched.add(path);
    }
    s.attacks.forEach((a, i) => {
      const was = before.attacks?.[i];
      if (was && was.bonus !== a.bonus) s.touched.add(`attacks.${i}.bonus`);
      if (was && was.damage !== a.damage) s.touched.add(`attacks.${i}.damage`);
    });
    const structural = STRUCTURAL.some(path => foundry.utils.getProperty(before, path) !== foundry.utils.getProperty(s, path))
      || ABILITIES.some(k => before.abilities?.[k] !== s.abilities[k]);
    this.#applySwarm(before.identity?.swarm ?? null);
    if (structural) this.#resuggest();
  }

  /**
   * The swarm's numbers from the member's (13 §4, D-646), explicitly, when the
   * swarm is turned on, resized or turned off: Health the members' total,
   * Defense two lower, both marked as the GM's. The member's own figures are
   * kept in `swarmBase` so the swarm can be undone. A weight class that never
   * swarms clears it.
   */
  #applySwarm(was = null) {
    const s = this.#state;
    if (!canSwarm(s.identity.weightClass)) s.identity.swarm = { members: null, of: s.identity.swarm?.of ?? null };
    const now = s.identity.swarm?.members ?? null;
    const before = was?.members ?? null;
    if (now === before) return;
    if (now !== null) {
      const base = s.identity.swarmBase ?? { health: s.numbers.health, defense: s.numbers.defense };
      const built = buildSwarm(base, now);
      s.identity.swarmBase = base;
      s.numbers.health = built.health.max;
      s.numbers.defense = built.defense;
      s.touched.add("numbers.health");
      s.touched.add("numbers.defense");
    } else if (s.identity.swarmBase) {
      s.numbers.health = s.identity.swarmBase.health;
      s.numbers.defense = s.identity.swarmBase.defense;
      s.identity.swarmBase = null;
    }
  }

  /* -------------------------------------------- */
  /*  Create and Apply                             */
  /* -------------------------------------------- */

  /**
   * Make the creature, or apply the rework. A partial `state` merges in first
   * (the tests drive the window this way); the form is read otherwise.
   * Refuses with the chapter's reasons and writes nothing.
   */
  async apply(state = null) {
    await this.#load();
    this.#state ??= this.#initialState();
    if (state) this.#merge(state);
    const s = this.#state;
    const system = this.#system(s);
    const v = this.#review(s);
    if (!v.ok) {
      const reasons = v.reasons.map(r => game.i18n.format(`AZEROTH.Generator.Reason.${r.code}`, this.#say(r.params ?? {})));
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.Refused", { reasons: reasons.join("; ") }));
      if (this.rendered) await this.render();
      return { ok: false, reasons: v.reasons, notes: v.notes, actor: null };
    }

    const built = { version: game.system.version, from: s.from ?? null, at: Date.now() };
    let actor = this.actor;
    if (!actor) {
      actor = await Actor.create({
        name: s.name.trim(), type: "npc", img: s.img || DEFAULT_IMG, folder: s.folder || null,
        system,
        prototypeToken: prototypeTokenFor({ name: s.name.trim(), img: s.img || DEFAULT_IMG, size: system.size }),
        flags: { "azeroth-rpg": { built } }
      });
      try { await game.settings.set("azeroth-rpg", FOLDER_SETTING, s.folder ?? ""); } catch { /* a client setting; never worth failing for */ }
    } else {
      const old = actor.system;
      const unhurt = (old.health?.value ?? 0) >= (old.health?.max ?? 0);
      const update = {
        name: s.name.trim(), img: s.img || DEFAULT_IMG, folder: s.folder || null,
        system: {
          ...system,
          health: { max: system.health.max, value: unhurt ? system.health.max : Math.min(old.health?.value ?? 0, system.health.max) },
          // A plain object merges its keys into a TypedObjectField; a dropped
          // skill or Ward would survive. Replace the maps whole.
          skills: foundry.data.operators.ForcedReplacement.create(system.skills),
          ward: foundry.data.operators.ForcedReplacement.create(system.ward)
        },
        "flags.azeroth-rpg.built": built
      };
      const squares = tokenSize(system.size);
      if (actor.prototypeToken.width === tokenSize(old.size) && actor.prototypeToken.height === tokenSize(old.size)) {
        update["prototypeToken.width"] = squares;
        update["prototypeToken.height"] = squares;
      }
      if (actor.prototypeToken.texture?.src === actor.img) update["prototypeToken.texture.src"] = s.img || DEFAULT_IMG;
      update["prototypeToken.name"] = s.name.trim();
      await actor.update(update);
    }

    ui.notifications?.info(game.i18n.format(this.actor ? "AZEROTH.Generator.Applied" : "AZEROTH.Generator.Created", { name: actor.name }));
    await this.close();
    actor.sheet?.render({ force: true });
    return { ok: true, reasons: [], notes: v.notes, actor };
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onSubmit() {
    this.#readForm();
    return this.apply();
  }

  static async #onCancel() {
    return this.close();
  }

  /** Load a pack creature into the form (13 §5: reskin before you build). Every number is then the GM's. */
  async startFrom(name) {
    await this.#load();
    const entry = this.#data.bestiary.find(e => e.name.toLowerCase() === String(name).toLowerCase())
      ?? (String(name).length > 2 ? this.#data.bestiary.find(e => e.name.toLowerCase().startsWith(String(name).toLowerCase())) : null);
    if (!entry) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.NoEntry", { name }));
      return null;
    }
    const doc = await fromUuid(entry.uuid);
    if (!doc) return null;
    const keep = this.#state ?? this.#initialState();
    const state = stateFromSystem(doc.system.toObject(), { name: doc.name, img: doc.img });
    this.#state = { ...state, mode: keep.mode, actorId: keep.actorId, folder: keep.folder, from: doc.name, touched: new Set(SUGGESTED) };
    this.#state.attacks.forEach((a, i) => { this.#state.touched.add(`attacks.${i}.bonus`); this.#state.touched.add(`attacks.${i}.damage`); });
    if (this.rendered) await this.render();
    return this.state;
  }

  /** A picker row names its entry; the typed term is the fallback for a call with no row. */
  static async #onStartFrom(event, target) {
    this.#readForm();
    const input = this.element.querySelector("input[name=startFrom]");
    return this.startFrom(target?.dataset?.name ?? (input?.value ?? "").trim());
  }

  static async #onPortrait() {
    this.#readForm();
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    return new FilePicker({ type: "image", current: this.#state.img, callback: path => { this.#state.img = path; this.render(); } }).browse();
  }

  static async #onAddAttack() {
    this.#readForm();
    const s = this.#state;
    const p = suggest(this.#spec(s));
    s.attacks.push({ name: "", ability: "str", bonus: p.attack.bonus, damage: p.attack.damage, traits: [], range: null });
    this.render();
  }

  /** A trait picked off an attack's list joins that attack's traits; the GM adds a rating by hand (D-638). */
  static async #onAddTrait(event, target) {
    return this.#addTraitName(Number(target.dataset.index), target.dataset.name);
  }

  /** Browse opens the compendium browser on Traits in pick mode; the row picked joins this attack (D-645). */
  static async #onBrowseTraits(event, target) {
    this.#readForm();
    const index = Number(target.dataset.index);
    const attack = this.#state.attacks[index];
    if (!attack) return;
    const title = game.i18n.format("AZEROTH.Generator.PickTrait", { attack: attack.name || game.i18n.localize("AZEROTH.Generator.AttackName") });
    return game.system.azeroth.browser.browse({ category: "traits", pick: { title, onPick: doc => this.#takeTrait(index, doc) } });
  }

  /**
   * A document offered to an attack, from the browser or a drop: a trait
   * that is not a mount's joins it (D-399: an attack carries no mount trait),
   * anything else is refused with the reason.
   */
  async #takeTrait(index, doc) {
    if (doc?.documentName !== "Item" || doc.type !== "trait") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.NotTrait", { name: doc?.name ?? "" }));
      return false;
    }
    if (doc.system?.kind === "mount") {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.MountTrait", { name: doc.name }));
      return false;
    }
    return this.#addTraitName(index, doc.name);
  }

  /**
   * The one door a trait name takes onto an attack: the pack's placeholder
   * comes off (`Pierce X` is `Pierce`), a duplicate is refused, and a trait
   * that wants a number, a range, a school or a type leaves the caret at the
   * end of the traits field for the GM to finish it (D-645).
   */
  async #addTraitName(index, name) {
    this.#readForm();
    const attack = this.#state.attacks[index];
    if (!attack || !name) return false;
    const base = baseTrait(name);
    if (attack.traits.some(t => baseTrait(t).toLowerCase() === base.toLowerCase())) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.DuplicateTrait", { attack: attack.name || game.i18n.localize("AZEROTH.Generator.AttackName"), trait: base }));
      return false;
    }
    attack.traits.push(base);
    await this.render();
    if (traitPlaceholder(name)) {
      const input = this.element?.querySelector(`input[name="attack-traits-${index}"]`);
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    return true;
  }

  /** A trait dragged off the browser or a sheet onto an attack's row (D-645). */
  async #onDropTrait(event) {
    const li = event.target?.closest?.("li[data-index]");
    if (!li) return;
    let data;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event); }
    catch { return; }
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    return this.#takeTrait(Number(li.dataset.index), doc);
  }

  static async #onRemoveAttack(event, target) {
    this.#readForm();
    this.#state.attacks.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** A picker row names its spell; the typed term is the fallback for a call with no row. */
  static async #onAddSpell(event, target) {
    this.#readForm();
    const input = this.element.querySelector("input[name=spellSearch]");
    const wanted = (input?.value ?? "").trim().toLowerCase();
    const picked = target?.dataset?.name;
    const name = (picked && this.#data.spellNames.includes(picked) ? picked : null)
      ?? this.#data.spellNames.find(n => n.toLowerCase() === wanted)
      ?? (wanted.length > 2 ? this.#data.spellNames.find(n => n.toLowerCase().startsWith(wanted)) : null);
    if (!name) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Generator.NoSpell", { name: input?.value ?? "" }));
      return;
    }
    if (!this.#state.spells.names.includes(name)) this.#state.spells.names.push(name);
    this.#state.spells.caster = true;
    this.render();
  }

  static async #onRemoveSpell(event, target) {
    this.#readForm();
    this.#state.spells.names.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onAddAbility() {
    this.#readForm();
    this.#state.creatureAbilities.push({ name: "", description: "", automation: emptyAutomation() });
    this.render();
  }

  static async #onRemoveAbility(event, target) {
    this.#readForm();
    this.#state.creatureAbilities.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onAddBossAction() {
    this.#readForm();
    this.#state.bossActions.push({ name: "", description: "", cost: 1, automation: emptyAutomation() });
    this.render();
  }

  static async #onRemoveBossAction(event, target) {
    this.#readForm();
    this.#state.bossActions.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onAddSkill() {
    this.#readForm();
    const select = this.element.querySelector("select[name=skillAdd]");
    const key = select?.value;
    if (!key || !(key in AZEROTH.skills)) return;
    this.#state.keywords.skills[key] = this.#state.keywords.skills[key] ?? 1;
    this.render();
  }

  static async #onRemoveSkill(event, target) {
    this.#readForm();
    delete this.#state.keywords.skills[target.dataset.skill];
    this.render();
  }

  /** A Ward in the first school the block does not hold, at the band (D-644). */
  static async #onAddWard() {
    this.#readForm();
    const s = this.#state;
    const held = new Set((s.numbers.wards ?? []).map(w => w.school));
    const school = Object.keys(AZEROTH.schools).find(k => !held.has(k));
    if (!school) return;
    s.numbers.wards = [...(s.numbers.wards ?? []), { school, value: bandFor(s.identity).ward }];
    this.render();
  }

  static async #onRemoveWard(event, target) {
    this.#readForm();
    this.#state.numbers.wards.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** Tick every condition the block's own text names (D-523: a mechanic lives on the block). */
  static async #onSuggestInflicts() {
    this.#readForm();
    const s = this.#state;
    const text = [...s.creatureAbilities, ...s.bossActions].map(a => a.description).join(" ")
      + " " + s.attacks.flatMap(a => a.traits).join(" ") + " " + s.prose.behavior;
    const found = injuryConditions(text).conditions.map(c => c.id);
    s.keywords.inflicts = [...new Set([...s.keywords.inflicts, ...found])];
    this.render();
  }

  /** Forget what was typed over the band and take the table's figures again. */
  static async #onResuggest() {
    this.#readForm();
    this.#state.touched = new Set();
    this.#resuggest();
    this.render();
  }

  /** Rework: back to what the creature holds now. */
  static async #onReload() {
    this.#state = null;
    this.render();
  }
}

/** The bands, for a macro or a test that wants the table without the window. */
export { BOSS, TYPES, WEIGHTS, bandFor, baseTrait };
