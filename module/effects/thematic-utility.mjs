/** Utility casts use a private GM receipt. The ordinary casting workflow still
 * owns payment and the Test. A receipt can finish only its one recorded cast. */
import { utilitySpell, utilityChoice, prepareUtilityRecord, utilityEffectData, borrowedLanguages, activeUtilityEffects, underwaterSpeechAllowed } from "../rules/thematic-utility.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";

export const UTILITY_QUERY = "azeroth-rpg.thematicUtility";
export const UTILITY_CONSENT = "azeroth-rpg.thematicUtilityConsent";
const NS = "azeroth-rpg";
const jobs = new Map();
const words = (key, values) => values ? game.i18n.format(`AZEROTH.Utility.${key}`, values) : game.i18n.localize(`AZEROTH.Utility.${key}`);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const refused = reason => ({ok: false, reason});
const tokenAt = ref => game.scenes?.get(ref?.sceneId)?.tokens.get(ref?.tokenId) ?? null;
const refOf = ref => ref ? {sceneId: ref.sceneId ?? null, tokenId: ref.tokenId ?? null, actorId: ref.actorId ?? null} : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const privateUsers = actor => [...game.users].filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
const textContent = text => `<p>${foundry.utils.escapeHTML(text)}</p>`;
const stateOf = message => message?.flags?.[NS]?.utilityReceipt;
const write = (message, state) => message.update({[`flags.${NS}.utilityReceipt`]: foundry.data.operators.ForcedReplacement.create(state)});
const choiceLabel = choice => {
  if (choice?.language) return `${resolve(choice.speakerUuid)?.name ?? ""}: ${game.i18n.localize(globalThis.CONFIG?.AZEROTH?.languages?.[choice.language] ?? choice.language)}`;
  return choice?.subject ?? choice?.sample ?? choice?.scent ?? choice?.voice ?? "";
};

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(payload) {
  if (gmHere()) return utilityQueryHandler(payload, {user: game.user});
  if (!game.users?.activeGM) return refused("noGM");
  try { return await game.users.activeGM.query(UTILITY_QUERY, payload, {timeout: 300000}); }
  catch { return refused("unanswered"); }
}

/** Source and target identities remain tied to the actual selected tokens.
 * With no scene representation, range is an explicit GM judgement. */
