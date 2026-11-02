import { hungerMasteredRecoveryView, reviewHungerMastered } from '../effects/hunger-mastered.mjs';
import { elunesRegardRecoveryViews, reviewElunesRegard } from '../effects/elunes-regard.mjs';
import { militiaRecoveryViews, reviewMilitiaDrill } from '../effects/militia-drill.mjs';
import { zalazaneRecoveryView, reviewZalazane } from '../effects/zalazanes-lesson.mjs';
import { mindSootheRecoveryViews, reviewMindSoothe } from '../effects/mind-soothe.mjs';
import { dominationOrderRecoveryViews, reviewDominationOrder } from './domination-orders.mjs';
import { dominationDeletionViews, reviewDominationDeletion } from '../effects/domination-deletion.mjs';
import { dominationDeliveryViews, reviewDominationDelivery } from '../effects/compel.mjs';
import { bellowRecoveryViews, reviewBellowDelivery } from '../effects/bellow-journal.mjs';
import { injuryRecoveryViews, reviewInjuryApplication } from '../effects/injury-application.mjs';
import { explosiveTrapRecoveryViews, reviewExplosiveTrap } from '../effects/explosive-trap.mjs';
import { snareTriggerRecoveryViews, reviewSnareTrigger } from '../effects/snare-trigger.mjs';
import { snakeTrapRecoveryViews, reviewSnakeTrapDelivery } from '../effects/snake-trap-catches.mjs';
import { manaBurnRecoveryViews, reviewManaBurn } from '../effects/mana-burn.mjs';
import { orphanConflagrateViews, reviewOrphanConflagrate } from '../effects/conflagrate.mjs';
import {rocketJumpRecoveryViews,reviewRocketJump} from '../effects/rocket-jump-use.mjs';
const words = key => game.i18n.localize(`AZEROTH.HungerMastered.${key}`);

