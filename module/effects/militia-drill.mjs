import { MILITIA_DRILL_FLAG as flag, militiaDrillChoice, militiaDrillGroups, militiaDrillSelection } from '../rules/militia-drill.mjs';
import { talentEffect } from '../rules/talent-effects.mjs';
const scope = 'azeroth-rpg', busy = new Set();
export const MILITIA_CLAIM_QUERY = 'azeroth-rpg.militiaClaim';
export const MILITIA_TRAIN_QUERY = 'azeroth-rpg.militiaTrain';
const words = key => game.i18n.localize(`AZEROTH.MilitiaDrill.${key}`);

export async function militiaTrainHandler({ actorUuid, itemId, representativeUuid, confirmed, groupName } = {}, { user } = {}) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || !user?.active || game.users.get(user.id) !== user || confirmed !== true
    || typeof groupName !== 'string' || !groupName.trim() || groupName.trim().length > 80) return { ok: false };
  const actor = fromUuidSync(actorUuid), representative = fromUuidSync(representativeUuid);
  const item = actor?.items?.get(itemId), talent = actor?.items?.get(item?.getFlag(scope, 'feature')?.talentId);
  if (!actor?.testUserPermission(user, 'OWNER') || representative?.documentName !== 'Actor'
    || item?.type !== 'feature' || !(talent?.system?.taken > 0)
    || !talentEffect(talent.system.className, talent.system.identifier, talent.system.race)?.onUse?.militiaDrill
    || busy.has(representativeUuid)) return { ok: false };
  const groups = militiaDrillGroups(representative.getFlag(scope, flag));
  if (!groups) return { ok: false };
  const name = groupName.trim();
  const prior = groups.find(row => row.name?.toLowerCase() === name.toLowerCase());
  // Never replace an outstanding group's benefit or an uncertain claim.
  if (prior && prior.state !== 'spent') return { ok: false };
  busy.add(representativeUuid);
  try {
    const record = { id: foundry.utils.randomID(), trainerUuid: actorUuid, name, state: 'ready' };
    if (groups.some(row => row.id === record.id)) return { ok: false };
    const saved = { version: 1, groups: [...groups.filter(row => row !== prior), record] };
    await representative.setFlag(scope, flag, saved);
    return writer() && fromUuidSync(representativeUuid) === representative
      && JSON.stringify(representative.getFlag(scope, flag)) === JSON.stringify(saved) ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(representativeUuid); }
}

