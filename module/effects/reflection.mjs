/** Reflection Field's V14 effect lifetime. Activation/payment and spell routing
 * are separate callers; this module never grants permission to use the ability.
 */
import { REFLECTION_FLAG, reflectionCovers } from "../rules/reflection.mjs";
import { activeSentinelPowers } from "./anubisath-pack.mjs";
import { untilNextTurnOrRound } from "./durations.mjs";

function resolve(uuid) {
  try { return typeof uuid === "string" && uuid ? fromUuidSync(uuid) : null; }
  catch { return null; }
}

export function reflectionAlive(effect) {
  const field = effect?.flags?.["azeroth-rpg"]?.[REFLECTION_FLAG];
  if (!field || effect.disabled === true || effect.active === false || effect.duration?.expired === true) return false;
  const source = resolve(field.sourceUuid);
  const token = resolve(field.sourceTokenUuid);
  if (source?.documentName !== "Actor" || token?.documentName !== "Token" || token.actor?.uuid !== source.uuid) return false;
  if (field.combatId && !game.combats?.get(field.combatId)?.started) return false;
  return true;
}

/** A standing field snapshot for the pure router, never merely a stored flag. */
export function reflectionOn(actor, school = null) {
  const effects = [...(actor?.effects ?? [])].filter(reflectionAlive).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const effect of effects) {
    const held = effect.flags["azeroth-rpg"][REFLECTION_FLAG];
    if (!reflectionCovers(held, school)) continue;
    return { active: true, sourceUuid: held.sourceUuid, effectId: effect.id,
      ...(Object.hasOwn(held, "schools") ? { schools: [...held.schools] } : {}) };
  }
  if (!(actor?.system?.health?.value > 0)) return null;
  const powers = activeSentinelPowers(actor), schools = [];
  if (powers.includes("fire-arcane-reflect")) schools.push("fire", "arcane");
  if (powers.includes("shadow-frost-reflect")) schools.push("shadow", "frost");
  const field = { active: true, sourceUuid: actor.uuid, schools };
  return reflectionCovers(field, school) ? field : null;
}

/** The GM lays protection until the SOURCE's next turn, not the recipient's.
 * Outside combat the existing duration policy is one six-second world round.
 */
export async function layReflectionField({ sourceToken, target } = {}) {
  if (game.user?.isGM !== true) throw new Error("Reflection Field must be laid by the GM.");
  const source = sourceToken?.actor;
  if (sourceToken?.documentName !== "Token" || source?.documentName !== "Actor" || target?.documentName !== "Actor") throw new Error("Reflection Field needs a source token and recipient actor.");
  const timing = untilNextTurnOrRound(source);
  const data = {
    name: "Reflection Field", img: "icons/svg/shield.svg", origin: source.uuid,
    description: "<p>Harmful spells directly targeting this creature return toward their caster. Ground areas and existing periodic effects are not reflected.</p>",
    ...timing,
    flags: { "azeroth-rpg": { [REFLECTION_FLAG]: {
      sourceUuid: source.uuid, sourceTokenUuid: sourceToken.uuid, combatId: timing.start?.combat ?? null
    } } }
  };
  const older = [...target.effects].filter(e => e.flags?.["azeroth-rpg"]?.[REFLECTION_FLAG]?.sourceTokenUuid === sourceToken.uuid).map(e => e.id);
  const [made] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
  if (made && older.length) await target.deleteEmbeddedDocuments("ActiveEffect", older);
  return made ?? null;
}

/** Cleanup only orphaned/ended fields. Disabled fields are not deleted merely
 * because a GM disabled them; core handles ordinary time/turn expiry.
 */
export async function cleanReflectionFields() {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return 0;
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  let count = 0;
  for (const actor of actors.values()) {
    const ids = [...actor.effects].filter(effect => {
      const field = effect.flags?.["azeroth-rpg"]?.[REFLECTION_FLAG];
      if (!field) return false;
      const source = resolve(field.sourceUuid), token = resolve(field.sourceTokenUuid);
      return source?.documentName !== "Actor" || token?.documentName !== "Token" || token.actor?.uuid !== source.uuid
        || Boolean(field.combatId && !game.combats?.get(field.combatId)?.started);
    }).map(e => e.id);
    if (ids.length) count += (await actor.deleteEmbeddedDocuments("ActiveEffect", ids)).length;
  }
  return count;
}

export function registerReflectionHooks() {
  const clean = () => { void cleanReflectionFields().catch(() => ui.notifications?.warn("Some Reflection Field effects could not be removed. Check the affected creatures.")); };
  for (const hook of ["deleteActor", "deleteToken", "deleteCombat", "deleteScene"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", (combat, changes) => {
    if (Object.hasOwn(changes, "round") || Object.hasOwn(changes, "started")) clean();
  });
  Hooks.on("ready", clean);
}
