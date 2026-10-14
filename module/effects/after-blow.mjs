/**
 * **WHAT A BLOW THAT LANDED DOES BEYOND ITS TARGET** (D-627, D-711 phase 2,
 * D-768): Killing Blow's Rage for the attacker, a Paladin's Zeal for a friendly
 * target reduced to 0 or struck within 20 feet, and the attacker's own mark of
 * who it has damaged, which Elemental Fury and Lunar Guidance read.
 *
 * **IT RUNS FROM `AzerothActor#applyDamage` AND NOWHERE ELSE** (D-768). It lived
 * in `dice/chat.mjs` and ran from a chat card's Apply button alone, so damage
 * from an area's tick (`effects/area-strikes.mjs#strikeFromArea`, which
 * `AzerothCombat#_areaTicks` drives) never reached it: no Killing Blow, no
 * Righteous Fury, no damaged mark for a Consecration that burned somebody. The
 * one damage door calls it once per struck blow, after the Health is written,
 * so every path reaches it exactly once.
 *
 * The arithmetic is `rules/momentum.mjs`' (`killingBlowRage`, `zealFromBlow`).
 * Distances need tokens on the viewed scene, measured between the nearest
 * spaces (D-732); without them the ally rules stay quiet. Written by whoever
 * applied the damage, so only the actors that client owns move.
 */

import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";
import { killingBlowRage, zealFromBlow } from "../rules/momentum.mjs";
// What a kill and a friendly target's fall give (04's Follow Through, Rampage
// and Vengeance; D-772), and the next attack's promise they lay.
import { allyDownFor, avengedBy, killRewardsFor, killStrikesFor } from "../rules/class-talents.mjs";
import { layNextAttack } from "./next-attack.mjs";
// Whose companion struck the blow (04's Beast Frenzy, D-773).
import { bondOf } from "../documents/bound.mjs";
// The Priest's (D-774): Vampiric Touch's Health back off a Shadow blow, Shadowy
// Apparition's strike on the enemies around a creature that died suffering the
// priest's Shadow, and Shadowform's mark for a Holy blow dealt.
import { apparitionsFor, damagedTypeKey, drainFor, sufferingFrom } from "../rules/class-talents.mjs";
// The Mage's and the Warlock's (D-775): Ignite laid by Fire, Living Bomb off it,
// Siphon's record, and what a death under a held spell or a Haunt returns.
import {
  SIPHON_FLAG, deathRewardsFor, hauntHeals, heldOn, igniteBurning, igniteFor, igniteTick, ignites, siphonFor, siphonRecord
} from "../rules/class-talents.mjs";
import { layTickBy } from "./ticks.mjs";
import { manaPool } from "../rules/pools.mjs";
import { creaturesWithin } from "../canvas/engaged.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { markLightUsed } from "./shadowform.mjs";
import { AZEROTH } from "../config.mjs";

/**
 * The query a Vengeance holder another user owns is reached through, on the
 * active GM's client (the architect's review of D-772), as Beacon's share and
 * Mortal Strike's mark are reached.
 */
export const VENGEANCE_QUERY = "azeroth-rpg.vengeance";

/** The feet a Paladin's Zeal reaches for a friendly target (02 §7, 04's Righteous Fury). */
const ZEAL_REACH_FEET = 20;

/**
 * @param {{target: Actor, before: number, attacker?: Actor|null, riposte?: boolean, attack?: boolean,
 *   type?: string|null, spell?: boolean, ignite?: boolean}} o
 *   `before` is the target's Health before the blow; `attacker` whoever dealt
 *   it, or null for a blow with no dealer the table can name; `riposte` whether
 *   the blow was 06 §7's Riposte (04's Killing Spree, D-773); `spell` whether a
 *   spell dealt it and `ignite` whether it was Ignite's own tick (D-775).
 */
