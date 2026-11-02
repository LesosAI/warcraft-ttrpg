import { resilienceWithDialog } from "./actions.mjs";
import { resolveExplosiveTrap } from "../effects/explosive-trap.mjs";
import { explosiveTrapSnapshot } from "../rules/explosive-trap.mjs";
import { snareOwnsCondition } from "../rules/snare-trigger.mjs";
import { resistLink } from "../rules/records.mjs";
import { drawCardPartial } from "../helpers/card-partials.mjs";

const SCOPE = "azeroth-rpg";
const EXPLOSIVE_TRAP_RESIST = "systems/azeroth-rpg/templates/chat/partials/explosive-trap-resist.hbs";
const pending = new Set();
const words = (key, data = {}) => game.i18n.format(`AZEROTH.ExplosiveTrap.${key}`, data);

function readyFor(flags, actor) {
  return Boolean(actor?.isOwner && game.users?.activeGM && flags?.kind === "feature" && flags.featureKey === "snare"
    && flags.explosiveTrap?.version === 1 && explosiveTrapSnapshot(flags.explosiveTrap)
    && flags.explosiveTrap.type === "fire" && flags.explosiveTrap.resilience === "reflex"
    && flags.snareTrigger?.phase === "resolved" && flags.snareTrigger.areaTargets?.includes(actor.uuid)
    && !(flags.explosiveTrapClaims ?? []).some(row => row.actorUuid === actor.uuid));
}

export function showExplosiveTrapState(message, html) {
  const flags = message.flags?.[SCOPE];
  if (!snareOwnsCondition(flags, "entangled")) return;
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  // Old cards can contain these controls in stored HTML. Entry and the saved
  // blast, never selected tokens or setting-time targets, own their damage.
  for (const button of body.querySelectorAll('[data-action="applyDamage"], [data-action="resistTest"]')) {
    if (button.dataset.action === "resistTest" && button.dataset.purpose) continue;
    button.remove();
  }
  body.querySelector("[data-explosive-trap]")?.remove();
  if (!flags.explosiveTrap && flags.damageType !== "fire") return;
  const section = document.createElement("div"); section.dataset.explosiveTrap = "";
  const status = document.createElement("p"); status.className = "azeroth-card-source"; status.setAttribute("role", "status");
  status.textContent = words(!flags.explosiveTrap ? "Legacy" : flags.snareTrigger?.phase === "resolved" ? "Triggered"
    : flags.snareTrigger ? "Unresolved" : "Waiting", { dc: flags.explosiveTrap?.dc });
  section.append(status);
  if (flags.explosiveTrap && flags.snareTrigger?.phase === "resolved") for (const uuid of flags.snareTrigger.areaTargets ?? []) {
    const actor = fromUuidSync(uuid);
    if (!actor?.isOwner) continue;
    const claim = (flags.explosiveTrapClaims ?? []).find(row => row.actorUuid === uuid);
    const row = document.createElement("div"); row.className = "azeroth-card-actions";
    if (readyFor(flags, actor)) {
      const button = drawCardPartial(EXPLOSIVE_TRAP_RESIST, { actorUuid: uuid, name: actor.name, dc: flags.explosiveTrap.dc }, message);
      if (button) row.append(button);
    } else {
      const text = document.createElement("span");
      text.textContent = words(claim?.phase === "complete" ? "Complete" : claim?.phase === "reviewed" ? "Reviewed" : claim ? "Review" : "Unavailable", {
        name: actor.name, damage: claim?.damage?.damage ?? 0 }); row.append(text);
    }
    section.append(row);
  }
  body.append(section);
}

export async function resistExplosiveTrapCard(button, message) {
  const actor = await fromUuid(button.dataset.actorUuid ?? "");
  const key = `${message.id}/${actor?.uuid}`;
  if (pending.has(key) || !readyFor(message.flags?.[SCOPE], actor)) {
    ui.notifications?.warn(words("Refused")); return null;
  }
  pending.add(key);
  try {
    const result = await resilienceWithDialog(actor, "reflex", null, {
      dc: message.flags[SCOPE].explosiveTrap.dc,
      link: resistLink({ messageId: message.id, actorId: actor.id, identifier: "explosive-trap",
        tokenId: actor.token?.id ?? null, sceneId: actor.token?.parent?.id ?? null })
    });
    if (!result) return null;
    const answer = await resolveExplosiveTrap(message, actor, result);
    if (!answer?.ok) ui.notifications?.warn(words("Refused"));
    return answer;
  } finally { pending.delete(key); }
}
