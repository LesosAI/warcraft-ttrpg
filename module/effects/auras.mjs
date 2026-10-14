/**
 * What stands on SOMEBODY ELSE, where it touches the canvas: 08 §20's Bulwark
 * of Tyr's Hand (D-696), and every aura a class feature or a talent lays
 * (D-755). `rules/auras.mjs` is the law; this is the reading of the holder,
 * the measurement, the write and the nudge.
 *
 * ## Two patterns, and this is a third of neither
 *
 * `effects/passives.mjs` measures the field for a creature's own passive and
 * writes NOTHING - it resets the actor and lets the model re-derive.
 * `effects/banes.mjs` writes an Active Effect onto another creature, flagged,
 * and does it through `CONFIG.queries` because a PLAYER presses the button that
 * lays it. This is the two halves together: it measures like the first and
 * writes like the second.
 *
 * **There is no query here, and that is the point.** Nobody presses anything -
 * an aura is derived state the world keeps, so ONE client keeps it, and that is
 * the active GM's, exactly as v14's combat lifecycle is active-GM-only (D-627).
 * A query would be a door nobody ever opens, which is the shape D-681 keeps
 * finding.
 *
 * ## Three sources, one door (D-755)
 *
 * `auraSourcesOf` reads every aura a creature HOLDS: a worn thing's Signature
 * (D-696), a class feature's stamped `system.aura` (02 §7's Aura of Resolve,
 * widened by Wide Aura), and a taken talent's row (Avenging Bulwark, Demonic
 * Pact, Tree of Life). `holderFacts` reads what their gates and numbers need -
 * a shield equipped, a spell's laid effect, the holder's own Body Armor Points -
 * and `rules/auras.mjs#ownerAuras` judges them. There is no second system: the
 * Bulwark of Tyr's Hand goes through the same pass as Aura of Resolve.
 *
 * ## Who, from where, and what happens with no token
 *
 * **Allies, the holder among them** (the lead, 2026-09-26, reversing
 * 2026-09-25's *allies, never the holder*): `countsAsAlly` over
 * `canvas/engaged.mjs#allyStandingOf` - in the holder's own fight the
 * tracker's side, out of one the Party and what it has bound - and the holder
 * is their own ally. D-696's own `party` aura keeps its roster, and its
 * *every OTHER member of your party* leaves its bearer out (`excludesHolder`).
 *
 * **Measured from the holder, or from their demon** (`centre`): Demonic Pact
 * is *within 20 feet of it*, so the warlock needs no token of their own, and
 * the owner of anything bound on the scene is read as a holder whether they
 * stand there or not.
 *
 * Core's `measurePath` between the nearest squares two tokens occupy, the way
 * every distance in this system is measured (D-669, D-732: never between the
 * centres, which let a big token's footprint push the aura away), and ONLY
 * through `canvas/footprints.mjs`. **A centre with no token reaches nobody and
 * its auras are lifted**, and so is an ally who has left. That is the OPPOSITE
 * of `passives.mjs`' ruling that a creature with no token keeps its passive,
 * and deliberately: a passive is the creature's own state, while an aura IS a
 * distance from a body. Somebody nobody has placed is standing nowhere.
 *
 * **The viewed scene only, and only what stands on it** (O-142, D-755's
 * review): a pass reads the canvas the active GM is looking at, as it always
 * has, and touches only the creatures with a token there - plus any that this
 * scene laid an aura on and that have since left it (`rules/auras.mjs
 * #auraLaidHere`, off the `scene` every laid effect names). A party standing on
 * another scene keeps what it was last laid while the GM looks at a prep map.
 *
 * ## Why it is diffed
 *
 * A token nudged one square must not delete and re-create an effect on every
 * ally in the room - the sheets would flicker and the log would fill. `diffAuras`
 * keeps an effect that still says the same thing, which is `syncBound`'s own
 * rule (D-643), and leaves one a GM has switched off exactly as it is.
 */

import { AZEROTH } from "../config.mjs";
import {
  AURA_FALLBACK_ICON, AURA_FLAG, AURA_ICONS, AURA_VERSION, auraChanges, auraGives, auraLaidHere, auraPayloadOf, auraPlan,
  diffAuras, excludesHolder, followUp, ownerAuras, payloadFromFlag, strongestPerGroup
} from "../rules/auras.mjs";
import { countsAsAlly } from "../rules/distance.mjs";
import { auraSpellGates, talentAuraOf, talentAurasFor } from "../rules/talent-effects.mjs";
import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";
import { allyStandingOf, combatantIn } from "../canvas/engaged.mjs";
// The ONE wait for a moving token to arrive (the final review of D-757).
import { arrived } from "../canvas/arrival.mjs";
import { bondOf, boundOf, worldActorOf } from "../documents/bound.mjs";
// What a placed area lays on a creature while it remains (D-757): the law, the
// metal Crucible asks after, the area's record and who stands to its caster.
import { hasAreaTick, riderPayload, ridersFor } from "../rules/area-ticks.mjs";
import { wearsMetal } from "../rules/armor.mjs";
import { meldsGear } from "../rules/shapes.mjs";
import { ARMED_FLAG, actorOf, areaRecord, casterTokenOn, staleIn, worldClock } from "../canvas/sustained-areas.mjs";
import { kindsOfActor, relationTo } from "./area-strikes.mjs";
// Whether a creature the pass writes to is still in the world (the full-suite fix of D-757).
import { actorInWorld, sceneInWorld } from "../canvas/in-world.mjs";

