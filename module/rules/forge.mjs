/**
 * The Forge (D-633): what a GM may make of a weapon, a suit or a piece of
 * gear - its rarity, its prefixes and suffix, a Signature and the spells it
 * casts - checked against 08 §4 (the budget a rarity spends), §5 (what a
 * thing can carry, and a Greater School enchantment's cost to the blade),
 * §6 (one prefix and one suffix, where each may sit, what sells below Rare)
 * and §20 (a named item: the Signature table, an item that casts, and a
 * Legendary that spends no budget at all).
 *
 * `plan` returns REASONS rather than throwing, so the window prints them
 * beside Apply and the GM sees what the book refuses. `build` makes the item
 * data from an accepted plan. Both read plain objects: the affix shape the
 * pack carries on `flags.azeroth-rpg.affix`, and `{name, type, system}` for
 * the base. No Foundry imports (CLAUDE.md §3).
 */

import { AZEROTH } from "../config.mjs";
import {
  attributeGradeOf, attributeGrantAllowed, attributePointsIn, canGoOn, grantAtRarity,
  isAttributeAffix, nameFor, priceFor, RARITY_BAND
} from "./affixes.mjs";
import {
  emptySignature, gatesWithNothingBehind, pressedSentences, seedSignature, signatureEffectOf
} from "./signatures.mjs";
import { htmlFromProse } from "./prose.mjs";

/** 08 §20's Signature table: what an Epic pays for one out of its budget. */
export const SIGNATURE_KINDS = Object.freeze({
  alwaysOn: { cost: 2, label: "AZEROTH.Forge.SignatureKind.AlwaysOn" },
  gated: { cost: 1, label: "AZEROTH.Forge.SignatureKind.Gated" },
  converting: { cost: 4, label: "AZEROTH.Forge.SignatureKind.Converting" },
  convertingGated: { cost: 3, label: "AZEROTH.Forge.SignatureKind.ConvertingGated" }
});

const RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });

/**
 * 08 §20 prices two shapes of casting: a tier 1 spell once per Short Rest
 * is 2, a tier 2 once per Long Rest is 4. Anything else is the table's to
 * price, and comes back null.
 */
export function spellCost({ tier = 1, per = null } = {}) {
  if (tier === 1 && per === "short") return 2;
  if (tier === 2 && per === "long") return 4;
  return null;
}

/**
 * Whether a trait name is an ENCHANTMENT rather than a Form, Cut, Effect or
 * Mount trait: 08 §5 gives every enchantment but a Bound one a grade, and the
 * grade is written into the name (`Keen (Lesser)`). A Bound trait carries none
 * and is exempt from the count by §5's own row — *plus one Bound trait*.
 */
export function isEnchantmentTrait(name) {
  return /\((?:Lesser|Greater)\)\s*$/i.test(String(name ?? ""));
}

/** A Greater enchantment is 4 where Lesser is 2 (08 §4); the smith's three have no grade. */
export function affixCost(affix, { greater = false } = {}) {
  if (!affix) return 0;
  if (greater && affix.enchantment) return 4;
  return affix.cost ?? 0;
}

/**
 * The band a rarity spends inside. An Uncommon may overspend by a point - a
 * single Lesser enchantment at 2 is still Uncommon (08 §4) - and a Legendary
 * is not costed at all, which is null.
 *
 * **A FOUND Epic spends 4 to 7** (08 §20's *Found things*, the lead's own
 * call on 2026-09-09: *it is more important to make the item accurate, not
 * restricted by hard binary caps*). 106 finds lost their only Signature to the
 * band - Felstriker, Ironfoe, Demonfork, things that ARE their effect -
 * converting to plain weapons with a stat grant. It is a §20 exception and
 * nothing about a hand-forged item moves: 08 §4's table still stops every
 * other Epic at 5, and the book's own named items are checked against it.
 *
 * **AND A FOUND RARE SPENDS 2 TO 5** (the lead, the same day, extending the
 * call: *it is more important to make the item accurate, not restricted by
 * hard binary caps*). Raising the Epic recovered 83 of the 106; the 23 left
 * were all Rares, and six more Rares cannot afford a written Signature AT ALL
 * inside 08 §4's 3, because §20 prices a long-cooldown `Use:` as CONVERTING at
 * 4. A ceiling below the cheapest thing the table sells is not a budget.
 */
