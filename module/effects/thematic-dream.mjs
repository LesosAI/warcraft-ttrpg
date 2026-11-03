/** Dream Theatre's GM-owned cast receipt and voluntary private channel. */
import { DREAM_THEATRE, activeDreamMembers, dreamContribution, dreamEffectActive,
  dreamEffectData, leaveDream, startDream } from "../rules/thematic-dream.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { utilityDialog } from "../applications/thematic-utility-dialog.mjs";

export const DREAM_QUERY = "azeroth-rpg.thematicDream";
export const DREAM_CONSENT = "azeroth-rpg.thematicDreamConsent";
const NS = "azeroth-rpg";
const jobs = new Map();
const refused = reason => ({ ok: false, reason });
const ref = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);
const refOf = value => value ? { sceneId: value.sceneId ?? null, tokenId: value.tokenId ?? null, actorId: value.actorId ?? null } : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = value => game.scenes?.get(value?.sceneId)?.tokens.get(value?.tokenId) ?? null;
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const stateOf = message => message?.flags?.[NS]?.dreamReceipt;
const write = (message, state) => message.update({ [`flags.${NS}.dreamReceipt`]: foundry.data.operators.ForcedReplacement.create(state) });
const words = key => game.i18n.localize(`AZEROTH.Dream.${key}`);
const textContent = value => `<p>${foundry.utils.escapeHTML(value)}</p>`;

async function serialized(key, work) {
  const previous = jobs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  jobs.set(key, current);
  try { return await current; }
  finally { if (jobs.get(key) === current) jobs.delete(key); }
}

async function request(data) {
  if (gmHere()) return dreamQueryHandler(data, { user: game.user });
  if (!game.users?.activeGM) return refused("noGM");
  try { return await game.users.activeGM.query(DREAM_QUERY, data, { timeout: 300000 }); }
  catch { return refused("unanswered"); }
}

function targetOf(value) {
  const token = tokenAt(value);
  return value?.tokenId ? token?.actor : game.actors?.get(value?.actorId);
}

function context(data, user) {
  const actor = resolve(data.actorUuid), spell = resolve(data.spellUuid);
  if (actor?.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) return refused("owner");
  if (spell?.type !== "spell" || spell.system?.identifier !== DREAM_THEATRE.identifier
    || (spell.actor && spell.actor.uuid !== actor.uuid)) return refused("spell");
  if (!Array.isArray(data.targets) || data.targets.length < 1 || data.targets.length > DREAM_THEATRE.maxMembers) return refused("targets");
  const sourceToken = tokenAt(data.source);
  if (data.source?.tokenId && (!sourceToken || sourceToken.actor?.uuid !== actor.uuid)) return refused("source");
  const members = [];
  let measured = true;
  for (const targetRef of data.targets) {
    const target = targetOf(targetRef), token = tokenAt(targetRef);
    if (!target || (targetRef.actorId && target.id !== targetRef.actorId)) return refused("targets");
    if (sourceToken && token) {
      const distance = feetApart(sourceToken, token);
      if (sourceToken.parent?.id !== token.parent?.id || !Number.isFinite(distance)
        || distance < 0 || distance > DREAM_THEATRE.rangeFt) return refused("range");
    } else measured = false;
    members.push(target);
  }
  if (new Set(members.map(member => member.uuid)).size !== members.length) return refused("targets");
  return { ok: true, actor, spell, members, measured };
}

async function consent(member, caster, spell) {
  const { answererOf, ASK_MS } = await import("./blow-doors.mjs");
  const who = answererOf(member);
  if (!who) return null;
  const data = { memberUuid: member.uuid, casterUuid: caster.uuid, spellUuid: spell.uuid };
  try {
    const accepted = who.id === game.user.id ? await dreamConsentHandler(data, { user: game.user })
      : await who.query(DREAM_CONSENT, data, { timeout: ASK_MS });
    return accepted === true && member.testUserPermission(who, "OWNER") ? { actorUuid: member.uuid, userId: who.id } : null;
  } catch { return null; }
}

