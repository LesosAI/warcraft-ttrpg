import { readMindControlFailure } from './mind-control-input.mjs';
import { createMindControl, MIND_CONTROL_RESOLUTION } from './mind-control-creation.mjs';

/** Explicit recovery only: old cards are never automatically replayed on login. */
export function missedMindControl(message, deps = {}) {
  const game = deps.game ?? globalThis.game;
  if (!game?.user?.isGM || game.users?.activeGM !== game.user
    || !message?.flags?.['azeroth-rpg']?.mindControlCast
    || message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION)) return null;
  const results = [...(game.messages?.values?.() ?? game.messages ?? [])].filter(result => {
    const f = result.flags?.['azeroth-rpg'];
    return f?.kind === 'resilience' && f.resistOf?.messageId === message.id && f.resistOf.index === 0;
  });
  // Conflicting/rerolled initial results need manual adjudication, not a guess.
  if (results.length !== 1) return null;
  return readMindControlFailure({ message, result: results[0], user: results[0].author }, deps);
}

export async function activateMissedMindControl({ message, expected, acknowledged } = {}, deps = {}) {
  if (acknowledged !== true) return { ok: false, reason: 'acknowledgement' };
  const current = missedMindControl(message, deps);
  if (!current || JSON.stringify(current.record) !== JSON.stringify(expected)) return { ok: false, reason: 'changed' };
  return createMindControl({ message, result: current.result, user: current.result.author }, deps);
}
