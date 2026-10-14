/**
 * What a consumable does when it is used (08 §12, §13; 2026-09-06). Pure,
 * no Foundry imports (CLAUDE.md §3).
 *
 * 08 prints every one of these as a table row and a paragraph, and the gear
 * parser carries both into the pack: a `**Effect.**` run on a draught, an
 * elixir, a dressing and a poison; `**Applies.**` and `**Goes on.**` on a
 * stone or an oil. The descriptor here is what pressing **Use** does, READ
 * OFF THOSE RUNS ONLY WHERE THE WORDS ARE UNAMBIGUOUS - D-647's rule for a
 * creature's ability and D-657's for a spell. Where they are not, the row
 * carries a `note` and the table decides; `kind: "none"` is a thing with no
 * Use button at all.
 *
 * Three shapes, because 08 gives three:
 *
 * - **Drunk or applied to a body** (§12's restoratives, elixirs, utility
 *   draughts and dressings): the numbers land on the user, and what lasts
 *   is an Active Effect for the stated time.
 * - **Laid on a thing** (§13's stones and oils, §12's poisons): *a stone or
 *   an oil grants what a section 6 affix would, for one fight... nothing
 *   about the item changes, and when the hour is up it is what it was.* So
 *   the item is never rewritten: the coating is a flag the weapon's derived
 *   data reads, and the Use asks which item it goes on.
 * - **Thrown** (§13's explosives): damage in a radius with a Reflex Test
 *   where one is named, which is the ability card's own shape.
 */

// 08 §12's tick poisons (O-114, D-770): *N damage a turn for M turns*.
import { readPoisonTick } from "./ticks.mjs";

/**
 * The shelves 08 gives a Use to. A tool, a device and a written thing are
 * used at the table and not by a button: a device's Boon is claimed on a roll
 * (D2 SS12 forbids automating the table's call). SS20's gear is the Epic
 * consumables, which are drunk like any other.
 *
 * **A MEAL IS NOT A USE, AND IT IS NOT NOTHING** (D-733, superseding this
 * comment's *a meal grants nothing the chapter states*). 08 SS12's food and
 * drink is spent at a Short Rest rather than by a button - food for the
 * Health, drink for the Mana - so the shelf still takes no Use, and what a row
 * IS lives on `GearData.provision` through `rules/provisions.mjs`.
 */
export const USABLE_SHELVES = Object.freeze([
  /· Restoratives$/, /· Elixirs$/, /· Utility draughts$/, /· Poisons$/,
  /· Bandages and dressings$/, /· Explosives$/, /· Stones and oils$/, /^20\b/,
  // 14's Manuals: five of them say **Grants.** N XP toward one skill and not
  // one could be used, so the experience a book gives had to be typed in by
  // hand (the lead, 2026-09-07). A book is read at the table rather than in a
  // turn, so it takes no action rung.
  /· Manuals$/
]);

/** Whether a catalogue shelf carries things a button uses. */
export function usableShelf(section) {
  return USABLE_SHELVES.some(re => re.test(String(section ?? "")));
}

/** The kinds a Use can take. `none` is the absence. */
export const CONSUMABLE_KINDS = Object.freeze([
  "none", "restore", "elixir", "draught", "dressing", "poison", "coating", "explosive",
  // A book read rather than drunk: using it grants what its **Grants.** run says.
  "grant"
]);

/** What a coating may be laid on, as 08 §13's *Goes on* column names it. */
export const GOES_ON = Object.freeze(["weapon", "melee", "twoHanded", "ammunition", "shield", "armor"]);

/** The descriptor with nothing set. */
export function emptyUse() {
  return {
    kind: "none",
    action: null,
    target: "self",
    appliesTo: null,
    heal: { health: null, mana: null, fatigue: null },
    ends: [],
    statuses: [],
    changes: [],
    trait: null,
    rating: null,
    damage: { amount: null, type: null },
    resist: null,
    area: "",
    duration: { value: null, units: null },
    perRest: null,
    // 14's Manuals: the experience a book grants when it is read.
    xp: null,
    note: ""
  };
}

const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};
const oneOf = (v, keys) => (typeof v === "string" && keys.includes(v) ? v : null);

/**
 * A stored descriptor made valid: a value outside its vocabulary is nulled
 * rather than refusing the document. Runs in `migrateData`, before a
 * `choices` can refuse the item at load (CLAUDE.md §15).
 *
 * **ONLY THE KEYS THAT ARE THERE**, because core runs `migrateData` over
 * PARTIAL update data too: rebuilding the object would write a null over
 * every field the update did not name (D-671).
 */
