/**
 * **THE DEATH KNIGHT'S TWENTY-FOUR TALENTS, AS LAW** (04's Blood and Frost; the Death Knight
 * plan's Phase 5, run F4a). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Every talent's row is in `talent-effects.mjs#TALENT_EFFECTS["death-knight"]`, written against
 * 04's words; this module is the ONE reader of each row kind the twenty-four carry that no
 * other class carries, and the arithmetic the doors ask. Each reader names the door that asks
 * it (`effects/death-knight-talents.mjs` and the shared doors in `dice/`, `documents/` and
 * `effects/`), and `death-knight-talents.test.mjs` holds every number to 04 at every rank.
 *
 * - `tempHealth {on, amount, span}` - Blood Shield (`on: "deathStrike"`) and Crimson Coil
 *   (`on: "coilDealt"`, the damage the Death Coil dealt): `dkTempFor`. The shared `tempHealth`
 *   readers skip an `on` they do not know, so these are read here alone.
 * - `dk.harvest` - Grim Harvest's heal on a melee hit: `harvestFor`.
 * - `onUse.dk.regain` - Rune Tap's Health: `regainOf`.
 * - `onUse.dk.markOfBlood` - the mark Mark of Blood lays, and its heal: `markOfBloodOf`.
 * - `dk.vengeful` - Vengeful Blood's retaliation: `vengefulFor`.
 * - `onUse.dk.vampiric` - Vampiric Blood's raise on every heal: `vampiricOf`, `vampiricAdd`.
 * - `dk.tide` - Sanguine Tide at the rune door: `tideFor`.
 * - `onUse.dk.refill` - Blood Tap's refill: `refillOf`.
 * - `mod("Plague", {plagueHeals})` - Sanguine Plague, read through `class-talents.mjs
 *   #patchRowsOf`: `plagueHealsBy`.
 * - `onUse.dk.dancing` - Dancing Runeweapon's state: `dancingOf`, `dancingHeal`.
 * - `dk.frozenEdge` - Frozen Edge's Frost on a melee hit: `frozenEdgeFor`.
 * - `mod("Death Grip", {slows})` - Icy Grip: `gripSlowsBy`.
 * - `dk.coilSlows` - Chill of the Grave: `coilSlowsFor`.
 * - `mod("Plague", {feverAdds})` - Black Ice: `feverAddFor`.
 * - `dk.relentless` - Relentless Advance's Disengage bar and its Opportunity Attack's off hand:
 *   `relentlessFor`. Its rank 2 Entangled is the shared `hitLays` row (`when: "opportunity"`).
 * - `dk.killingMachine` - the Runic Power a Frost rune gives: `frostBonusFor`. Its rank 2
 *   Critical Injury is the shared `critical` row (Keen's `criticalOn`, D-662).
 * - `nextSpell {on: "frostRune"}` - Runic Frost, laid by the rune door: `runicFrostFor`.
 * - `mod("Desecration", {slows})` - Frozen Desecration: `desecrationSlowsBy`.
 * - `onUse.dk.empower` - Empower Runeweapon's judgement, whole: `empowerPlan`.
 * - `onUse.dk.icebound` - Icebound Fortitude's halving, before Armor Points and Ward:
 *   `iceboundCut` (with `mitigation.mjs#resolveDamage`'s `takenHalved`).
 * - `onUse.dk.winter` - Remorseless Winter's turn start: `winterOutcome`.
 *
 * **THE GRIP ALTERNATES** (D-1017; the lead: *"two handed should have its own effect"*, *"Build as
 * written"*). Each of the six talents that names a grip carries the OTHER grip's half as an `alt`
 * beside its own clause, inside the same row kind, read by the same reader (`dkAlt`): Blood's
 * Grim Harvest, Vengeful Blood and Dancing Runeweapon add *a one-handed weapon in each hand*;
 * Frost's Frozen Edge, Relentless Advance and Killing Machine add *a two-handed weapon, or a
 * Versatile weapon in both hands*. A gate covers only its own sentence (D-722), so the clause and
 * its `alt` each carry their own `when`.
 *
 * - `dk.harvest.alt` - Grim Harvest's Off-Hand Attack heal: `harvestFor` with `offHand`.
 * - `dk.vengeful.alt` - Vengeful Blood's riposte, the Off-Hand Attack as a Reaction:
 *   `vengefulRiposteFor`, `riposteRefusal`, `riposteDamageFor`.
 * - `onUse.dk.dancing.alt` - Dancing Runeweapon on the Off-Hand Attack, all its damage back:
 *   `dancingOf`, `dancingRolls` with `grip`, `dancingShare`.
 * - `dk.frozenEdge.alt` - Frozen Edge's first melee hit each turn Slowed, and its Frost:
 *   `frozenEdgeFor`, `frozenEdgeSlowsFor`.
 * - `dk.relentless.alt` - Relentless Advance's reach and Frost on an Opportunity Attack:
 *   `relentlessTwoHandFor`.
 * - `dk.killingMachine.alt` - Killing Machine's Runic Power and Critical Injury at SL 2:
 *   `killingMachineHitFor` (its Runic Power names `rules/runes.mjs#RUNIC_GAIN_SOURCES`'
 *   `killingMachine`).
 */

import { evaluateExpression } from "./expressions.mjs";
import { BUDGET_REFUSALS } from "./initiative.mjs";

/** The class name the rows are keyed under. */
export const DK_TALENT_CLASS = "Death Knight";

/** The flags the doors lay on the knight or a creature. */
export const DK_FLAGS = Object.freeze({
  markOfBlood: "markOfBlood",
  vampiric: "vampiricBlood",
  dancing: "dancingRuneweapon",
  icebound: "iceboundFortitude",
  winter: "remorselessWinter"
});

/** The round marks a once-a-round talent spends on the knight's combatant. */
export const DK_ROUND_MARKS = Object.freeze({
  tide: "sanguine-tide",
  runicFrost: "runic-frost",
  vengeful: "vengeful-blood",
  // Killing Machine's two-handed Runic Power, once a round (D-1017).
  killingMachine: "killing-machine",
  // Frozen Edge's two-handed Slowed, on the first melee hit each TURN: a `turnMark` stem
  // (`class-answers.mjs#turnMark`), `frozen-edge@<turn>` on the round's record (D-1017).
  frozenEdge: "frozen-edge"
});

