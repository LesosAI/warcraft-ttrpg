/**
 * **THE ENCHANTER'S SIGNATURES** (08 §18, `### Signatures`; D-2147, D-2148;
 * CLASS-ITEMS-AND-ENCHANTS-2026-11 phase 4). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * 08 §18: *Enchanting also lays a Signature, from the table below. A named or found item
 * may print one. An enchanter lays one on a Rare or Epic weapon, suit, shield or worn
 * thing that carries no Signature, at the recipe tier its rarity needs. Section 20's table
 * costs it, and the item's budget must have room for it. It takes the Signature line of the
 * materials table.* And 08 §18's crafting rule: a crafter who MAKES an item picks its
 * Signature from those 08 prints on items of the same type; an Enchanting crafter may also
 * pick from this table (`craft-signatures.mjs#craftCatalogueFor`).
 *
 * `ENCHANTER_SIGNATURES` is the hand table, beside `signatures.mjs#BOOK_SIGNATURES`: each
 * row carries the sentence exactly as 08 §18 prints it, what it goes on, its cost and its
 * hand-reviewed descriptor, so what an item SAYS and what it DOES cannot part (D-692).
 * `enchanter-signatures.test.mjs` holds the table to the chapter in both directions, read
 * off the parser's `enchanterSignatureRows()`, and each descriptor to its sentence number
 * for number.
 *
 * | Row | Descriptor | Reader |
 * |---|---|---|
 * | Crusader | `onHit.healPerTier` 1, `per: "round"` | the attack door's heal, the tier the bearer's |
 * | Lifestealing | `onHit` SL 2, 2 Shadow, `drain` | the typed second amount (Ward applies), then the drain off its part |
 * | Unholy Weapon | `onHit` SL 2, `weaponCut` 2 | laid on the creature struck (`WEAPON_CUT_FLAG`), read at its own weapon blows |
 * | Icy Chill | `onHit` SL 2, Slowed to the end of its next turn | the card's Inflict button, as every §20 condition |
 * | Demonslaying | gated on a demon, `onHit` SL 3, Stunned to the end of its next turn | the same |
 * | Healing | `healingBonus` 1 | the Vestments of Transcendence's own door |
 * | Mana Regeneration | `tick.mana` 1 | the turn-start tick every worn mp5 rides |
 * | Minor Speed | the grant `+5 Speed` | `CharacterData`'s worn-grant Speed part (08 §20's grant grammar) |
 * | Gathering | the grant `A Boon on Gathering Tests` | the roll dialog's worn-Test-Boon line, on a Gathering Test |
 */

import { gate, hasSignature, onHit, standing, tick } from "./signatures.mjs";
import { SIGNATURE_KINDS, plan as forgePlan } from "./forge.mjs";
import { RARITY_TIER, SURCHARGE, isClassicFind } from "./recipes.mjs";

/**
 * What a row goes on, in 08 §18's own words (the `Goes on` column), keyed for
 * `AZEROTH.enchanterGoesOn` and `goesOnItem`.
 */
export const GOES_ON_WORDS = Object.freeze({
  "Weapon": "weapon",
  "Suit or worn thing": "suitOrWorn",
  "Worn thing on the feet": "feet",
  "Worn thing on the hands": "hands"
});

/** The worn slots 08 §11 names (`AZEROTH.wornSlots`), held here so this module stays pure. */
const WORN_SLOTS = Object.freeze(["head", "neck", "shoulder", "back", "clothing", "tabard", "wrist", "hands", "waist", "legs", "feet", "finger", "trinket"]);

/** One row of the table. `sentence` is 08 §18's Effect cell exactly, its bold marks included. */
const row = (name, goesOn, cost, sentence, effect) => Object.freeze({ name, goesOn, cost, sentence, effect });

/**
 * **08 §18's NINE**, keyed by slug, in the chapter's order. Every descriptor is written
 * with an existing key where one says exactly what the sentence says, and a new one where
 * none does (`onHit.healPerTier`, `onHit.drain`, `onHit.weaponCut`, D-2165).
 */
