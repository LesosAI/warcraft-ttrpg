import { verifiedResist } from "../dice/annotate.mjs";
import { laySeduction } from "./seduction.mjs";

export const SEDUCTION_QUERY = "azeroth-rpg.seductionDelivery";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const tokenOf = ref => ref?.sceneId && ref?.tokenId
  ? game.scenes.get(ref.sceneId)?.tokens.get(ref.tokenId) ?? null : null;

/** Accept card IDs only; resolve actors, failure and source on the GM. */
export async function seductionQueryHandler({ messageId, resultId } = {}, { user } = {}) {
  if (!gmHere() || !user) return { ok: false, reason: "authority" };
  const message = game.messages.get(messageId);
  const flags = message?.flags?.["azeroth-rpg"];
  if (flags?.kind !== "ability" || flags.featureKey !== "ability:seduction"
    || flags.list !== "creatureAbilities" || flags.targets?.length !== 1)
    return { ok: false, reason: "wrongCard" };
  const sourceToken = tokenOf(flags.source), targetToken = tokenOf(flags.targets[0]);
  const by = sourceToken?.actor, victim = targetToken?.actor;
  const ability = by?.system?.creatureAbilities?.[flags.index];
  if (!by || !victim || sourceToken.parent !== targetToken.parent || ability?.name !== "Seduction"
    || ability.automation?.resist !== "spirit" || ability.automation?.dc !== 15
    || !victim.testUserPermission(user, "OWNER")) return { ok: false, reason: "targetOrSource" };
  const checked = await verifiedResist({ messageId, resultId, user });
  const result = game.messages.get(resultId);
  if (!checked.ok || checked.record?.success !== false || checked.record?.dc !== 15
    || result?.rolls?.[0]?.outcome?.success !== false)
    return { ok: false, reason: "notFailedResistance" };
  // The delivery receipt changes the card itself, so exclude it from the
  // validation snapshot while retaining the original source and roll evidence.
  const evidence = () => {
    const { seductionDeliveries, ...rest } = message.flags["azeroth-rpg"];
    return JSON.stringify({ flags: rest, roll: result.rolls[0].toJSON?.() ?? result.rolls[0] });
  };
  const before = evidence();
  const delivered = await laySeduction({ victim, by, sourceToken, targetToken, message,
    valid: () => gmHere() && game.messages.get(messageId) === message && game.messages.get(resultId) === result
      && tokenOf(flags.source) === sourceToken && tokenOf(flags.targets[0]) === targetToken
      && sourceToken.actor === by && targetToken.actor === victim
      && victim.testUserPermission(user, "OWNER") && evidence() === before });
  if (delivered.ok) {
    try {
      const { postSeductionFeedback } = await import("./seduction-feedback.mjs");
      await postSeductionFeedback({ victim, by, message, effectId: delivered.effectId });
    } catch (error) {
      console.warn("azeroth-rpg | Seduction applied, but feedback could not be posted", error);
    }
  }
  return delivered;
}

export async function requestSeduction({ message, result } = {}) {
  const gm = game.users?.activeGM;
  if (!gm || !message?.id || !result?.id) return { ok: false, reason: "noGMOrResult" };
  const payload = { messageId: message.id, resultId: result.id };
  try {
    return gmHere() ? await seductionQueryHandler(payload, { user: game.user })
      : await gm.query(SEDUCTION_QUERY, payload, { timeout: 15000 });
  } catch (error) {
    console.warn("azeroth-rpg | Seduction request could not be confirmed", error);
    return { ok: false, reason: "writeUncertain" };
  }
}