/** The offer card Vengeful Blood's riposte is posted on (D-1017), by its `kind` flag. */
export const VENGEFUL_OFFER_KIND = "vengefulOffer";

/**
 * **A ROW'S CLAUSES, ITS GRIP ALTERNATE AFTER IT** (D-1017): the clause without its `alt`, then
 * the `alt` where one is written - each with its own `when`, read by the same reader.
 *
 * @param {object|null} row
 * @returns {object[]}
 */
export function dkAlt(row) {
  if (!row || typeof row !== "object") return [];
  const { alt, ...own } = row;
  return alt && typeof alt === "object" ? [own, alt] : [own];
}

/** A taken talent's rank, a whole number from 1; 0 where not taken. */
const rankOf = t => Math.max(0, Math.trunc(Number(t?.taken)) || 0);

/** An expression at a scope, a whole number never below nothing. */
export function dkAmount(expr, scope = {}) {
  if (typeof expr === "number") return Math.max(0, Math.trunc(expr));
  const n = evaluateExpression(String(expr ?? "0"), scope);
  return Math.max(0, Math.trunc(Number(n)) || 0);
}

/** A row's clauses at a rank: the row with every `atRank` clause the rank reached laid over it. */
export function dkAtRank(row, rank = 1) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const c of row?.atRank ?? []) {
    if ((Number(rank) || 0) >= (Number(c?.rank) || Infinity)) {
      const { rank: _r, ...rest } = c;
      Object.assign(out, rest);
    }
  }
  return out;
}

/**
 * The taken Death Knight talents whose row carries `pick(entry)`, each with its rank, sorted
 * by identifier so nothing a person reads wobbles.
 *
 * @param {Array<{className?: string, identifier: string, name?: string, taken: number}>} talents
 * @param {(entry: object) => unknown} pick
 * @param {Function} rowOf  `talent-effects.mjs#talentEffect`
 */
export function dkRows(talents = [], pick = () => null, rowOf = () => null) {
  const out = [];
  for (const t of talents ?? []) {
    const rank = rankOf(t);
    if (rank < 1) continue;
    const entry = rowOf(t.className ?? DK_TALENT_CLASS, t.identifier, t.race ?? null);
    const row = entry ? pick(entry) : null;
    if (row === null || row === undefined || row === false) continue;
    out.push({ talent: t, entry, row, rank });
  }
  return out.sort((a, b) => String(a.talent.identifier).localeCompare(String(b.talent.identifier)));
}

/* ------------------------------------------------------------------ */
/*  Blood                                                               */
/* ------------------------------------------------------------------ */

/**
 * **BLOOD SHIELD AND CRIMSON COIL** (04: *When **Death Strike** restores your Health, you gain
 * temporary Health equal to twice your rank until the end of the encounter*; *When your
 * **Death Coil** damages a creature, you gain temporary Health equal to the damage it dealt
 * until the end of the encounter*): the grants a trigger gives, at the rank. `dealt` is the
 * damage the Death Coil dealt; a grant of nothing is none.
 *
 * @param {Array} talents
 * @param {{on: "deathStrike"|"coilDealt", dealt?: number}} o
 * @returns {Array<{identifier: string, name: string, amount: number, span: string}>}
 */
export function dkTempFor(talents = [], { on, dealt = 0 } = {}, rowOf) {
  const out = [];
  for (const { talent, row, rank } of dkRows(talents, e => e.tempHealth, rowOf)) {
    if (row.on !== on) continue;
    const n = row.amount === "dealt" ? Math.max(0, Math.trunc(Number(dealt)) || 0) : dkAmount(row.amount, { rank });
    if (n > 0) out.push({ identifier: talent.identifier, name: talent.name, amount: n, span: row.span === "encounter" ? "encounter" : "longRest" });
  }
  return out;
}

/**
 * **GRIM HARVEST** (04: *While you wield a two-handed weapon, or a Versatile weapon in both
 * hands, when your melee attack hits a creature that has half its Health or less, you regain
 * 1 Health per rank*): the heal, or null where a gate fails. `gate(when)` is the attack door's
 * one predicate (`talent-gates.mjs#gateHolds` over `AzerothActor#gateFacts`); `health` the
 * creature struck's as the snapshot took it - *half or less*, so exactly half counts.
 *
 * @param {Array} talents
 * @param {{hit?: boolean, health?: {value: number, max: number}|null, gate?: (when: unknown) => boolean|null}} o
 * @returns {{identifier: string, name: string, amount: number}|null}
 */
export function harvestFor(talents = [], { hit = false, health = null, gate = () => null, offHand = false } = {}, rowOf) {
  if (!hit) return null;
  const max = Number(health?.max);
  const value = Number(health?.value);
  const known = Number.isFinite(max) && max > 0 && Number.isFinite(value);
  for (const { talent, row: whole, rank } of dkRows(talents, e => e.dk?.harvest, rowOf)) {
    for (const row of dkAlt(whole)) {
      // **THE GRIP ALTERNATE** (D-1017: *While you wield a one-handed weapon in each hand, when
      // your **Off-Hand Attack** hits a creature, you regain 1 Health per rank, or 2 Health per
      // rank if it has half its Health or less*): an Off-Hand Attack's own clause; the two-handed
      // clause is the Attack's. A creature whose Health the snapshot did not take gives the
      // lower number.
      if ((row.offHand === true) !== (offHand === true)) continue;
      if (gate(row.when ?? null) !== true) continue;
      const low = known && value <= max * (Number(row.atMost) || 0.5);
      if (row.offHand === true) {
        const amount = dkAmount(low && row.low ? row.low : (row.heal ?? "rank"), { rank });
        if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount };
        continue;
      }
      if (!low) continue;
      const amount = dkAmount(row.heal ?? "rank", { rank });
      if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount };
    }
  }
  return null;
}

/**
 * **RUNE TAP** (04: *You regain Health equal to your tier plus 2 per rank*): what a Use's
 * `onUse.dk.regain` restores, at the rank and the tier.
 */
export function regainOf(onUse, { rank = 1, tier = 1 } = {}) {
  const expr = onUse?.dk?.regain;
  return expr ? dkAmount(expr, { rank, tier }) : 0;
}

