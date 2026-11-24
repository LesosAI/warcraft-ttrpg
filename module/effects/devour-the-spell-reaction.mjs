/**
 * **07's DEVOUR THE SPELL, AT A CREATURE'S TURN START** (07: *Cast this at the start of the turn of a creature within
 * 30 feet of you that is Sustaining a spell of tier 3 or lower, before it pays that spell's upkeep. The creature makes
 * a Spirit Resilience Test against your Spell DC. On a failure the spell ends and you gain Hatred equal to its tier
 * plus 2*; the lead's ruling of 2026-11-22, D-1717; built as an in-flight gate, D-1726).
 *
 * Sealing Flame's shape (`effects/sealing-flame-reaction.mjs`): the turn's own door asks, the hunter answers on the
 * client that answers for it (`blow-doors.mjs#answererOf`, `confirmHere`) and casts there through `castWithDialog`
 * with a claim into `castSpell`, which refuses Devour the Spell without a claim that still names this moment, in
 * words, before anything is paid. Then, back on the GM's client and still before the upkeep:
 *
 * 1. `devourTurnStart(combat, combatant)` - awaited by `AzerothCombat#_onStartTurn` after the turn's refill and
 *    BEFORE `_turnTicks` (where the upkeep is paid), on the active GM's client, in a started fight. A cheap exit for a
 *    creature with no Sustain of tier 3 or lower. Each hunter on the creature's scene is judged off the world
 *    (`rules/demon-hunter-spells.mjs#devourTurnRefusal`: the spell held, never the creature itself - a hunter cannot
 *    devour its own Sustained spell - standing, within 30 feet, a Sustain the one Dispel judgement passes, a hunter
 *    who may gain Hatred, a Reaction left, 6 Energy in the merged pool) and asked in turn, sorted by actor; the first
 *    yes wins, and a cast made (succeeded or failed) ends the asking.
 * 2. On a successful cast the creature's Spirit Resilience Test is rolled here, in flight, at the hunter's Spell DC,
 *    through the after-the-die seam (`AzerothActor#offerElunesRegard`); a failure ends the Sustain through
 *    `effects/demon-hunter-spells.mjs#endPickedSpell` (the one end door, which gives the Hatred, source `devour`), a
 *    pass leaves it to its upkeep. A card says which.
 */

import { devourCandidates, devourClaimHolds, devourTurnRefusal, readDevour } from "../rules/demon-hunter-spells.mjs";
import { judgeHeldCast } from "../rules/dispel.mjs";
import { unleashedGainRefusal } from "../rules/demon-hunter-features.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { answererOf, confirmHere } from "./blow-doors.mjs";

const SCOPE = "azeroth-rpg";
const IDENTIFIER = "devour-the-spell";

/** The query the active GM asks a hunter's answering client through (`module/queries.mjs`). */
export const DEVOUR_CAST_QUERY = "azeroth-rpg.devourCast";

const t = (key, data = {}) => game.i18n.format(key, data);
const resolve = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
const isActiveGM = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/**
 * **A SEAM FOR THE QUENCH BATCH** (as `setDemonHunterPick` is): a function answering the hunter's yes and the Sustain
 * picked - `{yes, cast}` - in place of the dialog and the chooser. Null puts them back.
 */
let devourAnswer = null;
export function setDevourAnswer(fn = null) {
  devourAnswer = typeof fn === "function" ? fn : null;
}

/** The Devour the Spell an actor holds, or null. */
export function devourSpellOf(actor) {
  return actor?.items?.find?.(i => i.type === "spell" && i.system?.identifier === IDENTIFIER) ?? null;
}

/** The tier of the spell a Sustain entry belongs to, off the sustainer's own item or the uuid. */
function entryTier(holder, entry) {
  const item = (entry?.spellId && holder?.items?.get?.(entry.spellId)) || resolve(entry?.uuid);
  const tier = item?.type === "spell" ? Math.trunc(Number(item.system?.tier)) : NaN;
  return Number.isFinite(tier) && tier > 0 ? tier : null;
}

