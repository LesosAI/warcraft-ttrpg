import { activeVoidwalkerSacrifices, voidwalkerSacrificeInRange } from "../rules/voidwalker-sacrifice.mjs";
import { bondOf } from "../documents/bound.mjs";
import { feetApart } from "../canvas/footprints.mjs";

const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const geometry = token => JSON.stringify([token.x, token.y, token.elevation, token.width, token.height, token._source?.level]);

/** Read current protection for this exact owner token. No target, effect or
 * budget is changed here. Return all eligible protectors so the attack workflow
 * can resolve ambiguity before it builds defender-dependent modifiers. */
export function voidwalkerProtectors(ownerToken) {
  const scene = ownerToken?.parent, owner = ownerToken?.actor;
  if (!scene?.id || game.scenes?.get(scene.id) !== scene || scene.tokens?.get(ownerToken.id) !== ownerToken
    || !owner?.uuid || resolve(owner.uuid) !== owner || !(owner.system?.health?.value > 0)
    || !scene.levels?.get(ownerToken._source?.level)) return [];
  const found = [];
  for (const token of scene.tokens.values()) {
    const actor = token.actor;
    if (!actor?.uuid || actor === owner || resolve(actor.uuid) !== actor || actor.type !== "npc"
      || !(actor.system?.health?.value > 0) || bondOf(actor)?.ownerUuid !== owner.uuid
      || !actor.system?.creatureAbilities?.some(row => row.name === "Sacrifice"
        && row.automation?.kind === "utility" && row.automation.action === "half")) continue;
    const feet = feetApart(token, ownerToken);
    if (!voidwalkerSacrificeInRange({ feet, sameScene: token.parent === scene,
      sameLevel: token._source?.level === ownerToken._source.level })) continue;
    const effect = activeVoidwalkerSacrifices(actor.effects, { sourceUuid: actor.uuid, ownerUuid: owner.uuid,
      sourceTokenUuid: token.uuid, ownerTokenUuid: ownerToken.uuid })[0];
    if (effect) found.push({ actor, token, effect, owner, ownerToken, feet });
  }
  return found;
}

/** Prepare defender snapshots before target-dependent attack modifiers. The
 * original targets remain separate for range checks and the attack record.
 * Revalidation refuses a stale dialog rather than carrying the old defender's
 * defenses or retaliation onto a different creature. */
export function prepareVoidwalkerInterception(targets, snapshot) {
  if (!Array.isArray(targets) || typeof snapshot !== "function") return { ok: false, reason: "targets" };
  const interceptions = [], observed = [];
  const prepared = [];
  for (const target of targets) {
    const scene = game.scenes?.get(target.sceneId), intended = scene?.tokens?.get(target.tokenId);
    const candidates = intended ? voidwalkerProtectors(intended) : [];
    if (candidates.length > 1) return { ok: false, reason: "ambiguous" };
    const chosen = candidates[0] ?? null;
    if (!chosen) { prepared.push(target); observed.push({ intended, intendedActor: intended?.actor, chosen }); continue; }
    const defender = snapshot(chosen.token);
    if (!defender || defender.sceneId !== scene.id || defender.tokenId !== chosen.token.id
      || !Number.isFinite(defender.defense)) return { ok: false, reason: "defender" };
    prepared.push(defender);
    observed.push({ intended, intendedActor: intended.actor, chosen, before: JSON.stringify(defender),
      ownerPosition: geometry(intended), defenderPosition: geometry(chosen.token),
      activationId: chosen.effect.flags["azeroth-rpg"].voidwalkerSacrifice.activationId });
    interceptions.push({ intended: { sceneId: scene.id, tokenId: intended.id, actorUuid: intended.actor.uuid },
      defender: { sceneId: scene.id, tokenId: chosen.token.id, actorUuid: chosen.actor.uuid },
      effectId: chosen.effect.id, activationId: chosen.effect.flags["azeroth-rpg"].voidwalkerSacrifice.activationId });
  }
  return { ok: true, targets: prepared, interceptions, originalTargets: targets,
    watching: observed.some(row => Boolean(row.intended)),
    valid: () => observed.every(({ intended, intendedActor, chosen, before, activationId, ownerPosition, defenderPosition }) => {
      if (!intended) return true;
      if (game.scenes?.get(intended.parent?.id) !== intended.parent || intended.parent?.tokens?.get(intended.id) !== intended
        || intended.actor !== intendedActor || resolve(intendedActor?.uuid) !== intendedActor) return false;
      const now = voidwalkerProtectors(intended);
      if (!chosen) return now.length === 0;
      return now.length === 1 && now[0].actor === chosen.actor && now[0].token === chosen.token
        && geometry(intended) === ownerPosition && geometry(chosen.token) === defenderPosition
        && now[0].effect.flags["azeroth-rpg"].voidwalkerSacrifice.activationId === activationId
        && now[0].effect === chosen.effect && JSON.stringify(snapshot(chosen.token)) === before;
    }) };
}