/**
 * **MARK OF BLOOD** (04: *Choose one creature within 30 feet. Each time that creature's attack
 * damages you, you regain Health equal to twice your rank after the blow, for 1 minute*): the
 * mark the Use lays at the rank - its heal and its minutes.
 */
export function markOfBloodOf(onUse, { rank = 1 } = {}) {
  const m = onUse?.dk?.markOfBlood;
  if (!m) return null;
  return { heal: dkAmount(m.heal ?? "2*rank", { rank }), minutes: Math.max(1, Math.trunc(Number(m.minutes)) || 1) };
}

/**
 * **WHAT A MARK OF BLOOD GIVES BACK FOR ONE BLOW**: the marks the knight laid on the attacker,
 * read off the attacker's effects as plain flags - the largest heal, once a blow, and only on
 * an ATTACK that damaged the knight.
 *
 * @param {Array<{by?: string, heal?: number, name?: string}>} marks  the attacker's marks
 * @param {{knightUuid: string, attack?: boolean, damaged?: number}} o
 * @returns {{heal: number, name: string}|null}
 */
export function markOfBloodHeal(marks = [], { knightUuid = null, attack = false, damaged = 0 } = {}) {
  if (!attack || !(Number(damaged) > 0) || !knightUuid) return null;
  let best = null;
  for (const m of marks ?? []) {
    if (!m || m.by !== knightUuid) continue;
    const heal = Math.max(0, Math.trunc(Number(m.heal)) || 0);
    if (heal > 0 && (!best || heal > best.heal)) best = { heal, name: String(m.name ?? "") };
  }
  return best;
}

/**
 * **VENGEFUL BLOOD** (04: *While you wield a two-handed weapon, or a Versatile weapon in both
 * hands, once a round, when a creature within your reach damages you with a melee attack, it
 * takes Shadow damage equal to your rank*): the blow back, or null where a gate fails.
 * `withinReach` is measured by the door, footprint to footprint (D-732); the round's mark is
 * the door's (`DK_ROUND_MARKS.vengeful`).
 *
 * @param {Array} talents  the knight's
 * @param {{melee?: boolean, damaged?: number, withinReach?: boolean|null, gate?: Function}} o
 * @returns {{identifier: string, name: string, amount: number, type: string}|null}
 */
export function vengefulFor(talents = [], { melee = false, damaged = 0, withinReach = null, gate = () => null } = {}, rowOf) {
  if (!melee || !(Number(damaged) > 0) || withinReach !== true) return null;
  for (const { talent, row, rank } of dkRows(talents, e => e.dk?.vengeful, rowOf)) {
    if (gate(row.when ?? null) !== true) continue;
    const amount = dkAmount(row.amount ?? "rank", { rank });
    if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount, type: row.type ?? "shadow" };
  }
  return null;
}

/**
 * **VENGEFUL BLOOD'S RIPOSTE** (04, D-1017: *While you wield a one-handed weapon in each hand, once
 * a round, when a creature within your reach damages you with a melee attack, you may make your
 * **Off-Hand Attack** for the round against it as a Reaction, and on a hit it deals additional
 * Shadow damage equal to your rank*): the offer, or null where a gate fails. The trigger is the
 * two-handed clause's (a melee blow that damaged the knight from within its reach); the grip is
 * the alternate's own `when`. Offered on a card (`effects/death-knight-talents.mjs
 * #offerVengefulRiposte`), and judged again whole at the press (`riposteRefusal`).
 *
 * @param {Array} talents  the knight's
 * @param {{melee?: boolean, damaged?: number, withinReach?: boolean|null, gate?: Function}} o
 * @returns {{identifier: string, name: string, amount: number, type: string}|null}
 */
export function vengefulRiposteFor(talents = [], { melee = false, damaged = 0, withinReach = null, gate = () => null } = {}, rowOf) {
  if (!melee || !(Number(damaged) > 0) || withinReach !== true) return null;
  for (const { talent, row, rank } of dkRows(talents, e => e.dk?.vengeful, rowOf)) {
    const alt = row.alt ?? null;
    if (alt?.riposte !== true || gate(alt.when ?? null) !== true) continue;
    const amount = dkAmount(alt.amount ?? "rank", { rank });
    if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount, type: alt.type ?? "shadow" };
  }
  return null;
}

/**
 * **THE RIPOSTE'S ADDED SHADOW** (D-1017 as O-398's A raised it: *on a hit it deals additional
 * Shadow damage equal to your rank plus 1*): the amount the riposte's card carried, read again off the knight's row at its rank so a
 * forged card buys nothing more. Null where the knight holds no riposte.
 */
export function riposteDamageFor(talents = [], rowOf) {
  for (const { talent, row, rank } of dkRows(talents, e => e.dk?.vengeful, rowOf)) {
    const alt = row.alt ?? null;
    if (alt?.riposte !== true) continue;
    const amount = dkAmount(alt.amount ?? "rank", { rank });
    if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount, type: alt.type ?? "shadow" };
  }
  return null;
}

/**
 * **WHY THE RIPOSTE IS REFUSED AT THE PRESS, OR NULL** (D-768's order, before anything is spent;
 * the D0 reading of D-1017: *not open once the round's Off-Hand Attack is made; it spends the
 * Reaction and the round's Off-Hand Attack, not a Half-Action*). Plain facts in, a lang key's
 * tail under `AZEROTH.DeathKnight.Talent.Riposte.Refuse.` out, in the order a reader would ask.
 *
 * @param {{owned?: boolean, stands?: boolean, held?: boolean, grip?: boolean, offWeapon?: boolean,
 *   attacker?: boolean, withinReach?: boolean|null, marked?: boolean, offHandLeft?: boolean, reactionLeft?: boolean}} o
 * @returns {"notYours"|"stale"|"notHeld"|"grip"|"noOffHand"|"gone"|"reach"|"marked"|"offHandSpent"|"noReaction"|null}
 */
export function riposteRefusal({ owned = false, stands = false, held = false, grip = false, offWeapon = false, attacker = false, withinReach = null, marked = false, offHandLeft = true, reactionLeft = true } = {}) {
  if (owned !== true) return "notYours";
  if (stands !== true) return "stale";
  if (held !== true) return "notHeld";
  if (grip !== true) return "grip";
  if (offWeapon !== true) return "noOffHand";
  if (attacker !== true) return "gone";
  // A distance nobody could measure (a token off the board) is the table's, as the offer was.
  if (withinReach === false) return "reach";
  if (marked === true) return "marked";
  if (offHandLeft !== true) return "offHandSpent";
  if (reactionLeft !== true) return "noReaction";
  return null;
}

