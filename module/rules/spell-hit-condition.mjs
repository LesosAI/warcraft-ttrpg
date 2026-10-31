import { AZEROTH } from "../config.mjs";

/** Only the unambiguous single-target SL rider. Resisted/area clauses are separate rules. */
export function spellHitCondition(effect, {success=false,sl=0}={}) {
  if (!success) return null;
  const text=String(effect ?? "").replace(/<[^>]*>/g," ").replace(/\*\*/g,"").replace(/\s+/g," ");
  const match=/\bAt SL (\d+) or better (?:it|the target) is ([A-Za-z]+) until the end of its next turn\./i.exec(text);
  if (!match || Number(sl)<Number(match[1])) return null;
  const status=match[2].toLowerCase();
  if (!Object.hasOwn(AZEROTH.conditions,status)) return null;
  return {status,at:Number(match[1]),until:"targetNextTurnEnd"};
}
