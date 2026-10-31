import { mindControlOn, mindControlTurnKey, mindControlRecord, MIND_CONTROL_FLAG } from '../rules/mind-control.mjs';

export const MIND_CONTROL_REPEATS = 'mindControlRepeats';
const busy = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Only a confirmed cancellation can be resumed without manual reconciliation. */
export async function resumeMindControlRepeat({actor,effect,key,expected,user,roll}={},deps={}) {
  const game=deps.game ?? globalThis.game;
  if (!user?.isGM || game?.user!==user || game.users?.activeGM!==user)
    return {ok:false,reason:'permission'};
  const record=mindControlOn(effect,actor?.uuid),attempts=effect?.getFlag('azeroth-rpg',MIND_CONTROL_REPEATS);
  if (!record || !Array.isArray(attempts) || !same({record,attempts},expected)
    || attempts.filter(row=>row.key===key).length!==1
    || attempts.find(row=>row.key===key)?.stage!=='cancelled') return {ok:false,reason:'changed'};
  let turn;
  try {
    const [combatUuid,round,turnIndex,combatantId]=JSON.parse(key);
    turn={combatUuid,round,turn:turnIndex,combatantId};
    if (mindControlTurnKey(turn)!==key) return {ok:false,reason:'changed'};
  } catch {return {ok:false,reason:'changed'};}
  return repeatMindControl({actor,effect,turn,user,roll},deps);
}

/** Internal active-GM repeated-Test transaction. The combat adapter supplies the
 * completed turn; the UI adapter supplies a roll function, never a claimed result.
  * Invoked by the authoritative native combat end-turn adapter. */
export async function repeatMindControl({ actor, effect, turn, user, roll } = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync,
  speakerActor = speaker => globalThis.ChatMessage.getSpeakerActor(speaker)
} = {}) {
  const key = mindControlTurnKey(turn), original = mindControlOn(effect, actor?.uuid);
  const valid = () => game?.user?.isGM && game.users?.activeGM === game.user && user?.active
    && game.users.get(user.id) === user && actor?.testUserPermission(user, 'OWNER')
    && resolve(actor?.uuid) === actor && resolve(effect?.uuid) === effect
    && effect.parent === actor && same(mindControlOn(effect, actor.uuid), original);
  if (!key || !original || typeof roll !== 'function' || !valid()) return { ok: false, reason: 'invalid' };
  if (busy.has(effect.uuid)) return { ok: false, reason: 'busy' };
  busy.add(effect.uuid);
  try {
    const stored = effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS) ?? [];
    if (!Array.isArray(stored)) return { ok: false, reason: 'pending' };
    const prior = stored.find(row => row.key === key);
    if (prior && prior.stage !== 'cancelled') return { ok: false, reason: ['done', 'reviewed'].includes(prior.stage) ? 'resolved' : 'pending' };
    // Never start a later turn's save over an unconfirmed earlier roll.
    if (stored.some(row => !['done', 'reviewed', 'cancelled'].includes(row.stage))) return { ok: false, reason: 'pending' };
    const claim = [...stored.filter(row => row.key !== key), { key, stage: 'rolling', writerId: game.user.id }];
    await effect.setFlag('azeroth-rpg', MIND_CONTROL_REPEATS, claim);
    const claimed = () => valid() && same(effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS), claim);
    if (!claimed()) return { ok: false, reason: 'pending' };
    const resistOf = { messageId: original.messageUuid.split('.').at(-1), actorId: actor.id,
      // The shared resistance serializer accepts only alphanumeric cast IDs.
      // Keep the completed-turn identity in the unrestricted identifier instead.
      identifier: `mind-control-repeat:${effect.id}:${key}`, cast: effect.id };
    const result = await roll({ actor, resilience: 'spirit', dc: original.dc, resistOf });
    if (!claimed()) return { ok: false, reason: 'pending' };
    if (result === null) {
      const cancelled = claim.map(row => row.key === key ? { ...row, stage: 'cancelled' } : row);
      await effect.setFlag('azeroth-rpg', MIND_CONTROL_REPEATS, cancelled);
      return valid() && same(effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS), cancelled)
        ? { ok: false, reason: 'cancelled' } : { ok: false, reason: 'pending' };
    }
    const flags = result?.flags?.['azeroth-rpg'], test = result?.rolls?.[0];
    if (!result?.uuid || resolve(result.uuid) !== result || result.documentName !== 'ChatMessage'
      || result.uuid === original.resultUuid || stored.some(row => row.resultUuid === result.uuid)
      || result.author?.id !== user.id || speakerActor(result.speaker) !== actor
      || Object.entries(resistOf).some(([name, value]) => flags?.resistOf?.[name] !== value)
      || flags?.kind !== 'resilience' || flags.resilience !== 'spirit' || test?.options?.dc !== original.dc
      || typeof test.outcome?.success !== 'boolean') return { ok: false, reason: 'pending' };
    const passed = test.outcome.success;
    const finished = claim.map(row => row.key === key ? { ...row, stage: passed ? 'ending' : 'done', resultUuid: result.uuid, passed } : row);
    await effect.setFlag('azeroth-rpg', MIND_CONTROL_REPEATS, finished);
    if (!valid() || !same(effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS), finished)) return { ok: false, reason: 'pending' };
    if (passed) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', [effect.id]);
      if (resolve(effect.uuid)) return { ok: false, reason: 'pending' };
    }
    return { ok: true, passed };
  } catch { return { ok: false, reason: 'pending' }; }
  finally { busy.delete(effect.uuid); }
}

