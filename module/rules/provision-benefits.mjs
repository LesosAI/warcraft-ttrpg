/** 08 §12 ordinary drinks. Pure next-Test carriers; contextual tests remain a judgement. */
export const PROVISION_BENEFIT = "provisionBenefit";
export const DRINK_BENEFITS = Object.freeze({
  "spiced-tea": {name:"Spiced tea", family:"awake", daily:false},
  "orcish-grog": {name:"Orcish grog", family:"spirit", daily:true},
  "dwarven-stout": {name:"Dwarven stout", family:"spirit", daily:true},
  "frostwolf-marrow-broth": {name:"Frostwolf marrow-broth", family:"body", daily:true}
});
export function drinkBenefitOf(item) {
  if(item?.type!=="gear" || item.system?.provision!=="drink")return null;
  const key=item.system?.identifier;
  return DRINK_BENEFITS[key]?{key,...DRINK_BENEFITS[key],img:item.img??null}:null;
}
export function liveDrinkBenefits(effects=[],{includeClaimed=false}={}) {
  return [...effects].filter(e=>!e.disabled && e.active!==false && !e.isSuppressed
    && e.duration?.expired!==true && (includeClaimed||!e.flags?.["azeroth-rpg"]?.provisionTestClaim)
    && DRINK_BENEFITS[e.flags?.["azeroth-rpg"]?.[PROVISION_BENEFIT]?.key]);
}
export function drinkTestBenefits(effects=[],{kind,resilience,chosen=null}={}) {
  const eligible=liveDrinkBenefits(effects).filter(e=>{
    const family=DRINK_BENEFITS[e.flags["azeroth-rpg"][PROVISION_BENEFIT].key].family;
    return family==="awake" || kind==="resilience"&&family===resilience;
  });
  // Repeated portions of the same drink refresh one benefit; separate named items stack (08 §6).
  return eligible.filter((e,i)=>eligible.findIndex(other=>other.flags["azeroth-rpg"][PROVISION_BENEFIT].key===e.flags["azeroth-rpg"][PROVISION_BENEFIT].key)===i)
    .filter(e=>chosen===null || (DRINK_BENEFITS[e.flags["azeroth-rpg"][PROVISION_BENEFIT].key].family!=="awake" || chosen.includes(`provision:${e.id??e._id}`)))
    .filter(e=>chosen===null || !(DRINK_BENEFITS[e.flags["azeroth-rpg"][PROVISION_BENEFIT].key].family==="spirit" && chosen.includes("equipment:kreeg-fear")));
}
export function drinkModifiers(effects=[],context={}) {
  const automatic=[],judgement=[];
  for(const e of drinkTestBenefits(effects,context)) {
    const entry=DRINK_BENEFITS[e.flags["azeroth-rpg"][PROVISION_BENEFIT].key], awake=entry.family==="awake";
    (awake?judgement:automatic).push({id:`provision:${e.id??e._id}`,name:entry.name,
      label:awake?"AZEROTH.ProvisionBenefit.Awake":"AZEROTH.ProvisionBenefit.Next",
      note:awake?"AZEROTH.ProvisionBenefit.Awake":"AZEROTH.ProvisionBenefit.Next",boons:1,banes:0,modifier:0,checked:!awake});
  }
  return {automatic,judgement};
}
