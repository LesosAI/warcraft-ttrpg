import { resolveChainLightningPath } from "./chain-lightning-path.mjs";
import { finishEvidence } from "../rules/chain-lightning-finish.mjs";

export const CHAIN_LIGHTNING_CAST_QUERY = "azeroth-rpg.chainLightningCast";
export const CHAIN_LIGHTNING_REVIEW_QUERY = "azeroth-rpg.chainLightningReview";
const SCOPE = "azeroth-rpg", FLAG = "chainLightningCast";
const busy = new Set(), executions = new WeakSet(), resumes = new WeakSet();
// Why a cast was refused before payment, in words. A cast the GM's own client turned down
// (Mana, Half-Action, cast cap) has no entry: the GM's screen carries that warning.
const REFUSED_WORDS = Object.freeze({
  count: "AZEROTH.ChainLightning.Refused.Count", level: "AZEROTH.ChainLightning.Refused.Level",
  stale: "AZEROTH.ChainLightning.Refused.Stale", range: "AZEROTH.ChainLightning.Refused.Range",
  source: "AZEROTH.ChainLightning.Refused.Source", geometry: "AZEROTH.ChainLightning.Refused.Geometry",
  spell: "AZEROTH.ChainLightning.Refused.Spell", item: "AZEROTH.ChainLightning.Refused.Item",
  permission: "AZEROTH.ChainLightning.Refused.Permission", authority: "AZEROTH.ChainLightning.Refused.Authority"
});
const writer = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// THE RECORD IS WRITTEN WHOLE (D-2174). Core merges an object written into a flag with the one
// stored (`ObjectField#_updateDiff`), so `setFlag` kept a `done` record's `messageId` and `detailId`
// (or a review's `reviewedBy`) inside the next cast's claim, every `same()` against that claim failed,
// and every Chain Lightning after a caster's first was refused as pending and left for review.
const writeRecord = (actor, value) => actor.update({ [`flags.${SCOPE}.${FLAG}`]: foundry.data.operators.ForcedReplacement.create(value) });
const REVIEW_MODES = Object.freeze(["review", "complete", "resume"]);
const optionKeys = ["attackTest", "modifier", "dc", "boons", "banes", "overchannel", "augment", "targets",
  "provenanceExtra", "extraRating", "damageRows", "viaItem", "source", "swift", "talentLines"];

export function isChainLightningExecution(value) {
  return writer() && value != null && executions.has(value);
}

/** The review handler's own resume token (D-2174): made on the active GM from the stored card,
 * never from a payload, and the only key `chain-lightning-resume.mjs#postResumedCard` accepts. */
export function isChainResumeExecution(value) {
  return writer() && value != null && resumes.has(value);
}

/** A card the casting player cannot read: whispered to the GMs and not to them. */
const hiddenFrom = (card, user) => !user?.isGM && card.whisper?.length > 0 && !card.whisper.includes(user?.id);

/** THE ONE PUBLIC SUMMARY of a GM-only Chain Lightning card (the cast handler's and the review's
 * Finish cast): the casting roll alone, never hidden target snapshots or names. */
function postSummary({ actor, card, requestId, authorId }) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), author: authorId,
    content: `<p>${game.i18n.localize("AZEROTH.ChainLightning.PrivateResult")}</p><p>${game.i18n.format(
      card.getFlag(SCOPE, "success") === true ? "AZEROTH.ChainLightning.PrivateSuccess" : "AZEROTH.ChainLightning.PrivateFailure",
      { total: Number.isFinite(card.rolls?.[0]?.total) ? card.rolls[0].total : "—" })}</p>`, rolls: card.rolls,
    flags: { [SCOPE]: { kind: "chainLightningSummary", caster: actor.uuid, requestId } } });
}

const allMessages = () => Array.from(game.messages?.values?.() ?? []);

/** A plain snapshot of a chat card for `rules/chain-lightning-finish.mjs#finishEvidence`. A card
 * whose flags or roll cannot be read is still listed, marked `readable: false`. */
function cardSnapshot(message) {
  let flags = null, total = null, readable = true;
  try {
    const own = message.flags?.[SCOPE] ?? {};
    flags = { kind: own.kind ?? null, caster: own.caster ?? null, success: own.success ?? null,
      chainLightningRequestId: own.chainLightningRequestId ?? null,
      chainLightningRoute: own.chainLightningRoute ? { ...own.chainLightningRoute } : null,
      chainLightningSuperseded: own.chainLightningSuperseded ?? null,
      chainLightningResumedFrom: own.chainLightningResumedFrom ?? null,
      chainLightningResume: own.chainLightningResume ?? null };
  } catch { readable = false; }
  try { total = message.rolls?.[0]?.total ?? null; } catch { readable = false; }
  return { id: message.id, uuid: message.uuid, timestamp: message.timestamp ?? 0, whisper: [...(message.whisper ?? [])],
    total, readable, flags: flags ?? {} };
}

/** What the chat holds for a pending Chain Lightning record, judged (D-2174). The dialog shows it
 * and the review handler judges it again on the active GM from the documents themselves. */