export async function afterBlow({ target, before, attacker = null, riposte = false, attack = true, type = null, spell = false, ignite = false }) {
  if (!target) return;
  const after = target.system?.health?.value ?? 0;
  const max = target.system?.health?.max ?? 0;
  const combat = target.activeFight?.() ?? null;
  // **WHO THIS ATTACKER HAS DAMAGED** (04's Elemental Fury and Lunar Guidance:
  // *against a target that has taken damage from you*), on the ATTACKER's own
  // combatant, keyed by the victim's token; `_leaveFight` clears it. And with
  // WHICH damage type (04's Twisted Faith: *a target dealt Shadow damage by you*;
  // D-774).
  await markDamaged({ attacker, target, dealt: before - after, type });
  // **THE PRIEST'S** (D-774): Shadowform's mark where the blow was Holy, and
  // Vampiric Touch's Health where it was Shadow and reduced the target's Health.
  if (attacker && type === "holy" && before - after > 0) await markLightUsed(attacker);
  await drainBack({ attacker, type, dealt: before - after });
  // **THE MAGE'S AND THE WARLOCK'S** (D-775): Ignite laid by Fire that reduced
  // the target's Health, and Siphon's record of the highest Shadow or Fel loss.
  // Guarded one by one: bookkeeping beyond the target never stops the next.
  try {
    await igniteFrom({ attacker, target, type, dealt: before - after, fromIgnite: ignite === true });
  } catch (err) {
    console.error("azeroth-rpg | ignite", err);
  }
  try {
    await siphonMark({ attacker, type, dealt: before - after });
  } catch (err) {
    console.error("azeroth-rpg | siphon", err);
  }
  // A creature that died (D-774's reading: an NPC reduced to 0): Shadowy
  // Apparition and Living Bomb off the ticks it carried, whoever's blow it was
  // (D-775), and what a death under a held spell returns its caster.
  if (before > 0 && after === 0 && target.type === "npc") {
    await apparitionOf({ target });
    try {
      await deathRewards({ target });
    } catch (err) {
      console.error("azeroth-rpg | death rewards", err);
    }
  }
  if (!combat) return;
  // 04's Killing Blow: *When you reduce a target below half Health, gain 6 Rage.*
  if (attacker?.isOwner) {
    const rage = killingBlowRage({ before, after, max, ranks: attacker.talentRanks?.("Killing Blow") ?? 0 });
    const pool = rage > 0 ? attacker.poolSnapshot().find(p => p.kind === "momentum" && p.name === "rage") : null;
    if (pool) await attacker.updatePool({ itemId: pool.itemId, kind: "momentum", value: Math.min(pool.max, pool.value + rage) });
  }
  // **WHAT A KILL GIVES** (04's Follow Through: *When an attack or effect of
  // yours reduces a target to 0 Health, your next attack this round gains a
  // Boon. At rank 2 you also gain a Half-Action*; Rampage: *... gain a
  // Half-Action. At rank 2 you also gain 2 Rage*; D-772): from this one door,
  // so a tick's kill counts as a card's does (*an attack or effect of yours*).
  // **AND 04's SHADOWBURN** (*A spell of yours that reduces a target to 0 Health
  // returns 3 Mana per rank*; D-775): a kill row marked `spell` reads `spell`.
  if (attacker?.isOwner && before > 0 && after === 0) await rewardKill(attacker, combat, { spell: spell === true });
  // **ONE MORE ATTACK A KILL GIVES** (04's Killing Spree: *When a Riposte of yours
  // reduces a target to 0 Health, make one attack immediately against another
  // target within reach*; Beast Frenzy: *when an attack your companion made
  // reduces a target to 0 Health, it may attack again immediately*; D-773): an
  // offer card, the attack at no budget, its clock judged at the press.
  // An ATTACK's kill: a tick, an area and a retaliation make none (`attack`).
  if (attacker && attack && before > 0 && after === 0) await offerKillStrikes({ attacker, target, riposte });
  const targetToken = target.getActiveTokens?.(true)[0] ?? null;
  const mine = combat.getCombatantsByActor(target)?.[0] ?? null;
  if (!targetToken || !mine) return;
  // The struck friendly's footprint, laid out once for every ally (D-732's review).
  const fallen = footprintOf(targetToken);
  // **VENGEANCE** (04: *When a friendly target within 20 feet drops to 0 Health,
  // your next attack this encounter adds your tier per rank to its damage*;
  // D-772): every holder on the fallen creature's side within reach, the fallen
  // creature itself never (MY READING, for the lead: 02's fallen-friend Zeal is
  // the same wording, on which the lead ruled *"Others only"*, D-768).
  if (before > 0 && after === 0) await avenge({ combat, target, targetToken, fallen, side: mine.side });
  for (const combatant of combat.combatants) {
    const ally = combatant.actor;
    if (!ally || combatant.side !== mine.side || !ally.isOwner) continue;
    const zeal = ally.poolSnapshot?.().find(p => p.kind === "momentum" && p.name === "zeal") ?? null;
    if (!zeal) continue;
    // THE PALADIN THEMSELF (D-768): Righteous Fury's *a friendly target* counts
    // its holder (the lead's D-755 reading); 02's fallen-friend Zeal does not -
    // the lead: *"Others only"* (`rules/momentum.mjs#ZEAL_DOWN_COUNTS_SELF`).
    const self = ally === target || ally.uuid === target.uuid;
    const token = self ? targetToken : (ally.getActiveTokens?.(true)[0] ?? null);
    if (!token || token.document?.parent?.id !== targetToken.document?.parent?.id) continue;
    // Between the nearest spaces and in three dimensions, as every distance is
    // (D-732); a pair that could not be measured is nobody's to reach.
    const feet = self ? 0 : feetBetweenFootprints(fallen, footprintOf(token), targetToken.document?.parent?.grid ?? null);
    if (feet === null || feet > ZEAL_REACH_FEET) continue;
    const gain = zealFromBlow({ before, after, self, righteousFury: ally.talentRanks?.("Righteous Fury") ?? 0 });
    if (gain > 0) await ally.updatePool({ itemId: zeal.itemId, kind: "momentum", value: Math.min(zeal.max, zeal.value + gain) });
  }
}