export const ENCHANTER_SIGNATURES = Object.freeze({
  // *The first time each round you hit with it, you regain Health equal to your tier.* The
  // once a round is 08 §20's `per` (Dal'Rend's own limit, `spendLimitedRows`); the tier is the
  // bearer's, read at the attack door.
  crusader: row("Crusader", "weapon", 2,
    "The first time each round you hit with it, you regain Health equal to your tier",
    onHit({ onHit: { healPerTier: 1, per: "round" } })),
  // *On a hit at SL 2, the target takes 2 Shadow damage, and Ward applies. You regain Health
  // equal to the damage it takes.* The 2 Shadow is a typed second amount the target's Shadow
  // Ward meets (D-777); the drain is what that amount came to after it.
  lifestealing: row("Lifestealing", "weapon", 2,
    "On a hit at SL 2, the target takes 2 Shadow damage, and Ward applies. You regain Health equal to the damage it takes",
    onHit({ onHit: { sl: 2, damage: { amount: 2, type: "shadow" }, drain: true } })),
  // *On a hit at SL 2, each of the target's weapon attacks deals 2 less damage until the end of
  // its next turn.* Withering Contempt's form (D-2147), laid on the creature struck.
  "unholy-weapon": row("Unholy Weapon", "weapon", 2,
    "On a hit at SL 2, each of the target's weapon attacks deals 2 less damage until the end of its next turn",
    onHit({ onHit: { sl: 2, weaponCut: 2 } })),
  "icy-chill": row("Icy Chill", "weapon", 2,
    "On a hit at SL 2, the target is **Slowed** until the end of its next turn",
    onHit({ onHit: { sl: 2, condition: { id: "slowed", until: "endOfNextTurn" } } })),
  // Gated on the creature struck, so 08 §20's gated row costs it 1.
  demonslaying: row("Demonslaying", "weapon", 1,
    "On a hit at SL 3 against a demon, the demon is **Stunned** until the end of its next turn",
    onHit({ gates: [gate("creatureType", "demon")], onHit: { sl: 3, condition: { id: "stunned", until: "endOfNextTurn" } } })),
  // The Vestments of Transcendence's own sentence and key, at 1 and ungated.
  healing: row("Healing", "suitOrWorn", 2,
    "You restore 1 additional Health with every spell that restores any",
    standing({ healingBonus: 1 })),
  "mana-regeneration": row("Mana Regeneration", "suitOrWorn", 2,
    "You regain 1 Mana at the start of each of your turns",
    tick({ tick: { mana: 1 } })),
  // 08 §20's grant grammar already says this (`grants.mjs#parseGrant`: `+N Speed`, in feet),
  // and `CharacterData` adds it as a Speed part beside Hunter's Stride. The lead: *"Keep Minor Speed."*
  "minor-speed": row("Minor Speed", "feet", 2,
    "Your Speed rises by 5 feet",
    standing({ grants: ["+5 Speed"] })),
  // A Boon on a KIND of Test (`AZEROTH.grantTests.gathering`), the roll dialog's worn line.
  gathering: row("Gathering", "hands", 2,
    "You have a Boon on Gathering Tests",
    standing({ grants: ["A Boon on Gathering Tests"] }))
});

/** A row's sentence as the prose an item stores: one paragraph, bold runs as `<strong>`, a full stop. */
export function enchanterSignatureHtml(key) {
  const r = ENCHANTER_SIGNATURES[key];
  if (!r) return "";
  const body = r.sentence.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return `<p>${body}.</p>`;
}

/**
 * The `forge.mjs#SIGNATURE_KINDS` key that costs what the row costs (08 §20's table). Stamped as
 * `generated.signatureKind` on a Forge-built item, where it records ONLY the cost the Forge's
 * budget reads: an Enchanter's row is never really "gated" or "ungated" in the §20 sense, and
 * the row itself is `flags.azeroth-rpg.enchanterSignature`.
 */
export function enchanterKind(key) {
  const r = ENCHANTER_SIGNATURES[key];
  if (!r) return null;
  return Object.entries(SIGNATURE_KINDS).find(([, v]) => v.cost === r.cost)?.[0] ?? null;
}

/**
 * **WHETHER A ROW GOES ON AN ITEM** (the `Goes on` column). A weapon is a weapon; a suit is
 * armor that is no shield; a worn thing is gear in one of 08 §11's worn slots; *on the feet*
 * and *on the hands* are those slots alone. Pure.
 *
 * @param {string} goesOn  a `GOES_ON_WORDS` value
 * @param {{type?: string, system?: object}} item
 */
