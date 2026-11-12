/**
 * **DECAY, WRITTEN** (07 §9, D-865). `rules/decay.mjs` is the law; this is the ONE
 * writer of the laid effect, on a character and a creature alike:
 *
 * - one Active Effect a creature, found by its `flags.azeroth-rpg.decay` and updated in
 *   place - the higher X kept and the minute started again, or the two added where a
 *   talent says so (`combineDecay`) - else created;
 * - named *Decay X*, drawn on the token (`showIcon: ALWAYS`), its changes the `final`
 *   subtract and the 0 floor on each location the creature has (`decayChanges`);
 * - spanned by 1 minute (`durations.mjs#minuteSpan`: ten rounds in a started fight, the
 *   world's minute out of one), or by nothing where it lasts until a Short Rest, which
 *   `AzerothActor#clearRestDecay` ends;
 * - written here where this client owns the creature, else through `CONFIG.queries` on
 *   the active GM's client (the hit-mark door's shape, never `game.socket`), the handler
 *   checking the asker owns the hand that laid it.
 *
 * Every door that lays one asks `rules/gm-writes.mjs#gmAbsentFor` before anything is
 * spent: the cast's refusals (`dice/workflows.mjs#castSpell`) read `readSpellDecay`.
 */

// 04's Erosion: the caster's talents scale every Decay the caster lays (stage 2b).
import { decayScaleFor } from "../rules/talent-effects.mjs";
import { DECAY_FLAG, NO_SPAN, apLocations, cleanDecay, combineDecay, decayChanges, decayResync, decayValue } from "../rules/decay.mjs";
import { minuteSpan } from "./durations.mjs";

export const DECAY_QUERY = "azeroth-rpg.decay";

/** The icon the effect wears, on the sheet and on the token. */
export const DECAY_ICON = "icons/svg/degen.svg";

/** The creature's Decay effect, if it carries one. */
export function decayEffectOf(actor) {
  return [...(actor?.effects ?? [])].find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]) ?? null;
}

/** The X the creature carries now, 0 with none (what Heavy Hours and Collapse of Hours read). */
export function decayOn(actor) {
  const effect = decayEffectOf(actor);
  return effect && !effect.disabled ? decayValue(effect.flags["azeroth-rpg"][DECAY_FLAG]) : 0;
}

function words(value) {
  return {
    name: game.i18n.format("AZEROTH.Decay.Name", { n: value }),
    text: game.i18n.format("AZEROTH.Decay.Text", { n: value })
  };
}

/** Here, where this client may write the creature. */
async function decayHere({ victim, value, by = null, source = "", until = "", adds = false, cap = null }) {
  const held = decayEffectOf(victim);
  const heldFlag = held?.flags?.["azeroth-rpg"]?.[DECAY_FLAG] ?? null;
  const next = combineDecay(heldFlag, { value, until }, { adds, cap });
  if (!(next.value > 0)) return { name: victim.name, landed: false, value: decayValue(heldFlag) };
  const w = words(next.value);
  const span = next.until === "shortRest" ? null : minuteSpan(victim, 1);
  const flag = cleanDecay({ value: next.value, by, source, until: next.until });
  const data = {
    name: w.name,
    img: DECAY_ICON,
    origin: by ?? null,
    description: `<p>${w.text}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: decayChanges(next.value, apLocations(victim.system?.ap ?? {})) },
    // **A DECAY UNTIL A SHORT REST CARRIES NO SPAN AT ALL** (the 2a review, M3): written
    // explicitly empty, so an upgrade of a one-minute Decay to Hour of Dust's keeps no
    // minute that would end it early (`rules/decay.mjs#NO_SPAN`).
    ...(span?.duration && span?.start ? { duration: { ...span.duration }, start: { ...span.start } } : { duration: { ...NO_SPAN.duration } }),
    flags: { "azeroth-rpg": { [DECAY_FLAG]: flag, harmful: true } }
  };
  if (held) {
    // An update clears the old start too; a create has none to clear.
    await held.update(span ? data : { ...data, start: NO_SPAN.start });
    return { name: victim.name, landed: true, value: next.value, effectId: held.id };
  }
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
  return { name: victim.name, landed: Boolean(made), value: next.value, effectId: made?.id ?? null };
}