/**
 * What a kill gives its maker (D-772): the Half-Actions through the
 * combatant's own queued door (D-761), a pool's gain, and the next attack's
 * promise. In a fight alone - a Half-Action and *this round* need one.
 *
 * @param {Actor} attacker
 * @param {Combat} combat
 */
async function rewardKill(attacker, combat, { spell = false } = {}) {
  const reward = killRewardsFor(attacker.takenTalents?.() ?? [], undefined, { spell });
  if (!reward.by.length) return;
  const combatant = combat.getCombatantsByActor(attacker)?.[0] ?? null;
  if (reward.halfActions > 0 && combatant?.isOwner) await combatant.grantHalfActions(reward.halfActions);
  for (const gain of reward.gains) {
    const pool = attacker.poolSnapshot?.().find(p => p.name === gain.pool) ?? null;
    if (pool) await attacker.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(pool.max, pool.value + gain.amount) });
  }
  if (reward.nextAttack.length) await layNextAttack(attacker, reward.nextAttack);
  ui.notifications?.info(game.i18n.format("AZEROTH.Kill.Rewarded", {
    name: attacker.name, talents: reward.by.join(", "), halves: reward.halfActions
  }));
}

/** The offer card's template. */
const KILL_STRIKE_TEMPLATE = "systems/azeroth-rpg/templates/chat/kill-strike.hbs";

/**
 * **THE OFFER A KILL MAKES** (D-773): one card a striker, naming the attack it
 * may make and how many a round, with the creature just killed recorded so a
 * press aimed at it again is refused (Killing Spree's *another target*). The
 * block names the striker's owner (`data-reaction-owner`), so whoever owns the
 * creature that may strike sees the button whoever applied the blow; the GM owns
 * every creature and sees it too.
 *
 * - **Killing Spree**: the striker's own talent, on a Riposte's kill.
 * - **Beast Frenzy**: the OWNER's talent, on a kill the owner's companion made.
 *
 * @param {{attacker: Actor, target: Actor, riposte?: boolean}} o
 */
