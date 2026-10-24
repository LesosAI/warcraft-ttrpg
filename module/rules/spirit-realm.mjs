/**
 * **THE SPIRIT REALM** (06 §10; 04's The Crossing and Ethereal Form; the Legacy
 * branches' door 10). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 06 §9 sends a character at 0 Health to the Spirit Realm: *Your body falls Prone
 * and does not move. You still take turns, in the Spirit Realm.* 06 §10 says what
 * that is: *On your turn, in this order: 1. Make the Body Resilience Test at DC 12.
 * A failure is a Death Step. 2. Take one Half-Action in the Spirit Realm. You cannot
 * touch the living world, and nothing in the fight can touch you.* Only the first
 * half was modelled (`combat.mjs`'s Death Step prompt); this is the second.
 *
 * - **Who is there** (`realmStateOf`): a character DYING - at 0 Health, not
 *   stabilized, short of the third Death Step (MY READING, for the lead: 06 §9's
 *   *Stabilize ... You remain at 0 Health and unconscious*, and 06 §10's *You are
 *   not unconscious*, so a stabilized character has left the turn the realm gives)
 *   - and one who stepped in by 04's The Crossing (*As a Full Action, spend 4 Mana.
 *   You step into the Spirit Realm for up to one minute and step back where you
 *   left*), an Active Effect on the user flagged `SPIRIT_FLAG` and spanned to the
 *   minute, deleted to step back (free: *up to one minute*).
 * - **What the turn holds** (`realmStateOf`'s `halfActions`, `reactions`): *one
 *   Half-Action*, and two where the talent's row says so at its rank (*At rank 2
 *   you take two Half-Actions a turn in the Spirit Realm rather than one, there and
 *   while you are Dying*), and no Reaction - a Reaction is the living world's.
 * - **What it may not do** (`realmRefusal`, `REALM_REFUSALS`): *You cannot touch
 *   the living world* - no attack, no Use of a feature, a thing carried, a
 *   Signature, a maneuver or a creature's ability, and no Reaction. The body does
 *   not move: a Dying character is Prone, and The Crossing's effect holds the Speed
 *   at 0 (`effects/spirit-realm.mjs#crossInto`), so a fight's movement limit refuses
 *   every foot (D-757). **A feature that is a way back** is the exception, since 06 names
 *   them as what returns a character from Dying (02's Reincarnation; the door
 *   passes `wayBack`).
 * - **What The Crossing lets it do** (`spiritRealmFor`): *While you are in the
 *   Spirit Realm, by this or while **Dying**, you may cast spells that restore
 *   Health on any creature but yourself* - the row's `heals: "others"`, read off
 *   the TALENT, so it holds while Dying whether or not the Use was made.
 * - **The table's half** (`SPIRIT_TABLE_ACTIONS`): 06's **Look** (*the GM tells you
 *   one true thing*), **Speak** (*Whether it answers is its own business*),
 *   **Walk** (*Distance here is unreliable and the GM says where you arrive* - the
 *   token is the BODY, and the body does not move) and **Refuse** (*Refusing costs
 *   nothing and changes nothing*) are the GM's to answer; **Reach** is a Test
 *   (*Spirit Resilience at DC 18*) and is built (`SPIRIT_REALM.reach`), its outcome
 *   - *a guttering candle, a loose stone, a horse's nerve* - the table's.
 * - **The offer** (`offerStands`, `OFFER`): *When you take your second Death
 *   Step, something notices you ... stand up now, at 1 Health, with your Death Steps
 *   cleared. The price is Corruption* - 1, 2 or 3, and the track and the price the
 *   GM's from the place (*the GM decides from the place rather than from a table*);
 *   *The offer stands until you die or leave*. Taken through the prompt's own
 *   button, the price named at the press.
 *
 * **ETHEREAL FORM SHARES THE CAST FILTER** (04: *While it holds you cannot attack or
 * cast, except spells that restore Health*): `etherealRefusal` refuses an attack and
 * any cast that does not restore Health - on anybody, the caster included, which is
 * the one word that differs from The Crossing's *on any creature but yourself*. Its
 * halving is 04's *physical damage you take is halved, rounded down*
 * (`etherealTaken`), at the one damage door; *you may move through the space of any
 * creature* asks nothing of the system, since nothing in it stops a walk through
 * another creature's space (`ETHEREAL_UNBUILT`).
 */

