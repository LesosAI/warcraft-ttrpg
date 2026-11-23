/**
 * **WHAT PUTS YOU DOWN** (10 §3; D-1729, the lead: *"Corruption exposure should be automatic."*).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * > *A creature exposes you when it **reduces you to 0 Health**, and at no other time. Being hit
 * > by a ghoul is not exposure. Being killed by one is.*
 *
 * The creature's track is the Corruption entry on its stat block (14; `system.corruption` on an
 * NPC), the Test is the Resilience that track names (`corruption.mjs#resilienceFor`, config's one
 * table, D-459), and the DC is 10 §3's table: 15 for Undeath and Fel, 18 for Void. The DC is read
 * off config's `EXPOSURE_OCCASIONS`, whose `scourge`, `demon` and `voidThing` rows ARE that table's
 * three rows (each names its track), so there is one copy of the number; this module's Vitest
 * reads the three DCs off the chapter and fails if either side moves.
 *
 * `effects/death-watch.mjs` is the one caller: the death watch sees the drop (a character's Health
 * from above 0 to 0), and the damage door's write names the creature that dealt it
 * (`death-watch.mjs#DAMAGE_BY_OPTION`). This module judges the pair.
 */

import { AZEROTH } from "../config.mjs";
import { resilienceFor, TRACKS } from "./corruption.mjs";
import { accruesTrack } from "./undead.mjs";

/** The occasion the exposure card names (`AZEROTH.Occasion.Creature`). */
export const CREATURE_OCCASION = "creature";

/**
 * 10 §3's DC for a creature's track, off config's creature rows. Null for a track the table lacks.
 *
 * @param {string} track
 * @returns {number|null}
 */
export function creatureExposureDC(track) {
  if (!TRACKS.includes(track)) return null;
  const row = Object.values(AZEROTH.EXPOSURE_OCCASIONS ?? {}).find(o => o?.track === track && Number.isFinite(o?.dc));
  return row ? row.dc : null;
}

/**
 * Why a drop exposes nobody, or null where it exposes. In order:
 * - `notCharacter`: the creature put down is not a character (10's tracks are a character's);
 * - `noDrop`: the Health did not go from above 0 to 0 (a blow on a character already at 0 is no
 *   new drop: *reduces you to 0 Health*);
 * - `noDealer`: the damage names no creature that dealt it. **Nobody is guessed**: a condition's
 *   tick (Bleeding, Scorched, Burning), a deferred half and a GM's hand edit carry no dealer, and
 *   those drops expose nobody (O-624);
 * - `notCreature`: the dealer is a character (a Death Knight or a Necromancer player is a
 *   character, and a character exposes nobody);
 * - `noTrack`: the creature's block names no Corruption;
 * - `accruesNone`: the character accrues no point on that track (10 §3: the Forsaken, a Death
 *   Knight, a lich and the San'layn accrue no Undeath; `undead.mjs#accruesTrack`), so no Test is
 *   made and no card pretends one was.
 *
 * @typedef {"notCharacter"|"noDrop"|"noDealer"|"notCreature"|"noTrack"|"accruesNone"} ExposureRefusal
 */

/**
 * **THE ONE JUDGEMENT OF A DROP.** Plain snapshots only.
 *
 * @param {object} o
 * @param {{type?: string, before?: number|null, after?: number|null, classes?: string[], race?: string|null, undead?: boolean|null}} o.target
 *   the creature put down: its type, its Health before and after the write, and what
 *   `accruesTrack` reads
 * @param {{type?: string, corruption?: string|null}|null} o.dealer  the creature whose damage it was
 * @returns {{expose: boolean, reason: ExposureRefusal|null, track: string|null, dc: number|null, resilience: string|null}}
 */
export function creatureExposure({ target = null, dealer = null } = {}) {
  const no = reason => ({ expose: false, reason, track: null, dc: null, resilience: null });
  if (target?.type !== "character") return no("notCharacter");
  const before = target.before, after = target.after;
  const finite = v => typeof v === "number" && Number.isFinite(v);
  if (!(finite(before) && finite(after) && before > 0 && after <= 0)) return no("noDrop");
  if (!dealer || typeof dealer !== "object") return no("noDealer");
  if (dealer.type !== "npc") return no("notCreature");
  const track = typeof dealer.corruption === "string" ? dealer.corruption : null;
  const dc = track ? creatureExposureDC(track) : null;
  if (!track || dc === null) return no("noTrack");
  if (!accruesTrack({ track, classes: target.classes ?? [], race: target.race ?? null, undead: target.undead ?? null })) {
    return { ...no("accruesNone"), track };
  }
  return { expose: true, reason: null, track, dc, resilience: resilienceFor(track) };
}

/**
 * **THE DC THE HOLDER'S CLIENT USES**: the table's, whatever the asker sent (D-982's rule: the
 * handler reads the row, never the payload). Null where the track is not a creature's.
 *
 * @param {string} track
 * @returns {{track: string, dc: number, resilience: string}|null}
 */
export function exposureFor(track) {
  const dc = creatureExposureDC(track);
  return dc === null ? null : { track, dc, resilience: resilienceFor(track) };
}
