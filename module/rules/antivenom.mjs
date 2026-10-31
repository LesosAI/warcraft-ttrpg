import {curePoisonJudgement} from './cure-poison.mjs';

export function isAntivenom(use) {
  return use?.kind === 'draught' && use.target === 'self' && /^End one poison\.?$/i.test(String(use.note ?? '').trim());
}

/** Antivenom never inherits Cure Poison's disease or Bleeding options. */
export function antivenomJudgement(effect, options = {}) {
  const result = curePoisonJudgement(effect, options);
  return result.ok && result.category !== 'poison'
    ? {ok:false, reason:'notPoison', category:null} : result;
}
