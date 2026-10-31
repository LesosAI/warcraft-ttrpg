import {physicalHalf} from './shapes.mjs';
import {strikeForRow} from './strikes.mjs';

/** Identify a real attack row of the current Shapeshift snapshot. An item
 * called Claws, a stale row after shifting, or an Avatar is not this source.
 * Returns form names without deciding which species an idol recognizes.
 */
export function signatureNaturalStrike(shape,strike){
  if(shape?.kind!=='shapeshift'||!Array.isArray(shape.forms)||strike?.weapon!==null)return null;
  const index=strike.row?.index;
  if(!Number.isInteger(index)||index<0)return null;
  const physical=physicalHalf(shape.forms),row=physical?.attacks?.[index];
  const mode={melee:'hand',thrown:'thrown',ranged:'shot'}[strike.rangeKind];
  if(!row||!mode||row.name!==strike.row.name)return null;
  const expected=strikeForRow(row,{index,mode});
  if(expected.rangeKind!==strike.rangeKind||expected.form!==strike.form)return null;
  return {index,name:row.name,attackForm:row.form,forms:shape.forms.map(form=>form.name)};
}

/** Approved idol categories of a validated natural attack. A Chimera qualifies
 * through any of its constituent forms, not only the form supplying this row.
 * Keep exact catalogue names: an arbitrary creature named "Bear" is not enough.
 */
export function signatureIdolForms(shape,strike){
  const natural=signatureNaturalStrike(shape,strike);
  if(!natural)return [];
  const categories=[];
  if(natural.forms.some(name=>name==='Black Bear'||name==='Ironfur Bear'))categories.push('bear');
  if(natural.forms.includes('Mountain Lion'))categories.push('cat');
  return categories;
}
