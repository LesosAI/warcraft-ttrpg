/**
 * **THE GRAFTS THAT FIRE ON THEIR OWN, ON THE BOARD** (the lead's Q7 of the 4b review, 2026-11-19:
 * *"auto"*; O-414 closed). The law is `rules/graft-riders.mjs`; this module is the doors.
 *
 * - **A hit asks** (`graftHitTests`, called by `workflows.rollTest` on a creature's hit): Meat Hook
 *   on the Chain hook row, Grasping Arms on a melee hit - a Test card for each creature the attack
 *   card records, at the Necromancer's Spell DC stamped at the raise.
 * - **A turn start asks** (`bladderTurnStart`, called by `AzerothCombat#_onStartTurn` on the active
 *   GM): Plague Bladder, for the creature starting its turn, from each grafted enemy within 5 feet.
 * - **A failure lands** (`graftTestLanded`, called by `dice/chat.mjs#rollResists` with purpose
 *   `graft`): the pull through the one forced-move door (D-778), Entangled with A1's escape, or
 *   Poisoned 1 with the Spell DC to shed it - through the one landing door - and a feature card from
 *   the grafted creature naming the creature reached, which the animation plays (`GRAFT_*_KEY`).
 *
 * A Test card is pressed by the creature's own owner (`data-resist-owner`) and is made once: the
 * press is claimed on the card (`claimCardPress`) before anything lands.
 */

import { AZEROTH } from "../config.mjs";
import { GRAFT_RIDERS, bladderAsks, graftDC, graftHitRiders, hookPullFeet } from "../rules/graft-riders.mjs";
import { GRAFT_ARMS_KEY, GRAFT_BLADDER_KEY, GRAFT_HOOK_KEY } from "../rules/necromancer-animations.mjs";
import { ESCAPE_FLAG, SHED_DC_FLAG, cleanEscape } from "../rules/escapes.mjs";
import { countsAsEnemy } from "../rules/distance.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);
const TEMPLATE = "systems/azeroth-rpg/templates/chat/graft-test.hbs";

/** The card flag a graft's Test rides (`{graft, creatureUuid, source, victimUuid, target, dc}`). */
export const GRAFT_TEST_FLAG = "graftTest";

/** Each graft's animation key. */
const CUE_KEY = Object.freeze({ meatHook: GRAFT_HOOK_KEY, graspingArms: GRAFT_ARMS_KEY, plagueBladder: GRAFT_BLADDER_KEY });

/** A document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

/** A token on the scene, as the cards record one. */
const refOf = token => (token ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null);

/** The grafted creature's grafts, its DC and its world actor. */
function graftsOf(actor) {
  const world = actor?.isToken ? (game.actors?.get(actor.id) ?? actor) : actor;
  const flags = world?.flags?.[SCOPE] ?? actor?.flags?.[SCOPE] ?? {};
  return {
    grafts: Array.isArray(flags.grafts) ? flags.grafts : [],
    dc: graftDC({ graftDC: flags.graftDC ?? null, abilities: actor?.system?.creatureAbilities ?? [] })
  };
}

/**
 * **POST ONE GRAFT'S TEST** for one creature: a card speaking for the creature that must make it,
 * its Resist row its owner's alone (`data-resist-owner`), what a failure lands said in words.
 */