export async function dreamConsentHandler(data, { user } = {}) {
  if (!user?.isGM || user.id !== game.users?.activeGM?.id) return false;
  const member = resolve(data.memberUuid), caster = resolve(data.casterUuid), spell = resolve(data.spellUuid);
  if (!member || !caster || spell?.system?.identifier !== DREAM_THEATRE.identifier
    || !member.testUserPermission(game.user, "OWNER")) return false;
  const { confirmHere } = await import("./blow-doors.mjs");
  return confirmHere(member, { title: spell.name, text: words("Consent") });
}

/** Selected token/Actor refs come from the ordinary spell target picker. */
export function prepareDreamCast({ actor, spell, source = null, targets = [] } = {}) {
  if (spell?.system?.identifier !== DREAM_THEATRE.identifier) return null;
  return request({ phase: "prepare", actorUuid: actor?.uuid, spellUuid: spell.uuid,
    source: refOf(source), targets: targets.map(refOf) });
}
export const claimDreamCast = (ticket, cast) => request({ phase: "claim", ticket, cast });
export const finishDreamCast = (ticket, messageId) => request({ phase: "finish", ticket, messageId });

/** Only currently effective membership can open the channel. */
export function dreamFor(actor) {
  const now = game.time?.worldTime ?? 0;
  const effect = [...actor?.effects ?? []].find(effect => dreamEffectActive(effect, actor.uuid, now));
  const mark = effect?.flags?.[NS]?.dreamTheatre;
  return mark ? { ticket: mark.ticket, cast: mark.cast, effectId: effect.id } : null;
}

function hasOtherDream(actor, exceptTicket = null) {
  return [...actor?.effects ?? []].some(effect => {
    const mark = effect.flags?.[NS]?.dreamTheatre;
    return mark?.version === 1 && mark.ticket !== exceptTicket && mark.expiresAt > game.time.worldTime;
  });
}

export async function contributeDream(ticket) {
  const listed = await request({ phase: "members", ticket });
  if (!listed?.ok) return listed;
  if (!listed.options.length) return refused("member");
  const picked = await utilityDialog({ title: words("Contribute"), note: words("Uncertain"), fields: [
    { name: "member", label: words("Member"), options: listed.options },
    { name: "kind", label: words("Kind"), options: [
      { value: "memory", label: words("Memory") }, { value: "invention", label: words("Invention") }
    ] },
    { name: "text", label: words("Description"), multiline: true, maxLength: 2000 }
  ] });
  if (!picked) return refused("cancelled");
  return request({ phase: "contribute", ticket, contributionId: foundry.utils.randomID(),
    memberUuid: picked.member, kind: picked.kind, text: picked.text });
}

export async function leaveDreamChannel(ticket) {
  const listed = await request({ phase: "members", ticket });
  if (!listed?.ok) return listed;
  if (!listed.options.length) return refused("member");
  const picked = await utilityDialog({ title: words("Leave"), note: words("Wake"),
    fields: [{ name: "member", label: words("Member"), options: listed.options }] });
  if (!picked) return refused("cancelled");
  return request({ phase: "leave", ticket, memberUuid: picked.member, reason: "woke" });
}

/** Call after committed outside Health damage. No simulated dream injury counts. */
export function endDreamOnDamage(actor, before, after) {
  if (!actor || !Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after >= before) return null;
  const held = dreamFor(actor);
  return held ? request({ phase: "leave", ticket: held.ticket, memberUuid: actor.uuid,
    reason: "damage", before, after }) : null;
}

function participantUsers(state) {
  const ids = new Set([...game.users].filter(user => user.isGM).map(user => user.id));
  for (const row of state.rows) if (row.status === "complete") {
    const actor = resolve(row.actorUuid);
    if (!actor) continue;
    for (const user of game.users) if (actor.testUserPermission(user, "OWNER")) ids.add(user.id);
  }
  return [...ids];
}

