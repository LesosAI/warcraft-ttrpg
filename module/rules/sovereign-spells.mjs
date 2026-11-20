/**
 * **THE SOVEREIGN'S SPELLS, AND WHAT EACH ONE DOES AT THE TABLE** (07 §17, *Restricted Sovereign*;
 * the San'layn and Sovereign plan, B.10 and B.11; D-1240 onward). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * Most of what a Sovereign spell does rides the doors every spell rides, off the descriptors the
 * parser stamps (`tools/parse-book/spells.mjs`): the card's damage and its Resist (`damage`, `test`,
 * `onFail`), a self effect's Apply (`applies`), the temporary Health the Apply grants
 * (`rules/temporary-health.mjs`), the area's tick and ground (D-756, D-757) and the upkeep in the
 * entry's own number (`rules/upkeep.mjs`), paid in Vitae through CORE's overflow (`AzerothActor
 * #payVitae`). What no descriptor carries is read here, off 07's own words, and written by
 * `effects/sovereign-spells.mjs`:
 *
 * - the card's rows a spell rewrites before anything is paid: the enemies in a ring round the caster
 *   (Tithe of the Many, Bloodbolt Ascension, the Crimson Tithe), Twilight Bloodbolt's splash, Embrace
 *   of the Vampyr's held target, Swarming Shadows' prey;
 * - what a hit lays with no Test: the Bleeding of Bloodbolt, Twilight Bloodbolt, Shadow Lance (at SL 2)
 *   and Bloodbolt Ascension; the prey's heal and Tribute; Aortic Unraveling's kill; Embrace's feeding;
 * - what a failure lays beside its condition: Bleeding at its number, **the blood curse** (02 §7) with
 *   its repeated Test, an attack's lost damage, no healing, Overawe's first Bane, Captivating Gaze's
 *   leash, Royal Command's and Grant an Audience's ends;
 * - the caster's own states: Bloodbolt Ascension's flight, Mantle of Majesty's refusals, Majesty
 *   Unbound, Unfading Glory's hold and Boon, the skill Boons, Mirror of Self's Reaction;
 * - the roleplay spells: Taste of Lineage, Royal Seal, Oath of Fealty, Royal Herald, Eyes of the
 *   Swarm, Gaze from the Throne, Royal Approach's step toward the prey.
 *
 * **`SOVEREIGN_SPELL_AUTOMATION` IS THE CENSUS** (`sovereign-spells.test.mjs`), in the Necromancer's
 * shape (D-1098): every spell the Sovereign may hold names the doors that carry it, and
 * `SOVEREIGN_SPELL_DOORS` names each door's call site BY FUNCTION. A `table` clause is only one of the
 * lead's three GM calls (the plan's C.4: Taste of Lineage's noble birth, Royal Command's *does not
 * harm*, Grant an Audience's end).
 */

import { ringRows } from "./necromancer-spells.mjs";
import { cleanBloodCurse, cursedBy } from "./sovereign-talents.mjs";

/** HTML to one flat line, bold kept as `**`. */
function flat(text) {
  return String(text ?? "").replace(/<\/?(?:strong|b)>/g, "**").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** HTML to one flat line, bold dropped. */
const plain = text => flat(text).replace(/\*\*/g, "");

/** A whole number at or above nothing. */
const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

const WORD_NUMBERS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });
const countOf = word => WORD_NUMBERS[String(word ?? "").toLowerCase()] ?? (Number(word) || null);

export const SOVEREIGN = "Sovereign";

/* ------------------------------------------------------------------ */
/*  Whose cast the Sovereign doors carry                               */
/* ------------------------------------------------------------------ */

/**
 * **THE SOVEREIGN DOORS CARRY A SOVEREIGN'S CAST** (the plan's B.10: *Sovereign-only doors are scoped
 * by `sovereignCaster`, never by the Restricted line*; D-1099's shape, D-1243). A spell the Sovereign
 * alone holds (its Restricted line names no other class) is carried for any caster, a creature's Spells
 * line included. A spell it SHARES - Drain Life, Siphon Life and Exsanguinate with the Warlock, the
 * open Death spells with every Death class - is carried only where the caster holds the Sovereign
 * class; anyone else casts it exactly as before.
 *
 * @param {string[]} spellClasses   the spell's `system.classes`
 * @param {string[]} casterClasses  the caster's class names (`AzerothActor#classNames`); none for a creature
 */
export function sovereignCaster(spellClasses = [], casterClasses = []) {
  const classes = Array.isArray(spellClasses) ? spellClasses : [];
  if (!classes.includes(SOVEREIGN)) return false;
  if (classes.every(c => c === SOVEREIGN)) return true;
  return (Array.isArray(casterClasses) ? casterClasses : []).includes(SOVEREIGN);
}

/**
 * **AN OPEN DEATH SPELL ANOTHER CLASS'S DOOR CARRIES FOR A SOVEREIGN** (D-1244): 07 §17's Contagion
 * names no class, so it reaches the Sovereign, a full caster who reaches tier 4 (the Death Knight's
 * chart never does). Its door is the Necromancer's (`effects/necromancer-spells.mjs#necroScope`), which
 * carried a shared spell only for a Necromancer; the identifiers here it carries for a Sovereign too.
 */
export const OPEN_DEATH_FOR_SOVEREIGN = Object.freeze(["contagion"]);

/** Whether the Necromancer's door carries this open spell for this caster as a Sovereign. */
export function sovereignOpenDeath(sys = {}, casterClasses = []) {
  return OPEN_DEATH_FOR_SOVEREIGN.includes(sys?.identifier) && (Array.isArray(casterClasses) ? casterClasses : []).includes(SOVEREIGN)
    && (sys?.classes ?? []).includes(SOVEREIGN);
}

/* ------------------------------------------------------------------ */
/*  The card's rows                                                    */
/* ------------------------------------------------------------------ */

/**
 * **A RING ROUND THE CASTER** (Tithe of the Many's, Bloodbolt Ascension's and the Crimson Tithe's
 * *Each enemy within an N ft radius of you*): every enemy in it, and no ally (B.2's exclusion: *every
 * area hits enemies only*).
 * @returns {{feet: number, who: "enemy"}|null}
 */
export function readSelfRing(target = "") {
  const m = /^Each enemy within an? (\d+) ft radius of you$/i.exec(String(target ?? "").trim());
  return m ? { feet: Number(m[1]), who: "enemy" } : null;
}

/**
 * **TWILIGHT BLOODBOLT'S SPLASH** (*Target: One creature, and each enemy within a 5 ft radius of it*;
 * *The target and each enemy within a 5 ft radius of it take 6 Shadow damage*): the first row and the
 * enemies round it take the damage; only the first carries the Bleeding (`readHitBleed`'s `main`).
 * @returns {{feet: number}|null}
 */
export function readSplash(target = "") {
  const m = /^One creature, and each enemy within an? (\d+) ft radius of it$/i.exec(String(target ?? "").trim());
  return m ? { feet: Number(m[1]) } : null;
}

/** The ring's rows, as `necromancer-spells.mjs#ringRows` reads them: `{id, feet, enemy, down, hidden}`. */
export { ringRows };

/**
 * **EMBRACE OF THE VAMPYR'S TARGET** (*One creature that is Stunned, Entangled or Prone*): the
 * conditions one of which the creature must carry, judged before anything is paid.
 * @returns {string[]|null}
 */
export function readNeedsHeld(target = "") {
  const m = /^One creature that is ([A-Za-z, ]+)$/i.exec(String(target ?? "").trim());
  if (!m) return null;
  const ids = m[1].split(/,\s*|\s+or\s+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]+$/.test(w));
  return ids.length ? ids : null;
}

/** Why the held target is refused: it carries none of the conditions named. */
export function heldTargetRefusal(needs = [], statuses = []) {
  if (!needs?.length) return null;
  const held = new Set(statuses ?? []);
  return needs.some(id => held.has(id)) ? null : "notHeld";
}

/**
 * **SWARMING SHADOWS' AREA** (*Target: A 10 ft radius around your prey*; *The area moves with your
 * prey*): a circle on the prey's token, attached to it, so it follows the prey (D-707's attached
 * Region).
 * @returns {{feet: number, follows: boolean}|null}
 */
export function readPreyArea(target = "", effect = "") {
  const m = /^An? (\d+) ft radius around your prey$/i.exec(String(target ?? "").trim());
  return m ? { feet: Number(m[1]), follows: /\bThe area moves with your prey\b/.test(plain(effect)) } : null;
}

/* ------------------------------------------------------------------ */
/*  What a hit lays, with no Test                                      */
/* ------------------------------------------------------------------ */

/**
 * **THE BLEEDING A HIT LAYS** (07 §17): Bloodbolt's *takes 6 Physical damage and is **Bleeding 1***,
 * Bloodbolt Ascension's *Each enemy ... takes 6 Physical damage and is **Bleeding 1** for the duration*,
 * Twilight Bloodbolt's *The target is also **Bleeding 2** for the duration* (the first row only) and
 * Shadow Lance's *At SL 2 or more, it is also **Bleeding 2** for the duration*. Laid at the card's
 * Apply on the creature the damage landed on. Null on a spell with a Test (its Bleeding is the
 * failure's, `readFailBleed`).
 * @returns {{value: number, who: "each"|"main", sl: number|null}|null}
 */
