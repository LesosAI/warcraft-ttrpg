import {mindControlOn} from "../rules/mind-control.mjs";

/** Resolve active carriers to exact combatants. Linked copies are selected only
 * by their original card speaker token; synthetic actors never fall back to a
 * shared world actor id. Read-only: callers still authorize combat writes.
 */
export function mindControlCombatLinks(combat,{resolve=globalThis.fromUuidSync}={}) {
  const rows=Array.from(combat?.combatants ?? []);
  const actors=[...new Set(rows.map(row=>row.actor).filter(Boolean))];
  const links=[],issues=[];
  const select=(actor,speaker)=>{
    const candidates=rows.filter(row=>row.actor===actor);
    if (speaker?.token || speaker?.scene) {
      if (!speaker.token || !speaker.scene) return null;
      const exact=candidates.filter(row=>row.tokenId===speaker.token
        && (row.sceneId ?? row.parent?.scene?.id)===speaker.scene);
      return exact.length===1 ? exact[0] : null;
    }
    return candidates.length===1 ? candidates[0] : null;
  };
  for (const actor of actors) for (const effect of actor.effects ?? []) {
    const record=mindControlOn(effect,actor.uuid);
    if (!record) continue;
    const issue=reason=>issues.push({effectUuid:effect.uuid,reason});
    const target=resolve(record.targetUuid),caster=resolve(record.casterUuid);
    if (target!==actor || !caster) {issue("missingActor");continue;}
    let casterSpeaker,targetSpeaker;
    if (record.turnIdentity) {
      const speaker=ref=>ref ? {scene:ref.sceneId,token:ref.tokenId} : null;
      casterSpeaker=speaker(record.turnIdentity.caster);
      targetSpeaker=speaker(record.turnIdentity.target);
    } else {
      const cast=resolve(record.messageUuid),result=resolve(record.resultUuid);
      // Legacy carriers have no token snapshot. Missing cards are unresolved,
      // never an invitation to choose another linked copy of the actor.
      if (!cast || !result) {issue("missingSourceCard");continue;}
      casterSpeaker=cast.speaker;targetSpeaker=result.speaker;
    }
    const casterRow=select(caster,casterSpeaker),targetRow=select(target,targetSpeaker);
    if (!casterRow || !targetRow) {issue("ambiguousCombatant");continue;}
    if (casterRow===targetRow) {issue("selfControl");continue;}
    links.push({effectUuid:effect.uuid,casterId:casterRow.id,targetId:targetRow.id,record});
  }
  const conflicts=new Set(links.filter(link=>links.filter(other=>other.targetId===link.targetId).length>1).map(link=>link.targetId));
  for (const link of links) if (conflicts.has(link.targetId)) issues.push({effectUuid:link.effectUuid,reason:"competingControls"});
  return {links:links.filter(link=>!conflicts.has(link.targetId)),issues};
}