/** The pass in flight, and whether anything asked for another while it ran. */
let RUNNING = null;
let PENDING = false;

/**
 * How many follow-up passes have run in a row. An aura that reads its holder's
 * own Armor Points (Avenging Bulwark) changes when another aura's floor lands
 * on that holder (Tree of Life), and the pass that wrote the floor worked the
 * Bulwark out from the Armor Points before it. One more pass settles it;
 * `rules/auras.mjs#followUp` is the law, and its ceiling is what stops a fault
 * ever making it two thousand.
 */
let FOLLOWING = 0;

/** An item's or a talent's words, plain, for the effect's own description. */
function plain(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * EVERY AURA ONE CREATURE HOLDS, before any gate is judged (D-696, D-755),
 * each keyed by the holder AND the source, so a second pass finds the same
 * effect and leaves it alone.
 *
 * - **What is worn** keeps D-696's key and its own `group` - two Bulwarks of
 *   Tyr's Hand are two things worn and they stack. *Every other member of YOUR
 *   party* needs a party, so a creature that looted the plate off a corpse
 *   shields nobody.
 * - **A class feature's** is the stamp the sync wrote, Wide Aura's feet in it.
 * - **A talent's** is its row at the rank taken (`talentAurasFor`).
 *
 * The group of the last two is the SOURCE, with no holder in it, which is what
 * makes two Paladins give one Boon (`strongestPerGroup`).
 *
 * @param {Actor} actor
 * @returns {Array<{key: string, group: string, name: string, origin: string,
 *   img: string, text: string, aura: object}>}
 */
export function auraSourcesOf(actor) {
  if (!actor) return [];
  const out = [];
  for (const row of actor.system?.signatureEffects?.auras ?? []) {
    if (row.targets === "party" && actor.isParty !== true) continue;
    const item = actor.items?.get?.(row.key) ?? null;
    const key = `${actor.uuid}:${row.key}`;
    const text = plain(item?.system?.signature);
    out.push({
      key, group: key, name: row.name, origin: actor.uuid,
      img: item?.img || AURA_FALLBACK_ICON, text,
      // *Every OTHER member of your party* (08 §20's Bulwark of Tyr's Hand):
      // the one aura the book writes that leaves its bearer out, read off the
      // Signature's own words (the lead, 2026-09-26).
      aura: { feet: row.feet, targets: row.targets, centre: "self", damageReduction: row.damageReduction, excludeOwner: excludesHolder(text) }
    });
  }
  for (const item of actor.items ?? []) {
    if (item.type !== "feature" || !item.system?.aura?.feet) continue;
    const id = item.system.identifier || item.name;
    out.push({
      key: `${actor.uuid}:feature:${id}`, group: `feature:${id}`, name: item.name, origin: actor.uuid,
      img: AURA_ICONS[id] ?? (item.img || AURA_FALLBACK_ICON), text: plain(item.system.description),
      aura: item.system.aura
    });
  }
  for (const { talent, identifier, name, aura } of talentAurasFor(actor.takenTalents?.() ?? [])) {
    const item = actor.items?.get?.(talent.id) ?? null;
    out.push({
      key: `${actor.uuid}:talent:${identifier}`, group: `talent:${identifier}`, name, origin: actor.uuid,
      img: item?.img || AURA_FALLBACK_ICON, text: plain(talent.effect), aura
    });
  }
  return out;
}

/** Whether this creature holds an aura at all, before any gate is judged. */
function holdsAura(actor) {
  if (!actor) return false;
  if ((actor.system?.signatureEffects?.auras ?? []).length) return true;
  for (const item of actor.items ?? []) {
    if (item.type === "feature" && item.system?.aura?.feet) return true;
    if (item.type === "talent" && (item.system?.taken ?? 0) > 0 && talentAuraOf(item.system)) return true;
  }
  return false;
}

/** The identifier of the spell a laid effect is, or null (D-657, D-724). */
function spellOf(effect) {
  const flags = effect?.flags?.["azeroth-rpg"] ?? {};
  if (!flags.spell) return null;
  return flags.identifier || (flags.spellName ? String(flags.spellName).slugify() : null);
}

/**
 * What a holder's gates and numbers read, as plain facts for `ownerAuras`:
 *
 * - `shield`, an equipped shield (Avenging Bulwark's *while you carry a
 *   shield*), read exactly as `syncTalentEffects` reads Shield of Faith's;
 * - `spells`, the identifiers of the spells whose laid effect the holder is
 *   carrying and has not switched off (Tree of Life's *while the druid is a
 *   tree*);
 * - `bodyAP`, the holder's CURRENT Body Armor Points, prepared and after every
 *   effect, because the Bulwark gives *your Armor Points*.
 */
function holderFacts(actor) {
  const spells = new Set();
  for (const effect of actor?.effects ?? []) {
    if (effect.active === false) continue;
    const id = spellOf(effect);
    if (id) spells.add(id);
  }
  // A shield melded into a shape is in nobody's hand (D-769, the review): the
  // same rule Shield of Faith's gate and the Block keep.
  const shape = actor?.type === "character" ? (actor.shape ?? null) : null;
  return {
    shield: !(shape && meldsGear(shape.kind))
      && (actor?.items ?? []).some(i => i.type === "armor" && i.system?.shield === true && i.system?.equipped === true),
    spells: [...spells].sort(),
    bodyAP: Math.max(0, Math.trunc(Number(actor?.system?.ap?.body ?? 0)) || 0)
  };
}

/**
 * The aura effects standing on one actor, as `diffAuras` reads them: what each
 * gives, and the words `auraSignature` compares beside it - whose it says it
 * is, how far it says it reaches, and which scene laid it (D-755's review).
 */
function heldAuras(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    const raw = effect.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null;
    if (!raw) continue;
    out.push({
      id: effect.id,
      key: String(raw.key ?? ""),
      group: raw.group ?? null,
      v: raw.v ?? null,
      owner: String(raw.owner ?? ""),
      feet: raw.feet ?? null,
      scene: raw.scene ?? null,
      disabled: effect.disabled === true,
      ...payloadFromFlag(raw),
      changes: (effect.system?.changes ?? []).map(c => ({ key: c.key, type: c.type, value: c.value, phase: c.phase }))
    });
  }
  return out;
}

