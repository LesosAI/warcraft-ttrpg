import { mindControlOn } from '../rules/mind-control.mjs';
import { talentEffect } from '../rules/talent-effects.mjs';
import { refuseAncientDespair } from './ancient-despair-refusal.mjs';
import { sustainedSpellLive, reconcileSustainedSpells } from './sustained-spells.mjs';
import { isThrallBond } from '../rules/legacy-uses.mjs';
export const ZALAZANE_QUERY = 'azeroth-rpg.zalazane';
const scope = 'azeroth-rpg', flag = 'zalazaneUse', busy = new Set();
const words = key => game.i18n.localize(`AZEROTH.Zalazane.${key}`);
function controlRecord(effect, target) {
  const mindControl = mindControlOn(effect, target.uuid);
  if (mindControl) return mindControl;
  const flags = effect.flags?.[scope];
  if (!effect.disabled && effect.active !== false && effect.statuses?.has('charmed') && flags?.thrall?.ownerUuid) {
    const bond = target.getFlag?.(scope, 'bond');
    if (isThrallBond(bond) && bond.ownerUuid === flags.thrall.ownerUuid) {
      const token = bond.restore?.tokenUuid ? fromUuidSync(bond.restore.tokenUuid) : null;
      if (bond.restore?.tokenUuid && token?.documentName !== 'Token') return null;
      return { kind: 'thrall', thrall: structuredClone(flags.thrall), bond: structuredClone(bond),
        disposition: token?.disposition ?? null };
    }
  }
  if (effect.disabled || effect.active === false || !['compel', 'dominate', 'enslave-demon'].includes(flags?.identifier)
    || flags.sustained !== true || !effect.statuses?.has('charmed') || !sustainedSpellLive(effect)) return null;
  const caster = fromUuidSync(effect.origin);
  const entry = caster.getFlag(scope, 'sustaining')?.find(row => row.cast === flags.cast);
  return entry ? { kind: flags.identifier, casterUuid: caster.uuid, cast: flags.cast, entry: structuredClone(entry) } : null;
}
const snapshot = target => Array.from(target?.effects ?? []).map(effect => ({ id: effect.id, record: controlRecord(effect, target) }))
  .filter(row => row.record)
  .sort((a, b) => a.id.localeCompare(b.id));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function zalazaneRecoveryView(actor) {
  if (!game.user?.isGM || game.users.activeGM !== game.user || !actor?.uuid || fromUuidSync(actor.uuid) !== actor) return null;
  const receipt = actor.getFlag(scope, flag);
  if (!receipt?.requestId || receipt.stage !== 'paid' || !receipt.targetUuid) return null;
  const target = fromUuidSync(receipt.targetUuid), item = actor.items.get(receipt.itemId);
  const talent = actor.items.get(item?.getFlag(scope, 'feature')?.talentId);
  return structuredClone({ actorUuid: actor.uuid, receipt, targetExists: Boolean(target),
    controls: snapshot(target), featureUses: item?.system?.uses ?? null, talentUses: talent?.system?.uses ?? null,
    health: actor.system?.health ?? null });
}

/** After explicit manual reconciliation, close the receipt alone. A deleted
 * target is inspectable; no missing effect is ever recreated or deleted here. */
export async function reviewZalazane({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid), view = actor && zalazaneRecoveryView(actor);
  if (acknowledged !== true || !view || !same(view, expected)
    || busy.has(actorUuid) || busy.has(view.receipt.targetUuid)) return { ok: false };
  const gmId = game.user.id, targetUuid = view.receipt.targetUuid;
  if (view.receipt.writerId !== gmId && game.users.get(view.receipt.writerId)?.active) return { ok: false, reason: 'writerActive' };
  busy.add(actorUuid); busy.add(targetUuid);
  try {
    const reviewed = { ...view.receipt, stage: 'complete', reviewed: true, reviewedBy: gmId };
    await actor.setFlag(scope, flag, reviewed);
    return game.users.activeGM === game.user && game.user.id === gmId && fromUuidSync(actorUuid) === actor
      && same(actor.getFlag(scope, flag), reviewed) ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actorUuid); busy.delete(targetUuid); }
}

/** End the recognized current domination, never grant immunity or delete
 * generic Charmed effects (which need not represent magical domination). */
