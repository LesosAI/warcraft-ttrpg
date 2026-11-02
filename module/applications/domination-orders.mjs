import { sustainedSpellLive, reconcileSustainedSpells } from '../effects/sustained-spells.mjs';
import { enslaveMinuteDue, nextEnslaveMinute, reconciledEnslaveDeadline } from '../rules/enslave-clock.mjs';
const scope = 'azeroth-rpg', busy = new Set();
const words = key => game.i18n.localize(`AZEROTH.DominationOrder.${key}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function missingClockView(actor, effect) {
  const flags = effect?.flags?.[scope];
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || fromUuidSync(actor?.uuid) !== actor
    || actor?.effects?.get(effect?.id) !== effect || effect.disabled || effect.active === false
    || flags?.identifier !== 'enslave-demon' || Number.isFinite(flags.enslaveNextSave) || !sustainedSpellLive(effect)
    || ['rolling', 'ending'].includes(flags.dominationOrder?.state)) return null;
  return structuredClone({ origin: effect.origin, flags });
}

export async function reconcileEnslaveClock(actor, effect, { expected, seconds, acknowledged } = {}) {
  const view = missingClockView(actor, effect), now = game.time?.worldTime;
  const next = reconciledEnslaveDeadline(now, seconds), gmId = game.user?.id;
  if (!view || acknowledged !== true || !same(view, expected) || next === null || busy.has(effect.uuid)) return { ok: false };
  busy.add(effect.uuid);
  try {
    await effect.update({ [`flags.${scope}.enslaveNextSave`]: next,
      [`flags.${scope}.enslaveClockReview`]: { by: gmId, at: now, seconds } });
    return game.user.id === gmId && game.users.activeGM?.id === gmId && actor.effects.get(effect.id) === effect
      && effect.flags[scope].enslaveNextSave === next ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(effect.uuid); }
}

export async function reconcileEnslaveClockDialog(actor, effect) {
  const expected = missingClockView(actor, effect);
  if (!expected) return null;
  const seconds = await foundry.applications.api.DialogV2.wait({ window: { title: words('ClockReview') }, rejectClose: false,
    content: `<p>${words('ClockExplain')}</p><label>${words('ClockSeconds')} <input name="seconds" type="number" min="0" max="60" step="1" required></label><label><input name="ack" type="checkbox"> ${words('ClockAck')}</label>`,
    buttons: [{ action: 'save', label: words('ClockReview'), callback: (_event, button) => {
      const form = button.form;
      return form.elements.ack.checked && form.elements.seconds.value !== '' && form.reportValidity()
        ? Number(form.elements.seconds.value) : false;
    } }, { action: 'cancel', label: game.i18n.localize('AZEROTH.HungerMastered.ReviewCancel'), default: true, callback: () => false }] });
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 60) return null;
  const result = await reconcileEnslaveClock(actor, effect, { expected, seconds, acknowledged: true });
  ui.notifications[result.ok ? 'info' : 'warn'](words(result.ok ? 'ClockDone' : 'Pending'));
  return result;
}

export function dominationOrderRecoveryViews(actor) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !actor?.uuid
    || fromUuidSync(actor.uuid) !== actor) return [];
  return [...actor.effects.values()].filter(effect => ['dominate', 'enslave-demon'].includes(effect.flags?.[scope]?.identifier)
    && ['rolling', 'ending'].includes(effect.flags?.[scope]?.dominationOrder?.state)).map(effect => {
    const caster = fromUuidSync(effect.origin);
    return structuredClone({ actorUuid: actor.uuid, effectId: effect.id, origin: effect.origin,
      flags: effect.flags[scope], statuses: [...effect.statuses], disabled: effect.disabled === true,
      sustaining: caster?.getFlag(scope, 'sustaining') ?? null, health: actor.system?.health ?? null });
  });
}

export async function reviewDominationOrder({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid), view = dominationOrderRecoveryViews(actor).find(row => row.effectId === expected?.effectId);
  const effect = actor?.effects.get(expected?.effectId);
  if (acknowledged !== true || !view || !same(view, expected) || busy.has(effect.uuid)) return { ok: false };
  const receipt = view.flags.dominationOrder, gmId = game.user.id;
  if (receipt.writerId !== gmId && game.users.get(receipt.writerId)?.active) return { ok: false };
  busy.add(effect.uuid);
  try {
    const reviewed = { ...receipt, state: 'complete', reviewed: true, reviewedBy: gmId };
    if (receipt.reason === 'minute' && view.flags.enslaveNextSave === receipt.dueAt) {
      await effect.update({ [`flags.${scope}.dominationOrder`]: reviewed,
        [`flags.${scope}.enslaveNextSave`]: nextEnslaveMinute(receipt.dueAt) });
    } else await effect.setFlag(scope, 'dominationOrder', reviewed);
    return game.user.id === gmId && game.users.activeGM?.id === gmId && actor.effects.get(effect.id) === effect
      && same(effect.flags[scope].dominationOrder, reviewed) ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(effect.uuid); }
}

/** The GM identifies the spoken order; its Test uses the original cast DC. */
export async function dominationOrderSave(actor, effect, { reason = 'order', dueAt = null } = {}) {
  const flags = effect?.flags?.[scope], gmId = game.user?.id;
  const identity = JSON.stringify([effect?.origin, flags?.identifier, flags?.cast, flags?.spellDC, flags?.escape?.dc]);
  const active = () => game.user?.isGM && game.user.id === gmId && game.users?.activeGM?.id === gmId
    && actor?.effects?.get(effect?.id) === effect && !effect.disabled && effect.active !== false
    && JSON.stringify([effect.origin, effect.flags?.[scope]?.identifier, effect.flags?.[scope]?.cast,
      effect.flags?.[scope]?.spellDC, effect.flags?.[scope]?.escape?.dc]) === identity
    && effect.statuses?.has('charmed') && sustainedSpellLive(effect);
  const due = () => reason !== 'minute' || (dueAt !== null && enslaveMinuteDue(effect.flags?.[scope], game.time?.worldTime) === dueAt);
  if (!active() || !['dominate', 'enslave-demon'].includes(flags?.identifier) || busy.has(effect.uuid)) return null;
  if (!['order', 'minute'].includes(reason) || !due()) return null;
  const prior = flags.dominationOrder;
  if (prior && ['rolling', 'ending'].includes(prior.state)) { ui.notifications.warn(words('Pending')); return null; }
  let dc = flags.spellDC ?? (flags.escape?.identifier === flags.identifier ? flags.escape.dc : null);
  if (!Number.isSafeInteger(dc) || dc <= 0) {
    const cast = game.messages?.get(flags.messageId)?.flags?.[scope];
    dc = cast?.identifier === flags.identifier && cast.cast === flags.cast && cast.caster === effect.origin
      && cast.success === true ? cast.spellDC : null;
  }
  if (!Number.isSafeInteger(dc) || dc <= 0) { ui.notifications.warn(words('MissingDC')); return null; }
  busy.add(effect.uuid);
  try {
    const accepted = await foundry.applications.api.DialogV2.confirm({ window: { title: words('Title') },
      content: `<p>${words(reason === 'minute' ? 'Minute' : flags.identifier === 'dominate' ? 'Harmful' : 'Destruction')}</p>`,
      yes: { default: false }, no: { default: true }, rejectClose: false });
    if (accepted !== true || !active() || !due()) return null;
    const receipt = { state: 'rolling', writerId: gmId, cast: flags.cast, attemptId: foundry.utils.randomID(), reason, dueAt };
    await effect.setFlag(scope, 'dominationOrder', receipt);
    if (!active() || effect.flags[scope].dominationOrder.attemptId !== receipt.attemptId) return null;
    const { resilienceWithDialog } = await import('./actions.mjs');
    const result = await resilienceWithDialog(actor, 'spirit', null, { dc,
      ...(flags.identifier === 'dominate' ? { talentBoons: { boons: 1, names: [words('Title')] } } : {}) });
    if (!active() || !due()) return null;
    if (!result) { await effect.setFlag(scope, 'dominationOrder', { ...receipt, state: 'cancelled' }); return null; }
    const passed = result.rolls?.[0]?.outcome?.success;
    if (typeof passed !== 'boolean') throw Error('Missing domination save outcome');
    const completed = { ...receipt, state: passed ? 'ending' : 'complete', resultId: result.id };
    if (reason === 'minute' && !passed) await effect.update({ [`flags.${scope}.dominationOrder`]: completed,
      [`flags.${scope}.enslaveNextSave`]: nextEnslaveMinute(dueAt) });
    else await effect.setFlag(scope, 'dominationOrder', completed);
    if (passed && active()) {
      const { endSustain } = await import('../dice/workflows.mjs');
      const caster = fromUuidSync(effect.origin);
      await endSustain({ actor: caster, cast: flags.cast });
      // endSustain publishes the changed hold; the active-GM hook queues
      // carrier cleanup rather than awaiting it. Join that queue before
      // deciding whether successful resistance left uncertain state.
      await reconcileSustainedSpells();
      if (actor.effects.get(effect.id)) throw Error('Domination carrier remains');
    }
    return result;
  } catch (error) {
    console.warn('azeroth-rpg | Domination order save', error); ui.notifications.warn(words('Pending')); return null;
  } finally { busy.delete(effect.uuid); }
}
