import { TAINTED_BLOOD_AURA, taintedBloodCarrier } from "../rules/tainted-blood.mjs";
import { TAINTED_BLOOD_RECEIPTS } from "./tainted-blood-state.mjs";
import { TAINTED_BLOOD_HITS } from "./tainted-blood-carrier.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const busy = new Set();
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const canonical = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Feedback never pays, refreshes, or changes a penalty. Its receipt is the
 * authority; failure is informational and cannot authorize another use/hit. */
async function post({ actor, key, featureKey, content, source, targets = [], whisper = [], blind = false }) {
  const existing = values(game.messages).find(message => message.flags?.["azeroth-rpg"]?.taintedBloodFeedback === key);
  if (existing) return existing;
  if (busy.has(key)) return null;
  busy.add(key);
  try {
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper, blind,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: featureKey,
        casting: false, success: true, targets, taintedBloodFeedback: key } }
    });
  } finally { busy.delete(key); }
}

export async function postTaintedBloodActivation({ actor, requestId, effectId, source = null } = {}) {
  if (!gmHere() || !canonical(actor)) return null;
  const receipts = actor.getFlag("azeroth-rpg", TAINTED_BLOOD_RECEIPTS);
  const receipt = Array.isArray(receipts) ? receipts.find(row => row.requestId === requestId) : null;
  if (receipt?.stage !== "complete" || receipt.actionPaid !== true || receipt.usePaid !== true || receipt.effectId !== effectId) return null;
  const effect = taintedBloodCarrier(values(actor.effects), actor.uuid, TAINTED_BLOOD_AURA, game.time?.worldTime);
  if (effect?.id !== effectId || effect.flags["azeroth-rpg"][TAINTED_BLOOD_AURA].castId !== requestId) return null;
  return post({ actor, key: `activation:${actor.uuid}:${requestId}`, featureKey: "ability:tainted-blood", source,
    content: `<p><strong>Tainted Blood</strong></p><p>${escape(actor.name)} spent one Action and one Short Rest use. For 12 seconds, each enemy that hits it in melee gains one stack after the attack resolves.</p>` });
}

export async function postTaintedBloodStack({ attacker, owner, message, index, result } = {}) {
  if (!gmHere() || !canonical(attacker) || !canonical(owner) || fromUuidSync(message?.uuid) !== message || result?.ok !== true) return null;
  const hitId = `${message.uuid}:${owner.uuid}`;
  const receipts = attacker.getFlag("azeroth-rpg", TAINTED_BLOOD_HITS);
  const receipt = Array.isArray(receipts) ? receipts.find(row => row.hitId === hitId) : null;
  if (receipt?.stage !== "complete" || receipt.effectId !== result.effectId || receipt.record?.stacks !== result.stacks
    || receipt.record?.expiresAt !== result.expiresAt || !Number.isInteger(result.stacks) || result.stacks < 1 || result.stacks > 5) return null;
  const flags = message.flags?.["azeroth-rpg"] ?? {}, holder = flags.targets?.[index];
  const source = holder?.sceneId && holder?.tokenId ? { sceneId: holder.sceneId, tokenId: holder.tokenId } : null;
  const target = flags.source;
  return post({ actor: owner, key: `hit:${attacker.uuid}:${hitId}`, featureKey: "ability:tainted-blood-stack", source,
    targets: target?.sceneId && target?.tokenId ? [{ ...target, actorUuid: attacker.uuid, name: attacker.name }] : [],
    whisper: [...(message.whisper ?? [])], blind: message.blind === true,
    content: `<p><strong>Tainted Blood</strong></p><p>This hit left ${escape(attacker.name)} with ${result.stacks} stack${result.stacks === 1 ? "" : "s"}. Its melee attacks have ${result.stacks} less Damage Rating, to a minimum of 0. The penalty lasts 12 seconds from this application, even if the protection ends. Dispel removes all stacks.</p>` });
}
