/** Spell retaliation is distinct from the Imp ability also called Fire Shield.
 * Read only the printed, unconditional melee-hit clause. This descriptor does
 * not imply an area pulse or damage at casting time.
 */
export function spellRetaliationFrom(item) {
  if (item?.type !== 'spell') return null;
  const system = item.system ?? {};
  const text = String(system.effect ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  // **AND 07 §12's SCOURING VEIL** (D-864): *Each creature that hits you with a melee attack
  // takes 3 Physical damage and gains Decay 1* - its damage the Armor Points lane's, its Decay
  // laid by the one writer (`effects/decay.mjs`) when the retaliation is delivered.
  const matches = [...text.matchAll(/\b(?:a|each) creature that hits (you|the target) with a melee attack takes (\d+) (Fire|Physical) damage(?: and gains Decay (\d+))?\s*\./gi)];
  if (matches.length !== 1) return null;
  const [, holder, amount, word, decay] = matches[0];
  const recipient = holder.toLowerCase() === 'you' ? 'caster' : 'target';
  const target = String(system.target ?? '').trim().toLowerCase();
  if (recipient === 'caster' ? target !== 'self' : target !== 'one creature') return null;
  const rating = Number(amount);
  if (!Number.isSafeInteger(rating) || rating <= 0) return null;
  return { recipient, damage: { rating, school: word.toLowerCase() }, trigger: 'melee-hit', ...(decay ? { decay: Number(decay) } : {}) };
}
