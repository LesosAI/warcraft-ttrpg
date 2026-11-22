/**
 * **THE DEATH KNIGHT'S SPELLS, AND WHAT EACH ONE DOES AT THE TABLE** (07 §11, §14 and §17; the
 * Death Knight plan's spell roster; run F4b). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Most of 07's Death and Death Knight spells are carried by the doors every spell already rides,
 * off the descriptors the parser stamps on the pack (`tools/parse-book/spells.mjs`): the card's
 * damage and its Resist (`damage`, `test`, `onFail`), the laid effect (`applies`), the area's tick
 * (`areaTick`, D-756), the ground (`areaGround`, D-757), the escape (D-778), a drain's heal, the
 * raise and the corpse marks (run F3). What no descriptor carries is read here, off 07's own
 * words, and written by `effects/death-knight-spells.mjs`:
 *
 * - **Pestilence** - *Every enemy within 15 feet of the target takes 5 Shadow damage. Every enemy
 *   damaged this way gains the target's disease, as if your **Plague** had laid it*: the card's
 *   rows are the ring (`pestilenceRing`), and the Apply lays each of the knight's diseases the
 *   carrier holds through the Plague's own door (`effects/death-knight.mjs#layPlagueOn`);
 * - **Death Pact** - *The target is destroyed. You regain Health equal to the Health it had, up to
 *   8* (`deathPactRefusal`, `deathPactHeal`);
 * - **Death's Embrace** - *One creature with half its Health or less* (`halfHealthRefusal`);
 * - **Horn of Winter** - a Boon laid on each ally within 30 feet, the knight included, spent by the
 *   next Attack or Resilience Test (`rules/banes.mjs`' laid Boon, kind `attackOrResilience`);
 * - **Frostwyrm Breath** - *Every creature in the cone is **Entangled**. It can end the Entangled
 *   with an action and a Reflex Resilience Test against your Spell DC* (the lead, D-962:
 *   *"Frost wyrm breath should always entangle"*): `readAlwaysCondition`;
 * - **Soul Rend** - *cannot regain Health until the end of its next turn* on a failure, through the
 *   no-healing mark (`effects/no-healing.mjs`, the creature's own turn);
 * - **Plaguesight** - the creatures within 60 feet that carry Undeath Corruption, their highest
 *   threshold, and the ground's Undeath taint grade (`plaguesightRows`, `undeathThreshold`).
 *
 * **`DK_SPELL_AUTOMATION` IS THE CENSUS** (`death-knight-spells.test.mjs`): every Death Knight
 * spell in the pack names the doors that carry it and, where 07's words leave something to the
 * table, says what in `table` (a clause) or `reason` (the whole spell). The reasons sit under a
 * ceiling that may only fall.
 */

import { gmAbsentFor } from "./gm-writes.mjs";

