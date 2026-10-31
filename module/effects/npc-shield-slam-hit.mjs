import { shieldSlamStunTest } from "../rules/npc-shield-slam.mjs";

/** Resolve before publishing the attack card, so a reaction cannot run before
 * its condition landing has been recorded. Caller adds landing to landedOnHit.
 * No damage write occurs here; armor never gates this on-hit resistance.
 */
export async function resolveShieldSlamHit({ victim, by, outcome, roll, inflict, until } = {}) {
  const spec = shieldSlamStunTest(outcome);
  if (!spec || !victim || !by) return { reason: "notHit" };
  const card = await roll({ actor: victim, resilience: spec.resilience, dc: spec.dc, subtitle: "Shield Slam" });
  const resisted = card?.rolls?.[0]?.outcome?.success;
  if (!card?.id || typeof resisted !== "boolean") return { reason: "unresolved", testId: card?.id ?? null };
  if (resisted) return { testId: card.id, resisted: true };
  const landing = await inflict({ victim, by, id: spec.onFail.condition, name: victim.name, until: until(victim) });
  return { testId: card.id, resisted: false, landing };
}
