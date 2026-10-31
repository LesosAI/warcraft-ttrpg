import { MIGHTY_BLOW, mightyBlowHit } from "../rules/mighty-blow.mjs";
import { forceMove } from "./forced-movement.mjs";

/** Called only by the claimed use controller. No damage is applied here:
 * the attack card retains ordinary armor, reactions and damage handling. */
export async function resolveMightyBlowPush({ actor, source, target, card, valid, checkpoint } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!actor || source?.actor !== actor || !target?.actor || !card?.id
    || typeof valid !== "function" || typeof checkpoint !== "function") return refuse("invalid");
  if (!await valid() || game.messages?.get(card.id) !== card) return refuse("changed");
  const flags = card.flags?.["azeroth-rpg"] ?? {};
  if (flags.source?.sceneId !== source.parent?.id || flags.source?.tokenId !== source.id
    || flags.kind !== "attack" || flags.notAttack === true || flags.parry === true
    || flags.targets?.length !== 1 || flags.targets[0].sceneId !== target.parent?.id
    || flags.targets[0].tokenId !== target.id) return refuse("attackIdentity");
  const hit = flags.damageByTarget?.[0];
  // rollTest writes a null damage row on a miss, not { hit: false }.
  // Missing damage without a completed failed roll is still unresolved.
  const success = card.rolls?.[0]?.outcome?.success;
  if (hit === null && success === false) return { ok: true, pushed: false, reason: "miss" };
  if (success === false && hit?.hit === true) return refuse("attackUnresolved");
  if (!hit || typeof hit.hit !== "boolean" || hit.withdrawn === true) return refuse("attackUnresolved");
  if (!hit.hit) return { ok: true, pushed: false, reason: "miss" };
  if (!mightyBlowHit({ flags, index: 0 })) return refuse("attackUnresolved");
  const attackState = value => JSON.stringify({ source: value.source, targets: value.targets,
    kind: value.kind, notAttack: value.notAttack, parry: value.parry, hit: value.damageByTarget?.[0] });
  const expected = attackState(flags);
  const currentHit = async () => {
    if (!await valid() || game.messages?.get(card.id) !== card) return false;
    const current = card.flags?.["azeroth-rpg"] ?? {};
    return attackState(current) === expected && mightyBlowHit({ flags: current, index: 0 });
  };
  if ((target.actor.system?.refuses ?? []).includes("forcedMovement")) return { ok: true, pushed: false, reason: "immovable" };
  if (!await checkpoint({ stage: "resisting", attackCardId: card.id })) return refuse("changed");
  if (!await currentHit()) return refuse("changed");
  const { rollResilience } = await import("../dice/workflows.mjs");
  const resistance = await rollResilience({ actor: target.actor, resilience: MIGHTY_BLOW.resilience, dc: MIGHTY_BLOW.dc, subtitle: MIGHTY_BLOW.name });
  const resisted = resistance?.rolls?.[0]?.outcome?.success;
  if (!resistance?.id || typeof resisted !== "boolean") return refuse("resistanceUnresolved");
  if (!await checkpoint({ stage: "resisted", attackCardId: card.id, resistanceCardId: resistance.id, resisted })) return refuse("changed");
  if (!await currentHit()) return refuse("changed");
  if (resisted) return { ok: true, pushed: false, reason: "resisted", resistanceCardId: resistance.id };
  if ((target.actor.system?.refuses ?? []).includes("forcedMovement")) return { ok: true, pushed: false, reason: "immovable", resistanceCardId: resistance.id };
  if (!await checkpoint({ stage: "moving", attackCardId: card.id, resistanceCardId: resistance.id })) return refuse("changed");
  if (!await currentHit()) return refuse("changed");
  if ((target.actor.system?.refuses ?? []).includes("forcedMovement")) return { ok: true, pushed: false, reason: "immovable", resistanceCardId: resistance.id };
  const push = await forceMove({ token: target, from: source.getCenterPoint(), feet: MIGHTY_BLOW.push, toward: "away", by: actor });
  if (!push || ["gone", "noGM", "unchecked", "unmeasured"].includes(push.reason)) return refuse("movementUnresolved");
  return { ok: true, pushed: push.moved === true, push, resistanceCardId: resistance.id };
}
