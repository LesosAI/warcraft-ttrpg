/**
 * **THE PROFESSIONS' DOORS** (03-PROFESSIONS, 11-DOWNTIME §9 to §12; D-1903 to
 * D-1930, D-1935). Re-exported by `dice/workflows.mjs`, so the sheet calls
 * `game.system.azeroth.workflows.craft(...)` and its kin.
 *
 * Every door follows D-768's order: **judge whole, then spend, then write**. A
 * refusal is said in words and spends nothing. The law is pure and lives in
 * `rules/`: `professions.mjs` (the tool, the Test's parts), `recipes.mjs` (what
 * a craft takes and whether it may start), `crafting.mjs` (the stored project),
 * `gathering.mjs` (biome, harvest, Disenchant), `downtime.mjs`, `well-fed.mjs`
 * and `profession-door.mjs` (counts, the one-batch spend). This module only
 * reads the actor, asks the dialog, rolls and writes.
 *
 * - `craft` STARTS a project (D-1924): the refusals, the materials spent in one
 *   batch, the project stored on `flags.azeroth-rpg.craftProject` (a list:
 *   several stand at once, D-1957). No die is rolled at the start.
 * - `workProject` is one Craft Test: the roll dialog (D-1927; the tool and Well
 *   Fed automatic lines, Boons and Banes by 05 §4), d20 + ability + Rank + tool
 *   (D-1926, never Proficiency), Well Fed after the SL, `stepProject`; the item
 *   is built when the running total reaches the target and the materials are
 *   lost at -3.
 * - `gather`, `harvest` and `disenchant` are Gathering Tests (D-1915). Downtime
 *   never gates them.
 * - `enchant` lays an affix in place through `applyAffixInPlace`, as a project, or an
 *   Enchanter's Signature (08 §18's `### Signatures`, D-2147) through the same project.
 */

import { AZEROTH } from "../config.mjs";
import { AzerothRoll } from "./azeroth-roll.mjs";
import { defaultChoice, promptRoll } from "../applications/roll-dialog.mjs";
import { downtimeState, shouldPrompt } from "../settings.mjs";
import { resultName } from "../rules/resolution.mjs";
import { PROFESSION_BY_ID, bonusParts, carriedTool } from "../rules/professions.mjs";
import {
  RARITY_CEILING, RARITY_TIER, affixChoices, craftOf, craftRarity, craftRefusals, enchantChoices, enchantReagents, enchantTier, enchantVerdict,
  fixedRarity, forgeable, isClassicFind, reagentsFor, recipeTier, shortfall, visibleRows
} from "../rules/recipes.mjs";
import { cutChoices, deliveredBase, prefixRowDrawn } from "../rules/craft-cuts.mjs";
import { SIGNATURE_INDEX_FIELDS, SIGNATURE_PACKS, craftCatalogueFor, resolveCraftSignature, signatureCatalogue, signaturesFor } from "../rules/craft-signatures.mjs";
import { ENCHANTER_FLAG, ENCHANTER_SIGNATURES, enchanterSignatureReagents, enchanterSignatureUpdate, enchanterSignatureVerdict } from "../rules/enchanter-signatures.mjs";
import { collectable, craftPlan, dropProject, enchantPending, expectedSteps, newProject, stepProject, testRefusal, upsertProject } from "../rules/crafting.mjs";
import {
  DISENCHANT_SKILL, GATHER_SKILL, HARVEST, disenchantOf, disenchantRefusal, gatherDC, gatherRefusal, harvestCandidates, harvestMaterial,
  harvestOn, yieldFor
} from "../rules/gathering.mjs";
import { nodeOf } from "../rules/biomes.mjs";
import { downtimeRefusal } from "../rules/downtime.mjs";
import { gatherInputs, materialCounts, materialsFrom, pickPlan, rankRaisePlan, reagentSpend, rowsAfterSpend, spendWrites } from "../rules/profession-door.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { admit } from "../rules/slots.mjs";
import { build as forgeBuild, plan as forgePlan } from "../rules/forge.mjs";
import { writeQueue } from "../rules/write-queue.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/** The flag the stored projects live on, a list (D-1924, D-1957). */
export const CRAFT_PROJECT_FLAG = "craftProject";

/** The flag a crafted item carries: `{by, profession, generated}` (the plan's Phase 3). */
export const CRAFTED_FLAG = "crafted";

/** The flag a harvested creature carries: the harvests already made on it (11 §11: *once on a creature*). */
export const HARVESTED_FLAG = "harvested";

/** The query that marks a creature this client does not own (D-1915). */
export const HARVEST_QUERY = "azeroth-rpg.harvestMark";

const PACKS = Object.freeze({ gear: "azeroth-rpg.gear", affixes: "azeroth-rpg.affixes" });

/**
 * The card every profession door posts (the plan's M6, D11 §12): one template
 * for a rolled Test and for a note with no die, every craft line a row of its
 * own, and the whole context on the message as `flags.azeroth-rpg.craft`.
 */
const TEMPLATE = Object.freeze({
  craft: "systems/azeroth-rpg/templates/chat/craft-card.hbs"
});

/** A finished or collapsed project's card says so in a word (D-622), never a colour alone. */
const OUTCOME_WORD = Object.freeze({
  done: "AZEROTH.Profession.Card.Crafted",
  collapsed: "AZEROTH.Profession.Card.Collapsed"
});

/* -------------------------------------------- */
/*  What the doors load once                     */
/* -------------------------------------------- */

let materialsCache = null;
let affixCache = null;
let signatureCache = null;
let cachesHooked = false;

/**
 * **WHEN THE SESSION'S CACHES ARE FORGOTTEN** (the review's minor 10). The
 * materials map, the affix pool and the Signature catalogue are read once from
 * the gear, affix and equipment packs. System packs are LOCKED and change only by
 * a rebuild, which needs the server stopped and so a fresh session; the one other
 * way they change is a GM unlocking one and editing it in place, so any create,
 * update or delete of an Item in one of those packs forgets the cache it feeds,
 * and the next read loads it again. Hooked once, at the first load.
 */
function hookCaches() {
  if (cachesHooked || typeof Hooks === "undefined") return;
  cachesHooked = true;
  const forget = doc => {
    const pack = doc?.pack ?? null;
    if (!pack) return;
    if (pack === PACKS.gear) materialsCache = null;
    if (pack === PACKS.affixes) affixCache = null;
    if (SIGNATURE_PACKS.includes(pack)) signatureCache = null;
  };
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, forget);
}

/**
 * Every gear document by identifier, `{price, family, tier, name, uuid, img,
 * weight}` (`profession-door.mjs#materialsFrom`), off the gear pack's index,
 * loaded once (`hookCaches` says when it is forgotten). The sheet reads the same
 * map for its have/need counts and names.
 *
 * @returns {Promise<Record<string, object>>}
 */
export async function professionMaterials({ fresh = false } = {}) {
  hookCaches();
  if (materialsCache && !fresh) return materialsCache;
  const pack = game.packs.get(PACKS.gear);
  const index = pack ? await pack.getIndex({ fields: ["system.identifier", "system.cost", "system.material", "system.source", "system.weight"] }) : [];
  materialsCache = materialsFrom([...index]);
  return materialsCache;
}

/**
 * **THE BOOK'S SIGNATURES A CRAFT MAY CHOOSE** (D-1990), loaded once from the three
 * equipment packs' indexes over the GM Forge's own fields
 * (`craft-signatures.mjs#signatureCatalogue`: no Classic find's, no Legendary's).
 */
async function craftSignatureCatalogue() {
  hookCaches();
  if (signatureCache) return signatureCache;
  const entries = [];
  for (const id of SIGNATURE_PACKS) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    for (const e of await pack.getIndex({ fields: [...SIGNATURE_INDEX_FIELDS] })) entries.push(e);
  }
  signatureCache = signatureCatalogue(entries);
  return signatureCache;
}

/** The affix pool as `affixOf`'s plain shapes, loaded once (`hookCaches` says when it is forgotten). */
async function affixPool() {
  hookCaches();
  if (affixCache) return affixCache;
  const pack = game.packs.get(PACKS.affixes);
  const docs = pack ? await pack.getDocuments() : [];
  affixCache = docs.map(d => ({ id: d.id, ...(d.getFlag("azeroth-rpg", "affix") ?? {}) })).filter(a => a.kind === "prefix" || a.kind === "suffix");
  return affixCache;
}

/**
 * The affix pool the doors judge by, for the sheet's Forge rows and *Lay an enchantment*, so the
 * options and the verdict read one pool (FOUNDRY-3; the architect's phase 4 review, MINOR 10).
 */
export async function professionAffixPool() {
  return affixPool();
}

/** An affix handed in as a shape, an id or a name, as the pool's shape; null for none. */
async function affixFrom(given) {
  if (!given) return null;
  if (typeof given === "object" && given.kind) return given;
  const pool = await affixPool();
  return pool.find(a => a.id === given || a.name === given) ?? null;
}

/** A recipe item, by uuid, as plain data `{uuid, name, type, img, system}`. */
async function baseFrom(baseUuid) {
  const doc = baseUuid ? await fromUuid(baseUuid) : null;
  if (!doc || !["weapon", "armor", "gear"].includes(doc.type)) return null;
  const data = doc.toObject();
  return { uuid: doc.uuid, name: data.name, type: data.type, img: data.img, system: data.system, flags: data.flags ?? {} };
}