export function goesOnItem(goesOn, item) {
  const type = item?.type ?? null;
  const sys = item?.system ?? {};
  const worn = type === "gear" && WORN_SLOTS.includes(sys.slot);
  if (goesOn === "weapon") return type === "weapon";
  if (goesOn === "suitOrWorn") return (type === "armor" && sys.shield !== true) || worn;
  if (goesOn === "feet") return worn && sys.slot === "feet";
  if (goesOn === "hands") return worn && sys.slot === "hands";
  return false;
}

/** Whether an item already carries a Signature: its prose, or a descriptor that does anything. */
export function carriesSignature(item) {
  const sys = item?.system ?? {};
  return Boolean(String(sys.signature ?? "").replace(/<[^>]+>/g, "").trim()) || hasSignature(sys.signatureEffect ?? null);
}

/** What laying one consumes (08 §18's materials table, *A Signature*): 1 Greater magic essence, or 1 Large brilliant shard on an Epic. */
export function enchanterSignatureReagents(rarity) {
  return [{ identifier: rarity === "epic" ? SURCHARGE.shard : SURCHARGE.greater, count: 1 }];
}

/**
 * **THE ENCHANTER'S SIGNATURE, JUDGED WHOLE** (08 §18; D-768's order): every reason a
 * Signature may not be laid on this item, before anything is spent, as a craft refusal code
 * (`AZEROTH.craftRefusals`):
 *
 * - `signatureUnknown`: no such row;
 * - `sigRarity`: the item is not Rare or Epic;
 * - `sigGoesOn`: the row does not go on this kind of item (`goesOn` names what it goes on);
 * - `sigHeld`: the item already carries a Signature;
 * - `rarityCeiling`: the recipe tier the rarity needs (3 a Rare, 4 an Epic) is above the enchanter's;
 * - `sigBudget`: the item's budget has no room for the cost (`forge.mjs#plan`, the same judgement
 *   the Forge makes; a found item reads the found band, D-2167).
 *
 * On success: `{ok: true, key, kind, cost, rarity, tier}`, `tier` the recipe tier.
 *
 * @param {{key: string, item: {name?: string, type: string, system: object, flags?: object}, tier?: number}} o
 */
export function enchanterSignatureVerdict({ key, item, tier = 1 } = {}) {
  const r = ENCHANTER_SIGNATURES[key] ?? null;
  if (!r) return { ok: false, reason: "signatureUnknown" };
  if (!item) return { ok: false, reason: "notRecipe" };
  const rarity = item.system?.rarity ?? "common";
  if (rarity !== "rare" && rarity !== "epic") return { ok: false, reason: "sigRarity" };
  if (!goesOnItem(r.goesOn, item)) return { ok: false, reason: "sigGoesOn", goesOn: r.goesOn };
  if (carriesSignature(item)) return { ok: false, reason: "sigHeld" };
  const recipe = RARITY_TIER[rarity];
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  if (recipe > t) return { ok: false, reason: "rarityCeiling", rarity, ceiling: { 1: "common", 2: "uncommon", 3: "rare", 4: "epic" }[t] };
  const kind = enchanterKind(key);
  // The item as it stands is the base: its stored budget is what it has spent, and the Signature's
  // cost is added to that (`plan`'s own spend). Nothing else is proposed, so only the budget and the
  // Signature's own rules can refuse.
  const base = { name: item.name ?? "", type: item.type, system: item.system };
  const verdict = forgePlan({ base, rarity, signature: { kind, text: enchanterSignatureHtml(key), effect: r.effect }, floor: false, found: isClassicFind(item) });
  if (!verdict.ok) {
    const room = verdict.band ? Math.max(0, verdict.band.hi - (Number(item.system?.budget) || 0)) : 0;
    return { ok: false, reason: "sigBudget", cost: r.cost, room };
  }
  return { ok: true, key, kind, cost: r.cost, rarity, tier: recipe };
}

/**
 * The rows the profession window lists for an item, every one of them, each with its verdict:
 * a row the item cannot take is greyed with its reason beside it, never hidden (the plan's
 * step 2). In the chapter's order.
 *
 * @returns {Array<{key: string, name: string, cost: number, sentence: string, goesOn: string, ok: boolean, refusal: object|null}>}
 */
