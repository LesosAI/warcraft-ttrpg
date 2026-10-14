/**
 * IN THE HAND OR THROWN: the choice a weapon offers, as data (D-731). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * 06 §1 gives the ability by the way the weapon is used - *Strength for a
 * weapon in the hand and Dexterity for one that shoots or is thrown* - and 08
 * §5's Thrown trait says a weapon *may* be thrown. The attack door used to read
 * the trait as a throw, so a dagger stabbed at arm's reach rolled Dexterity,
 * took the Engaged Bane a ranged attack takes (06 §5), was measured against a
 * range band and was recorded as a thrown dagger.
 *
 * Three laws sit elsewhere and this composes them:
 *
 *  - `ammunition.mjs#attackModes` - which ways a weapon has, off the launcher,
 *    the Thrown trait and the Range column;
 *  - `distance.mjs#reachAndRange` and `#rangeBand` - what each way reaches and
 *    what the distance does to it;
 *  - `distance.mjs#defaultAttackMode` - which way it opens on.
 *
 * What lives here is what the door, the dialog and the roll share: one variant
 * per way (`attackPlan`), the variant a spec is rolled with (`withAttackMode`),
 * and which ticked lines a switch keeps (`carriedLines`).
 */

import { attackAbility, attackModeOf, attackModes } from "./ammunition.mjs";
import { defaultAttackMode, rangeBand, reachAndRange, reachOf, thrownRange } from "./distance.mjs";

/**
 * Everything about a blow that the way it is struck decides, and nothing else.
 *
 * The ability (06 §1), what it reaches or carries, the band the measured
 * distance falls in, whether it is a ranged attack - which is what raises the
 * Engaged Bane and the cover line (06 §5) - and whether that way is refused
 * outright, which only a throw or a shot past twice its range is (06 §5, D-716).
 *
 * @param {{launcher?: string|null, range?: number|null, traits?: string[]}} weapon
 * @param {string|null} mode
 * @param {{distance?: number|null, engaged?: boolean}} [o]  `engaged`: an enemy stands inside the attacker's reach
 */
export function attackVariant(weapon, mode, { distance = null, engaged = false } = {}) {
  const used = attackModeOf(weapon, mode);
  const spec = reachAndRange(weapon, used);
  const band = rangeBand(distance, spec);
  const rangeKind = spec.kind === "melee" ? "melee" : "ranged";
  return {
    mode: used,
    ability: attackAbility(weapon, used),
    spec,
    band,
    rangeKind,
    engaged: rangeKind === "ranged" && engaged === true,
    refused: band.ok ? null : { distance: band.distance, max: band.max }
  };
}

/**
 * The ways a blow may be struck, one variant each, and the way it opens on.
 *
 * `mode` is a caller settling it (D-731); an Opportunity Attack passes the hand
 * only where the weapon has one. **A way the weapon has not got is refused, never swapped**
 * (D-731's review): the answer carries `lacks` and no way at all, and the door
 * says so in words - a Javelin forced into the hand used to be thrown quietly.
 * `mode` in the answer is null where every way offered is refused, which is a
 * shot or a thrown-only weapon past twice its range: the door refuses that
 * attack in words, as it always has.
 *
 * @param {{launcher?: string|null, range?: number|null, traits?: string[]}} weapon
 * @param {{distance?: number|null, engaged?: boolean, mode?: string|null}} [o]
 * @returns {{modes: string[], mode: string|null, variants: Record<string, object>, lacks: string|null}}
 */
export function attackPlan(weapon, { distance = null, engaged = false, mode = null } = {}) {
  const all = attackModes(weapon);
  if (mode && !all.includes(mode)) return { modes: [], mode: null, variants: {}, lacks: String(mode) };
  const offered = mode ? [mode] : all;
  const variants = Object.fromEntries(offered.map(m => [m, attackVariant(weapon, m, { distance, engaged })]));
  const usable = offered.filter(m => !variants[m].refused);
  const traits = weapon?.traits ?? [];
  const preferred = defaultAttackMode(offered, { distance, reach: reachOf(traits), throwRange: thrownRange(traits) });
  return {
    modes: offered,
    mode: usable.includes(preferred) ? preferred : (usable[0] ?? null),
    variants,
    lacks: null
  };
}

/** The ways a roll spec offers that may be chosen, in the order the door gave them. */
export function usableAttackModes(spec) {
  const modes = spec?.modes;
  if (!modes || typeof modes !== "object") return [];
  return Object.keys(modes).filter(key => Object.hasOwn(modes, key) && modes[key] && !modes[key].refused);
}

/**
 * THE SPEC A ROLL IS MADE WITH, once the way is chosen (D-731).
 *
 * The door puts one variant per way under `spec.modes` - the ability's modifier
 * line, the range kind, the band, the Engaged flag and the strike record - and
 * this lays the chosen one over the spec, so everything after it reads one
 * blow: the dialog's lines, its preview, the workflow's modifiers and the card.
 * A refused way is never chosen; an unknown one falls back to the spec's own
 * `mode`, then to the first way that may be chosen. A spec with no `modes` is
 * returned as it came.
 *
 * `modes` stays on the answer, so the dialog can draw the choice; the workflow
 * never sees it (`actions.mjs#rollWithDialog` takes it off).
 */
export function withAttackMode(spec = {}, mode = null) {
  const usable = usableAttackModes(spec);
  if (!usable.length) return spec;
  const chosen = usable.includes(mode) ? mode : (usable.includes(spec.mode) ? spec.mode : usable[0]);
  const { refused, ...variant } = spec.modes[chosen];
  void refused;
  return { ...spec, ...variant, mode: chosen };
}

/**
 * WHICH LINES STAY TICKED WHEN THE ROLLER SWITCHES THE WAY (D-731).
 *
 * **A line that belongs only to the other way never survives the switch** - the
 * thrown blow's Engaged Bane is not carried onto a stab, and a stab's
 * out-of-reach line is not carried onto a throw. A line the new way raises in
 * the SAME list with the SAME cost and name means the same thing in both, so the
 * roller's own tick or untick is kept; any other line the new way raises takes
 * that way's default. The Engaged line is the case that needs the list: a
 * throw raises it AUTOMATIC and checked, a stab offers it as the table's
 * judgement, unchecked, and neither default may leak into the other.
 *
 * @param {{automatic?: object[], judgement?: object[]}} from  the lines the dialog was showing
 * @param {{automatic?: object[], judgement?: object[]}} to    the new way's lines
 * @param {Iterable<string>} checked  the ids ticked on the form being left
 * @returns {Set<string>} the ids to tick on the new form
 */
export function carriedLines(from, to, checked = []) {
  const ticked = new Set(checked);
  const out = new Set();
  const same = (a, b) => (a.boons ?? 0) === (b.boons ?? 0)
    && (a.banes ?? 0) === (b.banes ?? 0)
    && (a.modifier ?? 0) === (b.modifier ?? 0)
    && (a.name ?? null) === (b.name ?? null);
  for (const list of ["automatic", "judgement"]) {
    const before = new Map((from?.[list] ?? []).map(line => [line.id, line]));
    for (const line of to?.[list] ?? []) {
      const was = before.get(line.id);
      const keep = was ? same(was, line) : false;
      if (keep ? ticked.has(line.id) : line.checked === true) out.add(line.id);
    }
  }
  return out;
}