/**
 * **WHAT THE TURN'S JUDGEMENT SAYS OF A RIPOSTE** (the close review's finding 8): the refusal
 * `workflows.turnBudgetRefusal(knight, "reaction", {isAttack: true, isOffHand: true})` gave - the
 * one judgement every door asks before it spends, through every bar `spendAction` asks - read into
 * `riposteRefusal`'s two budget facts, and anything else that bars the Reaction (Ice Block, a
 * sleep, a Spirit) kept whole as `barred`, so the press says it in its own words.
 *
 * @param {{reason: string, params?: object}|null} refusal
 * @returns {{offHandLeft: boolean, reactionLeft: boolean, barred: {reason: string, params?: object}|null}}
 */
export function riposteBudgetOf(refusal = null) {
  if (!refusal?.reason) return { offHandLeft: true, reactionLeft: true, barred: null };
  if (refusal.reason === BUDGET_REFUSALS.offHandSpent) return { offHandLeft: false, reactionLeft: true, barred: null };
  if (Object.values(BUDGET_REFUSALS).includes(refusal.reason)) return { offHandLeft: true, reactionLeft: false, barred: null };
  return { offHandLeft: true, reactionLeft: true, barred: refusal };
}

/**
 * **VAMPIRIC BLOOD** (04: *Each time you regain Health, you regain 1 additional Health per
 * rank, for 1 minute*): the state its Use lays, at the rank.
 */
export function vampiricOf(onUse, { rank = 1 } = {}) {
  const v = onUse?.dk?.vampiric;
  if (!v) return null;
  return { add: dkAmount(v.add ?? "rank", { rank }), minutes: Math.max(1, Math.trunc(Number(v.minutes)) || 1) };
}

/**
 * What every heal the knight takes adds while Vampiric Blood stands: the largest standing
 * state's raise (one talent, so one state; never two added together), on a heal that restores
 * something at all - *each time you regain Health*.
 *
 * @param {Array<{add?: number}>} states  the knight's standing states, as flags
 * @param {number} healed  what the heal restores before the raise
 */
export function vampiricAdd(states = [], healed = 0) {
  if (!(Number(healed) > 0)) return 0;
  return (states ?? []).reduce((m, s) => Math.max(m, Math.max(0, Math.trunc(Number(s?.add)) || 0)), 0);
}

/**
 * **SANGUINE TIDE** (04: *Once a round, when you spend a Blood rune, each enemy within 10 feet
 * of you takes Shadow damage equal to your rank. You regain 1 Health for each creature damaged
 * this way*): the tide a spend raises, or null where it spent no Blood rune or the round's
 * mark is already spent. The rune door asks it after the write.
 *
 * @param {Array} talents
 * @param {{spent?: Array<{kind: string}>, marked?: boolean}} o
 * @returns {{identifier: string, name: string, amount: number, type: string, feet: number, regain: number}|null}
 */
export function tideFor(talents = [], { spent = [], marked = false } = {}, rowOf) {
  if (marked || !(spent ?? []).some(r => r?.kind === "blood")) return null;
  for (const { talent, row, rank } of dkRows(talents, e => e.dk?.tide, rowOf)) {
    const amount = dkAmount(row.amount ?? "rank", { rank });
    if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount, type: row.type ?? "shadow", feet: Number(row.feet) || 10, regain: Math.max(0, Math.trunc(Number(row.regain ?? 1)) || 0) };
  }
  return null;
}

/**
 * **BLOOD TAP** (04: *refill a number of your spent Blood runes equal to your rank*): the
 * refill a Use's `onUse.dk.refill` makes at the rank.
 */
export function refillOf(onUse, { rank = 1 } = {}) {
  const r = onUse?.dk?.refill;
  if (!r) return null;
  return { kind: r.kind === "frost" ? "frost" : "blood", count: dkAmount(r.count ?? "rank", { rank }) };
}

/**
 * **SANGUINE PLAGUE** (04: *When your **Blood Plague** damages a creature, you immediately
 * regain Health equal to the damage it dealt*): the talent whose Plague patch says so, read
 * through the patch (`class-talents.mjs#patchRowsOf`), or null.
 *
 * @param {Array<{talent: object, patch: object}>} patches  `patchRowsOf(talents, "Plague")`
 */
export function plagueHealsBy(patches = []) {
  const hit = (patches ?? []).find(p => p?.patch?.plagueHeals === "dealt");
  return hit ? hit.talent.name : null;
}

/**
 * **DANCING RUNEWEAPON** (04: *fights beside you for three rounds. When you make an Attack, the
 * Dancing Runeweapon makes one more attack roll against the same creature as part of the same
 * Attack. You regain Health equal to half the damage the Dancing Runeweapon deals, rounded
 * down*): the state its Use lays.
 */
export function dancingOf(onUse) {
  const d = onUse?.dk?.dancing;
  if (!d) return null;
  // **AND THE OFF-HAND GRIP'S SHARE** (D-1017: *you regain Health equal to the damage the Dancing
  // Runeweapon deals*): the whole of it.
  // A row without the alternate gives none (the census's break test), and a state laid with none
  // heals the whole (`effects/death-knight-talents.mjs#dancingOn`).
  return { rounds: Math.max(1, Math.trunc(Number(d.rounds)) || 3), heal: shareOf(d.heal, 0.5), offHandHeal: d.alt ? shareOf(d.alt.heal, 1) : null };
}

/** A share of the damage, from above nothing to the whole, else the default. */
function shareOf(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : fallback;
}

/**
 * **THE GRIP A DANCING RUNEWEAPON ROLL IS MADE IN** (D-1017): the two-handed grip's roll rides the
 * Attack, the off-hand grip's rides the Off-Hand Attack, and a knight holding neither grip takes
 * no roll - each sentence opens on its own gate. Read off the knight's wield facts.
 *
 * @param {{bothHands?: boolean, oneInEach?: boolean}|null} wield
 * @returns {"bothHands"|"oneInEach"|null}
 */
