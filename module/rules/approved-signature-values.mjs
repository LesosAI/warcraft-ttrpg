/** Numerical clauses approved in SIGNATURE-PROPOSALS.md. Pure: callers enforce
 * equipment, form, trigger, recipient and use limits before using these values.
 * Inputs are own ability modifiers and purchased Skill Ranks, never total Test
 * bonuses or borrowed form statistics. Snapshot the result at commitment.
 */
const RULES = Object.freeze({
  'jangthraze-the-protector': {mods:['con'],calculate:s=>({temporaryHealth:2*s.mods.con})},
  'mace-of-unending-life': {mods:['wis'],calculate:s=>({healing:s.mods.wis,shared:'unending-life'})},
  'spinal-reaper': {mods:['str'],sl:true,calculate:s=>({temporaryHealth:s.mods.str+s.sl})},
  'staff-of-the-qiraji-prophets': {mods:['int'],calculate:s=>({damage:s.mods.int,school:'arcane'})},
  'the-horsemans-blade': {skills:['intimidation'],sl:true,calculate:s=>({damage:s.skills.intimidation+s.sl,school:'fire'})},
  'conquerors-battlegear': {skills:['warfare'],calculate:s=>({parryTest:s.skills.warfare})},
  'balebrew-charm': {mods:['con'],calculate:s=>({temporaryHealth:2*s.mods.con})},
  'band-of-veiled-shadows': {skills:['stealth'],calculate:s=>({damage:s.skills.stealth,hidingBoons:1})},
  'brightbrew-charm': {mods:['con'],skills:['medicine'],calculate:s=>({healing:s.mods.con+s.skills.medicine})},
  'cannonball-runner': {mods:['int'],skills:['tinkering'],calculate:s=>{
    const damage=2*s.mods.int+s.skills.tinkering;
    return {damage,passedDamage:Math.floor(damage/2),school:'physical',dc:10+s.mods.int+s.skills.tinkering};
  }},
  'cloak-of-unending-life': {mods:['wis'],calculate:s=>({healing:s.mods.wis,shared:'unending-life'})},
  'death-grips': {mods:['con'],calculate:s=>({healing:s.mods.con})},
  'drape-of-vaulted-secrets': {skills:['arcana'],calculate:s=>({damage:s.skills.arcana,school:'arcane'})},
  'horned-viking-helmet': {mods:['str'],skills:['athletics'],calculate:s=>({dc:10+s.mods.str+s.skills.athletics})},
  'idol-of-brutality': {mods:['con'],calculate:s=>({damage:s.mods.con,school:'physical'})},
  'idol-of-ferocity': {mods:['dex'],calculate:s=>({damage:s.mods.dex,school:'physical'})},
  'libram-of-hope': {mods:['cha'],calculate:s=>({healing:s.mods.cha})},
  'libram-of-truth': {skills:['spiritLore'],calculate:s=>({damage:s.skills.spiritLore,school:'holy'})},
  'piccolo-of-the-flaming-fire': {mods:['cha'],skills:['performance'],calculate:s=>({targets:s.skills.performance,dc:10+s.mods.cha+s.skills.performance,attackBanes:1})},
  'pimgibs-collar': {casting:true,calculate:s=>({damage:s.castingModifier,school:'fire'})}
});

export const APPROVED_SIGNATURE_IDENTIFIERS=Object.freeze(Object.keys(RULES));
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&Number.isInteger(value);
const nonnegative=value=>Math.max(0,value);

/** Null means missing/invalid required data or an unknown signature. No
 * fallback to primary-class casting, total skill modifiers or arbitrary code.
 */
export function approvedSignatureValues(identifier,{ownModifiers={},skillRanks={},sl,castingModifier}={}) {
  if(!Object.hasOwn(RULES,identifier))return null;
  const rule=RULES[identifier];
  const state={mods:{},skills:{}};
  for(const key of rule.mods??[]){
    if(!valid(ownModifiers[key]))return null;
    state.mods[key]=nonnegative(ownModifiers[key]);
  }
  for(const key of rule.skills??[]){
    if(!valid(skillRanks[key])||skillRanks[key]<0)return null;
    state.skills[key]=skillRanks[key];
  }
  if(rule.sl){if(!valid(sl)||sl<0)return null;state.sl=sl;}
  if(rule.casting){if(!valid(castingModifier))return null;state.castingModifier=nonnegative(castingModifier);}
  return rule.calculate(state);
}
