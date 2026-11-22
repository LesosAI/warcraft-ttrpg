/**
 * **STARWEAVE ON THE ONE STARFALL IT WAS CAST INTO** (07 §11; the spell audit, D-1705, D-1710).
 * Pure: plain snapshots only. Discovery and writes belong to `effects/starweave-context.mjs`.
 *
 * 07 since the audit: *Cast into an area where you are sustaining **Starfall**. For the duration,
 * while you sustain that Starfall, a creature that starts its turn in the area makes a Spirit
 * Resilience Test ... or is Slowed ..., and your Starfall strikes two creatures each turn rather
 * than one.* Starweave is an Instant of 1 minute, so its Region is a TIMED area (no Sustain record),
 * and the Starfall it names is the one whose area held the Starweave's centre at the cast. The link
 * is written on the Starweave's Region as it is created (`STARWEAVE_LINK`), and everything that
 * reads it asks whether THAT Starfall cast is still sustained: a Starfall recast, or one whose
 * Sustain ended, never inherits it, and the Starweave then does nothing for the rest of its minute.
 *
 * Before the audit Starweave was Sustained, a Druid holds one Sustain, and casting it ended the
 * Starfall it needed (D-1705), so no live link was ever written; the old two-Sustain association
 * this file held could not be satisfied and is gone.
 */

/** The Region flag the link is written under. */
export const STARWEAVE_LINK = "starweaveLink";

/** The link's shape version: 2 since the Starweave is timed (D-1710). */
export const STARWEAVE_LINK_VERSION = 2;

const identity = value => typeof value === "string" && value.trim().length > 0;

/**
 * **WHICH STARFALL A STARWEAVE IS CAST INTO**: the caster's own Starfall Region on the same scene,
 * Sustained, whose cast the caster holds exactly once, and whose area holds the Starweave's
 * centre (`contains`, measured by the caller through core's `Region#testPoint`). One such Starfall
 * answers the link; none answers `outside`, more than one `ambiguous` (a Druid sustains one spell,
 * so two can stand only through a feature that grants more, and 07 names one).
 *
 * @param {{casterUuid: string, sceneId: string, starweave: {cast: string, identifier: string},
 *   falls: Array<{uuid: string, cast: string, identifier: string, caster: string, sceneId: string,
 *   sustained: boolean, contains: boolean}>, held: Array<{cast?: string, identifier?: string}>}} o
 * @returns {{ok: true, link: object}|{ok: false, reason: string}}
 */
export function starweaveLinkFor({ casterUuid, sceneId, starweave, falls = [], held = [] } = {}) {
  if (!identity(casterUuid) || !identity(sceneId) || !Array.isArray(held) || !Array.isArray(falls)) return { ok: false, reason: "identity" };
  if (!starweave || starweave.identifier !== "starweave" || !identity(starweave.cast)) return { ok: false, reason: "identity" };
  const live = falls.filter(fall => fall && fall.identifier === "starfall" && fall.caster === casterUuid
    && fall.sceneId === sceneId && fall.sustained === true && identity(fall.uuid) && identity(fall.cast)
    && held.filter(entry => entry?.cast === fall.cast).length === 1
    && held.some(entry => entry?.cast === fall.cast && entry.identifier === "starfall"));
  const under = live.filter(fall => fall.contains === true);
  if (!under.length) return { ok: false, reason: live.length ? "outside" : "noStarfall" };
  if (under.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, link: { version: STARWEAVE_LINK_VERSION, casterUuid, sceneId,
    starfall: { regionUuid: under[0].uuid, cast: under[0].cast },
    starweave: { cast: starweave.cast } } };
}

/**
 * **WHETHER A RECORDED LINK STILL STANDS**: the Starweave Region is the one the link names (its
 * cast), timed and the caster's; the Starfall Region it names is on the scene with the same cast,
 * the caster's, Sustained, and that cast is still held exactly once. Anything else - the Starfall
 * ended, recast or moved to another scene, a link of the old version, a forged one - is false.
 *
 * @param {object|null} link
 * @param {{casterUuid: string, sceneId: string, starweave: object|null, starfall: object|null, held: Array<object>}} o
 * @returns {boolean}
 */
export function starweaveLinkLive(link, { casterUuid, sceneId, starweave, starfall, held = [] } = {}) {
  if (link?.version !== STARWEAVE_LINK_VERSION || link.casterUuid !== casterUuid || link.sceneId !== sceneId) return false;
  if (!starweave || starweave.identifier !== "starweave" || starweave.caster !== casterUuid
    || starweave.cast !== link.starweave?.cast || starweave.sustained === true) return false;
  if (!starfall || starfall.uuid !== link.starfall?.regionUuid || starfall.cast !== link.starfall.cast
    || starfall.identifier !== "starfall" || starfall.caster !== casterUuid || starfall.sustained !== true
    || starfall.sceneId !== sceneId) return false;
  if (!Array.isArray(held)) return false;
  const entries = held.filter(entry => entry?.cast === link.starfall.cast);
  return entries.length === 1 && entries[0].identifier === "starfall";
}

/**
 * **THE SPELLS A REGION'S GATED CHECK MAY COUNT AS HELD** (`area-ticks.mjs#checksFor`'s `holds`; named apart from `ability-automation.mjs#gateHolds`):
 * the identifiers of every Sustain the caster holds, EXCEPT that a Starweave Region counts
 * `starfall` only while the very Starfall cast its link names is held - and not at all where it
 * carries no link (cast outside a Starfall, or a held copy placed before the link existed). So the
 * Slow waits on *that* Starfall, as 07 says, and ends with it.
 *
 * @param {object|null} regionFlags  the Region's `flags.azeroth-rpg`
 * @param {Array<object>} held  the caster's `sustaining` entries
 * @returns {Set<string>}
 */
export function starweaveGateHolds(regionFlags, held = []) {
  const entries = Array.isArray(held) ? held : [];
  const out = new Set(entries.map(entry => entry?.identifier).filter(Boolean));
  if (regionFlags?.identifier !== "starweave") return out;
  out.delete("starfall");
  const link = regionFlags?.[STARWEAVE_LINK];
  if (link?.version !== STARWEAVE_LINK_VERSION || !identity(link.starfall?.cast)) return out;
  const named = entries.filter(entry => entry?.cast === link.starfall.cast);
  if (named.length === 1 && named[0].identifier === "starfall") out.add("starfall");
  return out;
}