/* -------------------------------------------- */
/*  Words                                        */
/* -------------------------------------------- */

/** One refusal in words (D-681): its key in `AZEROTH.craftRefusals` or `.gatherRefusals`. */
export function refusalWords(refusal, { materials = {} } = {}) {
  if (!refusal) return "";
  const table = { ...AZEROTH.gatherRefusals, ...AZEROTH.craftRefusals };
  const key = table[refusal.reason] ?? null;
  if (!key) return String(refusal.text ?? refusal.reason ?? "");
  const nameOf = id => materials[id]?.name ?? id;
  const professionName = id => game.i18n.localize(AZEROTH.professions[id] ?? id ?? "");
  const data = { ...refusal };
  if (refusal.trade) data.trade = professionName(refusal.trade);
  if (refusal.tool) data.tool = nameOf(refusal.tool);
  if (refusal.ceiling) data.ceiling = game.i18n.localize(AZEROTH.rarities?.[refusal.ceiling] ?? refusal.ceiling);
  if (refusal.reason === "cut") data.cut = game.i18n.localize(AZEROTH.armorCuts?.[refusal.cut] ?? refusal.cut ?? "");
  // An Enchanter's Signature (08 §18): what the row goes on, in the chapter's words.
  if (refusal.reason === "sigGoesOn") data.goesOn = game.i18n.localize(AZEROTH.enchanterGoesOn?.[refusal.goesOn] ?? refusal.goesOn ?? "");
  if (refusal.reason === "short") {
    data.lines = (refusal.lines ?? []).map(l => game.i18n.format(AZEROTH.CRAFT_SHORT_LINE, { count: l.short, name: nameOf(l.identifier) })).join(", ");
  }
  return game.i18n.format(key, data);
}

function warn(refusal, opts) {
  ui.notifications?.warn(refusalWords(refusal, opts));
  return null;
}

/* -------------------------------------------- */
/*  The character, read                          */
/* -------------------------------------------- */

/** Plain rows of the actor's items, as the bag law reads them (`documents/item.mjs#rowsOf`'s shape). */
function rowsOf(actor) {
  return actor.items.map(item => {
    const data = item.toObject();
    data.id = item.id;
    if (item.system?.augment) data.system = { ...(data.system ?? {}), augment: item.system.augment };
    return data;
  });
}

function bagBase(actor) {
  const base = Number(actor?.system?.bagSlots?.base);
  return Number.isFinite(base) ? base : 16;
}

/** Whether a newcomer would find room once a spend has landed (the bag law's `admit`). */
function roomFor(actor, data, spend = null) {
  if (actor.type !== "character") return true;
  const verdict = admit(rowsAfterSpend(rowsOf(actor), spend), bagBase(actor), [{ ...data, id: "__craft__" }])[0];
  return verdict?.ok !== false;
}

/** The profession's key, item and tool, or null pieces where the character holds none. */
function professionOf(actor) {
  const item = actor?.professionItem ?? null;
  const id = item?.system?.identifier ?? null;
  const row = PROFESSION_BY_ID[id] ?? null;
  return { item, id, row, tool: id ? carriedTool(actor.items, id) : null, rank: Math.trunc(Number(item?.system?.rank)) || 0 };
}

/** The Craft Test's parts (D-1926): the profession's ability modifier, its Rank, the tool. */
function craftParts(actor, prof) {
  const ability = prof.item?.system?.ability ?? prof.row?.ability ?? "int";
  return bonusParts({
    abilityMod: actor.system?.abilities?.[ability]?.mod ?? 0,
    rank: prof.rank,
    toolRarity: prof.tool?.rarity ?? null,
    toolCarried: Boolean(prof.tool)
  }).map(p => partRow(p, { ability, profession: prof.id }));
}

/** A Gathering Test's parts (D-1915): the skill's ability modifier, the skill's Rank, the tool. */
function gatherParts(actor, skill, tool) {
  const ability = AZEROTH.skillAbility?.[skill] ?? "wis";
  const ranks = actor.getFlag("azeroth-rpg", "skillRanks") ?? {};
  return bonusParts(gatherInputs({ abilities: actor.system?.abilities, ranks }, skill, ability, tool))
    .map(p => partRow(p, { ability, skill }));
}

/** One part as a roll modifier row, its label in words. */
function partRow(part, { ability = null, profession = null, skill = null } = {}) {
  const label = part.key === "ability"
    ? game.i18n.format("AZEROTH.Profession.Part.Ability", { ability: game.i18n.localize(AZEROTH.abilities?.[ability] ?? ability ?? "") })
    : part.key === "rank"
      ? game.i18n.format("AZEROTH.Profession.Part.Rank", { name: game.i18n.localize(skill ? AZEROTH.skills?.[skill] : AZEROTH.professions?.[profession] ?? "") })
      : game.i18n.format("AZEROTH.Profession.Part.Tool", { rarity: game.i18n.localize(AZEROTH.rarities?.[part.rarity] ?? part.rarity ?? "") });
  return { label, value: part.value, key: part.key };
}

/* -------------------------------------------- */
/*  The roll                                     */
/* -------------------------------------------- */

/**
 * **EVERY CRAFT AND GATHERING TEST OPENS THE ROLL DIALOG** (D-1927): the one
 * dialog, the DC locked to the rule's, the parts as its modifier lines, the
 * Boons and Banes by 05 §4 and Well Fed as a ticked automatic line
 * (`prepareRoll`). Under the skip setting or a shift click, straight through
 * what the dialog would open on. Answers `{roll, outcome, fed}` or null.
 */
async function rollProfessionTest(actor, { title, dc, parts, skill = null, ability = null, event = null, claim = null, gathering = false }) {
  // A Craft or Gathering Test is not a Skill Test (03 §1: *both Tests add the ability modifier, not
  // the skill modifier*), so it is a kind of its own: no skill line reaches it, and the skill a
  // Gathering Test uses rides `gatherSkill` for the card alone.
  // `gathering` is said by the door, never derived from the skill (the phase 4 review): gather, harvest
  // (skin, butcher, salvage) and Disenchant pass it, and it lets a worn Boon on Gathering Tests reach
  // the dialog (08 §18's Gathering Signature). A Craft Test passes nothing.
  const spec = { kind: "profession", title, dc, dcLocked: true, modifiers: parts, skill: null, ability, gatherSkill: skill, gathering: gathering === true, targets: [] };
  const choice = shouldPrompt(event) ? await promptRoll(actor, spec) : defaultChoice(actor, spec);
  if (!choice) return null;
  // A claim made after the dialog and before the die (a harvest's once-a-creature mark): a
  // dismissed dialog claims nothing, and a refused claim rolls nothing.
  if (claim && !(await claim())) return null;
  const modifiers = [...parts];
  if (Number(choice.modifier) || 0) modifiers.push({ label: "AZEROTH.Dialog.Circumstance", value: Number(choice.modifier) });
  // Well Fed rides the one roll builder (`roller` and `chosen`, the review's M7).
  const roll = AzerothRoll.build({ dc, modifiers, boons: choice.boons ?? 0, banes: choice.banes ?? 0, kind: "profession", rollData: actor.getRollData?.() ?? {}, roller: actor, chosen: choice.chosen ?? [] });
  roll.options.provenance.push(...(choice.provenanceExtra ?? []));
  // The adjusted total alone (D-1980): a natural 1 or 20 does nothing special here, and a
  // natural 1 adds its SL to a project like any other roll (`resolution.mjs#resolveAdjusted`).
  roll.options.adjusted = true;
  await roll.evaluate();
  return { roll, outcome: roll.outcome, fed: Number(roll.options.wellFed) > 0 };
}

/** 05 §2's verdict in words (D-622): Success or Failure, and the margin's name. */
function verdictOf(outcome) {
  if (!outcome) return null;
  const won = outcome.success === true;
  const name = resultName({ sl: outcome.sl, success: won });
  return {
    success: won,
    outcome: game.i18n.localize(`AZEROTH.Roll.Outcome.${won ? "Success" : "Failure"}`),
    margin: game.i18n.localize(`AZEROTH.Roll.Result.${name[0].toUpperCase()}${name.slice(1)}`)
  };
}

/**
 * Post a Test's card (the plan's M6): the roll card with the craft's own lines.
 * `craft` is the whole context a dedicated craft card reads.
 */
async function postTestCard(actor, { title, subtitle, roll, outcome, lines = [], kind, craft = {} }) {
  const word = OUTCOME_WORD[craft?.outcome] ?? null;
  const content = await renderTemplate(TEMPLATE.craft, {
    config: AZEROTH,
    kind,
    rolled: true,
    title,
    subtitle,
    total: roll.total,
    natural: roll.natural ?? null,
    modifier: roll.natural === null || roll.natural === undefined ? null : roll.total - roll.natural,
    dc: roll.dc,
    sl: outcome.sl,
    success: outcome.success,
    verdict: verdictOf(outcome),
    // *SL 2 (+1 Well Fed)* (the plan's M9): the provenance row says it, and this is the number.
    wellFed: outcome.wellFed ?? null,
    outcome: craft?.outcome ?? null,
    outcomeWord: word ? game.i18n.localize(word) : null,
    lines: lines.map(l => ({ name: l.name ?? "", text: l.text ?? "" })),
    // Well Fed's row is dropped where it added nothing (an SL already at the cap; the final
    // review's minor 2), as the SL's own *+1 Well Fed* is.
    provenance: (roll.options?.provenance ?? []).filter(r => !(outcome.wellFed === 0 && r?.label === "AZEROTH.WellFed.Line")),
    craft
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: { "azeroth-rpg": { kind, sl: outcome.sl, success: outcome.success, craft } }
  });
}

