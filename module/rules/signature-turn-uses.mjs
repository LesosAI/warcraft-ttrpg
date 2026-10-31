/** Actor-owned limits for the approved once-per-turn signatures. Equipment
 * copies never own these records. Runtime must authenticate the current event,
 * serialize writes on the active GM, persist a claim before its benefit, and
 * retain pending claims after uncertain writes. This module performs no writes.
 */
const SHARED={
 'mace-of-unending-life':'unending-life',
 'cloak-of-unending-life':'unending-life'
};
const IDS=new Set(['mace-of-unending-life','cloak-of-unending-life','spinal-reaper',
 'the-horsemans-blade','band-of-veiled-shadows','death-grips',
 'idol-of-brutality','idol-of-ferocity','libram-of-hope','conquerors-battlegear']);
const key=value=>typeof value==='string'&&value.length>0;
const clock=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export const signatureTurnIdentity=id=>IDS.has(id)?SHARED[id]??id:null;

/** combat/turn are stable identifiers, not an actor's round number. A new
 * combat or leaving combat cannot clear the six-second fallback. Within the
 * same combat, a genuinely new turn refreshes the limit without waiting on
 * wall time. Backward clock movement never refreshes an out-of-combat use.
 */
export function signatureTurnAvailable(record,{now,combat=null,turn=null}={}){
 if(!clock(now)||(combat!==null&&(!key(combat)||!key(turn)))||(!combat&&turn!==null))return false;
 if(record==null)return true;
 if(record.version!==1||record.pending)return false;
 if(record.last===null)return true;
 if(!record.last||!clock(record.last.now))return false;
 if(combat&&record.last.combat===combat)return record.last.turn!==turn;
 return now-record.last.now>=6;
}

export function claimSignatureTurn(records,{identifier,event,writer,now,combat=null,turn=null}={}){
 const id=signatureTurnIdentity(identifier);
 if(!id||!key(event)||!key(writer)||!records||typeof records!=='object'||Array.isArray(records))return null;
 const previous=records[id];
 if(!signatureTurnAvailable(previous,{now,combat,turn}))return null;
 const next=structuredClone(records);
 next[id]={version:1,last:previous?.last??null,pending:{event,writer,now,combat,turn}};
 return {identity:id,records:next};
}

/** committed=false is only for proven cancellation BEFORE payment/delivery.
 * An uncertain result must leave the claim untouched, even across turns/rests.
 */
export function finishSignatureTurn(records,{identifier,event,writer,committed}={}){
 const id=signatureTurnIdentity(identifier),record=records?.[id];
 if(!id||record?.version!==1||!key(event)||!key(writer)||typeof committed!=='boolean'
  ||record.pending?.event!==event||record.pending.writer!==writer)return null;
 const next=structuredClone(records);
 if(committed){
  const {now,combat,turn}=record.pending;
  next[id]={version:1,last:{now,combat,turn,event,writer},pending:null};
 }else if(record.last)next[id]={version:1,last:record.last,pending:null};
 else next[id]={version:1,last:null,pending:null};
 return next;
}
