/**
 * **02's WARD, WHERE IT TOUCHES THE WORLD** (the Priest's level 1 feature, with
 * the five talents that patch it; D-774).
 *
 * *As a Reaction, spend 2 Mana to grant a target Ward 1 of one school until your
 * next turn.* The Use paid and posted a card and laid nothing, so eight talents
 * (Absorption, Aegis Eternal, Atonement, Foresight, Mass Ward, Shield Discipline,
 * Spirit Shell and, through Dispel, Rapture) hung on a feature that did not
 * exist on the creature it warded. It is an Active Effect now:
 *
 * - **What it absorbs**: Ward 1 against the school named, a `final` change on
 *   `system.ward.<school>` (the Ward is derived, D-668), which every mitigation
 *   door already reads - the card's damage off the target snapshot, an area's
 *   tick and a laid tick, and 05 §15's cut to the SL of an effect that deals no
 *   damage. Every school with Aegis Eternal; Shield Discipline's *1 less damage
 *   per rank from every source* rides it on `system.damageReduction` (D-696).
 * - **How long**: *until your next turn* is the PRIEST's, so the span is keyed on
 *   the priest's combatant (`durations.mjs#untilNextTurn(priest)`, Hurricane's
 *   Slowed's shape, D-771). Out of a fight there is no next turn to end on, and
 *   the Use is refused in words before anything is paid (MY READING, for the
 *   lead, D-772's Taunt and D-773's Cloak of Shadows).
 * - **Dispel**: 02's Dispel ends effects by the table's hand - nothing yet ends
 *   one by a door (Rapture's question) - so a laid Ward is an ordinary effect a
 *   GM may delete, and one laid under Aegis Eternal says *cannot be removed by
 *   Dispel* in its own name.
 *
 * One Ward a priest a creature: a second laid by the same priest replaces the
 * first. The write is here where this client may write the creature, and on the
 * active GM's client through `CONFIG.queries` where it may not (never
 * `game.socket`, D-643); the handler asks that the asker own the PRIEST and that
 * the priest hold the feature, and works what the Ward carries out again off the
 * priest's own talents - never off the request.
 *
 * **WHAT A WARDED BLOW DOES** (`afterWardedBlow`, from the one damage door,
 * `AzerothActor#applyDamage`): Atonement's *the target may restore Health equal
 * to your tier* where the Ward prevented damage, and Absorption's *you gain 1 Mana
 * per rank* where it brought the blow to nothing - `rules/class-talents.mjs
 * #wardPrevented` is the judgement, the numbers are the ones the Ward was laid
 * with.
 */

import { AZEROTH } from "../config.mjs";
import { WARD_BASE, WARD_FLAG, wardChanges, wardOptionsFor, wardPrevented, wardSchools } from "../rules/class-talents.mjs";
// D-779: a Ward pressed from an incoming card answers that blow (04's Foresight).
import { foresightDamage } from "../rules/foresight-damage.mjs";
import { markAnswers, mitigatedDamage } from "../rules/reactions.mjs";
import { foresightFor } from "../rules/class-talents.mjs";
import { refuseIceBlockTarget } from "./ice-block-protection.mjs";
import { dispersionRefusal } from '../rules/dispersion.mjs';
import { resolveAttackOperation } from "./attack-resolution-state.mjs";
import { foresightTimingAllows } from "../rules/foresight-timing.mjs";

function wardTargetRefusal(actor) {
  if (refuseIceBlockTarget(actor)) return 'iceBlock';
  const reason = dispersionRefusal(actor, 'target');
  if (reason) globalThis.ui?.notifications?.info?.(game.i18n.localize(reason));
  return reason ? 'dispersion' : null;
}

/** The query a Ward laid on, or Mana returned to, a creature this client does not own goes through. */
export const WARD_QUERY = "azeroth-rpg.priestWard";
const committing = new Map();
const payingPriests = new Set();
const committedContext = (priest, answers, token) => {
  const context = committing.get(token);
  return context?.priest === priest && context.answers.messageId === answers?.messageId
    && context.answers.index === Number(answers?.index) ? context : null;
};

/** An opaque GM-local capability; never accepted from a query payload. */
export function foresightCommitValid(priest, answers, token) {
  return committedContext(priest, answers, token)?.valid() === true;
}

