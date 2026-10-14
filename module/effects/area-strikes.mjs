/**
 * WHAT AN AREA DOES TO A CREATURE, WHERE IT TOUCHES THE BOARD (D-756, D-757).
 * `rules/area-ticks.mjs` is the law; this is the reading of the creature and
 * its caster, the writes, and the cards.
 *
 * - **`strikeFromArea`** is the ONE door an area's damage and healing land
 *   through: the start-of-turn tick (`AzerothCombat#_areaTicks`), the damage on
 *   entering, and a failed Test's damage. Damage goes through `resolveDamage`
 *   at SL 0 - Ward, Immune, Vulnerable and an ally's aura after the Ward
 *   (D-755) - with what the caster STANDS on added (`standingSpellBonus`), then
 *   `applyDamage` as a blow of that type and never as an ATTACK (the review,
 *   S1). Healing goes through `applyHealing` from the caster, as a spell's.
 * - **`postAreaTest`** posts the creature's Resist card, and the SPELL CARD's
 *   own door rolls it (`dice/chat.mjs#resistTestFromCard`, purpose `area`):
 *   one door for a Resilience Test a spell forces, never a second.
 * - **`areaTestOutcome`** is what that door lands: the failure's damage and
 *   conditions, each with its span, a Bane, a lost turn - and The Deep's
 *   success.
 * - **`enterAreas`** is the active GM's reading of a move: damage and Tests on
 *   ENTERING, detected off the movement operation's own path through core's
 *   `TokenDocument#segmentizeRegionMovementPath` (14.367, token.mjs:3614) -
 *   never the interpolated document position (D-669).
 */

import { AZEROTH } from "../config.mjs";
import {
  areaLapsed, checkOutcome, checksFor, enterFor, hasAreaTick, relationOf, tickFor
} from "../rules/area-ticks.mjs";
import { creatureSnapshot, kindsOf } from "../rules/creature-kinds.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { standingSpellBonus, typedLaneExtras } from "../rules/spell-bonus.mjs";
import { spellDamageFor } from "../rules/talent-effects.mjs";
// 04's Burning Soul (D-775): an immunity a spell reads as Ward.
import { immuneAsWardFor, immuneReadAsWard, retaliationsFor } from "../rules/class-talents.mjs";
// A creature moving, as against a token put somewhere (the final review of D-757).
import { creatureMoved } from "../rules/movement.mjs";
import { allyStandingOf, combatantIn } from "../canvas/engaged.mjs";
import {
  LEAVES_FLAG, actorOf, areaRecord, casterTokenOn, claimEntry, isDown, isWriter, staleIn, sweepLeavers, worldClock
} from "../canvas/sustained-areas.mjs";
import { arrived } from "../canvas/arrival.mjs";
// Whether a creature and its area are still in the world when a deferred
// strike lands (the full-suite fix of D-757).
import { actorInWorld, regionInWorld, sceneInWorld, tokenInWorld } from "../canvas/in-world.mjs";
import { applyCondition } from "./durations.mjs";
import { layBane } from "./banes.mjs";
// THE CROSS-CLASS RULINGS (D-778): Tempest's push on entering, the escape a Test's
// Entangled carries (Rimebind, Thornguard), Permafrost's feet on a Slowed it lays.
import { forcedCheck } from "../rules/area-ticks.mjs";
import { cleanForced } from "../rules/forced-movement.mjs";
import { forceMove, forcedWords, regionCentreOf } from "./forced-movement.mjs";
import { ESCAPE_FLAG, cleanEscape } from "../rules/escapes.mjs";
import { addSlowedFeet } from "./speed-drop.mjs";

const SCOPE = "azeroth-rpg";

/**
 * The hook fired on the active GM's client once a move's entering has been
 * judged, with the token and how many areas it entered: what the live batch
 * waits on rather than on a guess at a delay (the final review of D-757).
 */
export const AREAS_ENTERED_HOOK = "azerothAreasEntered";

/** The kinds a creature is (D-753): undead, fel, a demon. */
export function kindsOfActor(actor) {
  return kindsOf(creatureSnapshot({ type: actor?.type ?? null, system: actor?.system ?? null, race: actor?.raceItem?.name ?? null }));
}

/**
 * **WHO A CREATURE IS TO AN AREA'S CASTER**, in the fight either of them is in
 * or out of one (`rules/area-ticks.mjs#relationOf`, over `allyStandingOf`).
 *
 * @param {{caster: Actor|null, casterToken?: TokenDocument|null, actor: Actor, token?: TokenDocument|null, fight?: Combat|null}} o
 * @returns {"self"|"ally"|"enemy"|"other"}
 */