/** Post a card with no die (a project started, abandoned or collected). */
async function postNoteCard(actor, { title, lines = [], kind, craft = {} }) {
  const content = await renderTemplate(TEMPLATE.craft, {
    config: AZEROTH, kind, rolled: false, title, subtitle: actor.name,
    notes: lines.filter(Boolean), craft
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { "azeroth-rpg": { kind, craft } } });
}

/* -------------------------------------------- */
/*  One write at a time (the review's M2)        */
/* -------------------------------------------- */

/**
 * **EVERY PROFESSION READ-AND-WRITE FOR ONE ACTOR, ONE AT A TIME** (the professions
 * review's M2; D-761's lesson, `rules/write-queue.mjs`). A project's step, its
 * delivery, a craft's reagent spend, a gather's yield onto a stack, a Rank bought
 * and a pick written each READ the actor and then WRITE what they read it as. Two
 * presses made at once - a double click on Roll a test with the dialog skipped, a
 * Collect pressed twice, Craft pressed twice on one set of materials - each read
 * the actor as it stood before the other landed, so one project delivered two
 * items and one set of materials started two projects. On this client the queue
 * runs them one after another, each reading the actor when its turn comes, and
 * every task judges again inside it. **The roll dialog is never inside the queue**:
 * a task waits for the dice that came before it, never for a person.
 *
 * A task in the queue must never await another queued profession write for the
 * same key, or it waits on itself until the queue's patience runs out.
 */
const QUEUE = writeQueue({
  onStall: doc => ui.notifications?.warn(game.i18n.format("AZEROTH.Profession.Stalled", { name: doc?.name ?? "" }))
});

/** Run a profession write for this actor after every one queued before it. */
function professionWrite(actor, task) {
  return QUEUE.run(`actor:${actor?.uuid ?? actor?.id ?? "none"}`, task, actor);
}

/**
 * **AN XP SPEND, IN THE SAME QUEUE AS THE PROFESSION'S RANK** (the final review's minor 7). The
 * sheet's skill Rank buy and `raiseProfessionRank` both write `system.xp.spent` off a read, so one
 * made within a round trip of the other lost a charge. The sheet's buy runs its read and its write
 * as one task here, after every profession write queued before it. The task must not await another
 * queued profession write for this actor.
 *
 * @template T
 * @param {Actor} actor
 * @param {() => Promise<T>|T} task
 * @returns {Promise<T>}
 */
export function xpWrite(actor, task) {
  return professionWrite(actor, task);
}

/** Run a harvest claim for this creature after every one queued before it (two harvesters, one corpse). */
function creatureWrite(creature, task) {
  return QUEUE.run(`creature:${creature?.uuid ?? creature?.id ?? "none"}`, task, creature);
}

/* -------------------------------------------- */
/*  Craft (D-1924): the project, started         */
/* -------------------------------------------- */

/** The projects an actor stores, a list sorted by id (D-1957). */
export function projectsOf(actor) {
  const list = actor?.getFlag?.("azeroth-rpg", CRAFT_PROJECT_FLAG);
  return Array.isArray(list) ? list.filter(p => p && typeof p.id === "string") : [];
}

async function writeProjects(actor, list) {
  return actor.setFlag("azeroth-rpg", CRAFT_PROJECT_FLAG, list);
}

/**
 * **EVERYTHING THE SHEET DRAWS FOR ONE RECIPE, AND EVERYTHING `craft` JUDGES**:
 * the stamp for the trade, the plan (rarity, effective tier, DC, interval,
 * target), the reagents with have/need, the tool and the Test's bonus, the
 * Forge's verdict, the expected tests, the Forge rows that apply (D-1929), the
 * Signatures this item may take and every refusal (`craftRefusals`, D-768's
 * whole judgement). One reading, so what the sheet greys and what the door
 * refuses can never disagree.
 *
 * - **The rarity is the book's where 08 §18 fixes it** (`recipes.mjs#craftRarity`;
 *   the review's M5): the five Epic flasks are made Epic, target 8, section 10's
 *   gear Common. `rarity` and `fixedRarity` say which.
 * - **A Signature is a catalogue row** (D-1990; the lead: *"The signatures should be
 *   chosen from a list, not typed like the GM can. Exclude legendary signatures"*):
 *   `signature` going in is `{id}`; `signatures` coming out is the list for THIS
 *   item at this rarity beside this prefix and suffix, each `{id, from, text, kind,
 *   cost}` with `text` in prose (`craft-signatures.mjs#signaturesFor`), and only
 *   rows `forge.plan` takes are listed. An unknown id, a typed sentence or a row
 *   written for another kind of item is refused in words.
 * - **A Cut is offered to a suit with none, where no Prefix row is drawn** (D-2009;
 *   the lead: *"Items without a prefix option should allow selection of a Cut if
 *   relevant"*): `prefixRow` says whether the Prefix row has an option to draw
 *   (`craft-cuts.mjs#prefixRowDrawn` over `recipes.mjs#affixChoices`, the reading
 *   the sheet draws by), `cuts` the Cuts the window lists (`cutChoices`), and
 *   `cut` the one asked for where it is offered. A Cut costs nothing; any other
 *   is refused in words (`cut`).
 *
 * @param {Actor} actor
 * @param {{base: object, rarity?: string, affixes?: object[], signature?: {id: string}|null, cut?: string|null}} o
 *   `base` the recipe as plain data (`{name, type, system}`), `affixes` the
 *   chosen affix shapes, prefix first.
 * @returns {Promise<object>}
 */
export async function craftSnapshot(actor, { base, rarity = "common", affixes = [], signature = null, cut = null } = {}) {
  const materials = await professionMaterials();
  const pool = await affixPool();
  const prof = professionOf(actor);
  const trade = prof.id;
  // An Enchanting crafter may also pick from 08 §18's Enchanter's Signatures (D-2147).
  const catalogue = craftCatalogueFor(trade, await craftSignatureCatalogue());
  const tier = actor?.professionTier ?? 1;
  const stamp = craftOf(base, trade);
  const picked = (affixes ?? []).filter(Boolean);
  const prefixes = picked.filter(a => a.kind === "prefix");
  const suffix = picked.find(a => a.kind === "suffix") ?? null;
  const made = craftRarity(base, rarity);
  const canForge = forgeable(base);
  const chosen = resolveCraftSignature(signature, catalogue, base);
  const sig = chosen.signature ?? null;
  const reagents = reagentsFor({ base, rarity: made, affixes: picked, signature: sig, materials, trade });
  const have = materialCounts(actor?.items ?? []);
  const spend = reagentSpend(actor?.items ?? [], reagents);
  const plan = craftPlan({ tier: recipeTier(base, made, trade), rarity: made });
  const parts = craftParts(actor, prof);
  const bonus = parts.reduce((n, p) => n + p.value, 0);
  const result = canForge && RARITY_TIER[made] ? forgePlan({
    base, rarity: made, prefixes, suffix, floor: false,
    signature: sig ? { kind: sig.kind, text: sig.text, effect: sig.effect } : null
  }) : null;
  const room = roomFor(actor, { name: result?.name ?? base?.name, type: base?.type, system: { ...(base?.system ?? {}), equipped: false, container: null } }, spend);
  const rows = visibleRows(made, { forgeable: canForge });
  // The Prefix row is drawn only where a prefix may be picked (D-1929); where it is not, a Cut-less
  // suit is offered a Cut (D-2009). The same reading the sheet's rows are drawn by.
  const prefixOptions = rows.prefix ? affixChoices({
    item: base, rarity: made, trade, kind: "prefix", affixes: pool, other: suffix, current: prefixes[0] ?? null, signature: sig?.kind ?? null
  }) : [];
  const prefixRow = prefixRowDrawn(rows.prefix, prefixOptions);
  const cuts = cutChoices({ base, prefixRow });
  const refusals = isClassicFind(base) ? [{ reason: "notRecipe" }] : [
    ...(chosen.refusal ? [chosen.refusal] : []),
    ...craftRefusals({
      profession: trade, base, tier, rarity, affixes: picked, signature: sig,
      ...downtimeState(), toolCarried: Boolean(prof.tool), reagents, have, room, cut, prefixRow
    })
  ];
  return {
    profession: trade,
    tier,
    stamp,
    rarity: made,
    fixedRarity: fixedRarity(base),
    plan,
    reagents: shortfall(reagents, have).map(l => ({ ...l, name: materials[l.identifier]?.name ?? l.identifier, img: materials[l.identifier]?.img ?? null })),
    tool: prof.tool ? { name: prof.tool.item.name, rarity: prof.tool.rarity, bonus: prof.tool.bonus, itemId: prof.tool.item.id ?? null } : null,
    parts,
    bonus,
    forge: result,
    name: result?.name ?? base?.name ?? "",
    price: result?.price ?? base?.system?.cost ?? null,
    expected: expectedSteps({ bonus, dc: plan.dc, target: plan.target }),
    rows,
    prefixRow,
    cuts,
    cut: cut && cuts.includes(cut) ? cut : null,
    signatures: canForge ? signaturesFor({ base, rarity: made, prefixes, suffix, catalogue }) : [],
    signature: sig ? { id: sig.id, kind: sig.kind } : null,
    refusals,
    words: refusals.map(r => refusalWords(r, { materials })),
    ok: refusals.length === 0
  };
}

