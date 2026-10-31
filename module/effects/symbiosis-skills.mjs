import { bondPartners, symbiosisSkillBoon } from "../rules/symbiosis.mjs";
import { symbiosisBonds } from "./symbiosis.mjs";
import { feetApart } from "../canvas/footprints.mjs";

function rankOf(actor, skill) {
  if (actor?.type === "npc") {
    const value = actor.system?.skills?.[skill];
    return typeof value === "number" ? value : (value?.rank ?? 0);
  }
  const value = actor?.getFlag?.("azeroth-rpg", "skillRanks")?.[skill];
  return value == null ? 0 : Number(value);
}

/** Read eligible partners at this Test's exact source token, without writes.
 * Each distinct partner is returned once, even if both Druids named each other.
 * An ambiguous partner token is unmeasured rather than selected arbitrarily.
 */
export function symbiosisSkillPartners(actor, { kind, skill, source } = {}, {
  bonds = symbiosisBonds, scenes = globalThis.game?.scenes,
  resolve = uuid => globalThis.fromUuidSync?.(uuid), measure = feetApart
} = {}) {
  if (kind !== "skill" || !skill || !source?.sceneId || !source?.tokenId) return [];
  const scene = scenes?.get(source.sceneId);
  const token = scene?.tokens?.get(source.tokenId);
  if (!token?.actor || token.actor.uuid !== actor?.uuid) return [];
  const out = [];
  for (const { uuid } of bondPartners(actor.uuid, bonds())) {
    let partner;
    try { partner = resolve(uuid); } catch { continue; }
    if (partner?.documentName !== "Actor" || partner.uuid !== uuid) continue;
    const tokens = [...(scene.tokens ?? [])].filter(t => t.actor?.uuid === uuid);
    if (tokens.length !== 1) continue;
    let distance;
    try { distance = measure(token, tokens[0]); } catch { continue; }
    if (symbiosisSkillBoon({ kind, rank: rankOf(actor, skill), partnerRank: rankOf(partner, skill), distance })) {
      out.push({ uuid, name: partner.name });
    }
  }
  return out;
}
