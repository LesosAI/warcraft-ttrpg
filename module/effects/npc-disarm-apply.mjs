import { NPC_DISARM_FLAG, npcDisarmEffect } from "../rules/npc-disarm.mjs";
import { stonemaulGrip } from "../rules/stonemaul-grip.mjs";
const busy = new Set();
const sameWeapon = (a, b) => a?.kind === b?.kind && (a?.kind === "item" ? a.itemId === b.itemId
  : a?.kind === "npcRow" && a.index === b.index && a.name === b.name);

/** Called only after a confirmed, paid success. The caller owns request/hit
 * receipts and validates its explicitly selected held weapon in `valid`.
 * One carrier per selected weapon; repeated applications refresh six seconds.
 */
export async function layNpcDisarm({ victim, by, weapon, castId, valid } = {}) {
  const permitted = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.documentName === "Actor" && by?.documentName === "Actor"
    && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (stonemaulGrip(victim.takenTalents?.() ?? [])) return { ok: false, reason: "immune" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let effect;
  try {
    const data = npcDisarmEffect({ ownerUuid: victim.uuid, sourceUuid: by.uuid, weapon, castId, time: game.time?.worldTime });
    if (!data) return { ok: false, reason: "data" };
    const held = [...victim.effects].filter(row => row.origin === victim.uuid
      && row.flags?.["azeroth-rpg"]?.identifier === "npc-disarm"
      && sameWeapon(row.flags["azeroth-rpg"][NPC_DISARM_FLAG]?.weapon, data.flags["azeroth-rpg"][NPC_DISARM_FLAG].weapon));
    if (held.length > 1) return { ok: false, reason: "conflictingCarriers" };
    if (!permitted()) return { ok: false, reason: "changed" };
    if (stonemaulGrip(victim.takenTalents?.() ?? [])) return { ok: false, reason: "immune" };
    if (held.length) { effect = held[0]; await effect.update(data); }
    else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!permitted() || !effect?.id || ![...victim.effects].includes(effect) || effect.disabled === true
      || effect.flags?.["azeroth-rpg"]?.[NPC_DISARM_FLAG]?.castId !== castId)
      return { ok: false, reason: "writeUncertain", effectId: effect?.id };
    return { ok: true, effectId: effect.id, refreshed: held.length === 1 };
  } catch (error) {
    console.warn("azeroth-rpg | Disarm effect", error);
    return { ok: false, reason: "writeUncertain", effectId: effect?.id };
  } finally { busy.delete(victim.uuid); }
}