/** Execute the ordinary Ward workflow under the same claim as its delivery. */
async function useForesightHere({ priest, victim, item, answers, school, user }) {
  const clean = cleanAnswers(answers);
  if (!clean || !user?.id || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id
    || item?.parent !== priest || item.type !== "feature" || item.name !== WARD_BASE.feature
    || !priest.testUserPermission(user, "OWNER") || !AZEROTH.schools[school]) return { ok: false, reason: "permission" };
  const { turnBudgetRefusal } = await import("../dice/workflows.mjs");
  const unavailable = turnBudgetRefusal(priest, item.system?.action ?? null);
  if (unavailable) return { ok: false, reason: "budget", refusal: unavailable };
  if (payingPriests.has(priest.uuid)) return { ok: false, reason: "busy" };
  const { message, valid } = foresightContext(priest, victim, clean);
  const eligible = () => valid() && priest.testUserPermission(user, "OWNER") && fromUuidSync(item.uuid) === item;
  payingPriests.add(priest.uuid);
  const token = Symbol("Foresight use"); let posted;
  try {
    const result = await resolveAttackOperation({ message, index: clean.index, targetUuid: victim.uuid, operation: "ward", wardBy: priest.uuid, validate: eligible,
      execute: async ({ valid: stillValid }) => {
        const context = { priest, victim, answers: clean, valid: stillValid, delivered: false };
        committing.set(token, context);
        const { useFeature } = await import("../dice/workflows.mjs");
        if (!stillValid()) return { ok: false };
        posted = await useFeature({ actor: priest, item, targets: [structuredClone(message.flags["azeroth-rpg"].targets[clean.index])],
          foresight: clean, foresightSchool: school, foresightCommit: token });
        return { ok: context.delivered && posted?.documentName === "ChatMessage" && stillValid() };
      } });
    return result.ok ? { ok: true, messageUuid: posted.uuid } : result;
  } finally { committing.delete(token); payingPriests.delete(priest.uuid); }
}

/** Called only after the local chooser and affordability checks. The GM
 * recomputes all prices and spends inside the durable attack claim. */
export async function requestForesightUse({ priest, target, item, answers, school }) {
  try {
    const data = { act: "use", priestUuid: priest.uuid, victimUuid: target.uuid, featureUuid: item.uuid, answers, school };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await wardQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WARD_QUERY, data, { timeout: 60000 });
    if (result?.ok) return await fromUuid(result.messageUuid);
    if (result?.reason === "budget" && result.refusal?.reason) {
      ui.notifications?.warn(game.i18n.format(result.refusal.reason, result.refusal.params ?? {}));
      return null;
    }
  } catch (error) { console.warn("azeroth-rpg | Foresight delivery unconfirmed", error); }
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Foresight.ResolutionRefused"));
  return null;
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

/** The schools a Ward names, in words: *Fire*, *every school*. */
function schoolWords(schools = []) {
  const all = Object.keys(AZEROTH.schools ?? {});
  if (all.length && all.every(s => schools.includes(s))) return game.i18n.localize("AZEROTH.Ward.EverySchool");
  return schools.map(s => game.i18n.localize(AZEROTH.schools[s] ?? s)).join(", ");
}

/**
 * The Wards a creature carries, each with what it was laid with.
 *
 * @param {Actor} actor
 * @returns {Array<{effect: ActiveEffect, ward: object}>}
 */
export function wardsOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const ward = effect.flags?.["azeroth-rpg"]?.[WARD_FLAG] ?? null;
    if (ward && typeof ward === "object" && ward.by) out.push({ effect, ward });
  }
  return out;
}

/** The ward record a query may carry, cleaned: nothing a caller slipped in beside it. */
function cleanWard(w = {}) {
  const schools = (Array.isArray(w.schools) ? w.schools : []).filter(s => AZEROTH.schools?.[s]);
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  const undispellable = w.undispellable === true;
  return {
    schools, amount: Math.max(1, n(w.amount) || 1), reduction: n(w.reduction),
    undispellable, absorb: n(w.absorb), atone: n(w.atone),
    // Who says Dispel cannot end it (04's Aegis Eternal), which 02's Dispel names
    // beside the greyed Ward (`rules/dispel.mjs`, D-778).
    ...(undispellable && typeof w.undispellableBy === "string" && w.undispellableBy ? { undispellableBy: w.undispellableBy.slice(0, 200) } : {})
  };
}

/** A span as a query may carry it: a ready-made `{duration, start}`, or none. */
function cleanSpan(span) {
  return span && typeof span === "object" && span.duration && span.start
    ? { duration: { ...span.duration }, start: { ...span.start } }
    : null;
}

