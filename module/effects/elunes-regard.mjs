import { talentEffect } from '../rules/talent-effects.mjs';
export const ELUNES_REGARD_QUERY = 'azeroth-rpg.elunesRegard';
const scope = 'azeroth-rpg', flag = 'elunesRegardUse';
const busy = new Set(), offers = new WeakMap();
const eligible = item => item?.type === 'talent'
  && talentEffect(item.system?.className, item.system?.identifier, item.system?.race)?.failedTestSuccess?.sl === 0
  && !item.system.className && item.system.taken > 0
  && item.system.uses?.per === 'arc' && item.system.uses.max === 1 && item.system.uses.value === 1
  && item.getFlag(scope, flag)?.state !== 'spent';
const words = key => game.i18n.localize(`AZEROTH.ElunesRegard.${key}`);

/** Inspect unresolved payment/publication without inferring the Test's result. */
export function elunesRegardRecoveryViews(actor) {
  if (!game.user?.isGM || game.users.activeGM !== game.user || !actor?.uuid
    || fromUuidSync(actor.uuid) !== actor) return [];
  return [...actor.items].flatMap(item => {
    const receipt = item.getFlag(scope, flag);
    if (!receipt?.requestId || receipt.state !== 'spent') return [];
    const cards = Array.from(game.messages ?? []).filter(message => message.rolls?.some(roll =>
      roll.options?.elunesRegard?.requestId === receipt.requestId && roll.options.elunesRegard.itemUuid === item.uuid))
      .map(message => ({uuid:message.uuid, data:message.toObject()}));
    return [structuredClone({actorUuid:actor.uuid, itemId:item.id, receipt, uses:item.system.uses,
      health:actor.system?.health ?? null, pools:actor.poolSnapshot?.() ?? [], cards})];
  });
}

/** Close only an explicitly reconciled receipt. Never replay or refund a Test. */
export async function reviewElunesRegard({actorUuid, expected, acknowledged} = {}) {
  const actor = fromUuidSync(actorUuid);
  const view = actor && elunesRegardRecoveryViews(actor).find(row => row.itemId === expected?.itemId);
  if (acknowledged !== true || !view || JSON.stringify(view) !== JSON.stringify(expected)
    || busy.has(actorUuid) || offers.has(actor)) return {ok:false};
  for (const id of [view.receipt.writerId, view.receipt.userId])
    if (id !== game.user.id && game.users.get(id)?.active) return {ok:false, reason:'writerActive'};
  const writerId = game.user.id, item = actor.items.get(view.itemId);
  busy.add(actorUuid);
  try {
    const reviewed = {...view.receipt, state:'reviewed', reviewedBy:writerId};
    await item.update({[`flags.${scope}.${flag}`]:reviewed});
    return game.user?.isGM && game.users.activeGM === game.user && game.user.id === writerId
      && fromUuidSync(actorUuid) === actor && actor.items.get(item.id) === item
      && JSON.stringify(item.getFlag(scope, flag)) === JSON.stringify(reviewed)
      ? {ok:true} : {ok:false, pending:true};
  } catch { return {ok:false, pending:true}; }
  finally { busy.delete(actorUuid); }
}

/** Spends only the elected racial use; never rolls, casts or pays an action. */
export async function elunesRegardHandler({ actorUuid, itemId, requestId } = {}, { user } = {}) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || !user?.active || game.users.get(user.id) !== user
    || typeof requestId !== 'string' || !requestId || requestId.length > 64) return { ok: false };
  const actor = fromUuidSync(actorUuid), item = actor?.items?.get(itemId);
  if (!actor?.testUserPermission(user, 'OWNER') || !item) return { ok: false };
  if (busy.has(actor.uuid)) return { ok: false };
  const prior = item.getFlag(scope, flag);
  if (prior?.requestId === requestId && prior.userId === user.id) return { ok: false, pending: !['published', 'reviewed'].includes(prior.state) };
  if (prior?.state === 'spent') return {ok:false, pending:true};
  if (!eligible(item)) return { ok: false };
  busy.add(actor.uuid);
  const writerId = game.user.id;
  const receipt = { requestId, userId: user.id, writerId, state: 'spent' };
  try {
    // Counter and receipt land together. Uncertain acknowledgement never
    // authorizes another result or automatically restores the use.
    await item.update({ 'system.uses.value': 0, [`flags.${scope}.${flag}`]: receipt });
    const held = item.getFlag(scope, flag);
    return writer() && game.user.id === writerId && fromUuidSync(actorUuid) === actor
      && actor.items.get(itemId) === item && item.system.uses.value === 0
      && JSON.stringify(held) === JSON.stringify(receipt)
      ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actor.uuid); }
}