/**
 * Whether a pass over this scene may lift a laid aura from a creature with NO
 * token on it: only what this scene laid, or what names no scene or a scene
 * the world no longer has (`rules/auras.mjs#auraLaidHere`, O-142).
 */
function laidHere(stamp, scene) {
  return auraLaidHere(stamp, scene?.id ?? null, id => Boolean(game.scenes?.has?.(id)));
}

/** A Boon's Test, in words: *Spirit Resilience Tests*, *Attack Tests*. */
function boonTest(boon) {
  if (boon.kind === "resilience") {
    return game.i18n.format("AZEROTH.Aura.BoonResilience", { resilience: game.i18n.localize(AZEROTH.resiliences[boon.resilience] ?? boon.resilience) });
  }
  return game.i18n.format("AZEROTH.Aura.BoonKind", { kind: game.i18n.localize(AZEROTH.testKinds[boon.kind] ?? boon.kind) });
}

/**
 * The effect's own words: the book's sentence, then what it comes to here -
 * the reach Wide Aura set, the Armor Points the Paladin has now.
 */
function auraDescription(row, shown = {}) {
  const lines = [];
  if (shown.text) lines.push(foundry.utils.escapeHTML(shown.text));
  const owner = shown.ownerName ?? "";
  // An aura on its holder alone says its own condition instead (D-772).
  if (shown.feet && !shown.holderOnly) {
    lines.push(game.i18n.format(shown.centre === "boundDemon" ? "AZEROTH.Aura.ReachDemon" : "AZEROTH.Aura.Reach", { feet: shown.feet, owner }));
  }
  // An area's rider (D-757): it stands while the creature is inside.
  if (shown.centre === "region") lines.push(game.i18n.format("AZEROTH.Aura.Inside", { area: shown.area ?? "" }));
  const p = auraPayloadOf(row);
  if (p.boon?.against?.length) {
    const conditions = game.i18n.getListFormatter().format(p.boon.against.map(c => game.i18n.localize(AZEROTH.conditions[c] ?? c)));
    lines.push(game.i18n.format("AZEROTH.Aura.BoonAgainst", { n: p.boon.boons, conditions }));
  } else if (p.boon) lines.push(game.i18n.format("AZEROTH.Aura.Boon", { n: p.boon.boons, test: boonTest(p.boon) }));
  if (p.bane) {
    const test = p.bane.kind === "all" ? game.i18n.localize("AZEROTH.Aura.BaneAll") : boonTest(p.bane);
    lines.push(game.i18n.format(p.bane.judged ? "AZEROTH.Aura.BaneJudged" : "AZEROTH.Aura.Bane", { n: p.bane.banes, test }));
  }
  if (p.ward) {
    const schools = game.i18n.getListFormatter().format(p.ward.schools.map(s => game.i18n.localize(AZEROTH.schools[s] ?? s)));
    lines.push(game.i18n.format("AZEROTH.Aura.WardAdd", { ward: p.ward.amount, schools }));
  }
  if (p.speed) lines.push(game.i18n.format("AZEROTH.Aura.Speed", { feet: p.speed }));
  if (p.healing === "half") lines.push(game.i18n.localize("AZEROTH.Aura.HealingHalved"));
  if (p.standFree) lines.push(game.i18n.localize("AZEROTH.Aura.StandFree"));
  if (p.schoolArmor) {
    const schools = game.i18n.getListFormatter().format(p.schoolArmor.schools.map(s => game.i18n.localize(AZEROTH.schools[s] ?? s)));
    lines.push(game.i18n.format("AZEROTH.Aura.SchoolArmor", { ap: p.schoolArmor.amount, schools, owner }));
  }
  if (p.floor?.ap) lines.push(game.i18n.format("AZEROTH.Aura.FloorAP", { ap: p.floor.ap }));
  if (p.floor?.ward) lines.push(game.i18n.format("AZEROTH.Aura.FloorWard", { ward: p.floor.ward }));
  if (p.spellDamage) lines.push(game.i18n.format("AZEROTH.Aura.SpellDamage", { n: p.spellDamage }));
  if (p.armor) lines.push(game.i18n.format("AZEROTH.Aura.Armor", { ap: p.armor, feet: shown.feet ?? 0 }));
  if (p.damageReduction) lines.push(game.i18n.format("AZEROTH.Signature.Aura.Text", { n: p.damageReduction }));
  return lines.map(line => `<p>${line}</p>`).join("");
}

