import { MIND_CONTROL_RESOLUTION } from '../effects/mind-control-creation.mjs';
import { mindControlRecord, mindControlOn } from '../rules/mind-control.mjs';
import { requestMindControlReview } from '../effects/mind-control-review-query.mjs';
import { drawCardPartial } from '../helpers/card-partials.mjs';
import { missedMindControl, activateMissedMindControl } from '../effects/mind-control-missed.mjs';
const MIND_CONTROL_REVIEW = 'systems/azeroth-rpg/templates/chat/partials/mind-control-review.hbs';
const words = key => game.i18n.localize(`AZEROTH.MindControl.Review.${key}`);
const pending = message => {
  const receipt = message.getFlag('azeroth-rpg', MIND_CONTROL_RESOLUTION);
  return receipt?.version === 1 && receipt.stage === 'applying' && receipt.messageUuid === message.uuid
    && mindControlRecord(receipt) ? receipt : null;
};
export function showMindControlReview(message, html) {
  const activation = !pending(message) && Boolean(missedMindControl(message));
  const show = game.user?.isGM && (Boolean(pending(message)) || activation);
  let box = html.querySelector('[data-mind-control-review]');
  if (!box && show) {
    box = drawCardPartial(MIND_CONTROL_REVIEW, { activation }, message);
    if (box) (html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if (box) {
    box.hidden = !show;
    const button = box.querySelector('[data-action="reviewMindControl"]');
    if (button) button.textContent = words(activation ? 'ActivateTitle' : 'Title');
  }
}
export async function reviewMindControlFromCard(message) {
  if (!game.user?.isGM) return null;
  const receipt = pending(message);
  const missed = receipt ? null : missedMindControl(message);
  if (!receipt && !missed) return null;
  const activation = Boolean(missed);
  const expected = structuredClone(receipt ?? missed.record);
  const caster = fromUuidSync(expected.casterUuid), target = fromUuidSync(expected.targetUuid);
  const effects = [...(target?.effects ?? [])].filter(effect => mindControlOn(effect, target.uuid)?.messageUuid === message.uuid);
  const reservations = (caster?.getFlag('azeroth-rpg', 'sustaining') ?? []).filter(entry => entry?.cast === message.uuid);
  const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/mind-control-review.hbs', {
    activation, caster: caster?.name ?? words('Missing'), target: target?.name ?? words('Missing'), dc: expected.dc,
    effects: effects.map(effect => ({ name: effect.name, id: effect.id })),
    reservationCount: reservations.length
  });
  const acknowledged = await foundry.applications.api.DialogV2.wait({ window: { title: words(activation ? 'ActivateTitle' : 'Title') },
    classes: ['azeroth', 'azeroth-ice-block-review'], position: { width: 600 }, content, rejectClose: false,
    buttons: [{ action: 'review', label: words(activation ? 'Activate' : 'Confirm'), callback: (_event, button) => button.form.elements.acknowledged?.checked === true },
      { action: 'cancel', label: words('Cancel'), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const update = () => { form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener('change', update); update();
    }
  });
  if (acknowledged !== true) return null;
  const result = activation ? await activateMissedMindControl({ message, expected, acknowledged })
    : await requestMindControlReview(message, expected);
  const key = result.ok ? (activation ? 'Activated' : 'Reviewed') : result.reason === 'busy' ? 'Busy' : result.reason === 'writerActive' ? 'WriterActive' : 'Changed';
  ui.notifications[result.ok ? 'info' : 'warn'](words(key)); return result;
}
