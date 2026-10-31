/** Preserve existing signature sources when adding granting-class scaling. */
import {rawSystem,walkWorld} from './walk.mjs';
export function signatureCastingUpdate(raw) {
 const chosen=raw?.signatureEffect?.chosenSpellDamage;
 return chosen&&!Object.hasOwn(chosen,'casting')?{'system.signatureEffect.chosenSpellDamage.casting':false}:null;
}
export async function migrate(log=console.log) {
 return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureCastingUpdate(rawSystem(doc)):null},log);
}
