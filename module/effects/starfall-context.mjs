/** Read-only, active-GM inventory for Starfall's caster-turn chooser.
 * Region membership uses V14 TokenDocument#testInsideRegion, not a radius guess.
 * This does not authorize damage, choose for an owner, or consume a turn.
 */
export function starfallContexts(caster, scene, {
  game = globalThis.game, resolve = uuid => globalThis.fromUuidSync?.(uuid)
} = {}) {
  if (!game?.user?.isGM || game.users?.activeGM?.id !== game.user.id) return { ok: false, reason: "authority" };
  if (!scene?.id || game.scenes?.get(scene.id) !== scene) return { ok: false, reason: "scene" };
  let current;
  try { current = resolve(caster?.uuid); } catch { return { ok: false, reason: "caster" }; }
  if (!caster || caster.documentName !== "Actor" || current !== caster) return { ok: false, reason: "caster" };
  if (!(caster.system?.health?.value > 0)) return { ok: false, reason: "down" };
  const held = caster.getFlag?.("azeroth-rpg", "sustaining") ?? [];
  if (!Array.isArray(held)) return { ok: false, reason: "sustains" };
  const contexts = [];
  for (const region of scene.regions ?? []) {
    const flag = region.flags?.["azeroth-rpg"];
    if (flag?.identifier !== "starfall" || flag.caster !== caster.uuid || flag.sustained !== true) continue;
    if (scene.regions.get(region.id) !== region || region.parent !== scene) continue;
    if (typeof flag.cast !== "string" || !flag.cast.trim()
      || typeof region.uuid !== "string" || !region.uuid.trim()) return { ok: false, reason: "identity" };
    const entries = held.filter(entry => entry?.cast === flag.cast);
    if (!entries.length) continue;
    if (entries.length !== 1) return { ok: false, reason: "ambiguousCast" };
    const source = flag.source;
    const sourceToken = source?.sceneId === scene.id ? scene.tokens?.get(source.tokenId) : null;
    if (!sourceToken || sourceToken.actor?.id !== caster.id || !(sourceToken.actor.system?.health?.value > 0)) continue;
    const creatures = new Map();
    for (const token of scene.tokens ?? []) {
      const actor = token.actor;
      if (!actor?.uuid || token.parent !== scene || scene.tokens.get(token.id) !== token) continue;
      let inside;
      try { inside = token.testInsideRegion(region); } catch { return { ok: false, reason: "geometry" }; }
      if (!inside) continue;
      const row = creatures.get(actor.uuid) ?? { uuid: actor.uuid, name: actor.name, tokens: [] };
      row.tokens.push({ id: token.id, hidden: token.hidden === true });
      creatures.set(actor.uuid, row);
    }
    contexts.push({ regionUuid: region.uuid, cast: flag.cast, casterUuid: caster.uuid,
      source: { sceneId: scene.id, tokenId: sourceToken.id },
      candidates: [...creatures.values()].sort((a, b) => a.uuid.localeCompare(b.uuid)) });
  }
  return { ok: true, contexts: contexts.sort((a, b) => a.regionUuid.localeCompare(b.regionUuid)) };
}
