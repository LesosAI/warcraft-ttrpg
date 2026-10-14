/**
 * The Classic tooltip reader (D-685). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * `nexus-devs/wow-classic-items` keeps a record's identity in five fields and
 * **everything else in the tooltip**: every stat, every resistance, every
 * proc, every Use effect, every class restriction and every set bonus is a
 * line of display text. So the tooltip is the source, and this module is the
 * only thing that reads it. The conversion law reads `Parsed`.
 *
 * **Every line lands in exactly one bucket or in `unparsed[]`.** Nothing is
 * dropped in silence: a line this grammar does not know is carried out with
 * its index so the report can name it and the census can count it. Boilerplate
 * — the name echo, the slot and subclass echoes, `Phase N`, `Item Level N`,
 * `Binds…`, `Unique…`, `Durability`, `Requires Level N`, `Sell Price:`, the
 * WotLK socket furniture — is recognised BY NAME and discarded, so `unparsed`
 * holds real unknowns rather than noise nobody will ever read.
 *
 * **`format` is a hint for one thing only: the set block.** `Misc` opens it,
 * `indent` lines are the sibling pieces, `Poor` lines are the bonuses. Every
 * other decision is made on the words, because `Uncommon` marks a proc on one
 * item and a plain stat line on the next.
 *
 * **The dump is WotLK-era and its wording is not Classic's.** The records are
 * Classic items, but the tooltips were re-rendered against a later client:
 * `+N damage done by magical spells` is `Equip: Increases spell power by N`,
 * every percentage is a *rating*, and gem sockets appear on items that never
 * had one. Both vocabularies are in the table — the Classic wording is kept
 * because a re-fetch at an earlier commit would carry it — and the socket
 * lines are boilerplate.
 *
 * **The dps line is not trusted.** `(58.33 damage per second)` is recomputed
 * from `(min + max) / 2 / speed`, because the law ranks weapons against each
 * other and one rounded string in the middle of that is not worth the risk.
 *
 * **Hunter is Ranger.** 02's class of that name is what a `Classes:` line
 * means here; no other WoW class name moves.
 */

/** The schools a damage line, a resistance or a proc may name. */
const SCHOOLS = ["Fire", "Frost", "Nature", "Shadow", "Arcane", "Holy"];
const SCHOOL_RE = SCHOOLS.join("|");

/** 02's name for the class WoW calls Hunter. Nothing else is renamed. */
export const CLASS_NAMES = Object.freeze({ Hunter: "Ranger" });

/** The five attributes a `+N X` line may carry, keyed as the law reads them. */
const STAT_KEYS = Object.freeze({
  Strength: "strength", Agility: "agility", Stamina: "stamina",
  Intellect: "intellect", Spirit: "spirit"
});

/** The upstream `slot` words, echoed back as their own tooltip line. */
const SLOT_WORDS = new Set([
  "One-Hand", "Two-Hand", "Main Hand", "Off Hand", "Held In Off-hand",
  "Ranged", "Thrown", "Relic", "Head", "Neck", "Shoulder", "Back", "Chest",
  "Wrist", "Hands", "Waist", "Legs", "Feet", "Finger", "Trinket",
  "Shirt", "Tabard", "Bag", "Ammo", "Projectile", "Quiver", "Non-equippable"
]);

/** The upstream `subclass` words, echoed back on the right of the same row. */
const SUBCLASS_WORDS = new Set([
  "Cloth", "Leather", "Mail", "Plate", "Shield", "Miscellaneous",
  "Sword", "Dagger", "Axe", "Mace", "Staff", "Polearm", "Fist Weapon",
  "Bow", "Crossbow", "Gun", "Wand", "Thrown", "Libram", "Idol", "Totem"
]);

/**
 * Lines that carry nothing the law reads. Each is matched by NAME rather than
 * swept up by a catch-all, which is what keeps `unparsed` honest.
 */
