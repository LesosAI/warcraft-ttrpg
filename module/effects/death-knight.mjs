/**
 * **THE DEATH KNIGHT'S DOORS** (02 §7; the plan's Phase 4 doors 1 to 8; run F2). The law is
 * `rules/death-knight.mjs` and `rules/runes.mjs`; every rune written goes through
 * `documents/runes.mjs`, the one writer. This module holds the doors that are not
 * `useFeature`'s own:
 *
 * - `useInscription` - Inscribed Runeweapon's Use: the count of a Versatile weapon and the
 *   ratio for each weapon wielded, through the one chooser (D-673), refused outside the
 *   window in words (D-950);
 * - `spendRuneBare` - *As a Half-Action, you may also spend any type of rune to gain its
 *   Runic Power*: the rune panel's control, judged before the budget (D-768's order);
 * - `placeDesecration` - Desecration's ground, a placed area the area pipeline owns once it
 *   stands (D-756, D-757);
 * - `layWardDrop` - Desecration's failure, one laid effect on the Ward against Shadow;
 * - `layPlague` - Plague's carrier, laid on the creature struck, on the GM's client where
 *   this one may not write it (`CONFIG.queries`, never `game.socket`);
 * - `deathGripForced` - the pull Death Grip's card carries for its Resist door to land.
 */

import { AZEROTH } from "../config.mjs";
import {
  BLOOD_PLAGUE_SPREAD, DESECRATION, INSCRIBE_FLAG, desecrationFeet, spreadCheck, spreadTargets, desecrationGround, desecrationTick,
  inscriptionWindowRefusal, plagueAskRefusal, plagueCarrier, plagueTick, ratioOptions, wardDropFor
} from "../rules/death-knight.mjs";
import { gripsOf, runeSlots, spendRefusal } from "../rules/runes.mjs";
import { trainingProfile, weaponTraining } from "../rules/equipment-training.mjs";
import { reachHeld } from "../rules/distance.mjs";
import { inscribeRunes, spendRunesOn } from "../documents/runes.mjs";
import { untilNextTurnOrRound } from "./durations.mjs";
import { layTickOn, TICK_FLAG } from "./ticks.mjs";

const SCOPE = "azeroth-rpg";

/** The words a key and its parameters say. */
const t = (key, data = {}) => game.i18n.format(key, data);

/** The weapon access the actor's classes train. */
function accessOf(actor) {
  return trainingProfile({ classes: (actor?.classItems ?? []).map(c => c.system ?? c) }).weapons;
}

/**
 * The weapons wielded that take runes: `readyWeapons` (D-769's one accessor), trained with
 * and gripped, sorted by id so the chooser never swaps two between renders.
 */