/** HTML to one flat line, bold kept as `**`. */
function flat(text) {
  return String(text ?? "").replace(/<\/?(?:strong|b)>/g, "**").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** A whole number at or above nothing. */
const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/* -------------------------------------------- */
/*  07's words, read                             */
/* -------------------------------------------- */

/**
 * **PESTILENCE** (07 §17): the ring around the carrier, its damage and the spread.
 * @returns {{feet: number, rating: number, school: string, spreads: boolean}|null}
 */
export function readPestilence(effect) {
  const t = flat(effect).replace(/\*\*/g, "");
  const m = /\bEvery enemy within (\d+) feet of the target takes (\d+) ([A-Z][a-z]+) damage\b/.exec(t);
  if (!m) return null;
  return { feet: Number(m[1]), rating: Number(m[2]), school: m[3].toLowerCase(),
    spreads: /\bEvery enemy damaged this way gains the target's disease, as if your Plague had laid it\b/.test(t) };
}

/** Pestilence's Target field: *One creature carrying your Frost Fever or Blood Plague*. */
export function readsCarrierTarget(target = "") {
  return /\bcarrying your Frost Fever or Blood Plague\b/.test(String(target ?? ""));
}

/** **DEATH PACT** (07 §17): *You regain Health equal to the Health it had, up to N*. */
export function readDeathPact(effect) {
  const m = /\bThe target is destroyed\. You regain Health equal to the Health it had, up to (\d+)\b/.exec(flat(effect).replace(/\*\*/g, ""));
  return m ? { cap: Number(m[1]) } : null;
}

/** Death Pact's Target field: *One undead creature you control*. */
export function readsControlledUndead(target = "") {
  return /\bundead creature you control\b/i.test(String(target ?? ""));
}

/** Death's Embrace's Target field: *One creature with half its Health or less*. */
export function readsHalfHealth(target = "") {
  return /\bwith half its Health or less\b/i.test(String(target ?? ""));
}

/**
 * **HORN OF WINTER** (07 §11): *Every ally within 30 feet of you, you included, gains a Boon on its
 * next Attack Test or Resilience Test before the end of its next turn.*
 * @returns {{feet: number, boons: number, kind: string, includesYou: boolean, span: string}|null}
 */
export function readHorn(effect) {
  const m = /\bEvery ally within (\d+) feet of you, (you included, )?gains a Boon on its next Attack Test or Resilience Test before the end of its next turn\b/.exec(flat(effect).replace(/\*\*/g, ""));
  return m ? { feet: Number(m[1]), boons: 1, kind: HORN_BOON_KIND, includesYou: Boolean(m[2]), span: "nextTurnEnd" } : null;
}

/** The laid Boon's kind Horn of Winter lays: spent by the first Attack or Resilience Test. */
export const HORN_BOON_KIND = "attackOrResilience";

/**
 * **A CONDITION EVERY CREATURE IN THE AREA TAKES, WHATEVER ITS TEST** (07 §11's Frostwyrm Breath;
 * the lead, D-962): *Every creature in the cone is **Entangled**. It can end the Entangled with an
 * action and a Reflex Resilience Test against your Spell DC.*
 * @returns {{condition: string, on: "action", resilience: string}|null}
 */
export function readAlwaysCondition(effect) {
  const m = /\bEvery creature in the (?:cone|area|line) is \*\*([A-Z][a-z]+)\*\*\. It can end the \1 with an action and a (Body|Reflex|Spirit) Resilience Test against your Spell DC\b/.exec(flat(effect));
  return m ? { condition: m[1].toLowerCase(), on: "action", resilience: m[2].toLowerCase() } : null;
}

/**
 * **NO HEALTH REGAINED ON A FAILURE** (07 §17's Soul Rend: *On a failure it takes 7 Shadow damage
 * and cannot regain Health until the end of its next turn*): the creature's OWN next turn.
 * @returns {{span: "victim"}|null}
 */
export function readNoHealingOnFail(effect) {
  return /\bOn a failure it takes \d+ [A-Z][a-z]+ damage and cannot regain Health until the end of its next turn\b/.test(flat(effect).replace(/\*\*/g, ""))
    ? { span: "victim" } : null;
}

/**
 * **PLAGUESIGHT** (07 §17; the lead: *"Rework to sense Undead corruption. Sensing undead directly is
 * a paladin theme"*): *You sense the direction to every creature within 60 feet that carries
 * **Undeath** Corruption ... the highest threshold each of them has crossed: none, 5, 10 or 15 ...
 * the Undeath taint grade of the ground you stand on.*
 * @returns {{feet: number, track: string, thresholds: number[], ground: boolean}|null}
 */
export function readPlaguesight(effect) {
  const t = flat(effect).replace(/\*\*/g, "");
  const m = /\bevery creature within (\d+) feet that carries (Undeath) Corruption\b/.exec(t);
  if (!m) return null;
  const th = /\bnone, (\d+), (\d+) or (\d+)\b/.exec(t);
  return { feet: Number(m[1]), track: m[2].toLowerCase(), thresholds: th ? [Number(th[1]), Number(th[2]), Number(th[3])] : [],
    ground: /\btaint grade of the ground you stand on\b/.test(t) };
}

/**
 * **WHAT A SPELL'S OWN SLOWED BARS** (07 §17's Blood Bind: *While it is Slowed by this spell, it
 * cannot take Reactions*; §11's Chains of Ice: *While it is Slowed by this spell, it cannot
 * **Disengage***): the bar rides the Slowed the failure laid, so it ends when that Slowed does.
 * @returns {{reactions: boolean, disengage: boolean}|null}
 */
export function readSlowedBars(effect) {
  const m = /\bWhile it is Slowed by this spell, it cannot (take Reactions|Disengage)\b/.exec(flat(effect).replace(/\*\*/g, ""));
  return m ? { reactions: m[1] === "take Reactions", disengage: m[1] === "Disengage" } : null;
}

/**
 * **A FAILURE'S SLOWED THAT OUTLASTS ITS ENTANGLED** (07 §11's Chains of Ice: *On a failure it is
 * **Entangled** until the end of its next turn and **Slowed** for the rest of the duration. It may
 * repeat the Test at the end of each of its turns*): the Slowed takes the spell's span and carries
 * the repeated Test, since the Entangled ends at the end of the next turn by itself.
 */
export function readSlowedRest(effect) {
  return /\bis Entangled until the end of its next turn and Slowed for the rest of the duration\b/.test(flat(effect).replace(/\*\*/g, ""));
}

/* -------------------------------------------- */
/*  The judgements                               */
/* -------------------------------------------- */

/** Death's Embrace: half its Health or less (value at or below half the maximum). A lang key's tail, or null. */
export function halfHealthRefusal({ value = null, max = null } = {}) {
  if (value === null || value === undefined || max === null || max === undefined) return "unmeasured";
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return "unmeasured";
  return v * 2 <= m ? null : "notHalf";
}

/**
 * **THE CREATURES PESTILENCE STRIKES**: every enemy within the ring of the carrier, the carrier
 * itself left out (AGENT READING: *within 15 feet of the target* names the creatures around it),
 * never a defeated or hidden one (`rules/distance.mjs#countsAsEnemy`'s rule), sorted by distance,
 * name, id - so the card's rows never reorder.
 *
 * @param {Array<{id: string, name: string, feet: number|null, enemy: boolean, down?: boolean, hidden?: boolean}>} rows
 * @param {{carrierId: string, feet: number}} o
 * @returns {string[]}  token ids
 */
export function pestilenceRing(rows = [], { carrierId = null, feet = 15 } = {}) {
  return (rows ?? [])
    .filter(r => r && r.id !== carrierId && r.enemy === true && r.down !== true && r.hidden !== true
      && typeof r.feet === "number" && Number.isFinite(r.feet) && r.feet <= feet + 1e-6)
    .sort((a, b) => a.feet - b.feet || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)))
    .map(r => r.id);
}

