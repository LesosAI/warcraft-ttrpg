/**
 * **05's TEMPORARY HEALTH, WHERE IT TOUCHES THE WORLD** (D-777; the lead,
 * 2026-10-03: *"raise HP past max as temp hp"*).
 *
 * `rules/temporary-health.mjs` is the law and `AzerothActor#grantTemporaryHealth`
 * the one writer of a grant on a creature this client owns. This module is the
 * rest:
 *
 * - **A grant on somebody else's creature** - 02's Rallying Cry on every ally
 *   within 30 feet - is written on the active GM's client through
 *   `CONFIG.queries` (never `game.socket`, D-643). The handler asks that the
 *   asker own the GIVER and works the number out again off the giver - never off
 *   the request.
 * - **A grant that rode a laid effect ends with it** (05: *It lasts as long as
 *   the thing that granted it says*): any delete of that effect - core's expiry,
 *   a hand, a second casting replacing the first - takes what is left of it, on
 *   the client that deleted it, which is the one that may write the creature.
 */

import { AZEROTH } from "../config.mjs";
import { TEMP_FLAG, temporaryEnds, temporaryOnSheet } from "../rules/temporary-health.mjs";
import { RALLYING_CRY } from "../rules/class-talents.mjs";
import { evaluateAmount } from "../rules/class-features.mjs";

/**
 * **WHAT BOTH SHEETS DRAW BESIDE THE HEALTH** (the lead: *"raise HP past max as
 * temp hp"*; D-777): the temporary Health past the maximum, in words - never by a
 * colour alone - and its source and span in the tooltip. Null where there is none.
 *
 * @param {Actor} actor
 * @returns {{n: number, tip: string}|null}
 */
export function temporaryHealthContext(actor) {
  const shown = temporaryOnSheet({ temp: actor?.system?.health?.temp ?? 0, record: actor?.getFlag?.("azeroth-rpg", TEMP_FLAG) ?? null });
  if (!shown) return null;
  const source = shown.source || game.i18n.localize("AZEROTH.Health.TemporaryUnsourced");
  const span = game.i18n.localize(AZEROTH.temporaryHealthSpans[shown.span ?? "longRest"] ?? AZEROTH.temporaryHealthSpans.longRest);
  return { n: shown.n, tip: game.i18n.format("AZEROTH.Health.TemporaryTip", { source, span }) };
}

/** The query a grant on a creature this client does not own goes through. */
export const TEMP_HEALTH_QUERY = "azeroth-rpg.temporaryHealth";

/**
 * **02's RALLYING CRY'S GRANT ON ONE ALLY** (*temporary Health equal to your
 * level*): here where this client may write the ally, else on the GM's client.
 * The caller has asked `gm-writes.mjs#gmAbsentFor` before the War Cry was paid.
 *
 * @param {{giver: Actor, recipient: Actor}} o
 * @returns {Promise<{landed: boolean, temp: number, reason: string|null}>}
 */
export async function rallyAlly({ giver, recipient }) {
  if (!giver || !recipient) return { landed: false, temp: 0, reason: "gone" };
  const amount = rallyingAmount(giver);
  if (recipient.isOwner) return recipient.grantTemporaryHealth(amount, { source: giver.name ? `${rallyingName()} (${giver.name})` : rallyingName(), span: RALLYING_CRY.span });
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Temporary.NoGM"));
    return { landed: false, temp: 0, reason: "noGM" };
  }
  try {
    const done = await gm.query(TEMP_HEALTH_QUERY, { act: "rally", giverUuid: giver.uuid, recipientUuid: recipient.uuid }, { timeout: 15000 });
    return done && typeof done === "object" ? done : { landed: false, temp: 0, reason: "error" };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { landed: false, temp: 0, reason: "error" };
  }
}

/** The Rallying Cry's name, as the War Cry's chooser prints it. */
function rallyingName() {
  return game.i18n.localize("AZEROTH.Feature.WarCry.Rallying");
}

/** What a Rallying Cry grants: the WARRIOR's level (02 §7), worked out off the warrior. */
function rallyingAmount(giver) {
  return Math.max(0, Math.trunc(Number(evaluateAmount(RALLYING_CRY.amount, { level: giver?.system?.level ?? 1, tier: giver?.system?.tier ?? 1 }))) || 0);
}

/**
 * The GM-side handler (`TEMP_HEALTH_QUERY`). Throws with the reason, which
 * travels back to the caller.
 *
 * - `rally`: the asker must own the GIVER - it was their War Cry that paid - and
 *   the giver hold War Cry; the amount is the giver's own level.
 */
export async function temporaryHealthQueryHandler({ act = "rally", giverUuid = null, recipientUuid = null } = {}, { user = null } = {}) {
  const giver = giverUuid ? await fromUuid(giverUuid) : null;
  const recipient = recipientUuid ? await fromUuid(recipientUuid) : null;
  if (giver?.documentName !== "Actor" || recipient?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !giver.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: giver.name }));
  if (act !== "rally" || !giver.hasFeature?.(RALLYING_CRY.feature)) return { landed: false, temp: recipient.system?.health?.temp ?? 0, reason: "refused" };
  return recipient.grantTemporaryHealth(rallyingAmount(giver), { source: `${rallyingName()} (${giver.name})`, span: RALLYING_CRY.span });
}

/**
 * **WHAT A DELETED EFFECT TAKES WITH IT** (05: *It lasts as long as the thing
 * that granted it says*), registered at init on every client and acted on by the
 * client that deleted the effect.
 */
export function registerTemporaryHealthHooks() {
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id) return;
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor") return;
    const occasion = { kind: "effectGone", effectId: effect.id };
    if (!temporaryEnds(actor.getFlag?.("azeroth-rpg", TEMP_FLAG) ?? null, occasion)) return;
    actor.endTemporaryHealth?.(occasion).catch(err => console.error("azeroth-rpg | temporary Health", err));
  });
}