export function relationTo({ caster = null, casterToken = null, actor, token = null, fight = null } = {}) {
  const f = fight ?? actor?.activeFight?.() ?? caster?.activeFight?.() ?? null;
  const victim = allyStandingOf({ token, actor, combatant: combatantIn(f, actor, token), fight: f });
  const standing = allyStandingOf({ token: casterToken, actor: caster, combatant: combatantIn(f, caster, casterToken), fight: f });
  return relationOf(standing, victim);
}

/**
 * **WHAT AN AREA'S DAMAGE COMES TO ON ONE CREATURE**, written nowhere: the
 * entry's Rating with what the caster STANDS on added (`standingSpellBonus`,
 * read now), through `resolveDamage` at SL 0 - Ward, Immune, Vulnerable and an
 * ally's aura after the Ward (D-755). `strikeFromArea` lands it; Immolation's
 * retaliation prints it on the attacker's card (`applications/actions.mjs`).
 *
 * @param {{actor: Actor, caster?: Actor|null, spell?: {name?: string, school?: string|null,
 *   takesSpellpower?: boolean}, damage: {rating: number, school: string|null}}} o
 * @returns {ReturnType<typeof resolveDamage>}
 */
export function areaDamageOn({ actor, caster = null, spell = {}, damage } = {}) {
  const spellName = spell?.name ?? "";
  const school = damage?.school ?? null;
  const talentRows = caster?.takenTalents ? spellDamageFor(caster.takenTalents(), { name: spellName, school: spell?.school ?? null }) : [];
  const bonus = caster
    ? standingSpellBonus(caster.system, { name: spellName, damageSchool: school, takesSpellpower: spell?.takesSpellpower === true }, talentRows).total
    : 0;
  const s = actor?.system ?? {};
  // **THE WARD THE CASTER'S SPELLS IGNORE** (04's Celestial Alignment: *while it
  // runs your Arcane and Nature spells ignore 2 Ward*; D-771), off the spell's
  // own school, read the same way the cast reads it.
  const pierce = Math.max(0, Math.trunc(Number(caster?.spellWardPierce?.(spell?.school ?? null)) || 0));
  // **AN IMMUNITY A SPELL READS AS WARD** (04's Burning Soul: *Your Fire spells
  // treat Immune (Fire) as Ward 3 instead*; D-775), on a SPELL's area or tick alone
  // - Ignite's and a feature's are no spell - as the cast reads it.
  const asWard = spellBlowOf(spell) && caster?.takenTalents ? immuneAsWardFor(caster.takenTalents(), { school }).ward : 0;
  const read = immuneReadAsWard({ immune: s.immune ?? [], ward: Math.max(0, (wardBySchool(s.ward)[school] ?? 0) - pierce), school, asWard });
  // **WHAT THE CASTER ADDS TO EVERY SPELL AS ITS OWN TYPE** (04's Arcane Power;
  // D-777, the lead: *"Different damage types in one attack are possible"*): a
  // SPELL's tick carries it as the cast does, a second amount met by its own Ward;
  // a feature's tick and Ignite's are no spell and carry none.
  const typed = caster && spellBlowOf(spell) ? typedLaneExtras(caster.system, "spell") : [];
  return resolveDamage({
    rating: (Number(damage?.rating) || 0) + bonus, sl: 0, kind: "magical", school,
    ward: read.ward,
    schoolArmor: schoolArmorBySchool(s.schoolArmor)[school] ?? 0,
    immune: read.immune, vulnerable: s.vulnerable ?? [],
    slAddsToDamage: false,
    extras: typed, wardBySchool: wardBySchool(s.ward), schoolArmorBySchool: schoolArmorBySchool(s.schoolArmor)
  });
}

/**
 * **WHETHER AN AREA'S OR A TICK'S BLOW IS A SPELL'S** (D-775): a laid tick says so
 * (`isSpell`, off the spell that stamped it), a Region placed from a FEATURE's card
 * says it is a feature's, and anything else an area carries is its spell's.
 * 04's Shadowburn and Burning Soul read it.
 *
 * @param {{isSpell?: boolean, feature?: boolean, ignite?: boolean}|null} spell
 */
export function spellBlowOf(spell = {}) {
  if (typeof spell?.isSpell === "boolean") return spell.isSpell;
  return spell?.feature !== true && spell?.ignite !== true;
}