/**
 * The create data for one laid aura: named for the source and its holder -
 * *Aura of Resolve (Uther)* - wearing the source's own picture, and carrying
 * the changes THIS candidate takes and the flag every reader and the diff read.
 */
function auraData(row, shown = {}) {
  const owner = row.owner ?? shown.ownerName ?? "";
  return {
    name: game.i18n.format("AZEROTH.Aura.EffectName", { source: row.name, owner }),
    img: shown.img || AURA_FALLBACK_ICON,
    origin: row.origin ?? null,
    description: auraDescription(row, shown),
    // **WITHOUT THIS CORE NEVER DRAWS IT.** `Token#_drawEffects` (14.367) draws
    // an effect at ALWAYS, or at CONDITIONAL only while it is temporary, and an
    // aura has no duration - it lasts while the ally stands in it.
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    // Real changes where the payload is a NUMBER (CLAUDE.md §6), every one
    // `final`; a Boon is dice and rides on the flag alone.
    system: { changes: row.changes ?? [] },
    flags: { "azeroth-rpg": { [AURA_FLAG]: {
      key: row.key, group: row.group ?? row.key, source: row.name, owner,
      payload: auraPayloadOf(row), v: row.v ?? null,
      // What `auraSignature` compares beside the payload (D-755's review): the
      // reach the text states, and the scene whose pass laid it, which is the
      // one pass that may lift it from a creature that has since left.
      feet: row.feet ?? null, scene: row.scene ?? null
    } } }
  };
}

/**
 * Every actor an aura on this scene could reach or is already standing on, and
 * which of them have a token here.
 *
 * The scene's tokens are the candidates. **An actor who has left still has to
 * be visited**, or the effect it is carrying would sit on it forever - so the
 * world's own actors are swept for one, which is a handful at most.
 *
 * **BUT ONLY FOR WHAT THIS SCENE LAID ON IT** (D-755's review, O-142). The
 * sweep used to take every world actor wearing an aura, and a creature with no
 * token here is reached by nothing here, so the GM viewing a prep map lifted
 * every aura off a party standing on another scene - and laid them all again
 * on the way back. A creature with no token here is visited only for an effect
 * `laidHere` says this pass owns.
 *
 * @returns {{candidates: Actor[], placed: Set<string>}}  `placed` holds the
 *   uuid of every candidate with a token on the scene
 */
function candidateActors(scene) {
  const byUuid = new Map();
  const placed = new Set();
  for (const token of scene?.tokens ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    placed.add(actor.uuid);
    if (!byUuid.has(actor.uuid)) byUuid.set(actor.uuid, actor);
  }
  for (const actor of game.actors ?? []) {
    if (byUuid.has(actor.uuid)) continue;
    if (heldAuras(actor).some(row => laidHere(row.scene, scene))) byUuid.set(actor.uuid, actor);
  }
  return { candidates: [...byUuid.values()], placed };
}

/**
 * Everybody whose auras this pass reads: every candidate, and the OWNER of
 * anything bound on the scene - Demonic Pact is measured from the demon, and
 * the warlock who holds it need not be standing here at all.
 */
function holdersOn(scene, candidates) {
  const byUuid = new Map(candidates.map(actor => [actor.uuid, actor]));
  for (const token of scene?.tokens ?? []) {
    const ownerUuid = token.actor ? (bondOf(token.actor)?.ownerUuid ?? null) : null;
    if (!ownerUuid || byUuid.has(ownerUuid)) continue;
    const owner = fromUuidSync(ownerUuid);
    if (owner?.documentName === "Actor") byUuid.set(ownerUuid, owner);
  }
  return [...byUuid.values()];
}

/** The first token this actor has on the scene, or null. */
function tokenOn(scene, actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token?.parent?.id === scene?.id ? actor.token?.object ?? null : null;
  return (actor.getActiveTokens?.() ?? []).find(t => t.document?.parent?.id === scene?.id) ?? null;
}

/**
 * Where one aura is measured FROM: the holder's own token, or every token of
 * every demon bound to them on this scene. None is an aura that reaches nobody.
 */
function centresOf(scene, holder, centre) {
  if (centre === "boundDemon") {
    const demons = new Set(boundOf(worldActorOf(holder), "demon").map(actor => actor.id));
    if (!demons.size) return [];
    return (scene?.tokens ?? []).filter(t => demons.has(t.actorId)).map(t => t.object).filter(Boolean);
  }
  const own = tokenOn(scene, holder);
  return own ? [own] : [];
}

/** The locations a creature HAS: a null is no such location (06 §2), and a floor never makes one. */
function apLocationsOf(actor) {
  const ap = actor?.system?.ap ?? {};
  return Object.keys(AZEROTH.locations).filter(k => ap[k] !== null && ap[k] !== undefined);
}

/**
 * Feet between two placed tokens, or null where either is not placed: between
 * the nearest spaces they occupy and in three dimensions, as every distance is
 * (D-732). A token off the grid measures nothing, exactly as `enemyDistances`
 * has it. **Each token's footprint is laid out once a pass**: `footprints` is
 * the pass's own map, and a room of bearers and allies measures pairs, never
 * layouts.
 */
function feetBetween(from, to, footprints) {
  if (!from || !to || !canvas?.grid) return null;
  const scene = from.document?.parent ?? null;
  if (!scene || to.document?.parent?.id !== scene.id) return null;
  const layout = token => {
    if (!footprints.has(token.id)) footprints.set(token.id, footprintOf(token));
    return footprints.get(token.id);
  };
  return feetBetweenFootprints(layout(from), layout(to), scene.grid);
}

