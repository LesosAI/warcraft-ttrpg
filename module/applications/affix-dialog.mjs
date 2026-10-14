/**
 * Generate an affixed item (08 SS6, D-377): a base, a prefix, a suffix, and
 * `rules/affixes.mjs#generate` builds the instance. The generator's first
 * caller. GM only, from the browser's Affixes category.
 *
 * The grants ride on `flags.azeroth-rpg.grants`, not the schema - the item
 * models carry no field for them and Phases 0-5 add none - and Ward is
 * derived from those flags at data preparation (rules/ward.mjs).
 */

import { generate } from "../rules/affixes.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/affix.hbs";

/** An affix document as the plain shape `generate` reads. */
export function affixOf(doc) {
  return { id: doc.id, ...(doc.getFlag("azeroth-rpg", "affix") ?? {}) };
}

/** The affixes in the pack, as the plain shapes `generate` reads. */
async function loadAffixes() {
  const pack = game.packs.get("azeroth-rpg.affixes");
  if (!pack) return [];
  const docs = await pack.getDocuments();
  return docs.map(affixOf).filter(a => a.kind === "prefix" || a.kind === "suffix");
}

/** One affix from the pack by id, as the plain shape. */
async function affixById(id) {
  if (!id) return null;
  const doc = await game.packs.get("azeroth-rpg.affixes")?.getDocument(id);
  return doc ? affixOf(doc) : null;
}

/**
 * Apply an affix to an existing item IN PLACE (the browser row dropped on
 * the item's sheet). One prefix and one suffix at most; a second of the
 * same kind is refused rather than replaced.
 *
 * The un-affixed base is stashed on the first application and every later
 * one regenerates from it, so `priceFor`, `nameFor`, a prefix's trait and
 * the grants can never compound - regenerating from the affixed item would
 * multiply the rarity's price multiplier twice.
 */
export async function applyAffixInPlace(item, affix) {
  if (!item || !["weapon", "armor", "gear"].includes(item.type)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Affix.NotABase"));
    return null;
  }
  if (!item.isOwner) return null;
  const generated = foundry.utils.deepClone(item.getFlag("azeroth-rpg", "generated") ?? {});
  if (generated[affix.kind]) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Affix.AlreadyHas", { name: item.name, kind: affix.kind }));
    return null;
  }
  const base = generated.base ?? { name: item.name, type: item.type, system: item.system.toObject() };
  const prefix = affix.kind === "prefix" ? affix : await affixById(generated.prefix);
  const suffix = affix.kind === "suffix" ? affix : await affixById(generated.suffix);
  const result = generate({ base, prefix, suffix });
  if (!result.ok) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Affix.Refused", { reason: result.reason }));
    return null;
  }
  const { grants = [], ...system } = result.item.system;
  await item.update({
    name: result.item.name,
    system,
    "flags.azeroth-rpg.grants": grants,
    "flags.azeroth-rpg.generated": { base, prefix: prefix?.id ?? null, suffix: suffix?.id ?? null }
  });
  return item;
}

/** Base candidates: the actor's own weapons, suits and gear, else the world's. */
function loadBases(actor) {
  const source = actor ? actor.items : game.items;
  return source.filter(i => ["weapon", "armor", "gear"].includes(i.type) && !i.getFlag("azeroth-rpg", "affix"));
}

/**
 * Open the dialog; on Generate, create the item on the actor (or in the
 * world) and return it. Resolves null on dismiss or on a refused combination.
 */
export async function generateAffixedItem({ actor = null } = {}) {
  if (!game.user.isGM) return null;
  const { DialogV2 } = foundry.applications.api;
  const { renderTemplate } = foundry.applications.handlebars;
  const affixes = await loadAffixes();
  const bases = loadBases(actor);
  if (!bases.length) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Affix.NoBase"));
    return null;
  }
  const content = await renderTemplate(TEMPLATE, {
    bases: bases.map(b => ({ id: b.id, name: b.name, type: b.type })),
    prefixes: affixes.filter(a => a.kind === "prefix"),
    suffixes: affixes.filter(a => a.kind === "suffix")
  });
  const choice = await DialogV2.wait({
    id: "azeroth-affix-dialog",
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: game.i18n.localize("AZEROTH.Affix.Title") },
    position: { width: 440 },
    content,
    rejectClose: false,
    buttons: [{
      action: "generate",
      label: "AZEROTH.Affix.Generate",
      default: true,
      callback: (event, button) => ({
        base: button.form.elements.base?.value,
        prefix: button.form.elements.prefix?.value || null,
        suffix: button.form.elements.suffix?.value || null
      })
    }]
  });
  if (!choice) return null;

  const base = bases.find(b => b.id === choice.base);
  const prefix = affixes.find(a => a.id === choice.prefix) ?? null;
  const suffix = affixes.find(a => a.id === choice.suffix) ?? null;
  const result = generate({ base: { name: base.name, type: base.type, system: base.system.toObject() }, prefix, suffix });
  if (!result.ok) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Affix.Refused", { reason: result.reason }));
    return null;
  }
  const { grants = [], ...system } = result.item.system;
  const data = {
    name: result.item.name,
    type: result.item.type,
    img: base.img,
    system,
    flags: { "azeroth-rpg": { grants, generated: { base: base.id, prefix: prefix?.id ?? null, suffix: suffix?.id ?? null } } }
  };
  const [item] = actor
    ? await actor.createEmbeddedDocuments("Item", [data])
    : await Item.createDocuments([data]);
  item?.sheet?.render({ force: true });
  return item ?? null;
}
