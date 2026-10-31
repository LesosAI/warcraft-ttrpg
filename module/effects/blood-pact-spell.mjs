/** Warlock spell transfer; unrelated to the imp's Blood Pact ability. */
import { bloodPactAuthority, bloodPactTransfer } from "../rules/blood-pact-spell.mjs";
import { castingManaPool, grantingClass } from "../rules/casting.mjs";
import { bondOf } from "../documents/bound.mjs";
import { sustainedSpellLive } from "./sustained-spells.mjs";
import { feetApart } from "../canvas/footprints.mjs";

const SCOPE = "azeroth-rpg";
export const BLOOD_PACT_SPELL_PREPARE = "azeroth-rpg.bloodPactSpellPrepare";
export const BLOOD_PACT_SPELL_RESOLVE = "azeroth-rpg.bloodPactSpellResolve";
export const BLOOD_PACT_SPELL_RECEIPT = "bloodPactSpellResolution";
export const BLOOD_PACT_SPELL_REVIEW = "azeroth-rpg.bloodPactSpellReview";
const REVIEW = "bloodPactSpellReview";
const CLAIM = "bloodPactSpellClaim";
let queue = Promise.resolve();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refuse = reason => ({ ok: false, reason });
const tokenAt = row => row?.sceneId && row?.tokenId ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId) : null;
const actorAt = row => row?.sceneId || row?.tokenId
  ? (tokenAt(row)?.actor?.id === row.actorId ? tokenAt(row).actor : null) : game.actors?.get(row?.actorId);

function snapshot(caster, donor, spell, targets, source) {
  const talents = caster.takenTalents?.() ?? [];
  const talent = talents.some(t => t.identifier === "blood-pact" && t.className === "Warlock" && t.taken > 0);
  const boundFeatureIds = [...(caster.items ?? [])].filter(i => i.type === "feature"
    && i.system?.identifier === "bound-demon" && i.system.className === "Warlock"
    && i.system.source?.document === "02-CHARACTER-OPTIONS").map(i => i.id);
  const commands = [...(donor.effects ?? [])].map(e => {
    const f = e.flags?.[SCOPE] ?? {};
    return { identifier: f.identifier, origin: e.origin, cast: f.cast, effectId: e.id,
      sustained: f.sustained, statuses: [...(e.statuses ?? [])],
      live: e.active !== false && !e.disabled && !e.isSuppressed
        && !(typeof e.duration?.remaining === "number" && e.duration.remaining <= 0) && sustainedSpellLive(e) };
  });
  const grant = grantingClass((caster.classItems ?? []).map(c => ({ itemId: c.id,
    schools: c.system?.schools ?? [], castingAbility: c.system?.castingAbility ?? null })), spell.system.school);
  const pools = caster.poolSnapshot?.() ?? [];
  const selected = castingManaPool({ creature: caster.type === "npc", powers: caster.system.powers ?? [],
    snapshot: pools, grantItemId: grant?.itemId ?? null });
  const pool = selected ? pools.find(p => p.kind === "power" && p.itemId === selected.itemId && p.name === selected.name) : null;
  let origin = source ? tokenAt(source) : null;
  const target = tokenAt(targets[0]);
  if (source && (!origin || origin.actor !== caster)) return null;
  if (!origin && target) {
    const candidates = [...target.parent.tokens].filter(t => t.actor === caster);
    if (candidates.length > 1) return null;
    origin = candidates[0] ?? null;
  }
  let distance = null;
  if (origin && target) {
    if (origin.parent?.id !== target.parent?.id || origin._source?.level !== target._source?.level) return null;
    distance = feetApart(origin, target);
    if (!Number.isFinite(distance)) return null;
  }
  return { casterUuid: caster.uuid, talent, boundFeatureIds, pool, distance,
    donor: { uuid: donor.uuid, creatureType: donor.system.creatureType,
      health: donor.system.health?.value, bond: bondOf(donor), commands } };
}

