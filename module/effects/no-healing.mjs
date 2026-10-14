/**
 * **A CREATURE THAT RECOVERS NO HEALTH, LAID BY A BLOW** (04's Mortal Strike: *On
 * a hit, the target recovers no Health from any source until the end of your
 * next turn*; D-772). `rules/no-healing.mjs` is the law and both actor models
 * derive `system.healingBlocked` off the flag this lays.
 *
 * The mark is an Active Effect on the TARGET, flagged and carrying no change
 * (healing is no number on the sheet), its span the STRIKER's - keyed on the
 * striker's combatant, as a tick's *until the end of your next turn* is (D-770).
 * A second blow by the same striker replaces the first, so the span is always
 * the latest. Out of a fight there is no turn to end on: the mark is not laid
 * and the card says so (MY READING, for the lead: D-770's item A, a span with
 * no clock is never laid).
 *
 * Here where this client owns the target, on the active GM's client through
 * `CONFIG.queries` otherwise (the inflict door's shape, `effects/inflict.mjs`);
 * the handler checks that the asker owns the striker.
 */

import { NO_HEALING_FLAG } from "../rules/no-healing.mjs";
import { untilEndOfNextTurn } from "./durations.mjs";

export const NO_HEALING_QUERY = "azeroth-rpg.noHealing";

/** The icon the mark wears. */
const NO_HEALING_ICON = "icons/svg/blood.svg";

/** What one laying came to, for the card. */
function landing(name, landed, reason = null) {
  return { name: String(name ?? ""), landed, reason };
}

/** Lay it here; the caller has already established that this client may. */
async function layHere({ victim, striker, source }) {
  const span = striker ? untilEndOfNextTurn(striker) : null;
  if (!span) return landing(victim.name, false, "noFight");
  const stale = (victim.effects ?? []).filter(e => {
    const held = e.flags?.["azeroth-rpg"]?.[NO_HEALING_FLAG] ?? null;
    return held && (e.origin ?? null) === (striker?.uuid ?? null);
  }).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.NoHealing.EffectName", { source }),
    img: NO_HEALING_ICON,
    origin: striker?.uuid ?? null,
    description: `<p>${game.i18n.format("AZEROTH.NoHealing.Text", { striker: striker?.name ?? "" })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    ...span,
    flags: { "azeroth-rpg": { [NO_HEALING_FLAG]: { source } } }
  }]);
  return landing(victim.name, Boolean(made), made ? null : "refused");
}

/** The GM-side handler. Throws with the reason. */
export async function noHealingQueryHandler({ victimUuid, strikerUuid = null, source = "" } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const striker = strikerUuid ? await fromUuid(strikerUuid) : null;
  if (user && (striker?.documentName !== "Actor" || !striker.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: striker?.name ?? "" }));
  }
  return layHere({ victim, striker, source: String(source ?? "") });
}

/**
 * Lay the mark on a creature the blow struck, and say what came of it.
 *
 * @param {{victim: Actor|null, striker: Actor, source: string, name?: string}} o
 * @returns {Promise<{name: string, landed: boolean, reason: string|null}>}
 */
export async function layNoHealing({ victim, striker, source = "", name = "" } = {}) {
  if (!victim) return landing(name, false, "gone");
  try {
    if (victim.isOwner) return await layHere({ victim, striker, source });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    const done = await gm.query(NO_HEALING_QUERY, { victimUuid: victim.uuid, strikerUuid: striker?.uuid ?? null, source }, { timeout: 15000 });
    return done && typeof done === "object" ? landing(done.name ?? victim.name, done.landed === true, done.reason ?? null) : landing(victim.name, false, "error");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return landing(victim.name, false, "error");
  }
}
