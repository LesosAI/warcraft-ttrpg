/**
 * **A CREATURE'S DISEASE IS A SHARED CARRIER** (D12 section 3, Phase 5b). Carrion palsy,
 * Dredge sickness, Scarab fever and Lockjaw are laid through the one writer
 * (`effects/afflictions.mjs#afflict`) with no duration: they are carried until cured,
 * and another exposure while carrying one changes nothing. This is the door the four
 * per-creature modules (`maggot-slime`, `dredge-sickness`, `plague-cloud`, `tetanus`)
 * keep their old names and result shapes over.
 *
 * Lockjaw's maximum-Health clamp (`rules/tetanus.mjs#tetanusHealthPatch`) is applied by
 * the writer when the disease takes hold; the maximum returns by itself when the
 * carrier goes, because it is derived and nothing stored is raised (the Tetanus rule:
 * a cure does not heal).
 */

import { makeDisease } from "../rules/afflictions.mjs";
import { afflict } from "./afflictions.mjs";

const busy = new Set();

/**
 * @param {{key: string, victim: Actor, by: Actor, valid: Function}} o
 * @returns {Promise<{ok: boolean, reason?: string, immune?: true, already?: true, effectId?: string}>}
 */
export async function layCreatureDisease({ key, victim, by, valid } = {}) {
  const permitted = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && victim?.uuid && by?.uuid && typeof valid === "function" && valid();
  if (!permitted()) return { ok: false, reason: "authority" };
  if (busy.has(victim.uuid)) return { ok: false, reason: "busy" };
  busy.add(victim.uuid);
  let done;
  try {
    const aff = makeDisease(key, { source: { uuid: by.uuid, name: by.name ?? "" }, now: game.time?.worldTime ?? 0 });
    done = await afflict(victim, { aff, by });
    if (done?.reason === "immune") return { ok: true, immune: true };
    if (done?.reason === "alreadyCarried") return { ok: true, already: true };
    if (!done?.ok || !done.effectId) return { ok: false, reason: done?.reason ?? "write" };
    if (!permitted()) return { ok: false, reason: "changed", effectId: done.effectId };
    return { ok: true, effectId: done.effectId };
  } catch { return { ok: false, reason: "writeUncertain", effectId: done?.effectId ?? null }; }
  finally { busy.delete(victim.uuid); }
}