export function wieldedRuneWeapons(actor) {
  const access = accessOf(actor);
  return (actor?.readyWeapons?.() ?? [])
    .filter(w => !w?.natural && w?.type === "weapon" && gripsOf(w).length && weaponTraining(w, access))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Whether the window to inscribe is open now, or the word for why not (`inscriptionWindowRefusal`). */
export function inscriptionRefusalFor(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return inscriptionWindowRefusal({
    flag: actor?.getFlag?.(SCOPE, INSCRIBE_FLAG) ?? null,
    inFight: Boolean(fight?.started),
    inscribedAny: (actor?.items ?? []).some?.(i => i.type === "weapon" && Array.isArray(i.system?.runes?.slots) && i.system.runes.slots.length > 0) ?? false
  });
}

/**
 * **INSCRIBED RUNEWEAPON'S USE** (02 §7: *When you finish a Long Rest, inscribe a Blood rune
 * or a Frost rune in each rune slot of the weapons you wield, in any ratio*; *A Versatile
 * weapon takes either count. When you inscribe it, choose the one-handed count or the
 * two-handed count*). Every refusal is asked before a chooser opens; a dismissed chooser
 * writes nothing; each weapon is written through the one writer.
 *
 * @param {Actor} actor
 * @param {Item} item  the feature
 * @returns {Promise<{ok: boolean, inscribed: Array<{name: string, blood: number, frost: number}>}|null>}
 */
export async function useInscription(actor, item) {
  if (!actor?.isOwner) return null;
  const window = inscriptionRefusalFor(actor);
  if (window) {
    ui.notifications?.warn(t(`AZEROTH.DeathKnight.Inscribe.Refuse.${window}`, { name: actor.name }));
    return null;
  }
  const weapons = wieldedRuneWeapons(actor);
  if (!weapons.length) {
    ui.notifications?.warn(t("AZEROTH.DeathKnight.Inscribe.Refuse.noWeapon", { name: actor.name }));
    return null;
  }
  const { chooseOption } = game.system.azeroth.workflows;
  const plan = [];
  for (const weapon of weapons) {
    const grips = gripsOf(weapon);
    let grip = null;
    if (grips.length > 1) {
      const pick = await chooseOption(item, grips.map(g => ({
        key: g, description: "",
        name: t(`AZEROTH.DeathKnight.Inscribe.Grip.${g}`, { n: runeSlots(weapon, { trained: true, grip: g }) })
      })), t("AZEROTH.DeathKnight.Inscribe.GripNote", { name: weapon.name }), { prompt: t("AZEROTH.DeathKnight.Inscribe.GripPrompt", { name: weapon.name }) });
      if (!pick) return null;
      grip = pick.key;
    }
    const slots = runeSlots(weapon, { trained: true, grip: grip ?? grips[0] });
    const pick = await chooseOption(item, ratioOptions(slots).map(r => ({
      key: `${r.blood}:${r.frost}`, description: "",
      name: t("AZEROTH.DeathKnight.Inscribe.Ratio", { blood: r.blood, frost: r.frost })
    })), null, { prompt: t("AZEROTH.DeathKnight.Inscribe.RatioPrompt", { name: weapon.name, n: slots }) });
    if (!pick) return null;
    const [blood, frost] = String(pick.key).split(":").map(Number);
    plan.push({ weapon, blood, frost, grip });
  }
  // Asked again: the choosers stood open while the world moved.
  const moved = inscriptionRefusalFor(actor);
  if (moved) {
    ui.notifications?.warn(t(`AZEROTH.DeathKnight.Inscribe.Refuse.${moved}`, { name: actor.name }));
    return null;
  }
  const inscribed = [];
  for (const row of plan) {
    const done = await inscribeRunes(actor, row.weapon, { blood: row.blood, frost: row.frost, grip: row.grip });
    if (done.ok) inscribed.push({ name: row.weapon.name, blood: row.blood, frost: row.frost });
  }
  if (inscribed.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="azeroth azeroth-card"><p>${inscribed.map(r => t("AZEROTH.DeathKnight.Inscribe.Done", { name: actor.name, weapon: r.name, blood: r.blood, frost: r.frost })).join("<br>")}</p></div>`,
      flags: { [SCOPE]: { kind: "inscription" } }
    });
  }
  return { ok: inscribed.length > 0, inscribed };
}

/**
 * **THE BARE SPEND** (02 §7: *As a Half-Action, you may also spend any type of rune to gain
 * its Runic Power*): the rune is judged first, then the Half-Action, then the one rune door
 * (D-768's order), and what it gave is said.
 *
 * @param {Actor} actor
 * @param {{kind?: "blood"|"frost"|"any"}} [o]
 * @returns {Promise<{ok: boolean, gained: number}|null>}
 */
export async function spendRuneBare(actor, { kind = "any" } = {}) {
  if (!actor?.isOwner) return null;
  const refusal = spendRefusal(actor.system?.runes?.weapons ?? [], { kind, count: 1 });
  if (refusal) {
    ui.notifications?.warn(t(`AZEROTH.Runes.Refuse.${refusal}`, { name: actor.name, n: 1 }));
    return null;
  }
  // Judged again on the queued fresh read, then the Half-Action, then the write - all inside
  // the one rune door, so a double press refuses the second before its Half-Action is spent
  // (the F2 review's must-fix 1; D-768's order).
  const { spendTurnBudget } = game.system.azeroth.workflows;
  const done = await spendRunesOn(actor, { kind, count: 1, before: () => spendTurnBudget(actor, "half") });
  if (!done.ok) return null;
  const spentKind = done.spent?.[0]?.kind ?? kind;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="azeroth azeroth-card"><p>${t("AZEROTH.DeathKnight.Spend.Done", {
      name: actor.name, rune: game.i18n.localize(AZEROTH.runeKinds[spentKind] ?? spentKind), n: done.gained
    })}</p></div>`,
    flags: { [SCOPE]: { kind: "runeSpend", gained: done.gained, rune: spentKind } }
  });
  return { ok: true, gained: done.gained };
}