/**
 * **LAND AN AREA'S DAMAGE AND HEALING ON ONE CREATURE** - the tick, an entry, a
 * failed Test (D-756, D-757). Damage lands before healing where both do (the
 * review, S5); a creature a blow has just put at 0 is not stood up (14).
 *
 * @param {{actor: Actor, caster?: Actor|null, spell?: {name?: string, school?: string|null,
 *   takesSpellpower?: boolean}, damage?: {rating: number, school: string|null}|null, heal?: number|null}} o
 * @returns {Promise<string[]>} the lines for the card
 */
export async function strikeFromArea({ actor, caster = null, spell = {}, damage = null, heal = null } = {}) {
  const lines = [];
  // Every caller strikes AFTER something it awaited - a turn's update, a move's
  // claim, a Resist's roll - and a creature whose token or scene went in the
  // meantime takes nothing: the server refuses a write into a deleted scene
  // however the promise is caught (the full-suite fix of D-757).
  if (!actor || !actorInWorld(actor)) return lines;
  const spellName = spell?.name ?? "";
  if (damage) {
    const school = damage.school ?? null;
    const result = areaDamageOn({ actor, caster, spell, damage });
    const type = game.i18n.localize(AZEROTH.schools[school] ?? school ?? "");
    if (result.immune) {
      lines.push(game.i18n.format("AZEROTH.Combat.AreaTickImmune", { name: actor.name, type, spell: spellName }));
    } else {
      // A Ward that takes it all leaves nothing to land: no Rage, no
      // was-struck mark, and the line still says the 0. The ground is not
      // an attack (S1): `attack: false` keeps a one-attack mark standing.
      // `by` is the caster: Killing Blow, a Paladin's Zeal and the caster's
      // damaged mark run inside the damage door for a tick as for a card's
      // Apply (D-768), where they used to reach only the card.
      // What a Ward took off it travels with it (04's Atonement and Absorption at
      // the one damage door, D-774): a tick a priest's Ward answers is a blow too.
      // And whether a SPELL struck it, and whether it is Ignite's own tick (D-775):
      // Shadowburn and Ruin read the first, Ignite the second.
      if (result.damage > 0 && actorInWorld(actor)) {
        await actor.applyDamage(result.damage, {
          struck: true, attack: false, location: "body", type: school, by: caster, wardTook: result.wardTook ?? 0,
          spell: spellBlowOf(spell), ignite: spell?.ignite === true,
          // Each second amount of its own type (D-777), already in the damage.
          parts: result.parts ?? null
        });
      }
      lines.push(game.i18n.format(result.vulnerable ? "AZEROTH.Combat.AreaTickVulnerable" : "AZEROTH.Combat.AreaTick",
        { name: actor.name, amount: result.damage, type, spell: spellName }));
    }
  }
  if (heal !== null && heal !== undefined) {
    const health = actor.system?.health ?? { value: 0, max: 0 };
    // Read AFTER the damage above (S5): a creature that damage has just
    // put at 0 is down and is not stood up (14), and nobody at full has room.
    const down = actor.type === "npc" && (health.value ?? 0) <= 0;
    if (!down && (health.value ?? 0) < (health.max ?? 0) && actorInWorld(actor)) {
      // A Signature naming the spell restores more (08 §20, D-698), as the cast's does.
      // A class feature's tick (D-771) is no spell: it takes neither, and heals
      // as a feature, which is what 04's Gift of Nature reads.
      const feature = spell?.feature === true;
      const more = feature ? 0 : Math.max(0, Math.trunc(Number(caster?.system?.signatureEffects?.empowers?.[spellName]?.heal) || 0));
      const before = health.value ?? 0;
      // A tick's Divine Aegis schools and Miracle's unreduced heal ride to the door (D-779).
      await actor.applyHealing(heal + more, { from: caster ?? null, spell: !feature, feature, aegis: spell?.aegis ?? null, unreduced: spell?.unreduced === true });
      const healed = (actor.system?.health?.value ?? before) - before;
      if (healed > 0) lines.push(game.i18n.format("AZEROTH.Combat.AreaTickHeal", { name: actor.name, amount: healed, spell: spellName }));
    }
  }
  return lines;
}

/**
 * **IMMOLATION'S OTHER HALF** (07, D-757): *A creature that starts its turn
 * within 5 feet of you, or that hits you with a melee attack, takes 2 Fire
 * damage.* The start of the turn is the tick's (`AzerothCombat#_areaTicks`);
 * this is the blow. While the holder's Sustain is held, a creature striking
 * them is answered in the whenStruck row's shape (08 §20, D-692) - on the
 * ATTACKER's card, on a hit, and only a melee one (`melee`, which the roll
 * reads once the way the blow is struck is final) - with the damage the tick
 * would deal it, worked out now against the attacker's own Ward.
 *
 * @param {Actor} holder  the creature being struck
 * @param {Actor|null} attacker
 * @returns {Array<{name: string, text: string, melee: true,
 *   damage: {amount: number|null, type: string|null}, condition: object}>}
 */
