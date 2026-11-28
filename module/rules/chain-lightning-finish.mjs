/**
 * **WHAT A STUCK CHAIN LIGHTNING CAST LEFT BEHIND** (D-2174). A player's Chain Lightning runs on
 * the active GM's client and keeps a record on the caster (`effects/chain-lightning-cast.mjs`):
 * `pending` while the cast is made, `done`, `refused` or `reviewed` after. A record left `pending`
 * is a cast whose outcome nobody confirmed, and the GM's review reads the chat for the card that
 * cast posted. This is the one judgement of what that card proves. Pure: a card is a plain
 * snapshot the caller builds (`id`, `uuid`, `total`, `whisper`, `readable`, and `flags`, the
 * card's own `azeroth-rpg` flags).
 *
 * - `complete`: one live card for this request and this caster, its route resolved. The cast
 *   finished and posted its damage controls; only the record was not closed.
 * - `resume`: one live card, its Casting Test successful and paid, a finite total, its arc path
 *   not resolved (`chainLightningRoute.unresolved`), so it carries no damage controls, and the
 *   record the GM's review resumes from (`chainLightningResume`, `rules/chain-lightning-resume.mjs`).
 *   A card older than that record is `none/noRecord`: nothing is left to finish it from.
 * - `none`: anything else - no card, more than one, a card that cannot be read, one with no total,
 *   or a record that is not `pending`.
 *
 * A card marked `chainLightningSuperseded`, or named by a live card's `chainLightningResumedFrom`,
 * is evidence of nothing: a later card replaced it. The pointer counts as well as the mark, so a
 * resume whose mark failed to write still leaves one live card.
 */
import { isResumeRecord } from "./chain-lightning-resume.mjs";

export const FINISH_KINDS = Object.freeze(["complete", "resume", "none"]);

/** The reasons a `none` answer gives, in the order they are judged. */
export const FINISH_REFUSALS = Object.freeze([
  "notPending", "record", "noCard", "superseded", "manyCards", "unreadable", "noTotal", "notSuccessful", "noRecord"
]);

const isText = value => typeof value === "string" && value.length > 0;

/**
 * @param {{record?: object, casterUuid?: string, cards?: object[]}} facts
 * @returns {{kind: "complete"|"resume"|"none", reason: string, card: object|null}}
 */
export function finishEvidence({ record, casterUuid, cards } = {}) {
  const none = (reason, card = null) => ({ kind: "none", reason, card });
  if (!record || typeof record !== "object" || record.stage !== "pending") return none("notPending");
  if (!isText(record.requestId) || !isText(casterUuid)) return none("record");
  const named = (Array.isArray(cards) ? cards : []).filter(card => card && typeof card === "object"
    && card.flags && typeof card.flags === "object"
    && card.flags.chainLightningRequestId === record.requestId && card.flags.caster === casterUuid);
  const replaced = new Set(named.map(card => card.flags.chainLightningResumedFrom).filter(id => isText(id)));
  const live = named.filter(card => !card.flags.chainLightningSuperseded && !replaced.has(card.id));
  if (!live.length) return none(named.length ? "superseded" : "noCard");
  if (live.length > 1) return none("manyCards");
  const [card] = live;
  const route = card.flags.chainLightningRoute;
  if (card.readable === false || !isText(card.id) || card.flags.kind !== "spell"
    || !route || typeof route !== "object" || typeof route.unresolved !== "boolean") return none("unreadable", card);
  if (route.unresolved === false) return { kind: "complete", reason: "resolved", card };
  if (typeof card.total !== "number" || !Number.isFinite(card.total)) return none("noTotal", card);
  if (card.flags.success !== true) return none("notSuccessful", card);
  if (!isResumeRecord(card.flags.chainLightningResume)) return none("noRecord", card);
  return { kind: "resume", reason: "unresolved", card };
}