export function readHitBleed(effect = "", { test = null } = {}) {
  if (test) return null;
  const t = plain(effect);
  let m = /\bAt SL (\d+) or more, it is also Bleeding (\d+)\b/.exec(t);
  if (m) return { value: Number(m[2]), who: "main", sl: Number(m[1]) };
  m = /\bThe target is also Bleeding (\d+)\b/.exec(t);
  if (m) return { value: Number(m[1]), who: "main", sl: null };
  m = /\btakes? \d+ [A-Z][a-z]+ damage and (?:is|are) Bleeding (\d+)\b/.exec(t);
  if (m) return { value: Number(m[1]), who: "each", sl: null };
  return null;
}

/** Whether a row takes the hit's Bleeding: every row, or the first alone; at the SL named or more. */
export function hitBleedFor(read, { index = 0, sl = 0 } = {}) {
  if (!read) return null;
  if (read.who === "main" && index !== 0) return null;
  if (read.sl !== null && read.sl !== undefined && !(Number(sl) >= read.sl)) return null;
  return read.value;
}

/** Bloodbolt's *If the target is your prey, you regain 3 Health* - the caster, and only off its prey. */
export function readPreyHeal(effect = "") {
  const m = /\bIf the target is your prey, you regain (\d+) Health\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]) } : null;
}

/** Sovereign's Kiss's *If the target is your prey, gain 1 Tribute*. */
export function readPreyTribute(effect = "") {
  const m = /\bIf the target is your prey, gain (\d+) Tribute\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]) } : null;
}

/** Aortic Unraveling's *If this damage drops the target to 0 Health, gain Tribute up to your cap*. */
export function readKillTribute(effect = "") {
  return /\bIf this damage drops the target to 0 Health, gain Tribute up to your cap\b/.test(plain(effect));
}

/** How much Tribute a kill fills: up to the cap from what is held. */
export function killTributeGain({ value = 0, max = 0 } = {}) {
  return Math.max(0, whole(max) - whole(value));
}

/** Embrace of the Vampyr's *If the target is living, you also feed on it (The Blood Royal), making no Test*. */
export function readFeedsOn(effect = "") {
  return /\bIf the target is living, you also feed on it \(The Blood Royal\), making no Test\b/.test(plain(effect)) ? { living: true, noTest: true } : null;
}

/* ------------------------------------------------------------------ */
/*  What a failure lays                                                 */
/* ------------------------------------------------------------------ */

/**
 * **THE BLEEDING A FAILURE LAYS, AT ITS NUMBER** (Bleed for Me's *On a failure it is **Bleeding 3***,
 * Tithe of the Many's *Bleeding 1*, Crimson Cascade's and the Crimson Tithe's *Bleeding 3*): the
 * shared Resist door lays the Bleeding the entry bolds, at no number; the door sets its value.
 * @returns {{value: number}|null}
 */
export function readFailBleed(effect = "") {
  const t = plain(effect);
  const at = t.indexOf("On a failure");
  if (at < 0) return null;
  const after = t.slice(at).split(/\bOn a success\b/)[0];
  const m = /\bBleeding (\d+)\b/.exec(after);
  return m ? { value: Number(m[1]) } : null;
}

/** Bleed for Me's *The Medicine Test to end it is against your Spell DC*. */
export function readMedicineAtDC(effect = "") {
  return /\bThe Medicine Test to end it is against your Spell DC\b/.test(plain(effect));
}

/** Bleed for Me's *While it bleeds from this spell, you regain 1 Health at the start of each of your turns*. */
export function readCasterBleedHeal(effect = "") {
  const m = /\bWhile it bleeds from this spell, you regain (\d+) Health at the start of each of your turns\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]) } : null;
}

/**
 * **THE CASTER'S HEAL FOR EACH FAILURE** (Tithe of the Many's *You regain 2 Health for each enemy that
 * fails*; the Crimson Tithe's *You regain Health equal to your tier for each enemy that fails*).
 * @returns {{per: number|"tier"}|null}
 */
export function readFailHeal(effect = "") {
  const t = plain(effect);
  let m = /\bYou regain (\d+) Health for each enemy that fails\b/.exec(t);
  if (m) return { per: Number(m[1]) };
  m = /\bYou regain Health equal to your tier for each enemy that fails\b/.exec(t);
  return m ? { per: "tier" } : null;
}

/** The Health one failure gives back. */
export function failHealAmount(read, { tier = 1 } = {}) {
  if (!read) return 0;
  return read.per === "tier" ? Math.max(1, whole(tier)) : whole(read.per);
}

/** Decree of Frailty's and Edict of the Crown's *each of its attacks deals 3 less damage for the duration*. */
export function readAttackLess(effect = "") {
  const m = /\beach of its attacks deals (\d+) less damage\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]) } : null;
}

/** Edict of Denial's and the Crimson Tithe's *cannot regain Health for the duration*. */
export function readNoHealing(effect = "") {
  return /\bcannot regain Health for the duration\b/.test(plain(effect));
}

/** Overawe's *the first Attack Test it makes on each of its turns takes a Bane for the duration*. */
export function readFirstAttackBane(effect = "") {
  return /\bthe first Attack Test it makes on each of its turns takes a Bane\b/.test(plain(effect));
}

/**
 * **CAPTIVATING GAZE'S LEASH AND BANE** (*until the end of its next turn it cannot willingly move to a
 * space more than 10 feet from you, or farther from you at all if it starts more than 10 feet away, and
 * it takes a Bane on Attack Tests against you*; R62).
 * @returns {{feet: number, bane: boolean}|null}
 */
export function readGaze(effect = "") {
  const t = plain(effect);
  const m = /\bcannot willingly move to a space more than (\d+) feet from you, or farther from you at all if it starts more than \1 feet away\b/.exec(t);
  return m ? { feet: Number(m[1]), bane: /\bit takes a Bane on Attack Tests against you\b/.test(t) } : null;
}

/**
 * **THE LEASH IS `rules/leash.mjs`'S** (the plan's C7, FEATURES' law): Captivating Gaze lays
 * `{holder, feet, from, source}` on the cursed creature's effect, `from` the feet it stood away (R62's
 * *no farther than it started*), and the one reader judges every leash at `onPreMoveToken`.
 */

/** *It repeats the Test at the end of each of its turns, and the spell ends (for it) on a success*. */
export function readRepeat(effect = "") {
  return /\bIt repeats the Test at the end of each of its turns, and the spell ends (?:for it )?on a success\b/.test(plain(effect));
}

/** The blood curse's tag, off the entry (the parser's own sentence, D-1126). */
export function readBloodCurse(effect = "") {
  return /\bThis spell is a blood curse\b/.test(plain(effect));
}

/**
 * **ROYAL COMMAND'S ENDS** (*it obeys one spoken command of up to ten words that does not harm it or its
 * allies. The spell ends when the command is carried out. The spell ends if you or your allies harm the
 * target*; R65).
 * @returns {{words: number, carriedOut: boolean, harmEnds: boolean}|null}
 */
export function readCommand(effect = "") {
  const t = plain(effect);
  const m = /\bit obeys one spoken command of up to (\w+) words\b/.exec(t);
  if (!m) return null;
  return { words: countOf(m[1]) ?? 10, carriedOut: /\bThe spell ends when the command is carried out\b/.test(t), harmEnds: /\bThe spell ends if you or your allies harm\b/.test(t) };
}

/** Grant an Audience's *it stays and listens to you, and it attacks no one. The spell ends if you or your allies harm it*. */
export function readAudience(effect = "") {
  const t = plain(effect);
  return /\bit stays and listens to you, and it attacks no one\b/.test(t)
    ? { stays: true, noAttacks: true, harmEnds: /\bThe spell ends if you or your allies harm\b/.test(t) } : null;
}

/** The flag a command or an audience carries on the creature: who laid it, its kind, and what ends it. */
export const COMMAND_FLAG = "sovereignCommand";

/**
 * **GRANT AN AUDIENCE'S *IT ATTACKS NO ONE*** (D-1258): the spell's name where an active effect on the
 * creature holds it in an audience, else null - the pure predicate both attack doors import statically
 * (O-419's prescription: no dynamic import inside an attack door).
 */
export function audienceListening(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[COMMAND_FLAG] ?? null;
    if (row?.kind === "audience") return String(row.spell ?? "");
  }
  return null;
}

/** A command's words, trimmed to the limit 07 sets (Royal Command's ten, Royal Herald's twenty-five). */
export function limitWords(text = "", max = 10) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, Math.max(1, whole(max))).join(" ");
}

/**
 * **HARM BY THE CASTER OR ITS ALLIES ENDS IT** (Royal Command, Grant an Audience): the damage door asks
 * whether the creature that dealt the blow is the caster or one of its allies.
 */
export function harmEnds({ byCaster = false, byAlly = false } = {}) {
  return byCaster === true || byAlly === true;
}

/* ------------------------------------------------------------------ */
/*  The blood curse (02 §7)                                             */
/* ------------------------------------------------------------------ */

/** The flag a blood curse rides on the effect its spell or feature laid. */
export const BLOOD_CURSE_FLAG = "bloodCurse";

/** The escape kind a curse that lays no condition rides (`rules/escapes.mjs#CURSE_ESCAPE`). */
export const CURSE_CONDITION = "curse";

