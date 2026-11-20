/**
 * **THE NECROMANCER'S SPELLS, AND WHAT EACH ONE DOES AT THE TABLE** (07 §17, *Restricted
 * Necromancer*; the Necromancer plan's *Spells* and Phase 4 door 13; run 4c-S). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * Most of 07's Death spells ride the doors every spell already rides, off the descriptors the parser
 * stamps on the pack (`tools/parse-book/spells.mjs`): the card's damage and its Resist (`damage`,
 * `test`, `onFail`), the laid effect (`applies`), the area's tick (`areaTick`, D-756), the ground
 * (`areaGround`, D-757), the escape (D-778), the raise and the corpse marks (D-970, D-972) and the
 * horde (4b). What no descriptor carries is read here, off 07's own words, and written by
 * `effects/necromancer-spells.mjs`:
 *
 * - the card's rows a spell rewrites before anything is paid: Grave Rot's ring round a corpse, Sever
 *   the Soul's ring round its target, Reaping's ring round the caster, Frenzy of the Dead's raised
 *   dead, Unholy Renewal's undead allies (`readCorpseRing`, `readSeverRing`, `readSelfRing`,
 *   `readRaisedTargets`, `readUndeadTargets`);
 * - the rows the card draws: Grave Touch's heal on the caster, Grave Tide's and Necrotic Nova's undead
 *   allies healed instead (`readSelfHeal`, `readUndeadInstead`);
 * - what a failed Resist lays beside its condition: Soul Lash's Bane, Cripple's Damage Rating and
 *   Strength, Plague Wind's Poisoned 1 at the Spell DC, Bone Prison's hold, Soul Rip's Essence,
 *   Reaping's Health, Puppet of Flesh's control, the curses' riders;
 * - Soul Cage's and Sever the Soul's marks on the dead (`caged`, `severed`), which every raise, every
 *   question and every restoration reads (`soulMarkRefusal`, and `rules/raise.mjs#corpseRefusal`);
 * - Bone Shield's Reaction at the one damage door, and Barbed Bone's retaliation on it;
 * - the twelve roleplay spells, Call the Departed and Speak with the Dead.
 *
 * **`NECRO_SPELL_AUTOMATION` IS THE CENSUS** (`necromancer-spells.test.mjs`), in the knight's shape
 * (`death-knight-spells.mjs`, D-983, D-993): every spell the Necromancer may hold - 07's Death spells
 * whose Restricted line is empty or names the Necromancer, and every spell whose Restricted line
 * names it - names the doors that carry it, and `NECRO_SPELL_DOORS` names each door's call site BY
 * FUNCTION. A `table` clause is only the lead's GM calls (Stitch Abomination's material, Bind
 * Banshee's female corpse).
 */

/** HTML to one flat line, bold kept as `**`. */
function flat(text) {
  return String(text ?? "").replace(/<\/?(?:strong|b)>/g, "**").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** HTML to one flat line, bold dropped. */
const plain = text => flat(text).replace(/\*\*/g, "");

/** A whole number at or above nothing. */
const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** Numbers 07 spells in words on a Target line. */
const WORD_NUMBERS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });
const countOf = word => WORD_NUMBERS[String(word ?? "").toLowerCase()] ?? (Number(word) || null);

/* ------------------------------------------------------------------ */
/*  Whose cast the Necromancer doors carry                             */
/* ------------------------------------------------------------------ */

/**
 * **THE NECROMANCER DOORS CARRY A NECROMANCER'S CAST** (fix run 4; the orchestrator's reading until
 * the lead rules, D-1099). A spell the Necromancer alone holds (its Restricted line names no other
 * class) is carried for any caster, a creature's Spells line included. A spell it SHARES - Drain Life,
 * Curse of Weakness and Curse of Tongues with the Warlock, Speak with the Dead with the Priest,
 * Graveblight and Contagion with the Death Knight - is carried only where the caster holds the
 * Necromancer class; anyone else casts it exactly as before 4c-S: the same Apply, the same damage at
 * the cast, no corpse pick.
 *
 * @param {string[]} spellClasses   the spell's `system.classes` (the parser's, off the Restricted line)
 * @param {string[]} casterClasses  the caster's class names (`AzerothActor#classNames`); none for a creature
 */
export function necroCaster(spellClasses = [], casterClasses = []) {
  const classes = Array.isArray(spellClasses) ? spellClasses : [];
  if (!classes.includes("Necromancer")) return false;
  if (classes.every(c => c === "Necromancer")) return true;
  return (Array.isArray(casterClasses) ? casterClasses : []).includes("Necromancer");
}

/* ------------------------------------------------------------------ */
/*  07's words, read: the rows a spell names                           */
/* ------------------------------------------------------------------ */

/**
 * **GRAVE ROT'S RING** (*Target: Each living creature within a 10 ft radius of one corpse*; *Choose a
 * corpse within range ... The corpse is not destroyed*).
 * @returns {{feet: number, living: boolean, keepsCorpse: boolean}|null}
 */
export function readCorpseRing(target = "", effect = "") {
  const m = /\bEach (living )?creature within an? (\d+) ft radius of one corpse\b/i.exec(String(target ?? ""));
  if (!m) return null;
  return { feet: Number(m[2]), living: Boolean(m[1]), keepsCorpse: /\bThe corpse is not destroyed\b/.test(plain(effect)) };
}

/**
 * **SEVER THE SOUL'S RING** (*Target: One creature, and each other enemy within a 15 ft radius of it*;
 * *The target takes 20 Shadow damage ... Each other enemy within a 15 ft radius of the target makes a
 * Spirit Resilience Test*): the first row takes the damage and no Test, every other row the Test and
 * no damage.
 * @returns {{feet: number}|null}
 */
export function readSeverRing(target = "") {
  const m = /^One creature, and each other enemy within an? (\d+) ft radius of it$/i.exec(String(target ?? "").trim());
  return m ? { feet: Number(m[1]) } : null;
}

/** Sever the Soul's mark: *If this damage reduces it to 0 Health, nothing can raise or restore it*. */
export function readSevers(effect = "") {
  return /\bIf this damage reduces it to 0 Health, nothing can raise or restore it\b/.test(plain(effect));
}

/**
 * **A RING ROUND THE CASTER** (Reaping's *Target: Each enemy within a 20 ft radius of you*).
 * @returns {{feet: number, who: "enemy"}|null}
 */
export function readSelfRing(target = "") {
  const m = /^Each enemy within an? (\d+) ft radius of you$/i.exec(String(target ?? "").trim());
  return m ? { feet: Number(m[1]), who: "enemy" } : null;
}

/**
 * **THE CASTER'S RAISED DEAD WITHIN RANGE** (Frenzy of the Dead's *Each of your raised dead within
 * range*): the rows are the caster's horde on the board, within the Range.
 */
export function readRaisedTargets(target = "") {
  return /^Each of your raised dead within range$/i.test(String(target ?? "").trim());
}

/**
 * **AN UNDEAD TARGET** (Mend the Dead's and Unholy Restoration's *One undead creature*; Unholy
 * Renewal's *Each undead ally within a 20 ft radius of a point*). `ally` where the line names allies.
 * @returns {{ally: boolean, feet: number|null, one: boolean}|null}
 */
export function readUndeadTargets(target = "") {
  const t = String(target ?? "").trim();
  if (/^One undead creature$/i.test(t)) return { ally: false, feet: null, one: true };
  const m = /^Each undead ally within an? (\d+) ft radius of a point$/i.exec(t);
  return m ? { ally: true, feet: Number(m[1]), one: false } : null;
}

/** Enslave the Dead's own line (*One undead creature that is not a Boss*) is the horde door's, never this. */

/**
 * **HOW MANY A TARGET LINE ALLOWS** (Shroud of Bone's *Up to four creatures*; Shroud of the Grave's
 * *You and up to five allies within 30 ft*).
 * @returns {{max: number, you: boolean, allies: boolean, feet: number|null}|null}
 */
export function readUpTo(target = "") {
  const t = String(target ?? "").trim();
  let m = /^Up to (\w+) creatures$/i.exec(t);
  if (m && countOf(m[1])) return { max: countOf(m[1]), you: false, allies: false, feet: null };
  m = /^You and up to (\w+) allies within (\d+) ft$/i.exec(t);
  if (m && countOf(m[1])) return { max: countOf(m[1]) + 1, you: true, allies: true, feet: Number(m[2]) };
  return null;
}