/** The GM reconciles an interrupted save before closing its receipt. This does
 * not roll, remove control, alter turns or retry a possibly completed deletion. */
export async function reviewMindControlRepeat({ actor, effect, key, expected, acknowledged, user } = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync, now = Date.now
} = {}) {
  const writer = () => game?.user?.isGM && game.users?.activeGM === game.user
    && actor?.uuid && effect?.uuid && resolve(actor.uuid) === actor && resolve(effect.uuid) === effect && effect.parent === actor;
  if (!writer() || !user?.isGM || !user.active || game.users.get(user.id) !== user) return { ok: false, reason: 'permission' };
  if (acknowledged !== true) return { ok: false, reason: 'acknowledgement' };
  if (busy.has(effect.uuid)) return { ok: false, reason: 'busy' };
  const record = mindControlRecord(effect.getFlag('azeroth-rpg', MIND_CONTROL_FLAG));
  const attempts = effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS);
  if (!record || record.targetUuid !== actor.uuid || !Array.isArray(attempts)
    || !same({ record, attempts }, expected)) return { ok: false, reason: 'changed' };
  const matching = attempts.filter(row => row?.key === key), row = matching[0];
  if (matching.length !== 1 || !['rolling', 'ending'].includes(row.stage) || !row.writerId) return { ok: false, reason: 'changed' };
  try {
    const parsed = JSON.parse(key);
    if (!Array.isArray(parsed) || parsed.length !== 4 || mindControlTurnKey({ combatUuid: parsed[0], round: parsed[1], turn: parsed[2], combatantId: parsed[3] }) !== key)
      return { ok: false, reason: 'changed' };
  } catch { return { ok: false, reason: 'changed' }; }
  if (row.writerId !== game.user.id && game.users.get(row.writerId)?.active) return { ok: false, reason: 'writerActive' };
  busy.add(effect.uuid);
  try {
    const reviewed = attempts.map(attempt => attempt.key === key
      ? { ...attempt, stage: 'reviewed', previousStage: attempt.stage, reviewedBy: user.id, reviewedAt: now() } : attempt);
    await effect.setFlag('azeroth-rpg', MIND_CONTROL_REPEATS, reviewed);
    return writer() && same(mindControlRecord(effect.getFlag('azeroth-rpg', MIND_CONTROL_FLAG)), record)
      && same(effect.getFlag('azeroth-rpg', MIND_CONTROL_REPEATS), reviewed)
      ? { ok: true } : { ok: false, reason: 'pending' };
  } catch { return { ok: false, reason: 'pending' }; }
  finally { busy.delete(effect.uuid); }
}