async function offerKillStrikes({ attacker, target, riposte = false }) {
  const offers = [];
  if (attacker.type === "character") {
    for (const s of killStrikesFor(attacker.takenTalents?.() ?? [], { who: "self", riposte })) offers.push({ striker: attacker, ...s, once: false });
  }
  const bond = attacker.type === "npc" ? bondOf(attacker) : null;
  if (bond?.kind === "companion" && bond.ownerUuid) {
    let owner = null;
    try {
      owner = fromUuidSync(bond.ownerUuid);
    } catch {
      owner = null;
    }
    if (owner?.takenTalents) {
      for (const s of killStrikesFor(owner.takenTalents(), { who: "companion" })) offers.push({ striker: attacker, ...s, once: true });
    }
  }
  if (!offers.length) return;
  const token = target.getActiveTokens?.(true)?.[0] ?? null;
  const killed = { actorId: target.id ?? null, tokenId: token?.id ?? null, name: target.name ?? "" };
  for (const offer of offers) {
    const text = game.i18n.format(offer.target === "other" ? "AZEROTH.KillStrike.TextOther" : "AZEROTH.KillStrike.Text", {
      name: offer.striker.name, target: killed.name, n: offer.count
    });
    // The card's action lives in a template (the data-action audit, D-656).
    const content = await foundry.applications.handlebars.renderTemplate(KILL_STRIKE_TEMPLATE, {
      name: offer.name, text, strikerUuid: offer.striker.uuid, identifier: offer.identifier,
      label: game.i18n.format("AZEROTH.KillStrike.Button", { name: offer.striker.name })
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: offer.striker }),
      content,
      flags: { "azeroth-rpg": { kind: "killStrike", killStrike: {
        identifier: offer.identifier, name: offer.name, count: offer.count, target: offer.target,
        once: offer.once === true, strikerUuid: offer.striker.uuid, killed
      } } }
    });
  }
}

/**
 * What a friendly target's fall gives the holders of Vengeance on its side
 * (D-772), each within the reach its row names, measured between the nearest
 * spaces (D-732). Written by whoever applied the blow: a holder this client
 * owns directly, and **a holder ANOTHER user owns through the active GM**
 * (`VENGEANCE_QUERY`; the architect's review), who judges the fall again before
 * anything is laid. It was skipped in silence when a player pressed Apply.
 */
async function avenge({ combat, target, targetToken, fallen, side }) {
  for (const combatant of combat.combatants) {
    const ally = combatant.actor;
    if (!ally || combatant.side !== side) continue;
    const row = allyDownFor(ally.takenTalents?.() ?? [], { tier: ally.system?.tier ?? 1 });
    if (!row) continue;
    const token = ally.getActiveTokens?.(true)[0] ?? null;
    const sameScene = Boolean(token) && token.document?.parent?.id === targetToken.document?.parent?.id;
    const feet = sameScene ? feetBetweenFootprints(fallen, footprintOf(token), targetToken.document?.parent?.grid ?? null) : null;
    if (!avengedBy({
      self: ally === target || ally.uuid === target.uuid, sameSide: true,
      fallenHealth: target.system?.health?.value ?? null, feet, reach: row.feet
    })) continue;
    if (ally.isOwner) await layNextAttack(ally, row.grants);
    else await avengeThroughGM({ holder: ally, fallen: target, feet });
  }
}

/**
 * Ask the active GM to lay a holder's Vengeance (the architect's review of
 * D-772), said in words where no GM is online or the GM refuses.
 *
 * @param {{holder: Actor, fallen: Actor, feet: number}} o
 */
