import { AZEROTH } from "../config.mjs";

/**
 * Only the unambiguous single-target SL rider. Resisted/area clauses are separate rules.
 *
 * Two shapes: *At SL N or better it/the target is X until the end of its next turn.*
 * (Starfire, Lightning Bolt, Lightning Strike) and *At SL N or better it is knocked
 * Prone.* (07's Stone Spike; D-812), which carries no span of its own - A1's Prone
 * lasts until the creature stands - so `until` is null.
 */
export function spellHitCondition(effect, {success=false,sl=0}={}) {
  if (!success) return null;
  const text=String(effect ?? "").replace(/<[^>]*>/g," ").replace(/\*\*/g,"").replace(/\s+/g," ");
  const match=/\bAt SL (\d+) or better (?:it|the target) is ([A-Za-z]+) until the end of its next turn\./i.exec(text);
  const knocked=match ? null : /\bAt SL (\d+) or better (?:it|the target) is knocked (Prone)\s*\./.exec(text);
  const m=match ?? knocked;
  if (!m || Number(sl)<Number(m[1])) return null;
  const status=m[2].toLowerCase();
  if (!Object.hasOwn(AZEROTH.conditions,status)) return null;
  return {status,at:Number(m[1]),until:match ? "targetNextTurnEnd" : null};
}