export function dancingGrip(wield = null) {
  if (wield?.bothHands === true) return "bothHands";
  if (wield?.oneInEach === true) return "oneInEach";
  return null;
}

/** The share a Dancing Runeweapon roll heals in a grip: half in two hands, the whole in two one-handers. */
export function dancingShare(state = null, grip = "bothHands") {
  return grip === "oneInEach" ? shareOf(state?.offHandHeal, 1) : shareOf(state?.heal, 0.5);
}

/**
 * **WHAT A CARD'S ROW CAN HAVE DEALT** (the F4a review, S4): the GM's handler takes a heal or a
 * shield off a blow the asker reports, and never more than the card it came from recorded - the
 * row's own `damage` (a passed Test's half is less). A row withdrawn (a Parry, a miss) dealt
 * nothing. Read off the message's flags on the GM's client, never off the payload.
 *
 * @param {object} flags  the card's `flags.azeroth-rpg`
 * @param {number} index  the target's row
 * @returns {number}
 */
export function cardRowCeiling(flags = {}, index = 0) {
  const i = Math.trunc(Number(index));
  const row = Number.isInteger(i) && i >= 0 ? (flags?.damageByTarget?.[i] ?? null) : null;
  if (!row || typeof row !== "object" || row.withdrawn === true) return 0;
  return Math.max(0, Math.trunc(Number(row.damage)) || 0);
}

/**
 * **WHETHER A CARD BUYS RELENTLESS ADVANCE'S SPEED 0 ON A CREATURE** (04 at rank 2: *when your
 * Opportunity Attack hits, the creature's Speed is 0 until the end of its turn*; the lead, D-988:
 * *"Speed 0"*; the F4b review, S3). The GM's handler reads the knight's own attack card off the
 * world, never the payload: an attack (no Parry, no retaliation), marked an Opportunity Attack,
 * spoken by the knight, its row naming the creature, and a hit on that row (a row in
 * `damageByTarget` that no Parry or miss withdrew); and one Speed 0 a card row. A lang key's tail
 * under `AZEROTH.DeathKnight.Talent.SpeedZeroRefuse.`, or null.
 *
 * @param {{flags?: object, index?: number, knightSpoke?: boolean, victimNamed?: boolean, claimed?: boolean}} o
 * @returns {"card"|"notOpportunity"|"notKnight"|"notVictim"|"miss"|"claimed"|null}
 */
export function speedZeroCardRefusal({ flags = null, index = 0, knightSpoke = false, victimNamed = false, claimed = false } = {}) {
  const f = flags ?? {};
  if (f.kind !== "attack" || f.parry || f.notAttack || f.retaliation) return "card";
  if (f.opportunity !== true) return "notOpportunity";
  if (knightSpoke !== true) return "notKnight";
  const i = Math.trunc(Number(index));
  if (!Number.isInteger(i) || i < 0 || !f.targets?.[i] || victimNamed !== true) return "notVictim";
  const row = f.damageByTarget?.[i] ?? null;
  if (!row || typeof row !== "object" || row.withdrawn === true) return "miss";
  if (claimed === true) return "claimed";
  return null;
}

/** The card flag Relentless Advance's Speed 0 is claimed under, by row (the F4b review, S3). */
export const SPEED_ZERO_CLAIM = "speedZeroLaid";

/** An amount the asker reports, clamped to the card's row: a whole number from 0 to the ceiling. */
export function clampToCard(amount = 0, flags = {}, index = 0) {
  return Math.min(Math.max(0, Math.trunc(Number(amount)) || 0), cardRowCeiling(flags, index));
}

/** The Health a Dancing Runeweapon's blow gives back: half the damage it dealt, rounded down. */
export function dancingHeal(dealt = 0, share = 0.5) {
  // Never more than the whole of it (D-1017's off-hand grip heals all it deals), whatever a card says.
  return Math.max(0, Math.floor((Math.max(0, Math.trunc(Number(dealt)) || 0)) * shareOf(share, 0.5)));
}

/**
 * Whether an attack takes the Dancing Runeweapon's roll: the state stands, the attack struck one
 * creature, and it is no Parry, no Opportunity Attack and not the Dancing Runeweapon's own roll.
 *
 * - **In two hands** (the grip the Use first named): an Attack's FIRST roll - never Extra Attack's
 *   second (`budget: "none"`) and never an off-hand blow.
 * - **In two one-handers** (D-1017: *when you make your **Off-Hand Attack**, the Dancing
 *   Runeweapon makes one more attack roll against the same creature as part of it*): the
 *   Off-Hand Attack, never an Attack's roll - Vengeful Blood's riposte among them, since it is
 *   *your Off-Hand Attack for the round* (MY READING) - and never a blow somebody else paid for.
 * - **In neither**: none.
 *
 * @param {{standing?: boolean, kind?: string, parry?: boolean, budget?: string|null, opportunity?: boolean, offHand?: boolean, dancing?: boolean, targets?: number, grip?: string|null}} o
 */
