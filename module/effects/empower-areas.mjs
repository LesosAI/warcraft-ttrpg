/**
 * **02 §7's POTENT AND BINDING ON A PLACED AREA** (the 4a review's MUST-FIX 2 and 3; O-411 and
 * O-413 closed). The pure law is `rules/essence.mjs` (`potentAreaRise`, `potentAreaSeed`,
 * `bindingBane`); this module is the door every area door asks:
 *
 * - **Potent**: the area's first strike on each creature - at the start of its turn
 *   (`AzerothCombat#_areaTicks`), on entering (`area-strikes.mjs#enterAreas`) or on a failed
 *   area Test (`area-strikes.mjs#areaTestOutcome`, and the Signature's save door) - rises by the
 *   caster's tier, and the Region records the creature only AFTER the strike has landed, so a
 *   strike that did not land (the creature immune, at full Health, the Signature's delivery
 *   refused) leaves the rise for the next one.
 * - **Binding**: the first Resilience Test the spell asks of each creature takes a Bane. The
 *   Region's `binding.spent` names who has had theirs: the card's own Resist (seeded at Place
 *   area, and recorded into the Region when a Resist is made after it), and each area Test as the
 *   creature ROLLS it (`dice/chat.mjs#rollResists`; the lead, on the 4c review's Q6: *"6 - Only on
 *   creature's roll"*, D-1100) - a Test posted and never rolled leaves the Bane owed.
 * - **Potent counts once per cast** (the lead, Q4: *"4 - per cast"*): the struck list is read across
 *   every area the cast placed (`canvas/sustained-areas.mjs#castStruck`).
 *
 * The record is written in the area queue on the active GM's client
 * (`canvas/sustained-areas.mjs#markArea`); another client asks through `CONFIG.queries`.
 */

import { bindingBane, potentAreaRise } from "../rules/essence.mjs";
import { castStruck, isWriter, markArea } from "../canvas/sustained-areas.mjs";

const SCOPE = "azeroth-rpg";

/** The query a client that is not the active GM records an area's mark through. */
export const AREA_MARK_QUERY = "azeroth-rpg.areaMark";

/** The two lists an empowered area keeps. */
export const AREA_MARK_KEYS = Object.freeze(["potentStruck", "binding"]);

/**
 * **THE RISE THIS STRIKE CARRIES** for one creature, off the Region's own record.
 *
 * @param {RegionDocument|null} region
 * @param {Actor|null} actor
 * @param {{damage?: object|null, heal?: number|null}} payload
 * @returns {{damage: object|null, heal: number|null, rose: number}}
 */
export function potentForStrike(region, actor, payload = {}) {
  const f = region?.flags?.[SCOPE] ?? {};
  return potentAreaRise({
    potent: f.potent ?? 0,
    // **ONCE PER CAST** (the lead, on the 4c review's Q4: *"4 - per cast"*; D-1100): a creature risen for
    // on any area of this cast takes no second rise from another of its areas.
    struck: region ? castStruck(region) : [],
    uuid: actor?.uuid ?? null,
    damage: payload?.damage ?? null,
    heal: payload?.heal ?? null
  });
}

/**
 * Whether the Test the area asks of this creature now carries Binding's Bane.
 *
 * @param {RegionDocument|null} region
 * @param {Actor|null} actor
 * @returns {boolean}
 */
export function bindingOnArea(region, actor) {
  return bindingBane({ binding: region?.flags?.[SCOPE]?.binding ?? null, uuid: actor?.uuid ?? null });
}

/** Whether a strike's outcome is a strike that landed: damage dealt or Health restored. */
export function strikeLanded({ damageOutcome = null, healingOutcome = null } = {}) {
  return damageOutcome?.dealtDamage === true || (Number(healingOutcome?.restored) || 0) > 0;
}

/**
 * **RECORD A CREATURE ON AN AREA'S LIST** - here on the active GM, through the GM otherwise. A
 * refusal or an absent GM records nothing and says nothing: the mark is bookkeeping for a rise
 * or a Bane already given, and a second rise is the worse fault only where a GM is there to
 * write the first.
 *
 * @param {RegionDocument|null} region
 * @param {"potentStruck"|"binding"} key
 * @param {string|null} uuid
 * @returns {Promise<boolean>}
 */
export async function recordAreaMark(region, key, uuid) {
  if (!region || !AREA_MARK_KEYS.includes(key) || typeof uuid !== "string" || !uuid) return false;
  if (isWriter()) return markArea(region, key, uuid);
  const gm = game.users?.activeGM ?? null;
  if (!gm) return false;
  try {
    const answer = await gm.query(AREA_MARK_QUERY, { sceneId: region.parent?.id ?? null, regionId: region.id, key, uuid }, { timeout: 10000 });
    return answer?.ok === true;
  } catch (err) {
    console.warn("azeroth-rpg | an area's mark was not recorded", err);
    return false;
  }
}

/**
 * The handler (`CONFIG.queries[AREA_MARK_QUERY]`), on the active GM's client: the asking user must
 * own the creature it names - a player records only their own creature's Test or strike - and
 * the area must carry the benefit the key names (`markArea` asks again inside the queue).
 *
 * @param {{sceneId?: string, regionId?: string, key?: string, uuid?: string}} payload
 * @param {{user?: User|null}} [context]
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function areaMarkQueryHandler(payload = {}, { user = null } = {}) {
  if (!isWriter()) return { ok: false, reason: "notWriter" };
  const region = game.scenes?.get(payload?.sceneId ?? "")?.regions?.get(payload?.regionId ?? "") ?? null;
  if (!region || !AREA_MARK_KEYS.includes(payload?.key)) return { ok: false, reason: "context" };
  let actor = null;
  try {
    actor = typeof payload.uuid === "string" ? fromUuidSync(payload.uuid) : null;
  } catch {
    actor = null;
  }
  if (actor?.documentName !== "Actor") return { ok: false, reason: "context" };
  if (user && !user.isGM && !actor.testUserPermission?.(user, "OWNER")) return { ok: false, reason: "notOwner" };
  return { ok: await markArea(region, payload.key, actor.uuid) };
}

/**
 * **THE REGIONS A SPELL'S CARD PLACED**, on every scene: the area carries the card's id
 * (`dice/chat.mjs#regionFlagsFromCard`'s `messageId`).
 *
 * @param {ChatMessage|null} message
 * @returns {RegionDocument[]}
 */
export function regionsOfCard(message) {
  if (!message?.id) return [];
  const out = [];
  for (const scene of game.scenes ?? []) {
    for (const region of scene.regions ?? []) {
      if (region.flags?.[SCOPE]?.messageId === message.id) out.push(region);
    }
  }
  return out;
}