/** The GM-side handler: the asker must own the hand that laid it. Throws with the reason. */
export async function decayQueryHandler({ victimUuid = null, byUuid = null, value = 0, source = "", until = "", adds = false, cap = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (!victim || victim.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !user.isGM) {
    const by = byUuid ? await fromUuid(byUuid) : null;
    if (by?.documentName !== "Actor" || !by.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
    }
  }
  return decayHere({ victim, value, by: byUuid, source, until, adds, cap });
}

/**
 * **LAY DECAY X ON A CREATURE**, and say what came of it. A refusal is said and comes
 * back as nothing landed.
 *
 * @param {{victim: Actor|null, value: number, by?: Actor|null, source?: string,
 *   until?: ""|"shortRest", adds?: boolean, cap?: number|null}} o
 * @returns {Promise<{name: string, landed: boolean, value: number}>}
 */
export async function layDecay({ victim = null, value = 0, by = null, source = "", until = "", adds = false, cap = null, scaled = false } = {}) {
  // **04's EROSION ON EVERY DECAY A SPELL OF THE CASTER'S LAYS** (*that Decay is 1 higher. At rank
  // 2 your Decay adds to any Decay the creature already carries, to no more than your tier*;
  // stage 2b): the caster's talents scale it here, the one writer, so Withering Sands' area,
  // Hourstrike's blow and Scouring Veil's retaliation take it as the cast's hit does. A door
  // that scaled it already says so (`scaled`).
  if (!scaled && by && typeof by.takenTalents === "function") {
    const scale = decayScaleFor(by.takenTalents(), { tier: by.system?.tier ?? 1 });
    if (scale.by.length) {
      value = (Math.max(0, Math.trunc(Number(value)) || 0)) + scale.more;
      adds = adds || scale.adds;
      cap = cap ?? scale.cap;
    }
  }
  const x = Math.max(0, Math.trunc(Number(value)) || 0);
  if (!victim || !(x > 0)) return { name: victim?.name ?? "", landed: false, value: 0 };
  try {
    if (victim.isOwner) return await decayHere({ victim, value: x, by: by?.uuid ?? null, source, until, adds, cap });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
    const done = await gm.query(DECAY_QUERY, { victimUuid: victim.uuid, byUuid: by?.uuid ?? null, value: x, source, until, adds, cap }, { timeout: 15000 });
    return done && typeof done === "object" ? done : { name: victim.name, landed: false, value: 0 };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name: victim.name, landed: false, value: 0 };
  }
}

/**
 * **DECAY FOLLOWS THE LOCATIONS THE CREATURE HAS NOW** (the 2a review, L4): the effect's
 * changes name each Armor Point location the creature had when it was laid, so a location
 * it gains later - a shape left, a creature's Armor Points edited from none - would escape.
 * Re-laid in place (`rules/decay.mjs#decayResync`) on the active GM's client whenever what
 * the creature wears, its stored Armor Points or its shape moves. Answers whether it wrote.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function resyncDecay(actor) {
  if (!actor || game.users?.activeGM?.isSelf !== true) return false;
  const effect = decayEffectOf(actor);
  if (!effect) return false;
  const changes = decayResync(effect.flags["azeroth-rpg"][DECAY_FLAG], effect.system?.changes ?? [], apLocations(actor.system?.ap ?? {}));
  if (!changes) return false;
  await effect.update({ "system.changes": changes });
  return true;
}

/** The hooks that re-lay Decay on a creature whose locations may have moved. Registered at `init`. */
export function registerDecayHooks() {
  const nudge = actor => { if (actor?.documentName === "Actor" && decayEffectOf(actor)) resyncDecay(actor).catch(err => console.warn("azeroth-rpg | Decay resync", err)); };
  const armor = item => (item?.type === "armor" ? item.parent : null);
  Hooks.on("createItem", item => nudge(armor(item)));
  Hooks.on("deleteItem", item => nudge(armor(item)));
  Hooks.on("updateItem", (item, changes) => { if (foundry.utils.hasProperty(changes ?? {}, "system.equipped")) nudge(armor(item)); });
  Hooks.on("updateActor", (actor, changes) => { if (foundry.utils.hasProperty(changes ?? {}, "system.ap")) nudge(actor); });
  // A shape taken or left moves the locations (`flags.azeroth-rpg.shape`, D-769).
  const shaped = effect => (effect?.flags?.["azeroth-rpg"]?.shape && effect.parent?.documentName === "Actor" ? effect.parent : null);
  Hooks.on("createActiveEffect", effect => nudge(shaped(effect)));
  Hooks.on("deleteActiveEffect", effect => nudge(shaped(effect)));
}

/** The card's line for one laying, in words. */
export function decayLine(result, { spell = "" } = {}) {
  return game.i18n.format(result?.landed ? "AZEROTH.Decay.Laid" : "AZEROTH.Decay.NotLaid", { name: result?.name ?? "", n: result?.value ?? 0, spell });
}