async function avengeThroughGM({ holder, fallen, feet }) {
  const gm = game.users?.activeGM ?? null;
  if (!gm) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Vengeance.NoGM", { name: holder.name }));
    return null;
  }
  try {
    return await gm.query(VENGEANCE_QUERY, { holderUuid: holder.uuid, fallenUuid: fallen.uuid, feet }, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}

/**
 * The GM-side handler (`VENGEANCE_QUERY`). The asker must own the FALLEN
 * creature - it was their client that wrote its fall, as Beacon's asker owns the
 * healer - and the fall is judged again here off the world as the GM holds it:
 * the holder's own talents, the creature at 0, the two on one side of the
 * holder's fight, and the distance measured again where this client can (the
 * asker's measure stands where it cannot, Beacon's rule). Never trusted off the
 * request.
 *
 * @returns {Promise<Array<object>>}  the promises laid
 */
export async function vengeanceQueryHandler({ holderUuid = null, fallenUuid = null, feet = null } = {}, { user = null } = {}) {
  const holder = holderUuid ? await fromUuid(holderUuid) : null;
  const fallen = fallenUuid ? await fromUuid(fallenUuid) : null;
  if (holder?.documentName !== "Actor" || fallen?.documentName !== "Actor") {
    throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  }
  if (user && !fallen.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: fallen.name }));
  }
  const row = allyDownFor(holder.takenTalents?.() ?? [], { tier: holder.system?.tier ?? 1 });
  const combat = holder.activeFight?.() ?? null;
  if (!row || !combat) return [];
  const mine = combat.getCombatantsByActor(holder)?.[0] ?? null;
  const theirs = combat.getCombatantsByActor(fallen)?.[0] ?? null;
  const a = holder.getActiveTokens?.(true)[0] ?? null;
  const b = fallen.getActiveTokens?.(true)[0] ?? null;
  const here = a && b && a.document?.parent?.id === b.document?.parent?.id
    ? feetBetweenFootprints(footprintOf(b), footprintOf(a), b.document?.parent?.grid ?? null)
    : null;
  if (!avengedBy({
    self: holder === fallen || holder.uuid === fallen.uuid,
    sameSide: Boolean(mine && theirs) && mine.side === theirs.side,
    fallenHealth: fallen.system?.health?.value ?? null,
    feet: here ?? (typeof feet === "number" ? feet : null),
    reach: row.feet
  })) return [];
  return layNextAttack(holder, row.grants);
}

/**
 * Mark that this attacker has damaged this creature (D-711 phase 2).
 *
 * The attacker's OWN combatant carries the map, keyed by the victim's token
 * where it has one: *a target that has taken damage from you* is a fact about
 * the pair, and the attacker is the one whose dialog reads it. Written only by
 * a client that owns the combatant, like every other round flag.
 */
export async function markDamaged({ attacker, target, dealt = 0, type = null }) {
  if (!attacker || !target || dealt <= 0) return;
  const fight = attacker.activeFight?.() ?? null;
  const combatant = fight ? fight.getCombatantsByActor(attacker)?.[0] ?? null : null;
  if (!combatant?.isOwner) return;
  const key = target.getActiveTokens?.(true)[0]?.id ?? target.id;
  // The damage type rides the same map under `key:type` (04's Twisted Faith,
  // D-774), so every reader of `damaged[key]` reads exactly what it did.
  const typed = type ? damagedTypeKey(key, type) : null;
  const held = combatant.getFlag("azeroth-rpg", "damaged") ?? {};
  if (held[key] && (!typed || held[typed])) return;
  await combatant.setFlag("azeroth-rpg", "damaged", { ...held, [key]: true, ...(typed ? { [typed]: true } : {}) });
}

/**
 * **VAMPIRIC TOUCH** (04: *Once a round, when Shadow damage from you reduces a
 * target's Health, you restore Health equal to your rank*; D-774): the attacker's
 * own Health, once a round through the round's record (D-761's queued door), and
 * on every such blow out of a fight, where there is no round to count. Written
 * where this client may write the attacker, as Killing Blow's Rage is.
 *
 * @param {{attacker: Actor|null, type: string|null, dealt: number}} o
 */