/**
 * **THE TAG ON THE LAID EFFECT** (02 §7: *A creature is under your blood curse while one of those
 * effects of yours lasts on it*; the plan's B.6 engine line: *The laid effect carries
 * `flags.azeroth-rpg.bloodCurse {source}`*). `source` is the caster's uuid, which is what *your* means
 * (*Another Sovereign's blood curse is not yours*).
 */
export function bloodCurseRecord({ source = null, spell = "", identifier = null, cast = null } = {}) {
  if (typeof source !== "string" || !source) return null;
  return { source, spell: String(spell ?? ""), identifier: typeof identifier === "string" && identifier ? identifier : null, cast: typeof cast === "string" && cast ? cast : null };
}

/**
 * **ONE READER OF THE TAG** (D-1241): the curse's cleaning and *whose blood curses a creature is under*
 * (`targetFactsOf`'s `cursedBy`) are FEATURES' (`rules/sovereign-talents.mjs`), which read this shape -
 * `source` the caster's uuid - and Blood Prison's; re-exported here so a spell reader takes the same one.
 */
export { cleanBloodCurse, cursedBy };

/** Whether a creature is under this Sovereign's blood curse. */
export function underCurseOf(effects = [], sovereignUuid = null) {
  return Boolean(sovereignUuid) && cursedBy(effects).includes(sovereignUuid);
}

/**
 * **THE LOST DAMAGE ON EVERY ATTACK THE CURSED CREATURE MAKES** (Decree of Frailty's and Edict of the
 * Crown's *each of its attacks deals 3 less damage*; the plan's C11: *on every attack*). The largest of
 * the attacker's own curse effects - two Decrees from two Sovereigns are two spells, and 05 lets one
 * effect of a kind count (MY READING, D-1245: the highest, never the sum).
 *
 * @param {Array<object>} effects  the ATTACKER's effects
 * @returns {{amount: number, sources: string[]}}
 */
export const ATTACK_LESS_FLAG = "attackLess";
export function attackLessOn(effects = []) {
  let amount = 0;
  const sources = [];
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[ATTACK_LESS_FLAG] ?? null;
    const n = whole(row?.amount);
    if (!n) continue;
    if (row.source) sources.push(String(row.source));
    amount = Math.max(amount, n);
  }
  return { amount, sources: [...new Set(sources)].sort() };
}

/* ------------------------------------------------------------------ */
/*  The caster's own states                                             */
/* ------------------------------------------------------------------ */

/**
 * Bloodbolt Ascension's *until the start of your next turn, you have a flying Speed of 30 feet*, and Hour of the
 * Court's *For the duration, you have a flying Speed of 15 feet* (D-1361): `until` the caster's next turn, or the
 * spell's own duration.
 */
export function readFlight(effect = "") {
  const t = plain(effect);
  const m = /\buntil the start of your next turn, you have a flying Speed of (\d+) feet\b/.exec(t);
  if (m) return { feet: Number(m[1]), until: "nextTurn" };
  const d = /\bFor the duration, you have a flying Speed of (\d+) feet\b/.exec(t);
  return d ? { feet: Number(d[1]), until: "duration" } : null;
}

/**
 * Mantle of Majesty's *you cannot be **Slowed** or **Entangled***, and Crimson Carapace's *you cannot become
 * **Bleeding*** (D-1361).
 */
export function readRefusedConditions(effect = "") {
  const m = /\byou cannot (?:be|become) \*\*(\w+)\*\*(?:,? (?:or|and) \*\*(\w+)\*\*)?/.exec(flat(effect));
  return m ? [m[1], m[2]].filter(Boolean).map(w => w.toLowerCase()) : null;
}

/** Mantle of Majesty's *temporary Health equal to 11 plus your Constitution modifier*. */
export function readTempPlusCon(effect = "") {
  const m = /\btemporary Health equal to (\d+) plus your Constitution modifier\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]), ability: "con" } : null;
}

/** Mirror of Self's *When an attack hits you, you gain 8 temporary Health before its damage applies. It lasts until the end of the fight*. */
export function readMirror(effect = "") {
  const t = plain(effect);
  const m = /\bWhen an attack hits you, you gain (\d+) temporary Health before its damage applies\b/.exec(t);
  return m ? { amount: Number(m[1]), span: /\bIt lasts until the end of the fight\b/.test(t) ? "encounter" : null } : null;
}

/** Why Mirror of Self is refused before anything is paid: not the Reaction a blow asked, or no Reaction. */
export function mirrorRefusal({ asked = false, attack = false, reaction = true } = {}) {
  if (asked !== true) return "mirrorTrigger";
  if (attack !== true) return "mirrorAttack";
  if (reaction !== true) return "mirrorReaction";
  return null;
}

/**
 * **MAJESTY UNBOUND** (*your spells and attacks deal additional Shadow damage equal to your tier to your
 * prey. For the duration, once a turn, when you damage your prey, you regain Health equal to half that
 * damage, rounded down*).
 * @returns {{extra: "tier", type: "shadow", heal: "half"}|null}
 */
export function readMajesty(effect = "") {
  const t = plain(effect);
  if (!/\byour spells and attacks deal additional Shadow damage equal to your tier to your prey\b/.test(t)) return null;
  return { extra: "tier", type: "shadow", heal: /\bonce a turn, when you damage your prey, you regain Health equal to half that damage\b/.test(t) ? "half" : null };
}

/** The flag Majesty Unbound rides on the caster's own effect. */
export const MAJESTY_FLAG = "majestyUnbound";

/** The extra Shadow damage Majesty Unbound adds to a blow on the prey, through its Shadow Ward. */
export function majestyExtra({ tier = 1, ward = 0 } = {}) {
  return Math.max(0, Math.max(1, whole(tier)) - whole(ward));
}

/** Half the damage dealt, rounded down: the drains' and Majesty Unbound's heal. */
export const halfDown = n => Math.floor(whole(n) / 2);

/**
 * **UNFADING GLORY** (*when a blow would drop you to 0 Health while you hold 1 or more Tribute, you may
 * spend 1 Tribute. You drop to 1 Health instead. For the duration, you have a Boon on every Test you
 * make*; R68).
 * @returns {{tribute: number, stay: number, boon: "all"|null}|null}
 */
export function readUnfading(effect = "") {
  const t = plain(effect);
  const m = /\bwhen a blow would drop you to 0 Health while you hold (\d+) or more Tribute, you may spend (\d+) Tribute\. You drop to (\d+) Health instead\b/.exec(t);
  if (!m) return null;
  return { tribute: Number(m[2]), stay: Number(m[3]), boon: /\byou have a Boon on every Test you make\b/.test(t) ? "all" : null };
}

/** The flag Unfading Glory's hold rides on the caster's own effect. */
export const UNFADING_FLAG = "unfadingGlory";

/** Whether Unfading Glory holds a blow: one that drops the holder to 0, with the Tribute to spend. */
export function unfadingHolds({ before = 0, amount = 0, tribute = 0, need = 1 } = {}) {
  return whole(before) > 0 && whole(amount) >= whole(before) && whole(tribute) >= Math.max(1, whole(need));
}

/**
 * **A BOON ON NAMED SKILLS** (Air of Majesty's *a Boon on Leadership and Intimidation Tests against
 * creatures that can see you*; Read the Supplicant's *a Boon on Insight Tests against living creatures
 * within 10 feet of you*): the skills, by their keys, and the qualifier in words.
 * @returns {{skills: string[], against: string}|null}
 */
export function readSkillBoon(effect = "") {
  const m = /\byou have a Boon on ((?:[A-Z][a-z]+)(?: and [A-Z][a-z]+)*) Tests against (.+?)\.?$/.exec(plain(effect));
  if (!m) return null;
  return { skills: m[1].split(/ and /).map(s => s.trim().toLowerCase()), against: m[2].replace(/\.$/, "") };
}

/** The flag a skill Boon rides on the caster's own effect (`CharacterData` reads it into `skillBoons`). */
export const SKILL_BOON_FLAG = "skillBoon";

/**
 * The skill Boons the caster's own effects lay: by skill, the source names, sorted. A disabled effect
 * lays nothing.
 */
export function skillBoonsOn(effects = []) {
  const out = {};
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[SKILL_BOON_FLAG] ?? null;
    if (!row || !Array.isArray(row.skills)) continue;
    for (const skill of row.skills) {
      if (typeof skill !== "string" || !skill) continue;
      (out[skill] ??= []).push(String(row.source ?? ""));
    }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k].filter(Boolean))].sort();
  return out;
}

/* ------------------------------------------------------------------ */
/*  The roleplay spells                                                 */
/* ------------------------------------------------------------------ */

/**
 * **ROYAL APPROACH'S STEP** (*You move up to 20 feet to an unoccupied space you can see that is closer
 * to your prey than your space. This movement does not provoke Opportunity Attacks*).
 * @returns {{feet: number, closer: "prey", noOpportunity: boolean}|null}
 */
export function readApproach(effect = "") {
  const t = plain(effect);
  const m = /\bYou move up to (\d+) feet to an unoccupied space you can see that is closer to your prey than your space\b/.exec(t);
  return m ? { feet: Number(m[1]), closer: "prey", noOpportunity: /\bThis movement does not provoke Opportunity Attacks\b/.test(t) } : null;
}