export async function useMilitiaDrill(actor, item) {
  const targets = Array.from(game.user.targets ?? []), representative = targets.length === 1 ? targets[0].actor : null;
  if (!representative || !actor.isOwner) { ui.notifications.warn(words('Target')); return null; }
  const accepted = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${words('Title')} — ${representative.name}` },
    content: `<p>${words('Confirm')}</p><label>${words('GroupName')}<input name="groupName" type="text" maxlength="80" required></label>`,
    yes: { default: false, callback: (_event, button) => button.form.elements.groupName.value.trim() }, no: { default: true }, rejectClose: false
  });
  if (typeof accepted !== 'string' || !accepted) return null;
  let result;
  try {
    const gm = game.users.activeGM, data = { actorUuid: actor.uuid, itemId: item.id, representativeUuid: representative.uuid, confirmed: true, groupName: accepted };
    result = gm === game.user ? await militiaTrainHandler(data, { user: game.user }) : await gm?.query(MILITIA_TRAIN_QUERY, data, { timeout: 15000 });
  } catch { result = { pending: true }; }
  ui.notifications[result?.ok ? 'info' : 'warn'](words(result?.ok ? 'Ready' : 'Refused'));
  return result;
}

/** Claim before the die; uncertainty remains claimed. Only the representative
 * can spend this group's single benefit, through the active GM. */
export async function militiaClaimHandler({ actorUuid, expectedId, requestId } = {}, { user } = {}) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || !user?.active || game.users.get(user.id) !== user
    || typeof requestId !== 'string' || !requestId || requestId.length > 64) return { ok: false };
  const actor = fromUuidSync(actorUuid);
  if (!actor?.testUserPermission(user, 'OWNER') || busy.has(actorUuid)) return { ok: false };
  const groups = militiaDrillGroups(actor.getFlag(scope, flag));
  const record = groups?.find(row => row.id === expectedId);
  if (!record || !militiaDrillChoice(record, 'skill').length) return { ok: false };
  busy.add(actorUuid);
  try {
    const claim = { ...record, state: 'claimed', requestId, writerId: game.user.id, userId: user.id };
    const saved = { version: 1, groups: groups.map(row => row === record ? claim : row) };
    await actor.setFlag(scope, flag, saved);
    return writer() && fromUuidSync(actorUuid) === actor
      && JSON.stringify(actor.getFlag(scope, flag)) === JSON.stringify(saved)
      ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actorUuid); }
}

export async function claimMilitiaDrill(actor, chosen, kind) {
  const selected = militiaDrillSelection(actor.getFlag?.(scope, flag), chosen, kind);
  if (!selected.ok) return { ok: false };
  const record = selected.record;
  if (!record) return { ok: true };
  const data = { actorUuid: actor.uuid, expectedId: record.id, requestId: foundry.utils.randomID() };
  try {
    const gm = game.users.activeGM;
    const result = gm === game.user ? await militiaClaimHandler(data, { user: game.user })
      : await gm?.query(MILITIA_CLAIM_QUERY, data, { timeout: 15000 });
    return result?.ok === true ? { ok: true, claim: data } : { ok: false };
  } catch { return { ok: false }; }
}

/** Publication is the completion boundary. A missing card leaves the claim
 * unavailable for replay and visible for explicit GM reconciliation. */
export async function recordMilitiaDrillRoll(message) {
  if (!game.user?.isGM || game.users.activeGM !== game.user || game.messages.get(message?.id) !== message
    || message.rolls?.length !== 1) return false;
  const claim = message.rolls[0].options?.militiaDrill;
  if (!claim) return false;
  const actor = fromUuidSync(claim.actorUuid), groups = militiaDrillGroups(actor?.getFlag(scope, flag));
  const record = groups?.find(row => row.id === claim.expectedId);
  if (!record || record.state !== 'claimed' || record.id !== claim.expectedId || record.requestId !== claim.requestId
    || message.author?.id !== record.userId || !actor.testUserPermission(message.author, 'OWNER')
    || ChatMessage.getSpeakerActor(message.speaker) !== actor || busy.has(actor.uuid)) return false;
  busy.add(actor.uuid);
  const writerId = game.user.id;
  try {
    const saved = { version: 1, groups: groups.map(row => row === record ? { ...record, state: 'spent', messageUuid: message.uuid } : row) };
    await actor.setFlag(scope, flag, saved);
    return game.user?.isGM && game.users.activeGM === game.user && game.user.id === writerId
      && fromUuidSync(actor.uuid) === actor && game.messages.get(message.id) === message
      && JSON.stringify(actor.getFlag(scope, flag)) === JSON.stringify(saved);
  } finally { busy.delete(actor.uuid); }
}

export function registerMilitiaDrillHooks() {
  Hooks.on('createChatMessage', async message => {
    if (!game.user?.isGM || game.users.activeGM !== game.user
      || !message.rolls?.some(roll => roll.options?.militiaDrill)) return;
    try {
      if (!await recordMilitiaDrillRoll(message)) ui.notifications.warn(words('PublicationPending'));
    } catch { ui.notifications.warn(words('PublicationPending')); }
  });
}

export function militiaRecoveryViews(actor) {
  if (!game.user?.isGM || game.users.activeGM !== game.user || !actor?.uuid || fromUuidSync(actor.uuid) !== actor) return [];
  const groups = militiaDrillGroups(actor.getFlag(scope, flag));
  return (groups ?? []).filter(row => row.state === 'claimed').map(row => structuredClone({
    actorUuid: actor.uuid, groupId: row.id, groups, health: actor.system?.health ?? null,
    pools: actor.poolSnapshot?.() ?? []
  }));
}

/** Close only the reviewed group's claim; no reroll, Boon refund or changes to
 * other groups. Use the same lock as training, claiming and publication. */
export async function reviewMilitiaDrill({ actorUuid, expected, acknowledged } = {}) {
  const actor = fromUuidSync(actorUuid);
  const view = militiaRecoveryViews(actor).find(row => row.groupId === expected?.groupId);
  if (acknowledged !== true || !view || JSON.stringify(view) !== JSON.stringify(expected) || busy.has(actorUuid)) return { ok: false };
  const record = view.groups.find(row => row.id === view.groupId), gmId = game.user.id;
  if (record.writerId !== gmId && game.users.get(record.writerId)?.active) return { ok: false, reason: 'writerActive' };
  busy.add(actorUuid);
  try {
    const saved = { version: 1, groups: view.groups.map(row => row.id === view.groupId
      ? { ...row, state: 'spent', reviewedBy: gmId, reviewed: true } : row) };
    await actor.setFlag(scope, flag, saved);
    return game.users.activeGM === game.user && game.user.id === gmId && fromUuidSync(actorUuid) === actor
      && JSON.stringify(actor.getFlag(scope, flag)) === JSON.stringify(saved) ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actorUuid); }
}
