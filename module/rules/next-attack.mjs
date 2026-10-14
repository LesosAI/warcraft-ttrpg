/**
 * **WHAT THE NEXT ATTACK WAS PROMISED** (04-TALENTS; D-772). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * Three talents promise something to *your next attack* and nothing carried
 * it, so each printed its sentence and the blow it named never saw it:
 *
 * - **Precise Strike** (Warrior, Arms): *As a Half-Action, spend 4 Rage. Your
 *   next attack this turn ignores 1 Armor Point per rank* - `penetration`,
 *   held to the TURN the Use was made in;
 * - **Follow Through** (Warrior, Arms): *When an attack or effect of yours
 *   reduces a target to 0 Health, your next attack this round gains a Boon* -
 *   `boons`, held to the ROUND;
 * - **Vengeance** (Paladin, Retribution): *When a friendly target within 20
 *   feet drops to 0 Health, your next attack this encounter adds your tier per
 *   rank to its damage* - `damage`, held to the FIGHT.
 *
 * The shape is Nature's Grace's (`casting.mjs#pendingNextSpell`, D-771): the
 * attacker's own flag, a list of entries merged by the talent that laid them -
 * a second laying REPLACES the first rather than stacking - read at the attack
 * door and TAKEN by the next attack: every entry it read, and ONLY those
 * (`afterTake`, the architect's review), so a promise laid while its dialog
 * stood open waits for the attack after.
 *
 * **A SECOND "NEXT ATTACK" LANE BESIDE THE RIDERS' PRIMED MARK, ON PURPOSE**:
 * a primed rider (D-770's Feral Charge paid before the blow) lives on the
 * combatant's round record and dies with the turn, while these hold to a turn,
 * a round or the whole encounter, and the round record is cleared every turn.
 *
 * **Out of a fight there is no turn, round or encounter to hold one to**, so
 * nothing is laid there (MY READING, for the lead: D-771's *that turn* rule for
 * Predator's Swiftness, carried to the three spans), and an entry whose fight,
 * round or turn has gone lapses unspent.
 *
 * **ONE ATTACK TAKES IT** (MY READING, for the lead): Extra Attack is one
 * Attack with two rolls (D-704) and the first roll takes the promise, as a
 * rider is paid with the first roll and the second carries none (D-770). A
 * Parry is not an attack (06 §6) and takes nothing; an Opportunity Attack and a
 * Riposte are attacks and do.
 */

/** The actor flag the promises stand under. */
export const NEXT_ATTACK_FLAG = "nextAttack";

/** How long a promise may wait for its attack. */
export const NEXT_ATTACK_LASTS = Object.freeze(["turn", "round", "encounter"]);

/** A whole number at or above nothing. */
const count = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * One promise as it is laid, or null where it promises nothing or there is no
 * fight to hold it to.
 *
 * @param {{source: string, name?: string, boons?: number, penetration?: number, damage?: number, lasts?: string}} grant
 * @param {{combat: string, round: number, combatant: string}|null} now  the
 *   fight as it stands (`AzerothActor#fightTurnNow`)
 * @returns {{source: string, name: string, boons: number, penetration: number, damage: number,
 *   lasts: string, at: {combat: string, round: number, combatant: string}}|null}
 */
export function nextAttackEntry(grant = {}, now = null) {
  if (!grant?.source || !NEXT_ATTACK_LASTS.includes(grant.lasts)) return null;
  if (!now?.combat) return null;
  const entry = {
    source: String(grant.source),
    name: String(grant.name ?? ""),
    boons: count(grant.boons),
    penetration: count(grant.penetration),
    damage: count(grant.damage),
    lasts: grant.lasts,
    at: { combat: String(now.combat), round: Math.trunc(Number(now.round)) || 0, combatant: String(now.combatant ?? "") }
  };
  return entry.boons || entry.penetration || entry.damage ? entry : null;
}

/**
 * The flag after laying new promises: one entry a source, the new replacing the
 * old, in a stable order (by source) because the dialog lists them.
 *
 * @param {Array<object>} held
 * @param {Array<object>} laid  `nextAttackEntry`'s, nulls dropped by the caller or here
 * @returns {Array<object>}
 */
export function mergeNextAttack(held = [], laid = []) {
  const fresh = (laid ?? []).filter(e => e && typeof e === "object" && e.source);
  const sources = new Set(fresh.map(e => e.source));
  return [...(held ?? []).filter(e => e && typeof e === "object" && !sources.has(e.source)), ...fresh]
    .sort((a, b) => String(a.source).localeCompare(String(b.source)));
}

/**
 * Whether one promise still stands, against the fight as it is NOW.
 *
 * - `turn`: the same fight, the same round and the same creature's turn;
 * - `round`: the same fight and the same round;
 * - `encounter`: the same fight.
 *
 * @param {object} entry
 * @param {{combat: string, round: number, combatant: string}|null} now
 */
export function nextAttackStands(entry, now = null) {
  const at = entry?.at ?? null;
  if (!at || !now?.combat || now.combat !== at.combat) return false;
  if (entry.lasts === "encounter") return true;
  if (now.round !== at.round) return false;
  if (entry.lasts === "round") return true;
  if (entry.lasts === "turn") return now.combatant === at.combatant;
  return false;
}

/**
 * **WHAT THE NEXT ATTACK TAKES, AS IT STANDS NOW**: the Boons, the Armor
 * Points ignored and the damage added by every promise that still stands, each
 * by name, and the ones that have lapsed - which the taking write sweeps with
 * the rest.
 *
 * @param {Array<object>} entries  the flag
 * @param {{now?: object|null}} [o]
 * @returns {{boons: number, penetration: number, damage: number, live: object[], lapsed: object[]}}
 */
export function pendingNextAttack(entries = [], { now = null } = {}) {
  const live = [];
  const lapsed = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e !== "object" || !(count(e.boons) || count(e.penetration) || count(e.damage))) {
      lapsed.push(e);
      continue;
    }
    if (nextAttackStands(e, now)) live.push(e);
    else lapsed.push(e);
  }
  const sum = key => live.reduce((n, e) => n + count(e[key]), 0);
  return { boons: sum("boons"), penetration: sum("penetration"), damage: sum("damage"), live, lapsed };
}

/**
 * **WHAT A TAKE LEAVES ON THE FLAG** (the architect's review of D-772): the flag
 * as it stands AT THE WRITE, less the entries the attack read - its live ones
 * and its lapsed ones - matched on their source and the stamp they were laid
 * with. A promise laid while the attack's dialog stood open (a Follow Through or
 * a Vengeance landed from another card) carries a source or a stamp the attack
 * never read, and stays. An entry that is not an object or names no source can
 * promise nothing and is swept either way.
 *
 * @param {Array<object>} held   the flag, read again at the write
 * @param {Array<object>} taken  `pendingNextAttack`'s `live` and `lapsed`
 * @returns {Array<object>}
 */
export function afterTake(held = [], taken = []) {
  const key = e => (e && typeof e === "object" && e.source
    ? JSON.stringify([String(e.source), e.at?.combat ?? null, e.at?.round ?? null, e.at?.combatant ?? null])
    : null);
  const gone = new Set((taken ?? []).map(key).filter(Boolean));
  return (Array.isArray(held) ? held : []).filter(e => {
    const k = key(e);
    return k !== null && !gone.has(k);
  });
}
