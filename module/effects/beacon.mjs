/**
 * **BEACON, WHERE IT TOUCHES THE WORLD** (04-TALENTS, the Paladin's Benediction
 * branch; D-772). `rules/class-talents.mjs#beaconFor` and `beaconShares` are the
 * law; this names the chosen creature, ends the choice at the Paladin's Long
 * Rest (`AzerothActor#longRest`) and passes a heal's share on - here where this
 * client may write the chosen creature, on the active GM's client through
 * `CONFIG.queries` where it may not (never `game.socket`, D-643). Symbiosis's
 * shape (`effects/symbiosis.mjs`, D-771), with the HEALER's bond rather than the
 * healed one's.
 *
 * *Choose a friendly target you know during a Long Rest. When another target
 * within 120 feet of you restores Health from your spells and effects, your
 * chosen target restores half as much, rounded down.*
 *
 * - **The choice** is the Paladin's own flag, `{partner, name}`, written by the
 *   Use of the feature the talent grants (once a Long Rest, Symbiosis's naming
 *   door and refusals) and cleared at the next Long Rest.
 * - **The share** is half of what LANDED on the other creature, rounded down,
 *   and the share does not itself share (Symbiosis's reading).
 * - **Within 120 feet** is measured between the nearest squares, as every
 *   distance is (D-732), and a pair that could not be measured is nobody's to
 *   reach (`afterBlow`'s rule for Righteous Fury, D-768).
 */

import { BEACON_FLAG, beaconFor, beaconShares } from "../rules/class-talents.mjs";
import { sharedHeal } from "../rules/symbiosis.mjs";
import { feetApart } from "../canvas/footprints.mjs";

/** The query a share for a creature this client does not own goes through. */
export const BEACON_HEAL_QUERY = "azeroth-rpg.beaconHeal";

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/** Feet between two creatures' tokens on the viewed scene, or null where either is not placed. */
function feetBetween(a, b) {
  if (!a || !b) return null;
  if (a === b || a.uuid === b.uuid) return 0;
  const from = a.getActiveTokens?.(true)?.[0] ?? null;
  const to = b.getActiveTokens?.(true)?.[0] ?? null;
  if (!from || !to || !globalThis.canvas?.grid) return null;
  if (from.document?.parent?.id !== to.document?.parent?.id) return null;
  return feetApart(from, to);
}

/**
 * The share one heal passes on, worked out against the healer's bond, or null.
 *
 * @param {{healed: Actor, from: Actor, restored: number}} o
 * @returns {{chosen: Actor, share: number}|null}
 */
function beaconShareOf({ healed, from, restored, measuredElsewhere = false }) {
  if (!healed || !from || !(Number(restored) > 0)) return null;
  if (from.type !== "character" || typeof from.takenTalents !== "function") return null;
  const row = beaconFor(from.takenTalents());
  if (!row) return null;
  const flag = from.getFlag?.("azeroth-rpg", BEACON_FLAG) ?? null;
  if (!flag?.partner) return null;
  // The GM's client may be viewing another scene: the asker's client measured
  // the distance already, and a pair this client cannot measure is taken as the
  // asker found it; one it CAN measure is measured again.
  const here = feetBetween(from, healed);
  const ok = beaconShares({
    healedUuid: healed.uuid, chosenUuid: String(flag.partner), fromHolder: true,
    feet: here === null && measuredElsewhere ? 0 : here, reach: row.feet
  });
  if (!ok) return null;
  const chosen = actorAt(String(flag.partner));
  const share = sharedHeal(restored, row.share);
  return chosen && share > 0 ? { chosen, share } : null;
}

/**
 * **PASS A HEAL'S SHARE TO THE CHOSEN CREATURE**, where the healer holds Beacon
 * and the heal qualifies. Nothing otherwise.
 *
 * @param {{healed: Actor, from: Actor, restored: number}} o
 * @returns {Promise<number>}  what the chosen creature restored, as far as this client knows
 */
export async function shareBeacon({ healed, from, restored }) {
  const due = beaconShareOf({ healed, from, restored });
  if (!due) return 0;
  if (due.chosen.isOwner) {
    await due.chosen.applyHealing(due.share, { shared: true });
    return due.share;
  }
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Beacon.NoGM", { name: due.chosen.name }));
    return 0;
  }
  try {
    await gm.query(BEACON_HEAL_QUERY, { healerUuid: from.uuid, healedUuid: healed.uuid, amount: restored }, { timeout: 15000 });
    return due.share;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return 0;
  }
}

/**
 * The GM-side handler. The asker must own the HEALER - it was their client that
 * gave the heal - and the share is worked out again here off the bond and the
 * distance as the GM's world holds them, never trusted off the request.
 */
export async function beaconHealQueryHandler({ healerUuid = null, healedUuid = null, amount = 0 } = {}, { user = null } = {}) {
  const from = healerUuid ? await fromUuid(healerUuid) : null;
  const healed = healedUuid ? await fromUuid(healedUuid) : null;
  if (!from || from.documentName !== "Actor" || !healed || healed.documentName !== "Actor") {
    throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  }
  if (user && !from.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: from.name }));
  }
  const due = beaconShareOf({ healed, from, restored: Math.max(0, Math.trunc(Number(amount)) || 0), measuredElsewhere: true });
  if (!due) throw new Error(game.i18n.format("AZEROTH.Beacon.NoBond", { name: from.name }));
  await due.chosen.applyHealing(due.share, { shared: true });
  return { name: due.chosen.name, amount: due.share };
}

/**
 * **NAME THE CHOSEN CREATURE** (04: *Choose a friendly target you know during a
 * Long Rest*): the Paladin's flag, one at a time, replacing any before it.
 *
 * @param {Actor} holder
 * @param {Actor} chosen
 */
export async function nameBeacon(holder, chosen) {
  if (!holder || !chosen) return null;
  await holder.setFlag("azeroth-rpg", BEACON_FLAG, { partner: chosen.uuid, name: chosen.name });
  ui.notifications?.info(game.i18n.format("AZEROTH.Beacon.Named", { name: holder.name, partner: chosen.name }));
  return chosen;
}
