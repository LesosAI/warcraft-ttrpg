import { bondOf } from "../documents/bound.mjs";
import { isSearingAttack, searingTargetLimit, searingTargetPlan } from "../rules/searing-totem.mjs";
import { searingAttackRange } from "./searing-totem-range.mjs";

export const SEARING_USE_QUERY = "azeroth-rpg.searingUse";
const FLAG = "searingUses";
const SCOPE = "azeroth-rpg";
const refuse = reason => ({ ok: false, reason });
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let queue = Promise.resolve();

function context(payload, user) {
  if (!gmHere() || !user?.active || game.users.get(user.id) !== user) return refuse("authority");
  if (payload.budget != null && !["half", "reaction"].includes(payload.budget)) return refuse("budget");
  const scene = game.scenes.get(payload.source?.sceneId), token = scene?.tokens.get(payload.source?.tokenId);
  const actor = token?.actor, bond = bondOf(actor);
  if (!actor || !actor.testUserPermission(user, "OWNER")) return refuse("permission");
  if (!isSearingAttack(actor.system?.attacks?.[payload.index], bond)) return refuse("source");
  if (searingAttackRange(actor, payload.source, payload.targets)) return refuse("range");
  const owner = bond?.ownerUuid ? fromUuidSync(bond.ownerUuid) : null;
  const limit = searingTargetLimit(owner?.takenTalents?.() ?? []);
  const ids = payload.targets.map(t => scene.tokens.get(t.tokenId).actor.uuid);
  const fight = actor.activeFight?.() ?? null;
  if (fight && (!fight.started || fight.id !== payload.combatId || fight.round !== payload.round || fight.turn !== payload.turn)) return refuse("turn");
  if (!fight && payload.combatId) return refuse("turn");
  const key = fight ? JSON.stringify([token.uuid, fight.round, fight.turn]) : null;
  const records = fight?.getFlag(SCOPE, FLAG) ?? [];
  if (!Array.isArray(records)) return refuse("record");
  const prior = records.filter(r => r.key === key);
  if (prior.some(r => !["done", "reviewed"].includes(r.stage))) return refuse("pending");
  const plan = searingTargetPlan({ limit, prior: prior.flatMap(r => r.targets), targets: ids });
  return plan.ok ? { ok: true, actor, token, fight, key, records, plan, ids, limit, owner,
    bond: structuredClone(bond) } : plan;
}

/** Claims and the ordinary Half-Action are GM serialized. Unknown outcomes
 * retain the claim; another client never retries a possibly paid attack. */
export function searingUseHandler(payload = {}, { user = game.user } = {}) {
  const run = async () => {
    if (payload.operation === "review") {
      if (!gmHere() || !user?.active || !user.isGM || game.users.get(user.id) !== user) return refuse("permission");
      if (payload.acknowledged !== true) return refuse("acknowledgement");
      const fight = game.combats.get(payload.combatId), rows = fight?.getFlag(SCOPE, FLAG);
      const row = Array.isArray(rows) ? rows.find(r => r.id === payload.id) : null;
      if (!row || row.stage !== "pending" || !same(row, payload.expected)) return refuse("changed");
      const next = rows.map(r => r === row ? { ...r, stage: "reviewed", reviewedBy: user.id, reviewedAt: Date.now() } : r);
      try {
        await fight.setFlag(SCOPE, FLAG, next);
        return gmHere() && same(fight.getFlag(SCOPE, FLAG), next) ? { ok: true } : refuse("pending");
      } catch { return refuse("pending"); }
    }
    if (payload.operation === "finish") {
      if (!gmHere() || !user?.active || game.users.get(user.id) !== user) return refuse("authority");
      const fight = game.combats.get(payload.combatId), rows = fight?.getFlag(SCOPE, FLAG);
      const row = Array.isArray(rows) ? rows.find(r => r.id === payload.id) : null;
      if (!row || row.userId !== user.id || row.stage !== "pending") return refuse("record");
      // Finishing cannot release capacity; it only permits the still-unused
      // second target. The original target list remains charged for this turn.
      await fight.setFlag(SCOPE, FLAG, rows.map(r => r === row ? { ...r, stage: "done" } : r));
      return { ok: true };
    }
    const c = context(payload, user);
    if (!c.ok) return c;
    if (!c.fight) return { ok: true, budget: payload.budget ?? null };
    const receipt = { id: foundry.utils.randomID(), key: c.key, userId: user.id,
      sourceUuid: c.token.uuid, targets: c.ids, stage: "pending" };
    const next = [...c.records, receipt];
    const valid = () => gmHere() && user.active && game.users.get(user.id) === user
      && c.token.actor === c.actor && c.actor.testUserPermission(user, "OWNER")
      && same(bondOf(c.actor), c.bond)
      && c.actor.activeFight?.() === c.fight && c.fight.round === payload.round && c.fight.turn === payload.turn
      && searingTargetLimit(c.owner?.takenTalents?.() ?? []) === c.limit
      && same(c.fight.getFlag(SCOPE, FLAG), next)
      && !searingAttackRange(c.actor, payload.source, payload.targets);
    try {
      await c.fight.setFlag(SCOPE, FLAG, next);
      if (!valid()) return refuse("pending");
      if (!c.plan.extra && payload.budget !== "none") {
        const combatant = c.fight.getCombatantsByActor(c.actor)?.find(cbt => cbt.token?.uuid === c.token.uuid);
        if (!combatant) return refuse("pending");
        const paid = await combatant.spendAction(payload.budget === "reaction" ? "reaction" : "half", { isAttack: true, rangeKind: "ranged" });
        if (!paid.ok) {
          // A documented refusal performed no spend. Remove only our exact claim.
          if (gmHere() && same(c.fight.getFlag(SCOPE, FLAG), next)) await c.fight.setFlag(SCOPE, FLAG, c.records);
          return refuse("budget");
        }
      }
      if (!valid()) return refuse("pending");
      return { ok: true, budget: "none", id: receipt.id, combatId: c.fight.id };
    } catch { return refuse("pending"); }
  };
  const result = queue.then(run, run); queue = result.catch(() => {}); return result;
}