export function cleanUse(raw, { conditions = [], schools = [], resiliences = [], actions = [] } = {}) {
  if (!raw || typeof raw !== "object") return emptyUse();
  const out = {};
  const has = key => key in raw;
  if (has("kind")) out.kind = oneOf(raw.kind, CONSUMABLE_KINDS) ?? "none";
  if (has("action")) out.action = oneOf(raw.action, actions);
  if (has("target")) out.target = oneOf(raw.target, ["self", "item", "area"]) ?? "self";
  if (has("appliesTo")) out.appliesTo = oneOf(raw.appliesTo, GOES_ON);
  if (has("heal")) {
    out.heal = {
      health: num(raw.heal?.health), mana: num(raw.heal?.mana), fatigue: num(raw.heal?.fatigue)
    };
  }
  const ids = list => (Array.isArray(list) ? list.filter(id => !conditions.length || conditions.includes(id)) : []);
  if (has("ends")) out.ends = ids(raw.ends);
  if (has("statuses")) out.statuses = ids(raw.statuses);
  if (has("changes")) {
    out.changes = (Array.isArray(raw.changes) ? raw.changes : [])
      .filter(c => c && typeof c.key === "string" && c.key)
      .map(c => ({
        key: c.key,
        type: typeof c.type === "string" && c.type ? c.type : "add",
        value: String(c.value ?? ""),
        phase: oneOf(c.phase, ["initial", "final"]) ?? phaseFor(c.key)
      }));
  }
  if (has("trait")) out.trait = typeof raw.trait === "string" && raw.trait ? raw.trait : null;
  if (has("rating")) out.rating = num(raw.rating);
  if (has("damage")) {
    out.damage = {
      amount: num(raw.damage?.amount),
      type: oneOf(raw.damage?.type, ["physical", ...schools])
    };
  }
  if (has("resist")) {
    out.resist = raw.resist && oneOf(raw.resist.resilience, resiliences)
      ? { resilience: raw.resist.resilience, dc: num(raw.resist.dc) }
      : null;
  }
  if (has("area")) out.area = typeof raw.area === "string" ? raw.area : "";
  if (has("duration")) {
    out.duration = { value: num(raw.duration?.value), units: oneOf(raw.duration?.units, ["rounds", "turns", "minutes", "hours", "days"]) };
  }
  if (has("perRest")) out.perRest = oneOf(raw.perRest, ["short", "long"]);
  if (has("xp")) out.xp = num(raw.xp);
  if (has("note")) out.note = typeof raw.note === "string" ? raw.note : "";
  return out;
}

/**
 * WHICH PHASE A CHANGE BELONGS IN (CLAUDE.md §6). A stored base moves in
 * `initial`, before the actor works anything out from it: an elixir's +2
 * Strength has to raise the modifier and everything the modifier feeds, and
 * a `final` change to `abilities.str.value` lands after `prepareDerivedData`
 * and moves nothing at all (the elixir test, 2026-09-06). A number the
 * actor DERIVES - Speed, Armor Points, Defense, a Ward - is only there in
 * `final`, so a change to one must wait for it.
 */
export function phaseFor(key) {
  return /^system\.abilities\.[a-z]+\.value$/.test(String(key ?? "")) ? "initial" : "final";
}

/**
 * HOW LONG A POISON LASTS, IN ROUNDS (08 §12, D-719).
 *
 * *It lasts for one minute and lands on every hit the weapon makes in that
 * time.* 05 §10 makes a round *roughly six seconds*, so a minute is ten of
 * them; the number is derived from the chapter rather than typed beside it,
 * and `consumables.test.mjs` reads both sentences back off 08 and 05.
 */
export const ROUND_SECONDS = 6;
export const POISON_ROUNDS = 60 / ROUND_SECONDS;