export function chainLightningFinishEvidence(actor, record) {
  const cards = allMessages().filter(message => {
    try { return typeof message.flags?.[SCOPE]?.chainLightningRequestId === "string"; } catch { return true; }
  }).map(cardSnapshot);
  return finishEvidence({ record, casterUuid: actor?.uuid, cards });
}

/** The public summary already posted for this request, earliest first. */
function summaryFor(actor, requestId) {
  return allMessages().filter(message => {
    const own = message.flags?.[SCOPE];
    return own?.kind === "chainLightningSummary" && own.requestId === requestId && own.caster === actor.uuid;
  }).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0] ?? null;
}

/** The request contains choices and document identities, never a player-built
 * arc path. An uncertain payment or result remains claimed across GM handoff. */
export async function chainLightningCastHandler(payload = {}, { user } = {}) {
  const refuse = (reason, why) => ({ ok: false, reason, ...(why ? { why } : {}) });
  if (!writer() || !user?.active || game.users.get(user.id) !== user) return refuse("permission");
  if (typeof payload.requestId !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(payload.requestId)) return refuse("request");
  const actor = await fromUuid(payload.actorUuid), spell = await fromUuid(payload.spellUuid);
  if (!writer() || !actor?.testUserPermission(user, "OWNER")) return refuse("permission");
  if (busy.has(actor.uuid)) return refuse("pending");
  busy.add(actor.uuid);
  let execution, claim = null;
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
    const trial = prepare();
    if (!trial.ok) return refuse("preparation", trial.detail ?? trial.reason);
    // Retain compact completed request identities: an old delayed reply must
    // not become a new cast just because a later cast has already completed.
    const history = [...(previous?.history ?? []), ...(previous ? [{ requestId: previous.requestId,
      userId: previous.userId, stage: previous.stage, messageId: previous.messageId ?? null }] : [])];
    claim = { requestId: payload.requestId, userId: user.id, writerId: game.user.id, stage: "pending", spellUuid: spell.uuid, history };
    await writeRecord(actor, claim);
    const valid = () => writer() && user.active && actor.testUserPermission(user, "OWNER")
      && same(actor.getFlag(SCOPE, FLAG), claim);
    if (!valid()) return refuse("pending");
    const confirmed = prepare();
    if (!confirmed.ok) {
      await writeRecord(actor, { ...claim, stage: "refused" });
      return refuse("preparation", confirmed.detail ?? confirmed.reason);
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
      await writeRecord(actor, { ...claim, stage: "refused" });
      return refuse("refused");
    }
    if (card.getFlag(SCOPE, "chainLightningRoute")?.unresolved) return refuse("pending");
    const visible = hiddenFrom(card, user)
      ? await postSummary({ actor, card, requestId: payload.requestId, authorId: user.id }) : card;
    if (!visible || !valid()) return refuse("pending");
    const done = { ...claim, stage: "done", messageId: visible.id, detailId: card.id };
    await writeRecord(actor, done);
    return writer() && same(actor.getFlag(SCOPE, FLAG), done) ? { ok: true, messageId: visible.id } : refuse("pending");
  } catch {
    // Payment starts only once `started` is set. An error before that spent nothing, so it is a
    // refusal and must not leave the caster blocked behind a GM review of a cast that never paid.
    if (claim && !execution?.started) {
      try { if (same(actor.getFlag(SCOPE, FLAG), claim)) await writeRecord(actor, { ...claim, stage: "refused" }); return refuse("refused"); }
      catch { return refuse("pending"); }
    }
    return refuse("pending");
  }
  finally { if (execution) executions.delete(execution); busy.delete(actor.uuid); }
}

/**
 * The GM's review of a pending cast. **It never casts, pays, refunds or deals damage.**
 * - `review` (Mark reviewed) closes the record as `reviewed`: the GM reconciled it by hand.
 * - `complete` (Finish cast, D-2174) closes it as `done` against the one card the cast posted,
 *   where `finishEvidence` finds that card resolved: only the bookkeeping failed. It posts the
 *   public summary a GM-only card needs, where none stands.
 * - `resume` (Finish cast on a paid card whose arcs were not resolved) claims the record, has
 *   `chain-lightning-resume.mjs` post the resolved card from the card's record and Roll, and
 *   closes the record as `done` against the new card.
 * The evidence is judged again HERE from the documents, never taken from the payload, and every
 * write is judged again after every await.
 */
export async function chainLightningReviewHandler({ actorUuid, expected, acknowledged, mode = "review" } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.isGM || !user.active || game.users.get(user.id) !== user) return refuse("permission");
  if (acknowledged !== true) return refuse("acknowledgement");
  if (!REVIEW_MODES.includes(mode)) return refuse("mode");
  let actor;
  try { actor = await fromUuid(actorUuid); } catch { return refuse("actor"); }
  if (!actor || busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  try {
    const record = actor.getFlag(SCOPE, FLAG);
    if (record?.stage !== "pending" || !same(record, expected)) return refuse("changed");
    if (record.writerId && record.writerId !== game.user.id && game.users.get(record.writerId)?.active) return refuse("writerActive");
    if (!writer()) return refuse("authority");
    if (mode === "complete") return await finishCompleted(actor, record, user);
    if (mode === "resume") return await finishResumed(actor, record, user);
    const reviewed = { ...record, stage: "reviewed", reviewedBy: user.id, reviewedAt: Date.now() };
    await writeRecord(actor, reviewed);
    return writer() && same(actor.getFlag(SCOPE, FLAG), reviewed) ? { ok: true } : refuse("pending");
  } catch { return refuse("pending"); }
  finally { busy.delete(actor.uuid); }
}

