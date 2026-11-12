/**
 * **THE SCENES A FIGHT STANDS ON** (the Chronomancer sweep's stage 3, D-892). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * Core makes a fight with no scene: the tracker's create (14.367
 * `client/applications/sidebar/tabs/combat-tracker.mjs`, `Combat.implementation.create()`) and a
 * token's *Toggle Combat State* (`client/documents/token.mjs#createCombatants`,
 * `cls.create({active: true})`) both leave `Combat#scene` null, and only a GM who links the fight
 * by hand sets it. The turn boundary's area pass read `combat.scene` alone, so in every fight a
 * table makes a timed area never ran out: 07 §12's Dune Collapse left its Difficult ground
 * standing thirteen rounds into a fight after its *1 minute*. Each combatant names the scene its
 * token stands on, and those are the fight's scenes.
 *
 * @param {{sceneId?: string|null, combatants?: Array<{sceneId?: string|null}>}} fight
 *   the fight's own scene id (null where core made it unlinked) and each combatant's
 * @returns {string[]} unique scene ids, the fight's own first, then in combatant order
 */
export function fightSceneIds({ sceneId = null, combatants = [] } = {}) {
  const out = [];
  const add = id => { if (typeof id === "string" && id && !out.includes(id)) out.push(id); };
  add(sceneId);
  for (const c of combatants ?? []) add(c?.sceneId ?? null);
  return out;
}

/** A fight's combatants as a list: an embedded collection's `contents`, an array, or any iterable of rows. */
function rowsOf(combatants) {
  if (Array.isArray(combatants)) return combatants;
  if (Array.isArray(combatants?.contents)) return combatants.contents;
  return typeof combatants?.[Symbol.iterator] === "function" ? [...combatants] : [];
}

/**
 * **THE SCENE DOCUMENTS A FIGHT STANDS ON** (O-294; D-892's fault 5, carried to every door that
 * read `combat.scene` alone): the fight's own scene where a GM linked it, then the scene each
 * combatant's token stands on, in combatant order, each once. Duck-typed over the fight and the
 * world's scene collection, so it stays pure: a combatant's token names its scene document, and
 * a combatant whose token is not drawn names a scene id the collection answers.
 *
 * `canvas/sustained-areas.mjs#scenesOfFight` is this over `game.scenes`; every other door that
 * asks which scenes a fight is on asks here.
 *
 * @param {{scene?: {id: string}|null, combatants?: Iterable<{token?: {parent?: {id: string}}|null, sceneId?: string|null}>|{contents: object[]}}|null} combat
 * @param {{get?: (id: string) => object|null|undefined}|null} [scenes]  the world's scenes
 * @returns {object[]} the scene documents, the fight's own first
 */
export function fightScenes(combat, scenes = null) {
  if (!combat) return [];
  const own = combat.scene ?? null;
  const rows = rowsOf(combat.combatants);
  // With the world's collection in hand, a scene is what the WORLD holds (a deleted scene's
  // object keeps its tokens on the client, and a door must not write on it); without one, the
  // scene a combatant's token names.
  const parents = new Map();
  for (const c of rows) {
    const parent = c?.token?.parent ?? null;
    if (parent?.id && !parents.has(parent.id)) parents.set(parent.id, parent);
  }
  const ids = fightSceneIds({ combatants: rows.map(c => ({ sceneId: c?.token?.parent?.id ?? c?.sceneId ?? null })) });
  const lookup = typeof scenes?.get === "function" ? id => scenes.get(id) ?? null : id => parents.get(id) ?? null;
  const out = own ? [own] : [];
  for (const id of ids) {
    if (own && own.id === id) continue;
    const scene = lookup(id);
    if (scene && !out.includes(scene)) out.push(scene);
  }
  return out;
}

/**
 * Whether a fight stands on a scene (`fightScenes`), by the scene document or its id.
 *
 * @param {object|null} combat
 * @param {{id?: string}|string|null} scene
 * @param {{get?: Function}|null} [scenes]
 */
export function fightOnScene(combat, scene, scenes = null) {
  const id = typeof scene === "string" ? scene : scene?.id ?? null;
  return Boolean(id) && fightScenes(combat, scenes).some(s => s?.id === id);
}
