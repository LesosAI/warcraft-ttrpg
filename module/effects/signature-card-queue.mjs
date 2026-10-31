// Serialize the complete operation, including transfer choices and countdown,
// rather than only the final bonus write. Durable claims remain authoritative
// after a reload or GM handoff; this queue only orders work on the active GM.
const tails=new Map();
export function queueSignatureCard(message,execute) {
 const key=message?.uuid;
 if(typeof key!=='string'||!key||typeof execute!=='function')return Promise.resolve({ok:false,reason:'context'});
 const previous=tails.get(key)??Promise.resolve();
 const result=previous.then(execute,execute);
 const tail=result.then(()=>{},()=>{});
 tails.set(key,tail);
 void tail.then(()=>{if(tails.get(key)===tail)tails.delete(key);});
 return result;
}
