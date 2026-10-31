import { DEVOUR_MAGIC_WOUNDS } from "./devour-magic-wound.mjs";
import { DEVOUR_MAGIC_BUSY } from "./devour-magic-resource.mjs";
const FLAG = "devourMagicFeedback";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const tokenAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`) : null;

/** Announce saved mechanics, not a client-supplied result. A durable posting
 * claim prevents a lost chat acknowledgement from replaying the success cue.
 */
export async function postDevourMagicFeedback({ message, target, source } = {}) {
  const allowed = () => gmHere() && [message, target, source].every(doc => doc?.uuid && resolve(doc.uuid) === doc);
  if (!allowed()) return null;
  const rows = message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS);
  const matches = Array.isArray(rows) ? rows.filter(row => row?.targetUuid === target.uuid) : [];
  const row = matches[0];
  if (matches.length !== 1 || row.version !== 1 || row.stage !== "resolved" || row.sourceUuid !== source.uuid) return null;
  let text, changed = false;
  const format = (key, data = {}) => game.i18n.format(`AZEROTH.DevourMagic.${key}`, { name: target.name, ...data });
  if (row.plan?.kind === "drain" && row.powerLost === 1) {
    if (row.effectOutcome === "removed" && row.ended?.length === 1 && row.ended[0].id === row.selectedEffectId) {
      text = format("ResultRemoved", { effect: row.ended[0].name });
    } else if (row.effectOutcome === "noneEligible") text = format("ResultNone");
    else if (row.effectOutcome === "gateFailed") text = format("ResultGate");
    else return null;
    changed = true;
  } else if (row.plan?.kind === "silence") {
    if (row.silenceImmune === true) text = format("ResultImmune");
    else if (typeof row.effectId === "string" && row.effectId) {
      text = format("ResultSilenced");
      const effect = target.effects?.get(row.effectId);
      changed = effect?.statuses?.has("silenced") === true && effect.active !== false && effect.disabled !== true
        && effect.isSuppressed !== true && effect.isExpired !== true
        && effect.flags?.["azeroth-rpg"]?.devourMagic?.messageUuid === message.uuid;
    } else return null;
  } else return null;
  const key = `${message.uuid}:${target.uuid}`;
  const prior = [...game.messages.values()].find(card => card.flags?.["azeroth-rpg"]?.devourMagicResult === key);
  if (prior) return prior;
  if (DEVOUR_MAGIC_BUSY.has(message.uuid)) return null;
  DEVOUR_MAGIC_BUSY.add(message.uuid);
  try {
    const claims = message.getFlag("azeroth-rpg", FLAG) ?? {};
    if (!claims || typeof claims !== "object" || Array.isArray(claims) || Object.hasOwn(claims, target.uuid)) return null;
    const original = structuredClone(row), next = { ...claims, [target.uuid]: { stage: "posting" } };
    await message.setFlag("azeroth-rpg", FLAG, next);
    if (!allowed() || !same(message.getFlag("azeroth-rpg", FLAG), next)
      || !same(message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS)?.find(entry => entry.targetUuid === target.uuid), original)) return null;
    const flags = message.flags?.["azeroth-rpg"] ?? {};
    const origin = tokenAt(flags.source), victim = tokenAt(flags.targets?.[row.index]);
    const anchored = origin?.actor === source && victim?.actor === target;
    const cue = changed && anchored;
    const cueSource = anchored ? { sceneId: origin.parent.id, tokenId: origin.id } : null;
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: source }),
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      content: `<p><strong>${foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.DevourMagic.Name"))}</strong></p><p>${foundry.utils.escapeHTML(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        featureKey: cue ? "ability:devour-magic-result" : null,
        source: cueSource ?? null,
        targets: [{ actorUuid: target.uuid, name: target.name,
          ...(anchored ? { sceneId: victim.parent.id, tokenId: victim.id } : {}) }],
        casting: false, success: changed, devourMagicResult: key } } });
  } finally { DEVOUR_MAGIC_BUSY.delete(message.uuid); }
}