/** The creature's Sustains of tier 3 or lower, with their tiers, as `devourCandidates` reads them. */
function candidatesOf(creature, maxTier) {
  const entries = (creature?.getFlag?.(SCOPE, "sustaining") ?? []).map(e => ({ cast: e?.cast, name: e?.name ?? "", tier: entryTier(creature, e) }));
  return devourCandidates(entries, { maxTier });
}

/** The fight as the claim reads it. */
function fightFacts(combat) {
  if (!combat) return null;
  return { id: combat.id, started: combat.started === true, round: combat.round, turn: combat.turn, combatantActorUuid: combat.combatant?.actor?.uuid ?? null };
}

/**
 * **WHETHER A CLAIM STILL NAMES THIS MOMENT** (`devourClaimHolds`): the fight, round and turn, the creature the turn's
 * combatant still Sustaining the claimed cast at or below the tier, and the caster another creature.
 *
 * @param {{caster: Actor, claim: object}} o
 * @returns {boolean}
 */
export function devourWindow({ caster = null, claim = null } = {}) {
  const combat = claim?.combatId ? game.combats?.get?.(claim.combatId) ?? null : null;
  const creature = resolve(claim?.creatureUuid);
  const entry = (creature?.getFlag?.(SCOPE, "sustaining") ?? []).find(e => e?.cast === claim?.cast) ?? null;
  return devourClaimHolds({
    claim, fight: fightFacts(combat), casterUuid: caster?.uuid ?? null,
    sustained: entry ? { cast: entry.cast, tier: entryTier(creature, entry) } : null,
    maxTier: Math.trunc(Number(claim?.maxTier)) || 3
  });
}

/**
 * **THE SUSTAIN A VALID CLAIM ENDS**, as `endPickedSpell` reads it, or null where the claim no longer holds. Asked by
 * `judgeDhSpell` inside `castSpell`, before anything is paid.
 *
 * @param {object} claim
 * @returns {Promise<object|null>}
 */
export async function devourPicked(claim) {
  const creature = resolve(claim?.creatureUuid);
  const entry = (creature?.getFlag?.(SCOPE, "sustaining") ?? []).find(e => e?.cast === claim?.cast) ?? null;
  if (!creature || !entry) return null;
  return {
    key: `sustain:${creature.uuid}:${entry.cast}`, kind: "sustain", creatureUuid: creature.uuid, cast: entry.cast,
    casterUuid: creature.uuid, tier: entryTier(creature, entry), maxTier: Math.trunc(Number(claim.maxTier)) || 3,
    sustained: true, name: entry.name ?? "", local: true
  };
}

/**
 * **THE HUNTER'S SIDE: ASKED, JUDGED AGAIN, CAST** (the query's handler on the answering client, or here where this
 * client answers). The hunter's own judgement again - a GM asked first (`gmAbsentFor`), the window, the spell - then
 * the yes, the Sustain picked where the creature holds more than one, and the cast through the roll dialog with the
 * claim into `castSpell`. Answers the card's uuid, or null for a no or a refusal.
 */