/* ------------------------------------------------------------------ */
/*  07's words, read: what the card draws                              */
/* ------------------------------------------------------------------ */

/** Grave Touch's *The target takes 4 Shadow damage. You regain 2 Health.* - a heal on the CASTER. */
export function readSelfHeal(effect = "") {
  const m = /\bThe target takes \d+ [A-Z][a-z]+ damage\. You regain (\d+) Health\b/.exec(plain(effect));
  return m ? { amount: Number(m[1]) } : null;
}

/**
 * **THE UNDEAD ALLY HEALED INSTEAD** (Grave Tide's and Necrotic Nova's *Each enemy in the line takes 4
 * Shadow damage. Each undead ally in the line regains 4 Health instead*): an enemy takes the damage,
 * an undead ally the heal, and nobody else either.
 * @returns {{heal: number}|null}
 */
export function readUndeadInstead(effect = "") {
  const m = /\bEach enemy in the (?:line|area|cone) takes \d+ [A-Z][a-z]+ damage\. Each undead ally in the (?:line|area|cone) regains (\d+) Health instead\b/.exec(plain(effect));
  return m ? { heal: Number(m[1]) } : null;
}

/** Unholy Restoration's *One condition on the target ends. You choose which.* */
export function readEndsCondition(effect = "") {
  return /\bOne condition on the target ends\. You choose which\b/.test(plain(effect));
}

/* ------------------------------------------------------------------ */
/*  07's words, read: what a failed Resist lays beside its condition   */
/* ------------------------------------------------------------------ */

/** Soul Lash's *On a failure it takes 6 Shadow damage and a Bane on its next Attack Test before the end of its next turn*. */
export function readNextAttackBane(effect = "") {
  return /\bOn a failure it takes \d+ [A-Z][a-z]+ damage and a Bane on its next Attack Test before the end of its next turn\b/.test(plain(effect))
    ? { kind: "attack", banes: 1 } : null;
}

/**
 * **CRIPPLE'S NUMBERS** (*On a failure it is **Slowed**, its Damage Rating falls by 2 and its Strength
 * falls by 5, for the duration*): a Damage Rating in the `final` phase (a derived number) and Strength
 * in the `initial` phase, so its modifier moves with it (CLAUDE.md §15; the plan's reading).
 * @returns {{damageRating: number, strength: number}|null}
 */
export function readFailDrops(effect = "") {
  const m = /\bits Damage Rating falls by (\d+) and its Strength falls by (\d+)\b/.exec(plain(effect));
  return m ? { damageRating: Number(m[1]), strength: Number(m[2]) } : null;
}

/**
 * The changes Cripple's drops lay, by the kind of creature: a character's Damage Rating is its attack
 * lane (`system.damageBonus.attack.all`), a creature's a scalar (`system.damageBonus`).
 * @param {{damageRating: number, strength: number}} drops
 * @param {{character?: boolean}} o
 */
export function dropChanges(drops, { character = false } = {}) {
  if (!drops) return [];
  return [
    { key: character ? "system.damageBonus.attack.all" : "system.damageBonus", type: "add", value: String(-whole(drops.damageRating)), phase: "final" },
    { key: "system.abilities.str.value", type: "add", value: String(-whole(drops.strength)), phase: "initial" }
  ];
}

/** Plague Wind's *is **Poisoned 1** against your Spell DC* (the architect review's question 6). */
export function readPoisonedAtDC(effect = "") {
  const m = /\bis Poisoned (\d+) against your Spell DC\b/.exec(plain(effect));
  return m ? { value: Number(m[1]) } : null;
}

/**
 * **BONE PRISON'S HOLD** (*While it is Entangled by this spell, it cannot be moved. It cannot end this
 * Entangled with an action*): the Entangled's escape is its turn-end Test alone, and the creature is
 * moved by nothing while it stands.
 */
export function readPrisonHold(effect = "") {
  const t = plain(effect);
  return /\bWhile it is Entangled by this spell, it cannot be moved\b/.test(t)
    ? { unmoved: true, noAction: /\bIt cannot end this Entangled with an action\b/.test(t) } : null;
}

/** Soul Rip's *If the target is living and fails the Test, you gain 1 Essence*. */
export function readSoulRip(effect = "") {
  const m = /\bIf the target is living and fails the Test, you gain (\d+) Essence\b/.exec(plain(effect));
  return m ? { essence: Number(m[1]) } : null;
}

/** Reaping's *You regain Health equal to your tier for each enemy that fails its Test*. */
export function readReapingHeal(effect = "") {
  return /\bYou regain Health equal to your tier for each enemy that fails its Test\b/.test(plain(effect)) ? { per: "tier" } : null;
}

/**
 * **SOUL CAGE** (*If it is living and dies before the end of your next turn, its death gives you 1
 * additional Essence. If it dies before the end of your next turn, no one but you can raise, question
 * or restore it*). MY READING: neither sentence names the failure, so both hold whatever the Test -
 * the cage is laid on the target as the spell goes off.
 * @returns {{essence: number, caged: boolean}|null}
 */
export function readSoulCage(effect = "") {
  const t = plain(effect);
  const m = /\bIf it is living and dies before the end of your next turn, its death gives you (\d+) additional Essence\b/.exec(t);
  const caged = /\bIf it dies before the end of your next turn, no one but you can raise, question or restore it\b/.test(t);
  return m || caged ? { essence: m ? Number(m[1]) : 0, caged } : null;
}

/** Whether a card's target row (`{sceneId, tokenId, actorId}`) names the creature: by token where both have one, else by actor. */
function rowNames(row, who) {
  if (!row || !who) return false;
  if (row.tokenId && who.tokenId) return row.tokenId === who.tokenId;
  return Boolean(row.actorId) && row.actorId === who.actorId;
}

/**
 * **WHAT AN ESSENCE GAIN FROM A SPELL MAY GIVE** (the necroSpell query's `essence` act; the final
 * review's S3; D-982: the handler holds every amount to the card's row, never the payload). Judged off
 * plain snapshots, so the GM's or the holder's client judges the same:
 * - **Soul Rip** (*If the target is living and fails the Test, you gain 1 Essence*): the card is a
 *   Necromancer spell's, cast by the holder, its effect writes the gain, it names the creature that
 *   failed, and that creature has not already given the card its Essence. The asker is a GM, an owner
 *   of the holder, or an owner of the creature that failed (who pressed the Resist).
 * - **Soul Cage** (*its death gives you 1 additional Essence*): asked by a GM alone (the death watch
 *   runs on the active GM), for a living cage laid by the holder on the creature that died.
 * The amount is the smaller of what was asked and what the row gives.
 *
 * @param {{source?: string, amount?: number, holderUuid?: string|null,
 *   asker?: {gm?: boolean, ownsHolder?: boolean, ownsFrom?: boolean},
 *   from?: {uuid?: string, actorId?: string|null, tokenId?: string|null, living?: boolean}|null,
 *   card?: {kind?: string, necro?: boolean, casterUuid?: string|null, effect?: string, targets?: object[], claimed?: string[]}|null,
 *   cage?: {by?: string|null, essence?: number, living?: boolean, parentUuid?: string|null}|null}} o
 * @returns {{ok: true, amount: number}|{ok: false, reason: string}}
 */