/**
 * WHEN A COATING COMES OFF (08 §12, §13).
 *
 * **A poison no longer leaves with the blow** (D-719, superseding D-670's
 * *leaves with the blow* in part): 08 §12 says it *lasts for one minute and
 * lands on every hit the weapon makes in that time*, so the clock is the only
 * thing that takes it off. A stone or an oil *lasts an hour*, which is a Short
 * Rest (05: one hour, uninterrupted). Everything else is the bearer's to wipe
 * off by hand, which is the door the sheet gives.
 *
 * **OUT OF A FIGHT IS STILL NOT ON THE BLOW.** A blade coated before initiative
 * carries a `laid` stamp with no fight in it, and the sentence does not change
 * for it: it lands on every hit, the hand and both rests take it off, and
 * `coatingStartsIn` hands it the clock the moment a fight begins. Reading the
 * absent fight as *leaves with the blow* would put D-670 back for exactly the
 * blade a Rogue prepares before the door opens.
 *
 * **A coating laid before D-719 carries no `laid` stamp at all** and keeps the
 * old behaviour, because it was applied under the old sentence and a world that
 * has not had a rest since would otherwise find a poison that never comes off.
 */
export function endsOnHit(coating) {
  return coating?.kind === "poison" && !coating.laid;
}

/**
 * Whether this coating is waiting for a fight to start counting (08 §12, D-719).
 *
 * A blade coated out of a fight has no round to count from, so it used to last
 * the whole session: `coatingExpired` cannot judge it and `endsOnHit` will not
 * take it off. `AzerothCombat#_fightStart` asks this and stamps the fight it
 * has just entered, so the minute runs from the first round the poison is
 * carried into rather than from nothing at all.
 *
 * **A STAMP NAMING A FIGHT THAT IS NO LONGER RUNNING IS THE SAME ABSENCE**
 * (the final review, 2026-09-13). `coatingExpired` judges nothing whose
 * `combatId` is not the fight asking, so a poison whose own fight has been
 * deleted, or reset to round 0, would count against a clock nobody is turning
 * — every hit in every later fight, until a rest. `_leaveFight` takes such a
 * coating off when the fight ends and this is the net under it: the caller
 * passes whether the NAMED fight is still live, and a dead one restarts the
 * minute in the fight now beginning.
 *
 * Only a poison counts rounds — a stone or an oil is judged by the rest — and a
 * coating with no stamp is pre-D-719 and is left where it is.
 *
 * @param {object|null} coating
 * @param {{laidFightLive?: boolean}} [now]  whether the fight `laid.combatId`
 *   names still exists and has started. Defaults to `true`, which is the
 *   conservative reading: a caller that does not know only restarts a coating
 *   naming no fight at all, exactly as this did before.
 */
export function coatingStartsIn(coating, { laidFightLive = true } = {}) {
  if (coating?.kind !== "poison" || !coating.laid) return false;
  return !coating.laid.combatId || !laidFightLive;
}

/**
 * Whether this coating's minute belongs to the fight that is ending
 * (08 §12, D-719; the final review, 2026-09-13).
 *
 * **THE MINUTE DOES NOT OUTLIVE THE FIGHT IT WAS USED IN** (the orchestrator's
 * ruling, for the lead to overturn). 08 §12 gives a poison one minute and this
 * system counts minutes in a fight's rounds and in nothing else; a poison laid
 * at round 3 of one fight and never expired there is a poison that lands on
 * every hit of the next fight, and the one after, until somebody rests. The
 * fiction agrees: the minute ran out while the party walked to the next room.
 *
 * Only a poison. A stone or an oil *lasts an hour* (08 §13), which is a rest
 * and not a fight, so one laid during the fight survives it.
 *
 * @param {object|null} coating
 * @param {string|null} combatId  the fight that is ending
 */
export function coatingEndsWithFight(coating, combatId) {
  return coating?.kind === "poison" && Boolean(combatId) && coating.laid?.combatId === combatId;
}

/**
 * Whether a coating's minute is up (08 §12, D-719).
 *
 * The clock is the FIGHT's rounds, because that is the only clock this system
 * counts. A poison laid outside a fight has no round to count from until one
 * begins (`coatingStartsIn` above); a poison laid in ANOTHER fight is not
 * judged by this one's round number, which would otherwise expire it on round 1.
 *
 * @param {object|null} coating
 * @param {{combatId?: string|null, round?: number|null}} now
 */
export function coatingExpired(coating, { combatId = null, round = null } = {}) {
  const laid = coating?.laid ?? null;
  if (!laid?.combatId || !combatId || laid.combatId !== combatId) return false;
  const rounds = Math.max(1, Math.trunc(Number(coating.rounds)) || POISON_ROUNDS);
  const from = Number(laid.round);
  const now = Number(round);
  if (!Number.isFinite(from) || !Number.isFinite(now)) return false;
  return now - from >= rounds;
}