/** Finish cast on `complete` evidence: the record closed as `done` against the card, with the
 * public summary where the card is GM-only. Inside the handler's `busy` claim, on the active GM. */
async function finishCompleted(actor, record, user) {
  const refuse = reason => ({ ok: false, reason });
  const still = () => writer() && same(actor.getFlag(SCOPE, FLAG), record);
  const judged = () => {
    const evidence = chainLightningFinishEvidence(actor, record);
    return evidence.kind === "complete" ? game.messages.get(evidence.card.id) ?? null : null;
  };
  const card = judged();
  if (!card) return refuse("evidence");
  const caster = game.users.get(record.userId) ?? null;
  let visible = card;
  if (hiddenFrom(card, caster)) {
    visible = summaryFor(actor, record.requestId);
    if (!visible) {
      if (!still()) return refuse("changed");
      visible = await postSummary({ actor, card, requestId: record.requestId, authorId: caster?.id ?? game.user.id });
    }
  }
  if (!visible || !still()) return refuse("changed");
  if (judged() !== card) return refuse("evidence");
  const done = { ...record, stage: "done", messageId: visible.id, detailId: card.id, finishedBy: user.id, finishedAt: Date.now() };
  await writeRecord(actor, done);
  return writer() && same(actor.getFlag(SCOPE, FLAG), done) ? { ok: true, messageId: visible.id } : refuse("pending");
}

/** Finish cast on `resume` evidence (D-2174): the record claimed for this card before any work, so
 * a second press or a second GM finds it changed and makes no second card; the resolved card
 * posted by the one door; the record closed as `done` against it. Where nothing was posted, the
 * record is put back as it was, so the review can be tried again; where a card may have been
 * posted, the claim stays, and the next review finds that card (its `chainLightningResumedFrom`). */
async function finishResumed(actor, record, user) {
  const refuse = (reason, why) => ({ ok: false, reason, ...(why ? { why } : {}) });
  const evidence = chainLightningFinishEvidence(actor, record);
  const card = evidence.kind === "resume" ? game.messages.get(evidence.card.id) ?? null : null;
  if (!card) return refuse("evidence");
  const claim = { ...record, writerId: game.user.id, resume: { cardId: card.id, by: user.id } };
  await writeRecord(actor, claim);
  const claimed = () => writer() && same(actor.getFlag(SCOPE, FLAG), claim);
  if (!claimed()) return refuse("changed");
  const cardFlags = JSON.stringify(card.flags?.[SCOPE] ?? null);
  const valid = () => claimed() && game.messages.get(card.id) === card && JSON.stringify(card.flags?.[SCOPE] ?? null) === cardFlags;
  const execution = { requestId: record.requestId, cardId: card.id, valid };
  resumes.add(execution);
  let result;
  try {
    const { postResumedCard } = await import("./chain-lightning-resume.mjs");
    result = await postResumedCard({ actor, card, execution });
  } catch { result = { ok: false, reason: "card", posted: "unknown" }; }
  finally { resumes.delete(execution); }
  if (!result?.ok) {
    if (result?.posted === false && claimed()) await writeRecord(actor, record);
    return refuse(result?.reason ?? "card", result?.why);
  }
  const made = result.card;
  const caster = game.users.get(record.userId) ?? null;
  const visible = hiddenFrom(made, caster)
    ? await postSummary({ actor, card: made, requestId: record.requestId, authorId: caster?.id ?? game.user.id }) : made;
  if (!visible || !claimed()) return refuse("pending");
  const { resume: _resume, ...kept } = claim;
  const done = { ...kept, stage: "done", messageId: visible.id, detailId: made.id, resumedFrom: card.id,
    finishedBy: user.id, finishedAt: Date.now() };
  await writeRecord(actor, done);
  return writer() && same(actor.getFlag(SCOPE, FLAG), done) ? { ok: true, messageId: visible.id, detailId: made.id } : refuse("pending");
}

export async function requestChainLightningReview(actor, expected, mode = "review") {
  const gm = game.users?.activeGM;
  if (!gm || !game.user?.isGM) return { ok: false, reason: "permission" };
  const payload = { actorUuid: actor.uuid, expected, acknowledged: true, mode };
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
      : result?.reason === "reviewed" ? "AZEROTH.ChainLightning.CastReviewed"
      : REFUSED_WORDS[result?.why] ?? "AZEROTH.ChainLightning.CastRefused"));
  } catch { ui.notifications?.warn(game.i18n.localize("AZEROTH.ChainLightning.CastPending")); }
  return null;
}