export function dancingRolls({ standing = false, kind = "attack", parry = false, budget = null, opportunity = false, offHand = false, dancing = false, targets = 0, grip = "bothHands" } = {}) {
  if (!(standing === true && kind === "attack" && !parry && budget !== "none" && !opportunity && !dancing && Number(targets) === 1)) return false;
  if (grip === "bothHands") return !offHand;
  if (grip === "oneInEach") return offHand === true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Frost                                                               */
/* ------------------------------------------------------------------ */

/**
 * **FROZEN EDGE'S SECOND SENTENCE** (04: *While you wield a one-handed weapon in each hand, your
 * melee hits against a **Slowed** creature deal 1 additional Frost damage per rank*): the Frost
 * a hit adds as its own amount (D-777's extras, met by the target's Frost Ward), or null.
 *
 * @param {Array} talents
 * @param {{hit?: boolean, gate?: Function}} o
 * @returns {{identifier: string, name: string, amount: number, type: string}|null}
 */
export function frozenEdgeFor(talents = [], { hit = false, gate = () => null } = {}, rowOf) {
  if (!hit) return null;
  for (const { talent, row: whole, rank } of dkRows(talents, e => e.dk?.frozenEdge, rowOf)) {
    // And the two-handed grip's own sentence (D-1017: *your melee hits against a Slowed creature
    // deal 1 additional Frost damage per rank*), the same amount behind its own gate.
    for (const row of dkAlt(whole)) {
      if (gate(row.when ?? null) !== true) continue;
      const amount = dkAmount(row.amount ?? "rank", { rank });
      if (amount > 0) return { identifier: talent.identifier, name: talent.name, amount, type: row.type ?? "frost" };
    }
  }
  return null;
}

/**
 * **A TURN-KEYED SPAN THAT ENDS OUT OF A FIGHT TOO** (D-778; the close review's finding 2): 04's
 * *until the end of its next turn* and *until its next turn*, as the condition door's words that
 * fall back to one round of the world's clock where no fight has started
 * (`effects/durations.mjs#untilEndOfNextTurnOrRound`). A bare `endOfNextTurn` lays a Slowed with
 * no duration out of a fight, which never ends. Every other span passes through as it is.
 *
 * @param {string|null} until
 * @returns {string|null}
 */
export function orRound(until) {
  if (until === "endOfNextTurn") return "endOfNextTurnOrRound";
  if (until === "nextTurn") return "nextTurnOrRound";
  return until ?? null;
}

/**
 * **FROZEN EDGE'S TWO-HANDED SLOWED** (04, D-1017: *While you wield a two-handed weapon, or a
 * Versatile weapon in both hands, your first melee hit each turn makes the creature Slowed until
 * the end of its next turn*): the condition and its span, or null where the hit is no melee hit,
 * the gate fails, or this turn's mark is already spent (`marked`). The door marks the turn
 * (`DK_ROUND_MARKS.frozenEdge`) through the combatant's queued door and lands it through the one
 * condition door. The hit that Slows a creature is not itself a hit on a Slowed creature: the gate
 * reads the creature as the attack found it (MY READING).
 *
 * @param {Array} talents
 * @param {{hit?: boolean, gate?: Function, marked?: boolean}} o
 * @returns {{identifier: string, name: string, condition: string, until: string}|null}
 */
export function frozenEdgeSlowsFor(talents = [], { hit = false, gate = () => null, marked = false } = {}, rowOf) {
  if (!hit || marked) return null;
  for (const { talent, row } of dkRows(talents, e => e.dk?.frozenEdge, rowOf)) {
    const slows = row.alt?.slows ?? null;
    if (!slows?.condition || gate(slows.when ?? null) !== true) continue;
    return { identifier: talent.identifier, name: talent.name, condition: slows.condition, until: orRound(slows.until ?? "endOfNextTurn") };
  }
  return null;
}

/**
 * **ICY GRIP AND FROZEN DESECRATION** (04: *A creature you pull with **Death Grip** is **Slowed**
 * until the end of its next turn*; *An enemy that starts its turn in your **Desecration** is
 * **Slowed** until the end of its turn*): the condition a feature's patch lays, and the talent,
 * read through the patch, or null.
 *
 * @param {Array<{talent: object, patch: object}>} patches  `patchRowsOf(talents, feature)`
 * @returns {{name: string, condition: string, until: string}|null}
 */
export function patchSlows(patches = []) {
  const hit = (patches ?? []).find(p => p?.patch?.slows?.condition);
  return hit ? { name: hit.talent.name, condition: hit.patch.slows.condition, until: orRound(hit.patch.slows.until ?? "endOfNextTurn") } : null;
}

/** Icy Grip's Slowed on a creature Death Grip pulled. */
export const gripSlowsBy = patchSlows;
/** Frozen Desecration's Slowed on an enemy starting its turn in the Desecration. */
export const desecrationSlowsBy = patchSlows;

/**
 * **CHILL OF THE GRAVE** (04: *A creature your **Death Coil** damages is **Slowed** until the
 * end of its next turn*): the condition, or null.
 */
export function coilSlowsFor(talents = [], rowOf) {
  const [first] = dkRows(talents, e => e.dk?.coilSlows, rowOf);
  return first ? { name: first.talent.name, condition: first.row.condition ?? "slowed", until: orRound(first.row.until ?? "endOfNextTurn") } : null;
}

/**
 * **BLACK ICE** (04: *Your **Frost Fever** deals 1 additional Frost damage per rank*): what the
 * Fever adds to its tick, read through the patch at the rank.
 *
 * @param {Array<{talent: object, patch: object, rank: number}>} patches  `patchRowsOf(talents, "Plague")`
 */
export function feverAddFor(patches = []) {
  let add = 0;
  const by = [];
  for (const p of patches ?? []) {
    if (p?.patch?.feverAdds === undefined) continue;
    const n = dkAmount(p.patch.feverAdds, { rank: p.rank ?? 1 });
    if (n > 0) {
      add += n;
      by.push(p.talent.name);
    }
  }
  return { add, by };
}

/**
 * **RELENTLESS ADVANCE** (04: *A **Slowed** creature within your reach cannot **Disengage**. ...
 * At rank 2, while you wield a one-handed weapon in each hand, your Opportunity Attack includes
 * your **Off-Hand Attack***): the bar and, where the rank and the gate hold, the off hand.
 *
 * @param {Array} talents
 * @param {{gate?: Function}} o
 * @returns {{identifier: string, name: string, noDisengage: boolean, offHand: boolean}|null}
 */
export function relentlessFor(talents = [], { gate = () => null } = {}, rowOf) {
  const [first] = dkRows(talents, e => e.dk?.relentless, rowOf);
  if (!first) return null;
  const r = dkAtRank(first.row, first.rank);
  return {
    identifier: first.talent.identifier, name: first.talent.name,
    noDisengage: r.noDisengage === true,
    offHand: r.offHand === true && gate(r.when ?? null) === true
  };
}

/**
 * **RELENTLESS ADVANCE IN TWO HANDS** (04 at rank 2, D-1017: *while you wield a two-handed weapon,
 * or a Versatile weapon in both hands, your Opportunity Attacks reach 5 feet further and deal
 * additional Frost damage equal to your tier*): the feet an Opportunity Attack's reach gains -
 * read where one is offered (`AzerothCombatant#opportunities`) and where it is struck (the attack
 * door's band) - and the Frost its hit adds, or null below rank 2 or where the gate fails.
 *
 * @param {Array} talents
 * @param {{gate?: Function, tier?: number}} o
 * @returns {{identifier: string, name: string, reach: number, damage: number, type: string}|null}
 */
export function relentlessTwoHandFor(talents = [], { gate = () => null, tier = 1 } = {}, rowOf) {
  const [first] = dkRows(talents, e => e.dk?.relentless, rowOf);
  if (!first?.row?.alt) return null;
  const r = dkAtRank(first.row.alt, first.rank);
  if (gate(r.when ?? null) !== true) return null;
  const reach = Math.max(0, Math.trunc(Number(r.reach)) || 0);
  const damage = r.damage === undefined || r.damage === null ? 0 : dkAmount(r.damage, { rank: first.rank, tier: Math.max(1, Math.trunc(Number(tier)) || 1) });
  if (!reach && !damage) return null;
  return { identifier: first.talent.identifier, name: first.talent.name, reach, damage, type: r.type ?? "frost" };
}

/**
 * **WHETHER A SLOWED CREATURE MAY DISENGAGE** (Relentless Advance's first sentence): the first
 * knight who bars it, or null. Plain rows in: each knight's name, whether it holds the bar,
 * and whether the creature stands within its reach.
 *
 * @param {{slowed?: boolean, knights?: Array<{name: string, bars: boolean, withinReach: boolean|null}>}} o
 */
export function disengageBarredByKnight({ slowed = false, knights = [] } = {}) {
  if (!slowed) return null;
  return (knights ?? []).find(k => k?.bars === true && k.withinReach === true) ?? null;
}

/**
 * **KILLING MACHINE'S FIRST SENTENCE** (04: *While you wield a one-handed weapon in each hand,
 * each Frost rune you spend gives 1 additional Runic Power per rank*): what each FROST rune
 * spent adds at the one rune door (`rules/runes.mjs#spendRunes`' `frostBonus`), or 0.
 */
export function frostBonusFor(talents = [], { gate = () => null } = {}, rowOf) {
  let n = 0;
  for (const { row, rank } of dkRows(talents, e => e.dk?.killingMachine, rowOf)) {
    if (gate(row.when ?? null) !== true) continue;
    n += dkAmount(row.frostBonus ?? "rank", { rank });
  }
  return n;
}

/**
 * **KILLING MACHINE IN TWO HANDS** (04, D-1017 as O-398's C raised it: *While you wield a two-handed
 * weapon, or a Versatile weapon in both hands, once a round, your melee hit at SL 2 or more gives
 * you 1 Runic Power per rank. At rank 2, while you wield a two-handed weapon, or a Versatile weapon
 * in both hands, your melee hit on a Slowed creature at SL 2 or more inflicts a Critical Injury*):
 * what such a hit gives - the Runic Power where the round's mark is free (`marked`), on any
 * creature, and the Critical Injury at rank 2 on every such hit on a Slowed creature, the round's
 * mark or not, under its own gate (`critical.when`) - or null where the hit is not one. The Runic Power rises through the pool door naming `killingMachine`
 * (`rules/runes.mjs#RUNIC_GAIN_SOURCES`): 02's *unless a feature or talent says so*.
 *
 * @param {Array} talents
 * @param {{hit?: boolean, sl?: number, gate?: Function, marked?: boolean}} o
 * @returns {{identifier: string, name: string, gain: number, critical: boolean}|null}
 */
export function killingMachineHitFor(talents = [], { hit = false, sl = 0, gate = () => null, marked = false } = {}, rowOf) {
  if (!hit) return null;
  for (const { talent, row, rank } of dkRows(talents, e => e.dk?.killingMachine, rowOf)) {
    if (!row.alt) continue;
    const r = dkAtRank(row.alt, rank);
    if ((Math.trunc(Number(sl)) || 0) < (Math.trunc(Number(r.sl)) || 2)) continue;
    if (gate(r.when ?? null) !== true) continue;
    const gain = marked ? 0 : dkAmount(r.gain ?? "rank", { rank });
    // The rank 2 sentence carries its own gate (the Slowed creature, MY READING of O-398's C).
    const critical = r.critical === true || (Boolean(r.critical?.when) && gate(r.critical.when) === true);
    if (gain > 0 || critical) return { identifier: talent.identifier, name: talent.name, gain, critical };
  }
  return null;
}

/**
 * **RUNIC FROST** (04: *Once a round, when you spend a Frost rune, the next Frost spell you cast
 * before the end of your turn costs 2 less Runic Power*): the next spell's entry the rune door
 * lays, or null where it spent no Frost rune or the round's mark is spent.
 *
 * @param {Array} talents
 * @param {{spent?: Array<{kind: string}>, marked?: boolean}} o
 * @returns {{source: string, name: string, amount: number, schools: string[], turn: boolean}|null}
 */
export function runicFrostFor(talents = [], { spent = [], marked = false } = {}, rowOf) {
  if (marked || !(spent ?? []).some(r => r?.kind === "frost")) return null;
  for (const { talent, row, rank } of dkRows(talents, e => (e.nextSpell?.on === "frostRune" ? e.nextSpell : null), rowOf)) {
    const amount = dkAmount(row.amount ?? 2, { rank });
    if (amount > 0) return { source: talent.identifier, name: talent.name, amount, schools: [...(row.schools ?? [])], turn: row.turn === true };
  }
  return null;
}

/**
 * **EMPOWER RUNEWEAPON, JUDGED WHOLE** (04: *end every **Frost Fever** you laid on creatures
 * within 15 feet of you. Refill 1 spent Frost rune for each Frost Fever you end. You refill no
 * more runes than the rune slots of the weapons you wield. At rank 2, the radius is 30 feet*):
 * the Fevers it ends and the runes it refills, or a refusal - before anything is paid.
 *
 * @param {{fevers?: Array<{id: string, feet: number|null}>, feet?: number, spentFrost?: number, slots?: number}} o
 * @returns {{ends: string[], refill: number, refusal: string|null}}
 */
export function empowerPlan({ fevers = [], feet = 15, spentFrost = 0, slots = 0 } = {}) {
  const ends = (fevers ?? []).filter(f => typeof f?.id === "string" && typeof f.feet === "number" && Number.isFinite(f.feet) && f.feet <= feet + 1e-6).map(f => f.id).sort();
  if (!ends.length) return { ends: [], refill: 0, refusal: "noFever" };
  const refill = Math.max(0, Math.min(ends.length, Math.trunc(Number(spentFrost)) || 0, Math.trunc(Number(slots)) || 0));
  return { ends, refill, refusal: null };
}

/** Empower Runeweapon's radius at the rank (15 feet, 30 at rank 2). */
export function empowerFeet(onUse, { rank = 1 } = {}) {
  const e = onUse?.dk?.empower;
  if (!e) return null;
  return Math.max(0, Math.trunc(Number(dkAtRank(e, rank).feet)) || 15);
}

/**
 * **ICEBOUND FORTITUDE'S CUT** (04: *That blow, and each blow until the end of your next turn,
 * deals half its damage to you, rounded down, before Armor Points and Ward apply*; the lead:
 * *"before AP or ward"*): what the halving takes off a blow that already arrived. Where the
 * card recorded the resolver's inputs (`rules/damage-record.mjs`) and the record still resolves
 * to the amount arriving (`recordDescribes`: no Block, Parry mark or share moved it), the blow is resolved again
 * with the halving BEFORE Armor Points and Ward and the cut is the difference - so 12 damage
 * against Armor Points 6 deals 0, not 3; with no record (a tick, an area) the arrived damage
 * is halved, rounded down.
 *
 * @param {{amount: number, input?: object|null, resolve?: Function}} o  `resolve` is
 *   `mitigation.mjs#resolveDamage`, handed in so this module stays free of it
 * @returns {number}  what comes off, never more than the blow
 */
export function iceboundCut({ amount = 0, input = null, resolve = null } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!n) return 0;
  if (recordDescribes({ amount: n, input, resolve })) {
    const whole = Math.max(0, Math.trunc(Number(resolve({ ...input }).damage)) || 0);
    const halved = Math.max(0, Math.trunc(Number(resolve({ ...input, takenHalved: true }).damage)) || 0);
    return Math.max(0, Math.min(n, whole - halved));
  }
  return n - Math.floor(n / 2);
}