async function drainBack({ attacker, type, dealt }) {
  if (!attacker?.isOwner || !(dealt > 0) || !type || typeof attacker.takenTalents !== "function") return;
  const row = drainFor(attacker.takenTalents(), { type });
  if (!row) return;
  const fight = attacker.activeFight?.() ?? null;
  const mine = fight ? (fight.getCombatantsByActor(attacker)?.[0] ?? null) : null;
  if (row.once === "round" && mine) {
    if (!mine.isOwner) return;
    const marked = await mine.markRoundOnce(row.identifier);
    if (!marked?.added) return;
  }
  const before = attacker.system?.health?.value ?? 0;
  await attacker.applyHealing(row.heal, { from: attacker });
  ui.notifications?.info(game.i18n.format("AZEROTH.VampiricTouch.Line", { name: attacker.name, n: Math.max(0, (attacker.system?.health?.value ?? before) - before), talent: row.name }));
}

/** The ACTIVE laid ticks on a creature, as plain flags (D-770's carrier). */
function activeTicks(actor) {
  return (actor?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"]?.tick ?? null).filter(Boolean);
}

/** An actor by uuid, synchronously, or null where it is gone. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/**
 * **SHADOWY APPARITION** (04: *When a target dies while suffering Shadow damage
 * from you, every other enemy within 20 feet takes Shadow damage equal to your
 * tier*; D-774) **AND LIVING BOMB** (*When a target burning from Ignite drops to 0
 * Health, every enemy within 10 feet takes Fire damage equal to your tier per
 * rank*; D-775): a card of its own with an Apply at each enemy of the holder
 * measured within the reach of the creature that fell, the damage mitigated
 * through each one's Ward - and no attack (a strike that answers a death, as a
 * tick is no attack, D-756). MY READING, for the lead: *dies* is a creature
 * reduced to 0 (a character at 0 is Dying, not dead), and *suffering Shadow damage
 * from you* is a Shadow tick the priest laid on it.
 *
 * **WHOEVER'S BLOW IT WAS** (D-775): the holders are the hands whose ticks the
 * fallen creature carried, read off the ticks themselves - it asked only the
 * attacker's talents, so a creature under a priest's Shadow Word: Pain that a
 * warrior finished set nothing off, though 04 asks only that it died suffering.
 *
 * @param {{target: Actor}} o
 */
async function apparitionOf({ target }) {
  const ticks = activeTicks(target);
  const sources = [...new Set(ticks.map(t => t.source).filter(s => typeof s === "string" && s))].sort();
  const fallen = target.getActiveTokens?.(true)?.[0] ?? null;
  if (!fallen) return;
  for (const uuid of sources) {
    const holder = actorAt(uuid);
    if (typeof holder?.takenTalents !== "function") continue;
    for (const row of apparitionsFor(holder.takenTalents(), { tier: holder.system?.tier ?? 1 })) {
      const suffering = row.from === "ignite" ? igniteBurning(ticks, { source: holder.uuid }) : sufferingFrom(ticks, { source: holder.uuid, type: row.type });
      if (!suffering) continue;
      try {
        await strikeAround({
          holder, centre: fallen, feet: row.feet, amount: row.amount, type: row.type, name: row.name,
          subtitle: game.i18n.format(row.from === "ignite" ? "AZEROTH.LivingBomb.Subtitle" : "AZEROTH.Apparition.Subtitle", { name: target.name }),
          explanation: row.from === "ignite"
            ? game.i18n.format("AZEROTH.StrikeAround.Explanation", { n: row.amount, type: game.i18n.localize(AZEROTH.schools[row.type] ?? row.type), feet: row.feet })
            : game.i18n.format("AZEROTH.Apparition.Explanation", { n: row.amount, feet: row.feet })
        });
      } catch (err) {
        console.error("azeroth-rpg | apparition", err);
      }
    }
  }
}

/**
 * **A STRIKE ON THE ENEMIES AROUND ONE CREATURE** (D-774's Shadowy Apparition card,
 * shared since D-775 with Living Bomb and Cauterize): a card with an Apply at each
 * enemy of the holder measured within the reach of the creature at its centre (the
 * holder's own token where none is named), the damage mitigated through each one's
 * Ward - and no attack. Nothing measured, nothing posted.
 *
 * @param {{holder: Actor, centre?: Token|null, feet: number, amount: number, type: string|null, name: string,
 *   subtitle?: string, explanation?: string|null}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function strikeAround({ holder, centre = null, feet = 0, amount = 0, type = null, name = "", subtitle = "", explanation = null } = {}) {
  const attacker = holder ?? null;
  const fallen = centre ?? attacker?.getActiveTokens?.(true)?.[0] ?? null;
  const row = { feet, amount: Math.max(0, Math.trunc(Number(amount)) || 0), type, name };
  if (!attacker || !fallen || !(row.amount > 0)) return null;
  const near = creaturesWithin(attacker, row.feet, { from: fallen, who: "enemy", except: [fallen.id] });
  if (!near.length) return null;
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const targets = targetSnapshots(near.map(r => r.token));
  return strikeCard({
    holder: attacker, targets, amount: row.amount, type: row.type, name: row.name, subtitle,
    explanation: explanation ?? game.i18n.format("AZEROTH.StrikeAround.Explanation", { n: row.amount, type: game.i18n.localize(AZEROTH.schools[row.type] ?? row.type ?? ""), feet: row.feet })
  });
}

/**
 * **A CARD OF TYPED DAMAGE ON NAMED CREATURES, NO ATTACK** (`strikeAround`'s own
 * card, shared since D-778 with 04's Unstable Affliction): each target's Apply, the
 * damage met by its own Ward, Immune and Vulnerable and an ally's aura after the
 * Ward, the speaker the creature whose talent it is.
 *
 * @param {{holder: Actor, targets: Array<object>, amount: number, type: string|null, name: string,
 *   subtitle?: string, explanation?: string, kind?: string}} o  `targets` as `targetSnapshots` shapes them
 * @returns {Promise<ChatMessage|null>}
 */
export async function strikeCard({ holder, targets = [], amount = 0, type = null, name = "", subtitle = "", explanation = "", kind = "apparition" } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!holder || !targets.length || !(n > 0)) return null;
  const damageByTarget = targets.map(t => resolveDamage({
    rating: n, sl: 0, kind: "magical", school: type,
    ward: t?.wardBySchool?.[type] ?? 0, schoolArmor: t?.schoolArmor?.[type] ?? 0,
    immune: t?.immune ?? [], vulnerable: t?.vulnerable ?? [], slAddsToDamage: false
  }));
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs", {
    config: AZEROTH, title: name, subtitle,
    damage: { final: damageByTarget[0]?.damage ?? n, explanation },
    targets: targets.map((t, index) => ({ ...t, index, damage: damageByTarget[index]?.damage ?? null })),
    speakerName: holder.name
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: holder }),
    content,
    flags: { "azeroth-rpg": { kind, targets, damageByTarget, damageType: type, notAttack: true } }
  });
}

