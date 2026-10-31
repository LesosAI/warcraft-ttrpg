import { FLAME_BUFFET, nextBuffet } from "../rules/flame-buffet.mjs";

export const BUFFET_APPLICATIONS = "flameBuffetApplications";
const busy = new Set();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const id = value => typeof value === "string" && value.trim().length > 0;

/** One shared dispellable stack effect. Claims survive lost acknowledgements;
 * a completed application is never recreated merely because it was dispelled. */
export async function layFlameBuffet({ victim, by, requestId, valid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const now = globalThis.game?.time?.worldTime;
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && id(victim?.uuid) && id(by?.uuid) && fromUuidSync(victim.uuid) === victim && fromUuidSync(by.uuid) === by
    && Number.isInteger(now) && now >= 0 && game.time.worldTime === now
    && typeof valid === "function" && valid() === true;
  if (!id(requestId) || !permitted()) return refuse("authority");
  if (busy.has(victim.uuid)) return refuse("busy");
  busy.add(victim.uuid);
  const read = () => victim.getFlag("azeroth-rpg", BUFFET_APPLICATIONS) ?? [];
  let expected;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    const previous = expected.find(row => row?.requestId === requestId);
    if (previous && previous.sourceUuid !== by.uuid) return refuse("requestCollision");
    if (previous) return previous.stage === "complete"
      ? { ok: true, alreadyApplied: true, effectId: previous.effectId } : refuse("reconcile");
    if (expected.some(row => row?.stage !== "complete")) return refuse("reconcile");
    const all = [...(victim.effects ?? [])];
    const held = all.filter(effect => effect.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag]?.version === 1);
    const stamp = effect => JSON.stringify([effect.id, effect.disabled, effect.isSuppressed,
      effect.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag], effect.duration, effect.start]);
    const before = new Map(held.map(effect => [effect, stamp(effect)]));
    const row = nextBuffet(all, now, by.uuid);
    if (!row) return refuse("state");
    const data = { name: game.i18n.localize("AZEROTH.FlameBuffet.Name"), img: "icons/svg/fire.svg",
      origin: by.uuid, disabled: false, transfer: false, statuses: [],
      duration: { value: FLAME_BUFFET.seconds, units: "seconds", expired: false },
      start: { time: now, combat: null, combatant: null, round: 0, turn: 0, initiative: 0 },
      system: { changes: [] }, flags: { "azeroth-rpg": { harmful: true, [FLAME_BUFFET.flag]: row } } };
    const save = async value => {
      if (!permitted() || !equal(read(), expected)) throw Error("Flame Buffet claim changed");
      await victim.setFlag("azeroth-rpg", BUFFET_APPLICATIONS, value);
      if (!permitted() || !equal(read(), value)) throw Error("Flame Buffet claim unconfirmed");
      expected = structuredClone(value);
    };
    const index = expected.length;
    await save([...expected, { requestId, sourceUuid: by.uuid, stage: "applying", state: row }]);
    const currentHeld = [...(victim.effects ?? [])].filter(effect => effect.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag]?.version === 1);
    if (currentHeld.length !== held.length || !held.every(effect => currentHeld.includes(effect) && stamp(effect) === before.get(effect))) return refuse("changed");
    let effect;
    if (held.length) { effect = held[0]; await effect.update(data); }
    else [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!permitted() || !effect?.id || ![...(victim.effects ?? [])].includes(effect)
      || !equal(effect.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag], row)
      || effect.disabled || effect.duration?.value !== 12 || effect.duration?.units !== "seconds"
      || effect.start?.time !== now) return refuse("writeUncertain");
    if (held.length > 1) {
      if (!held.slice(1).every(other => stamp(other) === before.get(other))) return refuse("changed");
      await victim.deleteEmbeddedDocuments("ActiveEffect", held.slice(1).map(other => other.id));
    }
    const remaining = [...(victim.effects ?? [])].filter(e => e.flags?.["azeroth-rpg"]?.[FLAME_BUFFET.flag]?.version === 1);
    if (!permitted() || remaining.length !== 1 || remaining[0] !== effect) return refuse("writeUncertain");
    const completed = structuredClone(expected);
    completed[index] = { ...completed[index], stage: "complete", effectId: effect.id };
    await save(completed);
    return { ok: true, effectId: effect.id, stacks: row.stacks };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(victim.uuid); }
}
