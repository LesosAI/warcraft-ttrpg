import { damageTransferCandidates, refreshDamageTransferChoice } from "./damage-transfer-candidates.mjs";
import { answererOf } from "./blow-doors.mjs";

export const DAMAGE_TRANSFER_CHOICE = "azeroth-rpg.chooseDamageTransfer";
const TIMEOUT = 25000;
const local = key => game.i18n.localize(`AZEROTH.DamageTransfer.${key}`);
const format = (key, values) => game.i18n.format(`AZEROTH.DamageTransfer.${key}`, values);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const refuse = reason => ({ ok: false, reason });

/** Project only the information needed to choose, never document objects or
 * hidden actor/resource snapshots. Descriptions pass through enrichment, so
 * actor and effect names are escaped before entering their HTML context. */
export function damageTransferChoiceRows(candidates) {
  const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
  return candidates.map(candidate => {
    const p = candidate.plan;
    let name, description;
    if (candidate.kind === "redirect") {
      name = format("Named", { effect: p.row.name, holder: p.holder.name });
      description = format("Redirect", { damage: p.moved, holder: escape(p.holder.name) });
    } else if (candidate.kind === "division") {
      name = format("Named", { effect: p.name, holder: p.holderName });
      description = format("Divide", { kept: p.keep,
        shares: p.others.map(part => format("Share", { name: escape(part.actor.name), damage: part.share })).join("; ") });
    } else if (candidate.kind === "soulLink") {
      name = format("Named", { effect: local("SoulLink"), holder: p.recipient.name });
      description = format("Link", { kept: p.damage.caster.damage, damage: p.damage.recipient.damage, recipient: escape(p.recipient.name) });
    } else throw Error("Unknown damage transfer kind");
    if (!candidate.available) description += ` ${local("Unavailable")}`;
    return { key: candidate.key, name, description, available: candidate.available === true };
  });
}

/** The active GM asks the target's owner. The response chooses an offered key;
 * it cannot supply amounts, authorize writes, or select an unowned target. */
export async function damageTransferChoiceHandler({ targetUuid, requestId, options } = {}, { user } = {}) {
  const target = resolve(targetUuid);
  const valid = () => user?.isGM && user.id === game.users?.activeGM?.id && target?.documentName === "Actor"
    && resolve(targetUuid) === target && target.testUserPermission(game.user, "OWNER");
  if (!valid() || typeof requestId !== "string" || !requestId || !Array.isArray(options) || !options.length
    || options.some(o => !o || typeof o.key !== "string" || !o.key || typeof o.name !== "string" || typeof o.description !== "string" || typeof o.available !== "boolean")
    || new Set(options.map(o => o.key)).size !== options.length || !options.some(o => o.available)) return refuse("permission");
  const offered = structuredClone(options);
  const { chooseOption } = await import("../dice/workflows.mjs");
  const answer = await chooseOption({ id: `transfer-${requestId}`, name: local("Title") }, offered, local("Note"),
    { prompt: format("Prompt", { name: target.name }), label: "AZEROTH.DamageTransfer.Choose", timeoutMs: TIMEOUT });
  if (!valid()) return refuse("changed");
  if (!answer) return refuse("cancelled");
  return offered.some(o => o.available && o.key === answer.key) ? { ok: true, key: answer.key } : refuse("selection");
}

/** Called only inside the future authoritative damage operation. readCurrent
 * must rebuild current mitigation facts after the answer; valid must check its
 * claim/authority. This function itself never claims, spends or delivers damage. */
export async function chooseDamageTransfer(readCurrent, { valid } = {}) {
  if (!gmHere() || typeof readCurrent !== "function" || typeof valid !== "function" || !valid()) return refuse("authority");
  try {
    const current = readCurrent(), target = current?.target;
    const prepared = damageTransferCandidates(current);
    if (!prepared.ok) return prepared;
    if (!prepared.candidates.length) return { ok: true, candidate: null };
    if (target?.documentName !== "Actor" || resolve(target.uuid) !== target) return refuse("target");
    const who = answererOf(target);
    if (!who || !target.testUserPermission(who, "OWNER")) return refuse("unavailable");
    const payload = { targetUuid: target.uuid, requestId: foundry.utils.randomID(24), options: damageTransferChoiceRows(prepared.candidates) };
    const answer = who.id === game.user.id ? await damageTransferChoiceHandler(payload, { user: game.user })
      : await who.query(DAMAGE_TRANSFER_CHOICE, payload, { timeout: TIMEOUT + 5000 });
    if (!gmHere() || !valid() || resolve(target.uuid) !== target || !target.testUserPermission(who, "OWNER")
      || answererOf(target)?.id !== who.id) return refuse("changed");
    if (!answer?.ok) return refuse(answer?.reason ?? "unanswered");
    const selected = prepared.candidates.find(c => c.available && c.key === answer.key);
    if (!selected) return refuse("selection");
    const fresh = readCurrent();
    if (fresh?.target !== target) return refuse("changed");
    return refreshDamageTransferChoice(selected, fresh);
  } catch { return refuse("unanswered"); }
}
