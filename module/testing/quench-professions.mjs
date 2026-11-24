/**
 * Professions replace careers (0.17.0; D-1903 to D-1996): the live batch.
 *
 * Every test here presses the control a player presses wherever there is one
 * (CLAUDE.md §15: a test that calls a handler by hand says nothing about the
 * control). The doors are called straight only where the test is about the door
 * itself (a double press, a refusal's "nothing spent"), and each says so.
 *
 * What it holds:
 * - the creator's Profession step (the seven in 03's order, the explanation) and
 *   Finish embedding the profession and its tool in ONE batch;
 * - the Profession tab: groups closed, nothing above the tier, the cheap rate,
 *   the tier's picks, a Rank raised once on a double press;
 * - crafting: Arrows end to end through the roll dialog with a Boon, the stored
 *   project, an Uncommon through the Forge rows, a Rare's Signature list, a
 *   draught from its Classic reagents, the refusals with nothing spent, a
 *   collapse, a double press delivering one item, a full bag holding the
 *   project ready;
 * - Well Fed: a cooked food, a Short Rest, the SL cap, a Casting Test, a Feast;
 * - gathering by biome, a heavy ore stopping at the room that fits, Skin from
 *   the Harvest card and the banner, Disenchant, Lay an enchantment's list;
 * - a trait chip's tooltip and Escape; no career word on the sheet or creator;
 * - migration 0.17.0 of a career-holding actor, twice.
 */

import { cleanup, made, makeCharacter, makeNpc, give, openSheet, settle, pinDie, dialogFor, fromPack, PACK_FOR, untilHook, tokenData, tokenDrawn, KNOWN } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING, CRAFTING_DOWNTIME_SETTING, DOWNTIME_OPEN_SETTING } from "../settings.mjs";
import { recipesFor } from "../rules/recipes.mjs";
import { PROFESSIONS } from "../rules/professions.mjs";
import { professionRankCost } from "../rules/xp.mjs";
import { plan as forgePlan } from "../rules/forge.mjs";
import { TARGET_SL } from "../rules/crafting.mjs";
import { isWellFed } from "../rules/well-fed.mjs";
import { SL_CAP } from "../rules/resolution.mjs";
import { AzerothRoll } from "../dice/azeroth-roll.mjs";
import { CRAFT_PROJECT_FLAG, CRAFTED_FLAG, HARVESTED_FLAG, professionAffixPool } from "../dice/profession-workflows.mjs";

const click = (el, { shift = false } = {}) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: shift }));
const change = (el, value) => {
  if (value !== undefined) {
    if (el.type === "checkbox" || el.type === "radio") el.checked = Boolean(value);
    else el.value = value;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const until = async (fn, what, ms = 8000) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 40));
  }
};
const W = () => game.system.azeroth.workflows;
const tab = sheet => sheet.element?.querySelector('section[data-tab="profession"]') ?? null;
const PACKS = ["azeroth-rpg.weapons", "azeroth-rpg.armor", "azeroth-rpg.gear"];

/** Every chapter document of the three equipment packs (the recipe source the sheet reads). */
async function recipeDocs() {
  const out = [];
  for (const id of PACKS) out.push(...await game.packs.get(id).getDocuments());
  return out;
}

/** A pack document as craft takes it: plain data with its uuid. */
async function baseOf(name, packId) {
  const doc = await fromPack(packId, name);
  return { doc, base: { ...doc.toObject(), uuid: doc.uuid } };
}

/** Put `count` units of a material into the actor's bags, by identifier. */
async function stock(actor, identifier, count) {
  const materials = await W().professionMaterials();
  const entry = materials[identifier];
  if (!entry?.uuid) throw new Error(`no material ${identifier}`);
  const doc = await fromUuid(entry.uuid);
  const data = doc.toObject();
  delete data._id;
  data.system.quantity = count;
  const [item] = await actor.createEmbeddedDocuments("Item", [data], { ...KNOWN });
  if (!item) throw new Error(`no room for ${count} ${identifier}`);
  return item;
}

/** Stock every reagent a snapshot lists, at what it needs. */
async function stockFor(actor, snap) {
  for (const line of snap.reagents) if (line.need > 0) await stock(actor, line.identifier, line.need);
}

/** Total units of a material the actor holds. */
// A stack at 0 counts 0: the start of a project lowers a used-up stack to 0 in its one spend write and
// deletes it afterwards as cleanup (`profession-door.mjs#spendWrites`), so `|| 1` read it as one held.
const held = (actor, identifier) => actor.items.filter(i => i.system?.identifier === identifier).reduce((n, i) => n + Number(i.system.quantity ?? 1), 0);

/** Fill the bags with one heavy thing until a create is refused; answers the items made. */
async function fillBags(actor, name = "Tin ore") {
  const filler = await fromPack(PACK_FOR.equipment, name);
  const made = [];
  for (let i = 0; i < 60; i++) {
    const data = filler.toObject();
    delete data._id;
    const [item] = await actor.createEmbeddedDocuments("Item", [data], { ...KNOWN });
    if (!item) break;
    made.push(item);
  }
  return made;
}

/** Answer the actor's roll dialog: the Boons given, then Roll. Resolves the card's message. */
async function rollThroughDialog(actor, { boons = 0 } = {}) {
  const dialog = await dialogFor(actor, 8000);
  if (!dialog) throw new Error("the roll dialog did not open");
  const form = dialog.element.querySelector("form");
  if (boons) {
    form.elements.extraBoons.value = String(boons);
    form.elements.extraBoons.dispatchEvent(new Event("input", { bubbles: true }));
    form.elements.extraBoons.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }
  const wait = untilHook("createChatMessage", 15000, m => m.speaker?.actor === actor.id && m.rolls?.length);
  dialog.element.querySelector('button[data-action="roll"]').click();
  const [message] = await wait;
  return { dialog, message };
}

/** The sheet's recipe row for a recipe, by name. */
function rowNamed(sheet, name) {
  return [...(tab(sheet)?.querySelectorAll(".azeroth-prof-row[data-recipe-id]") ?? [])]
    .find(r => r.querySelector(".azeroth-prof-row-name")?.textContent.trim() === name) ?? null;
}

/** The recipe card for a uuid. */
const cardOf = (sheet, uuid) => tab(sheet)?.querySelector(`.azeroth-prof-detail[data-recipe-card="${CSS.escape(uuid)}"]`) ?? null;

/** Pick a recipe row through its control, and wait for the picked card's whole judgement to land. */
async function pickRecipe(sheet, name, uuid) {
  const row = rowNamed(sheet, name);
  if (!row) throw new Error(`no recipe row for ${name}`);
  click(row);
  await until(() => cardOf(sheet, uuid) && !cardOf(sheet, uuid).hidden, `${name}'s card shown`);
  await new Promise(r => setTimeout(r, 400));
  return cardOf(sheet, uuid);
}