/**
 * **A PROJECT STARTED, INSIDE THE QUEUE**: the project claimed on the sheet as
 * `pending`, the reagents spent, then the project `stored`.
 *
 * WHY THIS ORDER (CLAUDE.md §15: create first where a loss is worse than a
 * duplicate). Spent first, a failure before the project landed would lose the
 * materials with nothing to show; stored first and spent after, a failure would
 * leave a project paid by nothing. A `pending` project is neither: `testRefusal`
 * takes no Test on it and says why (`pending`), Abandon clears it, and the pending
 * claim is dropped again where the spend throws. So a lost write leaves a state
 * the sheet shows and the table can settle - never a free item, never materials
 * gone with no project.
 */
async function startProject(actor, project, spend) {
  await writeProjects(actor, upsertProject(projectsOf(actor), { ...project, status: "pending" }));
  // **THE SPEND IS ONE WRITE** (`profession-door.mjs#spendWrites`; the final review's minor 4): a
  // used-up stack is lowered to 0 in the same update, so the spend lands whole or not at all.
  // It was an update and then a delete, and a refused delete left part of the reagents spent with
  // the project dropped.
  const writes = spendWrites(spend);
  try {
    if (writes.updates.length) await actor.updateEmbeddedDocuments("Item", writes.updates);
  } catch (err) {
    await writeProjects(actor, dropProject(projectsOf(actor), project.id));
    throw err;
  }
  await writeProjects(actor, upsertProject(projectsOf(actor), project));
  // The empty stacks go last, as cleanup: one a refused delete leaves is an empty stack the table
  // can clear, never a reagent lost or a project unpaid (CLAUDE.md §15).
  const empty = writes.cleanup.filter(id => actor.items.get(id)?.system?.quantity === 0);
  if (empty.length) {
    try {
      await actor.deleteEmbeddedDocuments("Item", empty);
    } catch (err) {
      console.warn("azeroth-rpg | a used-up reagent stack could not be removed; it is left empty", err);
    }
  }
  return project;
}

/**
 * **START A CRAFT** (D-1924): judge whole (`craftSnapshot`'s refusals, bag room
 * included), then INSIDE the actor's queue judge again, spend the reagents in
 * ONE batch and store a project (`startProject`). No die is rolled: each test is
 * `workProject`. Answers the project, or null on a refusal (said in words,
 * nothing spent). Two presses on one set of materials start one project: the
 * second's judgement runs after the first's spend has landed and finds them short.
 *
 * @param {Actor} actor
 * @param {{baseUuid: string, rarity?: string, prefixes?: Array<object|string>, suffix?: object|string|null, signature?: {id: string}|null, cut?: string|null}} o
 *   `cut` a Cut the window offers this suit (D-2009), or none
 */
