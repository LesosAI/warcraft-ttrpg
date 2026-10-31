/** Create a channel only after the caller has paid and resolved resistance. */
import { MIND_FLAY_FLAG, mindFlayLink, mindFlaySustain, mindFlayEffect, mindFlayHeld, mindFlayEligible } from "../rules/qiraji-mind-flay.mjs";
import { mindFlayMutations, mindFlayChannelLive, reconcileMindFlay } from "./qiraji-mind-flay-lifecycle.mjs";
import { MIND_FLAY_CLOCK, seedMindFlayClock } from "../rules/qiraji-mind-flay-clock.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const sustaining = actor => actor.flags?.["azeroth-rpg"]?.sustaining ?? [];
const carriers = actor => [...(actor.effects ?? [])].filter(e => e.flags?.["azeroth-rpg"]?.[MIND_FLAY_FLAG]);

export async function layQirajiMindFlay({ by, victim, sourceToken, targetToken, valid } = {}) {
  const scene = sourceToken?.parent;
  const allowed = () => gmHere() && present(by) && present(victim) && by !== victim
    && typeof valid === "function" && valid() && game.scenes?.get(scene?.id) === scene
    && scene?.tokens?.get(sourceToken?.id) === sourceToken && scene.tokens.get(targetToken?.id) === targetToken
    && sourceToken.actor === by && targetToken.actor === victim
    && mindFlayEligible({ health: victim.system?.health?.value, typeMarker: victim.system?.typeMarker });
  if (!allowed()) return { ok: false, reason: "authorityOrTarget" };
  if (pending.has(by.uuid) || pending.has(victim.uuid)) return { ok: false, reason: "busy" };
  if (!Array.isArray(sustaining(by)) || sustaining(by).length || carriers(victim).length) return { ok: false, reason: "alreadyChanneling" };
  const link = mindFlayLink({ sourceUuid: by.uuid, targetUuid: victim.uuid, sceneId: scene.id,
    sourceTokenId: sourceToken.id, targetTokenId: targetToken.id, cast: foundry.utils.randomID() });
  if (!link) return { ok: false, reason: "identity" };
  const fight = (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(victim)?.length);
  const clock = seedMindFlayClock({ cast: link.cast, ...(fight
    ? { combatUuid: fight.uuid, turn: { round: fight.round, turn: fight.turn } }
    : { time: game.time?.worldTime }) });
  if (!clock) return { ok: false, reason: "clock" };
  const entry = mindFlaySustain(link);
  pending.add(by.uuid); pending.add(victim.uuid); mindFlayMutations.add(link.cast);
  let effect, result = { ok: false, reason: "unconfirmed", cast: link.cast };
  try {
    await by.setFlag("azeroth-rpg", "sustaining", [entry]);
    if (!allowed() || !mindFlayHeld(link, sustaining(by)) || sustaining(by).length !== 1 || carriers(victim).length) {
      result.reason = "changed";
    } else {
      const data = mindFlayEffect(link, { fearImmune: (victim.system?.conditionImmunities ?? []).includes("frightened") });
      data.flags["azeroth-rpg"][MIND_FLAY_CLOCK] = clock;
      [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
      const held = effect && carriers(victim).includes(effect);
      if (held && allowed() && sustaining(by).length === 1 && mindFlayChannelLive(link, effect)
        && carriers(victim).length === 1) result = { ok: true, effectId: effect.id, cast: link.cast };
      else {
        result.reason = "changed";
        if (held && gmHere() && present(victim)) await victim.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      }
    }
  } catch (error) {
    console.warn("azeroth-rpg | Mind Flay creation", error);
    result = { ok: false, reason: "writeUncertain", cast: link.cast, effectId: effect?.id ?? null };
  } finally {
    mindFlayMutations.delete(link.cast);
    try { await reconcileMindFlay(); }
    catch (error) {
      console.warn("azeroth-rpg | Mind Flay creation cleanup", error);
      result = { ...result, ok: false, reason: "cleanupUncertain" };
    }
    pending.delete(by.uuid); pending.delete(victim.uuid);
  }
  if (result.ok && (!allowed() || !mindFlayChannelLive(link, effect))) return { ...result, ok: false, reason: "changed" };
  return result;
}
