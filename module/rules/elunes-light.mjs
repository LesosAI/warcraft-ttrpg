import { talentEffect } from './talent-effects.mjs';

/** Open night sky is explicitly adjudicated per token, never inferred from
 * scene darkness (which also describes caves and interiors). */
export function elunesLightRadius({ confirmed = false, hidden = false, burrowed = false, talents = [] } = {}) {
  if (confirmed !== true || hidden || burrowed) return 0;
  return talents.some(item => item.type === 'talent' && item.system?.taken > 0
    && talentEffect(item.system.className, item.system.identifier, item.system.race)?.onUse?.elunesLight) ? 10 : 0;
}
