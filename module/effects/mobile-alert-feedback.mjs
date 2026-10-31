import { MOBILE_ALERT_FLAG } from "../rules/mobile-alert.mjs";
import { MOBILE_FLARE_FLAG } from "../rules/mobile-alert-flare.mjs";
const FLAG = "mobileAlertFeedback";
const busy = new Set();
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const events = Object.freeze({ warning: "ability:mobile-alert-warning", arrival: "ability:mobile-alert-arrival", flare: "ability:mobile-alert-flare" });
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Claim a confirmed event before posting. Failure to post never replays the
 * warning, spends another Action or recreates a reinforcement. */
export async function postMobileAlertFeedback({ token, event } = {}) {
  if (!gmHere() || !token?.uuid || !events[event] || busy.has(token.uuid)) return null;
  busy.add(token.uuid);
  try {
    const scene = token.parent, actor = token.actor, alarm = token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG);
    const valid = () => gmHere() && scene?.tokens?.get(token.id) === token && token.actor === actor
      && token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG)?.cast === alarm?.cast;
    if (!valid() || !alarm?.cast || (event === "warning" ? alarm.phase !== "arming" : alarm.phase !== "summoned")) return null;
    if (event === "flare") {
      const light = [...(scene.lights?.values?.() ?? [])].find(row => {
        const state = row.getFlag("azeroth-rpg", MOBILE_FLARE_FLAG);
        return state?.ownerUuid === token.uuid && state.cast === alarm.cast && state.expires > game.time.worldTime;
      });
      if (!light) return null;
    }
    const previous = token.getFlag("azeroth-rpg", FLAG);
    if (previous?.cast === alarm.cast && previous.events?.[event]) return null;
    const receipt = { cast: alarm.cast, events: { ...(previous?.cast === alarm.cast ? previous.events : {}), [event]: "claimed" } };
    await token.setFlag("azeroth-rpg", FLAG, receipt);
    if (!valid() || JSON.stringify(token.getFlag("azeroth-rpg", FLAG)) !== JSON.stringify(receipt)) return null;
    const source = { sceneId: scene.id, tokenId: token.id, actorUuid: actor.uuid };
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
      content: `<p>${escape(game.i18n.localize(`AZEROTH.MobileAlert.Feedback.${event}`))}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: events[event],
        casting: false, success: true, targets: [], mobileAlert: { cast: alarm.cast, event } } } });
  } catch (error) {
    console.warn("azeroth-rpg | Alarm feedback failed; do not replay the completed operation", error);
    return null;
  } finally { busy.delete(token.uuid); }
}