/** The card and row a Ward answers, as a query may carry them, or none (D-779). */
function cleanAnswers(answers) {
  if (!["number", "string"].includes(typeof answers?.index) || String(answers.index).trim() === "") return null;
  const i = Number(answers.index);
  return answers && typeof answers.messageId === "string" && answers.messageId && Number.isInteger(i) && i >= 0
    ? { messageId: answers.messageId, index: i } : null;
}

/**
 * **A WARD THAT ANSWERS THE BLOW IT WAS PRESSED FROM** (04's Foresight; the lead,
 * 2026-10-03, on O-181: *"Yes"*; D-779): the card's damage was worked out against
 * the Ward the creature had as the roll was made. Recompute that recorded hit
 * with this use's Ward delta. Block and halving remain separate actor marks;
 * Apply consumes them after the revised Ward calculation.
 */
async function answerBlow(victim, ward, answers, before, stillValid = () => true) {
  const message = answers ? (game.messages?.get(answers.messageId) ?? null) : null;
  if (!stillValid()) throw new Error("Foresight target changed");
  const rows = structuredClone(message?.flags?.["azeroth-rpg"]?.damageByTarget ?? []);
  const row = rows[answers.index];
  const changed = foresightDamage(row, { schools: ward.schools, before, after: victim.system?.ward ?? {} });
  if (!changed) throw new Error("Foresight damage provenance is unavailable");
  const held = victim.getFlag("azeroth-rpg", "mitigate");
  const mark = markAnswers(held, message.id) ? held : null;
  const to = mitigatedDamage(changed.resolution.damage, mark);
  const prevented = (row.foresightPrevented ?? 0) + changed.prevented;
  rows[answers.index] = { ...row, ...changed.resolution, foresightPrevented: prevented,
    reaction: mark?.reaction ?? "ward", to, mitigated: prevented + changed.resolution.damage - to };
  const updated = await message.update({ "flags.azeroth-rpg.damageByTarget": rows });
  if (!stillValid()) throw new Error("Foresight target changed");
  if (!updated || JSON.stringify(message.flags?.["azeroth-rpg"]?.damageByTarget?.[answers.index]) !== JSON.stringify(rows[answers.index]))
    throw new Error("Foresight mitigation was not confirmed");
  return changed.prevented;
}