/** Record publication only from an actual registered roll card. This never
 * changes the roll, spends/refunds a use or repeats outcome consequences. */
export async function recordElunesRegardResult(message) {
  const writer = () => game.user?.isGM && game.users.activeGM === game.user;
  if (!writer() || message?.documentName !== 'ChatMessage' || fromUuidSync(message.uuid) !== message
    || message.rolls?.length !== 1) return false;
  const roll = message.rolls[0], mark = roll.options?.elunesRegard;
  if (typeof mark?.requestId !== 'string' || !mark.requestId || typeof mark.itemUuid !== 'string'
    || roll.options.forcedSl !== 0 || roll.outcome?.success !== true || roll.outcome.sl !== 0) return false;
  const item = fromUuidSync(mark.itemUuid), actor = item?.parent;
  const receipt = item?.getFlag(scope, flag), author = message.author;
  if (!actor || fromUuidSync(actor.uuid) !== actor || actor.items?.get(item.id) !== item || !author || game.users.get(author.id) !== author
    || !actor.testUserPermission(author, 'OWNER') || ChatMessage.getSpeakerActor(message.speaker) !== actor
    || receipt?.requestId !== mark.requestId || receipt.userId !== author.id) return false;
  if (receipt.messageUuid) return receipt.messageUuid === message.uuid && receipt.state === 'published';
  if (receipt.state !== 'spent') return false;
  if (busy.has(actor.uuid)) return false;
  busy.add(actor.uuid);
  const gmId = game.user.id;
  try {
    const published = { ...receipt, state: 'published', messageUuid: message.uuid };
    await item.update({ [`flags.${scope}.${flag}`]: published });
    return writer() && game.user.id === gmId && fromUuidSync(item.uuid) === item
      && JSON.stringify(item.getFlag(scope, flag)) === JSON.stringify(published);
  } catch { return false; }
  finally { busy.delete(actor.uuid); }
}

export function registerElunesRegardHooks() {
  Hooks.on('createChatMessage', async message => {
    if (!game.user?.isGM || game.users.activeGM !== game.user
      || !message.rolls?.some(roll => roll.options?.elunesRegard)) return;
    if (!await recordElunesRegardResult(message)) ui.notifications?.warn(words('PublicationPending'));
  });
}

export async function offerElunesRegard(actor, roll) {
  if (!actor?.isOwner || roll?.outcome?.success !== false || offers.has(actor)) return;
  const item = [...actor.items].find(eligible);
  if (!item || !game.users.activeGM) return;
  offers.set(actor, true);
  try {
    const original = JSON.stringify(roll.toJSON());
    const accepted = await foundry.applications.api.DialogV2.confirm({
      window: { title: words('Title') }, content: `<p>${words('Prompt')}</p>`,
      yes: { label: words('Use'), default: false }, no: { label: words('Keep'), default: true }, rejectClose: false
    });
    if (accepted !== true || !actor.isOwner || actor.items.get(item.id) !== item || !eligible(item)
      || JSON.stringify(roll.toJSON()) !== original || roll.outcome.success !== false) return;
    const gm = game.users.activeGM;
    if (!gm) return;
    const data = { actorUuid: actor.uuid, itemId: item.id, requestId: foundry.utils.randomID() };
    let result;
    try { result = gm === game.user ? await elunesRegardHandler(data, { user: game.user })
      : await gm.query(ELUNES_REGARD_QUERY, data, { timeout: 15000 }); }
    catch { result = { ok: false, pending: true }; }
    if (!result?.ok || !actor.isOwner || actor.items.get(item.id) !== item
      || JSON.stringify(roll.toJSON()) !== original) {
      ui.notifications?.warn(words(result?.pending || result?.ok ? 'Pending' : 'Changed'));
      return;
    }
    roll.options.elunesRegard = { itemUuid: item.uuid, requestId: data.requestId, original: JSON.parse(original) };
    roll.options.forcedSl = 0;
    roll.options.provenance ??= [];
    roll.options.provenance.push({ label: 'AZEROTH.ElunesRegard.Title', value: null, formula: words('Result') });
  } finally { offers.delete(actor); }
}