export function enchanterSignatureRowsFor({ item = null, tier = 1 } = {}) {
  return Object.entries(ENCHANTER_SIGNATURES).map(([key, r]) => {
    const v = item ? enchanterSignatureVerdict({ key, item, tier }) : { ok: false, reason: "notRecipe" };
    return { key, name: r.name, cost: r.cost, sentence: r.sentence, goesOn: r.goesOn, ok: v.ok === true, refusal: v.ok ? null : v };
  });
}

/**
 * **WHAT A LAID SIGNATURE WRITES** (08 §18): the prose from the row's sentence, the descriptor
 * from the row, the budget raised by the cost, and the row's key recorded on the item
 * (`ENCHANTER_FLAG`) so a re-forge reads where the Signature came from rather than compounding
 * it. A Forge-built item's record names the Signature kind too, so `recipes.mjs#enchantVerdict`
 * refuses an affix laid in place that would rebuild the item and strip it. Pure: a plain update.
 *
 * @param {{key: string, item: {system: object, flags?: object}}} o
 * @returns {object|null}  an update for `item.update`, or null for an unknown row
 */
export function enchanterSignatureUpdate({ key, item } = {}) {
  const r = ENCHANTER_SIGNATURES[key] ?? null;
  if (!r || !item) return null;
  const kind = enchanterKind(key);
  const update = {
    "system.signature": enchanterSignatureHtml(key),
    "system.signatureEffect": JSON.parse(JSON.stringify(r.effect)),
    "system.budget": (Number(item.system?.budget) || 0) + r.cost,
    [`flags.azeroth-rpg.${ENCHANTER_FLAG}`]: key
  };
  if (item.flags?.["azeroth-rpg"]?.generated?.base) update["flags.azeroth-rpg.generated.signatureKind"] = kind;
  return update;
}

/** The flag a laid Enchanter's Signature leaves on its item: the row's key. */
export const ENCHANTER_FLAG = "enchanterSignature";

/**
 * **WHAT THE GM FORGE READS OFF AN ITEM CARRYING ONE** (so a re-forge never compounds, D-2167):
 * the row's key, kind and descriptor, while the item still prints the row's own sentence, and the
 * item as it was BEFORE the Signature for a base the Forge adds it back onto - its budget less the
 * row's cost, no prose and an empty descriptor. Null where the item carries no Enchanter's
 * Signature, or its prose was edited since (the GM's own sentence is then read afresh). Pure.
 *
 * @param {{name?: string, type?: string, system: object, flags?: object}} item  plain data
 * @param {object} empty  `signatures.mjs#emptySignature()`, handed in so the base is a whole descriptor
 */
export function enchanterForgeState(item, empty = null) {
  const key = item?.flags?.["azeroth-rpg"]?.[ENCHANTER_FLAG] ?? null;
  const r = key ? ENCHANTER_SIGNATURES[key] ?? null : null;
  if (!r || String(item.system?.signature ?? "") !== enchanterSignatureHtml(key)) return null;
  const system = JSON.parse(JSON.stringify(item.system ?? {}));
  system.budget = Math.max(0, (Number(system.budget) || 0) - r.cost);
  system.signature = "";
  if (empty) system.signatureEffect = JSON.parse(JSON.stringify(empty));
  return { key, kind: enchanterKind(key), html: enchanterSignatureHtml(key), effect: r.effect, base: { name: item.name ?? "", type: item.type, system } };
}

/* -------------------------------------------- */
/*  Unholy Weapon's cut, and the two heals        */
/* -------------------------------------------- */

/**
 * The flag Unholy Weapon lays on the creature struck: `{amount, source, by}`. Read by
 * `weaponCutOn` at the damage door on that creature's own weapon blows.
 */
export const WEAPON_CUT_FLAG = "weaponCut";

/**
 * **WHAT THIS CREATURE'S WEAPON ATTACKS DEAL LESS** (Unholy Weapon): the largest standing cut
 * of its active effects, never a sum (two blades laying it are one cut, the later one's span),
 * with the sources named. The caller asks it only on a WEAPON blow (`sovereign-talents.mjs
 * #isWeaponBlow`'s reading: an attack that is no spell, breath or tick). Pure.
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {{amount: number, sources: string[]}}
 */
export function weaponCutOn(effects = []) {
  let amount = 0;
  const sources = [];
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const held = e.flags?.["azeroth-rpg"]?.[WEAPON_CUT_FLAG] ?? null;
    const n = Math.trunc(Number(held?.amount)) || 0;
    if (n <= 0) continue;
    if (held.source) sources.push(String(held.source));
    amount = Math.max(amount, n);
  }
  return { amount, sources: [...new Set(sources)].sort() };
}