export async function reviewHungerMasteredUses() {
  if (!game.user?.isGM || game.users.activeGM !== game.user) return null;
  const actors = new Map(Array.from(game.actors ?? []).map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? [])
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  const rows = [...actors.values()].flatMap(actor => {
    const expected = hungerMasteredRecoveryView(actor);
    const zalazane = zalazaneRecoveryView(actor);
    return [
      ...rocketJumpRecoveryViews(actor).map(view=>({name:`${actor.name} — Rocket Jump`,expected:view,kind:'rocketJump'})),
      ...(expected ? [{ name: `${actor.name} — ${game.i18n.localize('AZEROTH.HungerMastered.Title')}`, expected, kind: 'hunger' }] : []),
      ...elunesRegardRecoveryViews(actor).map(view => ({name:`${actor.name} — ${game.i18n.localize('AZEROTH.ElunesRegard.Title')}`, expected:view, kind:'elunesRegard'})),
      ...(zalazane ? [{ name: `${actor.name} — ${game.i18n.localize('AZEROTH.Zalazane.Title')}`, expected: zalazane, kind: 'zalazane' }] : []),
      ...mindSootheRecoveryViews(actor).map(view => ({ name: `${actor.name} — Mind Soothe`, expected: view, kind: 'mindSoothe' })),
      ...dominationOrderRecoveryViews(actor).map(view => ({ name: `${actor.name} — ${game.i18n.localize('AZEROTH.DominationOrder.Title')}`, expected: view, kind: 'dominationOrder' })),
      ...dominationDeletionViews(actor).map(view => ({ name: `${actor.name} — ${game.i18n.localize('AZEROTH.DominationOrder.DeletionReview')}`, expected: view, kind: 'dominationDeletion' })),
      ...dominationDeliveryViews(actor).map(view => ({ name: `${actor.name} — ${game.i18n.localize('AZEROTH.DominationOrder.DeliveryReview')}`, expected: view, kind: 'dominationDelivery' })),
      ...bellowRecoveryViews(actor).map(view => ({ name: `${actor.name} — Bellow`, expected: view, kind: 'bellow' })),
      ...injuryRecoveryViews(actor).map(view => ({name:`${actor.name} — ${game.i18n.localize('AZEROTH.Sacrifice.Title')} / ${view.messageId}`,expected:view,kind:'injury'})),
      ...explosiveTrapRecoveryViews(actor).map(view => ({name:`${actor.name} — Explosive Trap / ${view.messageId}`,expected:view,kind:'explosiveTrap'})),
      ...snareTriggerRecoveryViews(actor).map(view => ({name:`${actor.name} — Snare / ${view.messageId}`,expected:view,kind:'snareTrigger'})),
      ...snakeTrapRecoveryViews(actor).map(view => ({name:`${actor.name} — Snake Trap poison / ${view.messageId}`,expected:view,kind:'snakeTrap'})),
      ...manaBurnRecoveryViews(actor).map(view => ({name:`${actor.name} — Mana Burn / ${view.messageId}`,expected:view,kind:'manaBurn'})),
      ...orphanConflagrateViews(actor).map(view => ({name:`${actor.name} — Conflagrate / ${view.messageId}`,expected:view,kind:'orphanConflagrate'})),
      ...militiaRecoveryViews(actor).map(view => ({ name: `${actor.name} — ${view.groups.find(group => group.id === view.groupId)?.name ?? view.groupId}`,
        expected: view, kind: 'militia' }))
    ];
  });
  if (!rows.length) { ui.notifications.info(words('ReviewNone')); return null; }
  const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/hunger-mastered-review.hbs', {
    rows: rows.map((row, index) => ({ index, name: row.name, details: JSON.stringify(row.expected, null, 2) }))
  });
  const index = await foundry.applications.api.DialogV2.wait({
    window: { title: words('ReviewTitle') }, classes: ['azeroth'], position: { width: 620 }, content, rejectClose: false,
    buttons: [
      { action: 'resolve', label: words('ReviewConfirm'), callback: (_event, button) =>
        button.form.elements.acknowledged.checked ? Number(button.form.elements.attempt.value) : null },
      { action: 'cancel', label: words('ReviewCancel'), default: true, callback: () => null }
    ],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const update = event => {
        if (event?.target === form.elements.attempt) form.elements.acknowledged.checked = false;
        for (const panel of form.querySelectorAll('[data-attempt]')) panel.hidden = panel.dataset.attempt !== form.elements.attempt.value;
        form.querySelector('[data-action="resolve"]').disabled = !form.elements.acknowledged.checked;
      };
      form.addEventListener('change', update); update();
    }
  });
  if (!Number.isInteger(index) || !rows[index]) return null;
  const expected = rows[index].expected;
  const review = { snakeTrap: reviewSnakeTrapDelivery, snareTrigger: reviewSnareTrigger, explosiveTrap: reviewExplosiveTrap, injury: reviewInjuryApplication, elunesRegard: reviewElunesRegard, militia: reviewMilitiaDrill, hunger: reviewHungerMastered, zalazane: reviewZalazane, mindSoothe: reviewMindSoothe, dominationOrder: reviewDominationOrder, dominationDeletion: reviewDominationDeletion, dominationDelivery: reviewDominationDelivery, bellow: reviewBellowDelivery }[rows[index].kind];
  const handler = {rocketJump:reviewRocketJump,manaBurn:reviewManaBurn,orphanConflagrate:reviewOrphanConflagrate}[rows[index].kind] ?? review;
  const result = await handler({ actorUuid: expected.actorUuid, expected, acknowledged: true });
  ui.notifications[result.ok ? 'info' : 'warn'](words(result.ok ? 'ReviewDone' : 'ReviewChanged'));
  return result;
}

export function registerHungerMasteredReview() {
  Hooks.on('renderActorDirectory', (_app, element) => {
    if (!game.user?.isGM) return;
    const footer = element?.querySelector('footer.directory-footer');
    if (!footer || footer.querySelector('[data-hunger-review]')) return;
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.hungerReview = ''; button.textContent = words('ReviewTitle');
    button.addEventListener('click', () => reviewHungerMasteredUses().catch(() => ui.notifications.warn(words('ReviewChanged'))));
    footer.append(button);
  });
}