function context({ casterUuid, spellUuid, targets, source }, user) {
  if (!writer()) return refuse("authority");
  const caster = resolve(casterUuid), spell = resolve(spellUuid);
  if (!user?.id || !caster?.testUserPermission(user, "OWNER")) return refuse("permission");
  if (spell?.type !== "spell" || spell.system?.identifier !== "blood-pact") return refuse("spell");
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const donor = actorAt(targets[0]);
  if (!donor || !(caster.system.health?.value > 0)) return refuse("target");
  const state = snapshot(caster, donor, spell, targets, source);
  if (!state) return refuse("range");
  return { ok: true, caster, donor, spell, state };
}

export async function prepareBloodPactSpell(payload = {}, { user } = {}) {
  const ctx = context(payload, user);
  if (!ctx.ok) return ctx;
  if (ctx.caster.getFlag(SCOPE, CLAIM) || ctx.donor.getFlag(SCOPE, CLAIM)) return refuse("reconcile");
  const plan = bloodPactTransfer(ctx.state);
  return plan.ok ? { ...plan, donorName: ctx.donor.name } : plan;
}

async function request(query, payload, handler) {
  const gm = game.users?.activeGM;
  if (!gm) return refuse("authority");
  try { return gm.id === game.user.id ? await handler(payload, { user: game.user }) : await gm.query(query, payload); }
  catch { return refuse("uncertain"); }
}
export const requestBloodPactSpellPreparation = (caster, spell, targets, source) => request(BLOOD_PACT_SPELL_PREPARE,
  { casterUuid: caster.uuid, spellUuid: spell.uuid, targets, source }, prepareBloodPactSpell);
export const requestBloodPactSpellResolution = card => request(BLOOD_PACT_SPELL_RESOLVE, { messageId: card.id }, resolveBloodPactSpell);
export const requestBloodPactSpellReview = (card, expected) => request(BLOOD_PACT_SPELL_REVIEW,
  { messageId: card.id, expected, acknowledged: true }, reviewBloodPactSpell);

const identity = card => {
  const f = card?.flags?.[SCOPE];
  return JSON.stringify({ kind: f?.kind, identifier: f?.identifier, cast: f?.cast, caster: f?.caster,
    spellUuid: f?.spellUuid, targets: f?.targets, source: f?.source, success: f?.success, prepared: f?.bloodPactSpell });
};

/** Claim both actors and the card before spending donor Health. Never replay a
 * partial receipt, even if a write succeeded but its acknowledgement was lost. */