export async function dreamQueryHandler(data = {}, { user } = {}) {
  if (!gmHere() || !user?.id) return refused("authority");
  if (["claim", "finish", "contribute", "leave"].includes(data.phase)) return serialized(data.ticket, () => {
    if (data.phase === "claim") return claim(data, user);
    if (data.phase === "finish") return finish(data, user);
    if (data.phase === "contribute") return contribute(data, user);
    return leave(data, user);
  });
  if (data.phase === "members") return members(data, user);
  if (data.phase !== "prepare") return refused("phase");
  const ctx = context(data, user);
  if (!ctx.ok) return ctx;
  if (ctx.members.some(member => hasOtherDream(member))) return refused("alreadyDreaming");
  const review = await utilityDialog({ title: ctx.spell.name,
    note: `${words("Review")} ${ctx.members.map(member => member.name).join(", ")}`,
    fields: [{ name: "sleeping", type: "checkbox", label: words("Sleeping") },
      { name: "minute", type: "checkbox", label: words("Minute") },
      ...(!ctx.measured ? [{ name: "reach", type: "checkbox", label: words("Reach") }] : [])] });
  if (!review?.sleeping || !review.minute || (!ctx.measured && !review.reach)) return refused("cancelled");
  const consents = [];
  for (const member of ctx.members) {
    const agreed = await consent(member, ctx.actor, ctx.spell);
    if (!agreed) return refused("declined");
    consents.push(agreed);
  }
  const fresh = context(data, user);
  if (!fresh.ok || !same(fresh.members.map(member => member.uuid), ctx.members.map(member => member.uuid))
    || fresh.members.some(member => hasOtherDream(member))) return refused("changed");
  const state = { version: 1, status: "prepared", userId: user.id, wallExpires: Date.now() + 600000,
    actorUuid: ctx.actor.uuid, spellUuid: ctx.spell.uuid, source: refOf(data.source), targets: data.targets.map(refOf),
    rows: ctx.members.map(member => ({ actorUuid: member.uuid, effectId: foundry.utils.randomID(), status: "pending" })),
    consents, contributions: [] };
  const receipt = await ChatMessage.create({ whisper: [...game.users].filter(who => who.isGM).map(who => who.id),
    content: textContent(ctx.spell.name), flags: { [NS]: { dreamReceipt: state } } });
  return { ok: true, ticket: receipt.id };
}

async function claim(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.userId !== user.id || state.status !== "prepared" || state.claimCast
    || !ref(data.cast) || Date.now() > state.wallExpires) return refused("ticket");
  const ctx = context(state, user);
  if (!ctx.ok || !same(ctx.members.map(member => member.uuid), state.rows.map(row => row.actorUuid))
    || ctx.members.some(member => hasOtherDream(member))) return refused("changed");
  for (const agreed of state.consents) if (!resolve(agreed.actorUuid)?.testUserPermission(game.users.get(agreed.userId), "OWNER")) return refused("consentChanged");
  // The GM and participants made every interactive judgement during prepare.
  // Claim rechecks identities, range and consent without opening UI after the
  // workflow has paid the casting budget and Mana.
  const fresh = context(state, user);
  if (!fresh.ok || !same(fresh.members.map(member => member.uuid), state.rows.map(row => row.actorUuid))
    || fresh.members.some(member => hasOtherDream(member))
    || state.consents.some(agreed => !resolve(agreed.actorUuid)?.testUserPermission(game.users.get(agreed.userId), "OWNER"))) return refused("changed");
  const claimTime = game.time.worldTime;
  await write(receipt, { ...state, claimCast: data.cast, claimTime });
  return { ok: true };
}

