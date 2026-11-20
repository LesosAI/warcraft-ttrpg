/**
 * **THE SAN'LAYN'S BLOOD, ITS DOORS** (02 §5's thirteenth people, 08 §12's Blood vial; the plan's
 * A.6 items 4 and 9; D-1148 to D-1150). The law is `rules/sanlayn.mjs` and `rules/rest.mjs`; this
 * module writes.
 *
 * - `bloodFromResist`: Open Vein's Resist failing on a living creature adds the San'layn's unit
 *   (`AzerothActor#addBloodSinceRest`), once a creature a card, recorded on the card as
 *   `bloodGiven` and drawn there by `renderBloodLines`. Written here where this client may write
 *   both the card and the San'layn, else on the active GM's client through `azeroth-rpg.bloodUnit`,
 *   judged again there off the Test's own result message.
 * - `fillWithBlood`: **Fill with blood...** on a carried Vial, empty. The source is named through the
 *   one chooser, `rules/gm-writes.mjs#gmAbsentFor` is asked first, and the GM approves it through
 *   `azeroth-rpg.bloodFill`; on approval the GM's client puts the Blood vial in FIRST and takes the
 *   empty vial away after (D-745's order: a duplicate is curable and a loss is not), both through
 *   the bag law on `AzerothItem`'s batch seam.
 */

import { BLOOD_SOURCES, BLOOD_VIAL, bloodUnitDue, fillRefusal } from "../rules/sanlayn.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { spendOne } from "../rules/consumables.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";
import { creatureSnapshot } from "../rules/creature-kinds.mjs";
import { isLiving } from "../rules/essence.mjs";

const SCOPE = "azeroth-rpg";

/** The query a unit on a card this client may not write goes through. */
export const BLOOD_UNIT_QUERY = "azeroth-rpg.bloodUnit";
/** The query a vial's filling asks the GM through. */
export const BLOOD_FILL_QUERY = "azeroth-rpg.bloodFill";
/** How long a player waits on the GM's answer, and the GM's window closes itself before it. */
const FILL_WAIT_MS = 120000;
const FILL_ASK_MS = 110000;

/* -------------------------------------------- */
/*  Open Vein's unit                             */
/* -------------------------------------------- */

/** The slug a feature card files a Use under (`animation-records.mjs#featureKeyOf`'s). */
const slugOf = name => String(name ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * The `bloodUnit` row behind a feature card, read off the biter's OWN taken talent (never the
 * card): the talent whose name the card's `featureKey` files, holding a row that names a unit.
 *
 * @param {Actor|null} biter
 * @param {string|null} featureKey
 */
export function bloodUnitRowFor(biter, featureKey) {
  if (!biter || !featureKey) return null;
  for (const t of biter.items ?? []) {
    if (t.type !== "talent" || !((Number(t.system?.taken) || 0) > 0)) continue;
    if (slugOf(t.name) !== featureKey) continue;
    const row = talentEffect(t.system?.className ?? "", t.system?.identifier ?? "", t.system?.race ?? null);
    if (row?.bloodUnit) return { row: row.bloodUnit, talent: t };
  }
  return null;
}

/** Whether a creature is living (07: neither undead nor a construct). */
function livingActor(actor) {
  return isLiving(creatureSnapshot({ type: actor?.type ?? null, system: actor?.system ?? null, race: actor?.raceItem?.name ?? null }));
}

/** The line a unit given prints on the card. */
function unitLine({ target, name }) {
  return game.i18n.format("AZEROTH.Sanlayn.BloodUnitLine", { target, name });
}

/** Write the unit where this client may write the card and the biter. */
async function giveHere(message, biter, resister, units) {
  const given = [...(message.flags?.[SCOPE]?.bloodGiven ?? [])];
  given.push({ uuid: resister.uuid, name: resister.name ?? "" });
  await message.update({ [`flags.${SCOPE}.bloodGiven`]: given });
  await biter.addBloodSinceRest(units);
  return unitLine({ target: resister.name ?? "", name: biter.name ?? "" });
}