/**
 * **THE DISEASES OF YOURS A CREATURE CARRIES**: the Plague kinds on its laid ticks whose source is
 * the knight, sorted and once each.
 *
 * @param {Array<{tick?: {plague?: string, source?: string}|null, active?: boolean}>} effects
 * @param {string|null} knightUuid
 * @returns {string[]}
 */
export function carriedPlagues(effects = [], knightUuid = null) {
  const out = new Set();
  for (const e of effects ?? []) {
    const tick = e?.tick ?? null;
    if (!tick || e?.active === false || typeof tick.plague !== "string" || !tick.plague) continue;
    if ((tick.source ?? null) !== knightUuid) continue;
    out.add(tick.plague);
  }
  return [...out].sort();
}

/**
 * **WHETHER DEATH PACT MAY TAKE THIS CREATURE**: an undead creature the caster controls - its bond
 * names the caster as owner. A lang key's tail, or null.
 */
export function deathPactRefusal({ ownerUuid = null, casterUuid = null, undead = false } = {}) {
  if (!ownerUuid || ownerUuid !== casterUuid) return "notYours";
  if (undead !== true) return "notUndead";
  return null;
}

/** What Death Pact restores: the Health the creature had, to the cap. */
export function deathPactHeal(health = 0, cap = 8) {
  return Math.min(whole(health), whole(cap));
}

/** The highest Undeath threshold crossed: `0` (none), 5, 10 or 15. */
export function undeathThreshold(value = 0, thresholds = [5, 10, 15]) {
  const v = whole(value);
  return [...thresholds].sort((a, b) => b - a).find(t => v >= t) ?? 0;
}

/** Eight directions on the board (canvas y grows downward), as a lang key's tail. */
export function compassOf(dx = 0, dy = 0) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (!x && !y) return "here";
  const deg = (Math.atan2(-y, x) * 180 / Math.PI + 360) % 360;
  return ["E", "NE", "N", "NW", "W", "SW", "S", "SE"][Math.round(deg / 45) % 8];
}

/**
 * **WHAT PLAGUESIGHT SENSES**: every creature within reach that carries Undeath - a character's
 * track above 0, or a creature whose block names the Undeath keyword (14's blocks carry the
 * keyword and no number, so its threshold is not on its block) - with its direction and highest
 * threshold, sorted by distance, then name, then id.
 *
 * @param {Array<{id: string, name: string, feet: number|null, dx: number, dy: number,
 *   value?: number|null, keyword?: boolean}>} rows
 * @param {{feet: number, thresholds?: number[]}} o
 * @returns {Array<{id: string, name: string, feet: number, direction: string, threshold: number|null}>}
 */
