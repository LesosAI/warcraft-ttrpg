import { starfallContexts } from "./starfall-context.mjs";
import { starweaveAssociation, starweaveAssociationLive } from "../rules/starweave.mjs";

export const STARWEAVE_LINK = "starweaveLink";
const scope = "azeroth-rpg";
const snapshot = region => ({ uuid: region.uuid, sceneId: region.parent?.id,
  identifier: region.flags?.[scope]?.identifier, caster: region.flags?.[scope]?.caster,
  cast: region.flags?.[scope]?.cast, sustained: region.flags?.[scope]?.sustained });

/** Read associations from current GM documents. No inferred links, mutation,
 * geometry changes, or damage authorization. Unresolved legacy/live Regions
 * are reported separately so a caller cannot quietly treat them as linked.
 */
export function starweaveContexts(caster, scene, dependencies = {}) {
  const falls = starfallContexts(caster, scene, dependencies);
  if (!falls.ok) return falls;
  const held = caster.getFlag(scope, "sustaining") ?? [];
  const regions = [...scene.regions].filter(region => region.parent === scene && scene.regions.get(region.id) === region);
  const weaves = regions.filter(region => {
    const flag = region.flags?.[scope];
    return flag?.identifier === "starweave" && flag.caster === caster.uuid && flag.sustained === true
      && held.some(entry => entry?.cast === flag.cast);
  });
  const links = [], unresolved = [];
  for (const weave of weaves) {
    const flag = weave.flags[scope], link = flag[STARWEAVE_LINK];
    const problem = reason => unresolved.push({ regionUuid: weave.uuid, cast: flag.cast, reason });
    if (weaves.filter(region => region.flags[scope].cast === flag.cast).length !== 1) {
      problem("duplicateRegion"); continue;
    }
    const source = flag.source?.sceneId === scene.id ? scene.tokens.get(flag.source.tokenId) : null;
    if (!source || source.actor?.id !== caster.id || !(source.actor.system?.health?.value > 0)) {
      problem("source"); continue;
    }
    if (!link) { problem("unlinked"); continue; }
    const fall = regions.find(region => region.uuid === link.starfall?.regionUuid);
    if (!fall || !falls.contexts.some(row => row.regionUuid === fall.uuid && row.cast === link.starfall.cast)) {
      problem("starfall"); continue;
    }
    const context = { casterUuid: caster.uuid, sceneId: scene.id, starfall: snapshot(fall), starweave: snapshot(weave), held };
    const validated = starweaveAssociation(context);
    if (!validated.ok) { problem(validated.reason); continue; }
    if (!starweaveAssociationLive(link, context)) { problem("changed"); continue; }
    links.push(validated.link);
  }
  return { ok: true, links, unresolved };
}
