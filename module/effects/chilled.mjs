import { chilledEffect, CHILLED_FLAG } from "../rules/chilled.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

const busy = new Set();
const marker = effect => effect.flags?.["azeroth-rpg"]?.[CHILLED_FLAG];

/** Internal application adapter. The owning use controller must save its durable
 * application claim before calling, and must not retry an uncertain write.
 * valid synchronously rechecks that claim, source/target identity and geometry.
 * This adapter neither authorizes a player request nor pays an ability cost. */
export async function layChilled({ victim, by, messageUuid, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && Boolean(victim?.uuid && by?.uuid) && typeof valid === "function" && valid() === true;
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let written = null;
  try {
    const held = [...(victim.effects ?? [])].filter(effect => marker(effect)?.version === 1);
    // Do not silently remove a conflicting effect: leave reconciliation to the GM.
    if (held.length > 1) return { ok: false, reason: "conflict" };
    if (held[0] && marker(held[0]).messageUuid === messageUuid) {
      return { ok: true, effectId: held[0].id, duplicate: true };
    }
    const data = chilledEffect({ sourceUuid: by.uuid, targetUuid: victim.uuid, messageUuid,
      timing: untilEndOfNextTurnOrRound(victim),
      slowedImmune: (victim.system?.conditionImmunities ?? []).includes("slowed") });
    if (!data) return { ok: false, reason: "timing" };
    // Foundry merges updates: reset old combat coordinates when a refreshed
    // effect switches to the world clock, and clear core's expired marker.
    data.duration.expired = false;
    if (data.duration.units === "seconds") {
      data.duration.expiry = null;
      data.start = { combat: null, combatant: null, initiative: 0, round: 0, turn: 0, ...data.start };
    }
    if (!permitted()) return { ok: false, reason: "changed" };
    if (held[0]) {
      written = held[0];
      await written.update(data);
    } else [written] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!written?.id) return { ok: false, reason: "writeUncertain" };
    if (!permitted()) return { ok: false, reason: "changedAfterWrite", effectId: written.id };
    return { ok: true, effectId: written.id, refreshed: Boolean(held[0]) };
  } catch {
    return { ok: false, reason: "writeUncertain", effectId: written?.id ?? null };
  } finally { busy.delete(victim.uuid); }
}
