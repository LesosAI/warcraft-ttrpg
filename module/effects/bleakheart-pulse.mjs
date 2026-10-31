import { BLEAKHEART, BLEAKHEART_FLAG, bleakheartProc } from "../rules/bleakheart.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { clockRounds } from "./durations.mjs";
import { postBleakheartResult } from "./bleakheart-feedback.mjs";

const busy = new Set();
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[BLEAKHEART_FLAG];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve one observed interval, never replaying an uncertain roll, damage
 * write or stun. The observer supplies the interval identity and revalidation. */
export async function resolveBleakheartPulse({ victim, effect, tickKey, valid } = {}) {
  if (!victim?.uuid || !effect?.id || typeof tickKey !== "string" || !tickKey
    || typeof valid !== "function" || busy.has(victim.uuid)) return { ok: false, reason: "argumentsOrBusy" };
  const timing = { duration: { value: effect.duration?.value, units: effect.duration?.units }, start: { ...effect.start } };
  const origin = effect.origin;
  const permitted = () => gmHere() && valid() && fromUuidSync(victim.uuid) === victim
    && [...(victim.effects ?? [])].includes(effect) && effect.active === true
    && !effect.disabled && !effect.isSuppressed && !effect.duration?.expired
    && stateOf(effect)?.version === 1 && effect.origin === origin
    && same(timing, { duration: { value: effect.duration?.value, units: effect.duration?.units }, start: { ...effect.start } });
  if (!permitted() || !(victim.system?.health?.value > 0)) return { ok: false, reason: "inactive" };
  const previous = stateOf(effect).tick;
  if (previous && (previous.key === tickKey || previous.state !== "finished")) return { ok: false, reason: "receipt" };
  // Foundry merges flag objects. Reset every receipt field explicitly so a
  // previous proc's face, damage lines or stun id cannot survive a new tick.
  let receipt = { key: tickKey, state: "rolling", face: null, proc: null,
    lines: [], stunned: false, effectId: null };
  const held = () => same(stateOf(effect)?.tick, receipt);
  const save = async patch => {
    if (!permitted()) return false;
    receipt = { ...receipt, ...patch };
    await effect.update({ [`flags.azeroth-rpg.${BLEAKHEART_FLAG}.tick`]: receipt });
    return permitted() && held();
  };
  busy.add(victim.uuid);
  try {
    if (!await save({})) return { ok: false, reason: "claim" };
    const roll = await new Roll("1d20").evaluate();
    const proc = bleakheartProc(roll.total);
    if (proc === null || !permitted() || !held()) return { ok: false, reason: "rollUncertain" };
    if (!proc) return { ok: await save({ state: "finished", face: roll.total, proc: false }), proc: false };
    const caster = origin ? await fromUuid(origin) : null;
    if (!permitted() || !held() || !(victim.system?.health?.value > 0)) return { ok: false, reason: "changed" };
    if (!await save({ state: "damaging", face: roll.total, proc: true })) return { ok: false, reason: "record" };
    const lines = await strikeFromArea({ actor: victim, caster: caster?.documentName === "Actor" ? caster : null,
      spell: { name: "Chest Pains", school: BLEAKHEART.school, feature: true, isSpell: false, takesSpellpower: false },
      damage: { rating: BLEAKHEART.damage, school: BLEAKHEART.school } });
    if (!Array.isArray(lines) || !lines.length || !permitted() || !held()) return { ok: false, reason: "damageUncertain" };
    // Ward and Shadow immunity affect damage only. Stun immunity is separate.
    const stun = victim.system?.health?.value > 0
      && !Array.from(victim.system?.conditionImmunities ?? []).includes(BLEAKHEART.condition);
    let effectId = null;
    if (stun) {
      if (!await save({ state: "stunning", lines })) return { ok: false, reason: "record" };
      const [condition] = await victim.createEmbeddedDocuments("ActiveEffect", [{
        name: "Chest Pains — Stunned", img: "icons/svg/daze.svg", origin,
        disabled: false, statuses: [BLEAKHEART.condition], system: { changes: [] }, ...clockRounds(1),
        flags: { "azeroth-rpg": { harmful: true, bleakheartPain: { curseId: effect.id, tickKey } } }
      }]);
      if (!condition?.id || ![...(victim.effects ?? [])].includes(condition)
        || !permitted() || !held()) return { ok: false, reason: "stunUncertain" };
      effectId = condition.id;
    }
    const ok = await save({ state: "finished", lines, stunned: stun, effectId });
    if (ok) await postBleakheartResult({ victim, kind: "pain", receipt });
    return { ok, proc: true, lines, stunned: stun, effectId };
  } catch (error) {
    console.warn("azeroth-rpg | Bleakheart pulse uncertain; inspect the curse receipt before correcting", error);
    return { ok: false, reason: "writeUncertain" };
  } finally { busy.delete(victim.uuid); }
}
