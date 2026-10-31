import { WALKING_BOMB_BLAST, walkingBombDamage } from "../rules/walking-bomb.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";

/** Called only after the coordinator has recorded this target as applying.
 * valid() checks current scene/card identities, authority and target geometry.
 */
export async function deliverWalkingBombDamage({ bomb, targetToken, valid, messageId } = {}) {
  if (typeof valid !== "function" || !valid() || !bomb || !targetToken?.actor) return { ok: false };
  const victim = targetToken.actor;
  const { rollResilience } = await import("../dice/workflows.mjs");
  if (!valid() || targetToken.actor !== victim) return { ok: false };
  const test = await rollResilience({ actor: victim, resilience: WALKING_BOMB_BLAST.resilience,
    dc: WALKING_BOMB_BLAST.dc, subtitle: WALKING_BOMB_BLAST.name });
  const resisted = test?.rolls?.[0]?.outcome?.success;
  if (!valid() || targetToken.actor !== victim || typeof resisted !== "boolean") return { ok: false };
  const snapshot = targetSnapshots([targetToken.object ?? targetToken])[0];
  if (!snapshot) return { ok: false };
  const result = walkingBombDamage({ target: snapshot, resisted, dealtHalved: dealtHalvedBy(bomb) });
  if (!result || !valid()) return { ok: false };
  if (!result.immune && result.damage > 0) {
    await victim.applyDamage(result.damage, { struck: true, attack: false, spell: false,
      location: "body", type: "physical", by: bomb, messageId });
    if (!valid() || targetToken.actor !== victim) return { ok: false };
  }
  return { ok: true, result: { testId: test?.uuid ?? test?.id ?? null, resisted,
    damage: result.damage, immune: result.immune === true } };
}
