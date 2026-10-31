/** Wait for already queued talent/class restamping before reading a Use's data.
 * Descendant hooks start the sync but core does not await that returned work.
 * Do not start another sync here or retain an item withdrawn while waiting. */
export async function featureReady(actor, item) {
  const held = item?.id && actor?.items?.get(item.id) === item;
  let sync = actor?._featureSync;
  while (sync) {
    await sync;
    if (actor._featureSync === sync) break;
    sync = actor._featureSync;
  }
  return !held || actor.items.get(item.id) === item;
}