export async function devourCast(payload = {}, { user = null } = {}) {
  if (!user?.isGM) return null;
  const hunter = resolve(payload.hunterUuid);
  const spell = hunter?.items?.get?.(payload.spellId) ?? null;
  if (!hunter?.isOwner || !spell || spell.system?.identifier !== IDENTIFIER) return null;
  if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return null;
  const creature = resolve(payload.creatureUuid);
  const casts = (Array.isArray(payload.casts) ? payload.casts : []).filter(c => c?.cast);
  if (!creature || !casts.length) return null;
  const words = { name: hunter.name, creature: payload.creatureName ?? creature.name, spell: casts[0].name, tier: casts[0].tier, feet: payload.feet ?? 30, n: payload.cost ?? spell.system?.mana ?? 6 };
  let yes = false;
  let cast = casts[0].cast;
  if (devourAnswer) {
    const answer = await devourAnswer({ hunter, creature, casts });
    yes = answer?.yes === true;
    if (answer?.cast && casts.some(c => c.cast === answer.cast)) cast = answer.cast;
  } else {
    yes = await confirmHere(hunter, { title: spell.name, text: foundry.utils.escapeHTML(t(casts.length > 1 ? "AZEROTH.DhSpell.Devour.AskMany" : "AZEROTH.DhSpell.Devour.Ask", words)) });
    if (yes && casts.length > 1) {
      const options = casts.map(c => ({ key: c.cast, name: c.name, description: t("AZEROTH.DhSpell.Pick.Tier", { n: c.tier }) }));
      const pick = await game.system.azeroth.workflows.chooseOption(spell, options, null, { prompt: t("AZEROTH.DhSpell.Devour.Pick", { spell: spell.name, creature: words.creature }) });
      if (!pick) return null;
      cast = pick.key;
    }
  }
  if (!yes) return null;
  const claim = {
    creatureUuid: creature.uuid, cast, combatId: payload.combatId, round: payload.round, turn: payload.turn, maxTier: payload.maxTier ?? 3
  };
  if (!devourWindow({ caster: hunter, claim })) {
    ui.notifications?.warn(t("AZEROTH.DhSpell.Devour.Refuse.trigger", { spell: spell.name }));
    return null;
  }
  const targets = [{ actorId: creature.id, sceneId: payload.sceneId ?? null, tokenId: payload.tokenId ?? null, name: words.creature }];
  const card = await game.system.azeroth.actions.castWithDialog(hunter, spell, null, {
    targets,
    run: options => {
      if (!devourWindow({ caster: hunter, claim })) {
        ui.notifications?.warn(t("AZEROTH.DhSpell.Devour.Refuse.trigger", { spell: spell.name }));
        return null;
      }
      return game.system.azeroth.workflows.castSpell({ ...options, devourClaim: claim });
    }
  });
  return card?.uuid ?? null;
}

/** Ask one hunter: here where this client answers for it, else the query on the user who does. */
async function askHunter(hunter, payload) {
  const who = answererOf(hunter);
  if (!who) return null;
  if (who.id === game.user.id) return devourCast(payload, { user: game.user });
  try {
    return await who.query(DEVOUR_CAST_QUERY, payload, { timeout: 120000 });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.BlowDoor.NoAnswer", { name: hunter.name, reason: err.message }));
    return null;
  }
}

/** The Energy a hunter holds in the pool that pays the spell (the merged pool where two classes give it). */
async function energyOf(hunter) {
  const { dhPoolOf } = await import("./demon-hunter-features.mjs");
  return Math.max(0, Math.trunc(Number(dhPoolOf(hunter, "power", "energy")?.value)) || 0);
}

/**
 * **THE TURN START'S GATE** (D-1726): see the module's head. Never throws into the turn; a fault is said.
 *
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @returns {Promise<{cast: boolean, ended: boolean}|null>}
 */