/** An Extra Attack's 'same target' means the originally attacked owner, not
 * the creature that intercepted the first roll. Read fresh actors and effects
 * before rebuilding the second attack specification. */
export function refreshVoidwalkerInterception(previous, secondTargets, snapshot) {
  if (!previous?.ok || !Array.isArray(previous.originalTargets) || typeof snapshot !== "function")
    return { ok: false, reason: "targets" };
  const sameToken = (a, b) => a?.tokenId || b?.tokenId
    ? a?.sceneId === b?.sceneId && a?.tokenId === b?.tokenId
    : Boolean(a?.actorId && a.actorId === b?.actorId && !a.sceneId && !b.sceneId);
  const intended = [];
  for (const selected of secondTargets?.length ? secondTargets : previous.originalTargets) {
    if (!secondTargets?.length) { intended.push(selected); continue; }
    const matches = previous.targets.map((row, index) => sameToken(row, selected) ? index : -1).filter(index => index >= 0);
    if (matches.length > 1) return { ok: false, reason: "ambiguous" };
    intended.push(matches.length ? previous.originalTargets[matches[0]] : selected);
  }
  const fresh = [];
  for (const target of intended) {
    // Ordinary actor-only attacks have no token or interception geometry.
    // Refresh their live defenses without pretending that all tokenless actors
    // are the same target. A broken scene/token reference still refuses below.
    if (!target.sceneId && !target.tokenId && target.actorId) {
      const actor = resolve(`Actor.${target.actorId}`);
      if (!actor || actor.id !== target.actorId) return { ok: false, reason: "targetChanged" };
      const current = snapshot({ id: null, parent: null, actor, name: actor.name ?? target.name });
      if (!current || !sameToken(current, target)) return { ok: false, reason: "targetChanged" };
      fresh.push(current);
      continue;
    }
    const token = game.scenes?.get(target.sceneId)?.tokens?.get(target.tokenId);
    const record = previous.interceptions.find(row => sameToken(row.intended, target));
    if (!token?.actor || record && resolve(record.intended.actorUuid) !== token.actor
      || target.actorId && target.actorId !== token.actor.id) return { ok: false, reason: "targetChanged" };
    const current = snapshot(token);
    if (!current || !sameToken(current, target)) return { ok: false, reason: "targetChanged" };
    fresh.push(current);
  }
  return prepareVoidwalkerInterception(fresh, snapshot);
}

/** Revalidate a specialized attack's prepared defender without redirecting it
 * a second time. The caller still checks reach and hostility to the intended
 * target. An intercepted attack must retain its prepared defenses and carrier;
 * an ordinary attack may use its existing fresh-Defense adjustment. */
export function preparedVoidwalkerDefender(args, intended, snapshot) {
  const scene = intended?.parent, actor = intended?.actor;
  if (!scene?.id || game.scenes?.get(scene.id) !== scene || scene.tokens?.get(intended.id) !== intended
    || !actor?.uuid || resolve(actor.uuid) !== actor || typeof snapshot !== "function"
    || args?.targets?.length !== 1 || !Number.isFinite(args.targets[0]?.defense)) return null;
  const records = args.sacrificeInterceptions ?? [];
  if (!Array.isArray(records)) return null;
  const original = snapshot(intended);
  if (!original || original.sceneId !== scene.id || original.tokenId !== intended.id) return null;
  const fresh = prepareVoidwalkerInterception([original], snapshot);
  if (!fresh.ok || fresh.interceptions.length !== records.length) return null;
  const sameIdentity = (a, b) => a?.sceneId === b?.sceneId && a?.tokenId === b?.tokenId && a?.actorUuid === b?.actorUuid;
  if (fresh.interceptions.some((row, i) => !sameIdentity(row.intended, records[i]?.intended)
    || !sameIdentity(row.defender, records[i]?.defender) || row.effectId !== records[i]?.effectId
    || row.activationId !== records[i]?.activationId)) return null;
  const selected = args.targets[0], defender = fresh.targets[0];
  if (!defender || !Number.isFinite(defender.defense) || selected.sceneId !== defender.sceneId
    || selected.tokenId !== defender.tokenId || records.length && JSON.stringify(selected) !== JSON.stringify(defender)) return null;
  const token = scene.tokens.get(defender.tokenId);
  return { token, actor: token.actor, targets: fresh.targets, intercepted: records.length > 0 };
}
