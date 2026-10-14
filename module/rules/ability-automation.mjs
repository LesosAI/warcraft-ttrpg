/**
 * A creature's ability, automated (D-647). Pure: no Foundry.
 *
 * 14 prints an ability as prose and the block states the rule (D-533). The
 * descriptor beside it is what pressing Use does - in `rules/class-features`'
 * vocabulary, so a creature's ability and a class feature post the same
 * card: an action rung, a cost off one of the creature's two pools, a
 * Casting Test, a DC, uses, a heal, damage of a type, the target's Resist,
 * an attack, an area, a condition inflicted, a note. `kind: "none"` is the
 * absence; a pack creature is prose only and the generator seeds a
 * descriptor from the words on demand - only where the words are
 * unambiguous, one number, one school, one condition.
 */

import { AZEROTH } from "../config.mjs";
import { injuryConditions } from "./injuries.mjs";
import { standardDC } from "./modifiers.mjs";
import { parseGrant } from "./grants.mjs";
// 08 §7's Greater School enchantment and 08 §5's Pierce, in one place for the
// creature's attack row and the character's weapon alike.
import { weaponDamageSpec } from "./damage-spec.mjs";

export const ABILITY_KINDS = Object.freeze(["none", "attack", "test", "spell", "heal", "utility", "passive", "summon"]);

/** The descriptor with nothing set. */
export function emptyAutomation() {
  return {
    kind: "none",
    // WHY THIS IS STILL PROSE (D-691). One of `AZEROTH.abilityReasons`, or
    // "" for an entry nobody has read. Only meaningful at `kind: "none"`.
    reason: "",
    action: null,
    cost: { pool: null, amount: null },
    casting: false,
    dc: null,
    uses: { max: null, value: null, per: null },
    heal: null,
    damage: { amount: null, type: null },
    resist: null,
    attack: { bonus: null, damage: null, traits: [] },
    area: "",
    inflicts: { condition: null, value: null, until: null },
    spell: "",
    note: "",
    // Standing, never pressed (D-691). `grants` are 08 §6 grant sentences and
    // parse through `rules/grants.mjs#parseGrant` exactly as an affix's do;
    // `refuses` are condition keys plus `AZEROTH.refusalExtras`; `senses` are
    // `AZEROTH.creatureSenses`; `when` gates the whole thing and re-derives on
    // every data preparation, with `near` carrying what `nearAlly` measures.
    passive: {
      grants: [],
      refuses: [],
      senses: [],
      when: null,
      near: { name: null, feet: null, count: null }
    },
    // More bodies on the field (D-691): the creature 14 names in bold, how
    // many, whose side, and when they start.
    summon: { entry: "", count: null, side: "summoner", from: "nextRound" },
    // Regeneration (D-691): Health at the start of each of its turns, gated by
    // `when` and withheld where it has taken `unless` damage since the end of
    // its last turn.
    tick: { heal: null, when: null, unless: null }
  };
}

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};
const oneOf = (v, keys) => (typeof v === "string" && keys.includes(v) ? v : null);
const strings = v => (Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : []);

/**
 * A stored descriptor made valid: a value outside its vocabulary is nulled
 * rather than refusing the document, and a missing descriptor is the empty
 * one. Runs in `migrateData` before the `choices` can refuse.
 */
export function cleanAutomation(raw) {
  const out = emptyAutomation();
  if (!raw || typeof raw !== "object") return out;
  out.kind = oneOf(raw.kind, ABILITY_KINDS) ?? "none";
  out.reason = oneOf(raw.reason, Object.keys(AZEROTH.abilityReasons)) ?? "";
  out.passive = {
    // A sentence `parseGrant` cannot read is dropped rather than carried,
    // the way a value outside a vocabulary is nulled.
    grants: strings(raw.passive?.grants).filter(g => parseGrant(g) !== null),
    refuses: strings(raw.passive?.refuses).filter(r => r in AZEROTH.conditions || r in AZEROTH.refusalExtras),
    senses: strings(raw.passive?.senses).filter(s => s in AZEROTH.creatureSenses),
    when: oneOf(raw.passive?.when, Object.keys(AZEROTH.passiveWhen)),
    near: {
      name: typeof raw.passive?.near?.name === "string" && raw.passive.near.name ? raw.passive.near.name : null,
      feet: num(raw.passive?.near?.feet),
      count: num(raw.passive?.near?.count)
    }
  };
  out.summon = {
    entry: typeof raw.summon?.entry === "string" ? raw.summon.entry : "",
    count: num(raw.summon?.count),
    side: oneOf(raw.summon?.side, Object.keys(AZEROTH.summonSides)) ?? "summoner",
    from: oneOf(raw.summon?.from, Object.keys(AZEROTH.summonFrom)) ?? "nextRound"
  };
  out.tick = {
    heal: num(raw.tick?.heal),
    when: oneOf(raw.tick?.when, Object.keys(AZEROTH.passiveWhen)),
    // A damage type, meaning "has taken this since the end of its last turn".
    unless: oneOf(raw.tick?.unless, Object.keys(AZEROTH.damageTypes))
  };
  out.action = oneOf(raw.action, Object.keys(AZEROTH.actions));
  out.cost = { pool: oneOf(raw.cost?.pool, Object.keys(AZEROTH.npcPoolKinds)), amount: num(raw.cost?.amount) };
  out.casting = raw.casting === true;
  out.dc = num(raw.dc);
  out.uses = { max: num(raw.uses?.max), value: num(raw.uses?.value), per: oneOf(raw.uses?.per, Object.keys(AZEROTH.abilityUsesPer)) };
  out.heal = num(raw.heal);
  out.damage = { amount: num(raw.damage?.amount), type: oneOf(raw.damage?.type, Object.keys(AZEROTH.damageTypes)) };
  out.resist = oneOf(raw.resist, Object.keys(AZEROTH.resiliences));
  out.attack = {
    bonus: num(raw.attack?.bonus), damage: num(raw.attack?.damage),
    traits: Array.isArray(raw.attack?.traits) ? raw.attack.traits.map(t => String(t)).filter(Boolean) : []
  };
  out.area = typeof raw.area === "string" ? raw.area : "";
  out.inflicts = {
    condition: oneOf(raw.inflicts?.condition, Object.keys(AZEROTH.conditions)),
    value: num(raw.inflicts?.value), until: oneOf(raw.inflicts?.until, Object.keys(AZEROTH.untilKinds))
  };
  out.spell = typeof raw.spell === "string" ? raw.spell : "";
  out.note = typeof raw.note === "string" ? raw.note : "";
  return out;
}