const BOILERPLATE = [
  /^Phase \d+$/i,
  /^Item Level \d+$/i,
  /^Sell Price:?$/i,
  /^Durability \d+ ?\/ ?\d+$/i,
  /^\(\d+(?:\.\d+)? damage per second\)$/i,
  /^(?:Blue|Red|Yellow|Meta|Prismatic) Socket$/i,
  /^Socket Bonus: .+$/i,
  /^Requires (?:Level \d+|Blacksmithing|Engineering|Leatherworking|Tailoring|Alchemy|Enchanting|Jewelcrafting|Inscription|Mining|Herbalism|Skinning|Cooking|First Aid|Fishing|Riding|Artisan|Journeyman|Expert|Master)\b.*$/i,
  /^(?:Requires )?(?:Classic|The Burning Crusade|Wrath of the Lich King)$/i,
  /^Cooldown remaining:/i,
  /^Duration: /i,
  /^Racial(?: Leader)?$/i,
  /^Conjured Item$/i,
  /^Quest Item$/i,
  /^Item Set:/i,
  /^<Right Click to (?:Read|Open)>$/i,
  /^Speed \d+(?:\.\d+)?$/i // taken by the damage rule; here so a stray one is not an unknown
];

/** `(2) Set : Increases spell power by 12.` — the bonus lines of a set block. */
const SET_BONUS = /^\((\d+)\) Set\s*:\s*(.+?)\.?$/;
/** `Augur's Regalia (0/5)` — the head of a set block, at `format: "Misc"`. */
const SET_HEAD = /^(.+?) \(0\/(\d+)\)$/;

/** A cooldown run at the tail of a `Use:` line, in whatever shape it takes. */
const COOLDOWN = /\s*\((\d+)\s*(Hour|Hours|Min|Mins|Minute|Minutes|Sec|Secs|Second|Seconds|s|m|h)(?:,\s*(\d+)\s*(Min|Sec|Secs|Seconds)\s*)?\s*[Cc]ooldown\)\.?$/;

/** Seconds, from a cooldown match. */
function cooldownSeconds(m) {
  if (!m) return null;
  const unit = u => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
  let total = Number(m[1]) * unit(m[2]);
  if (m[3]) total += Number(m[3]) * unit(m[4]);
  return total;
}

/** `for 20 sec` / `for 5 min` / `over 30 sec`, in seconds, or null. */
function durationOf(text) {
  const m = /\b(?:for|over)\s+(\d+)\s*(sec|secs|seconds|min|mins|minutes|hour|hours)\b/i.exec(text);
  if (!m) return null;
  const unit = /^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1;
  return Number(m[1]) * unit;
}

/**
 * The first damage run inside a sentence: `40 to 56 Fire damage`, `300 Nature
 * damage`. **Exported since D-698**, because the conversion law reads the same
 * run out of an `other` equip line and a set bonus, where the tooltip reader
 * only ever ran it over a proc or a `Use:`. One grammar, one reader.
 */
export function damageIn(text) {
  const range = new RegExp(`(\\d+)\\s+to\\s+(\\d+)\\s+(?:(${SCHOOL_RE})\\s+)?damage`, "i").exec(text);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]), school: range[3] ? range[3].toLowerCase() : null };
  }
  const flat = new RegExp(`(\\d+)\\s+(?:(${SCHOOL_RE})\\s+)?damage`, "i").exec(text);
  if (flat) return { min: Number(flat[1]), max: Number(flat[1]), school: flat[2] ? flat[2].toLowerCase() : null };
  return null;
}

/**
 * What a proc's sentence does to its target, in the law's vocabulary, or null.
 * Read in a fixed order so a sentence naming two things takes the first — the
 * one the base row will be chosen for.
 */
const CONDITIONS = [
  // **BOTH NUMBERS.** `\bextra attack\b` cannot match *extra attacks*, so
  // Ironfoe's *Grants 2 extra attacks on your next swing* read as no condition
  // at all and fell through to a quoted placeholder, while Hand of Justice's
  // singular converted (D-692).
  ["extraAttack", /\bextra attacks?\b/i],
  ["stun", /\bstun(?:s|ning|ned)?\b|\bknocking it silly\b/i],
  ["sunder", /\b(?:lower|lowers|lowering|reduc\w*)\b[^.]*\barmor\b|\barmor\b[^.]*\bby \d+/i],
  ["slow", /\bslow(?:s|ing|ed)?\b|\bdaze[sd]?\b|\battack speed by\b/i],
  ["root", /\broot(?:s|ing|ed)?\b|\bimmobiliz\w+\b|\bentangl\w+\b/i],
  ["bleed", /\bbleed\b|\bwound(?:s|ing)? the target\b/i],
  ["knockback", /\bknock(?:s|ing)? (?:back|down)\b|\bknockback\b/i]
];

