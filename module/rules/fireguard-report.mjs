/** Plain report rows. The chat adapter localizes labels and escapes every value. */
export function fireguardReport(state = {}) {
  const payment = (done, attempted) => done === true ? "confirmed" : attempted ? "uncertain" : "notAttempted";
  return [
    { label: "Action", value: payment(state.paid, state.paymentAttempted), translate: true },
    { label: "Mana", value: payment(state.manaPaid, state.manaAttempted), translate: true },
    { label: "Resistance", value: state.resisted === true ? "passed" : state.resisted === false ? "failed" : "unresolved", translate: true },
    { label: "Damage", value: state.immune ? "immune" : state.damageApplied ? String(state.damage)
      : state.damageAttempted ? "uncertain" : state.damage === 0 ? "0" : "notAttempted",
      translate: state.immune === true || (!state.damageApplied && state.damage !== 0) },
    { label: "Burn", value: state.burn?.ok ? "confirmed" : state.burnAttempted ? "uncertain" : "notAttempted", translate: true }
  ];
}
