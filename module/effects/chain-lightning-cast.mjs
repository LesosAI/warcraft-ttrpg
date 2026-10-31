import { resolveChainLightningPath } from "./chain-lightning-path.mjs";

export const CHAIN_LIGHTNING_CAST_QUERY = "azeroth-rpg.chainLightningCast";
export const CHAIN_LIGHTNING_REVIEW_QUERY = "azeroth-rpg.chainLightningReview";
const SCOPE = "azeroth-rpg", FLAG = "chainLightningCast";
const busy = new Set(), executions = new WeakSet();
const writer = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const optionKeys = ["attackTest", "modifier", "dc", "boons", "banes", "overchannel", "augment", "targets",
  "provenanceExtra", "extraRating", "damageRows", "viaItem", "source", "swift", "talentLines"];

export function isChainLightningExecution(value) {
  return writer() && value != null && executions.has(value);
}

/** The request contains choices and document identities, never a player-built
 * arc path. An uncertain payment or result remains claimed across GM handoff. */
export async function chainLightningCastHandler(payload = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.active || game.users.get(user.id) !== user) return refuse("permission");
  if (typeof payload.requestId !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(payload.requestId)) return refuse("request");
  const actor = await fromUuid(payload.actorUuid), spell = await fromUuid(payload.spellUuid);
  if (!writer() || !actor?.testUserPermission(user, "OWNER")) return refuse("permission");
  if (busy.has(actor.uuid)) return refuse("pending");
  busy.add(actor.uuid);
  let execution;
  try {
    const previous = actor.getFlag(SCOPE, FLAG);
    const recorded = [previous, ...(previous?.history ?? [])].find(row => row?.requestId === payload.requestId && row.userId === user.id);
    if (recorded) {
      return recorded.stage === "done" ? { ok: true, messageId: recorded.messageId }
        : refuse(recorded.stage === "reviewed" ? "reviewed" : recorded.stage === "refused" ? "refused" : "pending");
    }
    if (previous && !["done", "refused", "reviewed"].includes(previous.stage)) return refuse("pending");
    const options = Object.fromEntries(optionKeys.filter(key => Object.hasOwn(payload.options ?? {}, key)).map(key => [key, payload.options[key]]));
    const prepare = () => resolveChainLightningPath({ actor, spell, ...options, user });
    if (!prepare().ok) return refuse("preparation");
    // Retain compact completed request identities: an old delayed reply must
    // not become a new cast just because a later cast has already completed.
    const history = [...(previous?.history ?? []), ...(previous ? [{ requestId: previous.requestId,
      userId: previous.userId, stage: previous.stage, messageId: previous.messageId ?? null }] : [])];
    const claim = { requestId: payload.requestId, userId: user.id, writerId: game.user.id, stage: "pending", spellUuid: spell.uuid, history };
    await actor.setFlag(SCOPE, FLAG, claim);
    const valid = () => writer() && user.active && actor.testUserPermission(user, "OWNER")
      && same(actor.getFlag(SCOPE, FLAG), claim);
    if (!valid()) return refuse("pending");
    const confirmed = prepare();
    if (!confirmed.ok) {
      await actor.setFlag(SCOPE, FLAG, { ...claim, stage: "refused" });
      return refuse("preparation");
    }
    execution = { requestId: payload.requestId, userId: user.id, started: false, valid };
    executions.add(execution);
    const { castSpell } = await import("../dice/workflows.mjs");
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const first = confirmed.tokens[0];
    options.targets = targetSnapshots([{ id: first.id, actor: first.actor, name: first.name, scene: first.parent }]);
    if (options.viaItem) {
      const item = actor.items.get(options.viaItem.itemId), entry = item.system.spells[options.viaItem.index];
      options.viaItem = { itemId: item.id, index: options.viaItem.index, name: item.name, dc: entry.dc ?? null };
    }
    if (!valid()) return refuse("pending");
    const card = await castSpell({ ...options, actor, spell, chainExecution: execution });
    if (!valid()) return refuse("pending");
    if (!card) {
      if (execution.started) return refuse("pending");
      await actor.setFlag(SCOPE, FLAG, { ...claim, stage: "refused" });
      return refuse("refused");
    }
    if (card.getFlag(SCOPE, "chainLightningRoute")?.unresolved) return refuse("pending");
    let visible = card;
    if (!user.isGM && card.whisper?.length && !card.whisper.includes(user.id)) {
      // Publish only the casting roll, never hidden target snapshots or names.
      visible = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), author: user.id,
        content: `<p>${game.i18n.localize("AZEROTH.ChainLightning.PrivateResult")}</p><p>${game.i18n.format(
          card.getFlag(SCOPE, "success") === true ? "AZEROTH.ChainLightning.PrivateSuccess" : "AZEROTH.ChainLightning.PrivateFailure",
          { total: Number.isFinite(card.rolls?.[0]?.total) ? card.rolls[0].total : "—" })}</p>`, rolls: card.rolls,
        flags: { [SCOPE]: { kind: "chainLightningSummary", caster: actor.uuid, requestId: payload.requestId } } });
    }
    if (!visible || !valid()) return refuse("pending");
    const done = { ...claim, stage: "done", messageId: visible.id, detailId: card.id };
    await actor.setFlag(SCOPE, FLAG, done);
    return writer() && same(actor.getFlag(SCOPE, FLAG), done) ? { ok: true, messageId: visible.id } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { if (execution) executions.delete(execution); busy.delete(actor.uuid); }
}

