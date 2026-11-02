import {signatureHiddenChoices} from '../rules/signature-skill-choices.mjs';
import {signatureTurnAvailable} from '../rules/signature-turn-uses.mjs';
import {signatureTurnContext,SIGNATURE_TURN_FLAG} from '../effects/signature-turn-use.mjs';

/** The first Test's declaration never carries into Extra Attack. Ask only when
 * the second Test can still use the Band, before its die or payment occurs. */
export async function confirmBandExtraAttack(actor,spec){
 const chosen=(spec.chosen??[]).filter(id=>!id.startsWith('signature-band-hidden-'));
 const rows=()=>signatureHiddenChoices({...spec,targets:spec.targets??(spec.target?[spec.target]:[]),
  signatures:actor.system?.signatureEffects?.scalingHitDamage??[]});
 const offered=rows();
 const available=()=>signatureTurnAvailable(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)?.['band-of-veiled-shadows'],signatureTurnContext(actor));
 if(!offered.length||!available())return {...spec,chosen};
 const weapon=actor.items.get(spec.weaponId);
 const valid=()=>actor.isOwner&&actor.items.get(spec.weaponId)===weapon
  &&actor.readyWeapons?.().includes(weapon)&&JSON.stringify(rows())===JSON.stringify(offered);
 if(!valid())return null;
 const box=document.createElement('div');
 for(const row of offered){
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.name=row.id;
  label.className='checkbox azeroth-dialog-line';
  label.append(input,document.createTextNode(`${row.name}: ${game.i18n.localize(row.label)}`));box.append(label);
 }
 const answer=await foundry.applications.api.DialogV2.wait({
  window:{title:game.i18n.localize('AZEROTH.Signature.BandExtraAttack')},
  classes:['azeroth','azeroth-band-extra'],position:{width:520},content:box.innerHTML,rejectClose:false,
  buttons:[{action:'attack',label:game.i18n.localize('AZEROTH.Signature.BandContinue'),
   callback:(_event,button)=>offered.filter(row=>button.form.elements[row.id]?.checked).map(row=>row.id)},
   {action:'cancel',label:game.i18n.localize('AZEROTH.ChainLightning.Review.Cancel'),default:true,callback:()=>false}]
 });
 // V14 replaces a null callback result with the button action string.
 // Only the Attack callback's array (including an empty declaration) proceeds.
 if(!Array.isArray(answer)||!valid())return null;
 return {...spec,chosen:[...chosen,...(available()?answer:[])]};
}