/** Why Royal Approach's space is refused: no prey, too far, or no closer to it. */
export function approachRefusal({ prey = true, moved = 0, feet = 20, before = 0, after = 0 } = {}) {
  if (!prey) return "noPrey";
  if (Number(moved) > Number(feet) + 1e-6) return "approachFar";
  if (!(Number(after) < Number(before) - 1e-6)) return "approachCloser";
  return null;
}

/** The world-clock seconds a blood's age window names: *within the last day*, *within the last month*. */
export const BLOOD_AGE_SECONDS = Object.freeze({ day: 86400, month: 2592000 });

/** Taste of Lineage's and Gaze from the Throne's *spilled within the last day|month*. */
export function readBloodAge(target = "") {
  const m = /\bspilled within the last (day|month)\b/i.exec(String(target ?? ""));
  return m ? { seconds: BLOOD_AGE_SECONDS[m[1].toLowerCase()], window: m[1].toLowerCase() } : null;
}

/** Taste of Lineage's three sentences. */
export function readTaste(effect = "") {
  const t = plain(effect);
  if (!/\bYou learn the creature's people or kind\b/.test(t)) return null;
  return { people: true, living: /\bYou learn whether it is living or undead\b/.test(t), noble: /\bYou learn whether it is of noble birth\b/.test(t) };
}

/**
 * **THE BLOOD THE SOVEREIGN HOLDS** (Gaze from the Throne's *One creature whose blood you hold, spilled
 * within the last month*; D-1246): a record on the Sovereign's own actor, a row a creature, written
 * where the Sovereign took a drop of it - a claw hit (`CLAW_HIT_HOOK`) and Taste of Lineage. Kept to
 * the month the longest window names, and to `BLOOD_HELD_MAX` rows, newest kept.
 */
export const BLOOD_HELD_FLAG = "bloodHeld";
export const BLOOD_HELD_MAX = 24;

/** The record with one more row: the creature's earlier row replaced, past the month and the cap dropped. */
export function addHeldBlood(list = [], { uuid = null, name = "", at = 0 } = {}) {
  if (typeof uuid !== "string" || !uuid) return Array.isArray(list) ? list : [];
  const now = Number(at) || 0;
  const rows = (Array.isArray(list) ? list : []).filter(r => r && typeof r === "object" && r.uuid !== uuid && now - (Number(r.at) || 0) <= BLOOD_AGE_SECONDS.month);
  rows.push({ uuid, name: String(name ?? ""), at: now });
  return rows.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0) || String(a.uuid).localeCompare(String(b.uuid))).slice(0, BLOOD_HELD_MAX);
}

/** The rows within an age window, newest first. */
export function heldBloodWithin(list = [], { now = 0, seconds = BLOOD_AGE_SECONDS.month } = {}) {
  return (Array.isArray(list) ? list : []).filter(r => r?.uuid && (Number(now) || 0) - (Number(r.at) || 0) <= seconds)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0) || String(a.uuid).localeCompare(String(b.uuid)));
}

/**
 * **WHEN A CREATURE'S BLOOD WAS LAST SPILLED** (Taste of Lineage's *A creature's blood, spilled within
 * the last day*): the world time the one damage door last took Health off it (`AzerothActor
 * #applyDamage` writes `bledAt` in the update that writes the Health).
 */
export const BLED_AT_FLAG = "bledAt";

/** Why a tasted blood is refused: none spilled, or older than the window. */
export function bloodAgeRefusal({ bledAt = null, now = 0, seconds = BLOOD_AGE_SECONDS.day } = {}) {
  if (bledAt === null || bledAt === undefined || !Number.isFinite(Number(bledAt))) return "noBlood";
  return (Number(now) || 0) - Number(bledAt) > seconds ? "bloodOld" : null;
}

/** Royal Seal's *you know when the target is opened, at any distance*. */
export function readSeal(effect = "") {
  return /\byou know when the target is opened, at any distance\b/.test(plain(effect));
}

/** The flag a Royal Seal rides on the sealed document (a door, an item or a journal entry). */
export const SEAL_FLAG = "royalSeal";

/** Whether a sealed document's change is an opening: a door wall's state moved to open. */
export function sealOpened({ kind = "wall", before = 0, after = 0, OPEN = 1 } = {}) {
  if (kind === "wall") return Number(after) === Number(OPEN) && Number(before) !== Number(OPEN);
  return kind === "sheet";
}

/** Oath of Fealty's *Each target speaks an oath. For the duration, you know at once when either target breaks it*. */
export function readOath(effect = "") {
  return /\bEach target speaks an oath\. For the duration, you know at once when either target breaks it\b/.test(plain(effect));
}

/** The flag an Oath of Fealty rides on each target. */
export const OATH_FLAG = "oathOfFealty";

/** Royal Herald's *delivers a spoken message of up to 25 words, with your titles, to a creature you name within 1 mile*. */
export function readHerald(effect = "") {
  const m = /\bdelivers a spoken message of up to (\d+) words, with your titles, to a creature you name within (\d+) miles?\b/.exec(plain(effect));
  return m ? { words: Number(m[1]), miles: Number(m[2]) } : null;
}

/** Eyes of the Swarm's swarm and its Half-Action look. */
export function readSwarmEyes(effect = "") {
  const t = plain(effect);
  const m = /\bA swarm of bats rises from you and flies where you direct, within (\d+) miles? of you\b/.exec(t);
  return m ? { miles: Number(m[1]), look: /\bspend a Half-Action to see and hear through the swarm until the start of your next turn\b/.test(t) } : null;
}

/** Gaze from the Throne's *you see and hear the target and what is within 10 feet of it, at any distance* and *feels watched*. */
export function readThroneGaze(effect = "") {
  const t = plain(effect);
  const m = /\bOn a failure, for the duration, you see and hear the target and what is within (\d+) feet of it, at any distance\b/.exec(t);
  return m ? { feet: Number(m[1]), watched: /\bOn a success the spell ends and the target feels watched\b/.test(t) } : null;
}

/** The flag a look the cast opened rides on the caster (Eyes of the Swarm, Gaze from the Throne). */
export const LOOK_FLAG = "sovereignLook";

/**
 * The 07 §17 spells whose effect a Sovereign card lays itself, so the card offers no second Apply. The second
 * batch's self spells (D-1362) lay ONE effect at the cast that carries every clause, where the generic Apply
 * would lay a second, empty one (Mesmerize's and Hour of the Court's on the creatures their Test reaches).
 */
export const NO_APPLY = Object.freeze(["air-of-majesty", "read-the-supplicant", "royal-seal", "oath-of-fealty", "royal-herald", "eyes-of-the-swarm", "gaze-from-the-throne", "majesty-unbound", "unfading-glory", "royal-command", "grant-an-audience", "captivating-gaze",
  "sanguine-barrier", "scent-of-blood", "veil-of-mist", "mesmerize", "crimson-carapace", "blood-bond", "hour-of-the-court"]);

/* ------------------------------------------------------------------ */
/*  The second batch (07 §17's eighteen; D-1360 onward)                 */
/* ------------------------------------------------------------------ */

/** Whether a distance was measured: a finite number, never null (which `Number` reads as 0). */
const measured = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Half a modifier, rounded down, at least `min` (Sanguine Barrier's, Shroud of Sorrow's). */
export function halfModifier(mod = 0, min = 1) {
  return Math.max(Math.trunc(Number(min)) || 0, Math.floor((Math.trunc(Number(mod)) || 0) / 2));
}

/**
 * **SANGUINE BARRIER** (*each weapon attack that hits you deals less damage. The reduction is half your
 * Constitution modifier, rounded down, and at least 1*; the lead: *"reduce damage by half con mod rounded down
 * by weapon attacks"*).
 * @returns {{ability: "con", min: number}|null}
 */
export function readWeaponLess(effect = "") {
  const m = /\beach weapon attack that hits you deals less damage\. The reduction is half your Constitution modifier, rounded down, and at least (\d+)\b/.exec(plain(effect));
  return m ? { ability: "con", min: Number(m[1]) } : null;
}

/** The flag Sanguine Barrier's reduction rides on the caster's own effect. */
export const WEAPON_LESS_FLAG = "weaponLess";

/**
 * **WHAT A WEAPON ATTACK THAT HITS YOU LOSES** (the defender's own effects; D-1363): the largest Sanguine Barrier
 * standing - two castings are one spell, and 05 lets one effect of a kind count (D-1245's reading) - with its source.
 * @returns {{amount: number, sources: string[]}}
 */
export function weaponLessOn(effects = []) {
  let amount = 0;
  const sources = [];
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[WEAPON_LESS_FLAG] ?? null;
    const n = whole(row?.amount);
    if (!n) continue;
    if (row.source) sources.push(String(row.source));
    amount = Math.max(amount, n);
  }
  return { amount, sources: [...new Set(sources)].sort() };
}

/**
 * **SCENT OF BLOOD** (*you know where each **Bleeding** creature within 60 feet of you is, through walls and
 * darkness. You have a Boon on your next Attack Test this turn against one of them*).
 * @returns {{feet: number, status: "bleeding", boons: number}|null}
 */
export function readScent(effect = "") {
  const t = plain(effect);
  const m = /\byou know where each Bleeding creature within (\d+) feet of you is\b/.exec(t);
  return m ? { feet: Number(m[1]), status: "bleeding", boons: /\bYou have a Boon on your next Attack Test this turn against one of them\b/.test(t) ? 1 : 0 } : null;
}

