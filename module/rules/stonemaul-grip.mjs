/** 02: Stonemaul Grip prevents Disarm, not voluntary dropping or unequipping. */
export function stonemaulGrip(talents = []) {
  return talents.some(t => String(t.race ?? '').toLowerCase() === 'ogre'
    && t.identifier === 'stonemaul-grip' && Number(t.taken) > 0);
}