/** Current card identity, shared by pre-payment admission and the locked writer. */
function foresightContext(priest, victim, answers) {
  const message = game.messages?.get(answers.messageId);
  const target = () => {
    const row = message?.flags?.["azeroth-rpg"]?.targets?.[answers.index];
    return row?.sceneId && row?.tokenId ? fromUuidSync(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
      : !row?.sceneId && !row?.tokenId && row?.actorId ? game.actors.get(row.actorId) : null;
  };
  const valid = () => {
    const flags = message?.flags?.["azeroth-rpg"], row = flags?.damageByTarget?.[answers.index];
    return message?.documentName === "ChatMessage" && flags?.kind === "attack" && !flags.parry && !flags.notAttack
      && fromUuidSync(priest.uuid) === priest && fromUuidSync(victim.uuid) === victim && target() === victim
      && priest.hasFeature?.("Ward") === true
      && foresightTimingAllows(foresightFor(priest.takenTalents?.() ?? [])?.rank,
        message.getFlag("azeroth-rpg", "attackResolution")?.damageRevealed)
      && row?.hit === true && row.withdrawn !== true && Number.isFinite(row.damage) && row.damage >= 0
      && foresightDamage(row) !== null;
  };
  return { message, valid };
}

/** Read-only admission; it does not reserve the attack or replace the GM lock.
 * The private continuation also checks its active GM claim before spending. */
export function foresightAdmission({ priest, target, answers, commit = null } = {}) {
  const clean = cleanAnswers(answers);
  if (!clean) return "answer";
  if (!game.users?.activeGM) return "noGM";
  if (!priest?.isOwner || !target) return "target";
  if (commit !== null) {
    const context = committedContext(priest, clean, commit);
    return context?.victim === target && context.valid() ? null : "commit";
  }
  const { message, valid } = foresightContext(priest, target, clean);
  if (!valid()) return "changed";
  const state = message.getFlag("azeroth-rpg", "attackResolution");
  if (state?.version !== 1 || !Array.isArray(state.targets)) return "unknownDelivery";
  if (state.targets[clean.index]?.targetUuid !== target.uuid) return "targetChanged";
  if (state.targets.some(row => !["pending", "applied", "phased"].includes(row?.stage))) return "reconcile";
  if (state.targets[clean.index].stage !== "pending") return "resolved";
  if (state.targets[clean.index].wardedBy?.includes(priest.uuid)) return "alreadyWarded";
  const protection = wardTargetRefusal(target);
  if (protection) return protection;
  return null;
}

/** Lay it here; the caller has established that this client may. */
async function layHere({ priest, victim, ward, span, img = null, description = "", answers = null, commit = null }) {
  if (!answers) return layWardEffect({ priest, victim, ward, span, img, description });
  const protection = wardTargetRefusal(victim);
  if (protection) return { name: victim.name, landed: false, reason: protection, answered: 0 };
  if (commit !== null) {
    const context = committedContext(priest, answers, commit);
    if (context?.victim !== victim || context.delivered || !context.valid()) return { name: victim.name, landed: false, reason: "commit", answered: 0 };
    const landed = await layWardEffect({ priest, victim, ward, span, img, description, answers, stillValid: context.valid });
    context.delivered = landed.landed === true;
    return landed;
  }
  const { message, valid } = foresightContext(priest, victim, answers);
  let landed;
  const resolution = await resolveAttackOperation({ message, index: answers.index, targetUuid: victim.uuid, operation: "ward", wardBy: priest.uuid, validate: valid,
    execute: async ({ valid: stillValid }) => {
      landed = await layWardEffect({ priest, victim, ward, span, img, description, answers, stillValid });
      return { ok: landed.landed === true };
    } });
  return resolution.ok ? landed : { name: victim.name, landed: false, reason: resolution.reason, answered: 0 };
}

async function layWardEffect({ priest, victim, ward, span, img = null, description = "", answers = null, stillValid = () => true }) {
  let protection = wardTargetRefusal(victim);
  if (protection) return { name: victim.name, landed: false, reason: protection, answered: 0 };
  const before = answers ? structuredClone(victim.system?.ward ?? {}) : null;
  const stale = (victim.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[WARD_FLAG]?.by === priest.uuid).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  protection = wardTargetRefusal(victim);
  if (protection) return { name: victim.name, landed: false, reason: protection, answered: 0 };
  if (stale.some(id => (victim.effects ?? []).some(effect => effect.id === id)))
    throw new Error("The previous Ward could not be removed. No replacement was created; ask the GM to review the existing Ward.");
  if (!stillValid()) throw new Error("Foresight target changed");
  const name = game.i18n.format(ward.undispellable ? "AZEROTH.Ward.EffectNameAegis" : "AZEROTH.Ward.EffectName", {
    schools: schoolWords(ward.schools), name: priest.name
  });
  const [made] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name, img: img ?? "icons/svg/shield.svg", origin: priest.uuid, description,
    system: { changes: wardChanges({ schools: ward.schools, amount: ward.amount, reduction: ward.reduction }) },
    ...(span ?? {}),
    flags: { "azeroth-rpg": { [WARD_FLAG]: { by: priest.uuid, priestName: priest.name, ...ward } } }
  }]);
  if (!stillValid()) throw new Error("Foresight target changed");
  protection = wardTargetRefusal(victim);
  if (protection) return { name: victim.name, landed: Boolean(made), reason: protection, answered: 0 };
  const answered = made && answers ? await answerBlow(victim, ward, answers, before, stillValid) : 0;
  return { name: victim.name, landed: Boolean(made), reason: made ? null : "refused", answered };
}

/**
 * Lay a priest's Ward on one creature, and say what came of it.
 *
 * @param {object} o
 * @param {Actor} o.priest
 * @param {Actor|null} o.target
 * @param {{schools: string[], amount?: number, reduction?: number, undispellable?: boolean, absorb?: number, atone?: number}} o.ward
 * @param {object|null} o.span  `durations.mjs#untilNextTurn(priest)`
 * @param {string|null} [o.img]
 * @param {string} [o.description]
 * @param {string} [o.name]  the target's name on the card, for a creature that is gone
 * @returns {Promise<{name: string, landed: boolean, reason: string|null}>}
 */