/** The nearest of an aura's centres to one token, or null where none measured. */
function nearestFeet(centres, to, footprints) {
  let best = null;
  for (const from of centres) {
    const feet = feetBetween(from, to, footprints);
    if (feet !== null && (best === null || feet < best)) best = feet;
  }
  return best;
}

/**
 * The placed areas on this scene that lay something on a creature WHILE it
 * remains (D-757), and that still stand - the sweep's own judgement
 * (`staleIn`), so a Region a moment from deletion lays nothing.
 */
function standingAreas(scene) {
  const out = [];
  const now = worldClock();
  for (const region of scene?.regions ?? []) {
    const f = region.flags?.["azeroth-rpg"] ?? {};
    if (!f.cast || !hasAreaTick(f.areaTick) || !(f.areaTick.remains ?? []).length) continue;
    const row = areaRecord(region);
    if (row && staleIn(scene, [row], now).length) continue;
    out.push(region);
  }
  return out;
}

/** Whether a creature wears metal armor (07's Crucible), off what it has equipped. */
function metalOf(actor) {
  return wearsMetal((actor?.items ?? []).map(i => ({
    type: i.type, equipped: i.system?.equipped === true, shield: i.system?.shield === true, category: i.system?.category ?? null
  })));
}

/**
 * **WHAT THE AREAS ON THIS SCENE LAY ON WHO STANDS IN THEM** (D-757): the aura
 * door's third centre, the placed area itself. Insect Swarm's Bane, Hallowed
 * Ground's Ward and Boon, Hoarfrost's and Slagfall's Speed, Graveblight's halved
 * healing, Tidecall's free stand, Crucible's metal and Rimebind's every-Test
 * Bane. `rules/area-ticks.mjs#ridersFor` and `riderPayload` are the law; this
 * reads who is inside - the token's DOCUMENT through `testInsideRegion`
 * (14.367), never the interpolated position - who they are to the caster
 * (`relationTo`, the caster an ally in their own area), what they are, and
 * which riders their turns there have armed (`sustained-areas.mjs#armAreas`).
 *
 * **One row per spell and rider on a creature, whoever cast it** (`group`), as
 * two Paladins give one Boon (D-755): two Insect Swarms overlapping lay one
 * Bane. Keyed by the cast, so a recast replaces its own rows.
 *
 * @param {Scene} scene
 * @param {Array<{actor: Actor, token: Token|null}>} people  every creature with a token here
 * @returns {{wanted: Map<string, object[]>, shown: Map<string, object>}}
 */
function areaRows(scene, people) {
  const wanted = new Map();
  const shown = new Map();
  for (const region of standingAreas(scene)) {
    const f = region.flags["azeroth-rpg"];
    const caster = actorOf(f.caster);
    const casterToken = casterTokenOn(scene, f.source ?? null, caster);
    const spellName = f.spell?.name ?? region.name;
    const owner = caster?.name ?? "";
    const identifier = f.identifier || String(spellName ?? "").slugify();
    const armedAll = f[ARMED_FLAG] ?? {};
    for (const { actor, token } of people) {
      const doc = token?.document ?? null;
      if (!doc) continue;
      let inside = false;
      try {
        inside = doc.testInsideRegion(region);
      } catch {
        inside = false;
      }
      if (!inside) continue;
      const relation = caster ? relationTo({ caster, casterToken, actor, token: doc }) : "other";
      const candidate = { type: actor.type, apLocations: apLocationsOf(actor) };
      // The creature's own uuid, for a rider on the creatures the caster chose (07's Barrier, D-779).
      const riders = ridersFor(f.areaTick, { relation, kinds: kindsOfActor(actor), armed: armedAll[doc.id] ?? [], metal: metalOf(actor), uuid: actor.uuid });
      for (const { index, row, judged } of riders) {
        const base = riderPayload(row, { judged });
        // **04's PERMAFROST ON THE AREA'S OWN DROP** (*Your effects that reduce Speed
        // reduce it 5 feet further per rank*; D-778, O-165): Hoarfrost's *its Speed
        // drops by 10 feet until it leaves* drops the caster's feet further, off the
        // record the cast wrote on the area (`dice/chat.mjs#regionFlagsFromCard`).
        const further = Number(base?.speed) < 0 ? Math.max(0, Math.trunc(Number(f.slowing?.feet)) || 0) : 0;
        const payload = further > 0 ? { ...base, speed: base.speed - further } : base;
        if (!auraGives(payload, candidate)) continue;
        const key = `area:${f.cast}:${index}`;
        wanted.set(actor.uuid, [...(wanted.get(actor.uuid) ?? []), {
          key, group: `area:${identifier}:${index}`, name: spellName, origin: f.caster ?? null,
          ...auraPayloadOf(payload), changes: auraChanges(payload, candidate), v: AURA_VERSION,
          owner, feet: null, scene: scene.id
        }]);
        shown.set(key, { img: f.spell?.img || AURA_FALLBACK_ICON, text: "", ownerName: owner, centre: "region", area: spellName });
      }
    }
  }
  return { wanted, shown };
}

