// Client-local serialization: this is not cross-client or durable authority.
const active = new Set();

/** Hold one actor's local Use operation through choices, writes and its card. */
export function acquireConsumableUse(actor) {
  const key=actor?.uuid;
  if(typeof key!=="string"||!key||active.has(key))return null;
  active.add(key);
  let released=false;
  return ()=>{if(!released){released=true;active.delete(key);}};
}