export function retaliationRows(holder, attacker) {
  const out = [];
  if (!holder || !attacker || isDown(holder)) return out;
  for (const entry of holder.getFlag?.(SCOPE, "sustaining") ?? []) {
    const item = entry?.areaTick ? null : (holder.items?.get?.(entry?.spellId) ?? null);
    const tick = entry?.areaTick ?? item?.system?.areaTick ?? null;
    if (!hasAreaTick(tick) || tick.retaliate !== true) continue;
    const payload = tickFor(tick, { relation: relationTo({ caster: holder, actor: attacker }), kinds: kindsOfActor(attacker) });
    if (!payload?.damage) continue;
    const spell = entry.tickSpell ?? { name: entry.name ?? item?.name ?? "", school: item?.system?.school ?? null, takesSpellpower: item?.system?.takesSpellpower === true };
    const school = payload.damage.school ?? null;
    const result = areaDamageOn({ actor: attacker, caster: holder, spell, damage: payload.damage });
    out.push({
      name: spell.name ?? "",
      text: game.i18n.format(result.immune ? "AZEROTH.Card.AreaRetaliateImmune" : "AZEROTH.Card.AreaRetaliate", {
        spell: spell.name ?? "", name: holder.name, attacker: attacker.name,
        amount: result.damage, type: game.i18n.localize(AZEROTH.schools[school] ?? school ?? "")
      }),
      melee: true,
      damage: { amount: result.immune ? null : result.damage, type: school },
      condition: {}
    });
  }
  // **AND WHAT THE HOLDER'S TALENTS ANSWER WITH** (04's Molten Skin: *a creature that
  // hits you in melee takes Fire damage equal to your rank*; D-775), in the same
  // row's shape and on the same melee hit, worked out now against the attacker's
  // own Ward, Immune and Vulnerable. A talent's number, so no standing bonus of a
  // spell's rides it.
  for (const row of typeof holder.takenTalents === "function" ? retaliationsFor(holder.takenTalents()) : []) {
    const s = attacker.system ?? {};
    const result = resolveDamage({
      rating: row.amount, sl: 0, kind: "magical", school: row.type,
      ward: wardBySchool(s.ward)[row.type] ?? 0, schoolArmor: schoolArmorBySchool(s.schoolArmor)[row.type] ?? 0,
      immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false
    });
    out.push({
      name: row.name,
      text: game.i18n.format(result.immune ? "AZEROTH.Card.AreaRetaliateImmune" : "AZEROTH.Card.AreaRetaliate", {
        spell: row.name, name: holder.name, attacker: attacker.name,
        amount: result.damage, type: game.i18n.localize(AZEROTH.schools[row.type] ?? row.type ?? "")
      }),
      melee: row.melee === true,
      damage: { amount: result.immune ? null : result.damage, type: row.type },
      condition: {}
    });
  }
  return out;
}

/** Post the tick card's lines, in the tick's own shape. */
async function postLines(actor, lines) {
  if (!lines.length) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""),
    flags: { [SCOPE]: { kind: "tick" } }
  });
}

/** A condition list in words: *Deafened, Blinded and Slowed*. */
function conditionWords(ids) {
  return game.i18n.getListFormatter().format(ids.map(id => game.i18n.localize(AZEROTH.conditions?.[id] ?? id)));
}

/** A span in words, for the card. */
function untilWords(until, casterName) {
  if (!until) return "";
  return game.i18n.format(`AZEROTH.AreaTest.Until.${until}`, { caster: casterName ?? "" });
}

/**
 * What a failure (or The Deep's success) lands on THIS creature, in words: the
 * damage, the conditions with their spans, a Bane, a lost turn. Composed off
 * `checkOutcome` for this creature's own kinds, so Nether Collapse's card says
 * *Frightened* to a demon and *Stunned, Numbed, Entangled and Prone* to anything
 * else.
 */
