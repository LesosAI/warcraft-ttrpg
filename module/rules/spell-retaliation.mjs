/** Spell retaliation is distinct from the Imp ability also called Fire Shield.
 * Read only the printed, unconditional melee-hit clause. This descriptor does
 * not imply an area pulse or damage at casting time.
 */
export function spellRetaliationFrom(item) {
  if (item?.type !== 'spell') return null;
  const system = item.system ?? {};
  const text = String(system.effect ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const matches = [...text.matchAll(/\ba creature that hits (you|the target) with a melee attack takes (\d+) Fire damage\./gi)];
  if (matches.length !== 1) return null;
  const [, holder, amount] = matches[0];
  const recipient = holder.toLowerCase() === 'you' ? 'caster' : 'target';
  const target = String(system.target ?? '').trim().toLowerCase();
  if (recipient === 'caster' ? target !== 'self' : target !== 'one creature') return null;
  const rating = Number(amount);
  if (!Number.isSafeInteger(rating) || rating <= 0) return null;
  return { recipient, damage: { rating, school: 'fire' }, trigger: 'melee-hit' };
}