/**
 * **DEATH GRIP'S PULL** (02 §7: *On a failure you pull it into an unoccupied space within your
 * reach*): the feet between the two footprints less the knight's reach (D-732: nearest
 * squares, never centres), toward the knight - the record the feature card carries
 * (`flags.forced`) for its Resist door to land (`dice/chat.mjs`). Null where the two are not
 * on one scene or already within reach.
 *
 * @param {Actor} actor
 * @param {object|null} target  the targeted snapshot (`targetActorOf`'s shape)
 * @param {{sceneId?: string, tokenId?: string}|null} source  the knight's token record
 */
export async function deathGripForced(actor, target, source = null) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const scene = target?.sceneId ? game.scenes?.get(target.sceneId) ?? null : null;
  const theirs = scene && target?.tokenId ? scene.tokens?.get(target.tokenId) ?? null : null;
  const mine = (source?.tokenId && scene?.tokens?.get(source.tokenId)) || scene?.tokens?.find?.(tk => tk.actor === actor || tk.actorId === actor.id) || null;
  if (!theirs || !mine) return null;
  const apart = feetApart(mine, theirs);
  if (!Number.isFinite(apart)) return null;
  // 06 §5's reach off the weapons in hand: a Reach weapon's 10 feet, else 5 (`threatReach`'s reading).
  const reach = reachHeld((actor.readyWeapons?.() ?? []).map(w => ({ traits: w.system?.traits ?? w.traits ?? [] })));
  const feet = Math.max(0, Math.trunc(apart - reach));
  return feet > 0 ? { on: "fail", feet, toward: "toward", from: "caster", resilience: "body" } : null;
}

/**
 * **WHERE DESECRATION WOULD BE LAID** (the F2 review's should-fix 5): the scene and the
 * knight's token on it, or null where there is none - asked by `useFeature` BEFORE the
 * budget and the payment (D-768's order), so a knight with no token on a scene is refused in
 * words with nothing spent, and asked again by `placeDesecration` once paid.
 *
 * @param {Actor} actor
 * @param {{sceneId?: string, tokenId?: string}|null} source  the knight's token record
 * @returns {{scene: Scene, token: TokenDocument}|null}
 */
export function desecrationSite(actor, source = null) {
  const scene = (source?.sceneId ? game.scenes?.get(source.sceneId) : null) ?? canvas?.scene ?? null;
  const token = (source?.tokenId && scene?.tokens?.get(source.tokenId)) || scene?.tokens?.find?.(tk => tk.actor === actor || tk.actorId === actor?.id) || null;
  return scene && token ? { scene, token } : null;
}

/**
 * **DESECRATION'S GROUND** (02 §7, D-938), once the Use is paid for: a circle of 10 feet (15
 * with Frozen Desecration at rank 2) PAST the knight's own squares (D-732), laid where it
 * stands and NOT attached (*the ground ... is desecrated*), carrying what the area pipeline
 * reads - the start-of-turn Test (`areaTick`), the enemies' Difficult ground (`areaGround`,
 * laid by the GM's `reconcileGround`), its ten minutes (`lasts`, swept by
 * `canvas/sustained-areas.mjs`) and the key its cue is filed under. Answers the card's line.
 *
 * @param {Actor} actor
 * @param {{item?: Item|null, source?: {sceneId?: string, tokenId?: string}|null}} [o]
 * @returns {Promise<string>}
 */