import { isHealingSpell } from "./casting.mjs";

/** The Active Effect flag The Crossing stands under, on the user: `{source, minutes}`. */
export const SPIRIT_FLAG = "spiritRealm";

/** The Active Effect flag Ethereal Form stands under, on each creature it covers: `{source, by}`. */
export const ETHEREAL_FLAG = "ethereal";

/**
 * 06 §10 as the door reads it, held to the chapter by `legacy-spirits.test.mjs`:
 * *Take **one Half-Action** in the Spirit Realm*; the five actions of *What you can
 * do*; **Reach**'s *Spirit Resilience at DC 18*.
 */
export const SPIRIT_REALM = Object.freeze({
  halfActions: 1,
  reactions: 0,
  actions: Object.freeze(["look", "speak", "walk", "reach", "refuse"]),
  reach: Object.freeze({ resilience: "spirit", dc: 18 })
});

/** The four of 06 §10's actions whose outcome is the GM's to answer, each with its reason. */
export const SPIRIT_TABLE_ACTIONS = Object.freeze({
  look: "the GM tells you one true thing about it that the living cannot know (06 §10)",
  speak: "whether the dead answer is their own business (06 §10)",
  walk: "distance in the Spirit Realm is unreliable and the GM says where you arrive; the token is the body, which does not move (06 §9, §10)",
  refuse: "refusing the offer costs nothing and changes nothing (06 §10)"
});

/**
 * **THE OFFER** (06 §10): *When you take your **second Death Step**, something
 * notices you* - and the price table's three rows. The track is the GM's call from
 * the place (*In the Plaguelands it is something of the Scourge. Near a fel scar it
 * is a demon*).
 */
export const OFFER = Object.freeze({ step: 2, prices: Object.freeze([1, 2, 3]) });

/**
 * Why a door is refused from the Spirit Realm, as `lang/en.json` keys.
 *
 * **THE BODY DOES NOT STAND OR MOVE, AND THE LIVING WORLD'S HALF-ACTIONS ARE CLOSED**
 * (the B3 review): 06 §9's *Your body falls Prone and does not move* - so 05's Stand
 * (`stand`, A1's Prone ended by a Half-Action) is refused at the one toggle door, and
 * a fight's movement limit holds the body's pace at 0 (`move`) - a Dying character
 * at 0 by Bleeding or a tick is never Prone, and walked; and the Combat tab's own
 * controls - Guard, Disengage, Ready, Hide, the Ranger's mark and a rider paid before
 * the blow - are the living world's (`action`), one gate each.
 */
export const REALM_REFUSALS = Object.freeze({
  attack: "AZEROTH.Spirit.Refuse.Attack",
  cast: "AZEROTH.Spirit.Refuse.Cast",
  castSelf: "AZEROTH.Spirit.Refuse.CastSelf",
  castNoTarget: "AZEROTH.Spirit.Refuse.CastNoTarget",
  feature: "AZEROTH.Spirit.Refuse.Feature",
  gear: "AZEROTH.Spirit.Refuse.Gear",
  signature: "AZEROTH.Spirit.Refuse.Signature",
  maneuver: "AZEROTH.Spirit.Refuse.Maneuver",
  ability: "AZEROTH.Spirit.Refuse.Ability",
  reaction: "AZEROTH.Spirit.Refuse.Reaction",
  stand: "AZEROTH.Spirit.Refuse.Stand",
  move: "AZEROTH.Spirit.Refuse.Move",
  action: "AZEROTH.Spirit.Refuse.Action"
});

/** The doors 06 §10's *You cannot touch the living world* closes. */
export const REALM_DOORS = Object.freeze(Object.keys(REALM_REFUSALS).filter(k => !k.startsWith("cast")));

/** Why a door is refused while Ethereal Form holds, as `lang/en.json` keys. */
export const ETHEREAL_REFUSALS = Object.freeze({
  attack: "AZEROTH.Ethereal.Refuse.Attack",
  cast: "AZEROTH.Ethereal.Refuse.Cast"
});

