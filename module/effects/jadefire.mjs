import { JADEFIRE, jadefireArmor, jadefireActive } from "../rules/jadefire.mjs";
const pending = new Set();

/** Create once after payment; ambiguous writes are left for explicit repair. */
export async function layJadefire({ actor, startedAt, valid } = {}) {
  const allowed = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && actor?.uuid && fromUuidSync(actor.uuid) === actor && typeof valid === "function" && valid();
  if (!allowed()) return { ok: false, reason: "authority" };
  if (pending.has(actor.uuid)) return { ok: false, reason: "busy" };
  pending.add(actor.uuid);
  let effect;
  try {
    if ([...(actor.effects ?? [])].some(row => row.flags?.["azeroth-rpg"]?.jadefire)) return { ok: false, reason: "existing" };
    const data = jadefireEffect(actor, startedAt);
    if (!data || game.time?.worldTime !== startedAt) return { ok: false, reason: "state" };
    [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    const ok = allowed() && effect && [...actor.effects].includes(effect) && activeJadefire(actor) === effect;
    return { ok: Boolean(ok), effectId: effect?.id ?? null, ...(!ok ? { reason: "writeUncertain" } : {}) };
  } catch {
    return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null };
  } finally { pending.delete(actor.uuid); }
}

/** V14 carrier: the same effect owns armor, duration, and retaliation. */
export function jadefireEffect(actor, startedAt = globalThis.game?.time?.worldTime) {
  const changes = jadefireArmor(actor?.system?.ap).map(row => ({
    ...row, value: String(row.value), type: "add", phase: "final", priority: 90
  }));
  if (!actor?.uuid || !Number.isInteger(startedAt) || !changes.length) return null;
  return {
    name: JADEFIRE.name, img: "icons/svg/fire.svg", origin: actor.uuid,
    disabled: false, transfer: false, statuses: [],
    description: "<p>You gain 2 Armor Points at each existing location. A creature that lands a melee hit against you takes 3 Fire damage. This effect ends after 12 seconds.</p>",
    system: { changes }, start: { time: startedAt },
    duration: { value: JADEFIRE.seconds, units: "seconds" },
    flags: { "azeroth-rpg": { jadefire: { version: 1, actorUuid: actor.uuid, startedAt } } }
  };
}

/** Missing, duplicate, foreign, dispelled, disabled or expired carriers cannot retaliate. */
export function activeJadefire(actor, now = globalThis.game?.time?.worldTime) {
  const carriers = [...(actor?.effects ?? [])].filter(effect => effect.flags?.["azeroth-rpg"]?.jadefire);
  if (carriers.length !== 1) return null;
  const effect = carriers[0], state = effect.flags["azeroth-rpg"].jadefire;
  if (state.version !== 1 || state.actorUuid !== actor.uuid || effect.origin !== actor.uuid
    || effect.start?.time !== state.startedAt || effect.duration?.units !== "seconds"
    || effect.duration?.value !== JADEFIRE.seconds || effect.duration?.expired) return null;
  return jadefireActive({ startedAt: state.startedAt, now,
    disabled: effect.disabled, suppressed: effect.isSuppressed }) ? effect : null;
}