function outcomeWords(outcome, casterName) {
  const parts = [];
  if (outcome.damage) {
    parts.push(game.i18n.format("AZEROTH.AreaTest.Damage", {
      rating: outcome.damage.rating, school: game.i18n.localize(AZEROTH.schools[outcome.damage.school] ?? outcome.damage.school ?? "")
    }));
  }
  const bySpan = new Map();
  for (const { id, until } of outcome.statuses) bySpan.set(until, [...(bySpan.get(until) ?? []), id]);
  for (const [until, ids] of bySpan) parts.push([conditionWords(ids), untilWords(until, casterName)].filter(Boolean).join(" "));
  if (outcome.bane) {
    const test = outcome.bane.kind === "all"
      ? game.i18n.localize("AZEROTH.Aura.BaneAll")
      : game.i18n.format("AZEROTH.Aura.BoonKind", { kind: game.i18n.localize(AZEROTH.testKinds[outcome.bane.kind] ?? outcome.bane.kind) });
    parts.push(game.i18n.format("AZEROTH.AreaTest.Bane", { test, until: untilWords(outcome.bane.until, casterName) }));
  }
  if (outcome.lose) parts.push(game.i18n.localize("AZEROTH.AreaTest.Lose"));
  // Tempest's push (D-778).
  if (outcome.forced) parts.push(game.i18n.format(outcome.forced.toward === "toward" ? "AZEROTH.AreaTest.Pulled" : "AZEROTH.AreaTest.Pushed", { feet: outcome.forced.feet }));
  return parts.join("; ");
}

/**
 * **POST A CREATURE'S RESIST CARD FOR AN AREA'S TEST** (D-757): at the start of
 * its turn in the area, or on entering it. The button is the spell card's own
 * `resistTest`, purpose `area`, naming the creature it belongs to, so its
 * owner and the GM see it and nobody else (`dice/chat.mjs`'s `data-resist-owner`
 * rule), at the caster's Spell DC as the card recorded it.
 *
 * @param {{actor: Actor, token?: TokenDocument|null, region: RegionDocument, check: object,
 *   trigger: "turn"|"enter", caster?: Actor|null}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function postAreaTest({ actor, token = null, region, check, trigger, caster = null } = {}) {
  if (!actor || !region || !check?.resilience) return null;
  const f = region.flags?.[SCOPE] ?? {};
  const spell = f.spell ?? { name: region.name };
  const dc = Number(f.dc) || null;
  const kinds = kindsOfActor(actor);
  const resilience = game.i18n.localize(AZEROTH.resiliences[check.resilience] ?? check.resilience);
  const failed = checkOutcome(check, { success: false, kinds });
  const fail = outcomeWords(failed, caster?.name ?? "");
  const pass = outcomeWords(checkOutcome(check, { success: true, kinds }), caster?.name ?? "");
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/azeroth-rpg/templates/chat/area-card.hbs", {
    title: spell.name ?? region.name,
    name: actor.name,
    text: game.i18n.format(trigger === "enter" ? "AZEROTH.AreaTest.Enter" : "AZEROTH.AreaTest.Turn", {
      name: actor.name, spell: spell.name ?? region.name, resilience, dc: dc ?? "—"
    }),
    fail: fail ? game.i18n.format("AZEROTH.AreaTest.OnFail", { outcome: fail }) : null,
    pass: pass ? game.i18n.format("AZEROTH.AreaTest.OnPass", { outcome: pass }) : null,
    testLabel: game.i18n.format("AZEROTH.Card.ResistTest", { resilience, dc: dc ?? "—" }),
    actorUuid: actor.uuid,
    resilience: check.resilience,
    dc,
    // The conditions this Test resists - what its failure lands on THIS
    // creature - so a Boon *against* one of them reaches it (07's Hallowed
    // Ground; `dice/chat.mjs#resistedBy`).
    against: failed.statuses.map(s => s.id).join(",")
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token ?? undefined }),
    content,
    flags: { [SCOPE]: {
      kind: "areaTest",
      area: {
        sceneId: region.parent?.id ?? null, regionId: region.id, cast: f.cast ?? null,
        caster: f.caster ?? null, source: f.source ?? null, spell, dc, trigger,
        check: foundry.utils.deepClone(check), actorUuid: actor.uuid,
        // The creature's own token, which the Test's link back to this card
        // names (the final review of D-757: a Test is made once, and recorded).
        tokenId: token?.id ?? null,
        // What a condition the failure lays carries (D-778): the escape 07 gives a
        // held creature (Rimebind, Thornguard) and the caster's Permafrost on a Slowed.
        escape: cleanEscape(f.escape ?? null),
        slowing: Number(f.slowing?.feet) > 0 ? { feet: Math.trunc(Number(f.slowing.feet)), source: String(f.slowing.source ?? "") } : null
      }
    } }
  });
}

/**
 * The span the CASTER's next turn start gives a condition (Starweave's *until
 * the start of your next turn*): v14's `turnStart` expiry keyed on the caster's
 * own combatant (D-628's rule, the other creature's turn), or null out of a
 * fight, where it holds until it is taken off.
 */