async function finish(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || (state.userId !== user.id && !user.isGM) || !state.claimCast) return refused("ticket");
  const card = game.messages.get(data.messageId), flags = card?.flags?.[NS];
  if (!card || card.author?.id !== state.userId || flags?.dreamTicket !== receipt.id || flags.kind !== "spell"
    || flags.identifier !== DREAM_THEATRE.identifier || flags.caster !== state.actorUuid
    || flags.spellUuid !== state.spellUuid || flags.cast !== state.claimCast
    || !same(refOf(flags.source), state.source) || !same((flags.targets ?? []).map(refOf), state.targets)) return refused("card");
  if (state.cardId && state.cardId !== card.id) return refused("alreadyBound");
  if (state.status === "complete" || state.status === "failed") return { ok: true, complete: state.status === "complete" };
  if (flags.success !== true) {
    await write(receipt, { ...state, cardId: card.id, status: "failed" });
    return { ok: true, complete: false };
  }
  const ctx = context(state, user);
  if (!ctx.ok || !same(ctx.members.map(member => member.uuid), state.rows.map(row => row.actorUuid))
    || ctx.members.some(member => hasOtherDream(member, receipt.id))) return refused("changed");
  if (state.claimTime + DREAM_THEATRE.seconds <= game.time.worldTime) return refused("expired");
  let record = state.record;
  if (!record) {
    const made = startDream({ cast: state.claimCast, casterUuid: state.actorUuid, now: state.claimTime,
      members: state.rows.map(row => ({ actorUuid: row.actorUuid, willing: true, sleeping: true })) });
    if (!made.ok) return made;
    record = made.value;
    await write(receipt, { ...state, record, cardId: card.id, status: "applying" });
  }
  for (const row of state.rows) {
    if (row.status === "complete") continue;
    const member = resolve(row.actorUuid);
    if (!member) return refused("memberGone");
    let existing = member.effects.get(row.effectId);
    if (row.status === "writing" && !existing) return refused("effectUnresolved");
    if (!existing) {
      row.status = "writing";
      await write(receipt, { ...state, record, cardId: card.id, status: "applying" });
      const source = dreamEffectData(record, { actorUuid: row.actorUuid, ticket: receipt.id,
        spellUuid: state.spellUuid, messageId: card.id, effectId: row.effectId,
        img: ctx.spell.img, description: ctx.spell.system.effect });
      if (!source) return refused("effect");
      [existing] = await member.createEmbeddedDocuments("ActiveEffect", [source], { keepId: true });
    }
    if (existing?.origin !== state.spellUuid || existing.flags?.[NS]?.dreamTheatre?.ticket !== receipt.id
      || existing.flags[NS].dreamTheatre.cast !== record.cast || existing.flags[NS].dreamTheatre.actorUuid !== member.uuid) return refused("effectMismatch");
    row.status = "complete";
    await write(receipt, { ...state, record, cardId: card.id, status: "applying" });
  }
  await write(receipt, { ...state, record, cardId: card.id, status: "complete" });
  return { ok: true, complete: true };
}

function members(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt), now = game.time.worldTime;
  if (!state || state.status !== "complete" || !activeDreamMembers(state.record, now).length) return refused("ticket");
  const options = state.rows.filter(row => row.status === "complete" && activeDreamMembers(state.record, now).includes(row.actorUuid))
    .map(row => resolve(row.actorUuid)).filter(member => member && (user.isGM || member.testUserPermission(user, "OWNER"))
      && dreamEffectActive(member.effects.get(state.rows.find(row => row.actorUuid === member.uuid)?.effectId), member.uuid, now))
    .map(member => ({ value: member.uuid, label: member.name }));
  return { ok: true, options };
}