/** Whether Use does anything. */
export function hasAutomation(automation) {
  return Boolean(automation?.kind) && automation.kind !== "none";
}

/**
 * Whether there is a button to press (D-691). A `passive` is standing: it is
 * enforced by data preparation and nobody uses it, so a Use control on its
 * row would do nothing at all - which is the shape D-681 keeps finding.
 */
export function isPressable(automation) {
  return hasAutomation(automation) && automation.kind !== "passive";
}

/**
 * The words, without the markup. BOTH KINDS OF MARKUP: the parser reads a
 * chapter paragraph in markdown and the pack stores it as HTML, and every
 * regex here has to see the same sentence either way. `**` was left in place
 * for a version, which is why the summon reader found the creature in the
 * pack and not in the chapter it was parsing (D-691).
 */
const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const distinct = values => [...new Set(values)];

/* -------------------------------------------- */
/*  What the prose says, only where it is plain  */
/* -------------------------------------------- */

/** The count words 14 opens a summon with, and `A`/`An` for one. */
const COUNTS = Object.freeze({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 });

/**
 * Abilities whose rule is a NUMBER THE BLOCK ALREADY CARRIES, named the way
 * D-530 names them - structurally, by the ability's own label. **Winged** is
 * `system.flies`, read off the Speed row and printed as the tier's flying
 * pace; sixteen blocks carry it and its prose is deliberately atmospheric.
 */
const ON_THE_BLOCK = new Set(["Winged"]);

/**
 * A creature 14 names IN BOLD. The chapter marks every block it points at
 * that way - `Two **Earth Elemental**s step out of the chamber walls` - so
 * the name is read off the markup rather than guessed out of the sentence.
 * Returns every bolded run, in order.
 */