function casterTurnStart(caster, fight) {
  if (!caster || !fight?.started) return null;
  const combatant = fight.getCombatantsByActor?.(caster)?.[0] ?? null;
  if (!combatant) return null;
  return {
    duration: { value: 1, units: "turns", expiry: "turnStart" },
    start: { combat: fight.id, combatant: combatant.id, round: fight.round, turn: fight.turn, time: game.time.worldTime }
  };
}

/**
 * One condition a Test landed, with its span: A1's own **Ends** (no clock), the
 * end of its next turn, the start of the caster's next, or *until it leaves* -
 * the area named on the effect, which the leavers' sweep reads
 * (`canvas/sustained-areas.mjs#sweepLeavers`). A condition the creature
 * already carried stands on its own and is not given the area's span.
 */
async function landCondition(actor, id, until, area, caster) {
  if (!AZEROTH.conditions?.[id]) return null;
  const had = actor.statuses?.has?.(id) === true;
  const fight = actor.activeFight?.() ?? null;
  const timing = until === "endOfNextTurn" ? "endOfNextTurn" : until === "casterTurnStart" ? casterTurnStart(caster, fight) : null;
  const effect = await applyCondition(actor, id, { until: timing });
  if (effect && until === "leaves" && !had) {
    await effect.setFlag(SCOPE, LEAVES_FLAG, { sceneId: area.sceneId ?? null, regionId: area.regionId ?? null });
  }
  // **THE TEST 07 GIVES A HELD CREATURE** (Rimebind's and Thornguard's *it may repeat
  // the Test at the end of each of its turns*; D-778, O-159): the escape the area's
  // cast recorded rides the Entangled it lands, for the prompt at the end of each of
  // the creature's turns (`AzerothCombat#_escapePrompts`).
  const escape = cleanEscape(area?.escape ?? null);
  if (effect && escape?.condition === id) await effect.setFlag(SCOPE, ESCAPE_FLAG, escape);
  // 04's Permafrost on a Slowed the caster's area lays (D-778, O-165).
  if (effect && id === "slowed" && Number(area?.slowing?.feet) > 0) await addSlowedFeet(effect, area.slowing);
  return effect;
}

/**
 * **WHAT AN AREA'S TEST LANDS** (D-757), from the spell card's own Resist door
 * (`dice/chat.mjs#resistTestFromCard`, purpose `area`): the outcome of the
 * check the card carries, for this creature's kinds, written by whoever pressed
 * the button - the creature's owner or the GM. Each part is said in a line.
 * **Landed once**: the door records the Test on the card first
 * (`dice/annotate.mjs#recordAreaTest`) and calls this only where that record
 * was written (the final review of D-757).
 *
 * @param {{actor: Actor, message: ChatMessage, result: ChatMessage|null}} o
 * @returns {Promise<object|null>}  the outcome landed
 */
export async function areaTestOutcome({ actor, message, result } = {}) {
  const area = message?.flags?.[SCOPE]?.area ?? null;
  if (!actor || !area?.check || !result) return null;
  const success = result.rolls?.[0]?.outcome?.success === true;
  const outcome = checkOutcome(area.check, { success, kinds: kindsOfActor(actor) });
  const caster = actorOf(area.caster);
  const spellName = area.spell?.name ?? "";
  const lines = [];
  if (outcome.damage) lines.push(...await strikeFromArea({ actor, caster, spell: area.spell ?? {}, damage: outcome.damage }));
  const landed = [];
  for (const { id, until } of outcome.statuses) {
    if (await landCondition(actor, id, until, area, caster)) landed.push(id);
  }
  if (landed.length) lines.push(game.i18n.format("AZEROTH.AreaTest.Landed", { name: actor.name, conditions: conditionWords(landed), spell: spellName }));
  if (outcome.bane) {
    // A Bane on this kind of Test UNTIL the end of its next turn - lasting,
    // never spent by the next roll (`rules/banes.mjs`' `lasting`).
    const laid = await layBane({ victim: actor, kind: outcome.bane.kind, banes: 1, source: spellName, by: caster, lasting: true });
    if (laid) lines.push(game.i18n.format("AZEROTH.AreaTest.BaneLaid", { name: actor.name, spell: spellName }));
  }
  if (outcome.lose) {
    const fight = actor.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
    if (combatant) {
      // Through the combatant's own door, queued with every other write to its
      // budget on this client (D-761), rather than a read-and-write beside them.
      await combatant.loseTurn();
      lines.push(game.i18n.format("AZEROTH.AreaTest.Lost", { name: actor.name, spell: spellName }));
    }
  }
  // **THE FORCED MOVE A FAILURE MAKES** (07's Tempest: *is pushed 10 feet toward the
  // edge*; D-778, the lead on O-158: *"Yes."*): away from the area's own centre,
  // through the one door - the creature's token on the area's scene, here, on the
  // client that rolled the Test (the creature's owner, or the GM).
  if (outcome.forced) {
    const scene = game.scenes?.get(area.sceneId ?? "") ?? null;
    const region = scene?.regions?.get?.(area.regionId ?? "") ?? null;
    const token = (area.tokenId ? scene?.tokens?.get(area.tokenId) : null) ?? actor.getActiveTokens?.(false, true)?.find(t => t.parent?.id === scene?.id) ?? null;
    const r = await forceMove({ token, from: region ? regionCentreOf(region) : null, feet: outcome.forced.feet, toward: outcome.forced.toward, by: caster, name: actor.name });
    lines.push(forcedWords(r, { toward: outcome.forced.toward, source: spellName }));
  }
  await postLines(actor, lines);
  return outcome;
}

