/** End-turn damage is a separate event from a spell's initial hit. In
 * particular, Pyroclasm's 16-point cast must not replace its 4-point ground. */
export function endTurnDamageFrom(item) {
 if(item?.type!=='spell')return null;
 const s=item.system??{},text=String(s.effect??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const clauses=[...text.matchAll(/\ba creature that (touches it or )?ends its turn (within (\d+) feet of you|in it) takes (\d+) Fire damage\./gi)];
 if(clauses.length!==1)return null;
 const [,touch,place,feet,amount]=clauses[0];
 const rating=Number(amount),radius=feet===undefined?null:Number(feet);
 if(!Number.isSafeInteger(rating)||rating<=0||(radius!==null&&(!Number.isSafeInteger(radius)||radius<=0)))return null;
 const self=place.toLowerCase().startsWith('within');
 if(self&&String(s.target??'').trim().toLowerCase()!=='self')return null;
 return {when:'turnEnd',centre:self?'self':'area',feet:radius,damage:{rating,school:'fire'},touch:!!touch};
}

/** Carry only a successful spell's explicit timing descriptor. */
export function endTurnDamageStamp(flags,centre){
 const row=flags?.endTurnDamage;
 if(flags?.kind!=='spell'||flags.success!==true||typeof flags.cast!=='string'||!flags.cast
  ||row?.when!=='turnEnd'||row.centre!==centre||!['self','area'].includes(centre)
  ||row.damage?.school!=='fire'||!Number.isSafeInteger(row.damage.rating)||row.damage.rating<=0
  ||typeof row.touch!=='boolean'
  ||(centre==='self'? !Number.isSafeInteger(row.feet)||row.feet<=0 : row.feet!==null))return null;
 return {endTurnDamage:structuredClone(row),signatureDamageCast:flags.cast};
}

/** An effect (`self`) or a Region (`area`) carrying an end-turn damage row of that centre: the
 * first thing `effects/end-turn-damage.mjs#deliverEndTurnDamage` asks of each, since its stored
 * row must equal the cast's, whose `when` is `turnEnd` and whose `centre` is the one asked. */
export function endTurnDamageArmed(doc,centre){
 const row=doc?.flags?.['azeroth-rpg']?.endTurnDamage;
 return row?.when==='turnEnd'&&row.centre===centre;
}

/** **WHETHER A TURN'S END CAN MEET END-TURN DAMAGE** (`AzerothCombat#_onEndTurn`, team IMP after
 * fix run MC-R): a token on a scene where a Region, or another token's effect, is armed. Asked
 * BEFORE the door's module is imported, because the `import()` alone took about 1 s at every end
 * of every turn on the test machine, for tokenless combatants and quiet scenes alike.
 * @param {{id?: string, parent?: {regions?: Iterable<object>, tokens?: Iterable<object>}}|null} token
 * @returns {boolean} */
export function endTurnDamageCanReach(token){
 const scene=token?.parent;
 if(!scene)return false;
 for(const region of scene.regions??[])if(endTurnDamageArmed(region,'area'))return true;
 for(const other of scene.tokens??[]){
  if(!other||other.id===token.id)continue;
  for(const effect of other.actor?.effects??[])if(endTurnDamageArmed(effect,'self'))return true;
 }
 return false;
}

export function casterLifeEnded({type,health,steps,limit}={}){
 if(type==='npc')return Number.isFinite(health)&&health<=0;
 return type==='character'&&Number.isInteger(steps)&&Number.isInteger(limit)&&limit>0&&steps>=limit;
}