/** What of Ethereal Form asks nothing of the system, with the reason. */
export const ETHEREAL_UNBUILT = Object.freeze({
  passes: "nothing in the system stops a walk through another creature's space; a step only refuses ENDING in one (`rules/steps.mjs#stepRefusal`)"
});

/** The spans a laid Ethereal Form may take: *Until your next turn* - the USER's. */
export const ETHEREAL_SPANS = Object.freeze(["userTurnStart"]);

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * **WHETHER A CHARACTER IS DYING** (06 §9): a character at 0 Health, not stabilized,
 * short of the third Death Step. A creature that is not a character dies at 0 (14)
 * and walks nowhere.
 *
 * @param {{type?: string, health?: number|null, stabilized?: boolean, steps?: number, max?: number}} o
 */
export function isDying({ type = "character", health = null, stabilized = false, steps = 0, max = 3 } = {}) {
  if (type !== "character") return false;
  if (typeof health !== "number" || !Number.isFinite(health) || health > 0) return false;
  if (stabilized === true) return false;
  return whole(steps) < Math.max(1, whole(max) || 3);
}

/**
 * A row's clauses at a rank (the `atRank` shape every Legacy reader shares).
 *
 * @param {object} row
 * @param {number} rank
 */
function atRank(row, rank) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of Array.isArray(row?.atRank) ? row.atRank : []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/** The first taken talent whose row carries a kind, its rank and its row. */
function firstRow(talents, kind, rowOf) {
  for (const t of [...(talents ?? [])].filter(x => (Math.trunc(Number(x?.taken)) || 0) > 0)
    .sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)))) {
    const row = rowOf?.(t.className, t.identifier, t.race ?? null)?.[kind] ?? null;
    if (row && typeof row === "object") return { talent: t, row: atRank(row, Math.max(1, Math.trunc(Number(t.taken)) || 1)) };
  }
  return null;
}

/**
 * **WHAT 04's THE CROSSING GIVES THE SPIRIT REALM** - a top-level `spiritRealm` row:
 * `{heals, halfActions, atRank}` - *you may cast spells that restore Health on any
 * creature but yourself* (`heals: "others"`) and *At rank 2 you take two
 * Half-Actions a turn in the Spirit Realm rather than one, there and while you are
 * Dying* (`halfActions`). Null where no talent taken carries one.
 *
 * @param {Array} talents  `AzerothActor#takenTalents`' shape
 * @param {Function} rowOf  `talent-effects.mjs#talentEffect`, injected so this module imports none of it
 * @returns {{name: string, heals: "others"|null, halfActions: number}|null}
 */
export function spiritRealmFor(talents = [], rowOf = null) {
  const hit = firstRow(talents, "spiritRealm", rowOf);
  if (!hit) return null;
  const halves = Math.trunc(Number(hit.row.halfActions));
  return {
    name: String(hit.talent.name ?? ""),
    heals: hit.row.heals === "others" ? "others" : null,
    halfActions: halves >= 1 && halves <= 2 ? halves : SPIRIT_REALM.halfActions
  };
}

/**
 * **THE CROSSING'S USE, AT THE RANK** (`onUse.crossing {minutes}`): *for up to one
 * minute*. Null where the Use is none of it.
 *
 * @param {object|null} onUse
 * @param {number} [rank]
 * @returns {{minutes: number}|null}
 */
export function crossingOf(onUse, rank = 1) {
  const raw = onUse?.crossing;
  if (!raw || typeof raw !== "object") return null;
  const row = atRank(raw, rank);
  return { minutes: Math.max(1, whole(row.minutes) || 1) };
}

/**
 * **WHERE A CHARACTER STANDS** - in the Spirit Realm or not, by which road, and what
 * its turn holds there.
 *
 * @param {{dying?: boolean, crossing?: object|null, talent?: {heals?: string|null, halfActions?: number}|null}} o
 *   `crossing` The Crossing's laid flag, where one stands; `talent` `spiritRealmFor`'s
 * @returns {{in: boolean, by: "crossing"|"dying"|null, halfActions: number, reactions: number, heals: "others"|null}}
 */
