import {tickCountdown,tickLanding} from './ticks.mjs';

/** A manually reconciled damage pulse advances exactly as ordinary delivery,
 * without repeating damage. Receipt and countdown are one effect update. */
export function damageTickReviewPatch(tick,receipt,{by,at}={}){
 if(receipt?.version!==1||receipt.phase!=='pending'||!receipt.event||!by||!Number.isFinite(at)
  ||tick?.kind!=='damage'||tick.cast!==receipt.cast)return null;
 if(receipt.tickBefore&&JSON.stringify(receipt.tickBefore)!==JSON.stringify(tick))return null;
 const next=tickCountdown(tick),landing=tickLanding(tick);
 if(next?.delete)return {delete:true};
 const patch={'flags.azeroth-rpg.signatureTickDelivery':{...receipt,phase:'reviewed',review:{by,at}}};
 if(next)patch['flags.azeroth-rpg.tick.rounds']=next.rounds;
 if(landing.doubled)patch['flags.azeroth-rpg.tick.doubled']=landing.left;
 return {patch};
}