export async function craft(actor, { baseUuid, rarity = "common", prefixes = [], suffix = null, signature = null, cut = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const base = await baseFrom(baseUuid);
  if (!base) return warn({ reason: "notRecipe" });
  const affixes = [];
  for (const p of prefixes ?? []) { const a = await affixFrom(p); if (a) affixes.push({ ...a, kind: "prefix" }); }
  const s = await affixFrom(suffix);
  if (s) affixes.push({ ...s, kind: "suffix" });
  const materials = await professionMaterials();
  const first = await craftSnapshot(actor, { base, rarity, affixes, signature, cut });
  if (!first.ok) return warn(first.refusals[0], { materials });
  const started = await professionWrite(actor, async () => {
    // Read again at the write: a stack, a level or a downtime that moved since the first judgement.
    const snap = await craftSnapshot(actor, { base, rarity, affixes, signature, cut });
    if (!snap.ok) return { refusal: snap.refusals[0] };
    const lines = snap.reagents.map(l => ({ identifier: l.identifier, count: l.need }));
    const spend = reagentSpend(actor.items, lines);
    if (!spend) return { refusal: { reason: "short", lines: shortfall(lines, materialCounts(actor.items)).filter(l => l.short > 0) } };
    const chosen = snap.signature ? resolveCraftSignature(snap.signature, craftCatalogueFor(snap.profession, await craftSignatureCatalogue()), base).signature : null;
    const project = newProject({
      id: foundry.utils.randomID(16),
      recipe: base.uuid,
      name: snap.name,
      trade: snap.profession,
      tier: snap.plan.tier,
      rarity: snap.plan.rarity,
      spent: lines,
      quality: {
        prefixes: affixes.filter(a => a.kind === "prefix").map(a => a.id ?? a.name),
        suffix: affixes.find(a => a.kind === "suffix")?.id ?? null,
        // The book's row, whole (D-1990): its sentence and its descriptor travel to the build.
        signature: chosen ? { id: chosen.id, kind: chosen.kind, text: chosen.text, effect: chosen.effect } : null,
        // The Cut chosen (D-2009), judged above: it costs nothing and is set on the item made.
        cut: snap.cut,
        enchant: null
      }
    });
    await startProject(actor, project, spend);
    return { project, lines };
  });
  if (started?.refusal) return warn(started.refusal, { materials });
  const project = started?.project ?? null;
  if (!project) return null;
  await postNoteCard(actor, {
    title: game.i18n.format("AZEROTH.Profession.Craft.Card.Started", { name: project.name }),
    kind: "craftStarted",
    craft: { project: project.id, trade: project.trade },
    lines: [
      game.i18n.format("AZEROTH.Profession.Craft.Card.Spent", { spent: spentWords(started.lines, materials) }),
      game.i18n.format("AZEROTH.Profession.Craft.Card.Plan", { target: project.target, rarity: game.i18n.localize(AZEROTH.rarities?.[project.rarity] ?? project.rarity), dc: project.dc, interval: game.i18n.localize(AZEROTH.craftIntervals?.[project.interval] ?? project.interval) })
    ]
  });
  return project;
}

function spentWords(lines, materials) {
  return (lines ?? []).map(l => `${l.count} ${materials[l.identifier]?.name ?? l.identifier}`).join(", ");
}

/**
 * **A FINISHED PROJECT, CLAIMED, MADE, DROPPED** - inside the actor's queue.
 *
 * WHY THIS ORDER (CLAUDE.md §15). The project is claimed first (`delivering`), so a
 * second press - this client's, queued behind, or a stale sheet's - finds it
 * claimed and steps nothing. Then the item is created, and only then is the
 * project dropped. A failed create puts the project back as ready for Collect. A
 * write lost after the create leaves a `delivering` project whose item exists and
 * names it (`flags.azeroth-rpg.crafted.project`): Collect finds that item and only
 * drops the project (`deliveredAlready`), so the order makes neither a second item
 * nor a lost one.
 */
async function claimAndDeliver(actor, project) {
  await writeProjects(actor, upsertProject(projectsOf(actor), { ...project, status: "delivering", ready: false }));
  let delivered;
  try {
    delivered = await deliverProject(actor, project);
  } catch (err) {
    console.warn("azeroth-rpg | a finished project could not be delivered", err);
    delivered = { ok: false, words: game.i18n.localize("AZEROTH.Profession.Craft.Failed") };
  }
  if (delivered.ok) await writeProjects(actor, dropProject(projectsOf(actor), project.id));
  else await writeProjects(actor, upsertProject(projectsOf(actor), { ...project, status: "done", ready: true }));
  return delivered;
}

/** The item a claimed project already made, where a lost write left it `delivering`; null where none. */
async function deliveredAlready(actor, project) {
  if (project?.status !== "delivering") return null;
  const enchant = project.quality?.enchant ?? null;
  if (enchant?.signature) {
    const item = actor.items.get(enchant.itemId) ?? null;
    return item && item.getFlag("azeroth-rpg", ENCHANTER_FLAG) === enchant.signature ? item : null;
  }
  if (enchant) {
    const item = actor.items.get(enchant.itemId) ?? null;
    const affix = await affixFrom(enchant.affix);
    const generated = item?.getFlag("azeroth-rpg", "generated") ?? {};
    return item && affix && generated[affix.kind] === (affix.id ?? null) ? item : null;
  }
  return actor.items.find(i => i.getFlag("azeroth-rpg", CRAFTED_FLAG)?.project === project.id) ?? null;
}

/**
 * **ONE CRAFT TEST ON A STORED PROJECT** (D-1924): `testRefusal` first
 * (downtime while enforced, the tool, the project's own trade), then the roll
 * dialog, then - inside the actor's queue - the project read again and stepped.
 * Done: the project is claimed and the item built into the bags (or held as
 * ready where the bags are full, for `collectProject`). Collapsed at -3: the
 * project goes and the materials with it. Answers `{project, outcome}` or null.
 *
 * @param {Actor} actor
 * @param {{projectId: string, event?: Event|null}} o
 */
export async function workProject(actor, { projectId, event = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const project = projectsOf(actor).find(p => p.id === projectId) ?? null;
  const prof = professionOf(actor);
  const refusal = testRefusal({ project, profession: prof.id, toolCarried: Boolean(prof.tool), ...downtimeState() });
  if (refusal) return warn({ ...refusal, tool: refusal.reason === "tool" ? (prof.row?.tool ?? null) : undefined }, { materials: await professionMaterials() });
  const parts = craftParts(actor, prof);
  const title = game.i18n.format("AZEROTH.Profession.Craft.Card.Test", { name: project.name });
  const rolled = await rollProfessionTest(actor, { title, dc: project.dc, parts, ability: prof.item?.system?.ability ?? null, event });
  if (!rolled) return null;
  const { roll, outcome } = rolled;
  const settled = await professionWrite(actor, async () => {
    // Read the list again at the write: another test may have landed while the dialog stood.
    const current = projectsOf(actor).find(p => p.id === projectId) ?? null;
    const step = stepProject(current, outcome.sl);
    if (step.outcome === "collapsed") await writeProjects(actor, dropProject(projectsOf(actor), projectId));
    else if (step.outcome === "done") return { step, delivered: await claimAndDeliver(actor, step.project) };
    else if (step.outcome === "stored") await writeProjects(actor, upsertProject(projectsOf(actor), step.project));
    return { step };
  });
  const step = settled?.step ?? null;
  // Another press finished or dropped it while this Test was being rolled: nothing to add it to.
  if (!step || step.outcome === "closed") return warn({ reason: "closed" });
  const lines = [{ name: game.i18n.localize("AZEROTH.Profession.Craft.Card.Running"), text: game.i18n.format("AZEROTH.Profession.Craft.Card.RunningText", { run: step.project?.run ?? 0, target: project.target }) }];
  if (step.outcome === "collapsed") {
    lines.push({ name: game.i18n.localize("AZEROTH.Profession.Craft.Card.CollapsedName"), text: game.i18n.format("AZEROTH.Profession.Craft.Card.Collapsed", { run: step.project.run, tests: step.project.tests }) });
  } else if (step.outcome === "done") {
    lines.push({ name: game.i18n.localize("AZEROTH.Profession.Craft.Card.MadeName"), text: settled.delivered?.words ?? "" });
  } else {
    lines.push({ name: game.i18n.localize("AZEROTH.Profession.Craft.Card.StoredName"), text: game.i18n.format("AZEROTH.Profession.Craft.Card.Stored", { left: Math.max(0, project.target - step.project.run) }) });
  }
  await postTestCard(actor, {
    title, subtitle: actor.name, roll, outcome, lines, kind: "craftTest",
    craft: { project: projectId, trade: project.trade, run: step.project.run, target: project.target, outcome: step.outcome }
  });
  return { project: step.project, outcome: step.outcome };
}

/**
 * **COLLECT A FINISHED PROJECT** whose item found no room when it was made: inside
 * the actor's queue, the project read again, claimed, built into the bags and
 * dropped (`claimAndDeliver`). Two presses collect once: the second finds the
 * project gone. A project a lost write left `delivering` is dropped where its item
 * already exists, and made where it does not. Refused in words while the bags are
 * still full.
 */
export async function collectProject(actor, { projectId } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const result = await professionWrite(actor, async () => {
    const project = projectsOf(actor).find(p => p.id === projectId && collectable(p)) ?? null;
    if (!project) return { refusal: { reason: "closed" } };
    const made = await deliveredAlready(actor, project);
    if (made) {
      await writeProjects(actor, dropProject(projectsOf(actor), projectId));
      return { project, delivered: { ok: true, item: made, words: game.i18n.format("AZEROTH.Profession.Craft.Card.Made", { name: made.name }) } };
    }
    return { project, delivered: await claimAndDeliver(actor, project) };
  });
  if (result?.refusal) return warn(result.refusal);
  if (!result?.delivered?.ok) {
    ui.notifications?.warn(result?.delivered?.words ?? "");
    return null;
  }
  await postNoteCard(actor, { title: game.i18n.format("AZEROTH.Profession.Craft.Card.Collected", { name: result.project.name }), lines: [result.delivered.words], kind: "craftCollected", craft: { project: projectId } });
  return result.delivered.item ?? true;
}

/** **ABANDON A PROJECT** (the plan's M5): it goes, and the materials spent at its start with it. */
export async function abandonProject(actor, { projectId } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const project = await professionWrite(actor, async () => {
    const found = projectsOf(actor).find(p => p.id === projectId) ?? null;
    if (found) await writeProjects(actor, dropProject(projectsOf(actor), projectId));
    return found;
  });
  if (!project) return warn({ reason: "closed" });
  await postNoteCard(actor, {
    title: game.i18n.format("AZEROTH.Profession.Craft.Card.Abandoned", { name: project.name }),
    lines: [game.i18n.format("AZEROTH.Profession.Craft.Card.Lost", { spent: spentWords(project.spent, await professionMaterials()) })],
    kind: "craftAbandoned", craft: { project: projectId }
  });
  return true;
}

/**
 * **WHAT A FINISHED PROJECT MAKES** (D-1908, D-1918): the pack copy for a Common
 * recipe or one whose rarity the book fixes, the Forge's `plan` and `build` for
 * anything better (judged again here, its Signature the book's row with its
 * descriptor, D-1990), into the bags with `flags.azeroth-rpg.crafted {by,
 * profession, project, generated}`; an enchantment is laid in place instead.
 * **The item arrives KNOWN to its maker** (the review's M3; 08 §4's stamp is for a
 * find, and the person who made it knows what it is): `azerothIdentify: "known"`.
 * Answers `{ok, words, item}`; never throws on a full bag.
 */
async function deliverProject(actor, project) {
  const materials = await professionMaterials();
  if (project.quality?.enchant) return deliverEnchant(actor, project);
  const recipe = await baseFrom(project.recipe);
  if (!recipe) return { ok: false, words: refusalWords({ reason: "notRecipe" }) };
  // **THE CUT CHOSEN AT THE START IS THE SUIT'S CUT** (D-2009), on both paths: set on the base
  // before it is copied or built, so the Forge's stored base carries it too and an enchantment laid
  // later (which rebuilds from that base) keeps it. A Cut the recipe no longer offers is dropped.
  const { base } = deliveredBase(recipe, project.quality);
  const prefixes = [];
  for (const id of project.quality?.prefixes ?? []) { const a = await affixFrom(id); if (a) prefixes.push(a); }
  const suffix = await affixFrom(project.quality?.suffix ?? null);
  const crafted = { by: actor.uuid, name: actor.name, profession: project.trade, project: project.id, generated: null };
  let data;
  if (project.rarity === "common" || !forgeable(base)) {
    data = { name: base.name, type: base.type, img: base.img, system: foundry.utils.deepClone(base.system), flags: { ...(base.flags ?? {}) } };
  } else {
    const signature = await projectSignature(project, base);
    if (signature?.refusal) return { ok: false, words: refusalWords(signature.refusal) };
    const proposal = { base, rarity: project.rarity, prefixes, suffix, floor: false, signature: signature?.signature ?? null };
    const verdict = forgePlan(proposal);
    if (!verdict.ok) return { ok: false, words: verdict.reasons.map(text => refusalWords({ reason: "forge", text })).join(" ") };
    const made = forgeBuild(proposal);
    crafted.generated = { base, prefixes: prefixes.map(a => a.id ?? null).filter(Boolean), prefix: prefixes[0]?.id ?? null, suffix: suffix?.id ?? null, greater: [], signatureKind: proposal.signature?.kind ?? null, rarity: project.rarity };
    data = { name: made.name, type: base.type, img: base.img, system: made.system, flags: { "azeroth-rpg": { grants: made.grants, generated: crafted.generated } } };
  }
  data.system = { ...data.system, equipped: false, container: null };
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { "azeroth-rpg": { [CRAFTED_FLAG]: crafted } }, { inplace: false });
  data._stats = { compendiumSource: recipe.uuid };
  if (!roomFor(actor, data)) return { ok: false, words: refusalWords({ reason: "room" }, { materials }) };
  const [item] = await actor.createEmbeddedDocuments("Item", [data], { azerothIdentify: "known" });
  if (!item) return { ok: false, words: refusalWords({ reason: "room" }, { materials }) };
  return { ok: true, item, words: game.i18n.format("AZEROTH.Profession.Craft.Card.Made", { name: item.name }) };
}

/**
 * A stored project's Signature as `forge.plan` reads it (D-1990): the catalogue's
 * row where it still holds the id (a rebuilt pack's own words), else the row the
 * project stored when it started - never anything typed. `{signature: null}` for none.
 */
async function projectSignature(project, base) {
  const stored = project.quality?.signature ?? null;
  if (!stored) return { signature: null };
  const fresh = resolveCraftSignature({ id: stored.id }, craftCatalogueFor(project.trade, await craftSignatureCatalogue()), base);
  if (fresh.signature) return { signature: { kind: fresh.signature.kind, text: fresh.signature.text, effect: fresh.signature.effect } };
  if (stored.id && stored.kind && stored.text && stored.effect) return { signature: { kind: stored.kind, text: stored.text, effect: stored.effect } };
  return { refusal: { reason: "signatureUnknown" } };
}

/* -------------------------------------------- */
/*  Enchant in place (D-1913, 08 §18)            */
/* -------------------------------------------- */

/**
 * **LAY AN ENCHANTMENT** (08 §18: *Enchanting lays an affix on an item somebody
 * else made*): a project like any other. Judged whole BEFORE anything is spent
 * (the review's M4, D-768's order): an enchanter, the rod carried, downtime, the
 * affix one `enchantChoices` offers for this item at this tier, **the final door
 * `applyAffixInPlace` will ask** (`recipes.mjs#enchantVerdict`: the slot already
 * filled, a Forge-built item the rebuild would strip, `generate`'s own refusal),
 * the rarity the item will have once enchanted within the tier's ceiling, and the
 * materials (`enchantReagents`). **That rarity sets the target** (11 §10: *the item's
 * rarity once enchanted sets the target*; the review's minor 6); the recipe tier is
 * the affix's grade's (08 §18), raised to the rarity's where that is higher.
 *
 * **OR AN ENCHANTER'S SIGNATURE** (08 §18's `### Signatures`; D-2147, the lead: *"Yes"*, on an
 * existing item): `signature` names a row of `ENCHANTER_SIGNATURES` and `affix` is left out.
 * The SAME door and the same project: judged whole first
 * (`enchanter-signatures.mjs#enchanterSignatureVerdict`: Rare or Epic, the row goes on this
 * kind of item, no Signature already, the recipe tier the rarity needs within the enchanter's,
 * room in the item's budget through `forge.mjs#plan`), the materials table's Signature line
 * (`enchanterSignatureReagents`), the project claimed and the reagents spent inside the actor's
 * queue, then the same Craft Tests: no Proficiency, the adjusted total, 05 §3's Easy column at
 * the recipe tier, the item's rarity the target. The Signature is written when the project is
 * delivered (`deliverEnchant`), judged again there.
 *
 * @param {Actor} actor
 * @param {{itemId: string, affix?: object|string|null, signature?: string|null}} o
 */
export async function enchant(actor, { itemId, affix = null, signature = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const materials = await professionMaterials();
  const prof = professionOf(actor);
  const chosen = signature ? null : await affixFrom(affix);
  if (prof.id !== "enchanting") return warn({ reason: "notEnchanter" });
  const closed = downtimeRefusal(downtimeState());
  if (closed) return warn(closed);
  if (!prof.tool) return warn({ reason: "tool", tool: prof.row?.tool ?? null }, { materials });
  const pool = signature ? [] : await affixPool();
  // One judgement for both branches, read again inside the queue: what the project lays, its
  // tier and rarity, its name, and the reagents.
  const judge = () => {
    const item = actor.items.get(itemId) ?? null;
    const tier = actor.professionTier ?? 1;
    // One project an item, in both branches (the phase 4 review): a second, judged against the
    // item as it stands now, would be delivered over the first.
    if (item && enchantPending(projectsOf(actor), item.id)) return { refusal: { reason: "enchantPending" } };
    if (signature) {
      if (!item) return { refusal: { reason: "notRecipe" } };
      const verdict = enchanterSignatureVerdict({ key: signature, item: item.toObject(), tier });
      if (!verdict.ok) return { refusal: verdict };
      return {
        item, rarity: verdict.rarity, tier: verdict.tier, label: ENCHANTER_SIGNATURES[signature].name,
        reagents: enchanterSignatureReagents(verdict.rarity), enchant: { itemId: item.id, signature }
      };
    }
    const offered = item ? enchantChoices({ item, tier, affixes: pool }) : [];
    if (!chosen || !offered.some(a => a.id === chosen.id || a.name === chosen.name)) return { refusal: { reason: "notRecipe" } };
    const verdict = enchantVerdict({ item: item.toObject(), affix: chosen, pool });
    if (!verdict.ok) return { refusal: verdict };
    if (!RARITY_TIER[verdict.rarity] || RARITY_TIER[verdict.rarity] > tier) {
      return { refusal: { reason: "rarityCeiling", rarity: verdict.rarity, ceiling: RARITY_CEILING[Math.min(4, Math.max(1, tier))] } };
    }
    return {
      item, rarity: verdict.rarity, tier: enchantTier(chosen), label: chosen.name,
      reagents: enchantReagents(chosen), enchant: { itemId: item.id, affix: chosen.id ?? chosen.name }
    };
  };
  const first = judge();
  if (first.refusal) return warn(first.refusal, { materials });
  const reagents = first.reagents;
  if (!reagentSpend(actor.items, reagents)) return warn({ reason: "short", lines: shortfall(reagents, materialCounts(actor.items)).filter(l => l.short > 0) }, { materials });
  const started = await professionWrite(actor, async () => {
    const j = judge();
    if (j.refusal) return j;
    const spend = reagentSpend(actor.items, j.reagents);
    if (!spend) return { refusal: { reason: "short", lines: shortfall(j.reagents, materialCounts(actor.items)).filter(l => l.short > 0) } };
    const project = newProject({
      id: foundry.utils.randomID(16), recipe: j.item.uuid,
      name: game.i18n.format("AZEROTH.Profession.Craft.EnchantName", { item: j.item.name, affix: j.label }),
      trade: "enchanting", tier: j.tier, rarity: j.rarity, spent: j.reagents,
      quality: { prefixes: [], suffix: null, signature: null, enchant: j.enchant }
    });
    // CLAIMED BEFORE ANYTHING IS SPENT, then spent in one write, then stored (`startProject`).
    await startProject(actor, project, spend);
    return { project, reagents: j.reagents };
  });
  if (started?.refusal) return warn(started.refusal, { materials });
  const project = started?.project ?? null;
  if (!project) return null;
  await postNoteCard(actor, {
    title: game.i18n.format("AZEROTH.Profession.Craft.Card.Started", { name: project.name }), kind: "craftStarted",
    craft: { project: project.id, trade: "enchanting" },
    lines: [game.i18n.format("AZEROTH.Profession.Craft.Card.Spent", { spent: spentWords(started.reagents ?? reagents, materials) })]
  });
  return project;
}

/**
 * **WHAT A FINISHED ENCHANTMENT LAYS** - an affix through `applyAffixInPlace`, or an Enchanter's
 * Signature written on the item (`enchanter-signatures.mjs#enchanterSignatureUpdate`: the row's
 * sentence as the prose, its descriptor, the budget raised by its cost, the row's key on the
 * item), judged again first, since the item may have changed while the project stood.
 */
async function deliverEnchant(actor, project) {
  const enchantRecord = project.quality.enchant;
  if (enchantRecord.signature) {
    const item = actor.items.get(enchantRecord.itemId) ?? null;
    if (!item) return { ok: false, words: game.i18n.localize("AZEROTH.Profession.Craft.EnchantGone") };
    const verdict = enchanterSignatureVerdict({ key: enchantRecord.signature, item: item.toObject(), tier: actor.professionTier ?? 1 });
    if (!verdict.ok) return { ok: false, words: refusalWords(verdict) };
    const update = enchanterSignatureUpdate({ key: enchantRecord.signature, item: item.toObject() });
    const done = update ? await item.update(update) : null;
    return done ? { ok: true, item: done, words: game.i18n.format("AZEROTH.Profession.Craft.Card.Made", { name: done.name }) }
      : { ok: false, words: game.i18n.localize("AZEROTH.Profession.Craft.EnchantGone") };
  }
  const item = actor.items.get(project.quality.enchant.itemId) ?? null;
  const affix = await affixFrom(project.quality.enchant.affix);
  if (!item || !affix) return { ok: false, words: game.i18n.localize("AZEROTH.Profession.Craft.EnchantGone") };
  // Judged again, as the Signature branch is: the item may have taken a Signature or the
  // other slot's affix while the project stood (the phase 4 review).
  const verdict = enchantVerdict({ item: item.toObject(), affix, pool: await affixPool() });
  if (!verdict.ok) return { ok: false, words: refusalWords(verdict) };
  const { applyAffixInPlace } = await import("../applications/affix-dialog.mjs");
  const done = await applyAffixInPlace(item, affix);
  return done ? { ok: true, item: done, words: game.i18n.format("AZEROTH.Profession.Craft.Card.Made", { name: done.name }) }
    : { ok: false, words: game.i18n.localize("AZEROTH.Profession.Craft.EnchantGone") };
}

/* -------------------------------------------- */
/*  Gather (D-1915)                              */
/* -------------------------------------------- */

/** One gathered unit of a material as the bag law reads it: its identifier, its published weight. */
function unitData(identifier, unit, quantity = 1) {
  return { name: unit?.name ?? identifier, type: "gear", system: { identifier, quantity, weight: unit?.weight ?? null, equipped: false, container: null } };
}

/**
 * **WHAT THE GATHER PANEL DRAWS AND THE DOOR JUDGES** for one biome node: the
 * family, the skill, the parts, the DC and the refusal. Downtime never gates
 * gathering (the plan's M8). The room is judged with the material's own weight
 * (the review's minor 2: a 10 lb ore takes a well, a herb stacks twenty to one).
 */
export async function gatherSnapshot(actor, { biome, material } = {}) {
  const prof = professionOf(actor);
  const family = prof.row?.gathers?.family ?? null;
  const skill = family ? GATHER_SKILL[family] : null;
  const node = family && material ? nodeOf({ biome, family, material }) : null;
  const materials = await professionMaterials();
  const unit = node ? materials[node.material] : null;
  const room = unit ? roomFor(actor, unitData(node.material, unit)) : true;
  const refusal = gatherRefusal({ profession: prof.id, toolCarried: Boolean(prof.tool), node, tier: actor?.professionTier ?? 1, room });
  return {
    family, skill, node, refusal, words: refusal ? refusalWords(refusal, { materials }) : "",
    dc: node ? gatherDC(node.tier) : null,
    parts: skill ? gatherParts(actor, skill, prof.tool) : [],
    ok: !refusal
  };
}

/**
 * **GATHER** (D-1915): the profession's tool is asked for, then the dialog, then
 * a Gathering Test against the material tier's Standard DC; a success puts 1 +
 * SL units into the bags, as many as fit. Answers `{units, outcome}` or null.
 *
 * @param {Actor} actor
 * @param {{biome: string, material: string, event?: Event|null}} o
 */
export async function gather(actor, { biome, material, event = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const snap = await gatherSnapshot(actor, { biome, material });
  if (!snap.ok) return warn(snap.refusal, { materials: await professionMaterials() });
  const materials = await professionMaterials();
  const name = materials[snap.node.material]?.name ?? snap.node.material;
  const title = game.i18n.format("AZEROTH.Profession.Gather.Title", { name });
  const rolled = await rollProfessionTest(actor, { title, dc: snap.dc, parts: snap.parts, skill: snap.skill, event, gathering: true });
  if (!rolled) return null;
  const units = yieldFor(rolled.outcome.sl, rolled.outcome.success);
  const lines = [];
  if (units > 0) lines.push(await intoBags(actor, snap.node.material, units, materials));
  else lines.push({ name: game.i18n.localize("AZEROTH.Profession.Gather.Yield"), text: game.i18n.localize("AZEROTH.Profession.Gather.Nothing") });
  await postTestCard(actor, { title, subtitle: game.i18n.localize(AZEROTH.biomes?.[biome] ?? biome ?? ""), roll: rolled.roll, outcome: rolled.outcome, lines, kind: "gather", craft: { biome, material: snap.node.material, units } });
  return { units, outcome: rolled.outcome };
}

/**
 * Put N units of a gear material into the bags, inside the actor's queue (two
 * yields onto one stack would each write the count they read): onto a stack of
 * the same thing where one stands loose and the bag law takes the larger count,
 * else a new stack from the pack of AS MANY AS FIT (the review's minor 2: a full
 * bag used to lose the whole yield), the rest said in words. Answers the card line.
 */
async function intoBags(actor, identifier, units, materials) {
  return professionWrite(actor, async () => {
    const label = game.i18n.localize("AZEROTH.Profession.Gather.Yield");
    const entry = materials[identifier];
    const stack = actor.items.filter(i => i.type === "gear" && i.system?.identifier === identifier && i.system?.equipped !== true)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
    if (stack) {
      const before = Number(stack.system.quantity ?? 1) || 1;
      await stack.update({ "system.quantity": before + units });
      if ((Number(actor.items.get(stack.id)?.system?.quantity) || 0) === before + units) {
        return { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.Into", { n: units, name: entry?.name ?? identifier }) };
      }
    }
    const doc = entry?.uuid ? await fromUuid(entry.uuid) : null;
    if (!doc) return { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.Lost", { n: units, name: entry?.name ?? identifier }) };
    let fit = units;
    while (fit > 0 && !roomFor(actor, unitData(identifier, entry, fit))) fit--;
    if (fit <= 0) return { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.NoRoom", { n: units, name: entry?.name ?? identifier }) };
    const data = doc.toObject();
    delete data._id;
    data.system = { ...data.system, quantity: fit, equipped: false, container: null };
    data._stats = { compendiumSource: doc.uuid };
    const [made] = await actor.createEmbeddedDocuments("Item", [data]);
    if (!made) return { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.NoRoom", { n: units, name: entry?.name ?? identifier }) };
    return fit < units
      ? { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.Partial", { n: fit, name: made.name, lost: units - fit }) }
      : { name: label, text: game.i18n.format("AZEROTH.Profession.Gather.Into", { n: units, name: made.name }) };
  });
}

/* -------------------------------------------- */
/*  Harvest (D-1915, D-1955)                     */
/* -------------------------------------------- */

/** A creature as `harvestOn` reads it: type, tier, defeated, the harvests already made. */
export function harvestSnapshotOf(target) {
  const actor = target?.actor ?? target ?? null;
  const sys = actor?.system ?? {};
  const statuses = actor?.statuses ?? new Set();
  const defeated = (Number(sys.health?.value) || 0) <= 0 || statuses.has?.("dead") || statuses.has?.("defeated");
  return {
    type: actor?.type === "npc" ? (sys.creatureType ?? null) : null,
    tier: Math.trunc(Number(sys.tier)) || 1,
    defeated: Boolean(defeated),
    done: Array.isArray(actor?.getFlag?.("azeroth-rpg", HARVESTED_FLAG)) ? actor.getFlag("azeroth-rpg", HARVESTED_FLAG) : []
  };
}

/**
 * **THE MATERIAL THE GM NAMES** (11 §11: *a material of that family at the
 * creature's tier, which the GM names from section 12*; the review's minor 3).
 * One candidate names itself; several are asked through the one chooser
 * (`workflows.chooseOption`, D-673), before anything is rolled. Answers the
 * identifier, `""` where none stands at that tier (the card says the GM names
 * it), or null where the chooser was dismissed.
 */
async function harvestMaterialFor(actor, kind, tier, materials, named = null) {
  const candidates = harvestCandidates(kind, tier, materials);
  const sole = harvestMaterial(kind, tier, materials, named);
  if (sole) return sole;
  if (!candidates.length) return "";
  const family = game.i18n.localize(AZEROTH.materialFamilies?.[HARVEST[kind]?.family] ?? HARVEST[kind]?.family ?? "");
  const answer = await game.system.azeroth.workflows.chooseOption(actor, candidates.map(id => ({
    key: id, label: materials[id]?.name ?? id, img: materials[id]?.img ?? null, description: ""
  })), null, { prompt: game.i18n.format("AZEROTH.Profession.Harvest.Choose", { family }) });
  const id = answer?.key ?? null;
  return id && candidates.includes(id) ? id : null;
}

/**
 * **THE HARVEST CLAIMED BEFORE THE DIE** (the review's minor 1): inside the
 * creature's queue, the mark written FIRST, on this client where it owns the
 * creature and on the active GM's through `HARVEST_QUERY` where it does not. The
 * GM's answer is honoured: `already` and `living` refuse in words, and a query
 * that fails or times out refuses rather than throwing after a roll. Answers
 * true where the claim holds.
 */
async function claimHarvest(creature, kind) {
  const refused = reason => { ui.notifications?.warn(refusalWords({ reason })); return false; };
  return creatureWrite(creature, async () => {
    const snap = harvestSnapshotOf(creature);
    if (snap.done.includes(kind)) return refused("harvested");
    if (!snap.defeated) return refused("living");
    if (creature.isOwner) {
      await creature.setFlag("azeroth-rpg", HARVESTED_FLAG, [...new Set([...snap.done, kind])].sort());
      return true;
    }
    const gm = game.users?.activeGM ?? null;
    if (!gm) return refused("noGM");
    let answer = null;
    try {
      answer = await gm.query(HARVEST_QUERY, { actorUuid: creature.uuid, kind }, { timeout: 30000 });
    } catch (err) {
      console.warn("azeroth-rpg | the harvest mark was not answered", err);
      return refused("harvestFailed");
    }
    if (answer?.ok === true) return true;
    return refused(answer?.reason === "already" ? "harvested" : answer?.reason === "living" ? "living" : "harvestFailed");
  });
}

/**
 * **SKIN, BUTCHER OR SALVAGE A DEFEATED CREATURE** (D-1915, D-1955; 11 §11): a
 * Gathering Test at the Standard DC of the creature's tier, each made once on
 * a creature, a creature above your tier out of reach. Judged first
 * (`gmAbsentFor` among the refusals), the material named by the GM through the
 * one chooser where several stand, then the dialog, then the harvest CLAIMED on
 * the creature (`claimHarvest`) before the die is evaluated - so two harvesters
 * pressing at once harvest once, and a dismissed dialog claims nothing.
 *
 * @param {Actor} actor
 * @param {{target: Token|TokenDocument|Actor, kind: "skin"|"butcher"|"salvage", material?: string|null, event?: Event|null}} o
 */
export async function harvest(actor, { target, kind, material = null, event = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const creature = target?.actor ?? target ?? null;
  const prof = professionOf(actor);
  const snap = harvestSnapshotOf(creature);
  if (!prof.tool) return warn({ reason: "tool", tool: prof.row?.tool ?? null }, { materials: await professionMaterials() });
  const offered = harvestOn({ ...snap, harvested: snap.done.includes(kind) }, prof.id).find(h => h.kind === kind) ?? null;
  if (!offered) return warn({ reason: "harvestNone" });
  if (offered.tier > (actor.professionTier ?? 1)) return warn({ reason: "harvestTier", tier: offered.tier });
  if (gmAbsentFor({ owned: [creature?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    return warn({ reason: "noGM" });
  }
  const materials = await professionMaterials();
  const id = await harvestMaterialFor(actor, kind, offered.tier, materials, material);
  if (id === null) return null;
  const title = game.i18n.format("AZEROTH.Profession.Harvest.Card.Title", { verb: game.i18n.localize(AZEROTH.harvestKinds?.[kind] ?? kind), name: creature?.name ?? "" });
  // Once on a creature, success or failure (11 §11): claimed after the dialog, before the die.
  const rolled = await rollProfessionTest(actor, {
    title, dc: offered.dc, parts: gatherParts(actor, offered.skill, prof.tool), skill: offered.skill, event, gathering: true,
    claim: () => claimHarvest(creature, kind)
  });
  if (!rolled) return null;
  const units = yieldFor(rolled.outcome.sl, rolled.outcome.success);
  const lines = [];
  if (units > 0 && id) lines.push(await intoBags(actor, id, units, materials));
  else lines.push({ name: game.i18n.localize("AZEROTH.Profession.Gather.Yield"), text: game.i18n.localize(units > 0 ? "AZEROTH.Profession.Harvest.Card.TableNames" : "AZEROTH.Profession.Harvest.Card.Spoiled") });
  await postTestCard(actor, { title, subtitle: actor.name, roll: rolled.roll, outcome: rolled.outcome, lines, kind: "harvest", craft: { kind, creature: creature?.uuid ?? null, units, material: id || null } });
  return { units, outcome: rolled.outcome };
}

/**
 * The GM's half of the mark (`HARVEST_QUERY`): inside the creature's queue on the
 * GM's client, the creature found, judged again as defeated and as not yet
 * harvested this way, the one kind added. Never more than the request names, and
 * a second claim for the same kind is refused (`already`), so two players'
 * queries harvest once.
 */
export async function harvestQueryHandler(data = {}, { user = null } = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "authority" };
  const creature = typeof data.actorUuid === "string" ? await fromUuid(data.actorUuid) : null;
  const actor = creature?.actor ?? creature;
  if (actor?.documentName !== "Actor" || !Object.hasOwn(AZEROTH.harvestKinds ?? {}, data.kind)) return { ok: false, reason: "request" };
  return creatureWrite(actor, async () => {
    const snap = harvestSnapshotOf(actor);
    if (!snap.defeated) return { ok: false, reason: "living" };
    if (snap.done.includes(data.kind)) return { ok: false, reason: "already" };
    await actor.setFlag("azeroth-rpg", HARVESTED_FLAG, [...new Set([...snap.done, data.kind])].sort());
    return { ok: true, by: user?.id ?? null };
  });
}

/* -------------------------------------------- */
/*  Disenchant (D-1933)                          */
/* -------------------------------------------- */

/**
 * **DISENCHANT** (11 §11; D-1933): an enchanter breaks an Uncommon, Rare or
 * Epic item it carries with an Arcana Gathering Test at the rarity's DC. **The
 * item is destroyed whether the Test succeeds or fails**; a success yields 1 +
 * SL of the essence. Judged whole before the dialog opens, and **the essence is
 * given only once the item is gone** (the review's minor 4: a delete the bag
 * law refuses used to yield anyway and the card said *destroyed*).
 *
 * @param {Actor} actor
 * @param {{itemId: string, event?: Event|null}} o
 */
export async function disenchant(actor, { itemId, event = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const prof = professionOf(actor);
  const item = actor.items.get(itemId) ?? null;
  const materials = await professionMaterials();
  const refusal = disenchantRefusal({ profession: prof.id, toolCarried: Boolean(prof.tool), item });
  if (refusal) return warn(refusal, { materials });
  const test = disenchantOf(item);
  const title = game.i18n.format("AZEROTH.Profession.Disenchant.Title", { name: item.name });
  const rolled = await rollProfessionTest(actor, { title, dc: test.dc, parts: gatherParts(actor, DISENCHANT_SKILL, prof.tool), skill: DISENCHANT_SKILL, event, gathering: true });
  if (!rolled) return null;
  const name = item.name;
  // Destroyed either way (11 §11), read again at the write inside the queue: an item gone
  // meanwhile (a second press) yields nothing, and a delete that did not land yields nothing.
  const broken = await professionWrite(actor, async () => {
    if (!actor.items.has(itemId)) return { gone: false, missing: true };
    try {
      await actor.deleteEmbeddedDocuments("Item", [itemId]);
    } catch (err) {
      console.warn("azeroth-rpg | the disenchanted item was not deleted", err);
    }
    return { gone: !actor.items.has(itemId), missing: false };
  });
  if (broken?.missing) return warn({ reason: "notItem" });
  const units = broken?.gone ? yieldFor(rolled.outcome.sl, rolled.outcome.success) : 0;
  const lines = broken?.gone
    ? [{ name: game.i18n.localize("AZEROTH.Profession.Disenchant.Gone"), text: game.i18n.format("AZEROTH.Profession.Disenchant.Destroyed", { name }) }]
    : [{ name: game.i18n.localize("AZEROTH.Profession.Gather.Yield"), text: game.i18n.format("AZEROTH.Profession.Disenchant.NotGone", { name }) }];
  if (units > 0) lines.push(await intoBags(actor, test.material, units, materials));
  await postTestCard(actor, { title, subtitle: actor.name, roll: rolled.roll, outcome: rolled.outcome, lines, kind: "disenchant", craft: { item: name, units } });
  return { units, outcome: rolled.outcome };
}

/* -------------------------------------------- */
/*  The profession itself (the review's M9)      */
/* -------------------------------------------- */

/** One profession refusal in words (`AZEROTH.professionRefusals`), as a warning. */
function warnProfession(refusal) {
  const key = AZEROTH.professionRefusals?.[refusal?.reason] ?? null;
  ui.notifications?.warn(key ? game.i18n.format(key, refusal) : String(refusal?.reason ?? ""));
  return null;
}

/**
 * **CHOOSE A PROFESSION** (D-1903; the plan's M1): a profession document by uuid
 * (a pack copy or a world item), judged a profession, embedded in one create.
 * `AzerothActor#_onCreateDescendantDocuments` makes it THE profession, replaces
 * any other with the higher Rank (03 §4) and clears the owed flag.
 *
 * @param {Actor} actor
 * @param {{uuid: string}} o
 * @returns {Promise<Item|null>}
 */
export async function chooseProfession(actor, { uuid } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  const doc = uuid ? await fromUuid(uuid) : null;
  if (doc?.type !== "profession") return warnProfession({ reason: "notProfession" });
  const data = doc.toObject();
  delete data._id;
  data._stats = { compendiumSource: doc.uuid };
  const [made] = await actor.createEmbeddedDocuments("Item", [data]);
  return made ?? null;
}

/**
 * **PICK A TIER'S PROFESSION SKILLS** (D-1906): judged whole by `pickPlan` (each
 * skill through `pickRefusal` against what is stored and what came before it),
 * written to the profession item in one update, inside the actor's queue so two
 * presses cannot both add a "second" pick.
 *
 * @param {Actor} actor
 * @param {{tier: number, skills?: string[], skill?: string}} o
 * @returns {Promise<string[]|null>}  the tier's picks as written
 */
export async function pickProfessionSkill(actor, { tier, skills = null, skill = null } = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  if (!actor.professionItem) return warnProfession({ reason: "noProfession" });
  return professionWrite(actor, async () => {
    const item = actor.professionItem;
    if (!item) return warnProfession({ reason: "noProfession" });
    const t = Math.trunc(Number(tier));
    const plan = pickPlan({ profession: item.system, tier: actor.professionTier, picks: item.system?.picks, pickTier: t, skills: skills ?? (skill ? [skill] : []) });
    if (plan.refusal) return warnProfession(plan.refusal);
    await item.update({ [`system.picks.${t}`]: plan.picks });
    return plan.picks;
  });
}

/**
 * **RAISE THE PROFESSION'S RANK** (D-1905): always the cheap rate
 * (`xp.mjs#professionRankCost`), judged off the purse by `rankRaisePlan` and
 * ledgered in the sheet's own shape (`kind: "profession"`), inside the actor's
 * queue so a double press buys one Rank once. The Rank is written before the XP:
 * a write lost between them leaves a Rank unpaid for (a GM settles it from the
 * ledger), never XP spent for no Rank.
 *
 * @param {Actor} actor
 * @returns {Promise<number|null>}  the Rank reached
 */
export async function raiseProfessionRank(actor) {
  if (actor?.type !== "character" || !actor.isOwner) return null;
  return professionWrite(actor, async () => {
    const item = actor.professionItem;
    if (!item) return warnProfession({ reason: "noProfession" });
    const plan = rankRaisePlan({ rank: item.system?.rank, xp: actor.system?.xp ?? {} });
    if (plan.refusal) return warnProfession(plan.refusal);
    await item.update({ "system.rank": plan.rank });
    const ledger = foundry.utils.deepClone(actor.getFlag("azeroth-rpg", "xpLedger") ?? []);
    ledger.push({
      amount: plan.cost,
      label: game.i18n.format("AZEROTH.Profession.Sheet.Rank.Ledger", { profession: item.name, rank: plan.rank }),
      at: Date.now(),
      kind: "profession"
    });
    await actor.update({ "system.xp.spent": (actor.system.xp?.spent ?? 0) + plan.cost, "flags.azeroth-rpg.xpLedger": ledger });
    return plan.rank;
  });
}
