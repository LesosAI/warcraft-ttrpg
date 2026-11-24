import {curePoisonJudgement} from './cure-poison.mjs';

/**
 * 08 §12's antivenoms: *End one poison*, and First Aid's Strong and Powerful
 * antivenoms (D-1919, D-1945): *End one poison of tier 2 or lower without a
 * Test*, *End one poison of any tier without a Test*. A poison carries no tier
 * (D12), so the tier limit is the table's and the chooser lists every poison.
 */
export const ANTIVENOM_NOTE = /^End one poison(?: of (?:tier \d or lower|any tier) without a Test)?\.?$/i;

export function isAntivenom(use) {
  return use?.kind === 'draught' && use.target === 'self' && ANTIVENOM_NOTE.test(String(use.note ?? '').trim());
}

/** Antivenom never inherits Cure Poison's disease or Bleeding options. */
export function antivenomJudgement(effect, options = {}) {
  const result = curePoisonJudgement(effect, options);
  return result.ok && result.category !== 'poison'
    ? {ok:false, reason:'notPoison', category:null} : result;
}