export function bandFor(rarity, { found = false } = {}) {
  if (rarity === "legendary") return null;
  const [lo, hi] = RARITY_BAND[rarity] ?? [0, 0];
  if (found && rarity === "epic") return { lo, hi: FOUND_EPIC_CEILING };
  if (found && rarity === "rare") return { lo, hi: FOUND_RARE_CEILING };
  return { lo, hi: rarity === "uncommon" ? hi + 1 : hi };
}

/**
 * What a found Epic may spend, against 08 §4's own 5. Measured off the finds
 * that lost a Signature: 27 of the 52 need 6 and 25 need 7 (D-692).
 */
export const FOUND_EPIC_CEILING = 7;

/**
 * What a found Rare may spend, against 08 §4's own 3. It is **5** rather than
 * 4 so a converting Signature is affordable BESIDE a one-point grant, which is
 * the shape a Classic find takes: a proc and the stat line the tooltip prints
 * over it. At 4 the fill would have to choose between them again.
 */
export const FOUND_RARE_CEILING = 5;

/**
 * Check a proposal against the chapter.
 *
 * @param {object} p
 * @param {{name: string, type: string, system: object}} p.base   The un-forged item.
 * @param {string} p.rarity
 * @param {object[]} p.prefixes      Affix shapes; more than one only on a Legendary.
 * @param {object|null} p.suffix
 * @param {string[]} p.greater       Names of the prefixes taken at Greater grade.
 * @param {{kind: string, text: string}|null} p.signature
 * @param {Array<{name: string, tier: number, per: string|null}>} p.spells
 * @param {string|null} p.name       A proper noun, honoured on an Epic or a Legendary.
 * @param {boolean} p.found          The item came out of a barrow rather than
 *                                   off a bench: 08 §5's ONE-ENCHANTMENT COUNT
 *                                   is skipped (D-690) and an Epic spends to 7
 *                                   rather than to 5 (D-692). Nothing else is.
 * @param {string[]} p.grants        The grant sentences the item will carry,
 *                                   where the caller composes them itself —
 *                                   the Classic conversion does. 08 §6's
 *                                   attribute band is judged against the
 *                                   rarity here (D-701); `build` derives its
 *                                   own from the same law, so the Forge passes
 *                                   nothing and the two cannot disagree.
 * @param {string[]} p.classes       02 §6's nine, for the gate a typed sentence
 *                                   may name. Only the one-button check below
 *                                   reads them; `build` takes its own copy.
 * @returns {{ok: boolean, reasons: string[], notes: string[], spent: number, band: {lo: number, hi: number}|null, price: number|null, name: string|null}}
 */
