/**
 * **02's DISPEL, WHERE IT TOUCHES THE WORLD** (D-778; the lead, 2026-10-03, on
 * O-157: *"selected Effects, not conditions."*). `rules/dispel.mjs` is the law;
 * this reads a creature's effects into it, ends what the user selected, and posts
 * what 04's Unstable Affliction answers with.
 *
 * - **The read**: every Active Effect on the creature, plain, with the casters a
 *   laid Archmage stands on (07: *no dispel ... touches them*) and the gate each
 *   ongoing effect's warlock sets (04's Everlasting Affliction at rank 2).
 * - **The write**: here, where this client may write the creature, and on the
 *   active GM's client through `CONFIG.queries` where it may not (never
 *   `game.socket`, D-643). The handler asks that the asker own the DISPELLER and
 *   that the dispeller hold 02's Dispel, and judges every id again off the creature
 *   as the GM holds it - a condition, a marked Ward, an aura is never ended
 *   whatever the request says.
 * - **What it answers with**: the effects ended, each with the warlock whose
 *   ongoing effect it was, so 04's Unstable Affliction posts its card on the
 *   creature whose Dispel ended it (`unstableStrikes`).
 *
 * Deleting an effect is enough for everything that rode it: a shape's own hook
 * leaves the shape (D-769), temporary Health ends with the effect that carried it
 * (D-777), a tick or a Ward goes with its effect.
 */

import { AZEROTH } from "../config.mjs";
import { cleanEffectIds, dispelGated, dispelJudgement, dispelOptions, ongoingOwner, spellCasterOf } from "../rules/dispel.mjs";
import { dispelGateFor, unstableFor } from "../rules/class-talents.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { strikeCard } from "./after-blow.mjs";

/** The query an end on a creature this client does not own goes through. */
export const DISPEL_QUERY = "azeroth-rpg.dispel";

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
 * An Active Effect as the law reads it: plain, and switched off where core does
 * not apply it.
 *
 * @param {ActiveEffect} effect
 */
export function plainEffect(effect) {
  return {
    id: effect.id, name: effect.name ?? "", statuses: [...(effect.statuses ?? [])], origin: effect.origin ?? null,
    flags: effect.flags ?? {}, disabled: effect.disabled === true || effect.active === false
  };
}

/**
 * **THE CASTERS A LAID ARCHMAGE STANDS ON** (07's Archmage: *For the duration your
 * spells can be ended only by you*), among the casters of these effects.
 *
 * @param {Array<object>} effects  plain
 * @returns {Set<string>}
 */
export function archmageCasters(effects = []) {
  const out = new Set();
  const asked = new Set();
  for (const e of effects) {
    const caster = spellCasterOf(e);
    if (!caster || asked.has(caster)) continue;
    asked.add(caster);
    const actor = actorAt(caster);
    if ((actor?.effects ?? []).some(x => x.active !== false && x.flags?.["azeroth-rpg"]?.identifier === "archmage")) out.add(caster);
  }
  return out;
}

/**
 * **THE CHOOSER'S ROWS FOR ONE CREATURE** (`rules/dispel.mjs#dispelOptions`), off
 * its effects as they stand.
 *
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function dispelOptionsOn(actor) {
  const effects = (actor?.effects ?? []).map(plainEffect);
  return dispelOptions(effects, { archmage: archmageCasters(effects) });
}

/**
 * **THE GATE EACH SELECTED EFFECT'S WARLOCK SETS** (04's Everlasting Affliction at
 * rank 2), off the warlock's own talents: the effects that wait on a Casting Test,
 * each with its SL.
 *
 * @param {Actor} target
 * @param {string[]} ids  the effects selected
 * @returns {Array<{id: string, sl: number, by: string, owner: string}>}
 */
export function dispelGatesOn(target, ids = []) {
  const want = new Set(ids);
  const effects = (target?.effects ?? []).filter(e => want.has(e.id)).map(plainEffect);
  const gates = {};
  for (const e of effects) {
    const owner = ongoingOwner(e);
    if (!owner || owner in gates) continue;
    const warlock = actorAt(owner);
    gates[owner] = typeof warlock?.takenTalents === "function" ? dispelGateFor(warlock.takenTalents()) : null;
  }
  return dispelGated(effects, gates);
}

/** End them here; the caller has established that this client may. Judged again. */
async function endHere({ target, ids }) {
  const want = new Set(cleanEffectIds(ids));
  const effects = (target.effects ?? []).filter(e => want.has(e.id)).map(plainEffect);
  const archmage = archmageCasters(effects);
  const ended = effects
    .filter(e => !e.disabled && dispelJudgement(e, { archmage }).ok)
    .map(e => ({ id: e.id, name: e.name, owner: ongoingOwner(e) }));
  const gone = ended.map(e => e.id).filter(id => target.effects.has(id));
  if (gone.length) await target.deleteEmbeddedDocuments("ActiveEffect", gone);
  const kept = [...want].filter(id => !ended.some(e => e.id === id)).sort();
  return { name: target.name, ended: ended.filter(e => gone.includes(e.id)), kept };
}

