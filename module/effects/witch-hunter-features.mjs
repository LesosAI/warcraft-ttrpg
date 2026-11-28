/**
 * **THE WITCH HUNTER'S CLASS FEATURES, AS DOORS** (02 §7; the Witch Hunter plan's G1, G2, G3; wave 2a-B, D-2070 to
 * D-2077). The law is `rules/witch-hunter-features.mjs` (`exposeWeakness`, `medallionPulse`, `medallionSenses`,
 * `warningRefusal`, `trailRecord`, `learnTypeRefusal`), `rules/tome.mjs#readTrailOutcome` and wave 2a-A's
 * `rules/witch-hunter-standing.mjs` (the Tome's flag, The Last Hunt's flag); this module is the ONE writer for:
 *
 * - **A Use judged before anything is paid and landed once it is** (D-768): `judgeWitchHunterUse` from
 *   `workflows.useFeature`'s judgement step and `landWitchHunterUse` after its budget, as the Demon Hunter's doors
 *   are. The Signs (`effects/witch-hunter-signs.mjs`), **Expose Weakness**, the **Medallion**'s pulse, **Whirling
 *   Steel** (whose attacks are the card's own, D-773) and **The Last Hunt**.
 * - **Read the Trail**, its own door from the Use (Inscribed Runeweapon's shape): the **Investigation** Test through
 *   the roll dialog, then a card saying the Standard DC and the verdict, what the scene reveals left to the GM (D2
 *   §12, a named GM call the lead approved), and on a Hard result a GM-only **Learn the type** button.
 * - **The Medallion's cast watcher** on the active GM's client: a spell card or a casting feature's card posted by a
 *   creature within 60 feet of a Witch Hunter wearing the medallion in the Neck slot whispers that hunter's owners
 *   the direction and the school, with a **Warn an ally** button whose row names its audience
 *   (`data-reaction-owner`, D-779). The press spends the Reaction and lays a one-shot Boon flag on the ally, keyed
 *   to the spell's card, which the ally's Resist on THAT card reads and spends (`dice/chat.mjs#rollResists`).
 * - **The Last Hunt's minute**: an effect on the hunter carrying wave 2a-A's `LAST_HUNT_FLAG` (`capFor`'s and
 *   `studiedTypes`' one carrier), spanned by a minute of the fight or the world's clock and ended with its fight;
 *   when it goes, the Tempo is clipped to the cap it falls back to (`tempo.mjs#tempoClip`).
 *
 * Every write on a creature this client does not own goes through `WH_FEATURES_QUERY` on the active GM's client,
 * with `gm-writes.mjs#gmAbsentFor` asked first; the handler works every number out again off the hunter's sheet.
 */

import {
  EXPOSE_WEAKNESS_RULE, MEDALLION_FEATURE, MEDALLION_RULE, THE_LAST_HUNT_RULE, WARNED_FLAG, exposeWeakness, learnTypeRefusal,
  medallionPulse, medallionSenses, trailRecord, warnedFor, warningRefusal, whisperingSense
} from "../rules/witch-hunter-features.mjs";
import { whisperingOf } from "../rules/type-boons.mjs";
import { EXPOSE_WEAKNESS, READ_THE_TRAIL, READ_THE_TRAIL_RULE, TOME_SKILL, CREATURE_TYPES, readTrailOutcome, typeOf } from "../rules/tome.mjs";
import { LAST_HUNT_FLAG, cleanTome, lastHuntStands, tomeFlagOf } from "../rules/witch-hunter-standing.mjs";
import { wornMedallion } from "../rules/medallion.mjs";
import { TEMPO, URSINE_FURY, tempoCap, tempoClip } from "../rules/tempo.mjs";
import { VULNERABLE_FLAG } from "../rules/laid-vulnerable.mjs";
import { REST_ENDS_FLAG } from "../rules/rest-ends.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { compassOf } from "../rules/demon-hunter-spells.mjs";
import { MEDALLION_WARN_KEY } from "../rules/witch-hunter-animations.mjs";
import { AZEROTH } from "../config.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);
const int = v => Math.trunc(Number(v)) || 0;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The query every write on another client's creature is asked through (`module/queries.mjs`). */
export const WH_FEATURES_QUERY = "azeroth-rpg.witchHunterFeatures";

/** The flag Expose Weakness's laid Vulnerable carries beside `laid-vulnerable.mjs`' own: `{by}`. */
export const EXPOSED_FLAG = "whExposed";

/** Whether the actor holds a feature by name. */
const holds = (actor, name) => Boolean(actor?.items?.some?.(i => i.type === "feature" && i.name === name));