function context(payload, user) {
  const actor = resolve(payload.actorUuid), spell = resolve(payload.spellUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refused("owner");
  const definition = utilitySpell(spell?.system?.identifier);
  if (spell?.type !== "spell" || !definition || (spell.actor && spell.actor.uuid !== actor.uuid)) return refused("spell");
  const identifier = spell.system.identifier;
  const isCreature = ["grand-lexicon", "scentweave", "tidebreath"].includes(identifier);
  const refs = isCreature ? payload.targets : [];
  if (!Array.isArray(refs) || (isCreature && (!refs.length || refs.length > definition.maxTargets))) return refused("targets");
  const sourceToken = tokenAt(payload.source);
  if (payload.source?.tokenId && (!sourceToken || sourceToken.actor?.uuid !== actor.uuid)) return refused("source");
  const recipients = [];
  let measured = Boolean(sourceToken);
  for (const ref of refs) {
    const token = tokenAt(ref);
    const target = ref.tokenId ? token?.actor : game.actors?.get(ref.actorId);
    if (!target || (ref.actorId && target.id !== ref.actorId)) return refused("targets");
    if (sourceToken && token) {
      const distance = feetApart(sourceToken, token);
      if (!Number.isFinite(distance) || distance > (definition.rangeFt || 5)) return refused("range");
    } else measured = false;
    recipients.push(target);
  }
  if (!isCreature) recipients.push(actor);
  if (new Set(recipients.map(a => a.uuid)).size !== recipients.length) return refused("targets");
  return {ok: true, actor, spell, identifier, definition, recipients, measured, sourceToken};
}

export async function prepareThematicUtility({actor, spell, source, targets = []}) {
  if (!utilitySpell(spell.system?.identifier)) return null;
  const identifier = spell.system.identifier;
  let fields = [];
  if (["ash-assay", "exacting-measure", "watershed"].includes(identifier)) fields = [{name: "sample", label: words("Sample"), maxLength: 120}];
  if (identifier === "scentweave") fields = [{name: "scent", label: words("Scent"), maxLength: 120}, {name: "sampled", label: words("Sampled"), type: "checkbox"}];
  if (identifier === "borrowed-voice") fields = [{name: "voice", label: words("Voice"), maxLength: 120}, {name: "heardSeconds", label: words("HeardSeconds"), type: "number", min: 60, value: 60}];
  if (identifier === "grand-lexicon") {
    const visible = (globalThis.canvas?.tokens?.placeables ?? []).filter(token => token.isVisible)
      .map(token => token.document?.actor).filter(Boolean);
    const actors = [actor, ...targets.map(ref => tokenAt(ref)?.actor ?? game.actors.get(ref.actorId)).filter(Boolean), ...visible];
    const unique = [...new Map(actors.map(a => [a.uuid, a])).values()];
    const options = unique.flatMap(a => borrowedLanguages(a.system.languages ?? [], [...a.effects ?? []], game.time.worldTime)
      .map(language => ({value: JSON.stringify({speakerUuid: a.uuid, language}), label: `${a.name}: ${game.i18n.localize(CONFIG.AZEROTH?.languages?.[language] ?? language)}`})));
    if (!options.length) return refused("language");
    fields = [{name: "speaker", label: words("Speaker"), options}];
  }
  const picked = fields.length ? await utilityDialog({title: spell.name, fields, note: words("Declare")}) : null;
  if (fields.length && !picked) return refused("cancelled");
  let choice = picked;
  if (identifier === "grand-lexicon") { try { choice = JSON.parse(picked.speaker); } catch { return refused("language"); } }
  return request({phase: "prepare", actorUuid: actor.uuid, spellUuid: spell.uuid, source: refOf(source), targets: targets.map(refOf), choice});
}

export async function finishThematicUtility(ticket, messageId) {
  return request({phase: "finish", ticket, messageId});
}

export async function claimThematicUtility(ticket, cast) {
  return request({phase: "claim", ticket, cast});
}

export async function utilityConsentHandler(payload, {user} = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const actor = resolve(payload.recipientUuid), caster = resolve(payload.casterUuid);
  if (!actor || !caster || !actor.testUserPermission(game.user, "OWNER") || !utilitySpell(payload.identifier)) return false;
  const {confirmHere} = await import("./blow-doors.mjs");
  return confirmHere(actor, {title: payload.name, text: words("Consent", {
    caster: foundry.utils.escapeHTML(caster.name), recipient: foundry.utils.escapeHTML(actor.name), spell: foundry.utils.escapeHTML(payload.name)
  })});
}

async function askConsent(ctx, choice) {
  const {answererOf, ASK_MS} = await import("./blow-doors.mjs");
  const people = [...ctx.recipients];
  if (ctx.identifier === "grand-lexicon") people.push(resolve(choice.speakerUuid));
  const unique = [...new Map(people.filter(Boolean).map(a => [a.uuid, a])).values()];
  const consents = [];
  for (const actor of unique) {
    const who = answererOf(actor);
    if (!who) return null;
    const payload = {recipientUuid: actor.uuid, casterUuid: ctx.actor.uuid, identifier: ctx.identifier, name: ctx.spell.name};
    let answer;
    try { answer = who.id === game.user.id ? await utilityConsentHandler(payload, {user: game.user})
      : await who.query(UTILITY_CONSENT, payload, {timeout: ASK_MS}); }
    catch { return null; }
    if (answer !== true || !actor.testUserPermission(who, "OWNER")) return null;
    consents.push({actorUuid: actor.uuid, userId: who.id});
  }
  return consents;
}

function choiceFor(ctx, raw, approved = false) {
  const speaker = resolve(raw?.speakerUuid);
  // A supplying speaker need not receive the spell or use one of its six
  // recipient places. It must still be present within the casting range.
  if (ctx.identifier === "grand-lexicon") {
    if (!speaker) return refused("speaker");
    if (ctx.sourceToken && speaker.uuid !== ctx.actor.uuid) {
      const present = [...(ctx.sourceToken.parent?.tokens ?? [])].some(token => {
        const distance = token.actor?.uuid === speaker.uuid ? feetApart(ctx.sourceToken, token) : null;
        return Number.isFinite(distance) && distance <= 30;
      });
      if (!present) return refused("speaker");
    } else if (!ctx.sourceToken && !approved) return refused("speaker");
  }
  const input = approved && ctx.identifier === "scentweave" ? {...raw, sampled: true}
    : approved && ctx.identifier === "borrowed-voice" ? {...raw, heardSeconds: 60}
    : raw?.subject ? {sample: raw.subject} : raw;
  return utilityChoice(ctx.identifier, input, {speakerUuid: speaker?.uuid, willing: approved,
    sampled: approved, heardSeconds: approved ? 60 : 0,
    languages: speaker ? borrowedLanguages(speaker.system.languages ?? [], [...speaker.effects ?? []], game.time.worldTime) : []});
}

export async function utilityQueryHandler(data = {}, {user} = {}) {
  if (!gmHere() || !user?.id) return refused("authority");
  if (data.phase === "claim") return serialized(data.ticket, async () => {
    const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
    if (!state || state.userId !== user.id || state.status !== "prepared" || state.claimCast
      || typeof data.cast !== "string" || !data.cast || Date.now() > state.wallExpires) return refused("ticket");
    const ctx = context(state, user);
    if (!ctx.ok || !choiceFor(ctx, state.choice, true).ok
      || !same(ctx.recipients.map(a => a.uuid), state.recipients.map(r => r.uuid))) return refused("changed");
    for (const consent of state.consents) if (!resolve(consent.actorUuid)?.testUserPermission(game.users.get(consent.userId), "OWNER")) return refused("consentChanged");
    await write(receipt, {...state, claimCast: data.cast, claimedAt: game.time.worldTime});
    return {ok: true};
  });
  if (data.phase === "finish") return serialized(data.ticket, () => finish(data, user));
  if (["inspect", "voice", "underwater"].includes(data.phase)) return interact(data, user);
  if (data.phase !== "prepare") return refused("phase");
  const ctx = context(data, user);
  if (!ctx.ok) return ctx;
  const needsFinding = ["ash-assay", "exacting-measure"].includes(ctx.identifier);
  const selection = JSON.stringify(data.choice ?? {});
  if (selection.length > 4000) return refused("choice");
  const review = await utilityDialog({title: ctx.spell.name, note: `${words("GMReview")} ${choiceLabel(data.choice)}`,
    fields: [
      {name: "eligible", type: "checkbox", label: words("Eligible")},
      ...(!ctx.measured ? [{name: "reach", type: "checkbox", label: words("Reach")}] : []),
      ...(needsFinding ? [{name: "findings", multiline: true, maxLength: 2000, label: words("Findings")}] : [])
    ]});
  if (!review?.eligible || (!ctx.measured && !review.reach)) return refused("cancelled");
  const choice = choiceFor(ctx, data.choice, true);
  if (!choice.ok) return choice;
  const consents = ["grand-lexicon", "scentweave", "tidebreath"].includes(ctx.identifier) ? await askConsent(ctx, choice.value) : [];
  if (!consents) return refused("declined");
  const fresh = context(data, user);
  if (!fresh.ok || !same(fresh.recipients.map(a => a.uuid), ctx.recipients.map(a => a.uuid)) || !choiceFor(fresh, choice.value, true).ok) return refused("changed");
  const state = {
    version: 1, status: "prepared", userId: user.id, preparedAt: game.time.worldTime,
    wallExpires: Date.now() + 600000, identifier: ctx.identifier,
    actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid,
    source: refOf(data.source), targets: data.targets.map(refOf),
    recipients: ctx.recipients.map(a => ({uuid: a.uuid, effectId: foundry.utils.randomID(), status: "pending"})),
    choice: choice.value, consents, findings: review.findings ?? "",
    resultId: foundry.utils.randomID()
  };
  const receipt = await ChatMessage.create({whisper: [...game.users].filter(u => u.isGM).map(u => u.id),
    content: textContent(`${ctx.spell.name}: ${choiceLabel(choice.value)}`), flags: {[NS]: {utilityReceipt: state}}});
  return {ok: true, ticket: receipt.id};
}

async function finish(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || (state.userId !== user.id && !user.isGM)) return refused("ticket");
  const card = game.messages.get(data.messageId), flags = card?.flags?.[NS];
  if (!card || card.author?.id !== state.userId || flags?.kind !== "spell" || flags.utilityTicket !== receipt.id
    || flags.caster !== state.actorUuid || flags.spellUuid !== state.spellUuid || flags.identifier !== state.identifier
    || !same(refOf(flags.source), state.source) || !same((flags.targets ?? []).map(refOf), state.targets)
    || typeof flags.cast !== "string" || !flags.cast || state.claimCast !== flags.cast) return refused("card");
  if (state.cardId && state.cardId !== card.id) return refused("alreadyBound");
  if (state.status === "complete" || state.status === "failed") return {ok: true, complete: state.status === "complete"};
  if (flags.success !== true) {
    await write(receipt, {...state, cardId: card.id, status: "failed"});
    return {ok: true, complete: false};
  }
  const ctx = context(state, user);
  if (!ctx.ok) return ctx;
  if (!same(ctx.recipients.map(a => a.uuid), state.recipients.map(r => r.uuid))) return refused("changed");
  for (const consent of state.consents) if (!resolve(consent.actorUuid)?.testUserPermission(game.users.get(consent.userId), "OWNER")) return refused("consentChanged");
  // Once the successful cast has a durable record, the supplying language is
  // fixed. A retry must not make Lexicon depend on the speaker still knowing
  // it (for example after the speaker's own borrowed language expires).
  if (!state.record && !choiceFor(ctx, state.choice, true).ok) return refused("choiceChanged");
  let record = state.record;
  if (!record) {
    const result = prepareUtilityRecord({identifier: state.identifier, cast: flags.cast, casterUuid: state.actorUuid,
      recipientUuids: state.recipients.map(r => r.uuid), choice: state.choice, now: state.claimedAt});
    if (!result.ok) return result;
    record = result.value;
    state.record = record;
    state.cardId = card.id;
    state.status = "applying";
    await write(receipt, state);
  }
  if (ctx.definition.seconds > 0) {
    if (record.expiresAt <= game.time.worldTime) return refused("expiredCast");
    for (const row of state.recipients) {
      const recipient = resolve(row.uuid);
      if (!recipient) return refused("targetDeleted");
      if (row.status === "complete") continue;
      let existing = recipient.effects.get(row.effectId);
      if (row.status === "writing" && !existing) return refused("effectUnresolved");
      if (!existing) {
        row.status = "writing";
        await write(receipt, state);
        const effect = utilityEffectData(record, {recipientUuid: row.uuid, spellUuid: ctx.spell.uuid,
          name: ctx.spell.name, img: ctx.spell.img, description: ctx.spell.system.effect, effectId: row.effectId});
        if (!effect) return refused("effect");
        Object.assign(effect.flags[NS], {cast: record.cast, messageId: card.id});
        [existing] = await recipient.createEmbeddedDocuments("ActiveEffect", [effect], {keepId: true});
      }
      if (existing?.flags?.[NS]?.utilitySpell?.cast !== record.cast) return refused("effectMismatch");
      // Replacement is by capability, independent of which caster supplied it.
      const old = recipient.effects.filter(e => e.id !== row.effectId && e.flags?.[NS]?.utilitySpell?.identifier === state.identifier);
      if (old.length) await recipient.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
      row.status = "complete";
      await write(receipt, state);
    }
  }
  if (!game.messages.get(state.resultId)) await ChatMessage.create({_id: state.resultId,
    whisper: privateUsers(ctx.actor), speaker: ChatMessage.getSpeaker({actor: ctx.actor}),
    content: textContent(`${ctx.spell.name}: ${state.findings || words("Applied")}`),
    flags: {[NS]: {utilityResult: {ticket: receipt.id, cardId: card.id, identifier: state.identifier}}}
  }, {keepId: true});
  state.status = "complete";
  await write(receipt, state);
  return {ok: true, complete: true};
}