/** Whether a rest of this length ends what is on the blade. */
export function endsOnRest(coating, kind = "short") {
  if (!coating) return false;
  return kind === "long" || kind === "short";
}

/**
 * What a coating puts on the card when the blow lands: the thing's name,
 * its own words, and the condition it lays where it names one. The card
 * already draws this shape for 08 §5's Effect traits (D-662), so a poison
 * arrives beside them rather than inventing a second place to look.
 *
 * **ENVENOM RIDES IT** (04, D-711 phase 2): *a poison you apply deals 1 more
 * damage per rank*, and the rank was stamped on the coating when it was laid,
 * so a Rogue who took the talent after coating the blade does not benefit from
 * it retroactively. The poison's OWN damage is 08's `rating` and reaches the
 * weapon through `WeaponData#prepareDerivedData` (D-670); this is the talent's
 * point on top, and it is only added where the poison deals damage at all -
 * *1 more* is not *1*.
 *
 * @returns {{name: string, text: string, condition: {id: string}|null,
 *            extraDamage: number}|null}
 */
export function coatingFired(coating, { success = false } = {}) {
  if (!coating || !success) return null;
  if (!coating.statuses?.length && !coating.text) return null;
  const envenom = coating.kind === "poison" && (Number(coating.rating) || 0) > 0
    ? Math.max(0, Math.trunc(Number(coating.envenom)) || 0)
    : 0;
  // **A TICK POISON CARRIES ITS TICK AND ITS TEST TO THE CARD** (08 §12, O-114;
  // D-770): the target's Resilience Test is a button there, and a failure lays
  // the ticks. A blade coated before D-770 carries no stamp, so the tick is
  // read off the coating's own words.
  const tick = coating.kind === "poison" && coating.resist?.resilience
    ? (coating.tick ?? readPoisonTick(coating.text ?? ""))
    : null;
  return {
    name: coating.name ?? "",
    text: coating.text ?? "",
    condition: coating.statuses?.length ? { id: coating.statuses[0], value: null } : null,
    extraDamage: envenom,
    ...(tick ? { tick, resist: { resilience: coating.resist.resilience, dc: coating.resist.dc ?? null } } : {})
  };
}

/**
 * **THE TICK A POISON LAYS AFTER A FAILED TEST** (08 §12, O-114; D-770):
 * *Body Resilience DC 13 or 2 damage a turn for 3 turns*, read off the Use's own
 * note - the run after the Test, which `seedUse` keeps where the failure names
 * no condition. Null for anything else: a poison with no Test, a condition
 * poison, a stone or an oil.
 *
 * @param {object|null} use  an item's `system.use`
 * @returns {object|null}  `rules/ticks.mjs`'s stored shape
 */
export function poisonTick(use) {
  if (use?.kind !== "poison" || !use?.resist?.resilience) return null;
  return readPoisonTick(use.note ?? "");
}

/** Whether a thing has a Use at all. */
export function hasUse(use) {
  return Boolean(use) && use.kind !== "none";
}

/**
 * MARKING ONE OFF (D-733). The one rule for spending a single item, shared by
 * the **Use** button and by the food and drink a Short Rest eats.
 *
 * `held` is the item's `system.quantity`. A **null** quantity is 08's
 * unlimited - a weapon carries one and `useGear` must not write to it - so
 * nothing is returned and nothing is written. One or fewer is the last, and
 * the item goes; anything else counts down.
 *
 * It returns the WRITE rather than performing it, so it stays pure and the two
 * callers do their own `item.delete()` or `item.update()`.
 *
 * @param {number|null|undefined} held
 * @returns {{delete: true}|{quantity: number}|null}
 */
export function spendOne(held) {
  if (held === null || held === undefined) return null;
  const n = Math.trunc(Number(held));
  // A quantity that cannot be read is not a count: there is no countable one
  // left, so the thing goes rather than being written a NaN the schema refuses.
  if (!Number.isFinite(n)) return { delete: true };
  return n <= 1 ? { delete: true } : { quantity: n - 1 };
}