export function professionsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Professions replace careers (0.17.0)", function () {
    let dialogSetting, enforce, open;
    before(function () {
      dialogSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      enforce = game.settings.get("azeroth-rpg", CRAFTING_DOWNTIME_SETTING);
      open = game.settings.get("azeroth-rpg", DOWNTIME_OPEN_SETTING);
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, dialogSetting);
      await game.settings.set("azeroth-rpg", CRAFTING_DOWNTIME_SETTING, enforce);
      await game.settings.set("azeroth-rpg", DOWNTIME_OPEN_SETTING, open);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-creator")) await app.close().catch(() => {});
      }
      canvas?.tokens?.setTargets?.([]);
      await cleanup();
    });

    const skip = () => game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    const always = () => game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");

    /* ---- the creator --------------------------------------------------- */

    it("the creator's Profession step explains a profession and lists the seven in 03's order", async function () {
      this.timeout(60000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        await creator.setState({
          race: (await fromPack(PACK_FOR.race, "Human")).uuid,
          cls: (await fromPack(PACK_FOR.class, "Warrior")).uuid,
          step: "profession"
        });
        await settle();
        const explain = creator.element.querySelector(".azeroth-creator-explain");
        assert.ok(explain, "the Profession step carries no explanation");
        assert.isAtLeast(explain.querySelectorAll("p").length, 4, "the explanation is not the four lines D-1930 asks for");
        assert.match(explain.textContent, /Rank 1/i, "the explanation does not say the profession starts at Rank 1");
        const names = [...creator.element.querySelectorAll(".azeroth-creator-professions > li .azeroth-creator-expand")].map(b => b.textContent.trim());
        const pack = await game.packs.get(PACK_FOR.profession).getDocuments();
        const order = PROFESSIONS.map(p => pack.find(d => d.system.identifier === p.id)?.name);
        assert.deepEqual(names, order, "the seven are not in 03's order");
        assert.lengthOf(names, 7);
        assert.notMatch(creator.element.textContent, /career/i, "the creator still speaks of careers");

        // Inspect, then choose, through the controls.
        const smith = pack.find(d => d.system.identifier === "blacksmithing");
        click(creator.element.querySelector(`[data-action="creatorInspectProfession"][data-uuid="${smith.uuid}"]`));
        await until(() => creator.element.querySelector(`[data-action="creatorChooseProfession"][data-uuid="${smith.uuid}"]`), "the inspector's Choose for Blacksmithing");
        click(creator.element.querySelector(`[data-action="creatorChooseProfession"][data-uuid="${smith.uuid}"]`));
        await until(() => creator.state?.profession === smith.uuid, "the profession chosen");
        await settle();
        assert.ok(creator.element.querySelector(".azeroth-creator-professions > li.is-selected"), "the chosen row carries no state");
        assert.include(creator.element.querySelector(".azeroth-creator-inspector")?.textContent ?? "", "Smith's tools", "the inspector does not name the tool in the kit");
      } finally {
        await creator.close();
      }
    });

    it("Finish embeds the profession and its tool in ONE batch, and the tool is carried", async function () {
      this.timeout(120000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
      const survival = (await game.packs.get(PACK_FOR.profession).getDocuments()).find(d => d.system.identifier === "wilderness-survival");
      const ops = [];
      const hook = Hooks.on("createItem", (item, options) => { if (item.parent?.name === "ZZ Kaelen Professed") ops.push({ type: item.type, name: item.name, options }); });
      try {
        await creator.setState({
          race: await uuidOf(PACK_FOR.race, "Human"),
          cls: await uuidOf(PACK_FOR.class, "Warrior"),
          method: "array",
          abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
          ranks: { survival: 3, medicine: 2 },
          adaptable: "athletics",
          racialTalent: "Refugee's Road",
          classTalent: "wide-swing",
          step: "profession"
        });
        await settle();
        click(creator.element.querySelector(`[data-action="creatorInspectProfession"][data-uuid="${survival.uuid}"]`));
        await until(() => creator.element.querySelector(`[data-action="creatorChooseProfession"][data-uuid="${survival.uuid}"]`), "Choose for Wilderness Survival");
        click(creator.element.querySelector(`[data-action="creatorChooseProfession"][data-uuid="${survival.uuid}"]`));
        await until(() => creator.state?.profession === survival.uuid, "Wilderness Survival chosen");
        creator.loadKit();
        const kit = creator.state.equipment;
        const tool = await fromPack(PACK_FOR.equipment, "Survivalist's kit");
        assert.ok(kit.some(r => r.uuid === tool.uuid), "the suggested kit does not carry the Survivalist's kit");
        const result = await creator.apply({ name: "ZZ Kaelen Professed", motive: "x", img: "icons/svg/mystery-man.svg" });
        assert.isTrue(result.ok, JSON.stringify(result.reasons));
        made.push(result.actor);
        const actor = result.actor;
        assert.equal(actor.professionItem?.name, survival.name, "the profession is not THE profession");
        assert.equal(actor.professionItem.system.rank, 1, "a new character's profession is not Rank 1");
        const prof = ops.find(o => o.type === "profession");
        const kitTool = ops.find(o => o.name === "Survivalist's kit");
        assert.ok(prof && kitTool, "the profession or its tool was not embedded");
        assert.strictEqual(prof.options, kitTool.options, "the profession and the tool arrived in two batches");
        assert.ok(actor.professionTool(), "the tool is not carried (professionTool)");
        assert.isUndefined(actor.getFlag("azeroth-rpg", "professionOwed"), "a made character is asked to choose a profession");
      } finally {
        Hooks.off("createItem", hook);
        await creator.close();
      }
    });

    /* ---- the tab --------------------------------------------------------- */

    it("the Profession tab opens with every group closed and draws nothing above the tier", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Tab Smith", classes: [["Warrior", 6]], profession: "Blacksmithing" });
      const sheet = await openSheet(actor);
      try {
        await game.user.unsetFlag("azeroth-rpg", "professionOpen");
        const section = await sheet.showProfession({ view: "crafting" });
        assert.ok(section && !section.hasAttribute("data-deferred"), "the Profession part did not draw");
        const groups = [...section.querySelectorAll("details[data-recipe-group]")];
        assert.isAbove(groups.length, 0, "no recipe groups drawn");
        assert.isTrue(groups.every(g => !g.open), "a recipe group starts open (D-1927)");
        const want = recipesFor("blacksmithing", await recipeDocs(), actor.professionTier);
        const wantCount = want.reduce((n, g) => n + g.recipes.length, 0);
        assert.lengthOf(groups, want.length, "the groups drawn are not recipesFor's");
        assert.lengthOf(section.querySelectorAll(".azeroth-prof-row[data-recipe-id]"), wantCount, "the rows drawn are not recipesFor's");
        assert.isFalse(want.some(g => g.recipes.some(r => r.craft.tier > actor.professionTier)), "recipesFor returned a recipe above the tier");
        const tierOptions = [...section.querySelectorAll('select[data-prof-filter="tier"] option')].map(o => o.value).filter(v => v !== "all").map(Number);
        assert.isTrue(tierOptions.every(t => t <= actor.professionTier), "the tier filter offers a tier above the character's");
        // Open all, then Close all, through their controls.
        click(section.querySelector('[data-action="openAllRecipes"]'));
        await until(() => [...tab(sheet).querySelectorAll("details[data-recipe-group]")].every(g => g.open), "Open all");
        click(tab(sheet).querySelector('[data-action="closeAllRecipes"]'));
        await until(() => [...tab(sheet).querySelectorAll("details[data-recipe-group]")].every(g => !g.open), "Close all");
      } finally {
        await sheet.close();
        await game.user.unsetFlag("azeroth-rpg", "professionOpen");
      }
    });

    it("a profession skill is bought at the cheap rate and any other at double", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Cheap", classes: [["Warrior", 1]], profession: "Blacksmithing", xp: { earned: 200, spent: 0 } });
      const sheet = await openSheet(actor);
      try {
        const buy = skill => sheet.element.querySelector(`[data-action="buyRank"][data-skill="${skill}"]`);
        click(buy("athletics"));
        await until(() => actor.system.xp.spent === 10, "Athletics bought");
        assert.equal(actor.system.xp.spent, 10, "a Blacksmithing skill's first Rank is not 10");
        click(buy("stealth"));
        await until(() => actor.system.xp.spent === 30, "Stealth bought");
        assert.equal(actor.system.xp.spent, 30, "a skill outside the profession is not double");
      } finally {
        await sheet.close();
      }
    });

    it("a level 5 character owes two picks, and Confirm writes them", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Picks", classes: [["Warrior", 5]], profession: "Blacksmithing" });
      const sheet = await openSheet(actor);
      try {
        let section = await sheet.showProfession({ view: "overview" });
        const strip = section.querySelector('.azeroth-prof-strip[data-pick-tier="2"]');
        assert.ok(strip, "no tier 2 picks strip at level 5");
        const chips = [...strip.querySelectorAll('[data-action="pickProfessionSkill"]')];
        assert.lengthOf(chips, 4, "the strip does not list the tier's four");
        const confirm = () => tab(sheet).querySelector('[data-action="confirmProfessionPicks"][data-pick-tier="2"]');
        assert.isTrue(confirm().disabled, "Confirm is live before two are chosen");
        const skills = chips.slice(0, 2).map(c => c.dataset.skill);
        for (const skill of skills) {
          click(tab(sheet).querySelector(`[data-action="pickProfessionSkill"][data-skill="${skill}"]`));
          await until(() => tab(sheet).querySelector(`[data-action="pickProfessionSkill"][data-skill="${skill}"]`)?.getAttribute("aria-pressed") === "true", `${skill} drafted`);
        }
        await until(() => confirm() && !confirm().disabled, "Confirm live");
        click(confirm());
        await until(() => (actor.professionItem.system.picks?.["2"] ?? actor.professionItem.system.picks?.[2] ?? []).length === 2, "the picks written");
        assert.sameMembers([...(actor.professionItem.system.picks?.["2"] ?? actor.professionItem.system.picks[2])], skills);
        await until(() => !tab(sheet)?.querySelector('.azeroth-prof-strip[data-pick-tier="2"]'), "the strip gone");
        assert.isTrue(actor.professionSkills().has(skills[0]), "a picked skill is not a profession skill");
      } finally {
        await sheet.close();
      }
    });

    it("raising the Rank spends the XP exactly once on a double press", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Rank", classes: [["Warrior", 1]], profession: "Blacksmithing", xp: { earned: 100, spent: 0 } });
      const sheet = await openSheet(actor);
      try {
        const section = await sheet.showProfession({ view: "overview" });
        const button = section.querySelector('[data-action="raiseProfessionRank"]');
        assert.ok(button && !button.disabled, "no live Raise button");
        click(button);
        click(button);
        const cost = professionRankCost(2);
        await until(() => actor.professionItem.system.rank === 2 && actor.system.xp.spent === cost, "Rank 2 bought");
        await new Promise(r => setTimeout(r, 1500));
        assert.equal(actor.professionItem.system.rank, 2, "a double press bought two Ranks");
        assert.equal(actor.system.xp.spent, cost, "a double press charged twice");
        assert.lengthOf((actor.getFlag("azeroth-rpg", "xpLedger") ?? []).filter(r => r.kind === "profession"), 1, "two ledger rows for one Rank");
      } finally {
        await sheet.close();
      }
    });

    /* ---- crafting -------------------------------------------------------- */

    it("crafts Hunting arrows end to end: a stored project of target 2, the roll dialog with a Boon, into the bags", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Prof Arrows", classes: [["Warrior", 1]], profession: "Blacksmithing", bags: ["Backpack"] });
      await give(actor, "Smith's tools");
      const { base } = await baseOf("Hunting arrows", PACK_FOR.weapon);
      const snap = await W().craftSnapshot(actor, { base });
      assert.equal(snap.plan.target, TARGET_SL.common, "a Common craft's target is not 2");
      await stockFor(actor, snap);
      await skip();
      const sheet = await openSheet(actor);
      let unpin = () => {};
      try {
        await sheet.showProfession({ view: "crafting" });
        click(tab(sheet).querySelector('[data-action="openAllRecipes"]'));
        const card = await pickRecipe(sheet, "Hunting arrows", base.uuid);
        const start = card.querySelector('[data-action="craftRecipe"]');
        assert.ok(start && !start.disabled, `Start is greyed: ${[...card.querySelectorAll(".azeroth-prof-refusal")].map(e => e.textContent).join("; ")}`);
        click(start);
        await until(() => (actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? []).some(p => p.status === "stored"), "the project stored");
        const project = actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG).find(p => p.status === "stored");
        assert.equal(project.target, 2, "the stored project's target is not 2");
        for (const line of snap.reagents) assert.equal(held(actor, line.identifier), 0, `${line.identifier} was not spent at Start`);

        await always();
        await until(() => tab(sheet)?.querySelector(`[data-action="workProject"][data-project-id="${project.id}"]`), "Roll a test drawn");
        unpin = pinDie(20);
        click(tab(sheet).querySelector(`[data-action="workProject"][data-project-id="${project.id}"]`));
        const { message } = await rollThroughDialog(actor, { boons: 1 });
        const roll = message.rolls[0];
        assert.include(roll.formula, "2d20kh", "a Boon did not roll two dice");
        assert.lengthOf(roll.dice[0].results, 2, "two dice were not rolled");
        await until(() => actor.items.some(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id), "the arrows made");
        const arrows = actor.items.find(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id);
        assert.equal(arrows.name, "Hunting arrows");
        assert.notEqual(arrows.system.equipped, true, "the made arrows are worn");
        assert.lengthOf(actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? [], 0, "the finished project was not dropped");
      } finally {
        unpin();
        await sheet.close();
        await skip();
      }
    });

    it("an Uncommon craft through the Forge rows matches forge.plan's price and arrives identified", async function () {
      this.timeout(150000);
      const actor = await makeCharacter({ name: "ZZ Prof Uncommon", classes: [["Warrior", 5]], profession: "Blacksmithing", bags: ["Backpack"], abilities: { str: 16 } });
      await give(actor, "Smith's tools");
      const { base } = await baseOf("Dagger", PACK_FOR.weapon);
      await skip();
      const sheet = await openSheet(actor);
      let unpin = () => {};
      try {
        await sheet.showProfession({ view: "crafting" });
        click(tab(sheet).querySelector('[data-action="openAllRecipes"]'));
        let card = await pickRecipe(sheet, "Dagger", base.uuid);
        const rarity = card.querySelector('select[data-prof-quality="rarity"]');
        assert.ok(rarity, "no Rarity row on a weapon recipe");
        assert.isNull(card.querySelector('select[data-prof-quality="prefix"]'), "a Prefix row at Common (D-1929)");
        assert.notInclude([...rarity.options].map(o => o.value), "rare", "a tier 2 smith is offered Rare");
        change(rarity, "uncommon");
        await until(() => cardOf(sheet, base.uuid)?.querySelector('select[data-prof-quality="prefix"]'), "the Prefix row");
        await new Promise(r => setTimeout(r, 400));
        card = cardOf(sheet, base.uuid);
        const prefix = card.querySelector('select[data-prof-quality="prefix"]');
        const pick = [...prefix.options].find(o => o.value);
        assert.ok(pick, "no prefix offered at Uncommon");
        assert.isNull(card.querySelector('select[data-prof-quality="signature"]'), "a Signature row at Uncommon (D-1929)");
        change(prefix, pick.value);
        await until(() => cardOf(sheet, base.uuid)?.querySelector('select[data-prof-quality="prefix"]')?.value === pick.value, "the prefix picked");
        await new Promise(r => setTimeout(r, 400));
        const affixShape = (await professionAffixPool()).find(a => a.id === pick.value) ?? null;
        assert.ok(affixShape, "the picked prefix is not in the door's pool");
        const snap = await W().craftSnapshot(actor, { base, rarity: "uncommon", affixes: [affixShape] });
        const forge = forgePlan({ base, rarity: "uncommon", prefixes: [affixShape], suffix: null });
        assert.equal(snap.price, forge.price, "the craft's price is not forge.plan's");
        assert.equal(snap.plan.target, TARGET_SL.uncommon);
        await stockFor(actor, snap);
        await new Promise(r => setTimeout(r, 600));
        await until(() => !cardOf(sheet, base.uuid)?.querySelector('[data-action="craftRecipe"]')?.disabled, "Start live", 10000).catch(async () => {
          // A stock write re-renders the tab; pick the card again so its judgement is fresh.
          await pickRecipe(sheet, "Dagger", base.uuid);
        });
        const start = cardOf(sheet, base.uuid).querySelector('[data-action="craftRecipe"]');
        assert.isFalse(start.disabled, `Start greyed: ${[...cardOf(sheet, base.uuid).querySelectorAll(".azeroth-prof-refusal")].map(e => e.textContent).join("; ")}`);
        click(start);
        await until(() => (actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? []).some(p => p.status === "stored" && p.rarity === "uncommon"), "the Uncommon project stored");
        const project = actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG).find(p => p.rarity === "uncommon");
        unpin = pinDie(20);
        for (let i = 0; i < 6 && projectStill(actor, project.id); i++) {
          await W().workProject(actor, { projectId: project.id });
        }
        const made = actor.items.find(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id);
        assert.ok(made, "the Uncommon item was not made");
        assert.equal(made.system.rarity, "uncommon");
        assert.notOk(made.getFlag("azeroth-rpg", "unidentified"), "a crafted item arrived unidentified to its maker");
        assert.equal(made.system.cost, forge.price, "the made item's price is not forge.plan's");
      } finally {
        unpin();
        await sheet.close();
      }
    });

    it("a Rare craft's Signature is chosen from a list with no Legendary row and no text box", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Rare", classes: [["Warrior", 11]], profession: "Blacksmithing", bags: ["Backpack"] });
      await give(actor, "Smith's tools");
      const { base } = await baseOf("Longsword", PACK_FOR.weapon);
      const sheet = await openSheet(actor);
      try {
        await sheet.showProfession({ view: "crafting" });
        click(tab(sheet).querySelector('[data-action="openAllRecipes"]'));
        const card = await pickRecipe(sheet, "Longsword", base.uuid);
        change(card.querySelector('select[data-prof-quality="rarity"]'), "rare");
        await until(() => cardOf(sheet, base.uuid)?.querySelector('select[data-prof-quality="signature"]'), "the Signature row at Rare");
        await new Promise(r => setTimeout(r, 400));
        const fresh = cardOf(sheet, base.uuid);
        assert.isNull(fresh.querySelector("textarea"), "a crafted Signature can be typed (D-1990)");
        const options = [...fresh.querySelectorAll('select[data-prof-quality="signature"] option')].filter(o => o.value);
        const snap = await W().craftSnapshot(actor, { base, rarity: "rare" });
        assert.equal(options.length, snap.signatures.length, "the select does not list the door's rows");
        const legendary = new Set();
        for (const id of PACKS) for (const e of await game.packs.get(id).getIndex({ fields: ["system.rarity"] })) if (e.system?.rarity === "legendary") legendary.add(e.name);
        assert.isFalse(snap.signatures.some(s => legendary.has(s.from)), "a Legendary item's Signature is on the list (D-1990)");
        if (options.length) {
          change(fresh.querySelector('select[data-prof-quality="signature"]'), options[0].value);
          await until(() => cardOf(sheet, base.uuid)?.querySelector(".azeroth-prof-signature"), "the picked Signature printed whole");
          // Rare with a Signature: the Forge's verdict is printed beside Start.
          assert.ok(cardOf(sheet, base.uuid).querySelector(".azeroth-prof-ok, .azeroth-prof-refusal"), "no Forge verdict beside Start");
        }
      } finally {
        await sheet.close();
      }
    });

    it("a Minor healing draught from its Classic reagents, drunk, restores Health", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Prof Alchemist", classes: [["Mage", 1]], profession: "Alchemy", bags: ["Backpack"] });
      await give(actor, "Alchemist's kit");
      const { base } = await baseOf("Minor healing draught", PACK_FOR.equipment);
      const snap = await W().craftSnapshot(actor, { base });
      const ids = snap.reagents.map(l => l.identifier);
      assert.includeMembers(ids, ["peacebloom", "silverleaf"], "the draught's Classic reagents are not Peacebloom and Silverleaf (D-1921)");
      await stockFor(actor, snap);
      await skip();
      const unpin = pinDie(20);
      try {
        const project = await W().craft(actor, { baseUuid: base.uuid });
        assert.ok(project, "the craft was refused");
        for (let i = 0; i < 4 && projectStill(actor, project.id); i++) await W().workProject(actor, { projectId: project.id });
        const draught = actor.items.find(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id);
        assert.ok(draught, "the draught was not made");
        await actor.update({ "system.health.value": 1 });
        await W().useGear({ actor, item: draught });
        await until(() => actor.system.health.value > 1, "Health restored");
      } finally {
        unpin();
      }
    });

    it("refuses with no tool, short materials and downtime closed, with nothing spent and in words; enforcement off passes", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Prof Refusals", classes: [["Warrior", 1]], profession: "Blacksmithing", bags: ["Backpack"] });
      const { base } = await baseOf("Hunting arrows", PACK_FOR.weapon);
      const first = await W().craftSnapshot(actor, { base });
      const sheet = await openSheet(actor);
      try {
        // No tool, no materials: the card says both and Start is greyed.
        await sheet.showProfession({ view: "crafting" });
        click(tab(sheet).querySelector('[data-action="openAllRecipes"]'));
        let card = await pickRecipe(sheet, "Hunting arrows", base.uuid);
        const words = [...card.querySelectorAll(".azeroth-prof-refusal")].map(e => e.textContent).join(" | ");
        assert.isTrue(card.querySelector('[data-action="craftRecipe"]').disabled, "Start is live with no tool");
        assert.match(words, /Smith/i, `the tool refusal is not in words: ${words}`);
        if (first.reagents.length) assert.isTrue([...card.querySelectorAll(".azeroth-prof-reagents li.is-short")].length > 0, "a short reagent is not marked short");
        assert.isNull(await W().craft(actor, { baseUuid: base.uuid }), "the door crafted with no tool");
        assert.lengthOf(actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? [], 0, "a refused craft stored a project");

        // Tool carried, materials short by one: every line stocked but the last, which is one short.
        await give(actor, "Smith's tools");
        const snap = await W().craftSnapshot(actor, { base });
        assert.isAbove(snap.reagents.length, 0, "Hunting arrows list no reagents");
        const last = snap.reagents.at(-1);
        for (const l of snap.reagents.slice(0, -1)) await stock(actor, l.identifier, l.need);
        if (last.need > 1) await stock(actor, last.identifier, last.need - 1);
        const short = await W().craftSnapshot(actor, { base });
        assert.isFalse(short.ok, "a craft one reagent short passes");
        assert.isTrue(short.refusals.some(r => r.reason === "short"), "short materials are not refused as short");
        assert.isTrue(short.words.some(w => w.includes(short.reagents.at(-1).name)), `the short reagent is not named in words: ${short.words.join(" | ")}`);
        const before = snap.reagents.map(l => held(actor, l.identifier));
        assert.isNull(await W().craft(actor, { baseUuid: base.uuid }), "the door crafted short");
        assert.deepEqual(snap.reagents.map(l => held(actor, l.identifier)), before, "a refused craft spent materials");
        assert.lengthOf(actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? [], 0, "a refused craft stored a project");
        await stock(actor, last.identifier, 1);

        // Downtime enforced and closed: refused in words, nothing spent.
        await game.settings.set("azeroth-rpg", CRAFTING_DOWNTIME_SETTING, true);
        await game.settings.set("azeroth-rpg", DOWNTIME_OPEN_SETTING, false);
        const closed = await W().craftSnapshot(actor, { base });
        assert.isFalse(closed.ok, "a craft passes with downtime closed and enforced");
        assert.isTrue(closed.words.some(w => /downtime/i.test(w)), `the downtime refusal is not in words: ${closed.words.join(" | ")}`);
        const counts = snap.reagents.map(l => held(actor, l.identifier));
        assert.isNull(await W().craft(actor, { baseUuid: base.uuid }), "the door crafted with downtime closed");
        assert.deepEqual(snap.reagents.map(l => held(actor, l.identifier)), counts, "a refused craft spent materials");
        await sheet.render({ parts: ["profession"] });
        card = await pickRecipe(sheet, "Hunting arrows", base.uuid);
        assert.match(card.textContent, /downtime/i, "the card does not say downtime is closed");

        // The same craft passes with enforcement off.
        await game.settings.set("azeroth-rpg", CRAFTING_DOWNTIME_SETTING, false);
        const opened = await W().craftSnapshot(actor, { base });
        assert.isTrue(opened.ok, `the craft is refused with enforcement off: ${opened.words.join(" | ")}`);
        assert.ok(await W().craft(actor, { baseUuid: base.uuid }), "the craft did not start with enforcement off");
      } finally {
        await game.settings.set("azeroth-rpg", CRAFTING_DOWNTIME_SETTING, enforce);
        await game.settings.set("azeroth-rpg", DOWNTIME_OPEN_SETTING, open);
        await sheet.close();
      }
    });

    it("a forced collapse at -3 loses the materials", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Collapse", classes: [["Warrior", 1]], profession: "Blacksmithing", bags: ["Backpack"], abilities: { str: 3 } });
      await give(actor, "Smith's tools");
      const { base } = await baseOf("Hunting arrows", PACK_FOR.weapon);
      await stockFor(actor, await W().craftSnapshot(actor, { base }));
      await skip();
      const project = await W().craft(actor, { baseUuid: base.uuid });
      assert.ok(project, "the craft was refused");
      const unpin = pinDie(1);
      try {
        let last = null;
        for (let i = 0; i < 4 && projectStill(actor, project.id); i++) last = await W().workProject(actor, { projectId: project.id });
        assert.equal(last?.outcome, "collapsed", "the project did not collapse");
        assert.isFalse(projectStill(actor, project.id), "a collapsed project is still stored");
        assert.isFalse(actor.items.some(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id), "a collapsed project made its item");
        const message = game.messages.contents.at(-1);
        assert.match(message?.content ?? "", /collaps/i, "the card does not say it collapsed");
      } finally {
        unpin();
      }
    });

    it("a double press of Roll a test on the last test delivers ONE item, and a full bag holds the project ready for Collect", async function () {
      this.timeout(150000);
      const actor = await makeCharacter({ name: "ZZ Prof Double", classes: [["Warrior", 1]], profession: "Blacksmithing", bags: ["Backpack"] });
      await give(actor, "Smith's tools");
      const { base } = await baseOf("Hunting arrows", PACK_FOR.weapon);
      await skip();
      const sheet = await openSheet(actor);
      const unpin = pinDie(20);
      try {
        // 1. The double press on Roll a test.
        await stockFor(actor, await W().craftSnapshot(actor, { base }));
        const project = await W().craft(actor, { baseUuid: base.uuid });
        await sheet.showProfession({ view: "crafting" });
        await until(() => tab(sheet)?.querySelector(`[data-action="workProject"][data-project-id="${project.id}"]`), "Roll a test");
        const button = tab(sheet).querySelector(`[data-action="workProject"][data-project-id="${project.id}"]`);
        click(button);
        click(button);
        await until(() => !projectStill(actor, project.id), "the project finished");
        await new Promise(r => setTimeout(r, 2000));
        assert.lengthOf(actor.items.filter(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id), 1, "a double press delivered two items");

        // 2. A full bag holds a finished project ready, and Collect delivers it once.
        await stockFor(actor, await W().craftSnapshot(actor, { base }));
        const second = await W().craft(actor, { baseUuid: base.uuid });
        assert.ok(second, "the second craft was refused");
        const filler = await fillBags(actor);
        assert.isAbove(filler.length, 0, "nothing filled the bags");
        await W().workProject(actor, { projectId: second.id });
        const stored = (actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? []).find(p => p.id === second.id);
        assert.ok(stored, "a finished project with no room was dropped");
        assert.isTrue(stored.ready === true, "a finished project with no room is not held ready");
        assert.isFalse(actor.items.some(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === second.id), "the item was made with no room");
        await actor.deleteEmbeddedDocuments("Item", filler.slice(0, 4).map(i => i.id));
        await sheet.render({ parts: ["profession"] });
        await until(() => tab(sheet)?.querySelector(`[data-action="collectProject"][data-project-id="${second.id}"]`), "Collect drawn");
        const collect = tab(sheet).querySelector(`[data-action="collectProject"][data-project-id="${second.id}"]`);
        click(collect);
        click(collect);
        await until(() => !projectStill(actor, second.id), "Collect finished");
        await new Promise(r => setTimeout(r, 1500));
        assert.lengthOf(actor.items.filter(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === second.id), 1, "a double Collect delivered two items");
      } finally {
        unpin();
        await sheet.close();
      }
    });

    /* ---- Well Fed -------------------------------------------------------- */

    it("a cooked food lays Well Fed, and a Short Rest ends it", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Fed", classes: [["Warrior", 1]] });
      const steak = await give(actor, "Big Bear Steak");
      await W().useGear({ actor, item: steak });
      await until(() => isWellFed(actor.effects), "Well Fed laid");
      assert.lengthOf([...actor.effects].filter(e => e.getFlag("azeroth-rpg", "wellFed")), 1, "more than one Well Fed carrier");
      const ale = await give(actor, "Ale, a pint");
      assert.ok(await actor.shortRest({ drink: ale }), "the Short Rest was refused");
      await until(() => !isWellFed(actor.effects), "Well Fed ended by the rest");
    });

    it("Well Fed raises a failed Test's SL by 1, the card says so, and the Test stays failed", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Fed Fail", classes: [["Warrior", 1]] });
      await W().useGear({ actor, item: await give(actor, "Big Bear Steak") });
      await until(() => isWellFed(actor.effects), "Well Fed laid");
      await skip();
      const unpin = pinDie(5);
      try {
        const message = await W().rollTest({ actor, kind: "skill", dc: 30, title: "ZZ fed fail", modifiers: [] });
        const roll = message.rolls[0];
        const raw = Math.max(-SL_CAP, Math.floor((roll.total - 30) / 5));
        assert.isFalse(roll.outcome.success, "Well Fed turned a failure into a success");
        assert.equal(roll.outcome.sl, raw + 1, "Well Fed did not add 1 to the SL");
        assert.match(message.content, new RegExp(game.i18n.localize("AZEROTH.WellFed.Name"), "i"), "the card does not say Well Fed");
      } finally {
        unpin();
      }
    });

    it("Well Fed applies on a Casting Test, and its +1 stops at SL 10", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Prof Fed Mage", classes: [["Mage", 3]], spells: ["Fireball"] });
      await W().useGear({ actor: mage, item: await give(mage, "Big Bear Steak") });
      await until(() => isWellFed(mage.effects), "Well Fed laid");
      await skip();
      const spell = mage.items.find(i => i.type === "spell");
      const pool = (mage.system.powers ?? []).find(p => p.name === "mana");
      if (pool) await mage.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const unpin = pinDie(12);
      try {
        const message = await W().castSpell({ actor: mage, spell, targets: [] });
        const roll = message?.rolls?.[0];
        assert.ok(roll, "the cast rolled no Casting Test");
        assert.equal(Number(roll.options.wellFed), 1, "Well Fed did not reach the Casting Test (D-1994)");
      } finally {
        unpin();
      }
      // The cap (O-699; the lead: *"raise the SL whole cap"*): a Test's own SL stops at 10 and Well
      // Fed's +1 stops at the same 10. Total 58 against DC 8 is SL 10 and stays 10 fed; 53 is SL 9 and
      // reaches 10 fed; 49 is SL 8, which the old cap of 6 held at 6 and Well Fed lifted to 7, and is 9.
      for (const [face, want] of [[10, 10], [5, 10], [1, 9]]) {
        const u = pinDie(face);
        try {
          const roll = AzerothRoll.build({ dc: 8, modifiers: [{ label: "ZZ", value: 48 }], kind: "profession", roller: mage, chosen: null });
          roll.options.adjusted = true;
          await roll.evaluate();
          assert.equal(roll.outcome.sl, want, `face ${face}: a fed Test is not SL ${want}`);
          assert.isAtMost(roll.outcome.sl, SL_CAP, "Well Fed passed the SL cap of 10");
        } finally { u(); }
      }
    });

    it("a Feast lays Well Fed on each participant", async function () {
      this.timeout(90000);
      const { sharedFeastQueryHandler } = await import("../effects/shared-feast.mjs");
      const payer = await makeCharacter({ name: "ZZ Prof Feast Payer", classes: [["Warrior", 1]] });
      const guest = await makeCharacter({ name: "ZZ Prof Feast Guest", classes: [["Warrior", 1]] });
      const feast = await give(payer, "Feast, for six");
      const created = await sharedFeastQueryHandler({ operation: "create", actorUuid: payer.uuid, itemId: feast.id, participants: [payer.uuid, guest.uuid] }, { user: game.user });
      assert.isTrue(created.ok, "the shared Feast was not opened");
      const session = payer.getFlag("azeroth-rpg", "sharedFeastSession");
      // Each claim asks the GM to confirm; answer yes as the GM would.
      const yes = Hooks.on("renderDialogV2", app => { app.element?.querySelector('button[data-action="yes"]')?.click(); });
      try {
        for (const who of [payer, guest]) {
          const done = await who.shortRest({ feast: { payerUuid: payer.uuid, sessionId: session.id } });
          assert.ok(done, `${who.name}'s Feast rest was refused`);
        }
      } finally {
        Hooks.off("renderDialogV2", yes);
      }
      await until(() => isWellFed(payer.effects) && isWellFed(guest.effects), "Well Fed on both participants");
    });

    /* ---- gathering ------------------------------------------------------- */

    it("gathers Copper ore by biome through the roll dialog, and the tool is required", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Miner", classes: [["Warrior", 1]], profession: "Blacksmithing", bags: ["Backpack"] });
      const sheet = await openSheet(actor);
      let unpin = () => {};
      try {
        await game.user.unsetFlag("azeroth-rpg", "professionBiome");
        let section = await sheet.showProfession({ view: "overview" });
        const biome = section.querySelector("select[data-prof-biome]");
        assert.ok(biome, "no Biome dropdown");
        change(biome, "grassland");
        await until(() => tab(sheet)?.querySelector('input[data-prof-node][value="copper-ore"]'), "the Copper ore node");
        change(tab(sheet).querySelector('input[data-prof-node][value="copper-ore"]'), true);
        await until(() => tab(sheet)?.querySelector('input[data-prof-node][value="copper-ore"]')?.checked, "Copper picked");
        let gatherButton = tab(sheet).querySelector('[data-action="gather"]');
        assert.isTrue(gatherButton.disabled, "Gather is live with no tool");
        assert.match(tab(sheet).querySelector(".azeroth-prof-gather")?.textContent ?? "", /Smith/i, "the missing tool is not said in words");
        await give(actor, "Smith's tools");
        await until(() => tab(sheet)?.querySelector('[data-action="gather"]') && !tab(sheet).querySelector('[data-action="gather"]').disabled, "Gather live with the tool");
        await always();
        unpin = pinDie(20);
        click(tab(sheet).querySelector('[data-action="gather"]'));
        const { message } = await rollThroughDialog(actor);
        assert.ok(message, "no gather card");
        await until(() => held(actor, "copper-ore") > 0, "Copper ore in the bags");
      } finally {
        unpin();
        await skip();
        await sheet.close();
        await game.user.unsetFlag("azeroth-rpg", "professionBiome");
      }
    });

    it("a heavy ore's yield stops at the room that fits", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Prof Heavy", classes: [["Warrior", 1]], profession: "Blacksmithing" });
      await give(actor, "Smith's tools");
      const filler = await fillBags(actor);
      await actor.deleteEmbeddedDocuments("Item", [filler.at(-1).id]);
      await skip();
      const unpin = pinDie(20);
      try {
        const result = await W().gather(actor, { biome: "grassland", material: "copper-ore" });
        assert.ok(result, "the gather was refused");
        assert.isAbove(result.units, 1, "the yield was not more than one");
        const got = held(actor, "copper-ore");
        assert.isAbove(got, 0, "nothing was put in");
        assert.isBelow(got, result.units, "the whole yield went in past the room");
        assert.match(game.messages.contents.at(-1)?.content ?? "", new RegExp(String(result.units - got)), "the card does not say what was left behind");
      } finally {
        unpin();
      }
    });

    it("Skins a defeated Beast from the Harvest card with it targeted, once, and the banner offers it to an owner", async function () {
      this.timeout(150000);
      const actor = await makeCharacter({ name: "ZZ Prof Skinner", classes: [["Warrior", 1]], profession: "Leatherworking", bags: ["Backpack"] });
      await give(actor, "Leatherworker's tools");
      const wolf = await makeNpc("Timber Wolf");
      await wolf.update({ "system.health.value": 0, "prototypeToken.actorLink": true });
      await actor.update({ "prototypeToken.actorLink": true });
      const scene = await Scene.create({ name: "ZZ Harvest Scene", width: 2000, height: 1200, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      const [wolfToken, ownToken] = await scene.createEmbeddedDocuments("Token", [
        await tokenData(wolf, { x: 600, y: 400 }),
        await tokenData(actor, { x: 400, y: 400, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })
      ]);
      await until(() => tokenDrawn(canvas.tokens.get(wolfToken.id)) && tokenDrawn(canvas.tokens.get(ownToken.id)), "tokens drawn", 20000);
      await skip();
      const sheet = await openSheet(actor);
      const unpin = pinDie(20);
      const hooks = [];
      try {
        // The banner, for the owner controlling the harvester. The user's ASSIGNED character comes first
        // (D-1985's harvester), and another batch can leave the GM user assigned to some other character
        // (the full ordering left one and the banner offered nothing), so this test assigns its own and
        // puts back what the user held.
        const assigned = game.user.character?.id ?? null;
        await game.user.update({ character: actor.id });
        try {
          canvas.tokens.get(ownToken.id).control({ releaseOthers: true });
          const npcSheet = await openSheet(wolf);
          const skin = npcSheet.element.querySelector('[data-action="harvestCreature"][data-kind="skin"]');
          assert.ok(skin, "the defeated wolf's banner offers no Skin to its owner");
          await npcSheet.close();
        } finally {
          canvas.tokens.releaseAll();
          await game.user.update({ character: assigned }).catch(() => {});
        }

        // The Harvest card, with the wolf targeted.
        let section = await sheet.showProfession({ view: "overview" });
        assert.ok(section.querySelector(".azeroth-prof-harvest-none"), "the card does not ask for a target");
        canvas.tokens.setTargets([wolfToken.id]);
        await until(() => tab(sheet)?.querySelector(`[data-action="harvestTarget"][data-kind="skin"]`), "the Skin button on the Harvest card");
        // 11 section 11: the GM names the material where several stand at the tier (Ruined leather
        // scraps or Light leather): the one chooser opens, and the first is chosen as the GM would.
        const chooser = Hooks.on("renderDialogV2", app => { if (app.id?.startsWith("azeroth-choose-")) app.element?.querySelector('button[data-action="choose"]')?.click(); });
        hooks.push(["renderDialogV2", chooser]);
        click(tab(sheet).querySelector(`[data-action="harvestTarget"][data-kind="skin"]`));
        await until(() => (wolf.getFlag("azeroth-rpg", HARVESTED_FLAG) ?? []).includes("skin"), "the wolf marked skinned");
        await until(() => actor.items.some(i => i.system?.material?.family === "hide"), "a hide in the bags");
        await until(() => tab(sheet)?.querySelector(`[data-action="harvestTarget"][data-kind="skin"]`)?.disabled === true, "Skin greyed after");
        assert.match(tab(sheet).querySelector(".azeroth-prof-harvest")?.textContent ?? "", /\S/, "the greyed Skin carries no reason");
        const before = actor.items.filter(i => i.system?.material?.family === "hide").length;
        assert.isNull(await W().harvest(actor, { target: wolfToken, kind: "skin" }), "a second Skin was taken");
        assert.equal(actor.items.filter(i => i.system?.material?.family === "hide").length, before, "a second Skin yielded");
      } finally {
        unpin();
        for (const [name, id] of hooks) Hooks.off(name, id);
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
    });

    it("Disenchant yields essence only after the item is gone", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Disenchanter", classes: [["Mage", 1]], profession: "Enchanting", bags: ["Backpack"], skillRanks: { arcana: 5 }, abilities: { int: 18 } });
      await give(actor, "Enchanter's rod");
      const rare = (await game.packs.get("azeroth-rpg.weapons").getIndex({ fields: ["system.rarity"] })).find(e => e.system?.rarity === "rare");
      const item = await give(actor, rare.name, "azeroth-rpg.weapons");
      const order = [];
      const del = Hooks.on("deleteItem", doc => { if (doc.id === item.id) order.push("deleted"); });
      const add = Hooks.on("createItem", doc => { if (doc.parent === actor && doc.system?.material) order.push("essence"); });
      const upd = Hooks.on("updateItem", (doc, change) => { if (doc.parent === actor && doc.system?.material && change.system?.quantity) order.push("essence"); });
      await skip();
      const unpin = pinDie(20);
      try {
        const result = await W().disenchant(actor, { itemId: item.id });
        assert.ok(result, "the disenchant was refused");
        assert.isFalse(actor.items.has(item.id), "the item survived");
        assert.isAbove(result.units, 0, "a success yielded nothing");
        assert.deepEqual(order.slice(0, 2), ["deleted", "essence"], `the essence came before the item went: ${order.join(", ")}`);
      } finally {
        unpin();
        Hooks.off("deleteItem", del); Hooks.off("createItem", add); Hooks.off("updateItem", upd);
      }
    });

    it("Lay an enchantment lists only what the door accepts", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Enchanter", classes: [["Mage", 5]], profession: "Enchanting", bags: ["Backpack"] });
      await give(actor, "Enchanter's rod");
      const sword = await give(actor, "Longsword", PACK_FOR.weapon);
      const sheet = await openSheet(actor);
      try {
        await sheet.showProfession({ view: "crafting" });
        const select = tab(sheet).querySelector('select[data-prof-enchant="item"]');
        assert.ok(select, "no item select on Lay an enchantment");
        change(select, sword.id);
        await until(() => tab(sheet)?.querySelector('select[data-prof-enchant="item"]')?.value === sword.id, "the sword picked");
        const offered = [...tab(sheet).querySelectorAll('select[data-prof-enchant="affix"] option')].map(o => o.value).filter(Boolean);
        const { enchantVerdict } = await import("../rules/recipes.mjs");
        const pool = await professionAffixPool();
        for (const id of offered) {
          const affix = pool.find(a => a.id === id);
          assert.ok(affix, `an offered affix ${id} is not in the pool`);
          assert.isTrue(enchantVerdict({ item: sword.toObject(), affix, pool }).ok, `${affix.name} is offered and the door refuses it`);
        }
      } finally {
        await sheet.close();
      }
    });

    /* ---- traits, words --------------------------------------------------- */

    it("a trait chip's tooltip carries 08 section 5's text, and Escape closes only the tooltip", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prof Traits", classes: [["Warrior", 1]], profession: "Blacksmithing" });
      const sheet = await openSheet(actor);
      try {
        await sheet.showProfession({ view: "crafting" });
        click(tab(sheet).querySelector('[data-action="openAllRecipes"]'));
        const { base } = await baseOf("Longsword", PACK_FOR.weapon);
        const card = await pickRecipe(sheet, "Longsword", base.uuid);
        const chip = card.querySelector("button[data-prof-trait]");
        assert.ok(chip, "the Longsword's card carries no trait chip");
        const traits = await game.packs.get("azeroth-rpg.traits").getDocuments();
        const name = chip.textContent.trim().replace(/\s*\(.*\)$/, "").replace(/\s+\d+$/, "");
        const trait = traits.find(t => t.name.replace(/\s*\(.*\)$/, "").replace(/\s+X$/, "") === name);
        assert.ok(trait, `no trait pack entry for ${name}`);
        chip.focus();
        await until(() => game.tooltip?.element === chip, "the tooltip opened on focus");
        const tip = document.getElementById("tooltip")?.textContent ?? "";
        const words = String(trait.system.description ?? "").replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1").split(/\s+/).filter(w => w.length > 5).slice(0, 3);
        for (const w of words) assert.include(tip, w, `the tooltip does not carry 08 section 5's text (${w})`);
        assert.notInclude(tip, "@UUID", "the tooltip prints a raw @UUID");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await until(() => game.tooltip?.element !== chip, "Escape closed the tooltip");
        await new Promise(r => setTimeout(r, 300));
        assert.isTrue(sheet.rendered, "Escape closed the sheet too");
      } finally {
        await sheet.close();
      }
    });

    it("no career word anywhere on the sheet", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Prof Words", classes: [["Warrior", 6]], profession: "Blacksmithing" });
      const sheet = await openSheet(actor);
      try {
        for (const t of ["overview", "core", "combat", "spells", "gear", "progress", "corruption"]) {
          sheet.changeTab(t, "primary");
          await settle();
        }
        await sheet.showProfession({ view: "overview" });
        await sheet.showProfession({ view: "crafting" });
        assert.notMatch(sheet.element.textContent, /career/i, "the sheet speaks of careers");
        assert.notMatch(sheet.element.innerHTML.replace(/<!--[\s\S]*?-->/g, ""), /career/i, "the sheet's markup names a career");
      } finally {
        await sheet.close();
      }
    });

    /* ---- migration ------------------------------------------------------- */

    it("migration 0.17.0 deletes careers, keeps Ranks and XP, sets the owed flag, keeps a stub's Rank, collapses two, and runs once", async function () {
      this.timeout(300000);
      const { migrate } = await import("../migrations/0.17.0-professions.mjs");
      const career = { name: "ZZ Old Watchman", type: "career", system: {} };
      const owed = await Actor.create({ name: "ZZ Prof Migrate Owed", type: "character", items: [career], flags: { "azeroth-rpg": { skillRanks: { athletics: 3 } } }, system: { xp: { earned: 300, spent: 120 } } });
      made.push(owed);
      const stub = { name: "Blacksmithing", type: "profession", system: { rank: 4 } };
      const kept = await Actor.create({ name: "ZZ Prof Migrate Stub", type: "character", items: [career, stub], system: { xp: { earned: 300, spent: 50 } } });
      made.push(kept);
      const two = await Actor.create({ name: "ZZ Prof Migrate Two", type: "character", items: [{ ...stub, system: { rank: 2 } }, { name: "Alchemy", type: "profession", system: { rank: 5 } }] });
      made.push(two);
      assert.equal(owed.items.filter(i => i.type === "career").length, 1, "the fixture holds no career");
      assert.equal(two.items.filter(i => i.type === "profession").length, 2, "the fixture does not hold two professions");

      const first = [];
      await migrate(line => first.push(String(line)));
      assert.lengthOf(owed.items.filter(i => i.type === "career"), 0, "a career survived the migration");
      assert.lengthOf(kept.items.filter(i => i.type === "career"), 0, "a career survived beside a stub");
      assert.deepEqual(owed.getFlag("azeroth-rpg", "skillRanks"), { athletics: 3 }, "the Ranks moved");
      assert.equal(owed.system.xp.spent, 120, "the XP spent moved");
      assert.equal(owed.system.xp.earned, 300, "the XP earned moved");
      assert.ok(owed.getFlag("azeroth-rpg", "professionOwed"), "a character with no profession was not asked to choose");
      assert.equal(kept.professionItem?.system?.rank ?? kept.items.find(i => i.type === "profession")?.system.rank, 4, "the stub lost its Rank");
      assert.notOk(kept.getFlag("azeroth-rpg", "professionOwed"), "a character holding a stub was asked to choose");
      assert.lengthOf(two.items.filter(i => i.type === "profession"), 1, "two stubs did not collapse to one");
      assert.equal(two.items.find(i => i.type === "profession").system.rank, 5, "the collapse did not keep the highest Rank");

      const second = [];
      await migrate(line => second.push(String(line)));
      const names = [owed, kept, two].map(a => a.id);
      assert.isFalse(second.some(l => names.some(id => l.includes(id))), `a second run touched the test actors again: ${second.filter(l => names.some(id => l.includes(id))).join(" | ")}`);
    });
  });
}

/** Whether a project is still stored on the actor. */
function projectStill(actor, id) {
  return (actor.getFlag("azeroth-rpg", CRAFT_PROJECT_FLAG) ?? []).some(p => p.id === id);
}