async function interact(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (state?.status !== "complete" || !state.record) return refused("ticket");
  const now = game.time.worldTime;
  const actor = resolve(state.actorUuid);
  if (!actor || state.record.expiresAt <= now) return refused("expired");
  const activeFor = person => activeUtilityEffects([...person?.effects ?? []], state.identifier, now)
    .some(flag => flag.cast === state.record.cast);
  if (data.phase === "inspect") {
    if (!user.isGM || !["watershed", "scentweave"].includes(state.identifier)) return refused("permission");
    if (!state.recipients.some(row => activeFor(resolve(row.uuid)))) return refused("expired");
    const review = await utilityDialog({title: resolve(state.spellUuid)?.name ?? "", note: choiceLabel(state.choice), fields: [
      {name: "subject", label: words("Junction")},
      {name: "eligible", type: "checkbox", label: words(state.identifier === "watershed" ? "JunctionEligible" : "Eligible")},
      {name: "findings", multiline: true, maxLength: 2000, label: words("Findings")}
    ]});
    if (!review?.eligible || state.record.expiresAt <= game.time.worldTime) return refused("cancelled");
    // The GM records the actual test/junction result. This door never infers
    // chemistry, map rivers, or a tracker's success from an illustration.
    await ChatMessage.create({whisper: privateUsers(actor), content: textContent(`${review.subject}: ${review.findings}`),
      flags: {[NS]: {utilityFinding: {ticket: receipt.id, at: game.time.worldTime}}}});
    return {ok: true};
  }
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 1000) return refused("speech");
  if (data.phase === "voice") {
    if (state.identifier !== "borrowed-voice" || !actor.testUserPermission(user, "OWNER") || !activeFor(actor)) return refused("permission");
    await ChatMessage.create({speaker: {alias: state.choice.voice}, content: textContent(data.text),
      flags: {[NS]: {utilitySpeech: {ticket: receipt.id}}}});
    return {ok: true};
  }
  if (state.identifier !== "tidebreath" || data.underwater !== true) return refused("water");
  const sourceToken = tokenAt(data.source), speaker = sourceToken?.actor;
  if (!speaker?.testUserPermission(user, "OWNER") || !activeFor(speaker)
    || !Array.isArray(data.targets) || data.targets.length < 1 || data.targets.length > 5) return refused("speaker");
  const listeners = [];
  for (const ref of data.targets) {
    const token = tokenAt(ref), listener = token?.actor;
    if (!listener || !underwaterSpeechAllowed([...speaker.effects], [...listener.effects], {
      distance: feetApart(sourceToken, token), sameScene: sourceToken.parent.id === token.parent.id, now
    })) return refused("range");
    listeners.push(listener);
  }
  const audience = [...new Set([speaker, ...listeners].flatMap(privateUsers))];
  await ChatMessage.create({whisper: audience, speaker: ChatMessage.getSpeaker({actor: speaker}), content: textContent(data.text),
    flags: {[NS]: {utilitySpeech: {ticket: receipt.id}}}});
  return {ok: true};
}