/**
 * WHAT APPLYING THIS COSTS (08 §12, 02 §7, 04; the lead's item 27).
 *
 * 08 §12 applies a poison *as a Half-Action*, and two things say otherwise:
 *
 * - **Deft Hands** (04): *applying a poison during a weapon attack does not
 *   cost an action.*
 * - **Poisoner** (02 §7, the Rogue at level 14): *apply a poison as part of an
 *   attack rather than as a Half-Action.*
 *
 * Both were prose on the sheet and neither reached the door, so a Rogue who
 * had bought either still paid half a turn for the coating.
 *
 * - **Coated Blades** (04, the Ranger's Survival; D-773): *You may apply a poison
 *   you carry without spending an action* - at any moment, where Deft Hands
 *   names a weapon attack.
 *
 * It touches **a poison only**: none of the three mentions a stone, an oil or a
 * draught, and 08 §13's hour-long coatings keep their Half-Action.
 *
 * @param {object|null} use
 * @param {{deftHands?: number, poisoner?: boolean, coatedBlades?: boolean}} [held]
 * @returns {string|null} the action rung, or null for free
 */
export function coatingAction(use, { deftHands = 0, poisoner = false, coatedBlades = false } = {}) {
  const action = use?.action ?? null;
  if (use?.kind !== "poison") return action;
  return (Number(deftHands) || 0) > 0 || poisoner === true || coatedBlades === true ? null : action;
}

/* -------------------------------------------- */
/*  Reading the chapter's own words              */
/* -------------------------------------------- */

