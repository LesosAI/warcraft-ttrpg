import { CARRION_SCARAB as SPEC, scarabClaim, scarabSummonPlan } from "../rules/carrion-scarab.mjs";

const queues = new Map();
export const scarabClaims = actor => actor?.getFlag("azeroth-rpg", SPEC.flag) ?? [];
export const scarabTokens = () => [...game.scenes].flatMap(scene => [...scene.tokens]);
export const scarabSnapshot = token => ({ ...token.getFlag("azeroth-rpg", SPEC.tokenFlag), uuid: token.uuid,
  sceneId: token.parent?.id, health: token.actor?.system?.health?.value });
export const scarabWriter = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Creation and recovery must use this same per-owner queue. */
export async function scarabWrite(ownerUuid, run) {
  const task = (queues.get(ownerUuid) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(ownerUuid, task);
  try { return await task; }
  finally { if (queues.get(ownerUuid) === task) queues.delete(ownerUuid); }
}

/** Called under scarabWrite after placement review. The caller's validation
 * checks ownership, the live source/clock, statuses and the ability stamp.
 * A durable claim precedes Action payment; a paid claim and use decrement
 * share one Actor update. No error branch retries either payment or creation.
 */
export async function createCarrionScarab({ actor, scene, sourceToken, prototype, selection, index,
  valid, spendTurnBudget, combat = null } = {}) {
  let paid = false, consumed = false;
  const refuse = reason => ({ ok: false, reason, paid, consumed });
  if (!scarabWriter() || typeof valid !== "function" || !valid() || !selection?.valid()) return refuse("invalid");
  const uses = actor.system.creatureAbilities?.[index]?.automation?.uses?.value;
  const now = game.time.worldTime;
  let expected = structuredClone(scarabClaims(actor));
  const plan = scarabSummonPlan({ ownerUuid: actor.uuid, alive: actor.system.health?.value > 0, uses, now,
    claims: expected, tokens: scarabTokens().map(scarabSnapshot), inventoryComplete: true });
  if (!plan.ok) return refuse(plan.reason);
  const tokenId = foundry.utils.randomID();
  const claim = scarabClaim({ ownerUuid: actor.uuid, cast: foundry.utils.randomID(),
    tokenUuid: `${scene.uuid}.Token.${tokenId}`, sceneId: scene.id, now });
  if (!claim || scene.tokens.get(tokenId)) return refuse("identity");
  claim.combatId = combat?.id ?? null;
  claim.sourceTokenId = sourceToken.id;
  const check = (placement = true) => scarabWriter() && valid()
    && same(scarabClaims(actor), expected)
    && actor.system.creatureAbilities?.[index]?.automation?.uses?.value === (consumed ? plan.usesAfter : uses)
    && (!placement || selection.valid());
  try {
    expected = [...expected, claim];
    await actor.setFlag("azeroth-rpg", SPEC.flag, expected);
    if (!check()) return refuse("claimUnconfirmed");
    paid = null; // An interrupted Action request is uncertain, not unpaid.
    if (!await spendTurnBudget(actor, SPEC.action)) {
      paid = false;
      // A definite refusal means this attempt did not spend an Action.
      if (check()) await actor.setFlag("azeroth-rpg", SPEC.flag, expected.filter(c => c.cast !== claim.cast));
      return refuse("action");
    }
    paid = true;
    if (!check()) return refuse("changed");
    const abilities = foundry.utils.deepClone(actor.system.creatureAbilities);
    abilities[index].automation.uses.value = plan.usesAfter;
    const paidClaim = { ...claim, phase: "paid" };
    expected = expected.map(c => c.cast === claim.cast ? paidClaim : c);
    await actor.update({ "system.creatureAbilities": abilities, [`flags.azeroth-rpg.${SPEC.flag}`]: expected });
    consumed = true;
    if (!check()) return refuse("paymentUnconfirmed");
    const [made] = await scene.createEmbeddedDocuments("Token", [{ ...prototype, _id: tokenId, actorLink: false,
      disposition: sourceToken.disposition, x: selection.x, y: selection.y, elevation: selection.elevation,
      flags: { ...prototype.flags, "azeroth-rpg": { ...prototype.flags?.["azeroth-rpg"], [SPEC.tokenFlag]: {
        ownerUuid: actor.uuid, cast: claim.cast, expiresAt: claim.expiresAt
      } } } }], { keepId: true });
    // The chosen space is now occupied by this token. Do not rerun the empty
    // footprint check after creation, but still check source and ownership.
    if (!check(false) || made?.uuid !== claim.tokenUuid || scene.tokens.get(tokenId) !== made) return refuse("creationUnconfirmed");
    const active = { ...paidClaim, phase: "active" };
    expected = expected.map(c => c.cast === claim.cast ? active : c);
    await actor.setFlag("azeroth-rpg", SPEC.flag, expected);
    if (!check(false)) return refuse("activationUnconfirmed");
    return { ok: true, paid, consumed, token: made, claim: active };
  } catch (error) {
    console.warn("azeroth-rpg | Carrion Scarab creation", error);
    return refuse("writeUncertain");
  }
}