/** Refuse in words and answer null (D-768: nothing is spent). */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/** Whether a write on these actors needs a GM and none is online (`gm-writes.mjs#gmAbsentFor`). */
function gmMissing(actors = []) {
  return gmAbsentFor({ owned: actors.filter(Boolean).map(a => a.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
}

/** The type a creature is (`tome.mjs#typeOf`, the ONE reading), its people handed in for a character. */
export function typeOfActor(actor) {
  if (!actor) return null;
  const race = actor.type === "character" ? (actor.items?.find?.(i => i.type === "race")?.system?.identifier ?? null) : null;
  return typeOf({ type: actor.type, system: actor.system, race });
}

/** The Tome as stored, read whole (`witch-hunter-standing.mjs#cleanTome`). */
function tomeOf(actor) {
  // The carried First Tome's types included (`tomeFlagOf`, D-2162).
  return cleanTome(tomeFlagOf(actor));
}

/** The token the hunter acts from on the viewed board, or null. */
function boardToken(actor) {
  const token = actor?.getActiveTokens?.(true)?.[0] ?? null;
  return token && token.document?.parent?.id === globalThis.canvas?.scene?.id ? token : null;
}

/** Ask the active GM through `WH_FEATURES_QUERY`; null where none answers. */
async function askGM(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) return null;
  try {
    return await gm.query(WH_FEATURES_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  A Use, judged and landed                                            */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A WITCH HUNTER'S USE NEEDS, ASKED BEFORE ANYTHING IS PAID** (D-768's order). Null refuses the Use in words.
 *
 * @param {{actor: Actor, item: Item, onUse?: object, list?: Array}} o
 * @returns {Promise<object|null>}  the plan `landWitchHunterUse` lands
 */
export async function judgeWitchHunterUse({ actor, item, onUse = {}, list = [] } = {}) {
  const wh = onUse?.wh ?? {};
  const name = item?.name ?? "";
  if (wh.sign) {
    const { judgeSign } = await import("./witch-hunter-signs.mjs");
    return judgeSign({ actor, item, list });
  }
  if (wh.expose) return judgeExpose(actor, item, list);
  if (wh.pulse) {
    // *While you wear your witch hunter's medallion in your Neck slot ...*: the pulse is the medallion's (MY READING).
    if (!wornMedallion(actor.items ?? [])) return refuse("AZEROTH.WhFeature.Medallion.NotWorn", { name });
    if (!boardToken(actor)) return refuse("AZEROTH.WhFeature.Medallion.NoToken", { name });
    return { key: "pulse" };
  }
  // **WHIRLING STEEL** is the card's own Attack (`attack: true, attacks: "each"`, D-773's allowance), its two hands
  // the row's `wields`, judged by `useFeature` with the Use's other refusals: nothing more to ask here.
  if (wh.whirl) return { key: "whirl" };
  // **A USE A TALENT GRANTS** (04's Second Brewing and Mountain Bear; wave 2b): its own judgement, before anything is paid.
  if (wh.talent) {
    const { judgeWhTalentUse } = await import("./witch-hunter-talents.mjs");
    return judgeWhTalentUse({ actor, item, onUse });
  }
  if (wh.lastHunt) {
    if (lastHuntStands(actor.effects ?? [])) return refuse("AZEROTH.WhFeature.LastHunt.Standing", { name });
    return { key: "lastHunt" };
  }
  return refuse("AZEROTH.WhFeature.Unknown", { name });
}

/**
 * **A WITCH HUNTER'S USE, LANDED ONCE ITS BUDGET IS PAID**: the lines its card prints. A Sign's own landing pays its
 * Energy (`landSign`); Expose Weakness's and Whirling Steel's Tempo is the row's price, paid by `useFeature`.
 *
 * @returns {Promise<string[]>}
 */
export async function landWitchHunterUse({ actor, item, plan, list = [], paid = null } = {}) {
  switch (plan?.key) {
    case "sign": {
      const { landSign } = await import("./witch-hunter-signs.mjs");
      return landSign({ actor, item, plan, list });
    }
    case "expose": return landExpose(actor, item, plan, paid);
    case "pulse": return pulse(actor, item);
    case "whirl": return [t("AZEROTH.WhFeature.Whirl.Line", { name: actor.name, feature: item.name })];
    case "lastHunt": return startLastHunt(actor, item);
    case "talent": {
      const { landWhTalentUse } = await import("./witch-hunter-talents.mjs");
      return landWhTalentUse({ actor, item, plan });
    }
    default: return [];
  }
}

/**
 * **WHAT THE FEATURE CARD CARRIES FOR A WITCH HUNTER'S USE, ONCE IT STANDS**: a Sign's cone set down where it was
 * aimed (`afterSignCard`). Called by `useFeature` once its card is posted.
 */
export async function afterWitchHunterCard({ actor, item, plan, posted } = {}) {
  if (plan?.key === "sign") {
    const { afterSignCard } = await import("./witch-hunter-signs.mjs");
    await afterSignCard({ actor, item, plan, posted });
  }
}

/* ------------------------------------------------------------------ */
/*  Expose Weakness                                                     */
/* ------------------------------------------------------------------ */

/**
 * **EXPOSE WEAKNESS, JUDGED** (*As a Half-Action, spend 3 Tempo and choose a creature of a **Studied** type that you
 * can see within 30 feet ... A creature that is Immune to that type is unaffected*): the one creature targeted, its
 * type (`typeOf`), the Tome's Studied types (The Last Hunt studies every known one), whether it is seen, the
 * footprints' distance and its Immune list, through `exposeWeakness` - every refusal in words before the budget and
 * the Tempo. A creature this client does not own is written on the GM's client, so with no GM online it is refused.
 */
async function judgeExpose(actor, item, list) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  const { feetBetweenTokens } = await import("../canvas/engaged.mjs");
  const named = list.map(x => ({ x, actor: targetActorOf(x) })).filter(r => r.actor && r.actor.uuid !== actor.uuid);
  if (named.length !== 1) return refuse("AZEROTH.WhFeature.Expose.Refuse.noTarget", { name: item.name });
  const one = named[0];
  const token = canvas?.tokens?.get?.(one.x?.tokenId) ?? null;
  const own = boardToken(actor);
  const tome = tomeOf(actor);
  const tempo = (actor.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === TEMPO)?.value ?? 0;
  const judged = exposeWeakness({
    target: true, type: typeOfActor(one.actor), studied: tome.studied, known: tome.known, lastHunt: lastHuntStands(actor.effects ?? []),
    seen: token ? token.document?.hidden !== true : true, feet: own && token ? feetBetweenTokens(own, token) : null,
    immune: one.actor.system?.immune ?? [], tempo
  });
  if (judged.refusal) {
    return refuse(`AZEROTH.WhFeature.Expose.Refuse.${judged.refusal}`, {
      name: item.name, target: one.x?.name ?? one.actor.name, feet: EXPOSE_WEAKNESS_RULE.feet, n: judged.cost,
      type: game.i18n.localize(AZEROTH.damageTypes[judged.damage] ?? "")
    });
  }
  if (gmMissing([one.actor])) return refuse("AZEROTH.WhFeature.NoGM", { name: item.name });
  return { key: "expose", target: one.actor, name: one.x?.name ?? one.actor.name, damage: judged.damage };
}

/**
 * Expose Weakness, landed: the laid Vulnerable, here where this client owns the creature, else on the GM's.
 *
 * **NOTHING LAID, NOTHING KEPT** (a refused action keeps its Half-Action, the lead; the architect review's A4, wave
 * 2d-A, D-2136): where the Vulnerable did not land - the GM's client judged it again and refused, or its answer never
 * came inside the query's 15 seconds - the Tempo this Use paid and its Half-Action are given back
 * (`giveBackUse`), and the card says so.
 */
async function landExpose(actor, item, plan, paid = null) {
  const done = plan.target.isOwner
    ? await exposeHere({ hunter: actor, target: plan.target, img: item?.img ?? null })
    : await askGM({ act: "expose", hunterUuid: actor.uuid, targetUuid: plan.target.uuid, img: item?.img ?? null });
  const type = game.i18n.localize(AZEROTH.damageTypes[done?.damage ?? plan.damage] ?? plan.damage ?? "");
  if (done?.landed) return [t("AZEROTH.WhFeature.Expose.Laid", { target: plan.name, type })];
  return [t("AZEROTH.WhFeature.Expose.NotLaid", { target: plan.name, type }), ...await giveBackUse(actor, { cost: "half", paid })];
}

/**
 * **WHAT A USE PAID, GIVEN BACK WHERE ITS LANDING DID NOT HAPPEN** (the architect review's A4, wave 2d-A, D-2136): the
 * pool's price, as one delta inside the pool queue (`pool-writes.mjs#adjustPool`), and the action off the turn's budget
 * through the combatant's own queued doors - a Half-Action as a Half-Action gained (`grantHalfActions`), a Reaction as
 * the Reaction given back (`regainReaction`). Out of a fight no budget was spent and none is given. Answers the card's
 * lines, in words.
 *
 * @param {Actor} actor
 * @param {{cost: "half"|"reaction"|null, paid?: {pool?: {itemId: string, kind: string, name: string}|null, spent?: number}|null}} o
 * @returns {Promise<string[]>}
 */
async function giveBackUse(actor, { cost = null, paid = null } = {}) {
  const lines = [];
  const spent = Math.max(0, Math.trunc(Number(paid?.spent)) || 0);
  if (paid?.pool && spent > 0) {
    const { adjustPool } = await import("../documents/pool-writes.mjs");
    const back = await adjustPool(actor, { kind: paid.pool.kind, name: paid.pool.name, itemId: paid.pool.itemId }, spent);
    if (back.ok) lines.push(t("AZEROTH.WhFeature.GivenBack.Pool", { n: back.after - back.before, pool: game.i18n.localize(AZEROTH.poolTypes?.[paid.pool.name] ?? paid.pool.name) }));
  }
  const fight = actor?.activeFight?.() ?? null;
  const mine = fight?.started ? (fight.getCombatantsByActor?.(actor)?.[0] ?? null) : null;
  if (mine?.isOwner && cost === "half") {
    await mine.grantHalfActions(1);
    lines.push(t("AZEROTH.WhFeature.GivenBack.Half"));
  } else if (mine?.isOwner && cost === "reaction" && (await mine.regainReaction())?.regained) {
    lines.push(t("AZEROTH.WhFeature.GivenBack.Reaction"));
  }
  return lines;
}

/**
 * **THE LAID VULNERABLE, HERE** (`rules/laid-vulnerable.mjs`: a flag both models read, never a change), spanned to the
 * end of the HUNTER's next turn (`durations.mjs#untilEndOfNextTurnOrRound`), judged again off the hunter's own Tome
 * and the creature as it stands - never off a request. A second exposure by the same hunter replaces the first.
 *
 * @returns {Promise<{landed: boolean, damage: string|null, reason?: string}>}
 */
export async function exposeHere({ hunter, target, img = null } = {}) {
  const tome = tomeOf(hunter);
  const judged = exposeWeakness({
    target: true, type: typeOfActor(target), studied: tome.studied, known: tome.known, lastHunt: lastHuntStands(hunter.effects ?? []),
    immune: target.system?.immune ?? [], tempo: EXPOSE_WEAKNESS_RULE.cost
  });
  if (judged.refusal) return { landed: false, damage: null, reason: judged.refusal };
  const stale = (target.effects ?? []).filter(e => e.flags?.[SCOPE]?.[EXPOSED_FLAG]?.by === hunter.uuid).map(e => e.id);
  if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  const type = game.i18n.localize(AZEROTH.damageTypes[judged.damage] ?? judged.damage);
  const [made] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.WhFeature.Expose.Effect", { feature: EXPOSE_WEAKNESS, type }),
    img: img ?? "icons/svg/target.svg", origin: hunter.uuid,
    description: `<p>${esc(t("AZEROTH.WhFeature.Expose.EffectText", { type, owner: hunter.name }))}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes: [] },
    ...(untilEndOfNextTurnOrRound(hunter) ?? {}),
    flags: { [SCOPE]: { [VULNERABLE_FLAG]: { types: [judged.damage], source: EXPOSE_WEAKNESS }, [EXPOSED_FLAG]: { by: hunter.uuid } } }
  }]);
  return { landed: Boolean(made), damage: judged.damage };
}

/* ------------------------------------------------------------------ */
/*  The Medallion                                                       */
/* ------------------------------------------------------------------ */

/**
 * **THE MEDALLION'S PULSE, LANDED** (*As a Half-Action, you learn how many creatures of your **Studied** types are
 * within 60 feet of you*): every other token on the hunter's scene, typed (`typeOf`) and measured footprint to
 * footprint, counted by `medallionPulse` - hidden creatures too (it senses). The count is whispered to the hunter's
 * owners and the GM, `senseDemons`' shape; the feature card says only that it was.
 */
async function pulse(actor, item) {
  const own = boardToken(actor);
  if (!own) return [t("AZEROTH.WhFeature.Medallion.NoToken", { name: item.name })];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const creatures = [...(own.document.parent?.tokens ?? [])]
    .filter(tk => tk.actor && tk.id !== own.document.id && tk.actor !== actor)
    .map(tk => ({ type: typeOfActor(tk.actor), feet: feetApart(own.document, tk) }));
  const tome = tomeOf(actor);
  const count = medallionPulse({ creatures, studied: tome.studied, known: tome.known, lastHunt: lastHuntStands(actor.effects ?? []) });
  const owners = (game.users?.contents ?? []).filter(u => actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const studied = tome.studied.length ? tome.studied.map(k => game.i18n.localize(AZEROTH.creatureTypes?.[k] ?? k)).join(", ") : "-";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: owners,
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${esc(MEDALLION_FEATURE)}</span><em>${esc(t("AZEROTH.WhFeature.Medallion.PulseTitle", { feet: MEDALLION_RULE.pulse.feet }))}</em></p><p class="azeroth-card-line">${esc(t("AZEROTH.WhFeature.Medallion.PulseCount", { n: count, types: studied, feet: MEDALLION_RULE.pulse.feet }))}</p></div></div>`,
    flags: { [SCOPE]: { kind: "witchHunterCard", pulse: { count, by: actor.uuid } } }
  });
  return [t("AZEROTH.WhFeature.Medallion.PulseLine", { name: actor.name })];
}

/**
 * **WHO IS CASTING, AND WHERE**, off a posted card: a spell card (`kind: "spell"`) or a casting feature's card
 * (`kind: "feature"` with `casting: true`), the token it recorded (D-724) or the speaker's first on the scene, the
 * spell's name and school. Null for any other card.
 */
function castOf(message) {
  const f = message?.flags?.[SCOPE] ?? {};
  const spell = f.kind === "spell";
  const feature = f.kind === "feature" && f.casting === true;
  if (!spell && !feature) return null;
  const caster = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  const scene = (f.source?.sceneId && game.scenes?.get(f.source.sceneId)) || game.scenes?.get(message.speaker?.scene ?? "") || null;
  const token = (scene && f.source?.tokenId ? scene.tokens?.get(f.source.tokenId) : null)
    ?? (scene && message.speaker?.token ? scene.tokens?.get(message.speaker.token) : null) ?? null;
  if (!scene || !token) return null;
  const name = spell ? (f.spellName ?? "") : (caster?.items?.get?.(f.itemId ?? "")?.name ?? "");
  const school = spell ? (f.castSchool ?? null) : null;
  return { caster, scene, token, name, school, messageId: message.id };
}

/**
 * **THE MEDALLION SENSES A CAST** (*you know the direction and school of each spell cast within 60 feet of you*),
 * on the active GM's client: every Witch Hunter holding the Medallion and wearing the medallion in the Neck slot,
 * with a token on the caster's scene, within 60 feet footprint to footprint (`medallionSenses`), never the caster.
 * Each is whispered the direction (`compassOf`) and the school, with the Warning's button for its owner.
 *
 * @param {ChatMessage} message
 * @returns {Promise<number>}  how many hunters were told
 */
export async function medallionWatch(message) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return 0;
  const cast = castOf(message);
  if (!cast) return 0;
  const { feetApart } = await import("../canvas/footprints.mjs");
  let told = 0;
  const seen = new Set();
  for (const tk of [...(cast.scene.tokens ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const hunter = tk.actor;
    if (!hunter || hunter.type !== "character" || seen.has(hunter.uuid) || hunter.uuid === cast.caster?.uuid) continue;
    if (!holds(hunter, MEDALLION_FEATURE)) continue;
    seen.add(hunter.uuid);
    const worn = Boolean(wornMedallion(hunter.items ?? []));
    const feet = feetApart(tk, cast.token);
    if (!medallionSenses({ worn, feet })) continue;
    const from = tk.object?.center ?? { x: tk.x, y: tk.y };
    const at = cast.token.object?.center ?? { x: cast.token.x, y: cast.token.y };
    const point = compassOf(at.x - from.x, at.y - from.y) ?? "here";
    await postSense({ hunter, cast, feet, point });
    told++;
  }
  return told;
}

/** The whispered sense, with the Warning's button for the hunter's owner (`data-reaction-owner`, D-779). */
async function postSense({ hunter, cast, feet, point }) {
  const owners = (game.users?.contents ?? []).filter(u => hunter.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const school = cast.school ? game.i18n.localize(AZEROTH.spellSchools?.[cast.school] ?? AZEROTH.schools?.[cast.school] ?? cast.school) : t("AZEROTH.WhFeature.Medallion.NoSchool");
  const where = game.i18n.localize(`AZEROTH.DhSpell.Compass.${point}`);
  const line = t("AZEROTH.WhFeature.Medallion.Sensed", { spell: cast.name, school, where, feet: Math.round(feet ?? 0) });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: hunter }), whisper: owners,
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${esc(MEDALLION_FEATURE)}</span><em>${esc(t("AZEROTH.WhFeature.Medallion.SenseTitle", { feet: MEDALLION_RULE.feet }))}</em></p><p class="azeroth-card-line">${esc(line)}</p></div>`
      + `<div class="azeroth-card-actions" data-reaction-owner="${esc(hunter.uuid)}"><button type="button" data-action="witchHunterCard" data-wh-press="warn">${esc(t("AZEROTH.WhFeature.Medallion.Warn"))}</button></div></div>`,
    flags: { [SCOPE]: { kind: "witchHunterCard", sense: { by: hunter.uuid, spellMessageId: cast.messageId, spell: cast.name, school: cast.school ?? null, feet: Math.round(feet ?? 0), point } } }
  });
}

/**
 * **THE WARNING, PRESSED** (*you may use your Reaction to give one ally you can see a Boon on its Resilience Test
 * against that spell*): judged whole before anything is spent (D-768) - the presser owns the hunter, the medallion is
 * still worn, the card recorded the sense, one ally targeted, never the hunter, an ally, seen, not warned already
 * against that spell, the Reaction left (`turnBudgetRefusal`) and a GM online for an ally this client does not own;
 * then the press claimed on the card (`claimCardPress`, once), the Reaction spent, and the Boon laid.
 */
async function warnFromCard(message) {
  const sense = message?.flags?.[SCOPE]?.sense ?? null;
  const hunter = sense?.by ? await fromUuid(sense.by) : null;
  if (!hunter || hunter.documentName !== "Actor" || !hunter.isOwner) return refuse("AZEROTH.Card.NotYours");
  const aimed = [...(game.user?.targets ?? [])].filter(tk => tk.actor);
  const ally = aimed.length === 1 ? aimed[0].actor : null;
  const { allyOf } = await import("../canvas/engaged.mjs");
  const refused = warningRefusal({
    worn: Boolean(wornMedallion(hunter.items ?? [])), sensed: Boolean(sense.spellMessageId), named: aimed.length,
    self: ally?.uuid === hunter.uuid, ally: ally ? allyOf(hunter, ally) : false, seen: aimed[0] ? aimed[0].document?.hidden !== true : false,
    warned: Boolean(ally && warnedFor(ally.getFlag?.(SCOPE, WARNED_FLAG) ?? null, sense.spellMessageId))
  });
  if (refused) return refuse(`AZEROTH.WhFeature.Medallion.Refuse.${refused}`, { name: MEDALLION_FEATURE, target: aimed[0]?.name ?? "" });
  const flow = game.system.azeroth.workflows;
  const short = flow.turnBudgetRefusal(hunter, "reaction");
  if (short) return refuse(short.reason, short.params ?? {});
  if (gmMissing([ally])) return refuse("AZEROTH.WhFeature.NoGM", { name: MEDALLION_FEATURE });
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press: "warn" });
  if (!claimed.ok) return refuse(claimed.reason ?? "AZEROTH.TalentLine.Pressed");
  if (!(await flow.spendTurnBudget(hunter, "reaction"))) return null;
  const done = ally.isOwner
    ? await warnHere({ hunter, ally, spellMessageId: sense.spellMessageId })
    : await askGM({ act: "warn", hunterUuid: hunter.uuid, allyUuid: ally.uuid, spellMessageId: sense.spellMessageId });
  // **THE WARNING, SEEN** (wave 3, D-2098): a public event card from the hunter to the ally warned, which the
  // animation director plays as the Medallion's warning (`MEDALLION_WARN_KEY`); the warning has landed by now, so a
  // card that fails to post is a warning in the console, never a refusal (`feature-events.mjs`).
  if (done?.landed) {
    const { postFeatureEvent } = await import("./feature-events.mjs");
    await postFeatureEvent({ actor: hunter, token: boardToken(hunter), featureKey: MEDALLION_WARN_KEY, targets: [aimed[0]],
      lines: [esc(t("AZEROTH.WhFeature.Medallion.WarnEvent", { name: hunter.name, target: aimed[0].name, spell: sense.spell ?? "" }))] });
  }
  ui.notifications?.info(t(done?.landed ? "AZEROTH.WhFeature.Medallion.Warned" : "AZEROTH.WhFeature.Medallion.NotWarned", { name: hunter.name, target: aimed[0].name, spell: sense.spell ?? "" }));
  // **NO BOON LAID, NO REACTION KEPT** (a refused action keeps its Half-Action, the lead; the architect review's A4,
  // wave 2d-A, D-2136): where the GM's client refused the warning or never answered inside the query's 15 seconds, the
  // Reaction spent on it is given back, said in words. The card's press stays claimed (no door releases one).
  if (!done?.landed) for (const line of await giveBackUse(hunter, { cost: "reaction" })) ui.notifications?.info(line);
  return done;
}

/** Lay the warned Boon on the ally, here: a row keyed to the spell's card, spent by the ally's Resist on it. */
export async function warnHere({ hunter, ally, spellMessageId } = {}) {
  if (!holds(hunter, MEDALLION_FEATURE) || !spellMessageId) return { landed: false };
  const held = Array.isArray(ally.getFlag?.(SCOPE, WARNED_FLAG)) ? ally.getFlag(SCOPE, WARNED_FLAG) : [];
  if (warnedFor(held, spellMessageId)) return { landed: false };
  // Only rows whose card still stands are kept, so the list never grows past the spells still being resisted.
  const kept = held.filter(r => r?.messageId && game.messages?.get(r.messageId));
  await ally.setFlag(SCOPE, WARNED_FLAG, [...kept, { messageId: spellMessageId, by: hunter.uuid, name: MEDALLION_FEATURE }]);
  return { landed: true };
}

/**
 * **THE WARNED BOON ON THIS RESIST** (`dice/chat.mjs#rollResists`, a spell card's Resist): `{name}` where the ally
 * carries a warning keyed to this spell's card, else null.
 *
 * @param {Actor} actor  the creature resisting
 * @param {string} messageId  the spell's card
 */
export function medallionWarnedOn(actor, messageId) {
  return warnedFor(actor?.getFlag?.(SCOPE, WARNED_FLAG) ?? null, messageId);
}

/** Spend the warning once the Resist is rolled: the row for that card comes off. */
export async function spendMedallionWarning(actor, messageId) {
  const held = actor?.getFlag?.(SCOPE, WARNED_FLAG);
  if (!Array.isArray(held) || !actor.isOwner) return;
  const kept = held.filter(r => r?.messageId !== messageId);
  if (kept.length === held.length) return;
  await actor.setFlag(SCOPE, WARNED_FLAG, kept);
}

/* ------------------------------------------------------------------ */
/*  Read the Trail                                                      */
/* ------------------------------------------------------------------ */

/**
 * **READ THE TRAIL** (*Spend 10 minutes examining tracks, remains, a victim or a lair, then make an **Investigation**
 * Test, a Standard Test at your tier. On a success you learn the type ... If you do not know that type and your
 * result also meets the Hard DC for your tier, you add it to your **Tome of Silver and Ash***): ten minutes, so never
 * in a fight (MY READING, D-2075); the Test through the roll dialog at the Standard DC; then the card - the DC, the
 * verdict, what the scene reveals left to the GM (the lead's named GM call, D2 §12), and on a Hard result the GM's
 * **Learn the type** button. Nothing is paid.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<ChatMessage|null>}
 */
export async function readTheTrail(actor, item) {
  if (actor.activeFight?.()?.started) return refuse("AZEROTH.WhFeature.Trail.InFight", { name: item.name, minutes: READ_THE_TRAIL_RULE.minutes });
  const tier = actor.system?.tier ?? 1;
  const first = readTrailOutcome({ total: 0, tier });
  const { rollWithDialog } = await import("../applications/actions.mjs");
  const { skillRowsFor } = await import("../rules/skills.mjs");
  const rolled = await rollWithDialog(actor, {
    kind: "skill", skill: TOME_SKILL, dc: first.standard,
    title: t("AZEROTH.WhFeature.Trail.Title", { name: item.name }),
    modifiers: skillRowsFor(actor, TOME_SKILL)
  });
  const total = rolled?.rolls?.[0]?.total ?? null;
  if (total === null) return null;
  const outcome = readTrailOutcome({ total, tier });
  const record = { ...trailRecord({ total, outcome }), by: actor.uuid };
  const lines = [
    t("AZEROTH.WhFeature.Trail.Dc", { standard: outcome.standard, hard: outcome.hard, total }),
    t(outcome.success ? "AZEROTH.WhFeature.Trail.Success" : "AZEROTH.WhFeature.Trail.Failure", { name: actor.name }),
    ...(outcome.success ? [t("AZEROTH.WhFeature.Trail.GmCall")] : []),
    ...(record.hardMet ? [t("AZEROTH.WhFeature.Trail.Hard")] : [])
  ];
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${esc(READ_THE_TRAIL)}</span><em>${esc(t(outcome.success ? "AZEROTH.Roll.Outcome.Success" : "AZEROTH.Roll.Outcome.Failure"))}</em></p>${lines.map(l => `<p class="azeroth-card-line">${esc(l)}</p>`).join("")}</div>`
      + (record.hardMet ? `<div class="azeroth-card-actions" data-gm-only><button type="button" data-action="witchHunterCard" data-wh-press="learn">${esc(t("AZEROTH.WhFeature.Trail.Learn"))}</button></div>` : "")
      + `</div>`,
    flags: { [SCOPE]: { kind: "witchHunterCard", trail: record, itemId: item.id, rollMessageId: rolled.id ?? null } }
  });
}

/**
 * **THE GM'S LEARN THE TYPE** on a Hard Read the Trail card: judged off the card's record and the hunter's Tome
 * (`learnTypeRefusal`), the type picked through the one chooser from the eight the hunter does not know, written
 * into the Tome's known types through the Tome's one writer (wave 2a-A's `learnType`), and the card marked taught so
 * a second press refuses.
 */
async function learnFromCard(message) {
  if (!game.user?.isGM) return refuse("AZEROTH.WhFeature.Trail.GmOnly");
  const record = message?.flags?.[SCOPE]?.trail ?? null;
  const hunter = record?.by ? await fromUuid(record.by) : null;
  if (!hunter || hunter.documentName !== "Actor") return refuse("AZEROTH.Card.ActorGone");
  const tome = tomeOf(hunter);
  const first = learnTypeRefusal({ record, type: CREATURE_TYPES.find(x => !tome.known.includes(x)) ?? null, known: tome.known });
  if (first && first !== "known" && first !== "type") return refuse(`AZEROTH.WhFeature.Trail.Refuse.${first}`, { name: hunter.name });
  const options = CREATURE_TYPES.map(key => ({
    key, name: game.i18n.localize(AZEROTH.creatureTypes?.[key] ?? key), description: "",
    available: !tome.known.includes(key)
  }));
  if (!options.some(o => o.available)) return refuse("AZEROTH.WhFeature.Trail.Refuse.known", { name: hunter.name });
  const pick = await game.system.azeroth.workflows.chooseOption({ id: message.id, name: READ_THE_TRAIL }, options, null,
    { prompt: t("AZEROTH.WhFeature.Trail.LearnPrompt", { name: hunter.name }) });
  if (!pick) return null;
  const now = tomeOf(hunter);
  const refused = learnTypeRefusal({ record: message.flags[SCOPE].trail, type: pick.key, known: now.known });
  if (refused) return refuse(`AZEROTH.WhFeature.Trail.Refuse.${refused}`, { name: hunter.name });
  // Through the Tome's one writer (wave 2a-A's `learnType`), never a second write of its flag.
  const { learnType } = await import("./witch-hunter-tome.mjs");
  const known = await learnType(hunter, pick.key);
  if (!known?.includes(pick.key)) return refuse("AZEROTH.WhFeature.Trail.Refuse.type", { name: hunter.name });
  await message.update({ [`flags.${SCOPE}.trail.taught`]: pick.key });
  ui.notifications?.info(t("AZEROTH.WhFeature.Trail.Learned", { name: hunter.name, type: pick.name }));
  return pick.key;
}

/* ------------------------------------------------------------------ */
/*  The Last Hunt                                                       */
/* ------------------------------------------------------------------ */

/**
 * **THE LAST HUNT, BEGUN** (*Once per Long Rest, as a Half-Action, for 1 minute: every type you know ... counts as
 * chosen for **Studied**, your Tempo is capped at 10, and each Sign from **Signs** costs 1 Energy less*): the carrier
 * on the hunter, spanned by the minute - ten of the fight's rounds, or the world's minute out of one
 * (`durations.mjs#minuteSpan`) - and ended with its fight (`registerWitchHunterFeatures`). The three numbers are read
 * off the carrier where they are made (`capFor`, `studiedTypes`, `signCost`).
 */
async function startLastHunt(actor, item) {
  const { minuteSpan } = await import("./durations.mjs");
  const fight = actor.activeFight?.() ?? null;
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: item?.name ?? THE_LAST_HUNT_RULE.flag, img: item?.img ?? "icons/svg/sun.svg", origin: actor.uuid,
    description: `<p>${esc(t("AZEROTH.WhFeature.LastHunt.EffectText", { cap: THE_LAST_HUNT_RULE.tempoCap }))}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [] },
    ...(minuteSpan(actor, THE_LAST_HUNT_RULE.minutes) ?? {}),
    // *For 1 minute*: a rest cannot fall inside a minute, so any rest ends it (`rules/rest-ends.mjs`, wave 2c), and its
    // deletion, by whatever path, is The Last Hunt's end that clips the Tempo (`registerWitchHunterFeatures`).
    flags: { [SCOPE]: { [LAST_HUNT_FLAG]: { by: actor.uuid, combatId: fight?.started ? fight.id : null }, [REST_ENDS_FLAG]: "short" } }
  }]);
  return [t(made ? "AZEROTH.WhFeature.LastHunt.Begun" : "AZEROTH.WhFeature.LastHunt.NotBegun", { name: actor.name, cap: THE_LAST_HUNT_RULE.tempoCap })];
}

/**
 * **THE LAST HUNT'S END CLIPS THE TEMPO** (the plan's door note: *clipped when it ends*): the Tempo held, never above
 * the cap it falls back to (`tempoCap` without The Last Hunt; 04's Ursine Fury's 8 where held), written as one delta
 * inside the pool queue. Answers what it holds now.
 *
 * @param {Actor} actor
 * @returns {Promise<number|null>}
 */
export async function clipTempoAfterHunt(actor) {
  const pool = (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === TEMPO) ?? null;
  if (!pool) return null;
  // **THE ONE CLIP** (wave 2c deleted the second, `witch-hunter-tome.mjs#clipTempoAfterLastHunt`, which read the
  // snapshot's value - already clamped to the fallen cap by `CharacterData`'s `clampPool` - and so never clipped). The
  // STORED value is read and written INSIDE the pool queue, when this task's turn comes, so a gain queued before it is
  // clipped too and never written over.
  const { poolWrite } = await import("../documents/pool-writes.mjs");
  return poolWrite(actor, async () => {
    const stored = int(actor.system?.classes?.find?.(c => c.itemId === pool.itemId)?.momentum?.value ?? pool.value);
    const cap = tempoCap({ ursineFury: int(actor.talentRanks?.(URSINE_FURY)) > 0, lastHunt: lastHuntStands(actor.effects ?? []) });
    const clipped = tempoClip(stored, cap);
    if (clipped === stored) return clipped;
    await actor.writePoolsNow([{ itemId: pool.itemId, kind: "momentum", value: clipped }]);
    globalThis.ui?.notifications?.info?.(t("AZEROTH.WitchHunter.TempoClipped", { name: actor.name, n: clipped }));
    return clipped;
  });
}

/* ------------------------------------------------------------------ */
/*  The card's presses                                                  */
/* ------------------------------------------------------------------ */

/**
 * **A WITCH HUNTER CARD'S BUTTON** (`dice/chat.mjs`'s `witchHunterCard`): the Medallion's warning or Read the Trail's
 * GM-only Learn the type, by `data-wh-press`.
 */
export async function whCardPress(button, message) {
  const press = button?.dataset?.whPress ?? "";
  if (press === "warn") return warnFromCard(message);
  if (press === "learn") return learnFromCard(message);
  return null;
}

/* ------------------------------------------------------------------ */
/*  The GM's handler                                                    */
/* ------------------------------------------------------------------ */

/**
 * **THE GM-SIDE HANDLER** (`WH_FEATURES_QUERY`), judged again off the world: the asker owns the hunter, the hunter holds
 * the feature, and every number is worked out off the hunter's sheet, never off the request.
 *
 * - `rowan`: the Rowan Sign's Ward (and its Empowered temporary Health) on a creature the asker does not own;
 * - `expose`: Expose Weakness's laid Vulnerable;
 * - `warn`: the Medallion's warned Boon on an ally;
 * - `ashEnd`: the hunter's earlier Ash rings, deleted.
 */
export async function witchHunterQueryHandler(payload = {}, { user = null } = {}) {
  if (!game.user?.isGM) throw new Error(t("AZEROTH.WhFeature.QueryAuthority"));
  const hunter = payload.hunterUuid ? await fromUuid(payload.hunterUuid) : null;
  const asker = user ?? game.user;
  if (hunter?.documentName !== "Actor" || !hunter.testUserPermission(asker, "OWNER")) throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: hunter?.name ?? "" }));
  const need = name => {
    if (!holds(hunter, name)) throw new Error(t("AZEROTH.WhFeature.NoFeature", { name: hunter.name, feature: name }));
  };
  switch (payload.act) {
    case "rowan": {
      need("Signs");
      const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
      if (target?.documentName !== "Actor") throw new Error(t("AZEROTH.Card.TargetGone"));
      const { rowanHere } = await import("./witch-hunter-signs.mjs");
      return rowanHere({ hunter, target, empower: payload.empower === true && holds(hunter, "Greater Signs"), img: typeof payload.img === "string" ? payload.img : null });
    }
    case "expose": {
      need(EXPOSE_WEAKNESS);
      const target = payload.targetUuid ? await fromUuid(payload.targetUuid) : null;
      if (target?.documentName !== "Actor") throw new Error(t("AZEROTH.Card.TargetGone"));
      return exposeHere({ hunter, target, img: typeof payload.img === "string" ? payload.img : null });
    }
    case "warn": {
      need(MEDALLION_FEATURE);
      const ally = payload.allyUuid ? await fromUuid(payload.allyUuid) : null;
      if (ally?.documentName !== "Actor") throw new Error(t("AZEROTH.Card.TargetGone"));
      if (!game.messages?.get(String(payload.spellMessageId ?? ""))) return { landed: false };
      return warnHere({ hunter, ally, spellMessageId: String(payload.spellMessageId) });
    }
    case "ashEnd": {
      need("Ash Sign");
      const { endAshHere } = await import("./witch-hunter-signs.mjs");
      return endAshHere(hunter, Array.isArray(payload.rings) ? payload.rings : []);
    }
    default: throw new Error(t("AZEROTH.WhFeature.Unknown", { name: String(payload.act ?? "") }));
  }
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Whether this client answers for the actor: its first active owning player, else the active GM. */
/* ------------------------------------------------------------------ */
/*  Whispering (Type), beside the Medallion's sense (wave 2c)           */
/* ------------------------------------------------------------------ */

/** The last reading whispered to each wielder's token, so a sense is told when it changes and not on every step. */
const WHISPERED = new Map();
/** One pending look a scene, so a burst of moves is read once. */
const WHISPER_TIMERS = new Map();

/**
 * The Whispering traits on what an actor wields (`type-boons.mjs#whisperingOf`): the weapons in hand through
 * `AzerothActor#readyWeapons`, the one accessor, so a weapon melded into a shape whispers nothing (D-769).
 */
function whisperingSources(actor) {
  const ready = typeof actor?.readyWeapons === "function" ? actor.readyWeapons() : [];
  return [...(ready ?? [])].filter(i => !i?.natural).flatMap(i => whisperingOf([...(i.system?.traits ?? [])]));
}

/**
 * **WHISPERING (TYPE) SENSES, ON THE ACTIVE GM'S CLIENT** (08 §6: *Lesser. Direction of the nearest named creature
 * within 100 feet. Greater. Within 300 feet, and roughly how many.*; the plan's Finding 2: it *joins the Medallion's
 * sensing door*): the Medallion's watcher's shape. Every token on the scene whose actor wields a Whispering weapon
 * reads every other token, typed (`typeOfActor`), measured footprint to footprint and pointed (`compassOf`); the
 * reading (`whisperingSense`) is whispered to the wielder's owners when it differs from the last one whispered.
 *
 * @param {Scene} scene
 * @returns {Promise<number>}  how many wielders were told
 */
export async function whisperingWatch(scene) {
  if (!scene || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return 0;
  const tokens = [...(scene.tokens ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const wielders = tokens.filter(tk => tk.actor && whisperingSources(tk.actor).length);
  if (!wielders.length) return 0;
  const { feetApart } = await import("../canvas/footprints.mjs");
  let told = 0;
  for (const tk of wielders) {
    const from = tk.object?.center ?? { x: tk.x, y: tk.y };
    const creatures = tokens.filter(o => o.id !== tk.id && o.actor && o.actor !== tk.actor).map(o => {
      const at = o.object?.center ?? { x: o.x, y: o.y };
      return { type: typeOfActor(o.actor), feet: feetApart(tk, o), point: compassOf(at.x - from.x, at.y - from.y) ?? "here" };
    });
    const reading = whisperingSense({ sources: whisperingSources(tk.actor), creatures });
    const key = `${scene.id}.${tk.id}`;
    const said = JSON.stringify(reading);
    if (WHISPERED.get(key) === said) continue;
    WHISPERED.set(key, said);
    const owners = (game.users?.contents ?? []).filter(u => tk.actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
    const lines = reading.map(r => {
      const type = game.i18n.localize(AZEROTH.creatureTypes?.[r.type] ?? r.type);
      if (!r.found) return t("AZEROTH.WhFeature.Whispering.None", { name: tk.actor.name, type, reach: r.reach });
      const where = game.i18n.localize(`AZEROTH.DhSpell.Compass.${r.point}`);
      return r.grade === "greater"
        ? t("AZEROTH.WhFeature.Whispering.Greater", { name: tk.actor.name, type, where, feet: r.feet, n: r.count, reach: r.reach })
        : t("AZEROTH.WhFeature.Whispering.Lesser", { name: tk.actor.name, type, where, feet: r.feet });
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: tk.actor }), whisper: owners,
      content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line azeroth-fired"><span>${esc(t("AZEROTH.WhFeature.Whispering.Title"))}</span></p>${lines.map(l => `<p class="azeroth-card-line">${esc(l)}</p>`).join("")}</div></div>`,
      flags: { [SCOPE]: { kind: "witchHunterCard", whispering: { by: tk.actor.uuid, reading } } }
    });
    told++;
  }
  return told;
}

/** A look at the scene a little after a burst of moves, on the active GM's client alone. */
function scheduleWhispering(scene) {
  if (!scene || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
  clearTimeout(WHISPER_TIMERS.get(scene.id));
  WHISPER_TIMERS.set(scene.id, setTimeout(() => {
    WHISPER_TIMERS.delete(scene.id);
    whisperingWatch(scene).catch(err => console.warn("azeroth-rpg | Whispering's sense", err));
  }, 300));
}

async function answersFor(actor) {
  const { answererOf } = await import("./blow-doors.mjs");
  return answererOf(actor)?.id === game.user?.id;
}

/**
 * Register the doors' hooks once at init: the Medallion's cast watcher; The Last Hunt's end (its carrier deleted
 * for any reason clips the Tempo; its fight's end deletes the carrier); the Signs' own (`registerSignHooks`).
 */
export function registerWitchHunterFeatures() {
  Hooks.on("createChatMessage", message => {
    medallionWatch(message).catch(err => console.warn("azeroth-rpg | the Medallion's cast watcher", err));
  });
  // **WHISPERING (TYPE)** beside the Medallion (wave 2c): a token moved, placed or taken off, or a weapon equipped,
  // re-reads the scene it stands on (`whisperingWatch`, debounced).
  Hooks.on("updateToken", (doc, change) => {
    if (["x", "y", "elevation"].some(k => k in (change ?? {}))) scheduleWhispering(doc?.parent);
  });
  Hooks.on("createToken", doc => scheduleWhispering(doc?.parent));
  Hooks.on("deleteToken", doc => scheduleWhispering(doc?.parent));
  Hooks.on("updateItem", (item, change) => {
    if (item?.type !== "weapon" || !foundry.utils.hasProperty(change ?? {}, "system.equipped")) return;
    for (const tk of item.parent?.getActiveTokens?.(false, true) ?? []) scheduleWhispering(tk.parent);
  });
  Hooks.on("deleteActiveEffect", async effect => {
    const actor = effect?.parent;
    if (!effect?.flags?.[SCOPE]?.[LAST_HUNT_FLAG] || actor?.documentName !== "Actor") return;
    if (!(await answersFor(actor))) return;
    await clipTempoAfterHunt(actor).catch(err => console.warn("azeroth-rpg | The Last Hunt's end", err));
  });
  Hooks.on("deleteCombat", async combat => {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    for (const c of combat?.combatants ?? []) {
      const actor = c.actor;
      const ended = (actor?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[LAST_HUNT_FLAG]?.combatId === combat.id).map(e => e.id);
      if (ended.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ended).catch(err => console.warn("azeroth-rpg | The Last Hunt with its fight", err));
    }
  });
  import("./witch-hunter-signs.mjs").then(m => m.registerSignHooks()).catch(err => console.warn("azeroth-rpg | the Witch Hunter's Signs", err));
}
