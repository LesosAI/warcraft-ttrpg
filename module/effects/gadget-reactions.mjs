/** A stabilizer answers one pending Prone application on its owner's client. */
import { ASK_MS, answererOf, confirmHere } from "./blow-doors.mjs";

export const STABILIZER_QUERY = "azeroth-rpg.stabilizer";
const pending = new Set();
const triggered = new Set();
export const stabilizerIsTriggered = actor => triggered.has(actor?.uuid);

function deviceOf(actor) {
  return actor?.items?.find(i => i.type === "feature"
    && i.getFlag("azeroth-rpg", "feature")?.gadget === "gyroscopic-stabilizer") ?? null;
}

function ready(actor) {
  const item = deviceOf(actor);
  return actor?.isOwner && !actor.statuses?.has("prone") && actor.system?.health?.value > 0
    && item?.system?.uses?.value > 0
    && game.system.azeroth.workflows.turnBudgetRefusal(actor, "reaction") === null;
}

export async function askStabilizer(actor) {
  if (!deviceOf(actor) || actor.statuses?.has("prone")) return false;
  const who = answererOf(actor);
  if (!who) return false;
  const payload = { actorUuid: actor.uuid };
  try {
    const answer = who.id === game.user.id
      ? await stabilizerQueryHandler(payload, { user: game.user })
      : await who.query(STABILIZER_QUERY, payload, { timeout: ASK_MS });
    return answer?.prevented === true;
  } catch (err) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.BlowDoor.NoAnswer", { name: actor.name, reason: err.message }));
    return false;
  }
}

export async function stabilizerQueryHandler({ actorUuid } = {}, { user = null } = {}) {
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if (actor?.documentName !== "Actor" || !actor.isOwner
    || (user && !actor.testUserPermission(user, "OWNER"))) return { prevented: false };
  if (pending.has(actor.uuid) || !ready(actor)) return { prevented: false };
  pending.add(actor.uuid);
  try {
    const item = deviceOf(actor);
    const accepted = await confirmHere(actor, {
      title: item.name,
      text: game.i18n.format("AZEROTH.Gadget.StabilizerAsk", { name: actor.name })
    });
    if (!accepted || !ready(actor)) return { prevented: false };
    triggered.add(actor.uuid);
    const card = await game.system.azeroth.workflows.useFeature({ actor, item: deviceOf(actor) });
    return { prevented: Boolean(card) };
  } finally {
    triggered.delete(actor.uuid);
    pending.delete(actor.uuid);
  }
}