export function plan({ base, rarity = "common", prefixes = [], suffix = null, greater = [], signature = null, spells = [], name = null, found = false, grants = [], classes = [] } = {}) {
  const reasons = [];
  const notes = [];
  if (!base) return { ok: false, reasons: ["no base item"], notes, spent: 0, band: null, price: null, name: null };
  if (!AZEROTH.rarities[rarity]) reasons.push(`no such rarity: ${rarity}`);

  const legendary = rarity === "legendary";
  const named = legendary || rarity === "epic";
  // 08 §20 (D-686): a named Rare carries a Signature and pays for it out of
  // its own budget of 2 to 3. Nothing else about a Rare moves - the name box
  // and an item that casts stay on `named` - and the band below is what
  // refuses a Signature the rarity cannot afford.
  const signed = named || rarity === "rare";
  const greaterSet = new Set(greater);
  const list = prefixes.filter(Boolean);

  // Where each may sit (08 §6), and what a grade may be (08 §6: Greater is not sold).
  if (list.length > 1 && !legendary && !found) reasons.push("only a Legendary carries more than one prefix (08 §6)");

  // 08 §5's limits table: **one enchantment at one grade**, whatever the item
  // is. It is a limit on what a SMITH will do — §20 already says a named item
  // may carry more than §5 allows, and a found item is a named item — so
  // `found` skips it and a Legendary is outside it by its own entry.
  //
  // Only what the proposal ADDS is judged. An item that was already carrying
  // two when it was dug up is not made illegal by being looked at.
  const adding = list.filter(a => a?.enchantment).length;
  if (adding && !legendary && !found) {
    const carried = (base.system?.traits ?? []).filter(isEnchantmentTrait).length;
    if (carried + adding > 1) {
      reasons.push(`${base.name} already carries an enchantment, and a thing carries one at one grade (08 §5)`);
    }
  }
  for (const affix of list) {
    if (affix.kind !== "prefix") reasons.push(`${affix.name} is a ${affix.kind}, not a prefix`);
    else if (!canGoOn(affix, base)) reasons.push(`${affix.name} does not go on ${base.name}`);
    if (greaterSet.has(affix.name)) {
      if (!affix.enchantment) reasons.push(`${affix.name} has no Greater grade`);
      else if (!named) reasons.push("a Greater grade appears only on Epic and Legendary items (08 §6)");
    }
  }
  if (suffix) {
    if (suffix.kind !== "suffix") reasons.push(`${suffix.name} is a ${suffix.kind}, not a suffix`);
    else if (!canGoOn(suffix, base)) reasons.push(`${suffix.name} does not go on ${base.name}`);
  }
  for (const affix of [...list, suffix].filter(Boolean)) {
    if (affix.minimumRarity && (RANK[rarity] ?? 0) < (RANK[affix.minimumRarity] ?? 0)) {
      reasons.push(`${affix.name} does not appear below ${affix.minimumRarity} (08 §6)`);
    }
  }
  if (rarity === "common" && (list.length || suffix || signature || spells.length)) reasons.push("a Common item carries nothing (08 §4)");
  if (rarity === "uncommon" && list.length + (suffix ? 1 : 0) > 1) reasons.push("an Uncommon item carries one affix, prefix or suffix (08 §4)");
  if (signature && !signed) reasons.push("a Signature is written for a named Rare, an Epic or a Legendary (08 §20)");
  if (signature && !legendary && !SIGNATURE_KINDS[signature.kind]) reasons.push(`no such Signature kind: ${signature.kind}`);

  // **A SIGNATURE CARRIES ONE BUTTON** (D-722). Each sentence is read on its
  // own since the lead's call of 2026-09-14, and `seedSignature` lifts the
  // pressed sentence's `use` onto the trunk with its gate on `useGates` -
  // there is exactly one place to put it, because `AzerothActor#resetUses`
  // writes `system.signatureEffect.use.uses.value` by dotted path at every
  // rest. A second pressing sentence would be silently dropped, so the bench
  // says so instead of forging an item whose own words are half inert.
  //
  // **Only where the words are being READ.** A Signature taken off another
  // item or handed over by the Classic conversion arrives with its own
  // hand-reviewed descriptor and is never seeded, so it is never counted here.
  if (signature && !signature.effect) {
    // Over the HTML `build` will store, never over what the box holds, so the
    // bench refuses exactly what the item would have got.
    const stored = htmlFromProse(signature.text ?? "");
    const pressed = pressedSentences(stored, { classes });
    if (pressed.length > 1) {
      reasons.push(`a Signature carries one button and ${pressed.length} of its sentences press: `
        + pressed.map(s => `"${s}"`).join(" and "));
    }
    // AND A GATE READ OFF A SENTENCE THAT FIRES NOTHING is very probably a
    // sentence the GM meant to gate something else. A NOTE and not a reason:
    // *a Paladin's blade, forged in Stratholme* is a legal thing to write on a
    // Legendary, and `classic-loot.mjs` puts every one of its 1,755 finds
    // through this door - a false refusal there would drop them from the pack.
    for (const empty of gatesWithNothingBehind(stored, { classes })) {
      notes.push(`"${empty}" gates something and states no rule this system reads; `
        + "a gate covers only its own sentence (08 §20)");
    }
  }

  // 08 §6's attribute band, judged against the rarity (D-701). The COST is
  // the suffix's rung and is charged below like any other affix; this is the
  // other half of the same rule, and without it a `+5 Strength` on a Rare and
  // a `+1 Strength` on an Epic both reach a pack unremarked.
  const suffixRung = suffix && isAttributeAffix(suffix) ? Number(suffix.points ?? suffix.cost ?? 1) : null;
  for (const text of grants ?? []) {
    const points = attributePointsIn(text);
    if (points === null) continue;
    if (!attributeGrantAllowed(rarity, points, suffixRung)) {
      reasons.push(`${text} is not what a ${rarity} item grants (08 §6)`);
    }
  }

  // The spend (08 §4's exchange rate, §20's Signature and casting prices).
  // A base that already carries a budget - a named Epic from the pack -
  // has spent it; the forging adds to that.
  let spent = Number(base.system?.budget) || 0;
  for (const affix of list) spent += affixCost(affix, { greater: greaterSet.has(affix.name) });
  spent += affixCost(suffix);
  if (signature && !legendary) spent += SIGNATURE_KINDS[signature.kind]?.cost ?? 0;
  for (const spell of spells) {
    const label = spell.name || "a spell";
    if (!named) {
      reasons.push(`${label}: an item that casts is Epic or Legendary (08 §20)`);
      continue;
    }
    if (legendary) continue;
    const cost = spellCost(spell);
    if (cost === null) notes.push(`${label} at tier ${spell.tier ?? 1}, ${spell.per ? `once per ${spell.per}` : "unlimited"}, is not priced by 08 §20; the table sets it`);
    else spent += cost;
  }
  const band = bandFor(rarity, { found });
  if (band && spent > band.hi) reasons.push(`a spend of ${spent} is over ${rarity}'s budget of ${band.hi}`);
  if (band && spent < band.lo) reasons.push(`a spend of ${spent} is under ${rarity}'s budget of ${band.lo}`);

  const price = legendary ? null : priceFor({ base, rarity });
  // Prefix, base, suffix below Epic (08 §4); a proper noun above it (08 §20).
  const grammar = nameFor({ base, prefix: list[0] ?? null, suffix });
  const finalName = named && name ? name : grammar;

  return { ok: reasons.length === 0, reasons, notes, spent, band, price, name: finalName };
}

