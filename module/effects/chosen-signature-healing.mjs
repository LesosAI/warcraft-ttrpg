import {chosenHealingOptions} from '../rules/chosen-signature-healing.mjs';
import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
function optionsFor(actor,grantingClass){
 return chosenHealingOptions({signatures:actor.system?.signatureEffects?.chosenSpellHealing??[],grantingClass,
  ownModifiers:Object.fromEntries(Object.entries(actor.system?.abilities??{}).map(([key,value])=>[key,value.own?.mod??value.mod]))});
}
/** Prepayment only. No counter or resource is spent until authenticated healing
 * delivery. Exact source amounts and recipients are rechecked after selection. */
export async function prepareHealingSignatures({actor,spell,grantingClass,targets=[],choose,readTargets=()=>targets,readGrantingClass=()=>grantingClass}={}){
 const options=optionsFor(actor,grantingClass);if(!options.length)return {ok:true,bonuses:[]};
 const recipients=()=>[...new Map(readTargets().map(t=>[signatureRecipientKey(t),t]).filter(([key])=>key)).entries()];
 const initial=recipients();if(!initial.length)return {ok:false,reason:'needsTargets'};
 const snapshot=JSON.stringify(initial.map(([key])=>key)),bonuses=[];
 for(const option of options){
  const picked=initial.length===1?{key:initial[0][0]}:await choose(spell,initial.map(([key,target])=>({key,name:target.name??key,description:''})),null,
   {prompt:game.i18n.format('AZEROTH.Signature.ChooseHealingRecipient',{name:option.name,amount:option.amount})});
  if(!picked)return {ok:false,reason:'cancelled'};
  if(!actor.isOwner||!initial.some(([key])=>key===picked.key)||JSON.stringify(recipients().map(([key])=>key))!==snapshot
   ||readGrantingClass()!==grantingClass||JSON.stringify(optionsFor(actor,readGrantingClass()))!==JSON.stringify(options))return {ok:false,reason:'changed'};
  bonuses.push({...option,recipient:picked.key});
 }
 return {ok:true,bonuses};
}
