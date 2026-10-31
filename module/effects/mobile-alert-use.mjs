import { MOBILE_ALERT } from "../rules/mobile-alert.mjs";
import { startMobileAlert } from "./mobile-alert-start.mjs";
import { placeMobileSentries } from "../documents/mobile-alert-sentries.mjs";
import { recoverMobileAlert } from "../documents/mobile-alert-recovery.mjs";
import { ensureMobileFlare } from "./mobile-alert-flare.mjs";
import { postMobileAlertFeedback } from "./mobile-alert-feedback.mjs";

export const MOBILE_ALERT_QUERY = "azeroth-rpg.mobileAlert";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function requestMobileAlert(actor, index) {
  const { chooseOption } = await import("../dice/workflows.mjs");
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  const source = sourceOf(actor);
  const options = [
    { key: "start", name: "Raise alarm", description: "Spend an Action after the GM confirms a detected intruder." },
    { key: "resolve", name: "Resolve pending alarm", description: "Complete a due alarm after reviewing the two sentry positions. This does not start a new alarm." }
  ];
  if (game.user.isGM) options.push(
    { key: "recover", name: "Review interrupted alarm", description: "Find the existing sentries without creating, healing or moving them." },
    { key: "reset", name: "Reset alarm", description: "Outside combat, remove this alarm's reviewed sentries and clear its record. No Action is refunded." }
  );
  const choice = await chooseOption({ name: MOBILE_ALERT.name, actor }, options, null);
  if (!choice || !options.some(option => option.key === choice.key)) return null;
  const data = { actorUuid: actor.uuid, index, source, operation: choice.key };
  try {
    const result = gmHere() ? await mobileAlertQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(MOBILE_ALERT_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn("The alarm operation did not finish. Check its saved state before retrying; an interrupted payment or summon needs GM review.");
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Mobile Alert request", error);
    ui.notifications?.warn("The alarm operation could not be confirmed. Ask the GM to review its record before retrying.");
    return null;
  }
}

export async function mobileAlertQueryHandler({ actorUuid, index, source, operation } = {}, { user } = {}) {
  if (!gmHere() || !user?.id || !["start", "resolve", "recover", "reset"].includes(operation)) return { ok: false, reason: "authority" };
  if (["recover", "reset"].includes(operation) && !user.isGM) return { ok: false, reason: "gmOnly" };
  const actor = await fromUuid(actorUuid), scene = game.scenes?.get(source?.sceneId), token = scene?.tokens?.get(source?.tokenId);
  const valid = () => gmHere() && actor?.type === "npc" && actor.documentName === "Actor"
    && actor.testUserPermission(user, "OWNER") && fromUuidSync(actorUuid) === actor
    && game.scenes?.get(scene?.id) === scene && scene?.tokens?.get(token?.id) === token && token?.actor === actor
    && Number.isInteger(index) && actor.system.creatureAbilities?.[index]?.name === MOBILE_ALERT.name;
  if (!valid()) return { ok: false, reason: "source" };
  if (operation === "start") return startMobileAlert({ token, user, valid });
  const { chooseOption } = await import("../dice/workflows.mjs");
  const menu = { name: MOBILE_ALERT.name, actor };
  if (operation === "resolve") {
    // A completed summon may still need its independently claimed light
    // reconciled. Never place the sentries again to recover that light.
    if (token.getFlag?.("azeroth-rpg", "mobileAlert")?.phase === "summoned") {
      const flare = await ensureMobileFlare({ token, valid });
      if (flare.ok && !flare.expired) await postMobileAlertFeedback({ token, event: "flare" });
      return flare;
    }
    const result = await placeMobileSentries({ token, valid,
    review: async ({ spots }) => {
      const locations = spots.map(spot => {
        const horizontal = spot.x > token.x ? "east" : spot.x < token.x ? "west" : "";
        const vertical = spot.y > token.y ? "south" : spot.y < token.y ? "north" : "";
        return [vertical, horizontal].filter(Boolean).join("-") || "at the alarm";
      });
      const picked = await chooseOption(menu, [
        { key: "cancel", name: "Cancel placement", description: "Keep the pending alarm for review." },
        { key: "place", name: "Place two sentries", description: `Positions: ${locations.join(" and ")}. Confirm both spaces are on accessible ground and clear of walls.` }
      ], null, { prompt: "GM: Review the proposed sentry spaces before placement." });
      return valid() && picked?.key === "place";
    } });
    if (!result?.ok) return result;
    await postMobileAlertFeedback({ token, event: "arrival" });
    const flare = await ensureMobileFlare({ token, valid });
    if (flare.ok && !flare.expired) await postMobileAlertFeedback({ token, event: "flare" });
    return { ...result, ok: flare.ok, flare };
  }
  return recoverMobileAlert({ token, operation, review: async ({ prompt, plan }) => {
    const picked = await chooseOption(menu, [
      { key: "cancel", name: "Cancel", description: "Leave the alarm and sentries unchanged." },
      { key: "confirm", name: operation === "reset" ? "Confirm reset" : "Confirm recovery",
        description: operation === "reset" ? `Remove ${plan.tokens?.length ?? 0} owned sentries and clear the alarm. No refund or healing.` : "Retain the existing sentries and their current Health." }
    ], null, { prompt });
    return valid() && picked?.key === "confirm";
  } });
}
