import { requestChainLightningHitReview } from "../effects/attack-resolution-apply.mjs";
import { TRANSFER_DELIVERIES } from "../rules/damage-transfer-review.mjs";
const words = key => game.i18n.localize(`AZEROTH.ChainLightning.HitReview.${key}`);
const transferred = (flags, index) => Array.isArray(flags?.[TRANSFER_DELIVERIES])
  && flags[TRANSFER_DELIVERIES].some(receipt => receipt?.index === index);

export function showChainLightningHitReview(message, html) {
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.kind !== "spell" || flags.identifier !== "chain-lightning" || !flags.attackResolution) return;
  const rows = Array.isArray(flags.attackResolution.targets) ? flags.attackResolution.targets : [];
  const uncertain = rows.some(row => !["pending", "applied", "phased"].includes(row?.stage));
  for (const button of html.querySelectorAll('[data-action="applyDamage"][data-target-index]')) {
    const index = Number(button.dataset.targetIndex);
    button.disabled ||= uncertain || rows[index]?.stage !== "pending" || rows.slice(0, index).some(row => row?.stage !== "applied");
  }
  let box = html.querySelector('[data-chain-hit-review]');
  const show = game.user.isGM && rows.some((row, index) => row?.stage === "applying" && !transferred(flags, index));
  if (!box && show) {
    // Cards made before this control retain their original HTML.
    box = document.createElement('div'); box.dataset.chainHitReview = ''; box.className = 'azeroth-card-actions';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'reviewChainLightningHit'; button.textContent = words('Title');
    box.append(button); (html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if (box) box.hidden = !show;
}

export async function reviewChainLightningDamage(message) {
  if (!game.user?.isGM) return null;
  const flags = message.flags?.["azeroth-rpg"];
  if (flags?.kind !== "spell" || flags.identifier !== "chain-lightning") return null;
  const expected = structuredClone(flags.attackResolution);
  const rows = (Array.isArray(expected?.targets) ? expected.targets : []).flatMap((row, index) => row?.stage === "applying" && !transferred(flags, index)
    ? [{ index, number: index + 1, name: flags.targets?.[index]?.name ?? row.targetUuid, damage: flags.damageByTarget?.[index]?.damage ?? '?' }] : []);
  if (!rows.length) { ui.notifications.info(words('None')); return null; }
  const content = await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/chain-lightning-hit-review.hbs', { rows });
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: words('Title') }, classes: ['azeroth', 'azeroth-ice-block-review'], position: { width: 560 }, content, rejectClose: false,
    buttons: [{ action: 'review', label: words('Confirm'), callback: (_event, button) => button.form.elements.acknowledged?.checked === true ? Number(button.form.elements.hit.value) : -1 },
      { action: 'cancel', label: game.i18n.localize('AZEROTH.ChainLightning.Review.Cancel'), default: true, callback: () => -1 }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector('form');
      const update = event => {
        if (event?.target === form.elements.hit) form.elements.acknowledged.checked = false;
        form.querySelector('[data-action="review"]').disabled = form.elements.acknowledged?.checked !== true;
      };
      form.addEventListener('change', update); update();
    }
  });
  if (!Number.isInteger(selected) || !rows.some(row => row.index === selected)) return null;
  const result = await requestChainLightningHitReview(message, selected, expected);
  const key = result.ok ? 'Reviewed' : result.reason === 'busy' ? 'Busy' : result.reason === 'writerActive' ? 'WriterActive' : 'Changed';
  ui.notifications[result.ok ? 'info' : 'warn'](words(key));
  return result;
}