export function plaguesightRows(rows = [], { feet = 60, thresholds = [5, 10, 15] } = {}) {
  return (rows ?? [])
    .filter(r => r && typeof r.feet === "number" && Number.isFinite(r.feet) && r.feet <= feet + 1e-6
      && (whole(r.value) > 0 || r.keyword === true))
    .map(r => ({ id: r.id, name: r.name, feet: r.feet, direction: compassOf(r.dx, r.dy),
      threshold: whole(r.value) > 0 ? undeathThreshold(r.value, thresholds) : null }))
    .sort((a, b) => a.feet - b.feet || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * The ground's highest grade for one track (10 §2's *taint grade*): 0 where the region carries none.
 * @param {Array<{grade: number, track: string}>} grades  `rules/regions.mjs#exposureFor`'s
 */
export function groundGrade(grades = [], track = "undeath") {
  return (grades ?? []).filter(g => g?.track === track).reduce((n, g) => Math.max(n, whole(g.grade)), 0);
}

/**
 * **HORN OF WINTER, JUDGED FOR A GM** (the F4b review, M1): the Boon lands on a creature another
 * client owns through the GM's client, so a cast reaching one with no GM online is refused before
 * anything is spent - the shape Frostwyrm Breath and Death Pact already ask
 * (`rules/gm-writes.mjs#gmAbsentFor`). A lang key's tail, or null.
 *
 * @param {Array<{owned: boolean}>} reached  the allies the cast measured, the knight included
 * @param {{isGM?: boolean, gmActive?: boolean}} o
 * @returns {"noGM"|null}
 */
export function hornRefusal(reached = [], { isGM = false, gmActive = false } = {}) {
  return gmAbsentFor({ owned: (reached ?? []).map(r => r?.owned === true), isGM, gmActive }) ? "noGM" : null;
}

/**
 * **HOW MANY SECONDS A SPAN COUNTED IN TURNS HAS LEFT** (O-384; run close-F2): a v14 `turns` span
 * ends at the end of its keyed creature's turn once `remaining` more turns have passed (14.367
 * `ActiveEffect#_prepareCombatBasedDuration`, `isExpiryEvent`), and core gives it no seconds because
 * a turn has no length of its own (`CONFIG.time.turnTime` 0, `azeroth.mjs`). Out of the fight's
 * order it has one: the turns from the current one until that creature's turn ends, at a round's
 * seconds spread over the turns of the round. Null where the fight cannot say.
 *
 * @param {{remaining?: number, current?: number, keyed?: number, turns?: number, roundSeconds?: number}} o
 *   `current` the fight's turn index now, `keyed` the keyed creature's index in the fight's turns,
 *   `turns` how many turns a round holds, `roundSeconds` a round's length (05's six)
 * @returns {number|null}
 */
export function turnSpanSeconds({ remaining = null, current = null, keyed = null, turns = null, roundSeconds = null } = {}) {
  const n = Math.trunc(Number(turns));
  const cur = Math.trunc(Number(current));
  const key = Math.trunc(Number(keyed));
  const rs = Number(roundSeconds);
  const r = Number(remaining);
  if (!(n > 0) || !(rs > 0) || !Number.isFinite(r) || !Number.isInteger(cur) || !Number.isInteger(key) || cur < 0 || key < 0 || key >= n) return null;
  if (r === Infinity) return Infinity;
  const need = Math.max(0, Math.ceil(r));
  // The first turn of the keyed creature at least `need` turns from now (the current one at 0).
  let t = (((key - cur) % n) + n) % n;
  while (t < need) t += n;
  return ((t + 1) / n) * rs;
}

/**
 * **WHAT A SPAN HAS LEFT, IN SECONDS** (O-384): core's own `secondsRemaining` where the clock says
 * it; else a span counted in rounds at the round's length; else a span counted in turns through
 * `turnSpanSeconds` off the fight's order the span carries (`turn`); else null.
 *
 * @param {{secondsRemaining?: number|null, remaining?: number|null, units?: string|null,
 *   turn?: {current: number, keyed: number, turns: number}|null}} span
 * @param {{roundSeconds?: number|null}} o
 * @returns {number|null}
 */
export function spanSeconds(span, { roundSeconds = null } = {}) {
  if (!span) return null;
  if (typeof span.secondsRemaining === "number" && !Number.isNaN(span.secondsRemaining)) return span.secondsRemaining;
  const rs = Number(roundSeconds);
  const r = Number(span.remaining);
  if (!(rs > 0) || span.remaining === null || span.remaining === undefined || !Number.isFinite(r)) return null;
  if (span.units === "rounds") return r * rs;
  if (span.units === "turns" && span.turn) return turnSpanSeconds({ remaining: r, ...span.turn, roundSeconds: rs });
  return null;
}

/**
 * **WHICH OF TWO SPANS ON ONE SLOWED STANDS LONGER** (the F4b review, S4): where a creature was
 * already Slowed when a Death Knight spell's failure Slowed it again, the one effect it carries
 * keeps whichever span runs longer - the spell never cuts an older, longer Slowed down to its own.
 * A span is what core prepared on the effect: `secondsRemaining` where the clock can say it,
 * else `remaining` in its `units`; no duration at all (a hand-laid Slowed) never ends, so it is
 * the longer. Answers `"prior"` or `"next"`; a tie keeps the prior.
 *
 * **MADE COMPARABLE** (O-384; run close-F2): a span counted in rounds or turns is read in seconds
 * (`spanSeconds`, the round's length handed in as `roundSeconds`), so a Slowed laid out of a fight
 * on the world's clock and one laid in a fight compare, and the one that ends later stands. Two
 * spans that still cannot be compared keep the older, unless `next.minute` marks the spell's own
 * explicit minute (the F4c review, S3).
 *
 * @param {{temporary?: boolean, secondsRemaining?: number|null, remaining?: number|null, units?: string|null, turn?: object|null}|null} prior
 * @param {{temporary?: boolean, secondsRemaining?: number|null, remaining?: number|null, units?: string|null, turn?: object|null, minute?: boolean}|null} next
 * @param {{roundSeconds?: number|null}} [o]
 * @returns {"prior"|"next"}
 */
export function keepLongerSpan(prior = null, next = null, { roundSeconds = null } = {}) {
  if (!prior) return "next";
  if (!next) return "prior";
  const endless = s => s.temporary === false || s.secondsRemaining === Infinity || s.remaining === Infinity;
  if (endless(prior)) return "prior";
  if (endless(next)) return "next";
  const a = spanSeconds(prior, { roundSeconds });
  const b = spanSeconds(next, { roundSeconds });
  if (a !== null && b !== null) return b > a ? "next" : "prior";
  if (prior.units && prior.units === next.units && Number.isFinite(Number(prior.remaining)) && Number.isFinite(Number(next.remaining))) {
    return Number(next.remaining) > Number(prior.remaining) ? "next" : "prior";
  }
  // **TWO SPANS THE CLOCK CANNOT COMPARE** (the F4c review, S3): the older one stands, so an
  // unreadable span never cuts a longer Slowed - unless the new one is the spell's own explicit
  // minute (Chains of Ice's *for the rest of the duration*, `minute: true`), which is what 07 sets.
  return next.minute === true ? "next" : "prior";
}

/** The mark on the bar effect a spell's Slowed bars ride when the shared Slowed outlasts them. */
export const SLOWED_BAR_FLAG = "slowedBar";

/**
 * **A SPELL'S SLOWED BARS LAST AS LONG AS ITS OWN SLOWED** (07 §11's Blood Bind and Chains of Ice:
 * *While it is Slowed by this spell*; the final review's finding 6, D-997). The bars were written
 * onto the creature's one shared Slowed, and where an older Slowed outlasted this spell's
 * (`keepLongerSpan` answering `"prior"`) the shared effect kept the older span, so a one-turn Blood
 * Bind barred Reactions for a whole minute. Where the older span is kept, the bar keys come out of
 * the Slowed's update and ride an effect of their own, spanned by THIS spell's Slowed; elsewhere
 * the shared Slowed's span is this spell's, and the bars stay on it.
 *
 * @param {object} update  the Slowed's update, its bar keys written as `flags.<scope>.<key>`
 * @param {{keptPrior?: boolean, scope?: string, keys?: string[]}} o
 * @returns {{slowed: object, bar: object|null}}  the Slowed's update, and the bar effect's flags (nested under the scope) or null
 */
export function splitSlowedBars(update = {}, { keptPrior = false, scope = "azeroth-rpg", keys = [] } = {}) {
  const slowed = { ...update };
  if (!keptPrior) return { slowed, bar: null };
  const inner = {};
  for (const key of keys) {
    const path = `flags.${scope}.${key}`;
    if (!Object.hasOwn(slowed, path)) continue;
    inner[key] = slowed[path];
    delete slowed[path];
  }
  return { slowed, bar: Object.keys(inner).length ? { [scope]: inner } : null };
}

/* -------------------------------------------- */
/*  The census                                   */
/* -------------------------------------------- */

/**
 * **EVERY DEATH KNIGHT SPELL, THE DOORS THAT CARRY IT AND WHAT STAYS THE TABLE'S** (run F4b). The
 * scope is 07's Death spells a Death Knight may hold (its Restricted line empty or naming the
 * knight) and every spell whose Restricted line is the Death Knight's alone. `doors` names the
 * machinery (a descriptor the pack carries, or a door by name); `table` is a clause 07 states that
 * nothing automates, with why; `reason` is a whole spell left to the table, with why.
 */
export const DK_SPELL_AUTOMATION = Object.freeze({
  // 07 §17, tier 1
  "corpse-burst": { doors: ["card:damage", "corpse-mark:destroyed"] },
  "death-coil": { doors: ["card:damage", "card:drain", "card:undeadHeal", "talent:crimson-coil", "talent:chill-of-the-grave"] },
  "deaths-advance": { doors: ["applies:speed", "areaGround:ignores"] },
  "grasp-of-the-grave": { doors: ["card:resist", "onFail:entangled", "escape:turnEnd"] },
  "kinship-of-the-dead": { doors: [], reason: "how a mindless undead treats a creature is the GM's (D2 §12): no creature in the system carries a reaction the spell could change; and with no laid effect, its end when a target harms an undead creature is the GM's to call too" },
  "plaguesight": { doors: ["dk:plaguesight"] },
  "raise-ghoul": { doors: ["raise"] },
  "raise-skeleton": { doors: ["raise"] },
  "read-the-dead": { doors: [], reason: "what the GM tells the caster about a death is the GM's (D2 §12)" },
  "stay-the-rot": { doors: ["corpse-mark:kept"], table: "the corpse's decay is narrative; only the raise it bars is a rule the system reads" },
  "unholy-armor": { doors: ["temporaryHealth:castingMod"] },
  "unholy-mending": { doors: ["card:heal", "healing-law:undeadOnly"] },
  "vein-rend": { doors: ["card:damage", "card:resist", "onFail:bleeding"] },
  // 07 §17, tier 2
  "blood-bind": { doors: ["card:resist", "onFail:slowed", "escape:turnEnd", "dk:slowedBars:reactions"] },
  "bloodtrail": { doors: [], reason: "a direction and a distance to a creature off the board are the GM's to give (D2 §12)" },
  "death-and-decay": { doors: ["areaTick:castingMod"] },
  "death-pact": { doors: ["dk:deathPact"] },
  "echo-of-the-slain": { doors: [], reason: "what the dead heard is the GM's to tell (D2 §12)" },
  "grave-coil": { doors: ["card:damage", "card:drain", "temporaryHealth:overflow", "card:undeadHeal"] },
  "grave-labor": { doors: [], reason: "14 prints no block for a mindless servant, and inventing one is content the lead decides (CLAUDE.md §17; O-371)" },
  "heartrend": { doors: ["card:damage", "card:drain"] },
  "mask-of-the-living": { doors: [], reason: "how the living read the caster is the GM's (D2 §12); detection magic still finds the knight, which is every door's default" },
  "ossuary-wall": { doors: ["wall:blocksMovementAndSight"], table: "each 10-foot section's 10 Health, 4 Armor Points and Ward 2 against Shadow: a Wall has no Health in core, so a section falling is the GM's (O-368)" },
  "raise-crypt-fiend": { doors: ["raise"] },
  "unholy-frenzy": { doors: ["applies:named"], table: "+2 Shadow on the target's melee hits and 1 Health lost at the start of each of its turns: the laid effect names them and no door reads them yet (O-369)" },
  // 07 §17, tier 3
  "bone-threshold": { doors: [], reason: "a line a living creature crosses and a mindless undead cannot is the GM's to adjudicate (D2 §12)" },
  "corpse-eyes": { doors: [], reason: "what a corpse would see at any distance is the GM's to describe (D2 §12)" },
  "deaths-embrace": { doors: ["dk:halfHealthGate", "card:resist", "onFail:stunned"] },
  "dread-visage": { doors: [], reason: "nothing offers its Boon on Tests to frighten or coerce: which Test frightens or coerces is the table's call (D2 §12), and no roll dialog draws a line for it yet; whether a lower-tier creature approaches is the GM's" },
  "graveblight": { doors: ["areaTick", "areaTick:undeadInstead", "remains:healingHalved"] },
  "gravewell": { doors: ["areaTick:undeadHeal"] },
  "lichward": { doors: [], reason: "a Reaction asked inside a spell's blow, its Ward applied to that blow, is a blow-door ask Icebound Fortitude's shape could carry and does not yet (O-367)" },
  "necrotic-shell": { doors: ["temporaryHealth"], table: "3 more temporary Health each time the caster's spell deals Shadow damage, to 20, and no healing by another creature while any remains: no door reads either yet (O-370)" },
  "pestilence": { doors: ["dk:pestilence", "card:damage", "plague:spread"] },
  "raise-abomination": { doors: ["raise"] },
  "seal-the-soul": { doors: ["corpse-mark:sealed"], table: "questioning, calling or binding the spirit is the GM's; only the raise it bars is a rule the system reads" },
  "soul-rend": { doors: ["card:damage", "card:resist", "dk:noHealingOnFail"] },
  "unholy-blight": { doors: ["areaTick", "region:attached"] },
  // 07 §17, tier 5 (Contagion, open at tier 4, is the Necromancer's census's: 07 §4's chart bars the
  // knight from tier 4, and `necromancer-spells.mjs#NECRO_SPELL_AUTOMATION` carries its door; run 4c-S)
  "raise-dracolich": { doors: ["raise"] },
  // 07 §11, Restricted Death Knight
  // The spell audit made 07 say what the lane does (D-1702, D-1711): *Each hit of your next Attack
  // this turn*, every roll of it, ranged or not, so O-363 has no clause left.
  "frost-strike": { doors: ["nextAttack"] },
  "horn-of-winter": { doors: ["dk:horn"] },
  "icy-touch": { doors: ["card:damage", "card:resist", "onFail:slowed"] },
  "chains-of-ice": { doors: ["card:resist", "onFail:entangled+slowed", "escape:turnEnd", "dk:slowedRest", "dk:slowedBars:disengage"] },
  "howling-blast": { doors: ["card:damage", "card:resist", "onFail:slowed"] },
  "glacial-advance": { doors: ["card:damage", "castingModPlus", "areaGround:difficult"] },
  "frostwyrm-breath": { doors: ["card:damage", "card:resist", "onFail:stunned", "dk:alwaysEntangled", "escape:action"] },
  // 07 §14, Restricted Death Knight
  "mind-freeze": { doors: [], reason: "a Reaction to another creature's Casting Test rides the casting reaction window Spell Lock opens (`effects/spell-lock-*.mjs`), which offers only a creature's ability today (O-366)" },
  "black-mist": { doors: ["applies:named"], table: "Blinded while inside the area: no area or aura payload lays a condition and lifts it on leaving (O-365)" },
  "dread-cry": { doors: ["card:resist", "onFail:frightened"] },
  "strangulate": { doors: ["card:resist", "onFail:silenced", "escape:turnEnd"] },
  "pall-of-despair": { doors: ["remains:bane:spirit", "region:attached"] }
});

/** How many whole spells stay the table's: a ceiling that may only fall. */
export const DK_SPELL_REASON_CEILING = 11;

/** How many spells leave a clause to the table: a ceiling that may only fall. */
export const DK_SPELL_TABLE_CEILING = 6;

/**
 * **A DESCRIPTOR DOOR**: a label the pack's own descriptor proves (`death-knight-spells.test.mjs`
 * reads the spell's YAML for it), and the generic card or area door every spell rides.
 */
export const DK_DESCRIPTOR_PREFIXES = Object.freeze(["card:damage", "card:resist", "card:drain", "card:heal", "onFail:", "areaTick", "areaGround:", "applies:", "remains:"]);

/**
 * **WHERE EVERY OTHER DOOR IS CALLED** (the F4b review, S1): a label a row names that no descriptor
 * proves, with the call sites that carry it - each `{file, fn, contains}` a fragment the census finds
 * INSIDE the named function of that file (the F4c review, S5: anywhere in the file proved nothing
 * about a live path), so a label is a caller, not a name. A row naming a label in neither list fails the
 * census; a call site missing from its file fails it too.
 */
export const DK_SPELL_DOORS = Object.freeze({
  "dk:plaguesight": [
    { file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "if (readPlaguesight(sys.effect)) plan.plaguesight = readPlaguesight(sys.effect);" },
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterCast", contains: "if (plan.plaguesight) lines.push(...await plaguesightLands(actor, spell, plan.plaguesight, source));" }
  ],
  "dk:deathPact": [
    { file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const pact = readsControlledUndead(sys.target) ? readDeathPact(sys.effect) : null;" },
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterCast", contains: "if (plan.deathPact) lines.push(...await deathPactLands(actor, spell, plan.deathPact));" }
  ],
  "dk:halfHealthGate": [{ file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const no = halfHealthRefusal(victim?.system?.health ?? {});" }],
  "dk:pestilence": [{ file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const pest = readsCarrierTarget(sys.target) ? readPestilence(sys.effect) : null;" }],
  "plague:spread": [
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterApply", contains: "lines.push((await layPlagueOn({ victim: target, kind, by: knight })).text);" },
    { file: "module/dice/chat.mjs", fn: "applyDamageToTargets", contains: "await dkSpells.dkSpellAfterApply({ message, target: actor, amount: damageOutcome.amount });" }
  ],
  "dk:noHealingOnFail": [{ file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterResist", contains: "const noHeal = readNoHealingOnFail(effect);" }],
  "dk:horn": [
    { file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const reached = await hornReach(actor, horn, source);" },
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterCast", contains: "if (plan.horn) lines.push(...await hornLands(actor, spell, plan.horn, source));" }
  ],
  "dk:slowedRest": [{ file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterResist", contains: "const rest = readSlowedRest(effect);" }],
  "dk:slowedBars:reactions": [{ file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterResist", contains: "if (bars?.reactions) update[`flags.${SCOPE}.${REACTION_BAR_FLAG}`]" }],
  "dk:slowedBars:disengage": [
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterResist", contains: "if (bars?.disengage) update[`flags.${SCOPE}.${NO_DISENGAGE_FLAG}`]" },
    { file: "module/effects/disengage-bars.mjs", fn: "disengageBarFor", contains: "chained: noDisengageBy(actor)" }
  ],
  "dk:alwaysEntangled": [
    { file: "module/effects/death-knight-spells.mjs", fn: "judgeDkSpell", contains: "const always = readAlwaysCondition(sys.effect);" },
    { file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterCast", contains: "const landed = await inflictCondition({ victim, id: plan.always.condition," }
  ],
  "escape:action": [{ file: "module/effects/death-knight-spells.mjs", fn: "dkSpellAfterCast", contains: "const record = escapeRecord({ ...plan.always, banes: 0 }," }],
  "escape:turnEnd": [
    { file: "module/dice/chat.mjs", fn: "rollResists", contains: "if (effect && escape?.condition === id) await effect.setFlag(\"azeroth-rpg\", ESCAPE_FLAG, escape);" },
    { file: "module/documents/combat.mjs", fn: "_onEndTurn", contains: "await this._escapePrompts(combatant, \"turnEnd\")" }
  ],
  "raise": [{ file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raisePlan = await judgeRaise(actor, spell, { key: sys.identifier, source" }],
  "corpse-mark:destroyed": [
    { file: "module/rules/raise.mjs", fn: "CORPSE_MARKS", contains: "\"corpse-burst\": Object.freeze({ state: \"destroyed\"" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raiseLines.push(...await markCorpse(actor, corpsePlan));" }
  ],
  "corpse-mark:kept": [
    { file: "module/rules/raise.mjs", fn: "CORPSE_MARKS", contains: "\"stay-the-rot\": Object.freeze({ state: \"kept\"" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raiseLines.push(...await markCorpse(actor, corpsePlan));" }
  ],
  "corpse-mark:sealed": [
    { file: "module/rules/raise.mjs", fn: "CORPSE_MARKS", contains: "\"seal-the-soul\": Object.freeze({ state: \"sealed\"" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "raiseLines.push(...await markCorpse(actor, corpsePlan));" }
  ],
  "talent:crimson-coil": [
    { file: "module/rules/talent-effects.mjs", fn: "TALENT_EFFECTS", contains: "\"crimson-coil\": { spell: { names: [\"Death Coil\"] }, tempHealth: { on: \"coilDealt\"" },
    { file: "module/effects/death-knight-talents.mjs", fn: "dkAfterSpellApply", contains: "dkTempFor(talents, { on: \"coilDealt\", dealt: amount }, talentEffect)" }
  ],
  "talent:chill-of-the-grave": [
    { file: "module/rules/talent-effects.mjs", fn: "TALENT_EFFECTS", contains: "\"chill-of-the-grave\": { spell: { names: [\"Death Coil\"] }, dk: { coilSlows:" },
    { file: "module/effects/death-knight-talents.mjs", fn: "dkAfterSpellApply", contains: "const slow = coilSlowsFor(talents, talentEffect);" }
  ],
  "nextAttack": [
    { file: "module/effects/sand-spells.mjs", fn: "sandSpellAfterCast", contains: "const promise = readNextAttack(sys?.effect ?? \"\");" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "if (success) conditionLines.push(...await sandSpellAfterCast({" }
  ],
  "temporaryHealth": [{ file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const temporary = success ? castTemporary(spell, talentsNow, actor, { castingMod: abilityMod }) : null;" }],
  "temporaryHealth:castingMod": [
    { file: "module/dice/workflows.mjs", fn: "castTemporary", contains: "const plus = read.castingMod === true ? Math.trunc(Number(castingMod)) || 0 : 0;" },
    { file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const temporary = success ? castTemporary(spell, talentsNow, actor, { castingMod: abilityMod }) : null;" }
  ],
  "temporaryHealth:overflow": [{ file: "module/dice/workflows.mjs", fn: "castSpell", contains: "if (readTemporaryHealth(sys.effect)?.overflow === true) {" }],
  "healing-law:undeadOnly": [
    { file: "module/rules/undead.mjs", fn: "healingRefusal", contains: "if (sourceDeathKnight && !targetUndead) return \"livingTarget\";" },
    { file: "module/documents/actor.mjs", fn: "_undeadHealingRefusal", contains: "return healingRefusal({" }
  ],
  "card:undeadHeal": [{ file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const undeadHeal = success ? undeadHealFromText(sys.effect) : null;" }],
  "castingModPlus": [{ file: "module/dice/workflows.mjs", fn: "castSpell", contains: "const castModAdd = viaItem ? 0 : castingModPlus(sys.effect ?? \"\", { ability, mod: abilityMod });" }],
  "wall:blocksMovementAndSight": [
    { file: "module/dice/chat.mjs", fn: "regionFlagsFromCard", contains: "blocksMovement(flags.effectHTML ?? \"\") ? { blocksMovement: true }" },
    { file: "module/dice/chat.mjs", fn: "regionFlagsFromCard", contains: "blocksSight(flags.effectHTML ?? \"\") ? { blocksSight: true }" }
  ],
  "region:attached": [{ file: "module/canvas/regions.mjs", fn: "regionDataFor", contains: "attachment: { token: attachedTo }," }]
});