/**
 * The creatures Scent of Blood finds: every one bearing the status within the feet, the caster excepted, nearest
 * first then by id. `rows` are `{id, feet, statuses, down}`; a creature unmeasured is not found.
 */
export function scentRows(rows = [], { feet = 60, status = "bleeding", except = null } = {}) {
  return (rows ?? []).filter(r => r && r.id !== except && r.down !== true && measured(r.feet) && Number(r.feet) <= feet
    && (r.statuses ?? []).includes(status))
    .sort((a, b) => Number(a.feet) - Number(b.feet) || String(a.id).localeCompare(String(b.id)));
}

/** Delirious Slash's *It also takes a Bane on its next Attack Test before the end of its next turn*. */
export function readNextAttackBane(effect = "") {
  return /\bIt also takes a Bane on its next Attack Test before the end of its next turn\b/.test(plain(effect));
}

/**
 * **A PULL ON A FAILURE** (Summons to Court's *is pulled up to 15 feet in a straight line toward you, stopping in
 * the first space next to you*; the lead: *"reduce to 15 foot pull"*).
 * @returns {{feet: number, toward: "toward", stopsBeside: boolean}|null}
 */
export function readPull(effect = "") {
  const t = plain(effect);
  const m = /\bis pulled up to (\d+) feet in a straight line toward you\b/.exec(t);
  return m ? { feet: Number(m[1]), toward: "toward", stopsBeside: /\bstopping in the first space next to you\b/.test(t) } : null;
}

/**
 * How far the pull moves the creature: its feet, no farther than the space beside the caster - the distance
 * footprint to footprint (`canvas/footprints.mjs#feetApart`, 5 where they stand side by side) less one square.
 * Null where the distance was not measured.
 */
export function pullFeet({ feet = 15, apart = null, square = 5 } = {}) {
  if (apart === null || apart === undefined || !Number.isFinite(Number(apart))) return null;
  const room = Math.max(0, Math.trunc(Number(apart)) - Math.max(1, whole(square)));
  return Math.min(whole(feet), room);
}

/**
 * **THE CONDITIONS A FAILURE LAYS IN ITS NEXT SENTENCE** (Summons to Court's *It is also **Slowed** until the end
 * of its next turn*, Blood Wound's *It is also **Entangled** until the end of its next turn*): read inside the
 * failure's words, before *On a success*. The shared Resist door reads only the sentence that says *On a failure*
 * (`onFail.statuses`), so these are this door's.
 * @returns {Array<{id: string, until: "endOfNextTurn"}>}
 */
export function readAlsoConditions(effect = "") {
  const t = flat(effect);
  const at = t.indexOf("On a failure");
  if (at < 0) return [];
  const failure = t.slice(at).split(/\bOn a success\b/)[0];
  return [...failure.matchAll(/\bIt is also \*\*(\w+)\*\* until the end of its next turn\b/g)].map(m => ({ id: m[1].toLowerCase(), until: "endOfNextTurn" }));
}

/**
 * **VULNERABLE, LAID BY A FAILURE** (Wracking Pain's *is **Vulnerable (Physical)** until the end of its next
 * turn*; 05's Vulnerable (Type): the creature's Armor and Ward do not apply against that type, and the damage rises
 * by 2).
 * @returns {{types: string[], until: "endOfNextTurn"}|null}
 */
export function readLaidVulnerable(effect = "") {
  const m = /\*\*Vulnerable \(([A-Z][a-z]+)\)\*\* until the end of its next turn\b/.exec(flat(effect));
  return m ? { types: [m[1].toLowerCase()], until: "endOfNextTurn" } : null;
}

/**
 * **VEIL OF MIST** (*each weapon attack against you takes a Bane. ... you may move through a creature's space,
 * whatever its size, and you cannot end a Move there. You cannot make a weapon or claw attack for the duration*).
 * @returns {{banes: number, through: boolean, noWeapon: boolean}|null}
 */
export function readVeil(effect = "") {
  const t = plain(effect);
  if (!/\beach weapon attack against you takes a Bane\b/.test(t)) return null;
  return { banes: 1, through: /\byou may move through a creature's space, whatever its size\b/.test(t), noWeapon: /\bYou cannot make a weapon or claw attack for the duration\b/.test(t) };
}

/** The flag Veil of Mist rides on the caster's own effect. */
export const VEIL_FLAG = "veilOfMist";

/** The Banes a weapon attack at the holder takes from its Veil of Mist (the roll dialog's `sovDeterred` lane). */
export function veilBanesOn(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[VEIL_FLAG] ?? null;
    if (row && whole(row.banes) > 0) return [{ banes: whole(row.banes), source: String(row.source ?? "") }];
  }
  return [];
}

/**
 * **VEIL OF MIST'S *YOU CANNOT MAKE A WEAPON OR CLAW ATTACK*** (D-1364): the spell's name where an active effect
 * on the attacker holds it, else null - the pure predicate both attack doors import statically, beside Grant an
 * Audience's (`audienceListening`).
 */
export function veiledFrom(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[VEIL_FLAG] ?? null;
    if (row?.noWeapon === true) return String(row.source ?? "");
  }
  return null;
}

/** *The spell ends if you or your allies harm it|the target* (Mesmerize; Royal Command's and Grant an Audience's own readers say it too). */
export function readHarmEnds(effect = "") {
  return /\bThe spell ends if you or your allies harm (?:it|the target)\b/.test(plain(effect));
}

/**
 * **A TARGET OF A KIND, AND LIVING** (Mesmerize's *One living Humanoid that can see you*): the kind, by
 * 13's creature type, and whether it must be living. *That can see you* is the table's (no sight is measured).
 * @returns {{kind: string, living: boolean}|null}
 */
export function readLivingKind(target = "") {
  const m = /^One (living )?([A-Z][a-z]+) that can see you$/.exec(String(target ?? "").trim());
  return m ? { kind: m[2].toLowerCase(), living: Boolean(m[1]) } : null;
}

/**
 * Why a target of a kind is refused: not living (undead or a construct), or not of the kind. A character is a
 * Humanoid (02's peoples), a creature its own `creatureType`.
 */
export function livingKindRefusal(read, { type = null, creatureType = null, kinds = [] } = {}) {
  if (!read) return null;
  const k = new Set(kinds ?? []);
  if (read.living && (k.has("undead") || k.has("construct"))) return "notLiving";
  const kind = type === "character" ? "humanoid" : String(creatureType ?? "").toLowerCase();
  return kind === read.kind ? null : "wrongKind";
}

/**
 * **A RETALIATION THE CURSED CREATURE CARRIES** (Burden of Sin's *each time it damages a creature with an attack,
 * it takes 3 Shadow damage*).
 * @returns {{amount: number, school: string}|null}
 */
export function readRetaliation(effect = "") {
  const m = /\beach time it damages a creature with an attack, it takes (\d+) ([A-Z][a-z]+) damage\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]), school: m[2].toLowerCase() } : null;
}

/** The flag Burden of Sin rides on the cursed creature's curse effect. */
export const BURDEN_FLAG = "burdenOfSin";

/**
 * **WHAT AN ATTACK THAT DAMAGED A CREATURE COSTS ITS ATTACKER** (D-1365): every Burden of Sin on the attacker's
 * own effects, one a caster - two Sovereigns' burdens are two spells - sorted by caster.
 * @returns {Array<{amount: number, school: string, by: string|null, source: string, effectId: string|null}>}
 */
export function burdensOn(effects = []) {
  const seen = new Map();
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[BURDEN_FLAG] ?? null;
    const n = whole(row?.amount);
    if (!n || typeof row.school !== "string") continue;
    const by = typeof row.by === "string" && row.by ? row.by : null;
    const key = by ?? `effect:${e.id ?? ""}`;
    const held = seen.get(key);
    if (!held || n > held.amount) seen.set(key, { amount: n, school: row.school, by, source: String(row.source ?? ""), effectId: e.id ?? null });
  }
  return [...seen.values()].sort((a, b) => String(a.by ?? "").localeCompare(String(b.by ?? "")) || String(a.effectId ?? "").localeCompare(String(b.effectId ?? "")));
}

/** Whether a blow fires a burden: an attack, no spell, the blow neither moved nor shared, and something taken. */
export function burdenFires({ attack = false, spell = false, moved = false, shared = false, took = 0 } = {}) {
  return attack === true && spell !== true && moved !== true && shared !== true && whole(took) > 0;
}

/**
 * **A FEEDING AT RANGE** (Sanguine Draught's *If the target is not **Bleeding** when the spell takes effect, the
 * spell does nothing and the Vitae is spent. The target loses Health equal to your tier. You feed on it (The Blood
 * Royal), making no Test*).
 * @returns {{needs: "bleeding", loss: "tier", noTest: boolean}|null}
 */
export function readDraught(effect = "") {
  const t = plain(effect);
  if (!/\bThe target loses Health equal to your tier\. You feed on it \(The Blood Royal\), making no Test\b/.test(t)) return null;
  return { needs: /\bIf the target is not Bleeding when the spell takes effect, the spell does nothing\b/.test(t) ? "bleeding" : null, loss: "tier", noTest: true };
}