/**
 * Bring every aura on this scene into line with where the tokens are.
 *
 * Runs on the **active GM's client only**: it writes on other people's actors,
 * and two clients doing that at once would lay the effect twice.
 *
 * **ONE PASS AT A TIME, AND ONE MORE AFTERWARDS IF ANYTHING ASKED.** A dozen
 * hooks feed this and a single drop of an item raises three of them, so two
 * passes overlapped, each read the same effect as stale and each deleted it -
 * which Foundry answers with *ActiveEffect "..." does not exist!* on the
 * second. The latch below is what the live run found; a Vitest could not have,
 * because the law it wraps is perfectly correct in isolation.
 *
 * @param {Scene|null} scene
 * @returns {Promise<number>} how many actors were written to
 */
export function syncAuras(scene) {
  if (RUNNING) {
    PENDING = true;
    return RUNNING;
  }
  RUNNING = syncAurasNow(scene)
    // A hook handler's rejection is an UNHANDLED one, and the e2e smoke test
    // fails on any page error - so a pass that throws says so and gives back a
    // count rather than taking the run down with it.
    .catch(err => {
      console.warn("azeroth-rpg | the aura pass did not finish", err);
      return { touched: 0, again: false };
    })
    .then(({ touched, again }) => {
      // A holder whose aura reads its own Armor Points had them moved by this
      // pass's own writes: one more, and never more than two in a row - and a
      // pass that asks AT the ceiling starts the count again, or every later
      // convergence in the session would be refused (D-755's review).
      const next = followUp(FOLLOWING, again);
      FOLLOWING = next.count;
      if (next.again) PENDING = true;
      return touched;
    })
    .finally(() => {
      RUNNING = null;
      if (PENDING) {
        PENDING = false;
        syncAuras(canvas?.scene ?? null);
      }
    });
  return RUNNING;
}

/** Whether a pass is running, or one has been asked for behind it. */
export function aurasBusy() {
  return RUNNING !== null || PENDING;
}

/**
 * **UNTIL NO PASS IS RUNNING OR OWED** (the full-suite fix of D-757): a pass
 * that finishes with another asked for starts it before it resolves, so this
 * waits until the latch is empty. A batch deleting its scene waits here first
 * (`testing/fixtures.mjs#drainAreaWork`).
 */
export async function aurasIdle() {
  while (RUNNING) await Promise.resolve(RUNNING).catch(() => 0);
}

