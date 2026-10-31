import { demoralizingRoarEffect, DEMORALIZING_ROAR_FLAG as FLAG } from "../rules/demoralizing-roar.mjs";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.documentName === "Actor" && fromUuidSync(actor.uuid) === actor;
const markOf = effect => effect?.flags?.["azeroth-rpg"]?.[FLAG];

/** Apply only after the paid roar's failed resistance Test. All sources share
 * a target queue, so simultaneous roars refresh the same carrier. */
export async function applyDemoralizingRoar({ source, target, valid } = {}) {
  const key = target?.uuid;
  const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const current = () => gmHere() && present(source) && present(target)
      && target.system?.health?.value > 0 && typeof valid === "function" && valid();
    try {
      if (!current()) return { ok: false, reason: "changed" };
      const time = game.time?.worldTime;
      const data = demoralizingRoarEffect({ sourceUuid: source.uuid, targetUuid: target.uuid, targetType: target.type, time });
      if (!data) return { ok: false, reason: "descriptor" };
      const effects = [...target.effects].filter(e => markOf(e));
      if (effects.length > 1) return { ok: false, reason: "duplicateCarriers" };
      let effect = effects[0];
      const refreshed = Boolean(effect);
      if (effect) {
        const mark = markOf(effect);
        if (effect.disabled || effect.isSuppressed || mark?.version !== 1 || mark.targetUuid !== target.uuid)
          return { ok: false, reason: "carrier" };
        await effect.update(data);
      } else {
        [effect] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
      }
      if (!current() || game.time.worldTime !== time || !effect?.id || ![...target.effects].includes(effect)
        || JSON.stringify(markOf(effect)) !== JSON.stringify(data.flags["azeroth-rpg"][FLAG])
        || JSON.stringify(effect.system?.changes) !== JSON.stringify(data.system.changes))
        return { ok: false, reason: "unconfirmed" };
      return { ok: true, effectId: effect.id, refreshed };
    } catch (error) {
      console.warn("azeroth-rpg | Demoralizing Roar effect interrupted", error);
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(key, task);
  try { return await task; }
  finally { if (queues.get(key) === task) queues.delete(key); }
}
