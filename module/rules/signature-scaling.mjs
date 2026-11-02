/** Pure inputs for build-scaled signatures. Values are snapshotted at commitment,
 * never recomputed when a posted card is applied or replayed.
 * This module does not select targets, spend uses, or mutate documents.
 */
import {resolveRecordedDamage} from './damage-record.mjs';
import {AZEROTH} from '../config.mjs';
const ATTRIBUTES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Stable cast recipient, including a token's actor binding. */
export function signatureRecipientKey(target) {
  if (!target?.actorId) return null;
  if (target.sceneId || target.tokenId) {
    return target.sceneId && target.tokenId ? `${target.sceneId}/${target.tokenId}/${target.actorId}` : null;
  }
  return `Actor/${target.actorId}`;
}

/** Resolve one approved attribute-based bonus. Never accept an arbitrary path
 * or expression from an item/card. Missing inputs fail closed, rather than
 * silently choosing the primary class or a borrowed form's modifier.
 */
export function attributeSignatureAmount(attribute, ownModifiers = {}) {
  if (!ATTRIBUTES.has(attribute) || !finite(ownModifiers[attribute])) return null;
  return Math.max(0, Math.trunc(ownModifiers[attribute]));
}

/** Allocate a bonus to one explicitly chosen recipient identity. Duplicate
 * target rows (arcs or repeated hits) do not duplicate this casting's bonus.
 * Caller supplies stable scene/token identities, or actor UUIDs off-scene.
 * A missing choice is not permission to select the first target.
 */
export function singleRecipientSignatureBonus({amount, recipient, targets = []} = {}) {
  if (!Number.isInteger(amount) || amount < 0 || typeof recipient !== 'string' || !recipient) return null;
  if (!Array.isArray(targets) || targets.some(key => typeof key !== 'string' || !key)) return null;
  const index = targets.indexOf(recipient);
  if (index < 0) return null;
  return targets.map((_, i) => i === index ? amount : 0);
}

/** Typed extras for one resolved row, sharing the same allocation for normal
 * damage, successful resistance and other mitigation alternatives.
 */
export function chosenSignatureExtras(bonuses = [], targets = [], index = null) {
  if(!Number.isInteger(index)||index<0||index>=targets.length)return [];
  return bonuses.flatMap(bonus=>{
    const allocation=singleRecipientSignatureBonus({...bonus,targets});
    return allocation?.[index]>0?[{type:bonus.school,amount:allocation[index]}]:[];
  });
}

/** A tick may consume the casting's bonus before its initial Apply. Rebuild
 * that recorded hit from its saved mitigation inputs; subtracting the nominal
 * bonus from final damage is wrong after resistance, Ward or vulnerability.
 * The cast appends its chosen extras after ordinary extras. Refuse an unknown
 * suffix rather than accidentally removing an unrelated identical bonus.
 */
export function withoutChosenSignatureDamage(row, bonuses = []) {
  const source=row?.mitigationSource;
  if(source?.version!==1 || !Array.isArray(source.input?.extras) || !bonuses.length)return null;
  const extras=source.input.extras, offset=extras.length-bonuses.length;
  if(offset<0 || bonuses.some((bonus,i)=>!Number.isInteger(bonus.amount)||bonus.amount<=0
    || extras[offset+i]?.type!==bonus.school || extras[offset+i]?.amount!==bonus.amount))return null;
  return {...row,...resolveRecordedDamage({...source.input,extras:extras.slice(0,offset)},{shrink:source.shrink??0})};
}

/** The lead's approved Qiraji staff amount. School is the spell's own school,
 * independently of damage conversion; no bonuses to ordinary weapon attacks.
 * Recipient allocation remains explicit via singleRecipientSignatureBonus.
 */
export function qirajiStaffAmount({spellSchool, damaging = false, ownModifiers = {}} = {}) {
  if (spellSchool !== 'arcane' || damaging !== true) return 0;
  return attributeSignatureAmount('int', ownModifiers);
}

/** Build serializable cast-time choices from the equipped signature reader.
 * Same signature on two copies is one option, with a fixed numerical amount.
 * This leaves recipient selection explicit and preserves provenance for cards.
 */
export function chosenSignatureOptions({signatures = [], spellSchool, ownModifiers = {}, skillRanks = {}, classes = [], castingAbility = null} = {}) {
  const seen = new Set(), options = [];
  for (const signature of signatures) {
    if (signature?.school !== spellSchool || typeof signature.identifier !== 'string' || !signature.identifier
      || typeof signature.itemId !== 'string' || !signature.itemId || seen.has(signature.identifier)) continue;
    // Exactly one source: malformed mixed descriptors must not silently pick one.
    if ([signature.attribute,signature.skill,signature.casting===true].filter(Boolean).length !== 1) continue;
    // Prefer the school-granting class. With no grant, the approved fallback
    // is the casting workflow's actual attribute, never an Attack substitution.
    const grant=signature.casting ? classes.find(row=>row.schools?.includes(spellSchool)) : null;
    const castAttribute=grant ? grant.castingAbility : castingAbility;
    if(signature.casting && ((grant&&!grant.itemId)||!ATTRIBUTES.has(castAttribute)))continue;
    const rank = skillRanks[signature.skill] ?? 0;
    const amount = signature.skill
      ? (Object.hasOwn(AZEROTH.skills,signature.skill) && Number.isInteger(rank) && rank >= 0 ? rank : null)
      : attributeSignatureAmount(signature.casting ? castAttribute : signature.attribute, ownModifiers);
    if (amount === null || amount <= 0) continue;
    seen.add(signature.identifier);
    options.push({identifier:signature.identifier,itemId:signature.itemId,name:String(signature.name ?? ''),
      school:spellSchool,...(signature.skill ? {skill:signature.skill} : signature.casting
        ? {casting:true,classId:grant?.itemId??null,attribute:castAttribute} : {attribute:signature.attribute}),amount});
  }
  return options;
}
