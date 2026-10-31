import { bansheeCurseEffect, bansheeCurseRefresh, BANSHEE_CURSE_FLAG } from "../rules/banshee-roles.mjs";
import { projectionPhaseFor } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

const queues = new Map();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** GM-only effect write, after the ability adapter has paid and resolved the
 * target's resistance. Serialize by victim so two casters refresh one curse.
 * No automatic replay after an uncertain write: the caller reports it.
 */
export async function applyBansheeCurse({ victim, source, valid = () => true } = {}) {
  if (!writer() || victim?.documentName !== "Actor" || source?.documentName !== "Actor"
    || !victim.uuid || !source.uuid) return { ok: false, reason: "authority" };
  const previous = queues.get(victim.uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (!writer() || !valid()) return { ok: false, reason: "changed" };
    if (projectionPhaseFor(victim) || realmRefusalFor(victim, "ability")) return { ok: false, reason: "protected" };
    const data = bansheeCurseEffect({ sourceUuid: source.uuid, time: game.time?.worldTime });
    if (!data) return { ok: false, reason: "clock" };
    const plan = bansheeCurseRefresh([...(victim.effects ?? [])]);
    try {
      const written = plan.update
        ? await victim.updateEmbeddedDocuments("ActiveEffect", [{ _id: plan.update, ...data }])
        : await victim.createEmbeddedDocuments("ActiveEffect", [data]);
      const held = written?.find(effect => effect.flags?.["azeroth-rpg"]?.[BANSHEE_CURSE_FLAG]?.sourceUuid === source.uuid
        && effect.start?.time === data.start.time && effect.disabled !== true);
      if (!held) return { ok: false, reason: "refused" };
      // Only remove duplicates after a confirmed retained carrier exists.
      if (plan.remove.length) await victim.deleteEmbeddedDocuments("ActiveEffect", plan.remove);
      return { ok: true, effectId: held.id, refreshed: plan.update !== null };
    } catch (error) {
      console.warn("azeroth-rpg | Banshee Curse effect write", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(victim.uuid, task);
  try { return await task; }
  finally { if (queues.get(victim.uuid) === task) queues.delete(victim.uuid); }
}