/**
 * **HEMOPLAGUE'S SPREAD** (*At the start of each of its turns, each other enemy of yours within 10 feet of it that
 * is not **Bleeding** becomes **Bleeding 1***).
 * @returns {{feet: number, value: number}|null}
 */
export function readSpread(effect = "") {
  const m = /\bAt the start of each of its turns, each other enemy of yours within (\d+) feet of it that is not Bleeding becomes Bleeding (\d+)\b/.exec(plain(effect));
  return m ? { feet: Number(m[1]), value: Number(m[2]) } : null;
}

/** The flag Hemoplague rides on the cursed creature's Bleeding. */
export const HEMOPLAGUE_FLAG = "hemoplague";

/**
 * The creatures a spread reaches: every one within the feet of the carrier, an enemy of the caster, not down
 * and not already Bleeding; nearest first, then by id. `rows` are `{id, feet, enemy, statuses, down}`.
 */
export function spreadRows(rows = [], { feet = 10, except = null } = {}) {
  return (rows ?? []).filter(r => r && r.id !== except && r.enemy === true && r.down !== true && measured(r.feet)
    && Number(r.feet) <= feet && !(r.statuses ?? []).includes("bleeding"))
    .sort((a, b) => Number(a.feet) - Number(b.feet) || String(a.id).localeCompare(String(b.id)));
}

/**
 * **BLOOD BOND'S TARGET** (*One creature you have fed on three times, each on a different day, that is willing or
 * Charmed*): the days, and the two ways in.
 * @returns {{days: number, willingOrCharmed: boolean}|null}
 */
export function readBond(target = "") {
  const m = /^One creature you have fed on (\w+) times, each on a different day, that is willing or Charmed$/.exec(String(target ?? "").trim());
  return m ? { days: countOf(m[1]) ?? 3, willingOrCharmed: true } : null;
}

/** Why a bond is refused: too few days fed on, or neither Charmed nor willing (the caster's word for it). */
export function bondRefusal({ days = 0, need = 3, charmed = false, willing = false } = {}) {
  if (whole(days) < Math.max(1, whole(need))) return "bondDays";
  if (charmed !== true && willing !== true) return "bondWilling";
  return null;
}

/** The flag Blood Bond rides on the Charmed it lays. */
export const BOND_FLAG = "bloodBond";

/**
 * **A SANGUINE SHIELD** (Hour of the Court's *You gain a Sanguine Shield: temporary Health equal to 12 plus your
 * Constitution modifier. It lasts for the duration*): the caster's alone (the spec's reading).
 * @returns {{amount: number, ability: "con"}|null}
 */
export function readShield(effect = "") {
  const m = /\bYou gain a Sanguine Shield: temporary Health equal to (\d+) plus your Constitution modifier\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]), ability: "con" } : null;
}

/** The temporary Health a `{amount, ability: "con"}` read gives: the number plus the modifier, never below 0. */
export function plusConAmount(read, conMod = 0) {
  return read ? Math.max(0, whole(read.amount) + (Math.trunc(Number(conMod)) || 0)) : 0;
}

/**
 * **A SELF-CENTRED AREA THE CASTER CARRIES** (Shroud of Sorrow's *A 10 ft radius around you ... The area moves with
 * you*): its tick stands at the heart of the caster (`centre: "self"`), so the card places no Region.
 */
export function readCarriedArea(target = "", effect = "") {
  const m = /^An? (\d+) ft radius around you$/.exec(String(target ?? "").trim());
  return m && /\bThe area moves with you\b/.test(plain(effect)) ? { feet: Number(m[1]) } : null;
}

/**
 * **SHROUD OF SORROW'S DRAIN** (*You regain 1 Health for each enemy that takes damage from this spell*): the Health
 * one creature's damage gives the caster.
 * @returns {{per: number}|null}
 */
export function readTickDrain(effect = "") {
  const m = /\bYou regain (\d+) Health for each enemy that takes damage from this spell\b/.exec(plain(effect));
  return m ? { per: Number(m[1]) } : null;
}

/* ------------------------------------------------------------------ */
/*  The census                                                         */
/* ------------------------------------------------------------------ */

/**
 * **EVERY SPELL THE SOVEREIGN MAY HOLD, THE DOORS THAT CARRY IT AND WHAT STAYS THE TABLE'S** (the plan's
 * B.10, B.11 and C.4). `doors` names the machinery (a descriptor the pack carries, or a door by name);
 * `table` is a clause the lead left to the GM. No row carries a `reason`: the completeness bar (the
 * lead, 2026-11-20: *"I expect all automation as well as animations/sound to be completed as well"*)
 * leaves none.
 */
export const SOVEREIGN_SPELL_AUTOMATION = Object.freeze({
  /* ---- 07 §17, tier 1 ---- */
  "bloodbolt": { doors: ["card:damage", "sov:hitBleed", "sov:preyHeal"] },
  "decree-of-frailty": { doors: ["card:damage", "card:resist", "sov:bloodCurse", "sov:curseEscape", "sov:attackLess"] },
  "leaden-decree": { doors: ["card:damage", "card:resist", "onFail:slowed", "escape:turnEnd", "sov:bloodCurse"] },
  "bleed-for-me": { doors: ["card:resist", "onFail:bleeding", "sov:failBleed", "sov:medicineAtDC", "sov:casterBleedHeal"] },
  "veil-of-majesty": { doors: ["temporary:effect"] },
  "captivating-gaze": { doors: ["card:resist", "sov:bloodCurse", "sov:gaze"] },
  "royal-approach": { doors: ["sov:approach"] },
  "taste-of-lineage": { doors: ["sov:taste", "sov:bloodHeld"], table: "whether the creature is of noble birth is the GM's to say: no block or sheet records a birth (the plan's C.4 GM calls: \"Taste of Lineage's noble birth\")" },
  "royal-seal": { doors: ["sov:seal"] },
  "air-of-majesty": { doors: ["sov:skillBoon"] },
  /* ---- 07 §17, tier 2 ---- */
  "twilight-bloodbolt": { doors: ["card:damage", "sov:splash", "sov:hitBleed"] },
  "sovereigns-kiss": { doors: ["card:damage", "card:drain", "sov:preyTribute"] },
  "overawe": { doors: ["card:damage", "card:resist", "sov:bloodCurse", "sov:curseEscape", "sov:firstAttackBane"] },
  "shackles-of-the-court": { doors: ["card:damage", "card:resist", "onFail:entangled", "sov:bloodCurse"] },
  "mirror-of-self": { doors: ["sov:mirror"] },
  "swarming-shadows": { doors: ["sov:preyArea", "areaTick", "areaGround:difficult", "upkeep:vitae"] },
  "oath-of-fealty": { doors: ["sov:oath"] },
  "royal-herald": { doors: ["sov:herald"] },
  "read-the-supplicant": { doors: ["sov:skillBoon"] },
  /* ---- 07 §17, tier 3 ---- */
  "shadow-lance": { doors: ["card:damage", "sov:hitBleed"] },
  "edict-of-denial": { doors: ["card:damage", "card:resist", "sov:bloodCurse", "sov:curseEscape", "sov:noHealing"] },
  "tithe-of-the-many": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:selfRing", "sov:failBleed", "sov:failHeal"] },
  "bloodbolt-ascension": { doors: ["card:damage", "sov:selfRing", "sov:hitBleed", "sov:flight"] },
  "edict-of-stillness": { doors: ["card:damage", "card:resist", "onFail:entangled", "escape:turnEnd", "sov:bloodCurse"] },
  "mantle-of-majesty": { doors: ["temporary:effect", "sov:tempPlusCon", "sov:refuses"] },
  "eyes-of-the-swarm": { doors: ["sov:swarmEyes"] },
  "royal-command": { doors: ["card:resist", "onFail:charmed", "sov:command"], table: "whether the command harms the creature or its allies is the GM's to say (the plan's C.4 GM calls: \"Royal Command's does not harm\")" },
  "grant-an-audience": { doors: ["card:resist", "sov:audience"], table: "when the audience ends short of harm is the GM's to say (the plan's C.4 GM calls: \"Grant an Audience's end\")" },
  /* ---- 07 §17, tier 4 ---- */
  "majesty-unbound": { doors: ["sov:majesty"] },
  "edict-of-the-crown": { doors: ["card:damage", "card:resist", "onFail:slowed", "sov:bloodCurse", "sov:curseEscape", "sov:attackLess"] },
  "crimson-cascade": { doors: ["card:damage", "card:resist", "onFail:bleeding+prone", "sov:failBleed"] },
  "embrace-of-the-vampyr": { doors: ["card:damage", "card:drain", "sov:heldTarget", "sov:feed"] },
  "gaze-from-the-throne": { doors: ["card:resist", "sov:bloodHeld", "sov:throneGaze"] },
  /* ---- 07 §17, tier 5 ---- */
  "the-crimson-tithe": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:selfRing", "sov:failBleed", "sov:noHealing", "sov:failHeal"] },
  "aortic-unraveling": { doors: ["card:damage", "card:resist", "card:drain", "onFail:stunned", "sov:killTribute"] },
  "unfading-glory": { doors: ["sov:unfading"] },
  /* ---- 07 §17's second batch (D-1360 onward) ---- */
  "sanguine-barrier": { doors: ["sov:weaponLess"] },
  "scent-of-blood": { doors: ["sov:scent"] },
  "delirious-slash": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:failBleed", "sov:nextBane"] },
  "summons-to-court": { doors: ["card:damage", "card:resist", "sov:pull", "sov:also"] },
  "incite-terror": { doors: ["card:damage", "card:resist", "onFail:frightened", "sov:enemiesOnly"] },
  "wracking-pain": { doors: ["card:damage", "card:resist", "sov:bloodCurse", "sov:vulnerable"] },
  "veil-of-mist": { doors: ["sov:veil"] },
  "mesmerize": { doors: ["card:resist", "onFail:charmed", "sov:livingKind", "sov:harmEnds"], table: "what the creature remembers afterward is the GM's to say (07 §17's Mesmerize: \"The GM decides what the target remembers afterward\")" },
  "shroud-of-sorrow": { doors: ["areaTick", "sov:carried", "sov:tickRating", "sov:drain", "upkeep:vitae"] },
  "burden-of-sin": { doors: ["card:damage", "card:resist", "sov:bloodCurse", "sov:curseEscape", "sov:burden"] },
  "edict-of-silence": { doors: ["card:damage", "card:resist", "onFail:silenced", "escape:turnEnd", "sov:bloodCurse"] },
  "crimson-carapace": { doors: ["sov:refuses", "sov:carapace"] },
  "sanguine-draught": { doors: ["sov:draught"] },
  "hemoplague": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:failBleed", "sov:bloodCurse", "sov:curseEscape", "sov:spread"] },
  "blood-wound": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:failBleed", "sov:also", "sov:enemiesOnly"] },
  "blood-bond": { doors: ["sov:bond"], table: "how long the bond holds and what the creature will and will not do for the caster are the GM's to say (07 §17's Blood Bond: \"The GM decides how long the bond holds and what the target will and will not do for you\")" },
  "cauldron-of-blood": { doors: ["card:damage", "card:resist", "onFail:bleeding", "sov:failBleed", "sov:enemiesOnly"] },
  "hour-of-the-court": { doors: ["card:resist", "onFail:frightened+prone", "sov:selfRing", "sov:flight", "sov:shield"] },
  /* ---- the spells the Sovereign shares or reaches ---- */
  "drain-life": { doors: ["card:damage", "necro:casterDrain", "upkeep:vitae"] },
  "siphon-life": { doors: ["card:damage", "necro:casterDrain", "upkeep:vitae"] },
  "exsanguinate": { doors: ["card:damage", "card:drain"] },
  "graveblight": { doors: ["areaTick", "areaTick:undeadInstead", "remains:healingHalved", "upkeep:vitae"] },
  "contagion": { doors: ["sov:openDeath"] }
});

