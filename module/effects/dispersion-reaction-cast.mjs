import {resolveDispersionReaction} from './dispersion-reaction-resolution.mjs';
import {annotateHere} from '../dice/annotate.mjs';

const executions=new WeakSet();
/** Internal capabilities cannot be supplied through a serialized player request. */
export function validDispersionExecution(execution,actor,spell) {
  return executions.has(execution) && execution.actor===actor && execution.spell===spell
    && execution.valid()===true;
}

/** Called after the casting popup confirms, by the authenticated GM adapter.
 * The ordinary workflow owns all costs, counters, rolls and form creation. */
export async function castDispersionReaction({message,index,actor,spell,options={},validate,current=()=>true}={}) {
  if(spell?.parent!==actor || spell?.system?.identifier!=='dispersion'
    || typeof validate!=='function' || typeof current!=='function')return {ok:false,reason:'spell'};
  const choices={};
  for(const key of ['modifier','dc','boons','banes','overchannel','augment','talentLines','source'])
    if(Object.hasOwn(options,key))choices[key]=options[key];
  return resolveDispersionReaction({message,index,actor,validate,annotate:annotateHere,
    cast:async({valid})=>{
      const execution={actor,spell,valid:()=>current()===true && valid()};executions.add(execution);
      try {
        const {castSpell}=await import('../dice/workflows.mjs');
        return await castSpell({...choices,actor,spell,targets:[],dispersionExecution:execution});
      } finally {executions.delete(execution);}
    }});
}
