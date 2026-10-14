/**
 * **SYMBIOSIS** (04-TALENTS, the Druid's Restoration branch; D-771). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * *After a Long Rest, name a friendly target. Whenever either of you restores
 * Health, the other restores half as much, rounded down. While the two of you
 * are within 30 feet of one another, each of you gains a Boon on a Skill Test
 * in which the other holds the higher Skill Rank. The bond lasts until your
 * next Long Rest.*
 *
 * - **The bond** is the druid's own flag (`SYMBIOSIS_FLAG`): the partner's
 *   uuid and name, written by the Use of the feature the talent grants and
 *   cleared at the druid's next Long Rest. ONE bond: naming a second partner
 *   replaces the first.
 * - **The share** is `AzerothActor#applyHealing`'s: Health that LANDED on
 *   either of the two - after the cap and every reduction - and half of it,
 *   rounded down, restored on the other. **MY READINGS, for the lead**: the
 *   share does not itself share (read literally the sentence never ends), it is
 *   the bond's and no creature's healing (so 10's rungs, Gift of Nature and the
 *   Vestments do not touch it), and only healing that goes through the one
 *   healing door counts - a rest's recovery is written by the rest and is not
 *   shared.
 * - **The Boon** turns on two Skill Ranks compared within 30 feet at each Test:
 *   the table's (D2 §12), said on the talent's row and built nowhere.
 */

/** The actor flag the bond stands under, on the druid. */
export const SYMBIOSIS_FLAG = "symbiosis";

/** Why a partner cannot be named, as `lang/en.json` keys. */
export const SYMBIOSIS_REFUSALS = Object.freeze({
  none: "AZEROTH.Symbiosis.Refused.None",
  many: "AZEROTH.Symbiosis.Refused.Many",
  self: "AZEROTH.Symbiosis.Refused.Self",
  hostile: "AZEROTH.Symbiosis.Refused.Hostile"
});

/**
 * What the other partner restores when one restores `restored` (04: *half as
 * much, rounded down*). Nothing for nothing.
 *
 * @param {number} restored  the Health that landed
 * @param {"half"|null} [share]  the row's `shares.heal`
 * @returns {number}
 */
export function sharedHeal(restored, share = "half") {
  const n = Math.max(0, Math.trunc(Number(restored)) || 0);
  if (share !== "half") return 0;
  return Math.floor(n / 2);
}

/**
 * **WHO MAY BE NAMED** (04: *name a friendly target*): exactly one creature the
 * user has targeted, never the druid, and never one whose token stands hostile
 * (MY READING, for the lead: *friendly* is read off the token's disposition,
 * and a neutral token may be named).
 *
 * @param {{targets?: Array<{actorUuid?: string|null, hostile?: boolean}>, self?: string|null}} o
 * @returns {{key: string}|null}
 */
export function partnerRefusal({ targets = [], self = null } = {}) {
  const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
  if (!list.length) return { key: SYMBIOSIS_REFUSALS.none };
  if (list.length > 1) return { key: SYMBIOSIS_REFUSALS.many };
  const [t] = list;
  if (!t.actorUuid || (self && t.actorUuid === self)) return { key: SYMBIOSIS_REFUSALS.self };
  if (t.hostile === true) return { key: SYMBIOSIS_REFUSALS.hostile };
  return null;
}

/**
 * **THE OTHER HALF OF EVERY BOND** a creature that restored Health is in: its
 * own partner where it holds a bond, and every druid whose bond names it - a
 * druid named by another druid is in two bonds, and *either of you* is true of
 * both. Once each, sorted, never the creature itself. A bond naming its own
 * holder is no bond.
 *
 * @param {string|null} uuid  the creature healed
 * @param {Array<{holder: string, partner: string, share?: string}>} bonds  every bond standing
 * @returns {Array<{uuid: string, share: string|null}>}  who restores a share, and its kind
 */
export function bondPartners(uuid, bonds = []) {
  if (!uuid) return [];
  const out = new Map();
  for (const b of bonds ?? []) {
    if (!b?.holder || !b?.partner || b.holder === b.partner) continue;
    const other = b.holder === uuid ? b.partner : (b.partner === uuid ? b.holder : null);
    if (!other || other === uuid || out.has(other)) continue;
    out.set(other, { uuid: other, share: b.share ?? "half" });
  }
  return [...out.values()].sort((a, b) => a.uuid.localeCompare(b.uuid));
}
