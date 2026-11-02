/** Health is a gadget cost, not damage: leave protection and temporary Health alone. */
export async function payGadgetHealth(actor, cost) {
  const before = actor?.system?.health?.value;
  if (!Number.isFinite(before) || !Number.isInteger(cost) || cost <= 0 || before - cost < 1)
    throw Error('Gadget Health payment is no longer available.');
  const expected = before - cost;
  await actor.update({ 'system.health.value': expected });
  if (actor.system?.health?.value !== expected)
    throw Error('Gadget Health payment was not confirmed; inspect the actor before retrying.');
}