export async function devourTurnStart(combat, combatant) {
  if (!isActiveGM() || !combat?.started) return null;
  const creature = combatant?.actor ?? null;
  const token = combatant?.token ?? null;
  // The cheap exit: no Sustain at all, or none of tier 3 or lower (07's line names the tier).
  if (!creature || !token?.parent || !(creature.getFlag?.(SCOPE, "sustaining") ?? []).length) return null;
  const maxTier = 3;
  const candidates = candidatesOf(creature, maxTier);
  if (!candidates.length) return null;
  const { archmageAmong } = await import("./dispel.mjs");
  const archmage = archmageAmong([creature.uuid]);
  const passed = judgeHeldCast({ by: creature.uuid }, { archmage }).ok;
  const scene = token.parent;
  const seen = new Set();
  const hunters = [...(scene.tokens ?? [])]
    .filter(tk => tk.actor?.type === "character" && devourSpellOf(tk.actor))
    .sort((a, b) => String(a.actor.uuid).localeCompare(String(b.actor.uuid)) || String(a.id).localeCompare(String(b.id)));
  for (const tk of hunters) {
    const hunter = tk.actor;
    if (seen.has(hunter.uuid)) continue;
    seen.add(hunter.uuid);
    const spell = devourSpellOf(hunter);
    const reading = readDevour(spell?.system?.effect ?? "");
    if (!reading) continue;
    const allowed = candidates.filter(c => c.tier <= reading.maxTier);
    const cost = Math.max(0, Math.trunc(Number(spell.system?.mana)) || 0);
    const refused = devourTurnRefusal({
      holds: Boolean(spell), self: hunter.uuid === creature.uuid || tk.id === token.id,
      health: hunter.system?.health?.value ?? 0, feet: feetApart(token, tk), reach: reading.feet,
      candidates: allowed.length, passed,
      unleashed: Boolean(unleashedGainRefusal({ unleashed: hunter.shape?.kind === "unleashed", source: "devour", before: 0, after: 1 })),
      reactionLeft: game.system.azeroth.workflows.turnBudgetRefusal?.(hunter, "reaction") === null,
      energy: await energyOf(hunter), cost, gmAbsent: false
    });
    if (refused) continue;
    const payload = {
      hunterUuid: hunter.uuid, spellId: spell.id, creatureUuid: creature.uuid, creatureName: token.name ?? creature.name,
      sceneId: scene.id, tokenId: token.id, combatId: combat.id, round: combat.round, turn: combat.turn,
      maxTier: reading.maxTier, feet: reading.feet, cost, casts: allowed
    };
    const card = resolve(await askHunter(hunter, payload));
    if (!card) continue;
    const flags = card.flags?.[SCOPE] ?? {};
    // The first yes wins: a cast made ends the asking, whatever its Test did.
    if (flags.spellLockCaster !== hunter.uuid || flags.identifier !== IDENTIFIER) return { cast: false, ended: false };
    if (flags.success !== true) return { cast: true, ended: false };
    const picked = flags.demonHunterSpell?.picked ?? null;
    if (!picked?.cast || picked.creatureUuid !== creature.uuid) return { cast: true, ended: false };
    return { cast: true, ended: await devourTest({ hunter, creature, token, picked, spell, dc: flags.demonHunterSpell?.spellDC ?? hunter.system?.spellDC ?? null, messageId: card.id }) };
  }
  return null;
}

/**
 * The creature's Spirit Resilience Test against the hunter's Spell DC, rolled here, in flight, through the
 * after-the-die seam; a failure ends the Sustain and gives the Hatred through the one end door. Posts a card.
 */
async function devourTest({ hunter, creature, token, picked, spell, dc, messageId }) {
  const spellDC = Math.trunc(Number(dc));
  if (!(spellDC > 0)) {
    ui.notifications?.warn(t("AZEROTH.DhSpell.Devour.NoDC", { name: hunter.name, spell: spell.name }));
    return false;
  }
  const { AzerothRoll } = await import("../dice/azeroth-roll.mjs");
  const { resilienceModifiers } = game.system.azeroth.workflows;
  const roll = AzerothRoll.build({ dc: spellDC, kind: "resilience", modifiers: resilienceModifiers(creature, "spirit"), rollData: creature.getRollData?.() ?? {}, roller: creature, chosen: null });
  roll.options.resilience = "spirit";
  await roll.evaluate();
  await creature.offerElunesRegard?.(roll);
  const failed = roll.outcome?.success !== true;
  const words = { creature: token.name ?? creature.name, total: roll.total, dc: spellDC, spell: picked.name ?? "", name: hunter.name, by: spell.name };
  const lines = [t(failed ? "AZEROTH.DhSpell.Devour.Failed" : "AZEROTH.DhSpell.Devour.Passed", words)];
  if (failed) {
    const { endPickedSpell } = await import("./demon-hunter-spells.mjs");
    lines.push(...await endPickedSpell({ caster: hunter, picked: { ...picked, plus: picked.plus ?? 2 }, kind: "devour", spellName: spell.name, messageId, spellUuid: spell.uuid }));
  }
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: creature }),
    rolls: [roll],
    content: `<div class="azeroth azeroth-card"><div class="azeroth-card-body"><p><strong>${esc(t("AZEROTH.DhSpell.Devour.Title", { spell: spell.name }))}</strong></p>${lines.map(l => `<p class="azeroth-drain">${esc(l)}</p>`).join("")}</div></div>`,
    flags: { [SCOPE]: { kind: "devourTest", identifier: IDENTIFIER, failed, by: hunter.uuid, creature: creature.uuid } }
  });
  return failed;
}

