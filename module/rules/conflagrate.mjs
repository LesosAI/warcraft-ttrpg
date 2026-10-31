/** 07 Conflagrate. The adapter supplies live effect snapshots; display names
 * never establish that an effect came from Immolate. A narrative/environmental
 * fire can be supplied separately as burning, since it has no tick carrier. */
export function conflagrateState({effects = [], burning = false} = {}) {
  const live = effects.filter(effect => effect && effect.active !== false && effect.disabled !== true
    && effect.suppressed !== true && effect.duration?.expired !== true && effect.live !== false);
  const fires = live.filter(effect => {
    const flags = effect.flags?.['azeroth-rpg'];
    const tick = flags?.tick;
    // Fel Fire changes Immolate's damage school, not the spell it sustains.
    const fire = tick?.type === 'fire' || (tick?.type === 'fel' && flags.identifier === 'immolate');
    return tick?.kind === 'damage' && fire && Number(tick.amount) > 0;
  });
  const immolates = fires.filter(effect => {
    const flags = effect.flags?.['azeroth-rpg'];
    return flags.identifier === 'immolate' && flags.sustained === true
      && typeof flags.cast === 'string' && flags.cast.length > 0
      && typeof effect.origin === 'string' && effect.origin.length > 0 && effect.id;
  }).map(effect => ({effectId: effect.id, cast: effect.flags['azeroth-rpg'].cast, casterUuid: effect.origin}))
    .sort((a,b) => a.effectId.localeCompare(b.effectId));
  return {burning: burning === true || fires.length > 0, immolates};
}

/** All Damage Rating additions are supplied before the Immolate multiplier.
 * Mitigation (Ward, immunity, vulnerability) follows this calculation.
 * A null rating means no damage roll/application, not zero damage that still
 * triggers hit riders. The caller still pays the spell on this fizzle. */
export function conflagrateRating(rating, {burning = false, immolates = []} = {}) {
  if (!burning) return {rating: null, fizzles: true, multiplier: 1};
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0) {
    throw new TypeError('Conflagrate requires a finite nonnegative Damage Rating');
  }
  const multiplier = immolates.length ? 2 : 1;
  return {rating: rating * multiplier, fizzles: false, multiplier};
}
