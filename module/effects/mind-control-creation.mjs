import { readMindControlFailure } from './mind-control-input.mjs';
import { MIND_CONTROL_FLAG, mindControlOn, mindControlRecord } from '../rules/mind-control.mjs';
import { prepareMindControlSustain, claimMindControlCaster, releaseMindControlCaster } from './mind-control-sustain.mjs';

export const MIND_CONTROL_RESOLUTION = 'mindControlResolution';
const busy = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Active-GM coordinator. One original casting card may create its control only once. */
export async function createMindControl({ message, result, user } = {}, deps = {}) {
  const read = () => readMindControlFailure({ message, result, user }, deps);
  const first = read();
  if (!first) return { ok: false, reason: 'invalid' };
  const targetKey = first.target.uuid;
  const casterKey = first.caster.uuid;
  if ([message.uuid,targetKey,casterKey].some(key => busy.has(key))) return { ok: false, reason: 'busy' };
  if (!claimMindControlCaster(casterKey)) return { ok: false, reason: 'busy' };
  busy.add(message.uuid); busy.add(targetKey); busy.add(casterKey);
  try {
    const held = message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION);
    if (held) return { ok: false, reason: ['active', 'reviewed'].includes(held.stage) ? 'resolved' : 'pending' };
    // Competing active controls need an explicit replacement policy; do not
    // silently erase another caster's control or mint contradictory carriers.
    if ([...(first.target.effects ?? [])].some(effect => mindControlOn(effect, targetKey)))
      return { ok: false, reason: 'controlled' };
    const sustain = prepareMindControlSustain(first.caster, message);
    if (!sustain.ok) return sustain;
    let expectedSustains = sustain.before;
    const gm = deps.game ?? globalThis.game;
    const claim = { version: 1, stage: 'applying', writerId: gm.user.id, ...first.record };
    const unchanged = () => {
      const current = read();
      return current?.target === first.target && current.caster === first.caster
        && same(current.record, first.record) && same(message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION), claim)
        && same(first.caster.getFlag('azeroth-rpg', 'sustaining') ?? [], expectedSustains);
    };
    await message.setFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION, claim);
    if (!unchanged()) return { ok: false, reason: 'pending' };
    await first.caster.setFlag('azeroth-rpg', 'sustaining', sustain.after);
    expectedSustains = sustain.after;
    if (!unchanged()) return { ok: false, reason: 'pending' };
    if (sustain.dropped.length) {
      const lift = deps.liftSpellEffects ?? (await import('../dice/workflows.mjs')).liftSpellEffects;
      for (const entry of sustain.dropped) {
        if (!unchanged()) return { ok: false, reason: 'pending' };
        await lift(first.caster, entry.uuid, entry.cast);
      }
      if (!unchanged()) return { ok: false, reason: 'pending' };
    }
    const [effect] = await first.target.createEmbeddedDocuments('ActiveEffect', [{
      name: 'Mind Control', img: 'icons/svg/mystery-man.svg', origin: first.caster.uuid,
      duration: { value: null, units: 'seconds', expiry: null }, system: { changes: [] },
      flags: { 'azeroth-rpg': { identifier: 'mind-control', [MIND_CONTROL_FLAG]: first.record,
        sustained: true, cast: sustain.entry.cast, spell: sustain.entry.uuid } }
    }]);
    if (!effect?.id || !unchanged() || !same(mindControlOn(effect, targetKey), first.record))
      return { ok: false, reason: 'pending' };
    const completed = { ...claim, stage: 'active', effectId: effect.id };
    await message.setFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION, completed);
    const current = read();
    return current?.target === first.target && same(current.record, first.record)
      && same(message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION), completed)
      ? { ok: true, effectId: effect.id } : { ok: false, reason: 'pending' };
  } catch { return { ok: false, reason: 'pending' }; }
  finally { busy.delete(message.uuid); busy.delete(targetKey); busy.delete(casterKey); releaseMindControlCaster(casterKey); }
}

/** Close an acknowledged manual reconciliation. Never repeat creation, alter
 * actor effects, grant ownership or refund the original paid feature. */
export async function reviewMindControlCreation({ message, expected, acknowledged, user } = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync, now = Date.now
} = {}) {
  const writer = () => game?.user?.isGM && game.users?.activeGM === game.user
    && message?.documentName === 'ChatMessage' && resolve(message.uuid) === message;
  if (!writer() || !user?.isGM || !user.active || game.users.get(user.id) !== user)
    return { ok: false, reason: 'permission' };
  if (acknowledged !== true) return { ok: false, reason: 'acknowledgement' };
  const current = message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION);
  const record = mindControlRecord(current);
  if (current?.version !== 1 || current.stage !== 'applying' || !record || record.messageUuid !== message.uuid
    || !current.writerId || !same(current, expected)) return { ok: false, reason: 'changed' };
  if (busy.has(message.uuid) || busy.has(record.targetUuid)) return { ok: false, reason: 'busy' };
  if (current.writerId !== game.user.id && game.users.get(current.writerId)?.active)
    return { ok: false, reason: 'writerActive' };
  busy.add(message.uuid); busy.add(record.targetUuid);
  try {
    const reviewed = { ...current, stage: 'reviewed', reviewedBy: user.id, reviewedAt: now() };
    await message.setFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION, reviewed);
    return writer() && same(message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION), reviewed)
      ? { ok: true } : { ok: false, reason: 'pending' };
  } catch { return { ok: false, reason: 'pending' }; }
  finally { busy.delete(message.uuid); busy.delete(record.targetUuid); }
}
