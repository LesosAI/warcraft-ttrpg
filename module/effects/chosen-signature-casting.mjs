import {chosenSignatureOptions,signatureRecipientKey} from '../rules/signature-scaling.mjs';
export {signatureRecipientKey} from '../rules/signature-scaling.mjs';
function optionsFor(actor, school) {
  const ownModifiers=Object.fromEntries(Object.entries(actor?.system?.abilities ?? {}).map(([key,value])=>
    [key,value.own?.mod ?? value.mod]));
  return chosenSignatureOptions({signatures:actor?.system?.signatureEffects?.chosenSpellDamage ?? [],spellSchool:school,ownModifiers,
    skillRanks:actor?.type === 'npc' ? actor.system?.skills ?? {} : actor?.getFlag?.('azeroth-rpg','skillRanks') ?? {},
    classes:(actor?.classItems ?? []).map(item=>({itemId:item.id,schools:item.system?.schools ?? [],castingAbility:item.system?.castingAbility}))});
}

/** Pre-payment chooser; caller owns payment and damage delivery. Re-read both
 * the source and recipients after every await before accepting the selection.
 * No targets is an explicit unresolved state, not implicit first-target use.
 */
export async function prepareChosenSignatures({actor,spell,targets=[],choose,readTargets=()=>targets}={}) {
  const options=optionsFor(actor,spell?.system?.school);
  if (!options.length) return {ok:true,bonuses:[]};
  const recipients=()=>[...new Map(readTargets().map(t=>[signatureRecipientKey(t),t]).filter(([key])=>key)).entries()];
  const initial=recipients();
  if(!initial.length)return {ok:false,reason:'needsTargets'};
  const identity=JSON.stringify(initial.map(([key])=>key));
  const bonuses=[];
  for(const option of options){
    const picked=initial.length===1?{key:initial[0][0]}:await choose(spell,initial.map(([key,target])=>({key,name:target.name??key,description:''})),null,
      {prompt:game.i18n.format('AZEROTH.Signature.ChooseDamageRecipient',{name:option.name,amount:option.amount})});
    if(!picked)return {ok:false,reason:'cancelled'};
    if(!actor.isOwner || !initial.some(([key])=>key===picked.key)
      || JSON.stringify(recipients().map(([key])=>key))!==identity
      || !optionsFor(actor,spell.system.school).some(row=>JSON.stringify(row)===JSON.stringify(option)))
      return {ok:false,reason:'changed'};
    bonuses.push({...option,recipient:picked.key});
  }
  if(JSON.stringify(optionsFor(actor,spell.system.school))!==JSON.stringify(options))return {ok:false,reason:'changed'};
  return {ok:true,bonuses};
}
