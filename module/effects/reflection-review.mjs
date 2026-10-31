/** Pre-payment GM review of spell intent against Reflection Field.
 * Read-only: no payment, reroll, effect creation or damage application here.
 * The casting workflow consumes this review before spending resources.
 */
import { areaFor } from "../rules/areas.mjs";
import { reflectionTargetKey } from "../rules/reflection.mjs";
import { reflectionOn } from "./reflection.mjs";

export const REFLECTION_REVIEW_QUERY = "azeroth-rpg.reviewReflection";
const tokenAt = ref => game.scenes?.get(ref?.sceneId)?.tokens.get(ref?.tokenId) ?? null;

export async function prepareReflection({ actor, spell, source, targets = [] } = {}) {
  if (areaFor(spell.system?.target ?? "") || !targets.some(t => reflectionOn(tokenAt(t)?.actor, spell.system?.school))) {
    return { ok: true, fields: {}, harmful: {}, caster: null };
  }
  const request = { actorUuid: actor.uuid, spellUuid: spell.uuid, source,
    targets: targets.map(t => ({ sceneId: t.sceneId, tokenId: t.tokenId })) };
  if (game.user?.isGM) return reflectionReviewHandler(request, { user: game.user });
  const gm = game.users?.activeGM;
  if (!gm) return { ok: false, reason: "noGM" };
  return gm.query(REFLECTION_REVIEW_QUERY, request, { timeout: 180000 });
}

export async function reflectionReviewHandler({ actorUuid, spellUuid, source, targets = [] } = {}, { user = null } = {}) {
  if (!game.user?.isGM) throw new Error("Reflection review must run on the GM's client.");
  const actor = await fromUuid(actorUuid), spell = await fromUuid(spellUuid);
  if (actor?.documentName !== "Actor" || !user || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this caster.");
  if (spell?.documentName !== "Item" || spell.type !== "spell") throw new Error("The spell is no longer available.");
  if (areaFor(spell.system?.target ?? "")) return { ok: true, fields: {}, harmful: {}, caster: null };
  const sourceToken = tokenAt(source);
  if (sourceToken?.actor?.uuid !== actor.uuid) return { ok: false, reason: "source" };
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const fields = {}, harmful = {};
  const seen = new Set();
  const reviewed = [];
  for (const ref of targets) {
    const key = reflectionTargetKey(ref);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const token = tokenAt(ref);
    if (!token?.actor) return { ok: false, reason: "target" };
    reviewed.push({ ref, key, token, actor: token.actor });
    if (token.actor.uuid === actor.uuid) continue;
    const field = reflectionOn(token.actor, spell.system?.school);
    if (!field) continue;
    const answer = await chooseOption(spell, [
      { key: "review", name: "Cancel this cast for now", description: "Spend nothing and resolve any uncertainty." },
      { key: "harmful", name: "Harmful to this target", description: "Reflection Field returns this target's spell effect toward the caster." },
      { key: "beneficial", name: "Beneficial or harmless to this target", description: "Reflection Field does not redirect this target." }
    ], null, { prompt: `GM: How does ${spell.name} affect ${token.name}?` });
    if (!answer || !["harmful", "beneficial"].includes(answer.key)) return { ok: false, reason: "cancelled" };
    // Intent belongs to this cast/target, while the field is read again after review.
    harmful[key] = answer.key === "harmful";
    const current = tokenAt(ref);
    if (current !== token) return { ok: false, reason: "target" };
  }
  // Later choices can remain open while earlier recipients change. Refresh all
  // fields together, retaining intent only for the exact actor that was asked.
  for (const row of reviewed) {
    const current = tokenAt(row.ref);
    if (current !== row.token || current.actor !== row.actor) return { ok: false, reason: "target" };
    if (row.actor.uuid === actor.uuid) continue;
    const standing = reflectionOn(row.actor, spell.system?.school);
    if (!standing) continue;
    if (!Object.hasOwn(harmful, row.key)) return { ok: false, reason: "target" };
    fields[row.key] = standing;
  }
  if (tokenAt(source) !== sourceToken || sourceToken.actor.uuid !== actor.uuid) return { ok: false, reason: "source" };
  const caster = targetSnapshots([sourceToken.object ?? sourceToken])[0] ?? null;
  if (!caster) return { ok: false, reason: "source" };
  return { ok: true, fields, harmful, caster };
}
