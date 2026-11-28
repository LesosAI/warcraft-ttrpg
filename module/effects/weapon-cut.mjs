/**
 * **UNHOLY WEAPON'S CUT, LAID BY A BLOW** (08 §18's Enchanter's Signatures: *On a hit at
 * SL 2, each of the target's weapon attacks deals 2 less damage until the end of its next
 * turn*; D-2166). `rules/enchanter-signatures.mjs` is the law (`WEAPON_CUT_FLAG`,
 * `weaponCutOn`), and the damage door reads it on the creature's own WEAPON blows, the way
 * 02 §7's Withering Contempt is read (`AzerothActor#applyDamage`).
 *
 * The cut is an Active Effect on the creature STRUCK, flagged and carrying no change (the
 * damage is no number on its sheet), spanned to the end of ITS next turn
 * (`durations.mjs#untilEndOfNextTurnOrRound`, so out of a fight the world's clock counts it,
 * D-778). **A second cut never deletes the first** (the final review of 0.18.1): each laying is its
 * own effect on its own span, `weaponCutOn` reads the largest standing one (never a sum), and a hit
 * turned into a miss deletes exactly the effect it laid, so the earlier cut stands and expires on its
 * own span.
 *
 * Here where this client owns the creature, else on the active GM's client through
 * `CONFIG.queries`, with `gm-writes.mjs#gmAbsentFor` judged first (D-774's review); the
 * handler checks that the asker owns the striker. This module is the cut's ONE writer.
 */

import { WEAPON_CUT_FLAG } from "../rules/enchanter-signatures.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

export const WEAPON_CUT_QUERY = "azeroth-rpg.weaponCut";

/** The icon the cut wears. */
const WEAPON_CUT_ICON = "icons/svg/downgrade.svg";

/** What one laying came to, for the card, and the effect it made (a hit turned into a miss deletes exactly that one). */
function landing(name, landed, reason = null, effectId = null) {
  return { name: String(name ?? ""), landed, reason, effectId: typeof effectId === "string" && effectId ? effectId : null };
}

/** Lay it here; the caller has already established that this client may. */
async function layHere({ victim, striker, amount, source }) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!n) return landing(victim.name, false, "nothing");
  const span = untilEndOfNextTurnOrRound(victim);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.format("AZEROTH.WeaponCut.EffectName", { source, n }),
    img: WEAPON_CUT_ICON,
    origin: striker?.uuid ?? null,
    description: `<p>${game.i18n.format("AZEROTH.WeaponCut.Text", { n, source })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: [] },
    ...(span ?? {}),
    flags: { "azeroth-rpg": { [WEAPON_CUT_FLAG]: { amount: n, source, by: striker?.uuid ?? null } } }
  }]);
  return landing(victim.name, Boolean(made), made ? null : "refused", made?.id ?? null);
}

/** The GM-side handler. Throws with the reason. */
export async function weaponCutQueryHandler({ victimUuid, strikerUuid = null, amount = 0, source = "" } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const striker = strikerUuid ? await fromUuid(strikerUuid) : null;
  if (user && (striker?.documentName !== "Actor" || !striker.testUserPermission(user, "OWNER"))) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: striker?.name ?? "" }));
  }
  // The amount is the striker's own blade's, read off what it wields, never the payload's alone.
  const held = Math.max(0, ...(striker?.items ?? []).filter(i => i.system?.equipped === true)
    .map(i => Math.trunc(Number(i.system?.signatureEffect?.onHit?.weaponCut)) || 0));
  const n = Math.min(Math.max(0, Math.trunc(Number(amount)) || 0), held);
  return layHere({ victim, striker, amount: n, source: String(source ?? "") });
}

/**
 * Lay the cut on a creature the blow struck, and say what came of it.
 *
 * @param {{victim: Actor|null, striker: Actor, amount: number, source: string, name?: string}} o
 * @returns {Promise<{name: string, landed: boolean, reason: string|null, effectId: string|null}>}
 */
export async function layWeaponCut({ victim, striker, amount = 0, source = "", name = "" } = {}) {
  if (!victim) return landing(name, false, "gone");
  try {
    if (victim.isOwner) return await layHere({ victim, striker, amount, source });
    // Judged before it is asked (D-774's review): no GM, no write, said in words.
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
      return landing(victim.name, false, "noGM");
    }
    const done = await game.users.activeGM.query(WEAPON_CUT_QUERY, { victimUuid: victim.uuid, strikerUuid: striker?.uuid ?? null, amount, source }, { timeout: 15000 });
    return done && typeof done === "object" ? landing(done.name ?? victim.name, done.landed === true, done.reason ?? null, done.effectId ?? null) : landing(victim.name, false, "error");
  } catch (err) {
    ui.notifications?.warn(err.message);
    return landing(victim.name, false, "error");
  }
}

/** What a laying came to, in words, for the fired row's own sentence. */
export function weaponCutWords(laid, { n = 0, source = "" } = {}) {
  if (!laid) return "";
  if (laid.landed) return game.i18n.format("AZEROTH.WeaponCut.Laid", { name: laid.name, n, source });
  if (laid.reason === "noGM") return game.i18n.format("AZEROTH.WeaponCut.NoGM", { name: laid.name, source });
  return game.i18n.format("AZEROTH.WeaponCut.NotLaid", { name: laid.name, source });
}
