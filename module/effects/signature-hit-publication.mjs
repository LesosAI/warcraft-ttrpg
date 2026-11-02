import {deliverTurnSignatures,SIGNATURE_TURN_FLAG} from './signature-turn-use.mjs';
import {signatureTurnIdentity} from '../rules/signature-turn-uses.mjs';

export const SIGNATURE_HIT_FLAG='signatureHitBonuses';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const supported=new Set(['the-horsemans-blade','idol-of-brutality','idol-of-ferocity','band-of-veiled-shadows']);

/** Internal active-GM transaction for a confirmed hit. The attack workflow
 * supplies authenticated candidates and publishes its normal, fully mitigated
 * card inside the allowance reservation. No public query accepts damage rows.
 * A missing/uncertain card keeps the claim; never retry the attack automatically.
 * Band requires a saved target-specific declaration and adds primary-type damage.
 */
export async function publishSignatureHit({actor,event,readCandidates,validate,publish}={}){
  if(typeof event!=='string'||!event||typeof readCandidates!=='function'
    ||typeof validate!=='function'||typeof publish!=='function')return {ok:false,reason:'context'};
  const rows=structuredClone(readCandidates());
  if(!Array.isArray(rows)||rows.some(row=>!supported.has(row?.identifier)||!row.itemId
    ||!Number.isInteger(row.extraDamage)||row.extraDamage<=0
    ||row.extraType!==(row.identifier==='the-horsemans-blade'?'fire':row.identifier==='band-of-veiled-shadows'?null:'physical')
    ||row.identifier==='band-of-veiled-shadows'&&(row.hiddenFromTarget!==true||!Number.isInteger(row.targetIndex)||row.targetIndex<0))
    ||new Set(rows.map(row=>row.identifier)).size!==rows.length)return {ok:false,reason:'bonus'};
  const prior=()=>game.messages?.find(message=>{
    const receipt=message.getFlag('azeroth-rpg',SIGNATURE_HIT_FLAG);
    return receipt?.actorUuid===actor?.uuid&&receipt.event===event;
  });
  if(prior())return {ok:false,reason:'published'};
  let card=null,expected=null;
  const valid=()=>validate()===true&&same(readCandidates(),rows)
    &&(!prior()||prior()===card);
  const result=await deliverTurnSignatures({actor,identifiers:rows.map(row=>row.identifier),event,validate:valid,
    execute:async({valid:held,identifiers})=>{
      if(!held())return {complete:false};
      const selected=rows.filter(row=>identifiers.includes(row.identifier));
      const records=actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{};
      const previous=Object.fromEntries(selected.map(row=>{
        const id=signatureTurnIdentity(row.identifier);return [id,structuredClone(records[id]?.last??null)];
      }));
      expected={version:1,event,actorUuid:actor.uuid,bonuses:selected,previous};
      card=await publish({bonuses:structuredClone(selected),receipt:structuredClone(expected),valid:held});
      if(!card||card.documentName!=='ChatMessage'||fromUuidSync(card.uuid)!==card
        ||ChatMessage.getSpeakerActor(card.speaker)!==actor
        ||!same(card.getFlag('azeroth-rpg',SIGNATURE_HIT_FLAG),expected))return {complete:false};
      const flags=card.flags?.['azeroth-rpg'];
      if(flags?.kind!=='attack'||flags.parry===true||flags.notAttack===true
        ||card.rolls?.[0]?.outcome?.success!==true)return {complete:false};
      return {complete:true,committed:selected.length>0};
    }});
  return {...result,messageUuid:card?.uuid??null};
}
