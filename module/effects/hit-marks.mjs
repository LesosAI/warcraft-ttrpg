/**
 * **WHAT A HIT LEAVES ON THE CREATURE IT STRUCK, WRITTEN** (D-812). `rules/hit-marks.mjs`
 * is the law; this is the one write for its marks and for Momentum a hit takes:
 *
 * - `layHitMark` - an Active Effect on the creature struck, carrying a mark the law
 *   built (07's Fel Bolt's Ward drop, 08 §5's Snag), on the span the layer names. A
 *   second mark of the same kind from the same source and striker replaces the first.
 * - `loseMomentum` - 08 §5's Rattle: a point off the creature's Momentum pool that
 *   holds the most (`rules/hit-marks.mjs#momentumLoss`).
 *
 * The write runs here for whoever owns the creature, and through `CONFIG.queries` on
 * the active GM's client otherwise, the handler checking that the asker owns the
 * striker - D-770's inflict door's shape and the Speed drop's, never `game.socket`.
 */

import { AZEROTH } from "../config.mjs";
import { cleanHitMark, hitMarkCarries, HIT_MARK_FLAG, momentumLoss } from "../rules/hit-marks.mjs";

export const HIT_MARK_QUERY = "azeroth-rpg.hitMark";

/** The icon a mark wears in the effects list. */
const ICON = { wardDrop: "icons/svg/downgrade.svg", noOpportunity: "icons/svg/net.svg" };

/** The effect's create data. */
function markData(mark, { originUuid = null, span = null } = {}) {
  const { changes, flags } = hitMarkCarries(mark);
  const words = mark.kind === "wardDrop"
    ? { name: game.i18n.format("AZEROTH.HitMark.WardDrop.Name", { source: mark.source, n: mark.amount, school: game.i18n.localize(AZEROTH.schools[mark.school] ?? mark.school) }),
        text: game.i18n.format("AZEROTH.HitMark.WardDrop.Text", { n: mark.amount, school: game.i18n.localize(AZEROTH.schools[mark.school] ?? mark.school) }) }
    : { name: game.i18n.format("AZEROTH.HitMark.Snag.Name", { source: mark.source }), text: game.i18n.localize("AZEROTH.HitMark.Snag.Text") };
  return {
    name: words.name,
    img: ICON[mark.kind] ?? ICON.wardDrop,
    origin: originUuid ?? null,
    description: `<p>${words.text}</p>`,
    system: { changes },
    // The span's two keys and nothing else a request slipped in beside them.
    ...(span && typeof span === "object" && span.duration && span.start ? { duration: { ...span.duration }, start: { ...span.start } } : {}),
    flags: { "azeroth-rpg": flags }
  };
}

/** Here, where this client may write the creature. */
async function markHere({ victim, mark, originUuid, span }) {
  const stale = (victim.effects ?? []).filter(e => {
    const held = e.flags?.["azeroth-rpg"]?.[HIT_MARK_FLAG] ?? null;
    return held && held.kind === mark.kind && String(held.source ?? "") === mark.source && (e.origin ?? null) === (originUuid ?? null);
  }).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [markData(mark, { originUuid, span })]);
  return { name: victim.name, landed: Boolean(made), effectId: made?.id ?? null };
}

/** Here: a point off the pool holding the most. */
async function momentumHere({ victim, amount }) {
  const plan = momentumLoss(victim.poolSnapshot?.() ?? [], amount);
  if (!plan) return { name: victim.name, lost: 0, itemId: null, reason: "none" };
  await victim.updatePool({ itemId: plan.itemId, kind: "momentum", value: plan.value });
  return { name: victim.name, lost: plan.lost, itemId: plan.itemId, reason: null };
}

/** The GM-side handler: the asker must own what struck. Throws with the reason. */
export async function hitMarkQueryHandler({ op = null, victimUuid = null, originUuid = null, mark = null, span = null, amount = 0 } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user) {
    const origin = originUuid ? await fromUuid(originUuid) : null;
    if (origin?.documentName !== "Actor" || !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin?.name ?? "" }));
    }
  }
  if (op === "momentum") return momentumHere({ victim, amount });
  const clean = cleanHitMark(mark);
  if (op !== "mark" || !clean) throw new Error(game.i18n.localize("AZEROTH.HitMark.Unreadable"));
  return markHere({ victim, mark: clean, originUuid, span });
}

/** Ask the active GM, or write here; a refusal is said and comes back as nothing landed. */
async function ask(victim, payload, here, fallback) {
  if (victim.isOwner) return here();
  const gm = game.users.activeGM;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
  const done = await gm.query(HIT_MARK_QUERY, payload, { timeout: 15000 });
  return done && typeof done === "object" ? done : fallback;
}

/**
 * **LAY A MARK A HIT LEAVES**, and say what came of it.
 *
 * @param {{victim: Actor|null, mark: object, by?: Actor|null, span?: {duration: object, start: object}|null, name?: string}} o
 *   `name` is the target's as the card's row names it
 * @returns {Promise<{name: string, landed: boolean, effectId: string|null}>}
 */
export async function layHitMark({ victim = null, mark = null, by = null, span = null, name = "" } = {}) {
  const clean = cleanHitMark(mark);
  const named = row => ({ ...row, name: String(name || row?.name || "") });
  if (!victim || !clean) return named({ name: victim?.name ?? "", landed: false, effectId: null });
  const originUuid = by?.uuid ?? null;
  try {
    return named(await ask(victim, { op: "mark", victimUuid: victim.uuid, originUuid, mark: clean, span },
      () => markHere({ victim, mark: clean, originUuid, span }), { name: victim.name, landed: false, effectId: null }));
  } catch (err) {
    ui.notifications?.warn(err.message);
    return named({ name: victim.name, landed: false, effectId: null });
  }
}

/**
 * **TAKE MOMENTUM A HIT TAKES** (08 §5's Rattle), and say what came of it.
 *
 * @param {{victim: Actor|null, amount?: number, by?: Actor|null, name?: string}} o
 * @returns {Promise<{name: string, lost: number, itemId: string|null, reason: string|null}>}
 *   `reason`: `none` (no Momentum to lose), `error`
 */
export async function loseMomentum({ victim = null, amount = 1, by = null, name = "" } = {}) {
  const named = row => ({ ...row, name: String(name || row?.name || "") });
  if (!victim) return named({ name: "", lost: 0, itemId: null, reason: "error" });
  const originUuid = by?.uuid ?? null;
  try {
    return named(await ask(victim, { op: "momentum", victimUuid: victim.uuid, originUuid, amount },
      () => momentumHere({ victim, amount }), { name: victim.name, lost: 0, itemId: null, reason: "error" }));
  } catch (err) {
    ui.notifications?.warn(err.message);
    return named({ name: victim.name, lost: 0, itemId: null, reason: "error" });
  }
}
