export const CRUSHRIDGE_SOURCE_REVIEW = "crushridgeSourceReview";
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const point = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);

/** Persist ambiguity before asking. Cancellation leaves the recorded event
 * available for a later explicit review; newly created tokens are not options. */
export async function selectCrushridgeDeathSource({ actor, sources, eventId, choose, observations } = {}) {
  if (!writer() || !actor?.uuid || !Array.isArray(sources) || !sources.length
    || !eventId || typeof choose !== "function") return null;
  const read = () => actor.getFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW);
  const held = read();
  if (held && held.eventId !== eventId && held.phase !== "complete") return null;
  let record = held?.eventId === eventId ? held : { eventId, phase: "pending", candidates: sources.map(token => ({
    uuid: token.uuid, point: point(token), observation: observations?.get(token.uuid) ?? null })) };
  if (record.phase === "selected") return null;
  if (record !== held) {
    await actor.setFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW, record);
    if (JSON.stringify(read()) !== JSON.stringify(record)) return null;
  }
  const current = () => values(game.scenes).flatMap(scene => values(scene.tokens));
  const valid = token => writer() && actor.system?.health?.value <= 0 && token.actor === actor
    && current().includes(token) && read()?.eventId === eventId && read()?.phase === "pending"
    && record.candidates.some(row => row.uuid === token.uuid && row.point === point(token));
  const options = sources.filter(valid);
  if (!options.length) return null;
  const answer = await choose({ name: "Crushridge death: fallen token", id: `${actor.id}-fallen-token` }, [
    ...options.map(token => ({ key: token.uuid, name: `${token.name ?? actor.name ?? "Ogre"} — ${token.parent?.name ?? "scene"}`,
      description: "Use this body as the source of the observed death." })),
    { key: "cancel", name: "Review later", description: "Keep this observed death pending without applying rage." }
  ], null);
  const selected = options.find(token => token.uuid === answer?.key);
  if (!selected || !valid(selected)) return null;
  record = { ...record, phase: "selected", sourceUuid: selected.uuid };
  await actor.setFlag("azeroth-rpg", CRUSHRIDGE_SOURCE_REVIEW, record);
  return writer() && JSON.stringify(read()) === JSON.stringify(record) ? selected : null;
}