export async function placeDesecration(actor, { item = null, source = null } = {}) {
  const site = desecrationSite(actor, source);
  if (!site) return t("AZEROTH.DeathKnight.Desecration.NoToken", { name: actor.name });
  const { scene, token } = site;
  const feet = desecrationFeet(actor.takenTalents?.() ?? []);
  const halfWidth = ((Number(token.width) || 1) * (Number(scene.grid?.distance) || 5)) / 2;
  const fight = actor.activeFight?.() ?? null;
  const { placeArea } = await import("../canvas/regions.mjs");
  const centre = token.getCenterPoint?.() ?? { x: token.x, y: token.y };
  const region = await placeArea({
    item, scene, origin: { x: centre.x, y: centre.y }, rotation: 0, token, attach: false,
    areaText: `A ${feet} ft radius centered on you`, widenFt: halfWidth, color: "#3f5a3a",
    title: t("AZEROTH.DeathKnight.Desecration.Area", { name: actor.name, feet }),
    flags: {
      cast: foundry.utils.randomID(), caster: actor.uuid, source: { sceneId: scene.id, tokenId: token.id },
      featureKey: DESECRATION.key, identifier: DESECRATION.key, sustained: false,
      areaTick: desecrationTick({ chaMod: actor.system?.abilities?.cha?.mod ?? 0 }),
      areaGround: desecrationGround(),
      lasts: { rounds: DESECRATION.minutes * 10 },
      dc: actor.system?.spellDC ?? actor.system?.spells?.dc ?? null,
      spell: { name: item?.name ?? DESECRATION.feature, school: null, tier: null, takesSpellpower: false, img: item?.img ?? null, feature: true },
      placedAt: { combatId: fight?.started ? fight.id : null, round: fight?.started ? fight.round : null, turn: fight?.started ? fight.turn : null, time: game.time?.worldTime ?? 0 }
    }
  });
  return region
    ? t("AZEROTH.DeathKnight.Desecration.Laid", { name: actor.name, feet, minutes: DESECRATION.minutes })
    : t("AZEROTH.DeathKnight.Desecration.NotLaid", { name: actor.name });
}

/**
 * **DESECRATION'S FAILURE** (D-938: *its Ward against Shadow is reduced by your Charisma
 * modifier, to no lower than 0, until the start of its next turn*): ONE laid effect, a
 * `final` subtract on the Ward against the school (a Ward is derived, so it is `final`;
 * CLAUDE.md §15), no more than the Ward holds, spanned to the creature's own next turn start
 * (`durations.mjs#untilNextTurnOrRound`, a round of the world's clock outside a fight). A
 * second failure replaces the first. Here, on the client that rolled the creature's Test.
 *
 * @param {{victim: Actor, school: string, amount: number, by?: Actor|null, source?: string}} o
 * @returns {Promise<string>}  the card's line
 */
export async function layWardDrop({ victim, school, amount = 0, by = null, source = "" } = {}) {
  if (!victim) return "";
  const label = game.i18n.localize(AZEROTH.schools[school] ?? school);
  if (!victim.isOwner) return t("AZEROTH.DeathKnight.Desecration.NotYours", { name: victim.name });
  // **THE LAST DROP COMES OFF FIRST** (the F2 review's note): a second failure replaces the
  // first, so the first is deleted before the Ward is read - read with it standing, the second
  // drop was worked out from a Ward the first had already lowered, and a Ward the first had
  // taken to 0 answered *NoWard* and left the old drop in place past its turn.
  const stale = (victim.effects ?? []).filter(e => e.flags?.[SCOPE]?.wardDrop?.by === (by?.uuid ?? null) && e.flags?.[SCOPE]?.wardDrop?.school === school).map(e => e.id);
  if (stale.length) await victim.deleteEmbeddedDocuments("ActiveEffect", stale);
  const ward = Math.trunc(Number(victim.system?.ward?.[school]) || 0);
  const drop = wardDropFor({ amount, ward });
  if (!drop) return t("AZEROTH.DeathKnight.Desecration.NoWard", { name: victim.name, school: label });
  await victim.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.DeathKnight.Desecration.Effect", { source: source || DESECRATION.feature, school: label }),
    img: "icons/magic/unholy/strike-body-explode-disintegrate.webp",
    origin: by?.uuid ?? null,
    description: "",
    system: { changes: [{ key: `system.ward.${school}`, type: "subtract", value: drop, phase: "final" }] },
    ...(untilNextTurnOrRound(victim) ?? {}),
    flags: { [SCOPE]: { wardDrop: { by: by?.uuid ?? null, school, amount: drop } } }
  }]);
  return t("AZEROTH.DeathKnight.Desecration.WardDropped", { name: victim.name, school: label, n: drop });
}

/** The query that lays a Plague on a creature this client may not write (`CONFIG.queries`). */
export const LAY_PLAGUE_QUERY = "azeroth-rpg.layPlague";