export async function layWard({ priest, target, ward, span = null, img = null, description = "", name = "", answers = null, commit = null } = {}) {
  if (!target) return { name, landed: false, reason: "gone" };
  const clean = cleanWard(ward);
  if (!clean.schools.length) return { name: target.name, landed: false, reason: "refused" };
  // The card a Foresight Ward answers (D-779).
  const answering = cleanAnswers(answers);
  if (answers !== null && !answering) return { name: target.name, landed: false, reason: "answer", answered: 0 };
  try {
    const authoritative = game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
    if (target.isOwner && (!answering || authoritative)) return await layHere({ priest, victim: target, ward: clean, span: cleanSpan(span), img, description, answers: answering, commit });
    const gm = game.users?.activeGM ?? null;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Ward.NoGM"));
    const done = await gm.query(WARD_QUERY, {
      act: "lay", priestUuid: priest.uuid, victimUuid: target.uuid, ward: clean, span: cleanSpan(span), img, description, answers: answering
    }, { timeout: 15000 });
    return done && typeof done === "object" ? { name: done.name ?? target.name, landed: done.landed === true, reason: done.reason ?? null, answered: Math.max(0, Math.trunc(Number(done.answered)) || 0) } : { name: target.name, landed: false, reason: "error" };
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { name: target.name, landed: false, reason: "error" };
  }
}

/** Mana back into the priest's pool, never past its maximum, here. Answers what landed. */
async function absorbHere(priest, amount) {
  if (refuseIceBlockTarget(priest)) return 0;
  const pool = (priest.poolSnapshot?.() ?? []).find(p => p.name === "mana") ?? null;
  if (!pool || !(amount > 0)) return 0;
  const value = Math.min(pool.max, pool.value + amount);
  if (value <= pool.value) return 0;
  await priest.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  return value - pool.value;
}

/**
 * The GM-side handler (`WARD_QUERY`). Throws with the reason, which travels back
 * to the caller.
 *
 * - `lay`: the asker must own the PRIEST, and the priest hold 02's Ward;
 * - `absorb`: the asker must own the creature STRUCK - it was their client that
 *   wrote the blow - and that creature carry this priest's Ward laid with
 *   Absorption's Mana. Judged again off the world as the GM holds it.
 */
export async function wardQueryHandler({ act = "lay", priestUuid = null, victimUuid = null, featureUuid = null, school = null, ward = {}, span = null, img = null, description = "", answers = null } = {}, { user = null } = {}) {
  const priest = priestUuid ? await fromUuid(priestUuid) : null;
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  if (priest?.documentName !== "Actor" || victim?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (act === "absorb") {
    if (user && !victim.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: victim.name }));
    const held = wardsOn(victim).find(w => w.ward.by === priest.uuid && (Number(w.ward.absorb) || 0) > 0) ?? null;
    if (!held) return { gained: 0 };
    // The Mana is worked out again off the PRIEST's own talents: the Ward's record
    // sits on a creature the asker owns, so it is the request's word, not the rule.
    const mana = wardOptionsFor(priest.takenTalents?.() ?? [], { tier: priest.system?.tier ?? 1 }).absorb;
    return { gained: await absorbHere(priest, mana) };
  }
  if (user && !priest.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: priest.name }));
  if (!priest.hasFeature?.("Ward")) throw new Error(game.i18n.format("AZEROTH.Ward.NoFeature", { name: priest.name }));
  if (act === "use") return useForesightHere({ priest, victim, item: featureUuid ? await fromUuid(featureUuid) : null, answers, school, user });
  // What the Ward carries is worked out again off the priest's own talents; the
  // request names only the school the chooser picked.
  const asked = cleanWard(ward);
  const opts = wardOptionsFor(priest.takenTalents?.() ?? [], { tier: priest.system?.tier ?? 1 });
  const schools = wardSchools({ chosen: asked.schools[0] ?? null, everySchool: opts.everySchool, schools: Object.keys(AZEROTH.schools ?? {}) });
  const rebuilt = {
    schools, amount: WARD_BASE.amount, reduction: opts.reduction, undispellable: opts.undispellable, absorb: opts.absorb, atone: opts.atone,
    undispellableBy: (opts.by?.undispellable ?? []).join(", ")
  };
  if (!schools.length) return { name: victim.name, landed: false, reason: "refused" };
  // A Ward answering a card's blow is the priest's Foresight's to press (D-779),
  // judged again here off the priest's own talents.
  const answering = cleanAnswers(answers);
  if (answers !== null && !answering) return { name: victim.name, landed: false, reason: "answer", answered: 0 };
  if (answering && !foresightFor(priest.takenTalents?.() ?? [])) return { name: victim.name, landed: false, reason: "foresight", answered: 0 };
  // A player's answering Ward must pay through the Use coordinator, not the
  // low-level ordinary-Ward writer. GM fixture/manual writes remain available.
  if (answering && !user?.isGM) return { name: victim.name, landed: false, reason: "paymentRequired", answered: 0 };
  return layHere({ priest, victim, ward: rebuilt, span: cleanSpan(span), img, description, answers: answering });
}

