/**
 * **A SPEED DROPPED BY A BLOW** (04's Wing Clip: *On a hit the target's Speed drops
 * 10 feet per rank until your next turn*; D-773).
 *
 * One Active Effect on the creature struck: a `final`-phase `add` to the derived
 * `system.speed` and its own `upgrade 0` floor beside it - a drop laid in the final
 * phase lands after `speedFrom`'s floor (D-757's lesson), so it carries its own. The
 * span is the one the layer names (the STRIKER's next turn start, keyed on the
 * striker's combatant, D-628's rule for a clock that is somebody else's), and a
 * second drop by the same source replaces the first rather than stacking.
 *
 * The write runs here for whoever owns the creature and through `CONFIG.queries`
 * on the active GM's client otherwise, the handler checking the asker owns the
 * striker - D-770's inflict door's shape, never `game.socket`.
 *
 * **THE ONE DOOR FOR EVERY SPEED DROP** (D-778): 07's Frostbolt, Ice Spear and
 * Wrath lay theirs through it as a hit lands, and 04's Permafrost - *Your effects
 * that reduce Speed reduce it 5 feet further per rank* - is added HERE, off the
 * dropper's own talents, so no caller adds it twice or forgets it.
 */

import { slowingFor } from "../rules/class-talents.mjs";
import { SLOWED_FEET_FLAG, speedDropChanges } from "../rules/slowing.mjs";

export const SPEED_DROP_QUERY = "azeroth-rpg.speedDrop";

/** The flag a laid drop rides on: `{feet, source}`. */
export const SPEED_DROP_FLAG = "speedDrop";

/** The icon the drop wears in the effects list. */
const ICON = "icons/svg/downgrade.svg";

/** The effect's create data; pure enough to build on either client. */
function dropData({ feet, source, originUuid, span }) {
  return {
    name: game.i18n.format("AZEROTH.SpeedDrop.Name", { source, feet }),
    img: ICON,
    origin: originUuid ?? null,
    description: `<p>${game.i18n.format("AZEROTH.SpeedDrop.Text", { feet })}</p>`,
    system: { changes: speedDropChanges(feet) },
    // The span's two keys and nothing else a request slipped in beside them.
    ...(span && typeof span === "object" && span.duration && span.start ? { duration: { ...span.duration }, start: { ...span.start } } : {}),
    flags: { "azeroth-rpg": { [SPEED_DROP_FLAG]: { feet, source } } }
  };
}

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

/**
 * **04's PERMAFROST ON THE DROPPER'S OWN DROP** (*Your effects that reduce Speed
 * reduce it 5 feet further per rank*; the lead, 2026-10-03, on O-165: *"Yes."*;
 * D-778): the feet the creature that laid it adds, off its own talents - read here,
 * the one door every Speed drop goes through (a spell's hit, a rider's), and read
 * again on the GM's client off the dropper as the GM holds it.
 *
 * @param {string|null} originUuid  the dropper's
 * @returns {number}
 */
export function permafrostFeet(originUuid) {
  const dropper = actorAt(originUuid);
  if (typeof dropper?.takenTalents !== "function") return 0;
  return slowingFor(dropper.takenTalents())?.feet ?? 0;
}

/**
 * **PERMAFROST'S FEET ON A SLOWED** (D-778): A1's halving is the status's own
 * change, and the feet the caster's Permafrost adds ride the SAME effect as an
 * `add` and its `upgrade 0` floor, so the two end together. Written once: a Slowed
 * already carrying feet keeps the larger.
 *
 * @param {ActiveEffect} effect  the Slowed's own effect, on a creature this client may write
 * @param {{feet: number, source?: string}} o
 * @returns {Promise<ActiveEffect|null>}
 */
export async function addSlowedFeet(effect, { feet = 0, source = "" } = {}) {
  const n = Math.max(0, Math.trunc(Number(feet)) || 0);
  if (!effect || !(n > 0)) return null;
  const held = Math.max(0, Math.trunc(Number(effect.flags?.["azeroth-rpg"]?.[SLOWED_FEET_FLAG]?.feet)) || 0);
  if (held >= n) return effect;
  const own = (effect.system?.toObject?.().changes ?? effect.system?.changes ?? [])
    .filter(c => !(c?.key === "system.speed" && (c.type === "add" || c.type === "upgrade")))
    .map(c => ({ ...c }));
  return effect.update({
    "system.changes": [...own, ...speedDropChanges(n)],
    [`flags.azeroth-rpg.${SLOWED_FEET_FLAG}`]: { feet: n, source: String(source ?? "") }
  });
}

/** Here, where this client may write the creature. */
async function dropHere({ victim, feet, source, originUuid, span }) {
  const base = Math.max(0, Math.trunc(Number(feet)) || 0);
  // The dropper's Permafrost (D-778), on a drop it lays at all.
  const n = base > 0 ? base + permafrostFeet(originUuid) : 0;
  if (!(n > 0)) return { name: victim.name, feet: 0, landed: false };
  const stale = (victim.effects ?? []).filter(e => {
    const held = e.flags?.["azeroth-rpg"]?.[SPEED_DROP_FLAG] ?? null;
    return held && String(held.source ?? "") === String(source ?? "") && (e.origin ?? null) === (originUuid ?? null);
  }).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [dropData({ feet: n, source, originUuid, span })]);
  return { name: victim.name, feet: n, landed: Boolean(made) };
}

/** The GM-side handler: the asker must own what struck. Throws with the reason. */
export async function speedDropQueryHandler({ victimUuid = null, feet = 0, source = "", originUuid = null, span = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user) {
    const origin = originUuid ? await fromUuid(originUuid) : null;
    if (origin?.documentName !== "Actor" || !origin.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: origin?.name ?? "" }));
    }
  }
  return dropHere({ victim, feet, source, originUuid, span });
}

/**
 * Drop a creature's Speed by some feet for a span, and say what came of it.
 *
 * @param {{victim: Actor|null, feet: number, source?: string, by?: Actor|null,
 *   span?: {duration: object, start: object}|null, name?: string}} o
 * @returns {Promise<{name: string, feet: number, landed: boolean}>}
 */
export async function laySpeedDrop({ victim = null, feet = 0, source = "", by = null, span = null, name = "" } = {}) {
  if (!victim) return { name, feet: 0, landed: false };
  const originUuid = by?.uuid ?? null;
  try {
    if (victim.isOwner) return await dropHere({ victim, feet, source, originUuid, span });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    return await gm.query(SPEED_DROP_QUERY, { victimUuid: victim.uuid, feet, source, originUuid, span }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name: victim.name, feet: 0, landed: false };
  }
}
