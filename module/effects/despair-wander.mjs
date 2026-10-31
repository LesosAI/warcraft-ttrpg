/** Execute one persisted Despair walk through Foundry's ordinary movement door. */
import { ANCIENT_DESPAIR_FLAG } from "../rules/ancient-despair.mjs";
import { planDespairWalk } from "./despair-walk-plan.mjs";
import { withDespairWalk } from "./despair-walk-permission.mjs";
import { writeDespairWander } from "./despair-wander-write.mjs";

export async function wanderAncientDespair({ token, effect, clock, valid } = {}) {
  const actor = token?.actor, scene = token?.parent;
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && globalThis.canvas?.scene === scene && scene?.tokens?.get(token?.id) === token
    && token?.actor === actor && actor?.effects?.get(effect?.id) === effect
    && !effect.disabled && !effect.isSuppressed && effect.active !== false
    && typeof valid === "function" && valid();
  if (!permitted() || typeof clock !== "string" || !clock) return { ok: false, reason: "authority" };
  const state = effect.flags?.["azeroth-rpg"]?.[ANCIENT_DESPAIR_FLAG];
  if (state?.version !== 1 || state.wandered !== false) return { ok: false, reason: "unavailable" };
  const path = planDespairWalk(token, state.plan);
  if (!path.ok) return { ok: false, reason: path.reason };
  const initialPlan = JSON.stringify(state.plan);
  const read = () => {
    const current = effect.flags?.["azeroth-rpg"]?.[ANCIENT_DESPAIR_FLAG];
    return { active: permitted() && JSON.stringify(current?.plan) === initialPlan,
      version: current?.version, wandered: current?.wandered, effectUuid: effect.uuid,
      tokenUuid: token.uuid, sceneUuid: scene.uuid, clock,
      from: { x: token.x, y: token.y }, to: path.to };
  };
  return writeDespairWander({ key: effect.uuid, read,
    claim: async () => {
      if (!permitted()) throw new Error("Despair changed before its walk");
      const checked = planDespairWalk(token, state.plan);
      if (!checked.ok || JSON.stringify(checked.to) !== JSON.stringify(path.to)) throw new Error("Despair path changed");
      await effect.update({ [`flags.azeroth-rpg.${ANCIENT_DESPAIR_FLAG}.wandered`]: true });
    },
    move: () => withDespairWalk({ token, to: path.to,
      valid: () => permitted() && effect.flags?.["azeroth-rpg"]?.[ANCIENT_DESPAIR_FLAG]?.wandered === true,
      run: () => token.move({ ...path.to, elevation: token.elevation, level: token.level, action: "walk" }) })
  });
}