/**
 * **WHETHER THE CARD'S RECORD STILL DESCRIBES THE BLOW** (the F4b review, S2): the record is the
 * blow as the card resolved it, and a Block's 4 or a Parry's mark, or a Shared Burden holder's
 * share, changes the amount that arrives without changing the record. Re-resolving the record then
 * halves a blow that is not this one: 20 halved to 10 took 10 off a kept 10 and the knight took
 * nothing. So the record is read only where it resolves to exactly the amount arriving; anywhere
 * else the arrived amount is halved, rounded down.
 *
 * @param {{amount: number, input?: object|null, resolve?: Function}} o
 * @returns {boolean}
 */
export function recordDescribes({ amount = 0, input = null, resolve = null } = {}) {
  if (!input || typeof input !== "object" || typeof resolve !== "function") return false;
  const whole = Math.max(0, Math.trunc(Number(resolve({ ...input })?.damage)) || 0);
  return whole === Math.max(0, Math.trunc(Number(amount)) || 0);
}

/**
 * **ICEBOUND FORTITUDE'S BLOW, WHOLE** (the F4a review, S1): the cut, and the blow's second
 * amounts and Ward credit AFTER it, so the readers downstream of the halving (Ethereal Form,
 * Atonement, a Legendary's after-blow) never see the unhalved extras. With a record the halved
 * resolution's own `parts` and `wardTook` are the blow's; without one each second amount is
 * halved, rounded down (a sum of floors never exceeds the halved whole), and the Ward's credit
 * stands, since the Ward met the blow before the halving.
 *
 * @param {{amount: number, input?: object|null, resolve?: Function, parts?: Array|null, wardTook?: number}} o
 * @returns {{cut: number, parts: Array|null, wardTook: number}}
 */