/** One pass. `syncAuras` above is the latch; this is the work. */
async function syncAurasNow(scene) {
  const nothing = { touched: 0, again: false };
  if (!scene || !canvas?.ready || canvas.scene?.id !== scene.id || !sceneInWorld(scene)) return nothing;
  if (!game.users?.activeGM?.isSelf) return nothing;

  const { candidates, placed } = candidateActors(scene);
  if (!candidates.length) return nothing;
  const holders = holdersOn(scene, candidates);

  // What each candidate should be carrying, from every holder at once. Every
  // token's footprint is laid out once for the whole pass (D-732's review).
  const wanted = new Map();
  const shown = new Map();
  const armourRead = new Map();
  const footprints = new Map();
  for (const holder of holders) {
    const offered = auraSourcesOf(holder);
    if (!offered.length) continue;
    const facts = holderFacts(holder);
    const standing = ownerAuras(offered, facts);
    if (!standing.length) continue;
    if (standing.some(source => source.readsOwnArmor)) armourRead.set(holder.uuid, facts.bodyAP);
    const byKey = new Map(offered.map(source => [source.key, source]));
    // WHO IS AN ALLY is the holder's question, in the holder's own fight.
    const fight = holder.activeFight?.() ?? null;
    const own = tokenOn(scene, holder);
    const holderStanding = allyStandingOf({ token: own, actor: holder, combatant: combatantIn(fight, holder, own), fight });
    const people = candidates.map(actor => {
      const token = tokenOn(scene, actor);
      return { actor, token, standing: allyStandingOf({ token, actor, combatant: combatantIn(fight, actor, token), fight }) };
    });
    for (const source of standing) {
      const centres = centresOf(scene, holder, source.centre);
      if (!centres.length) continue;
      const measured = people.map(({ actor, token, standing: theirs }) => ({
        uuid: actor.uuid,
        self: actor.uuid === holder.uuid,
        party: actor.isParty === true,
        ally: countsAsAlly(holderStanding, theirs),
        feet: nearestFeet(centres, token, footprints),
        type: actor.type,
        apLocations: apLocationsOf(actor)
      }));
      // **AN AURA ON ITS HOLDER ALONE** (04's Sacred Duty, D-772): it stands on
      // the holder while ANOTHER ally is within its feet - measured off the same
      // candidates and the same footprints as every other aura.
      if (source.holderOnly) {
        const near = measured.some(c => !c.self && c.ally === true && typeof c.feet === "number" && c.feet <= source.feet);
        for (const c of measured) if (c.self) c.allyNear = near;
      }
      const plan = auraPlan([source], measured);
      const offer = byKey.get(source.key) ?? {};
      shown.set(source.key, { img: offer.img, text: offer.text, ownerName: holder.name, feet: source.feet, centre: source.centre, holderOnly: source.holderOnly === true });
      // WHAT THE EFFECT WILL SAY beside what it gives, for the diff to compare
      // (D-755's review): the holder's name as it is NOW, so a rename re-lays
      // it; the reach its text states, so Wide Aura does; and this scene,
      // which is the one pass that may lift it once its bearer has left.
      for (const [uuid, laid] of plan) {
        const said = laid.map(row => ({ ...row, owner: holder.name, feet: source.feet, scene: scene.id }));
        wanted.set(uuid, [...(wanted.get(uuid) ?? []), ...said]);
      }
    }
  }

  // **AND WHAT THE PLACED AREAS LAY ON WHO STANDS IN THEM** (D-757): the same
  // effect, the same diff, the same one writer.
  const inArea = areaRows(scene, candidates.filter(actor => placed.has(actor.uuid)).map(actor => ({ actor, token: tokenOn(scene, actor) })));
  for (const [uuid, rows] of inArea.wanted) wanted.set(uuid, [...(wanted.get(uuid) ?? []), ...rows]);
  for (const [key, said] of inArea.shown) shown.set(key, said);

  let touched = 0;
  for (const actor of candidates) {
    // THE PASS READ THE WORLD ONCE AND WRITES IT ONE CREATURE AT A TIME (the
    // full-suite fix of D-757, `canvas/in-world.mjs`): a scene deleted under
    // it ends the pass, and a creature whose token or scene has gone is written
    // to by nobody - the server refuses a write into a deleted scene however
    // the promise is caught. What this scene laid on a world actor is lifted
    // by a later pass (`laidHere` reads a scene the world no longer has).
    if (!sceneInWorld(scene)) break;
    // A creature with a token here is this pass's whole; one without is here
    // only for what THIS scene laid on it, and what another scene laid stays
    // exactly as it was laid (O-142).
    const held = placed.has(actor.uuid) ? heldAuras(actor) : heldAuras(actor).filter(row => laidHere(row.scene, scene));
    const { create, remove } = diffAuras(strongestPerGroup(wanted.get(actor.uuid) ?? []), held);
    if (!create.length && !remove.length) continue;
    try {
      // The world moves while this awaits: an actor deleted, a token removed,
      // an effect already gone. None of that is a fault, and the next pass
      // reads whatever is there then.
      //
      // **NO FLOATING TEXT** (`animate: false`, read by 14.367's
      // `ActiveEffect#_onCreate`/`_onDelete`). Core floats *+(name)* off the
      // token for every effect with a change, and an aura comes and goes with
      // every step across its edge: text on each one is noise over a board in
      // motion, and one still animating when the scene is torn down throws in
      // PIXI. The icon on the token (`showIcon`) is the standing sign.
      const lift = remove.filter(id => actor.effects?.has?.(id));
      if (lift.length && actorInWorld(actor)) await actor.deleteEmbeddedDocuments("ActiveEffect", lift, { animate: false });
      if (create.length && actorInWorld(actor)) await actor.createEmbeddedDocuments("ActiveEffect", create.map(row => auraData(row, shown.get(row.key))), { animate: false });
      touched++;
    } catch (err) {
      console.debug(`azeroth-rpg | the aura on ${actor.name} moved while it was being written`, err);
    }
  }

  // **CONVERGENCE** (D-755): a holder whose aura read its own Armor Points,
  // and whose Armor Points this pass's own writes have just moved - a Tree of
  // Life's floor landing on a Paladin carrying Avenging Bulwark.
  const again = [...armourRead].some(([uuid, read]) => {
    const holder = holders.find(h => h.uuid === uuid);
    return Boolean(holder) && holderFacts(holder).bodyAP !== read;
  });
  return { touched, again };
}

/** Whether a flag was written or cleared in an update's changes, either way core spells a clear. */
function flagMoved(changes, key) {
  const flags = changes?.flags?.["azeroth-rpg"] ?? {};
  return key in flags || `-=${key}` in flags;
}

/**
 * Register at init. Every hook here is a change to who is standing where, to
 * who is whose ally, or to whether a gate still holds.
 *
 * `belowHalfHealth` is the gate 08 §20 writes, so a bearer taking a blow turns
 * the aura ON for everybody around them and nothing else would have re-derived
 * it - which is D-691's `refreshNearby` lesson in a second place. An item
 * equipped, taken off or dropped moves it the same way.
 */