export async function postGraftTest({ creature, creatureToken = null, victim, victimToken = null, rider, dc }) {
  if (!creature || !victim || !rider || !dc) return null;
  const resilience = game.i18n.localize(AZEROTH.resiliences?.[rider.resilience] ?? rider.resilience);
  const name = victimToken?.name ?? victim.name;
  const graftName = game.i18n.localize(`AZEROTH.Graft.${rider.graft}`);
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    title: graftName, name,
    text: t(`AZEROTH.GraftRider.Ask.${rider.graft}`, { name, creature: creatureToken?.name ?? creature.name, resilience, dc }),
    fail: t(`AZEROTH.GraftRider.OnFail.${rider.graft}`, { name, creature: creatureToken?.name ?? creature.name, dc }),
    testLabel: t("AZEROTH.Card.ResistTest", { resilience, dc }),
    actorUuid: victim.uuid, resilience: rider.resilience, dc,
    against: rider.condition ?? ""
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: victim, token: victimToken ?? undefined }),
    content,
    flags: { [SCOPE]: {
      kind: "graftTest",
      [GRAFT_TEST_FLAG]: {
        graft: rider.graft, creatureUuid: creature.uuid, source: refOf(creatureToken), victimUuid: victim.uuid,
        target: refOf(victimToken), dc
      }
    } }
  });
}

/**
 * **A GRAFTED CREATURE'S HIT ASKS** (Meat Hook, Grasping Arms): one Test card for each creature the
 * attack card records, for each graft this hit fires. The card's lines, in words.
 *
 * @param {{striker: Actor, targets: Array<{sceneId?: string, tokenId?: string, actorId?: string, name?: string}>, attackName?: string, rangeKind?: string|null}} o
 * @returns {Promise<string[]>}
 */
export async function graftHitTests({ striker, targets = [], attackName = "", rangeKind = null } = {}) {
  if (striker?.type !== "npc") return [];
  const strikerToken = striker.isToken && striker.token ? striker.token : (striker.getActiveTokens?.(false, true)?.[0] ?? null);
  // **04's PLAGUE CARRIER** (Phase 4c-T: *When one of your Plagued Ghouls or Abominations hits a living
  // creature, the creature makes a Body Resilience Test against your Spell DC*): a Test card for each
  // living creature the attack card records, at the Necromancer's Spell DC, beside any graft's.
  const lines = await plagueCarrierTests({ striker, strikerToken, targets });
  const { grafts, dc } = graftsOf(striker);
  const riders = graftHitRiders({ grafts, attackName, rangeKind });
  if (!riders.length || !dc) return lines;
  for (const rider of riders) {
    for (const ref of targets ?? []) {
      const token = ref?.sceneId && ref?.tokenId ? game.scenes.get(ref.sceneId)?.tokens?.get(ref.tokenId) ?? null : null;
      const victim = token?.actor ?? (ref?.actorId ? game.actors.get(ref.actorId) : null);
      if (!victim) continue;
      await postGraftTest({ creature: striker, creatureToken: strikerToken, victim, victimToken: token, rider, dc });
      lines.push(t(`AZEROTH.GraftRider.Asked.${rider.graft}`, { name: token?.name ?? victim.name, dc }));
    }
  }
  return lines;
}

/**
 * **PLAGUE CARRIER'S TEST CARDS** (Phase 4c-T): for a hit by one of a Necromancer's Plagued Ghouls or
 * Abominations whose owner holds Plague Carrier, one card per LIVING creature the attack card records -
 * the graft card's own shape, its Resist row the creature's owner's (`data-resist-owner`), at the
 * Necromancer's Spell DC - recording the owner and the rank the landing reads.
 */