export function essenceGainClaim({ source = "", amount = 0, holderUuid = null, asker = {}, from = null, card = null, cage = null } = {}) {
  const asked = whole(amount);
  if (!holderUuid) return { ok: false, reason: "notOwner" };
  if (source === "soulCage") {
    if (asker?.gm !== true) return { ok: false, reason: "notYours" };
    if (!cage || cage.by !== holderUuid || cage.living !== true) return { ok: false, reason: "noCage" };
    if (!from?.uuid || cage.parentUuid !== from.uuid) return { ok: false, reason: "notCaged" };
    const n = Math.min(asked, whole(cage.essence));
    return n > 0 ? { ok: true, amount: n } : { ok: false, reason: "nothing" };
  }
  if (source === "soulRip") {
    if (!(asker?.gm === true || asker?.ownsHolder === true || asker?.ownsFrom === true)) return { ok: false, reason: "notYours" };
    if (card?.kind !== "spell" || card?.necro !== true) return { ok: false, reason: "card" };
    if (card.casterUuid !== holderUuid) return { ok: false, reason: "notCaster" };
    if (!from?.uuid || from.living !== true || !(card.targets ?? []).some(r => rowNames(r, from))) return { ok: false, reason: "notTarget" };
    if ((card.claimed ?? []).includes(from.uuid)) return { ok: false, reason: "claimed" };
    const n = Math.min(asked, whole(readSoulRip(card.effect ?? "")?.essence));
    return n > 0 ? { ok: true, amount: n } : { ok: false, reason: "nothing" };
  }
  return { ok: false, reason: "source" };
}

/**
 * **PUPPET OF FLESH** (*On a failure you control it on your turns for the duration, and your own body
 * is **Stunned** for the duration. The target repeats the Test at the end of each of its turns, and the
 * spell ends on a success*): the Mind Control door's control (`rules/mind-control.mjs`) - the creature
 * acts straight after the caster and repeats its Test at the end of each of its turns - with a Stunned
 * on the CASTER for as long as it holds.
 */
export function readPuppet(effect = "") {
  const t = plain(effect);
  return /\bOn a failure you control it on your turns for the duration, and your own body is Stunned for the duration\b/.test(t)
    ? { casterStunned: true, repeats: /\bThe target repeats the Test at the end of each of its turns, and the spell ends on a success\b/.test(t) } : null;
}

/** Puppet of Flesh's Target line: *One living Humanoid that is not a Boss, of a tier lower than yours*. */
export function readPuppetTarget(target = "") {
  return /^One living Humanoid that is not a Boss, of a tier lower than yours$/i.test(String(target ?? "").trim());
}

/**
 * **WHY PUPPET OF FLESH MAY NOT TAKE THIS CREATURE**: a lang key's tail, or null.
 * @param {{living?: boolean, humanoid?: boolean, boss?: boolean, tier?: number|null, casterTier?: number}} o
 */
export function puppetRefusal({ living = false, humanoid = false, boss = false, tier = null, casterTier = 1 } = {}) {
  if (!living) return "notLiving";
  if (!humanoid) return "notHumanoid";
  if (boss) return "boss";
  if (!(Number.isFinite(Number(tier)) && Number(tier) < Number(casterTier))) return "tier";
  return null;
}

/**
 * **FRENZY OF THE DEAD** (*Each target deals 2 additional Shadow damage with each hit for the duration.
 * Each target loses 1 Health at the start of each of its turns, bypassing armor and Ward*).
 * @returns {{extra: number, type: string, loses: number}|null}
 */
export function readFrenzy(effect = "") {
  const t = plain(effect);
  const m = /\bEach target deals (\d+) additional ([A-Z][a-z]+) damage with each hit for the duration\b/.exec(t);
  if (!m) return null;
  const lose = /\bEach target loses (\d+) Health at the start of each of its turns, bypassing armor and Ward\b/.exec(t);
  return { extra: Number(m[1]), type: m[2].toLowerCase(), loses: lose ? Number(lose[1]) : 0 };
}

/** The flag Frenzy of the Dead's effect rides, read at every hit and every turn start. */
export const FRENZY_FLAG = "necroFrenzy";

/**
 * **WHAT A STANDING FRENZY ADDS TO A HIT, AS ITS OWN TYPE** - melee or ranged (*with each hit*), one
 * amount a type, summed over the active effects carrying `FRENZY_FLAG`.
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {Array<{type: string, amount: number}>}
 */
export function frenzyExtras(effects = []) {
  const by = new Map();
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    const raw = e?.flags?.["azeroth-rpg"]?.[FRENZY_FLAG] ?? null;
    const amount = whole(raw?.extra);
    const type = typeof raw?.type === "string" && raw.type ? raw.type : null;
    if (!amount || !type) continue;
    by.set(type, (by.get(type) ?? 0) + amount);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, amount]) => ({ type, amount }));
}

/** The Health a standing Frenzy takes at the turn's start: the most any one effect names. */
export function frenzyLoss(effects = []) {
  let n = 0;
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    n = Math.max(n, whole(e?.flags?.["azeroth-rpg"]?.[FRENZY_FLAG]?.loses));
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  The curses the Necromancer shares with the Warlock                 */
/* ------------------------------------------------------------------ */

/**
 * **CURSE OF WEAKNESS AND CURSE OF TONGUES** (07 §14: *A creature that fails a Spirit Resilience Test
 * against your Spell DC deals 2 less damage for the duration, and 1 less again for each point of
 * Spellpower: Shadow you carry*; *... pays 2 more Mana for every spell it casts for the duration, and 2
 * more again for each point of Spellpower: Shadow you carry*): the rider and its rate a point.
 * @returns {{kind: "weakness"|"tongues", base: number, per: number}|null}
 */
export function readCurse(effect = "") {
  const t = plain(effect);
  let m = /\bdeals (\d+) less damage for the duration, and (\d+) less again for each point of Spellpower: Shadow you carry\b/.exec(t);
  if (m) return { kind: "weakness", base: Number(m[1]), per: Number(m[2]) };
  m = /\bpays (\d+) more Mana for every spell it casts for the duration, and (\d+) more again for each point of Spellpower: Shadow you carry\b/.exec(t);
  if (m) return { kind: "tongues", base: Number(m[1]), per: Number(m[2]) };
  return null;
}

/** The flag a curse's rider rides on the creature that failed. */
export const CURSE_FLAG = "necroCurse";

/** A curse's number at the caster's Shadow Spellpower. */
export function curseAmount(read, shadowPower = 0) {
  if (!read) return 0;
  return whole(read.base) + whole(read.per) * whole(shadowPower);
}

/** What a creature's standing curses of one kind add up to (the highest, not the sum: 07 says *does not stack* nowhere, so two casters' curses are two effects and the larger stands - MY READING). */
export function curseOn(effects = [], kind = "weakness") {
  let n = 0;
  for (const e of effects ?? []) {
    if (e?.active === false || e?.disabled === true) continue;
    const raw = e?.flags?.["azeroth-rpg"]?.[CURSE_FLAG] ?? null;
    if (raw?.kind === kind) n = Math.max(n, whole(raw.amount));
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Drain Life: at the caster's turn start                             */
/* ------------------------------------------------------------------ */

/**
 * **DRAIN LIFE** (07 §17: *When you cast this spell and at the start of each of your turns, the target
 * takes 2 Shadow damage and you regain that much Health*; Siphon Life, its 3): the drain at the CASTER's
 * turn start while the Sustain is held. The cast's own hit is the spell's Damage field, landed by the
 * card for every caster (the lead, on the 4c review's Q1: *"1 - on cast"*; D-1100). 07 §9's Sustain
 * sentence pays its upkeep. The wording before D-1100 (*At the start of each of your turns the target
 * takes ...*) is read the same, so a world whose spell items predate the reprint still drains.
 * `cast` is true where the sentence opens *When you cast this spell*: the cast's own hit also gives
 * the caster what it took (the spell card's `healsDealt`, the one damage door's drain), and false on
 * the older wording, which gave the Health back only at the turn start.
 * @returns {{rating: number, school: string, heals: boolean, cast: boolean}|null}
 */
export function readCasterTurnDrain(effect = "") {
  const m = /\b(When you cast this spell and at|At) the start of each of your turns,? the target takes (\d+) ([A-Z][a-z]+) damage and you regain that much Health\b/.exec(plain(effect));
  return m ? { rating: Number(m[2]), school: m[3].toLowerCase(), heals: true, cast: m[1] !== "At" } : null;
}

/* ------------------------------------------------------------------ */
/*  The dead's marks                                                   */
/* ------------------------------------------------------------------ */

/** The flag a creature's soul mark rides (Soul Cage's `caged`, Sever the Soul's `severed`). */
export const SOUL_MARK_FLAG = "soulMark";
/** The flag Soul Cage's cage rides on the living creature until the end of the caster's next turn. */
export const SOUL_CAGE_FLAG = "soulCage";
/** The flag Sever the Soul's card names the creature it may sever in (the card's first row). */
export const SEVER_FLAG = "sever";

/** A soul mark, cleaned: `{state: "caged"|"severed", by}`; null for anything else. */
export function soulMarkOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const state = ["caged", "severed"].includes(raw.state) ? raw.state : null;
  if (!state) return null;
  return { state, by: typeof raw.by === "string" && raw.by ? raw.by : null };
}

/**
 * **WHY A SOUL MARK BARS THIS**: Sever the Soul's *nothing can raise or restore it* bars everybody;
 * Soul Cage's *no one but you can raise, question or restore it* bars everybody but its caster. A lang
 * key's tail (`caged`, `severed`), or null.
 *
 * @param {unknown} raw  the mark
 * @param {{by?: string|null, act?: "raise"|"question"|"restore"}} o  who asks, and what
 */
export function soulMarkRefusal(raw, { by = null, act = "raise" } = {}) {
  const mark = soulMarkOf(raw);
  if (!mark) return null;
  if (mark.state === "severed") return act === "question" ? null : "severed";
  return mark.by && mark.by === by ? null : "caged";
}

/** Whether a soul cage still holds at the world's time and in a fight (its span is the effect's own). */
export function cageHolds(raw) {
  return Boolean(raw && typeof raw === "object" && typeof raw.by === "string" && raw.by);
}

/* ------------------------------------------------------------------ */
/*  The rows                                                           */
/* ------------------------------------------------------------------ */

/**
 * **THE CREATURES IN A RING**: every row within the feet of the centre, never a down or a hidden one,
 * `who` an enemy or a living creature, the centre's own row left out; sorted by distance, name, id.
 *
 * @param {Array<{id: string, name: string, feet: number|null, enemy?: boolean, living?: boolean, down?: boolean, hidden?: boolean}>} rows
 * @param {{feet: number, who?: "enemy"|"living"|"creature", except?: string|null}} o
 * @returns {string[]}
 */
export function ringRows(rows = [], { feet = 0, who = "creature", except = null } = {}) {
  return (rows ?? [])
    .filter(r => r && r.id !== except && r.down !== true && r.hidden !== true
      && typeof r.feet === "number" && Number.isFinite(r.feet) && r.feet <= feet + 1e-6
      && (who === "enemy" ? r.enemy === true : who === "living" ? r.living === true : true))
    .sort((a, b) => a.feet - b.feet || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)))
    .map(r => r.id);
}

