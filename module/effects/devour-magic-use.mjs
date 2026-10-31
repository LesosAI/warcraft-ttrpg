import { devourMagicPlan, devourMagicEffect } from "../rules/devour-magic.mjs";
import { castingDC } from "../rules/casting.mjs";
import { archmageCasters } from "./dispel.mjs";
import { DEVOUR_MAGIC_WOUNDS } from "./devour-magic-wound.mjs";
import { applyDevourMagicResource } from "./devour-magic-resource.mjs";
import { endDevourMagicEffect, devourMagicEffectSnapshot, devourMagicEffectsSnapshot } from "./devour-magic-effect.mjs";
import { PROMPT_TEMPLATE } from "./prompts.mjs";
import { postDevourMagicFeedback } from "./devour-magic-feedback.mjs";

export const DEVOUR_MAGIC_QUERY = "azeroth-rpg.devourMagic";
const busy = new Set();
const local = key => game.i18n.localize(`AZEROTH.DevourMagic.${key}`);
const flags = doc => doc?.flags?.["azeroth-rpg"] ?? {};
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const actorAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
  : !row?.sceneId && !row?.tokenId ? resolve(row?.actorUuid) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function subject(prompt) {
  const p = flags(prompt);
  if (resolve(prompt?.uuid) !== prompt || prompt?.author?.isGM !== true || p.kind !== "prompt"
    || p.purpose !== "devourMagic" || !p.devourMagic?.messageUuid) return null;
  const message = resolve(p.devourMagic.messageUuid), target = resolve(p.actorUuid);
  const f = flags(message), rows = f[DEVOUR_MAGIC_WOUNDS];
  if (!target || !Array.isArray(rows)) return null;
  const matches = rows.filter(row => row.targetUuid === target.uuid), wound = matches[0];
  const source = resolve(wound?.sourceUuid);
  if (matches.length !== 1 || wound?.version !== 1 || !(wound.damageApplied > 0) || !source
    || f.kind !== "attack" || actorAt(f.targets?.[wound.index]) !== target
    || (f.source ? actorAt(f.source) : ChatMessage.getSpeakerActor(message.speaker)) !== source
    || f.attackResolution?.targets?.[wound.index]?.targetUuid !== target.uuid
    || f.attackResolution.targets[wound.index].stage !== "applied") return null;
  return { message, target, source, wound };
}

/** Called once after the wound receipt is confirmed. Preserve the attack's
 * audience; a blind attack never leaks its target into a public prompt. */
export async function postDevourMagicPrompt({ message, target }) {
  if (!gmHere() || resolve(message?.uuid) !== message || resolve(target?.uuid) !== target) return null;
  if (!flags(message)[DEVOUR_MAGIC_WOUNDS]?.some(row => row.targetUuid === target.uuid && row.stage === "wounded")) return null;
  const existing = [...game.messages.values()].find(card => flags(card).purpose === "devourMagic"
    && flags(card).actorUuid === target.uuid && flags(card).devourMagic?.messageUuid === message.uuid);
  if (existing) return existing;
  const content = await foundry.applications.handlebars.renderTemplate(PROMPT_TEMPLATE, {
    cardClass: "azeroth-card-attack", title: local("Name"), name: target.name, text: local("Prompt"),
    actorUuid: target.uuid, purpose: "devourMagic", noTest: true, ownerSees: true, devourMagic: true
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content,
    whisper: [...(message.whisper ?? [])], blind: message.blind === true,
    flags: { "azeroth-rpg": { kind: "prompt", purpose: "devourMagic", actorUuid: target.uuid,
      devourMagic: { messageUuid: message.uuid } } } });
}