export async function resolveBloodPactSpell({ messageId } = {}, { user } = {}) {
  const run = async () => {
    const card = game.messages?.get(messageId), f = card?.flags?.[SCOPE];
    if (!writer() || f?.kind !== "spell" || f.identifier !== "blood-pact" || f.success !== true
      || !f.cast || !f.bloodPactSpell?.ok) return refuse("card");
    if (card.getFlag(SCOPE, REVIEW)?.stage === "complete") return { ok: true, already: true, reviewed: true };
    const payload = { casterUuid: f.caster, spellUuid: f.spellUuid, targets: f.targets, source: f.source };
    const ctx = context(payload, user);
    if (!ctx.ok) return ctx;
    const { caster, donor } = ctx;
    if (!card.author?.isGM && !caster.testUserPermission(card.author, "OWNER")) return refuse("author");
    const signature = identity(card);
    const prior = card.getFlag(SCOPE, BLOOD_PACT_SPELL_RECEIPT);
    const claim = { messageId, identity: signature };
    const current = () => {
      const next = context(payload, user);
      return next.ok && next.caster === caster && next.donor === donor && game.messages.get(messageId) === card
        && (card.author?.isGM || caster.testUserPermission(card.author, "OWNER"))
        && identity(card) === signature ? next : null;
    };
    const cleanup = async () => {
      for (const actor of [donor, caster]) {
        if (!current()) return false;
        if (same(actor.getFlag(SCOPE, CLAIM), claim)) await actor.unsetFlag(SCOPE, CLAIM);
        if (same(actor.getFlag(SCOPE, CLAIM), claim)) return false;
      }
      return true;
    };
    try {
      if (prior) {
        if (prior.stage !== "complete" || prior.identity !== signature) return refuse("reconcile");
        return await cleanup() ? { ok: true, already: true, plan: prior.plan } : refuse("uncertain");
      }
      if (caster.getFlag(SCOPE, CLAIM) || donor.getFlag(SCOPE, CLAIM)) return refuse("reconcile");
      const plan = bloodPactTransfer(ctx.state);
      if (!plan.ok) return plan;
      const prepared = f.bloodPactSpell;
      if (prepared.donorUuid !== donor.uuid || !same(prepared.authority, plan.authority)
        || prepared.pool?.itemId !== plan.pool.itemId || prepared.pool?.name !== plan.pool.name) return refuse("changed");
      const matches = (health, mana) => {
        const next = current();
        return next && same(bloodPactAuthority(next.state), plan.authority)
          && next.state.donor.health === health && next.state.pool?.value === mana
          && next.state.pool?.max === ctx.state.pool.max && next.state.pool?.itemId === plan.pool.itemId
          && next.state.pool?.name === plan.pool.name
          && (next.state.distance === null || (Number.isFinite(next.state.distance) && next.state.distance >= 0 && next.state.distance <= 30));
      };
      for (const actor of [caster, donor]) {
        if (!matches(plan.health.before, plan.pool.before)) return refuse("changed");
        if (actor.getFlag(SCOPE, CLAIM)) return refuse("reconcile");
        await actor.setFlag(SCOPE, CLAIM, claim);
        if (!same(actor.getFlag(SCOPE, CLAIM), claim)) return refuse("uncertain");
      }
      const claimed = () => same(caster.getFlag(SCOPE, CLAIM), claim) && same(donor.getFlag(SCOPE, CLAIM), claim);
      const record = async stage => {
        if (!current() || !claimed()) return false;
        const receipt = { stage, identity: signature, plan };
        await card.setFlag(SCOPE, BLOOD_PACT_SPELL_RECEIPT, receipt);
        return current() && claimed() && same(card.getFlag(SCOPE, BLOOD_PACT_SPELL_RECEIPT), receipt);
      };
      if (!await record("healthApplying") || !matches(plan.health.before, plan.pool.before)) return refuse("uncertain");
      await donor.update({ "system.health.value": plan.health.after });
      if (!matches(plan.health.after, plan.pool.before) || !claimed()) return refuse("uncertain");
      if (!await record("manaApplying") || !matches(plan.health.after, plan.pool.before)) return refuse("uncertain");
      if (plan.pool.restored > 0) await caster.updatePool({ itemId: plan.pool.itemId, kind: "power", value: plan.pool.after });
      if (!matches(plan.health.after, plan.pool.after) || !claimed()) return refuse("uncertain");
      if (!await record("complete")) return refuse("uncertain");
      if (!await cleanup()) return refuse("uncertain");
      return { ok: true, plan };
    } catch { return refuse("uncertain"); }
  };
  const pending = queue.then(run, run);
  queue = pending.then(() => undefined, () => undefined);
  return pending;
}

/** Recovery reads the recorded actors even after a bond, spell or pool is gone.
 * Current amounts are evidence for the GM, never a reason to replay a write. */