export function realmStateOf({ dying = false, crossing = null, talent = null } = {}) {
  const crossed = Boolean(crossing && typeof crossing === "object");
  const inRealm = crossed || dying === true;
  if (!inRealm) return { in: false, by: null, halfActions: 2, reactions: 1, heals: null };
  const halves = Math.trunc(Number(talent?.halfActions));
  return {
    in: true,
    by: dying === true ? "dying" : "crossing",
    halfActions: halves >= 1 && halves <= 2 ? halves : SPIRIT_REALM.halfActions,
    reactions: SPIRIT_REALM.reactions,
    heals: talent?.heals === "others" ? "others" : null
  };
}

/**
 * **WHY A DOOR IS REFUSED FROM THE SPIRIT REALM** (06 §10: *You cannot touch the
 * living world*), a `lang/en.json` key or null.
 *
 * - `cast`: only with The Crossing's talent (`state.heals`), only a spell that
 *   restores Health (`heals`), and never on the caster (*on any creature but
 *   yourself*) - a cast that names no creature is refused too, since its heal would
 *   fall back to whoever presses it (`selfTargeted: null`).
 * - `feature`: refused, but for a way back from Dying (`wayBack`, 02's Reincarnation).
 * - every other door in `REALM_DOORS`: refused - the body's Stand and its move, and
 *   the Combat tab's Half-Actions, among them (the B3 review).
 *
 * @param {{in?: boolean, heals?: string|null}} state  `realmStateOf`'s
 * @param {string} door  a `REALM_REFUSALS` key, or `cast`
 * @param {{heals?: boolean, selfTargeted?: boolean|null, wayBack?: boolean}} [o]
 * @returns {string|null}
 */
export function realmRefusal(state, door, { heals = false, selfTargeted = false, wayBack = false } = {}) {
  if (state?.in !== true) return null;
  if (door === "cast") {
    if (state.heals !== "others" || heals !== true) return REALM_REFUSALS.cast;
    if (selfTargeted === null) return REALM_REFUSALS.castNoTarget;
    if (selfTargeted === true) return REALM_REFUSALS.castSelf;
    return null;
  }
  if (door === "feature" && wayBack === true) return null;
  return REALM_REFUSALS[door] ?? null;
}

/**
 * **THE ETHEREAL FORM STANDING ON A CREATURE**, off the flags of its active
 * effects: the first, or null.
 *
 * @param {Array<object>} flagsList  each active effect's `flags["azeroth-rpg"]`
 * @returns {{source: string, by: string|null}|null}
 */
export function etherealOf(flagsList = []) {
  for (const f of flagsList ?? []) {
    const raw = f?.[ETHEREAL_FLAG];
    if (raw && typeof raw === "object") return { source: String(raw.source ?? ""), by: typeof raw.by === "string" && raw.by ? raw.by : null };
  }
  return null;
}

/**
 * **WHY A DOOR IS REFUSED WHILE ETHEREAL FORM HOLDS** (04: *While it holds you
 * cannot attack or cast, except spells that restore Health*), or null: an attack,
 * and a cast that restores no Health. A healing cast on the user is allowed - the
 * one word where this filter differs from the Spirit Realm's.
 *
 * @param {{source?: string}|null} ethereal  `etherealOf`'s
 * @param {"attack"|"cast"} door
 * @param {{heals?: boolean}} [o]
 * @returns {string|null}
 */
export function etherealRefusal(ethereal, door, { heals = false } = {}) {
  if (!ethereal) return null;
  if (door === "attack") return ETHEREAL_REFUSALS.attack;
  if (door === "cast" && heals !== true) return ETHEREAL_REFUSALS.cast;
  return null;
}

const present = v => v !== null && v !== undefined && v !== "";

/**
 * **WHETHER A SPELL DEALS DAMAGE** (the B3 review): a Rating on the cast, a damage
 * tick, an area's start-of-turn, entering or kind-gated Rating, a retaliation, or a
 * drain (*heals its caster off the damage it dealt*). Read off the spell's own
 * `system`, as `rules/casting.mjs#isHealingSpell` reads the heal.
 *
 * @param {object} sys  a spell's `system`
 * @returns {boolean}
 */