/** Acknowledges manual reconciliation only. No cast, payment, damage or refund. */
export async function chainLightningReviewHandler({ actorUuid, expected, acknowledged } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.isGM || !user.active || game.users.get(user.id) !== user) return refuse("permission");
  if (acknowledged !== true) return refuse("acknowledgement");
  let actor;
  try { actor = await fromUuid(actorUuid); } catch { return refuse("actor"); }
  if (!actor || busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  try {
    const record = actor.getFlag(SCOPE, FLAG);
    if (record?.stage !== "pending" || !same(record, expected)) return refuse("changed");
    if (record.writerId && record.writerId !== game.user.id && game.users.get(record.writerId)?.active) return refuse("writerActive");
    if (!writer()) return refuse("authority");
    const reviewed = { ...record, stage: "reviewed", reviewedBy: user.id, reviewedAt: Date.now() };
    await actor.setFlag(SCOPE, FLAG, reviewed);
    return writer() && same(actor.getFlag(SCOPE, FLAG), reviewed) ? { ok: true } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { busy.delete(actor.uuid); }
}

export async function requestChainLightningReview(actor, expected) {
  const gm = game.users?.activeGM;
  if (!gm || !game.user?.isGM) return { ok: false, reason: "permission" };
  const payload = { actorUuid: actor.uuid, expected, acknowledged: true };
  try { return gm.id === game.user.id ? await chainLightningReviewHandler(payload, { user: game.user })
    : await gm.query(CHAIN_LIGHTNING_REVIEW_QUERY, payload, { timeout: 15000 }); }
  catch { return { ok: false, reason: "pending" }; }
}

export async function requestChainLightningCast(actor, spell, options) {
  const gm = game.users?.activeGM;
  if (!gm) { ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.NeedGM")); return null; }
  const payload = { actorUuid: actor.uuid, spellUuid: spell.uuid, requestId: foundry.utils.randomID(), options };
  try {
    const result = gm.id === game.user.id ? await chainLightningCastHandler(payload, { user: game.user })
      : await gm.query(CHAIN_LIGHTNING_CAST_QUERY, payload, { timeout: 120000 });
    if (result?.ok) {
      // The query reply and ChatMessage broadcast travel independently. Wait
      // for the already-created card; never repeat the paid cast to fetch it.
      return await new Promise(resolve => {
        let timer;
        const finish = message => { clearTimeout(timer); Hooks.off("createChatMessage", hook); resolve(message); };
        const hook = Hooks.on("createChatMessage", message => { if (message.id === result.messageId) finish(message); });
        timer = setTimeout(() => {
          const message = game.messages.get(result.messageId) ?? null;
          if (!message) ui.notifications?.info(game.i18n.localize("AZEROTH.ChainLightning.CardDelayed"));
          finish(message);
        }, 10000);
        const message = game.messages.get(result.messageId);
        if (message) finish(message);
      });
    }
    ui.notifications?.warn(game.i18n.localize(result?.reason === "pending" ? "AZEROTH.ChainLightning.CastPending"
      : result?.reason === "reviewed" ? "AZEROTH.ChainLightning.CastReviewed" : "AZEROTH.ChainLightning.CastRefused"));
  } catch { ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.CastPending")); }
  return null;
}