/**
 * How many spells leave a clause to the table: the lead's three GM calls, and the two the second batch's own words
 * give the GM (Mesmerize's memory, Blood Bond's span and service; D-1379), a ceiling that may only fall.
 */
export const SOVEREIGN_SPELL_TABLE_CEILING = 5;

/**
 * **A DESCRIPTOR DOOR**: a label the pack's own descriptor proves (`sovereign-spells.test.mjs` reads the
 * spell's YAML for it), and the generic card or area door every spell rides.
 */
export const SOVEREIGN_DESCRIPTOR_PREFIXES = Object.freeze(["card:damage", "card:resist", "card:drain", "onFail:", "areaTick", "areaGround:", "remains:", "temporary:effect", "escape:turnEnd"]);

/**
 * **WHERE EVERY OTHER DOOR IS CALLED**: a label a row names that no descriptor proves, with the call
 * sites that carry it - each `{file, fn, contains}` a fragment the census finds INSIDE the named
 * function of that file, comments blanked (`tools/strip-comments.mjs`), so a label is a caller.
 */
const FX = "module/effects/sovereign-spells.mjs";
const WF = "module/dice/workflows.mjs";
const CHAT = "module/dice/chat.mjs";
const ACTOR = "module/documents/actor.mjs";
const COMBAT = "module/documents/combat.mjs";
const CHARDATA = "module/data/actor/character.mjs";
const NPCDATA = "module/data/actor/npc.mjs";
const ACTIONS = "module/applications/actions.mjs";
export const SOVEREIGN_SPELL_DOORS = Object.freeze({
  /* ---- the second batch (D-1360 onward) ---- */
  "sov:weaponLess": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const weaponLess = readWeaponLess(sys.effect);" },
    { file: ACTOR, fn: "applyDamage", contains: "const barrier = weaponLessOn(this.effects ?? []);" }
  ],
  "sov:scent": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (scent) lines.push(...await scentLands(" },
    { file: FX, fn: "scentLands", contains: "scentRows(rows, {" },
    { file: FX, fn: "scentLands", contains: "targetStatus: scent.status" },
    { file: "module/applications/roll-dialog.mjs", fn: "attackTalentLines", contains: "pendingNextAttack?.({ targetStatuses: target?.statuses ?? [] })" }
  ],
  "sov:nextBane": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "if (readNextAttackBane(effect)) {" }
  ],
  "sov:pull": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const pull = readPull(effect);" },
    { file: FX, fn: "pullLands", contains: "const r = await forceMove({" }
  ],
  "sov:also": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const also = readAlsoConditions(effect);" }
  ],
  "sov:enemiesOnly": [
    { file: FX, fn: "judgeSovereignSpell", contains: "if (who && (await relationOf(actor, own, who, tokenOfRow(row))) === \"enemy\") kept.push(row);" }
  ],
  "sov:vulnerable": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "if (vulnerable) extra[VULNERABLE_FLAG] = {" },
    { file: CHARDATA, fn: "prepareDerivedData", contains: "this.vulnerable = withLaidVulnerable(this.vulnerable, this.parent?.effects ?? []);" },
    { file: NPCDATA, fn: "prepareDerivedData", contains: "this.vulnerable = withLaidVulnerable(this.vulnerable ?? [], this.parent?.effects ?? []);" }
  ],
  "sov:veil": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const veil = readVeil(sys.effect);" },
    { file: CHARDATA, fn: "prepareDerivedData", contains: "...veilBanesOn(this.parent?.effects ?? [])" },
    { file: ACTIONS, fn: "attackWithDialog", contains: "const veiled = veiledFrom(actor?.effects ?? []);" },
    { file: ACTIONS, fn: "npcAttackWithDialog", contains: "const veiled = veiledFrom(actor?.effects ?? []);" }
  ],
  "sov:livingKind": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const livingKind = readLivingKind(sys.target);" }
  ],
  "sov:harmEnds": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "readHarmEnds(effect)" },
    { file: FX, fn: "endOnHarm", contains: "await harmEndedIds(target, by)" },
    { file: ACTOR, fn: "applyDamage", contains: "await endOnHarm(this, by);" }
  ],
  "sov:carried": [
    { file: FX, fn: "judgeSovereignSpell", contains: "if (readCarriedArea(sys.target, sys.effect)) plan.carried = true;" },
    { file: WF, fn: "castSpell", contains: "const areaOut = sovPlan?.preyArea || sovPlan?.carried ? null" }
  ],
  "sov:tickRating": [
    { file: WF, fn: "castSpell", contains: "rating: tickRating(heldTick.damage.ratingFrom," },
    { file: COMBAT, fn: "selfTicksOf", contains: "tickRating(\"halfCha\"" }
  ],
  "sov:drain": [
    { file: COMBAT, fn: "_areaTicks", contains: "m.shroudDrain({ caster, victim: actor, per: source.tick.damage.drain" },
    { file: FX, fn: "shroudDrain", contains: "await caster.applyHealing?.(n," }
  ],
  "sov:burden": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const burden = readRetaliation(effect);" },
    { file: ACTOR, fn: "applyDamage", contains: "await burdenOnBlow(by, this);" },
    { file: FX, fn: "strikeBurden", contains: "await strikeFromArea({ actor: bearer" }
  ],
  "sov:carapace": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const changes = NO_APPLY.includes(sys.identifier) ? appliedChanges(sys) : [];" }
  ],
  "sov:draught": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const draught = readDraught(sys.effect);" },
    { file: FX, fn: "draughtLands", contains: "await core.feedOn(actor, who, {" },
    { file: FX, fn: "sovereignSpellQueryHandler", contains: "await target.loseHealth(loss);" }
  ],
  "sov:spread": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "if (spread) extra[HEMOPLAGUE_FLAG] =" },
    { file: FX, fn: "advanceSovereignSpells", contains: "lines.push(...await hemoplagueSpread(actor, combat));" },
    { file: FX, fn: "hemoplagueSpread", contains: "spreadRows(near," },
    { file: COMBAT, fn: "_effectTicks", contains: "m.advanceSovereignSpells(actor, this)" }
  ],
  "sov:bond": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const bond = readBond(sys.target);" },
    { file: FX, fn: "bondLands", contains: "statuses: [\"charmed\"]," },
    { file: FX, fn: "bondLands", contains: "await askGM({ act: \"effect\", targetUuid: who.uuid, data, casterUuid: actor.uuid })" },
    { file: FX, fn: "sovereignCardPress", contains: "if (press === \"bondEnd\") {" },
    { file: "module/effects/sovereign-core.mjs", fn: "writeFeeding", contains: "withFeedDay(sovereign.getFlag(SCOPE, FEED_DAYS_FLAG)" }
  ],
  "sov:shield": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const shield = readShield(sys.effect);" }
  ],
  /* ---- the first batch ---- */
  "sov:hitBleed": [
    { file: FX, fn: "sovereignSpellAfterApply", contains: "const bleed = hitBleedFor(readHitBleed(effect, { test: flags.sovereignSpell.test }), { index, sl: flags.sl ?? 0 });" },
    { file: CHAT, fn: "applyDamageToTargets", contains: "await sovSpells.sovereignSpellAfterApply({ message, target: actor, amount: damageOutcome.amount, index: Number(index) });" }
  ],
  "sov:preyHeal": [
    { file: FX, fn: "sovereignCardRows", contains: "const preyHeal = readPreyHeal(sys.effect);" },
    { file: WF, fn: "castSpell", contains: "heal = await sovereignCardRows({" }
  ],
  "sov:bloodCurse": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const tag = bloodCurseRecord({ source: caster?.uuid ?? null, spell, identifier: flags.identifier ?? null, cast: flags.cast ?? null });" },
    { file: CHAT, fn: "rollResists", contains: "await sovereignSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" },
    { file: "module/applications/roll-dialog.mjs", fn: "targetSnapshots", contains: "cursedBy: cursedBy(" },
    { file: "module/rules/talent-gates.mjs", fn: "targetFactsOf", contains: "cursedByUser: (Array.isArray(snapshot.cursedBy)" }
  ],
  "sov:curseEscape": [
    { file: FX, fn: "layBloodCurse", contains: "[ESCAPE_FLAG]: curseEscape" },
    { file: "module/rules/escapes.mjs", fn: "escapeOfEffect", contains: "if (escape?.condition === CURSE_ESCAPE)" },
    { file: COMBAT, fn: "_onEndTurn", contains: "await this._escapePrompts(combatant, \"turnEnd\")" }
  ],
  "escape:turnEnd": [
    { file: CHAT, fn: "rollResists", contains: "if (effect && escape?.condition === id) await effect.setFlag(\"azeroth-rpg\", ESCAPE_FLAG, escape);" },
    { file: COMBAT, fn: "_onEndTurn", contains: "await this._escapePrompts(combatant, \"turnEnd\")" }
  ],
  "sov:attackLess": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const less = readAttackLess(effect);" },
    { file: ACTOR, fn: "applyDamage", contains: "const cursedLess = attack ? attackLessOn(by.effects ?? []) : { amount: 0, sources: [] };" }
  ],
  "sov:failBleed": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const failBleed = readFailBleed(effect);" }
  ],
  "sov:medicineAtDC": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "if (readMedicineAtDC(effect))" }
  ],
  "sov:casterBleedHeal": [
    { file: FX, fn: "advanceSovereignSpells", contains: "lines.push(...await bleedForMeHeal(actor));" },
    { file: FX, fn: "bleedForMeHeal", contains: "const read = readCasterBleedHeal(" },
    { file: COMBAT, fn: "_effectTicks", contains: "m.advanceSovereignSpells(actor, this)" }
  ],
  "sov:gaze": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const gaze = readGaze(effect);" },
    { file: COMBAT, fn: "onPreMoveToken", contains: "leashRefusalFor(" }
  ],
  "sov:approach": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const approach = readApproach(sys.effect);" },
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.approach) lines.push(...await approachLands(" }
  ],
  "sov:taste": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const taste = readTaste(sys.effect);" },
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.taste) lines.push(...await tasteLands(" }
  ],
  "sov:bloodHeld": [
    { file: FX, fn: "rememberBlood", contains: "addHeldBlood(" },
    { file: FX, fn: "registerSovereignSpellHooks", contains: "onClawHit(payload => rememberClawBlood(payload)" },
    { file: ACTOR, fn: "_damageLedger", contains: "out[`flags.azeroth-rpg.${BLED_AT_FLAG}`] = game.time?.worldTime ?? 0;" }
  ],
  "sov:seal": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.seal) lines.push(...await sealLands(" },
    { file: FX, fn: "registerSovereignSpellHooks", contains: "Hooks.on(\"updateWall\", (wall, change) => sealOnWall(wall, change)" }
  ],
  "sov:skillBoon": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const boon = readSkillBoon(sys.effect);" },
    { file: "module/data/actor/character.mjs", fn: "prepareDerivedData", contains: "skillBoonsOn(this.parent?.effects ?? [])" }
  ],
  "sov:splash": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const splash = readSplash(sys.target);" }
  ],
  "sov:preyTribute": [
    { file: FX, fn: "sovereignSpellAfterApply", contains: "const preyTribute = readPreyTribute(effect);" }
  ],
  "sov:firstAttackBane": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "if (readFirstAttackBane(effect))" },
    { file: FX, fn: "advanceSovereignSpells", contains: "lines.push(...await restockOverawe(actor));" }
  ],
  "sov:mirror": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const no = mirrorRefusal({" },
    { file: FX, fn: "mirrorInBlow", contains: "{ ...options, answers: { mirrorOfSelf: true, deadline } }" },
    { file: ACTOR, fn: "applyDamage", contains: "await mirrorInBlow(this, { amount, attack, by });" }
  ],
  "sov:preyArea": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const preyArea = readPreyArea(sys.target, sys.effect);" },
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.preyArea) lines.push(...await swarmLands(" }
  ],
  "upkeep:vitae": [
    { file: WF, fn: "castSpell", contains: "upkeep: readUpkeep(sys.effect)" },
    { file: COMBAT, fn: "_turnTicks", contains: "upkeepOf(entry, actor.items?.get?.(entry?.spellId)?.system ?? null)," }
  ],
  "sov:herald": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const herald = readHerald(sys.effect);" },
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.herald) lines.push(...await heraldLands(" }
  ],
  "sov:oath": [
    { file: FX, fn: "judgeSovereignSpell", contains: "if (readOath(sys.effect)) {" },
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.oath) lines.push(...await oathLands(" },
    { file: FX, fn: "sovereignCardPress", contains: "if (press === \"oathBroken\")" }
  ],
  "sov:noHealing": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const noHeal = readNoHealing(effect) ?" }
  ],
  "sov:selfRing": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const selfRing = readSelfRing(sys.target);" }
  ],
  "sov:failHeal": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const failHeal = readFailHeal(effect);" }
  ],
  "sov:flight": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const flight = readFlight(sys.effect);" }
  ],
  "sov:tempPlusCon": [
    { file: WF, fn: "castTemporary", contains: "read.ability === \"con\"" }
  ],
  "sov:refuses": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const refused = readRefusedConditions(sys.effect);" }
  ],
  "sov:swarmEyes": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "if (plan.swarmEyes) lines.push(...await swarmEyesLands(" },
    { file: FX, fn: "sovereignCardPress", contains: "if (press === \"look\")" }
  ],
  "sov:command": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const command = readCommand(effect);" },
    { file: FX, fn: "endOnHarm", contains: "await harmEndedIds(target, by)" },
    { file: FX, fn: "harmEndedIds", contains: "harmEnds({" },
    { file: ACTOR, fn: "applyDamage", contains: "await endOnHarm(this, by);" }
  ],
  "sov:audience": [
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const audience = readAudience(effect);" },
    { file: FX, fn: "endOnHarm", contains: "await harmEndedIds(target, by)" },
    { file: FX, fn: "harmEndedIds", contains: "harmEnds({" },
    { file: "module/applications/actions.mjs", fn: "attackWithDialog", contains: "const listening = audienceListening(actor?.effects ?? []);" },
    { file: "module/applications/actions.mjs", fn: "npcAttackWithDialog", contains: "const listening = audienceListening(actor?.effects ?? []);" }
  ],
  "sov:majesty": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const majesty = readMajesty(sys.effect);" },
    { file: ACTOR, fn: "applyDamage", contains: "const majestic = await majestyOnBlow(this, { by, amount, attack, spell });" }
  ],
  "sov:heldTarget": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const needs = readNeedsHeld(sys.target);" }
  ],
  "sov:feed": [
    { file: FX, fn: "sovereignSpellAfterApply", contains: "if (readFeedsOn(effect) && caster)" }
  ],
  "sov:throneGaze": [
    { file: FX, fn: "judgeSovereignSpell", contains: "const throne = readThroneGaze(sys.effect);" },
    { file: FX, fn: "sovereignSpellAfterResist", contains: "const throne = readThroneGaze(effect);" }
  ],
  "sov:killTribute": [
    { file: FX, fn: "sovereignSpellAfterApply", contains: "if (readKillTribute(effect) && caster" }
  ],
  "sov:unfading": [
    { file: FX, fn: "sovereignSpellAfterCast", contains: "const glory = readUnfading(sys.effect);" },
    { file: ACTOR, fn: "_holdAtOne", contains: "const glory = await unfadingHold(this, { before, amount });" }
  ],
  "necro:casterDrain": [
    { file: "module/effects/necromancer-spells.mjs", fn: "advanceNecroSpells", contains: "lines.push(...await drainLifeTurn(actor));" },
    { file: COMBAT, fn: "_effectTicks", contains: "m.advanceNecroSpells(actor, this)" }
  ],
  "sov:openDeath": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroScope", contains: "sovereignOpenDeath(sys, actor?.classNames ?? [])" }
  ]
});
