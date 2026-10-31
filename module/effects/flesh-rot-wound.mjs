import { mightyBlowHit } from "../rules/mighty-blow.mjs";
import { layFleshRot } from "./flesh-rot.mjs";

/** A physical wound, not Bleeding, disease, poison or a Shadow spell. */
export async function resolveFleshRotWound({ actor, source, target, card, valid, checkpoint } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!actor?.uuid || source?.actor !== actor || !target?.actor || !card?.id
    || [valid, checkpoint].some(fn => typeof fn !== "function")) return refuse("invalid");
  const victim = target.actor;
  const current = async () => {
    if (!await valid() || game.messages?.get(card.id) !== card || target.actor !== victim || source.actor !== actor) return false;
    const flags = card.flags?.["azeroth-rpg"];
    return flags?.source?.sceneId === source.parent?.id && flags.source.tokenId === source.id
      && flags.targets?.length === 1 && flags.targets[0].sceneId === target.parent?.id
      && flags.targets[0].tokenId === target.id && mightyBlowHit({ flags, index: 0 });
  };
  if (!await current()) return refuse("hit");
  if (!(victim.system?.health?.value > 0)) return { ok: true, applied: false, reason: "fallen" };
  if (!await checkpoint({ stage: "inflicting", attackCardId: card.id }) || !await current()) return refuse("changed");
  return layFleshRot({ source: actor, target: victim, castId: card.id, valid: current });
}