export function spellDealsDamage(sys = {}) {
  if (present(sys?.damage?.rating)) return true;
  if (sys?.tick?.kind === "damage") return true;
  if (present(sys?.heal?.fromDamage)) return true;
  const area = sys?.areaTick ?? {};
  if (present(area.damage?.rating) || present(area.enter?.rating) || area.retaliate === true) return true;
  return (Array.isArray(area.against) ? area.against : []).some(a => present(a?.rating));
}

/**
 * **A SPELL THAT RESTORES HEALTH, AND ONLY THAT** (04's The Crossing: *you may cast
 * spells that restore Health*; Ethereal Form: *except spells that restore Health*;
 * the B3 review): it heals (`isHealingSpell`) AND it deals nothing
 * (`spellDealsDamage`). A heal that also burns - Holy Nova, Halo, Starsurge,
 * Graveblight, Bloodboil, Shadow Word: Hunger - is a damaging spell to this filter, and
 * was cast from the Spirit Realm and under Ethereal Form until the review.
 *
 * @param {object} sys  a spell's `system`
 * @returns {boolean}
 */
export function restoresOnly(sys = {}) {
  return isHealingSpell(sys) && !spellDealsDamage(sys);
}

/**
 * **A CASTING FEATURE THAT RESTORES HEALTH, AND ONLY THAT** (the lead's *"Yes, casting
 * features count"*, D-777; the B3 review): a heal or a heal over time, and no damage
 * amount, no damage tick, and no area the Use places that deals damage (the talent's
 * `onUse.areaTick`, raw or read).
 *
 * @param {object} sys  a feature's `system`
 * @param {object|null} [onUse]  the granting talent's `onUse`
 * @returns {boolean}
 */
export function featureRestoresOnly(sys = {}, onUse = null) {
  const heals = present(sys?.heal) || sys?.tick?.kind === "heal";
  if (!heals) return false;
  if (present(sys?.damage?.amount) || sys?.tick?.kind === "damage") return false;
  const area = onUse?.areaTick ?? null;
  if (area && typeof area === "object" && (present(area.amount) || present(area.damage?.rating) || present(area.enter?.rating))) return false;
  return true;
}

/**
 * **THE ONE HEALING-ONLY CAST FILTER** both states share: The Crossing's from the
 * Spirit Realm, Ethereal Form's while it holds. The first refusal, or null. `heals`
 * is `restoresOnly`'s (a spell) or `featureRestoresOnly`'s (a casting feature).
 *
 * @param {{realm?: object|null, ethereal?: object|null}} states
 * @param {{heals?: boolean, selfTargeted?: boolean|null}} [cast]
 * @returns {string|null}
 */
export function castFilterRefusal({ realm = null, ethereal = null } = {}, { heals = false, selfTargeted = false } = {}) {
  return realmRefusal(realm, "cast", { heals, selfTargeted }) ?? etherealRefusal(ethereal, "cast", { heals });
}

/**
 * **WHAT ETHEREAL FORM LETS THROUGH** (04: *physical damage you take is halved,
 * rounded down*): the physical share of a blow halved, every other type whole.
 * `main` is the blow's own share and `mainType` its type (`physical` for a weapon's
 * physical lane); `parts` the second amounts (D-777), each of its own type.
 *
 * @param {{main: number, mainType?: string|null, parts?: Array<{type: string|null, damage: number}>}} blow
 * @returns {{total: number, halved: number}}  what lands, and what the halving took
 */
export function etherealTaken({ main = 0, mainType = null, parts = [] } = {}) {
  const physical = t => !t || t === "physical";
  let total = 0;
  let halved = 0;
  const take = (n, type) => {
    const a = whole(n);
    if (physical(type)) {
      const kept = Math.floor(a / 2);
      halved += a - kept;
      total += kept;
    } else total += a;
  };
  take(main, mainType);
  for (const p of Array.isArray(parts) ? parts : []) take(p?.damage, p?.type ?? null);
  return { total, halved };
}

/**
 * **KINDRED SPIRITS' ALLIES** (04: *Your Ethereal Form also covers one friendly
 * target within 30 feet per rank*): a top-level `etherealAllies {feet, count}` row,
 * the count at the rank. Null where no talent taken carries one.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @param {(expr: any, scope: object) => number|null} [amount]  the expression reader
 * @returns {{name: string, feet: number, count: number}|null}
 */