export function bloodPactSpellReviewState(card) {
  const f = card?.flags?.[SCOPE];
  if (f?.kind !== "spell" || f.identifier !== "blood-pact" || !f.bloodPactSpell) return null;
  const receipt = card.getFlag(SCOPE, BLOOD_PACT_SPELL_RECEIPT) ?? null;
  const review = card.getFlag(SCOPE, REVIEW) ?? null;
  const plan = receipt?.plan ?? f.bloodPactSpell;
  let original;
  try { original = JSON.parse(receipt?.identity ?? "null"); } catch { original = null; }
  const casterUuid = original?.caster ?? f.caster;
  const donorUuid = plan.donorUuid;
  const actors = [casterUuid, donorUuid].map((uuid, index) => {
    const actor = resolve(uuid);
    const pool = index === 0 ? (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "power"
      && p.itemId === plan.pool?.itemId && p.name === plan.pool?.name) : null;
    return { uuid, name: actor?.name ?? uuid ?? "", missing: !actor,
      health: actor?.system?.health?.value ?? null, pool: pool ? { ...pool } : null,
      claim: actor?.getFlag(SCOPE, CLAIM) ?? null };
  });
  const ownClaims = actors.some(a => a.claim?.messageId === card.id);
  const reviewed = review?.stage === "complete";
  const pending = f.success === true && (ownClaims || (!reviewed && receipt?.stage !== "complete"));
  const basis = JSON.stringify({ identity: identity(card), receipt, actors: actors.map(({ claim, ...a }) => a) });
  return { pending, reviewed, actors, plan, stage: receipt?.stage ?? null,
    basis, expected: JSON.stringify({ basis, claims: actors.map(a => a.claim), review }) };
}

/** Acknowledges manual reconciliation only. No Health, Mana or action write.
 * Joins the transfer queue so an in-flight normal transfer finishes first. */
export async function reviewBloodPactSpell({ messageId, expected, acknowledged } = {}, { user } = {}) {
  if (!writer() || !user?.isGM || acknowledged !== true) return refuse("permission");
  const run = async () => {
    if (!writer()) return refuse("authority");
    const card = game.messages?.get(messageId);
    const state = bloodPactSpellReviewState(card);
    if (!state?.pending || expected !== state.expected) return refuse("changed");
    const actors = state.actors.map(row => ({ row, actor: resolve(row.uuid) }));
    const existing = card.getFlag(SCOPE, REVIEW);
    const reviewed = existing?.stage === "complete" ? existing : {
      stage: "complete", by: user.id, at: Date.now(), expected,
      actors: state.actors.map(a => ({ uuid: a.uuid, claim: a.claim }))
    };
    const valid = () => writer() && game.messages.get(messageId) === card
      && same(card.getFlag(SCOPE, REVIEW), reviewed)
      && bloodPactSpellReviewState(card)?.basis === state.basis
      && actors.every(({ row, actor }) => resolve(row.uuid) === actor);
    try {
      if (existing?.stage !== "complete") await card.setFlag(SCOPE, REVIEW, reviewed);
      if (!valid()) return refuse("uncertain");
      for (const { row, actor } of actors) {
        if (!valid()) return refuse("uncertain");
        // A different cast's claim, or one that changed during acknowledgement,
        // is never cleared by this review.
        if (!actor || row.claim?.messageId !== messageId || !same(actor.getFlag(SCOPE, CLAIM), row.claim)) continue;
        await actor.unsetFlag(SCOPE, CLAIM);
        if (!valid() || same(actor.getFlag(SCOPE, CLAIM), row.claim)) return refuse("uncertain");
      }
      // Actor flag changes do not rerender a chat card. Persist cleanup last so
      // all clients remove the review door after the claims have actually gone.
      const complete = { ...reviewed, cleanup: "complete" };
      await card.setFlag(SCOPE, REVIEW, complete);
      if (!writer() || game.messages.get(messageId) !== card || !same(card.getFlag(SCOPE, REVIEW), complete)) return refuse("uncertain");
      return { ok: true, reviewed: true };
    } catch { return refuse("uncertain"); }
  };
  const pending = queue.then(run, run);
  queue = pending.then(() => undefined, () => undefined);
  return pending;
}