/**
 * **CRUSADER'S HEALTH** (*you regain Health equal to your tier*): the fired rows' Health a
 * tier, times the bearer's tier (1 to 4). Pure.
 *
 * @param {Array<{healPerTier?: number}>} rows  the fired rows
 * @param {number} tier
 */
export function tierHealFrom(rows = [], tier = 1) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  return (rows ?? []).reduce((n, r) => n + Math.max(0, Math.trunc(Number(r?.healPerTier)) || 0) * t, 0);
}

/**
 * **LIFESTEALING'S DRAIN** (*You regain Health equal to the damage it takes*): for each
 * creature struck, what each drain row's own damage came to once that creature's mitigation
 * was taken off it - a typed amount read off the resolved `parts` of its type (the target's
 * Ward of that type already met it, D-777), capped at the row's own amount; an amount of the
 * blow's own type rode the Rating, and its share is capped at what the blow dealt. Summed over
 * the creatures. Pure.
 *
 * @param {{rows: Array<{drain?: boolean, extraDamage?: number, extraType?: string|null}>,
 *   results: Array<{damage?: number, mainDamage?: number, parts?: Array<{type: string, damage: number}>}|null>,
 *   blowType: string}} o
 */
export function drainFrom({ rows = [], results = [], blowType = "physical" } = {}) {
  const drains = (rows ?? []).filter(r => r?.drain === true && (Number(r.extraDamage) || 0) > 0);
  if (!drains.length) return 0;
  let total = 0;
  for (const result of results ?? []) {
    if (!result || result.immune === true) continue;
    for (const r of drains) {
      const amount = Math.trunc(Number(r.extraDamage)) || 0;
      const typed = r.extraType && r.extraType !== blowType;
      if (typed) {
        const part = (result.parts ?? []).find(p => p?.type === r.extraType) ?? null;
        total += Math.max(0, Math.min(amount, Math.trunc(Number(part?.damage)) || 0));
      } else {
        const dealt = Math.trunc(Number(result.mainDamage ?? result.damage)) || 0;
        total += Math.max(0, Math.min(amount, dealt));
      }
    }
  }
  return total;
}

/**
 * **WHAT LIFESTEALING HEALS AT THE DAMAGE DOOR** (08 §18: *You regain Health equal to the damage it
 * takes*; D-2169): what the blow TOOK off this creature's Health and temporary Health, capped at the
 * row's own Shadow amount after Ward the card recorded. **A Block heals what got through** (the final
 * review of 0.18.1): it reduces the blow and the creature still takes the rest, so `took` is read after
 * it - what the creature took, never more than the Shadow part. Nothing where a Parry turned the hit into
 * a miss (`negated`), or the blow reached this creature moved or shared from another (`moved`, `shared`):
 * the creature the enchanted blade struck did not take that damage. Pure.
 *
 * @param {{record: {amount?: number}|null, took?: number, negated?: boolean, moved?: boolean, shared?: boolean}} o
 */
export function lifestealHeal({ record = null, took = 0, negated = false, moved = false, shared = false } = {}) {
  if (!record || negated || moved || shared) return 0;
  const cap = Math.max(0, Math.trunc(Number(record.amount)) || 0);
  return Math.max(0, Math.min(cap, Math.trunc(Number(took)) || 0));
}

/* -------------------------------------------- */
/*  The catalogue an Enchanting crafter adds      */
/* -------------------------------------------- */

/**
 * The table as `craft-signatures.mjs`' catalogue rows (D-1990's shape): `{id, from, text, effect,
 * kind, cost, itemType, goesOn}`, `text` the stored HTML, `id` `enchanter-<key>`, `goesOn` the
 * row's column (which `craft-signatures.mjs#rowFits` reads in place of the item type).
 */
export function enchanterCatalogue() {
  return Object.entries(ENCHANTER_SIGNATURES).map(([key, r]) => ({
    id: `enchanter-${key}`,
    from: r.name,
    text: enchanterSignatureHtml(key),
    effect: r.effect,
    kind: enchanterKind(key),
    cost: r.cost,
    itemType: r.goesOn === "weapon" ? "weapon" : r.goesOn === "suitOrWorn" ? "armor" : "gear",
    goesOn: r.goesOn,
    enchanter: key
  }));
}