/**
 * The item data an accepted plan makes. The base is never mutated, and the
 * numbers are computed from it every time, so a second forging never
 * compounds a first (the price multiplier applied twice was the fault the
 * affix dialog guarded against; this keeps the guard).
 *
 * **THE SIGNATURE'S DESCRIPTOR IS WRITTEN BESIDE ITS SENTENCE.** This line
 * kept `signature.text` and threw everything else away — the kind `plan()` had
 * just priced survived only as a memo on `flags.azeroth-rpg.generated`, and
 * `system.signatureEffect` came out of the forge empty however carefully the
 * GM had written the sentence. It is the original fault behind D-692: a
 * Signature that reached the sheet as prose and no roll in the game had heard
 * of. `rules/signatures.mjs#seedSignature` reads the sentence the GM typed and
 * only what its words unambiguously say; where they say nothing, the
 * descriptor is empty and the item's Signature is prose, which is honest and
 * is what the item sheet prints.
 *
 * `classes` is the roster a class gate may name (there is none in
 * `config.mjs`), handed in by the caller that has the pack open.
 *
 * @returns {{name: string, system: object, grants: string[]}}
 */
export function build({ base, rarity = "common", prefixes = [], suffix = null, greater = [], signature = null, spells = [], name = null, classes = [] } = {}) {
  const proposal = plan({ base, rarity, prefixes, suffix, greater, signature, spells, name, classes });
  const legendary = rarity === "legendary";
  const greaterSet = new Set(greater);
  const system = clone(base.system ?? {});
  const grants = [];
  const traits = [...(system.traits ?? [])];

  for (const affix of prefixes.filter(Boolean)) {
    if (affix.enchantment) {
      const grade = greaterSet.has(affix.name) ? "Greater" : "Lesser";
      traits.push(`${affix.name} (${grade})`);
      // A Greater School enchantment costs the blade 1 Damage Rating; a
      // Legendary pays no Rating for one (08 §5).
      if (grade === "Greater" && affix.family === "school" && !legendary && typeof system.rating === "number") {
        system.rating = Math.max(0, system.rating - 1);
      }
      continue;
    }
    // The smith's three: Sturdy, Honed, Reinforced (08 §6).
    if (/Damage Rating/i.test(affix.grants ?? "") && typeof system.rating === "number") system.rating += 1;
    if (/Armor Point/i.test(affix.grants ?? "") && system.category !== undefined) system.apBonus = (system.apBonus ?? 0) + 1;
    if (affix.grants) grants.push(affix.grants);
  }
  // **THE RARITY SAYS WHAT THE SUFFIX DELIVERS** (08 §6, D-701). The cost was
  // charged at the suffix's own rung in `plan` above and has not moved; this
  // is the sentence the item carries, which on an Epic or a Legendary is +3 to
  // +5 rather than §6's one point or two. Every other family — Ward,
  // Spellpower, a Boon on a skill, Fortitude — is unchanged, and
  // `grantAtRarity` is the identity on all of them.
  if (suffix?.grants) grants.push(grantAtRarity(suffix.grants, rarity, attributeGradeOf(suffix)));

  system.traits = traits;
  system.rarity = rarity;
  system.budget = legendary ? null : proposal.spent;
  system.cost = proposal.price;
  // **THE BOX TAKES FREE TYPING AND THIS IS WHERE IT IS FORMATTED** (the lead,
  // 2026-09-14). The Forge's text box is a plain `<textarea>` and this line
  // stored whatever was in it verbatim, so a GM who typed a sentence got a
  // bare sentence where every pack entry holds `<p>…</p>` — and one who opened
  // a pack item saw the tags and reasonably typed more of them.
  // `htmlFromProse` is the NPC generator's own pair, and it is idempotent, so
  // a caller handing HTML over (the loot generator's base, a fixture) is
  // untouched.
  const signatureText = htmlFromProse(signature?.text ?? "");
  system.signature = signatureText;
  // The descriptor sits at the key `forged()` already gives it, between the
  // sentence and the spells, so the assignment never moves it in the key order
  // `tools/check-packs.mjs` diffs byte for byte.
  //
  // A Signature TAKEN off another item brings its own hand-reviewed row; one
  // the GM typed is read off the words. Never both, and never a stale row: the
  // caller drops `effect` the moment the sentence is edited.
  //
  // **SEEDED OVER THE HTML THAT IS STORED**, never over what was typed: the
  // bold-name reader in `castFromText` accepts `<strong>` and `**` alike, so
  // the two readings agree, and seeding over the stored text is what keeps
  // "what the box says is what the item gets" literally true.
  system.signatureEffect = signatureText
    ? signatureEffectOf({ signatureEffect: signature?.effect })
      ?? seedSignature({ name: proposal.name, text: signatureText, section: system.source?.section ?? "" }, { classes })
    : emptySignature();
  system.spells = spells.map(s => ({
    uuid: s.uuid,
    name: s.name ?? "",
    dc: s.dc ?? null,
    uses: { value: s.max ?? 0, max: s.max ?? 0, per: s.per ?? null }
  }));

  return { name: proposal.name, system, grants };
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