/** Lay the carrier here: the tick, Frost Fever's Slowed, and the span of its ten rounds. */
async function plagueHere(victim, kind, by) {
  // **04's BLACK ICE** (*Your Frost Fever deals 1 additional Frost damage per rank*; run F4a):
  // the Plague's patch, read at the knight's rank as the Fever is laid.
  let add = 0;
  if (kind === "frostFever") {
    const { feverAdd } = await import("./death-knight-talents.mjs");
    add = await feverAdd(by);
  }
  const tick = plagueTick(kind, { tier: by?.system?.tier ?? 1, source: by?.uuid ?? null, add, name: game.i18n.localize(`AZEROTH.DeathKnight.Plague.${kind === "frostFever" ? "FrostFever" : "BloodPlague"}`) });
  if (!tick) return { landed: false, reason: "gone" };
  const { spellTiming } = await import("./durations.mjs");
  const timing = spellTiming(victim, { value: tick.rounds, units: "rounds", expiry: "turnEnd" })
    ?? spellTiming(victim, { value: 1, units: "minutes" }) ?? {};
  const made = await layTickOn(victim, { tick, origin: by?.uuid ?? null, timing, img: kind === "frostFever" ? "icons/magic/water/snowflake-ice-blue.webp" : "icons/magic/unholy/orb-glowing-purple.webp" });
  if (!made) return { landed: false, reason: "refused" };
  const carrier = plagueCarrier(kind);
  if (carrier.statuses.length || carrier.changes.length) await made.update({ statuses: carrier.statuses, "system.changes": carrier.changes });
  // The carrier's id, so a withdrawn hit takes the disease back off (O-346).
  return { landed: true, reason: null, effectId: made.id };
}

/**
 * The GM-side handler: the asker must own the knight whose hand the tick records, and the
 * carrier is built again here off the knight's own tier, never trusted off the request.
 */
export async function layPlagueQueryHandler({ victimUuid = null, kind = null, byUuid = null } = {}, { user = null } = {}) {
  const victim = victimUuid ? await fromUuid(victimUuid) : null;
  const by = byUuid ? await fromUuid(byUuid) : null;
  if (victim?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && (by?.documentName !== "Actor" || !by.testUserPermission(user, "OWNER"))) {
    throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: by?.name ?? "" }));
  }
  // **WHAT THE WORLD HOLDS, JUDGED AGAIN** (the final review's finding 4, D-997): a kind 02 prints
  // and a knight who holds Plague. **THE TRUST MODEL** (O-386): no card records the hit or the rune
  // when this is asked - the attack lays the disease before its card is posted - so the hit and
  // the rune are the asker's word, as a card's author is believed elsewhere (O-379).
  const refusal = plagueAskRefusal({ kind, featureNames: [...(by?.items ?? [])].filter(i => i.type === "feature").map(i => i.name) });
  if (refusal) throw new Error(t(`AZEROTH.DeathKnight.Plague.Refuse.${refusal}`, { name: by?.name ?? "" }));
  return plagueHere(victim, kind, by);
}

/**
 * **PLAGUE ON THE CREATURE STRUCK** (02 §7): here where this client owns it, through the
 * active GM's client otherwise. Answers the card's line. A creature immune to disease takes
 * none (`conditionImmunities`, the affliction door's own reading).
 *
 * @param {{victim: Actor|null, kind: "frostFever"|"bloodPlague", by: Actor}} o
 * @returns {Promise<string>}
 */
export async function layPlague(o = {}) {
  return (await layPlagueOn(o)).text;
}

/**
 * `layPlague`'s door with the carrier it laid: the card's line and the effect's id, which the
 * attack card records as a landing (`recordHit`'s `mark`, `rules/miss.mjs`) so a Parry or an
 * Afterimage that withdraws the hit takes the disease back off - a withdrawn hit never landed
 * (the F2 review's must-fix 2, O-346).
 *
 * @param {{victim: Actor|null, kind: "frostFever"|"bloodPlague", by: Actor}} o
 * @returns {Promise<{text: string, effectId: string|null}>}
 */