async function contribute(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt), now = game.time.worldTime;
  if (!state || state.status !== "complete" || !ref(data.contributionId)) return refused("ticket");
  const prior = state.contributions.find(row => row.id === data.contributionId);
  if (prior && (!resolve(prior.value.actorUuid)
    || !user.isGM && !resolve(prior.value.actorUuid).testUserPermission(user, "OWNER"))) return refused("member");
  if (prior?.status === "complete") return { ok: true, messageId: prior.messageId };
  const member = resolve(data.memberUuid), row = state.rows.find(row => row.actorUuid === member?.uuid);
  if (!member || !row || !user.isGM && !member.testUserPermission(user, "OWNER")
    || !dreamEffectActive(member.effects.get(row.effectId), member.uuid, now)) return refused("member");
  const chosen = prior ? { ok: true, value: prior.value } : dreamContribution(state.record,
    { actorUuid: member.uuid, kind: data.kind, text: data.text }, now);
  if (!chosen.ok) return chosen;
  const entry = prior ?? { id: data.contributionId, messageId: foundry.utils.randomID(), value: chosen.value, status: "writing" };
  if (!prior) await write(receipt, { ...state, contributions: [...state.contributions, entry] });
  if (!game.messages.get(entry.messageId)) await ChatMessage.create({ _id: entry.messageId,
    whisper: participantUsers(state), speaker: ChatMessage.getSpeaker({ actor: member }),
    content: textContent(`${member.name}: ${chosen.value.label} — ${chosen.value.text}`),
    flags: { [NS]: { dreamContribution: { ticket: receipt.id, contributionId: entry.id, uncertain: true } } }
  }, { keepId: true });
  const contributions = state.contributions.map(row => row.id === entry.id ? { ...row, status: "complete" } : row);
  if (!prior) contributions.push({ ...entry, status: "complete" });
  await write(receipt, { ...state, contributions });
  return { ok: true, messageId: entry.messageId };
}

async function leave(data, user) {
  const receipt = game.messages.get(data.ticket), state = stateOf(receipt);
  if (!state || state.status !== "complete" || !["woke", "left", "damage"].includes(data.reason)) return refused("ticket");
  const member = resolve(data.memberUuid), row = state.rows.find(row => row.actorUuid === member?.uuid);
  if (!member || !row || !user.isGM && !member.testUserPermission(user, "OWNER")) return refused("member");
  const currentHealth = member.system?.health?.value, currentTemp = member.system?.health?.temp ?? 0;
  if (data.reason === "damage" && (!Number.isSafeInteger(data.before) || !Number.isSafeInteger(data.after)
    || data.after >= data.before || !Number.isSafeInteger(currentHealth)
    || !Number.isSafeInteger(currentTemp) || currentTemp < 0
    || currentHealth + currentTemp !== data.after)) return refused("damage");
  if (row.status === "left") return { ok: true, already: true };
  const advanced = leaveDream(state.record, { actorUuid: member.uuid, reason: data.reason, now: game.time.worldTime });
  if (!advanced.ok && row.status !== "leaving") return advanced;
  if (row.status !== "leaving") {
    row.status = "leaving";
    await write(receipt, { ...state, rows: state.rows, leavingState: advanced.value });
  }
  if (member.effects.get(row.effectId)) await member.deleteEmbeddedDocuments("ActiveEffect", [row.effectId]);
  row.status = "left";
  const record = state.leavingState ?? advanced.value;
  await write(receipt, { ...state, rows: state.rows, record, leavingState: null });
  return { ok: true, left: true, ended: record.status === "ended" };
}

export function registerDreamCardHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message.flags?.[NS];
    if (!flags?.dreamTicket || flags.identifier !== DREAM_THEATRE.identifier || flags.success !== true) return;
    const mount = html.querySelector(".azeroth-card") ?? html.querySelector(".message-content") ?? html;
    const addButton = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { const result = await action(); if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(words("Unavailable")); }
        finally { button.disabled = false; }
      });
      mount.append(button);
    };
    if (game.user.isGM || message.author?.id === game.user.id) addButton(words("Resolve"), () => finishDreamCast(flags.dreamTicket, message.id));
    addButton(words("Contribute"), () => contributeDream(flags.dreamTicket));
    addButton(words("Leave"), () => leaveDreamChannel(flags.dreamTicket));
  });
}
