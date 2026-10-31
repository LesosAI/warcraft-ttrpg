import {signatureIdolForms} from '../rules/signature-natural-strike.mjs';
import {heldAugment,signatureAugmentAllowed} from '../rules/augments.mjs';

/** Read before the Test. The GM reconstructs this same source before publishing;
 * changing form, active idol, gates or own modifiers invalidates the snapshot.
 * No caller-supplied damage value is trusted.
 */
export function captureIdolHitSource(actor,strike){
  if(actor?.type!=='character')return null;
  const form=signatureIdolForms(actor.shape,strike);
  if(!form.length)return null;
  const items=Array.from(actor.items?.values?.()??actor.items??[]);
  const held=heldAugment(items),item=held?.item;
  const identifier=item?.system?.identifier;
  if(!['idol-of-brutality','idol-of-ferocity'].includes(identifier)
    ||!signatureAugmentAllowed(item,items,actor.classNames??[]))return null;
  const signatures=(actor.system.signatureEffects?.scalingHitDamage??[])
    .filter(row=>row.identifier===identifier&&row.itemId===item.id);
  if(signatures.length!==1)return null;
  const key=identifier==='idol-of-brutality'?'con':'dex';
  const modifier=actor.system.abilities?.[key]?.own?.mod;
  if(!Number.isInteger(modifier))return null;
  return structuredClone({strike,form,activeAugmentId:item.id,signatures,
    ownModifiers:{[key]:modifier},shapeForms:actor.shape.forms});
}

export function idolHitSourceMatches(actor,snapshot){
  return Boolean(snapshot&&JSON.stringify(captureIdolHitSource(actor,snapshot.strike))===JSON.stringify(snapshot));
}