/** The fight a move on this scene is judged in: the mover's own, else the scene's started one. */
function fightOn(scene, actor) {
  const own = actor?.activeFight?.() ?? null;
  if (own?.started) return own;
  return (game.combats ?? []).find(c => c.started && c.scene?.id === scene?.id) ?? null;
}

/**
 * **WHAT ENTERING AN AREA DOES** (D-757), on the active GM's client, off the
 * move itself: every placed area on the scene whose descriptor strikes or
 * Tests a creature ENTERING it, entered on this move's own path - core's
 * `segmentizeRegionMovementPath` over the origin and the passed waypoints
 * (14.367), which is exact where the document's position is interpolated.
 *
 * - **Damage on entering** (Rain of Fire, Wall of Flame, Doomfall, Starfall:
 *   *the first time it enters the area on a turn*; Flamestrike and Rain of
 *   Chaos: every entry for a round after the cast) - the area remembers, per
 *   creature, the turn it last entered on (`firstEntry`).
 * - **A Test on entering** (Frozen Ground, Hailstorm, Thornguard, Entangling
 *   Vines, Rimebind) - the mover's Resist card.
 *
 * **Only in a started fight.** *On a turn* is a fight's word, and an area's
 * start-of-turn tick has no clock outside one either (the implementer's
 * reading, D-757). An area that no longer stands strikes nobody.
 *
 * **Once per cast on a move** (the final review of D-757): two Regions carrying
 * one cast - a card placed twice before its door refused that, or a Region
 * copied by hand - are one area to the creature entering them, as the tick
 * already reads them (`AzerothCombat`'s `tickSources`). **And the first entry
 * on a turn is claimed inside the one queue** (`claimEntry`), so two moves
 * judged at once cannot both strike.
 *
 * **Nothing is entered by a token PUT somewhere** (`rules/movement.mjs
 * #creatureMoved`): an undo, a paste, and a path displaced from end to end - a
 * GM's reposition from the token's sheet, a teleport Region's - are not a
 * creature moving, which is core's own reading for its Regions (14.367,
 * `teleport-token.mjs`: *Displacement does not trigger teleportation*). A
 * blink, a creature's own teleport, still enters.
 *
 * @param {TokenDocument} document
 * @param {object} movement  the TokenMovementOperation
 * @param {object} [operation]  the update operation `moveToken` hands over
 * @returns {Promise<number>} how many areas the move entered
 */
