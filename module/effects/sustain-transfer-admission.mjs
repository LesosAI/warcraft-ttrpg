import { sustainEntryTransferPending } from "../rules/sustain-entry-transfer.mjs";

/** New sustained casts must not replace a held record owned by an unfinished
 * transaction. Call before payment and again after any pre-payment chooser.
 * The GM transfer coordinator must also revalidate casts already in flight.
 */
export function refuseSustainTransferStart(actor) {
  const pending = (actor?.getFlag?.("azeroth-rpg", "sustaining") ?? [])
    .find(entry => sustainEntryTransferPending(entry, actor.uuid));
  if (!pending) return false;
  ui.notifications?.warn(game.i18n.format("AZEROTH.Spellsteal.StartPending", { name: actor.name, spell: pending.name ?? "" }));
  return true;
}
