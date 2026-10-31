import { requestAttackTransferReview } from "../effects/attack-transfer-review.mjs";
import { TRANSFER_DELIVERIES, transferReviewRow } from "../rules/damage-transfer-review.mjs";
const words = key => game.i18n.localize(`AZEROTH.AttackTransferReview.${key}`);
const nameOf = uuid => { try { return fromUuidSync(uuid)?.name ?? words("MissingActor"); } catch { return words("MissingActor"); } };
const describe = row => {
  const lanes = row.parts?.length ? [{ damage: row.mainDamage, type: row.type }, ...row.parts] : [row];
  return lanes.map(lane => `${lane.damage}${lane.type ? ` ${lane.type}` : ''}`).join(' + ');
};
const eligible = flags => flags?.kind === "attack" && !flags.parry && !flags.notAttack
  || flags?.kind === "spell" && flags.identifier === "chain-lightning" && flags.success === true;
const rowsFor = flags => (Array.isArray(flags?.attackResolution?.targets) ? flags.attackResolution.targets : []).flatMap((hit, index) => {
  const receipt = transferReviewRow(flags.attackResolution, flags[TRANSFER_DELIVERIES], index);
  if (!receipt) return [];
  const phase = receipt.phase.startsWith("sharePending:") ? "sharePending"
    : receipt.phase.startsWith("shareApplied:") ? "shareApplied" : receipt.phase;
  return [{ index, name: flags.targets?.[index]?.name ?? nameOf(hit.targetUuid), kind: words(receipt.kind),
    status: words(phase) + (phase.startsWith('share') ? ` — ${nameOf(receipt.phase.slice(receipt.phase.indexOf(':') + 1))}` : ''),
    delivery: [...(receipt.delivery.original ? [{ name: nameOf(hit.targetUuid), ...receipt.delivery.original }] : []),
      ...receipt.delivery.recipients.map(row => ({ name: nameOf(row.actorUuid), ...row }))].map(row => ({ ...row, damageText: describe(row) })) }];
});

export function showAttackTransferReview(message, html) {
  const flags = message.flags?.['azeroth-rpg'];
  const show = game.user.isGM && eligible(flags) && rowsFor(flags).length > 0;
  let box = html.querySelector('[data-attack-transfer-review]');
  if (!box && show) {
    box = document.createElement('div'); box.className = 'azeroth-card-actions'; box.dataset.attackTransferReview = '';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'reviewAttackTransfer'; button.textContent = words('Title');
    box.append(button); (html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if (box) box.hidden = !show;
}

export async function reviewAttackTransferFromCard(message) {
  const flags = message.flags?.['azeroth-rpg'];
  if (!game.user?.isGM || !eligible(flags)) return null;
  const expected = structuredClone({ state: flags.attackResolution, receipts: flags[TRANSFER_DELIVERIES] }), rows = rowsFor(flags);
  if (!rows.length) return null;
  const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/attack-transfer-review.hbs', { rows });
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: words('Title') }, classes: ['azeroth', 'azeroth-ice-block-review'], position: { width: 620 }, content, rejectClose: false,
    buttons: [{ action: 'review', label: words('Confirm'), callback: (_event, button) => button.form.elements.acknowledged?.checked === true ? Number(button.form.elements.hit.value) : -1 },
      { action: 'cancel', label: words('Cancel'), default: true, callback: () => -1 }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const update = () => { form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener('change', update); update();
    }
  });
  if (!Number.isInteger(selected) || !rows.some(row => row.index === selected)) return null;
  const result = await requestAttackTransferReview(message, selected, expected);
  const key = result.ok ? 'Reviewed' : result.reason === 'busy' ? 'Busy' : result.reason === 'writerActive' ? 'WriterActive' : 'Changed';
  ui.notifications[result.ok ? 'info' : 'warn'](words(key));
  return result;
}