export function etherealAlliesFor(talents = [], rowOf = null, amount = v => Number(v)) {
  const hit = firstRow(talents, "etherealAllies", rowOf);
  if (!hit) return null;
  const rank = Math.max(1, Math.trunc(Number(hit.talent.taken)) || 1);
  const count = whole(typeof hit.row.count === "number" ? hit.row.count : amount(String(hit.row.count ?? "rank"), { rank }));
  const feet = whole(hit.row.feet);
  if (!(count > 0) || !(feet > 0)) return null;
  return { name: String(hit.talent.name ?? ""), feet, count };
}

/**
 * **WHY ETHEREAL FORM'S ALLIES ARE REFUSED, BEFORE ANYTHING IS PAID**: more named
 * than Kindred Spirits covers, one too far, or one that is not friendly. A key.
 *
 * @param {{named?: number, allowed?: number, far?: boolean, hostile?: boolean}} o
 * @returns {string|null}
 */
export function etherealAlliesRefusal({ named = 0, allowed = 0, far = false, hostile = false } = {}) {
  if (whole(named) > whole(allowed)) return "AZEROTH.Ethereal.Refuse.TooMany";
  if (hostile) return "AZEROTH.Ethereal.Refuse.NotFriendly";
  if (far) return "AZEROTH.Ethereal.Refuse.TooFar";
  return null;
}

/**
 * **WHETHER THE OFFER STANDS** (06 §10: *When you take your second Death Step,
 * something notices you ... The offer stands until you die or leave*): a Dying
 * character at the second Death Step or past it.
 *
 * @param {{dying?: boolean, steps?: number}} o
 */
export function offerStands({ dying = false, steps = 0 } = {}) {
  return dying === true && whole(steps) >= OFFER.step;
}

/**
 * **WHY THE OFFER CANNOT BE TAKEN NOW**, a key or null - judged on the presser's client
 * and again on the GM's, whose choice the price is (06 §10: *the GM decides from the
 * place rather than from a table*; the B3 review): the presser owns the character,
 * the offer still stands, and - in a fight - it is the character's own turn (*on your
 * turn*).
 *
 * @param {{owner?: boolean, stands?: boolean, inFight?: boolean, onTurn?: boolean}} o
 * @returns {string|null}
 */
export function offerRefusal({ owner = true, stands = false, inFight = false, onTurn = true } = {}) {
  if (owner !== true) return "AZEROTH.Reaction.Refuse.NotYours";
  if (stands !== true) return "AZEROTH.Spirit.Offer.Gone";
  if (inFight === true && onTurn !== true) return "AZEROTH.Spirit.Offer.NotYourTurn";
  return null;
}

/**
 * **THE OFFER TAKEN** (06 §10: *Accepting costs you the Corruption and returns you to
 * your body immediately, on your turn, standing*): the track and the price, checked
 * against the tracks the system holds and the table's three prices. Null for
 * anything else.
 *
 * @param {{track?: string, points?: number}} pick
 * @param {string[]} tracks  `AZEROTH.corruptionTracks`' keys
 * @returns {{track: string, points: number, health: 1, steps: 0}|null}
 */
export function offerTaken({ track = null, points = 0 } = {}, tracks = []) {
  const n = Math.trunc(Number(points));
  if (!(tracks ?? []).includes(track) || !OFFER.prices.includes(n)) return null;
  return { track, points: n, health: 1, steps: 0 };
}

/**
 * **WHAT A TURN IN THE SPIRIT REALM OFFERS** - read at the start of each such turn in
 * a fight: the Reach Test always, the offer where it stands.
 *
 * @param {{in?: boolean}} state  `realmStateOf`'s
 * @param {{dying?: boolean, steps?: number}} facts
 * @returns {{reach: boolean, offer: boolean}}
 */
export function realmTurnOffers(state, { dying = false, steps = 0 } = {}) {
  if (state?.in !== true) return { reach: false, offer: false };
  return { reach: true, offer: offerStands({ dying, steps }) };
}
