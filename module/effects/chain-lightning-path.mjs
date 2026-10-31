import { feetApart } from "../canvas/footprints.mjs";
import { chainLightningLiving, chainLightningPath } from "../rules/chain-lightning.mjs";

/** Internal GM preparation, deliberately not a player query response: hidden
 * creatures participate, so neither their documents nor this path may be sent
 * to the casting player's picker. The spell coordinator must retain it on GM. */
export function resolveChainLightningPath({ actor, spell, source, targets, viaItem = false, user = game.user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return refuse("authority");
  if (!user?.active || game.users.get(user.id) !== user || !actor?.testUserPermission(user, "OWNER")) return refuse("permission");
  if (spell?.type !== "spell" || spell.system?.identifier !== "chain-lightning") return refuse("spell");
  if (viaItem) {
    const item = actor.items?.get(viaItem.itemId);
    const entry = Number.isInteger(viaItem.index) && viaItem.index >= 0 ? item?.system?.spells?.[viaItem.index] : null;
    if (!entry || !spell.uuid || entry.uuid !== spell.uuid
      || ((entry.uses?.max ?? 0) > 0 && !(entry.uses.value > 0))) return refuse("item");
  } else if (spell.parent !== actor && !(actor.type === "npc" && spell.pack === "azeroth-rpg.spells"
    && actor.system.spells?.names?.includes(spell.name))) return refuse("spell");
  if (!Array.isArray(targets) || targets.length !== 1) return refuse("target");
  const scene = game.scenes.get(source?.sceneId), from = scene?.tokens.get(source?.tokenId);
  if (!from || from.actor !== actor) return refuse("source");
  const selected = targets[0];
  const first = selected?.sceneId === scene.id ? scene.tokens.get(selected.tokenId) : null;
  if (!first?.actor || first.actor.id !== selected.actorId || first._source?.level !== from._source?.level) return refuse("target");
  let initialDistance;
  try { initialDistance = feetApart(from, first); } catch { return refuse("geometry"); }
  if (typeof initialDistance !== "number" || !Number.isFinite(initialDistance) || initialDistance < 0) return refuse("geometry");
  if (initialDistance > 60) return refuse("range");
  const creatures = [...scene.tokens.values()].filter(token => token.actor
    && ["character", "npc"].includes(token.actor.type) && token._source?.level === from._source?.level)
    .map(token => ({ id: token.id, token, living: chainLightningLiving({
      creatureType: token.actor.system.creatureType,
      race: token.actor.raceItem?.system?.identifier ?? token.actor.raceItem?.name ?? token.actor.system.race,
      statuses: [...(token.actor.statuses ?? [])]
    }) }));
  const path = chainLightningPath({ firstId: first.id, creatures,
    talents: viaItem ? [] : actor.takenTalents?.() ?? [],
    distance: (a, b) => feetApart(a.token, b.token) });
  if (!path.length) return refuse("geometry");
  const tokens = path.map(id => scene.tokens.get(id));
  // Keep one row per hit, including returns to the same token/actor.
  return { ok: true, tokens, targets: tokens.map(token => ({
    sceneId: scene.id, tokenId: token.id, actorId: token.actor.id
  })) };
}
