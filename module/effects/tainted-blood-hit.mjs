import { TAINTED_BLOOD_AURA, taintedBloodCarrier } from "../rules/tainted-blood.mjs";
import { countsAsEnemy } from "../rules/distance.mjs";
import { standingOf, combatantIn } from "../canvas/engaged.mjs";
import { lightningShieldHitValid } from "./lightning-shield-hit.mjs";
import { applyTaintedBloodStack } from "./tainted-blood-carrier.mjs";
import { postTaintedBloodStack } from "./tainted-blood-feedback.mjs";

const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`) : null;
const actorAt = row => tokenAt(row)?.actor ?? (!row?.sceneId && !row?.tokenId ? resolve(row?.actorUuid) : null);
const effectsOf = actor => [...(actor.effects?.values?.() ?? actor.effects ?? [])];

/** The attack's original source and target determine hostility. One attack
 * against one defender is one hit, regardless of its damage components. */
export async function resolveTaintedBloodHit(message, index) {
  const flags = flagsOf(message);
  const attacker = flags.source ? actorAt(flags.source) : ChatMessage.getSpeakerActor(message?.speaker);
  const owner = actorAt(flags.targets?.[index]);
  const validHit = () => {
    if (!lightningShieldHitValid(message, index, attacker, owner)) return false;
    const source = tokenAt(flags.source), target = tokenAt(flags.targets?.[index]);
    const fight = owner.activeFight?.() ?? attacker.activeFight?.();
    return countsAsEnemy(
      standingOf(target ?? { actor: owner }, combatantIn(fight, owner, target), fight),
      standingOf(source ?? { actor: attacker }, combatantIn(fight, attacker, source), fight), { gm: true });
  };
  if (!validHit()) return { ok: false, reason: "hit" };
  const effect = taintedBloodCarrier(effectsOf(owner), owner.uuid, TAINTED_BLOOD_AURA, game.time?.worldTime);
  if (!effect) return { ok: false, reason: "absent" };
  const castId = effect.flags["azeroth-rpg"][TAINTED_BLOOD_AURA].castId;
  const valid = () => validHit()
    && taintedBloodCarrier(effectsOf(owner), owner.uuid, TAINTED_BLOOD_AURA, game.time?.worldTime) === effect
    && effect.flags["azeroth-rpg"][TAINTED_BLOOD_AURA].castId === castId;
  // Actor identity, rather than target-row index, prevents duplicate rows for
  // a linked defender from delivering the same hit twice.
  const result = await applyTaintedBloodStack({ owner: attacker, hitId: `${message.uuid}:${owner.uuid}`, valid });
  if (result.ok) {
    try {
      if (!await postTaintedBloodStack({ attacker, owner, message, index, result })) throw Error("Missing stack feedback");
    } catch {
      ui.notifications?.warn("Tainted Blood applied its stack, but feedback could not be confirmed. Do not repeat the hit to restore the message.");
    }
  }
  return result;
}
