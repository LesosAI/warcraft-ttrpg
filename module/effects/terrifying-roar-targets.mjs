import { TERRIFYING_ROAR as SPEC } from "../rules/king-mosh.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

/** The authorized caller has reviewed the whole area and hearing, claimed the
 * use and paid. Checkpoint before every Test/effect; never reroll uncertainty. */
export async function resolveTerrifyingRoar({ actor, targets, valid, checkpoint } = {}) {
  const results = [];
  const stop = reason => ({ ok: false, reason, results });
  if (!actor?.uuid || !Array.isArray(targets) || !targets.length
    || targets.some(token => !token?.actor?.uuid || token.actor.uuid === actor.uuid)
    || new Set(targets.map(token => token.actor.uuid)).size !== targets.length
    || [valid, checkpoint].some(fn => typeof fn !== "function")) return stop("invalid");
  const { rollResilience } = await import("../dice/workflows.mjs");
  const actors = new Map(targets.map(token => [token, token.actor]));
  const unchanged = async token => await valid() && token.actor === actors.get(token);
  const save = async (token, progress) => await unchanged(token)
    && await checkpoint({ results: structuredClone(results), ...progress }) && await unchanged(token);
  for (const [index, token] of targets.entries()) {
    if (!await unchanged(token)) return stop("changed");
    const victim = token.actor;
    const row = { index, actorUuid: victim.uuid, tokenId: token.id, testId: null, outcome: null };
    results.push(row);
    const skip = () => !(victim.system?.health?.value > 0) ? "fallen"
      : victim.statuses?.has("deafened") ? "deafened"
      : (victim.system?.conditionImmunities ?? []).includes(SPEC.condition) ? "immune" : null;
    row.outcome = skip();
    if (row.outcome) {
      if (!await save(token, { stage: "resolved", index })) return stop("checkpoint");
      continue;
    }
    if (!await save(token, { stage: "resisting", index })) return stop("checkpoint");
    const card = await rollResilience({ actor: victim, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
    const passed = card?.rolls?.[0]?.outcome?.success;
    if (!card?.id || typeof passed !== "boolean") return stop("testUnresolved");
    row.testId = card.id; row.outcome = passed ? "resisted" : null;
    if (!await save(token, { stage: "resisted", index, passed })) return stop("checkpoint");
    row.outcome ??= skip();
    if (!row.outcome) {
      if (!await save(token, { stage: "inflicting", index })) return stop("checkpoint");
      row.outcome = skip();
      if (!row.outcome) {
        const result = await inflictCondition({ victim, by: actor, id: SPEC.condition, name: token.name,
          until: untilEndOfNextTurnOrRound(victim) });
        row.outcome = result?.landed === true ? "frightened" : result?.reason === "immune" ? "immune" : "uncertain";
      }
      if (row.outcome === "uncertain") return stop("effectUnresolved");
    }
    if (!await save(token, { stage: "resolved", index })) return stop("checkpoint");
  }
  return { ok: true, results };
}