export async function zalazaneHandler({ actorUuid, itemId, targetUuid, expected, requestId } = {}, { user } = {}) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || !user?.active || game.users.get(user.id) !== user
    || typeof requestId !== 'string' || !requestId || requestId.length > 64) return { ok: false };
  const actor = fromUuidSync(actorUuid), target = fromUuidSync(targetUuid), item = actor?.items?.get(itemId);
  const talent = actor?.items?.get(item?.getFlag(scope, 'feature')?.talentId);
  const valid = () => writer() && fromUuidSync(actorUuid) === actor && fromUuidSync(targetUuid) === target
    && actor?.type === 'character' && target?.documentName === 'Actor'
    && actor.testUserPermission(user, 'OWNER') && actor.system?.health?.value > 0
    && !refuseAncientDespair(actor, 'feature') && actor.items.get(itemId) === item && item?.type === 'feature'
    && actor.items.get(talent?.id) === talent && talent?.system?.taken > 0
    && talentEffect(talent.system.className, talent.system.identifier, talent.system.race)?.onUse?.zalazane;
  if (!valid()) return { ok: false };
  const prior = actor.getFlag(scope, flag);
  if (prior?.requestId === requestId) return prior.stage === 'complete' ? { ok: true } : { ok: false, pending: true };
  if (prior && prior.stage !== 'complete') return { ok: false, pending: true };
  if (busy.has(actorUuid) || busy.has(targetUuid) || item.system.uses?.per !== 'arc'
    || item.system.uses.value !== 1 || !Array.isArray(expected) || !expected.length || !same(snapshot(target), expected)) return { ok: false };
  busy.add(actorUuid); busy.add(targetUuid);
  const receipt = { requestId, writerId: game.user.id, targetUuid, itemId, expected, stage: 'paid' };
  const carrierIdentity = effect => JSON.stringify({origin:effect?.origin,flags:effect?.flags});
  const carriers = new Map(expected.map(row => [row.id,carrierIdentity(target.effects.get(row.id))]));
  try {
    await actor.update({ items: [{ _id: itemId, 'system.uses.value': 0 }, { _id: talent.id, 'system.uses.value': 0 }],
      [`flags.${scope}.${flag}`]: receipt });
    if (!valid() || !same(actor.getFlag(scope, flag), receipt) || !same(snapshot(target), expected)
      || item.system.uses.value !== 0 || talent.system.uses.value !== 0) return { ok: false, pending: true };
    const sustains = new Map(expected.filter(row => ['compel', 'dominate', 'enslave-demon'].includes(row.record.kind))
      .map(row => [JSON.stringify([row.record.casterUuid, row.record.cast]), row.record]));
    for (const record of sustains.values()) {
      const caster = fromUuidSync(record.casterUuid);
      if (!valid() || !same(caster?.getFlag(scope, 'sustaining')?.find(row => row.cast === record.cast), record.entry))
        return { ok: false, pending: true };
      const { endSustain } = await import('../dice/workflows.mjs');
      if (!valid() || !await endSustain({ actor: caster, cast: record.cast })
        || caster.getFlag(scope, 'sustaining')?.some(row => row.cast === record.cast)) return { ok: false, pending: true };
    }
    // Ending Sustain queues its authoritative carrier deletion. Let that writer
    // finish before checking leftovers, rather than deleting its in-flight IDs.
    if (sustains.size) await reconcileSustainedSpells();
    const thrall = expected.find(row => row.record.kind === 'thrall');
    if (thrall) {
      const { releaseThrallBond } = await import('../documents/bound.mjs');
      const effect = target.effects.get(thrall.id);
      if (!valid() || !effect || !same(controlRecord(effect, target), thrall.record)) return { ok: false, pending: true };
      await releaseThrallBond(target, { endCharmed: false });
      const restore = thrall.record.bond.restore;
      const token = restore?.tokenUuid ? fromUuidSync(restore.tokenUuid) : null;
      if (!valid() || target.getFlag(scope, 'bond')
        || (restore?.tokenUuid && (!token || (Number.isInteger(restore.disposition) && token.disposition !== restore.disposition))))
        return { ok: false, pending: true };
    }
    const remaining = expected.filter(row => target.effects.get(row.id)).map(row => row.id);
    if (remaining.some(id => carrierIdentity(target.effects.get(id)) !== carriers.get(id))) return { ok: false, pending: true };
    if (!valid()) return { ok: false, pending: true };
    if (remaining.length) await target.deleteEmbeddedDocuments('ActiveEffect', remaining);
    if (!valid() || expected.some(effect => target.effects.get(effect.id))) return { ok: false, pending: true };
    await actor.setFlag(scope, flag, { ...receipt, stage: 'complete' });
    return valid() && same(actor.getFlag(scope, flag), { ...receipt, stage: 'complete' })
      ? { ok: true } : { ok: false, pending: true };
  } catch (error) {
    console.warn("azeroth-rpg | Zalazane's Lesson", error);
    return { ok: false, pending: true };
  }
  finally { busy.delete(actorUuid); busy.delete(targetUuid); }
}

export async function useZalazane(actor, item) {
  const targets = Array.from(game.user.targets ?? []);
  const target = targets.length === 1 ? targets[0].actor : null;
  const expected = snapshot(target);
  if (!target || !actor.isOwner || !expected.length) { ui.notifications.warn(words('Target')); return null; }
  const accepted = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${words('Title')} — ${target.name}` }, content: `<p>${words('Confirm')}</p>`,
    yes: { default: false }, no: { default: true }, rejectClose: false
  });
  if (accepted !== true) return null;
  const data = { actorUuid: actor.uuid, itemId: item.id, targetUuid: target.uuid, expected, requestId: foundry.utils.randomID() };
  let result;
  try {
    const gm = game.users.activeGM;
    result = gm === game.user ? await zalazaneHandler(data, { user: game.user }) : await gm?.query(ZALAZANE_QUERY, data, { timeout: 15000 });
  } catch { result = { pending: true }; }
  ui.notifications[result?.ok ? 'info' : 'warn'](words(result?.ok ? 'Done' : 'Pending'));
  return result;
}