async function request(payload) {
  try {
    const gm = game.users?.activeGM;
    if (!gm) return refuse("authority");
    return gm.isSelf ? searingUseHandler(payload, { user: game.user })
      : await gm.query(SEARING_USE_QUERY, payload, { timeout: 15000 });
  } catch { return refuse("pending"); }
}

/** GM-only reading surface; receipt contents never go to a player picker. */
export function pendingSearingUses(actor) {
  if (!game.user?.isGM) return [];
  const out = [];
  for (const combat of game.combats.values()) {
    const rows = combat.getFlag(SCOPE, FLAG);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row.stage !== "pending") continue;
      let source;
      try { source = fromUuidSync(row.sourceUuid); } catch { continue; }
      if (source?.actor !== actor) continue;
      let round = "?", turn = "?";
      try { const key = JSON.parse(row.key); round = key[1]; turn = key[2] + 1; } catch { /* Older malformed receipt remains reviewable. */ }
      out.push({ combatId: combat.id, id: row.id, expected: structuredClone(row), round, turn,
        targets: (Array.isArray(row.targets) ? row.targets : []).map(uuid => { try { return fromUuidSync(uuid)?.name ?? uuid; } catch { return uuid; } }).join(", ") });
    }
  }
  return out;
}

export function requestSearingUseReview(row) {
  return request({ operation: "review", combatId: row.combatId, id: row.id, expected: row.expected, acknowledged: true });
}

/** Runs only after the dialog is accepted. One target per Test/card; a later
 * attack against the additional target spends no additional Half-Action. */
export async function runSearingAttack({ actor, index, source, originalTargets, args, workflow, valid = () => true }) {
  const fight = actor.activeFight?.() ?? null;
  const round = fight?.round, turn = fight?.turn;
  if (!valid() || args.targets?.length !== originalTargets?.length) return null;
  const reserved = await request({ source, index, targets: originalTargets, budget: args.budget,
    combatId: fight?.id ?? null, round: fight?.round, turn: fight?.turn });
  if (!reserved.ok) {
    ui.notifications?.warn(game.i18n.localize(`AZEROTH.Bound.SearingUse.${reserved.reason}`)); return null;
  }
  try {
    if (!valid() || searingAttackRange(actor, source, originalTargets)
      || fight && (actor.activeFight?.() !== fight || fight.id !== reserved.combatId || fight.round !== round || fight.turn !== turn)) return null;
    const card = await workflow({ ...args, budget: reserved.budget });
    if (!card) return null;
    if (reserved.id) {
      const finished = await request({ operation: "finish", id: reserved.id, combatId: reserved.combatId });
      if (!finished.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.SearingUse.pending"));
    }
    return card;
  } catch (error) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Bound.SearingUse.pending"));
    throw error;
  }
}
