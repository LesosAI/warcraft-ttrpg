import { sustainTransferInventory } from "../rules/sustain-transfer.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** Active-GM read only. Scan world and synthetic actors on every scene, not
 * only the viewed canvas. No transfer is authorized or performed by this read. */
export function readSustainTransferInventory(caster, cast) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return { ok: false, reason: "authority" };
  if (caster?.documentName !== "Actor" || !caster.uuid || fromUuidSync(caster.uuid) !== caster) return { ok: false, reason: "caster" };
  const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
  const scenes = values(game.scenes);
  for (const scene of scenes) for (const token of values(scene.tokens)) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  if (actors.get(caster.uuid) !== caster) return { ok: false, reason: "caster" };
  const effects = [];
  for (const actor of actors.values()) {
    if (fromUuidSync(actor.uuid) !== actor) continue;
    for (const effect of values(actor.effects)) effects.push({ ...effect.toObject(), uuid: effect.uuid, parentUuid: actor.uuid });
  }
  const regions = scenes.flatMap(scene => values(scene.regions).map(region => ({
    ...region.toObject(), uuid: region.uuid, parentUuid: scene.uuid
  })));
  return sustainTransferInventory({ casterUuid: caster.uuid, cast,
    entries: caster.getFlag("azeroth-rpg", "sustaining") ?? [], effects, regions });
}
