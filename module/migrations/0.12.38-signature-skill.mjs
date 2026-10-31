/** Add the optional Skill Rank source without changing existing signatures. */
import {rawSystem,walkWorld} from './walk.mjs';
export function signatureSkillUpdate(raw) {
  const chosen=raw?.signatureEffect?.chosenSpellDamage;
  return chosen && !Object.hasOwn(chosen,'skill') ? {'system.signatureEffect.chosenSpellDamage.skill':null} : null;
}
export async function migrate(log=console.log) {
  return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureSkillUpdate(rawSystem(doc)):null},log);
}