/** The victim owns the choice; the GM reviews magic classification and writes. */
export async function chooseDevourMagic(prompt) {
  const s = subject(prompt);
  if (!s || !s.target.isOwner || !["wounded", "effectPending"].includes(s.wound.stage)) return null;
  const { chooseOption } = await import("../dice/workflows.mjs");
  const menu = { id: `${s.target.id}-devour`, name: local("Name") };
  let poolId;
  let plan = s.wound.stage === "effectPending" ? s.wound.plan : devourMagicPlan({ wounded: true, pools: s.wound.pools });
  if (plan?.reason === "choosePowerPool") {
    const pools = s.wound.pools.filter(pool => pool.kind === "power" && pool.value > 0);
    const options = pools.map((pool, index) => ({ key: String(index), name: s.target.items?.get(pool.itemId)?.name ?? pool.name ?? local("Power"),
      description: game.i18n.format("AZEROTH.DevourMagic.Pool", { value: pool.value }) }));
    const chosen = await chooseOption(menu, options, null, { prompt: local("ChoosePool") });
    const index = options.findIndex(option => option.key === chosen?.key);
    if (index < 0) return null;
    poolId = pools[index].itemId;
    plan = devourMagicPlan({ wounded: true, pools: s.wound.pools, poolId });
  }
  if (plan?.kind !== "drain" && plan?.kind !== "silence") return null;
  let effectId = null;
  if (plan.kind === "drain") {
    const options = [{ key: "none", name: local("None"), description: local("GMReviews") }];
    for (const effect of s.target.effects.values()) {
      const snapshot = devourMagicEffectSnapshot(effect);
      if (devourMagicEffect(snapshot, { magical: true, temporary: true, archmage: archmageCasters([snapshot]) }).ok) {
        options.push({ key: effect.id, name: effect.name, description: local("ChooseTemporaryMagic") });
      }
    }
    const chosen = await chooseOption(menu, options, null, { prompt: local("ChooseEffect") });
    if (!chosen || !options.some(option => option.key === chosen.key)) return null;
    effectId = chosen.key === "none" ? null : chosen.key;
  }
  if (subject(prompt)?.wound !== s.wound) return null;
  const payload = { promptId: prompt.id, poolId, effectId };
  let result;
  try {
    result = gmHere() ? await devourMagicQueryHandler(payload, { user: game.user })
      : await game.users.activeGM?.query(DEVOUR_MAGIC_QUERY, payload, { timeout: 120000 });
  } catch { result = { ok: false, reason: "queryUncertain" }; }
  if (!result?.ok) ui.notifications?.warn(local("Unconfirmed"));
  else if (result.feedbackError) ui.notifications?.warn(local("FeedbackFailed"));
  else ui.notifications?.info(local("Resolved"));
  return result;
}

export async function devourMagicQueryHandler({ promptId, poolId, effectId = null } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !user) return refuse("authority");
  const prompt = game.messages.get(promptId), s = subject(prompt);
  if (!s || !s.target.testUserPermission(user, "OWNER") || !["wounded", "effectPending"].includes(s.wound.stage)) return refuse("woundOrOwner");
  if (effectId !== null && (typeof effectId !== "string" || !effectId)) return refuse("effectId");
  const key = `${s.message.uuid}:${s.target.uuid}`;
  if (busy.has(key)) return refuse("busy");
  busy.add(key);
  try {
    const valid = () => {
      const current = subject(prompt);
      return gmHere() && current?.target === s.target && current.source === s.source && current.message === s.message
        && s.target.testUserPermission(user, "OWNER");
    };
    const plan = s.wound.stage === "effectPending" ? s.wound.plan
      : devourMagicPlan({ wounded: true, pools: s.wound.pools, poolId });
    if (plan.kind !== "drain" && plan.kind !== "silence") return refuse(plan.reason ?? "plan");
    const { chooseOption, gateCastingTest } = await import("../dice/workflows.mjs");
    let review;
    if (plan.kind === "drain") {
      const effect = effectId === null ? null : s.target.effects.get(effectId);
      if (effectId !== null && !effect) return refuse("missingEffect");
      const snapshots = devourMagicEffectsSnapshot(s.target);
      const snapshot = effect ? devourMagicEffectSnapshot(effect) : null;
      if (effect && !devourMagicEffect(snapshot, { magical: true, temporary: true, archmage: archmageCasters([snapshot]) }).ok) return refuse("protectedEffect");
      const choice = await chooseOption({ id: "devour-review", name: local("Name") }, [
        { key: "yes", name: local("Confirm"), description: effect ? effect.name : local("None") },
        { key: "no", name: local("Decline"), description: local("ChooseAgain") }
      ], null, { prompt: effect ? game.i18n.format("AZEROTH.DevourMagic.ReviewEffect", { name: effect.name, target: s.target.name })
        : game.i18n.format("AZEROTH.DevourMagic.ReviewNone", { target: s.target.name,
          effects: snapshots.map(row => row.name).join(", ") || local("None") }) });
      if (choice?.key !== "yes") return refuse("reviewDeclined");
      if (!valid() || !same(devourMagicEffectsSnapshot(s.target), snapshots)) return refuse("changedEffects");
      review = effect ? { effectId, snapshot, magical: true, temporary: true } : { empty: true, snapshots };
    }
    if (!valid()) return refuse("changed");
    let result;
    if (s.wound.stage === "wounded") {
      const resource = await applyDevourMagicResource({ ...s, poolId, valid });
      if (!resource.ok) return resource;
      if (resource.kind === "silence") result = resource;
    }
    result ??= await endDevourMagicEffect({ ...s, review, valid, gateTest: () => gateCastingTest(s.source, {
      source: flags(s.message).source, dc: castingDC({ tier: s.source.system?.tier ?? 1, targetDefense: s.target.system?.defense ?? null })
    }) });
    if (result.ok) {
      try { if (!await postDevourMagicFeedback(s)) return { ...result, feedbackError: true }; }
      catch { return { ...result, feedbackError: true }; }
    }
    return result;
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(key); }
}
