export const ANNIHILATOR_RESERVATION_QUERY = "azeroth-rpg.annihilatorReservation";
export const ANNIHILATOR_RESERVATION_FLAG = "annihilatorReservation";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Serialize attacks across clients. An uncertain write leaves the reservation
 * held for GM review: time passing cannot prove that an attack did not happen. */
export async function annihilatorReservationQueryHandler(data = {}, { user } = {}) {
  const { tokenUuid, requestId, operation } = data;
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()
    || requestId.length > 128 || !["reserve", "cancel", "commit", "review"].includes(operation)) return { ok: false, reason: "request" };
  if (operation === "review" && user.isGM !== true) return { ok: false, reason: "permission" };
  const token = resolve(tokenUuid), actor = token?.actor;
  const current = () => gmHere() && resolve(tokenUuid) === token && token.actor === actor
    && token.documentName === "Token" && token.parent?.tokens?.get(token.id) === token
    && actor?.testUserPermission(user, "OWNER") && actor.type === "npc"
    && actor.system?.creatureAbilities?.some(row => row.name === "Shifting Aggression");
  if (!token || !current()) return { ok: false, reason: "permission" };
  if (busy.has(tokenUuid)) return { ok: false, reason: "busy" };
  busy.add(tokenUuid);
  try {
    const held = token.getFlag("azeroth-rpg", ANNIHILATOR_RESERVATION_FLAG) ?? null;
    if (operation === "reserve") {
      if (held?.phase === "reserved") return { ok: false, reason: "busy" };
      const reservation = { requestId, userId: user.id, phase: "reserved" };
      await token.update({ [`flags.azeroth-rpg.${ANNIHILATOR_RESERVATION_FLAG}`]: reservation });
      if (!current() || !equal(token.getFlag("azeroth-rpg", ANNIHILATOR_RESERVATION_FLAG), reservation)) return { ok: false, reason: "record" };
      return { ok: true, previous: token.getFlag("azeroth-rpg", "annihilatorTarget") ?? null };
    }
    if (held?.phase !== "reserved" || held.requestId !== requestId
      || (operation !== "review" && held.userId !== user.id)) return { ok: false, reason: "reservation" };
    if (operation === "review" && data.stopped !== true) return { ok: false, reason: "review" };
    let state = null;
    if (operation === "commit" || (operation === "review" && data.cardUuid)) {
      const card = resolve(data.cardUuid), flags = card?.flags?.["azeroth-rpg"];
      const target = resolve(data.targetId);
      const fight = actor.activeFight?.() ?? null;
      const scope = `${token.parent.id}:${token.id}:${fight?.id ?? "outside-combat"}`;
      if (data.scope !== scope || card?.documentName !== "ChatMessage" || card.author?.id !== held.userId
        || flags?.kind !== "attack" || flags?.source?.sceneId !== token.parent.id || flags?.source?.tokenId !== token.id
        || !target?.actor || target.parent !== token.parent
        || !flags.targets?.some(ref => ref.sceneId === token.parent.id && ref.tokenId === target.id)) return { ok: false, reason: "card" };
      state = { scope, targetId: target.uuid, cardUuid: card.uuid };
    }
    const finished = { ...held, phase: state ? "committed" : "cancelled",
      ...(operation === "review" ? { reviewedBy: user.id, reviewedAt: Date.now(), cardUuid: state?.cardUuid ?? null } : {}) };
    await token.update({ [`flags.azeroth-rpg.${ANNIHILATOR_RESERVATION_FLAG}`]: finished,
      ...(state ? { "flags.azeroth-rpg.annihilatorTarget": state } : {}) });
    if (!current() || !equal(token.getFlag("azeroth-rpg", ANNIHILATOR_RESERVATION_FLAG), finished)
      || (state && !equal(token.getFlag("azeroth-rpg", "annihilatorTarget"), state))) return { ok: false, reason: "record" };
    return { ok: true };
  } catch (error) {
    console.warn("azeroth-rpg | Lava Annihilator reservation", error);
    return { ok: false, reason: "record" };
  } finally { busy.delete(tokenUuid); }
}

export async function requestAnnihilatorReservation(data) {
  try {
    return gmHere() ? await annihilatorReservationQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ANNIHILATOR_RESERVATION_QUERY, data, { timeout: 30000 }) ?? { ok: false, reason: "gm" };
  } catch { return { ok: false, reason: "record" }; }
}

/** A busy attack offers the GM a review, never an automatic retry or refund. */
export async function reviewAnnihilatorReservation(token) {
  if (game.user?.isGM !== true || !token?.actor) return false;
  const held = token.getFlag("azeroth-rpg", ANNIHILATOR_RESERVATION_FLAG);
  if (held?.phase !== "reserved") return false;
  const { chooseOption } = await import("../dice/workflows.mjs");
  const localize = key => game.i18n.localize(`AZEROTH.LavaAnnihilator.${key}`);
  const options = [
    { key: "keep", name: localize("Keep"), description: localize("KeepHint") },
    { key: "cancel", name: localize("NoAttack"), description: localize("NoAttackHint") }
  ];
  const cards = new Map();
  for (const card of [...(game.messages?.contents ?? [])].reverse()) {
    const flags = card.flags?.["azeroth-rpg"];
    if (card.author?.id !== held.userId || flags?.kind !== "attack"
      || flags.source?.sceneId !== token.parent.id || flags.source?.tokenId !== token.id
      || flags.targets?.length !== 1) continue;
    const ref = flags.targets[0], target = token.parent.tokens.get(ref.tokenId);
    if (ref.sceneId !== token.parent.id || !target?.actor) continue;
    const key = `card:${card.id}`;
    cards.set(key, { cardUuid: card.uuid, targetId: target.uuid });
    options.push({ key, name: `${target.name ?? target.actor.name} — ${new Date(card.timestamp).toLocaleString()}`,
      description: game.i18n.format("AZEROTH.LavaAnnihilator.CardHint", { id: card.id }) });
  }
  const answer = await chooseOption({ id: token.id, name: localize("ReviewTitle") }, options, null,
    { prompt: localize("ReviewPrompt") });
  if (!answer || answer.key === "keep" || (answer.key !== "cancel" && !cards.has(answer.key))) return false;
  if (!equal(token.getFlag("azeroth-rpg", ANNIHILATOR_RESERVATION_FLAG), held)) return false;
  const fight = token.actor.activeFight?.() ?? null;
  const result = await requestAnnihilatorReservation({ operation: "review", tokenUuid: token.uuid,
    requestId: held.requestId, stopped: true,
    scope: `${token.parent.id}:${token.id}:${fight?.id ?? "outside-combat"}`,
    ...(cards.get(answer.key) ?? {}) });
  if (result?.ok) ui.notifications?.info(localize("Reviewed"));
  else ui.notifications?.warn(localize("record"));
  return result?.ok === true;
}
