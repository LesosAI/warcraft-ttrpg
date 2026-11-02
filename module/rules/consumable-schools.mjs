/** 08 Elixirs: the generic catalogue entry has not yet named its brewed school. */
export function wardingElixir(use,name,schools=[]) {
  if (!["draught","elixir"].includes(use?.kind)) return null;
  const match=/^Ward (\d+) in one named school\.?$/i.exec(String(use.note??'').trim());
  if(!match || !(Number(match[1])>0))return null;
  const named=String(name??'').trim().toLowerCase();
  return {amount:Number(match[1]),school:schools.find(s=>named===`elixir of ${s} warding`)??null,
    duration:{value:1,units:'hours'}};
}

export function wardingElixirChange(spec,school,schools=[]) {
  if(!spec||!schools.includes(school)||spec.school&&spec.school!==school)return null;
  return {key:`system.ward.${school}`,type:'upgrade',value:String(spec.amount),phase:'final'};
}
export const SUPREME_POWER_FLAG = 'supremePower';

/** Recognizes existing held copies; one chosen-school bonus is refreshed per actor. */
export function supremePower(use) {
  if (!['draught', 'elixir'].includes(use?.kind)
    || !/^For one hour, gain 2 Spellpower in one school chosen when you drink it\.$/i.test(String(use.note ?? '').trim())) return null;
  return {amount:2, duration:{value:1, units:'hours'}};
}

export function supremePowerChange(spec, school, schools = []) {
  if (!spec || !schools.includes(school)) return null;
  return {key:`system.spellpower.${school}`, type:'add', value:String(spec.amount), phase:'final'};
}