/**
 * **A FAILED RESIST ON OPEN VEIN'S CARD** (02 §5; D-1149): asked by `dice/chat.mjs#rollResists`
 * after the Test is recorded, on the client that rolled it. Guarded by the caller.
 *
 * @param {Actor|null} biter  the card's speaker
 * @param {{message: ChatMessage, resister: Actor, passed: boolean, result: ChatMessage|null}} o
 * @returns {Promise<string|null>}  the line said, or null
 */
export async function bloodFromResist(biter, { message = null, resister = null, passed = true, result = null } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  if (!biter || !resister || flags.kind !== "feature") return null;
  const found = bloodUnitRowFor(biter, flags.featureKey ?? null);
  if (!found) return null;
  const units = bloodUnitDue({
    row: found.row, failed: passed !== true, living: livingActor(resister),
    given: (flags.bloodGiven ?? []).map(g => g?.uuid), resister: resister.uuid
  });
  if (!units) return null;
  if (message.isOwner && biter.isOwner) return giveHere(message, biter, resister, units);
  if (gmAbsentFor({ owned: [message.isOwner === true, biter.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Sanlayn.BloodUnitNoGM", { name: biter.name ?? "" }));
    return null;
  }
  try {
    const done = await game.users.activeGM.query(BLOOD_UNIT_QUERY, { messageId: message.id, resisterUuid: resister.uuid, resultId: result?.id ?? null }, { timeout: 15000 });
    return done?.line ?? null;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * The GM-side handler (`BLOOD_UNIT_QUERY`): everything judged again here - the card's speaker holds
 * the talent, the Test's own result message names the resister and failed, the creature is living
 * and has not given its unit on this card - and the asker owns the creature that rolled.
 */
export async function bloodUnitQueryHandler({ messageId = null, resisterUuid = null, resultId = null } = {}, { user = null } = {}) {
  const message = messageId ? (game.messages?.get(messageId) ?? null) : null;
  if (!message) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  const resister = resisterUuid ? await fromUuid(resisterUuid) : null;
  const biter = ChatMessage.getSpeakerActor(message.speaker);
  if (!resister || !biter) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (user && !user.isGM && !resister.testUserPermission?.(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  const result = resultId ? (game.messages?.get(resultId) ?? null) : null;
  // **THE RESULT IS THE RESISTER'S OWN TEST ON THIS CARD** (the review's S4): its speaker is the resister and
  // its Resist record names this card, or no failure is read off it at all.
  const ofCard = Boolean(result) && result.flags?.[SCOPE]?.resistOf?.messageId === message.id
    && ChatMessage.getSpeakerActor(result.speaker)?.uuid === resister.uuid;
  const failed = ofCard ? result.rolls?.[0]?.outcome?.success === false : false;
  const flags = message.flags?.[SCOPE] ?? {};
  const found = bloodUnitRowFor(biter, flags.featureKey ?? null);
  const units = found ? bloodUnitDue({
    row: found.row, failed, living: livingActor(resister),
    given: (flags.bloodGiven ?? []).map(g => g?.uuid), resister: resister.uuid
  }) : 0;
  if (!units) return { line: null };
  return { line: await giveHere(message, biter, resister, units) };
}

/**
 * **THE UNIT LINES ON OPEN VEIN'S CARD** (*{target} gave {name} 1 unit of blood for the next Short
 * Rest*): drawn from the card's `bloodGiven` record on every render, so every client reads the
 * same words. Registered once by `registerBloodHooks`.
 */
export function renderBloodLines(message, html) {
  const given = message?.flags?.[SCOPE]?.bloodGiven;
  if (!Array.isArray(given) || !given.length || !html?.querySelector) return;
  const body = html.querySelector(".azeroth-card-body") ?? html.querySelector(".azeroth-card") ?? html;
  if (body.querySelector("[data-blood-unit]")) return;
  const biter = message.speaker?.alias ?? ChatMessage.getSpeakerActor(message.speaker)?.name ?? "";
  for (const g of given) {
    const p = document.createElement("p");
    p.className = "azeroth-drain";
    p.dataset.bloodUnit = g?.uuid ?? "";
    p.textContent = unitLine({ target: g?.name ?? "", name: biter });
    body.append(p);
  }
}

/* -------------------------------------------- */
/*  Fill with blood                              */
/* -------------------------------------------- */

/** The source rows for the one chooser, each its 08 §12 words. */
function sourceOptions() {
  return BLOOD_SOURCES.map(key => ({
    key,
    name: game.i18n.localize(`AZEROTH.BloodFill.Source.${key}`),
    description: game.i18n.localize(`AZEROTH.BloodFill.SourceNote.${key}`)
  }));
}

/**
 * **FILL WITH BLOOD...** (08 §12: *A Vial, empty filled from a source the GM approves becomes a Blood
 * vial*; D-1150). Judged whole before anything is asked: a blood-fed character, a Vial, empty it
 * carries, a source named, and a GM online to approve it.
 *
 * @param {Actor} actor
 * @param {Item} item  the Vial, empty
 * @param {{source?: string|null}} [o]  the source, or null to ask through the one chooser
 * @returns {Promise<{ok: boolean, reason: string|null}>}
 */
export async function fillWithBlood(actor, item, { source = null } = {}) {
  const say = (key, data = {}) => {
    const words = game.i18n.format(key, { name: actor?.name ?? "", vial: item?.name ?? "", ...data });
    ui.notifications?.warn(words);
    return { ok: false, reason: words };
  };
  const gmAbsent = gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
  // Everything but the source first, so a refusal never opens the chooser.
  const early = fillRefusal({ bloodFed: actor?.system?.bloodFed === true, item, owned: actor?.items?.get(item?.id) === item, source: BLOOD_SOURCES[0], gmAbsent });
  if (early) return say(early);
  let pick = source;
  if (!pick) {
    const { chooseOption } = game.system.azeroth.workflows;
    const chosen = await chooseOption({ id: `blood-fill-${item.id}`, name: game.i18n.localize("AZEROTH.BloodFill.Title") }, sourceOptions(),
      game.i18n.localize("AZEROTH.BloodFill.Note"), { label: "AZEROTH.BloodFill.Ask", prompt: game.i18n.format("AZEROTH.BloodFill.Prompt", { name: actor.name }) });
    if (!chosen) return { ok: false, reason: null };
    pick = chosen.key;
  }
  const refused = fillRefusal({ bloodFed: true, item, owned: true, source: pick, gmAbsent });
  if (refused) return say(refused);
  try {
    const answer = await game.users.activeGM.query(BLOOD_FILL_QUERY, { actorUuid: actor.uuid, itemId: item.id, source: pick }, { timeout: FILL_WAIT_MS });
    if (answer?.ok) {
      ui.notifications?.info(game.i18n.format("AZEROTH.BloodFill.Filled", { name: actor.name, source: game.i18n.localize(`AZEROTH.BloodFill.Source.${pick}`) }));
      return { ok: true, reason: null };
    }
    return say(answer?.reason ?? "AZEROTH.BloodFill.Refuse.denied");
  } catch (err) {
    return say("AZEROTH.BloodFill.Refuse.noAnswer", { error: err.message });
  }
}

/** The Blood vial's data, from the gear pack by identifier, or null. */
async function bloodVialData() {
  const pack = game.packs.get("azeroth-rpg.gear");
  if (!pack) return null;
  const index = await pack.getIndex({ fields: ["system.identifier"] });
  const entry = index.find(e => e.system?.identifier === BLOOD_VIAL);
  const doc = entry ? await pack.getDocument(entry._id) : null;
  if (!doc) return null;
  const data = doc.toObject();
  delete data._id;
  data.system = { ...data.system, quantity: 1, container: null, equipped: false, well: null };
  return data;
}

/**
 * Ask the GM. A GM asking for their own character is their own approval; a player's request opens
 * a window naming the character, the vial and the source, which closes itself as *no* before the
 * player stops waiting (the blow-ask rule).
 */
async function gmApproves({ actor, source, user }) {
  if (!user || user.isGM) return true;
  const { DialogV2 } = foundry.applications.api;
  const words = game.i18n.format("AZEROTH.BloodFill.GMAsk", { player: user.name ?? "", name: actor.name, source: game.i18n.localize(`AZEROTH.BloodFill.Source.${source}`) });
  let dialog = null;
  const asked = DialogV2.confirm({
    window: { title: game.i18n.localize("AZEROTH.BloodFill.Title") },
    content: `<p>${foundry.utils.escapeHTML(words)}</p>`,
    rejectClose: false,
    render: (event, d) => { dialog = d; }
  });
  const timer = new Promise(resolve => setTimeout(() => { Promise.resolve(dialog?.close?.()).catch(() => {}); resolve(false); }, FILL_ASK_MS));
  return (await Promise.race([asked, timer])) === true;
}

/**
 * The GM-side handler (`BLOOD_FILL_QUERY`): judged again here off the actor as it stands - a
 * blood-fed character the asker owns, a Vial, empty it carries, a source of 08 §12's - then the
 * GM's approval, then the Blood vial in, then the empty vial out.
 */
export async function bloodFillQueryHandler({ actorUuid = null, itemId = null, source = null } = {}, { user = null } = {}) {
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  const item = actor?.items?.get(itemId) ?? null;
  const owned = Boolean(actor) && (!user || user.isGM || actor.testUserPermission?.(user, "OWNER") === true);
  const refused = fillRefusal({ bloodFed: actor?.system?.bloodFed === true, item, owned, source, gmAbsent: false });
  if (refused) return { ok: false, reason: refused };
  // **ONE FILL IN FLIGHT A VIAL** (the review's S5): a second press while the GM's window stands is refused.
  const key = `${actor.uuid}.${item.id}`;
  if (FILLS_IN_FLIGHT.has(key)) return { ok: false, reason: "AZEROTH.BloodFill.Refuse.inFlight" };
  FILLS_IN_FLIGHT.add(key);
  try {
    return await fillApproved({ actor, item, source, user, owned });
  } finally {
    FILLS_IN_FLIGHT.delete(key);
  }
}

/** The vials being filled on this (the GM's) client, `<actor uuid>.<item id>`. */
const FILLS_IN_FLIGHT = new Set();

/** The GM's approval, the vial judged AGAIN as it stands after it, then the Blood vial in and the empty vial out. */
async function fillApproved({ actor, item, source, user, owned }) {
  if (!(await gmApproves({ actor, source, user }))) return { ok: false, reason: "AZEROTH.BloodFill.Refuse.denied" };
  // The window may stand for 110 seconds: the vial used or dropped meanwhile makes nothing (the review's S5).
  const still = actor.items.get(item.id) ?? null;
  const again = fillRefusal({ bloodFed: actor.system?.bloodFed === true, item: still, owned, source, gmAbsent: false });
  if (again) return { ok: false, reason: again };
  // FIRST the Blood vial: onto a stack already carried where there is one, else a new one from the
  // pack. A refusal by the bag law leaves the empty vial where it was.
  const stack = actor.items.find(i => i.type === "gear" && i.system?.identifier === BLOOD_VIAL && !i.system?.container) ?? null;
  if (stack) {
    const before = stack.system?.quantity ?? 1;
    await stack.update({ "system.quantity": before + 1 });
    if ((actor.items.get(stack.id)?.system?.quantity ?? before) !== before + 1) return { ok: false, reason: "AZEROTH.BloodFill.Refuse.noRoom" };
  } else {
    const data = await bloodVialData();
    if (!data) return { ok: false, reason: "AZEROTH.BloodFill.Refuse.noPack" };
    const made = await actor.createEmbeddedDocuments("Item", [data]);
    if (!made?.length) return { ok: false, reason: "AZEROTH.BloodFill.Refuse.noRoom" };
  }
  // THEN the empty vial, through `useGear`'s own mark-off rule.
  const live = actor.items.get(item.id);
  if (live) {
    const spend = spendOne(live.system?.quantity ?? 1);
    if (spend?.delete) await live.delete();
    else if (spend) await live.update({ "system.quantity": spend.quantity });
  }
  return { ok: true, reason: null };
}


/** The render hook that draws Open Vein's unit lines, registered once at init. */
export function registerBloodHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { renderBloodLines(message, html); } catch (err) { console.warn("azeroth-rpg | a blood unit line", err); }
  });
}
