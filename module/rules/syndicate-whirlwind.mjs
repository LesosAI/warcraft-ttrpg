/** Tabletop adaptation of Classic 2247 / 17207 -> 15576.
 * A single interruptible wind-up, followed by ordinary nearby attacks.
 * Whirling Invader 14455 uses the same 17207 -> 15576 source spell.
 */
export const SYNDICATE_WHIRLWIND = Object.freeze({ name: "Whirlwind", action: "action", uses: 1,
  per: "encounter", feet: 5, seconds: 6, weapon: "Weighted mace" });
// Explicit authored profiles only. Refuse actors carrying both, rather than
// silently choosing a different attack after a channel has started.
const WHIRLWIND_ATTACKS = Object.freeze([SYNDICATE_WHIRLWIND.weapon, "Sweeping fist"]);
const text = value => typeof value === "string" && value.length > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const pointValid = p => p && [p.x, p.y, p.elevation].every(finite) && text(p.level);
const samePoint = (a, b) => pointValid(a) && pointValid(b)
  && ["x", "y", "elevation", "level"].every(key => a[key] === b[key]);

/** The spent-use value may reset independently; the ability's contract must
 * remain intact throughout a channel. Duplicate rows are ambiguous. */
export function hasSyndicateWhirlwind(abilities = []) {
  if (!Array.isArray(abilities)) return false;
  const rows = abilities.filter(row => row?.name === SYNDICATE_WHIRLWIND.name);
  const a = rows[0]?.automation;
  return rows.length === 1 && a?.kind === "utility" && a.action === SYNDICATE_WHIRLWIND.action
    && !a.cost?.amount && a.uses?.max === 1 && a.uses.per === SYNDICATE_WHIRLWIND.per;
}


export function beginSyndicateWhirlwind({ actorUuid, tokenUuid, castId, point, time, combat = null, attacks = [] } = {}) {
  if (![actorUuid, tokenUuid, castId].every(text) || !pointValid(point) || !finite(time)) return null;
  if (combat && (!text(combat.id) || !Number.isInteger(combat.round) || combat.round < 1 || combat.actorUuid !== actorUuid)) return null;
  if (!Array.isArray(attacks)) return null;
  const matches = attacks.map((attack, index) => ({ attack, index })).filter(row => WHIRLWIND_ATTACKS.includes(row.attack?.name));
  if (matches.length !== 1) return null;
  const { attack, index } = matches[0];
  if (!finite(attack.bonus) || !finite(attack.damage) || attack.damage <= 0 || attack.range != null || !Array.isArray(attack.traits)) return null;
  return { version: 1, phase: "channeling", actorUuid, tokenUuid, castId, point: { ...point }, time,
    combat: combat ? { id: combat.id, round: combat.round } : null,
    index, attack: structuredClone(attack) };
}

/** The runtime must latch interruptions when they occur: returning to the
 * same square later does not undo an already observed move or action.
 */
export function syndicateWhirlwindStep({ record, actorUuid, tokenUuid, point, time, combat = null,
  alive = false, incapacitated = false, interrupted = false, attacks = [] } = {}) {
  if (record?.version !== 1 || record.phase !== "channeling" || !text(record.castId)
    || record.actorUuid !== actorUuid || record.tokenUuid !== tokenUuid) return { action: "refuse", reason: "identity" };
  const cancel = reason => ({ action: "cancel", reason, record: { ...record, phase: "cancelled", reason } });
  if (interrupted || !alive || incapacitated || !samePoint(record.point, point)) return cancel("interrupted");
  if (JSON.stringify(attacks[record.index]) !== JSON.stringify(record.attack)) return cancel("weaponChanged");
  if (!finite(time) || time < record.time) return { action: "refuse", reason: "clock" };
  if (record.combat) {
    if (!combat || combat.id !== record.combat.id) return cancel("combatEnded");
    if (!Number.isInteger(combat.round) || combat.round < record.combat.round) return { action: "refuse", reason: "clock" };
    if (combat.round === record.combat.round || combat.actorUuid !== actorUuid) return { action: "wait" };
  } else {
    if (combat) return cancel("combatChanged");
    if (time < record.time + SYNDICATE_WHIRLWIND.seconds) return { action: "wait" };
  }
  // Persist this claim BEFORE opening attack dialogs; never restart a claimed
  // volley automatically after an uncertain write or a disconnected GM.
  return { action: "strike", record: { ...record, phase: "striking" } };
}

/** Current enemies, not the creatures that were nearby when winding up.
 * Token identity distinguishes separate creatures sharing a world actor.
 */
export function syndicateWhirlwindTargets(candidates = []) {
  if (!Array.isArray(candidates) || candidates.some(t => !text(t?.tokenUuid)
    || !text(t?.actorUuid) || !finite(t.feet) || t.feet < 0)) return null;
  if (new Set(candidates.map(t => t.tokenUuid)).size !== candidates.length) return null;
  return candidates.filter(t => t.alive === true && t.hostile === true && t.sameLevel === true
    && t.clear === true && t.feet <= SYNDICATE_WHIRLWIND.feet).map(t => ({ tokenUuid: t.tokenUuid, actorUuid: t.actorUuid }));
}
