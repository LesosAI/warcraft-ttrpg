import { requestAttackReactionReview } from "../effects/attack-reaction-review.mjs";
import { reviewedAttackReaction } from "../rules/attack-reaction-review.mjs";
const words = key => game.i18n.localize(`AZEROTH.AttackReactionReview.${key}`);
const eligible = flags => flags?.kind === "attack" && !flags.parry && !flags.notAttack
  || flags?.kind === "spell" && flags.success === true;
const rowsFor = flags => (Array.isArray(flags?.attackResolution?.targets) ? flags.attackResolution.targets : [])
  .flatMap((row, index) => (flags.kind === 'attack' || row.stage === 'dispersing')
    && reviewedAttackReaction(flags.attackResolution, index, { userId: game.user.id, at: 0, damageReconciled: true })
    ? [{ index, dispersion: row.stage === 'dispersing', name: flags.targets?.[index]?.name ?? row.targetUuid, operation: words(row.stage),
      priest: row.stage === "warding" ? fromUuidSync(row.wardBy)?.name ?? row.wardBy : null }] : []);

export function showAttackReactionReview(message, html) {
  const flags = message.flags?.['azeroth-rpg'];
  const show = game.user.isGM && eligible(flags) && rowsFor(flags).length > 0;
  let box = html.querySelector('[data-attack-reaction-review]');
  if (!box && show) {
    box = document.createElement('div'); box.className = 'azeroth-card-actions'; box.dataset.attackReactionReview = '';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'reviewAttackReaction'; button.textContent = words('Title');
    box.append(button); (html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if (box) box.hidden = !show;
}

export async function reviewAttackReactionFromCard(message) {
  const flags = message.flags?.['azeroth-rpg'];
  if (!game.user?.isGM || !eligible(flags)) return null;
  const expected = structuredClone(flags.attackResolution), rows = rowsFor(flags);
  if (!rows.length) { ui.notifications.info(words('None')); return null; }
  const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/attack-reaction-review.hbs', { rows, hasDispersion: rows.some(row => row.dispersion) });
  const acknowledged = form => form.elements.acknowledged?.checked === true
    && (!rows.find(row => row.index === Number(form.elements.hit.value))?.dispersion || form.elements.damageReconciled?.checked === true);
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: words('Title') }, classes: ['azeroth', 'azeroth-ice-block-review'], position: { width: 580 }, content, rejectClose: false,
    buttons: [{ action: 'review', label: words('Confirm'), callback: (_event, button) => acknowledged(button.form) ? Number(button.form.elements.hit.value) : -1 },
      { action: 'cancel', label: words('Cancel'), default: true, callback: () => -1 }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const update = event => {
        if (event?.target === form.elements.hit) {
          form.elements.acknowledged.checked = false;
          if (form.elements.damageReconciled) form.elements.damageReconciled.checked = false;
        }
        form.querySelector('[data-action="review"]').disabled = !acknowledged(form);
      };
      form.addEventListener('change', update); update();
    }
  });
  if (!Number.isInteger(selected) || !rows.some(row => row.index === selected)) return null;
  const result = await requestAttackReactionReview(message, selected, expected, rows.find(row => row.index === selected)?.dispersion === true);
  const key = result.ok ? (rows.find(row => row.index === selected)?.dispersion ? 'DispersionReviewed' : 'Reviewed')
    : result.reason === 'busy' ? 'Busy' : result.reason === 'writerActive' ? 'WriterActive' : 'Changed';
  ui.notifications[result.ok ? 'info' : 'warn'](words(key));
  return result;
}
