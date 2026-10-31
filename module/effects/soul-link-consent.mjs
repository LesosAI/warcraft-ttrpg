/** Soul Link preflight and recipient consent. No effect or resource writes.
 * A positive answer is a freshly checked proposal, not a client-authorized
 * instruction to create a link. The casting coordinator must bind it to a cast.
 */
import { feetApart } from "../canvas/footprints.mjs";
import { effectDuration } from "../rules/spell-effects.mjs";

export const SOUL_LINK_CONSENT = "azeroth-rpg.soulLinkConsent";
const refuse = reason => ({ ok: false, reason });
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = row => row?.sceneId && row?.tokenId ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve Touch against the explicitly selected tokens. Never substitute an
 * arbitrary token or treat unavailable geometry as being within reach.
 */
export function soulLinkCastContext({ casterUuid, spellUuid, targets, source } = {}, user) {
  const caster = resolve(casterUuid), spell = resolve(spellUuid);
  if (!user?.id || !caster?.testUserPermission(user, "OWNER")) return refuse("permission");
  if (spell?.type !== "spell" || spell.system?.identifier !== "soul-link") return refuse("spell");
  if (spell.actor && spell.actor.uuid !== caster.uuid) return refuse("spell");
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const sourceToken = tokenAt(source), targetToken = tokenAt(targets[0]);
  const recipient = targetToken?.actor;
  if (!sourceToken || !targetToken || !recipient || sourceToken.actor?.uuid !== caster.uuid
    || recipient?.id !== targets[0].actorId || recipient.uuid === caster.uuid) return refuse("target");
  if (!(caster.system?.health?.value > 0) || !(recipient.system?.health?.value > 0)) return refuse("health");
  const distance = feetApart(sourceToken, targetToken);
  if (!Number.isFinite(distance) || distance < 0 || distance > 5) return refuse("range");
  const duration = effectDuration(spell.system.duration);
  const seconds = duration?.value * ({ minutes: 60, hours: 3600, days: 86400 }[duration?.units] ?? 0);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return refuse("duration");
  return { ok: true, caster, recipient, spell, state: {
    casterUuid: caster.uuid, recipientUuid: recipient.uuid, spellUuid: spell.uuid,
    sourceTokenUuid: sourceToken.uuid, targetTokenUuid: targetToken.uuid, seconds
  } };
}

/** Executed on the recipient owner's client, requested only by the active GM.
 * The query cannot pay, mutate an effect, or authorize a later unrelated cast.
 */
export async function soulLinkConsentHandler(payload = {}, { user } = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const ctx = soulLinkCastContext(payload, user);
  if (!ctx.ok || !ctx.recipient.testUserPermission(game.user, "OWNER")) return false;
  const { confirmHere } = await import("./blow-doors.mjs");
  const escape = foundry.utils.escapeHTML;
  const answer = await confirmHere(ctx.recipient, {
    title: game.i18n.localize("AZEROTH.SoulLink.ConsentTitle"),
    text: game.i18n.format("AZEROTH.SoulLink.ConsentAsk", {
      caster: escape(ctx.caster.name), recipient: escape(ctx.recipient.name)
    })
  });
  const fresh = soulLinkCastContext(payload, user);
  return answer === true && fresh.ok && same(fresh.state, ctx.state)
    && fresh.recipient.testUserPermission(game.user, "OWNER");
}

/** Active-GM preflight for the casting coordinator. Cancellation, timeout and
 * changed eligibility return refusal, with no action, Mana or effect mutation.
 */
export async function requestSoulLinkConsent(payload = {}, { user } = {}) {
  if (!game.user?.isGM || game.user.id !== game.users?.activeGM?.id) return refuse("authority");
  const ctx = soulLinkCastContext(payload, user);
  if (!ctx.ok) return ctx;
  const { answererOf, ASK_MS } = await import("./blow-doors.mjs");
  const who = answererOf(ctx.recipient);
  if (!who) return refuse("unavailable");
  let yes = false;
  try {
    yes = who.id === game.user.id ? await soulLinkConsentHandler(payload, { user: game.user })
      : await who.query(SOUL_LINK_CONSENT, payload, { timeout: ASK_MS });
  } catch { return refuse("unanswered"); }
  if (yes !== true) return refuse("declined");
  const fresh = soulLinkCastContext(payload, user);
  if (!fresh.ok || !same(fresh.state, ctx.state) || !fresh.recipient.testUserPermission(who, "OWNER")) return refuse("changed");
  return { ok: true, ...fresh.state, consentUserId: who.id };
}
