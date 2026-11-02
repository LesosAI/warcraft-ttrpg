import { gadgetReviewState, gadgetResistanceRequest, isResistedGadget } from '../effects/gadget-resistance.mjs';
import { resistKey } from '../rules/records.mjs';
const words = key => game.i18n.localize(`AZEROTH.Card.${key}`);

export function showGadgetRecovery(message, html) {
  if (!game.user?.isGM || !isResistedGadget(message.flags?.['azeroth-rpg'])) return;
  const flags = message.flags['azeroth-rpg'];
  const original = html.querySelector('[data-action="resistTest"]');
  for (const [key, claim] of Object.entries(flags.gadgetResistClaims ?? {})) {
    const index = flags.targets?.findIndex(row => resistKey(row) === key) ?? -1;
    if (claim.state !== 'pending' && !(claim.state === 'reviewed' && !flags.resists?.[key])) continue;
    const button = document.createElement('button'); button.type = 'button';
    if (claim.state === 'pending') {
      Object.assign(button.dataset, { action: 'reviewGadgetResistance', claimKey: key });
      button.textContent = `${words('GadgetReview')}: ${flags.targets?.[index]?.name ?? key}`;
    } else {
      if (!original || index < 0) continue;
      Object.assign(button.dataset, original.dataset, { action: 'overrideGadgetResist', targetIndex: String(index) });
      button.textContent = words('GadgetResistOverride');
    }
    (html.querySelector('.azeroth-card-body') ?? html).append(button);
  }
}

export async function reviewGadgetResistance(message, key) {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return null;
  const snapshot = gadgetReviewState(message, key);
  if (!snapshot) return null;
  const content = document.createElement('div');
  for (const text of [snapshot.target?.name ?? key, words('GadgetReviewHelp')]) {
    const p = document.createElement('p'); p.textContent = text; content.append(p);
  }
  const facts = document.createElement('p');
  facts.textContent = game.i18n.format('AZEROTH.Card.GadgetReviewFacts', {
    total: snapshot.result?.total ?? '—', dc: snapshot.result?.dc ?? '—',
    effects: snapshot.effects?.map(effect => effect.name).join(', ') || '—'
  });
  content.append(facts);
  const label = document.createElement('label'), checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.name = 'acknowledged';
  label.append(checkbox, document.createTextNode(words('GadgetReviewAck'))); content.append(label);
  const accepted = await foundry.applications.api.DialogV2.wait({
    window: { title: words('GadgetReview') }, classes: ['azeroth', 'azeroth-gadget-review'],
    content: content.innerHTML, rejectClose: false,
    buttons: [{ action: 'review', label: words('GadgetReview'), callback: (_event, button) => button.form.elements.acknowledged.checked },
      { action: 'cancel', label: game.i18n.localize('AZEROTH.ChainLightning.Review.Cancel'), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const refresh = () => { form.querySelector('[data-action="review"]').disabled = !form.elements.acknowledged.checked; };
      form.addEventListener('change', refresh); refresh();
    }
  });
  if (!accepted) return null;
  const result = await gadgetResistanceRequest({ action: 'review', messageId: message.id,
    resultId: snapshot.claim.resultId, key, snapshot, acknowledged: true });
  ui.notifications[result.ok ? 'info' : 'warn'](words(result.ok ? 'GadgetReviewed' : 'GadgetReviewChanged'));
  return result;
}