export function iceboundBlow({ amount = 0, input = null, resolve = null, parts = null, wardTook = 0 } = {}) {
  const cut = iceboundCut({ amount, input, resolve });
  const took = Math.max(0, Math.trunc(Number(wardTook)) || 0);
  if (!cut) return { cut: 0, parts, wardTook: took };
  if (recordDescribes({ amount, input, resolve })) {
    const halved = resolve({ ...input, takenHalved: true }) ?? {};
    return { cut, parts: Array.isArray(halved.parts) ? halved.parts : parts,
      wardTook: Math.max(0, Math.trunc(Number(halved.wardTook)) || 0) };
  }
  const halvedParts = Array.isArray(parts)
    ? parts.map(p => (p && typeof p === "object" ? { ...p, damage: Math.floor((Math.max(0, Math.trunc(Number(p.damage)) || 0)) / 2) } : p))
    : parts;
  return { cut, parts: halvedParts, wardTook: took };
}

/**
 * **REMORSELESS WINTER AT A TURN'S START** (04: *An enemy that starts its turn inside the winter
 * takes Frost damage equal to your tier and is **Slowed** until the end of its turn. An enemy
 * that is already Slowed when it starts its turn inside the winter makes a Body Resilience Test
 * against your Spell DC instead. On a failure it is **Entangled** until the end of its turn*):
 * what one enemy's turn start lays. **The lead's ruling on O-356** (run F4b, D-986): *"Keeps the
 * damage."* Every enemy that starts its turn inside takes the Frost damage; an enemy already
 * Slowed ALSO makes the Body Resilience Test, a failure Entangling it until the end of its turn.
 * An enemy already Slowed is not Slowed again here: laying the turn's Slowed over it would cut a
 * longer Slowed (Chains of Ice's minute) down to this turn.
 *
 * @param {{enemy?: boolean, inside?: boolean, slowed?: boolean, tier?: number}} o
 * @returns {{damage: number, slow: boolean, test: boolean}|null}
 */
export function winterOutcome({ enemy = false, inside = false, slowed = false, tier = 1 } = {}) {
  if (!enemy || !inside) return null;
  const damage = Math.max(1, Math.trunc(Number(tier)) || 1);
  if (slowed) return { damage, slow: false, test: true };
  return { damage, slow: true, test: false };
}

/** The winter's state its Use lays: the radius and the rounds. */
export function winterOf(onUse) {
  const w = onUse?.dk?.winter;
  if (!w) return null;
  return { feet: Math.max(1, Math.trunc(Number(w.feet)) || 15), rounds: Math.max(1, Math.trunc(Number(w.rounds)) || 3) };
}