/**
 * **WHO A ROW OF GRAVE TIDE OR NECROTIC NOVA IS**: an enemy takes the damage, an undead ally the heal,
 * and a living ally nothing. `relation` is the caster's reading of the creature (`relationTo`).
 * @returns {"damage"|"heal"|"none"}
 */
export function insteadRow({ relation = "neutral", undead = false } = {}) {
  if (relation === "enemy") return "damage";
  if (relation === "ally" && undead) return "heal";
  return "none";
}

/** Death's Tidings: *You learn whether the creature is alive, dead or undead* - the answer's key. */
export function tidingsOf({ undead = false, dead = false } = {}) {
  if (undead) return "undead";
  return dead ? "dead" : "alive";
}

/** Bone Courier's *a spoken message of up to 25 words*: the words, cut to the count. */
export function courierWords(text = "", max = 25) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  return { words: words.slice(0, max).join(" "), cut: words.length > max, count: Math.min(words.length, max) };
}

/** Bone Courier's count off its words. */
export function readCourier(effect = "") {
  const m = /\bcarries a spoken message of up to (\d+) words to a creature you name within (\d+) miles?\b/.exec(plain(effect));
  return m ? { words: Number(m[1]), miles: Number(m[2]) } : null;
}

/** Grave Sense's *every corpse and grave within 60 feet of you*. */
export function readGraveSense(effect = "") {
  const m = /\byou sense the direction and distance of every corpse and grave within (\d+) feet of you\b/.exec(plain(effect));
  return m ? { feet: Number(m[1]), age: /\bhow long each has lain there\b/.test(plain(effect)) } : null;
}

/** Corpse Candle's *The corpse sheds dim light out to a 20 ft radius*. */
export function readCorpseCandle(effect = "") {
  const m = /\bThe corpse sheds dim light out to an? (\d+) ft radius for the duration\b/.exec(plain(effect));
  return m ? { dim: Number(m[1]), only: /\bOnly you and your raised dead can see this light\b/.test(plain(effect)) } : null;
}

/** Deathmask's *your face looks like the dead creature's face ... The spell ends if you take damage*. */
export function readDeathmask(effect = "") {
  const t = plain(effect);
  return /\byour face looks like the dead creature's face\b/.test(t) ? { endsOnDamage: /\bThe spell ends if you take damage\b/.test(t), boon: /\bBoon on Tests to pass as that creature\b/.test(t) } : null;
}

/** Death Trance's *A Medicine Test to tell that you are alive takes a Bane*. */
export function readDeathTrance(effect = "") {
  return /\byou have no breath and no heartbeat\b/.test(plain(effect));
}

/** Borrowed Senses' *you see and hear through the target at any distance. Your own body is Blinded and Deafened while you do*. */
export function readBorrowedSenses(effect = "") {
  return /\byou see and hear through the target at any distance\. Your own body is Blinded and Deafened while you do\b/.test(plain(effect))
    ? { statuses: ["blinded", "deafened"] } : null;
}

/** Mark of the Grave's *you know the direction to the target while it is within 1 mile of you. You know at once if it dies*. */
export function readMarkOfGrave(effect = "") {
  const m = /\byou know the direction to the target while it is within (\d+) miles? of you\. You know at once if it dies\b/.exec(plain(effect));
  return m ? { miles: Number(m[1]) } : null;
}

/** Grave Ward's opener Test: *A creature that opens it makes a Spirit Resilience Test against your Spell DC. On a failure it is **Frightened** of the target for 1 minute*. */
export function readGraveWard(effect = "") {
  const t = plain(effect);
  const m = /\bwhile you are within (\d+) miles of it\. A creature that opens it makes a (Body|Reflex|Spirit) Resilience Test against your Spell DC\. On a failure it is Frightened of the target for (\d+) minutes?\b/.exec(t);
  return m ? { miles: Number(m[1]), resilience: m[2].toLowerCase(), minutes: Number(m[3]) } : null;
}

/** Ghostly Servant's *It can carry up to 10 pounds ... It cannot attack. The spell ends if the servant takes damage*. */
export function readGhostlyServant(effect = "") {
  const m = /\bAn invisible servant appears in the space and follows your spoken commands for the duration\. It can carry up to (\d+) pounds\b/.exec(plain(effect));
  return m ? { pounds: Number(m[1]) } : null;
}

/** Spirit Anchor's *you may spend a Half-Action to see and hear as if you stood at the target*. */
export function readSpiritAnchor(effect = "") {
  return /\byou may spend a Half-Action to see and hear as if you stood at the target, at any distance\b/.test(plain(effect));
}

/** Bone Bridge's *A bridge 5 feet wide forms across the span for the duration. It holds up to 1,000 pounds* off a *span up to 30 ft long*. */
export function readBoneBridge(effect = "", target = "") {
  const t = plain(effect);
  const w = /\bA bridge (\d+) feet wide forms across the span for the duration\b/.exec(t);
  const l = /\bA span up to (\d+) ft long\b/i.exec(String(target ?? ""));
  return w && l ? { widthFt: Number(w[1]), lengthFt: Number(l[1]), pounds: Number((/\bholds up to ([\d,]+) pounds\b/.exec(t)?.[1] ?? "0").replace(/,/g, "")) } : null;
}

/** The area Bone Bridge's card places: a line the span's length and the bridge's width. */
export function bridgeArea(read) {
  return read ? { shape: "line", distanceFt: read.lengthFt, widthFt: read.widthFt } : null;
}

/** Call the Departed's *You may cast this spell on each creature once*. */
export function readOncePerCreature(effect = "") {
  return /\bYou may cast this spell on each creature once\b/.test(plain(effect));
}

/** Speak with the Dead's *A corpse may be questioned this way once, ever*. */
export function readOncePerCorpse(effect = "") {
  return /\bA corpse may be questioned this way once, ever\b/.test(plain(effect));
}