function boldNames(html) {
  return [...String(html ?? "").matchAll(/<strong>([^<]+)<\/strong>|\*\*([^*]+)\*\*/gi)]
    .map(m => (m[1] ?? m[2]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * A sentence that gives something to somebody ELSE (D-691): *Every Gnoll
 * within 30 feet takes +1*, *A Defias creature within 30 feet takes +1*, *An
 * Atal'ai creature within 30 feet recovers 3 Health*. The affected set is a
 * faction word no field on the block carries, so an aura is recorded as
 * unread rather than guessed at - deciding what counts as Defias is
 * inventing game content (CLAUDE.md §17).
 *
 * It keys on the SUBJECT taking something, not on the words *every creature*:
 * *Ukorz attacks every creature in reach* is the creature's own blow and has
 * to stay an attack.
 *
 * **A COUNTED SUBJECT IS A SUBJECT** (D-707). A shaman's totem states its set
 * as a number — *Up to 5 targets within 30 feet of the totem gain 1 AP*, *Up
 * to 5 targets within 15 feet add 1 to their weapon Attack Tests* — and the
 * quantifier list held only the words, so six of the seven totems read as
 * prose stating no mechanic rather than as the auras they are.
 */
const AURA = /\b(?:every|each|a|an|any|one|up to \d+)\s+(?:other\s+)?[\w'’ -]{0,30}?within\s+\d+\s*(?:feet|ft)\b[^.]*?\b(?:takes?|take|recovers?|regains?|gains?|adds?|does not|cannot)\b|\bevery creature under\b|\b(?:every|each|any)\s+creature\b[^.]{0,60}?\btakes?\b/i;

/**
 * A Resilience that is what a BOON OR BANE LANDS ON, never a Test this block
 * forces (D-707): the Tremor Totem's *Up to 5 targets within 30 feet gain a
 * Boon on Resilience (Spirit) Tests* put a Spirit Resilience Test at an
 * invented DC on the totem's own card.
 *
 * **IT IS THE VERB AND NOT THE AURA.** Stripping whole aura SENTENCES was
 * tried first and took the Resilience off thirty-three Boss Actions: *Every
 * creature within 20 feet takes 8 Fire damage; a Reflex Resilience Test at DC
 * 22 halves it* is an aura by every reading, and the Test in it is exactly the
 * one the descriptor is for — a `resist` is always what the TARGET rolls.
 * Wrath of Ragnaros and Onyxia's Deep Breath were among them.
 *
 * A HEAL IS NOT READ THIS WAY either: `applyHealing` from a card lands on the
 * card's targets first (D-612), so the Healing Stream Totem's *One target
 * within 30 feet may recover 1 Health* is a button that works.
 */
const BOON_TESTS = /\b(?:gains?|takes?|has|have|with)\s+(?:a\s+|an\s+)?(?:Boon|Bane)\s+on\b[^.;]*?\bTests?\b/gi;

/**
 * An aura that HEALS somebody else, keyed on the verb standing right after the
 * measure - *every troll within 20 feet recovers 1 Health*, *an Atal'ai
 * creature within 30 feet of Jammal'an recovers 3 Health*. Immol'thar's *Feed*
 * measures a creature and then heals ITSELF, and the intervening words are
 * what tell the two apart.
 */
const AURA_HEAL = /\bwithin\s+\d+\s*(?:feet|ft)\s+(?:of\s+[\w'’]+\s+)?(?:recovers?|regains?|heals?)\b/i;

/**
 * A sentence whose bonus lands on ANOTHER creature. Read per sentence, so a
 * block that grants itself something in one breath and its allies something
 * in the next keeps the half that is its own.
 */
const GRANTS_TO_OTHERS = /\b(?:every|each|a|an|any|one)\s+(?:other\s+)?[\w'’ -]{0,25}?creature\b[^.]{0,90}?\btakes?\b|\bevery\s+[a-z'’-]+\s+within\b|\bevery creature under\b/i;

/** A clause the tool cannot judge: light, sight, a charge, standing somewhere. */
const TABLE_CALL = /\b(?:in daylight|by daylight|under an open night sky|it can see|he can see|she can see|they can see|inside the [a-z ]+|standing on|in the open|from dusk|at night|in darkness|on a turn in which)\b/i;

/**
 * A refusal the tool must not read flat: *by anything of its own size or
 * smaller*, *unless*, or a whole sentence held open by a *While*. 14 writes
 * an unqualified refusal as a bare *cannot be X*, and only that is read.
 */
const QUALIFIED = /\bby anything\b|\bunless\b|^\s*while\b/i;

/**
 * A descriptor read off the prose, seeded only where the words are
 * unambiguous: exactly one damage figure, one DC, one Resilience, one
 * condition. Anything the prose says twice is left for the GM. Returns a
 * partial in the descriptor's shape; `mergeSeed` lays it onto one.
 *
 * The HTML matters, not only the text: `<strong>` is how 14 names the block
 * a summon calls (D-691), so the raw run is read before it is stripped.
 */
export function seedAutomation(prose = "", { name = "" } = {}) {
  const text = plain(prose);
  const seed = {};
  // D-530 KEYS A STRUCTURAL RULE ON STRUCTURE, and this is the same reading:
  // **Winged** is an ability whose whole mechanic is the flying pace already
  // on the Speed row, so its prose is free to say *fights from the air* and
  // there is nothing here left to automate.
  if (ON_THE_BLOCK.has(String(name).trim())) return { kind: "none", reason: "onTheBlock" };
  const types = Object.keys(AZEROTH.damageTypes);
  const typed = [...text.matchAll(/\b(\d+)\s+(fire|frost|arcane|nature|shadow|holy|fel|physical)\s+damage\b/gi)]
    .map(m => ({ amount: Number(m[1]), type: m[2].toLowerCase() }))
    .filter(d => types.includes(d.type));
  const typedKeys = distinct(typed.map(d => `${d.amount}/${d.type}`));
  if (typedKeys.length === 1) seed.damage = { amount: typed[0].amount, type: typed[0].type };
  else if (!typedKeys.length) {
    const bare = distinct([...text.matchAll(/\b(\d+)\s+damage\b/gi)].map(m => Number(m[1])));
    if (bare.length === 1) seed.damage = { amount: bare[0], type: null };
  }
  const dcs = distinct([...text.matchAll(/\bDC\s*(\d+)\b/g)].map(m => Number(m[1])));
  if (dcs.length === 1) seed.dc = dcs[0];
  // 14 WRITES IT BOTH WAYS: `Body Resilience Test` and `Resilience (Body)
  // Test`. Only the first was read, so every ability phrased the second way
  // named no Resilience at all — the Succubus's Seduction among them
  // (2026-09-07).
  // A Resilience a Boon or Bane LANDS ON is not one this block forces
  // (D-707); `readPassive` reads the same clause on the full text, where it
  // belongs, as a grant.
  const forced = text.replace(BOON_TESTS, " ");
  const resists = distinct([
    ...[...forced.matchAll(/\b(Body|Reflex|Spirit)\s+Resilience\b/gi)].map(m => m[1].toLowerCase()),
    ...[...forced.matchAll(/\bResilience\s*\((Body|Reflex|Spirit)\)/gi)].map(m => m[1].toLowerCase())
  ]);
  if (resists.length === 1) seed.resist = resists[0];
  const conditions = injuryConditions(text).conditions;
  if (conditions.length === 1) seed.inflicts = { condition: conditions[0].id, value: conditions[0].value ?? null, until: null };
  const action = /\bas an?\s+(Reaction|Half-Action|Full Action|action)\b/i.exec(text);
  if (action) seed.action = { reaction: "reaction", "half-action": "half", "full action": "full", action: "action" }[action[1].toLowerCase()] ?? null;
  const once = /\bonce per\s+(Short Rest|Long Rest|encounter|fight)\b/i.exec(text);
  if (once) seed.uses = { max: 1, value: 1, per: { "short rest": "short", "long rest": "long", encounter: "encounter", fight: "encounter" }[once[1].toLowerCase()] };
  // WHAT IT GIVES TO SOMEBODY ELSE IS NOT ITS OWN (D-691). An aura's numbers
  // land on other creatures, so reading them onto this block would heal the
  // witch-doctor for the Health its fetish gives every troll around it.
  const aura = AURA.test(text);

  // 14 writes *recovers* as often as *heals* or *regains*, and every one of
  // those was invisible (D-691).
  const heals = distinct([...text.matchAll(/\b(?:heals?|regains?|recovers?)\s+(\d+)\s+Health\b/gi)].map(m => Number(m[1])));
  const area = /\b(\d+)\s*(?:ft|feet)\s+(radius|cone|line)\b/i.exec(text);
  if (area) seed.area = `${area[1]} ft ${area[2].toLowerCase()}`;

  // ---- regeneration: Health at the start of each of its turns (D-691) ------
  const tick = /\b(?:recovers?|regains?|heals?)\s+(\d+)\s+Health\s+at the start of each of\b/i.exec(text);
  const unless = /\bunless\s+(?:he|she|it|they)\s+ha(?:s|ve)\s+taken\s+(fire|frost|arcane|nature|shadow|holy|fel|physical)\s+damage\b/i.exec(text);
  const gatedTick = Boolean(tick) && /^\s*While\b/i.test(text);
  const auraHeal = AURA_HEAL.test(text);
  if (tick && !gatedTick && !auraHeal) {
    seed.tick = { heal: Number(tick[1]), when: null, unless: unless ? unless[1].toLowerCase() : null };
  }
  // A heal the prose states once, where it is not the regeneration above -
  // and a GATED regeneration is still a regeneration, so reading it as a heal
  // the GM presses would give Ursal five Health anywhere in Azeroth.
  if (heals.length === 1 && !seed.tick && !auraHeal && !gatedTick) seed.heal = heals[0];

  // ---- a summon: a count, a block named in bold, a side (D-691) -----------
  if (/\bacts? on (?:his|her|its|their) side\b/i.test(text)) {
    const named = summonNamed(prose);
    if (named) {
      seed.summon = { ...named, side: "summoner", from: /\bfrom the next round\b/i.test(text) ? "nextRound" : "now" };
    } else {
      // *Any creature that has died this encounter stands as a Plagued Ghoul*
      // names no number, and a corpse *stands as a ghoul* names no block.
      seed.reason = "unnamed";
    }
  }

  // ---- a standing passive: what it refuses, grants and senses -------------
  const passive = readPassive(text);
  if (passive && (passive.refuses.length || passive.senses.length || passive.grants.length)) {
    seed.passive = passive;
    // A condition inside a *cannot be* clause is one the creature REFUSES, and
    // reading it as one it inflicts put an Inflict Charmed button on Prince
    // Malchezaar's Netherborn (D-691).
    if (seed.inflicts && passive.refuses.includes(seed.inflicts.condition)) delete seed.inflicts;
  }

  // *attacks the nearest creature* is the TARGET attacking, never this block.
  const attacks = /\b(makes? an attack|attack Test|to hit|attacks (?:every|each)\b|attacks at the end\b|at (?:his|her|its|the same) Bonus)\b/i.test(text);
  // `passive` is the kind of an entry with NOTHING TO PRESS. What stands lives
  // on `automation.passive` whatever the kind, so an entry that both senses
  // and inflicts keeps its button and its senses both (D-691).
  seed.kind = seed.summon ? "summon"
    : attacks ? "attack"
      : (seed.resist || seed.dc !== undefined || seed.damage) ? "test"
        : seed.heal !== undefined ? "heal"
          : (seed.action || seed.uses || seed.inflicts || seed.area) ? "utility"
            : (seed.passive || seed.tick) ? "passive"
              : "none";

  // ---- and where it read nothing, why (D-691) -----------------------------
  if (seed.kind === "none" && !seed.reason) {
    if (aura) seed.reason = "aura";
    else if (gatedTick || TABLE_CALL.test(text)) seed.reason = "tableCall";
    else if (/\bfor each\b|\bto a maximum of\b/i.test(text)) seed.reason = "scaled";
    else if (/\buses the [A-Za-z' ]+ block in place of\b|\bSwap\b/i.test(text)) seed.reason = "replacesBlock";
    else if (/\bagainst any creature that another\b|\bthat has not\b/i.test(text)) seed.reason = "targetRelative";
    else seed.reason = "narrative";
  }
  return seed;
}

/**
 * The block a summon calls, and how many. 14 bolds every creature it points
 * at - `Two **Earth Elemental**s step out of the chamber walls` - and it
 * bolds conditions the same way, so the name is the first bolded run with a
 * COUNT WORD in front of it. `null` where the sentence names no number (*Any
 * creature that has died this encounter*) or no block (*it stands as a
 * ghoul*), and that entry stays prose with its reason recorded.
 */
function summonNamed(prose) {
  const flat = plain(prose);
  for (const name of boldNames(prose)) {
    const at = flat.indexOf(name);
    if (at < 0) continue;
    const before = flat.slice(0, at).trim().split(/\s+/).pop() ?? "";
    const count = COUNTS[before.toLowerCase()];
    if (!count) continue;
    // AN ARTICLE IS NOT A COUNT WHERE THE SUBJECT IS AN OPEN SET. Kel'Thuzad
    // raises *any creature that has died this encounter* **as a Plagued
    // Ghoul**, and how many that is depends on the fight.
    if (count === 1 && /\b(?:any|every|each)\s+creature\b/i.test(flat.slice(0, at))) return null;
    return { entry: name, count };
  }
  return null;
}

/**
 * 14 writes a standing Boon BOTH WAYS - *takes Boon on Perception Tests* and
 * *its attack Tests take Boon* - so both are read, and the phrase in front of
 * *Tests* is trimmed back word by word until it is a skill or a Test kind.
 */
const BOON_RE = /\btakes?\s+(Boon|Bane)\s+on\s+(?:every\s+|all\s+)?([A-Za-z' ]+?)\s+Tests?\b/gi;
const BOON_LATE_RE = /\b([A-Za-z' ]+?)\s+Tests?\s+takes?\s+(Boon|Bane)\b/gi;
/** `takes +1 to Defense`, `+2 to Initiative`, `+1 to Damage Rating`. */
const BONUS_RE = /\btakes?\s+\+(\d+)\s+to\s+(Defense|Initiative|Damage Rating|attack Tests|Speed)\b/gi;

/**
 * `A Boon on <phrase>` as a grant sentence, trimming the phrase back from the
 * left until `parseGrant` reads it: *this one's attack* is *attack*, and
 * *every Stealth* is *Stealth*.
 */
function boonSentence(kind, phrase) {
  const word = kind[0].toUpperCase() + kind.slice(1).toLowerCase();
  const words = String(phrase ?? "").trim().split(/\s+/).filter(Boolean);
  for (let i = Math.max(0, words.length - 3); i < words.length; i++) {
    const text = `A ${word} on ${words.slice(i).join(" ")}`;
    if (parseGrant(text)) return text;
  }
  return null;
}
/**
 * What a creature refuses, always written *cannot be …* (14). The clause ENDS
 * at the next `and` as well as at the stop, or Cho'gall's *cannot be Charmed,
 * Frightened or Silenced, and he casts on the round he is Stunned* would read
 * Stunned as a fourth refusal.
 */
const REFUSE_RE = /\bcannot be ([^.;]+?)(?:,? and\b|[.;]|$)/gi;

/** What a sense sentence says, in `AZEROTH.creatureSenses`' words. */
const SENSES = Object.freeze([
  [/\bsees? in the dark\b/i, "darkvision"],
  [/\bbreathes? water\b/i, "waterBreathing"],
  [/\bswims? at twice (?:its|his|her|their) Speed\b/i, "swimFast"],
  [/\bswims? at (?:its|his|her|their|full) Speed\b/i, "swim"],
  [/\bmoves? on walls and ceilings\b/i, "wallWalking"],
  [/\bas though they were not there\b/i, "phasing"]
]);

/**
 * The standing half of an entry: what it refuses, what it senses, and what it
 * grants ITSELF. A grant whose sentence is about OTHER creatures is dropped
 * per sentence rather than per entry, so a block that grants itself something
 * in one breath and its allies something in the next keeps its own half.
 */
function readPassive(text) {
  const refuses = [];
  const push = id => { if (!refuses.includes(id)) refuses.push(id); };
  for (const m of text.matchAll(REFUSE_RE)) {
    const clause = m[1];
    // A qualified refusal is not read: the Bluffwatcher cannot be moved *by
    // anything of its own size or smaller*, and Thermaplugg only *while the
    // walker stands*. Both would otherwise refuse the condition outright.
    const sentence = sentenceAround(text, m.index ?? 0);
    if (QUALIFIED.test(sentence) || TABLE_CALL.test(sentence)) continue;
    for (const id of Object.keys(AZEROTH.conditions)) {
      // `knocked Prone`, `made to Bleed`, `or Entangled` - the chapter prints
      // the condition's own word and A1 owns it.
      const word = id === "bleeding" ? "(?:Bleeding|Bleed)" : id;
      if (new RegExp(`\\b${word}\\b`, "i").test(clause)) push(id);
    }
    if (/\bmoved against (?:its|his|her|their) will\b/i.test(clause)) push("forcedMovement");
    if (/\bsurprised\b/i.test(clause)) push("surprise");
  }
  const senses = [];
  for (const [re, key] of SENSES) if (re.test(text) && !senses.includes(key)) senses.push(key);

  // What it grants itself, and the gate the sentence puts on it.
  const grants = [];
  // A GRANT IN A SENTENCE ABOUT OTHER CREATURES IS NOT THIS BLOCK'S (D-691):
  // *Every creature that holds it takes Bane on Casting Tests* would otherwise
  // have laid Nefarian's own Class Call on Nefarian.
  const mine = m => !GRANTS_TO_OTHERS.test(sentenceAround(text, m.index ?? 0));
  for (const m of text.matchAll(BONUS_RE)) {
    if (!mine(m)) continue;
    const what = m[2].toLowerCase() === "attack tests" ? "Attack" : m[2];
    grants.push(`+${m[1]} ${what}`);
  }
  for (const m of text.matchAll(BOON_RE)) {
    const sentence = mine(m) ? boonSentence(m[1], m[2]) : null;
    if (sentence) grants.push(sentence);
  }
  for (const m of text.matchAll(BOON_LATE_RE)) {
    const sentence = mine(m) ? boonSentence(m[2], m[1]) : null;
    if (sentence) grants.push(sentence);
  }
  const kept = distinct(grants.filter(g => parseGrant(g) !== null));
  const near = nearClause(text);
  const when = kept.length ? gateFor(text, near) : null;
  // A grant the tool cannot gate is not a grant it can apply: *below half his
  // Health* and *adjacent to another Alliance Footman* it can; *under an open
  // night sky* it cannot, and TABLE_CALL has already sent that entry back.
  return {
    refuses, senses,
    grants: when === false ? [] : kept,
    ...(when ? { when } : {}),
    ...(when === "nearAlly" && near ? { near } : {})
  };
}

/** The sentence a match sits in, for a guard that has to read around it. */
function sentenceAround(text, index) {
  const start = Math.max(text.lastIndexOf(".", index), text.lastIndexOf(";", index)) + 1;
  const stop = text.indexOf(".", index);
  return text.slice(start, stop < 0 ? text.length : stop).trim();
}

/**
 * `While the footman is adjacent to another Alliance Footman` and `While two
 * other Bandits are within 30 feet` → what the gate measures.
 *
 * The block's name is NOT bolded in these sentences the way a summon's is, so
 * it is read as the capitalised run after *another* or *N other*; adjacency is
 * five feet (06 §1's reach).
 */
const HOW_MANY = Object.freeze({ another: 1, other: 1, "each other": 1, "two other": 2, "three other": 3 });
function nearClause(text) {
  const adjacent = /\badjacent to (?:another|an|a)\s+/i.test(text);
  const feet = /\bwithin\s+(\d+)\s*feet\b/i.exec(text);
  if (!adjacent && !feet) return null;
  // NO FALLBACK TO THE BOLD RUN. 14 bolds conditions as readily as creatures,
  // and the Scarlet Chaplain's Sermon ends **Frightened** within thirty feet -
  // which would have made *Frightened* the block to stand beside (D-691).
  const m = /\b(two other|three other|each other|another|other)\s+((?:[A-Z][\w'’-]*)(?:\s+[A-Z][\w'’-]*)*)/.exec(text);
  if (!m) return null;
  const raw = m[2].trim();
  const count = HOW_MANY[m[1].toLowerCase()] ?? 1;
  // *two other Bandits* names the block *Bandit*.
  const name = count > 1 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
  return { name, feet: adjacent ? BASE_REACH_FT : Number(feet[1]), count };
}

/** 06 §1: adjacent is five feet. */
const BASE_REACH_FT = 5;

/**
 * The gate a standing grant carries: 05's own numbers, or the tokens on the
 * scene. `false` means the sentence is gated on something this cannot judge,
 * and the grant is dropped rather than applied always.
 */
function gateFor(text, near) {
  // A bonus that scales with a count is not one flat number (the Bruiser's
  // *+1 for each other Bruiser, to a maximum of +3*).
  if (/\bfor each\b|\bto a maximum of\b/i.test(text)) return false;
  if (/\bbelow half\b/i.test(text)) return "belowHalfHealth";
  if (near) return "nearAlly";
  if (/\bwhile (?:he|she|it|they) (?:stands|is standing)\b/i.test(text)) return "standing";
  // A charge, the light and the sky are the table's call: the tool can measure
  // a distance and not a straight line (D2 SS12).
  if (TABLE_CALL.test(text)) return false;
  if (/\bon a turn in which\b|\bwhile\b|\bagainst\b/i.test(text)) return false;
  return null;
}

/**
 * The seed laid onto a descriptor, filling only what is still at its
 * default: a figure the GM typed stays.
 */
export function mergeSeed(automation, seed) {
  const out = cleanAutomation(automation);
  if (out.kind === "none" && seed.kind) out.kind = seed.kind;
  // The reason travels with `none` and is dropped the moment there is a kind.
  if (!out.reason && seed.reason) out.reason = seed.reason;
  if (out.kind !== "none") out.reason = "";
  if (!out.passive.grants.length && !out.passive.refuses.length && !out.passive.senses.length && seed.passive) {
    out.passive = {
      grants: seed.passive.grants ?? [],
      refuses: seed.passive.refuses ?? [],
      senses: seed.passive.senses ?? [],
      when: seed.passive.when ?? null,
      near: seed.passive.near ?? { name: null, feet: null, count: null }
    };
  }
  if (!out.summon.entry && seed.summon) out.summon = { ...out.summon, ...seed.summon };
  if (out.tick.heal === null && seed.tick) out.tick = { ...out.tick, ...seed.tick };
  if (out.action === null && seed.action) out.action = seed.action;
  if (out.dc === null && seed.dc !== undefined) out.dc = seed.dc;
  if (out.resist === null && seed.resist) out.resist = seed.resist;
  if (out.heal === null && seed.heal !== undefined) out.heal = seed.heal;
  if (out.damage.amount === null && seed.damage) out.damage = { amount: seed.damage.amount, type: seed.damage.type ?? null };
  if (out.uses.max === null && seed.uses) out.uses = { ...seed.uses };
  if (out.inflicts.condition === null && seed.inflicts) out.inflicts = { ...seed.inflicts };
  if (!out.area && seed.area) out.area = seed.area;
  return out;
}

/* -------------------------------------------- */
/*  What a standing passive does (D-691)         */
/* -------------------------------------------- */

/**
 * Whether a gate holds, from a snapshot of what the creature can see of
 * itself and the field. ONE implementation, shared by the passives and by
 * regeneration's `tick.when`, so the two cannot disagree.
 *
 * @param {string|null} when   an `AZEROTH.passiveWhen` key, or null for always
 * @param {object} state
 * @param {{value: number, max: number}} [state.health]
 * @param {Array<{name: string, feet: number}>} [state.nearby]  every other
 *   creature on the scene, by name, with the feet between the two tokens
 * @param {{name: string|null, feet: number|null, count: number|null}} [near]
 * @returns {boolean}
 */
export function gateHolds(when, { health = null, nearby = null } = {}, near = null) {
  if (!when) return true;
  if (when === "belowHalfHealth") {
    if (!health || !(health.max > 0)) return false;
    return health.value < health.max / 2;
  }
  if (when === "standing") return !health || health.value > 0;
  if (when === "nearAlly") {
    // WITH NO SCENE THERE IS NOTHING TO MEASURE, and a creature off the canvas
    // takes the bonus rather than losing it silently: 14 writes the passive as
    // the creature's ordinary state, and a token nobody has placed is not
    // evidence that it stands alone.
    if (!Array.isArray(nearby)) return true;
    if (!near?.name || !(near.feet > 0)) return false;
    const wanted = String(near.name).toLowerCase();
    const found = nearby.filter(n => String(n?.name ?? "").toLowerCase() === wanted && n.feet <= near.feet);
    return found.length >= (near.count ?? 1);
  }
  return true;
}

/**
 * Everything the standing passives on a block add up to, with each gate
 * judged against the state handed in. Pure: the caller measures the field.
 *
 * @param {Array<{automation?: object}>} rows  creature abilities and Boss Actions
 * @param {object} state  as `gateHolds` takes it
 * @returns {{
 *   refuses: string[], conditionImmunities: string[], senses: string[],
 *   defense: number, initiative: number, speed: number, attack: number,
 *   damageRating: number, armorPoint: number,
 *   abilities: Record<string, number>, fortitude: number,
 *   spellpower: Record<string, number>, ward: Record<string, number>,
 *   boons: {skills: Record<string, string[]>, tests: Record<string, number>},
 *   banes: {skills: Record<string, string[]>, tests: Record<string, number>}
 * }}
 */
export function passiveEffects(rows = [], state = {}) {
  const out = {
    refuses: [], conditionImmunities: [], senses: [],
    defense: 0, initiative: 0, speed: 0, attack: 0, damageRating: 0, armorPoint: 0,
    abilities: {}, fortitude: 0, spellpower: {}, ward: {},
    boons: { skills: {}, tests: {} }, banes: { skills: {}, tests: {} }
  };
  const SCALAR = { defense: "defense", initiative: "initiative", speed: "speed", attack: "attack", damageRating: "damageRating", armorPoint: "armorPoint" };
  for (const row of rows) {
    // READ ON EVERY KIND, not on `kind === "passive"` alone: a Water
    // Elemental's Made of Water both swims and Slows what it hits, so its
    // kind is the pressable half and its senses still stand (D-691).
    const p = row?.automation?.passive ?? null;
    if (!p) continue;
    // A refusal and a sense are what the creature IS, so no gate reaches them:
    // nothing in 14 writes *while X, it cannot be Charmed*.
    for (const id of p.refuses ?? []) {
      if (!out.refuses.includes(id)) out.refuses.push(id);
      if (id in AZEROTH.conditions && !out.conditionImmunities.includes(id)) out.conditionImmunities.push(id);
    }
    for (const s of p.senses ?? []) if (!out.senses.includes(s)) out.senses.push(s);
    if (!(p.grants ?? []).length) continue;
    if (!gateHolds(p.when ?? null, state, p.near ?? null)) continue;
    for (const text of p.grants) {
      const g = parseGrant(text);
      if (!g) continue;
      if (SCALAR[g.kind]) out[SCALAR[g.kind]] += g.points;
      else if (g.kind === "ability") out.abilities[g.key] = (out.abilities[g.key] ?? 0) + g.points;
      else if (g.kind === "fortitude") out.fortitude += g.points;
      else if (g.kind === "spellpower") out.spellpower[g.school] = (out.spellpower[g.school] ?? 0) + g.points;
      else if (g.kind === "ward") out.ward[g.school] = (out.ward[g.school] ?? 0) + g.points;
      else if (g.kind === "boon" || g.kind === "bane") {
        const bag = g.kind === "boon" ? out.boons : out.banes;
        if (g.skill) (bag.skills[g.skill] ??= []).push(row?.name ?? text);
        else if (g.test) bag.tests[g.test] = (bag.tests[g.test] ?? 0) + 1;
      }
    }
  }
  return out;
}

/**
 * 14 §1's Boss Action economy: *a creature whose stat block lists Boss Actions
 * holds the number printed with the list, each round [...] the creature may
 * spend one to take one action from its list. They refresh at the top of the
 * round and unspent ones are lost. An action marked ×2 costs two of them.*
 *
 * The timing is the table's - 14 says *after any player character ends their
 * turn* and D2 SS12 forbids automating that - so this counts and refuses and
 * never moves the moment.
 *
 * @param {{value: number|null, max: number|null}} points
 * @param {number} cost  1, or 2 for a `×2` action
 * @returns {{ok: boolean, reason: "none"|"short"|null, held: number, left: number, cost: number}}
 */
export function spendBossPoints({ value = null, max = null } = {}, cost = 1) {
  const want = Math.max(1, Math.trunc(Number(cost)) || 1);
  if (!(max > 0)) return { ok: false, reason: "none", held: 0, left: 0, cost: want };
  const held = value ?? max;
  if (held < want) return { ok: false, reason: "short", held, left: held, cost: want };
  return { ok: true, reason: null, held, left: held - want, cost: want };
}

/**
 * The DC an ability's Test is made against: the descriptor's, else the
 * creature's Spell DC, else a Boss's DC, else 05 §3's standard DC for the
 * tier.
 */
export function abilityDC(automation = {}, system = {}) {
  return automation.dc ?? system.spells?.dc ?? system.bossDC ?? standardDC(system.tier ?? 1);
}

/**
 * What an attack's traits do to its damage: `Pierce N` is penetration, and
 * a trait that carries a school (08 §5's Flaming and kin) makes the damage
 * magical of that school. `traitSchools` maps a trait's base name to its
 * school, read off the traits pack.
 *
 * **THE LAW IS `rules/damage-spec.mjs` AND BOTH DOORS READ IT.** This used to
 * be the only reader of a school trait in the system: a character's blow was
 * built `{kind: "physical"}` off the Rating alone, so Sulfuras' Greater Flaming
 * was a mace (08 §7). 14's block names a school trait BARE, which is why a
 * trait with no grade still converts - see the module's own note.
 */
export function attackSpecFor(attack = {}, traitSchools = {}) {
  return weaponDamageSpec({ rating: attack.damage ?? 0, traits: attack.traits ?? [] }, traitSchools);
}

/**
 * What `review` says of a row's descriptor: a cost off a pool the block does
 * not hold is refused; a figure that disagrees with the prose's one clear
 * number is a note to read.
 * @returns {{reasons: Array<{code: string, params?: object}>, notes: Array<{code: string, params?: object}>}}
 */
export function reviewAutomation(row = {}, { momentum = null, power = null } = {}) {
  const reasons = [];
  const notes = [];
  const a = cleanAutomation(row.automation);
  if (!hasAutomation(a)) return { reasons, notes };
  const name = row.name ?? "";
  if (a.cost.pool && (a.cost.amount ?? 0) > 0) {
    const has = a.cost.pool === "momentum" ? momentum !== null && momentum !== undefined : power !== null && power !== undefined;
    if (!has) reasons.push({ code: "AutomationPool", params: { name, pool: a.cost.pool } });
  }
  const seed = seedAutomation(row.description);
  if (seed.damage && a.damage.amount !== null && (a.damage.amount !== seed.damage.amount || (seed.damage.type && a.damage.type !== seed.damage.type))) {
    notes.push({ code: "AutomationDamage", params: { name, have: a.damage.amount, want: seed.damage.amount } });
  }
  if (seed.dc !== undefined && a.dc !== null && a.dc !== seed.dc) notes.push({ code: "AutomationDC", params: { name, have: a.dc, want: seed.dc } });
  if (seed.resist && a.resist && a.resist !== seed.resist) notes.push({ code: "AutomationResist", params: { name, have: a.resist, want: seed.resist } });
  return { reasons, notes };
}