export function registerAuraHooks() {
  const nudge = () => syncAuras(canvas?.scene ?? null);
  // **A WORLD THAT HAS JUST LOADED HAS NEVER BEEN SYNCED.** Every other hook
  // here is a CHANGE, and a change is not what a fresh canvas is: without this
  // an aura laid before the last reload would sit stale, and one that should be
  // standing would not appear until somebody moved. It is the same repair pass
  // a rule enforced only on create always needs (CLAUDE.md §15).
  Hooks.on("canvasReady", () => syncAuras(canvas?.scene ?? null));
  Hooks.on("createToken", nudge);
  Hooks.on("deleteToken", nudge);
  // **`moveToken` FIRES AS THE MOVE STARTS**, and a token's document position
  // is interpolated while it travels (v14, D-669) - so measuring here reads
  // where the token was a moment ago, and nothing would ever read it again once
  // it arrived. The aura then stayed on an ally who had walked forty-five feet
  // away, which is the fault the live test found and no unit test could.
  //
  // Both passes run: the first is what makes a step INTO the aura feel
  // immediate, and `arrived` (`canvas/arrival.mjs`, the one wait, polled on the
  // active GM's client alone) is what makes a step OUT of it true.
  Hooks.on("moveToken", (document, movement) => {
    nudge();
    arrived(document, movement).then(nudge, () => {});
  });
  Hooks.on("stopToken", nudge);
  // The same wait off the plain document write, because a scripted
  // `update({x})` is a move too and this is the belt to that brace. A token
  // that changes sides - its disposition - changes who is whose ally out of a
  // fight (D-755), and a height changes a three-dimensional distance (D-732).
  Hooks.on("updateToken", (document, changes) => {
    if ("disposition" in changes) nudge();
    if (!("x" in changes) && !("y" in changes) && !("elevation" in changes)) return;
    arrived(document).then(nudge, () => {});
  });
  Hooks.on("updateActor", (actor, changes) => {
    const moved = foundry.utils.hasProperty(changes, "system.health.value")
      || flagMoved(changes, "party")
      // A bond made or released moves Demonic Pact's centre and who is bound to
      // the Party (D-643, D-755).
      || flagMoved(changes, "bond")
      // A HOLDER RENAMED (D-755's review): every ally in reach carries
      // *Aura of Resolve (Uther)*, and `auraSignature` compares the name, so
      // the pass re-lays each under the new one. The pass renames nothing, so
      // this cannot answer itself.
      || ("name" in (changes ?? {}) && holdsAura(actor));
    if (moved) nudge();
  });

  // **WHO IS AN ALLY IN A FIGHT IS THE TRACKER'S** (D-755): a combatant in or
  // out, a side moved, one defeated, the fight started or ended. `combatStart`
  // fires on the starting client alone, so the start is read off the round.
  Hooks.on("createCombatant", nudge);
  Hooks.on("deleteCombatant", nudge);
  Hooks.on("updateCombatant", (combatant, changes) => {
    if ("defeated" in (changes ?? {}) || flagMoved(changes, "side")) nudge();
  });
  Hooks.on("updateCombat", (combat, changes) => {
    if ("round" in (changes ?? {}) && (combat?.round ?? 0) <= 1) nudge();
  });
  Hooks.on("deleteCombat", nudge);

  // **A PLACED AREA THAT LAYS SOMETHING WHILE A CREATURE REMAINS** (D-757): one
  // placed, taken away, grown or moved, and a rider armed at a turn in it.
  const laysRiders = region => (region?.flags?.["azeroth-rpg"]?.areaTick?.remains ?? []).length > 0;
  Hooks.on("createRegion", region => { if (laysRiders(region)) nudge(); });
  Hooks.on("deleteRegion", region => { if (laysRiders(region)) nudge(); });
  Hooks.on("updateRegion", (region, changes) => {
    if (!laysRiders(region)) return;
    if ("shapes" in (changes ?? {}) || flagMoved(changes, ARMED_FLAG)) nudge();
  });

  // **ONLY AN ITEM THAT MOVES AN AURA.** Every item write on every actor raised
  // this at first, and the creator alone embeds forty in a batch - a full pass
  // each, all of them awaiting document writes. What can move one: a worn thing
  // that lays one (D-696); a class feature's, arriving, leaving or restamped;
  // a talent with one, taken or untaken; and a suit or a shield on somebody who
  // holds one - Avenging Bulwark's gate and its number (D-755).
  const itemMoves = (item, changes = null) => {
    const actor = item?.parent;
    if (actor?.documentName !== "Actor") return false;
    if (item.system?.signatureEffect?.aura?.feet) return true;
    if (item.type === "feature") return Boolean(item.system?.aura?.feet) || foundry.utils.hasProperty(changes ?? {}, "system.aura");
    if (item.type === "talent" && talentAuraOf(item.system)) {
      return changes ? foundry.utils.hasProperty(changes, "system.taken") : (item.system?.taken ?? 0) > 0;
    }
    return item.type === "armor" && holdsAura(actor);
  };
  Hooks.on("createItem", item => { if (itemMoves(item)) nudge(); });
  Hooks.on("updateItem", (item, changes) => { if (itemMoves(item, changes)) nudge(); });
  Hooks.on("deleteItem", item => { if (itemMoves(item)) nudge(); });

  // **AN EFFECT THAT MOVES AN AURA** (D-755): a spell's laid effect a gate
  // waits on (Tree of Life), or anything on a holder - a Stoneskin raising the
  // Paladin's Armor Points raises the Bulwark. NEVER an aura's own effect: this
  // pass writes those, and reading its own writes back would be a loop.
  //
  // **EXCEPT ONE A GM SWITCHES BACK ON** (D-755's review). The diff leaves a
  // switched-off aura exactly as it is while it is wanted, whatever it says, so
  // one switched off while the Paladin's Armor Points moved came back on
  // carrying the old number and stood that way until somebody walked. The pass
  // creates and deletes and never writes `disabled`, so this cannot answer
  // itself; switching one OFF needs nothing, since the diff keeps it anyway.
  const gates = auraSpellGates();
  const effectMoves = (effect, changes = null) => {
    if (effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG]) return changes?.disabled === false;
    let actor = effect?.parent ?? null;
    if (actor?.documentName === "Item") actor = actor.parent ?? null;
    if (actor?.documentName !== "Actor") return false;
    const spell = spellOf(effect);
    return Boolean(spell && gates.has(spell)) || holdsAura(actor);
  };
  Hooks.on("createActiveEffect", effect => { if (effectMoves(effect)) nudge(); });
  Hooks.on("updateActiveEffect", (effect, changes) => { if (effectMoves(effect, changes)) nudge(); });
  Hooks.on("deleteActiveEffect", effect => { if (effectMoves(effect)) nudge(); });
}