/**
 * The GM-side handler (`DISPEL_QUERY`). Throws with the reason, which travels back
 * to the caller as the refusal.
 */
export async function dispelQueryHandler({ targetUuid = null, dispellerUuid = null, ids = [] } = {}, { user = null } = {}) {
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user) {
    const dispeller = dispellerUuid ? await fromUuid(dispellerUuid) : null;
    if (dispeller?.documentName !== "Actor" || !dispeller.testUserPermission(user, "OWNER")) {
      throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: dispeller?.name ?? "" }));
    }
    if (!dispeller.hasFeature?.("Dispel")) throw new Error(game.i18n.format("AZEROTH.Dispel.NoFeature", { name: dispeller.name }));
  }
  return endHere({ target, ids });
}

/**
 * **END THE EFFECTS SELECTED ON ONE CREATURE**, and say what came of it.
 *
 * @param {{dispeller: Actor, target: Actor|null, ids: string[], name?: string}} o
 * @returns {Promise<{name: string, ended: Array<{id: string, name: string, owner: string|null}>, kept: string[], error?: boolean}>}
 */
export async function endEffects({ dispeller, target, ids = [], name = "" } = {}) {
  if (!target) return { name, ended: [], kept: [...ids], error: true };
  try {
    if (target.isOwner) return await endHere({ target, ids });
    const gm = game.users?.activeGM ?? null;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Dispel.NoGM"));
    const done = await gm.query(DISPEL_QUERY, { targetUuid: target.uuid, dispellerUuid: dispeller?.uuid ?? null, ids: cleanEffectIds(ids) }, { timeout: 15000 });
    return done && typeof done === "object"
      ? { name: done.name ?? target.name, ended: Array.isArray(done.ended) ? done.ended : [], kept: Array.isArray(done.kept) ? done.kept : [] }
      : { name: target.name, ended: [], kept: [...ids], error: true };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name: target.name, ended: [], kept: [...ids], error: true };
  }
}

/**
 * **04's UNSTABLE AFFLICTION** (*A target that ends one of your ongoing effects early
 * takes Fel damage equal to twice your tier per rank*): for each effect a Dispel
 * ended whose warlock holds the talent, a card of Fel damage on the creature whose
 * Dispel ended it, at the warlock's tier - its Apply the table's, its damage met by
 * the dispeller's own Ward (`strikeCard`, Shadowy Apparition's card). One card a
 * warlock, its amount once an effect ended (MY READING, for the lead).
 *
 * @param {{dispeller: Actor, ended: Array<{name: string, owner: string|null}>}} o
 * @returns {Promise<string[]>}  what was posted, in words
 */
export async function unstableStrikes({ dispeller, ended = [] } = {}) {
  const said = [];
  if (!dispeller) return said;
  const byOwner = new Map();
  for (const e of ended) {
    if (!e?.owner) continue;
    byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e.name]);
  }
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  for (const [owner, names] of [...byOwner.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const warlock = actorAt(owner);
    if (typeof warlock?.takenTalents !== "function") continue;
    const row = unstableFor(warlock.takenTalents(), { tier: warlock.system?.tier ?? 1 });
    if (!row) continue;
    const amount = row.amount * names.length;
    const token = dispeller.getActiveTokens?.(true)?.[0] ?? null;
    const targets = token ? targetSnapshots([token]) : [{
      tokenId: null, sceneId: null, actorId: dispeller.id, name: dispeller.name,
      wardBySchool: wardBySchool(dispeller.system?.ward), schoolArmor: {}, immune: dispeller.system?.immune ?? [], vulnerable: dispeller.system?.vulnerable ?? []
    }];
    const posted = await strikeCard({
      holder: warlock, targets, amount, type: row.type, name: row.name, kind: "unstable",
      subtitle: game.i18n.format("AZEROTH.Unstable.Subtitle", { name: dispeller.name }),
      explanation: game.i18n.format("AZEROTH.Unstable.Explanation", { n: row.amount, count: names.length, type: game.i18n.localize(AZEROTH.schools[row.type] ?? row.type) })
    });
    if (posted) said.push(game.i18n.format("AZEROTH.Unstable.Line", { name: dispeller.name, talent: row.name, warlock: warlock.name, n: amount, effects: names.join(", ") }));
  }
  return said;
}
