import { parryHolds } from "./reactions.mjs";

/** The reaction menu has no incoming attack row or answers object. */
export function confirmedStandaloneParryOutcome({outcome,started,paymentConfirmed=false,actorId,reacted,card=null,mark=null}={}){
 if(started!==true||reacted?.reaction!=='parry'||reacted.messageId!==null)return false;
 if(outcome==='cancelled')return card===null&&!paymentConfirmed;
 if(!['held','missed','unpaid'].includes(outcome)||card?.actorId!==actorId||card?.parry!==true||card.answers!=null
  ||!Number.isFinite(card.total)||!Number.isFinite(card.dc))return false;
 const negates=mark?.reaction==='parry'&&mark.messageId===null&&mark.negate===true;
 if(outcome==='unpaid')return !paymentConfirmed&&!negates;
 if(!paymentConfirmed)return false;
 return outcome==='held'?parryHolds(card.total,card.dc)&&negates:!parryHolds(card.total,card.dc)&&!negates;
}

/** Verify the explicit result returned by a coordinated Parry continuation.
 * Cancellation spends the Reaction but creates no Test and pays no pool cost.
 * A Test with insufficient pool funds never negates the hit, even if it succeeds.
 * The caller supplies authoritative document snapshots, not client payload fields.
 */
export function confirmedParryOutcome({ outcome, started, paymentConfirmed = false, messageId, index, actorId,
  reacted, card = null, incoming = null, mark = null } = {}) {
  if (started !== true || reacted?.reaction !== "parry" || reacted.messageId !== messageId) return false;
  if (outcome === "cancelled") return card === null && paymentConfirmed === false;
  if (!["held", "missed", "unpaid"].includes(outcome) || !card || card.actorId !== actorId
    || card.parry !== true || card.answers?.messageId !== messageId || card.answers.index !== index
    || !Number.isFinite(card.total) || !Number.isFinite(card.dc)) return false;
  if (outcome === "unpaid") return paymentConfirmed === false && incoming?.withdrawn !== true && !(mark?.messageId === messageId && mark.negate === true);
  if (paymentConfirmed !== true) return false;
  const holds = parryHolds(card.total, card.dc);
  if (outcome === "missed") return !holds && incoming?.withdrawn !== true;
  return holds && incoming?.withdrawn === true && incoming.to === 0
    && mark?.reaction === "parry" && mark.messageId === messageId && mark.negate === true;
}