export async function layPlagueOn({ victim = null, kind = "frostFever", by = null } = {}) {
  const name = game.i18n.localize(`AZEROTH.DeathKnight.Plague.${kind === "frostFever" ? "FrostFever" : "BloodPlague"}`);
  const said = text => ({ text, effectId: null });
  if (!victim) return said(t("AZEROTH.Card.TargetGone"));
  if ((victim.system?.conditionImmunities ?? []).includes?.("diseased")) return said(t("AZEROTH.DeathKnight.Plague.Immune", { name: victim.name, plague: name }));
  let done;
  if (victim.isOwner) done = await plagueHere(victim, kind, by);
  else {
    const gm = game.users?.activeGM ?? null;
    if (!gm) return said(t("AZEROTH.Tick.NoGM", { name: victim.name }));
    try {
      done = await gm.query(LAY_PLAGUE_QUERY, { victimUuid: victim.uuid, kind, byUuid: by?.uuid ?? null }, { timeout: 15000 });
    } catch (err) {
      return said(err.message);
    }
  }
  return {
    text: t(done?.landed ? "AZEROTH.DeathKnight.Plague.Laid" : "AZEROTH.DeathKnight.Plague.NotLaid", { name: victim.name, plague: name }),
    effectId: done?.landed && typeof done.effectId === "string" ? done.effectId : null
  };
}

/** Whether an effect is a Plague this knight laid (the census's and Empower Runeweapon's reading). */
export function isPlagueBy(effect, knight) {
  const tick = effect?.flags?.[SCOPE]?.[TICK_FLAG] ?? null;
  return Boolean(tick?.plague) && (tick.source ?? null) === (knight?.uuid ?? null);
}

/**
 * **A BLOOD PLAGUE SPREADS** (D-962): each time it deals its damage at the start of its
 * carrier's turn (`effects/ticks.mjs`), every creature within 5 feet of the carrier but the
 * knight and those already carrying the knight's Blood Plague (`rules/death-knight.mjs
 * #spreadTargets`) is posted a Body Resilience Test against the knight's Spell DC - the
 * splash Test's card (`effects/area-strikes.mjs#postSplashTest`, the pattern for a Test with no
 * Region), rolled by the creature's owner, a failure landing the knight's own Blood Plague
 * through Plague's door (`areaTestOutcome`). A new carrier spreads it on its own ticks.
 *
 * @param {{carrier: Actor, knight: Actor|null}} o
 * @returns {Promise<string[]>}  the lines for the tick's card
 */
export async function spreadBloodPlague({ carrier, knight = null } = {}) {
  if (!carrier || !knight) return [];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { postSplashTest } = await import("./area-strikes.mjs");
  const fight = carrier.activeFight?.() ?? null;
  const scene = fight?.scene ?? canvas?.scene ?? null;
  const from = scene?.tokens?.find?.(tk => tk.actor === carrier || (tk.actorLink && tk.actorId === carrier.id)) ?? null;
  if (!from) return [];
  const rows = [];
  for (const tk of scene.tokens ?? []) {
    const a = tk.actor;
    if (!a || tk === from || tk.hidden) continue;
    rows.push({
      uuid: a.uuid, token: tk, actor: a,
      feet: feetApart(from, tk),
      carries: (a.effects ?? []).some(e => e.flags?.[SCOPE]?.[TICK_FLAG]?.plague === "bloodPlague" && e.flags[SCOPE][TICK_FLAG].source === knight.uuid),
      down: a.type === "npc" && (a.system?.health?.value ?? 0) <= 0
    });
  }
  const pick = new Set(spreadTargets(rows, { knightUuid: knight.uuid, carrierUuid: carrier.uuid }));
  const lines = [];
  const name = game.i18n.localize("AZEROTH.DeathKnight.Plague.BloodPlague");
  for (const r of rows.filter(r => pick.has(r.uuid))) {
    await postSplashTest({
      actor: r.actor, token: r.token, check: spreadCheck(), caster: knight,
      spell: { name, school: null, feature: true }, dc: knight.system?.spellDC ?? knight.system?.spells?.dc ?? null,
      cast: null, source: null, around: carrier.name, feet: BLOOD_PLAGUE_SPREAD.feet
    });
    lines.push(t("AZEROTH.DeathKnight.Plague.SpreadTest", { name: r.actor.name, from: carrier.name }));
  }
  return lines;
}
