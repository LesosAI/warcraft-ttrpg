/**
 * **WHAT A SAND SPELL'S WORDS LAY BESIDE ITS NUMBERS** (07 §12, D-864; the lead: *"We need
 * automation and animations fully complete for everything"*). Pure: no Foundry imports
 * (CLAUDE.md §3).
 *
 * Each reader takes 07's own sentence and answers a record the cast or its card's Apply
 * carries - never a second copy of the entry. The doors are the ones that already exist:
 * the laid effect's flags (`dice/chat.mjs#applySpellEffectFromCard`), the failed Resist's
 * landing (`dice/chat.mjs`), the next-attack promise (`effects/next-attack.mjs`), the
 * extra Half-Action (`rules/extra-halves.mjs`) and the displacement door
 * (`effects/forced-movement.mjs#forceMove`'s shape for a teleport).
 */

import { computeSL } from "./resolution.mjs";

const flat = text => String(text ?? "").replace(/<[^>]*>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const CONDITION_WORDS = ["Bleeding", "Blinded", "Charmed", "Deafened", "Diseased", "Entangled", "Fatigued", "Frightened", "Numbed", "Poisoned", "Prone", "Scorched", "Silenced", "Slowed", "Stunned"];

/**
 * **THE CONDITIONS EACH TARGET CANNOT GAIN** (07 §12's Pristine Timeline: *Each target
 * cannot be Slowed, Entangled, Stunned or knocked Prone*): the laid effect's `immuneTo`
 * (`rules/legacy-uses.mjs#immunitiesFrom`), which `toggleStatusEffect` refuses at and
 * which ends with the effect. Null for any other entry.
 *
 * @param {string} effectText
 * @returns {{conditions: string[]}|null}
 */
export function targetRefuses(effectText) {
  const m = /\bEach target cannot be ([^.]+)\./.exec(flat(effectText));
  if (!m) return null;
  const conditions = CONDITION_WORDS.filter(w => new RegExp(`\\b${w}\\b`).test(m[1])).map(w => w.toLowerCase()).sort();
  return conditions.length ? { conditions } : null;
}

/**
 * **HOW LONG A FAILED RESIST'S CONDITION LASTS, WHERE THE ENTRY SAYS** (07 §12's Sand
 * Breath *Slowed until the end of its next turn*, Stutter's *Slowed and has no Reaction
 * until the end of its next turn*): `endOfNextTurn`, else null (the spell's own span).
 */
export function failSpan(effectText) {
  for (const s of flat(effectText).split(/(?<=[.!?])\s+/)) {
    if (!/\bfails?\b|\bOn a failure\b/i.test(s)) continue;
    const failing = s.split(/,? and on a success\b/i)[0];
    if (/\buntil the end of its next turn\b/.test(failing)) return "endOfNextTurn";
  }
  return null;
}

/** Stutter's *has no Reaction* on a failed Resist (07 §12): the reaction bar the Resist lays. */
export function failNoReaction(effectText) {
  return /\bfails? a (?:Body|Reflex|Spirit) Resilience Test against your Spell DC is [^.]*\bhas no Reaction\b/.test(flat(effectText));
}

/**
 * **DILATION** (07 §12, D-866): *Each time the target takes damage for the duration, it
 * takes half, rounded up, and the other half at the start of its next turn. Damage put off
 * this way is not reduced again and is never put off a second time.* The laid effect's
 * `deferral` (`rules/deferred-damage.mjs`), read at the one damage door.
 */
export function readDeferral(effectText) {
  return /\bEach time the target takes damage for the duration, it takes half, rounded up, and the other half at the start of its next turn\b/.test(flat(effectText))
    ? { share: "half", round: "up" } : null;
}

/**
 * **HOURSTRIKE** (07 §12): *Your next weapon attack this turn deals 2 more Physical damage
 * on a hit and lays Decay 1 on the creature it hits.* The promise `effects/next-attack.mjs`
 * holds to the turn and the next Attack takes: `{damage, type, decay, span: "turn"}`.
 */
export function readNextAttack(effectText) {
  const m = /\bYour next weapon attack this turn deals (\d+) more (Physical|[A-Z][a-z]+) damage on a hit(?: and lays Decay (\d+) on the creature it hits)?/.exec(flat(effectText));
  return m ? { damage: Number(m[1]), type: m[2].toLowerCase(), decay: m[3] ? Number(m[3]) : 0, span: "turn" } : null;
}

/** Hour of Haste's *Each target gains a Half-Action on its next turn* (07 §12). */
export function grantsHalfAction(effectText) {
  return /\bEach target gains a Half-Action on its next turn\b/.test(flat(effectText));
}

/**
 * **A REACTION CAST AGAINST AN ATTACK** (07 §12): Never Was' *Cast when an attack hits a
 * creature you can see. The attack deals no damage and lays nothing on the creature*
 * (`erase`), and Moment's Warning's *Cast when a creature you can see is attacked. Its
 * Defense rises by 2 against that attack* (`defense`). The incoming attack card offers each
 * to a caster who knows the spell (`data-reaction-owner`), and the press casts it.
 */
export function readAttackAnswer(effectText) {
  const t = flat(effectText);
  if (/\bCast when an attack hits a creature you can see\. The attack deals no damage and lays nothing on the creature\b/.test(t)) return { kind: "erase" };
  const m = /\bCast when a creature you can see is attacked\. Its Defense rises by (\d+) against that attack\b/.exec(t);
  if (m) return { kind: "defense", amount: Number(m[1]) };
  return null;
}

/**
 * Whether Moment's Warning's Defense turns the hit into a miss: the attack's total against
 * the Defense the card recorded, raised. 05 §2: a hit meets or beats the Defense.
 */
export function warningMisses({ total = null, defense = null, amount = 0 } = {}) {
  if (!Number.isFinite(Number(total)) || !Number.isFinite(Number(defense))) return false;
  return Number(total) < Number(defense) + (Math.trunc(Number(amount)) || 0);
}

/**
 * **WHAT A REACTION SPELL CAST AGAINST AN ATTACK DOES TO THAT ATTACK** (O-264, the 2a fix
 * stage), judged off the attack card's own record - its total and the Defense it was rolled
 * against - so the button and the press read one number:
 *
 * - Never Was (`erase`): the hit is a miss - no damage, nothing laid (`negate`).
 * - Moment's Warning (`defense`): a miss where the total falls under the Defense raised
 *   (`warningMisses`); where it still hits, the Success Level read against the raised Defense,
 *   and the damage that SL added comes off (`amount`; 05 §2's SL adds to a weapon's damage) -
 *   or nothing changes (`none`).
 *
 * @param {{kind: string, amount?: number}|null} read  `readAttackAnswer`'s
 * @param {{total?: number|null, dc?: number|null, slAdds?: boolean}} o
 * @returns {{negate: true}|{amount: number}|{none: true}|null}
 */
export function attackAnswerPlan(read, { total = null, dc = null, slAdds = true } = {}) {
  if (!read) return null;
  if (read.kind === "erase") return { negate: true };
  if (read.kind !== "defense") return null;
  if (total === null || total === undefined || dc === null || dc === undefined || !Number.isFinite(Number(total)) || !Number.isFinite(Number(dc))) return null;
  const raise = Math.trunc(Number(read.amount)) || 0;
  if (warningMisses({ total, defense: dc, amount: raise })) return { negate: true };
  const drop = slAdds ? Math.max(0, computeSL(Number(total), Number(dc)) - computeSL(Number(total), Number(dc) + raise)) : 0;
  return drop > 0 ? { amount: drop } : { none: true };
}

/** Why a reaction spell cast against an attack is refused, as `lang/en.json` keys. */
export const ATTACK_ANSWER_REFUSALS = Object.freeze({
  card: "AZEROTH.SandAnswer.NeedsCard",
  attack: "AZEROTH.SandAnswer.NotAnAttack",
  hit: "AZEROTH.Miss.NotAHit",
  withdrawn: "AZEROTH.Miss.AlreadyMissed",
  unanswered: "AZEROTH.Reaction.Refuse.Unanswered",
  gm: "AZEROTH.Card.PressNoGM"
});

/**
 * **WHETHER A REACTION SPELL MAY ANSWER THIS ROW OF THIS CARD**, judged before anything is
 * paid and again at the write: a card named, an attack's, a row the attack hit and nobody has
 * yet turned into a miss, a striker a Reaction may be taken against (door 14), and a GM online
 * where this client may write neither the card nor the creature struck. Every fact defaults
 * CLOSED, `negateRefusal`'s own rule, so a door that names none is refused.
 *
 * @param {{named?: boolean, attack?: boolean, hit?: boolean, withdrawn?: boolean, unanswered?: boolean, gmAbsent?: boolean}} o
 * @returns {string|null}
 */
export function attackAnswerRefusal({ named = false, attack = false, hit = false, withdrawn = false, unanswered = false, gmAbsent = false } = {}) {
  if (named !== true) return ATTACK_ANSWER_REFUSALS.card;
  if (attack !== true) return ATTACK_ANSWER_REFUSALS.attack;
  if (hit !== true) return ATTACK_ANSWER_REFUSALS.hit;
  if (withdrawn === true) return ATTACK_ANSWER_REFUSALS.withdrawn;
  if (unanswered === true) return ATTACK_ANSWER_REFUSALS.unanswered;
  if (gmAbsent === true) return ATTACK_ANSWER_REFUSALS.gm;
  return null;
}

/**
 * **TEMPORAL SANCTUARY** (07 §12): *While an ally is in the area it cannot gain a
 * condition, and the conditions and effects already on it do nothing and do not count
 * down. They resume when it leaves the area or the spell ends.* The lead: *"Keep Temporal
 * Sanctuary how it is."* - helpful effects are held too.
 */
export function readSanctuary(effectText) {
  return /\bWhile an ally is in the area it cannot gain a condition, and the conditions and effects already on it do nothing and do not count down\b/.test(flat(effectText))
    ? { who: "ally", feet: null } : null;
}

/** Every condition id, the list Temporal Sanctuary refuses. */
export const ALL_CONDITIONS = Object.freeze(CONDITION_WORDS.map(w => w.toLowerCase()));

/**
 * **BASTION OF HOURS' MARK** (07 §12: *each enemy within 10 feet of you takes a Bane on
 * attacks against anyone but you*): `{feet}`, the taunt aura the holder's Sustain carries.
 */
export function readTauntAura(effectText) {
  const m = /\beach enemy within (\d+) feet of you takes a Bane on attacks against anyone but you\b/.exec(flat(effectText));
  return m ? { feet: Number(m[1]) } : null;
}

/**
 * **SANDWALL** (07 §12): *A wall of whirling sand up to 30 feet long, 10 feet high and 5 feet
 * thick rises where you choose. It blocks sight* - the walls the placed line raises.
 */
export function blocksSight(effectText) {
  return /\bIt blocks sight\b/.test(flat(effectText));
}

/**
 * **DIVERT TIMEWAY** (07 §12; the lead's text): *Every casting of it after your first, in
 * your whole life, gives you 2 Fatigue that no rest removes and nothing treats, and spends
 * 1 Spirit's Tether.* `{fatigue, tether}`, the price past the first casting.
 */
export function readLifePrice(effectText) {
  const m = /\bEvery casting of it after your first, in your whole life, gives you (\d+) Fatigue that no rest removes and nothing treats, and spends (\d+) Spirit's Tether\b/.exec(flat(effectText));
  return m ? { fatigue: Number(m[1]), tether: Number(m[2]) } : null;
}

/**
 * **THE STORED FATIGUE AFTER DIVERT TIMEWAY'S PRICE** (the 2a review, M5; D-877): *gives you 2
 * Fatigue that no rest removes* is 2 Fatigue GAINED - the stored number rises by the price, to
 * no more than the track's top - while the floor rises by the same 2, so no rest takes them
 * back. A character already above the old floor gains them as well.
 */
export function lifeFatigue({ stored = 0, fatigue = 0, max = 6 } = {}) {
  const s = Math.max(0, Math.trunc(Number(stored)) || 0);
  const add = Math.max(0, Math.trunc(Number(fatigue)) || 0);
  return Math.min(Math.max(0, Math.trunc(Number(max)) || 0), s + add);
}

/** The life count's flag (the plan's `flags.azeroth-rpg.divertedTimeways`). */
export const LIFE_COUNT_FLAG = "divertedTimeways";

/**
 * What a casting of Divert Timeway costs beyond its Mana, judged BEFORE the Mana: nothing
 * the first time; the Fatigue floor and the Tether every time after. Refused where the
 * caster holds no Tether to spend (05: a Tether spent that is not there is no price paid).
 *
 * @param {{count?: number, tether?: number, price?: {fatigue: number, tether: number}|null}} o
 * @returns {{first: boolean, fatigue: number, tether: number, refused: string|null}}
 */
export function lifePriceFor({ count = 0, tether = 0, price = null } = {}) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  if (!price || n < 1) return { first: true, fatigue: 0, tether: 0, refused: null };
  const held = Math.max(0, Math.trunc(Number(tether)) || 0);
  return { first: false, fatigue: price.fatigue, tether: price.tether, refused: held < price.tether ? "noTether" : null };
}
