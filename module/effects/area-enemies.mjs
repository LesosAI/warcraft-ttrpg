/** GM review of the entire burst area, independent of selected targets. */
import { feetApart } from "../canvas/footprints.mjs";

export async function reviewNearbyEnemies({ actor, scene, sourceToken, chooseOption, name, radius, payment,
  measure = feetApart, validOrigin = () => true, areaLabel = null, automatic = false, innerRadius = null, allowEmpty = false,
  includeToken = () => true }) {
  if (typeof name !== "string" || !name || !Number.isFinite(radius) || radius <= 0 || typeof payment !== "string" || !payment) return { ok: false, reason: "configuration" };
  if (innerRadius !== null && (!Number.isFinite(innerRadius) || innerRadius < 0 || innerRadius >= radius)) return { ok: false, reason: "configuration" };
  if (typeof includeToken !== "function") return { ok: false, reason: "configuration" };
  const sourceValid = () => !!actor?.uuid && scene?.tokens?.get(sourceToken?.id) === sourceToken
    && sourceToken.actor === actor && validOrigin();
  const scan = () => {
    if (!sourceValid()) return null;
    const rows = [];
    for (const token of scene.tokens.values()) {
      if (!token.actor?.uuid || token.actor.uuid === actor.uuid) continue;
      if (!includeToken(token)) continue;
      const distance = measure(sourceToken, token);
      // An unmeasurable creature cannot silently disappear from an area review.
      if (!Number.isFinite(distance) || distance < 0) return null;
      if (distance <= radius && (innerRadius === null || distance > innerRadius)) rows.push({ token, actor: token.actor,
        actorUuid: token.actor.uuid, distance });
    }
    return rows;
  };
  const initial = scan();
  if (!initial) return { ok: false, reason: "sourceOrDistance" };
  const valid = () => {
    const current = scan();
    return !!current && current.length === initial.length && initial.every(row =>
      current.some(now => now.token === row.token && now.actor === row.actor));
  };
  const menu = { id: `${actor.id}-area-enemies`, name: name };
  const reviewed = new Map();
  for (const row of initial) {
    if (reviewed.has(row.actorUuid)) continue;
    const answer = await chooseOption(menu, [
      { key: "other", name: "Ally or neutral creature", description: `${name} does not affect this creature.` },
      { key: "enemy", name: "Enemy", description: `This creature must resist ${name}.` }
    ], null, { prompt: `GM: How does ${row.token.name} relate to ${actor.name}?` });
    if (!answer) return { ok: false, reason: "cancelled" };
    if (!["other", "enemy"].includes(answer.key)) return { ok: false, reason: "classification" };
    if (!valid()) return { ok: false, reason: "changedArea" };
    reviewed.set(row.actorUuid, answer.key === "enemy");
  }
  const seen = new Set();
  const targets = initial.filter(row => {
    if (!reviewed.get(row.actorUuid) || seen.has(row.actorUuid)) return false;
    seen.add(row.actorUuid); return true;
  });
  if (!targets.length && !allowEmpty) return { ok: false, reason: "empty" };
  const confirm = await chooseOption(menu, [
    { key: "cancel", name: "Cancel", description: automatic ? "Stop and report this event as unresolved." : "Keep the action and use." },
    { key: "burst", name: `${automatic ? "Resolve" : "Use"} ${name}`, description: `${targets.length ? `Affect ${targets.map(row => row.token.name).join(", ")}.` : "Place the area with no enemies currently inside."} ${payment}` }
  ], null, { prompt: `Confirm all enemies ${areaLabel ?? `within ${radius} feet`} before ${automatic ? "resolving the event" : "paying"}.` });
  if (confirm?.key !== "burst") return { ok: false, reason: "cancelled" };
  if (!valid()) return { ok: false, reason: "changedArea" };
  return { ok: true, targets, valid };
}