async function plagueCarrierTests({ striker, strikerToken, targets = [] } = {}) {
  const { plagueCarrierOf, livingTarget } = await import("./necromancer-talents.mjs");
  const carrier = plagueCarrierOf(striker);
  if (!carrier) return [];
  const label = game.i18n.localize("AZEROTH.NecroTalent.Name.plague-carrier");
  const resilience = game.i18n.localize(AZEROTH.resiliences?.body ?? "body");
  const lines = [];
  for (const ref of targets ?? []) {
    const token = ref?.sceneId && ref?.tokenId ? game.scenes.get(ref.sceneId)?.tokens?.get(ref.tokenId) ?? null : null;
    const victim = token?.actor ?? (ref?.actorId ? game.actors.get(ref.actorId) : null);
    if (!victim || !livingTarget(victim)) continue;
    const name = token?.name ?? victim.name;
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      title: label, name,
      text: t("AZEROTH.NecroTalent.PlagueAsk", { name, creature: strikerToken?.name ?? striker.name, resilience, dc: carrier.dc }),
      fail: t("AZEROTH.NecroTalent.PlagueOnFail", { name, n: carrier.rank, dc: carrier.dc }),
      testLabel: t("AZEROTH.Card.ResistTest", { resilience, dc: carrier.dc }),
      actorUuid: victim.uuid, resilience: "body", dc: carrier.dc, against: ""
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: victim, token: token ?? undefined }),
      content,
      flags: { [SCOPE]: {
        kind: "graftTest",
        [GRAFT_TEST_FLAG]: {
          graft: "plagueCarrier", creatureUuid: striker.uuid, ownerUuid: carrier.owner.uuid, rank: carrier.rank,
          source: refOf(strikerToken), victimUuid: victim.uuid, target: refOf(token), dc: carrier.dc
        }
      } }
    });
    lines.push(t("AZEROTH.NecroTalent.PlagueAsked", { name, dc: carrier.dc }));
  }
  return lines;
}

/**
 * **PLAGUE BLADDER AT A TURN'S START** (the active GM's `_onStartTurn`): for the creature starting
 * its turn, every grafted creature carrying the bladder on its scene, standing, counting it as an
 * enemy (`countsAsEnemy`, D-669), within 5 feet footprint to footprint (D-732), asks its Test.
 *
 * @param {Combatant} combatant
 * @returns {Promise<number>}  the Tests posted
 */
export async function bladderTurnStart(combatant) {
  const token = combatant?.token ?? null;
  const actor = combatant?.actor ?? null;
  const scene = token?.parent ?? null;
  if (!token || !actor || !scene) return 0;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { standingOf, combatantIn } = await import("../canvas/engaged.mjs");
  const fight = combatant.combat ?? null;
  const roller = standingOf(token, combatant, fight);
  let n = 0;
  for (const other of scene.tokens ?? []) {
    if (other.id === token.id || other.actor?.type !== "npc") continue;
    const { grafts, dc } = graftsOf(other.actor);
    if (!grafts.includes("plagueBladder") || !dc) continue;
    const theirs = standingOf(other, combatantIn(fight, other.actor, other), fight);
    const asks = bladderAsks({
      grafts, standing: (other.actor.system?.health?.value ?? 0) > 0,
      enemy: countsAsEnemy(theirs, roller, { gm: true }), feet: feetApart(other, token)
    });
    if (!asks) continue;
    await postGraftTest({ creature: other.actor, creatureToken: other, victim: actor, victimToken: token, rider: GRAFT_RIDERS.plagueBladder, dc });
    n += 1;
  }
  return n;
}

/**
 * **WHAT A FAILED GRAFT TEST LANDS** (on the client that rolled it, which owns the creature): the
 * pull, the hold or the poison - and a feature card from the grafted creature naming the creature
 * reached. A pass lands nothing.
 *
 * @param {{actor: Actor, message: ChatMessage, passed: boolean}} o
 * @returns {Promise<string[]>}
 */
