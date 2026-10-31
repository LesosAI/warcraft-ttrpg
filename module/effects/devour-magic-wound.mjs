/** Capture at the damage write, not in the later successful-hit callbacks. */
import { devourMagicPlan } from "../rules/devour-magic.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
export const DEVOUR_MAGIC_WOUNDS = "devourMagicWounds";
const pending = new Set();
const captures = new WeakMap();
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const actorAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
  : !row?.sceneId && !row?.tokenId ? resolve(row?.actorUuid) : null;
const health = actor => Number(actor.system?.health?.value) + Math.max(0, Number(actor.system?.health?.temp ?? 0));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Called immediately before adjustHealth by the authorized damage writer.
 * Only the original attack currently being applied can establish a wound.
 * Legacy cards without delivery state remain unknown, not fresh attacks.
 */
export function captureDevourMagicWound({ target, attacker, messageId } = {}) {
  if (!gmHere() || attacker?.type !== "npc" || !target?.uuid || !attacker?.uuid) return null;
  const message = game.messages?.get(messageId);
  const f = flagsOf(message);
  if (!Array.isArray(f.targets)) return null;
  const index = f.targets?.findIndex(row => actorAt(row) === target) ?? -1;
  const attack = attacker.system?.attacks?.[f.strike?.row?.index];
  if (index < 0 || f.strike?.row?.name !== "Bite" || attack?.name !== "Bite"
    || !attack.traits?.includes("Devour Magic")
    || !attacker.system?.creatureAbilities?.some(ability => ability.name === "Devour Magic")) return null;
  const original = JSON.stringify({ source: f.source, target: f.targets[index], strike: f.strike,
    hit: f.damageByTarget?.[index], attack });
  const valid = () => {
    const now = flagsOf(message), hit = now.damageByTarget?.[index];
    const source = now.source ? actorAt(now.source) : ChatMessage.getSpeakerActor(message.speaker);
    const delivery = now.attackResolution?.targets?.[index];
    return gmHere() && resolve(message.uuid) === message && resolve(target.uuid) === target
      && resolve(attacker.uuid) === attacker && source === attacker && actorAt(now.targets?.[index]) === target
      && attacker.testUserPermission(message.author, "OWNER") && now.kind === "attack"
      && !now.parry && !now.notAttack && !now.retaliation && now.strike?.rangeKind === "melee"
      && message.rolls?.[0]?.outcome?.success === true && hit?.hit === true && hit.withdrawn !== true
      && now.attackResolution?.version === 1 && delivery?.targetUuid === target.uuid && delivery.stage === "applying"
      && original === JSON.stringify({ source: now.source, target: now.targets[index], strike: now.strike,
        hit, attack: attacker.system?.attacks?.[now.strike?.row?.index] });
  };
  const before = health(target);
  if (!valid() || !Number.isFinite(before) || before < 0
    || !Number.isSafeInteger(game.time?.worldTime) || game.time.worldTime < 0) return null;
  const timing = structuredClone(untilEndOfNextTurnOrRound(target));
  const capture = {};
  captures.set(capture, { message, target, attacker, index, before, valid, timing });
  return capture;
}

/** Save evidence once, without draining resources or choosing an effect.
 * Temporary Health is included as damage, matching the shared damage door.
 * The opaque capture is local to that door and is consumed even on failure.
 */
export async function recordDevourMagicWound(capture, maximumDamage) {
  const held = capture && captures.get(capture);
  if (!held) return { ok: false, reason: "missingCapture" };
  captures.delete(capture);
  const { message, target, attacker, index, before, valid, timing } = held;
  if (!Number.isFinite(maximumDamage) || maximumDamage < 0 || !valid()) return { ok: false, reason: "changed" };
  const damageApplied = Math.max(0, Math.min(maximumDamage, before - health(target)));
  if (!Number.isFinite(damageApplied)) return { ok: false, reason: "invalidHealth" };
  if (damageApplied === 0) return { ok: true, wounded: false };
  if (pending.has(message.uuid)) return { ok: false, reason: "pending" };
  pending.add(message.uuid);
  try {
    const rows = message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS) ?? [];
    if (!Array.isArray(rows)) return { ok: false, reason: "invalidRecord" };
    if (rows.some(row => row?.targetUuid === target.uuid)) return { ok: false, reason: "recorded" };
    const pools = target.poolSnapshot();
    if (devourMagicPlan({ wounded: true, pools }).reason === "invalidPools") return { ok: false, reason: "invalidPools" };
    const receipt = { version: 1, stage: "wounded", sourceUuid: attacker.uuid, targetUuid: target.uuid,
      index, damageApplied, pools: structuredClone(pools), timing };
    const next = [...rows, receipt];
    if (!valid()) return { ok: false, reason: "changed" };
    await message.setFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS, next);
    if (!valid() || !same(message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS), next)) {
      return { ok: false, reason: "writeUnconfirmed" };
    }
    return { ok: true, wounded: true, receipt };
  } catch { return { ok: false, reason: "writeUncertain" }; }
  finally { pending.delete(message.uuid); }
}
