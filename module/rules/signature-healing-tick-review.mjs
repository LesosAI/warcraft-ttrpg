import {tickCountdown,tickLanding} from './ticks.mjs';

/** Review acknowledges an uncertain pulse; it never repeats its healing.
 * Countdown and receipt are one effect update, matching normal tick delivery. */
export function healingTickReviewPatch(tick,receipt,{by,at}={}){
 if(receipt?.version!==1||receipt.phase!=='pending'||!receipt.event||!by||!Number.isFinite(at)
  ||tick?.kind!=='heal'||tick.cast!==receipt.cast)return null;
 if(receipt.tickBefore&&JSON.stringify(receipt.tickBefore)!==JSON.stringify(tick))return null;
 const next=tickCountdown(tick),landing=tickLanding(tick);
 if(next?.delete)return {delete:true};
 const patch={'flags.azeroth-rpg.signatureHealingTickDelivery':{...receipt,phase:'reviewed',review:{by,at}}};
 if(next)patch['flags.azeroth-rpg.tick.rounds']=next.rounds;
 if(landing.doubled)patch['flags.azeroth-rpg.tick.doubled']=landing.left;
 return {patch};
}