export async function graftTestLanded({ actor, message, passed } = {}) {
  const rec = message?.flags?.[SCOPE]?.[GRAFT_TEST_FLAG] ?? null;
  // 04's Plague Carrier (Phase 4c-T): the tick and, while the surge stands, Poisoned 1.
  if (rec?.graft === "plagueCarrier") {
    if (!actor || rec.victimUuid !== actor.uuid) return [];
    const victimToken = rec.target?.sceneId && rec.target?.tokenId ? game.scenes.get(rec.target.sceneId)?.tokens?.get(rec.target.tokenId) ?? null : (actor.isToken ? actor.token : null);
    const name = victimToken?.name ?? actor.name;
    if (passed) return [t("AZEROTH.GraftRider.Passed", { name, graft: game.i18n.localize("AZEROTH.NecroTalent.Name.plague-carrier") })];
    const owner = docAt(rec.ownerUuid);
    if (!owner) return [];
    const { plagueCarrierLanded } = await import("./necromancer-talents.mjs");
    return plagueCarrierLanded({ victim: actor, owner, rank: rec.rank, dc: rec.dc, name });
  }
  const rider = rec ? GRAFT_RIDERS[rec.graft] ?? null : null;
  if (!rider || !actor || rec.victimUuid !== actor.uuid) return [];
  const creature = docAt(rec.creatureUuid);
  const creatureToken = rec.source?.sceneId && rec.source?.tokenId ? game.scenes.get(rec.source.sceneId)?.tokens?.get(rec.source.tokenId) ?? null : null;
  const victimToken = rec.target?.sceneId && rec.target?.tokenId ? game.scenes.get(rec.target.sceneId)?.tokens?.get(rec.target.tokenId) ?? null : (actor.isToken ? actor.token : null);
  const name = victimToken?.name ?? actor.name;
  if (passed) return [t("AZEROTH.GraftRider.Passed", { name, graft: game.i18n.localize(`AZEROTH.Graft.${rider.graft}`) })];
  const lines = [];
  let landed = false;
  if (rider.pull) {
    // *Pulled to the nearest unoccupied space adjacent to the Abomination*: the gap less adjacency,
    // through the one forced-move door (D-778), which stops at a wall.
    const { feetApart } = await import("../canvas/footprints.mjs");
    const feet = creatureToken && victimToken && creatureToken.parent === victimToken.parent ? hookPullFeet(feetApart(creatureToken, victimToken)) : null;
    if (feet === null) lines.push(t("AZEROTH.GraftRider.Unmeasured", { name }));
    else if (feet > 0) {
      const { forceMove, forcedWords } = await import("./forced-movement.mjs");
      const r = await forceMove({ token: victimToken, from: creatureToken.getCenterPoint?.() ?? { x: creatureToken.x, y: creatureToken.y }, feet, toward: "toward", by: creature, name });
      landed = r.moved === true;
      lines.push(forcedWords(r, { toward: "toward", source: game.i18n.localize("AZEROTH.Graft.meatHook") }));
    } else {
      landed = true;
      lines.push(t("AZEROTH.GraftRider.AlreadyAdjacent", { name }));
    }
  } else if (rider.condition) {
    const { inflictCondition } = await import("./inflict.mjs");
    const { landedText } = await import("../helpers/rider-words.mjs");
    const marks = {};
    let until = null;
    if (rider.condition === "entangled") {
      // A1's Entangled: *An action and a Reflex Resilience Test at ... the DC the source names*,
      // and 04's *until the end of its next turn*.
      const escape = cleanEscape({ condition: "entangled", on: rider.escape.on, resilience: rider.escape.resilience, dc: rec.dc, banes: 0, talents: [], by: rec.creatureUuid, source: game.i18n.localize("AZEROTH.Graft.graspingArms") });
      if (escape) marks[ESCAPE_FLAG] = escape;
      const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
      until = untilEndOfNextTurnOrRound(actor);
    }
    if (rider.condition === "poisoned") marks[SHED_DC_FLAG] = { dc: rec.dc, source: game.i18n.localize("AZEROTH.Graft.plagueBladder") };
    const done = await inflictCondition({ victim: actor, id: rider.condition, value: rider.value ?? null, by: creature, name, until, marks });
    landed = done?.landed === true;
    lines.push(landedText(done));
  }
  if (landed && creature) {
    const { postFeatureCard } = await import("./necromancer-horde.mjs");
    await postFeatureCard(creature, {
      key: CUE_KEY[rider.graft], source: rec.source ?? null,
      text: t(`AZEROTH.GraftRider.Landed.${rider.graft}`, { name, creature: creatureToken?.name ?? creature.name }),
      targets: victimToken ? [{ actorId: actor.id, sceneId: victimToken.parent.id, tokenId: victimToken.id, name }] : []
    });
  }
  return lines;
}