/**
 * **IGNITE** (04: *When your Fire damage reduces a target's Health, it takes 1
 * further Fire damage per rank at the start of its next turn*; D-775): the tick
 * laid on the creature struck, by the mage's hand, through the one door a hand's
 * tick takes (`effects/ticks.mjs#layTickBy`: here where this client owns the
 * creature, through the GM's client otherwise). Ignite's own landing lays none
 * (MY READING, for the lead), and a creature the blow killed burns no more.
 *
 * @param {{attacker: Actor|null, target: Actor, type: string|null, dealt: number, fromIgnite?: boolean}} o
 */
async function igniteFrom({ attacker, target, type, dealt, fromIgnite = false }) {
  if (!attacker || typeof attacker.takenTalents !== "function") return;
  const row = igniteFor(attacker.takenTalents());
  if (!ignites({ row, type, dealt, fromIgnite })) return;
  if (target.type === "npc" && (target.system?.health?.value ?? 0) <= 0) return;
  const laid = await layTickBy({ victim: target, tick: igniteTick(row, { source: attacker.uuid }) });
  if (laid?.landed) ui.notifications?.info(game.i18n.format("AZEROTH.Ignite.Laid", { name: target.name, n: row.amount, talent: row.name }));
  else if (laid?.reason === "noClock") ui.notifications?.info(game.i18n.format("AZEROTH.Tick.NoClockOn", { spell: row.name, name: target.name }));
}

