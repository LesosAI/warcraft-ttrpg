/** Store one bounded wandering plan. Refresh never rerolls or resets its claim. */
import { ANCIENT_DESPAIR_FLAG, DESPAIR_DIRECTIONS, despairWander, ancientDespairEffect } from "../rules/ancient-despair.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
const busy = new Set();

function savedPlan(state) {
  const plan = state?.plan;
  const index = DESPAIR_DIRECTIONS.indexOf(plan?.direction);
  if (state?.version !== 1 || typeof state.wandered !== "boolean" || index < 0
    || plan.bearing !== index * 45 || !Number.isFinite(plan.feet) || plan.feet < 0 || plan.feet > 10) return null;
  return { direction: plan.direction, bearing: plan.bearing, feet: plan.feet };
}

export async function layAncientDespair({ victim, by, valid, random = Math.random } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let effect;
  try {
    const held = [...(victim.effects ?? [])].filter(row => row.flags?.["azeroth-rpg"]?.[ANCIENT_DESPAIR_FLAG]);
    const states = held.map(row => row.flags["azeroth-rpg"][ANCIENT_DESPAIR_FLAG]);
    if (states.some(state => !savedPlan(state))) return { ok: false, reason: "state" };
    const plan = held.length ? savedPlan(states[0]) : despairWander({ draw: random(), speed: victim.system?.speed });
    const data = ancientDespairEffect({ origin: by.uuid, timing: untilEndOfNextTurnOrRound(victim) });
    if (!plan || !data) return { ok: false, reason: "planOrTiming" };
    const state = { version: 1, plan, wandered: states.some(row => row.wandered) };
    data.flags["azeroth-rpg"][ANCIENT_DESPAIR_FLAG] = state;
    if (!permitted()) return { ok: false, reason: "changed" };
    if (held.length) {
      effect = held[0];
      await effect.update(data);
      if (!permitted()) return { ok: false, reason: "changed", effectId: effect.id };
      if (held.length > 1) await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(row => row.id));
    } else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!effect || !permitted()) return { ok: false, reason: "changed", effectId: effect?.id ?? null };
    return { ok: true, effectId: effect.id, state };
  } catch { return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null }; }
  finally { busy.delete(victim.uuid); }
}
