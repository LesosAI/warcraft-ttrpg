/** GM transaction for the resource branch of one saved Devour Magic wound.
 * Called by the choice workflow, never directly from a player's payload.
 * Effect removal follows the confirmed drain; no second drain is permitted.
 */
import { devourMagicPlan } from "../rules/devour-magic.mjs";
import { DEVOUR_MAGIC_WOUNDS } from "./devour-magic-wound.mjs";
export const DEVOUR_MAGIC_BUSY = new Set();
const busy = DEVOUR_MAGIC_BUSY;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = doc => doc?.uuid && fromUuidSync(doc.uuid) === doc;

export async function applyDevourMagicResource({ message, target, source, poolId, valid } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const allowed = () => gmHere() && present(message) && present(target) && present(source)
    && typeof valid === "function" && valid() === true;
  if (!allowed()) return refuse("authority");
  // Serialize both the card's receipt array and this victim's resource writes.
  const keys = [message.uuid, target.uuid];
  if (keys.some(key => busy.has(key))) return refuse("busy");
  keys.forEach(key => busy.add(key));
  try {
    const read = () => message.getFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS);
    let expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("missingWound");
    const matches = expected.filter(row => row?.targetUuid === target.uuid);
    const wound = matches[0];
    if (matches.length !== 1 || wound?.version !== 1 || wound.sourceUuid !== source.uuid
      || wound.stage !== "wounded" || !Number.isFinite(wound.damageApplied) || wound.damageApplied <= 0) return refuse("wound");
    const index = expected.indexOf(wound);
    const pools = target.poolSnapshot();
    if (!same(pools, wound.pools)) return refuse("changedPools");
    const plan = devourMagicPlan({ wounded: true, pools, poolId });
    if (!plan.ok) return plan;
    if (plan.kind === "silence") {
      const timing = wound.timing;
      if (!Number.isSafeInteger(timing?.start?.time) || timing.start.time < 0
        || !["seconds", "turns"].includes(timing.duration?.units)
        || timing.duration.value !== (timing.duration.units === "seconds" ? 6 : 1)
        || (timing.duration.units === "turns" && (timing.duration.expiry !== "turnEnd"
          || !timing.start.combat || !timing.start.combatant))) return refuse("missingTiming");
    }
    const unchanged = () => allowed() && same(read(), expected);
    const save = async patch => {
      if (!unchanged()) throw Error("Devour Magic changed");
      const next = structuredClone(expected);
      next[index] = { ...next[index], ...patch };
      await message.setFlag("azeroth-rpg", DEVOUR_MAGIC_WOUNDS, next);
      if (!allowed() || !same(read(), next)) throw Error("Devour Magic receipt unconfirmed");
      expected = next;
    };
    await save({ stage: "resourceApplying", plan });
    if (!unchanged() || !same(target.poolSnapshot(), pools)) return refuse("changed");
    if (plan.kind === "drain") {
      await target.updatePool([{ itemId: plan.itemId, kind: "power", value: plan.value }]);
      const after = pools.map(pool => pool.kind === "power" && pool.itemId === plan.itemId ? { ...pool, value: plan.value } : pool);
      if (!unchanged() || !same(target.poolSnapshot(), after)) return refuse("unconfirmedDrain");
      await save({ stage: "effectPending", powerLost: 1 });
      return { ok: true, kind: "drain", powerLost: 1, effectPending: true };
    }
    if ((target.system?.conditionImmunities ?? []).includes("silenced")) {
      await save({ stage: "resolved", silenceImmune: true });
      return { ok: true, kind: "silence", immune: true, effectId: null };
    }
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("AZEROTH.DevourMagic.SilenceName"),
      description: game.i18n.localize("AZEROTH.DevourMagic.SilenceDescription"),
      img: "icons/svg/silenced.svg", origin: source.uuid, transfer: false, statuses: ["silenced"],
      system: { changes: [] }, ...structuredClone(wound.timing),
      flags: { "azeroth-rpg": { identifier: "devour-magic", devourMagic: {
        messageUuid: message.uuid, targetUuid: target.uuid, sourceUuid: source.uuid } } }
    }]);
    if (!unchanged() || !effect?.id || target.effects?.get(effect.id) !== effect
      || !effect.statuses?.has("silenced") || effect.origin !== source.uuid
      || effect.flags?.["azeroth-rpg"]?.devourMagic?.messageUuid !== message.uuid
      || effect.disabled === true || effect.isSuppressed === true) return refuse("unconfirmedSilence");
    await save({ stage: "resolved", effectId: effect.id });
    return { ok: true, kind: "silence", immune: false, effectId: effect.id };
  } catch { return refuse("writeUncertain"); }
  finally { keys.forEach(key => busy.delete(key)); }
}