/**
 * **WHAT A BLOW ON A WARDED CREATURE DOES FOR THE PRIEST WHO WARDED IT** (04's
 * Atonement and Absorption; D-774), once per Ward a blow, from the one damage
 * door after the Health is written. Guarded by the caller: bookkeeping beyond
 * the blow never cancels it.
 *
 * **Only this priest's own Ward is credited** (the architect's review of D-774):
 * the creature's whole Ward in the blow's school is read off it as it stands at
 * the Apply, and the whole standing reduction is the door's own, so
 * `wardPrevented` can ask whether this Ward took what nothing else would have.
 *
 * **AND A SECOND AMOUNT'S OWN LANE** (D-777): a blow carrying a typed second
 * amount (`parts`) was met by the Ward of THAT type too, so the Ward prevented
 * damage where it took anything off any amount it covers - judged lane by lane,
 * and credited once a blow.
 *
 * @param {{target: Actor, type?: string|null, wardTook?: number, standingTook?: number, standing?: number, dealt?: number,
 *   parts?: Array<{type: string, wardTook?: number}>}} o
 *   `standing` the creature's whole standing reduction on this blow
 * @returns {Promise<Array<string>>}  what it did, in words
 */
export async function afterWardedBlow({ target, type = null, wardTook = 0, standingTook = 0, standing = 0, dealt = 0, parts = [] } = {}) {
  const said = [];
  const wardIn = t => (t ? (Number(target?.system?.ward?.[t]) || 0) : 0);
  const lanes = [{ type, wardTook }, ...(parts ?? []).filter(p => p?.type).map(p => ({ type: p.type, wardTook: Math.max(0, Math.trunc(Number(p.wardTook)) || 0) }))];
  for (const { ward } of wardsOn(target)) {
    if (!((Number(ward.atone) || 0) > 0 || (Number(ward.absorb) || 0) > 0)) continue;
    const judged = lanes
      .map((lane, i) => wardPrevented({
        type: lane.type, schools: ward.schools ?? [], amount: ward.amount ?? 1, wardTook: lane.wardTook, wardTotal: wardIn(lane.type),
        // The standing reduction is the blow's once, read on its own lane.
        standingTook: i === 0 ? standingTook : 0, standingTotal: i === 0 ? standing : 0, reduction: i === 0 ? (ward.reduction ?? 0) : 0, dealt
      }))
      .reduce((a, b) => ({ prevented: a.prevented || b.prevented, toNothing: a.toNothing || b.toNothing }), { prevented: false, toNothing: false });
    if (!judged.prevented) continue;
    const priest = actorAt(ward.by);
    // Atonement: the warded creature restores the priest's tier, given by the
    // priest (10's rungs read a heal from somebody else), on this client - which
    // has just written the creature's Health and may write it again.
    if ((Number(ward.atone) || 0) > 0 && target.isOwner) {
      const before = target.system?.health?.value ?? 0;
      await target.applyHealing(Math.trunc(Number(ward.atone)), { from: priest ?? null });
      const healed = Math.max(0, (target.system?.health?.value ?? before) - before);
      said.push(game.i18n.format("AZEROTH.Ward.Atoned", { name: target.name, n: healed, priest: ward.priestName ?? priest?.name ?? "" }));
    }
    // Absorption: the priest's Mana, where the Ward brought the blow to nothing.
    if (judged.toNothing && (Number(ward.absorb) || 0) > 0 && priest) {
      let gained = 0;
      if (priest.isOwner) gained = await absorbHere(priest, Math.trunc(Number(ward.absorb)));
      else {
        const gm = game.users?.activeGM ?? null;
        if (gm) {
          try {
            gained = Number((await gm.query(WARD_QUERY, { act: "absorb", priestUuid: priest.uuid, victimUuid: target.uuid }, { timeout: 15000 }))?.gained) || 0;
          } catch (err) {
            ui.notifications?.warn(err.message);
          }
        }
      }
      if (gained > 0) said.push(game.i18n.format("AZEROTH.Ward.Absorbed", { priest: priest.name, n: gained }));
    }
  }
  for (const line of said) ui.notifications?.info(line);
  return said;
}