/** HTML to flat text, `<strong>` kept as `**` so a condition can be found. */
export function flatten(html) {
  return String(html ?? "")
    .replace(/<\/?(strong|b)>/g, "**")
    .replace(/<\/p>\s*<p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** The text after a bold lead - `**Effect.** Restore 4 Health` → `Restore 4 Health`. */
export function runAfter(text, lead) {
  const m = new RegExp(`\\*\\*${lead}\\.\\*\\*\\s*([^\\n]*)`).exec(text);
  return m ? m[1].trim() : null;
}

/** One change, in v14's shape, in the phase its key belongs to. */
function change(key, value) {
  return { key, type: "add", value: String(value), phase: phaseFor(key) };
}

const ABILITIES = Object.freeze({
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha"
});

/** Every `**Condition**` a run names, as lowercase ids. */
function conditionsIn(text, known = []) {
  const out = [];
  for (const m of String(text).matchAll(/\*\*([A-Za-z][A-Za-z' ]*?)(?: (\d+))?\*\*/g)) {
    const id = m[1].trim().toLowerCase().replace(/\s+/g, "");
    if ((!known.length || known.includes(id)) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** *for ten minutes*, *for an hour*, *for a minute*, *for six hours* → a duration. */
export function durationIn(text) {
  const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twenty: 20, thirty: 30 };
  const m = /for (\d+|a|an|one|two|three|four|five|six|ten|twenty|thirty) (minute|hour|turn|round|day)s?/i.exec(text);
  if (!m) return { value: null, units: null };
  const value = /^\d+$/.test(m[1]) ? Number(m[1]) : (WORDS[m[1].toLowerCase()] ?? null);
  return value === null ? { value: null, units: null } : { value, units: `${m[2].toLowerCase()}s` };
}

/** 08 §13's *Goes on* column, read strictly. An unknown phrase is no target at all. */
export function goesOnKey(phrase) {
  const s = String(phrase ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (/^melee weapons?$/.test(s)) return "melee";
  if (/^two-handed weapons?$/.test(s)) return "twoHanded";
  if (/^a bundle of ammunition$/.test(s)) return "ammunition";
  if (/^shields?$/.test(s)) return "shield";
  if (/^one suit$/.test(s)) return "armor";
  if (/^weapons?$/.test(s)) return "weapon";
  return null;
}

/**
 * Whether a coating may be laid on an item. The keys are 08 §13's own
 * column, and the item is read the way `rules/affixes.mjs#canGoOn` reads
 * one - by type, by `shield`, by a range, by the bundle's `fits`.
 */
export function goesOn(appliesTo, item) {
  if (!appliesTo || !item) return false;
  const sys = item.system ?? {};
  const isShield = sys.shield === true;
  const isArmor = item.type === "armor" && !isShield;
  const isWeapon = item.type === "weapon";
  const isShot = isWeapon && Array.isArray(sys.fits) && sys.fits.length > 0;
  const isRanged = isWeapon && sys.range !== null && sys.range !== undefined;
  switch (appliesTo) {
    case "weapon": return isWeapon && !isShot;
    case "melee": return isWeapon && !isRanged && !isShot;
    case "twoHanded": return isWeapon && !isShot && (sys.traits ?? []).some(t => /two-handed|greatsword|maul|polearm/i.test(String(t)));
    case "ammunition": return isShot;
    case "shield": return isShield;
    case "armor": return isArmor;
    default: return false;
  }
}

/**
 * The descriptor a catalogue entry's own words state.
 *
 * @param {{name: string, section: string, description: string}} entry
 * @param {{conditions?: string[], schools?: string[]}} [known]
 * @returns {object} the descriptor; `kind: "none"` where nothing is readable
 */
export function seedUse({ name = "", section = "", description = "" } = {}, { conditions = [], schools = [] } = {}) {
  const use = emptyUse();
  const shelf = String(section);
  // A shelf decides whether a thing has a Use at all.
  if (!usableShelf(shelf)) return use;
  const text = flatten(description);

  // ---- 14's Manuals: read once, and the XP is granted.
  if (/· Manuals$/.test(shelf)) {
    const grants = runAfter(text, "Grants");
    const xp = /(\d+)\s*XP/i.exec(grants ?? "");
    if (!xp) return use;
    use.kind = "grant";
    // Reading is downtime, not a turn: no action rung, and the note carries
    // the chapter's own words so the card says what it gave.
    use.action = null;
    use.target = "self";
    use.xp = Number(xp[1]);
    use.note = grants.trim();
    return use;
  }

  // ---- 08 §13's stones and oils: laid on a thing, for an hour.
  if (/· Stones and oils$/.test(shelf)) {
    const applies = runAfter(text, "Applies");
    const on = runAfter(text, "Goes on");
    use.kind = "coating";
    use.action = "half";
    use.target = "item";
    use.appliesTo = goesOnKey(on);
    use.duration = { value: 1, units: "hours" };
    if (applies) {
      const rating = /^\+(\d+) Damage Rating$/.exec(applies);
      const armor = /^\+(\d+) Armor Point/.exec(applies);
      const trait = /^\*\*([A-Za-z' -]+)\*\*\s*\((Lesser|Greater)\)$/.exec(applies);
      if (rating) use.rating = Number(rating[1]);
      else if (armor) use.rating = Number(armor[1]);
      else if (trait) use.trait = `${trait[1]} (${trait[2]})`;
      else use.note = applies;
    }
    if (!use.appliesTo) use.note = [use.note, on].filter(Boolean).join(" ");
    return use;
  }

  const effect = runAfter(text, "Effect");
  if (!effect) return use;

  // ---- 08 §12's poisons: laid on a weapon, and they land when it lands.
  if (/· Poisons$/.test(shelf)) {
    use.kind = "poison";
    use.action = "half";
    use.target = "item";
    use.appliesTo = "weapon";
    use.duration = { value: 1, units: "minutes" };
    // *+2 damage on each hit* (08 §12, D-719). It read *on the next hit* until
    // the poison stopped leaving with the blow, and the parse was keyed on
    // those words - so Blade venom's whole effect fell through to a `note` and
    // the +2 reached nothing at all.
    const more = /^\+(\d+) damage on (?:each|the next) hit$/.exec(effect);
    if (more) use.rating = Number(more[1]);
    const test = /^(Body|Reflex|Spirit) Resilience DC (\d+) or (.+)$/.exec(effect);
    if (test) {
      use.resist = { resilience: test[1].toLowerCase(), dc: Number(test[2]) };
      use.statuses = conditionsIn(test[3], conditions);
      if (!use.statuses.length) use.note = test[3];
    } else {
      use.statuses = conditionsIn(effect, conditions);
      if (!use.rating && !use.statuses.length) use.note = effect;
    }
    return use;
  }

  // ---- 08 §13's explosives: thrown, and the radius is what it covers.
  if (/· Explosives$/.test(shelf)) {
    use.kind = "explosive";
    use.action = "half";
    use.target = "area";
    const damage = /(\d+) damage in (\d+) feet/.exec(effect);
    if (damage) {
      use.damage = { amount: Number(damage[1]), type: null };
      use.area = `${damage[2]} ft radius`;
    }
    const radius = /in (\d+) feet/.exec(effect);
    if (!use.area && radius) use.area = `${radius[1]} ft radius`;
    const test = /(Body|Reflex|Spirit) Resilience DC (\d+) or ([^,]+)/.exec(effect);
    if (test) {
      use.resist = { resilience: test[1].toLowerCase(), dc: Number(test[2]) };
      use.statuses = conditionsIn(test[3], conditions);
    } else {
      use.statuses = conditionsIn(effect, conditions);
    }
    if (!use.damage.amount && !use.statuses.length && !use.resist) use.note = effect;
    return use;
  }

  // ---- 08 §12: drunk, or laid on somebody.
  // *Restore 4 Health and 4 Mana*: the second number carries no verb of its own.
  const restore = /[Rr]estore\b/.test(effect) ? [...effect.matchAll(/(\d+) (Health|Mana)\b/g)] : [];
  const fatigue = /Remove (\d+) Fatigue/.exec(effect);
  const attributes = [...effect.matchAll(/\+(\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/g)];
  const speed = /Speed \+(\d+) feet/.exec(effect);
  const armorPoint = /\+(\d+) Armor Point/.exec(effect);
  // *End **Numbed*** opens a row and *and end **Bleeding*** closes one.
  const ends = /\bends?\b\s+((?:\*\*[^*]+\*\*(?:,?\s*(?:and\s+)?)?)+)/i.exec(effect);

  for (const m of restore) {
    if (m[2] === "Health") use.heal.health = Number(m[1]);
    else use.heal.mana = Number(m[1]);
  }
  if (fatigue) use.heal.fatigue = Number(fatigue[1]);
  for (const m of attributes) {
    const key = ABILITIES[m[2].toLowerCase()];
    if (key) use.changes.push(change(`system.abilities.${key}.value`, m[1]));
  }
  if (speed) use.changes.push(change("system.speed", speed[1]));
  if (armorPoint) use.changes.push(change("system.ap.body", armorPoint[1]));
  if (ends) use.ends = conditionsIn(ends[1], conditions);
  use.duration = durationIn(effect);

  // A Ward names a school the entry does not (08 §12: *brewed for one school
  // and named for it*), so the school is the table's to say.
  const ward = /Ward (\d+) in one named school/.exec(effect);
  if (ward) use.note = effect;

  const carries = use.heal.health !== null || use.heal.mana !== null || use.heal.fatigue !== null
    || use.changes.length || use.ends.length;
  if (!carries) {
    // A meal grants nothing and the table's dash is the whole row.
    if (!effect || effect === "—") return use;
    use.kind = "draught";
    use.action = "half";
    use.note = effect;
    return use;
  }

  if (/· Bandages and dressings$/.test(shelf)) {
    use.kind = "dressing";
    use.action = "half";
    if (/once per Short Rest/i.test(effect)) use.perRest = "short";
  } else if (/· Elixirs$/.test(shelf)) {
    use.kind = "elixir";
    use.action = "half";
    if (use.duration.value === null) use.duration = { value: 1, units: "hours" };
  } else if (/· Restoratives$/.test(shelf)) {
    use.kind = "restore";
    use.action = "half";
  } else {
    use.kind = "draught";
    use.action = "half";
  }
  return use;
}

/**
 * What pressing **Use** does, as the parts a sheet prints.
 *
 * Keys, not words: this module is pure and the words are `lang/en.json`'s.
 * 82 gear items carried a Use descriptor and no sheet drew any of it — a
 * Healing draught's sheet said what it looked like and not what the button
 * would do (the lead, 2026-09-07).
 *
 * @returns {{kind: string, action: string|null, target: string|null,
 *            goesOn: string|null, note: string}|null}
 */
export function useParts(use) {
  if (!hasUse(use)) return null;
  return {
    kind: use.kind,
    action: use.action ?? null,
    // A coating names what it is laid on rather than a target (08 §13).
    goesOn: use.kind === "coating" ? (use.appliesTo ?? null) : null,
    target: use.kind === "coating" ? null : (use.target ?? null),
    note: typeof use.note === "string" ? use.note : ""
  };
}

/**
 * What the card says a use did, as short lines. The caller localises; this
 * returns keys and numbers so the rule stays pure.
 */
export function useLines(use) {
  const lines = [];
  if (use.heal?.health) lines.push({ code: "health", params: { n: use.heal.health } });
  if (use.heal?.mana) lines.push({ code: "mana", params: { n: use.heal.mana } });
  if (use.heal?.fatigue) lines.push({ code: "fatigue", params: { n: use.heal.fatigue } });
  for (const id of use.ends ?? []) lines.push({ code: "ends", params: { condition: id } });
  return lines;
}