function conditionOf(text) {
  for (const [name, re] of CONDITIONS) if (re.test(text)) return name;
  return null;
}

/**
 * The `Equip:` family. Ordered; the first hit wins, so a specific line is
 * always above the family it would otherwise fall into.
 *
 * Every row yields `{kind, ...}`; `raw` and `index` are added by the caller.
 */
const EQUIPS = [
  // --- the attribute and school lines a suffix or an enchant leaves behind ---
  [/^Increases attack power by (\d+) in (.+?) forms? only\.?$/i,
    m => ({ kind: "attackPower", value: Number(m[1]), forms: m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean), formOnly: true })],
  [/^Increases? (?:your )?ranged attack power by (\d+)\.?$/i, m => ({ kind: "rangedAttackPower", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?attack power by (\d+)\.?$/i, m => ({ kind: "attackPower", value: Number(m[1]) })],

  // Spell power: the WotLK unified line, then Classic's three.
  [new RegExp(`^Increases? (?:your )?spell power(?: of (.+?))? by (\\d+)\\.?$`, "i"),
    m => ({ kind: "spellDamage", value: Number(m[2]), school: null, only: m[1] ?? null })],
  [new RegExp(`^Increases? damage and healing done by magical spells and effects by up to (\\d+)\\.?$`, "i"),
    m => ({ kind: "spellDamage", value: Number(m[1]), school: null })],
  [new RegExp(`^Increases? damage done by (${SCHOOL_RE}) spells and effects by up to (\\d+)\\.?$`, "i"),
    m => ({ kind: "spellDamage", value: Number(m[2]), school: m[1].toLowerCase() })],
  [new RegExp(`^Increases? healing done by (?:magical )?spells and effects by up to (\\d+)\\.?$`, "i"),
    m => ({ kind: "healing", value: Number(m[1]) })],
  [/^Increases? (?:the amount )?heal(?:ing|ed)(?: done)? by (?:up to )?(\d+)\.?$/i, m => ({ kind: "healing", value: Number(m[1]) })],

  // --- the regeneration lines ---
  [/^Restores (\d+) mana per (\d+) sec\.?$/i, m => ({ kind: "mp5", value: Number(m[1]), per: Number(m[2]) })],
  [/^Restores (\d+) health per (\d+) sec\.?$/i, m => ({ kind: "hp5", value: Number(m[1]), per: Number(m[2]) })],
  [/^Restores (\d+) mana every (\d+) sec(?:onds)?\.?$/i, m => ({ kind: "mp5", value: Number(m[1]), per: Number(m[2]) })],

  // --- the ratings. WotLK's wording first, then Classic's percentages. ---
  [/^(?:Increases?|Improves) (?:your )?spell critical strike rating by (\d+)\.?$/i, m => ({ kind: "spellCrit", value: Number(m[1]) })],
  [/^Improves (?:your )?spell crit(?:ical strike)? chance by (\d+)%\.?$/i, m => ({ kind: "spellCrit", percent: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?critical strike rating by (\d+)\.?$/i, m => ({ kind: "crit", value: Number(m[1]) })],
  [/^Improves (?:your )?chance to get a critical strike by (\d+)%\.?$/i, m => ({ kind: "crit", percent: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?spell hit rating by (\d+)\.?$/i, m => ({ kind: "spellHit", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?hit rating by (\d+)\.?$/i, m => ({ kind: "hit", value: Number(m[1]) })],
  [/^Improves (?:your )?chance to hit by (\d+)%\.?$/i, m => ({ kind: "hit", percent: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?(?:melee |spell |ranged )?haste rating by (\d+)\.?$/i, m => ({ kind: "haste", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?expertise rating by (\d+)\.?$/i, m => ({ kind: "expertise", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?defense(?: rating)? by (\d+)\.?$/i, m => ({ kind: "defense", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?dodge(?: rating)? by (\d+)\.?$/i, m => ({ kind: "dodge", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?parry(?: rating)? by (\d+)\.?$/i, m => ({ kind: "parry", value: Number(m[1]) })],
  [/^(?:Increases?|Improves) (?:your )?(?:shield )?block rating by (\d+)\.?$/i, m => ({ kind: "blockChance", value: Number(m[1]) })],
  [/^Increases? the block value of your shield by (\d+)\.?$/i, m => ({ kind: "blockValue", value: Number(m[1]) })],
  [/^Increases? (?:your )?block value by (\d+)\.?$/i, m => ({ kind: "blockValue", value: Number(m[1]) })],
  [/^Increases? (?:your )?resilience rating by (\d+)\.?$/i, m => ({ kind: "resilience", value: Number(m[1]) })],
  [/^Increases? (?:your )?spell penetration by (\d+)\.?$/i, m => ({ kind: "spellPenetration", value: Number(m[1]) })],
  [/^Increases? (?:your )?armor penetration(?: rating)? by (\d+)\.?$/i, m => ({ kind: "armorPenetration", value: Number(m[1]) })],

  // --- the flat pools ---
  [/^Increases? (?:your )?maximum health by (\d+)\.?$/i, m => ({ kind: "health", value: Number(m[1]) })],
  [/^Increases? (?:your )?maximum mana by (\d+)\.?$/i, m => ({ kind: "mana", value: Number(m[1]) })],
  [/^(?:Increases?|Adds) (\d+) armor\.?$/i, m => ({ kind: "armorBonus", value: Number(m[1]) })],
  [new RegExp(`^Increases? (?:your )?(${SCHOOL_RE}) resistance by (\\d+)\\.?$`, "i"),
    m => ({ kind: "resistance", school: m[1].toLowerCase(), value: Number(m[2]) })],

  // --- movement, stealth, the trades ---
  [/^Increases? (?:your )?effective stealth level(?: by (\d+))?\.?$/i, m => ({ kind: "stealth", value: m[1] ? Number(m[1]) : 1 })],
  [/^Increases? (?:your )?stealth (?:level )?by (\d+)\.?$/i, m => ({ kind: "stealth", value: Number(m[1]) })],
  [/^Increases? (?:your )?(?:run |movement )?speed(?: by (\d+)%)?.*$/i, m => ({ kind: "speed", percent: m[1] ? Number(m[1]) : null })],
  [/^Increases? movement speed and life regeneration rate\.?$/i, () => ({ kind: "speed", percent: null })],
  [/^(?:Increased )?([A-Za-z][A-Za-z' -]*?) \+(\d+)\.?$/, m => ({ kind: "skill", skill: m[1].trim(), value: Number(m[2]) })],
  [/^Allows underwater breathing\.?$/i, () => ({ kind: "waterBreathing" })],

  // --- what is left is recorded verbatim; the law quotes it (A9) ---
  [/^(.+)$/, m => ({ kind: "other", text: m[1] })]
];

/** A line that fires on a hit or when its wearer is struck. */
const PROC_SHAPES = [
  [/^Chance on hit:\s*(.+)$/i, "hit"],
  [/^Chance on melee hit(?: to| that)?\s*(.+)$/i, "hit"],
  [/^Chance to strike your ranged target with\s*(.+)$/i, "hit"],
  [/^Chance to (?:bathe|decapitate|deal|inflict|strike)\b\s*(.+)$/i, "hit"],
  [/^Chance on landing a direct damage spell\s*(.+)$/i, "hit"],
  [/^Gives a chance when your (?:harmful )?spells? (?:land|hit)\s*(.+)$/i, "hit"],
  [/^Adds (\d+ )?\w* ?damage to your melee attacks\.?$/i, "hit"],
  [/^When struck in combat\s*(.+)$/i, "struck"],
  [/^Deals (?:\d+(?: to \d+)?) damage when you are the victim of a critical melee strike\.?$/i, "struck"],
  [/^Deals (?:\d+(?: to \d+)?) damage every time you block\.?$/i, "struck"],
  [/^Damages attackers?\b\s*(.+)$/i, "struck"]
];

/** What a `Use:` sentence is, in the template vocabulary the law draws on. */
const USE_KINDS = [
  ["buffAP", /\battack power\b/i],
  ["buffSpell", /\bspell power\b|\bdamage and healing done by\b|\bspell damage\b/i],
  ["heal", /\bheals?\b|\brestores? (?:up to )?\d+ health\b|\bhealing\b/i],
  ["absorb", /\babsorb\w*\b|\bshield\b(?!\s+block)/i],
  ["mana", /\bmana\b/i],
  ["armor", /\barmor\b/i],
  ["speed", /\bspeed\b|\bhaste\b/i],
  ["freeAction", /\bimmune\b|\bfree action\b|\bcannot be\b|\bremoves? \d* ?(?:poison|disease|curse|movement impairing)\b/i]
];

function useKind(text) {
  for (const [kind, re] of USE_KINDS) if (re.test(text)) return kind;
  return "other";
}

/** The class list a `Classes:` line carries, in 02's names. */
function classList(text) {
  return text.split(",").map(s => s.trim()).filter(Boolean).map(n => CLASS_NAMES[n] ?? n);
}

/**
 * Read a record's tooltip.
 *
 * @param {object} record  one row of `tools/classic/classic-loot.json`
 * @returns {object} Parsed
 */
export function parseTooltip(record) {
  const name = String(record?.name ?? "");
  const slot = record?.slot ?? null;
  const subclass = record?.subclass ?? null;

  const parsed = {
    itemId: record?.itemId ?? null,
    name,
    icon: record?.icon ?? null,
    quality: record?.quality ?? null,
    itemLevel: record?.itemLevel ?? null,
    requiredLevel: record?.requiredLevel ?? null,
    wowClass: record?.class ?? null,
    subclass,
    slot,
    binds: null,
    unique: false,
    damage: null,
    armor: null,
    block: null,
    stats: {},
    resistances: {},
    allResistances: null,
    equips: [],
    procs: [],
    uses: [],
    classes: [],
    races: [],
    set: null,
    randomEnchantment: false,
    flavour: null,
    droppedBy: null,
    dropChance: record?.source?.dropChance ?? null,
    unparsed: []
  };

  const lines = record?.tooltip ?? [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? {};
    const format = line.format ?? null;
    const raw = String(line.label ?? "").replace(/\r/g, "").trim();
    if (!raw) continue; // an empty label carries nothing and is not an unknown
    const text = raw.replace(/\s+/g, " ");

    // ---- the set block, which is the one thing `format` decides ----
    if (format === "Misc") {
      const head = SET_HEAD.exec(text);
      if (head) { parsed.set = { name: head[1], size: Number(head[2]), pieces: [], bonuses: [] }; continue; }
    }
    if (format === "indent" && parsed.set) { parsed.set.pieces.push(text); continue; }
    if (format === "Poor") {
      const bonus = SET_BONUS.exec(text);
      if (bonus && parsed.set) { parsed.set.bonuses.push({ count: Number(bonus[1]), text: bonus[2] }); continue; }
    }

    // ---- the echoes: the name, the slot and the subclass ----
    // Inside an open set block the item names ITSELF at its own quality rather
    // than at `indent`, so that line is the ninth piece and not an echo:
    // without it `pieces.length` is one short of `size` on every set piece.
    if (text === name) { if (parsed.set) parsed.set.pieces.push(text); continue; }
    if (slot && text === slot) continue;
    if (subclass && text === subclass) continue;
    if (SLOT_WORDS.has(text) || SUBCLASS_WORDS.has(text)) continue;

    // ---- what binds it, and whether it is unique ----
    let m = /^Binds when (picked up|equipped|used)\.?$/i.exec(text);
    if (m) { parsed.binds = m[1].toLowerCase(); continue; }
    if (/^Binds to (?:account|the Battle\.net account)\.?$/i.test(text)) { parsed.binds = "account"; continue; }
    if (/^Unique(?:-Equipped)?(?:\s*\(\d+\))?$/i.test(text)) { parsed.unique = true; continue; }
    if (/^Unique-Equipped:/i.test(text)) { parsed.unique = true; continue; }
    if (/^<Random enchantment>$/i.test(text)) { parsed.randomEnchantment = true; continue; }

    // ---- the numbers on the item's own face ----
    m = new RegExp(`^(\\d+) - (\\d+)(?: (${SCHOOL_RE}))? Damage$`, "i").exec(text);
    if (m) {
      const school = m[3] ? m[3].toLowerCase() : null;
      if (parsed.damage) parsed.equips.push({ kind: "weaponDamage", raw, index, min: Number(m[1]), max: Number(m[2]), school });
      else parsed.damage = { min: Number(m[1]), max: Number(m[2]), speed: null, dps: null, school };
      continue;
    }
    m = new RegExp(`^\\+ ?(\\d+) - (\\d+) (${SCHOOL_RE}) Damage$`, "i").exec(text);
    if (m) {
      parsed.equips.push({ kind: "weaponDamage", raw, index, min: Number(m[1]), max: Number(m[2]), school: m[3].toLowerCase() });
      continue;
    }
    // A bow or a wand may print one number rather than a range (Screeching Bow).
    m = new RegExp(`^(\\d+)(?: (${SCHOOL_RE}))? Damage$`, "i").exec(text);
    if (m) {
      const school = m[2] ? m[2].toLowerCase() : null;
      const n = Number(m[1]);
      if (parsed.damage) parsed.equips.push({ kind: "weaponDamage", raw, index, min: n, max: n, school });
      else parsed.damage = { min: n, max: n, speed: null, dps: null, school };
      continue;
    }
    m = /^Speed (\d+(?:\.\d+)?)$/i.exec(text);
    if (m) {
      if (!parsed.damage) parsed.damage = { min: 0, max: 0, speed: null, dps: null, school: null };
      parsed.damage.speed = Number(m[1]);
      continue;
    }
    m = /^(\d+) Armor$/i.exec(text);
    if (m) { parsed.armor = Number(m[1]); continue; }
    m = /^(\d+) Block$/i.exec(text);
    if (m) { parsed.block = Number(m[1]); continue; }
    // The sign is read, not assumed: a handful of low items carry a PENALTY
    // (Mindthrust Bracers are -5 Stamina), and a `+`-only rule would have made
    // three of those lines unknowns and the rest of each item convert as if
    // the cost were not there.
    m = /^([+-])(\d+) (Strength|Agility|Stamina|Intellect|Spirit)$/i.exec(text);
    if (m) {
      const key = STAT_KEYS[m[3][0].toUpperCase() + m[3].slice(1).toLowerCase()];
      parsed.stats[key] = (parsed.stats[key] ?? 0) + Number(`${m[1]}${m[2]}`);
      continue;
    }
    m = new RegExp(`^([+-])(\\d+) (${SCHOOL_RE}) Resistance$`, "i").exec(text);
    if (m) {
      const key = m[3].toLowerCase();
      parsed.resistances[key] = (parsed.resistances[key] ?? 0) + Number(`${m[1]}${m[2]}`);
      continue;
    }
    m = /^([+-])(\d+) All Resistances$/i.exec(text);
    if (m) { parsed.allResistances = (parsed.allResistances ?? 0) + Number(`${m[1]}${m[2]}`); continue; }
    m = /^([+-])(\d+) Armor$/i.exec(text);
    if (m) { parsed.equips.push({ kind: "armorBonus", raw, index, value: Number(`${m[1]}${m[2]}`) }); continue; }

    // ---- who may carry it, and where it came from ----
    m = /^Classes:\s*(.+)$/i.exec(text);
    if (m) { parsed.classes = classList(m[1]); continue; }
    m = /^Races:\s*(.+)$/i.exec(text);
    if (m) { parsed.races = m[1].split(",").map(s => s.trim()).filter(Boolean); continue; }
    m = /^Dropped by:\s*(.+)$/i.exec(text);
    if (m) { parsed.droppedBy = m[1]; continue; }
    m = /^Drop Chance:\s*([\d.]+)%$/i.exec(text);
    if (m) {
      // `source.dropChance` is the same number without the rounding trip
      // through a percentage, so it wins where the record carries one.
      if (parsed.dropChance === null) parsed.dropChance = Number((Number(m[1]) / 100).toFixed(6));
      continue;
    }
    m = /^"(.*)"$/.exec(raw);
    if (m) { parsed.flavour = m[1]; continue; }

    // ---- a Use effect ----
    m = /^Use:\s*(.+)$/i.exec(raw);
    if (m) {
      const body = m[1].trim();
      const cd = COOLDOWN.exec(body);
      const sentence = (cd ? body.slice(0, cd.index) : body).trim().replace(/\.$/, "");
      const damage = damageIn(sentence);
      const amount = /(\d+)/.exec(sentence);
      parsed.uses.push({
        raw, index,
        kind: useKind(sentence),
        amount: amount ? Number(amount[1]) : null,
        duration: durationOf(sentence),
        cooldown: cooldownSeconds(cd),
        damage,
        text: sentence
      });
      continue;
    }

    // ---- a proc, on a hit or when struck ----
    const body = /^Equip:\s*(.+)$/i.exec(raw)?.[1]?.trim() ?? raw;
    let procced = false;
    for (const [re, trigger] of PROC_SHAPES) {
      if (!re.test(body)) continue;
      const cd = COOLDOWN.exec(body) ?? /\((\d+)s cooldown\)/i.exec(body);
      const damage = damageIn(body);
      const condition = conditionOf(body);
      parsed.procs.push({
        kind: damage ? "damage" : (condition ?? "other"),
        raw, index, trigger, damage, condition,
        duration: durationOf(body),
        cooldown: cd ? (cd.length > 2 ? cooldownSeconds(cd) : Number(cd[1])) : null,
        other: damage || condition ? null : body
      });
      procced = true;
      break;
    }
    if (procced) continue;

    // ---- everything else that is worn rather than used ----
    // The Cat/Bear/Moonkin attack-power line carries no `Equip:` prefix and is
    // an Equip line all the same, so the family is tried on the body whether
    // the prefix was there or not.
    if (/^Equip:/i.test(raw) || /^(?:Increases?|Improves|Restores|Adds|Allows|Gives) /i.test(body)) {
      for (const [re, take] of EQUIPS) {
        const hit = re.exec(body);
        if (!hit) continue;
        parsed.equips.push({ ...take(hit), raw, index });
        break;
      }
      continue;
    }

    // ---- the boilerplate that carries nothing ----
    if (BOILERPLATE.some(re => re.test(text))) continue;

    parsed.unparsed.push({ index, label: raw });
  }

  // The dps line is display text; the number the law ranks on is computed.
  if (parsed.damage) {
    const { min, max, speed } = parsed.damage;
    parsed.damage.dps = speed ? Math.round(((min + max) / 2 / speed) * 100) / 100 : null;
    // A stray Speed line with no swing behind it is not a weapon's damage.
    if (!min && !max) parsed.damage = null;
  }

  return parsed;
}

/**
 * A line's SHAPE: its words with every run of digits replaced by `N`. Two
 * unknowns of the same shape are one thing to fix, so the census counts
 * shapes rather than lines.
 */
export function shapeOf(label) {
  return String(label).replace(/\s+/g, " ").trim().replace(/\d+/g, "N");
}

/**
 * The distinct unparsed shapes over a whole file, most common first — what
 * the census asserts on and what the report prints.
 *
 * @param {Array} records
 * @returns {Array<{shape, count, example, item}>}
 */
export function unparsedShapes(records = []) {
  const shapes = new Map();
  for (const record of records) {
    for (const line of parseTooltip(record).unparsed) {
      const shape = shapeOf(line.label);
      if (!shapes.has(shape)) shapes.set(shape, { shape, count: 0, example: line.label, item: record?.name ?? null });
      shapes.get(shape).count++;
    }
  }
  return [...shapes.values()].sort((a, b) => b.count - a.count || a.shape.localeCompare(b.shape));
}