/** A retry uses the original successful card and never calls castSpell again. */
export function registerUtilityCardHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message.flags?.[NS];
    if (!flags?.utilityTicket || !flags.success) return;
    const container = html.querySelector(".azeroth-card");
    if (!container) return;
    const owner = game.user.isGM || message.author?.id === game.user.id;
    if (owner) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = words("Resolve");
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await finishThematicUtility(flags.utilityTicket, message.id);
        if (!result?.ok) ui.notifications.warn(words("AfterFailed"));
      } finally { button.disabled = false; }
    });
    container.append(button);
    }
    const action = flags.identifier === "borrowed-voice" && owner ? "voice"
      : flags.identifier === "tidebreath" ? "underwater"
      : game.user.isGM && ["watershed", "scentweave"].includes(flags.identifier) ? "inspect" : null;
    if (!action) return;
    const interactButton = document.createElement("button");
    interactButton.type = "button";
    interactButton.textContent = words(action === "voice" ? "Speak" : action === "underwater" ? "UnderwaterSpeak" : "Inspect");
    interactButton.addEventListener("click", async () => {
      interactButton.disabled = true;
      try {
        let extra = {};
        if (action !== "inspect") {
          const picked = await utilityDialog({title: interactButton.textContent, fields: [
            {name: "text", multiline: true, label: words("Speech")},
            ...(action === "underwater" ? [{name: "underwater", type: "checkbox", label: words("Underwater")}] : [])
          ]});
          if (!picked) return;
          extra = picked;
          if (action === "underwater") {
            const tokens = globalThis.canvas?.tokens?.controlled ?? [];
            if (tokens.length !== 1) { ui.notifications.warn(words("Unavailable")); return; }
            const toRef = token => ({sceneId: token.document.parent.id, tokenId: token.id, actorId: token.actor?.id});
            extra.source = toRef(tokens[0]);
            extra.targets = [...game.user.targets].map(toRef);
          }
        }
        const result = await request({phase: action, ticket: flags.utilityTicket, ...extra});
        if (!result?.ok) ui.notifications.warn(words("Unavailable"));
      } finally { interactButton.disabled = false; }
    });
    container.append(interactButton);
  });
}