/** The corpse mark Speak with the Dead lays: the body has been questioned. */
export const QUESTIONED_FLAG = "questioned";

/**
 * **WHY A CORPSE MAY NOT BE QUESTIONED**: asked before (Speak with the Dead's *once, ever*), or caged
 * by another Necromancer (Soul Cage's *no one but you can ... question*). A lang key's tail, or null.
 */
export function questionRefusal({ questioned = false, soulMark = null, by = null } = {}) {
  if (questioned) return "questioned";
  return soulMarkRefusal(soulMark, { by, act: "question" });
}

/** Contagion's gate: *The area must be under your Graveblight, or the spell does nothing and the Mana is spent*. */
export function readUnderOwn(effect = "") {
  const m = /\bThe area must be under your \*?\*?([A-Z][A-Za-z' ]+?)\*?\*?, or the spell does nothing and the Mana is spent\b/.exec(flat(effect));
  return m ? { spell: m[1].replace(/\*/g, "").trim() } : null;
}

/** Contagion's spread and its Test: *spreads 20 feet in every direction each day*; *A creature that ends its turn in it makes a Body Resilience Test against your Spell DC or is **Fatigued***. */
export function readContagion(effect = "") {
  const t = plain(effect);
  const spread = /\bspreads (\d+) feet in every direction each day until you dismiss it\b/.exec(t);
  const test = /\bA creature that ends its turn in it makes a (Body|Reflex|Spirit) Resilience Test against your Spell DC or is Fatigued\b/.exec(t);
  return spread && test ? { perDay: Number(spread[1]), resilience: test[1].toLowerCase(), condition: "fatigued" } : null;
}

/** Contagion's radius after so many whole days: the cast's own and the spread on top. */
export function contagionRadius({ base = 20, perDay = 20, days = 0 } = {}) {
  return whole(base) + whole(perDay) * whole(days);
}

/** The Region flag Contagion's area rides. */
export const CONTAGION_FLAG = "contagion";

/**
 * **WHETHER A TURN'S END CAN MEET THE BLIGHT** (`AzerothCombat#_onEndTurn`, fix run MC-R): a token on a
 * scene that holds a Contagion area. Asked BEFORE the end-turn door's module is imported, because the
 * `import()` alone took 1.2 s on the test machine at every end of every turn, for creatures with no token
 * and scenes with no blight, and it ran ahead of Mind Control's repeat Test.
 *
 * @param {{parent?: {regions?: Iterable<object>}}|null} token  the combatant's token document
 * @returns {boolean}
 */
export function blightCanReach(token) {
  const regions = token?.parent?.regions;
  if (!regions) return false;
  for (const region of regions) if (region?.flags?.["azeroth-rpg"]?.[CONTAGION_FLAG]) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Bone Shield and Barbed Bone                                        */
/* ------------------------------------------------------------------ */

/** Bone Shield's *When an attack hits you, you take 6 less damage from that attack*. */
export function readBoneShield(effect = "") {
  const m = /\bWhen an attack hits you, you take (\d+) less damage from that attack\b/.exec(plain(effect));
  return m ? { less: Number(m[1]) } : null;
}

/**
 * **BARBED BONE** (04's Bone: *When your Bone Shield reduces an attack's damage, the attacker takes
 * Shadow damage equal to twice your rank, and 1 further Shadow damage for each point of Spellpower:
 * Shadow you carry*; the lead: *"scale with shadow spellpower"*).
 */
export const BARBED_BONE = Object.freeze({ identifier: "barbed-bone", name: "Barbed Bone", type: "shadow", perRank: 2, perPower: 1 });

/** Barbed Bone's Rating at a rank and a Shadow Spellpower. */
export function barbedBoneRating(rank = 0, shadowPower = 0) {
  const r = whole(rank);
  return r > 0 ? BARBED_BONE.perRank * r + BARBED_BONE.perPower * whole(shadowPower) : 0;
}

/**
 * **WHETHER BONE SHIELD IS ASKED AT ALL**: an attack, the spell known, its Mana held and a Reaction
 * left, and a blow with something in it to take off. A lang key's tail, or null.
 */
export function boneShieldRefusal({ attack = false, amount = 0, known = false, mana = 0, cost = 10, reaction = true } = {}) {
  if (!attack) return "notAttack";
  if (!(whole(amount) > 0)) return "nothing";
  if (!known) return "notKnown";
  if (whole(mana) < whole(cost)) return "mana";
  if (!reaction) return "reaction";
  return null;
}

/** What reaches the Necromancer after the shield: the blow less the shield, never below 0. */
export function shieldedAmount(amount = 0, less = 6) {
  return Math.max(0, whole(amount) - whole(less));
}

/** The spans 07's Target lines name a corpse's age in, in seconds of the world's clock (a month is 30 days). */
export const CORPSE_AGE_SECONDS = Object.freeze({ hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 });

/**
 * **A CORPSE'S AGE GATE** (07 §17's Deathmask, *One corpse of a Humanoid dead less than a day*; Speak with
 * the Dead, *One corpse dead less than a month*): the seconds the Target line allows, or null.
 * @returns {{seconds: number, unit: string}|null}
 */
export function readCorpseAge(target = "") {
  const m = /\bdead less than an? (hour|day|week|month|year)\b/i.exec(plain(target));
  if (!m) return null;
  const unit = m[1].toLowerCase();
  return { seconds: CORPSE_AGE_SECONDS[unit], unit };
}

/**
 * **WHETHER A CORPSE IS TOO OLD** off the death watch's record (`diedAt`, the world time it died): `old`
 * where it has lain the span or longer, `unknown` where nothing recorded its death (a body placed
 * already dead - the GM's to judge), else null.
 *
 * @param {{diedAt?: number|null, now?: number, seconds?: number|null}} o
 */
export function corpseAgeRefusal({ diedAt = null, now = 0, seconds = null } = {}) {
  if (!(Number(seconds) > 0)) return null;
  if (diedAt === null || diedAt === undefined || !Number.isFinite(Number(diedAt))) return "unknown";
  return Number(now) - Number(diedAt) >= Number(seconds) ? "old" : null;
}

/**
 * The spells restricted to the Necromancer ALONE whose doors read a corpse's age off the death watch's
 * record: Deathmask's *dead less than a day* (`judgeNecroSpell`) and Grave Sense's *how long each has
 * lain there* (`graveSenseLands`). Any caster carries them (D-1099), a creature's Spells line included.
 * Speak with the Dead reads it too, but only on a Necromancer's cast (the Priest's is the HEAD path),
 * so the Necromancer class covers it. `necromancer-final-review.test.mjs` reads the list off the pack.
 */
export const CORPSE_AGE_SPELLS = Object.freeze(["Deathmask", "Grave Sense"]);

/**
 * **WHETHER A DEATH IS WORTH RECORDING** (the final review's S5): the death watch writes a creature's
 * death time only where some creature in the world could read it - one holding the Necromancer class
 * (who may learn Speak with the Dead, Deathmask or Grave Sense later), or one holding a spell of
 * `CORPSE_AGE_SPELLS` as an item or on its Spells line. Every other world pays no write for a kill. A
 * corpse nothing recorded is the GM's to judge, as before.
 *
 * @param {Array<{classes?: string[], spells?: string[]}>} actors  plain snapshots of the world's actors
 */
export function agesCorpses(actors = []) {
  for (const a of actors ?? []) {
    if ((a?.classes ?? []).includes("Necromancer")) return true;
    if ((a?.spells ?? []).some(n => CORPSE_AGE_SPELLS.includes(n))) return true;
  }
  return false;
}

/**
 * **CORPSE CANDLE'S LIGHT, WHO SEES IT** (07 §17: *Only you and your raised dead can see this light*):
 * a client draws it where its user owns the caster (the caster's players; the GM owns every actor),
 * and only while the caster's candle effect stands (`lit`; the fix run 4 review: the light must never
 * outlive its hour where no GM is online to clear the token's record). Both default closed.
 */
export function candleSeen({ ownsCaster = false, lit = false } = {}) {
  return ownsCaster === true && lit === true;
}

/**
 * **MARK OF THE GRAVE'S DIRECTION** (*you know the direction to the target while it is within 1 mile of
 * you*): on one scene, the compass point and the feet where within the miles; `far` beyond them;
 * `elsewhere` on another scene (the GM's to tell).
 *
 * @param {{sameScene?: boolean, feet?: number|null, miles?: number}} o
 * @returns {"near"|"far"|"elsewhere"}
 */
export function markDirection({ sameScene = false, feet = null, miles = 1 } = {}) {
  if (!sameScene || feet === null || feet === undefined || !Number.isFinite(Number(feet))) return "elsewhere";
  return Number(feet) <= Math.max(0, Number(miles) || 0) * 5280 + 1e-6 ? "near" : "far";
}

/**
 * **CONTAGION CLEARED** (*Restoration and Cure Blight each clear it out to 100 feet and no further*): a
 * blight whose whole circle lies within the feet of the point is gone; one that reaches further keeps
 * what lies beyond, the cleared circle a hole in it.
 *
 * @param {{apart: number, radius: number, feet?: number}} o  feet between the point and the blight's
 *   centre, the blight's radius in feet, the clearing's reach
 * @returns {"gone"|"hole"|"none"}
 */
export function contagionCleared({ apart = 0, radius = 0, feet = 100 } = {}) {
  const d = Math.max(0, Number(apart) || 0);
  const r = Math.max(0, Number(radius) || 0);
  const f = Math.max(0, Number(feet) || 0);
  if (d - r >= f) return "none";
  if (d + r <= f + 1e-6) return "gone";
  return "hole";
}

/** 07's words for Contagion's clearing: the reach (*clear it out to 100 feet*). */
export function readContagionClearing(effect = "") {
  const m = /\bclear it out to (\d+) feet\b/i.exec(plain(effect));
  return m ? { feet: Number(m[1]) } : null;
}

/** The spells that clear Contagion (*Restoration and Cure Blight each clear it*), as identifiers. */
export function contagionClearers(effect = "") {
  const m = /\*\*([^*]+)\*\* and \*\*([^*]+)\*\* each clear it\b/i.exec(flat(effect));
  return m ? [m[1], m[2]].map(n => n.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) : [];
}

/**
 * **PAST THE ASKER'S DEADLINE** (the 4c review's MUST-FIX 1; D-1094's shape): Bone Shield's cast is
 * refused before its Reaction and its Mana once the moment the blow's asker stops waiting has passed.
 * No deadline (a cast nobody is waiting on) is never past.
 *
 * @param {number|null} deadline  epoch milliseconds, or null
 * @param {number} now            epoch milliseconds
 */
export function pastDeadline(deadline = null, now = 0) {
  const at = Number(deadline);
  if (deadline === null || deadline === undefined || !Number.isFinite(at) || at <= 0) return false;
  return Number(now) > at;
}

/* ------------------------------------------------------------------ */
/*  The census                                                         */
/* ------------------------------------------------------------------ */

/**
 * **EVERY SPELL THE NECROMANCER MAY HOLD, THE DOORS THAT CARRY IT AND WHAT STAYS THE TABLE'S** (run
 * 4c-S). `doors` names the machinery (a descriptor the pack carries, or a door by name); `table` is a
 * clause the lead left to the GM. No row carries a `reason`: the completeness bar (the lead,
 * 2026-11-18: *"I need to make sure that all automations and animation/sounds are built and
 * functional"*) leaves none.
 */
export const NECRO_SPELL_AUTOMATION = Object.freeze({
  /* ---- 07 §17, tier 1 ---- */
  "bone-shards": { doors: ["card:damage"] },
  "grave-rot": { doors: ["card:damage", "necro:corpseRing"] },
  "grave-touch": { doors: ["card:damage", "necro:selfHeal"] },
  "dread-whisper": { doors: ["card:resist", "onFail:frightened"] },
  "bone-ward": { doors: ["applies:armorPoints"] },
  "mend-the-dead": { doors: ["card:heal", "necro:undeadTarget"] },
  "raise-dead": { doors: ["raise", "horde"] },
  "animate-corpse": { doors: ["raise", "horde"] },
  "grave-sense": { doors: ["necro:graveSense"] },
  "corpse-candle": { doors: ["necro:corpseCandle"] },
  "deathmask": { doors: ["necro:deathmask"] },
  "bone-courier": { doors: ["necro:boneCourier"] },
  /* ---- 07 §17, tier 2 ---- */
  "soul-lash": { doors: ["card:damage", "card:resist", "necro:nextAttackBane"] },
  "cripple": { doors: ["card:resist", "onFail:slowed", "escape:turnEnd", "necro:failDrops"] },
  "plague-cloud": { doors: ["areaTick", "upkeep:mana"] },
  "field-of-bones": { doors: ["card:damage", "areaGround:difficult"] },
  "frenzy-of-the-dead": { doors: ["necro:raisedTargets", "necro:frenzyHit", "necro:frenzyLoss"] },
  "grave-step": { doors: ["step:corpse"] },
  "ghoul-rising": { doors: ["raise", "horde"] },
  "ghostly-servant": { doors: ["necro:ghostlyServant"] },
  "grave-ward": { doors: ["necro:graveWard"] },
  "borrowed-senses": { doors: ["necro:borrowedSenses"] },
  "deaths-tidings": { doors: ["necro:deathsTidings"] },
  /* ---- 07 §17, tier 3 ---- */
  "wraith-bolt": { doors: ["card:damage"] },
  "plague-wind": { doors: ["card:damage", "card:resist", "onFail:poisoned", "necro:poisonedAtDC"] },
  "grave-tide": { doors: ["card:damage", "necro:undeadInstead"] },
  "terror-of-the-grave": { doors: ["card:resist", "onFail:frightened"] },
  "bone-shield": { doors: ["necro:boneShield", "talent:barbed-bone"] },
  "unholy-restoration": { doors: ["card:heal", "necro:undeadTarget", "necro:endsCondition"] },
  "stitch-abomination": { doors: ["raise", "horde", "graft"], table: "the corpses or other dead flesh enough to build a Large creature are the GM's to judge (the lead: \"enforced by the GM not automation/code\")" },
  "bind-banshee": { doors: ["raise", "horde"], table: "that the corpse is a female Humanoid's is the GM's to judge: no 14 block and no corpse records a sex (the lead: \"note it must be a female\")" },
  "spirit-anchor": { doors: ["necro:spiritAnchor"] },
  "death-trance": { doors: ["necro:deathTrance"] },
  "bone-bridge": { doors: ["necro:boneBridge"] },
  "mark-of-the-grave": { doors: ["necro:markOfGrave"] },
  "graveblight": { doors: ["areaTick", "areaTick:undeadInstead", "remains:healingHalved", "upkeep:mana"] },
  /* ---- 07 §17, tier 4 ---- */
  "raise-crypt-horror": { doors: ["raise", "horde"] },
  "enslave-the-dead": { doors: ["card:resist", "horde:enslave"] },
  "bone-prison": { doors: ["card:resist", "onFail:entangled", "escape:turnEnd", "necro:prisonHold"] },
  "necrotic-nova": { doors: ["card:damage", "necro:undeadInstead"] },
  "soul-cage": { doors: ["card:resist", "onFail:stunned", "dk:halfHealthGate", "necro:soulCage", "essence:soulCage", "soul-mark:caged"] },
  "soul-rip": { doors: ["card:damage", "card:resist", "essence:soulRip"] },
  "shroud-of-bone": { doors: ["applies:armorPoints", "necro:upTo"] },
  "unholy-renewal": { doors: ["card:heal", "necro:undeadTarget"] },
  "call-the-departed": { doors: ["necro:callDeparted"] },
  "speak-with-the-dead": { doors: ["necro:speakDead"] },
  "contagion": { doors: ["necro:contagion"] },
  /* ---- 07 §17, tier 5 ---- */
  "puppet-of-flesh": { doors: ["card:resist", "necro:puppetTarget", "mind-control:puppet"] },
  "plague-of-undeath": { doors: ["card:resist", "horde:plague"] },
  "reaping": { doors: ["card:damage", "card:resist", "necro:selfRing", "necro:reapingHeal"] },
  "sever-the-soul": { doors: ["card:damage", "card:resist", "onFail:frightened", "necro:severRing", "soul-mark:severed"] },
  "the-dead-rise": { doors: ["raise"] },
  "shroud-of-the-grave": { doors: ["necro:temporaryHealth", "necro:upTo", "applies:immune"] },
  /* ---- the spells the Necromancer shares ---- */
  "drain-life": { doors: ["card:damage", "necro:casterDrain", "upkeep:mana"] },
  "curse-of-agony": { doors: ["tick"] },
  "curse-of-weakness": { doors: ["card:resist", "necro:curseWeakness"] },
  "curse-of-tongues": { doors: ["card:resist", "necro:curseTongues"] }
});

/** How many spells leave a clause to the table: the lead's two GM calls, a ceiling that may only fall. */
export const NECRO_SPELL_TABLE_CEILING = 2;

/**
 * **A DESCRIPTOR DOOR**: a label the pack's own descriptor proves (`necromancer-spells.test.mjs` reads
 * the spell's YAML for it), and the generic card or area door every spell rides.
 */
export const NECRO_DESCRIPTOR_PREFIXES = Object.freeze(["card:damage", "card:resist", "card:heal", "onFail:", "areaTick", "areaGround:", "applies:", "remains:", "tick"]);

/**
 * **WHERE EVERY OTHER DOOR IS CALLED**: a label a row names that no descriptor proves, with the call
 * sites that carry it - each `{file, fn, contains}` a fragment the census finds INSIDE the named
 * function of that file, comments blanked (`tools/strip-comments.mjs`), so a label is a caller.
 */
export const NECRO_SPELL_DOORS = Object.freeze({
  "necro:corpseRing": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const ring = readCorpseRing(sys.target, sys.effect);" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const judgedNecro = await judgeNecroSpell({ actor, spell, list, source, answers, farReaching: farReachingAsked });" }
  ],
  "necro:selfHeal": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardRows", contains: "const self = readSelfHeal(sys.effect);" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "heal = await necroCardRows({" }
  ],
  "necro:undeadTarget": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const undead = readUndeadTargets(sys.target);" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const judgedNecro = await judgeNecroSpell({ actor, spell, list, source, answers, farReaching: farReachingAsked });" }
  ],
  "raise": [
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raisePlan = await judgeRaise(actor, spell, { key: sys.identifier, source" }
  ],
  "horde": [
    { file: "module/effects/death-knight-necromancy.mjs", fn: "judgeRaise", contains: "return judgeHordeRaise(actor, item, { key, source, empower });" }
  ],
  "graft": [
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const essenceCast = essenceDue({" }
  ],
  "horde:enslave": [
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "enslavePlan = await judgeEnslave(actor, spell, list);" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await requestEnslave(actor, message);" }
  ],
  "horde:plague": [
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "for (const line of await plagueFailed(actor, message)) ui.notifications?.info(line);" }
  ],
  "necro:graveSense": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readGraveSense(sys.effect)) lines.push(...await graveSenseLands(" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raiseLines.push(...await necroSpellAfterCast({" }
  ],
  "necro:corpseCandle": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.candle) lines.push(...await candleLands(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "candleLands", contains: "await askGM({ act: \"candle\", casterUuid: actor.uuid," },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellQueryHandler", contains: "if (payload.on) await tk.update({ [`flags.${SCOPE}.${CANDLE_FLAG}`]: { by: caster.uuid, dim } });" },
    { file: "module/canvas/corpse-candle.mjs", fn: "registerCorpseCandle", contains: "const Wrapped = corpseCandleTokenClass(CONFIG.Token.objectClass);" },
    { file: "module/canvas/corpse-candle.mjs", fn: "seesCandle", contains: "return candleSeen({ ownsCaster:" },
    { file: "module/canvas/corpse-candle.mjs", fn: "seesCandle", contains: "lit: candleLit(caster, token)" },
    { file: "module/canvas/corpse-candle.mjs", fn: "corpseCandleTokenClass", contains: "this.corpseCandleSource.add();" }
  ],
  "necro:deathmask": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const aged = corpseAgeRefusal({ diedAt:" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.deathmask) lines.push(...await deathmaskLands(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "deathmaskLands", contains: "await own.update({ \"texture.src\": mask.img });" }
  ],
  "necro:boneCourier": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const courier = readCourier(sys.effect);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.courier) lines.push(...await courierLands(" }
  ],
  "necro:nextAttackBane": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const bane = readNextAttackBane(effect);" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await necroSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" }
  ],
  "escape:turnEnd": [
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "if (effect && escape?.condition === id) await effect.setFlag(\"azeroth-rpg\", ESCAPE_FLAG, escape);" },
    { file: "module/documents/combat.mjs", fn: "_onEndTurn", contains: "await this._escapePrompts(combatant, \"turnEnd\")" }
  ],
  "necro:failDrops": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const drops = readFailDrops(effect);" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await necroSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" }
  ],
  "upkeep:mana": [
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "upkeep: readUpkeep(sys.effect)" },
    { file: "module/documents/combat.mjs", fn: "_turnTicks", contains: "upkeepOf(entry, actor.items?.get?.(entry?.spellId)?.system ?? null)," }
  ],
  "necro:raisedTargets": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "if (readRaisedTargets(sys.target)) {" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const judgedNecro = await judgeNecroSpell({ actor, spell, list, source, answers, farReaching: farReachingAsked });" }
  ],
  "necro:frenzyHit": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.frenzy) lines.push(...await frenzyLands(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "frenzyLands", contains: "await castSpan(who, plan.duration, actor)" },
    { file: "module/dice/workflows.mjs", fn: "rollTest", contains: "frenzyExtras([...(actor?.effects ?? [])])" }
  ],
  "necro:frenzyLoss": [
    { file: "module/effects/necromancer-spells.mjs", fn: "advanceNecroSpells", contains: "const lose = frenzyLoss(actor.effects ?? []);" },
    { file: "module/documents/combat.mjs", fn: "_effectTicks", contains: "m.advanceNecroSpells(actor, this)" }
  ],
  "step:corpse": [
    { file: "module/rules/steps.mjs", fn: "readSpellStep", contains: "if (m) return { who: \"self\", feet: null, sight: \"corpse\", near: Number(m[1]), corpse: true, shadow };" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const planned = await corpseStepPlan(actor, spell, spellStep, { farReaching: farReachingAsked });" },
    { file: "module/effects/steps.mjs", fn: "judgeStep", contains: "const nearCorpse = sight === \"corpse\" && askSight" }
  ],
  "necro:ghostlyServant": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readGhostlyServant(sys.effect) && plan?.point) lines.push(...await layOwn(" }
  ],
  "necro:graveWard": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readGraveWard(sys.effect) && plan?.point) lines.push(...await graveWardLands(" },
    { file: "module/dice/chat.mjs", fn: "CARD_ACTIONS", contains: "necroGraveWard: async (button, message) => (await import(\"../effects/necromancer-spells.mjs\")).graveWardFromCard(button, message)," }
  ],
  "necro:borrowedSenses": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.borrowed) lines.push(...await borrowedLands(" }
  ],
  "necro:deathsTidings": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.tidings) lines.push(...await tidingsLands(" }
  ],
  "necro:poisonedAtDC": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const poison = readPoisonedAtDC(effect);" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await necroSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" }
  ],
  "necro:undeadInstead": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardRows", contains: "const instead = readUndeadInstead(sys.effect);" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "heal = await necroCardRows({" }
  ],
  "necro:boneShield": [
    { file: "module/documents/actor.mjs", fn: "applyDamage", contains: "const shield = await boneShieldInBlow(this, { amount, attack, by });" },
    { file: "module/effects/blow-doors.mjs", fn: "blowAskHandler", contains: "return boneShieldHere({ holder, amount: whole(payload.amount) });" },
    { file: "module/effects/necromancer-spells.mjs", fn: "boneShieldHere", contains: "{ ...options, answers: { boneShield: true, deadline } }" },
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "pastDeadline(answers?.deadline ?? null, Date.now())" }
  ],
  "talent:barbed-bone": [
    { file: "module/effects/necromancer-spells.mjs", fn: "boneShieldInBlow", contains: "if (taken > 0 && blow.by) await barbedBoneStrikes(holder, blow.by);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "barbedBoneStrikes", contains: "const rating = barbedBoneRating(rank, holder.system?.spellpower?.shadow ?? 0);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "barbedBoneStrikes", contains: "if (damage > 0 && noGM([attacker.isOwner === true])) {" }
  ],
  "necro:endsCondition": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readEndsCondition(sys.effect) && list[0]) lines.push(...await conditionEnds(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "if (noGM(owned)) return refuse(\"noGM\", { spell: name });" }
  ],
  "necro:spiritAnchor": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "lines.push(...await anchorLands(actor, spell, sys, plan));" },
    { file: "module/effects/necromancer-spells.mjs", fn: "anchorLands", contains: "await postNecroCard(actor, {" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardPress", contains: "const unseen = lookRefusal(look);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardPress", contains: "const looked = await lookThrough(look);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardPress", contains: "if (!(await spendTurnBudget(caster, \"half\"))) return null;" },
    { file: "module/dice/chat.mjs", fn: "CARD_ACTIONS", contains: "necroCard: async (button, message) => (await import(\"../effects/necromancer-spells.mjs\")).necroCardPress(button, message)," }
  ],
  "necro:deathTrance": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readDeathTrance(sys.effect)) lines.push(...await layOwn(" }
  ],
  "necro:boneBridge": [
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const necroAreaRead = necroAreaOf(sys, actor);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroArea", contains: "const bridge = bridgeArea(readBoneBridge(sys.effect, sys.target));" }
  ],
  "necro:markOfGrave": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readMarkOfGrave(sys.effect) && list[0]) lines.push(...await markLands(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "onNecroDeath", contains: "if (caster) await whisperCard(caster, effect.name, [t(\"AZEROTH.NecroSpell.Mark.Died\"" },
    { file: "module/effects/necromancer-spells.mjs", fn: "markLands", contains: "if (done) await postNecroCard(actor, {" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardPress", contains: "const where = markDirection({ sameScene, feet," }
  ],
  "necro:prisonHold": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "await entangled.setFlag(SCOPE, PRISON_FLAG, {" },
    { file: "module/effects/forced-movement.mjs", fn: "beingMovedBy", contains: "e.flags?.[\"azeroth-rpg\"]?.bonePrison" }
  ],
  "dk:halfHealthGate": [
    { file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const no = halfHealthRefusal(victim?.system?.health ?? {});" }
  ],
  "necro:soulCage": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (cage && list[0]) lines.push(...await cageLands(" }
  ],
  "essence:soulCage": [
    { file: "module/effects/necromancer-spells.mjs", fn: "onNecroDeath", contains: "const gained = await essenceTo(caster, \"soulCage\", cage.essence, { from: dead, effectUuid: effect.uuid });" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellQueryHandler", contains: "await holder.writePoolsNow({ itemId: pool.itemId, kind: \"momentum\", value: next }, {}, { essenceGain: payload.source," }
  ],
  "soul-mark:caged": [
    { file: "module/effects/necromancer-spells.mjs", fn: "onNecroDeath", contains: "if (cage.caged) await writeSoulMark(dead, { state: \"caged\", by: cage.by });" },
    { file: "module/rules/raise.mjs", fn: "corpseRefusal", contains: "if (live && mark.state === \"caged\" && mark.by !== knightUuid) return \"caged\";" },
    { file: "module/documents/actor.mjs", fn: "applyHealing", contains: "soulMarkRefusal(this.getFlag?.(\"azeroth-rpg\", SOUL_MARK_FLAG)" }
  ],
  "essence:soulRip": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const gained = await essenceTo(caster, \"soulRip\", rip.essence, { from: actor, messageId: message?.id ?? null });" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await necroSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" }
  ],
  "necro:upTo": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const upTo = readUpTo(sys.target);" }
  ],
  "necro:callDeparted": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "if (readOncePerCreature(sys.effect)) {" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.departed) lines.push(...await departedLands(" }
  ],
  "necro:speakDead": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const no = questionRefusal({" },
    { file: "module/effects/necromancer-spells.mjs", fn: "speakLands", contains: "await askGM({ act: \"questioned\", casterUuid: actor.uuid," },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (plan?.speak) lines.push(...await speakLands(" }
  ],
  "necro:contagion": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterCast", contains: "if (readContagion(sys.effect)) lines.push(...await contagionLands(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const at = await pointNear(actor, source, reach," },
    { file: "module/effects/necromancer-spells.mjs", fn: "contagionLands", contains: "const base = at ? ownBlightAt(scene, actor," },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardPress", contains: "await askGM({ act: \"contagionDismiss\", casterUuid: caster.uuid," },
    { file: "module/effects/necromancer-spells.mjs", fn: "registerNecroSpellHooks", contains: "contagionClearedBy(message).catch(" },
    { file: "module/effects/necromancer-spells.mjs", fn: "contagionClearedBy", contains: "const done = contagionCleared({ apart," },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroTurnEnd", contains: "await postAreaTest({ actor, token, region, check:" },
    { file: "module/documents/combat.mjs", fn: "_onEndTurn", contains: "m.necroTurnEnd(combatant)" }
  ],
  "necro:puppetTarget": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "if (readPuppetTarget(sys.target)) {" }
  ],
  "mind-control:puppet": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const done = await askGM({ act: \"puppet\", casterUuid: caster.uuid," },
    { file: "module/effects/necromancer-spells.mjs", fn: "puppetHere", contains: "const record = mindControlRecord({" },
    { file: "module/documents/combat.mjs", fn: "_onEndTurn", contains: "const controls = await endMindControlTurn(this, combatant, context)" }
  ],
  "necro:selfRing": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const selfRing = readSelfRing(sys.target);" }
  ],
  "necro:reapingHeal": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "if (readReapingHeal(effect) && caster) {" },
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "await necroSpellAfterResist({ message, actor, maker: casterOf(message), laid: laidByFailure, result });" }
  ],
  "necro:severRing": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "const sever = readSeverRing(sys.target);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroCardRows", contains: "if (readSeverRing(sys.target)) {" }
  ],
  "soul-mark:severed": [
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterApply", contains: "await askGM({ act: \"soulMark\"," },
    { file: "module/dice/chat.mjs", fn: "applyDamageToTargets", contains: "await necroSpells.necroSpellAfterApply({ message, target: actor, amount: damageOutcome.amount });" },
    { file: "module/rules/raise.mjs", fn: "corpseRefusal", contains: "if (live && mark.state === \"severed\") return \"severed\";" }
  ],
  "necro:temporaryHealth": [
    { file: "module/dice/workflows.mjs", fn: "castTemporary", contains: "const necroTemp = necroTemporaryOf(spell, actor);" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroTemporary", contains: "if (!necroScope(sys, actor) ||" }
  ],
  "necro:casterDrain": [
    { file: "module/effects/necromancer-spells.mjs", fn: "drainLifeTurn", contains: "const drain = readCasterTurnDrain(spell?.system?.effect ?? \"\");" },
    { file: "module/effects/necromancer-spells.mjs", fn: "advanceNecroSpells", contains: "lines.push(...await drainLifeTurn(actor));" },
    { file: "module/documents/combat.mjs", fn: "_effectTicks", contains: "m.advanceNecroSpells(actor, this)" }
  ],
  "necro:curseWeakness": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "amount: curseAmount(curse, actor.system?.spellpower?.shadow ?? 0)" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const span = flags.duration ? await castSpan(actor, flags.duration, caster) : await minutes(actor, 1);" },
    { file: "module/documents/actor.mjs", fn: "applyDamage", contains: "const weaker = curseOn(by.effects ?? [], \"weakness\");" }
  ],
  "necro:curseTongues": [
    { file: "module/effects/necromancer-spells.mjs", fn: "judgeNecroSpell", contains: "amount: curseAmount(curse, actor.system?.spellpower?.shadow ?? 0)" },
    { file: "module/effects/necromancer-spells.mjs", fn: "necroSpellAfterResist", contains: "const span = flags.duration ? await castSpan(actor, flags.duration, caster) : await minutes(actor, 1);" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const tonguesMore = viaItem || free ? 0 : curseOn(actor.effects ?? [], \"tongues\");" }
  ]
});
