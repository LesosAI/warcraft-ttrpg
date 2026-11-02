import { BLOCK_REDUCTION, blockReduction, markAnswers, mitigatedDamage } from "../rules/reactions.mjs";
import { damageTransferStages } from "../rules/damage-transfer-stages.mjs";
import { etherealOn } from "./spirit-realm.mjs";
import {invulnerabilityPotionActive,preventPhysicalDamage} from '../rules/invulnerability-potion.mjs';

const whole = n => Math.max(0, Math.trunc(Number(n)) || 0);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** Read current actor defenses without consuming a reaction or writing damage.
 * The coordinator supplies the authoritative recorded row and attack metadata,
 * never amounts from the requesting client. Re-read after every owner prompt.
 * Throwing refuses preparation; it must not fall back to an unshared hit.
 */
export function readDamageTransferInput({ target, row, messageId = null, type = row?.type ?? null,
  attack = false, spell = false, by = null, moved = false, shared = false } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id
    || target?.documentName !== "Actor" || resolve(target.uuid) !== target
    || (by && resolve(by.uuid) !== by) || !row || row.hit !== true || row.withdrawn === true
    || !Number.isSafeInteger(row.damage) || row.damage < 0
    || (row.parts != null && (!Array.isArray(row.parts)
      || row.parts.some(part => !Number.isSafeInteger(part?.damage) || part.damage < 0)))) {
    throw Error("Invalid authoritative transfer input");
  }
  const held = attack ? target.getFlag("azeroth-rpg", "mitigate") ?? null : null;
  const mark = markAnswers(held, messageId) ? held : null;
  const negate = mark?.negate === true, halve = !negate && mark?.halve === true;
  const flatReduction = !mark || negate || halve ? 0 : mark.reaction === "block"
    ? blockReduction({ bonus: mark.bonus ?? Math.max(0, (mark.amount ?? BLOCK_REDUCTION) - BLOCK_REDUCTION) })
    : whole(mark.amount);
  const standingReduction = whole(target.system?.damageReduction);
  const woundedRanks = attack ? whole(target.talentRanks?.("Wounded Beast")) : 0;
  // Read Ethereal even if ordinary Ward reduced this record to zero: Soul Link
  // reconstructs pre-Ward damage and may still have a Physical component.
  const ethereal = Boolean(etherealOn(target));
  const potionProtected=invulnerabilityPotionActive(target.effects??[]);
  const currentDamage=potionProtected?preventPhysicalDamage({damage:row.damage,type,parts:row.parts}):row;
  const stages = damageTransferStages({ amount: mitigatedDamage(currentDamage.damage, mark), type, parts: currentDamage.parts,
    ethereal, standing: standingReduction, woundedRanks, attack });
  return { target, row, messageId, type, attack, spell, by, moved, shared,
    redirectAmount: stages.redirectAmount, divisionAmount: stages.divisionAmount,
    flatReduction, negate, halve, ethereal, standingReduction, woundedRanks,
    sourceState: structuredClone({ mark, ethereal, standingReduction, woundedRanks, potionProtected,
      health: target.system?.health ?? null }) };
}