export async function enterAreas(document, movement, operation = {}) {
  if (!isWriter() || !creatureMoved(movement, operation)) return 0;
  const scene = document?.parent ?? null;
  const actor = document?.actor ?? null;
  if (!scene?.regions || !actor || !movement?.passed?.waypoints?.length || !sceneInWorld(scene)) return 0;
  const fight = fightOn(scene, actor);
  if (!fight?.started) return 0;
  if (fight.combatants.some(c => c.tokenId === document.id && c.isDefeated)) return 0;
  const path = [movement.origin, ...movement.passed.waypoints];
  const now = worldClock();
  const turnKey = `${fight.id}.${fight.round}.${fight.turn}`;
  const ENTER = CONST.REGION_MOVEMENT_SEGMENTS.ENTER;
  const seen = new Set();
  let entered = 0;
  for (const region of scene.regions) {
    const f = region.flags?.[SCOPE] ?? {};
    const tick = f.areaTick;
    if (!f.cast || !hasAreaTick(tick)) continue;
    if (seen.has(f.cast)) continue;
    const striking = tick.enter?.rating !== null && tick.enter?.rating !== undefined;
    const testing = (tick.checks ?? []).some(c => c.on !== "turn");
    // Tempest's Test on entering, whose only outcome is the push (D-778).
    const pushing = forcedCheck(cleanForced(f.forced ?? null));
    if (!striking && !testing && !pushing) continue;
    const row = areaRecord(region);
    if (row && staleIn(scene, [row], now).length) continue;
    let segments = [];
    try {
      segments = document.segmentizeRegionMovementPath(region, path);
    } catch {
      segments = [];
    }
    if (!segments.some(s => s.type === ENTER)) continue;
    seen.add(f.cast);
    entered++;
    const caster = actorOf(f.caster);
    const casterToken = casterTokenOn(scene, f.source ?? null, caster);
    const relation = relationTo({ caster, casterToken, actor, token: document, fight });
    if (striking) {
      const damage = enterFor(tick, { relation, sl: f.sl ?? null });
      const inSpan = !(Number(tick.enter.rounds) > 0) || !areaLapsed({ lasts: { rounds: tick.enter.rounds }, placedAt: f.placedAt ?? null }, now);
      // *The first time it enters the area on a turn*: claimed in the queue,
      // read and written as one (`sustained-areas.mjs#claimEntry`).
      const first = damage && inSpan && tick.enter.once ? await claimEntry(region, document.id, turnKey) : true;
      // The claim waited in the queue: the mover and the area are asked again
      // (the full-suite fix of D-757), as `strikeFromArea` asks of the creature.
      if (damage && inSpan && first && !isDown(actor) && tokenInWorld(document) && regionInWorld(region)) {
        await postLines(actor, await strikeFromArea({ actor, caster, spell: f.spell ?? {}, damage }));
      }
    }
    for (const check of checksFor(tick, "enter", { relation })) {
      if (tokenInWorld(document) && regionInWorld(region)) await postAreaTest({ actor, token: document, region, check, trigger: "enter", caster });
    }
    // **TEMPEST'S PUSH** (*one that fails a Reflex Resilience Test against your Spell
    // DC when it first enters is pushed 10 feet toward the edge*; D-778): its Test,
    // posted the FIRST time this creature enters this cast's area - claimed in the
    // one queue as Rain of Fire's first entry is, keyed on no turn - and its failure
    // the push, landed by the card's own door (`areaTestOutcome`). A creature its own
    // push carried out is not entering when it next walks in: it entered once.
    if (pushing && !(tick.excludesCaster === true && relation === "self")) {
      const first = await claimEntry(region, document.id, "firstEntry");
      if (first && !isDown(actor) && tokenInWorld(document) && regionInWorld(region)) {
        await postAreaTest({ actor, token: document, region, check: pushing, trigger: "enter", caster });
      }
    }
  }
  return entered;
}

/**
 * The hooks, registered at `init`, each acting on the active GM's client alone.
 *
 * - **`moveToken`**: what entering an area does, off the move's own path; and
 *   once the token has ARRIVED (`canvas/arrival.mjs`, the one wait), the
 *   conditions it held *until it leaves* and the riders armed on it are judged
 *   against where it now stands - an undo and a paste included, since they
 *   move a token out of an area as surely as a walk does.
 * - **`deleteRegion`** / **`updateRegion`**: an area that goes or grows takes
 *   its *until it leaves* with it, or keeps it on who is still inside.
 */
export function registerAreaStrikeHooks() {
  Hooks.on("moveToken", (document, movement, operation) => {
    if (!isWriter()) return;
    enterAreas(document, movement, operation)
      .then(entered => Hooks.callAll(AREAS_ENTERED_HOOK, document, entered))
      .catch(err => console.warn("azeroth-rpg | an area entry did not finish", err));
    arrived(document, movement).then(() => sweepLeavers({ scenes: [document.parent] })).catch(() => 0);
  });
  Hooks.on("deleteRegion", region => {
    if (!isWriter() || !region?.parent) return;
    sweepLeavers({ scenes: [region.parent] }).catch(() => 0);
  });
  Hooks.on("updateRegion", (region, changes) => {
    if (!isWriter() || !region?.parent || !("shapes" in (changes ?? {}))) return;
    sweepLeavers({ scenes: [region.parent] }).catch(() => 0);
  });
}