/**
 * **SIPHON'S RECORD** (04: *if any target lost Health to Shadow or Fel damage from
 * you since the start of your last turn, you restore Health equal to the highest
 * amount a single target lost*; D-775): the highest single loss, on the warlock's
 * own flag, in the fight; `AzerothCombat#_talentTicks` heals off it at the turn's
 * start and clears it. Written where this client may write the warlock, as Killing
 * Blow's Rage is; out of a fight there is no turn start to heal at.
 *
 * @param {{attacker: Actor|null, type: string|null, dealt: number}} o
 */
async function siphonMark({ attacker, type, dealt }) {
  if (!attacker?.isOwner || !(dealt > 0) || typeof attacker.takenTalents !== "function") return;
  const row = siphonFor(attacker.takenTalents());
  if (!row || !row.types.includes(type)) return;
  const fight = attacker.activeFight?.() ?? null;
  if (!fight) return;
  const held = attacker.getFlag("azeroth-rpg", SIPHON_FLAG) ?? null;
  const next = siphonRecord(held, { fight: fight.id, dealt });
  if (held?.combat === next.combat && Number(held?.highest) === next.highest) return;
  await attacker.setFlag("azeroth-rpg", SIPHON_FLAG, next);
}

/**
 * **WHAT A DEATH UNDER A HELD SPELL RETURNS** (07's Drain Soul: *If it dies while
 * you are holding the spell you regain 3 Mana*; 04's Drain Soul's rank, Soul
 * Reaper's *when the target dies you restore Health equal to twice your tier*, and
 * Haunt's *you restore Health equal to your tier when the target dies*; D-775):
 * every character holding Drain Soul or Soul Reaper ON the creature that fell (the
 * Sustain's recorded targets, D-724), and every warlock whose Haunt rides one of
 * its ticks. Written where this client may write the caster, as Killing Blow's
 * Rage is; the words say what landed.
 *
 * @param {{target: Actor}} o
 */
async function deathRewards({ target }) {
  const token = target.getActiveTokens?.(true)?.[0] ?? null;
  const fallen = { tokenId: token?.id ?? null, actorId: target.id ?? null };
  const held = ["drain-soul", "soul-reaper"];
  for (const caster of game.actors ?? []) {
    if (caster.type !== "character" || !caster.isOwner) continue;
    for (const entry of caster.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
      if (!held.includes(entry?.identifier) || !heldOn(entry, fallen)) continue;
      const due = deathRewardsFor(caster.takenTalents?.() ?? [], { spell: entry.name ?? "", tier: caster.system?.tier ?? 1 });
      await giveBack(caster, { mana: due.mana, heal: due.heal, source: entry.name ?? "", fallen: target.name });
    }
  }
  for (const { by, heal } of hauntHeals(activeTicks(target))) {
    const caster = actorAt(by);
    if (!caster?.isOwner) continue;
    await giveBack(caster, { mana: 0, heal, source: game.i18n.localize("AZEROTH.Haunt.Label"), fallen: target.name });
  }
}

/** Mana into the caster's Mana pool and Health through the one healing door, said in words. */
async function giveBack(caster, { mana = 0, heal = 0, source = "", fallen = "" } = {}) {
  if (mana > 0) {
    const pool = manaPool(caster.poolSnapshot?.() ?? []);
    const value = pool ? Math.min(pool.max, pool.value + mana) : null;
    if (pool && value > pool.value) {
      await caster.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
      ui.notifications?.info(game.i18n.format("AZEROTH.Death.Mana", { name: caster.name, n: value - pool.value, source, fallen }));
    }
  }
  if (heal > 0) {
    const before = caster.system?.health?.value ?? 0;
    await caster.applyHealing(heal, { from: caster });
    ui.notifications?.info(game.i18n.format("AZEROTH.Death.Heal", { name: caster.name, n: Math.max(0, (caster.system?.health?.value ?? before) - before), source, fallen }));
  }
}
